// supabase/functions/stripe-webhook/index.ts
//
// Turns a Stripe payment into a working Footy Team Line-Ups club, hands-free.
//
//   Stripe Payment Link / Checkout  ──▶  checkout.session.completed
//     ▸ finds the lead (client_reference_id = launch_leads.id) or falls back to
//       the customer's email + the "Club name" custom field
//     ▸ creates the club row (or reuses one with the same name)
//     ▸ writes lineup_subscriptions (status active / trialing, plan, team limit)
//     ▸ invites the buyer by email (Supabase Auth) so they can sign in
//   customer.subscription.updated / deleted  ──▶  keeps status + period end in sync
//   invoice.paid                             ──▶  rolls current_period_end forward
//
// Stays inert until STRIPE_WEBHOOK_SECRET is set (returns 503 so Stripe keeps the
// event and retries once it is). Every event id is recorded in stripe_events, so
// Stripe's retries never double-provision.
//
// Deploy:  supabase functions deploy stripe-webhook --no-verify-jwt
// Secrets: STRIPE_WEBHOOK_SECRET (whsec_…, from the endpoint in Stripe)
//          STRIPE_SECRET_KEY     (sk_…, only used to read the subscription's price)
//          LINEUPS_APP_URL       (optional, default https://afl-team-line-ups.vercel.app)
//
// Stripe endpoint URL: https://<project>.supabase.co/functions/v1/stripe-webhook
// Events to send: checkout.session.completed, customer.subscription.updated,
//                 customer.subscription.deleted, invoice.paid

import { createClient } from "npm:@supabase/supabase-js@2";

const TOLERANCE_SECONDS = 300;
// APP_URL on this project is the marketing site (Stripe success page); the sign-in
// invite must land in the editor itself.
const APP_URL = Deno.env.get("LINEUPS_APP_URL") ?? "https://afl-team-line-ups.vercel.app";

type Json = Record<string, unknown>;
const json = (status: number, body: Json) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// --- Stripe signature (Web Crypto; no SDK needed) ---------------------------
async function verifySignature(payload: string, header: string | null, secret: string): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    }),
  ) as Record<string, string>;
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  const expected = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");

  // Stripe may send several v1 signatures during a secret rotation.
  const candidates = header.split(",").filter((kv) => kv.trim().startsWith("v1=")).map((kv) => kv.trim().slice(3));
  return candidates.some((sig) => sig.length === expected.length && timingSafeEqual(sig, expected));
}

function timingSafeEqual(a: string, b: string): boolean {
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// --- Stripe REST helper (read-only) -----------------------------------------
async function stripeGet(path: string): Promise<Json | null> {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return null;
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${key}` } });
  return res.ok ? (await res.json()) as Json : null;
}

// --- Provisioning -----------------------------------------------------------
function slugName(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) return json(503, { configured: false, error: "STRIPE_WEBHOOK_SECRET is not set" });

  const payload = await req.text();
  if (!(await verifySignature(payload, req.headers.get("stripe-signature"), secret))) {
    return json(400, { error: "Bad Stripe signature" });
  }

  const event = JSON.parse(payload) as { id: string; type: string; data: { object: Json } };
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // Idempotency: first writer wins, repeats are acknowledged and ignored.
  const { error: ledgerErr } = await db.from("stripe_events").insert({ id: event.id, type: event.type });
  if (ledgerErr) {
    if (ledgerErr.code === "23505") return json(200, { received: true, duplicate: true });
    return json(500, { error: ledgerErr.message });
  }

  const finish = async (outcome: string, club_id: string | null = null) => {
    await db.from("stripe_events").update({ outcome, club_id }).eq("id", event.id);
    return json(200, { received: true, outcome, club_id });
  };

  try {
    const obj = event.data.object;

    if (event.type === "checkout.session.completed") {
      const customerId = String(obj.customer ?? "");
      const subscriptionId = obj.subscription ? String(obj.subscription) : null;
      const email = String((obj.customer_details as Json | undefined)?.email ?? obj.customer_email ?? "").toLowerCase();
      const leadId = obj.client_reference_id ? String(obj.client_reference_id) : null;
      const metadata = (obj.metadata ?? {}) as Record<string, string>;

      // "Club name" custom field on the Payment Link, if present.
      const customFields = (obj.custom_fields ?? []) as Array<{ key: string; text?: { value?: string } }>;
      const customClub = customFields.find((f) => /club/i.test(f.key))?.text?.value;

      // 1. Who bought? Lead row first, then what Stripe knows.
      let lead: Json | null = null;
      if (leadId) {
        const { data } = await db.from("launch_leads").select("*").eq("id", leadId).maybeSingle();
        lead = data as Json | null;
      }
      const clubName = slugName(String(metadata.club_name ?? customClub ?? lead?.club_name ?? ""));
      const contactEmail = String(lead?.email ?? email).toLowerCase();
      if (!clubName || !contactEmail) return finish("skipped: no club name or email");

      // 2. Which plan? Price id on the subscription → lineup_plans.
      let planKey: string | null = metadata.plan_key ?? null;
      let teamLimit: number | null = null;
      let periodEnd: string | null = null;
      let trialEnd: string | null = null;
      let status = "active";
      if (subscriptionId) {
        const sub = await stripeGet(`subscriptions/${subscriptionId}`);
        if (sub) {
          const priceId = ((sub.items as Json)?.data as Json[] | undefined)?.[0]
            ? String((((sub.items as Json).data as Json[])[0].price as Json).id)
            : null;
          if (priceId && !planKey) {
            const { data: plan } = await db.from("lineup_plans").select("plan_key, team_limit").eq("stripe_price_id", priceId).maybeSingle();
            if (plan) {
              planKey = plan.plan_key;
              teamLimit = plan.team_limit;
            }
          }
          if (sub.current_period_end) periodEnd = new Date(Number(sub.current_period_end) * 1000).toISOString();
          if (sub.trial_end) trialEnd = new Date(Number(sub.trial_end) * 1000).toISOString();
          if (sub.status === "trialing") status = "trialing";
        }
      }
      if (planKey && teamLimit === null) {
        const { data: plan } = await db.from("lineup_plans").select("team_limit").eq("plan_key", planKey).maybeSingle();
        teamLimit = plan?.team_limit ?? null;
      }

      // 3. Club row — reuse an existing one of the same name (the app finds clubs
      //    by name on save), otherwise create it so the first save is entitled.
      let clubId: string | null = lead?.club_id ? String(lead.club_id) : null;
      if (!clubId) {
        const { data: found } = await db.from("clubs").select("id").eq("name", clubName).limit(1);
        clubId = found?.[0]?.id ?? null;
      }
      if (!clubId) {
        const { data: created, error } = await db
          .from("clubs")
          .insert({ name: clubName, contact_email: contactEmail, sport_type: "afl" })
          .select("id")
          .single();
        if (error) throw error;
        clubId = created.id;
      }
      await db.from("clubs").update({
        contact_email: contactEmail,
        subscription_status: status,
        stripe_customer_id: customerId || null,
        stripe_subscription_id: subscriptionId,
        is_trial: status === "trialing",
        trial_ends_at: trialEnd,
      }).eq("id", clubId);

      // 4. Entitlement.
      const { error: subErr } = await db.from("lineup_subscriptions").upsert({
        club_id: clubId,
        plan_key: planKey,
        status,
        team_limit: teamLimit,
        stripe_customer_id: customerId || null,
        stripe_subscription_id: subscriptionId,
        trial_ends_at: trialEnd,
        current_period_end: periodEnd,
        updated_at: new Date().toISOString(),
      }, { onConflict: "club_id" });
      if (subErr) throw subErr;

      // 5. Sign-in invite. An existing user simply gets nothing new.
      const { error: inviteErr } = await db.auth.admin.inviteUserByEmail(contactEmail, {
        redirectTo: `${APP_URL}/?admin=1`,
        data: { club_id: clubId, club_name: clubName },
      });
      const invited = !inviteErr;

      if (leadId) {
        await db.from("launch_leads").update({ status: "onboarded", club_id: clubId, stripe_customer_id: customerId || null }).eq("id", leadId);
      }
      return finish(`provisioned ${status}${planKey ? ` ${planKey}` : ""}${invited ? ", invited" : ", invite skipped"}`, clubId);
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const subscriptionId = String(obj.id);
      const stripeStatus = event.type === "customer.subscription.deleted" ? "canceled" : String(obj.status);
      // Stripe: trialing | active | past_due | canceled | unpaid | incomplete…
      const status = stripeStatus === "trialing" ? "trialing" : stripeStatus === "active" ? "active" : stripeStatus === "past_due" ? "past_due" : "canceled";
      const periodEnd = obj.current_period_end ? new Date(Number(obj.current_period_end) * 1000).toISOString() : null;
      const trialEnd = obj.trial_end ? new Date(Number(obj.trial_end) * 1000).toISOString() : null;

      const { data: rows } = await db.from("lineup_subscriptions").select("club_id").eq("stripe_subscription_id", subscriptionId);
      if (!rows?.length) return finish("skipped: unknown subscription");
      for (const r of rows) {
        await db.from("lineup_subscriptions").update({ status, current_period_end: periodEnd, trial_ends_at: trialEnd, updated_at: new Date().toISOString() }).eq("club_id", r.club_id);
        await db.from("clubs").update({ subscription_status: status, is_trial: status === "trialing", trial_ends_at: trialEnd }).eq("id", r.club_id);
      }
      return finish(`subscription ${status}`, rows[0].club_id);
    }

    if (event.type === "invoice.paid") {
      const subscriptionId = obj.subscription ? String(obj.subscription) : null;
      if (!subscriptionId) return finish("skipped: invoice without subscription");
      const line = (((obj.lines as Json)?.data as Json[]) ?? [])[0];
      const end = (line?.period as Json | undefined)?.end;
      const periodEnd = end ? new Date(Number(end) * 1000).toISOString() : null;
      const { data: rows } = await db.from("lineup_subscriptions").update({ status: "active", current_period_end: periodEnd, updated_at: new Date().toISOString() }).eq("stripe_subscription_id", subscriptionId).select("club_id");
      if (rows?.length) await db.from("clubs").update({ subscription_status: "active", is_trial: false }).in("id", rows.map((r) => r.club_id));
      return finish(rows?.length ? "renewed" : "skipped: unknown subscription", rows?.[0]?.club_id ?? null);
    }

    return finish(`ignored ${event.type}`);
  } catch (e) {
    await db.from("stripe_events").update({ outcome: `error: ${(e as Error).message}` }).eq("id", event.id);
    return json(500, { error: (e as Error).message });
  }
});

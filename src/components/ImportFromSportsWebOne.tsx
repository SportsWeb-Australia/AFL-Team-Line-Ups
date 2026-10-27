import { useEffect, useMemo, useState } from 'react';
import { listSW1Players, type SW1Player } from '../lib/sportsWebOne';
import type { Player } from '../types';

export interface SW1ImportRow {
  number: string;
  name: string;
  headshotUrl?: string;
  externalId: string;
}

const ALL = '__all__';
const key = (name: string, number: string | null | undefined) => `${name.trim().toLowerCase()}#${(number ?? '').trim()}`;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
/** A player's teams - all of them, or just the one older SW1 builds send. */
const teamsOf = (p: SW1Player) => (p.teams?.length ? p.teams : p.team ? [{ team: p.team, number: p.number }] : []);

/**
 * "Bring in players from SportsWeb One" - for a club opened from SW1 (`?sw1club`). The club keeps its players once,
 * in SW1's Website > Players; here they're brought into this team's squad, with their number and headshot.
 * A player can be in several SW1 teams with a number in each: they show under every team they're in, with that
 * team's number. Tick who to bring in. Players already in the squad (same SW1 player, or the same name and number)
 * are shown but can't be ticked, so bringing a team in twice doesn't double it up. Read-only on SW1's side, and only
 * appears when SW1 has players to give.
 */
export function ImportFromSportsWebOne({
  sw1ClubId,
  grade,
  players,
  onImport,
}: {
  sw1ClubId: string;
  grade: string;
  players: Player[];
  onImport: (rows: SW1ImportRow[]) => void;
}) {
  const [all, setAll] = useState<SW1Player[]>([]);
  const [team, setTeam] = useState<string | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    listSW1Players(sw1ClubId).then((p) => {
      if (!cancelled) setAll(p);
    });
    return () => {
      cancelled = true;
    };
  }, [sw1ClubId]);

  const teams = useMemo(() => {
    const names: string[] = [];
    for (const p of all) for (const t of teamsOf(p)) if (t.team.trim() && !names.some((n) => same(n, t.team))) names.push(t.team.trim());
    return names;
  }, [all]);
  // Start on the SW1 team with this sheet's grade name, if there is one.
  const chosen = team ?? teams.find((t) => same(t, grade)) ?? ALL;
  const rows = all.flatMap((p) => {
    if (chosen === ALL) return [{ p, number: p.number }];
    const t = teamsOf(p).find((x) => same(x.team, chosen));
    return t ? [{ p, number: t.number }] : [];
  });
  const have = new Set(players.flatMap((p) => [p.externalId ? `id#${p.externalId}` : '', key(p.name, p.number)]));
  const inSquad = (r: { p: SW1Player; number: string | null }) => have.has(`id#${r.p.id}`) || have.has(key(r.p.name, r.number));
  const picked = rows.filter((r) => !inSquad(r) && !off.has(r.p.id));

  if (all.length === 0) return null;

  const bringIn = () => {
    onImport(picked.map((r) => ({ number: r.number ?? '', name: r.p.name, headshotUrl: r.p.photo ?? undefined, externalId: r.p.id })));
    setMsg(`Added ${picked.length} player${picked.length === 1 ? '' : 's'} from SportsWeb One.`);
  };
  const toggle = (id: string, on: boolean) =>
    setOff((s) => {
      const n = new Set(s);
      if (on) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="sw1-admin__bulk sw1-fromsw1">
      <p className="sw1-admin__hint">
        <strong>From SportsWeb One</strong> - your club's players from Website &gt; Players, with their numbers and
        headshots. Tick who to bring in. Change a player there and bring them in again.
      </p>
      {teams.length > 0 && (
        <select value={chosen} onChange={(e) => { setTeam(e.target.value); setMsg(''); }} aria-label="Which team">
          <option value={ALL}>All teams ({all.length})</option>
          {teams.map((t) => (
            <option key={t} value={t}>
              {t} ({all.filter((p) => teamsOf(p).some((x) => same(x.team, t))).length})
            </option>
          ))}
        </select>
      )}
      {rows.length > 0 && (
        <ul className="sw1-fromsw1__list">
          {rows.map((r) => {
            const already = inSquad(r);
            return (
              <li key={r.p.id} data-in={already || undefined}>
                <label>
                  <input
                    type="checkbox"
                    checked={!already && !off.has(r.p.id)}
                    disabled={already}
                    onChange={(e) => { toggle(r.p.id, e.target.checked); setMsg(''); }}
                  />
                  <b>{r.number ?? '-'}</b>
                  <span>{r.p.name}</span>
                  {already && <em>in squad</em>}
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > 0 && rows.some((r) => !inSquad(r)) && (
        <p className="sw1-fromsw1__quick">
          <button type="button" className="sw1-linkbtn" onClick={() => setOff(new Set())}>Tick all</button>
          {' · '}
          <button type="button" className="sw1-linkbtn" onClick={() => setOff(new Set(rows.map((r) => r.p.id)))}>Untick all</button>
        </p>
      )}
      <button type="button" className="sw1-btn" onClick={bringIn} disabled={picked.length === 0}>
        {rows.length > 0 && rows.every(inSquad)
          ? 'All already in your squad'
          : picked.length === 0
            ? 'Tick who to bring in'
            : `Bring in ${picked.length} player${picked.length === 1 ? '' : 's'}`}
      </button>
      {msg && <p className="sw1-addmsg is-ok">{msg}</p>}
    </div>
  );
}

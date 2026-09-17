import type { Club, Official, OfficialRole, VisualMode } from '../types';
import PlayerPlate from './PlayerPlate';

/**
 * The coaches' box: a full-width band under the ground for the people who run
 * the game from the sideline.
 *
 * It sits OUTSIDE `.sw1-stage` on purpose. Interchange and Emergencies float
 * into the ground's bottom corners with `position: absolute` against the stage,
 * so anything added inside the stage after them makes the stage taller and drags
 * those corner cards down off the oval. Below the stage the band also reads the
 * way the football does: these people are off the field.
 *
 * Staff are not players — no guernsey number, never selected into a position —
 * but they reuse `PlayerPlate` so the slanted name plate, the one-line name
 * fitting and the plate sizing stay identical to the rest of the sheet. The
 * plate's number tab collapses on its own when the number is empty.
 */

export const OFFICIAL_ROLES: { key: OfficialRole; label: string }[] = [
  { key: 'coach', label: 'Coach' },
  { key: 'assistant-coach', label: 'Assistant Coach' },
  { key: 'team-manager', label: 'Team Manager' },
  { key: 'runner', label: 'Runner' },
];

/** Hi-vis is hi-vis: the runner's top is deliberately NOT club-coloured, because
 *  the whole point of it on a ground is that it reads as "not a player". */
const HIVIS_BODY = '#D8FF3B';
const HIVIS_TRIM = '#16202B';
const REFLECTIVE = '#C9D4DC';

/**
 * A polo drawn from the club's own colours, so the band looks right on day one
 * with nothing uploaded. A real product shot replaces it when the club has one.
 */
function PoloShirt({ body, trim, hiVis = false }: { body: string; trim: string; hiVis?: boolean }) {
  return (
    <svg className="sw1-polo" viewBox="0 0 120 132" role="img" aria-hidden focusable="false">
      {/* body + sleeves, with a neck scoop the collar flaps then sit over */}
      <path
        d="M26 20 L8 48 L22 68 L31 58 L29 122 Q29 127 34 127 L86 127 Q91 127 91 122 L89 58 L98 68 L112 48 L94 20 L74 14 Q60 27 46 14 Z"
        fill={body}
        stroke="rgba(0,0,0,.30)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {/* sleeve cuffs */}
      <path d="M8 48 L22 68 L28 61 L14 41 Z" fill={trim} opacity=".92" />
      <path d="M112 48 L98 68 L92 61 L106 41 Z" fill={trim} opacity=".92" />
      {/* hem band */}
      <path d="M29 115 L91 115 L91 122 Q91 127 86 127 L34 127 Q29 127 29 122 Z" fill={trim} opacity=".92" />

      {hiVis && (
        <>
          {/* reflective bands — what actually makes a runner's top a runner's top */}
          <rect x="29.4" y="62" width="60.2" height="9" fill={REFLECTIVE} opacity=".95" />
          <rect x="29.4" y="64.6" width="60.2" height="3.8" fill="#F2F7FA" opacity=".95" />
          <rect x="29.6" y="84" width="60" height="9" fill={REFLECTIVE} opacity=".95" />
          <rect x="29.6" y="86.6" width="60" height="3.8" fill="#F2F7FA" opacity=".95" />
        </>
      )}

      {/* placket + buttons */}
      <path d="M56 26 L64 26 L64 45 L56 45 Z" fill={trim} opacity=".92" />
      <circle cx="60" cy="31" r="1.7" fill={body} opacity=".85" />
      <circle cx="60" cy="39" r="1.7" fill={body} opacity=".85" />
      {/* collar flaps */}
      <path d="M45 13 L61 27 L53 32 L39 19 Z" fill={trim} stroke="rgba(0,0,0,.22)" strokeWidth="1" strokeLinejoin="round" />
      <path d="M75 13 L59 27 L67 32 L81 19 Z" fill={trim} stroke="rgba(0,0,0,.22)" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}

interface PersonProps {
  role: OfficialRole;
  name: string;
  headshotUrl?: string | null;
  club: Club;
  visualMode: VisualMode;
  poloImageUrl?: string;
  runnerImageUrl?: string;
}

/** One person in the coaches' box. Exported so the editor's position preview
 *  draws exactly the plate the graphic does. */
export function StaffPerson({ role, name, headshotUrl, club, visualMode, poloImageUrl, runnerImageUrl }: PersonProps) {
  const def = OFFICIAL_ROLES.find((r) => r.key === role)!;
  const isRunner = role === 'runner';
  const uploaded = isRunner ? runnerImageUrl : poloImageUrl;
  // A portrait only wins when the whole sheet is in Headshot mode —
  // otherwise the shirt is the point.
  const headshot = visualMode === 'headshot' ? headshotUrl : null;

  let art: React.ReactNode = null;
  if (visualMode !== 'none') {
    if (headshot) art = <img className="sw1-staff__headshot" src={headshot} alt="" draggable={false} />;
    else if (uploaded) art = <img className="sw1-staff__shirt" src={uploaded} alt="" draggable={false} />;
    else if (isRunner) art = <PoloShirt body={HIVIS_BODY} trim={HIVIS_TRIM} hiVis />;
    else art = <PoloShirt body={club.primaryColor} trim={club.secondaryColor} />;
  }

  return (
    <div className={`sw1-staff__person${headshot ? ' is-headshot' : ''}`} data-role={role}>
      <PlayerPlate
        player={{ id: `official-${role}`, number: '', name: name.trim() }}
        visualMode={visualMode}
        artOverride={art}
        compact
      />
      <div className="sw1-staff__role">{def.label}</div>
    </div>
  );
}

interface Props {
  officials?: Official[];
  club: Club;
  visualMode: VisualMode;
  /** Real product shots, when the club has them. */
  poloImageUrl?: string;
  runnerImageUrl?: string;
  /** The ground's background watermark, carried on down into the band so the
   *  sponsor runs the full length of the graphic. Null when the sheet has none. */
  watermark?: { text?: string; logo?: string | null } | null;
}

export default function MatchDayStaff({ officials, club, visualMode, poloImageUrl, runnerImageUrl, watermark }: Props) {
  const named = OFFICIAL_ROLES.map((def) => (officials ?? []).find((o) => o.role === def.key)).filter(
    (o): o is Official => !!o && o.name.trim().length > 0,
  );

  // A club that hasn't named anyone never sees the band at all.
  if (named.length === 0) return null;

  return (
    <section className="sw1-staff" aria-label="Match day staff">
      {watermark && (watermark.logo || watermark.text) && (
        <div className={`sw1-staff__wm${watermark.logo ? ' is-logo' : ''}`} aria-hidden>
          {Array.from({ length: 5 }).map((_, r) => (
            <div key={r} className="sw1-watermark__row">
              {Array.from({ length: 10 }).map((__, c) =>
                watermark.logo ? <img key={c} src={watermark.logo} alt="" /> : <span key={c}>{watermark.text}</span>,
              )}
            </div>
          ))}
        </div>
      )}
      <div className="sw1-grouplabel">Match Day Staff</div>
      <div className="sw1-staff__grid">
        {named.map((o) => (
          <StaffPerson
            key={o.role}
            role={o.role}
            name={o.name}
            headshotUrl={o.headshotUrl}
            club={club}
            visualMode={visualMode}
            poloImageUrl={poloImageUrl}
            runnerImageUrl={runnerImageUrl}
          />
        ))}
      </div>
    </section>
  );
}

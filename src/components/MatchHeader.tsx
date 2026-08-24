import type { Club, MatchInfo, MatchTier } from '../types';

/** Show ISO dates (yyyy-mm-dd, what the date picker stores) as dd/mm/yyyy.
 *  Any other free-typed text is shown exactly as entered. */
function formatDate(d?: string): string {
  if (!d) return '';
  const m = d.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}

function monogram(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function Crest({ name, logoUrl, color }: { name: string; logoUrl?: string | null; color: string }) {
  return (
    <div className="sw1-crest">
      <div className="sw1-crest__badge">
        {/* backgroundColor, not the `background` shorthand: the shorthand resets
            background-clip to border-box inline, which lets the club colour paint
            under the transparent border and show as a band beneath the finals
            metal ring. */}
        {logoUrl ? <img src={logoUrl} alt={name} /> : <span style={{ backgroundColor: color }}>{monogram(name)}</span>}
      </div>
      <div className="sw1-crest__name">{name}</div>
    </div>
  );
}

interface Props {
  club: Club;
  match: MatchInfo;
  vsStyle?: 'chrome' | 'split';
  showcase?: boolean;
  matchTier?: MatchTier;
}

export default function MatchHeader({
  club,
  match,
  vsStyle = 'chrome',
  showcase = false,
  matchTier = 'home',
}: Props) {
  const finals = matchTier === 'finals' || matchTier === 'grand-final';
  // The plate names the occasion, so the round pill below would only repeat it.
  const round = match.round?.trim();
  // Grand final needs no second half: "GRAND FINAL" is the whole story. Finals
  // weeks pair the series word with which final it actually is.
  const plateName = matchTier === 'grand-final' ? null : round;

  return (
    <header className="sw1-header">
      {finals && (
        <div className="sw1-occasion" aria-hidden>
          {/* Outer element is the frame; the inner one is the face it holds, so
              the plate reads as a machined part rather than a coloured bar. */}
          <span className="sw1-occasion__inner">
            {matchTier === 'grand-final' ? (
              /* One week a year: the face is struck entirely from gold, with no
                 dark half to share it with. */
              <span className="sw1-occasion__final">
                <b>Grand Final</b>
              </span>
            ) : (
              <>
                <span className="sw1-occasion__tier">
                  <b>Finals</b>
                </span>
                {plateName && (
                  <span className="sw1-occasion__final">
                    <b>{plateName}</b>
                  </span>
                )}
              </>
            )}
          </span>
        </div>
      )}
      {/* faint crests bleeding off each side */}
      {club.logoUrl && <img className="sw1-header__ghost sw1-header__ghost--l" src={club.logoUrl} alt="" />}
      {!showcase && match.opponentLogoUrl && (
        <img className="sw1-header__ghost sw1-header__ghost--r" src={match.opponentLogoUrl} alt="" />
      )}

      <div className={`sw1-header__crests${showcase ? ' sw1-header__crests--solo' : ''}`}>
        <Crest name={club.name} logoUrl={club.logoUrl} color={club.secondaryColor} />
        {!showcase && (
          <>
            <div className={`sw1-header__v sw1-header__v--${vsStyle}`} aria-hidden>
              <span className="sw1-header__bolt" />
              <span className="sw1-header__vs">VS</span>
            </div>
            <Crest name={match.opponent} logoUrl={match.opponentLogoUrl} color="#64748b" />
          </>
        )}
      </div>

      <div className="sw1-fixture">
        {!showcase && !finals && round && <div className="sw1-fixture__round">{round}</div>}
        <div className="sw1-fixture__grade">{match.grade}</div>
        {!showcase && (
          <div className="sw1-fixture__when">
            {formatDate(match.date)} &nbsp;•&nbsp; {match.time} &nbsp;•&nbsp; {match.venue}
          </div>
        )}
        {match.competition && <div className="sw1-fixture__comp">{match.competition}</div>}
      </div>
    </header>
  );
}

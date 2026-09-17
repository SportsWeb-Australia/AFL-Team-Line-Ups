import type { CentreWord, Club, MatchInfo, MatchTier, TeamScore } from '../types';
import { premiersLabel, resultWord, scoreBreakdown, scoreTotal, winner } from '../lib/score';

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

function Crest({
  name,
  logoUrl,
  color,
  score,
  outcome,
}: {
  name: string;
  logoUrl?: string | null;
  color: string;
  /** Final score, once the game's been played. */
  score?: TeamScore;
  outcome?: 'won' | 'lost' | 'drew';
}) {
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
      {score && (
        <div className={`sw1-crest__score is-${outcome}`}>
          {/* Total first and large: it's what the eye goes to. The goals.behinds
              breakdown underneath is how footy people read and check a score. */}
          <span className="sw1-crest__total">{scoreTotal(score)}</span>
          <span className="sw1-crest__breakdown">{scoreBreakdown(score)}</span>
        </div>
      )}
    </div>
  );
}

interface Props {
  club: Club;
  match: MatchInfo;
  vsStyle?: 'chrome' | 'split';
  showcase?: boolean;
  matchTier?: MatchTier;
  /** Between the crests once the score shows: DEF / DRAW / DEF BY, or VS. */
  centreWord?: CentreWord;
  /** The club's own wording for the finals plate, and an optional second panel. */
  plateTitle?: string;
  plateSubtitle?: string;
}

export default function MatchHeader({
  club,
  match,
  vsStyle = 'chrome',
  showcase = false,
  matchTier = 'home',
  centreWord = 'result',
  plateTitle,
  plateSubtitle,
}: Props) {
  const finals = matchTier === 'finals' || matchTier === 'grand-final';
  // The plate names the occasion, so the round pill below would only repeat it.
  const round = match.round?.trim();
  // Grand final needs no second half: "GRAND FINAL" is the whole story. Finals
  // weeks pair the series word with which final it actually is.
  const plateName = matchTier === 'grand-final' ? null : round;

  // Final score. Only once the club has chosen to show it.
  const result = !showcase && match.result?.show ? match.result : null;
  const w = result ? winner(result) : null;
  const clubOutcome = w === 'draw' ? 'drew' : w === 'club' ? 'won' : 'lost';
  const oppOutcome = w === 'draw' ? 'drew' : w === 'opponent' ? 'won' : 'lost';
  // A Grand Final the club won turns its plate into "2026 Premiers".
  const premiers = premiersLabel(match, matchTier);
  // A club's own plate wording wins over the automatic text; tournaments want
  // "Premiers" plus the event, which the automatic text can't know.
  const title = plateTitle?.trim() || null;
  const subtitle = plateSubtitle?.trim() || null;
  const gfTitle = title ?? premiers ?? 'Grand Final';
  const finalsTitle = title ?? plateName;
  // What sits between the crests. Only a shown result can say who won.
  const word = result && centreWord === 'result' ? resultWord(result) : null;
  const wordKey = word === 'Def by' ? 'defby' : word?.toLowerCase();

  return (
    <header
      className={`sw1-header${result ? ' sw1-header--result' : ''}${premiers || (title && matchTier === 'grand-final') ? ' sw1-header--premiers' : ''}${finals && subtitle ? ' sw1-header--event' : ''}`}
    >
      {finals && (
        <div className="sw1-occasion" aria-hidden>
          {/* Outer element is the frame; the inner one is the face it holds, so
              the plate reads as a machined part rather than a coloured bar. */}
          <span className="sw1-occasion__inner">
            {matchTier === 'grand-final' ? (
              /* One week a year: the face is struck entirely from gold, with no
                 dark half to share it with. */
              <span className="sw1-occasion__final">
                <b>{gfTitle}</b>
              </span>
            ) : (
              <>
                <span className="sw1-occasion__tier">
                  <b>Finals</b>
                </span>
                {finalsTitle && (
                  <span className="sw1-occasion__final">
                    <b>{finalsTitle}</b>
                  </span>
                )}
              </>
            )}
            {/* The event, on the dark alloy after the gold: "AFL Masters National
                Carnival · Newcastle 2026". Trims with an ellipsis rather than
                running off a narrow header. */}
            {subtitle && (
              <span className="sw1-occasion__tier sw1-occasion__sub">
                <b>{subtitle}</b>
              </span>
            )}
          </span>
        </div>
      )}
      {/* On a phone the event line moves under the plate instead of trimming
          inside it: a carnival name is the part people want to read. */}
      {finals && subtitle && <div className="sw1-occasion-line">{subtitle}</div>}
      {/* faint crests bleeding off each side */}
      {club.logoUrl && <img className="sw1-header__ghost sw1-header__ghost--l" src={club.logoUrl} alt="" />}
      {!showcase && match.opponentLogoUrl && (
        <img className="sw1-header__ghost sw1-header__ghost--r" src={match.opponentLogoUrl} alt="" />
      )}

      <div className={`sw1-header__crests${showcase ? ' sw1-header__crests--solo' : ''}`}>
        <Crest
          name={club.name}
          logoUrl={club.logoUrl}
          color={club.secondaryColor}
          score={result?.club}
          outcome={result ? clubOutcome : undefined}
        />
        {!showcase && (
          <>
            <div className={`sw1-header__v sw1-header__v--${vsStyle}${word ? ' sw1-header__v--word' : ''}`}>
              <span className="sw1-header__bolt" aria-hidden />
              {word ? (
                <span className={`sw1-header__vs sw1-header__word is-${wordKey}`}>
                  {word === 'Def by' ? (
                    <>
                      Def<small>by</small>
                    </>
                  ) : (
                    word
                  )}
                </span>
              ) : (
                <span className="sw1-header__vs" aria-hidden>
                  VS
                </span>
              )}
            </div>
            <Crest
              name={match.opponent}
              logoUrl={match.opponentLogoUrl}
              color="#64748b"
              score={result?.opponent}
              outcome={result ? oppOutcome : undefined}
            />
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

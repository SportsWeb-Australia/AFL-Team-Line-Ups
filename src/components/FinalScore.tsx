import type { CentreWord, Club, MatchInfo, MatchTier, TeamScore } from '../types';
import { EMPTY_RESULT, premiersLabel, resultWord, scoreBreakdown, scoreTotal, winner } from '../lib/score';

/**
 * Final score entry for the match header. AFL scoring is entered the way it's
 * read off a scoreboard — goals and behinds — and the total is worked out, so it
 * can never disagree with the breakdown.
 */
interface Props {
  club: Club;
  match: MatchInfo;
  matchTier: MatchTier;
  onMatch: (patch: Partial<MatchInfo>) => void;
  centreWord?: CentreWord;
  onCentreWord?: (w: CentreWord) => void;
  /** The club's own plate text, which replaces "Premiers" when set. */
  plateTitle?: string;
}

export default function FinalScore({ club, match, matchTier, onMatch, centreWord = 'result', onCentreWord, plateTitle }: Props) {
  const result = match.result ?? EMPTY_RESULT;
  const set = (patch: Partial<typeof result>) => onMatch({ result: { ...result, ...patch } });
  const setSide = (side: 'club' | 'opponent', key: keyof TeamScore, raw: string) => {
    const n = raw === '' ? 0 : Math.max(0, Math.min(99, Math.floor(Number(raw)) || 0));
    set({ [side]: { ...result[side], [key]: n } } as Partial<typeof result>);
  };

  const w = winner(result);
  const margin = Math.abs(scoreTotal(result.club) - scoreTotal(result.opponent));
  const opponentName = match.opponent?.trim() || 'Opponent';
  const premiers = plateTitle?.trim() || premiersLabel({ ...match, result: { ...result, show: true } }, matchTier);
  const word = resultWord(result);

  const row = (side: 'club' | 'opponent', name: string) => (
    <div className="sw1-score__row">
      <span className="sw1-score__team" title={name}>
        {name}
      </span>
      <label className="sw1-score__field">
        <span>Goals</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={99}
          value={result[side].goals}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setSide(side, 'goals', e.target.value)}
        />
      </label>
      <label className="sw1-score__field">
        <span>Behinds</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={99}
          value={result[side].behinds}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setSide(side, 'behinds', e.target.value)}
        />
      </label>
      <span className="sw1-score__total" aria-label={`${name} total`}>
        {scoreBreakdown(result[side])} <b>({scoreTotal(result[side])})</b>
      </span>
    </div>
  );

  return (
    <div className="sw1-vsstyle sw1-score">
      <span className="sw1-vsstyle__label">Final score</span>
      <label className="sw1-score__toggle">
        <input type="checkbox" checked={result.show} onChange={(e) => set({ show: e.target.checked })} />
        <span>Show the final score in the header</span>
      </label>

      {result.show && (
        <>
          {row('club', club.name || 'Your club')}
          {row('opponent', opponentName)}
          {onCentreWord && (
            <div className="sw1-score__word">
              <span>Between the crests</span>
              <div className="sw1-admin__modes">
                <button
                  type="button"
                  className={`sw1-chip ${centreWord === 'result' ? 'is-active' : ''}`}
                  onClick={() => onCentreWord('result')}
                >
                  Def / Draw / Def by
                </button>
                <button
                  type="button"
                  className={`sw1-chip ${centreWord === 'vs' ? 'is-active' : ''}`}
                  onClick={() => onCentreWord('vs')}
                >
                  VS
                </button>
              </div>
            </div>
          )}
          <p className="sw1-score__outcome" aria-live="polite">
            {w === 'draw'
              ? 'Draw.'
              : `${w === 'club' ? club.name || 'Your club' : opponentName} by ${margin} ${margin === 1 ? 'point' : 'points'}.`}
            {centreWord === 'result' && (
              <>
                {' '}
                The header reads <strong>{club.name || 'Your club'} {word.toUpperCase()} {opponentName}</strong>.
              </>
            )}
            {matchTier === 'grand-final' &&
              (premiers ? (
                <>
                  {' '}
                  The header plate will read <strong>{premiers}</strong>.
                </>
              ) : (
                <> The plate stays &ldquo;Grand Final&rdquo; &mdash; it only reads Premiers when your club wins.</>
              ))}
          </p>
        </>
      )}
      {!result.show && (
        <p className="sw1-vsstyle__hint">
          After the game, tick this and enter goals and behinds. Set the Occasion to <strong>Grand Final</strong> and a
          win turns the header plate into <strong>Premiers</strong>.
        </p>
      )}
    </div>
  );
}

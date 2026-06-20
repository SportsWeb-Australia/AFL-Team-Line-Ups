import type { Player, PlayerStatus, PositionKey } from '../types';
import { FIELD_SLOTS, FOLLOWER_LABELS, type LineName } from '../lib/field';

const LINES: LineName[] = ['BACKS', 'HALF BACKS', 'CENTRE', 'HALF FORWARDS', 'FORWARDS'];

const AVAIL_LABEL: Partial<Record<PlayerStatus, string>> = {
  injured: 'Injured',
  concussion: 'Concussion',
  personal: 'Personal',
  suspended: 'Suspended',
};

/**
 * A read-only summary of the selections: 15 field positions + 3 followers
 * (Ruck / Ruck Rover / Rover) = 18, then the interchange, then any unavailable
 * players with their reason tag. Mirrors the "playing list" team read-out.
 */
export default function PlayingList({
  positions,
  playerMap,
  followers = [],
  interchange = [],
  unavailable = [],
}: {
  positions: Partial<Record<PositionKey, string>>;
  playerMap: Map<string, Player>;
  followers?: string[];
  interchange?: string[];
  unavailable?: Player[];
}) {
  const filled = Object.values(positions).filter(Boolean).length + followers.filter(Boolean).length;

  return (
    <div className="sw1-playinglist">
      <div className="sw1-playinglist__count">
        <strong>{filled}</strong> / 18 positions filled
      </div>
      {LINES.map((line) => (
        <div key={line} className="sw1-playinglist__line">
          <div className="sw1-playinglist__linehead">{line}</div>
          {FIELD_SLOTS.filter((s) => s.line === line).map((s) => {
            const id = positions[s.key];
            const p = id ? playerMap.get(id) : null;
            return (
              <div
                key={s.key}
                className={`sw1-playinglist__row ${p ? '' : 'is-empty'}`}
              >
                <span className="sw1-playinglist__pos">{s.label}</span>
                <span className="sw1-playinglist__player">
                  {p ? (
                    <>
                      <span className="sw1-playinglist__no">{p.number || "\u2013"}</span>
                      {p.name}
                    </>
                  ) : (
                    '—'
                  )}
                </span>
              </div>
            );
          })}
        </div>
      ))}

      {/* Followers — Ruck / Ruck Rover / Rover (completes the 18) */}
      <div className="sw1-playinglist__line">
        <div className="sw1-playinglist__linehead">FOLLOWERS</div>
        {FOLLOWER_LABELS.map((label, i) => {
          const id = followers[i];
          const p = id ? playerMap.get(id) : null;
          return (
            <div key={label} className={`sw1-playinglist__row ${p ? '' : 'is-empty'}`}>
              <span className="sw1-playinglist__pos">{label}</span>
              <span className="sw1-playinglist__player">
                {p ? (
                  <>
                    <span className="sw1-playinglist__no">{p.number || "\u2013"}</span>
                    {p.name}
                  </>
                ) : (
                  '—'
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* Interchange */}
      {interchange.filter((id) => playerMap.get(id)).length > 0 && (
        <div className="sw1-playinglist__line">
          <div className="sw1-playinglist__linehead">INTERCHANGE</div>
          {interchange.map((id) => {
            const p = playerMap.get(id);
            if (!p) return null;
            return (
              <div key={id} className="sw1-playinglist__row">
                <span className="sw1-playinglist__player">
                  <span className="sw1-playinglist__no">{p.number || "\u2013"}</span>
                  {p.name}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {unavailable.length > 0 && (
        <div className="sw1-playinglist__line sw1-playinglist__unavail">
          <div className="sw1-playinglist__linehead">UNAVAILABLE</div>
          {unavailable.map((p) => {
            const reason = (p.status ?? []).find((s) => s in AVAIL_LABEL);
            return (
              <div key={p.id} className="sw1-playinglist__row">
                <span className="sw1-playinglist__player">
                  <span className="sw1-playinglist__no">{p.number || "\u2013"}</span>
                  {p.name}
                </span>
                {reason && <span className="sw1-playinglist__tag">{AVAIL_LABEL[reason]}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

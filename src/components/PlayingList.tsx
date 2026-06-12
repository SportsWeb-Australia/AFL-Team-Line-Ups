import type { Player, PlayerStatus, PositionKey } from '../types';
import { FIELD_SLOTS, type LineName } from '../lib/field';

const LINES: LineName[] = ['BACKS', 'HALF BACKS', 'CENTRE', 'HALF FORWARDS', 'FORWARDS'];

const AVAIL_LABEL: Partial<Record<PlayerStatus, string>> = {
  injured: 'Injured',
  concussion: 'Concussion',
  personal: 'Personal',
  suspended: 'Suspended',
};

/**
 * A read-only summary of the on-field selections, grouped by line with full
 * position names — mirrors the "playing list" in the original reference. Any
 * unavailable players are listed at the bottom with their reason tag.
 */
export default function PlayingList({
  positions,
  playerMap,
  unavailable = [],
}: {
  positions: Partial<Record<PositionKey, string>>;
  playerMap: Map<string, Player>;
  unavailable?: Player[];
}) {
  const filled = Object.values(positions).filter(Boolean).length;

  return (
    <div className="sw1-playinglist">
      <div className="sw1-playinglist__count">
        <strong>{filled}</strong> / 15 positions filled
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

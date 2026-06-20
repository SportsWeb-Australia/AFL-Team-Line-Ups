import type { BenchArea, Player, PlayerStatus, VisualMode } from '../types';
import PlayerPlate, { HEALTH_STATUS } from './PlayerPlate';

interface Props {
  title: string;
  area: BenchArea;
  players: Player[];
  visualMode: VisualMode;
  /** ONE jumper image shared by the whole team (jumper mode). */
  teamJumperUrl?: string;
  /** Admin only. */
  enabled?: boolean;
  selectedPlayerId?: string | null;
  onAssign?: (area: BenchArea, playerId: string) => void;
  /** Pick a bench player up so they can be moved/swapped. */
  onSelect?: (playerId: string) => void;
  /** Render slim rows (number · name · status tag) instead of full plates. */
  rowLayout?: boolean;
}

export default function BenchZone({
  title,
  area,
  players,
  visualMode,
  teamJumperUrl,
  enabled = false,
  selectedPlayerId = null,
  onAssign,
  onSelect,
  rowLayout = false,
}: Props) {
  // Tapping anywhere in the zone while a player is "picked up" moves them here.
  const handleZoneTap = () => {
    if (enabled && selectedPlayerId && onAssign) onAssign(area, selectedPlayerId);
  };

  const pickProps = (p: Player) => ({
    draggable: enabled,
    onDragStart: (e: React.DragEvent) => e.dataTransfer.setData('text/plain', p.id),
    onClick: (e: React.MouseEvent) => {
      if (!enabled) return;
      if (!selectedPlayerId && onSelect) {
        e.stopPropagation();
        onSelect(p.id);
      }
    },
  });

  return (
    <section
      className={`sw1-bench ${enabled ? 'sw1-bench--drop' : ''} ${rowLayout ? 'sw1-bench--rows' : ''}`}
      data-bench={area}
      onClick={handleZoneTap}
      onDragOver={(e) => enabled && e.preventDefault()}
      onDrop={(e) => {
        if (!enabled || !onAssign) return;
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain');
        if (id) onAssign(area, id);
      }}
    >
      <h3 className="sw1-bench__title sw1-grouplabel">{title}</h3>
      <div className="sw1-bench__grid">
        {players.length === 0 && enabled && <p className="sw1-bench__empty">Tap a player, then tap here</p>}
        {players.map((p) => {
          if (rowLayout) {
            const key = (p.status || []).find((s) => s in HEALTH_STATUS) as PlayerStatus | undefined;
            const health = key ? HEALTH_STATUS[key] : null;
            return (
              <div
                key={p.id}
                className={`sw1-availcell ${selectedPlayerId === p.id ? 'is-picked' : ''}`}
                {...pickProps(p)}
              >
                {health && (
                  <span className={`sw1-availtag sw1-availtag--${health.cls}`}>
                    <span className="sw1-availtag__icon">{health.icon}</span>
                    {health.label}
                  </span>
                )}
                <div className="sw1-availplate">
                  <span className="sw1-availrow__no">{p.number || "\u2013"}</span>
                  <span className="sw1-availrow__name">{p.name}</span>
                </div>
              </div>
            );
          }
          return (
            <div
              key={p.id}
              className={`sw1-bench__item ${selectedPlayerId === p.id ? 'is-picked' : ''}`}
              {...pickProps(p)}
            >
              <PlayerPlate
                player={p}
                visualMode={visualMode}
                teamJumperUrl={teamJumperUrl}
                compact
                showStatusLabel={area === 'unavailable'}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

import { useState } from 'react';
import type { Player, PlayerStatus } from '../types';

const REASONS: { value: PlayerStatus; label: string }[] = [
  { value: 'injured', label: 'Injured' },
  { value: 'concussion', label: 'Concussion' },
  { value: 'personal', label: 'Personal' },
  { value: 'suspended', label: 'Suspended' },
];
const REASON_VALUES = REASONS.map((r) => r.value);

interface Props {
  players: Player[];
  /** playerId → short location label (position key, bench area, etc.). */
  location: Map<string, string>;
  selectedPlayerId: string | null;
  onSelect: (id: string) => void;
  onSetAvailability: (id: string, reason: PlayerStatus | null) => void;
  onRemovePlayer: (id: string) => void;
  onUpdatePlayer: (id: string, fields: { number?: string; name?: string }) => void;
}

export default function SquadList({
  players,
  location,
  selectedPlayerId,
  onSelect,
  onSetAvailability,
  onRemovePlayer,
  onUpdatePlayer,
}: Props) {
  const [editId, setEditId] = useState<string | null>(null);
  const [editNo, setEditNo] = useState('');
  const [editName, setEditName] = useState('');

  const numOf = (s: string) => {
    const n = parseInt(s, 10);
    return Number.isNaN(n) ? Infinity : n;
  };
  const sorted = [...players].sort((a, b) => numOf(a.number) - numOf(b.number));

  const startEdit = (p: Player) => {
    setEditId(p.id);
    setEditNo(p.number);
    setEditName(p.name);
  };
  const saveEdit = (id: string) => {
    onUpdatePlayer(id, { number: editNo.trim(), name: editName.trim() });
    setEditId(null);
  };

  return (
    <div className="sw1-squad">
      {sorted.length === 0 && (
        <p className="sw1-admin__hint">No players yet — add them below.</p>
      )}
      {sorted.map((p) => {
        const loc = location.get(p.id);
        const onField = loc !== undefined && loc !== 'Unavail';
        const reason = (p.status ?? []).find((s) => REASON_VALUES.includes(s)) ?? '';

        if (editId === p.id) {
          return (
            <div key={p.id} className="sw1-squad__row sw1-squad__row--edit">
              <input
                className="sw1-squad__editno"
                value={editNo}
                inputMode="numeric"
                onChange={(e) => setEditNo(e.target.value)}
              />
              <input
                className="sw1-squad__editname"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
              <button className="sw1-squad__ok" onClick={() => saveEdit(p.id)} title="Save">
                ✓
              </button>
              <button className="sw1-squad__x" onClick={() => setEditId(null)} title="Cancel">
                ✕
              </button>
            </div>
          );
        }

        return (
          <div
            key={p.id}
            className={`sw1-squad__row ${selectedPlayerId === p.id ? 'is-selected' : ''}`}
          >
            <button
              className="sw1-squad__pick"
              draggable
              onDragStart={(e) => e.dataTransfer.setData('text/plain', p.id)}
              onClick={() => onSelect(p.id)}
              title="Tap to pick up, then tap a field position or bench group"
            >
              <span className="sw1-squad__no">{p.number || "\u2013"}</span>
              <span className="sw1-squad__name">{p.name}</span>
              <span className={`sw1-squad__loc ${onField ? 'is-on' : ''} ${loc === 'Unavail' ? 'is-out' : ''}`}>
                {loc ?? 'Available'}
              </span>
            </button>

            <div className="sw1-squad__controls">
              <select
                className="sw1-squad__avail"
                value={reason}
                onChange={(e) =>
                  onSetAvailability(p.id, (e.target.value || null) as PlayerStatus | null)
                }
                title="Availability"
              >
                <option value="">Available</option>
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <button className="sw1-squad__edit" onClick={() => startEdit(p)} title="Edit">
                ✎
              </button>
              <button
                className="sw1-squad__remove"
                onClick={() => onRemovePlayer(p.id)}
                title="Remove from squad"
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

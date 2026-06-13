import { useState, type ChangeEvent } from 'react';
import type { Player, PlayerStatus, PositionKey } from '../types';
import type { SlotDef } from '../lib/field';

const REASONS: { value: PlayerStatus; label: string }[] = [
  { value: 'injured', label: 'Injured' },
  { value: 'concussion', label: 'Concussion' },
  { value: 'personal', label: 'Personal' },
  { value: 'suspended', label: 'Suspended' },
];
const REASON_VALUES = REASONS.map((r) => r.value);
const REASON_LABEL: Record<string, string> = Object.fromEntries(
  REASONS.map((r) => [r.value, r.label]),
);

/** Bench groups a player can be dropped into from the quick-place menu. */
export type QuickTarget = PositionKey | 'interchange' | 'emergencies' | 'followers';
const BENCH_TARGETS: { value: QuickTarget; label: string }[] = [
  { value: 'interchange', label: 'Interchange' },
  { value: 'emergencies', label: 'Emergencies' },
  { value: 'followers', label: 'Followers' },
];

/** One-tap honour badges. C/VC are one-per-team; debut/milestone are unlimited. */
const ROLE_TOGGLES: { value: PlayerStatus; label: string; cls: string; title: string }[] = [
  { value: 'captain', label: 'C', cls: 'is-captain', title: 'Captain' },
  { value: 'vice-captain', label: 'VC', cls: 'is-vc', title: 'Vice-captain' },
  { value: 'debut', label: '★ Debut', cls: 'is-debut', title: 'Debut' },
  { value: 'milestone', label: '◆ Milestone', cls: 'is-milestone', title: 'Milestone' },
];

interface Props {
  players: Player[];
  /** playerId → short location label (position key, bench area, etc.). */
  location: Map<string, string>;
  /** Field slots for the current layout, used to build the quick-place menu. */
  fieldSlots: SlotDef[];
  /** Current on-field assignments, so the menu can show who's where. */
  positions: Partial<Record<PositionKey, string>>;
  selectedPlayerId: string | null;
  onSelect: (id: string) => void;
  onSetAvailability: (id: string, reason: PlayerStatus | null) => void;
  onSetRole: (id: string, role: PlayerStatus, on: boolean) => void;
  onQuickPlace: (id: string, target: QuickTarget) => void;
  onRemovePlayer: (id: string) => void;
  onUpdatePlayer: (id: string, fields: { number?: string; name?: string }) => void;
  onSetPlayerImage: (id: string, kind: 'headshot' | 'jumper', dataUrl: string | null) => void;
}

export default function SquadList({
  players,
  location,
  fieldSlots,
  positions,
  selectedPlayerId,
  onSelect,
  onSetAvailability,
  onSetRole,
  onQuickPlace,
  onRemovePlayer,
  onUpdatePlayer,
  onSetPlayerImage,
}: Props) {
  const [editId, setEditId] = useState<string | null>(null);
  const [editNo, setEditNo] = useState('');
  const [editName, setEditName] = useState('');

  const numOf = (s: string) => {
    const n = parseInt(s, 10);
    return Number.isNaN(n) ? Infinity : n;
  };
  const nameOf = (id?: string) => players.find((p) => p.id === id)?.name ?? '';

  // Lines in field order, for the quick-place dropdown's optgroups.
  const lines: { line: string; slots: SlotDef[] }[] = [];
  for (const s of fieldSlots) {
    let group = lines.find((g) => g.line === s.line);
    if (!group) {
      group = { line: s.line, slots: [] };
      lines.push(group);
    }
    group.slots.push(s);
  }

  // Available first; just-added (numberless) players float to the TOP newest-first,
  // then numbered players in guernsey order. Unavailable grouped at the bottom.
  const reasonOf = (p: Player) => (p.status ?? []).find((s) => REASON_VALUES.includes(s)) ?? '';
  const byNumber = (a: Player, b: Player) => numOf(a.number) - numOf(b.number);
  const hasNum = (p: Player) => !!(p.number && p.number.trim());
  const availablePool = players.filter((p) => !reasonOf(p));
  const available = [
    ...availablePool.filter((p) => !hasNum(p)).reverse(),
    ...availablePool.filter(hasNum).sort(byNumber),
  ];
  const unavailable = players.filter((p) => reasonOf(p)).sort(byNumber);

  const startEdit = (p: Player) => {
    setEditId(p.id);
    setEditNo(p.number);
    setEditName(p.name);
  };
  const saveEdit = (id: string) => {
    onUpdatePlayer(id, { number: editNo.trim(), name: editName.trim() });
    setEditId(null);
  };

  const renderRow = (p: Player) => {
    const loc = location.get(p.id);
    const placed = loc !== undefined && loc !== 'Unavail';
    const reason = reasonOf(p);

    if (editId === p.id) {
      const readImg = (kind: 'headshot' | 'jumper') => (e: ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => onSetPlayerImage(p.id, kind, String(r.result));
        r.readAsDataURL(f);
      };
      return (
        <div key={p.id} className="sw1-squad__row sw1-squad__row--edit">
          <div className="sw1-squad__editline">
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
          <div className="sw1-squad__imgrow">
            <label className="sw1-squad__imgbtn">
              {p.headshotUrl ? 'Headshot ✓' : 'Add headshot'}
              <input type="file" accept="image/*" onChange={readImg('headshot')} />
            </label>
            {p.headshotUrl && (
              <button className="sw1-squad__imgclear" onClick={() => onSetPlayerImage(p.id, 'headshot', null)}>
                Clear
              </button>
            )}
            <label className="sw1-squad__imgbtn">
              {p.jumperImageUrl ? 'Jumper ✓' : 'Add jumper'}
              <input type="file" accept="image/*" onChange={readImg('jumper')} />
            </label>
            {p.jumperImageUrl && (
              <button className="sw1-squad__imgclear" onClick={() => onSetPlayerImage(p.id, 'jumper', null)}>
                Clear
              </button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div
        key={p.id}
        className={`sw1-squad__row ${selectedPlayerId === p.id ? 'is-selected' : ''} ${placed ? 'is-placed' : ''} ${reason ? 'is-unavail' : ''}`}
      >
        <div className="sw1-squad__main">
          <button
            className={`sw1-squad__pick ${placed ? 'is-placed' : ''}`}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/plain', p.id)}
            onClick={() => onSelect(p.id)}
            title={placed ? 'On the ground — tap to pick up and move' : 'Tap to pick up, then tap a spot — or use Add to position'}
          >
            <span className="sw1-squad__no">{p.number || '\u2013'}</span>
            <span className="sw1-squad__name">{p.name}</span>
            {placed && <span className="sw1-squad__loc is-on">{loc}</span>}
            {reason && <span className="sw1-squad__tag">{REASON_LABEL[reason]}</span>}
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

        {/* Quick place — assign straight to a position or bench without scrolling. */}
        <select
          className="sw1-squad__place"
          value=""
          onChange={(e) => {
            const v = e.target.value as QuickTarget | '';
            if (v) onQuickPlace(p.id, v);
            e.currentTarget.selectedIndex = 0;
          }}
          title="Add this player to a position"
        >
          <option value="">{placed ? `On ground (${loc}) — move to…` : '\uFF0B Add to position…'}</option>
          {lines.map((g) => (
            <optgroup key={g.line} label={g.line}>
              {g.slots.map((s) => {
                const occ = positions[s.key];
                const taken = occ && occ !== p.id ? ` \u00B7 ${nameOf(occ)}` : '';
                return (
                  <option key={s.key} value={s.key}>
                    {s.label}
                    {taken}
                  </option>
                );
              })}
            </optgroup>
          ))}
          <optgroup label="Bench">
            {BENCH_TARGETS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </optgroup>
        </select>

        <div className="sw1-squad__roles">
          {ROLE_TOGGLES.map((r) => {
            const on = (p.status ?? []).includes(r.value);
            return (
              <button
                key={r.value}
                type="button"
                className={`sw1-rolechip ${r.cls} ${on ? 'is-on' : ''}`}
                aria-pressed={on}
                title={`${r.title}${on ? ' — tap to clear' : ''}`}
                onClick={() => onSetRole(p.id, r.value, !on)}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="sw1-squad">
      {players.length === 0 && (
        <p className="sw1-admin__hint">No players yet — add them below.</p>
      )}

      {available.map(renderRow)}

      {unavailable.length > 0 && (
        <>
          <div className="sw1-squad__divider">
            Unavailable <span>({unavailable.length})</span>
          </div>
          {unavailable.map(renderRow)}
        </>
      )}
    </div>
  );
}

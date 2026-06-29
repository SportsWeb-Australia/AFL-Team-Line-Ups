import { useState, type ChangeEvent } from 'react';
import type { Player, PlayerStatus, PositionKey } from '../types';
import type { SlotDef } from '../lib/field';
import type { ClubPlayer } from '../lib/source';
import { removeHeadshotBackground } from '../lib/removeBg';

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
export type QuickTarget =
  | PositionKey
  | 'interchange'
  | 'emergencies'
  | 'followers'
  | 'follower0'
  | 'follower1'
  | 'follower2';
/** Followers sit just below the field lines — the three ruck-division roles. */
const FOLLOWER_TARGETS: { value: QuickTarget; label: string }[] = [
  { value: 'follower0', label: 'Ruck' },
  { value: 'follower1', label: 'Ruck Rover' },
  { value: 'follower2', label: 'Rover' },
];
const BENCH_TARGETS: { value: QuickTarget; label: string }[] = [
  { value: 'interchange', label: 'Interchange' },
  { value: 'emergencies', label: 'Emergencies' },
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
  /** Players from other teams at this club, for the opt-in cross-team search. */
  clubPlayers?: ClubPlayer[];
  onAddClubPlayer?: (p: ClubPlayer) => void;
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
  clubPlayers = [],
  onAddClubPlayer,
}: Props) {
  const [editId, setEditId] = useState<string | null>(null);
  const [editNo, setEditNo] = useState('');
  const [editName, setEditName] = useState('');
  const [bgBusy, setBgBusy] = useState(false);
  const [search, setSearch] = useState('');

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

  // Player search — narrows both lists by name or guernsey number. Handy once a
  // squad runs long on a phone.
  const q = search.trim().toLowerCase();
  const matchesSearch = (p: Player) =>
    !q || p.name.toLowerCase().includes(q) || (p.number || '').toLowerCase().includes(q);
  const availableShown = available.filter(matchesSearch);
  const unavailableShown = unavailable.filter(matchesSearch);
  const nothingFound = q !== '' && availableShown.length === 0 && unavailableShown.length === 0;

  // Opt-in cross-team search: only when actively searching, only players from
  // OTHER teams at this club who aren't already in this squad. Adding one pulls
  // them into the current sheet (and attaches them on save) — it never
  // auto-merges the whole club, which was the old squad-pollution bug.
  const inSquad = new Set<string>();
  for (const p of players) {
    inSquad.add(p.id);
    if (p.dbId) inSquad.add(p.dbId);
  }
  const clubMatches =
    q === '' || !onAddClubPlayer
      ? []
      : clubPlayers.filter(
          (cp) =>
            !inSquad.has(cp.id) &&
            (cp.name.toLowerCase().includes(q) || (cp.number || '').toLowerCase().includes(q)),
        );

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
      const readImg = (kind: 'headshot' | 'jumper') => async (e: ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        e.target.value = ''; // allow re-selecting the same file
        if (!f) return;
        if (kind === 'headshot') {
          // Auto-remove the background client-side. If anything fails (e.g. offline,
          // or the model can't load), fall back to the original image so the upload
          // never silently breaks.
          setBgBusy(true);
          try {
            const cutout = await removeHeadshotBackground(f);
            onSetPlayerImage(p.id, 'headshot', cutout);
          } catch {
            const r = new FileReader();
            r.onload = () => onSetPlayerImage(p.id, 'headshot', String(r.result));
            r.readAsDataURL(f);
          } finally {
            setBgBusy(false);
          }
          return;
        }
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
              placeholder="Jumper No."
              aria-label="Jumper number"
              onChange={(e) => setEditNo(e.target.value)}
            />
            <input
              className="sw1-squad__editname"
              value={editName}
              placeholder="Player name"
              aria-label="Player name"
              onChange={(e) => setEditName(e.target.value)}
            />
          </div>
          {/* Photo + confirm live together so there's nothing to scroll across. */}
          <div className="sw1-squad__editactions">
            <label className="sw1-squad__imgbtn">
              {bgBusy ? 'Removing background…' : p.headshotUrl ? 'Headshot ✓' : 'Add headshot'}
              <input type="file" accept="image/*" disabled={bgBusy} onChange={readImg('headshot')} />
            </label>
            {p.headshotUrl && !bgBusy && (
              <button className="sw1-squad__imgclear" onClick={() => onSetPlayerImage(p.id, 'headshot', null)}>
                Clear
              </button>
            )}
            <span className="sw1-squad__editactions-gap" />
            <button className="sw1-squad__ok" onClick={() => saveEdit(p.id)} title="Save">
              ✓
            </button>
            <button className="sw1-squad__x" onClick={() => setEditId(null)} title="Cancel">
              ✕
            </button>
          </div>
          <p className="sw1-squad__imgnote">
            Background is removed automatically. For the sharpest cut-out, upload a headshot that's
            already on a transparent or clean background — or have it done at the source.{' '}
            <strong>Media days with Click Sports Media include professionally cut-out headshots.</strong>
          </p>
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
          <optgroup label="FOLLOWERS">
            {FOLLOWER_TARGETS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </optgroup>
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

      {(players.length > 6 || (onAddClubPlayer && clubPlayers.length > 0)) && (
        <div className="sw1-squad__search">
          <div className="sw1-squad__searchhead">Find a player</div>
          <input
            type="search"
            className="sw1-squad__searchinput"
            value={search}
            placeholder="Search by name or number…"
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="sw1-squad__searchclear"
              onClick={() => setSearch('')}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {availableShown.map(renderRow)}

      {unavailableShown.length > 0 && (
        <>
          <div className="sw1-squad__divider">
            Unavailable <span>({unavailableShown.length})</span>
          </div>
          {unavailableShown.map(renderRow)}
        </>
      )}

      {clubMatches.length > 0 && (
        <>
          <div className="sw1-squad__divider">
            From other teams at your club <span>({clubMatches.length})</span>
          </div>
          {clubMatches.map((cp) => (
            <div key={`club-${cp.id}`} className="sw1-squad__row sw1-squad__clubrow">
              <span className="sw1-squad__clubpick">
                <span className="sw1-squad__clubno">{cp.number || '–'}</span>
                <span className="sw1-squad__clubname">{cp.name}</span>
              </span>
              <button
                type="button"
                className="sw1-btn sw1-btn--primary sw1-squad__clubadd"
                onClick={() => {
                  if (
                    window.confirm(
                      `Add ${cp.name || 'this player'} to this team? They're already in your club's player list — this only adds them to the team you're editing.`,
                    )
                  ) {
                    onAddClubPlayer?.(cp);
                  }
                }}
              >
                + Add
              </button>
            </div>
          ))}
        </>
      )}

      {q !== '' && onAddClubPlayer && clubPlayers.length === 0 && (
        <p className="sw1-admin__hint sw1-squad__clubnote">
          Searching this team only — no other players loaded from your club yet.
        </p>
      )}

      {nothingFound && clubMatches.length === 0 && (
        <p className="sw1-admin__hint">No players match "{search}".</p>
      )}
    </div>
  );
}

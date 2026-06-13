import type { ReactNode } from 'react';
import type { Player, VisualMode, PlayerStatus } from '../types';
import jumperPlaceholder from '../assets/jumper-placeholder.png';
import headshotPlaceholder from '../assets/headshot-placeholder.png';

/* ── Status icons (inline SVG, no dependencies) ─────────────────────────── */
function IconCross() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false">
      <path d="M9.5 3h5v6h6v5h-6v6h-5v-6h-6V9h6z" fill="currentColor" />
    </svg>
  );
}
function IconHead() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false">
      <circle cx="10.5" cy="13.5" r="6" fill="currentColor" />
      <path
        d="M16.5 3.2l-1.8 3.6M19.8 5.4l-2.7 2.7M21.2 9.2l-3.6 1.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
function IconPerson() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false">
      <path
        d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-3.3 0-8 1.7-8 5v3h16v-3c0-3.3-4.7-5-8-5z"
        fill="currentColor"
      />
    </svg>
  );
}
function IconBan() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false">
      <path
        d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 3a7 7 0 0 1 4.2 1.4L6.4 16.2A7 7 0 0 1 12 5zm0 14a7 7 0 0 1-4.2-1.4l9.8-9.8A7 7 0 0 1 12 19z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Positive role markers — small gold/coloured chips. */
const ROLE_BADGE: Partial<Record<PlayerStatus, { short: string; title: string; cls: string }>> = {
  captain: { short: 'C', title: 'Captain', cls: 'is-captain' },
  'vice-captain': { short: 'VC', title: 'Vice-captain', cls: 'is-vc' },
  debut: { short: '★', title: 'Debut', cls: 'is-debut' },
  milestone: { short: '◆', title: 'Milestone', cls: 'is-milestone' },
};

/** Availability / health flags — tint the whole plate + show an icon chip. */
export const HEALTH_STATUS: Partial<
  Record<PlayerStatus, { label: string; cls: string; icon: ReactNode }>
> = {
  injured: { label: 'Injured', cls: 'injured', icon: <IconCross /> },
  concussion: { label: 'Concussion', cls: 'concussion', icon: <IconHead /> },
  personal: { label: 'Personal', cls: 'personal', icon: <IconPerson /> },
  suspended: { label: 'Suspended', cls: 'suspended', icon: <IconBan /> },
};

interface Props {
  player: Player;
  visualMode: VisualMode;
  /** ONE jumper image shared by the whole team (used when visualMode === 'jumper'). */
  teamJumperUrl?: string;
  compact?: boolean;
  /** Show the written status label next to the icon (used in the Unavailable list). */
  showStatusLabel?: boolean;
}

/**
 * A single player token: optional jumper/headshot artwork above a slanted name
 * plate, with role badges and a colour-coded availability flag.
 */
export default function PlayerPlate({ player, visualMode, teamJumperUrl, compact = false, showStatusLabel = false }: Props) {
  const showArt = visualMode !== 'none';
  let artSrc: string | null = null;
  if (visualMode === 'headshot') artSrc = player.headshotUrl ?? headshotPlaceholder;
  else if (visualMode === 'jumper') artSrc = teamJumperUrl ?? jumperPlaceholder;

  const statuses = player.status ?? [];
  const roles = statuses.filter((s) => s in ROLE_BADGE);
  const healthKey = statuses.find((s) => s in HEALTH_STATUS);
  const health = healthKey ? HEALTH_STATUS[healthKey] : null;

  return (
    <div
      className={[
        'sw1-plate',
        compact ? 'sw1-plate--compact' : '',
        `sw1-plate--${visualMode}`,
        health ? `sw1-plate--flag sw1-plate--${health.cls}` : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {showArt && artSrc && (
        <div className="sw1-plate__art">
          <img src={artSrc} alt="" />
        </div>
      )}

      {/* Unavailable list: status floats above the plate so it never covers the name */}
      {health && showStatusLabel && (
        <span
          className={`sw1-plate__health sw1-plate__health--float sw1-health--${health.cls}`}
          title={health.label}
        >
          <span className="sw1-plate__health-icon">{health.icon}</span>
          <span className="sw1-plate__health-label">{health.label}</span>
        </span>
      )}

      <div className="sw1-plate__row">
        <span className="sw1-plate__no">{player.number || "\u2013"}</span>
        <span className="sw1-plate__name">{player.name}</span>

        {/* Role badges (C, VC, etc.) sit INSIDE the plate at the right end, so they
            never float out over neighbouring players or the top-right logos. */}
        {roles.length > 0 && (
          <span className="sw1-plate__badges">
            {roles.map((r) => {
              const b = ROLE_BADGE[r]!;
              return (
                <span key={r} className={`sw1-plate__badge ${b.cls}`} title={b.title}>
                  {b.short}
                </span>
              );
            })}
          </span>
        )}

        {/* On-field / bench: small icon chip inline */}
        {health && !showStatusLabel && (
          <span className={`sw1-plate__health sw1-health--${health.cls}`} title={health.label}>
            <span className="sw1-plate__health-icon">{health.icon}</span>
          </span>
        )}
      </div>
    </div>
  );
}

import type { PlayerStatus } from '../types';
import { HEALTH_STATUS } from './PlayerPlate';

const ROLE_LEGEND: { key: PlayerStatus; short: string; label: string; cls: string }[] = [
  { key: 'captain', short: 'C', label: 'Captain', cls: 'is-role' },
  { key: 'vice-captain', short: 'VC', label: 'Vice-captain', cls: 'is-role' },
  { key: 'debut', short: '★', label: 'Debut', cls: 'is-debut' },
  { key: 'milestone', short: '◆', label: 'Milestone', cls: 'is-milestone' },
];

/** A compact key explaining the badges/flags actually present in this team sheet. */
export default function StatusLegend({ present }: { present: Set<PlayerStatus> }) {
  const roles = ROLE_LEGEND.filter((r) => present.has(r.key));
  const healths = (Object.keys(HEALTH_STATUS) as PlayerStatus[]).filter((k) => present.has(k));
  if (roles.length === 0 && healths.length === 0) return null;

  return (
    <div className="sw1-legend" aria-label="Status key">
      {roles.map((r) => (
        <span key={r.key} className="sw1-legend__item">
          <span className={`sw1-legend__chip ${r.cls}`}>{r.short}</span>
          {r.label}
        </span>
      ))}
      {healths.map((k) => {
        const h = HEALTH_STATUS[k]!;
        return (
          <span key={k} className="sw1-legend__item">
            <span className={`sw1-legend__chip sw1-health--${h.cls}`}>{h.icon}</span>
            {h.label}
          </span>
        );
      })}
    </div>
  );
}

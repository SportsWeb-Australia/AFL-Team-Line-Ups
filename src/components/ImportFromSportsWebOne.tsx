import { useEffect, useMemo, useState } from 'react';
import { listSW1Players, type SW1Player } from '../lib/sportsWebOne';
import type { Player } from '../types';

export interface SW1ImportRow {
  number: string;
  name: string;
  headshotUrl?: string;
  externalId: string;
}

const ALL = '__all__';
const key = (name: string, number: string | null | undefined) => `${name.trim().toLowerCase()}#${(number ?? '').trim()}`;

/**
 * "Bring in players from SportsWeb One" - for a club opened from SW1 (`?sw1club`). The club keeps its players once,
 * in SW1's Website > Players; here they're brought into this team's squad by team, with their number and headshot.
 * Read-only on SW1's side, and only appears when SW1 has players to give. Players already in the squad (same SW1
 * player, or the same name and number) are skipped, so bringing a team in twice doesn't double it up.
 */
export function ImportFromSportsWebOne({
  sw1ClubId,
  grade,
  players,
  onImport,
}: {
  sw1ClubId: string;
  grade: string;
  players: Player[];
  onImport: (rows: SW1ImportRow[]) => void;
}) {
  const [all, setAll] = useState<SW1Player[]>([]);
  const [team, setTeam] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    listSW1Players(sw1ClubId).then((p) => {
      if (!cancelled) setAll(p);
    });
    return () => {
      cancelled = true;
    };
  }, [sw1ClubId]);

  const teams = useMemo(() => [...new Set(all.map((p) => p.team?.trim()).filter((t): t is string => !!t))], [all]);
  // Start on the SW1 team with this sheet's grade name, if there is one.
  const chosen = team ?? teams.find((t) => t.toLowerCase() === grade.trim().toLowerCase()) ?? ALL;
  const inTeam = all.filter((p) => chosen === ALL || p.team?.trim() === chosen);
  const have = new Set(players.flatMap((p) => [p.externalId ? `id#${p.externalId}` : '', key(p.name, p.number)]));
  const fresh = inTeam.filter((p) => !have.has(`id#${p.id}`) && !have.has(key(p.name, p.number)));

  if (all.length === 0) return null;

  const bringIn = () => {
    onImport(fresh.map((p) => ({ number: p.number ?? '', name: p.name, headshotUrl: p.photo ?? undefined, externalId: p.id })));
    setMsg(`Added ${fresh.length} player${fresh.length === 1 ? '' : 's'} from SportsWeb One.`);
  };

  return (
    <div className="sw1-admin__bulk sw1-fromsw1">
      <p className="sw1-admin__hint">
        <strong>From SportsWeb One</strong> - your club's players from Website &gt; Players, with their numbers and
        headshots. Change a player there and bring them in again.
      </p>
      {teams.length > 0 && (
        <select value={chosen} onChange={(e) => { setTeam(e.target.value); setMsg(''); }} aria-label="Which team">
          <option value={ALL}>All teams ({all.length})</option>
          {teams.map((t) => (
            <option key={t} value={t}>
              {t} ({all.filter((p) => p.team?.trim() === t).length})
            </option>
          ))}
        </select>
      )}
      <button type="button" className="sw1-btn" onClick={bringIn} disabled={fresh.length === 0}>
        {fresh.length === 0 ? 'All already in your squad' : `Bring in ${fresh.length} player${fresh.length === 1 ? '' : 's'}`}
      </button>
      {msg && <p className="sw1-addmsg is-ok">{msg}</p>}
    </div>
  );
}

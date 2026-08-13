import { useEffect, useState } from 'react';
import { findSW1ClubIdByName, listSW1Fixtures, formatSW1Date, type SW1Fixture } from '../lib/sportsWebOne';
import type { MatchInfo } from '../types';

/**
 * Optional import picker — only appears once a matching club is found in the
 * Fixtures & Ladder database with upcoming AFL fixtures. Picking one prefills
 * round/opponent/date/venue/competition here; grade is untouched since it's
 * already implied by which team/sheet is being edited. Read-only: never writes
 * back to Fixtures & Ladder, never touches this app's own tables.
 */
export function ImportFromFixturesLadder({
  clubName,
  onImport,
}: {
  clubName: string;
  onImport: (patch: Partial<MatchInfo>) => void;
}) {
  const [fixtures, setFixtures] = useState<SW1Fixture[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    findSW1ClubIdByName(clubName).then((id) => {
      if (!id || cancelled) return;
      listSW1Fixtures(id, 'afl').then((f) => {
        if (!cancelled) setFixtures(f);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [clubName]);

  if (fixtures.length === 0) return null;

  const pick = (fixtureId: string) => {
    const f = fixtures.find((x) => x.id === fixtureId);
    if (!f) return;
    const isClubHome = f.homeName.trim().toLowerCase() === clubName.trim().toLowerCase();
    onImport({
      opponent: isClubHome ? f.awayName : f.homeName,
      opponentLogoUrl: isClubHome ? f.awayLogo : f.homeLogo,
      opponentClubId: null,
      round: f.round,
      date: formatSW1Date(f.matchDate),
      venue: f.venue,
      competition: f.competition || undefined,
    });
    setOpen(false);
  };

  return (
    <div className="sw1-import-fixture">
      <button type="button" className="sw1-btn" onClick={() => setOpen(!open)}>
        Import from Fixtures &amp; Ladder ({fixtures.length})
      </button>
      {open && (
        <select defaultValue="" onChange={(e) => e.target.value && pick(e.target.value)}>
          <option value="" disabled>
            Pick a fixture…
          </option>
          {fixtures.map((f) => (
            <option key={f.id} value={f.id}>
              {f.round ? `${f.round} — ` : ''}
              {f.homeName} v {f.awayName}
              {f.matchDate ? ` (${f.matchDate})` : ''}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

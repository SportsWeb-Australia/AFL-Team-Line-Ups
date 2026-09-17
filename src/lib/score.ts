import type { MatchInfo, MatchResult, MatchTier, TeamScore } from '../types';

/** AFL scoring: a goal is 6 points, a behind is 1. */
export const scoreTotal = (s: TeamScore) => s.goals * 6 + s.behinds;

/** "11.9" — how a footy score is written before its total. */
export const scoreBreakdown = (s: TeamScore) => `${s.goals}.${s.behinds}`;

export const EMPTY_RESULT: MatchResult = {
  show: false,
  club: { goals: 0, behinds: 0 },
  opponent: { goals: 0, behinds: 0 },
};

/** 'club' | 'opponent' | 'draw', from the totals. */
export function winner(r: MatchResult): 'club' | 'opponent' | 'draw' {
  const c = scoreTotal(r.club);
  const o = scoreTotal(r.opponent);
  return c === o ? 'draw' : c > o ? 'club' : 'opponent';
}

/** The season the match belongs to, from whatever the date field holds:
 *  the picker's ISO yyyy-mm-dd, or free text like "13/09/2026". */
export function seasonYear(date?: string): string | null {
  const m = (date ?? '').match(/\b(19|20)\d{2}\b/);
  return m ? m[0] : null;
}

/**
 * What the struck header plate should say. Only a Grand Final the club WON
 * becomes "Premiers": the club publishes this graphic, and a plate reading
 * Premiers over a losing score would be wrong. A lost or drawn grand final
 * keeps its "Grand Final" plate and the score speaks for itself.
 */
export function premiersLabel(match: MatchInfo, tier: MatchTier): string | null {
  const r = match.result;
  if (tier !== 'grand-final' || !r?.show || winner(r) !== 'club') return null;
  const year = seasonYear(match.date);
  return year ? `${year} Premiers` : 'Premiers';
}

const clampScore = (n: unknown) => {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? Math.max(0, Math.min(99, v)) : 0;
};

/** Build a result from the fixture row. Null when nothing was ever entered, so
 *  sheets that predate the feature carry no result at all. */
export function resultFromRow(row: Record<string, unknown> | null | undefined): MatchResult | undefined {
  if (!row) return undefined;
  const keys = ['club_goals', 'club_behinds', 'opponent_goals', 'opponent_behinds'];
  if (!row.show_score && keys.every((k) => row[k] == null)) return undefined;
  return {
    show: !!row.show_score,
    club: { goals: clampScore(row.club_goals), behinds: clampScore(row.club_behinds) },
    opponent: { goals: clampScore(row.opponent_goals), behinds: clampScore(row.opponent_behinds) },
  };
}

/** Fixture columns for a result. Absent result writes nulls, so clearing it clears the row. */
export function resultToRow(r: MatchResult | undefined) {
  return {
    show_score: !!r?.show,
    club_goals: r ? clampScore(r.club.goals) : null,
    club_behinds: r ? clampScore(r.club.behinds) : null,
    opponent_goals: r ? clampScore(r.opponent.goals) : null,
    opponent_behinds: r ? clampScore(r.opponent.behinds) : null,
  };
}

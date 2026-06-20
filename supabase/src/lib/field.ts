/**
 * The AFL field model: where each of the 15 positions sits on the oval,
 * and the five structural line labels down the side.
 *
 * Coordinates are percentages of the oval's bounding box (portrait),
 * so they scale cleanly with the SVG at any size.
 */
import type { PositionKey } from '../types';

export interface SlotDef {
  key: PositionKey;
  /** Structural line this slot belongs to. */
  line: LineName;
  /** Human label shown in an empty admin slot, e.g. "Centre Half Back". */
  label: string;
  x: number; // % left
  y: number; // % top
}

export type LineName =
  | 'BACKS'
  | 'HALF BACKS'
  | 'CENTRE'
  | 'HALF FORWARDS'
  | 'FORWARDS';

export const FIELD_SLOTS: SlotDef[] = [
  // Players sit LEVEL across each line at every width (the field now goes
  // edge-to-edge, so there's room for three plates per line on phones too).
  // Columns are uniform: left 24% / centre 50% / right 76%.
  { key: 'BPL', line: 'BACKS', label: 'Back Pocket', x: 20, y: 13.5 },
  { key: 'FB', line: 'BACKS', label: 'Full Back', x: 50, y: 13.5 },
  { key: 'BPR', line: 'BACKS', label: 'Back Pocket', x: 80, y: 13.5 },

  { key: 'HBL', line: 'HALF BACKS', label: 'Half Back Flank', x: 20, y: 31.75 },
  { key: 'CHB', line: 'HALF BACKS', label: 'Centre Half Back', x: 50, y: 31.75 },
  { key: 'HBR', line: 'HALF BACKS', label: 'Half Back Flank', x: 80, y: 31.75 },

  { key: 'WL', line: 'CENTRE', label: 'Wing', x: 20, y: 50 },
  { key: 'C', line: 'CENTRE', label: 'Centre', x: 50, y: 50 },
  { key: 'WR', line: 'CENTRE', label: 'Wing', x: 80, y: 50 },

  { key: 'HFL', line: 'HALF FORWARDS', label: 'Half Forward Flank', x: 20, y: 68.25 },
  { key: 'CHF', line: 'HALF FORWARDS', label: 'Centre Half Forward', x: 50, y: 68.25 },
  { key: 'HFR', line: 'HALF FORWARDS', label: 'Half Forward Flank', x: 80, y: 68.25 },

  { key: 'FPL', line: 'FORWARDS', label: 'Forward Pocket', x: 20, y: 86.5 },
  { key: 'FF', line: 'FORWARDS', label: 'Full Forward', x: 50, y: 86.5 },
  { key: 'FPR', line: 'FORWARDS', label: 'Forward Pocket', x: 80, y: 86.5 },
];

// Kept identical to FIELD_SLOTS so the look is the same at every width.
export const FIELD_SLOTS_MOBILE: SlotDef[] = FIELD_SLOTS;

/** Vertical placement (% from top) of each line label down the side. */
export const LINE_LABELS: { text: LineName; abbr: string; top: number }[] = [
  { text: 'BACKS', abbr: 'B', top: 13.5 },
  { text: 'HALF BACKS', abbr: 'HB', top: 31.75 },
  { text: 'CENTRE', abbr: 'C', top: 50 },
  { text: 'HALF FORWARDS', abbr: 'HF', top: 68.25 },
  { text: 'FORWARDS', abbr: 'F', top: 86.5 },
];

export const BENCH_TITLES: Record<
  'followers' | 'interchange' | 'emergencies' | 'unavailable',
  string
> = {
  followers: 'Followers',
  interchange: 'Interchange',
  emergencies: 'Emergencies',
  unavailable: 'Unavailable',
};

/** The three "followers" sit under the oval as the ruck division. */
export const FOLLOWER_LABELS = ['Ruck', 'Ruck Rover', 'Rover'];

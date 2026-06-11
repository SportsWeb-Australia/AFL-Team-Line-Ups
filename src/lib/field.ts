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
  // DESKTOP / tablet: players sit LEVEL across each line. The x-spread widens
  // toward the centre (where the oval is widest) and tightens at the ends.
  { key: 'BPL', line: 'BACKS', label: 'Back Pocket', x: 25, y: 15 },
  { key: 'FB', line: 'BACKS', label: 'Full Back', x: 50, y: 15 },
  { key: 'BPR', line: 'BACKS', label: 'Back Pocket', x: 75, y: 15 },

  { key: 'HBL', line: 'HALF BACKS', label: 'Half Back Flank', x: 23, y: 31.9 },
  { key: 'CHB', line: 'HALF BACKS', label: 'Centre Half Back', x: 50, y: 31.9 },
  { key: 'HBR', line: 'HALF BACKS', label: 'Half Back Flank', x: 77, y: 31.9 },

  { key: 'WL', line: 'CENTRE', label: 'Wing', x: 18, y: 48.8 },
  { key: 'C', line: 'CENTRE', label: 'Centre', x: 50, y: 48.8 },
  { key: 'WR', line: 'CENTRE', label: 'Wing', x: 82, y: 48.8 },

  { key: 'HFL', line: 'HALF FORWARDS', label: 'Half Forward Flank', x: 23, y: 68.3 },
  { key: 'CHF', line: 'HALF FORWARDS', label: 'Centre Half Forward', x: 50, y: 68.3 },
  { key: 'HFR', line: 'HALF FORWARDS', label: 'Half Forward Flank', x: 77, y: 68.3 },

  { key: 'FPL', line: 'FORWARDS', label: 'Forward Pocket', x: 25, y: 85.2 },
  { key: 'FF', line: 'FORWARDS', label: 'Full Forward', x: 50, y: 85.2 },
  { key: 'FPR', line: 'FORWARDS', label: 'Forward Pocket', x: 75, y: 85.2 },
];

// MOBILE: stagger the centre man of each line so three plates fit a narrow oval.
export const FIELD_SLOTS_MOBILE: SlotDef[] = [
  { key: 'BPL', line: 'BACKS', label: 'Back Pocket', x: 26, y: 16.3 },
  { key: 'FB', line: 'BACKS', label: 'Full Back', x: 50, y: 11.1 },
  { key: 'BPR', line: 'BACKS', label: 'Back Pocket', x: 74, y: 16.3 },

  { key: 'HBL', line: 'HALF BACKS', label: 'Half Back Flank', x: 24, y: 31.9 },
  { key: 'CHB', line: 'HALF BACKS', label: 'Centre Half Back', x: 50, y: 26.7 },
  { key: 'HBR', line: 'HALF BACKS', label: 'Half Back Flank', x: 76, y: 31.9 },

  { key: 'WL', line: 'CENTRE', label: 'Wing', x: 21, y: 48.8 },
  { key: 'C', line: 'CENTRE', label: 'Centre', x: 50, y: 48.8 },
  { key: 'WR', line: 'CENTRE', label: 'Wing', x: 79, y: 48.8 },

  { key: 'HFL', line: 'HALF FORWARDS', label: 'Half Forward Flank', x: 24, y: 67 },
  { key: 'CHF', line: 'HALF FORWARDS', label: 'Centre Half Forward', x: 50, y: 72.2 },
  { key: 'HFR', line: 'HALF FORWARDS', label: 'Half Forward Flank', x: 76, y: 67 },

  { key: 'FPL', line: 'FORWARDS', label: 'Forward Pocket', x: 26, y: 82.6 },
  { key: 'FF', line: 'FORWARDS', label: 'Full Forward', x: 50, y: 87.8 },
  { key: 'FPR', line: 'FORWARDS', label: 'Forward Pocket', x: 74, y: 82.6 },
];

/** Vertical placement (% from top) of each line label down the side. */
export const LINE_LABELS: { text: LineName; abbr: string; top: number }[] = [
  { text: 'BACKS', abbr: 'B', top: 13.7 },
  { text: 'HALF BACKS', abbr: 'HB', top: 30.6 },
  { text: 'CENTRE', abbr: 'C', top: 50.1 },
  { text: 'HALF FORWARDS', abbr: 'HF', top: 69.6 },
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

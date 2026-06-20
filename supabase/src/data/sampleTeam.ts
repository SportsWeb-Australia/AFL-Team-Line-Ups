/**
 * ──────────────────────────────────────────────────────────────────────────
 * THE ONE FILE A CLUB ADMIN EDITS.
 * ──────────────────────────────────────────────────────────────────────────
 * Everything the widget shows comes from this object. Change names, colours,
 * the round, the bench — nothing else needs touching.
 *
 * Players are listed once in `players`. The `lineup` then references them by
 * id, so a player can only ever appear in one place.
 *
 * ── FUTURE DATA SOURCE ──
 * To go live, replace this static export with a loader that returns the same
 * `TeamSheetData` shape, e.g.:
 *
 *   export async function loadTeamSheet(matchId: string): Promise<TeamSheetData> {
 *     // Zoho Creator:  GET .../report/Lineups?criteria=Match==matchId
 *     // Supabase:      supabase.from('lineups').select(...).eq('match_id', matchId)
 *     // SportsWeb One: GET /api/clubs/:clubId/lineups/:matchId
 *   }
 *
 * The components don't care where the object comes from.
 */
import type { TeamSheetData } from '../types';
import banner1 from '../assets/banner-1.png';
import banner2 from '../assets/banner-2.png';
import banner3 from '../assets/banner-3.png';

export const sampleTeam: TeamSheetData = {
  club: {
    name: 'Riverton Hawks',
    shortName: 'HAWKS',
    logoUrl: null, // drop a logo URL here; falls back to a club-coloured monogram
    primaryColor: '#0c2340', // navy
    secondaryColor: '#f5b301', // gold
    inkColor: '#ffffff',
  },

  match: {
    opponent: 'Hillcrest Cats',
    opponentLogoUrl: null,
    competition: 'Eastern Football Netball League',
    grade: 'Seniors',
    round: 'Round 7',
    date: 'Saturday 20 July',
    time: '2:10 PM',
    venue: 'Riverton Reserve',
  },

  sponsors: {
    rotationMs: 3800,
    rotating: [
      { name: 'Banner 1', bannerUrl: banner1 },
      { name: 'Banner 2', bannerUrl: banner2 },
      { name: 'Banner 3', bannerUrl: banner3 },
    ],
  },

  watermark: true,

  players: [
    { id: 'p1', number: '2', name: 'Jack Reardon' },
    { id: 'p2', number: '14', name: 'Tom Wallis' },
    { id: 'p3', number: '5', name: 'Dylan Cooke' },
    { id: 'p4', number: '23', name: 'Marcus Field' },
    { id: 'p5', number: '7', name: 'Sam Okafor', status: ['vice-captain'] },
    { id: 'p6', number: '11', name: 'Lochie Grant' },
    { id: 'p7', number: '19', name: 'Ben Castellano' },
    { id: 'p8', number: '9', name: 'Will Patterson', status: ['captain'] },
    { id: 'p9', number: '4', name: 'Ari Nguyen' },
    { id: 'p10', number: '21', name: 'Cooper Slade' },
    { id: 'p11', number: '17', name: 'Jye Hammond' },
    { id: 'p12', number: '3', name: 'Eli Brooks' },
    { id: 'p13', number: '26', name: 'Nate Cummings', status: ['milestone'] },
    { id: 'p14', number: '32', name: 'Hugo Marsh' },
    { id: 'p15', number: '8', name: 'Riley Faulkner', status: ['debut'] },
    // Followers
    { id: 'p16', number: '28', name: 'Max Donovan' },
    { id: 'p17', number: '15', name: 'Charlie Vos' },
    { id: 'p18', number: '12', name: 'Theo Park' },
    // Interchange
    { id: 'p19', number: '20', name: 'Beau Salter' },
    { id: 'p20', number: '22', name: 'Isaac Lund' },
    { id: 'p21', number: '34', name: 'Felix Moreau' },
    { id: 'p22', number: '6', name: 'Jordan Ash' },
    // Emergencies
    { id: 'p23', number: '29', name: 'Kai Whitlock' },
    { id: 'p24', number: '31', name: 'Lucas Reid' },
    // Unavailable
    { id: 'p25', number: '41', name: 'Sol Ferraro', status: ['injured'] },
    { id: 'p26', number: '42', name: 'Adrian Vale', status: ['concussion'] },
    { id: 'p27', number: '43', name: 'Beau Nguyen', status: ['personal'] },
    { id: 'p28', number: '44', name: 'Cody Marsh', status: ['suspended'] },
  ],

  lineup: {
    positions: {
      BPL: 'p1', FB: 'p2', BPR: 'p3',
      HBL: 'p4', CHB: 'p5', HBR: 'p6',
      WL: 'p7', C: 'p8', WR: 'p9',
      HFL: 'p10', CHF: 'p11', HFR: 'p12',
      FPL: 'p13', FF: 'p14', FPR: 'p15',
    },
    followers: ['p16', 'p17', 'p18'],
    interchange: ['p19', 'p20', 'p21', 'p22'],
    emergencies: ['p23', 'p24'],
    unavailable: ['p25', 'p26', 'p27', 'p28'],
  },
};

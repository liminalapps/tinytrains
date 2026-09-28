import type { BerlinLine } from './lines.ts';

/** FNV-1a plus a final avalanche, so sequential trip ids spread evenly over [0, 1). */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
}

/**
 * Fleet mixes where a line runs more than one type, [stock, cars, share]. None of the feeds say which
 * vehicle works a trip, so each trip gets a stable pick weighted by the line's fleet mix.
 */
const MIX: Record<string, [string, number, number][]> = {
  // Small profile: 2-car A3 and GI units run as 6-car trains (8 on U2); IK, HK and JK mostly work U2.
  U1: [['berlin-a3l92', 6, 0.45], ['berlin-a3e', 6, 0.2], ['berlin-gi1e', 6, 0.15], ['berlin-ik', 4, 0.2]],
  U2: [['berlin-ik', 8, 0.35], ['berlin-jk', 8, 0.25], ['berlin-hk', 8, 0.2], ['berlin-a3l92', 8, 0.1], ['berlin-gi1e', 8, 0.1]],
  U3: [['berlin-a3l92', 6, 0.45], ['berlin-a3e', 6, 0.2], ['berlin-gi1e', 6, 0.15], ['berlin-ik', 4, 0.2]],
  U4: [['berlin-a3l92', 2, 0.4], ['berlin-a3e', 2, 0.3], ['berlin-ik', 4, 0.3]],
  // Large profile: six-car trains. U5 has the new J and the rebuilt F74s; the H sets moved to U6–U9 in 2026.
  U5: [['berlin-j', 6, 0.35], ['berlin-f74', 6, 0.65]],
  U6: [['berlin-h', 6, 0.35], ['berlin-f90', 6, 0.65]],
  U7: [['berlin-h', 6, 0.35], ['berlin-f90', 6, 0.65]],
  U8: [['berlin-f74', 6, 0.4], ['berlin-h', 6, 0.3], ['berlin-f90', 6, 0.3]],
  U9: [['berlin-f74', 6, 0.5], ['berlin-h', 6, 0.3], ['berlin-f90', 6, 0.2]],
  // S-Bahn: the last BR 480s work S3; the 483/484s cover most of the Ring network, 481s fill in.
  S3: [['berlin-480', 8, 0.6], ['berlin-481', 8, 0.4]],
  S41: [['berlin-483', 8, 0.75], ['berlin-481', 8, 0.25]],
  S42: [['berlin-483', 8, 0.75], ['berlin-481', 8, 0.25]],
  S46: [['berlin-483', 8, 0.75], ['berlin-481', 8, 0.25]],
  S47: [['berlin-483', 6, 0.75], ['berlin-481', 6, 0.25]],
  S8: [['berlin-483', 6, 0.75], ['berlin-481', 6, 0.25]],
  // Trams: long Flexitys on the MetroTram lines, 2.30 m GT6Ns where the southeast tracks are too narrow for them.
  M4: [['berlin-urbanliner', 1, 0.1], ['berlin-flexity', 1, 0.9]],
  M1: [['berlin-flexity', 1, 0.85], ['berlin-flexity-short', 1, 0.15]],
  M2: [['berlin-flexity', 1, 0.85], ['berlin-flexity-short', 1, 0.15]],
  M5: [['berlin-flexity', 1, 0.85], ['berlin-flexity-short', 1, 0.15]],
  M6: [['berlin-flexity', 1, 0.85], ['berlin-flexity-short', 1, 0.15]],
  M8: [['berlin-flexity', 1, 0.85], ['berlin-flexity-short', 1, 0.15]],
  M10: [['berlin-flexity', 1, 0.85], ['berlin-flexity-short', 1, 0.15]],
  M13: [['berlin-flexity', 1, 0.85], ['berlin-flexity-short', 1, 0.15]],
  M17: [['berlin-flexity', 1, 0.7], ['berlin-gt6n', 1, 0.3]],
  '12': [['berlin-flexity-short', 1, 0.5], ['berlin-gt6n', 1, 0.5]],
  '16': [['berlin-flexity', 1, 0.5], ['berlin-gt6n', 1, 0.5]],
  '18': [['berlin-flexity', 1, 0.5], ['berlin-gt6n', 1, 0.5]],
  '21': [['berlin-gt6n', 1, 0.6], ['berlin-flexity-short', 1, 0.4]],
  '27': [['berlin-gt6n', 1, 0.6], ['berlin-flexity-short', 1, 0.4]],
  '37': [['berlin-gt6n', 1, 0.6], ['berlin-flexity-short', 1, 0.4]],
  '50': [['berlin-flexity', 1, 0.6], ['berlin-gt6n', 1, 0.4]],
};

export function pickStock(line: BerlinLine, tripId: string): { stock: string; cars: number } {
  let r = hash(tripId);
  for (const [stock, cars, share] of MIX[line.id] ?? []) {
    if (r < share) return { stock, cars };
    r -= share;
  }
  return { stock: line.stock, cars: line.cars };
}

// Car assignments per line, fall 2026: NYCT's car assignment of May 17, 2026 (ERA Bulletin, June
// 2026), updated with the R211s that reached the D and the Rockaway shuttle since and the shrinking
// R46 fleet. The feeds don't say which car class a trip uses, so mixed lines pick one per trip,
// weighted by rough fleet share. 75 ft cars (R46, R68, R68A) run 8 to a train; 60 ft cars run 10
// (8 on J/Z, L, M and the C's R179s; 5 on the G).

export interface FleetShare {
  stock: string;
  share: number;
  cars: number;
}

const one = (stock: string, cars: number): FleetShare[] => [{ stock, share: 1, cars }];
const JZ: FleetShare[] = [
  { stock: 'nyc-r160', share: 0.55, cars: 8 },
  { stock: 'nyc-r179', share: 0.45, cars: 8 },
];
const NW: FleetShare[] = [
  { stock: 'nyc-r46', share: 0.45, cars: 8 },
  { stock: 'nyc-r68a', share: 0.35, cars: 8 },
  { stock: 'nyc-r68', share: 0.2, cars: 8 },
];

export const FLEET: Record<string, FleetShare[]> = {
  '1': one('nyc-r62a', 10),
  '2': one('nyc-r142', 10),
  '3': one('nyc-r62', 10),
  '4': [
    { stock: 'nyc-r142a', share: 0.52, cars: 10 },
    { stock: 'nyc-r142', share: 0.48, cars: 10 },
  ],
  '5': one('nyc-r142', 10),
  '6': [
    { stock: 'nyc-r62a', share: 0.96, cars: 10 },
    { stock: 'nyc-r62', share: 0.04, cars: 10 },
  ],
  '7': one('nyc-r188', 11),
  GS: one('nyc-r62a', 6),
  A: [
    { stock: 'nyc-r211a', share: 0.84, cars: 10 },
    { stock: 'nyc-r179', share: 0.16, cars: 10 },
  ],
  C: [
    { stock: 'nyc-r211a', share: 0.56, cars: 10 },
    { stock: 'nyc-r179', share: 0.44, cars: 8 },
  ],
  E: one('nyc-r160', 10),
  B: [
    { stock: 'nyc-r211a', share: 0.69, cars: 10 },
    { stock: 'nyc-r68a', share: 0.16, cars: 8 },
    { stock: 'nyc-r68', share: 0.15, cars: 8 },
  ],
  D: [
    { stock: 'nyc-r68', share: 0.8, cars: 8 },
    { stock: 'nyc-r211a', share: 0.2, cars: 10 },
  ],
  F: one('nyc-r160', 10),
  M: [
    { stock: 'nyc-r160', share: 0.76, cars: 8 },
    { stock: 'nyc-r179', share: 0.24, cars: 8 },
  ],
  G: [
    { stock: 'nyc-r211a', share: 0.69, cars: 5 },
    { stock: 'nyc-r211t', share: 0.31, cars: 5 },
  ],
  J: JZ,
  Z: JZ,
  L: [
    { stock: 'nyc-r143', share: 0.88, cars: 8 },
    { stock: 'nyc-r160', share: 0.12, cars: 8 },
  ],
  N: NW,
  Q: [
    { stock: 'nyc-r46', share: 0.4, cars: 8 },
    { stock: 'nyc-r68a', share: 0.35, cars: 8 },
    { stock: 'nyc-r68', share: 0.25, cars: 8 },
  ],
  R: one('nyc-r160', 10),
  W: NW,
  FS: one('nyc-r68', 2),
  H: one('nyc-r211a', 5),
  SI: one('nyc-r211s', 5),
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Deterministic car class for a trip: the same trip always gets the same train. */
export function pickFleet(line: string, key: string): FleetShare {
  const list = FLEET[line] ?? FLEET['1'];
  let r = hash(key) * list.reduce((sum, f) => sum + f.share, 0);
  for (const f of list) {
    if ((r -= f.share) < 0) return f;
  }
  return list[list.length - 1];
}

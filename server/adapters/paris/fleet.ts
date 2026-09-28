// Rolling stock per line, fall 2026 (see shared/stock/paris.ts). The feeds don't say which train runs a trip,
// so mixed fleets are shared out deterministically by trip, in proportion to the number of trains (or units) of each
// type (counts from September 2026). The line 13 MF 77 livery, the RER D/E and T2 splits are estimates.

interface Mix {
  stock: string;
  cars: number;
  share: number;
}

const FLEET: Record<string, Mix[]> = {
  m1: [{ stock: 'paris-mp05', cars: 6, share: 56 }],
  m2: [{ stock: 'paris-mf01', cars: 5, share: 1 }],
  m3: [{ stock: 'paris-mf67', cars: 5, share: 1 }],
  m3b: [{ stock: 'paris-mf67', cars: 3, share: 1 }],
  m4: [
    { stock: 'paris-mp89ca', cars: 6, share: 21 },
    { stock: 'paris-mp14', cars: 6, share: 20 },
    { stock: 'paris-mp05', cars: 6, share: 11 },
  ],
  m5: [{ stock: 'paris-mf01', cars: 5, share: 1 }],
  m6: [{ stock: 'paris-mp89cc', cars: 5, share: 1 }],
  m7: [{ stock: 'paris-mf77', cars: 5, share: 1 }],
  m7b: [{ stock: 'paris-mf88', cars: 3, share: 1 }],
  m8: [{ stock: 'paris-mf77', cars: 5, share: 1 }],
  m9: [{ stock: 'paris-mf01-stif', cars: 5, share: 1 }],
  m10: [
    { stock: 'paris-mf67', cars: 5, share: 28 },
    { stock: 'paris-mf19', cars: 5, share: 6 },
  ],
  m11: [{ stock: 'paris-mp14', cars: 5, share: 1 }],
  m12: [{ stock: 'paris-mf67', cars: 5, share: 1 }],
  m13: [{ stock: 'paris-mf77-jade', cars: 5, share: 1 }],
  m14: [{ stock: 'paris-mp14', cars: 8, share: 1 }],
  // RER trains are usually two coupled units.
  'rer-a': [
    { stock: 'paris-mi09', cars: 10, share: 140 },
    { stock: 'paris-mi2n', cars: 10, share: 42 },
  ],
  'rer-b': [
    { stock: 'paris-mi79', cars: 8, share: 116 },
    { stock: 'paris-mi84', cars: 8, share: 42 },
  ],
  'rer-c': [
    { stock: 'paris-z20500', cars: 10, share: 68 },
    { stock: 'paris-z20900', cars: 8, share: 54 },
    { stock: 'paris-z8800', cars: 8, share: 35 },
    { stock: 'paris-z5600', cars: 8, share: 29 },
  ],
  'rer-d': [
    { stock: 'paris-z20500', cars: 10, share: 70 },
    { stock: 'paris-rerng', cars: 7, share: 30 },
  ],
  'rer-e': [
    { stock: 'paris-rerng', cars: 6, share: 86 },
    { stock: 'paris-mi2n', cars: 5, share: 18 },
    { stock: 'paris-nat', cars: 8, share: 8 },
  ],
  t1: [{ stock: 'paris-citadis305', cars: 1, share: 1 }],
  t2: [
    { stock: 'paris-citadis302', cars: 2, share: 1 },
    { stock: 'paris-citadis302', cars: 1, share: 1 },
  ],
  t3a: [{ stock: 'paris-citadis402', cars: 1, share: 1 }],
  t3b: [{ stock: 'paris-citadis402', cars: 1, share: 1 }],
  t4: [{ stock: 'paris-dualis', cars: 1, share: 1 }],
  t5: [{ stock: 'paris-translohr-ste3', cars: 1, share: 1 }],
  t6: [{ stock: 'paris-translohr-ste6', cars: 1, share: 1 }],
  t7: [{ stock: 'paris-citadis302', cars: 1, share: 1 }],
  t8: [{ stock: 'paris-citadis302', cars: 1, share: 1 }],
  t9: [{ stock: 'paris-citadis405', cars: 1, share: 1 }],
  t10: [{ stock: 'paris-citadis405', cars: 1, share: 1 }],
  t11: [{ stock: 'paris-dualis', cars: 1, share: 1 }],
  t12: [{ stock: 'paris-dualis', cars: 1, share: 1 }],
  t13: [{ stock: 'paris-dualis', cars: 1, share: 1 }],
};

function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function consist(line: string, row: number): { stock: string; cars: number } {
  const mix = FLEET[line];
  let f = hash(row) * mix.reduce((t, m) => t + m.share, 0);
  for (const m of mix) {
    if (f < m.share) return { stock: m.stock, cars: m.cars };
    f -= m.share;
  }
  return { stock: mix[0].stock, cars: mix[0].cars };
}

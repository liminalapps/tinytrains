// Line metadata shared by the build script and the adapters: official colors, bullets and the fleet each line runs.
import type { BulletShape, LineKind } from '../../../shared/types.ts';

/** [stock id, cars, relative share]: the series a line runs and in what proportion. */
export type Fleet = [string, number, number][];

export interface MadridLine {
  id: string;
  system: 'metro' | 'ml' | 'cercanias';
  /** GTFS route_short_name. */
  ref: string;
  name: string;
  short: string;
  color: string;
  textColor: string;
  kind: LineKind;
  bullet: BulletShape;
  fleet: Fleet;
  /** Fleets of branches run as separate services (pattern variant -> fleet). */
  branches?: Record<string, Fleet>;
}

function metro(ref: string, name: string, color: string, fleet: Fleet, branches?: Record<string, Fleet>, textColor = '#FFFFFF'): MadridLine {
  return { id: `m${ref}`, system: 'metro', ref, name, short: ref, color, textColor, kind: 'metro', bullet: 'circle', fleet, branches };
}

function ml(n: number, color: string, fleet: Fleet): MadridLine {
  return { id: `ml${n}`, system: 'ml', ref: `ML${n}`, name: `Metro Ligero ${n}`, short: `ML${n}`, color, textColor: '#FFFFFF', kind: 'light', bullet: 'square', fleet };
}

function cer(ref: string, color: string, fleet: Fleet): MadridLine {
  const short = `C-${ref.slice(1)}`;
  return { id: ref.toLowerCase(), system: 'cercanias', ref, name: `Cercanías ${short}`, short, color, textColor: '#FFFFFF', kind: 'rail', bullet: 'pill', fleet };
}

// Narrow-profile lines (1–5, R) and wide-profile lines (6–12), with the series each ran in fall 2026 and their shares.
const CIVIA: Fleet = [['madrid-civia', 5, 1], ['madrid-civia', 10, 1]];
const MIXED: Fleet = [['madrid-446', 6, 1], ['madrid-450', 6, 1], ['madrid-civia', 5, 1], ['madrid-civia', 10, 1]];
export const LINES: MadridLine[] = [
  metro('1', 'Line 1', '#38A3DC', [['madrid-metro-2000a', 6, 1]]),
  metro('2', 'Line 2', '#E0292F', [['madrid-metro-3000', 4, 1]]),
  metro('3', 'Line 3', '#FFD000', [['madrid-metro-3000', 6, 1]], undefined, '#1A1A1A'),
  metro('4', 'Line 4', '#B65518', [['madrid-metro-3000', 4, 1]]),
  metro('5', 'Line 5', '#95C11F', [['madrid-metro-2000b', 6, 3], ['madrid-metro-3000', 6, 1], ['madrid-metro-2000a', 6, 0.3]]),
  metro('6', 'Line 6 (Circular)', '#9A9999', [['madrid-metro-8400', 6, 1]]),
  metro('7', 'Line 7', '#F59C00', [['madrid-metro-9000', 6, 3], ['madrid-metro-7000', 6, 1]], { B: [['madrid-metro-9000', 3, 1]] }),
  metro('8', 'Line 8', '#F373B7', [['madrid-metro-8000', 4, 1]]),
  metro('9', 'Line 9', '#9D2E83', [['madrid-metro-5000', 6, 1], ['madrid-metro-7000', 6, 1], ['madrid-metro-9000', 6, 1], ['madrid-metro-8400', 6, 1]], { B: [['madrid-metro-6000', 3, 1]] }),
  metro('10', 'Line 10', '#1E4596', [['madrid-metro-7000', 6, 2], ['madrid-metro-9000', 6, 1]], { B: [['madrid-metro-8000', 3, 1], ['madrid-metro-8000', 4, 1]] }),
  metro('11', 'Line 11', '#0F9B48', [['madrid-metro-9000', 3, 1]]),
  metro('12', 'Line 12 (MetroSur)', '#A49A00', [['madrid-metro-8000', 3, 2], ['madrid-metro-9000', 3, 1]]),
  metro('R', 'Ramal Ópera–Príncipe Pío', '#FFFFFF', [['madrid-metro-3000', 4, 1]], undefined, '#005AA9'),
  ml(1, '#3A7DDA', [['madrid-citadis', 1, 1]]),
  ml(2, '#A60084', [['madrid-citadis', 1, 1]]),
  ml(3, '#ED1C24', [['madrid-citadis', 1, 1]]),
  cer('C1', '#75B6E0', CIVIA),
  cer('C2', '#00943D', MIXED),
  cer('C3', '#952585', CIVIA),
  cer('C4', '#2C2A86', [...CIVIA, ['madrid-446', 6, 0.2]]),
  cer('C4a', '#2C2A86', [...CIVIA, ['madrid-446', 6, 0.2]]),
  cer('C4b', '#2C2A86', [...CIVIA, ['madrid-446', 6, 0.2]]),
  cer('C5', '#FECB00', [['madrid-446', 6, 3], ['madrid-446', 3, 1]]),
  cer('C7', '#E5202A', [...MIXED, ['madrid-453', 4, 0.2], ['madrid-453', 8, 0.2]]),
  cer('C8', '#868584', MIXED),
  cer('C8a', '#868584', MIXED),
  cer('C8b', '#868584', MIXED),
  cer('C10', '#BCCF00', [...MIXED, ['madrid-453', 8, 0.2]]),
];

export const LINE_BY_ID = new Map(LINES.map((l) => [l.id, l]));

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  return (h ^ (h >>> 13)) >>> 0;
}

/** The stock and consist of one run, picked deterministically from its line's (or branch's) fleet mix. */
export function fleetFor(line: string, variant: string | undefined, runId: string): { stock: string; cars: number } {
  const l = LINE_BY_ID.get(line);
  const fleet = (variant && l?.branches?.[variant]) || l?.fleet || CIVIA;
  const total = fleet.reduce((s, f) => s + f[2], 0);
  let r = (hash(runId) / 2 ** 32) * total;
  for (const [stock, cars, share] of fleet) if ((r -= share) < 0) return { stock, cars };
  return { stock: fleet[0][0], cars: fleet[0][1] };
}

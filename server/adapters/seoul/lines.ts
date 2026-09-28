import type { BulletShape, LineKind } from '../../../shared/types.ts';

export type Group = 'metro' | 'korail' | 'other';

export interface SeoulLine {
  id: string;
  group: Group; // which adapter polls it
  system: string;
  name: string;
  nameLocal: string;
  short: string;
  color: string;
  kind: LineKind;
  bullet: BulletShape;
  /** Line name in the Seoul OpenAPI realtime feeds. */
  api: string;
  /** OSM route relation names. */
  osm: RegExp;
  /** Default stock and consist length; see `chooseStock` for mixed fleets. */
  stock: string;
  cars: number;
  /** Station pairs (Korean) in the feed's direction 0 (상행, toward central Seoul): a sequence visiting the first before the second runs that way. */
  up: [string, string][];
  /** The feed's direction was checked against observed train movements; route by it when the terminal flips (Ui, Shinbundang). */
  trustUd?: boolean;
  /** Running: top speed km/h, acceleration and braking m/s², scheduled dwell s. */
  vmax: number;
  acc: number;
  dec: number;
  dwell: number;
}

export const SYSTEMS = [
  { id: 'seoul-metro', name: 'Seoul Metro', live: 'realtime' as const },
  { id: 'korail', name: 'Korail Metropolitan', live: 'realtime' as const },
  { id: 'metro9', name: 'Seoul Metro Line 9', live: 'realtime' as const },
  { id: 'neotrans', name: 'Shinbundang Line', live: 'realtime' as const },
  { id: 'arex', name: 'AREX', live: 'realtime' as const },
  { id: 'lrt', name: 'Seoul LRT', live: 'realtime' as const },
];

const L = (
  id: string, group: Group, system: string, name: string, nameLocal: string, short: string, color: string,
  kind: LineKind, api: string, osm: RegExp, stock: string, cars: number, run: [number, number, number, number],
  up: [string, string][], trustUd = false,
): SeoulLine => ({
  id, group, system, name, nameLocal, short, color, kind, bullet: /^\d$/.test(short) ? 'circle' : 'pill', api, osm, stock, cars,
  vmax: run[0], acc: run[1], dec: run[2], dwell: run[3], up, trustUd,
});

export const LINES: SeoulLine[] = [
  L('1', 'metro', 'seoul-metro', 'Line 1', '1호선', '1', '#0052A4', 'subway', '1호선', /^수도권 전철 1호선/, 'seoul-korail-311000', 10, [95, 0.7, 0.8, 30], [['서울역', '시청'], ['금천구청', '독산'], ['구일', '구로'], ['도봉', '도봉산']]),
  L('2', 'metro', 'seoul-metro', 'Line 2', '2호선', '2', '#00A84D', 'subway', '2호선', /^서울 지하철 2호선/, 'seoul-metro-2000', 10, [80, 0.8, 0.9, 30], [['용답', '성수'], ['도림천', '양천구청']]),
  L('3', 'metro', 'seoul-metro', 'Line 3', '3호선', '3', '#EF7C1C', 'subway', '3호선', /^수도권 전철 3호선/, 'seoul-metro-3000', 10, [80, 0.8, 0.9, 30], [['교대', '고속터미널']], true),
  L('4', 'metro', 'seoul-metro', 'Line 4', '4호선', '4', '#00A5DE', 'subway', '4호선', /^수도권 전철 4호선/, 'seoul-metro-4000', 10, [80, 0.8, 0.9, 30], [['사당', '총신대입구'], ['과천', '대공원']], true),
  L('5', 'metro', 'seoul-metro', 'Line 5', '5호선', '5', '#996CAC', 'subway', '5호선', /^서울 지하철 5호선/, 'seoul-metro-5000', 8, [80, 0.85, 0.95, 30], [['여의나루', '여의도'], ['마천', '거여']], true),
  L('6', 'metro', 'seoul-metro', 'Line 6', '6호선', '6', '#CD7C2F', 'subway', '6호선', /^서울 지하철 6호선/, 'seoul-metro-6000', 8, [80, 0.85, 0.95, 30], [['삼각지', '효창공원앞']], true),
  L('7', 'metro', 'seoul-metro', 'Line 7', '7호선', '7', '#747F00', 'subway', '7호선', /^서울 지하철 7호선/, 'seoul-metro-7000', 8, [80, 0.85, 0.95, 30], [['건대입구', '어린이대공원']], true),
  L('8', 'metro', 'seoul-metro', 'Line 8', '8호선', '8', '#E6186C', 'subway', '8호선', /^서울 지하철 8호선/, 'seoul-metro-8000', 6, [80, 0.85, 0.95, 30], [['잠실', '몽촌토성']], true),
  L('9', 'metro', 'metro9', 'Line 9', '9호선', '9', '#BDB092', 'subway', '9호선', /^서울 지하철 9호선/, 'seoul-metro9-9000', 6, [80, 0.8, 0.9, 35], [['당산', '선유도']], true),
  L('suin-bundang', 'korail', 'korail', 'Suin–Bundang Line', '수인분당선', 'SB', '#F5A200', 'subway', '수인분당선', /^수인·분당선/, 'seoul-korail-351000', 6, [90, 0.8, 0.9, 30], [['선릉', '선정릉']], true),
  L('shinbundang', 'other', 'neotrans', 'Shinbundang Line', '신분당선', 'S', '#D4003B', 'subway', '신분당선', /^수도권 전철 신분당선/, 'seoul-shinbundang-d000', 6, [90, 0.9, 1.0, 30], [['강남', '신논현']], true),
  L('gyeongui-jungang', 'korail', 'korail', 'Gyeongui–Jungang Line', '경의중앙선', 'GJ', '#77C4A3', 'rail', '경의중앙선', /^경의·중앙선/, 'seoul-korail-331000', 8, [100, 0.7, 0.8, 30], [['공덕', '서강대'], ['신촌', '가좌']], true),
  L('arex', 'other', 'arex', 'AREX', '공항철도', 'A', '#0090D2', 'rail', '공항철도', /^인천국제공항철도/, 'seoul-arex-2000', 6, [110, 0.8, 0.9, 35], [['공덕', '서울역']], true),
  L('gyeongchun', 'korail', 'korail', 'Gyeongchun Line', '경춘선', 'GC', '#0C8E72', 'rail', '경춘선', /^수도권 전철 경춘선/, 'seoul-korail-361000', 8, [100, 0.7, 0.8, 30], [['망우', '상봉']], true),
  L('ui', 'other', 'lrt', 'Ui LRT', '우이신설선', 'UI', '#B0CE18', 'light', '우이신설선', /^우이신설선/, 'seoul-ui-ul000', 2, [70, 0.9, 1.0, 25], [['보문', '신설동']], true),
  L('sillim', 'other', 'lrt', 'Sillim Line', '신림선', 'SL', '#6789CA', 'light', '신림선', /^서울 경전철 신림선/, 'seoul-sillim-sl000', 3, [60, 0.9, 1.0, 25], [['대방', '샛강']], true),
];

export const LINE_BY_ID = new Map(LINES.map((l) => [l.id, l]));

/** Stations only short trains serve (normalized Korean name -> cars): Line 2's branches, the Gyeongui Seoul Station branch. */
export const SHORT_TRAINS: Record<string, Record<string, number>> = {
  '2': { 신설동: 4, 용두: 4, 신답: 4, 용답: 4, 도림천: 6, 양천구청: 6, 신정네거리: 6, 까치산: 6 },
  'gyeongui-jungang': { 서울: 4, 신촌: 4 },
};

/** Terminals beyond the end of every OSM stopping sequence, routed as the last station on the way there. */
export const TERMINAL_ALIAS: Record<string, string> = { 지평: '용문' };

/** Normalize a Korean station name as the realtime feed and OSM spell it differently. */
export function normName(raw: string): string {
  let s = raw.normalize('NFC').replace(/\s+/g, '').replace(/\(.*?\)|（.*?）|\[.*?\]/g, '');
  s = s.replace(/(종착|지선|순환|방면)$/, '').replace(/(상선|하선|급행|막차)$/, '');
  if (s.length >= 3 && s.endsWith('역')) s = s.slice(0, -1);
  return s;
}

/** Spellings to try for a feed name: '총신대입구(이수)' is 이수 on line 7. */
export function nameKeys(raw: string): string[] {
  const keys = [normName(raw)];
  for (const m of raw.matchAll(/\(([^)]+)\)/g)) keys.push(normName(m[1]));
  return keys;
}

/**
 * Run time in seconds over `d` meters from standstill to standstill: accelerate to vmax, cruise,
 * brake (triangular profile when too short), plus a small timetable margin.
 */
export function runTime(d: number, line: Pick<SeoulLine, 'vmax' | 'acc' | 'dec'>): number {
  const v = line.vmax / 3.6;
  const dAcc = (v * v) / (2 * line.acc), dDec = (v * v) / (2 * line.dec);
  let t: number;
  if (d >= dAcc + dDec) t = v / line.acc + v / line.dec + (d - dAcc - dDec) / v;
  else {
    const vp = Math.sqrt((2 * d * line.acc * line.dec) / (line.acc + line.dec));
    t = vp / line.acc + vp / line.dec;
  }
  return Math.round(t * 1.08 + 8);
}

/** FNV-1a with a final avalanche, so that similar ids ('1.0021', '1.0023') spread evenly. */
const hash = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
};

/**
 * Pick a stock type for a train, stable for its id. Timetable train codes tell the operator: Korail runs 'K…'
 * trains on lines 1 and 4 and '…K' trains on line 3; Seoul Metro's line 1 trains are 'S…'.
 */
export function chooseStock(line: string, key: string, o: { express?: boolean; code?: string } = {}): { stock: string; cars: number } {
  const conf = LINE_BY_ID.get(line)!;
  if (line === 'arex') return { stock: o.express ? 'seoul-arex-1000' : 'seoul-arex-2000', cars: 6 };
  const c = o.code ?? '';
  let mix = STOCK_MIX[line];
  if (c && line === '1') mix = c.startsWith('S') ? [['seoul-metro-1000', 1]] : KORAIL_LINE_1;
  if (c && line === '3') mix = c.endsWith('K') ? [['seoul-korail-3000', 1]] : METRO_LINE_3;
  if (c && line === '4') mix = c.startsWith('K') ? [['seoul-korail-341000', 1]] : [['seoul-metro-4000', 1]];
  if (!mix) return { stock: conf.stock, cars: conf.cars };
  let r = (hash(key) % 1000) / 1000;
  for (const [stock, share] of mix) {
    if (r < share) return { stock, cars: conf.cars };
    r -= share;
  }
  return { stock: mix[mix.length - 1][0], cars: conf.cars };
}

const KORAIL_LINE_1: [string, number][] = [['seoul-korail-311000', 0.5], ['seoul-korail-312000', 0.5]];
const METRO_LINE_3: [string, number][] = [['seoul-metro-3000', 0.7], ['seoul-metro-3000-dawonsys', 0.3]];

/** [stock id, share of trains] per line with more than one train type, for trains without a timetable code. */
export const STOCK_MIX: Record<string, [string, number][]> = {
  '1': [['seoul-korail-311000', 0.43], ['seoul-korail-312000', 0.43], ['seoul-metro-1000', 0.14]],
  '2': [['seoul-metro-2000', 0.7], ['seoul-metro-2000-dawonsys', 0.3]],
  '3': [['seoul-metro-3000', 0.52], ['seoul-metro-3000-dawonsys', 0.23], ['seoul-korail-3000', 0.25]],
  '4': [['seoul-metro-4000', 0.63], ['seoul-korail-341000', 0.37]],
  '5': [['seoul-metro-5000', 0.68], ['seoul-metro-5000-woojin', 0.32]],
  'gyeongui-jungang': [['seoul-korail-331000', 0.56], ['seoul-korail-321000', 0.44]],
};

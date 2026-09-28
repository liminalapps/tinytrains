import type { LineKind } from '../../../shared/types.ts';

export type Group = 'toei' | 'metro' | 'jr' | 'other';

export interface LineConf {
  id: string;
  railway: string; // Mini Tokyo 3D / ODPT railway id
  file: string; // Mini Tokyo 3D timetable file
  group: Group;
  system: string;
  name: string;
  nameLocal: string;
  color: string;
  kind: LineKind;
  stock: string;
  cars: number;
  /** Level for the parts that are not in tunnel: 1 viaduct, 0 at grade. */
  surface: 0 | 1;
  /** Keep only this station range of the Mini Tokyo 3D railway (drops other operators' stops). */
  range?: [string, string];
}

export const SYSTEMS = [
  { id: 'toei', name: 'Toei', live: 'realtime' as const },
  { id: 'tokyo-metro', name: 'Tokyo Metro', live: 'scheduled' as const },
  { id: 'jr-east', name: 'JR East', live: 'scheduled' as const },
  { id: 'yurikamome', name: 'Yurikamome', live: 'scheduled' as const },
  { id: 'tokyo-monorail', name: 'Tokyo Monorail', live: 'scheduled' as const },
  { id: 'twr', name: 'Tokyo Waterfront Area Rapid Transit', live: 'scheduled' as const },
];

const L = (
  id: string, railway: string, file: string, group: Group, system: string, name: string, nameLocal: string,
  color: string, kind: LineKind, stock: string, cars: number, surface: 0 | 1, range?: [string, string],
): LineConf => ({ id, railway, file, group, system, name, nameLocal, color, kind, stock, cars, surface, range });

export const LINES: LineConf[] = [
  L('A', 'Toei.Asakusa', 'toei-asakusa', 'toei', 'toei', 'Asakusa Line', '浅草線', '#E85298', 'subway', 'tokyo-toei-5500', 8, 1),
  L('I', 'Toei.Mita', 'toei-mita', 'toei', 'toei', 'Mita Line', '三田線', '#0079C2', 'subway', 'tokyo-toei-6500', 8, 1),
  L('S', 'Toei.Shinjuku', 'toei-shinjuku', 'toei', 'toei', 'Shinjuku Line', '新宿線', '#6CBB5A', 'subway', 'tokyo-toei-10-300', 10, 1),
  L('E', 'Toei.Oedo', 'toei-oedo', 'toei', 'toei', 'Oedo Line', '大江戸線', '#B6007A', 'subway', 'tokyo-toei-12-600', 8, 1),
  L('SA', 'Toei.Arakawa', 'toei-arakawa', 'toei', 'toei', 'Tokyo Sakura Tram (Arakawa Line)', '東京さくらトラム（都電荒川線）', '#EE86A7', 'tram', 'tokyo-toei-8800', 1, 0),
  L('NT', 'Toei.NipporiToneri', 'toei-nipporitoneri', 'toei', 'toei', 'Nippori-Toneri Liner', '日暮里・舎人ライナー', '#D53A77', 'agt', 'tokyo-toei-330', 5, 1),
  L('G', 'TokyoMetro.Ginza', 'tokyometro-ginza', 'metro', 'tokyo-metro', 'Ginza Line', '銀座線', '#FF9500', 'subway', 'tokyo-metro-1000', 6, 1),
  L('M', 'TokyoMetro.Marunouchi', 'tokyometro-marunouchi', 'metro', 'tokyo-metro', 'Marunouchi Line', '丸ノ内線', '#F62E36', 'subway', 'tokyo-metro-2000', 6, 1),
  L('Mb', 'TokyoMetro.MarunouchiBranch', 'tokyometro-marunouchibranch', 'metro', 'tokyo-metro', 'Marunouchi Line Branch', '丸ノ内線分岐線', '#F62E36', 'subway', 'tokyo-metro-2000', 6, 1),
  L('H', 'TokyoMetro.Hibiya', 'tokyometro-hibiya', 'metro', 'tokyo-metro', 'Hibiya Line', '日比谷線', '#B5B5AC', 'subway', 'tokyo-metro-13000', 7, 1, ['NakaMeguro', 'KitaSenju']),
  L('T', 'TokyoMetro.Tozai', 'tokyometro-tozai', 'metro', 'tokyo-metro', 'Tozai Line', '東西線', '#009BBF', 'subway', 'tokyo-metro-15000', 10, 1),
  L('C', 'TokyoMetro.Chiyoda', 'tokyometro-chiyoda', 'metro', 'tokyo-metro', 'Chiyoda Line', '千代田線', '#00BB85', 'subway', 'tokyo-metro-16000', 10, 1, ['YoyogiUehara', 'KitaAyase']),
  L('Y', 'TokyoMetro.Yurakucho', 'tokyometro-yurakucho', 'metro', 'tokyo-metro', 'Yurakucho Line', '有楽町線', '#C1A470', 'subway', 'tokyo-metro-10000', 10, 1),
  L('Z', 'TokyoMetro.Hanzomon', 'tokyometro-hanzomon', 'metro', 'tokyo-metro', 'Hanzomon Line', '半蔵門線', '#8F76D6', 'subway', 'tokyo-metro-18000', 10, 1),
  L('N', 'TokyoMetro.Namboku', 'tokyometro-namboku', 'metro', 'tokyo-metro', 'Namboku Line', '南北線', '#00AC9B', 'subway', 'tokyo-metro-9000', 8, 1),
  L('F', 'TokyoMetro.Fukutoshin', 'tokyometro-fukutoshin', 'metro', 'tokyo-metro', 'Fukutoshin Line', '副都心線', '#9C5E31', 'subway', 'tokyo-metro-10000', 10, 1),
  L('JY', 'JR-East.Yamanote', 'jreast-yamanote', 'jr', 'jr-east', 'Yamanote Line', '山手線', '#9ACD32', 'rail', 'tokyo-jr-e235', 11, 0),
  L('JC', 'JR-East.ChuoRapid', 'jreast-chuorapid', 'jr', 'jr-east', 'Chuo Line (Rapid)', '中央線快速', '#F15A22', 'rail', 'tokyo-jr-e233', 12, 0),
  L('JB', 'JR-East.ChuoSobuLocal', 'jreast-chuosobulocal', 'jr', 'jr-east', 'Chuo-Sobu Line (Local)', '中央・総武線各駅停車', '#FFD400', 'rail', 'tokyo-jr-e231', 10, 0),
  L('JK', 'JR-East.KeihinTohokuNegishi', 'jreast-keihintohokunegishi', 'jr', 'jr-east', 'Keihin-Tohoku Line', '京浜東北線', '#00B2E5', 'rail', 'tokyo-jr-e233-1000', 10, 0),
  L('U', 'Yurikamome.Yurikamome', 'yurikamome-yurikamome', 'other', 'yurikamome', 'Yurikamome', 'ゆりかもめ', '#0067C0', 'agt', 'tokyo-yurikamome-7300', 6, 1),
  L('MO', 'TokyoMonorail.HanedaAirport', 'tokyomonorail-hanedaairport', 'other', 'tokyo-monorail', 'Tokyo Monorail', '東京モノレール', '#003686', 'monorail', 'tokyo-monorail-10000', 6, 1),
  L('R', 'TWR.Rinkai', 'twr-rinkai', 'other', 'twr', 'Rinkai Line', 'りんかい線', '#00B19D', 'rail', 'tokyo-twr-70-000', 10, 1),
];

export const LINE_BY_ID = new Map(LINES.map((l) => [l.id, l]));
export const LINE_BY_RAILWAY = new Map(LINES.map((l) => [l.railway, l]));

/**
 * Stations that are the same platforms on two railways. Canonical id on the right. Lets through trains
 * (Tozai onto the Chuo-Sobu Local, Marunouchi branch onto the main line) keep one timeline, and merges
 * shared track (Yurakucho/Fukutoshin, Namboku/Mita).
 */
export const STATION_ALIAS: Record<string, string> = {
  'Toei.Oedo.Tochomae.1': 'Toei.Oedo.Tochomae',
  'TokyoMetro.MarunouchiBranch.NakanoSakaue': 'TokyoMetro.Marunouchi.NakanoSakaue',
  'TokyoMetro.Tozai.Nakano': 'JR-East.ChuoSobuLocal.Nakano',
  'Toei.Mita.Meguro': 'TokyoMetro.Namboku.Meguro',
  'Toei.Mita.Shirokanedai': 'TokyoMetro.Namboku.Shirokanedai',
  'Toei.Mita.ShirokaneTakanawa': 'TokyoMetro.Namboku.ShirokaneTakanawa',
  ...Object.fromEntries(
    ['Wakoshi', 'ChikatetsuNarimasu', 'ChikatetsuAkatsuka', 'Heiwadai', 'Hikawadai', 'KotakeMukaihara'].map((s) => [
      `TokyoMetro.Fukutoshin.${s}`,
      `TokyoMetro.Yurakucho.${s}`,
    ]),
  ),
};

export const canonStation = (id: string) => STATION_ALIAS[id] ?? id;

/** Train owner from the Metro/Toei train number suffix (e.g. 'A1017K' on the Chiyoda Line is JR East). */
const SUFFIX_OWNER: Record<string, Record<string, string>> = {
  A: { T: 'Toei', K: 'Keisei', H: 'Keikyu', N: 'Hokuso' },
  I: { T: 'Toei', K: 'Tokyu', G: 'Sotetsu' },
  S: { T: 'Toei', K: 'Keio' },
  H: { S: 'TokyoMetro', T: 'Tobu' },
  T: { S: 'TokyoMetro', K: 'JR-East', T: 'ToyoRapid' },
  C: { S: 'TokyoMetro', K: 'JR-East', E: 'Odakyu' },
  Y: { S: 'TokyoMetro', T: 'Tobu', M: 'Seibu', K: 'Tokyu', G: 'Sotetsu' },
  F: { S: 'TokyoMetro', T: 'Tobu', M: 'Seibu', K: 'Tokyu', G: 'Sotetsu' },
  Z: { S: 'TokyoMetro', K: 'Tokyu', T: 'Tobu' },
  N: { S: 'TokyoMetro', M: 'SaitamaRailway', K: 'Tokyu', G: 'Sotetsu' },
};

export function ownerFromNumber(line: string, n: string): string | undefined {
  // Rinkai: 'T' is a TWR set; otherwise run numbers 80 and up are TWR, lower ones JR (a railfan convention).
  if (line === 'R') {
    const r = n.match(/(\d\d)([A-Z])$/);
    return r ? (r[2] === 'T' || Number(r[1]) >= 80 ? 'TWR' : 'JR-East') : undefined;
  }
  const m = n.match(/\d([A-Z]+)[a-z\d]*$/);
  if (!m) return undefined;
  return SUFFIX_OWNER[line]?.[m[1][0]];
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/** Pick from weighted options, stable for a given key. */
function pick<T>(key: string, options: [T, number][]): T {
  const total = options.reduce((s, [, w]) => s + w, 0);
  let r = hash(key) * total;
  for (const [v, w] of options) if ((r -= w) < 0) return v;
  return options[options.length - 1][0];
}

type Choice = { stock: string; cars: number };

/**
 * Rolling stock for a train. `owner` comes from the live feed (odpt:trainOwner) or the train number suffix,
 * `vehicle` from the timetable (limited expresses), `cars` from the live feed when known.
 * Mixed fleets are split by a stable hash of the train id, weighted roughly by fleet size.
 */
export function chooseStock(o: { line: string; key: string; owner?: string; type?: string; vehicle?: string; n?: string; cars?: number }): Choice {
  const line = LINE_BY_ID.get(o.line);
  const c = (stock: string, cars: number): Choice => ({ stock, cars: o.cars && o.cars > 0 ? o.cars : cars });
  if (o.vehicle === 'E353') return c('tokyo-jr-e353', 12);
  if (o.vehicle === 'E257-500') return c('tokyo-jr-e257-500', 10);
  if (o.vehicle === '60000') return c('tokyo-odakyu-60000', 10);
  const owner = o.owner;
  const k = o.key;
  switch (o.line) {
    case 'A':
      if (owner === 'Keisei') return c(o.type === 'Toei.AccessExpress' ? pick(k, [['tokyo-keisei-3100', 7], ['tokyo-keisei-3000', 3]]) : pick(k, [['tokyo-keisei-3000', 3], ['tokyo-keisei-3100', 1]]), 8);
      if (owner === 'Keikyu') return c(pick(k, [['tokyo-keikyu-1000', 4], ['tokyo-keikyu-600', 1]]), 8);
      if (owner === 'Hokuso') return c('tokyo-hokuso-7500', 8);
      return c('tokyo-toei-5500', 8);
    case 'I':
    case 'N':
      if (owner === 'Tokyu') return c(pick(k, [['tokyo-tokyu-3000', 1], ['tokyo-tokyu-5080', 1]]), 8);
      if (owner === 'Sotetsu') return c('tokyo-sotetsu-21000', 8);
      if (o.line === 'N') return owner === 'SaitamaRailway' ? c('tokyo-saitama-2000', 6) : c('tokyo-metro-9000', pick(k, [[6, 18], [8, 5]]));
      if (o.cars === 6) return c('tokyo-toei-6300', 6);
      if (o.cars === 8) return c('tokyo-toei-6500', 8);
      return pick(k, [[c('tokyo-toei-6500', 8), 13], [c('tokyo-toei-6300', 6), 11]]);
    case 'S':
      if (owner === 'Keio') return c(pick(k, [['tokyo-keio-9000', 3], ['tokyo-keio-5000', 2]]), 10);
      return c('tokyo-toei-10-300', 10);
    case 'E':
      return c(pick(k, [['tokyo-toei-12-600', 9], ['tokyo-toei-12-000', 11]]), 8);
    case 'SA':
      return c(pick(k, [['tokyo-toei-8800', 10], ['tokyo-toei-8900', 8], ['tokyo-toei-7700', 7], ['tokyo-toei-9000', 2]]), 1);
    case 'H':
      if (owner === 'Tobu' || o.type === 'TokyoMetro.TH-LINER') return c('tokyo-tobu-70000', 7);
      return c('tokyo-metro-13000', 7);
    case 'T':
    case 'JB':
      if (owner === 'JR-East' && o.line === 'T') return c('tokyo-jr-e231-800', 10);
      if (owner === 'ToyoRapid') return c('tokyo-toyo-2000', 10);
      if (owner === 'TokyoMetro') return c(pick(k, [['tokyo-metro-15000', 16], ['tokyo-metro-05', 27]]), 10);
      return o.line === 'T' ? c('tokyo-jr-e231-800', 10) : c('tokyo-jr-e231', 10);
    case 'C':
      if (owner === 'JR-East') return c('tokyo-jr-e233-2000', 10);
      if (owner === 'Odakyu') return c('tokyo-odakyu-4000', 10);
      if (o.n && /S\d$/.test(o.n)) return c('tokyo-metro-05', 3);
      return c('tokyo-metro-16000', 10);
    case 'Y':
    case 'F':
      if (o.type === 'TokyoMetro.S-TRAIN') return c('tokyo-seibu-40000', 10);
      if (owner === 'Tobu') return c(pick(k, [['tokyo-tobu-50070', 3], ['tokyo-tobu-9000', 2]]), 10);
      if (owner === 'Seibu') return c(pick(k, [['tokyo-seibu-40000', 1], ['tokyo-seibu-6000', 1]]), 10);
      if (owner === 'Tokyu') return c('tokyo-tokyu-5050', 10);
      if (owner === 'Sotetsu') return c('tokyo-sotetsu-20000', 10);
      return c(pick(k, [['tokyo-metro-10000', 36], ['tokyo-metro-17000', 21]]), 10);
    case 'Z':
      if (owner === 'Tokyu') return c('tokyo-tokyu-2020', 10);
      if (owner === 'Tobu') return c('tokyo-tobu-50050', 10);
      return c('tokyo-metro-18000', 10);
    case 'R':
      if (owner === 'JR-East') return c('tokyo-jr-e233-7000', 10);
      if (owner === 'TWR') return c(pick(k, [['tokyo-twr-70-000', 1], ['tokyo-twr-71-000', 1]]), 10);
      return c('tokyo-jr-e233-7000', 10);
  }
  return c(line?.stock ?? 'tokyo-jr-e235', line?.cars ?? 10);
}

/** Owner key from an ODPT id like 'odpt.TrainOwner:JR-East'. */
export const ownerFromOdpt = (v: unknown) => (typeof v === 'string' ? v.replace(/^odpt\.TrainOwner:/, '') : undefined);

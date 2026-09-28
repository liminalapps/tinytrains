import { readJson } from '../../data.ts';

/** A stopping sequence from OSM: station indices inside the bbox, '~name' (normalized Korean) outside it. */
export interface NetVariant {
  seq: (number | string)[];
  loop?: boolean; // circle line, first stop == last stop
  ud?: 0 | 1; // feed direction (updnLine) for loops: 0 inner, 1 outer
}

/** One simulated service pattern in one direction. */
export interface NetPattern {
  id: string;
  st: number[]; // station indices inside the bbox, in travel order
  stop?: number[]; // 1 = stops, 0 = passes (express); absent = stops everywhere
  t: number[]; // [a0, d0, a1, d1, ...] seconds from the departure at st[0]
  dest: string; // normalized Korean name of the real terminal (may lie outside the bbox)
  share: number; // weight among the patterns of its group, in units of the line headway
  group: string; // patterns of a group take turns on one departure sequence (one direction of one service)
  express?: boolean;
  loop?: boolean;
}

export interface DayService {
  first: number; // first and last departure, seconds after the service day's midnight (KST); last may exceed 86400
  last: number;
  hw: number[]; // headway in minutes by hour of day (index 0..25), for the whole line in one direction
}

export interface NetLine {
  index: Record<string, number>; // normalized Korean station name -> station index
  variants: NetVariant[];
  run: Record<string, number>; // 'i>j' with i < j -> run time in seconds between two stations served consecutively
  /**
   * Express stops by terminal ('*' = any): where expresses stop (or, with `nonstop`, only pass as timing points),
   * and the stretch those stops describe; elsewhere expresses stop everywhere.
   */
  express?: Record<string, { stops: number[]; cover: number[] }>;
  nonstop?: boolean;
  shortCars?: Record<string, number>; // station index -> cars, for stations only short trains serve
  service: { wd: DayService; we: DayService };
  groupService?: Record<string, { wd: DayService; we: DayService }>; // own headways for some pattern groups
  patterns: NetPattern[];
}

export interface NetworkData {
  built: string;
  stations: string[];
  names: Record<string, [string, string]>; // normalized Korean name -> [English, Korean]
  lines: Record<string, NetLine>;
}

let shared: NetworkData | undefined;
export const network = () => (shared ??= readJson<NetworkData>('server/data/seoul/network.json'));

export const runKey = (a: number, b: number) => (a < b ? `${a}>${b}` : `${b}>${a}`);

/** Consist length of a train calling at these stations, when it is one of the line's short trains. */
export const shortCars = (L: NetLine, stations: number[]) =>
  L.shortCars ? stations.map((s) => L.shortCars![s]).find((c) => c !== undefined) : undefined;

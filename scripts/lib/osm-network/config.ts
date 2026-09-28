// Config interface of the sim kit (docs/KIT_SIM.md). Stable: new fields are only ever optional.
import type { BulletShape, CityId, LineKind } from '../../../shared/types.ts';

export interface SimCityConfig {
  city: CityId;
  systems: { id: string; name: string }[];
  lines: SimLineConfig[];
  calendar: SimCalendar;
  stations?: StationRules;
  names?: NameRules;
  attribution?: string[]; // '© OpenStreetMap contributors' is always added
  /** Area for the OSM queries; default: the city bbox grown by 0.15° so terminals outside it still get names. */
  queryBbox?: [number, number, number, number];
}

export interface SimLineConfig {
  id: string; // unique in the city; TrainState.line
  system: string; // one of SimCityConfig.systems[].id
  name: string; // English: 'Sokolnicheskaya Line'
  nameLocal?: string; // 'Сокольническая линия'
  short: string; // bullet text, 1–3 chars
  color: string; // official '#RRGGBB'
  textColor?: string; // default: black or white by the color's luminance
  bullet: BulletShape;
  kind: LineKind;
  osm: OsmLineSource;
  run: RunModel;
  service: DayServices; // the line's headways, per direction
  /** Pattern groups that keep their own headways (a branch shuttle, an express), keyed by PatternConfig.group. */
  groups?: Record<string, DayServices>;
  patterns: PatternConfig[];
  stock: StockShare[]; // at least one; ids from shared/stock/<city>.ts
  /** Direction labels for trains running a pattern forward (from → to) and in reverse: ['Northbound', 'Southbound']. */
  directions?: [string, string];
}

export interface OsmLineSource {
  relations?: number[]; // type=route relation ids: every direction and branch you want
  masters?: number[]; // type=route_master ids: all their member routes are used
  /** Regex sources matched against the tags of route relations in the query bbox, e.g. { route: 'subway', ref: '^1$', network: 'Московский метрополитен' }. */
  match?: { route?: string; ref?: string; name?: string; network?: string; operator?: string };
  /**
   * Fallback when the relations are missing or have no stop members: ordered station names, one list per
   * branch and direction (a reverse list is added for you). Stations are found by name among OSM station nodes.
   */
  sequences?: string[][];
}

export interface RunModel {
  vmax: number; // km/h, top speed between stations
  acc?: number; // m/s², default 0.9
  dec?: number; // m/s², default 1.0
  dwell: number; // seconds at a normal stop
  dwellInterchange?: number; // seconds at stations of 2+ lines, default dwell + 10
  margin?: number; // multiplier on pure running time, default 1.08
  /** Scale every run time so this published end-to-end time is met (preferred when you know one). */
  trip?: { from: string; to: string; minutes: number };
  /** Exact hop times in seconds, keyed 'A|B' by station names (either order). */
  runTimes?: Record<string, number>;
}

export interface DayServices {
  weekday: DayService;
  saturday?: DayService | null; // default: sunday, else weekday; null: no service on Saturdays
  sunday?: DayService | null; // Sundays and holidays; default: saturday, else weekday; null: no service
}

export interface DayService {
  first: string; // 'HH:MM', first departure from each terminal
  last: string; // last departure; a time before calendar.dayStart is after midnight ('00:45')
  /**
   * Headway in minutes (per direction) from each time on: [['05:30', 6], ['07:00', 2], ['10:00', 3], ['20:00', 4]].
   * 0 means no departures until the next band: [['07:00', 6], ['09:30', 0], ['17:00', 6], ['19:30', 0]] runs the peaks only.
   */
  headways: [string, number][];
  /** First/last departure overrides per departure terminal, keyed by station name. */
  terminals?: Record<string, { first?: string; last?: string }>;
}

export interface PatternConfig {
  /** Station names (local or English, as in OSM). A terminal may lie outside the map: trains enter and leave it. */
  from: string;
  to: string;
  via?: string[]; // stations that pick the branch or the sequence (or which loop, where a line has two)
  share: number; // weight within the group; the group's shares add up to its frequency in units of the headway
  group?: string; // patterns of a group take turns on one evenly spaced departure sequence; default 'main'
  oneWay?: boolean; // no reverse pattern (one-way loop legs)
  /** Circle line: from === to; one pattern per loop direction OSM maps (dir 'Clockwise' / 'Counterclockwise'). */
  loop?: boolean;
  express?: string[]; // the stops of an express (it passes the others); the terminals are always stops
  service?: [string, string?]; // service label [English, local]: ['Express', 'Экспресс']
  dest?: [string, string?]; // destination shown instead of the terminal's name
  /** Loops: destination per direction instead of 'Clockwise' / 'Counterclockwise', e.g. { Clockwise: ['Inner Loop', '内圈'] }. */
  loopDest?: { Clockwise?: [string, string?]; Counterclockwise?: [string, string?] };
  stock?: StockShare[]; // this pattern's own stock mix (a short branch run with shorter trains)
  /** Station where the group's departures are evenly spaced (default: the first station all its patterns share). */
  align?: string;
}

export interface StockShare {
  stock: string;
  share?: number; // default: equal shares
  cars: number;
}

export interface SimCalendar {
  holidays: string[]; // 'YYYY-MM-DD' running the Sunday service; cover 2026 and 2027
  workdays?: string[]; // weekend dates running the weekday service (China's adjusted working days)
  weekend?: number[]; // days of the week (0 = Sunday) that are not weekdays; default [0, 6]
  dayStart?: string; // service-day boundary, default '03:00'
}

export interface StationRules {
  mergeDistance?: number; // same-name platforms of different lines within this many meters are one station (default 650)
  splitDistance?: number; // a platform farther than this from the merged point stays its own station (default 160)
  merge?: string[][]; // differently named platforms that form one station: [['Охотный Ряд', 'Театральная', 'Площадь Революции']]
  rename?: Record<string, [string, string?]>; // station name → [English, local] display override
}

export interface NameRules {
  local?: string[]; // OSM tags for nameLocal, in order (default ['name'])
  en?: string[]; // OSM tags for the English name, in order (default ['name:en'])
  transliterate?: 'cyrillic'; // fallback when no English tag; otherwise the local name is used
  loop?: [string, string]; // local destination labels for circle trains: [clockwise, counterclockwise]
}

# Sim kit: OSM network + simulated trains

Use this kit for a city that publishes no usable timetable. It builds the network from OpenStreetMap route relations and
simulates trains from researched headways. The kit owner is seoul-data. **Ask by message for changes; don't edit kit files.**
The interface below is stable: new fields will only ever be optional.

- Build side: `scripts/lib/osm-network/` (`buildSimCity(config)`). It fetches OSM through Overpass (with a cache and
  mirror fallback), builds stations, stopping sequences, track geometry and levels, resolves your service patterns, and
  writes `public/data/<city>/transit.json` and `server/data/<city>/sim.json`.
- Runtime: `server/adapters/sim/` (`simAdapters(city, groups)`). It reads `server/data/<city>/sim.json` and turns the
  headways into trains (`live: false`).
- Check: `scripts/lib/osm-network/check.ts` (`checkSimCity(city)`) prints the standard report.

## Files per city

```ts
// scripts/build-<city>.ts
import { buildSimCity } from './lib/osm-network/index.ts';
await buildSimCity({ city: 'moscow', systems: [...], lines: [...], calendar: {...} });

// scripts/check-<city>.ts
import { checkSimCity } from './lib/osm-network/check.ts';
await checkSimCity('moscow');

// server/adapters/<city>/index.ts
import type { AdapterFactory } from '../types.ts';
import { simAdapters } from '../sim/index.ts';
export const createAdapters: AdapterFactory = () =>
  simAdapters('moscow', [
    { id: 'moscow-metro', name: 'Moscow Metro · simulated from published intervals', lines: ['1', '2', /* … */] },
    { id: 'moscow-mcc', name: 'MCC · simulated from published intervals', lines: ['14'] },
  ]);
```

The runtime reads only `server/data/<city>/sim.json`; report that file to team-lead for `CITY_DATA`. Downloads are cached
under `.cache/<city>/osm/`, so rebuilds are fast; delete that folder to refetch. The bbox-wide queries (stations, tracks,
the relation search) are cached per bbox, so widening a city's bbox refetches them.

A city with a realtime feed of its own can still use the kit for its network and fallback trains. In its own adapter,
use `SimCity.load(city).simulate(lineIds, nowSec)`.

## Config interface

This interface is exported from `scripts/lib/osm-network/config.ts`.

```ts
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
   * branch and direction (a reverse list is added for you). Each name resolves against the line's own relation
   * stops first, then any fetched route's stop members, then station nodes; among namesakes it takes the one nearest
   * the previous stop (for the first stop, the one nearest the next stop's namesakes). Through services whose partner
   * relation has no stops can list the whole run here alongside `relations`.
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
  express?: string[]; // the stops of an express (it passes the others); the terminals are always stops. Where it runs
                      // off the map, its timeline ends at the edge station, which it passes unless listed
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
```

## How it behaves

- **Station matching.** Names in patterns, `trip`, `runTimes`, `merge` and `terminals` match the OSM `name`, `name:en`
  and your `names.local` tags. The match ignores case, spaces, text in parentheses, invisible format marks (U+200E and
  the like), the suffixes "station", "станция" and "站", and the prefixes "станция"/"метро" and "محطة"/"مترو".
- **Stations.** A station's position is the mean of its line's stop positions. Same-name stations of different lines
  merge (see `StationRules`). Station ids are slugs of the English name.
- **Track.** Geometry comes from the ways of the line's relations; gaps are bridged through every other rail way in the
  bbox. Levels come from the `tunnel`, `bridge` and `layer` tags (-1 tunnel, 0 at grade, 1 viaduct).
- **Departures.** Each group runs one evenly spaced departure sequence per direction, at the headway divided by the sum
  of its shares. Its patterns take turns in proportion to their shares, so branches alternate. Different groups are
  staggered across the headway: a line's n-th group (in pattern order, counting from 0) of N starts n/N of its own
  headway after `first`. So a second group with its own hourly `groups` service first leaves 30 minutes after its
  `first`; set `first` half an hour early to get departures on the hour.
- **Timelines.** Trips run over the longest stretch of the pattern inside the map, timed by the run model (or
  `trip`/`runTimes`). A stretch bridges up to 2 stops that lie within 1.5 km outside the map (a line grazing the edge),
  and a stop just outside whose station is on the map (its other platform is inside) counts as that station. A train
  dwells 40 s at its terminal before disappearing; where an express only passes the edge station, it doesn't.
- **Identity and labels.** Train ids are `line.pattern.MM-DD.startMinute`. `dest`/`destLocal` is the real terminal,
  even outside the map. Stock comes from the line's mix and stays stable for each train id.
- **Calendar.** Uses the city's timezone from `shared/cities.ts`. Holidays run the Sunday service.

## What to send team-lead

Your adapter ids, the data file `server/data/<city>/sim.json`, and the numbers from the check.

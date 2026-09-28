# GTFS kit

Owner: paris-data. Turns a static GTFS feed plus a small per-city config into `public/data/<city>/transit.json` and a
packed timetable `server/data/<city>/schedule.json`, and runs it with a generic timetable adapter that can take a
realtime overlay (GTFS-realtime TripUpdates / VehiclePositions, or your own bespoke source). It is Paris's pipeline,
generalized: the same service-day handling, clipping, station clustering, shape slicing, OSM levels, realtime matching
and poll-to-poll smoothing.

**This interface is stable.** Ask paris-data by message for anything missing; don't edit kit files.

- Build side: `scripts/lib/gtfs/` → `import { buildGtfsCity } from './lib/gtfs/index.ts'`
- Runtime side: `server/adapters/gtfs/` → `import { gtfsAdapters, gtfsRealtime } from '../gtfs/index.ts'`
- Examples: `scripts/build-vienna.ts`, `scripts/build-amsterdam.ts`, `server/adapters/{vienna,amsterdam}/index.ts`

## 1. Build script: `scripts/build-<city>.ts`

```ts
import { buildGtfsCity } from './lib/gtfs/index.ts';

await buildGtfsCity({
  city: 'amsterdam',
  feeds: [{ id: 'nl', url: 'https://gtfs.ovapi.nl/nl/gtfs-nl.zip' }],
  systems: [
    { id: 'metro', name: 'Metro', live: 'realtime' },
    { id: 'tram', name: 'Tram', live: 'realtime' },
  ],
  lines: [
    { id: 'm50', system: 'metro', match: { agency: 'GVB', routeType: 1, shortName: '50' },
      name: 'Metro 50', short: '50', kind: 'metro', bullet: 'circle',
      stock: [{ stock: 'amsterdam-m5', cars: 6, share: 3 }, { stock: 'amsterdam-m7', cars: 6, share: 1 }] },
    // ...
  ],
  // Bulk-define lines from routes instead of (or as well as) listing them:
  routes: { match: { agency: 'GVB', routeType: 0 }, line: (r) => ({ id: `t${r.route_short_name}`, system: 'tram',
    name: `Tram ${r.route_short_name}`, short: r.route_short_name, kind: 'tram', bullet: 'square', stock: 'amsterdam-15g' }) },
  stations: { maxSpread: 120 },
  realtimeKeys: true, // store trip keys so GTFS-RT TripUpdates can match by trip_id
  attribution: ['Timetables: OVapi / NDOV', 'Track levels © OpenStreetMap contributors'],
});
```

Run `npx tsx scripts/build-<city>.ts [--refresh] [--debug]`. Downloads and caches under `.cache/<city>/`
(`--refresh` re-downloads the feed and re-queries Overpass). It prints stations/segments/trips, geometry fallbacks and
far segment ends; `--debug` prints every one.

### `GtfsCityConfig`

| field | meaning |
|---|---|
| `city` | `CityId`. Timezone, bbox and projection come from `shared/cities.ts`. |
| `feeds` | `FeedConfig[]`, one or more static feeds. With several feeds, GTFS ids are namespaced by feed id internally. |
| `systems` | `SystemDef[]` for transit.json. `name`'s first word must appear in the adapter name (the UI matches on it). |
| `lines` | `LineConfig[]`, explicit lines (preferred for metros: fixed ids, colors, stock). |
| `routes?` | `{ match: RouteMatch; line(route): LineConfig-without-match \| null }`: define lines in bulk (tram/bus-like networks). Routes already claimed by `lines` are skipped. Lines with the same id merge. |
| `stations?` | `StationConfig`, see below. |
| `geometry?` | `GeometryConfig`, see below. |
| `clip?` | `'bbox'` (default: trips are cut to the runs of stops inside the city bbox) or `(lon, lat) => boolean`. |
| `trips?` | `TripHooks`, per-trip overrides, see below. |
| `realtimeKeys?` | `true` stores each trip's `trip_id` (or `trips.rtKey(t)`) so a TripUpdates feed can match by id. Costs ~15–25 bytes/trip. Leave off for timetable-only cities. |
| `days?` | Only keep service dates in this window, e.g. `{ from: -1, to: 35 }` days around today (default: whole feed). Use it for feeds with a year of calendar_dates. |
| `attribution` | Strings for the credits. Add `'Track levels © OpenStreetMap contributors'` when levels/OSM geometry are on. |
| `out?` | `{ transit?, schedule? }` paths, default `public/data/<city>/transit.json`, `server/data/<city>/schedule.json`. |

### `FeedConfig`

```ts
{ id: 'wl', url: 'https://…/gtfs.zip', headers?: { 'x-api-key': … }, file?: 'wl.zip' }
```
With several feeds, `schedule.stops` / `schedule.routes` also hold `feed|id` keys; pass `feed: '<id>'` to
`gtfsRealtime` so its ids resolve in the right feed. `url` may also be a local path (e.g. a manually downloaded feed in `.cache/<city>/`). Feeds are unzipped with the system
`unzip`, and `stop_times.txt` is streamed (1 GB feeds are fine), with a filtered copy cached for fast reruns.
`frequencies.txt` trips are expanded into individual trips; missing stop times (non-timepoints) are interpolated by
distance.

### `LineConfig`

```ts
{
  id: 'u1',                       // LineDef.id, unique in the city
  system: 'ubahn',                // SystemDef.id
  match: RouteMatch,              // which GTFS routes make up the line (all given conditions must hold)
  name: 'U1', nameLocal?: '…', short: '1',
  color?: '#E20210', textColor?: '#FFFFFF',   // default: route_color / route_text_color (build fails if neither)
  kind: 'metro', bullet: 'square',
  stock: 'vienna-v' | StockMix[],             // default stock = first entry; mixes are shared out by trip
  osm?: ['subway'],               // OSM railway=* values of this line's track (levels + OSM geometry); default by kind
  osmRelations?: [2853012],       // OSM route relations: routing and levels use only their ways (lines stacked on
                                  // top of each other don't snap to the other line's track)
  geometry?: 'auto' | 'shapes' | 'osm' | 'straight',   // default from GeometryConfig
}
RouteMatch = { feed?, routeId?: string | string[], shortName?: string | string[] | RegExp, longName?: RegExp,
               routeType?: number | number[], agency?: string | RegExp /* agency_id or agency_name */,
               test?: (route: Row) => boolean }
StockMix = { stock: string; cars: number; share?: number /* default 1 */ }
```
Default OSM kinds: metro/subway → `subway, rail, light_rail`; rail → `rail`; light → `light_rail, tram, subway`;
tram → `tram, light_rail`; monorail → `monorail`; agt → `monorail, light_rail, subway`; cable → `funicular, narrow_gauge`.
Extended route types (400 metro, 900 tram, 109 suburban rail…) are normalized to the basic ones before matching.

### `StationConfig`

```ts
{
  idPrefix?: 'vie',                // station ids are `${idPrefix}:${key}`; default the city id
  group?: 'parent' | 'name' | ((stop: Row) => string),
                                   // default 'parent': stops group under parent_station; stops without one group by
                                   // normalized name (within 400 m). A function returns your own grouping key.
  maxSpread?: 120,                 // m: within a group, lines whose platforms lie further apart become separate
                                   // stations ('<key>', '<key>b', …), so segment ends stay close to their station
  name?: (name, stop) => string,   // clean names (strip ' - RER', 'Station', platform suffixes…)
  nameLocal?: (name, stop) => string | undefined,
}
```
Stations are finally placed at the mean of their track ends, so segments meet them even when a stop point sits between
two platforms.

### `GeometryConfig`

```ts
{
  source?: 'auto' | 'shapes' | 'osm' | 'straight',  // default 'auto'
  levels?: true,           // el[] from OSM tunnel/bridge/layer tags (Overpass, cached)
  overpass?: string,       // custom Overpass QL body if the default railway query misses your track
  snap?: 150,              // m: max stop-to-track distance accepted
  variants?: 'keep',       // default 'merge': fold parallel geometry variants of a station pair into the most-used
                           // one when they share a line or are the same kind (no 'fan of ribbons'); tram variants
                           // (one-way streets, diversions) always stay
  mergeWithin?: 150,       // m: only merge variants running within this distance of each other (separate
                           // alignments such as a different tunnel stay). A variant of the same line > 1.8x and
                           // > 1 km longer than the kept one (shape running into a turnback loop) is always folded.
}
```
`auto`: GTFS shapes where they fit the stops; otherwise a shortest path over OSM track of the line's kinds; otherwise a
straight line (reported). Use `osm` for feeds whose shapes are straight lines or missing.

### `TripHooks` (all optional, all build-time)

`TripInfo = { feed, route, trip (trips.txt row), line, stops: { stopId, station, name, a, d }[] (clipped),
allStops (unclipped, with names), skips (true when the trip passes stations other trips of the line serve) }`

| hook | default |
|---|---|
| `keepTrip({ feed, route, trip, stopIds }) => boolean` | keep all. Runs first, on the raw trip, before stations are built: drop replacement buses on rail routes here so their stops don't become stations |
| `keep(t) => boolean` | keep all (later filter with the full TripInfo; stations already exist by then) |
| `dest(t)`, `destLocal(t)` | `trip_headsign` (cleaned by `stations.name`), else the (unclipped) last stop's name |
| `dir(t)` | compass along the line's main axis: 'Eastbound' / 'Westbound' / 'Northbound' / 'Southbound' (also when the hook returns undefined; same for `dest`) |
| `destAt(t, i)`, `dirAt(t, i)` | signs that change along the trip, from stop i of `t.stops` onward (loop services: 'Loop' then 'Kimball'). destAt defaults to `stop_headsign` when it varies along the trip. The train keeps one id; the adapter shows the sign for its current stop |
| `service(t)`, `serviceLocal(t)` | none (e.g. `t.skips ? 'Express' : undefined`) |
| `label(t)` | none (e.g. `t.trip.trip_short_name` for train numbers) |
| `consist(t) => StockMix` | the line's mix (e.g. read a vehicle type or train length from the feed) |
| `rtKey(t)` | `trip_id` (only stored with `realtimeKeys`) |
| `chainBlocks: true \| minutes` | off. Joins trips of one block_id + service + line when the next starts at the station the previous ended within 15 min (or the given minutes): through-running split at a terminus stays one train, its sign switching at the junction; the follow-on trip's realtime key still maps to it |

Lines appear in transit.json in config order: `lines` first, then `routes`-defined lines in natural order of `short`.

### Output
- `transit.json`: systems, lines, stations (placed on track), segments from real geometry with `el`, compact.
- `schedule.json`: patterns + run-time profiles + flat trip rows + calendars + fleet mixes + GTFS `stop_id` → station
  map (+ trip keys). Budget: 10 MB; Paris (97k trips) packs to 3.1 MB. Use `days` or fewer lines if you're over.

## 2. Adapter: `server/adapters/<city>/index.ts`

```ts
import type { AdapterFactory } from '../types.ts';
import { gtfsAdapters, gtfsRealtime } from '../gtfs/index.ts';

export const createAdapters: AdapterFactory = (env) => {
  const rt = gtfsRealtime({
    name: 'OVapi GTFS-realtime',
    tripUpdates: 'https://gtfs.ovapi.nl/nl/tripUpdates.pb',
    vehiclePositions?: 'https://…/vehiclePositions.pb',
    headers?: {}, everyMs: 30_000, perMinute?: 20,
    filter?: (routeId, tripId) => boolean,   // cheap pre-filter while decoding big national feeds
  });
  return gtfsAdapters({
    city: 'amsterdam',
    schedule: 'server/data/amsterdam/schedule.json',
    adapters: [
      { id: 'amsterdam-metro', name: 'Metro', systems: ['metro'], realtime: rt },
      { id: 'amsterdam-tram', name: 'Tram', systems: ['tram'], realtime: rt },   // one shared source = one fetch
    ],
  });
};
```
Adapter names read `Metro · OVapi GTFS-realtime` while realtime data is fresh and `Metro · timetable` otherwise, and
`live` follows the same rule. Options per adapter: `lines?: string[]` instead of `systems`, `intervalMs` (default 30 s),
`match?: 'key' | 'time' | 'both'` (default `'both'`: trip key first, then line + stations + times), `dropUnmatched?:
'auto' | 'never'` (default `'auto'`: when ≥ 50 % of a line's running trips have realtime, the rest are assumed cancelled).

The data file your adapters read is just `server/data/<city>/schedule.json`; list it in your report.

### Timetable behavior (no realtime)
Service day in the city's timezone (GTFS noon-minus-12h rule, DST-safe), `calendar` + `calendar_dates`, trips past
midnight from yesterday's service day. Past the feed's last date (or before its first) the same weekday of the nearest
covered week stands in, so the city keeps running until the data is rebuilt. Trains appear when they leave their
origin, vanish at their terminus; timelines are the previous stop + 15 upcoming stops.

### Realtime overlay
`gtfsRealtime` decodes GTFS-RT protobuf with a streaming reader (no giant object trees), keeps trips whose route/trip
passes `filter` and that run around now, maps `stop_id` → station through the schedule, and backs off on 429/5xx.
TripUpdates with per-stop times are merged onto the matched timetable trip (delays propagate to later stops; departures
already shown never move back); per-stop delay-only events (Entur) become timetable time + delay; a trip-level `delay`
shifts the whole remaining trip; VehiclePositions (`stop_id` + `current_status`) pin the train to its stop/segment and
derive the delay, and `multi_carriage_details` labels arrive as `RtTrip.carriages`. Positions are smoothed poll to poll:
a train keeps its drawn spot and changes speed instead of jumping, including the first poll it gets realtime.

Matching: by key on the trip's service date (`start_date`, dashes stripped; other days' runs are ignored), then by
line + station order + times. Keyed trips running far off their timetable are placed on their own row anyway, and
realtime trips the timetable doesn't have (ADDED, or too late to match) with at least two predicted stops become
trains of their own (`<line>:rt:<key>`) on the line's best-fitting pattern. Feeds without trip ids (HSL) can pass
`tripKey: (d) => …` built from `routeId`, `directionId`, `startTime`, `startDate`, paired with the build's
`trips.rtKey`.

**Bespoke overlay** (WMATA, CTA Train Tracker, TDX, Wiener Linien monitor…): implement `RealtimeSource` in
`server/adapters/<city>/` and pass it as `realtime`:

```ts
export interface RealtimeSource {
  name: string;                                               // e.g. 'WMATA Train Positions'
  refresh(nowMs: number, sched: GtfsSchedule): Promise<void>; // called every poll; you decide when to fetch
  trips(nowMs: number): RtTrip[] | undefined;                 // fresh trips, or undefined (→ timetable only)
}
export interface RtTrip {
  key?: string;                  // schedule trip key (with realtimeKeys) when the feed knows it
  line?: string;                 // LineDef id, needed for time matching when there is no key
  date?: number;                 // service date YYYYMMDD, to tell today's run of a trip from yesterday's
  cancelled?: boolean;
  stops?: { station: number; a?: number; d?: number; aimedA?: number; aimedD?: number; skipped?: boolean }[];
  delay?: number;                // whole-trip delay, seconds, when there are no per-stop times
  at?: { station: number; status: 'at' | 'to' };  // current position (VehiclePositions style)
  label?: string; stock?: string; cars?: number;  // shown on the train when present
  carriages?: string[];          // car numbers in order (VehiclePosition.multi_carriage_details)
}
// RtStopTime also takes delayA / delayD (seconds) for feeds that send delays without times.
```
`sched.station(stopIdOrCode)` resolves a GTFS `stop_id` to a station index, `sched.stationIndex(stationId)` a station
id; `politeFetch(url, init, { perMinute })` from the kit gives you rate limiting and backoff for your own endpoint.

## 3. Checks
`scripts/check-<city>.ts` can be three lines:
```ts
import { checkGtfsCity } from './lib/gtfs/check.ts';
import { createAdapters } from '../server/adapters/<city>/index.ts';
await checkGtfsCity('<city>', createAdapters);
```
It prints everything the brief asks for (trains/stock per line, segment coverage, bracketing, unknown ids, samples,
geometry sanity, data size, heap after a poll) and accepts `--twice`, `--at=<ISO time>` and `--mock-rt` (serves
synthetic TripUpdates from the timetable to exercise the realtime path). Run it as
`node --expose-gc --import tsx scripts/check-<city>.ts` for an exact heap figure.

## 4. Status and numbers
Working, proven on Vienna (Wiener Linien GTFS, 830 MB unzipped: 58k trips in a 40-day window → 2.0 MB schedule,
17 MB heap) and Amsterdam (OVapi national GTFS, 1.7 GB unzipped: GVB metro + trams, 41k trips → 1.7 MB, 22 MB heap,
live OVapi TripUpdates + VehiclePositions). A cold build of either takes under a minute plus the download.

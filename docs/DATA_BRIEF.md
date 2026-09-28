# Tiny Trains — data pipeline brief

Tiny Trains is a whimsical, isometric 3D map of the train systems in New York, San Francisco,
London and Tokyo, showing **real-time** train positions with **accurate rolling stock**. The Three.js
client is being built separately and at the same time. This brief covers the data side: static network
data, live adapters and rolling-stock specs.

## Read first (do not modify)
- `shared/types.ts`: every contract (TransitData, SegmentDef, TrainState, GeoData, StockSpec)
- `shared/cities.ts`: city ids, projection origin, bbox, timezone
- `shared/geo.ts`: `makeProjection(city)`, `cityBounds(city)`, `roundFlat`, `flatLength`
- `server/adapters/types.ts`: the Adapter interface; `server/hub.ts` and `server/index.ts` show how adapters are polled

If a shared contract truly blocks you, don't edit it. Work around it and explain in your final report.

## Rules
- TypeScript ESM, run scripts with `npx tsx <file>`. Node 24 has global `fetch`.
- Installed deps: `fflate` (unzip), `csv-parse`, `gtfs-realtime-bindings`, `@mapbox/vector-tile`, `pbf`, `three`.
  **Do not run npm install.** If you need something else, write it yourself or say so in your report.
- Only create or modify files in the paths assigned to you. Cache downloads under `.cache/<yours>/`
  (gitignored) so reruns are fast and polite to upstream servers.
- Do not start the main server (`server/index.ts`, port 8787). Test adapters by calling them directly from a check script.
- Use American English in code, comments and names. Keep comments sparse. No over-engineering.
- Generated JSON should be compact: no pretty-printing, coordinates via `roundFlat` (0.1 m), polylines simplified
  with Douglas-Peucker (~1.5–3 m tolerance). Target transit.json < 3 MB.

## Transit data (`public/data/<city>/transit.json`)
- Coordinates are local meters from `makeProjection(city).project(lon, lat)` (x east, y north).
- `stations[].id` must be exactly the ids your adapter emits in `TrainState.stops[].s`.
- `segments`: one entry per distinct station pair (unordered) and geometry. The client finds the track between
  consecutive timeline stops A→B by looking up a segment with {from:A,to:B} or {from:B,to:A} (reversed), preferring
  one whose `lines` includes the train's line. **Use real track geometry** (GTFS shapes, OSM ways, etc.), not straight
  lines. The first/last points should be within ~50–150 m of the station coordinates.
- `lines[].color` must be the official line color. `short` is the bullet text.
- `el` (optional): per-point level, where -1 is tunnel, 0 is at grade and 1 is elevated/bridge. It's worth filling
  when cheap: elevated lines get drawn on little viaduct pillars.
- `attribution`: data credits (e.g. "MTA", "© OpenStreetMap contributors", "Powered by TfL Open Data").

## Live adapter (`server/adapters/<city>/index.ts` → `export const createAdapters: AdapterFactory`)
`poll(now)` returns every train currently in service as `TrainState`. The client animates each train along the
segment polyline between consecutive timeline stops, driven only by the times. Good timelines are the most important
thing you produce:
- `stops[0]` is the station the train most recently departed, with its (estimated) departure time `d` ≤ now. If the
  train is dwelling at a station, stops[0] is that station with a ≤ now ≤ d. Then come the upcoming stops with
  estimated arrival/departure times (epoch **seconds**), for the previous stop plus up to ~15 upcoming stops.
- Times must be non-decreasing. If a feed gives only one time per stop, use a realistic dwell (a→d ≈ 20–40 s; more at
  big interchanges if you like).
- If the feed doesn't say when the train left the previous stop, estimate it: use the scheduled/typical run time
  between the two stations, or track state changes across polls. A train must appear at a plausible spot between
  its two stations and progress smoothly. It must not teleport between polls.
- Every consecutive pair of stops must be connected by a segment in transit.json (≥ 98% coverage). Express trains
  skip stations, so their segments come from their own stopping patterns.
- `id` must stay stable across polls for the same train. Leave out trains that have finished, or that are scheduled
  but haven't departed their origin yet.
- `stock` must be an id from your `shared/stock/<city>.ts`. `cars` is the real consist length (from the feed when available).
- `dest`, `dir`, `service`, `delay`, `label` should be filled whenever the feed allows. They show in the train info card.
- `live: false` only for timetable-simulated trains.

## Rolling stock (`shared/stock/<city>.ts` → `export const stock: StockSpec[]`)
Research each vehicle type and fill in accurate dimensions, doors per side, profile, nose and livery colors. The client
builds a procedural 3D model from these fields, so the colors and proportions are what make it recognizable. Use
`stripes` with `color: 'line'` where the real train carries the line color (e.g. Tokyo line bands). Write a charming,
**true** `blurb`. IDs are prefixed with the city (`nyc-r160`).

## Verification (required)
Write `scripts/check-<city>.ts`. It runs your adapters once against the live feeds and prints:
- the number of trains per line, and the stock/cars used
- the % of consecutive timeline stop pairs that have a segment (target ≥ 98%)
- the % of trains whose timeline brackets `now` sensibly (stops[0].a ≤ now and now ≤ last stop's d)
- any unknown station/line/stock ids
- 3 sample trains (id, line, dest, stops with ISO times)
- geometry sanity: stations inside the city bbox, segment endpoints near their stations (report the max distance)

Iterate until the numbers are clean. Then run `npx tsc --noEmit -p tsconfig.json` and make sure your files add no type errors.

## Final report (≤ 400 words)
Cover what you built, the sources, stock ids and cars per line, the check output numbers, known limitations, and
anything the integrator needs to know.

---

# Round 2: new cities (read this too; it overrides the above where they differ)

The app is live at https://tinytrains.app. Production runs on **Cloudflare Workers**: each city's adapters run inside
a Durable Object (workerd runtime), not Node. That imposes these rules:

- **No filesystem at runtime.** Read every static data file through `readJson<T>('server/data/<city>/x.json')`
  (or `'public/data/<city>/transit.json'`) from `server/data.ts`. Never `readFileSync`, never `import.meta.dirname` in
  adapter code. Web APIs only (`fetch`, `AbortSignal.timeout`, `Intl`, `TextDecoder`…). `fflate` is fine at runtime if you
  must decompress; `node:zlib` is not.
- **Budgets.** All of `server/data/<city>/` together ≤ 10 MB of JSON. After loading and one poll, the adapters' heap must
  stay ≤ 60 MB (measure: `node --expose-gc --import tsx -e "…createAdapters…poll…; gc(); console.log(process.memoryUsage().heapUsed)"`).
- **Politeness.** Production polls each upstream from one place per city. Stay ≤ 60 requests/min per upstream, back off on
  HTTP 429/5xx, and never let one failing source break the others.
- **API keys** come in through `AdapterEnv` (`server/adapters/types.ts`): `PRIM_KEY` (Paris), `SEOUL_API_KEY` (Seoul).
  Without a key, a system must still show trains, from the official timetable (`live: false`), and the source name
  should make clear it's a timetable.
- `shared/cities.ts` already defines your city (id, bbox, origin, timezone). Don't edit it; tell me if the bbox is wrong.
- Local names: for Seoul and Hong Kong, fill `nameLocal` on stations and lines (Korean / Traditional Chinese), and
  `destLocal` on trains.
- In your final report, **list every data file your adapters read** (I bundle them into the city's Worker), and your
  adapter ids.

---

# Round 3: 25 more cities (read Round 2 too; this overrides where they differ)

`shared/cities.ts` now defines 25 more cities (id, bbox, origin, view, timezone). The bbox is a first guess: if yours
cuts off something that matters (a terminus, an airport line), tell team-lead the bbox you want instead of editing it.

| Agent | Cities |
|---|---|
| paris-data | builds the **GTFS kit**; proves it on `vienna`, `amsterdam` |
| seoul-data | builds the **sim kit**; proves it on `moscow`, `singapore` |
| china-a | `shanghai`, `beijing`, `guangzhou`, `shenzhen` |
| china-b | `chengdu`, `hangzhou`, `wuhan`, `chongqing` |
| world-data | `delhi`, `cairo`, `osaka` |
| us-data | `washington`, `chicago`, `boston` |
| nordic-data | `stockholm`, `oslo`, `helsinki` |
| latam-data | `mexicocity`, `saopaulo` |
| apac-data | `sydney`, `taipei` |
| geo2-data | geography for all 25 |

## Two shared kits instead of 25 one-off pipelines
- **GTFS kit** (owner paris-data): for cities with a static GTFS feed. `scripts/lib/gtfs/` turns a feed plus a small
  per-city config into `transit.json` + a packed timetable, and `server/adapters/gtfs/` is a generic timetable adapter
  with an optional GTFS-realtime overlay (TripUpdates / VehiclePositions). Documented in `docs/KIT_GTFS.md`.
- **Sim kit** (owner seoul-data): for cities with no usable timetable. `scripts/lib/osm-network/` builds stations,
  stopping patterns and track from OSM route relations, and `server/adapters/sim/` simulates trains from researched
  headways (time bands per day type, first/last trains, run speed or run times, dwell, branches, short turns, loops,
  expresses, holidays, stock mix). Documented in `docs/KIT_SIM.md`.
- Kit owners: send every dependent agent the **config interface first** (aim for ~30 min), then implement, then prove it
  on your own cities. Dependent agents: ask the kit owner for changes by message; don't edit kit files yourself.
- A city with a feed the kits can't handle (a bespoke realtime API: WMATA, CTA Train Tracker, TDX, Wiener Linien…)
  gets its own small overlay adapter in `server/adapters/<city>/`, on top of the kit's timetable.

## While the kits are being built (don't wait idle)
Research each city: which systems to include (metro first; commuter rail, light rail and trams where they're iconic
and budgets allow), official line colors and bullets, names in the local script, service patterns and headways,
first/last trains, and the rolling stock per line with cars per train. Write `shared/stock/<city>.ts` (see the other
cities for the level of detail and the livery fields). Find the feeds: static GTFS URLs (for keyed feeds, the Mobility
Database hosts keyless mirrors: https://mobilitydatabase.org), realtime endpoints, and OSM route relation ids.
**Do the research yourself (WebSearch/WebFetch); do not spawn subagents.** Last round their reports went astray.

## Rules
- Only create or modify files for your own cities (and your kit, if you own one): `scripts/build-<city>.ts`,
  `scripts/check-<city>.ts`, `server/adapters/<city>/`, `server/data/<city>/`, `public/data/<city>/transit.json`,
  `shared/stock/<city>.ts`, `.cache/<city>/`. Shared files are team-lead's.
- API keys: `AdapterEnv` already has `WMATA_KEY`, `CTA_TRAIN_KEY`, `MBTA_KEY`, `TFNSW_KEY`, `TRAFIKLAB_KEY`,
  `DIGITRANSIT_KEY`, `TDX_CLIENT_ID`/`TDX_CLIENT_SECRET` (plus the older ones). We have none of these keys yet: every
  city must work keyless, from a timetable or simulation, with keyless realtime wherever it exists. Tell team-lead if you
  need another key field.
- Local names: fill `nameLocal` (stations, lines) and `destLocal` (trains) wherever the local script differs from the
  English name: simplified Chinese for mainland China, traditional for Taipei, Japanese for Osaka, Cyrillic for Moscow,
  Arabic for Cairo, Devanagari for Delhi.
- Budgets as in Round 2 (≤ 10 MB server data per city, ≤ 60 MB heap after a poll, ≤ 60 req/min per upstream).
- Report to **team-lead** with SendMessage, one final report per city (≤ 400 words each) as soon as that city is done,
  so it can ship while you work on the next. Include the files your adapters read and your adapter ids.

// GTFS kit, build side: a static feed + a per-city config -> public/data/<city>/transit.json and a packed timetable
// server/data/<city>/schedule.json for server/adapters/gtfs. See docs/KIT_GTFS.md.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CITIES } from '../../../shared/cities.ts';
import { makeProjection, roundFlat } from '../../../shared/geo.ts';
import type { Flat, LineDef, LineKind, SegmentDef, StationDef, TransitData } from '../../../shared/types.ts';
import { TRIP_STRIDE, type GtfsScheduleData, type PatternDef, type ServiceDef, type StockMix } from '../../../server/adapters/gtfs/schedule.ts';
import { DEBUG, ROOT, basicRouteType, expandFrequencies, firstCell, header, interpolate, loadServices, loadStopTimes, openFeed, rows, serviceRuns, table, type Feed, type StopTime } from './feed.ts';
import { OsmTrack, cumulative, debug, locate, reverse, separation, similar, slice } from './geometry.ts';
import type { GeometrySource, GtfsCityConfig, LineConfig, RouteMatch, Row, TripInfo } from './types.ts';

export type * from './types.ts';

const DEFAULT_OSM: Record<LineKind, string[]> = {
  subway: ['subway', 'rail', 'light_rail'],
  metro: ['subway', 'rail', 'light_rail'],
  rail: ['rail'],
  light: ['light_rail', 'tram', 'subway'],
  tram: ['tram', 'light_rail'],
  monorail: ['monorail'],
  agt: ['monorail', 'light_rail', 'subway'],
  cable: ['funicular', 'narrow_gauge'],
};

interface Stop {
  id: string; // namespaced
  raw: string; // GTFS stop_id
  row: Row;
  name: string;
  lon: number;
  lat: number;
  x: number;
  y: number;
  parent: string; // namespaced, '' if none
}

interface Station {
  id: string;
  base: string; // grouping key
  name: string;
  nameLocal?: string;
  x: number;
  y: number;
  lines: Set<string>;
}

interface Trip {
  id: string; // namespaced
  info: TripInfo;
  service: string; // namespaced
  shape: string; // namespaced
  dir: number;
  from: [number, number]; // first and last stop of the whole trip, for the compass
  to: [number, number];
}

const lower = (v: string | string[]) => (Array.isArray(v) ? v : [v]);

function matches(m: RouteMatch, r: Row, feed: string, agency: string): boolean {
  if (m.feed && m.feed !== feed) return false;
  if (m.routeId && !lower(m.routeId).includes(r.route_id)) return false;
  if (m.shortName != null) {
    if (m.shortName instanceof RegExp ? !m.shortName.test(r.route_short_name) : !lower(m.shortName).includes(r.route_short_name)) return false;
  }
  if (m.longName && !m.longName.test(r.route_long_name ?? '')) return false;
  if (m.routeType != null && !lower(m.routeType as never).map(Number).includes(basicRouteType(Number(r.route_type)))) return false;
  if (m.agency != null) {
    const ok = m.agency instanceof RegExp ? m.agency.test(r.agency_id ?? '') || m.agency.test(agency) : m.agency === (r.agency_id ?? '') || m.agency === agency;
    if (!ok) return false;
  }
  return !m.test || m.test(r);
}

const normName = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9Ѐ-ӿ؀-ۿऀ-ॿ぀-鿿가-힯]+/g, ' ')
    .trim();
const slug = (s: string) => normName(s).replace(/\s+/g, '-') || 'x';
const IFOPT = /^([a-z]{2}:\d+:\d+)(:|$)/i;

function contrast(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#000000' : '#FFFFFF';
}

export async function buildGtfsCity(cfg: GtfsCityConfig): Promise<void> {
  const city = CITIES[cfg.city];
  const { project } = makeProjection(cfg.city);
  const [W, S, E, N] = city.bbox;
  const inside = cfg.clip && cfg.clip !== 'bbox' ? cfg.clip : (lon: number, lat: number) => lon >= W && lon <= E && lat >= S && lat <= N;
  const feeds: Feed[] = [];
  for (const f of cfg.feeds) feeds.push(await openFeed(cfg.city, f));
  const multi = feeds.length > 1;
  const ns = (fi: number, id: string) => (multi && id ? `${feeds[fi].id}|${id}` : id);

  // ------------------------------------------------------------------ lines
  const lineCfg = new Map<string, LineConfig>();
  const lineRoutes = new Map<string, Row[]>();
  const routeLine = new Map<string, string>(); // namespaced route id -> line id
  const rawRouteLine = new Map<string, string>();
  for (const [fi, feed] of feeds.entries()) {
    const agencies = new Map((await table(feed, 'agency.txt')).map((a) => [a.agency_id ?? '', a.agency_name]));
    const only = agencies.size === 1 ? [...agencies.values()][0] : '';
    for (const r of await table(feed, 'routes.txt')) {
      const agency = agencies.get(r.agency_id ?? '') ?? only;
      let line = cfg.lines.find((l) => matches(l.match, r, feed.id, agency));
      if (!line && cfg.routes && matches(cfg.routes.match, r, feed.id, agency)) {
        const def = cfg.routes.line(r);
        if (def) line = { ...def, match: cfg.routes.match };
      }
      if (!line) continue;
      if (!lineCfg.has(line.id)) lineCfg.set(line.id, line);
      (lineRoutes.get(line.id) ?? lineRoutes.set(line.id, []).get(line.id)!).push(r);
      routeLine.set(ns(fi, r.route_id), line.id);
      rawRouteLine.set(r.route_id, line.id);
    }
  }
  for (const l of cfg.lines) if (!lineCfg.has(l.id)) console.warn(`warning: no GTFS route matches line ${l.id}`);
  console.log(`lines: ${[...lineCfg.keys()].join(' ')}`);

  // ------------------------------------------------------------------ trips, stop times, stops
  const gtfsTrips: { fi: number; row: Row; line: string }[] = [];
  const stopTimes = new Map<string, StopTime[]>();
  const freqOrigin = new Map<string, string>();
  const stops = new Map<string, Stop>();
  const routeRows = new Map<string, Row>();
  for (const [fi, feed] of feeds.entries()) {
    for (const r of await table(feed, 'routes.txt')) routeRows.set(ns(fi, r.route_id), r);
    const routeIds = [...rawRouteLine.keys()];
    const trips = await table(feed, 'trips.txt', (l) => routeIds.some((id) => l.includes(id)));
    const mine = trips.filter((t) => routeLine.has(ns(fi, t.route_id)));
    for (const t of mine) gtfsTrips.push({ fi, row: t, line: routeLine.get(ns(fi, t.route_id))! });
    const st = await loadStopTimes(feed, new Set(mine.map((t) => t.trip_id)));
    const origin = await expandFrequencies(feed, st);
    for (const [id, list] of st) stopTimes.set(ns(fi, id), list.map((s) => ({ ...s, stop: ns(fi, s.stop) })));
    for (const [id, tpl] of origin) freqOrigin.set(ns(fi, id), ns(fi, tpl));
    for await (const r of rows(feed, 'stops.txt')) {
      const lon = Number(r.stop_lon), lat = Number(r.stop_lat);
      const [x, y] = project(lon, lat);
      stops.set(ns(fi, r.stop_id), { id: ns(fi, r.stop_id), raw: r.stop_id, row: r, name: r.stop_name, lon, lat, x, y, parent: r.parent_station ? ns(fi, r.parent_station) : '' });
    }
  }
  // Frequency-based trips were expanded under new ids; point them at their template's trips.txt row.
  const tripRow = new Map(gtfsTrips.map((t) => [ns(t.fi, t.row.trip_id), t]));
  const allTrips: { id: string; fi: number; row: Row; line: string }[] = [];
  for (const [id] of stopTimes) {
    const src = tripRow.get(freqOrigin.get(id) ?? id);
    if (src) allTrips.push({ id, fi: src.fi, row: src.row, line: src.line });
  }
  console.log(`trips: ${gtfsTrips.length} in the feed${freqOrigin.size ? `, ${freqOrigin.size} from frequencies` : ''}`);

  // ------------------------------------------------------------------ services and date window
  let window: [number, number] | undefined;
  if (cfg.days) {
    const ymd = (d: Date) => d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
    window = [ymd(new Date(Date.now() + cfg.days.from * 86400e3)), ymd(new Date(Date.now() + cfg.days.to * 86400e3))];
  }
  const services = new Map<string, ServiceDef>();
  for (const [fi, feed] of feeds.entries()) {
    const used = new Set(allTrips.filter((t) => t.fi === fi).map((t) => t.row.service_id));
    for (const [id, s] of await loadServices(feed, used, window)) services.set(ns(fi, id), s);
  }

  // ------------------------------------------------------------------ stations
  const xyOf = (stop: string): [number, number] | undefined => {
    const s = stops.get(stop);
    return s && [s.x, s.y];
  };
  const used = new Map<string, Set<string>>(); // stop -> lines, inside the clip area
  const hooks = cfg.trips ?? {};
  const chainAlias = new Map<string, string>(); // trip_id of a follow-on trip -> the trip it was joined to
  const live = allTrips.filter((t) => {
    const svc = services.get(ns(t.fi, t.row.service_id));
    if (!svc || !serviceRuns(svc)) return false;
    if (!hooks.keepTrip) return true;
    const stopIds = (stopTimes.get(t.id) ?? []).map((s) => stops.get(s.stop)?.raw ?? s.stop);
    return hooks.keepTrip({ feed: feeds[t.fi].id, route: routeRows.get(ns(t.fi, t.row.route_id))!, trip: t.row, stopIds });
  });
  // Through-running split into several trips of one block: append each follow-on trip to its predecessor.
  const chained = new Set<string>();
  if (hooks.chainBlocks) {
    const gap = (hooks.chainBlocks === true ? 15 : hooks.chainBlocks) * 60;
    const blocks = new Map<string, typeof live>();
    for (const t of live) {
      if (!t.row.block_id) continue;
      const k = `${t.fi}|${t.row.service_id}|${t.row.block_id}|${t.line}`;
      (blocks.get(k) ?? blocks.set(k, []).get(k)!).push(t);
    }
    const head = (t: { row: Row }, list: StopTime[]) => {
      if (t.row.trip_headsign) return t.row.trip_headsign;
      const s = stops.get(list.at(-1)!.stop);
      return (s?.parent && stops.get(s.parent)?.name) || s?.name;
    };
    for (const list of blocks.values()) {
      list.sort((a, b) => (stopTimes.get(a.id)?.[0]?.d ?? 0) - (stopTimes.get(b.id)?.[0]?.d ?? 0));
      let cur = list[0];
      for (const next of list.slice(1)) {
        const a = stopTimes.get(cur.id), b = stopTimes.get(next.id);
        const end = a?.at(-1), start = b?.[0];
        const same = end && start && (end.stop === start.stop || (stops.get(end.stop)?.parent && stops.get(end.stop)?.parent === stops.get(start.stop)?.parent));
        if (!a || !b || !same || start.d - end.a > gap || start.d < end.a) {
          cur = next;
          continue;
        }
        // Signs: each part keeps its own headsign from where it starts.
        const ha = head(cur, a), hb = head(next, b);
        for (const s of a) s.hs ??= ha;
        for (const s of b) s.hs ??= hb;
        // From the junction on the train is the second trip: its sign and departure.
        end.hs = start.hs;
        end.d = start.d;
        stopTimes.set(cur.id, [...a, ...b.slice(1)]);
        chained.add(next.id);
        chainAlias.set(next.row.trip_id, cur.row.trip_id);
      }
    }
    if (chained.size) console.log(`chained ${chained.size} follow-on trips into their blocks`);
  }
  for (const t of live) {
    if (chained.has(t.id)) continue;
    for (const s of stopTimes.get(t.id) ?? []) {
      const st = stops.get(s.stop);
      if (!st || !inside(st.lon, st.lat)) continue;
      (used.get(s.stop) ?? used.set(s.stop, new Set()).get(s.stop)!).add(t.line);
    }
  }
  const stationCfg = cfg.stations ?? {};
  const prefix = stationCfg.idPrefix ?? cfg.city;
  const maxSpread = stationCfg.maxSpread ?? 120;
  const group = stationCfg.group ?? 'parent';
  const keyOf = (s: Stop): string => {
    if (typeof group === 'function') return `k:${group(s.row)}`;
    if (group === 'parent') {
      if (s.parent) return `p:${s.parent}`;
      const m = s.raw.match(IFOPT);
      if (m) return `a:${m[1]}`;
    }
    return `n:${normName(s.name)}`;
  };
  // Name keys can repeat across town: split them into clusters of stops within 400 m of each other.
  const baseKey = new Map<string, string>();
  const byName = new Map<string, Stop[]>();
  for (const id of used.keys()) {
    const s = stops.get(id)!;
    const k = keyOf(s);
    if (k.startsWith('n:')) (byName.get(k) ?? byName.set(k, []).get(k)!).push(s);
    else baseKey.set(id, k);
  }
  for (const [k, list] of byName) {
    const clusters: Stop[][] = [];
    for (const s of list) {
      const hit = clusters.filter((c) => c.some((o) => Math.hypot(o.x - s.x, o.y - s.y) < 400));
      const merged = hit.flat().concat(s);
      for (const h of hit) clusters.splice(clusters.indexOf(h), 1);
      clusters.push(merged);
    }
    clusters.forEach((c, i) => c.forEach((s) => baseKey.set(s.id, i ? `${k}#${i + 1}` : k)));
  }
  // Lines in config order, then bulk-defined ones in natural order of their bullets.
  const explicit = cfg.lines.map((l) => l.id).filter((id) => lineCfg.has(id));
  const bulk = [...lineCfg.keys()].filter((id) => !explicit.includes(id));
  bulk.sort((a, b) => lineCfg.get(a)!.short.localeCompare(lineCfg.get(b)!.short, undefined, { numeric: true }) || a.localeCompare(b));
  const lineOrder = [...new Set([...explicit, ...bulk])];
  const rank = (l: string) => lineOrder.indexOf(l);
  const stations = new Map<string, Station>();
  const stationOf = new Map<string, string>(); // `${stop}|${line}` -> station id
  const clustersOf = new Map<string, Station[]>();
  const byKey = new Map<string, { stop: Stop; lines: Set<string> }[]>();
  for (const [id, lines] of used) {
    const k = baseKey.get(id)!;
    (byKey.get(k) ?? byKey.set(k, []).get(k)!).push({ stop: stops.get(id)!, lines });
  }
  let splits = 0;
  for (const [key, list] of byKey) {
    // Units are one line's platforms that lie close together; a line whose platforms are far apart (a tram stopping
    // on two sides of a big square) gets one unit per side. Units then merge while they stay within maxSpread.
    type Unit = { lines: string[]; stops: Stop[] };
    const center = (ss: Stop[]): [number, number] => [ss.reduce((t, s) => t + s.x, 0) / ss.length, ss.reduce((t, s) => t + s.y, 0) / ss.length];
    const spread = (ss: Stop[]) => {
      const [cx, cy] = center(ss);
      return Math.max(...ss.map((s) => Math.hypot(s.x - cx, s.y - cy)));
    };
    const merge = (units: Unit[]) => {
      for (;;) {
        let best: [number, number, number] | null = null;
        for (let i = 0; i < units.length; i++)
          for (let j = i + 1; j < units.length; j++) {
            const sp = spread([...new Set([...units[i].stops, ...units[j].stops])]);
            if (sp <= maxSpread && (!best || sp < best[2])) best = [i, j, sp];
          }
        if (!best) return units;
        units[best[0]] = { lines: [...new Set([...units[best[0]].lines, ...units[best[1]].lines])], stops: [...new Set([...units[best[0]].stops, ...units[best[1]].stops])] };
        units.splice(best[1], 1);
      }
    };
    const lines = [...new Set(list.flatMap((e) => [...e.lines]))].sort((a, b) => rank(a) - rank(b));
    let units: Unit[] = lines.flatMap((l) => merge(list.filter((e) => e.lines.has(l)).map((e) => ({ lines: [l], stops: [e.stop] }))));
    units = merge(units).sort((a, b) => rank(a.lines[0]) - rank(b.lines[0]));
    if (units.length > 1) splits++;
    const idBase = `${prefix}:${key.startsWith('n:') ? slug(key.slice(2)) : key.slice(2).replace(/^.*\|/, '')}`;
    const cl: Station[] = [];
    units.forEach((u, k) => {
      const ss = u.stops;
      const [x, y] = center(ss);
      const parent = ss[0].parent ? stops.get(ss[0].parent) : undefined;
      const counts = new Map<string, number>();
      for (const s of ss) counts.set(s.name, (counts.get(s.name) ?? 0) + 1);
      const raw = parent?.name || [...counts].sort((a, b) => b[1] - a[1])[0][0];
      const row = parent?.row ?? ss[0].row;
      const name = stationCfg.name ? stationCfg.name(raw, row) : raw;
      const st: Station = { id: `${idBase}${k ? String.fromCharCode(97 + k) : ''}`, base: key, name, nameLocal: stationCfg.nameLocal?.(raw, row), x, y, lines: new Set() };
      if (stations.has(st.id)) st.id = `${st.id}~${stations.size}`;
      stations.set(st.id, st);
      cl.push(st);
      for (const s of ss) for (const l of u.lines) if (used.get(s.id)?.has(l)) stationOf.set(`${s.id}|${l}`, st.id);
    });
    clustersOf.set(key, cl);
    if (units.length > 1) debug(`split ${cl[0].name}: ${units.map((u) => u.lines.join('+')).join(' / ')}`);
  }

  // ------------------------------------------------------------------ assemble trips
  const tripsOut: Trip[] = [];
  let clipped = 0, noTimes = 0;
  const nameOf = (stop: string) => {
    const s = stops.get(stop);
    if (!s) return stop;
    const p = (s.parent && stops.get(s.parent)) || s;
    return stationCfg.name ? stationCfg.name(p.name, p.row) : p.name;
  };
  for (const t of live) {
    if (chained.has(t.id)) continue;
    const raw = stopTimes.get(t.id);
    if (!raw || raw.length < 2) continue;
    if (!interpolate(raw, xyOf)) {
      noTimes++;
      continue;
    }
    const runs: TripInfo['stops'][] = [[]];
    for (const s of raw) {
      const station = stationOf.get(`${s.stop}|${t.line}`);
      if (!station) {
        if (runs.at(-1)!.length) runs.push([]);
        continue;
      }
      const prev = runs.at(-1)!.at(-1);
      if (prev && prev.station === station) prev.d = Math.max(prev.d, s.d);
      else runs.at(-1)!.push({ stopId: stops.get(s.stop)?.raw ?? s.stop, station, name: stations.get(station)!.name, a: s.a, d: s.d, headsign: s.hs });
    }
    const kept = runs.filter((r) => r.length >= 2);
    if (kept.length !== 1 || kept[0].length !== raw.length) clipped++;
    const route = routeRows.get(ns(t.fi, t.row.route_id))!;
    const allStops = raw.map((s) => ({ stopId: stops.get(s.stop)?.raw ?? s.stop, name: nameOf(s.stop), a: s.a, d: s.d }));
    const first = xyOf(raw[0].stop) ?? [0, 0], last = xyOf(raw.at(-1)!.stop) ?? [0, 0];
    kept.forEach((st, k) =>
      tripsOut.push({
        id: kept.length > 1 ? `${t.id}~${k}` : t.id,
        info: { feed: feeds[t.fi].id, route, trip: t.row, line: t.line, stops: st, allStops, skips: false },
        service: ns(t.fi, t.row.service_id),
        shape: ns(t.fi, t.row.shape_id ?? ''),
        dir: Number(t.row.direction_id) || 0,
        from: first,
        to: last,
      }),
    );
  }
  // Trips that pass stations other trips of the line serve between two of their stops skip them.
  const pos = new Map<string, Map<string, number>[]>();
  const seen = new Set<string>();
  for (const t of tripsOut) {
    const k = `${t.info.line}|${t.info.stops.map((s) => s.station).join(',')}`;
    if (seen.has(k)) continue;
    seen.add(k);
    (pos.get(t.info.line) ?? pos.set(t.info.line, []).get(t.info.line)!).push(new Map(t.info.stops.map((s, i) => [s.station, i])));
  }
  const skipMemo = new Map<string, boolean>();
  for (const t of tripsOut) {
    const st = t.info.stops.map((s) => s.station);
    const k = `${t.info.line}|${st.join(',')}`;
    if (!skipMemo.has(k)) {
      let skips = false;
      for (let i = 0; i + 1 < st.length && !skips; i++)
        for (const p of pos.get(t.info.line)!) {
          const a = p.get(st[i]), b = p.get(st[i + 1]);
          if (a != null && b != null && Math.abs(b - a) > 1) {
            skips = true;
            break;
          }
        }
      skipMemo.set(k, skips);
    }
    t.info.skips = skipMemo.get(k)!;
  }
  const trips = hooks.keep ? tripsOut.filter((t) => hooks.keep!(t.info)) : tripsOut;
  console.log(`trips kept ${trips.length} (${clipped} clipped to the area${noTimes ? `, ${noTimes} without usable times` : ''})`);
  for (const t of trips) for (const s of t.info.stops) stations.get(s.station)!.lines.add(t.info.line);

  // ------------------------------------------------------------------ geometry
  const geo = cfg.geometry ?? {};
  const snap = geo.snap ?? 150;
  const sourceOf = (line: string): GeometrySource => lineCfg.get(line)!.geometry ?? geo.source ?? 'auto';
  const kindsOf = (line: string) => new Set(lineCfg.get(line)!.osm ?? DEFAULT_OSM[lineCfg.get(line)!.kind]);
  const needOsm = geo.levels !== false || [...lineCfg.keys()].some((l) => ['auto', 'osm'].includes(sourceOf(l)));
  const osm = needOsm ? await OsmTrack.load(cfg.city, city.bbox, project, geo.overpass) : null;
  // Lines with OSM route relations route and take levels only along their own ways.
  const lineTrack = new Map<string, OsmTrack>();
  for (const [id, l] of lineCfg) {
    if (!l.osmRelations?.length) continue;
    const ids = [...l.osmRelations].sort((a, b) => a - b);
    lineTrack.set(id, await OsmTrack.load(cfg.city, city.bbox, project, `rel(id:${ids.join(',')});way(r)["railway"];`, `osm-rel-${ids.join('-').slice(0, 80)}`));
  }
  const trackOf = (line: string) => lineTrack.get(line) ?? osm;
  const allKinds = new Set(Object.values(DEFAULT_OSM).flat().concat(['funicular', 'narrow_gauge', 'rail', 'monorail']));
  const kindsFor = (line: string) => (lineTrack.has(line) ? allKinds : kindsOf(line));
  const shapeIds = new Set(trips.filter((t) => ['auto', 'shapes'].includes(sourceOf(t.info.line))).map((t) => t.shape));
  const shapes = new Map<string, Flat>();
  for (const [fi, feed] of feeds.entries()) {
    const pts = new Map<string, [number, number, number][]>();
    const want = new Set([...shapeIds].filter((id) => id && (!multi || id.startsWith(`${feed.id}|`))).map((id) => (multi ? id.slice(feed.id.length + 1) : id)));
    if (!want.size) continue;
    const fast = (await header(feed, 'shapes.txt'))[0] === 'shape_id';
    for await (const r of rows(feed, 'shapes.txt', fast ? (l) => want.has(firstCell(l)) : undefined)) {
      if (!want.has(r.shape_id)) continue;
      const [x, y] = project(Number(r.shape_pt_lon), Number(r.shape_pt_lat));
      (pts.get(r.shape_id) ?? pts.set(r.shape_id, []).get(r.shape_id)!).push([Number(r.shape_pt_sequence), x, y]);
    }
    for (const [id, list] of pts) {
      list.sort((a, b) => a[0] - b[0]);
      const flat: Flat = [];
      for (const [, x, y] of list) {
        const n = flat.length;
        if (n && Math.abs(flat[n - 2] - x) < 0.01 && Math.abs(flat[n - 1] - y) < 0.01) continue;
        flat.push(x, y);
      }
      shapes.set(ns(fi, id), flat);
    }
  }

  /** dt: shortest scheduled run time over the variant, seconds (to spot shapes that can't be the real path). */
  const segs = new Map<string, { from: string; to: string; lines: Set<string>; pts: Flat; el?: number[]; n: number; dt: number }[]>();
  const stats = { shapePairs: 0, osmPairs: 0, straight: 0, variants: 0 };
  const addSegment = (from: string, to: string, line: string, pts: Flat, el?: number[], dt = Infinity) => {
    const [a, b] = from < to ? [from, to] : [to, from];
    const oriented = from < to ? pts : reverse(pts);
    const orientedEl = el && (from < to ? el : [...el].reverse());
    const key = `${a}|${b}`;
    const list = segs.get(key) ?? [];
    segs.set(key, list);
    const hit = list.find((s) => similar(s.pts, oriented, 30));
    if (hit) {
      hit.lines.add(line);
      hit.n++;
      hit.dt = Math.min(hit.dt, dt);
      return;
    }
    if (list.length) stats.variants++;
    list.push({ from: a, to: b, lines: new Set([line]), pts: oriented, el: orientedEl, n: 1, dt });
  };
  const finish = (line: string, pts: Flat) => {
    const track = trackOf(line);
    return track && geo.levels !== false ? track.withLevels(pts, kindsFor(line)) : { pts, el: undefined };
  };
  const missing = new Map<string, { from: string; to: string; line: string; a: [number, number]; b: [number, number] }>();
  const done = new Set<string>();
  const cumCache = new Map<string, number[]>();
  for (const t of trips) {
    const line = t.info.line;
    const src = sourceOf(line);
    const key = `${line}|${src === 'osm' || src === 'straight' ? '' : t.shape}|${t.info.stops.map((s) => s.stopId).join(',')}`;
    if (done.has(key)) continue;
    done.add(key);
    const xy = t.info.stops.map((s) => xyOf(multi ? `${t.info.feed}|${s.stopId}` : s.stopId)!);
    const shape = src === 'auto' || src === 'shapes' ? shapes.get(t.shape) : undefined;
    let loc: ({ s: number; d: number } | null)[] = xy.map(() => null);
    let cum: number[] = [];
    if (shape && shape.length >= 4) {
      cum = cumCache.get(t.shape) ?? cumulative(shape);
      cumCache.set(t.shape, cum);
      loc = locate(shape, cum, xy);
    }
    for (let i = 0; i + 1 < t.info.stops.length; i++) {
      const A = t.info.stops[i].station, B = t.info.stops[i + 1].station;
      if (A === B) continue;
      const la = loc[i], lb = loc[i + 1];
      if (!shape || !la || !lb || la.d > snap || lb.d > snap || lb.s - la.s < 5) {
        missing.set(`${A}|${B}|${line}`, { from: A, to: B, line, a: xy[i], b: xy[i + 1] });
        continue;
      }
      stats.shapePairs++;
      const r = finish(line, slice(shape, cum, la.s, lb.s));
      addSegment(A, B, line, r.pts, r.el, t.info.stops[i + 1].a - t.info.stops[i].d);
    }
  }
  for (const m of missing.values()) {
    const [a, b] = m.from < m.to ? [m.from, m.to] : [m.to, m.from];
    const list = segs.get(`${a}|${b}`);
    if (list?.some((s) => s.lines.has(m.line))) continue;
    const src = sourceOf(m.line);
    const track = trackOf(m.line);
    const path = src !== 'straight' && track ? track.route(m.a, m.b, kindsFor(m.line), snap) : null;
    if (path) {
      stats.osmPairs++;
      const r = finish(m.line, path);
      addSegment(m.from, m.to, m.line, r.pts, r.el);
      continue;
    }
    if (list?.length) {
      list[0].lines.add(m.line);
      continue;
    }
    stats.straight++;
    debug(`straight ${m.line} ${stations.get(m.from)!.name} -> ${stations.get(m.to)!.name}`);
    addSegment(m.from, m.to, m.line, [...m.a, ...m.b]);
  }
  // Stations sit at the mean of their track ends, so segments meet them even where a stop point is off the track.
  const acc = new Map<string, number[]>();
  const addEnd = (id: string, x: number, y: number) => {
    const a = acc.get(id) ?? [0, 0, 0];
    acc.set(id, [a[0] + x, a[1] + y, a[2] + 1]);
  };
  for (const list of segs.values())
    for (const s of list) {
      addEnd(s.from, s.pts[0], s.pts[1]);
      addEnd(s.to, s.pts.at(-2)!, s.pts.at(-1)!);
    }
  for (const [id, [x, y, n]] of acc) Object.assign(stations.get(id)!, { x: x / n, y: y / n });
  let far = 0, farWhere = '';
  for (const list of segs.values())
    for (const s of list) {
      const A = stations.get(s.from)!, B = stations.get(s.to)!;
      const d = Math.max(Math.hypot(s.pts[0] - A.x, s.pts[1] - A.y), Math.hypot(s.pts.at(-2)! - B.x, s.pts.at(-1)! - B.y));
      if (d > far) (far = d), (farWhere = `${A.name} - ${B.name}`);
    }

  // ------------------------------------------------------------------ pack the timetable
  const usedLines = lineOrder.filter((l) => trips.some((t) => t.info.line === l));
  const lineIdx = new Map(usedLines.map((l, i) => [l, i]));
  const stationIds = [...stations.values()].filter((s) => s.lines.size).map((s) => s.id);
  const stationIdx = new Map(stationIds.map((id, i) => [id, i]));
  const axis = new Map<string, 'ew' | 'ns'>();
  for (const l of usedLines) {
    const ss = [...stations.values()].filter((s) => s.lines.has(l));
    const xs = ss.map((s) => s.x), ys = ss.map((s) => s.y);
    axis.set(l, Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? 'ew' : 'ns');
  }
  const strs = [''];
  const strIdx = new Map([['', 0]]);
  const str = (s: string | undefined) => {
    if (!s) return 0;
    let i = strIdx.get(s);
    if (i == null) strIdx.set(s, (i = strs.push(s) - 1));
    return i;
  };
  const pats: PatternDef[] = [];
  const patIdx = new Map<string, number>();
  const tims: number[][] = [];
  const timIdx = new Map<string, number>();
  const consists: StockMix[] = [];
  const consistIdx = new Map<string, number>();
  const svcIds = [...new Set(trips.map((t) => t.service))];
  const svcIdx = new Map(svcIds.map((id, i) => [id, i]));
  const tripRows: { row: number[]; key?: string; trip?: string }[] = [];
  for (const t of trips) {
    const info = t.info;
    const compass = axis.get(info.line) === 'ew' ? (t.to[0] >= t.from[0] ? 'Eastbound' : 'Westbound') : t.to[1] >= t.from[1] ? 'Northbound' : 'Southbound';
    const dir = hooks.dir?.(info) ?? compass;
    const st = info.stops.map((s) => stationIdx.get(s.station)!);
    const p: PatternDef = { l: lineIdx.get(info.line)!, st, d: t.dir };
    if (dir) p.c = str(dir);
    // Signs that change along the trip (loops): [stop index, text] pairs from that stop onward.
    const clean = (h: string) => (stationCfg.name ? stationCfg.name(h, info.trip) : h);
    const destAt = info.stops.map((stp, i) => hooks.destAt?.(info, i) ?? (stp.headsign ? clean(stp.headsign) : undefined));
    const changes = (vals: (string | undefined)[]) => {
      if (new Set(vals.filter(Boolean)).size < 2) return undefined;
      const out: number[] = [];
      let prev: string | undefined;
      vals.forEach((v, i) => {
        if (v && v !== prev) out.push(i, str(v)), (prev = v);
      });
      return out;
    };
    const hd = changes(destAt);
    if (hd) p.hd = hd;
    const hc = hooks.dirAt ? changes(info.stops.map((_, i) => hooks.dirAt!(info, i))) : undefined;
    if (hc) p.hc = hc;
    const sv = hooks.service?.(info), svl = hooks.serviceLocal?.(info);
    if (sv) p.s = str(sv);
    if (svl) p.sl = str(svl);
    const pk = JSON.stringify(p);
    if (!patIdx.has(pk)) patIdx.set(pk, pats.push(p) - 1);
    const t0 = info.stops[0].a;
    const tm: number[] = [];
    const n = info.stops.length;
    for (let i = 0; i < n; i++) {
      let { a, d } = info.stops[i];
      if (a === d && i > 0 && i < n - 1) {
        const h = Math.max(0, Math.min(10, (a - info.stops[i - 1].d) / 4, (info.stops[i + 1].a - d) / 4));
        a -= h;
        d += h;
      }
      tm.push(Math.round(a - t0), Math.round(d - t0));
    }
    const tk = tm.join(',');
    if (!timIdx.has(tk)) timIdx.set(tk, tims.push(tm) - 1);
    const head = info.trip.trip_headsign && stationCfg.name ? stationCfg.name(info.trip.trip_headsign, info.trip) : info.trip.trip_headsign;
    const dest = hooks.dest?.(info) || (hd ? strs[hd[1]] : head || destAt.find(Boolean) || info.allStops.at(-1)!.name);
    const mix = hooks.consist?.(info);
    let ci = 0;
    if (mix) {
      const mk = `${mix.stock}|${mix.cars}`;
      if (!consistIdx.has(mk)) consistIdx.set(mk, consists.push({ stock: mix.stock, cars: mix.cars }));
      ci = consistIdx.get(mk)!;
    }
    const key = cfg.realtimeKeys && !freqOrigin.has(t.id.replace(/~\d+$/, '')) ? (hooks.rtKey ? hooks.rtKey(info) : info.trip.trip_id) : undefined;
    tripRows.push({ row: [svcIdx.get(t.service)!, patIdx.get(pk)!, timIdx.get(tk)!, t0, str(dest), str(hooks.destLocal?.(info)), str(hooks.label?.(info)), ci], key, trip: info.trip.trip_id });
  }
  tripRows.sort((a, b) => a.row[0] - b.row[0] || a.row[1] - b.row[1] || a.row[3] - b.row[3]);

  // GTFS stop_id -> station, for realtime feeds: our platforms, plus every other stop of the same group (nearest cluster).
  const stopMap: Record<string, number> = {};
  for (const s of stops.values()) {
    const lines = used.get(s.id);
    const own = lines && [...lines].map((l) => stationOf.get(`${s.id}|${l}`)).find((id) => id && stationIdx.has(id));
    let idx = own ? stationIdx.get(own) : undefined;
    if (idx == null) {
      const k = keyOf(s);
      let best: Station | undefined;
      for (const [ck, cl] of clustersOf) {
        if (ck !== k && !ck.startsWith(`${k}#`)) continue;
        for (const c of cl) if (stationIdx.has(c.id) && Math.hypot(c.x - s.x, c.y - s.y) < 500 && (!best || Math.hypot(c.x - s.x, c.y - s.y) < Math.hypot(best.x - s.x, best.y - s.y))) best = c;
      }
      if (best) idx = stationIdx.get(best.id);
    }
    if (idx == null) continue;
    // With several feeds, ids are also stored as 'feed|id' (realtime sources pass `feed` to use them).
    if (multi) stopMap[s.id] = idx;
    stopMap[s.raw] ??= idx;
  }
  const routes: Record<string, number> = {};
  for (const [id, line] of routeLine) {
    if (!lineIdx.has(line)) continue;
    if (multi) routes[id] = lineIdx.get(line)!;
    routes[multi ? id.slice(id.indexOf('|') + 1) : id] ??= lineIdx.get(line)!;
  }
  const svcList = svcIds.map((id) => services.get(id)!);
  const dates = svcList.flatMap((s) => [s.start, s.end, ...(s.add ?? [])]).filter(Boolean);
  const fleet = (l: string): StockMix[] => {
    const s = lineCfg.get(l)!.stock;
    return typeof s === 'string' ? [{ stock: s, cars: 1 }] : s;
  };
  const schedule: GtfsScheduleData = {
    v: 1,
    city: cfg.city,
    built: new Date().toISOString(),
    range: [Math.min(...dates), Math.max(...dates)],
    services: svcList,
    lines: usedLines.map((l) => ({ id: l, system: lineCfg.get(l)!.system, fleet: fleet(l) })),
    stations: stationIds,
    stops: stopMap,
    routes,
    strs,
    pats,
    tims,
    trips: tripRows.flatMap((r) => r.row),
  };
  if (consists.length) schedule.consists = consists;
  if (cfg.realtimeKeys) {
    schedule.keys = tripRows.map((r) => r.key ?? '');
    // Follow-on trips joined into a block keep their own realtime key, pointing at the joined row.
    if (chainAlias.size) {
      const rowOfTrip = new Map<string, number>();
      tripRows.forEach((r, i) => r.trip && rowOfTrip.set(r.trip, i));
      const alias: Record<string, number> = {};
      for (const [from, to] of chainAlias) {
        const row = rowOfTrip.get(to);
        if (row != null) alias[from] = row;
      }
      if (Object.keys(alias).length) schedule.keyAlias = alias;
    }
  }
  if (schedule.trips.length !== tripRows.length * TRIP_STRIDE) throw new Error('bad trip stride');

  // ------------------------------------------------------------------ transit.json
  const lines: LineDef[] = usedLines.map((id) => {
    const l = lineCfg.get(id)!;
    const r = lineRoutes.get(id)!.find((r) => r.route_color) ?? lineRoutes.get(id)![0];
    let color = l.color ?? (r.route_color ? `#${r.route_color}` : '');
    if (!color) {
      console.warn(`warning: line ${id} has no color; set one in the config`);
      color = '#888888';
    }
    color = color.toUpperCase();
    const textColor = (l.textColor ?? (r.route_text_color && l.color == null ? `#${r.route_text_color}` : contrast(color))).toUpperCase();
    const def: LineDef = { id, system: l.system, name: l.name, short: l.short, color, textColor, kind: l.kind, bullet: l.bullet, stock: fleet(id)[0].stock };
    if (l.nameLocal) def.nameLocal = l.nameLocal;
    return def;
  });
  const segments: SegmentDef[] = [];
  const kindOfSeg = (ls: Set<string>) => {
    const kinds = new Set([...ls].map((l) => lineCfg.get(l)!.kind));
    return kinds.size === 1 ? [...kinds][0] : undefined;
  };
  let folded = 0;
  for (const list of segs.values()) {
    list.sort((a, b) => b.n - a.n);
    if (geo.variants !== 'keep') {
      for (let i = 1; i < list.length; i++) {
        const s = list[i];
        // Trams keep their variants: they are usually one-way streets or different routes, not parallel tracks.
        const tram = (ls: Set<string>) => [...ls].some((l) => lineCfg.get(l)!.kind === 'tram');
        const within = geo.mergeWithin ?? 150;
        const len = (pts: Flat) => cumulative(pts).at(-1)!;
        const shares = (o: { lines: Set<string> }) => [...o.lines].some((l) => s.lines.has(l));
        // A variant of the same line almost twice as long and over a km longer than the kept one, yet timetabled no
        // slower, is a shape that runs into a turnback or loop past the station, not the real path: fold it whatever
        // the distance. (A real loop takes longer; shorter detours are usually one-way street pairs.)
        const detour = list
          .slice(0, i)
          .find((o) => shares(o) && len(s.pts) > 1.8 * len(o.pts) && len(s.pts) - len(o.pts) > 1000 && Number.isFinite(s.dt) && Number.isFinite(o.dt) && s.dt < 1.3 * o.dt);
        if (detour) debug(`detour ${[...s.lines].join('+')} ${stations.get(s.from)!.name} - ${stations.get(s.to)!.name}: ${len(s.pts).toFixed(0)} m vs ${len(detour.pts).toFixed(0)} m`);
        const into =
          detour ??
          (tram(s.lines) ? undefined : list.slice(0, i).find((o) => !tram(o.lines) && (shares(o) || kindOfSeg(o.lines) === kindOfSeg(s.lines)) && separation(o.pts, s.pts) <= within));
        if (!into) continue;
        for (const l of s.lines) into.lines.add(l);
        list.splice(i--, 1);
        folded++;
      }
    }
    for (const s of list) {
      const seg: SegmentDef = { from: s.from, to: s.to, lines: [...s.lines].sort((a, b) => rank(a) - rank(b)), pts: roundFlat(s.pts) };
      if (s.el?.some((v) => v !== 0)) seg.el = s.el;
      segments.push(seg);
    }
  }
  const stationDefs: StationDef[] = [...stations.values()]
    .filter((s) => s.lines.size)
    .map((s) => {
      const def: StationDef = { id: s.id, name: s.name, x: Math.round(s.x * 10) / 10, y: Math.round(s.y * 10) / 10, lines: [...s.lines].sort((a, b) => rank(a) - rank(b)) };
      if (s.nameLocal && s.nameLocal !== s.name) def.nameLocal = s.nameLocal;
      return def;
    });
  const transit: TransitData = {
    city: cfg.city,
    built: new Date().toISOString().slice(0, 10),
    attribution: cfg.attribution,
    systems: cfg.systems.filter((sys) => lines.some((l) => l.system === sys.id)),
    lines,
    stations: stationDefs,
    segments,
  };
  const write = (rel: string, data: unknown) => {
    const file = join(ROOT, rel);
    mkdirSync(dirname(file), { recursive: true });
    const text = JSON.stringify(data);
    writeFileSync(file, text);
    console.log(`wrote ${rel} (${(text.length / 1024).toFixed(0)} KB)`);
  };
  write(cfg.out?.transit ?? `public/data/${cfg.city}/transit.json`, transit);
  write(cfg.out?.schedule ?? `server/data/${cfg.city}/schedule.json`, schedule);
  console.log(`stations ${stationDefs.length} (${splits} groups split), segments ${segments.length}${folded ? ` (${folded} variants merged)` : ''}, lines ${lines.length}`);
  console.log(`geometry: ${stats.shapePairs} shape pieces, ${stats.osmPairs} OSM paths, ${stats.straight} straight, ${stats.variants} variants; max end-to-station ${far.toFixed(0)} m (${farWhere})`);
  console.log(`schedule: ${tripRows.length} trips, ${pats.length} patterns, ${tims.length} timings, ${svcList.length} services, ${Object.keys(stopMap).length} stop ids, dates ${schedule.range.join('–')}`);
  if (DEBUG) for (const l of lines) console.log(`  ${l.id} ${l.color} ${l.name}: ${trips.filter((t) => t.info.line === l.id).length} trips`);
}

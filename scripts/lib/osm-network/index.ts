// Sim kit, build side (docs/KIT_SIM.md): OSM route relations → stations, stopping sequences, track geometry and
// simulated service patterns. Writes public/data/<city>/transit.json and server/data/<city>/sim.json.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { CITIES } from '../../../shared/cities.ts';
import { flatLength, makeProjection, roundFlat } from '../../../shared/geo.ts';
import type { Flat, LineDef, SegmentDef, StationDef, TransitData } from '../../../shared/types.ts';
import type { SimData, SimDay, SimLine, SimPattern, SimWeek } from '../../../server/adapters/sim/data.ts';
import type { DayService, DayServices, PatternConfig, RunModel, SimCityConfig, SimLineConfig, StockShare } from './config.ts';
import { Graph, curve, douglasPeucker, finishPath, shortestPath, similar, snapCandidates, type Path, type Snap } from './geometry.ts';
import { cleanDisplay, extendsName, nameKey, slug, transliterateCyrillic } from './names.ts';
import { overpass, type OsmElement } from './overpass.ts';

export type * from './config.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const RAIL = 'subway|light_rail|monorail|rail|narrow_gauge|tram|funicular';

interface RawStop {
  key: string; // nameKey of the local name
  x: number;
  y: number;
  inside: boolean;
}

interface Variant {
  line: string;
  rel: number; // 0 for configured sequences
  seq: string[]; // station ids inside the map, '~key' outside
  raw: RawStop[];
  loop: boolean;
}

export async function buildSimCity(cfg: SimCityConfig): Promise<void> {
  const city = CITIES[cfg.city];
  const proj = makeProjection(cfg.city);
  const [W, S, E, N] = city.bbox;
  const qb = cfg.queryBbox ?? [W - 0.15, S - 0.15, E + 0.15, N + 0.15];
  const inBox = (lon: number, lat: number) => lon >= W && lon <= E && lat >= S && lat <= N;
  const cache = (name: string) => join(ROOT, `.cache/${cfg.city}/osm/${name}`);
  const box = (b: number[]) => `${b[1]},${b[0]},${b[3]},${b[2]}`;
  const dwellOf = (line: SimLineConfig, interchange: boolean) => (interchange ? line.run.dwellInterchange ?? line.run.dwell + 10 : line.run.dwell);
  const lineCfg = new Map(cfg.lines.map((l) => [l.id, l]));

  // ------------------------------------------------------------------------- OSM
  console.log(`${cfg.city}: OSM route relations...`);
  const needsMatch = cfg.lines.some((l) => l.osm.match);
  const relTags = needsMatch
    ? await overpass(cache(`relations-${hashOf(qb)}.json`), `[out:json][timeout:300];relation["type"="route"]["route"~"^(${RAIL}|train|railway)$"](${box(qb)});out tags;`)
    : { elements: [] as OsmElement[] };
  const masterIds = cfg.lines.flatMap((l) => l.osm.masters ?? []);
  const masters = masterIds.length
    ? await overpass(cache(`masters-${hashOf(masterIds)}.json`), `[out:json][timeout:120];rel(id:${masterIds.join(',')});out body;`)
    : { elements: [] as OsmElement[] };
  const relsOfLine = new Map<string, number[]>();
  for (const l of cfg.lines) {
    const ids = new Set(l.osm.relations ?? []);
    for (const m of masters.elements) if (l.osm.masters?.includes(m.id)) for (const mm of m.members ?? []) if (mm.type === 'relation') ids.add(mm.ref);
    if (l.osm.match) {
      const re = Object.entries(l.osm.match).map(([k, v]) => [k, new RegExp(v as string)] as const);
      for (const r of relTags.elements) if (re.every(([k, rx]) => rx.test(r.tags?.[k] ?? ''))) ids.add(r.id);
    }
    relsOfLine.set(l.id, [...ids]);
    if (!ids.size && !l.osm.sequences?.length) throw new Error(`${cfg.city} line ${l.id}: no OSM relations found`);
  }
  const allRels = [...new Set([...relsOfLine.values()].flat())].sort((a, b) => a - b);
  const routes = allRels.length
    ? await overpass(cache(`routes-${hashOf(allRels)}.json`), `[out:json][timeout:600];rel(id:${allRels.join(',')})->.r;.r out body;way(r.r);out geom;node(r.r);out;`)
    : { elements: [] as OsmElement[] };
  const stationRes = await overpass(
    cache(`stations-${hashOf(qb)}.json`),
    `[out:json][timeout:300];(node["railway"~"^(station|halt|tram_stop)$"](${box(qb)});node["public_transport"="station"](${box(qb)}););out;`,
  );
  const kinds = new Set(cfg.lines.map((l) => l.kind));
  const trackTypes = ['subway', 'light_rail', 'monorail', 'rail', 'narrow_gauge', ...(kinds.has('tram') ? ['tram'] : [])].join('|');
  const tracks = await overpass(
    cache(`tracks-${hashOf([trackTypes, ...city.bbox])}.json`),
    `[out:json][timeout:600];way["railway"~"^(${trackTypes})$"]["service"!~"^(yard|siding|spur|crossover)$"](${box(city.bbox)});out geom;`,
  );

  const ways = new Map<number, OsmElement>();
  const rels = new Map<number, OsmElement>();
  const nodes = new Map<number, OsmElement>();
  for (const el of routes.elements) {
    if (el.type === 'way' && el.geometry && el.nodes) ways.set(el.id, el);
    else if (el.type === 'relation') rels.set(el.id, el);
    else if (el.type === 'node') nodes.set(el.id, el);
  }
  const stationNodes = stationRes.elements.filter((e) => e.type === 'node' && e.tags?.name);
  const xyOf = (n: { lon?: number; lat?: number }) => proj.project(n.lon!, n.lat!);

  // ------------------------------------------------------------------------- names
  const localTags = cfg.names?.local ?? ['name'];
  const enTags = cfg.names?.en ?? ['name:en'];
  const tagOf = (tags: Record<string, string> | undefined, list: string[]) => list.map((t) => tags?.[t]).find((v) => v && v.trim());
  const display = new Map<string, { local: string; en: Map<string, number> }>();
  const aliases = new Map<string, string>(); // nameKey of any name -> station key
  const noteNames = (tags: Record<string, string> | undefined, w: number): string | undefined => {
    const local = tagOf(tags, localTags) ?? tags?.name;
    if (!local) return undefined;
    const key = nameKey(local);
    if (!key) return undefined;
    let d = display.get(key);
    if (!d) display.set(key, (d = { local: cleanDisplay(local), en: new Map() }));
    const en = tagOf(tags, enTags);
    if (en) d.en.set(cleanDisplay(en), (d.en.get(cleanDisplay(en)) ?? 0) + w);
    for (const v of [local, tags?.name, en, ...Object.entries(tags ?? {}).filter(([k]) => k.startsWith('name:') || k === 'official_name' || k === 'alt_name').map(([, v]) => v)]) {
      if (v && !aliases.has(nameKey(v))) aliases.set(nameKey(v), key);
    }
    aliases.set(key, key);
    return key;
  };
  const stationKeys = new Set(stationNodes.map((s) => noteNames(s.tags, 2)));
  const mergeKey = new Map<string, string>(); // configured merges: every name -> the first one's key
  const keyOfName = (name: string): string => {
    const k = aliases.get(nameKey(name)) ?? nameKey(name);
    return mergeKey.get(k) ?? k;
  };
  const nearestStation = (x: number, y: number, maxD: number) => {
    let best: OsmElement | undefined, bd = maxD;
    for (const s of stationNodes) {
      const [sx, sy] = xyOf(s);
      const d = Math.hypot(sx - x, sy - y);
      if (d < bd) (bd = d), (best = s);
    }
    return best;
  };

  // ------------------------------------------------------------------------- stopping sequences
  const rawVariants: { line: string; rel: number; stops: RawStop[] }[] = [];
  for (const l of cfg.lines) {
    for (const rid of relsOfLine.get(l.id)!) {
      const r = rels.get(rid);
      if (!r) continue;
      let members = (r.members ?? []).filter((m) => m.type === 'node' && /^stop/.test(m.role));
      if (!members.length) members = (r.members ?? []).filter((m) => /^platform/.test(m.role));
      const stops: RawStop[] = [];
      for (const m of members) {
        let x: number, y: number, tags: Record<string, string> | undefined, lon: number, lat: number;
        if (m.type === 'node') {
          const n = nodes.get(m.ref);
          if (!n) continue;
          [x, y] = xyOf(n);
          (lon = n.lon!), (lat = n.lat!), (tags = n.tags);
        } else if (m.type === 'way' && ways.get(m.ref)?.geometry) {
          const g = ways.get(m.ref)!.geometry!;
          (lon = g.reduce((s, p) => s + p.lon, 0) / g.length), (lat = g.reduce((s, p) => s + p.lat, 0) / g.length);
          [x, y] = proj.project(lon, lat);
          tags = ways.get(m.ref)!.tags;
        } else continue;
        let key = noteNames(tags, 1);
        if (!key) {
          const st = nearestStation(x, y, 300);
          key = st && noteNames(st.tags, 0);
        } else if (!stationKeys.has(key)) {
          // Platform-specific stop names ('Sengkang - East Loop Clockwise') take their station's name.
          const st = nearestStation(x, y, 250);
          const sk = st && noteNames(st.tags, 0);
          if (sk && key.startsWith(sk) && extendsName(tagOf(tags, localTags) ?? tags!.name, sk)) key = sk;
        }
        if (!key) continue;
        key = mergeKey.get(key) ?? key;
        if (stops.length && stops[stops.length - 1].key === key) continue;
        stops.push({ key, x, y, inside: inBox(lon, lat) });
      }
      if (stops.length >= 2) rawVariants.push({ line: l.id, rel: rid, stops });
    }
    for (const seqNames of l.osm.sequences ?? []) {
      // Prefer the line's own stops, then any route's stop members, then station nodes (a same-named railway halt
      // must not pull the position away).
      const candsOf = (name: string): RawStop[] => {
        const key = keyOfName(name);
        const asStop = (n: OsmElement): RawStop => ({ key, x: xyOf(n)[0], y: xyOf(n)[1], inside: inBox(n.lon!, n.lat!) });
        let cands: RawStop[] = rawVariants.filter((v) => v.line === l.id).flatMap((v) => v.stops).filter((st) => st.key === key);
        if (!cands.length) cands = [...nodes.values()].filter((n) => n.tags?.name && noteNames(n.tags, 0) === key).map(asStop);
        if (!cands.length) cands = stationNodes.filter((n) => noteNames(n.tags, 0) === key).map(asStop);
        if (!cands.length) console.warn(`  ${l.id}: station '${name}' not found in OSM`);
        return cands;
      };
      const all = seqNames.map(candsOf).filter((c) => c.length);
      const stops: RawStop[] = [];
      for (const [i, cands] of all.entries()) {
        const key = cands[0].key;
        // Each stop is the namesake nearest the previous one; the first, with none before it, the one nearest the next
        // stop's namesakes (天王寺 of the right operator).
        const prev = stops[stops.length - 1];
        const d = (c: RawStop) =>
          prev ? Math.hypot(c.x - prev.x, c.y - prev.y) : all[i + 1] ? Math.min(...all[i + 1].map((n) => Math.hypot(c.x - n.x, c.y - n.y))) : 0;
        const pick = cands.reduce((a, b) => (d(b) < d(a) ? b : a));
        // Average the candidates of the same station (both platforms), not across far-apart namesakes.
        const near = cands.filter((c) => Math.hypot(c.x - pick.x, c.y - pick.y) < 300);
        stops.push({ key, x: mean(near.map((c) => [c.x, c.y]), 0), y: mean(near.map((c) => [c.x, c.y]), 1), inside: pick.inside });
      }
      if (stops.length >= 2) rawVariants.push({ line: l.id, rel: 0, stops }, { line: l.id, rel: 0, stops: [...stops].reverse() });
    }
  }
  // Configured merges: all names of a group count as its first name.
  for (const group of cfg.stations?.merge ?? []) {
    const k0 = keyOfName(group[0]);
    for (const n of group) mergeKey.set(keyOfName(n), k0);
  }
  for (const v of rawVariants) for (const s of v.stops) s.key = mergeKey.get(s.key) ?? s.key;

  // ------------------------------------------------------------------------- stations
  const englishOf = (key: string): [string, string] => {
    const rename = Object.entries(cfg.stations?.rename ?? {}).find(([n]) => keyOfName(n) === key)?.[1];
    const d = display.get(key);
    const local = rename?.[1] ?? d?.local ?? key;
    const votes = [...(d?.en ?? new Map<string, number>())].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length);
    const en = rename?.[0] ?? votes[0]?.[0] ?? (cfg.names?.transliterate === 'cyrillic' ? transliterateCyrillic(local) : local);
    return [en, local];
  };
  const linePts = new Map<string, number[][]>();
  for (const v of rawVariants) {
    for (const s of v.stops) {
      if (!s.inside) continue;
      const k = `${v.line}\u0000${s.key}`;
      if (!linePts.has(k)) linePts.set(k, []);
      linePts.get(k)!.push([s.x, s.y]);
    }
  }
  interface LineStation {
    line: string;
    key: string;
    x: number;
    y: number;
    station?: string;
  }
  const lineStations = new Map<string, LineStation>();
  for (const [k, pts] of linePts) {
    const [line, key] = k.split('\u0000');
    lineStations.set(k, { line, key, x: mean(pts, 0), y: mean(pts, 1) });
  }
  const MERGE = cfg.stations?.mergeDistance ?? 650, SPLIT = cfg.stations?.splitDistance ?? 160;
  interface StationInfo {
    id: string;
    key: string;
    x: number;
    y: number;
    lines: Set<string>;
    members: LineStation[];
  }
  const stations = new Map<string, StationInfo>();
  const byKey = new Map<string, LineStation[]>();
  for (const ls of lineStations.values()) {
    if (!byKey.has(ls.key)) byKey.set(ls.key, []);
    byKey.get(ls.key)!.push(ls);
  }
  for (const [key, list] of byKey) {
    const merged = [...mergeKey.values()].includes(key);
    const clusters: LineStation[][] = [];
    for (const ls of list) {
      const hit = clusters.find((c) => merged || c.some((o) => Math.hypot(o.x - ls.x, o.y - ls.y) < MERGE));
      if (hit) hit.push(ls);
      else clusters.push([ls]);
    }
    for (let ci = 0; ci < clusters.length; ci++) {
      for (;;) {
        const c = clusters[ci];
        if (c.length < 2) break;
        const x = mean(c.map((m) => [m.x, m.y]), 0), y = mean(c.map((m) => [m.x, m.y]), 1);
        const far = c.reduce((a, b) => (Math.hypot(b.x - x, b.y - y) > Math.hypot(a.x - x, a.y - y) ? b : a));
        if (Math.hypot(far.x - x, far.y - y) <= SPLIT) break;
        c.splice(c.indexOf(far), 1);
        clusters.push([far]);
      }
    }
    clusters.sort((a, b) => b.length - a.length);
    clusters.forEach((c, ci) => {
      let id = slug(englishOf(key)[0]) || slug(key) || `s${stations.size}`;
      if (ci > 0 || stations.has(id)) id = `${id}-${slug(c[0].line)}`;
      while (stations.has(id)) id += '-x';
      const st: StationInfo = { id, key, x: mean(c.map((m) => [m.x, m.y]), 0), y: mean(c.map((m) => [m.x, m.y]), 1), lines: new Set(c.map((m) => m.line)), members: c };
      for (const m of c) m.station = id;
      stations.set(id, st);
    });
  }
  const stationOf = (line: string, key: string) => lineStations.get(`${line}\u0000${key}`)?.station;

  // ------------------------------------------------------------------------- variants and adjacency
  // Stops up to BRIDGE_MARGIN outside the map: one whose station is on the map (the other direction's platform is
  // inside) is that station, and a pattern bridges up to BRIDGE others rather than being cut in two.
  const BRIDGE = 2, BRIDGE_MARGIN = 1500;
  const corners = [proj.project(W, S), proj.project(W, N), proj.project(E, S), proj.project(E, N)];
  const [bx0, bx1] = [Math.min(...corners.map((c) => c[0])), Math.max(...corners.map((c) => c[0]))];
  const [by0, by1] = [Math.min(...corners.map((c) => c[1])), Math.max(...corners.map((c) => c[1]))];
  const nearMap = (s: RawStop) => Math.hypot(Math.max(bx0 - s.x, 0, s.x - bx1), Math.max(by0 - s.y, 0, s.y - by1)) < BRIDGE_MARGIN;
  const loopLines = new Set(cfg.lines.filter((l) => l.patterns.some((p) => p.loop)).map((l) => l.id));
  const variants: Variant[] = rawVariants.map((v) => {
    let stops = v.stops;
    // Circle relations often stop short of repeating their first station: close them when the ends are near.
    const [a, b] = [stops[0], stops[stops.length - 1]];
    if (loopLines.has(v.line) && a.key !== b.key && stops.length >= 6 && Math.hypot(a.x - b.x, a.y - b.y) < 2500) stops = [...stops, a];
    const seq = stops.map((s) => {
      const st = stationOf(v.line, s.key);
      return st && (s.inside || nearMap(s)) ? st : `~${s.key}`;
    });
    return { line: v.line, rel: v.rel, seq, raw: stops, loop: seq.length > 3 && stops[0].key === stops[stops.length - 1].key };
  });
  const dist = (a: string, b: string) => Math.hypot(stations.get(a)!.x - stations.get(b)!.x, stations.get(a)!.y - stations.get(b)!.y);
  const adj = new Map<string, Map<string, Set<string>>>();
  const addAdj = (line: string, a: string, b: string) => {
    if (!adj.has(line)) adj.set(line, new Map());
    const m = adj.get(line)!;
    for (const [p, q] of [[a, b], [b, a]]) {
      if (!m.has(p)) m.set(p, new Set());
      m.get(p)!.add(q);
    }
  };
  for (const v of variants) for (let i = 1; i < v.seq.length; i++) if (!v.seq[i - 1].startsWith('~') && !v.seq[i].startsWith('~') && v.seq[i - 1] !== v.seq[i]) addAdj(v.line, v.seq[i - 1], v.seq[i]);
  // Relations that skip a station would add a false hop: drop A–C where A–B–C runs about as far.
  for (const m of adj.values()) {
    for (const [a, ns] of m) {
      for (const c of [...ns]) {
        for (const b of ns) {
          if (b === c || !m.get(b)?.has(c)) continue;
          if (dist(a, b) + dist(b, c) < 1.6 * dist(a, c) + 300) {
            ns.delete(c);
            m.get(c)!.delete(a);
            break;
          }
        }
      }
    }
  }
  for (const v of variants) {
    const m = adj.get(v.line);
    if (!m) continue;
    const seq: string[] = [v.seq[0]], raw: RawStop[] = [v.raw[0]];
    for (let i = 1; i < v.seq.length; i++) {
      const a = seq[seq.length - 1], c = v.seq[i];
      if (!a.startsWith('~') && !c.startsWith('~') && !m.get(a)?.has(c)) {
        const mid = [...(m.get(a) ?? [])].find((b) => m.get(b)?.has(c));
        if (mid) {
          const st = stations.get(mid)!;
          seq.push(mid);
          raw.push({ key: st.key, x: st.x, y: st.y, inside: true });
        }
      }
      seq.push(c);
      raw.push(v.raw[i]);
    }
    (v.seq = seq), (v.raw = raw);
  }

  // ------------------------------------------------------------------------- service patterns
  interface Resolved {
    line: string;
    id: string;
    conf: PatternConfig;
    group: string;
    full: RawStop[]; // the whole run from terminal to terminal (either may lie outside the map)
    fullSeq: string[];
    fullStop: boolean[]; // stops at (else passes) each of full
    at: number[]; // index in full of each station of seq
    seq: string[]; // the stations shown: the longest stretch inside the map
    stop: boolean[];
    dest: [string, string];
    dir?: string;
    from: string; // terminal key
  }
  const resolved: Resolved[] = [];
  const skipPairs: { line: string; a: string; b: string }[] = []; // consecutive stations of a pattern that aren't neighbors
  // A pattern shows its longest stretch inside the map.
  const stretchOf = (fullSeq: string[], full: RawStop[]): number[] => {
    let best: number[] = [], cur: number[] = [], gap: number[] = [];
    fullSeq.forEach((s, k) => {
      if (s.startsWith('~')) return void gap.push(k);
      if (cur.length && (gap.length > BRIDGE || !gap.every((g) => nearMap(full[g])))) cur = [];
      cur.push(k);
      gap = [];
      if (cur.length > best.length) best = [...cur];
    });
    return best;
  };
  const keyAt = (v: Variant, i: number) => (v.seq[i].startsWith('~') ? v.seq[i].slice(1) : stations.get(v.seq[i])!.key);
  for (const l of cfg.lines) {
    l.patterns.forEach((p, pi) => {
      const from = keyOfName(p.from), to = keyOfName(p.to), via = (p.via ?? []).map(keyOfName);
      const hits: { v: Variant; i: number; j: number; mark: string; dir?: string }[] = [];
      if (p.loop) {
        const loops = variants.filter((v) => v.line === l.id && v.loop && via.every((w) => v.seq.some((_, k) => keyAt(v, k) === w)));
        const seen = new Set<string>();
        for (const v of loops) {
          const i = v.seq.findIndex((_, k) => keyAt(v, k) === from);
          if (i < 0) continue;
          // Rotate the closed sequence to start and end at `from`.
          const body = v.seq.slice(0, -1), rawBody = v.raw.slice(0, -1);
          const seq = [...body.slice(i), ...body.slice(0, i), body[i]], raw = [...rawBody.slice(i), ...rawBody.slice(0, i), rawBody[i]];
          const pts = seq.filter((s) => !s.startsWith('~')).map((s) => [stations.get(s)!.x, stations.get(s)!.y]);
          let area = 0;
          for (let k = 0; k < pts.length; k++) area += pts[k][0] * pts[(k + 1) % pts.length][1] - pts[(k + 1) % pts.length][0] * pts[k][1];
          const dir = area < 0 ? 'Clockwise' : 'Counterclockwise';
          if (seen.has(dir)) continue;
          seen.add(dir);
          hits.push({ v: { ...v, seq, raw }, i: 0, j: seq.length - 1, mark: dir === 'Clockwise' ? '>' : '<', dir });
        }
        // OSM maps only one direction of some two-way loops: run the other direction over the same stations.
        if (hits.length === 1) {
          const h = hits[0];
          const dir = h.dir === 'Clockwise' ? 'Counterclockwise' : 'Clockwise';
          hits.push({ v: { ...h.v, seq: [...h.v.seq].reverse(), raw: [...h.v.raw].reverse() }, i: 0, j: h.j, mark: h.mark === '>' ? '<' : '>', dir });
        }
      } else {
        const dirs: [string, string, string][] = p.oneWay ? [[from, to, '>']] : [[from, to, '>'], [to, from, '<']];
        for (const [f, t, mark] of dirs) {
          const hit = findSlice(l.id, f, t, via);
          if (hit) hits.push({ ...hit, mark, dir: l.directions?.[mark === '>' ? 0 : 1] });
          else console.warn(`  ${cfg.city} ${l.id}: no OSM sequence runs ${p.from} → ${p.to}${mark === '<' ? ' (reverse)' : ''}${p.via ? ` via ${p.via.join(', ')}` : ''}`);
        }
      }
      for (const h of hits) {
        const fullSeq = h.v.seq.slice(h.i, h.j + 1), full = h.v.raw.slice(h.i, h.j + 1);
        const at = stretchOf(fullSeq, full);
        if (at.length < 2) continue;
        const seq = at.map((k) => fullSeq[k]);
        const exp = p.express ? new Set(p.express.map(keyOfName)) : null;
        // An express stops at its terminals and its listed stations. Where it leaves the map, the edge station is
        // only where the timeline ends: it passes it.
        const fullStop = fullSeq.map((s, k) => !exp || k === 0 || k === fullSeq.length - 1 || exp.has(s.startsWith('~') ? s.slice(1) : stations.get(s)!.key));
        const stop = at.map((k) => fullStop[k]);
        // Trains run between the timeline's stations: an express's stops, and either side of a bridged excursion.
        let prev = seq[0];
        for (let k = 1; k < seq.length; k++) {
          if (!stop[k] && k !== seq.length - 1) continue;
          if (!adj.get(l.id)?.get(prev)?.has(seq[k])) skipPairs.push({ line: l.id, a: prev, b: seq[k] });
          prev = seq[k];
        }
        const destKey = h.mark === '<' && !p.loop ? from : to;
        const loopLocal = cfg.names?.loop?.[h.dir === 'Clockwise' ? 0 : 1];
        const named = p.loop ? p.loopDest?.[h.dir as 'Clockwise' | 'Counterclockwise'] : undefined;
        const dest: [string, string] = named
          ? [named[0], named[1] ?? named[0]]
          : p.dest
            ? [p.dest[0], p.dest[1] ?? p.dest[0]]
            : p.loop
              ? [h.dir!, loopLocal ?? h.dir!]
              : englishOf(destKey);
        resolved.push({
          line: l.id,
          id: `${pi}${h.mark === '<' ? 'r' : ''}`,
          conf: p,
          group: `${p.group ?? 'main'}${h.mark}`,
          full,
          fullSeq,
          fullStop,
          at,
          seq,
          stop,
          dest,
          dir: h.dir,
          from: keyAt(h.v, h.i),
        });
      }
    });
  }

  function findSlice(line: string, from: string, to: string, via: string[]) {
    let best: { v: Variant; i: number; j: number } | null = null;
    for (const v of variants) {
      if (v.line !== line) continue;
      for (let i = 0; i < v.seq.length; i++) {
        if (keyAt(v, i) !== from) continue;
        for (let j = i + 1; j < v.seq.length; j++) {
          if (keyAt(v, j) !== to) continue;
          const keys = v.seq.slice(i, j + 1).map((_, k) => keyAt(v, i + k));
          // A run that passes `to` before reaching `via` (天王寺 → Loop → 天王寺) takes the later `to`.
          if (!via.every((w) => keys.includes(w))) continue;
          if (!best || j - i < best.j - best.i) best = { v, i, j };
          break;
        }
      }
    }
    return best;
  }

  // ------------------------------------------------------------------------- track geometry
  console.log(`${cfg.city}: track geometry...`);
  const graphs = new Map<string, Graph>();
  const all = new Graph(proj.project);
  const allSeen = new Set<number>();
  const TRACK = new RegExp(`^(${RAIL}|construction)$`);
  for (const l of cfg.lines) {
    const g = new Graph(proj.project);
    const seen = new Set<number>();
    for (const rid of relsOfLine.get(l.id)!) {
      for (const m of rels.get(rid)?.members ?? []) {
        const w = m.type === 'way' ? ways.get(m.ref) : undefined;
        if (!w || seen.has(w.id) || !TRACK.test(w.tags?.railway ?? '')) continue;
        seen.add(w.id);
        g.addWay(w);
        if (!allSeen.has(w.id)) allSeen.add(w.id), all.addWay(w);
      }
    }
    graphs.set(l.id, g);
  }
  for (const w of tracks.elements) if (w.type === 'way' && w.geometry && w.nodes && !allSeen.has(w.id)) allSeen.add(w.id), all.addWay(w);

  const pairs = new Map<string, { a: string; b: string; lines: Set<string> }>();
  const pk = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const addPair = (line: string, a: string, b: string) => {
    const k = pk(a, b);
    if (!pairs.has(k)) pairs.set(k, { a: a < b ? a : b, b: a < b ? b : a, lines: new Set() });
    pairs.get(k)!.lines.add(line);
  };
  for (const [line, m] of adj) for (const [a, ns] of m) for (const b of ns) if (a < b) addPair(line, a, b);
  for (const e of skipPairs) addPair(e.line, e.a, e.b);

  const linePos = (line: string, sid: string): [number, number] => {
    const st = stations.get(sid)!;
    const m = st.members.find((x) => x.line === line) ?? st.members[0];
    return [m.x, m.y];
  };
  const snapCache = new Map<string, Snap[]>();
  const snapOn = (gid: string, g: Graph, line: string, sid: string) => {
    const k = `${gid}|${line}|${sid}`;
    if (!snapCache.has(k)) snapCache.set(k, snapCandidates(g, ...linePos(line, sid), 350));
    return snapCache.get(k)!;
  };
  const pairLen = new Map<string, number>();
  const segments: SegmentDef[] = [];
  const fallbacks: string[] = [];
  for (const p of pairs.values()) {
    const geoms: { pts: Flat; el: number[]; lines: string[] }[] = [];
    for (const line of p.lines) {
      const [ax, ay] = linePos(line, p.a), [bx, by] = linePos(line, p.b);
      const straight = Math.hypot(bx - ax, by - ay);
      let path: Path | null = null;
      for (const [gid, g] of [[line, graphs.get(line)!], ['all', all]] as [string, Graph][]) {
        if (!g.edges.length) continue;
        const As = snapOn(gid, g, line, p.a), Bs = snapOn(gid, g, line, p.b);
        if (!As.length || !Bs.length) continue;
        const found = shortestPath(g, As, Bs);
        if (found && found.len <= 2.2 * straight + 500) {
          path = found;
          break;
        }
      }
      let pts: Flat, el: number[];
      if (path) {
        ({ pts, el } = finishPath(path));
        const A = stations.get(p.a)!, B = stations.get(p.b)!;
        if (Math.hypot(pts[0] - A.x, pts[1] - A.y) > 150) pts.unshift(r1(ax), r1(ay)), el.unshift(el[0]);
        if (Math.hypot(pts[pts.length - 2] - B.x, pts[pts.length - 1] - B.y) > 150) pts.push(r1(bx), r1(by)), el.push(el[el.length - 1]);
      } else {
        fallbacks.push(`${line}: ${p.a} – ${p.b}`);
        pts = roundFlat(douglasPeucker(curve(null, [ax, ay], [bx, by], null), 2));
        el = new Array(pts.length / 2).fill(lineCfg.get(line)!.kind === 'subway' ? -1 : 0);
      }
      pairLen.set(`${line}|${pk(p.a, p.b)}`, flatLength(pts));
      const same = geoms.find((g) => similar(g.pts, pts));
      if (same) same.lines.push(line);
      else geoms.push({ pts, el, lines: [line] });
    }
    for (const g of geoms) {
      const seg: SegmentDef = { from: p.a, to: p.b, lines: g.lines.sort(), pts: g.pts };
      if (g.el.some((v) => v !== 0)) seg.el = g.el;
      segments.push(seg);
    }
  }

  // ------------------------------------------------------------------------- times
  const runTime = (d: number, run: RunModel, scale = 1) => {
    const v = run.vmax / 3.6, acc = run.acc ?? 0.9, dec = run.dec ?? 1.0;
    const dA = (v * v) / (2 * acc), dD = (v * v) / (2 * dec);
    let t: number;
    if (d >= dA + dD) t = v / acc + v / dec + (d - dA - dD) / v;
    else {
      const vp = Math.sqrt((2 * d * acc * dec) / (acc + dec));
      t = vp / acc + vp / dec;
    }
    return (t * (run.margin ?? 1.08) + 6) * scale;
  };
  /** Run time between consecutive stops of a pattern (either may lie outside the map). */
  const hop = (l: SimLineConfig, a: RawStop, b: RawStop, sa: string, sb: string, scale: number) => {
    const exact = Object.entries(l.run.runTimes ?? {}).find(([k]) => {
      const [x, y] = k.split('|').map(keyOfName);
      return (x === a.key && y === b.key) || (x === b.key && y === a.key);
    });
    if (exact) return exact[1];
    const len = !sa.startsWith('~') && !sb.startsWith('~') ? pairLen.get(`${l.id}|${pk(sa, sb)}`) : undefined;
    return runTime(len ?? Math.hypot(a.x - b.x, a.y - b.y) * 1.2, l.run, scale);
  };
  /** Arrival and departure offsets along a whole pattern from its terminal, and the running time so far. */
  const walk = (l: SimLineConfig, r: Resolved, scale: number) => {
    const a: number[] = [], d: number[] = [], runs: number[] = [];
    let clock = 0, running = 0;
    r.full.forEach((s, k) => {
      if (k > 0) {
        const h = hop(l, r.full[k - 1], s, r.fullSeq[k - 1], r.fullSeq[k], scale);
        clock += h;
        running += h;
      }
      const stops = r.fullStop[k];
      const interchange = !r.fullSeq[k].startsWith('~') && stations.get(r.fullSeq[k])!.lines.size > 1;
      a.push(clock);
      runs.push(running);
      if (k > 0 && k < r.full.length - 1 && stops) clock += dwellOf(l, interchange);
      d.push(clock);
    });
    return { a, d, runs };
  };
  /** [a0, d0, a1, d1, ...] from the terminal's departure, for the stations inside the map. */
  const timesOf = (l: SimLineConfig, r: Resolved, scale: number): number[] => {
    const w = walk(l, r, scale);
    const t: number[] = [];
    for (const k of r.at) t.push(w.a[k], w.d[k]);
    return t;
  };

  // ------------------------------------------------------------------------- output
  const stationList = [...stations.values()].sort((a, b) => a.id.localeCompare(b.id));
  const sidx = new Map(stationList.map((s, i) => [s.id, i]));
  const dayStart = parseTime(cfg.calendar.dayStart ?? '03:00', 0);
  const toDay = (d: DayService, dayStartSec: number): SimDay => {
    const out: SimDay = {
      first: parseTime(d.first, dayStartSec),
      last: parseTime(d.last, dayStartSec),
      hw: d.headways.map(([t, m]) => [parseTime(t, dayStartSec), Math.round(m * 60)] as [number, number]).sort((a, b) => a[0] - b[0]),
    };
    if (d.terminals) {
      out.terminals = {};
      for (const [name, v] of Object.entries(d.terminals)) {
        out.terminals[keyOfName(name)] = {
          ...(v.first ? { first: parseTime(v.first, dayStartSec) } : {}),
          ...(v.last ? { last: parseTime(v.last, dayStartSec) } : {}),
        };
      }
    }
    return out;
  };
  const NONE: SimDay = { first: 0, last: -1, hw: [[0, 0]] };
  const toWeek = (s: DayServices): SimWeek => {
    const pick = (d: DayService | null | undefined, ...fallbacks: (DayService | null | undefined)[]): DayService | null => {
      for (const x of [d, ...fallbacks]) if (x !== undefined) return x;
      return null;
    };
    const sat = pick(s.saturday, s.sunday, s.weekday), sun = pick(s.sunday, s.saturday, s.weekday);
    return [toDay(s.weekday, dayStart), sat ? toDay(sat, dayStart) : NONE, sun ? toDay(sun, dayStart) : NONE];
  };

  const simLines: Record<string, SimLine> = {};
  const report: string[] = [];
  for (const l of cfg.lines) {
    const pats = resolved.filter((r) => r.line === l.id);
    // Scale run times to a published trip time when given.
    let scale = 1;
    if (l.run.trip) {
      const f = keyOfName(l.run.trip.from), t = keyOfName(l.run.trip.to);
      for (const r of pats) {
        const i = r.full.findIndex((x) => x.key === f);
        const j = f === t ? r.full.length - 1 : r.full.findIndex((x, k) => k > i && x.key === t);
        if (i < 0 || j <= i) continue;
        const w = walk(l, r, 1);
        const runs = w.runs[j] - w.runs[i], dwells = w.a[j] - w.d[i] - runs;
        scale = Math.max(0.5, Math.min(2, (l.run.trip.minutes * 60 - dwells) / Math.max(1, runs)));
        break;
      }
      if (scale === 1) console.warn(`  ${cfg.city} ${l.id}: trip ${l.run.trip.from} → ${l.run.trip.to} is not on any pattern`);
    }
    const shares = (list: StockShare[]) => {
      const total = list.reduce((s, x) => s + (x.share ?? 1), 0);
      return list.map((x) => ({ stock: x.stock, share: (x.share ?? 1) / total, cars: x.cars }));
    };
    // A group's departures are evenly spaced at one station all its patterns share (by default the first one, in
    // travel order), so trains from different terminals don't bunch on the common trunk.
    const alignOf = new Map<Resolved, number>();
    for (const group of new Set(pats.map((r) => r.group))) {
      const members = pats.filter((r) => r.group === group);
      if (members.length < 2) continue;
      const named = members.map((r) => r.conf.align).find(Boolean);
      const key = named ? keyOfName(named) : members[0].full.map((x) => x.key).find((k) => members.every((r) => r.full.some((x) => x.key === k)));
      if (!key) continue;
      for (const r of members) {
        const k = r.full.findIndex((x) => x.key === key);
        if (k >= 0) alignOf.set(r, Math.round(walk(l, r, scale).d[k]));
        else console.warn(`  ${cfg.city} ${l.id}: align station ${named} is not on pattern ${r.id}`);
      }
    }
    const patterns: SimPattern[] = pats.map((r) => ({
      id: r.id,
      group: r.group,
      share: r.conf.share,
      from: r.from,
      st: r.seq.map((s) => sidx.get(s)!),
      ...(r.stop.every(Boolean) ? {} : { stop: r.stop.map((x) => (x ? 1 : 0)) }),
      t: timesOf(l, r, scale).map(Math.round),
      dest: r.dest,
      ...(r.dir ? { dir: r.dir } : {}),
      ...(r.conf.service ? { service: [r.conf.service[0], r.conf.service[1] ?? r.conf.service[0]] as [string, string] } : {}),
      ...(r.conf.stock ? { stock: shares(r.conf.stock) } : {}),
      ...(alignOf.get(r) ? { align: alignOf.get(r) } : {}),
    }));
    simLines[l.id] = {
      service: toWeek(l.service),
      ...(l.groups ? { groups: Object.fromEntries(Object.entries(l.groups).map(([k, v]) => [k, toWeek(v)])) } : {}),
      patterns,
      stock: shares(l.stock),
    };
    const n = [...lineStations.values()].filter((ls) => ls.line === l.id).length;
    report.push(
      `  ${l.id.padEnd(8)} ${String(n).padStart(3)} stations, ${relsOfLine.get(l.id)!.length} relations${scale !== 1 ? `, run times ×${scale.toFixed(2)}` : ''} · ` +
        patterns.map((p) => `${stations.get(stationList[p.st[0]].id)!.key}→${stations.get(stationList[p.st[p.st.length - 1]].id)!.key} ${p.st.length}st ${((p.t[p.t.length - 1] - p.t[0]) / 60).toFixed(0)}min`).join(' · '),
    );
  }

  const luminance = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).reduce((s, v, i) => s + v * [0.299, 0.587, 0.114][i], 0);
  const lines: LineDef[] = cfg.lines.map((l) => ({
    id: l.id,
    system: l.system,
    name: l.name,
    ...(l.nameLocal ? { nameLocal: l.nameLocal } : {}),
    short: l.short,
    color: l.color,
    textColor: l.textColor ?? (luminance(l.color) > 0.62 ? '#1A1A1A' : '#FFFFFF'),
    kind: l.kind,
    bullet: l.bullet,
    stock: l.stock[0].stock,
  }));
  const order = new Map(cfg.lines.map((l, i) => [l.id, i]));
  const stationDefs: StationDef[] = stationList.map((st) => {
    const [en, local] = englishOf(st.key);
    return {
      id: st.id,
      name: en,
      ...(local && local !== en ? { nameLocal: local } : {}),
      x: r1(st.x),
      y: r1(st.y),
      lines: [...st.lines].sort((a, b) => order.get(a)! - order.get(b)!),
    };
  });
  const transit: TransitData = {
    city: cfg.city,
    built: new Date().toISOString().slice(0, 10),
    attribution: ['© OpenStreetMap contributors', ...(cfg.attribution ?? [])],
    systems: cfg.systems.map((s) => ({ ...s, live: 'scheduled' as const })),
    lines,
    stations: stationDefs,
    segments,
  };
  const sim: SimData = {
    city: cfg.city,
    built: transit.built,
    stations: stationList.map((s) => s.id),
    calendar: { holidays: cfg.calendar.holidays, workdays: cfg.calendar.workdays ?? [], weekend: cfg.calendar.weekend ?? [0, 6], dayStart },
    lines: simLines,
  };
  const transitJson = JSON.stringify(transit), simJson = JSON.stringify(sim);
  write(join(ROOT, `public/data/${cfg.city}/transit.json`), transitJson);
  write(join(ROOT, `server/data/${cfg.city}/sim.json`), simJson);

  let maxEnd = 0, maxEndAt = '';
  for (const seg of segments) {
    const n = seg.pts.length;
    for (const [sid, x, y] of [[seg.from, seg.pts[0], seg.pts[1]], [seg.to, seg.pts[n - 2], seg.pts[n - 1]]] as const) {
      const d = Math.hypot(stations.get(sid)!.x - x, stations.get(sid)!.y - y);
      if (d > maxEnd) (maxEnd = d), (maxEndAt = `${seg.lines.join('/')} ${seg.from}–${seg.to}`);
    }
  }
  console.log(`${cfg.city}: ${stationDefs.length} stations, ${segments.length} segments (${(segments.reduce((s, g) => s + flatLength(g.pts), 0) / 1000).toFixed(0)} km), ${fallbacks.length} straight fallbacks, ${resolved.length} patterns`);
  for (const f of fallbacks.slice(0, 20)) console.log(`    fallback ${f}`);
  console.log(`  max segment end to station ${maxEnd.toFixed(0)} m (${maxEndAt}) · transit.json ${(transitJson.length / 1e6).toFixed(2)} MB, sim.json ${(simJson.length / 1e6).toFixed(2)} MB`);
  for (const line of report) console.log(line);
}

// ---------------------------------------------------------------------------- helpers

const r1 = (v: number) => Math.round(v * 10) / 10;
const mean = (pts: number[][], k: number) => pts.reduce((s, p) => s + p[k], 0) / pts.length;
const sub = (a: number[], b: number[]): [number, number] => [a[0] - b[0], a[1] - b[1]];
/** Cache-name hash of a query's inputs (relation ids, a bbox), so a changed query misses the old file. */
const hashOf = (xs: (number | string)[]) => createHash('sha1').update(xs.join(',')).digest('hex').slice(0, 10);

/** 'HH:MM' as seconds after midnight; times before the service-day start belong to the next day. */
function parseTime(hhmm: string, dayStart: number): number {
  const [h, m] = hhmm.split(':').map(Number);
  const s = h * 3600 + m * 60;
  return s < dayStart ? s + 86400 : s;
}

function write(file: string, text: string) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

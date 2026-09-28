// Standard check for GTFS-kit cities: runs the adapters once (or twice) and checks them against transit.json.
// Flags: --twice (poll again to measure position jumps), --at=<ISO time> (simulate another moment),
// --mock-rt (serve synthetic GTFS-realtime for the city's realtime URLs to exercise the overlay).
// Run with `node --expose-gc --import tsx scripts/check-<city>.ts` to get an exact heap figure.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { cityBounds } from '../../../shared/geo.ts';
import type { CityId, Flat, StockSpec, TrainState, TransitData } from '../../../shared/types.ts';
import { realtimeUrls } from '../../../server/adapters/gtfs/realtime.ts';
import { GtfsSchedule } from '../../../server/adapters/gtfs/schedule.ts';
import type { AdapterFactory } from '../../../server/adapters/types.ts';
import { ROOT } from './feed.ts';

export async function checkGtfsCity(city: CityId, createAdapters: AdapterFactory, o: { schedule?: string; samples?: string[] } = {}) {
  if (existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'));
  const T = JSON.parse(readFileSync(join(ROOT, `public/data/${city}/transit.json`), 'utf8')) as TransitData;
  // Only this city's stock file: other cities' files may be mid-edit.
  const STOCK: Record<string, StockSpec> = Object.fromEntries(((await import(`../../../shared/stock/${city}.ts`)) as { stock: StockSpec[] }).stock.map((s) => [s.id, s]));
  const stations = new Map(T.stations.map((s) => [s.id, s]));
  const lines = new Map(T.lines.map((l) => [l.id, l]));
  const segByPair = new Map<string, { pts: Flat; lines: string[]; rev: boolean }[]>();
  for (const s of T.segments)
    for (const [a, b, rev] of [[s.from, s.to, false], [s.to, s.from, true]] as const) {
      const k = `${a}|${b}`;
      segByPair.set(k, [...(segByPair.get(k) ?? []), { pts: s.pts, lines: s.lines, rev }]);
    }
  const tz = (await import('../../../shared/cities.ts')).CITIES[city].tz;
  const clockStr = (t: number) => new Date(t * 1000).toLocaleTimeString('en-GB', { timeZone: tz, hour12: false });
  const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) : '-') + '%';
  const at = process.argv.find((a) => a.startsWith('--at='))?.slice(5);
  let clock = at ? Date.parse(at) - Date.now() : 0;

  // --- geometry sanity -------------------------------------------------------
  const B = cityBounds(city);
  const outside = T.stations.filter((s) => s.x < B.minX || s.x > B.maxX || s.y < B.minY || s.y > B.maxY);
  let maxEnd = 0, maxEndWhere = '';
  for (const s of T.segments) {
    const a = stations.get(s.from), b = stations.get(s.to);
    if (!a || !b) continue;
    const d = Math.max(Math.hypot(s.pts[0] - a.x, s.pts[1] - a.y), Math.hypot(s.pts.at(-2)! - b.x, s.pts.at(-1)! - b.y));
    if (d > maxEnd) (maxEnd = d), (maxEndWhere = `${a.name} - ${b.name}`);
  }
  const size = statSync(join(ROOT, `public/data/${city}/transit.json`)).size;
  const dataDir = join(ROOT, 'server/data', city);
  const serverData = readdirSync(dataDir).reduce((t, f) => t + statSync(join(dataDir, f)).size, 0);
  console.log(`transit.json ${(size / 1024).toFixed(0)} KB: ${T.stations.length} stations, ${T.segments.length} segments, ${T.lines.length} lines; server/data/${city} ${(serverData / 1048576).toFixed(2)} MB`);
  console.log(`stations outside bbox: ${outside.length}${outside.length ? ' ' + outside.map((s) => s.id).join(',') : ''}`);
  console.log(`max segment-end to station distance: ${maxEnd.toFixed(0)} m (${maxEndWhere})`);
  console.log(`segments with unknown station/line ids: ${T.segments.filter((s) => !stations.has(s.from) || !stations.has(s.to) || s.lines.some((l) => !lines.has(l))).length}`);
  console.log(`segments with mismatched el length: ${T.segments.filter((s) => s.el && s.el.length * 2 !== s.pts.length).length}`);
  const badStock = T.lines.filter((l) => !STOCK[l.stock]).map((l) => `${l.id}->${l.stock}`);
  console.log(`lines with unknown default stock: ${badStock.join(', ') || 'none'}`);

  // --- optional synthetic realtime -------------------------------------------------
  let round = 0;
  if (process.argv.includes('--mock-rt')) {
    const sched = GtfsSchedule.load(o.schedule ?? `server/data/${city}/schedule.json`);
    const stopOf = new Map<number, string>();
    for (const [id, i] of Object.entries(sched.data.stops)) if (!stopOf.has(i)) stopOf.set(i, id);
    const routeOf = new Map<number, string>();
    for (const [id, i] of Object.entries(sched.data.routes)) if (!routeOf.has(i)) routeOf.set(i, id);
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const kind = realtimeUrls.get(url);
      if (!kind) return realFetch(input, init);
      const now = (Date.now() + clock) / 1000;
      const entity =
        kind === 'vehiclePositions'
          ? []
          : sched
              .active(now, new Set(sched.data.lines.map((_, i) => i)), 0, 1800)
              .filter((t) => t.row % 10 !== 3)
              .map((t) => {
                const delay = ((t.row * 37) % 180) - 20 + 15 * round;
                const upd = t.st
                  .map((s, i) => ({ s, i }))
                  .filter(({ i }) => t.times[2 * i + 1] + delay >= now - 30)
                  .map(({ s, i }) => ({ stopId: stopOf.get(sched.stationIndex(s)!), arrival: { time: Math.round(t.times[2 * i] + delay) }, departure: { time: Math.round(t.times[2 * i + 1] + delay) } }));
                return { id: t.id, tripUpdate: { trip: { tripId: sched.key(t.row) || undefined, routeId: routeOf.get(t.pat.l) }, stopTimeUpdate: upd } };
              });
      const msg = GtfsRealtimeBindings.transit_realtime.FeedMessage.fromObject({ header: { gtfsRealtimeVersion: '2.0', timestamp: Math.round(now) }, entity });
      return new Response(new Uint8Array(GtfsRealtimeBindings.transit_realtime.FeedMessage.encode(msg).finish()) as unknown as BodyInit);
    }) as typeof fetch;
  }

  // --- poll ----------------------------------------------------------------------
  const adapters = createAdapters({ ...(process.env as Record<string, string>) });
  if (process.argv.includes('--mock-rt')) console.log(`mocking ${realtimeUrls.size} realtime URL(s)${realtimeUrls.size ? '' : ' (none: the city has no gtfsRealtime source)'}`);
  const pollAll = async () => {
    const nowMs = Date.now() + clock;
    const trains: TrainState[] = [];
    for (const a of adapters) {
      const t0 = Date.now();
      try {
        const list = await a.poll(nowMs);
        trains.push(...list);
        console.log(`[${a.id}] ${a.name}: ${list.length} trains (${Date.now() - t0} ms)`);
      } catch (err) {
        console.log(`[${a.id}] FAILED: ${err instanceof Error ? err.stack : err}`);
      }
    }
    return { now: nowMs / 1000, trains };
  };
  const { now, trains } = await pollAll();
  (globalThis as { gc?: () => void }).gc?.();
  console.log(`heap after load + poll: ${(process.memoryUsage().heapUsed / 1048576).toFixed(1)} MB${(globalThis as { gc?: () => void }).gc ? '' : ' (run with --expose-gc for an exact figure)'}`);
  console.log(`simulated at ${new Date(now * 1000).toLocaleString('en-GB', { timeZone: tz })} local time`);
  const perLine = new Map<string, { n: number; live: number; stock: Map<string, number> }>();
  let pairs = 0, covered = 0, bracket = 0, mono = 0, dup = 0;
  const unknown = { station: new Set<string>(), line: new Set<string>(), stock: new Set<string>() };
  const missing = new Map<string, number>();
  const ids = new Set<string>();
  for (const tr of trains) {
    if (ids.has(tr.id)) dup++;
    ids.add(tr.id);
    const e = perLine.get(tr.line) ?? { n: 0, live: 0, stock: new Map() };
    perLine.set(tr.line, e);
    e.n++;
    if (tr.live) e.live++;
    e.stock.set(`${tr.stock}×${tr.cars}`, (e.stock.get(`${tr.stock}×${tr.cars}`) ?? 0) + 1);
    if (!lines.has(tr.line)) unknown.line.add(tr.line);
    if (!STOCK[tr.stock]) unknown.stock.add(tr.stock);
    for (const s of tr.stops) if (!stations.has(s.s)) unknown.station.add(s.s);
    for (let i = 0; i + 1 < tr.stops.length; i++) {
      pairs++;
      const k = `${tr.stops[i].s}|${tr.stops[i + 1].s}`;
      if (segByPair.has(k)) covered++;
      else missing.set(`${tr.line} ${k}`, (missing.get(`${tr.line} ${k}`) ?? 0) + 1);
    }
    if (tr.stops[0].a <= now && now <= tr.stops.at(-1)!.d) bracket++;
    if (tr.stops.every((s, i) => s.d >= s.a && (i === 0 || s.a >= tr.stops[i - 1].d))) mono++;
  }
  console.log('\ntrains per line (live / total, stock×cars):');
  const order = T.lines.map((l) => l.id);
  for (const [line, e] of [...perLine].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])))
    console.log(`  ${line.padEnd(8)} ${String(e.live).padStart(3)} / ${String(e.n).padStart(3)}  ${[...e.stock].map(([k, v]) => `${k}:${v}`).join(' ')}`);
  console.log(`\ntotal trains: ${trains.length}, duplicate ids: ${dup}`);
  console.log(`stop pairs with a segment: ${pct(covered, pairs)} (${covered}/${pairs})`);
  for (const [k, n] of [...missing].slice(0, 10)) console.log(`  missing: ${k} ×${n}`);
  console.log(`timelines bracketing now: ${pct(bracket, trains.length)}`);
  console.log(`timelines non-decreasing: ${pct(mono, trains.length)}`);
  console.log(`unknown stations: ${[...unknown.station].join(', ') || 'none'}; lines: ${[...unknown.line].join(', ') || 'none'}; stock: ${[...unknown.stock].join(', ') || 'none'}`);
  const pick = (line: string) => trains.find((t) => t.line === line && t.stops.length >= 5) ?? trains.find((t) => t.line === line);
  const sampleLines = o.samples ?? [...new Set(T.lines.map((l) => l.system))].map((sys) => T.lines.find((l) => l.system === sys && perLine.has(l.id))?.id).filter(Boolean) as string[];
  for (const t of sampleLines.map(pick).filter(Boolean) as TrainState[]) {
    console.log(`\nsample ${t.id} line=${t.line} dest=${t.dest}${t.destLocal ? ` (${t.destLocal})` : ''} dir=${t.dir ?? '-'} ${t.service ?? ''} stock=${t.stock}×${t.cars} live=${t.live} delay=${t.delay ?? '-'} ${t.label ?? ''}`);
    for (const s of t.stops) console.log(`   ${clockStr(s.a)} → ${clockStr(s.d)}  ${s.s} ${stations.get(s.s)?.name ?? '??'}`);
  }

  if (process.argv.includes('--twice')) {
    const mock = process.argv.includes('--mock-rt');
    if (mock) {
      console.log('\nsecond poll 30 s later with updated predictions...');
      round++;
      clock += 30_000;
    } else {
      console.log('\nwaiting 25 s for a second poll...');
      await new Promise((r) => setTimeout(r, 25_000));
    }
    const second = await pollAll();
    const prev = new Map(trains.map((t) => [t.id, t]));
    const jumps: number[] = [];
    let kept = 0;
    let worst: { d: number; before: TrainState; after: TrainState } | undefined;
    for (const t of second.trains) {
      const p = prev.get(t.id);
      if (!p) continue;
      kept++;
      const a = positionAt(p, second.now), b = positionAt(t, second.now);
      if (!a || !b) continue;
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      jumps.push(d);
      if (!worst || d > worst.d) worst = { d, before: p, after: t };
    }
    jumps.sort((x, y) => x - y);
    console.log(`ids stable: ${kept}/${second.trains.length}`);
    console.log(`position jump between polls: median ${jumps[jumps.length >> 1]?.toFixed(0)} m, p95 ${jumps[Math.floor(jumps.length * 0.95)]?.toFixed(0)} m, max ${jumps.at(-1)?.toFixed(0)} m`);
    if (worst && worst.d > 300) {
      const fmt = (x: TrainState) => `live=${x.live} ` + x.stops.slice(0, 3).map((s) => `${stations.get(s.s)?.name}@${clockStr(s.a)}-${clockStr(s.d)}`).join(' ');
      console.log(`  worst: ${worst.after.id} ${worst.d.toFixed(0)} m\n    before: ${fmt(worst.before)}\n    after:  ${fmt(worst.after)}`);
    }
  }

  function positionAt(tr: TrainState, t: number): [number, number] | null {
    const st = tr.stops;
    for (let i = 0; i < st.length; i++) {
      const s = stations.get(st[i].s);
      if (!s) return null;
      if (t <= st[i].d || i === st.length - 1) return t >= st[i].a || i === 0 ? [s.x, s.y] : null;
      const n = st[i + 1];
      if (t < n.a) {
        const f = (t - st[i].d) / Math.max(1, n.a - st[i].d);
        const segs = segByPair.get(`${st[i].s}|${n.s}`);
        const seg = segs?.find((g) => g.lines.includes(tr.line)) ?? segs?.[0];
        const b = stations.get(n.s)!;
        if (!seg) return [s.x + f * (b.x - s.x), s.y + f * (b.y - s.y)];
        let p = seg.pts;
        if (seg.rev) {
          const o: Flat = [];
          for (let k = p.length - 2; k >= 0; k -= 2) o.push(p[k], p[k + 1]);
          p = o;
        }
        let total = 0;
        for (let k = 2; k < p.length; k += 2) total += Math.hypot(p[k] - p[k - 2], p[k + 1] - p[k - 1]);
        let want = f * total;
        for (let k = 2; k < p.length; k += 2) {
          const l = Math.hypot(p[k] - p[k - 2], p[k + 1] - p[k - 1]);
          if (want <= l) return [p[k - 2] + ((p[k] - p[k - 2]) * want) / (l || 1), p[k - 1] + ((p[k + 1] - p[k - 1]) * want) / (l || 1)];
          want -= l;
        }
        return [p.at(-2)!, p.at(-1)!];
      }
    }
    return null;
  }
}

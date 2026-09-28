// Runs the London adapters against the live TfL feeds and checks the output against transit.json.
// Usage: npx tsx scripts/check-london.ts [--polls=2]
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cityBounds } from '../shared/geo.ts';
import type { TrainState, TransitData } from '../shared/types.ts';
import { stock } from '../shared/stock/london.ts';
import { createAdapters } from '../server/adapters/london/index.ts';

const ROOT = resolve(import.meta.dirname, '..');
if (existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'));
const polls = Number(process.argv.find((a) => a.startsWith('--polls='))?.split('=')[1] ?? 2);

const data = JSON.parse(readFileSync(join(ROOT, 'public/data/london/transit.json'), 'utf8')) as TransitData;
const stations = new Map(data.stations.map((s) => [s.id, s]));
const lines = new Set(data.lines.map((l) => l.id));
const stockIds = new Set(stock.map((s) => s.id));
const segs = new Map<string, { pts: number[]; reversed: boolean }>();
for (const sg of data.segments) {
  segs.set(`${sg.from}|${sg.to}`, { pts: sg.pts, reversed: false });
  segs.set(`${sg.to}|${sg.from}`, { pts: sg.pts, reversed: true });
}

/** Where the client would draw the train at time t (seconds). */
function position(tr: TrainState, t: number): [number, number] | null {
  const st = tr.stops;
  for (let i = 0; i < st.length; i++) {
    if (t <= st[i].d && t >= st[i].a) return [stations.get(st[i].s)!.x, stations.get(st[i].s)!.y];
    const nx = st[i + 1];
    if (nx && t > st[i].d && t < nx.a) {
      const seg = segs.get(`${st[i].s}|${nx.s}`);
      const f = (t - st[i].d) / (nx.a - st[i].d);
      if (!seg) return null;
      const pts = seg.pts;
      const n = pts.length / 2;
      const idx = (k: number) => (seg.reversed ? n - 1 - k : k);
      let total = 0;
      for (let k = 1; k < n; k++) total += Math.hypot(pts[2 * idx(k)] - pts[2 * idx(k - 1)], pts[2 * idx(k) + 1] - pts[2 * idx(k - 1) + 1]);
      let want = f * total;
      for (let k = 1; k < n; k++) {
        const ax = pts[2 * idx(k - 1)], ay = pts[2 * idx(k - 1) + 1], bx = pts[2 * idx(k)], by = pts[2 * idx(k) + 1];
        const l = Math.hypot(bx - ax, by - ay);
        if (want <= l) return [ax + ((bx - ax) * want) / (l || 1), ay + ((by - ay) * want) / (l || 1)];
        want -= l;
      }
      return [pts[2 * idx(n - 1)], pts[2 * idx(n - 1) + 1]];
    }
  }
  return null;
}

const iso = (s: number) => new Date(s * 1000).toISOString().slice(11, 19);
const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) : '-') + '%';

// Geometry sanity
const b = cityBounds('london');
const outside = data.stations.filter((s) => s.x < b.minX || s.x > b.maxX || s.y < b.minY || s.y > b.maxY);
let maxEnd = 0;
let maxEndSeg = '';
const endDists: number[] = [];
for (const sg of data.segments) {
  const a = stations.get(sg.from)!, z = stations.get(sg.to)!;
  const n = sg.pts.length;
  const d1 = Math.hypot(sg.pts[0] - a.x, sg.pts[1] - a.y);
  const d2 = Math.hypot(sg.pts[n - 2] - z.x, sg.pts[n - 1] - z.y);
  endDists.push(d1, d2);
  if (Math.max(d1, d2) > maxEnd) {
    maxEnd = Math.max(d1, d2);
    maxEndSeg = `${a.name} - ${z.name} (${sg.lines.join('/')})`;
  }
}
endDists.sort((x, y) => x - y);
console.log(`transit.json: ${data.stations.length} stations, ${data.segments.length} segments, ${data.lines.length} lines`);
console.log(`  stations outside bbox: ${outside.length}`);
console.log(
  `  segment endpoint to station: median ${endDists[endDists.length >> 1].toFixed(0)} m, p95 ${endDists[Math.floor(endDists.length * 0.95)].toFixed(0)} m, max ${maxEnd.toFixed(0)} m (${maxEndSeg})`,
);

const adapters = createAdapters({ TFL_APP_KEY: process.env.TFL_APP_KEY || undefined });
let previous = new Map<string, TrainState>();
let prevTime = 0;
for (let round = 1; round <= polls; round++) {
  if (round > 1) await new Promise((r) => setTimeout(r, 30_000));
  const now = Date.now();
  const all: TrainState[] = [];
  for (const ad of adapters) {
    try {
      const t0 = Date.now();
      const trains = await ad.poll(now);
      all.push(...trains);
      console.log(`\n[poll ${round}] ${ad.id}: ${trains.length} trains (${Date.now() - t0} ms)`);
    } catch (err) {
      console.log(`\n[poll ${round}] ${ad.id}: FAILED ${err}`);
    }
  }
  const nowS = now / 1000;
  const perLine = new Map<string, { n: number; stock: Map<string, number> }>();
  let pairs = 0, covered = 0, bracket = 0;
  const unknown = new Set<string>();
  const missing = new Map<string, number>();
  for (const t of all) {
    const pl = perLine.get(t.line) ?? { n: 0, stock: new Map() };
    pl.n++;
    const sk = `${t.stock}x${t.cars}`;
    pl.stock.set(sk, (pl.stock.get(sk) ?? 0) + 1);
    perLine.set(t.line, pl);
    if (!lines.has(t.line)) unknown.add(`line:${t.line}`);
    if (!stockIds.has(t.stock)) unknown.add(`stock:${t.stock}`);
    for (const s of t.stops) if (!stations.has(s.s)) unknown.add(`station:${s.s}`);
    for (let i = 1; i < t.stops.length; i++) {
      pairs++;
      if (segs.has(`${t.stops[i - 1].s}|${t.stops[i].s}`)) covered++;
      else {
        const k = `${t.line}: ${stations.get(t.stops[i - 1].s)?.name} > ${stations.get(t.stops[i].s)?.name}`;
        missing.set(k, (missing.get(k) ?? 0) + 1);
      }
      if (t.stops[i].a < t.stops[i - 1].d || t.stops[i].d < t.stops[i].a) unknown.add(`non-monotonic:${t.id}`);
    }
    if (t.stops[0].a <= nowS && nowS <= t.stops[t.stops.length - 1].d && t.stops[0].d <= nowS + 600) bracket++;
  }
  console.log(`\n[poll ${round}] ${all.length} trains`);
  for (const [line, pl] of [...perLine].sort()) {
    console.log(`  ${line.padEnd(17)} ${String(pl.n).padStart(4)}  ${[...pl.stock].map(([k, v]) => `${k}:${v}`).join(' ')}`);
  }
  console.log(`  stop pairs with a segment: ${covered}/${pairs} = ${pct(covered, pairs)}`);
  for (const [k, v] of [...missing].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`    missing ${k} (${v})`);
  console.log(`  timelines bracketing now: ${bracket}/${all.length} = ${pct(bracket, all.length)}`);
  const dwelling = all.filter((t) => t.stops[0].d > nowS).length;
  console.log(`  dwelling at a station now: ${dwelling}, moving: ${all.length - dwelling}`);
  console.log(`  unknown ids / problems: ${unknown.size ? [...unknown].slice(0, 20).join(', ') : 'none'}`);

  if (round === 1) {
    const samples = [all.find((t) => t.line === 'victoria'), all.find((t) => t.line === 'elizabeth'), all.find((t) => t.line === 'dlr')];
    for (const t of samples.filter(Boolean) as TrainState[]) {
      console.log(`\n  sample ${t.id} | ${t.line} | to ${t.dest} | ${t.dir ?? ''} ${t.service ?? ''} | ${t.stock} x${t.cars} | ${t.label ?? ''}`);
      for (const s of t.stops) console.log(`    ${iso(s.a)} - ${iso(s.d)}  ${stations.get(s.s)?.name}`);
    }
  } else {
    let kept = 0;
    const jumps: number[] = [];
    for (const t of all) {
      const o = previous.get(t.id);
      if (!o) continue;
      kept++;
      const p1 = position(o, nowS), p2 = position(t, nowS);
      if (p1 && p2) jumps.push(Math.hypot(p1[0] - p2[0], p1[1] - p2[1]));
    }
    jumps.sort((x, y) => x - y);
    const q = (f: number) => (jumps.length ? jumps[Math.min(jumps.length - 1, Math.floor(jumps.length * f))].toFixed(0) : '-');
    console.log(`  ids kept from previous poll: ${kept}/${previous.size} = ${pct(kept, previous.size)}`);
    console.log(
      `  position jump between polls (m, same instant, old vs new timeline): median ${q(0.5)}, p90 ${q(0.9)}, p98 ${q(0.98)}, max ${q(1)} over ${jumps.length} trains (${((now - prevTime) / 1000).toFixed(0)} s apart)`,
    );
  }
  previous = new Map(all.map((t) => [t.id, t]));
  prevTime = now;
}

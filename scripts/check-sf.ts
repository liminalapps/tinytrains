// Runs the SF adapters against the live feeds and checks their output against public/data/sf/transit.json.
// Run: npx tsx scripts/check-sf.ts [--twice]   (--twice polls again after 25 s to measure position jumps)
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cityBounds } from '../shared/geo.ts';
import { stock } from '../shared/stock/sf.ts';
import type { Flat, TrainState, TransitData } from '../shared/types.ts';
import { createAdapters } from '../server/adapters/sf/index.ts';

const ROOT = resolve(import.meta.dirname, '..');
if (existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'));
const T = JSON.parse(readFileSync(join(ROOT, 'public/data/sf/transit.json'), 'utf8')) as TransitData;
const stations = new Map(T.stations.map((s) => [s.id, s]));
const lines = new Map(T.lines.map((l) => [l.id, l]));
const stockIds = new Set(stock.map((s) => s.id));
const segByPair = new Map<string, { pts: Flat; lines: string[]; rev: boolean }[]>();
for (const s of T.segments) {
  for (const [a, b, rev] of [[s.from, s.to, false], [s.to, s.from, true]] as const) {
    const k = `${a}|${b}`;
    segByPair.set(k, [...(segByPair.get(k) ?? []), { pts: s.pts, lines: s.lines, rev }]);
  }
}
const iso = (t: number) => new Date(t * 1000).toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour12: false });
const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) : '-') + '%';

// --- geometry sanity -------------------------------------------------------
const B = cityBounds('sf');
const outside = T.stations.filter((s) => s.x < B.minX || s.x > B.maxX || s.y < B.minY || s.y > B.maxY);
let maxEnd = 0, maxEndWhere = '';
for (const s of T.segments) {
  const a = stations.get(s.from), b = stations.get(s.to);
  if (!a || !b) continue;
  const d0 = Math.hypot(s.pts[0] - a.x, s.pts[1] - a.y), d1 = Math.hypot(s.pts.at(-2)! - b.x, s.pts.at(-1)! - b.y);
  if (Math.max(d0, d1) > maxEnd) (maxEnd = Math.max(d0, d1)), (maxEndWhere = `${a.name} - ${b.name}`);
}
const size = readFileSync(join(ROOT, 'public/data/sf/transit.json')).length;
console.log(`transit.json ${(size / 1024).toFixed(0)} KB: ${T.stations.length} stations, ${T.segments.length} segments, ${T.lines.length} lines`);
console.log(`stations outside bbox: ${outside.length}${outside.length ? ' ' + outside.map((s) => s.id).join(',') : ''}`);
console.log(`max segment-end to station distance: ${maxEnd.toFixed(0)} m (${maxEndWhere})`);
const badSegIds = T.segments.filter((s) => !stations.has(s.from) || !stations.has(s.to) || s.lines.some((l) => !lines.has(l)));
console.log(`segments with unknown station/line ids: ${badSegIds.length}`);
const badLineStock = T.lines.filter((l) => !stockIds.has(l.stock)).map((l) => `${l.id}->${l.stock}`);
console.log(`lines with unknown default stock: ${badLineStock.length ? badLineStock.join(', ') : 'none'}`);

// --- live poll ---------------------------------------------------------------
const adapters = createAdapters({ API_511_KEY: process.env.API_511_KEY || undefined });

/** Position of a train at time t along its timeline, in local meters. */
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
      const pts = seg.rev ? reversePts(seg.pts) : seg.pts;
      return along(pts, f);
    }
  }
  return null;
}
function reversePts(p: Flat): Flat {
  const o: Flat = [];
  for (let i = p.length - 2; i >= 0; i -= 2) o.push(p[i], p[i + 1]);
  return o;
}
function along(p: Flat, f: number): [number, number] {
  let total = 0;
  for (let i = 2; i < p.length; i += 2) total += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  let want = f * total;
  for (let i = 2; i < p.length; i += 2) {
    const l = Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
    if (want <= l) return [p[i - 2] + ((p[i] - p[i - 2]) * want) / (l || 1), p[i - 1] + ((p[i + 1] - p[i - 1]) * want) / (l || 1)];
    want -= l;
  }
  return [p.at(-2)!, p.at(-1)!];
}

async function pollAll(): Promise<{ now: number; trains: TrainState[] }> {
  const nowMs = Date.now();
  const trains: TrainState[] = [];
  for (const a of adapters) {
    const t0 = Date.now();
    try {
      const list = await a.poll(nowMs);
      trains.push(...list);
      console.log(`[${a.id}] ${a.name}: ${list.length} trains (${Date.now() - t0} ms)`);
    } catch (err) {
      console.log(`[${a.id}] FAILED: ${err instanceof Error ? err.message : err}`);
    }
  }
  return { now: nowMs / 1000, trains };
}

const { now, trains } = await pollAll();
const perLine = new Map<string, { n: number; live: number; stock: Map<string, number> }>();
let pairs = 0, covered = 0, bracket = 0, mono = 0;
const unknown = { station: new Set<string>(), line: new Set<string>(), stock: new Set<string>() };
const missingPairs = new Map<string, number>();
const ids = new Set<string>();
let dupIds = 0;
for (const tr of trains) {
  if (ids.has(tr.id)) dupIds++;
  ids.add(tr.id);
  const e = perLine.get(tr.line) ?? { n: 0, live: 0, stock: new Map() };
  perLine.set(tr.line, e);
  e.n++;
  if (tr.live) e.live++;
  const sk = `${tr.stock}×${tr.cars}`;
  e.stock.set(sk, (e.stock.get(sk) ?? 0) + 1);
  if (!lines.has(tr.line)) unknown.line.add(tr.line);
  if (!stockIds.has(tr.stock)) unknown.stock.add(tr.stock);
  for (const s of tr.stops) if (!stations.has(s.s)) unknown.station.add(s.s);
  for (let i = 0; i + 1 < tr.stops.length; i++) {
    pairs++;
    const k = `${tr.stops[i].s}|${tr.stops[i + 1].s}`;
    if (segByPair.has(k)) covered++;
    else missingPairs.set(`${tr.line} ${k}`, (missingPairs.get(`${tr.line} ${k}`) ?? 0) + 1);
  }
  const last = tr.stops.at(-1)!;
  if (tr.stops[0].a <= now && now <= last.d) bracket++;
  if (tr.stops.every((s, i) => s.d >= s.a && (i === 0 || s.a >= tr.stops[i - 1].d))) mono++;
}

console.log('\ntrains per line (live / total, stock×cars):');
for (const [line, e] of [...perLine].sort()) {
  console.log(`  ${line.padEnd(12)} ${String(e.live).padStart(3)} / ${String(e.n).padStart(3)}  ${[...e.stock].map(([k, v]) => `${k}:${v}`).join(' ')}`);
}
console.log(`\ntotal trains: ${trains.length}, duplicate ids: ${dupIds}${dupIds ? ' ' + trains.filter((t, i) => trains.findIndex((u) => u.id === t.id) !== i).map((t) => t.id).join(',') : ''}`);
console.log(`stop pairs with a segment: ${pct(covered, pairs)} (${covered}/${pairs})`);
for (const [k, n] of [...missingPairs].slice(0, 10)) console.log(`  missing: ${k} ×${n}`);
console.log(`timelines bracketing now: ${pct(bracket, trains.length)}`);
console.log(`timelines non-decreasing: ${pct(mono, trains.length)}`);
console.log(`unknown stations: ${[...unknown.station].join(', ') || 'none'}; lines: ${[...unknown.line].join(', ') || 'none'}; stock: ${[...unknown.stock].join(', ') || 'none'}`);

const samples = [trains.find((t) => t.line.startsWith('bart-') && t.live), trains.find((t) => t.line.startsWith('muni-')), trains.find((t) => t.line.startsWith('ct-'))].filter(Boolean) as TrainState[];
for (const t of samples) {
  console.log(`\nsample ${t.id} line=${t.line} dest=${t.dest} dir=${t.dir} ${t.service ?? ''} stock=${t.stock}×${t.cars} live=${t.live} delay=${t.delay ?? '-'} ${t.label ?? ''}`);
  for (const s of t.stops) console.log(`   ${iso(s.a)} → ${iso(s.d)}  ${s.s} ${stations.get(s.s)?.name ?? '??'}`);
}

if (process.argv.includes('--twice')) {
  console.log('\nwaiting 25 s for a second poll...');
  await new Promise((r) => setTimeout(r, 25_000));
  const second = await pollAll();
  const prev = new Map(trains.map((t) => [t.id, t]));
  const jumps: number[] = [];
  const bad: string[] = [];
  let kept = 0;
  for (const t of second.trains) {
    const p = prev.get(t.id);
    if (!p) continue;
    kept++;
    const a = positionAt(p, second.now), b = positionAt(t, second.now);
    if (!a || !b) continue;
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    jumps.push(d);
    if (d > 300) {
      const fmt = (x: TrainState) => x.stops.slice(0, 3).map((s) => `${s.s}@${iso(s.a)}-${iso(s.d)}`).join(' ');
      bad.push(`${t.id} ${t.line} ${d.toFixed(0)} m\n     before: ${fmt(p)}\n     after:  ${fmt(t)}`);
    }
  }
  jumps.sort((x, y) => x - y);
  console.log(`ids stable: ${kept}/${second.trains.length}`);
  console.log(`position jump between polls: median ${jumps[jumps.length >> 1]?.toFixed(0)} m, p95 ${jumps[Math.floor(jumps.length * 0.95)]?.toFixed(0)} m, max ${jumps.at(-1)?.toFixed(0)} m`);
  for (const b of bad.slice(0, 10)) console.log(`  jump: ${b}`);
}

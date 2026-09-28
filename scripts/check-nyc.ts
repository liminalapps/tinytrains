// Runs the NYC adapter against the live MTA feeds and prints data-quality numbers.
// Usage: npx tsx scripts/check-nyc.ts [secondsBetweenPolls=15]
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cityBounds, makeProjection } from '../shared/geo.ts';
import { stock } from '../shared/stock/nyc.ts';
import type { SegmentDef, TrainState, TransitData } from '../shared/types.ts';
import { NycAdapter } from '../server/adapters/nyc/index.ts';

const ROOT = resolve(import.meta.dirname, '..');
const transit = JSON.parse(readFileSync(join(ROOT, 'public/data/nyc/transit.json'), 'utf8')) as TransitData;
const gap = Number(process.argv[2] ?? 15);

const stationById = new Map(transit.stations.map((s) => [s.id, s]));
const lineIds = new Set(transit.lines.map((l) => l.id));
const stockIds = new Set(stock.map((s) => s.id));
const segsByPair = new Map<string, SegmentDef[]>();
for (const s of transit.segments) {
  for (const k of [`${s.from}|${s.to}`, `${s.to}|${s.from}`]) segsByPair.set(k, [...(segsByPair.get(k) ?? []), s]);
}

const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) : '-') + '%';
const iso = (t: number) => new Date(t * 1000).toISOString().slice(11, 19) + 'Z';

// --- Geometry sanity -------------------------------------------------------
const b = cityBounds('nyc');
const outside = transit.stations.filter((s) => s.x < b.minX || s.x > b.maxX || s.y < b.minY || s.y > b.maxY);
let endMax = 0;
let endWorst = '';
for (const s of transit.segments) {
  const a = stationById.get(s.from)!;
  const z = stationById.get(s.to)!;
  const d0 = Math.hypot(s.pts[0] - a.x, s.pts[1] - a.y);
  const d1 = Math.hypot(s.pts[s.pts.length - 2] - z.x, s.pts[s.pts.length - 1] - z.y);
  if (Math.max(d0, d1) > endMax) {
    endMax = Math.max(d0, d1);
    endWorst = `${s.from}-${s.to}`;
  }
  if (s.el && s.el.length !== s.pts.length / 2) console.log(`  bad el length on ${s.from}-${s.to}`);
}
const badSegStation = transit.segments.filter((s) => !stationById.has(s.from) || !stationById.has(s.to));
const levels = transit.segments.flatMap((s) => s.el ?? []);
console.log('== static');
console.log(`lines ${transit.lines.length}, stations ${transit.stations.length}, segments ${transit.segments.length}, size ${(JSON.stringify(transit).length / 1e6).toFixed(2)} MB`);
console.log(`stations outside bbox: ${outside.length}${outside.length ? ' ' + outside.map((s) => s.id).join(',') : ''}`);
console.log(`segment endpoint max distance to station: ${endMax.toFixed(0)} m (${endWorst}); segments with unknown stations: ${badSegStation.length}`);
console.log(`levels: tunnel ${pct(levels.filter((l) => l < 0).length, levels.length)}, grade ${pct(levels.filter((l) => l === 0).length, levels.length)}, elevated ${pct(levels.filter((l) => l > 0).length, levels.length)}`);
const missingStock = transit.lines.filter((l) => !stockIds.has(l.stock));
if (missingStock.length) console.log(`lines with unknown default stock: ${missingStock.map((l) => l.id).join(',')}`);

// --- Live ------------------------------------------------------------------
function position(t: TrainState, time: number): [number, number] | null {
  const st = t.stops;
  for (let i = 0; i < st.length; i++) {
    if (time <= st[i].d && time >= st[i].a) {
      const s = stationById.get(st[i].s)!;
      return [s.x, s.y];
    }
    if (time < st[i].a && i > 0) {
      const f = (time - st[i - 1].d) / Math.max(1, st[i].a - st[i - 1].d);
      const segs = segsByPair.get(`${st[i - 1].s}|${st[i].s}`);
      if (!segs) return null;
      const seg = segs.find((s) => s.lines.includes(t.line)) ?? segs[0];
      let pts = seg.pts;
      if (seg.from !== st[i - 1].s) {
        const r: number[] = [];
        for (let k = pts.length - 2; k >= 0; k -= 2) r.push(pts[k], pts[k + 1]);
        pts = r;
      }
      const cum = [0];
      for (let k = 2; k < pts.length; k += 2) cum.push(cum[cum.length - 1] + Math.hypot(pts[k] - pts[k - 2], pts[k + 1] - pts[k - 1]));
      const m = Math.max(0, Math.min(1, f)) * cum[cum.length - 1];
      let k = 0;
      while (k < cum.length - 2 && cum[k + 1] < m) k++;
      const u = (m - cum[k]) / Math.max(1e-9, cum[k + 1] - cum[k]);
      return [pts[2 * k] + u * (pts[2 * k + 2] - pts[2 * k]), pts[2 * k + 1] + u * (pts[2 * k + 3] - pts[2 * k + 1])];
    }
  }
  return null;
}

function report(trains: TrainState[], nowMs: number, adapter: NycAdapter) {
  const now = nowMs / 1000;
  const byLine = new Map<string, TrainState[]>();
  for (const t of trains) byLine.set(t.line, [...(byLine.get(t.line) ?? []), t]);
  console.log(`trains: ${trains.length}`);
  for (const l of transit.lines) {
    const list = byLine.get(l.id) ?? [];
    const mix = new Map<string, number>();
    for (const t of list) mix.set(`${t.stock.replace('nyc-', '')}x${t.cars}`, (mix.get(`${t.stock.replace('nyc-', '')}x${t.cars}`) ?? 0) + 1);
    console.log(`  ${l.id.padEnd(3)} ${String(list.length).padStart(3)}  ${[...mix].map(([k, v]) => `${k}:${v}`).join(' ')}`);
  }
  let pairs = 0;
  let covered = 0;
  let bracket = 0;
  let order = 0;
  let short = 0;
  const unknownStation = new Set<string>();
  const unknownLine = new Set<string>();
  const unknownStock = new Set<string>();
  const missingPairs = new Map<string, number>();
  for (const t of trains) {
    if (!lineIds.has(t.line)) unknownLine.add(t.line);
    if (!stockIds.has(t.stock)) unknownStock.add(t.stock);
    const st = t.stops;
    if (st.length < 2) short++;
    if (st[0].a <= now + 0.5 && now <= st[st.length - 1].d) bracket++;
    else if (process.env.DEBUG) console.log(`  not bracketing: ${t.id} ${st.map((s) => `${s.s}@${(s.a - now).toFixed(0)}/${(s.d - now).toFixed(0)}`).join(' ')}`);
    let ok = true;
    for (let i = 0; i < st.length; i++) {
      if (!stationById.has(st[i].s)) unknownStation.add(st[i].s);
      if (st[i].d < st[i].a || (i > 0 && st[i].a < st[i - 1].d)) ok = false;
      if (i > 0) {
        pairs++;
        const k = `${st[i - 1].s}|${st[i].s}`;
        if (segsByPair.has(k)) covered++;
        else missingPairs.set(`${t.line}:${k}`, (missingPairs.get(`${t.line}:${k}`) ?? 0) + 1);
      }
    }
    if (ok) order++;
  }
  console.log(`segment coverage: ${pct(covered, pairs)} of ${pairs} consecutive pairs`);
  if (missingPairs.size) console.log(`  missing: ${[...missingPairs].slice(0, 12).map(([k, v]) => `${k}(${v})`).join(' ')}`);
  console.log(`timeline brackets now: ${pct(bracket, trains.length)}; non-decreasing times: ${pct(order, trains.length)}; fewer than 2 stops: ${short}`);
  console.log(`unknown stations: ${[...unknownStation].join(',') || 'none'}; lines: ${[...unknownLine].join(',') || 'none'}; stock: ${[...unknownStock].join(',') || 'none'}`);
  const s = adapter.stats;
  console.log(
    `adapter: feeds ${s.feeds} (failed: ${s.failedFeeds.join(',') || 'none'}), updates ${s.updates}, not started ${s.notStarted}, finished ${s.finished}, stale ${s.stale}, ` +
      `static-matched ${s.matched}, no previous stop ${s.noPrev}, gaps filled ${s.gapsFilled}, gaps left ${s.gapsLeft}, held ${s.held}, ` +
      `unknown feed stops: ${[...s.unknownStop].join(',') || 'none'}, unknown routes: ${[...s.unknownLine].join(',') || 'none'}`,
  );
  const withDelay = trains.filter((t) => t.delay !== undefined);
  const dl = withDelay.map((t) => t.delay!).sort((x, y) => x - y);
  const dq = (f: number) => dl[Math.min(dl.length - 1, Math.floor(f * dl.length))];
  console.log(`delay known for ${pct(withDelay.length, trains.length)} (min ${dq(0)} s, median ${dq(0.5)} s, p95 ${dq(0.95)} s, max ${dq(1)} s); label ${pct(trains.filter((t) => t.label).length, trains.length)}; dir ${pct(trains.filter((t) => t.dir).length, trains.length)}`);
}

const adapter = new NycAdapter();
const t1 = Date.now();
const first = await adapter.poll(t1);
console.log(`\n== live poll 1 (${new Date(t1).toISOString()})`);
report(first, t1, adapter);

console.log('\n== samples');
const picks = [first.find((t) => t.line === 'A'), first.find((t) => t.line === '7'), first.find((t) => t.line === 'SI')].filter(Boolean) as TrainState[];
for (const t of picks) {
  console.log(`${t.id} line ${t.line} → ${t.dest} (${t.dir}${t.service ? ', ' + t.service : ''}) ${t.stock} x${t.cars} label "${t.label}" delay ${t.delay ?? '-'}`);
  console.log('   ' + t.stops.map((s) => `${stationById.get(s.s)?.name ?? s.s} ${iso(s.a)}${s.d !== s.a ? '–' + iso(s.d) : ''}`).join(' | '));
}

if (gap > 0) {
  await new Promise((r) => setTimeout(r, gap * 1000));
  const t2 = Date.now();
  const second = await adapter.poll(t2);
  console.log(`\n== live poll 2 (+${((t2 - t1) / 1000).toFixed(0)} s)`);
  report(second, t2, adapter);
  // Continuity: where poll 1 and poll 2 put each train at t2.
  const old = new Map(first.map((t) => [t.id, t]));
  const jumps: [number, string][] = [];
  for (const t of second) {
    const o = old.get(t.id);
    if (!o) continue;
    const p1 = position(o, t2 / 1000);
    const p2 = position(t, t2 / 1000);
    if (p1 && p2) jumps.push([Math.hypot(p1[0] - p2[0], p1[1] - p2[1]), t.id]);
  }
  jumps.sort((a, b) => a[0] - b[0]);
  const q = (f: number) => jumps[Math.min(jumps.length - 1, Math.floor(f * jumps.length))]?.[0].toFixed(0);
  console.log(`position jump between polls (${jumps.length} trains): median ${q(0.5)} m, p95 ${q(0.95)} m, max ${q(1)} m`);
  console.log(`  worst: ${jumps.slice(-4).map(([d, id]) => `${id} ${d.toFixed(0)}m`).join(', ')}`);
  if (process.env.DEBUG) {
    const now2 = t2 / 1000;
    const fmt = (t: TrainState) => t.stops.slice(0, 4).map((s) => `${s.s}@${(s.a - now2).toFixed(0)}/${(s.d - now2).toFixed(0)}`).join(' ');
    const cur = new Map(second.map((t) => [t.id, t]));
    for (const [d, id] of jumps.slice(-4)) console.log(`  ${id} ${d.toFixed(0)}m\n    1: ${fmt(old.get(id)!)}\n    2: ${fmt(cur.get(id)!)}`);
  }
  const ids1 = new Set(first.map((t) => t.id));
  const ids2 = new Set(second.map((t) => t.id));
  console.log(`trains kept ${[...ids2].filter((i) => ids1.has(i)).length}, new ${[...ids2].filter((i) => !ids1.has(i)).length}, gone ${[...ids1].filter((i) => !ids2.has(i)).length}`);
}

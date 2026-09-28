// Verifies the Seoul data and adapters. Run: npx tsx scripts/check-seoul.ts [--watch N]
// 1. real now (realtime with SEOUL_API_KEY, otherwise the simulation), 2. simulation at set times,
// 3. the realtime tracker fed with the public `sample` key (5 rows per line), 4. the realtime tracker fed with a
// synthetic feed made from simulated trips with hidden delays, over 10 minutes of polls, 5. replay of recorded real
// feed logs, 6. with --watch N: N real polls 20 s apart (recorded for replay), 7. data budgets.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { cityBounds } from '../shared/geo.ts';
import { stock as seoulStock } from '../shared/stock/seoul.ts';
import type { TrainState, TransitData } from '../shared/types.ts';
import { serviceDay } from '../server/adapters/seoul/calendar.ts';
import { CallBudget, DEFAULT_DAILY_BUDGET, createAdapters, fetchPositions, parseBudget, realtimeAdapter, scheduled, scheduledAdapter } from '../server/adapters/seoul/index.ts';
import { LINES, TERMINAL_ALIAS, nameKeys, normName } from '../server/adapters/seoul/lines.ts';
import { network } from '../server/adapters/seoul/network.ts';
import { SeoulTracker, type PositionRow } from '../server/adapters/seoul/realtime.ts';

const ROOT = resolve(import.meta.dirname, '..');
const STOCK = Object.fromEntries(seoulStock.map((s) => [s.id, s]));
const transit = JSON.parse(readFileSync(join(ROOT, 'public/data/seoul/transit.json'), 'utf8')) as TransitData;
const stationById = new Map(transit.stations.map((s) => [s.id, s]));
const lineIds = new Set(transit.lines.map((l) => l.id));
const segByPair = new Map<string, TransitData['segments']>();
for (const seg of transit.segments) {
  for (const k of [`${seg.from}|${seg.to}`, `${seg.to}|${seg.from}`]) {
    if (!segByPair.has(k)) segByPair.set(k, []);
    segByPair.get(k)!.push(seg);
  }
}
const isoKst = (t: number) => new Date((t + 9 * 3600) * 1000).toISOString().slice(0, 19) + '+09:00';
const kst = (t: number) => new Date((t + 9 * 3600) * 1000).toISOString().slice(5, 16).replace('T', ' ') + ' KST';
const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) : '-') + '%';
const q = (arr: number[], p: number) => (arr.length ? [...arr].sort((x, y) => x - y)[Math.min(arr.length - 1, Math.floor(p * arr.length))] : NaN);

function pointAlong(line: string, a: string, b: string, f: number): [number, number] | null {
  const list = segByPair.get(`${a}|${b}`);
  if (!list) return null;
  const seg = list.find((s) => s.lines.includes(line)) ?? list[0];
  let p = seg.pts;
  if (seg.from !== a) {
    const r: number[] = [];
    for (let i = p.length - 2; i >= 0; i -= 2) r.push(p[i], p[i + 1]);
    p = r;
  }
  const cum = [0];
  for (let i = 2; i < p.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]));
  const target = Math.max(0, Math.min(1, f)) * cum[cum.length - 1];
  let j = 0;
  while (j < cum.length - 2 && cum[j + 1] < target) j++;
  const t = cum[j + 1] > cum[j] ? (target - cum[j]) / (cum[j + 1] - cum[j]) : 0;
  return [p[2 * j] + t * (p[2 * j + 2] - p[2 * j]), p[2 * j + 1] + t * (p[2 * j + 3] - p[2 * j + 1])];
}

function positionAt(tr: TrainState, t: number): [number, number] | null {
  const st = tr.stops;
  const xy = (s: string): [number, number] | null => {
    const x = stationById.get(s);
    return x ? [x.x, x.y] : null;
  };
  if (t <= st[0].d) return xy(st[0].s);
  for (let i = 0; i < st.length - 1; i++) {
    if (t <= st[i + 1].a) return pointAlong(tr.line, st[i].s, st[i + 1].s, (t - st[i].d) / Math.max(1, st[i + 1].a - st[i].d));
    if (t <= st[i + 1].d) return xy(st[i + 1].s);
  }
  return xy(st[st.length - 1].s);
}

function report(title: string, trains: TrainState[], nowSec: number, samples = 3) {
  console.log(`\n=== ${title}: ${trains.length} trains at ${kst(nowSec)}`);
  const byLine = new Map<string, TrainState[]>();
  for (const t of trains) {
    if (!byLine.has(t.line)) byLine.set(t.line, []);
    byLine.get(t.line)!.push(t);
  }
  for (const l of LINES) {
    const list = byLine.get(l.id) ?? [];
    const stock = new Map<string, number>();
    for (const t of list) {
      const k = `${t.stock.replace(/^seoul-/, '')}×${t.cars}`;
      stock.set(k, (stock.get(k) ?? 0) + 1);
    }
    const live = list.filter((t) => t.live).length;
    console.log(`  ${l.id.padEnd(16)} ${String(list.length).padStart(3)} ${live ? `(${live} live)` : ''}  ${[...stock].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ')}`);
  }
  let pairs = 0, covered = 0, bracket = 0, mono = 0;
  const unknown = new Set<string>();
  const ids = new Set<string>();
  const dupes = new Set<string>();
  for (const t of trains) {
    if (ids.has(t.id)) dupes.add(t.id);
    ids.add(t.id);
    if (!lineIds.has(t.line)) unknown.add(`line:${t.line}`);
    if (!STOCK[t.stock]) unknown.add(`stock:${t.stock}`);
    for (const s of t.stops) if (!stationById.has(s.s)) unknown.add(`station:${s.s}`);
    for (let i = 1; i < t.stops.length; i++) {
      pairs++;
      if (segByPair.has(`${t.stops[i - 1].s}|${t.stops[i].s}`)) covered++;
      else unknown.add(`pair:${t.line}:${t.stops[i - 1].s}-${t.stops[i].s}`);
    }
    const st = t.stops;
    if (st[0].a <= nowSec + 1 && nowSec <= st[st.length - 1].d + 1) bracket++;
    else if (process.env.SEOUL_DEBUG) console.log(`    not bracketing ${t.id} ${t.label ?? ''} now ${isoKst(nowSec)}: ${st.map((x) => `${x.s} ${isoKst(x.a).slice(11, 19)}-${isoKst(x.d).slice(11, 19)}`).join(' | ')}`);
    if (st.every((s, i) => s.a <= s.d && (i === 0 || st[i - 1].d <= s.a))) mono++;
  }
  console.log(`  segment coverage ${pct(covered, pairs)} of ${pairs} pairs · timelines bracket now ${pct(bracket, trains.length)} · monotonic ${pct(mono, trains.length)}`);
  console.log(`  unknown ids: ${unknown.size ? [...unknown].slice(0, 12).join(', ') : 'none'}${dupes.size ? ` · duplicate train ids: ${[...dupes].slice(0, 5).join(', ')}` : ''}`);
  const picks = [...trains].sort((a, b) => a.id.localeCompare(b.id)).filter((_, i, arr) => i % Math.max(1, Math.floor(arr.length / samples)) === 0).slice(0, samples);
  for (const t of picks) {
    console.log(`  · ${t.id} [${t.line}] → ${t.dest} ${t.destLocal ?? ''} ${t.service ?? ''} ${t.dir ?? ''} · ${t.stock} ×${t.cars}${t.live ? ' LIVE' : ''} · ${t.label ?? ''}`);
    for (const s of t.stops.slice(0, 4)) console.log(`      ${(stationById.get(s.s)?.name ?? s.s).padEnd(28)} a ${isoKst(s.a)}  d ${isoKst(s.d)}`);
    if (t.stops.length > 4) console.log(`      … ${t.stops.length} stops`);
  }
}

// ---------------------------------------------------------------------------- geometry and stock sanity

const b = cityBounds('seoul');
const outside = transit.stations.filter((s) => s.x < b.minX || s.x > b.maxX || s.y < b.minY || s.y > b.maxY);
let maxEnd = 0, maxEndAt = '';
for (const seg of transit.segments) {
  const n = seg.pts.length;
  for (const [s, x, y] of [[seg.from, seg.pts[0], seg.pts[1]], [seg.to, seg.pts[n - 2], seg.pts[n - 1]]] as const) {
    const st = stationById.get(s)!;
    const d = Math.hypot(st.x - x, st.y - y);
    if (d > maxEnd) (maxEnd = d), (maxEndAt = `${seg.from}–${seg.to}`);
  }
}
const elCount = transit.segments.filter((s) => s.el).length;
console.log(`transit.json: ${transit.lines.length} lines, ${transit.stations.length} stations, ${transit.segments.length} segments (${elCount} with el), ${(JSON.stringify(transit).length / 1e6).toFixed(2)} MB`);
console.log(`stations outside bbox: ${outside.length} · max segment end-to-station distance ${maxEnd.toFixed(1)} m (${maxEndAt})`);
console.log(`stations without Korean name: ${transit.stations.filter((s) => !s.nameLocal).length} · lines: ${transit.lines.map((l) => `${l.short}=${l.color}`).join(' ')}`);
const stockUsed = new Set(transit.lines.map((l) => l.stock));
console.log(`line default stock unknown: ${[...stockUsed].filter((s) => !STOCK[s]).join(', ') || 'none'} · Seoul stock specs: ${seoulStock.length}`);
const specIssues: string[] = [];
for (const sp of seoulStock) {
  if (!sp.id.startsWith('seoul-')) specIssues.push(`${sp.id} prefix`);
  if (sp.blurb.length > 140) specIssues.push(`${sp.id} blurb ${sp.blurb.length} chars`);
  const hexes = [sp.body, sp.roof, sp.front, sp.doorColor, sp.windowColor, sp.skirt, ...(sp.stripes ?? []).map((x) => x.color), ...(sp.frontStripes ?? []).map((x) => x.color)];
  for (const h of hexes) if (h !== undefined && h !== 'line' && !/^#[0-9A-F]{6}$/i.test(h)) specIssues.push(`${sp.id} color ${h}`);
  for (const st of [...(sp.stripes ?? []), ...(sp.frontStripes ?? [])]) if (!(st.from >= 0 && st.to <= 1 && st.from < st.to)) specIssues.push(`${sp.id} stripe ${st.from}-${st.to}`);
}
console.log(`stock spec issues: ${specIssues.length ? specIssues.join('; ') : 'none'}`);

const nowSec = Date.now() / 1000;
const today = serviceDay(nowSec, 0);
console.log(`service day: ${today.date} (${today.type})`);

// ---------------------------------------------------------------------------- 1. real now

const key = process.env.SEOUL_API_KEY;
const realNow: TrainState[] = [];
for (const a of createAdapters({ SEOUL_API_KEY: key })) {
  const t0 = Date.now();
  const trains = await a.poll(Date.now());
  console.log(`adapter ${a.id} "${a.name}" (${a.live ? 'live' : 'scheduled'}): ${trains.length} trains, ${trains.filter((t) => t.live).length} live, ${Date.now() - t0} ms`);
  realNow.push(...trains);
}
report(`REAL NOW (${key ? 'realtime key' : 'no key: simulation'})`, realNow, Date.now() / 1000);

// ---------------------------------------------------------------------------- 2. simulation

const allLines = LINES.map((l) => l.id);
const kstAt = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+09:00`) / 1000;
const weekday = (() => {
  for (let d = 0; d < 10; d++) {
    const day = serviceDay(nowSec + d * 86400, 0);
    if (day.type === 'wd') return day.date;
  }
  return today.date;
})();
const rush = kstAt(weekday, '08:15');
report(`TIMETABLE / SIMULATION weekday ${weekday} 08:15`, scheduled(allLines, rush), rush);
for (const [d, hhmm] of [[weekday, '13:00'], [weekday, '21:30'], [weekday, '23:55'], [today.date, '13:00']] as const) {
  const t = kstAt(d, hhmm);
  console.log(`SIMULATION ${d} ${hhmm} (${serviceDay(t).type}): ${scheduled(allLines, t).length} trains`);
}
const late = kstAt(weekday, '00:40') + 86400;
report(`SIMULATION after midnight ${kst(late)}`, scheduled(allLines, late), late, 1);

// ---------------------------------------------------------------------------- 3. public sample key

const net = network();
const sampleRows = new Map<string, PositionRow[]>();
const unknownNames = new Set<string>();
const unknownTerms = new Set<string>();
for (const l of LINES) {
  try {
    const rows = await fetchPositions(`http://swopenAPI.seoul.go.kr/api/subway/sample/json/realtimePosition/0/5/${encodeURIComponent(l.api)}`);
    sampleRows.set(l.id, rows);
    for (const r of rows) {
      const keys = nameKeys(r.statnNm ?? '');
      const known = keys.some((n) => net.lines[l.id].index[n] !== undefined || n in TERMINAL_ALIAS || net.lines[l.id].variants.some((v) => v.seq.includes(`~${n}`)));
      if (!known) unknownNames.add(`${l.id}:${r.statnNm}`);
      if (!net.names[normName(r.statnTnm ?? '')]) unknownTerms.add(`${l.id}:${r.statnTnm}`);
    }
  } catch (err) {
    console.log(`sample ${l.api}: ${err}`);
  }
}
const sampleTrains: TrainState[] = [];
let sampleRowsInside = 0, sampleUnroutable = 0;
for (const [line, rows] of sampleRows) {
  const tr = new SeoulTracker(line);
  const res = tr.update(rows, Date.now() / 1000);
  sampleRowsInside += rows.length - [...res.unknownStations].length;
  sampleUnroutable += res.unroutable;
  sampleTrains.push(...res.trains);
}
console.log(`\nsample key: ${[...sampleRows.values()].flat().length} rows on ${sampleRows.size} lines · station names not in network: ${unknownNames.size ? [...unknownNames].join(', ') : 'none'}`);
console.log(`  terminals without a display name: ${unknownTerms.size ? [...unknownTerms].join(', ') : 'none'} · unroutable rows: ${sampleUnroutable}`);
report('SAMPLE KEY (5 rows per line, first poll)', sampleTrains, Date.now() / 1000, 4);

// ---------------------------------------------------------------------------- 4. synthetic realtime feed

let fixtureTruth: (trackId: string, t: number) => [number, number] | null = () => null;

/** The feed's direction for a train running through these stops, from the oriented OSM sequences. */
function udOf(line: string, stops: TrainState['stops']): string {
  const idx = new Map(net.stations.map((s, i) => [s, i]));
  for (let k = 0; k + 1 < stops.length; k++) {
    const a = idx.get(stops[k].s), b = idx.get(stops[k + 1].s);
    for (const v of net.lines[line].variants) {
      if (v.ud === undefined || v.loop) continue;
      const ia = v.seq.indexOf(a!), ib = v.seq.indexOf(b!);
      if (ia >= 0 && ib > ia) return String(v.ud);
    }
  }
  return '0';
}

/** Simulated trips as the truth, with hidden delays; emits realtimePosition rows as the feed would. */
function makeFixture(t0: number) {
  const hidden = new Map<string, number>();
  const delayOf = (id: string) => {
    if (!hidden.has(id)) {
      const h = [...id].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7);
      hidden.set(id, h % 10 < 5 ? 0 : 20 + (h % 180));
    }
    return hidden.get(id)!;
  };
  const nums = new Map<string, string>();
  const byNo = new Map<string, string>();
  fixtureTruth = (trackId, t) => {
    const [line, no] = [trackId.slice(0, trackId.lastIndexOf('.')), trackId.slice(trackId.lastIndexOf('.') + 1)];
    const id = byNo.get(no);
    if (!id) return null;
    const delay = delayOf(id);
    const tr = scheduled([line], t - delay).find((x) => x.id === id);
    return tr ? positionAt(tr, t - delay) : null;
  };
  return (t: number): Map<string, PositionRow[]> => {
    const out = new Map<string, PositionRow[]>();
    const truth = scheduled(allLines, t - 200); // candidates; shifted by their delay below
    const seen = new Set<string>();
    for (const cand of [...truth, ...scheduled(allLines, t)]) {
      if (seen.has(cand.id)) continue;
      seen.add(cand.id);
      const delay = delayOf(cand.id);
      // The feed shows each event ~12 s late; 'arrived' spans 15 s before the stop to 15 s after departure.
      const at = t - delay - 12;
      const tr = scheduled([cand.line], at).find((x) => x.id === cand.id);
      if (!tr) continue;
      const st = tr.stops;
      let row: Partial<PositionRow> | null = null;
      for (let i = 0; i < st.length && !row; i++) {
        const next = st[i + 1];
        if (at >= st[i].a - 15 && at <= st[i].d + 15) row = { statnNm: st[i].s, trainSttus: '1', recptnDt: String(st[i].a - 15 + delay) };
        else if (next && at > st[i].d + 15 && at < next.a - 15) {
          row = at >= next.a - 30
            ? { statnNm: next.s, trainSttus: '0', recptnDt: String(next.a - 30 + delay) }
            : { statnNm: st[i].s, trainSttus: '2', recptnDt: String(st[i].d + 15 + delay) };
        }
      }
      if (!row) continue;
      const stationKo = stationById.get(row.statnNm!)!.nameLocal!;
      if (!nums.has(cand.id)) {
        nums.set(cand.id, String(1000 + nums.size));
        byNo.set(nums.get(cand.id)!, cand.id);
      }
      const rec = Math.min(t, Number(row.recptnDt));
      const loop = tr.dir === 'Inner Circle' || tr.dir === 'Outer Circle';
      const r: PositionRow = {
        statnNm: stationKo,
        trainNo: nums.get(cand.id),
        recptnDt: new Date((rec + 9 * 3600) * 1000).toISOString().slice(0, 19).replace('T', ' '),
        updnLine: loop ? (tr.dir === 'Outer Circle' ? '1' : '0') : udOf(cand.line, tr.stops),
        statnTnm: tr.destLocal,
        trainSttus: row.trainSttus,
        directAt: tr.service ? '1' : '0',
        lstcarAt: '0',
      };
      if (!out.has(cand.line)) out.set(cand.line, []);
      out.get(cand.line)!.push(r);
    }
    return out;
  };
}

const T0 = kstAt(weekday, '09:10');
const fixture = makeFixture(T0);
let fixtureTime = T0;
let snapshot = fixture(T0);
const live = LINES.map((l) => l.group)
  .filter((g, i, a) => a.indexOf(g) === i)
  .map((g) =>
    realtimeAdapter({
      id: `fixture-${g}`,
      name: 'fixture',
      key: 'fixture',
      lines: LINES.filter((l) => l.group === g).map((l) => l.id),
      fetchRows: async (_url, line) => snapshot.get(line) ?? [],
    }),
  );
let prev: Map<string, TrainState> | undefined;
const jumps: number[] = [];
let first: TrainState[] = [];
let last: TrainState[] = [];
for (let k = 0; k <= 20; k++) {
  fixtureTime = T0 + k * 30;
  snapshot = fixture(fixtureTime);
  const trains = (await Promise.all(live.map((a) => a.poll(fixtureTime * 1000)))).flat();
  if (k === 0) first = trains;
  last = trains;
  const cur = new Map(trains.map((t) => [t.id, t]));
  if (prev) {
    for (const [id, t] of cur) {
      const p = prev.get(id);
      if (!p || !t.live) continue;
      const a = positionAt(p, fixtureTime), b2 = positionAt(t, fixtureTime);
      if (a && b2) jumps.push(Math.hypot(a[0] - b2[0], a[1] - b2[1]));
      if (a && b2 && process.env.SEOUL_DEBUG && Math.hypot(a[0] - b2[0], a[1] - b2[1]) > 150) {
        const fmt = (x: TrainState) => x.stops.slice(0, 4).map((st) => `${st.s} ${isoKst(st.a).slice(11, 19)}-${isoKst(st.d).slice(11, 19)}`).join(' > ');
        console.log(`    jump ${id} at ${isoKst(fixtureTime)}\n      before ${fmt(p)}\n      after  ${fmt(t)}`);
      }
    }
  }
  prev = cur;
}
// Accuracy: distance between the tracked position and the (delayed) simulated truth at the last poll.
const errors: number[] = [];
for (const t of last) {
  if (!t.live) continue;
  const truth = fixtureTruth(t.id, fixtureTime);
  const pos = positionAt(t, fixtureTime);
  if (truth && pos) errors.push(Math.hypot(pos[0] - truth[0], pos[1] - truth[1]));
  if (truth && pos && process.env.SEOUL_DEBUG && Math.hypot(pos[0] - truth[0], pos[1] - truth[1]) > 400)
    console.log(`    far ${t.id} ${Math.hypot(pos[0] - truth[0], pos[1] - truth[1]).toFixed(0)} m: ${t.stops.slice(0, 3).map((st) => `${st.s} ${isoKst(st.a).slice(11, 19)}-${isoKst(st.d).slice(11, 19)}`).join(' > ')}`);
}
report('SYNTHETIC REALTIME FEED (first poll)', first, T0);
report('SYNTHETIC REALTIME FEED (after 10 minutes)', last, fixtureTime);
console.log(`  poll-to-poll jumps (m): median ${q(jumps, 0.5).toFixed(1)}, p95 ${q(jumps, 0.95).toFixed(1)}, p99 ${q(jumps, 0.99).toFixed(1)}, max ${q(jumps, 1).toFixed(1)} over ${jumps.length} train-polls (${jumps.filter((j) => j > 150).length} > 150 m)`);
console.log(`  distance from the true position (m): median ${q(errors, 0.5).toFixed(0)}, p95 ${q(errors, 0.95).toFixed(0)}, max ${q(errors, 1).toFixed(0)} (${errors.length} trains)`);

// ---------------------------------------------------------------------------- 5. replay saved real feed logs

const API_CACHE = join(ROOT, '.cache/seoul/api');
const logs = existsSync(API_CACHE) ? readdirSync(API_CACHE).filter((f) => /^watch-.*\.jsonl$/.test(f)).sort() : [];
if (logs.length) {
  const rj: number[] = [];
  let rows = 0, polls = 0;
  for (const f of logs) {
    const trackers = new Map<string, SeoulTracker>();
    const prevPos = new Map<string, TrainState>();
    for (const line of readFileSync(join(API_CACHE, f), 'utf8').trim().split('\n')) {
      const e = JSON.parse(line) as { t: number; line: string; rows: PositionRow[] };
      if (!trackers.has(e.line)) trackers.set(e.line, new SeoulTracker(e.line));
      const at = e.t / 1000;
      const { trains } = trackers.get(e.line)!.update(e.rows, at);
      rows += e.rows.length;
      polls++;
      for (const t of trains) {
        const p = prevPos.get(t.id);
        const a = p ? positionAt(p, at) : null, b2 = a ? positionAt(t, at) : null;
        if (a && b2) rj.push(Math.hypot(a[0] - b2[0], a[1] - b2[1]));
        if (a && b2 && process.env.SEOUL_DEBUG && Math.hypot(a[0] - b2[0], a[1] - b2[1]) > 150) {
          const fmt = (x: TrainState) => x.stops.slice(0, 3).map((st) => `${st.s} ${isoKst(st.a).slice(11, 19)}-${isoKst(st.d).slice(11, 19)}`).join(' > ');
          console.log(`    jump ${t.id} ${f} ${isoKst(at)}\n      before ${fmt(p!)}\n      after  ${fmt(t)}`);
        }
        prevPos.set(t.id, t);
      }
    }
  }
  console.log(`\nreplay of ${logs.length} saved real feed log(s): ${polls} line polls, ${rows} rows`);
  console.log(`  poll-to-poll jumps (m): median ${q(rj, 0.5).toFixed(1)}, p95 ${q(rj, 0.95).toFixed(1)}, p99 ${q(rj, 0.99).toFixed(1)}, max ${q(rj, 1).toFixed(1)} over ${rj.length} train-polls (${rj.filter((j) => j > 150).length} > 150 m)`);
} else {
  console.log('\nno saved real feed logs yet (run with --watch N to record some)');
}

// ---------------------------------------------------------------------------- 6. optional: watch the sample feed

const watchArg = process.argv.indexOf('--watch');
if (watchArg > 0) {
  const polls = Number(process.argv[watchArg + 1] ?? 10);
  // Raw rows are kept under .cache/seoul/api/ so a watch can be replayed while tuning the tracker.
  const log = join(ROOT, `.cache/seoul/api/watch-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
  mkdirSync(dirname(log), { recursive: true });
  const watch = realtimeAdapter({
    id: 'seoul-sample',
    name: 'watch',
    key: key ?? 'sample',
    lines: allLines,
    fetchRows: async (url, line) => {
      const rows = await fetchPositions(key ? url : url.replace('/0/300/', '/0/5/'));
      appendFileSync(log, JSON.stringify({ t: Date.now(), line, rows }) + '\n');
      return rows;
    },
  });
  let before: Map<string, TrainState> | undefined;
  const wj: number[] = [];
  let lastW: TrainState[] = [];
  let at = 0;
  for (let k = 0; k < polls; k++) {
    if (k) await new Promise((r) => setTimeout(r, 20_000));
    at = Date.now() / 1000;
    lastW = (await watch.poll(at * 1000)).filter((t) => t.live);
    const cur = new Map(lastW.map((t) => [t.id, t]));
    if (before) {
      for (const [id, t] of cur) {
        const p = before.get(id);
        const a = p ? positionAt(p, at) : null, b2 = a ? positionAt(t, at) : null;
        if (a && b2) wj.push(Math.hypot(a[0] - b2[0], a[1] - b2[1]));
        if (a && b2 && Math.hypot(a[0] - b2[0], a[1] - b2[1]) > 150) {
          const fmt = (x: TrainState) => x.stops.slice(0, 3).map((st) => `${st.s} ${isoKst(st.a).slice(11, 19)}-${isoKst(st.d).slice(11, 19)}`).join(' > ');
          console.log(`  jump ${id} ${Math.hypot(a[0] - b2[0], a[1] - b2[1]).toFixed(0)} m\n    before ${fmt(p!)}\n    after  ${fmt(t)}`);
        }
      }
    }
    before = cur;
    console.log(`watch ${k + 1}/${polls} ${kst(at)}: ${lastW.length} live trains`);
  }
  report('SAMPLE FEED WATCH (last poll)', lastW, at, 4);
  console.log(`  poll-to-poll jumps (m): median ${q(wj, 0.5).toFixed(1)}, p95 ${q(wj, 0.95).toFixed(1)}, max ${q(wj, 1).toFixed(1)} over ${wj.length} train-polls`);
}

// ---------------------------------------------------------------------------- 7. budgets

const netBytes = readFileSync(join(ROOT, 'server/data/seoul/network.json')).length;
const ttBytes = readFileSync(join(ROOT, 'server/data/seoul/timetable.json')).length;
console.log(`\nserver/data/seoul: network.json ${(netBytes / 1e6).toFixed(2)} MB, timetable.json ${(ttBytes / 1e6).toFixed(2)} MB · adapter ids: ${createAdapters({}).map((a) => a.id).join(', ')}`);
// Budget: a capped key watched all day long must stay under its daily calls and fall back to the timetable after.
{
  const budget = new CallBudget(DEFAULT_DAILY_BUDGET, LINES.length);
  const ads = LINES.map((l) => l.group)
    .filter((g, i, a) => a.indexOf(g) === i)
    .map((g) => realtimeAdapter({ id: g, name: g, key: 'x', budget, lines: LINES.filter((l) => l.group === g).map((l) => l.id), fetchRows: async () => [] }));
  const start = kstAt(weekday, '07:00');
  let calls = 0, polls = 0;
  const spend = budget.spend.bind(budget);
  budget.spend = () => (calls++, spend());
  for (let t = start; t < start + 6 * 3600; t += 30, polls++) await Promise.all(ads.map((a) => a.poll(t * 1000)));
  const leftAt13 = budget.left(start + 6 * 3600);
  const gaps = ['07:00', '12:00', '20:00'].map((h) => `${(new CallBudget(DEFAULT_DAILY_BUDGET, LINES.length).gap(kstAt(weekday, h)) / 60).toFixed(0)} min at ${h}`);
  console.log(`budget: ${DEFAULT_DAILY_BUDGET} calls/day (SEOUL_DAILY_BUDGET=unlimited → ${parseBudget('unlimited')}); watched nonstop 07:00–13:00 (${polls} polls × 3 adapters): ${calls} calls, ${leftAt13} left for the rest of the day`);
  console.log(`  each line refreshes every ${gaps.join(', ')} on a fresh budget`);
}
void scheduledAdapter;

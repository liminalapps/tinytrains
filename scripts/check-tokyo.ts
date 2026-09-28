// Verifies the Tokyo data and adapters. Run: npx tsx scripts/check-tokyo.ts
// 1. real now against the live feeds, 2. timetable simulation at daytime instants,
// 3. the live Toei path fed with a synthetic odpt:Train fixture over 10 minutes of polls.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cityBounds } from '../shared/geo.ts';
import { stock as tokyoStock } from '../shared/stock/tokyo.ts';
import type { TrainState, TransitData } from '../shared/types.ts';
import { dayType, holidays, serviceDay } from '../server/adapters/tokyo/calendar.ts';
import { createAdapters, odptAdapter, scheduledAdapter } from '../server/adapters/tokyo/index.ts';
import { LINES, canonStation, ownerFromNumber } from '../server/adapters/tokyo/lines.ts';
import type { OdptTrain } from '../server/adapters/tokyo/odpt.ts';
import { Schedule, type Trip } from '../server/adapters/tokyo/schedule.ts';

const ROOT = resolve(import.meta.dirname, '..');
const STOCK = Object.fromEntries(tokyoStock.map((s) => [s.id, s]));
const transit = JSON.parse(readFileSync(join(ROOT, 'public/data/tokyo/transit.json'), 'utf8')) as TransitData;
const stationById = new Map(transit.stations.map((s) => [s.id, s]));
const lineIds = new Set(transit.lines.map((l) => l.id));
const segByPair = new Map<string, TransitData['segments']>();
for (const seg of transit.segments) {
  for (const k of [`${seg.from}|${seg.to}`, `${seg.to}|${seg.from}`]) {
    if (!segByPair.has(k)) segByPair.set(k, []);
    segByPair.get(k)!.push(seg);
  }
}
const isoJst = (t: number) => new Date((t + 9 * 3600) * 1000).toISOString().slice(0, 19) + '+09:00';
const iso = (t: number) => new Date(t * 1000).toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).slice(5) + ' JST';

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

const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) : '-') + '%';

function report(title: string, trains: TrainState[], nowSec: number, samples = 3) {
  console.log(`\n=== ${title}: ${trains.length} trains at ${iso(nowSec)}`);
  const byLine = new Map<string, TrainState[]>();
  for (const t of trains) {
    if (!byLine.has(t.line)) byLine.set(t.line, []);
    byLine.get(t.line)!.push(t);
  }
  for (const l of LINES) {
    const list = byLine.get(l.id) ?? [];
    const stock = new Map<string, number>();
    for (const t of list) stock.set(`${t.stock.replace(/^tokyo-/, '')}×${t.cars}`, (stock.get(`${t.stock.replace(/^tokyo-/, '')}×${t.cars}`) ?? 0) + 1);
    const live = list.filter((t) => t.live).length;
    console.log(`  ${l.id.padEnd(3)} ${String(list.length).padStart(3)} ${live ? `(${live} live)` : ''}  ${[...stock].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ')}`);
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
    }
    const st = t.stops;
    if (st[0].a <= nowSec + 1 && nowSec <= st[st.length - 1].d + 1 && (st.length > 1 ? st[0].d <= nowSec || st[0].a <= nowSec : true)) bracket++;
    if (st.every((s, i) => s.a <= s.d && (i === 0 || st[i - 1].d <= s.a))) mono++;
  }
  console.log(`  segment coverage ${pct(covered, pairs)} of ${pairs} pairs · timelines bracket now ${pct(bracket, trains.length)} · monotonic ${pct(mono, trains.length)}`);
  console.log(`  unknown ids: ${unknown.size ? [...unknown].slice(0, 12).join(', ') : 'none'}${dupes.size ? ` · duplicate train ids: ${[...dupes].slice(0, 5).join(', ')}` : ''}`);
  const picks = [...trains].sort((a, b) => a.id.localeCompare(b.id)).filter((_, i, arr) => i % Math.max(1, Math.floor(arr.length / samples)) === 0).slice(0, samples);
  for (const t of picks) {
    console.log(`  · ${t.id} [${t.line}] → ${t.dest} ${t.destLocal ?? ''} ${t.service ? `${t.service} ${t.serviceLocal ?? ''}` : ''} ${t.dir ?? ''} · ${t.stock} ×${t.cars}${t.live ? ' LIVE' : ''}${t.delay !== undefined ? ` delay ${t.delay}s` : ''} · ${t.label ?? ''}`);
    for (const s of t.stops.slice(0, 4)) console.log(`      ${(stationById.get(s.s)?.name ?? s.s).padEnd(24)} a ${isoJst(s.a)}  d ${isoJst(s.d)}`);
    if (t.stops.length > 4) console.log(`      … ${t.stops.length} stops`);
  }
}

// ---------------------------------------------------------------------------- geometry sanity

const b = cityBounds('tokyo');
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
const stockUsed = new Set(transit.lines.map((l) => l.stock));
console.log(`transit.json: ${transit.lines.length} lines, ${transit.stations.length} stations, ${transit.segments.length} segments (${elCount} with el), ${(JSON.stringify(transit).length / 1e6).toFixed(2)} MB`);
console.log(`stations outside bbox: ${outside.length} · max segment end-to-station distance ${maxEnd.toFixed(1)} m (${maxEndAt})`);
console.log(`line default stock unknown: ${[...stockUsed].filter((s) => !STOCK[s]).join(', ') || 'none'} · Tokyo stock specs: ${Object.keys(STOCK).filter((k) => k.startsWith('tokyo-')).length}`);

const specIssues: string[] = [];
for (const [id, sp] of Object.entries(STOCK)) {
  if (!id.startsWith('tokyo-')) continue;
  if (sp.blurb.length > 140) specIssues.push(`${id} blurb ${sp.blurb.length} chars`);
  const hexes = [sp.body, sp.roof, sp.front, sp.doorColor, sp.windowColor, sp.skirt, ...(sp.stripes ?? []).map((x) => x.color), ...(sp.frontStripes ?? []).map((x) => x.color)];
  for (const h of hexes) if (h !== undefined && h !== 'line' && !/^#[0-9A-F]{6}$/i.test(h)) specIssues.push(`${id} color ${h}`);
  for (const st of [...(sp.stripes ?? []), ...(sp.frontStripes ?? [])]) if (!(st.from >= 0 && st.to <= 1 && st.from < st.to)) specIssues.push(`${id} stripe ${st.from}-${st.to}`);
}
console.log(`stock spec issues: ${specIssues.length ? specIssues.join('; ') : 'none'}`);

// ---------------------------------------------------------------------------- calendar

const nowSec = Date.now() / 1000;
const today = serviceDay(nowSec, 0), yesterday = serviceDay(nowSec, 1);
console.log(`service days: ${today.date} (${today.type}), ${yesterday.date} (${yesterday.type})`);
console.log(`2026 holidays: ${[...holidays(2026)].sort().join(' ')}`);
console.log(`day types: 2026-09-22 ${dayType(2026, 9, 22)}, 2026-12-31 ${dayType(2026, 12, 31)}, 2027-01-04 ${dayType(2027, 1, 4)}, 2026-09-26 ${dayType(2026, 9, 26)}`);

// ---------------------------------------------------------------------------- 1. real now

// Keep any real odpt:Train snapshot we catch, so the live path can be replayed later (section 4).
const SAMPLES = join(ROOT, '.cache/tokyo/odpt-samples');
try {
  const res = await fetch('https://api-public.odpt.org/api/v4/odpt:Train?odpt:operator=odpt.Operator:Toei', { signal: AbortSignal.timeout(15_000) });
  const body = (await res.json()) as OdptTrain[];
  if (Array.isArray(body) && body.length) {
    mkdirSync(SAMPLES, { recursive: true });
    writeFileSync(join(SAMPLES, `toei-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify(body));
  }
  console.log(`real Toei odpt:Train feed: ${Array.isArray(body) ? body.length : 'non-array'} trains`);
} catch (err) {
  console.log(`real Toei odpt:Train feed failed: ${err}`);
}

const adapters = createAdapters({ ODPT_KEY: process.env.ODPT_KEY });
const realNow: TrainState[] = [];
for (const a of adapters) {
  const t0 = Date.now();
  const trains = await a.poll(Date.now());
  console.log(`adapter ${a.id} (${a.live ? 'live' : 'scheduled'}): ${trains.length} trains, ${trains.filter((t) => t.live).length} live, ${Date.now() - t0} ms`);
  realNow.push(...trains);
}
report('REAL NOW', realNow, Date.now() / 1000);

// ---------------------------------------------------------------------------- 2. daytime simulation

const schedule = Schedule.load();
const jst = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+09:00`) / 1000;
const nextDay = (d: string) => new Date(Date.parse(`${d}T12:00:00+09:00`) + 86400000).toISOString().slice(0, 10);
const allScheduled = [
  scheduledAdapter('s-toei', '', LINES.filter((l) => l.group === 'toei').map((l) => l.id)),
  scheduledAdapter('s-metro', '', LINES.filter((l) => l.group === 'metro').map((l) => l.id)),
  scheduledAdapter('s-jr', '', LINES.filter((l) => l.group === 'jr').map((l) => l.id)),
  scheduledAdapter('s-other', '', LINES.filter((l) => l.group === 'other').map((l) => l.id)),
];
const simAt = async (t: number) => (await Promise.all(allScheduled.map((a) => a.poll(t * 1000)))).flat();
const rush = jst(today.date, '08:30');
report(`TIMETABLE ${today.date} 08:30 (${today.type})`, await simAt(rush), rush);
for (const [d, hhmm] of [[nextDay(today.date), '13:00'], [today.date, '00:20']] as const) {
  const t = jst(d, hhmm);
  const trains = await simAt(t);
  console.log(`\nTIMETABLE ${d} ${hhmm} (${serviceDay(t, 0).type}): ${trains.length} trains`);
}
const late = jst(nextDay(today.date), '00:30');
report(`TIMETABLE ${nextDay(today.date)} 00:30 (after midnight, previous service day)`, await simAt(late), late, 1);

// ---------------------------------------------------------------------------- 3. live Toei fixture

/** Scheduled trips of the fixture lines, each with a hidden 'true' delay; emits odpt:Train objects. */
const FIXTURE_LINES = ['A', 'I', 'S', 'E'];
function makeFixture(t0: number) {
  const trips: { trip: Trip; base: number; delay: number; drift: number; number: string }[] = [];
  const day = serviceDay(t0, 0);
  for (const line of FIXTURE_LINES) {
    const cal = schedule.calendar(line, day.type)!;
    for (const trip of schedule.byCal.get(`${line}|${cal}`) ?? []) {
      const tt = t0 - day.base;
      if (tt < trip.times[0] - 600 || tt > trip.times[trip.times.length - 1] + 900) continue;
      const h = [...trip.id].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7);
      const number = trip.legs[0][2];
      trips.push({ trip, base: day.base, delay: h % 10 < 6 ? 0 : 30 + (h % 271), drift: h % 7 === 0 ? 0.08 : 0, number: h % 20 === 0 ? `${number}X` : number });
    }
  }
  return (t: number): OdptTrain[] => {
    const out: OdptTrain[] = [];
    for (const f of trips) {
      const delay = f.delay + f.drift * (t - t0);
      const st = f.trip.st, times = f.trip.times;
      const at = t - delay - f.base;
      if (at < times[0] || at > times[times.length - 1]) continue;
      let from = '', to: string | null = null;
      for (let i = 0; i < st.length; i++) {
        if (at >= times[2 * i] && at <= times[2 * i + 1]) (from = st[i]), (to = null);
        else if (i < st.length - 1 && at > times[2 * i + 1] && at < times[2 * i + 2]) {
          const mids = schedule.between(f.trip.line, st[i], st[i + 1]) ?? [];
          const frac = (at - times[2 * i + 1]) / (times[2 * i + 2] - times[2 * i + 1]);
          const seq = [{ s: st[i], f: 0 }, ...mids, { s: st[i + 1], f: 1 }];
          let k = 0;
          while (k < seq.length - 2 && seq[k + 1].f <= frac) k++;
          (from = seq[k].s), (to = seq[k + 1].s);
        }
        if (from) break;
      }
      if (!from) continue;
      const leg = f.trip.legs[0];
      const owner = ownerFromNumber(f.trip.line, leg[2]);
      const odptSt = (s: string) => `odpt.Station:${s.replace('TokyoMetro.Namboku.', 'Toei.Mita.')}`;
      out.push({
        'dc:date': new Date(t * 1000).toISOString(),
        'odpt:railway': `odpt.Railway:${leg[1]}`,
        'odpt:trainNumber': f.number,
        'odpt:trainType': `odpt.TrainType:${leg[3]}`,
        'odpt:fromStation': odptSt(from),
        'odpt:toStation': to ? odptSt(to) : null,
        'odpt:railDirection': `odpt.RailDirection:${leg[4]}`,
        'odpt:destinationStation': leg[5] ? [`odpt.Station:${leg[5]}`] : null,
        'odpt:delay': Math.floor(delay / 60) * 60,
        'odpt:trainOwner': `odpt.TrainOwner:${owner ?? 'Toei'}`,
        'odpt:carComposition': f.trip.cars,
      });
    }
    return out;
  };
}

const T0 = jst(today.date, '09:15');
const fixture = makeFixture(T0);
let fixtureTime = T0;
const live = odptAdapter({
  id: 'tokyo-toei',
  name: 'fixture',
  url: 'fixture://',
  lines: LINES.filter((l) => l.group === 'toei').map((l) => l.id),
  fetchTrains: async () => fixture(fixtureTime),
});
let prev: Map<string, TrainState> | undefined;
const jumps: number[] = [];
const errors: number[] = [];
let first: TrainState[] = [];
for (let k = 0; k <= 20; k++) {
  fixtureTime = T0 + k * 30;
  const trains = await live.poll(fixtureTime * 1000);
  if (k === 0) first = trains;
  const cur = new Map(trains.map((t) => [t.id, t]));
  if (prev) {
    for (const [id, t] of cur) {
      const p = prev.get(id);
      if (!p || !t.live) continue;
      const a = positionAt(p, fixtureTime), b2 = positionAt(t, fixtureTime);
      if (a && b2) jumps.push(Math.hypot(a[0] - b2[0], a[1] - b2[1]));
    }
  }
  prev = cur;
}
// Accuracy against the fixture's own truth at the last poll.
const station = (odpt: string) => stationById.get(canonStation(odpt.slice(13)));
for (const o of fixture(fixtureTime)) {
  const t = prev!.get(`${o['odpt:railway']!.slice(13)}.${o['odpt:trainNumber']}`);
  if (!t) continue;
  const pos = positionAt(t, fixtureTime);
  const from = station(o['odpt:fromStation']!);
  const to = o['odpt:toStation'] ? station(o['odpt:toStation']) : from;
  if (!pos || !from || !to) continue;
  // Distance from the reported from→to track (0 when on it).
  let err = Math.hypot(pos[0] - from.x, pos[1] - from.y);
  const seg = from !== to ? segByPair.get(`${from.id}|${to.id}`)?.[0] : undefined;
  if (seg) {
    for (let i = 2; i < seg.pts.length; i += 2) {
      const ax = seg.pts[i - 2], ay = seg.pts[i - 1], dx = seg.pts[i] - ax, dy = seg.pts[i + 1] - ay, l2 = dx * dx + dy * dy;
      const u = l2 ? Math.max(0, Math.min(1, ((pos[0] - ax) * dx + (pos[1] - ay) * dy) / l2)) : 0;
      err = Math.min(err, Math.hypot(ax + u * dx - pos[0], ay + u * dy - pos[1]));
    }
  }
  errors.push(err);
}
const q = (arr: number[], p: number) => (arr.length ? [...arr].sort((x, y) => x - y)[Math.min(arr.length - 1, Math.floor(p * arr.length))] : NaN);
report(`LIVE TOEI FIXTURE (first poll, ${FIXTURE_LINES.join('/')} live, SA/NT from timetable)`, first, T0);
console.log(`  fixture: ${fixture(T0).length} odpt:Train objects at ${iso(T0)}; 21 polls every 30 s`);
console.log(`  poll-to-poll jumps (m): median ${q(jumps, 0.5).toFixed(1)}, p95 ${q(jumps, 0.95).toFixed(1)}, p99 ${q(jumps, 0.99).toFixed(1)}, max ${q(jumps, 1).toFixed(1)} over ${jumps.length} train-polls (${jumps.filter((j) => j > 100).length} > 100 m)`);
console.log(`  distance from the reported from→to track (m): median ${q(errors, 0.5).toFixed(1)}, p95 ${q(errors, 0.95).toFixed(1)}, max ${q(errors, 1).toFixed(1)} (${errors.length} trains)`);

// ---------------------------------------------------------------------------- 4. replay saved real snapshots

const saved = existsSync(SAMPLES) ? readdirSync(SAMPLES).filter((f) => f.endsWith('.json')).sort() : [];
if (saved.length) {
  const snaps = saved.map((f) => JSON.parse(readFileSync(join(SAMPLES, f), 'utf8')) as OdptTrain[]);
  let cur = snaps[0];
  const replay = odptAdapter({ id: 'tokyo-toei', name: 'replay', url: 'replay://', lines: ['A', 'I', 'S', 'E', 'SA', 'NT'], fetchTrains: async () => cur });
  let last: TrainState[] = [];
  let at = 0;
  for (const snap of snaps) {
    cur = snap;
    at = Math.max(...snap.map((t) => Date.parse(t['dc:date'] ?? '') / 1000).filter(Number.isFinite), at + 1);
    last = await replay.poll(at * 1000);
  }
  report(`REPLAY of ${snaps.length} saved real Toei snapshot(s)`, last, at);
} else {
  console.log('\nno saved real Toei snapshots yet (they are captured automatically when the feed is live)');
}

// ---------------------------------------------------------------------------- 5. optional: watch the real feed (--watch N)

const watchArg = process.argv.indexOf('--watch');
if (watchArg > 0) {
  const polls = Number(process.argv[watchArg + 1] ?? 10);
  const TOEI = 'https://api-public.odpt.org/api/v4/odpt:Train?odpt:operator=odpt.Operator:Toei';
  let lastRaw: OdptTrain[] = [];
  const real = odptAdapter({
    id: 'tokyo-toei',
    name: 'watch',
    url: TOEI,
    lines: LINES.filter((l) => l.group === 'toei').map((l) => l.id),
    fetchTrains: async (url) => {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      lastRaw = (await res.json()) as OdptTrain[];
      if (Array.isArray(lastRaw) && lastRaw.length) {
        mkdirSync(SAMPLES, { recursive: true });
        writeFileSync(join(SAMPLES, `toei-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify(lastRaw));
      }
      return lastRaw;
    },
  });
  let before: Map<string, TrainState> | undefined;
  const wj: number[] = [];
  let last: TrainState[] = [];
  let at = 0;
  for (let k = 0; k < polls; k++) {
    if (k) await new Promise((r) => setTimeout(r, 30_000));
    at = Date.now() / 1000;
    last = await real.poll(at * 1000);
    const cur = new Map(last.map((t) => [t.id, t]));
    if (before) {
      for (const [id, t] of cur) {
        const p = before.get(id);
        const a = p && t.live ? positionAt(p, at) : null, b2 = a ? positionAt(t, at) : null;
        if (a && b2) wj.push(Math.hypot(a[0] - b2[0], a[1] - b2[1]));
      }
    }
    before = cur;
    const matched = lastRaw.filter((o) => {
      const rw = o['odpt:railway']?.replace('odpt.Railway:', '') ?? '';
      const line = LINES.find((l) => l.railway === rw)?.id;
      return line && o['odpt:trainNumber'] && schedule.findTrip(rw, o['odpt:trainNumber'], line, at);
    }).length;
    const rws = [...new Set(lastRaw.map((o) => o['odpt:railway']?.replace('odpt.Railway:Toei.', '')))].join(',');
    console.log(`watch ${k + 1}/${polls} ${iso(at)}: feed ${lastRaw.length} (${rws}), timetable matches ${matched}, adapter ${last.length} trains (${last.filter((t) => t.live).length} live)`);
  }
  report('REAL TOEI WATCH (last poll)', last, at);
  console.log(`  poll-to-poll jumps (m): median ${q(wj, 0.5).toFixed(1)}, p95 ${q(wj, 0.95).toFixed(1)}, max ${q(wj, 1).toFixed(1)} over ${wj.length} train-polls`);
}

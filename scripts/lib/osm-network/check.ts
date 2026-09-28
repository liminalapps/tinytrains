// Sim kit check (docs/KIT_SIM.md): geometry and stock sanity, simulated trains at set times, poll-to-poll continuity.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CITIES } from '../../../shared/cities.ts';
import { cityBounds } from '../../../shared/geo.ts';
import type { CityId, StockSpec, TrainState, TransitData } from '../../../shared/types.ts';
import { SimCity, serviceDay } from '../../../server/adapters/sim/index.ts';
import type { SimData } from '../../../server/adapters/sim/data.ts';
import type { AdapterFactory } from '../../../server/adapters/types.ts';

const ROOT = resolve(import.meta.dirname, '../../..');

export async function checkSimCity(city: CityId, opts: { samples?: number } = {}): Promise<void> {
  const transit = JSON.parse(readFileSync(join(ROOT, `public/data/${city}/transit.json`), 'utf8')) as TransitData;
  const simText = readFileSync(join(ROOT, `server/data/${city}/sim.json`), 'utf8');
  const data = JSON.parse(simText) as SimData;
  const sim = new SimCity(city, data);
  const specs = ((await import(`../../../shared/stock/${city}.ts`)) as { stock: StockSpec[] }).stock;
  const STOCK = new Map(specs.map((s) => [s.id, s]));
  const stationById = new Map(transit.stations.map((s) => [s.id, s]));
  const lineIds = transit.lines.map((l) => l.id);
  const segByPair = new Map<string, TransitData['segments']>();
  for (const seg of transit.segments) {
    for (const k of [`${seg.from}|${seg.to}`, `${seg.to}|${seg.from}`]) {
      if (!segByPair.has(k)) segByPair.set(k, []);
      segByPair.get(k)!.push(seg);
    }
  }
  const tz = CITIES[city].tz;
  const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const iso = (t: number) => fmt.format(new Date(t * 1000));
  const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) : '-') + '%';
  const q = (arr: number[], p: number) => (arr.length ? [...arr].sort((x, y) => x - y)[Math.min(arr.length - 1, Math.floor(p * arr.length))] : NaN);

  // ------------------------------------------------------------------------- geometry and stock
  const b = cityBounds(city);
  const outside = transit.stations.filter((s) => s.x < b.minX || s.x > b.maxX || s.y < b.minY || s.y > b.maxY);
  let maxEnd = 0, maxEndAt = '';
  for (const seg of transit.segments) {
    const n = seg.pts.length;
    for (const [sid, x, y] of [[seg.from, seg.pts[0], seg.pts[1]], [seg.to, seg.pts[n - 2], seg.pts[n - 1]]] as const) {
      const st = stationById.get(sid)!;
      const d = Math.hypot(st.x - x, st.y - y);
      if (d > maxEnd) (maxEnd = d), (maxEndAt = `${seg.from}–${seg.to}`);
    }
  }
  console.log(`transit.json: ${transit.lines.length} lines, ${transit.stations.length} stations, ${transit.segments.length} segments (${transit.segments.filter((s) => s.el).length} with el), ${(JSON.stringify(transit).length / 1e6).toFixed(2)} MB · sim.json ${(simText.length / 1e6).toFixed(2)} MB`);
  console.log(`stations outside bbox: ${outside.length} · max segment end-to-station ${maxEnd.toFixed(0)} m (${maxEndAt}) · without nameLocal: ${transit.stations.filter((s) => !s.nameLocal).length}`);
  console.log(`lines: ${transit.lines.map((l) => `${l.short}=${l.color}`).join(' ')}`);
  const issues: string[] = [];
  for (const l of transit.lines) if (!STOCK.has(l.stock)) issues.push(`line ${l.id} stock ${l.stock} unknown`);
  for (const [lid, line] of Object.entries(data.lines)) for (const s of line.stock) if (!STOCK.has(s.stock)) issues.push(`line ${lid} stock ${s.stock} unknown`);
  for (const sp of specs) {
    if (!sp.id.startsWith(`${city}-`)) issues.push(`${sp.id}: id should start with '${city}-'`);
    if (sp.blurb.length > 140) issues.push(`${sp.id}: blurb ${sp.blurb.length} chars`);
    const hexes = [sp.body, sp.roof, sp.front, sp.doorColor, sp.windowColor, sp.skirt, ...(sp.stripes ?? []).map((x) => x.color), ...(sp.frontStripes ?? []).map((x) => x.color)];
    for (const h of hexes) if (h !== undefined && h !== 'line' && !/^#[0-9A-F]{6}$/i.test(h)) issues.push(`${sp.id}: color ${h}`);
    for (const st of [...(sp.stripes ?? []), ...(sp.frontStripes ?? [])]) if (!(st.from >= 0 && st.to <= 1 && st.from < st.to)) issues.push(`${sp.id}: stripe ${st.from}-${st.to}`);
  }
  console.log(`stock: ${specs.length} specs · issues: ${issues.length ? issues.join('; ') : 'none'}`);

  // ------------------------------------------------------------------------- report
  const report = (title: string, trains: TrainState[], nowSec: number, samples = opts.samples ?? 3) => {
    console.log(`\n=== ${title}: ${trains.length} trains at ${iso(nowSec)}`);
    for (const l of lineIds) {
      const list = trains.filter((t) => t.line === l);
      const stock = new Map<string, number>();
      for (const t of list) stock.set(`${t.stock.replace(`${city}-`, '')}×${t.cars}`, (stock.get(`${t.stock.replace(`${city}-`, '')}×${t.cars}`) ?? 0) + 1);
      console.log(`  ${l.padEnd(10)} ${String(list.length).padStart(3)}  ${[...stock].sort((a, b2) => b2[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ')}`);
    }
    let pairs = 0, covered = 0, bracket = 0, mono = 0;
    const unknown = new Set<string>(), ids = new Set<string>(), dupes = new Set<string>();
    for (const t of trains) {
      if (ids.has(t.id)) dupes.add(t.id);
      ids.add(t.id);
      if (!lineIds.includes(t.line)) unknown.add(`line:${t.line}`);
      if (!STOCK.has(t.stock)) unknown.add(`stock:${t.stock}`);
      for (const s of t.stops) if (!stationById.has(s.s)) unknown.add(`station:${s.s}`);
      for (let i = 1; i < t.stops.length; i++) {
        pairs++;
        if (segByPair.has(`${t.stops[i - 1].s}|${t.stops[i].s}`)) covered++;
        else unknown.add(`pair:${t.line}:${t.stops[i - 1].s}-${t.stops[i].s}`);
      }
      const st = t.stops;
      if (st[0].a <= nowSec + 1 && nowSec <= st[st.length - 1].d + 1) bracket++;
      if (st.every((s, i) => s.a <= s.d && (i === 0 || st[i - 1].d <= s.a))) mono++;
    }
    console.log(`  segment coverage ${pct(covered, pairs)} of ${pairs} pairs · timelines bracket now ${pct(bracket, trains.length)} · monotonic ${pct(mono, trains.length)}`);
    console.log(`  unknown ids: ${unknown.size ? [...unknown].slice(0, 12).join(', ') : 'none'}${dupes.size ? ` · duplicate train ids: ${[...dupes].slice(0, 5).join(', ')}` : ''}`);
    const picks = [...trains].sort((x, y) => x.id.localeCompare(y.id)).filter((_, i, arr) => i % Math.max(1, Math.floor(arr.length / samples)) === 0).slice(0, samples);
    for (const t of picks) {
      console.log(`  · ${t.id} [${t.line}] → ${t.dest} ${t.destLocal ?? ''} ${t.service ?? ''} ${t.dir ?? ''} · ${t.stock} ×${t.cars}`);
      for (const s of t.stops.slice(0, 4)) console.log(`      ${(stationById.get(s.s)?.name ?? s.s).padEnd(30)} a ${iso(s.a)}  d ${iso(s.d)}`);
      if (t.stops.length > 4) console.log(`      … ${t.stops.length} stops`);
    }
  };

  // ------------------------------------------------------------------------- now, through the city's adapters
  const factory = ((await import(`../../../server/adapters/${city}/index.ts`)) as { createAdapters: AdapterFactory }).createAdapters;
  const now: TrainState[] = [];
  for (const a of factory({})) {
    const trains = await a.poll(Date.now());
    console.log(`adapter ${a.id} "${a.name}" (${a.live ? 'live' : 'scheduled'}): ${trains.length} trains`);
    now.push(...trains);
  }
  report('NOW', now, Date.now() / 1000);

  // ------------------------------------------------------------------------- set times
  const nowSec = Date.now() / 1000;
  const dayOf = (type: 0 | 1 | 2) => {
    for (let d = 0; d < 14; d++) {
      const day = serviceDay(data, tz, nowSec + d * 86400);
      if (day.type === type) return day;
    }
    return serviceDay(data, tz, nowSec);
  };
  const at = (day: { base: number }, hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return day.base + (h < 3 ? h + 24 : h) * 3600 + m * 60;
  };
  const wd = dayOf(0), sat = dayOf(1), sun = dayOf(2);
  report(`WEEKDAY ${wd.date} 08:15`, sim.simulate(lineIds, at(wd, '08:15')), at(wd, '08:15'));
  const counts = (day: { date: string; base: number }, label: string) =>
    ['05:45', '08:15', '13:00', '18:00', '21:30', '23:55', '00:40'].map((h) => `${h} ${sim.simulate(lineIds, at(day, h)).length}`).join(' · ') + `  (${label} ${day.date})`;
  console.log(`\ntrains by time: ${counts(wd, 'weekday')}`);
  console.log(`                ${counts(sat, 'Saturday')}`);
  console.log(`                ${counts(sun, 'Sunday/holiday')}`);
  report(`AFTER MIDNIGHT ${wd.date} 00:40`, sim.simulate(lineIds, at(wd, '00:40')), at(wd, '00:40'), 1);

  // ------------------------------------------------------------------------- continuity: every train's position 30 s apart
  const pointAt = (tr: TrainState, t: number): [number, number] | null => {
    const st = tr.stops;
    const xy = (s: string): [number, number] => [stationById.get(s)!.x, stationById.get(s)!.y];
    if (t <= st[0].d) return xy(st[0].s);
    for (let i = 0; i + 1 < st.length; i++) {
      if (t <= st[i + 1].a) {
        const seg = segByPair.get(`${st[i].s}|${st[i + 1].s}`)?.find((s) => s.lines.includes(tr.line)) ?? segByPair.get(`${st[i].s}|${st[i + 1].s}`)?.[0];
        if (!seg) return null;
        let p = seg.pts;
        if (seg.from !== st[i].s) {
          const r: number[] = [];
          for (let k = p.length - 2; k >= 0; k -= 2) r.push(p[k], p[k + 1]);
          p = r;
        }
        const cum = [0];
        for (let k = 2; k < p.length; k += 2) cum.push(cum[cum.length - 1] + Math.hypot(p[k] - p[k - 2], p[k + 1] - p[k - 1]));
        const target = Math.max(0, Math.min(1, (t - st[i].d) / Math.max(1, st[i + 1].a - st[i].d))) * cum[cum.length - 1];
        let j = 0;
        while (j < cum.length - 2 && cum[j + 1] < target) j++;
        const f = cum[j + 1] > cum[j] ? (target - cum[j]) / (cum[j + 1] - cum[j]) : 0;
        return [p[2 * j] + f * (p[2 * j + 2] - p[2 * j]), p[2 * j + 1] + f * (p[2 * j + 3] - p[2 * j + 1])];
      }
      if (t <= st[i + 1].d) return xy(st[i + 1].s);
    }
    return xy(st[st.length - 1].s);
  };
  const jumps: number[] = [];
  let prev = new Map<string, TrainState>();
  const t0 = at(wd, '17:30');
  for (let k = 0; k <= 20; k++) {
    const t = t0 + 30 * k;
    const cur = new Map(sim.simulate(lineIds, t).map((x) => [x.id, x]));
    for (const [id, tr] of cur) {
      const p = prev.get(id);
      const a = p && pointAt(p, t), c = a && pointAt(tr, t);
      if (a && c) jumps.push(Math.hypot(a[0] - c[0], a[1] - c[1]));
    }
    prev = cur;
  }
  console.log(`\npoll-to-poll jumps over 10 min at 17:30 (m): median ${q(jumps, 0.5).toFixed(1)}, max ${q(jumps, 1).toFixed(1)} over ${jumps.length} train-polls`);
}

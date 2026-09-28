// GTFS feed access for the kit: download, unzip, streaming CSV, filtered stop_times, frequencies and calendars.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import type { ServiceDef } from '../../../server/adapters/gtfs/schedule.ts';
import type { FeedConfig, Row } from './types.ts';

export const ROOT = resolve(import.meta.dirname, '../../..');
export const UA = 'tiny-trains-build/0.1 (+https://tinytrains.app)';
export const REFRESH = process.argv.includes('--refresh');
export const DEBUG = process.argv.includes('--debug');

const WANTED = ['agency', 'routes', 'trips', 'stops', 'stop_times', 'calendar', 'calendar_dates', 'shapes', 'frequencies'];

export interface Feed {
  id: string;
  dir: string;
  has: (name: string) => boolean;
}

/** Download (cached) and unzip a feed into .cache/<city>/<feed id>/. */
export async function openFeed(city: string, f: FeedConfig): Promise<Feed> {
  const cache = join(ROOT, '.cache', city);
  mkdirSync(cache, { recursive: true });
  const local = !/^https?:/.test(f.url);
  const zip = local ? (isAbsolute(f.url) ? f.url : join(ROOT, f.url)) : join(cache, f.file ?? `${f.id}.zip`);
  if (!local && (REFRESH || !existsSync(zip))) {
    console.log(`downloading ${f.url}`);
    const res = await fetch(f.url, { headers: { 'user-agent': UA, ...f.headers }, redirect: 'follow' });
    if (!res.ok) throw new Error(`${f.id}: HTTP ${res.status}`);
    writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  }
  const dir = join(cache, f.id);
  const stamp = join(dir, '.extracted');
  if (!existsSync(stamp) || statSync(stamp).mtimeMs < statSync(zip).mtimeMs) {
    console.log(`extracting ${f.id}`);
    mkdirSync(dir, { recursive: true });
    const names = execFileSync('unzip', ['-Z1', zip], { maxBuffer: 1 << 26 }).toString().split('\n').filter(Boolean);
    const pick = names.filter((n) => WANTED.includes(n.split('/').pop()!.replace(/\.txt$/, '')));
    // -j flattens feeds that keep their files in a subfolder; stop_times can be >1 GB, so unzip writes to disk.
    execFileSync('unzip', ['-o', '-q', '-j', zip, ...pick, '-d', dir], { stdio: 'inherit' });
    writeFileSync(stamp, new Date().toISOString());
  }
  return { id: f.id, dir, has: (name) => existsSync(join(dir, name)) };
}

export function splitCsv(line: string): string[] {
  if (!line.includes('"')) return line.split(',');
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c !== '"') cur += c;
      else if (line[i + 1] === '"') (cur += '"'), i++;
      else q = false;
    } else if (c === '"') q = true;
    else if (c === ',') out.push(cur), (cur = '');
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** Stream a table row by row; `pre` can reject raw lines cheaply before they are split. */
export async function* rows(feed: Feed, name: string, pre?: (line: string) => boolean): AsyncGenerator<Row> {
  if (!feed.has(name)) return;
  const rl = createInterface({ input: createReadStream(join(feed.dir, name)), crlfDelay: Infinity });
  let head: string[] | null = null;
  for await (const raw of rl) {
    if (!head) {
      head = splitCsv(raw.replace(/^﻿/, '')).map((h) => h.trim());
      continue;
    }
    if (!raw.trim() || (pre && !pre(raw))) continue;
    const cells = splitCsv(raw);
    const row: Row = {};
    for (let j = 0; j < head.length; j++) row[head[j]] = (cells[j] ?? '').trim();
    yield row;
  }
}

/** Column names of a table. */
export async function header(feed: Feed, name: string): Promise<string[]> {
  if (!feed.has(name)) return [];
  const rl = createInterface({ input: createReadStream(join(feed.dir, name)), crlfDelay: Infinity });
  for await (const raw of rl) {
    rl.close();
    return splitCsv(raw.replace(/^\uFEFF/, '')).map((h) => h.trim());
  }
  return [];
}

/** The first cell of a CSV line, unquoted. */
export const firstCell = (line: string) => (line.startsWith('"') ? line.slice(1, line.indexOf('"', 1)) : line.slice(0, line.indexOf(',')));

export async function table(feed: Feed, name: string, pre?: (line: string) => boolean): Promise<Row[]> {
  const out: Row[] = [];
  for await (const r of rows(feed, name, pre)) out.push(r);
  return out;
}

export const secs = (t: string) => {
  if (!t) return NaN;
  const [h, m, s] = t.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
};

export interface StopTime {
  stop: string;
  a: number; // NaN when the feed leaves it empty (interpolated later)
  d: number;
  seq: number;
  /** stop_headsign, when the feed has one. */
  hs?: string;
}

/** stop_times rows of the kept trips, with a filtered copy cached next to the feed for fast reruns. */
export async function loadStopTimes(feed: Feed, keep: Set<string>): Promise<Map<string, StopTime[]>> {
  const file = join(feed.dir, 'stop_times.kept.txt');
  const sigFile = join(feed.dir, 'stop_times.kept.sig');
  const sig = createHash('sha1').update([...keep].sort().join('\n')).digest('hex');
  if (REFRESH || !existsSync(file) || !existsSync(sigFile) || readFileSync(sigFile, 'utf8') !== sig || statSync(file).mtimeMs < statSync(join(feed.dir, 'stop_times.txt')).mtimeMs) {
    console.log(`scanning ${feed.id} stop_times.txt`);
    const out = createWriteStream(file);
    const rl = createInterface({ input: createReadStream(join(feed.dir, 'stop_times.txt')), crlfDelay: Infinity });
    let head: string[] | null = null;
    let ti = 0;
    for await (const line of rl) {
      if (!head) {
        head = splitCsv(line.replace(/^﻿/, ''));
        ti = head.indexOf('trip_id');
        out.write(head.join(',') + '\n');
        continue;
      }
      let id: string;
      if (ti === 0) id = line.startsWith('"') ? line.slice(1, line.indexOf('"', 1)) : line.slice(0, line.indexOf(','));
      else id = splitCsv(line)[ti];
      if (keep.has(id)) out.write(line + '\n');
    }
    await new Promise((r) => out.end(r));
    writeFileSync(sigFile, sig);
  }
  const map = new Map<string, StopTime[]>();
  for await (const r of rows(feed, 'stop_times.kept.txt')) {
    let list = map.get(r.trip_id);
    if (!list) map.set(r.trip_id, (list = []));
    const a = secs(r.arrival_time || r.departure_time);
    const d = secs(r.departure_time || r.arrival_time);
    const st: StopTime = { stop: r.stop_id, a, d, seq: Number(r.stop_sequence) };
    if (r.stop_headsign) st.hs = r.stop_headsign;
    list.push(st);
  }
  for (const list of map.values()) list.sort((x, y) => x.seq - y.seq);
  return map;
}

/** Fill stop times the feed leaves empty (non-timepoints) by distance between the known ones. */
export function interpolate(list: StopTime[], xy: (stop: string) => [number, number] | undefined): boolean {
  const known = list.map((s) => !Number.isNaN(s.a));
  if (known.every(Boolean)) return true;
  if (!known[0] || !known[list.length - 1]) return false;
  const cum = [0];
  for (let i = 1; i < list.length; i++) {
    const p = xy(list[i - 1].stop), q = xy(list[i].stop);
    cum.push(cum[i - 1] + (p && q ? Math.hypot(q[0] - p[0], q[1] - p[1]) : 0));
  }
  let prev = 0;
  for (let i = 1; i < list.length; i++) {
    if (!known[i]) continue;
    for (let k = prev + 1; k < i; k++) {
      const span = cum[i] - cum[prev];
      const f = span > 0 ? (cum[k] - cum[prev]) / span : (k - prev) / (i - prev);
      const t = Math.round(list[prev].d + f * (list[i].a - list[prev].d));
      list[k].a = list[k].d = t;
    }
    prev = i;
  }
  return true;
}

/** Expand frequencies.txt into one trip per departure: id `${trip_id}#${start}`. */
export async function expandFrequencies(feed: Feed, stopTimes: Map<string, StopTime[]>): Promise<Map<string, string>> {
  const origin = new Map<string, string>(); // expanded trip id -> template trip id
  const templates = new Map<string, StopTime[]>();
  // A trip can have several rows (time-of-day bands); remove templates only after all bands are expanded.
  for (const r of await table(feed, 'frequencies.txt')) {
    const tpl = templates.get(r.trip_id) ?? stopTimes.get(r.trip_id);
    if (!tpl?.length) continue;
    templates.set(r.trip_id, tpl);
    const start = secs(r.start_time), end = secs(r.end_time), step = Number(r.headway_secs);
    if (!(step > 0)) continue;
    const t0 = tpl[0].d;
    for (let t = start; t < end; t += step) {
      const id = `${r.trip_id}#${t}`;
      stopTimes.set(id, tpl.map((s) => ({ ...s, a: s.a - t0 + t, d: s.d - t0 + t })));
      origin.set(id, r.trip_id);
    }
  }
  for (const id of templates.keys()) stopTimes.delete(id);
  return origin;
}

/** calendar + calendar_dates for the used services, optionally limited to a window of dates. */
export async function loadServices(feed: Feed, used: Set<string>, window?: [number, number]): Promise<Map<string, ServiceDef>> {
  const out = new Map<string, ServiceDef>();
  const get = (id: string) => out.get(id) ?? out.set(id, { days: '0000000', start: 0, end: 0 }).get(id)!;
  for await (const r of rows(feed, 'calendar.txt')) {
    if (!used.has(r.service_id)) continue;
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => (r[d] === '1' ? '1' : '0')).join('');
    Object.assign(get(r.service_id), { days, start: Number(r.start_date), end: Number(r.end_date) });
  }
  for await (const r of rows(feed, 'calendar_dates.txt')) {
    if (!used.has(r.service_id)) continue;
    const s = get(r.service_id);
    const date = Number(r.date);
    if (window && (date < window[0] || date > window[1])) continue;
    if (r.exception_type === '1') (s.add ??= []).push(date);
    else (s.rem ??= []).push(date);
  }
  for (const s of out.values()) {
    if (window) {
      s.start = Math.max(s.start, window[0]);
      s.end = Math.min(s.end, window[1]);
      if (s.start > s.end) (s.start = 0), (s.end = 0), (s.days = '0000000');
      s.rem = s.rem?.filter((d) => d >= s.start && d <= s.end);
      if (!s.rem?.length) delete s.rem;
    }
    s.add?.sort((a, b) => a - b);
    s.rem?.sort((a, b) => a - b);
  }
  return out;
}

/** Whether a service runs on at least one date (used to drop trips outside the date window). */
export function serviceRuns(s: ServiceDef): boolean {
  return !!s.add?.length || (s.start > 0 && s.end >= s.start && s.days.includes('1'));
}

/** Normalize extended route types (Google's HVT codes) to the basic GTFS ones. */
export function basicRouteType(t: number): number {
  if (t < 100) return t;
  if (t >= 100 && t < 200) return 2; // rail
  if (t >= 400 && t < 500) return t === 405 ? 12 : 1; // urban rail / metro; 405 monorail
  if (t >= 900 && t < 1000) return 0; // tram
  if (t >= 700 && t < 800) return 3; // bus
  if (t === 800) return 11; // trolleybus
  if (t === 1000 || t === 1200) return 4; // water
  if (t >= 1300 && t < 1400) return 6; // aerial
  if (t === 1400) return 7; // funicular
  return t;
}

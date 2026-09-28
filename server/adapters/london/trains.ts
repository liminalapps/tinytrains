import type { TimelineStop, TrainState } from '../../../shared/types.ts';
import { LINE_BY_ID, type TflMode } from './lines.ts';
import type { Network } from './network.ts';

/** A predicted call: station and expected arrival (epoch seconds). */
export interface Obs {
  s: string;
  t: number;
  pass?: boolean; // inserted station the train runs through without a prediction
}

/** One train as grouped from the arrivals feed, before its timeline is built. */
export interface Candidate {
  id: string;
  line: string;
  stops: Obs[];
  /** Stops are already in travel order (rebuilt chains); otherwise they are sorted by time. */
  ordered?: boolean;
  dest: string;
  destId?: string;
  dir?: string;
  service?: string;
  label?: string;
  location?: string;
  /** When `location` was reported (epoch seconds); TfL rows are often a minute old. */
  locationTime?: number;
  stock: string;
  cars: number;
}

interface Profile {
  v: number; // typical top speed between stations, m/s
  acc: number; // m/s^2
  dwell: number; // s
}

const PROFILES: Record<TflMode, Profile> = {
  tube: { v: 17, acc: 0.9, dwell: 30 },
  'elizabeth-line': { v: 26, acc: 0.8, dwell: 45 },
  overground: { v: 21, acc: 0.7, dwell: 35 },
  dlr: { v: 15, acc: 1.0, dwell: 25 },
  tram: { v: 11, acc: 1.0, dwell: 20 },
};

/** Run time over `len` meters with a trapezoidal speed profile. */
function runTime(p: Profile, len: number): number {
  return len >= (p.v * p.v) / p.acc ? len / p.v + p.v / p.acc : 2 * Math.sqrt(len / p.acc);
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------------------
// currentLocation ("Between Oval and Kennington", "At Platform", "Approaching Bank", ...)
// ---------------------------------------------------------------------------

interface Location {
  kind: 'platform' | 'at' | 'between' | 'left' | 'approaching';
  a?: string;
  b?: string;
}

function parseLocation(text: string | undefined): Location | undefined {
  if (!text) return undefined;
  let m: RegExpMatchArray | null;
  if (/^at platform/i.test(text)) return { kind: 'platform' };
  if ((m = text.match(/^between\s+(.+?)\s+and\s+(.+)$/i))) return { kind: 'between', a: m[1], b: m[2] };
  if ((m = text.match(/^(?:left|departed|leaving|departing)\s+(.+)$/i))) return { kind: 'left', a: m[1] };
  if ((m = text.match(/^approaching\s+(.+)$/i))) return { kind: 'approaching', a: m[1] };
  if ((m = text.match(/^at\s+(.+?)(?:\s+platform.*)?$/i))) return { kind: 'at', a: m[1] };
  return undefined;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/&/g, 'and')
    .replace(/underground station|station/g, '')
    .replace(/[^a-z0-9]/g, '');

/** Loose match between a (possibly truncated) location name and a station name. */
function sameName(text: string | undefined, name: string | undefined): boolean {
  if (!text || !name) return false;
  const a = norm(text), b = norm(name);
  if (a.length < 3 || b.length < 3) return false;
  return a.startsWith(b) || b.startsWith(a);
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

/**
 * Keep the longest chain of predictions in which every consecutive pair is joined by a segment
 * (possibly via stations the train runs through) and the time gap fits the run time. Drops duplicate
 * platforms, placeholder rows for trips that have not started, and stray predictions.
 */
function cleanPath(net: Network, line: string, stops: Obs[], ordered: boolean, run: (a: string, b: string) => number): Obs[] {
  const ln = net.lines.get(line);
  if (!ln) return [];
  const list: Obs[] = [];
  for (const o of ordered ? stops : [...stops].sort((a, b) => a.t - b.t)) {
    const t = Math.max(o.t, list.length ? list[list.length - 1].t : -Infinity);
    if (ln.stations.has(o.s) && !list.some((x) => x.s === o.s && Math.abs(x.t - t) < 60)) list.push({ ...o, t });
  }
  const n = list.length;
  if (!n) return [];
  const pathRun = (a: string, b: string, via: string[]) =>
    [a, ...via, b].reduce((acc, s, k, arr) => (k ? acc + run(arr[k - 1], s) : 0), 0);
  const best = new Array<number>(n).fill(1);
  const from = new Array<number>(n).fill(-1);
  for (let j = 0; j < n; j++) {
    for (let i = Math.max(0, j - 8); i < j; i++) {
      if (best[i] + 1 <= best[j] || list[i].s === list[j].s) continue;
      const via = net.bridge(line, list[i].s, list[j].s);
      if (via && list[j].t - list[i].t <= 3 * pathRun(list[i].s, list[j].s, via) + 300) {
        best[j] = best[i] + 1;
        from[j] = i;
      }
    }
  }
  let end = 0;
  for (let j = 1; j < n; j++) if (best[j] > best[end]) end = j;
  const chain: Obs[] = [];
  for (let j = end; j >= 0; j = from[j]) chain.unshift(list[j]);
  const out: Obs[] = [];
  for (const o of chain) {
    const last = out[out.length - 1];
    if (last) {
      // Never double back: a repeated station means two trains or a reversal got mixed up.
      const via = net.bridge(line, last.s, o.s) ?? [];
      if ([...via, o.s].some((s) => out.some((x) => x.s === s))) break;
      const total = pathRun(last.s, o.s, via);
      let acc = 0;
      let prev = last.s;
      for (const s of via) {
        acc += run(prev, s);
        out.push({ s, t: last.t + ((o.t - last.t) * acc) / total, pass: true });
        prev = s;
      }
    }
    out.push(o);
  }
  return out;
}

/** Where a timeline puts the train at `now`: standing at stop k (f = -1) or f of the way from stop k to k + 1. */
function locate(stops: TimelineStop[], now: number): { k: number; f: number } | null {
  for (let k = 0; k < stops.length; k++) {
    if (now < stops[k].a) return k ? { k: k - 1, f: (now - stops[k - 1].d) / Math.max(1, stops[k].a - stops[k - 1].d) } : null;
    if (now <= stops[k].d) return { k, f: -1 };
  }
  return null;
}

/**
 * Join a freshly estimated timeline onto where the previous poll's timeline shows the train right now,
 * so it never jumps: it keeps its place on the current stretch and the new times only change its speed.
 */
function splice(fresh: TimelineStop[], old: TrainState | undefined, now: number, run: (a: string, b: string) => number): TimelineStop[] {
  let out = fresh.map((x) => ({ ...x }));
  const pos = old && locate(old.stops, now);
  if (pos) {
    const S = old!.stops[pos.k];
    const T = pos.f >= 0 ? old!.stops[pos.k + 1] : undefined;
    const N = old!.stops[pos.k + 1];
    const j = out.findIndex((x) => x.s === S.s);
    if (j >= 0 && (out.length - j >= 2 || !T)) {
      // Never move back behind a stop the train has already reached.
      out = out.slice(j);
      out[0].a = Math.min(out[0].a, S.a);
      if (!T) out[0].d = Math.max(out[0].d, now);
      else if (out[1].s === T.s && out[1].a > now) out[0].d = Math.min(now, (now - pos.f * out[1].a) / (1 - pos.f));
      else out[0].d = Math.min(out[0].d, now);
      out[0].a = Math.min(out[0].a, out[0].d);
    } else if (j < 0 && N && out[0].s === N.s && pos.f < 1) {
      // The new data has the train further on: let it catch up from where it was.
      const f = Math.max(0, pos.f);
      const aN = now + (1 - f) * 0.7 * run(S.s, N.s);
      const dS = now - (f * (aN - now)) / (1 - f);
      out = [{ s: S.s, a: Math.min(S.a, dS), d: dS }, { s: N.s, a: aN, d: Math.max(aN + 5, out[0].d) }, ...out.slice(1)];
    }
  }
  for (let i = 1; i < out.length; i++) {
    const shift = out[i - 1].d - out[i].a;
    if (shift > 0) {
      out[i].a += shift;
      out[i].d += shift;
    }
  }
  return out.map((x, i) => {
    const a = i ? Math.round(x.a) : Math.floor(x.a);
    return { s: x.s, a, d: Math.max(a, Math.round(x.d)) };
  });
}

/** Rough position at time t along a timeline, interpolating straight between stations. Used to match trains across polls. */
export function approxPosition(net: Network, stops: TimelineStop[], t: number): [number, number] | null {
  const xy = (s: string) => net.stations.get(s);
  for (let k = 0; k < stops.length; k++) {
    const a = xy(stops[k].s);
    if (!a) return null;
    if (t <= stops[k].d) {
      if (t >= stops[k].a || k === 0) return [a.x, a.y];
      const p = xy(stops[k - 1].s)!;
      const f = (t - stops[k - 1].d) / Math.max(1, stops[k].a - stops[k - 1].d);
      return [p.x + (a.x - p.x) * f, p.y + (a.y - p.y) * f];
    }
  }
  const last = xy(stops[stops.length - 1].s);
  return last ? [last.x, last.y] : null;
}

/** Bearing label from station a toward station b. */
function bearing(net: Network, a: string, b: string): string | undefined {
  const sa = net.stations.get(a), sb = net.stations.get(b);
  if (!sa || !sb || a === b) return undefined;
  const dx = sb.x - sa.x, dy = sb.y - sa.y;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'Eastbound' : 'Westbound') : dy > 0 ? 'Northbound' : 'Southbound';
}

/**
 * Turn grouped predictions into a TrainState: find the stop the train last left (or is standing at),
 * estimate when it departed, and lay out the upcoming stops. `old` is this train's state from the
 * previous poll, used to keep motion continuous.
 */
export function buildTrain(net: Network, c: Candidate, nowMs: number, old?: TrainState): TrainState | null {
  const now = nowMs / 1000;
  const mode = LINE_BY_ID.get(c.line)?.mode;
  if (!mode) return null;
  const prof = PROFILES[mode];
  const run = (a: string, b: string) => runTime(prof, net.len(a, b));
  const name = (s: string) => net.stations.get(s)?.name;

  const obs = cleanPath(net, c.line, c.stops, !!c.ordered, run);
  if (!obs.length) return null;
  // A lone prediction (DLR rows are per platform): extend it toward the destination with modeled run times.
  while (obs.length < 3 && c.destId && obs[obs.length - 1].s !== c.destId) {
    const last = obs[obs.length - 1];
    const n = net.nextToward(c.line, last.s, c.destId);
    if (!n) break;
    obs.push({ s: n, t: last.t + (last.pass ? 0 : prof.dwell) + run(last.s, n) });
  }
  let curIdx = -1;
  for (let i = 0; i < obs.length; i++) if (obs[i].t <= now) curIdx = i;
  let cur: Obs | undefined = curIdx >= 0 ? obs[curIdx] : undefined;
  const up = obs.slice(curIdx + 1);
  if (!up.length) return null;

  const loc = parseLocation(c.location);
  // A stale prediction for a station the train is at or has already left.
  if (!cur && loc && up.length > 1) {
    const u1 = up[0];
    const atU1 = loc.kind === 'platform' || (loc.kind === 'at' && sameName(loc.a, name(u1.s)));
    const leftU1 = (loc.kind === 'left' || loc.kind === 'between') && sameName(loc.a, name(u1.s));
    if ((atU1 && u1.t - now < 90) || leftU1) {
      cur = { s: u1.s, t: Math.min(u1.t, now - (leftU1 ? 20 : 0)) };
      up.shift();
    }
  }

  // Pace of this train relative to the run-time model, from its own predictions.
  let predicted = 0, model = 0;
  for (let i = 0; i + 1 < Math.min(up.length, 5); i++) {
    predicted += up[i + 1].t - up[i].t - (up[i].pass ? 0 : prof.dwell);
    model += run(up[i].s, up[i + 1].s);
  }
  const pace = model > 60 ? clamp(predicted / model, 0.75, 1.6) : 1;

  const u1 = up[0];
  let prevS: string;
  let a0: number;
  let d0: number;
  let guessed = false; // previous stop inferred from the route alone
  if (cur) {
    prevS = cur.s;
    a0 = cur.t;
    d0 = Math.max(u1.t - pace * run(prevS, u1.s), a0 + 10);
  } else {
    const cands = net.predecessors(c.line, u1.s, up.find((o) => !o.pass && o !== u1)?.s ?? (c.destId !== u1.s ? c.destId : undefined));
    const hinted =
      cands.find((s) => sameName(loc?.a, name(s)) || sameName(loc?.b, name(s))) ??
      cands.find((s) => old?.stops.some((o) => o.s === s));
    if (hinted ?? cands[0]) {
      prevS = (hinted ?? cands[0])!;
      guessed = !sameName(loc?.a, name(prevS)) && !sameName(loc?.b, name(prevS));
      d0 = u1.t - pace * run(prevS, u1.s);
      a0 = d0 - prof.dwell;
    } else {
      // At its origin: show it waiting in the platform shortly before departure.
      if (net.edges.has(u1.s) || u1.t - now > 90 || up.length < 2) return null;
      prevS = u1.s;
      a0 = Math.min(now - 30, u1.t - 60);
      d0 = Math.max(u1.t, now + 1);
      up.shift();
    }
  }

  const next = up[0];
  const runNext = run(prevS, next.s);
  if (loc) {
    const atPrev = loc.kind === 'at' && sameName(loc.a, name(prevS));
    const movingFromPrev = (loc.kind === 'between' || loc.kind === 'left') && sameName(loc.a, name(prevS));
    const approaching = loc.kind === 'approaching' && sameName(loc.a, name(next.s));
    const seen = Math.min(c.locationTime ?? now, now);
    if (atPrev) d0 = Math.max(d0, Math.min(seen + 15, next.t - 0.5 * runNext));
    if (movingFromPrev || approaching) d0 = Math.min(d0, seen - 1);
  }

  // A moving train needs a sensible minimum time to reach the next stop (a waiting one pushes its arrivals instead).
  if (d0 <= now) d0 = Math.min(d0, next.t - 0.4 * runNext);
  a0 = Math.min(a0, d0, now);
  // Waiting at a terminus is only shown shortly before departure, so a train that has just arrived is not drawn twice.
  if (d0 - now > 600 || (d0 - now > 240 && guessed) || (d0 - now > 90 && net.isOrigin(c.line, prevS, next.s))) return null;

  const stops: TimelineStop[] = [{ s: prevS, a: Math.floor(a0), d: Math.max(Math.floor(a0), Math.round(d0)) }];
  let lastD = d0;
  let lastS = prevS;
  for (let i = 0; i < up.length && stops.length < 16; i++) {
    const o = up[i];
    const a = Math.max(o.t, lastD + 0.4 * run(lastS, o.s));
    const nextO = up[i + 1];
    const dwell = o.pass ? 0 : nextO ? Math.min(prof.dwell, Math.max(0, (nextO.t - o.t) * 0.3)) : prof.dwell;
    stops.push({ s: o.s, a: Math.round(a), d: Math.round(a + dwell) });
    lastD = a + dwell;
    lastS = o.s;
  }
  const final = splice(stops, old, now, run);
  if (final[final.length - 1].d < now) return null;

  return {
    id: c.id,
    line: c.line,
    dest: c.dest,
    dir: c.dir ?? bearing(net, final[0].s, final[final.length - 1].s),
    service: c.service,
    stock: c.stock,
    cars: c.cars,
    live: true,
    label: c.label,
    stops: final,
  };
}

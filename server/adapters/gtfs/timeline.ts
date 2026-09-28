// Timeline helpers shared by the GTFS kit's adapters (same logic as server/adapters/paris/schedule.ts): cutting a
// trip's times down to what the client needs, overlaying realtime predictions, and keeping trains continuous between polls.
import type { TimelineStop } from '../../../shared/types.ts';

/**
 * Cut a full timeline (flat [a, d] per pattern stop) down to the previous/current stop plus up to `ahead` upcoming stops.
 * Returns null when the train has not left its origin yet (beyond `lead` seconds of dwell) or has finished.
 */
export function windowTimeline(st: string[], times: number[], now: number, from = 0, ahead = 15, lead = 60, pos?: { k: number }): TimelineStop[] | null {
  const n = st.length;
  let k = -1;
  for (let i = from; i < n; i++) if (times[2 * i] <= now) k = i;
  if (k < 0) k = from;
  if (pos) pos.k = k;
  if (k === 0 && times[1] - now > lead) return null;
  if (k === n - 1 && now > times[2 * k + 1]) return null;
  const out: TimelineStop[] = [];
  for (let i = k; i < Math.min(n, k + 1 + ahead); i++) out.push({ s: st[i], a: Math.round(times[2 * i]), d: Math.round(times[2 * i + 1]) });
  if (out[0].a > now) out[0].a = Math.floor(now);
  for (let i = 0; i < out.length; i++) {
    if (i > 0 && out[i].a < out[i - 1].d) out[i].a = out[i - 1].d;
    if (out[i].d < out[i].a) out[i].d = out[i].a;
  }
  return out;
}

export interface RtStop {
  station: string;
  a?: number;
  d?: number;
}

/**
 * Overlay realtime predictions on a trip's scheduled times. Stops the feed doesn't mention inherit the delay of
 * their neighbors through scheduled run times; the stop before the first prediction gets an estimated departure
 * (or a remembered one from an earlier poll). `shownAt` is the stop index the train was shown at last poll.
 */
export function mergeRealtime(
  st: string[],
  sched: number[],
  rt: RtStop[],
  remembered?: Map<number, number>,
  shownAt?: number,
): { times: number[]; from: number } | null {
  const n = st.length;
  const got: (RtStop | undefined)[] = new Array(n);
  let cursor = 0;
  let last = -1;
  for (const u of rt) {
    let j = -1;
    for (let i = cursor; i < n; i++)
      if (st[i] === u.station) {
        j = i;
        break;
      }
    if (j < 0) continue;
    if (j === last && got[j]) got[j] = { station: u.station, a: got[j]!.a ?? u.a, d: u.d ?? got[j]!.d };
    else got[j] = u;
    cursor = j;
    last = j;
  }
  const first = got.findIndex(Boolean);
  if (first < 0) return null;

  const times = new Array<number>(2 * n);
  const run = (i: number) => sched[2 * i] - sched[2 * i - 1];
  const dwell = (i: number) => sched[2 * i + 1] - sched[2 * i];
  for (let i = first; i < n; i++) {
    const u = got[i];
    const est = i === first ? NaN : times[2 * i - 1] + run(i);
    let a = u?.a ?? u?.d ?? est;
    let d = u?.d ?? (u?.a != null ? u.a + Math.max(dwell(i), i === n - 1 ? 30 : 20) : a + dwell(i));
    // An arrival-only prediction at the origin means the train is waiting there: it leaves on time, not early.
    if (i === 0 && u?.d == null && u?.a != null) d = Math.max(d, sched[1]);
    if (i === n - 1 && u?.d == null) d = a + 30;
    if (i > first && a < times[2 * i - 1]) a = times[2 * i - 1];
    if (d < a) d = a;
    times[2 * i] = a;
    times[2 * i + 1] = d;
  }
  const shown = remembered?.get(first);
  if (shown != null) times[2 * first + 1] = Math.max(shown, times[2 * first]);
  else if (first < n - 1) {
    const hold = Math.min(times[2 * first + 2] - run(first + 1), sched[2 * first + 1]);
    if (hold > times[2 * first + 1] + 60) times[2 * first + 1] = hold;
  }
  if (first < n - 1 && times[2 * first + 2] < times[2 * first + 1]) times[2 * first + 2] = times[2 * first + 1];
  let from = first;
  const back = Math.max(0, Math.min(first - 1, shownAt ?? first - 1));
  for (let p = first - 1; p >= back; p--) {
    const d = remembered?.get(p) ?? times[2 * p + 2] - run(p + 1);
    times[2 * p + 1] = Math.min(d, times[2 * p + 2]);
    times[2 * p] = times[2 * p + 1] - Math.max(dwell(p), p === 0 ? 0 : 20);
    from = p;
  }
  return { times, from };
}

/** Per-train state kept across polls so predictions that change don't make trains jump around. */
export interface TrainMemo {
  seen: number;
  dep: Map<number, number>;
  prev?: { now: number; k: number; d: number; next: number };
}

export function memoFor(memo: Map<string, TrainMemo>, id: string, now: number): TrainMemo {
  let m = memo.get(id);
  if (!m) memo.set(id, (m = { seen: now, dep: new Map() }));
  m.seen = now;
  return m;
}

/**
 * Keep a train continuous with what the previous poll showed: a new timeline starts from wherever the old one
 * places the train right now.
 */
export function stabilize(m: TrainMemo, st: string[], times: number[], from: number, now: number): TimelineStop[] | null {
  const p = m.prev;
  if (p && p.k > from && p.k < st.length) {
    from = p.k;
    times[2 * from] = Math.min(times[2 * from], p.now);
    times[2 * from + 1] = Math.max(times[2 * from + 1], times[2 * from], p.d);
  }
  if (p && p.k >= from && p.k < st.length - 1) {
    const k = p.k;
    const next = times[2 * k + 2];
    if (p.d >= now) {
      if (times[2 * k + 1] < now && next > now + 10) times[2 * k + 1] = now;
    } else if (now >= p.next) {
      if (next > now) (times[2 * k + 2] = now), (times[2 * k + 3] = Math.max(times[2 * k + 3], now));
    } else {
      const f = (now - p.d) / Math.max(1, p.next - p.d);
      if (next > now && f < 0.97) {
        times[2 * k + 1] = Math.min(now, (now - f * next) / (1 - f));
        times[2 * k] = Math.min(times[2 * k], times[2 * k + 1]);
      }
    }
  }
  const stops = windowTimeline(st, times, now, from);
  if (!stops) return null;
  const k = st.indexOf(stops[0].s, from);
  if (stops[0].d <= now) m.dep.set(k, stops[0].d);
  m.prev = { now, k, d: stops[0].d, next: stops[1]?.a ?? NaN };
  return stops;
}

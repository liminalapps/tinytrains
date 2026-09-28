// Generic timetable adapter of the GTFS kit, with an optional realtime overlay (see docs/KIT_GTFS.md).
import type { CityId, TrainState } from '../../../shared/types.ts';
import type { Adapter } from '../types.ts';
import type { RealtimeSource, RtTrip } from './realtime.ts';
import { GtfsSchedule, type ActiveTrip } from './schedule.ts';
import { memoFor, mergeRealtime, stabilize, windowTimeline, type RtStop, type TrainMemo } from './timeline.ts';

export interface GtfsAdapterSpec {
  id: string;
  /** Source name; its first word must match the system's name (the UI pairs them). */
  name: string;
  systems?: string[];
  lines?: string[];
  realtime?: RealtimeSource;
  intervalMs?: number;
  /** How realtime trips find their timetable trip: by trip key, by line + stations + times, or key then time. */
  match?: 'key' | 'time' | 'both';
  /** 'auto': with realtime for most of a line's running trips, the rest are taken as cancelled. */
  dropUnmatched?: 'auto' | 'never';
}

/** How far realtime and timetable may disagree and still be the same train, seconds. */
const MATCH_AIMED = 420;
const MATCH_EXPECTED = 600;

export function gtfsAdapters(o: { city: CityId; schedule: string; adapters: GtfsAdapterSpec[] }): Adapter[] {
  return o.adapters.map((spec) => gtfsAdapter(o.city, o.schedule, spec));
}

function gtfsAdapter(city: CityId, path: string, spec: GtfsAdapterSpec): Adapter {
  const memo = new Map<string, TrainMemo>();
  const sticky = new Map<string, string>(); // realtime trip key/label -> timetable train id
  /** Last realtime timeline per train: a train the feed skips for a poll or two keeps it instead of snapping back. */
  const held = new Map<string, { times: number[]; from: number; delay?: number; seen: number }>();
  /** Where timetable-only trains were drawn last poll, so the first realtime update eases in instead of jumping. */
  const drawn = new Map<string, NonNullable<TrainMemo['prev']>>();
  let rtFresh = false;
  let lineSet: Set<number> | undefined;

  async function poll(nowMs: number): Promise<TrainState[]> {
    const sched = GtfsSchedule.load(path);
    const now = nowMs / 1000;
    lineSet ??= new Set(
      sched.data.lines.flatMap((l, i) => ((spec.lines ? spec.lines.includes(l.id) : !spec.systems || spec.systems.includes(l.system)) ? [i] : [])),
    );
    if (spec.realtime) {
      try {
        await spec.realtime.refresh(nowMs, sched);
      } catch (err) {
        console.warn(`[${spec.id}] realtime: ${err instanceof Error ? err.message : err}`);
      }
    }
    const lineIds = new Set([...lineSet].map((i) => sched.data.lines[i].id));
    const rt = spec.realtime?.trips(nowMs)?.filter((t) => (t.line ? lineIds.has(t.line) : !!t.key));
    rtFresh = !!rt?.length;
    const timetable = sched.active(now, lineSet, 900, 900);
    const { matched, extra } = rt?.length ? match(sched, timetable, rt, spec.match ?? 'both', sticky, (id) => memo.get(id)?.prev?.k, now) : { matched: new Map<string, RtTrip>(), extra: [] };
    const active = extra.length ? [...timetable, ...extra] : timetable;

    // Per line: when realtime accounts for at least half as many trains as the timetable has running, timetable
    // trips without realtime are most likely not running (cancelled, or replaced by the late and added trains).
    const trusted = new Set<string>();
    if (rt?.length && spec.dropUnmatched !== 'never') {
      const count = new Map<string, [number, number]>();
      for (const t of active) {
        const running = t.times[1] <= now + 60 && t.times.at(-1)! >= now;
        const c = count.get(t.line) ?? [0, 0];
        if (running && !t.id.includes(':rt:') && !extra.includes(t)) c[0]++;
        if (matched.has(t.id)) c[1]++;
        count.set(t.line, c);
      }
      for (const [line, [n, m]] of count) if (n && m >= 0.5 * n) trusted.add(line);
    }

    const trains: TrainState[] = [];
    for (const t of active) {
      const j = matched.get(t.id);
      const h = !j ? held.get(t.id) : undefined;
      // Keep a realtime timeline through short feed gaps and to the end of the trip (monitor-style feeds list no
      // departure for the last stop, so a train on its final leg drops out of them).
      const hold = h && now - h.seen < 600 && now <= h.times[h.times.length - 1] + 60 ? h : undefined;
      if (j?.cancelled || (!j && !hold && trusted.has(t.line))) continue;
      let times = t.times;
      let from = 0;
      let live = false;
      let delay: number | undefined;
      if (hold) {
        times = hold.times;
        from = hold.from;
        live = true;
        delay = hold.delay;
      }
      if (j) {
        const fresh = !memo.has(t.id);
        const m = memoFor(memo, t.id, now);
        if (fresh && !m.prev) {
          const d = drawn.get(t.id);
          if (d && now - d.now < 120) m.prev = d;
        }
        const updates = toUpdates(sched, t, j, now, m.prev?.k ?? 0);
        const merged = updates.length ? mergeRealtime(t.st, t.times, updates, m.dep, m.prev?.k) : null;
        if (merged) {
          times = merged.times;
          from = merged.from;
          live = true;
          const next = Math.min(merged.from + 1, t.st.length - 1);
          delay = Math.round(times[2 * next] - t.times[2 * next]);
          held.set(t.id, { times, from, delay, seen: now });
        }
      }
      const pos = { k: 0 };
      const m = live ? memoFor(memo, t.id, now) : undefined;
      const stops = m ? stabilize(m, t.st, times, from, now) : windowTimeline(t.st, times, now, from, 15, 60, pos);
      if (!stops) continue;
      const k = m?.prev?.k ?? pos.k;
      if (!m) drawn.set(t.id, { now, k, d: stops[0].d, next: stops[1]?.a ?? NaN });
      const consist = j?.stock ? { stock: j.stock, cars: j.cars ?? sched.consist(t.row, t.pat.l).cars } : sched.consist(t.row, t.pat.l);
      const train: TrainState = {
        id: t.id,
        line: t.line,
        dest: sched.destAt(t.row, t.pat, k),
        live,
        stops,
        ...consist,
      };
      if (j?.cars && !j.stock) train.cars = j.cars;
      const destLocal = sched.destLocal(t.row);
      if (destLocal) train.destLocal = destLocal;
      const dir = sched.dirAt(t.pat, k);
      if (dir) train.dir = dir;
      const service = sched.str(t.pat.s);
      if (service) train.service = service;
      const serviceLocal = sched.str(t.pat.sl);
      if (serviceLocal) train.serviceLocal = serviceLocal;
      const label = j?.label ?? sched.label(t.row);
      if (label) train.label = label;
      if (delay != null) train.delay = delay;
      trains.push(train);
    }
    for (const [id, m] of memo) if (now - m.seen > 600) memo.delete(id);
    for (const [id, x] of held) if (now - x.seen > 600) held.delete(id);
    for (const [id, x] of drawn) if (now - x.now > 300) drawn.delete(id);
    const shown = new Set(trains.map((t) => t.id));
    for (const [k, id] of sticky) if (!shown.has(id)) sticky.delete(k);
    return trains;
  }

  // Name and live flag follow what the last poll actually used, so a failing feed shows as a timetable.
  return {
    id: spec.id,
    city,
    get name() {
      return rtFresh && spec.realtime ? `${spec.name} · ${spec.realtime.name}` : `${spec.name} · timetable`;
    },
    get live() {
      return rtFresh;
    },
    intervalMs: spec.intervalMs ?? 30_000,
    poll,
  };
}

/** Realtime trip -> per-station predictions the timeline merge understands. */
function toUpdates(sched: GtfsSchedule, t: ActiveTrip, j: RtTrip, now: number, shownAt: number): RtStop[] {
  const names = sched.data.stations;
  const withTimes = j.stops?.filter((s) => !s.skipped && (s.a != null || s.d != null || s.delayA != null || s.delayD != null));
  if (withTimes?.length) {
    let from = 0;
    const out: RtStop[] = [];
    for (const s of withTimes) {
      const u: RtStop = { station: names[s.station], a: s.a, d: s.d };
      if (u.a == null || u.d == null) {
        // Delay-only events: timetable time at this stop plus the delay.
        const i = t.st.indexOf(u.station, from);
        if (i >= 0) {
          from = i;
          if (u.a == null && (s.delayA ?? s.delayD) != null) u.a = t.times[2 * i] + (s.delayA ?? s.delayD)!;
          if (u.d == null && (s.delayD ?? s.delayA) != null) u.d = t.times[2 * i + 1] + (s.delayD ?? s.delayA)!;
        }
      }
      // Stopped at a station with only an arrival predicted: it won't leave before its timetabled departure.
      if (u.d == null && u.a != null && j.at?.status === 'at' && j.at.station === s.station) {
        const i = t.st.indexOf(u.station);
        if (i >= 0) u.d = Math.max(u.a, t.times[2 * i + 1]);
      }
      if (u.a != null || u.d != null) out.push(u);
    }
    return out;
  }
  let delay = j.delay;
  let from = 0;
  if (j.at) {
    const id = names[j.at.station];
    let i = t.st.indexOf(id, Math.max(0, shownAt - 1));
    if (i < 0) i = t.st.indexOf(id);
    if (i >= 0) {
      const a = t.times[2 * i], d = t.times[2 * i + 1];
      if (j.at.status === 'at' || i === 0) delay = now < a ? now - a : now > d ? now - d : 0;
      else {
        const dPrev = t.times[2 * i - 1];
        delay = now < dPrev ? now - dPrev : now > a ? now - a + 20 : 0;
      }
      from = j.at.status === 'at' ? i : Math.max(0, i - 1);
    }
  }
  if (delay == null) return [];
  const out: RtStop[] = [];
  for (let i = from; i < t.st.length; i++) {
    if (t.times[2 * i + 1] + delay < now - 120 && i < t.st.length - 1) continue;
    out.push({ station: t.st[i], a: t.times[2 * i] + delay, d: t.times[2 * i + 1] + delay });
  }
  return out;
}

/** A realtime stop's predicted time (arrival, else departure), or its delay applied to a timetable time. */
function predicted(c: { a?: number; d?: number }): number | undefined {
  return c.a ?? c.d;
}

/**
 * Pair realtime trips with timetable trips: by key first (GTFS trip_id, on the right service date), then by line,
 * station order and times (timetabled times when the feed has them, else predictions). Best pairs first; a realtime
 * trip keeps last poll's timetable trip when it still fits, so trains don't swap places. Keyed trips running far
 * off their timetable are placed on their own row anyway, and trips the timetable doesn't know (added, or too late
 * to match) get a train of their own on the line's best-fitting pattern: both come back in `extra`.
 */
function match(
  sched: GtfsSchedule,
  active: ActiveTrip[],
  rt: RtTrip[],
  how: 'key' | 'time' | 'both',
  sticky: Map<string, string>,
  shownAt: (id: string) => number | undefined,
  now: number,
): { matched: Map<string, RtTrip>; extra: ActiveTrip[] } {
  const out = new Map<string, RtTrip>();
  const extra: ActiveTrip[] = [];
  const taken = new Set<RtTrip>();
  const today = sched.clock.ymd(now);
  const yesterday = (() => {
    const d = new Date(Date.UTC(Math.floor(today / 10000), (Math.floor(today / 100) % 100) - 1, (today % 100) - 1));
    return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  })();
  const names = sched.data.stations;
  const firstPrediction = (j: RtTrip, t: ActiveTrip): { i: number; time: number } | undefined => {
    let from = 0;
    for (const c of j.stops ?? []) {
      const i = t.st.indexOf(names[c.station], from);
      if (i < 0) continue;
      from = i;
      const p = predicted(c);
      if (p != null) return { i, time: p };
      if (c.delayA != null || c.delayD != null) return { i, time: t.times[2 * i] + (c.delayA ?? c.delayD)! };
    }
    return undefined;
  };
  const upcoming = (j: RtTrip, t: ActiveTrip) => {
    const last = j.stops?.reduce((m, c) => Math.max(m, predicted(c) ?? 0), 0) || 0;
    return last >= now - 300 || t.times.at(-1)! >= now - 300 || !!j.at;
  };

  if (how !== 'time' && sched.hasKeys) {
    const byRow = new Map<number, ActiveTrip[]>();
    for (const t of active) (byRow.get(t.row) ?? byRow.set(t.row, []).get(t.row)!).push(t);
    for (const j of rt) {
      if (!j.key) continue;
      if (j.date && j.date !== today && j.date !== yesterday) {
        taken.add(j); // another day's run of the trip
        continue;
      }
      const rows = sched.rowsOfKey(j.key);
      if (!rows.length) continue;
      const cands = rows.flatMap((r) => byRow.get(r) ?? []).filter((c) => !j.date || c.date === j.date);
      // The same trip can run on yesterday's and today's service day: take the one whose times fit the feed.
      const pick = (list: ActiveTrip[]) =>
        list.reduce((b, c) => {
          const pb = firstPrediction(j, b), pc = firstPrediction(j, c);
          const db = pb ? Math.abs(pb.time - b.times[2 * pb.i]) : Infinity, dc = pc ? Math.abs(pc.time - c.times[2 * pc.i]) : Infinity;
          return dc < db ? c : b;
        });
      let t = cands.length ? pick(cands) : undefined;
      if (!t && !j.cancelled) {
        // Running far off its timetable (outside the active window): place the row itself on its service date.
        const dates = j.date ? [j.date] : [yesterday, today];
        const runs = dates.flatMap((d) => rows.filter((r) => sched.runsOn(r, d)).map((r) => sched.trip(r, d)));
        const late = pick(runs.length ? runs : dates.map((d) => sched.trip(rows[0], d)));
        if (upcoming(j, late) && firstPrediction(j, late)) {
          t = late;
          extra.push(t);
        }
      }
      if (!t) continue;
      const prev = out.get(t.id);
      if (prev) {
        // Two realtime trips on one row: trips joined into a block (chainBlocks). Merge their stops in pattern order.
        const at = (c: { station: number }) => t!.st.indexOf(names[c.station]);
        out.set(t.id, { ...prev, stops: [...(prev.stops ?? []), ...(j.stops ?? [])].sort((x, y) => at(x) - at(y)), at: prev.at ?? j.at, label: prev.label ?? j.label });
      } else out.set(t.id, j);
      taken.add(j);
    }
  }
  if (how === 'key') return { matched: out, extra };
  const pairs: { t: ActiveTrip; j: RtTrip; score: number }[] = [];
  for (const j of rt) {
    // In a feed keyed like the timetable, a trip whose key isn't ours (added, or another day's) is not one of ours.
    if (taken.has(j) || !j.line || (how === 'both' && sched.hasKeys && j.key)) continue;
    const calls = j.stops?.filter((s) => !s.skipped) ?? (j.at ? [{ station: j.at.station } as NonNullable<RtTrip['stops']>[number]] : []);
    if (!calls.length) continue;
    const skey = j.key ?? j.label;
    for (const t of active) {
      if (t.line !== j.line || out.has(t.id)) continue;
      let from = 0, matched = 0, aimed = true, first = -1;
      const diffs: number[] = [];
      for (const c of calls) {
        const i = t.st.indexOf(names[c.station], from);
        if (i < 0) continue;
        from = i + 1;
        matched++;
        if (first < 0) first = i;
        const ref = c.aimedA ?? c.aimedD;
        if (ref != null) diffs.push(Math.abs(ref - (c.aimedA != null ? t.times[2 * i] : t.times[2 * i + 1])));
        else {
          aimed = false;
          const exp = predicted(c);
          if (exp != null) diffs.push(Math.abs(exp - (c.a != null ? t.times[2 * i] : t.times[2 * i + 1])));
          // Position only: the train is at (or heading for) this station now.
          else if (j.at && j.at.station === c.station) diffs.push(Math.abs(now - t.times[2 * i]));
        }
        if (calls.length === 1 && i === 0 && !j.at) matched = 0;
      }
      // Delay-only calls can't tell one run of a line from the next without a key.
      if (matched < Math.min(2, calls.length) || !diffs.length) continue;
      let score = diffs.sort((a, b) => a - b)[diffs.length >> 1];
      if (score > (aimed ? MATCH_AIMED : MATCH_EXPECTED)) continue;
      // A train shown at stop k last poll can't be behind it now, and is unlikely to be far ahead.
      const k = shownAt(t.id);
      if (k != null) score += first < k ? 600 : 60 * Math.max(0, first - k - 2);
      pairs.push({ t, j, score: score - (skey && sticky.get(skey) === t.id ? 900 : 0) });
    }
  }
  pairs.sort((a, b) => a.score - b.score);
  for (const p of pairs) {
    if (out.has(p.t.id) || taken.has(p.j)) continue;
    out.set(p.t.id, p.j);
    taken.add(p.j);
    const skey = p.j.key ?? p.j.label;
    if (skey) sticky.set(skey, p.t.id);
  }

  // Whatever is left with at least two predicted stops (or a position and one prediction) becomes its own train.
  for (const j of rt) {
    if (taken.has(j) || j.cancelled || !j.line) continue;
    const t = synthesize(sched, j, today, now);
    if (!t || out.has(t.id)) continue;
    out.set(t.id, j);
    extra.push(t);
  }
  return { matched: out, extra };
}

/** A train for a realtime trip the timetable doesn't have: the line's pattern that best fits its predicted stops. */
function synthesize(sched: GtfsSchedule, j: RtTrip, today: number, now: number): ActiveTrip | undefined {
  const names = sched.data.stations;
  const calls = (j.stops ?? []).filter((c) => !c.skipped && predicted(c) != null);
  if (calls.length < (j.at ? 1 : 2)) return undefined;
  if (Math.max(...calls.map((c) => predicted(c)!)) < now - 60) return undefined;
  const line = sched.lineIndex.get(j.line!);
  if (line == null) return undefined;
  let best: { pat: number; row: number; idx: number[]; score: number } | undefined;
  for (const p of sched.patterns(line)) {
    const st = sched.patStations[p.pat];
    const idx: number[] = [];
    let from = 0;
    for (const c of calls) {
      const i = st.indexOf(names[c.station], from);
      if (i < 0) break;
      idx.push(i);
      from = i + 1;
    }
    if (idx.length < calls.length) continue;
    // Prefer patterns that end where the predictions end, then the most common one.
    const score = (idx.at(-1) === st.length - 1 ? 0 : 1e6) - p.trips;
    if (!best || score < best.score) best = { pat: p.pat, row: p.row, idx, score };
  }
  if (!best) return undefined;
  const base = sched.trip(best.row, today);
  const i0 = best.idx[0];
  const shift = predicted(calls[0])! - (calls[0].a != null ? base.times[2 * i0] : base.times[2 * i0 + 1]);
  const key = j.key ?? j.label ?? `${best.pat}:${Math.round((base.times[0] + shift) / 300)}`;
  return { ...base, id: `${base.line}:rt:${key}`, date: j.date ?? today, times: base.times.map((x) => x + shift) };
}

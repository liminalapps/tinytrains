// Paris Métro, RER and Tramway: IDFM timetable simulation, upgraded with PRIM realtime predictions when PRIM_KEY is set.
import type { TrainState } from '../../../shared/types.ts';
import type { Adapter, AdapterFactory } from '../types.ts';
import { consist } from './fleet.ts';
import { PrimClient, type RtJourney } from './prim.ts';
import { Schedule, memoFor, mergeRealtime, stabilize, windowTimeline, type ActiveTrip, type RtStop, type TrainMemo } from './schedule.ts';

let shared: Schedule | undefined;
const schedule = () => (shared ??= Schedule.load());
const clients = new Map<string, PrimClient>();
/** One PRIM client per key, shared by both adapters. */
const primClient = (key: string) => clients.get(key) ?? clients.set(key, new PrimClient(key, schedule())).get(key)!;

/** How far realtime and timetable may disagree and still be the same train, seconds. */
const MATCH_AIMED = 420;
const MATCH_EXPECTED = 900;

/**
 * Pair realtime journeys with timetable trips of the same line: the stations must come in the trip's order and the
 * times must agree (timetabled times when the feed has them, else predictions). Best pairs are taken first, and a
 * journey keeps last poll's trip when it still fits, so trains don't swap places between polls.
 */
function matchJourneys(sched: Schedule, trips: ActiveTrip[], journeys: RtJourney[], sticky: Map<string, string>): Map<string, RtJourney> {
  const pairs: { t: ActiveTrip; j: RtJourney; score: number }[] = [];
  const names = sched.data.stations;
  for (const j of journeys) {
    if (!j.calls.length) continue;
    for (const t of trips) {
      if (t.pat.l !== j.line) continue;
      const label = sched.label(t.row);
      if (j.note && label && /^[A-Z]{4}$/.test(j.note) && j.note !== label) continue;
      let from = 0, matched = 0, aimed = true;
      const diffs: number[] = [];
      for (const c of j.calls) {
        const i = t.st.indexOf(names[c.station], from);
        if (i < 0) continue;
        from = i + 1;
        matched++;
        const ref = c.aa ?? c.ad;
        if (ref != null) diffs.push(Math.abs(ref - (c.aa != null ? t.times[2 * i] : t.times[2 * i + 1])));
        else {
          const exp = c.ea ?? c.ed;
          if (exp != null) diffs.push(Math.abs(exp - (c.ea != null ? t.times[2 * i] : t.times[2 * i + 1])));
          aimed = false;
        }
        if (j.calls.length === 1 && i === 0) matched = 0; // a lone call must be somewhere the trip travels to
      }
      if (matched < Math.min(2, j.calls.length) || !diffs.length) continue;
      diffs.sort((a, b) => a - b);
      const score = diffs[diffs.length >> 1];
      if (score > (aimed ? MATCH_AIMED : MATCH_EXPECTED)) continue;
      pairs.push({ t, j, score: score - (j.note && j.note === label ? 120 : 0) - (j.ref && sticky.get(j.ref) === t.id ? 900 : 0) });
    }
  }
  pairs.sort((a, b) => a.score - b.score);
  const out = new Map<string, RtJourney>();
  const taken = new Set<RtJourney>();
  for (const p of pairs) {
    if (out.has(p.t.id) || taken.has(p.j)) continue;
    out.set(p.t.id, p.j);
    taken.add(p.j);
    if (p.j.ref) sticky.set(p.j.ref, p.t.id);
  }
  return out;
}

function parisAdapter(o: { id: string; name: string; lines: string[]; key?: string }): Adapter {
  const memo = new Map<string, TrainMemo>();
  const sticky = new Map<string, string>(); // realtime journey ref -> trip id
  let rtLines = 0; // lines that had fresh realtime data at the last poll

  async function poll(nowMs: number): Promise<TrainState[]> {
    const sched = schedule();
    const now = nowMs / 1000;
    const lineIdx = o.lines.map((l) => sched.lineIndex.get(l)!);
    const prim = o.key ? primClient(o.key) : undefined;
    if (prim) await prim.refresh(nowMs, lineIdx);
    const active = sched.active(now, new Set(lineIdx), 900, 900);
    const names = sched.data.stations;
    const trains: TrainState[] = [];
    rtLines = 0;
    for (const l of lineIdx) {
      const journeys = prim?.journeys(l, nowMs);
      if (journeys) rtLines++;
      const trips = active.filter((t) => t.pat.l === l);
      const matched = journeys ? matchJourneys(sched, trips, journeys, sticky) : new Map<string, RtJourney>();
      // With good realtime coverage, timetable trips the feed doesn't know about are most likely not running.
      const running = trips.filter((t) => t.times[1] <= now + 60 && t.times[t.times.length - 1] >= now);
      const trusted = !!journeys && running.length > 0 && running.filter((t) => matched.has(t.id)).length >= 0.5 * running.length;
      for (const t of trips) {
        const j = matched.get(t.id);
        if (j?.cancelled || (!j && trusted)) continue;
        let times = t.times;
        let from = 0;
        let live = false;
        let delay: number | undefined;
        if (j) {
          const updates: RtStop[] = j.calls.filter((c) => !c.x).map((c) => ({ station: names[c.station], a: c.ea, d: c.ed }));
          const m = memoFor(memo, t.id, now);
          const merged = updates.some((u) => u.a != null || u.d != null) ? mergeRealtime(t.st, t.times, updates, m.dep, m.prev?.k) : null;
          if (merged) {
            times = merged.times;
            from = merged.from;
            live = true;
            const next = Math.min(merged.from + 1, t.st.length - 1);
            delay = Math.round(times[2 * next] - t.times[2 * next]);
          }
        }
        const stops = live ? stabilize(memo.get(t.id)!, t.st, times, from, now) : windowTimeline(t.st, times, now, from);
        if (!stops) continue;
        const line = sched.data.lines[l].id;
        const label = sched.label(t.row);
        trains.push({
          id: t.id,
          line,
          dest: sched.head(t.row),
          dir: t.pat.c,
          service: t.pat.x == null ? undefined : t.pat.x ? 'Semi-direct' : 'Omnibus',
          label: label || undefined,
          live,
          delay,
          stops,
          ...consist(line, t.row),
        });
      }
    }
    for (const [id, m] of memo) if (now - m.seen > 600) memo.delete(id);
    const shown = new Set(trains.map((t) => t.id));
    for (const [ref, id] of sticky) if (!shown.has(id)) sticky.delete(ref);
    return trains;
  }

  // Name and live flag follow what the last poll actually used, so a failing or missing key shows as a timetable.
  return {
    id: o.id,
    city: 'paris',
    get name() {
      return rtLines ? `${o.name} · IDFM PRIM realtime` : `${o.name} · IDFM timetable`;
    },
    get live() {
      return rtLines > 0;
    },
    intervalMs: 30_000,
    poll,
  };
}

const METRO_LINES = ['m1', 'm2', 'm3', 'm3b', 'm4', 'm5', 'm6', 'm7', 'm7b', 'm8', 'm9', 'm10', 'm11', 'm12', 'm13', 'm14'];
const RER_LINES = ['rer-a', 'rer-b', 'rer-c', 'rer-d', 'rer-e'];
const TRAM_LINES = ['t1', 't2', 't3a', 't3b', 't4', 't5', 't6', 't7', 't8', 't9', 't10', 't11', 't12', 't13'];

export const createAdapters: AdapterFactory = (env) => [
  parisAdapter({ id: 'paris-metro', name: 'Métro', lines: METRO_LINES, key: env.PRIM_KEY }),
  parisAdapter({ id: 'paris-rer', name: 'RER', lines: RER_LINES, key: env.PRIM_KEY }),
  parisAdapter({ id: 'paris-tram', name: 'Tramway', lines: TRAM_LINES, key: env.PRIM_KEY }),
];

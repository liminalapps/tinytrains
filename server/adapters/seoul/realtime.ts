import type { TimelineStop, TrainState } from '../../../shared/types.ts';
import { parseKst } from './calendar.ts';
import { LINE_BY_ID, TERMINAL_ALIAS, chooseStock, nameKeys, normName } from './lines.ts';
import { network, runKey, shortCars, type NetLine, type NetVariant } from './network.ts';
import { MAX_STOPS } from './sim.ts';

/** One row of the Seoul OpenAPI realtimePosition feed (all values are strings). */
export interface PositionRow {
  subwayId?: string;
  subwayNm?: string;
  statnId?: string;
  statnNm?: string; // station the status refers to
  trainNo?: string;
  recptnDt?: string; // KST time the status was recorded
  updnLine?: string; // 0 up / inner circle, 1 down / outer circle
  statnTid?: string;
  statnTnm?: string; // terminal
  trainSttus?: string; // 0 approaching, 1 arrived, 2 departed, 3 departed the previous station
  directAt?: string; // 1 express, 7 special express
  lstcarAt?: string; // 1 last train of the day
}

interface PlanStop {
  s: number; // station index
  a: number; // nominal times, before the delta shift
  d: number;
  stop: boolean;
}

interface Track {
  planKey: string;
  plan: PlanStop[];
  delta: number;
  state: string;
  stateObs: number; // when the current state was first reported
  pos: number; // progress along the plan, for ignoring stale rows
  seen: number;
  last?: TimelineStop[]; // the timeline sent last time, kept continuous with the next one
  term: string; // normalized terminal shown as the destination
  at: number; // station of the latest report
  came?: number; // the station reported before that one
}

// Offsets between the feed's status events and the train standing at / leaving the platform, seconds.
// Arrivals are logged before the train stops and departures after it has pulled out (the feed shows ~40 s runs
// between stations 1 km apart), so the platform stop is inside the logged interval.
const APPROACH_LEAD = 30;
const ARRIVE_LAG = 15;
const DEPART_LEAD = 15;

export interface TrackResult {
  trains: TrainState[];
  unknownStations: Set<string>;
  unroutable: number;
}

export class SeoulTracker {
  private tracks = new Map<string, Track>();
  private keys?: string[]; // station index -> normalized name

  constructor(readonly line: string) {}

  update(rows: PositionRow[], nowSec: number): TrackResult {
    const net = network();
    const L = net.lines[this.line];
    const trains: TrainState[] = [];
    const unknownStations = new Set<string>();
    let unroutable = 0;
    for (const row of rows) {
      const s = nameKeys(row.statnNm ?? '')
        .map((k) => L.index[k])
        .find((i) => i !== undefined);
      if (s === undefined) {
        unknownStations.add(row.statnNm ?? '');
        continue;
      }
      try {
        const t = this.one(row, L, s, nowSec);
        if (t === null) unroutable++;
        else if (t) trains.push(t);
      } catch (err) {
        console.warn(`[seoul ${this.line}] skipped ${row.trainNo}: ${err instanceof Error ? err.message : err}`);
      }
    }
    // Lines can go 20 minutes between requests when the key's daily budget is tight.
    for (const [id, tr] of this.tracks) if (nowSec - tr.seen > 1800) this.tracks.delete(id);
    return { trains, unknownStations, unroutable };
  }

  private keyOf(L: NetLine, v: number | string): string {
    if (typeof v === 'string') return v.slice(1);
    if (!this.keys) {
      this.keys = [];
      for (const [name, i] of Object.entries(L.index)) this.keys[i] ??= name;
    }
    return this.keys[v] ?? '';
  }

  /**
   * The OSM stopping sequence the train follows from `s`: the one reaching the terminal soonest in the feed's
   * direction. Where the feed's terminal is known to flip (trustUd), a sequence in its direction is enough.
   */
  private route(L: NetLine, s: number, term: string, ud: number, came?: number, late = false): Route | null {
    const find = (ok: (v: NetVariant) => boolean, anyEnd: boolean) => {
      let best: Route | null = null;
      for (const v of L.variants) {
        if (!ok(v) || (v.loop && v.ud !== ud)) continue;
        const seq = v.loop ? [...v.seq, ...v.seq.slice(1)] : v.seq;
        let mine: Route | null = null;
        for (let i = 0; i < seq.length; i++) {
          if (seq[i] !== s || (v.loop && i >= v.seq.length - 1)) continue;
          let j = this.keyOf(L, seq[i]) === term ? i : -1;
          for (let k = i + 1; j < 0 && k < seq.length; k++) if (this.keyOf(L, seq[k]) === term) j = k;
          // Loop trains without a terminal of their own keep going around.
          if (j < 0 && (anyEnd || (v.loop && (!term || term === '내선' || term === '외선')))) j = v.loop ? Math.min(seq.length - 1, i + MAX_STOPS + 2) : seq.length - 1;
          if (j < 0) continue;
          // Prefer arriving from the station the train came from, and heading back there only as a last resort
          // (a turn at a terminal). Within one sequence, a train first seen at a loop junction (Eungam) starts the
          // loop, unless the feed marks the station as where the loop ends ('응암(하선-종착)').
          const score = [
            came !== undefined && seq[i + 1] === came ? 1 : 0,
            came === undefined || seq[i - 1] === came ? 0 : 1,
            anyEnd ? i - j : j - i,
          ];
          const r: Route = { seq, i, j, loop: !!v.loop, score };
          if (!mine || (came === undefined ? late : lexLess(score, mine.score))) mine = r;
        }
        if (mine && (!best || lexLess(mine.score, best.score))) best = mine;
      }
      return best;
    };
    return (
      find((v) => v.ud === undefined || v.ud === ud, false) ??
      (LINE_BY_ID.get(this.line)!.trustUd ? find((v) => v.ud === ud, true) : null) ??
      find(() => true, false)
    );
  }

  private one(row: PositionRow, L: NetLine, s: number, nowSec: number): TrainState | undefined | null {
    const conf = LINE_BY_ID.get(this.line)!;
    const no = row.trainNo?.trim();
    if (!no) return undefined;
    const term = normName(row.statnTnm ?? '');
    const ud = row.updnLine === '1' ? 1 : 0;
    const status = row.trainSttus ?? '1';
    const express = row.directAt === '1' || row.directAt === '7';
    const id = `${this.line}.${no}`;
    let obs = parseKst(row.recptnDt);
    if (!Number.isFinite(obs) || obs > nowSec + 60 || obs < nowSec - 1800) obs = nowSec;
    obs = Math.min(obs, nowSec);

    // The terminal is not part of the key: the feed sometimes flips it for a poll. A train that really changes
    // course leaves its plan and is routed again.
    const planKey = `${ud}|${express ? 1 : 0}`;
    let tr = this.tracks.get(id);
    let idx = tr && tr.planKey === planKey ? locate(tr.plan, s, tr.pos) : -1;
    if (!tr || idx < 0) {
      const came = tr ? (tr.at !== s ? tr.at : tr.came) : undefined;
      const late = /종착/.test(row.statnNm ?? '');
      const r = this.route(L, s, term, ud, came, late) ?? (TERMINAL_ALIAS[term] ? this.route(L, s, TERMINAL_ALIAS[term], ud, came, late) : null);
      if (!r) return null;
      // Start at the previous station; express trains start at the previous express stop.
      let start = r.i > 0 && typeof r.seq[r.i - 1] === 'number' ? r.i - 1 : r.i;
      const exp = express ? (L.express?.[term] ?? L.express?.['*']) : undefined;
      const ex = exp ? new Set(exp.stops) : null;
      const cover = new Set(exp?.cover);
      const passes = (st: number | string) => !!ex && typeof st === 'number' && !ex.has(st) && cover.has(st);
      while (start > 0 && passes(r.seq[start]) && typeof r.seq[start - 1] === 'number') start--;
      const stations: number[] = [];
      for (let k = start; k <= r.j && typeof r.seq[k] === 'number'; k++) stations.push(r.seq[k] as number);
      const plan = this.plan(L, stations, exp, stations.length < r.j - start + 1);
      idx = r.i - start;
      // When the route could not follow the feed's terminal, show where the route actually goes.
      const reached = this.keyOf(L, r.seq[r.j]);
      const shown = reached === term || !r.loop ? reached : ud ? '외선순환' : '내선순환';
      tr = { planKey, plan, delta: 0, state: '', stateObs: obs, pos: -Infinity, seen: nowSec, last: tr?.last, term: shown, at: s, came };
      this.tracks.set(id, tr);
    } else if (term !== tr.term && tr.plan.slice(idx).some((p) => this.keyOf(L, p.s) === term)) {
      tr.term = term;
    }
    const P = tr.plan;
    const pos = status === '0' ? idx - 0.3 : status === '3' ? idx - 0.6 : status === '2' ? idx + 0.3 : idx;
    tr.seen = nowSec;
    const state = `${s}|${status}`;
    if (pos < tr.pos - 0.01) return this.emit(row, conf.id, id, tr, nowSec); // stale or jittery row: keep the timeline
    if (s !== tr.at) (tr.came = tr.at), (tr.at = s);
    if (state !== tr.state) {
      tr.stateObs = tr.state ? Math.max(obs, Math.min(tr.stateObs, nowSec)) : obs;
      tr.state = state;
    }
    tr.pos = pos;

    // Entering or leaving the map: nothing to draw until the train is at an inside station.
    const first = idx === 0 && (status === '0' || status === '3');
    const leaving = idx === P.length - 1 && status === '2';
    if (first || leaving) {
      this.tracks.delete(id);
      return undefined;
    }

    const t0 = tr.stateObs;
    const run = (i: number) => Math.max(20, P[i].a - P[i - 1].d);
    let est: number, lo: number, hi: number;
    if (status === '0' || status === '3') {
      est = status === '0' ? t0 + APPROACH_LEAD - P[idx].a : t0 - P[idx - 1].d;
      lo = nowSec + 3 - P[idx].a;
      hi = status === '0' ? nowSec + Math.max(10, 0.5 * run(idx)) - P[idx].a : nowSec - P[idx - 1].d;
    } else if (status === '2' && idx + 1 < P.length) {
      // Departed: somewhere before the next stop (express trains may not report the stations they pass).
      let next = idx + 1;
      while (next + 1 < P.length && !P[next].stop) next++;
      est = t0 - DEPART_LEAD - P[idx].d;
      lo = nowSec + 3 - P[next].a;
      hi = nowSec - P[idx].d;
    } else {
      est = t0 + ARRIVE_LAG - P[idx].a;
      lo = nowSec + 8 - P[idx].d;
      hi = nowSec - P[idx].a;
    }
    if (hi < lo) hi = lo;
    const next = Math.min(hi, Math.max(lo, est));
    // Small corrections are not worth a visible jump.
    tr.delta = Number.isFinite(tr.delta) && Math.abs(next - tr.delta) < 4 && tr.delta >= lo && tr.delta <= hi ? tr.delta : next;
    return this.emit(row, conf.id, id, tr, nowSec, idx, status);
  }

  private emit(row: PositionRow, line: string, id: string, tr: Track, nowSec: number, idx?: number, status?: string): TrainState | undefined {
    const net = network();
    const P = tr.plan;
    // Listed stops (express trains leave out the stations they pass) with shifted times.
    const full: Timed[] = [];
    for (let j = 0; j < P.length; j++) {
      if (!P[j].stop && j !== P.length - 1) continue;
      const prev = full[full.length - 1];
      const a = Math.max(P[j].a + tr.delta, prev ? prev.d : -Infinity);
      full.push({ i: j, a, d: Math.max(a, P[j].d + tr.delta) });
    }
    if (!full.length) return undefined;
    // Most recent stop at or before the train.
    let k = 0;
    const at = idx === undefined ? -1 : status === '0' || status === '3' ? idx - 1 : idx;
    for (let f = 0; f < full.length; f++) if (idx === undefined ? full[f].a <= nowSec : full[f].i <= at) k = f;
    k = this.continuous(full, k, tr, nowSec);
    const stops: TimelineStop[] = full.slice(k, k + MAX_STOPS).map((e) => ({ s: net.stations[P[e.i].s], a: Math.round(e.a), d: Math.round(e.d) }));
    for (let j = 1; j < stops.length; j++) {
      stops[j].a = Math.max(stops[j].a, stops[j - 1].d);
      stops[j].d = Math.max(stops[j].d, stops[j].a);
    }
    if (stops.length === 1) stops[0].d = Math.max(stops[0].d, Math.ceil(nowSec) + 15);
    tr.last = stops;
    const term = tr.term;
    const [dest, destLocal] = net.names[term] ?? net.names[TERMINAL_ALIAS[term] ?? ''] ?? [row.statnTnm ?? '', row.statnTnm ?? ''];
    const loopLine = net.lines[line].variants.some((v) => v.loop);
    const ud = row.updnLine === '1' ? 1 : 0;
    const { stock, cars } = chooseStock(line, id, { express: row.directAt === '1' });
    const short = shortCars(net.lines[line], P.map((ps) => ps.s));
    const exp = row.directAt === '1' ? ['Express', '급행'] : row.directAt === '7' ? ['Special Express', '특급'] : undefined;
    return {
      id,
      line,
      dest,
      destLocal,
      service: exp?.[0],
      serviceLocal: exp?.[1],
      dir: !loopLine ? (ud ? 'Down line' : 'Up line') : short ? undefined : ud ? 'Outer Circle' : 'Inner Circle',
      stock,
      cars: short ?? cars,
      live: true,
      label: row.lstcarAt === '1' ? `${row.trainNo} · last train` : row.trainNo,
      stops,
    };
  }

  /**
   * Keep the train where the previous timeline shows it now, and let it catch up with the new estimate over the
   * next hops at no more than twice the nominal speed (it never jumps or runs backwards). Returns the first stop.
   */
  private continuous(full: Timed[], k: number, tr: Track, nowSec: number): number {
    const old = tr.last && whereAt(tr.last, nowSec);
    if (!old) return k;
    const net = network();
    const P = tr.plan;
    let x = -1;
    for (let f = 0; f < full.length; f++) if (net.stations[P[full[f].i].s] === old.s && (x < 0 || Math.abs(f - k) < Math.abs(x - k))) x = f;
    if (x < 0 || Math.abs(x - k) > 3) return k;
    const nominal = (f: number) => Math.max(20, P[full[f + 1].i].a - P[full[f].i].d);
    const X = full[x], Y = full[x + 1];
    let from = x + 1;
    if (old.f === null) {
      X.a = Math.min(X.a, nowSec);
      X.d = Math.max(X.d, nowSec);
    } else if (Y) {
      const f = Math.min(0.999, old.f);
      Y.a = Math.max(Y.a, nowSec + (1 - f) * 0.5 * nominal(x));
      Y.d = Math.max(Y.d, Y.a);
      X.d = Math.min(nowSec, (nowSec - f * Y.a) / (1 - f));
      X.a = Math.min(X.a, X.d);
      from = x + 2;
    }
    for (let f = from; f < full.length; f++) {
      full[f].a = Math.max(full[f].a, full[f - 1].d + 0.5 * nominal(f - 1));
      full[f].d = Math.max(full[f].d, full[f].a);
    }
    return x;
  }

  /** Nominal times along a route: run times between stations, dwell at stops, none where express trains pass. */
  private plan(L: NetLine, stations: number[], express: { stops: number[]; cover: number[] } | undefined, exits: boolean): PlanStop[] {
    const conf = LINE_BY_ID.get(this.line)!;
    const expressSet = express ? new Set(express.stops) : null;
    const cover = new Set(express?.cover);
    const out: PlanStop[] = [];
    const halts: boolean[] = [];
    stations.forEach((s, i) => {
      const last = i === stations.length - 1;
      // Express trains pass most stations; with `nonstop` (AREX) even the listed ones are only timing points.
      // Where no express pattern is known they are treated as stopping everywhere.
      const known = !!expressSet && cover.has(s);
      const listed = !known || i === 0 || last || expressSet.has(s);
      const halt = !known || i === 0 || (expressSet.has(s) && !L.nonstop) || (last && !L.nonstop);
      let a = 0;
      if (i > 0) {
        let run = L.run[runKey(stations[i - 1], s)] ?? 90;
        if (!halts[i - 1]) run -= 10;
        if (!halt) run -= 10;
        a = out[i - 1].d + Math.max(20, run);
      }
      // A terminal holds the train until the feed says otherwise; at the edge of the map it stops as usual.
      const dwell = !halt ? 0 : last && !exits ? 60 : conf.dwell;
      halts.push(halt);
      out.push({ s, a, d: a + dwell, stop: listed });
    });
    return out;
  }
}

const lexLess = (a: number[], b: number[]) => {
  for (let n = 0; n < a.length; n++) if (a[n] !== b[n]) return a[n] < b[n];
  return false;
};

interface Route {
  seq: (number | string)[];
  i: number; // index of the train's station
  j: number; // index of the terminal (or where the route ends)
  loop: boolean;
  score: number[]; // lower is better, compared in order
}

interface Timed {
  i: number; // plan index
  a: number;
  d: number;
}

/** Where a timeline puts the train at `t`: standing at a station (f null) or a fraction of the way to the next. */
function whereAt(stops: TimelineStop[], t: number): { s: string; f: number | null } {
  if (t <= stops[0].d) return { s: stops[0].s, f: null };
  for (let i = 0; i + 1 < stops.length; i++) {
    if (t < stops[i + 1].a) return { s: stops[i].s, f: (t - stops[i].d) / Math.max(1, stops[i + 1].a - stops[i].d) };
    if (t <= stops[i + 1].d) return { s: stops[i + 1].s, f: null };
  }
  return { s: stops[stops.length - 1].s, f: null };
}

/** Plan index of station `s`, preferring the first at or after the previous position. */
function locate(plan: PlanStop[], s: number, prevPos: number): number {
  let best = -1;
  for (let i = 0; i < plan.length; i++) {
    if (plan[i].s !== s) continue;
    if (i >= Math.floor(prevPos)) return i;
    best = i;
  }
  return best;
}

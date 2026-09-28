import type { TimelineStop, TrainState } from '../../../shared/types.ts';
import type { Adapter, AdapterFactory } from '../types.ts';
import { LINES, type HkLine } from './lines.ts';
import { Network, type Dir, type Pattern } from './network.ts';

// MTR Next Train boards (one request per line and station, next 4 trains each way) are joined up into
// trains: consecutive polled stations see the same train a run time apart, in the same order.

const API = 'https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php';
const UA = 'TinyTrains/0.1 (live transit diorama)';
/** Politeness: never more than this many requests in any 60 s window. */
const MAX_PER_MIN = 60;
/** Boards are refreshed oldest first, spread so that all of them come round about once in this many seconds. */
const CYCLE_S = 50;
/** A board is due for a refresh at this age (s), and ignored past MAX_AGE. */
const REFRESH_S = 40;
const MAX_AGE_S = 150;
const CONCURRENCY = 10;
const ORIGIN_DWELL = 60;
const TERMINAL_DWELL = 45;
/** Shortest turnaround at a terminus (DRL reverses in about 35 s). */
const TURNAROUND = 35;
/** Two timelines of the same line and destination within this many model seconds of each other are one train. */
const SAME_TRAIN_S = 100;

interface Pred {
  sta: string;
  t: number; // expected arrival, or departure when `dep`, epoch s
  dep: boolean;
  dest: string;
  via?: string;
  ttnt: number;
  asOf: number; // board snapshot time, epoch s
}

interface Board {
  fetchedAt: number; // epoch s, local clock
  asOf: number; // snapshot time the API reports
  UP: Pred[];
  DOWN: Pred[];
}

interface ApiRow {
  dest?: string;
  time?: string;
  ttnt?: string;
  valid?: string;
  route?: string;
  timeType?: string;
}
interface ApiResponse {
  status?: number;
  data?: Record<string, { curr_time?: string; UP?: ApiRow[]; DOWN?: ApiRow[] }>;
}

class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

/** "2026-09-25 06:05:07" in Hong Kong time (UTC+8, no DST) to epoch seconds. */
function hkTime(s: string | undefined): number {
  const m = s?.match(/^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)$/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 8, +m[5], +m[6]) / 1000 : NaN;
}

async function fetchBoard(line: string, sta: string): Promise<Board> {
  const fetchedAt = Date.now() / 1000;
  const res = await fetch(`${API}?line=${line}&sta=${sta}`, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new HttpError(res.status);
  const body = (await res.json()) as ApiResponse;
  // status 0: special service arrangements or a suspended station, with no train data.
  const entry = body.status === 1 ? body.data?.[`${line}-${sta}`] : undefined;
  const asOf = Math.min(fetchedAt, hkTime(entry?.curr_time) || fetchedAt);
  const rows = (dir: Dir): Pred[] =>
    (entry?.[dir] ?? [])
      .filter((r) => r.valid !== 'N' && r.dest)
      .map((r) => ({
        sta,
        t: hkTime(r.time),
        dep: r.timeType === 'D',
        dest: r.dest!,
        via: r.route || undefined,
        ttnt: Number(r.ttnt ?? 0),
        asOf,
      }))
      .filter((p) => Number.isFinite(p.t))
      .sort((a, b) => a.t - b.t);
  return { fetchedAt, asOf, UP: rows('UP'), DOWN: rows('DOWN') };
}

// ---------------------------------------------------------------------------
// Rolling stock
// ---------------------------------------------------------------------------

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  // Ids differ only in a trailing counter: mix the bits (murmur3 finalizer) so shares come out even.
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
}

/**
 * Fleet mixes where a line runs more than one type: [stock, cars, share]. September 2026: Q-Trains on Kwun Tong
 * (no M-Trains left there since 2024), Island (only the 28 SACEM-fitted Q-Trains can run on Kwun Tong and Island)
 * and Tsuen Wan (from March 2026); 22 C-Trains on Kwun Tong; 13 K-Trains plus a few M-Trains on Tseung Kwan O;
 * 12 A-Trains and 4 K-Trains on Tung Chung; 48 SP1900s and 17 C-Trains on Tuen Ma.
 */
const MIX: Record<string, [string, number, number][]> = {
  ISL: [['hongkong-m-train', 8, 0.6], ['hongkong-q-train', 8, 0.4]],
  TWL: [['hongkong-m-train', 8, 0.55], ['hongkong-q-train', 8, 0.45]],
  KTL: [['hongkong-c-train', 8, 0.6], ['hongkong-q-train', 8, 0.4]],
  TKL: [['hongkong-k-train', 8, 0.7], ['hongkong-m-train', 8, 0.3]],
  TCL: [['hongkong-tcl-a-train', 8, 0.75], ['hongkong-tcl-k-train', 8, 0.25]],
  TML: [['hongkong-sp1900', 8, 0.74], ['hongkong-tml-c-train', 8, 0.26]],
};

function pickStock(line: HkLine, id: string): { stock: string; cars: number } {
  let r = hash(id);
  for (const [stock, cars, share] of MIX[line.id] ?? []) {
    if (r < share) return { stock, cars };
    r -= share;
  }
  return { stock: line.stock, cars: line.cars };
}

// ---------------------------------------------------------------------------
// Timelines
// ---------------------------------------------------------------------------

/** Arrival (A) and departure (D) times of a pattern's stops on the calibrated model clock, from arrival at its origin. */
interface Cum {
  A: number[];
  D: number[];
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
 * Join a fresh timeline onto where the previous poll's timeline shows the train right now, so it never
 * jumps: it keeps its place on the current stretch and the new times only change its speed.
 * (Same approach as the London adapter.)
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
      out = out.slice(j);
      out[0].a = Math.min(out[0].a, S.a);
      if (!T) out[0].d = Math.max(out[0].d, now);
      else if (out[1].s === T.s && out[1].a > now) out[0].d = Math.min(now, (now - pos.f * out[1].a) / (1 - pos.f));
      else out[0].d = Math.min(out[0].d, now);
      out[0].a = Math.min(out[0].a, out[0].d);
    } else if (j < 0 && N && out[0].s === N.s && pos.f < 1) {
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

interface Built {
  state: TrainState;
  p: Pattern;
  end: number;
  /** Boards that listed this train in the current poll. */
  seen: number;
}

// ---------------------------------------------------------------------------
// Live tracker
// ---------------------------------------------------------------------------

export class MtrLive {
  net = new Network();
  boards = new Map<string, Board>();
  /** Calibration per pair of consecutive polled stations: observed / modeled time. */
  k = new Map<string, number>();
  /** Per line: summed observed and modeled times of matched board pairs (diagnostics). */
  stats = new Map<string, { obs: number; model: number; n: number }>();
  requests: number[] = [];
  lastError?: string;
  private pausedUntil = 0;
  private lastRefresh = 0;
  private backoff = 0;
  private memory = new Map<string, Built>();
  private counter = 0;
  /** Line directions built at least once since this instance started. */
  private warm = new Set<string>();
  /** Every train each board listed in the last 15 minutes, per `${line}|${sta}|${dir}`, with the time span covered. */
  private history = new Map<string, { since: number; last: number; seen: { t: number; dest: string }[] }>();
  /** Polled stations of each line and direction, in travel order. */
  private polled = new Map<string, string[]>();
  private cums = new Map<Pattern, Cum>();

  constructor() {
    for (const l of LINES) {
      for (const dir of ['UP', 'DOWN'] as Dir[]) {
        const main = this.net.main(l.id, dir);
        if (!main) continue;
        this.polled.set(`${l.id}|${dir}`, l.poll.filter((s) => main.stops.includes(s)).sort((a, b) => main.stops.indexOf(a) - main.stops.indexOf(b)));
      }
    }
  }

  async poll(nowMs: number): Promise<TrainState[]> {
    await this.refresh(nowMs);
    const now = nowMs / 1000;
    if (![...this.boards.values()].some((b) => now - b.fetchedAt < MAX_AGE_S)) throw new Error(this.lastError ?? 'no Next Train data');
    this.cums.clear();
    this.remember(now);
    const fresh: Built[] = [];
    for (const l of LINES) for (const dir of ['UP', 'DOWN'] as Dir[]) fresh.push(...this.buildLine(l, dir, now));
    return this.track(fresh, now);
  }

  private remember(now: number) {
    for (const [key, board] of this.boards) {
      for (const dir of ['UP', 'DOWN'] as Dir[]) {
        const k = `${key}|${dir}`;
        let h = this.history.get(k);
        if (h && board.asOf <= h.last) continue;
        // After a gap between boards, trains may have come and gone unseen.
        if (!h || board.asOf - h.last > MAX_AGE_S) h = { since: board.asOf, last: board.asOf, seen: [] };
        h.last = board.asOf;
        for (const p of board[dir]) {
          const same = h.seen.find((x) => x.dest === p.dest && Math.abs(x.t - p.t) < 90);
          if (same) same.t = p.t;
          else h.seen.push({ t: p.t, dest: p.dest });
        }
        h.seen = h.seen.filter((x) => x.t > now - 900);
        this.history.set(k, h);
      }
    }
  }

  private async refresh(nowMs: number) {
    this.requests = this.requests.filter((t) => nowMs - t < 60_000);
    if (nowMs < this.pausedUntil) return;
    const now = nowMs / 1000;
    const age = (key: string) => now - (this.boards.get(key)?.fetchedAt ?? 0);
    const keys = LINES.flatMap((l) => l.poll.map((s) => `${l.id}|${s}`));
    const share = Math.ceil((keys.length * Math.min(CYCLE_S, now - this.lastRefresh)) / CYCLE_S);
    this.lastRefresh = now;
    const due = keys.filter((k) => age(k) >= REFRESH_S).sort((a, b) => age(b) - age(a));
    const batch = due.slice(0, Math.max(0, Math.min(share, MAX_PER_MIN - this.requests.length)));
    let next = 0;
    let halt = false;
    const worker = async () => {
      while (next < batch.length && !halt) {
        const key = batch[next++];
        const [line, sta] = key.split('|');
        this.requests.push(Date.now());
        try {
          this.boards.set(key, await fetchBoard(line, sta));
          this.backoff = 0;
        } catch (err) {
          this.lastError = `${key}: ${err instanceof Error ? err.message : err}`;
          if (err instanceof HttpError && (err.status === 429 || err.status >= 500)) {
            halt = true;
            this.backoff = Math.min(300_000, this.backoff ? this.backoff * 2 : 30_000);
            this.pausedUntil = Date.now() + this.backoff;
          }
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  }

  private kOf(line: string, dir: Dir, a: string, b: string) {
    return this.k.get(`${line}|${dir}|${a}>${b}`);
  }

  private meanK(line: string, dir: Dir): number {
    const ks = [...this.k].filter(([key]) => key.startsWith(`${line}|${dir}|`)).map(([, v]) => v);
    return ks.length ? ks.reduce((a, b) => a + b, 0) / ks.length : 1;
  }

  /** Calibrated arrival and departure clock of a pattern: each step is scaled by the factor of the polled pair around it. */
  cum(p: Pattern): Cum {
    const hit = this.cums.get(p);
    if (hit) return hit;
    const polled = this.polled.get(`${p.line.id}|${p.dir}`) ?? [];
    const idx = polled.map((s) => p.stops.indexOf(s));
    const mean = this.meanK(p.line.id, p.dir);
    const step = (i: number) => {
      for (let j = 0; j + 1 < polled.length; j++) {
        if (idx[j] >= 0 && idx[j + 1] >= 0 && idx[j] < i && i <= idx[j + 1]) return this.kOf(p.line.id, p.dir, polled[j], polled[j + 1]) ?? mean;
      }
      return mean;
    };
    const A = [0];
    const D = [ORIGIN_DWELL];
    for (let i = 1; i < p.stops.length; i++) {
      const k = step(i);
      A[i] = D[i - 1] + k * p.run[i];
      D[i] = A[i] + (i + 1 < p.stops.length ? step(i + 1) * p.line.dwell : TERMINAL_DWELL);
    }
    const out = { A, D };
    this.cums.set(p, out);
    return out;
  }

  private boardFor(line: string, sta: string, now: number): Board | undefined {
    const b = this.boards.get(`${line}|${sta}`);
    return b && now - b.fetchedAt < MAX_AGE_S ? b : undefined;
  }

  /** Link each prediction to the same train's prediction at the next polled station, and turn the chains into trains. */
  private buildLine(l: HkLine, dir: Dir, now: number): Built[] {
    const main = this.net.main(l.id, dir);
    if (!main) return [];
    const cum = this.cum(main);
    const polled = this.polled.get(`${l.id}|${dir}`)!;
    const avail = polled.filter((s) => this.boardFor(l.id, s, now));
    const lists = avail.map((s) => this.boardFor(l.id, s, now)![dir].filter((p) => p.t > now - 600));
    // Where both ends are polled (DRL), the next departure back from the far end means a train is on its way there now.
    const origin = main.stops[0], term = main.stops[main.stops.length - 1];
    const back = this.net.main(l.id, dir === 'UP' ? 'DOWN' : 'UP');
    const shuttle = avail[0] === origin && avail[avail.length - 1] === term && back?.stops[0] === term;
    if (shuttle) {
      const next = this.boardFor(l.id, term, now)?.[back!.dir].find((p) => p.t > now + ORIGIN_DWELL - 5);
      const left = next && next.t - TURNAROUND - (cum.A[main.stops.length - 1] - cum.D[0]);
      if (left && left < now - 5 && !lists[0].some((p) => Math.abs(p.t - left) < 90)) {
        lists[0] = [{ sta: origin, t: left, dep: true, dest: term, ttnt: 1, asOf: now }, ...lists[0]].sort((a, b) => a.t - b.t);
      }
    }
    // No board sees trains past the last one on their way into the terminus. On a cold start there is no memory of
    // them either, so fill that stretch at the headway of the trains the last board sees coming.
    const key = `${l.id}|${dir}`;
    const seer = avail.findLastIndex((s) => s !== term);
    const last = lists[seer];
    if (!this.warm.has(key) && last?.length && !shuttle) {
      this.warm.add(key);
      const gaps = last.slice(1).map((p, i) => p.t - last[i].t).sort((a, b) => a - b);
      const h = gaps.length ? Math.max(100, Math.min(900, gaps[gaps.length >> 1])) : 0;
      const leg = cum.A[main.stops.length - 1] - cum.A[main.stops.indexOf(avail[seer])];
      for (let t = last[0].t - h; h && t + leg + TERMINAL_DWELL > now; t -= h) {
        if (t < now) last.unshift({ ...last[0], t, ttnt: 1, asOf: now });
      }
    }
    const link = new Map<Pred, Pred>();
    const linked = new Set<Pred>();
    const stale = new Set<Pred>();
    for (let n = 0; n + 1 < avail.length; n++) {
      const A = avail[n], B = avail[n + 1];
      const ia = main.stops.indexOf(A), ib = main.stops.indexOf(B);
      const R = cum.A[ib] - cum.A[ia];
      const reaches = (p: Pred) => {
        const m = this.net.pattern(l.id, dir, p.dest, p.via, [A]);
        return !!m && m.p.stops.indexOf(B) > m.p.stops.indexOf(A) && m.p.stops.indexOf(B) < m.end;
      };
      const pairs = align(lists[n], lists[n + 1], R, reaches);
      for (const [i, j] of pairs) {
        link.set(lists[n][i], lists[n + 1][j]);
        linked.add(lists[n + 1][j]);
      }
      // Stale rows for trains that newer boards further on already account for.
      if (lists[n + 1].length) for (const p of lists[n]) if (!link.has(p) && reaches(p) && passed(p, R, lists[n + 1][0].asOf)) stale.add(p);
      // Calibrate this stretch from the matches, when the two stations are neighbors in the polling plan.
      if (pairs.length && polled.indexOf(B) === polled.indexOf(A) + 1) {
        const key = `${l.id}|${dir}|${A}>${B}`;
        const k0 = this.k.get(key) ?? this.meanK(l.id, dir);
        const ratios = pairs.map(([i, j]) => ((lists[n + 1][j].t - lists[n][i].t) / R) * k0).sort((a, b) => a - b);
        const med = ratios[ratios.length >> 1];
        this.k.set(key, Math.max(0.7, Math.min(1.5, 0.85 * k0 + 0.15 * med)));
        const st = this.stats.get(l.id) ?? { obs: 0, model: 0, n: 0 };
        for (const [i, j] of pairs) {
          st.obs += lists[n + 1][j].t - lists[n][i].t;
          st.model += R / k0;
          st.n++;
        }
        this.stats.set(l.id, st);
      }
    }
    const out: Built[] = [];
    for (const list of lists) {
      for (const p of list) {
        if (linked.has(p)) continue;
        const chain = [p];
        for (let q = link.get(p); q; q = link.get(q)) chain.push(q);
        if (stale.has(chain[chain.length - 1])) continue;
        const b = this.timeline(l, dir, chain, now);
        if (b) out.push(b);
      }
    }
    // Headways never drop below ~2 minutes: two timelines this close together are one train seen twice.
    const pos = out.map((b) => this.progress(b.state.stops, b.p, now));
    const keep = out.filter((b, i) =>
      !out.some((o, j) => {
        if (j === i || o.state.dest !== b.state.dest || o.p !== b.p || pos[i] === undefined || pos[j] === undefined) return false;
        if (Math.abs(pos[i]! - pos[j]!) >= 45) return false;
        return o.seen > b.seen || (o.seen === b.seen && j < i);
      }),
    );
    return keep;
  }

  /** Lay a chain of predictions over its pattern: anchors on the calibrated clock, model times in between and beyond. */
  private timeline(l: HkLine, dir: Dir, chain: Pred[], now: number): Built | null {
    // Where branches merge, a train first seen after the junction came from the branch whose board does not list it.
    const f = chain[0];
    const plausible = (p: Pattern) => {
      const k = p.stops.indexOf(f.sta);
      const { A, D } = this.cum(p);
      return !(this.polled.get(`${l.id}|${dir}`) ?? []).some((u) => {
        const i = p.stops.indexOf(u);
        const list = i >= 0 && i < k ? this.boardFor(l.id, u, now)?.[dir] : undefined;
        const h = this.history.get(`${l.id}|${u}|${dir}`);
        if (!list?.length || !h) return false;
        const t = f.t - (A[k] - (i === 0 ? D[0] : A[i]));
        const covered = t > h.since + 30 && (list.length < 4 || t < list[list.length - 1].t + 30);
        return covered && !h.seen.some((q) => q.dest === f.dest && Math.abs(q.t - t) < 120);
      });
    };
    const m = this.net.pattern(l.id, dir, f.dest, f.via, chain.map((p) => p.sta), plausible);
    if (!m) return null;
    const { p, end } = m;
    const { A, D } = this.cum(p);
    const anchors: { c: number; t: number }[] = [];
    let at = -1;
    for (const o of chain) {
      const i = p.stops.indexOf(o.sta, at + 1);
      if (i < 0 || i >= end) continue;
      at = i;
      const c = o.dep || i === 0 ? D[i] : A[i];
      const prev = anchors[anchors.length - 1];
      if (prev && (o.t - prev.t < 0.5 * (c - prev.c) || o.t - prev.t > 3 * (c - prev.c) + 120)) continue;
      anchors.push({ c, t: o.t });
    }
    if (!anchors.length) return null;
    const clock = (c: number) => {
      if (c <= anchors[0].c) return anchors[0].t - (anchors[0].c - c);
      for (let j = 1; j < anchors.length; j++) {
        const a = anchors[j - 1], b = anchors[j];
        if (c <= b.c) return a.t + ((c - a.c) * (b.t - a.t)) / (b.c - a.c);
      }
      const z = anchors[anchors.length - 1];
      return z.t + (c - z.c);
    };
    const times = p.stops.slice(0, end + 1).map((s, i) => {
      const a = clock(A[i]);
      return { s, a, d: i === end ? a + TERMINAL_DWELL : clock(D[i]) };
    });
    // A train shown as arriving (0 min) was at that platform when the board was made: it has not left before then.
    for (const o of chain) {
      if (o.ttnt > 0) continue;
      const i = p.stops.indexOf(o.sta);
      if (i >= 0 && i < end && times[i].d < o.asOf + 10) times[i].d = o.asOf + 10;
    }
    for (let i = 1; i <= end; i++) {
      const shift = times[i - 1].d + 0.6 * p.run[i] - times[i].a;
      if (shift > 0) {
        times[i].a += shift;
        times[i].d += shift;
      }
    }
    let cur = -1;
    for (let i = 0; i <= end; i++) if (times[i].a <= now) cur = i;
    // Not yet departed from its origin: only shown standing at the platform shortly before leaving.
    if (cur < 0) {
      if (times[0].d - now > ORIGIN_DWELL) return null;
      cur = 0;
      times[0].a = now - 1;
    }
    if (times[end].d < now) return null;
    const stops = times.slice(cur, cur + 16).map((x, i) => {
      const a = i ? Math.round(x.a) : Math.floor(x.a);
      return { s: x.s, a, d: Math.max(a, Math.round(x.d)) };
    });
    const [dest, destLocal] = this.net.names.get(p.stops[end]) ?? [chain[0].dest, undefined];
    return {
      p,
      end,
      seen: chain.length,
      state: {
        id: '',
        line: l.id,
        dest,
        destLocal,
        dir: dir === 'UP' ? l.up : l.down,
        service: p.via === 'RAC' ? 'via Racecourse' : undefined,
        stock: l.stock,
        cars: l.cars,
        live: true,
        stops,
      },
    };
  }

  /** Model seconds along pattern `p` at which a timeline puts its train at `now`. */
  private progress(stops: TimelineStop[], p: Pattern, now: number): number | undefined {
    const pos = locate(stops, now);
    if (!pos) return undefined;
    const { A, D } = this.cum(p);
    const i = p.stops.indexOf(stops[pos.k].s);
    if (i < 0) return undefined;
    if (pos.f < 0) {
      const s = stops[pos.k];
      return A[i] + ((D[i] - A[i]) * (now - s.a)) / Math.max(1, s.d - s.a);
    }
    const j = p.stops.indexOf(stops[pos.k + 1].s, i + 1);
    return j < 0 ? undefined : D[i] + pos.f * (A[j] - D[i]);
  }

  /** Keep ids and motion continuous: match fresh trains to last poll's, splice their timelines, carry on hidden ones. */
  private track(fresh: Built[], now: number): TrainState[] {
    const old = [...this.memory.values()];
    const pairs: [number, number, number][] = [];
    fresh.forEach((f, i) => {
      const pf = this.progress(f.state.stops, f.p, now);
      if (pf === undefined) return;
      old.forEach((o, j) => {
        if (o.state.line !== f.state.line || o.p.dir !== f.p.dir || o.state.dest !== f.state.dest || o.p.via !== f.p.via) return;
        const po = this.progress(o.state.stops, f.p, now);
        if (po !== undefined && Math.abs(po - pf) < SAME_TRAIN_S) pairs.push([Math.abs(po - pf), i, j]);
      });
    });
    pairs.sort((a, b) => a[0] - b[0]);
    const matched = new Map<number, number>();
    const used = new Set<number>();
    for (const [, i, j] of pairs) {
      if (matched.has(i) || used.has(j)) continue;
      matched.set(i, j);
      used.add(j);
    }
    const out: Built[] = [];
    const born = new Set<Built>();
    fresh.forEach((f, i) => {
      const j = matched.get(i);
      const o = j === undefined ? undefined : old[j];
      const run = (a: string, b: string) => {
        const k = f.p.stops.indexOf(b);
        return k > 0 && f.p.stops[k - 1] === a ? f.p.run[k] : 90;
      };
      const stops = splice(f.state.stops, o?.state, now, run);
      if (stops[stops.length - 1].d < now) return;
      const id = o?.state.id ?? `${f.state.line}-${++this.counter}`;
      const stock = o ? { stock: o.state.stock, cars: o.state.cars } : pickStock(f.p.line, id);
      out.push({ ...f, state: { ...f.state, id, ...stock, stops } });
      if (!o) born.add(out[out.length - 1]);
    });
    // Trains no board can see carry on along their last timeline: past the last board (the run into a terminus),
    // or further out than the 4 trains the next board lists.
    old.forEach((o, j) => {
      if (used.has(j)) return;
      const pos = locate(o.state.stops, now);
      if (!pos) return;
      const idx = o.p.stops.indexOf(o.state.stops[pos.k].s);
      const first = pos.f < 0 ? idx : idx + 1;
      const next = (this.polled.get(`${o.state.line}|${o.p.dir}`) ?? []).find((s) => {
        const i = o.p.stops.indexOf(s);
        return i >= first && i < o.end && this.boardFor(o.state.line, s, now);
      });
      if (next) {
        const list = this.boardFor(o.state.line, next, now)![o.p.dir];
        const a = o.state.stops.find((s) => s.s === next)?.a;
        if (a === undefined || list.length < 4 || a < list[3].t - 30) return;
      }
      out.push({ ...o, state: { ...o.state, stops: o.state.stops.slice(pos.k) } });
    });
    // At a terminus the train that has just come in is usually the one about to leave: hand over rather than draw both.
    for (const dep of out) {
      const s0 = dep.state.stops[0];
      if (dep.p.stops[0] !== s0.s || s0.a > now || s0.d <= now) continue;
      for (const arr of out) {
        const last = arr.state.stops[arr.state.stops.length - 1];
        if (arr === dep || arr.state.line !== dep.state.line || arr.p.stops[arr.end] !== s0.s || last.s !== s0.s || last.a > now) continue;
        last.d = Math.max(last.a, Math.min(last.d, s0.a));
        if (born.has(dep)) Object.assign(dep.state, { stock: arr.state.stock, cars: arr.state.cars });
      }
    }
    const live = out.filter((b) => b.state.stops[b.state.stops.length - 1].d >= now);
    this.memory = new Map(live.map((b) => [b.state.id, b]));
    return live.map((b) => b.state);
  }
}

/** A train listed at A had already gone through B when B's (newer) board was made, so B no longer lists it. */
const passed = (p: Pred, R: number, asOfB: number) => p.t + R < asOfB - 30;

/**
 * Monotone matching of the trains listed at A with those listed at the next polled station B, which see
 * them about R seconds later. Returns [index at A, index at B] pairs.
 */
export function align(a: Pred[], b: Pred[], R: number, reachesB: (p: Pred) => boolean): [number, number][] {
  const n = a.length, m = b.length;
  if (!n || !m) return [];
  const tol = Math.max(90, 0.4 * R);
  const G = 60;
  const asOfA = a[0].asOf, asOfB = b[0].asOf;
  const skipA = (p: Pred) =>
    !reachesB(p) || passed(p, R, asOfB) || (m >= 4 && p.t + R - tol > b[m - 1].t) ? 0 : G;
  // Listed at B but gone from A: the train had already passed A when A's board was made.
  const skipB = (q: Pred) => (q.t < asOfA + R - 45 ? 0 : G);
  const match = (p: Pred, q: Pred) => {
    if (p.dest !== q.dest || p.via !== q.via) return Infinity;
    const e = Math.abs(q.t - p.t - R);
    return e > tol ? Infinity : e - tol;
  };
  const cost = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(Infinity));
  const move = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  cost[0][0] = 0;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      const c = cost[i][j];
      if (c === Infinity) continue;
      if (i < n && j < m) {
        const v = c + match(a[i], b[j]);
        if (v < cost[i + 1][j + 1]) [cost[i + 1][j + 1], move[i + 1][j + 1]] = [v, 3];
      }
      if (i < n && c + skipA(a[i]) < cost[i + 1][j]) [cost[i + 1][j], move[i + 1][j]] = [c + skipA(a[i]), 1];
      if (j < m && c + skipB(b[j]) < cost[i][j + 1]) [cost[i][j + 1], move[i][j + 1]] = [c + skipB(b[j]), 2];
    }
  }
  const out: [number, number][] = [];
  for (let i = n, j = m; i > 0 || j > 0; ) {
    const mv = move[i][j];
    if (mv === 3) out.push([--i, --j]);
    else if (mv === 1) i--;
    else j--;
  }
  return out.reverse();
}

export const createAdapters: AdapterFactory = () => {
  const live = new MtrLive();
  return [
    {
      id: 'hongkong-mtr',
      city: 'hongkong',
      name: 'MTR · Next Train API (DATA.GOV.HK)',
      live: true,
      intervalMs: 15_000,
      poll: (now) => live.poll(now),
    } satisfies Adapter,
  ];
};

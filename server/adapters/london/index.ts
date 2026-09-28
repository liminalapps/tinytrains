import type { TrainState } from '../../../shared/types.ts';
import type { Adapter, AdapterEnv, AdapterFactory } from '../types.ts';
import { cleanName, LINE_BY_ID, type TflMode } from './lines.ts';
import { Network } from './network.ts';
import { approxPosition, buildTrain, type Candidate, type Obs } from './trains.ts';

/** One row of TfL's /Mode/{mode}/Arrivals. */
export interface Prediction {
  vehicleId?: string;
  naptanId: string;
  stationName?: string;
  lineId: string;
  platformName?: string;
  direction?: string;
  destinationNaptanId?: string;
  destinationName?: string;
  towards?: string;
  timestamp: string;
  expectedArrival: string;
  currentLocation?: string;
}

const UA = 'TinyTrains/0.1 (live transit diorama)';

const SOURCES: { mode: TflMode; id: string; name: string }[] = [
  { mode: 'tube', id: 'london-tube', name: 'London Underground · TfL Unified API' },
  { mode: 'elizabeth-line', id: 'london-elizabeth', name: 'Elizabeth line · TfL Unified API' },
  { mode: 'overground', id: 'london-overground', name: 'London Overground · TfL Unified API' },
  { mode: 'dlr', id: 'london-dlr', name: 'DLR · TfL Unified API' },
  { mode: 'tram', id: 'london-tram', name: 'London Trams · TfL Unified API' },
];

let network: Network | undefined;
const getNetwork = () => (network ??= new Network());

// ---------------------------------------------------------------------------
// Rolling stock per train
// ---------------------------------------------------------------------------

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 2 ** 32;
}

/** Fleet mixes where a line runs more than one type, [stock, cars, share]. */
const MIX: Record<string, [string, number, number][]> = {
  // Fleet shares: 55 B07, 70 B90/B92, 24 B2K units. B90/B92/B2K couple together; B07s run on their own.
  dlr: [
    ['london-b07', 3, 0.37],
    ['london-b92', 3, 0.47],
    ['london-b2k', 3, 0.16],
  ],
  // Lioness: four 4-car 710/2s and four 5-car 710/3s. Mildmay borrows two 710/3s. Windrush mixes 378/1s and 378/2s.
  lioness: [
    ['london-710', 4, 0.5],
    ['london-710', 5, 0.5],
  ],
  mildmay: [
    ['london-378-2', 5, 0.9],
    ['london-710', 5, 0.1],
  ],
  windrush: [
    ['london-378-1', 5, 0.55],
    ['london-378-2', 5, 0.45],
  ],
};
/** Stations only served by the Stratford International to Woolwich Arsenal route, where the first B23s run (Sept 2026). */
const B23_ROUTE = new Set(['940GZZDLSIT', '940GZZDLSHS', '940GZZDLABR', '940GZZDLWHM', '940GZZDLSTL']);

export function pickStock(t: TrainState, key: string): { stock: string; cars: number } {
  const line = t.line;
  const def = LINE_BY_ID.get(line)!;
  if (line === 'tram') {
    // Fleet numbers 2530-2553 are Bombardier CR4000s, 2554-2565 Stadler Variobahns.
    const n = Number(key);
    return { stock: n >= 2554 && n <= 2565 ? 'london-variobahn' : 'london-cr4000', cars: 1 };
  }
  let r = hash(key);
  if (line === 'dlr' && t.stops.some((s) => B23_ROUTE.has(s.s)) && r < 0.12) return { stock: 'london-b23', cars: 1 };
  for (const [stock, cars, share] of MIX[line] ?? []) {
    if (r < share) return { stock, cars };
    r -= share;
  }
  return { stock: def.stock, cars: def.cars };
}

// ---------------------------------------------------------------------------
// Grouping predictions into trains
// ---------------------------------------------------------------------------

const time = (p: Prediction) => Date.parse(p.expectedArrival) / 1000;
const toObs = (ps: Prediction[]): Obs[] => ps.map((p) => ({ s: p.naptanId, t: time(p) }));

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const list = m.get(k);
    if (list) list.push(it);
    else m.set(k, [it]);
  }
  return m;
}

const destCode = (p: Prediction) =>
  p.destinationNaptanId?.replace(/^940GZZ(LU|DL|CR)|^910G/, '') ||
  (p.destinationName || p.towards || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '');

const lastStop = (ps: Prediction[]) => cleanName(ps.reduce((a, b) => (time(b) > time(a) ? b : a)).stationName ?? '');

function describe(line: string, ps: Prediction[], id: string, label?: string): Candidate {
  const latest = ps.reduce((a, b) => (b.timestamp > a.timestamp ? b : a));
  const p = ps.find((x) => x.destinationName) ?? ps[0];
  const bound = ps.map((x) => x.platformName?.match(/^(North|South|East|West)bound|^(Inner|Outer) Rail/i)?.[0]).find(Boolean);
  const via = p.towards?.match(/\bvia (.+)$/i)?.[1];
  return {
    id,
    line,
    stops: toObs(ps),
    dest: cleanName(p.destinationName || '') || (p.towards && !/check front/i.test(p.towards) ? p.towards : lastStop(ps)),
    destId: p.destinationNaptanId || undefined,
    dir: bound ? bound[0].toUpperCase() + bound.slice(1).toLowerCase() : undefined,
    service: via ? `via ${via === 'CX' ? 'Charing Cross' : via}` : undefined,
    label,
    location: latest.currentLocation || undefined,
    locationTime: Date.parse(latest.timestamp) / 1000,
    stock: '',
    cars: 0,
  };
}

/**
 * Rebuild trains from per-station predictions without vehicle ids (DLR, some Tube rows): link each
 * prediction to the next station's prediction toward the same destination that fits the run time.
 */
function chains(net: Network, line: string, preds: Prediction[]): Prediction[][] {
  const out: Prediction[][] = [];
  for (const [dest, ps] of groupBy(preds, (p) => p.destinationNaptanId ?? '')) {
    // The same train is often listed on two platforms a second apart.
    const sorted: Prediction[] = [];
    for (const p of [...ps].sort((a, b) => time(a) - time(b))) {
      if (!sorted.some((q) => q.naptanId === p.naptanId && time(p) - time(q) < 30)) sorted.push(p);
    }
    if (!net.lines.get(line)?.stations.has(dest)) {
      for (const p of sorted) out.push([p]);
      continue;
    }
    const atStation = groupBy(sorted, (p) => p.naptanId);
    const link = new Map<Prediction, Prediction>();
    const claimed = new Set<Prediction>();
    for (const p of sorted) {
      const n = net.nextToward(line, p.naptanId, dest);
      if (!n) continue;
      // DLR countdowns are whole minutes, so allow some slack around the expected run time.
      const run = net.len(p.naptanId, n) / 13 + 15;
      const t = time(p);
      let best: Prediction | undefined;
      for (const q of atStation.get(n) ?? []) {
        const tq = time(q);
        if (claimed.has(q) || tq < t + run - 45 || tq > t + 1.5 * run + 90) continue;
        if (!best || Math.abs(tq - t - run) < Math.abs(time(best) - t - run)) best = q;
      }
      if (best) {
        link.set(p, best);
        claimed.add(best);
      }
    }
    for (const p of sorted) {
      if (claimed.has(p)) continue;
      const chain = [p];
      for (let q = link.get(p); q; q = link.get(q)) chain.push(q);
      out.push(chain);
    }
  }
  return out;
}

/** Group one mode's predictions into train candidates. Candidates with id '' need id tracking. */
function candidates(net: Network, mode: TflMode, preds: Prediction[]): Candidate[] {
  const out: Candidate[] = [];
  const anon: Prediction[] = [];
  const known = preds.filter((p) => LINE_BY_ID.has(p.lineId) && net.stations.has(p.naptanId));
  if (mode === 'dlr') anon.push(...known);
  else if (mode === 'elizabeth-line' || mode === 'overground') {
    for (const [key, ps] of groupBy(known, (p) => `${p.lineId}|${p.vehicleId ?? ''}`)) {
      if (!ps[0].vehicleId) anon.push(...ps);
      else out.push(describe(ps[0].lineId, ps, key.replace('|', '-')));
    }
  } else {
    // Tube and trams: vehicle ids are train/fleet numbers, but Tube numbers are not unique on a line, so a
    // Tube train is identified by line, number and destination. Rows for a vehicle's next trip are dropped.
    const byTrip = groupBy(known, (p) => `${p.lineId}|${p.vehicleId ?? ''}|${p.destinationNaptanId || p.destinationName || ''}`);
    const byVehicle = new Map<string, Prediction[][]>();
    for (const ps of byTrip.values()) {
      const v = (ps[0].vehicleId ?? '').trim();
      if (!v || /^0+$/.test(v)) {
        anon.push(...ps);
        continue;
      }
      const k = `${ps[0].lineId}|${v}`;
      byVehicle.set(k, [...(byVehicle.get(k) ?? []), ps]);
    }
    for (const [k, trips] of byVehicle) {
      trips.sort((a, b) => Math.min(...a.map(time)) - Math.min(...b.map(time)));
      const firstEnd = Math.max(...trips[0].map(time));
      const [line, v] = k.split('|');
      trips.forEach((ps, i) => {
        if (i > 0 && (mode === 'tram' || Math.min(...ps.map(time)) >= firstEnd - 60)) return;
        const id = mode === 'tram' ? `tram-${v}` : `${line}-${v}-${destCode(ps[0])}`;
        out.push(describe(line, ps, id, mode === 'tram' ? `Tram ${v}` : `Train ${v}`));
      });
    }
  }
  for (const [line, ps] of groupBy(anon, (p) => p.lineId)) {
    for (const chain of chains(net, line, ps)) out.push({ ...describe(line, chain, ''), ordered: true });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

/** Where two timelines put a train at `now` differ by more than this: not the same train. */
const SAME_TRAIN_M = 1200;

const distanceAt = (net: Network, a: TrainState, b: TrainState, now: number) => {
  const p = approxPosition(net, a.stops, now), q = approxPosition(net, b.stops, now);
  return p && q ? Math.hypot(p[0] - q[0], p[1] - q[1]) : Infinity;
};

/** Match trains without a vehicle id to last poll's trains of the same line and destination by where both are now. */
function trackIds(net: Network, fresh: TrainState[], old: TrainState[], now: number): (string | undefined)[] {
  const pairs: [number, number, number][] = [];
  fresh.forEach((t, i) => {
    old.forEach((o, j) => {
      if (o.line !== t.line || o.dest !== t.dest) return;
      const d = distanceAt(net, t, o, now);
      if (d < 600) pairs.push([d, i, j]);
    });
  });
  pairs.sort((a, b) => a[0] - b[0]);
  const ids: (string | undefined)[] = Array.from({ length: fresh.length });
  const used = new Set<number>();
  for (const [, i, j] of pairs) {
    if (ids[i] || used.has(j)) continue;
    ids[i] = old[j].id;
    used.add(j);
  }
  return ids;
}

async function fetchArrivals(mode: TflMode, env: AdapterEnv): Promise<Prediction[]> {
  const key = env.TFL_APP_KEY ? `&app_key=${encodeURIComponent(env.TFL_APP_KEY)}` : '';
  const res = await fetch(`https://api.tfl.gov.uk/Mode/${mode}/Arrivals?count=-1${key}`, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`TfL ${mode} arrivals: HTTP ${res.status}`);
  return (await res.json()) as Prediction[];
}

/** Build trains from a batch of predictions, keeping ids and motion continuous across calls. */
export function createTracker(mode: TflMode) {
  let memory = new Map<string, TrainState>();
  /** Current id for a feed identity that was renamed after its data jumped to another train. */
  let alias = new Map<string, string>();
  const anonIds = new Set<string>();
  let counter = 0;
  return (preds: Prediction[], nowMs: number): TrainState[] => {
    const net = getNetwork();
    const now = nowMs / 1000;
    const cands = candidates(net, mode, preds);
    const trains: TrainState[] = [];
    const nextAlias = new Map<string, string>();
    const emit = (c: Candidate, base: string, stockKey: string) => {
      let id = alias.get(base) ?? base;
      let t = buildTrain(net, { ...c, id }, nowMs, memory.get(id));
      const prev = memory.get(id);
      if (t && prev && distanceAt(net, t, prev, now) >= SAME_TRAIN_M) {
        // The feed now puts this id somewhere else entirely: give it a new identity instead of teleporting it.
        id = `${base}.${++counter}`;
        t = buildTrain(net, { ...c, id }, nowMs);
      }
      if (!t || trains.some((x) => x.id === t.id)) return;
      if (id !== base) nextAlias.set(base, id);
      trains.push({ ...t, ...(prev && prev.id === t.id ? { stock: prev.stock, cars: prev.cars } : pickStock(t, stockKey)) });
    };
    for (const c of cands.filter((c) => c.id)) emit(c, c.id, c.label?.replace(/^\D+/, '') || c.id);
    const anon = cands.filter((c) => !c.id);
    const prelim = anon.map((c) => ({ c, t: buildTrain(net, { ...c, id: '' }, nowMs) })).filter((x) => x.t);
    const ids = trackIds(
      net,
      prelim.map((x) => x.t!),
      [...memory.values()].filter((t) => anonIds.has(t.id)),
      now,
    );
    anonIds.clear();
    prelim.forEach(({ c }, i) => {
      const base = ids[i] ?? `${c.line}-x${++counter}`;
      const before = trains.length;
      emit(c, base, base);
      if (trains.length > before) anonIds.add(trains[trains.length - 1].id);
    });
    memory = new Map(trains.map((t) => [t.id, t]));
    alias = nextAlias;
    return trains;
  };
}

export const createAdapters: AdapterFactory = (env) =>
  SOURCES.map(({ mode, id, name }): Adapter => {
    const track = createTracker(mode);
    return {
      id,
      city: 'london',
      name,
      live: true,
      intervalMs: 25_000,
      async poll(now) {
        return track(await fetchArrivals(mode, env), now);
      },
    };
  });

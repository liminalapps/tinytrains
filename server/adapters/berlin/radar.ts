// Live vehicle "movements" from the VBB HAFAS radar via the community-run transport.rest API
// (https://v6.vbb.transport.rest, keyless, ~100 requests/min). The radar has no product filter, so it returns
// buses too; tiles are fetched one after another and reduced to the wanted products straight away.

const BASE = 'https://v6.vbb.transport.rest/radar';
const UA = 'TinyTrains/0.1 (live transit diorama; https://tinytrains.app)';

/** [north, west, south, east]: the U-Bahn and tram networks in four tiles. */
const TILES: [number, number, number, number][] = [
  [52.62, 13.18, 52.5, 13.44],
  [52.62, 13.44, 52.5, 13.72],
  [52.5, 13.18, 52.36, 13.44],
  [52.5, 13.44, 52.36, 13.72],
];
/** One central tile, used to check cheaply whether realtime data has returned. */
const PROBE: [number, number, number, number] = [52.54, 13.33, 52.49, 13.45];
const MAX_RESULTS = 1000;
/** Every product a Berlin adapter refines with the radar: one scan serves them all. */
const PRODUCTS = new Set(['subway', 'tram']);

export interface RadarCall {
  station: string; // HAFAS / VBB station number, e.g. '900100003'
  pa?: number; // planned arrival, epoch s
  a?: number; // predicted arrival
  pd?: number;
  d?: number;
  /** The feed carries a prognosis for this call (a delay, possibly 0), not only the timetable. */
  rt: boolean;
}

export interface RadarTrip {
  tripId: string;
  line: string; // 'U7', 'M10'
  product: string; // 'subway' | 'tram'
  calls: RadarCall[];
  rt: boolean;
  cancelled: boolean;
}

interface Stopover {
  stop?: { id?: string };
  plannedArrival?: string | null;
  arrival?: string | null;
  arrivalDelay?: number | null;
  plannedDeparture?: string | null;
  departure?: string | null;
  departureDelay?: number | null;
  cancelled?: boolean;
}
interface Movement {
  tripId?: string;
  line?: { name?: string; product?: string };
  nextStopovers?: Stopover[];
}

const sec = (iso?: string | null) => (iso ? Date.parse(iso) / 1000 : undefined);

async function fetchTile([n, w, s, e]: [number, number, number, number]): Promise<RadarTrip[]> {
  const q = `north=${n}&west=${w}&south=${s}&east=${e}&results=${MAX_RESULTS}&duration=30&frames=0&polylines=false&pretty=false`;
  const res = await fetch(`${BASE}?${q}`, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`radar HTTP ${res.status}`);
  const body = (await res.json()) as { movements?: Movement[] };
  if ((body.movements?.length ?? 0) >= MAX_RESULTS) console.warn(`[berlin radar] tile ${n},${w} hit ${MAX_RESULTS} vehicles, some are missing`);
  const out: RadarTrip[] = [];
  for (const m of body.movements ?? []) {
    const product = m.line?.product ?? '';
    if (!PRODUCTS.has(product) || !m.tripId || !m.line?.name) continue;
    const calls: RadarCall[] = [];
    let cancelled = 0;
    for (const so of m.nextStopovers ?? []) {
      const station = so.stop?.id;
      if (!station) continue;
      if (so.cancelled) cancelled++;
      calls.push({
        station,
        pa: sec(so.plannedArrival),
        a: sec(so.arrival),
        pd: sec(so.plannedDeparture),
        d: sec(so.departure),
        rt: so.arrivalDelay != null || so.departureDelay != null,
      });
    }
    out.push({ tripId: m.tripId, line: m.line.name, product, calls, rt: calls.some((c) => c.rt), cancelled: !!calls.length && cancelled === calls.length });
  }
  return out;
}

interface RadarState {
  trips: RadarTrip[];
  at: number;
  /** Products that carried any prognosis in the last full scan. */
  realtime: Set<string>;
  probedAt: number;
  failures: number;
  retryAt: number;
  inFlight?: Promise<void>;
  error?: string;
}

const state: RadarState = { trips: [], at: 0, realtime: new Set(), probedAt: 0, failures: 0, retryAt: 0 };
const FULL_EVERY_S = 30;
const PROBE_EVERY_S = 300;
const STALE_S = 150;

async function scan(now: number) {
  try {
    // Without any prognosis there is nothing to add to the timetable: only probe now and then.
    if (!state.realtime.size) {
      if (state.probedAt && now - state.probedAt < PROBE_EVERY_S && !state.error) {
        state.at = now;
        return;
      }
      state.probedAt = now;
      const probe = await fetchTile(PROBE);
      if (!probe.some((t) => t.rt)) {
        state.trips = [];
        state.at = now;
        state.failures = 0;
        state.error = undefined;
        return;
      }
    }
    const trips: RadarTrip[] = [];
    const seen = new Set<string>();
    for (const tile of TILES) {
      for (const t of await fetchTile(tile)) {
        if (seen.has(t.tripId)) continue;
        seen.add(t.tripId);
        trips.push(t);
      }
    }
    state.trips = trips;
    state.realtime = new Set(trips.filter((t) => t.rt).map((t) => t.product));
    state.at = now;
    state.failures = 0;
    state.error = undefined;
  } catch (err) {
    state.failures++;
    state.error = err instanceof Error ? err.message : String(err);
    state.retryAt = now + Math.min(600, 30 * 2 ** state.failures);
  }
}

/**
 * Radar trips of one product ('subway', 'tram'), or null when the radar is unreachable. Scans all tiles
 * every 30 s while any product has prognoses, otherwise probes one tile every 5 minutes.
 */
export async function radarTrips(now: number, product: string): Promise<RadarTrip[] | null> {
  if (now - state.at >= FULL_EVERY_S && now >= state.retryAt) {
    state.inFlight ??= scan(now).finally(() => (state.inFlight = undefined));
  }
  // Don't hold up a poll for long (or at all when the last scan had nothing for this product).
  if (state.inFlight && (!state.at || state.realtime.has(product))) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([state.inFlight, new Promise((r) => (timer = setTimeout(r, 8000)))]);
    clearTimeout(timer);
  }
  if (!state.at || now - state.at > STALE_S) return null;
  return state.trips.filter((t) => t.product === product);
}

export const radarError = () => state.error;

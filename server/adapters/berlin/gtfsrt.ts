// VBB GTFS-realtime TripUpdates (https://production.gtfsrt.vbb.de, CC-BY 4.0, keyless, max 60 requests/min).
// The full feed is ~6 MB of protobuf for all of Berlin-Brandenburg, so it is decoded by hand and only the
// trips of wanted routes that run around now are kept.

const URL = 'https://production.gtfsrt.vbb.de/data';
const UA = 'TinyTrains/0.1 (live transit diorama; https://tinytrains.app)';

export interface RtStopUpdate {
  stop: string; // GTFS stop_id
  a?: number; // epoch seconds, rounded to the minute by VBB
  d?: number;
  /** Arrival and departure delays in seconds, when the feed has a prognosis. */
  ad?: number;
  dd?: number;
  skipped?: boolean;
}

export interface RtTrip {
  tripId: string;
  routeId: string;
  date: number; // start_date YYYYMMDD
  canceled: boolean;
  stops: RtStopUpdate[];
}

class Reader {
  pos: number;
  constructor(
    public buf: Uint8Array,
    start: number,
    public end: number,
  ) {
    this.pos = start;
  }
  /** Unsigned varint, exact up to 2^53. */
  varint(): number {
    let x = 0;
    let scale = 1;
    let b: number;
    do {
      b = this.buf[this.pos++];
      x += (b & 0x7f) * scale;
      scale *= 128;
    } while (b & 0x80);
    return x;
  }
  /** int32 varint: negative values take 10 bytes; only the low 32 bits matter. */
  int32(): number {
    let lo = 0;
    let shift = 0;
    let b: number;
    do {
      b = this.buf[this.pos++];
      if (shift < 32) lo |= (b & 0x7f) << shift;
      shift += 7;
    } while (b & 0x80);
    return lo | 0;
  }
  string(): string {
    const len = this.varint();
    const s = decoder.decode(this.buf.subarray(this.pos, this.pos + len));
    this.pos += len;
    return s;
  }
  sub(): Reader {
    const len = this.varint();
    const r = new Reader(this.buf, this.pos, this.pos + len);
    this.pos += len;
    return r;
  }
  skip(wire: number) {
    if (wire === 0) this.varint();
    else if (wire === 1) this.pos += 8;
    else if (wire === 2) {
      const len = this.varint();
      this.pos += len;
    }
    else if (wire === 5) this.pos += 4;
    else throw new Error(`protobuf: wire type ${wire}`);
  }
}

const decoder = new TextDecoder();

function stopTimeEvent(r: Reader): { time?: number; delay?: number } {
  const out: { time?: number; delay?: number } = {};
  while (r.pos < r.end) {
    const tag = r.varint();
    if (tag >> 3 === 1 && (tag & 7) === 0) out.delay = r.int32();
    else if (tag >> 3 === 2 && (tag & 7) === 0) out.time = r.varint();
    else r.skip(tag & 7);
  }
  return out;
}

function stopTimeUpdate(r: Reader): RtStopUpdate {
  const u: RtStopUpdate = { stop: '' };
  let arr: { time?: number; delay?: number } | undefined;
  let dep: { time?: number; delay?: number } | undefined;
  while (r.pos < r.end) {
    const tag = r.varint();
    const f = tag >> 3;
    if (f === 2) arr = stopTimeEvent(r.sub());
    else if (f === 3) dep = stopTimeEvent(r.sub());
    else if (f === 4) u.stop = r.string();
    else if (f === 5 && (tag & 7) === 0) u.skipped = r.varint() === 1;
    else r.skip(tag & 7);
  }
  if (arr?.time) u.a = arr.time;
  if (dep?.time) u.d = dep.time;
  if (arr?.delay !== undefined) u.ad = arr.delay;
  if (dep?.delay !== undefined) u.dd = dep.delay;
  return u;
}

/** Decode the trip updates of `routes` with any stop time inside [from, to]. */
export function decodeFeed(buf: Uint8Array, routes: Set<string>, from: number, to: number): { timestamp: number; trips: RtTrip[] } {
  const r = new Reader(buf, 0, buf.length);
  const trips: RtTrip[] = [];
  let timestamp = 0;
  while (r.pos < r.end) {
    const tag = r.varint();
    const f = tag >> 3;
    if (f === 1) {
      const h = r.sub();
      while (h.pos < h.end) {
        const t = h.varint();
        if (t >> 3 === 3 && (t & 7) === 0) timestamp = h.varint();
        else h.skip(t & 7);
      }
    } else if (f === 2) {
      const e = r.sub();
      while (e.pos < e.end) {
        const t = e.varint();
        if (t >> 3 === 3) {
          const trip = tripUpdate(e.sub(), routes, from, to);
          if (trip) trips.push(trip);
        } else e.skip(t & 7);
      }
    } else r.skip(tag & 7);
  }
  return { timestamp, trips };
}

function tripUpdate(r: Reader, routes: Set<string>, from: number, to: number): RtTrip | null {
  const trip: RtTrip = { tripId: '', routeId: '', date: 0, canceled: false, stops: [] };
  while (r.pos < r.end) {
    const tag = r.varint();
    const f = tag >> 3;
    if (f === 1) {
      const d = r.sub();
      while (d.pos < d.end) {
        const t = d.varint();
        const g = t >> 3;
        if (g === 1) trip.tripId = d.string();
        else if (g === 3) trip.date = Number(d.string());
        else if (g === 4 && (t & 7) === 0) trip.canceled = d.varint() === 3;
        else if (g === 5) trip.routeId = d.string();
        else d.skip(t & 7);
      }
      // The trip descriptor comes first: skip everything else of unwanted routes.
      if (!routes.has(trip.routeId)) return null;
    } else if (f === 2) trip.stops.push(stopTimeUpdate(r.sub()));
    else r.skip(tag & 7);
  }
  if (!routes.has(trip.routeId)) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of trip.stops) {
    const t0 = s.a ?? s.d;
    const t1 = s.d ?? s.a;
    if (t0 !== undefined && t0 < lo) lo = t0;
    if (t1 !== undefined && t1 > hi) hi = t1;
  }
  if (!trip.canceled && (hi < from || lo > to)) return null;
  return trip;
}

// ---------------------------------------------------------------------------
// Shared, polite fetching: one download serves every Berlin adapter.
// ---------------------------------------------------------------------------

interface FeedState {
  at: number; // epoch s of the last successful fetch (or 304)
  etag?: string;
  trips?: RtTrip[];
  timestamp: number;
  failures: number;
  retryAt: number;
  inFlight?: Promise<void>;
  error?: string;
}

const state: FeedState = { at: 0, timestamp: 0, failures: 0, retryAt: 0 };
const FRESH_S = 15;
const STALE_S = 180;

async function refresh(now: number, routes: Set<string>) {
  try {
    const res = await fetch(URL, {
      headers: { 'user-agent': UA, accept: 'application/protobuf, application/x-protobuf;q=0.9', ...(state.etag && state.trips ? { 'if-none-match': state.etag } : {}) },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 304) {
      state.at = now;
    } else if (res.ok) {
      const feed = decodeFeed(new Uint8Array(await res.arrayBuffer()), routes, now - 3600, now + 1800);
      state.trips = feed.trips;
      state.timestamp = feed.timestamp;
      state.etag = res.headers.get('etag') ?? undefined;
      state.at = now;
    } else throw new Error(`HTTP ${res.status}`);
    state.failures = 0;
    state.error = undefined;
  } catch (err) {
    state.failures++;
    state.error = err instanceof Error ? err.message : String(err);
    state.retryAt = now + Math.min(300, 20 * 2 ** state.failures);
  }
}

/**
 * The feed's trips of `routes` (every route any Berlin adapter wants) around `now` (epoch s), or null when the
 * feed is unavailable. One download and decode serves all adapters for FRESH_S seconds.
 */
export async function realtimeTrips(now: number, routes: Set<string>): Promise<RtTrip[] | null> {
  if (now - state.at >= FRESH_S && now >= state.retryAt) {
    state.inFlight ??= refresh(now, routes).finally(() => (state.inFlight = undefined));
  }
  if (state.inFlight) await state.inFlight;
  if (!state.trips || now - state.at > STALE_S) return null;
  // A feed that stopped updating is no better than none.
  if (state.timestamp && now - state.timestamp > STALE_S) return null;
  return state.trips;
}

export const realtimeError = () => state.error;

// Realtime overlays for the GTFS kit: the normalized RtTrip model every source produces, a polite fetch helper, and a
// GTFS-realtime source that decodes TripUpdates / VehiclePositions protobuf with a small streaming reader (national
// feeds are several MB; only the entities of our routes become objects).
import type { GtfsSchedule } from './schedule.ts';

export interface RtStopTime {
  station: number;
  /** Predicted (or actual) arrival / departure, epoch seconds. */
  a?: number;
  d?: number;
  /** Timetabled times, when the feed repeats them (helps matching when there is no trip key). */
  aimedA?: number;
  aimedD?: number;
  /** Delays in seconds, for feeds that give no times (Entur): time = timetable at this stop + delay. */
  delayA?: number;
  delayD?: number;
  skipped?: boolean;
}

export interface RtTrip {
  /** Schedule trip key (GTFS trip_id or the configured rtKey) when the feed knows it. */
  key?: string;
  /** LineDef id; needed for time matching when there is no key. */
  line?: string;
  /** Service date YYYYMMDD (GTFS-RT start_date), to tell today's run of a trip from yesterday's. */
  date?: number;
  cancelled?: boolean;
  stops?: RtStopTime[];
  /** Whole-trip delay in seconds when there are no per-stop times. */
  delay?: number;
  /** Current position, VehiclePositions style: at a station, or on the way to it. */
  at?: { station: number; status: 'at' | 'to' };
  label?: string;
  /** Car numbers in order, from VehiclePosition.multi_carriage_details. */
  carriages?: string[];
  stock?: string;
  cars?: number;
}

export interface RealtimeSource {
  /** Shown in the adapter name while data is fresh, e.g. 'OVapi GTFS-realtime'. */
  name: string;
  /** Called every poll by every adapter using the source; decide yourself whether to fetch (rate limits). */
  refresh(nowMs: number, sched: GtfsSchedule): Promise<void>;
  /** Fresh trips, or undefined when there is no usable realtime data (the adapter then shows the timetable). */
  trips(nowMs: number): RtTrip[] | undefined;
}

// ---------------------------------------------------------------------------
// Polite fetching: a token bucket and exponential backoff per host
// ---------------------------------------------------------------------------

interface HostState {
  tokens: number;
  refilled: number;
  pausedUntil: number;
  backoff: number;
  reason: string;
}
const hosts = new Map<string, HostState>();

/**
 * fetch() with a per-host request budget (perMinute, default 30) and backoff on HTTP 429/5xx (30 s doubling to
 * 10 min). Throws instead of calling while the host is paused or over budget; returns only ok responses.
 */
export async function politeFetch(url: string, init: RequestInit = {}, o: { perMinute?: number; timeoutMs?: number } = {}): Promise<Response> {
  const host = new URL(url).host;
  const perMinute = o.perMinute ?? 30;
  const now = Date.now();
  const h = hosts.get(host) ?? { tokens: Math.max(2, perMinute / 4), refilled: now, pausedUntil: 0, backoff: 0, reason: '' };
  hosts.set(host, h);
  h.tokens = Math.min(Math.max(2, perMinute / 4), h.tokens + ((now - h.refilled) / 60_000) * perMinute);
  h.refilled = now;
  if (now < h.pausedUntil) throw new Error(`${host} paused after ${h.reason}`);
  if (h.tokens < 1) throw new Error(`${host}: local rate limit`);
  h.tokens -= 1;
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(o.timeoutMs ?? 10_000) });
  if (res.status === 429 || res.status >= 500) {
    h.backoff = Math.min(600_000, Math.max(30_000, h.backoff * 2));
    h.pausedUntil = Date.now() + h.backoff;
    h.reason = `HTTP ${res.status}`;
    throw new Error(`${host}: HTTP ${res.status}, pausing ${h.backoff / 1000} s`);
  }
  if (!res.ok) throw new Error(`${host}: HTTP ${res.status}`);
  h.backoff = 0;
  return res;
}

// ---------------------------------------------------------------------------
// Minimal protobuf reader for GTFS-realtime
// ---------------------------------------------------------------------------

const utf8 = new TextDecoder();

class Reader {
  pos: number;
  constructor(
    readonly buf: Uint8Array,
    start = 0,
    readonly end = buf.length,
  ) {
    this.pos = start;
  }
  varint(): number {
    let x = 0, scale = 1, b: number;
    do {
      b = this.buf[this.pos++];
      x += (b & 0x7f) * scale;
      scale *= 128;
    } while (b & 0x80);
    return x;
  }
  /** int32 (negative values are 10-byte varints; the low 32 bits are the value). */
  int32(): number {
    let lo = 0, shift = 0, b: number;
    do {
      b = this.buf[this.pos++];
      if (shift < 32) lo |= (b & 0x7f) << shift;
      shift += 7;
    } while (b & 0x80);
    return lo | 0;
  }
  sub(): Reader {
    const len = this.varint();
    const r = new Reader(this.buf, this.pos, this.pos + len);
    this.pos += len;
    return r;
  }
  string(): string {
    const len = this.varint();
    const s = utf8.decode(this.buf.subarray(this.pos, this.pos + len));
    this.pos += len;
    return s;
  }
  skip(wire: number) {
    if (wire === 0) this.varint();
    else if (wire === 1) this.pos += 8;
    else if (wire === 2) {
      const len = this.varint(); // read before adding: `pos += varint()` would add to the old pos
      this.pos += len;
    }
    else if (wire === 5) this.pos += 4;
    else throw new Error(`protobuf wire type ${wire}`);
  }
  /** Iterate the fields of this message: calls f(field, wire) and skips whatever f didn't read. */
  fields(f: (field: number, wire: number) => void) {
    while (this.pos < this.end) {
      const tag = this.varint();
      const at = this.pos;
      f(tag >>> 3, tag & 7);
      if (this.pos === at) this.skip(tag & 7);
    }
  }
}

/** GTFS-RT TripDescriptor fields, as given to `tripKey`. */
export interface TripDescriptor {
  tripId: string;
  routeId: string;
  directionId?: number;
  /** 'HH:MM:SS', may pass 24:00. */
  startTime: string;
  /** YYYYMMDD (dashes some producers add are removed). */
  startDate: string;
  rel: number;
}

function tripDesc(r: Reader): TripDescriptor {
  const t: TripDescriptor = { tripId: '', routeId: '', startTime: '', startDate: '', rel: 0 };
  r.fields((f, w) => {
    if (w === 2 && f === 1) t.tripId = r.string();
    else if (w === 2 && f === 5) t.routeId = r.string();
    else if (w === 2 && f === 2) t.startTime = r.string();
    else if (w === 2 && f === 3) t.startDate = r.string().replace(/\D/g, '');
    else if (w === 0 && f === 4) t.rel = r.varint();
    else if (w === 0 && f === 6) t.directionId = r.varint();
  });
  return t;
}

function vehicleLabel(r: Reader): string | undefined {
  let label: string | undefined, id: string | undefined;
  r.fields((f, w) => {
    if (w === 2 && f === 2) label = r.string();
    else if (w === 2 && f === 1) id = r.string();
  });
  return label || id;
}

function stopEvent(r: Reader): { time?: number; delay?: number } {
  const e: { time?: number; delay?: number } = {};
  r.fields((f, w) => {
    if (w === 0 && f === 2) e.time = r.varint() || undefined;
    else if (w === 0 && f === 1) e.delay = r.int32();
  });
  return e;
}

export interface DecodeContext {
  /** Keep an entity? Called with its trip descriptor before anything else is decoded. */
  keep: (d: TripDescriptor) => boolean;
  station: (stopId: string) => number | undefined;
  line: (routeId: string) => string | undefined;
  /** Schedule trip key of a descriptor; default its trip_id. */
  key?: (d: TripDescriptor) => string | undefined;
}

/** Decode a GTFS-realtime FeedMessage (TripUpdates and/or VehiclePositions) into RtTrips. */
export function decodeFeed(buf: Uint8Array, ctx: DecodeContext): RtTrip[] {
  const out: RtTrip[] = [];
  const root = new Reader(buf);
  while (root.pos < root.end) {
    const tag = root.varint();
    if (tag >>> 3 !== 2 || (tag & 7) !== 2) {
      root.skip(tag & 7);
      continue;
    }
    const ent = root.sub();
    ent.fields((ef, ew) => {
      if (ew !== 2 || (ef !== 3 && ef !== 4)) return;
      const msg = ent.sub();
      if (ef === 3) {
        const tu = decodeTripUpdate(msg, ctx);
        if (tu) out.push(tu);
      } else {
        const vp = decodeVehicle(msg, ctx);
        if (vp) out.push(vp);
      }
    });
  }
  return out;
}

function describe(t: RtTrip, d: TripDescriptor, ctx: DecodeContext) {
  t.key = (ctx.key ? ctx.key(d) : d.tripId) || undefined;
  t.line = ctx.line(d.routeId);
  t.date = Number(d.startDate) || undefined;
}

function decodeTripUpdate(r: Reader, ctx: DecodeContext): RtTrip | null {
  let desc: TripDescriptor | null = null;
  let rejected = false;
  const t: RtTrip = {};
  const stops: RtStopTime[] = [];
  let firstDelay: number | undefined;
  r.fields((f, w) => {
    if (rejected) {
      r.pos = r.end;
      return;
    }
    if (f === 1 && w === 2) {
      desc = tripDesc(r.sub());
      if (!ctx.keep(desc)) rejected = true;
    } else if (f === 2 && w === 2) {
      const s = r.sub();
      let stopId = '', rel = 0;
      let arr: { time?: number; delay?: number } = {}, dep: { time?: number; delay?: number } = {};
      s.fields((sf, sw) => {
        if (sf === 4 && sw === 2) stopId = s.string();
        else if (sf === 2 && sw === 2) arr = stopEvent(s.sub());
        else if (sf === 3 && sw === 2) dep = stopEvent(s.sub());
        else if (sf === 5 && sw === 0) rel = s.varint();
      });
      firstDelay ??= arr.delay ?? dep.delay;
      const station = stopId ? ctx.station(stopId) : undefined;
      if (station == null) return;
      const u: RtStopTime = { station };
      if (arr.time) u.a = arr.time;
      else if (arr.delay != null) u.delayA = arr.delay;
      if (dep.time) u.d = dep.time;
      else if (dep.delay != null) u.delayD = dep.delay;
      if (rel === 1) u.skipped = true;
      stops.push(u);
    } else if (f === 3 && w === 2) t.label = vehicleLabel(r.sub());
    else if (f === 5 && w === 0) t.delay = r.int32();
  });
  const d = desc as TripDescriptor | null;
  if (rejected || !d) return null;
  describe(t, d, ctx);
  if (d.rel === 3 || d.rel === 7) t.cancelled = true;
  if (stops.some((s) => s.a || s.d || s.delayA != null || s.delayD != null || s.skipped)) t.stops = stops;
  else t.delay ??= firstDelay;
  return t;
}

function decodeVehicle(r: Reader, ctx: DecodeContext): RtTrip | null {
  let desc: TripDescriptor | null = null;
  let rejected = false;
  let stopId = '', status = 2;
  const t: RtTrip = {};
  const carriages: [number, string][] = [];
  r.fields((f, w) => {
    if (rejected) {
      r.pos = r.end;
      return;
    }
    if (f === 1 && w === 2) {
      desc = tripDesc(r.sub());
      if (!ctx.keep(desc)) rejected = true;
    } else if (f === 7 && w === 2) stopId = r.string();
    else if (f === 4 && w === 0) status = r.varint();
    else if (f === 8 && w === 2) t.label = vehicleLabel(r.sub());
    else if (f === 18 && w === 2) {
      // CarriageDetails: id 1, label 2, carriage_sequence 5.
      const c = r.sub();
      let id = '', label = '', seq = carriages.length + 1;
      c.fields((cf, cw) => {
        if (cf === 1 && cw === 2) id = c.string();
        else if (cf === 2 && cw === 2) label = c.string();
        else if (cf === 5 && cw === 0) seq = c.varint();
      });
      if (label || id) carriages.push([seq, label || id]);
    }
  });
  const d = desc as TripDescriptor | null;
  if (rejected || !d) return null;
  describe(t, d, ctx);
  if (carriages.length) t.carriages = carriages.sort((a, b) => a[0] - b[0]).map((c) => c[1]);
  const station = stopId ? ctx.station(stopId) : undefined;
  if (station != null) t.at = { station, status: status === 1 ? 'at' : 'to' };
  return t;
}

// ---------------------------------------------------------------------------
// GTFS-realtime source
// ---------------------------------------------------------------------------

export interface GtfsRealtimeOptions {
  name: string;
  tripUpdates?: string;
  vehiclePositions?: string;
  headers?: Record<string, string>;
  /** Minimum time between fetches, ms. Default 30 s. */
  everyMs?: number;
  /** Request budget per minute for the feed's host. Default 20. */
  perMinute?: number;
  /** Cheap pre-filter on route_id / trip_id while decoding. Routes of the schedule are always required. */
  filter?: (routeId: string, tripId: string) => boolean;
  /** Data older than this is ignored, ms. Default 5 min. */
  staleMs?: number;
  /** For cities built from several feeds: the FeedConfig id this realtime feed belongs to. */
  feed?: string;
  /**
   * Schedule trip key of a realtime trip, for feeds without usable trip_ids (pair it with the build's `trips.rtKey`,
   * e.g. `${route_id}|${direction_id}|${start time}`). Default: trip_id.
   */
  tripKey?: (d: TripDescriptor) => string | undefined;
}

/** Realtime feed URLs in use, so checks can serve synthetic data for them (see scripts/lib/gtfs/check.ts). */
export const realtimeUrls = new Map<string, 'tripUpdates' | 'vehiclePositions'>();

const UA = 'TinyTrains/0.1 (live transit diorama; https://tinytrains.app)';

export function gtfsRealtime(o: GtfsRealtimeOptions): RealtimeSource {
  if (o.tripUpdates) realtimeUrls.set(o.tripUpdates, 'tripUpdates');
  if (o.vehiclePositions) realtimeUrls.set(o.vehiclePositions, 'vehiclePositions');
  let data: RtTrip[] = [];
  let at = 0;
  let last = 0;
  let inflight: Promise<void> | undefined;

  async function load(url: string, sched: GtfsSchedule): Promise<RtTrip[]> {
    const res = await politeFetch(url, { headers: { 'user-agent': UA, accept: 'application/x-protobuf', ...o.headers } }, { perMinute: o.perMinute ?? 20 });
    const buf = new Uint8Array(await res.arrayBuffer());
    const ns = (id: string) => (o.feed ? `${o.feed}|${id}` : id);
    const route = (id: string) => sched.data.routes[ns(id)] ?? sched.data.routes[id];
    const key = (d: TripDescriptor) => (o.tripKey ? o.tripKey(d) : d.tripId);
    return decodeFeed(buf, {
      keep: (d) => {
        if (o.filter && !o.filter(d.routeId, d.tripId)) return false;
        if (route(d.routeId) != null) return true;
        const k = key(d);
        return !!k && sched.rowOfKey(k) != null;
      },
      station: (stopId) => sched.station(ns(stopId)) ?? sched.station(stopId),
      line: (routeId) => (route(routeId) != null ? sched.data.lines[route(routeId)].id : undefined),
      key,
    });
  }

  async function fetchAll(nowMs: number, sched: GtfsSchedule) {
    const [tu, vp] = await Promise.allSettled([o.tripUpdates ? load(o.tripUpdates, sched) : Promise.resolve([]), o.vehiclePositions ? load(o.vehiclePositions, sched) : Promise.resolve([])]);
    for (const r of [tu, vp]) if (r.status === 'rejected') console.warn(`[${o.name}] ${r.reason instanceof Error ? r.reason.message : r.reason}`);
    if (tu.status === 'rejected' && vp.status === 'rejected') return;
    const trips = tu.status === 'fulfilled' ? tu.value : [];
    // Vehicle positions add a current position and label to the trip update with the same key, or stand alone.
    const byKey = new Map(trips.filter((t) => t.key).map((t) => [t.key!, t]));
    for (const v of vp.status === 'fulfilled' ? vp.value : []) {
      const hit = v.key ? byKey.get(v.key) : undefined;
      if (hit) {
        hit.at ??= v.at;
        hit.label ??= v.label;
        hit.carriages ??= v.carriages;
      } else trips.push(v);
    }
    data = trips;
    at = nowMs;
  }

  return {
    name: o.name,
    async refresh(nowMs, sched) {
      if (inflight) return inflight;
      if (nowMs - last < (o.everyMs ?? 30_000) && nowMs >= last) return;
      last = nowMs;
      inflight = fetchAll(nowMs, sched).finally(() => (inflight = undefined));
      return inflight;
    },
    trips(nowMs) {
      return at && Math.abs(nowMs - at) < (o.staleMs ?? 300_000) && data.length ? data : undefined;
    },
  };
}

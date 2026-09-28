import type { TimelineStop, TrainState } from '../../../shared/types.ts';
import type { Adapter, AdapterFactory } from '../types.ts';
import { pickFleet } from './fleet.ts';
import { Network, routeLine, TRIP_RE, type StaticTrip } from './network.ts';
import { decodeFeed, type RtFeed, type RtTripUpdate, type RtVehicle } from './rt.ts';

const BASE = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2F';
const FEEDS = ['gtfs', 'gtfs-ace', 'gtfs-bdfm', 'gtfs-g', 'gtfs-jz', 'gtfs-nqrw', 'gtfs-l', 'gtfs-si'];
const MAX_UPCOMING = 15;
const DWELL = 30;
/** Speed that sets how much of a hop's time may go to dwelling, m/s. */
const MAX_AVG_SPEED = 18;
/** Fastest a train may cover a hop, or catch up with a revised prediction, m/s. */
const MAX_SPEED = 22;
const STOPPED_AT = 1;
/** Show a train waiting at its origin only this close to departure. */
const ORIGIN_WINDOW = 120;

export interface NycStats {
  feeds: number;
  failedFeeds: string[];
  updates: number;
  notStarted: number;
  finished: number;
  stale: number;
  unknownLine: Set<string>;
  unknownStop: Set<string>;
  matched: number;
  noPrev: number;
  gapsFilled: number;
  gapsLeft: number;
  held: number;
}

interface Memory {
  train: TrainState;
  complete: boolean;
  seen: number;
  gen: number;
}

type Where =
  | { kind: 'dwell'; s: string; a: number; d: number }
  | { kind: 'run'; from: string; to: string; f: number; d: number; a: number };

/** Where a timeline puts the train at time t (null when t is outside it). */
function where(stops: TimelineStop[], t: number): Where | null {
  for (let i = 0; i < stops.length; i++) {
    const st = stops[i];
    if (t < st.a) {
      if (i === 0) return null;
      const p = stops[i - 1];
      return { kind: 'run', from: p.s, to: st.s, f: Math.max(0, (t - p.d) / Math.max(1, st.a - p.d)), d: p.d, a: st.a };
    }
    if (t <= st.d) return { kind: 'dwell', s: st.s, a: st.a, d: st.d };
  }
  return null;
}

function monotonic(stops: TimelineStop[]) {
  for (let i = 0; i < stops.length; i++) {
    if (i > 0) stops[i].a = Math.max(stops[i].a, stops[i - 1].d);
    stops[i].d = Math.max(stops[i].d, stops[i].a);
  }
}

/**
 * Keep the train where the previous timeline put it at `now`, so a revised prediction changes its
 * speed instead of making it jump. `len(a, b)` gives the track length between two stops.
 */
function reconcile(old: TimelineStop[], fresh: TimelineStop[], now: number, len: (a: string, b: string) => number): TimelineStop[] {
  const loc = where(old, now);
  if (!loc) return fresh;
  let out: TimelineStop[];
  if (loc.kind === 'run') {
    const rest = Math.max(3, ((1 - loc.f) * len(loc.from, loc.to)) / MAX_SPEED);
    let j = fresh.findIndex((s, i) => s.s === loc.from && fresh[i + 1]?.s === loc.to);
    if (j < 0 && fresh[1]?.s === loc.to) {
      // Same next stop, different guess for the previous one: keep ours.
      fresh = [{ s: loc.from, a: loc.d, d: loc.d }, ...fresh.slice(1)];
      j = 0;
    }
    if (j >= 0) {
      out = fresh.slice(j).map((s) => ({ ...s }));
      if (loc.f > 0.9) {
        // Nearly there: finish this hop on the old timing and let the next stops absorb the change.
        out[0].d = loc.d;
        out[1].a = loc.a;
      } else {
        out[1].a = Math.round(Math.max(out[1].a, now + rest));
        out[0].d = Math.round(now - (loc.f * (out[1].a - now)) / (1 - loc.f));
      }
    } else if (fresh[0].s === loc.to) {
      // The feed has the train at loc.to already: finish the hop at top speed.
      out = [{ s: loc.from, a: loc.d, d: loc.d }, ...fresh.map((s) => ({ ...s }))];
      out[1].a = Math.round(Math.min(loc.a, now + rest));
      const f = Math.min(loc.f, 0.97);
      out[0].d = Math.round(now - (f * (out[1].a - now)) / (1 - f));
    } else return fresh;
    out[0].a = Math.min(out[0].a, out[0].d);
  } else {
    const j = fresh.findIndex((s) => s.s === loc.s);
    if (j >= 0) {
      out = fresh.slice(j).map((s) => ({ ...s }));
      out[0].a = Math.min(out[0].a, loc.a, now);
      // Feed still has it approaching: hold here. Feed has it gone: leave now.
      out[0].d = Math.max(out[0].d, j > 0 ? now + 1 : now);
      if (out[1]) out[1].a = Math.max(out[1].a, Math.round(out[0].d + len(out[0].s, out[1].s) / MAX_SPEED));
    } else if (len(loc.s, fresh[0].s) > 0) {
      // The feed has the train at the next stop already: leave now at top speed.
      out = [{ s: loc.s, a: loc.a, d: now }, ...fresh.map((s) => ({ ...s }))];
      out[1].a = Math.round(Math.max(Math.min(out[1].a, now + 60), now + len(loc.s, out[1].s) / MAX_SPEED));
    } else return fresh;
  }
  monotonic(out);
  return out;
}

export class NycAdapter implements Adapter {
  readonly id = 'nyc-subway';
  readonly city = 'nyc' as const;
  readonly name = 'MTA Subway & SIR · GTFS-realtime';
  readonly live = true;
  readonly intervalMs = 15_000;

  net = new Network();
  stats!: NycStats;
  private lastGood = new Map<string, { feed: RtFeed; at: number }>();
  private memory = new Map<string, Memory>();

  private async fetchFeeds(now: number): Promise<RtFeed[]> {
    const failed: string[] = [];
    const feeds = await Promise.all(
      FEEDS.map(async (name) => {
        try {
          const res = await fetch(BASE + name, { signal: AbortSignal.timeout(10_000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const feed = decodeFeed(new Uint8Array(await res.arrayBuffer()));
          // The MTA occasionally serves a stale or near-empty snapshot with HTTP 200. Treat a feed
          // that went backwards in time, or whose trip count collapsed, as a failed fetch.
          const prev = this.lastGood.get(name);
          if (prev && now - prev.at < 120_000) {
            const older = feed.timestamp > 0 && prev.feed.timestamp > 0 && feed.timestamp < prev.feed.timestamp;
            const collapsed = prev.feed.updates.length >= 10 && feed.updates.length < prev.feed.updates.length * 0.4;
            if (older || collapsed) throw new Error('suspect snapshot');
          }
          this.lastGood.set(name, { feed, at: now });
          return feed;
        } catch {
          failed.push(name);
          const last = this.lastGood.get(name);
          return last && now - last.at < 120_000 ? last.feed : null;
        }
      }),
    );
    if (failed.length === FEEDS.length && !feeds.some(Boolean)) throw new Error('all MTA feeds failed');
    this.stats.failedFeeds = failed;
    return feeds.filter((f): f is RtFeed => !!f);
  }

  async poll(nowMs: number): Promise<TrainState[]> {
    this.stats = {
      feeds: 0, failedFeeds: [], updates: 0, notStarted: 0, finished: 0, stale: 0,
      unknownLine: new Set(), unknownStop: new Set(), matched: 0, noPrev: 0, gapsFilled: 0, gapsLeft: 0, held: 0,
    };
    const feeds = await this.fetchFeeds(nowMs);
    const now = Math.round(nowMs / 1000);
    this.stats.feeds = feeds.length;
    const trains: TrainState[] = [];
    const seen = new Set<string>();
    for (const feed of feeds) {
      const vehicles = new Map(feed.vehicles.map((v) => [v.trip.tripId, v]));
      for (const u of feed.updates) {
        this.stats.updates++;
        const built = this.build(u, vehicles.get(u.trip.tripId), now);
        if (!built) continue;
        const { train, complete } = built;
        const key = train.id;
        if (seen.has(key)) continue;
        seen.add(key);
        const prev = this.memory.get(key);
        let gen = prev?.gen ?? 0;
        if (prev) {
          // A trip id that reappears somewhere unrelated becomes a new train rather than a teleport.
          if (train.stops.some((s) => prev.train.stops.some((o) => o.s === s.s))) {
            train.stops = reconcile(prev.train.stops, train.stops, now, (a, b) => this.net.segLength(a, b));
            this.fillGaps(train);
          } else gen++;
        }
        if (gen) train.id = `${key}~${gen}`;
        this.memory.set(key, { train, complete, seen: now, gen });
        trains.push(train);
      }
    }
    // Trips that just dropped out of the feed (usually on arrival): finish their last timeline.
    for (const [id, m] of this.memory) {
      if (seen.has(id)) continue;
      const stops = m.train.stops;
      const last = stops[stops.length - 1];
      if (m.complete) last.d = Math.max(last.d, last.a + 45);
      const loc = where(stops, now);
      if (!loc || now - m.seen > 120) {
        this.memory.delete(id);
        continue;
      }
      const i = stops.findIndex((s) => s.s === (loc.kind === 'run' ? loc.from : loc.s));
      trains.push({ ...m.train, stops: stops.slice(Math.max(0, i)) });
      this.stats.held++;
    }
    return trains;
  }

  private build(u: RtTripUpdate, v: RtVehicle | undefined, now: number): { train: TrainState; complete: boolean } | null {
    const line = routeLine(u.trip.routeId ?? '');
    if (!this.net.lines.has(line)) {
      this.stats.unknownLine.add(u.trip.routeId ?? '?');
      return null;
    }
    // IRT trains waiting at their origin have no vehicle yet, only an assigned trip with a departure time.
    const first = u.stops[0];
    if (!v && u.trip.assigned && first && first.arr === undefined && first.dep !== undefined && first.dep - now < ORIGIN_WINDOW) {
      v = { trip: u.trip, status: STOPPED_AT, stopId: first.stopId, timestamp: now, seq: 1 };
    }
    // Trips that have not left their origin carry no vehicle (IRT) or a placeholder one (B Division, SIR).
    const vts = v?.timestamp ?? 0;
    if (!v || (v.seq === undefined && v.status !== STOPPED_AT) || vts > now + 5) {
      this.stats.notStarted++;
      return null;
    }
    if (now - vts > 1800) {
      this.stats.stale++;
      return null;
    }

    // Raw timeline from the stop time updates.
    const raw: (TimelineStop & { t: number; fixed?: boolean })[] = [];
    for (const st of u.stops) {
      const s = st.stopId.replace(/[NS]$/, '');
      const t = st.arr ?? st.dep;
      if (t === undefined) continue;
      if (!this.net.stations.has(s)) {
        this.stats.unknownStop.add(st.stopId);
        continue;
      }
      const last = raw[raw.length - 1];
      if (last?.s === s) {
        last.d = Math.max(last.d, st.dep ?? t);
        continue;
      }
      raw.push({ s, a: t, d: st.dep ?? t, t, fixed: st.arr === undefined });
    }
    if (!raw.length) return null;
    // Some trips (SIR into St George) carry the next departure as the final stop's time.
    const n = raw.length;
    if (n > 1) {
      const run = this.net.runTime(raw[n - 2].s, raw[n - 1].s);
      if (raw[n - 1].t - raw[n - 2].t > 3 * run + 120) raw[n - 1].t = raw[n - 1].a = raw[n - 1].d = raw[n - 2].t + run;
    }
    // Feeds give one time per stop: split a dwell around it, leaving enough running time for the hop.
    const slack = (i: number) => raw[i + 1].t - raw[i].t - this.net.distance(raw[i].s, raw[i + 1].s) / MAX_AVG_SPEED;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i].d > raw[i].a || raw[i].fixed) continue;
      const before = i > 0 ? slack(i - 1) / 2 : Infinity;
      const after = i + 1 < raw.length ? slack(i) / 2 : Infinity;
      const half = Math.max(0, Math.min(DWELL / 2, before, after));
      raw[i].a = raw[i].t - half;
      raw[i].d = raw[i].t + half;
    }
    for (let i = 1; i < raw.length; i++) {
      const late = raw[i - 1].d + this.net.distance(raw[i - 1].s, raw[i].s) / MAX_SPEED - raw[i].a;
      if (late > 0) {
        raw[i].a += late;
        raw[i].d += late;
      }
    }
    monotonic(raw);

    const m = u.trip.tripId.match(TRIP_RE);
    const dir = m?.[3] ?? u.stops[0]?.stopId.slice(-1) ?? 'N';
    const date = u.trip.startDate ?? '';
    const sched = date ? this.net.matchTrip(u.trip.tripId, date, u.trip.routeId ?? '', raw.map((r) => r.s)) : undefined;
    if (sched) this.stats.matched++;

    let stops: TimelineStop[];
    let k = -1;
    for (let i = 0; i < raw.length; i++) if (raw[i].a <= now) k = i;
    const vStop = v.stopId?.replace(/[NS]$/, '');
    const atOrigin = sched ? sched.stops[0] === raw[0].s : v.seq === 1;

    if (k >= 0) {
      if (raw[k].d < now && k === raw.length - 1) {
        this.stats.finished++;
        return null;
      }
      stops = raw.slice(k);
    } else if (v.status === STOPPED_AT && vStop === raw[0].s && (atOrigin || now - vts < 60)) {
      if (atOrigin && raw[0].d - now > ORIGIN_WINDOW) {
        this.stats.notStarted++;
        return null;
      }
      stops = raw.map((s) => ({ ...s }));
      stops[0].a = Math.min(stops[0].a, now);
    } else {
      const prev = this.previousStop(line, dir, raw[0].s, raw[1]?.s, sched);
      if (!prev || atOrigin) {
        if (!prev) this.stats.noPrev++;
        this.stats.notStarted++;
        return null;
      }
      const run = this.runTime(prev, raw[0].s, sched);
      if (raw.length === 1 && v.status === STOPPED_AT && vStop === prev && raw[0].a - vts > 3 * run + 120) {
        // Last seen one stop short of the terminal long ago, with the next trip's time as its arrival.
        this.stats.finished++;
        return null;
      }
      let dep = raw[0].a - run;
      // IRT vehicles in transit report when they left the previous stop.
      if (v.status !== STOPPED_AT && vStop === raw[0].s && vts <= now && Math.abs(raw[0].a - vts - run) < run * 0.5) dep = vts;
      if (v.status === STOPPED_AT && vStop === prev && dep > now) {
        stops = [{ s: prev, a: Math.min(vts, now), d: dep }, ...raw]; // held at the platform
      } else {
        if (v.status === STOPPED_AT && vStop === prev) dep = Math.max(dep, vts);
        dep = Math.min(dep, now - 1);
        stops = [{ s: prev, a: dep - 20, d: dep }, ...raw];
      }
    }

    const complete = stops.length <= MAX_UPCOMING + 1;
    stops = stops.slice(0, MAX_UPCOMING + 1).map(({ s, a, d }) => ({ s, a: Math.round(a), d: Math.round(d) }));

    // Delay only from an exact schedule match, and only when the next few stops agree on it.
    let delay: number | undefined;
    if (sched?.exact) {
      const d = raw
        .filter((r) => r.t >= now - 60)
        .slice(0, 3)
        .map((r) => r.t - sched.arr[sched.stops.indexOf(r.s)])
        .sort((x, y) => x - y);
      if (d.length && d[d.length - 1] - d[0] <= 90 && d[0] >= -120 && d[d.length - 1] <= 1800) delay = Math.round(d[Math.floor(d.length / 2)]);
    }

    const fleet = pickFleet(line, u.trip.tripId);
    const dest = this.net.stations.get(raw[raw.length - 1].s)!.name;
    const train: TrainState = {
      id: `${date}-${u.trip.tripId}`,
      line,
      dest,
      dir: this.dirLabel(stops, dir, raw[raw.length - 1].s),
      service: /X$/.test(u.trip.routeId ?? '') ? 'Express' : undefined,
      stock: fleet.stock,
      cars: fleet.cars,
      live: true,
      delay,
      label: u.trip.trainId?.trim().replace(/\s+/g, ' '),
      stops,
    };
    if (!train.service) delete train.service;
    if (train.delay === undefined) delete train.delay;
    this.fillGaps(train);
    return { train, complete };
  }

  private previousStop(line: string, dir: string, stop: string, next: string | undefined, sched?: StaticTrip) {
    if (sched) {
      const i = sched.stops.indexOf(stop);
      if (i > 0 && this.net.connected(sched.stops[i - 1], stop)) return sched.stops[i - 1];
      if (i === 0) return undefined;
    }
    return this.net.predecessor(line, dir, stop, next);
  }

  private runTime(prev: string, stop: string, sched?: StaticTrip): number {
    if (sched) {
      const i = sched.stops.indexOf(stop);
      if (i > 0 && sched.stops[i - 1] === prev) return Math.max(30, sched.arr[i] - sched.dep[i - 1]);
    }
    return this.net.runTime(prev, stop);
  }

  private dirLabel(stops: TimelineStop[], dir: string, dest: string): string {
    // Terminal platforms carry the label of the next departure, so skip the destination.
    for (const st of stops) {
      if (st.s === dest) continue;
      const l = this.net.label(st.s, dir);
      if (l && l !== 'Last Stop') return l;
    }
    return dir === 'N' ? 'Northbound' : 'Southbound';
  }

  /** Insert pass-through stops where two consecutive stops have no direct segment (reroutes, skipped stations). */
  private fillGaps(train: TrainState) {
    const out: TimelineStop[] = [train.stops[0]];
    for (let i = 1; i < train.stops.length; i++) {
      const a = out[out.length - 1];
      const b = train.stops[i];
      if (!this.net.connected(a.s, b.s)) {
        const path = this.net.path(a.s, b.s, train.line);
        if (path) {
          this.stats.gapsFilled++;
          const lens = path.slice(1).map((s, j) => this.net.segLength(path[j], s));
          const total = lens.reduce((x, y) => x + y, 0) || 1;
          let acc = 0;
          for (let j = 1; j < path.length - 1; j++) {
            acc += lens[j - 1];
            const t = Math.round(a.d + ((b.a - a.d) * acc) / total);
            out.push({ s: path[j], a: t, d: t });
          }
        } else this.stats.gapsLeft++;
      }
      out.push(b);
    }
    train.stops = out;
  }
}

export const createAdapters: AdapterFactory = () => [new NycAdapter()];

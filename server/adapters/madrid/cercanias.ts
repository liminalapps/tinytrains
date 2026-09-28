// Renfe Cercanías Madrid: GTFS-realtime vehicle positions and next-stop predictions laid over Renfe's timetable.
// Renfe's feeds are keyless and nationwide; a train is placed from its GPS position along its own stop pattern.
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { makeProjection } from '../../../shared/geo.ts';
import type { Flat, TrainState, TransitData } from '../../../shared/types.ts';
import { readJson } from '../../data.ts';
import type { Adapter } from '../types.ts';
import { fleetFor } from './lines.ts';
import { activeTrips, loadSchedule, memoFor, stabilize, windowTimeline, type ActiveTrip, type TrainMemo } from './schedule.ts';

const TU_URL = 'https://gtfsrt.renfe.com/trip_updates.pb';
const VP_URL = 'https://gtfsrt.renfe.com/vehicle_positions.pb';
const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;
const STOPPED_AT = 1;

interface RtTrain {
  svc: string; // Renfe service id, one per day ('1066V')
  num: string; // train number
  x?: number; // GPS position, local meters
  y?: number;
  at?: string; // station the vehicle reports
  stopped: boolean;
  next?: { station: string; t: number }; // predicted arrival at the next stop
}

/** Renfe trip ids are service id + train number + line: '1066V20522C4b'. */
const TRIP_ID = /^(\d+[A-Z])(\d+)(C\d+[a-z]?)$/;

export function cercaniasAdapter(): Adapter {
  const sched = loadSchedule('cercanias');
  const net = readJson<TransitData>('public/data/madrid/transit.json');
  const { project } = makeProjection('madrid');
  const stationXY = new Map(net.stations.map((s) => [s.id, [s.x, s.y] as const]));
  const segs = new Map<string, { pts: Flat; lines: string[]; rev: boolean }[]>();
  for (const s of net.segments) {
    if (!s.from.startsWith('c:')) continue;
    for (const [a, b, rev] of [[s.from, s.to, false], [s.to, s.from, true]] as const) segs.set(`${a}|${b}`, [...(segs.get(`${a}|${b}`) ?? []), { pts: s.pts, lines: s.lines, rev }]);
  }
  const memo = new Map<string, TrainMemo & { last?: { train: TrainState; st: string[]; times: number[]; from: number } }>();
  let rt = new Map<string, RtTrain>();
  let rtAt = 0;
  let retryAt = 0;
  let failures = 0;

  async function fetchFeed(url: string) {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return FeedMessage.decode(new Uint8Array(await res.arrayBuffer()));
  }

  async function refreshRealtime(now: number) {
    if (now < retryAt) return;
    try {
      const [tu, vp] = await Promise.all([fetchFeed(TU_URL), fetchFeed(VP_URL)]);
      const next = new Map<string, RtTrain>();
      const get = (tripId: string) => {
        const m = TRIP_ID.exec(tripId);
        if (!m || !m[1].startsWith('10')) return undefined;
        let t = next.get(tripId);
        if (!t) next.set(tripId, (t = { svc: m[1], num: m[2], stopped: false }));
        return t;
      };
      for (const e of vp.entity) {
        const v = e.vehicle;
        const t = v?.trip?.tripId && get(v.trip.tripId);
        if (!t || !v?.position) continue;
        [t.x, t.y] = project(v.position.longitude, v.position.latitude);
        t.at = sched.stopMap[v.stopId ?? ''];
        t.stopped = v.currentStatus === STOPPED_AT;
      }
      for (const e of tu.entity) {
        const u = e.tripUpdate;
        const t = u?.trip?.tripId && get(u.trip.tripId);
        const st = u?.stopTimeUpdate?.[0];
        const station = sched.stopMap[st?.stopId ?? ''];
        let time = Number(st?.arrival?.time ?? st?.departure?.time ?? 0);
        // Around midnight the feed dates predictions a day late (with a matching -86400 s delay).
        if (time) time -= Math.round((time - now) / 86400) * 86400;
        if (t && station && time) t.next = { station, t: time };
      }
      rt = next;
      rtAt = now;
      failures = 0;
    } catch (err) {
      failures++;
      retryAt = now + Math.min(600, 15 * 2 ** failures);
      console.warn(`[madrid-cercanias] realtime: ${err instanceof Error ? err.message : err}`);
    }
  }

  /** Distance from a point to the track between two stations, and how far along it (0..1) the nearest point lies. */
  function onSegment(a: string, b: string, line: string, x: number, y: number): { d: number; f: number } {
    const list = segs.get(`${a}|${b}`);
    const seg = list?.find((s) => s.lines.includes(line)) ?? list?.[0];
    const pa = stationXY.get(a)!, pb = stationXY.get(b)!;
    const pts = seg ? seg.pts : [pa[0], pa[1], pb[0], pb[1]];
    let best = Infinity, at = 0, total = 0;
    for (let i = 2; i < pts.length; i += 2) {
      const ax = pts[i - 2], ay = pts[i - 1], dx = pts[i] - ax, dy = pts[i + 1] - ay, len = Math.hypot(dx, dy);
      const t = len ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (len * len))) : 0;
      const d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
      if (d < best) (best = d), (at = total + t * len);
      total += len;
    }
    const f = total ? at / total : 0;
    return { d: best, f: seg?.rev ? 1 - f : f };
  }

  /**
   * Timeline of a train from its realtime state: dwelling at stop k, or running from k to k + 1 with fraction f of the
   * track behind it. Later stops keep their scheduled run times, shifted by the resulting delay.
   */
  function liveTimes(t: ActiveTrip, r: RtTrain, now: number): { times: number[]; from: number; delay: number } | null {
    const st = t.pat.st, sch = t.times, n = st.length;
    let k = -1, f = 0, dwelling = false;
    if (r.x != null && r.y != null) {
      let best = 900;
      for (let i = 0; i < n; i++) {
        const p = stationXY.get(st[i])!;
        const d = Math.hypot(p[0] - r.x, p[1] - r.y);
        if (d < Math.min(best, r.stopped ? 400 : 120)) (best = d), (k = i), (dwelling = true);
      }
      for (let i = 0; i + 1 < n && !dwelling; i++) {
        const s = onSegment(st[i], st[i + 1], t.pat.line, r.x, r.y);
        if (s.d < best) (best = s.d), (k = i), (f = s.f);
      }
      if (k < 0) return null; // somewhere outside this stretch of its route
      // Before the first or past the last station of this stretch: not inside the diorama (yet).
      if (!dwelling && best > 150 && ((k === 0 && f < 0.01) || (k === n - 2 && f > 0.99))) return null;
      if (!dwelling && f > 0.97 && k + 1 < n) (k = k + 1), (dwelling = true);
    }
    const ni = r.next ? st.indexOf(r.next.station) : -1;
    const tu = ni >= 0 && r.next!.t > now - 60 && Math.abs(r.next!.t - sch[2 * ni]) < 3 * 3600 ? { i: ni, t: r.next!.t } : null;
    if (k < 0) {
      // No position: the train is somewhere before its predicted next stop.
      if (!tu || tu.i === 0) return null;
      k = tu.i - 1;
      const run = Math.max(30, sch[2 * tu.i] - sch[2 * k + 1]);
      f = Math.max(0, Math.min(0.95, 1 - (tu.t - now) / run));
    }
    const times = sch.slice();
    let shift: number;
    if (dwelling) {
      const late = tu && tu.i > k ? tu.t - sch[2 * tu.i] : Math.max(0, now - sch[2 * k + 1]);
      times[2 * k + 1] = Math.max(now + 5, sch[2 * k + 1] + late);
      times[2 * k] = Math.min(now, times[2 * k + 1]);
      shift = times[2 * k + 1] - sch[2 * k + 1];
    } else {
      const run = Math.max(30, sch[2 * k + 2] - sch[2 * k + 1]);
      let arrive = now + (1 - f) * run;
      // Trust the prediction for the stop ahead when it roughly agrees with the position.
      if (tu && tu.i === k + 1 && tu.t > now + 5 && Math.abs(tu.t - arrive) < 0.6 * run + 60) arrive = tu.t;
      times[2 * k + 1] = Math.min(now - 1, now - (f / Math.max(0.05, 1 - f)) * (arrive - now));
      times[2 * k] = Math.min(times[2 * k], times[2 * k + 1]);
      times[2 * k + 2] = arrive;
      times[2 * k + 3] = arrive + (sch[2 * k + 3] - sch[2 * k + 2]);
      shift = arrive - sch[2 * k + 2];
    }
    for (let i = 2 * k + (dwelling ? 2 : 4); i < 2 * n; i++) times[i] = sch[i] + shift;
    return { times, from: k, delay: Math.round(shift) };
  }

  async function poll(nowMs: number): Promise<TrainState[]> {
    const now = nowMs / 1000;
    await refreshRealtime(now);
    const active = activeTrips(sched, 'c', now, 5400, 1800);
    const scheduled = active.map((t) => ({ t, stops: windowTimeline(t.pat.st, t.times, now) })).filter((x) => x.stops);
    // A feed that is stale, or empty while the timetable has trains out, doesn't count.
    const fresh = now - rtAt < 180 && (rt.size > 0 || scheduled.length < 5);
    const byNum = new Map<string, ActiveTrip[]>();
    for (const t of active) {
      const k = t.row[5].split(/[~#]/)[0];
      byNum.set(k, [...(byNum.get(k) ?? []), t]);
    }
    const trains: TrainState[] = [];
    const done = new Set<string>();
    if (fresh) {
      for (const r of rt.values()) {
        // The run of this train number nearest in time: after midnight the feed names the new day's service even for
        // trains of the previous evening. Among that run's pieces inside the diorama, take the one the train is on.
        const named = sched.services[r.svc];
        const off = (t: ActiveTrip) => Math.max(0, t.times[0] - 600 - now, now - t.times[t.times.length - 1] - 3600) - (t.ymd === named ? 1 : 0);
        const cands = (byNum.get(r.num) ?? []).sort((a, b) => off(a) - off(b));
        const ymd = cands[0] && off(cands[0]) < 3 * 3600 ? cands[0].ymd : -1;
        for (const t of cands) {
          if (t.ymd !== ymd) continue;
          if (done.has(t.id)) continue;
          const live = liveTimes(t, r, now);
          if (!live) continue;
          const m = memoFor(memo, t.id, now, t.pat.st);
          const stops = stabilize(m, t.pat.st, live.times, live.from, now);
          if (!stops) continue;
          done.add(t.id);
          const train: TrainState = { id: t.id, line: t.pat.line, dest: sched.heads[t.row[3]], dir: t.pat.dn, live: true, delay: live.delay, label: `Train ${r.num}`, stops, ...fleetFor(t.pat.line, undefined, t.id) };
          m.last = { train, st: t.pat.st, times: live.times, from: m.prev!.k };
          trains.push(train);
          break;
        }
      }
    }
    // A train that drops out of the feed for a while coasts on its last timeline until it would have arrived.
    for (const [id, m] of fresh ? memo : []) {
      if (done.has(id) || !m.last || now - m.seen > 300) continue;
      const stops = windowTimeline(m.last.st, m.last.times, now, m.last.from);
      if (stops) trains.push({ ...m.last.train, stops });
    }
    // Without a realtime feed, every train runs on the timetable.
    if (!fresh) {
      for (const { t, stops } of scheduled) {
        if (!stops) continue;
        trains.push({ id: t.id, line: t.pat.line, dest: sched.heads[t.row[3]], dir: t.pat.dn, live: false, label: `Train ${t.row[5].split(/[~#]/)[0]}`, stops, ...fleetFor(t.pat.line, undefined, t.id) });
      }
    }
    for (const [id, m] of memo) if (now - m.seen > 900) memo.delete(id);
    return trains;
  }

  return { id: 'madrid-cercanias', city: 'madrid', name: 'Renfe Cercanías · GTFS-realtime', live: true, intervalMs: 30_000, poll };
}

// Philadelphia: SEPTA Metro, trolleys, Regional Rail and PATCO from their timetables (GTFS kit), with SEPTA's keyless
// realtime on top: GTFS-realtime for the trolleys and the M, TrainView for Regional Rail. The L, the B and PATCO
// publish no realtime positions, so they run from the timetable.
import { gtfsAdapters, gtfsRealtime, politeFetch, type RealtimeSource, type RtTrip } from '../gtfs/index.ts';
import type { AdapterFactory } from '../types.ts';

const TROLLEY_ROUTES = new Set(['T1', 'T2', 'T3', 'T4', 'T5', 'G1', 'D1', 'D2', 'M1']);
const RR_PREFIXES = ['AIR', 'CHE', 'CHW', 'CYN', 'FOX', 'LAN', 'MED', 'NOR', 'PAO', 'TRE', 'WAR', 'WIL', 'WTR'];
const UA = 'TinyTrains/0.1 (live transit diorama; https://tinytrains.app)';

/** Trolley stock from the fleet number SEPTA puts in the vehicle label. */
export function trolleyConsist(line: string, label: string): { stock?: string; cars?: number } {
  const n = Number(label);
  if (!n) return {};
  if (line === 'g') return { stock: n >= 2320 && n <= 2337 ? 'philadelphia-pcc3' : 'philadelphia-bus', cars: 1 };
  if (line.startsWith('t')) return { stock: n >= 9000 && n < 9200 ? 'philadelphia-klrv' : 'philadelphia-bus', cars: 1 };
  if (line.startsWith('d')) return { stock: n >= 100 && n < 200 ? 'philadelphia-dlrv' : 'philadelphia-bus', cars: 1 };
  return {};
}

/** Regional Rail stock from a TrainView consist ("914,2518,2515,…" or "805,806,817,818"). */
export function railConsist(consist: string): { stock?: string; cars?: number } {
  const cars = consist.split(',').map((c) => Number(c.trim())).filter((c) => c > 0);
  if (!cars.length) return {};
  // Push-pull sets: an ACS-64 (900s) with Bombardier coaches (2400s cab cars, 2500s trailers).
  const coaches = cars.filter((c) => c >= 2400);
  if (coaches.length) return { stock: 'philadelphia-pushpull', cars: coaches.length };
  const v = cars.filter((c) => c >= 700 && c < 900).length;
  return { stock: v * 2 >= cars.length ? 'philadelphia-silverliner-5' : 'philadelphia-silverliner-4', cars: cars.length };
}

function septaTrolleyRealtime(): RealtimeSource {
  const base = gtfsRealtime({
    name: 'SEPTA GTFS-realtime',
    tripUpdates: 'https://www3.septa.org/gtfsrt/septa-pa-us/Trip/rtTripUpdates.pb',
    vehiclePositions: 'https://www3.septa.org/gtfsrt/septa-pa-us/Vehicle/rtVehiclePosition.pb',
    feed: 'septa',
    everyMs: 30_000,
    perMinute: 12,
    filter: (routeId) => TROLLEY_ROUTES.has(routeId),
  });
  let raw: RtTrip[] | undefined;
  let mapped: RtTrip[] = [];
  return {
    name: base.name,
    refresh: (nowMs, sched) => base.refresh(nowMs, sched),
    trips(nowMs) {
      const trips = base.trips(nowMs);
      if (!trips || trips === raw) return trips && mapped;
      raw = trips;
      mapped = trips.map((t) => (t.line && t.label ? { ...t, ...trolleyConsist(t.line, t.label) } : t));
      return mapped;
    },
  };
}

interface TrainViewTrain {
  trainno: string;
  late: number;
  consist: string;
}

/** SEPTA TrainView: every Regional Rail train on the move, with its minutes late and car numbers. */
function trainView(): RealtimeSource {
  const url = 'https://www3.septa.org/api/TrainView/index.php';
  let data: RtTrip[] = [];
  let at = 0;
  let last = 0;
  let inflight: Promise<void> | undefined;
  return {
    name: 'SEPTA TrainView',
    async refresh(nowMs, sched) {
      if (inflight) return inflight;
      if (nowMs - last < 30_000 && nowMs >= last) return;
      last = nowMs;
      inflight = (async () => {
        try {
          const res = await politeFetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } }, { perMinute: 6 });
          const list = (await res.json()) as TrainViewTrain[];
          const out: RtTrip[] = [];
          for (const t of Array.isArray(list) ? list : []) {
            const no = String(t.trainno ?? '').trim();
            if (!no) continue;
            const c = railConsist(String(t.consist ?? ''));
            const delay = Number.isFinite(Number(t.late)) ? Number(t.late) * 60 : undefined;
            // A train that runs through Center City is two GTFS trips (e.g. MED3528 then LAN3528): update both.
            for (const p of RR_PREFIXES) {
              const key = p + no;
              if (sched.rowsOfKey(key).length) out.push({ key, delay, label: `Train ${no}`, ...c });
            }
          }
          data = out;
          at = nowMs;
        } catch (e) {
          console.warn(`[SEPTA TrainView] ${e instanceof Error ? e.message : e}`);
        }
      })().finally(() => (inflight = undefined));
      return inflight;
    },
    trips(nowMs) {
      return at && Math.abs(nowMs - at) < 300_000 && data.length ? data : undefined;
    },
  };
}

export const createAdapters: AdapterFactory = () =>
  gtfsAdapters({
    city: 'philadelphia',
    schedule: 'server/data/philadelphia/schedule.json',
    adapters: [
      { id: 'philadelphia-metro', name: 'SEPTA Metro', systems: ['septa-metro'] },
      { id: 'philadelphia-trolley', name: 'Trolley', systems: ['septa-trolley'], realtime: septaTrolleyRealtime() },
      { id: 'philadelphia-rr', name: 'Regional Rail', systems: ['septa-rr'], realtime: trainView() },
      { id: 'philadelphia-patco', name: 'PATCO', systems: ['patco'] },
    ],
  });

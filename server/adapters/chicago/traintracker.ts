// CTA Train Tracker (needs CTA_TRAIN_KEY) as a realtime overlay for the GTFS kit. One ttpositions call returns
// every train on all eight lines with its next station and predicted arrival there; the kit matches each run to its
// timetable trip by line, station and time.
import { politeFetch, type RealtimeSource, type RtTrip } from '../gtfs/index.ts';

const URL_BASE = 'https://lapi.transitchicago.com/api/1.0/ttpositions.aspx';
const ROUTES: Record<string, string> = { red: 'red', blue: 'blue', brn: 'brown', g: 'green', org: 'orange', p: 'purple', pink: 'pink', y: 'yellow' };

interface TtTrain {
  rn: string;
  destNm?: string;
  nextStaId?: string;
  nextStpId?: string;
  arrT?: string;
  isApp?: string;
  isDly?: string;
}
interface TtResponse {
  ctatt?: { tmst?: string; errCd?: string; errNm?: string | null; route?: { '@name': string; train?: TtTrain | TtTrain[] }[] };
}

/** Train Tracker times are Chicago wall-clock times without an offset. */
function chicagoTime(s: string, offsetSec: number): number {
  return Date.parse(`${s}Z`) / 1000 - offsetSec;
}

export function trainTracker(key: string): RealtimeSource {
  let data: RtTrip[] = [];
  let at = 0;
  let last = 0;
  let inflight: Promise<void> | undefined;

  async function load(nowMs: number, sched: Parameters<RealtimeSource['refresh']>[1]) {
    const url = `${URL_BASE}?key=${encodeURIComponent(key)}&rt=${Object.keys(ROUTES).join(',')}&outputType=JSON`;
    const res = await politeFetch(url, { headers: { accept: 'application/json' } }, { perMinute: 4 });
    const body = (await res.json()) as TtResponse;
    const tt = body.ctatt;
    if (!tt || (tt.errCd && tt.errCd !== '0')) throw new Error(`Train Tracker: ${tt?.errNm ?? 'no data'}`);
    // The feed's own timestamp gives the Chicago UTC offset (DST-safe without a timezone database).
    const offset = tt.tmst ? Math.round((Date.parse(`${tt.tmst}Z`) - nowMs) / 900_000) * 900 : -5 * 3600;
    const out: RtTrip[] = [];
    for (const r of tt.route ?? []) {
      const line = ROUTES[r['@name']];
      if (!line) continue;
      for (const t of Array.isArray(r.train) ? r.train : r.train ? [r.train] : []) {
        const station = sched.station(t.nextStpId ?? '') ?? sched.station(t.nextStaId ?? '');
        if (station == null || !t.arrT) continue;
        const a = chicagoTime(t.arrT, offset);
        out.push({
          line,
          label: `Run ${t.rn}`,
          stops: [{ station, a, d: a + 25 }],
          at: t.isApp === '1' ? { station, status: 'to' } : undefined,
        });
      }
    }
    data = out;
    at = nowMs;
  }

  return {
    name: 'CTA Train Tracker',
    async refresh(nowMs, sched) {
      if (inflight) return inflight;
      if (nowMs - last < 30_000 && nowMs >= last) return;
      last = nowMs;
      inflight = load(nowMs, sched).finally(() => (inflight = undefined));
      return inflight;
    },
    trips(nowMs) {
      return at && Math.abs(nowMs - at) < 300_000 && data.length ? data : undefined;
    },
  };
}

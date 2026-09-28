// ViaggiaTreno (RFI, keyless): live departure boards of Line 2's stations. Each board lists the next trains with their
// number, scheduled departure and current delay. The ANM feed's Line 2 trips don't carry Trenitalia train numbers, so
// every train's calls (scheduled + expected departure at each board station) are matched to the timetable by time.
import { politeFetch, type GtfsSchedule, type RealtimeSource, type RtTrip } from '../gtfs/index.ts';

const BASE = 'https://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/partenze/';
const UA = 'TinyTrains/0.1 (live transit diorama; https://tinytrains.app)';
// Board code -> station id in transit.json.
const BOARDS: [string, string][] = [
  ['S09101', 'nap:pozzuoli-solfatara'],
  ['S09105', 'nap:mergellina'],
  ['S09109', 'nap:garibaldi'],
  ['S09103', 'nap:campi-flegrei'],
  ['S09107', 'nap:montesanto'],
  ['S09110', 'nap:gianturco'],
];
const EVERY_MS = 5_000; // one board per call: a full round every 30 s, 12 requests/min
const KEEP_S = 30 * 60;
const STALE_MS = 5 * 60_000;

interface Departure {
  numeroTreno?: number;
  categoria?: string;
  orarioPartenza?: number;
  ritardo?: number;
  circolante?: boolean;
}

const D = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n: number) => String(n).padStart(2, '0');
/** The API wants a JavaScript Date.toString()-style timestamp. */
function vtDate(ms: number): string {
  const t = new Date(ms);
  return `${D[t.getUTCDay()]} ${M[t.getUTCMonth()]} ${p2(t.getUTCDate())} ${t.getUTCFullYear()} ${p2(t.getUTCHours())}:${p2(t.getUTCMinutes())}:${p2(t.getUTCSeconds())} GMT+0000`;
}

export function viaggiaTreno(line: string): RealtimeSource {
  // train number -> station index -> { aimed, delay, seen }
  const trains = new Map<string, Map<number, { aimed: number; delay: number; seen: number }>>();
  let next = 0;
  let last = 0;
  let ok = 0;
  let inflight: Promise<void> | undefined;
  let out: RtTrip[] | undefined;

  async function load(nowMs: number, sched: GtfsSchedule) {
    const [code, stationId] = BOARDS[next];
    next = (next + 1) % BOARDS.length;
    const station = sched.stationIndex(stationId);
    try {
      if (station == null || station < 0) throw new Error(`unknown station ${stationId}`);
      const res = await politeFetch(BASE + code + '/' + encodeURIComponent(vtDate(nowMs)), { headers: { 'user-agent': UA, accept: 'application/json' } }, { perMinute: 20, timeoutMs: 8000 });
      const list = (await res.json()) as Departure[];
      const now = nowMs / 1000;
      for (const d of Array.isArray(list) ? list : []) {
        if (!d.numeroTreno || d.categoria !== 'MET' || d.circolante === false || !d.orarioPartenza || typeof d.ritardo !== 'number') continue;
        const k = String(d.numeroTreno);
        const calls = trains.get(k) ?? trains.set(k, new Map()).get(k)!;
        calls.set(station, { aimed: d.orarioPartenza / 1000, delay: d.ritardo * 60, seen: now });
      }
      ok = nowMs;
    } catch (err) {
      console.warn(`[viaggiatreno] ${code}: ${err instanceof Error ? err.message : err}`);
    }
    const now = nowMs / 1000;
    for (const [k, calls] of trains) {
      for (const [s, c] of calls) if (now - c.seen > KEEP_S || now - c.aimed > KEEP_S) calls.delete(s);
      if (!calls.size) trains.delete(k);
    }
    out = undefined;
  }

  return {
    name: 'ViaggiaTreno delays',
    async refresh(nowMs, sched) {
      if (inflight) return inflight;
      if (nowMs - last < EVERY_MS && nowMs >= last) return;
      last = nowMs;
      inflight = load(nowMs, sched).finally(() => (inflight = undefined));
      return inflight;
    },
    trips(nowMs) {
      if (!ok || Math.abs(nowMs - ok) > STALE_MS || !trains.size) return undefined;
      out ??= [...trains].map(([num, calls]) => ({
        line,
        label: `MET ${num}`,
        stops: [...calls]
          .sort((a, b) => a[1].aimed - b[1].aimed)
          .map(([station, c]) => ({ station, aimedD: c.aimed, d: c.aimed + c.delay })),
      }));
      return out;
    },
  };
}

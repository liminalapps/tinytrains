// ViaggiaTreno (RFI, keyless): live departure boards of Milan's main stations. Each board lists the next ~90 minutes of
// trains with their train number and current delay in minutes, Trenord's suburban trains included. We read a few
// boards in rotation and hand the kit a whole-trip delay per train number (the schedule's realtime key).
import { politeFetch, type RealtimeSource, type RtTrip } from '../gtfs/index.ts';

const BASE = 'https://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/partenze/';
const UA = 'TinyTrains/0.1 (live transit diorama; https://tinytrains.app)';
// Garibaldi Passante, Cadorna, Bovisa, Rogoredo, Garibaldi, Certosa, Lambrate, Centrale, San Cristoforo,
// Greco Pirelli, Porta Vittoria, Rho: between them every S line and the Malpensa Express.
const BOARDS = ['S01647', 'S01066', 'S01642', 'S01820', 'S01645', 'S01640', 'S01701', 'S01700', 'S01630', 'S01326', 'S01633', 'S01037'];
const EVERY_MS = 6_000; // one board per call: a full round every ~72 s, 10 requests/min
const KEEP_S = 25 * 60; // a train's last known delay stays valid this long after its board last listed it
const STALE_MS = 5 * 60_000;

interface Departure {
  numeroTreno?: number;
  dataPartenzaTrenoAsDate?: string;
  ritardo?: number;
  nonPartito?: boolean;
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

export function viaggiaTreno(): RealtimeSource {
  const delays = new Map<string, { delay: number; date: number; seen: number }>();
  let next = 0;
  let last = 0;
  let ok = 0;
  let inflight: Promise<void> | undefined;

  async function load(nowMs: number) {
    const code = BOARDS[next];
    next = (next + 1) % BOARDS.length;
    try {
      const res = await politeFetch(BASE + code + '/' + encodeURIComponent(vtDate(nowMs)), { headers: { 'user-agent': UA, accept: 'application/json' } }, { perMinute: 20, timeoutMs: 8000 });
      const list = (await res.json()) as Departure[];
      const now = nowMs / 1000;
      for (const d of Array.isArray(list) ? list : []) {
        if (!d.numeroTreno || d.nonPartito || d.circolante === false || typeof d.ritardo !== 'number') continue;
        const date = Number((d.dataPartenzaTrenoAsDate ?? '').replace(/-/g, ''));
        delays.set(String(d.numeroTreno), { delay: d.ritardo * 60, date: date || 0, seen: now });
      }
      ok = nowMs;
    } catch (err) {
      console.warn(`[viaggiatreno] ${code}: ${err instanceof Error ? err.message : err}`);
    }
    for (const [k, v] of delays) if (nowMs / 1000 - v.seen > KEEP_S) delays.delete(k);
  }

  return {
    name: 'ViaggiaTreno delays',
    async refresh(nowMs) {
      if (inflight) return inflight;
      if (nowMs - last < EVERY_MS && nowMs >= last) return;
      last = nowMs;
      inflight = load(nowMs).finally(() => (inflight = undefined));
      return inflight;
    },
    trips(nowMs) {
      if (!ok || Math.abs(nowMs - ok) > STALE_MS || !delays.size) return undefined;
      const out: RtTrip[] = [];
      for (const [key, v] of delays) out.push(v.date ? { key, date: v.date, delay: v.delay } : { key, delay: v.delay });
      return out;
    },
  };
}

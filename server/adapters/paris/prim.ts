// Île-de-France Mobilités PRIM realtime: SIRI Lite "estimated-timetable", one request per line.
// Written against the documented SIRI Lite JSON shape; every field is treated as optional.
import type { Schedule } from './schedule.ts';

const URL_ET = 'https://prim.iledefrance-mobilites.fr/marketplace/estimated-timetable';

/** Requests per minute across all Paris adapters; a cold start may fetch every line at once. */
const PER_MINUTE = 15;
const BURST = 35;
const PARALLEL = 4;
/** Refresh a line's predictions when they are older than this. */
const LINE_MAX_AGE_MS = 120_000;
/** Predictions older than this are ignored. */
const STALE_MS = 5 * 60_000;

export interface RtCall {
  station: number;
  /** Aimed (timetabled) and expected times, epoch seconds. */
  aa?: number;
  ad?: number;
  ea?: number;
  ed?: number;
  /** The train no longer calls here. */
  x?: boolean;
}

export interface RtJourney {
  line: number;
  ref?: string;
  /** RER mission code ('NATO'), when the feed gives one. */
  note?: string;
  cancelled: boolean;
  calls: RtCall[];
}

type Json = Record<string, unknown>;

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
/** SIRI Lite wraps most strings as { value: '...' }, sometimes in an array. */
function text(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return text(v[0]);
  if (v && typeof v === 'object' && typeof (v as Json).value === 'string') return (v as Json).value as string;
  return undefined;
}
function time(v: unknown): number | undefined {
  const s = text(v);
  const t = s ? Date.parse(s) : NaN;
  return Number.isFinite(t) ? t / 1000 : undefined;
}

export function parseEstimatedTimetable(json: unknown, sched: Schedule): RtJourney[] {
  const out: RtJourney[] = [];
  const stopMap = sched.data.stopMap;
  const lineByRef = new Map(sched.data.lines.map((l, i) => [l.ref, i]));
  const siri = (json as Json | undefined)?.Siri as Json | undefined;
  const sd = siri?.ServiceDelivery as Json | undefined;
  for (const etd of list(sd?.EstimatedTimetableDelivery))
    for (const frame of list((etd as Json)?.EstimatedJourneyVersionFrame))
      for (const raw of list((frame as Json)?.EstimatedVehicleJourney)) {
        const j = raw as Json;
        const ref = text(j.LineRef)?.match(/C\d{5}/)?.[0];
        const line = ref ? lineByRef.get(ref) : undefined;
        if (line == null) continue;
        const calls: RtCall[] = [];
        const add = (c: Json, recorded: boolean) => {
          const sp = text(c.StopPointRef) ?? '';
          const m = sp.match(/StopPoint:Q:(\d+)/) ?? sp.match(/StopArea:SP:(\d+)/);
          const key = m ? `${m[0].includes('StopArea') ? 'SP' : 'Q'}:${m[1]}` : undefined;
          const station = key ? stopMap[key] : undefined;
          if (station == null) return;
          const status = `${text(c.ArrivalStatus) ?? ''} ${text(c.DepartureStatus) ?? ''}`.toLowerCase();
          calls.push({
            station,
            aa: time(c.AimedArrivalTime),
            ad: time(c.AimedDepartureTime),
            ea: time(recorded ? (c.ActualArrivalTime ?? c.ExpectedArrivalTime) : c.ExpectedArrivalTime),
            ed: time(recorded ? (c.ActualDepartureTime ?? c.ExpectedDepartureTime) : c.ExpectedDepartureTime),
            x: status.includes('cancel') || undefined,
          });
        };
        for (const c of list((j.RecordedCalls as Json | undefined)?.RecordedCall)) add(c as Json, true);
        for (const c of list((j.EstimatedCalls as Json | undefined)?.EstimatedCall)) add(c as Json, false);
        const framed = j.FramedVehicleJourneyRef as Json | undefined;
        out.push({
          line,
          ref: text(j.DatedVehicleJourneyRef) ?? text(framed?.DatedVehicleJourneyRef),
          note: text(j.JourneyNote) ?? text(j.VehicleJourneyName),
          cancelled: j.Cancellation === true || text(j.Cancellation) === 'true',
          calls,
        });
      }
  return out;
}

/**
 * One PRIM client per API key, shared by the Métro and RER adapters so their requests come from one place:
 * a token bucket caps the request rate and 429/5xx responses pause everything with exponential backoff.
 */
export class PrimClient {
  private tokens = BURST;
  private refilled = 0;
  private pausedUntil = 0;
  private backoff = 0;
  private lines = new Map<number, { at: number; tried: number; journeys: RtJourney[] }>();
  error?: string;

  constructor(
    private key: string,
    private sched: Schedule,
  ) {}

  /** Refresh the oldest of the given lines that are due, as far as the rate limit allows. */
  async refresh(nowMs: number, lines: number[]): Promise<void> {
    this.tokens = Math.min(BURST, this.tokens + ((nowMs - (this.refilled || nowMs)) / 60_000) * PER_MINUTE);
    this.refilled = nowMs;
    if (nowMs < this.pausedUntil) return;
    const due = lines
      .map((l) => ({ l, tried: this.lines.get(l)?.tried ?? 0 }))
      .filter((e) => nowMs - e.tried >= LINE_MAX_AGE_MS)
      .sort((a, b) => a.tried - b.tried);
    const batch: number[] = [];
    for (const e of due) {
      if (this.tokens < 1) break;
      this.tokens -= 1;
      batch.push(e.l);
    }
    for (let i = 0; i < batch.length && nowMs >= this.pausedUntil; i += PARALLEL) await Promise.all(batch.slice(i, i + PARALLEL).map((l) => this.fetchLine(l, nowMs)));
  }

  private async fetchLine(line: number, nowMs: number): Promise<void> {
    const entry = this.lines.get(line) ?? { at: 0, tried: 0, journeys: [] };
    this.lines.set(line, entry);
    entry.tried = nowMs;
    const ref = `STIF:Line::${this.sched.data.lines[line].ref}:`;
    try {
      const res = await fetch(`${URL_ET}?LineRef=${encodeURIComponent(ref)}`, {
        headers: { apikey: this.key, accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      });
      if (res.status === 429 || res.status >= 500) {
        this.backoff = Math.min(600_000, Math.max(30_000, this.backoff * 2));
        this.pausedUntil = nowMs + this.backoff;
        throw new Error(`HTTP ${res.status}, pausing ${this.backoff / 1000} s`);
      }
      if (res.status === 401 || res.status === 403) {
        this.pausedUntil = nowMs + 15 * 60_000;
        throw new Error(`HTTP ${res.status} (check PRIM_KEY)`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      entry.journeys = parseEstimatedTimetable(await res.json(), this.sched).filter((j) => j.line === line);
      entry.at = nowMs;
      this.backoff = 0;
      this.error = undefined;
    } catch (err) {
      this.error = `${this.sched.data.lines[line].id}: ${err instanceof Error ? err.message : err}`;
      console.warn(`[paris-prim] ${this.error}`);
    }
  }

  /** Fresh journeys of a line, or undefined when there is no usable realtime data for it. */
  journeys(line: number, nowMs: number): RtJourney[] | undefined {
    const e = this.lines.get(line);
    return e && e.at && nowMs - e.at < STALE_MS && e.journeys.length ? e.journeys : undefined;
  }
}

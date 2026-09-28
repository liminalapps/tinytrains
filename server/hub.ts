import type { CityId, SourceStatus, TrainState, TrainsResponse } from '../shared/types.ts';
import type { Adapter } from './adapters/types.ts';

interface AdapterState {
  adapter: Adapter;
  trains: TrainState[];
  updated: number;
  ok: boolean;
  error?: string;
  inFlight: boolean;
  lastPoll: number;
}

/** Keep polling a city for this long after the last client request. */
const IDLE_MS = 3 * 60_000;
/** Drop a source's trains if it has not refreshed for this long. */
const STALE_MS = 5 * 60_000;

export class Hub {
  private states = new Map<CityId, AdapterState[]>();
  private lastRequest = new Map<CityId, number>();

  /**
   * With `timers: false` (Cloudflare Durable Objects, which may be evicted between requests) polling
   * is driven by requests instead: every snapshot kicks off polls for sources that are due, and
   * `defer` keeps them alive past the response.
   */
  constructor(
    adapters: Adapter[],
    private opts: { timers?: boolean; defer?: (p: Promise<unknown>) => void; shiftMs?: number } = {},
  ) {
    for (const adapter of adapters) {
      const list = this.states.get(adapter.city) ?? [];
      list.push({ adapter, trains: [], updated: 0, ok: false, inFlight: false, lastPoll: 0 });
      this.states.set(adapter.city, list);
    }
    if (opts.timers !== false) {
      const t = setInterval(() => this.tick(), 1000) as unknown as { unref?: () => void };
      t.unref?.();
    }
  }

  private tick() {
    const now = Date.now();
    for (const [city, list] of this.states) {
      if (now - (this.lastRequest.get(city) ?? 0) > IDLE_MS) continue;
      for (const st of list) {
        if (!st.inFlight && now - st.lastPoll >= st.adapter.intervalMs) void this.poll(st);
      }
    }
  }

  private async poll(st: AdapterState) {
    st.inFlight = true;
    st.lastPoll = Date.now();
    try {
      const trains = await st.adapter.poll(Date.now() + (this.opts.shiftMs ?? 0));
      st.trains = trains;
      st.updated = Date.now();
      st.ok = true;
      st.error = undefined;
    } catch (err) {
      st.ok = false;
      st.error = err instanceof Error ? err.message : String(err);
      console.warn(`[${st.adapter.id}] poll failed: ${st.error}`);
    } finally {
      st.inFlight = false;
    }
  }

  /** Latest merged snapshot. The first request for an idle city waits for one poll round. */
  async snapshot(city: CityId): Promise<TrainsResponse> {
    const list = this.states.get(city) ?? [];
    const now = Date.now();
    const wasIdle = now - (this.lastRequest.get(city) ?? 0) > IDLE_MS;
    this.lastRequest.set(city, now);
    const due = list.filter((st) => !st.inFlight && now - st.lastPoll >= st.adapter.intervalMs).map((st) => this.poll(st));
    if (wasIdle) await Promise.race([Promise.all(due), new Promise((r) => setTimeout(r, 12_000))]);
    else if (this.opts.timers === false && due.length) this.opts.defer?.(Promise.all(due));
    const trains: TrainState[] = [];
    const sources: SourceStatus[] = [];
    for (const st of list) {
      const fresh = Date.now() - st.updated < STALE_MS;
      if (fresh) trains.push(...st.trains);
      sources.push({
        id: st.adapter.id,
        name: st.adapter.name,
        live: st.adapter.live,
        ok: st.ok && fresh,
        updated: st.updated,
        trains: fresh ? st.trains.length : 0,
        error: st.error,
      });
    }
    return { city, now: Date.now() + (this.opts.shiftMs ?? 0), trains, sources };
  }
}

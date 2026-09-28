import type { TrainState } from '../../../shared/types.ts';
import type { Adapter, AdapterEnv, AdapterFactory } from '../types.ts';
import { serviceDay } from './calendar.ts';
import { LINES, type Group } from './lines.ts';
import { SeoulTracker, type PositionRow } from './realtime.ts';
import { simulate } from './sim.ts';
import { timetable } from './timetable.ts';

const API = 'http://swopenAPI.seoul.go.kr/api/subway';
const positionsUrl = (key: string, apiLine: string) => `${API}/${encodeURIComponent(key)}/json/realtimePosition/0/300/${encodeURIComponent(apiLine)}`;

/**
 * Realtime calls per KST day. Seoul Open Data Plaza caps realtime subway keys at 1,000 calls a day until the
 * service is approved in its use-case gallery (활용사례); SEOUL_DAILY_BUDGET overrides this ('unlimited' after).
 */
export const DEFAULT_DAILY_BUDGET = 900;

export function parseBudget(v: string | undefined): number {
  if (v && /^(unlimited|inf(inity)?)$/i.test(v.trim())) return Infinity;
  const n = Number(v);
  return v && Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_BUDGET;
}

const GROUPS: { group: Group; id: string; name: string; scheduled: string }[] = [
  { group: 'metro', id: 'seoul-metro', name: 'Lines 1–9', scheduled: 'Seoul Metro timetable' },
  { group: 'korail', id: 'seoul-korail', name: 'Suin–Bundang, Gyeongui–Jungang & Gyeongchun', scheduled: 'simulated from typical headways' },
  { group: 'other', id: 'seoul-other', name: 'Shinbundang, AREX, Ui & Sillim', scheduled: 'simulated from typical headways' },
];

const linesOf = (g: Group) => LINES.filter((l) => l.group === g).map((l) => l.id);

/** Timetabled trains: Seoul Metro's official timetable for lines 1–9, typical headways for the rest. */
export function scheduled(lines: string[], nowSec: number): TrainState[] {
  const tt = timetable();
  return [...tt.simulate(lines.filter((l) => tt.has(l)), nowSec), ...simulate(lines.filter((l) => !tt.has(l)), nowSec)];
}

/** A failed feed request, with how long to wait before asking for that line again. */
export class FeedError extends Error {
  constructor(message: string, readonly retryAfterSec: number) {
    super(message);
  }
}

export async function fetchPositions(url: string): Promise<PositionRow[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000), headers: { accept: 'application/json' } });
  if (res.status === 429 || res.status >= 500) throw new FeedError(`HTTP ${res.status}`, 120);
  if (!res.ok) throw new FeedError(`HTTP ${res.status}`, 300);
  const body = (await res.json()) as {
    errorMessage?: { code?: string; message?: string };
    code?: string;
    message?: string;
    realtimePositionList?: PositionRow[];
  };
  const code = body.errorMessage?.code ?? body.code ?? '';
  if (code === 'INFO-200') return []; // no data: no train on the line right now
  if (code !== 'INFO-000') {
    // INFO-100 invalid key and INFO-300 key suspended: wait long; server and request errors: retry sooner.
    const wait = /INFO-100|INFO-300/.test(code) ? 1800 : 180;
    throw new FeedError(`${code} ${body.errorMessage?.message ?? body.message ?? ''}`.trim(), wait);
  }
  return body.realtimePositionList ?? [];
}

type Storage = NonNullable<AdapterEnv['storage']>;

/**
 * A day's calls shared by all lines of all three adapters, paced so that they last until service ends (01:00 KST).
 * The count is kept in durable storage when available, so a restarted Durable Object does not start afresh.
 */
export class CallBudget {
  private day = '';
  private used = 0;
  private loaded: Promise<void> | null = null;

  constructor(readonly perDay: number, readonly lines: number, private store?: Storage) {}

  load(): Promise<void> {
    return (this.loaded ??= (async () => {
      const saved = await this.store?.get<{ day: string; used: number }>('seoul-call-budget').catch(() => undefined);
      if (saved && saved.day >= this.day) (this.day = saved.day), (this.used = Math.max(this.used, saved.used));
    })());
  }

  get unlimited() {
    return !Number.isFinite(this.perDay);
  }

  /** Calls left today. */
  left(nowSec: number): number {
    const d = serviceDay(nowSec).date;
    if (d !== this.day) (this.day = d), (this.used = 0);
    return this.perDay - this.used;
  }

  /** Seconds each line waits between requests. */
  gap(nowSec: number): number {
    if (this.unlimited) return 30;
    const left = this.left(nowSec);
    if (left < 1) return Infinity;
    return Math.max(30, ((serviceDay(nowSec).base + 25 * 3600 - nowSec) * this.lines) / left);
  }

  spend() {
    this.used++;
    this.store?.put('seoul-call-budget', { day: this.day, used: this.used }).catch(() => {});
  }
}

export function scheduledAdapter(id: string, name: string, lines: string[]): Adapter {
  return { id, city: 'seoul', name, live: false, intervalMs: 30_000, poll: async (now) => scheduled(lines, now / 1000) };
}

/**
 * Realtime positions, one request per line, paced by the key's daily budget. Between requests a line's tracked
 * timelines are served again; a line whose request fails, that reports no trains, or whose budget is spent runs
 * from the timetable.
 */
export function realtimeAdapter(o: {
  id: string;
  name: string;
  key: string;
  lines: string[];
  budget?: CallBudget;
  fetchRows?: (url: string, line: string) => Promise<PositionRow[]>;
}): Adapter {
  const trackers = new Map(o.lines.map((l) => [l, new SeoulTracker(l)]));
  const backoff = new Map<string, { until: number; fails: number }>();
  const cache = new Map<string, { at: number; trains: TrainState[] }>();
  const budget = o.budget ?? new CallBudget(Infinity, o.lines.length);
  return {
    id: o.id,
    city: 'seoul',
    name: o.name,
    live: true,
    intervalMs: 30_000,
    async poll(now) {
      const nowSec = now / 1000;
      await budget.load();
      const gap = budget.gap(nowSec) * 1000;
      // Lines due for a request, stalest first; on a capped key only one per poll, so calls rotate through lines.
      const due = o.lines
        .filter((l) => !(backoff.get(l) && now < backoff.get(l)!.until) && now - (cache.get(l)?.at ?? -Infinity) >= gap)
        .sort((a, b) => (cache.get(a)?.at ?? 0) - (cache.get(b)?.at ?? 0))
        .slice(0, budget.unlimited ? o.lines.length : Math.min(1, Math.floor(budget.left(nowSec))));
      const results = await Promise.all(
        o.lines.map(async (line): Promise<TrainState[]> => {
          const conf = LINES.find((l) => l.id === line)!;
          const b = backoff.get(line);
          const c = cache.get(line);
          if (!due.includes(line)) {
            const alive = b && now < b.until ? [] : (c?.trains ?? []).filter((t) => t.stops[t.stops.length - 1].d > nowSec);
            return alive.length ? alive : scheduled([line], nowSec);
          }
          let rows: PositionRow[];
          budget.spend();
          try {
            rows = await (o.fetchRows ?? fetchPositions)(positionsUrl(o.key, conf.api), line);
            backoff.delete(line);
          } catch (err) {
            const fails = (b?.fails ?? 0) + 1;
            const wait = err instanceof FeedError ? err.retryAfterSec : 60;
            backoff.set(line, { until: now + Math.min(3600, wait * 2 ** (fails - 1)) * 1000, fails });
            cache.delete(line);
            console.warn(`[${o.id}] ${conf.api} unavailable, using the timetable: ${err instanceof Error ? err.message : err}`);
            return scheduled([line], nowSec);
          }
          const { trains } = trackers.get(line)!.update(rows, nowSec);
          cache.set(line, { at: now, trains });
          return trains.length ? trains : scheduled([line], nowSec);
        }),
      );
      return results.flat();
    },
  };
}

export const createAdapters: AdapterFactory = (env) => {
  const budget = new CallBudget(parseBudget(env.SEOUL_DAILY_BUDGET), LINES.length, env.storage);
  return GROUPS.map(({ group, id, name, scheduled: how }) =>
    env.SEOUL_API_KEY
      ? realtimeAdapter({ id, name: `${name} · Seoul realtime positions`, key: env.SEOUL_API_KEY, lines: linesOf(group), budget })
      : scheduledAdapter(id, `${name} · ${how}`, linesOf(group)),
  );
};

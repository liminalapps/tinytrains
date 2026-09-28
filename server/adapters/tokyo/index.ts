import type { TrainState } from '../../../shared/types.ts';
import type { Adapter, AdapterFactory } from '../types.ts';
import { LINES, type Group } from './lines.ts';
import { OdptTracker, type OdptTrain } from './odpt.ts';
import { Schedule } from './schedule.ts';

const TOEI_URL = 'https://api-public.odpt.org/api/v4/odpt:Train?odpt:operator=odpt.Operator:Toei';
const METRO_URL = (key: string) => `https://api.odpt.org/api/v4/odpt:Train?odpt:operator=odpt.Operator:TokyoMetro&acl:consumerKey=${encodeURIComponent(key)}`;

let shared: Schedule | undefined;
const schedule = () => (shared ??= Schedule.load());
const linesOf = (g: Group) => LINES.filter((l) => l.group === g).map((l) => l.id);

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function scheduledAdapter(id: string, name: string, lines: string[]): Adapter {
  return {
    id,
    city: 'tokyo',
    name,
    live: false,
    intervalMs: 30_000,
    async poll(now) {
      return schedule().simulate(lines, now / 1000);
    },
  };
}

/**
 * ODPT odpt:Train adapter. Lines that have no train in the feed (or everything, if the feed fails) are
 * filled in from the timetable with live: false.
 */
export function odptAdapter(o: { id: string; name: string; url: string; lines: string[]; fetchTrains?: (url: string) => Promise<unknown> }): Adapter {
  let tracker: OdptTracker | undefined;
  const lineSet = new Set(o.lines);
  return {
    id: o.id,
    city: 'tokyo',
    name: o.name,
    live: true,
    intervalMs: 30_000,
    async poll(now) {
      const nowSec = now / 1000;
      const sched = schedule();
      tracker ??= new OdptTracker(sched);
      let raw: unknown;
      try {
        raw = await (o.fetchTrains ?? fetchJson)(o.url);
        if (!Array.isArray(raw)) throw new Error('unexpected response');
      } catch (err) {
        console.warn(`[${o.id}] live feed unavailable, using timetable: ${err instanceof Error ? err.message : err}`);
        return sched.simulate(o.lines, nowSec);
      }
      const { trains, liveLines } = tracker.update(raw as OdptTrain[], nowSec, lineSet);
      const rest: TrainState[] = sched.simulate(o.lines.filter((l) => !liveLines.has(l)), nowSec);
      return [...trains, ...rest];
    },
  };
}

export const createAdapters: AdapterFactory = (env) => [
  odptAdapter({ id: 'tokyo-toei', name: 'Toei · ODPT realtime', url: TOEI_URL, lines: linesOf('toei') }),
  env.ODPT_KEY
    ? odptAdapter({ id: 'tokyo-metro', name: 'Tokyo Metro · ODPT realtime', url: METRO_URL(env.ODPT_KEY), lines: linesOf('metro') })
    : scheduledAdapter('tokyo-metro', 'Tokyo Metro · timetable', linesOf('metro')),
  scheduledAdapter('tokyo-jr', 'JR East · timetable', linesOf('jr')),
  scheduledAdapter('tokyo-other', 'Yurikamome, Tokyo Monorail & Rinkai · timetable', linesOf('other')),
];

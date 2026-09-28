import type { AdapterFactory } from '../types.ts';
import { bartAdapter } from './bart.ts';
import { timetableAdapter } from './timetable.ts';
import type { TripRow } from './schedule.ts';

/** Typical LRV4 consist per Muni Metro line (the 511 feed doesn't report consist length). */
const LRV_CARS: Record<string, number> = { 'muni-J': 1, 'muni-K': 1, 'muni-L': 1, 'muni-M': 2, 'muni-N': 2, 'muni-T': 2 };
/** Heritage fleet on the F; each trip gets one deterministically. */
const HERITAGE = ['sf-muni-pcc-1058', 'sf-muni-pcc-1060', 'sf-muni-pcc-1074', 'sf-muni-pcc-1061', 'sf-muni-pcc-1052', 'sf-muni-milano'];
const CT_SERVICE: Record<string, string> = { 'ct-local': 'Local', 'ct-limited': 'Limited', 'ct-express': 'Express', 'ct-south': 'South County Connector' };

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  return (h ^ (h >>> 13)) >>> 0;
}

function muniTrain(row: TripRow, pat: { line: string; dir: number }) {
  const route = pat.line.slice(5);
  const dir = route === 'T' ? (pat.dir === 0 ? 'Northbound' : 'Southbound') : pat.dir === 0 ? 'Outbound' : 'Inbound';
  if (route === 'F' || route === 'E') return { stock: HERITAGE[hash(row[0]) % HERITAGE.length], cars: 1, dir };
  if (route === 'PH' || route === 'PM') return { stock: 'sf-cable-powell', cars: 1, dir };
  if (route === 'CA') return { stock: 'sf-cable-california', cars: 1, dir };
  return { stock: 'sf-muni-lrv4', cars: LRV_CARS[pat.line] ?? 1, dir };
}

export const createAdapters: AdapterFactory = (env) => [
  bartAdapter(),
  timetableAdapter({
    id: 'sf-muni',
    name: 'Muni Metro, streetcars & cable cars',
    schedule: 'muni',
    agency511: 'SF',
    key: env.API_511_KEY,
    rtEveryMs: 90_000,
    train: muniTrain,
  }),
  timetableAdapter({
    id: 'sf-caltrain',
    name: 'Caltrain',
    schedule: 'caltrain',
    agency511: 'CT',
    key: env.API_511_KEY,
    rtEveryMs: 180_000,
    train: (row, pat) => ({
      stock: pat.line === 'ct-south' ? 'sf-caltrain-diesel' : 'sf-caltrain-kiss',
      cars: pat.line === 'ct-south' ? 5 : 7,
      dir: pat.dir === 0 ? 'Northbound' : 'Southbound',
      service: CT_SERVICE[pat.line],
      label: row[6] ? `Train ${row[6]}` : undefined,
    }),
  }),
];

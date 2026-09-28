// Chicago: the eight CTA 'L' lines from the CTA GTFS (keyless). Train Tracker realtime needs CTA_TRAIN_KEY.
// Run: npx tsx scripts/build-chicago.ts [--refresh] [--debug]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/gtfs/feed.ts';
import { buildGtfsCity, type StockMix, type TripInfo } from './lib/gtfs/index.ts';

// Car assignments, fall 2026: 7000-series on the Blue Line (with the last 2600s), 3200s and 2600s on Brown and
// Orange, 5000-series everywhere else. Cars per train by line and time of day (married pairs, so always even).
const FLEET: Record<string, { mix: [string, number][]; peak: number; base: number; night: number }> = {
  red: { mix: [['chicago-5000', 1]], peak: 8, base: 8, night: 8 },
  blue: { mix: [['chicago-7000', 6], ['chicago-2600', 1]], peak: 8, base: 8, night: 6 },
  brown: { mix: [['chicago-3200', 4], ['chicago-2600', 1]], peak: 8, base: 6, night: 4 },
  green: { mix: [['chicago-5000', 1]], peak: 6, base: 6, night: 4 },
  orange: { mix: [['chicago-2600', 3], ['chicago-3200', 2]], peak: 8, base: 6, night: 4 },
  pink: { mix: [['chicago-5000', 1]], peak: 6, base: 4, night: 4 },
  purple: { mix: [['chicago-5000', 1]], peak: 8, base: 4, night: 2 },
  yellow: { mix: [['chicago-5000', 1]], peak: 2, base: 2, night: 2 },
};

const LINES: [string, string, string][] = [
  ['red', 'Red', 'Red Line'],
  ['blue', 'Blue', 'Blue Line'],
  ['brown', 'Brn', 'Brown Line'],
  ['green', 'G', 'Green Line'],
  ['orange', 'Org', 'Orange Line'],
  ['pink', 'Pink', 'Pink Line'],
  ['purple', 'P', 'Purple Line'],
  ['yellow', 'Y', 'Yellow Line'],
];

/** Stations of the Loop elevated and the downtown stops Purple Line Express trains make. */
const LOOP = /^(Clark\/Lake|State\/Lake|Washington\/Wabash|Adams\/Wabash|Harold Washington Library|LaSalle\/Van Buren|Quincy|Washington\/Wells|Merchandise Mart)/;

/** Service ids that run on weekdays only (calendar.txt of the extracted feed). */
let weekdays: Set<string> | undefined;
function isWeekday(service: string): boolean {
  if (!weekdays) {
    const [head, ...rows] = readFileSync(join(ROOT, '.cache/chicago/cta/calendar.txt'), 'utf8').trim().split(/\r?\n/);
    const col = Object.fromEntries(head.split(',').map((h, i) => [h.trim(), i]));
    weekdays = new Set(
      rows.map((r) => r.split(',')).filter((c) => c[col.saturday] === '0' && c[col.sunday] === '0').map((c) => c[col.service_id]),
    );
  }
  return weekdays.has(service);
}

const mix = (line: string, cars: number): StockMix[] => FLEET[line].mix.map(([stock, share]) => ({ stock, cars, share }));

function consist(t: TripInfo): StockMix {
  const f = FLEET[t.line];
  const start = t.allStops[0].a / 3600;
  // Weekday rush hours run the longest trains.
  const peak = isWeekday(t.trip.service_id) && ((start >= 6 && start < 9.5) || (start >= 15 && start < 18.5));
  const cars = peak ? f.peak : start >= 5 && start < 21 ? f.base : f.night;
  const m = mix(t.line, cars);
  const total = m.reduce((s, x) => s + (x.share ?? 1), 0);
  let pick = ((Number(t.trip.trip_id.slice(-6)) * 2654435761) % 4294967296) / 4294967296 * total;
  for (const x of m) if ((pick -= x.share ?? 1) < 0) return { stock: x.stock, cars };
  return { stock: m[0].stock, cars };
}

await buildGtfsCity({
  city: 'chicago',
  feeds: [{ id: 'cta', url: 'https://www.transitchicago.com/downloads/sch_data/google_transit.zip' }],
  systems: [{ id: 'cta-l', name: "CTA 'L'", live: 'scheduled' }],
  lines: LINES.map(([id, routeId, name]) => ({
    id,
    system: 'cta-l',
    match: { routeId, routeType: 1 },
    name,
    short: '',
    kind: 'metro' as const,
    bullet: 'bar' as const,
    stock: mix(id, FLEET[id].peak),
    osm: ['subway'],
  })),
  stations: {
    idPrefix: 'cta',
    // 'Western (Blue - Forest Park Branch)', 'Belmont (Red/Brown/Purple)', 'Lake (Subway)' -> the plain name.
    name: (n) => n.replace(/\s*\(.*\)\s*$/, '').trim(),
  },
  trips: {
    consist,
    // Red, Blue and Green trips carry a compass direction. Yellow and the Purple shuttle run one-way trips without
    // one; Brown, Orange, Pink and Purple Express trips are round trips through the Loop (see dirAt).
    dir: (t) => {
      const d = t.trip.direction;
      if (d && d !== '0') return `${d}bound`;
      const last = t.allStops.at(-1)!.name;
      if (t.line === 'yellow') return last.startsWith('Howard') ? 'Eastbound' : 'Westbound';
      if (t.line === 'purple' && !t.stops.some((s) => s.headsign === 'Loop')) return last.startsWith('Linden') ? 'Northbound' : 'Southbound';
      return undefined;
    },
    dirAt: (t, i) => (t.stops.some((s) => s.headsign === 'Loop') ? (t.stops[i].headsign === 'Loop' ? 'Inbound' : 'Outbound') : undefined),
    service: (t) => (t.line === 'purple' && t.allStops.some((s) => LOOP.test(s.name)) ? 'Express' : undefined),
  },
  days: { from: -2, to: 60 },
  attribution: ['Timetables: Chicago Transit Authority', 'Track levels © OpenStreetMap contributors'],
});

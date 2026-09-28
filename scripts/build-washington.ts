// Washington: the six Metrorail lines from WMATA's rail GTFS. WMATA serves it only with an API key, so without
// WMATA_KEY the build uses the Mobility Database's keyless mirror (last refreshed October 2024; the adapter maps each
// day to the same weekday of the feed's last covered week).
// Run: npx tsx scripts/build-washington.ts [--refresh] [--debug]   (reads WMATA_KEY from the environment or .env)
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/gtfs/feed.ts';
import { buildGtfsCity, type StockMix } from './lib/gtfs/index.ts';

if (existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'));
const KEY = process.env.WMATA_KEY;
const feed = KEY
  ? { id: 'wmata', url: 'https://api.wmata.com/gtfs/rail-gtfs-static.zip', headers: { api_key: KEY } }
  : { id: 'wmata-mdb', url: 'https://storage.googleapis.com/storage/v1/b/mdb-latest/o/us-district-of-columbia-washington-wmata-gtfs-1847.zip?alt=media' };

// Fleet in service, fall 2026: about 750 7000-series cars, 184 6000s and ~200 3000s. Most trains run 6 cars, some 8.
const MIX: StockMix[] = [
  { stock: 'washington-7000', cars: 6, share: 4.5 },
  { stock: 'washington-7000', cars: 8, share: 1.5 },
  { stock: 'washington-6000', cars: 6, share: 1.2 },
  { stock: 'washington-6000', cars: 8, share: 0.5 },
  { stock: 'washington-3000', cars: 6, share: 1.2 },
  { stock: 'washington-3000', cars: 8, share: 0.4 },
];

// Official line colors and the two-letter codes on Metro's current map.
const LINES: [string, string, string, string, string][] = [
  ['red', 'RED', 'Red Line', 'RD', '#BF0D3E'],
  ['orange', 'ORANGE', 'Orange Line', 'OR', '#ED8B00'],
  ['silver', 'SILVER', 'Silver Line', 'SV', '#919D9D'],
  ['blue', 'BLUE', 'Blue Line', 'BL', '#009CDE'],
  ['yellow', 'YELLOW', 'Yellow Line', 'YL', '#FFD100'],
  ['green', 'GREEN', 'Green Line', 'GR', '#00B140'],
];

const WORDS: Record<string, string> = {
  GWU: 'GWU', AU: 'AU', UDC: 'UDC', CUA: 'CUA', GMU: 'GMU', MU: 'MU', VT: 'VT', SW: 'SW', U: 'U', OF: 'of', MD: 'Md',
  NOMA: 'NoMa', MCPHERSON: 'McPherson', MCLEAN: 'McLean', "L'ENFANT": "L'Enfant",
};

/** 'FOGGY BOTTOM-GWU METRORAIL STATION' -> 'Foggy Bottom-GWU'. */
function stationName(raw: string): string {
  return raw
    .replace(/\s+METRORAIL STATION\s*$/i, '')
    .replace(/,.*$/, '')
    .replace('/VT', '-VT')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[A-Z'][A-Z']*/g, (w) => WORDS[w] ?? w[0] + w.slice(1).toLowerCase());
}

/** Headsigns that differ from the station names on the map. */
const HEADSIGNS: Record<string, string> = {
  LARGO: 'Downtown Largo',
  'VIENNA FAIRFAX-GMU': 'Vienna',
  'MOUNT VERNON SQUARE': 'Mt Vernon Sq',
  'DULLES AIRPORT': 'Dulles Airport',
};

/** Compass by direction_id. The Red Line is a U (both ends point north), so it gets none. */
const DIRS: Record<string, [string, string]> = {
  BLUE: ['Eastbound', 'Westbound'],
  ORANGE: ['Eastbound', 'Westbound'],
  SILVER: ['Eastbound', 'Westbound'],
  GREEN: ['Northbound', 'Southbound'],
  YELLOW: ['Northbound', 'Southbound'],
};

await buildGtfsCity({
  city: 'washington',
  feeds: [feed],
  systems: [{ id: 'metrorail', name: 'Metrorail', live: KEY ? 'realtime' : 'scheduled' }],
  lines: LINES.map(([id, routeId, name, short, color]) => ({
    id,
    system: 'metrorail',
    match: { routeId },
    name,
    short,
    color,
    textColor: id === 'yellow' ? '#000000' : '#FFFFFF',
    kind: 'metro' as const,
    bullet: 'circle' as const,
    stock: MIX,
    osm: ['subway'],
  })),
  stations: { idPrefix: 'wmata', maxSpread: 200, name: stationName },
  trips: {
    dest: (t) => {
      const h = t.trip.trip_headsign.trim();
      return HEADSIGNS[h] ?? stationName(h || t.allStops.at(-1)!.name);
    },
    dir: (t) => DIRS[t.route.route_id]?.[Number(t.trip.direction_id)],
    label: (t) => (t.trip.train_id ? `Train ${t.trip.train_id}` : undefined),
  },
  realtimeKeys: true,
  attribution: [KEY ? 'Timetables: WMATA' : 'Timetables: WMATA (via the Mobility Database)', 'Track levels © OpenStreetMap contributors'],
});

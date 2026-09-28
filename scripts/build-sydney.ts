// Sydney: Sydney Trains, intercity trains, Sydney Metro and light rail from TfNSW's complete Greater Sydney GTFS
// (keyless on opendata.transport.nsw.gov.au, CC BY 4.0) through the GTFS kit. Sydney Trains trip ids carry each
// train's set type and length ('.A.8.' is an 8-car Waratah), which become the train's stock.
// Run: ./node_modules/.bin/tsx scripts/build-sydney.ts [--refresh] [--debug]
import { buildGtfsCity, type StockMix, type TripInfo } from './lib/gtfs/index.ts';

const FEED = 'https://opendata.transport.nsw.gov.au/data/dataset/d1f68d4f-b778-44df-9823-cf2fa922e47f/resource/67974f14-01bf-47b7-bfa5-c7f2f8a950ca/download/full_greater_sydney_gtfs_static_0.zip';

/** Set type letter in Sydney Trains and intercity trip ids -> stock. K sets are suspended (June 2026) and N are country railcars. */
const SETS: Record<string, string> = {
  A: 'sydney-waratah-a',
  B: 'sydney-waratah-b',
  T: 'sydney-tangara',
  M: 'sydney-millennium',
  H: 'sydney-oscar',
  D: 'sydney-mariyung',
};

const mix = (...m: [string, number, number][]): StockMix[] => m.map(([s, cars, share]) => ({ stock: `sydney-${s}`, cars, share }));

// Colors: Transport for NSW line colors (their line icons; Wikipedia's route modules agree). Shares follow the
// feed's own set allocations and only apply to trips whose id names no set.
const TRAINS: [string, string, string, StockMix[]][] = [
  ['T1', 'North Shore & Western Line', '#F99D1C', mix(['waratah-a', 8, 8], ['waratah-b', 8, 2], ['tangara', 8, 1])],
  ['T2', 'Leppington & Inner West Line', '#0098CD', mix(['waratah-a', 8, 1], ['waratah-b', 8, 1])],
  ['T3', 'Liverpool & Inner West Line', '#F37021', mix(['waratah-a', 8, 1], ['waratah-b', 8, 1])],
  ['T4', 'Eastern Suburbs & Illawarra Line', '#005AA3', mix(['tangara', 8, 1])],
  ['T5', 'Cumberland Line', '#C4258F', mix(['waratah-a', 8, 2], ['millennium', 4, 1])],
  ['T6', 'Lidcombe & Bankstown Line', '#7D3F21', mix(['millennium', 4, 1])],
  ['T7', 'Olympic Park Line', '#6F818E', mix(['millennium', 4, 1], ['waratah-a', 8, 1])],
  ['T8', 'Airport & South Line', '#00954C', mix(['waratah-a', 8, 5], ['waratah-b', 8, 4])],
  ['T9', 'Northern Line', '#D11F2F', mix(['waratah-a', 8, 6], ['waratah-b', 8, 1], ['tangara', 8, 1], ['oscar', 8, 1])],
];
const INTERCITY: [string, string, string, StockMix[]][] = [
  ['BMT', 'Blue Mountains Line', '#F99D1C', mix(['mariyung', 6, 1])],
  ['CCN', 'Central Coast & Newcastle Line', '#D11F2F', mix(['mariyung', 10, 1])],
  ['SCO', 'South Coast Line', '#005AA3', mix(['oscar', 8, 2], ['mariyung', 4, 1])],
];

/** The set type and length a Sydney Trains / intercity trip id carries, e.g. '101A.2010.102.128.T.8.91040144'. */
function consist(t: TripInfo): StockMix | undefined {
  const p = t.trip.trip_id.split('.');
  const stock = SETS[p[4]];
  const cars = Number(p[5]);
  return stock && cars > 0 && cars <= 12 ? { stock, cars } : undefined;
}

const stationName = (s: string) =>
  s
    .replace(/,\s*(Platform|Stand|Wharf)\b.*$/i, '')
    .replace(/\s+(Light Rail|Metro)?\s*Station$/i, '')
    .replace(/\s+Light Rail$/i, '')
    .trim();

/** Headsigns read 'Penrith via Gordon': the destination is the part before 'via'. */
const destName = (h: string) => stationName(h.replace(/\s+via\s+.*$/i, ''));

await buildGtfsCity({
  city: 'sydney',
  feeds: [{ id: 'nsw', url: FEED, file: 'full_greater_sydney_gtfs_static.zip' }],
  systems: [
    { id: 'trains', name: 'Sydney Trains', live: 'realtime' },
    { id: 'intercity', name: 'Intercity trains', live: 'realtime' },
    { id: 'metro', name: 'Sydney Metro', live: 'realtime' },
    { id: 'lightrail', name: 'Light Rail', live: 'realtime' },
  ],
  lines: [
    ...TRAINS.map(([id, name, color, stock]) => ({
      id,
      system: 'trains',
      match: { agency: 'Sydney Trains', routeType: 2, shortName: id },
      name,
      short: id,
      color,
      textColor: '#FFFFFF',
      kind: 'rail' as const,
      bullet: 'square' as const,
      stock,
    })),
    ...INTERCITY.map(([id, name, color, stock]) => ({
      id,
      system: 'intercity',
      match: { agency: 'NSW Trains', routeType: 2, shortName: id },
      name,
      short: id,
      color,
      textColor: '#FFFFFF',
      kind: 'rail' as const,
      bullet: 'square' as const,
      stock,
    })),
    {
      id: 'M1',
      system: 'metro',
      match: { agency: 'Sydney Metro', shortName: 'M1' },
      name: 'Metro North West & Bankstown Line',
      short: 'M1',
      color: '#168388',
      textColor: '#FFFFFF',
      kind: 'metro',
      bullet: 'square',
      stock: mix(['metropolis', 6, 1]),
      osm: ['subway', 'rail', 'light_rail'],
    },
    ...(
      [
        ['L1', 'Dulwich Hill Line', '#BE1622', mix(['urbos3', 1, 1])],
        ['L2', 'Randwick Line', '#DD1E25', mix(['citadis305', 2, 1])],
        ['L3', 'Kingsford Line', '#781140', mix(['citadis305', 2, 1])],
        ['LX', 'Special Event Services', '#EE343F', mix(['citadis305', 2, 1])],
        ['L4', 'Westmead & Carlingford Line', '#BB2043', mix(['urbos100', 1, 1])],
      ] as [string, string, string, StockMix[]][]
    ).map(([id, name, color, stock]) => ({
      id,
      system: 'lightrail',
      match: { routeType: 0, shortName: id, test: (r: Record<string, string>) => r.route_id.startsWith('78-') },
      name,
      short: id,
      color,
      textColor: '#FFFFFF',
      kind: 'light' as const,
      bullet: 'square' as const,
      stock,
    })),
  ],
  stations: { idPrefix: 'sydney', name: stationName, maxSpread: 190 },
  trips: {
    dest: (t) => destName(t.trip.trip_headsign || t.allStops.at(-1)!.name),
    // Chained blocks switch signs at the junction (a T1 train signs 'Lindfield via Central', then 'Lindfield').
    destAt: (t, i) => (t.stops[i].headsign ? destName(t.stops[i].headsign!) : undefined),
    service: (t) => (t.skips && t.route.route_type === '2' ? 'Limited stops' : undefined),
    label: (t) => (t.route.route_type === '2' ? t.trip.trip_id.split('.')[0] : undefined),
    consist,
    // TfNSW splits through-running trains (T1 Western to North Shore) into two trips at Central, one block_id.
    chainBlocks: true,
  },
  realtimeKeys: true,
  days: { from: -2, to: 45 },
  attribution: ['Timetables: Transport for NSW (CC BY 4.0)', 'Track levels © OpenStreetMap contributors'],
});

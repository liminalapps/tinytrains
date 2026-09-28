// Philadelphia: SEPTA Metro (L, B, T, G, D, M) from SEPTA's "bus" GTFS, SEPTA Regional Rail from the rail GTFS and the
// PATCO Speedline from PATCO's GTFS (all keyless).
// Run: npx tsx scripts/build-philadelphia.ts [--refresh] [--debug]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { buildGtfsCity, type LineConfig, type StockMix } from './lib/gtfs/index.ts';

// SEPTA publishes one release zip holding two feeds (google_bus.zip, google_rail.zip).
const DIR = '.cache/philadelphia';
if (process.argv.includes('--refresh') || !existsSync(`${DIR}/pub/google_bus.zip`)) {
  mkdirSync(DIR, { recursive: true });
  const res = await fetch('https://github.com/septadev/GTFS/releases/latest/download/gtfs_public.zip');
  if (!res.ok) throw new Error(`SEPTA GTFS: HTTP ${res.status}`);
  writeFileSync(`${DIR}/gtfs_public.zip`, new Uint8Array(await res.arrayBuffer()));
  execFileSync('unzip', ['-o', '-q', `${DIR}/gtfs_public.zip`, '-d', `${DIR}/pub`]);
}

const METRO_ROUTES = ['L1', 'B1', 'B2', 'B3', 'T1', 'T2', 'T3', 'T4', 'T5', 'G1', 'D1', 'D2', 'M1'];

const L_MIX: StockMix[] = [{ stock: 'philadelphia-m4', cars: 6 }];
const B_MIX: StockMix[] = [
  { stock: 'philadelphia-b4', cars: 6, share: 2 },
  { stock: 'philadelphia-b4', cars: 4, share: 1 },
];
// PCC III trolleys came back to the G in 2024 but share the route with buses; live trains get their type from the fleet number.
const G_MIX: StockMix[] = [
  { stock: 'philadelphia-pcc3', cars: 1, share: 1 },
  { stock: 'philadelphia-bus', cars: 1, share: 2 },
];
const PATCO_MIX: StockMix[] = [
  { stock: 'philadelphia-patco-1', cars: 4, share: 2 },
  { stock: 'philadelphia-patco-2', cars: 4, share: 1 },
  { stock: 'philadelphia-patco-1', cars: 6, share: 1 },
];
const RR_MIX: StockMix[] = [
  { stock: 'philadelphia-silverliner-4', cars: 4, share: 5 },
  { stock: 'philadelphia-silverliner-5', cars: 4, share: 3 },
  { stock: 'philadelphia-pushpull', cars: 5, share: 1 },
];

const RR_LINES: [string, string][] = [
  ['AIR', 'Airport Line'],
  ['CHE', 'Chestnut Hill East Line'],
  ['CHW', 'Chestnut Hill West Line'],
  ['CYN', 'Cynwyd Line'],
  ['FOX', 'Fox Chase Line'],
  ['LAN', 'Lansdale/Doylestown Line'],
  ['MED', 'Media/Wawa Line'],
  ['NOR', 'Manayunk/Norristown Line'],
  ['PAO', 'Paoli/Thorndale Line'],
  ['TRE', 'Trenton Line'],
  ['WAR', 'Warminster Line'],
  ['WIL', 'Wilmington/Newark Line'],
  ['WTR', 'West Trenton Line'],
];

const trolley = (id: string, name: string): LineConfig => ({
  id: id.toLowerCase(),
  system: 'septa-trolley',
  match: { feed: 'septa', routeId: id },
  name,
  short: id,
  kind: 'light',
  bullet: 'circle',
  stock: 'philadelphia-klrv',
  osm: ['tram', 'light_rail', 'subway'],
});

await buildGtfsCity({
  city: 'philadelphia',
  feeds: [
    { id: 'septa', url: `${DIR}/pub/google_bus.zip` },
    { id: 'rail', url: `${DIR}/pub/google_rail.zip` },
    { id: 'patco', url: 'https://rapid.nationalrtap.org/GTFSFileManagement/UserUploadFiles/13562/PATCO_GTFS.zip', file: 'patco.zip' },
  ],
  systems: [
    { id: 'septa-metro', name: 'SEPTA Metro', live: 'scheduled' },
    { id: 'septa-trolley', name: 'Trolley', live: 'realtime' },
    { id: 'patco', name: 'PATCO', live: 'scheduled' },
    { id: 'septa-rr', name: 'Regional Rail', live: 'realtime' },
  ],
  lines: [
    { id: 'l', system: 'septa-metro', match: { feed: 'septa', routeId: 'L1' }, name: 'L Market–Frankford', short: 'L', kind: 'metro', bullet: 'circle', stock: L_MIX, osm: ['subway', 'rail'] },
    { id: 'b1', system: 'septa-metro', match: { feed: 'septa', routeId: 'B1' }, name: 'B1 Broad Street Local', short: 'B1', kind: 'metro', bullet: 'circle', stock: B_MIX, osm: ['subway'] },
    { id: 'b2', system: 'septa-metro', match: { feed: 'septa', routeId: 'B2' }, name: 'B2 Broad Street Express', short: 'B2', kind: 'metro', bullet: 'circle', stock: [{ stock: 'philadelphia-b4', cars: 6 }], osm: ['subway'] },
    { id: 'b3', system: 'septa-metro', match: { feed: 'septa', routeId: 'B3' }, name: 'B3 Broad-Ridge Spur', short: 'B3', kind: 'metro', bullet: 'circle', stock: [{ stock: 'philadelphia-b4', cars: 4 }], osm: ['subway'] },
    trolley('T1', 'T1 Lancaster Avenue'),
    trolley('T2', 'T2 Baltimore Avenue (Angora)'),
    trolley('T3', 'T3 Chester Avenue'),
    trolley('T4', 'T4 Woodland Avenue'),
    trolley('T5', 'T5 Elmwood Avenue (Eastwick)'),
    { id: 'g', system: 'septa-trolley', match: { feed: 'septa', routeId: 'G1' }, name: 'G Girard Avenue', short: 'G', kind: 'tram', bullet: 'circle', stock: G_MIX, osm: ['tram'] },
    { id: 'd1', system: 'septa-trolley', match: { feed: 'septa', routeId: 'D1' }, name: 'D1 Media', short: 'D1', kind: 'light', bullet: 'circle', stock: 'philadelphia-dlrv', osm: ['tram', 'light_rail'] },
    { id: 'd2', system: 'septa-trolley', match: { feed: 'septa', routeId: 'D2' }, name: 'D2 Sharon Hill', short: 'D2', kind: 'light', bullet: 'circle', stock: 'philadelphia-dlrv', osm: ['tram', 'light_rail'] },
    { id: 'm', system: 'septa-trolley', match: { feed: 'septa', routeId: 'M1' }, name: 'M Norristown High Speed Line', short: 'M', kind: 'light', bullet: 'circle', stock: [{ stock: 'philadelphia-n5', cars: 2 }], osm: ['light_rail', 'subway', 'rail'] },
    { id: 'patco', system: 'patco', match: { feed: 'patco' }, name: 'PATCO Speedline', short: 'P', kind: 'metro', bullet: 'circle', stock: PATCO_MIX, osm: ['subway', 'rail'] },
    ...RR_LINES.map(([id, name]): LineConfig => ({
      id: `rr-${id.toLowerCase()}`,
      system: 'septa-rr',
      match: { feed: 'rail', routeId: id },
      name,
      short: id,
      kind: 'rail',
      bullet: 'pill',
      stock: RR_MIX,
      osm: ['rail'],
    })),
  ],
  stations: {
    idPrefix: 'phl',
    maxSpread: 120,
    name: (n) =>
      n
        .replace(/ Transit Center$/, ' TC')
        .replace(/ Station - (BSL|MFL)$/, '')
        .replace(/^Race Vine$/, 'Race-Vine')
        .replace(/ Septa$/, '')
        .replace(/ - ?(FS|NS|MBFS|MBNS)$/, '') // far side / near side / midblock stop positions
        .replace(/ Station$/, '')
        .replace(/^Gray 30th St$/, '30th Street')
        .trim(),
  },
  trips: {
    // A handful of L1 trips list only a few stations (69th St straight to 15th St); they are not real service patterns.
    keepTrip: ({ feed, route, stopIds }) => feed !== 'septa' || (METRO_ROUTES.includes(route.route_id) && (route.route_id !== 'L1' || stopIds.length >= 20)),
    dir: (t) => {
      if (t.feed === 'rail') return t.trip.direction_id === '0' ? 'Inbound' : 'Outbound';
      if (t.feed === 'patco') return t.trip.direction_id === '0' ? 'Westbound' : 'Eastbound';
      return undefined;
    },
    service: (t) => (t.route.route_id === 'B2' ? 'Express' : undefined),
    label: (t) => (t.feed === 'rail' && t.trip.trip_short_name ? `Train ${t.trip.trip_short_name.replace(/^[A-Z]+/, '')}` : undefined),
    // Regional Rail: SEPTA's TrainView names trains by number; the route prefix keeps them apart from bus-feed trip_ids.
    rtKey: (t) => (t.feed === 'rail' ? t.trip.trip_short_name : t.trip.trip_id),
  },
  realtimeKeys: true,
  days: { from: -2, to: 45 },
  attribution: ['Timetables and realtime: SEPTA', 'Timetables: PATCO / DRPA', 'Track levels © OpenStreetMap contributors'],
});

// The Frankford El runs on its viaduct from the Front St portal to Frankford TC, and the Market St El from the 44th St
// portal to 63rd St, but OSM leaves some of its ways untagged: lift every at-grade point of those stretches.
const OUT = 'public/data/philadelphia/transit.json';
const transit = JSON.parse(readFileSync(OUT, 'utf8')) as import('../shared/types.ts').TransitData;
const WEST_GRADE = new Set(['69th Street TC', 'Millbourne']);
const name = new Map(transit.stations.map((s) => [s.id, s.name]));
for (const s of transit.segments) {
  if (!s.lines.includes('l') || !s.el || WEST_GRADE.has(name.get(s.from)!) || WEST_GRADE.has(name.get(s.to)!)) continue;
  const ramp = s.el.lastIndexOf(-1) + 3; // keep the portal ramp at grade
  s.el = s.el.map((e, i) => (e === 0 && i >= ramp ? 1 : e));
}
writeFileSync(OUT, JSON.stringify(transit));

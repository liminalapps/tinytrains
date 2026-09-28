// Amsterdam: GVB metro and trams from the OVapi national GTFS (keyless). OVapi's GTFS-realtime shares its trip ids.
// Run: npx tsx scripts/build-amsterdam.ts [--refresh] [--debug]
import { buildGtfsCity } from './lib/gtfs/index.ts';

const METRO: [string, string][] = [
  ['50', 'Isolatorweg – Gein'],
  ['51', 'Centraal Station – Isolatorweg'],
  ['52', 'Noord – Zuid'],
  ['53', 'Centraal Station – Gaasperplas'],
  ['54', 'Centraal Station – Gein'],
];

/** GVB tram line colors (network map). */
const TRAM_COLOR: Record<string, string> = {
  '1': '#E94F2D', '2': '#3AAA35', '4': '#ED6EA7', '5': '#7C6EB0', '6': '#E30613', '7': '#F39872', '12': '#A69DCD',
  '13': '#AFCA0B', '14': '#E71984', '17': '#86BC25', '19': '#ED6942', '24': '#00853E', '25': '#E30613', '26': '#6859A2',
  '27': '#00A295', '29': '#ED6942',
};

// Fleet: 27 M5 (6 cars), 43 M7 three-car units (usually coupled pairs) and ~28 M4 units (2-3 coupled); M5 alone on 52.
const METRO_MIX = [
  { stock: 'amsterdam-m7', cars: 6, share: 45 },
  { stock: 'amsterdam-m5', cars: 6, share: 30 },
  { stock: 'amsterdam-m4', cars: 3, share: 25 },
];
const COMBINO = { stock: 'amsterdam-combino', cars: 1 };
const URBOS = { stock: 'amsterdam-15g', cars: 1 };
const TRAM_MIX: Record<string, { stock: string; cars: number; share: number }[]> = {
  '5': [{ ...URBOS, share: 9 }, { ...COMBINO, share: 1 }],
  '6': [{ ...URBOS, share: 1 }],
  '19': [{ ...URBOS, share: 7 }, { ...COMBINO, share: 3 }],
  '25': [{ stock: 'amsterdam-15g-rnet', cars: 1, share: 1 }],
  '26': [{ stock: 'amsterdam-combino', cars: 2, share: 1 }],
  '29': [{ ...URBOS, share: 1 }],
};

await buildGtfsCity({
  city: 'amsterdam',
  feeds: [{ id: 'nl', url: 'https://gtfs.ovapi.nl/nl/gtfs-nl.zip' }],
  systems: [
    { id: 'metro', name: 'Metro', live: 'realtime' },
    { id: 'tram', name: 'Tram', live: 'realtime' },
  ],
  lines: METRO.map(([n, long]) => ({
    id: `m${n}`,
    system: 'metro',
    match: { agency: 'GVB', routeType: 1, shortName: n },
    name: `Metro ${n} ${long}`,
    short: n,
    kind: 'metro' as const,
    bullet: 'circle' as const,
    stock: n === '52' ? [{ stock: 'amsterdam-m5', cars: 6 }] : METRO_MIX,
    osm: ['subway', 'light_rail'],
  })),
  routes: {
    match: { agency: 'GVB', routeType: 0 },
    line: (r) => ({
      id: `t${r.route_short_name}`,
      system: 'tram',
      name: `Tram ${r.route_short_name}`,
      short: r.route_short_name,
      color: TRAM_COLOR[r.route_short_name] ?? '#1D5CA8',
      kind: 'tram',
      bullet: 'square',
      stock: TRAM_MIX[r.route_short_name] ?? [{ ...COMBINO, share: 1 }],
    }),
  },
  stations: { idPrefix: 'ams', name: (n) => n.replace(/^Amsterdam,\s*/, '').trim() },
  realtimeKeys: true,
  geometry: { variants: 'merge' },
  days: { from: -2, to: 30 },
  attribution: ['Timetables & realtime: GVB via OVapi / NDOV Loket', 'Track levels © OpenStreetMap contributors'],
});

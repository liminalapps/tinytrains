// Boston: MBTA subway (Red, Orange, Blue, Mattapan), Green Line and Commuter Rail from the MBTA GTFS (keyless).
// Run: npx tsx scripts/build-boston.ts [--refresh] [--debug]
import { buildGtfsCity, type StockMix } from './lib/gtfs/index.ts';

const DIRS: Record<string, [string, string]> = {
  Red: ['Southbound', 'Northbound'],
  Orange: ['Southbound', 'Northbound'],
  Blue: ['Westbound', 'Eastbound'],
  Green: ['Westbound', 'Eastbound'],
  Mattapan: ['Outbound', 'Inbound'],
  CR: ['Outbound', 'Inbound'],
};

// Timetable fallback shares, from the fleet in service in fall 2026. Live trains get their stock from car numbers.
const RED_MIX: StockMix[] = [
  { stock: 'boston-red-4', cars: 6, share: 4 },
  { stock: 'boston-red-3', cars: 6, share: 3 },
  { stock: 'boston-red-2', cars: 6, share: 2.5 },
  { stock: 'boston-red-1', cars: 6, share: 0.5 },
];
const GREEN_MIX: StockMix[] = [
  { stock: 'boston-type8', cars: 2, share: 4 },
  { stock: 'boston-type7', cars: 2, share: 3 },
  { stock: 'boston-type9', cars: 2, share: 1 },
];
const CR_MIX: StockMix[] = [
  { stock: 'boston-cr-rotem', cars: 6, share: 3 },
  { stock: 'boston-cr-kawasaki', cars: 6, share: 1 },
];

// MBTA has no bullets for Commuter Rail lines; these two-letter codes keep the purple pills apart.
const CR_LINES: [string, string, string][] = [
  ['Fairmount', 'Fairmount Line', 'FM'],
  ['NewBedford', 'Fall River/New Bedford Line', 'NB'],
  ['Fitchburg', 'Fitchburg Line', 'FI'],
  ['Worcester', 'Framingham/Worcester Line', 'WO'],
  ['Franklin', 'Franklin/Foxboro Line', 'FR'],
  ['Greenbush', 'Greenbush Line', 'GB'],
  ['Haverhill', 'Haverhill Line', 'HV'],
  ['Kingston', 'Kingston Line', 'KG'],
  ['Lowell', 'Lowell Line', 'LO'],
  ['Needham', 'Needham Line', 'NE'],
  ['Newburyport', 'Newburyport/Rockport Line', 'NR'],
  ['Providence', 'Providence/Stoughton Line', 'PV'],
  ['Foxboro', 'Foxboro Event Service', 'FX'],
];

await buildGtfsCity({
  city: 'boston',
  feeds: [{ id: 'mbta', url: 'https://cdn.mbta.com/MBTA_GTFS.zip' }],
  systems: [
    { id: 'mbta-subway', name: 'Subway', live: 'realtime' },
    { id: 'mbta-green', name: 'Green Line', live: 'realtime' },
    { id: 'mbta-cr', name: 'Commuter Rail', live: 'realtime' },
  ],
  lines: [
    { id: 'red', system: 'mbta-subway', match: { routeId: 'Red' }, name: 'Red Line', short: 'RL', kind: 'metro', bullet: 'circle', stock: RED_MIX, osm: ['subway'] },
    {
      id: 'mattapan',
      system: 'mbta-subway',
      match: { routeId: 'Mattapan' },
      name: 'Mattapan Line',
      short: 'M',
      kind: 'light',
      bullet: 'circle',
      stock: 'boston-pcc',
      osm: ['light_rail', 'tram'],
    },
    {
      id: 'orange',
      system: 'mbta-subway',
      match: { routeId: 'Orange' },
      name: 'Orange Line',
      short: 'OL',
      kind: 'metro',
      bullet: 'circle',
      stock: [{ stock: 'boston-orange-crrc', cars: 6 }],
      osm: ['subway'],
    },
    {
      id: 'blue',
      system: 'mbta-subway',
      match: { routeId: 'Blue' },
      name: 'Blue Line',
      short: 'BL',
      kind: 'metro',
      bullet: 'circle',
      stock: [{ stock: 'boston-blue-siemens', cars: 6 }],
      osm: ['subway'],
    },
    ...(['B', 'C', 'D', 'E'] as const).map((b) => ({
      id: `green-${b.toLowerCase()}`,
      system: 'mbta-green',
      match: { routeId: `Green-${b}` },
      name: `Green Line ${b}`,
      short: b,
      kind: 'light' as const,
      bullet: 'circle' as const,
      stock: GREEN_MIX,
      osm: ['light_rail', 'tram', 'subway'],
    })),
    ...CR_LINES.map(([id, name, short]) => ({
      id: `cr-${id.toLowerCase()}`,
      system: 'mbta-cr',
      match: { routeId: `CR-${id}` },
      name,
      short,
      kind: 'rail' as const,
      bullet: 'pill' as const,
      stock: CR_MIX,
    })),
  ],
  stations: { idPrefix: 'bos', maxSpread: 100 },
  trips: {
    // Replacement buses ride on rail routes with trip_route_type 3.
    keep: (t) => t.trip.trip_route_type !== '3',
    dir: (t) => {
      const key = t.route.route_id.startsWith('CR-') ? 'CR' : t.route.route_id.startsWith('Green-') ? 'Green' : t.route.route_id;
      return DIRS[key]?.[Number(t.trip.direction_id)];
    },
    label: (t) => (t.route.route_id.startsWith('CR-') && t.trip.trip_short_name ? `Train ${t.trip.trip_short_name}` : undefined),
  },
  realtimeKeys: true,
  days: { from: -2, to: 60 },
  attribution: ['Timetables and realtime: MBTA', 'Track levels © OpenStreetMap contributors'],
});

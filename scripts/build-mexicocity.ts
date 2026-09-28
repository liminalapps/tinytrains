// Mexico City: STC Metro (lines 1–9, A, B, 12), Tren Ligero "El Ajolote" and Tren Suburbano, from SEMOVI's GTFS
// (keyless; datos.cdmx.gob.mx is geo-fenced, so we use the Mobility Database mirror, feed 1830).
// The feed runs every line at one flat headway all day, with no dwell times, and its calendar ended in 2025. Before
// handing it to the GTFS kit we cut it down to the rail routes and rewrite it: frequencies by time of day from STC
// fleet sizes and run times, 25–35 s dwells, calendars for 2026–27 with Mexico's federal holidays on the Sunday
// service, and the renovated Tren Ligero's 30-minute run.
// Run: npx tsx scripts/build-mexicocity.ts [--refresh] [--debug]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { buildGtfsCity, type LineConfig, type StockMix } from './lib/gtfs/index.ts';
import { ROOT, UA } from './lib/gtfs/feed.ts';

const CACHE = join(ROOT, '.cache/mexicocity');
const SRC_URL = 'https://files.mobilitydatabase.org/mdb-1830/latest.zip';
const SRC_ZIP = join(CACHE, 'semovi.zip');
const OUT_ZIP = join(CACHE, 'semovi-rail.zip');
const RAIL_AGENCIES = new Set(['METRO', 'TL', 'SUB']);

type Row = Record<string, string>;
/** [from HH:MM, multiple of the line's weekday peak headway]; each band runs until the next or the day's end. */
type Bands = [string, number][];
interface Day {
  service: string; // GTFS service_id in the SEMOVI feed
  end: string; // service ends (no departures from the terminals after this)
  bands: Bands;
}

// STC Metro hours: weekdays 05:00–24:00, Saturdays 06:00–24:00, Sundays and holidays 07:00–24:00. Peaks 06:30–09:30
// and 17:00–20:30; trains thin out after 22:00.
const METRO_DAYS: Day[] = [
  { service: 'B_1', end: '24:00', bands: [['05:00', 1.6], ['06:30', 1], ['09:30', 1.4], ['17:00', 1], ['20:30', 1.6], ['22:00', 2.2]] },
  { service: 'B_2', end: '24:00', bands: [['06:00', 1.8], ['09:00', 1.5], ['20:00', 2.2]] },
  { service: 'B_3', end: '24:00', bands: [['07:00', 2], ['10:00', 1.7], ['20:00', 2.4]] },
];
// Tren Ligero: every 4 minutes at peaks since the May 2026 reopening; last trains 23:30.
const TL_DAYS: Day[] = [
  { service: 'B_1', end: '23:30', bands: [['05:00', 1.5], ['06:30', 1], ['09:30', 1.25], ['17:00', 1], ['20:30', 1.5]] },
  { service: 'B_2', end: '23:30', bands: [['06:00', 1.5], ['09:00', 1.25], ['20:00', 1.5]] },
  { service: 'B_3', end: '23:30', bands: [['07:00', 1.75], ['10:00', 1.5], ['20:00', 1.75]] },
];
// Tren Suburbano: weekdays 05:00–00:30, Saturdays from 06:00, Sundays from 07:00.
const SUB_DAYS: Day[] = [
  { service: 'B_1', end: '24:30', bands: [['05:00', 1.7], ['06:00', 1], ['09:30', 1.7], ['17:00', 1.2], ['20:30', 2]] },
  { service: 'B_2', end: '24:30', bands: [['06:00', 2], ['20:30', 2.5]] },
  { service: 'B_3', end: '24:30', bands: [['07:00', 2.5]] },
];

interface MxLine {
  id: string;
  route: string; // SEMOVI route_id
  system: 'metro' | 'tl' | 'sub';
  name: string;
  short: string;
  color: string;
  textColor: string;
  kind: 'metro' | 'light' | 'rail';
  bullet: 'square' | 'circle';
  /** Weekday peak headway, seconds. From the trains STC assigns to the line and their round-trip time. */
  peak: number;
  days: Day[];
  stock: StockMix[];
  /** Scale the feed's running times so a terminal-to-terminal trip takes this many minutes. */
  minutes?: number;
}

const metro = (n: string, color: string, peak: number, stock: StockMix[], textColor = '#FFFFFF'): MxLine => ({
  id: `l${n.toLowerCase()}`,
  route: n === '12' ? 'B_CMX020L12' : `B_CMX0200L${n}`,
  system: 'metro',
  name: `Línea ${n}`,
  short: n,
  color,
  textColor,
  kind: 'metro',
  bullet: 'square',
  peak,
  days: METRO_DAYS,
  stock,
});
const mix = (...m: [string, number, number][]): StockMix[] => m.map(([stock, cars, share]) => ({ stock: `mexicocity-${stock}`, cars, share }));

// Official line colors (STC's Pantone values, as in OSM). Fleet shares: STC's assignment by line, fall 2026.
const LINES: MxLine[] = [
  metro('1', '#F04E98', 135, mix(['nm22', 9, 29], ['nm16', 9, 10])),
  metro('2', '#005EB8', 145, mix(['nm02', 9, 1])),
  metro('3', '#AF9800', 120, mix(['nm79', 9, 20], ['nm83', 9, 19], ['ne92', 9, 15])),
  metro('4', '#6BBBAE', 240, mix(['nm73', 6, 1])),
  metro('5', '#FFD100', 165, mix(['mp68', 9, 15], ['nm73', 9, 10]), '#2D2926'),
  metro('6', '#DA291C', 225, mix(['nm73', 6, 10], ['nc82', 9, 3], ['nm83', 9, 2])),
  metro('7', '#E87722', 140, mix(['nm83', 9, 12], ['nm79', 9, 10], ['nm73', 9, 6], ['nm02', 9, 4])),
  metro('8', '#009A44', 170, mix(['mp82', 9, 25], ['nm79', 9, 5])),
  metro('9', '#512F2E', 125, mix(['nc82', 9, 15], ['nm79', 9, 10], ['nm83', 9, 9])),
  metro('A', '#981D97', 180, mix(['fm86', 9, 19], ['fe07', 9, 9])),
  // Line B's sign is split green and gray; gray keeps it apart from Line 8's green on the map.
  metro('B', '#B1B3B3', 170, mix(['mp68', 9, 1]), '#00843D'),
  metro('12', '#B0A32A', 270, mix(['fe10', 7, 1])),
  {
    id: 'tl',
    route: 'B_CMX0600L1',
    system: 'tl',
    name: 'Tren Ligero',
    short: 'TL',
    color: '#0057B8',
    textColor: '#FFFFFF',
    kind: 'light',
    bullet: 'square',
    peak: 240,
    days: TL_DAYS,
    stock: mix(['te25', 2, 17], ['te23', 2, 9], ['te95', 2, 5]),
    minutes: 30,
  },
  {
    id: 'sub',
    route: 'B_CMX0700L1',
    system: 'sub',
    name: 'Tren Suburbano',
    short: 'S',
    color: '#BE1C00',
    textColor: '#FFFFFF',
    kind: 'rail',
    bullet: 'circle',
    peak: 360,
    days: SUB_DAYS,
    stock: mix(['suburbano', 4, 1], ['suburbano', 8, 1]),
  },
];

// Federal holidays (Ley Federal del Trabajo, art. 74): the Metro runs its Sunday service.
const HOLIDAYS = [
  '2026-01-01', '2026-02-02', '2026-03-16', '2026-05-01', '2026-09-16', '2026-11-16', '2026-12-25',
  '2027-01-01', '2027-02-01', '2027-03-15', '2027-05-01', '2027-09-16', '2027-11-15', '2027-12-25',
];

// The feed's names, cleaned up to the official spellings on STC signs.
const RENAME: Record<string, string> = {
  'Garibaldi y Lagunilla': 'Garibaldi/Lagunilla',
  'La Villa y Basílica': 'La Villa-Basílica',
  'Etiopía y Plaza de la Transparencia': 'Etiopía/Plaza de la Transparencia',
  'Ferrería y Arena Ciudad de México': 'Ferrería/Arena Ciudad de México',
  'Niños Héroes y Poder Judicial CDMX': 'Niños Héroes/Poder Judicial CDMX',
  'Viveros y Derechos Humanos': 'Viveros/Derechos Humanos',
  'Penón Viejo': 'Peñón Viejo',
  Zócalo: 'Zócalo/Tenochtitlan',
  'Periférico Participación Ciudadana': 'Periférico/Participación Ciudadana',
};
const cleanName = (n: string) => {
  const s = n.replace(/\s+/g, ' ').trim();
  return RENAME[s] ?? s;
};

// ------------------------------------------------------------------------------------------------ feed rewrite

const secs = (t: string) => {
  const [h, m, s] = t.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
};
const hms = (t: number) => {
  const r = Math.round(t);
  return `${String(Math.floor(r / 3600)).padStart(2, '0')}:${String(Math.floor((r % 3600) / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}`;
};
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
function writeTable(dir: string, name: string, cols: string[], rows: Row[]) {
  writeFileSync(join(dir, name), [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c] ?? '')).join(','))].join('\n') + '\n');
}

async function rewriteFeed(): Promise<string> {
  mkdirSync(CACHE, { recursive: true });
  if (process.argv.includes('--refresh') || !existsSync(SRC_ZIP)) {
    console.log(`downloading ${SRC_URL}`);
    const res = await fetch(SRC_URL, { headers: { 'user-agent': UA } });
    if (!res.ok) throw new Error(`SEMOVI GTFS: HTTP ${res.status}`);
    writeFileSync(SRC_ZIP, Buffer.from(await res.arrayBuffer()));
  }
  const src = join(CACHE, 'semovi-src');
  const out = join(CACHE, 'semovi-rail');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(src, { recursive: true });
  mkdirSync(out, { recursive: true });
  execFileSync('unzip', ['-o', '-q', '-j', SRC_ZIP, '-d', src]);
  const read = (f: string): Row[] => parse(readFileSync(join(src, f)), { columns: true, skip_empty_lines: true, trim: true, bom: true });

  const byRoute = new Map(LINES.map((l) => [l.route, l]));
  const routes = read('routes.txt').filter((r) => RAIL_AGENCIES.has(r.agency_id) && byRoute.has(r.route_id));
  const services = new Set(METRO_DAYS.map((d) => d.service));
  const trips = read('trips.txt').filter((t) => byRoute.has(t.route_id) && services.has(t.service_id));
  const tripLine = new Map(trips.map((t) => [t.trip_id, byRoute.get(t.route_id)!]));
  const stopTimes = read('stop_times.txt').filter((s) => tripLine.has(s.trip_id));
  const usedStops = new Set(stopTimes.map((s) => s.stop_id));
  const stops = read('stops.txt').filter((s) => usedStops.has(s.stop_id));
  const usedShapes = new Set(trips.map((t) => t.shape_id));
  const shapes = read('shapes.txt').filter((s) => usedShapes.has(s.shape_id));

  // Stations served by more than one line (by name) get a longer dwell.
  const stopName = new Map(stops.map((s) => [s.stop_id, cleanName(s.stop_name)]));
  const linesAt = new Map<string, Set<string>>();
  for (const s of stopTimes) {
    const n = stopName.get(s.stop_id)!;
    if (!linesAt.has(n)) linesAt.set(n, new Set());
    linesAt.get(n)!.add(tripLine.get(s.trip_id)!.id);
  }

  // Running times: the feed's (scaled where a line's published trip time differs), plus dwells at every stop but the ends.
  const timed = new Map<string, Row[]>();
  for (const st of stopTimes) {
    if (!timed.has(st.trip_id)) timed.set(st.trip_id, []);
    timed.get(st.trip_id)!.push(st);
  }
  for (const [tripId, list] of timed) {
    list.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
    const line = tripLine.get(tripId)!;
    const t0 = secs(list[0].departure_time);
    const run = secs(list.at(-1)!.arrival_time) - t0;
    const n = list.length;
    const dwell = (i: number) => (i === 0 || i === n - 1 ? 0 : linesAt.get(stopName.get(list[i].stop_id)!)!.size > 1 ? 35 : 25);
    const dwells = list.reduce((sum, _, i) => sum + dwell(i), 0);
    // Dwells come out of the running time, so a line keeps its terminal-to-terminal time.
    const k = ((line.minutes ? line.minutes * 60 : run) - dwells) / run;
    let before = 0;
    timed.set(
      tripId,
      list.map((st, i) => {
        const t = (secs(st.arrival_time) - t0) * k + before;
        before += dwell(i);
        return { stop_id: st.stop_id, stop_sequence: String(i + 1), arrival_time: hms(t), departure_time: hms(t + dwell(i)), timepoint: '1' };
      }),
    );
  }

  // Frequencies: one trip template per time band, per direction and day type, each with a single frequencies row.
  const outTrips: Row[] = [];
  const outTimes: Row[] = [];
  const freqs: Row[] = [];
  for (const t of trips) {
    const line = tripLine.get(t.trip_id)!;
    const day = line.days.find((d) => d.service === t.service_id);
    if (!day) continue;
    day.bands.forEach(([from, k], i) => {
      const id = `${t.trip_id}~${i}`;
      const to = day.bands[i + 1]?.[0] ?? day.end;
      const headway = Math.max(90, Math.round((line.peak * k) / 15) * 15);
      outTrips.push({ ...t, trip_id: id });
      for (const st of timed.get(t.trip_id)!) outTimes.push({ ...st, trip_id: id });
      freqs.push({ trip_id: id, start_time: `${from}:00`, end_time: `${to}:00`, headway_secs: String(headway), exact_times: '0' });
    });
  }

  const calendar: Row[] = [
    ['B_1', '1111100'],
    ['B_2', '0000010'],
    ['B_3', '0000001'],
  ].map(([id, days]) => {
    const names = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    return { service_id: id, ...Object.fromEntries(names.map((n, i) => [n, days[i]])), start_date: '20260101', end_date: '20271231' };
  });
  const calendarDates: Row[] = [];
  for (const h of HOLIDAYS) {
    const date = h.replace(/-/g, '');
    const dow = new Date(`${h}T12:00:00Z`).getUTCDay();
    if (dow === 0) continue;
    calendarDates.push({ service_id: dow === 6 ? 'B_2' : 'B_1', date, exception_type: '2' }, { service_id: 'B_3', date, exception_type: '1' });
  }

  for (const s of stops) s.stop_name = cleanName(s.stop_name);
  const cols = (rows: Row[]) => Object.keys(rows[0]);
  writeTable(out, 'agency.txt', ['agency_id', 'agency_name', 'agency_url', 'agency_timezone', 'agency_lang'], read('agency.txt').filter((a) => RAIL_AGENCIES.has(a.agency_id)));
  writeTable(out, 'routes.txt', cols(routes), routes);
  writeTable(out, 'trips.txt', cols(outTrips), outTrips);
  writeTable(out, 'stops.txt', ['stop_id', 'stop_name', 'stop_lat', 'stop_lon'], stops);
  writeTable(out, 'stop_times.txt', ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence', 'timepoint'], outTimes);
  writeTable(out, 'shapes.txt', cols(shapes), shapes);
  writeTable(out, 'frequencies.txt', ['trip_id', 'start_time', 'end_time', 'headway_secs', 'exact_times'], freqs);
  writeTable(out, 'calendar.txt', cols(calendar), calendar);
  writeTable(out, 'calendar_dates.txt', ['service_id', 'date', 'exception_type'], calendarDates);
  rmSync(OUT_ZIP, { force: true });
  execFileSync('zip', ['-q', '-j', OUT_ZIP, ...['agency', 'routes', 'trips', 'stops', 'stop_times', 'shapes', 'frequencies', 'calendar', 'calendar_dates'].map((f) => join(out, `${f}.txt`))]);
  console.log(`rail feed: ${routes.length} routes, ${outTrips.length} trip templates, ${stops.length} stops, ${freqs.length} frequency bands`);
  return OUT_ZIP;
}

// ------------------------------------------------------------------------------------------------ build

const zip = await rewriteFeed();

await buildGtfsCity({
  city: 'mexicocity',
  feeds: [{ id: 'semovi', url: zip }],
  systems: [
    { id: 'metro', name: 'Metro', live: 'scheduled' },
    { id: 'tl', name: 'Tren Ligero', live: 'scheduled' },
    { id: 'sub', name: 'Tren Suburbano', live: 'scheduled' },
  ],
  lines: LINES.map(
    (l): LineConfig => ({
      id: l.id,
      system: l.system,
      match: { routeId: l.route },
      name: l.name,
      short: l.short,
      color: l.color,
      textColor: l.textColor,
      kind: l.kind,
      bullet: l.bullet,
      stock: l.stock,
      osm: l.kind === 'light' ? ['light_rail', 'tram'] : l.kind === 'rail' ? ['rail'] : ['subway', 'light_rail'],
    }),
  ),
  stations: { idPrefix: 'mx', name: cleanName },
  trips: { dest: (t) => cleanName(t.allStops.at(-1)!.name) },
  attribution: ['Timetables: SEMOVI, Gobierno de la Ciudad de México (datos.cdmx.gob.mx)', 'Headways: Tiny Trains estimates from STC fleet data', 'Track levels © OpenStreetMap contributors'],
});

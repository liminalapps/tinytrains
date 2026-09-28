// Prague: metro A/B/C, the DPP tram network, the Petřín funicular and the Esko S trains inside the city, from the
// PID static GTFS (keyless, GTFS kit). Run: ./node_modules/.bin/tsx scripts/build-prague.ts [--refresh] [--debug]
import { execFileSync } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { buildGtfsCity, type StockMix } from './lib/gtfs/index.ts';
import { REFRESH, ROOT } from './lib/gtfs/feed.ts';

// The PID feed lists railway timing points (junctions, throats, 'T…' stop ids) as pass-through stops with pickup and
// drop-off both 1. They are not stations, so a cleaned copy of the feed leaves them out.
const CACHE = join(ROOT, '.cache/prague');
const RAW = join(CACHE, 'PID_GTFS.zip');
const CLEAN = join(CACHE, 'pid-clean.zip');
async function cleanFeed() {
  mkdirSync(CACHE, { recursive: true });
  if (REFRESH || !existsSync(RAW)) {
    console.log('downloading https://data.pid.cz/PID_GTFS.zip');
    const res = await fetch('https://data.pid.cz/PID_GTFS.zip');
    if (!res.ok) throw new Error(`PID GTFS: HTTP ${res.status}`);
    writeFileSync(RAW, Buffer.from(await res.arrayBuffer()));
  }
  if (existsSync(CLEAN) && statSync(CLEAN).mtimeMs > statSync(RAW).mtimeMs) return;
  const dir = join(CACHE, 'raw');
  mkdirSync(dir, { recursive: true });
  const files = ['agency', 'calendar', 'calendar_dates', 'routes', 'shapes', 'stops', 'trips', 'stop_times'].map((f) => `${f}.txt`);
  execFileSync('unzip', ['-o', '-q', '-j', RAW, ...files, '-d', dir], { stdio: 'inherit' });
  const out = createWriteStream(join(dir, 'stop_times.clean.txt'));
  let cols: string[] | undefined;
  let dropped = 0;
  for await (const line of createInterface({ input: createReadStream(join(dir, 'stop_times.txt')) })) {
    if (!cols) {
      cols = line.split(',');
      out.write(line + '\n');
      continue;
    }
    const f = line.split(',');
    const stop = f[cols.indexOf('stop_id')];
    if (stop.startsWith('T') && f[cols.indexOf('pickup_type')] === '1' && f[cols.indexOf('drop_off_type')] === '1') {
      dropped++;
      continue;
    }
    out.write(line + '\n');
  }
  await new Promise((r) => out.end(r));
  execFileSync('mv', [join(dir, 'stop_times.clean.txt'), join(dir, 'stop_times.txt')]);
  execFileSync('rm', ['-f', CLEAN]);
  execFileSync('zip', ['-q', '-j', CLEAN, ...files.map((f) => join(dir, f))], { stdio: 'inherit' });
  console.log(`cleaned feed: ${dropped} timing-point stop times dropped`);
}
await cleanFeed();

// Timetable fallback only: live trams get their type from the fleet number (server/adapters/prague).
// Mixes follow the 2026 depot allocations seen in the live feed: 15Ts on the trunk lines, 52Ts from Hloubětín on
// 5/7/8/12, 14Ts from Kobylisy on 17/24, KT8D5s from Hloubětín on 19/22, and coupled T3 pairs on the rest.
const T15 = { stock: 'prague-15t', cars: 1 };
const T14 = { stock: 'prague-14t', cars: 1 };
const T52 = { stock: 'prague-52t', cars: 1 };
const KT8 = { stock: 'prague-kt8d5', cars: 1 };
const T3P = { stock: 'prague-t3rp', cars: 2 };
const T3L = { stock: 'prague-t3rplf', cars: 2 };
const T3N = { stock: 'prague-t3rp', cars: 1 };
const mix = (...xs: [typeof T15, number][]): StockMix[] => xs.map(([s, share]) => ({ ...s, share }));

const TRAM_MIX: Record<string, StockMix[]> = {
  '1': mix([T3P, 3], [T3L, 2], [T15, 1]),
  '2': mix([T3P, 3], [T3L, 1]),
  '3': mix([T3L, 2], [T3P, 2], [T15, 1]),
  '4': mix([T3P, 3], [T3L, 1], [T15, 1]),
  '5': mix([T15, 3], [T52, 1]),
  '6': [T15],
  '7': mix([T52, 2], [T15, 1], [T3L, 1]),
  '8': mix([T52, 2], [T15, 2]),
  '9': [T15],
  '10': [T15],
  '11': mix([T15, 3], [T3P, 1]),
  '12': mix([T52, 2], [T15, 2]),
  '13': mix([T3P, 2], [T3L, 2]),
  '14': mix([T15, 2], [T3P, 1]),
  '15': mix([T15, 3], [T3L, 1]),
  '16': mix([T15, 3], [T3L, 1]),
  '17': mix([T14, 2], [KT8, 1]),
  '18': mix([T3P, 2], [T15, 1]),
  '19': [KT8],
  '20': [T15],
  '21': mix([T3L, 2], [T3P, 2], [T15, 1]),
  '22': mix([T15, 3], [KT8, 1], [T3L, 1]),
  '23': [{ stock: 'prague-t3', cars: 1 }],
  '24': mix([T14, 2], [T15, 1]),
  '25': mix([T3P, 2], [T3L, 1], [T15, 1]),
  '26': mix([T15, 3], [T3L, 1]),
};
const tramMix = (short: string): StockMix[] => {
  if (TRAM_MIX[short]) return TRAM_MIX[short];
  if (/^9\d$/.test(short)) return mix([T3N, 1], [T15, 1]); // night trams
  if (short === '41' || short === '42') return [{ stock: 'prague-t3', cars: 1 }];
  return mix([T3P, 1], [T15, 1]);
};

// Esko: ČD CityElefants on the electrified radials; Regionova and RegioShark diesels on the Kladno, Rudná and
// Posázaví lines; RegioJet's Pesa Elf.eu units on S49 and S61 (from 2025).
const ELEFANT: StockMix[] = [{ stock: 'prague-471', cars: 3, share: 4 }, { stock: 'prague-471', cars: 6, share: 1 }];
const RAIL_STOCK: Record<string, StockMix[]> = {
  S1: ELEFANT, S2: ELEFANT, S22: ELEFANT, S3: ELEFANT, S4: ELEFANT, S7: ELEFANT, S9: ELEFANT,
  R41: ELEFANT, R42: ELEFANT, R43: ELEFANT, R44: ELEFANT, R49: ELEFANT,
  S49: [{ stock: 'prague-655', cars: 3 }],
  S61: [{ stock: 'prague-655', cars: 3 }],
  S5: [{ stock: 'prague-844', cars: 1, share: 1 }, { stock: 'prague-844', cars: 2, share: 1 }],
  S54: [{ stock: 'prague-844', cars: 1 }],
  S65: [{ stock: 'prague-844', cars: 1 }],
  R45: [{ stock: 'prague-844', cars: 2 }],
  S6: [{ stock: 'prague-814', cars: 2 }],
  S8: [{ stock: 'prague-814', cars: 2 }],
  S88: [{ stock: 'prague-814', cars: 2 }],
  S34: [{ stock: 'prague-814', cars: 2 }],
};
const railStock = (short: string) => RAIL_STOCK[short] ?? [{ stock: 'prague-814', cars: 2 }];

const cleanName = (n: string) =>
  n
    .replace(/^Praha Masarykovo nádr\.$/, 'Praha Masarykovo nádraží')
    .replace(/^Praha-Smíchov spol\.n$/, 'Praha-Smíchov')
    .replace(/\bhl\.\s?n\.$/, 'hlavní nádraží')
    .replace(/\bM\.n\.-/, 'Masarykovo nádraží-')
    .replace(/\s+/g, ' ')
    .trim();

await buildGtfsCity({
  city: 'prague',
  feeds: [{ id: 'pid', url: '.cache/prague/pid-clean.zip' }],
  systems: [
    { id: 'metro', name: 'Metro', live: 'realtime' },
    { id: 'tram', name: 'Tram', live: 'realtime' },
    { id: 'esko', name: 'Esko', live: 'realtime' },
    { id: 'funicular', name: 'Funicular', live: 'scheduled' },
  ],
  lines: [
    ...([
      ['a', 'L991', [{ stock: 'prague-8171m', cars: 5 }]],
      ['b', 'L992', [{ stock: 'prague-8171m', cars: 5 }]],
      ['c', 'L993', [{ stock: 'prague-m1', cars: 5 }]],
    ] as const).map(([id, routeId, stock]) => ({
      id,
      system: 'metro',
      match: { routeId },
      name: `Metro ${id.toUpperCase()}`,
      nameLocal: `Linka ${id.toUpperCase()}`,
      short: id.toUpperCase(),
      kind: 'metro' as const,
      bullet: 'circle' as const,
      stock: [...stock],
      osm: ['subway'],
    })),
    {
      id: 'ld', system: 'funicular', match: { routeId: 'L49' }, name: 'Petřín Funicular', nameLocal: 'Lanová dráha na Petřín',
      short: 'LD', kind: 'cable', bullet: 'square', stock: [{ stock: 'prague-petrin', cars: 1 }],
    },
  ],
  routes: {
    match: { test: (r) => r.route_type === '0' || (r.route_type === '2' && /^(S\d+|R4\d)$/.test(r.route_short_name)) },
    line: (r) => {
      const s = r.route_short_name;
      if (r.route_type === '0') {
        return {
          id: `t${s}`, system: 'tram', name: `Tram ${s}`, nameLocal: `Tramvaj ${s}`, short: s,
          kind: 'tram', bullet: 'square', stock: tramMix(s),
        };
      }
      return {
        id: s.toLowerCase(), system: 'esko', name: `Esko ${s}`, short: s,
        kind: 'rail', bullet: 'pill', stock: railStock(s), osm: ['rail'],
      };
    },
  },
  // Stops of one PID node (metro, tram and rail platforms of the same interchange) share asw_node_id.
  stations: { idPrefix: 'prg', group: (s) => s.asw_node_id || s.stop_id, maxSpread: 150, name: cleanName },
  trips: {
    dest: (t) => cleanName(t.trip.trip_headsign || t.allStops.at(-1)!.name),
    label: (t) => (/^[sr]\d/.test(t.line) ? t.trip.trip_short_name || undefined : undefined),
  },
  realtimeKeys: true,
  days: { from: -2, to: 40 },
  attribution: ['Timetables and realtime: PID / ROPID open data (CC BY 4.0)', 'Track levels © OpenStreetMap contributors'],
});

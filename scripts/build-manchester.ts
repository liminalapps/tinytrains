// Manchester: Metrolink from TfGM's GTFS (keyless, Open Government Licence). The feed files every tram under a handful
// of route ids whose names drift between timetable versions, so trips are sorted into the services on TfGM's network
// map by the branches they run over, and written to a small Metrolink-only feed the GTFS kit then builds from.
// Run: npx tsx scripts/build-manchester.ts [--refresh] [--debug]
import { createReadStream, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { buildGtfsCity, type LineConfig, type StockMix } from './lib/gtfs/index.ts';
import { splitCsv } from './lib/gtfs/feed.ts';

const DIR = '.cache/manchester';
const RAW = `${DIR}/raw`;
const OUT = `${DIR}/metrolink`;
const METROLINK = '7778482'; // TfGM agency_id of Metrolink (agency_noc METL)

if (process.argv.includes('--refresh') || !existsSync(`${RAW}/stop_times.txt`)) {
  mkdirSync(DIR, { recursive: true });
  console.log('downloading TfGM GTFS');
  const res = await fetch('https://odata.tfgm.com/opendata/downloads/TfGMgtfsnew.zip');
  if (!res.ok) throw new Error(`TfGM GTFS: HTTP ${res.status}`);
  writeFileSync(`${DIR}/tfgm.zip`, new Uint8Array(await res.arrayBuffer()));
  execFileSync('unzip', ['-o', '-q', `${DIR}/tfgm.zip`, '-d', RAW]);
}

// ------------------------------------------------------------------------------------------------ services
// Stops are keyed by the three-letter code in their ATCO code (9400ZZMA<TLA><platform>), the same code TfGM's
// departure boards use.
const tla = (atco: string) => atco.replace(/^9400ZZMA/, '').replace(/\d+$/, '');
const set = (s: string) => new Set(s.split(' '));
const ALT = set('ALT NAV TIM BKS SLE DNE SFD');
const BURY = set('BUR RAD WFD BOB PWC HEA BOW');
const ECCLES = set('ECC LDY WST LWY BWY');
const ASHTON = set('AUL AWT AMO AUD DRO CEM ELN CLN VPK');
const QUAYS = set('MCU HCY ANC SQY EXC POM');
const CITY_NORTH = set('MKT SHU EXS VIC');

interface Service {
  id: string;
  name: string;
  color: string;
  text: string;
}
const SERVICES: Service[] = [
  { id: 'alt-bury', name: 'Altrincham – Bury', color: '#28AA3B', text: '#FFFFFF' },
  { id: 'alt-pic', name: 'Altrincham – Piccadilly / Etihad Campus', color: '#7B2082', text: '#FFFFFF' },
  { id: 'bury-pic', name: 'Bury – Piccadilly', color: '#EFBB00', text: '#231F20' },
  { id: 'ash-ecc', name: 'Ashton-under-Lyne – Eccles', color: '#59C6F2', text: '#231F20' },
  { id: 'eti-mcu', name: 'Etihad Campus – MediaCityUK', color: '#F18800', text: '#231F20' },
  { id: 'edy-roc', name: 'East Didsbury – Rochdale Town Centre', color: '#FE79B0', text: '#231F20' },
  { id: 'edy-sha', name: 'East Didsbury – Shaw and Crompton', color: '#827846', text: '#FFFFFF' },
  { id: 'trc-cru', name: 'The Trafford Centre – Crumpsall', color: '#E70310', text: '#FFFFFF' },
  { id: 'air-vic', name: 'Manchester Airport – Victoria', color: '#0069B4', text: '#FFFFFF' },
];

/** The network-map service a trip belongs to, from TfGM's route name (reliable for Red, Navy and Pink) and its stops. */
function classify(routeName: string, stops: string[]): string | undefined {
  const has = (s: Set<string>) => stops.some((c) => s.has(c));
  const ends = [stops[0], stops[stops.length - 1]];
  if (/^Replacement/i.test(routeName)) return undefined;
  if (/^Red/.test(routeName)) return 'trc-cru';
  if (/^Navy/.test(routeName)) return 'air-vic';
  if (/^Pink/.test(routeName)) return ends.includes('SHA') && !stops.includes('RIN') ? 'edy-sha' : 'edy-roc';
  if (has(ALT)) return has(BURY) || stops.some((c) => CITY_NORTH.has(c)) ? 'alt-bury' : 'alt-pic';
  if (has(BURY)) return 'bury-pic';
  if (has(ECCLES) || has(ASHTON)) return 'ash-ecc';
  if (has(QUAYS) || stops.includes('ECS')) return 'eti-mcu';
  // City-center short workings (Deansgate-Castlefield – Trafford Bar, Piccadilly – Trafford Bar) keep their route's service.
  return { Yellow: 'ash-ecc', Purple: 'alt-pic', Green: 'alt-bury', Blue: 'bury-pic' }[routeName.split(' ')[0]];
}

// ------------------------------------------------------------------------------------------------ Metrolink-only feed
async function* csv(file: string): AsyncGenerator<{ head: string[]; cells: string[]; raw: string }> {
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let head: string[] | undefined;
  for await (const raw of rl) {
    if (!head) {
      head = splitCsv(raw.replace(/^﻿/, ''));
      yield { head, cells: head, raw };
      continue;
    }
    if (raw.trim()) yield { head, cells: splitCsv(raw), raw };
  }
}
const q = (s: string) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

if (process.argv.includes('--refresh') || !existsSync(`${DIR}/metrolink.zip`)) {
  const routeName = new Map<string, string>();
  for await (const { head, cells } of csv(`${RAW}/routes.txt`)) {
    if (cells === head) continue;
    if (cells[head.indexOf('agency_id')] === METROLINK) routeName.set(cells[0], cells[head.indexOf('route_short_name')]);
  }
  const trips = new Map<string, { route: string; line: string; cells: string[] }>();
  let tripHead: string[] = [];
  for await (const { head, cells } of csv(`${RAW}/trips.txt`)) {
    if (cells === head) {
      tripHead = head;
      continue;
    }
    const r = cells[head.indexOf('route_id')];
    if (routeName.has(r)) trips.set(cells[head.indexOf('trip_id')], { route: r, line: '', cells });
  }
  const code = new Map<string, string>();
  const stopRows = new Map<string, string>();
  let stopHead = '';
  for await (const { head, cells, raw } of csv(`${RAW}/stops.txt`)) {
    if (cells === head) {
      stopHead = raw;
      continue;
    }
    if (cells[head.indexOf('stop_code')]?.startsWith('9400ZZMA')) {
      code.set(cells[0], tla(cells[head.indexOf('stop_code')]));
      stopRows.set(cells[0], raw);
    }
  }
  const timeLines: string[] = [];
  const seq = new Map<string, [number, string][]>();
  let timeHead = '';
  for await (const { head, cells, raw } of csv(`${RAW}/stop_times.txt`)) {
    if (cells === head) {
      timeHead = raw;
      continue;
    }
    const t = cells[0];
    if (!trips.has(t)) continue;
    timeLines.push(raw);
    (seq.get(t) ?? seq.set(t, []).get(t)!).push([Number(cells[head.indexOf('stop_sequence')]), code.get(cells[head.indexOf('stop_id')]) ?? '?']);
  }
  const counts = new Map<string, number>();
  for (const [id, t] of trips) {
    const stops = (seq.get(id) ?? []).sort((a, b) => a[0] - b[0]).map((s) => s[1]);
    t.line = (stops.length >= 2 && classify(routeName.get(t.route)!, stops)) || '';
    const k = `${routeName.get(t.route)} -> ${t.line || '(dropped)'}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  for (const [k, n] of [...counts].sort()) console.log(`  ${k}: ${n}`);
  const kept = new Set([...trips].filter(([, t]) => t.line).map(([id]) => id));

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const ri = tripHead.indexOf('route_id');
  const si = tripHead.indexOf('shape_id');
  const services = new Set<string>();
  const shapes = new Set<string>();
  const tripOut = [tripHead.join(',')];
  for (const id of kept) {
    const t = trips.get(id)!;
    const cells = [...t.cells];
    cells[ri] = t.line;
    services.add(cells[tripHead.indexOf('service_id')]);
    if (si >= 0 && cells[si]) shapes.add(cells[si]);
    tripOut.push(cells.map(q).join(','));
  }
  writeFileSync(`${OUT}/trips.txt`, tripOut.join('\n') + '\n');
  writeFileSync(
    `${OUT}/routes.txt`,
    ['route_id,agency_id,route_short_name,route_long_name,route_type,route_color,route_text_color']
      .concat(SERVICES.map((s) => `${s.id},${METROLINK},${s.id},${q(s.name)},0,${s.color.slice(1)},${s.text.slice(1)}`))
      .join('\n') + '\n',
  );
  writeFileSync(`${OUT}/stop_times.txt`, [timeHead, ...timeLines.filter((l) => kept.has(l.slice(0, l.indexOf(','))))].join('\n') + '\n');
  writeFileSync(`${OUT}/stops.txt`, [stopHead, ...stopRows.values()].join('\n') + '\n');
  const filter = async (name: string, keep: (cells: string[], head: string[]) => boolean) => {
    const out: string[] = [];
    for await (const { head, cells, raw } of csv(`${RAW}/${name}`)) if (cells === head || keep(cells, head)) out.push(raw);
    writeFileSync(`${OUT}/${name}`, out.join('\n') + '\n');
  };
  await filter('agency.txt', (c) => c[0] === METROLINK);
  await filter('calendar.txt', (c) => services.has(c[0]));
  await filter('calendar_dates.txt', (c) => services.has(c[0]));
  await filter('shapes.txt', (c) => shapes.has(c[0]));
  rmSync(`${DIR}/metrolink.zip`, { force: true });
  execFileSync('zip', ['-q', '-j', `${DIR}/metrolink.zip`, ...['agency', 'routes', 'trips', 'stops', 'stop_times', 'calendar', 'calendar_dates', 'shapes'].map((n) => `${OUT}/${n}.txt`)]);
}

// ------------------------------------------------------------------------------------------------ build
// Doubles (two coupled M5000s) are the rule on Altrincham – Bury and common in the peaks elsewhere; the boards say
// which (Carriages: Single / Double) when TfGM realtime is on.
const mix = (doubles: number): StockMix[] => [
  { stock: 'manchester-m5000', cars: 1, share: 100 - doubles },
  { stock: 'manchester-m5000', cars: 2, share: doubles },
];
const DOUBLES: Record<string, number> = { 'alt-bury': 70, 'alt-pic': 40, 'bury-pic': 40, 'air-vic': 30, 'edy-roc': 35, 'edy-sha': 50, 'ash-ecc': 25, 'eti-mcu': 25, 'trc-cru': 20 };

await buildGtfsCity({
  city: 'manchester',
  feeds: [{ id: 'tfgm', url: `${DIR}/metrolink.zip` }],
  systems: [{ id: 'metrolink', name: 'Metrolink', live: 'scheduled' }],
  lines: SERVICES.map(
    (s): LineConfig => ({
      id: s.id,
      system: 'metrolink',
      match: { routeId: s.id },
      name: s.name,
      short: '',
      color: s.color,
      textColor: s.text,
      kind: 'light',
      bullet: 'bar',
      stock: mix(DOUBLES[s.id]),
      osm: ['light_rail', 'tram'],
    }),
  ),
  stations: {
    idPrefix: 'man',
    group: (stop) => tla(stop.stop_code),
    maxSpread: 150,
    name: (n) => n.replace(/ \(Manchester Metrolink\)$/, '').replace(/^Besses o'th'Barn$/, "Besses o' th' Barn").trim(),
  },
  geometry: { levels: true },
  realtimeKeys: true,
  days: { from: -2, to: 45 },
  attribution: ['Timetables: Transport for Greater Manchester (Open Government Licence)', 'Track levels © OpenStreetMap contributors'],
});

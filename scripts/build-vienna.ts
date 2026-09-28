// Vienna: Wiener Linien U-Bahn and Straßenbahn, plus the Badner Bahn, from the Wiener Linien GTFS (keyless, CC BY 4.0).
// Run: npx tsx scripts/build-vienna.ts [--refresh] [--debug]
import { buildGtfsCity, type StockMix } from './lib/gtfs/index.ts';

// Fleet shares are estimates from the 2025/26 fleet (62 Type V, ~20 Type X, ~49 Silberpfeil trains); Type X runs on U2
// and U3. E2 + c5 high-floor sets still work lines 6, 11, 25, 26, 27, 30 and 71 (late 2025).
const V = { stock: 'vienna-v', cars: 6 };
const X = { stock: 'vienna-x', cars: 6 };
const SP = { stock: 'vienna-u', cars: 6 };
const U: [string, string, StockMix[]][] = [
  ['U1', 'Oberlaa – Leopoldau', [{ ...V, share: 60 }, { ...SP, share: 40 }]],
  ['U2', 'Seestadt – Schottentor', [{ ...X, share: 45 }, { ...V, share: 40 }, { ...SP, share: 15 }]],
  ['U3', 'Ottakring – Simmering', [{ ...V, share: 45 }, { ...X, share: 35 }, { ...SP, share: 20 }]],
  ['U4', 'Hütteldorf – Heiligenstadt', [{ ...V, share: 40 }, { ...SP, share: 60 }]],
  ['U6', 'Siebenhirten – Floridsdorf', [{ stock: 'vienna-t', cars: 4 }]],
];
const E2_LINES = new Set(['6', '11', '25', '26', '27', '30', '71']);
const tramMix = (line: string): StockMix[] => [
  { stock: 'vienna-flexity', cars: 1, share: 40 },
  { stock: 'vienna-ulf-b', cars: 1, share: 35 },
  { stock: 'vienna-ulf-a', cars: 1, share: 25 },
  ...(E2_LINES.has(line) ? [{ stock: 'vienna-e2', cars: 2, share: 25 }] : []),
];

await buildGtfsCity({
  city: 'vienna',
  feeds: [{ id: 'wl', url: 'https://www.wienerlinien.at/ogd_realtime/doku/ogd/gtfs/gtfs.zip' }],
  systems: [
    { id: 'ubahn', name: 'U-Bahn', live: 'realtime' },
    { id: 'tram', name: 'Straßenbahn', live: 'scheduled' },
    { id: 'wlb', name: 'Badner Bahn', live: 'scheduled' },
  ],
  lines: [
    ...U.map(([u, long, stock]) => ({
      id: u.toLowerCase(),
      system: 'ubahn',
      match: { agency: 'Wiener Linien GmbH & Co KG', routeType: 1, shortName: u },
      name: `${u} ${long}`,
      short: u,
      kind: 'metro' as const,
      bullet: 'square' as const,
      stock,
      osm: u === 'U6' ? ['subway', 'light_rail', 'tram'] : ['subway'],
    })),
    {
      id: 'wlb',
      system: 'wlb',
      match: { agency: 'Wiener Lokalbahnen GmbH', shortName: 'BB' },
      name: 'Badner Bahn',
      short: 'BB',
      kind: 'light',
      bullet: 'pill',
      stock: [
        { stock: 'vienna-wlb500', cars: 2, share: 34 },
        { stock: 'vienna-wlb400', cars: 2, share: 14 },
      ],
      osm: ['tram', 'light_rail', 'rail'],
    },
  ],
  routes: {
    match: { agency: 'Wiener Linien GmbH & Co KG', routeType: 0 },
    line: (r) => ({
      id: `t${r.route_short_name.toLowerCase()}`,
      system: 'tram',
      name: `Tram ${r.route_short_name}`,
      short: r.route_short_name,
      kind: 'tram',
      bullet: 'square',
      stock: tramMix(r.route_short_name),
    }),
  },
  stations: { idPrefix: 'vie', name: (n) => n.replace(/^Wien\s+/, '').trim() },
  geometry: { variants: 'merge' },
  days: { from: -2, to: 40 },
  attribution: ['Timetables: Wiener Linien (data.wien.gv.at, CC BY 4.0)', 'Track levels © OpenStreetMap contributors'],
});

// The Wiener Linien realtime monitor (keyless) reports departures per RBL platform number. Map the U-Bahn's platforms
// to our stations by position so server/adapters/vienna/monitor.ts can ask for them.
{
  const { readFileSync, writeFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { makeProjection } = await import('../shared/geo.ts');
  const { ROOT, UA, splitCsv } = await import('./lib/gtfs/feed.ts');
  const { project } = makeProjection('vienna');
  const csvFile = join(ROOT, '.cache/vienna/haltepunkte.csv');
  if (!existsSync(csvFile) || process.argv.includes('--refresh')) {
    const res = await fetch('https://www.wienerlinien.at/ogd_realtime/doku/ogd/wienerlinien-ogd-haltepunkte.csv', { headers: { 'user-agent': UA } });
    if (!res.ok) throw new Error(`haltepunkte: HTTP ${res.status}`);
    writeFileSync(csvFile, await res.text());
  }
  const sched = JSON.parse(readFileSync(join(ROOT, 'server/data/vienna/schedule.json'), 'utf8')) as { lines: { system: string }[]; stations: string[]; stops: Record<string, number>; pats: { l: number; st: number[] }[] };
  const ubahn = new Set(sched.pats.filter((p) => sched.lines[p.l].system === 'ubahn').flatMap((p) => p.st));
  const platforms: { x: number; y: number; station: string }[] = [];
  const stopsTxt = readFileSync(join(ROOT, '.cache/vienna/wl/stops.txt'), 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  const head = splitCsv(stopsTxt[0]);
  const [ci, cx, cy] = ['stop_id', 'stop_lon', 'stop_lat'].map((h) => head.indexOf(h));
  for (const line of stopsTxt.slice(1)) {
    if (!line) continue;
    const c = splitCsv(line);
    const st = sched.stops[c[ci]];
    if (st == null || !ubahn.has(st)) continue;
    const [x, y] = project(Number(c[cx]), Number(c[cy]));
    platforms.push({ x, y, station: sched.stations[st] });
  }
  const rbl: number[] = [];
  const st: string[] = [];
  for (const line of readFileSync(csvFile, 'utf8').split(/\r?\n/).slice(1)) {
    const c = line.split(';');
    // U-Bahn platforms are numbered 4000-4999 (41xx U1, 42xx U2, 49xx U3, 44xx U4, 46xx U6).
    if (c.length < 7 || !/^4\d{3}$/.test(c[0])) continue;
    const [x, y] = project(Number(c[5]), Number(c[6]));
    let best: { d: number; station: string } | null = null;
    for (const p of platforms) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < 150 && (!best || d < best.d)) best = { d, station: p.station };
    }
    if (best) rbl.push(Number(c[0])), st.push(best.station);
  }
  writeFileSync(join(ROOT, 'server/data/vienna/rbl.json'), JSON.stringify({ rbl, st }));
  console.log(`wrote server/data/vienna/rbl.json (${rbl.length} U-Bahn platforms at ${new Set(st).size} stations)`);
}

// Stockholm: SL's tunnelbana, pendeltåg, trams and light railways from GTFS Regional SL (Samtrafiken, CC0). The feed
// needs a Trafiklab key; without TRAFIKLAB_KEY the build uses the Mobility Database's keyless mirror (mdb-3237).
// Realtime also needs the key, so the adapters run on the timetable.
// Run: npx tsx scripts/build-stockholm.ts [--refresh] [--debug]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildGtfsCity, type LineConfig, type StockMix } from './lib/gtfs/index.ts';
import { ROOT } from './lib/gtfs/feed.ts';
import type { TransitData } from '../shared/types.ts';

if (existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'));
const KEY = process.env.TRAFIKLAB_KEY;
const FEED = KEY ? `https://opendata.samtrafiken.se/gtfs/sl/sl.zip?key=${KEY}` : 'https://files.mobilitydatabase.org/mdb-3237/latest.zip';

const SL = 'AB Storstockholms Lokaltrafik';
const mix = (...m: [string, number, number][]): StockMix[] => m.map(([stock, cars, share]) => ({ stock, cars, share }));

// SL's line colors. The tunnelbana is three color-coded networks of numbered lines.
const BLUE = '#008DD0';
const RED = '#DC0D15';
const GREEN = '#04A64B';

type Line = Omit<LineConfig, 'match' | 'kind' | 'bullet'> & { routes: string[]; kind?: LineConfig['kind'] };

const TUNNELBANA: Line[] = [
  { id: '10', routes: ['10'], name: 'Blue line 10 Kungsträdgården – Hjulsta', nameLocal: 'Blå linjen', short: '10', color: BLUE, system: 'tunnelbana', stock: mix(['stockholm-c20', 3, 0.65], ['stockholm-c30', 2, 0.35]) },
  { id: '11', routes: ['11'], name: 'Blue line 11 Kungsträdgården – Akalla', nameLocal: 'Blå linjen', short: '11', color: BLUE, system: 'tunnelbana', stock: mix(['stockholm-c20', 3, 0.65], ['stockholm-c30', 2, 0.35]) },
  { id: '13', routes: ['13'], name: 'Red line 13 Norsborg – Ropsten', nameLocal: 'Röda linjen', short: '13', color: RED, system: 'tunnelbana', stock: mix(['stockholm-c30', 2, 1]) },
  { id: '14', routes: ['14'], name: 'Red line 14 Fruängen – Mörby centrum', nameLocal: 'Röda linjen', short: '14', color: RED, system: 'tunnelbana', stock: mix(['stockholm-c30', 2, 1]) },
  { id: '17', routes: ['17'], name: 'Green line 17 Åkeshov – Skarpnäck', nameLocal: 'Gröna linjen', short: '17', color: GREEN, system: 'tunnelbana', stock: mix(['stockholm-c20', 3, 1]) },
  { id: '18', routes: ['18'], name: 'Green line 18 Hässelby strand – Farsta strand', nameLocal: 'Gröna linjen', short: '18', color: GREEN, system: 'tunnelbana', stock: mix(['stockholm-c20', 3, 1]) },
  { id: '19', routes: ['19'], name: 'Green line 19 Hässelby strand – Hagsätra', nameLocal: 'Gröna linjen', short: '19', color: GREEN, system: 'tunnelbana', stock: mix(['stockholm-c20', 3, 1]) },
];

const PENDEL = '#F166A7';
const X60 = mix(['stockholm-x60', 6, 0.45], ['stockholm-x60', 12, 0.55]);
const PENDELTAG: Line[] = [
  { id: 'p40', routes: ['40'], name: 'Pendeltåg 40 Uppsala – Södertälje centrum', short: '40', color: PENDEL, system: 'pendeltag', stock: X60 },
  { id: 'p41', routes: ['41'], name: 'Pendeltåg 41 Märsta – Södertälje centrum', short: '41', color: PENDEL, system: 'pendeltag', stock: X60 },
  { id: 'p43', routes: ['43', '43X'], name: 'Pendeltåg 43 Bålsta – Nynäshamn', short: '43', color: PENDEL, system: 'pendeltag', stock: X60 },
  { id: 'p48', routes: ['48'], name: 'Pendeltåg 48 Södertälje centrum – Gnesta', short: '48', color: PENDEL, system: 'pendeltag', stock: mix(['stockholm-x60', 6, 1]) },
];

const TVARBANAN = mix(['stockholm-a35', 1, 0.3], ['stockholm-a35', 2, 0.25], ['stockholm-a32', 1, 0.25], ['stockholm-a32', 2, 0.2]);
const SPARVAG: Line[] = [
  { id: 's30', routes: ['30'], name: 'Tvärbanan 30 Sickla – Solna station', short: '30', color: '#D77D00', system: 'sparvag', kind: 'light', stock: TVARBANAN },
  { id: 's31', routes: ['31'], name: 'Tvärbanan 31', short: '31', color: '#D77D00', system: 'sparvag', kind: 'light', stock: TVARBANAN },
  { id: 's7', routes: ['7'], name: 'Spårväg City 7 T-Centralen – Waldemarsudde', short: '7', color: '#878A83', system: 'sparvag', kind: 'tram', stock: mix(['stockholm-a35', 1, 1]) },
  { id: 's12', routes: ['12'], name: 'Nockebybanan 12 Alvik – Nockeby', short: '12', color: '#648FA8', system: 'sparvag', kind: 'tram', stock: mix(['stockholm-a32', 1, 1]) },
  { id: 's21', routes: ['21'], name: 'Lidingöbanan 21 Ropsten – Gåshaga brygga', short: '21', color: '#B56631', system: 'sparvag', kind: 'light', stock: mix(['stockholm-a36', 1, 1]) },
];

const ROSLAGS = mix(['stockholm-x10p', 3, 0.35], ['stockholm-x10p', 6, 0.3], ['stockholm-x15p', 1, 0.35]);
const LOKALBANOR: Line[] = [
  { id: 'l25', routes: ['25'], name: 'Saltsjöbanan 25 Slussen – Saltsjöbaden', short: '25', color: '#00AAAD', system: 'lokalbana', kind: 'rail', stock: mix(['stockholm-c10', 4, 1]), osm: ['rail', 'light_rail'] },
  { id: 'l26', routes: ['26'], name: 'Saltsjöbanan 26 Igelboda – Solsidan', short: '26', color: '#00AAAD', system: 'lokalbana', kind: 'rail', stock: mix(['stockholm-c10', 2, 1]), osm: ['rail', 'light_rail'] },
  { id: 'l27', routes: ['27', '27S'], name: 'Roslagsbanan 27 Stockholms östra – Kårsta', short: '27', color: '#A05EA6', system: 'lokalbana', kind: 'rail', stock: ROSLAGS, osm: ['rail', 'narrow_gauge'] },
  { id: 'l28', routes: ['28', '28S'], name: 'Roslagsbanan 28 Stockholms östra – Österskär', short: '28', color: '#A05EA6', system: 'lokalbana', kind: 'rail', stock: ROSLAGS, osm: ['rail', 'narrow_gauge'] },
  { id: 'l29', routes: ['29'], name: 'Roslagsbanan 29 Stockholms östra – Näsbypark', short: '29', color: '#A05EA6', system: 'lokalbana', kind: 'rail', stock: ROSLAGS, osm: ['rail', 'narrow_gauge'] },
];

const routeType: Record<string, number> = { tunnelbana: 1, pendeltag: 2, sparvag: 0, lokalbana: 0 };

await buildGtfsCity({
  city: 'stockholm',
  feeds: [{ id: 'sl', url: FEED, file: 'sl.zip' }],
  systems: [
    { id: 'tunnelbana', name: 'Tunnelbana', live: 'scheduled' },
    { id: 'pendeltag', name: 'Pendeltåg', live: 'scheduled' },
    { id: 'sparvag', name: 'Spårväg', live: 'scheduled' },
    { id: 'lokalbana', name: 'Lokalbanor', live: 'scheduled' },
  ],
  lines: [...TUNNELBANA, ...PENDELTAG, ...SPARVAG, ...LOKALBANOR].map(({ routes, ...l }) => ({
    ...l,
    kind: l.kind ?? (l.system === 'tunnelbana' ? 'metro' : 'rail'),
    bullet: 'circle' as const,
    textColor: '#FFFFFF',
    match: { agency: SL, routeType: routeType[l.system], shortName: routes },
  })),
  // One track per station pair for trains: parallel platform tracks otherwise draw as a fan of ribbons. The pendeltåg's
  // night diversions via Stockholms central take routes up to 800 m apart; they fold onto the usual one too.
  geometry: { variants: 'merge', mergeWithin: 1000 },
  stations: { idPrefix: 'sto' },
  days: { from: -2, to: 30 },
  attribution: ['Timetables: SL / Samtrafiken (GTFS Regional, CC0)', 'Track levels © OpenStreetMap contributors'],
});
cleanSegments('stockholm');

/**
 * Two cleanups on the kit's transit.json:
 * - Hairpins: snapping a segment end to the far track of a double line, or a shape running into a siding, leaves turns
 *   sharper than 110° next to a short leg, which track never makes. Drop those vertices.
 * - Level steps: OSM splits ways where a tunnel or bridge starts, so the level (el) often changes between two points a
 *   few meters apart and the ribbon jumps up or down like a stair. Drop one of the pair so the ramp spans the longer leg.
 */
function cleanSegments(city: string) {
  const file = join(ROOT, `public/data/${city}/transit.json`);
  const t = JSON.parse(readFileSync(file, 'utf8')) as TransitData;
  let spikes = 0;
  for (const s of t.segments) {
    for (let i = 1; i < s.pts.length / 2 - 1; i++) {
      const [ax, ay, bx, by] = [s.pts[2 * i] - s.pts[2 * i - 2], s.pts[2 * i + 1] - s.pts[2 * i - 1], s.pts[2 * i + 2] - s.pts[2 * i], s.pts[2 * i + 3] - s.pts[2 * i + 1]];
      const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      if (Math.min(la, lb) < 60 && (ax * bx + ay * by) / (la * lb || 1) < -0.34) {
        s.pts.splice(2 * i, 2);
        s.el?.splice(i, 1);
        spikes++;
        i = Math.max(0, i - 2);
      }
    }
  }
  let steps = 0;
  for (const s of t.segments) {
    if (!s.el) continue;
    for (let i = 0; i < s.el.length - 1; i++) {
      if (s.el[i] === s.el[i + 1] || Math.hypot(s.pts[2 * i + 2] - s.pts[2 * i], s.pts[2 * i + 3] - s.pts[2 * i + 1]) >= 40) continue;
      const drop = i + 1 < s.el.length - 1 ? i + 1 : i > 0 ? i : -1;
      if (drop < 0) continue;
      s.pts.splice(2 * drop, 2);
      s.el.splice(drop, 1);
      steps++;
      i = Math.max(-1, i - 2);
    }
  }
  writeFileSync(file, JSON.stringify(t));
  console.log(`removed ${spikes} hairpins and ${steps} level steps`);
}

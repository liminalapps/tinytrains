// Budapest: BKK metro M1–M4, the MÁV-HÉV suburban lines, the tram network and the Cog-wheel Railway, from the
// BKK static GTFS (keyless). Run: ./node_modules/.bin/tsx scripts/build-budapest.ts [--refresh] [--debug]
import { buildGtfsCity, type StockMix } from './lib/gtfs/index.ts';

// Fleet shares are estimates for fall 2026. Combino Supras work 4-6; the 9-module CAF Urbos line 1; 5-module CAFs
// spread over 3, 14, 17, 19, 42 and 50. Ganz KCSV-7s hold 2, 2B and 23, coupled Ganz CSMG pairs the Buda lines 47–49,
// used Hanover TW 6000s the Pest lines, and modernized Tatras the Buda hills and the northern lines.
const URBOS9 = { stock: 'budapest-urbos9', cars: 1 };
const URBOS5 = { stock: 'budapest-urbos5', cars: 1 };
const COMBINO = { stock: 'budapest-combino', cars: 1 };
const KCSV7 = { stock: 'budapest-kcsv7', cars: 1 };
const CSMG = { stock: 'budapest-csmg', cars: 2 };
const TW2 = { stock: 'budapest-tw6000', cars: 2 };
const TW1 = { stock: 'budapest-tw6000', cars: 1 };
const TATRA2 = { stock: 'budapest-t5c5k', cars: 2 };
const TATRA3 = { stock: 'budapest-t5c5k', cars: 3 };

const TRAM_MIX: Record<string, StockMix[]> = {
  '1': [{ ...URBOS9, share: 75 }, { ...TATRA3, share: 25 }],
  '2': [KCSV7],
  '3': [{ ...URBOS5, share: 70 }, { ...TW2, share: 30 }],
  '4-6': [COMBINO],
  '12': [TATRA3],
  '14': [{ ...URBOS5, share: 50 }, { ...TATRA3, share: 50 }],
  '17': [{ ...URBOS5, share: 50 }, { ...TATRA2, share: 50 }],
  '19': [{ ...URBOS5, share: 60 }, { ...TATRA2, share: 40 }],
  '23': [KCSV7],
  '24': [{ ...TW2, share: 70 }, { ...KCSV7, share: 30 }],
  '28': [TW2],
  '37': [TW2],
  '41': [{ ...TATRA2, share: 60 }, { ...URBOS5, share: 40 }],
  '42': [{ ...URBOS5, share: 50 }, { ...TW1, share: 50 }],
  '47': [CSMG],
  '48': [CSMG],
  '49': [CSMG],
  '50': [{ ...URBOS5, share: 50 }, { ...TW2, share: 50 }],
  '51': [TW1],
  '52': [TW2],
  '56': [TATRA2],
  '59': [TATRA2],
  '60': [{ stock: 'budapest-cog', cars: 2 }],
  '61': [TATRA2],
  '62': [TW2],
  '69': [TW2],
  N18: [TATRA2],
};
// Variant routes (1A, 28A, 59B…) and night trams (N2) fold into their base line; the variant shows as the service.
// Line 4-6 is the Grand Boulevard route; the few trips still signed 4 or 6 fold into it.
const baseLine = (short: string) => {
  if (short === '4' || short === '6' || short === '4-6') return '4-6';
  if (short === 'N18') return 'N18';
  return short.replace(/^N/, '').replace(/[A-Z]$/, '');
};

const METRO: [string, string, string, StockMix[], number[]?][] = [
  ['M1', '5100', 'Millennium Underground', [{ stock: 'budapest-mfav', cars: 1 }]],
  ['M2', '5200', 'Déli pályaudvar – Örs vezér tere', [{ stock: 'budapest-am5', cars: 5 }]],
  ['M3', '5300', 'Kőbánya-Kispest – Újpest-központ', [{ stock: 'budapest-81717', cars: 6 }]],
  ['M4', '5400', 'Kelenföld vasútállomás – Keleti pályaudvar', [{ stock: 'budapest-am4', cars: 4 }]],
];
const HEV: [string, string, StockMix[]][] = [
  ['H5', 'Batthyány tér – Szentendre', [{ stock: 'budapest-mxa', cars: 6, share: 70 }, { stock: 'budapest-mxa', cars: 3, share: 30 }]],
  ['H6', 'Közvágóhíd – Ráckeve', [{ stock: 'budapest-mxa', cars: 3, share: 70 }, { stock: 'budapest-mxa', cars: 6, share: 30 }]],
  ['H7', 'Boráros tér – Csepel', [{ stock: 'budapest-mxa', cars: 6, share: 60 }, { stock: 'budapest-mxa', cars: 3, share: 40 }]],
  ['H8', 'Örs vezér tere – Gödöllő', [{ stock: 'budapest-mxa', cars: 6, share: 70 }, { stock: 'budapest-mxa', cars: 3, share: 30 }]],
  ['H9', 'Örs vezér tere – Csömör', [{ stock: 'budapest-mxa', cars: 3 }]],
];

const cleanName = (n: string) =>
  n.replace(/\s+(M\+H|M|H)(\s*\(|$)/, '$2').replace(/\s+/g, ' ').trim();

await buildGtfsCity({
  city: 'budapest',
  feeds: [{ id: 'bkk', url: 'https://go.bkk.hu/api/static/v1/public-gtfs/budapest_gtfs.zip' }],
  systems: [
    { id: 'metro', name: 'Metro', live: 'realtime' },
    { id: 'hev', name: 'HÉV', live: 'realtime' },
    { id: 'tram', name: 'Tram', live: 'realtime' },
  ],
  lines: [
    ...METRO.map(([m, routeId, long, stock]) => ({
      id: m.toLowerCase(),
      system: 'metro',
      match: { agency: 'BKK', routeId, routeType: 1 },
      name: `${m} ${long}`,
      short: m,
      kind: 'metro' as const,
      bullet: 'square' as const,
      stock,
      osm: ['subway', 'rail'],
    })),
    ...HEV.map(([h, long, stock]) => ({
      id: h.toLowerCase(),
      system: 'hev',
      match: { agency: 'HEV', shortName: h },
      name: `${h} HÉV ${long}`,
      short: h,
      kind: 'rail' as const,
      bullet: 'pill' as const,
      stock,
      osm: ['rail', 'light_rail'],
    })),
  ],
  routes: {
    match: { agency: 'BKK', routeType: 0 },
    line: (r) => {
      if (r.route_short_name.startsWith('KT')) return null;
      const b = baseLine(r.route_short_name);
      const stock = TRAM_MIX[b];
      if (!stock) throw new Error(`budapest: no stock for tram ${r.route_short_name} (${b})`);
      return {
        id: `t${b.toLowerCase().replace('-', '')}`,
        system: 'tram',
        name: b === '4-6' ? 'Tram 4-6 Grand Boulevard' : b === '60' ? 'Cog-wheel Railway 60' : `Tram ${b}`,
        short: b,
        ...(b === 'N18' ? { color: '#FF9900', textColor: '#FFFFFF' } : { color: '#FFD800', textColor: '#000000' }),
        kind: b === '60' ? 'rail' : 'tram',
        bullet: 'square',
        stock,
        ...(b === '60' ? { osm: ['rail', 'light_rail', 'narrow_gauge', 'funicular', 'tram'] } : {}),
      };
    },
  },
  stations: { idPrefix: 'bud', name: cleanName },
  trips: {
    service: (t) => {
      const s = t.route.route_short_name;
      if (t.line.startsWith('t') && s !== baseLine(s) && t.line !== 't46') return `Line ${s}`;
      if (t.line === 't46' && s !== '4-6') return `Line ${s}`;
      return undefined;
    },
    consist: (t) => {
      const s = t.route.route_short_name;
      if (s === '1A') return TATRA3;
      if (s === '2B') return KCSV7;
      if (s === '37A' || s === '62A') return TW1;
      return undefined;
    },
  },
  realtimeKeys: true,
  attribution: ['Timetables: BKK (opendata.bkk.hu)', 'Track levels © OpenStreetMap contributors'],
});

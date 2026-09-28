import type { BulletShape, LineKind, SystemDef } from '../../../shared/types.ts';

export type TflMode = 'tube' | 'elizabeth-line' | 'overground' | 'dlr' | 'tram';

export interface LondonLine {
  id: string; // TfL line id, also LineDef.id
  name: string;
  mode: TflMode;
  system: string;
  short: string;
  color: string;
  textColor: string;
  kind: LineKind;
  bullet: BulletShape;
  stock: string;
  cars: number;
  /** OSM route relation name prefix, used to pick track geometry. */
  osm: string;
}

export const SYSTEMS: SystemDef[] = [
  { id: 'tfl-tube', name: 'London Underground', live: 'realtime' },
  { id: 'tfl-elizabeth', name: 'Elizabeth line', live: 'realtime' },
  { id: 'tfl-overground', name: 'London Overground', live: 'realtime' },
  { id: 'tfl-dlr', name: 'Docklands Light Railway', live: 'realtime' },
  { id: 'tfl-trams', name: 'London Trams', live: 'realtime' },
];

const tube = (id: string, name: string, short: string, color: string, textColor: string, stock: string, cars: number): LondonLine => ({
  id,
  name,
  mode: 'tube',
  system: 'tfl-tube',
  short,
  color,
  textColor,
  kind: 'subway',
  bullet: 'bar',
  stock,
  cars,
  osm: `${name} line:`,
});

const overground = (id: string, name: string, color: string, textColor: string, stock: string, cars: number): LondonLine => ({
  id,
  name,
  mode: 'overground',
  system: 'tfl-overground',
  short: name.slice(0, 3).toUpperCase(),
  color,
  textColor,
  kind: 'rail',
  bullet: 'roundel',
  stock,
  cars,
  osm: `${name} Line:`,
});

// Colors: TfL Colour Standard, issue 11 (August 2026), RGB values.
export const LINES: LondonLine[] = [
  tube('bakerloo', 'Bakerloo', 'BAK', '#B26300', '#FFFFFF', 'london-1972', 7),
  tube('central', 'Central', 'CEN', '#DC241F', '#FFFFFF', 'london-1992', 8),
  tube('circle', 'Circle', 'CIR', '#FFC80A', '#000000', 'london-s7', 7),
  tube('district', 'District', 'DIS', '#007D32', '#FFFFFF', 'london-s7', 7),
  tube('hammersmith-city', 'Hammersmith & City', 'H&C', '#F589A6', '#000000', 'london-s7', 7),
  tube('jubilee', 'Jubilee', 'JUB', '#838D93', '#FFFFFF', 'london-1996', 7),
  tube('metropolitan', 'Metropolitan', 'MET', '#9B0058', '#FFFFFF', 'london-s8', 8),
  tube('northern', 'Northern', 'NOR', '#000000', '#FFFFFF', 'london-1995', 6),
  tube('piccadilly', 'Piccadilly', 'PIC', '#0019A8', '#FFFFFF', 'london-1973', 6),
  tube('victoria', 'Victoria', 'VIC', '#039BE5', '#FFFFFF', 'london-2009', 8),
  tube('waterloo-city', 'Waterloo & City', 'W&C', '#76D0BD', '#000000', 'london-1992', 4),
  {
    id: 'elizabeth',
    name: 'Elizabeth line',
    mode: 'elizabeth-line',
    system: 'tfl-elizabeth',
    short: 'EL',
    color: '#60399E',
    textColor: '#FFFFFF',
    kind: 'rail',
    bullet: 'roundel',
    stock: 'london-345',
    cars: 9,
    osm: 'Elizabeth line:',
  },
  overground('liberty', 'Liberty', '#5D6061', '#FFFFFF', 'london-710', 4),
  overground('lioness', 'Lioness', '#FAA61A', '#000000', 'london-710', 4),
  overground('mildmay', 'Mildmay', '#0077AD', '#FFFFFF', 'london-378-2', 5),
  overground('suffragette', 'Suffragette', '#5BBD72', '#FFFFFF', 'london-710', 4),
  overground('weaver', 'Weaver', '#823A62', '#FFFFFF', 'london-710', 4),
  overground('windrush', 'Windrush', '#ED1B00', '#FFFFFF', 'london-378-1', 5),
  {
    id: 'dlr',
    name: 'DLR',
    mode: 'dlr',
    system: 'tfl-dlr',
    short: 'DLR',
    color: '#00AFAD',
    textColor: '#FFFFFF',
    kind: 'light',
    bullet: 'roundel',
    stock: 'london-b07',
    cars: 3,
    osm: 'DLR:',
  },
  {
    id: 'tram',
    name: 'London Trams',
    mode: 'tram',
    system: 'tfl-trams',
    short: 'T',
    color: '#5FB526',
    textColor: '#FFFFFF',
    kind: 'tram',
    bullet: 'roundel',
    stock: 'london-cr4000',
    cars: 1,
    osm: 'London Trams:',
  },
];

export const LINE_BY_ID = new Map(LINES.map((l) => [l.id, l]));

/** "Stepney Green Underground Station" -> "Stepney Green", "Hammersmith (H&C Line)" -> "Hammersmith". */
export function cleanName(name: string): string {
  return name
    .replace(/\s+(Underground|Rail|DLR|Tram|Elizabeth line)?\s*Station$/i, '')
    .replace(/\s+Tram Stop$/i, '')
    .replace(/\s*\(([^)]*)\)/g, (m, inner: string) =>
      /line|london|central|bakerloo|h&c|circle|district|dist|picc|berks|tram|dlr/i.test(inner) ? '' : m,
    )
    .trim();
}

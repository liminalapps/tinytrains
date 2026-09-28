import type { BulletShape, LineKind, SystemDef } from '../../../shared/types.ts';

export type BerlinMode = 'u' | 's' | 't';

export interface BerlinLine {
  id: string; // LineDef.id, also the GTFS route_short_name
  name: string;
  mode: BerlinMode;
  system: string;
  color: string;
  textColor: string;
  kind: LineKind;
  bullet: BulletShape;
  stock: string;
  cars: number;
}

export const SYSTEMS: SystemDef[] = [
  { id: 'bvg-ubahn', name: 'BVG U-Bahn', live: 'scheduled' },
  { id: 'sbahn-berlin', name: 'S-Bahn Berlin', live: 'realtime' },
  { id: 'bvg-tram', name: 'BVG Tram', live: 'realtime' },
];

const u = (id: string, color: string, textColor: string, stock: string, cars: number): BerlinLine => ({
  id,
  name: id,
  mode: 'u',
  system: 'bvg-ubahn',
  color,
  textColor,
  kind: 'subway',
  bullet: 'square',
  stock,
  cars,
});

const s = (id: string, color: string, stock: string, cars: number): BerlinLine => ({
  id,
  name: id === 'S41' || id === 'S42' ? `${id} Ringbahn` : id,
  mode: 's',
  system: 'sbahn-berlin',
  color,
  textColor: '#FFFFFF',
  kind: 'rail',
  bullet: 'pill',
  stock,
  cars,
});

const t = (id: string, color: string, stock: string): BerlinLine => ({
  id,
  name: `Tram ${id}`,
  mode: 't',
  system: 'bvg-tram',
  color,
  textColor: '#FFFFFF',
  kind: 'tram',
  bullet: 'circle',
  stock,
  cars: 1,
});

// Colors: U-Bahn as on bvg.de (VBB's GTFS has U7 as #009BD5), S-Bahn as in the VBB GTFS feed, trams as VBB's HAFAS
// reports them. Default cars per train: S-Bahn per the December 2025 timetable, U-Bahn typical daytime lengths.
export const LINES: BerlinLine[] = [
  u('U1', '#7DAD4C', '#FFFFFF', 'berlin-a3l92', 6),
  u('U2', '#DA421E', '#FFFFFF', 'berlin-ik', 8),
  u('U3', '#16683D', '#FFFFFF', 'berlin-a3l92', 6),
  u('U4', '#F0D722', '#252424', 'berlin-a3l92', 2),
  u('U5', '#7E5330', '#FFFFFF', 'berlin-f74', 6),
  u('U6', '#8C6DAB', '#FFFFFF', 'berlin-f90', 6),
  u('U7', '#528DBA', '#FFFFFF', 'berlin-f90', 6),
  u('U8', '#224F86', '#FFFFFF', 'berlin-f74', 6),
  u('U9', '#F3791D', '#FFFFFF', 'berlin-f74', 6),
  s('S1', '#DA6BA2', 'berlin-481', 8),
  s('S15', '#DA6BA2', 'berlin-481', 4),
  s('S2', '#007734', 'berlin-481', 8),
  s('S25', '#007734', 'berlin-481', 6),
  s('S26', '#007734', 'berlin-481', 6),
  s('S3', '#0066AD', 'berlin-480', 8),
  s('S41', '#AD5937', 'berlin-483', 8),
  s('S42', '#CB6418', 'berlin-483', 8),
  s('S45', '#CD9C53', 'berlin-483', 4),
  s('S46', '#CD9C53', 'berlin-483', 8),
  s('S47', '#CD9C53', 'berlin-483', 6),
  s('S5', '#EB7405', 'berlin-481', 8),
  s('S7', '#816DA6', 'berlin-481', 8),
  s('S75', '#816DA6', 'berlin-481', 4),
  s('S8', '#66AA22', 'berlin-483', 6),
  s('S85', '#66AA22', 'berlin-481', 6),
  s('S9', '#992746', 'berlin-481', 8),
  t('M1', '#63B9E9', 'berlin-flexity'),
  t('M2', '#7AB929', 'berlin-flexity'),
  t('M4', '#CA1214', 'berlin-flexity'),
  t('M5', '#C8893B', 'berlin-flexity'),
  t('M6', '#005695', 'berlin-flexity'),
  t('M8', '#EE7203', 'berlin-flexity'),
  t('M10', '#007B3D', 'berlin-flexity'),
  t('M13', '#00A092', 'berlin-flexity'),
  t('M17', '#A6422A', 'berlin-flexity'),
  t('12', '#8870AB', 'berlin-gt6n'),
  t('16', '#007FAB', 'berlin-flexity'),
  t('18', '#D6AD00', 'berlin-flexity'),
  t('21', '#BC90C1', 'berlin-gt6n'),
  t('27', '#CB621A', 'berlin-gt6n'),
  t('37', '#A2539C', 'berlin-gt6n'),
  t('50', '#EB9000', 'berlin-flexity'),
  t('60', '#009BD9', 'berlin-gt6n'),
  t('61', '#E30613', 'berlin-gt6n'),
  t('62', '#00512D', 'berlin-gt6n'),
  t('63', '#EE7203', 'berlin-gt6n'),
  t('67', '#DD6CA6', 'berlin-gt6n'),
  t('68', '#65B32E', 'berlin-gt6n'),
];

export const LINE_BY_ID = new Map(LINES.map((l) => [l.id, l]));

/** Ring lines: S41 runs clockwise, S42 counterclockwise. */
export const RING: Record<string, string> = { S41: 'Clockwise', S42: 'Counterclockwise' };

/** "S+U Friedrichstr. Bhf (Berlin)" -> "Friedrichstraße", "S+U Berlin Hauptbahnhof" -> "Hauptbahnhof". */
export function cleanName(name: string): string {
  return name
    .replace(/\s*\[[^\]]*\]/g, '')
    .replace(/\s*\((Berlin|Bln)\)/g, '')
    .replace(/\s+Bhf\b\.?/g, '')
    .replace(/\s*\([A-Z]{2,3}\)\s*$/, '')
    .replace(/^Berlin,\s*/, '')
    .replace(/^(S\+U|S|U)\s+/, '')
    .replace(/str\.(?=$|[\s/-])/g, 'straße')
    .replace(/Str\.(?=$|[\s/-])/g, 'Straße')
    .replace(/^Berlin Hauptbahnhof$/, 'Hauptbahnhof')
    .replace(/^Flughafen BER.*$/, 'Flughafen BER')
    .trim();
}

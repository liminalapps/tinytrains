import type { BulletShape, LineKind, SystemDef } from '../../../shared/types.ts';

export interface HkLine {
  id: string; // MTR line code, also LineDef.id and the Next Train API `line` parameter
  name: string;
  nameLocal: string;
  color: string;
  textColor: string;
  kind: LineKind;
  bullet: BulletShape;
  stock: string;
  cars: number;
  /** Run-time model: typical top speed between stations (m/s), acceleration (m/s^2) and dwell (s). */
  v: number;
  acc: number;
  dwell: number;
  /** Direction labels for the API's UP and DOWN. */
  up: string;
  down: string;
  /**
   * Stations whose Next Train boards are polled. Each board lists the next 4 trains in both directions,
   * so the gap between two polled stations must stay under ~3 peak headways. Where two branches merge, one
   * branch is polled too (Lo Wu, Hang Hau): a train missing from its board came down the other one.
   */
  poll: string[];
}

export const SYSTEMS: SystemDef[] = [{ id: 'mtr', name: 'MTR', live: 'realtime' }];

const line = (
  id: string,
  name: string,
  nameLocal: string,
  color: string,
  kind: LineKind,
  stock: string,
  cars: number,
  run: [number, number, number],
  dirs: [string, string],
  poll: string[],
): HkLine => ({
  id,
  name,
  nameLocal,
  color,
  textColor: '#FFFFFF',
  kind,
  bullet: 'pill',
  stock,
  cars,
  v: run[0],
  acc: run[1],
  dwell: run[2],
  up: dirs[0],
  down: dirs[1],
  poll,
});

// Colors: MTR line colors (Wikipedia's MTR color module, matching the colour tags on OSM route relations).
export const LINES: HkLine[] = [
  line('ISL', 'Island Line', '港島綫', '#007DC5', 'metro', 'hongkong-m-train', 8, [16, 1.0, 38], ['Eastbound', 'Westbound'], ['HKU', 'CEN', 'CAB', 'NOP', 'TAK', 'HFC']),
  line('TWL', 'Tsuen Wan Line', '荃灣綫', '#ED1D24', 'metro', 'hongkong-m-train', 8, [16, 1.0, 40], ['Northbound', 'Southbound'], ['ADM', 'JOR', 'PRE', 'CSW', 'LAK', 'TWH']),
  line('KTL', 'Kwun Tong Line', '觀塘綫', '#00AB4E', 'metro', 'hongkong-c-train', 8, [17, 1.0, 34], ['Eastbound', 'Westbound'], ['HOM', 'MOK', 'SKM', 'WTS', 'KOB', 'KWT', 'YAT']),
  line('TKL', 'Tseung Kwan O Line', '將軍澳綫', '#7D499D', 'metro', 'hongkong-k-train', 8, [20, 1.0, 34], ['Eastbound', 'Westbound'], ['QUB', 'YAT', 'TKO', 'HAH']),
  line('TCL', 'Tung Chung Line', '東涌綫', '#F7943E', 'rail', 'hongkong-tcl-a-train', 8, [25, 0.9, 40], ['Westbound', 'Eastbound'], ['KOW', 'LAK', 'TSY', 'SUN']),
  line('AEL', 'Airport Express', '機場快綫', '#00888A', 'rail', 'hongkong-ael-a-train', 8, [31, 0.8, 60], ['To the airport', 'To the city'], ['KOW', 'TSY', 'AIR']),
  line('EAL', 'East Rail Line', '東鐵綫', '#53B7E8', 'rail', 'hongkong-r-train', 9, [26, 0.9, 38], ['Northbound', 'Southbound'], ['EXC', 'MKK', 'TAW', 'FOT', 'TAP', 'FAN', 'SHS', 'LOW']),
  line('TML', 'Tuen Ma Line', '屯馬綫', '#923011', 'rail', 'hongkong-sp1900', 8, [22, 0.9, 36], ['Westbound', 'Eastbound'], ['MOS', 'SHM', 'CKT', 'HIK', 'KAT', 'ETS', 'NAC', 'TWW', 'KSR', 'YUL', 'TIS']),
  line('SIL', 'South Island Line', '南港島綫', '#BAC429', 'metro', 'hongkong-s-train', 3, [15, 1.0, 40], ['Southbound', 'Northbound'], ['OCP', 'LET']),
  line('DRL', 'Disneyland Resort Line', '迪士尼綫', '#F173AC', 'metro', 'hongkong-drl', 4, [17, 0.8, 60], ['To Sunny Bay', 'To Disneyland'], ['SUN', 'DIS']),
];

export const LINE_BY_ID = new Map(LINES.map((l) => [l.id, l]));

/** Racecourse only opens on race days and is missing from MTR's station list. */
export const EXTRA_STATIONS: Record<string, [string, string]> = { RAC: ['Racecourse', '馬場'] };

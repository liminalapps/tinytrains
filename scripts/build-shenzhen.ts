// Shenzhen: Shenzhen Metro lines inside the map, simulated with the sim kit (docs/KIT_SIM.md). Network from OSM
// route relations; headways from Shenzhen Metro's published peak and off-peak intervals.
import { buildSimCity, type DayService, type DayServices, type SimLineConfig } from './lib/osm-network/index.ts';

type Bands = [string, number][];
const day = (first: string, last: string, headways: Bands): DayService => ({ first, last, headways });
/** Weekday morning and evening peak windows (no service between them) for a short-turn group. */
const peaks = (amHw: number, pmHw: number): DayServices => ({
  weekday: day('07:00', '19:30', [['07:00', amHw], ['09:00', 0], ['17:30', pmHw], ['19:30', 0]]),
  saturday: null,
  sunday: null,
});
/** Typical Shenzhen day: weekday peaks 07:00–09:00 and 17:30–19:30, weekend daytime. */
const week = (first: string, last: string, am: number, mid: number, pm: number, eve: number, wkd: number, late = eve + 2): DayServices => ({
  weekday: day(first, last, [[first, eve], ['07:00', am], ['09:00', mid], ['17:30', pm], ['19:30', eve], ['22:00', late]]),
  sunday: day(first, last, [[first, eve], ['08:30', wkd], ['20:30', eve], ['22:00', late]]),
});

const METRO = 'shenzhen-metro';
const A = { vmax: 80, acc: 0.9, dec: 1.0, dwell: 30, dwellInterchange: 45 };
const FAST = { vmax: 120, acc: 0.9, dec: 1.0, dwell: 35, dwellInterchange: 45 };
const num = (
  n: string, color: string, relations: number[], run: SimLineConfig['run'], service: DayServices,
  patterns: SimLineConfig['patterns'], stock: SimLineConfig['stock'], extra: Partial<SimLineConfig> = {},
): SimLineConfig => ({
  id: n, system: METRO, name: `Line ${n}`, nameLocal: `${n}号线`, short: n, color, bullet: 'square', kind: 'subway',
  osm: { relations }, run, service, patterns, stock, ...extra,
});

const lines: SimLineConfig[] = [
  num('1', '#00AB39', [2287554, 7913935], A, week('06:30', '23:00', 2, 4, 2.25, 5, 3.5, 7),
    [{ from: '罗湖', to: '机场东', share: 1 }],
    [{ stock: 'shenzhen-movia', share: 22, cars: 6 }, { stock: 'shenzhen-l1-a', share: 63, cars: 6 }],
    { directions: ['Westbound', 'Eastbound'] },
  ),
  // Line 8 runs as Line 2's eastern extension; rush-hour trains also shuttle Wanxia–Liantang.
  num('2', '#DB6D1C', [13176925, 13176926, 2752374, 9622750], A, week('06:30', '23:00', 4, 6, 4, 7, 5, 9),
    [
      { from: '赤湾', to: '溪涌', share: 1 },
      { from: '湾厦', to: '莲塘', share: 1, group: 'peak' },
    ],
    [{ stock: 'shenzhen-l2-a', cars: 6 }],
    { name: 'Line 2 / 8', nameLocal: '2号线/8号线', groups: { peak: peaks(8, 8) }, directions: ['Eastbound', 'Westbound'] },
  ),
  num('3', '#00A2E1', [2287559, 9629886], A, week('06:30', '23:00', 3, 5, 3, 6, 4.5, 8),
    [
      { from: '福保', to: '坪地六联', share: 1 },
      { from: '华新', to: '塘坑', share: 1, group: 'peak' },
    ],
    [{ stock: 'shenzhen-l3-b', cars: 6 }],
    { groups: { peak: peaks(6, 6) }, directions: ['Northbound', 'Southbound'] },
  ),
  num('4', '#DC241F', [2287563, 7713527], A, week('06:30', '23:00', 2.5, 6, 2.75, 6, 4.5, 8),
    [{ from: '福田口岸', to: '牛湖', share: 1 }],
    [{ stock: 'shenzhen-l4-a', cars: 6 }],
    { directions: ['Northbound', 'Southbound'] },
  ),
  // Rush-hour Qianhaiwan–Huangbeiling short runs double the core of the arc.
  num('5', '#9950B2', [2752389, 9645951], A, week('06:30', '23:00', 5, 5, 5, 6, 4.5, 8),
    [
      { from: '赤湾', to: '大剧院', share: 1 },
      { from: '前海湾', to: '黄贝岭', share: 1, group: 'peak' },
    ],
    [{ stock: 'shenzhen-l5-a', share: 57, cars: 6 }, { stock: 'shenzhen-ccd5094', share: 39, cars: 6 }],
    { groups: { peak: peaks(5, 5) }, directions: ['Eastbound', 'Westbound'] },
  ),
  num('6', '#3ABCA8', [11583141, 11583148], FAST, week('06:30', '23:00', 4.5, 7, 4.5, 8, 6, 10),
    [{ from: '科学馆', to: '松岗', share: 1 }],
    [{ stock: 'shenzhen-l6-a', cars: 6 }],
    { directions: ['Northbound', 'Southbound'] },
  ),
  num('7', '#0035AD', [6781618, 9629865], A, week('06:30', '23:00', 3, 6, 3.5, 7, 5, 9),
    [{ from: '深大丽湖', to: '太安', share: 1 }],
    [{ stock: 'shenzhen-l7-a', cars: 6 }],
    { directions: ['Eastbound', 'Westbound'] },
  ),
  num('9', '#846E74', [9699771, 13163478], A, week('06:30', '23:00', 3.5, 6, 3.5, 7, 5, 9),
    [{ from: '前湾', to: '文锦', share: 1 }],
    [{ stock: 'shenzhen-l9-a', cars: 6 }],
    { directions: ['Eastbound', 'Westbound'] },
  ),
  num('10', '#F8779E', [11583538, 11583621], A, week('06:30', '23:00', 4, 7, 4.5, 8, 6, 10),
    [{ from: '福田口岸', to: '双拥街', share: 1 }],
    [{ stock: 'shenzhen-l10-a', cars: 8 }],
    { directions: ['Northbound', 'Southbound'] },
  ),
  num('11', '#6A1D44', [6450277, 9318441], FAST, week('06:30', '23:00', 4.5, 7, 5, 8, 6, 10),
    [
      { from: '红岭南', to: '碧头', share: 1 },
      { from: '红岭南', to: '机场北', share: 1, group: 'peak' },
    ],
    [{ stock: 'shenzhen-l11-a', cars: 8 }],
    { groups: { peak: { weekday: day('07:00', '09:00', [['07:00', 9]]), saturday: null, sunday: null } }, directions: ['Westbound', 'Eastbound'] },
  ),
  num('12', '#A192B2', [14944727, 14944728], A, week('06:30', '23:00', 4, 7, 4.5, 8, 6, 10),
    [{ from: '左炮台东', to: '松岗', share: 1 }],
    [{ stock: 'shenzhen-l12-a', cars: 6 }],
    { directions: ['Northbound', 'Southbound'] },
  ),
  num('13', '#DE7C00', [18470804, 18470805], FAST, week('06:30', '23:00', 6, 8, 6, 9, 7, 10),
    [{ from: '深圳湾口岸', to: '李松蓢', share: 1 }],
    [{ stock: 'shenzhen-sfm108', cars: 8 }],
    { directions: ['Northbound', 'Southbound'] },
  ),
  num('14', '#F2C75C', [14752075, 14764337], FAST, week('06:30', '23:00', 4, 8, 4.5, 9, 7, 10),
    [{ from: '岗厦北', to: '沙田', share: 1 }],
    [{ stock: 'shenzhen-l14-a', cars: 8 }],
    { directions: ['Eastbound', 'Westbound'] },
  ),
  num('16', '#1E22AA', [15059916, 15059917], A, week('06:30', '23:00', 6, 8, 6, 9, 8, 10),
    [{ from: '园山西坑', to: '田心', share: 1 }],
    [{ stock: 'shenzhen-l16-a', cars: 6 }],
    { directions: ['Eastbound', 'Westbound'] },
  ),
  num('20', '#88DBDF', [13620409, 13620410], FAST, week('06:30', '23:00', 10, 10, 10, 10, 10, 12),
    [{ from: '机场北', to: '会展城', share: 1 }],
    [{ stock: 'shenzhen-l20-a', cars: 8 }],
    { directions: ['Northbound', 'Southbound'] },
  ),
];

await buildSimCity({
  city: 'shenzhen',
  systems: [{ id: METRO, name: 'Shenzhen Metro' }],
  lines,
  calendar: {
    // Official 2026 arrangement (State Council, Nov 2025). 2027's isn't published yet: statutory days only.
    holidays: [
      '2026-01-01', '2026-01-02', '2026-01-03', '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
      '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23', '2026-04-04', '2026-04-05', '2026-04-06', '2026-05-01',
      '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05', '2026-06-19', '2026-06-20', '2026-06-21', '2026-09-25',
      '2026-09-26', '2026-09-27', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06',
      '2026-10-07',
      '2027-01-01', '2027-02-05', '2027-02-06', '2027-02-07', '2027-02-08', '2027-04-05', '2027-05-01', '2027-05-02',
      '2027-06-09', '2027-09-15', '2027-10-01', '2027-10-02', '2027-10-03',
    ],
    workdays: ['2026-01-04', '2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10'],
  },
  stations: {
    rename: {
      深圳北站: ['Shenzhen North Railway Station', '深圳北站'],
      左炮台东: ['Zuopaotai East', '左炮台东'],
    },
  },
  attribution: ['Service intervals: Shenzhen Metro (szmc.net)'],
});

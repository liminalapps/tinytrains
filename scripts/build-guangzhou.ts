// Guangzhou: Guangzhou Metro lines inside the map (lines 1–14, 18, 21, 22, the Guangfo line and the Zhujiang
// New Town APM), simulated with the sim kit (docs/KIT_SIM.md). Network from OSM route relations; headways and
// service patterns from Guangzhou Metro announcements as reported on the lines' Wikipedia pages (2019–2026).
import { buildSimCity, type DayService, type DayServices, type SimLineConfig } from './lib/osm-network/index.ts';

type Bands = [string, number][];
const day = (first: string, last: string, headways: Bands, terminals?: DayService['terminals']): DayService => ({ first, last, headways, ...(terminals ? { terminals } : {}) });
/** A weekday-only window (a peak short turn) running every `hw` minutes. */
const peak = (first: string, last: string, hw: number): DayServices => ({ weekday: day(first, last, [[first, hw]]), saturday: null, sunday: null });
/** Typical Guangzhou day: weekday peaks 07:30–09:30 and 17:00–19:30, weekend peak 08:30–20:30. */
/** Weekday morning and evening peak windows (no service between them) for a short-turn group. */
const peaks = (amFrom: string, amTo: string, amHw: number, pmFrom: string, pmTo: string, pmHw: number): DayServices => ({
  weekday: day(amFrom, pmTo, [[amFrom, amHw], [amTo, 0], [pmFrom, pmHw], [pmTo, 0]]),
  saturday: null,
  sunday: null,
});
const week = (first: string, last: string, am: number, mid: number, pm: number, eve: number, wkd: number, late = eve + 2): DayServices => ({
  weekday: day(first, last, [[first, eve], ['07:30', am], ['09:30', mid], ['17:00', pm], ['19:30', eve], ['22:00', late]]),
  sunday: day(first, last, [[first, eve], ['08:30', wkd], ['20:30', eve], ['22:00', late]]),
});

const METRO = 'guangzhou-metro';
const A = { vmax: 80, acc: 0.9, dec: 1.0, dwell: 30, dwellInterchange: 45 };
const LIM = { vmax: 90, acc: 0.9, dec: 1.0, dwell: 30, dwellInterchange: 45 };
const FAST = { vmax: 120, acc: 0.9, dec: 1.0, dwell: 35, dwellInterchange: 45 };
const num = (
  n: string, color: string, relations: number[], run: SimLineConfig['run'], service: DayServices,
  patterns: SimLineConfig['patterns'], stock: SimLineConfig['stock'], extra: Partial<SimLineConfig> = {},
): SimLineConfig => ({
  id: n, system: METRO, name: `Line ${n}`, nameLocal: `${n}号线`, short: n, color, bullet: 'square', kind: 'subway',
  osm: { relations }, run, service, patterns, stock, ...extra,
});

const lines: SimLineConfig[] = [
  num('1', '#F3D03E', [7480669, 7480670], A, week('06:00', '23:00', 2.5, 4.5, 2.75, 5, 4, 7),
    [{ from: '西塱', to: '广州东站', share: 1 }],
    [{ stock: 'guangzhou-a1', share: 21, cars: 6 }, { stock: 'guangzhou-a2', share: 34, cars: 6 }],
    { directions: ['Eastbound', 'Westbound'] },
  ),
  // Morning peak: every third train is a Jiahewanggang–Jiangtai Road short run (2+1).
  num('2', '#00629B', [7390450, 7390451], A, week('06:00', '23:00', 3.35, 5, 3.5, 6, 4.5, 8),
    [
      { from: '广州南站', to: '嘉禾望岗', share: 1 },
      { from: '江泰路', to: '嘉禾望岗', share: 1, group: 'am' },
    ],
    [{ stock: 'guangzhou-a4', cars: 6 }],
    { groups: { am: peak('07:30', '09:30', 6.7) }, directions: ['Northbound', 'Southbound'] },
  ),
  // Line 3 is a Y: Airport North–Tiyu Xilu, Tianhe Coach Terminal–Haibang and Airport North–Haibang take turns (each at
  // the headway below), so the shared Tiyu Xilu–Panyu trunk sees two of every three trains.
  num('3', '#ECA154', [444000, 9841060, 9841061, 9841062], { vmax: 120, acc: 0.9, dec: 1.0, dwell: 30, dwellInterchange: 45, trip: { from: '天河客运站', to: '海傍', minutes: 57 } },
    week('06:00', '23:00', 4.5, 7.5, 4.8, 9, 7, 12),
    [
      { from: '机场北', to: '体育西路', share: 1 },
      { from: '天河客运站', to: '海傍', share: 1 },
      { from: '机场北', to: '海傍', share: 1 },
    ],
    [{ stock: 'guangzhou-b1', share: 101, cars: 6 }, { stock: 'guangzhou-b11', share: 18, cars: 6 }],
  ),
  num('4', '#00843D', [5454434, 9607953], LIM, week('06:00', '23:00', 4.5, 7, 5, 8, 7, 10),
    [{ from: '黄村', to: '南沙客运港', share: 1 }],
    [{ stock: 'guangzhou-l1', cars: 4 }],
    { directions: ['Southbound', 'Northbound'] },
  ),
  // Peak Jiaokou–Wenchong short runs bring the core to a train every 2 minutes, the tightest in Guangzhou.
  num('5', '#C5003E', [7483883, 7483884], LIM, week('06:00', '23:00', 3, 5, 3, 6, 4.5, 8),
    [
      { from: '滘口', to: '黄埔新港', share: 1 },
      { from: '滘口', to: '文冲', share: 1, group: 'peak' },
    ],
    [{ stock: 'guangzhou-l2', cars: 6 }],
    { groups: { peak: peaks('07:30', '09:30', 6, '17:00', '19:30', 6) }, directions: ['Eastbound', 'Westbound'] },
  ),
  num('6', '#80225F', [7285815, 7285816], LIM, week('06:00', '23:00', 3.5, 6, 3.5, 7, 5, 9),
    [
      { from: '浔峰岗', to: '香雪', share: 1 },
      { from: '浔峰岗', to: '黄陂', share: 1, group: 'pm' },
    ],
    [{ stock: 'guangzhou-l3', cars: 4 }],
    { groups: { pm: peak('17:00', '19:30', 7) }, directions: ['Eastbound', 'Westbound'] },
  ),
  num('7', '#97D700', [7520751, 7520752], A, week('06:00', '23:00', 5.5, 8, 5.5, 9, 8, 10),
    [{ from: '美的大道', to: '燕山', share: 1 }],
    [{ stock: 'guangzhou-b5', cars: 6 }],
    { directions: ['Eastbound', 'Westbound'] },
  ),
  num('8', '#008C95', [7422204, 7422205], A, week('06:00', '23:00', 2.7, 5, 3, 6, 4.5, 8),
    [{ from: '滘心', to: '万胜围', share: 1 }],
    [{ stock: 'guangzhou-a4', share: 30, cars: 6 }, { stock: 'guangzhou-a8', share: 37, cars: 6 }, { stock: 'guangzhou-a2', share: 10, cars: 6 }],
    { directions: ['Southbound', 'Northbound'] },
  ),
  num('9', '#71CC98', [7935591, 9924026], A, week('06:00', '23:00', 6, 8, 6, 9, 8, 10),
    [{ from: '飞鹅岭', to: '高增', share: 1 }],
    [{ stock: 'guangzhou-b6', cars: 6 }],
    { directions: ['Eastbound', 'Westbound'] },
  ),
  num('10', '#7389B2', [19283541, 19283542], { ...A, trip: { from: '西塱', to: '杨箕东', minutes: 27 } }, week('06:00', '23:00', 4, 6, 4, 7, 4, 9),
    [{ from: '西塱', to: '杨箕东', share: 1 }],
    [{ stock: 'guangzhou-b13', cars: 6 }],
    { directions: ['Eastbound', 'Westbound'] },
  ),
  num('11', '#FFB40C', [18132492, 18132493], A, week('06:00', '23:00', 5.33, 7.5, 5.33, 8, 6.25, 10),
    [{ from: '赤沙', to: '赤沙', loop: true, share: 1, loopDest: { Clockwise: ['Inner Loop', '内环'], Counterclockwise: ['Outer Loop', '外环'] } }],
    [{ stock: 'guangzhou-a9', cars: 8 }],
  ),
  // Line 12 opened as two separate halves; each runs its own shuttle every 6 minutes at peak.
  num('12', '#505D12', [19283546, 19283547, 19283548, 19283549], { ...A, trip: { from: '二沙岛', to: '大学城南', minutes: 23 } }, week('06:00', '23:00', 6, 8, 6, 9, 8, 10),
    [
      { from: '浔峰岗', to: '广州体育馆', share: 1 },
      { from: '二沙岛', to: '大学城南', share: 1, group: 'east' },
    ],
    [{ stock: 'guangzhou-a10', cars: 6 }],
    { groups: { east: week('06:00', '23:00', 6, 8, 6, 9, 8, 10) } },
  ),
  num('13', '#8E8C13', [6728313, 7895352], { ...A, trip: { from: '天河公园', to: '新沙', minutes: 44 } }, week('06:00', '23:00', 6, 8, 6, 9, 6, 10),
    [{ from: '天河公园', to: '新沙', share: 1 }],
    [{ stock: 'guangzhou-a7', cars: 8 }],
    { directions: ['Eastbound', 'Westbound'] },
  ),
  // Line 14 expresses stop everywhere south of Baiyun Dongping, then only at the big stations to Conghua.
  num('14', '#81312F', [8338723, 8338724], { ...FAST, trip: { from: '乐嘉路', to: '东风', minutes: 67 } }, week('06:00', '23:00', 5.5, 7, 5.5, 8, 6, 10),
    [
      { from: '乐嘉路', to: '东风', share: 0.8 },
      {
        from: '乐嘉路', to: '东风', share: 0.2, service: ['Express', '快车'],
        express: ['乐嘉路', '云霄路', '新市墟', '马务', '鹤边', '鹤龙', '彭边', '嘉禾望岗', '白云东平', '竹料', '新和', '从化客运站', '东风'],
      },
    ],
    [{ stock: 'guangzhou-b7', cars: 6 }],
    { directions: ['Northbound', 'Southbound'] },
  ),
  // Line 18: all-stop trains plus expresses every half hour that skip Longtan and Shaxi.
  num('18', '#0047BA', [13239401, 13239411], { vmax: 160, acc: 0.8, dec: 0.9, dwell: 40, dwellInterchange: 50 },
    week('06:00', '23:00', 6, 8, 6, 9, 8, 12),
    [
      { from: '冼村', to: '万顷沙', share: 1 },
      { from: '冼村', to: '万顷沙', share: 1, group: 'express', service: ['Express', '快车'], express: ['冼村', '磨碟沙', '南村万博', '番禺广场', '横沥', '万顷沙'] },
    ],
    [{ stock: 'guangzhou-d1', cars: 8 }],
    { groups: { express: { weekday: day('07:00', '21:00', [['07:00', 30]]) } }, directions: ['Southbound', 'Northbound'] },
  ),
  // Line 21: locals and expresses about 4:1, plus peak Tianhe Park–Shuixi short locals.
  num('21', '#201747', [9171918, 9349489], FAST, week('06:00', '23:00', 4, 6.5, 4, 8, 6, 10),
    [
      { from: '天河公园', to: '增城广场', share: 0.8 },
      {
        from: '天河公园', to: '增城广场', share: 0.2, service: ['Express', '快车'],
        express: ['天河公园', '棠东', '黄村', '天河智慧城', '神舟路', '苏元', '水西', '镇龙', '凤岗', '增城广场'],
      },
      { from: '天河公园', to: '水西', share: 1, group: 'peak' },
    ],
    [{ stock: 'guangzhou-b8', cars: 6 }],
    { groups: { peak: peaks('07:30', '09:30', 8, '17:00', '19:30', 8) }, directions: ['Eastbound', 'Westbound'] },
  ),
  num('22', '#CD5228', [13987999, 13988000], { vmax: 160, acc: 0.8, dec: 0.9, dwell: 40, dwellInterchange: 50 },
    week('06:00', '23:00', 4.83, 7, 5, 8, 7, 10),
    [{ from: '芳村', to: '番禺广场', share: 1 }],
    [{ stock: 'guangzhou-d1', cars: 8 }],
    { directions: ['Southbound', 'Northbound'] },
  ),
  {
    id: 'guangfo', system: METRO, name: 'Guangfo Line', nameLocal: '广佛线', short: 'GF', color: '#C4D600', bullet: 'pill', kind: 'subway',
    osm: { relations: [2646091, 7944797] }, run: A,
    service: week('06:00', '23:00', 3.5, 6, 3.5, 7, 5, 9),
    patterns: [{ from: '新城东', to: '沥滘', share: 1 }],
    stock: [{ stock: 'guangzhou-b3', cars: 4 }],
    directions: ['Eastbound', 'Westbound'],
  },
  {
    id: 'apm', system: METRO, name: 'Zhujiang New Town APM', nameLocal: 'APM线', short: 'APM', color: '#00B5E2', bullet: 'pill', kind: 'agt',
    osm: { relations: [1526269, 9611404] }, run: { vmax: 60, acc: 1.0, dec: 1.1, dwell: 25 },
    service: week('07:00', '23:00', 3, 5, 3, 5, 4, 6),
    patterns: [{ from: '林和西', to: '广州塔', share: 1 }],
    stock: [{ stock: 'guangzhou-apm100', cars: 2 }],
    directions: ['Southbound', 'Northbound'],
  },
];

await buildSimCity({
  city: 'guangzhou',
  systems: [{ id: METRO, name: 'Guangzhou Metro' }],
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
      广州东站: ['Guangzhou East Railway Station', '广州东站'],
      广州南站: ['Guangzhou South Railway Station', '广州南站'],
      广州火车站: ['Guangzhou Railway Station', '广州火车站'],
      广州北站: ['Guangzhou North Railway Station', '广州北站'],
    },
  },
  attribution: ['Service intervals: Guangzhou Metro (gzmtr.com)'],
});

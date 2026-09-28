// Builds public/data/chongqing/transit.json and server/data/chongqing/sim.json with the sim kit (docs/KIT_SIM.md).
// Network: OSM route relations. Trains: typical Chongqing Rail Transit intervals (estimates from operator notices,
// fleet sizes and Wikipedia, Sept 2026), since CRT publishes no open timetable.
// Usage: npx tsx scripts/build-chongqing.ts
import { buildSimCity, type DayServices, type SimCalendar, type SimLineConfig } from './lib/osm-network/index.ts';

const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * 864e5).toISOString().slice(0, 10));
/** Mainland public holidays (State Council schedule for 2026; 2027 estimated from the lunar dates) and adjusted workdays. */
const CHINA_CALENDAR: SimCalendar = {
  holidays: [
    ...days('2026-01-01', 3), ...days('2026-02-15', 9), ...days('2026-04-04', 3), ...days('2026-05-01', 5),
    ...days('2026-06-19', 3), ...days('2026-09-25', 3), ...days('2026-10-01', 7),
    ...days('2027-01-01', 3), ...days('2027-02-05', 7), ...days('2027-04-03', 3), ...days('2027-05-01', 5),
    ...days('2027-06-09', 1), ...days('2027-09-15', 1), ...days('2027-10-01', 7),
  ],
  workdays: ['2026-01-04', '2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10'],
};

/** Minutes between trains: weekday peak (07:00–09:30, 17:00–19:30), midday, evening, late; weekend daytime. */
const crt = (o: { peak: number; mid: number; eve: number; late: number; we: number }, first = '06:30', last = '22:30'): DayServices => ({
  weekday: {
    first,
    last,
    headways: [['06:30', o.mid], ['07:00', o.peak], ['09:30', o.mid], ['17:00', o.peak], ['19:30', o.eve], ['21:30', o.late]],
  },
  sunday: { first, last, headways: [['06:30', o.mid], ['08:30', o.we], ['20:30', o.eve], ['21:30', o.late]] },
});

/** Weekday-only peak service (the cross-line expresses): 07:30–09:30 and 16:30–19:30. */
const peaksOnly = (hw: number): DayServices => ({
  weekday: { first: '07:30', last: '19:30', headways: [['07:30', hw], ['09:30', 0], ['16:30', hw], ['19:30', 0]] },
  sunday: null,
});

// Run models tuned to CRT's reported average speeds: monorail 30.6–34.8 km/h, metro about 35–45 km/h.
const MONO = { vmax: 70, acc: 0.8, dec: 0.9, dwell: 30, dwellInterchange: 40 };
const B = { vmax: 80, acc: 0.9, dec: 1.0, dwell: 35, dwellInterchange: 50, margin: 1.12 };
const AS = { vmax: 90, acc: 0.8, dec: 0.9, dwell: 35, dwellInterchange: 50, margin: 1.12 };

type Line = Omit<SimLineConfig, 'system' | 'kind' | 'bullet'> & Partial<Pick<SimLineConfig, 'system' | 'kind' | 'bullet'>>;
const line = (l: Line): SimLineConfig => ({ system: 'crt', kind: 'metro', bullet: 'circle', textColor: '#FFFFFF', ...l });

const lines: SimLineConfig[] = [
  line({
    id: '0', name: 'Loop Line', nameLocal: '环线', short: '环', color: '#F2A900',
    osm: { relations: [7662492, 7676338] }, run: AS,
    service: crt({ peak: 4, mid: 6, eve: 6.5, late: 8, we: 6 }),
    patterns: [{ from: '重庆西站', to: '重庆西站', loop: true, share: 1, loopDest: { Clockwise: ['Inner Loop', '内环'], Counterclockwise: ['Outer Loop', '外环'] } }],
    stock: [{ stock: 'chongqing-loop', cars: 6 }],
  }),
  line({
    id: '1', name: 'Line 1', nameLocal: '1号线', short: '1', color: '#E4002B',
    osm: { relations: [2336456, 2336457] }, run: B,
    service: crt({ peak: 3, mid: 5, eve: 6, late: 8, we: 5 }),
    patterns: [
      { from: '朝天门', to: '璧山', share: 0.5 },
      { from: '朝天门', to: '大学城', share: 0.5 },
    ],
    stock: [{ stock: 'chongqing-l1', cars: 6 }],
  }),
  line({
    id: '2', name: 'Line 2', nameLocal: '2号线', short: '2', color: '#007A33', kind: 'monorail',
    osm: { relations: [444083, 2353578, 11665922, 11665923] }, run: { ...MONO, trip: { from: '较场口', to: '鱼洞', minutes: 60 } },
    service: crt({ peak: 3, mid: 5, eve: 6, late: 8, we: 4.5 }),
    patterns: [
      { from: '较场口', to: '鱼洞', share: 0.5 },
      { from: '较场口', to: '天堂堡', share: 0.5 },
    ],
    stock: [
      { stock: 'chongqing-ccd3007', share: 0.45, cars: 8 },
      { stock: 'chongqing-ccd3007c', share: 0.3, cars: 8 },
      { stock: 'chongqing-qkz9', share: 0.25, cars: 6 },
    ],
  }),
  line({
    id: '3', name: 'Line 3', nameLocal: '3号线', short: '3', color: '#003DA5', kind: 'monorail',
    osm: { relations: [2341149, 2341150, 9597502, 9597503] }, run: { ...MONO, trip: { from: '鱼洞', to: '江北机场T2航站楼', minutes: 95 } },
    service: crt({ peak: 2.5, mid: 4.5, eve: 5, late: 7, we: 4 }),
    groups: { konggang: crt({ peak: 8, mid: 12, eve: 12, late: 15, we: 12 }) },
    patterns: [
      { from: '鱼洞', to: '江北机场T2航站楼', share: 1 },
      { from: '碧津', to: '举人坝', share: 1, group: 'konggang', service: ['Konggang Line', '空港线'] },
    ],
    stock: [
      { stock: 'chongqing-l3', share: 0.64, cars: 6 },
      { stock: 'chongqing-l3', share: 0.36, cars: 8 },
    ],
  }),
  line({
    id: '4', name: 'Line 4', nameLocal: '4号线', short: '4', color: '#DC8633',
    osm: { relations: [7677819, 9171927] }, run: AS,
    service: crt({ peak: 5, mid: 7, eve: 8, late: 10, we: 7 }),
    patterns: [
      { from: '石马河立交', to: '黄岭', share: 0.5 },
      { from: '石马河立交', to: '唐家沱', share: 0.5 },
    ],
    stock: [{ stock: 'chongqing-l4', cars: 6 }],
  }),
  line({
    id: '5', name: 'Line 5', nameLocal: '5号线', short: '5', color: '#00A3E0',
    osm: { relations: [7676337, 7913722] }, run: AS,
    service: crt({ peak: 4.5, mid: 7, eve: 7, late: 10, we: 7 }),
    patterns: [{ from: '跳磴', to: '悦港北路', share: 1 }],
    stock: [{ stock: 'chongqing-l5', cars: 6 }],
  }),
  line({
    id: '6', name: 'Line 6', nameLocal: '6号线', short: '6', color: '#F67599',
    osm: { relations: [2768660, 2768661, 3474487, 3474488, 19293565, 19293566] }, run: B,
    service: crt({ peak: 3, mid: 5.5, eve: 6, late: 8, we: 5 }),
    groups: {
      expo: crt({ peak: 7, mid: 10, eve: 10, late: 12, we: 10 }),
      east: crt({ peak: 8, mid: 12, eve: 12, late: 15, we: 12 }),
    },
    patterns: [
      { from: '茶园', to: '北碚', share: 0.5 },
      { from: '茶园', to: '礼嘉', share: 0.5 },
      { from: '礼嘉', to: '沙河坝', share: 1, group: 'expo', service: ['Int’l Expo Line', '国博线'] },
      { from: '刘家坪', to: '重庆东站', share: 1, group: 'east' },
    ],
    stock: [{ stock: 'chongqing-l6', cars: 6 }],
  }),
  line({
    id: '9', name: 'Line 9', nameLocal: '9号线', short: '9', color: '#861F41',
    osm: { relations: [14004562, 14004563] }, run: AS,
    service: crt({ peak: 4, mid: 6, eve: 7, late: 9, we: 6 }),
    patterns: [{ from: '高滩岩', to: '花石沟', share: 1 }],
    stock: [{ stock: 'chongqing-l9', cars: 6 }],
  }),
  line({
    id: '10', name: 'Line 10', nameLocal: '10号线', short: '10', color: '#5F259F',
    osm: { relations: [7913721, 8300862] }, run: AS,
    service: crt({ peak: 5, mid: 7, eve: 8, late: 10, we: 7 }),
    groups: { rapid: peaksOnly(30) },
    patterns: [
      { from: '兰花路', to: '王家庄', share: 1 },
      {
        from: '兰花路', to: '王家庄', share: 1, group: 'rapid', service: ['Rapid', '快速'],
        express: ['万寿路', '七星岗', '曾家岩', '鲤鱼池', '红土地', '重庆北站南广场', '重庆北站北广场', '上湾路', '江北机场T3航站楼', '江北机场T2航站楼', '中央公园西'],
      },
    ],
    stock: [{ stock: 'chongqing-l10', cars: 6 }],
  }),
  line({
    id: '18', name: 'Line 18', nameLocal: '18号线', short: '18', color: '#2CD5C4',
    osm: { relations: [15749312, 15749313] }, run: AS,
    service: crt({ peak: 6, mid: 8, eve: 9, late: 10, we: 8 }),
    patterns: [{ from: '富华路', to: '跳磴南', share: 1 }],
    stock: [{ stock: 'chongqing-l18', cars: 6 }],
  }),
  line({
    id: 'exp', name: '4–Loop–5 Express', nameLocal: '4–环–5直快', short: '直快', color: '#C16C18', bullet: 'pill',
    // The express averages about 49 km/h (CRT, 2020).
    osm: { relations: [11353824, 11665747] }, run: { ...AS, trip: { from: '唐家沱', to: '重庆西站', minutes: 41 } },
    service: peaksOnly(30),
    patterns: [{ from: '唐家沱', to: '跳磴', share: 1, service: ['Express', '直快'] }],
    stock: [
      { stock: 'chongqing-l4', cars: 6 },
      { stock: 'chongqing-loop', cars: 6 },
      { stock: 'chongqing-l5', cars: 6 },
    ],
  }),
  line({
    id: 'jt', name: 'Jiangtiao Line (through to Line 5)', nameLocal: '江跳线', short: '江跳', color: '#0057B8', bullet: 'pill',
    osm: {
      sequences: [['石桥铺', '石新路', '巴山', '凤西路', '重庆西站', '华岩寺', '华成路', '半山', '中梁山', '金建路', '华岩中心', '跳磴', '石林寺', '九龙园', '双福', '享堂', '江津高铁', '圣泉寺']],
    },
    run: { ...AS, vmax: 110 },
    service: crt({ peak: 30, mid: 30, eve: 30, late: 60, we: 30 }, '07:00', '21:00'),
    patterns: [{ from: '石桥铺', to: '圣泉寺', share: 1 }],
    stock: [{ stock: 'chongqing-jiangtiao', cars: 6 }],
  }),
];

await buildSimCity({
  city: 'chongqing',
  systems: [{ id: 'crt', name: 'Chongqing Rail Transit' }],
  lines,
  calendar: CHINA_CALENDAR,
  stations: {
    splitDistance: 250,
    rename: {
      重庆西站: ['Chongqing West Railway Station', '重庆西站'],
      重庆东站: ['Chongqing East Railway Station', '重庆东站'],
      小龙坎: ['Xiaolongkan'],
      上桥: ['Shangqiao'],
      四川美术学院: ['Sichuan Fine Arts Institute'],
      江北机场T2航站楼: ['Jiangbei Airport T2'],
      江北机场T3航站楼: ['Jiangbei Airport T3'],
      圣泉寺: ['Shengquansi'],
      石林寺: ['Shilinsi'],
      九龙园: ['Jiulongyuan'],
      双福: ['Shuangfu'],
      享堂: ['Xiangtang'],
      江津高铁: ['Jiangjin HSR Station'],
    },
  },
  attribution: ['Service simulated from typical Chongqing Rail Transit intervals'],
});

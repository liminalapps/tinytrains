// Builds public/data/chengdu/transit.json and server/data/chengdu/sim.json with the sim kit (docs/KIT_SIM.md).
// Network: OSM route relations. Trains: typical Chengdu Metro intervals (estimates; routings, end-to-end times and
// the airport express timetables from Wikipedia, Sept 2026), since Chengdu Metro publishes no open timetable.
// Usage: npx tsx scripts/build-chengdu.ts
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
const cd = (o: { peak: number; mid: number; eve: number; late: number; we: number }, first = '06:10', last = '23:00'): DayServices => ({
  weekday: {
    first,
    last,
    headways: [['06:00', o.mid], ['07:00', o.peak], ['09:30', o.mid], ['17:00', o.peak], ['19:30', o.eve], ['21:30', o.late]],
  },
  sunday: { first, last, headways: [['06:00', o.mid], ['08:30', o.we], ['20:30', o.eve], ['21:30', o.late]] },
});
/** A fixed interval all day, every day (the airport direct trains). */
const every = (min: number, first: string, last: string): DayServices => ({ weekday: { first, last, headways: [['00:00', min]] } });

const METRO = { vmax: 80, acc: 0.9, dec: 1.0, dwell: 30, dwellInterchange: 45 };
const FAST = { vmax: 100, acc: 0.9, dec: 1.0, dwell: 35, dwellInterchange: 45 };
const EXPRESS = { vmax: 140, acc: 0.8, dec: 0.9, dwell: 40, dwellInterchange: 50 };

type Line = Omit<SimLineConfig, 'system' | 'kind' | 'bullet'> & Partial<Pick<SimLineConfig, 'system' | 'kind' | 'bullet'>>;
const line = (l: Line): SimLineConfig => ({ system: 'cdmetro', kind: 'metro', bullet: 'square', textColor: '#FFFFFF', ...l });
const both = (from: string, to: string) => [{ from, to, share: 1 }];
const split = (a: [string, string], b: [string, string]) => [
  { from: a[0], to: a[1], share: 0.5 },
  { from: b[0], to: b[1], share: 0.5 },
];

const lines: SimLineConfig[] = [
  line({
    id: '1', name: 'Line 1', nameLocal: '1号线', short: '1', color: '#0F0F96',
    osm: { relations: [2381768, 7913598, 8297247, 8303538] }, run: METRO,
    service: cd({ peak: 2.5, mid: 5, eve: 5, late: 8, we: 4.5 }),
    patterns: split(['韦家碾', '科学城'], ['韦家碾', '五根松']),
    stock: [{ stock: 'chengdu-l1', cars: 6 }],
  }),
  line({
    // The eastern end (east of Chengdu Academy of Governance) is closed for rerouting until about October 2026.
    id: '2', name: 'Line 2', nameLocal: '2号线', short: '2', color: '#FE633D',
    osm: { relations: [2474349, 8298109] }, run: METRO,
    service: cd({ peak: 3, mid: 5.5, eve: 6, late: 8, we: 5 }),
    patterns: both('犀浦', '成都行政学院'),
    stock: [{ stock: 'chengdu-l2', cars: 6 }],
  }),
  line({
    id: '3', name: 'Line 3', nameLocal: '3号线', short: '3', color: '#D60F6B',
    osm: { relations: [6517083, 8297265] }, run: METRO,
    service: cd({ peak: 3, mid: 6, eve: 6, late: 8, we: 5 }),
    patterns: split(['成都医学院', '双流西站'], ['锦水河', '龙桥路']),
    stock: [{ stock: 'chengdu-tianfu', cars: 6 }],
  }),
  line({
    id: '4', name: 'Line 4', nameLocal: '4号线', short: '4', color: '#1CAD64',
    osm: { relations: [6385133, 8298131] }, run: METRO,
    service: cd({ peak: 3.5, mid: 6, eve: 6, late: 8, we: 5.5 }),
    patterns: split(['万盛', '西河'], ['光华公园', '来龙']),
    stock: [{ stock: 'chengdu-tianfu', cars: 6 }],
  }),
  line({
    id: '5', name: 'Line 5', nameLocal: '5号线', short: '5', color: '#A03F92',
    osm: { relations: [9627905, 10526315] }, run: METRO,
    service: cd({ peak: 3.5, mid: 6, eve: 6, late: 8, we: 5.5 }),
    patterns: split(['华桂路', '回龙'], ['石犀公园', '二江寺']),
    stock: [{ stock: 'chengdu-l5', cars: 8 }],
  }),
  line({
    id: '6', name: 'Line 6', nameLocal: '6号线', short: '6', color: '#BE7331',
    osm: { relations: [9627850, 12038668] }, run: METRO,
    service: cd({ peak: 3.5, mid: 6, eve: 6, late: 8, we: 6 }),
    patterns: split(['望丛祠', '兰家沟'], ['望丛祠', '沈阳路']),
    stock: [{ stock: 'chengdu-l6', cars: 8 }],
  }),
  line({
    id: '7', name: 'Line 7 (Loop)', nameLocal: '7号线', short: '7', color: '#65D0DE',
    osm: { relations: [7913593, 8297136] }, run: METRO,
    service: cd({ peak: 3, mid: 5, eve: 5.5, late: 8, we: 4.5 }),
    patterns: [{ from: '火车北站', to: '火车北站', loop: true, share: 1, loopDest: { Clockwise: ['Inner Loop', '内环'], Counterclockwise: ['Outer Loop', '外环'] } }],
    stock: [{ stock: 'chengdu-l7', cars: 6 }],
  }),
  line({
    id: '8', name: 'Line 8', nameLocal: '8号线', short: '8', color: '#A6C215',
    osm: { relations: [9761272, 12086371] }, run: METRO,
    service: cd({ peak: 5, mid: 7, eve: 7, late: 9, we: 6.5 }),
    patterns: both('桂龙路', '龙港'),
    stock: [{ stock: 'chengdu-l8', cars: 6 }],
  }),
  line({
    id: '9', name: 'Line 9', nameLocal: '9号线', short: '9', color: '#F1AD17',
    osm: { relations: [9627519, 12094622] }, run: { ...FAST, trip: { from: '金融城东', to: '黄田坝', minutes: 26 } },
    service: cd({ peak: 5, mid: 7, eve: 7, late: 9, we: 7 }),
    patterns: both('金融城东', '黄田坝'),
    stock: [{ stock: 'chengdu-l9', cars: 8 }],
  }),
  line({
    id: '10', name: 'Line 10', nameLocal: '10号线', short: '10', color: '#0054BB',
    osm: { relations: [7913594, 8298253, 11807052, 11807053] }, run: FAST,
    service: cd({ peak: 5, mid: 8, eve: 8, late: 10, we: 7 }),
    patterns: split(['武侯祠', '新平'], ['武侯祠', '花桥']),
    stock: [{ stock: 'chengdu-l10', cars: 6 }],
  }),
  line({
    id: '13', name: 'Line 13', nameLocal: '13号线', short: '13', color: '#B2A225',
    osm: { relations: [11528274, 19975015] }, run: EXPRESS,
    service: cd({ peak: 5, mid: 7, eve: 7, late: 10, we: 7 }),
    patterns: both('瓦窑滩', '龙安'),
    stock: [{ stock: 'chengdu-l13', cars: 8 }],
  }),
  line({
    id: '17', name: 'Line 17', nameLocal: '17号线', short: '17', color: '#87E0AA', textColor: '#1A1A1A',
    osm: { relations: [9851799, 12095437] }, run: EXPRESS,
    service: cd({ peak: 6, mid: 8, eve: 8, late: 10, we: 8 }),
    patterns: split(['九江北', '高洪'], ['九江北', '机车厂']),
    stock: [{ stock: 'chengdu-l17', cars: 8 }],
  }),
  line({
    id: '18', name: 'Line 18', nameLocal: '18号线', short: '18', color: '#1A686E',
    osm: { relations: [9869750, 11697794] }, run: EXPRESS,
    service: cd({ peak: 6, mid: 8, eve: 8, late: 10, we: 8 }, '06:00'),
    // Hourly on the hour, 07:00–23:00 (the group's departures are offset half a headway from 'first').
    groups: { direct: every(60, '06:30', '23:00') },
    patterns: [
      ...split(['火车南站', '天府机场北'], ['火车南站', '天府站']),
      { from: '火车南站', to: '天府机场北', share: 1, group: 'direct', express: ['天府机场1号2号航站楼'], service: ['Airport Direct', '直达'] },
    ],
    stock: [{ stock: 'chengdu-l18', cars: 8 }],
  }),
  line({
    id: '19', name: 'Line 19', nameLocal: '19号线', short: '19', color: '#94A2DC',
    osm: { relations: [16494768, 16494854, 16764492, 16764493] }, run: { ...EXPRESS, vmax: 160, margin: 1.25 },
    service: cd({ peak: 7, mid: 10, eve: 10, late: 12, we: 9 }),
    groups: { direct: every(150, '08:00', '20:30') },
    patterns: [
      ...split(['金星', '天府机场北'], ['金星', '天府站']),
      { from: '双流机场2航站楼东', to: '天府机场1号2号航站楼', share: 1, group: 'direct', express: [], service: ['Two-Airport Direct', '双机场直达'] },
    ],
    stock: [{ stock: 'chengdu-l19', cars: 4 }],
  }),
  line({
    id: '27', name: 'Line 27', nameLocal: '27号线', short: '27', color: '#00A4E0',
    osm: { relations: [12123402, 18436260] }, run: METRO,
    service: cd({ peak: 5, mid: 7, eve: 7, late: 9, we: 7 }),
    patterns: split(['石佛', '蜀鑫路'], ['三圣寺', '蜀鑫路']),
    stock: [{ stock: 'chengdu-l27', cars: 6 }],
  }),
  line({
    id: '30', name: 'Line 30', nameLocal: '30号线', short: '30', color: '#F63676',
    osm: { relations: [19970753, 19970754] }, run: METRO,
    service: cd({ peak: 6, mid: 8, eve: 8, late: 10, we: 8 }),
    patterns: both('龙泉驿火车站南', '双流机场2航站楼东'),
    stock: [{ stock: 'chengdu-l30', cars: 6 }],
  }),
];

await buildSimCity({
  city: 'chengdu',
  systems: [{ id: 'cdmetro', name: 'Chengdu Metro' }],
  lines,
  calendar: CHINA_CALENDAR,
  stations: {
    splitDistance: 300,
    rename: {
      双流机场1航站楼: ['Shuangliu Airport T1'],
      双流机场2航站楼: ['Shuangliu Airport T2'],
      双流机场2航站楼东: ['Shuangliu Airport T2 East'],
      天府机场1号2号航站楼: ['Tianfu Airport T1 & T2'],
      天府机场北: ['Tianfu Airport North'],
      太平园: ['Taipingyuan'],
      武侯祠: ['Wuhou Shrine'],
      双店路: ['Shuangdian Road'],
      九道堰: ['Jiudaoyan'],
      九眼桥: ['Jiuyan Bridge'],
      犀浦: ['Xipu'],
      龙桥路: ['Longqiao Road'],
      龙港: ['Longgang'],
      温家山: ['Wenjiashan'],
      牧华路: ['Muhua Road'],
      怡心湖: ['Yixin Lake'],
      红莲: ['Honglian'],
      天府商务区: ['Tianfu CBD'],
      蓝家店: ['Lanjiadian'],
      黄忠: ['Huangzhong'],
    },
  },
  attribution: ['Service simulated from typical Chengdu Metro intervals'],
});

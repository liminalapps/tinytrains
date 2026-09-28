// Builds public/data/wuhan/transit.json and server/data/wuhan/sim.json with the sim kit (docs/KIT_SIM.md).
// Network: OSM route relations. Trains: typical Wuhan Metro intervals (estimates; routings, short turns and service
// hours from Wikipedia, Sept 2026), since Wuhan Metro publishes no open timetable.
// Usage: npx tsx scripts/build-wuhan.ts
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

/**
 * Minutes between trains: weekday peak (07:00–09:30, 17:00–19:30), midday, evening, late; weekend daytime.
 * First trains leave at 06:00 on workdays and 06:30 on weekends and holidays; most lines' last trains leave at 23:00.
 */
const wh = (o: { peak: number; mid: number; eve: number; late: number; we: number }, last = '23:00'): DayServices => ({
  weekday: {
    first: '06:00',
    last,
    headways: [['06:00', o.mid], ['07:00', o.peak], ['09:30', o.mid], ['17:00', o.peak], ['19:30', o.eve], ['21:30', o.late]],
  },
  sunday: { first: '06:30', last, headways: [['06:30', o.mid], ['08:30', o.we], ['20:30', o.eve], ['21:30', o.late]] },
});

const METRO = { vmax: 80, acc: 0.9, dec: 1.0, dwell: 30, dwellInterchange: 45 };
const FAST = { vmax: 100, acc: 0.9, dec: 1.0, dwell: 30, dwellInterchange: 45 };
const SUBURBAN = { vmax: 120, acc: 0.9, dec: 1.0, dwell: 35, dwellInterchange: 45 };

type Line = Omit<SimLineConfig, 'system' | 'kind' | 'bullet'> & Partial<Pick<SimLineConfig, 'system' | 'kind' | 'bullet'>>;
const line = (l: Line): SimLineConfig => ({ system: 'whmetro', kind: 'metro', bullet: 'square', textColor: '#FFFFFF', ...l });
const both = (from: string, to: string) => [{ from, to, share: 1 }];
const split = (a: [string, string], b: [string, string]) => [
  { from: a[0], to: a[1], share: 0.5 },
  { from: b[0], to: b[1], share: 0.5 },
];

const lines: SimLineConfig[] = [
  line({
    id: '1', name: 'Line 1', nameLocal: '1号线', short: '1', color: '#0067A1',
    osm: { relations: [444615, 8309086] }, run: METRO,
    service: wh({ peak: 3.5, mid: 5.5, eve: 6, late: 8, we: 5 }),
    patterns: both('径河', '汉口北'),
    stock: [{ stock: 'wuhan-l1', cars: 4 }],
  }),
  line({
    id: '2', name: 'Line 2', nameLocal: '2号线', short: '2', color: '#EC9CBB', textColor: '#1A1A1A',
    osm: { relations: [5454751, 9592189] }, run: METRO,
    service: wh({ peak: 2.5, mid: 5, eve: 5, late: 7, we: 4 }),
    patterns: split(['天河机场', '佛祖岭'], ['金银潭', '武汉东站']),
    stock: [{ stock: 'wuhan-l2', cars: 6 }],
  }),
  line({
    id: '3', name: 'Line 3', nameLocal: '3号线', short: '3', color: '#D3B466', textColor: '#1A1A1A',
    osm: { relations: [6768161, 9588291] }, run: METRO,
    service: wh({ peak: 4, mid: 6, eve: 6, late: 8, we: 5.5 }),
    patterns: both('沌阳大道', '宏图大道'),
    stock: [{ stock: 'wuhan-l3', cars: 6 }],
  }),
  line({
    id: '4', name: 'Line 4', nameLocal: '4号线', short: '4', color: '#A6D30B', textColor: '#1A1A1A',
    osm: { relations: [5454752, 9633081] }, run: METRO,
    service: wh({ peak: 3, mid: 5.5, eve: 6, late: 8, we: 5 }),
    patterns: split(['柏林', '武汉火车站'], ['玉龙路', '武汉火车站']),
    stock: [{ stock: 'wuhan-l4', cars: 6 }],
  }),
  line({
    id: '5', name: 'Line 5', nameLocal: '5号线', short: '5', color: '#A43034',
    osm: { relations: [13647960, 13647961] }, run: METRO,
    service: wh({ peak: 4.5, mid: 7, eve: 7, late: 9, we: 6 }),
    patterns: both('红霞', '武汉站东广场'),
    stock: [{ stock: 'wuhan-l5', cars: 6 }],
  }),
  line({
    id: '6', name: 'Line 6', nameLocal: '6号线', short: '6', color: '#007128',
    osm: { relations: [6768163, 9617429] }, run: METRO,
    service: wh({ peak: 3.5, mid: 6, eve: 6, late: 8, we: 5.5 }),
    patterns: both('新城十一路', '东风公司'),
    stock: [{ stock: 'wuhan-l6', cars: 6 }],
  }),
  line({
    // Short turns run Julong Avenue–Banqiao (on weekends Julong Avenue–Qinglongshan).
    id: '7', name: 'Line 7', nameLocal: '7号线', short: '7', color: '#EB7C16',
    osm: { relations: [6768164, 9617426] }, run: FAST,
    service: wh({ peak: 3.5, mid: 6, eve: 6, late: 8, we: 5.5 }),
    patterns: split(['黄陂广场', '青龙山地铁小镇'], ['巨龙大道', '板桥']),
    stock: [{ stock: 'wuhan-l7', cars: 6 }],
  }),
  line({
    id: '8', name: 'Line 8', nameLocal: '8号线', short: '8', color: '#9DABAA', textColor: '#1A1A1A',
    osm: { relations: [6768162, 7964883] }, run: METRO,
    service: wh({ peak: 4.5, mid: 7, eve: 7, late: 9, we: 6 }),
    patterns: both('金潭路', '军运村'),
    stock: [{ stock: 'wuhan-l8', cars: 6 }],
  }),
  line({
    id: '11', name: 'Line 11', nameLocal: '11号线', short: '11', color: '#F6D300', textColor: '#1A1A1A',
    osm: { relations: [7683819, 9633133] }, run: FAST,
    service: wh({ peak: 5, mid: 7, eve: 7, late: 9, we: 7 }),
    patterns: both('江安路', '葛店南站'),
    stock: [{ stock: 'wuhan-l11', cars: 6 }],
  }),
  line({
    // Opened 2026-05-01 as an arc of the future ring; it runs end to end until the ring is closed.
    id: '12', name: 'Line 12', nameLocal: '12号线', short: '12', color: '#00A3E9',
    osm: { relations: [20622642, 20629061] }, run: METRO,
    service: wh({ peak: 6, mid: 8, eve: 8, late: 10, we: 8 }),
    patterns: both('钢都花园', '墨水湖公园'),
    stock: [{ stock: 'wuhan-l12', cars: 6 }],
  }),
  line({
    id: '16', name: 'Line 16', nameLocal: '16号线', short: '16', color: '#C24C6D',
    osm: { relations: [13648361, 13648362] }, run: SUBURBAN,
    service: wh({ peak: 8, mid: 10, eve: 10, late: 12, we: 10 }, '22:30'),
    patterns: both('国博中心南', '通航機場'),
    stock: [{ stock: 'wuhan-l16', cars: 4 }],
  }),
  line({
    id: '19', name: 'Line 19', nameLocal: '19号线', short: '19', color: '#469C7F',
    osm: { relations: [16890959, 16890960] }, run: SUBURBAN,
    service: wh({ peak: 8, mid: 10, eve: 10, late: 12, we: 10 }, '22:30'),
    patterns: both('武汉站西广场', '新月溪公园'),
    stock: [{ stock: 'wuhan-l19', cars: 6 }],
  }),
  line({
    id: 'yangluo', name: 'Yangluo Line', nameLocal: '阳逻线', short: '阳逻', color: '#B2007B', bullet: 'pill',
    osm: { relations: [9765655, 9765659] }, run: FAST,
    service: wh({ peak: 6, mid: 8, eve: 9, late: 12, we: 8 }, '22:30'),
    patterns: both('後湖大道', '金台'),
    stock: [{ stock: 'wuhan-yangluo', cars: 4 }],
  }),
];

await buildSimCity({
  city: 'wuhan',
  systems: [{ id: 'whmetro', name: 'Wuhan Metro' }],
  lines,
  calendar: CHINA_CALENDAR,
  stations: {
    splitDistance: 300,
    rename: {
      舵落口: ['Duoluokou'],
      五环大道: ['Wuhuan Avenue'],
      东吴大道: ['Dongwu Avenue'],
      崇仁路: ['Chongren Road'],
      硚口路: ['Qiaokou Road'],
      後湖大道: ['Houhu Avenue', '后湖大道'],
      航空總部: ['Hangkongzongbu', '航空总部'],
      宋家崗: ['Songjiagang', '宋家岗'],
      龍陽村: ['Longyangcun', '龙阳村'],
      雙墩: ['Shuangdun', '双墩'],
      雲飛路: ['Yunfei Road', '云飞路'],
      惠濟二路: ['Huiji 2nd Road', '惠济二路'],
      羅家莊: ['Luojiazhuang', '罗家庄'],
      紗帽: ['Shamao', '纱帽'],
      白沙六路: ['Baisha 6th Road'],
      张家湾: ['Zhangjiawan'],
      烽火村: ['Fenghuocun'],
      八铺街: ['Bapu Street'],
      彭刘杨: ['Pengliuyang'],
      司门口黄鹤楼: ['Simenkou Yellow Crane Tower'],
      昙华林武胜门: ['Tanhualin Wushengmen'],
      三层楼: ['Sancenglou'],
      三角路: ['Sanjiao Road'],
      杨园铁四院: ['Yangyuan Tiesiyuan'],
      余家头: ['Yujiatou'],
      科普公园: ['Kepu Park'],
      建设二路: ['Jianshe 2nd Road'],
      和平公园: ['Heping Park'],
      红钢城: ['Honggangcheng'],
      青宜居: ['Qingyiju'],
      工人村: ['Gongrencun'],
      武钢: ['Wugang'],
      厂前: ['Changqian'],
      黄陂广场: ['Huangpi Square'],
      百泰路: ['Baitai Road'],
      青仔村: ['Qingzaicun'],
      光谷五路: ['Guanggu 5th Road'],
      武汉站东广场: ['Wuhan Railway Station East Square'],
      武汉站西广场: ['Wuhan Railway Station West Square'],
      武汉火车站: ['Wuhan Railway Station'],
      青龙山地铁小镇: ['Qinglongshan Metro Town'],
      黄家湖地铁小镇: ['Huangjiahu Metro Town'],
      通航機場: ['Hannan General Airport', '通航机场'],
    },
  },
  attribution: ['Service simulated from typical Wuhan Metro intervals'],
});

// Builds public/data/hangzhou/transit.json and server/data/hangzhou/sim.json with the sim kit (docs/KIT_SIM.md).
// Network: OSM route relations. Trains: typical Hangzhou Metro intervals (estimates from fleet sizes and Wikipedia,
// Sept 2026), since Hangzhou Metro publishes no open timetable.
// Usage: npx tsx scripts/build-hangzhou.ts
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
const hz = (o: { peak: number; mid: number; eve: number; late: number; we: number }, first = '06:00', last = '23:00'): DayServices => ({
  weekday: {
    first,
    last,
    headways: [['06:00', o.mid], ['07:00', o.peak], ['09:30', o.mid], ['17:00', o.peak], ['19:30', o.eve], ['21:30', o.late]],
  },
  sunday: { first, last, headways: [['06:00', o.mid], ['08:30', o.we], ['20:30', o.eve], ['21:30', o.late]] },
});

const METRO = { vmax: 80, acc: 0.9, dec: 1.0, dwell: 30, dwellInterchange: 45 };
const FAST = { vmax: 100, acc: 0.9, dec: 1.0, dwell: 30, dwellInterchange: 45 };
const EXPRESS = { vmax: 120, acc: 0.9, dec: 1.0, dwell: 35, dwellInterchange: 45 };

type Line = Omit<SimLineConfig, 'system' | 'kind' | 'bullet'> & Partial<Pick<SimLineConfig, 'system' | 'kind' | 'bullet'>>;
const line = (l: Line): SimLineConfig => ({ system: 'hzmetro', kind: 'metro', bullet: 'circle', textColor: '#FFFFFF', ...l });
const both = (from: string, to: string) => [{ from, to, share: 1 }];
const split = (a: [string, string], b: [string, string]) => [
  { from: a[0], to: a[1], share: 0.5 },
  { from: b[0], to: b[1], share: 0.5 },
];

const lines: SimLineConfig[] = [
  line({
    id: '1', name: 'Line 1', nameLocal: '1号线', short: '1', color: '#DF4661',
    osm: { relations: [4627560, 4627561] }, run: METRO,
    service: hz({ peak: 3, mid: 5.5, eve: 6, late: 8, we: 5 }),
    patterns: split(['湘湖', '萧山国际机场'], ['湘湖', '下沙江滨']),
    stock: [{ stock: 'hangzhou-l1', cars: 6 }],
  }),
  line({
    id: '2', name: 'Line 2', nameLocal: '2号线', short: '2', color: '#F1803A',
    osm: { relations: [5454457, 8323744] }, run: METRO,
    service: hz({ peak: 3, mid: 5.5, eve: 6, late: 8, we: 5 }),
    patterns: both('朝阳', '良渚'),
    stock: [{ stock: 'hangzhou-l2', cars: 6 }],
  }),
  line({
    id: '3', name: 'Line 3', nameLocal: '3号线', short: '3', color: '#FFCD00', textColor: '#1A1A1A',
    osm: { relations: [13538219, 13538220, 14280624, 14280625] }, run: METRO,
    service: hz({ peak: 4, mid: 6, eve: 6, late: 8, we: 5.5 }),
    patterns: split(['星桥', '吴山前村'], ['星桥', '石马']),
    stock: [{ stock: 'hangzhou-l3', cars: 6 }],
  }),
  line({
    id: '4', name: 'Line 4', nameLocal: '4号线', short: '4', color: '#6CC24A',
    osm: { relations: [9641050, 13077392] }, run: METRO,
    service: hz({ peak: 4.5, mid: 7, eve: 7, late: 9, we: 6 }),
    patterns: both('浦沿', '池华街'),
    stock: [{ stock: 'hangzhou-l4', cars: 6 }],
  }),
  line({
    id: '5', name: 'Line 5', nameLocal: '5号线', short: '5', color: '#00AEC7',
    osm: { relations: [10386952, 10386965] }, run: METRO,
    service: hz({ peak: 3.5, mid: 6, eve: 6, late: 8, we: 5 }),
    patterns: both('南湖东', '姑娘桥'),
    stock: [{ stock: 'hangzhou-l5', cars: 6 }],
  }),
  line({
    id: '6', name: 'Line 6', nameLocal: '6号线', short: '6', color: '#0072CE',
    osm: { relations: [13077286, 13077287, 13077348, 13077349] }, run: FAST,
    service: hz({ peak: 5, mid: 7, eve: 7, late: 9, we: 6 }),
    patterns: split(['枸桔弄', '桂花西路'], ['枸桔弄', '双浦']),
    stock: [{ stock: 'hangzhou-l6', cars: 6 }],
  }),
  line({
    id: '7', name: 'Line 7', nameLocal: '7号线', short: '7', color: '#87189D',
    osm: { relations: [12561898, 13061278] }, run: FAST,
    service: hz({ peak: 6, mid: 8, eve: 8, late: 10, we: 8 }),
    patterns: both('吴山广场', '江东二路'),
    stock: [{ stock: 'hangzhou-l7', cars: 6 }],
  }),
  line({
    id: '8', name: 'Line 8', nameLocal: '8号线', short: '8', color: '#AC145A',
    osm: { relations: [13042425, 13042426] }, run: FAST,
    service: hz({ peak: 8, mid: 10, eve: 10, late: 12, we: 10 }),
    patterns: both('文海南路', '新湾路'),
    stock: [{ stock: 'hangzhou-l8', cars: 6 }],
  }),
  line({
    id: '9', name: 'Line 9', nameLocal: '9号线', short: '9', color: '#BE4D00',
    osm: { relations: [13060895, 13060896] }, run: METRO,
    service: hz({ peak: 5, mid: 7, eve: 7, late: 9, we: 7 }),
    patterns: both('观音塘', '龙安'),
    stock: [{ stock: 'hangzhou-l9', cars: 6 }],
  }),
  line({
    id: '10', name: 'Line 10', nameLocal: '10号线', short: '10', color: '#DAAA00', textColor: '#1A1A1A',
    osm: { relations: [13535686, 13535687] }, run: METRO,
    service: hz({ peak: 5, mid: 7, eve: 7, late: 9, we: 7 }),
    patterns: both('黄龙体育中心', '逸盛路'),
    stock: [{ stock: 'hangzhou-l10', cars: 6 }],
  }),
  line({
    id: '19', name: 'Line 19 (Airport Express)', nameLocal: '19号线', short: '19', color: '#05C3DD',
    osm: { relations: [14613120, 14613131] }, run: EXPRESS,
    service: hz({ peak: 8, mid: 10, eve: 10, late: 12, we: 10 }),
    patterns: both('火车西站', '永盛路'),
    stock: [{ stock: 'hangzhou-l19', cars: 6 }],
  }),
];

await buildSimCity({
  city: 'hangzhou',
  systems: [{ id: 'hzmetro', name: 'Hangzhou Metro' }],
  lines,
  calendar: CHINA_CALENDAR,
  stations: {
    splitDistance: 300,
    rename: {
      火车东站: ['Hangzhou East Railway Station'],
      火车西站: ['Hangzhou West Railway Station'],
      火车南站: ['Hangzhou South Railway Station'],
      城站: ['Chengzhan (Hangzhou Railway Station)'],
      萧山国际机场: ['Xiaoshan International Airport'],
      杭州大会展中心: ['Hangzhou International Expo Center'],
      港城大道: ['Gangcheng Avenue'],
      南阳: ['Nanyang'],
      向阳路: ['Xiangyang Road'],
      建设一路: ['Jiansheyi Road'],
      建设三路: ['Jianshesan Road'],
      三坝: ['Sanba'],
      星桥: ['Xingqiao'],
      黄鹤山: ['Huangheshan'],
      华鹤街: ['Huahe Street'],
      丁桥: ['Dingqiao'],
      同协路: ['Tongxie Road'],
      华丰路: ['Huafeng Road'],
      汽轮广场: ['Qilun Square'],
      新天地街: ['Xintiandi Street'],
      善贤: ['Shanxian'],
      香积寺: ['Xiangjisi'],
      潮王路: ['Chaowang Road'],
      古荡: ['Gudang'],
      西溪湿地南: ['Xixi Wetland South'],
      西溪湿地北: ['Xixi Wetland North'],
      联胜路: ['Liansheng Road'],
      高教路: ['Gaojiao Road'],
      全丰: ['Quanfeng'],
      龙舟北路: ['North Longzhou Road'],
      吴山前村: ['Wushanqiancun'],
      留下: ['Liuxia'],
      屏峰: ['Pingfeng'],
      小和山: ['Xiaoheshan'],
      杨家墩: ['Yangjiadun'],
      江锦路: ['Jiangjin Road'],
      景芳: ['Jingfang'],
      明石路: ['Mingshi Road'],
      黎明: ['Liming'],
      笕桥老街: ['Jianqiao Old Street'],
      华中南路: ['South Huazhong Road'],
      皋亭坝: ['Gaotingba'],
      桃源街: ['Taoyuan Street'],
      平安桥: ['Ping’an Bridge'],
      储运路: ['Chuyun Road'],
      好运街: ['Haoyun Street'],
      桂花西路: ['West Guihua Road'],
      公望街: ['Gongwang Street'],
      阳陂湖: ['Yangpihu'],
      高桥: ['Gaoqiao'],
      富阳客运中心: ['Fuyang Coach Center'],
      受降: ['Shouxiang'],
      野生动物园东: ['Wildlife Park East'],
      中村: ['Zhongcun'],
      音乐学院: ['Conservatory of Music'],
      美院象山: ['CAA Xiangshan Campus'],
      枫桦西路: ['West Fenghua Road'],
      之江文化中心: ['Zhijiang Cultural Center'],
      西浦路: ['Xipu Road'],
      伟业路: ['Weiye Road'],
      诚业路: ['Chengye Road'],
      建业路: ['Jianye Road'],
      江汉路: ['Jianghan Road'],
      江陵路: ['Jiangling Road'],
      博览中心: ['Expo Center'],
      江城路: ['Jiangcheng Road'],
      吴山广场: ['Wushan Square'],
      新湾路: ['Xinwan Road'],
      冯娄村: ['Fengloucun'],
      仓北村: ['Cangbeicun'],
      青西三路: ['Qingxisan Road'],
      河庄路: ['Hezhuang Road'],
      工商大学云滨: ['ZJGSU Yunbin'],
      邱山大街: ['Qiushan Street'],
      知行路: ['Zhixing Road'],
      耕文路: ['Gengwen Road'],
      平澜路: ['Pinglan Road'],
      五联: ['Wulian'],
      创景路: ['Chuangjing Road'],
      文三路: ['Wensan Road'],
    },
  },
  attribution: ['Service simulated from typical Hangzhou Metro intervals'],
});

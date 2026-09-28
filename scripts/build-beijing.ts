// Beijing: the Beijing Subway's lines inside the map (lines 1–19, Yizhuang, Fangshan, Changping, the two airport
// expresses, the S1 maglev and the Xijiao tram), simulated with the sim kit (docs/KIT_SIM.md). Network from OSM route
// relations; headways from Beijing Subway's published intervals and timetable changes, as reported on the lines'
// Wikipedia pages (2019–2026).
import { buildSimCity, type DayService, type DayServices, type SimLineConfig } from './lib/osm-network/index.ts';

type Bands = [string, number][];
const day = (first: string, last: string, headways: Bands, terminals?: DayService['terminals']): DayService => ({ first, last, headways, ...(terminals ? { terminals } : {}) });
/** A weekday-only window (a peak short turn) running every `hw` minutes. */
const peak = (first: string, last: string, hw: number): DayServices => ({ weekday: day(first, last, [[first, hw]]), saturday: null, sunday: null });
/** Typical Beijing day: weekday peaks and off-peak, weekend all-day. */
/** Weekday morning and evening peak windows (no service between them) for a short-turn group. */
const peaks = (amFrom: string, amTo: string, amHw: number, pmFrom: string, pmTo: string, pmHw: number): DayServices => ({
  weekday: day(amFrom, pmTo, [[amFrom, amHw], [amTo, 0], [pmFrom, pmHw], [pmTo, 0]]),
  saturday: null,
  sunday: null,
});
const week = (first: string, last: string, am: number, mid: number, pm: number, eve: number, wkd: number, late = eve + 2): DayServices => ({
  weekday: day(first, last, [[first, eve], ['07:00', am], ['09:00', mid], ['17:00', pm], ['19:30', eve], ['21:30', late]]),
  sunday: day(first, last, [[first, eve], ['07:30', wkd], ['20:00', eve], ['21:30', late]]),
});

const SUBWAY = 'beijing-subway';
const LINE6 = [
  '金安桥', '苹果园', '杨庄', '西黄村', '廖公庄', '田村', '海淀五路居', '慈寿寺', '花园桥', '白石桥南', '二里沟', '车公庄西', '车公庄',
  '平安里', '北海北', '南锣鼓巷', '东四', '朝阳门', '东大桥', '呼家楼', '金台路', '十里堡', '青年路', '褡裢坡', '黄渠', '常营', '草房',
  '物资学院路', '通州北关', '通运门', '北运河西', '北运河东', '郝家府', '东夏园', '潞城',
];
const LINE6_SKIPPED = ['褡裢坡', '黄渠', '常营', '草房', '物资学院路', '通州北关', '通运门', '北运河西', '北运河东'];
const LINE6_EXPRESS = LINE6.filter((s) => !LINE6_SKIPPED.includes(s));
const TYPE_B = { vmax: 80, acc: 0.9, dec: 1.0, dwell: 30, dwellInterchange: 45 };
const FAST = { vmax: 100, acc: 0.9, dec: 1.0, dwell: 30, dwellInterchange: 45 };
const line = (
  id: string, short: string, name: string, nameLocal: string, color: string, relations: number[], run: SimLineConfig['run'],
  service: DayServices, patterns: SimLineConfig['patterns'], stock: SimLineConfig['stock'], extra: Partial<SimLineConfig> = {},
): SimLineConfig => ({
  id, system: SUBWAY, name, nameLocal, short, color, bullet: /^\d+$/.test(short) ? 'square' : 'pill', kind: 'subway',
  osm: { relations }, run, service, patterns, stock, ...extra,
});
const num = (n: string, color: string, relations: number[], run: SimLineConfig['run'], service: DayServices, patterns: SimLineConfig['patterns'], stock: SimLineConfig['stock'], extra?: Partial<SimLineConfig>) =>
  line(n, n, `Line ${n}`, `${n}号线`, color, relations, run, service, patterns, stock, extra);

const lines: SimLineConfig[] = [
  // Line 1 and the Batong line have run as one service since August 2021.
  num('1', '#A4343A', [1667139, 1667140], { ...TYPE_B, trip: { from: '古城', to: '环球度假区', minutes: 85 } }, week('05:05', '22:55', 2.33, 4.5, 2.8, 5, 4.5, 8),
    [
      { from: '苹果园', to: '环球度假区', share: 1 },
      { from: '果园', to: '公主坟', share: 1, group: 'am' },
      { from: '古城', to: '果园', share: 1, group: 'pm' },
    ],
    [{ stock: 'beijing-dkz4', share: 31, cars: 6 }, { stock: 'beijing-sfm04', share: 39, cars: 6 }, { stock: 'beijing-sfm01', share: 30, cars: 6 }, { stock: 'beijing-bdk06', share: 12, cars: 6 }],
    { name: 'Line 1 / Batong', nameLocal: '1号线/八通线', groups: { am: peak('07:00', '09:00', 7), pm: peak('17:00', '19:30', 14) }, directions: ['Eastbound', 'Westbound'] },
  ),
  num('2', '#004B87', [1667236, 1667237], TYPE_B, week('05:10', '22:40', 2, 4, 2.5, 5, 4, 7),
    [{ from: '西直门', to: '西直门', loop: true, share: 1, loopDest: { Clockwise: ['Inner Loop', '内环'], Counterclockwise: ['Outer Loop', '外环'] } }],
    [{ stock: 'beijing-dkz16', cars: 6 }],
  ),
  num('3', '#D90627', [18420549, 18420550], FAST, week('05:30', '22:50', 5, 7, 5.5, 8, 7, 10),
    [{ from: '东四十条', to: '东坝北', share: 1 }],
    [{ stock: 'beijing-zbm06', cars: 4 }],
    { directions: ['Eastbound', 'Westbound'] },
  ),
  // Line 4 and the Daxing line run through; weekday peak short turns Huangcun Xidajie–Zhongguancun alternate 1:1.
  num('4', '#008C95', [2083779, 2083780], TYPE_B, week('05:00', '22:40', 4, 4, 4, 6, 4.5, 8),
    [
      { from: '安河桥北', to: '天宫院', share: 1 },
      { from: '黄村西大街', to: '中关村', share: 1, group: 'peak' },
    ],
    [{ stock: 'beijing-sfm05', cars: 6 }],
    { name: 'Line 4 / Daxing', nameLocal: '4号线/大兴线', groups: { peak: peaks('07:00', '09:00', 4, '17:00', '19:30', 4) }, directions: ['Southbound', 'Northbound'] },
  ),
  num('5', '#AA0061', [1721064, 1721065], TYPE_B, week('04:59', '22:50', 2, 4.5, 2.5, 5, 4, 8),
    [{ from: '天通苑北', to: '宋家庄', share: 1 }],
    [{ stock: 'beijing-dkz13', cars: 6 }],
    { directions: ['Southbound', 'Northbound'] },
  ),
  num('6', '#B58500', [4625140, 4625141], FAST, week('04:55', '22:50', 4, 6, 4, 7, 5.5, 10),
    [
      { from: '金安桥', to: '潞阳', share: 1 },
      // Peak-direction expresses run nonstop from Haojiafu to Qingnian Road, overtaking locals at Changying.
      { from: '潞城', to: '金安桥', oneWay: true, share: 1, group: 'expressAm', service: ['Express', '大站快车'], express: LINE6_EXPRESS },
      { from: '金安桥', to: '潞城', oneWay: true, share: 1, group: 'expressPm', service: ['Express', '大站快车'], express: LINE6_EXPRESS },
      { from: '草房', to: '朝阳门', share: 1, group: 'peak' },
    ],
    [{ stock: 'beijing-dkz47', cars: 8 }],
    {
      groups: {
        peak: peaks('07:00', '09:00', 5, '17:00', '19:30', 6),
        // Timed to pass Changying 06:50–07:27 westbound and 17:37–19:17 eastbound.
        expressAm: peak('06:30', '07:07', 9),
        expressPm: peak('16:47', '18:27', 9),
      },
      directions: ['Eastbound', 'Westbound'],
    },
  ),
  num('7', '#FFC56E', [4623396, 4623397], FAST, week('05:30', '22:50', 4, 6, 4.5, 7, 6, 10),
    [{ from: '北京西站', to: '环球度假区', share: 1 }],
    [{ stock: 'beijing-bdk01', cars: 8 }],
    { directions: ['Eastbound', 'Westbound'] },
  ),
  num('8', '#009B77', [1721067, 1721068], TYPE_B, week('05:00', '22:40', 2.75, 5, 3, 6, 5, 8),
    [{ from: '朱辛庄', to: '瀛海', share: 1 }],
    [{ stock: 'beijing-sfm12', cars: 6 }],
    { directions: ['Southbound', 'Northbound'] },
  ),
  num('9', '#97D700', [2063278, 2674583], TYPE_B, week('05:30', '23:00', 2, 3.5, 2.27, 4, 4, 6),
    [{ from: '国家图书馆', to: '郭公庄', share: 1 }],
    [{ stock: 'beijing-dkz33', cars: 6 }],
    { directions: ['Southbound', 'Northbound'] },
  ),
  num('10', '#0092BC', [1721075, 1721076], TYPE_B, week('04:45', '22:45', 2, 4, 2, 5, 4, 7),
    [{ from: '巴沟', to: '巴沟', loop: true, share: 1, loopDest: { Clockwise: ['Inner Loop', '内环'], Counterclockwise: ['Outer Loop', '外环'] } }],
    [{ stock: 'beijing-dkz15', cars: 6 }],
  ),
  num('11', '#FF8674', [13623625, 13623627], FAST, week('06:00', '22:30', 8, 10, 8, 10, 10, 12),
    [{ from: '模式口', to: '新首钢', share: 1 }],
    [{ stock: 'beijing-zbm04', cars: 4 }],
    { directions: ['Southbound', 'Northbound'] },
  ),
  num('12', '#9C4F01', [18441518, 18441519], FAST, week('05:30', '22:50', 4, 6, 4.5, 7, 6, 9),
    [{ from: '四季青桥', to: '东坝北', share: 1 }],
    [{ stock: 'beijing-ccd5049', cars: 4 }],
    { directions: ['Eastbound', 'Westbound'] },
  ),
  num('13', '#F4DA40', [1667375, 1667376], TYPE_B, week('05:00', '22:50', 2.5, 5, 2.75, 6, 5, 8),
    [{ from: '西直门', to: '东直门', share: 1 }],
    [{ stock: 'beijing-dkz5', share: 56, cars: 6 }, { stock: 'beijing-zbm15', share: 30, cars: 6 }],
  ),
  // Line 14: every train runs end to end off-peak; in the weekday peaks a Lize Business District–Shan'gezhuang short
  // turn alternates 1:1 with them, and late evenings a Jiulongshan short turn does.
  num('14', '#CA9A8E', [4611276, 4613036], { ...FAST, vmax: 80 }, week('05:30', '22:50', 6, 6, 6, 6, 6, 8),
    [
      { from: '张郭庄', to: '善各庄', share: 1 },
      { from: '丽泽商务区', to: '善各庄', share: 1, group: 'peak' },
      { from: '九龙山', to: '善各庄', share: 1, group: 'late' },
    ],
    [{ stock: 'beijing-dkz53', cars: 6 }],
    {
      groups: {
        peak: peaks('07:30', '10:00', 6, '17:00', '19:30', 6),
        late: { weekday: day('21:30', '23:00', [['21:30', 8]]), sunday: day('21:30', '23:10', [['21:30', 16]]) },
      },
      directions: ['Eastbound', 'Westbound'],
    },
  ),
  num('15', '#653279', [1350597, 2688948], FAST, week('05:00', '22:40', 5.7, 6, 5, 7, 6, 9),
    [
      { from: '俸伯', to: '清华东路西口', share: 1 },
      { from: '后沙峪', to: '清华东路西口', share: 1, group: 'am' },
    ],
    [{ stock: 'beijing-dkz31', cars: 6 }],
    { groups: { am: peak('07:00', '09:00', 11.5) }, directions: ['Westbound', 'Eastbound'] },
  ),
  num('16', '#6BA539', [7800400, 8324249], FAST, week('05:00', '22:40', 3.5, 6, 4, 7, 6, 9),
    [{ from: '北安河', to: '宛平城', share: 1 }],
    [{ stock: 'beijing-dkz93', cars: 8 }],
    { directions: ['Southbound', 'Northbound'] },
  ),
  num('17', '#00ABAB', [13625142, 13625144], { ...FAST, trip: { from: '未来科学城北', to: '嘉会湖', minutes: 66 } }, week('05:30', '22:40', 6, 8, 6, 8, 8, 10),
    [{ from: '未来科学城北', to: '嘉会湖', share: 1 }],
    [{ stock: 'beijing-sfm79', cars: 8 }],
    { directions: ['Southbound', 'Northbound'] },
  ),
  // OSM's Line 18 relations skip five of its stations; the sequence below is the opened line (Wenhua Lu isn't mapped).
  num('18', '#685BC7', [], TYPE_B, week('05:30', '22:40', 4, 6, 4.5, 7, 6, 9),
    [{ from: '马连洼', to: '天通苑东', share: 1 }],
    [{ stock: 'beijing-zbm15', cars: 6 }],
    {
      osm: { sequences: [['马连洼', '上地软件园', '东北旺', '龙泽西', '回龙观西大街', '文化路', '回龙观东大街', '霍营东', '天通苑', '太平庄', '天通苑东']] },
      directions: ['Eastbound', 'Westbound'],
    },
  ),
  num('19', '#D3A3C9', [13625325, 13625326], { vmax: 120, acc: 0.9, dec: 1.0, dwell: 35, dwellInterchange: 45 }, week('05:30', '22:50', 3.83, 6, 4.83, 7, 6, 9),
    [{ from: '牡丹园', to: '新宫', share: 1 }],
    [{ stock: 'beijing-sfm80', cars: 8 }],
    { directions: ['Southbound', 'Northbound'] },
  ),
  line('yizhuang', 'YZ', 'Yizhuang Line', '亦庄线', '#D0006F', [2201486, 2201487], TYPE_B, week('05:20', '22:50', 3, 6, 3.5, 7, 6, 9),
    [{ from: '宋家庄', to: '亦庄火车站', share: 1 }],
    [{ stock: 'beijing-dkz32', cars: 6 }],
    { directions: ['Southbound', 'Northbound'] },
  ),
  // Fangshan: in the morning peak Libafang–Dongguantou South short turns alternate 1:3 with full trips.
  line('fangshan', 'FS', 'Fangshan Line', '房山线', '#D86018', [1721084, 1721085], FAST, week('05:15', '22:50', 3.5, 6, 3, 7, 6, 9),
    [
      { from: '东管头南', to: '阎村东', share: 1 },
      { from: '篱笆房', to: '东管头南', share: 1, group: 'am' },
    ],
    [{ stock: 'beijing-bjd01', cars: 6 }],
    { groups: { am: peak('07:00', '09:00', 10.5) }, directions: ['Southbound', 'Northbound'] },
  ),
  // Changping: weekday peak trains also turn at Changping Dongguan and Shahe University Park.
  line('changping', 'CP', 'Changping Line', '昌平线', '#D986BA', [2111424, 2111425], FAST, week('05:20', '22:40', 5.5, 6, 5.5, 7, 6, 9),
    [
      { from: '昌平西山口', to: '蓟门桥', share: 1 },
      { from: '沙河高教园', to: '蓟门桥', share: 1, group: 'peak' },
    ],
    [{ stock: 'beijing-sfm13', cars: 6 }],
    { groups: { peak: peaks('07:00', '09:00', 11, '17:00', '19:30', 11) }, directions: ['Southbound', 'Northbound'] },
  ),
  // Capital Airport Express: a one-way loop Beixinqiao → Dongzhimen → Sanyuanqiao → T3 → T2 → back to Beixinqiao.
  line('airport', 'AE', 'Capital Airport Express', '首都机场线', '#A192B2', [2062998, 2062999], { vmax: 110, acc: 0.9, dec: 1.0, dwell: 40 },
    { weekday: day('06:00', '22:30', [['06:00', 10], ['07:00', 8.5], ['09:00', 10]]) },
    [
      { from: '北新桥', to: '首都机场2号航站楼', oneWay: true, share: 1 },
      { from: '首都机场2号航站楼', to: '北新桥', oneWay: true, share: 1 },
    ],
    [{ stock: 'beijing-qkz5', cars: 4 }],
    { kind: 'rail' },
  ),
  line('daxing-airport', 'DX', 'Daxing Airport Express', '大兴机场线', '#0049A5', [10136948, 10136949], { vmax: 160, acc: 0.8, dec: 0.9, dwell: 60, trip: { from: '草桥', to: '大兴机场', minutes: 19 } },
    { weekday: day('06:00', '22:30', [['06:00', 10], ['07:00', 8], ['09:00', 10]]) },
    [{ from: '草桥', to: '大兴机场', share: 1 }],
    [{ stock: 'beijing-gsye20', cars: 8 }],
    { kind: 'rail', directions: ['To Daxing Airport', 'To Caoqiao'] },
  ),
  line('s1', 'S1', 'Line S1', 'S1线', '#A45A2A', [8008812, 8008814], { vmax: 100, acc: 0.9, dec: 1.0, dwell: 30 }, week('05:30', '22:40', 6, 8, 6, 8, 8, 10),
    [{ from: '石厂', to: '苹果园', share: 1 }],
    [{ stock: 'beijing-s1-maglev', cars: 6 }],
    { kind: 'monorail', directions: ['Eastbound', 'Westbound'] },
  ),
  line('xijiao', 'XJ', 'Xijiao Line', '西郊线', '#D22630', [8008876, 8303695], { vmax: 70, acc: 0.9, dec: 1.0, dwell: 25 },
    { weekday: day('06:00', '22:30', [['06:00', 6]]), sunday: day('06:00', '22:30', [['06:00', 6], ['08:30', 4], ['18:00', 6]]) },
    [{ from: '巴沟', to: '香山', share: 1 }],
    [{ stock: 'beijing-xijiao-tram', cars: 1 }],
    { kind: 'tram', directions: ['Westbound', 'Eastbound'] },
  ),
];

await buildSimCity({
  city: 'beijing',
  systems: [{ id: SUBWAY, name: 'Beijing Subway' }],
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
      北京站: ['Beijing Railway Station', '北京站'],
      北京西站: ['Beijing West Railway Station', '北京西站'],
      北京南站: ['Beijing South Railway Station', '北京南站'],
      北京北站: ['Beijing North Railway Station', '北京北站'],
      朝阳站: ['Beijing Chaoyang Railway Station', '朝阳站'],
      清河站: ['Qinghe Railway Station', '清河站'],
      亦庄火车站: ['Yizhuang Railway Station', '亦庄火车站'],
      // Line 17 stations without English names in OSM.
      十八里店: ['Shibalidian', '十八里店'],
      北神树: ['Beishenshu', '北神树'],
      周家庄: ['Zhoujiazhuang', '周家庄'],
      次渠北: ['Ciqubei', '次渠北'],
      嘉会湖: ['Jiahuihu', '嘉会湖'],
    },
  },
  attribution: ['Service intervals: Beijing Subway (bjsubway.com)'],
});

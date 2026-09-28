// Shanghai: Metro lines 1–18, the Pujiang line, the Maglev and the Airport Link Line, simulated with the sim kit
// (docs/KIT_SIM.md). Network from OSM route relations; headways from Shanghai Metro's published intervals (weekday
// peaks, off-peak and weekend), as collected on the lines' Chinese Wikipedia pages (updated 2023–2026).
import { buildSimCity, type DayService, type DayServices, type SimLineConfig } from './lib/osm-network/index.ts';

type Bands = [string, number][];
const day = (first: string, last: string, headways: Bands, terminals?: DayService['terminals']): DayService => ({ first, last, headways, ...(terminals ? { terminals } : {}) });
/** No departures on weekdays (DayServices.weekday can't be null): the departure loop never starts when first is after last. */
const NONE: DayService = { first: '12:00', last: '11:59', headways: [['12:00', 60]] };
const weekdaysOnly = (d: DayService): DayServices => ({ weekday: d, saturday: null, sunday: null });
const weekendsOnly = (d: DayService): DayServices => ({ weekday: NONE, saturday: d, sunday: d });
/** A weekday-only window (a peak short turn) running every `hw` minutes. */
const peak = (first: string, last: string, hw: number) => weekdaysOnly(day(first, last, [[first, hw]]));

/** Weekday morning and evening peak windows (no service between them) for a short-turn group. */
const peaks = (amFrom: string, amTo: string, amHw: number, pmFrom: string, pmTo: string, pmHw: number): DayServices => ({
  weekday: day(amFrom, pmTo, [[amFrom, amHw], [amTo, 0], [pmFrom, pmHw], [pmTo, 0]]),
  saturday: null,
  sunday: null,
});
const METRO = 'shanghai-metro';
const metro = (
  id: string, color: string, relations: number[], run: SimLineConfig['run'], service: DayServices,
  patterns: SimLineConfig['patterns'], stock: SimLineConfig['stock'], extra: Partial<SimLineConfig> = {},
): SimLineConfig => ({
  id, system: METRO, name: `Line ${id}`, nameLocal: `${id}号线`, short: id, color, bullet: 'square', kind: 'subway',
  osm: { relations }, run, service, patterns, stock, ...extra,
});

// Run models: Class A lines top out at 80 km/h (lines 11 and 17: 100, line 16: 120); dwell ~30 s, more at interchanges.
const run80 = { vmax: 80, acc: 0.9, dec: 1.0, dwell: 30, dwellInterchange: 40 };

const lines: SimLineConfig[] = [
  metro('1', '#E3002B', [199200, 6800210, 14974356, 14974357], run80,
    {
      weekday: day('05:25', '22:40', [['05:25', 8], ['07:00', 2.5], ['09:30', 6], ['17:00', 3], ['19:30', 5], ['21:30', 8]]),
      sunday: day('05:25', '22:40', [['05:25', 8], ['07:30', 5], ['08:30', 4], ['20:30', 6], ['21:30', 8]]),
    },
    [
      { from: '富锦路', to: '莘庄', share: 1 },
      // Off-peak weekday short turns fill the core to every 4 minutes.
      { from: '上海火车站', to: '莘庄', share: 1, group: 'core' },
    ],
    [{ stock: 'shanghai-01a01', share: 37, cars: 8 }, { stock: 'shanghai-01a05', share: 16, cars: 8 }, { stock: 'shanghai-01a06', share: 31, cars: 8 }],
    { groups: { core: peak('09:30', '16:30', 12) }, directions: ['Southbound', 'Northbound'] },
  ),
  metro('2', '#82BF25', [5611325, 5611326], run80,
    {
      weekday: day('05:30', '22:40', [['05:30', 10], ['07:00', 3.75], ['10:00', 5], ['17:00', 4.5], ['20:30', 7], ['21:30', 10]]),
      sunday: day('05:30', '22:40', [['05:30', 10], ['08:30', 4], ['20:30', 7], ['21:30', 10]]),
    },
    [
      { from: '蟠祥路', to: '浦东1号2号航站楼', share: 1 },
      { from: '淞虹路', to: '广兰路', share: 1, group: 'peak' },
    ],
    [{ stock: 'shanghai-02a01', share: 16, cars: 8 }, { stock: 'shanghai-02a02', share: 21, cars: 8 }, { stock: 'shanghai-02a05', share: 63, cars: 8 }],
    { groups: { peak: peaks('07:00', '10:00', 7.5, '17:00', '20:30', 9) }, directions: ['Eastbound', 'Westbound'] },
  ),
  metro('3', '#FCD600', [196738, 6817178], run80,
    {
      weekday: day('05:25', '22:30', [['05:25', 10], ['07:30', 5], ['09:00', 8], ['17:00', 5], ['19:30', 8], ['21:30', 10]]),
      sunday: day('05:25', '22:30', [['05:25', 12], ['08:00', 13], ['20:00', 14]]),
    },
    [
      { from: '江杨北路', to: '上海南站', share: 1 },
      { from: '长江南路', to: '上海南站', share: 1, group: 'weekend' },
    ],
    [{ stock: 'shanghai-03a01', share: 28, cars: 6 }, { stock: 'shanghai-03a02', share: 21, cars: 6 }],
    { groups: { weekend: weekendsOnly(day('08:00', '20:00', [['08:00', 13]])) }, directions: ['Southbound', 'Northbound'] },
  ),
  metro('4', '#461D84', [196854, 7448423], run80,
    {
      weekday: day('05:25', '22:00', [['05:25', 10], ['07:30', 5], ['09:00', 8], ['17:00', 5], ['19:30', 8], ['21:30', 12]]),
      sunday: day('05:25', '22:00', [['05:25', 10], ['08:00', 6.5], ['20:00', 10]]),
    },
    [{ from: '宜山路', to: '宜山路', loop: true, share: 1, loopDest: { Clockwise: ['Inner Loop', '内圈'], Counterclockwise: ['Outer Loop', '外圈'] } }],
    [{ stock: 'shanghai-04a01', share: 28, cars: 6 }, { stock: 'shanghai-03a02', share: 14, cars: 6 }],
  ),
  metro('5', '#944D9A', [214779, 6806163, 9170631, 9170632], run80,
    {
      weekday: day('05:28', '22:40', [['05:28', 10], ['07:30', 3.75], ['09:30', 10], ['17:00', 4.5], ['20:00', 10]]),
      sunday: day('05:28', '22:40', [['05:28', 10], ['07:00', 8], ['20:00', 10]]),
    },
    [
      { from: '莘庄', to: '奉贤新城', share: 1 },
      // The Minhang Development Zone branch keeps the original 4-car sets.
      { from: '莘庄', to: '闵行开发区', share: 1, group: 'branch', stock: [{ stock: 'shanghai-05c01', cars: 4 }] },
    ],
    [{ stock: 'shanghai-05c02', cars: 6 }],
    {
      groups: {
        branch: {
          weekday: day('05:50', '22:35', [['05:50', 10], ['07:30', 7.5], ['09:30', 10], ['17:00', 9], ['20:00', 10]]),
          sunday: day('05:50', '22:35', [['05:50', 10], ['07:00', 8], ['20:00', 10]]),
        },
      },
      directions: ['Southbound', 'Northbound'],
    },
  ),
  metro('6', '#D40068', [214736, 6840915], run80,
    {
      weekday: day('05:30', '22:30', [['05:30', 11], ['07:20', 4], ['09:00', 10], ['16:30', 3.75], ['19:00', 11]]),
      sunday: day('05:30', '22:30', [['05:30', 11], ['08:30', 10], ['20:30', 11]]),
    },
    [
      { from: '港城路', to: '东方体育中心', share: 1 },
      { from: '巨峰路', to: '高青路', share: 1, group: 'core' },
      { from: '港城路', to: '高青路', share: 1, group: 'am' },
    ],
    [{ stock: 'shanghai-06c01', share: 50, cars: 4 }, { stock: 'shanghai-06c04', share: 26, cars: 4 }],
    {
      groups: {
        core: {
          weekday: day('09:00', '22:00', [['09:00', 10], ['16:30', 7.5], ['19:00', 11]]),
          sunday: day('06:30', '22:00', [['06:30', 10], ['08:30', 5], ['20:30', 11]]),
        },
        am: peak('07:20', '09:00', 4),
      },
      directions: ['Southbound', 'Northbound'],
    },
  ),
  metro('7', '#ED6F00', [6819599, 6819600], run80,
    {
      weekday: day('05:30', '22:30', [['05:30', 10], ['07:30', 3.5], ['09:00', 7], ['17:00', 5], ['19:00', 10]]),
      sunday: day('05:30', '22:30', [['05:30', 10], ['08:00', 9], ['20:00', 10]]),
    },
    [
      { from: '美兰湖', to: '花木路', share: 1 },
      { from: '祁华路', to: '杨高南路', share: 1, group: 'peak' },
      { from: '祁华路', to: '花木路', share: 1, group: 'weekend' },
    ],
    [{ stock: 'shanghai-07a01', share: 42, cars: 6 }, { stock: 'shanghai-07a02', share: 37, cars: 6 }],
    { groups: { peak: peaks('07:30', '09:00', 4, '17:00', '19:00', 10), weekend: weekendsOnly(day('08:00', '20:00', [['08:00', 18]])) } },
  ),
  metro('8', '#0094D8', [196737, 7451832], run80,
    {
      weekday: day('05:30', '22:30', [['05:30', 11], ['07:15', 3.5], ['09:20', 8.7], ['17:00', 5.5], ['19:20', 11]]),
      sunday: day('05:30', '22:30', [['05:30', 11], ['08:00', 5.5], ['19:00', 11]]),
    },
    [
      { from: '市光路', to: '沈杜公路', share: 1 },
      { from: '延吉中路', to: '东方体育中心', share: 1, group: 'core' },
      { from: '延吉中路', to: '沈杜公路', share: 1, group: 'peak' },
    ],
    [{ stock: 'shanghai-08c02', share: 62, cars: 7 }, { stock: 'shanghai-08c01', share: 28, cars: 6 }],
    {
      groups: {
        core: {
          weekday: day('09:20', '22:00', [['09:20', 8.7], ['19:20', 11]]),
          sunday: day('08:00', '22:00', [['08:00', 11], ['19:00', 12]]),
        },
        peak: peaks('07:15', '09:20', 4.7, '17:00', '19:20', 11),
      },
      directions: ['Southbound', 'Northbound'],
    },
  ),
  metro('9', '#87CAED', [214629, 7451834], run80,
    {
      weekday: day('05:30', '22:30', [['05:30', 9], ['07:30', 5], ['09:00', 6], ['17:00', 5], ['19:30', 9]]),
      sunday: day('05:30', '22:30', [['05:30', 9], ['08:00', 5], ['20:00', 8]]),
    },
    [
      { from: '上海松江站', to: '曹路', share: 1 },
      { from: '佘山', to: '金海路', share: 1, group: 'am' },
      { from: '佘山', to: '杨高中路', share: 1, group: 'pm' },
    ],
    [{ stock: 'shanghai-09a02', share: 51, cars: 6 }, { stock: 'shanghai-09a03', share: 53, cars: 6 }],
    { groups: { am: peak('07:30', '09:00', 2.9), pm: peak('17:00', '19:30', 4.1) }, directions: ['Eastbound', 'Westbound'] },
  ),
  metro('10', '#C6AFD4', [199189, 7452116, 7452117, 7452118], run80,
    {
      weekday: day('05:49', '22:30', [['05:49', 10], ['07:00', 5], ['09:00', 6], ['17:30', 5], ['19:30', 8], ['21:30', 10]]),
      sunday: day('05:49', '22:30', [['05:49', 10], ['07:00', 10], ['22:30', 12]]),
    },
    [
      { from: '虹桥火车站', to: '基隆路', share: 1 },
      { from: '航中路', to: '新江湾城', share: 1, group: 'branch' },
      { from: '虹桥火车站', to: '新江湾城', share: 1, group: 'am' },
      { from: '虹桥火车站', to: '新江湾城', share: 1, group: 'weekend' },
    ],
    [{ stock: 'shanghai-10a01', cars: 6 }],
    {
      groups: {
        branch: {
          weekday: day('05:49', '22:30', [['05:49', 12], ['07:00', 8], ['09:00', 12], ['21:30', 14]]),
          sunday: day('05:49', '22:30', [['05:49', 12], ['07:00', 10], ['22:30', 14]]),
        },
        am: peak('07:00', '09:00', 8),
        weekend: weekendsOnly(day('07:00', '22:00', [['07:00', 15]])),
      },
      directions: ['Eastbound', 'Westbound'],
    },
  ),
  metro('11', '#871C2B', [5611108, 5611109, 5611110, 5611111], { vmax: 100, acc: 0.9, dec: 1.0, dwell: 30, dwellInterchange: 40 },
    {
      weekday: day('05:36', '22:10', [['05:36', 12]]),
      sunday: day('05:36', '22:10', [['05:36', 12], ['08:00', 10], ['20:00', 12]]),
    },
    [
      { from: '嘉定北', to: '迪士尼', share: 1 },
      { from: '花桥', to: '迪士尼', share: 1 },
      { from: '嘉定新城', to: '罗山路', share: 1, group: 'am' },
      { from: '南翔', to: '三林', share: 1, group: 'am2' },
      { from: '嘉定新城', to: '罗山路', share: 1, group: 'pm' },
    ],
    [{ stock: 'shanghai-11a01', cars: 6 }],
    // The main group alternates the two branches, each every `headway` minutes.
    { groups: { am: peak('07:30', '09:00', 6), am2: peak('07:30', '09:00', 6), pm: peak('17:30', '19:00', 7) }, directions: ['Eastbound', 'Westbound'] },
  ),
  metro('12', '#007B61', [5498699, 7451886], run80,
    {
      weekday: day('05:30', '22:30', [['05:30', 10], ['07:30', 5], ['09:00', 6], ['17:00', 7.5], ['19:30', 8], ['21:30', 10]]),
      sunday: day('05:30', '22:30', [['05:30', 10], ['08:00', 6], ['20:30', 10]]),
    },
    [
      { from: '七莘路', to: '金海路', share: 1 },
      { from: '虹梅路', to: '巨峰路', share: 1, group: 'peak' },
    ],
    [{ stock: 'shanghai-12a01', share: 56, cars: 6 }, { stock: 'shanghai-12a03', share: 19, cars: 6 }],
    { groups: { peak: peaks('07:30', '09:00', 5, '17:00', '19:30', 7.5) }, directions: ['Eastbound', 'Westbound'] },
  ),
  metro('13', '#E999C0', [214631, 7451888], run80,
    {
      weekday: day('05:30', '22:30', [['05:30', 10], ['07:30', 5.5], ['09:30', 7], ['17:00', 8], ['19:30', 8], ['21:30', 10]]),
      sunday: day('05:30', '22:30', [['05:30', 10], ['08:30', 6], ['20:30', 10]]),
    },
    [
      { from: '金运路', to: '张江路', share: 1 },
      { from: '金运路', to: '华鹏路', share: 1, group: 'peak' },
    ],
    [{ stock: 'shanghai-13a01', cars: 6 }],
    { groups: { peak: peaks('07:30', '09:30', 5.5, '17:00', '19:30', 8) }, directions: ['Eastbound', 'Westbound'] },
  ),
  metro('14', '#626020', [10557250, 10557251], run80,
    {
      weekday: day('05:30', '22:30', [['05:30', 10], ['07:30', 3.33], ['09:00', 6], ['17:00', 4], ['19:30', 6], ['21:30', 10]]),
      sunday: day('05:30', '22:30', [['05:30', 10], ['08:00', 5], ['20:30', 8]]),
    },
    // Every other train turns at Zhenxin Xincun and Lantian Road, all day.
    [
      { from: '封浜', to: '桂桥路', share: 0.5 },
      { from: '真新新村', to: '蓝天路', share: 0.5 },
    ],
    [{ stock: 'shanghai-14a01', cars: 8 }],
    { directions: ['Eastbound', 'Westbound'] },
  ),
  metro('15', '#BCA886', [12231216, 12231217], run80,
    {
      weekday: day('05:30', '22:30', [['05:30', 13], ['07:30', 7.33], ['09:00', 12], ['17:00', 9], ['19:30', 12]]),
      sunday: day('05:30', '22:30', [['05:30', 13], ['08:00', 12], ['20:30', 13]]),
    },
    [
      { from: '顾村公园', to: '紫竹高新区', share: 1 },
      { from: '古浪路', to: '双柏路', share: 1, group: 'core' },
      { from: '顾村公园', to: '双柏路', share: 1, group: 'peak' },
    ],
    [{ stock: 'shanghai-15a01', cars: 6 }],
    {
      groups: {
        core: {
          weekday: day('06:00', '22:00', [['06:00', 24], ['07:30', 7.33], ['09:00', 24], ['17:00', 9], ['19:30', 24]]),
          sunday: day('07:00', '22:00', [['07:00', 12]]),
        },
        peak: peaks('07:30', '09:00', 7.33, '17:00', '19:30', 9),
      },
      directions: ['Southbound', 'Northbound'],
    },
  ),
  metro('16', '#98D1C0', [5178631, 6803856], { vmax: 120, acc: 0.9, dec: 1.0, dwell: 35, dwellInterchange: 45, trip: { from: '龙阳路', to: '滴水湖', minutes: 57 } },
    {
      weekday: day('05:50', '22:30', [['05:50', 10], ['07:30', 3.5], ['10:30', 10], ['17:00', 5], ['19:30', 10]], { 滴水湖: { first: '06:00' } }),
      sunday: day('05:50', '22:30', [['05:50', 8], ['07:00', 5.67], ['20:30', 8]], { 滴水湖: { first: '06:00' } }),
    },
    [
      { from: '龙阳路', to: '滴水湖', share: 1 },
      // 大站车 every hour; the four 直达车 run nonstop in 34 minutes on weekdays.
      { from: '龙阳路', to: '滴水湖', express: ['罗山路', '新场', '惠南', '临港大道'], share: 1, group: 'express', service: ['Express', '大站车'] },
      { from: '龙阳路', to: '滴水湖', express: [], share: 1, group: 'direct', service: ['Nonstop', '直达车'] },
    ],
    [{ stock: 'shanghai-16a01', cars: 6 }],
    {
      groups: {
        express: { weekday: day('07:00', '21:00', [['07:00', 60]]) },
        direct: weekdaysOnly(day('07:30', '18:00', [['07:30', 15], ['08:00', 40]], { 龙阳路: { last: '07:45' }, 滴水湖: { first: '17:20' } })),
      },
      directions: ['Southbound', 'Northbound'],
    },
  ),
  metro('17', '#BC796F', [6325787, 7845846], { vmax: 100, acc: 0.9, dec: 1.0, dwell: 30, dwellInterchange: 40 },
    {
      weekday: day('05:30', '23:00', [['05:30', 10], ['07:00', 6], ['09:30', 10], ['17:00', 8], ['19:30', 10]], { 西岑: { last: '22:30' }, 虹桥火车站: { first: '06:00' } }),
      sunday: day('05:30', '23:00', [['05:30', 10], ['07:30', 7], ['21:00', 10]], { 西岑: { last: '22:30' }, 虹桥火车站: { first: '06:00' } }),
    },
    [
      { from: '虹桥火车站', to: '西岑', share: 1 },
      { from: '虹桥火车站', to: '淀山湖大道', share: 1, group: 'am' },
    ],
    [{ stock: 'shanghai-17a01', cars: 6 }],
    { groups: { am: peak('07:00', '09:30', 6) }, directions: ['Westbound', 'Eastbound'] },
  ),
  metro('18', '#C4984F', [10095916, 10095917], run80,
    {
      weekday: day('05:30', '22:30', [['05:30', 12], ['07:30', 6], ['09:00', 7], ['17:00', 7], ['19:30', 8], ['21:30', 12]]),
      sunday: day('05:30', '22:30', [['05:30', 12], ['08:00', 6.5], ['20:30', 10]]),
    },
    [
      { from: '康文路', to: '航头', share: 1 },
      { from: '长江南路', to: '沈梅路', share: 1, group: 'peak' },
    ],
    [{ stock: 'shanghai-18a01', cars: 6 }],
    { groups: { peak: peaks('07:30', '09:00', 6, '17:00', '19:30', 7) }, directions: ['Southbound', 'Northbound'] },
  ),
  {
    id: 'pujiang', system: METRO, name: 'Pujiang Line', nameLocal: '浦江线', short: 'PJ', color: '#B5B5B6', bullet: 'square', kind: 'agt',
    osm: { relations: [8167020, 8167021] },
    run: { vmax: 80, acc: 1.0, dec: 1.1, dwell: 25 },
    service: {
      weekday: day('05:10', '22:30', [['05:10', 10], ['07:00', 4.25], ['09:00', 10], ['17:00', 5], ['19:30', 10]], { 汇臻路: { last: '22:15' }, 沈杜公路: { first: '05:25' } }),
      sunday: day('05:10', '22:30', [['05:10', 10]], { 汇臻路: { last: '22:15' }, 沈杜公路: { first: '05:25' } }),
    },
    patterns: [{ from: '沈杜公路', to: '汇臻路', share: 1 }],
    stock: [{ stock: 'shanghai-innovia-apm300', cars: 4 }],
    directions: ['Southbound', 'Northbound'],
  },
  {
    id: 'maglev', system: 'shanghai-maglev', name: 'Shanghai Maglev', nameLocal: '磁浮线', short: 'ML', color: '#008B9A', bullet: 'square', kind: 'monorail',
    osm: { relations: [443258, 9786758] },
    run: { vmax: 300, acc: 0.65, dec: 0.65, dwell: 0, trip: { from: '龙阳路', to: '浦东1号2号航站楼', minutes: 8.2 } },
    service: { weekday: day('06:45', '21:40', [['06:45', 20]]) },
    // Two trains shuttle: each leaves the airport 9 minutes after arriving. The 'back' group starts half a headway
    // late (the kit staggers groups), so 06:52 here is the 07:02 first departure from the airport.
    patterns: [
      { from: '龙阳路', to: '浦东1号2号航站楼', oneWay: true, share: 1, group: 'out' },
      { from: '浦东1号2号航站楼', to: '龙阳路', oneWay: true, share: 1, group: 'back' },
    ],
    groups: { out: { weekday: day('06:45', '21:40', [['06:45', 20]]) }, back: { weekday: day('06:52', '21:32', [['06:52', 20]]) } },
    stock: [{ stock: 'shanghai-transrapid-smt', cars: 5 }],
    directions: ['To Pudong Airport', 'To Longyang Road'],
  },
  {
    id: 'airport', system: 'shanghai-suburban', name: 'Airport Link Line', nameLocal: '市域机场线', short: 'AL', color: '#3D688A', bullet: 'square', kind: 'rail',
    osm: { relations: [16404066, 18468815] },
    run: { vmax: 160, acc: 0.8, dec: 0.9, dwell: 45, trip: { from: '虹桥2号航站楼', to: '浦东1号2号航站楼', minutes: 39 } },
    service: { weekday: day('06:00', '22:00', [['06:00', 15]]) },
    patterns: [{ from: '虹桥2号航站楼', to: '浦东1号2号航站楼', share: 1 }],
    stock: [{ stock: 'shanghai-ccd2031', share: 14, cars: 4 }, { stock: 'shanghai-ccd2031', share: 3, cars: 8 }],
    directions: ['To Pudong Airport', 'To Hongqiao Airport'],
  },
];

await buildSimCity({
  city: 'shanghai',
  systems: [
    { id: METRO, name: 'Shanghai Metro' },
    { id: 'shanghai-maglev', name: 'Shanghai Maglev' },
    { id: 'shanghai-suburban', name: 'Shanghai Suburban Railway' },
  ],
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
    merge: [['浦东1号2号航站楼', '浦东国际机场']],
    rename: {
      上海火车站: ['Shanghai Railway Station', '上海火车站'],
      上海南站: ['Shanghai South Railway Station', '上海南站'],
      上海西站: ['Shanghai West Railway Station', '上海西站'],
      虹桥火车站: ['Hongqiao Railway Station', '虹桥火车站'],
      上海松江站: ['Shanghai Songjiang Railway Station', '上海松江站'],
      // Line 18's 2025 extension has no English names in OSM yet.
      爱辉路: ['Aihui Road', '爱辉路'],
      通南路: ['Tongnan Road', '通南路'],
      长江西路: ['West Changjiang Road', '长江西路'],
    },
  },
  attribution: ['Service intervals: Shanghai Metro (shmetro.com)'],
});

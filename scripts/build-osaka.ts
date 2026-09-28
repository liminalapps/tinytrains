// Builds public/data/osaka/transit.json and server/data/osaka/sim.json with the sim kit (docs/KIT_SIM.md).
// Network: OSM route relations, with station sequences for through services whose partner lines OSM keeps separate
// (Midosuji + Kita-Osaka Kyuko, Chuo + Kintetsu Keihanna, Sakaisuji + Hankyu, JR Yumesaki trains via the Loop Line).
// Private railways (Hankyu, Hanshin, Keihan, Nankai, Kintetsu), the Osaka Monorail and the Yamatoji Rapid run each
// service type as its own group with its stopping pattern ('express' lists) and its own terminals beyond the map.
// Trains: no open timetable exists (no Osaka rail operator is in ODPT or GTFS-JP). Headways by time band come from the
// operators' timetables as summarized on Japanese Wikipedia (2024–2026 timetable changes).
// Usage: npx tsx scripts/build-osaka.ts
import { buildSimCity, type DayService, type DayServices, type PatternConfig, type SimLineConfig } from './lib/osm-network/index.ts';

/** Headways (minutes per direction) for early, morning rush, midday, evening rush, evening and late-night bands. */
type Bands = [number, number, number, number, number, number];
const day = (first: string, last: string, b: Bands): DayService => ({
  first,
  last,
  headways: [[first, b[0]], ['07:00', b[1]], ['09:30', b[2]], ['17:00', b[3]], ['19:30', b[4]], ['22:30', b[5]]],
});
const week = (first: string, last: string, weekday: Bands, weekend: Bands): DayServices => ({
  weekday: day(first, last, weekday),
  saturday: day(first, last, weekend),
  sunday: day(first, last, weekend),
});

const METRO = { vmax: 70, acc: 0.9, dec: 1.0, dwell: 25, dwellInterchange: 35 };
const JR = { vmax: 95, acc: 0.8, dec: 1.0, dwell: 30, dwellInterchange: 40 };

// Through-service station sequences (Japanese names, as in OSM).
const MIDOSUJI = [
  'なかもず', '新金岡', '北花田', 'あびこ', '長居', '西田辺', '昭和町', '天王寺', '動物園前', '大国町', 'なんば', '心斎橋', '本町',
  '淀屋橋', '梅田', '中津', '西中島南方', '新大阪', '東三国', '江坂', '緑地公園', '桃山台', '千里中央', '箕面船場阪大前', '箕面萱野',
];
const CHUO = [
  '夢洲', 'コスモスクエア', '大阪港', '朝潮橋', '弁天町', '九条', '阿波座', '本町', '堺筋本町', '谷町四丁目', '森ノ宮', '緑橋',
  '深江橋', '高井田', '長田', '荒本', '吉田', '新石切', '生駒', '白庭台', '学研北生駒', '学研奈良登美ヶ丘',
];
const SAKAISUJI = ['天下茶屋', '動物園前', '恵美須町', '日本橋', '長堀橋', '堺筋本町', '北浜', '南森町', '扇町', '天神橋筋六丁目', '柴島', '淡路'];
const HANKYU_SENRI = [...SAKAISUJI, '下新庄', '吹田', '豊津', '関大前', '千里山', '南千里', '山田', '北千里'];
const HANKYU_KYOTO = [...SAKAISUJI, '上新庄', '相川', '正雀', '摂津市', '南茨木', '茨木市', '総持寺', '富田', '高槻市'];
const YUMESAKI_THROUGH = [
  '天王寺', '寺田町', '桃谷', '鶴橋', '玉造', '森ノ宮', '大阪城公園', '京橋', '桜ノ宮', '天満', '大阪', '福島', '野田', '西九条',
  '安治川口', 'ユニバーサルシティ', '桜島',
];

const newTram = ['blue', 'yellow', 'pink', 'green', 'orange', 'purple', 'red'].map((c) => ({ stock: `osaka-200-${c}`, share: 19 / 7, cars: 4 }));

const lines: SimLineConfig[] = [
  {
    // Alternate trains run the full line with Kita-Osaka Kyuko ('big run') or Shin-Osaka–Tennoji ('small run').
    id: 'M', system: 'metro', name: 'Midosuji Line', nameLocal: '御堂筋線', short: 'M', color: '#E5171F', bullet: 'circle', kind: 'subway',
    osm: { relations: [8028808, 2411153, 21371798, 21371799], sequences: [MIDOSUJI] },
    run: { ...METRO, vmax: 70, trip: { from: 'なかもず', to: '江坂', minutes: 47 } },
    service: week('05:00', '00:05', [20, 4.5, 8, 5, 7, 10], [20, 6, 8, 6, 8.5, 10]),
    patterns: [
      { from: 'なかもず', to: '箕面萱野', share: 1 },
      { from: '新大阪', to: '天王寺', share: 1 },
    ],
    stock: [
      { stock: 'osaka-30000', share: 0.45, cars: 10 },
      { stock: 'osaka-new20', share: 0.3, cars: 10 },
      { stock: 'osaka-kitakyu-9000', share: 0.15, cars: 10 },
      { stock: 'osaka-kitakyu-8000', share: 0.1, cars: 10 },
    ],
    directions: ['Northbound', 'Southbound'],
  },
  {
    id: 'T', system: 'metro', name: 'Tanimachi Line', nameLocal: '谷町線', short: 'T', color: '#522886', bullet: 'circle', kind: 'subway',
    osm: { relations: [444907, 8028880] },
    run: { ...METRO, trip: { from: '大日', to: '八尾南', minutes: 54 } },
    service: week('05:00', '00:00', [10, 5.5, 6, 6.5, 6, 10], [10, 5.5, 6, 6, 6, 10]),
    // Weekday rush-hour extras between Miyakojima and Fuminosato (mornings) or Kire-Uriwari (evenings).
    groups: {
      am: { weekday: { first: '07:00', last: '09:30', headways: [['07:00', 5.5]] }, saturday: null, sunday: null },
      pm: { weekday: { first: '17:00', last: '19:30', headways: [['17:00', 6.5]] }, saturday: null, sunday: null },
    },
    patterns: [
      { from: '大日', to: '八尾南', share: 1 },
      { from: '都島', to: '文の里', share: 1, group: 'am' },
      { from: '都島', to: '喜連瓜破', share: 1, group: 'pm' },
    ],
    stock: [
      { stock: 'osaka-new20', share: 0.6, cars: 6 },
      { stock: 'osaka-30000', share: 0.3, cars: 6 },
      { stock: 'osaka-30000a', share: 0.1, cars: 6 },
    ],
    directions: ['Southbound', 'Northbound'],
  },
  {
    id: 'Y', system: 'metro', name: 'Yotsubashi Line', nameLocal: '四つ橋線', short: 'Y', color: '#0078BA', bullet: 'circle', kind: 'subway',
    osm: { relations: [444899, 8028854] },
    run: { ...METRO, trip: { from: '西梅田', to: '住之江公園', minutes: 22 } },
    service: week('05:00', '00:05', [10, 2.5, 6, 3.5, 7, 10], [10, 6, 8, 6, 8, 10]),
    patterns: [{ from: '西梅田', to: '住之江公園', share: 1 }],
    stock: [{ stock: 'osaka-new20', cars: 6 }],
    directions: ['Southbound', 'Northbound'],
  },
  {
    // Half the trains run Yumeshima–Gakken Nara-Tomigaoka, half Cosmo Square–Ikoma, over Kintetsu's Keihanna Line.
    id: 'C', system: 'metro', name: 'Chuo Line', nameLocal: '中央線', short: 'C', color: '#019A66', bullet: 'circle', kind: 'subway',
    osm: { relations: [444881, 8028818, 18943761, 18943760, 10258968, 1864803], sequences: [CHUO] },
    run: { ...METRO, vmax: 80, trip: { from: 'コスモスクエア', to: '長田', minutes: 28 } },
    service: week('05:00', '00:00', [20, 6.67, 15, 10, 20, 17.5], [20, 11, 15, 15, 20, 17.5]),
    patterns: [
      { from: '夢洲', to: '学研奈良登美ヶ丘', share: 1 },
      { from: 'コスモスクエア', to: '生駒', share: 1 },
    ],
    stock: [{ stock: 'osaka-400', share: 0.75, cars: 6 }, { stock: 'osaka-kintetsu-7000', share: 0.25, cars: 6 }],
    directions: ['Eastbound', 'Westbound'],
  },
  {
    id: 'S', system: 'metro', name: 'Sennichimae Line', nameLocal: '千日前線', short: 'S', color: '#E44D93', bullet: 'circle', kind: 'subway',
    osm: { relations: [8028803, 444891] },
    run: { ...METRO, trip: { from: '野田阪神', to: '南巽', minutes: 24 } },
    service: week('05:00', '00:00', [10, 4, 7.5, 5, 7.5, 10], [10, 7.5, 7.5, 7.5, 7.5, 10]),
    patterns: [{ from: '野田阪神', to: '南巽', share: 1 }],
    stock: [{ stock: 'osaka-new20', cars: 4 }],
    directions: ['Eastbound', 'Westbound'],
  },
  {
    // A third of the trains turn at Tenjimbashisuji 6-chome; the rest run through onto Hankyu to Kita-Senri or Takatsuki-shi.
    id: 'K', system: 'metro', name: 'Sakaisuji Line', nameLocal: '堺筋線', short: 'K', color: '#814721', bullet: 'circle', kind: 'subway',
    osm: { relations: [444905, 8028830, 1872144, 11824439], sequences: [HANKYU_SENRI, HANKYU_KYOTO] },
    run: { ...METRO, vmax: 80, trip: { from: '天下茶屋', to: '天神橋筋六丁目', minutes: 17 } },
    service: week('05:00', '00:05', [30, 10.5, 20, 10.5, 19.5, 36], [30, 18, 20, 15, 19.5, 36]),
    patterns: [
      { from: '天下茶屋', to: '天神橋筋六丁目', share: 1 },
      { from: '天下茶屋', to: '北千里', via: ['吹田'], share: 1 },
      { from: '天下茶屋', to: '高槻市', via: ['相川'], share: 1 },
    ],
    stock: [{ stock: 'osaka-66', share: 0.55, cars: 8 }, { stock: 'osaka-hankyu', share: 0.45, cars: 8 }],
    directions: ['Northbound', 'Southbound'],
  },
  {
    id: 'N', system: 'metro', name: 'Nagahori Tsurumi-ryokuchi Line', nameLocal: '長堀鶴見緑地線', short: 'N', color: '#A9CC51', bullet: 'circle', kind: 'subway',
    osm: { relations: [444878, 8028831] },
    run: { ...METRO, trip: { from: '大正', to: '門真南', minutes: 32 } },
    service: week('05:00', '00:00', [10, 3, 6.67, 3.5, 6.67, 10], [10, 6.67, 6.67, 6.67, 7.5, 10]),
    patterns: [{ from: '大正', to: '門真南', share: 1 }],
    stock: [{ stock: 'osaka-70', cars: 4 }],
    directions: ['Eastbound', 'Westbound'],
  },
  {
    id: 'I', system: 'metro', name: 'Imazatosuji Line', nameLocal: '今里筋線', short: 'I', color: '#EE7B1A', bullet: 'circle', kind: 'subway',
    osm: { relations: [8028827, 444889] },
    run: { ...METRO, trip: { from: '井高野', to: '今里', minutes: 22 } },
    service: week('05:00', '00:00', [10, 4.5, 10, 4.5, 8, 12], [10, 6.5, 10, 6.5, 10, 12]),
    patterns: [{ from: '井高野', to: '今里', share: 1 }],
    stock: [{ stock: 'osaka-80', cars: 4 }],
    directions: ['Southbound', 'Northbound'],
  },
  {
    id: 'P', system: 'metro', name: 'Nanko Port Town Line (New Tram)', nameLocal: '南港ポートタウン線', short: 'P', color: '#00A0DE', bullet: 'circle', kind: 'agt',
    osm: { relations: [444913, 9603948] },
    run: { vmax: 55, acc: 0.8, dec: 1.0, dwell: 25, trip: { from: 'コスモスクエア', to: '住之江公園', minutes: 18 } },
    service: week('05:10', '00:00', [10, 3.5, 6, 4, 6, 10], [10, 6, 6, 6, 7, 10]),
    patterns: [{ from: 'コスモスクエア', to: '住之江公園', share: 1 }],
    stock: [...newTram, { stock: 'osaka-200-gold', share: 1, cars: 4 }],
    directions: ['Southbound', 'Northbound'],
  },
  {
    // Loop trains both ways; mornings and evenings some continue from Tennoji via Kyobashi and Osaka onto the Yumesaki Line.
    id: 'jr-o', system: 'jr', name: 'Osaka Loop Line', nameLocal: '大阪環状線', short: 'O', color: '#E80000', bullet: 'square', kind: 'rail',
    osm: { relations: [10073683, 10073682], sequences: [YUMESAKI_THROUGH] },
    run: { ...JR, trip: { from: '天王寺', to: '京橋', minutes: 15 } },
    service: week('04:50', '23:45', [10, 3.5, 15, 3.5, 7.5, 12], [10, 7.5, 15, 7.5, 10, 12]),
    groups: {
      yumesaki: {
        weekday: { first: '07:00', last: '22:00', headways: [['07:00', 15], ['12:00', 0], ['16:00', 15]] },
        saturday: { first: '08:00', last: '22:00', headways: [['08:00', 15], ['12:00', 0], ['16:00', 15]] },
      },
    },
    patterns: [
      { from: '大阪', to: '大阪', loop: true, share: 1, loopDest: { Clockwise: ['Outer Loop', '外回り'], Counterclockwise: ['Inner Loop', '内回り'] } },
      { from: '天王寺', to: '桜島', via: ['京橋'], share: 1, group: 'yumesaki', service: ['Through to the Yumesaki Line', 'ゆめ咲線直通'] },
    ],
    stock: [{ stock: 'osaka-jr-323', cars: 8 }],
  },
  {
    id: 'jr-p', system: 'jr', name: 'JR Yumesaki Line', nameLocal: 'JRゆめ咲線', short: 'P', color: '#0A318E', bullet: 'square', kind: 'rail',
    osm: { relations: [6088924, 11683620] },
    run: { ...JR, trip: { from: '西九条', to: '桜島', minutes: 8 } },
    service: week('05:10', '23:40', [15, 10, 15, 10, 15, 15], [15, 15, 15, 15, 15, 15]),
    patterns: [{ from: '西九条', to: '桜島', share: 1 }],
    stock: [{ stock: 'osaka-jr-323', cars: 8 }],
    directions: ['To Universal City', 'To Nishikujo'],
  },
  {
    // Kansai Airport Rapids, coupled to Kishuji Rapids for Wakayama, run around the west side of the loop to Kyobashi.
    id: 'jr-r', system: 'jr', name: 'Hanwa Line (Kansai Airport Rapid)', nameLocal: '阪和線（関空快速）', short: 'R', color: '#FF8E1F', bullet: 'square', kind: 'rail',
    osm: { relations: [18627480, 18630327] },
    run: { ...JR, vmax: 110, trip: { from: '京橋', to: '天王寺', minutes: 21 } },
    service: week('05:30', '23:00', [30, 15, 15, 15, 15, 30], [30, 15, 15, 15, 15, 30]),
    groups: { in: week('05:30', '23:00', [30, 15, 15, 15, 15, 30], [30, 15, 15, 15, 15, 30]) },
    patterns: [
      { from: '京橋', to: '関西空港', share: 1, oneWay: true, service: ['Kansai Airport Rapid', '関空快速'], dest: ['Kansai Airport / Wakayama', '関西空港・和歌山'] },
      { from: '関西空港', to: '京橋', share: 1, oneWay: true, group: 'in', service: ['Kansai Airport Rapid', '関空快速'] },
    ],
    stock: [{ stock: 'osaka-jr-223', cars: 8 }],
  },
];

// ---------------------------------------------------------------------------- private railways, monorail, Yamatoji Rapid

const RAIL = { vmax: 100, acc: 0.9, dec: 1.0, dwell: 25, dwellInterchange: 35 };
/** One service type as its own departure group, with the stops it makes (the terminals always count). */
const svc = (group: string, from: string, to: string, stops: string[] | null, service: [string, string], extra: Partial<PatternConfig> = {}): PatternConfig => ({
  from, to, share: 1, group, service, ...(stops ? { express: stops } : {}), ...extra,
});
/** Out-and-back one-way patterns for a service whose far terminal is not a station OSM maps on this line. */
const outBack = (group: string, near: string, far: string, farName: [string, string], stops: string[], service: [string, string], extra: Partial<PatternConfig> = {}): PatternConfig[] => [
  { from: near, to: far, share: 1, oneWay: true, group: `${group}-out`, dest: farName, express: stops, service, ...extra },
  { from: far, to: near, share: 1, oneWay: true, group: `${group}-in`, express: stops, service, ...extra },
];

const KEIHAN = [
  '淀屋橋', '北浜', '天満橋', '京橋', '野江', '関目', '森小路', '千林', '滝井', '土居', '守口市', '西三荘', '門真市', '古川橋', '大和田',
  '萱島', '寝屋川市', '香里園', '光善寺', '枚方公園', '枚方市', '御殿山', '牧野', '樟葉', '橋本', '石清水八幡宮', '淀', '中書島', '伏見桃山',
  '丹波橋', '墨染', '藤森', '龍谷大前深草', '伏見稲荷', '鳥羽街道', '東福寺', '七条', '清水五条', '祇園四条', '三条', '神宮丸太町', '出町柳',
];
const NAKANOSHIMA = ['中之島', '渡辺橋', '大江橋', 'なにわ橋', ...KEIHAN.slice(2)];
const KEIHAN_SEMI = ['淀屋橋', '北浜', '天満橋', '京橋', '守口市', ...KEIHAN.slice(KEIHAN.indexOf('萱島'))];
const HANKYU_KITASENRI = ['大阪梅田', '十三', '南方', '崇禅寺', '淡路', '下新庄', '吹田', '豊津', '関大前', '千里山', '南千里', '山田', '北千里'];
const HANSHIN_WEST = [
  '神戸三宮', '春日野道', '岩屋', '西灘', '大石', '新在家', '石屋川', '御影', '住吉', '魚崎', '青木', '深江', '芦屋', '打出', '香櫨園', '西宮', '今津',
  '久寿川', '甲子園', '鳴尾・武庫川女子大前', '武庫川', '尼崎センタープール前', '出屋敷',
];
const NARA = [
  '尼崎', '大物', '出来島', '福', '伝法', '千鳥橋', '西九条', '九条', 'ドーム前', '桜川', '大阪難波', '近鉄日本橋', '大阪上本町', '鶴橋', '布施',
  '河内永和', '河内小阪', '八戸ノ里', '若江岩田', '河内花園', '東花園', '瓢箪山', '枚岡', '額田', '石切', '生駒', '東生駒', '富雄', '学園前',
  '菖蒲池', '大和西大寺', '新大宮', '近鉄奈良',
];
const OSAKA_LTD = [
  '大阪難波', '近鉄日本橋', '大阪上本町', '鶴橋', '今里', '布施', '俊徳道', '長瀬', '弥刀', '久宝寺口', '近鉄八尾', '河内山本', '高安', '恩智', '法善寺',
  '堅下', '安堂', '河内国分', '大阪教育大前', '関屋', '二上', '近鉄下田', '五位堂', '築山', '大和高田', '松塚', '真菅', '大和八木',
];
const NANKAI_AIRPORT = [
  'なんば', '新今宮', '天下茶屋', '岸里玉出', '粉浜', '住吉大社', '住ノ江', '七道', '堺', '湊', '石津川', '諏訪ノ森', '浜寺公園', '羽衣', '高石',
  '北助松', '松ノ浜', '泉大津', '忠岡', '春木', '和泉大宮', '岸和田', '蛸地蔵', '貝塚', '二色浜', '鶴原', '井原里', '泉佐野', 'りんくうタウン', '関西空港',
];
const SEMBOKU = [
  'なんば', '今宮戎', '新今宮', '萩ノ茶屋', '天下茶屋', '岸里玉出', '帝塚山', '住吉東', '沢ノ町', '我孫子前', '浅香山', '堺東', '三国ヶ丘', '百舌鳥八幡',
  '中百舌鳥', '深井', '泉ヶ丘', '栂・美木多', '光明池', '和泉中央',
];
const YAMATOJI = [
  '天王寺', '寺田町', '桃谷', '鶴橋', '玉造', '森ノ宮', '大阪城公園', '京橋', '桜ノ宮', '天満', '大阪', '福島', '野田', '西九条', '弁天町', '大正',
  '芦原橋', '今宮', '新今宮', '天王寺', '東部市場前', '平野', '加美', '久宝寺', '八尾', '志紀', '柏原', '高井田', '河内堅上', '三郷', '王寺',
  '法隆寺', '大和小泉', '郡山', '奈良', '平城山', '木津', '加茂',
];

const privateLines: SimLineConfig[] = [
  {
    id: 'hk-kobe', system: 'hankyu', name: 'Hankyu Kobe Line', nameLocal: '阪急神戸線', short: 'HK', color: '#007AC4', bullet: 'pill', kind: 'rail',
    osm: { relations: [11966252, 11966498, 20733931, 20733932] },
    run: { ...RAIL, vmax: 115, trip: { from: '大阪梅田', to: '西宮北口', minutes: 13 } },
    service: week('05:00', '00:10', [15, 7.5, 10, 10, 10, 12], [15, 10, 10, 10, 10, 12]),
    groups: { ltd: week('05:10', '23:40', [15, 7.5, 10, 10, 10, 15], [15, 10, 10, 10, 10, 15]) },
    patterns: [
      svc('ltd', '大阪梅田', '神戸三宮', ['大阪梅田', '十三', '西宮北口', '夙川', '岡本', '神戸三宮'], ['Limited Express', '特急'], { via: ['園田'] }),
      svc('main', '大阪梅田', '神戸三宮', null, ['Local', '普通'], { via: ['園田'] }),
    ],
    stock: [{ stock: 'osaka-hankyu-1000', cars: 8 }],
    directions: ['To Kobe', 'To Osaka-Umeda'],
  },
  {
    id: 'hk-takarazuka', system: 'hankyu', name: 'Hankyu Takarazuka Line', nameLocal: '阪急宝塚線', short: 'HK', color: '#F26627', bullet: 'pill', kind: 'rail',
    osm: { relations: [11982563, 11982564] },
    run: { ...RAIL, trip: { from: '大阪梅田', to: '豊中', minutes: 12 } },
    service: week('05:00', '00:10', [15, 7.5, 10, 10, 10, 12], [15, 10, 10, 10, 10, 12]),
    groups: { exp: week('05:10', '23:40', [15, 7.5, 10, 10, 10, 15], [15, 10, 10, 10, 10, 15]) },
    patterns: [
      svc('exp', '大阪梅田', '宝塚', ['大阪梅田', '十三', '豊中', '蛍池', '石橋阪大前', '池田', '川西能勢口', '雲雀丘花屋敷', '山本', '中山観音', '売布神社', '清荒神', '宝塚'], ['Express', '急行']),
      svc('main', '大阪梅田', '雲雀丘花屋敷', null, ['Local', '普通']),
    ],
    stock: [{ stock: 'osaka-hankyu-1000', cars: 8 }],
    directions: ['To Takarazuka', 'To Osaka-Umeda'],
  },
  {
    // Locals alternate between Takatsuki-shi and the Senri Line to Kita-Senri.
    id: 'hk-kyoto', system: 'hankyu', name: 'Hankyu Kyoto Line', nameLocal: '阪急京都線', short: 'HK', color: '#2A9B50', bullet: 'pill', kind: 'rail',
    osm: { relations: [10255877, 10255878, 20712581, 20712582, 20712587, 20712588], sequences: [HANKYU_KITASENRI] },
    run: { ...RAIL, vmax: 110, trip: { from: '大阪梅田', to: '淡路', minutes: 9 } },
    service: week('05:00', '00:10', [20, 10, 20, 15, 20, 20], [20, 15, 20, 15, 20, 20]),
    groups: {
      ltd: week('05:10', '23:40', [15, 10, 10, 10, 10, 15], [15, 10, 10, 10, 10, 15]),
      semi: week('05:10', '23:40', [15, 10, 10, 10, 10, 15], [20, 15, 20, 15, 20, 20]),
    },
    patterns: [
      svc('ltd', '大阪梅田', '京都河原町', ['大阪梅田', '十三', '淡路', '茨木市', '高槻市', '長岡天神', '桂', '烏丸', '京都河原町'], ['Limited Express', '特急'], { via: ['正雀'] }),
      svc('main', '大阪梅田', '高槻市', null, ['Local', '普通'], { via: ['相川'] }),
      svc('main', '大阪梅田', '北千里', null, ['Local', '普通'], { via: ['吹田'] }),
      svc('semi', '大阪梅田', '京都河原町', ['大阪梅田', '十三', '南方', '淡路', '上新庄', '南茨木', '茨木市', '総持寺', '富田', '高槻市', '上牧', '水無瀬', '大山崎', '西山天王山', '長岡天神', '西向日', '東向日', '洛西口', '桂', '西京極', '西院', '大宮', '烏丸', '京都河原町'], ['Semi-Express', '準急'], { via: ['正雀'] }),
    ],
    stock: [{ stock: 'osaka-hankyu', cars: 8 }],
    directions: ['To Kyoto', 'To Osaka-Umeda'],
  },
  {
    // Direct limited expresses run on over the Sanyo Railway to Himeji; expresses turn at Amagasaki or Nishinomiya.
    id: 'hs-main', system: 'hanshin', name: 'Hanshin Main Line', nameLocal: '阪神本線', short: 'HS', color: '#1F64B1', bullet: 'pill', kind: 'rail',
    osm: { relations: [11658109, 11662344] },
    run: { ...RAIL, vmax: 106, acc: 1.1, dec: 1.1, trip: { from: '大阪梅田', to: '尼崎', minutes: 15 } },
    service: week('05:00', '00:10', [15, 6, 10, 10, 12, 15], [15, 10, 10, 10, 12, 15]),
    groups: {
      'ltd-out': week('05:30', '22:40', [30, 6, 10, 10, 12, 30], [30, 10, 10, 10, 12, 30]),
      'ltd-in': week('05:30', '22:40', [30, 6, 10, 10, 12, 30], [30, 10, 10, 10, 12, 30]),
      exp: week('05:30', '23:30', [30, 12, 20, 20, 24, 30], [30, 20, 20, 20, 24, 30]),
    },
    patterns: [
      svc('main', '大阪梅田', '元町', null, ['Local', '普通'], { stock: [{ stock: 'osaka-hanshin-5700', cars: 4 }] }),
      ...outBack('ltd', '大阪梅田', '元町', ['Sanyo-Himeji', '山陽姫路'], ['大阪梅田', '尼崎', '甲子園', '西宮', '芦屋', '魚崎', '御影', '神戸三宮', '元町'], ['Direct Limited Express', '直通特急']),
      svc('exp', '大阪梅田', '西宮', ['大阪梅田', '野田', '千船', '尼崎', '尼崎センタープール前', '武庫川', '甲子園', '今津', '西宮'], ['Express', '急行']),
      svc('exp', '大阪梅田', '尼崎', ['大阪梅田', '野田', '千船', '尼崎'], ['Express', '急行']),
    ],
    stock: [{ stock: 'osaka-hanshin-8000', cars: 6 }],
    directions: ['To Kobe', 'To Osaka-Umeda'],
  },
  {
    id: 'kh-main', system: 'keihan', name: 'Keihan Main Line', nameLocal: '京阪本線', short: 'KH', color: '#1D2088', bullet: 'pill', kind: 'rail',
    osm: { relations: [1921059, 6050505], sequences: [KEIHAN, NAKANOSHIMA] },
    run: { ...RAIL, vmax: 110, trip: { from: '淀屋橋', to: '枚方市', minutes: 22 } },
    service: week('05:00', '00:10', [24, 12, 24, 12, 24, 24], [24, 20, 24, 20, 24, 24]),
    groups: {
      ltd: week('05:10', '23:30', [20, 10, 12, 10, 12, 20], [20, 12, 12, 12, 12, 20]),
      rapid: week('06:00', '22:00', [24, 12, 24, 12, 24, 24], [24, 24, 24, 24, 24, 24]),
      semi: week('05:10', '23:30', [20, 12, 12, 12, 12, 20], [20, 12, 12, 12, 12, 20]),
    },
    patterns: [
      svc('ltd', '淀屋橋', '出町柳', ['淀屋橋', '北浜', '天満橋', '京橋', '枚方市', '樟葉', '中書島', '丹波橋', '七条', '清水五条', '祇園四条', '三条', '神宮丸太町', '出町柳'], ['Limited Express', '特急'], { stock: [{ stock: 'osaka-keihan-8000', share: 0.6, cars: 8 }, { stock: 'osaka-keihan-3000', share: 0.4, cars: 8 }] }),
      svc('main', '中之島', '萱島', null, ['Local', '普通']),
      svc('main', '中之島', '出町柳', null, ['Local', '普通']),
      svc('rapid', '淀屋橋', '枚方市', ['淀屋橋', '北浜', '天満橋', '京橋', '守口市', '寝屋川市', '香里園', '枚方市'], ['Rapid Express', '快速急行'], { stock: [{ stock: 'osaka-keihan-3000', cars: 8 }] }),
      svc('semi', '淀屋橋', '出町柳', KEIHAN_SEMI, ['Sub-Express', '準急']),
    ],
    stock: [{ stock: 'osaka-keihan-13000', cars: 7 }],
    directions: ['To Kyoto', 'To Osaka'],
  },
  {
    // rapi:t α/β and the Southern alternate every 15 minutes; airport expresses and locals every 15 minutes each.
    id: 'nk-main', system: 'nankai', name: 'Nankai Main Line', nameLocal: '南海本線', short: 'NK', color: '#0077CE', bullet: 'pill', kind: 'rail',
    osm: { relations: [11930463, 11930462, 18673506, 18673505, 10386551, 8334804, 18668904, 18668905, 18696135], sequences: [NANKAI_AIRPORT] },
    run: { ...RAIL, vmax: 110 },
    service: week('05:00', '00:10', [15, 7.5, 15, 10, 12, 20], [15, 12, 15, 12, 15, 20]),
    groups: {
      ltd: week('06:00', '23:00', [30, 30, 30, 30, 30, 30], [30, 30, 30, 30, 30, 30]),
      airport: week('05:10', '23:30', [20, 10, 15, 10, 15, 20], [20, 15, 15, 15, 15, 20]),
    },
    patterns: [
      svc('main', 'なんば', '和歌山市', null, ['Local', '普通'], { via: ['粉浜'] }),
      svc('ltd', 'なんば', '関西空港', ['なんば', '新今宮', '天下茶屋', '泉佐野', 'りんくうタウン', '関西空港'], ['Limited Express rapi:t α', '特急ラピートα'], { via: ['粉浜'], share: 0.5, stock: [{ stock: 'osaka-nankai-50000', cars: 6 }] }),
      svc('ltd', 'なんば', '関西空港', ['なんば', '新今宮', '天下茶屋', '堺', '岸和田', '泉佐野', 'りんくうタウン', '関西空港'], ['Limited Express rapi:t β', '特急ラピートβ'], { via: ['粉浜'], share: 0.5, stock: [{ stock: 'osaka-nankai-50000', cars: 6 }] }),
      svc('ltd', 'なんば', '和歌山市', ['なんば', '新今宮', '天下茶屋', '堺', '岸和田', '泉佐野', '尾崎', 'みさき公園', '和歌山大学前', '紀ノ川', '和歌山市'], ['Limited Express Southern', '特急サザン'], { via: ['粉浜'], stock: [{ stock: 'osaka-nankai-12000', cars: 8 }] }),
      svc('airport', 'なんば', '関西空港', ['なんば', '新今宮', '天下茶屋', '堺', '羽衣', '泉大津', '春木', '岸和田', '貝塚', '泉佐野', 'りんくうタウン', '関西空港'], ['Airport Express', '空港急行'], { via: ['粉浜'] }),
    ],
    stock: [{ stock: 'osaka-nankai-8300', cars: 6 }],
    directions: ['To Wakayama', 'To Namba'],
  },
  {
    id: 'nk-koya', system: 'nankai', name: 'Nankai Koya Line', nameLocal: '南海高野線', short: 'NK', color: '#11823C', bullet: 'pill', kind: 'rail',
    osm: { relations: [11940316, 11940651], sequences: [SEMBOKU] },
    run: { ...RAIL, trip: { from: 'なんば', to: '堺東', minutes: 13 } },
    service: week('05:00', '00:10', [20, 10, 15, 12, 15, 20], [20, 15, 15, 15, 15, 20]),
    groups: {
      exp: week('05:10', '23:30', [30, 10, 30, 12, 20, 30], [30, 15, 30, 15, 20, 30]),
      kukyu: week('06:00', '22:00', [30, 20, 30, 20, 30, 30], [30, 30, 30, 30, 30, 30]),
      semboku: week('05:10', '23:30', [30, 10, 30, 12, 20, 30], [30, 15, 30, 15, 20, 30]),
    },
    patterns: [
      svc('exp', 'なんば', '橋本', ['なんば', '新今宮', '天下茶屋', '堺東', '北野田', '金剛', '河内長野', '三日市町', '美加の台', '千早口', '天見', '紀見峠', '林間田園都市', '御幸辻', '橋本'], ['Express', '急行']),
      svc('main', 'なんば', '北野田', null, ['Local', '各停']),
      svc('main', 'なんば', '金剛', null, ['Local', '各停']),
      svc('kukyu', 'なんば', '河内長野', ['なんば', '新今宮', '天下茶屋', '堺東', '北野田', '狭山', '大阪狭山市', '金剛', '滝谷', '千代田', '河内長野'], ['Sub-Express', '区間急行']),
      // Semboku Line through trains to Izumi-Chuo: sub-expresses skip to Fukai, semi-expresses stop everywhere past Sakaihigashi.
      svc('semboku', 'なんば', '和泉中央', ['なんば', '新今宮', '天下茶屋', '堺東', '深井', '泉ヶ丘', '栂・美木多', '光明池', '和泉中央'], ['Sub-Express', '区間急行'], { share: 2 }),
      svc('semboku', 'なんば', '和泉中央', ['なんば', '新今宮', '天下茶屋', '堺東', '三国ヶ丘', '百舌鳥八幡', '中百舌鳥', '深井', '泉ヶ丘', '栂・美木多', '光明池', '和泉中央'], ['Semi-Express', '準急']),
    ],
    stock: [{ stock: 'osaka-nankai-8300', share: 0.5, cars: 8 }, { stock: 'osaka-nankai-6200', share: 0.5, cars: 6 }],
    directions: ['To Koyasan', 'To Namba'],
  },
  {
    // Rapid expresses run through from Kobe-Sannomiya over the Hanshin Namba Line; locals from Amagasaki.
    id: 'kt-nara', system: 'kintetsu', name: 'Kintetsu Nara Line', nameLocal: '近鉄奈良線', short: 'A', color: '#D21644', bullet: 'pill', kind: 'rail',
    osm: { relations: [11923501, 11955750, 11955751, 11958105, 11958106, 18665644, 18665645], sequences: [[...HANSHIN_WEST, ...NARA]] },
    run: { ...RAIL, trip: { from: '大阪難波', to: '布施', minutes: 10 } },
    service: week('05:00', '00:10', [30, 10, 20, 15, 20, 30], [30, 15, 20, 15, 20, 30]),
    groups: {
      rapid: week('05:30', '23:00', [30, 12, 20, 20, 30, 30], [30, 20, 20, 20, 30, 30]),
      exp: week('05:10', '23:40', [30, 10, 20, 15, 20, 30], [30, 20, 20, 20, 20, 30]),
      semi: week('05:10', '23:30', [30, 10, 20, 15, 20, 30], [30, 20, 20, 20, 20, 30]),
      ltd: week('06:30', '22:00', [60, 30, 30, 30, 30, 60], [60, 30, 30, 30, 30, 60]),
    },
    patterns: [
      svc('exp', '大阪難波', '近鉄奈良', ['大阪難波', '近鉄日本橋', '大阪上本町', '鶴橋', '布施', '石切', '生駒', '学園前', '大和西大寺', '新大宮', '近鉄奈良'], ['Express', '急行'], { via: ['河内永和'] }),
      svc('main', '尼崎', '東花園', null, ['Local', '普通']),
      svc('main', '大阪難波', '大和西大寺', null, ['Local', '普通'], { via: ['河内永和'] }),
      svc('rapid', '神戸三宮', '近鉄奈良', ['神戸三宮', '魚崎', '芦屋', '西宮', '今津', '甲子園', '武庫川', '尼崎', '西九条', '九条', 'ドーム前', '桜川', '大阪難波', '近鉄日本橋', '大阪上本町', '鶴橋', '生駒', '学園前', '大和西大寺', '新大宮', '近鉄奈良'], ['Rapid Express', '快速急行'], { via: ['河内永和'], stock: [{ stock: 'osaka-hanshin-1000', share: 0.5, cars: 6 }, { stock: 'osaka-kintetsu-21', share: 0.5, cars: 6 }] }),
      svc('semi', '尼崎', '大和西大寺', [...NARA.slice(0, NARA.indexOf('布施') + 1), '河内小阪', ...NARA.slice(NARA.indexOf('東花園'), NARA.indexOf('大和西大寺') + 1)], ['Sub-Semi-Express', '区間準急'], { via: ['河内永和'] }),
      svc('ltd', '大阪難波', '近鉄奈良', ['大阪難波', '近鉄日本橋', '大阪上本町', '鶴橋', '生駒', '学園前', '大和西大寺', '近鉄奈良'], ['Limited Express', '特急'], { via: ['河内永和'], stock: [{ stock: 'osaka-kintetsu-22600', cars: 4 }] }),
    ],
    stock: [{ stock: 'osaka-kintetsu-8000', share: 0.6, cars: 6 }, { stock: 'osaka-kintetsu-21', share: 0.4, cars: 6 }],
    directions: ['To Nara', 'To Osaka'],
  },
  {
    id: 'kt-osaka', system: 'kintetsu', name: 'Kintetsu Osaka Line', nameLocal: '近鉄大阪線', short: 'D', color: '#4694D1', bullet: 'pill', kind: 'rail',
    osm: { relations: [11601510, 11962196], sequences: [OSAKA_LTD] },
    run: { ...RAIL, trip: { from: '大阪上本町', to: '河内山本', minutes: 14 } },
    service: week('05:00', '00:10', [30, 10, 15, 12, 15, 30], [30, 15, 15, 15, 15, 30]),
    groups: {
      semi: week('05:10', '23:40', [30, 10, 15, 12, 15, 30], [30, 15, 15, 15, 15, 30]),
      'ltd-out': week('06:30', '21:30', [60, 20, 20, 20, 30, 60], [60, 20, 20, 20, 30, 60]),
      'ltd-in': week('06:30', '21:30', [60, 20, 20, 20, 30, 60], [60, 20, 20, 20, 30, 60]),
    },
    patterns: [
      svc('semi', '大阪上本町', '名張', ['大阪上本町', '鶴橋', '布施', '河内山本', '高安', '恩智', '法善寺', '堅下', '安堂', '河内国分', '大阪教育大前', '関屋', '二上', '近鉄下田', '五位堂', '築山', '大和高田', '松塚', '真菅', '大和八木', '名張'], ['Sub-Express', '区間急行']),
      svc('main', '大阪上本町', '大和朝倉', null, ['Local', '普通']),
      // Two Hinotori to Nagoya and one limited express to Kashikojima an hour, from Osaka-Namba.
      ...outBack('ltd', '大阪難波', '大和八木', ['Kintetsu-Nagoya', '近鉄名古屋'], ['大阪難波', '近鉄日本橋', '大阪上本町', '鶴橋', '大和八木'], ['Limited Express Hinotori', '特急ひのとり'], { stock: [{ stock: 'osaka-kintetsu-80000', cars: 6 }] }),
    ],
    stock: [{ stock: 'osaka-kintetsu-8000', share: 0.6, cars: 4 }, { stock: 'osaka-kintetsu-21', share: 0.4, cars: 4 }],
    directions: ['Eastbound', 'Westbound'],
  },
  {
    id: 'om', system: 'monorail', name: 'Osaka Monorail Main Line', nameLocal: '大阪モノレール本線', short: 'MO', color: '#111986', bullet: 'circle', kind: 'monorail',
    osm: { relations: [9090015, 6011645] },
    run: { vmax: 75, acc: 0.9, dec: 1.0, dwell: 30, trip: { from: '大阪空港', to: '門真市', minutes: 36 } },
    service: week('06:00', '23:40', [15, 7.5, 10, 10, 10, 15], [15, 10, 12, 12, 12, 15]),
    patterns: [{ from: '大阪空港', to: '門真市', share: 1 }],
    stock: [{ stock: 'osaka-monorail-3000', share: 0.5, cars: 4 }, { stock: 'osaka-monorail-1000', share: 0.5, cars: 4 }],
    directions: ['To Kadomashi', 'To Osaka Airport'],
  },
  {
    // From Tennoji's Loop platforms round via Kyobashi and Osaka, then fast down the west side and out to Nara;
    // back the same way, ending at Tennoji after a full circuit.
    id: 'jr-q', system: 'jr', name: 'Yamatoji Line (Yamatoji Rapid)', nameLocal: '大和路線（大和路快速）', short: 'Q', color: '#00A569', bullet: 'square', kind: 'rail',
    osm: { relations: [10073683, 10073682, 11810048, 11808601], sequences: [YAMATOJI] },
    run: { ...JR, vmax: 110 },
    service: week('07:00', '21:30', [15, 15, 15, 15, 15, 30], [15, 15, 15, 15, 15, 30]),
    groups: { in: week('06:30', '21:00', [15, 15, 15, 15, 15, 30], [15, 15, 15, 15, 15, 30]) },
    patterns: [
      { from: '天王寺', to: '加茂', via: ['京橋'], oneWay: true, share: 1, service: ['Yamatoji Rapid', '大和路快速'], express: YAMATOJI.filter((n) => !['野田', '芦原橋', '今宮', '東部市場前', '平野', '加美', '八尾', '志紀', '柏原', '高井田', '河内堅上', '三郷'].includes(n)) },
      { from: '加茂', to: '天王寺', via: ['京橋'], oneWay: true, share: 1, group: 'in', service: ['Yamatoji Rapid', '大和路快速'], express: YAMATOJI.filter((n) => !['野田', '芦原橋', '今宮', '東部市場前', '平野', '加美', '八尾', '志紀', '柏原', '高井田', '河内堅上', '三郷'].includes(n)) },
    ],
    stock: [{ stock: 'osaka-jr-221', cars: 8 }],
  },
];

await buildSimCity({
  city: 'osaka',
  systems: [
    { id: 'metro', name: 'Osaka Metro' },
    { id: 'jr', name: 'JR West' },
    { id: 'hankyu', name: 'Hankyu' },
    { id: 'hanshin', name: 'Hanshin' },
    { id: 'keihan', name: 'Keihan' },
    { id: 'nankai', name: 'Nankai' },
    { id: 'kintetsu', name: 'Kintetsu' },
    { id: 'monorail', name: 'Osaka Monorail' },
  ],
  lines: [...lines, ...privateLines],
  // Station names out to the private railways' far terminals (Kyoto, Nara, Kobe, Wakayama, Koyasan side).
  queryBbox: [135.1, 34.2, 135.95, 35.1],
  names: { local: ['name'], en: ['name:en'] },
  // Display names as the operators spell them (OSM has macrons and a few typos).
  stations: {
    // The two monorail relations use the station's old and new names.
    merge: [['柴原阪大前', '柴原']],
    rename: {
      '柴原阪大前': ['Shibahara-handaimae', '柴原阪大前'],
      '千里中央': ['Senri-Chuo', '千里中央'],
      '万博記念公園': ['Banpaku-kinen-koen', '万博記念公園'],
      '清荒神': ['Kiyoshikojin', '清荒神'],
      '新今宮': ['Shin-Imamiya', '新今宮'],
      '堺市': ['Sakaishi', '堺市'],
      '天神橋筋六丁目': ['Tenjimbashisuji 6-chome', '天神橋筋六丁目'],
      '九条': ['Kujo', '九条'],
      '大阪港': ['Osakako', '大阪港'],
      '大阪城公園': ['Osakajokoen', '大阪城公園'],
      '緑地公園': ['Ryokuchi-koen', '緑地公園'],
      '安堂': ['Ando', '安堂'],
      '伝法': ['Dempo', '伝法'],
      '法善寺': ['Hozenji', '法善寺'],
      '瓢箪山': ['Hyotanyama', '瓢箪山'],
      '久宝寺口': ['Kyuhojiguchi', '久宝寺口'],
      '大阪難波': ['Osaka-Namba', '大阪難波'],
      '大阪上本町': ['Osaka-Uehommachi', '大阪上本町'],
      '大阪教育大前': ['Osaka-Kyoikudai-mae', '大阪教育大前'],
      '沢ノ町': ['Sawanocho', '沢ノ町'],
      '庄内': ['Shonai', '庄内'],
      '東部市場前': ['Tobushijo-mae', '東部市場前'],
      '高安': ['Takayasu', '高安'],
      '今宮戎': ['Imamiya-Ebisu', '今宮戎'],
    },
  },
  // National holidays run the weekend service (Osaka Metro and JR use one Saturday/holiday timetable).
  calendar: {
    holidays: [
      '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-12', '2026-02-11', '2026-02-23', '2026-03-20', '2026-04-29',
      '2026-05-04', '2026-05-05', '2026-05-06', '2026-07-20', '2026-08-11', '2026-09-21', '2026-09-22', '2026-09-23',
      '2026-10-12', '2026-11-03', '2026-11-23', '2026-12-30', '2026-12-31',
      '2027-01-01', '2027-01-02', '2027-01-03', '2027-01-11', '2027-02-11', '2027-02-23', '2027-03-21', '2027-03-22',
      '2027-04-29', '2027-05-03', '2027-05-04', '2027-05-05', '2027-07-19', '2027-08-11', '2027-09-20', '2027-09-23',
      '2027-10-11', '2027-11-03', '2027-11-23', '2027-12-30', '2027-12-31',
    ],
  },
  attribution: ['Service: Osaka Metro, JR West, Hankyu, Hanshin, Keihan, Nankai, Kintetsu and Osaka Monorail published intervals (simulated)'],
});

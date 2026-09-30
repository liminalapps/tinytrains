// Bangkok: BTS Skytrain (Sukhumvit, Silom, Gold), MRT (Blue, Purple, Yellow and Pink monorails), the Airport Rail Link
// and the SRT Red Lines, with the sim kit (docs/KIT_SIM.md). The Office of Transport and Traffic Policy and Planning
// (OTP) publishes a national GTFS feed (namtang-api.otp.go.th, CC BY 4.0), but its rail part is frequency-based and
// fragmentary: the Blue Line is split at Tao Poon and repeated in overlapping pieces, and Sukhumvit peak service is
// cut into three sections. So the network comes from OSM route relations and the headways below are that feed's
// frequencies.txt bands per line and day type, simplified. No operator publishes open realtime.
// Usage: ./node_modules/.bin/tsx scripts/build-bangkok.ts [--refresh]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TransitData } from '../shared/types.ts';
import { buildSimCity, type DayServices, type SimLineConfig } from './lib/osm-network/index.ts';

// Thai public holidays (Buddhist dates from the lunar calendar, substitution days included) run the Sunday service.
const HOLIDAYS = [
  '2026-01-01', '2026-01-02', '2026-03-03', '2026-04-06', '2026-04-13', '2026-04-14', '2026-04-15', '2026-05-01',
  '2026-05-04', '2026-06-01', '2026-06-03', '2026-07-28', '2026-07-29', '2026-07-30', '2026-08-12', '2026-10-13',
  '2026-10-23', '2026-12-07', '2026-12-10', '2026-12-31',
  '2027-01-01', '2027-02-22', '2027-04-06', '2027-04-13', '2027-04-14', '2027-04-15', '2027-05-03', '2027-05-04',
  '2027-05-20', '2027-06-03', '2027-07-19', '2027-07-20', '2027-07-28', '2027-08-12', '2027-10-13', '2027-10-25',
  '2027-12-06', '2027-12-10', '2027-12-31',
];

const BTS_RUN = { vmax: 80, acc: 1.0, dec: 1.0, dwell: 30, dwellInterchange: 40 };
const MRT_RUN = { vmax: 80, acc: 1.0, dec: 1.0, dwell: 30, dwellInterchange: 40 };
const MONO_RUN = { vmax: 80, acc: 1.0, dec: 1.0, dwell: 30, dwellInterchange: 35 };
const daily = (first: string, last: string, headways: [string, number][]): DayServices => ({ weekday: { first, last, headways } });

const SUKHUMVIT = [
  'Khu Khot', 'Yaek Kor Por Aor', 'Royal Thai Air Force Museum', 'Bhumibol Adulyadej Hospital', 'Saphan Mai', 'Sai Yud',
  'Phahonyothin 59', 'Wat Phra Sri Mahathat', '11th Infantry Regiment', 'Bang Bua', 'Royal Forest Department',
  'Kasetsart University', 'Sena Nikhom', 'Ratchayothin', 'Phahonyothin 24', 'Ha Yaek Lat Phrao', 'Mo Chit', 'Saphan Khwai',
  'Ari', 'Sanam Pao', 'Victory Monument', 'Phaya Thai', 'Ratchathewi', 'Siam', 'Chit Lom', 'Phloen Chit', 'Nana', 'Asok',
  'Phrom Phong', 'Thong Lo', 'Ekkamai', 'Phra Khanong', 'On Nut', 'Bang Chak', 'Punnawithi', 'Udom Suk', 'Bang Na', 'Bearing',
  'Samrong', 'Pu Chao', 'Chang Erawan', 'Royal Thai Naval Academy', 'Pak Nam', 'Srinagarindra', 'Phraek Sa', 'Sai Luat', 'Kheha',
];

const lines: SimLineConfig[] = [
  {
    // Weekdays: through trains Kheha–Khu Khot all day, and in the peaks extra trains between Mo Chit and Samrong.
    id: 'sukhumvit', system: 'bts', name: 'Sukhumvit Line', nameLocal: 'สายสุขุมวิท', short: 'SUK',
    color: '#65B724', bullet: 'pill', kind: 'metro',
    // The relations include Sena Ruam, an infill station still under construction, and one misses Mo Chit: the
    // sequence is given here, `via: Mo Chit` keeps the relations' own stop lists out of the patterns, and `express`
    // lists the open stations so trains pass Sena Ruam.
    osm: {
      relations: [444651, 7989376],
      sequences: [SUKHUMVIT],
    },
    run: { ...BTS_RUN, trip: { from: 'Khu Khot', to: 'Kheha', minutes: 104 } },
    service: {
      weekday: { first: '06:00', last: '23:50', headways: [['06:00', 5], ['09:30', 7], ['16:00', 5], ['21:00', 6], ['22:00', 8]] },
      sunday: { first: '06:00', last: '23:50', headways: [['06:00', 7], ['08:00', 6], ['11:00', 5], ['21:00', 7], ['22:00', 8]] },
    },
    groups: {
      peak: {
        weekday: { first: '07:00', last: '19:55', headways: [['07:00', 5], ['09:00', 0], ['16:30', 5], ['20:00', 0]] },
        sunday: null,
      },
    },
    patterns: [
      { from: 'Khu Khot', to: 'Kheha', via: ['Mo Chit'], express: SUKHUMVIT, share: 1 },
      { from: 'Mo Chit', to: 'Samrong', express: SUKHUMVIT, share: 1, group: 'peak' },
    ],
    stock: [
      { stock: 'bangkok-bts-a1', cars: 4, share: 3 },
      { stock: 'bangkok-bts-a2', cars: 4, share: 2 },
      { stock: 'bangkok-bts-b3', cars: 4, share: 2 },
    ],
    directions: ['To Kheha', 'To Khu Khot'],
  },
  {
    id: 'silom', system: 'bts', name: 'Silom Line', nameLocal: 'สายสีลม', short: 'SIL',
    color: '#02817D', bullet: 'pill', kind: 'metro',
    // OSM's main Silom relations list only three stops: the sequence is given here, and the track comes from the
    // supplementary Krung Thon Buri–Bang Wa relations and the other rail ways in the bbox.
    osm: {
      relations: [19407241, 19407242],
      sequences: [[
        'National Stadium', 'Siam', 'Ratchadamri', 'Sala Daeng', 'Chong Nonsi', 'Saint Louis', 'Surasak', 'Saphan Taksin',
        'Krung Thon Buri', 'Wongwian Yai', 'Pho Nimit', 'Talat Phlu', 'Wutthakat', 'Bang Wa',
      ]],
    },
    run: { ...BTS_RUN, trip: { from: 'National Stadium', to: 'Bang Wa', minutes: 30 } },
    service: {
      weekday: { first: '06:00', last: '23:50', headways: [['06:00', 6], ['07:00', 3.5], ['09:00', 6], ['17:00', 3.5], ['20:00', 6], ['22:00', 8]] },
      sunday: { first: '06:00', last: '23:50', headways: [['06:00', 7], ['09:00', 5.5], ['21:00', 7], ['22:00', 8]] },
    },
    patterns: [{ from: 'National Stadium', to: 'Bang Wa', share: 1 }],
    stock: [
      { stock: 'bangkok-bts-b1', cars: 4, share: 2 },
      { stock: 'bangkok-bts-a1', cars: 4, share: 1 },
    ],
    directions: ['To Bang Wa', 'To National Stadium'],
  },
  {
    id: 'gold', system: 'bts', name: 'Gold Line', nameLocal: 'สายสีทอง', short: 'G',
    color: '#D4AF37', textColor: '#1A1A1A', bullet: 'pill', kind: 'agt', osm: { relations: [11681439, 11681440] },
    run: { vmax: 50, acc: 0.9, dec: 1.0, dwell: 30, trip: { from: 'Krung Thon Buri', to: 'Khlong San', minutes: 6 } },
    service: {
      weekday: { first: '06:00', last: '23:50', headways: [['06:00', 8], ['07:00', 6], ['09:00', 8], ['17:00', 6], ['20:00', 8], ['22:00', 12]] },
      sunday: { first: '06:00', last: '23:50', headways: [['06:00', 8], ['12:00', 6], ['20:00', 8], ['22:00', 12]] },
    },
    patterns: [{ from: 'Krung Thon Buri', to: 'Khlong San', share: 1 }],
    stock: [{ stock: 'bangkok-gold-apm', cars: 2 }],
    directions: ['To Khlong San', 'To Krung Thon Buri'],
  },
  {
    // One run covers the whole line: Lak Song → Tha Phra → Hua Lamphong → Tao Poon → Bang Pho → back to Tha Phra.
    id: 'blue', system: 'mrt', name: 'Blue Line', nameLocal: 'สายสีน้ำเงิน', short: 'BL',
    color: '#1964B7', bullet: 'circle', kind: 'metro', // The Lak Song → Tha Phra relation misses eight stops; the full one runs the other way, reversed here.
    osm: {
      relations: [444659],
      sequences: [[
        'Tha Phra', 'Charan 13', 'Fai Chai', 'Bang Khun Non', 'Bang Yi Khan', 'Sirindhorn', 'Bang Phlat', 'Bang O', 'Bang Pho',
        'Tao Poon', 'Bang Sue', 'Kamphaeng Phet', 'Chatuchak Park', 'Phahon Yothin', 'Lat Phrao', 'Ratchadaphisek', 'Sutthisan',
        'Huai Khwang', 'Thailand Cultural Centre', 'Phra Ram 9', 'Phetchaburi', 'Sukhumvit', 'Queen Sirikit National Convention Centre',
        'Khlong Toei', 'Lumphini', 'Si Lom', 'Sam Yan', 'Hua Lamphong', 'Wat Mangkon', 'Sam Yot', 'Sanam Chai', 'Itsaraphap',
        'Tha Phra', 'Bang Phai', 'Bang Wa', 'Phetkasem 48', 'Phasi Charoen', 'Bang Khae', 'Lak Song',
      ]],
    },
    run: { ...MRT_RUN, trip: { from: 'Lak Song', to: 'Tao Poon', minutes: 72 } },
    service: {
      weekday: {
        first: '05:30', last: '23:50',
        headways: [['05:30', 5], ['07:00', 7], ['09:00', 6.5], ['16:00', 5.5], ['17:00', 4], ['20:00', 5.5], ['21:00', 6.5], ['22:00', 7.5], ['23:00', 8.5]],
      },
      saturday: { first: '06:00', last: '23:50', headways: [['06:00', 8], ['16:00', 6.5], ['20:00', 8]] },
      sunday: { first: '06:00', last: '23:50', headways: [['06:00', 8]] },
    },
    patterns: [{ from: 'Lak Song', to: 'Tha Phra', via: ['Hua Lamphong', 'Bang Pho'], share: 1 }],
    stock: [
      { stock: 'bangkok-mrt-siemens', cars: 3, share: 1 },
      { stock: 'bangkok-mrt-inspiro', cars: 3, share: 2 },
    ],
    directions: ['Via Hua Lamphong', 'Via Bang Pho'],
  },
  {
    id: 'purple', system: 'mrt', name: 'Purple Line', nameLocal: 'สายสีม่วง', short: 'PP',
    color: '#660066', bullet: 'circle', kind: 'metro', osm: { relations: [6988563, 7725057] },
    run: { ...MRT_RUN, trip: { from: 'Khlong Bang Phai', to: 'Tao Poon', minutes: 37 } },
    service: {
      weekday: {
        first: '05:30', last: '23:50',
        headways: [['05:30', 6], ['06:00', 5.5], ['07:00', 5], ['09:00', 6.5], ['10:00', 8.5], ['17:00', 4.6], ['20:00', 6], ['21:00', 8.5], ['22:00', 10], ['23:00', 12]],
      },
      sunday: { first: '06:00', last: '23:50', headways: [['06:00', 9], ['22:00', 10], ['23:00', 12]] },
    },
    patterns: [{ from: 'Khlong Bang Phai', to: 'Tao Poon', share: 1 }],
    stock: [{ stock: 'bangkok-mrt-sustina', cars: 3 }],
    directions: ['To Tao Poon', 'To Khlong Bang Phai'],
  },
  {
    id: 'yellow', system: 'mrt', name: 'Yellow Line', nameLocal: 'สายสีเหลือง', short: 'YL',
    color: '#F4DA01', textColor: '#1A1A1A', bullet: 'circle', kind: 'monorail',
    // OSM's relations skip Hua Mak, Suan Luang Rama IX and Si Udom. Hua Mak is pinned to the monorail station: the
    // Airport Rail Link's stop of that name is 450 m away.
    osm: {
      relations: [15806897, 15806898],
      sequences: [[
        'Lat Phrao', 'Phawana', 'Chok Chai 4', 'Lat Phrao 71', 'Lat Phrao 83', 'Mahatthai', 'Lat Phrao 101', 'Bang Kapi',
        'Yaek Lam Sali', 'Si Kritha', 'Hua Mak@YL11', 'Kalantan', 'Si Nut', 'Srinagarindra 38', 'Suan Luang Rama IX', 'Si Udom', 'Si Iam',
        'Si La Salle', 'Si Bearing', 'Si Dan', 'Si Thepha', 'Thipphawan', 'Samrong',
      ]],
    },
    run: { ...MONO_RUN, trip: { from: 'Lat Phrao', to: 'Samrong', minutes: 48 } },
    service: daily('06:00', '23:50', [['06:00', 10], ['07:00', 5], ['09:00', 10], ['17:00', 5], ['20:00', 10]]),
    patterns: [{ from: 'Lat Phrao', to: 'Samrong', via: ['Suan Luang Rama IX'], share: 1 }],
    stock: [{ stock: 'bangkok-innovia-yellow', cars: 4 }],
    directions: ['To Samrong', 'To Lat Phrao'],
  },
  {
    id: 'pink', system: 'mrt', name: 'Pink Line', nameLocal: 'สายสีชมพู', short: 'PK',
    color: '#CD4692', bullet: 'circle', kind: 'monorail', osm: { relations: [16740886, 16740887, 19149752, 19150155] },
    run: { ...MONO_RUN, trip: { from: 'Nonthaburi Civic Center', to: 'Min Buri', minutes: 53 } },
    service: daily('06:00', '23:50', [['06:00', 10], ['06:30', 5], ['08:30', 10], ['16:30', 5], ['19:30', 10]]),
    groups: {
      // The branch to IMPACT Muang Thong Thani.
      mtt: {
        weekday: { first: '06:00', last: '23:50', headways: [['06:00', 10], ['07:00', 5], ['08:00', 10], ['17:00', 5], ['18:00', 10]] },
        sunday: { first: '06:00', last: '23:50', headways: [['06:00', 10]] },
      },
    },
    patterns: [
      { from: 'Nonthaburi Civic Center', to: 'Min Buri', share: 1 },
      { from: 'Muang Thong Thani', to: 'Lake Muang Thong Thani', share: 1, group: 'mtt' },
    ],
    stock: [{ stock: 'bangkok-innovia-pink', cars: 4 }],
    directions: ['To Min Buri', 'To Nonthaburi'],
  },
  {
    id: 'arl', system: 'arl', name: 'Airport Rail Link', nameLocal: 'แอร์พอร์ต เรล ลิงก์', short: 'ARL',
    color: '#891C2C', bullet: 'pill', kind: 'rail', osm: { relations: [2148241, 9921500] },
    run: { vmax: 160, acc: 0.8, dec: 0.9, dwell: 40, trip: { from: 'Phaya Thai', to: 'Suvarnabhumi', minutes: 27 } },
    service: {
      weekday: { first: '05:30', last: '23:45', headways: [['05:30', 15], ['06:30', 10], ['09:30', 12], ['16:30', 10], ['20:30', 12], ['21:30', 15]] },
      sunday: { first: '05:30', last: '23:45', headways: [['05:30', 15], ['06:30', 12], ['21:30', 15]] },
    },
    patterns: [{ from: 'Phaya Thai', to: 'Suvarnabhumi', share: 1 }],
    stock: [{ stock: 'bangkok-arl-desiro', cars: 4 }],
    directions: ['To Suvarnabhumi', 'To Phaya Thai'],
  },
  {
    id: 'darkred', system: 'srt', name: 'Dark Red Line', nameLocal: 'สายสีแดงเข้ม', short: 'RN',
    color: '#E10506', bullet: 'pill', kind: 'rail', // The Rangsit-bound relation misses Lak Hok; the other one is complete, and both directions run over its stops.
    osm: {
      relations: [13058390],
      sequences: [[
        'Krung Thep Aphiwat', 'Chatuchak', 'Wat Samian Nari', 'Bang Khen', 'Thung Song Hong', 'Lak Si', 'Kan Kheha', 'Don Muang',
        'Lak Hok', 'Rangsit',
      ]],
    },
    run: { vmax: 120, acc: 0.8, dec: 0.9, dwell: 40, trip: { from: 'Krung Thep Aphiwat', to: 'Rangsit', minutes: 28 } },
    service: daily('05:00', '23:45', [['05:00', 15], ['07:00', 10], ['09:30', 15], ['17:00', 10], ['19:30', 15]]),
    patterns: [{ from: 'Krung Thep Aphiwat', to: 'Rangsit', share: 1 }],
    stock: [{ stock: 'bangkok-at100', cars: 6 }],
    directions: ['To Rangsit', 'To Krung Thep Aphiwat'],
  },
  {
    id: 'lightred', system: 'srt', name: 'Light Red Line', nameLocal: 'สายสีแดงอ่อน', short: 'RW',
    color: '#FD5353', bullet: 'pill', kind: 'rail', osm: { relations: [13178788, 14071495], sequences: [['Krung Thep Aphiwat', 'Bang Son', 'Bang Bamru', 'Taling Chan']] },
    run: { vmax: 120, acc: 0.8, dec: 0.9, dwell: 40, trip: { from: 'Krung Thep Aphiwat', to: 'Taling Chan', minutes: 18 } },
    service: daily('05:30', '23:30', [['05:30', 30], ['07:00', 20], ['10:30', 30], ['17:00', 20], ['20:30', 30]]),
    patterns: [{ from: 'Krung Thep Aphiwat', to: 'Taling Chan', share: 1 }],
    stock: [{ stock: 'bangkok-at100', cars: 4 }],
    directions: ['To Taling Chan', 'To Krung Thep Aphiwat'],
  },
];

await buildSimCity({
  city: 'bangkok',
  systems: [
    { id: 'bts', name: 'BTS Skytrain' },
    { id: 'mrt', name: 'MRT' },
    { id: 'arl', name: 'Airport Rail Link' },
    { id: 'srt', name: 'SRT Red Lines' },
  ],
  lines,
  calendar: { holidays: HOLIDAYS },
  names: { local: ['name:th', 'name'], en: ['name:en', 'name'] },
  stations: {
    // One Sukhumvit relation names 11th Infantry Regiment with a 'station' prefix.
    merge: [['กรมทหารราบที่ 11', 'สถานีกรมทหารราบที่ 11']],
    rename: { Ekkamai: ['Ekkamai', 'เอกมัย'] },
  },
  attribution: [
    'Headways: Office of Transport and Traffic Policy and Planning (OTP) GTFS, CC BY 4.0',
  ],
});

// Sena Ruam is still being built: trains pass it, so drop the station and its two segments from the map (the
// Saphan Khwai–Ari segment the trains use is there already).
const file = join(import.meta.dirname, '../public/data/bangkok/transit.json');
const transit = JSON.parse(readFileSync(file, 'utf8')) as TransitData;
transit.stations = transit.stations.filter((s) => s.id !== 'sena-ruam');
transit.segments = transit.segments.filter((s) => s.from !== 'sena-ruam' && s.to !== 'sena-ruam');
writeFileSync(file, JSON.stringify(transit));

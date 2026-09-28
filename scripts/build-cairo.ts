// Builds public/data/cairo/transit.json and server/data/cairo/sim.json with the sim kit (docs/KIT_SIM.md).
// Network: OSM route relations (Line 3 to Rod El Farag Axis and Cairo University, 2024; East Nile monorail, 2026).
// Trains: Cairo has no open timetable. Headways come from Transport for Cairo's frequency-based GTFS (Lines 1–2,
// 2024–25; Line 3 as of 2021), whose run times also calibrate the trips. Weekends are Friday and Saturday.
// Usage: npx tsx scripts/build-cairo.ts
import { buildSimCity, type DayService, type SimLineConfig } from './lib/osm-network/index.ts';

// Sunday–Thursday ('std') and Friday/Saturday/holiday ('vac') services, per direction, from TfC's frequencies.txt.
const L1_STD: DayService = {
  first: '05:15', last: '00:05',
  headways: [['05:15', 15], ['05:30', 12], ['05:45', 10], ['06:00', 4], ['06:20', 3.5], ['09:30', 4], ['18:35', 5], ['20:30', 6], ['23:30', 7]],
};
const L1_VAC: DayService = { first: '05:15', last: '00:00', headways: [['05:15', 15], ['06:00', 10], ['07:20', 7.5], ['10:05', 5], ['21:00', 6], ['22:00', 7.5]] };
const L2_STD: DayService = {
  first: '05:15', last: '00:25',
  headways: [['05:15', 15], ['05:30', 10], ['06:00', 5], ['06:30', 3], ['08:05', 2.75], ['10:30', 3], ['18:30', 4], ['20:50', 5], ['23:50', 6], ['00:08', 7.5]],
};
const L2_VAC: DayService = { first: '05:15', last: '00:25', headways: [['05:15', 15], ['06:00', 10], ['07:00', 7.5], ['08:00', 5], ['23:00', 6], ['00:00', 7]] };
/** Line 3 headway per branch: twice the trunk's, since trains alternate between Rod El Farag Axis and Cairo University. */
const perBranch = (d: DayService): DayService => ({ ...d, headways: d.headways.map(([t, m]) => [t, m * 2] as [string, number]) });

const RUN = { vmax: 80, acc: 0.9, dec: 1.0, dwell: 30, dwellInterchange: 45 };

const lines: SimLineConfig[] = [
  {
    id: 'L1', system: 'metro', name: 'Line 1', nameLocal: 'الخط الأول', short: '1', color: '#2272B9', bullet: 'circle', kind: 'metro',
    osm: { relations: [421705, 2826217] },
    run: { ...RUN, trip: { from: 'Helwan', to: 'New El-Marg', minutes: 79 } },
    service: { weekday: L1_STD, saturday: L1_VAC, sunday: L1_VAC },
    patterns: [{ from: 'Helwan', to: 'New El-Marg', share: 1 }],
    stock: [
      { stock: 'cairo-l1-classic', share: 0.45, cars: 9 },
      { stock: 'cairo-l1-rotem', share: 0.3, cars: 9 },
      { stock: 'cairo-l1-metropolis', share: 0.25, cars: 9 },
    ],
    directions: ['Northbound', 'Southbound'],
  },
  {
    id: 'L2', system: 'metro', name: 'Line 2', nameLocal: 'الخط الثاني', short: '2', color: '#D2232A', bullet: 'circle', kind: 'metro',
    osm: { relations: [421706, 7927231] },
    run: { ...RUN, trip: { from: 'Shobra Al-Kheima', to: 'Al-Mounib', minutes: 38 } },
    service: { weekday: L2_STD, saturday: L2_VAC, sunday: L2_VAC },
    patterns: [{ from: 'Shobra Al-Kheima', to: 'Al-Mounib', share: 1 }],
    stock: [{ stock: 'cairo-l2-japan', cars: 6 }],
    directions: ['Southbound', 'Northbound'],
  },
  {
    id: 'L3', system: 'metro', name: 'Line 3', nameLocal: 'الخط الثالث', short: '3', color: '#0A8A3C', bullet: 'circle', kind: 'metro',
    osm: { relations: [7686561, 2063304, 17625744, 17625746] },
    run: { ...RUN, trip: { from: 'Attaba', to: 'Adly Mansour', minutes: 42 } },
    service: { weekday: perBranch(L2_STD), saturday: perBranch(L2_VAC), sunday: perBranch(L2_VAC) },
    patterns: [
      { from: 'Adly Mansour', to: 'محطه مترو محور الضبعة', via: ['Imbaba'], share: 1 },
      { from: 'Adly Mansour', to: 'Cairo University', via: ['Al-Tawfikia'], share: 1 },
    ],
    stock: [{ stock: 'cairo-l3-japan', share: 0.45, cars: 8 }, { stock: 'cairo-l3-rotem', share: 0.55, cars: 8 }],
    directions: ['Westbound', 'Eastbound'],
  },
  {
    id: 'EN', system: 'monorail', name: 'East Nile Monorail', nameLocal: 'مونوريل شرق النيل', short: 'M', color: '#00309A', bullet: 'circle', kind: 'monorail',
    osm: { relations: [13186211, 20384125] },
    run: { vmax: 80, acc: 0.9, dec: 1.0, dwell: 30, trip: { from: 'Cairo Stadium Monorail Station', to: 'Justice City', minutes: 60 } },
    // Opened May 2026; no timetable is published yet, so this is an estimate.
    service: { weekday: { first: '06:00', last: '22:00', headways: [['06:00', 15]] } },
    patterns: [{ from: 'Cairo Stadium Monorail Station', to: 'Justice City', share: 1 }],
    stock: [{ stock: 'cairo-innovia', cars: 4 }],
    directions: ['To the New Capital', 'To Nasr City'],
  },
];

await buildSimCity({
  city: 'cairo',
  systems: [
    { id: 'metro', name: 'Cairo Metro' },
    { id: 'monorail', name: 'Cairo Monorail' },
  ],
  lines,
  names: { local: ['name'], en: ['name:en'] },
  stations: {
    rename: {
      'Ain Helwan': ['Ain Helwan', 'عين حلوان'],
      'Al-Bohy': ['Al-Bohy', 'البوهي'],
      'Al-Kawmeiah': ['Al-Kawmeiah', 'القومية العربية'],
      'Alf Maskan subway station': ['Alf Maskan', 'ألف مسكن'],
      'Attaba': ['Attaba', 'العتبة'],
      'Bulaq Al-Dakrour': ['Bulaq El-Dakrour', 'بولاق الدكرور'],
      'Cairo Stadium Monorail Station': ['Cairo Stadium', 'استاد القاهرة'],
      'El Haykestep': ['Haykestep', 'الهايكستب'],
      'El Nozha': ['El Nozha', 'النزهة'],
      'El Shams Club': ['El Shams Club', 'نادي الشمس'],
      'محطه مترو محور الضبعة': ['Rod El-Farag Axis', 'محور روض الفرج'],
      'Ezbet en Nakhl': ['Ezbet El-Nakhl', 'عزبة النخل'],
      'Giza': ['Giza', 'الجيزة'],
      'Hadayek El Maadi': ['Hadayek El-Maadi', 'حدائق المعادي'],
      'Heliopolis subway station': ['Heliopolis', 'هليوبوليس'],
      'Hesham Barakat': ['Hesham Barakat', 'هشام بركات'],
      'Hesham Barakat Monorail Station': ['Hesham Barakat', 'هشام بركات'],
      'Imbaba': ['Imbaba', 'إمبابة'],
      'Kit-kat': ['Kit Kat', 'الكيت كات'],
      'Koleyet El Banat': ['Koleyet El-Banat', 'كلية البنات'],
      'Massara': ['Massara', 'مسرة'],
      'Mohamed Naguib': ['Mohamed Naguib', 'محمد نجيب'],
      'Omar Ebn Elkhatab': ['Omar Ibn El-Khattab', 'عمر بن الخطاب'],
      'Qubaa': ['Qubaa', 'قباء'],
      'Rawd El-Farag': ['Rod El-Farag', 'روض الفرج'],
      'Ring Road': ['Ring Road', 'الطريق الدائري'],
      'Shobra Al-Kheima': ['Shubra El-Kheima', 'شبرا الخيمة'],
      'Sudan': ['Sudan', 'السودان'],
    },
  },
  // Egypt's weekend is Friday and Saturday; public holidays run the Friday service (Islamic dates are approximate).
  calendar: {
    weekend: [5, 6],
    holidays: [
      '2026-01-07', '2026-01-25', '2026-03-20', '2026-03-21', '2026-03-22', '2026-04-13', '2026-04-25', '2026-05-01',
      '2026-05-26', '2026-05-27', '2026-05-28', '2026-06-16', '2026-06-30', '2026-07-23', '2026-08-25', '2026-10-06',
      '2027-01-07', '2027-01-25', '2027-03-10', '2027-03-11', '2027-03-12', '2027-04-25', '2027-05-01', '2027-05-03',
      '2027-05-16', '2027-05-17', '2027-05-18', '2027-06-06', '2027-06-30', '2027-07-23', '2027-08-15', '2027-10-06',
    ],
  },
  attribution: ['Service: Transport for Cairo frequencies (simulated)'],
});

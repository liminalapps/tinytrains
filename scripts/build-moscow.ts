// Builds public/data/moscow/transit.json and server/data/moscow/sim.json with the sim kit (docs/KIT_SIM.md).
// Network: OSM route relations. Trains: typical Moscow Metro intervals (estimates; line trip times from Wikipedia).
// Usage: npx tsx scripts/build-moscow.ts
import { buildSimCity, type DayServices, type SimLineConfig, type StockShare } from './lib/osm-network/index.ts';

/** Weekday and weekend intervals in minutes: peak, daytime, evening (20:00) and late (23:00). */
const metro = (peak: number, day: number, eve: number, late: number, we: number): DayServices => ({
  weekday: {
    first: '05:30',
    last: '01:00',
    headways: [['05:30', late], ['06:30', day], ['07:00', peak], ['10:00', day], ['16:30', peak], ['20:00', eve], ['23:00', late]],
  },
  sunday: { first: '05:30', last: '01:00', headways: [['05:30', late], ['07:30', we], ['22:30', late]] },
});
const RUN = { vmax: 90, acc: 1.0, dec: 1.0, dwell: 25, dwellInterchange: 35 };
const moskva = (cars = 8): StockShare[] => [{ stock: 'moscow-81-765', cars }];
const moskva2020 = (cars = 8): StockShare[] => [{ stock: 'moscow-81-775', cars }];
const oka: StockShare[] = [{ stock: 'moscow-81-760', cars: 8 }];

type Line = Omit<SimLineConfig, 'system' | 'kind' | 'bullet'> & Partial<Pick<SimLineConfig, 'system' | 'kind' | 'bullet'>>;
const line = (l: Line): SimLineConfig => ({ system: 'metro', kind: 'subway', bullet: 'circle', ...l });
const both = (from: string, to: string) => [{ from, to, share: 1 }];

const lines: SimLineConfig[] = [
  line({
    id: '1', name: 'Sokolnicheskaya Line', nameLocal: 'Сокольническая линия', short: '1', color: '#D92B2C',
    osm: { relations: [1475755, 305810] }, run: { ...RUN, trip: { from: 'Бульвар Рокоссовского', to: 'Потапово', minutes: 67 } },
    service: metro(1.6, 3, 3.5, 6, 3), patterns: both('Бульвар Рокоссовского', 'Потапово'),
    stock: [{ stock: 'moscow-81-765', share: 0.85, cars: 8 }, { stock: 'moscow-81-740', share: 0.15, cars: 5 }],
  }),
  line({
    id: '2', name: 'Zamoskvoretskaya Line', nameLocal: 'Замоскворецкая линия', short: '2', color: '#44B85C',
    osm: { relations: [2657084, 2657085] }, run: { ...RUN, trip: { from: 'Ховрино', to: 'Алма-Атинская', minutes: 62.5 } },
    service: metro(1.5, 2.5, 3.5, 6, 3), patterns: both('Ховрино', 'Алма-Атинская'), stock: moskva2020(),
  }),
  line({
    id: '3', name: 'Arbatsko-Pokrovskaya Line', nameLocal: 'Арбатско-Покровская линия', short: '3', color: '#0078BF',
    osm: { relations: [1472298, 302149] }, run: { ...RUN, trip: { from: 'Пятницкое шоссе', to: 'Щёлковская', minutes: 65 } },
    service: metro(1.75, 3, 4, 6, 3.5), patterns: both('Пятницкое шоссе', 'Щёлковская'), stock: [{ stock: 'moscow-81-740', cars: 5 }],
  }),
  line({
    id: '4', name: 'Filyovskaya Line', nameLocal: 'Филёвская линия', short: '4', color: '#19C1F3',
    osm: { relations: [1463285, 302148, 1463286, 302147] }, run: { ...RUN, trip: { from: 'Кунцевская', to: 'Александровский сад', minutes: 20 } },
    service: metro(3, 4.5, 5, 8, 5),
    patterns: [
      { from: 'Кунцевская', to: 'Александровский сад', share: 0.6 },
      { from: 'Москва-Сити', to: 'Александровский сад', share: 0.4 },
    ],
    stock: moskva(6),
  }),
  line({
    id: '5', name: 'Koltsevaya Line', nameLocal: 'Кольцевая линия', short: '5', color: '#894E35',
    osm: { relations: [1462011, 300607] }, run: { ...RUN, trip: { from: 'Комсомольская', to: 'Комсомольская', minutes: 28 } },
    service: metro(1.75, 3, 3.5, 5, 3), patterns: [{ from: 'Комсомольская', to: 'Комсомольская', loop: true, share: 1 }], stock: moskva2020(7),
  }),
  line({
    id: '6', name: 'Kaluzhsko-Rizhskaya Line', nameLocal: 'Калужско-Рижская линия', short: '6', color: '#F58631',
    osm: { relations: [1514369, 300618] }, run: { ...RUN, trip: { from: 'Медведково', to: 'Новоясеневская', minutes: 56 } },
    service: metro(1.5, 2.5, 3.5, 6, 3), patterns: both('Медведково', 'Новоясеневская'),
    stock: [{ stock: 'moscow-81-775', share: 0.4, cars: 8 }, { stock: 'moscow-81-765', share: 0.3, cars: 8 }, { stock: 'moscow-81-760', share: 0.3, cars: 8 }],
  }),
  line({
    id: '7', name: 'Tagansko-Krasnopresnenskaya Line', nameLocal: 'Таганско-Краснопресненская линия', short: '7', color: '#8E479C',
    osm: { relations: [1516303, 309620] }, run: { ...RUN, trip: { from: 'Планерная', to: 'Котельники', minutes: 59 } },
    service: metro(1.5, 2.5, 3.5, 6, 3), patterns: both('Планерная', 'Котельники'), stock: moskva(),
  }),
  line({
    id: '8', name: 'Kalininskaya Line', nameLocal: 'Калининская линия', short: '8', color: '#FFCB31',
    osm: { relations: [1526350, 326491] }, run: { ...RUN, trip: { from: 'Третьяковская', to: 'Новокосино', minutes: 21 } },
    service: metro(2, 3.5, 4, 7, 4), patterns: both('Третьяковская', 'Новокосино'), stock: oka,
  }),
  line({
    id: '8A', name: 'Solntsevskaya Line', nameLocal: 'Солнцевская линия', short: '8A', color: '#FFCB31',
    osm: { relations: [6855052, 6855053] }, run: { ...RUN, trip: { from: 'Деловой центр', to: 'Аэропорт Внуково', minutes: 44 } },
    service: metro(2.5, 4, 5, 7, 4), patterns: both('Деловой центр', 'Аэропорт Внуково'), stock: oka,
  }),
  line({
    id: '9', name: 'Serpukhovsko-Timiryazevskaya Line', nameLocal: 'Серпуховско-Тимирязевская линия', short: '9', color: '#A1A2A3',
    osm: { relations: [1570093, 301486] }, run: { ...RUN, trip: { from: 'Алтуфьево', to: 'Бульвар Дмитрия Донского', minutes: 58 } },
    service: metro(1.5, 2.5, 3.5, 6, 3), patterns: both('Алтуфьево', 'Бульвар Дмитрия Донского'), stock: oka,
  }),
  line({
    id: '10', name: 'Lyublinsko-Dmitrovskaya Line', nameLocal: 'Люблинско-Дмитровская линия', short: '10', color: '#B3D445',
    osm: { relations: [1532874, 309623] }, run: RUN,
    service: metro(1.75, 3, 4, 6, 3.5), patterns: both('Физтех', 'Зябликово'), stock: oka,
  }),
  line({
    id: '11', name: 'Bolshaya Koltsevaya Line', nameLocal: 'Большая кольцевая линия', short: '11', color: '#79CDCD',
    osm: { relations: [13525792, 13525793] }, run: { ...RUN, trip: { from: 'Савёловская', to: 'Савёловская', minutes: 83 } },
    service: metro(2.5, 3.5, 4, 6, 3.5), patterns: [{ from: 'Савёловская', to: 'Савёловская', loop: true, share: 1 }], stock: moskva2020(),
  }),
  line({
    id: '12', name: 'Butovskaya Line', nameLocal: 'Бутовская линия', short: '12', color: '#B0BFE7',
    osm: { relations: [1580607, 3873066] }, run: { ...RUN, trip: { from: 'Битцевский парк', to: 'Бунинская аллея', minutes: 16 } },
    service: metro(3.5, 5, 6, 8, 5), patterns: both('Битцевский парк', 'Бунинская аллея'), stock: [{ stock: 'moscow-81-740', cars: 3 }],
  }),
  line({
    id: '14', system: 'mcc', kind: 'rail', name: 'Moscow Central Circle', nameLocal: 'Московское центральное кольцо', short: '14', color: '#EE2722',
    osm: { relations: [6548266, 6548267] }, run: { vmax: 90, acc: 0.8, dec: 0.9, dwell: 45, dwellInterchange: 55, trip: { from: 'Лужники', to: 'Лужники', minutes: 88 } },
    service: {
      weekday: { first: '05:30', last: '01:00', headways: [['05:30', 8], ['07:30', 4], ['11:30', 6], ['16:00', 4], ['21:00', 6], ['23:00', 8]] },
      sunday: { first: '05:30', last: '01:00', headways: [['05:30', 8], ['08:00', 6], ['12:30', 4], ['18:00', 6], ['23:00', 8]] },
    },
    patterns: [{ from: 'Лужники', to: 'Лужники', loop: true, share: 1 }],
    stock: [{ stock: 'moscow-es2g', cars: 5 }],
  }),
  line({
    id: '15', name: 'Nekrasovskaya Line', nameLocal: 'Некрасовская линия', short: '15', color: '#DE64A1',
    osm: { relations: [10011654, 10011655] }, run: { ...RUN, trip: { from: 'Нижегородская', to: 'Некрасовка', minutes: 20 } },
    service: metro(4, 5, 5, 7, 5), patterns: both('Нижегородская', 'Некрасовка'), stock: moskva(),
  }),
  line({
    id: '16', name: 'Troitskaya Line', nameLocal: 'Троицкая линия', short: '16', color: '#03795F',
    osm: { relations: [18020151, 18020152] }, run: { ...RUN, trip: { from: 'ЗИЛ', to: 'Новомосковская', minutes: 32 } },
    service: metro(2.5, 3.5, 4, 7, 4), patterns: both('ЗИЛ', 'Новомосковская'), stock: moskva2020(),
  }),
  line({
    id: '17', name: 'Rublyovo-Arkhangelskaya Line', nameLocal: 'Рублёво-Архангельская линия', short: '17', color: '#27303F',
    osm: { relations: [21362056, 21362057] }, run: { ...RUN, trip: { from: 'Деловой центр', to: 'Бульвар Генерала Карбышева', minutes: 12 } },
    service: metro(4, 5, 6, 8, 6), patterns: both('Деловой центр', 'Бульвар Генерала Карбышева'), stock: moskva2020(),
  }),
];

/** Moscow Central Diameters: through suburban trains every few minutes in the peaks, 10–20 min otherwise (estimates). */
const mcd = (peak: number, day: number, late: number): DayServices => ({
  weekday: { first: '05:00', last: '00:30', headways: [['05:00', late], ['06:30', peak], ['09:30', day], ['17:00', peak], ['20:00', day], ['22:30', late]] },
  sunday: { first: '05:30', last: '00:30', headways: [['05:30', late], ['08:00', day], ['22:30', late]] },
});
const MCD_RUN = { vmax: 110, acc: 0.7, dec: 0.8, dwell: 50 };
const diameter = (id: string, name: string, nameLocal: string, color: string, relations: number[], from: string, to: string, svc: DayServices, stock: StockShare[]): SimLineConfig => ({
  id, system: 'mcd', kind: 'rail', bullet: 'square', name, nameLocal, short: id, color, osm: { relations }, run: MCD_RUN, service: svc,
  patterns: both(from, to), stock,
});
const ivolga: StockShare[] = [{ stock: 'moscow-eg2tv', cars: 11 }];

lines.push(
  diameter('D1', 'MCD-1 Belorussko-Savyolovsky', 'МЦД-1 Белорусско-Савёловский', '#ED9F2D', [10309185, 10309186], 'Лобня', 'Одинцово', mcd(6, 12, 20), [{ stock: 'moscow-es2g', cars: 10 }]),
  diameter('D2', 'MCD-2 Kursko-Rizhsky', 'МЦД-2 Курско-Рижский', '#DF477C', [10309306, 10309307], 'Нахабино', 'Подольск', mcd(6, 10, 20), ivolga),
  diameter('D3', 'MCD-3 Leningradsko-Kazansky', 'МЦД-3 Ленинградско-Казанский', '#E15D29', [16213700, 16213701], 'Зеленоград-Крюково', 'Ипподром', mcd(8, 15, 20), ivolga),
  diameter('D4', 'MCD-4 Kaluzhsko-Nizhegorodsky', 'МЦД-4 Калужско-Нижегородский', '#3FB485', [16272077, 16272078], 'Железнодорожная', 'Апрелевка', mcd(8, 15, 20), ivolga),
);

await buildSimCity({
  city: 'moscow',
  systems: [
    { id: 'metro', name: 'Moscow Metro' },
    { id: 'mcc', name: 'Moscow Central Circle' },
    { id: 'mcd', name: 'Moscow Central Diameters' },
  ],
  lines,
  names: { transliterate: 'cyrillic', loop: ['по часовой стрелке', 'против часовой стрелки'] },
  // Russian public holidays and their transferred days off (Moscow runs the weekend service on them).
  calendar: {
    holidays: [
      ...['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11'].map((d) => `2026-01-${d}`),
      '2026-02-23', '2026-03-09', '2026-05-01', '2026-05-11', '2026-06-12', '2026-11-04', '2026-12-31',
      ...['01', '02', '03', '04', '05', '06', '07', '08'].map((d) => `2027-01-${d}`),
      '2027-02-23', '2027-03-08', '2027-05-03', '2027-05-10', '2027-06-14', '2027-11-04', '2027-12-31',
    ],
  },
  attribution: ['Service: typical Moscow Metro intervals (simulated)'],
});

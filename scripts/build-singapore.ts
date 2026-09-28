// Builds public/data/singapore/transit.json and server/data/singapore/sim.json with the sim kit (docs/KIT_SIM.md).
// Network: OSM route relations. Trains: LTA's published frequencies (peak 2–3 min, off-peak about 5 min on the MRT).
// Usage: npx tsx scripts/build-singapore.ts
import { buildSimCity, type DayServices, type SimLineConfig, type StockShare } from './lib/osm-network/index.ts';

/** Weekday peaks, Saturday without them, and Sunday/holiday with a later start (minutes per direction). */
const mrt = (peak: number, off: number, late: number): DayServices => ({
  weekday: {
    first: '05:30',
    last: '23:45',
    headways: [['05:30', off], ['07:00', peak], ['09:30', off], ['17:00', peak], ['20:00', off], ['22:30', late]],
  },
  saturday: { first: '05:30', last: '23:45', headways: [['05:30', off], ['22:30', late]] },
  sunday: { first: '05:50', last: '23:45', headways: [['05:50', off + 1], ['09:00', off], ['22:30', late]] },
});
const RUN = { vmax: 80, acc: 1.0, dec: 1.0, dwell: 30, dwellInterchange: 40 };
const LRT_RUN = { vmax: 55, acc: 0.9, dec: 1.0, dwell: 20 };
const nsew: StockShare[] = [
  { stock: 'singapore-r151', share: 0.45, cars: 6 },
  { stock: 'singapore-c151a', share: 0.25, cars: 6 },
  { stock: 'singapore-c151b', share: 0.3, cars: 6 },
];
const lrt = (id: string, name: string, short: string, relations: number[], patterns: SimLineConfig['patterns'], stock: StockShare[], svc: DayServices): SimLineConfig => ({
  id, system: 'lrt', name, short, color: '#748477', bullet: 'pill', kind: 'agt', osm: { relations }, run: LRT_RUN, service: svc, patterns, stock,
});

const lines: SimLineConfig[] = [
  {
    id: 'NSL', system: 'mrt', name: 'North–South Line', short: 'NS', color: '#D42E12', bullet: 'pill', kind: 'subway',
    osm: { relations: [2312797, 445768] }, run: RUN, service: mrt(2.5, 5, 7),
    patterns: [{ from: 'Jurong East', to: 'Marina South Pier', share: 1 }], stock: nsew,
  },
  {
    id: 'EWL', system: 'mrt', name: 'East–West Line', short: 'EW', color: '#009645', bullet: 'pill', kind: 'subway',
    osm: { relations: [2312796, 445764, 7981691, 7981690] }, run: RUN, service: mrt(2.5, 5, 7),
    groups: { changi: mrt(6, 8, 12) },
    patterns: [
      { from: 'Pasir Ris', to: 'Tuas Link', share: 1 },
      { from: 'Tanah Merah', to: 'Changi Airport', share: 1, group: 'changi' },
    ],
    stock: nsew,
  },
  {
    id: 'NEL', system: 'mrt', name: 'North East Line', short: 'NE', color: '#9900AA', bullet: 'pill', kind: 'subway',
    osm: { relations: [2293545, 7981648] }, run: RUN, service: mrt(2.5, 5, 7),
    patterns: [{ from: 'HarbourFront', to: 'Punggol Coast', share: 1 }],
    stock: [{ stock: 'singapore-c751a', share: 0.6, cars: 6 }, { stock: 'singapore-c751c', share: 0.4, cars: 6 }],
  },
  {
    // Since Stage 6 (12 July 2026) the Circle Line is a closed loop; clockwise and anticlockwise services also run
    // the Dhoby Ghaut spur and terminate at Prince Edward Road. The spur gets every other train.
    id: 'CCL', system: 'mrt', name: 'Circle Line', short: 'CC', color: '#FA9E0D', bullet: 'pill', kind: 'subway',
    osm: { relations: [7981668, 2076291, 7981669, 7981667] }, run: RUN, service: mrt(2, 5, 7),
    patterns: [
      { from: 'Promenade', to: 'Promenade', loop: true, share: 0.5 },
      { from: 'Dhoby Ghaut', to: 'Prince Edward Road', share: 0.5 },
    ],
    stock: [{ stock: 'singapore-c830', cars: 3 }],
  },
  {
    id: 'DTL', system: 'mrt', name: 'Downtown Line', short: 'DT', color: '#005EC4', bullet: 'pill', kind: 'subway',
    osm: { relations: [2313458, 7981642] }, run: RUN, service: mrt(2.5, 5, 7),
    patterns: [{ from: 'Bukit Panjang', to: 'Expo', share: 1 }], stock: [{ stock: 'singapore-c951', cars: 3 }],
  },
  {
    id: 'TEL', system: 'mrt', name: 'Thomson–East Coast Line', short: 'TE', color: '#9D5B25', bullet: 'pill', kind: 'subway',
    osm: { relations: [9627856, 2383439] }, run: RUN, service: mrt(3, 5, 7),
    patterns: [{ from: 'Woodlands North', to: 'Bayshore', share: 1 }], stock: [{ stock: 'singapore-t251', cars: 4 }],
  },
  lrt('BPLRT', 'Bukit Panjang LRT', 'BP', [1159434, 9664084], [{ from: 'Choa Chu Kang', to: 'Choa Chu Kang', loop: true, share: 1 }],
    [{ stock: 'singapore-c801', cars: 2 }], mrt(3.5, 5, 7)),
  lrt('SKLRT', 'Sengkang LRT', 'SK', [2312985, 9663107, 1146941, 9663108], [
    { from: 'Sengkang', to: 'Sengkang', via: ['Compassvale'], loop: true, share: 1, group: 'east' },
    { from: 'Sengkang', to: 'Sengkang', via: ['Cheng Lim'], loop: true, share: 1, group: 'west' },
  ], [{ stock: 'singapore-c810', share: 0.5, cars: 2 }, { stock: 'singapore-c810', share: 0.5, cars: 1 }], mrt(3.5, 5, 7)),
  lrt('PGLRT', 'Punggol LRT', 'PG', [1146942, 9663919, 2312984, 9663920], [
    { from: 'Punggol', to: 'Punggol', via: ['Cove'], loop: true, share: 1, group: 'east' },
    { from: 'Punggol', to: 'Punggol', via: ['Sam Kee'], loop: true, share: 1, group: 'west' },
  ], [{ stock: 'singapore-c810', share: 0.5, cars: 2 }, { stock: 'singapore-c810', share: 0.5, cars: 1 }], mrt(3.5, 5, 7)),
];

await buildSimCity({
  city: 'singapore',
  systems: [
    { id: 'mrt', name: 'MRT' },
    { id: 'lrt', name: 'LRT' },
  ],
  lines,
  // Public holidays run the Sunday service (lunar and Islamic dates, and days in lieu, are approximate).
  calendar: {
    holidays: [
      '2026-01-01', '2026-02-17', '2026-02-18', '2026-03-21', '2026-04-03', '2026-05-01', '2026-05-27', '2026-06-01',
      '2026-08-10', '2026-11-09', '2026-12-25',
      '2027-01-01', '2027-02-08', '2027-02-09', '2027-03-10', '2027-03-26', '2027-05-17', '2027-05-20', '2027-08-09',
      '2027-10-28', '2027-12-25',
    ],
  },
  attribution: ['Service: LTA published train frequencies (simulated)'],
});

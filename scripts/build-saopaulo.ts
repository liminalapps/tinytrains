// Builds public/data/saopaulo/transit.json and server/data/saopaulo/sim.json with the sim kit (docs/KIT_SIM.md).
// No usable public timetable: SPTrans's GTFS (login-only; its Mobility Database mirror is stale) has flat or wrong rail
// headways and none of lines 6 and 17. Network: OSM route relations. Trains: Metrô's published minimum intervals
// (lines 1–3, 5, 15), the CPTM-era lines' peak intervals and Line 10's timetable (pt.wikipedia), and the reduced
// 10:00–15:00 weekday service that lines 6 and 17 run while they are new (g1, MetrôCPTM, June 2026).
// Usage: npx tsx scripts/build-saopaulo.ts
import { buildSimCity, type DayService, type DayServices, type SimLineConfig, type StockShare } from './lib/osm-network/index.ts';

// Metrô: 04:40 to midnight, to 01:00 on Saturday nights. Minutes per direction.
const metroWeek = (peak: number, day: number, eve: number, sat: number, sun: number): DayServices => ({
  weekday: {
    first: '04:40',
    last: '00:00',
    headways: [['04:40', 6], ['05:30', day], ['06:15', peak], ['09:30', day], ['16:30', peak], ['20:00', eve], ['22:00', 5], ['23:00', 7]],
  },
  saturday: { first: '04:40', last: '01:00', headways: [['04:40', 7], ['06:30', sat + 1], ['08:30', sat], ['20:00', sat + 1], ['22:00', 7], ['00:00', 9]] },
  sunday: { first: '04:40', last: '00:00', headways: [['04:40', 8], ['07:30', sun], ['20:00', sun + 1], ['22:00', 8]] },
});
// CPTM-era lines: 04:00 to midnight.
const railWeek = (peak: number, day: number, eve: number, late: number): DayServices => ({
  weekday: { first: '04:00', last: '00:00', headways: [['04:00', late], ['05:00', peak], ['09:00', day], ['16:00', peak], ['20:00', eve], ['22:00', late]] },
  saturday: { first: '04:00', last: '00:00', headways: [['04:00', late], ['06:00', Math.round(day * 1.2)], ['20:00', eve], ['22:00', late]] },
  sunday: { first: '04:00', last: '00:00', headways: [['04:00', late], ['07:00', Math.round(day * 1.8)], ['21:00', late]] },
});
/** Lines 6 and 17 in their first months: weekdays 10:00–15:00 only. */
const newLine = (headway: number): DayServices => {
  const d: DayService = { first: '10:00', last: '14:45', headways: [['10:00', headway]] };
  return { weekday: d, saturday: null, sunday: null };
};

const METRO_RUN = { vmax: 87, acc: 1.1, dec: 1.2, dwell: 25, dwellInterchange: 40 };
const RAIL_RUN = { vmax: 90, acc: 0.8, dec: 0.9, dwell: 35, dwellInterchange: 50 };
const both = (from: string, to: string) => [{ from, to, share: 1 }];
const mix = (...m: [string, number, number][]): StockShare[] => m.map(([stock, cars, share]) => ({ stock: `saopaulo-${stock}`, cars, share }));

type Line = Omit<SimLineConfig, 'bullet'> & Partial<Pick<SimLineConfig, 'bullet'>>;
const line = (l: Line): SimLineConfig => ({ bullet: 'circle', ...l });

const lines: SimLineConfig[] = [
  // ------------------------------------------------------------------------------------ Metrô
  line({
    id: '1', system: 'metro', kind: 'metro', name: 'Line 1–Blue', nameLocal: 'Linha 1–Azul', short: '1', color: '#0455A1',
    osm: { relations: [2144052, 3596994] }, run: { ...METRO_RUN, trip: { from: 'Jabaquara', to: 'Tucuruvi', minutes: 38 } },
    service: metroWeek(2.2, 3, 3.5, 4, 5), patterns: both('Jabaquara', 'Tucuruvi'),
    stock: mix(['frota-j', 6, 26], ['frota-l', 6, 22], ['frota-e', 6, 10], ['frota-k', 6, 1]),
  }),
  line({
    id: '2', system: 'metro', kind: 'metro', name: 'Line 2–Green', nameLocal: 'Linha 2–Verde', short: '2', color: '#007E5E',
    osm: { relations: [419276, 3619669] }, run: { ...METRO_RUN, trip: { from: 'Vila Prudente', to: 'Vila Madalena', minutes: 28 } },
    service: metroWeek(2.3, 4, 3.5, 4.5, 5.5), patterns: both('Vila Prudente', 'Vila Madalena'),
    stock: mix(['frota-i', 6, 25], ['frota-j', 6, 2]),
  }),
  line({
    id: '3', system: 'metro', kind: 'metro', name: 'Line 3–Red', nameLocal: 'Linha 3–Vermelha', short: '3', color: '#EE372F',
    osm: { relations: [419274, 3252761] }, run: { ...METRO_RUN, trip: { from: 'Palmeiras-Barra Funda', to: 'Corinthians-Itaquera', minutes: 41 } },
    service: metroWeek(2, 3.5, 3.5, 3.5, 4.5), patterns: both('Palmeiras-Barra Funda', 'Corinthians-Itaquera'),
    stock: mix(['frota-k', 6, 24], ['frota-h', 6, 17], ['frota-g', 6, 16]),
  }),
  line({
    id: '4', system: 'metro', kind: 'metro', name: 'Line 4–Yellow', nameLocal: 'Linha 4–Amarela', short: '4', color: '#FFD400', textColor: '#1A1A1A',
    osm: { relations: [419281, 3613476] }, run: { ...METRO_RUN, vmax: 80, trip: { from: 'Luz', to: 'Vila Sônia', minutes: 23 } },
    service: metroWeek(2, 3.5, 3.5, 4, 5), patterns: both('Luz', 'Vila Sônia'),
    stock: mix(['rotem-l4', 6, 1]),
  }),
  line({
    id: '5', system: 'metro', kind: 'metro', name: 'Line 5–Lilac', nameLocal: 'Linha 5–Lilás', short: '5', color: '#9B3894',
    osm: { relations: [419266, 3539819] }, run: { ...METRO_RUN, vmax: 80, trip: { from: 'Capão Redondo', to: 'Chácara Klabin', minutes: 40 } },
    service: metroWeek(2.75, 4, 4.5, 5, 6), patterns: both('Capão Redondo', 'Chácara Klabin'),
    stock: mix(['frota-p', 6, 1]),
  }),
  line({
    id: '6', system: 'metro', kind: 'metro', name: 'Line 6–Orange', nameLocal: 'Linha 6–Laranja', short: '6', color: '#F47936',
    // Assisted operation: two trains shuttling at about 30 km/h.
    osm: { relations: [21066133, 21066135] }, run: { vmax: 35, acc: 0.8, dec: 0.9, dwell: 35 },
    service: newLine(15), patterns: both('João Paulo I', 'Perdizes'),
    stock: mix(['serie-600', 6, 1]),
  }),
  line({
    id: '15', system: 'metro', kind: 'monorail', name: 'Line 15–Silver', nameLocal: 'Linha 15–Prata', short: '15', color: '#899194',
    osm: { relations: [5887353, 5887354] }, run: { vmax: 70, acc: 1.0, dec: 1.1, dwell: 30 },
    service: metroWeek(3, 4.5, 5, 6, 7), patterns: both('Vila Prudente', 'Jardim Colonial'),
    stock: mix(['frota-m', 7, 3], ['frota-s', 7, 1]),
  }),
  line({
    id: '17', system: 'metro', kind: 'monorail', name: 'Line 17–Gold', nameLocal: 'Linha 17–Ouro', short: '17', color: '#C08F3F',
    // One train each way between Morumbi and Congonhas. (A one-train shuttle also runs from Brooklin Paulista to the
    // new Washington Luís station, which OSM doesn't map yet.)
    osm: { relations: [20402218, 20402219] },
    run: { vmax: 50, acc: 0.8, dec: 0.9, dwell: 35 },
    service: newLine(16),
    patterns: both('Morumbi', 'Aeroporto de Congonhas'),
    stock: mix(['frota-n', 5, 1]),
  }),

  // ------------------------------------------------------------------------------------ Trem Metropolitano
  line({
    id: '7', system: 'trem', kind: 'rail', name: 'Line 7–Ruby', nameLocal: 'Linha 7–Rubi', short: '7', color: '#CA016B',
    osm: { relations: [2557150, 2557151] }, run: RAIL_RUN,
    // Every other peak train turns at Francisco Morato; the rest run on to Jundiaí.
    service: railWeek(12, 12, 15, 20),
    groups: { morato: { weekday: { first: '05:00', last: '20:00', headways: [['05:00', 12], ['09:00', 0], ['16:00', 12], ['20:00', 0]] }, saturday: null, sunday: null } },
    patterns: [
      { from: 'Palmeiras-Barra Funda', to: 'Jundiaí', share: 1 },
      { from: 'Palmeiras-Barra Funda', to: 'Francisco Morato', share: 1, group: 'morato' },
    ],
    stock: mix(['9500', 8, 1]),
  }),
  line({
    id: '8', system: 'trem', kind: 'rail', name: 'Line 8–Diamond', nameLocal: 'Linha 8–Diamante', short: '8', color: '#97A098',
    // OSM's Itapevi-bound relation stops short of Júlio Prestes, so the full stopping list is given too.
    osm: {
      relations: [419297, 2174505],
      sequences: [['Júlio Prestes', 'Palmeiras-Barra Funda', 'Lapa - Senac', 'Domingos de Moraes', 'Imperatriz Leopoldina', 'Presidente Altino', 'Osasco', 'Comandante Sampaio', 'Quitaúna', 'General Miguel Costa', 'Carapicuíba', 'Santa Terezinha', 'Antônio João', 'Barueri', 'Jardim Belval', 'Jardim Silveira', 'Jandira', 'Sagrado Coração', 'Engenheiro Cardoso', 'Itapevi']],
    },
    run: RAIL_RUN,
    service: railWeek(6, 8, 10, 15), patterns: both('Júlio Prestes', 'Itapevi'),
    stock: mix(['8900', 8, 2], ['7000', 8, 1]),
  }),
  line({
    id: '9', system: 'trem', kind: 'rail', name: 'Line 9–Emerald', nameLocal: 'Linha 9–Esmeralda', short: '9', color: '#01A9A7',
    osm: { relations: [419411, 2183694] }, run: { ...RAIL_RUN, trip: { from: 'Osasco', to: 'Varginha', minutes: 60 } },
    service: railWeek(6, 8, 10, 15), patterns: both('Osasco', 'Varginha'),
    stock: mix(['8900', 8, 1]),
  }),
  line({
    id: '10', system: 'trem', kind: 'rail', name: 'Line 10–Turquoise', nameLocal: 'Linha 10–Turquesa', short: '10', color: '#049FC3',
    osm: {
      relations: [420129, 2144048],
      sequences: [['Palmeiras-Barra Funda', 'Luz', 'Brás', 'Juventus - Mooca', 'Ipiranga', 'Tamanduateí', 'São Caetano do Sul', 'Utinga', 'Prefeito Saladino', 'Prefeito Celso Daniel - Santo André', 'Capuava', 'Mauá', 'Guapituba', 'Ribeirão Pires', 'Rio Grande da Serra']],
    },
    run: RAIL_RUN,
    // CPTM's timetable: every 8 min midday, 10 min evenings; at the peaks trains alternate Mauá and Rio Grande da Serra.
    service: {
      weekday: { first: '04:00', last: '00:00', headways: [['04:00', 12], ['05:00', 12], ['08:30', 8], ['16:00', 12], ['19:50', 10]] },
      saturday: { first: '04:00', last: '00:00', headways: [['04:00', 8], ['21:00', 15]] },
      sunday: { first: '04:00', last: '00:00', headways: [['04:00', 15]] },
    },
    groups: { maua: { weekday: { first: '05:00', last: '19:50', headways: [['05:00', 12], ['08:30', 0], ['16:00', 12], ['19:50', 0]] }, saturday: null, sunday: null } },
    patterns: [
      { from: 'Palmeiras-Barra Funda', to: 'Rio Grande da Serra', via: ['Tamanduateí'], share: 1 },
      { from: 'Palmeiras-Barra Funda', to: 'Mauá', via: ['Tamanduateí'], share: 1, group: 'maua' },
    ],
    stock: mix(['8500', 8, 3], ['2070', 8, 1]),
  }),
  line({
    id: '11', system: 'trem', kind: 'rail', name: 'Line 11–Coral', nameLocal: 'Linha 11–Coral', short: '11', color: '#F68368',
    osm: { relations: [2872092, 2875657] }, run: RAIL_RUN,
    service: railWeek(5, 8, 10, 15), patterns: both('Palmeiras-Barra Funda', 'Estudantes'),
    stock: mix(['8000', 8, 3], ['8500', 8, 1]),
  }),
  line({
    id: '12', system: 'trem', kind: 'rail', name: 'Line 12–Sapphire', nameLocal: 'Linha 12–Safira', short: '12', color: '#133C8D',
    osm: { relations: [2877631, 2877632] }, run: RAIL_RUN,
    service: railWeek(7, 10, 12, 15), patterns: both('Brás', 'Calmon Viana'),
    stock: mix(['7000', 8, 2], ['9000', 8, 1], ['8500', 8, 1]),
  }),
  line({
    id: '13', system: 'trem', kind: 'rail', name: 'Line 13–Jade', nameLocal: 'Linha 13–Jade', short: '13', color: '#00B352',
    osm: { relations: [14093037, 14093038, 8447458, 9881313] }, run: RAIL_RUN,
    service: { weekday: { first: '04:00', last: '00:00', headways: [['04:00', 30], ['05:00', 20], ['21:00', 30]] } },
    // Airport Express: hourly from Palmeiras-Barra Funda, stopping at Luz (and Brás toward the city).
    groups: { express: { weekday: { first: '05:00', last: '00:00', headways: [['05:00', 60]] } } },
    patterns: [
      { from: 'Engenheiro Goulart', to: 'Aeroporto-Guarulhos', share: 1 },
      { from: 'Palmeiras-Barra Funda', to: 'Aeroporto-Guarulhos', via: ['Luz'], share: 1, group: 'express', service: ['Airport Express', 'Expresso Aeroporto'] },
    ],
    stock: mix(['2500', 8, 1]),
  }),
];

// Brazil's national holidays plus São Paulo's (city anniversary 25 Jan, state holiday 9 Jul), 2026–27.
const holidays = [
  '2026-01-01', '2026-01-25', '2026-04-03', '2026-04-21', '2026-05-01', '2026-06-04', '2026-07-09', '2026-09-07',
  '2026-10-12', '2026-11-02', '2026-11-15', '2026-11-20', '2026-12-25',
  '2027-01-01', '2027-01-25', '2027-03-26', '2027-04-21', '2027-05-01', '2027-05-27', '2027-07-09', '2027-09-07',
  '2027-10-12', '2027-11-02', '2027-11-15', '2027-11-20', '2027-12-25',
];

await buildSimCity({
  city: 'saopaulo',
  systems: [
    { id: 'metro', name: 'Metrô' },
    { id: 'trem', name: 'Trem Metropolitano' },
  ],
  lines,
  calendar: { holidays },
  names: { local: ['name'], en: ['name'] },
  stations: {
    // OSM spells a few stations two ways; the kit drops the part after a spaced dash, which here is often the name.
    merge: [
      ['Palmeiras-Barra Funda', 'Palmeiras - Barra Funda'],
      ['São Paulo-Morumbi', 'São Paulo – Morumbi'],
    ],
    rename: {
      'Palmeiras-Barra Funda': ['Palmeiras-Barra Funda', 'Palmeiras-Barra Funda'],
      'São Paulo-Morumbi': ['São Paulo-Morumbi', 'São Paulo-Morumbi'],
      'Japão - Liberdade': ['Japão-Liberdade', 'Japão-Liberdade'],
      'Portuguesa - Tietê': ['Portuguesa-Tietê', 'Portuguesa-Tietê'],
      'Santos - Imigrantes': ['Santos-Imigrantes', 'Santos-Imigrantes'],
      'Villa Lobos - Jaguaré': ['Villa-Lobos–Jaguaré', 'Villa-Lobos–Jaguaré'],
      'Santuário Nossa Senhora de Fátima - Sumaré': ['Sumaré', 'Sumaré'],
      'Patriarca • Vila Ré': ['Patriarca-Vila Ré', 'Patriarca-Vila Ré'],
      'AACD – Servidor': ['AACD-Servidor', 'AACD-Servidor'],
      'Prefeito Celso Daniel - Santo André': ['Santo André', 'Santo André'],
      'Juventus - Mooca': ['Juventus-Mooca', 'Juventus-Mooca'],
      'Hebraica - Rebouças': ['Hebraica-Rebouças', 'Hebraica-Rebouças'],
      'Mendes - Vila Natal': ['Mendes-Vila Natal', 'Mendes-Vila Natal'],
      'Primavera - Interlagos': ['Primavera-Interlagos', 'Primavera-Interlagos'],
      'Jardim Helena - Vila Mara': ['Jardim Helena-Vila Mara', 'Jardim Helena-Vila Mara'],
    },
  },
  attribution: ['Service intervals: Metrô SP, CPTM and concessionaires, as published (Tiny Trains estimates)'],
});

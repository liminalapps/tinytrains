import type { StockSpec, StockStripe } from '../types.ts';

// Rome, fall 2026. Metro A runs CAF MA300s; Metro B the CAF MA300/MB400 family plus the last few Breda MB100s;
// Metro C AnsaldoBreda's driverless MC100. Tram 8 runs Fiat Cityway 1 and 2 cars; the Socimi and 1940s Stanga
// cars wait for the rest of the network to reopen. Cotral runs the Roma–Lido with blue CAF MA300 and MA200 sets
// and the Roma–Viterbo with Firema E84 and Alstom MRP 236 units. Colors estimated from photos.

const WHITE = '#F0F0EC';
const GLASS = '#1D2227';
const BLACK = '#17181A';
const ROOF = '#A4A8AB';
const ATAC_RED = '#B3202A';
const SILVER = '#C6C9CB';
const CHARCOAL = '#3A3D40';
const TRAM_GREEN = '#9CC9A0';
const TRAM_DARK = '#3E7D57';
const COTRAL_BLUE = '#1E4DB7';
const COTRAL_RED = '#E0452B';
const TEAL = '#17806F';
const band = (color: StockStripe['color'], from: number, to: number): StockStripe => ({ color, from, to });

const caf = {
  length: 18.0, width: 2.83, height: 3.55, doors: 4, profile: 'box' as const, nose: 'slant' as const, pantograph: true,
};
const greenTram = {
  finish: 'paint' as const, body: TRAM_GREEN, roof: '#D9DDD6', front: TRAM_GREEN, doorColor: TRAM_GREEN,
  windowColor: GLASS, skirt: TRAM_DARK, stripes: [band(TRAM_DARK, 0.0, 0.3), band('#EDE6C8', 0.3, 0.33)],
  frontStripes: [band(TRAM_DARK, 0.0, 0.3)], trolleyPole: false, pantograph: true,
};
const cityway = {
  finish: 'paint' as const, body: SILVER, roof: '#D4D6D6', front: SILVER, doorColor: SILVER, windowColor: GLASS,
  skirt: CHARCOAL, stripes: [band(CHARCOAL, 0.0, 0.28)], frontStripes: [band(CHARCOAL, 0.0, 0.26)], pantograph: true,
};

export const stock: StockSpec[] = [
  {
    id: 'rome-ma300', name: 'MA300 (CAF S/300)', maker: 'CAF', introduced: 2005,
    blurb: 'The CAF trains that rescued Line A in 2005: six walk-through cars and a thin red stripe, built in Beasain and Zaragoza.',
    ...caf, body: WHITE, finish: 'paint', roof: ROOF, front: BLACK, doorColor: WHITE, windowColor: GLASS, skirt: CHARCOAL,
    stripes: [band(ATAC_RED, 0.33, 0.37)], frontStripes: [band(ATAC_RED, 0.3, 0.34)],
  },
  {
    id: 'rome-mb400', name: 'MB400 (CAF S/300)', maker: 'CAF', introduced: 2014,
    blurb: "Line B's workhorse: the second series of CAF's Rome train, with LED lighting and a bigger destination sign up front.",
    ...caf, body: WHITE, finish: 'paint', roof: ROOF, front: BLACK, doorColor: WHITE, windowColor: GLASS, skirt: CHARCOAL,
    stripes: [band(ATAC_RED, 0.33, 0.37)], frontStripes: [band(WHITE, 0.3, 0.33)],
  },
  {
    id: 'rome-mb100', name: 'MB100', maker: 'Breda / Ansaldo / Fiat Ferroviaria', introduced: 1987,
    blurb: "Built for Line B's 1990 run to Rebibbia; only a few of the 31 trains still work, until Hitachi's MB500s arrive.",
    length: 16.9, width: 2.85, height: 3.47, doors: 3, profile: 'box', nose: 'flat', pantograph: true,
    body: '#D2D4D5', finish: 'paint', roof: ROOF, front: '#2A6FD1', doorColor: '#D2D4D5', windowColor: GLASS, skirt: CHARCOAL,
    stripes: [band(ATAC_RED, 0.34, 0.38)], frontStripes: [band('#C8CBCD', 0.0, 0.18)],
  },
  {
    id: 'rome-mc100', name: 'MC100 (Driverless Metro)', maker: 'AnsaldoBreda (Hitachi Rail)', introduced: 2014,
    blurb: "Italy's longest driverless metro: six cars and 109 m with nobody up front, so riders get the front window.",
    length: 18.2, width: 2.85, height: 3.64, doors: 3, profile: 'rounded', nose: 'rounded', pantograph: true,
    body: WHITE, finish: 'paint', roof: ROOF, front: '#26292C', doorColor: WHITE, windowColor: GLASS, skirt: '#55595C',
    stripes: [band('line', 0.12, 0.2)], frontStripes: [band('line', 0.1, 0.2)],
  },
  {
    id: 'rome-cityway1', name: 'Cityway 1 (9100 series)', maker: 'Fiat Ferroviaria', introduced: 1998,
    blurb: 'Bought to open tram 8 to Trastevere in 1998: 28 five-section cars, first green and later repainted silver and gray.',
    length: 31.25, width: 2.4, height: 3.5, doors: 4, profile: 'tram', nose: 'rounded', sections: 5, ...cityway,
  },
  {
    id: 'rome-cityway2', name: 'Cityway 2 (9200 series)', maker: 'Fiat Ferroviaria', introduced: 1999,
    blurb: "Rome's first fully low-floor trams. Two prototypes were stretched to 41 m, never carried riders, and were cut back to 33 m.",
    length: 33.0, width: 2.4, height: 3.5, doors: 5, profile: 'tram', nose: 'rounded', sections: 7, ...cityway,
  },
  {
    id: 'rome-socimi', name: 'Socimi (9000 series)', maker: 'Socimi / AEG', introduced: 1990,
    blurb: 'Delivered in "ministerial orange", these three-section trams now wear the two-tone green of 1930s Roman trams.',
    length: 21.1, width: 2.3, height: 3.42, doors: 4, profile: 'tram', nose: 'flat', sections: 3, ...greenTram,
  },
  {
    id: 'rome-stanga', name: 'Stanga (7000 series)', maker: 'OMS Stanga / TIBB', introduced: 1947,
    blurb: 'Built in 1947–49 and still on the books: one-way articulated trams with doors on the right side only.',
    length: 20.4, width: 2.4, height: 3.3, doors: 3, profile: 'streetcar', nose: 'rounded', sections: 2, ...greenTram,
  },
  {
    id: 'rome-lido-ma300', name: 'MA300 (Cotral)', maker: 'CAF', introduced: 2007,
    blurb: "Nine CAF sets, once ATAC's 'Freccia del Mare', now repainted Cotral blue to carry Romans to the beach at Ostia.",
    ...caf, body: COTRAL_BLUE, finish: 'paint', roof: ROOF, front: COTRAL_BLUE, doorColor: COTRAL_BLUE, windowColor: GLASS,
    skirt: '#1B2B55', stripes: [band(COTRAL_RED, 0.2, 0.26)], frontStripes: [band(COTRAL_RED, 0.18, 0.24)],
  },
  {
    id: 'rome-ma200', name: 'MA200', maker: 'Breda / Fiat Ferroviaria', introduced: 1999,
    blurb: 'Built for Line A in 1999 with walk-through gangways, a novelty then; three rebuilt units now run to Ostia in Cotral blue.',
    length: 17.84, width: 2.85, height: 3.5, doors: 4, profile: 'box', nose: 'flat', pantograph: true,
    body: '#1F47C4', finish: 'paint', roof: ROOF, front: '#1F47C4', doorColor: '#1F47C4', windowColor: GLASS, skirt: '#1B2B55',
    stripes: [band(COTRAL_RED, 0.18, 0.24)], frontStripes: [band(COTRAL_RED, 0.16, 0.22)],
  },
  {
    id: 'rome-e84', name: 'E84 (100 series)', maker: 'Firema / Casaralta / OMS', introduced: 1987,
    blurb: "The first new trains the old Roma Nord line had bought since 1932, three cars under wires out of Piazzale Flaminio's tunnel.",
    length: 21.6, width: 2.8, height: 3.58, doors: 3, profile: 'box', nose: 'flat', pantograph: true,
    body: WHITE, finish: 'paint', roof: ROOF, front: WHITE, doorColor: WHITE, windowColor: GLASS, skirt: '#5A5E61',
    stripes: [band(TEAL, 0.3, 0.38)], frontStripes: [band(TEAL, 0.24, 0.32)],
  },
  {
    id: 'rome-mrp236', name: 'MRP 236 (300 series)', maker: 'Alstom / CostaRail', introduced: 2002,
    blurb: 'Ten three-car units built at Costa Masnaga for the Roma–Viterbo; the first rebuilt one in Cotral colors returned in 2025.',
    length: 20.2, width: 2.9, height: 3.8, doors: 2, profile: 'box', nose: 'slant', pantograph: true,
    body: WHITE, finish: 'paint', roof: ROOF, front: WHITE, doorColor: WHITE, windowColor: GLASS, skirt: '#2F3538',
    stripes: [band(TEAL, 0.12, 0.3)], frontStripes: [band(TEAL, 0.1, 0.26)],
  },
];

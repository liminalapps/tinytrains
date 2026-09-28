import type { StockSpec } from '../types.ts';

// SEPTA and PATCO fleets in passenger service, fall 2026. L: Adtranz M-4 cars in six-car trains (Hitachi M-5s are on
// order). B: Kawasaki B-IV cars. T and D: 1980–81 Kawasaki "K-cars" (Alstom Citadis replacements arrive from 2027).
// G: rebuilt 1947 PCCs, sharing the route with buses. M: ASEA/ABB N-5 cars on third rail. PATCO: Budd and Vickers cars
// rebuilt by Alstom. Regional Rail: Silverliner IV and V EMUs, plus push-pull sets modeled by their coaches.

const GLASS = '#1B2229';
const STAINLESS = '#C6CACD';
const SEPTA_RED = '#D2202F';
const SEPTA_BLUE = '#1F3E8C';
const CREAM = '#EFE8D4';
const DARK = '#2A2D30';

/** Stainless sides with a red-over-blue belt band, the 1980s–90s SEPTA look most rail cars still wear. */
const SEPTA_STAINLESS = {
  finish: 'stainless',
  body: STAINLESS,
  roof: '#9DA3A8',
  front: '#BDC2C6',
  doorColor: STAINLESS,
  windowColor: GLASS,
  skirt: '#3A3D40',
  stripes: [
    { color: SEPTA_RED, from: 0.42, to: 0.46 },
    { color: SEPTA_BLUE, from: 0.46, to: 0.52 },
  ],
  frontStripes: [
    { color: SEPTA_RED, from: 0.42, to: 0.46 },
    { color: SEPTA_BLUE, from: 0.46, to: 0.52 },
  ],
} satisfies Partial<StockSpec>;

/** Kawasaki K-car livery: cream with red and blue bands under the windows and a dark window band. */
const K_CAR = {
  height: 3.61,
  doors: 3,
  profile: 'tram',
  nose: 'flat',
  body: CREAM,
  finish: 'paint',
  roof: '#A9AEB2',
  front: CREAM,
  doorColor: '#D8D2BF',
  windowColor: GLASS,
  skirt: DARK,
  stripes: [
    { color: SEPTA_BLUE, from: 0.3, to: 0.36 },
    { color: SEPTA_RED, from: 0.38, to: 0.44 },
  ],
  frontStripes: [
    { color: SEPTA_BLUE, from: 0.3, to: 0.36 },
    { color: SEPTA_RED, from: 0.38, to: 0.44 },
  ],
  sections: 2,
} satisfies Partial<StockSpec>;

/** Regional Rail Silverliners: 85 ft cars with a pantograph on the roof. */
const SILVERLINER = { length: 25.9, doors: 2, profile: 'box', nose: 'flat', pantograph: true } as const;

/** PATCO: 67 ft Budd-design stainless cars, rebuilt 2013–2019, with a red band. */
const PATCO = {
  length: 20.42,
  width: 3.05,
  height: 3.7,
  doors: 2,
  profile: 'box',
  nose: 'flat',
  finish: 'stainless',
  body: STAINLESS,
  roof: '#A0A6AB',
  front: '#26292C',
  doorColor: STAINLESS,
  windowColor: GLASS,
  stripes: [{ color: 'line', from: 0.44, to: 0.5 }],
  frontStripes: [{ color: 'line', from: 0.9, to: 0.97 }],
  pantograph: false,
} satisfies Partial<StockSpec>;

export const stock: StockSpec[] = [
  // ------------------------------------------------------------------------------------------------ L
  {
    ...SEPTA_STAINLESS,
    id: 'philadelphia-m4',
    name: 'M-4',
    maker: 'Adtranz',
    introduced: 1997,
    blurb: 'Bodies built in Dandenong, Australia, and finished in Elmira, New York. The L runs on a rare 5 ft 2½ in trolley gauge.',
    length: 16.8,
    width: 2.8,
    height: 3.66,
    doors: 3,
    profile: 'box',
    nose: 'flat',
    front: '#2B2F33',
    stripes: [{ color: 'line', from: 0.44, to: 0.52 }],
    frontStripes: [{ color: 'line', from: 0.06, to: 0.14 }],
    pantograph: false,
  },

  // ------------------------------------------------------------------------------------------------ B
  {
    ...SEPTA_STAINLESS,
    id: 'philadelphia-b4',
    name: 'B-IV',
    maker: 'Kawasaki',
    introduced: 1982,
    blurb: "Kawasaki's 125 B-IVs run every B train, including the B2 expresses on the inner tracks of four-track Broad Street.",
    length: 20.57,
    width: 3.09,
    height: 3.73,
    doors: 3,
    profile: 'box',
    nose: 'flat',
    front: STAINLESS,
    stripes: [{ color: 'line', from: 0.4, to: 0.47 }],
    frontStripes: [{ color: 'line', from: 0.4, to: 0.47 }],
    pantograph: false,
  },

  // ------------------------------------------------------------------------------------------------ T, D
  {
    ...K_CAR,
    id: 'philadelphia-klrv',
    name: 'Kawasaki LRV (Series 9000)',
    maker: 'Kawasaki',
    introduced: 1980,
    blurb: "Kawasaki's first rail cars for America. Single-ended, they turn on street loops and still raise trolley poles.",
    length: 15.24,
    width: 2.59,
    pantograph: false,
    trolleyPole: true,
  },
  {
    ...K_CAR,
    id: 'philadelphia-dlrv',
    name: 'Kawasaki LRV (Series 100)',
    maker: 'Kawasaki',
    introduced: 1981,
    blurb: 'The 29 double-ended cars of the old Red Arrow lines: pantographs, not poles, and 62 mph on private right-of-way.',
    length: 16.15,
    width: 2.69,
    pantograph: true,
  },

  // ------------------------------------------------------------------------------------------------ G
  {
    id: 'philadelphia-pcc3',
    name: 'PCC III',
    maker: 'St. Louis Car / SEPTA',
    introduced: 2024,
    blurb: 'Built in 1947, rebuilt by Brookville in 2003 and again in SEPTA’s own Woodland shop to bring trolleys back to Girard Ave.',
    length: 14.17,
    width: 2.44,
    height: 3.35,
    doors: 2,
    profile: 'streetcar',
    nose: 'rounded',
    body: '#1E6B3A',
    finish: 'paint',
    roof: '#B9BEC2',
    front: CREAM,
    doorColor: CREAM,
    windowColor: GLASS,
    skirt: '#1E1F21',
    stripes: [
      { color: CREAM, from: 0.46, to: 0.93 },
      { color: '#C9A227', from: 0.44, to: 0.46 },
    ],
    frontStripes: [{ color: '#1E6B3A', from: 0, to: 0.44 }],
    pantograph: false,
    trolleyPole: true,
  },
  {
    id: 'philadelphia-bus',
    name: 'New Flyer Xcelsior hybrid bus',
    maker: 'New Flyer',
    introduced: 2017,
    blurb: 'Stands in for trolleys when they are short: most trips on the G still run as a bus along the rails of Girard Avenue.',
    length: 12.5,
    width: 2.59,
    height: 3.35,
    doors: 2,
    profile: 'box',
    nose: 'flat',
    body: '#F2F2EF',
    finish: 'paint',
    roof: '#D6D8D8',
    front: '#1E2124',
    doorColor: '#2B2E31',
    windowColor: GLASS,
    skirt: '#2B2E31',
    stripes: [
      { color: SEPTA_BLUE, from: 0.1, to: 0.2 },
      { color: SEPTA_RED, from: 0.2, to: 0.26 },
    ],
    frontStripes: [{ color: SEPTA_BLUE, from: 0.05, to: 0.18 }],
    pantograph: false,
  },

  // ------------------------------------------------------------------------------------------------ M
  {
    ...SEPTA_STAINLESS,
    id: 'philadelphia-n5',
    name: 'N-5',
    maker: 'ASEA Brown Boveri',
    introduced: 1993,
    blurb: 'Third-rail cars for the old Philadelphia & Western interurban, crossing a long trestle into Norristown at 55 mph.',
    length: 16.0,
    width: 2.87,
    height: 3.66,
    doors: 2,
    profile: 'box',
    nose: 'slant',
    front: '#2B2F33',
    pantograph: false,
  },

  // ------------------------------------------------------------------------------------------------ PATCO
  {
    ...PATCO,
    id: 'philadelphia-patco-1',
    name: 'PATCO I (rebuilt)',
    maker: 'Budd / Alstom',
    introduced: 1969,
    blurb: 'Built by Budd in Philadelphia for the line across the Ben Franklin Bridge; their design led to the LIRR’s M1 cars.',
  },
  {
    ...PATCO,
    id: 'philadelphia-patco-2',
    name: 'PATCO II (rebuilt)',
    maker: 'Vickers Canada / Alstom',
    introduced: 1980,
    blurb: 'Built under license from Budd in 1980, with no stainless shroud below the doors. Alstom rebuilt all 120 cars by 2019.',
    skirt: '#3A3D40',
  },

  // ------------------------------------------------------------------------------------------------ Regional Rail
  {
    ...SEPTA_STAINLESS,
    ...SILVERLINER,
    id: 'philadelphia-silverliner-4',
    name: 'Silverliner IV',
    maker: 'General Electric',
    introduced: 1974,
    blurb: 'Ordered by both the Reading and the Penn Central in the 1970s, and still two-thirds of the Regional Rail fleet.',
    width: 3.04,
    height: 4.39,
  },
  {
    ...SEPTA_STAINLESS,
    ...SILVERLINER,
    id: 'philadelphia-silverliner-5',
    name: 'Silverliner V',
    maker: 'Hyundai Rotem',
    introduced: 2010,
    blurb: 'Final assembly happened in South Philadelphia. Quarter-point doors speed boarding at the high platforms downtown.',
    width: 3.2,
    height: 4.47,
    front: '#2B2F33',
    stripes: [
      { color: SEPTA_RED, from: 0.36, to: 0.4 },
      { color: '#FFFFFF', from: 0.4, to: 0.42 },
      { color: SEPTA_BLUE, from: 0.42, to: 0.48 },
    ],
    frontStripes: [
      { color: SEPTA_RED, from: 0.36, to: 0.4 },
      { color: SEPTA_BLUE, from: 0.42, to: 0.48 },
    ],
  },
  {
    ...SEPTA_STAINLESS,
    id: 'philadelphia-pushpull',
    name: 'Push-pull coach (Bombardier), ACS-64 hauled',
    maker: 'Bombardier',
    introduced: 1987,
    blurb: 'Comet-style coaches pushed or pulled by a Siemens ACS-64, used mostly on peak expresses as they accelerate slower.',
    length: 25.9,
    width: 3.2,
    height: 3.99,
    doors: 2,
    profile: 'box',
    nose: 'flat',
    pantograph: false,
  },
];

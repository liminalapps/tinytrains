import type { StockSpec } from '../types.ts';

// MBTA rail fleets in passenger service, fall 2026. Red Line: four car classes in married pairs, run as 6-car
// trains (some 4). Orange Line: all-CRRC since 2022. Blue Line: Siemens cars that switch from third rail to
// overhead wire at Airport. Green Line: Type 7/8 pairs and Type 9s (the Type 10 "supercars" start in 2027).
// Mattapan: 1940s PCC trolleys. Commuter Rail: diesel push-pull trains of bilevel coaches, modeled by the coach
// class of the cab car (the locomotive pushes from the far end).

const RED = '#DA291C';
const ORANGE = '#ED8B00';
const BLUE = '#003DA5';
const GREEN = '#00843D';
const CR_PURPLE = '#80276C';
const CR_YELLOW = '#F2C230';
const GLASS = '#1B2229';
const STAINLESS = '#C4C9CD';
const WHITE_PAINT = '#EDEBE5';
const BLACK_FACE = '#1E2023';

/** Red Line: 69 ft 6 in cars, 10 ft wide, four doors a side, third rail. */
const RED_CAR = { length: 21.18, width: 3.05, height: 3.66, doors: 4, profile: 'box', nose: 'flat', pantograph: false } as const;

/** The No. 1 and No. 2 cars: painted white with the lower half in Red Line red. */
const RED_OLD = {
  ...RED_CAR,
  body: WHITE_PAINT,
  finish: 'paint',
  roof: '#9CA2A7',
  front: WHITE_PAINT,
  doorColor: RED,
  windowColor: GLASS,
  skirt: '#3A3D40',
  stripes: [{ color: RED, from: 0.08, to: 0.46 }],
  frontStripes: [{ color: RED, from: 0.08, to: 0.46 }],
} satisfies Partial<StockSpec>;

/** CRRC cars built in Springfield: stainless sides, a black cab face outlined in the line color. */
function crrc(color: string) {
  return {
    finish: 'stainless',
    body: STAINLESS,
    roof: '#9FA5AA',
    front: BLACK_FACE,
    doorColor: STAINLESS,
    windowColor: GLASS,
    skirt: '#34373B',
    stripes: [
      { color, from: 0.3, to: 0.4 },
      { color, from: 0.93, to: 0.97 },
    ],
    frontStripes: [
      { color, from: 0.02, to: 0.07 },
      { color, from: 0.94, to: 1 },
    ],
  } satisfies Partial<StockSpec>;
}

/** Green Line LRVs: about 72 ft, 8 ft 8 in wide, articulated, pantograph. */
const LRV = { width: 2.64, height: 3.6, profile: 'tram', nose: 'flat', windowColor: GLASS, pantograph: true } as const;

/** MBTA bilevel coaches: 85 ft 4 in long, 10 ft wide, 15 ft 6 in tall, with a purple and yellow window band. */
const BILEVEL = {
  length: 26.0,
  width: 3.05,
  height: 4.72,
  doors: 2,
  profile: 'bilevel',
  nose: 'flat',
  finish: 'stainless',
  body: '#BCC1C5',
  roof: '#8F959A',
  front: '#B3B8BC',
  doorColor: '#B3B8BC',
  windowColor: GLASS,
  skirt: '#3B3E42',
  stripes: [
    { color: CR_YELLOW, from: 0.5, to: 0.52 },
    { color: CR_PURPLE, from: 0.52, to: 0.72 },
    { color: CR_YELLOW, from: 0.72, to: 0.74 },
  ],
  frontStripes: [
    { color: CR_YELLOW, from: 0.5, to: 0.52 },
    { color: CR_PURPLE, from: 0.52, to: 0.72 },
  ],
  pantograph: false,
} satisfies Partial<StockSpec>;

export const stock: StockSpec[] = [
  // ------------------------------------------------------------------------------------------------ Red Line
  {
    ...RED_OLD,
    id: 'boston-red-1',
    name: 'No. 1 Red Line car (01500/01600)',
    maker: 'Pullman-Standard',
    introduced: 1969,
    blurb: 'Nicknamed "Silverbirds" for their bare aluminum when new in 1969. The few left are the oldest cars on the Red Line.',
    width: 3.1,
  },
  {
    ...RED_OLD,
    id: 'boston-red-2',
    name: 'No. 2 Red Line car (01700)',
    maker: 'UTDC',
    introduced: 1988,
    blurb: 'Built in Canada by UTDC and delivered in 1987–88, just as the Red Line began running six-car trains.',
  },
  {
    ...RED_CAR,
    id: 'boston-red-3',
    name: 'No. 3 Red Line car (01800)',
    maker: 'Bombardier',
    introduced: 1993,
    blurb: 'Assembled in Barre, Vermont. Pair 1802–1803 lost its seats to become the "Big Red" cars, a first for US heavy rail.',
    finish: 'stainless',
    body: STAINLESS,
    roof: '#A1A7AC',
    front: '#BCC1C5',
    doorColor: STAINLESS,
    windowColor: GLASS,
    skirt: '#3A3D40',
    stripes: [{ color: RED, from: 0.22, to: 0.46 }],
    frontStripes: [{ color: RED, from: 0.22, to: 0.46 }],
  },
  {
    ...RED_CAR,
    ...crrc(RED),
    id: 'boston-red-4',
    name: 'No. 4 Red Line car (CRRC)',
    maker: 'CRRC MA',
    introduced: 2019,
    blurb: 'Assembled in Springfield, Massachusetts, in a new plant on the site of the old New England Westinghouse works.',
    length: 21.28,
  },

  // ------------------------------------------------------------------------------------------------ Orange Line
  {
    ...crrc(ORANGE),
    id: 'boston-orange-crrc',
    name: 'Orange Line car (CRRC)',
    maker: 'CRRC MA',
    introduced: 2019,
    blurb: 'When the Orange Line reopened after its 30-day shutdown in September 2022, these new cars ran almost every trip.',
    length: 19.81,
    width: 2.82,
    height: 3.6,
    doors: 3,
    profile: 'box',
    nose: 'flat',
    pantograph: false,
  },

  // ------------------------------------------------------------------------------------------------ Blue Line
  {
    id: 'boston-blue-siemens',
    name: 'Blue Line car (0700)',
    maker: 'Siemens',
    introduced: 2008,
    blurb: 'The only MBTA subway cars with a pantograph: they switch from third rail to overhead wire at Airport, where ice is a risk.',
    length: 14.63,
    width: 2.82,
    height: 3.5,
    doors: 2,
    profile: 'box',
    nose: 'flat',
    body: '#D3D6D9',
    finish: 'stainless',
    roof: '#A7ADB2',
    front: '#D0D3D6',
    doorColor: '#D3D6D9',
    windowColor: GLASS,
    skirt: '#3A3D40',
    stripes: [{ color: BLUE, from: 0.26, to: 0.44 }],
    frontStripes: [{ color: BLUE, from: 0.26, to: 0.44 }],
    pantograph: true,
  },

  // ------------------------------------------------------------------------------------------------ Green Line
  {
    ...LRV,
    id: 'boston-type7',
    name: 'Type 7 LRV',
    maker: 'Kinki Sharyo',
    introduced: 1986,
    blurb: 'The first cars Kinki Sharyo built for a US transit agency. Drivers run them with car-like foot pedals for power and brakes.',
    length: 22.56,
    height: 3.61,
    doors: 4,
    body: '#EEF0EE',
    finish: 'paint',
    roof: '#AEB3B7',
    front: '#EEF0EE',
    doorColor: GREEN,
    skirt: '#2B2E30',
    stripes: [{ color: GREEN, from: 0.06, to: 0.47 }],
    frontStripes: [{ color: GREEN, from: 0.06, to: 0.47 }],
    sections: 2,
  },
  {
    ...LRV,
    id: 'boston-type8',
    name: 'Type 8 LRV',
    maker: 'AnsaldoBreda',
    introduced: 1999,
    blurb: "Boston's first low-floor streetcars. Most run coupled to a Type 7, so every two-car train has one step-free car.",
    length: 22.56,
    doors: 3,
    body: '#C9CDD0',
    finish: 'paint',
    roof: '#D9DCDE',
    front: '#2B2F33',
    doorColor: '#BEC2C6',
    skirt: GREEN,
    stripes: [{ color: GREEN, from: 0.1, to: 0.16 }],
    frontStripes: [{ color: GREEN, from: 0.04, to: 0.38 }],
    sections: 3,
  },
  {
    ...LRV,
    id: 'boston-type9',
    name: 'Type 9 LRV',
    maker: 'CAF USA',
    introduced: 2018,
    blurb: 'The first light rail cars in the US with crash energy management: crumple zones that protect the driver and riders.',
    length: 21.95,
    doors: 4,
    body: '#C8CCCF',
    finish: 'paint',
    roof: '#D6D9DB',
    front: '#1F2226',
    doorColor: '#BFC3C7',
    skirt: '#2E3134',
    stripes: [
      { color: GREEN, from: 0.3, to: 0.33 },
      { color: GREEN, from: 0.48, to: 0.88 },
    ],
    frontStripes: [{ color: GREEN, from: 0.08, to: 0.38 }],
    sections: 3,
  },

  // ------------------------------------------------------------------------------------------------ Mattapan
  {
    id: 'boston-pcc',
    name: 'PCC streetcar (Mattapan)',
    maker: 'Pullman-Standard',
    introduced: 1945,
    blurb: 'Built in 1945–46 and in Boston service ever since. A jet-engine snowblower called "Snowzilla" clears their line.',
    length: 14.17,
    width: 2.54,
    height: 3.12,
    doors: 2,
    profile: 'streetcar',
    nose: 'rounded',
    body: '#F0A01E',
    finish: 'paint',
    roof: '#B9BEC2',
    front: '#F0A01E',
    doorColor: '#F0A01E',
    windowColor: GLASS,
    skirt: '#1E1F21',
    stripes: [
      { color: '#C8202A', from: 0.5, to: 0.53 },
      { color: '#EFE3BE', from: 0.53, to: 0.93 },
    ],
    frontStripes: [
      { color: '#C8202A', from: 0.5, to: 0.53 },
      { color: '#EFE3BE', from: 0.53, to: 0.93 },
    ],
    pantograph: false,
    trolleyPole: true,
  },

  // ------------------------------------------------------------------------------------------------ Commuter Rail
  {
    ...BILEVEL,
    id: 'boston-cr-rotem',
    name: 'Rotem bilevel coach (CTC-5 / BTC-4D)',
    maker: 'Hyundai Rotem',
    introduced: 2014,
    blurb: 'Seats 173 to 179 on three floor levels: upper and lower decks plus small mezzanines over the trucks at each end.',
  },
  {
    ...BILEVEL,
    id: 'boston-cr-kawasaki',
    name: 'Kawasaki bilevel coach (CTC-4 / BTC-4)',
    maker: 'Kawasaki',
    introduced: 1990,
    blurb: "The MBTA's first double-deckers, from 1990. Alstom rebuilt all of them between 2014 and 2021.",
    body: '#B7BCC0',
  },
];

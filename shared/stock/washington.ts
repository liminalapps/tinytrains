import type { StockSpec } from '../types.ts';

// Washington Metrorail cars in passenger service, fall 2026. Every series is 75 ft long, 10 ft 1¾ in wide and
// 10 ft 10 in tall, with three doors a side and third-rail power. The Kawasaki 7000-series is about 60% of the
// fleet; the Alstom 6000s and the last Breda 3000s (retiring by early 2027) keep the original look: brushed
// aluminum with a bronze-brown window band and brown cab ends. Hitachi's 8000-series arrives in late 2027.

const GLASS = '#1B2127';
const ALUMINUM = '#C9CDD0';
const METRO_BROWN = '#5A3B2C';

const METRO_CAR = { length: 22.86, width: 3.09, height: 3.3, doors: 3, profile: 'box', nose: 'flat', windowColor: GLASS, pantograph: false } as const;

/** The original Metro look, kept by the 3000- and 6000-series. */
const CLASSIC = {
  ...METRO_CAR,
  finish: 'stainless',
  body: ALUMINUM,
  roof: '#A5ABAF',
  front: METRO_BROWN,
  doorColor: ALUMINUM,
  skirt: '#3C3E41',
  stripes: [{ color: METRO_BROWN, from: 0.5, to: 0.86 }],
} satisfies Partial<StockSpec>;

export const stock: StockSpec[] = [
  {
    ...METRO_CAR,
    id: 'washington-7000',
    name: '7000-series',
    maker: 'Kawasaki',
    introduced: 2015,
    blurb: "Built in Lincoln, Nebraska. Only the even-numbered cars have a driver's cab; the odd ones make do with small hostler controls.",
    finish: 'stainless',
    body: '#C6CACE',
    roof: '#9FA5AA',
    front: '#2A2C30',
    doorColor: '#BEC3C7',
    skirt: '#34373A',
    frontStripes: [{ color: '#B9BEC2', from: 0.9, to: 0.97 }],
  },
  {
    ...CLASSIC,
    id: 'washington-6000',
    name: '6000-series',
    maker: 'Alstom',
    introduced: 2006,
    blurb: 'Body shells from Barcelona, assembled in Hornell, New York. The first set carried riders from Greenbelt to Branch Avenue in 2006.',
  },
  {
    ...CLASSIC,
    id: 'washington-3000',
    name: '3000-series',
    maker: 'Breda',
    introduced: 1987,
    blurb: 'Built by Breda of Italy and rebuilt by Alstom in the 2000s. They are the oldest cars on Metrorail, and the last retire in early 2027.',
    body: '#C4C8CB',
  },
];

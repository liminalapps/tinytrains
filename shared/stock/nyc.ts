import type { StockSpec } from '../types.ts';

// NYC Subway and Staten Island Railway cars in passenger service, fall 2026. All run on third rail
// (no pantographs) and have flat cab ends with a center storm door. A Division (numbered lines):
// 51 ft cars, about 8 ft 9 in wide, 3 doors a side. B Division (lettered lines, SIR): 60 or 75 ft
// cars, 10 ft wide, 4 doors a side. Bodies are unpainted stainless steel; the cab ends are
// fiberglass bonnets. Modern route signs are an LED band above the storm door. The R211s' blue
// door panels are only next to the cab, so their doors stay stainless here.

const STAINLESS = '#C4C9CE';
const ROOF = '#A3A8AD';
const OLD_ROOF = '#8E9398';
const GLASS = '#1C242C';
const BLACK_MASK = '#1B1C1F';
const SILVER_BONNET = '#B7BCC1';
const R211_NAVY = '#1F3585';
const ROUTE_SIGN = [{ color: 'line' as const, from: 0.87, to: 0.93 }];

const base = {
  profile: 'box',
  nose: 'flat',
  finish: 'stainless',
  body: STAINLESS,
  doorColor: STAINLESS,
  windowColor: GLASS,
  pantograph: false,
} as const;

const IRT = { length: 15.65, width: 2.62, height: 3.62, doors: 3 } as const;
const B60 = { length: 18.35, width: 2.98, height: 3.67, doors: 4 } as const;
const B75 = { length: 22.77, width: 3.05, height: 3.68, doors: 4 } as const;

export const stock: StockSpec[] = [
  // A Division
  {
    ...base,
    ...IRT,
    id: 'nyc-r62',
    name: 'R62',
    maker: 'Kawasaki',
    introduced: 1984,
    blurb: 'Built by Kawasaki in Kobe, Japan, and shipped to New York, where they broke down far less often than the cars before them.',
    length: 15.56,
    roof: OLD_ROOF,
    front: SILVER_BONNET,
  },
  {
    ...base,
    ...IRT,
    id: 'nyc-r62a',
    name: 'R62A',
    maker: 'Bombardier',
    introduced: 1985,
    blurb: 'On the 6, R62As light up a green circle for local or a red diamond for express next to the route sign.',
    length: 15.56,
    roof: OLD_ROOF,
    front: SILVER_BONNET,
  },
  {
    ...base,
    ...IRT,
    id: 'nyc-r142',
    name: 'R142',
    maker: 'Bombardier',
    introduced: 2000,
    blurb: 'With the R142A, the first NYC cars built with recorded station announcements meant for the long haul.',
    width: 2.68,
    roof: ROOF,
    front: BLACK_MASK,
    frontStripes: ROUTE_SIGN,
  },
  {
    ...base,
    ...IRT,
    id: 'nyc-r142a',
    name: 'R142A',
    maker: 'Kawasaki',
    introduced: 2000,
    blurb: "Kawasaki's twin of the R142. Kawasaki rebuilt 380 of them in Yonkers into R188s for the 7's new signals.",
    roof: ROOF,
    front: BLACK_MASK,
    frontStripes: ROUTE_SIGN,
  },
  {
    ...base,
    ...IRT,
    id: 'nyc-r188',
    name: 'R188',
    maker: 'Kawasaki',
    introduced: 2013,
    blurb: 'The only 11-car trains in the subway. For one week in 2020, their announcements were voiced by Awkwafina.',
    roof: ROOF,
    front: BLACK_MASK,
    frontStripes: ROUTE_SIGN,
  },
  // B Division
  {
    ...base,
    ...B60,
    id: 'nyc-r143',
    name: 'R143',
    maker: 'Kawasaki',
    introduced: 2001,
    blurb: "The subway's first fleet built for computer-driven (CBTC) trains, which made the L NYC's first automated line.",
    roof: ROOF,
    front: BLACK_MASK,
    frontStripes: ROUTE_SIGN,
  },
  {
    ...base,
    ...B60,
    id: 'nyc-r160',
    name: 'R160',
    maker: 'Alstom / Kawasaki',
    introduced: 2006,
    blurb: 'At 1,662 cars, the biggest car class running in the subway, split between Alstom (R160A) and Kawasaki (R160B).',
    roof: ROOF,
    front: BLACK_MASK,
    frontStripes: ROUTE_SIGN,
  },
  {
    ...base,
    ...B60,
    id: 'nyc-r179',
    name: 'R179',
    maker: 'Bombardier',
    introduced: 2017,
    blurb: 'Built by Bombardier in La Pocatière, Quebec, and Plattsburgh, New York, and coupled in sets of four or five cars.',
    length: 18.44,
    width: 3.01,
    roof: ROOF,
    front: BLACK_MASK,
    frontStripes: ROUTE_SIGN,
  },
  {
    ...base,
    ...B60,
    id: 'nyc-r211a',
    name: 'R211A',
    maker: 'Kawasaki',
    introduced: 2023,
    blurb: "Its 58-inch doors are 8 inches wider than older cars' doors, so crowds get on and off faster.",
    width: 3.05,
    height: 3.66,
    roof: ROOF,
    front: R211_NAVY,
    frontStripes: [{ color: '#E4E7EA', from: 0, to: 0.2 }],
  },
  {
    ...base,
    ...B60,
    id: 'nyc-r211t',
    name: 'R211T',
    maker: 'Kawasaki',
    introduced: 2024,
    blurb: "NYC's first open-gangway train since the BMT's Triplex cars: you can walk from one end of the train to the other.",
    width: 3.05,
    height: 3.66,
    roof: ROOF,
    front: '#26292E',
    frontStripes: [{ color: '#E4E7EA', from: 0, to: 0.2 }],
  },
  {
    ...base,
    ...B60,
    id: 'nyc-r211s',
    name: 'R211S',
    maker: 'Kawasaki',
    introduced: 2024,
    blurb: "Staten Island's first new cars in 50 years. By September 2025 they had replaced every one of the railway's R44s.",
    width: 3.05,
    height: 3.66,
    roof: ROOF,
    front: R211_NAVY,
    frontStripes: [{ color: '#E4E7EA', from: 0, to: 0.2 }],
  },
  {
    ...base,
    ...B75,
    id: 'nyc-r46',
    name: 'R46',
    maker: 'Pullman-Standard',
    introduced: 1975,
    blurb: "The subway's oldest cars in service. Two arrived in 1976 numbered '1776' and '1976' for the US Bicentennial.",
    roof: OLD_ROOF,
    front: SILVER_BONNET,
  },
  {
    ...base,
    ...B75,
    id: 'nyc-r68',
    name: 'R68',
    maker: 'Westinghouse-Amrail',
    introduced: 1986,
    blurb: "Built in France. The first car couldn't get around a sharp curve on its delivery route, so the curve was rebuilt.",
    roof: OLD_ROOF,
    front: '#A9AEB3',
  },
  {
    ...base,
    ...B75,
    id: 'nyc-r68a',
    name: 'R68A',
    maker: 'Kawasaki',
    introduced: 1988,
    blurb: 'Built by Kawasaki in Kobe, Japan, from a mix of American and Japanese parts. Each car is 75 feet long.',
    roof: OLD_ROOF,
    front: '#A9AEB3',
  },
];

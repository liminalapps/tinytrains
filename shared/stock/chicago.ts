import type { StockSpec } from '../types.ts';

// CTA 'L' cars in passenger service, fall 2026. Every series shares one envelope: 48 ft long, 9 ft 4 in wide at the
// window sills, 12 ft tall, two doors a side, married pairs on third rail, stainless steel sides with fiberglass cab
// bonnets. Trains run 2 to 8 cars. The Blue Line is mostly 7000-series now; 2600s and 3200s hold on on the
// Brown and Orange Lines, and the 5000-series runs the Red, Green, Pink, Purple and Yellow Lines.

const STAINLESS = '#C3C8CC';
const GLASS = '#1B2229';

const L_CAR = {
  length: 14.63,
  width: 2.84,
  height: 3.66,
  doors: 2,
  profile: 'box',
  nose: 'flat',
  finish: 'stainless',
  body: STAINLESS,
  roof: '#A0A6AB',
  doorColor: STAINLESS,
  windowColor: GLASS,
  skirt: '#35383C',
  pantograph: false,
} as const;

export const stock: StockSpec[] = [
  {
    ...L_CAR,
    id: 'chicago-7000',
    name: '7000-series',
    maker: 'CRRC Sifang America',
    introduced: 2021,
    blurb: "Finished in Hegewisch on the city's Far South Side: the first CTA cars built in Chicago in more than 50 years.",
    front: '#1F66D1',
  },
  {
    ...L_CAR,
    id: 'chicago-5000',
    name: '5000-series',
    maker: 'Bombardier',
    introduced: 2011,
    blurb: 'The first L cars with AC motors, built in Plattsburgh, New York. Mostly sideways seats leave more room to stand.',
    front: '#C9CDD1',
  },
  {
    ...L_CAR,
    id: 'chicago-3200',
    name: '3200-series',
    maker: 'Morrison-Knudsen',
    introduced: 1992,
    blurb: 'Bought to open the Orange Line to Midway in 1993. Cars 3441–3456 once wore pantographs for the Skokie Swift.',
    front: '#BEC3C7',
    body: '#BCC1C5',
  },
  {
    ...L_CAR,
    id: 'chicago-2600',
    name: '2600-series',
    maker: 'Budd Company',
    introduced: 1981,
    blurb: 'Car 3200, finished on April 3, 1987, was the last railcar the Budd Company of Philadelphia ever built.',
    front: '#C4C8CC',
    roof: '#979DA2',
  },
];

import type { StockSpec, StockStripe } from '../types.ts';

// Amsterdam (GVB), fall 2026. Metro: Alstom M5 six-car trains (the only type on the Noord/Zuidlijn), CAF M7 three-car
// units usually run in pairs, and the last CAF M4 units from 1997 (due to go around 2027); the metro wears R-net gray
// with red doors, the M4 GVB white and blue. Trams: Siemens Combino (13G) and CAF Urbos 100 (15G), GVB white and
// blue, with the Amsteltram's 15Gs in R-net gray. Colors estimated from photos.

const WHITE = '#F3F4F2';
const GVB_BLUE = '#1D5CA8';
const RNET_GRAY = '#C5C8CA';
const RNET_RED = '#D8232A';
const BLACK = '#18191B';
const GLASS = '#1D2227';
const ROOF = '#A4A8AC';
const band = (color: StockStripe['color'], from: number, to: number): StockStripe => ({ color, from, to });

const rnetMetro = {
  body: RNET_GRAY,
  finish: 'stainless' as const,
  roof: ROOF,
  front: BLACK,
  doorColor: RNET_RED,
  windowColor: GLASS,
  skirt: '#3B3E42',
  frontStripes: [band(RNET_RED, 0.3, 0.34)],
  pantograph: false,
};

const gvbTram = {
  body: WHITE,
  finish: 'paint' as const,
  roof: '#D7DADC',
  front: WHITE,
  doorColor: '#E3E5E6',
  windowColor: GLASS,
  skirt: GVB_BLUE,
  stripes: [band(GVB_BLUE, 0, 0.3), band(GVB_BLUE, 0.93, 0.98)],
  frontStripes: [band(GVB_BLUE, 0, 0.26), band(GVB_BLUE, 0.9, 0.98)],
  pantograph: true,
};

export const stock: StockSpec[] = [
  {
    id: 'amsterdam-m5', name: 'M5', maker: 'Alstom', introduced: 2013,
    blurb: 'Six cars and 116 m long: the M5 is the only train on the Noord/Zuidlijn, which opened under the IJ in July 2018.',
    length: 19.4, width: 3.0, height: 3.77, doors: 4, profile: 'box', nose: 'flat', ...rnetMetro,
  },
  {
    id: 'amsterdam-m7', name: 'M7', maker: 'CAF', introduced: 2023,
    blurb: 'Half an M5: three cars and 60 m, so trains can run short at quiet times and as coupled pairs at rush hour.',
    length: 19.9, width: 3.0, height: 3.8, doors: 4, profile: 'box', nose: 'flat', ...rnetMetro,
  },
  {
    id: 'amsterdam-m4', name: 'M4', maker: 'CAF', introduced: 1997,
    blurb: 'Built for the Ringlijn in 1996–97; its little pantograph is only for shunting at the depot. Up to three units run coupled.',
    length: 31.0, width: 2.65, height: 3.6, doors: 4, profile: 'box', nose: 'flat', pantograph: false, sections: 2,
    body: WHITE, finish: 'paint', roof: GVB_BLUE, front: WHITE, doorColor: WHITE, windowColor: GLASS, skirt: GVB_BLUE,
    stripes: [band(GVB_BLUE, 0, 0.22), band(GVB_BLUE, 0.9, 1)], frontStripes: [band(GVB_BLUE, 0, 0.22), band(GVB_BLUE, 0.86, 1)],
  },
  {
    id: 'amsterdam-combino', name: 'Combino (13G)', maker: 'Siemens', introduced: 2002,
    blurb: "Built with a conductor's booth. Since 2020 line 26 runs them coupled in 60 m pairs through the Piet Hein tunnel to IJburg.",
    length: 29.2, width: 2.4, height: 3.51, doors: 4, profile: 'tram', nose: 'rounded', sections: 5, ...gvbTram,
  },
  {
    id: 'amsterdam-15g', name: 'Urbos (15G)', maker: 'CAF', introduced: 2021,
    blurb: 'A two-way tram, so lines like 5 and 19 can turn at simple crossovers; it first carried riders on line 5 in March 2021.',
    length: 30, width: 2.4, height: 3.5, doors: 4, profile: 'tram', nose: 'rounded', sections: 5,
    ...gvbTram, doorColor: GVB_BLUE, front: WHITE,
  },
  {
    id: 'amsterdam-15g-rnet', name: 'Urbos (15G), R-net', maker: 'CAF', introduced: 2020,
    blurb: 'Wears R-net gray and red for the Amsteltram, line 25, which replaced the old sneltram to Amstelveen in December 2020.',
    length: 30, width: 2.4, height: 3.5, doors: 4, profile: 'tram', nose: 'rounded', sections: 5, pantograph: true,
    body: RNET_GRAY, finish: 'paint', roof: '#D2D5D7', front: RNET_GRAY, doorColor: RNET_RED, windowColor: GLASS, skirt: BLACK,
    stripes: [band('#2B2D30', 0, 0.2)], frontStripes: [band('#2B2D30', 0, 0.2)],
  },
];

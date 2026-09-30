import type { StockSpec } from '../types.ts';

// Metrolink's Hemisphere / Peter Saville livery (2008): metallic silver sides, a yellow cab and yellow doors, black
// glazing band and a dark gray underframe skirt.
const YELLOW = '#FFD72E';
const SILVER = '#C9CDD0';
const BLACK = '#1D1F21';

export const stock: StockSpec[] = [
  {
    id: 'manchester-m5000',
    name: 'Bombardier M5000',
    maker: 'Bombardier / Vossloh Kiepe',
    introduced: 2009,
    blurb: "Cousins of Cologne's K5000, built in Bautzen and Vienna. Metrolink is the UK's only tramway that couples trams into doubles.",
    length: 28.4,
    width: 2.65,
    height: 3.4,
    doors: 2, // per body section: four double doors a side in all
    profile: 'tram',
    nose: 'rounded',
    body: SILVER,
    finish: 'paint',
    roof: '#A9AEB2',
    front: YELLOW,
    doorColor: YELLOW,
    windowColor: '#22262A',
    skirt: '#3A3D40',
    stripes: [
      { color: '#3A3D40', from: 0, to: 0.12 },
      { color: BLACK, from: 0.44, to: 0.88 },
    ],
    frontStripes: [{ color: BLACK, from: 0, to: 0.1 }],
    pantograph: true,
    sections: 2,
  },
];

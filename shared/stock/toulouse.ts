import type { StockSpec, StockStripe } from '../types.ts';

// Toulouse, fall 2026. Métro A and B are VAL: driverless, rubber-tired, 2.1 m wide. Line A runs Matra VAL 206s and
// Siemens VAL 208s as coupled 52 m pairs; line B runs 26 m VAL 208s. Tram T1 has Alstom Citadis 302s, and Téléo
// hangs Poma 3S Symphony cabins (styled by Pininfarina) over the Garonne. Colors estimated from photos.

const WHITE = '#F1EFE9';
const GLASS = '#1D2227';
const DARK = '#2A2D31';
const band = (color: StockStripe['color'], from: number, to: number): StockStripe => ({ color, from, to });

export const stock: StockSpec[] = [
  {
    id: 'toulouse-val206', name: 'VAL 206', maker: 'Matra', introduced: 1993,
    blurb: 'The cars that opened line A in 1993 with no driver aboard; since 2019 they run in coupled pairs through 52 m stations.',
    length: 13.1, width: 2.06, height: 3.25, doors: 2, profile: 'box', nose: 'flat', pantograph: false,
    body: WHITE, finish: 'paint', roof: '#E4E1DA', front: '#8E9398', doorColor: WHITE, windowColor: GLASS, skirt: '#3A3C3F',
    stripes: [band(DARK, 0.4, 0.86), band('#E2413A', 0.88, 1)],
    frontStripes: [band(GLASS, 0.42, 0.9), band('#8E9398', 0, 0.42)],
  },
  {
    id: 'toulouse-val208', name: 'VAL 208', maker: 'Siemens', introduced: 2003,
    blurb: 'Siemens’s successor to the VAL 206, with three doors a side per car: it runs all of line B and shares line A.',
    length: 13.0, width: 2.08, height: 3.27, doors: 3, profile: 'rounded', nose: 'rounded', pantograph: false,
    body: WHITE, finish: 'paint', roof: '#E6E4DF', front: WHITE, doorColor: WHITE, windowColor: GLASS, skirt: '#3A3C3F',
    stripes: [band(DARK, 0.38, 0.86), band('#E8742A', 0.88, 1)],
    frontStripes: [band(GLASS, 0.5, 0.92), band('#23359A', 0.3, 0.44)],
  },
  {
    id: 'toulouse-citadis302', name: 'Citadis 302', maker: 'Alstom', introduced: 2010,
    blurb: 'Airbus country shows inside: the seat grab bars are shaped like aircraft wings. T1 runs out past the Airbus plants.',
    length: 32.3, width: 2.4, height: 3.3, doors: 6, profile: 'tram', nose: 'slant', sections: 5, pantograph: true,
    body: '#BCC2C9', finish: 'paint', roof: '#C9CED4', front: '#9DA4AC', doorColor: '#9AA1A9', windowColor: GLASS,
    skirt: '#6C737B', stripes: [band(DARK, 0.42, 0.9), band('#3446A8', 0.2, 0.24), band('#D9B23A', 0.14, 0.17)],
    frontStripes: [band(GLASS, 0.46, 0.92)],
  },
  {
    id: 'toulouse-teleo', name: 'Téléo cabin', maker: 'Poma / Sigma (Pininfarina design)', introduced: 2022,
    blurb: 'Three cables, 34 riders a cabin, pylons up to 70 m tall: Téléo hops the Garonne and Pech David hill in 10 minutes.',
    length: 4.3, width: 2.6, height: 2.7, doors: 1, profile: 'rounded', nose: 'rounded', pantograph: false,
    body: '#7D8EA6', finish: 'paint', roof: '#5F6D80', front: '#7D8EA6', doorColor: '#6E7F97', windowColor: GLASS,
    skirt: '#5A677A', stripes: [band(GLASS, 0.45, 0.95)], frontStripes: [band(GLASS, 0.4, 0.95)],
  },
];

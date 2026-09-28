import type { StockSpec, StockStripe } from '../types.ts';

// Chongqing Rail Transit rolling stock, fall 2026. Dimensions follow the Chinese car-type standards (B: 19 m x 2.8 m,
// As: 19.3 m x 3.0 m) and Hitachi's large straddle monorail (14.6 m intermediate cars, 15.5 m cab cars, 2.98 m wide).
// Liveries estimated from photos on Wikimedia Commons; 'line' stripes take the line color.
const WHITE = '#F1F2F2';
const SILVER = '#C4C8CC';
const ROOF = '#8C9399';
const GLASS = '#1A1F26';
const FACE = '#16191D';
const band = (color: StockStripe['color'], from: number, to: number): StockStripe => ({ color, from, to });

/** Straddle monorail, measured from the top of the beam; the body skirt wraps down around the beam. */
const monorail = { length: 14.9, width: 2.98, height: 3.8, doors: 2, profile: 'monorail' as const, nose: 'rounded' as const, pantograph: false };
/** B2-type steel-wheel car under overhead wire (Lines 1 and 6). */
const bType = { length: 19, width: 2.8, height: 3.8, doors: 4, profile: 'box' as const, pantograph: true };
/** Chongqing's own "mountain" As-type: A-type width on a B-type length, rated for 5% grades. */
const asType = { length: 19.3, width: 3.0, height: 3.8, doors: 4, profile: 'box' as const, pantograph: true };
const painted = (body: string) => ({ finish: 'paint' as const, body, roof: ROOF, doorColor: body, windowColor: GLASS });
const steel = { finish: 'stainless' as const, body: SILVER, roof: ROOF, doorColor: SILVER, windowColor: GLASS };

export const stock: StockSpec[] = [
  // ------------------------------------------------------------------ Monorail (Lines 2 and 3)
  {
    id: 'chongqing-ccd3007', name: 'CCD3007 / CCD3012', maker: 'CRRC Changchun', introduced: 2022,
    blurb: 'Threads the 6th to 8th floors of a 19-story apartment block at Liziba, where the station sits inside the building.',
    ...monorail, ...painted(WHITE), front: FACE, skirt: '#5B6067',
    stripes: [band('#5B6067', 0, 0.3), band('line', 0.4, 0.46), band('#8A7560', 0.46, 0.48)],
    frontStripes: [band('#5B6067', 0, 0.3), band('line', 0.3, 0.36)],
  },
  {
    id: 'chongqing-ccd3007c', name: 'CCD3007C/D (rebuilt QKZ9)', maker: 'CRRC Changchun', introduced: 2024,
    blurb: 'Rebuilt from six-car QKZ9s of 2012 and lengthened to eight cars; the first rebuilt train returned to service in 2024.',
    ...monorail, ...painted('#E9EBEC'), front: '#C6CACE', skirt: '#9CA2A8',
    stripes: [band('#9CA2A8', 0, 0.3), band('line', 0.36, 0.44)],
    frontStripes: [band(FACE, 0.48, 0.92), band('line', 0.4, 0.46)],
  },
  {
    id: 'chongqing-qkz9', name: 'QKZ9', maker: 'CRRC Changchun', introduced: 2012,
    blurb: 'Assembled at the Dayan depot beside the line; its rubber tires climb 6% grades, steeper than steel-wheel metros allow.',
    ...monorail, ...painted('#4B5058'), front: '#B7BCC1', skirt: '#9EA4AA',
    stripes: [band('#9EA4AA', 0, 0.3), band('line', 0.3, 0.33)],
    frontStripes: [band(FACE, 0.48, 0.92), band('line', 0.3, 0.34)],
  },
  {
    id: 'chongqing-l3', name: 'Line 3 monorail', maker: 'CRRC Changchun / Hitachi', introduced: 2011,
    blurb: 'Reaching the airport in 2011 made Line 3 the longest monorail in the world, overtaking the Osaka Monorail.',
    ...monorail, ...painted(WHITE), front: FACE, skirt: '#7D838A',
    stripes: [band('#7D838A', 0, 0.36), band('line', 0.36, 0.44), band('line', 0.95, 1)],
    frontStripes: [band('#7D838A', 0, 0.32), band('line', 0.32, 0.36)],
  },
  // ------------------------------------------------------------------ Steel-wheel metro
  {
    id: 'chongqing-l1', name: 'Line 1 B-type', maker: 'CRRC Changchun', introduced: 2011,
    blurb: 'Its 4.3 km Zhongliangshan Tunnel was once the longest mountain tunnel on any Chinese metro.',
    ...bType, nose: 'rounded', ...steel, front: '#D8261E',
    stripes: [band('line', 0.4, 0.42)],
    frontStripes: [band(FACE, 0.5, 0.9)],
  },
  {
    id: 'chongqing-l6', name: 'Line 6 B-type (DKZ56)', maker: 'CRRC Changchun', introduced: 2012,
    blurb: "With its two branches it is mainland China's longest metro line, crossing both rivers on double-deck bridges.",
    ...bType, nose: 'rounded', ...steel, front: '#E0587E',
    stripes: [band('line', 0.38, 0.41)],
    frontStripes: [band(FACE, 0.5, 0.9)],
  },
  {
    id: 'chongqing-loop', name: 'Loop line As-type', maker: 'CRRC Changchun', introduced: 2018,
    blurb: 'Crosses the Yangtze twice: under the road deck of the Chaotianmen Bridge and on the rail-only Egongyan Bridge.',
    ...asType, nose: 'rounded', ...steel, doorColor: '#D9A92B', front: SILVER,
    stripes: [band('line', 0.3, 0.36)],
    frontStripes: [band(FACE, 0.48, 0.9), band('#C8323C', 0.4, 0.43)],
  },
  {
    id: 'chongqing-l4', name: 'Line 4 As-type', maker: 'CRRC Changchun', introduced: 2018,
    blurb: 'In 2020 its trains began running through onto the Loop and Line 5 as the 4–Loop–5 Express, a first for a Chinese metro.',
    ...asType, nose: 'rounded', ...painted(WHITE), front: '#E4E6E8',
    stripes: [band('line', 0.36, 0.43)],
    frontStripes: [band(FACE, 0.48, 0.9), band('line', 0.36, 0.43)],
  },
  {
    id: 'chongqing-l5', name: 'Line 5 As-type', maker: 'CRRC Qingdao Sifang / CRRC Changchun', introduced: 2017,
    blurb: "China's first 'mountain' metro train rolled out at CRRC Sifang for Line 5 in 2017, built to climb 5% grades.",
    ...asType, nose: 'rounded', ...painted(WHITE), front: '#CDD1D5',
    stripes: [band('line', 0.33, 0.38), band('#1F4E8C', 0.38, 0.4)],
    frontStripes: [band(FACE, 0.48, 0.9), band('line', 0.34, 0.38)],
  },
  {
    id: 'chongqing-l9', name: 'Line 9 As-type', maker: 'CRRC Changchun', introduced: 2022,
    blurb: 'Stops at Hongyancun, which at 116 m underground is the deepest metro station in the world.',
    ...asType, nose: 'rounded', ...painted(WHITE), front: '#E4E6E8',
    stripes: [band('line', 0.42, 0.84)],
    frontStripes: [band(FACE, 0.48, 0.9), band('line', 0.36, 0.44)],
  },
  {
    id: 'chongqing-l10', name: 'DKZ108', maker: 'CRRC Changchun', introduced: 2017,
    blurb: "Links Chongqing North station with Jiangbei Airport's T2 and T3, so every car carries a luggage rack.",
    ...asType, nose: 'rounded', ...steel, body: '#C9C6BF', doorColor: '#C9C6BF', front: '#C9C6BF',
    stripes: [band('line', 0.3, 0.37)],
    frontStripes: [band(FACE, 0.5, 0.9), band('#C8323C', 0.44, 0.46)],
  },
  {
    id: 'chongqing-l18', name: 'CCD5060', maker: 'CRRC Changchun', introduced: 2023,
    blurb: 'Crosses the Yangtze on the Baijusi Bridge, whose cable-stayed main span stretches 660 m.',
    ...asType, nose: 'rounded', ...painted(WHITE), front: '#1C2A48',
    stripes: [band('line', 0.34, 0.42)],
    frontStripes: [band('line', 0.3, 0.42), band(FACE, 0.5, 0.9)],
  },
  {
    id: 'chongqing-jiangtiao', name: 'Jiangtiao dual-voltage As-type', maker: 'CRRC Changchun', introduced: 2022,
    blurb: "Switches between the Jiangtiao line's 25 kV AC and Line 5's 1500 V DC on the move, without stopping.",
    ...asType, nose: 'slant', ...painted(WHITE), front: '#1E5FC8',
    stripes: [band('#1E4E9C', 0.32, 0.36), band('#6FA8E0', 0.36, 0.38)],
    frontStripes: [band(FACE, 0.5, 0.9), band('#FFFFFF', 0.42, 0.46)],
  },
];

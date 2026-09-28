import type { StockSpec, StockStripe } from '../types.ts';

// Hangzhou Metro rolling stock, fall 2026: all built by CRRC Nanjing Puzhen, styled by MBD (Line 1) and Spain's
// LKS Diara (the rest). Liveries from the operator's descriptions quoted on Chinese Wikipedia and photos on Commons.
// Car types: B 19 m x 2.8 m (drum-sided), Hangzhou's own Ah (A-type width on a B-type length), A 22 m x 3.0 m.
const WHITE = '#F1F2F2';
const ROOF = '#9AA1A7';
const GLASS = '#1A1F26';
const BLACK = '#17191C';
const band = (color: StockStripe['color'], from: number, to: number): StockStripe => ({ color, from, to });

const bType = { length: 19, width: 2.8, height: 3.8, doors: 4, profile: 'rounded' as const, pantograph: true };
const ahType = { length: 19.5, width: 3.0, height: 3.8, doors: 4, profile: 'rounded' as const, pantograph: true };
const aType = { length: 22, width: 3.0, height: 3.8, doors: 5, profile: 'rounded' as const, pantograph: true };
const paint = (body: string) => ({ finish: 'paint' as const, body, roof: ROOF, doorColor: body, windowColor: GLASS });
/** Lines 2, 4 and 9: white drum-sided body, black around the windows, thin line-color bands at mid-height and eaves. */
const thinBands = { ...paint(WHITE), front: BLACK, stripes: [band('line', 0.4, 0.43), band(BLACK, 0.48, 0.84), band('line', 0.9, 0.93)], frontStripes: [band('line', 0.3, 0.36)] };
/** Lines 3, 6, 7, 8 and 10: the whole body in the line color, black around windows and doors. */
const fullColor = (color: string) => ({ ...paint(color), doorColor: BLACK, front: color, stripes: [band(BLACK, 0.46, 0.86)], frontStripes: [band(BLACK, 0.48, 0.9)] });

export const stock: StockSpec[] = [
  {
    id: 'hangzhou-l1', name: 'Line 1 B-type (PM0G / PM121 / PM144)', maker: 'CRRC Nanjing Puzhen', introduced: 2012,
    blurb: "Hangzhou's first metro train, styled in France by MBD, with peanut-shaped headlamps and a bold red band.",
    ...bType, profile: 'box', nose: 'slant', ...paint(WHITE), front: WHITE,
    stripes: [band('line', 0.3, 0.42), band(BLACK, 0.46, 0.84)],
    frontStripes: [band(BLACK, 0.48, 0.9), band('line', 0.3, 0.4)],
  },
  {
    id: 'hangzhou-l2', name: 'Line 2 B-type', maker: 'CRRC Nanjing Puzhen', introduced: 2014,
    blurb: "In 2017 it became Hangzhou's first line to open in full, out to the 5,000-year-old Liangzhu ruins.",
    ...bType, nose: 'rounded', ...thinBands,
  },
  {
    id: 'hangzhou-l4', name: 'Line 4 B-type', maker: 'CRRC Nanjing Puzhen', introduced: 2015,
    blurb: "Line 2's train in green; the line curls like a question mark from Puyan to Chihua Street.",
    ...bType, nose: 'rounded', ...thinBands,
  },
  {
    id: 'hangzhou-l9', name: 'Line 9 B-type', maker: 'CRRC Nanjing Puzhen', introduced: 2021,
    blurb: "Began as Line 1's Linping branch and became a line of its own in July 2021.",
    ...bType, nose: 'rounded', ...thinBands,
  },
  {
    id: 'hangzhou-l3', name: 'Line 3 Ah-type', maker: 'CRRC Nanjing Puzhen', introduced: 2022,
    blurb: "Hangzhou's own Ah type puts an A-type body width on a B-type length; Line 3 paints it lemon yellow.",
    ...ahType, nose: 'rounded', ...fullColor('#F4CF1F'),
  },
  {
    id: 'hangzhou-l5', name: 'Line 5 Ah-type', maker: 'CRRC Nanjing Puzhen', introduced: 2019,
    blurb: "Run by an MTR joint venture; its cyan sides and black window bands echo Hong Kong's newest trains.",
    ...ahType, nose: 'rounded', ...paint(WHITE), front: BLACK,
    stripes: [band('line', 0, 0.46), band(BLACK, 0.46, 0.84), band('line', 0.84, 1)],
    frontStripes: [band('line', 0, 0.3)],
  },
  {
    id: 'hangzhou-l6', name: 'Line 6 Ah-type', maker: 'CRRC Nanjing Puzhen', introduced: 2020,
    blurb: 'Runs out to Fuyang and ducks under the Qiantang River beside the Seventh Qiantang Bridge.',
    ...ahType, nose: 'rounded', ...fullColor('#1E6FC8'),
  },
  {
    id: 'hangzhou-l7', name: 'Line 7 A-type', maker: 'CRRC Nanjing Puzhen', introduced: 2020,
    blurb: 'From Wushan Square below the West Lake hills out to Xiaoshan Airport and the Dajiangdong district.',
    ...aType, nose: 'rounded', ...fullColor('#8A2A9E'),
  },
  {
    id: 'hangzhou-l8', name: 'Line 8 A-type', maker: 'CRRC Nanjing Puzhen', introduced: 2021,
    blurb: 'A nine-station link under the Qiantang to Dajiangdong; Fengloucun station has arches that change color.',
    ...aType, nose: 'rounded', ...fullColor('#B01E5E'),
  },
  {
    id: 'hangzhou-l10', name: 'Line 10 A-type', maker: 'CRRC Nanjing Puzhen', introduced: 2022,
    blurb: "A deeper yellow than Line 3's trains, under a black roof; it runs north from Huanglong through the city's west.",
    ...aType, nose: 'rounded', ...fullColor('#D9A515'), roof: BLACK,
  },
  {
    id: 'hangzhou-l19', name: 'Line 19 suburban A-type', maker: 'CRRC Nanjing Puzhen', introduced: 2022,
    blurb: "The 120 km/h airport express linking Hangzhou's West and East stations with Xiaoshan Airport; its doors are glass to the floor.",
    ...aType, doors: 4, length: 23, nose: 'slant', ...paint(WHITE), front: BLACK, doorColor: '#3A4550',
    stripes: [band('#1B5FA8', 0, 0.1), band('line', 0.1, 0.2), band('#8FD3F0', 0.2, 0.28)],
    frontStripes: [band('line', 0.2, 0.3)],
  },
];

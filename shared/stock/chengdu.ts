import type { StockSpec, StockStripe } from '../types.ts';

// Chengdu Metro rolling stock, fall 2026. Dimensions follow the Chinese car-type standards (B: 19 m x 2.8 m, 4 doors;
// A: 22 m x 3.0 m, 5 doors; suburban A: 22–24 m x 3.0 m) and the builders' figures quoted on Wikipedia.
// Liveries from photos on Wikimedia Commons where there are any, otherwise from the operator's descriptions.
const STAINLESS = '#C6CACE';
const WHITE = '#F1F2F2';
const ROOF = '#8C9399';
const GLASS = '#1A1F26';
const FACE = '#16191D';
const GOLD = '#C9A13B';
const band = (color: StockStripe['color'], from: number, to: number): StockStripe => ({ color, from, to });

const bType = { length: 19, width: 2.8, height: 3.8, doors: 4, profile: 'box' as const, pantograph: true };
const aType = { length: 22, width: 3.0, height: 3.8, doors: 5, profile: 'box' as const, pantograph: true };
/** Suburban A-type ("市域A") for the 140–160 km/h express lines: fewer doors, more seats. */
const suburbanA = { length: 23, width: 3.0, height: 3.9, doors: 4, profile: 'rounded' as const, pantograph: true };
const steel = { finish: 'stainless' as const, body: STAINLESS, roof: ROOF, doorColor: STAINLESS, windowColor: GLASS };
const painted = (body: string) => ({ finish: 'paint' as const, body, roof: ROOF, doorColor: body, windowColor: GLASS });

export const stock: StockSpec[] = [
  // ------------------------------------------------------------------ B-type lines
  {
    id: 'chengdu-l1', name: 'Line 1 B-type (SFM06–SFM52)', maker: 'CRRC Qingdao Sifang', introduced: 2010,
    blurb: "Opened Chengdu Metro in 2010 under Renmin Road; later batches carry the Golden Sun Bird, the city's ancient emblem.",
    ...bType, nose: 'rounded', ...steel, front: STAINLESS,
    stripes: [band('line', 0.36, 0.4), band('#6FA8DC', 0.4, 0.42)],
    frontStripes: [band(FACE, 0.48, 0.9), band('line', 0.36, 0.4)],
  },
  {
    id: 'chengdu-l2', name: 'Line 2 B-type (SFM14 / SFM32)', maker: 'CRRC Qingdao Sifang', introduced: 2012,
    blurb: 'Its eastern end closed in December 2025 so the line can be rerouted through the new Longquanyi railway station.',
    ...bType, nose: 'rounded', ...steel, front: STAINLESS,
    stripes: [band('#2A8BD0', 0.32, 0.36), band('line', 0.36, 0.4)],
    frontStripes: [band(FACE, 0.48, 0.9), band('#2A8BD0', 0.34, 0.38)],
  },
  {
    id: 'chengdu-tianfu', name: '"Tianfu Charm" B-type', maker: 'CRRC Changchun', introduced: 2015,
    blurb: "Lines 3 and 4 share this stainless train, its face styled on Sanxingdui's bronzes and its ribbon on Shu brocade.",
    ...bType, nose: 'rounded', ...steel, front: STAINLESS,
    stripes: [band('line', 0.34, 0.39), band(GOLD, 0.39, 0.4)],
    frontStripes: [band(FACE, 0.46, 0.9), band('#E86A1C', 0.36, 0.4)],
  },
  {
    id: 'chengdu-l27', name: 'Line 27 B-type (SFM117)', maker: 'CRRC Qingdao Sifang', introduced: 2024,
    blurb: 'Driverless (GoA4) from its opening day in December 2024, from Shifo in Xindu to Shuxin Road.',
    ...bType, nose: 'rounded', ...painted(WHITE), front: '#12365A',
    stripes: [band('line', 0.34, 0.42)],
    frontStripes: [band('line', 0.34, 0.4), band('#F2C230', 0.4, 0.42), band(FACE, 0.5, 0.9)],
  },
  {
    id: 'chengdu-l30', name: 'Line 30 B-type', maker: 'CRRC', introduced: 2025,
    blurb: "A driverless line opened in December 2025, linking Shuangliu Airport with Longquanyi's new railway station.",
    ...bType, nose: 'rounded', ...painted(WHITE), front: '#E4E6E8',
    stripes: [band('line', 0.34, 0.42)],
    frontStripes: [band('line', 0.34, 0.42), band(FACE, 0.5, 0.9)],
  },
  // ------------------------------------------------------------------ A-type lines
  {
    id: 'chengdu-l5', name: 'Line 5 A-type', maker: 'CRRC Changchun', introduced: 2019,
    blurb: "Chengdu's first 8-car trains, in rose red and white; the cab face borrows its lines from a Sichuan opera mask.",
    ...aType, length: 22.3, nose: 'rounded', ...painted(WHITE), front: '#B5317D',
    stripes: [band('line', 0.44, 0.84)],
    frontStripes: [band(FACE, 0.52, 0.88)],
  },
  {
    id: 'chengdu-l6', name: 'Line 6 A-type', maker: 'CRRC Qingdao Sifang', introduced: 2020,
    blurb: 'With 56 stations over 68.8 km, from Pidu to Tianfu New Area, it has more stops than any other Chengdu line.',
    ...aType, nose: 'rounded', ...painted(WHITE), front: '#E4E6E8',
    stripes: [band('line', 0.35, 0.41)],
    frontStripes: [band(FACE, 0.48, 0.9), band('line', 0.36, 0.42)],
  },
  {
    id: 'chengdu-l7', name: 'Line 7 A-type', maker: 'CRRC Qingdao Sifang / CRRC Chengdu', introduced: 2017,
    blurb: "The 38.6 km loop links all three of Chengdu's main railway stations; 18 of its 31 stops are interchanges.",
    ...aType, nose: 'rounded', ...painted(WHITE), front: '#E4E6E8',
    stripes: [band('line', 0.34, 0.42)],
    frontStripes: [band(FACE, 0.48, 0.9), band('line', 0.34, 0.42)],
  },
  {
    id: 'chengdu-l8', name: 'Line 8 A-type', maker: 'CRRC Changchun', introduced: 2020,
    blurb: 'Its aluminum cars weigh 1.15 t less than a typical A-type car; the livery is white and grass green.',
    ...aType, nose: 'rounded', ...painted(WHITE), front: '#7FA61A',
    stripes: [band('line', 0.34, 0.42)],
    frontStripes: [band(FACE, 0.52, 0.88)],
  },
  {
    id: 'chengdu-l9', name: 'Line 9 A-type', maker: 'CRRC Changchun', introduced: 2020,
    blurb: "Chengdu's first driverless line; the orange band sweeps up at each end in a smile.",
    ...aType, nose: 'rounded', ...painted(WHITE), doorColor: '#2A2D31', front: '#1E2125',
    stripes: [band('line', 0.34, 0.41)],
    frontStripes: [band('line', 0.3, 0.38), band(FACE, 0.48, 0.9)],
  },
  {
    id: 'chengdu-l10', name: 'Line 10 A-type', maker: 'CRRC Qingdao Sifang', introduced: 2017,
    blurb: "The airport express to Shuangliu, and the first Chengdu line to use the bigger A-type cars.",
    ...aType, nose: 'rounded', ...painted(WHITE), front: '#E4E6E8',
    stripes: [band('#8A9096', 0.3, 0.33), band('#F2B517', 0.33, 0.37), band('#D7322B', 0.37, 0.42)],
    frontStripes: [band(FACE, 0.48, 0.9), band('#D7322B', 0.34, 0.38)],
  },
  // ------------------------------------------------------------------ Suburban express lines
  {
    id: 'chengdu-l13', name: 'Line 13 suburban A-type', maker: 'CRRC', introduced: 2025,
    blurb: "China's first driverless 140 km/h suburban metro train; its gold livery comes from Sanxingdui's golden masks.",
    ...suburbanA, length: 23.25, nose: 'slant', ...painted('#D8C27A'), front: '#2A2620',
    stripes: [band('#8C6A1E', 0.34, 0.38)],
    frontStripes: [band('#D8C27A', 0, 0.36), band(GOLD, 0.36, 0.42)],
  },
  {
    id: 'chengdu-l17', name: 'Line 17 suburban A-type', maker: 'CRRC Qingdao Sifang', introduced: 2020,
    blurb: 'Built for 140 km/h under 25 kV AC wires, it runs express-train fast right under the old city center.',
    ...suburbanA, nose: 'slant', ...painted('#5FB4E6'), front: FACE,
    stripes: [band('#1F5FA8', 0.6, 1)],
    frontStripes: [band('#5FB4E6', 0, 0.34), band('#1F5FA8', 0.34, 0.4)],
  },
  {
    id: 'chengdu-l18', name: 'Line 18 suburban A-type', maker: 'CRRC Qingdao Sifang', introduced: 2020,
    blurb: 'Runs to Tianfu Airport at 140 km/h; each car has only four doors a side, to make room for seats and luggage racks.',
    ...suburbanA, length: 23.4, nose: 'slant', ...painted(WHITE), front: FACE,
    stripes: [band(FACE, 0.46, 0.84), band('#D7322B', 0.36, 0.42)],
    frontStripes: [band(WHITE, 0, 0.34), band('#D7322B', 0.34, 0.4)],
  },
  {
    id: 'chengdu-l19', name: 'Line 19 suburban A-type (4-car)', maker: 'CRRC Qingdao Sifang', introduced: 2023,
    blurb: "China's first 160 km/h metro train; its livery paints the peaks of Mount Qingcheng. It links both airports in 30 min.",
    ...suburbanA, length: 24, nose: 'slant', ...painted('#B9BEC6'), front: '#B9BEC6',
    stripes: [band('#6E78C8', 0.2, 0.44), band('line', 0.44, 0.48)],
    frontStripes: [band(FACE, 0.5, 0.88), band('#6E78C8', 0.3, 0.36)],
  },
];

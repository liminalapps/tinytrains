import type { StockSpec, StockStripe } from '../types.ts';

// Beijing Subway rolling stock, fall 2026. Fleet data from Beijing MTR / BII and Wikipedia's rolling stock list;
// liveries follow photos. 'line' stripes take the line color.
const STAINLESS = '#C4C9CE';
const SILVER = '#B7BDC3';
const WHITE = '#EEF0F1';
const ROOF = '#8A9096';
const GLASS = '#1A1F26';
const FACE = '#15181C';
const band = (color: StockStripe['color'], from: number, to: number): StockStripe => ({ color, from, to });

// Type B: 19 m × 2.8 m, 4 doors a side, 750 V third rail on most lines (Type B on lines 6 and 7 take 1,500 V from
// overhead wires). Type A: 22 m × 3 m, 5 doors, overhead wires.
const typeB = { length: 19, width: 2.8, height: 3.8, doors: 4, profile: 'box' as const, pantograph: false };
const typeA = { length: 22, width: 3.0, height: 3.8, doors: 5, profile: 'box' as const, pantograph: true };
const steel = { finish: 'stainless' as const, body: STAINLESS, roof: ROOF, doorColor: STAINLESS, windowColor: GLASS };
const painted = (body: string) => ({ finish: 'paint' as const, body, roof: ROOF, doorColor: body, windowColor: GLASS });

export const stock: StockSpec[] = [
  // ---------------------------------------------------------------- Line 1 / Batong
  {
    id: 'beijing-dkz4', name: 'DKZ4', maker: 'CRRC Changchun', introduced: 1998,
    blurb: 'Boxy white trains with a red chevron on the face, built for the 1999 Fuba extension under Chang’an Avenue; now retiring.',
    ...typeB, nose: 'flat', ...painted('#E4E6E8'), front: '#E4E6E8',
    stripes: [band('line', 0.4, 0.44)],
    frontStripes: [band(FACE, 0.46, 0.9), band('line', 0.34, 0.39)],
  },
  {
    id: 'beijing-sfm04', name: 'SFM04', maker: 'CRRC Qingdao Sifang', introduced: 2007,
    blurb: "Line 1 dates to 1969, making it China's oldest metro line; these Sifang sets joined it from 2007.",
    ...typeB, nose: 'rounded', ...steel, front: FACE,
    stripes: [band('line', 0.4, 0.46)],
    frontStripes: [band('line', 0.3, 0.34)],
  },
  {
    id: 'beijing-sfm01', name: 'SFM01 / SFM02 / SFM07', maker: 'CRRC Qingdao Sifang', introduced: 2003,
    blurb: 'Built for the Batong line to Tongzhou, which has run through onto Line 1 since 2021.',
    ...typeB, nose: 'flat', ...steel, front: SILVER,
    stripes: [band('line', 0.42, 0.45), band('line', 0.86, 0.89)],
    frontStripes: [band(FACE, 0.46, 0.9), band('line', 0.34, 0.38)],
  },
  {
    id: 'beijing-bdk06', name: 'BDK06', maker: 'Beijing Subway Rolling Stock Equipment', introduced: 2019,
    blurb: 'Extra sets built when Line 1 and the Batong line merged into one long run from Pingguoyuan to Universal Resort.',
    ...typeB, nose: 'flat', ...steel, front: SILVER,
    stripes: [band('line', 0.4, 0.43)],
    frontStripes: [band(FACE, 0.46, 0.9), band('line', 0.3, 0.33)],
  },
  // ---------------------------------------------------------------- Lines 2–5
  {
    id: 'beijing-dkz16', name: 'DKZ16', maker: 'CRRC Changchun', introduced: 2006,
    blurb: "Circles the old city walls' route under the Second Ring Road; Line 2 was built in trenches where the walls stood.",
    ...typeB, nose: 'flat', ...steel, front: WHITE,
    stripes: [band('line', 0.4, 0.44)],
    frontStripes: [band(FACE, 0.46, 0.9), band('line', 0.12, 0.2), band('line', 0.9, 0.97)],
  },
  {
    id: 'beijing-zbm06', name: 'ZBM06 / SFM86', maker: 'Beijing Subway Rolling Stock Equipment / CRRC Qingdao Sifang', introduced: 2024,
    blurb: 'Four-car Type A sets that can couple into 8; they opened Line 3 to the new Chaoyang railway station in 2024.',
    ...typeA, nose: 'rounded', ...steel, front: FACE,
    stripes: [band('line', 0.4, 0.43)],
    frontStripes: [band('line', 0.12, 0.3)],
  },
  {
    id: 'beijing-sfm05', name: 'SFM05', maker: 'CRRC Qingdao Sifang', introduced: 2009,
    blurb: "Line 4 is run by Beijing MTR, part-owned by Hong Kong's MTR; its peak trains once came every 1 min 43 s.",
    ...typeB, nose: 'rounded', ...steel, body: '#A9B0B6', doorColor: '#A9B0B6', front: '#2F3439',
    stripes: [band('line', 0.4, 0.44)],
    frontStripes: [band('line', 0.12, 0.3), band('line', 0.9, 0.97)],
  },
  {
    id: 'beijing-dkz13', name: 'DKZ13', maker: 'CRRC Changchun', introduced: 2007,
    blurb: "Magenta-trimmed trains on Line 5, which rides a viaduct north to Tiantongyuan, one of Asia's largest housing estates.",
    ...typeB, nose: 'flat', ...steel, front: WHITE,
    stripes: [band('line', 0.4, 0.43)],
    frontStripes: [band(FACE, 0.46, 0.9), band('line', 0.3, 0.36)],
  },
  // ---------------------------------------------------------------- Lines 6 and 7: 8-car Type B
  {
    id: 'beijing-dkz47', name: 'DKZ47 / DKZ106', maker: 'CRRC Changchun', introduced: 2012,
    blurb: 'Eight-car Type B trains running 100 km/h; rush-hour expresses run nonstop from Qingnian Road to Haojiafu.',
    ...typeB, pantograph: true, nose: 'rounded', ...steel, front: '#D6A21E',
    stripes: [band('line', 0.4, 0.43)],
    frontStripes: [band(FACE, 0.46, 0.9)],
  },
  {
    id: 'beijing-bdk01', name: 'BDK01 / BDK05', maker: 'Beijing Subway Rolling Stock Equipment', introduced: 2014,
    blurb: 'Apricot-faced trains from Beijing West station to the gates of Universal Beijing Resort.',
    ...typeB, pantograph: true, nose: 'flat', ...steel, front: '#F5B335',
    stripes: [band('line', 0.4, 0.44)],
    frontStripes: [band(FACE, 0.46, 0.9)],
  },
  // ---------------------------------------------------------------- Lines 8–10
  {
    id: 'beijing-sfm12', name: 'SFM12 / SFM42', maker: 'CRRC Qingdao Sifang', introduced: 2011,
    blurb: 'Line 8 began as the 2008 Olympic Branch to the Bird’s Nest and now runs 50 km from Changping to Daxing.',
    ...typeB, nose: 'rounded', ...painted('#E2E5E8'), front: SILVER,
    stripes: [band('line', 0.4, 0.44)],
    frontStripes: [band(FACE, 0.46, 0.9), band('line', 0.12, 0.3)],
  },
  {
    id: 'beijing-dkz33', name: 'DKZ33 / BDK04', maker: 'CRRC Changchun / BSRSE', introduced: 2011,
    blurb: 'Lime-framed faces on Line 9, whose Fangshan through trains run in from the southwest suburbs at rush hour.',
    ...typeB, nose: 'rounded', ...steel, front: '#E8A21A',
    stripes: [band('line', 0.4, 0.43)],
    frontStripes: [band(FACE, 0.46, 0.9), band('line', 0.12, 0.97)],
  },
  {
    id: 'beijing-dkz15', name: 'DKZ15 / DKZ34 / DKZ46', maker: 'CRRC Changchun', introduced: 2008,
    blurb: "Line 10 is a 57 km loop with 45 stations, among the longest underground circle lines in the world.",
    ...typeB, nose: 'rounded', ...steel, front: '#1F8FD2',
    stripes: [band('line', 0.4, 0.44)],
    frontStripes: [band(FACE, 0.46, 0.9)],
  },
  // ---------------------------------------------------------------- Lines 11 and 12: short Type A
  {
    id: 'beijing-zbm04', name: 'ZBM04', maker: 'Beijing Subway Rolling Stock Equipment', introduced: 2021,
    blurb: "Five 4-car sets for Line 11's short run to the Shougang steel mill, reborn as the 2022 Winter Olympics' Big Air venue.",
    ...typeA, nose: 'rounded', ...painted(WHITE), front: WHITE,
    stripes: [band('line', 0.4, 0.44)],
    frontStripes: [band(FACE, 0.46, 0.9), band('line', 0.3, 0.36)],
  },
  {
    id: 'beijing-ccd5049', name: 'CCD5049 / ZBM05', maker: 'CRRC Changchun / BSRSE', introduced: 2024,
    blurb: 'Line 12 opened in 2024 under the North Third Ring Road; its 4-car trains can couple into 8 as crowds grow.',
    ...typeA, nose: 'rounded', ...steel, front: SILVER,
    stripes: [band('line', 0.4, 0.43)],
    frontStripes: [band(FACE, 0.46, 0.92), band('#D22630', 0.3, 0.34)],
  },
  // ---------------------------------------------------------------- Lines 13 and 18
  {
    id: 'beijing-dkz5', name: 'DKZ5 / DKZ6', maker: 'CRRC Changchun', introduced: 2002,
    blurb: "Blue-faced trains on Line 13, Beijing's first mostly elevated line, swinging north past Huilongguan.",
    ...typeB, nose: 'flat', ...steel, front: '#1D5AA8',
    stripes: [band('line', 0.4, 0.44)],
    frontStripes: [band(FACE, 0.46, 0.9), band(WHITE, 0.14, 0.3)],
  },
  {
    id: 'beijing-zbm15', name: 'ZBM15', maker: 'Beijing Subway Rolling Stock Equipment', introduced: 2024,
    blurb: 'Yellow-winged black faces; some of these sets opened Line 18 in 2025 before its own fleet arrived.',
    ...typeB, nose: 'rounded', ...painted(WHITE), front: FACE,
    stripes: [band('#F4DA40', 0.4, 0.45), band('#F4DA40', 0.86, 0.9)],
    frontStripes: [band('#F4DA40', 0.12, 0.3)],
  },
  // ---------------------------------------------------------------- Lines 14–19: Type A
  {
    id: 'beijing-dkz53', name: 'DKZ53 / SFM18', maker: 'CRRC Changchun / CRRC Qingdao Sifang', introduced: 2013,
    blurb: 'Six-car Type A trains under the business district; Line 14 stops at Beijing South railway station.',
    ...typeA, nose: 'rounded', ...steel, front: '#1E2230',
    stripes: [band('line', 0.4, 0.43)],
    frontStripes: [band('#6F5EA8', 0.24, 0.28)],
  },
  {
    id: 'beijing-dkz31', name: 'DKZ31 / BDK08', maker: 'CRRC Changchun / BSRSE', introduced: 2010,
    blurb: 'Red-framed white faces run northeast past the Olympic Park to Shunyi, near Capital Airport.',
    ...typeB, nose: 'rounded', ...steel, front: '#C8202F',
    stripes: [band('line', 0.4, 0.43)],
    frontStripes: [band(WHITE, 0.12, 0.44), band(FACE, 0.46, 0.9)],
  },
  {
    id: 'beijing-dkz93', name: 'DKZ93 / SFM40', maker: 'CRRC Changchun / CRRC Qingdao Sifang', introduced: 2016,
    blurb: "Beijing's first 8-car Type A trains, the city's biggest, carrying about 2,500 riders each.",
    ...typeA, nose: 'flat', ...steel, front: '#2A2E33',
    stripes: [band('line', 0.4, 0.43)],
    frontStripes: [band('line', 0.14, 0.2)],
  },
  {
    id: 'beijing-sfm79', name: 'SFM79 / CCD5035', maker: 'CRRC Qingdao Sifang / CRRC Changchun', introduced: 2021,
    blurb: 'Line 17 links the Future Science City to Tongzhou with long hops between stops; 8-car trains run up to 100 km/h.',
    ...typeA, nose: 'rounded', ...steel, front: FACE,
    stripes: [band('line', 0.4, 0.43)],
    frontStripes: [band('#1F6FC1', 0.12, 0.3)],
  },
  {
    id: 'beijing-sfm80', name: 'SFM80 / CCD5034', maker: 'CRRC Qingdao Sifang / CRRC Changchun', introduced: 2021,
    blurb: "An express subway: Line 19 averages more than 2 km between stations on its run under the city's west.",
    ...typeA, nose: 'rounded', ...painted(WHITE), front: FACE,
    stripes: [band('#D22630', 0.38, 0.41), band('line', 0.41, 0.44)],
    frontStripes: [band('#D22630', 0.24, 0.3)],
  },
  // ---------------------------------------------------------------- Suburban lines
  {
    id: 'beijing-dkz32', name: 'DKZ32', maker: 'CRRC Changchun', introduced: 2010,
    blurb: 'Magenta trains for the Yizhuang line, which serves the Beijing Economic-Technological Development Area.',
    ...typeB, nose: 'rounded', ...painted('#C4195E'), front: '#C4195E',
    stripes: [band(WHITE, 0.3, 0.33)],
    frontStripes: [band(FACE, 0.46, 0.9)],
  },
  {
    id: 'beijing-bjd01', name: 'BJD01 / BDK03', maker: 'Beijing Subway Rolling Stock Equipment', introduced: 2010,
    blurb: 'Orange egg-shaped faces on the Fangshan line, which runs 100 km/h on viaducts to the southwest.',
    ...typeB, nose: 'rounded', ...steel, front: '#E8632A',
    stripes: [band('line', 0.4, 0.43)],
    frontStripes: [band(FACE, 0.48, 0.92)],
  },
  {
    id: 'beijing-sfm13', name: 'SFM13 / SFM21 / SFM93', maker: 'CRRC Qingdao Sifang', introduced: 2010,
    blurb: 'Pink-striped trains north to the Ming Tombs, a UNESCO site with its own station on the Changping line.',
    ...typeB, nose: 'rounded', ...steel, front: SILVER,
    stripes: [band('line', 0.4, 0.43)],
    frontStripes: [band(FACE, 0.46, 0.9), band('line', 0.3, 0.33)],
  },
  // ---------------------------------------------------------------- Airport lines
  {
    id: 'beijing-qkz5', name: 'QKZ5 / CCD3004', maker: 'CRRC Changchun / Bombardier', introduced: 2008,
    blurb: 'Linear-motor trains from Bombardier’s ART family, opened for the 2008 Olympics; they loop out to T3 and T2.',
    length: 16.8, width: 2.8, height: 3.5, doors: 2, profile: 'box', nose: 'slant', ...painted('#E9EBED'), front: '#C8202F',
    stripes: [band('#C8202F', 0.3, 0.36)],
    frontStripes: [band(FACE, 0.46, 0.9)],
    pantograph: false,
  },
  {
    id: 'beijing-gsye20', name: 'Cinova-160 (GSYE20)', maker: 'CRRC Qingdao Sifang', introduced: 2019,
    blurb: 'Runs 160 km/h to Daxing Airport, among the fastest metros in China; one of its eight cars carries luggage.',
    length: 22.8, width: 3.3, height: 4.0, doors: 2, profile: 'rounded', nose: 'bullet', ...painted('#F1F2F3'), front: '#F1F2F3',
    stripes: [band('#C8202F', 0.3, 0.33), band('line', 0.33, 0.36)],
    frontStripes: [band(FACE, 0.46, 0.9), band('#C8202F', 0.3, 0.36)],
    pantograph: true,
  },
  // ---------------------------------------------------------------- Maglev and light rail
  {
    id: 'beijing-s1-maglev', name: 'S1 maglev', maker: 'CRRC Tangshan', introduced: 2017,
    blurb: "Beijing's first maglev can take 75 m curves, far tighter than the 200 m a subway train needs.",
    length: 14.8, width: 3.0, height: 3.7, doors: 2, profile: 'monorail', nose: 'rounded', ...painted('#F1F2F3'), front: '#4A4F55',
    stripes: [band('#C8202F', 0.3, 0.36)],
    frontStripes: [band(FACE, 0.48, 0.9)],
    pantograph: false,
  },
  {
    id: 'beijing-xijiao-tram', name: 'Xijiao tram (Sirio)', maker: 'CRRC Dalian / AnsaldoBreda', introduced: 2017,
    blurb: 'A five-section tram to Fragrant Hills Park; on holidays two run coupled together for the leaf-peepers.',
    length: 28.8, width: 2.65, height: 3.6, doors: 4, profile: 'tram', nose: 'rounded', ...painted(WHITE), front: WHITE,
    stripes: [band('line', 0.3, 0.36)],
    frontStripes: [band(FACE, 0.48, 0.9), band('line', 0.2, 0.3)],
    pantograph: true, sections: 5,
  },
];

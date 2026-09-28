import type { StockSpec, StockStripe } from '../types.ts';

// Guangzhou Metro rolling stock, fall 2026. Fleet data from Guangzhou Metro and Wikipedia; liveries follow photos.
// 'line' stripes take the line color.
const STAINLESS = '#C4C9CE';
const SILVER = '#B7BDC3';
const WHITE = '#EEF0F1';
const CREAM = '#ECE8DF';
const ROOF = '#8A9096';
const GLASS = '#1A1F26';
const FACE = '#15181C';
const band = (color: StockStripe['color'], from: number, to: number): StockStripe => ({ color, from, to });

// Class A: 22.8 m × 3 m, 5 doors a side; Class B: 19 m × 2.8 m, 4 doors; linear-motor "L" cars (lines 4–6):
// 16.8 m × 2.8 m, 3 doors, low enough to fit smaller tunnels. Nearly every line runs under overhead wires.
const classA = { length: 22.8, width: 3.0, height: 3.8, doors: 5, profile: 'box' as const, pantograph: true };
const classB = { length: 19, width: 2.8, height: 3.8, doors: 4, profile: 'box' as const, pantograph: true };
const linear = { length: 16.8, width: 2.8, height: 3.6, doors: 3, profile: 'box' as const };
const steel = { finish: 'stainless' as const, body: STAINLESS, roof: ROOF, doorColor: STAINLESS, windowColor: GLASS };
const painted = (body: string) => ({ finish: 'paint' as const, body, roof: ROOF, doorColor: body, windowColor: GLASS });

export const stock: StockSpec[] = [
  // ---------------------------------------------------------------- Line 1
  {
    id: 'guangzhou-a1', name: 'A1', maker: 'Adtranz / Siemens', introduced: 1997,
    blurb: "The German-built trains that opened Guangzhou's first metro line in 1997, repainted canary yellow in their refit.",
    ...classA, nose: 'flat', ...painted('#F2D64B'), front: '#F2D64B',
    stripes: [band('#D7282F', 0.38, 0.43), band('#2E3136', 0, 0.12)],
    frontStripes: [band(FACE, 0.46, 0.9), band('#D7282F', 0.34, 0.39)],
  },
  {
    id: 'guangzhou-a2', name: 'A2 / A3', maker: 'CNR Changchun / Bombardier', introduced: 2003,
    blurb: "They ran on Line 2 before moving to Line 1, which crosses 18 km of the old city from Xilang to Guangzhou East.",
    ...classA, nose: 'rounded', ...painted(WHITE), front: FACE,
    stripes: [band('line', 0.38, 0.41)],
    frontStripes: [band(WHITE, 0.12, 0.3)],
  },
  // ---------------------------------------------------------------- Lines 2 and 8
  {
    id: 'guangzhou-a4', name: 'A4 / A5', maker: 'CSR Zhuzhou', introduced: 2010,
    blurb: 'Blue-striped sets built for the 2010 split of old Line 2 into today’s lines 2 and 8, just before the Asian Games.',
    ...classA, nose: 'rounded', ...steel, front: SILVER,
    stripes: [band('#3D4FA0', 0.39, 0.42)],
    frontStripes: [band(FACE, 0.46, 0.9), band('#3D4FA0', 0.3, 0.33)],
  },
  {
    id: 'guangzhou-a8', name: 'A6 / A8', maker: 'CRRC Zhuzhou / CRRC Changchun', introduced: 2019,
    blurb: 'A blue wave sweeps from the face down the side; Line 8 was extended north under Baiyun in 2020.',
    ...classA, nose: 'rounded', ...painted('#ECEAE4'), front: FACE,
    stripes: [band('#1E73BE', 0.36, 0.42)],
    frontStripes: [band('#1E73BE', 0.12, 0.97)],
  },
  // ---------------------------------------------------------------- Line 3
  {
    id: 'guangzhou-b1', name: 'B1 / B2 / B4 / B10', maker: 'CSR Zhuzhou / Siemens', introduced: 2006,
    blurb: 'First ran as 3-car trains on a 120 km/h line; now paired into 6, they carry the Y-shaped Line 3 to Baiyun Airport.',
    ...classB, nose: 'rounded', ...painted(WHITE), front: WHITE,
    stripes: [band('#E8502A', 0.28, 0.4)],
    frontStripes: [band(FACE, 0.46, 0.9), band('#E8502A', 0.12, 0.44)],
  },
  {
    id: 'guangzhou-b11', name: 'B11', maker: 'CRRC Changchun', introduced: 2023,
    blurb: 'Orange-rimmed faces added as Line 3 grew to 75 km, one of the longest metro lines in China.',
    ...classB, nose: 'rounded', ...painted(CREAM), front: FACE,
    stripes: [band('#E8502A', 0.38, 0.42)],
    frontStripes: [band('#E8502A', 0.12, 0.2)],
  },
  // ---------------------------------------------------------------- Linear-motor lines 4, 5, 6
  {
    id: 'guangzhou-l1', name: 'L1 / L5', maker: 'CSR Qingdao Sifang', introduced: 2005,
    blurb: "China's first linear-motor metro: magnets under the car pull it along a reaction plate between the rails.",
    ...linear, nose: 'flat', ...painted(WHITE), front: '#D7282F', pantograph: false,
    stripes: [band('#D7282F', 0.36, 0.41)],
    frontStripes: [band(FACE, 0.46, 0.9)],
  },
  {
    id: 'guangzhou-l2', name: 'L2 / L4 / L7', maker: 'CSR Qingdao Sifang / CRRC Guangdong', introduced: 2009,
    blurb: 'Linear-motor trains squeezing through the tight curves of Line 5; its peak trains come every 2 minutes.',
    ...linear, nose: 'flat', ...painted(WHITE), front: '#1C63B8', pantograph: true,
    stripes: [band('#1C63B8', 0.36, 0.42)],
    frontStripes: [band(FACE, 0.46, 0.9), band(WHITE, 0.3, 0.34)],
  },
  {
    id: 'guangzhou-l3', name: 'L3 / L6', maker: 'CSR Qingdao Sifang / CRRC Guangdong', introduced: 2013,
    blurb: "Four-car linear-motor trains, compact enough for Line 6's tight tunnels under the old city.",
    ...linear, nose: 'rounded', ...steel, front: '#2358A8', pantograph: true,
    stripes: [band('line', 0.38, 0.42)],
    frontStripes: [band(FACE, 0.48, 0.9), band('#D7282F', 0.3, 0.33)],
  },
  // ---------------------------------------------------------------- Lines 7, 10, 14, 21, Guangfo: Class B
  {
    id: 'guangzhou-b5', name: 'B5 / B9 / B12', maker: 'CRRC Zhuzhou / CRRC Qingdao Sifang', introduced: 2016,
    blurb: 'Line 7 crosses into Foshan to end at Midea Avenue, near the appliance maker’s headquarters.',
    ...classB, nose: 'rounded', ...painted(CREAM), front: FACE,
    stripes: [band('line', 0.38, 0.42)],
    frontStripes: [band('line', 0.12, 0.2)],
  },
  {
    id: 'guangzhou-b6', name: 'B6', maker: 'CRRC Zhuzhou', introduced: 2017,
    blurb: 'A teal wave on white for Line 9, which serves Huadu, north of Baiyun Airport, and Guangzhou North station.',
    ...classB, nose: 'rounded', ...painted(WHITE), front: FACE,
    stripes: [band('#1E9CB3', 0.36, 0.42)],
    frontStripes: [band('#1E9CB3', 0.12, 0.3)],
  },
  {
    id: 'guangzhou-b13', name: 'B13', maker: 'CRRC Zhuzhou', introduced: 2025,
    blurb: 'Line 10 opened in 2025 under the Pearl River, linking Xilang to Yangji East in 27 minutes.',
    ...classB, nose: 'rounded', ...painted(WHITE), front: SILVER,
    stripes: [band('#3E78C2', 0.36, 0.42)],
    frontStripes: [band(FACE, 0.46, 0.9), band('#3E78C2', 0.3, 0.34)],
  },
  {
    id: 'guangzhou-b7', name: 'B7 / B14', maker: 'CRRC Zhuzhou', introduced: 2017,
    blurb: 'Orange-faced trains for Line 14, built with passing tracks so expresses can overtake on the way to Conghua.',
    ...classB, nose: 'rounded', ...painted(WHITE), front: '#EE7B22',
    stripes: [band('line', 0.38, 0.41)],
    frontStripes: [band(FACE, 0.46, 0.88), band(WHITE, 0.12, 0.26)],
  },
  {
    id: 'guangzhou-b8', name: 'B8', maker: 'CRRC Zhuzhou', introduced: 2018,
    blurb: 'Line 21 runs expresses and locals out to Zengcheng; the expresses skip many stops at up to 120 km/h.',
    ...classB, nose: 'rounded', ...steel, front: SILVER,
    stripes: [band('line', 0.38, 0.42)],
    frontStripes: [band(FACE, 0.46, 0.9), band('#2D6DB5', 0.3, 0.34)],
  },
  {
    id: 'guangzhou-b3', name: 'B3', maker: 'CNR Changchun / CRRC Qingdao Sifang', introduced: 2010,
    blurb: "China's first intercity metro: the Guangfo line ties Guangzhou to Foshan, whose owners share the fleet.",
    ...classB, nose: 'rounded', ...painted(WHITE), front: '#D7282F',
    stripes: [band('line', 0.38, 0.42)],
    frontStripes: [band(FACE, 0.46, 0.9)],
  },
  // ---------------------------------------------------------------- Lines 11, 12, 13: Class A
  {
    id: 'guangzhou-a7', name: 'A7 / A11', maker: 'CRRC Dalian', introduced: 2017,
    blurb: "Eight-car sets with blue-rimmed faces; Line 13 was extended west to Tianhe Park in 2025.",
    ...classA, nose: 'rounded', ...painted(WHITE), front: FACE,
    stripes: [band('line', 0.38, 0.41)],
    frontStripes: [band('#1E73BE', 0.12, 0.97)],
  },
  {
    id: 'guangzhou-a9', name: 'A9', maker: 'CRRC Zhuzhou', introduced: 2024,
    blurb: 'Circles 44 km around central Guangzhou on Line 11, the city’s first loop, opened in December 2024.',
    ...classA, nose: 'rounded', ...steel, front: '#3A3F45',
    stripes: [band('line', 0.38, 0.42), band('#E8502A', 0.35, 0.38)],
    frontStripes: [band('line', 0.24, 0.28)],
  },
  {
    id: 'guangzhou-a10', name: 'A10', maker: 'CRRC Zhuzhou', introduced: 2025,
    blurb: 'Olive-striped sets for Line 12, which opened in two separate halves in 2025 while the middle is dug.',
    ...classA, nose: 'rounded', ...steel, front: SILVER,
    stripes: [band('#8DB63C', 0.36, 0.42)],
    frontStripes: [band(FACE, 0.46, 0.9), band('#8DB63C', 0.3, 0.34)],
  },
  // ---------------------------------------------------------------- Express lines 18 and 22
  {
    id: 'guangzhou-d1', name: 'D1 / D2', maker: 'CRRC Zhuzhou', introduced: 2021,
    blurb: "Runs 160 km/h under Panyu and Nansha; Line 18's 26 km hop from Hengli to Panyu Square has no stop in between.",
    length: 23, width: 3.3, height: 3.9, doors: 3, profile: 'rounded', nose: 'bullet', ...painted('#F1F2F3'), front: '#F1F2F3',
    stripes: [band('#D9432B', 0.28, 0.34)],
    frontStripes: [band(FACE, 0.48, 0.9), band('#D9432B', 0.3, 0.36)],
    pantograph: true,
  },
  // ---------------------------------------------------------------- APM
  {
    id: 'guangzhou-apm100', name: 'Innovia APM 100', maker: 'Bombardier', introduced: 2010,
    blurb: 'Rubber-tired and driverless, it runs in a tunnel under Zhujiang New Town to the foot of the Canton Tower.',
    length: 12.8, width: 2.85, height: 3.4, doors: 2, profile: 'agt', nose: 'rounded', ...painted(WHITE), front: WHITE,
    stripes: [band('line', 0.86, 0.94), band('#D7282F', 0.36, 0.38)],
    frontStripes: [band(FACE, 0.44, 0.9)],
    pantograph: false,
  },
];

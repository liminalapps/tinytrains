import type { StockSpec, StockStripe } from '../types.ts';

// Shenzhen Metro rolling stock, fall 2026. Fleet data from Shenzhen Metro and Wikipedia; liveries follow photos.
// 'line' stripes take the line color.
const STAINLESS = '#C4C9CE';
const SILVER = '#B7BDC3';
const WHITE = '#EEF0F1';
const ROOF = '#8A9096';
const GLASS = '#1A1F26';
const FACE = '#15181C';
const band = (color: StockStripe['color'], from: number, to: number): StockStripe => ({ color, from, to });

// Class A: 22 m × 3 m, 5 doors a side, 1,500 V from overhead wires; Line 3's Class B cars (19 m × 2.8 m, 4 doors)
// run on a third rail.
const classA = { length: 22, width: 3.0, height: 3.8, doors: 5, profile: 'box' as const, pantograph: true };
const steel = { finish: 'stainless' as const, body: STAINLESS, roof: ROOF, doorColor: STAINLESS, windowColor: GLASS };
const painted = (body: string) => ({ finish: 'paint' as const, body, roof: ROOF, doorColor: body, windowColor: GLASS });
/** The 2020s generation: white body, black face framed in a colored rim, line color along the side. */
const rimmed = (rim: StockStripe['color']) => ({
  ...classA, nose: 'rounded' as const, ...painted(WHITE), front: FACE,
  stripes: [band('line', 0.38, 0.42)],
  frontStripes: [band(rim, 0.12, 0.24), band(rim, 0.9, 0.97)],
});

export const stock: StockSpec[] = [
  // ---------------------------------------------------------------- Lines 1, 2/8, 5: the first generation
  {
    id: 'shenzhen-movia', name: 'Bombardier Movia 456', maker: 'Changchun Bombardier', introduced: 2004,
    blurb: 'The 22 trains that opened Line 1 from Luohu, at the Hong Kong border, in 2004; its peak trains now come every 2 minutes.',
    ...classA, nose: 'rounded', ...painted('#E6E8EA'), front: '#E6E8EA',
    stripes: [band('#E2412C', 0.38, 0.42)],
    frontStripes: [band(FACE, 0.46, 0.9), band('#E2412C', 0.32, 0.36)],
  },
  {
    id: 'shenzhen-l1-a', name: 'Line 1 Class A (Zhuzhou / Changchun)', maker: 'CRRC Zhuzhou / CRRC Changchun', introduced: 2011,
    blurb: 'Added when Line 1 reached Airport East in 2011, making it a 41 km run across the city from Luohu.',
    ...classA, nose: 'flat', ...steel, front: '#E6E8EA',
    stripes: [band('#E2412C', 0.4, 0.43)],
    frontStripes: [band(FACE, 0.46, 0.9)],
  },
  {
    id: 'shenzhen-l2-a', name: 'Line 2/8 Class A', maker: 'CRRC Changchun / CRRC Zhuzhou', introduced: 2010,
    blurb: 'Lines 2 and 8 run as one service, from the port at Chiwan past the beaches of Dameisha and Xiaomeisha to Xichong.',
    ...classA, nose: 'rounded', ...painted('#E8E9EA'), front: '#E8E9EA',
    stripes: [band('line', 0.39, 0.42)],
    frontStripes: [band(FACE, 0.46, 0.9), band('#D22630', 0.3, 0.33)],
  },
  {
    id: 'shenzhen-l5-a', name: 'Line 5 Class A', maker: 'CRRC Zhuzhou / CRRC Changchun', introduced: 2011,
    blurb: 'Line 5 arcs around the city through Shenzhen North station; its 2025 extension finally reached Grand Theater downtown.',
    ...classA, nose: 'flat', ...steel, front: '#E6E8EA',
    stripes: [band('line', 0.4, 0.43)],
    frontStripes: [band(FACE, 0.46, 0.9)],
  },
  {
    id: 'shenzhen-ccd5094', name: 'CCD5094', maker: 'CRRC Changchun', introduced: 2025,
    blurb: "Gold-rimmed faces on the newest of Line 5's trains, built by CRRC Changchun.",
    ...rimmed('#C8A04A'),
  },
  // ---------------------------------------------------------------- Line 3: Class B, third rail
  {
    id: 'shenzhen-l3-b', name: 'Line 3 Class B', maker: 'CRRC Changchun / CRRC Nanjing Puzhen', introduced: 2010,
    blurb: "Narrower Class B cars ride Line 3's long viaduct out to Longgang in the northeast.",
    length: 19, width: 2.8, height: 3.8, doors: 4, profile: 'box', nose: 'rounded', ...steel, front: SILVER,
    stripes: [band('line', 0.4, 0.43)],
    frontStripes: [band(FACE, 0.46, 0.9), band('line', 0.12, 0.2)],
    pantograph: false,
  },
  // ---------------------------------------------------------------- MTR-run lines 4 and 13
  {
    id: 'shenzhen-l4-a', name: 'Line 4 Class A (MTR)', maker: 'CRRC Nanjing Puzhen', introduced: 2011,
    blurb: "Run by Hong Kong's MTR since 2010: from Futian Checkpoint, riders cross to Hong Kong's East Rail at Lok Ma Chau.",
    ...classA, nose: 'rounded', ...painted('#ECEDEE'), front: FACE,
    stripes: [band('#D2202F', 0.36, 0.4), band('#8A8F95', 0.86, 0.97)],
    frontStripes: [band('#D2202F', 0.12, 0.97)],
  },
  {
    id: 'shenzhen-sfm108', name: 'SFM108', maker: 'CRRC Qingdao Sifang', introduced: 2024,
    blurb: 'Eight-car trains for Line 13, run by an MTR joint venture from the Shenzhen Bay border crossing north to Guangming.',
    ...rimmed('#E87A1E'),
  },
  // ---------------------------------------------------------------- Lines 6, 7, 9, 10, 12, 16
  {
    id: 'shenzhen-l6-a', name: 'Line 6 Class A', maker: 'CRRC Nanjing Puzhen', introduced: 2020,
    blurb: 'A mint band wraps the windows; Line 6 runs north out of the city to Guangming and Songgang.',
    ...classA, nose: 'rounded', ...painted(WHITE), front: FACE,
    stripes: [band('line', 0.44, 0.86)],
    frontStripes: [band('line', 0.12, 0.3)],
  },
  {
    id: 'shenzhen-l7-a', name: 'Line 7 Class A', maker: 'CRRC Changchun', introduced: 2016,
    blurb: 'Line 7 bends in a V under the city, from Shenzhen University to Tai’an.',
    ...classA, nose: 'rounded', ...steel, front: SILVER,
    stripes: [band('line', 0.39, 0.43)],
    frontStripes: [band(FACE, 0.46, 0.9), band('line', 0.3, 0.34)],
  },
  {
    id: 'shenzhen-l9-a', name: 'Line 9 Class A', maker: 'CRRC Changchun', introduced: 2016,
    blurb: 'Line 9 threads ten interchange stations between Qianwan and Wenjin, near the Hong Kong border.',
    ...classA, nose: 'rounded', ...painted(WHITE), front: WHITE,
    stripes: [band('line', 0.39, 0.43)],
    frontStripes: [band(FACE, 0.46, 0.9), band('line', 0.3, 0.34)],
  },
  {
    id: 'shenzhen-l10-a', name: 'Line 10 Class A', maker: 'CRRC Changchun', introduced: 2020,
    blurb: 'Eight-car trains past Huawei’s Bantian campus, which gave a station its name.',
    ...rimmed('line'),
  },
  {
    id: 'shenzhen-l12-a', name: 'Line 12 Class A', maker: 'CRRC Nanjing Puzhen', introduced: 2022,
    blurb: "Driverless trains on Line 12, which runs 48 km from Nanshan up through Bao'an to Songgang.",
    ...rimmed('#A192B2'),
  },
  {
    id: 'shenzhen-l16-a', name: 'Line 16 Class A', maker: 'CRRC Zhuzhou', introduced: 2022,
    blurb: 'Line 16 serves Longgang and Pingshan in the far east, by way of the 2011 Universiade sports center.',
    ...rimmed('line'),
  },
  // ---------------------------------------------------------------- 120 km/h lines 11, 14, 20
  {
    id: 'shenzhen-l11-a', name: 'Line 11 Class A', maker: 'CRRC Zhuzhou / CRRC Changchun', introduced: 2016,
    blurb: 'The Airport Express: 8-car trains at up to 120 km/h, each with a business-class car.',
    ...classA, nose: 'rounded', ...painted(WHITE), front: WHITE,
    stripes: [band('line', 0.38, 0.42), band('line', 0.86, 0.89)],
    frontStripes: [band(FACE, 0.46, 0.9), band('line', 0.3, 0.33)],
  },
  {
    id: 'shenzhen-l14-a', name: 'Line 14 Class A', maker: 'CRRC Changchun', introduced: 2022,
    blurb: 'The Eastern Express: 120 km/h runs from Gangxia North to Pingshan with only 18 stations in 50 km.',
    ...rimmed('#F2C75C'),
  },
  {
    id: 'shenzhen-l20-a', name: 'Line 20 Class A', maker: 'CRRC Changchun', introduced: 2021,
    blurb: 'Links the airport to the Shenzhen World convention center, one of the largest exhibition halls on Earth.',
    ...rimmed('line'),
  },
];

import type { StockSpec, StockStripe } from '../types.ts';

// Delhi Metro and NCR rolling stock. Dimensions from DMRC/builder figures where published, colors from photos.
// Broad-gauge cars (Red, Yellow, Blue) are 3.2 m wide, standard-gauge cars 2.9 m; all but Rapid Metro run on 25 kV catenary.
const STAINLESS = '#C8CCD0';
const SILVER = '#C9CDD1';
const WHITE = '#EEF0F1';
const ROOF = '#8C9298';
const GLASS = '#1A1F26';
const FACE = '#1B2029';
const band = (color: StockStripe['color'], from: number, to: number): StockStripe => ({ color, from, to });

const broad = { length: 21.6, width: 3.2, height: 3.9, doors: 4, profile: 'box' as const, pantograph: true };
const standard = { length: 21.3, width: 2.9, height: 3.9, doors: 4, profile: 'box' as const, pantograph: true };
const steel = { finish: 'stainless' as const, body: STAINLESS, roof: ROOF, doorColor: STAINLESS, windowColor: GLASS };

export const stock: StockSpec[] = [
  // ---------------------------------------------------------------- broad gauge: Red, Yellow, Blue
  {
    id: 'delhi-rs1', name: 'DMRC RS1', maker: 'Mitsubishi / Hyundai Rotem / BEML', introduced: 2002,
    blurb: "Delhi's first metro trains. When they opened the line in December 2002, the crowds crashed the ticketing system.",
    ...broad, nose: 'rounded', ...steel, front: STAINLESS,
    stripes: [band('line', 0.33, 0.38)],
    frontStripes: [band(FACE, 0.5, 0.86)],
  },
  {
    id: 'delhi-movia', name: 'Bombardier MOVIA (RS2/RS3)', maker: 'Bombardier', introduced: 2009,
    blurb: 'The first cars came from Görlitz in Germany. Most of the rest were built at Savli, near Vadodara in Gujarat.',
    ...broad, length: 22.2, nose: 'rounded', finish: 'paint', body: SILVER, roof: ROOF, doorColor: SILVER, windowColor: GLASS, front: SILVER,
    stripes: [band('line', 0.3, 0.35)],
    frontStripes: [band(FACE, 0.5, 0.88)],
  },
  // ---------------------------------------------------------------- standard gauge
  {
    id: 'delhi-rs-sg-green', name: 'DMRC standard-gauge train (Green Line)', maker: 'Mitsubishi / Hyundai Rotem / BEML', introduced: 2010,
    blurb: "Ran on Delhi's first standard-gauge line in 2010, from India's first standard-gauge metro depot at Mundka.",
    ...standard, nose: 'rounded', ...steel, front: STAINLESS,
    stripes: [band('#1FAE9E', 0.12, 0.2)],
    frontStripes: [band('#1FAE9E', 0.1, 0.2), band(FACE, 0.52, 0.9)],
  },
  {
    id: 'delhi-rs-sg-violet', name: 'DMRC standard-gauge train (Violet Line)', maker: 'Mitsubishi / Hyundai Rotem / BEML', introduced: 2010,
    blurb: "Runs under Old Delhi on the 'Heritage Line', with stops at Lal Quila and Jama Masjid, then climbs out to Faridabad.",
    ...standard, nose: 'rounded', ...steel, front: STAINLESS,
    stripes: [band('#3B3F9E', 0.12, 0.2)],
    frontStripes: [band('#3B3F9E', 0.1, 0.2), band(FACE, 0.52, 0.9)],
  },
  {
    id: 'delhi-rotem-uto', name: 'Hyundai Rotem driverless train', maker: 'Hyundai Rotem / BEML', introduced: 2017,
    blurb: "India's first driverless metro trains, since December 2020 on the Magenta Line. Pink and Grey Line trains are the same design.",
    ...standard, nose: 'rounded', ...steel, front: WHITE,
    stripes: [band('line', 0.2, 0.27)],
    frontStripes: [band('line', 0.18, 0.28), band(FACE, 0.46, 0.97)],
  },
  {
    id: 'delhi-metropolis', name: 'Alstom Metropolis (Phase 4)', maker: 'Alstom', introduced: 2026,
    blurb: "Driverless Phase 4 trains from Alstom's Sri City plant, on the Pink Line ring and the new Magenta section to Deepali Chowk.",
    ...standard, nose: 'slant', ...steel, front: FACE,
    stripes: [band('line', 0.22, 0.3)],
    frontStripes: [band('line', 0.2, 0.3)],
  },
  // ---------------------------------------------------------------- Airport Express (Orange Line)
  {
    id: 'delhi-caf-airport', name: 'CAF Airport Express train', maker: 'CAF', introduced: 2011,
    blurb: "Built in Spain, with interiors modeled on Hong Kong's Airport Express. Since 2023 it has run at 120 km/h, India's fastest metro.",
    length: 22.5, width: 3.1, height: 3.9, doors: 2, profile: 'rounded', nose: 'slant',
    finish: 'paint', body: '#D2D5D8', roof: ROOF, front: '#2A2D33', doorColor: '#D2D5D8', windowColor: GLASS,
    stripes: [band('#E2432A', 0.18, 0.21)],
    frontStripes: [band('#E2432A', 0.18, 0.24)],
    pantograph: true,
  },
  // ---------------------------------------------------------------- Rapid Metro Gurgaon
  {
    id: 'delhi-rapid-metro', name: 'Rapid Metro train', maker: 'CRRC Zhuzhou / Siemens', introduced: 2013,
    blurb: 'Three-car trains on a third rail. Around DLF Cyber City they run a single-track loop.',
    length: 20, width: 2.8, height: 3.8, doors: 4, profile: 'box', nose: 'rounded',
    finish: 'paint', body: WHITE, roof: '#9AA0A6', front: WHITE, doorColor: WHITE, windowColor: GLASS,
    stripes: [band('#0F6BB0', 0.14, 0.2), band('#27C3D3', 0.2, 0.23)],
    frontStripes: [band('#27C3D3', 0.3, 0.36), band(FACE, 0.5, 0.88)],
    pantograph: false,
  },
  // ---------------------------------------------------------------- Noida Metro Aqua Line
  {
    id: 'delhi-nmrc-aqua', name: 'Noida Metro Aqua Line train', maker: 'CRRC Nanjing Puzhen', introduced: 2019,
    blurb: '14 of its 21 stations are simply named after Noida sector numbers, from Sector 51 to Sector 148.',
    ...standard, length: 22, nose: 'rounded', ...steel, front: FACE,
    stripes: [band('line', 0.24, 0.31)],
    frontStripes: [band('line', 0.18, 0.28)],
  },
  // ---------------------------------------------------------------- Namo Bharat (Delhi–Meerut RRTS)
  {
    id: 'delhi-namo-bharat', name: 'Namo Bharat', maker: 'Alstom', introduced: 2023,
    blurb: "India's first regional rapid train, built in Savli, Gujarat. At 160 km/h it gets from Delhi to Meerut in under an hour.",
    length: 22, width: 3.2, height: 3.9, doors: 3, profile: 'rounded', nose: 'bullet',
    finish: 'paint', body: '#C9CCCF', roof: '#A3A8AD', front: '#D3D6D9', doorColor: '#C9CCCF', windowColor: GLASS,
    stripes: [band('#D7262F', 0.36, 0.38)],
    frontStripes: [band('#D7262F', 0.32, 0.46), band(FACE, 0.62, 0.9)],
    pantograph: true,
  },
];

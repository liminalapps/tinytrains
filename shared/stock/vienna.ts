import type { StockSpec, StockStripe } from '../types.ts';

// Vienna, fall 2026. U1–U4 run six-car trains of three types on third rail: the SGP 'Silberpfeil' family
// (U11/U2), the walk-through Type V and the new Type X. U6 runs coupled low-floor Bombardier T/T1 light rail cars
// under wires. Trams are the red-and-white Flexity Wien (Type D) and ULF, plus the last high-floor E2 + c5 sets;
// the Badner Bahn runs Alstom Flexity 2 (Type 500) and Bombardier Type 400 cars. Colors estimated from photos.

const SILVER = '#C3C7CA';
const WL_RED = '#D4151F';
const WHITE = '#F2F2EF';
const BLACK = '#18191B';
const GLASS = '#1D2227';
const ROOF = '#9DA2A6';
const WLB_BLUE = '#0A295D';
const band = (color: StockStripe['color'], from: number, to: number): StockStripe => ({ color, from, to });

const redTram = {
  body: WHITE,
  finish: 'paint' as const,
  roof: '#DADCDC',
  front: WHITE,
  doorColor: WL_RED,
  windowColor: GLASS,
  skirt: '#2A2B2D',
  stripes: [band(WL_RED, 0.06, 0.44)],
  frontStripes: [band(WL_RED, 0.08, 0.36)],
  pantograph: true,
};

export const stock: StockSpec[] = [
  {
    id: 'vienna-u', name: 'Type U11/U2 "Silberpfeil"', maker: 'SGP', introduced: 1976,
    blurb: "The 'Silberpfeil' (silver arrow): SGP's design has run since the U-Bahn opened in 1976, in pairs of cars, three pairs a train.",
    length: 18.4, width: 2.8, height: 3.5, doors: 3, profile: 'box', nose: 'flat', pantograph: false,
    body: SILVER, finish: 'paint', roof: ROOF, front: SILVER, doorColor: SILVER, windowColor: GLASS, skirt: '#3A3D40',
    frontStripes: [band('#E6E7E4', 0.3, 0.38)],
  },
  {
    id: 'vienna-v', name: 'Type V', maker: 'Siemens / ELIN / Adtranz', introduced: 2006,
    blurb: "Vienna's first walk-through, air-conditioned U-Bahn trains: six permanently coupled cars, as long as three Silberpfeil pairs.",
    length: 18.5, width: 2.85, height: 3.5, doors: 3, profile: 'box', nose: 'slant', pantograph: false,
    body: SILVER, finish: 'paint', roof: ROOF, front: BLACK, doorColor: SILVER, windowColor: GLASS, skirt: '#3A3D40',
    stripes: [band(WL_RED, 0.42, 0.47)], frontStripes: [band(WL_RED, 0.3, 0.37)],
  },
  {
    id: 'vienna-x', name: 'Type X', maker: 'Siemens Mobility', introduced: 2023,
    blurb: 'Built to run driverless on the coming U5. Until then drivers take it along U2 and U3, and riders get a window up front.',
    length: 18.5, width: 2.85, height: 3.5, doors: 3, profile: 'box', nose: 'slant', pantograph: false,
    body: '#CBCED0', finish: 'paint', roof: ROOF, front: BLACK, doorColor: '#CBCED0', windowColor: GLASS, skirt: '#3A3D40',
    stripes: [band(WL_RED, 0.44, 0.49)], frontStripes: [band(WHITE, 0.46, 0.49)],
  },
  {
    id: 'vienna-t', name: 'Type T / T1', maker: 'Bombardier Wien', introduced: 1993,
    blurb: "U6 runs low-floor light rail cars under wires, four coupled together, over Otto Wagner's 1898 Stadtbahn viaducts.",
    length: 26.8, width: 2.65, height: 3.4, doors: 4, profile: 'tram', nose: 'slant', pantograph: true, sections: 3,
    body: SILVER, finish: 'paint', roof: ROOF, front: SILVER, doorColor: WL_RED, windowColor: GLASS, skirt: '#3A3D40',
    stripes: [band(WL_RED, 0.3, 0.36)], frontStripes: [band(WL_RED, 0.22, 0.3)],
  },
  {
    id: 'vienna-flexity', name: 'Type D (Flexity Wien)', maker: 'Bombardier / Alstom', introduced: 2018,
    blurb: "From 2018 the Flexity took over from Vienna's old high-floor trams; 146 are ordered, all in the city's red and white.",
    length: 33.8, width: 2.38, height: 3.4, doors: 6, profile: 'tram', nose: 'rounded', sections: 6, ...redTram,
  },
  {
    id: 'vienna-ulf-a', name: 'ULF A', maker: 'SGP / Siemens / ELIN', introduced: 1997,
    blurb: 'At 18 cm above the street the ULF has the lowest floor of any tram: its motors stand upright between the sections.',
    length: 24.2, width: 2.4, height: 3.45, doors: 4, profile: 'tram', nose: 'rounded', sections: 5,
    ...redTram, body: '#D9DCDD', front: '#D9DCDD', stripes: [band(WL_RED, 0.1, 0.36)],
  },
  {
    id: 'vienna-ulf-b', name: 'ULF B', maker: 'SGP / Siemens / ELIN', introduced: 1997,
    blurb: 'The long ULF: seven sections and 35 m. With about 300 in four variants, the ULF is still the commonest tram in Vienna.',
    length: 35.4, width: 2.4, height: 3.45, doors: 6, profile: 'tram', nose: 'rounded', sections: 7,
    ...redTram, body: '#D9DCDD', front: '#D9DCDD', stripes: [band(WL_RED, 0.1, 0.36)],
  },
  {
    id: 'vienna-e2', name: 'Type E2 + c5', maker: 'SGP / Bombardier (Duewag licence)', introduced: 1978,
    blurb: "Vienna's last high-floor trams, built under Duewag licence from 1978; E2 cars with c5 trailers still work a few lines.",
    length: 17.1, width: 2.2, height: 3.3, doors: 3, profile: 'streetcar', nose: 'flat', pantograph: true,
    body: WL_RED, finish: 'paint', roof: '#E8E6DF', front: WL_RED, doorColor: WL_RED, windowColor: GLASS, skirt: '#2A2B2D',
    stripes: [band('#EFEDE6', 0.48, 0.88)], frontStripes: [band('#EFEDE6', 0.46, 0.5)],
  },
  {
    id: 'vienna-wlb500', name: 'WLB Type 500', maker: 'Alstom (Flexity 2)', introduced: 2022,
    blurb: 'The Badner Bahn runs like a tram through Vienna, then as a railway out to the spa town of Baden, 27 km south.',
    length: 27.8, width: 2.55, height: 3.4, doors: 4, profile: 'tram', nose: 'rounded', pantograph: true, sections: 3,
    body: WHITE, finish: 'paint', roof: '#DADCDC', front: WLB_BLUE, doorColor: WLB_BLUE, windowColor: GLASS, skirt: WLB_BLUE,
    stripes: [band(WLB_BLUE, 0, 0.3)], frontStripes: [band(WHITE, 0.3, 0.36)],
  },
  {
    id: 'vienna-wlb400', name: 'WLB Type 400', maker: 'Bombardier Wien', introduced: 2000,
    blurb: "A Badner Bahn cousin of the U6's Type T, built by Bombardier in Vienna from 2000 and able to run on three voltages.",
    length: 26.9, width: 2.5, height: 3.4, doors: 4, profile: 'tram', nose: 'slant', pantograph: true, sections: 3,
    body: WHITE, finish: 'paint', roof: '#DADCDC', front: WHITE, doorColor: WLB_BLUE, windowColor: GLASS, skirt: WLB_BLUE,
    stripes: [band(WLB_BLUE, 0, 0.32)], frontStripes: [band(WLB_BLUE, 0.1, 0.3)],
  },
];

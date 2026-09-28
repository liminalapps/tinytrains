import type { StockSpec, StockStripe } from '../types.ts';

// Prague, fall 2026. Metro A and B run 81-71M sets (Soviet 81-71 cars rebuilt by Škoda and ČKD 1996–2011); C runs
// Siemens/ČKD M1s. Trams wear DPP red and cream: modernized Tatra T3s (single cars or coupled pairs), rebuilt
// KT8D5 articulateds, and the Škoda 14T, 15T and 52T low-floors. Esko: ČD CityElefant double-deckers, Regionova and
// RegioShark diesels, RegioJet Elf.eu units. Colors estimated from photos.

const RED = '#D2172A';
const CREAM = '#F1E9D2';
const WHITE = '#EEF0EF';
const SILVER = '#C9CDD0';
const GLASS = '#1E2328';
const DARK = '#26282B';
const ROOF = '#B9BCBE';
const band = (color: StockStripe['color'], from: number, to: number): StockStripe => ({ color, from, to });

// The classic DPP scheme: red below the waist, cream window band and roof edge.
const t3Livery = {
  body: RED,
  finish: 'paint' as const,
  roof: CREAM,
  front: RED,
  doorColor: RED,
  windowColor: GLASS,
  skirt: '#3A2A2A',
  stripes: [band(CREAM, 0.5, 1)],
  frontStripes: [band(CREAM, 0.46, 1)],
  pantograph: true,
};
// Škoda low-floors: red lower body, white-gray upper, gray cab.
const skodaLivery = {
  body: RED,
  finish: 'paint' as const,
  roof: '#DADCDD',
  front: SILVER,
  doorColor: RED,
  windowColor: GLASS,
  skirt: '#2E2E30',
  stripes: [band(WHITE, 0.42, 1)],
  pantograph: true,
};

export const stock: StockSpec[] = [
  {
    id: 'prague-8171m', name: '81-71M', maker: 'Škoda / ČKD (rebuilt Metrovagonmash 81-71)', introduced: 1996,
    blurb: 'Soviet 81-71 cars stripped to the frame and rebuilt in Plzeň, 465 of them: the hum of lines A and B since 1996.',
    length: 19.2, width: 2.71, height: 3.7, doors: 4, profile: 'box', nose: 'flat', pantograph: false,
    body: WHITE, finish: 'paint', roof: SILVER, front: SILVER, doorColor: WHITE, windowColor: GLASS, skirt: '#3B3E42',
    stripes: [band(DARK, 0.46, 0.82), band(RED, 0.32, 0.4)], frontStripes: [band(DARK, 0.48, 0.86), band(RED, 0.3, 0.38)],
  },
  {
    id: 'prague-m1', name: 'Metro M1', maker: 'ČKD / Adtranz / Siemens', introduced: 2000,
    blurb: 'Built in Prague for Prague: 53 five-car M1s took over line C by 2003, with open gangways from end to end.',
    length: 19.3, width: 2.71, height: 3.7, doors: 4, profile: 'box', nose: 'rounded', pantograph: false,
    body: '#D8DBDD', finish: 'stainless', roof: SILVER, front: '#E6E7E8', doorColor: '#D8DBDD', windowColor: GLASS, skirt: '#3B3E42',
    stripes: [band(DARK, 0.46, 0.84), band(RED, 0.2, 0.3)], frontStripes: [band(DARK, 0.5, 0.88), band(RED, 0.2, 0.3)],
  },
  {
    id: 'prague-t3', name: 'Tatra T3', maker: 'ČKD Tatra', introduced: 1962,
    blurb: 'Built a few kilometers away in Smíchov, the T3 became the most-built tram ever: over 14,000. Line 23 keeps them going.',
    length: 14.0, width: 2.5, height: 3.06, doors: 3, profile: 'streetcar', nose: 'rounded', ...t3Livery,
  },
  {
    id: 'prague-t3rp', name: 'Tatra T3R.P', maker: 'ČKD / DPP (modernized)', introduced: 1999,
    blurb: 'Old T3s with new motors and electronics, usually coupled in pairs: still the backbone of Prague’s tram lines.',
    length: 14.0, width: 2.5, height: 3.06, doors: 3, profile: 'streetcar', nose: 'rounded', ...t3Livery,
    frontStripes: [band(CREAM, 0.46, 1), band(DARK, 0.5, 0.86)],
  },
  {
    id: 'prague-t3rplf', name: 'Tatra T3R.PLF', maker: 'Pragoimex / KOS Krnov', introduced: 2005,
    blurb: 'A newly built T3 with a low-floor middle door, so a wheelchair can board even when the lead car is an old one.',
    length: 15.1, width: 2.48, height: 3.19, doors: 3, profile: 'streetcar', nose: 'slant', ...t3Livery,
    frontStripes: [band(CREAM, 0.46, 1), band(DARK, 0.5, 0.88)],
  },
  {
    id: 'prague-kt8d5', name: 'Tatra KT8D5R.N2P', maker: 'ČKD Tatra (rebuilt by DPP)', introduced: 1986,
    blurb: 'Double-ended three-section Tatras from the 1980s, rebuilt with a low-floor middle: they can turn back without a loop.',
    length: 30.3, width: 2.48, height: 3.15, doors: 4, profile: 'tram', nose: 'slant', sections: 3, ...t3Livery,
    frontStripes: [band(CREAM, 0.46, 1), band(DARK, 0.52, 0.9)],
  },
  {
    id: 'prague-14t', name: 'Škoda 14T', maker: 'Škoda Transportation', introduced: 2006,
    blurb: 'Styled by Porsche Design: 60 five-section 14Ts brought low floors to Prague, silver on top and red below.',
    length: 30.25, width: 2.46, height: 3.4, doors: 4, profile: 'tram', nose: 'slant', sections: 5,
    ...skodaLivery, stripes: [band(SILVER, 0.45, 1)], front: SILVER, frontStripes: [band(DARK, 0.5, 0.92)],
  },
  {
    id: 'prague-15t', name: 'Škoda 15T ForCity Alfa', maker: 'Škoda Transportation', introduced: 2011,
    blurb: 'Fully low-floor even over its pivoting bogies: 250 of these 31 m trams now carry most of the busiest lines.',
    length: 31.4, width: 2.46, height: 3.6, doors: 4, profile: 'tram', nose: 'slant', sections: 3,
    ...skodaLivery, frontStripes: [band(DARK, 0.48, 0.92), band(RED, 0, 0.18)],
  },
  {
    id: 'prague-52t', name: 'Škoda 52T ForCity Plus', maker: 'Škoda Group', introduced: 2025,
    blurb: 'Prague’s newest tram, in service since May 2025: air-conditioned, fully low-floor and 32 m long.',
    length: 31.99, width: 2.5, height: 3.6, doors: 4, profile: 'tram', nose: 'rounded', sections: 3,
    ...skodaLivery, front: '#9EA3A8', frontStripes: [band(DARK, 0.45, 0.93)],
  },
  {
    id: 'prague-petrin', name: 'Petřín funicular car', maker: 'Vagónka Studénka', introduced: 1985,
    blurb: 'Two cars on one cable climb 510 m up Petřín hill, passing midway at Nebozízek, where you can hop off for lunch.',
    length: 14.5, width: 2.5, height: 3.1, doors: 4, profile: 'box', nose: 'flat', pantograph: false,
    body: '#177255', finish: 'paint', roof: CREAM, front: '#177255', doorColor: '#177255', windowColor: GLASS, skirt: '#2B2B2B',
    stripes: [band(CREAM, 0.48, 1)], frontStripes: [band(CREAM, 0.48, 1)],
  },
  {
    id: 'prague-471', name: 'ČD 471 CityElefant', maker: 'ČKD Vagonka / Škoda Vagonka', introduced: 1999,
    blurb: 'Three-car double-deckers that made Esko: 83 were built in Studénka, and two coupled carry nearly 1,000 people.',
    length: 26.4, width: 2.82, height: 4.63, doors: 2, profile: 'bilevel', nose: 'slant', pantograph: true,
    body: WHITE, finish: 'paint', roof: SILVER, front: SILVER, doorColor: '#2A4F9E', windowColor: GLASS, skirt: '#2A2C30',
    stripes: [band('#2A4F9E', 0.1, 0.34), band('#D52B30', 0.62, 0.7)], frontStripes: [band(DARK, 0.55, 0.85), band('#F2C200', 0, 0.08)],
  },
  {
    id: 'prague-655', name: 'RegioJet 655 Elf.eu', maker: 'Pesa Bydgoszcz', introduced: 2025,
    blurb: 'Polish-built three-car units in RegioJet yellow on the city lines S49 and S61, with a first-class corner.',
    length: 21.7, width: 2.85, height: 4.2, doors: 2, profile: 'box', nose: 'slant', pantograph: true,
    body: '#F4C300', finish: 'paint', roof: '#9EA2A6', front: '#F4C300', doorColor: '#1E1E1E', windowColor: GLASS, skirt: '#1E1E1E',
    stripes: [band('#1E1E1E', 0.5, 0.82)], frontStripes: [band('#1E1E1E', 0.45, 0.9)],
  },
  {
    id: 'prague-814', name: 'ČD 814 Regionova', maker: 'Pars nova (rebuilt Vagónka Studénka 810)', introduced: 2005,
    blurb: '1970s Studénka railcars rebuilt with new engines, new fronts and a low-floor middle section for regional lines.',
    length: 14.2, width: 3.0, height: 3.8, doors: 1, profile: 'box', nose: 'slant', pantograph: false,
    body: '#F2C200', finish: 'paint', roof: '#8E9296', front: '#F2C200', doorColor: '#8E9296', windowColor: GLASS, skirt: '#4A4A4A',
    stripes: [band('#8E9296', 0.44, 0.84)], frontStripes: [band('#8E9296', 0.44, 0.92)],
  },
  {
    id: 'prague-844', name: 'ČD 844 RegioShark', maker: 'Pesa Bydgoszcz', introduced: 2012,
    blurb: 'A low-floor diesel railcar from Poland, nicknamed for its shark-like nose: 31 joined ČD from 2012.',
    length: 25.2, width: 2.9, height: 3.9, doors: 2, profile: 'box', nose: 'slant', pantograph: false,
    body: '#1C3F8F', finish: 'paint', roof: '#C9CDD0', front: '#1C3F8F', doorColor: '#6BB6E8', windowColor: GLASS, skirt: '#1A1F2A',
    stripes: [band(WHITE, 0.46, 0.86), band('#6BB6E8', 0.36, 0.44)], frontStripes: [band(DARK, 0.5, 0.9)],
  },
];

import type { StockSpec, StockStripe } from '../types.ts';

// Naples, fall 2026. Line 1 runs only CAF Inneo six-car trains since the Firema M1s retired in December 2024; EAV's
// Line 11 has the same trains in orange. Line 6 reopened in 2025 with its 1990s Firema T67 light-rail cars. Trenitalia
// runs Line 2 with Jazz and Pop units. The narrow-gauge Circumvesuviana mixes 1970s–80s SOFER three-body units,
// Metrostars and new Stadler trains; the Cumana and Circumflegrea share ET 400s and ET 500s. Colors from photos.

const WHITE = '#EEF0F0';
const SILVER = '#C6CACD';
const GLASS = '#1E2328';
const DARK = '#23272B';
const ROOF = '#B5B9BC';
const NAVY = '#1B2A55';
const band = (color: StockStripe['color'], from: number, to: number): StockStripe => ({ color, from, to });

const inneo = {
  length: 18.0, width: 2.8, height: 3.75, doors: 3, profile: 'box' as const, nose: 'rounded' as const, pantograph: true,
  body: WHITE, finish: 'paint' as const, roof: ROOF, front: WHITE, windowColor: GLASS, skirt: '#3A3F44',
};

export const stock: StockSpec[] = [
  {
    id: 'naples-inneo', name: 'CAF Inneo (Line 1)', maker: 'CAF', introduced: 2022,
    blurb: 'Six cars and 108 m of Spanish-built train glide through Toledo, often called the most beautiful metro station in Europe.',
    ...inneo, doorColor: '#2F8FD0',
    stripes: [band(NAVY, 0.46, 0.84), band('#2F8FD0', 0.36, 0.44)], frontStripes: [band(DARK, 0.48, 0.9), band('#2F8FD0', 0.36, 0.44)],
  },
  {
    id: 'naples-inneo-eav', name: 'CAF Inneo (Line 11)', maker: 'CAF', introduced: 2023,
    blurb: 'Line 1’s trains in EAV orange: they replaced ex-Rome MA 100s on the "Arcobaleno" line, named for its rainbow stations.',
    ...inneo, doorColor: '#F17238',
    stripes: [band(NAVY, 0.46, 0.84), band('#F17238', 0.36, 0.44)], frontStripes: [band(DARK, 0.48, 0.9), band('#F17238', 0.36, 0.44)],
  },
  {
    id: 'naples-t67', name: 'Firema T67', maker: 'Firema', introduced: 2007,
    blurb: 'Built in the 1990s for a light-rail line under Fuorigrotta, some were hauled out of the sealed tunnel before Line 6 finally reopened.',
    length: 25.4, width: 2.4, height: 3.5, doors: 4, profile: 'tram', nose: 'flat', pantograph: true, sections: 2,
    body: SILVER, finish: 'paint', roof: ROOF, front: SILVER, doorColor: '#F2B415', windowColor: GLASS, skirt: '#34383C',
    stripes: [band(DARK, 0.5, 0.86)], frontStripes: [band(DARK, 0.5, 0.9)],
  },
  {
    id: 'naples-jazz', name: 'ETR 425 Jazz', maker: 'Alstom', introduced: 2016,
    blurb: 'Five-car Coradia Stream "Jazz" units took over the 1925 Passante, the tunnel line that became Line 2.',
    length: 16.4, width: 2.95, height: 4.2, doors: 2, profile: 'box', nose: 'slant', pantograph: true,
    body: WHITE, finish: 'paint', roof: '#8A9095', front: '#9EA4A8', doorColor: '#2E5D9E', windowColor: GLASS, skirt: '#2E5D9E',
    stripes: [band(DARK, 0.5, 0.84), band('#2E5D9E', 0, 0.14), band('#3AA15A', 0.14, 0.2)], frontStripes: [band(DARK, 0.5, 0.92)],
  },
  {
    id: 'naples-pop', name: 'ETR 104 Pop', maker: 'Alstom', introduced: 2022,
    blurb: 'Coradia Stream "Pop" units sent the last ALe 724s of Line 2 into retirement in 2023.',
    length: 16.3, width: 2.9, height: 4.1, doors: 2, profile: 'box', nose: 'rounded', pantograph: true,
    body: '#D9DDE0', finish: 'paint', roof: '#BFC4C8', front: '#D9DDE0', doorColor: '#2E5D9E', windowColor: GLASS, skirt: '#3A3F44',
    stripes: [band(DARK, 0.5, 0.84), band('#2E5D9E', 0.86, 1), band('#F3A712', 0.2, 0.28), band('#D8262E', 0.28, 0.33)],
    frontStripes: [band(DARK, 0.5, 0.92), band('#F3A712', 0.2, 0.3), band('#D8262E', 0.3, 0.36)],
  },
  {
    id: 'naples-fe220', name: 'Circumvesuviana ETR 001–118', maker: 'SOFER / ASGEN', introduced: 1972,
    blurb: 'Built in Pozzuoli for the 950 mm gauge: three bodies on four bogies, the workhorses from Naples to Sorrento for 50 years.',
    length: 13.3, width: 2.7, height: 3.6, doors: 2, profile: 'box', nose: 'flat', pantograph: true,
    body: '#B3202A', finish: 'paint', roof: '#8F9498', front: '#B3202A', doorColor: '#B3202A', windowColor: GLASS, skirt: '#2E2A2A',
    stripes: [band('#E9E4D6', 0.48, 0.86)], frontStripes: [band('#E9E4D6', 0.46, 0.94), band(DARK, 0.52, 0.88)],
  },
  {
    id: 'naples-metrostar', name: 'ETR 200 Metrostar', maker: 'AnsaldoBreda / Firema', introduced: 2008,
    blurb: 'Six doors a side on a narrow-gauge train: 26 Metrostars were built to swallow Vesuvian rush hours.',
    length: 13.4, width: 2.7, height: 3.7, doors: 2, profile: 'box', nose: 'rounded', pantograph: true,
    body: WHITE, finish: 'paint', roof: SILVER, front: NAVY, doorColor: NAVY, windowColor: GLASS, skirt: NAVY,
    stripes: [band(NAVY, 0, 0.26), band('#D8262E', 0.26, 0.32), band(DARK, 0.5, 0.84)], frontStripes: [band(DARK, 0.5, 0.92), band('#D8262E', 0.26, 0.32)],
  },
  {
    id: 'naples-etr300', name: 'Stadler ETR 300', maker: 'Stadler', introduced: 2025,
    blurb: 'The first of 56 new Swiss-built narrow-gauge trains, reaching the Sorrento line in July 2026.',
    length: 13.5, width: 2.7, height: 3.8, doors: 2, profile: 'box', nose: 'slant', pantograph: true,
    body: WHITE, finish: 'paint', roof: SILVER, front: WHITE, doorColor: '#D8262E', windowColor: GLASS, skirt: '#4A4F54',
    stripes: [band(DARK, 0.5, 0.84), band('#D8262E', 0.14, 0.22)], frontStripes: [band(DARK, 0.5, 0.92), band('#D8262E', 0.14, 0.24)],
  },
  {
    id: 'naples-et400', name: 'ET 400', maker: 'Firema', introduced: 1991,
    blurb: 'Firema units built for SEPSA in the 1990s and revamped in the 2010s, running under the Vomero hill to the Phlegraean Fields.',
    length: 21.0, width: 2.85, height: 3.8, doors: 2, profile: 'box', nose: 'flat', pantograph: true,
    body: WHITE, finish: 'paint', roof: SILVER, front: WHITE, doorColor: '#2F5AA8', windowColor: GLASS, skirt: '#2F5AA8',
    stripes: [band('#2F5AA8', 0, 0.3), band(DARK, 0.5, 0.84)], frontStripes: [band(DARK, 0.5, 0.9), band('#2F5AA8', 0, 0.3)],
  },
  {
    id: 'naples-et500', name: 'ET 500 (TFA Alfa)', maker: 'Titagarh Firema', introduced: 2017,
    blurb: 'Built in Caserta by Titagarh Firema: 14 trains, delivered through 2024, for the Cumana and the Circumflegrea.',
    length: 21.0, width: 2.85, height: 3.9, doors: 2, profile: 'box', nose: 'rounded', pantograph: true,
    body: WHITE, finish: 'paint', roof: SILVER, front: '#2F5AA8', doorColor: '#D8262E', windowColor: GLASS, skirt: '#3A3F44',
    stripes: [band(DARK, 0.5, 0.84), band('#2F5AA8', 0.14, 0.24)], frontStripes: [band(DARK, 0.5, 0.92)],
  },
  {
    id: 'naples-funicular', name: 'Funicular car', maker: 'various', introduced: 1991,
    blurb: 'Naples climbs to the Vomero by cable: the Central Funicular alone carries around 10 million people a year.',
    length: 16.0, width: 2.6, height: 3.2, doors: 4, profile: 'box', nose: 'flat', pantograph: false,
    body: WHITE, finish: 'paint', roof: '#D6D9DB', front: '#1E4D9B', doorColor: '#1E4D9B', windowColor: GLASS, skirt: '#1E4D9B',
    stripes: [band('#1E4D9B', 0, 0.3), band('#F3C300', 0.3, 0.36)], frontStripes: [band(DARK, 0.45, 0.9)],
  },
];

import type { StockSpec, StockStripe } from '../types.ts';

// Budapest, fall 2026. M1 runs the tiny three-section Ganz MFAV cars under Andrássy út; M2 and M4 Alstom
// Metropolis sets (M4 driverless); M3 Metrovagonmash 81-717/714 cars rebuilt 2017–2021. The MÁV-HÉV lines run East
// German LEW MX/MXA three-car units. Trams wear BKV yellow: Siemens Combino Supras on 4-6, CAF Urbos 3s, Ganz
// CSMG/KCSV-7s, modernized Tatra T5C5Ks and second-hand Hanover TW 6000s. Colors estimated from photos.

const YELLOW = '#F2A900';
const BRIGHT = '#F7C200';
const WHITE = '#F1F0EB';
const GLASS = '#1E2328';
const DARK = '#24272A';
const ROOF = '#D9D8D2';
const METAL = '#9EA3A7';
const HEV_GREEN = '#15855F';
const band = (color: StockStripe['color'], from: number, to: number): StockStripe => ({ color, from, to });

// Classic BKV two-tone: yellow below the waist, white window band and roof.
const twoTone = {
  body: YELLOW,
  finish: 'paint' as const,
  roof: WHITE,
  front: YELLOW,
  doorColor: YELLOW,
  windowColor: GLASS,
  skirt: '#3A3A38',
  stripes: [band(WHITE, 0.5, 1)],
  frontStripes: [band(WHITE, 0.5, 1)],
  pantograph: true,
};

export const stock: StockSpec[] = [
  {
    id: 'budapest-mfav', name: 'Ganz MFAV', maker: 'Ganz-MÁVAG', introduced: 1973,
    blurb: "The 1896 Millennium Underground runs just under Andrássy út, so its cars are only 2.6 m tall: three little rooms on eight axles.",
    length: 30.4, width: 2.35, height: 2.6, doors: 6, profile: 'tram', nose: 'flat', pantograph: true, sections: 3,
    body: YELLOW, finish: 'paint', roof: '#7C6F5E', front: YELLOW, doorColor: YELLOW, windowColor: GLASS, skirt: '#4A3B2E',
    stripes: [band('#8C2A1E', 0.08, 0.14)], frontStripes: [band('#8C2A1E', 0.08, 0.14)],
  },
  {
    id: 'budapest-am5', name: 'Alstom Metropolis AM5-M2', maker: 'Alstom Konstal', introduced: 2012,
    blurb: 'Built in Poland, these five-car Metropolis sets replaced Soviet-era cars on the east–west M2, which dives under the Danube.',
    length: 20.0, width: 2.78, height: 3.7, doors: 3, profile: 'box', nose: 'rounded', pantograph: false,
    body: WHITE, finish: 'paint', roof: METAL, front: WHITE, doorColor: WHITE, windowColor: GLASS, skirt: '#3B3E42',
    stripes: [band(DARK, 0.45, 0.82), band('line', 0.4, 0.45)], frontStripes: [band(DARK, 0.5, 0.86)],
  },
  {
    id: 'budapest-81717', name: '81-717.2K / 714.2K', maker: 'Metrovagonmash (rebuilt)', introduced: 2017,
    blurb: "M3's 1980s Soviet cars were shipped back to Mytishchi and rebuilt as new: fresh bodies, new motors, same familiar bones.",
    length: 19.2, width: 2.7, height: 3.65, doors: 4, profile: 'box', nose: 'flat', pantograph: false,
    body: '#E4E6E6', finish: 'paint', roof: METAL, front: '#E4E6E6', doorColor: '#E4E6E6', windowColor: GLASS, skirt: '#3B3E42',
    stripes: [band(DARK, 0.48, 0.8), band('line', 0.12, 0.18)], frontStripes: [band(DARK, 0.5, 0.84), band('line', 0.12, 0.2)],
  },
  {
    id: 'budapest-am4', name: 'Alstom Metropolis AM4-M4', maker: 'Alstom Konstal', introduced: 2014,
    blurb: 'No driver, no cab: since 2016 these four-car sets run M4 by themselves, so the front window is the best seat in the house.',
    length: 20.0, width: 2.78, height: 3.7, doors: 3, profile: 'box', nose: 'rounded', pantograph: false,
    body: WHITE, finish: 'paint', roof: METAL, front: WHITE, doorColor: WHITE, windowColor: GLASS, skirt: '#3B3E42',
    stripes: [band(DARK, 0.45, 0.82), band('line', 0.4, 0.45)], frontStripes: [band(GLASS, 0.3, 0.9)],
  },
  {
    id: 'budapest-mxa', name: 'MX / MXA', maker: 'LEW Hennigsdorf', introduced: 1971,
    blurb: 'Green HÉV units from East Germany, two motor cars around a trailer; the last were delivered in 1983 and still carry Budapest.',
    length: 17.8, width: 2.68, height: 3.6, doors: 2, profile: 'box', nose: 'flat', pantograph: true,
    body: HEV_GREEN, finish: 'paint', roof: '#8E9591', front: HEV_GREEN, doorColor: HEV_GREEN, windowColor: GLASS, skirt: '#2B3530',
    stripes: [band(WHITE, 0.28, 0.4)], frontStripes: [band(WHITE, 0.2, 0.36)],
  },
  {
    id: 'budapest-combino', name: 'Siemens Combino Supra NF12B', maker: 'Siemens', introduced: 2006,
    blurb: 'At 54 m, the 4-6 Combinos were the longest trams in the world when new, and still carry the busiest tram line in Europe.',
    length: 54.0, width: 2.4, height: 3.5, doors: 8, profile: 'tram', nose: 'slant', pantograph: true, sections: 6,
    body: BRIGHT, finish: 'paint', roof: ROOF, front: DARK, doorColor: BRIGHT, windowColor: GLASS, skirt: '#3A3A38',
    stripes: [band(DARK, 0.42, 0.46)], frontStripes: [band(BRIGHT, 0.12, 0.3)],
  },
  {
    id: 'budapest-urbos9', name: 'CAF Urbos 3 (9 modules)', maker: 'CAF', introduced: 2016,
    blurb: "Nine modules and 56 m: the world's longest nine-section trams rumble across the Árpád and Rákóczi bridges on line 1.",
    length: 56.0, width: 2.4, height: 3.5, doors: 8, profile: 'tram', nose: 'rounded', pantograph: true, sections: 9,
    body: BRIGHT, finish: 'paint', roof: ROOF, front: BRIGHT, doorColor: BRIGHT, windowColor: GLASS, skirt: '#3A3A38',
    stripes: [band(DARK, 0.4, 0.44)], frontStripes: [band(DARK, 0.5, 0.9)],
  },
  {
    id: 'budapest-urbos5', name: 'CAF Urbos 3 (5 modules)', maker: 'CAF', introduced: 2015,
    blurb: "Over a hundred short CAFs, built in Spain from 2015, replaced Budapest's last high-floor Ganz UV trams.",
    length: 34.3, width: 2.4, height: 3.5, doors: 5, profile: 'tram', nose: 'rounded', pantograph: true, sections: 5,
    body: BRIGHT, finish: 'paint', roof: ROOF, front: BRIGHT, doorColor: BRIGHT, windowColor: GLASS, skirt: '#3A3A38',
    stripes: [band(DARK, 0.4, 0.44)], frontStripes: [band(DARK, 0.5, 0.9)],
  },
  {
    id: 'budapest-t5c5k', name: 'Tatra T5C5K', maker: 'ČKD Tatra / BKV', introduced: 1980,
    blurb: 'Built in Prague only for Budapest, these boxy Tatras climb the Buda hills in pairs, modernized with new drives since 2003.',
    length: 14.7, width: 2.5, height: 3.1, doors: 3, profile: 'streetcar', nose: 'flat', ...twoTone,
  },
  {
    id: 'budapest-tw6000', name: 'Düwag / LHB TW 6000', maker: 'Duewag / LHB', introduced: 1975,
    blurb: 'Second-hand from Hanover since 2001: the Pest lines run these high-floor Stadtbahn cars, usually two coupled together.',
    length: 28.3, width: 2.4, height: 3.4, doors: 4, profile: 'tram', nose: 'slant', pantograph: true, sections: 2,
    body: YELLOW, finish: 'paint', roof: WHITE, front: YELLOW, doorColor: YELLOW, windowColor: GLASS, skirt: '#3A3A38',
  },
  {
    id: 'budapest-csmg', name: 'Ganz CSMG', maker: 'Ganz-MÁVAG', introduced: 1967,
    blurb: "Budapest's own 'industrial articulated' tram: one-ended, so they run back to back in pairs, nicknamed Goliath.",
    length: 26.9, width: 2.3, height: 3.1, doors: 4, profile: 'streetcar', nose: 'rounded', sections: 3, ...twoTone,
  },
  {
    id: 'budapest-kcsv7', name: 'Ganz KCSV-7', maker: 'Ganz Hunslet / BKV', introduced: 1997,
    blurb: 'Ganz articulateds rebuilt with new bodies and a low-floor middle: they glide along the Danube on line 2, past Parliament.',
    length: 26.9, width: 2.3, height: 3.5, doors: 5, profile: 'streetcar', nose: 'rounded', sections: 3, ...twoTone,
  },
  {
    id: 'budapest-cog', name: 'SGP cog-wheel railcar', maker: 'SGP / BBC', introduced: 1973,
    blurb: 'Since 1874 a rack railway has climbed the Buda hills; these Austrian-built cars took over in 1973 for the climb to Széchenyi-hegy.',
    length: 16.0, width: 2.6, height: 3.4, doors: 3, profile: 'box', nose: 'flat', pantograph: true,
    body: '#C8202A', finish: 'paint', roof: '#D6D2C8', front: '#C8202A', doorColor: '#C8202A', windowColor: GLASS, skirt: '#3A2A28',
    stripes: [band(WHITE, 0.3, 0.36)], frontStripes: [band(WHITE, 0.3, 0.36)],
  },
];

import type { StockSpec, StockStripe } from '../types.ts';

// Seoul rolling stock, fall 2026. Liveries follow photos where available; 'line' stripes take the line color.
const STAINLESS = '#C8CCD0';
const ALUMINUM = '#BCC2C7';
const WHITE = '#F1F2F2';
const LIGHT_GRAY = '#D8DBDD';
const ROOF = '#8C9399';
const GLASS = '#1A1F26';
const FACE = '#16191D';
const NAVY = '#1B2A5C';
const RED = '#D6242B';
const band = (color: StockStripe['color'], from: number, to: number): StockStripe => ({ color, from, to });

// Seoul's standard "large" car: 19.5 m long, 3.12 m wide, four doors a side, overhead catenary. Lines 1–4 and
// Korail cars stand about 3.8 m tall with their AC equipment, lines 5–9 about 3.6 m.
const large = { length: 19.5, width: 3.12, height: 3.6, doors: 4, profile: 'box' as const, pantograph: true };
const tall = { ...large, height: 3.8 };
const steel = { finish: 'stainless' as const, body: STAINLESS, roof: ROOF, doorColor: STAINLESS, windowColor: GLASS };
const alu = { finish: 'stainless' as const, body: ALUMINUM, roof: ROOF, doorColor: ALUMINUM, windowColor: GLASS };
const painted = (body: string) => ({ finish: 'paint' as const, body, roof: ROOF, doorColor: body, windowColor: GLASS });
/** Older Seoul Metro trains: line-color band under the windows split by a white pinstripe, swoosh on a flat face. */
const pinstripe = { stripes: [band('line', 0.34, 0.37), band('#FFFFFF', 0.37, 0.38), band('line', 0.38, 0.41)], frontStripes: [band('line', 0.28, 0.4)] };

export const stock: StockSpec[] = [
  // ---------------------------------------------------------------- Line 1
  {
    id: 'seoul-korail-311000', name: 'Korail Class 311000', maker: 'Hyundai Rotem', introduced: 1996,
    blurb: "Fans name its generations by their faces: 'roundy', then 'snake eyes', whose 2016 batch gained a third headlight.",
    ...tall, nose: 'rounded', ...steel, front: STAINLESS,
    stripes: [band(RED, 0.41, 0.43)],
    frontStripes: [band(RED, 0.24, 0.32), band('line', 0.8, 0.9)],
  },
  {
    id: 'seoul-korail-312000', name: 'Korail Class 312000', maker: 'Woojin / Hyundai Rotem', introduced: 2019,
    blurb: "The boxy 'Cube' is Line 1's first aluminum-bodied train; its 'snout' sibling was the first there with two wipers.",
    ...tall, nose: 'flat', ...alu, front: NAVY,
    stripes: [band(RED, 0.33, 0.35)],
    frontStripes: [band(RED, 0.22, 0.26)],
  },
  {
    id: 'seoul-metro-1000', name: 'Seoul Metro 1000 series', maker: 'Hyundai Precision / Rotem', introduced: 1998,
    blurb: "Seoul Metro's own Line 1 trains wear red, not the line's blue, and were built for 110 km/h runs on Korail tracks.",
    ...tall, nose: 'flat', ...steel, front: STAINLESS,
    stripes: [band(RED, 0.4, 0.42)],
    frontStripes: [band(RED, 0.3, 0.38), band('#2BA6A0', 0.38, 0.4), band(RED, 0.88, 0.97)],
  },
  // ---------------------------------------------------------------- Line 2
  {
    id: 'seoul-metro-2000', name: 'Seoul Metro 2000 series', maker: 'Hyundai Rotem', introduced: 2005,
    blurb: 'Laps the 48.8 km Line 2 circle in about 89 minutes; the 2005 batch borrowed its side livery from Daejeon Metro.',
    ...tall, nose: 'flat', ...steel, front: FACE,
    stripes: [band('line', 0.38, 0.44)],
    frontStripes: [band('line', 0.3, 0.36), band('line', 0.9, 0.95)],
  },
  {
    id: 'seoul-metro-2000-dawonsys', name: 'Seoul Metro 2000 series (Dawonsys)', maker: 'Dawonsys', introduced: 2017,
    blurb: 'Aluminum-bodied; four 6-car sets were built just for the short Sinjeong branch to Kkachisan.',
    ...tall, nose: 'rounded', ...painted(LIGHT_GRAY), front: LIGHT_GRAY,
    stripes: [band('line', 0.32, 0.42)],
    frontStripes: [band('line', 0.2, 0.36), band(FACE, 0.48, 0.88)],
  },
  // ---------------------------------------------------------------- Line 3
  {
    id: 'seoul-metro-3000', name: 'Seoul Metro 3000 series', maker: 'Hyundai Rotem', introduced: 2010,
    blurb: "Its orange-and-sage trains cross the Han River in the open on the Dongho Bridge, next to Oksu station.",
    ...tall, nose: 'flat', ...steel, front: FACE,
    stripes: [band('#B7C6AE', 0.28, 0.38), band('line', 0.38, 0.44)],
    frontStripes: [band('line', 0.26, 0.34)],
  },
  {
    id: 'seoul-metro-3000-dawonsys', name: 'Seoul Metro 3000 series (Dawonsys)', maker: 'Dawonsys', introduced: 2021,
    blurb: "Replaced Line 3's last chopper-controlled trains, which retired in September 2022.",
    ...tall, nose: 'flat', ...painted(LIGHT_GRAY), front: '#E4E6E7',
    stripes: [band('#B7C6AE', 0.3, 0.38), band('line', 0.38, 0.41)],
    frontStripes: [band(FACE, 0.38, 0.42), band(FACE, 0.5, 0.88)],
  },
  {
    id: 'seoul-korail-3000', name: 'Korail 3000 class', maker: 'Hyundai Rotem / Woojin', introduced: 2023,
    blurb: "Korail's trains for Line 3's Ilsan section, replacing 1995 stock that ran until June 2024.",
    ...tall, nose: 'slant', ...steel, front: FACE,
    stripes: [band('line', 0.4, 0.43)],
    frontStripes: [band(NAVY, 0, 0.3), band('line', 0.3, 0.34)],
  },
  // ---------------------------------------------------------------- Line 4
  {
    id: 'seoul-metro-4000', name: 'Seoul Metro 4000 series', maker: 'Dawonsys / Hyundai Rotem / Woojin', introduced: 2020,
    blurb: "Built by three makers since 2020 to retire Line 4's 1993 trains; the Dawonsys sets share an inverter with the ITX-Maum.",
    ...tall, nose: 'rounded', ...painted(WHITE), front: FACE,
    stripes: [band(NAVY, 0.36, 0.39), band('line', 0.39, 0.44)],
    frontStripes: [band('line', 0.26, 0.32)],
  },
  {
    id: 'seoul-korail-341000', name: 'Korail Class 341000', maker: 'Hyundai Rotem', introduced: 2019,
    blurb: "Between Namtaeryeong and Seonbawi it switches from Seoul's right-hand DC running to Korail's left-hand AC.",
    ...tall, nose: 'slant', ...steel, front: STAINLESS,
    stripes: [band('line', 0.41, 0.43)],
    frontStripes: [band('line', 0.44, 0.49), band('line', 0.86, 0.91)],
  },
  // ---------------------------------------------------------------- Lines 5–8
  {
    id: 'seoul-metro-5000', name: 'Seoul Metro 5000 series', maker: 'Hyundai Precision', introduced: 1995,
    blurb: 'One inverter drives eight motors across two cars; Line 5 was the first Seoul line to tunnel under the Han River.',
    ...large, nose: 'flat', ...steel, front: STAINLESS,
    stripes: [band('line', 0.3, 0.38)],
    frontStripes: [band('line', 0.3, 0.38)],
  },
  {
    id: 'seoul-metro-5000-woojin', name: 'Seoul Metro 5000 series (Woojin)', maker: 'Woojin Industrial Systems', introduced: 2021,
    blurb: 'Among the first Seoul trains with permanent-magnet motors, marked by purple slashes near the car ends.',
    ...large, nose: 'flat', ...painted(WHITE), front: WHITE,
    stripes: [band('line', 0.36, 0.43)],
    frontStripes: [band(FACE, 0.48, 0.88), band('line', 0.3, 0.36)],
  },
  {
    id: 'seoul-metro-6000', name: 'Seoul Metro 6000 series', maker: 'Hyundai Precision / KOROS', introduced: 2000,
    blurb: 'At the west end it runs the one-way Eungam Loop; two sets were repainted olive and moved to Line 7.',
    ...large, nose: 'flat', ...steel, front: STAINLESS, ...pinstripe,
  },
  {
    id: 'seoul-metro-7000', name: 'Seoul Metro 7000 series', maker: 'Hanjin / Woojin', introduced: 1999,
    blurb: 'Line 7 crosses the Han River on the lower deck of the Cheongdam Bridge, beneath the road traffic.',
    ...large, nose: 'flat', ...steel, front: STAINLESS, ...pinstripe,
  },
  {
    id: 'seoul-metro-8000', name: 'Seoul Metro 8000 series', maker: 'Daewoo / Hanjin / Woojin', introduced: 1996,
    blurb: "The 1999 Hanjin batch were the Seoul Subway's first smooth-sided stainless trains.",
    ...large, nose: 'flat', ...steel, front: STAINLESS,
    stripes: [band('line', 0.34, 0.41)],
    frontStripes: [band('line', 0.28, 0.4)],
  },
  // ---------------------------------------------------------------- Other operators
  {
    id: 'seoul-metro9-9000', name: 'Line 9 9000 series', maker: 'Hyundai Rotem', introduced: 2009,
    blurb: "Seoul's first express subway: at stations with passing loops, express trains overtake the locals.",
    ...large, nose: 'rounded', ...steel, front: '#C9B98A',
    stripes: [band('line', 0.2, 0.4)],
    frontStripes: [band(FACE, 0.36, 0.41), band(FACE, 0.52, 0.9)],
  },
  {
    id: 'seoul-korail-351000', name: 'Korail Class 351000', maker: 'Hyundai Rotem', introduced: 2011,
    blurb: 'Bundang fans nickname its generations "flat face", "round face", "snake eyes" and "snout face".',
    ...tall, nose: 'rounded', ...steel, front: STAINLESS,
    stripes: [band('line', 0.41, 0.43)],
    frontStripes: [band('line', 0.2, 0.32), band(NAVY, 0.82, 0.9)],
  },
  {
    id: 'seoul-shinbundang-d000', name: 'Shinbundang D000', maker: 'Hyundai Rotem', introduced: 2011,
    blurb: "Korea's first driverless heavy-rail trains; each cab end has a hydraulic emergency exit door.",
    ...large, nose: 'rounded', ...steel, front: '#D4003B',
    stripes: [band('line', 0.38, 0.44), band('line', 0.92, 0.97)],
    frontStripes: [band(STAINLESS, 0, 0.3)],
  },
  {
    id: 'seoul-korail-321000', name: 'Korail Class 321000', maker: 'Hyundai Rotem', introduced: 2006,
    blurb: 'Some sets once ran as bicycle trains, their seats folding up to make room for bikes.',
    ...tall, nose: 'rounded', ...steel, front: STAINLESS,
    stripes: [band(NAVY, 0.41, 0.43)],
    frontStripes: [band(RED, 0.22, 0.3), band(NAVY, 0.82, 0.9)],
  },
  {
    id: 'seoul-korail-331000', name: 'Korail Class 331000', maker: 'Hyundai Rotem', introduced: 2009,
    blurb: 'The first Korean trains with an emergency escape ladder stowed under the car.',
    ...tall, nose: 'rounded', ...alu, front: ALUMINUM,
    stripes: [band(NAVY, 0.41, 0.43)],
    frontStripes: [band(RED, 0.22, 0.3), band(NAVY, 0.82, 0.9)],
  },
  {
    id: 'seoul-korail-361000', name: 'Korail Class 361000', maker: 'Hyundai Rotem', introduced: 2010,
    blurb: 'Its bike racks carry weekend cyclists out along the Bukhan River toward Chuncheon.',
    ...tall, nose: 'rounded', ...painted(WHITE), front: WHITE,
    stripes: [band('#1F4FA3', 0.36, 0.42)],
    frontStripes: [band('#1F4FA3', 0.3, 0.36), band('#1F4FA3', 0.84, 0.9)],
  },
  {
    id: 'seoul-arex-2000', name: 'AREX 2000 series', maker: 'Hyundai Rotem', introduced: 2007,
    blurb: 'The all-stop airport commuter; its first batch reached Yeongjong Island by ship.',
    ...large, doors: 3, nose: 'rounded', ...alu, front: '#0090D2',
    stripes: [band('line', 0.3, 0.4)],
    frontStripes: [band('#FFFFFF', 0.3, 0.32), band('#FFFFFF', 0.34, 0.36), band('#FFFFFF', 0.38, 0.4)],
  },
  {
    id: 'seoul-arex-1000', name: 'AREX 1000 series', maker: 'Hyundai Rotem', introduced: 2007,
    blurb: 'The nonstop Express Train; car 6 gave up most of its seats to carry bags checked in at Seoul Station.',
    ...large, doors: 2, nose: 'rounded', ...alu, front: '#EF7F1A',
    stripes: [band('#EF7F1A', 0.3, 0.4)],
    frontStripes: [band('#FFFFFF', 0.3, 0.32), band('#FFFFFF', 0.34, 0.36), band('#FFFFFF', 0.38, 0.4)],
  },
  {
    id: 'seoul-ui-ul000', name: 'Ui LRT UL000', maker: 'Hyundai Rotem', introduced: 2017,
    blurb: 'Driverless and fully underground; its two cars share one articulated bogie in the middle.',
    length: 12.8, width: 2.65, height: 3.4, doors: 2, profile: 'rounded', nose: 'rounded', ...painted('#B5CF2A'), front: '#B5CF2A',
    frontStripes: [band(FACE, 0.48, 0.86)],
    pantograph: false,
  },
  {
    id: 'seoul-sillim-sl000', name: 'Sillim Line SL000', maker: 'Woojin Industrial Systems', introduced: 2022,
    blurb: 'Rubber-tired and so compact that the whole 3-car train is shorter than two ordinary subway cars.',
    length: 9.6, width: 2.4, height: 3.5, doors: 2, profile: 'agt', nose: 'flat', ...painted('#E6E9EB'), front: '#E6E9EB',
    frontStripes: [band('line', 0.36, 0.42), band(FACE, 0.42, 0.84), band('line', 0.84, 0.88)],
    pantograph: false,
  },
];

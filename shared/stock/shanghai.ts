import type { StockSpec, StockStripe } from '../types.ts';

// Shanghai Metro, Maglev and Airport Link rolling stock, fall 2026. Fleet data from Shentong Metro and Wikipedia's
// line articles; liveries follow photos. 'line' stripes take the line color.
const STAINLESS = '#C4C9CE';
const SILVER = '#B9BFC5';
const WHITE = '#EEF0F1';
const PEARL = '#DDE1E4';
const ROOF = '#8A9096';
const GLASS = '#1A1F26';
const FACE = '#15181C';
const band = (color: StockStripe['color'], from: number, to: number): StockStripe => ({ color, from, to });

// Class A: 23 m long (the cab cars 24.4 m), 3 m wide, 5 doors a side; Class C (lines 5, 6 and 8): 19.5 m × 2.6 m,
// 4 doors. Everything but lines 16, 17 and the Pujiang line draws current from overhead wires.
const classA = { length: 23, width: 3.0, height: 3.8, doors: 5, profile: 'box' as const, pantograph: true };
const classC = { length: 19.5, width: 2.6, height: 3.8, doors: 4, profile: 'box' as const, pantograph: true };
const steel = { finish: 'stainless' as const, body: STAINLESS, roof: ROOF, doorColor: STAINLESS, windowColor: GLASS };
const painted = (body: string) => ({ finish: 'paint' as const, body, roof: ROOF, doorColor: body, windowColor: GLASS });

export const stock: StockSpec[] = [
  // ---------------------------------------------------------------- Line 1
  {
    id: 'shanghai-01a01', name: '01A01–01A04 (DC01 / AC01)', maker: 'Siemens / AEG / ADtranz', introduced: 1993,
    blurb: "The German-built trains that opened Shanghai's first metro line in 1993, stretched from 6 to 8 cars in 2008.",
    ...classA, nose: 'flat', ...painted('#DCDFE2'), front: FACE,
    stripes: [band('line', 0.36, 0.41)],
    frontStripes: [band('line', 0.3, 0.38)],
  },
  {
    id: 'shanghai-01a05', name: '01A05 (AC06)', maker: 'Alstom / SATCO / CRRC Nanjing Puzhen', introduced: 2007,
    blurb: 'Alstom Metropolis sets built in Shanghai and Nanjing; their curved white faces set them apart on Line 1.',
    ...classA, nose: 'rounded', ...painted(WHITE), front: WHITE,
    stripes: [band('line', 0.38, 0.42)],
    frontStripes: [band(FACE, 0.46, 0.9), band('line', 0.3, 0.36)],
  },
  {
    id: 'shanghai-01a06', name: '01A06 / 01A07', maker: 'CRRC Zhuzhou', introduced: 2017,
    blurb: "CRRC Zhuzhou built 31 of these stainless 8-car sets in 2016–2019 to start retiring Line 1's oldest trains.",
    ...classA, nose: 'rounded', ...steel, front: SILVER,
    stripes: [band('line', 0.4, 0.43)],
    frontStripes: [band(FACE, 0.46, 0.9), band('line', 0.3, 0.34)],
  },
  // ---------------------------------------------------------------- Line 2
  {
    id: 'shanghai-02a01', name: '02A01 (AC02)', maker: 'Siemens / ADtranz', introduced: 2000,
    blurb: 'Riders call the refurbished sets "watermelons" for their green stripes; one wore Love Live! art in 2014.',
    ...classA, nose: 'flat', ...painted('#E4E6E8'), front: FACE,
    stripes: [band('line', 0.36, 0.41)],
    frontStripes: [band('line', 0.3, 0.38)],
  },
  {
    id: 'shanghai-02a02', name: '02A02 (AC08)', maker: 'Alstom / SATCO / CRRC Nanjing Puzhen', introduced: 2008,
    blurb: 'Bright green faces on the metro line that links Hongqiao and Pudong airports, a ride of well over an hour.',
    ...classA, nose: 'rounded', ...painted('#D9DCDF'), front: '#7DBE3A',
    stripes: [band('line', 0.38, 0.42)],
    frontStripes: [band(WHITE, 0.14, 0.32)],
  },
  {
    id: 'shanghai-02a05', name: '02A03–02A05', maker: 'Alstom / SATCO / CRRC Zhuzhou', introduced: 2010,
    blurb: 'Some began as 4-car airport shuttles; new middle cars made them 8 long, ending the change of trains at Guanglan Road.',
    ...classA, nose: 'rounded', ...steel, body: '#B4BABF', doorColor: '#B4BABF', front: SILVER,
    stripes: [band('line', 0.36, 0.39)],
    frontStripes: [band(FACE, 0.46, 0.9), band('line', 0.28, 0.32)],
  },
  // ---------------------------------------------------------------- Lines 3 and 4
  {
    id: 'shanghai-03a01', name: '03A01 (AC03)', maker: 'Alstom / CRRC Nanjing Puzhen', introduced: 2001,
    blurb: 'Refurbished sets wear red-framed faces; Line 3 runs mostly on a viaduct along the route of an old railway.',
    ...classA, nose: 'flat', ...painted('#9FA6AD'), front: '#D7262D',
    stripes: [band('#E9EBED', 0, 0.3), band('line', 0.33, 0.37)],
    frontStripes: [band(FACE, 0.46, 0.92), band('#E9EBED', 0.12, 0.3)],
  },
  {
    id: 'shanghai-03a02', name: '03A02 / 04A02', maker: 'Alstom / SATCO / CRRC Changchun', introduced: 2015,
    blurb: 'Yellow and purple stripes let one fleet serve both lines 3 and 4, which share tracks from Hongqiao Road to Baoshan Road.',
    ...classA, nose: 'rounded', ...painted('#E6E8EA'), front: '#23262B',
    stripes: [band('#FCD600', 0.4, 0.43), band('#461D84', 0.37, 0.4)],
    frontStripes: [band('#FCD600', 0.3, 0.33)],
  },
  {
    id: 'shanghai-04a01', name: '04A01 (AC05)', maker: 'Siemens / CRRC Zhuzhou', introduced: 2005,
    blurb: "Line 4's loop only closed in 2007, after a tunnel section that collapsed by the Huangpu in 2003 was rebuilt.",
    ...classA, nose: 'flat', ...painted('#DDE0E3'), front: '#DDE0E3',
    stripes: [band('line', 0.36, 0.4)],
    frontStripes: [band(FACE, 0.46, 0.9), band('line', 0.3, 0.36)],
  },
  // ---------------------------------------------------------------- Line 5
  {
    id: 'shanghai-05c01', name: '05C01 (AC11)', maker: 'Alstom / SATCO', introduced: 2003,
    blurb: 'Four-car sets with no gangways between cars, left to shuttle the Minhang Development Zone branch.',
    ...classC, nose: 'rounded', ...steel, front: SILVER,
    stripes: [band('#E8541E', 0.38, 0.4), band('#C8102E', 0.35, 0.37)],
    frontStripes: [band(FACE, 0.46, 0.9)],
  },
  {
    id: 'shanghai-05c02', name: '05C02', maker: 'CRRC Changchun', introduced: 2018,
    blurb: "Six-car sets for which the main line's platforms were lengthened from 4 cars in 2018.",
    ...classC, nose: 'rounded', ...painted(WHITE), front: FACE,
    stripes: [band('line', 0.38, 0.42)],
    frontStripes: [band('line', 0.24, 0.28)],
  },
  // ---------------------------------------------------------------- Line 6
  {
    id: 'shanghai-06c01', name: '06C01–06C03 (AC12 / AC14)', maker: 'Alstom / SATCO / CRRC Changchun', introduced: 2007,
    blurb: 'Four slim cars per train: Line 6 was built for narrow Class C cars, and riders squeeze in at rush hour.',
    ...classC, nose: 'rounded', ...painted(WHITE), front: WHITE,
    stripes: [band('line', 0.36, 0.4)],
    frontStripes: [band(FACE, 0.46, 0.9), band('line', 0.3, 0.36)],
  },
  {
    id: 'shanghai-06c04', name: '06C04', maker: 'CRRC Changchun', introduced: 2019,
    blurb: 'Magenta "eyebrows" over the headlights; 26 sets were delivered in 2018–2020 to cut the wait on Line 6.',
    ...classC, nose: 'rounded', ...painted(WHITE), front: FACE,
    stripes: [band('line', 0.38, 0.42)],
    frontStripes: [band('line', 0.3, 0.34)],
  },
  // ---------------------------------------------------------------- Line 7
  {
    id: 'shanghai-07a01', name: '07A01 (AC10)', maker: 'Bombardier / CRRC Nanjing Puzhen', introduced: 2009,
    blurb: 'Bombardier Movia sets that fans call "Fanta" trains for their orange stripes.',
    ...classA, nose: 'rounded', ...painted('#DEE1E4'), front: '#DEE1E4',
    stripes: [band('line', 0.37, 0.41)],
    frontStripes: [band(FACE, 0.46, 0.9), band('line', 0.28, 0.35)],
  },
  {
    id: 'shanghai-07a02', name: '07A02 / 07A03', maker: 'CRRC Changchun', introduced: 2017,
    blurb: 'Black faces split by an orange stripe; the same design in blue runs on Line 9.',
    ...classA, nose: 'rounded', ...steel, front: FACE,
    stripes: [band('line', 0.4, 0.43)],
    frontStripes: [band('line', 0.12, 0.97)],
  },
  // ---------------------------------------------------------------- Line 8
  {
    id: 'shanghai-08c01', name: '08C01 (AC07)', maker: 'Alstom / SATCO', introduced: 2007,
    blurb: 'Blue-faced Alstom sets; their first six cars were built by CAF in Spain.',
    ...classC, nose: 'rounded', ...steel, body: '#A9B0B7', doorColor: '#A9B0B7', front: '#1E8FD2',
    stripes: [band('#6FA8DC', 0.4, 0.43)],
    frontStripes: [band(WHITE, 0.14, 0.3)],
  },
  {
    id: 'shanghai-08c02', name: '08C02–08C04 (AC15)', maker: 'CRRC Changchun', introduced: 2009,
    blurb: "Line 8 is the only Shanghai line with 7-car trains, which it has run since 2009.",
    ...classC, nose: 'rounded', ...steel, front: '#E7E9EB',
    stripes: [band('line', 0.4, 0.43)],
    frontStripes: [band(FACE, 0.46, 0.9), band('line', 0.3, 0.34)],
  },
  // ---------------------------------------------------------------- Line 9
  {
    id: 'shanghai-09a02', name: '09A01 / 09A02 (AC04 / AC09)', maker: 'Bombardier / CRRC Nanjing Puzhen', introduced: 2007,
    blurb: 'Five of these Movias were lent out as the Expo line in 2010; Line 9 now runs trains every 1 min 50 s at peak.',
    ...classA, nose: 'rounded', ...painted('#E3E6E8'), front: '#E3E6E8',
    stripes: [band('line', 0.37, 0.41)],
    frontStripes: [band(FACE, 0.46, 0.9), band('line', 0.28, 0.35)],
  },
  {
    id: 'shanghai-09a03', name: '09A03 / 09A04', maker: 'Bombardier / CRRC Changchun', introduced: 2017,
    blurb: 'Black faces with a sky-blue stripe down the middle; Line 9 runs west past Sheshan to Songjiang.',
    ...classA, nose: 'rounded', ...steel, front: FACE,
    stripes: [band('line', 0.4, 0.43)],
    frontStripes: [band('line', 0.12, 0.97)],
  },
  // ---------------------------------------------------------------- Line 10
  {
    id: 'shanghai-10a01', name: '10A01 / 10A02 (AC13)', maker: 'Alstom / SATCO / CRRC Nanjing Puzhen', introduced: 2010,
    blurb: "Driverless since 2014, a first in Shanghai; the cab walls came out in 2020–22 so riders can watch the track ahead.",
    ...classA, nose: 'rounded', ...steel, front: '#B7A2D6',
    stripes: [band('line', 0.38, 0.42)],
    frontStripes: [band(FACE, 0.46, 0.9)],
  },
  // ---------------------------------------------------------------- Line 11
  {
    id: 'shanghai-11a01', name: '11A01–11A03 (AC16)', maker: 'CRRC Zhuzhou / CRRC Changchun', introduced: 2009,
    blurb: "Trains reach Huaqiao in Jiangsu: in 2013 Line 11 became the first metro in China to cross a provincial border.",
    ...classA, nose: 'rounded', ...steel, front: SILVER,
    stripes: [band('line', 0.4, 0.42)],
    frontStripes: [band(FACE, 0.46, 0.9), band('line', 0.3, 0.33)],
  },
  // ---------------------------------------------------------------- Line 12
  {
    id: 'shanghai-12a01', name: '12A01 / 12A02 (AC09B)', maker: 'Bombardier / CRRC Nanjing Puzhen', introduced: 2013,
    blurb: 'The same Bombardier Movia design as lines 7 and 9, dressed in a double green stripe.',
    ...classA, nose: 'rounded', ...painted('#E6E8EA'), front: '#E6E8EA',
    stripes: [band('line', 0.36, 0.38), band('line', 0.4, 0.42)],
    frontStripes: [band(FACE, 0.46, 0.9), band('line', 0.3, 0.35)],
  },
  {
    id: 'shanghai-12a03', name: '12A03', maker: 'CRRC Changchun', introduced: 2019,
    blurb: 'USB charging ports are tucked into the seats of these 19 sets, delivered in 2018–2020.',
    ...classA, nose: 'rounded', ...steel, front: FACE,
    stripes: [band('line', 0.4, 0.43)],
    frontStripes: [band('line', 0.12, 0.97)],
  },
  // ---------------------------------------------------------------- Line 13
  {
    id: 'shanghai-13a01', name: '13A01–13A03 (AC18)', maker: 'CRRC Nanjing Puzhen', introduced: 2012,
    blurb: 'Pink-striped sets for the line that served the Expo 2010 site; 13A03 trains are arriving for its extensions.',
    ...classA, nose: 'rounded', ...painted('#E4E6E8'), front: '#E4E6E8',
    stripes: [band('line', 0.37, 0.41)],
    frontStripes: [band(FACE, 0.46, 0.9), band('line', 0.3, 0.35)],
  },
  // ---------------------------------------------------------------- Lines 14, 15, 18: driverless
  {
    id: 'shanghai-14a01', name: '14A01', maker: 'CRRC Nanjing Puzhen', introduced: 2021,
    blurb: 'Driverless 8-car trains; Line 14, opened in 2021, crosses central Puxi to Lujiazui.',
    ...classA, nose: 'rounded', ...steel, front: '#2A2E33',
    stripes: [band('line', 0.4, 0.43)],
    frontStripes: [band('line', 0.3, 0.33)],
  },
  {
    id: 'shanghai-15a01', name: '15A01', maker: 'Alstom / SATCO / CRRC Changchun', introduced: 2021,
    blurb: 'A café-brown oval frames the windshield; with no cab wall, the front seats get a driverless view of the tunnel.',
    ...classA, nose: 'rounded', ...painted(WHITE), front: '#A68F6A',
    stripes: [band('line', 0.38, 0.42)],
    frontStripes: [band(WHITE, 0.12, 0.28)],
  },
  {
    id: 'shanghai-18a01', name: '18A01 / 18A02', maker: 'CRRC Zhuzhou', introduced: 2020,
    blurb: 'Driverless, with an open front window and wireless phone chargers in every car.',
    ...classA, nose: 'rounded', ...steel, front: WHITE,
    stripes: [band('line', 0.4, 0.43)],
    frontStripes: [band(FACE, 0.46, 0.9), band('line', 0.3, 0.33)],
  },
  // ---------------------------------------------------------------- Lines 16 and 17: third rail
  {
    id: 'shanghai-16a01', name: '16A01 / 16A02 (AC19)', maker: 'Siemens / CRRC Zhuzhou', introduced: 2013,
    blurb: 'Three wide doors a side and forward-facing seats for 120 km/h runs out to Dishui Lake; 3-car units run in pairs.',
    ...classA, doors: 3, nose: 'rounded', ...steel, front: '#E8EAEC',
    stripes: [band('line', 0.38, 0.42)],
    frontStripes: [band(FACE, 0.46, 0.9), band('line', 0.3, 0.34)],
    pantograph: false,
  },
  {
    id: 'shanghai-17a01', name: '17A01 / 17A02', maker: 'CRRC Changchun / SATCO', introduced: 2017,
    blurb: 'Rides 100 km/h third-rail track west to the water town of Zhujiajiao; announcements come in Shanghainese too.',
    ...classA, nose: 'rounded', ...steel, front: '#3A3F45',
    stripes: [band('line', 0.4, 0.43)],
    frontStripes: [band('#D22B2B', 0.28, 0.31)],
    pantograph: false,
  },
  // ---------------------------------------------------------------- Pujiang line
  {
    id: 'shanghai-innovia-apm300', name: 'Innovia APM 300', maker: 'CRRC Puzhen Bombardier', introduced: 2018,
    blurb: "Shanghai's only rubber-tired line: driverless 4-car sets glide on concrete tracks through Pujiang town.",
    length: 12.8, width: 2.85, height: 3.5, doors: 2, profile: 'agt', nose: 'rounded', ...painted('#D3D7DB'), front: '#D3D7DB',
    stripes: [band('#F4F5F6', 0.86, 0.97)],
    frontStripes: [band(FACE, 0.44, 0.9)],
    pantograph: false,
  },
  // ---------------------------------------------------------------- Maglev and Airport Link
  {
    id: 'shanghai-transrapid-smt', name: 'Transrapid SMT', maker: 'Siemens / ThyssenKrupp', introduced: 2004,
    blurb: "The world's first commercial high-speed maglev floats 30 km to Pudong Airport in about 8 minutes at 300 km/h.",
    length: 26, width: 3.7, height: 4.2, doors: 2, profile: 'monorail', nose: 'bullet', ...painted('#F2F3F4'), front: '#F2F3F4',
    stripes: [band('#E07B28', 0.3, 0.32), band('#1E5AA8', 0.33, 0.36)],
    frontStripes: [band('#1E5AA8', 0.3, 0.33)],
    pantograph: false,
  },
  {
    id: 'shanghai-ccd2031', name: 'CRRC Changchun CCD2031', maker: 'CRRC Changchun', introduced: 2024,
    blurb: 'Links Hongqiao and Pudong airports in about 40 minutes at 160 km/h, through a tunnel dug by a 14 m-wide shield.',
    length: 24.5, width: 3.3, height: 3.8, doors: 3, profile: 'rounded', nose: 'bullet', ...painted('#EEF0F2'), front: '#EEF0F2',
    stripes: [band('#1D4E9E', 0.3, 0.36), band('#4DA3DC', 0.36, 0.38)],
    frontStripes: [band('#1D4E9E', 0.3, 0.4)],
    pantograph: true,
  },
];

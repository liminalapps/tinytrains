import type { StockSpec, StockStripe } from '../types.ts';

// Osaka Metro, its through-running partners and JR West's Loop Line. Dimensions from the builders' figures
// (Japanese Wikipedia); colors from photos. Osaka Metro's large-profile lines take 750 V from a third rail; the
// Sakaisuji and the two linear-motor lines use overhead wires.
const STAINLESS = '#C6CACD';
const ALUMINUM = '#BFC4C8';
const WHITE = '#F1F2F2';
const ROOF = '#8F959B';
const GLASS = '#1B2128';
const FACE = '#16181B';
const band = (color: StockStripe['color'], from: number, to: number): StockStripe => ({ color, from, to });

/** Osaka Metro's standard large-profile car: 18.9 m, four doors, third rail. */
const large = { length: 18.7, width: 2.88, height: 3.745, doors: 4, profile: 'box' as const, pantograph: false };
const steel = { finish: 'stainless' as const, body: STAINLESS, roof: ROOF, doorColor: STAINLESS, windowColor: GLASS };
/** JR West 20 m three-door suburban car on 1.5 kV overhead. */
const jr = { length: 19.5, width: 2.95, height: 3.68, doors: 3, profile: 'box' as const, pantograph: true };

/** New Tram 200 series: white cars, each set with its own front color. */
const newTram = (color: string, name: string, blurb: string): StockSpec => ({
  id: `osaka-200-${name}`, name: `New Tram 200 series (${name})`, maker: 'Niigata Transys', introduced: 2016, blurb,
  length: 7.6, width: 2.29, height: 3.17, doors: 1, profile: 'agt', nose: 'rounded',
  finish: 'paint', body: WHITE, roof: '#C9CDD1', front: color, doorColor: WHITE, windowColor: GLASS,
  stripes: [band(color, 0.08, 0.2)],
  frontStripes: [band(FACE, 0.5, 0.9)],
  pantograph: false,
});
const SEVEN = 'Delivered in seven colors, one per train: blue, yellow, pink, green, orange, purple and red. Set 14 is gold.';

export const stock: StockSpec[] = [
  // ---------------------------------------------------------------- Osaka Metro, third rail
  {
    id: 'osaka-new20', name: 'New 20 series (21–25 series)', maker: 'Kawasaki / Kinki Sharyo / Alna Koki / Hitachi', introduced: 1990,
    blurb: "One design for five lines: series 21 to 25 have run Osaka's subways since 1990, told apart by their stripe colors.",
    ...large, nose: 'flat', ...steel, front: FACE,
    stripes: [band('line', 0.36, 0.39)],
    frontStripes: [band('line', 0.26, 0.31)],
  },
  {
    id: 'osaka-30000', name: '30000 series', maker: 'Kawasaki / Kinki Sharyo', introduced: 2009,
    blurb: 'On the Midosuji Line these replaced the last 10 series trains, in service since 1976, in 2022.',
    ...large, nose: 'rounded', ...steel, front: STAINLESS,
    stripes: [band('line', 0.36, 0.4)],
    frontStripes: [band('line', 0.12, 0.4), band(FACE, 0.46, 0.94)],
  },
  {
    id: 'osaka-30000a', name: '30000A series', maker: 'Kawasaki', introduced: 2022,
    blurb: 'Built for extra Expo 2025 trains on the Chuo Line, then moved to the Tanimachi Line once the Expo closed.',
    ...large, nose: 'flat', ...steel, front: FACE,
    stripes: [band('line', 0.36, 0.4)],
    frontStripes: [band('line', 0.14, 0.24)],
  },
  {
    id: 'osaka-400', name: '400 series', maker: 'Hitachi', introduced: 2023,
    blurb: "Hitachi built 23 of these for the Chuo Line's run to the Expo 2025 site. The design won the 2024 Laurel Prize.",
    ...large, length: 18.2, width: 2.8, nose: 'flat', finish: 'stainless', body: ALUMINUM, roof: ROOF, front: FACE, doorColor: ALUMINUM, windowColor: GLASS,
    stripes: [band('line', 0.9, 0.93), band(FACE, 0.36, 0.4)],
    frontStripes: [band('line', 0.06, 0.1), band('line', 0.93, 0.97)],
  },
  {
    id: 'osaka-kitakyu-9000', name: 'Kita-Osaka Kyuko 9000 series', maker: 'Kinki Sharyo', introduced: 2014,
    blurb: 'Runs through onto the Midosuji Line. Its own line was extended north to Minoh-Kayano in March 2024.',
    ...large, length: 18.7, width: 2.8, nose: 'flat', ...steel, front: '#A9AFB4',
    stripes: [band('#D7282F', 0.36, 0.39)],
    frontStripes: [band('#D7282F', 0.26, 0.3), band(FACE, 0.46, 0.9)],
  },
  {
    id: 'osaka-kitakyu-8000', name: "Kita-Osaka Kyuko 8000 series 'Pole Star'", maker: 'Alna Koki', introduced: 1986,
    blurb: "The 1986 'Pole Star' won the Laurel Prize and still wears Kita-Kyu's red and brown bands on Midosuji runs.",
    ...large, length: 18.74, width: 2.89, nose: 'flat', finish: 'paint', body: '#EEEAE0', roof: '#A7ABAE', front: '#EEEAE0', doorColor: '#EEEAE0', windowColor: GLASS,
    stripes: [band('#6B3A2C', 0.2, 0.23), band('#D22630', 0.3, 0.44)],
    frontStripes: [band('#D22630', 0.3, 0.44), band(FACE, 0.52, 0.88)],
  },
  {
    id: 'osaka-kintetsu-7000', name: 'Kintetsu 7000/7020 series', maker: 'Kinki Sharyo', introduced: 1986,
    blurb: 'Kintetsu\'s third-rail trains for the Keihanna Line, which climb through the Ikoma Tunnel at up to 95 km/h.',
    length: 18.7, width: 2.9, height: 3.745, doors: 4, profile: 'box', nose: 'slant',
    finish: 'paint', body: '#F2F2F0', roof: '#A5AAAE', front: '#EE7A1F', doorColor: '#F2F2F0', windowColor: GLASS,
    stripes: [band('#EE7A1F', 0.34, 0.4), band('#2F5DA8', 0.31, 0.33)],
    frontStripes: [band(FACE, 0.5, 0.9)],
    pantograph: false,
  },
  // ---------------------------------------------------------------- Sakaisuji Line (overhead wires, through onto Hankyu)
  {
    id: 'osaka-66', name: '66 series', maker: 'Kawasaki / Kinki Sharyo / Alna Koki / Hitachi', introduced: 1990,
    blurb: 'Shares the Sakaisuji Line with maroon Hankyu trains and runs through onto Hankyu tracks to Kita-Senri and Takatsuki-shi.',
    length: 18.9, width: 2.8, height: 3.8, doors: 3, profile: 'box', nose: 'flat', ...steel, front: FACE,
    stripes: [band('line', 0.36, 0.39), band('#E58A2E', 0.34, 0.36)],
    frontStripes: [band('line', 0.24, 0.3)],
    pantograph: true,
  },
  {
    id: 'osaka-hankyu', name: 'Hankyu 7300/8300/1300 series', maker: 'Alna Koki / Hitachi', introduced: 1982,
    blurb: "Hankyu's glossy maroon trains run through onto the Sakaisuji subway all the way down to Tengachaya.",
    length: 18.3, width: 2.78, height: 3.8, doors: 3, profile: 'box', nose: 'flat',
    finish: 'paint', body: '#5A1420', roof: '#8F959B', front: '#5A1420', doorColor: '#5A1420', windowColor: GLASS,
    stripes: [band('#E8E1CF', 0.87, 0.96)],
    frontStripes: [band('#E8E1CF', 0.92, 1), band(FACE, 0.52, 0.86)],
    pantograph: true,
  },
  // ---------------------------------------------------------------- linear-motor lines
  {
    id: 'osaka-70', name: '70 series', maker: 'Kawasaki / Kinki Sharyo / Alna Koki / Hitachi', introduced: 1990,
    blurb: "Japan's first linear-motor subway trains, built small for small tunnels when the line opened for the 1990 flower expo.",
    length: 15.6, width: 2.49, height: 3.12, doors: 3, profile: 'box', nose: 'flat',
    finish: 'stainless', body: ALUMINUM, roof: ROOF, front: '#B8D34A', doorColor: ALUMINUM, windowColor: GLASS,
    stripes: [band('line', 0.34, 0.4), band('#1E4E9C', 0.31, 0.33)],
    frontStripes: [band(FACE, 0.52, 0.9), band('#1E4E9C', 0.24, 0.3)],
    pantograph: true,
  },
  {
    id: 'osaka-80', name: '80 series', maker: 'Kawasaki / Kinki Sharyo', introduced: 2006,
    blurb: "Linear-motor trains for the Imazatosuji Line, which opened in 2006 as Osaka's newest subway line.",
    length: 15, width: 2.49, height: 3.11, doors: 3, profile: 'box', nose: 'slant',
    finish: 'stainless', body: ALUMINUM, roof: ROOF, front: '#EE7B1A', doorColor: ALUMINUM, windowColor: GLASS,
    stripes: [band('line', 0.36, 0.4)],
    frontStripes: [band(FACE, 0.5, 0.92)],
    pantograph: true,
  },
  // ---------------------------------------------------------------- New Tram (Nanko Port Town Line), driverless AGT
  newTram('#2C6FC6', 'blue', SEVEN),
  newTram('#F2C230', 'yellow', SEVEN),
  newTram('#E77FB0', 'pink', SEVEN),
  newTram('#3FA64C', 'green', SEVEN),
  newTram('#EE8B2B', 'orange', SEVEN),
  newTram('#7D56A8', 'purple', SEVEN),
  newTram('#D7282F', 'red', SEVEN),
  newTram('#C9A548', 'gold', 'Set 14 was painted gold to celebrate the birth of Osaka Metro in April 2018.'),
  // ---------------------------------------------------------------- JR West
  {
    id: 'osaka-jr-323', name: 'JR West 323 series', maker: 'Kawasaki / Kinki Sharyo', introduced: 2016,
    blurb: 'Every Loop Line local has been a 323 since 2019, when the last orange 103 and 201 series retired.',
    ...jr, nose: 'rounded', ...steel, front: FACE,
    stripes: [band('#F08300', 0.86, 0.9), band('#F08300', 0.34, 0.37)],
    frontStripes: [band('#F08300', 0.22, 0.28), band('#F08300', 0.92, 0.96)],
  },
  {
    id: 'osaka-jr-223', name: 'JR West 223/225 series (Hanwa Line)', maker: 'Kawasaki / Kinki Sharyo', introduced: 1994,
    blurb: 'The Kansai Airport Rapid runs coupled to a Kishuji Rapid for Wakayama and splits from it at Hineno.',
    ...jr, nose: 'slant', ...steel, front: '#5D6166',
    stripes: [band('#1E4E9C', 0.36, 0.39), band('#63B6E4', 0.33, 0.36)],
    frontStripes: [band(FACE, 0.48, 0.9), band('#1E4E9C', 0.36, 0.42)],
  },
  {
    id: 'osaka-jr-221', name: 'JR West 221 series', maker: 'Kinki Sharyo / Kawasaki / Hitachi', introduced: 1989,
    blurb: "The 1989 'Amenity Liner' that set JR West's style still works every Yamatoji Rapid around the Loop Line.",
    ...jr, length: 19.7, height: 3.66, nose: 'slant', finish: 'paint', body: '#EFEBDF', roof: '#A2A6AA', front: '#EFEBDF', doorColor: '#EFEBDF', windowColor: GLASS,
    stripes: [band('#5A3A2E', 0.33, 0.36), band('#E8A15A', 0.36, 0.38)],
    frontStripes: [band(FACE, 0.46, 0.9), band('#5A3A2E', 0.33, 0.36)],
  },
  // ---------------------------------------------------------------- Hankyu (maroon, with an ivory roof edge)
  {
    id: 'osaka-hankyu-1000', name: 'Hankyu 1000 series', maker: 'Hitachi', introduced: 2013,
    blurb: "Every Hankyu train wears the same glossy maroon. Hitachi's aluminum 1000 series carries it on the Kobe and Takarazuka lines.",
    length: 18.9, width: 2.77, height: 3.85, doors: 3, profile: 'box', nose: 'flat',
    finish: 'paint', body: '#5A1420', roof: ROOF, front: '#5A1420', doorColor: '#5A1420', windowColor: GLASS,
    stripes: [band('#E8E1CF', 0.87, 0.96)],
    frontStripes: [band('#E8E1CF', 0.9, 0.98), band(FACE, 0.5, 0.86)],
    pantograph: true,
  },
  {
    id: 'osaka-hankyu-9300', name: 'Hankyu 9300 series', maker: 'Hitachi', introduced: 2003,
    blurb: 'Kyoto Line limited expresses since 2003, with two-by-two cross seats behind the maroon paint.',
    length: 18.3, width: 2.78, height: 3.85, doors: 3, profile: 'box', nose: 'rounded',
    finish: 'paint', body: '#5A1420', roof: ROOF, front: '#5A1420', doorColor: '#5A1420', windowColor: GLASS,
    stripes: [band('#E8E1CF', 0.87, 0.96)],
    frontStripes: [band('#E8E1CF', 0.9, 0.98), band(FACE, 0.5, 0.86)],
    pantograph: true,
  },
  // ---------------------------------------------------------------- Hanshin
  {
    id: 'osaka-hanshin-8000', name: 'Hanshin 8000 series', maker: 'Kawasaki / Kinki Sharyo / Hitachi', introduced: 1984,
    blurb: "Hanshin's expresses wear vermilion and cream and its all-stations trains blue. Fans call them the 'red' and 'blue' cars.",
    length: 18.4, width: 2.8, height: 3.8, doors: 3, profile: 'box', nose: 'flat',
    finish: 'paint', body: '#F0EEE6', roof: ROOF, front: '#E8582A', doorColor: '#F0EEE6', windowColor: GLASS,
    stripes: [band('#E8582A', 0.5, 1)],
    frontStripes: [band(FACE, 0.52, 0.86)],
    pantograph: true,
  },
  {
    id: 'osaka-hanshin-1000', name: 'Hanshin 1000 series', maker: 'Kinki Sharyo / Kawasaki', introduced: 2007,
    blurb: 'Built for the 2009 Hanshin Namba Line, it runs through from Kobe to Kintetsu Nara.',
    length: 18.4, width: 2.75, height: 3.8, doors: 3, profile: 'box', nose: 'flat', ...steel, front: STAINLESS,
    stripes: [band('#F39800', 0.9, 0.98), band('#F39800', 0.34, 0.37)],
    frontStripes: [band('#F39800', 0.88, 0.98), band(FACE, 0.5, 0.86)],
    pantograph: true,
  },
  {
    id: 'osaka-hanshin-5700', name: "Hanshin 5700 series 'Jet Silver 5700'", maker: 'Kinki Sharyo', introduced: 2015,
    blurb: 'Won the 2016 Blue Ribbon Award. Quick acceleration keeps these all-stations trains ahead of the expresses behind them.',
    length: 18.4, width: 2.8, height: 3.8, doors: 4, profile: 'box', nose: 'flat', ...steel, front: '#2B3A55',
    stripes: [band('#1F64B1', 0.9, 0.98), band('#5AA3E0', 0.3, 0.34)],
    frontStripes: [band('#1F64B1', 0.2, 0.3), band(FACE, 0.5, 0.88)],
    pantograph: true,
  },
  // ---------------------------------------------------------------- Keihan
  {
    id: 'osaka-keihan-8000', name: 'Keihan 8000 series', maker: 'Kawasaki', introduced: 1989,
    blurb: 'The classic red-and-yellow Keihan limited express, with a double-decker car and a pay-extra Premium Car.',
    length: 18.7, width: 2.72, height: 3.9, doors: 2, profile: 'box', nose: 'rounded',
    finish: 'paint', body: '#C8102E', roof: ROOF, front: '#C8102E', doorColor: '#C8102E', windowColor: GLASS,
    stripes: [band('#F5C400', 0, 0.36), band('#F2E8D5', 0.36, 0.38)],
    frontStripes: [band('#F5C400', 0, 0.36), band(FACE, 0.48, 0.88)],
    pantograph: true,
  },
  {
    id: 'osaka-keihan-3000', name: 'Keihan 3000 series', maker: 'Kawasaki', introduced: 2008,
    blurb: 'Built for the 2008 Nakanoshima Line in white and deep blue. Since 2021 it also carries a Premium Car.',
    length: 18.2, width: 2.72, height: 3.9, doors: 3, profile: 'box', nose: 'rounded',
    finish: 'paint', body: '#F2F2F0', roof: ROOF, front: '#1D2A6B', doorColor: '#F2F2F0', windowColor: GLASS,
    stripes: [band('#1D2A6B', 0, 0.3), band('#3E7CC4', 0.3, 0.33)],
    frontStripes: [band(FACE, 0.46, 0.88)],
    pantograph: true,
  },
  {
    id: 'osaka-keihan-13000', name: 'Keihan 13000 series', maker: 'Kawasaki', introduced: 2012,
    blurb: "Keihan's everyday train since 2012: aluminum bodies in the company's white with two shades of green.",
    length: 18.2, width: 2.72, height: 3.9, doors: 3, profile: 'box', nose: 'flat',
    finish: 'paint', body: '#F4F5F2', roof: ROOF, front: FACE, doorColor: '#F4F5F2', windowColor: GLASS,
    stripes: [band('#0B7A4B', 0.33, 0.37), band('#8CC63F', 0.37, 0.39)],
    frontStripes: [band('#0B7A4B', 0.22, 0.28)],
    pantograph: true,
  },
  // ---------------------------------------------------------------- Nankai
  {
    id: 'osaka-nankai-50000', name: "Nankai 50000 series 'rapi:t'", maker: 'Kawasaki', introduced: 1994,
    blurb: 'Oval windows and a bulging blue face remind fans of the robot Tetsujin 28-go. It won the 1995 Blue Ribbon Award.',
    length: 20.5, width: 2.85, height: 3.9, doors: 1, profile: 'rounded', nose: 'bullet',
    finish: 'paint', body: '#232C7A', roof: '#1C2361', front: '#232C7A', doorColor: '#232C7A', windowColor: GLASS,
    frontStripes: [band(FACE, 0.55, 0.85)],
    pantograph: true,
  },
  {
    id: 'osaka-nankai-12000', name: "Nankai 12000 series 'Southern Premium'", maker: 'Nippon Sharyo', introduced: 2011,
    blurb: "The reserved half of a 'Southern' to Wakayama. The four commuter cars coupled behind are free seating.",
    length: 20.1, width: 2.82, height: 3.9, doors: 2, profile: 'box', nose: 'slant', ...steel, front: '#1D6FC4',
    stripes: [band('#1D6FC4', 0, 0.3), band('#F39800', 0.3, 0.33)],
    frontStripes: [band(FACE, 0.5, 0.88)],
    pantograph: true,
  },
  {
    id: 'osaka-nankai-8300', name: 'Nankai 8300 series', maker: 'Tokyu Car / J-TREC', introduced: 2015,
    blurb: "Nankai's standard commuter since 2015, in its orange and blue, on both the Main and Koya lines.",
    length: 20.1, width: 2.83, height: 3.9, doors: 4, profile: 'box', nose: 'flat', ...steel, front: '#F39800',
    stripes: [band('#F39800', 0.36, 0.39), band('#1D6FC4', 0.33, 0.36)],
    frontStripes: [band('#1D6FC4', 0.24, 0.3), band(FACE, 0.5, 0.88)],
    pantograph: true,
  },
  {
    id: 'osaka-nankai-6200', name: 'Nankai 6200 series', maker: 'Tokyu Car', introduced: 1974,
    blurb: 'Stainless since 1974: these 21 m, four-door cars have carried Koya Line commuters for half a century.',
    length: 20.2, width: 2.74, height: 3.9, doors: 4, profile: 'box', nose: 'flat', ...steel, front: STAINLESS,
    stripes: [band('#F39800', 0.36, 0.39), band('#1D6FC4', 0.33, 0.36)],
    frontStripes: [band('#1D6FC4', 0.22, 0.3), band(FACE, 0.5, 0.86)],
    pantograph: true,
  },
  // ---------------------------------------------------------------- Kintetsu
  {
    id: 'osaka-kintetsu-8000', name: 'Kintetsu 8000 series', maker: 'Kinki Sharyo', introduced: 1964,
    blurb: "Kintetsu's classic maroon and cream, on Nara Line commuters since 1964.",
    length: 20.7, width: 2.8, height: 4.0, doors: 4, profile: 'box', nose: 'flat',
    finish: 'paint', body: '#F1ECDF', roof: ROOF, front: '#A4102B', doorColor: '#F1ECDF', windowColor: GLASS,
    stripes: [band('#A4102B', 0.4, 1)],
    frontStripes: [band('#F1ECDF', 0, 0.36), band(FACE, 0.52, 0.86)],
    pantograph: true,
  },
  {
    id: 'osaka-kintetsu-21', name: "Kintetsu 'Series 21' (9020/9820/5820)", maker: 'Kinki Sharyo', introduced: 2000,
    blurb: 'Earth white over amber brown, split by a sunflower-yellow line. The design won the 2001 Laurel Prize.',
    length: 20.7, width: 2.8, height: 4.0, doors: 4, profile: 'box', nose: 'flat',
    finish: 'paint', body: '#F2F1EC', roof: ROOF, front: '#F2F1EC', doorColor: '#F2F1EC', windowColor: GLASS,
    stripes: [band('#7A5A44', 0, 0.3), band('#F5B800', 0.3, 0.33)],
    frontStripes: [band('#7A5A44', 0, 0.3), band(FACE, 0.5, 0.88)],
    pantograph: true,
  },
  {
    id: 'osaka-kintetsu-80000', name: "Kintetsu 80000 series 'Hinotori'", maker: 'Kinki Sharyo', introduced: 2020,
    blurb: "Hinotori ('phoenix') links Osaka-Namba and Nagoya in metallic red. It won the 2021 Blue Ribbon Award.",
    length: 20.5, width: 2.8, height: 4.0, doors: 1, profile: 'rounded', nose: 'bullet',
    finish: 'paint', body: '#A31E2C', roof: '#7E1621', front: '#A31E2C', doorColor: '#A31E2C', windowColor: GLASS,
    stripes: [band('#C9A45C', 0.28, 0.3)],
    frontStripes: [band(FACE, 0.5, 0.95)],
    pantograph: true,
  },
  {
    id: 'osaka-kintetsu-22600', name: "Kintetsu 22600 series 'Ace'", maker: 'Kinki Sharyo', introduced: 2009,
    blurb: "Kintetsu's all-round limited express, on Nara and Ise runs alike. The design won the 2010 Laurel Prize.",
    length: 20.5, width: 2.79, height: 4.0, doors: 1, profile: 'box', nose: 'slant',
    finish: 'paint', body: '#F08A1E', roof: '#8F959B', front: '#F08A1E', doorColor: '#F08A1E', windowColor: GLASS,
    stripes: [band('#F4F2EC', 0, 0.26), band('#1B2F6B', 0.26, 0.29)],
    frontStripes: [band('#F4F2EC', 0, 0.26), band(FACE, 0.46, 0.9)],
    pantograph: true,
  },
  // ---------------------------------------------------------------- Osaka Monorail (straddle type)
  {
    id: 'osaka-monorail-3000', name: 'Osaka Monorail 3000 series', maker: 'Hitachi', introduced: 2018,
    blurb: "Replaced the line's first trains from 2018 and won that year's Good Design Award.",
    length: 14.6, width: 2.9, height: 3.7, doors: 2, profile: 'monorail', nose: 'rounded',
    finish: 'paint', body: '#F4F5F6', roof: '#C9CDD1', front: '#2C54B8', doorColor: '#F4F5F6', windowColor: GLASS,
    stripes: [band('#2C54B8', 0.12, 0.2), band('#E4508C', 0.2, 0.24)],
    frontStripes: [band('#E4508C', 0.2, 0.26), band(FACE, 0.5, 0.9)],
    pantograph: false,
  },
  {
    id: 'osaka-monorail-1000', name: 'Osaka Monorail 1000 series', maker: 'Kawasaki / Hitachi', introduced: 1990,
    blurb: 'Opened the line in 1990: rubber-tired cars straddling a concrete beam, mostly above the Chuo Loop road.',
    length: 14.6, width: 2.9, height: 3.74, doors: 2, profile: 'monorail', nose: 'flat',
    finish: 'paint', body: '#F4F5F6', roof: '#C9CDD1', front: '#F4F5F6', doorColor: '#F4F5F6', windowColor: GLASS,
    stripes: [band('#1F5FB4', 0.1, 0.18), band('#7CB4E6', 0.18, 0.22)],
    frontStripes: [band('#1F5FB4', 0.1, 0.22), band(FACE, 0.5, 0.88)],
    pantograph: false,
  },
];

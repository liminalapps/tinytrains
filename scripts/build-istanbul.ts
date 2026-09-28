// Istanbul: Metro İstanbul's metro, tram and funicular lines, IETT's nostalgic trams and Tünel, and TCDD's Marmaray,
// M11 and Sirkeci–Kazlıçeşme line, with the sim kit (docs/KIT_SIM.md). The city publishes no rail GTFS: IETT's GTFS
// is buses only, and the older multimodal feed on data.ibb.gov.tr stops in 2024.
// Headways: Metro İstanbul's own timetable (metro.istanbul, "Sefer Tarifeleri"): every departure from each terminal on
// a weekday, a Saturday and a Sunday, compressed into headway bands here. TCDD and IETT lines use published intervals.
// Usage: ./node_modules/.bin/tsx scripts/build-istanbul.ts [--refresh]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSimCity, type DayService, type DayServices, type SimLineConfig } from './lib/osm-network/index.ts';

const ROOT = join(import.meta.dirname, '..');
const CACHE = join(ROOT, '.cache/istanbul/metro-timetables.json');
/** Service-day boundary: Metro İstanbul's last trains leave by 00:35; the weekend night metro runs after it. */
const DAY_START = '00:45';

// ---------------------------------------------------------------------------- Metro İstanbul timetable
type Day = 'weekday' | 'saturday' | 'sunday';
/** line → 'From-->>To' → day → departures 'HH:MM' from From, in the calendar-day order the site lists them. */
type Timetables = Record<string, Record<string, Record<Day | 'monday', string[]>>>;
const DATES: [Day | 'monday', string][] = [['weekday', '29.09.2026'], ['saturday', '03.10.2026'], ['sunday', '04.10.2026'], ['monday', '05.10.2026']];

async function fetchTimetables(): Promise<Timetables> {
  const ua = { 'user-agent': 'Mozilla/5.0 (tinytrains data build)' };
  const page = await fetch('https://www.metro.istanbul/SeferDurumlari/SeferDetaylari', { headers: ua });
  const cookie = page.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const html = await page.text();
  const kod = html.match(/formData\.append\("kod", '([^']+)'\)/)![1];
  const opts = (s: string) => [...s.matchAll(/<option value="(\d+)">([^<]*)</g)].map((o) => [o[1], o[2]] as const);
  const norm = (s: string) => s.toLocaleLowerCase('tr').replace(/[^a-zçğıöşü0-9]/g, '');
  const out: Timetables = {};
  const re = /changeTheElements\((\d+)\);" class="nav-link">\s*<span class="lines[^>]*>([^<]+)<\/span>[\s\S]*?<select id="seferler_\1">([\s\S]*?)<\/select>\s*<select id="istasyonlar_\1">([\s\S]*?)<\/select>/g;
  for (const m of html.matchAll(re)) {
    const line = m[2];
    if (line.startsWith('TF')) continue; // cable cars
    const stations = opts(m[4]);
    for (const [route, label] of opts(m[3])) {
      const from = label.split('-->>')[0];
      const st = stations.find((s) => norm(s[1]) === norm(from)) ?? stations.find((s) => norm(s[1]).startsWith(norm(from).slice(0, 6)));
      if (!st) throw new Error(`no station for ${line} ${label}`);
      for (const [day, date] of DATES) {
        const fd = new FormData();
        for (const [k, v] of Object.entries({ secim: '3', saat: '', dakika: '', tarih1: '', tarih2: date, station: st[0], route, kod })) fd.append(k, v);
        const r = await fetch('https://www.metro.istanbul/SeferDurumlari/AJAXSeferGetir', {
          method: 'POST', body: fd,
          headers: { ...ua, cookie, 'x-requested-with': 'XMLHttpRequest', referer: 'https://www.metro.istanbul/SeferDurumlari/SeferDetaylari' },
        });
        const j = (await r.json()) as { durum: string; sefer?: { zaman: string }[] };
        if (j.durum !== '0') throw new Error(`timetable ${line} ${label} ${date}: ${JSON.stringify(j)}`);
        ((out[line] ??= {})[label] ??= {} as never)[day] = j.sefer!.map((s) => s.zaman);
        await new Promise((res) => setTimeout(res, 1100));
      }
      console.log(`timetable ${line} ${label}`);
    }
  }
  return out;
}

let tt: Timetables;
if (existsSync(CACHE) && !process.argv.includes('--refresh')) tt = JSON.parse(readFileSync(CACHE, 'utf8'));
else {
  tt = await fetchTimetables();
  mkdirSync(join(ROOT, '.cache/istanbul'), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(tt));
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fmt = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
const dayStart = toMin(DAY_START);

/**
 * One service day's departures, in minutes after midnight (after-midnight ones past 1440): the calendar day's list
 * from DAY_START on, plus the next calendar day's night departures before DAY_START. Night trains early on a Saturday
 * belong to Friday, which the kit runs as a weekday, so they are dropped.
 */
function serviceDay(lists: Record<string, string[]>, day: Day): number[] {
  const next: Record<Day, string> = { weekday: 'weekday', saturday: 'sunday', sunday: 'monday' };
  const own = lists[day] ?? [];
  const out: number[] = [];
  own.forEach((t, i) => {
    const m = toMin(t);
    if (m >= dayStart) out.push(m);
    else if (i > own.length / 2) out.push(m + 1440); // last trains just after midnight
  });
  if (day !== 'weekday') {
    const tomorrow = lists[next[day]] ?? [];
    for (let i = 0; i < tomorrow.length / 2; i++) {
      const m = toMin(tomorrow[i]);
      if (m < dayStart && !out.includes(m + 1440)) out.push(m + 1440);
    }
  }
  return out.sort((a, b) => a - b);
}

/** Headway bands from departure times: a new band where the interval changes by more than a minute and 20 %. */
function bands(times: number[]): DayService['headways'] {
  if (times.length < 2) return [[fmt(times[0] ?? dayStart), 60]];
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  const groups: { start: number; gaps: number[] }[] = [];
  for (let i = 0; i < gaps.length; i++) {
    const g = groups.at(-1);
    const med = g ? [...g.gaps].sort((a, b) => a - b)[g.gaps.length >> 1] : 0;
    if (g && Math.abs(gaps[i] - med) <= Math.max(1, 0.2 * med)) g.gaps.push(gaps[i]);
    else groups.push({ start: times[i], gaps: [gaps[i]] });
  }
  // Fold one-off irregular gaps into the band before them.
  for (let i = 1; i < groups.length; i++) {
    if (groups[i].gaps.length < 2 && i < groups.length - 1) {
      groups[i - 1].gaps.push(...groups[i].gaps);
      groups.splice(i--, 1);
    }
  }
  const out: [string, number][] = [];
  for (const g of groups) {
    const h = Math.round((g.gaps.reduce((a, b) => a + b, 0) / g.gaps.length) * 2) / 2;
    if (out.length && Math.abs(out.at(-1)![1] - h) < 0.6) continue;
    out.push([fmt(g.start), h]);
  }
  return out;
}

/** DayServices for a line from Metro İstanbul's timetable: bands from `route`, first/last from both directions. */
function metroService(line: string, route: string, reverse?: string, opts: { scale?: number } = {}): DayServices {
  const lists = tt[line]?.[route];
  if (!lists) throw new Error(`no timetable for ${line} ${route}`);
  const svc = {} as DayServices;
  for (const day of ['weekday', 'saturday', 'sunday'] as Day[]) {
    const times = serviceDay(lists, day);
    const terminals: DayService['terminals'] = {};
    const [from, to] = route.split('-->>');
    terminals[from] = { first: fmt(times[0]), last: fmt(times.at(-1)!) };
    if (reverse) {
      const back = serviceDay(tt[line][reverse], day);
      if (back.length) terminals[to] = { first: fmt(back[0]), last: fmt(back.at(-1)!) };
    }
    const headways = bands(times).map(([t, h]) => [t, h * (opts.scale ?? 1)] as [string, number]);
    svc[day] = { first: fmt(times[0]), last: fmt(times.at(-1)!), headways, terminals };
  }
  return svc;
}
const flat = (first: string, last: string, headways: [string, number][]): DayServices => ({ weekday: { first, last, headways } });

// ---------------------------------------------------------------------------- lines
const METRO_RUN = { vmax: 80, acc: 0.9, dec: 1.0, dwell: 30, dwellInterchange: 40 };
const TRAM_RUN = { vmax: 50, acc: 1.0, dec: 1.1, dwell: 20, dwellInterchange: 25 };

const lines: SimLineConfig[] = [
  {
    id: 'M1A', system: 'metro', name: 'M1A Yenikapı–Atatürk Airport', nameLocal: 'M1A Yenikapı–Atatürk Havalimanı', short: 'M1A',
    color: '#EE3124', bullet: 'square', kind: 'metro', osm: { relations: [305496, 7719077] },
    run: { ...METRO_RUN, trip: { from: 'Yenikapı', to: 'Atatürk Havalimanı', minutes: 35 } },
    service: metroService('M1A', 'Yenikapı-->>Atatürk Havalimanı', 'Atatürk Havalimanı-->>Yenikapı'),
    patterns: [{ from: 'Yenikapı', to: 'Atatürk Havalimanı', share: 1 }],
    stock: [{ stock: 'istanbul-abb', cars: 4 }],
    directions: ['Westbound', 'Eastbound'],
  },
  {
    id: 'M1B', system: 'metro', name: 'M1B Yenikapı–Kirazlı', short: 'M1B',
    color: '#EE3124', bullet: 'square', kind: 'metro', osm: { relations: [4289712, 7719075] },
    run: { ...METRO_RUN, trip: { from: 'Yenikapı', to: 'Kirazlı', minutes: 25 } },
    service: metroService('M1B', 'Yenikapı-->>Kirazlı-Bağcılar', 'Kirazlı-Bağcılar-->>Yenikapı'),
    patterns: [{ from: 'Yenikapı', to: 'Kirazlı', share: 1 }],
    stock: [{ stock: 'istanbul-abb', cars: 4 }],
    directions: ['Westbound', 'Eastbound'],
  },
  {
    id: 'M2', system: 'metro', name: 'M2 Yenikapı–Hacıosman', short: 'M2',
    color: '#009944', bullet: 'square', kind: 'metro', osm: { relations: [11341406, 7719074, 7719795, 7719796] },
    run: { ...METRO_RUN, trip: { from: 'Yenikapı', to: 'Hacıosman', minutes: 32 } },
    service: metroService('M2', 'Yenikapı-->>Hacıosman', 'Hacıosman-->>Yenikapı'),
    groups: { shuttle: metroService('M2', 'Sanayi Mahallesi-->>Seyrantepe', 'Seyrantepe-->>Sanayi Mahallesi') },
    patterns: [
      { from: 'Yenikapı', to: 'Hacıosman', share: 1 },
      { from: 'Sanayi Mahallesi', to: 'Seyrantepe', share: 1, group: 'shuttle', stock: [{ stock: 'istanbul-m2-alstom', cars: 4 }] },
    ],
    stock: [{ stock: 'istanbul-m2-rotem', cars: 8, share: 5 }, { stock: 'istanbul-m2-rotem', cars: 4, share: 3 }, { stock: 'istanbul-m2-alstom', cars: 8, share: 1 }],
    directions: ['Northbound', 'Southbound'],
  },
  {
    id: 'M3', system: 'metro', name: 'M3 Bakırköy Sahil–Kayaşehir Merkez', short: 'M3',
    color: '#00A8E1', bullet: 'square', kind: 'metro', osm: { relations: [4289797, 7719073] },
    run: { ...METRO_RUN, trip: { from: 'Bakırköy Sahil', to: 'Kayaşehir Merkez', minutes: 44 } },
    service: metroService('M3', 'Bakırköy Sahil-->>Kayaşehir Merkez', 'Kayaşehir Merkez-->>Bakırköy Sahil'),
    patterns: [{ from: 'Bakırköy Sahil', to: 'Kayaşehir Merkez', share: 1 }],
    stock: [{ stock: 'istanbul-m3-metropolis', cars: 4 }],
    directions: ['Northbound', 'Southbound'],
  },
  {
    id: 'M4', system: 'metro', name: 'M4 Kadıköy–Sabiha Gökçen Airport', nameLocal: 'M4 Kadıköy–Sabiha Gökçen Havalimanı', short: 'M4',
    color: '#E91E76', bullet: 'square', kind: 'metro', osm: { relations: [2396287, 11341395] },
    run: { ...METRO_RUN, trip: { from: 'Kadıköy', to: 'Sabiha Gökçen Havalimanı', minutes: 52 } },
    service: metroService('M4', 'Kadıköy-->>Sabiha Gökçen Havalimanı', 'Sabiha Gökçen Havalimanı-->>Kadıköy'),
    patterns: [{ from: 'Kadıköy', to: 'Sabiha Gökçen Havalimanı', share: 1 }],
    stock: [{ stock: 'istanbul-m4-caf', cars: 4 }],
    directions: ['Eastbound', 'Westbound'],
  },
  {
    id: 'M5', system: 'metro', name: 'M5 Üsküdar–Sultanbeyli', short: 'M5',
    color: '#683064', bullet: 'square', kind: 'metro', osm: { relations: [11344904, 11344905] },
    run: { ...METRO_RUN, vmax: 90, trip: { from: 'Üsküdar', to: 'Sultanbeyli', minutes: 50 } },
    service: metroService('M5', 'Üsküdar-->>Sultanbeyli', 'Sultanbeyli-->>Üsküdar'),
    patterns: [{ from: 'Üsküdar', to: 'Sultanbeyli', share: 1 }],
    stock: [{ stock: 'istanbul-m5-caf', cars: 6 }],
    directions: ['Eastbound', 'Westbound'],
  },
  {
    id: 'M6', system: 'metro', name: 'M6 Levent–Boğaziçi Ü./Hisarüstü', short: 'M6',
    color: '#CAA977', bullet: 'square', kind: 'metro', osm: { relations: [7719781, 7719780] },
    run: { ...METRO_RUN, trip: { from: 'Levent', to: 'Boğaziçi Üniversitesi/Hisarüstü', minutes: 7 } },
    service: metroService('M6', 'Levent-->>Boğaziçi Ü.-Hisarüstü', 'Boğaziçi Ü.-Hisarüstü-->>Levent'),
    patterns: [{ from: 'Levent', to: 'Boğaziçi Üniversitesi/Hisarüstü', share: 1 }],
    stock: [{ stock: 'istanbul-m2-alstom', cars: 4 }],
    directions: ['Northbound', 'Southbound'],
  },
  {
    // Every other train from Mahmutbey turns back at Nurtepe; the Nurtepe timetable counts both, so the headway per
    // pattern is twice its interval.
    id: 'M7', system: 'metro', name: 'M7 Yıldız–Mahmutbey', short: 'M7',
    color: '#F89ABA', textColor: '#000000', bullet: 'square', kind: 'metro', osm: {
      relations: [11799409, 11799410, 15085833, 15085834],
      sequences: [['Yıldız', 'Fulya', 'Mecidiyeköy', 'Çağlayan', 'Kağıthane', 'Nurtepe', 'Alibeyköy', 'Çırçır Mahallesi', 'Veysel Karani-Akşemsettin',
        'Yeşilpınar', 'Kâzım Karabekir', 'Yenimahalle', 'Karadeniz Mahallesi', 'Giyimkent-Tekstilkent', 'Oruç Reis - Yüzyıl', 'Göztepe', 'Mahmutbey']],
    },
    run: { ...METRO_RUN, trip: { from: 'Yıldız', to: 'Mahmutbey', minutes: 36 } },
    service: metroService('M7', 'Nurtepe-->>Mahmutbey', 'Mahmutbey-->>Nurtepe', { scale: 2 }),
    patterns: [
      { from: 'Mahmutbey', to: 'Yıldız', share: 1, align: 'Nurtepe' },
      { from: 'Mahmutbey', to: 'Nurtepe', share: 1, align: 'Nurtepe' },
    ],
    stock: [{ stock: 'istanbul-m7-rotem', cars: 4 }],
    directions: ['Eastbound', 'Westbound'],
  },
  {
    id: 'M8', system: 'metro', name: 'M8 Bostancı–Parseller', short: 'M8',
    color: '#447ABE', bullet: 'square', kind: 'metro', osm: { relations: [14900216, 14900217] },
    run: { ...METRO_RUN, trip: { from: 'Bostancı', to: 'Parseller', minutes: 26 } },
    service: metroService('M8', 'Bostancı-->>Parseller', 'Parseller-->>Bostancı'),
    patterns: [{ from: 'Bostancı', to: 'Parseller', share: 1 }],
    stock: [{ stock: 'istanbul-m8-rotem', cars: 4 }],
    directions: ['Northbound', 'Southbound'],
  },
  {
    id: 'M9', system: 'metro', name: 'M9 Ataköy–Olimpiyat', short: 'M9',
    color: '#F0E514', textColor: '#000000', bullet: 'square', kind: 'metro', osm: { relations: [4289800, 7719072] },
    run: { ...METRO_RUN, trip: { from: 'Ataköy', to: 'Olimpiyat', minutes: 26 } },
    service: metroService('M9', 'Ataköy-->>Olimpiyat', 'Olimpiyat-->>Ataköy'),
    patterns: [{ from: 'Ataköy', to: 'Olimpiyat', share: 1 }],
    stock: [{ stock: 'istanbul-m3-metropolis', cars: 4 }],
    directions: ['Northbound', 'Southbound'],
  },
  {
    // TCDD runs M11 every 15 minutes, 06:00–00:00 (57 minutes Gayrettepe–Halkalı via the airport).
    id: 'M11', system: 'tcdd', name: 'M11 Gayrettepe–Istanbul Airport–Halkalı', nameLocal: 'M11 Gayrettepe–İstanbul Havalimanı–Halkalı', short: 'M11',
    color: '#AB548F', bullet: 'square', kind: 'metro', osm: { relations: [15083964, 15083963] },
    run: { ...METRO_RUN, vmax: 120, trip: { from: 'Gayrettepe', to: 'Halkalı', minutes: 57 } },
    service: flat('06:00', '23:45', [['06:00', 15]]),
    patterns: [{ from: 'Gayrettepe', to: 'Halkalı', share: 1 }],
    stock: [{ stock: 'istanbul-m11-crrc', cars: 4 }],
    directions: ['To the airport', 'To Gayrettepe'],
  },
  {
    // Marmaray: Halkalı–Gebze every 15 minutes, with Ataköy–Pendik trains in between for a train every 7–8 minutes
    // under the Bosphorus; 108 minutes end to end.
    id: 'B1', system: 'tcdd', name: 'Marmaray', nameLocal: 'Marmaray B1 Halkalı–Gebze', short: 'B1',
    color: '#5A5F5C', bullet: 'pill', kind: 'rail', osm: { relations: [9468040, 9987139, 4289742, 4511012] },
    run: { vmax: 100, acc: 0.8, dec: 0.9, dwell: 40, dwellInterchange: 50, trip: { from: 'Halkalı', to: 'Gebze', minutes: 108 } },
    service: flat('06:00', '23:30', [['06:00', 15]]),
    groups: { inner: flat('06:30', '22:30', [['06:30', 15]]) },
    patterns: [
      { from: 'Halkalı', to: 'Gebze', share: 1 },
      { from: 'Ataköy', to: 'Pendik', share: 1, group: 'inner' },
    ],
    stock: [{ stock: 'istanbul-e32000', cars: 10, share: 3 }, { stock: 'istanbul-e32000', cars: 5, share: 1 }],
    directions: ['To Gebze', 'To Halkalı'],
  },
  {
    // Sirkeci–Kazlıçeşme (U3 / T6): every 25 minutes, 17 minutes end to end. Hours are an estimate.
    id: 'T6', system: 'tcdd', name: 'T6 Sirkeci–Kazlıçeşme', short: 'T6',
    color: '#E47A7B', bullet: 'pill', kind: 'rail', osm: { relations: [19587363, 16400029] },
    run: { vmax: 70, dwell: 30, trip: { from: 'Sirkeci', to: 'Kazlıçeşme', minutes: 17 } },
    service: flat('06:00', '22:00', [['06:00', 25]]),
    patterns: [{ from: 'Sirkeci', to: 'Kazlıçeşme', share: 1 }],
    stock: [{ stock: 'istanbul-e32000', cars: 5 }],
    directions: ['To Kazlıçeşme', 'To Sirkeci'],
  },
  {
    id: 'T1', system: 'tram', name: 'T1 Kabataş–Bağcılar', short: 'T1',
    color: '#004F7D', bullet: 'square', kind: 'tram',
    // OSM's T1 relations list their stops out of order and miss Laleli, so the patterns run via Laleli on this list.
    osm: {
      relations: [2962729, 151819],
      sequences: [['Kabataş', 'Fındıklı - MSÜ', 'Tophane', 'Karaköy', 'Eminönü', 'Sirkeci', 'Gülhane', 'Sultanahmet', 'Çemberlitaş',
        'Beyazıt - Kapalı Çarşı', 'Laleli-Üniversite', 'Aksaray', 'Yusufpaşa', 'Haseki', 'Fındıkzade', 'Çapa-Şehremini', 'Pazartekke',
        'Topkapı', 'Cevizlibağ-A.Ö.Y.', 'Merkez Efendi', 'Seyitnizam-Akşemsettin', 'Mithatpaşa', 'Zeytinburnu', 'Mehmet Akif',
        'Merter Tekstil Merkezi', 'Güngören', 'Akıncılar', 'Soğanlı', 'Yavuz Selim', 'Güneştepe', 'Bağcılar']],
    },
    run: { ...TRAM_RUN, trip: { from: 'Kabataş', to: 'Bağcılar', minutes: 65 } },
    service: metroService('T1', 'Kabataş-->>Bağcılar', 'Bağcılar-->>Kabataş'),
    groups: { short: metroService('T1', 'Eminönü-->>Cevizlibağ-AÖY', 'Cevizlibağ-AÖY-->>Eminönü') },
    patterns: [
      { from: 'Kabataş', to: 'Bağcılar', via: ['Laleli-Üniversite'], share: 1 },
      { from: 'Eminönü', to: 'Cevizlibağ-A.Ö.Y.', via: ['Laleli-Üniversite'], share: 1, group: 'short' },
    ],
    stock: [{ stock: 'istanbul-citadis', cars: 2, share: 37 }, { stock: 'istanbul-flexity', cars: 2, share: 20 }],
    directions: ['Westbound', 'Eastbound'],
  },
  {
    // IETT's heritage line up İstiklal Avenue: single track with passing loops, about every 15 minutes.
    id: 'T2', system: 'nostalgic', name: 'T2 Taksim–Tünel', short: 'T2',
    color: '#92AAA0', bullet: 'square', kind: 'tram', osm: { relations: [301617, 4488483] },
    run: { vmax: 15, dwell: 30, trip: { from: 'Taksim', to: 'Tünel', minutes: 14 } },
    service: flat('07:00', '22:30', [['07:00', 15]]),
    patterns: [{ from: 'Taksim', to: 'Tünel', share: 1 }],
    stock: [{ stock: 'istanbul-heritage', cars: 1, share: 3 }, { stock: 'istanbul-heritage', cars: 2, share: 1 }],
    directions: ['To Tünel', 'To Taksim'],
  },
  {
    // Kadıköy–Moda nostalgic ring, one way round, 20 minutes a lap.
    id: 'T3', system: 'nostalgic', name: 'T3 Kadıköy–Moda', short: 'T3',
    color: '#A86528', bullet: 'square', kind: 'tram', osm: { relations: [2409338] },
    run: { vmax: 25, dwell: 20, trip: { from: 'Kadıköy', to: 'Damga Sokak', minutes: 18 } },
    service: metroService('T3', 'Kadıköy İDO-->>Damga Sokak'),
    // One way round; the kit would add a reverse loop, so the ring runs as a one-way trip to its last stop.
    patterns: [{ from: 'Kadıköy', to: 'Damga Sokak', share: 1, oneWay: true, dest: ['Kadıköy via Moda'] }],
    stock: [{ stock: 'istanbul-gotha', cars: 1 }],
  },
  {
    id: 'T4', system: 'tram', name: 'T4 Topkapı–Mescid-i Selam', short: 'T4',
    color: '#F47E46', bullet: 'square', kind: 'tram', osm: { relations: [7420265, 7420264] },
    run: { ...TRAM_RUN, vmax: 60, trip: { from: 'Topkapı', to: 'Mescid-i Selam', minutes: 45 } },
    service: metroService('T4', 'Topkapı-->>Mescid-i Selam', 'Mescid-i Selam-->>Topkapı'),
    patterns: [{ from: 'Topkapı', to: 'Mescid-i Selam', share: 1 }],
    stock: [{ stock: 'istanbul-t4-rotem', cars: 2, share: 32 }, { stock: 'istanbul-b100', cars: 2, share: 30 }, { stock: 'istanbul-t4-yerli', cars: 2, share: 18 }],
    directions: ['Northbound', 'Southbound'],
  },
  {
    id: 'T5', system: 'tram', name: 'T5 Eminönü–Alibeyköy', short: 'T5',
    color: '#7C72B3', bullet: 'square', kind: 'tram', osm: { relations: [12174616, 12174615] },
    run: { ...TRAM_RUN, trip: { from: 'Eminönü', to: 'Alibeyköy Cep Otogarı', minutes: 32 } },
    service: metroService('T5', 'Eminönü-->>Alibeyköy Cep Otogarı', 'Alibeyköy Cep Otogarı-->>Eminönü'),
    patterns: [{ from: 'Eminönü', to: 'Alibeyköy Cep Otogarı', share: 1 }],
    stock: [{ stock: 'istanbul-panorama', cars: 2 }],
    directions: ['Northbound', 'Southbound'],
  },
  {
    id: 'F1', system: 'funicular', name: 'F1 Taksim–Kabataş', short: 'F1',
    color: '#7C7358', bullet: 'square', kind: 'cable', osm: { relations: [300961, 13313678] },
    run: { vmax: 36, dwell: 60, trip: { from: 'Taksim', to: 'Kabataş', minutes: 2.5 } },
    service: metroService('F1', 'Taksim-->>Kabataş', 'Kabataş-->>Taksim'),
    patterns: [{ from: 'Taksim', to: 'Kabataş', share: 1 }],
    stock: [{ stock: 'istanbul-f1', cars: 2 }],
    directions: ['Downhill', 'Uphill'],
  },
  {
    // The 1875 Tünel: IETT runs its two cars every five minutes, 07:00–22:45.
    id: 'F2', system: 'nostalgic', name: 'F2 Tünel', short: 'F2',
    color: '#7C7358', bullet: 'square', kind: 'cable', osm: { relations: [301616, 13313679], sequences: [['Karaköy', 'Beyoğlu']] },
    run: { vmax: 22, dwell: 120, trip: { from: 'Karaköy', to: 'Beyoğlu', minutes: 1.5 } },
    service: flat('07:00', '22:45', [['07:00', 5]]),
    patterns: [{ from: 'Karaköy', to: 'Beyoğlu', share: 1 }],
    stock: [{ stock: 'istanbul-tunel', cars: 1 }],
    directions: ['Uphill', 'Downhill'],
  },
  {
    id: 'F4', system: 'funicular', name: 'F4 Boğaziçi Ü./Hisarüstü–Aşiyan', short: 'F4',
    color: '#7C7358', bullet: 'square', kind: 'cable', osm: { relations: [14738977, 14738978] },
    run: { vmax: 36, dwell: 60, trip: { from: 'Rumeli Hisarüstü', to: 'Aşiyan', minutes: 2.5 } },
    service: metroService('F4', 'Boğaziçi Ü./Hisarüstü-->>Aşiyan', 'Aşiyan-->>Boğaziçi Ü./Hisarüstü'),
    patterns: [{ from: 'Rumeli Hisarüstü', to: 'Aşiyan', share: 1 }],
    stock: [{ stock: 'istanbul-f4', cars: 1 }],
    directions: ['Downhill', 'Uphill'],
  },
];

// Turkish public holidays (religious dates approximate) run the Sunday service.
const HOLIDAYS = [
  '2026-01-01', '2026-03-20', '2026-03-21', '2026-03-22', '2026-04-23', '2026-05-01', '2026-05-19', '2026-05-27',
  '2026-05-28', '2026-05-29', '2026-05-30', '2026-07-15', '2026-08-30', '2026-10-29',
  '2027-01-01', '2027-03-10', '2027-03-11', '2027-03-12', '2027-04-23', '2027-05-01', '2027-05-16', '2027-05-17',
  '2027-05-18', '2027-05-19', '2027-07-15', '2027-08-30', '2027-10-29',
];

await buildSimCity({
  city: 'istanbul',
  systems: [
    { id: 'metro', name: 'Metro İstanbul' },
    { id: 'tram', name: 'Tram' },
    { id: 'tcdd', name: 'TCDD Marmaray' },
    { id: 'nostalgic', name: 'IETT nostalgic lines' },
    { id: 'funicular', name: 'Funicular' },
  ],
  lines,
  calendar: { holidays: HOLIDAYS, dayStart: DAY_START },
  stations: {
    // OSM splits some names in two ('Çapa - Şehremini'); M2's Şişli-Mecidiyeköy and M7's Mecidiyeköy are one interchange.
    merge: [
      ['Beyoğlu', 'Tünel'], ['Rumeli Hisarüstü', 'Boğaziçi Üniversitesi/Hisarüstü'], ['Çapa-Şehremini', 'Çapa'],
      ['Çırçır Mahallesi', 'Çırçır'], ['Şişli', 'Mecidiyeköy'],
    ],
    // Metro İstanbul's full station names where OSM's are shortened.
    rename: {
      'Beyazıt': ['Beyazıt-Kapalıçarşı'], 'Şişli': ['Şişli-Mecidiyeköy'], 'Emniyet': ['Emniyet-Fatih'],
      'Vezneciler': ['Vezneciler-İstanbul Ü.'], 'Fındıklı': ['Fındıklı-Mimar Sinan Ü.'], 'Davutpaşa': ['Davutpaşa-YTÜ'],
      'Metrokent': ['Başakşehir-Metrokent'], 'Rumeli Hisarüstü': ['Boğaziçi Ü./Hisarüstü'], 'Yenimahalle': ['Yenimahalle', 'Yenimahalle'],
      'Topkapı Ulubatlı': ['Topkapı-Ulubatlı'], 'Kocatepe': ['Kartaltepe-Kocatepe'], 'Modoko': ['MODOKO-KEYAP'],
    },
  },
  names: { local: ['name'], en: ['name'] },
  attribution: [
    'Metro İstanbul timetables (metro.istanbul), simulated',
    'Marmaray, M11, T6, T2 and Tünel: simulated from published intervals',
  ],
});

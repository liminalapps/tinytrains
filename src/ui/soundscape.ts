import type { CityId, LineDef, TimelineStop } from '../../shared/types.ts';
import type { App } from '../app.ts';
import type { LiveTrain } from '../engine/trains.ts';
import type { FrameInfo } from '../engine/world.ts';
import { PHRASEBOOKS, type Phrasebook, type Say } from './phrasebooks.ts';
import { Rolling, sfx, soundOn, soundPrefs, speak, stopSpeech, type Line, type RollingStyle } from './sound.ts';

// The selected train's soundscape: spoken announcements, door chimes, departure melodies and the
// rumble of the ride, in the style of each system. All phrasing here is our own.

type Pack =
  | 'nyc' | 'tube' | 'london-rail' | 'dlr' | 'london-tram' | 'bart' | 'muni' | 'cable' | 'streetcar' | 'caltrain' | 'people-mover'
  | 'jr' | 'metro' | 'toei' | 'tokyo-tram'
  | 'paris-metro' | 'paris-rer' | 'berlin-u' | 'berlin-s' | 'berlin-tram' | 'madrid-metro' | 'madrid-rail' | 'seoul' | 'mtr'
  | 'book'; // a city from PHRASEBOOKS

function packOf(city: CityId, line: LineDef): Pack {
  if (PHRASEBOOKS[city]) return 'book';
  if (city === 'osaka') return /^jr/.test(line.system) ? 'jr' : line.kind === 'tram' ? 'tokyo-tram' : 'metro';
  if (city === 'nyc') return 'nyc';
  if (city === 'paris') return line.kind === 'rail' ? 'paris-rer' : 'paris-metro';
  if (city === 'berlin') return line.kind === 'rail' ? 'berlin-s' : line.kind === 'tram' ? 'berlin-tram' : 'berlin-u';
  if (city === 'madrid') return line.kind === 'rail' ? 'madrid-rail' : 'madrid-metro';
  if (city === 'seoul') return 'seoul';
  if (city === 'hongkong') return 'mtr';
  if (city === 'london') {
    if (line.system === 'tfl-tube') return 'tube';
    if (line.system === 'tfl-dlr') return 'dlr';
    if (line.system === 'tfl-trams') return 'london-tram';
    return 'london-rail';
  }
  if (city === 'sf') {
    if (line.system === 'bart') return line.kind === 'agt' ? 'people-mover' : 'bart';
    if (line.system === 'caltrain') return 'caltrain';
    if (line.kind === 'cable') return 'cable';
    if (line.kind === 'tram') return 'streetcar';
    return 'muni';
  }
  if (line.system === 'jr-east' || line.system === 'twr') return 'jr';
  if (line.system === 'tokyo-metro') return 'metro';
  if (line.kind === 'tram') return 'tokyo-tram';
  if (line.system === 'toei' && line.kind === 'subway') return 'toei';
  return 'metro';
}

const ROLL: Record<Pack, RollingStyle> = {
  nyc: { rumble: 1, roar: 1, whine: 0.6, clack: 1, carLen: 18 },
  tube: { rumble: 1, roar: 1.3, whine: 0.8, clack: 0.8, carLen: 16 },
  'london-rail': { rumble: 0.7, roar: 0.3, whine: 0.9, clack: 0.5, carLen: 20 },
  dlr: { rumble: 0.6, roar: 0.2, whine: 1, clack: 0.4, carLen: 14 },
  'london-tram': { rumble: 0.4, roar: 0, whine: 0.7, clack: 0.3, carLen: 12 },
  bart: { rumble: 0.9, roar: 0.8, whine: 1, clack: 0.4, carLen: 21 },
  muni: { rumble: 0.5, roar: 0.1, whine: 0.8, clack: 0.5, carLen: 11 },
  cable: { rumble: 0.5, roar: 0, whine: 0, clack: 1.2, carLen: 4 },
  streetcar: { rumble: 0.5, roar: 0, whine: 0.5, clack: 0.8, carLen: 7 },
  caltrain: { rumble: 0.8, roar: 0.2, whine: 0.8, clack: 0.9, carLen: 26 },
  'people-mover': { rumble: 0.3, roar: 0, whine: 0.3, clack: 0, carLen: 10 },
  jr: { rumble: 0.7, roar: 0.2, whine: 1.1, clack: 1, carLen: 20 },
  metro: { rumble: 0.8, roar: 0.6, whine: 1.1, clack: 0.7, carLen: 18 },
  toei: { rumble: 0.8, roar: 0.6, whine: 1, clack: 0.7, carLen: 18 },
  'tokyo-tram': { rumble: 0.4, roar: 0, whine: 0.5, clack: 0.6, carLen: 8 },
  'paris-metro': { rumble: 0.9, roar: 0.9, whine: 0.9, clack: 0.7, carLen: 15 },
  'paris-rer': { rumble: 0.8, roar: 0.4, whine: 0.9, clack: 0.8, carLen: 24 },
  'berlin-u': { rumble: 0.9, roar: 0.8, whine: 0.8, clack: 0.9, carLen: 13 },
  'berlin-s': { rumble: 0.8, roar: 0.4, whine: 1, clack: 1, carLen: 18 },
  'berlin-tram': { rumble: 0.4, roar: 0, whine: 0.7, clack: 0.5, carLen: 10 },
  'madrid-metro': { rumble: 0.9, roar: 0.8, whine: 0.9, clack: 0.6, carLen: 15 },
  'madrid-rail': { rumble: 0.8, roar: 0.3, whine: 0.9, clack: 0.8, carLen: 25 },
  seoul: { rumble: 0.8, roar: 0.6, whine: 1.1, clack: 0.7, carLen: 20 },
  mtr: { rumble: 0.8, roar: 0.6, whine: 1, clack: 0.5, carLen: 22 },
  book: { rumble: 0.85, roar: 0.7, whine: 1, clack: 0.7, carLen: 19 },
};

const EN_US = (text: string): Line => ({ text, lang: 'en-US' });
const EN_GB = (text: string): Line => ({ text, lang: 'en-GB' });
const JA = (text: string): Line => ({ text, lang: 'ja-JP' });
const FR = (text: string): Line => ({ text, lang: 'fr-FR' });
const DE = (text: string): Line => ({ text, lang: 'de-DE' });
const ES = (text: string): Line => ({ text, lang: 'es-ES' });
const KO = (text: string): Line => ({ text, lang: 'ko-KR' });
const YUE = (text: string): Line => ({ text, lang: 'zh-HK' });

/** Spell out NYC station abbreviations the way an announcer would say them. */
function nycSay(name: string) {
  const ord = (n: string) => {
    const i = Number(n);
    const s = i % 100 >= 11 && i % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][i % 10] ?? 'th';
    return n + (['th', 'st', 'nd', 'rd'].includes(s) ? s : 'th');
  };
  return name
    .replace(/\b(\d+)\s+(St|Av|Ave|Street|Avenue|Pl|Rd|Dr)\b/g, (_, n, w) => `${ord(n)} ${w}`)
    .replace(/\bSt George\b/g, 'Saint George')
    .replace(/\bSt\b\.?/g, 'Street')
    .replace(/\bAvs?\b/g, 'Avenue')
    .replace(/\bSq\b/g, 'Square')
    .replace(/\bBlvd\b/g, 'Boulevard')
    .replace(/\bPkwy\b/g, 'Parkway')
    .replace(/\bHts\b/g, 'Heights')
    .replace(/\bJct\b/g, 'Junction')
    .replace(/\bCtr\b/g, 'Center')
    .replace(/\bPl\b/g, 'Place')
    .replace(/\bRd\b/g, 'Road')
    .replace(/\bHwy\b/g, 'Highway')
    .replace(/\bYds\b/g, 'Yards')
    .replace(/\bWTC\b/g, 'World Trade Center')
    .replace(/\s*-\s*/g, ', ')
    .replace(/\//g, ', ');
}

function list(items: string[], and = 'and') {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')}${items.length > 2 ? ',' : ''} ${and} ${items[items.length - 1]}`;
}

export class Soundscape {
  private tid: string | null = null;
  private lastKey = '';
  private approached = new Set<string>();
  private doorsDone = new Set<string>();
  private rolling = new Rolling();
  private prevDisp: number | null = null;
  private prevSpeed = 0;
  private busy = false;

  constructor(private app: App) {}

  update(f: FrameInfo) {
    const c = this.app.city;
    const t = c?.trains?.selected ?? null;
    if (!soundOn() || !t || t.dying !== null || !c) {
      this.reset();
      return;
    }
    if (t.id !== this.tid) this.onSelect(t);
    const now = this.app.world.now() / 1000;
    const stops = t.state.stops;
    const st = t.status;
    const at = stops[st.idx];
    if (!at) return;
    // Keyed by station, not index: each data refresh re-bases the stop list.
    const key = `${st.kind}:${at.s}`;
    if (key !== this.lastKey) {
      const had = this.lastKey !== '';
      this.lastKey = key;
      if (had) {
        if (st.kind === 'dwell') this.arrive(t, at, st.idx === stops.length - 1);
        else this.depart(t, at);
      }
    }
    const pack = packOf(c.id, t.line);
    // Doors closing (and in Tokyo, the departure melody) just before the train leaves.
    if (st.kind === 'dwell' && st.idx < stops.length - 1) {
      const left = at.d - now;
      const k = `${t.id}@${at.s}`;
      const lead = pack === 'book' ? (PHRASEBOOKS[c.id]!.lead ?? 4.5) : pack === 'jr' || pack === 'metro' || pack === 'toei' ? 9 : pack === 'mtr' || pack === 'seoul' || pack === 'berlin-u' || pack === 'berlin-s' ? 5 : 4.5;
      if (left < lead && left > 0.8 && !this.doorsDone.has(k)) {
        this.doorsDone.add(k);
        this.doorsClosing(t, pack, at, left);
      }
    }
    // "The next stop is…" as it approaches, on longer runs.
    if (st.kind === 'moving' && st.idx > 0) {
      const eta = at.a - now;
      const k = `${t.id}>${at.s}`;
      if (eta < 20 && eta > 4 && at.a - stops[st.idx - 1].d > 50 && !this.approached.has(k)) {
        this.approached.add(k);
        this.approach(t, at, st.idx === stops.length - 1);
      }
    }
    // The ride itself: louder the closer you are, loudest when following.
    const disp = t.disp ?? 0;
    const speed = this.prevDisp === null || f.dt <= 0 ? 0 : Math.max(0, (disp - this.prevDisp) / f.dt);
    const smooth = this.prevSpeed + (speed - this.prevSpeed) * Math.min(1, f.dt * 3);
    const accel = (smooth - this.prevSpeed) / Math.max(f.dt, 1e-3);
    this.prevDisp = disp;
    this.prevSpeed = smooth;
    const near = Math.max(0, Math.min(1, (10 - f.mpp) / 8));
    const level = (this.app.world.rig.following ? 1 : 0.55) * near;
    this.rolling.duck = (this.busy ? 0.45 : 1) * (soundPrefs.rumble ? 1 : 0);
    this.rolling.update(smooth, accel, f.dt, pack === 'book' ? PHRASEBOOKS[c.id]!.roll : ROLL[pack], level);
  }

  private reset() {
    if (this.tid !== null) {
      stopSpeech();
      this.rolling.stop();
    }
    this.tid = null;
    this.lastKey = '';
    this.prevDisp = null;
    this.prevSpeed = 0;
  }

  private say(lines: Line[]) {
    void speak(lines, (on) => (this.busy = on));
  }

  // -------------------------------------------------------------------------
  private name(id: string) {
    return this.app.city?.network?.stations.get(id)?.name ?? '';
  }

  private local(id: string) {
    const s = this.app.city?.network?.stations.get(id);
    return s?.nameLocal ?? s?.name ?? '';
  }

  /** Other lines at a station complex (same name within a short walk). */
  private transfers(stationId: string, except: LineDef): LineDef[] {
    const net = this.app.city?.network;
    const s = net?.stations.get(stationId);
    if (!net || !s) return [];
    const key = s.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ids = new Set<string>();
    for (const o of net.stations.values()) {
      if (o.name.toLowerCase().replace(/[^a-z0-9]/g, '') !== key || Math.hypot(o.pos.x - s.pos.x, o.pos.z - s.pos.z) > 500) continue;
      for (const l of o.lines) ids.add(l);
    }
    ids.delete(except.id);
    const order = new Map(this.app.city!.transit!.lines.map((l, i) => [l.id, i]));
    return [...ids]
      .map((id) => net.lines.get(id)!)
      .filter(Boolean)
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  private nycTransfers(sid: string, line: LineDef) {
    const others = this.transfers(sid, line);
    const names = [...new Set(others.map((l) => (l.short === 'S' || /shuttle/i.test(l.name) ? 'shuttle' : l.short)))];
    let s = names.length ? `Transfer is available to the ${list(names)} ${names.length === 1 && names[0] === 'shuttle' ? '' : 'trains'}.` : '';
    if (/St George/.test(this.name(sid))) s += ' Transfer is available to the Staten Island Ferry.';
    return s.replace(/\s+\./, '.');
  }

  private londonTransfers(sid: string, line: LineDef) {
    const others = this.transfers(sid, line);
    const names = [...new Set(others.map((l) => (l.system === 'tfl-dlr' ? 'the D L R' : l.system === 'tfl-trams' ? 'London Trams' : `the ${l.name.replace(/ line$/i, '')}`)))];
    return names.length ? `Change here for ${list(names)} ${names.some((n) => n.startsWith('the') && n !== 'the D L R') ? (names.length > 1 ? 'lines' : 'line') : ''}.`.replace(/\s+\./, '.') : '';
  }

  private tokyoTransfers(sid: string, line: LineDef) {
    const others = this.transfers(sid, line);
    if (!others.length) return { ja: '', en: '' };
    const ja = `${others.map((l) => (l.system === 'toei' ? '都営' : '') + (l.nameLocal ?? l.name)).join('、')}はお乗り換えです。`;
    const en = `Please change here for the ${list(others.map((l) => (l.system === 'toei' ? 'Toei ' : '') + l.name))}.`;
    return { ja, en };
  }

  /** The phrasebook context for a train at (or heading to) a station. */
  private book(t: LiveTrain, stop: string): [Phrasebook, Say] | null {
    const b = PHRASEBOOKS[this.app.city!.id];
    if (!b) return null;
    return [b, { line: t.line, dest: t.state.dest, destL: t.state.destLocal ?? t.state.dest, stop: this.name(stop), stopL: this.local(stop), transfers: this.transfers(stop, t.line) }];
  }

  private lang(b: Phrasebook, text: string) {
    if (text) this.say([{ text, lang: b.lang }]);
  }

  // -------------------------------------------------------------------------
  private onSelect(t: LiveTrain) {
    stopSpeech();
    this.tid = t.id;
    const st = t.status;
    const at = t.state.stops[st.idx];
    this.lastKey = at ? `${st.kind}:${at.s}` : '';
    this.prevDisp = null;
    const next = st.kind === 'dwell' ? t.state.stops[st.idx + 1] : at;
    if (next) setTimeout(() => this.tid === t.id && this.intro(t, next), 350);
  }

  private lastIntro = { key: '', at: 0 };

  /** Who this train is and where it's going (said on selection and after each departure). */
  private intro(t: LiveTrain, next: TimelineStop) {
    const c = this.app.city!;
    // Don't repeat ourselves if we just said this (e.g. selected moments before departure).
    const k = `${t.id}>${next.s}`;
    if (this.lastIntro.key === k && performance.now() - this.lastIntro.at < 25_000) return;
    this.lastIntro = { key: k, at: performance.now() };
    const pack = packOf(c.id, t.line);
    const bk = this.book(t, next.s);
    if (bk) return this.lang(bk[0], bk[0].intro(bk[1]));
    const s = t.state;
    const nx = this.name(next.s);
    const line = t.line;
    switch (pack) {
      case 'nyc': {
        const kind = s.service === 'Express' ? ' express' : line.system === 'nyc-sir' ? '' : ' local';
        const what = line.system === 'nyc-sir' ? 'train' : `${line.short === 'S' || /shuttle/i.test(line.name) ? 'shuttle' : line.short}${kind} train`;
        return this.say([EN_US(`This is a ${nycSay(s.dest)} bound ${what}. The next stop is ${nycSay(nx)}.`)]);
      }
      case 'tube':
        return this.say([EN_GB(`This is a ${line.name} line train to ${s.dest}. The next station is ${nx}.`)]);
      case 'london-rail':
        return this.say([
          EN_GB(
            line.system === 'tfl-elizabeth'
              ? `This is an Elizabeth line service to ${s.dest}. The next station is ${nx}.`
              : `This is a London Overground ${line.name} line service to ${s.dest}. The next station is ${nx}.`,
          ),
        ]);
      case 'dlr':
        return this.say([EN_GB(`This is a D L R train to ${s.dest}. The next station is ${nx}.`)]);
      case 'london-tram':
        return this.say([EN_GB(`This tram is for ${s.dest}. The next stop is ${nx}.`)]);
      case 'bart':
        return this.say([EN_US(`This is a ${s.dest} train. The next station is ${nx}.`)]);
      case 'people-mover':
        return this.say([EN_US(`Next stop, ${nx}.`)]);
      case 'muni':
        return this.say([EN_US(`${s.dir ? `${s.dir} ` : ''}${line.short}, ${line.name.replace(/^[A-Z]\s/, '')}. Next stop, ${nx}.`)]);
      case 'streetcar':
        sfx.gong();
        return this.say([EN_US(`F Market and Wharves, to ${s.dest}. Next stop, ${nx}.`)]);
      case 'cable':
        sfx.cableBell();
        return;
      case 'caltrain':
        return this.say([EN_US(`This is a ${line.name.replace('Caltrain ', '')} train to ${s.dest}. The next station is ${nx}.`)]);
      case 'paris-metro':
        return this.say([FR(`Ligne ${line.short || line.name}, direction ${s.dest}. Prochaine station : ${nx}.`)]);
      case 'paris-rer':
        return this.say([FR(`RER ${line.short}, à destination de ${s.dest}. Prochain arrêt : ${nx}.`)]);
      case 'berlin-u':
      case 'berlin-s':
      case 'berlin-tram':
        return this.say([DE(`${line.short || line.name} nach ${s.dest}. ${pack === 'berlin-s' ? 'Nächste Station' : 'Nächster Halt'}: ${nx}.`)]);
      case 'madrid-metro':
        return this.say([ES(`Línea ${line.short || line.name}, dirección ${s.dest}. Próxima estación: ${nx}.`)]);
      case 'madrid-rail':
        return this.say([ES(`Cercanías ${line.short}, destino ${s.dest}. Próxima parada: ${nx}.`)]);
      case 'seoul': {
        const dl = s.destLocal ?? s.dest;
        return this.say([KO(`이번 열차는 ${dl}행 열차입니다. 다음 역은 ${this.local(next.s)}역입니다.`)]);
      }
      case 'mtr': {
        const dl = s.destLocal ?? s.dest;
        return this.say([YUE(`往${dl}列車。下一站，${this.local(next.s)}。`)]);
      }
      case 'jr':
      case 'metro':
      case 'toei':
      case 'tokyo-tram': {
        const dl = s.destLocal ?? s.dest;
        const loop = /loop/i.test(s.dest);
        const lineJa = (line.system === 'toei' && pack !== 'tokyo-tram' ? '都営' : '') + (line.nameLocal ?? line.name);
        const lineEn = (line.system === 'toei' && pack !== 'tokyo-tram' ? 'Toei ' : '') + line.name;
        const nxL = this.local(next.s);
        const ja = loop ? `この電車は、${lineJa}、${dl}です。次は、${nxL}、${nxL}。` : `この電車は、${lineJa}、${dl}行きです。次は、${nxL}、${nxL}。`;
        void lineEn;
        return this.say([JA(ja)]);
      }
    }
  }

  private approach(t: LiveTrain, at: TimelineStop, terminal: boolean) {
    const c = this.app.city!;
    const pack = packOf(c.id, t.line);
    const bk = this.book(t, at.s);
    if (bk) return this.lang(bk[0], bk[0].approach(bk[1]));
    const nx = this.name(at.s);
    switch (pack) {
      case 'nyc':
        return this.say([EN_US(`The next stop is ${nycSay(nx)}. ${this.nycTransfers(at.s, t.line)}`)]);
      case 'tube':
      case 'london-rail':
      case 'dlr':
        return this.say([EN_GB(`The next station is ${nx}. ${terminal ? 'Where this train terminates. ' : ''}${this.londonTransfers(at.s, t.line)}`)]);
      case 'london-tram':
        return this.say([EN_GB(`The next stop is ${nx}.`)]);
      case 'bart':
        return this.say([EN_US(`Next station, ${nx}.`)]);
      case 'muni':
      case 'streetcar':
      case 'people-mover':
        return this.say([EN_US(`Next stop, ${nx}.`)]);
      case 'caltrain':
        return this.say([EN_US(`Now approaching ${nx}.`)]);
      case 'cable':
        return;
      case 'paris-metro':
      case 'paris-rer': {
        const tr = this.transfers(at.s, t.line).map((l) => (l.kind === 'rail' ? `RER ${l.short}` : `ligne ${l.short || l.name}`));
        return this.say([FR(`Prochaine station : ${nx}.${tr.length ? ` Correspondances : ${tr.join(', ')}.` : ''}`)]);
      }
      case 'berlin-u':
      case 'berlin-s':
      case 'berlin-tram': {
        const tr = [...new Set(this.transfers(at.s, t.line).map((l) => l.short || l.name))];
        return this.say([DE(`${pack === 'berlin-s' ? 'Nächste Station' : 'Nächster Halt'}: ${nx}.${tr.length ? ` Übergang zur ${tr.join(', ')}.` : ''}`)]);
      }
      case 'madrid-metro':
      case 'madrid-rail': {
        const tr = this.transfers(at.s, t.line).map((l) => l.short || l.name);
        return this.say([ES(`Próxima estación: ${nx}.${tr.length ? ` Correspondencia con ${tr.length > 1 ? 'líneas' : 'línea'} ${list(tr, 'y')}.` : ''}`)]);
      }
      case 'seoul': {
        const tr = this.transfers(at.s, t.line).map((l) => l.nameLocal ?? l.name);
        return this.say([KO(`이번 역은 ${this.local(at.s)}역입니다.${tr.length ? ` ${tr.join(', ')}으로 갈아타실 수 있습니다.` : ''}`)]);
      }
      case 'mtr': {
        const tr = this.transfers(at.s, t.line).map((l) => l.nameLocal ?? l.name);
        return this.say([YUE(`下一站，${this.local(at.s)}。${tr.length ? `乘客可以轉乘${tr.join('、')}。` : ''}`)]);
      }
      default: {
        const nxL = this.local(at.s);
        const tr = this.tokyoTransfers(at.s, t.line);
        return this.say([JA(`まもなく、${nxL}、${nxL}。${tr.ja}`)]);
      }
    }
  }

  private arrive(t: LiveTrain, at: TimelineStop, terminal: boolean) {
    const c = this.app.city!;
    const pack = packOf(c.id, t.line);
    const bk = this.book(t, at.s);
    if (bk) {
      const [b, s] = bk;
      if (!terminal && !b.arrive) return sfx.jpArrive();
      return this.lang(b, terminal ? b.terminal(s) : b.arrive!(s));
    }
    const nm = this.name(at.s);
    switch (pack) {
      case 'nyc':
        sfx.brakes(0, 0.07);
        return this.say([
          EN_US(
            terminal
              ? `This is ${nycSay(nm)}. This is the last stop on this train. Everyone please leave the train. Thank you for riding with M T A New York City Transit.`
              : `This is ${nycSay(nm)}. ${this.nycTransfers(at.s, t.line)}`,
          ),
        ]);
      case 'tube':
        sfx.brakes(0, 0.05);
        return this.say([
          EN_GB(terminal ? `${nm}. This train terminates here. All change please.` : `This is ${nm}. ${Math.random() < 0.5 ? 'Please mind the gap between the train and the platform.' : ''}`),
        ]);
      case 'london-rail':
      case 'dlr':
        sfx.brakes(0, 0);
        return this.say([EN_GB(terminal ? `This train terminates here. Please make sure you take all your belongings with you.` : `This is ${nm}.`)]);
      case 'london-tram':
        sfx.tramBell();
        return;
      case 'bart':
        sfx.brakes(0, 0.03);
        return this.say([EN_US(`${nm}.${terminal ? ' This is the last stop. All passengers please exit the train.' : ''}`)]);
      case 'muni':
      case 'people-mover':
        return this.say([EN_US(`${nm}.`)]);
      case 'streetcar':
        sfx.gong();
        return;
      case 'cable':
        sfx.cableBell();
        return;
      case 'caltrain':
        sfx.brakes(0, 0);
        return this.say([EN_US(`${nm}.`)]);
      case 'paris-metro':
      case 'paris-rer':
        return this.say([FR(terminal ? `${nm}. Terminus. Tout le monde descend.` : `${nm}.`)]);
      case 'berlin-u':
      case 'berlin-s':
      case 'berlin-tram':
        sfx.brakes(0, pack === 'berlin-u' ? 0.04 : 0);
        return this.say([DE(terminal ? `${nm}. Endstation. Bitte alle aussteigen.` : `${nm}.`)]);
      case 'madrid-metro':
      case 'madrid-rail':
        return this.say([ES(terminal ? `${nm}. Fin de trayecto.` : `${nm}.`)]);
      case 'seoul':
        if (this.transfers(at.s, t.line).length) sfx.seoulMelody();
        else sfx.jpArrive();
        if (terminal) return this.say([KO('이 역은 종착역입니다. 모두 내리시기 바랍니다.')]);
        return;
      case 'mtr':
        sfx.jpArrive();
        if (terminal) return this.say([YUE(`終點站，${this.local(at.s)}。`)]);
        return;
      default:
        sfx.jpArrive();
        if (terminal) {
          const nmL = this.local(at.s);
          return this.say([JA(`${nmL}、${nmL}、終点です。お忘れ物のないようご注意ください。`)]);
        }
        return;
    }
  }

  private depart(t: LiveTrain, next: TimelineStop) {
    const pack = packOf(this.app.city!.id, t.line);
    if (pack === 'book' && PHRASEBOOKS[this.app.city!.id]!.quietDepart) return;
    if (pack === 'caltrain') sfx.horn();
    if (pack === 'cable' || pack === 'streetcar') return this.intro(t, next);
    // Most systems announce the train and the next stop once the doors close and it pulls out.
    setTimeout(() => this.tid === t.id && this.intro(t, next), 1200);
  }

  private doorsClosing(t: LiveTrain, pack: Pack, at: TimelineStop, left: number) {
    if (pack === 'book') {
      const stops = t.state.stops;
      const next = stops[stops.indexOf(at) + 1] ?? at;
      const bk = this.book(t, next.s)!;
      const [b, s] = bk;
      const dur = b.chime.length ? sfx.chime(b.chime, b.chimeStep, b.chimeKind) : 0;
      if (b.doors) setTimeout(() => this.tid === t.id && this.lang(b, b.doors!(s)), Math.max(200, dur * 1000 * 0.6));
      return;
    }
    switch (pack) {
      case 'nyc':
        sfx.nycChime();
        return setTimeout(() => this.say([EN_US('Stand clear of the closing doors, please.')]), 900);
      case 'tube':
      case 'dlr':
        return sfx.tubeBeeps();
      case 'london-rail':
        return sfx.tubeBeeps();
      case 'london-tram':
        return sfx.tramBell();
      case 'bart':
        sfx.bartChime();
        return setTimeout(() => this.say([EN_US('Doors closing.')]), 900);
      case 'muni':
      case 'people-mover':
        return sfx.tramBell();
      case 'streetcar':
        return sfx.gong();
      case 'cable':
        return sfx.cableBell();
      case 'caltrain':
        return sfx.bartChime();
      case 'paris-metro':
        return sfx.parisBuzzer();
      case 'paris-rer':
        return sfx.bartChime();
      case 'berlin-u':
      case 'berlin-s':
      case 'berlin-tram':
        this.say([DE('Zurückbleiben, bitte!')]);
        return sfx.berlinDoors(0.9);
      case 'madrid-metro':
      case 'madrid-rail':
        return sfx.madridDoors();
      case 'seoul':
        this.say([KO('출입문 닫습니다.')]);
        return sfx.madridDoors(1.1);
      case 'mtr':
        sfx.mtrDoors();
        return setTimeout(() => this.say([YUE('請勿靠近車門。')]), 300);
      default: {
        // Tokyo: the station's departure melody, then the door warning and chime.
        const seed = [...at.s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7);
        const style = pack === 'jr' ? 'jr' : pack === 'toei' ? 'toei' : 'metro';
        const dur = left > 7 ? sfx.departureMelody(style, seed) : 0;
        setTimeout(
          () => {
            if (this.tid !== t.id) return;
            this.say([JA('ドアが閉まります。ご注意ください。')]);
            sfx.jpDoorChime(0.4);
          },
          Math.max(0, dur * 1000 + 200),
        );
      }
    }
  }
}

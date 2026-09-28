import type { CityId, LineDef } from '../../shared/types.ts';
import type { RollingStyle } from './sound.ts';

// Announcements for the newer cities, each in the city's own language and in the spirit of how its trains
// actually talk. Phrasing and chimes are our own; set phrases like "Mind the gap" are what riders hear.

export interface Say {
  line: LineDef;
  /** Destination and next/current station, in English and in the local script (same when it's the same). */
  dest: string;
  destL: string;
  stop: string;
  stopL: string;
  /** Other lines at this station (for approach/arrival). */
  transfers: LineDef[];
}

export interface Phrasebook {
  lang: string;
  intro: (s: Say) => string;
  /** Said ~15 s before arriving; empty for systems that stay quiet. */
  approach: (s: Say) => string;
  /** Said on arrival at an intermediate stop (optional). */
  arrive?: (s: Say) => string;
  terminal: (s: Say) => string;
  /** Spoken as the doors close; `stop` is the next station. */
  doors?: (s: Say) => string;
  /** Door chime: semitones above C5, played in sequence. */
  chime: number[];
  chimeStep?: number;
  chimeKind?: 'bell' | 'beep';
  /** Seconds before departure that the doors start closing. */
  lead?: number;
  /** Systems that name the next stop as the doors close (Moscow) don't repeat it after departure. */
  quietDepart?: boolean;
  roll: RollingStyle;
}

const local = (l: LineDef) => l.nameLocal ?? l.name;
const short = (l: LineDef) => l.short || l.name;
const and = (xs: string[], word: string) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${word} ${xs[xs.length - 1]}`);
const uniq = (xs: string[]) => [...new Set(xs)];

const METRO: RollingStyle = { rumble: 0.85, roar: 0.7, whine: 1, clack: 0.7, carLen: 19 };
const HEAVY: RollingStyle = { rumble: 0.9, roar: 0.8, whine: 0.9, clack: 0.8, carLen: 22 };
const LIGHT: RollingStyle = { rumble: 0.5, roar: 0.1, whine: 0.8, clack: 0.5, carLen: 12 };
const OLD: RollingStyle = { rumble: 1, roar: 1, whine: 0.7, clack: 1, carLen: 19 };

const mandarin: Phrasebook = {
  lang: 'zh-CN',
  intro: (s) => `本次列车开往${s.destL}。下一站，${s.stopL}。`,
  approach: (s) => `下一站，${s.stopL}。${s.transfers.length ? `可换乘${uniq(s.transfers.map(local)).join('、')}。` : ''}`,
  arrive: (s) => `${s.stopL}到了。`,
  terminal: (s) => `终点站，${s.stopL}，到了。请全体乘客下车，带好您的随身物品。`,
  doors: () => '车门即将关闭，请注意安全。',
  chime: [16, 16, 16, 16, 16, 16],
  chimeStep: 0.2,
  chimeKind: 'beep',
  lead: 6,
  roll: METRO,
};

const english = (o: Partial<Phrasebook> & Pick<Phrasebook, 'intro' | 'approach' | 'terminal' | 'chime'>): Phrasebook => ({ lang: 'en-US', roll: HEAVY, ...o });

export const PHRASEBOOKS: Partial<Record<CityId, Phrasebook>> = {
  shanghai: mandarin,
  beijing: mandarin,
  guangzhou: mandarin,
  shenzhen: mandarin,
  chengdu: mandarin,
  hangzhou: mandarin,
  wuhan: mandarin,
  chongqing: { ...mandarin, roll: LIGHT },
  taipei: {
    lang: 'zh-TW',
    intro: (s) => `往${s.destL}的列車，下一站，${s.stopL}。`,
    approach: (s) => `下一站，${s.stopL}。${s.transfers.length ? `轉乘${uniq(s.transfers.map(local)).join('、')}的旅客，請在本站下車。` : ''}`,
    terminal: (s) => `${s.stopL}站到了，本列車為終點站，請全部旅客下車。`,
    // The Taipei Metro door jingle is a bright little rising run.
    chime: [12, 16, 19, 24, 19, 24],
    chimeStep: 0.16,
    lead: 5,
    roll: METRO,
  },
  moscow: {
    lang: 'ru-RU',
    intro: (s) => `Следующая станция — ${s.stopL}.`,
    approach: () => '',
    arrive: (s) => `Станция ${s.stopL}.${s.transfers.length ? ` Переход на ${uniq(s.transfers.map(local)).join(', ')}.` : ''}`,
    terminal: (s) => `Станция ${s.stopL}. Конечная. Поезд дальше не идёт, просьба выйти из вагонов.`,
    doors: (s) => `Осторожно, двери закрываются! Следующая станция — ${s.stopL}.`,
    chime: [],
    lead: 6,
    quietDepart: true,
    roll: OLD,
  },
  delhi: {
    lang: 'hi-IN',
    intro: (s) => `यह मेट्रो ${s.destL} तक जाएगी। अगला स्टेशन ${s.stopL} है।`,
    approach: (s) =>
      `अगला स्टेशन ${s.stopL} है।${s.transfers.length ? ` यह इंटरचेंज स्टेशन है, ${uniq(s.transfers.map(local)).join(', ')} के लिए यहाँ बदलें।` : ''}`,
    terminal: () => 'यह इस मेट्रो का अंतिम स्टेशन है। सभी यात्रियों से अनुरोध है कि वे यहाँ उतर जाएँ।',
    doors: () => 'कृपया दरवाज़ों से हटकर खड़े हों।',
    chime: [19, 19, 19, 19],
    chimeStep: 0.3,
    chimeKind: 'beep',
    roll: METRO,
  },
  cairo: {
    lang: 'ar-EG',
    intro: (s) => `هذا القطار متجه إلى ${s.destL}. المحطة القادمة ${s.stopL}.`,
    approach: (s) => `المحطة القادمة ${s.stopL}.${s.transfers.length ? ` للتحويل إلى ${uniq(s.transfers.map(local)).join(' و')}.` : ''}`,
    terminal: (s) => `محطة ${s.stopL}، المحطة الأخيرة. نرجو من جميع الركاب النزول.`,
    doors: () => 'احترس، الأبواب تغلق.',
    chime: [10, 10, 10],
    chimeStep: 0.45,
    chimeKind: 'beep',
    roll: OLD,
  },
  mexicocity: {
    lang: 'es-MX',
    intro: (s) => `Línea ${short(s.line)}, dirección ${s.dest}. Próxima estación: ${s.stop}.`,
    approach: (s) =>
      `Próxima estación: ${s.stop}.${s.transfers.length ? ` Correspondencia con ${s.transfers.length > 1 ? 'las líneas' : 'la línea'} ${and(uniq(s.transfers.map(short)), 'y')}.` : ''}`,
    terminal: (s) => `${s.stop}. Terminal. Favor de desalojar el tren.`,
    chime: [7, 7, 7, 7, 7],
    chimeStep: 0.24,
    chimeKind: 'beep',
    roll: { rumble: 0.7, roar: 0.8, whine: 0.9, clack: 0.4, carLen: 17 }, // rubber tires
  },
  saopaulo: {
    lang: 'pt-BR',
    intro: (s) => `Linha ${short(s.line)}, sentido ${s.dest}. Próxima estação: ${s.stop}.`,
    approach: (s) =>
      `Próxima estação: ${s.stop}.${s.transfers.length ? ` Conexão com ${s.transfers.length > 1 ? 'as linhas' : 'a linha'} ${and(uniq(s.transfers.map(short)), 'e')}.` : ''}`,
    terminal: (s) => `Estação ${s.stop}. Estação terminal. Por favor, desembarquem.`,
    doors: () => 'Ao ouvir o sinal sonoro, não entre nem saia do trem.',
    chime: [12, 12, 12, 12],
    chimeStep: 0.28,
    chimeKind: 'beep',
    roll: METRO,
  },
  singapore: english({
    lang: 'en-SG',
    intro: (s) => `This train is bound for ${s.dest}. Next station, ${s.stop}.`,
    approach: (s) =>
      `Next station, ${s.stop}.${s.transfers.length ? ` Change here for the ${and(uniq(s.transfers.map((l) => l.name)), 'and')}.` : ''} Please mind the platform gap.`,
    terminal: () => 'This is the terminal station. All passengers, please alight.',
    doors: () => 'Doors closing.',
    chime: [16, 12, 16, 12],
    chimeStep: 0.22,
    roll: METRO,
  }),
  washington: english({
    intro: (s) => `This is a ${s.line.name} train to ${s.dest}. The next station is ${s.stop}.`,
    approach: (s) => `${s.stop}.${s.transfers.length ? ` Transfer to the ${and(uniq(s.transfers.map((l) => l.name)), 'and')}.` : ''}`,
    terminal: (s) => `${s.stop}. This is the end of the line. All passengers must exit the train.`,
    doors: () => 'Step back, doors closing.',
    chime: [12, 7],
    chimeStep: 0.45,
  }),
  chicago: english({
    intro: (s) => `This is a ${s.line.name} train to ${s.dest}. The next stop is ${s.stop}.`,
    approach: (s) => `${s.stop} is next.${s.transfers.length ? ` Transfer to ${and(uniq(s.transfers.map((l) => l.name)), 'and')}.` : ''}`,
    terminal: (s) => `This is ${s.stop}. This is the end of the line.`,
    doors: () => 'Doors closing.',
    chime: [9, 4],
    chimeStep: 0.4,
    roll: OLD,
  }),
  boston: english({
    intro: (s) => `This is a ${s.line.name} train to ${s.dest}. The next stop is ${s.stop}.`,
    approach: (s) => `Next stop, ${s.stop}.${s.transfers.length ? ` Change here for the ${and(uniq(s.transfers.map((l) => l.name)), 'and')}.` : ''}`,
    terminal: (s) => `This is ${s.stop}. This is the last stop on this train. Everyone please exit.`,
    doors: () => 'Please stand clear of the doors.',
    chime: [14, 14],
    chimeStep: 0.35,
  }),
  sydney: english({
    lang: 'en-AU',
    intro: (s) => `This train goes to ${s.dest}. The next station is ${s.stop}.`,
    approach: (s) => `The next station is ${s.stop}.`,
    terminal: () => 'This train terminates here. Please make sure you have all your belongings with you.',
    doors: () => 'Stand clear, the doors are closing.',
    chime: [19, 16, 12],
    chimeStep: 0.25,
  }),
  stockholm: {
    lang: 'sv-SE',
    intro: (s) => `Mot ${s.dest}. Nästa: ${s.stop}.`,
    approach: (s) => `Nästa: ${s.stop}.${s.transfers.length ? ` Byte till ${and(uniq(s.transfers.map(short)), 'och')}.` : ''}`,
    arrive: (s) => `${s.stop}. Tänk på avståndet mellan vagn och plattform.`,
    terminal: (s) => `${s.stop}. Slutstation. Alla resenärer ombeds stiga av.`,
    chime: [17, 17, 17],
    chimeStep: 0.3,
    chimeKind: 'beep',
    roll: OLD,
  },
  oslo: {
    lang: 'nb-NO',
    intro: (s) => `Linje ${short(s.line)} mot ${s.dest}. Neste stasjon: ${s.stop}.`,
    approach: (s) => `Neste: ${s.stop}.`,
    terminal: (s) => `${s.stop}. Endestasjon. Alle må gå av.`,
    doors: () => 'Dørene lukkes.',
    chime: [12, 16, 19],
    chimeStep: 0.22,
    roll: METRO,
  },
  helsinki: {
    lang: 'fi-FI',
    intro: (s) => `${s.dest}. Seuraava asema: ${s.stop}.`,
    approach: (s) => `Seuraava: ${s.stop}.`,
    terminal: () => 'Pääteasema. Kaikki matkustajat, olkaa hyvä ja poistukaa junasta.',
    chime: [19, 15, 12],
    chimeStep: 0.24,
    roll: METRO,
  },
  vienna: {
    lang: 'de-AT',
    intro: (s) => `${short(s.line)} nach ${s.dest}. Nächste Station: ${s.stop}.`,
    approach: (s) => `Nächste Station: ${s.stop}.${s.transfers.length ? ` Umsteigen zu ${and(uniq(s.transfers.map(short)), 'und')}.` : ''}`,
    terminal: (s) => `${s.stop}. Endstation. Bitte alle aussteigen.`,
    doors: () => 'Zug fährt ab.',
    chime: [16, 16, 16],
    chimeStep: 0.18,
    chimeKind: 'beep',
    roll: METRO,
  },
  amsterdam: {
    lang: 'nl-NL',
    intro: (s) => `Lijn ${short(s.line)} naar ${s.dest}. Volgende halte: ${s.stop}.`,
    approach: (s) => `Volgende halte: ${s.stop}.`,
    terminal: (s) => `${s.stop}. Eindpunt. Iedereen uitstappen, alstublieft.`,
    doors: () => 'Let op, de deuren sluiten.',
    chime: [14, 10],
    chimeStep: 0.35,
    roll: LIGHT,
  },
};

// Synthesized train sounds (no samples) and spoken announcements via the browser's speech voices.
// Everything is off until the user turns sound on.

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let enabled = false;
let noiseBuf: AudioBuffer | null = null;

export function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    out = ctx.createGain();
    out.gain.value = 0.55;
    out.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return { ctx, out: out! };
}

export function soundOn() {
  return enabled;
}

export function setSound(on: boolean) {
  enabled = on;
  if (on) {
    audio();
    loadVoices();
  } else {
    stopSpeech();
  }
  try {
    localStorage.setItem('tt-sound', on ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

export function restoreSound() {
  try {
    enabled = localStorage.getItem('tt-sound') === '1';
  } catch {
    enabled = false;
  }
  return enabled;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------
function noise() {
  const { ctx } = audio();
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/** A struck bell: inharmonic partials with fast decay. */
function bell(freq: number, at: number, gain: number, decay = 1.2, partials = [1, 2.0, 2.76, 4.07], dest?: AudioNode) {
  const { ctx, out } = audio();
  const t = ctx.currentTime + at;
  partials.forEach((ratio, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq * ratio;
    const pg = gain / (1 + i * 1.6);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(pg, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay / (1 + i * 0.5));
    o.connect(g).connect(dest ?? out);
    o.start(t);
    o.stop(t + decay + 0.1);
  });
}

/** A soft keyboard/marimba-like note used for melodies. */
function note(freq: number, at: number, dur: number, gain: number) {
  const { ctx, out } = audio();
  const t = ctx.currentTime + at;
  for (const [ratio, type, g0] of [
    [1, 'sine', 1],
    [2, 'sine', 0.35],
    [3.01, 'triangle', 0.12],
  ] as const) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq * ratio;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain * g0, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.6);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur * 1.7);
  }
}

function tone(freq: number, at: number, dur: number, gain: number, type: OscillatorType = 'sine', dest?: AudioNode) {
  const { ctx, out } = audio();
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.setValueAtTime(gain, t + dur - 0.02);
  g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g).connect(dest ?? out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noiseBurst(at: number, dur: number, gain: number, type: BiquadFilterType, freq: number, q = 1, sweepTo?: number) {
  const { ctx, out } = audio();
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noise();
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + Math.min(0.05, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

const hz = (semisFromA4: number) => 440 * Math.pow(2, semisFromA4 / 12);
/** Semitones from C5. */
const c5 = (s: number) => hz(s + 3);

// ---------------------------------------------------------------------------
// Door chimes, bells, horns
// ---------------------------------------------------------------------------
export const sfx = {
  pop() {
    const { ctx, out } = audio();
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.08);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.16);
  },
  /** New Technology Trains: a descending two-tone "bing-bong". */
  nycChime(at = 0) {
    bell(c5(14), at, 0.35, 1.1, [1, 2.0, 3.0]);
    bell(c5(10), at + 0.42, 0.35, 1.4, [1, 2.0, 3.0]);
  },
  /** Tube door-closing alarm: quick electronic beeps. */
  tubeBeeps(at = 0) {
    for (let i = 0; i < 4; i++) tone(1180, at + i * 0.3, 0.16, 0.12, 'square');
  },
  /** BART Fleet of the Future: three rising tones. */
  bartChime(at = 0) {
    [0, 4, 7].forEach((s, i) => bell(c5(s + 12), at + i * 0.28, 0.28, 0.9, [1, 2.0]));
  },
  /** Japanese door chime: a bright two-tone repeated. */
  jpDoorChime(at = 0) {
    for (let i = 0; i < 3; i++) {
      bell(c5(16), at + i * 0.62, 0.22, 0.5, [1, 2.0]);
      bell(c5(12), at + i * 0.62 + 0.3, 0.22, 0.5, [1, 2.0]);
    }
  },
  /** Paris Métro door warning: the classic buzzer. */
  parisBuzzer(at = 0) {
    tone(466, at, 1.1, 0.07, 'square');
    tone(470, at, 1.1, 0.05, 'sawtooth');
  },
  /** Berlin U-Bahn door warning: a quick falling three-tone signal. */
  berlinDoors(at = 0) {
    [0, 0.16, 0.32].forEach((d, i) => tone(1320 - i * 220, at + d, 0.13, 0.1, 'square'));
  },
  /** Madrid Metro doors: a steady two-note beeping. */
  madridDoors(at = 0) {
    for (let i = 0; i < 4; i++) tone(i % 2 ? 1046 : 1318, at + i * 0.22, 0.18, 0.08, 'triangle');
  },
  /** MTR door chime: a crisp repeating high tone. */
  mtrDoors(at = 0) {
    for (let i = 0; i < 6; i++) bell(c5(19), at + i * 0.25, 0.16, 0.22, [1, 2.0]);
  },
  /** Seoul: an original pentatonic arrival tune (transfer stations). */
  seoulMelody(at = 0) {
    const tune: [number, number][] = [[7, 0.5], [9, 0.5], [12, 1], [9, 0.5], [7, 0.5], [4, 1], [7, 0.5], [2, 0.5], [0, 1.5]];
    let t = at;
    for (const [n, b] of tune) {
      note(c5(n), t, b * 0.3 * 1.5, 0.18);
      t += b * 0.3;
    }
  },
  /** A door chime from a note list (semitones above C5); returns its length in seconds. */
  chime(notes: number[], step = 0.3, kind: 'bell' | 'beep' = 'bell', at = 0) {
    notes.forEach((n, i) => (kind === 'bell' ? bell(c5(n), at + i * step, Math.min(0.3, step), 0.55, [1, 2.0, 3.0]) : tone(c5(n), at + i * step, step * 0.6, 0.08, 'square')));
    return notes.length * step;
  },
  /** A soft "pon" when a Japanese train stops. */
  jpArrive(at = 0) {
    bell(c5(7), at, 0.18, 1.6, [1, 2.0, 3.0]);
  },
  /** Cable car bell: the gripman's ding-ding, ding-ding-ding. */
  cableBell(at = 0) {
    [0, 0.18, 0.62, 0.8, 0.98].forEach((d) => bell(1180, at + d, 0.3, 0.9, [1, 2.4, 3.9, 5.6]));
  },
  /** Streetcar gong: two low clangs. */
  gong(at = 0) {
    bell(620, at, 0.4, 1.6, [1, 2.1, 3.3, 4.9]);
    bell(620, at + 0.35, 0.4, 1.8, [1, 2.1, 3.3, 4.9]);
  },
  tramBell(at = 0) {
    bell(980, at, 0.28, 1.0, [1, 2.6, 4.2]);
    bell(980, at + 0.22, 0.28, 1.1, [1, 2.6, 4.2]);
  },
  /** Commuter-train horn: a slightly dissonant chord, two long blasts. */
  horn(at = 0) {
    const { ctx, out } = audio();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    lp.connect(out);
    for (const [start, len] of [
      [0, 1.1],
      [1.4, 1.6],
    ]) {
      for (const f of [311, 370, 466]) tone(f, at + start, len, 0.06, 'sawtooth', lp);
    }
  },
  /** Brake squeal and a sigh of air as the train stops. */
  brakes(at = 0, squeal = 0.08) {
    const { ctx, out } = audio();
    const t = ctx.currentTime + at;
    if (squeal > 0) {
      const o = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoG = ctx.createGain();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(2900, t);
      o.frequency.linearRampToValueAtTime(2500, t + 1.2);
      lfo.frequency.value = 7;
      lfoG.gain.value = 40;
      lfo.connect(lfoG).connect(o.frequency);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(squeal, t + 0.2);
      g.gain.linearRampToValueAtTime(0, t + 1.3);
      o.connect(g).connect(out);
      o.start(t);
      lfo.start(t);
      o.stop(t + 1.4);
      lfo.stop(t + 1.4);
    }
    noiseBurst(at + 1.1, 0.9, 0.12, 'bandpass', 3200, 0.8, 1400);
  },
  /** An original Japanese-style departure melody. `seed` picks one of several (each station has its own). */
  departureMelody(style: 'jr' | 'metro' | 'toei', seed: number, at = 0) {
    const tunes: Record<string, [number, number][][]> = {
      // [semitones from C5, beats]
      jr: [
        [[0, 0.5], [4, 0.5], [7, 0.5], [12, 0.5], [11, 0.5], [7, 0.5], [9, 0.5], [7, 0.5], [4, 0.5], [5, 0.5], [7, 0.5], [9, 0.5], [7, 1], [12, 1.5]],
        [[7, 0.5], [9, 0.5], [12, 1], [14, 0.5], [12, 0.5], [9, 1], [7, 0.5], [9, 0.5], [5, 0.5], [7, 0.5], [4, 1], [2, 0.5], [4, 0.5], [0, 1.5]],
        [[4, 0.5], [7, 0.5], [11, 0.5], [14, 1], [12, 0.5], [11, 0.5], [9, 0.5], [7, 1], [9, 0.5], [11, 0.5], [12, 0.5], [16, 1], [14, 0.5], [12, 1.5]],
        [[12, 0.5], [11, 0.5], [9, 0.5], [7, 0.5], [9, 0.5], [11, 0.5], [12, 1], [7, 0.5], [4, 0.5], [5, 0.5], [7, 0.5], [9, 1], [11, 0.5], [12, 1.5]],
      ],
      metro: [
        [[12, 0.5], [7, 0.5], [9, 0.5], [4, 0.5], [7, 1], [12, 1.5]],
        [[4, 0.5], [7, 0.5], [12, 0.5], [11, 0.5], [9, 1], [7, 1.5]],
        [[9, 0.5], [12, 0.5], [16, 1], [14, 0.5], [12, 0.5], [9, 1.5]],
      ],
      toei: [
        [[7, 0.5], [11, 0.5], [14, 0.5], [19, 1], [17, 0.5], [14, 0.5], [12, 1.5]],
        [[0, 0.5], [5, 0.5], [9, 0.5], [12, 1], [10, 0.5], [9, 0.5], [7, 1.5]],
      ],
    };
    const list = tunes[style];
    const tune = list[Math.abs(seed) % list.length];
    const beat = style === 'jr' ? 0.24 : 0.28;
    let t = at;
    for (const [s, b] of tune) {
      note(c5(s), t, b * beat * 1.4, 0.2);
      // A soft harmony a sixth below on longer notes.
      if (b >= 1) note(c5(s - 9), t, b * beat * 1.4, 0.07);
      t += b * beat;
    }
    return t - at;
  },
};

// ---------------------------------------------------------------------------
// Rolling sound for the train you're riding with: rumble, motor whine and wheel clacks.
// ---------------------------------------------------------------------------
export interface RollingStyle {
  rumble: number; // body of the low roar
  roar: number; // extra mid-frequency roar (deep tube, NYC)
  whine: number; // traction motor whine (VVVF)
  clack: number; // rail-joint clicks
  carLen: number; // meters between clacks
}

export class Rolling {
  private nodes: { src: AudioBufferSourceNode; lp: BiquadFilterNode; g: GainNode; roarBp: BiquadFilterNode; roarG: GainNode; o1: OscillatorNode; o2: OscillatorNode; wg: GainNode } | null = null;
  private dist = 0;
  duck = 1;

  start() {
    if (this.nodes) return;
    const { ctx, out } = audio();
    const src = ctx.createBufferSource();
    src.buffer = noise();
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(lp).connect(g).connect(out);
    const roarBp = ctx.createBiquadFilter();
    roarBp.type = 'bandpass';
    roarBp.frequency.value = 700;
    roarBp.Q.value = 0.7;
    const roarG = ctx.createGain();
    roarG.gain.value = 0;
    src.connect(roarBp).connect(roarG).connect(out);
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o2.type = 'sawtooth';
    const wbp = ctx.createBiquadFilter();
    wbp.type = 'bandpass';
    wbp.frequency.value = 900;
    wbp.Q.value = 1.2;
    const wg = ctx.createGain();
    wg.gain.value = 0;
    o1.connect(wbp);
    o2.connect(wbp);
    wbp.connect(wg).connect(out);
    src.start();
    o1.start();
    o2.start();
    this.nodes = { src, lp, g, roarBp, roarG, o1, o2, wg };
  }

  update(speed: number, accel: number, dt: number, style: RollingStyle, level: number) {
    if (!this.nodes) this.start();
    const n = this.nodes!;
    const { ctx } = audio();
    const t = ctx.currentTime;
    const v = Math.max(0, speed);
    const k = Math.min(1, v / 22) * level * this.duck;
    n.g.gain.setTargetAtTime(0.35 * style.rumble * (0.15 + 0.85 * k), t, 0.15);
    n.lp.frequency.setTargetAtTime(140 + v * 22, t, 0.2);
    n.roarG.gain.setTargetAtTime(0.12 * style.roar * k * k, t, 0.2);
    n.roarBp.frequency.setTargetAtTime(420 + v * 30, t, 0.3);
    // Motor whine: pitch follows speed, louder while accelerating or braking.
    const w = style.whine * level * this.duck * Math.min(1, v / 4) * (0.35 + Math.min(1, Math.abs(accel) / 0.8));
    n.wg.gain.setTargetAtTime(0.03 * w, t, 0.2);
    n.o1.frequency.setTargetAtTime(90 + v * 38, t, 0.2);
    n.o2.frequency.setTargetAtTime((90 + v * 38) * 1.5, t, 0.2);
    // Clack-clack as each bogie crosses a rail joint.
    this.dist += v * dt;
    if (style.clack > 0 && v > 2 && this.dist > style.carLen) {
      this.dist %= style.carLen;
      const gap = Math.min(0.6, 15 / v);
      const gg = 0.18 * style.clack * level * this.duck * Math.min(1, v / 12);
      noiseBurst(0, 0.05, gg, 'lowpass', 900);
      noiseBurst(gap * 0.18, 0.05, gg * 0.8, 'lowpass', 850);
    }
  }

  stop() {
    const n = this.nodes;
    if (!n) return;
    const { ctx } = audio();
    const t = ctx.currentTime;
    for (const g of [n.g, n.roarG, n.wg]) g.gain.setTargetAtTime(0, t, 0.25);
    this.nodes = null;
    setTimeout(() => {
      n.src.stop();
      n.o1.stop();
      n.o2.stop();
    }, 1500);
  }
}

// ---------------------------------------------------------------------------
// Announcements (Web Speech API)
// ---------------------------------------------------------------------------
const PREFERRED: Record<string, string[]> = {
  'en-US': ['Samantha', 'Google US English', 'Microsoft Aria', 'Microsoft Jenny', 'Alex', 'Allison', 'Ava'],
  'en-GB': ['Daniel', 'Google UK English Male', 'Microsoft Ryan', 'Serena', 'Kate', 'Google UK English Female', 'Arthur'],
  'ja-JP': ['Kyoko', 'Google 日本語', 'O-ren', 'Otoya', 'Microsoft Nanami', 'Microsoft Ayumi', 'Hattori'],
  'fr-FR': ['Thomas', 'Amélie', 'Amelie', 'Google français', 'Microsoft Denise', 'Audrey', 'Marie'],
  'de-DE': ['Anna', 'Google Deutsch', 'Markus', 'Microsoft Katja', 'Petra', 'Helena'],
  'es-ES': ['Mónica', 'Monica', 'Google español', 'Jorge', 'Microsoft Elvira', 'Marisol'],
  'ko-KR': ['Yuna', 'Google 한국의', 'Microsoft SunHi', 'Sora', 'Jian'],
  'zh-HK': ['Sinji', 'Google 粵語（香港）', 'Microsoft HiuGaai', 'Aasing'],
  'zh-CN': ['Tingting', 'Google 普通话', 'Microsoft Xiaoxiao', 'Lili', 'Yu-shu'],
  'zh-TW': ['Meijia', 'Google 國語（臺灣）', 'Microsoft HsiaoChen', 'Microsoft HanHan'],
  'ru-RU': ['Milena', 'Google русский', 'Microsoft Svetlana', 'Yuri', 'Katya'],
  'hi-IN': ['Lekha', 'Google हिन्दी', 'Microsoft Swara', 'Kiyara'],
  'ar-EG': ['Microsoft Salma', 'Google العربية', 'Maged', 'Majed', 'Laila'],
  'es-MX': ['Paulina', 'Microsoft Dalia', 'Google español de Estados Unidos', 'Juan'],
  'pt-BR': ['Luciana', 'Google português do Brasil', 'Microsoft Francisca', 'Felipe'],
  'en-SG': ['Microsoft Luna', 'Microsoft Wayne'],
  'en-AU': ['Karen', 'Microsoft Natasha', 'Google UK English Female', 'Lee'],
  'sv-SE': ['Alva', 'Google svenska', 'Microsoft Sofie', 'Klara', 'Oskar'],
  'nb-NO': ['Nora', 'Google norsk', 'Microsoft Pernille'],
  'fi-FI': ['Satu', 'Google suomi', 'Microsoft Noora', 'Onni'],
  'nl-NL': ['Xander', 'Ellen', 'Google Nederlands', 'Microsoft Colette', 'Claire'],
  'de-AT': ['Microsoft Ingrid', 'Anna', 'Google Deutsch'],
};

let voices: SpeechSynthesisVoice[] = [];
function loadVoices() {
  if (typeof speechSynthesis === 'undefined') return;
  voices = speechSynthesis.getVoices();
  speechSynthesis.onvoiceschanged = () => (voices = speechSynthesis.getVoices());
}

function voiceFor(lang: string) {
  const langVoices = voices.filter((v) => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase());
  for (const name of PREFERRED[lang] ?? []) {
    const v = langVoices.find((x) => x.name.includes(name));
    if (v) return v;
  }
  return langVoices[0] ?? voices.find((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase())) ?? null;
}

export interface Line {
  text: string;
  lang: string; // BCP 47, e.g. 'ja-JP'
  rate?: number;
  pitch?: number;
}

let speaking = 0;
export function isSpeaking() {
  return speaking > 0 || (typeof speechSynthesis !== 'undefined' && speechSynthesis.speaking);
}

/** Queue spoken lines; resolves when they've all been read. */
export function speak(lines: Line[], onState?: (on: boolean) => void): Promise<void> {
  if (!enabled || typeof speechSynthesis === 'undefined' || !lines.length) return Promise.resolve();
  if (!voices.length) loadVoices();
  return new Promise((resolve) => {
    let left = lines.length;
    speaking++;
    onState?.(true);
    const done = () => {
      if (--left > 0) return;
      speaking = Math.max(0, speaking - 1);
      onState?.(false);
      resolve();
    };
    for (const l of lines) {
      const u = new SpeechSynthesisUtterance(l.text);
      u.lang = l.lang;
      const v = voiceFor(l.lang);
      if (v) u.voice = v;
      u.rate = l.rate ?? 1;
      u.pitch = l.pitch ?? 1;
      u.volume = 0.95;
      u.onend = done;
      u.onerror = done;
      speechSynthesis.speak(u);
    }
  });
}

export function stopSpeech() {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  speaking = 0;
}

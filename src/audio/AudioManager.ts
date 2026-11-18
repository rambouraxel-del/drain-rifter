import type { BiomeId } from '../core/types';
import { BIOME_ORDER } from '../core/types';

export type SfxName = 'crash' | 'whoosh' | 'fall-start' | 'fall-land' | 'near-miss' | 'click' | 'splash' | 'start' | 'biome' | 'scrape';

export interface AudioFrame {
  playing: boolean;
  speed: number; // m/s
  biome: BiomeId;
  nextBiome: BiomeId;
  blend: number;
  lateral: number; // -1..1 lateral velocity
  scraping: boolean;
}

type Mode = 'menu' | 'game' | 'paused' | 'gameover';

/** One short-lived sound (one-shot or scheduled event). Nodes are disconnected when it ends. */
interface Voice {
  srcs: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  end: number;
}

interface MusicScale {
  rootHz: number;
  scale: number[]; // semitones
  prog: number[]; // chord roots as scale degrees
}

const MAX_VOICES = 16;
const SPEED_REF = 45; // m/s mapped to slide intensity 1
const TICK_MS = 50;
const LOOKAHEAD = 0.15; // s of music scheduled ahead of the audio clock

/** Probability per 50 ms scheduler tick of an ambient event in each biome. */
const AMBIENT_P: Record<BiomeId, number> = { sewer: 0.035, industrial: 0.012, cavern: 0.03, ruins: 0.008, abyss: 0.02 };

const MUSIC: Record<BiomeId, MusicScale> = {
  sewer: { rootHz: 73.42, scale: [0, 2, 3, 5, 7, 9, 10], prog: [0, 3, 6, 5] }, // D dorian
  industrial: { rootHz: 82.41, scale: [0, 1, 3, 5, 7, 8, 10], prog: [0, 1, 0, 4] }, // E phrygian
  cavern: { rootHz: 55, scale: [0, 3, 5, 7, 10], prog: [0, 3, 0, 2] }, // A minor pentatonic
  ruins: { rootHz: 98, scale: [0, 2, 3, 5, 7, 8, 11], prog: [0, 3, 4, 0] }, // G harmonic minor
  abyss: { rootHz: 65.41, scale: [0, 2, 4, 6, 8, 10], prog: [0, 2, 4, 1] }, // C whole tone
};

const AMBIENT_LEVEL: Record<Mode, number> = { menu: 0.6, game: 1, paused: 0.25, gameover: 0.2 };
const SLIDE_LEVEL: Record<Mode, number> = { menu: 0, game: 1, paused: 0, gameover: 0 };
const MUSIC_LEVEL: Record<Mode, number> = { menu: 0.55, game: 1, paused: 0.35, gameover: 0.3 };
const MUSIC_CUTOFF: Record<Mode, number> = { menu: 2600, game: 18000, paused: 700, gameover: 900 };

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const rand = (a: number, b: number): number => a + Math.random() * (b - a);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** Frequency of scale degree `deg` (may exceed the scale length) shifted by `octave`. */
function degFreq(M: MusicScale, deg: number, octave: number): number {
  const n = M.scale.length;
  const o = Math.floor(deg / n);
  const i = ((deg % n) + n) % n;
  return M.rootHz * Math.pow(2, (M.scale[i] + 12 * (o + octave)) / 12);
}

/** Weight of biome `b` in the current frame, accounting for a transition blend. */
function biomeWeight(f: AudioFrame, b: BiomeId): number {
  const bl = clamp(f.blend, 0, 1);
  let w = 0;
  if (f.biome === b) w += 1 - bl;
  if (f.nextBiome === b) w += bl;
  return clamp(w, 0, 1);
}

/** Shared noise buffer: white, or brown (random walk) for rumbles. Reused by every source. */
function makeNoise(c: AudioContext, seconds: number, brown: boolean): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = clamp(last * 3.5, -1, 1);
    } else {
      d[i] = w;
    }
  }
  return buf;
}

/** Cave-like reverb impulse: decaying stereo noise. */
function makeImpulse(c: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  return buf;
}

/**
 * Procedural audio for the whole game. Everything is synthesised with Web Audio;
 * no sample files. Methods are no-ops until unlock() succeeds, and never throw.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private ready = false;
  private mode: Mode = 'menu';
  private musicVol = 0.8;
  private sfxVol = 0.9;
  private frame: AudioFrame | null = null;
  private k = 0; // normalised speed 0..1
  private bpm = 64;
  private ticks = 0;

  // Buses: master -> compressor -> out. music and sfx (incl. slide layers, ambience) are separate.
  private master!: GainNode;
  private musicBus!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private musicMode!: GainNode;
  private sfxBus!: GainNode;
  private slideBus!: GainNode; // mode duck for slide/wind/scrape/texture layers
  private ambBus!: GainNode; // biome beds + ambient events
  private dripBus!: GainNode;
  private reverbIn!: GainNode;
  private echoIn!: GainNode;

  // Shared buffers and fan-out for the continuous noise layers.
  private noiseWhite!: AudioBuffer;
  private noiseBrown!: AudioBuffer;
  private whiteIn!: GainNode;
  private slideF!: BiquadFilterNode;
  private slideG!: GainNode;
  private windF!: BiquadFilterNode;
  private windG!: GainNode;
  private scrapeF!: BiquadFilterNode;
  private scrapeG!: GainNode;

  // Music pad and scheduler state.
  private padF!: BiquadFilterNode;
  private padOsc: OscillatorNode[] = [];
  private nextStep = 0;
  private step = 0;
  private musicBiome: BiomeId = 'sewer';
  private chordDeg = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  // Per-biome layers, created lazily the first time a biome has any weight.
  private texG: Partial<Record<BiomeId, GainNode>> = {};
  private bedG: Partial<Record<BiomeId, GainNode>> = {};

  private voiceEnds: number[] = [];

  /* ---------------- public API ---------------- */

  /** Call from a user gesture (click/tap). Creates or resumes the AudioContext. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
        const Ctor = w.AudioContext ?? w.webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.build(this.ctx);
      }
      const c = this.ctx;
      if (c.state !== 'running') void c.resume().catch(() => {});
      // iOS: starting a silent buffer inside the gesture unlocks audio output.
      const silent = c.createBuffer(1, 1, c.sampleRate);
      const src = c.createBufferSource();
      src.buffer = silent;
      src.connect(c.destination);
      src.start(0);
      if (this.timer === null) this.timer = setInterval(() => this.schedule(), TICK_MS);
    } catch {
      /* audio is optional */
    }
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVol = clamp(music, 0, 1);
    this.sfxVol = clamp(sfx, 0, 1);
    this.applyMix(0.15);
  }

  update(_dt: number, f: AudioFrame): void {
    const c = this.ctx;
    if (!c || !this.ready) return;
    try {
      this.frame = f;
      this.ticks++;
      if (c.state === 'suspended' && this.ticks % 30 === 0) void c.resume().catch(() => {});
      const now = c.currentTime;
      const k = clamp(f.speed / SPEED_REF, 0, 1);
      this.k = k;
      const active = f.playing ? 1 : 0.2;
      const lat = Math.min(1, Math.abs(f.lateral));

      // Slide friction noise: bandpass centre and level rise with speed.
      this.slideG.gain.setTargetAtTime(active * (0.05 + 0.3 * k), now, 0.25);
      this.slideF.frequency.setTargetAtTime(180 + 900 * k, now, 0.3);

      // Wind: highpass noise, louder and brighter with speed and lateral motion.
      this.windG.gain.setTargetAtTime(active * (0.03 + 0.2 * k + 0.1 * lat), now, 0.3);
      this.windF.frequency.setTargetAtTime(260 + 2400 * k + 700 * lat, now, 0.3);

      // Wall scrape: gated by frame.scraping.
      const scr = f.scraping && f.playing ? 1 : 0;
      this.scrapeG.gain.setTargetAtTime(scr * (0.22 + 0.1 * k), now, 0.05);
      this.scrapeF.frequency.setTargetAtTime(1700 + 900 * k, now, 0.15);

      // Biome textures and ambience beds crossfade with the blend weight.
      for (const b of BIOME_ORDER) {
        const w = biomeWeight(f, b);
        if (w > 0.001 && !this.texG[b]) {
          this.texG[b] = this.buildTexture(c, b);
          this.bedG[b] = this.buildBed(c, b);
        }
        this.texG[b]?.gain.setTargetAtTime(w * active * (0.3 + 0.45 * k), now, 0.3);
        this.bedG[b]?.gain.setTargetAtTime(w, now, 0.8);
      }

      // Tempo loosely follows speed while playing.
      this.bpm = f.playing && this.mode === 'game' ? 72 + 28 * k : this.mode === 'menu' ? 64 : 58;
    } catch {
      /* never let audio break the frame loop */
    }
  }

  play(name: SfxName): void {
    const c = this.ctx;
    if (!c || !this.ready) return;
    try {
      const force = name === 'crash';
      if (!force && !this.canVoice()) return;
      const t = c.currentTime + 0.005;
      const out = this.sfxBus;
      const v = this.voice(t + 1);
      switch (name) {
        case 'crash':
          v.end = t + 1.5;
          this.burst(v, t, 1.3, 0.9, 'lowpass', 3000, 300, 0.7, out);
          this.thump(v, t, 95, 32, 0.9, 1.0, out);
          for (let i = 0; i < 9; i++) {
            const f0 = rand(900, 3000);
            this.burst(v, t + rand(0.04, 0.9), rand(0.05, 0.14), 0.25, 'bandpass', f0, rand(900, 3000), 4, out);
          }
          break;
        case 'whoosh':
          v.end = t + 0.8;
          this.burst(v, t, 0.7, 0.45, 'bandpass', 350, 2600, 1.2, out);
          break;
        case 'fall-start': {
          // Creak: slow sawtooth through a rising lowpass, plus rumble.
          v.end = t + 1.6;
          const o = this.osc(v, 'sawtooth', 58, t, 1.4, 96);
          const lp = this.filt(c, 'lowpass', 300, 1);
          lp.frequency.exponentialRampToValueAtTime(700, t + 1.4);
          const g = c.createGain();
          this.env(g, t, 0.22, 0.25, 1.4);
          o.connect(lp);
          lp.connect(g);
          g.connect(out);
          v.nodes.push(lp, g);
          this.burst(v, t, 1.4, 0.18, 'lowpass', 250, 900, 1, out);
          break;
        }
        case 'fall-land':
          v.end = t + 0.6;
          this.thump(v, t, 120, 38, 0.55, 0.9, out);
          this.burst(v, t, 0.3, 0.5, 'lowpass', 1000, 200, 0.7, out);
          break;
        case 'near-miss':
          v.end = t + 0.3;
          this.burst(v, t, 0.28, 0.4, 'bandpass', 1100, 3200, 1.5, out);
          break;
        case 'click':
          v.end = t + 0.05;
          this.thump(v, t, 1900, 1500, 0.03, 0.12, out);
          break;
        case 'splash':
          v.end = t + 0.6;
          this.burst(v, t, 0.45, 0.5, 'bandpass', 1400, 400, 0.8, out);
          for (let i = 0; i < 6; i++) {
            const f0 = rand(700, 1800);
            this.thump(v, t + rand(0.05, 0.35), f0, f0 * 1.5, 0.09, rand(0.08, 0.16), out);
          }
          break;
        case 'start':
          v.end = t + 2.2;
          [293.66, 440, 587.33, 880].forEach((f, i) => this.bell(v, t + i * 0.12, f, 1.6, 0.16, out));
          this.burst(v, t, 0.6, 0.2, 'bandpass', 200, 1600, 1, out);
          break;
        case 'biome': {
          // Low swell for a biome change.
          v.end = t + 3.4;
          const o1 = this.osc(v, 'sine', 55, t, 3.2);
          const o2 = this.osc(v, 'sine', 82.4, t, 3.2);
          const g = c.createGain();
          this.env(g, t, 0.2, 0.9, 3.2);
          o1.connect(g);
          o2.connect(g);
          g.connect(out);
          v.nodes.push(g);
          this.burst(v, t, 1.8, 0.12, 'lowpass', 260, 700, 0.8, out);
          break;
        }
        case 'scrape':
          v.end = t + 0.3;
          this.burst(v, t, 0.22, 0.35, 'bandpass', 2600, 1800, 3.5, out);
          break;
      }
      this.commit(v);
    } catch {
      /* ignore */
    }
  }

  /** Menu / pause / game over: duck the slide sounds, keep soft music. */
  setMode(m: Mode): void {
    const prev = this.mode;
    this.mode = m;
    if (!this.ready) return;
    try {
      this.applyMix(0.4);
      if (m === 'gameover' && prev !== 'gameover') this.sting();
    } catch {
      /* ignore */
    }
  }

  /* ---------------- graph construction ---------------- */

  private build(c: AudioContext): void {
    this.master = c.createGain();
    this.master.gain.value = 0.9;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.008;
    comp.release.value = 0.25;
    this.master.connect(comp);
    comp.connect(c.destination);

    // Reverb (cave-like tail) and echo (for drips).
    this.reverbIn = c.createGain();
    const conv = c.createConvolver();
    conv.buffer = makeImpulse(c, 2.4);
    const verbOut = c.createGain();
    verbOut.gain.value = 0.55;
    this.reverbIn.connect(conv);
    conv.connect(verbOut);
    verbOut.connect(this.master);

    this.echoIn = c.createGain();
    const delay = c.createDelay(1.5);
    delay.delayTime.value = 0.34;
    const fb = c.createGain();
    fb.gain.value = 0.45;
    const echoLp = this.filt(c, 'lowpass', 2200, 0.5);
    const echoOut = c.createGain();
    echoOut.gain.value = 0.45;
    this.echoIn.connect(delay);
    delay.connect(echoLp);
    echoLp.connect(fb);
    fb.connect(delay);
    echoLp.connect(echoOut);
    echoOut.connect(this.master);

    // Music bus: user volume -> mode lowpass -> mode level -> master, plus a reverb send.
    this.musicBus = c.createGain();
    this.musicFilter = this.filt(c, 'lowpass', 18000, 0.5);
    this.musicMode = c.createGain();
    this.musicBus.connect(this.musicFilter);
    this.musicFilter.connect(this.musicMode);
    this.musicMode.connect(this.master);
    const musicSend = c.createGain();
    musicSend.gain.value = 0.3;
    this.musicMode.connect(musicSend);
    musicSend.connect(this.reverbIn);

    // SFX bus: user volume -> master, plus a reverb send.
    this.sfxBus = c.createGain();
    this.sfxBus.connect(this.master);
    const sfxSend = c.createGain();
    sfxSend.gain.value = 0.2;
    this.sfxBus.connect(sfxSend);
    sfxSend.connect(this.reverbIn);

    this.slideBus = c.createGain();
    this.slideBus.connect(this.sfxBus);
    this.ambBus = c.createGain();
    this.ambBus.connect(this.sfxBus);
    this.dripBus = c.createGain();
    this.dripBus.gain.value = 0.8;
    this.dripBus.connect(this.ambBus);
    this.dripBus.connect(this.echoIn);

    // Shared noise sources.
    this.noiseWhite = makeNoise(c, 2, false);
    this.noiseBrown = makeNoise(c, 2, true);
    this.whiteIn = c.createGain();
    this.loop(this.noiseWhite, this.whiteIn);

    this.slideF = this.filt(c, 'bandpass', 400, 0.9);
    this.slideG = c.createGain();
    this.slideG.gain.value = 0;
    this.whiteIn.connect(this.slideF);
    this.slideF.connect(this.slideG);
    this.slideG.connect(this.slideBus);

    this.windF = this.filt(c, 'highpass', 400, 0.5);
    this.windG = c.createGain();
    this.windG.gain.value = 0;
    this.whiteIn.connect(this.windF);
    this.windF.connect(this.windG);
    this.windG.connect(this.slideBus);

    this.scrapeF = this.filt(c, 'bandpass', 2000, 3);
    this.scrapeG = c.createGain();
    this.scrapeG.gain.value = 0;
    this.whiteIn.connect(this.scrapeF);
    this.scrapeF.connect(this.scrapeG);
    this.scrapeG.connect(this.slideBus);

    // Music pad: six detuned triangles (root/third/fifth, two detunes each) through a slow lowpass.
    this.padF = this.filt(c, 'lowpass', 520, 0.6);
    const padG = c.createGain();
    padG.gain.value = 0.07;
    this.padF.connect(padG);
    padG.connect(this.musicBus);
    for (let i = 0; i < 6; i++) {
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 146.83;
      o.detune.value = i % 2 === 0 ? -6 : 6;
      o.connect(this.padF);
      o.start();
      this.padOsc.push(o);
    }
    this.lfo(c, 0.05, 200, this.padF.frequency);
    this.setChord(MUSIC.sewer, 0, c.currentTime, 0.01);

    this.ready = true;
    this.applyMix(0.01);
  }

  private applyMix(tc: number): void {
    const c = this.ctx;
    if (!c || !this.ready) return;
    const now = c.currentTime;
    this.musicBus.gain.setTargetAtTime(this.musicVol * 0.8, now, tc);
    this.sfxBus.gain.setTargetAtTime(this.sfxVol * 0.9, now, tc);
    this.musicMode.gain.setTargetAtTime(MUSIC_LEVEL[this.mode], now, tc);
    this.musicFilter.frequency.setTargetAtTime(MUSIC_CUTOFF[this.mode], now, tc);
    this.slideBus.gain.setTargetAtTime(SLIDE_LEVEL[this.mode], now, tc);
    this.ambBus.gain.setTargetAtTime(AMBIENT_LEVEL[this.mode], now, tc);
  }

  private buildTexture(c: AudioContext, b: BiomeId): GainNode {
    const out = c.createGain();
    out.gain.value = 0;
    out.connect(this.slideBus);
    const amp = c.createGain();
    amp.connect(out);
    switch (b) {
      case 'sewer': {
        // Wet gurgle: bandpass whose centre wobbles, with bubbly amplitude.
        const bp = this.filt(c, 'bandpass', 520, 2.5);
        this.lfo(c, 0.6, 160, bp.frequency);
        amp.gain.value = 0.6;
        this.lfo(c, 3.2, 0.3, amp.gain);
        this.whiteIn.connect(bp);
        bp.connect(amp);
        break;
      }
      case 'industrial': {
        // Metallic scrape: three resonant peaks.
        amp.gain.value = 1;
        this.lfo(c, 0.3, 0.2, amp.gain);
        for (const f of [880, 1760, 2640]) {
          const bp = this.filt(c, 'bandpass', f, 18);
          const g = c.createGain();
          g.gain.value = 0.35;
          this.whiteIn.connect(bp);
          bp.connect(g);
          g.connect(amp);
        }
        break;
      }
      case 'cavern': {
        // Gritty stone dust: lowpass body plus a little high grit.
        amp.gain.value = 0.7;
        this.lfo(c, 0.4, 0.2, amp.gain);
        const lp = this.filt(c, 'lowpass', 1100, 0.7);
        this.whiteIn.connect(lp);
        lp.connect(amp);
        const hp = this.filt(c, 'highpass', 3800, 0.7);
        const g = c.createGain();
        g.gain.value = 0.25;
        this.whiteIn.connect(hp);
        hp.connect(g);
        g.connect(amp);
        break;
      }
      case 'ruins': {
        // Dusty wind through stone: a slowly wandering midband.
        const bp = this.filt(c, 'bandpass', 650, 0.9);
        this.lfo(c, 0.15, 220, bp.frequency);
        amp.gain.value = 0.8;
        this.lfo(c, 0.07, 0.2, amp.gain);
        this.whiteIn.connect(bp);
        bp.connect(amp);
        break;
      }
      case 'abyss': {
        // Airy shimmer: highs that breathe, plus a moving high band.
        const hp = this.filt(c, 'highpass', 3500, 0.7);
        amp.gain.value = 0.5;
        this.lfo(c, 0.12, 0.4, amp.gain);
        this.whiteIn.connect(hp);
        hp.connect(amp);
        const bp = this.filt(c, 'bandpass', 6000, 3);
        this.lfo(c, 0.4, 1200, bp.frequency);
        const g = c.createGain();
        g.gain.value = 0.3;
        this.whiteIn.connect(bp);
        bp.connect(g);
        g.connect(out);
        break;
      }
    }
    return out;
  }

  private buildBed(c: AudioContext, b: BiomeId): GainNode {
    const out = c.createGain();
    out.gain.value = 0;
    out.connect(this.ambBus);
    const level = (n: AudioNode, g: number): void => {
      const gn = c.createGain();
      gn.gain.value = g;
      n.connect(gn);
      gn.connect(out);
    };
    switch (b) {
      case 'sewer': {
        // Distant water: brown rumble, bandpassed.
        const bp = this.filt(c, 'bandpass', 380, 0.8);
        this.loop(this.noiseBrown, bp);
        level(bp, 0.9);
        break;
      }
      case 'industrial': {
        // Distant machinery hum: 50 Hz saw and 100 Hz square.
        for (const [type, f, g] of [['sawtooth', 50, 0.08], ['square', 100, 0.02]] as const) {
          const o = c.createOscillator();
          o.type = type;
          o.frequency.value = f;
          const lp = this.filt(c, 'lowpass', 260, 0.7);
          o.connect(lp);
          o.start();
          level(lp, g);
        }
        break;
      }
      case 'cavern': {
        // Low rumble.
        const lp = this.filt(c, 'lowpass', 120, 0.7);
        this.loop(this.noiseBrown, lp);
        level(lp, 1.1);
        break;
      }
      case 'ruins': {
        // Wind through the ruins.
        const bp = this.filt(c, 'bandpass', 480, 0.5);
        this.lfo(c, 0.1, 180, bp.frequency);
        this.loop(this.noiseWhite, bp);
        level(bp, 0.5);
        break;
      }
      case 'abyss': {
        // Eerie pad: three detuned sines behind a slowly moving lowpass.
        const lp = this.filt(c, 'lowpass', 900, 0.7);
        this.lfo(c, 0.05, 300, lp.frequency);
        for (const f of [110, 164.8, 220.5]) {
          const o = c.createOscillator();
          o.type = 'sine';
          o.frequency.value = f;
          o.connect(lp);
          o.start();
        }
        level(lp, 0.12);
        break;
      }
    }
    return out;
  }

  private filt(c: AudioContext, type: BiquadFilterType, f: number, q: number): BiquadFilterNode {
    const n = c.createBiquadFilter();
    n.type = type;
    n.frequency.value = f;
    n.Q.value = q;
    return n;
  }

  /** Endless looped buffer into `dest`, started at a random offset. */
  private loop(buf: AudioBuffer, dest: AudioNode): void {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.connect(dest);
    s.start(0, Math.random() * 1.5);
  }

  /** Slow sine modulating `target` with the given depth. Lives forever, costs little. */
  private lfo(c: AudioContext, hz: number, depth: number, target: AudioParam): void {
    const o = c.createOscillator();
    o.frequency.value = hz;
    const g = c.createGain();
    g.gain.value = depth;
    o.connect(g);
    g.connect(target);
    o.start();
  }

  /* ---------------- voices ---------------- */

  private canVoice(): boolean {
    const now = this.ctx ? this.ctx.currentTime : 0;
    this.voiceEnds = this.voiceEnds.filter((e) => e > now);
    return this.voiceEnds.length < MAX_VOICES;
  }

  private voice(end: number): Voice {
    return { srcs: [], nodes: [], end };
  }

  /** Register a finished-building voice; its nodes are disconnected once every source has ended. */
  private commit(v: Voice): void {
    if (v.srcs.length === 0) return;
    this.voiceEnds.push(v.end);
    let pending = v.srcs.length;
    const done = (): void => {
      if (--pending > 0) return;
      for (const n of [...v.srcs, ...v.nodes]) {
        try {
          n.disconnect();
        } catch {
          /* already gone */
        }
      }
    };
    for (const s of v.srcs) s.onended = done;
  }

  private env(g: GainNode, t: number, peak: number, attack: number, dur: number): void {
    const p = g.gain;
    p.setValueAtTime(0.0001, t);
    p.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + Math.max(attack, 0.002));
    p.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  private osc(v: Voice, type: OscillatorType, f0: number, t: number, dur: number, f1 = f0): OscillatorNode {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.start(t);
    o.stop(t + dur + 0.05);
    v.srcs.push(o);
    return o;
  }

  /** Short filtered noise burst. */
  private burst(v: Voice, t: number, dur: number, peak: number, type: BiquadFilterType, f0: number, f1: number, q: number, dest: AudioNode): void {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noiseWhite;
    src.start(t, Math.random() * 1.5, dur + 0.02);
    const f = this.filt(c, type, f0, q);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    this.env(g, t, peak, Math.min(0.012, dur * 0.2), dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    v.srcs.push(src);
    v.nodes.push(f, g);
  }

  /** Pitch-dropping sine thump (also used for drips, clicks and taps). */
  private thump(v: Voice, t: number, f0: number, f1: number, dur: number, peak: number, dest: AudioNode): void {
    const o = this.osc(v, 'sine', f0, t, dur, f1);
    const g = this.ctx!.createGain();
    this.env(g, t, peak, 0.005, dur);
    o.connect(g);
    g.connect(dest);
    v.nodes.push(g);
  }

  /** Bell: sine plus an inharmonic partial. */
  private bell(v: Voice, t: number, f: number, dur: number, peak: number, dest: AudioNode): void {
    const c = this.ctx!;
    const g = c.createGain();
    this.env(g, t, peak, 0.004, dur);
    const o1 = this.osc(v, 'sine', f, t, dur);
    const o2 = this.osc(v, 'sine', f * 2.76, t, dur);
    const g2 = c.createGain();
    g2.gain.value = 0.25;
    o1.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(dest);
    v.nodes.push(g, g2);
  }

  /** Soft sub pulse for the music. */
  private sub(t: number, hz: number, peak: number): void {
    const v = this.voice(t + 0.8);
    const o = this.osc(v, 'sine', hz, t, 0.7);
    const g = this.ctx!.createGain();
    this.env(g, t, peak, 0.03, 0.7);
    o.connect(g);
    g.connect(this.musicBus);
    v.nodes.push(g);
    this.commit(v);
  }

  private sting(): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + 0.05;
    const v = this.voice(t + 4);
    this.bell(v, t, 293.66, 2.8, 0.2, this.sfxBus);
    this.bell(v, t + 0.55, 233.08, 2.8, 0.18, this.sfxBus);
    this.bell(v, t + 1.1, 220, 3.2, 0.18, this.sfxBus);
    this.thump(v, t, 73.42, 70, 2.5, 0.25, this.sfxBus);
    this.commit(v);
  }

  /* ---------------- scheduler (music + ambient events) ---------------- */

  private schedule(): void {
    const c = this.ctx;
    if (!c || !this.ready) return;
    try {
      if (c.state !== 'running') return;
      const now = c.currentTime;
      if (this.nextStep < now) this.nextStep = now + 0.05;
      while (this.nextStep < now + LOOKAHEAD) {
        this.musicStep(this.nextStep, this.step++);
        this.nextStep += 15 / this.bpm; // one sixteenth note
      }
      this.ambient(now);
    } catch {
      /* ignore */
    }
  }

  private setChord(M: MusicScale, deg: number, t: number, tc: number): void {
    const freqs = [degFreq(M, deg, 1), degFreq(M, deg + 2, 1), degFreq(M, deg + 4, 1)];
    this.padOsc.forEach((o, i) => o.frequency.setTargetAtTime(freqs[i % 3], t, tc));
  }

  private musicStep(t: number, step: number): void {
    const mode = this.mode;
    if (step % 16 === 0) {
      const f = this.frame;
      if (f) this.musicBiome = f.blend < 0.5 ? f.biome : f.nextBiome;
      const M = MUSIC[this.musicBiome];
      this.chordDeg = M.prog[Math.floor(step / 16) % M.prog.length];
      this.setChord(M, this.chordDeg, t, 0.9);
    }
    const M = MUSIC[this.musicBiome];
    if ((mode === 'game' || mode === 'menu') && step % 8 === 0 && this.canVoice()) {
      this.sub(t, M.rootHz * 0.5, mode === 'game' ? 0.22 : 0.1);
    }
    const density = mode === 'game' ? 0.1 + 0.12 * this.k : mode === 'menu' ? 0.03 : 0.012;
    if (Math.random() < density && (step % 2 === 0 || Math.random() < 0.3) && this.canVoice()) {
      const deg = this.chordDeg + pick([0, 1, 2, 3, 4, 6]);
      const hz = degFreq(M, deg, Math.random() < 0.4 ? 2 : 1);
      const dur = rand(1.6, 3.4);
      const v = this.voice(t + dur + 0.1);
      this.bell(v, t, hz, dur, mode === 'game' ? 0.09 : 0.05, this.musicBus);
      this.commit(v);
    }
  }

  private ambient(now: number): void {
    const f = this.frame;
    if (!f || !this.ready) return;
    const amb = AMBIENT_LEVEL[this.mode];
    if (amb < 0.05) return;
    const b: BiomeId = f.blend < 0.5 ? f.biome : f.nextBiome;
    if (Math.random() > AMBIENT_P[b] || !this.canVoice()) return;
    const t = now + 0.02;
    const v = this.voice(t + 1);
    switch (b) {
      case 'sewer': {
        // Sewer drip, routed through the echo.
        const f0 = rand(900, 2000);
        v.end = t + 0.3;
        this.thump(v, t, f0 * 1.25, f0, 0.14, 0.3 * amb, this.dripBus);
        break;
      }
      case 'cavern': {
        // Deeper cave drip into the echo.
        const f0 = rand(500, 1200);
        v.end = t + 0.5;
        this.thump(v, t, f0 * 1.25, f0, 0.2, 0.35 * amb, this.dripBus);
        break;
      }
      case 'industrial': {
        // Distant clank: metallic noise plus inharmonic ring.
        v.end = t + 0.9;
        this.burst(v, t, 0.12, 0.25 * amb, 'bandpass', rand(1800, 3200), rand(1800, 3200), 6, this.ambBus);
        this.bell(v, t, rand(180, 320), 0.7, 0.1 * amb, this.ambBus);
        break;
      }
      case 'ruins': {
        // Far chime on the ruins scale.
        v.end = t + 3.4;
        this.bell(v, t, degFreq(MUSIC.ruins, pick([0, 2, 4, 5]), 2), 3.2, 0.12 * amb, this.ambBus);
        break;
      }
      case 'abyss': {
        // Eerie shimmer: a slowly swelling high tone.
        v.end = t + 1.6;
        const g = this.ctx!.createGain();
        const o = this.osc(v, 'sine', rand(1400, 2600), t, 1.5);
        this.env(g, t, 0.06 * amb, 0.6, 1.5);
        o.connect(g);
        g.connect(this.ambBus);
        v.nodes.push(g);
        break;
      }
    }
    this.commit(v);
  }
}

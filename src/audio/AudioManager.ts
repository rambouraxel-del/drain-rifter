import type { BiomeId } from '../core/types';

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

/**
 * CONTRACT (Audio agent owns this file): fully procedural Web Audio.
 * unlock() must be called from a user gesture. All methods must be safe to call before unlock().
 */
export class AudioManager {
  unlock(): void {}
  setVolumes(_music: number, _sfx: number): void {}
  update(_dt: number, _f: AudioFrame): void {}
  play(_name: SfxName): void {}
  /** Menu / pause / game over: duck the slide sounds, keep soft music. */
  setMode(_m: 'menu' | 'game' | 'paused' | 'gameover'): void {}
}

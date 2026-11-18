import type { QualitySettings, Settings } from './types';
import { MAX_QUALITY_STEP, degradeQuality, resolveQuality } from './Quality';

/**
 * Adaptive quality. Call `update(rawDt)` once per frame while playing (pass the UNCLAMPED frame time).
 * Returns a new QualitySettings only when the step changed, else null.
 * Only acts when the user preference is 'auto'.
 */
export class PerfMonitor {
  private pref: Settings['quality'] = 'auto';
  private base: QualitySettings;
  private step = 0;
  private winT = 0;
  private winN = 0;
  private sinceChange = 0;
  private warmup = 1.5;
  private upCooldown = 10;
  private lastWasUp = false;
  /** Average FPS over the last completed window (for debugging / HUD). */
  avgFps = 60;

  constructor(base: QualitySettings, pref: Settings['quality'] = 'auto') {
    this.base = base;
    this.pref = pref;
  }

  get currentStep(): number { return this.step; }

  /** Call when the user changes the quality setting. Returns the settings to apply. */
  setPreference(pref: Settings['quality']): QualitySettings {
    this.pref = pref;
    this.base = resolveQuality(pref);
    this.step = 0;
    this.reset();
    return { ...this.base };
  }

  /** Call at run start / after pause / after any long hitch so shader compiles do not count. */
  reset(): void {
    this.winT = 0; this.winN = 0; this.warmup = 1.5;
  }

  update(dt: number): QualitySettings | null {
    if (this.pref !== 'auto') return null;
    this.sinceChange += dt;
    if (this.warmup > 0) { this.warmup -= dt; return null; }
    if (dt > 0.5) return null; // tab switch / pause: ignore
    this.winT += dt; this.winN++;
    if (this.winT < 3) return null;
    const fps = this.winN / this.winT;
    this.avgFps = fps;
    this.winT = 0; this.winN = 0;
    if (fps < 50 && this.step < MAX_QUALITY_STEP) {
      if (this.lastWasUp) this.upCooldown = Math.min(80, this.upCooldown * 2); // we oscillated: back off
      this.lastWasUp = false;
      this.step++;
      this.sinceChange = 0;
      return degradeQuality(this.base, this.step);
    }
    if (fps >= 58 && this.step > 0 && this.sinceChange >= this.upCooldown) {
      this.lastWasUp = true;
      this.step--;
      this.sinceChange = 0;
      return degradeQuality(this.base, this.step);
    }
    if (fps >= 50) this.lastWasUp = false;
    return null;
  }
}

import type { QualitySettings, Settings } from './types';

export const QUALITY_PRESETS: Record<QualitySettings['level'], QualitySettings> = {
  low: { level: 'low', pixelRatio: 1, viewDistance: 120, particles: 0.35, shadows: false },
  medium: { level: 'medium', pixelRatio: 1.5, viewDistance: 170, particles: 0.7, shadows: false },
  high: { level: 'high', pixelRatio: 2, viewDistance: 220, particles: 1, shadows: false },
};

/** Pick a starting quality level. 'auto' guesses from device hints; PerfMonitor then refines it from frame times. */
export function resolveQuality(pref: Settings['quality']): QualitySettings {
  if (pref !== 'auto') return { ...QUALITY_PRESETS[pref] };
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 900);
  const cores = navigator.hardwareConcurrency || 4;
  const level: QualitySettings['level'] = !mobile ? 'high' : cores >= 6 ? 'medium' : 'low';
  return { ...QUALITY_PRESETS[level], pixelRatio: Math.min(QUALITY_PRESETS[level].pixelRatio, devicePixelRatio || 1) };
}

/** Degradation ladder: pixel ratio first, then view distance / particles. Step 0 = base settings. */
const LADDER: { pr: number; vd: number; p: number }[] = [
  { pr: 1, vd: 1, p: 1 },
  { pr: 0.8, vd: 1, p: 1 },
  { pr: 0.65, vd: 1, p: 1 },
  { pr: 0.65, vd: 0.82, p: 0.6 },
  { pr: 0.55, vd: 0.68, p: 0.35 },
];
export const MAX_QUALITY_STEP = LADDER.length - 1;

/** Settings for a given degradation step (0 = unchanged). Never returns pixelRatio < 0.5. */
export function degradeQuality(base: QualitySettings, step: number): QualitySettings {
  const l = LADDER[Math.max(0, Math.min(MAX_QUALITY_STEP, step))];
  if (step <= 0) return { ...base };
  return {
    ...base,
    pixelRatio: Math.max(0.5, base.pixelRatio * l.pr),
    viewDistance: Math.round(Math.max(80, base.viewDistance * l.vd)),
    particles: Math.max(0.2, base.particles * l.p),
  };
}

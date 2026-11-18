import type { QualitySettings, Settings } from './types';

export const QUALITY_PRESETS: Record<QualitySettings['level'], QualitySettings> = {
  low: { level: 'low', pixelRatio: 1, viewDistance: 120, particles: 0.35, shadows: false },
  medium: { level: 'medium', pixelRatio: 1.5, viewDistance: 170, particles: 0.7, shadows: false },
  high: { level: 'high', pixelRatio: 2, viewDistance: 220, particles: 1, shadows: false },
};

/** Pick a starting quality level. 'auto' guesses from device hints; Integration agent may refine with FPS monitoring. */
export function resolveQuality(pref: Settings['quality']): QualitySettings {
  if (pref !== 'auto') return { ...QUALITY_PRESETS[pref] };
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 900);
  const cores = navigator.hardwareConcurrency || 4;
  const level: QualitySettings['level'] = !mobile ? 'high' : cores >= 6 ? 'medium' : 'low';
  return { ...QUALITY_PRESETS[level], pixelRatio: Math.min(QUALITY_PRESETS[level].pixelRatio, devicePixelRatio || 1) };
}

import type { Settings } from './types';

const KEY_SETTINGS = 'drainrifter.settings.v1';
const KEY_BEST = 'drainrifter.best.v1';
const KEY_STATS = 'drainrifter.stats.v1';

export const DEFAULT_SETTINGS: Settings = { musicVolume: 0.6, sfxVolume: 0.8, sensitivity: 1, quality: 'auto', showFps: false };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch { return fallback; }
}
function write(key: string, v: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ }
}

export const Storage = {
  loadSettings(): Settings { return read(KEY_SETTINGS, DEFAULT_SETTINGS); },
  saveSettings(s: Settings): void { write(KEY_SETTINGS, s); },
  loadBest(): number { try { return Number(localStorage.getItem(KEY_BEST)) || 0; } catch { return 0; } },
  saveBest(m: number): void { try { localStorage.setItem(KEY_BEST, String(Math.floor(m))); } catch { /* */ } },
  loadStats(): { runs: number; total: number } { return read(KEY_STATS, { runs: 0, total: 0 }); },
  saveStats(s: { runs: number; total: number }): void { write(KEY_STATS, s); },
};

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Storage, DEFAULT_SETTINGS } from '../src/core/Storage';
import type { Settings } from '../src/core/types';

const SETTINGS_KEY = 'drainrifter.settings.v1';
const BEST_KEY = 'drainrifter.best.v1';
const STATS_KEY = 'drainrifter.stats.v1';

function makeLocalStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
}

let store: ReturnType<typeof makeLocalStorage>;

beforeEach(() => {
  store = makeLocalStorage();
  vi.stubGlobal('localStorage', store);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Storage: settings', () => {
  it('returns the defaults when nothing is stored', () => {
    expect(Storage.loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('save then load round-trips every field', () => {
    const custom: Settings = {
      musicVolume: 0.15,
      sfxVolume: 0.25,
      sensitivity: 1.75,
      quality: 'high',
      showFps: true,
    };
    Storage.saveSettings(custom);
    expect(Storage.loadSettings()).toEqual(custom);
  });

  it('merges a partial stored object over the defaults', () => {
    store.setItem(SETTINGS_KEY, JSON.stringify({ musicVolume: 0.2 }));
    expect(Storage.loadSettings()).toEqual({ ...DEFAULT_SETTINGS, musicVolume: 0.2 });
  });

  it('returns the defaults for corrupt JSON', () => {
    store.setItem(SETTINGS_KEY, '{not json');
    expect(Storage.loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('returns the defaults when the stored value is JSON null', () => {
    store.setItem(SETTINGS_KEY, 'null');
    expect(Storage.loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('returns the defaults when localStorage.getItem throws', () => {
    vi.stubGlobal('localStorage', {
      ...store,
      getItem: () => { throw new Error('SecurityError'); },
    });
    expect(Storage.loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('saveSettings does not throw when localStorage.setItem throws (private mode)', () => {
    vi.stubGlobal('localStorage', {
      ...store,
      setItem: () => { throw new Error('QuotaExceededError'); },
    });
    expect(() => Storage.saveSettings(DEFAULT_SETTINGS)).not.toThrow();
  });

  // BUG (source): src/core/Storage.ts line 12 — read() returns the `fallback` object itself
  // when nothing is stored, so DEFAULT_SETTINGS is handed out by reference. Mutating the
  // result of loadSettings() silently changes the defaults for every later load.
  it('returns a fresh copy, not the shared DEFAULT_SETTINGS object', () => {
    const loaded = Storage.loadSettings();
    loaded.musicVolume = 0.01;
    expect(DEFAULT_SETTINGS.musicVolume).toBe(0.6);
    expect(Storage.loadSettings().musicVolume).toBe(0.6);
  });
});

describe('Storage: best distance', () => {
  it('is 0 when nothing is stored', () => {
    expect(Storage.loadBest()).toBe(0);
  });

  it('save then load round-trips, floored to whole metres', () => {
    Storage.saveBest(1234.9);
    expect(Storage.loadBest()).toBe(1234);
  });

  it('is 0 for a non-numeric stored value', () => {
    store.setItem(BEST_KEY, 'abc');
    expect(Storage.loadBest()).toBe(0);
  });

  it('is 0 when localStorage.getItem throws', () => {
    vi.stubGlobal('localStorage', {
      ...store,
      getItem: () => { throw new Error('SecurityError'); },
    });
    expect(Storage.loadBest()).toBe(0);
  });

  it('saveBest does not throw when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      ...store,
      setItem: () => { throw new Error('QuotaExceededError'); },
    });
    expect(() => Storage.saveBest(500)).not.toThrow();
  });
});

describe('Storage: stats', () => {
  it('returns zeroed stats when nothing is stored', () => {
    expect(Storage.loadStats()).toEqual({ runs: 0, total: 0 });
  });

  it('save then load round-trips', () => {
    Storage.saveStats({ runs: 3, total: 4500 });
    expect(Storage.loadStats()).toEqual({ runs: 3, total: 4500 });
  });

  it('returns zeroed stats for corrupt JSON', () => {
    store.setItem(STATS_KEY, '[[[');
    expect(Storage.loadStats()).toEqual({ runs: 0, total: 0 });
  });

  it('keeps best and stats independent of each other', () => {
    Storage.saveBest(900);
    Storage.saveStats({ runs: 1, total: 900 });
    expect(Storage.loadBest()).toBe(900);
    expect(Storage.loadStats()).toEqual({ runs: 1, total: 900 });
  });
});

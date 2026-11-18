import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/core/config';
import { difficultyAt, speedAt } from '../src/core/difficulty';

describe('speedAt', () => {
  it('starts at CONFIG.speed.start', () => {
    expect(speedAt(0)).toBeCloseTo(CONFIG.speed.start, 12);
  });

  it('clamps negative distances to the start speed', () => {
    expect(speedAt(-500)).toBeCloseTo(CONFIG.speed.start, 12);
  });

  it('is monotonically non-decreasing over 0..60 km', () => {
    let prev = -Infinity;
    for (let d = 0; d <= 60_000; d += 25) {
      const v = speedAt(d);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = v;
    }
  });

  it('stays within [start, max] and approaches max', () => {
    for (let d = 0; d <= 60_000; d += 100) {
      const v = speedAt(d);
      expect(v).toBeGreaterThanOrEqual(CONFIG.speed.start - 1e-12);
      expect(v).toBeLessThanOrEqual(CONFIG.speed.max + 1e-9);
    }
    expect(speedAt(1e9)).toBeCloseTo(CONFIG.speed.max, 6);
  });

  it('reaches about 63% of the way to max at rampDistance', () => {
    const { start, max, rampDistance } = CONFIG.speed;
    const expected = start + (max - start) * (1 - Math.exp(-1));
    expect(speedAt(rampDistance)).toBeCloseTo(expected, 9);
  });

  it('returns finite values', () => {
    for (const d of [0, 1, 1e3, 1e6]) expect(Number.isFinite(speedAt(d))).toBe(true);
  });
});

describe('difficultyAt', () => {
  it('is 0 for the first 150 m (grace period)', () => {
    expect(difficultyAt(0)).toBe(0);
    expect(difficultyAt(-10)).toBe(0);
    expect(difficultyAt(150)).toBe(0);
  });

  it('stays within [0, 1] for all distances', () => {
    for (let d = -100; d <= 200_000; d += 37) {
      const v = difficultyAt(d);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('is monotonically non-decreasing', () => {
    let prev = -Infinity;
    for (let d = 0; d <= 100_000; d += 20) {
      const v = difficultyAt(d);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = v;
    }
  });

  it('approaches 1 at large distances', () => {
    expect(difficultyAt(1e6)).toBeCloseTo(1, 9);
  });
});

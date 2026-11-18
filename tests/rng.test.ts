import { describe, it, expect } from 'vitest';
import { RNG, hash } from '../src/core/rng';

function sequence(seed: number, n: number): number[] {
  const r = new RNG(seed);
  return Array.from({ length: n }, () => r.next());
}

describe('RNG determinism', () => {
  it('same seed produces the same sequence', () => {
    expect(sequence(12345, 500)).toEqual(sequence(12345, 500));
  });

  it('different seeds produce different sequences', () => {
    expect(sequence(1, 50)).not.toEqual(sequence(2, 50));
  });

  it('is unaffected by other RNG instances being consumed in between', () => {
    const a = new RNG(99);
    const b = new RNG(99);
    const other = new RNG(5);
    const seqA: number[] = [];
    const seqB: number[] = [];
    for (let i = 0; i < 100; i++) {
      seqA.push(a.next());
      other.next();
      seqB.push(b.next());
    }
    expect(seqA).toEqual(seqB);
  });

  it('seed 0 still yields a usable, non-constant stream', () => {
    const s = sequence(0, 20);
    expect(new Set(s).size).toBeGreaterThan(15);
    expect(s).toEqual(sequence(0, 20));
  });

  it('next() is in [0, 1) and roughly uniform', () => {
    const s = sequence(777, 20_000);
    expect(Math.min(...s)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...s)).toBeLessThan(1);
    const mean = s.reduce((a, b) => a + b, 0) / s.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
  });

  it('range(a, b) stays within [a, b)', () => {
    const r = new RNG(3);
    for (let i = 0; i < 2000; i++) {
      const v = r.range(-4, 9);
      expect(v).toBeGreaterThanOrEqual(-4);
      expect(v).toBeLessThan(9);
    }
  });

  it('int(a, b) is inclusive and covers both ends', () => {
    const r = new RNG(8);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(2, 5);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });

  it('pick() returns an element of the array, deterministically', () => {
    const items = ['a', 'b', 'c'] as const;
    const r1 = new RNG(21);
    const r2 = new RNG(21);
    for (let i = 0; i < 200; i++) {
      const p = r1.pick(items);
      expect(items).toContain(p);
      expect(p).toBe(r2.pick(items));
    }
  });

  it('chance(p) respects the extremes', () => {
    const r = new RNG(4);
    for (let i = 0; i < 500; i++) {
      expect(r.chance(0)).toBe(false);
      expect(r.chance(1)).toBe(true);
    }
  });
});

describe('hash', () => {
  it('is deterministic', () => {
    expect(hash(12345)).toBe(hash(12345));
  });

  it('returns unsigned 32-bit integers', () => {
    for (let n = 0; n < 1000; n++) {
      const h = hash(n);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('spreads small consecutive inputs (no collisions for 0..999)', () => {
    const out = new Set<number>();
    for (let n = 0; n < 1000; n++) out.add(hash(n));
    expect(out.size).toBe(1000);
  });
});

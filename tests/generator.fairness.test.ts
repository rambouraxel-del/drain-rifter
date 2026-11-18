import { describe, expect, it } from 'vitest';
import { TrackGenerator, validateLayout, computeCorridor, widthModelFor, usableHalf } from '../src/track/TrackGenerator';
import type { Interval } from '../src/track/TrackGenerator';
import { speedAt } from '../src/core/difficulty';
import { CONFIG } from '../src/core/config';
import { BIOME_ORDER, type ObstacleSpec, type SegmentPlan } from '../src/core/types';

const LEN = 20000;
const SEEDS = [1, 7, 42, 1234, 987654, 31337];
const R = CONFIG.player.radius;

function generate(seed: number, len = LEN) {
  const gen = new TrackGenerator(seed);
  const segs: SegmentPlan[] = [];
  const specs: ObstacleSpec[] = [];
  let s = 0;
  while (s < len) {
    const seg = gen.nextSegment(s);
    segs.push(seg);
    specs.push(...gen.obstaclesFor(seg));
    s = seg.s0 + seg.length;
  }
  return { gen, segs, specs };
}

describe('segment plan', () => {
  it('is contiguous, bounded, deterministic and biome-continuous', () => {
    const a = generate(5, 8000);
    const b = generate(5, 8000);
    expect(JSON.stringify(a.segs)).toBe(JSON.stringify(b.segs));
    expect(JSON.stringify(a.specs)).toBe(JSON.stringify(b.specs));
    let s = 0;
    a.segs.forEach((seg, i) => {
      expect(seg.index).toBe(i);
      expect(seg.s0).toBeCloseTo(s, 6);
      expect(seg.length).toBeGreaterThan(20);
      expect(seg.width).toBeGreaterThanOrEqual(CONFIG.track.minWidth);
      expect(seg.width).toBeLessThanOrEqual(CONFIG.track.maxWidth);
      expect(seg.pitch).toBeLessThan(0.4);
      s += seg.length;
      if (seg.toBiome) expect(a.segs[i + 1].biome).toBe(seg.toBiome);
      else if (a.segs[i + 1]) expect(a.segs[i + 1].biome).toBe(seg.biome);
    });
    expect(a.segs.slice(0, 6).map((x) => x.biome)).toContain('sewer');
    const first = [...new Set(a.segs.filter((x) => x.s0 < 3500).map((x) => x.biome))];
    expect(first).toEqual(BIOME_ORDER);
  });
  it('first 150 m are straight and obstacle free', () => {
    const { segs, specs } = generate(3, 2000);
    expect(segs[0].yawRate).toBe(0);
    expect(segs[0].length).toBeGreaterThanOrEqual(150);
    expect(specs.filter((o) => o.s < 150).length).toBe(0);
    expect(specs.length).toBeGreaterThan(5);
  });
  it('obstaclesFor is idempotent / order independent', () => {
    const { gen, segs } = generate(11, 3000);
    const x = gen.obstaclesFor(segs[10]);
    const y = gen.obstaclesFor(segs[10]);
    expect(x).toEqual(y);
  });
});

describe('layout fairness (reachable corridor)', () => {
  for (const seed of SEEDS) {
    it(`validateLayout ok for seed ${seed} over ${LEN} m`, () => {
      const { segs, specs } = generate(seed);
      const rep = validateLayout(specs, segs);
      expect(rep.violations.slice(0, 3)).toEqual([]);
      expect(rep.ok).toBe(true);
      expect(rep.minClearGap).toBeGreaterThanOrEqual(1.25);
      expect(specs.length).toBeGreaterThan(300);
      for (const o of specs) {
        expect(o.halfWidth).toBeGreaterThan(0.2);
        expect(o.depth).toBeGreaterThan(0.5);
        if (o.motion?.type === 'fall') expect(o.motion.triggerAhead).toBeGreaterThanOrEqual(speedAt(o.s) * 1.6);
      }
    });
  }
});

/* ---------- greedy bot with limited lateral speed and the real collider math ---------- */

function simulate(seed: number, len: number, vLat = 6.5) {
  const { segs, specs } = generate(seed, len + 400);
  const wm = widthModelFor(segs);
  const pieces = computeCorridor(specs, segs);
  const list = [...specs].sort((a, b) => a.s - b.s);
  // Backward pass: a lazy path P[j] in every piece, nearest reachable point to the next piece's point.
  const P: number[] = new Array(pieces.length);
  const nearest = (comps: Interval[], x: number, margin = 0.05): number => {
    let best = x, bd = Infinity;
    for (const c of comps) {
      const m = c.hi - c.lo > 2 * margin ? margin : 0;
      const cl = Math.min(c.hi - m, Math.max(c.lo + m, x));
      if (Math.abs(cl - x) < bd) { bd = Math.abs(cl - x); best = cl; }
    }
    return best;
  };
  let tail = 0;
  for (let j = pieces.length - 1; j >= 0; j--) { P[j] = nearest(pieces[j].R, tail); tail = P[j]; }
  const fallT = new Map<ObstacleSpec, number>();
  let s = 0, u = 0, t = 0, pi = 0, lo = 0;
  const dt = 0.01;
  while (s < len) {
    const v = speedAt(s);
    while (pi < pieces.length - 1 && pieces[pi].s1 < s) pi++;
    const target = P[pi];
    u += Math.max(-vLat * dt, Math.min(vLat * dt, target - u));
    const lim = usableHalf(wm.at(s));
    u = Math.max(-lim, Math.min(lim, u));
    s += v * dt;
    t += dt;
    // collisions (same math as ObstacleManager.hitTest)
    while (lo < list.length && list[lo].s < s - 15) lo++;
    for (let i = lo; i < list.length && list[i].s < s + 6; i++) {
      const o = list[i];
      let ou = o.u;
      const m = o.motion;
      if (m && (m.type === 'slide' || m.type === 'swing')) ou += Math.sin((t / (m.period ?? 2)) * Math.PI * 2 + (m.phase ?? 0)) * (m.amplitude ?? 2);
      if (m?.type === 'fall') {
        const trig = Math.min(m.triggerAhead ?? 50, 80);
        if (!fallT.has(o) && o.s - s < trig) fallT.set(o, t);
        const ft = fallT.get(o);
        if (ft === undefined || t - ft < 0.9 * 0.85) continue;
      }
      if (Math.abs(o.s - s) > o.depth / 2 + R + 0.5) continue;
      const c = { s0: o.s - o.depth / 2, s1: o.s + o.depth / 2, u0: ou - o.halfWidth, u1: ou + o.halfWidth };
      const ds = Math.max(c.s0 - s, 0, s - c.s1);
      const duu = Math.max(c.u0 - u, 0, u - c.u1);
      if (ds * ds + duu * duu < R * R) {
        return { dead: true, s, t, kind: o.kind, os: o.s, ou, u };
      }
    }
  }
  return { dead: false, s, t, kind: '', os: 0, ou: 0, u };
}

describe('bot survival (real collisions, moving obstacles, falling timing, 6.5 m/s vs 6 m/s planned)', () => {
  for (const seed of SEEDS) {
    it(`bot survives ${LEN} m on seed ${seed}`, () => {
      const r = simulate(seed, LEN);
      expect(JSON.stringify(r)).toContain(`"dead":false`);
    }, 120000);
  }
});

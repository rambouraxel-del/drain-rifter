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

function simulate(seed: number, len: number, vLat = 6, delay = 0.25) {
  const { segs, specs } = generate(seed, len + 400);
  const wm = widthModelFor(segs);
  const pieces = computeCorridor(specs, segs);
  const list = [...specs].sort((a, b) => a.s - b.s);
  const fallT = new Map<ObstacleSpec, number>();
  let s = 0, u = 0, t = 0, pi = 0, lo = 0;
  const dt = 0.01;
  let nextPlan = 0;
  let target = 0;
  const queue: { at: number; u: number }[] = [];
  let applied = 0;
  while (s < len) {
    const v = speedAt(s);
    // plan every 0.04 s
    if (t >= nextPlan) {
      nextPlan = t + 0.04;
      while (pi < pieces.length - 1 && pieces[pi].s1 < s) pi++;
      // forward reachable sets from u over the next 170 m
      let cur: Interval[] = [{ lo: u, hi: u }];
      const seq: Interval[][] = [];
      let sPrev = s;
      for (let j = pi; j < pieces.length && pieces[j].s0 < s + 170; j++) {
        const p = pieces[j];
        const a = Math.max(p.s0, s);
        const reach = vLat * Math.max(0, p.s1 - Math.max(sPrev, a)) / speedAt((a + p.s1) / 2);
        sPrev = p.s1;
        const nx: Interval[] = [];
        for (const c0 of p.F) {
          const m = c0.hi - c0.lo > 0.4 ? 0.1 : 0;
          const c = { lo: c0.lo + m, hi: c0.hi - m };
          let l = Infinity, h = -Infinity;
          for (const e of cur) {
            const ll = Math.max(e.lo - reach, c.lo), hh = Math.min(e.hi + reach, c.hi);
            if (ll <= hh) { l = Math.min(l, ll); h = Math.max(h, hh); }
          }
          if (l <= h) nx.push({ lo: l, hi: h });
        }
        cur = nx.length ? nx : cur;
        seq.push(cur);
      }
      // backtrack from the widest final component's centre
      if (seq.length) {
        const last = seq[seq.length - 1];
        const best = last.reduce((x, y) => (y.hi - y.lo > x.hi - x.lo ? y : x));
        const tg: number[] = new Array(seq.length);
        tg[seq.length - 1] = (best.lo + best.hi) / 2;
        for (let j = seq.length - 2; j >= 0; j--) {
          let bu = tg[j + 1], bd = Infinity;
          for (const c of seq[j]) {
            const cl = Math.min(c.hi, Math.max(c.lo, tg[j + 1]));
            if (Math.abs(cl - tg[j + 1]) < bd) { bd = Math.abs(cl - tg[j + 1]); bu = cl; }
          }
          tg[j] = bu;
        }
        // aim ~0.5 s ahead, clamped to the free component we are in now
        let jj = seq.length - 1;
        for (let j = 0; j < seq.length; j++) if (pieces[pi + j].s0 >= s + 0.5 * v) { jj = j; break; }
        for (let j = 0; j < jj; j++) if (pieces[pi + j].blocked) { jj = j; break; }
        const f0 = pieces[pi].F.map((c) => ({ lo: c.lo + (c.hi - c.lo > 0.4 ? 0.1 : 0), hi: c.hi - (c.hi - c.lo > 0.4 ? 0.1 : 0) }));
        const comp = f0.find((c) => u >= c.lo - 1e-6 && u <= c.hi + 1e-6) ?? f0.reduce((x, y) => (Math.abs((y.lo + y.hi) / 2 - u) < Math.abs((x.lo + x.hi) / 2 - u) ? y : x), f0[0]);
        target = comp ? Math.max(comp.lo, Math.min(comp.hi, tg[jj])) : tg[jj];
      }
      queue.push({ at: t + delay, u: target });
    }
    while (queue.length && queue[0].at <= t) applied = queue.shift()!.u;
    const du = Math.max(-vLat * dt, Math.min(vLat * dt, applied - u));
    u += du;
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
      if (ds * ds + duu * duu < R * R) return { dead: true, s, t, kind: o.kind, os: o.s, ou, u };
    }
  }
  return { dead: false, s, t, kind: '', os: 0, ou: 0, u };
}

describe('bot survival (real collisions, moving obstacles, 6 m/s, 0.25 s latency)', () => {
  for (const seed of SEEDS) {
    it(`bot survives ${LEN} m on seed ${seed}`, () => {
      const r = simulate(seed, LEN);
      expect(JSON.stringify(r)).toContain(`"dead":false`);
    }, 120000);
  }
});

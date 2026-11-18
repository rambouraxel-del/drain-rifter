import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../src/core/config';
import {
  Spine,
  makeFrame,
  profileHeight,
  profileSlope,
  surfacePoint,
  usableHalfWidth,
} from '../src/track/Spine';
import type { SpineFrame } from '../src/core/types';
import { FlatSource, StubSource } from './support/segments';

function dist(a: THREE.Vector3, b: THREE.Vector3): number {
  return a.distanceTo(b);
}

function expectOrthonormal(fr: SpineFrame): void {
  for (const v of [fr.fwd, fr.right, fr.up]) {
    expect(Math.abs(v.length() - 1)).toBeLessThan(1e-3);
  }
  expect(Math.abs(fr.fwd.dot(fr.right))).toBeLessThan(1e-3);
  expect(Math.abs(fr.fwd.dot(fr.up))).toBeLessThan(1e-3);
  expect(Math.abs(fr.right.dot(fr.up))).toBeLessThan(1e-3);
}

describe('Spine: continuity and frames', () => {
  it('consecutive frames 1 m apart are 1 m apart (no gaps, no jumps)', () => {
    const spine = new Spine(new StubSource({ seed: 3, yawRate: 0.05 }));
    spine.ensure(1600);
    const a = makeFrame();
    const b = makeFrame();
    let worst = 0;
    for (let s = 0; s < 1500; s++) {
      spine.frame(s, a);
      spine.frame(s + 1, b);
      worst = Math.max(worst, Math.abs(dist(a.pos, b.pos) - 1));
    }
    expect(worst).toBeLessThan(1e-4);
  });

  it('positions are Lipschitz with constant 1 at sub-metre resolution (no jumps)', () => {
    const spine = new Spine(new StubSource({ seed: 9, yawRate: 0.05, pitchRange: [0.05, 0.3] }));
    spine.ensure(400);
    const a = makeFrame();
    const b = makeFrame();
    let worst = 0;
    for (let s = 0; s < 300; s += 0.1) {
      spine.frame(s, a);
      spine.frame(s + 0.1, b);
      worst = Math.max(worst, dist(a.pos, b.pos) - 0.1);
    }
    expect(worst).toBeLessThan(1e-6);
  });

  it('fwd / right / up are unit and mutually perpendicular within 1e-3', () => {
    const spine = new Spine(new StubSource({ seed: 5, yawRate: 0.04 }));
    spine.ensure(1200);
    const fr = makeFrame();
    for (let s = 0; s < 1000; s += 0.37) {
      spine.frame(s, fr);
      expectOrthonormal(fr);
    }
  });

  it('up vector points above a level-pitched floor', () => {
    const spine = new Spine(new FlatSource(9, 0.1));
    spine.ensure(300);
    const fr = makeFrame();
    spine.frame(200, fr);
    expect(fr.up.y).toBeGreaterThan(0.9);
    expect(fr.right.y).toBeLessThan(1e-3);
  });

  it('forward vector points down the slope for positive pitch', () => {
    const spine = new Spine(new FlatSource(9, 0.2));
    spine.ensure(300);
    const fr = makeFrame();
    spine.frame(200, fr);
    expect(fr.fwd.y).toBeLessThan(0);
  });

  it('Spine.forward returns unit vectors', () => {
    const out = new THREE.Vector3();
    for (const yaw of [-3, -1, 0, 0.5, 2.7]) {
      for (const pitch of [-0.3, 0, 0.1, 0.4]) {
        expect(Spine.forward(yaw, pitch, out).length()).toBeCloseTo(1, 9);
      }
    }
  });
});

describe('Spine: ensure() / trim()', () => {
  it('ensure(s) generates samples up to at least s without overshooting by more than one step', () => {
    const spine = new Spine(new StubSource());
    spine.ensure(500);
    expect(spine.end).toBeGreaterThanOrEqual(500);
    expect(spine.end - 500).toBeLessThan(spine.step + 1e-9);
  });

  it('frames ahead of the player stay valid after ensure()', () => {
    const spine = new Spine(new StubSource({ seed: 11 }));
    spine.ensure(800);
    const fr = makeFrame();
    for (let s = 0; s <= 800; s += 13.7) {
      spine.frame(s, fr);
      expectOrthonormal(fr);
      expect(Number.isFinite(fr.pos.x + fr.pos.y + fr.pos.z)).toBe(true);
    }
  });

  it('trim(s) drops samples behind s but keeps frames at and ahead of s unchanged', () => {
    const spine = new Spine(new StubSource({ seed: 2 }));
    spine.ensure(800);
    const before = makeFrame();
    spine.frame(400, before);
    const endBefore = spine.end;

    spine.trim(400);

    expect(spine.start).toBeLessThanOrEqual(400);
    expect(spine.start).toBeGreaterThan(398);
    expect(spine.end).toBe(endBefore);

    const after = makeFrame();
    spine.frame(400, after);
    expect(dist(before.pos, after.pos)).toBeLessThan(1e-9);
    expectOrthonormal(after);
  });

  it('ensure() after trim() keeps extending the spine with valid frames', () => {
    const spine = new Spine(new StubSource({ seed: 4 }));
    spine.ensure(400);
    spine.trim(350);
    spine.ensure(1000);
    expect(spine.end).toBeGreaterThanOrEqual(1000);
    const fr = makeFrame();
    spine.frame(999.5, fr);
    expectOrthonormal(fr);
  });

  it('frame() outside the generated range clamps without producing NaN', () => {
    const spine = new Spine(new StubSource());
    spine.ensure(200);
    const fr = makeFrame();
    for (const s of [-50, 0, 1e5]) {
      spine.frame(s, fr);
      const vals = [fr.pos.x, fr.pos.y, fr.pos.z, fr.fwd.x, fr.fwd.y, fr.fwd.z, fr.width];
      expect(vals.every(Number.isFinite)).toBe(true);
    }
  });

  it('segmentAt() returns the plan covering the given distance', () => {
    const spine = new Spine(new StubSource({ seed: 6, lengthRange: [30, 30] }));
    spine.ensure(200);
    const seg = spine.segmentAt(95);
    expect(seg.s0).toBeLessThanOrEqual(95);
    expect(seg.s0 + seg.length).toBeGreaterThan(95);
  });
});

describe('Half-pipe profile', () => {
  const widths = [CONFIG.track.minWidth, CONFIG.track.defaultWidth, CONFIG.track.maxWidth];
  const flatOf = (w: number) => (w / 2) * CONFIG.track.flatFraction;

  it('profileHeight is 0 on the flat floor (|u| <= flat)', () => {
    for (const w of widths) {
      const flat = flatOf(w);
      for (let i = -20; i <= 20; i++) {
        const u = (flat * i) / 20;
        expect(profileHeight(u, w)).toBe(0);
      }
    }
  });

  it('profileHeight is symmetric: h(u) === h(-u)', () => {
    for (const w of widths) {
      for (let u = 0; u <= w; u += 0.05) {
        expect(profileHeight(-u, w)).toBe(profileHeight(u, w));
      }
    }
  });

  it('profileHeight is finite, non-negative and monotonically increasing towards the walls', () => {
    for (const w of widths) {
      let prev = -Infinity;
      for (let u = 0; u <= w * 0.75; u += 0.02) {
        const h = profileHeight(u, w);
        expect(Number.isFinite(h)).toBe(true);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeGreaterThanOrEqual(prev - 1e-12);
        prev = h;
      }
      expect(profileHeight(w * 0.75, w)).toBeGreaterThan(0);
    }
  });

  it('profileHeight is continuous at the edge of the flat floor', () => {
    for (const w of widths) {
      const flat = flatOf(w);
      expect(profileHeight(flat + 1e-6, w)).toBeLessThan(1e-4);
    }
  });

  it('profileSlope is 0 on the flat floor and has the sign of u on the walls', () => {
    for (const w of widths) {
      const flat = flatOf(w);
      expect(profileSlope(0, w)).toBe(0);
      expect(profileSlope(flat * 0.9, w)).toBe(0);
      expect(profileSlope(-flat * 0.9, w)).toBe(0);
      const uR = flat + (w / 2 - flat) * 0.5;
      expect(profileSlope(uR, w)).toBeGreaterThan(0);
      expect(profileSlope(-uR, w)).toBeLessThan(0);
      expect(profileSlope(-uR, w)).toBeCloseTo(-profileSlope(uR, w), 12);
    }
  });

  it('profileSlope matches the numerical derivative of profileHeight on the curved wall', () => {
    for (const w of widths) {
      const flat = flatOf(w);
      const r = w / 2 - flat;
      for (const frac of [0.2, 0.5, 0.8]) {
        const u = flat + r * frac;
        const eps = 1e-6;
        const numeric = (profileHeight(u + eps, w) - profileHeight(u - eps, w)) / (2 * eps);
        expect(profileSlope(u, w)).toBeCloseTo(numeric, 3);
      }
    }
  });

  it('usableHalfWidth is strictly less than half the width and follows usableFraction', () => {
    for (const w of [CONFIG.track.minWidth, 8, 9, 11, CONFIG.track.maxWidth]) {
      const lim = usableHalfWidth(w);
      expect(lim).toBeGreaterThan(0);
      expect(lim).toBeLessThan(w / 2);
      expect(lim).toBeCloseTo((w / 2) * CONFIG.track.usableFraction, 12);
    }
  });

  it('surfacePoint(s, u) equals frame.pos + right * u + up * profileHeight(u)', () => {
    const spine = new Spine(new StubSource({ seed: 8, yawRate: 0.03 }));
    spine.ensure(500);
    const out = new THREE.Vector3();
    const fr = makeFrame();
    for (const s of [10, 123.4, 400]) {
      for (const u of [-3, -0.5, 0, 1.7, 4]) {
        surfacePoint(spine, s, u, out);
        spine.frame(s, fr);
        const h = profileHeight(u, fr.width);
        const expected = fr.pos.clone().addScaledVector(fr.right, u).addScaledVector(fr.up, h);
        expect(out.distanceTo(expected)).toBeLessThan(1e-9);
      }
    }
  });

  it('surfacePoint at u = 0 is exactly the spine position', () => {
    const spine = new Spine(new StubSource({ seed: 12 }));
    spine.ensure(300);
    const out = new THREE.Vector3();
    const fr = makeFrame();
    surfacePoint(spine, 150, 0, out);
    spine.frame(150, fr);
    expect(out.distanceTo(fr.pos)).toBeLessThan(1e-9);
  });
});

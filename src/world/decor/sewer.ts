import * as THREE from 'three';
import { profileHeight } from '../../track/Spine';
import type { Ctx } from './ctx';
import { at, cable, cageLamp, forSlots, loopStrip, motes, slotRand, vine, wallLine } from './common';
import { box, bar, C, Cs, hash1, prism, ring } from './kit';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ID = 'sewer' as const;
const WARM = 0xffb25a;

/** Sewer: concrete tube, joints, caged lamps on cables, rusty pipes, outlets, grates with light shafts, graffiti. */
export function decorSewer(ctx: Ctx, a: number, b: number): void {
  const kit = ctx.kit;
  const q = ctx.q;
  const o = [0, 0];

  // concrete ring joints
  forSlots(a, b, 6, 0, (s, i) => {
    if (!ctx.owns(ID, s, i * 5 + 1)) return;
    loopStrip(ctx, s, 0.17, 0.09, C(0x3d403c), 0, 1, q === 0 ? 5 : 9, 0.1);
  });

  // caged lamps on alternating walls
  forSlots(a, b, 12, 3, (s, i) => {
    if (!ctx.owns(ID, s, i * 5 + 2)) return;
    const side = i & 1 ? 1 : -1;
    const wp = ctx.wallPt(s, side, 0.42);
    cageLamp(ctx, wp, WARM, 3.4, 9);
    if (!kit.pre) {
      // reflection streak on the water
      const fl = ctx.frame(s);
      void fl;
      const u = side * 0.6;
      const p0 = ctx.rel(s - 1.8, u, 0.03), p1 = ctx.rel(s + 0.4, u - side * 0.0, 0.03), p2 = ctx.rel(s + 2.6, u, 0.03);
      const w = ctx.frame(s).right;
      const dw = V().copy(w).multiplyScalar(0.45);
      const hot = Cs(0xff9a40, 0.32), black = Cs(0x000000, 0);
      kit.add.quadV(p0.clone().sub(dw), p0.clone().add(dw), p1.clone().add(dw), p1.clone().sub(dw), black, black, hot, hot);
      kit.add.quadV(p1.clone().sub(dw), p1.clone().add(dw), p2.clone().add(dw), p2.clone().sub(dw), hot, hot, black, black);
    }
  });

  // cable running along the left wall
  forSlots(a, b, 6, 0, (s, i) => {
    if (!ctx.owns(ID, s, i * 5 + 3)) return;
    const p = ctx.wallPt(s, -1, 0.5), n = ctx.wallPt(s + 6, -1, 0.5);
    cable(ctx, p.pos.clone().addScaledVector(p.n, 0.08), n.pos.clone().addScaledVector(n.n, 0.08), 0.14, C(0x181716), 3);
  });

  // big rusty pipes in 96 m runs
  forSlots(a, b, 3, 0, (s, i) => {
    const sec = Math.floor(s / 96);
    if (!ctx.owns(ID, s, sec * 5 + 4)) return;
    if (hash1(sec * 7 + 1) < 0.3) return;
    const side = hash1(sec * 7 + 2) > 0.5 ? 1 : -1;
    const tau = 0.64 + 0.04 * hash1(sec * 7 + 3);
    const p0 = ctx.wallPt(s, side, tau), p1 = ctx.wallPt(s + 3, side, tau);
    const R = 0.55;
    const c0 = p0.pos.clone().addScaledVector(p0.n, R * 0.95), c1 = p1.pos.clone().addScaledVector(p1.n, R * 0.95);
    prism(kit.lit, c0, c1, R, R, 8, C(0x6a3a2a), false, undefined, 0.2);
    const first = Math.floor((s - 3) / 96) !== sec, last = Math.floor((s + 3) / 96) !== sec;
    if (i % 4 === 0 || first || last) {
      const d = V().subVectors(c1, c0).normalize();
      prism(kit.lit, c0.clone().addScaledVector(d, -0.1), c0.clone().addScaledVector(d, 0.3), R * 1.3, R * 1.3, 8, C(0x4a2c24), true, undefined, 0.2);
    }
    if (i % 2 === 0) {
      // wall bracket
      const br = p0.pos.clone().addScaledVector(p0.n, R * 0.5);
      box(kit.lit, br, V().copy(p0.f).multiplyScalar(0.12), V().copy(p0.w).multiplyScalar(0.7), V().copy(p0.n).multiplyScalar(0.5), C(0x2d2a28));
    }
  });

  // pipe outlets pouring water
  forSlots(a, b, 84, 30, (s, i) => {
    if (!ctx.owns(ID, s, i * 5 + 5)) return;
    if (hash1(i * 17 + 5) < 0.35) return;
    const side = hash1(i * 17 + 6) > 0.5 ? 1 : -1;
    const wp = ctx.wallPt(s, side, 0.3);
    const mouth = wp.pos.clone().addScaledVector(wp.n, 1.05);
    prism(kit.lit, wp.pos.clone().addScaledVector(wp.n, -0.2), mouth, 0.62, 0.62, 8, C(0x74402c), true, undefined, 0.2);
    prism(kit.lit, mouth.clone().addScaledVector(wp.n, -0.45), mouth.clone().addScaledVector(wp.n, 0.02), 0.75, 0.75, 8, C(0x5a3426), false, undefined, 0.2);
    prism(kit.glow, mouth.clone().addScaledVector(wp.n, -0.05), mouth.clone().addScaledVector(wp.n, 0.0), 0.5, 0.5, 8, C(0x0a1214));
    // falling water: vertical sheet down to the floor
    ctx.uh(s, 0.3, side, o);
    const uMouth = o[0] - side * 1.05 * 0.88;
    const fl = ctx.frame(s);
    const bottom = ctx.rel(s, uMouth, profileHeight(uMouth, fl.width) + 0.05);
    const top = mouth.clone().add(V(0, -0.5, 0));
    const f = V().copy(wp.f).multiplyScalar(0.6);
    const hi = Cs(0x9fd8e0, 0.55), lo = Cs(0x5aa0a8, 0.25);
    kit.add.quadV(top.clone().sub(f), top.clone().add(f), bottom.clone().add(f), bottom.clone().sub(f), hi, hi, lo, lo);
    const f2 = V().copy(wp.f).multiplyScalar(0.3);
    kit.add.quadV(top.clone().sub(f2), top.clone().add(f2), bottom.clone().add(f2).addScaledVector(wp.n, 0.15), bottom.clone().sub(f2).addScaledVector(wp.n, 0.15), Cs(0xffffff, 0.35), Cs(0xffffff, 0.35), lo, lo);
    kit.sprite(bottom.clone().add(V(0, 0.4, 0)), 0xcfeeff, 2.2, 0.55);
    kit.sprite(mouth.clone().add(V(0, -0.4, 0)), 0xcfeeff, 1.0, 0.4);
  });

  // ceiling grates with light shafts
  forSlots(a, b, 70, 40, (s, i) => {
    if (!ctx.owns(ID, s, i * 5 + 6)) return;
    if (hash1(i * 19 + 3) < 0.35) return;
    ctx.uh(s, 1, 1, o);
    const fl = ctx.frame(s);
    const center = ctx.rel(s, 0, o[1] - 0.3);
    const R = 1.35;
    const ex = V().copy(fl.right), ez = V().copy(fl.fwd);
    // bright opening
    const rim = center.clone();
    const n = 10;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      const p0 = rim.clone().addScaledVector(ex, Math.cos(a0) * R).addScaledVector(ez, Math.sin(a0) * R * 1.4);
      const p1 = rim.clone().addScaledVector(ex, Math.cos(a1) * R).addScaledVector(ez, Math.sin(a1) * R * 1.4);
      kit.glow.tri(rim, p0, p1, Cs(0xa8d4f4, 0.85));
    }
    ring(kit.lit, rim, ex, ez, V().copy(fl.up), R * 1.12, 0.14, 0.12, 10, C(0x3a3b38), 0, Math.PI * 2);
    for (let k = -1; k <= 1; k++) {
      bar(kit.lit, rim.clone().addScaledVector(ex, k * 0.55).addScaledVector(ez, -R * 1.4), rim.clone().addScaledVector(ex, k * 0.55).addScaledVector(ez, R * 1.4), 0.045, C(0x222421), 4);
    }
    bar(kit.lit, rim.clone().addScaledVector(ez, 0), rim.clone().addScaledVector(ex, R), 0.04, C(0x222421), 4);
    bar(kit.lit, rim.clone().addScaledVector(ez, 0), rim.clone().addScaledVector(ex, -R), 0.04, C(0x222421), 4);
    for (let k = 0; k < 4; k++) {
      const ang = (k / 4) * Math.PI * 2 + 0.6;
      vine(ctx, rim.clone().addScaledVector(ex, Math.cos(ang) * R * 1.05).addScaledVector(ez, Math.sin(ang) * R * 1.4), 1.6 + hash1(i * 13 + k) * 1.2, i * 7 + k, 0, 0x3c7a30);
    }
    // light shaft
    const floor = ctx.rel(s + 0.6, 0.4, 0.0);
    const top = rim.clone().add(V(0, -0.1, 0));
    prism(kit.add, top, floor, R * 1.05, R * 2.1, q === 0 ? 7 : 10, Cs(0x5f86a8, 0.34), false, Cs(0x1a2a3a, 0.05));
    kit.sprite(floor.clone().add(V(0, 0.2, 0)), 0xbfe0ff, 5, 0.35);
    kit.emit(floor.clone().add(V(0, 0.5, 0)), 0x9fd0ff, 6.5, 0.8);
    for (let k = 0; k < 5 - (q === 0 ? 3 : 0); k++) {
      const t = hash1(i * 29 + k * 3), ang = hash1(i * 29 + k * 3 + 1) * 6.28;
      const pp = V().lerpVectors(top, floor, 0.2 + t * 0.7);
      pp.addScaledVector(ex, Math.cos(ang) * R * (0.5 + t)).addScaledVector(ez, Math.sin(ang) * R * (0.5 + t));
      kit.sprite(pp, 0xd8ecff, 0.16, 0.8);
    }
  });

  // faint graffiti
  forSlots(a, b, 50, 17, (s, i) => {
    if (!ctx.owns(ID, s, i * 5 + 7)) return;
    if (hash1(i * 23 + 1) < 0.45) return;
    const side = hash1(i * 23 + 2) > 0.5 ? 1 : -1;
    const wp = ctx.wallPt(s, side, 0.2 + hash1(i * 23 + 3) * 0.12);
    const col = Cs(0xd0d8cc, 0.55);
    const L = (f0: number, w0: number, f1: number, w1: number, w = 0.1) => wallLine(kit.lit, wp, f0, w0, f1, w1, w, 0.04, col);
    const kind = Math.floor(hash1(i * 23 + 4) * 3);
    if (kind === 0) {
      L(-0.6, -0.6, 0.6, 0.6, 0.14); L(-0.6, 0.6, 0.6, -0.6, 0.14);
      for (let k = 0; k < 8; k++) {
        const a0 = (k / 8) * 6.283, a1 = ((k + 1) / 8) * 6.283;
        L(Math.cos(a0) * 1.0, Math.sin(a0) * 1.0, Math.cos(a1) * 1.0, Math.sin(a1) * 1.0, 0.08);
      }
    } else if (kind === 1) {
      const pts = [[-0.7, -0.4], [-0.7, 0.25], [-0.35, -0.05], [0, 0.4], [0.35, -0.05], [0.7, 0.25], [0.7, -0.4], [-0.7, -0.4]];
      for (let k = 0; k < pts.length - 1; k++) L(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], 0.12);
      L(-0.2, 0.75, 0.2, 0.75, 0.08);
    } else {
      for (let k = 0; k < 8; k++) {
        const a0 = (k / 8) * 6.283, a1 = ((k + 1) / 8) * 6.283;
        L(Math.cos(a0) * 0.7, Math.sin(a0) * 0.7 + 0.2, Math.cos(a1) * 0.7, Math.sin(a1) * 0.7 + 0.2, 0.1);
      }
      L(-0.35, 0.1, -0.12, 0.34, 0.09); L(-0.12, 0.1, -0.35, 0.34, 0.09);
      L(0.12, 0.1, 0.35, 0.34, 0.09); L(0.35, 0.1, 0.12, 0.34, 0.09);
      L(-0.3, -0.35, 0.3, -0.35, 0.09);
    }
    void at;
  });

  // dust motes in the lamp light
  if (ctx.owns(ID, (a + b) / 2, 99)) motes(ctx, a, b, [4, 8, 12][q], 0xffdca0, 0.13, 3.2, 1.2, 6, Math.floor(a));
}

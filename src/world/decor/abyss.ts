import * as THREE from 'three';
import type { Ctx } from './ctx';
import { forSlots, motes } from './common';
import { crystal } from './cavern';
import { box, C, Cs, hash1, hash2, prism, ring, rock } from './kit';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ID = 'abyss' as const;
const UP = V(0, 1, 0);
const DOWN = V(0, -1, 0);
const GEM = [0xb070ff, 0xff62c4, 0x6a8cff, 0xb070ff, 0x50e0ff];

/** Lateral extent (|u|) of the abyss void at spine height h (so floating things stay inside the funnel). */
function umaxAt(ctx: Ctx, s: number, h: number): number {
  const o = [0, 0];
  let pu = 0, ph = 0;
  for (let k = 1; k <= 12; k++) {
    ctx.uh(s, k / 12, 1, o);
    if (o[1] >= h) {
      const t = (h - ph) / Math.max(0.01, o[1] - ph);
      return pu + (Math.abs(o[0]) - pu) * Math.min(1, Math.max(0, t));
    }
    pu = Math.abs(o[0]); ph = o[1];
  }
  return pu;
}

/** Abyss: floating rocks and islands, impossible rings and stairs, giant crystals, glowing motes and mist. */
export function decorAbyss(ctx: Ctx, a: number, b: number): void {
  const kit = ctx.kit;
  const q = ctx.q;
  const rockC = C(0x5c4c80), rockTop = C(0x8a76b4), stone = C(0x4a3c6c);

  // floating rocks
  forSlots(a, b, 4.5, 0, (s, i) => {
    if (!ctx.owns(ID, s, i * 5 + 41)) return;
    const cnt = [1, 1, 2][q];
    for (let k = 0; k < cnt; k++) {
      const r1 = hash2(i, k * 7 + 1), r2 = hash2(i, k * 7 + 2), r3 = hash2(i, k * 7 + 3), r4 = hash2(i, k * 7 + 4);
      const size = 0.9 + r1 * r1 * 6.5;
      const h = 6 + r2 * 34;
      const um = umaxAt(ctx, s, h) * 0.86 - size * 1.2;
      if (um < 8) continue;
      const side = r3 > 0.5 ? 1 : -1;
      const u = side * (7.5 + size + r4 * (um - 7.5 - size));
      const c = ctx.rel(s + r4 * 4, u, h);
      rock(kit.lit, c, V(size * 1.1, 0, 0), V(0, size * 0.55, 0), V(0, 0, size * 1.1), rockC, i * 5 + k, 0.35, rockTop);
      prism(kit.lit, c.clone().addScaledVector(UP, -size * 0.3), c.clone().addScaledVector(DOWN, size * (0.9 + r1)), size * 0.75, 0, 5, rockC, false, C(0x2a2048), i);
      if (size > 2.2 && r2 > 0.3) {
        const hex = GEM[Math.floor(r3 * GEM.length)];
        const top = c.clone().addScaledVector(UP, size * 0.4);
        crystal(ctx, top, V(0.15, 1, 0.1).normalize(), size * 1.3, size * 0.16, hex);
        crystal(ctx, top.clone().add(V(size * 0.4, -size * 0.05, size * 0.2)), V(0.5, 1, 0.1).normalize(), size * 0.8, size * 0.1, hex);
        kit.sprite(top.clone().addScaledVector(UP, size * 0.5), hex, size * 3.2, 0.45);
        kit.emit(c, hex, size * 3 + 6, 0.5);
      } else if (size > 1.2) {
        kit.sprite(c.clone().addScaledVector(UP, size * 0.5), GEM[Math.floor(r3 * GEM.length)], size * 2.2, 0.4);
      }
    }
  });

  // impossible rings (the track passes through them)
  forSlots(a, b, 36, 10, (s, i) => {
    if (!ctx.owns(ID, s, i * 5 + 42)) return;
    if (hash1(i * 13 + 1) < 0.25) return;
    const R = [8, 11, 15, 20][Math.floor(hash1(i * 13 + 2) * 4)];
    const fl = ctx.frame(s);
    const c = ctx.rel(s, 0, R + 5.8);
    const phi = (hash1(i * 13 + 3) - 0.5) * 0.5;
    const ex = V().copy(fl.right).multiplyScalar(Math.cos(phi)).addScaledVector(fl.up, Math.sin(phi));
    const ey = V().copy(fl.up).multiplyScalar(Math.cos(phi)).addScaledVector(fl.right, -Math.sin(phi));
    const ez = V().copy(fl.fwd);
    const broken = hash1(i * 13 + 4) > 0.55;
    const a0 = broken ? hash1(i * 13 + 5) * 6.28 : 0;
    const a1 = a0 + (broken ? Math.PI * 1.45 : Math.PI * 2);
    const segs = q === 0 ? 14 : q === 1 ? 20 : 28;
    ring(kit.lit, c, ex, ey, ez, R, 0.8, 1.0, segs, stone, a0, a1, C(0x3a2e5a));
    const hex = GEM[Math.floor(hash1(i * 13 + 6) * 3) + 0] === 0xb070ff ? 0xffa860 : 0xff7ac8;
    ring(kit.glow, c, ex, ey, ez, R - 0.82, 0.07, 0.6, segs, Cs(hex, 1.1), a0, a1);
    // keystone glow + rune bits
    const kp = c.clone().addScaledVector(ey, R + 0.9);
    kit.sprite(kp, hex, R * 0.5, 0.5);
    for (let k = 0; k < 3; k++) {
      const ang = a0 + (a1 - a0) * (0.15 + 0.3 * k + hash2(i, k) * 0.1);
      const pp = c.clone().addScaledVector(ex, Math.cos(ang) * (R + 0.2)).addScaledVector(ey, Math.sin(ang) * (R + 0.2));
      box(kit.glow, pp, V().copy(ex).multiplyScalar(0.12), V().copy(ey).multiplyScalar(0.5), V().copy(ez).multiplyScalar(1.05), Cs(hex, 0.8));
    }
    // broken pieces drifting nearby
    for (let k = 0; k < 3; k++) {
      const ang = a1 + 0.4 + k * 0.5;
      const rr = R - 1.6 - k * 1.3;
      const pp = c.clone().addScaledVector(ex, Math.cos(ang) * rr).addScaledVector(ey, Math.sin(ang) * rr).addScaledVector(ez, (k - 1) * 3);
      rock(kit.lit, pp, V(1.1, 0, 0), V(0, 0.6, 0), V(0, 0, 0.9), stone, i * 3 + k, 0.35);
    }
    kit.emit(c.clone().addScaledVector(ey, -R * 0.5), hex, R * 1.4, 0.5);
  });

  // floating islands with ruins
  forSlots(a, b, 64, 30, (s, i) => {
    if (!ctx.owns(ID, s, i * 5 + 43)) return;
    if (hash1(i * 17 + 1) < 0.3) return;
    const side = hash1(i * 17 + 2) > 0.5 ? 1 : -1;
    const h = 11 + hash1(i * 17 + 3) * 14;
    const um = umaxAt(ctx, s, h) * 0.85;
    const size = 5 + hash1(i * 17 + 4) * 3;
    if (um < 14 + size) return;
    const c = ctx.rel(s, side * (10 + size + hash1(i * 17 + 5) * Math.max(0, um - 10 - size * 2)), h);
    rock(kit.lit, c, V(size, 0, 0), V(0, size * 0.28, 0), V(0, 0, size * 0.9), rockC, i * 3, 0.15, rockTop);
    prism(kit.lit, c.clone().addScaledVector(UP, -size * 0.1), c.clone().addScaledVector(DOWN, size * 1.1), size * 0.8, 0, 6, rockC, false, C(0x2a2048));
    prism(kit.lit, c.clone().add(V(size * 0.35, -size * 0.1, 0)), c.clone().add(V(size * 0.5, -size * 0.8, 0.3)), size * 0.3, 0, 5, rockC, false, C(0x2a2048));
    const top = c.clone().addScaledVector(UP, size * 0.28);
    for (let k = 0; k < 3; k++) {
      const p = top.clone().add(V((k - 1) * 2.2, 0, (hash2(i, k) - 0.5) * 2.5));
      prism(kit.lit, p, p.clone().addScaledVector(UP, 3 + hash2(i, k + 5) * 3), 0.5, 0.45, 7, C(0x7a6aa0), false, undefined, 0.3);
    }
    ring(kit.lit, top.clone().add(V(0, 3.2, 0)), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 2.2, 0.35, 0.6, 8, C(0x7a6aa0), 0, Math.PI * 0.85, C(0x5a4a80));
    const hex = GEM[Math.floor(hash1(i * 17 + 6) * GEM.length)];
    crystal(ctx, top.clone().add(V(-size * 0.45, 0, 0.5)), V(-0.2, 1, 0.1).normalize(), 3.4, 0.55, hex);
    kit.sprite(top.clone().add(V(0, 2.5, 0)), hex, 9, 0.4);
    kit.emit(c, hex, 16, 0.5);
    // cascade of light particles falling off the island
    const tip = c.clone().addScaledVector(DOWN, size * 1.0);
    kit.add.quadV(tip.clone().add(V(-0.35, 0, 0)), tip.clone().add(V(0.35, 0, 0)), tip.clone().add(V(0.5, -16, 0)), tip.clone().add(V(-0.5, -16, 0)), Cs(hex, 0.3), Cs(hex, 0.3), Cs(hex, 0), Cs(hex, 0));
  });

  // suspended stairway
  forSlots(a, b, 90, 70, (s, i) => {
    if (!ctx.owns(ID, s, i * 5 + 44)) return;
    if (hash1(i * 19 + 1) < 0.45) return;
    const side = hash1(i * 19 + 2) > 0.5 ? 1 : -1;
    const h0 = 7 + hash1(i * 19 + 3) * 4;
    const um = umaxAt(ctx, s, h0 + 8) * 0.8;
    if (um < 17) return;
    const fl = ctx.frame(s);
    const cen = ctx.rel(s, side * 11.5, h0);
    const N = 14;
    for (let k = 0; k < N; k++) {
      const ang = k * 0.24;
      const p = cen.clone().addScaledVector(fl.right, Math.cos(ang) * 5 * side - 5 * side).addScaledVector(fl.fwd, Math.sin(ang) * 5).addScaledVector(fl.up, k * 0.8);
      const along = V().copy(fl.fwd).multiplyScalar(Math.cos(ang)).addScaledVector(fl.right, -side * Math.sin(ang));
      const rad = V().copy(fl.right).multiplyScalar(Math.cos(ang) * side).addScaledVector(fl.fwd, Math.sin(ang));
      box(kit.lit, p, V().copy(rad).multiplyScalar(1.1), V(0, 0.18, 0), V().copy(along).multiplyScalar(0.7), k & 1 ? C(0x6a5a90) : C(0x5a4a80));
      if ((k & 3) === 0) box(kit.glow, p.clone().addScaledVector(rad, 1.1).addScaledVector(fl.up, 0.2), V().copy(along).multiplyScalar(0.7), V(0, 0.05, 0), V().copy(rad).multiplyScalar(0.05), Cs(0xff9a60, 0.9));
    }
  });

  // giant crystals growing out of the walls
  forSlots(a, b, 14, 3, (s, i) => {
    if (!ctx.owns(ID, s, i * 5 + 45)) return;
    if (hash1(i * 23 + 1) < 0.3) return;
    const side = hash1(i * 23 + 2) > 0.5 ? 1 : -1;
    const wp = ctx.wallPt(s, side, 0.26 + hash1(i * 23 + 3) * 0.3);
    const hex = GEM[Math.floor(hash1(i * 23 + 4) * GEM.length)];
    const n = 2 + Math.floor(hash1(i * 23 + 5) * 2.5);
    for (let k = 0; k < n; k++) {
      const r1 = hash2(i, k * 3 + 1), r2 = hash2(i, k * 3 + 2), r3 = hash2(i, k * 3 + 3);
      const dir = V().addScaledVector(wp.n, 0.6).addScaledVector(UP, 0.65).addScaledVector(wp.f, (r1 - 0.5) * 0.8).normalize();
      const len = (k === 0 ? 8 : 3.5) + r3 * (k === 0 ? 7 : 4);
      crystal(ctx, wp.pos.clone().addScaledVector(wp.n, -0.5).addScaledVector(wp.f, (r2 - 0.5) * 5), dir, len, len * 0.13, hex);
    }
    const c = wp.pos.clone().addScaledVector(wp.n, 3).addScaledVector(UP, 3);
    kit.sprite(c, hex, 10, 0.5);
    kit.emit(c, hex, 16, 0.8);
  });

  // glowing particle-like geometry (little octahedra) + drifting light sprites + mist banks
  const cnt = [8, 14, 22][q];
  for (let k = 0; k < cnt; k++) {
    const s = a + hash2(Math.floor(a), k * 5) * (b - a);
    const side = hash2(Math.floor(a), k * 5 + 1) > 0.5 ? 1 : -1;
    const h = 3 + hash2(Math.floor(a), k * 5 + 2) * 28;
    const um = Math.min(umaxAt(ctx, s, h) * 0.8, 22);
    if (!ctx.owns(ID, s, k + 77)) continue;
    if (um < 8) continue;
    const u = side * (6.5 + hash2(Math.floor(a), k * 5 + 3) * (um - 6.5));
    const p = ctx.rel(s, u, h);
    const hex = GEM[Math.floor(hash2(Math.floor(a), k * 5 + 4) * GEM.length)];
    const sz = 0.1 + hash2(Math.floor(a), k * 5 + 4) * 0.25;
    prism(kit.glow, p.clone().addScaledVector(UP, -sz), p.clone().addScaledVector(UP, sz), sz * 0.7, 0, 4, Cs(hex, 1.0), false, Cs(hex, 0.6));
    prism(kit.glow, p.clone().addScaledVector(UP, sz), p.clone().addScaledVector(UP, -sz), sz * 0.7, 0, 4, Cs(hex, 1.0), false, Cs(hex, 0.6));
    kit.sprite(p, hex, sz * 9, 0.6);
  }
  if (ctx.owns(ID, (a + b) / 2, 95)) {
    motes(ctx, a, b, [10, 18, 30][q], 0xe0b8ff, 0.18, 12, 1.5, 22, Math.floor(a) + 17);
    for (let k = 0; k < [2, 3, 3][q]; k++) {
      const s = a + hash2(Math.floor(a), k + 300) * (b - a);
      const side = hash2(Math.floor(a), k + 310) > 0.5 ? 1 : -1;
      kit.sprite(ctx.rel(s, side * (8 + hash2(Math.floor(a), k + 320) * 10), 3 + hash2(Math.floor(a), k + 330) * 5), 0x8a50d0, 18, 0.22);
    }
  }
}

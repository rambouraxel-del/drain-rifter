import * as THREE from 'three';
import type { Ctx } from './ctx';
import { at, cageLamp, forSlots, motes, vine } from './common';
import { bar, box, C, Cs, hash1, hash2, prism, rock } from './kit';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ID = 'cavern' as const;
const CRYSTAL = [0x30e6e0, 0x30e6e0, 0x4a90ff, 0xb060ff, 0x30e6e0];
const DOWN = V(0, -1, 0);
const UP = V(0, 1, 0);

/** Glowing crystal: hex body with a pointed tip, vertex-colour gradient (dark base -> bright tip). */
export function crystal(ctx: Ctx, base: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, hex: number, sides = 6): void {
  const kit = ctx.kit;
  const mid = base.clone().addScaledVector(dir, len * 0.62);
  const tip = base.clone().addScaledVector(dir, len);
  prism(kit.glow, base, mid, r, r * 0.85, sides, Cs(hex, 0.38), false, Cs(hex, 0.8));
  prism(kit.glow, mid, tip, r * 0.85, 0, sides, Cs(hex, 0.8), false, Cs(0xffffff, 0.75).lerp(Cs(hex, 1), 0.4));
}

/** Cavern: stalactites, crystals, waterfalls, vines, mushrooms, mine supports, natural arches. */
export function decorCavern(ctx: Ctx, a: number, b: number): void {
  const kit = ctx.kit;
  const q = ctx.q;
  const rockC = C(0x424850), rockD = C(0x323a40);

  // stalactites
  forSlots(a, b, 3, 0, (s, i) => {
    if (kit.pre) return;
    if (!ctx.owns(ID, s, i * 5 + 21)) return;
    const cnt = [1, 2, 3][q];
    for (let k = 0; k < cnt; k++) {
      const r1 = hash2(i, k * 4 + 1), r2 = hash2(i, k * 4 + 2), r3 = hash2(i, k * 4 + 3), r4 = hash2(i, k * 4 + 4);
      const wp = ctx.wallPt(s + r4 * 3, r2 > 0.5 ? 1 : -1, 0.6 + r1 * 0.4);
      const len = 2.2 + r3 * 5.5 * (0.5 + 0.5 * wp.u * 0 + 0.5);
      const rad = 0.35 + r3 * 1.0;
      const base = wp.pos.clone().addScaledVector(wp.n, -0.3);
      const tip = base.clone().addScaledVector(DOWN, len).addScaledVector(wp.n, len * 0.12);
      prism(kit.lit, base, tip, rad, 0, 5, r1 > 0.5 ? rockC : rockD, false, Cs(0x2a2622, 1), r1 * 6);
    }
  });

  // boulders piled along the foot of the walls
  forSlots(a, b, 3, 0.5, (s, i) => {
    if (kit.pre) return;
    if (!ctx.owns(ID, s, i * 5 + 29)) return;
    for (const side of [1, -1]) {
      const r1 = hash2(i, side + 100);
      if (r1 < 0.35) continue;
      const wp = ctx.wallPt(s + (r1 - 0.5) * 2, side, 0.07 + hash2(i, side + 101) * 0.1);
      const sz = 0.7 + hash2(i, side + 102) * 0.7;
      rock(kit.lit, wp.pos.clone().addScaledVector(wp.n, -sz * 0.3), V(sz * 1.2, 0, 0).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(UP, r1 * 6)), V(0, sz * 0.8, 0), V(0, 0, sz), r1 > 0.6 ? rockC : rockD, i * 3 + side, 0.35, C(0x6a645c));
    }
  });

  // rocky spikes rising from the lower walls
  forSlots(a, b, 5, 1, (s, i) => {
    if (kit.pre) return;
    if (!ctx.owns(ID, s, i * 5 + 22)) return;
    if (hash1(i * 13 + 1) < 0.3) return;
    const side = hash1(i * 13 + 2) > 0.5 ? 1 : -1;
    const wp = ctx.wallPt(s, side, 0.1 + hash1(i * 13 + 3) * 0.2);
    const base = wp.pos.clone().addScaledVector(wp.n, -0.7);
    const h = 3 + hash1(i * 13 + 4) * 5;
    prism(kit.lit, base, base.clone().addScaledVector(UP, h).addScaledVector(wp.n, h * 0.18), 1.0 + hash1(i * 13 + 5) * 1.3, 0, 6, rockC, false, rockD, i);
  });

  // glowing crystal clusters
  forSlots(a, b, 6, 2, (s, i) => {
    if (!ctx.owns(ID, s, i * 5 + 23)) return;
    if (hash1(i * 17 + 1) < 0.25) return;
    const side = hash1(i * 17 + 2) > 0.5 ? 1 : -1;
    const wp = ctx.wallPt(s, side, 0.14 + hash1(i * 17 + 3) * 0.3);
    const hex = CRYSTAL[Math.floor(hash1(i * 17 + 4) * CRYSTAL.length)];
    const n = 3 + Math.floor(hash1(i * 17 + 5) * 3);
    for (let k = 0; k < n; k++) {
      const r1 = hash2(i, k * 5 + 1), r2 = hash2(i, k * 5 + 2), r3 = hash2(i, k * 5 + 3);
      const dir = V().addScaledVector(wp.n, 0.9).addScaledVector(wp.w, (r1 - 0.5) * 0.9).addScaledVector(wp.f, (r2 - 0.5) * 1.1).addScaledVector(UP, 0.3).normalize();
      const len = (k === 0 ? 2.0 : 0.8) + r3 * (k === 0 ? 1.0 : 1.4);
      crystal(ctx, wp.pos.clone().addScaledVector(wp.n, -0.2).addScaledVector(wp.f, (r2 - 0.5) * 1.5).addScaledVector(wp.w, (r1 - 0.5) * 1.2), dir, len, 0.22 + r3 * 0.2, hex);
    }
    const c = wp.pos.clone().addScaledVector(wp.n, 1.2);
    kit.sprite(c, hex, 4.2, 0.55);
    kit.emit(c, hex, 8, 0.9);
  });

  // distant underground waterfalls
  forSlots(a, b, 110, 50, (s, i) => {
    if (!ctx.owns(ID, s, i * 5 + 24)) return;
    if (hash1(i * 19 + 1) < 0.4) return;
    const side = hash1(i * 19 + 2) > 0.5 ? 1 : -1;
    const A: THREE.Vector3[] = [], B: THREE.Vector3[] = [];
    const N = q === 0 ? 5 : 9;
    for (let k = 0; k <= N; k++) {
      const tau = 0.78 - (0.78 * k) / N;
      const wp = ctx.wallPt(s, side, tau);
      A.push(wp.pos.clone().addScaledVector(wp.n, 0.25).addScaledVector(wp.f, -1.3));
      B.push(wp.pos.clone().addScaledVector(wp.n, 0.25).addScaledVector(wp.f, 1.3));
    }
    for (let k = 0; k < N; k++) {
      const f0 = Math.min(1, k / 2) * 0.42, f1 = Math.min(1, (k + 1) / 2) * 0.42;
      const c0 = Cs(0x8fe8f0, f0), c1 = Cs(0x8fe8f0, f1);
      kit.add.quadV(A[k], B[k], B[k + 1], A[k + 1], c0, c0, c1, c1);
    }
    const base = ctx.wallPt(s, side, 0.04);
    kit.sprite(base.pos.clone().addScaledVector(base.n, 1.0), 0xbff4ff, 7, 0.5);
    kit.emit(ctx.wallPt(s, side, 0.2).pos, 0x60e0f0, 14, 0.9);
  });

  // hanging vines with glowing bulbs
  forSlots(a, b, 4, 1, (s, i) => {
    if (kit.pre) return;
    if (!ctx.owns(ID, s, i * 5 + 25)) return;
    const cnt = [1, 1, 2][q];
    for (let k = 0; k < cnt; k++) {
      if (hash2(i, k + 40) < 0.35) continue;
      const wp = ctx.wallPt(s + hash2(i, k + 50) * 4, hash2(i, k + 60) > 0.5 ? 1 : -1, 0.62 + hash2(i, k + 70) * 0.36);
      const glow = hash2(i, k + 80) > 0.55 ? (hash2(i, k + 81) > 0.5 ? 0x40ffd0 : 0xff70d0) : 0;
      vine(ctx, wp.pos.clone().addScaledVector(wp.n, -0.1), 2.5 + hash2(i, k + 90) * 4, i * 5 + k, glow, 0x2a5a46);
    }
  });

  // glowing mushrooms
  forSlots(a, b, 11, 4, (s, i) => {
    if (!ctx.owns(ID, s, i * 5 + 26)) return;
    if (hash1(i * 23 + 1) < 0.35) return;
    const wp = ctx.wallPt(s, hash1(i * 23 + 2) > 0.5 ? 1 : -1, 0.1 + hash1(i * 23 + 3) * 0.2);
    const hex = hash1(i * 23 + 4) > 0.5 ? 0x40ffe0 : 0xd070ff;
    for (let k = 0; k < 3; k++) {
      const r1 = hash2(i, k + 5), r2 = hash2(i, k + 15);
      const base = wp.pos.clone().addScaledVector(wp.n, -0.1).addScaledVector(wp.f, (r1 - 0.5) * 2).addScaledVector(wp.w, (r2 - 0.5) * 1.5);
      const dir = V().addScaledVector(wp.n, 0.5).addScaledVector(UP, 0.9).normalize();
      const h = 0.5 + r1 * 0.9;
      const top = base.clone().addScaledVector(dir, h);
      prism(kit.lit, base, top, 0.07, 0.05, 5, C(0xb8b0a0));
      prism(kit.glow, top.clone().addScaledVector(dir, -0.12), top.clone().addScaledVector(dir, 0.18), 0.5 * (0.6 + r2 * 0.6), 0.12, 7, Cs(hex, 0.8), false, Cs(hex, 0.35));
      kit.sprite(top, hex, 1.6, 0.5);
    }
    kit.emit(wp.pos.clone().addScaledVector(wp.n, 1), hex, 6, 0.6);
  });

  // wooden mine supports
  forSlots(a, b, 48, 24, (s, i) => {
    if (!ctx.owns(ID, s, i * 5 + 27)) return;
    if (hash1(i * 29 + 1) < 0.45) return;
    const wood = C(0x6b4a2c), wood2 = C(0x58391f);
    const tauTop = 0.34;
    const pts: THREE.Vector3[][] = [[], []];
    [1, -1].forEach((side, si) => {
      for (const tau of [0.12, 0.23, tauTop]) {
        const wp = ctx.wallPt(s, side, tau);
        pts[si].push(wp.pos.clone().addScaledVector(wp.n, 0.35));
      }
      prism(kit.lit, pts[si][0], pts[si][1], 0.24, 0.24, 4, wood, false, undefined, 0.8);
      prism(kit.lit, pts[si][1], pts[si][2], 0.24, 0.24, 4, wood2, false, undefined, 0.8);
    });
    const L = pts[0][2], R = pts[1][2];
    const fl = ctx.frame(s);
    const span = L.distanceTo(R);
    const mid = L.clone().add(R).multiplyScalar(0.5);
    box(kit.lit, mid, V().copy(L).sub(R).multiplyScalar(0.5), V().copy(fl.up).multiplyScalar(0.3), V().copy(fl.fwd).multiplyScalar(0.3), wood);
    // diagonal struts
    for (let si = 0; si < 2; si++) {
      const corner = pts[si][2];
      const other = pts[si][1];
      bar(kit.lit, other.clone().lerp(corner, 0.2), mid.clone().lerp(corner, 0.84).addScaledVector(fl.up, -0.2), 0.14, wood2, 4);
    }
    // lantern chain
    for (const k of [-0.28, 0.28]) {
      const top = mid.clone().addScaledVector(L.clone().sub(R), k * 0.5);
      const lamp = top.clone().addScaledVector(fl.up, -1.5);
      bar(kit.lit, top, lamp, 0.02, C(0x222222), 3);
      box(kit.glow, lamp.clone().addScaledVector(fl.up, -0.2), V(0.14, 0, 0).applyQuaternion(new THREE.Quaternion()), V(0, 0.2, 0), V(0, 0, 0.14), Cs(0xffb050, 1.2));
      kit.sprite(lamp.clone().addScaledVector(fl.up, -0.2), 0xffb050, 4.4, 0.9);
      kit.emit(lamp, 0xffa040, 12, 1);
    }
    void span; void at; void cageLamp;
  });

  // natural rock bridges
  forSlots(a, b, 90, 60, (s, i) => {
    if (kit.pre) return;
    if (!ctx.owns(ID, s, i * 5 + 28)) return;
    if (hash1(i * 31 + 1) < 0.5) return;
    const wr = ctx.wallPt(s, 1, 0.5), wl = ctx.wallPt(s, -1, 0.5);
    const N = q === 0 ? 5 : 8;
    const fl = ctx.frame(s);
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      const p = wl.pos.clone().lerp(wr.pos, t);
      p.addScaledVector(fl.up, Math.sin(t * Math.PI) * 3.2 - 1.2);
      const rad = 1.7 * (0.55 + 0.45 * Math.sin(t * Math.PI)) + 0.3 * hash2(i, k);
      rock(kit.lit, p, V(rad * 1.2, 0, 0), V(0, rad * 0.8, 0), V(0, 0, rad * 1.5), k & 1 ? rockC : rockD, i * 9 + k, 0.3);
    }
  });

  if (ctx.owns(ID, (a + b) / 2, 97)) motes(ctx, a, b, [8, 14, 22][q], 0x70ffe8, 0.16, 6, 1.5, 12, Math.floor(a) + 9);
}

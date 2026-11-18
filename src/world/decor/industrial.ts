import * as THREE from 'three';
import type { Ctx } from './ctx';
import { at, cageLamp, forSlots, loopStrip, motes } from './common';
import { bar, box, C, Cs, hash1, prism, ring } from './kit';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ID = 'industrial' as const;
const ORANGE = 0xff8a30;

/** Industrial depths: rib-vaulted hall, girders, fans, catwalks, hazard stripes, orange lamps, vents. */
export function decorIndustrial(ctx: Ctx, a: number, b: number): void {
  const kit = ctx.kit;
  const q = ctx.q;
  const steel = C(0x3b3531), steel2 = C(0x4a423b), rust = C(0x6a3c24);

  // vault ribs (T-section) from above the clearance zone up and over
  forSlots(a, b, 8, 0, (s, i) => {
    if (kit.pre) return;
    if (!ctx.owns(ID, s, i * 5 + 11)) return;
    const n = q === 0 ? 5 : 8;
    loopStrip(ctx, s, 0.3, 0.14, steel, 0.3, 1, n);
    loopStrip(ctx, s, 0.12, 0.34, steel2, 0.3, 1, n);
    // overhead girder across the hall
    const r = ctx.wallPt(s, 1, 0.8), l = ctx.wallPt(s, -1, 0.8);
    const mid = r.pos.clone().add(l.pos).multiplyScalar(0.5);
    const fl = ctx.frame(s);
    const half = r.pos.distanceTo(l.pos) / 2;
    box(kit.lit, mid.clone().addScaledVector(fl.up, -0.5), V().copy(fl.right).multiplyScalar(half), V().copy(fl.up).multiplyScalar(0.07), V().copy(fl.fwd).multiplyScalar(0.55), steel2);
    box(kit.lit, mid.clone().addScaledVector(fl.up, -0.78), V().copy(fl.right).multiplyScalar(half), V().copy(fl.up).multiplyScalar(0.07), V().copy(fl.fwd).multiplyScalar(0.55), steel2);
    box(kit.lit, mid.clone().addScaledVector(fl.up, -0.64), V().copy(fl.right).multiplyScalar(half), V().copy(fl.up).multiplyScalar(0.16), V().copy(fl.fwd).multiplyScalar(0.08), steel);
    // diagonal braces
    const r2 = ctx.wallPt(s, 1, 0.55), l2 = ctx.wallPt(s, -1, 0.55);
    bar(kit.lit, r2.pos.clone().addScaledVector(r2.n, 0.2), mid.clone().addScaledVector(fl.right, half * 0.45).addScaledVector(fl.up, -0.64), 0.12, steel, 4);
    bar(kit.lit, l2.pos.clone().addScaledVector(l2.n, 0.2), mid.clone().addScaledVector(fl.right, -half * 0.45).addScaledVector(fl.up, -0.64), 0.12, steel, 4);
  });

  // overhead pipes along the ceiling
  forSlots(a, b, 4, 0, (s, i) => {
    if (kit.pre) return;
    if (!ctx.owns(ID, s, i * 5 + 12)) return;
    const o = [0, 0];
    ctx.uh(s, 1, 1, o);
    const hTop = o[1] - 1.3;
    const cols = [C(0x5a4e44), C(0x7a4a30), C(0x3e3a36)];
    const us = [-2.4, 0.2, 2.5], rs = [0.4, 0.55, 0.32];
    for (let k = 0; k < 3; k++) {
      if (hash1(Math.floor(s / 64) * 5 + k) < 0.25) continue;
      prism(kit.lit, ctx.rel(s, us[k], hTop - k * 0.12), ctx.rel(s + 4, us[k], hTop - k * 0.12), rs[k], rs[k], 7, cols[k], false, undefined, 0.3);
      if (i % 2 === 0) prism(kit.lit, ctx.rel(s, us[k], hTop - k * 0.12).addScaledVector(ctx.frame(s).fwd, -0.1), ctx.rel(s, us[k], hTop - k * 0.12).addScaledVector(ctx.frame(s).fwd, 0.25), rs[k] * 1.25, rs[k] * 1.25, 7, steel, true, undefined, 0.3);
    }
  });

  // big spinning wall fans
  forSlots(a, b, 48, 20, (s, i) => {
    if (!ctx.owns(ID, s, i * 5 + 13)) return;
    if (hash1(i * 31 + 5) < 0.3) return;
    const side = i & 1 ? 1 : -1;
    const wp = ctx.wallPt(s, side, 0.34);
    const R = 2.3;
    const c = wp.pos.clone().addScaledVector(wp.n, 0.1);
    // dark opening disc
    const nseg = 12;
    for (let k = 0; k < nseg; k++) {
      const a0 = (k / nseg) * 6.283, a1 = ((k + 1) / nseg) * 6.283;
      const p0 = c.clone().addScaledVector(wp.f, Math.cos(a0) * R).addScaledVector(wp.w, Math.sin(a0) * R);
      const p1 = c.clone().addScaledVector(wp.f, Math.cos(a1) * R).addScaledVector(wp.w, Math.sin(a1) * R);
      kit.lit.tri(c, p0, p1, C(0x0e0b0a));
      kit.glow.tri(c.clone().addScaledVector(wp.n, 0.02), p0.clone().addScaledVector(wp.n, 0.02).lerp(c, 0.55), p1.clone().addScaledVector(wp.n, 0.02).lerp(c, 0.55), Cs(0xff6a18, 0.22));
    }
    ring(kit.lit, c.clone().addScaledVector(wp.n, 0.12), wp.f, wp.w, wp.n, R + 0.12, 0.2, 0.18, 12, rust);
    ring(kit.lit, c.clone().addScaledVector(wp.n, 0.3), wp.f, wp.w, wp.n, R * 0.62, 0.05, 0.05, 10, steel);
    ring(kit.lit, c.clone().addScaledVector(wp.n, 0.3), wp.f, wp.w, wp.n, R * 0.3, 0.05, 0.05, 8, steel);
    for (let k = 0; k < 4; k++) {
      const ang = (k / 4) * 6.283 + 0.4;
      const dir = V().addScaledVector(wp.f, Math.cos(ang)).addScaledVector(wp.w, Math.sin(ang));
      bar(kit.lit, c.clone().addScaledVector(wp.n, 0.3), c.clone().addScaledVector(wp.n, 0.3).addScaledVector(dir, R), 0.05, steel, 4);
    }
    const rot = kit.rotator(c.clone().addScaledVector(wp.n, 0.5), wp.f, wp.w, wp.n, (side > 0 ? 1 : -1) * (2.6 + hash1(i) * 1.5));
    prism(rot, V(0, 0, -0.12), V(0, 0, 0.18), 0.4, 0.4, 8, C(0x59493c), true);
    for (let k = 0; k < 5; k++) {
      const ang = (k / 5) * 6.283;
      const rad = V(Math.cos(ang), Math.sin(ang), 0), tan = V(-Math.sin(ang), Math.cos(ang), 0);
      const mid = rad.clone().multiplyScalar(1.2);
      const hx = rad.clone().multiplyScalar(0.85), hy = tan.clone().multiplyScalar(0.34).addScaledVector(V(0, 0, 1), 0.08), hz = V(0, 0, 0.04);
      box(rot, mid, hx, hy, hz, C(0x6a5a4a));
    }
    kit.sprite(c.clone().addScaledVector(wp.n, 0.3), ORANGE, 3.6, 0.28);
  });

  // catwalks along one wall in runs
  forSlots(a, b, 4, 0, (s, i) => {
    if (kit.pre) return;
    const sec = Math.floor(s / 52);
    if (!ctx.owns(ID, s, sec * 5 + 14)) return;
    if (hash1(sec * 13 + 3) < 0.45) return;
    const side = hash1(sec * 13 + 4) > 0.5 ? 1 : -1;
    const wp = ctx.wallPt(s + 2, side, 0.22);
    const fl = ctx.frame(s + 2);
    const inw = V().copy(fl.right).multiplyScalar(-side);
    const up = V().copy(fl.up);
    const f = V().copy(fl.fwd);
    const deckC = wp.pos.clone().addScaledVector(inw, 0.85);
    box(kit.lit, deckC, V().copy(f).multiplyScalar(2.0), V().copy(up).multiplyScalar(0.06), V().copy(inw).multiplyScalar(0.95), C(0x4d4a46), C(0x625c54));
    // hazard toe strip along the inner edge
    for (let k = 0; k < 4; k++) {
      const p = deckC.clone().addScaledVector(inw, 0.88).addScaledVector(f, -1.5 + k).addScaledVector(up, 0.07);
      const e = V().copy(f).multiplyScalar(0.5), w = V().copy(inw).multiplyScalar(0.07);
      kit.lit.quad(p.clone().sub(e).sub(w), p.clone().add(e).sub(w), p.clone().add(e).add(w), p.clone().sub(e).add(w), k & 1 ? C(0x1c1a18) : C(0xd8a420));
      const p2 = p.clone().addScaledVector(f, 1).addScaledVector(up, 0);
      void p2;
    }
    // posts + rail
    for (let k = 0; k < 2; k++) {
      const pb = deckC.clone().addScaledVector(inw, 0.9).addScaledVector(f, -1 + k * 2);
      bar(kit.lit, pb, pb.clone().addScaledVector(up, 1.0), 0.04, steel2, 4);
    }
    box(kit.lit, deckC.clone().addScaledVector(inw, 0.9).addScaledVector(up, 1.0), V().copy(f).multiplyScalar(2.0), V().copy(up).multiplyScalar(0.035), V().copy(inw).multiplyScalar(0.035), steel2);
    box(kit.lit, deckC.clone().addScaledVector(inw, 0.9).addScaledVector(up, 0.5), V().copy(f).multiplyScalar(2.0), V().copy(up).multiplyScalar(0.025), V().copy(inw).multiplyScalar(0.025), steel2);
    // brace
    if (i % 2 === 0) bar(kit.lit, deckC.clone().addScaledVector(inw, 0.9).addScaledVector(up, -0.05), wp.pos.clone().addScaledVector(up, -1.6).addScaledVector(inw, -0.1), 0.07, steel, 4);
  });

  // orange caged lamps (low on the wall, they pool light onto the floor)
  forSlots(a, b, 16, 5, (s, i) => {
    if (!ctx.owns(ID, s, i * 5 + 15)) return;
    const wp = ctx.wallPt(s, i & 1 ? 1 : -1, 0.1);
    cageLamp(ctx, wp, ORANGE, 4.2, 11);
  });

  // hazard stripes on the lower wall
  forSlots(a, b, 2.4, 0, (s, i) => {
    if (kit.pre) return;
    const sec = Math.floor(s / 96);
    if (!ctx.owns(ID, s, sec * 5 + 16)) return;
    if (hash1(sec * 3 + 8) < 0.4) return;
    if (s - sec * 96 > 40) return;
    const side = hash1(sec * 3 + 9) > 0.5 ? 1 : -1;
    for (let k = 0; k < 4; k++) {
      const s0 = s + k * 0.6;
      const A: THREE.Vector3[] = [], B: THREE.Vector3[] = [];
      for (let t = 0; t < 2; t++) {
        const w0 = ctx.wallPt(s0, side, 0.005 + t * 0.07), w1 = ctx.wallPt(s0 + 0.6, side, 0.005 + t * 0.07);
        A.push(w0.pos.clone().addScaledVector(w0.n, 0.04)); B.push(w1.pos.clone().addScaledVector(w1.n, 0.04));
      }
      kit.lit.quad(A[0], B[0], B[1], A[1], ((i * 4 + k) & 1) ? C(0x1c1a18) : C(0xcfa021));
    }
  });

  // vapor vents with steam
  forSlots(a, b, 55, 12, (s, i) => {
    if (!ctx.owns(ID, s, i * 5 + 17)) return;
    if (hash1(i * 37 + 2) < 0.3) return;
    const side = hash1(i * 37 + 3) > 0.5 ? 1 : -1;
    const wp = ctx.wallPt(s, side, 0.08);
    const fl = ctx.frame(s);
    const base = wp.pos.clone().addScaledVector(wp.n, 0.25);
    box(kit.lit, base, V().copy(wp.f).multiplyScalar(0.7), V().copy(wp.w).multiplyScalar(0.5), V().copy(wp.n).multiplyScalar(0.28), C(0x2a2622));
    box(kit.glow, base.clone().addScaledVector(wp.n, 0.28), V().copy(wp.f).multiplyScalar(0.5), V().copy(wp.w).multiplyScalar(0.05), V().copy(wp.n).multiplyScalar(0.01), Cs(ORANGE, 0.9));
    const top = base.clone().addScaledVector(fl.up, 6).addScaledVector(wp.n, 0.8);
    prism(kit.add, base.clone().addScaledVector(wp.n, 0.3), top, 0.3, 1.8, 7, Cs(0xb0a090, 0.16), false, Cs(0x000000, 0));
    for (let k = 0; k < 4; k++) kit.sprite(base.clone().addScaledVector(wp.n, 0.5 + k * 0.15).addScaledVector(fl.up, 0.6 + k * 1.3), 0xcfc0b0, 1.6 + k * 0.5, 0.18);
    kit.emit(base.clone().addScaledVector(wp.n, 1), ORANGE, 6, 0.6);
  });

  // vertical wall pipes
  forSlots(a, b, 30, 9, (s, i) => {
    if (kit.pre) return;
    if (!ctx.owns(ID, s, i * 5 + 18)) return;
    if (hash1(i * 41 + 1) < 0.4) return;
    const side = hash1(i * 41 + 2) > 0.5 ? 1 : -1;
    let prev = ctx.wallPt(s, side, 0.28);
    for (let t = 1; t <= 4; t++) {
      const wp = ctx.wallPt(s, side, 0.28 + t * 0.1);
      prism(kit.lit, prev.pos.clone().addScaledVector(prev.n, 0.3), wp.pos.clone().addScaledVector(wp.n, 0.3), 0.28, 0.28, 7, C(0x5b3b2b), false, undefined, 0.2);
      if (t % 2 === 0) box(kit.lit, wp.pos.clone().addScaledVector(wp.n, 0.2), V().copy(wp.f).multiplyScalar(0.12), V().copy(wp.w).multiplyScalar(0.08), V().copy(wp.n).multiplyScalar(0.2), steel);
      prev = wp;
    }
  });

  void at;
  if (ctx.owns(ID, (a + b) / 2, 98)) motes(ctx, a, b, [4, 8, 12][q], 0xff9a50, 0.12, 4, 1.5, 9, Math.floor(a) + 5);
}

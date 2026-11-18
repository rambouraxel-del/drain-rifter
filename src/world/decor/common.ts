import * as THREE from 'three';
import { Ctx, type WallPt } from './ctx';
import { box, bar, C, Cs, hash1, hash2, prism, ribbon, rock } from './kit';

type V3 = THREE.Vector3;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Iterate global slots (idx * spacing + offset) inside [a, b). */
export function forSlots(a: number, b: number, spacing: number, offset: number, cb: (s: number, idx: number) => void): void {
  let i = Math.ceil((a - offset) / spacing - 1e-9);
  for (; i * spacing + offset < b - 1e-9; i++) cb(i * spacing + offset, i);
}

/** Deterministic per-slot random stream. */
export function slotRand(idx: number, salt: number): () => number {
  let n = 0;
  return () => hash2(idx * 131 + salt, n++);
}

/** Point offset from a wall point along its basis (f = along track, w = up the wall, n = into the tunnel). */
export function at(wp: WallPt, f: number, w: number, n: number, out: V3 = V()): V3 {
  return out.copy(wp.pos).addScaledVector(wp.f, f).addScaledVector(wp.w, w).addScaledVector(wp.n, n);
}

/** Banded strip hugging the wall (ring joints, ribs, stripes). */
export function loopStrip(ctx: Ctx, s: number, halfLen: number, inset: number, col: THREE.Color, t0 = 0, t1 = 1, n = 8, vary = 0): void {
  for (const side of [1, -1]) {
    const A: V3[] = [], B: V3[] = [];
    for (let i = 0; i <= n; i++) {
      const tau = t0 + ((t1 - t0) * i) / n;
      const a = ctx.wallPt(s - halfLen, side, tau);
      A.push(a.pos.clone().addScaledVector(a.n, inset));
      const b = ctx.wallPt(s + halfLen, side, tau);
      B.push(b.pos.clone().addScaledVector(b.n, inset));
    }
    ribbon(ctx.kit.lit, A, B, col, vary);
  }
}

/** Flat decal line on a wall (graffiti / glyph stroke). a, b in wall space (f, w) offsets from wp. */
export function wallLine(buf: import('./kit').Buf, wp: WallPt, f0: number, w0: number, f1: number, w1: number, width: number, off: number, col: THREE.Color): void {
  const a = at(wp, f0, w0, off), b = at(wp, f1, w1, off);
  const dir = V().subVectors(b, a);
  // perpendicular in wall plane = wp.n x dir
  const side = V().crossVectors(wp.n, dir).normalize().multiplyScalar(width / 2);
  buf.quad(V().subVectors(a, side), V().addVectors(a, side), V().addVectors(b, side), V().subVectors(b, side), col);
}

/** Hanging vine: zigzag ribbon of dark green with a few leaf tufts. */
export function vine(ctx: Ctx, top: V3, length: number, seed: number, glowHex = 0, leaf = 0x2f5a2a): void {
  const kit = ctx.kit;
  const segs = Math.max(2, Math.round(length / 1.1));
  const w = V(hash1(seed) - 0.5, 0, hash1(seed + 1) - 0.5).normalize();
  let prev = top.clone();
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const next = top.clone().addScaledVector(w, Math.sin(t * 5 + seed) * 0.18 * t * length * 0.3);
    next.y -= length * t;
    const col = Cs(leaf, 0.7 + 0.5 * hash2(seed, i));
    const side = V(w.z, 0, -w.x);
    const wd = 0.1 + 0.07 * (1 - t);
    kit.lit.quad(prev.clone().addScaledVector(side, -wd), prev.clone().addScaledVector(side, wd), next.clone().addScaledVector(side, wd * 0.6), next.clone().addScaledVector(side, -wd * 0.6), col);
    if (i % 2 === 0) {
      // leaf tuft
      const l = next.clone();
      kit.lit.tri(l.clone().addScaledVector(side, -0.28), l.clone().addScaledVector(side, 0.28), l.clone().add(V(0, -0.45, 0)).addScaledVector(w, 0.1), Cs(leaf, 1.0 + 0.4 * hash2(seed, i + 9)));
    }
    prev = next;
  }
  if (glowHex) {
    kit.glow.tri(prev.clone().add(V(-0.07, 0, 0)), prev.clone().add(V(0.07, 0, 0)), prev.clone().add(V(0, -0.16, 0)), C(glowHex));
    kit.sprite(prev, glowHex, 0.7, 0.6);
  }
}

/** Soft floating motes (light particles) scattered in a slab of the tunnel. */
export function motes(ctx: Ctx, a: number, b: number, count: number, hex: number, size: number, uSpread: number, hMin: number, hMax: number, salt: number): void {
  const kit = ctx.kit;
  for (let i = 0; i < count; i++) {
    const s = a + hash2(salt, i * 3) * (b - a);
    const u = (hash2(salt, i * 3 + 1) - 0.5) * 2 * uSpread;
    const h = hMin + hash2(salt, i * 3 + 2) * (hMax - hMin);
    const f = ctx.frame(s);
    void f;
    kit.sprite(ctx.rel(s, u, h), hex, size * (0.6 + hash2(salt, i * 7) * 0.8), 0.5 + hash2(salt, i * 11) * 0.5);
  }
}

/** Caged wall lamp (emissive bulb + painted light + glow sprite). */
export function cageLamp(ctx: Ctx, wp: WallPt, hex: number, glowSize = 3.2, radius = 8): void {
  const kit = ctx.kit;
  const dark = C(0x2a2622);
  const body = at(wp, 0, 0, 0.14);
  box(kit.lit, body, V().copy(wp.f).multiplyScalar(0.16), V().copy(wp.w).multiplyScalar(0.34), V().copy(wp.n).multiplyScalar(0.14), dark);
  const bulb = at(wp, 0, 0, 0.36);
  box(kit.glow, bulb, V().copy(wp.f).multiplyScalar(0.13), V().copy(wp.w).multiplyScalar(0.2), V().copy(wp.n).multiplyScalar(0.12), Cs(hex, 1.25));
  for (const [df, dw] of [[-0.19, -0.24], [0.19, -0.24], [-0.19, 0.24], [0.19, 0.24]]) {
    bar(kit.lit, at(wp, df, dw, 0.24), at(wp, df, dw, 0.5), 0.03, dark, 3);
  }
  box(kit.lit, at(wp, 0, 0.3, 0.37), V().copy(wp.f).multiplyScalar(0.22), V().copy(wp.w).multiplyScalar(0.05), V().copy(wp.n).multiplyScalar(0.2), dark);
  box(kit.lit, at(wp, 0, -0.3, 0.37), V().copy(wp.f).multiplyScalar(0.22), V().copy(wp.w).multiplyScalar(0.05), V().copy(wp.n).multiplyScalar(0.2), dark);
  kit.sprite(at(wp, 0, 0, 0.55), hex, glowSize, 0.95);
  kit.emit(at(wp, 0, 0, 1.2), hex, radius, 1);
}

/** Sagging cable between two points (thin 3-sided bars). */
export function cable(ctx: Ctx, a: V3, b: V3, sag: number, col: THREE.Color, segs = 4): void {
  let prev = a;
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const p = V().lerpVectors(a, b, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    bar(ctx.kit.lit, prev, p, 0.035, col, 3);
    prev = p;
  }
}

/** Torch / small flame: glowing cone + sprite + painted light. */
export function flame(ctx: Ctx, base: V3, hex: number, size = 0.5, glow = 2.6, radius = 8): void {
  const kit = ctx.kit;
  const tip = base.clone(); tip.y += size * 1.7;
  prism(kit.glow, base, tip, size * 0.45, 0, 5, Cs(hex, 1.0), false, Cs(0xfff0c0, 1.1));
  kit.sprite(base.clone().setY(base.y + size * 0.7), hex, glow, 0.9);
  kit.emit(base.clone().setY(base.y + size), hex, radius, 1);
}

export { rock };

import * as THREE from 'three';
import { profileHeight } from '../../track/Spine';
import type { Ctx } from './ctx';
import { at, flame, forSlots, motes, vine, wallLine } from './common';
import { bar, box, C, Cs, hash1, hash2, prism, ring, rock } from './kit';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ID = 'ruins' as const;
const UP = V(0, 1, 0);

/** Forgotten ruins: carved hall, ledges with broken columns, arches / aqueducts, statue heads, runes, torches. */
export function decorRuins(ctx: Ctx, a: number, b: number): void {
  const kit = ctx.kit;
  const q = ctx.q;
  const stone = C(0x7a7480), stoneD = C(0x5e5a66), stoneL = C(0x8a8590), mossC = C(0x4c6a3a);
  const o = [0, 0];

  // columns on the ledges (some broken, some tall)
  forSlots(a, b, 7, 2, (s, i) => {
    if (!ctx.owns(ID, s, i * 5 + 31)) return;
    for (const side of [1, -1]) {
      const r0 = hash2(i, side + 3);
      if (r0 < 0.4) continue;
      const fl = ctx.frame(s);
      const half = fl.width / 2;
      const r = profileHeight(half, fl.width);
      const uC = side * half * 1.22;
      const base = ctx.rel(s + (r0 - 0.5) * 2, uC, r + 2.34);
      const broken = hash2(i, side + 9) > 0.45;
      const H = broken ? 1.5 + hash2(i, side + 11) * 3.5 : 7 + hash2(i, side + 12) * 4;
      const R = 0.5;
      box(kit.lit, base.clone().addScaledVector(UP, 0.15), V(0.85, 0, 0), V(0, 0.15, 0), V(0, 0, 0.85), stoneD);
      const top = base.clone().addScaledVector(UP, H);
      prism(kit.lit, base.clone().addScaledVector(UP, 0.3), top, R, R * 0.9, 8, stone, false, undefined, 0.3);
      if (broken) {
        rock(kit.lit, top, V(R, 0, 0), V(0, 0.35, 0), V(0, 0, R), stoneL, i * 3 + side, 0.35);
        rock(kit.lit, base.clone().add(V(side * -1.1, 0.4, 0.8)), V(0.55, 0, 0), V(0, 0.45, 0), V(0, 0, 0.5), stoneD, i * 7 + side, 0.4);
        // fallen drum
        prism(kit.lit, base.clone().add(V(-side * 0.9, 0.35, -1.1)), base.clone().add(V(-side * 0.9, 0.35, 0.3)), R, R, 8, stone);
      } else {
        box(kit.lit, top.clone().addScaledVector(UP, 0.2), V(0.8, 0, 0), V(0, 0.22, 0), V(0, 0, 0.8), stoneL);
        // moss clump
        rock(kit.lit, base.clone().addScaledVector(UP, 0.3), V(0.7, 0, 0), V(0, 0.25, 0), V(0, 0, 0.7), mossC, i + 5, 0.4);
      }
    }
  });

  // torches on the walls
  forSlots(a, b, 14, 5, (s, i) => {
    if (!ctx.owns(ID, s, i * 5 + 32)) return;
    const wp = ctx.wallPt(s, i & 1 ? 1 : -1, 0.28);
    box(kit.lit, at(wp, 0, 0, 0.25), V().copy(wp.f).multiplyScalar(0.08), V().copy(wp.w).multiplyScalar(0.7), V().copy(wp.n).multiplyScalar(0.25), C(0x2c2622));
    prism(kit.lit, at(wp, 0, -0.5, 0.5), at(wp, 0, 0.1, 0.6), 0.1, 0.22, 6, C(0x3a2e26), true);
    flame(ctx, at(wp, 0, 0.12, 0.62), 0xff9a40, 0.6, 3.6, 12);
  });

  // gates: free-standing pillars on both ledges joined by a (partly broken) arch
  forSlots(a, b, 70, 15, (s, i) => {
    if (!ctx.owns(ID, s, i * 5 + 33)) return;
    if (hash1(i * 13 + 1) < 0.35) return;
    const fl = ctx.frame(s);
    const half = fl.width / 2;
    const r = profileHeight(half, fl.width);
    const uC = half * 1.22;
    const hs = r + 2.34;
    const PH = 6.4;
    for (const side of [1, -1]) {
      const base = ctx.rel(s, side * uC, hs);
      box(kit.lit, base.clone().addScaledVector(UP, PH / 2), V().copy(fl.right).multiplyScalar(0.8), V(0, PH / 2, 0), V().copy(fl.fwd).multiplyScalar(0.8), stone);
      box(kit.lit, base.clone().addScaledVector(UP, PH + 0.2), V().copy(fl.right).multiplyScalar(1.0), V(0, 0.2, 0), V().copy(fl.fwd).multiplyScalar(1.0), stoneL);
    }
    const c = ctx.rel(s, 0, hs + PH + 0.3);
    const broken = hash1(i * 13 + 2) > 0.5;
    const R = uC;
    ring(kit.lit, c, V().copy(fl.right), V().copy(fl.up), V().copy(fl.fwd), R, 0.55, 0.7, q === 0 ? 6 : 10, stone, 0, broken ? Math.PI * 0.62 : Math.PI, stoneD);
    if (!broken) {
      box(kit.glow, c.clone().addScaledVector(fl.up, R), V().copy(fl.right).multiplyScalar(0.18), V(0, 0.24, 0), V().copy(fl.fwd).multiplyScalar(0.72), Cs(0xffa040, 0.95));
      kit.sprite(c.clone().addScaledVector(fl.up, R - 0.3), 0xffa040, 3, 0.5);
    }
  });

  // aqueduct arches spanning the hall
  forSlots(a, b, 130, 60, (s, i) => {
    if (!ctx.owns(ID, s, i * 5 + 34)) return;
    if (hash1(i * 31 + 1) < 0.25) return;
    const fl = ctx.frame(s);
    const wr = ctx.wallPt(s, 1, 0.3333), wl = ctx.wallPt(s, -1, 0.3333);
    const chord = wr.pos.distanceTo(wl.pos);
    const rise = 4.2;
    const Rr = (chord * chord) / (8 * rise) + rise / 2;
    const spring = wl.pos.clone().add(wr.pos).multiplyScalar(0.5);
    const cc = spring.clone().addScaledVector(fl.up, -(Rr - rise));
    const th = Math.asin(Math.min(1, chord / 2 / Rr));
    ring(kit.lit, cc, V().copy(fl.right), V().copy(fl.up), V().copy(fl.fwd), Rr, 0.5, 1.7, q === 0 ? 6 : 12, stone, Math.PI / 2 - th, Math.PI / 2 + th, stoneD);
    // masonry above the arch up to the deck
    const deckY = rise + 1.3;
    const cols = q === 0 ? 5 : 9;
    for (let k = 0; k < cols; k++) {
      const t = (k + 0.5) / cols;
      const uu = (t - 0.5) * chord;
      const archH = Math.sqrt(Math.max(0, Rr * Rr - uu * uu)) - (Rr - rise);
      const hh = (deckY - archH - 0.55) / 2;
      if (hh <= 0) continue;
      box(kit.lit, spring.clone().addScaledVector(fl.right, uu).addScaledVector(fl.up, archH + 0.55 + hh), V().copy(fl.right).multiplyScalar(chord / cols / 2), V(0, hh, 0), V().copy(fl.fwd).multiplyScalar(1.7), k & 1 ? stoneD : stone);
    }
    const deck = spring.clone().addScaledVector(fl.up, deckY + 0.35);
    box(kit.lit, deck, V().copy(fl.right).multiplyScalar(chord / 2 + 1.5), V(0, 0.4, 0), V().copy(fl.fwd).multiplyScalar(1.9), stoneL, mossC);
    for (const sd of [-1, 1]) box(kit.lit, deck.clone().addScaledVector(fl.fwd, sd * 1.7).addScaledVector(fl.up, 0.7), V().copy(fl.right).multiplyScalar(chord / 2 + 1.5), V(0, 0.3, 0), V().copy(fl.fwd).multiplyScalar(0.2), stone);
    for (let k = 0; k < 5; k++) {
      vine(ctx, spring.clone().addScaledVector(fl.right, (hash2(i, k) - 0.5) * chord * 0.7).addScaledVector(fl.fwd, (hash2(i, k + 9) - 0.5) * 3).addScaledVector(fl.up, 0.8 + rise * 0.1), 1.5 + hash2(i, k + 3) * 3, i * 9 + k, 0, 0x3a6a38);
    }
  });

  // giant statue heads in the walls
  forSlots(a, b, 150, 90, (s, i) => {
    if (!ctx.owns(ID, s, i * 5 + 35)) return;
    if (hash1(i * 17 + 1) < 0.3) return;
    const side = hash1(i * 17 + 2) > 0.5 ? 1 : -1;
    const wp = ctx.wallPt(s, side, 0.42);
    const c = at(wp, 0, 0, 0.8);
    const F = V().copy(wp.f), W = V().copy(wp.w), N = V().copy(wp.n);
    const sc = 1.0;
    rock(kit.lit, c, V().copy(F).multiplyScalar(2.2 * sc), V().copy(W).multiplyScalar(3.0 * sc), V().copy(N).multiplyScalar(2.3 * sc), stone, i * 3 + 1, 0.1, stoneL);
    box(kit.lit, at(wp, 0, -0.5, 3.0), V().copy(F).multiplyScalar(0.4), V().copy(W).multiplyScalar(1.1), V().copy(N).multiplyScalar(0.5), stoneL);
    box(kit.lit, at(wp, 0, 1.0, 2.9), V().copy(F).multiplyScalar(2.0), V().copy(W).multiplyScalar(0.32), V().copy(N).multiplyScalar(0.55), stoneD);
    box(kit.lit, at(wp, 0, -1.7, 2.5), V().copy(F).multiplyScalar(0.9), V().copy(W).multiplyScalar(0.22), V().copy(N).multiplyScalar(0.4), C(0x2a2830));
    const eyeHex = hash1(i * 17 + 3) > 0.5 ? 0x40e8d0 : 0xffa040;
    for (const e of [-0.95, 0.95]) {
      box(kit.lit, at(wp, e, 0.35, 2.85), V().copy(F).multiplyScalar(0.42), V().copy(W).multiplyScalar(0.22), V().copy(N).multiplyScalar(0.3), C(0x15141a));
      box(kit.glow, at(wp, e, 0.35, 3.05), V().copy(F).multiplyScalar(0.18), V().copy(W).multiplyScalar(0.1), V().copy(N).multiplyScalar(0.05), Cs(eyeHex, 1.2));
      kit.sprite(at(wp, e, 0.35, 3.3), eyeHex, 2.0, 0.7);
    }
    // shoulders / plinth
    box(kit.lit, at(wp, 0, -3.8, 0.5), V().copy(F).multiplyScalar(3.4), V().copy(W).multiplyScalar(1.0), V().copy(N).multiplyScalar(1.6), stoneD);
    // moss on top of the head
    rock(kit.lit, at(wp, 0.3, 3.0, 0.8), V().copy(F).multiplyScalar(1.4), V().copy(W).multiplyScalar(0.3), V().copy(N).multiplyScalar(1.2), mossC, i + 3, 0.4);
    kit.emit(at(wp, 0, 0, 5), eyeHex, 14, 0.6);
  });

  // glowing inscriptions
  forSlots(a, b, 20, 5, (s, i) => {
    if (!ctx.owns(ID, s, i * 5 + 36)) return;
    if (hash1(i * 23 + 1) < 0.25) return;
    const wp = ctx.wallPt(s, hash1(i * 23 + 2) > 0.5 ? 1 : -1, 0.27);
    const hex = hash1(Math.floor(s / 140) * 5 + 3) > 0.5 ? 0xffa040 : 0x40e0d0;
    // recessed dark panel
    box(kit.lit, at(wp, 0, 0, 0.02), V().copy(wp.f).multiplyScalar(2.6), V().copy(wp.w).multiplyScalar(0.8), V().copy(wp.n).multiplyScalar(0.04), C(0x2c2a34));
    const col = Cs(hex, 1.1);
    const L = (f0: number, w0: number, f1: number, w1: number) => wallLine(kit.glow, wp, f0, w0, f1, w1, 0.09, 0.08, col);
    for (let g = 0; g < 5; g++) {
      const f0 = -2.0 + g * 1.0;
      const kind = Math.floor(hash2(i, g + 7) * 6);
      switch (kind) {
        case 0: L(f0, -0.5, f0, 0.5); L(f0 - 0.25, 0, f0 + 0.25, 0); break;
        case 1: L(f0 - 0.3, -0.5, f0, 0.5); L(f0, 0.5, f0 + 0.3, -0.5); L(f0 - 0.2, -0.1, f0 + 0.2, -0.1); break;
        case 2: L(f0 - 0.3, 0.4, f0 + 0.3, 0.4); L(f0 + 0.3, 0.4, f0 + 0.3, -0.4); L(f0 + 0.3, -0.4, f0 - 0.3, -0.4); break;
        case 3: L(f0 - 0.3, -0.5, f0 + 0.3, 0.5); L(f0 - 0.3, 0.5, f0 + 0.3, -0.5); break;
        case 4: L(f0, 0.5, f0, -0.5); L(f0 - 0.3, 0.2, f0, 0.5); L(f0 + 0.3, 0.2, f0, 0.5); break;
        default: L(f0 - 0.3, 0.45, f0 + 0.3, 0.1); L(f0 + 0.3, 0.1, f0 - 0.3, -0.2); L(f0 - 0.3, -0.2, f0 + 0.3, -0.5);
      }
    }
    kit.sprite(at(wp, 0, 0, 0.8), hex, 4.5, 0.25);
    kit.emit(at(wp, 0, 0, 1.5), hex, 7, 0.35);
  });

  // hanging vines from the setbacks
  forSlots(a, b, 6, 1, (s, i) => {
    if (!ctx.owns(ID, s, i * 5 + 37)) return;
    if (hash1(i * 29 + 1) < 0.35) return;
    const wp = ctx.wallPt(s + hash1(i * 29 + 2) * 5, hash1(i * 29 + 3) > 0.5 ? 1 : -1, 0.4 + hash1(i * 29 + 4) * 0.15);
    vine(ctx, wp.pos.clone().addScaledVector(wp.n, -0.1), 3 + hash1(i * 29 + 5) * 4, i, 0, 0x3a6a38);
    vine(ctx, wp.pos.clone().addScaledVector(wp.n, 0.2).addScaledVector(wp.f, 0.6), 2 + hash1(i * 29 + 6) * 3, i + 40, 0, 0x4a7a3a);
  });

  // big light shafts from the open roof
  forSlots(a, b, 90, 45, (s, i) => {
    if (!ctx.owns(ID, s, i * 5 + 38)) return;
    if (hash1(i * 37 + 1) < 0.3) return;
    ctx.uh(s, 1, 1, o);
    const fl = ctx.frame(s);
    const topH = o[1] - 5;
    const off = (hash1(i * 37 + 2) - 0.5) * 4;
    const top = ctx.rel(s - 4, off, topH);
    const bottom = ctx.rel(s + 3, off * 0.4, 0);
    prism(kit.add, top, bottom, 3.6, 5.5, q === 0 ? 7 : 10, Cs(0xd8c090, 0.2), false, Cs(0xa09070, 0.05));
    // sky hole
    const hole = ctx.rel(s - 4, off, o[1] - 0.6);
    const n = 8;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * 6.283, a1 = ((k + 1) / n) * 6.283;
      kit.glow.tri(hole, hole.clone().addScaledVector(fl.right, Math.cos(a0) * 4).addScaledVector(fl.fwd, Math.sin(a0) * 4), hole.clone().addScaledVector(fl.right, Math.cos(a1) * 4).addScaledVector(fl.fwd, Math.sin(a1) * 4), Cs(0x9fb4e0, 0.8));
    }
    kit.emit(ctx.rel(s + 2, off * 0.4, 1.5), 0xffe0b0, 11, 0.75);
    kit.sprite(ctx.rel(s + 2, off * 0.4, 0.8), 0xffe0b0, 7, 0.3);
    for (let k = 0; k < 7; k++) {
      const t = hash2(i, k + 70), ang = hash2(i, k + 80) * 6.28;
      const pp = top.clone().lerp(bottom, 0.15 + t * 0.8);
      pp.addScaledVector(fl.right, Math.cos(ang) * 3 * (0.4 + t)).addScaledVector(fl.fwd, Math.sin(ang) * 3 * (0.4 + t));
      kit.sprite(pp, 0xfff0d0, 0.22, 0.7);
    }
  });

  void bar;
  if (ctx.owns(ID, (a + b) / 2, 96)) motes(ctx, a, b, [6, 12, 18][q], 0xd8ffa0, 0.16, 8, 1.5, 16, Math.floor(a) + 13);
}

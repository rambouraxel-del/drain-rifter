import * as THREE from 'three';
import type { BiomeId, SpineFrame } from '../../core/types';
import { makeFrame, profileHeight, type Spine } from '../../track/Spine';
import { ChunkKit, hash1, hash2, smooth, vnoise } from './kit';

type V3 = THREE.Vector3;

/** Number of control columns per side of the wall (rim -> apex). */
export const WALL_K = [6, 9, 12] as const;

/** Ruins hall profile: [u as fraction of half width, height above the rim] at tau = j/12. */
const RUINS_T: number[][] = [
  [1.0, 0], [1.0, 2.2], [1.5, 2.5], [1.55, 5.5], [1.5, 9], [1.9, 11.5], [2.05, 16], [2.15, 22], [2.0, 28], [1.6, 33], [1.1, 37], [0.6, 39.5], [0, 41],
];
/** Abyss: a gigantic funnel of void. */
const ABYSS_T: number[][] = [
  [1.0, 0], [1.5, 2.2], [2.3, 5], [3.3, 9], [4.3, 15], [5.2, 22], [5.9, 31], [6.1, 41], [5.6, 51], [3.8, 59], [2.0, 65], [0.9, 69], [0, 71],
];
function table(t: number[][], tau: number, half: number, r: number, out: number[]): void {
  const x = tau * 12;
  const i = Math.min(11, Math.floor(x));
  const f = x - i;
  const a = t[i], b = t[i + 1];
  out[0] = (a[0] + (b[0] - a[0]) * f) * half;
  out[1] = r + a[1] + (b[1] - a[1]) * f;
}

const _o = [0, 0];
/**
 * Wall cross-section of a biome in spine-local (u, h). tau 0 = rim (exactly on the surface edge
 * (|u| = half, h = r)), tau 1 = apex above the spine. side +1 = right wall, -1 = left wall.
 * Output u is signed.
 */
export function wallShape(b: BiomeId, tau: number, side: number, s: number, half: number, r: number, out: number[]): void {
  const ang = tau * Math.PI * 0.5;
  const sn = Math.sin(ang), cs = Math.max(0, Math.cos(ang));
  let u: number, h: number;
  switch (b) {
    case 'sewer':
      u = half * cs; h = r + half * 1.08 * sn;
      break;
    case 'industrial': {
      const k = 1 + 0.34 * smooth(0, 1, sn * 2.4);
      u = half * k * Math.pow(cs, 0.38); h = r + 9.6 * Math.pow(sn, 0.55);
      break;
    }
    case 'cavern': {
      u = half * (1 + 1.55 * Math.pow(sn, 0.5)) * Math.pow(cs, 0.62);
      h = r + 15.5 * Math.pow(sn, 0.78);
      const w = smooth(0.02, 0.22, tau);
      const q = side * (1 - tau);
      const n = (vnoise(s * 0.085, q * 3.1 + 11.3) - 0.5) * 0.46 + (vnoise(s * 0.33, q * 7.7 + 3.9) - 0.5) * 0.2 + (vnoise(s * 0.7, q * 11.3 + 1.7) - 0.5) * 0.16;
      u *= 1 + n * w; h = r + (h - r) * (1 + n * 0.8 * w);
      if (tau < 0.6) u = Math.max(u, half * 1.02);
      break;
    }
    case 'ruins': {
      table(RUINS_T, tau, half, r, _o); u = _o[0]; h = _o[1];
      const w = smooth(0.2, 0.5, tau) * (1 - smooth(0.9, 1, tau));
      const n = (vnoise(s * 0.05, side * (1 - tau) * 2.3 + 5.1) - 0.5) * 0.18;
      u *= 1 + n * w;
      break;
    }
    default: {
      table(ABYSS_T, tau, half, r, _o); u = _o[0]; h = _o[1];
      const w = smooth(0.05, 0.3, tau);
      const n = (vnoise(s * 0.04, side * (1 - tau) * 2.7 + 9.1) - 0.5) * 0.3;
      u *= 1 + n * w; h += n * 6 * w * (1 - tau);
    }
  }
  out[0] = u * side;
  out[1] = h;
}

export interface WallPt {
  pos: THREE.Vector3;
  /** Inward normal (world axes). */
  n: THREE.Vector3;
  /** Direction up the wall (increasing tau), world axes. */
  w: THREE.Vector3;
  /** Forward along the track. */
  f: THREE.Vector3;
  u: number;
  h: number;
  s: number;
  side: number;
}

/** Everything decor generators need to place things in track space. */
export class Ctx {
  readonly origin: V3;
  private frames = new Map<number, SpineFrame>();
  private _a = [0, 0];
  private _b = [0, 0];
  constructor(readonly kit: ChunkKit, readonly spine: Spine, readonly s0: number, readonly s1: number, readonly q: 0 | 1 | 2, origin: V3) {
    this.origin = origin;
  }

  frame(s: number): SpineFrame {
    const key = Math.round(s * 64);
    let f = this.frames.get(key);
    if (!f) { f = makeFrame(); this.spine.frame(s, f); this.frames.set(key, f); }
    return f;
  }

  /** World position (relative to the chunk origin) of track-space (s, u, h). */
  rel(s: number, u: number, h: number, out: V3 = new THREE.Vector3()): V3 {
    const f = this.frame(s);
    return out.copy(f.pos).sub(this.origin).addScaledVector(f.right, u).addScaledVector(f.up, h);
  }

  /** Which biome owns decor slot `key` at distance s (mixes both biomes through transitions). */
  biomeFor(s: number, key: number): BiomeId {
    const f = this.frame(s);
    if (f.blend <= 0) return f.biome;
    return hash1(key * 2654435761 + 17) < f.blend ? f.nextBiome : f.biome;
  }
  owns(id: BiomeId, s: number, key: number): boolean {
    return this.biomeFor(s, key) === id;
  }

  /** Blended wall shape at spine distance s. */
  uh(s: number, tau: number, side: number, out: number[]): void {
    const f = this.frame(s);
    const half = f.width / 2;
    const r = profileHeight(half, f.width);
    wallShape(f.biome, tau, side, s, half, r, out);
    if (f.blend > 0 && f.nextBiome !== f.biome) {
      wallShape(f.nextBiome, tau, side, s, half, r, this._b);
      out[0] += (this._b[0] - out[0]) * f.blend;
      out[1] += (this._b[1] - out[1]) * f.blend;
    }
  }

  wallPt(s: number, side: number, tau: number, out?: WallPt): WallPt {
    const w = out ?? { pos: new THREE.Vector3(), n: new THREE.Vector3(), w: new THREE.Vector3(), f: new THREE.Vector3(), u: 0, h: 0, s, side };
    const f = this.frame(s);
    const a = this._a;
    this.uh(s, tau, side, a);
    const u = a[0], h = a[1];
    const t2 = Math.min(1, tau + 0.02), t1 = Math.max(0, tau - 0.02);
    const p1 = [0, 0], p2 = [0, 0];
    this.uh(s, t1, side, p1); this.uh(s, t2, side, p2);
    let du = p2[0] - p1[0], dh = p2[1] - p1[1];
    const l = Math.hypot(du, dh) || 1; du /= l; dh /= l;
    // right wall: climbing tangent t=(du,dh): inward = (-dh, du); left wall (climbing = descending the loop): inward = (dh, -du)
    const inU = side > 0 ? -dh : dh;
    const inH = side > 0 ? du : -du;
    w.u = u; w.h = h; w.s = s; w.side = side;
    w.pos.copy(f.pos).sub(this.origin).addScaledVector(f.right, u).addScaledVector(f.up, h);
    w.n.copy(f.right).multiplyScalar(inU).addScaledVector(f.up, inH).normalize();
    w.w.copy(f.right).multiplyScalar(du).addScaledVector(f.up, dh).normalize();
    w.f.copy(f.fwd);
    return w;
  }

  /** Spine-local clearance of a point above the sliding surface (for placement checks). */
  heightAboveSurface(s: number, u: number, h: number): number {
    const f = this.frame(s);
    return h - profileHeight(u, f.width);
  }
}

export { hash1, hash2 };

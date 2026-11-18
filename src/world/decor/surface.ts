import * as THREE from 'three';
import { CONFIG } from '../../core/config';
import type { BiomeId } from '../../core/types';
import { profileHeight } from '../../track/Spine';
import { BIOMES } from '../biomes';
import { Ctx, WALL_K, wallShape } from './ctx';
import { C, hash2, smooth, vnoise } from './kit';

const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
const _c3 = new THREE.Color();

interface FaceIn {
  floor: boolean;
  s: number; u: number; h: number; tau: number; side: number;
  rg: number; k: number; half: number;
}

/** Palette tweaks per biome that do not belong in the atmosphere table. */
const MOSS = 0x56682c;
const VOID_TINT: Partial<Record<BiomeId, number>> = { cavern: 0x050c0e, ruins: 0x0d0c18, abyss: 0x0c0618 };

/** Flat colour of one terrain face for one biome (written to `o`). */
function baseColor(b: BiomeId, f: FaceIn, o: THREE.Color): THREE.Color {
  const look = BIOMES[b];
  const n = hash2(f.rg * 7 + 3, f.k * 13 + 1);
  const g = 0.92 + n * 0.16;
  const nv = vnoise(f.s * 0.17 + f.side * 7.1, f.tau * 4.3 + (f.floor ? 20 : 0));
  const au = Math.abs(f.u) / f.half;
  if (f.floor) {
    o.setHex(look.floor);
    switch (b) {
      case 'sewer':
        o.multiplyScalar(g * (0.82 + 0.28 * smooth(0.0, 0.9, au)));
        if (au > 0.72 && nv > 0.55) o.lerp(_c3.setHex(MOSS), 0.4);
        break;
      case 'industrial':
        o.multiplyScalar(g * (((f.rg + f.k) & 1) ? 0.88 : 1.0));
        if (au > 0.9) o.lerp(_c3.setHex(0xc78a22), 0.25);
        break;
      case 'cavern':
        o.multiplyScalar(g * (0.9 + 0.2 * nv));
        break;
      case 'ruins':
        o.multiplyScalar(g * (((f.rg >> 1) + (f.k >> 1)) & 1 ? 0.86 : 1.02));
        if (au > 0.8 && nv > 0.5) o.lerp(_c3.setHex(0x4c6038), 0.35);
        break;
      default:
        o.multiplyScalar(g);
        if (nv > 0.68) o.lerp(_c3.setHex(0xb260d0), 0.4);
    }
    return o;
  }
  const t = f.tau;
  o.setHex(look.wall);
  switch (b) {
    case 'sewer': {
      let m = g * ((f.rg % 3) === 0 ? 0.84 : 1);
      m *= 1 - 0.55 * smooth(0.3, 1, t);
      o.multiplyScalar(m);
      const moss = vnoise(f.s * 0.16 + f.side * 7.1, t * 3.4 + 2.2);
      if (moss > 0.6 && t < 0.85) o.lerp(_c3.setHex(MOSS), Math.min(0.75, (moss - 0.6) * 4));
      const st = vnoise(f.s * 0.5 + f.k * 3.7, t * 1.2);
      if (st > 0.72) o.multiplyScalar(0.8);
      o.lerp(_c3.setHex(0x2c3c48), smooth(0.55, 1, t) * 0.5);
      break;
    }
    case 'industrial': {
      let m = g * ((f.k % 3) === 0 ? 0.86 : 1) * ((f.rg & 1) ? 0.95 : 1);
      m *= 1 - 0.5 * smooth(0.35, 1, t);
      o.multiplyScalar(m);
      const rust = vnoise(f.s * 0.12 + f.side * 3, t * 3.1);
      if (rust > 0.58) o.lerp(_c3.setHex(0x8a4a22), Math.min(0.7, (rust - 0.58) * 4));
      break;
    }
    case 'cavern': {
      o.multiplyScalar(g * (0.85 + 0.3 * Math.sin(f.h * 0.9 + nv * 3)));
      o.lerp(_c3.setHex(0x1d3a40), 0.25 * (1 - t));
      o.multiplyScalar(1 - 0.55 * smooth(0.45, 1, t));
      break;
    }
    case 'ruins': {
      let m = g * (((f.rg + f.k) & 1) ? 0.9 : 1.04);
      o.multiplyScalar(m);
      const moss = vnoise(f.s * 0.14 + f.side * 5.1, f.h * 0.22);
      if (moss > 0.58 && f.h < 20) o.lerp(_c3.setHex(0x4c6038), Math.min(0.7, (moss - 0.58) * 4));
      o.multiplyScalar(1 - 0.5 * smooth(0.3, 1, t));
      break;
    }
    default: {
      o.multiplyScalar(g);
      if (nv > 0.66) o.lerp(_c3.setHex(0x9a4ac0), 0.35);
      o.multiplyScalar(1 - 0.6 * smooth(0.25, 1, t));
    }
  }
  const vt = VOID_TINT[b];
  if (vt !== undefined) o.lerp(_c3.setHex(vt), smooth(0.45, 0.95, t) * 0.8);
  return o;
}

/**
 * Terrain mesher: cross-section = floor columns (exact profileHeight) then the biome wall loop.
 * Faces are flat-coloured triangles (faceted low-poly look); lamps tint nearby faces (painted light).
 */
export function buildSurface(ctx: Ctx): void {
  const kit = ctx.kit;
  const q = ctx.q;
  const K = WALL_K[q];
  const ds = q === 0 ? 3 : 2;
  const rings = Math.round((ctx.s1 - ctx.s0) / ds);
  const nCurve = q === 0 ? 5 : q === 1 ? 7 : 8;
  const Fn = nCurve * 2 + 5;
  const P = Fn + (2 * K - 1);
  const tauOf = new Float32Array(P), sideOf = new Float32Array(P);
  for (let k = 0; k < Fn; k++) { tauOf[k] = 0; sideOf[k] = k < Fn / 2 ? -1 : 1; }
  for (let j = 0; j < 2 * K - 1; j++) {
    const idx = Fn + j;
    const jj = j < K ? j + 1 : 2 * K - 1 - j; // 1..K then K-1..1
    tauOf[idx] = jj / K;
    sideOf[idx] = j < K ? 1 : -1;
  }
  const pos: Float32Array[] = [];
  const U: Float32Array[] = [];
  const H: Float32Array[] = [];
  const half0 = ctx.frame(ctx.s0).width / 2;
  void half0;
  const o2 = [0, 0], o3 = [0, 0];
  const _p = new THREE.Vector3();
  const flatF = CONFIG.track.flatFraction;
  const idxFlat = nCurve; // index of -flat
  for (let i = 0; i <= rings; i++) {
    const s = ctx.s0 + i * ds;
    const f = ctx.frame(s);
    const half = f.width / 2;
    const flat = half * flatF;
    const r = half - flat;
    const rimH = profileHeight(half, f.width);
    const wb = Math.min(1.15, flat * 0.7);
    const pp = new Float32Array(P * 3), uu = new Float32Array(P), hh = new Float32Array(P);
    for (let k = 0; k < P; k++) {
      let u: number, h: number;
      if (k < Fn) {
        if (k < nCurve) { const m = nCurve - k; u = -(flat + r * Math.sin((m / nCurve) * Math.PI * 0.5)); }
        else if (k < nCurve + 5) { u = [-flat, -wb, 0, wb, flat][k - nCurve]; }
        else { const m = k - nCurve - 4; u = flat + r * Math.sin((m / nCurve) * Math.PI * 0.5); }
        h = profileHeight(u, f.width);
      } else {
        wallShape(f.biome, tauOf[k], sideOf[k], s, half, rimH, o2);
        if (f.blend > 0 && f.nextBiome !== f.biome) {
          wallShape(f.nextBiome, tauOf[k], sideOf[k], s, half, rimH, o3);
          o2[0] += (o3[0] - o2[0]) * f.blend; o2[1] += (o3[1] - o2[1]) * f.blend;
        }
        u = o2[0]; h = o2[1];
      }
      uu[k] = u; hh[k] = h;
      _p.copy(f.pos).sub(ctx.origin).addScaledVector(f.right, u).addScaledVector(f.up, h);
      pp[k * 3] = _p.x; pp[k * 3 + 1] = _p.y; pp[k * 3 + 2] = _p.z;
    }
    pos.push(pp); U.push(uu); H.push(hh);
  }
  void idxFlat;

  const em = kit.emitters;
  const fin: FaceIn = { floor: false, s: 0, u: 0, h: 0, tau: 0, side: 1, rg: 0, k: 0, half: 4.5 };
  const col = _c1;
  const sheenIdx0 = nCurve + 1; // quad k covers (k, k+1): sheen for k = nCurve+1, nCurve+2
  for (let i = 0; i < rings; i++) {
    const s = ctx.s0 + (i + 0.5) * ds;
    const f = ctx.frame(ctx.s0 + (i + 0.5) * ds);
    const rg = Math.round(s / ds);
    const A = pos[i], B = pos[i + 1];
    for (let k = 0; k < P; k++) {
      const k2 = (k + 1) % P;
      const floor = k < Fn - 1;
      fin.floor = floor;
      fin.s = s; fin.rg = rg; fin.k = k; fin.half = f.width / 2;
      fin.u = (U[i][k] + U[i][k2] + U[i + 1][k] + U[i + 1][k2]) * 0.25;
      fin.h = (H[i][k] + H[i][k2] + H[i + 1][k] + H[i + 1][k2]) * 0.25;
      if (!floor) {
        fin.tau = (tauOf[k] + tauOf[k2]) * 0.5;
        fin.side = tauOf[k] <= tauOf[k2] ? sideOf[k] : sideOf[k2];
      } else { fin.tau = 0; fin.side = fin.u >= 0 ? 1 : -1; }
      const bA = f.biome, bB = f.nextBiome;
      baseColor(bA, fin, col);
      if (f.blend > 0 && bB !== bA) {
        baseColor(bB, fin, _c2);
        col.lerp(_c2, f.blend);
      }
      // painted lamp light
      const cx = (A[k * 3] + A[k2 * 3] + B[k * 3] + B[k2 * 3]) * 0.25;
      const cy = (A[k * 3 + 1] + A[k2 * 3 + 1] + B[k * 3 + 1] + B[k2 * 3 + 1]) * 0.25;
      const cz = (A[k * 3 + 2] + A[k2 * 3 + 2] + B[k * 3 + 2] + B[k2 * 3 + 2]) * 0.25;
      let r = col.r, g = col.g, bl = col.b;
      for (let e = 0; e < em.length; e++) {
        const E = em[e];
        const dx = cx - E.x, dy = cy - E.y, dz = cz - E.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        const R2 = E.radius * E.radius;
        if (d2 >= R2) continue;
        const t = 1 - Math.sqrt(d2 / R2);
        const kk = t * t;
        r = r * (1 + kk * E.r * 1.6) + kk * E.r * 0.07;
        g = g * (1 + kk * E.g * 1.6) + kk * E.g * 0.07;
        bl = bl * (1 + kk * E.b * 1.6) + kk * E.b * 0.07;
      }
      if (floor && (k === sheenIdx0 || k === sheenIdx0 + 1)) {
        // water / sheen strip: tint + keep painted lights
        const w = BIOMES[bA];
        _c2.setHex(sheenColor(bA)); _c3.setHex(sheenColor(bB));
        _c2.lerp(_c3, f.blend);
        const wk = 0.9 + hash2(rg, k) * 0.2;
        kit.sheen.raw(A[k * 3], A[k * 3 + 1], A[k * 3 + 2], A[k2 * 3], A[k2 * 3 + 1], A[k2 * 3 + 2], B[k2 * 3], B[k2 * 3 + 1], B[k2 * 3 + 2], (_c2.r + (r - col.r) * 0.6) * wk, (_c2.g + (g - col.g) * 0.6) * wk, (_c2.b + (bl - col.b) * 0.6) * wk);
        kit.sheen.raw(A[k * 3], A[k * 3 + 1], A[k * 3 + 2], B[k2 * 3], B[k2 * 3 + 1], B[k2 * 3 + 2], B[k * 3], B[k * 3 + 1], B[k * 3 + 2], (_c2.r + (r - col.r) * 0.6) * wk, (_c2.g + (g - col.g) * 0.6) * wk, (_c2.b + (bl - col.b) * 0.6) * wk);
        void w;
        continue;
      }
      kit.lit.raw(A[k * 3], A[k * 3 + 1], A[k * 3 + 2], A[k2 * 3], A[k2 * 3 + 1], A[k2 * 3 + 2], B[k2 * 3], B[k2 * 3 + 1], B[k2 * 3 + 2], r, g, bl);
      kit.lit.raw(A[k * 3], A[k * 3 + 1], A[k * 3 + 2], B[k2 * 3], B[k2 * 3 + 1], B[k2 * 3 + 2], B[k * 3], B[k * 3 + 1], B[k * 3 + 2], r, g, bl);
    }
  }
}

function sheenColor(b: BiomeId): number {
  switch (b) {
    case 'sewer': return 0x2a5a60;
    case 'industrial': return 0x2c2a2a;
    case 'cavern': return 0x2f8c96;
    case 'ruins': return 0x3a6a5c;
    default: return 0x7a4ab0;
  }
}

export { C };

import * as THREE from 'three';
import { addMat, glowMat, litMat, sheenMat, spriteMat, updateSpriteScale } from '../materials';

type V3 = THREE.Vector3;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/* ---------------- deterministic noise ---------------- */

export function hash1(n: number): number {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
export function hash2(a: number, b: number): number {
  return hash1(Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663));
}
export function hash3(a: number, b: number, c: number): number {
  return hash1(Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791));
}
/** Smooth value noise in 0..1. */
export function vnoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
/** Small seeded generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const colCache = new Map<number, THREE.Color>();
/** Cached colour for a hex value (do not mutate). */
export function C(hex: number): THREE.Color {
  let c = colCache.get(hex);
  if (!c) { c = new THREE.Color(hex); colCache.set(hex, c); }
  return c;
}
/** Scaled copy of a hex colour (fresh object). */
export function Cs(hex: number, k: number): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(k);
}

/* ---------------- triangle soup buffer ---------------- */

/** Non-indexed triangle soup with a flat colour per triangle (or per vertex). */
export class Buf {
  p: number[] = [];
  c: number[] = [];
  off = false;
  get tris(): number { return this.p.length / 9; }

  tri(a: V3, b: V3, c: V3, col: THREE.Color): void {
    if (this.off) return;
    this.p.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    this.c.push(col.r, col.g, col.b, col.r, col.g, col.b, col.r, col.g, col.b);
  }
  triV(a: V3, b: V3, c: V3, ca: THREE.Color, cb: THREE.Color, cc: THREE.Color): void {
    if (this.off) return;
    this.p.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    this.c.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
  }
  quad(a: V3, b: V3, c: V3, d: V3, col: THREE.Color): void {
    this.tri(a, b, c, col);
    this.tri(a, c, d, col);
  }
  quadV(a: V3, b: V3, c: V3, d: V3, ca: THREE.Color, cb: THREE.Color, cc: THREE.Color, cd: THREE.Color): void {
    this.triV(a, b, c, ca, cb, cc);
    this.triV(a, c, d, ca, cc, cd);
  }
  /** Raw float triangle push (hot path for terrain). */
  raw(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, r: number, g: number, b: number): void {
    if (this.off) return;
    this.p.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    this.c.push(r, g, b, r, g, b, r, g, b);
  }
}

/* ---------------- shapes ---------------- */

const _c = new THREE.Color();
function varyCol(col: THREE.Color, i: number, amt: number): THREE.Color {
  const k = 1 + (hash1(i * 31 + 7) - 0.5) * amt;
  return _c.copy(col).multiplyScalar(k);
}

/** Oriented box: centre + half-extent vectors. Optional different top colour (+hy side). */
export function box(b: Buf, c: V3, hx: V3, hy: V3, hz: V3, col: THREE.Color, top?: THREE.Color): void {
  if (b.off) return;
  const p: V3[] = [];
  for (let i = 0; i < 8; i++) {
    const sx = i & 1 ? 1 : -1, sy = i & 2 ? 1 : -1, sz = i & 4 ? 1 : -1;
    p.push(V(c.x + hx.x * sx + hy.x * sy + hz.x * sz, c.y + hx.y * sx + hy.y * sy + hz.y * sz, c.z + hx.z * sx + hy.z * sy + hz.z * sz));
  }
  // index bits: x=1,y=2,z=4
  b.quad(p[0], p[1], p[3], p[2], col); // -z
  b.quad(p[4], p[6], p[7], p[5], col); // +z
  b.quad(p[0], p[2], p[6], p[4], col); // -x
  b.quad(p[1], p[5], p[7], p[3], col); // +x
  b.quad(p[0], p[4], p[5], p[1], col); // -y
  b.quad(p[2], p[3], p[7], p[6], top ?? col); // +y
}

const _ax = V(), _bx = V(), _by = V();
/** Basis perpendicular to dir. */
function perp(dir: V3, ox: V3, oy: V3): void {
  const h = Math.abs(dir.y) < 0.9 ? _ax.set(0, 1, 0) : _ax.set(1, 0, 0);
  ox.crossVectors(dir, h).normalize();
  oy.crossVectors(dir, ox).normalize();
}

/**
 * Prism / cone / pipe along p0 -> p1. r1 = 0 gives a cone. Optional end caps.
 * Optional `col1` shades the far end (vertex gradient for glowing crystals / light cones).
 */
export function prism(b: Buf, p0: V3, p1: V3, r0: number, r1: number, n: number, col: THREE.Color, caps = false, col1?: THREE.Color, rot = 0): void {
  if (b.off) return;
  _bx.subVectors(p1, p0);
  const len = _bx.length() || 1e-6;
  _bx.multiplyScalar(1 / len);
  const ox = V(), oy = V();
  perp(_bx, ox, oy);
  const a: V3[] = [], z: V3[] = [];
  for (let i = 0; i < n; i++) {
    const ang = rot + (i / n) * Math.PI * 2;
    const cx = Math.cos(ang), sy = Math.sin(ang);
    a.push(V(p0.x + (ox.x * cx + oy.x * sy) * r0, p0.y + (ox.y * cx + oy.y * sy) * r0, p0.z + (ox.z * cx + oy.z * sy) * r0));
    z.push(V(p1.x + (ox.x * cx + oy.x * sy) * r1, p1.y + (ox.y * cx + oy.y * sy) * r1, p1.z + (ox.z * cx + oy.z * sy) * r1));
  }
  const c1 = col1 ?? col;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (r1 <= 1e-4) {
      b.triV(a[i], a[j], p1, varyCol(col, i, 0.12).clone(), _c.copy(col).multiplyScalar(1 + (hash1(j * 31 + 7) - 0.5) * 0.12).clone(), c1);
    } else if (col1) {
      b.quadV(a[i], a[j], z[j], z[i], col, col, c1, c1);
    } else {
      b.quad(a[i], a[j], z[j], z[i], varyCol(col, i, 0.14));
    }
  }
  if (caps) {
    for (let i = 1; i < n - 1; i++) {
      b.tri(a[0], a[i + 1], a[i], col);
      if (r1 > 1e-4) b.tri(z[0], z[i], z[i + 1], c1);
    }
  }
}

// unit icosahedron
const T = (1 + Math.sqrt(5)) / 2;
const ICO_V: number[][] = [
  [-1, T, 0], [1, T, 0], [-1, -T, 0], [1, -T, 0], [0, -1, T], [0, 1, T], [0, -1, -T], [0, 1, -T], [T, 0, -1], [T, 0, 1], [-T, 0, -1], [-T, 0, 1],
].map((v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; });
const ICO_F = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

/** Lumpy low-poly rock: jittered icosahedron stretched along three axis vectors. */
export function rock(b: Buf, c: V3, hx: V3, hy: V3, hz: V3, col: THREE.Color, seed: number, jitter = 0.35, topCol?: THREE.Color): void {
  if (b.off) return;
  const pts: V3[] = ICO_V.map((v, k) => {
    const j = 1 + (hash2(seed, k) - 0.5) * 2 * jitter;
    return V(c.x + (hx.x * v[0] + hy.x * v[1] + hz.x * v[2]) * j, c.y + (hx.y * v[0] + hy.y * v[1] + hz.y * v[2]) * j, c.z + (hx.z * v[0] + hy.z * v[1] + hz.z * v[2]) * j);
  });
  for (let i = 0; i < ICO_F.length; i++) {
    const f = ICO_F[i];
    const upish = ICO_V[f[0]][1] + ICO_V[f[1]][1] + ICO_V[f[2]][1] > 0.6;
    b.tri(pts[f[0]], pts[f[1]], pts[f[2]], varyCol(topCol && upish ? topCol : col, seed * 13 + i, 0.22));
  }
}

/** Square-section ring (torus-like) in the plane spanned by ex, ey around c. Arc from a0..a1 (radians). */
export function ring(b: Buf, c: V3, ex: V3, ey: V3, ez: V3, R: number, w: number, t: number, segs: number, col: THREE.Color, a0 = 0, a1 = Math.PI * 2, colIn?: THREE.Color): void {
  if (b.off) return;
  const pa: V3[][] = [];
  for (let i = 0; i <= segs; i++) {
    const a = a0 + ((a1 - a0) * i) / segs;
    const ca = Math.cos(a), sa = Math.sin(a);
    const dx = ex.x * ca + ey.x * sa, dy = ex.y * ca + ey.y * sa, dz = ex.z * ca + ey.z * sa;
    // 4 corners (outer/inner x front/back)
    const mk = (rr: number, zz: number) => V(c.x + dx * rr + ez.x * zz, c.y + dy * rr + ez.y * zz, c.z + dz * rr + ez.z * zz);
    pa.push([mk(R + w, -t), mk(R + w, t), mk(R - w, t), mk(R - w, -t)]);
  }
  for (let i = 0; i < segs; i++) {
    const A = pa[i], B = pa[i + 1];
    b.quad(A[0], B[0], B[1], A[1], varyCol(col, i, 0.1)); // outer
    b.quad(A[1], B[1], B[2], A[2], col); // front
    b.quad(A[2], B[2], B[3], A[3], colIn ?? col); // inner
    b.quad(A[3], B[3], B[0], A[0], col); // back
  }
}

/** Ribbon between two equal-length polylines (flat colour). */
export function ribbon(b: Buf, A: V3[], B: V3[], col: THREE.Color, vary = 0): void {
  for (let i = 0; i < A.length - 1; i++) b.quad(A[i], A[i + 1], B[i + 1], B[i], vary ? varyCol(col, i, vary) : col);
}

/** Thin straight bar from a to b with square-ish section (3-sided for cables). */
export function bar(b: Buf, a: V3, z: V3, r: number, col: THREE.Color, sides = 3): void {
  prism(b, a, z, r, r, sides, col);
}

/* ---------------- chunk kit ---------------- */

export interface Emitter { x: number; y: number; z: number; r: number; g: number; b: number; radius: number; }

interface Rotator { center: V3; basis: [V3, V3, V3]; speed: number; buf: Buf; }

/** Collects all geometry for one chunk and turns it into a handful of meshes. */
export class ChunkKit {
  lit = new Buf();
  glow = new Buf();
  add = new Buf();
  sheen = new Buf();
  /** Sprites: x,y,z, r,g,b, size. */
  pts: number[] = [];
  emitters: Emitter[] = [];
  private rotators: Rotator[] = [];
  /** Pre-pass mode: only emitters are recorded. */
  pre = false;

  setPre(on: boolean): void {
    this.pre = on;
    for (const b of [this.lit, this.glow, this.add, this.sheen]) b.off = on;
  }

  /** Light sprite. `k` scales the colour intensity. */
  sprite(p: V3, hex: number, size: number, k = 1): void {
    if (this.pre) return;
    const c = C(hex);
    this.pts.push(p.x, p.y, p.z, c.r * k, c.g * k, c.b * k, size);
  }

  /** Painted light on nearby surfaces (vertex tint) – the cheap stand-in for real lights. */
  emit(p: V3, hex: number, radius: number, k = 1): void {
    if (!this.pre) return;
    const c = C(hex);
    this.emitters.push({ x: p.x, y: p.y, z: p.z, r: c.r * k, g: c.g * k, b: c.b * k, radius });
  }

  /** A spinning part: returns a buffer in local space (z = spin axis). */
  rotator(center: V3, bx: V3, by: V3, bz: V3, speed: number): Buf {
    const buf = new Buf();
    buf.off = this.pre;
    if (!this.pre) this.rotators.push({ center: center.clone(), basis: [bx.clone(), by.clone(), bz.clone()], speed, buf });
    return buf;
  }

  get triangles(): number {
    return this.lit.tris + this.glow.tris + this.add.tris + this.sheen.tris;
  }

  finish(origin: V3): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(origin);
    const mk = (b: Buf, mat: THREE.Material, colorName: string): THREE.Mesh | null => {
      if (!b.p.length) return null;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
      geo.setAttribute(colorName, new THREE.Float32BufferAttribute(b.c, 3));
      const m = new THREE.Mesh(geo, mat);
      return m;
    };
    const lit = mk(this.lit, litMat, 'color'); if (lit) { lit.name = 'terrain'; g.add(lit); }
    const sheen = mk(this.sheen, sheenMat, 'color'); if (sheen) g.add(sheen);
    const glow = mk(this.glow, glowMat, 'color'); if (glow) g.add(glow);
    const add = mk(this.add, addMat, 'aColor'); if (add) { add.renderOrder = 2; g.add(add); }
    if (this.pts.length) {
      const n = this.pts.length / 7;
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const o = i * 7;
        pos[i * 3] = this.pts[o]; pos[i * 3 + 1] = this.pts[o + 1]; pos[i * 3 + 2] = this.pts[o + 2];
        col[i * 3] = this.pts[o + 3]; col[i * 3 + 1] = this.pts[o + 4]; col[i * 3 + 2] = this.pts[o + 5];
        size[i] = this.pts[o + 6];
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
      const pm = new THREE.Points(geo, spriteMat);
      pm.renderOrder = 3;
      pm.onBeforeRender = (r, _s, cam) => updateSpriteScale(r, cam);
      g.add(pm);
    }
    const spinners: { m: THREE.Object3D; speed: number }[] = [];
    for (const r of this.rotators) {
      const mesh = mk(r.buf, litMat, 'color');
      if (!mesh) continue;
      const holder = new THREE.Group();
      holder.position.copy(r.center);
      holder.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r.basis[0], r.basis[1], r.basis[2]));
      holder.add(mesh);
      g.add(holder);
      spinners.push({ m: mesh, speed: r.speed });
    }
    if (spinners.length) {
      g.userData.update = (dt: number) => { for (const s of spinners) s.m.rotation.z += s.speed * dt; };
    }
    g.userData.tris = this.triangles;
    return g;
  }
}

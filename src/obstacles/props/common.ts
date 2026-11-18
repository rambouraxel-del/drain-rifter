import * as THREE from 'three';
import { RNG } from '../../core/rng';
import type { ObstacleSpec } from '../../core/types';
import type { ObstacleAnimState } from '../ObstacleManager';

/**
 * Shared helpers for obstacle props. Every prop builds a Group in the obstacle's LOCAL frame:
 * +x = track right, +y = surface normal, -z = forward. The footprint is |x| <= halfWidth, |z| <= depth/2.
 * Materials and unit geometries are cached and flagged userData.shared so disposeObject never frees them.
 * Only per-instance geometry (hazard stripes) is left unflagged, so it is disposed with the obstacle.
 */

/** A prop builder. */
export type Builder = (spec: ObstacleSpec, rng: RNG) => THREE.Group;
/** Animation hook read by ObstacleManager every frame through userData.anim. */
export type AnimHook = (st: ObstacleAnimState) => void;
export type V3 = [number, number, number];
type P2 = [number, number];

export const PI = Math.PI;

/** Footprint width (m): the collider spans exactly this along x. */
export function widthOf(spec: ObstacleSpec): number {
  return Math.max(0.6, spec.halfWidth * 2);
}
/** Footprint depth (m) along z. */
export function depthOf(spec: ObstacleSpec): number {
  return Math.max(0.4, spec.depth);
}

// ------------------------------------------------------------------ materials

const materials = new Map<string, THREE.MeshLambertMaterial>();
/** Flat-shaded Lambert, cached and shared. */
export function mat(color: number, emissive = 0, emissiveIntensity = 1): THREE.MeshLambertMaterial {
  const key = `${color}|${emissive}|${emissiveIntensity}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true, emissive, emissiveIntensity });
    m.userData.shared = true;
    materials.set(key, m);
  }
  return m;
}
/** Plain painted surface. */
export const solid = (color: number): THREE.MeshLambertMaterial => mat(color);
/** Self-lit surface (lamps, crystals, runes). */
export const glow = (color: number, intensity = 1.4): THREE.MeshLambertMaterial => mat(color, color, intensity);

const decals = new Map<string, THREE.MeshBasicMaterial>();
/** Unlit translucent decal (warning shadows). */
export function decal(color: number, opacity: number): THREE.MeshBasicMaterial {
  const key = `${color}|${opacity}`;
  let m = decals.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    m.userData.shared = true;
    decals.set(key, m);
  }
  return m;
}

// ----------------------------------------------------------------- geometries

const geometries = new Map<string, THREE.BufferGeometry>();
/** Returns a cached, shared geometry. */
export function shared(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geometries.get(key);
  if (!g) {
    g = make();
    g.userData.shared = true;
    geometries.set(key, g);
  }
  return g;
}

/** Unit geometries; meshes scale them to their real size. */
export const geo = {
  box: (): THREE.BufferGeometry => shared('box', () => new THREE.BoxGeometry(1, 1, 1)),
  cyl: (seg = 8): THREE.BufferGeometry => shared(`cyl${seg}`, () => new THREE.CylinderGeometry(1, 1, 1, seg)),
  /** Tapered column: top radius = top * bottom radius (top = 0 gives a point). */
  taper: (seg = 6, top = 0): THREE.BufferGeometry =>
    shared(`taper${seg}_${top}`, () => new THREE.CylinderGeometry(top, 1, 1, seg)),
  ico: (detail = 0): THREE.BufferGeometry => shared(`ico${detail}`, () => new THREE.IcosahedronGeometry(1, detail)),
  disc: (seg = 24): THREE.BufferGeometry => shared(`disc${seg}`, () => new THREE.CircleGeometry(1, seg)),
  ring: (seg = 32): THREE.BufferGeometry => shared(`ring${seg}`, () => new THREE.RingGeometry(0.88, 1, seg)),
  torus: (seg = 12): THREE.BufferGeometry => shared(`torus${seg}`, () => new THREE.TorusGeometry(1, 0.06, 3, seg)),
};

/**
 * Low-poly rock: an icosahedron with per-vertex jitter (shared across seeds).
 * `variant` picks one of a few fixed shapes so the cache stays small.
 */
export function rockGeo(variant: number, detail = 1): THREE.BufferGeometry {
  return shared(`rock${detail}_${variant}`, () => {
    const g = new THREE.IcosahedronGeometry(1, detail);
    const r = new RNG(variant * 7919 + 17);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    // Same position -> same factor, so triangles that share a corner still meet without cracks.
    const factors = new Map<string, number>();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
      let f = factors.get(k);
      if (f === undefined) {
        f = 1 + (r.next() * 2 - 1) * 0.2;
        factors.set(k, f);
      }
      p.setXYZ(i, x * f, y * f, z * f);
    }
    p.needsUpdate = true;
    return g;
  });
}

// ------------------------------------------------------------------ placement

/** Adds a mesh (position, Euler rotation, scale) to a parent. */
export function add(
  parent: THREE.Object3D,
  g: THREE.BufferGeometry,
  m: THREE.Material,
  p: V3 = [0, 0, 0],
  r: V3 = [0, 0, 0],
  s: V3 = [1, 1, 1],
): THREE.Mesh {
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(p[0], p[1], p[2]);
  mesh.rotation.set(r[0], r[1], r[2]);
  mesh.scale.set(s[0], s[1], s[2]);
  parent.add(mesh);
  return mesh;
}

/** Box of size s centred on p. */
export const box = (parent: THREE.Object3D, m: THREE.Material, s: V3, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0]): THREE.Mesh =>
  add(parent, geo.box(), m, p, r, s);

/** Cylinder of radius rad and height h, axis = local y unless rotated. */
export const cyl = (
  parent: THREE.Object3D,
  m: THREE.Material,
  rad: number,
  h: number,
  p: V3 = [0, 0, 0],
  r: V3 = [0, 0, 0],
  seg = 8,
): THREE.Mesh => add(parent, geo.cyl(seg), m, p, r, [rad, h, rad]);

/** Column or spike: base radius rad, height h, top radius = rad * top (0 = pointed). */
export const taper = (
  parent: THREE.Object3D,
  m: THREE.Material,
  rad: number,
  h: number,
  top: number,
  p: V3 = [0, 0, 0],
  r: V3 = [0, 0, 0],
  seg = 6,
): THREE.Mesh => add(parent, geo.taper(seg, top), m, p, r, [rad, h, rad]);

/** Low-poly ellipsoid (ico detail 0 or 1). */
export const blob = (parent: THREE.Object3D, m: THREE.Material, s: V3, p: V3 = [0, 0, 0], detail = 0): THREE.Mesh =>
  add(parent, geo.ico(detail), m, p, [0, 0, 0], s);

/** Jittered rock scaled to s. */
export const rock = (
  parent: THREE.Object3D,
  m: THREE.Material,
  s: V3,
  p: V3,
  variant: number,
  detail = 1,
  r: V3 = [0, 0, 0],
): THREE.Mesh => add(parent, rockGeo(variant, detail), m, p, r, s);

/** Small emissive cube (warning lamp, eye, rune chip). */
export const lamp = (parent: THREE.Object3D, color: number, p: V3, size = 0.2): THREE.Mesh =>
  box(parent, glow(color, 1.6), [size, size, size], p);

// -------------------------------------------------------------- hazard stripes

const hazardMat = solid(0x161411);

/** Clips a convex polygon by the half-plane f(p) >= 0. */
function clipPoly(poly: P2[], f: (p: P2) => number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const fa = f(a);
    const fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) {
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/**
 * Diagonal black hazard stripes (45 degrees, period in metres) clipped to a w x h rectangle in the
 * local XY plane, facing +z. The yellow base is the board itself. Per-instance geometry, so it is
 * disposed with the obstacle.
 */
export function hazardStripes(w: number, h: number, period = 0.5): THREE.BufferGeometry {
  const hx = w / 2, hy = h / 2;
  const rect: P2[] = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]];
  const pos: number[] = [];
  const lo = -(hx + hy), hi = hx + hy;
  for (let c = Math.floor(lo / period) * period; c < hi; c += period) {
    // Black band where c <= x + y < c + period/2.
    let poly = clipPoly(rect, (p) => p[0] + p[1] - c);
    poly = clipPoly(poly, (p) => c + period / 2 - (p[0] + p[1]));
    for (let i = 1; i + 1 < poly.length; i++) {
      for (const q of [poly[0], poly[i], poly[i + 1]]) pos.push(q[0], q[1], 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const nrm: number[] = [];
  for (let i = 0; i < pos.length / 3; i++) nrm.push(0, 0, 1);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}

/** Hazard stripes on a w x h panel centred at p, facing +z unless rotated. */
export function hazard(parent: THREE.Object3D, w: number, h: number, p: V3, r: V3 = [0, 0, 0]): THREE.Mesh {
  return add(parent, hazardStripes(w, h), hazardMat, p, r);
}

/** Hazard stripes on both z-faces of a board of thickness t centred at p. */
export function hazardFaces(parent: THREE.Object3D, w: number, h: number, p: V3, t: number): void {
  hazard(parent, w, h, [p[0], p[1], p[2] + t / 2 + 0.008]);
  hazard(parent, w, h, [p[0], p[1], p[2] - t / 2 - 0.008], [0, PI, 0]);
}

// ------------------------------------------------------------------ scattering

/**
 * Loose mound of n piece centres across a W x D footprint. Piece 0 sits at the centre at height `peak`
 * so the pile always reaches a wall-like height.
 */
export function moundSpots(rng: RNG, W: number, D: number, n: number, peak: number, size: number): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < n; i++) {
    const t = i === 0 ? 0 : rng.range(-1, 1);
    const x = t * (W / 2) * 0.85;
    const z = rng.range(-0.4, 0.4) * D;
    // Most pieces stay well above the ground so the heap reads as a wall even across wide spans.
    const y = i === 0 ? peak : size * 0.4 + peak * rng.range(0.3, 1.0) * (1 - 0.5 * t * t);
    out.push([x, y, z]);
  }
  return out;
}

/** Cluster of jittered rocks covering W x D (used by rocks and falling chunks). */
export function rockCluster(parent: THREE.Object3D, m: THREE.Material, W: number, D: number, rng: RNG): void {
  const n = Math.max(1, Math.ceil(W / 1.7));
  const cw = W / n;
  for (let i = 0; i < n; i++) {
    const cx = -W / 2 + (i + 0.5) * cw;
    const sx = (cw / 2) * rng.range(1.0, 1.15);
    const sy = rng.range(0.95, 1.45);
    const sz = (D / 2) * rng.range(0.95, 1.2);
    rock(parent, m, [sx, sy, sz], [cx, sy * 0.35, rng.range(-0.1, 0.1) * D], rng.int(0, 5), 1, [0, rng.range(0, PI), 0]);
  }
}

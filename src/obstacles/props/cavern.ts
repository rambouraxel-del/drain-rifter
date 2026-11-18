import * as THREE from 'three';
import type { ObstacleSpec } from '../../core/types';
import type { RNG } from '../../core/rng';
import { PI, add, blob, depthOf, geo, glow, rock, solid, taper, widthOf } from './common';

/** CAVERN props (rock, stalagmite, boulder, root). Falling uses the shared rock cluster in generic.ts. */

/** Jagged rock wall: one faceted rock per ~1.7 m of width, with an occasional satellite rock. */
export function buildRock(spec: ObstacleSpec, rng: RNG): THREE.Group {
  const g = new THREE.Group();
  const W = widthOf(spec), D = depthOf(spec);
  const stone = solid(0xa08a6c);
  const dark = solid(0x6b5b4a);
  const n = Math.max(1, Math.ceil(W / 1.7));
  const cw = W / n;
  for (let i = 0; i < n; i++) {
    const cx = -W / 2 + (i + 0.5) * cw;
    const sx = (cw / 2) * rng.range(1.0, 1.15);
    const sy = rng.range(0.95, 1.45);
    const sz = (D / 2) * rng.range(0.95, 1.2);
    rock(g, rng.chance(0.3) ? dark : stone, [sx, sy, sz], [cx, sy * 0.35, rng.range(-0.1, 0.1) * D], rng.int(0, 5), 1, [0, rng.range(0, PI), 0]);
    if (rng.chance(0.4)) {
      const s = rng.range(0.35, 0.5);
      rock(g, dark, [s * sx, s * sy, s * sz], [cx + sx * 0.9, s * sy * 0.3, sz * 0.4], rng.int(0, 5), 1);
    }
  }
  return g;
}

/** Field of pale stalagmites (1.0 to 2.1 m) covering the footprint. */
export function buildStalagmite(spec: ObstacleSpec, rng: RNG): THREE.Group {
  const g = new THREE.Group();
  const W = widthOf(spec), D = depthOf(spec);
  const stone = solid(0xb9ab92);
  const tip = solid(0xd8ccb0);
  const n = Math.max(1, Math.ceil(W / 0.8));
  const rows = Math.max(1, Math.round(D / 0.7));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < rows; j++) {
      const cx = -W / 2 + ((i + 0.5) * W) / n + rng.range(-0.1, 0.1);
      const cz = -D / 2 + ((j + 0.5) * D) / rows + rng.range(-0.1, 0.1);
      const h = rng.range(1.0, 2.0);
      const rb = Math.min(0.42, W / n / 2.1) * rng.range(0.85, 1.1);
      const tilt: [number, number, number] = [rng.range(-0.08, 0.08), 0, rng.range(-0.08, 0.08)];
      taper(g, rng.chance(0.2) ? tip : stone, rb, h, 0, [cx, h / 2 - 0.02, cz], tilt, 6);
    }
  }
  return g;
}

/** Boulders (one to three), each about as tall as the wall needs. */
export function buildBoulder(spec: ObstacleSpec, rng: RNG): THREE.Group {
  const g = new THREE.Group();
  const W = widthOf(spec), D = depthOf(spec);
  const stone = solid(0x7d7266);
  const dark = solid(0x534a42);
  const n = Math.min(3, Math.max(1, Math.round(W / 1.9)));
  const cw = W / n;
  for (let i = 0; i < n; i++) {
    const cx = -W / 2 + (i + 0.5) * cw;
    const r = Math.min(1.05, Math.max(0.55, cw / 2)) * rng.range(0.92, 1.0);
    const sx = Math.max(r, cw / 2) * 1.05;
    const sy = Math.max(r, 0.6) * 0.95;
    const sz = Math.max(r, D / 2) * 1.05;
    rock(g, rng.chance(0.4) ? dark : stone, [sx, sy, sz], [cx, sy * 0.95, rng.range(-0.1, 0.1) * D], rng.int(0, 5), 1, [0, rng.range(0, PI), 0]);
  }
  return g;
}

/** Tangle of hanging roots rising to ~2 m from a low earth mound, with glowing green tips. */
export function buildRoot(spec: ObstacleSpec, rng: RNG): THREE.Group {
  const g = new THREE.Group();
  const W = widthOf(spec), D = depthOf(spec);
  const wood = solid(0x4c3a28);
  const earth = solid(0x3a2e22);
  const glowMat = glow(0x7dff9a, 1.2);

  // Low mound so the whole footprint is covered.
  blob(g, earth, [W / 2 * 1.05, 0.5, D / 2 * 1.05], [0, 0.1, 0], 0);

  const count = Math.max(4, Math.ceil(W / 0.35));
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < count; i++) {
    const x = -W / 2 + ((i + 0.5) * W) / count + rng.range(-0.1, 0.1);
    const z = rng.range(-0.4, 0.4) * D;
    const rr = rng.range(0.07, 0.16);
    const L = rng.range(1.3, 2.05);
    const dir = new THREE.Vector3(rng.range(-0.5, 0.5), 1, rng.range(-0.3, 0.3)).normalize();
    const m = add(g, geo.cyl(5), wood, [0, 0, 0], [0, 0, 0], [rr, L, rr]);
    m.quaternion.setFromUnitVectors(up, dir);
    m.position.set(x, 0, z).addScaledVector(dir, L / 2);
    if (i % 3 === 0) {
      const tipPos = new THREE.Vector3(x, 0, z).addScaledVector(dir, L);
      blob(g, glowMat, [0.1, 0.1, 0.1], [tipPos.x, tipPos.y, tipPos.z], 0);
    }
  }
  return g;
}


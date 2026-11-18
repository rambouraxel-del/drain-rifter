import * as THREE from 'three';
import type { ObstacleSpec } from '../../core/types';
import type { RNG } from '../../core/rng';
import { PI, add, blob, box, cyl, depthOf, geo, glow, mat, solid, taper, widthOf } from './common';

/** ABYSS props (crystal, shard, orb). Slider and swinger are shared, tinted in generic.ts. */

/** Clusters of glowing cyan and magenta spires on a dark rock plinth. */
export function buildCrystal(spec: ObstacleSpec, rng: RNG): THREE.Group {
  const g = new THREE.Group();
  const W = widthOf(spec), D = depthOf(spec);
  const rockM = solid(0x2a2442);
  const cyan = glow(0x42e6ff, 1.0);
  const magenta = glow(0xc86bff, 0.9);

  box(g, rockM, [W, 0.3, D], [0, 0.15, 0]);
  const n = Math.max(1, Math.ceil(W / 0.9));
  const cw = W / n;
  for (let i = 0; i < n; i++) {
    const cx = -W / 2 + (i + 0.5) * cw;
    const k = rng.int(3, 4);
    for (let j = 0; j < k; j++) {
      const x = cx + rng.range(-0.25, 0.25) * cw;
      const z = rng.range(-0.35, 0.35) * D;
      const h = rng.range(0.9, 1.8);
      const rb = rng.range(0.1, 0.2);
      const tilt: [number, number, number] = [rng.range(-0.12, 0.12), 0, rng.range(-0.12, 0.12)];
      taper(g, rng.chance(0.7) ? cyan : magenta, rb, h, 0, [x, 0.3 + h / 2, z], tilt, 6);
    }
  }
  return g;
}

/** Forest of dark glass shards with a faint violet edge glow. */
export function buildShard(spec: ObstacleSpec, rng: RNG): THREE.Group {
  const g = new THREE.Group();
  const W = widthOf(spec), D = depthOf(spec);
  const dark = mat(0x2b2540, 0x4a2a80, 0.6);
  const count = Math.max(4, Math.ceil(W / 0.6));
  const cw = W / count;
  for (let i = 0; i < count; i++) {
    const x = -W / 2 + (i + 0.5) * cw + rng.range(-0.15, 0.15) * cw;
    const z = rng.range(-0.4, 0.4) * D;
    const h = rng.range(1.0, 2.0);
    const rb = rng.range(0.12, 0.2);
    const tilt: [number, number, number] = [rng.range(-0.25, 0.25), rng.range(0, PI * 2), rng.range(-0.2, 0.2)];
    taper(g, dark, rb, h, 0, [x, h / 2 - 0.02, z], tilt, 3);
  }
  return g;
}

/** Glowing orbs on thin stands above a dark plinth, each with a halo ring. */
export function buildOrb(spec: ObstacleSpec, rng: RNG): THREE.Group {
  const g = new THREE.Group();
  const W = widthOf(spec), D = depthOf(spec);
  const stand = solid(0x2a2f44);
  const plinth = solid(0x23263a);
  box(g, plinth, [W, 0.3, D], [0, 0.15, 0]);

  const n = Math.max(1, Math.ceil(W / 1.5));
  const cw = W / n;
  for (let i = 0; i < n; i++) {
    const cx = -W / 2 + (i + 0.5) * cw;
    const r = Math.min(0.42, cw * 0.38);
    const cy = rng.range(1.1, 1.45);
    const col = i % 2 ? 0x5ff6e0 : 0xff6ad5;
    const h = cy - r - 0.3;
    cyl(g, stand, 0.07, h, [cx, 0.3 + h / 2, 0], [0, 0, 0], 6);
    blob(g, glow(col, 1.2), [r, r, r], [cx, cy, 0], 1);
    add(g, geo.torus(12), glow(col, 1.0), [cx, cy, 0], [0.35, 0, 0], [r * 1.6, r * 1.6, r * 1.6]);
  }
  return g;
}

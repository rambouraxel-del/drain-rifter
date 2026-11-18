import * as THREE from 'three';
import type { ObstacleSpec } from '../../core/types';
import type { RNG } from '../../core/rng';
import { PI, blob, box, cyl, depthOf, glow, lamp, moundSpots, rock, solid, taper, widthOf } from './common';
// glow is used by buildPillar's rune band.

/** RUINS props (pillar, statue, rubble). Falling and swinger are shared, tinted in generic.ts. */

/** Row of sandstone columns on a shared plinth. Some are broken short; each has a glowing rune band. */
export function buildPillar(spec: ObstacleSpec, rng: RNG): THREE.Group {
  const g = new THREE.Group();
  const W = widthOf(spec), D = depthOf(spec);
  const stone = solid(0xbcab88);
  const dark = solid(0x8d7f66);
  const rune = glow(0xff9a3c, 1.3);

  box(g, dark, [W, 0.25, D], [0, 0.125, 0]);
  const n = Math.max(1, Math.ceil(W / 1.3));
  const cw = W / n;
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + (i + 0.5) * cw;
    const rad = Math.max(0.2, Math.min(cw * 0.42, 0.5));
    // Broken columns are shorter (still at least 1.2 m tall); whole ones stay under the 2.2 m cap.
    const H = rng.chance(0.3) ? rng.range(1.0, 1.3) : rng.range(1.6, 1.8);
    cyl(g, stone, rad, H, [x, 0.25 + H / 2, 0], [0, 0, 0], 8);
    box(g, dark, [rad * 2.5, 0.16, Math.min(D, rad * 3)], [x, 0.25 + H + 0.08, 0]);
    cyl(g, rune, rad * 1.04, 0.06, [x, 0.7, 0], [0, 0, 0], 8);
  }
  return g;
}

/** Weathered guardian statues on a continuous pedestal. Eyes glow orange, facing the player. */
export function buildStatue(spec: ObstacleSpec, rng: RNG): THREE.Group {
  const g = new THREE.Group();
  const W = widthOf(spec), D = depthOf(spec);
  const stone = solid(0x868e9a);
  const robe = solid(0x6c7480);

  box(g, stone, [W, 0.9, D], [0, 0.45, 0]);
  const n = Math.max(1, Math.round(W / 1.6));
  const cw = W / n;
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + (i + 0.5) * cw;
    const s = rng.range(0.9, 1.05);
    const rb = Math.min(cw * 0.3, 0.42) * s;
    taper(g, robe, rb, 0.85, 0.7, [x, 0.9 + 0.425, 0], [0, 0, 0], 8);
    blob(g, stone, [0.16 * s, 0.17 * s, 0.16 * s], [x, 1.92, 0], 0);
    lamp(g, 0xff8a2a, [x - 0.06, 1.95, 0.2], 0.05);
    lamp(g, 0xff8a2a, [x + 0.06, 1.95, 0.2], 0.05);
  }
  return g;
}

/** Heap of broken stone: a dark base plus a mound of chunks reaching about 1.3 m. */
export function buildRubble(spec: ObstacleSpec, rng: RNG): THREE.Group {
  const g = new THREE.Group();
  const W = widthOf(spec), D = depthOf(spec);
  const base = solid(0x6f6453);
  const cols = [solid(0xa99a7a), solid(0x8a7c62), solid(0xc4b491)];

  box(g, base, [W * 0.96, 0.5, D * 0.96], [0, 0.25, 0]);
  const n = Math.min(40, Math.max(8, Math.round(W * D * 3.5)));
  for (const [x, y, z] of moundSpots(rng, W, D, n, 1.1, 0.5)) {
    const s = rng.range(0.22, 0.42);
    rock(g, rng.pick(cols), [s * rng.range(0.9, 1.3), s * rng.range(0.7, 1.0), s * rng.range(0.9, 1.3)], [x, y, z], rng.int(0, 5), 0, [0, rng.range(0, PI), 0]);
  }
  return g;
}

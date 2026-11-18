import * as THREE from 'three';
import type { ObstacleSpec } from '../../core/types';
import type { RNG } from '../../core/rng';
import { PI, box, cyl, depthOf, hazardFaces, lamp, solid, widthOf } from './common';

/**
 * SEWER props (barrier, crate, grate, pipe). Barrier and crate also appear in industrial, where the
 * palette switches to steel.
 */

/** Hazard barrier: striped board on posts, warning lamps on top. */
export function buildBarrier(spec: ObstacleSpec, _rng: RNG): THREE.Group {
  const g = new THREE.Group();
  const W = widthOf(spec), D = depthOf(spec);
  const ind = spec.biome === 'industrial';
  const board = solid(ind ? 0xf5c20a : 0xd9a00e);
  const frame = solid(ind ? 0x4b5560 : 0x3b3f3a);

  box(g, frame, [W, 0.1, D], [0, 0.05, 0]); // base plate covers the footprint
  const posts = Math.max(2, Math.ceil(W / 2.2) + 1);
  for (let i = 0; i < posts; i++) {
    const x = -W / 2 + 0.2 + ((W - 0.4) * i) / (posts - 1);
    for (const z of [-D * 0.3, D * 0.3]) box(g, frame, [0.14, 1.0, 0.14], [x, 0.6, z]);
    lamp(g, 0xff8a1f, [x, 1.25, 0], 0.22);
  }
  box(g, board, [W, 0.7, 0.12], [0, 0.8, 0]);
  hazardFaces(g, W, 0.7, [0, 0.8, 0], 0.12);
  return g;
}

/** Stacked wooden crates (steel crates in industrial), tiling the footprint with 1 or 2 layers. */
export function buildCrate(spec: ObstacleSpec, rng: RNG): THREE.Group {
  const g = new THREE.Group();
  const W = widthOf(spec), D = depthOf(spec);
  const ind = spec.biome === 'industrial';
  const body = solid(ind ? 0x6f7d88 : 0x9c6c3d);
  const trim = solid(ind ? 0x3b4650 : 0x5b3a1f);

  let nx = Math.max(1, Math.ceil(W / 1.1));
  let nz = Math.max(1, Math.ceil(D / 1.1));
  while (nx * nz > 12 && nz > 1) nz--;
  const cw = W / nx, cd = D / nz;
  const lh = Math.min(1.1, Math.max(0.95, Math.min(cw, cd) * 0.98));
  const sw = cw * 0.96, sd = cd * 0.96, bh = lh * 0.98;

  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      const x = -W / 2 + (ix + 0.5) * cw;
      const z = -D / 2 + (iz + 0.5) * cd;
      const layers = rng.chance(0.4) ? 2 : 1;
      for (let l = 0; l < layers; l++) {
        const y = lh * (l + 0.5);
        box(g, body, [sw, bh, sd], [x, y, z]);
        // X brace on the +z face (the side the player sees).
        const len = Math.hypot(sw, bh) * 0.96;
        const ang = Math.atan2(bh, sw);
        const zf = z + sd / 2 + 0.02;
        box(g, trim, [len, 0.05, 0.04], [x, y, zf], [0, 0, ang]);
        box(g, trim, [len, 0.05, 0.04], [x, y, zf], [0, 0, -ang]);
      }
    }
  }
  return g;
}

/** Vertical grille gate: frame, slats, horizontal rails and amber lamps. */
export function buildGrate(spec: ObstacleSpec, _rng: RNG): THREE.Group {
  const g = new THREE.Group();
  const W = widthOf(spec), D = depthOf(spec);
  const frame = solid(0x4a4640);
  const rust = solid(0x7a4a2a);
  const bar = solid(0x6b737a);

  box(g, frame, [W, 0.14, D], [0, 1.45, 0]); // top rail
  box(g, rust, [W, 0.16, D], [0, 0.08, 0]); // bottom rail
  for (const x of [-W / 2 + 0.06, W / 2 - 0.06]) box(g, frame, [0.12, 1.4, D], [x, 0.75, 0]);

  const slats = Math.max(2, Math.floor(W / 0.24));
  for (let i = 0; i < slats; i++) {
    const x = -W / 2 + ((i + 0.5) * W) / slats;
    box(g, bar, [0.05, 1.22, D * 0.9], [x, 0.76, 0]);
  }
  for (const y of [0.6, 1.0]) {
    box(g, bar, [W, 0.06, 0.06], [0, y, D / 2 - 0.03]);
  }
  lamp(g, 0xffa030, [-W / 2 + 0.2, 1.62, 0], 0.22);
  lamp(g, 0xffa030, [W / 2 - 0.2, 1.62, 0], 0.22);
  return g;
}

/** Rusty pipe across the track, on legs, with flanges. Several rows for deep footprints. */
export function buildPipe(spec: ObstacleSpec, _rng: RNG): THREE.Group {
  const g = new THREE.Group();
  const W = widthOf(spec), D = depthOf(spec);
  const rust = solid(0x8c4a2c);
  const band = solid(0x4d2c1c);
  const leg = solid(0x3c3c3a);

  const rows = Math.max(1, Math.ceil(D / 1.5));
  const rr = Math.min(0.8, Math.max(0.3, D / rows / 2));
  const yC = Math.min(2.2 - rr, Math.max(rr + 0.45, 1.3));
  const flanges: number[] = [-W / 2 + 0.15, W / 2 - 0.15];
  const extra = Math.max(0, Math.floor((W - 0.3) / 2.2) - 1);
  for (let i = 1; i <= extra; i++) flanges.push(-W / 2 + 0.15 + ((W - 0.3) * i) / (extra + 1));

  for (let r = 0; r < rows; r++) {
    const z = -D / 2 + ((r + 0.5) * D) / rows;
    cyl(g, rust, rr, W, [0, yC, z], [0, 0, PI / 2], 10);
    for (const x of flanges) cyl(g, band, rr * 1.2, 0.14, [x, yC, z], [0, 0, PI / 2], 10);
    const legH = Math.max(0.1, yC - rr);
    for (const x of [-W / 2 + 0.3, W / 2 - 0.3]) cyl(g, leg, 0.12, legH, [x, legH / 2, z], [0, 0, 0], 6);
  }
  return g;
}

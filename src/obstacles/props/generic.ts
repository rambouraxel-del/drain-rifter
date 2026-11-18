import * as THREE from 'three';
import type { BiomeId, ObstacleSpec } from '../../core/types';
import type { RNG } from '../../core/rng';
import {
  PI, add, blob, box, cyl, decal, depthOf, geo, glow, hazardFaces, mat, moundSpots, rock, rockCluster,
  solid, taper, widthOf, type AnimHook, type V3,
} from './common';

/**
 * GENERIC kinds that appear in several biomes (falling, slider, swinger, debris). Each one reads
 * spec.biome to pick its palette and materials.
 */

// ------------------------------------------------------------------ falling

/**
 * Falling chunk. The chunk drops from y = (1-fall)^2 * 14 and a dark shadow with an orange warning
 * ring grows on the surface, reaching the full collider footprint on landing.
 * The anim hook replaces the ObstacleManager default fall.
 */
export function buildFalling(spec: ObstacleSpec, rng: RNG): THREE.Group {
  const root = new THREE.Group();
  const W = widthOf(spec), D = depthOf(spec);
  const hw = W / 2;
  const chunk = new THREE.Group();
  root.add(chunk);

  switch (spec.biome) {
    case 'ruins': {
      // Carved stone block with a ledge.
      box(chunk, solid(0xb49f78), [W * 0.98, 1.2, D * 0.98], [0, 0.6, 0]);
      box(chunk, solid(0xcdb992), [W * 1.02, 0.25, D * 1.02], [0, 1.25, 0]);
      break;
    }
    case 'industrial': {
      // Steel container chunk with hazard stripes.
      box(chunk, solid(0x6f7d88), [W, 1.2, D], [0, 0.6, 0]);
      hazardFaces(chunk, W * 0.94, 0.38, [0, 0.6, 0], D);
      break;
    }
    case 'abyss': {
      // Dark rock with glowing crystal tips.
      rockCluster(chunk, solid(0x2c2a44), W, D, rng);
      for (let i = 0; i < 2; i++) {
        const x = rng.range(-hw, hw) * 0.6;
        blob(chunk, glow(0x42e6ff, 1.2), [0.18, 0.28, 0.18], [x, 1.2, rng.range(-0.3, 0.3) * D], 0);
      }
      break;
    }
    default:
      // Cavern and sewer: a cluster of rocks.
      rockCluster(chunk, solid(0x8e7d68), W, D, rng);
  }

  const shadowG = new THREE.Group();
  shadowG.position.y = 0.02;
  root.add(shadowG);
  add(shadowG, geo.disc(28), decal(0x000000, 0.45), [0, 0, 0], [-PI / 2, 0, 0]);
  add(shadowG, geo.ring(32), glow(0xff7a1a, 1.2), [0, 0.01, 0], [-PI / 2, 0, 0]);

  const anim: AnimHook = (st) => {
    const f = st.fall;
    chunk.position.y = (1 - f) * (1 - f) * 14;
    chunk.rotation.y = (1 - f) * 1.5;
    const k = 0.4 + 0.6 * f;
    shadowG.scale.set(hw * k, 1, (D / 2) * k);
  };
  anim({ time: 0, fall: 0, offset: 0 });
  root.userData.anim = anim;
  return root;
}

// ------------------------------------------------------------------ slider

const SLIDER_PALETTE: Record<BiomeId, { body: number; accent: number; hazard: boolean }> = {
  sewer: { body: 0x7a4b2c, accent: 0xffb020, hazard: true },
  industrial: { body: 0x66727e, accent: 0xffb020, hazard: true },
  cavern: { body: 0x8b7a66, accent: 0xff9a4a, hazard: false },
  ruins: { body: 0xb49f78, accent: 0xffa040, hazard: false },
  abyss: { body: 0x231f38, accent: 0x42e6ff, hazard: false },
};

/** Heavy sliding block on trucks. The manager moves the whole object laterally. */
export function buildSlider(spec: ObstacleSpec, _rng: RNG): THREE.Group {
  const g = new THREE.Group();
  const W = widthOf(spec), D = depthOf(spec);
  const pal = SLIDER_PALETTE[spec.biome];
  const body = solid(pal.body);
  const wheel = solid(0x2a2a2a);
  const accent = glow(pal.accent, 1.3);

  box(g, body, [W, 1.2, D], [0, 0.9, 0]); // y 0.3 .. 1.5
  for (const x of W > 2.2 ? [-W / 2 + 0.35, 0, W / 2 - 0.35] : [-W / 2 + 0.35, W / 2 - 0.35]) {
    for (const z of [-D * 0.35, D * 0.35]) cyl(g, wheel, 0.16, 0.14, [x, 0.16, z], [0, 0, PI / 2], 8);
  }
  if (pal.hazard) hazardFaces(g, W * 0.94, 0.42, [0, 0.95, 0], D);
  if (spec.biome === 'abyss') {
    for (const y of [0.6, 1.25]) {
      box(g, accent, [W * 0.9, 0.04, 0.03], [0, y, D / 2 + 0.01]);
      box(g, accent, [W * 0.9, 0.04, 0.03], [0, y, -D / 2 - 0.01]);
    }
  }
  if (spec.biome === 'ruins') {
    box(g, accent, [W * 0.7, 0.08, 0.04], [0, 1.45, D / 2 + 0.01]);
  }
  if (spec.biome === 'cavern') {
    box(g, solid(0x6e6054), [W * 1.04, 0.2, D * 1.04], [0, 1.6, 0]);
  }
  box(g, accent, [W * 0.8, 0.06, 0.06], [0, 1.52, D / 2 + 0.01]);
  return g;
}

// ------------------------------------------------------------------ swinger

/**
 * Pendulum block hanging on chains from a ceiling bar. The manager moves the whole object laterally,
 * so the bottom mass stays at the collider position.
 */
export function buildSwinger(spec: ObstacleSpec, _rng: RNG): THREE.Group {
  const g = new THREE.Group();
  const W = widthOf(spec), D = depthOf(spec);
  const abyss = spec.biome === 'abyss';
  const body = solid(abyss ? 0x231f38 : 0x9a9182);
  const iron = solid(abyss ? 0x2a2f3a : 0x4a4f57);
  const seam = glow(abyss ? 0x42e6ff : 0xff8a2a, 1.4);

  const beamBottom = 0.5, beamTop = 1.8;
  box(g, body, [W, beamTop - beamBottom, D], [0, (beamTop + beamBottom) / 2, 0]);
  for (const x of [-W / 2 + 0.4, W / 2 - 0.4]) box(g, iron, [0.16, beamTop - beamBottom + 0.1, D * 1.04], [x, 1.15, 0]);
  box(g, seam, [W * 0.9, 0.06, 0.04], [0, 1.15, D / 2 + 0.01]);
  box(g, seam, [W * 0.9, 0.06, 0.04], [0, 1.15, -D / 2 - 0.01]);

  const chainTop = 6.4;
  const xs = [-W / 2 + 0.25, W / 2 - 0.25];
  const extra = Math.max(0, Math.floor(W / 2.2) - 1);
  for (let i = 1; i <= extra; i++) xs.push(-W / 2 + (W * i) / (extra + 1));
  for (const x of xs) cyl(g, iron, 0.05, chainTop - beamTop, [x, (beamTop + chainTop) / 2, 0], [0, 0, 0], 4);
  box(g, iron, [W + 0.6, 0.3, D + 0.3], [0, chainTop + 0.15, 0]);
  return g;
}

// ------------------------------------------------------------------ debris

const DEBRIS_CAP = 26;

/** Scatter of debris; the look depends on the biome (planks, scrap, rocks, bricks, shards). */
export function buildDebris(spec: ObstacleSpec, rng: RNG): THREE.Group {
  const g = new THREE.Group();
  const W = widthOf(spec), D = depthOf(spec);
  const n = Math.min(DEBRIS_CAP, Math.max(8, Math.round(W * D * 3)));
  const spots = moundSpots(rng, W, D, n, 1.25, 0.4);
  const rockM = solid(0x8e7d68);
  const shardM = mat(0x2b2540, 0x4a2a80, 0.6);
  for (const p of spots) {
    const rot: V3 = [rng.range(-0.35, 0.35), rng.range(0, PI * 2), rng.range(-0.35, 0.35)];
    switch (spec.biome) {
      case 'sewer':
        box(g, solid(rng.chance(0.5) ? 0x7a5232 : 0x5b3b24), [rng.range(0.9, 1.5), 0.1, 0.24], p, rot);
        break;
      case 'industrial':
        box(g, solid(rng.chance(0.2) ? 0xf0b81c : 0x8c959e), [rng.range(0.6, 1.1), 0.05, rng.range(0.35, 0.6)], p, rot);
        break;
      case 'cavern': {
        const s = rng.range(0.25, 0.5);
        rock(g, rockM, [s, s * 0.8, s], p, rng.int(0, 5), 0, rot);
        break;
      }
      case 'ruins':
        box(g, solid(0xb29c76), [0.5, 0.25, 0.25], p, rot);
        break;
      case 'abyss': {
        const h = rng.range(0.6, 1.0);
        taper(g, shardM, 0.12, h, 0, [p[0], Math.max(h / 2, p[1]), p[2]], rot, 3);
        break;
      }
    }
  }
  return g;
}

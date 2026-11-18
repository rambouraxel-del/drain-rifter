import * as THREE from 'three';
import type { ObstacleKind, ObstacleSpec } from '../core/types';
import { RNG } from '../core/rng';
import type { Builder } from './props/common';
import { buildBarrier, buildCrate, buildGrate, buildPipe } from './props/sewer';
import { buildBeam, buildFan, buildPiston, buildSaw } from './props/industrial';
import { buildBoulder, buildRock, buildRoot, buildStalagmite } from './props/cavern';
import { buildPillar, buildRubble, buildStatue } from './props/ruins';
import { buildCrystal, buildOrb, buildShard } from './props/abyss';
import { buildDebris, buildFalling, buildSlider, buildSwinger } from './props/generic';

/**
 * CONTRACT: build the visual for an obstacle in its LOCAL frame:
 *   +x = track right (u), +y = surface up, -z = forward (direction of travel).
 *   The origin sits on the sliding surface at the obstacle centre (s, u).
 *   Visual footprint must match the collider: |x| <= spec.halfWidth, |z| <= spec.depth/2
 *   (decorative bits may exceed slightly but never visually LESS than the collider).
 * Moving parts that should animate must be exposed via userData.anim(t: number, state) — see ObstacleManager.
 * Shared geometries/materials must set userData.shared = true so they are not disposed.
 */
export type ObstacleMeshFactory = (spec: ObstacleSpec) => THREE.Object3D;

/** One builder per kind. Biome-dependent looks are chosen inside each builder from spec.biome. */
const BUILDERS: Record<ObstacleKind, Builder> = {
  rock: buildRock,
  debris: buildDebris,
  pipe: buildPipe,
  barrier: buildBarrier,
  crate: buildCrate,
  grate: buildGrate,
  fan: buildFan,
  piston: buildPiston,
  beam: buildBeam,
  saw: buildSaw,
  stalagmite: buildStalagmite,
  boulder: buildBoulder,
  root: buildRoot,
  pillar: buildPillar,
  statue: buildStatue,
  rubble: buildRubble,
  crystal: buildCrystal,
  shard: buildShard,
  orb: buildOrb,
  falling: buildFalling,
  swinger: buildSwinger,
  slider: buildSlider,
};

/** Builds the visual of an obstacle in its local frame (see the CONTRACT above). Deterministic per spec.seed. */
export const createObstacleMesh: ObstacleMeshFactory = (spec) => {
  const build = BUILDERS[spec.kind];
  const obj = build ? build(spec, new RNG(spec.seed)) : fallbackBox(spec);
  obj.name = `obstacle:${spec.kind}`;
  return obj;
};

/** Safety net for an unknown kind (should not happen with the typed table). */
function fallbackBox(spec: ObstacleSpec): THREE.Group {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(spec.halfWidth * 2, 1.3, spec.depth),
    new THREE.MeshLambertMaterial({ color: 0xc8a040, flatShading: true }),
  );
  mesh.position.y = 0.65;
  mesh.userData.shared = false;
  g.add(mesh);
  return g;
}

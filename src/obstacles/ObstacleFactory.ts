import * as THREE from 'three';
import type { ObstacleSpec } from '../core/types';

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

const mats = new Map<number, THREE.MeshLambertMaterial>();
function mat(color: number): THREE.MeshLambertMaterial {
  let m = mats.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    m.userData.shared = true;
    mats.set(color, m);
  }
  return m;
}

/** Placeholder factory: coloured boxes. Replaced by the Props agent. */
export const createObstacleMesh: ObstacleMeshFactory = (spec) => {
  const g = new THREE.Group();
  const h = 1.3;
  const box = new THREE.Mesh(new THREE.BoxGeometry(spec.halfWidth * 2, h, spec.depth), mat(0xc8a040));
  box.position.y = h / 2;
  g.add(box);
  return g;
};

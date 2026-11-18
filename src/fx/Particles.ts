import * as THREE from 'three';
import type { BiomeId, SpineFrame } from '../core/types';

export interface ParticleContext {
  /** Player world position (on the surface). */
  playerPos: THREE.Vector3;
  frame: SpineFrame;
  speed: number;
  lateral: number;
  biome: BiomeId;
  playing: boolean;
}

/**
 * CONTRACT (Integration/FX agent owns): cheap pooled particles (Points / instanced quads):
 * slide spray (water/dust per biome) behind the hand & body, ambient motes / drips / embers
 * around the camera per biome, and bursts on crash. Budget scaled by quality.particles.
 */
export class Particles {
  readonly root = new THREE.Group();
  constructor(_budget: number) {}
  update(_dt: number, _ctx: ParticleContext): void {}
  burst(_pos: THREE.Vector3, _color: number, _count = 40): void {}
  reset(): void {}
}

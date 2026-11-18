import type * as THREE from 'three';
import type { Character } from '../player/Character';
import type { Spine } from '../track/Spine';

/**
 * CONTRACT (UI/UX agent owns): short (~5-6 s) cinematic: the character falls through a
 * manhole from a night street into the sewer, then lands at s=0 on the track and starts sliding.
 * While active it fully drives the camera and the character root transform.
 * update() returns true once finished; the Game then hands control to gameplay at s=0.
 * Everything it adds to the scene must be removed in dispose().
 */
export class IntroCinematic {
  private t = 0;
  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private character: Character, private spine: Spine) {}
  start(): void { this.t = 0; }
  update(dt: number): boolean { this.t += dt; return this.t > 0.1; }
  skip(): void { this.t = 1e9; }
  dispose(): void {}
}

import * as THREE from 'three';

/** Animation inputs, updated every frame by the Game. */
export interface CharacterPose {
  /** -1..1 lateral lean (from lateral velocity). */
  lean: number;
  /** Forward speed m/s. */
  speed: number;
  /** Seconds since start. */
  time: number;
  /** Surface tilt (radians) at the player's lateral position (+ = surface rising to the right). */
  tilt: number;
  /** Player is grinding against the wall limit. */
  scraping: boolean;
}

/**
 * CONTRACT: `root` is placed by the Game on the sliding surface, oriented with
 *   +x = track right, +y = surface normal, -z = direction of travel.
 * The character slides seated on its backside, slightly reclined, legs forward (-z),
 * one hand touching the ground. update() animates procedurally. crash() plays the
 * collision reaction (driven by update afterwards); reset() restores the slide pose.
 * Placeholder — replaced by the Gameplay agent's full character.
 */
export class Character {
  readonly root = new THREE.Group();
  private body: THREE.Mesh;
  private crashT = -1;

  constructor() {
    const m = new THREE.MeshLambertMaterial({ color: 0xb03030, flatShading: true });
    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.7, 4, 8), m);
    this.body.rotation.x = -1.2;
    this.body.position.set(0, 0.4, 0);
    this.root.add(this.body);
  }

  update(dt: number, pose: CharacterPose): void {
    if (this.crashT >= 0) {
      this.crashT += dt;
      this.body.rotation.z += dt * 8;
      return;
    }
    this.body.rotation.z = -pose.lean * 0.5;
  }

  crash(): void { this.crashT = 0; }
  reset(): void { this.crashT = -1; this.body.rotation.z = 0; }
}

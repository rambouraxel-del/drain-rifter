import * as THREE from 'three';

/**
 * Subtle 3D speed streaks around the view axis. Attach to the camera:
 *   camera.add(speedLines.root); speedLines.update(dt, k)  // k = 0..1 normalised speed
 * 28 line segments, one draw call, no allocations.
 */
export class SpeedLines {
  readonly root: THREE.LineSegments;
  private static N = 28;
  private pos = new Float32Array(SpeedLines.N * 6);
  private col = new Float32Array(SpeedLines.N * 6);
  private ang = new Float32Array(SpeedLines.N);
  private rad = new Float32Array(SpeedLines.N);
  private z = new Float32Array(SpeedLines.N);
  private geo = new THREE.BufferGeometry();
  private mat: THREE.LineBasicMaterial;
  private tint = new THREE.Color(0xcfe8ff);

  constructor() {
    const N = SpeedLines.N;
    for (let i = 0; i < N; i++) this.respawn(i, true);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false });
    this.root = new THREE.LineSegments(this.geo, this.mat);
    this.root.frustumCulled = false;
    this.root.renderOrder = 10;
    this.root.visible = false;
  }

  setTint(hex: number): void { this.tint.setHex(hex); }

  private respawn(i: number, init: boolean): void {
    this.ang[i] = Math.random() * Math.PI * 2;
    this.rad[i] = 0.9 + Math.random() * 1.8;
    this.z[i] = init ? -1.5 - Math.random() * 14 : -15;
  }

  update(dt: number, k: number): void {
    const on = k > 0.25;
    this.root.visible = on;
    if (!on) return;
    const N = SpeedLines.N;
    const v = 18 + k * 40;
    const len = 0.8 + k * 3.2;
    const a = Math.min(1, (k - 0.25) / 0.6) * 0.45;
    for (let i = 0; i < N; i++) {
      let z = this.z[i] + v * dt;
      if (z > -1.2) { this.respawn(i, false); z = this.z[i]; }
      this.z[i] = z;
      const x = Math.cos(this.ang[i]) * this.rad[i] * (1 + (z + 1.2) * -0.05);
      const y = Math.sin(this.ang[i]) * this.rad[i] * (1 + (z + 1.2) * -0.05);
      const j = i * 6;
      this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z;
      this.pos[j + 3] = x; this.pos[j + 4] = y; this.pos[j + 5] = Math.max(-40, z - len);
      const fade = a * Math.min(1, (z + 15) / 6) * Math.min(1, (-1.2 - z) / 2);
      this.col[j] = this.tint.r * fade; this.col[j + 1] = this.tint.g * fade; this.col[j + 2] = this.tint.b * fade;
      this.col[j + 3] = 0; this.col[j + 4] = 0; this.col[j + 5] = 0; // tail fades to black (additive)
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void { this.geo.dispose(); this.mat.dispose(); }
}

import * as THREE from 'three';
import type { Character } from '../player/Character';
import { makeFrame, type Spine } from '../track/Spine';
import { CONFIG } from '../core/config';

/**
 * CONTRACT (UI/UX agent owns): short (~5.6 s) cinematic: the character slips on a night street,
 * falls through an open manhole down a vertical shaft, then lands at s=0 on the track.
 * While active it fully drives the camera and the character root transform.
 * update() returns true once finished; the Game then hands control to gameplay at s=0.
 * The final camera / character transform match the gameplay camera exactly (see finalCamera()).
 * Everything it adds to the scene is removed in dispose().
 */

const H = 56; // street height above the tunnel start (m)
const T_A = 2.0; // street slide ends
const T_B = 2.8; // tip over the hole ends -> free fall
const T_LAND = 4.5; // impact at s=0
const T_END = 5.6;
const HOLE_R = 1.2;
const SHAFT_R = 2.3;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, t: number) => { const x = clamp01((t - a) / (b - a)); return x * x * (3 - 2 * x); };
const UP = new THREE.Vector3(0, 1, 0);

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class IntroCinematic {
  private t = 0;
  private root = new THREE.Group();
  private street = new THREE.Group();
  private shaft = new THREE.Group();
  private sky = new THREE.Group();
  private light = new THREE.PointLight(0xffb060, 0, 34, 1.6);
  private glowTex = glowTexture();
  private fadeMats: Array<THREE.Material & { opacity: number }> = [];
  private steam: THREE.Sprite[] = [];
  private splash = new THREE.Group();
  private ring!: THREE.Mesh;
  private drops!: THREE.InstancedMesh;
  private dropState: Array<{ p: THREE.Vector3; v: THREE.Vector3 }> = [];
  private splashed = false;
  private disposed = false;

  private fr = makeFrame();
  private fr2 = makeFrame();
  private qTrack = new THREE.Quaternion();
  private qFall = new THREE.Quaternion();
  private eul = new THREE.Euler();
  private m = new THREE.Matrix4();
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camUp = new THREE.Vector3(0, 1, 0);
  private fin = { pos: new THREE.Vector3(), look: new THREE.Vector3(), up: new THREE.Vector3(), fov: 70 };
  private origFov = 0;
  private dummy = new THREE.Object3D();

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private character: Character, private spine: Spine) {
    this.buildSky();
    this.buildStreet();
    this.buildShaft();
    this.buildSplash();
    this.root.add(this.sky, this.street, this.shaft, this.splash, this.light);
    this.scene.add(this.root);
  }

  /* ---------------- scene construction ---------------- */

  private mat(color: number, extra: Partial<THREE.MeshLambertMaterialParameters> = {}): THREE.MeshLambertMaterial {
    return new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
  }
  private basic(color: number, extra: Partial<THREE.MeshBasicMaterialParameters> = {}): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ color, ...extra });
  }
  private box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.street): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  private buildSky(): void {
    const g = new THREE.SphereGeometry(300, 20, 10);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const hor = new THREE.Color(0x1d2a38), top = new THREE.Color(0x04060b), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const k = clamp01(pos.getY(i) / 300 + 0.1);
      c.copy(hor).lerp(top, Math.pow(k, 0.6));
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const dome = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    dome.renderOrder = -2;
    // Stars
    const n = 220;
    const sp = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = 0.12 + Math.random() * 1.3;
      sp.set([Math.cos(a) * Math.cos(e) * 280, Math.sin(e) * 280, Math.sin(a) * Math.cos(e) * 280], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.8, sizeAttenuation: false, fog: false, depthWrite: false }));
    stars.renderOrder = -1;
    const moon = new THREE.Mesh(new THREE.SphereGeometry(9, 14, 10), this.basic(0xe6eeff, { fog: false }));
    moon.position.set(-90, 110, -170);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0x7f9fd0, transparent: true, opacity: 0.5, fog: false, depthWrite: false }));
    halo.scale.set(70, 70, 1);
    halo.position.copy(moon.position);
    this.sky.add(dome, stars, moon, halo);
    this.sky.position.y = H;
  }

  private buildStreet(): void {
    const S = this.street;
    S.position.y = H;
    // Road with a manhole-shaped hole.
    const shape = new THREE.Shape();
    shape.moveTo(-5, -22); shape.lineTo(5, -22); shape.lineTo(5, 22); shape.lineTo(-5, 22); shape.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 0, HOLE_R, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const roadGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false, curveSegments: 24 });
    const road = new THREE.Mesh(roadGeo, this.mat(0x2d3033));
    road.rotation.x = -Math.PI / 2;
    road.position.y = -0.5;
    S.add(road);
    // Sidewalks + curbs
    const walk = this.mat(0x4a4d4e), curb = this.mat(0x7a7d7c);
    for (const sx of [-1, 1]) {
      this.box(6, 0.6, 44, walk, sx * 8.2, -0.12, 0);
      this.box(0.35, 0.62, 44, curb, sx * 5.17, -0.11, 0);
    }
    // Centre line dashes
    const dash = this.basic(0x8a7d48);
    for (let z = -20; z <= 20; z += 5) if (Math.abs(z) > 2.5) this.box(0.16, 0.012, 2.2, dash, 0, 0.007, z);
    // Manhole rim + displaced cover
    const rim = new THREE.Mesh(new THREE.RingGeometry(HOLE_R, HOLE_R + 0.28, 32), this.mat(0x4a4e50, { side: THREE.DoubleSide }));
    rim.rotation.x = -Math.PI / 2; rim.position.y = 0.014;
    S.add(rim);
    const cover = new THREE.Group();
    const cb = new THREE.Mesh(new THREE.CylinderGeometry(1.34, 1.34, 0.1, 24), this.mat(0x36393b));
    const ci = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.13, 24), this.mat(0x4a4d50));
    cover.add(cb, ci);
    for (let i = 0; i < 3; i++) { const bar = this.box(1.9, 0.14, 0.09, this.mat(0x23262a), 0, 0, (i - 1) * 0.38, cover); bar.rotation.y = 0.5; }
    cover.position.set(-2.6, 0.07, 3.4);
    cover.rotation.set(0.0, 0.4, -0.08);
    S.add(cover);
    // Street lamp
    const metal = this.mat(0x23282b);
    this.box(0.18, 6.2, 0.18, metal, -4.7, 3.0, -2.6);
    this.box(0.5, 0.5, 0.5, metal, -4.7, 0.25, -2.6);
    this.box(2.0, 0.12, 0.12, metal, -3.7, 6.05, -2.6);
    this.box(0.95, 0.16, 0.5, metal, -2.8, 6.02, -2.6);
    const bulb = this.box(0.7, 0.1, 0.34, this.basic(0xffd69a), -2.8, 5.92, -2.6);
    bulb.name = 'bulb';
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffa94a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    glow.scale.set(5.5, 5.5, 1);
    glow.position.set(-2.8, 5.85, -2.6);
    S.add(glow);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), new THREE.MeshBasicMaterial({ map: this.glowTex, color: 0xff9a3c, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(-2.4, 0.03, -1.0);
    S.add(pool);
    // Buildings with a few lit windows
    const bm = this.mat(0x151a1e);
    const win = this.basic(0xffc572, { fog: false });
    const wins: Array<[number, number, number, number]> = [];
    const defs: Array<[number, number, number, number]> = [[-1, 13, 24, -14], [-1, 14, 32, 6], [-1, 12, 20, 24], [1, 13, 28, -8], [1, 12, 22, 12], [1, 14, 34, 30]];
    for (const [sx, w, h, z] of defs) {
      const d = 16;
      const cx = sx * (11 + w / 2);
      this.box(w, h, d, bm, cx, h / 2 - 0.3, z);
      const fx = sx * 11 - sx * 0.02;
      for (let wy = 3; wy < h - 2; wy += 3.4) for (let wz = -d / 2 + 2; wz < d / 2 - 1; wz += 3.2) if (Math.random() < 0.28) wins.push([fx, wy, z + wz, sx]);
    }
    const wm = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.5, 1.8), win, wins.length);
    wins.forEach(([x, y, z, sx], i) => {
      this.dummy.position.set(x, y, z);
      this.dummy.rotation.set(0, sx < 0 ? Math.PI / 2 : -Math.PI / 2, 0);
      this.dummy.scale.setScalar(0.7 + Math.random() * 0.4);
      this.dummy.updateMatrix();
      wm.setMatrixAt(i, this.dummy.matrix);
    });
    S.add(wm);
    // Steam rising from the hole
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0x9fb4b0, transparent: true, opacity: 0, depthWrite: false }));
      sp.userData.ph = i / 6;
      S.add(sp);
      this.steam.push(sp);
    }
    this.light.position.set(-2.8, H + 5.4, -2.6);
  }

  private buildShaft(): void {
    const S = this.shaft;
    const reg = <M extends THREE.Material & { opacity: number }>(m: M): M => { m.transparent = true; this.fadeMats.push(m); return m; };
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(SHAFT_R, SHAFT_R, H + 1, 14, 1, true),
      reg(new THREE.MeshLambertMaterial({ color: 0x3a4640, flatShading: true, side: THREE.BackSide })),
    );
    wall.position.y = (H + 1) / 2 - 1;
    S.add(wall);
    // Bands every few metres (give a sense of speed while falling)
    const bandM = reg(new THREE.MeshLambertMaterial({ color: 0x1f2825, flatShading: true }));
    const bandGeo = new THREE.CylinderGeometry(SHAFT_R - 0.04, SHAFT_R - 0.04, 0.35, 14, 1, true);
    const bands = new THREE.InstancedMesh(bandGeo, bandM, 14);
    bandM.side = THREE.BackSide;
    for (let i = 0; i < 14; i++) { this.dummy.position.set(0, 4 + i * 4, 0); this.dummy.rotation.set(0, 0, 0); this.dummy.scale.setScalar(1); this.dummy.updateMatrix(); bands.setMatrixAt(i, this.dummy.matrix); }
    S.add(bands);
    // Ladder
    const rust = reg(new THREE.MeshLambertMaterial({ color: 0x7a4e2c, flatShading: true }));
    const n = Math.floor(H / 0.7);
    const rungs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.06, 0.9), rust, n);
    for (let i = 0; i < n; i++) { this.dummy.position.set(SHAFT_R - 0.12, 0.5 + i * 0.7, 0); this.dummy.updateMatrix(); rungs.setMatrixAt(i, this.dummy.matrix); }
    S.add(rungs);
    for (const z of [-0.45, 0.45]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, H, 0.08), rust);
      rail.position.set(SHAFT_R - 0.1, H / 2, z);
      S.add(rail);
    }
    // Amber caged lamps spiralling down
    const lampM = reg(new THREE.MeshBasicMaterial({ color: 0xffb347 }));
    const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.4, 0.28), lampM, 7);
    for (let i = 0; i < 7; i++) {
      const a = 2.4 + i * 1.9;
      this.dummy.position.set(Math.cos(a) * (SHAFT_R - 0.2), 6 + i * 7.5, Math.sin(a) * (SHAFT_R - 0.2));
      this.dummy.updateMatrix();
      lamps.setMatrixAt(i, this.dummy.matrix);
    }
    S.add(lamps);
  }

  private buildSplash(): void {
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 28), new THREE.MeshBasicMaterial({ color: 0xcfeee6, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.05;
    const n = 22;
    this.drops = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.09, 0), new THREE.MeshBasicMaterial({ color: 0xcfeee6 }), n);
    this.drops.count = 0;
    this.drops.frustumCulled = false;
    this.splash.add(this.ring, this.drops);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 3, up = 3 + Math.random() * 5;
      this.dropState.push({ p: new THREE.Vector3(Math.cos(a) * 0.4, 0.3, Math.sin(a) * 0.4), v: new THREE.Vector3(Math.cos(a) * r, up, Math.sin(a) * r) });
    }
  }

  /* ---------------- public API ---------------- */

  start(): void {
    this.t = 0;
    this.character.reset();
    this.origFov = this.camera.fov;
    this.computeFinal();
    this.splash.visible = false;
    this.apply(0);
  }

  update(dt: number): boolean {
    if (this.disposed) return true;
    this.t = Math.min(T_END, this.t + dt);
    this.apply(dt);
    return this.t >= T_END;
  }

  skip(): void { this.t = T_END; }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.remove(this.root);
    const mats = new Set<THREE.Material>();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mm = m.material as THREE.Material | THREE.Material[] | undefined;
      if (mm) (Array.isArray(mm) ? mm : [mm]).forEach((x) => mats.add(x));
      if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
    });
    mats.forEach((m) => m.dispose());
    this.glowTex.dispose();
    this.light.dispose();
    this.character.root.scale.set(1, 1, 1);
    this.camera.up.copy(this.fin.up);
  }

  /* ---------------- animation ---------------- */

  /** Gameplay camera at s=0 (mirrors Game.updateCamera with lateral = 0). */
  private computeFinal(): void {
    const C = CONFIG.camera;
    const sp = this.spine;
    sp.frame(Math.max(sp.start, 0 - C.distance), this.fr);
    this.fin.pos.copy(this.fr.pos).addScaledVector(this.fr.up, C.height);
    sp.frame(0 + C.lookAhead, this.fr2);
    this.fin.look.copy(this.fr2.pos).addScaledVector(this.fr2.up, 0.6);
    sp.frame(0, this.fr);
    this.fin.up.copy(this.fr.up);
    const aspect = this.camera.aspect;
    this.fin.fov = C.fovBase + (aspect < 1 ? (1 - aspect) * 18 : 0);
    // Character pose on the track at s=0 (u = 0): basis right/up/back.
    const f = this.fr;
    this.m.makeBasis(f.right, f.up, this.v1.copy(f.fwd).negate());
    this.qTrack.setFromRotationMatrix(this.m);
  }

  private apply(dt: number): void {
    const t = this.t;
    const root = this.character.root;
    const f = this.fr;
    this.spine.frame(0, f);

    // ---- character ----
    let cy: number; // world y of the character
    let cz = 0;
    if (t < T_A) {
      const k = t / T_A;
      cz = 6.6 - 5.2 * (1 - (1 - k) * (1 - k));
      cy = H;
      this.eul.set(0.06 * Math.sin(t * 3.1), 0, 0.05 * Math.sin(t * 5.3), 'YXZ');
      root.position.set(0, cy, cz);
      root.quaternion.setFromEuler(this.eul);
    } else if (t < T_B) {
      const k = (t - T_A) / (T_B - T_A);
      const e = k * k;
      cz = 1.4 * (1 - smooth(0, 1, k)) ;
      cy = H - 0.9 * e;
      this.eul.set(-1.05 * e, 0, 0.18 * Math.sin(k * 5) * k, 'YXZ');
      root.position.set(0, cy, cz);
      root.quaternion.setFromEuler(this.eul);
    } else {
      const k = Math.min(1, (t - T_B) / (T_LAND - T_B));
      cy = (H - 0.9) * (1 - k * k);
      const spin = k * 3.2;
      this.eul.set(-1.05 - 0.35 * Math.sin(k * 6), spin, 0.25 * Math.sin(k * 9), 'YXZ');
      this.qFall.setFromEuler(this.eul);
      const b = smooth(0.84, 1, k);
      this.qFall.slerp(this.qTrack, b);
      root.quaternion.copy(this.qFall);
      root.position.set(0, cy, 0);
      if (k >= 1) root.position.copy(f.pos);
    }
    // Landing squash
    const since = t - T_LAND;
    if (since >= 0) {
      root.position.copy(f.pos);
      root.quaternion.copy(this.qTrack);
      const b = Math.exp(-since * 9) * Math.cos(since * 22);
      root.scale.set(1 + 0.12 * b, 1 - 0.22 * b, 1 + 0.12 * b);
    } else root.scale.set(1, 1, 1);
    this.character.update(dt, { lean: 0, speed: 6, time: t, tilt: 0, scraping: false });
    if (t >= T_END) { root.position.copy(f.pos); root.quaternion.copy(this.qTrack); root.scale.set(1, 1, 1); }

    // ---- lights / visibility ----
    const lampPos = this.v1.set(-2.8, H + 5.4, -2.6);
    const follow = smooth(T_A, T_B, t);
    this.light.position.lerpVectors(lampPos, this.v2.set(0, cy + 2.2, 0.3), follow);
    this.light.intensity = 110 - 40 * follow;
    this.light.color.setHex(follow > 0.5 ? 0xffc98a : 0xffb060);
    this.street.visible = t < 3.6;
    this.sky.visible = t < 3.6;
    const op = 1 - smooth(4.35, 5.2, t);
    for (const m of this.fadeMats) m.opacity = op;
    this.shaft.visible = op > 0.01;
    // Steam
    for (const sp of this.steam) {
      const ph = (sp.userData.ph + t * 0.18) % 1;
      sp.position.set(Math.sin(ph * 9 + sp.userData.ph * 20) * 0.4, H + 0.2 + ph * 3.6, Math.cos(ph * 7 + sp.userData.ph * 11) * 0.4);
      sp.scale.setScalar(1.2 + ph * 3);
      (sp.material as THREE.SpriteMaterial).opacity = Math.sin(ph * Math.PI) * 0.22;
    }

    // ---- splash ----
    if (since >= 0) {
      if (!this.splashed) {
        this.splashed = true;
        this.splash.visible = true;
        this.splash.position.copy(f.pos);
        this.splash.quaternion.copy(this.qTrack);
        this.drops.count = this.dropState.length;
      }
      const ss = since;
      this.ring.scale.setScalar(1 + ss * 5);
      (this.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 - ss * 1.1);
      this.dropState.forEach((d, i) => {
        const p = d.p;
        p.set(d.v.x * ss, Math.max(0.05, 0.3 + d.v.y * ss - 7 * ss * ss), d.v.z * ss);
        this.dummy.position.copy(p);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.setScalar(Math.max(0.01, 1 - ss * 0.9));
        this.dummy.updateMatrix();
        this.drops.setMatrixAt(i, this.dummy.matrix);
      });
      this.drops.instanceMatrix.needsUpdate = true;
    }

    // ---- camera ----
    this.placeCamera(cy, cz, t);
    const cam = this.camera;
    cam.position.copy(this.camPos);
    cam.up.copy(this.camUp).normalize();
    cam.lookAt(this.camLook);
    const fovBoost = 10 * smooth(2.3, 3.2, t) * (1 - smooth(4.3, 5.3, t));
    const fov = this.fin.fov + fovBoost;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }

  private placeCamera(cy: number, cz: number, t: number): void {
    const P = this.camPos, L = this.camLook, U = this.camUp;
    const camA = (tt: number, out: THREE.Vector3) => { const k = clamp01(tt / T_A); return out.set(4.6 - 1.0 * k, H + 2.1 - 0.5 * k, 7.6 - 3.4 * k); };
    const lookA = (z: number, out: THREE.Vector3) => out.set(-0.8, H + 1.3, z * 0.5 - 0.3);
    if (t < T_A) {
      camA(t, P);
      lookA(cz, L);
      U.set(0, 1, 0);
    } else if (t < T_B) {
      const e = smooth(T_A, T_B, t);
      camA(T_A, P);
      const top = this.v1.set(0, cy + 3.4, 0.1);
      P.lerp(top, e);
      lookA(1.4, L);
      L.lerp(this.v2.set(0, cy - 4, -0.3), e);
      U.lerpVectors(UP, this.v2.set(0, 0, -1), e);
    } else {
      const k = (t - T_B) / (T_LAND - T_B);
      const trail = 3.4 + 2.2 * smooth(0.3, 1, Math.min(1, k)) ;
      P.set(0, cy + trail, 0.1);
      L.set(0, cy - 4, -0.3);
      U.set(0, 0, -1);
      // Blend to the gameplay camera.
      const b = smooth(T_LAND - 0.35, T_END, t);
      if (b > 0) {
        const dip = t > T_LAND ? -0.22 * Math.exp(-(t - T_LAND) * 7) * Math.cos((t - T_LAND) * 24) : 0;
        P.lerp(this.fin.pos, b);
        P.y += dip;
        L.lerp(this.fin.look, b);
        U.lerp(this.fin.up, b);
      }
    }
    if (t >= T_END) { P.copy(this.fin.pos); L.copy(this.fin.look); U.copy(this.fin.up); }
  }
}

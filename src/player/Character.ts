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
 *
 * Skeleton (all procedural, shared cached geometry/materials, < 3k triangles):
 *   root > rig > hips > torso > (head, shoulderL > armL > foreL, shoulderR > armR > foreR, pack)
 *                 hips > legL > shinL, legR > shinR
 */

const shared = <T extends { userData: Record<string, unknown> }>(o: T): T => { o.userData.shared = true; return o; };
const mat = (c: number) => shared(new THREE.MeshLambertMaterial({ color: c, flatShading: true }));

let M: Record<'hoodie' | 'hoodieDark' | 'pants' | 'skin' | 'hair' | 'sneaker' | 'sole' | 'pack' | 'strap' | 'glove', THREE.MeshLambertMaterial> | null = null;
const geoCache = new Map<string, THREE.BufferGeometry>();
function materials() {
  if (!M) {
    M = {
      hoodie: mat(0xb8312f), hoodieDark: mat(0x8a2222), pants: mat(0x2b2d33), skin: mat(0xe0a47c),
      hair: mat(0x4a2c1c), sneaker: mat(0x6a6d74), sole: mat(0xe8e6dc), pack: mat(0x6b7040),
      strap: mat(0x2c2f20), glove: mat(0x1d1d22),
    };
  }
  return M;
}
function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) { g = shared(make()); geoCache.set(key, g); }
  return g;
}
function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const me = new THREE.Mesh(geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), m);
  me.position.set(x, y, z);
  return me;
}
function limb(r0: number, r1: number, len: number, m: THREE.Material, y0 = 0): THREE.Mesh {
  // tapered 6-sided prism hanging along -y from y0
  const me = new THREE.Mesh(geo(`c${r0},${r1},${len}`, () => new THREE.CylinderGeometry(r0, r1, len, 6, 1)), m);
  me.position.y = y0 - len / 2;
  return me;
}
function group(x = 0, y = 0, z = 0, parent?: THREE.Object3D): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent?.add(g);
  return g;
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Arm { shoulder: THREE.Group; elbow: THREE.Group; side: 1 | -1 }
interface Leg { hip: THREE.Group; knee: THREE.Group; side: 1 | -1 }

export class Character {
  readonly root = new THREE.Group();
  private rig = new THREE.Group();
  private hips: THREE.Group;
  private torso: THREE.Group;
  private head: THREE.Group;
  private hairTufts: THREE.Mesh[] = [];
  private hood: THREE.Mesh;
  private armL: Arm;
  private armR: Arm;
  private legL: Leg;
  private legR: Leg;
  private crashT = -1;
  private lean = 0;
  private phase = Math.random() * 10;
  private crashSeed = 1;

  constructor() {
    const m = materials();
    this.root.add(this.rig);
    this.root.scale.setScalar(1.15);

    // Hips / pelvis: seated, slightly above the ground.
    this.hips = group(0, 0.17, 0.12, this.rig);
    this.hips.add(box(0.46, 0.24, 0.36, m.pants, 0, 0, 0));

    // Torso: pivot at the hips, reclined backwards (+z).
    this.torso = group(0, 0.08, 0.02, this.hips);
    this.torso.add(box(0.5, 0.5, 0.3, m.hoodie, 0, 0.27, 0));
    this.torso.add(box(0.52, 0.1, 0.32, m.hoodieDark, 0, 0.03, 0)); // hoodie hem
    this.hood = box(0.4, 0.14, 0.18, m.hoodie, 0, 0.55, 0.09); // hood bunched behind the neck
    this.torso.add(this.hood);

    // Backpack (+z = behind the kid) with straps.
    const pack = group(0, 0.28, 0.27, this.torso);
    pack.add(box(0.36, 0.42, 0.2, m.pack));
    pack.add(box(0.38, 0.12, 0.22, m.pack, 0, 0.16, 0.01));
    pack.add(box(0.1, 0.12, 0.04, m.strap, 0, -0.04, 0.12));
    this.torso.add(box(0.07, 0.5, 0.32, m.strap, 0.13, 0.27, 0.0));
    this.torso.add(box(0.07, 0.5, 0.32, m.strap, -0.13, 0.27, 0.0));

    // Head: neck pivot atop the torso.
    this.head = group(0, 0.56, -0.02, this.torso);
    this.head.add(box(0.12, 0.1, 0.12, m.skin, 0, 0.0, 0));
    const skull = new THREE.Mesh(geo('skull', () => new THREE.IcosahedronGeometry(0.2, 1)), m.skin);
    skull.scale.set(1, 1.05, 1.0);
    skull.position.y = 0.2;
    this.head.add(skull);
    // Hair cap + messy tufts (seen from behind it is mostly hair).
    const cap = new THREE.Mesh(geo('hair', () => new THREE.IcosahedronGeometry(0.225, 1)), m.hair);
    cap.scale.set(1, 0.95, 1.02);
    cap.position.set(0, 0.25, 0.035);
    this.head.add(cap);
    const tuft = geo('tuft', () => new THREE.ConeGeometry(0.07, 0.2, 4));
    const tufts: Array<[number, number, number, number, number]> = [
      [0, 0.45, 0.0, 0, 0], [0.1, 0.42, -0.06, -0.5, -0.4], [-0.1, 0.42, 0.0, 0.5, 0.3],
      [0.14, 0.34, 0.1, -0.9, -0.2], [-0.14, 0.34, 0.1, 0.9, -0.1], [0, 0.4, 0.12, 0, -0.7],
      [0.06, 0.3, 0.2, -0.3, -1.0], [-0.07, 0.3, 0.2, 0.3, -1.1], [0.0, 0.46, -0.1, 0, 0.6],
    ];
    for (const [x, y, z, rz, rx] of tufts) {
      const t = new THREE.Mesh(tuft, m.hair);
      t.position.set(x, y, z);
      t.rotation.set(rx, 0, rz);
      this.head.add(t);
      this.hairTufts.push(t);
    }
    // Ears + a hint of face (nose bump) so the head reads when it turns.
    this.head.add(box(0.05, 0.08, 0.04, m.skin, 0.2, 0.2, 0.02));
    this.head.add(box(0.05, 0.08, 0.04, m.skin, -0.2, 0.2, 0.02));
    this.head.add(box(0.06, 0.06, 0.06, m.skin, 0, 0.17, -0.2));

    // Arms.
    this.armR = this.makeArm(1);
    this.armL = this.makeArm(-1);
    // Legs.
    this.legR = this.makeLeg(1);
    this.legL = this.makeLeg(-1);

    this.root.traverse((o) => { o.matrixAutoUpdate = true; });
    this.reset();
  }

  private makeArm(side: 1 | -1): Arm {
    const m = materials();
    const shoulder = group(side * 0.3, 0.46, 0, this.torso);
    shoulder.add(limb(0.085, 0.075, 0.3, m.hoodie));
    shoulder.add(box(0.2, 0.18, 0.2, m.hoodie, 0, -0.02, 0)); // shoulder pad / hoodie bulk
    const elbow = group(0, -0.3, 0, shoulder);
    elbow.add(limb(0.075, 0.06, 0.28, m.hoodie));
    elbow.add(box(0.15, 0.12, 0.15, m.hoodieDark, 0, -0.27, 0)); // cuff
    const hand = group(0, -0.3, 0, elbow);
    hand.add(box(0.12, 0.1, 0.15, m.glove, 0, 0, 0));
    hand.add(box(0.1, 0.05, 0.06, m.skin, 0, -0.04, -0.09)); // fingertips
    return { shoulder, elbow, side };
  }

  private makeLeg(side: 1 | -1): Leg {
    const m = materials();
    const hip = group(side * 0.14, 0.02, -0.12, this.hips);
    hip.rotation.order = 'YXZ';
    hip.add(limb(0.115, 0.095, 0.4, m.pants));
    const knee = group(0, -0.4, 0, hip);
    knee.add(limb(0.095, 0.075, 0.4, m.pants));
    knee.add(box(0.17, 0.12, 0.17, m.pants, 0, 0.0, 0.0)); // cargo knee
    const foot = group(0, -0.42, 0, knee);
    foot.add(box(0.15, 0.12, 0.34, m.sneaker, 0, -0.02, -0.06));
    foot.add(box(0.16, 0.05, 0.36, m.sole, 0, -0.09, -0.06));
    foot.add(box(0.12, 0.06, 0.1, m.sole, 0, 0.03, -0.1)); // tongue / laces patch
    return { hip, knee, side };
  }

  update(dt: number, pose: CharacterPose): void {
    if (this.crashT >= 0) { this.updateCrash(dt, pose); return; }
    const t = pose.time + this.phase;
    const k = 1 - Math.exp(-dt * 12);
    this.lean += (pose.lean - this.lean) * k;
    const lean = this.lean;
    const sp = clamp01((pose.speed - 12) / 36);
    // Vibration: high-frequency rattle + low bumps, growing with speed.
    const vib = (0.004 + 0.012 * sp) * (pose.scraping ? 1.8 : 1);
    const buzz = Math.sin(t * 61) * 0.6 + Math.sin(t * 43.7) * 0.4;
    const bump = Math.sin(t * 7.3) * 0.5 + Math.sin(t * 11.1) * 0.5;

    const rig = this.rig;
    rig.position.set(0, vib * buzz + 0.006 * sp * bump, 0);
    // Body roll into the turn (about travel axis); centre of mass shifts the other way a bit.
    rig.rotation.set(0.02 * bump * sp, -lean * 0.12, -lean * 0.22);
    this.hips.rotation.set(0, 0, 0);
    this.hips.position.x = lean * 0.05;

    // Torso reclined, rolls extra into the lean, leans back more with speed.
    const recline = 0.55 + 0.18 * sp + 0.03 * bump;
    this.torso.rotation.set(recline, lean * 0.14, -lean * 0.18);

    // Head looks ahead (cancel recline), turns into the turn, hood/hair bob.
    this.head.rotation.set(-recline + 0.12 + 0.02 * buzz * sp, -lean * 0.3, lean * 0.1);
    this.hood.position.y = 0.55 + 0.015 * Math.sin(t * 9) * (0.4 + sp);
    this.hood.rotation.x = 0.1 * Math.sin(t * 8.1 + 1) * sp;
    for (let i = 0; i < this.hairTufts.length; i++) {
      const tf = this.hairTufts[i];
      tf.rotation.x += 0; // base orientation preserved
      tf.scale.y = 1 + 0.18 * sp * Math.sin(t * 17 + i * 1.7) + 0.1 * sp;
    }

    // Arms: right trails with the hand on the ground; left out for balance.
    // dragR/dragL = how much each hand reaches for the ground (the leaned-toward side).
    const dragR = clamp01(0.75 + lean * 0.5);
    const dragL = clamp01(-lean * 0.9 - 0.05);
    this.poseArm(this.armR, dragR, t, sp, lean);
    this.poseArm(this.armL, dragL, t, sp, lean);

    // Legs: slightly apart, boots rattle, react to lean (inner leg bends, outer extends).
    const lr = 2.15 + 0.02 * buzz * sp - lean * 0.05;
    const ll = 2.15 + 0.02 * Math.sin(t * 57) * sp + lean * 0.05;
    this.legR.hip.rotation.set(lr, -0.42 - lean * 0.08, -0.08);
    this.legL.hip.rotation.set(ll, 0.42 - lean * 0.08, 0.08);
    this.legR.knee.rotation.set(-0.95 + Math.max(0, -lean) * 0.35 + 0.03 * bump, 0, 0);
    this.legL.knee.rotation.set(-0.95 + Math.max(0, lean) * 0.35 - 0.03 * bump, 0, 0);
  }

  /** drag 0 = arm out for balance, 1 = hand trailing on the ground. */
  private poseArm(a: Arm, drag: number, t: number, sp: number, lean: number): void {
    const s = a.side;
    // Balance pose: arm raised out to the side and a little forward.
    const outZ = s * 0.5, outX = -0.3, outElbow = -1.0;
    // Drag pose: arm reaching down/out/back, hand on the surface beside and behind the hip.
    const dZ = s * 0.32, dX = -0.95, dElbow = -0.05;
    const flutter = Math.sin(t * 9 + (s > 0 ? 0 : 2)) * 0.06 * (0.3 + sp);
    // Counterbalance: the free arm swings up when leaning away.
    const free = 1 - drag;
    a.shoulder.rotation.set(
      lerp(outX, dX, drag) + flutter * free,
      0,
      lerp(outZ, dZ, drag) - s * lean * 0.25 * free,
      'XYZ',
    );
    a.elbow.rotation.set(lerp(outElbow, dElbow, drag) + flutter, 0, 0);
  }

  private updateCrash(dt: number, pose: CharacterPose): void {
    this.crashT += dt;
    const T = 1.3;
    const t = Math.min(this.crashT, T);
    const u = t / T;
    const rig = this.rig;
    const seed = this.crashSeed;
    // Ballistic throw: up and (relative to the stopped body) forward over the obstacle then back down,
    // with two bounces and a slide to rest.
    const g = 11;
    const v0 = 4.2;
    let y = 0;
    let tt = t;
    let v = v0;
    for (let b = 0; b < 3; b++) {
      const air = (2 * v) / g;
      if (tt < air) { y = v * tt - 0.5 * g * tt * tt; break; }
      tt -= air; v *= 0.45; y = 0;
    }
    const drift = 1 - Math.pow(1 - u, 2);
    rig.position.set(seed * 0.6 * drift, y, 1.6 * drift - 0.4 * Math.sin(u * Math.PI));
    const spin = (1 - u * u) * 11;
    rig.rotation.set(-spin * u * 0.9 * 1.0, seed * u * 2.2, seed * spin * u * 0.35);
    // Settle: ease the tumble angle to a resting prone pose.
    const settle = clamp01((u - 0.78) / 0.22);
    rig.rotation.x = lerp(rig.rotation.x, -Math.PI * 0.46, settle);
    rig.rotation.z = lerp(rig.rotation.z, 0, settle);

    const fl = (1 - settle) * (1 - u * 0.5);
    const ts = pose.time * 20;
    this.torso.rotation.set(0.2 + Math.sin(ts * 0.7) * 0.4 * fl, Math.sin(ts * 0.5) * 0.5 * fl, Math.sin(ts * 0.6) * 0.3 * fl);
    this.head.rotation.set(Math.sin(ts * 0.9) * 0.6 * fl, Math.sin(ts * 0.8) * 0.5 * fl, Math.sin(ts * 0.7) * 0.4 * fl);
    for (const a of [this.armR, this.armL]) {
      const ph = a.side * 1.7;
      a.shoulder.rotation.set(Math.sin(ts + ph) * 1.6 * fl - 0.4, 0, a.side * (1.2 + Math.sin(ts * 1.2 + ph) * 0.9 * fl));
      a.elbow.rotation.set(-0.4 - Math.abs(Math.sin(ts * 1.1 + ph)) * 1.2 * fl, 0, 0);
    }
    for (const l of [this.legR, this.legL]) {
      const ph = l.side * 2.1;
      l.hip.rotation.set(1.3 + Math.sin(ts * 0.9 + ph) * 1.0 * fl, l.side * (0.2 + 0.5 * fl), l.side * 0.2 * fl);
      l.knee.rotation.set(-0.3 - Math.abs(Math.sin(ts * 1.3 + ph)) * 1.0 * fl, 0, 0);
    }
    this.hood.rotation.x = Math.sin(ts) * 0.5 * fl;
  }

  crash(): void {
    this.crashT = 0;
    this.crashSeed = Math.random() < 0.5 ? -1 : 1;
  }

  reset(): void {
    this.crashT = -1;
    this.lean = 0;
    this.rig.position.set(0, 0, 0);
    this.rig.rotation.set(0, 0, 0);
    this.update(0, { lean: 0, speed: 15, time: 0, tilt: 0, scraping: false });
  }
}

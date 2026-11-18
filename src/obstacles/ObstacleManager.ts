import * as THREE from 'three';
import type { Collider, ObstacleSpec } from '../core/types';
import { makeFrame, profileHeight, type Spine } from '../track/Spine';
import { disposeObject } from '../world/ChunkManager';
import type { ObstacleMeshFactory } from './ObstacleFactory';
import { FALL_ACTIVE_AT, FALL_DURATION } from '../track/corridor';

/** Live obstacle. */
export interface Obstacle {
  spec: ObstacleSpec;
  obj: THREE.Object3D;
  /** Current lateral centre (may move). */
  u: number;
  /** For falling obstacles: 0 = up high, 1 = landed. */
  fall: number;
  active: boolean;
  /** Has the player passed it (for near-miss feedback). */
  passed: boolean;
}

/** Runtime animation state passed to userData.anim hooks. */
export interface ObstacleAnimState {
  /** Time in seconds since game start. */
  time: number;
  /** Fall progress 0..1 for falling obstacles. */
  fall: number;
  /** Lateral displacement (m) from spec.u for moving obstacles. */
  offset: number;
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _back = new THREE.Vector3();

/** Spawns obstacles from specs, animates them, and resolves collisions in track space. */
export class ObstacleManager {
  readonly root = new THREE.Group();
  private list: Obstacle[] = [];
  private pending: ObstacleSpec[] = [];
  private frame = makeFrame();
  private time = 0;
  /** Listener for events (falling debris impact, etc.). */
  onEvent: (type: 'fall-start' | 'fall-land' | 'near-miss', o: Obstacle) => void = () => {};

  constructor(private spine: Spine, private factory: ObstacleMeshFactory) {
    this.root.name = 'obstacles';
  }

  reset(): void {
    for (const o of this.list) this.remove(o);
    this.list = [];
    this.pending = [];
    this.time = 0;
  }

  /** Queue specs (generator output). They are instantiated when within view distance. */
  add(specs: ObstacleSpec[]): void { this.pending.push(...specs); this.pending.sort((a, b) => a.s - b.s); }

  get all(): readonly Obstacle[] { return this.list; }

  update(dt: number, playerS: number, playerU: number, viewAhead: number): void {
    this.time += dt;
    while (this.pending.length && this.pending[0].s < playerS + viewAhead) {
      const spec = this.pending.shift()!;
      if (spec.s < playerS - 5) continue;
      const obj = this.factory(spec);
      const o: Obstacle = { spec, obj, u: spec.u, fall: spec.motion?.type === 'fall' ? 0 : 1, active: true, passed: false };
      this.root.add(obj);
      this.list.push(o);
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const o = this.list[i];
      if (o.spec.s < playerS - 20) { this.remove(o); this.list.splice(i, 1); continue; }
      this.animate(o, dt, playerS, playerU);
      this.place(o);
    }
  }

  private animate(o: Obstacle, dt: number, playerS: number, playerU: number): void {
    const m = o.spec.motion;
    let offset = 0;
    if (m?.type === 'slide' || m?.type === 'swing') {
      const period = m.period ?? 2;
      offset = Math.sin((this.time / period) * Math.PI * 2 + (m.phase ?? 0)) * (m.amplitude ?? 2);
      o.u = o.spec.u + offset;
    } else if (m?.type === 'fall') {
      const trig = m.triggerAhead ?? 50;
      if (o.fall === 0 && o.spec.s - playerS < trig) { o.fall = 0.0001; this.onEvent('fall-start', o); }
      if (o.fall > 0 && o.fall < 1) {
        o.fall = Math.min(1, o.fall + dt / FALL_DURATION);
        if (o.fall >= 1) this.onEvent('fall-land', o);
      }
    }
    if (!o.passed && o.spec.s < playerS - 1) {
      o.passed = true;
      const c = this.collider(o);
      if (c && Math.min(Math.abs(playerU - c.u0), Math.abs(playerU - c.u1)) < 0.9) this.onEvent('near-miss', o);
    }
    const anim = o.obj.userData.anim as ((s: ObstacleAnimState) => void) | undefined;
    if (anim) anim({ time: this.time, fall: o.fall, offset });
  }

  private place(o: Obstacle): void {
    const f = this.spine.frame(o.spec.s, this.frame);
    const h = profileHeight(o.u, f.width);
    _p.copy(f.pos).addScaledVector(f.right, o.u).addScaledVector(f.up, h);
    _back.copy(f.fwd).negate();
    _m.makeBasis(f.right, f.up, _back);
    o.obj.quaternion.setFromRotationMatrix(_m);
    o.obj.position.copy(_p);
    if (o.spec.motion?.type === 'fall' && !o.obj.userData.anim) {
      // default fall: drop from 14m above
      const k = 1 - o.fall;
      o.obj.position.addScaledVector(f.up, k * k * 14);
    }
  }

  /** Current collider of an obstacle (null while a falling object is still in the air). */
  collider(o: Obstacle): Collider | null {
    if (o.spec.motion?.type === 'fall' && o.fall < FALL_ACTIVE_AT) return null;
    const hw = o.spec.halfWidth;
    return { s0: o.spec.s - o.spec.depth / 2, s1: o.spec.s + o.spec.depth / 2, u0: o.u - hw, u1: o.u + hw };
  }

  /** Returns the obstacle hit by a circle of radius r at (s, u), or null. */
  hitTest(s: number, u: number, r: number): Obstacle | null {
    for (const o of this.list) {
      if (Math.abs(o.spec.s - s) > o.spec.depth / 2 + r + 0.5) continue;
      const c = this.collider(o);
      if (!c) continue;
      const ds = Math.max(c.s0 - s, 0, s - c.s1);
      const du = Math.max(c.u0 - u, 0, u - c.u1);
      if (ds * ds + du * du < r * r) return o;
    }
    return null;
  }

  private remove(o: Obstacle): void {
    this.root.remove(o.obj);
    disposeObject(o.obj);
  }
}

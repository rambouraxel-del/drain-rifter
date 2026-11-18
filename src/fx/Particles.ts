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
 * Cheap pooled particles: three THREE.Points (spray, ambient, burst), one tiny ShaderMaterial,
 * additive blending, soft-dot texture, zero per-frame allocations.
 * Positions are stored relative to a rebased origin (root.position) to keep float32 precision on long runs.
 */

interface BiomeFx {
  /** Spray colour, size (m), gravity (m/s^2, + = down), life (s), speed carry (0..1 of player speed), emission scale. */
  spray: { color: number; size: number; g: number; life: number; carry: number; rate: number; jitter: number };
  /** Ambient: colour, size, vertical velocity along -up (+ = falls), sway (m/s), twinkle. */
  amb: { color: number; size: number; fall: number; sway: number };
}

const FX: Record<BiomeId, BiomeFx> = {
  sewer: { spray: { color: 0x8fd8ff, size: 0.05, g: 9, life: 0.45, carry: 0.35, rate: 1.8, jitter: 2.2 }, amb: { color: 0x7fc8a0, size: 0.1, fall: 5.5, sway: 0.1 } },
  industrial: { spray: { color: 0xffa040, size: 0.035, g: 8, life: 0.4, carry: 0.55, rate: 1.6, jitter: 3.2 }, amb: { color: 0xff7a30, size: 0.1, fall: -0.9, sway: 0.5 } },
  cavern: { spray: { color: 0xcdb08a, size: 0.06, g: 2.5, life: 0.5, carry: 0.3, rate: 1.9, jitter: 1.6 }, amb: { color: 0xb8c8d8, size: 0.09, fall: 0.15, sway: 0.25 } },
  ruins: { spray: { color: 0xe0c090, size: 0.065, g: 2, life: 0.55, carry: 0.3, rate: 1.9, jitter: 1.5 }, amb: { color: 0xffe0a0, size: 0.09, fall: 0.1, sway: 0.3 } },
  abyss: { spray: { color: 0x70f0ff, size: 0.05, g: -0.6, life: 0.7, carry: 0.25, rate: 1.6, jitter: 1.6 }, amb: { color: 0xb080ff, size: 0.16, fall: -0.2, sway: 0.6 } },
};

const VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
uniform float uScale;
uniform float uFar;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = -mv.z;
  float fade = smoothstep(uFar, uFar * 0.55, d) * smoothstep(0.35, 1.6, d);
  vColor = aColor * fade;
  gl_PointSize = clamp(aSize * uScale / max(d, 0.1), 0.0, 18.0) * step(0.0001, aSize);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec3 vColor;
void main() {
  float a = texture2D(uMap, gl_PointCoord).a;
  gl_FragColor = vec4(vColor * a, 1.0);
}`;

let dotTex: THREE.CanvasTexture | null = null;
function softDot(): THREE.CanvasTexture {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
  dotTex = new THREE.CanvasTexture(c);
  dotTex.userData.shared = true;
  return dotTex;
}

const _c = new THREE.Color();

/** A fixed-size GPU-backed pool rendered as THREE.Points. */
class Pool {
  readonly points: THREE.Points;
  readonly pos: Float32Array;
  readonly col: Float32Array;
  readonly size: Float32Array;
  readonly vel: Float32Array;
  readonly life: Float32Array;
  readonly maxLife: Float32Array;
  readonly baseSize: Float32Array;
  readonly base: Float32Array; // base colour (rgb)
  readonly geo = new THREE.BufferGeometry();
  readonly posAttr: THREE.BufferAttribute;
  readonly colAttr: THREE.BufferAttribute;
  readonly sizeAttr: THREE.BufferAttribute;
  cursor = 0;
  /** Active count (<= capacity), set from the quality budget. */
  active: number;

  constructor(readonly cap: number, material: THREE.ShaderMaterial) {
    this.active = cap;
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap).fill(1);
    this.baseSize = new Float32Array(cap);
    this.base = new Float32Array(cap * 3);
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.posAttr);
    this.geo.setAttribute('aColor', this.colAttr);
    this.geo.setAttribute('aSize', this.sizeAttr);
    this.points = new THREE.Points(this.geo, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  upload(): void {
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
  }

  dispose(): void { this.geo.dispose(); }
}

export class Particles {
  readonly root = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private spray: Pool;
  private amb: Pool;
  private bursts: Pool;
  private budget: number;
  private origin = new THREE.Vector3();
  private originSet = false;
  private emitAcc = 0;
  private ambInit = false;
  private ambBiome: BiomeId = 'sewer';
  private time = 0;
  private up = new THREE.Vector3();
  private lastS = 0;

  private static SPRAY_CAP = 360;
  private static AMB_CAP = 150;
  private static BURST_CAP = 160;

  constructor(budget: number) {
    this.budget = THREE.MathUtils.clamp(budget, 0.2, 1);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: softDot() }, uScale: { value: 400 }, uFar: { value: 70 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.mat.userData.shared = false;
    this.spray = new Pool(Particles.SPRAY_CAP, this.mat);
    this.amb = new Pool(Particles.AMB_CAP, this.mat);
    this.bursts = new Pool(Particles.BURST_CAP, this.mat);
    this.root.name = 'particles';
    this.root.add(this.spray.points, this.amb.points, this.bursts.points);
    this.setBudget(budget);
    this.onResize();
    if (typeof window !== 'undefined') window.addEventListener('resize', () => this.onResize());
  }

  /** Change the particle budget (quality.particles, 0.2..1) without reallocating. */
  setBudget(budget: number): void {
    this.budget = THREE.MathUtils.clamp(budget, 0.2, 1);
    this.spray.active = Math.max(16, Math.floor(this.spray.cap * this.budget));
    this.amb.active = Math.max(16, Math.floor(this.amb.cap * this.budget));
    this.bursts.active = Math.max(24, Math.floor(this.bursts.cap * this.budget));
    // Kill anything beyond the active range.
    for (const p of [this.spray, this.amb, this.bursts]) {
      for (let i = p.active; i < p.cap; i++) { p.life[i] = 0; p.size[i] = 0; }
      if (p.cursor >= p.active) p.cursor = 0;
      p.upload();
    }
  }

  private onResize(): void {
    if (typeof window === 'undefined') return;
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    // size_px = size_m * H_px / (2 tan(fov/2) * depth); ~tan(fov/2)=0.8 on portrait phones.
    this.mat.uniforms.uScale.value = (window.innerHeight * pr) / 1.7;
  }

  reset(): void {
    for (const p of [this.spray, this.amb, this.bursts]) {
      p.life.fill(0); p.size.fill(0); p.cursor = 0; p.upload();
    }
    this.ambInit = false;
    this.originSet = false;
    this.emitAcc = 0;
  }

  /** Crash burst at a world position. `color` is 0xRRGGBB. */
  burst(pos: THREE.Vector3, color: number, count = 40): void {
    const p = this.bursts;
    const n = Math.min(Math.floor(count * (0.5 + this.budget * 0.5)), p.active);
    _c.setHex(color);
    const o = this.origin;
    for (let k = 0; k < n; k++) {
      const i = p.cursor; p.cursor = (p.cursor + 1) % p.active;
      const a = Math.random() * Math.PI * 2;
      const cz = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - cz * cz);
      const sp = 3 + Math.random() * 11;
      p.pos[i * 3] = pos.x - o.x; p.pos[i * 3 + 1] = pos.y - o.y + 0.4; p.pos[i * 3 + 2] = pos.z - o.z;
      p.vel[i * 3] = Math.cos(a) * r * sp; p.vel[i * 3 + 1] = Math.abs(cz) * sp * 0.8 + 1; p.vel[i * 3 + 2] = Math.sin(a) * r * sp;
      p.life[i] = p.maxLife[i] = 0.5 + Math.random() * 0.9;
      p.baseSize[i] = 0.12 + Math.random() * 0.22;
      const w = Math.random() < 0.3 ? 1 : 0; // some white-hot sparks
      p.base[i * 3] = w ? 1 : _c.r; p.base[i * 3 + 1] = w ? 1 : _c.g; p.base[i * 3 + 2] = w ? 1 : _c.b;
    }
  }

  update(dt: number, ctx: ParticleContext): void {
    if (dt <= 0 && this.originSet) return;
    dt = Math.min(dt, 0.05);
    this.time += dt;
    const f = ctx.frame;
    this.up.copy(f.up);
    this.rebase(ctx.playerPos);
    const o = this.origin;
    const b = f.blend > 0.5 ? f.nextBiome : f.biome;
    const fx = FX[b];

    // ---- slide spray ----
    const sp = this.spray;
    if (ctx.playing && dt > 0) {
      const spd = Math.max(0, ctx.speed);
      const lat = Math.abs(ctx.lateral);
      const rate = (28 + spd * 2.6 + lat * 70) * fx.spray.rate * this.budget;
      this.emitAcc += rate * dt;
      const sc = fx.spray;
      _c.setHex(sc.color);
      while (this.emitAcc >= 1) {
        this.emitAcc -= 1;
        const i = sp.cursor; sp.cursor = (sp.cursor + 1) % sp.active;
        const rr = Math.random(), r2 = Math.random() - 0.5, r3 = Math.random() - 0.5;
        // spawn slightly behind the board, along the surface
        const back = 0.15 + rr * 0.5;
        const side = (Math.random() - 0.5) * 0.5;
        sp.pos[i * 3] = ctx.playerPos.x - o.x - f.fwd.x * back + f.right.x * side + f.up.x * 0.1;
        sp.pos[i * 3 + 1] = ctx.playerPos.y - o.y - f.fwd.y * back + f.right.y * side + f.up.y * 0.1;
        sp.pos[i * 3 + 2] = ctx.playerPos.z - o.z - f.fwd.z * back + f.right.z * side + f.up.z * 0.1;
        const fw = spd * sc.carry * (0.6 + rr * 0.6);
        const up = (1.2 + Math.random() * 2.2) * (0.6 + spd / 40);
        const rt = -ctx.lateral * (3 + Math.random() * 5) + r2 * sc.jitter * 2;
        const jt = r3 * sc.jitter;
        sp.vel[i * 3] = f.fwd.x * fw + f.up.x * up + f.right.x * rt + jt * 0.2;
        sp.vel[i * 3 + 1] = f.fwd.y * fw + f.up.y * up + f.right.y * rt + jt * 0.2;
        sp.vel[i * 3 + 2] = f.fwd.z * fw + f.up.z * up + f.right.z * rt + jt * 0.2;
        sp.life[i] = sp.maxLife[i] = sc.life * (0.6 + Math.random() * 0.7);
        sp.baseSize[i] = sc.size * (0.6 + Math.random() * 0.9);
        sp.base[i * 3] = _c.r * 0.5; sp.base[i * 3 + 1] = _c.g * 0.5; sp.base[i * 3 + 2] = _c.b * 0.5;
      }
    }
    this.step(sp, dt, fx.spray.g, 1.2, 0.9);
    this.step(this.bursts, dt, 9, 0.8, 1.0);

    // ---- ambient ----
    this.updateAmbient(dt, ctx, b, fx);
    this.spray.upload(); this.bursts.upload(); this.amb.upload();
  }

  /** Move the float32 origin close to the player so local coordinates stay small. */
  private rebase(p: THREE.Vector3): void {
    const o = this.origin;
    if (!this.originSet || p.distanceToSquared(o) > 300 * 300) {
      const nx = Math.round(p.x / 50) * 50, ny = Math.round(p.y / 50) * 50, nz = Math.round(p.z / 50) * 50;
      if (this.originSet) {
        const dx = o.x - nx, dy = o.y - ny, dz = o.z - nz;
        for (const q of [this.spray, this.amb, this.bursts]) {
          for (let i = 0; i < q.cap; i++) { q.pos[i * 3] += dx; q.pos[i * 3 + 1] += dy; q.pos[i * 3 + 2] += dz; }
        }
      }
      o.set(nx, ny, nz);
      this.originSet = true;
      this.root.position.copy(o);
    }
  }

  private step(p: Pool, dt: number, g: number, drag: number, fadePow: number): void {
    const gx = -this.up.x * g * dt, gy = -this.up.y * g * dt, gz = -this.up.z * g * dt;
    const dr = Math.max(0, 1 - drag * dt);
    for (let i = 0; i < p.active; i++) {
      const l = p.life[i];
      if (l <= 0) { continue; }
      const nl = l - dt;
      p.life[i] = nl;
      if (nl <= 0) { p.size[i] = 0; continue; }
      const i3 = i * 3;
      p.vel[i3] = p.vel[i3] * dr + gx; p.vel[i3 + 1] = p.vel[i3 + 1] * dr + gy; p.vel[i3 + 2] = p.vel[i3 + 2] * dr + gz;
      p.pos[i3] += p.vel[i3] * dt; p.pos[i3 + 1] += p.vel[i3 + 1] * dt; p.pos[i3 + 2] += p.vel[i3 + 2] * dt;
      const t = nl / p.maxLife[i];
      const a = fadePow === 1 ? t : Math.pow(t, fadePow);
      p.size[i] = p.baseSize[i] * (0.4 + 0.6 * t);
      p.col[i3] = p.base[i3] * a; p.col[i3 + 1] = p.base[i3 + 1] * a; p.col[i3 + 2] = p.base[i3 + 2] * a;
    }
  }

  private respawnAmbient(i: number, f: SpineFrame, fx: BiomeFx, near: boolean): void {
    const p = this.amb;
    const a = fx.amb;
    const w = Math.max(3, f.width * 0.42);
    const ahead = near ? -6 + Math.random() * 80 : 35 + Math.random() * 45;
    const lat = (Math.random() * 2 - 1) * w;
    const h = 0.4 + Math.random() * 4.2;
    const o = this.origin;
    p.pos[i * 3] = f.pos.x - o.x + f.fwd.x * ahead + f.right.x * lat + f.up.x * h;
    p.pos[i * 3 + 1] = f.pos.y - o.y + f.fwd.y * ahead + f.right.y * lat + f.up.y * h;
    p.pos[i * 3 + 2] = f.pos.z - o.z + f.fwd.z * ahead + f.right.z * lat + f.up.z * h;
    const fall = a.fall * (0.8 + Math.random() * 0.4);
    const sw = a.sway;
    // velocity stored in world space: along -up for drips, random drift otherwise
    p.vel[i * 3] = -f.up.x * fall + (Math.random() - 0.5) * sw;
    p.vel[i * 3 + 1] = -f.up.y * fall + (Math.random() - 0.5) * sw;
    p.vel[i * 3 + 2] = -f.up.z * fall + (Math.random() - 0.5) * sw;
    p.baseSize[i] = a.size * (0.6 + Math.random() * 0.9) * (fall > 4 ? 0.8 : 1);
    _c.setHex(a.color);
    const br = 0.45 + Math.random() * 0.55;
    p.base[i * 3] = _c.r * br; p.base[i * 3 + 1] = _c.g * br; p.base[i * 3 + 2] = _c.b * br;
    p.life[i] = 1; // alive flag; ambient particles are recycled by position
  }

  private updateAmbient(dt: number, ctx: ParticleContext, b: BiomeId, fx: BiomeFx): void {
    const p = this.amb;
    const f = ctx.frame;
    const o = this.origin;
    if (!this.ambInit) {
      for (let i = 0; i < p.active; i++) this.respawnAmbient(i, f, fx, true);
      this.ambInit = true;
    }
    this.ambBiome = b;
    const w = Math.max(3, f.width * 0.5);
    const tw = this.time;
    for (let i = 0; i < p.active; i++) {
      if (p.life[i] <= 0) { this.respawnAmbient(i, f, fx, false); continue; }
      const i3 = i * 3;
      // gentle wobble for floating motes
      const wob = Math.sin(tw * 1.3 + i * 1.7) * 0.25;
      p.pos[i3] += (p.vel[i3] + f.right.x * wob) * dt;
      p.pos[i3 + 1] += (p.vel[i3 + 1] + f.right.y * wob) * dt;
      p.pos[i3 + 2] += (p.vel[i3 + 2] + f.right.z * wob) * dt;
      const rx = p.pos[i3] + o.x - f.pos.x, ry = p.pos[i3 + 1] + o.y - f.pos.y, rz = p.pos[i3 + 2] + o.z - f.pos.z;
      const d = rx * f.fwd.x + ry * f.fwd.y + rz * f.fwd.z;
      const h = rx * f.up.x + ry * f.up.y + rz * f.up.z;
      const l = rx * f.right.x + ry * f.right.y + rz * f.right.z;
      if (d < -7 || d > 95 || h < -0.4 || h > 6 || l > w || l < -w) { this.respawnAmbient(i, f, fx, false); }
      const tws = 0.75 + 0.25 * Math.sin(tw * 3 + i * 2.3);
      p.size[i] = p.baseSize[i];
      p.col[i3] = p.base[i3] * tws; p.col[i3 + 1] = p.base[i3 + 1] * tws; p.col[i3 + 2] = p.base[i3 + 2] * tws;
    }
  }

  dispose(): void {
    this.spray.dispose(); this.amb.dispose(); this.bursts.dispose(); this.mat.dispose();
  }
}

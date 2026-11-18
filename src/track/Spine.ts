import * as THREE from 'three';
import { CONFIG } from '../core/config';
import type { BiomeId, SegmentPlan, SpineFrame } from '../core/types';

/** Something that produces the sequence of segments (see TrackGenerator). */
export interface SegmentSource {
  nextSegment(s0: number): SegmentPlan;
}

interface Sample {
  x: number; y: number; z: number;
  fx: number; fy: number; fz: number;
  rx: number; ry: number; rz: number;
  ux: number; uy: number; uz: number;
  width: number;
  seg: number;
}

/**
 * The track spine: a continuous 3D curve sampled every CONFIG.spine.step meters,
 * integrated from the segment plan (yaw rate, pitch, roll, width), with smoothing so
 * that every parameter changes continuously (no kinks).
 */
export class Spine {
  readonly step = CONFIG.spine.step;
  private samples: Sample[] = [];
  /** Index (in steps from s=0) of samples[0]. */
  private base = 0;
  readonly segments: SegmentPlan[] = [];
  private segBase = 0;

  // integration state
  private yaw = 0;
  private pitch = 0.12;
  private roll = 0;
  private width: number = CONFIG.track.defaultWidth;
  private yawRate = 0;
  private pos = new THREE.Vector3();

  constructor(private source: SegmentSource) {
    this.currentSegment(0);
    this.pushSample(0);
  }

  /** Distance of the last generated sample. */
  get end(): number { return (this.base + this.samples.length - 1) * this.step; }
  get start(): number { return this.base * this.step; }

  /** Make sure the spine exists up to distance s. */
  ensure(s: number): void {
    while (this.end < s) this.extend();
  }

  /** Drop samples (and segments) before distance s. */
  trim(s: number): void {
    const idx = Math.floor(s / this.step) - this.base - 1;
    if (idx > 0) {
      this.samples.splice(0, idx);
      this.base += idx;
    }
    while (this.segments.length > 1 && this.segments[1].s0 < s - 50) {
      this.segments.shift();
      this.segBase++;
    }
  }

  segmentAt(s: number): SegmentPlan {
    for (let i = this.segments.length - 1; i >= 0; i--) {
      if (this.segments[i].s0 <= s) return this.segments[i];
    }
    return this.segments[0];
  }

  private currentSegment(sNext: number): SegmentPlan {
    const last = this.segments[this.segments.length - 1];
    if (!last || sNext >= last.s0 + last.length) {
      const seg = this.source.nextSegment(last ? last.s0 + last.length : 0);
      this.segments.push(seg);
      return seg;
    }
    return last;
  }

  private extend(): void {
    const sNext = this.end + this.step;
    const seg = this.currentSegment(sNext);
    // Smoothly approach the segment's targets (per meter exponential smoothing).
    const k = 1 - Math.exp(-this.step / 14);
    this.yawRate += (seg.yawRate - this.yawRate) * k;
    this.pitch += (seg.pitch - this.pitch) * k;
    this.roll += (seg.roll - this.roll) * k;
    this.width += (seg.width - this.width) * (1 - Math.exp(-this.step / 20));
    this.yaw += this.yawRate * this.step;
    const f = Spine.forward(this.yaw, this.pitch, new THREE.Vector3());
    this.pos.addScaledVector(f, this.step);
    this.pushSample(seg.index);
  }

  static forward(yaw: number, pitch: number, out: THREE.Vector3): THREE.Vector3 {
    const cp = Math.cos(pitch);
    return out.set(Math.sin(yaw) * cp, -Math.sin(pitch), -Math.cos(yaw) * cp);
  }

  private pushSample(segIndex = 0): void {
    const f = Spine.forward(this.yaw, this.pitch, new THREE.Vector3());
    const r = new THREE.Vector3(Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const u = new THREE.Vector3().crossVectors(r, f).normalize();
    if (this.roll !== 0) {
      const q = new THREE.Quaternion().setFromAxisAngle(f, -this.roll);
      r.applyQuaternion(q);
      u.applyQuaternion(q);
    }
    this.samples.push({
      x: this.pos.x, y: this.pos.y, z: this.pos.z,
      fx: f.x, fy: f.y, fz: f.z,
      rx: r.x, ry: r.y, rz: r.z,
      ux: u.x, uy: u.y, uz: u.z,
      width: this.width,
      seg: segIndex,
    });
  }

  /** Sample the spine at distance s (clamped to the generated range). */
  frame(s: number, out: SpineFrame): SpineFrame {
    const t = s / this.step - this.base;
    let i = Math.floor(t);
    let a = t - i;
    if (i < 0) { i = 0; a = 0; }
    if (i >= this.samples.length - 1) { i = this.samples.length - 2; a = 1; }
    if (i < 0) { i = 0; a = 0; }
    const p = this.samples[i];
    const q = this.samples[Math.min(i + 1, this.samples.length - 1)];
    const b = 1 - a;
    out.s = s;
    out.pos.set(p.x * b + q.x * a, p.y * b + q.y * a, p.z * b + q.z * a);
    out.fwd.set(p.fx * b + q.fx * a, p.fy * b + q.fy * a, p.fz * b + q.fz * a).normalize();
    out.right.set(p.rx * b + q.rx * a, p.ry * b + q.ry * a, p.rz * b + q.rz * a).normalize();
    out.up.set(p.ux * b + q.ux * a, p.uy * b + q.uy * a, p.uz * b + q.uz * a).normalize();
    out.width = p.width * b + q.width * a;
    const seg = this.segmentAt(s);
    out.segIndex = seg.index;
    out.biome = seg.biome;
    if (seg.toBiome) {
      out.nextBiome = seg.toBiome;
      const x = THREE.MathUtils.clamp((s - seg.s0) / seg.length, 0, 1);
      out.blend = x * x * (3 - 2 * x);
    } else {
      out.nextBiome = seg.biome;
      out.blend = 0;
    }
    return out;
  }

  /** Dominant biome at s (switches at the middle of a transition). */
  biomeAt(s: number): BiomeId {
    const seg = this.segmentAt(s);
    if (seg.toBiome && s - seg.s0 > seg.length * 0.5) return seg.toBiome;
    return seg.biome;
  }
}

export function makeFrame(): SpineFrame {
  return {
    s: 0,
    pos: new THREE.Vector3(),
    fwd: new THREE.Vector3(0, 0, -1),
    right: new THREE.Vector3(1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
    width: CONFIG.track.defaultWidth,
    biome: 'sewer',
    nextBiome: 'sewer',
    blend: 0,
    segIndex: 0,
  };
}

/* ---------------- Half-pipe cross-section profile ---------------- */

/** Height of the sliding surface above the spine at lateral offset u, for a track of the given width. */
export function profileHeight(u: number, width: number): number {
  const half = width / 2;
  const flat = half * CONFIG.track.flatFraction;
  const au = Math.abs(u);
  if (au <= flat) return 0;
  const r = half - flat;
  const d = Math.min(au - flat, r);
  let h = r - Math.sqrt(Math.max(0, r * r - d * d));
  if (au > half) h += au - half; // beyond the quarter circle: continue steeply
  return h;
}

/** dHeight/du of the profile (for tilting the player with the wall). */
export function profileSlope(u: number, width: number): number {
  const half = width / 2;
  const flat = half * CONFIG.track.flatFraction;
  const au = Math.abs(u);
  if (au <= flat) return 0;
  const r = half - flat;
  const d = Math.min(au - flat, r * 0.999);
  const slope = d / Math.sqrt(Math.max(1e-6, r * r - d * d));
  return Math.sign(u) * Math.min(slope, 6);
}

/** Max |u| the player may reach on a track of this width. */
export function usableHalfWidth(width: number): number {
  return (width / 2) * CONFIG.track.usableFraction;
}

const _f = makeFrame();
/** World position of the surface at (s, u). */
export function surfacePoint(spine: Spine, s: number, u: number, out: THREE.Vector3, frame: SpineFrame = _f): THREE.Vector3 {
  spine.frame(s, frame);
  const h = profileHeight(u, frame.width);
  return out.copy(frame.pos).addScaledVector(frame.right, u).addScaledVector(frame.up, h);
}

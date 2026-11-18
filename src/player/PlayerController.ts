import { CONFIG } from '../core/config';
import { speedAt } from '../core/difficulty';
import type { Input } from '../core/Input';
import type { SpineFrame } from '../core/types';
import { usableHalfWidth } from '../track/Spine';

/** Track-space player physics. Gameplay agent owns this file. */
export class PlayerController {
  s = 0;
  u = 0;
  /** Lateral velocity (m/s). */
  vu = 0;
  /** Lateral target (m). */
  targetU = 0;
  speed: number = CONFIG.speed.start;
  /** Smoothed lean -1..1 for the character animation. */
  lean = 0;
  /** Was pushed against a wall this frame. */
  scraping = false;
  sensitivity = 1;

  reset(s = 0): void {
    this.s = s;
    this.u = 0;
    this.vu = 0;
    this.targetU = 0;
    this.keyActive = false;
    this.lean = 0;
    this.speed = speedAt(0);
  }

  private keyActive = false;

  update(dt: number, input: Input, frame: SpineFrame, yawRate: number): void {
    const P = CONFIG.player;
    const lim = usableHalfWidth(frame.width);
    const sens = Math.min(2, Math.max(0.4, this.sensitivity));
    // Touch: relative drag anywhere moves the target (fraction of screen width -> track widths).
    const drag = input.consumeDrag();
    if (drag !== 0) { this.targetU += drag * frame.width * P.dragGain * sens; this.keyActive = false; }
    // Keyboard: direct acceleration with damping (inertia), target follows to coast on release.
    const key = input.keyAxis;
    if (key !== 0) {
      this.keyActive = true;
      this.vu += key * P.lateralAccel * Math.min(1.4, sens) * dt;
      this.vu -= this.vu * Math.min(1, P.lateralDamping * 0.35 * dt);
      this.targetU = this.u + this.vu * 0.18;
    } else if (this.keyActive) {
      this.keyActive = false;
      this.targetU = this.u + this.vu / P.lateralDamping;
    }
    // Mild centrifugal drift in curves (outside of the curve), fair and slow.
    this.targetU -= yawRate * this.speed * this.speed * P.drift * dt;
    this.targetU = Math.max(-lim, Math.min(lim, this.targetU));
    // Damped spring toward the target (touch) — keyboard coasts via the target above.
    const acc = (this.targetU - this.u) * P.followStiffness - this.vu * P.followDamping;
    this.vu += acc * dt * (key !== 0 ? 0.15 : 1);
    this.vu = Math.max(-P.maxLateralSpeed, Math.min(P.maxLateralSpeed, this.vu));
    this.u += this.vu * dt;
    // Riding up the half-pipe wall: gravity gently pulls back down (more on steep parts).
    const flat = (frame.width / 2) * CONFIG.track.flatFraction;
    const au = Math.abs(this.u);
    if (au > flat) {
      const k = Math.min(1, (au - flat) / Math.max(0.1, lim - flat));
      this.vu -= Math.sign(this.u) * P.wallPull * k * dt;
    }
    this.scraping = false;
    if (this.u > lim) { this.u = lim; this.vu = Math.min(0, this.vu); this.targetU = Math.min(this.targetU, lim); this.scraping = true; }
    if (this.u < -lim) { this.u = -lim; this.vu = Math.max(0, this.vu); this.targetU = Math.max(this.targetU, -lim); this.scraping = true; }
    // Forward motion
    this.speed = speedAt(this.s);
    this.s += this.speed * dt;
    const targetLean = Math.max(-1, Math.min(1, this.vu / (P.maxLateralSpeed * 0.7)));
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 9);
  }
}

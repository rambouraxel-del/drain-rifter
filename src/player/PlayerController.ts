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
    this.lean = 0;
    this.speed = speedAt(0);
  }

  update(dt: number, input: Input, frame: SpineFrame, yawRate: number): void {
    const P = CONFIG.player;
    const lim = usableHalfWidth(frame.width);
    // Target driven by drag (1 screen width = 1.25 track widths at sensitivity 1)
    this.targetU += input.consumeDrag() * frame.width * 1.25 * this.sensitivity;
    this.targetU += input.keyAxis * P.maxLateralSpeed * dt * Math.min(1.5, this.sensitivity);
    // Mild centrifugal drift in curves pushes the target outward.
    this.targetU -= yawRate * this.speed * this.speed * 0.012 * dt;
    this.targetU = Math.max(-lim, Math.min(lim, this.targetU));
    // Damped spring towards the target with max lateral speed.
    const acc = (this.targetU - this.u) * P.followStiffness - this.vu * P.followDamping;
    this.vu += acc * dt;
    this.vu = Math.max(-P.maxLateralSpeed, Math.min(P.maxLateralSpeed, this.vu));
    this.u += this.vu * dt;
    this.scraping = false;
    if (this.u > lim) { this.u = lim; this.vu = Math.min(0, this.vu); this.scraping = true; }
    if (this.u < -lim) { this.u = -lim; this.vu = Math.max(0, this.vu); this.scraping = true; }
    // Forward motion
    this.speed = speedAt(this.s);
    this.s += this.speed * dt;
    const targetLean = Math.max(-1, Math.min(1, this.vu / P.maxLateralSpeed));
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 10);
  }
}

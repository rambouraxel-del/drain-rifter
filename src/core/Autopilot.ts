import type { Input } from './Input';
import type { SpineFrame } from './types';
import type { Obstacle, ObstacleManager } from '../obstacles/ObstacleManager';
import { usableHalfWidth } from '../track/Spine';

interface PlayerLike { s: number; u: number; vu: number; speed: number }

/**
 * Test-only autopilot. Each frame it scans obstacles in the next ~1.6 s, evaluates candidate lateral
 * positions across the usable width and steers (input.keyAxis = -1/0/1) towards the nearest free one.
 * Moving obstacles (slide/swing) are treated conservatively as blocking their whole sweep range.
 */
export class Autopilot {
  /** Player circle radius + safety margin (m). */
  margin = 0.75;
  /** Current chosen target (debug). */
  target = 0;
  private lastS = 0;

  drive(input: Input, player: PlayerLike, obstacles: ObstacleManager, frame: SpineFrame): void {
    const lim = usableHalfWidth(frame.width);
    const look = Math.max(30, player.speed * 1.7);
    const s = player.s;
    if (s < this.lastS - 1) this.target = 0;
    this.lastS = s;

    // Collect relevant obstacles (small list, no persistent allocations beyond this frame's arrays).
    const rel: { s0: number; s1: number; u0: number; u1: number }[] = [];
    for (const o of obstacles.all) {
      const sp = o.spec;
      if (sp.s - sp.depth / 2 > s + look || sp.s + sp.depth / 2 < s - 1.5) continue;
      let u0: number, u1: number, s0 = sp.s - sp.depth / 2, s1 = sp.s + sp.depth / 2;
      const m = sp.motion;
      if (m && (m.type === 'slide' || m.type === 'swing')) {
        const a = m.amplitude ?? 2;
        u0 = sp.u - a - sp.halfWidth; u1 = sp.u + a + sp.halfWidth;
      } else if (m?.type === 'fall') {
        u0 = sp.u - sp.halfWidth; u1 = sp.u + sp.halfWidth; // will land
      } else {
        const c = obstacles.collider(o as Obstacle);
        if (!c) continue;
        u0 = c.u0; u1 = c.u1; s0 = c.s0; s1 = c.s1;
      }
      rel.push({ s0, s1, u0: u0 - this.margin, u1: u1 + this.margin });
    }

    // Cost of standing at lateral position c (lower = better). Obstacles blocking c cost more the closer they are.
    const cost = (c: number): number => {
      let k = Math.abs(c - player.u) * 0.5 + Math.abs(c) * 0.08;
      for (const r of rel) {
        const ahead = Math.max(0, r.s0 - s);
        const w = 1 / (1 + ahead * 0.05);
        if (c > r.u0 && c < r.u1) k += 1000 * w;
        // path from current u to c crosses the obstacle before we can get there
        const travel = Math.abs(c - player.u) / 7; // s
        const reachS = s + player.speed * travel;
        if (r.s0 < reachS + 2 && r.s1 > s) {
          const lo = Math.min(c, player.u), hi = Math.max(c, player.u);
          if (hi > r.u0 && lo < r.u1) k += 400 * w;
        }
      }
      return k;
    };

    let best = this.target, bestK = Infinity;
    for (let c = -lim; c <= lim + 1e-6; c += 0.4) {
      const k = cost(c) - (Math.abs(c - this.target) < 0.01 ? 0.6 : 0); // hysteresis
      if (k < bestK) { bestK = k; best = c; }
    }
    this.target = best;
    const err = best - player.u - player.vu * 0.22;
    input.keyAxis = Math.abs(err) < 0.12 ? 0 : err > 0 ? 1 : -1;
  }
}

/** Returns a drive function matching Game.autopilotDrive. */
export function createAutopilot(): (input: Input, player: PlayerLike, obstacles: ObstacleManager, frame: SpineFrame) => void {
  const ap = new Autopilot();
  return (i, p, o, f) => ap.drive(i, p, o, f);
}

import { CONFIG } from '../core/config';
import { BIOME_ORDER, type BiomeId, type ObstacleKind, type ObstacleSpec, type SegmentPlan } from '../core/types';
import { RNG, hash } from '../core/rng';
import { difficultyAt, speedAt } from '../core/difficulty';
import type { SegmentSource } from './Spine';

/** Per-biome generation parameters. */
const BIOME_GEN: Record<BiomeId, { width: [number, number]; kinds: ObstacleKind[]; yaw: number; pitch: [number, number] }> = {
  sewer: { width: [8.5, 10], kinds: ['barrier', 'crate', 'grate', 'pipe', 'debris'], yaw: 0.018, pitch: [0.1, 0.18] },
  industrial: { width: [9, 11], kinds: ['beam', 'piston', 'fan', 'barrier', 'crate', 'slider'], yaw: 0.022, pitch: [0.12, 0.2] },
  cavern: { width: [10, 13], kinds: ['rock', 'stalagmite', 'boulder', 'root', 'falling'], yaw: 0.03, pitch: [0.1, 0.24] },
  ruins: { width: [9, 12], kinds: ['pillar', 'statue', 'rubble', 'swinger', 'falling'], yaw: 0.024, pitch: [0.12, 0.22] },
  abyss: { width: [8, 12], kinds: ['crystal', 'shard', 'orb', 'slider', 'swinger'], yaw: 0.032, pitch: [0.14, 0.26] },
};

/**
 * Produces the endless track plan (segments) and obstacle layouts.
 * Guarantees: every obstacle row leaves a gap wide enough for the player that is
 * reachable from the previous gap given lateral speed and forward speed.
 */
export class TrackGenerator implements SegmentSource {
  private rng: RNG;
  private index = 0;
  /** Where the safe corridor currently is (track-space u). */
  private safeU = 0;
  private lastRowS = 0;

  constructor(private seed = (Math.random() * 1e9) | 0) {
    this.rng = new RNG(seed);
  }

  /** Biome cycle: 5 biomes in order, then repeat (with different seeds/configs). */
  biomeForDistance(s: number): { biome: BiomeId; next: BiomeId; local: number } {
    const L = CONFIG.biome.length;
    const cycle = Math.floor(s / L);
    return {
      biome: BIOME_ORDER[cycle % BIOME_ORDER.length],
      next: BIOME_ORDER[(cycle + 1) % BIOME_ORDER.length],
      local: s - cycle * L,
    };
  }

  nextSegment(s0: number): SegmentPlan {
    const r = this.rng;
    const { biome, next, local } = this.biomeForDistance(s0);
    const g = BIOME_GEN[biome];
    const L = CONFIG.biome.length;
    const T = CONFIG.biome.transitionLength;
    const remaining = L - local;
    let length: number;
    let toBiome: BiomeId | undefined;
    if (remaining <= T + 1) {
      length = remaining;
      toBiome = next;
    } else {
      length = Math.min(r.range(30, 80), remaining - T);
      if (remaining - T - length < 20) length = remaining - T;
    }
    const intro = s0 < 120;
    const seg: SegmentPlan = {
      index: this.index++,
      s0,
      length,
      yawRate: intro ? 0 : r.range(-g.yaw, g.yaw) * (r.chance(0.25) ? 0 : 1),
      pitch: intro ? 0.14 : r.range(g.pitch[0], g.pitch[1]),
      roll: 0,
      width: intro ? CONFIG.track.defaultWidth : r.range(g.width[0], g.width[1]),
      biome,
      toBiome,
      difficulty: difficultyAt(s0),
    };
    // Bank slightly into turns.
    seg.roll = -seg.yawRate * 6;
    return seg;
  }

  /** Obstacles for a segment. Called once per segment, in order. */
  obstaclesFor(seg: SegmentPlan): ObstacleSpec[] {
    const out: ObstacleSpec[] = [];
    const r = new RNG(hash(this.seed ^ (seg.index * 7919)));
    const start = Math.max(seg.s0, 160, this.lastRowS);
    const end = seg.s0 + seg.length;
    let s = start;
    const biomeKinds = BIOME_GEN[seg.toBiome && r.chance(0.5) ? seg.toBiome : seg.biome].kinds;
    while (true) {
      const v = speedAt(s);
      const d = seg.difficulty;
      // time between rows shrinks with difficulty: 1.55s -> 0.8s
      const dt = 1.55 - 0.75 * d + r.range(-0.1, 0.25);
      s += Math.max(10, v * dt);
      if (s > end) break;
      this.lastRowS = s;
      const width = seg.width;
      const usable = (width / 2) * CONFIG.track.usableFraction;
      // reachable lateral distance since previous row (conservative 55% of max lateral speed)
      const reach = CONFIG.player.maxLateralSpeed * 0.55 * (v * dt) / v;
      const gapHalf = 1.25 - 0.25 * d; // half width of the free gap (player radius 0.42)
      let gapU = this.safeU + r.range(-reach, reach);
      gapU = Math.max(-usable + gapHalf, Math.min(usable - gapHalf, gapU));
      this.safeU = gapU;
      const kind = r.pick(biomeKinds);
      const seed = r.int(0, 1e9);
      const biome = seg.toBiome && s - seg.s0 > seg.length / 2 ? seg.toBiome : seg.biome;
      const depth = 1.2;
      // Fill everything left of the gap and right of the gap with blockers.
      const leftEdge = -usable - 0.6;
      const rightEdge = usable + 0.6;
      const gl = gapU - gapHalf;
      const gr = gapU + gapHalf;
      if (kind === 'slider' || kind === 'swinger') {
        // A single moving hazard sweeping through the centre; gap logic relies on timing,
        // so keep it narrow and leave both sides partially free.
        out.push({ kind, s, u: 0, halfWidth: 0.8, depth, biome, seed, motion: { type: kind === 'slider' ? 'slide' : 'swing', amplitude: usable * 0.7, period: 2.6 - d, phase: r.next() * Math.PI * 2 } });
        continue;
      }
      if (gl - leftEdge > 0.6) out.push(this.block(kind, s, leftEdge, gl, depth, biome, seed));
      if (rightEdge - gr > 0.6) out.push(this.block(kind, s, gr, rightEdge, depth, biome, seed + 1));
    }
    return out;
  }

  private block(kind: ObstacleKind, s: number, u0: number, u1: number, depth: number, biome: BiomeId, seed: number): ObstacleSpec {
    const spec: ObstacleSpec = { kind, s, u: (u0 + u1) / 2, halfWidth: (u1 - u0) / 2, depth, biome, seed };
    if (kind === 'falling') spec.motion = { type: 'fall', triggerAhead: 55 };
    return spec;
  }
}

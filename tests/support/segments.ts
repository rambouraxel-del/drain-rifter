import { RNG } from '../../src/core/rng';
import type { BiomeId, SegmentPlan } from '../../src/core/types';
import type { SegmentSource } from '../../src/track/Spine';

export interface StubSourceOptions {
  seed?: number;
  /** Inclusive [min, max] for segment lengths (m). */
  lengthRange?: [number, number];
  /** Inclusive [min, max] for segment widths (m). */
  widthRange?: [number, number];
  /** Inclusive [min, max] for downward pitch (rad). */
  pitchRange?: [number, number];
  /** Max absolute yaw rate (rad/m). */
  yawRate?: number;
  biome?: BiomeId;
}

/**
 * Deterministic SegmentSource stub. Only the public SegmentSource contract is used:
 * nextSegment(s0) returns the plan starting at s0.
 */
export class StubSource implements SegmentSource {
  private rng: RNG;
  private index = 0;
  readonly opts: Required<Omit<StubSourceOptions, 'seed'>> & { seed: number };

  constructor(opts: StubSourceOptions = {}) {
    this.opts = {
      seed: opts.seed ?? 1,
      lengthRange: opts.lengthRange ?? [40, 80],
      widthRange: opts.widthRange ?? [8, 10],
      pitchRange: opts.pitchRange ?? [0.1, 0.2],
      yawRate: opts.yawRate ?? 0.02,
      biome: opts.biome ?? 'sewer',
    };
    this.rng = new RNG(this.opts.seed);
  }

  nextSegment(s0: number): SegmentPlan {
    const o = this.opts;
    const r = this.rng;
    return {
      index: this.index++,
      s0,
      length: r.range(o.lengthRange[0], o.lengthRange[1]),
      yawRate: r.range(-o.yawRate, o.yawRate),
      pitch: r.range(o.pitchRange[0], o.pitchRange[1]),
      roll: 0,
      width: r.range(o.widthRange[0], o.widthRange[1]),
      biome: o.biome,
      difficulty: 0,
    };
  }
}

/** A straight, level-width track with a constant pitch (rad, positive = downhill). */
export class FlatSource implements SegmentSource {
  private index = 0;
  constructor(private width = 9, private pitch = 0.1) {}

  nextSegment(s0: number): SegmentPlan {
    return {
      index: this.index++,
      s0,
      length: 50,
      yawRate: 0,
      pitch: this.pitch,
      roll: 0,
      width: this.width,
      biome: 'sewer',
      difficulty: 0,
    };
  }
}

/**
 * TrackGenerator — procedural track plan + obstacle layout (deterministic per seed).
 *
 * SegmentSource:
 *   nextSegment(s0)      -> SegmentPlan (curves / pitch / width / bank / biome transitions)
 *   obstaclesFor(seg)    -> ObstacleSpec[] whose s lies inside `seg` (idempotent, order independent)
 *
 * Plan: biome blocks of CONFIG.biome.length (700 m): ~610 m of motifs (straights, S-bends, sweeps,
 * chicanes, steep drops, squeezes, halls) followed by a 90 m transition segment (toBiome). The first
 * cycle is sewer -> industrial -> cavern -> ruins -> abyss; later cycles start with the sewer and
 * shuffle the other four (seeded) with harder profiles (tighter squeezes, more yaw, steeper drops,
 * extra dynamic obstacle kinds, higher effective difficulty). First 150 m: straight and empty.
 *
 * FAIRNESS (see corridor.ts): every candidate pattern is run through a conservative reachable
 * corridor simulation (lateral speed 6 m/s, 0.25 s reaction per free stretch, clear gap >=
 * 2.4 - 1.05*difficulty m i.e. 2.4 m early / 1.35 m late, moving obstacles counted over their whole
 * swept range, falling debris triggered so it lands >= 0.8 s before arrival) and is only committed
 * when a path exists; otherwise another pattern is tried or the spot is left empty.
 *
 * Pure helpers for tests (re-exported here):
 *   validateLayout(specs, segments, opts?) -> { ok, violations, minClearGap, ... }
 *   computeCorridor(specs, segments, opts?) -> per-piece free/reachable centre intervals
 *   WidthModel / widthModelFor(segments)    -> exact track width at s (mirrors Spine smoothing)
 */
import { CONFIG } from '../core/config';
import { BIOME_ORDER, type BiomeId, type ObstacleSpec, type SegmentPlan } from '../core/types';
import { RNG, hash } from '../core/rng';
import { difficultyAt, speedAt } from '../core/difficulty';
import type { SegmentSource } from './Spine';
import {
  CORRIDOR_DEFAULTS, WidthModel, advanceCorridor, cloneState, initialCorridor, usableHalf,
  type CorridorOpts, type CorridorState, type Violation,
} from './corridor';
import { kindsFor, pickPattern, type PatternCtx } from './patterns';

export { validateLayout, computeCorridor, widthModelFor, WidthModel, usableHalf, CORRIDOR_DEFAULTS } from './corridor';
export type { CorridorOpts, CorridorPiece, LayoutReport, Violation, Interval } from './corridor';

type Motif = 'straight' | 'sbend' | 'sweep' | 'chicane' | 'drop' | 'squeeze' | 'hall';

interface Style {
  width: [number, number];
  yaw: number;
  pitch: [number, number];
  motifs: Record<Motif, number>;
}

/** Per-biome track shape parameters. */
const STYLE: Record<BiomeId, Style> = {
  sewer: { width: [8.5, 10.5], yaw: 0.02, pitch: [0.09, 0.16], motifs: { straight: 4, sbend: 3, sweep: 1.5, chicane: 0, drop: 1, squeeze: 1, hall: 1 } },
  industrial: { width: [9, 11], yaw: 0.024, pitch: [0.11, 0.2], motifs: { straight: 3, sbend: 2.5, sweep: 1.5, chicane: 1.5, drop: 1.5, squeeze: 2, hall: 0.5 } },
  cavern: { width: [10, 13], yaw: 0.03, pitch: [0.1, 0.24], motifs: { straight: 2, sbend: 2.5, sweep: 3, chicane: 0.5, drop: 2, squeeze: 1, hall: 2.5 } },
  ruins: { width: [9, 12], yaw: 0.026, pitch: [0.12, 0.22], motifs: { straight: 2.5, sbend: 3, sweep: 2, chicane: 1, drop: 1.5, squeeze: 1.5, hall: 2 } },
  abyss: { width: [8, 12], yaw: 0.032, pitch: [0.14, 0.26], motifs: { straight: 1.5, sbend: 2.5, sweep: 2.5, chicane: 2, drop: 3, squeeze: 2, hall: 1 } },
};

interface PlannedSeg { length: number; yaw: number; pitch: number; width: number }

const BLOCK = CONFIG.biome.length;
const TRANS = CONFIG.biome.transitionLength;
const INTRO = 150;
/** Fairness parameters used while generating (a bit stricter than validateLayout defaults). */
const GEN_VLAT = CORRIDOR_DEFAULTS.vLat;

export class TrackGenerator implements SegmentSource {
  private plan: SegmentPlan[] = [];
  private served = 0;
  private planRng: RNG;
  private planEnd = 0;
  private planBlock = 0;
  private widths = new WidthModel();

  private obsRng: RNG;
  private specs: ObstacleSpec[] = [];
  private obsCursor = 165;
  private cstate: CorridorState = initialCorridor();
  private schedule: BiomeId[] = [];

  constructor(private seed = (Math.random() * 1e9) | 0) {
    this.planRng = new RNG(hash(seed ^ 0x5eed1));
    this.obsRng = new RNG(hash(seed ^ 0xabcdef1));
  }

  /* ---------------- biome schedule ---------------- */

  /** Biome of block k. Cycle 0 is the canonical order; later cycles: sewer first, rest shuffled. */
  biomeOfBlock(k: number): BiomeId {
    const n = BIOME_ORDER.length;
    const cycle = Math.floor(k / n);
    const i = k % n;
    if (cycle === 0) return BIOME_ORDER[i];
    while (this.schedule.length <= cycle * n + n) {
      const c = Math.floor(this.schedule.length / n);
      if (c === 0) { this.schedule.push(...BIOME_ORDER); continue; }
      const rest = BIOME_ORDER.slice(1);
      const r = new RNG(hash(this.seed ^ (c * 7777 + 13)));
      for (let j = rest.length - 1; j > 0; j--) {
        const x = r.int(0, j);
        [rest[j], rest[x]] = [rest[x], rest[j]];
      }
      this.schedule.push(BIOME_ORDER[0], ...rest);
    }
    return this.schedule[k];
  }

  biomeForDistance(s: number): { biome: BiomeId; next: BiomeId; local: number } {
    const k = Math.floor(s / BLOCK);
    return { biome: this.biomeOfBlock(k), next: this.biomeOfBlock(k + 1), local: s - k * BLOCK };
  }

  /* ---------------- segment plan ---------------- */

  nextSegment(s0: number): SegmentPlan {
    const idx = this.served++;
    this.ensurePlan(idx);
    const seg = this.plan[idx];
    void s0;
    return seg;
  }

  private ensurePlan(idx: number): void {
    while (this.plan.length <= idx) this.planNextBlock();
  }

  /** Make sure segments exist (and widths are known) up to distance s. */
  private ensurePlanTo(s: number): void {
    while (this.planEnd < s) this.planNextBlock();
  }

  private push(biome: BiomeId, p: PlannedSeg, toBiome?: BiomeId): void {
    const yaw = p.yaw;
    const seg: SegmentPlan = {
      index: this.plan.length,
      s0: this.planEnd,
      length: p.length,
      yawRate: yaw,
      pitch: p.pitch,
      roll: Math.max(-0.22, Math.min(0.22, -yaw * 6.5)),
      width: Math.max(CONFIG.track.minWidth, Math.min(CONFIG.track.maxWidth, p.width)),
      biome,
      toBiome,
      difficulty: difficultyAt(this.planEnd + p.length / 2),
    };
    this.plan.push(seg);
    this.widths.push(seg);
    this.planEnd += p.length;
  }

  private planNextBlock(): void {
    const k = this.planBlock++;
    const biome = this.biomeOfBlock(k);
    const next = this.biomeOfBlock(k + 1);
    const cycle = Math.floor(k / BIOME_ORDER.length);
    const r = this.planRng;
    const st = STYLE[biome];
    const hard = Math.min(cycle, 3);
    const blockStart = k * BLOCK;
    const bodyEnd = blockStart + BLOCK - TRANS;
    if (k === 0) this.push(biome, { length: INTRO, yaw: 0, pitch: 0.14, width: CONFIG.track.defaultWidth });
    let sign = r.chance(0.5) ? 1 : -1;
    let lastMotif: Motif = 'straight';
    while (this.planEnd < bodyEnd - 0.5) {
      const remaining = bodyEnd - this.planEnd;
      let motif = this.pickMotif(st, hard, lastMotif);
      if (remaining < 60 && (motif === 'sweep' || motif === 'chicane')) motif = 'straight';
      const yawMax = st.yaw * (1 + 0.15 * hard);
      const base = () => r.range(st.pitch[0], st.pitch[1]);
      const baseW = () => r.range(st.width[0], st.width[1]);
      const parts: PlannedSeg[] = [];
      const pitch = base();
      switch (motif) {
        case 'straight':
          parts.push({ length: r.range(50, 110 - 10 * hard), yaw: 0, pitch, width: baseW() });
          break;
        case 'sbend': {
          const a = yawMax * r.range(0.35, 0.8) * sign;
          const w = baseW();
          parts.push({ length: r.range(40, 65), yaw: a, pitch, width: w });
          parts.push({ length: r.range(40, 65), yaw: -a, pitch, width: w });
          break;
        }
        case 'sweep': {
          const len = r.range(90, 150);
          const y = Math.min(yawMax * r.range(0.55, 0.95), 2.4 / len) * sign;
          parts.push({ length: len, yaw: y, pitch, width: baseW() });
          sign = -sign;
          break;
        }
        case 'chicane': {
          const a = yawMax * r.range(0.7, 1.0) * sign;
          const w = baseW();
          for (let i = 0; i < 3; i++) parts.push({ length: r.range(30, 42), yaw: i % 2 ? -a : a, pitch, width: w });
          break;
        }
        case 'drop':
          parts.push({ length: r.range(55, 85), yaw: r.chance(0.5) ? 0 : yawMax * 0.3 * sign, pitch: Math.min(0.36, r.range(0.27, 0.33) + 0.01 * hard), width: baseW() });
          break;
        case 'squeeze':
          parts.push({ length: r.range(55, 85), yaw: yawMax * r.range(-0.3, 0.3), pitch, width: Math.max(CONFIG.track.minWidth, r.range(7.0, 7.8) - 0.15 * hard) });
          break;
        case 'hall':
          parts.push({ length: r.range(60, 100), yaw: yawMax * r.range(-0.4, 0.4), pitch: Math.max(0.08, pitch - 0.03), width: r.range(12, CONFIG.track.maxWidth) });
          break;
      }
      sign = r.chance(0.5) ? sign : -sign;
      lastMotif = motif;
      for (const p of parts) {
        const rem = bodyEnd - this.planEnd;
        if (rem < 1) break;
        let len = Math.min(p.length, rem);
        if (rem - len < 28) len = rem; // never leave a sliver
        this.push(biome, { ...p, length: len });
      }
    }
    // Transition into the next biome: calm segment blending towards its look.
    const ns = STYLE[next];
    this.push(
      biome,
      { length: TRANS, yaw: r.range(-0.008, 0.008), pitch: (STYLE[biome].pitch[0] + ns.pitch[0] + STYLE[biome].pitch[1] + ns.pitch[1]) / 4, width: (ns.width[0] + ns.width[1]) / 2 },
      next,
    );
  }

  private pickMotif(st: Style, hard: number, last: Motif): Motif {
    const r = this.planRng;
    const entries = (Object.entries(st.motifs) as [Motif, number][]).map(([m, w]) => {
      let x = w;
      if (m === last) x *= 0.3;
      if (hard > 0 && (m === 'chicane' || m === 'drop' || m === 'squeeze')) x *= 1 + 0.4 * hard;
      if (hard > 0 && m === 'straight') x *= 1 / (1 + 0.3 * hard);
      return [m, x] as [Motif, number];
    });
    let tot = 0;
    for (const [, w] of entries) tot += w;
    let x = r.next() * tot;
    for (const [m, w] of entries) {
      x -= w;
      if (x <= 0 && w > 0) return m;
    }
    return 'straight';
  }

  /* ---------------- obstacles ---------------- */

  /** Obstacles for a segment (those with s inside it). Idempotent; may be called in any order. */
  obstaclesFor(seg: SegmentPlan): ObstacleSpec[] {
    const end = seg.s0 + seg.length;
    this.planObstaclesTo(end + 1);
    const out: ObstacleSpec[] = [];
    for (const o of this.specs) {
      if (o.s >= end) break;
      if (o.s >= seg.s0) out.push(o);
    }
    return out;
  }

  /** First s >= s outside the quiet (breathing) zones: tutorial, around biome transitions. */
  private quietEnd(s: number): number {
    if (s < 165) return 165;
    const k = Math.floor(s / BLOCK);
    const local = s - k * BLOCK;
    if (local >= BLOCK - 30) return (k + 1) * BLOCK + 60;
    if (k >= 1 && local < 60) return k * BLOCK + 60;
    return s;
  }

  /** Start of the next quiet zone strictly after s. */
  private nextQuietStart(s: number): number {
    const k = Math.floor(s / BLOCK);
    return (k + 1) * BLOCK - 30;
  }

  private biomeAtS(s: number): BiomeId {
    const k = Math.floor(s / BLOCK);
    const local = s - k * BLOCK;
    if (local >= BLOCK - TRANS / 2) return this.biomeOfBlock(k + 1);
    return this.biomeOfBlock(k);
  }

  private planObstaclesTo(target: number): void {
    const widthAt = (s: number) => this.widths.at(s);
    let guard = 0;
    while (this.obsCursor < target && guard++ < 100000) {
      const q = this.quietEnd(this.obsCursor);
      if (q > this.obsCursor) { this.obsCursor = q; continue; }
      const sStart = this.obsCursor + 1.6;
      this.ensurePlanTo(sStart + 300);
      const block = Math.floor(sStart / BLOCK);
      const cycle = Math.floor(block / BIOME_ORDER.length);
      const d = Math.min(1, difficultyAt(sStart) + 0.07 * Math.min(cycle, 4));
      const g = 2.4 - 1.05 * d;
      const r = this.obsRng;
      const v = speedAt(sStart);
      const st = this.cstate;
      const freeEst = st.freeT + Math.max(0, sStart - 1.6 - st.s) / v;
      const reach = Math.max(0, GEN_VLAT * (freeEst - CORRIDOR_DEFAULTS.reaction)) * 0.9;
      const opts: CorridorOpts = { ...CORRIDOR_DEFAULTS, minGap: g };
      let committed = false;
      let endS = sStart;
      for (let attempt = 0; attempt < 10 && !committed; attempt++) {
        const ctx: PatternCtx = {
          rng: r, s: sStart, d, cycle, kinds: kindsFor(this.biomeAtS(sStart), cycle), g,
          anchors: st.R, reach,
          wallAt: (s) => widthAt(s) / 2,
          usableAt: (s) => usableHalf(widthAt(s)),
          biomeAt: (s) => this.biomeAtS(s),
        };
        const pat = pickPattern(ctx);
        if (!pat) break;
        const specs = pat.build(ctx);
        if (!specs || !specs.length) continue;
        specs.sort((a, b) => a.s - b.s);
        let e = 0;
        for (const sp of specs) e = Math.max(e, sp.s + sp.depth / 2 + opts.radius);
        if (e > this.nextQuietStart(sStart) - 2) continue;
        this.ensurePlanTo(e + 10);
        const viol: Violation[] = [];
        const ns = advanceCorridor(cloneState(st), specs, e, widthAt, opts, { violations: viol });
        if (viol.length) continue;
        this.specs.push(...specs);
        this.cstate = ns;
        endS = e;
        committed = true;
      }
      if (!committed) { this.obsCursor += 25; continue; }
      // Time until the next pattern shrinks with difficulty; sometimes chain tightly.
      let dt = 2.6 - 1.75 * d + r.range(0, 0.55);
      if (r.chance(0.12 + 0.2 * d)) dt = Math.max(0.75, dt * 0.55);
      this.obsCursor = endS + speedAt(endS) * dt;
    }
    // Memory: drop specs far behind.
    if (this.specs.length > 6000) this.specs.splice(0, 3000);
  }
}

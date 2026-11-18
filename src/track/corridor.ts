/**
 * Fairness engine: conservative "reachable corridor" simulation (pure, no THREE).
 *
 * The player moves along s at speedAt(s) and only controls lateral u. We track the set of
 * lateral CENTRE positions the player could be at, as a union of intervals (`R`), sweeping
 * along s in small pieces. In each piece:
 *   - every obstacle whose s-window (depth + player radius) overlaps the piece blocks the
 *     centre interval [u - hw - amp - r, u + hw + amp + r]; moving obstacles (slide / swing)
 *     are ALWAYS treated as occupying their whole swept range (worst case over time), falling
 *     debris counts as solid (it has landed long before the player arrives, see FALL_*),
 *   - the free set F is [-U, U] (U = usable half width at that s) minus the blocked intervals,
 *   - R_new = expand(R_old ∩ F, reach) ∩ F per connected component of F, where
 *     reach = vLat * Δt (Δt = piece length / speed). In stretches with no obstacle active, the
 *     reaction time (0.25 s) is deducted once per stretch,
 *   - components shorter than (minGap - 2r) are discarded (the clear gap between collider edges
 *     must be >= minGap, i.e. the centre slack >= minGap - 2r),
 *   - if R becomes empty: violation (no fair path).
 */
import { CONFIG } from '../core/config';
import { speedAt } from '../core/difficulty';
import type { ObstacleSpec, SegmentPlan } from '../core/types';

export interface Interval { lo: number; hi: number }

export interface CorridorOpts {
  /** Effective lateral speed (m/s) a bot/player can sustain (max is CONFIG.player.maxLateralSpeed, spring follow ~6-8). */
  vLat: number;
  /** Reaction time (s) deducted once per obstacle-free stretch. */
  reaction: number;
  /** Minimum clear gap (m) between collider edges (>= 2r + margin). */
  minGap: number;
  radius: number;
  /** Max piece length (m) for width sampling. */
  maxPiece: number;
}

export const CORRIDOR_DEFAULTS: CorridorOpts = {
  vLat: 6,
  reaction: 0.25,
  minGap: 1.25,
  radius: CONFIG.player.radius,
  maxPiece: 6,
};

/** ObstacleManager: falling debris lerps fall 0..1 in 0.9 s, collider active at fall >= 0.85. */
export const FALL_DURATION = 0.9;
export const FALL_ACTIVE_AT = 0.85;
export const FALL_LAND_TIME = FALL_DURATION * FALL_ACTIVE_AT;
/** Required lead (s) between debris landing and the player arriving. */
export const FALL_MIN_LEAD = 0.8;
/** Smallest viewDistance (Quality.ts) -> debris is spawned (and starts falling) at least this far ahead. */
export const MIN_VIEW_DISTANCE = 80;

/** Usable half width (player centre limit) for a track width; mirrors Spine.usableHalfWidth. */
export function usableHalf(width: number): number {
  return (width / 2) * CONFIG.track.usableFraction;
}

/** Replicates the Spine width smoothing so the generator knows the exact width at every s. */
export class WidthModel {
  private w: number[] = [CONFIG.track.defaultWidth];

  /** Segments must be pushed in order, contiguous. */
  push(seg: SegmentPlan): void {
    const k = 1 - Math.exp(-CONFIG.spine.step / 20);
    const end = seg.s0 + seg.length;
    for (let i = this.w.length; i < end; i++) {
      const prev = this.w[i - 1];
      this.w.push(prev + (seg.width - prev) * k);
    }
  }
  /** Highest s with known width. */
  get covered(): number { return this.w.length - 1; }
  at(s: number): number {
    const t = Math.max(0, s);
    const i = Math.min(Math.floor(t), this.w.length - 1);
    const j = Math.min(i + 1, this.w.length - 1);
    const a = t - Math.floor(t);
    return this.w[i] * (1 - a) + this.w[j] * a;
  }
}

export function widthModelFor(segments: readonly SegmentPlan[]): WidthModel {
  const m = new WidthModel();
  for (const s of segments) m.push(s);
  return m;
}

export interface CorridorState {
  s: number;
  R: Interval[];
  /** Obstacle-free time accumulated in the current stretch (s). */
  freeT: number;
}

export interface Violation { s: number; reason: string }

export interface CorridorPiece {
  s0: number;
  s1: number;
  /** Free centre intervals ([-U,U] minus worst-case blocked ranges). */
  F: Interval[];
  /** Reachable centre intervals at the end of the piece. */
  R: Interval[];
  blocked: boolean;
}

export function initialCorridor(width = CONFIG.track.defaultWidth): CorridorState {
  const U = usableHalf(width);
  return { s: 0, R: [{ lo: -U, hi: U }], freeT: 10 };
}

export function cloneState(st: CorridorState): CorridorState {
  return { s: st.s, R: st.R.map((i) => ({ ...i })), freeT: st.freeT };
}

interface Win { w0: number; w1: number; b0: number; b1: number }

/** Conservative blocked centre interval + s-window of an obstacle. */
function windowOf(o: ObstacleSpec, r: number): Win {
  const m = o.motion;
  const amp = m && (m.type === 'slide' || m.type === 'swing') ? Math.abs(m.amplitude ?? 2) : 0;
  return {
    w0: o.s - o.depth / 2 - r,
    w1: o.s + o.depth / 2 + r,
    b0: o.u - amp - o.halfWidth - r,
    b1: o.u + amp + o.halfWidth + r,
  };
}

/**
 * Advance the corridor from st.s to sTo through `specs` (any order; only those overlapping
 * matter). Returns the new state. Violations / pieces are appended to `out` when provided.
 */
export function advanceCorridor(
  st: CorridorState,
  specs: readonly ObstacleSpec[],
  sTo: number,
  widthAt: (s: number) => number,
  o: CorridorOpts,
  out?: { violations?: Violation[]; pieces?: CorridorPiece[] },
): CorridorState {
  const r = o.radius;
  const minC = Math.max(0, o.minGap - 2 * r);
  const wins = specs.map((sp) => windowOf(sp, r)).sort((a, b) => a.w0 - b.w0);
  // breakpoints
  const bp: number[] = [st.s, sTo];
  for (const w of wins) {
    if (w.w0 > st.s && w.w0 < sTo) bp.push(w.w0);
    if (w.w1 > st.s && w.w1 < sTo) bp.push(w.w1);
  }
  bp.sort((a, b) => a - b);
  const pts: number[] = [];
  for (let i = 0; i < bp.length - 1; i++) {
    const a = bp[i], b = bp[i + 1];
    if (b - a < 1e-6) continue;
    const n = Math.max(1, Math.ceil((b - a) / o.maxPiece));
    for (let k = 0; k < n; k++) pts.push(a + ((b - a) * k) / n);
  }
  pts.push(sTo);

  let R = st.R;
  let freeT = st.freeT;
  let wi = 0;
  let active: Win[] = [];
  for (let pi = 0; pi < pts.length - 1; pi++) {
    const a = pts[pi], b = pts[pi + 1];
    while (wi < wins.length && wins[wi].w0 < b - 1e-9) active.push(wins[wi++]);
    active = active.filter((w) => w.w1 > a + 1e-9);
    const U = Math.min(usableHalf(widthAt(a)), usableHalf(widthAt(b)));
    const dt = (b - a) / speedAt((a + b) / 2);
    let reach: number;
    const blocked = active.length > 0;
    if (blocked) {
      reach = o.vLat * dt;
      freeT = 0;
    } else {
      const before = Math.max(0, freeT - o.reaction);
      freeT += dt;
      reach = o.vLat * (Math.max(0, freeT - o.reaction) - before);
    }
    // free components
    const bl = active.map((w) => ({ lo: w.b0, hi: w.b1 })).sort((x, y) => x.lo - y.lo);
    const F: Interval[] = [];
    let x = -U;
    for (const iv of bl) {
      if (iv.lo > x) F.push({ lo: x, hi: Math.min(iv.lo, U) });
      x = Math.max(x, iv.hi);
      if (x >= U) break;
    }
    if (x < U) F.push({ lo: x, hi: U });
    const Fv = F.filter((c) => c.hi - c.lo >= 0 && c.lo < U + 1e-9 && c.hi > -U - 1e-9);
    // propagate
    let nR: Interval[] = [];
    for (const c of Fv) {
      let lo = Infinity, hi = -Infinity;
      for (const e of R) {
        const l = Math.max(e.lo, c.lo), h = Math.min(e.hi, c.hi);
        if (l <= h + 1e-9) { lo = Math.min(lo, l); hi = Math.max(hi, h); }
      }
      if (lo > hi) continue;
      const nl = Math.max(c.lo, lo - reach), nh = Math.min(c.hi, hi + reach);
      if (nh - nl >= minC - 1e-9) nR.push({ lo: nl, hi: nh });
    }
    if (nR.length === 0) {
      out?.violations?.push({
        s: a,
        reason: Fv.length === 0 ? 'no free space (row blocks the whole track)' : 'no reachable gap wide enough',
      });
      nR = Fv.filter((c) => c.hi - c.lo >= minC - 1e-9);
      if (nR.length === 0) nR = [{ lo: -U, hi: U }];
    }
    R = nR;
    out?.pieces?.push({ s0: a, s1: b, F: Fv, R: nR, blocked });
  }
  return { s: sTo, R, freeT };
}

export interface LayoutReport {
  ok: boolean;
  violations: Violation[];
  /** Smallest clear gap (centre slack + 2r) available to a reachable path in any blocked piece. */
  minClearGap: number;
  /** Number of obstacles. */
  count: number;
  pieces?: CorridorPiece[];
}

/**
 * PURE FAIRNESS CHECK (for tests). Verifies that a traversable, reachable path exists through
 * the whole layout given lateral speed `vLat` (default 6 m/s, 0.25 s reaction per free stretch),
 * minimal clear gap `minGap` (default 1.25 m), the usable width implied by `segments`, and that
 * falling debris lands >= 0.8 s before the player can arrive.
 */
export function validateLayout(
  specs: readonly ObstacleSpec[],
  segments: readonly SegmentPlan[],
  opts: Partial<CorridorOpts> & { record?: boolean } = {},
): LayoutReport {
  const o: CorridorOpts = { ...CORRIDOR_DEFAULTS, ...opts };
  const wm = widthModelFor(segments);
  const sorted = [...specs].sort((a, b) => a.s - b.s);
  const violations: Violation[] = [];
  const pieces: CorridorPiece[] = [];
  for (const sp of sorted) {
    if (sp.motion?.type === 'fall') {
      const v = speedAt(sp.s);
      const trig = Math.min(sp.motion.triggerAhead ?? 50, MIN_VIEW_DISTANCE);
      // time between landing and player arrival (player is at least `trig` m away at trigger time)
      const lead = trig / v - FALL_LAND_TIME;
      if (lead < FALL_MIN_LEAD - 1e-6) violations.push({ s: sp.s, reason: `falling debris lands only ${lead.toFixed(2)}s before arrival` });
    }
  }
  const last = sorted.length ? sorted[sorted.length - 1].s + 5 : 10;
  const st = advanceCorridor(initialCorridor(), sorted, last, (s) => wm.at(s), o, { violations, pieces });
  void st;
  let minClear = Infinity;
  for (const p of pieces) {
    if (!p.blocked) continue;
    let best = 0;
    for (const c of p.R) best = Math.max(best, c.hi - c.lo + 2 * o.radius);
    minClear = Math.min(minClear, best);
  }
  return { ok: violations.length === 0, violations, minClearGap: minClear, count: sorted.length, pieces: opts.record ? pieces : undefined };
}

/** Same sweep as validateLayout but returns the per-piece free intervals (worst-case blocked sets). */
export function computeCorridor(
  specs: readonly ObstacleSpec[],
  segments: readonly SegmentPlan[],
  opts: Partial<CorridorOpts> = {},
): CorridorPiece[] {
  return validateLayout(specs, segments, { ...opts, record: true }).pieces ?? [];
}

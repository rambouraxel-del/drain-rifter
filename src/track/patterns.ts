/**
 * Obstacle pattern library. Every pattern returns a list of ObstacleSpec (or null when it cannot
 * be built). The generator validates each candidate against the reachable-corridor engine
 * (corridor.ts) before committing it, so patterns only need to aim for sane geometry.
 *
 * Geometry convention: a "row" is a wall-to-wall line of blockers (same s, same depth) leaving
 * one or more clear gaps [a, b] (u of the collider edges). A gap of clear width w lets the player
 * centre move in an interval of length w - 2r.
 */
import { RNG } from '../core/rng';
import { speedAt } from '../core/difficulty';
import type { BiomeId, ObstacleKind, ObstacleSpec } from '../core/types';
import { CONFIG } from '../core/config';
import type { Interval } from './corridor';

const R = CONFIG.player.radius;

export interface KindInfo {
  /** span: one piece may stretch over a whole side (barriers, beams); solid: tiled from small props. */
  mode: 'span' | 'solid';
  hw: [number, number];
  depth: [number, number];
}

export const KIND_INFO: Partial<Record<ObstacleKind, KindInfo>> = {
  barrier: { mode: 'span', hw: [0.8, 5], depth: [0.9, 1.1] },
  beam: { mode: 'span', hw: [0.8, 5], depth: [0.8, 1.0] },
  grate: { mode: 'span', hw: [0.8, 5], depth: [1.2, 1.6] },
  root: { mode: 'span', hw: [0.8, 3], depth: [1.0, 1.4] },
  pipe: { mode: 'solid', hw: [0.6, 0.9], depth: [1.6, 2.4] },
  crate: { mode: 'solid', hw: [0.6, 0.9], depth: [1.2, 1.8] },
  debris: { mode: 'solid', hw: [0.5, 1.0], depth: [1.2, 2.0] },
  piston: { mode: 'solid', hw: [0.7, 1.0], depth: [1.2, 1.6] },
  fan: { mode: 'solid', hw: [1.0, 1.6], depth: [0.8, 1.2] },
  rock: { mode: 'solid', hw: [0.6, 1.5], depth: [1.4, 2.4] },
  stalagmite: { mode: 'solid', hw: [0.5, 0.9], depth: [1.0, 1.6] },
  boulder: { mode: 'solid', hw: [0.9, 1.5], depth: [2.0, 3.0] },
  pillar: { mode: 'solid', hw: [0.7, 0.8], depth: [1.4, 1.6] },
  statue: { mode: 'solid', hw: [0.75, 0.95], depth: [1.4, 1.8] },
  rubble: { mode: 'solid', hw: [0.7, 1.4], depth: [1.4, 2.2] },
  crystal: { mode: 'solid', hw: [0.6, 1.1], depth: [1.0, 1.6] },
  shard: { mode: 'solid', hw: [0.5, 0.9], depth: [0.9, 1.4] },
  orb: { mode: 'solid', hw: [0.6, 0.9], depth: [1.2, 1.2] },
  falling: { mode: 'solid', hw: [0.7, 1.3], depth: [1.4, 2.0] },
  slider: { mode: 'solid', hw: [0.8, 1.1], depth: [1.2, 1.2] },
  swinger: { mode: 'solid', hw: [0.9, 1.3], depth: [1.2, 1.2] },
};

export interface BiomeKinds {
  span: ObstacleKind[];
  solid: ObstacleKind[];
  /** Dynamic kinds available in this biome: slider | swinger | falling. */
  dyn: ObstacleKind[];
}

const BASE_KINDS: Record<BiomeId, BiomeKinds> = {
  sewer: { span: ['barrier', 'grate'], solid: ['crate', 'pipe', 'debris'], dyn: [] },
  industrial: { span: ['beam', 'barrier'], solid: ['piston', 'fan', 'crate'], dyn: ['slider'] },
  cavern: { span: ['root'], solid: ['rock', 'stalagmite', 'boulder'], dyn: ['falling'] },
  ruins: { span: [], solid: ['pillar', 'statue', 'rubble'], dyn: ['swinger', 'falling'] },
  abyss: { span: [], solid: ['crystal', 'shard', 'orb'], dyn: ['slider', 'swinger'] },
};
/** Extra dynamic kinds once the first biome cycle is done (harder variations). */
const CYCLE_DYN: Record<BiomeId, ObstacleKind[]> = {
  sewer: ['falling'],
  industrial: ['falling', 'swinger'],
  cavern: ['swinger'],
  ruins: ['slider'],
  abyss: ['falling'],
};

export function kindsFor(biome: BiomeId, cycle: number): BiomeKinds {
  const b = BASE_KINDS[biome];
  if (cycle <= 0) return b;
  return { span: b.span, solid: b.solid, dyn: [...b.dyn, ...CYCLE_DYN[biome].filter((k) => !b.dyn.includes(k))] };
}

export interface PatternCtx {
  rng: RNG;
  /** Centre s of the first row. */
  s: number;
  /** Effective difficulty 0..1. */
  d: number;
  cycle: number;
  kinds: BiomeKinds;
  /** Target clear gap (m) between collider edges. */
  g: number;
  /** Reachable centre intervals (before the first row). */
  anchors: Interval[];
  /** Estimated lateral reach (m) before the first row. */
  reach: number;
  /** Full half width (wall) and usable half width (player limit) at s. */
  wallAt(s: number): number;
  usableAt(s: number): number;
  biomeAt(s: number): BiomeId;
}

export interface PatternDef {
  name: string;
  minD: number;
  weight(c: PatternCtx): number;
  build(c: PatternCtx): ObstacleSpec[] | null;
}

/* ---------------- helpers ---------------- */

type Gap = [number, number];

function pickKind(c: PatternCtx, pref: 'span' | 'solid' | 'any'): ObstacleKind {
  const { span, solid } = c.kinds;
  if (pref === 'span' && span.length) return c.rng.pick(span);
  if (pref === 'solid' && solid.length) return c.rng.pick(solid);
  return c.rng.pick([...span, ...solid]);
}

function dynFalling(c: PatternCtx, s: number, spec: ObstacleSpec): void {
  // triggered early enough: landing (0.77 s after trigger) >= 0.8 s before arrival, with margin.
  spec.motion = { type: 'fall', triggerAhead: Math.ceil(speedAt(s) * 1.9 + 4) };
  void c;
}

function mk(c: PatternCtx, kind: ObstacleKind, s: number, u: number, hw: number, depth: number): ObstacleSpec {
  const spec: ObstacleSpec = { kind, s, u, halfWidth: hw, depth, biome: c.biomeAt(s), seed: c.rng.int(0, 999999999) };
  if (kind === 'falling') dynFalling(c, s, spec);
  return spec;
}

/** Fill [x0, x1] (u) with blockers of one kind. */
function fillRegion(c: PatternCtx, out: ObstacleSpec[], kind: ObstacleKind, s: number, x0: number, x1: number, depth: number): void {
  const w = x1 - x0;
  if (w < 0.45) return;
  const info = KIND_INFO[kind]!;
  const n = Math.max(1, Math.ceil(w / (2 * info.hw[1])));
  const hw = w / (2 * n);
  for (let i = 0; i < n; i++) out.push(mk(c, kind, s, x0 + hw * (2 * i + 1), hw, depth));
}

function rowDepth(c: PatternCtx, kind: ObstacleKind): number {
  const i = KIND_INFO[kind]!;
  return c.rng.range(i.depth[0], i.depth[1]);
}

/** Wall-to-wall row at s with clear gaps. */
function gateRow(c: PatternCtx, out: ObstacleSpec[], kind: ObstacleKind, s: number, gaps: Gap[], depth: number): void {
  const W = c.wallAt(s) + 0.2;
  const g = [...gaps].sort((a, b) => a[0] - b[0]);
  let x = -W;
  for (const [a, b] of g) {
    fillRegion(c, out, kind, s, x, a, depth);
    x = Math.max(x, b);
  }
  fillRegion(c, out, kind, s, x, W, depth);
}

/** Distance (m) between the centre-slack intervals of the closest pair of gaps of two rows. */
function minShift(a: Gap[], b: Gap[]): number {
  let best = Infinity;
  for (const [a0, a1] of a) {
    for (const [b0, b1] of b) {
      const la = a0 + R, ha = Math.max(la, a1 - R), lb = b0 + R, hb = Math.max(lb, b1 - R);
      best = Math.min(best, Math.max(0, lb - ha, la - hb));
    }
  }
  return best;
}

/** Row-to-row spacing (m between centres) so the player can shift `shift` metres with margin. */
function rowSpacing(s: number, shift: number, d1: number, d2: number): number {
  const dtFree = 0.25 + shift / 5.0 + 0.12;
  return (d1 + d2) / 2 + 2 * R + 0.1 + speedAt(s) * dtFree;
}

function gapWidth(c: PatternCtx, extra = 0): number {
  return c.g + extra * (1 - 0.7 * c.d) + c.rng.range(0, 0.35);
}

function pickCenter(c: PatternCtx, s: number, gw: number): number {
  const cmax = Math.max(0, c.usableAt(s) - Math.max(0, gw / 2 - R));
  let a = 0;
  if (c.anchors.length) {
    const iv = c.rng.pick(c.anchors);
    a = c.rng.range(iv.lo, iv.hi);
  }
  const x = a + c.rng.range(-c.reach, c.reach);
  return Math.max(-cmax, Math.min(cmax, x));
}

/** Emit consecutive rows given their gaps; spacing derived from gap-to-gap shifts. */
function emitRows(c: PatternCtx, rows: Gap[][], kind: ObstacleKind, depth: number, firstS = c.s): ObstacleSpec[] {
  const out: ObstacleSpec[] = [];
  let s = firstS;
  for (let i = 0; i < rows.length; i++) {
    if (i > 0) s += rowSpacing(s, minShift(rows[i - 1], rows[i]), depth, depth);
    gateRow(c, out, kind, s, rows[i], depth);
  }
  return out;
}

function dynKindChoice(c: PatternCtx, only?: ObstacleKind[]): ObstacleKind | null {
  const list = c.kinds.dyn.filter((k) => !only || only.includes(k));
  return list.length ? c.rng.pick(list) : null;
}

/* ---------------- patterns ---------------- */

/** One blocker hugging a wall; everything else is free. */
const single: PatternDef = {
  name: 'single',
  minD: 0,
  weight: (c) => 3 * (1 - c.d) + 0.4,
  build(c) {
    const kind = pickKind(c, 'any');
    const depth = rowDepth(c, kind);
    const W = c.wallAt(c.s);
    const sigma = c.rng.chance(0.5) ? 1 : -1;
    const maxBw = 2 * W - (c.g + 0.8);
    const bw = Math.min(maxBw, c.rng.range(1.4, W * 1.2));
    if (bw < 0.6) return null;
    const out: ObstacleSpec[] = [];
    const x0 = sigma > 0 ? W + 0.2 - bw : -W - 0.2;
    fillRegion(c, out, kind, c.s, x0, x0 + bw + 0.2, depth);
    return out;
  },
};

/** One blocker near the centre: go left or right. */
const center: PatternDef = {
  name: 'center',
  minD: 0,
  weight: () => 2,
  build(c) {
    const kind = pickKind(c, 'solid');
    const info = KIND_INFO[kind]!;
    const depth = rowDepth(c, kind);
    const hw = info.mode === 'span' ? c.rng.range(0.9, 1.5) : c.rng.range(info.hw[0], info.hw[1]);
    const lim = c.usableAt(c.s) * 0.6;
    let a = 0;
    if (c.anchors.length) { const iv = c.rng.pick(c.anchors); a = c.rng.range(iv.lo, iv.hi); }
    const u = Math.max(-lim, Math.min(lim, a + c.rng.range(-1.2, 1.2)));
    return [mk(c, kind, c.s, u, hw, depth)];
  },
};

/** Wall-to-wall row with a single gap. */
const gate: PatternDef = {
  name: 'gate',
  minD: 0.04,
  weight: (c) => 2 + c.d,
  build(c) {
    const kind = pickKind(c, 'span');
    const depth = rowDepth(c, kind);
    const gw = gapWidth(c, 1.2);
    const cu = pickCenter(c, c.s, gw);
    return emitRows(c, [[[cu - gw / 2, cu + gw / 2]]], kind, depth);
  },
};

/** Two gaps separated by a central blocker. */
const twoGap: PatternDef = {
  name: 'twoGap',
  minD: 0.1,
  weight: (c) => 1.5 + c.d,
  build(c) {
    const kind = pickKind(c, 'any');
    const depth = rowDepth(c, kind);
    const W = c.wallAt(c.s);
    const gw = gapWidth(c, 0.4);
    const bw = c.rng.range(1.0, 2.0);
    const wall = (2 * W - 2 * gw - bw) / 2;
    if (wall < 0.5) return null;
    const bu = c.rng.range(-0.8, 0.8);
    const gaps: Gap[] = [
      [-W + wall + bu * 0.4, bu - bw / 2],
      [bu + bw / 2, W - wall + bu * 0.4],
    ];
    if (gaps[0][1] - gaps[0][0] < c.g || gaps[1][1] - gaps[1][0] < c.g) return null;
    return emitRows(c, [gaps], kind, depth);
  },
};

/** Gates whose gap alternates left/right. */
const slalom: PatternDef = {
  name: 'slalom',
  minD: 0.12,
  weight: (c) => 1 + 2 * c.d,
  build(c) {
    const kind = pickKind(c, 'any');
    const depth = rowDepth(c, kind);
    const n = Math.min(6, 3 + Math.floor(c.rng.next() * (1 + 3 * c.d)));
    const gw = gapWidth(c, 0.9);
    const U = c.usableAt(c.s);
    const A = Math.min(U * 0.55, c.rng.range(1.4, 2.4));
    const cmax = Math.max(0, U - Math.max(0, gw / 2 - R));
    let cu = pickCenter(c, c.s, gw);
    let dir = c.rng.chance(0.5) ? 1 : -1;
    const rows: Gap[][] = [];
    for (let i = 0; i < n; i++) {
      rows.push([[cu - gw / 2, cu + gw / 2]]);
      if (cu + dir * 2 * A > cmax || cu + dir * 2 * A < -cmax) dir = -dir;
      cu = Math.max(-cmax, Math.min(cmax, cu + dir * 2 * A));
    }
    return emitRows(c, rows, kind, depth);
  },
};

/** Gap narrows row by row down to the minimum. */
const funnel: PatternDef = {
  name: 'funnel',
  minD: 0.2,
  weight: (c) => 1 + c.d,
  build(c) {
    const kind = pickKind(c, 'any');
    const depth = rowDepth(c, kind);
    const m = 4 + Math.floor(c.rng.next() * 3);
    const W = c.wallAt(c.s);
    let cu = pickCenter(c, c.s, c.g + 1);
    const rows: Gap[][] = [];
    for (let i = 0; i < m; i++) {
      const k = i / (m - 1);
      const gw = (W * 1.5) * (1 - k) + (c.g + 0.05) * k;
      const cmax = Math.max(0, c.usableAt(c.s) - Math.max(0, gw / 2 - R));
      cu = Math.max(-cmax, Math.min(cmax, cu + c.rng.range(-0.5, 0.5)));
      rows.push([[cu - gw / 2, cu + gw / 2]]);
    }
    if (c.rng.chance(0.5)) {
      const last = rows[rows.length - 1];
      rows.push([[last[0][0], last[0][1]]]);
    }
    return emitRows(c, rows, kind, depth);
  },
};

/** Staggered half-rows forcing the player to zig-zag across the centre. */
const stagger: PatternDef = {
  name: 'stagger',
  minD: 0.25,
  weight: (c) => 2.5 * c.d,
  build(c) {
    const kind = pickKind(c, 'any');
    const depth = rowDepth(c, kind);
    const m = 3 + Math.floor(c.rng.next() * (1 + 2 * c.d));
    const W = c.wallAt(c.s);
    let sigma = c.rng.chance(0.5) ? 1 : -1; // side that is FREE
    const rows: Gap[][] = [];
    for (let i = 0; i < m; i++) {
      const p = c.rng.range(-0.3, 0.7);
      const free: Gap = sigma > 0 ? [p, W + 0.2] : [-W - 0.2, -p];
      if (free[1] - free[0] < c.g + 0.4) return null;
      rows.push([free]);
      sigma = -sigma;
    }
    return emitRows(c, rows, kind, depth);
  },
};

/** Moving slider / swinger sweeping part of the width, a permanent free lane remains. */
function movingBuild(c: PatternCtx, kind: ObstacleKind): ObstacleSpec[] | null {
  const info = KIND_INFO[kind]!;
  const hs = c.rng.range(info.hw[0], info.hw[1]);
  const depth = info.depth[0];
  const W = c.wallAt(c.s);
  const centered = c.rng.chance(0.5);
  const gl = c.g + 0.35;
  const out: ObstacleSpec[] = [];
  const period = c.rng.range(2.4 - 0.6 * c.d, 3.4 - 0.8 * c.d);
  const phase = c.rng.next() * Math.PI * 2;
  let u: number, amp: number;
  if (centered) {
    // free lanes on both sides, each >= gl
    const sw = 2 * W - 2 * gl; // total swept span available
    const half = sw / 2;
    if (half < hs + 0.3) return null;
    amp = Math.min(half - hs, c.rng.range(0.8, 2.2));
    u = c.rng.range(-0.4, 0.4);
  } else {
    // one free lane of width >= gl on side sigma
    const sigma = c.rng.chance(0.5) ? 1 : -1;
    const span = 2 * W - gl - 0.2; // swept span on the other side
    const half = span / 2;
    if (half < hs + 0.3) return null;
    amp = Math.min(half - hs, c.rng.range(0.8, 2.4));
    u = -sigma * (W - half); // centre of the swept span, hugging the wall opposite the free lane
  }
  const spec: ObstacleSpec = {
    kind, s: c.s, u, halfWidth: hs, depth, biome: c.biomeAt(c.s), seed: c.rng.int(0, 999999999),
    motion: { type: kind === 'slider' ? 'slide' : 'swing', amplitude: amp, period, phase },
  };
  out.push(spec);
  return out;
}

const moving: PatternDef = {
  name: 'moving',
  minD: 0.12,
  weight: (c) => (c.kinds.dyn.some((k) => k === 'slider' || k === 'swinger') ? 3.5 : 0),
  build(c) {
    const k = dynKindChoice(c, ['slider', 'swinger']);
    if (!k) return null;
    const first = movingBuild(c, k);
    if (!first) return null;
    // At higher difficulty chain a second mover with a different lane.
    if (c.d > 0.45 && c.rng.chance(0.5)) {
      const c2: PatternCtx = { ...c, s: c.s + rowSpacing(c.s, 3.0, 1.2, 1.2) };
      const second = movingBuild(c2, k);
      if (second) first.push(...second);
    }
    return first;
  },
};

/** Falling debris gate(s): lands ahead of the player. */
const fallingGate: PatternDef = {
  name: 'fallingGate',
  minD: 0.1,
  weight: (c) => (c.kinds.dyn.includes('falling') ? 1.5 : 0),
  build(c) {
    const kind: ObstacleKind = 'falling';
    const depth = rowDepth(c, kind);
    const gw = gapWidth(c, 1.0);
    const cu = pickCenter(c, c.s, gw);
    return emitRows(c, [[[cu - gw / 2, cu + gw / 2]]], kind, depth);
  },
};

/** Collapse: a cluster of falling rubble in 2-3 consecutive rows. */
const collapse: PatternDef = {
  name: 'collapse',
  minD: 0.3,
  weight: (c) => (c.kinds.dyn.includes('falling') ? 1.1 : 0),
  build(c) {
    const kind: ObstacleKind = 'falling';
    const depth = rowDepth(c, kind);
    const n = 2 + (c.rng.chance(0.4 + 0.3 * c.d) ? 1 : 0);
    const gw = gapWidth(c, 0.7);
    const rows: Gap[][] = [];
    let cu = pickCenter(c, c.s, gw);
    const cmax = Math.max(0, c.usableAt(c.s) - Math.max(0, gw / 2 - R));
    for (let i = 0; i < n; i++) {
      rows.push([[cu - gw / 2, cu + gw / 2]]);
      cu = Math.max(-cmax, Math.min(cmax, cu + c.rng.range(-2.2, 2.2)));
    }
    return emitRows(c, rows, kind, depth);
  },
};

export const PATTERNS: PatternDef[] = [single, center, gate, twoGap, slalom, funnel, stagger, moving, fallingGate, collapse];

export function pickPattern(c: PatternCtx): PatternDef | null {
  const cands = PATTERNS.filter((p) => c.d + 1e-9 >= p.minD && p.weight(c) > 0);
  if (!cands.length) return null;
  let tot = 0;
  for (const p of cands) tot += p.weight(c);
  let x = c.rng.next() * tot;
  for (const p of cands) {
    x -= p.weight(c);
    if (x <= 0) return p;
  }
  return cands[cands.length - 1];
}

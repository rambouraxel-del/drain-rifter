import * as THREE from 'three';
import type { QualitySettings } from '../core/types';
import { makeFrame, type Spine } from '../track/Spine';
import { Ctx } from './decor/ctx';
import { ChunkKit } from './decor/kit';
import { buildSurface } from './decor/surface';
import { decorSewer } from './decor/sewer';
import { decorIndustrial } from './decor/industrial';
import { decorCavern } from './decor/cavern';
import { decorRuins } from './decor/ruins';
import { decorAbyss } from './decor/abyss';

/** Input for building one tunnel chunk. */
export interface ChunkBuildInput {
  spine: Spine;
  s0: number;
  s1: number;
  quality: QualitySettings;
  seed: number;
}

/**
 * CONTRACT: returns an Object3D whose position is the spine position at s0 and whose
 * children use LOCAL coordinates relative to that origin (world-space axes, no rotation).
 * The ChunkManager adds it to the scene and disposes it when it falls behind.
 * Geometries/materials created here must be disposable (shared materials must be cached
 * and NOT disposed — mark them with userData.shared = true).
 *
 * The returned group may carry `userData.update(dt)` (spinning fans...): the ChunkManager /
 * game loop should call it for chunks near the player.
 */
export type ChunkBuilder = (input: ChunkBuildInput) => THREE.Object3D;

/** How far (m) around a chunk decor is scanned for light emitters (painted light spill). */
const SPILL = 9;

function runDecor(ctx: Ctx, a: number, b: number): void {
  decorSewer(ctx, a, b);
  decorIndustrial(ctx, a, b);
  decorCavern(ctx, a, b);
  decorRuins(ctx, a, b);
  decorAbyss(ctx, a, b);
}

export const buildTunnelChunk: ChunkBuilder = ({ spine, s0, s1, quality }) => {
  const q: 0 | 1 | 2 = quality.level === 'low' ? 0 : quality.level === 'medium' ? 1 : 2;
  const origin = spine.frame(s0, makeFrame()).pos.clone();
  const kit = new ChunkKit();
  const ctx = new Ctx(kit, spine, s0, s1, q, origin);
  // Pass 1: light emitters only (includes neighbouring decor so light pools do not stop at chunk borders).
  kit.setPre(true);
  runDecor(ctx, Math.max(spine.start + 2, s0 - SPILL), Math.min(spine.end - 2, s1 + SPILL));
  kit.setPre(false);
  // Pass 2: real decor, then terrain tinted by the emitters.
  runDecor(ctx, s0, s1);
  buildSurface(ctx);
  return kit.finish(origin);
};

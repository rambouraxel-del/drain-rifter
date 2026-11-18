import * as THREE from 'three';
import { CONFIG } from '../core/config';
import type { QualitySettings } from '../core/types';
import type { Spine } from '../track/Spine';
import type { ChunkBuilder } from './TunnelBuilder';

interface Chunk { s0: number; s1: number; obj: THREE.Object3D }

/** Distance ahead of the player (m) that must ALWAYS be built, regardless of the frame time budget. */
const MUST_BUILD_AHEAD = 60;
/** Soft per-frame time budget (ms) for building chunks beyond MUST_BUILD_AHEAD. */
const BUILD_BUDGET_MS = 3;

/**
 * Streams tunnel chunks in front of the player and disposes those behind.
 * Chunk objects may define `userData.update(dt, time)`; it is called every frame while the chunk is alive.
 */
export class ChunkManager {
  private chunks: Chunk[] = [];
  private nextS = 0;
  private time = 0;
  private lastNow = 0;
  readonly root = new THREE.Group();

  constructor(private spine: Spine, private builder: ChunkBuilder, private quality: () => QualitySettings, private seed: number) {
    this.root.name = 'chunks';
  }

  reset(startS = 0): void {
    for (const c of this.chunks) this.disposeChunk(c);
    this.chunks = [];
    this.nextS = Math.max(0, Math.floor((startS - CONFIG.spine.behind) / CONFIG.chunk.length) * CONFIG.chunk.length);
  }

  /**
   * Build chunks ahead of the player. The first 60 m are always built; further chunks are limited to
   * `maxBuilds` and ~3 ms per call. `maxBuilds >= 20` builds everything synchronously (pre-build / teleport).
   * `dt` is optional (measured internally when omitted); it only feeds the per-chunk update hooks.
   */
  update(playerS: number, maxBuilds = 2, dt?: number): void {
    const now = performance.now();
    if (dt === undefined) dt = this.lastNow ? Math.min(0.1, (now - this.lastNow) / 1000) : 0;
    this.lastNow = now;
    this.time += dt;

    const q = this.quality();
    const ahead = Math.min(CONFIG.spine.ahead, q.viewDistance + 30);
    const must = Math.min(ahead, MUST_BUILD_AHEAD);
    const sync = maxBuilds >= 20;
    let optional = 0;
    while (this.nextS < playerS + ahead) {
      const mandatory = sync || this.nextS < playerS + must;
      if (!mandatory) {
        if (optional >= maxBuilds || performance.now() - now >= BUILD_BUDGET_MS) break;
        optional++;
      }
      const s0 = this.nextS;
      const s1 = s0 + CONFIG.chunk.length;
      this.spine.ensure(s1 + 2);
      const obj = this.builder({ spine: this.spine, s0, s1, quality: q, seed: this.seed ^ Math.floor(s0) });
      this.root.add(obj);
      this.chunks.push({ s0, s1, obj });
      this.nextS = s1;
    }
    while (this.chunks.length && this.chunks[0].s1 < playerS - CONFIG.spine.behind) {
      this.disposeChunk(this.chunks.shift()!);
    }
    if (dt > 0) {
      for (const c of this.chunks) {
        const fn = c.obj.userData.update as ((dt: number, time: number) => void) | undefined;
        if (typeof fn === 'function') fn(dt, this.time);
      }
    }
  }

  get count(): number { return this.chunks.length; }

  private disposeChunk(c: Chunk): void {
    this.root.remove(c.obj);
    disposeObject(c.obj);
  }
}

/** Dispose geometries & non-shared materials of an object tree. */
export function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (mat) {
      for (const x of Array.isArray(mat) ? mat : [mat]) if (!x.userData.shared) x.dispose();
    }
  });
}

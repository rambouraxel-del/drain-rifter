import * as THREE from 'three';
import { CONFIG } from '../core/config';
import type { QualitySettings } from '../core/types';
import type { Spine } from '../track/Spine';
import type { ChunkBuilder } from './TunnelBuilder';

interface Chunk { s0: number; s1: number; obj: THREE.Object3D }

/** Streams tunnel chunks in front of the player and disposes those behind. */
export class ChunkManager {
  private chunks: Chunk[] = [];
  private nextS = 0;
  readonly root = new THREE.Group();

  constructor(private spine: Spine, private builder: ChunkBuilder, private quality: () => QualitySettings, private seed: number) {
    this.root.name = 'chunks';
  }

  reset(startS = 0): void {
    for (const c of this.chunks) this.disposeChunk(c);
    this.chunks = [];
    this.nextS = Math.max(0, Math.floor((startS - CONFIG.spine.behind) / CONFIG.chunk.length) * CONFIG.chunk.length);
  }

  /** Build at most `maxBuilds` chunks per call to avoid frame spikes. */
  update(playerS: number, maxBuilds = 2): void {
    const q = this.quality();
    const ahead = Math.min(CONFIG.spine.ahead, q.viewDistance + 30);
    let built = 0;
    while (this.nextS < playerS + ahead && built < maxBuilds) {
      const s0 = this.nextS;
      const s1 = s0 + CONFIG.chunk.length;
      this.spine.ensure(s1 + 2);
      const obj = this.builder({ spine: this.spine, s0, s1, quality: q, seed: this.seed ^ Math.floor(s0) });
      this.root.add(obj);
      this.chunks.push({ s0, s1, obj });
      this.nextS = s1;
      built++;
    }
    while (this.chunks.length && this.chunks[0].s1 < playerS - CONFIG.spine.behind) {
      this.disposeChunk(this.chunks.shift()!);
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
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (mat) {
      for (const x of Array.isArray(mat) ? mat : [mat]) if (!x.userData.shared) x.dispose();
    }
  });
}

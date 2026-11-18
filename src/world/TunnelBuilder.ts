import * as THREE from 'three';
import { CONFIG } from '../core/config';
import type { QualitySettings } from '../core/types';
import { makeFrame, profileHeight, type Spine } from '../track/Spine';
import { BIOMES, blendColor } from './biomes';

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
 */
export type ChunkBuilder = (input: ChunkBuildInput) => THREE.Object3D;

let sharedMat: THREE.MeshLambertMaterial | null = null;
function tunnelMaterial(): THREE.MeshLambertMaterial {
  if (!sharedMat) {
    sharedMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
    sharedMat.userData.shared = true;
  }
  return sharedMat;
}

/** Placeholder builder: a smooth half-pipe + vault. Replaced by the Environments agent. */
export const buildTunnelChunk: ChunkBuilder = ({ spine, s0, s1 }) => {
  const group = new THREE.Group();
  const f = makeFrame();
  spine.frame(s0, f);
  const origin = f.pos.clone();
  group.position.copy(origin);

  const rings = CONFIG.chunk.rings;
  const cols = 28;
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const p = new THREE.Vector3();
  for (let i = 0; i <= rings; i++) {
    const s = s0 + ((s1 - s0) * i) / rings;
    spine.frame(s, f);
    const look = BIOMES[f.blend > 0.5 ? f.nextBiome : f.biome];
    const half = f.width / 2;
    for (let j = 0; j <= cols; j++) {
      const a = j / cols; // 0..1 around the cross-section
      let u: number, h: number;
      const surf = 0.55; // fraction of columns used by the sliding surface
      if (a < surf) {
        u = (a / surf - 0.5) * 2 * half * 1.08;
        h = profileHeight(u, f.width);
      } else {
        // vault from right top over to left top
        const t = (a - surf) / (1 - surf);
        const ang = t * Math.PI;
        const r0 = profileHeight(half * 1.08, f.width);
        const R = half * 1.08;
        u = Math.cos(ang) * R;
        h = r0 + Math.sin(ang) * R * (look.closed ? 1 : 1.8);
      }
      p.copy(f.pos).addScaledVector(f.right, u).addScaledVector(f.up, h).sub(origin);
      pos.push(p.x, p.y, p.z);
      const floorish = a < surf ? 1 - Math.abs(u) / half : 0;
      blendColor(f.biome, f.nextBiome, f.blend, floorish > 0.35 ? 'floor' : 'wall', c);
      const n = 0.85 + 0.15 * Math.sin(s * 1.7 + j * 2.3);
      col.push(c.r * n, c.g * n, c.b * n);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j;
      const b = a + cols + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, tunnelMaterial());
  group.add(mesh);
  return group;
};

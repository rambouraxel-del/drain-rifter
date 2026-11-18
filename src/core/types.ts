/**
 * SHARED CONTRACTS — owned by the lead. Do not change signatures without coordination.
 *
 * Coordinate system ("track space"):
 *   s = distance along the track spine in meters (monotonic, starts at 0).
 *   u = lateral offset from the spine centre in meters (+u = player's right).
 *   The surface is a half-pipe: height above the spine at offset u is profileHeight(u, width).
 * World positions are double precision in JS; meshes keep LOCAL geometry and are
 * positioned at a chunk origin so float32 precision on the GPU stays fine for very long runs.
 */
import type * as THREE from 'three';

export type BiomeId = 'sewer' | 'industrial' | 'cavern' | 'ruins' | 'abyss';
export const BIOME_ORDER: BiomeId[] = ['sewer', 'industrial', 'cavern', 'ruins', 'abyss'];

/** One piece of the track plan, produced by the TrackGenerator, consumed by Spine. */
export interface SegmentPlan {
  /** Index in the global plan sequence. */
  index: number;
  /** Start distance (m) along the spine. */
  s0: number;
  /** Length in meters. */
  length: number;
  /** Turn rate (radians per meter, + = turn right). Target value reached smoothly. */
  yawRate: number;
  /** Downward slope angle in radians (positive = going down). */
  pitch: number;
  /** Bank / roll angle in radians (+ = right side lower). Small values only. */
  roll: number;
  /** Full track width in meters (wall to wall). */
  width: number;
  biome: BiomeId;
  /** If set, this segment is a transition from `biome` to `toBiome` across its length. */
  toBiome?: BiomeId;
  /** Difficulty 0..1 at this segment (used for obstacle density). */
  difficulty: number;
}

/** A sampled frame on the spine. */
export interface SpineFrame {
  s: number;
  pos: THREE.Vector3;
  fwd: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  width: number;
  biome: BiomeId;
  /** Biome we are blending towards (same as biome when not in a transition). */
  nextBiome: BiomeId;
  /** 0..1 blend factor towards nextBiome. */
  blend: number;
  segIndex: number;
}

/** Lateral collision interval in track space. Deadly on contact. */
export interface Collider {
  s0: number;
  s1: number;
  u0: number;
  u1: number;
}

export type ObstacleKind =
  | 'rock' | 'debris' | 'pipe' | 'barrier' | 'crate' | 'grate'
  | 'fan' | 'piston' | 'beam' | 'saw'
  | 'stalagmite' | 'boulder' | 'root'
  | 'pillar' | 'statue' | 'rubble'
  | 'crystal' | 'shard' | 'orb'
  | 'falling' | 'swinger' | 'slider';

export interface ObstacleSpec {
  kind: ObstacleKind;
  /** Track-space position of the obstacle centre. */
  s: number;
  u: number;
  /** Lateral half-extent (m). */
  halfWidth: number;
  /** Extent along s (m). */
  depth: number;
  biome: BiomeId;
  /** Motion pattern for moving obstacles. */
  motion?: {
    type: 'slide' | 'fall' | 'swing';
    /** slide: lateral amplitude (m). */
    amplitude?: number;
    /** Oscillation period (s). */
    period?: number;
    phase?: number;
    /** fall: distance ahead of the player (m) at which the fall is triggered. */
    triggerAhead?: number;
  };
  seed: number;
}

export interface QualitySettings {
  level: 'low' | 'medium' | 'high';
  pixelRatio: number;
  viewDistance: number;
  particles: number;
  shadows: boolean;
}

export interface Settings {
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
  sensitivity: number; // 0.5..2
  quality: 'auto' | 'low' | 'medium' | 'high';
  showFps: boolean;
}

export type GameState = 'menu' | 'intro' | 'playing' | 'paused' | 'dying' | 'gameover';

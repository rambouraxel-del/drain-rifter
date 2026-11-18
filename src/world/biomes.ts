import * as THREE from 'three';
import type { BiomeId } from '../core/types';

/** Visual atmosphere of a biome. Environments agent owns the values. */
export interface BiomeLook {
  name: string;
  fog: number;
  fogNear: number;
  fogFar: number;
  /** Background / clear colour (usually = fog). */
  sky: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  key: number;
  keyIntensity: number;
  /** Light that travels with the player (lantern-like). */
  playerLight: number;
  playerLightIntensity: number;
  floor: number;
  wall: number;
  accent: number;
  /** Is the tunnel closed overhead (tube) or open (cavern / abyss)? */
  closed: boolean;
}

export const BIOMES: Record<BiomeId, BiomeLook> = {
  sewer: {
    name: 'Les Égouts', fog: 0x1b2a2e, fogNear: 12, fogFar: 150, sky: 0x1b2a2e,
    hemiSky: 0x8fb3b8, hemiGround: 0x2a2620, hemiIntensity: 1.1, key: 0xffd28a, keyIntensity: 0.8,
    playerLight: 0xffc070, playerLightIntensity: 22, floor: 0x5a6a68, wall: 0x6e6e66, accent: 0xffb347, closed: true,
  },
  industrial: {
    name: 'Profondeurs Industrielles', fog: 0x2a1d16, fogNear: 10, fogFar: 140, sky: 0x2a1d16,
    hemiSky: 0xc0a080, hemiGround: 0x201812, hemiIntensity: 1.0, key: 0xff9a50, keyIntensity: 0.9,
    playerLight: 0xff9a50, playerLightIntensity: 22, floor: 0x5b5048, wall: 0x6b5a4a, accent: 0xff6a20, closed: true,
  },
  cavern: {
    name: 'Les Cavernes', fog: 0x0f2226, fogNear: 14, fogFar: 170, sky: 0x0f2226,
    hemiSky: 0x6fd6d0, hemiGround: 0x1a1612, hemiIntensity: 1.0, key: 0x9fe8ff, keyIntensity: 0.6,
    playerLight: 0xffb070, playerLightIntensity: 20, floor: 0x5b5550, wall: 0x4e4844, accent: 0x40f0e0, closed: false,
  },
  ruins: {
    name: 'Les Ruines Oubliées', fog: 0x2b2a40, fogNear: 14, fogFar: 180, sky: 0x2b2a40,
    hemiSky: 0xb0a8e0, hemiGround: 0x2a2420, hemiIntensity: 1.1, key: 0xffc890, keyIntensity: 0.8,
    playerLight: 0xffb070, playerLightIntensity: 18, floor: 0x6a6670, wall: 0x75707a, accent: 0xff9a40, closed: false,
  },
  abyss: {
    name: "L'Abîme", fog: 0x2a1840, fogNear: 12, fogFar: 170, sky: 0x2a1840,
    hemiSky: 0xd0a0ff, hemiGround: 0x1a1030, hemiIntensity: 1.1, key: 0xff9ad8, keyIntensity: 0.7,
    playerLight: 0xc890ff, playerLightIntensity: 22, floor: 0x5a4a78, wall: 0x4a3a6a, accent: 0xb070ff, closed: false,
  },
};

const _a = new THREE.Color();
const _b = new THREE.Color();
/** Blend a colour property between two biomes. */
export function blendColor(a: BiomeId, b: BiomeId, t: number, key: keyof BiomeLook, out: THREE.Color): THREE.Color {
  _a.setHex(BIOMES[a][key] as number);
  _b.setHex(BIOMES[b][key] as number);
  return out.copy(_a).lerp(_b, t);
}
export function blendNumber(a: BiomeId, b: BiomeId, t: number, key: keyof BiomeLook): number {
  return (BIOMES[a][key] as number) * (1 - t) + (BIOMES[b][key] as number) * t;
}

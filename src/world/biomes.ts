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
    name: 'Les Égouts', fog: 0x16262a, fogNear: 14, fogFar: 150, sky: 0x16262a,
    hemiSky: 0x9cc4d0, hemiGround: 0x3c4a4a, hemiIntensity: 1.25, key: 0xffd9a8, keyIntensity: 0.55,
    playerLight: 0xffdcaa, playerLightIntensity: 16, floor: 0x66777a, wall: 0x70797a, accent: 0xffb347, closed: true,
  },
  industrial: {
    name: 'Profondeurs Industrielles', fog: 0x23160f, fogNear: 12, fogFar: 145, sky: 0x23160f,
    hemiSky: 0xb8a692, hemiGround: 0x3a2a1e, hemiIntensity: 1.2, key: 0xffb070, keyIntensity: 0.5,
    playerLight: 0xffc080, playerLightIntensity: 16, floor: 0x6d6158, wall: 0x7a6a5c, accent: 0xff6a20, closed: true,
  },
  cavern: {
    name: 'Les Cavernes', fog: 0x0c2226, fogNear: 14, fogFar: 175, sky: 0x0c2226,
    hemiSky: 0x78e0dc, hemiGround: 0x2a4a50, hemiIntensity: 1.35, key: 0x9fe8ff, keyIntensity: 0.55,
    playerLight: 0xffd0a0, playerLightIntensity: 15, floor: 0x65605c, wall: 0x6a6764, accent: 0x40f0e0, closed: false,
  },
  ruins: {
    name: 'Les Ruines Oubliées', fog: 0x232440, fogNear: 14, fogFar: 185, sky: 0x232440,
    hemiSky: 0xb8b8f4, hemiGround: 0x4a4468, hemiIntensity: 1.35, key: 0xffd0a0, keyIntensity: 0.65,
    playerLight: 0xffd0a0, playerLightIntensity: 14, floor: 0x7e7a8a, wall: 0x8a8598, accent: 0xff9a40, closed: false,
  },
  abyss: {
    name: "L'Abîme", fog: 0x2a1844, fogNear: 12, fogFar: 175, sky: 0x2a1844,
    hemiSky: 0xd0a8ff, hemiGround: 0x1a1030, hemiIntensity: 1.2, key: 0xff9ad8, keyIntensity: 0.6,
    playerLight: 0xd0a0ff, playerLightIntensity: 16, floor: 0x5a4a78, wall: 0x54428a, accent: 0xb070ff, closed: false,
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

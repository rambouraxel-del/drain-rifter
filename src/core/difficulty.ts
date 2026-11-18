import { CONFIG } from './config';

/** Forward speed (m/s) as a function of distance travelled. Single source of truth. */
export function speedAt(distance: number): number {
  const { start, max, rampDistance } = CONFIG.speed;
  return start + (max - start) * (1 - Math.exp(-Math.max(0, distance) / rampDistance));
}

/** Difficulty 0..1 as a function of distance. */
export function difficultyAt(distance: number): number {
  return 1 - Math.exp(-Math.max(0, distance - 250) / 3400);
}

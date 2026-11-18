/** Global tuning constants. Gameplay agent owns the values; keep names stable. */
export const CONFIG = {
  spine: {
    /** Sample step in meters. */
    step: 1,
    /** How far ahead of the player the spine/track must exist (m). */
    ahead: 260,
    /** How far behind the player we keep things (m). */
    behind: 40,
  },
  track: {
    defaultWidth: 9,
    minWidth: 7,
    maxWidth: 13,
    /** Fraction of the half width that is flat floor; beyond it the wall curves up. */
    flatFraction: 0.45,
    /** Player may travel up to this fraction of the half width. */
    usableFraction: 0.86,
  },
  chunk: {
    /** Length of one rendered tunnel chunk (m). */
    length: 24,
    /** Rings per chunk (geometry resolution along s). */
    rings: 12,
  },
  player: {
    radius: 0.42,
    /** Max lateral speed (m/s). */
    maxLateralSpeed: 11,
    /** Lateral acceleration (m/s²) for keyboard steering. */
    lateralAccel: 55,
    /** Damping factor for lateral velocity when no input (1/s). */
    lateralDamping: 8,
    /** Spring stiffness when following a touch target (1/s²). */
    followStiffness: 140,
    followDamping: 20,
  },
  speed: {
    start: 15,
    max: 46,
    /** Distance (m) at which speed reaches ~63% of the way to max. */
    rampDistance: 2600,
  },
  biome: {
    /** Length of a biome (m) before transitioning. */
    length: 700,
    transitionLength: 90,
  },
  camera: {
    fovBase: 68,
    fovMaxBoost: 14,
    height: 2.5,
    distance: 4.6,
    lookAhead: 9,
  },
} as const;

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
    usableFraction: 0.9,
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
    maxLateralSpeed: 12,
    /** Lateral acceleration (m/s²) for keyboard steering. */
    lateralAccel: 60,
    /** Damping factor for lateral velocity when no input (1/s). */
    lateralDamping: 6,
    /** Spring stiffness when following a touch target (1/s²). */
    followStiffness: 95,
    followDamping: 16.5,
    /** Touch: 1 screen width of drag = this many track widths (at sensitivity 1). */
    dragGain: 1.25,
    /** Centrifugal drift strength in curves (subtle). */
    drift: 0.010,
    /** Extra pull towards the floor centre while riding up a wall (1/s²). */
    wallPull: 3.0,
  },
  speed: {
    start: 15,
    max: 45,
    /** Distance (m) at which speed reaches ~63% of the way to max. */
    rampDistance: 3000,
  },
  biome: {
    /** Length of a biome (m) before transitioning. */
    length: 700,
    transitionLength: 90,
  },
  camera: {
    fovBase: 68,
    fovMaxBoost: 14,
    height: 3.1,
    distance: 5.0,
    lookAhead: 9,
  },
} as const;

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { ObstacleManager } from '../src/obstacles/ObstacleManager';
import type { ObstacleSpec } from '../src/core/types';
import { Spine } from '../src/track/Spine';
import { FlatSource } from './support/segments';

const R = 0.42; // player radius (CONFIG.player.radius)

function spec(over: Partial<ObstacleSpec> = {}): ObstacleSpec {
  return {
    kind: 'rock',
    s: 100,
    u: 1,
    halfWidth: 0.5,
    depth: 2,
    biome: 'sewer',
    seed: 1,
    ...over,
  };
}

function setup(specs: ObstacleSpec[] = []) {
  const spine = new Spine(new FlatSource(9, 0));
  spine.ensure(1000);
  const factory = vi.fn(() => new THREE.Group());
  const mgr = new ObstacleManager(spine, factory);
  mgr.add(specs);
  return { spine, mgr, factory };
}

/** Spawn everything queued by advancing the player to `playerS` with no time passing. */
function spawn(mgr: ObstacleManager, playerS = 0, viewAhead = 500) {
  mgr.update(0, playerS, 0, viewAhead);
}

describe('ObstacleManager: collider math', () => {
  it('collider is the spec extent in track space (s +- depth/2, u +- halfWidth)', () => {
    const { mgr } = setup([spec({ s: 100, u: 1, halfWidth: 0.5, depth: 2 })]);
    spawn(mgr);
    const c = mgr.collider(mgr.all[0]);
    expect(c).not.toBeNull();
    expect(c!.s0).toBeCloseTo(99, 12);
    expect(c!.s1).toBeCloseTo(101, 12);
    expect(c!.u0).toBeCloseTo(0.5, 12);
    expect(c!.u1).toBeCloseTo(1.5, 12);
  });

  it('hits a circle whose centre is inside the collider', () => {
    const { mgr } = setup([spec()]);
    spawn(mgr);
    expect(mgr.hitTest(100, 1, R)).not.toBeNull();
    expect(mgr.hitTest(99.5, 0.6, R)).not.toBeNull();
  });

  it('hits a circle that only touches the edge from the side (within radius)', () => {
    const { mgr } = setup([spec()]); // u in [0.5, 1.5]
    spawn(mgr);
    expect(mgr.hitTest(100, 1.5 + R - 0.01, R)).not.toBeNull();
    expect(mgr.hitTest(100, 1.5 + R + 0.01, R)).toBeNull();
  });

  it('is exact at the lateral boundary (strict < r comparison)', () => {
    const { mgr } = setup([spec()]); // u1 = 1.5
    spawn(mgr);
    expect(mgr.hitTest(100, 1.5 + 0.41, R)).not.toBeNull(); // 0.41 < 0.42
    expect(mgr.hitTest(100, 1.5 + 0.43, R)).toBeNull(); // 0.43 > 0.42
  });

  it('is exact at the longitudinal boundary', () => {
    const { mgr } = setup([spec()]); // s1 = 101, s0 = 99
    spawn(mgr);
    expect(mgr.hitTest(101 + 0.41, 1, R)).not.toBeNull();
    expect(mgr.hitTest(101 + 0.43, 1, R)).toBeNull();
    expect(mgr.hitTest(99 - 0.41, 1, R)).not.toBeNull();
    expect(mgr.hitTest(99 - 0.43, 1, R)).toBeNull();
  });

  it('misses when the player is clearly outside, laterally or longitudinally', () => {
    const { mgr } = setup([spec()]);
    spawn(mgr);
    expect(mgr.hitTest(100, -3, R)).toBeNull();
    expect(mgr.hitTest(100, 5, R)).toBeNull();
    expect(mgr.hitTest(50, 1, R)).toBeNull();
    expect(mgr.hitTest(200, 1, R)).toBeNull();
  });

  it('returns the obstacle that is actually hit when several are present', () => {
    const left = spec({ s: 100, u: -2, seed: 1 });
    const right = spec({ s: 100, u: 2, seed: 2 });
    const { mgr } = setup([left, right]);
    spawn(mgr);
    expect(mgr.hitTest(100, 2, R)?.spec.seed).toBe(2);
    expect(mgr.hitTest(100, -2, R)?.spec.seed).toBe(1);
    expect(mgr.hitTest(100, 0, R)).toBeNull();
  });

  it('obstacles beyond the view distance are not spawned and cannot be hit', () => {
    const { mgr, factory } = setup([spec({ s: 500 })]);
    spawn(mgr, 0, 200);
    expect(mgr.all.length).toBe(0);
    expect(factory).not.toHaveBeenCalled();
    expect(mgr.hitTest(500, 1, R)).toBeNull();
  });

  it('spawns the obstacle once the player is within view distance', () => {
    const { mgr, factory } = setup([spec({ s: 500 })]);
    spawn(mgr, 0, 200);
    spawn(mgr, 350, 200);
    expect(mgr.all.length).toBe(1);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(mgr.hitTest(500, 1, R)).not.toBeNull();
  });

  it('removes obstacles that are well behind the player', () => {
    const { mgr } = setup([spec({ s: 100 })]);
    spawn(mgr);
    expect(mgr.all.length).toBe(1);
    mgr.update(0, 130, 0, 200);
    expect(mgr.all.length).toBe(0);
  });

  it('reset() clears live and pending obstacles', () => {
    const { mgr } = setup([spec({ s: 100 }), spec({ s: 900 })]);
    spawn(mgr);
    mgr.reset();
    expect(mgr.all.length).toBe(0);
    spawn(mgr, 0, 2000);
    expect(mgr.all.length).toBe(0);
  });
});

describe('ObstacleManager: moving obstacles', () => {
  it('slide obstacles move laterally and the collider follows the motion', () => {
    const { mgr } = setup([spec({ s: 100, u: 1, motion: { type: 'slide', amplitude: 2, period: 2, phase: 0 } })]);
    spawn(mgr);
    expect(mgr.all[0].u).toBeCloseTo(1, 9);
    // time = 0.5 s, period 2 s -> sin(pi/2) = 1 -> offset = amplitude
    mgr.update(0.5, 0, 0, 500);
    expect(mgr.all[0].u).toBeCloseTo(3, 9);
    expect(mgr.hitTest(100, 3, R)).not.toBeNull();
    expect(mgr.hitTest(100, 1, R)).toBeNull();
  });
});

describe('ObstacleManager: falling obstacles', () => {
  const fall = spec({ s: 100, u: 1, motion: { type: 'fall', triggerAhead: 50 } });

  it('has no collider before it lands, so it cannot hit the player in the air', () => {
    const { mgr } = setup([fall]);
    spawn(mgr, 60); // 40 m ahead, within the 50 m trigger -> starts falling
    expect(mgr.all.length).toBe(1);
    expect(mgr.all[0].fall).toBeGreaterThan(0);
    expect(mgr.all[0].fall).toBeLessThan(0.85);
    expect(mgr.collider(mgr.all[0])).toBeNull();
    expect(mgr.hitTest(100, 1, R)).toBeNull();
  });

  it('does not start falling until the player is within triggerAhead', () => {
    const { mgr } = setup([fall]);
    spawn(mgr, 0, 500); // 100 m ahead, trigger at 50 m
    mgr.update(0.5, 0, 0, 500);
    expect(mgr.all[0].fall).toBe(0);
    expect(mgr.collider(mgr.all[0])).toBeNull();
  });

  it('gains a collider once it has landed, and then hits as a normal obstacle', () => {
    const { mgr } = setup([fall]);
    const events: string[] = [];
    mgr.onEvent = (type) => events.push(type);
    spawn(mgr, 60);
    mgr.update(0.5, 60, 0, 500);
    expect(mgr.collider(mgr.all[0])).toBeNull();
    mgr.update(0.5, 60, 0, 500); // total 1 s > 0.9 s fall time
    expect(mgr.all[0].fall).toBe(1);
    expect(mgr.collider(mgr.all[0])).not.toBeNull();
    expect(mgr.hitTest(100, 1, R)).not.toBeNull();
    expect(events).toContain('fall-start');
    expect(events).toContain('fall-land');
  });

  it('a falling obstacle becomes collidable at 85% fall progress', () => {
    const { mgr } = setup([fall]);
    spawn(mgr, 60);
    // fall progress 0.0001 + dt / 0.9 ; choose dt so progress is just above 0.85
    mgr.update(0.9 * 0.86, 60, 0, 500);
    expect(mgr.all[0].fall).toBeGreaterThanOrEqual(0.85);
    expect(mgr.collider(mgr.all[0])).not.toBeNull();
  });
});

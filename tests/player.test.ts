import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/core/config';
import { speedAt } from '../src/core/difficulty';
import type { Input } from '../src/core/Input';
import type { SpineFrame } from '../src/core/types';
import { PlayerController } from '../src/player/PlayerController';
import { makeFrame, usableHalfWidth } from '../src/track/Spine';

/** Minimal stand-in for Input: only the members PlayerController reads. */
function fakeInput(opts: { drag?: number | (() => number); keyAxis?: number } = {}): Input {
  const drag = opts.drag ?? 0;
  return {
    keyAxis: opts.keyAxis ?? 0,
    consumeDrag: typeof drag === 'function' ? drag : () => drag,
  } as unknown as Input;
}

function frameWithWidth(width: number): SpineFrame {
  const f = makeFrame();
  f.width = width;
  return f;
}

const DT = 1 / 60;

describe('PlayerController: lateral limits', () => {
  it('stays within the usable half width under extreme drag to one side', () => {
    const p = new PlayerController();
    const frame = frameWithWidth(9);
    const lim = usableHalfWidth(9);
    const input = fakeInput({ drag: 5 }); // five screen widths per frame
    for (let i = 0; i < 1200; i++) {
      p.update(DT, input, frame, 0);
      expect(Math.abs(p.u)).toBeLessThanOrEqual(lim + 1e-9);
      expect(Number.isFinite(p.u)).toBe(true);
    }
    // Reaches the wall region (a wall-pull term may settle it slightly inside the limit).
    expect(p.u).toBeGreaterThan(lim * 0.9);
  });

  it('stays within the usable half width under extreme drag to the other side', () => {
    const p = new PlayerController();
    const frame = frameWithWidth(9);
    const lim = usableHalfWidth(9);
    const input = fakeInput({ drag: -5 });
    for (let i = 0; i < 1200; i++) {
      p.update(DT, input, frame, 0);
      expect(Math.abs(p.u)).toBeLessThanOrEqual(lim + 1e-9);
    }
    expect(p.u).toBeLessThan(-lim * 0.9);
  });

  it('stays within limits under maximal keyboard input for a long time', () => {
    const p = new PlayerController();
    const frame = frameWithWidth(CONFIG.track.minWidth);
    const lim = usableHalfWidth(CONFIG.track.minWidth);
    let axis = 1;
    for (let i = 0; i < 6000; i++) {
      // Flip direction every 0.5 s to exercise wall bounces both ways.
      if (i % 30 === 0) axis = -axis;
      p.update(DT, fakeInput({ keyAxis: axis }), frame, 0);
      expect(Math.abs(p.u)).toBeLessThanOrEqual(lim + 1e-9);
    }
  });

  it('keeps within limits when the drag is random and huge, mixed with curve drift', () => {
    const p = new PlayerController();
    const frame = frameWithWidth(13);
    const lim = usableHalfWidth(13);
    let seed = 1;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const input = fakeInput({ drag: () => (rnd() - 0.5) * 20, keyAxis: 0 });
    for (let i = 0; i < 5000; i++) {
      p.update(DT, input, frame, (rnd() - 0.5) * 0.2);
      expect(Math.abs(p.u)).toBeLessThanOrEqual(lim + 1e-9);
    }
  });

  it('adapts the limit when the track width changes between frames', () => {
    const p = new PlayerController();
    const input = fakeInput({ drag: 5 });
    for (let i = 0; i < 600; i++) p.update(DT, input, frameWithWidth(13), 0);
    expect(p.u).toBeGreaterThan(usableHalfWidth(13) * 0.9);
    // Narrow track: the player must be pulled back inside the new, smaller limit.
    p.update(DT, fakeInput({ drag: 0 }), frameWithWidth(7), 0);
    expect(Math.abs(p.u)).toBeLessThanOrEqual(usableHalfWidth(7) + 1e-9);
  });

  it('does not move laterally with no input on a straight track', () => {
    const p = new PlayerController();
    const frame = frameWithWidth(9);
    for (let i = 0; i < 300; i++) p.update(DT, fakeInput(), frame, 0);
    expect(p.u).toBeCloseTo(0, 9);
    expect(p.scraping).toBe(false);
  });

  it('keeps lateral speed within the configured maximum', () => {
    const p = new PlayerController();
    const frame = frameWithWidth(9);
    for (let i = 0; i < 300; i++) {
      p.update(DT, fakeInput({ drag: 3 }), frame, 0);
      expect(Math.abs(p.vu)).toBeLessThanOrEqual(CONFIG.player.maxLateralSpeed + 1e-9);
    }
  });

  it('lean stays within [-1, 1]', () => {
    const p = new PlayerController();
    const frame = frameWithWidth(9);
    for (let i = 0; i < 600; i++) {
      const drag = i % 120 < 60 ? 4 : -4;
      p.update(DT, fakeInput({ drag }), frame, 0);
      expect(p.lean).toBeGreaterThanOrEqual(-1);
      expect(p.lean).toBeLessThanOrEqual(1);
    }
  });
});

describe('PlayerController: forward motion', () => {
  it('reset() puts the player at the given distance with the start speed', () => {
    const p = new PlayerController();
    p.reset(0);
    expect(p.s).toBe(0);
    expect(p.speed).toBeCloseTo(CONFIG.speed.start, 9);
    expect(p.u).toBe(0);
  });

  it('s increases every frame', () => {
    const p = new PlayerController();
    p.reset(0);
    const frame = frameWithWidth(9);
    let prev = p.s;
    for (let i = 0; i < 600; i++) {
      p.update(DT, fakeInput(), frame, 0);
      expect(p.s).toBeGreaterThan(prev);
      prev = p.s;
    }
  });

  it('each frame advances s by speedAt(s) * dt', () => {
    const p = new PlayerController();
    p.reset(0);
    const frame = frameWithWidth(9);
    for (const start of [0, 1500, 6000]) {
      p.reset(start);
      p.update(0, fakeInput(), frame, 0); // dt 0 to pin the state
      const before = p.s;
      p.update(DT, fakeInput(), frame, 0);
      expect(p.s - before).toBeCloseTo(speedAt(before) * DT, 9);
    }
  });

  it('moves faster further along the track (speed increases with s)', () => {
    const frame = frameWithWidth(9);

    const near = new PlayerController();
    near.reset(0);
    near.update(DT, fakeInput(), frame, 0);
    const dNear = near.s;

    const far = new PlayerController();
    far.reset(0);
    far.s = 8000;
    far.update(DT, fakeInput(), frame, 0);
    const dFar = far.s - 8000;

    expect(dFar).toBeGreaterThan(dNear);
    expect(far.speed).toBeGreaterThan(near.speed);
    expect(far.speed).toBeLessThanOrEqual(CONFIG.speed.max + 1e-9);
  });

  it('covers distance steadily over a long simulated run without NaN', () => {
    const p = new PlayerController();
    p.reset(0);
    const frame = frameWithWidth(10);
    for (let i = 0; i < 60 * 600; i++) { // ten simulated minutes at 60 Hz
      p.update(DT, fakeInput({ keyAxis: Math.sin(i / 200) }), frame, 0);
    }
    expect(Number.isFinite(p.s)).toBe(true);
    expect(p.s).toBeGreaterThan(CONFIG.speed.start * 600 * 0.9);
    expect(p.speed).toBeLessThanOrEqual(CONFIG.speed.max + 1e-9);
  });
});

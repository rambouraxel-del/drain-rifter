import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/core/config';
import { Spine, makeFrame } from '../src/track/Spine';
import type { SegmentSource } from '../src/track/Spine';
import { TrackGenerator } from '../src/track/TrackGenerator';
import { StubSource } from './support/segments';

const DISTANCE = 30_000;

interface RunReport {
  nonFinite: number;
  widthOut: number;
  orthoBad: number;
  firstProblem: string | null;
  yStart: number;
  yEnd: number;
  /** y at each whole kilometre (index k = y at k * 1000 m). */
  yAtKm: number[];
  minWidth: number;
  maxWidth: number;
}

/**
 * Walks the spine the way the game does: ensure() ahead of the player and trim() behind,
 * checking every metre. Violations are counted rather than asserted per frame, which keeps
 * the 30 km run fast and gives one readable failure.
 */
function walk(source: SegmentSource, distance: number): RunReport {
  const spine = new Spine(source);
  const fr = makeFrame();
  const report: RunReport = {
    nonFinite: 0,
    widthOut: 0,
    orthoBad: 0,
    firstProblem: null,
    yStart: NaN,
    yEnd: NaN,
    yAtKm: [],
    minWidth: Infinity,
    maxWidth: -Infinity,
  };
  const flag = (msg: string) => { if (report.firstProblem === null) report.firstProblem = msg; };
  const { minWidth, maxWidth } = CONFIG.track;

  for (let s = 0; s <= distance; s += 1) {
    spine.ensure(s + CONFIG.spine.ahead);
    spine.trim(s - CONFIG.spine.behind);
    spine.frame(s, fr);

    const vals = [fr.pos.x, fr.pos.y, fr.pos.z, fr.fwd.x, fr.fwd.y, fr.fwd.z,
      fr.right.x, fr.right.y, fr.right.z, fr.up.x, fr.up.y, fr.up.z, fr.width];
    if (!vals.every(Number.isFinite)) {
      report.nonFinite++;
      flag(`non-finite frame at s=${s}`);
      continue;
    }
    if (fr.width < minWidth - 1e-6 || fr.width > maxWidth + 1e-6) {
      report.widthOut++;
      flag(`width ${fr.width} out of [${minWidth}, ${maxWidth}] at s=${s}`);
    }
    report.minWidth = Math.min(report.minWidth, fr.width);
    report.maxWidth = Math.max(report.maxWidth, fr.width);
    if (
      Math.abs(fr.fwd.length() - 1) > 1e-3 ||
      Math.abs(fr.right.length() - 1) > 1e-3 ||
      Math.abs(fr.up.length() - 1) > 1e-3 ||
      Math.abs(fr.fwd.dot(fr.right)) > 1e-3 ||
      Math.abs(fr.fwd.dot(fr.up)) > 1e-3 ||
      Math.abs(fr.right.dot(fr.up)) > 1e-3
    ) {
      report.orthoBad++;
      flag(`frame not orthonormal at s=${s}`);
    }
    if (s === 0) report.yStart = fr.pos.y;
    if (s % 1000 === 0) report.yAtKm[s / 1000] = fr.pos.y;
    report.yEnd = fr.pos.y;
  }
  return report;
}

function expectHealthy(report: RunReport, distance: number): void {
  expect(report.firstProblem).toBeNull();
  expect(report.nonFinite).toBe(0);
  expect(report.widthOut).toBe(0);
  expect(report.orthoBad).toBe(0);
  // Track descends on average: overall drop, and every kilometre is lower than the previous one.
  expect(report.yEnd).toBeLessThan(report.yStart - distance * 0.02);
  for (let k = 1; k < report.yAtKm.length; k++) {
    expect(report.yAtKm[k]).toBeLessThan(report.yAtKm[k - 1]);
  }
}

describe('Spine over a long run (30 km)', () => {
  it('stub source with extreme widths and sharp turns: no NaN, widths in bounds, descends', () => {
    const source = new StubSource({
      seed: 42,
      widthRange: [CONFIG.track.minWidth, CONFIG.track.maxWidth],
      yawRate: 0.05,
      pitchRange: [0.05, 0.3],
      lengthRange: [20, 120],
    });
    const report = walk(source, DISTANCE);
    expectHealthy(report, DISTANCE);
    // The stub is allowed to reach the extremes, so the spine should actually use the range.
    expect(report.maxWidth - report.minWidth).toBeGreaterThan(1);
  });

  it('real TrackGenerator: no NaN, widths in bounds, descends on average', () => {
    const report = walk(new TrackGenerator(20260321), DISTANCE);
    expectHealthy(report, DISTANCE);
  });

  it('real TrackGenerator, second seed, also healthy', () => {
    const report = walk(new TrackGenerator(7), DISTANCE);
    expectHealthy(report, DISTANCE);
  });
});

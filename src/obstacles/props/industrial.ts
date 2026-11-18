import * as THREE from 'three';
import type { ObstacleSpec } from '../../core/types';
import type { RNG } from '../../core/rng';
import { PI, add, blob, box, cyl, depthOf, geo, glow, hazardFaces, lamp, solid, taper, widthOf, type AnimHook } from './common';

/**
 * INDUSTRIAL props (beam, piston, fan, saw). Barrier, crate and slider are shared with other files.
 * Only parts that must move are flagged userData.dynamic. Symmetric parts (hubs, backing discs) stay
 * static so they can be merged, which keeps draw calls low.
 */

/** Solid steel girder wall with a hazard band on both faces and amber end lamps. */
export function buildBeam(spec: ObstacleSpec, _rng: RNG): THREE.Group {
  const g = new THREE.Group();
  const W = widthOf(spec), D = depthOf(spec);
  box(g, solid(0x4a535c), [W, 1.12, D], [0, 0.56, 0]);
  box(g, solid(0x8a95a0), [W + 0.08, 0.16, D + 0.1], [0, 1.2, 0]);
  hazardFaces(g, W * 0.96, 0.42, [0, 0.5, 0], D);
  for (const x of [-W / 2 + 0.12, W / 2 - 0.12]) lamp(g, 0xffb020, [x, 1.34, 0], 0.22);
  return g;
}

/**
 * Hydraulic press: a base block, a striped head that pumps up and down, and four rods that follow it.
 * The head never drops below 0.9 m, so the total height stays at least 1.35 m.
 * The rods are one merged mesh whose Y scale is animated (they all share the same length).
 */
export function buildPiston(spec: ObstacleSpec, _rng: RNG): THREE.Group {
  const g = new THREE.Group();
  const W = widthOf(spec), D = depthOf(spec);
  const BASE = 0.9;
  box(g, solid(0x434b54), [W, BASE, D], [0, BASE / 2, 0]);

  const head = new THREE.Group();
  head.userData.dynamic = true;
  g.add(head);
  box(head, solid(0xf0b41e), [W, 0.45, D], [0, 0.225, 0]);
  hazardFaces(head, W * 0.96, 0.4, [0, 0.225, 0], D);

  // Rods: unit-height cylinders in a group based at the top of the base; the group is scaled in Y.
  const rodG = new THREE.Group();
  rodG.position.set(0, BASE, 0);
  rodG.userData.dynamic = true;
  g.add(rodG);
  const rod = solid(0xb9c2ca);
  const xs = [-W / 2 + 0.3, W / 2 - 0.3];
  const zs = [-D * 0.3, D * 0.3];
  for (const x of xs) for (const z of zs) cyl(rodG, rod, 0.09, 1, [x, 0.5, z], [0, 0, 0], 8);

  const ph = ((spec.seed % 1000) / 1000) * PI * 2;
  const anim: AnimHook = (st) => {
    const hb = 1.12 + 0.22 * Math.sin(st.time * 3.2 + ph); // head bottom, 0.90..1.34
    head.position.y = hb;
    rodG.scale.y = hb - BASE;
  };
  anim({ time: 0, fall: 1, offset: 0 });
  g.userData.anim = anim;
  return g;
}

/**
 * Row of wall fans. Each housing is a dark cylinder along z with a yellow guard ring and four
 * blades on a rotor that spins in the anim hook. The hub is symmetric, so it stays static.
 */
export function buildFan(spec: ObstacleSpec, rng: RNG): THREE.Group {
  const g = new THREE.Group();
  const W = widthOf(spec), D = depthOf(spec);
  const n = Math.max(1, Math.round(W / 1.8));
  const cell = W / n;
  const R = Math.min(cell / 2 - 0.05, 0.9);
  const yC = Math.min(1.25, R + 0.3);
  const plinth = solid(0x333b44); // same colour as the housings, so they merge
  const guard = glow(0xffb020, 0.9);
  const blade = solid(0xd7dde3);
  const hub = solid(0xff7a1a);

  box(g, plinth, [W, 0.42, D], [0, 0.21, 0]);
  const rotors: THREE.Group[] = [];
  const speeds: number[] = [];
  for (let i = 0; i < n; i++) {
    const cx = -W / 2 + (i + 0.5) * cell;
    cyl(g, plinth, R + 0.1, D, [cx, yC, 0], [PI / 2, 0, 0], 12);
    add(g, geo.torus(12), guard, [cx, yC, D / 2 + 0.03], [0, 0, 0], [R + 0.1, R + 0.1, R + 0.1]);
    blob(g, hub, [0.13, 0.13, 0.08], [cx, yC, D / 2 + 0.08], 0);

    const rotor = new THREE.Group();
    rotor.position.set(cx, yC, D / 2 + 0.08);
    rotor.userData.dynamic = true;
    g.add(rotor);
    for (let k = 0; k < 4; k++) {
      const arm = new THREE.Group();
      arm.rotation.z = (k * PI) / 2;
      rotor.add(arm);
      box(arm, blade, [0.2, R * 0.9, 0.05], [0, R * 0.45, 0]);
    }
    rotors.push(rotor);
    speeds.push((i % 2 ? -1 : 1) * (4 + rng.next() * 3));
  }
  const anim: AnimHook = (st) => {
    for (let i = 0; i < rotors.length; i++) rotors[i].rotation.z = st.time * speeds[i];
  };
  g.userData.anim = anim;
  return g;
}

/**
 * Row of circular saw blades on a steel plinth. The disc and teeth spin in the anim hook; the
 * backing plate and hub are symmetric and stay static.
 */
export function buildSaw(spec: ObstacleSpec, rng: RNG): THREE.Group {
  const g = new THREE.Group();
  const W = widthOf(spec), D = depthOf(spec);
  const n = Math.max(1, Math.round(W / 1.9));
  const cell = W / n;
  const R = Math.min(cell / 2 - 0.05, 0.92);
  const yC = Math.min(1.25, R + 0.3);
  const plinth = solid(0x2d333a);
  const steel = solid(0xd0d6dc);
  const hub = solid(0xff7a1a);

  box(g, plinth, [W, 0.4, D], [0, 0.2, 0]);
  const rotors: THREE.Group[] = [];
  const speeds: number[] = [];
  for (let i = 0; i < n; i++) {
    const cx = -W / 2 + (i + 0.5) * cell;
    box(g, plinth, [0.2, yC, D], [cx, yC / 2, 0]);
    cyl(g, plinth, R * 1.05, 0.03, [cx, yC, D / 2 + 0.01], [PI / 2, 0, 0], 12); // backing plate
    cyl(g, hub, 0.12, 0.1, [cx, yC, D / 2 + 0.09], [PI / 2, 0, 0], 6);

    const rotor = new THREE.Group();
    rotor.position.set(cx, yC, D / 2 + 0.06);
    rotor.userData.dynamic = true;
    g.add(rotor);
    cyl(rotor, steel, R * 0.92, 0.05, [0, 0, 0], [PI / 2, 0, 0], 12);
    const teeth = 12;
    for (let k = 0; k < teeth; k++) {
      const a = (k / teeth) * PI * 2;
      const rr = R * 0.92 + 0.06;
      taper(rotor, steel, 0.07, 0.14, 0, [Math.cos(a) * rr, Math.sin(a) * rr, 0], [0, 0, a - PI / 2], 3);
    }
    rotors.push(rotor);
    speeds.push((i % 2 ? -1 : 1) * (9 + rng.next() * 4));
  }
  const anim: AnimHook = (st) => {
    for (let i = 0; i < rotors.length; i++) rotors[i].rotation.z = -st.time * speeds[i];
  };
  g.userData.anim = anim;
  return g;
}

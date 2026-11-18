import * as THREE from 'three';
import type { ObstacleSpec } from '../../core/types';
import type { RNG } from '../../core/rng';
import { PI, add, blob, box, cyl, depthOf, geo, glow, hazardFaces, lamp, solid, taper, widthOf, type AnimHook } from './common';

/** INDUSTRIAL props (beam, piston, fan, saw). Barrier, crate and slider are shared with other files. */

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
 */
export function buildPiston(spec: ObstacleSpec, _rng: RNG): THREE.Group {
  const g = new THREE.Group();
  const W = widthOf(spec), D = depthOf(spec);
  const BASE = 0.9;
  box(g, solid(0x434b54), [W, BASE, D], [0, BASE / 2, 0]);

  const head = new THREE.Group();
  g.add(head);
  box(head, solid(0xf0b41e), [W, 0.45, D], [0, 0.225, 0]);
  hazardFaces(head, W * 0.96, 0.4, [0, 0.225, 0], D);

  const rod = solid(0xb9c2ca);
  const rods: THREE.Mesh[] = [];
  const xs = [-W / 2 + 0.3, W / 2 - 0.3];
  const zs = [-D * 0.3, D * 0.3];
  for (const x of xs) for (const z of zs) rods.push(cyl(g, rod, 0.09, 1, [x, BASE, z], [0, 0, 0], 8));

  const ph = ((spec.seed % 1000) / 1000) * PI * 2;
  const anim: AnimHook = (st) => {
    const hb = 1.12 + 0.22 * Math.sin(st.time * 3.2 + ph); // head bottom, 0.90..1.34
    head.position.y = hb;
    const len = hb - BASE;
    for (const r of rods) {
      r.scale.y = len;
      r.position.y = BASE + len / 2;
    }
  };
  anim({ time: 0, fall: 1, offset: 0 });
  g.userData.anim = anim;
  return g;
}

/**
 * Row of wall fans. Each housing is a dark cylinder along z with a yellow guard ring and four
 * blades on a rotor that spins in the anim hook.
 */
export function buildFan(spec: ObstacleSpec, rng: RNG): THREE.Group {
  const g = new THREE.Group();
  const W = widthOf(spec), D = depthOf(spec);
  const n = Math.max(1, Math.round(W / 1.8));
  const cell = W / n;
  const R = Math.min(cell / 2 - 0.05, 0.9);
  const yC = Math.min(1.25, R + 0.3);
  const plinth = solid(0x2d333a);
  const housing = solid(0x3e4750);
  const guard = glow(0xffb020, 0.9);
  const blade = solid(0xd7dde3);
  const hub = solid(0xff7a1a);

  box(g, plinth, [W, 0.42, D], [0, 0.21, 0]);
  const rotors: THREE.Group[] = [];
  const speeds: number[] = [];
  for (let i = 0; i < n; i++) {
    const cx = -W / 2 + (i + 0.5) * cell;
    cyl(g, housing, R + 0.1, D, [cx, yC, 0], [PI / 2, 0, 0], 12);
    add(g, geo.torus(12), guard, [cx, yC, D / 2 + 0.03], [0, 0, 0], [R + 0.1, R + 0.1, R + 0.1]);

    const rotor = new THREE.Group();
    rotor.position.set(cx, yC, D / 2 + 0.08);
    g.add(rotor);
    for (let k = 0; k < 4; k++) {
      const arm = new THREE.Group();
      arm.rotation.z = (k * PI) / 2;
      rotor.add(arm);
      box(arm, blade, [0.2, R * 0.9, 0.05], [0, R * 0.45, 0]);
    }
    blob(rotor, hub, [0.13, 0.13, 0.08], [0, 0, 0], 0);
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
 * Row of circular saw blades on a steel plinth. Each blade has teeth, a hub and a dark backing plate,
 * and spins in the anim hook.
 */
export function buildSaw(spec: ObstacleSpec, rng: RNG): THREE.Group {
  const g = new THREE.Group();
  const W = widthOf(spec), D = depthOf(spec);
  const n = Math.max(1, Math.round(W / 1.9));
  const cell = W / n;
  const R = Math.min(cell / 2 - 0.05, 0.92);
  const yC = Math.min(1.25, R + 0.3);
  const plinth = solid(0x2d333a);
  const backing = solid(0x2b3238);
  const steel = solid(0xd0d6dc);
  const tooth = solid(0xf2f5f7);
  const hub = solid(0xff7a1a);

  box(g, plinth, [W, 0.4, D], [0, 0.2, 0]);
  const rotors: THREE.Group[] = [];
  const speeds: number[] = [];
  for (let i = 0; i < n; i++) {
    const cx = -W / 2 + (i + 0.5) * cell;
    box(g, plinth, [0.2, yC, D], [cx, yC / 2, 0]);
    const rotor = new THREE.Group();
    rotor.position.set(cx, yC, D / 2 + 0.06);
    g.add(rotor);
    cyl(rotor, backing, R * 1.05, 0.03, [0, 0, -0.05], [PI / 2, 0, 0], 12);
    cyl(rotor, steel, R * 0.92, 0.05, [0, 0, 0], [PI / 2, 0, 0], 12);
    const teeth = 12;
    for (let k = 0; k < teeth; k++) {
      const a = (k / teeth) * PI * 2;
      const rr = R * 0.92 + 0.06;
      taper(rotor, tooth, 0.07, 0.14, 0, [Math.cos(a) * rr, Math.sin(a) * rr, 0], [0, 0, a - PI / 2], 3);
    }
    cyl(rotor, hub, 0.12, 0.1, [0, 0, 0.03], [PI / 2, 0, 0], 6);
    rotors.push(rotor);
    speeds.push((i % 2 ? -1 : 1) * (9 + rng.next() * 4));
  }
  const anim: AnimHook = (st) => {
    for (let i = 0; i < rotors.length; i++) rotors[i].rotation.z = -st.time * speeds[i];
  };
  g.userData.anim = anim;
  return g;
}

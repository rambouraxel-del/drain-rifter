// DEV ONLY: gallery of obstacle props. Open /props-gallery.html
//   ?all=1                   overview grid of every kind and biome
//   ?kind=rock&biome=cavern  close-up of one prop (optional &hw=2.5&depth=1.4&fall=1&t=1.3)
import * as THREE from 'three';
import { createObstacleMesh } from '../ObstacleFactory';
import type { BiomeId, ObstacleKind, ObstacleSpec } from '../../core/types';
import type { ObstacleAnimState } from '../ObstacleManager';

const SAMPLES: [ObstacleKind, BiomeId, number, number][] = [
  ['barrier', 'sewer', 1.5, 0.6], ['barrier', 'industrial', 3.5, 0.6],
  ['crate', 'sewer', 1.0, 1.6], ['crate', 'industrial', 2.4, 1.6],
  ['grate', 'sewer', 2.5, 0.5], ['pipe', 'sewer', 2.5, 0.9], ['debris', 'sewer', 1.8, 1.8],
  ['beam', 'industrial', 2.5, 1.0], ['piston', 'industrial', 2.5, 1.6], ['fan', 'industrial', 2.5, 0.6],
  ['saw', 'industrial', 2.5, 0.5], ['slider', 'industrial', 1.5, 1.6],
  ['rock', 'cavern', 2.5, 1.5], ['stalagmite', 'cavern', 2.0, 1.4], ['boulder', 'cavern', 2.0, 1.6],
  ['root', 'cavern', 2.0, 0.8], ['falling', 'cavern', 1.5, 1.5], ['debris', 'cavern', 1.8, 1.8],
  ['pillar', 'ruins', 2.5, 1.4], ['statue', 'ruins', 2.0, 1.2], ['rubble', 'ruins', 2.0, 1.6],
  ['swinger', 'ruins', 2.2, 0.9], ['falling', 'ruins', 1.5, 1.5], ['slider', 'ruins', 1.5, 1.6],
  ['crystal', 'abyss', 2.0, 1.2], ['shard', 'abyss', 2.0, 1.0], ['orb', 'abyss', 2.5, 0.8],
  ['swinger', 'abyss', 2.2, 0.9], ['falling', 'abyss', 1.5, 1.5], ['slider', 'abyss', 1.5, 1.6],
  ['debris', 'abyss', 1.8, 1.8],
];

const q = new URLSearchParams(location.search);
const BG: Record<BiomeId, number> = { sewer: 0x12201e, industrial: 0x1c1a17, cavern: 0x141a22, ruins: 0x1f1b16, abyss: 0x0c0a16 };
const FLOOR: Record<BiomeId, number> = { sewer: 0x27403a, industrial: 0x3a3836, cavern: 0x4a4238, ruins: 0x5a5040, abyss: 0x1c1a2c };

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xb8c8d8, 0x2a2018, 0.9));
const sun = new THREE.DirectionalLight(0xfff0d8, 1.1);
sun.position.set(-4, 9, 6);
scene.add(sun);
const warm = new THREE.PointLight(0xffa860, 6, 18);
warm.position.set(2, 3, 5);
scene.add(warm);

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 200);
const items: { anim?: (st: ObstacleAnimState) => void }[] = [];
const fixedT = Number(q.get('t') ?? 1.3);
const fall = Number(q.get('fall') ?? 1);

function place(kind: ObstacleKind, biome: BiomeId, hw: number, depth: number, x: number, z: number, seed: number): void {
  const spec: ObstacleSpec = {
    kind, s: 0, u: 0, halfWidth: hw, depth, biome, seed,
    motion: kind === 'falling' ? { type: 'fall' } : kind === 'slider' ? { type: 'slide' } : kind === 'swinger' ? { type: 'swing' } : undefined,
  };
  const obj = createObstacleMesh(spec);
  obj.position.set(x, 0, z);
  scene.add(obj);
  items.push({ anim: obj.userData.anim });
  // Triangle budget per obstacle (non-shared geometry counted too), exposed for the e2e script.
  let tris = 0;
  let top = 0;
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const idx = m.geometry.getIndex();
    tris += idx ? idx.count / 3 : m.geometry.getAttribute('position').count / 3;
    m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox;
    if (bb) top = Math.max(top, bb.max.y * m.scale.y + m.position.y);
  });
  const gp = ((window as unknown as { __propsTris?: unknown[] }).__propsTris ??= []) as unknown[];
  gp.push({ kind, biome, hw, depth, tris: Math.round(tris), top: +top.toFixed(2) });
  // Visual footprint marker: thin outline of the collider so coverage is easy to judge.
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(hw * 2, 0.02, depth)),
    new THREE.LineBasicMaterial({ color: 0x00ff88 }),
  );
  outline.position.set(x, 0.02, z);
  scene.add(outline);
}

const kind = q.get('kind') as ObstacleKind | null;
const biome = (q.get('biome') ?? 'cavern') as BiomeId;
let floorBox: THREE.Vector2;

if (q.has('all') || !kind) {
  scene.background = new THREE.Color(0x101418);
  const cols = 6;
  const spacing = 7.5;
  SAMPLES.forEach(([k, b, hw, d], i) => {
    const col = i % cols, row = Math.floor(i / cols);
    place(k, b, hw, d, (col - (cols - 1) / 2) * spacing, -row * spacing, 500 + i * 37);
  });
  const rows = Math.ceil(SAMPLES.length / cols);
  floorBox = new THREE.Vector2(cols * spacing, rows * spacing);
  camera.position.set(0, 30, 22);
  camera.lookAt(0, 0, -(rows - 1) * spacing / 2);
} else {
  const hw = Number(q.get('hw') ?? 2);
  const depth = Number(q.get('depth') ?? 1.4);
  place(kind, biome, hw, depth, 0, 0, Number(q.get('seed') ?? 4242));
  scene.background = new THREE.Color(BG[biome]);
  floorBox = new THREE.Vector2(Math.max(8, hw * 3), 10);
  camera.position.set(0, 2.4, 4.5 + hw * 1.3);
  camera.lookAt(0, 1.0, 0);
}

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(floorBox.x, floorBox.y),
  new THREE.MeshLambertMaterial({ color: FLOOR[biome] ?? 0x333333 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.z = q.has('all') || !kind ? -(Math.ceil(SAMPLES.length / 6) - 1) * 7.5 / 2 : 0;
scene.add(floor);

function frame(): void {
  for (const it of items) it.anim?.({ time: fixedT, fall, offset: 0 });
  renderer.render(scene, camera);
}
frame();
(window as unknown as { __propsReady: boolean }).__propsReady = true;

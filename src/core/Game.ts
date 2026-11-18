import * as THREE from 'three';
import { CONFIG } from './config';
import { Input } from './Input';
import { resolveQuality } from './Quality';
import { Storage } from './Storage';
import type { GameState, QualitySettings, Settings } from './types';
import { Spine, makeFrame, profileHeight, profileSlope } from '../track/Spine';
import { TrackGenerator } from '../track/TrackGenerator';
import { ChunkManager } from '../world/ChunkManager';
import { buildTunnelChunk } from '../world/TunnelBuilder';
import { BIOMES, blendColor, blendNumber } from '../world/biomes';
import { ObstacleManager } from '../obstacles/ObstacleManager';
import { createObstacleMesh } from '../obstacles/ObstacleFactory';
import { PlayerController } from '../player/PlayerController';
import { Character } from '../player/Character';
import { UI } from '../ui/UI';
import { AudioManager } from '../audio/AudioManager';
import { IntroCinematic } from '../fx/IntroCinematic';
import { Particles } from '../fx/Particles';

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _c = new THREE.Color();

/** Top-level orchestration: owns renderer, scene, state machine and the main loop. */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  state: GameState = 'menu';
  settings: Settings;
  quality: QualitySettings;

  private input: Input;
  private gen!: TrackGenerator;
  private spine!: Spine;
  private chunks!: ChunkManager;
  private obstacles!: ObstacleManager;
  private player = new PlayerController();
  private character = new Character();
  private ui: UI;
  readonly audio = new AudioManager();
  private particles: Particles;
  private intro: IntroCinematic | null = null;

  private hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1);
  private key = new THREE.DirectionalLight(0xffffff, 0.8);
  private playerLight = new THREE.PointLight(0xffc070, 20, 26, 1.6);
  private fog = new THREE.Fog(0x000000, 10, 150);

  private frame = makeFrame();
  private camFrame = makeFrame();
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private time = 0;
  private dyingT = 0;
  private lastSeg = -1;
  private lastBiome = '';
  private best = Storage.loadBest();
  private fpsAcc = 0;
  private fpsFrames = 0;
  fps = 60;
  private clock = new THREE.Clock();
  private shake = 0;
  /** Debug/testing hooks. */
  invincible = false;

  constructor(container: HTMLElement) {
    this.settings = Storage.loadSettings();
    this.quality = resolveQuality(this.settings.quality);
    this.renderer = new THREE.WebGLRenderer({ antialias: this.quality.level !== 'low', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fovBase, container.clientWidth / container.clientHeight, 0.1, 400);
    this.scene.fog = this.fog;
    this.scene.add(this.hemi, this.key, this.key.target, this.playerLight, this.character.root, this.camera);
    this.particles = new Particles(this.quality.particles);
    this.scene.add(this.particles.root);
    this.input = new Input(this.renderer.domElement);
    this.input.onAnyKey = (code) => {
      if (code === 'Escape' || code === 'KeyP') {
        if (this.state === 'playing') this.pause(); else if (this.state === 'paused') this.resume();
      }
    };
    this.ui = new UI({
      onPlay: () => this.startRun(true),
      onPause: () => this.pause(),
      onResume: () => this.resume(),
      onRestart: () => this.startRun(false),
      onMenu: () => this.toMenu(),
      onSettingsChange: (s) => this.applySettings(s),
      onSkipIntro: () => this.intro?.skip(),
    }, () => this.settings);
    this.applySettings(this.settings, false);
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing') this.pause(); });
    this.newWorld();
    this.toMenu();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  /* ---------------- state transitions ---------------- */

  private newWorld(): void {
    if (this.chunks) { this.scene.remove(this.chunks.root); this.chunks.reset(); }
    if (this.obstacles) { this.scene.remove(this.obstacles.root); this.obstacles.reset(); }
    const seed = (Math.random() * 1e9) | 0;
    this.gen = new TrackGenerator(seed);
    this.spine = new Spine(this.gen);
    this.chunks = new ChunkManager(this.spine, buildTunnelChunk, () => this.quality, seed);
    this.obstacles = new ObstacleManager(this.spine, createObstacleMesh);
    this.obstacles.onEvent = (type) => this.audio.play(type);
    this.scene.add(this.chunks.root, this.obstacles.root);
    this.player.reset(0);
    this.character.reset();
    this.particles.reset();
    this.lastSeg = -1;
    this.lastBiome = '';
    this.spine.ensure(CONFIG.spine.ahead);
    // Pre-build the initial view synchronously.
    this.chunks.update(0, 100);
    this.feedObstacles();
  }

  private toMenu(): void {
    this.intro?.dispose();
    this.intro = null;
    this.state = 'menu';
    if (this.player.s > 0) this.newWorld();
    this.ui.showMenu(this.best);
    this.audio.setMode('menu');
  }

  startRun(withIntro: boolean): void {
    this.audio.unlock();
    this.audio.play('start');
    if (this.player.s > 0 || this.state === 'gameover') this.newWorld();
    this.input.reset();
    if (withIntro) {
      this.state = 'intro';
      this.ui.showIntro();
      this.intro = new IntroCinematic(this.scene, this.camera, this.character, this.spine);
      this.intro.start();
    } else {
      this.beginPlay();
    }
    this.audio.setMode('game');
  }

  private beginPlay(): void {
    this.intro?.dispose();
    this.intro = null;
    this.state = 'playing';
    this.input.reset();
    this.ui.showHud();
    this.ui.showControlsHint();
    this.snapCamera();
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ui.showPause();
    this.audio.setMode('paused');
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.showHud();
    this.input.reset();
    this.audio.setMode('game');
  }

  private die(): void {
    this.state = 'dying';
    this.dyingT = 0;
    this.character.crash();
    this.audio.play('crash');
    this.ui.flash('#ffffff');
    this.shake = 1;
    this.particles.burst(this.character.root.position, BIOMES[this.frame.biome].accent, 60);
  }

  private gameOver(): void {
    this.state = 'gameover';
    const d = this.player.s;
    const isRecord = d > this.best;
    if (isRecord) { this.best = d; Storage.saveBest(d); }
    const stats = Storage.loadStats();
    Storage.saveStats({ runs: stats.runs + 1, total: stats.total + d });
    this.ui.showGameOver({ distance: d, best: this.best, isRecord, biomeName: BIOMES[this.spine.biomeAt(d)].name });
    this.audio.setMode('gameover');
  }

  applySettings(s: Settings, save = true): void {
    const prevQ = this.settings.quality;
    this.settings = { ...s };
    if (save) Storage.saveSettings(this.settings);
    this.player.sensitivity = s.sensitivity;
    this.audio.setVolumes(s.musicVolume, s.sfxVolume);
    if (s.quality !== prevQ) {
      this.quality = resolveQuality(s.quality);
      this.renderer.setPixelRatio(this.quality.pixelRatio);
      this.resize();
    }
  }

  private resize(): void {
    const w = this.renderer.domElement.parentElement!.clientWidth;
    const h = this.renderer.domElement.parentElement!.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // Portrait screens: widen vertical FOV a bit so the track stays readable.
    this.camera.updateProjectionMatrix();
  }

  /* ---------------- main loop ---------------- */

  private tick(): void {
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 1 / 20);
    this.fpsAcc += rawDt; this.fpsFrames++;
    if (this.fpsAcc > 0.5) { this.fps = this.fpsFrames / this.fpsAcc; this.fpsAcc = 0; this.fpsFrames = 0; }
    this.time += dt;

    switch (this.state) {
      case 'menu': this.updateMenu(dt); break;
      case 'intro':
        if (this.intro && this.intro.update(dt)) this.beginPlay();
        this.updateWorld(dt, false);
        break;
      case 'playing': this.updatePlaying(dt); break;
      case 'paused': break;
      case 'dying':
        this.dyingT += dt;
        this.updateWorld(dt * 0.25, true);
        this.character.update(dt, this.pose());
        this.updateCamera(dt);
        if (this.dyingT > 1.3) this.gameOver();
        break;
      case 'gameover':
        this.updateWorld(dt * 0.1, true);
        this.character.update(dt, this.pose());
        break;
    }
    this.updateAtmosphere(dt);
    this.audio.update(dt, {
      playing: this.state === 'playing',
      speed: this.player.speed,
      biome: this.frame.biome,
      nextBiome: this.frame.nextBiome,
      blend: this.frame.blend,
      lateral: this.player.vu / CONFIG.player.maxLateralSpeed,
      scraping: this.player.scraping,
    });
    this.renderer.render(this.scene, this.camera);
  }

  private updateMenu(dt: number): void {
    // Slow attract-mode drift down the first tunnel, camera ahead of the start.
    this.player.s += dt * 3;
    if (this.player.s > 100) this.player.s = 0;
    this.updateWorld(0, false);
    this.placeCharacter();
    this.character.update(dt, this.pose());
    this.updateCamera(dt, true);
  }

  private updatePlaying(dt: number): void {
    const seg = this.spine.segmentAt(this.player.s);
    this.spine.frame(this.player.s, this.frame);
    this.player.update(dt, this.input, this.frame, seg.yawRate);
    this.updateWorld(dt, true);
    this.placeCharacter();
    this.character.update(dt, this.pose());
    this.updateCamera(dt);
    this.ui.updateHud(this.player.s, this.player.speed, this.fps);
    const k = (this.player.speed - CONFIG.speed.start) / (CONFIG.speed.max - CONFIG.speed.start);
    this.ui.setSpeedFx(Math.max(0, Math.min(1, k)));
    const biome = this.spine.biomeAt(this.player.s);
    if (biome !== this.lastBiome) {
      if (this.lastBiome) { this.ui.showBiomeTitle(BIOMES[biome].name); this.audio.play('biome'); }
      this.lastBiome = biome;
    }
    if (!this.invincible && this.obstacles.hitTest(this.player.s, this.player.u, CONFIG.player.radius)) this.die();
  }

  /** Stream track, obstacles and particles around the player. */
  private updateWorld(dt: number, simulate: boolean): void {
    const s = this.player.s;
    this.spine.ensure(s + CONFIG.spine.ahead);
    this.spine.frame(s, this.frame);
    this.chunks.update(s);
    this.feedObstacles();
    if (simulate || dt === 0) this.obstacles.update(dt, s, this.player.u, this.quality.viewDistance);
    this.spine.trim(s - CONFIG.spine.behind - 10);
    this.particles.update(dt, {
      playerPos: this.character.root.position, frame: this.frame, speed: this.player.speed,
      lateral: this.player.vu / CONFIG.player.maxLateralSpeed, biome: this.frame.biome, playing: this.state === 'playing',
    });
  }

  private feedObstacles(): void {
    for (const seg of this.spine.segments) {
      if (seg.index > this.lastSeg) {
        this.obstacles.add(this.gen.obstaclesFor(seg));
        this.lastSeg = seg.index;
      }
    }
  }

  private pose() {
    return {
      lean: this.player.lean, speed: this.player.speed, time: this.time,
      tilt: Math.atan(profileSlope(this.player.u, this.frame.width)), scraping: this.player.scraping,
    };
  }

  /** Put the character on the surface, aligned with the local surface normal. */
  private placeCharacter(): void {
    const f = this.frame;
    const u = this.player.u;
    const h = profileHeight(u, f.width);
    const tilt = Math.atan(profileSlope(u, f.width));
    const root = this.character.root;
    root.position.copy(f.pos).addScaledVector(f.right, u).addScaledVector(f.up, h);
    // Surface-aligned basis: rotate right/up around fwd by the wall tilt.
    _v.copy(f.right).multiplyScalar(Math.cos(tilt)).addScaledVector(f.up, Math.sin(tilt)); // right'
    _v2.copy(f.up).multiplyScalar(Math.cos(tilt)).addScaledVector(f.right, -Math.sin(tilt)); // up'
    const back = f.fwd.clone().negate();
    _m.makeBasis(_v, _v2, back);
    root.quaternion.setFromRotationMatrix(_m);
    this.playerLight.position.copy(root.position).addScaledVector(f.up, 2.2).addScaledVector(f.fwd, 3);
  }

  private snapCamera(): void { this.updateCamera(1, false, true); }

  private updateCamera(dt: number, menu = false, snap = false): void {
    const C = CONFIG.camera;
    const s = this.player.s;
    // Camera rides behind on the spine (looking slightly down the slope).
    const cs = s - C.distance;
    this.spine.frame(Math.max(this.spine.start, cs), this.camFrame);
    const cf = this.camFrame;
    const lateral = this.player.u * 0.55;
    const target = _v.copy(cf.pos).addScaledVector(cf.right, lateral).addScaledVector(cf.up, C.height + profileHeight(lateral, cf.width) * 0.5);
    this.spine.frame(s + C.lookAhead, this.camFrame);
    const look = _v2.copy(this.camFrame.pos).addScaledVector(this.camFrame.right, this.player.u * 0.3).addScaledVector(this.camFrame.up, 0.6);
    if (menu) { target.addScaledVector(cf.up, 0.6); }
    const k = snap ? 1 : 1 - Math.exp(-dt * 12);
    this.camPos.lerp(target, k);
    this.camLook.lerp(look, snap ? 1 : 1 - Math.exp(-dt * 14));
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const a = this.shake * 0.25;
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
    }
    this.camera.up.copy(this.frame.up);
    this.camera.lookAt(this.camLook);
    // Roll slightly with lateral motion for a sense of speed.
    this.camera.rotateZ(-this.player.lean * 0.06);
    const sp = (this.player.speed - CONFIG.speed.start) / (CONFIG.speed.max - CONFIG.speed.start);
    const aspect = this.camera.aspect;
    const portraitBoost = aspect < 1 ? (1 - aspect) * 18 : 0;
    const fov = C.fovBase + portraitBoost + (this.state === 'playing' ? sp * C.fovMaxBoost : 0);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 3);
      this.camera.updateProjectionMatrix();
    }
  }

  /** Fog / lights blend across biomes. */
  private updateAtmosphere(_dt: number): void {
    const f = this.frame;
    const a = f.biome, b = f.nextBiome, t = f.blend;
    blendColor(a, b, t, 'fog', _c);
    this.fog.color.copy(_c);
    this.renderer.setClearColor(_c);
    this.fog.near = blendNumber(a, b, t, 'fogNear');
    this.fog.far = Math.min(blendNumber(a, b, t, 'fogFar'), this.quality.viewDistance);
    blendColor(a, b, t, 'hemiSky', this.hemi.color);
    blendColor(a, b, t, 'hemiGround', this.hemi.groundColor);
    this.hemi.intensity = blendNumber(a, b, t, 'hemiIntensity');
    blendColor(a, b, t, 'key', this.key.color);
    this.key.intensity = blendNumber(a, b, t, 'keyIntensity');
    this.key.position.copy(this.character.root.position).add(_v.set(4, 10, 6));
    this.key.target.position.copy(this.character.root.position);
    blendColor(a, b, t, 'playerLight', this.playerLight.color);
    this.playerLight.intensity = blendNumber(a, b, t, 'playerLightIntensity');
  }

  /* ---------------- test hooks ---------------- */
  debugState() {
    return {
      state: this.state, s: this.player.s, u: this.player.u, speed: this.player.speed, fps: this.fps,
      biome: this.frame.biome, chunks: this.chunks.count, obstacles: this.obstacles.all.length,
      drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures,
    };
  }
  /** Teleport (tests): jump to a distance and keep playing. */
  debugTeleport(s: number): void {
    this.player.s = s;
    this.spine.ensure(s + CONFIG.spine.ahead);
    this.chunks.reset(s);
    this.obstacles.reset();
    this.chunks.update(s, 100);
    this.lastSeg = -1;
    for (const seg of this.spine.segments) if (seg.index > this.lastSeg) { this.obstacles.add(this.gen.obstaclesFor(seg).filter((o) => o.s > s + 30)); this.lastSeg = seg.index; }
    this.snapCamera();
  }
}

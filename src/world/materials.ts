import * as THREE from 'three';

/** Shared (never disposed) materials for all environment chunks. */
function shared<T extends THREE.Material>(m: T): T { m.userData.shared = true; return m; }

/** Faceted lit surfaces (vertex colours, flat shading, cheap Lambert). */
export const litMat = shared(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
/** Emissive / unlit surfaces (lamps, runes, crystals). Fogged. */
export const glowMat = shared(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
/** Wet / watery floor strip with a specular response to the player light. */
export const sheenMat = shared(new THREE.MeshPhongMaterial({
  vertexColors: true, flatShading: true, specular: 0x8aa0b0, shininess: 60, side: THREE.DoubleSide,
}));

/** Shared uniform: pixels per world unit at distance 1 (updated by the sprite material). */
const spriteScale = { value: 400 };
const _sz = new THREE.Vector2();

const fogFade = /* glsl */ `
  float fogF = smoothstep(fogNear, fogFar, vFogDepth);
`;

/** Additive glow sprites (round soft points with per-point size and colour). */
export const spriteMat = shared(new THREE.ShaderMaterial({
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uScale: spriteScale }]),
  vertexShader: /* glsl */ `
    attribute float aSize;
    attribute vec3 aColor;
    uniform float uScale;
    varying vec3 vColor;
    #include <fog_pars_vertex>
    void main() {
      vColor = aColor;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      gl_PointSize = clamp(aSize * uScale / max(0.5, -mvPosition.z), 1.0, 360.0);
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */ `
    varying vec3 vColor;
    #include <fog_pars_fragment>
    void main() {
      vec2 d = gl_PointCoord - 0.5;
      float r = length(d) * 2.0;
      if (r > 1.0) discard;
      float a = (1.0 - r);
      a = a * a;
      ${fogFade}
      gl_FragColor = vec4(vColor * a * (1.0 - fogF), 1.0);
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
}));

/** Additive translucent meshes (light shafts, waterfalls, mist). Colour = brightness. */
export const addMat = shared(new THREE.ShaderMaterial({
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
  vertexShader: /* glsl */ `
    attribute vec3 aColor;
    varying vec3 vColor;
    #include <fog_pars_vertex>
    void main() {
      vColor = aColor;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */ `
    varying vec3 vColor;
    #include <fog_pars_fragment>
    void main() {
      ${fogFade}
      gl_FragColor = vec4(vColor * (1.0 - fogF), 1.0);
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true,
}));

/** Call from Points.onBeforeRender so point sizes follow the viewport / fov. */
export function updateSpriteScale(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
  renderer.getDrawingBufferSize(_sz);
  const fov = (camera as THREE.PerspectiveCamera).fov ?? 60;
  spriteScale.value = _sz.y / (2 * Math.tan((fov * Math.PI) / 360));
}

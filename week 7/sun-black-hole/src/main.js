import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeSea } from './sea.js';
import { makeBeach, wheelFrame, BU } from './beach.js';
import { makePeople } from './people.js';
import { makeFleet } from './cars.js';
import { makeWeather } from './weather.js';
import { makeGlows } from './glows.js';
import { makeSmoke } from './smoke.js';
import { makeOverlay } from './overlay.js';
import { FU, frostify } from './frost.js';
import { CAM_A, CAM_B, EYE, Z_W, SUN_DIR, SUN_AE, FIRE, FAR_FIRES, FAR, FAR_Y, LANES, ROAD, PROM, sandY, groundY } from './layout.js';
import {
  state, animT, COUNTERS, VIDEO_DURATION, LOOP, popupAt, captionAt, POP, darkR, V_DARK, V_GONE, V_LIGHTS, V_HOME, V_FIRE, V_STEAM, V_SNOW, V_PALMS,
  V_BURY, V_SLUSH, V_ICE, V_YEAR, V_SHUT,
} from './timeline.js';
import { lerp, smooth, wobble, clamp, keys, rng } from './util.js';

const W = 1080, H = 1920, DEG = Math.PI / 180;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');

const stage = document.getElementById('stage');
// a plain depth buffer (street scale: the nearest person is a metre off, the far shore 5 km; the sea discards itself
// over the far land so the two never fight)
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, W / H, 0.4, 30000);
camera.rotation.order = 'YXZ';
scene.add(camera);

// ---------- the world ----------
const plainMat = (color, rough = 0.9, extra = {}) => frostify(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };
const ctx = { plainMat, glowMat, shadowy };
const sky = makeSky();
scene.add(sky.mesh);
const sea = makeSea(scene);
const beach = makeBeach(scene, ctx);
const people = makePeople(scene);
const weather = makeWeather(scene, CAM_B);
const glows = makeGlows(scene, 6000);
const smoke = makeSmoke(scene, 1600);
FU.uFront.value = 1e5;                    // (frost.js: "passed" everywhere; the cold comes to the whole beach at once)

// cars on the coast road: moving at noon, a jam heading home after dark, left where they stopped
const CARS = [];
{
  const R = rng(31);
  for (const L of LANES) {
    let x = -420 + R() * 10;
    while (x < 420) { CARS.push({ lane: L, x0: x, kind: Math.floor(R() * 4), col: [0xd8d8d8, 0x1a1a1a, 0x8a1d1d, 0x2a4a8a, 0xe8e2d0, 0x5a5f66, 0xb8b2a4][Math.floor(R() * 7)] }); x += 7 + R() * 22; }
  }
}
const fleet = makeFleet(scene, CARS.length, ctx);
CARS.forEach((c, i) => fleet.color(i, c.col, c.kind));
const carX = (c, a) => {
  // 11 m/s at noon (on the people's clock), slowing to a crawl once everyone heads home, stopped for good at 0:22
  const home = animT(V_HOME), stop = animT(V_FIRE + 0.5);
  const t = Math.min(a, stop);
  const d = 11 * Math.min(t, home) + 3 * Math.max(0, t - home);
  const x = c.x0 + c.lane.dir * d;
  return ((x + 440) % 880 + 880) % 880 - 440;
};

// the far city's street lights: points along the far shore's land (they come on with the rest)
const FARLIGHTS = [];
{
  const R = rng(77);
  for (let k = 0; k < 900; k++) {
    const i = 1 + Math.floor(R() * (FAR.length - 2)), u = R();
    const [ax, az] = FAR[i], [bx, bz] = FAR[i + 1];
    const tx = bx - ax, tz = bz - az, L = Math.hypot(tx, tz), nx = tz / L, nz = -tx / L;
    const inl = 20 + Math.pow(R(), 0.8) * 1400;
    FARLIGHTS.push([ax + tx * u + nx * inl, FAR_Y + 4 + R() * 6, az + tz * u + nz * inl, R()]);
  }
}

// the Sun (by day) and, after dark, the promenade's lamps behind you: one shadowing light, moved
const sunL = new THREE.DirectionalLight(0xfff3e2, 2.6);
sunL.castShadow = true;
sunL.shadow.mapSize.set(4096, 4096);
sunL.shadow.bias = -0.0004; sunL.shadow.normalBias = 0.04;
Object.assign(sunL.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 10, far: 900 });
scene.add(sunL, sunL.target);
const hemi = new THREE.HemisphereLight(0x9cc0ff, 0xb09a7a, 1.2);
scene.add(hemi);
const fireL = new THREE.PointLight(0xff8a3a, 0, 40, 1.6);
fireL.position.set(FIRE.x, sandY(FIRE.z) + 0.9, FIRE.z);
scene.add(fireL);
// the fire itself: crossed driftwood logs and tongues of flame (they flicker in height)
const fire = new THREE.Group();
const FLAMES = [];
{
  const fy = sandY(FIRE.z);
  const wood = plainMat(0x3a2a1e, 0.95);
  for (const a of [0, 1.1, 2.2]) fire.add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.3, 6).rotateZ(Math.PI / 2).rotateY(a).translate(0, 0.1, 0), wood)));
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.8, 0.18), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.6, 0.6), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  [[0, 0, 0.32, 1.25, flameMat], [0.18, 0.1, 0.22, 0.9, flameMat], [-0.16, -0.08, 0.2, 0.8, flameMat], [0.05, -0.17, 0.18, 0.7, flameMat], [0, 0, 0.16, 0.7, coreMat]].forEach(([x, z, r, h, m]) => {
    const f = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7, 1, true).translate(0, h / 2, 0), m);
    f.position.set(x, 0.12, z);
    fire.add(f); FLAMES.push(f);
  });
  fire.position.set(FIRE.x, fy, FIRE.z);
  scene.add(fire);
}
const SUN = new THREE.Vector3(SUN_DIR.x, SUN_DIR.y, SUN_DIR.z).normalize();
const LAMPDIR = new THREE.Vector3(0.12, 0.42, 1).normalize();

const overlay = makeOverlay();
const stampEl = document.getElementById('stamp');
const stampW = document.getElementById('stampw');

// ---------- post ----------
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv);
    if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 30.0), 1.0); }`,
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.3, 0.45, 1.1);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.22 }, uTitle: { value: 0 }, uCounter: { value: 0 },
    uAb: { value: 0 }, uCap: { value: 0 }, uPop: { value: 0 }, uBlur: { value: 0 }, uLens: { value: 0 }, uScope: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uAb; uniform float uCap; uniform float uPop; uniform float uBlur; uniform float uLens; uniform float uScope;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float lh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float ln(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(lh(i), lh(i + vec2(1, 0)), f.x), mix(lh(i + vec2(0, 1)), lh(i + vec2(1, 1)), f.x), f.y); }
    float lf(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * ln(p); p = p * 2.13 + 1.7; a *= 0.5; } return s; }
    float vorE(vec2 p){ vec2 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0;
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 o = vec2(float(x), float(y)); vec2 r = o + vec2(lh(i + o), lh(i + o + 31.0)) - f; float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
      return sqrt(d2) - sqrt(d1); }
    void main() {
      vec2 d = vUv - 0.5;
      vec3 col = vec3(0.0);
      float jit = h(vUv * 1920.0 + uTime) - 0.5;
      vec2 off = d * uAb * 0.01;
      for (int i = 0; i < 6; i++) {
        float k = (float(i) + jit) / 6.0;
        vec2 uv = 0.5 + d * (1.0 - uBlur * k);
        col += vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      }
      col /= 6.0;
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.12);
      // the zoom: a dark round edge, like looking through a long lens
      if (uScope > 0.0) {
        vec2 a = vec2(d.x * 0.5625, d.y);
        float r = length(a);
        col *= 1.0 - uScope * smoothstep(0.24, 0.36, r);
      }
      // frost on the lens: feathers of ice growing in from the edges until it is solid (a still pattern, so the loop's
      // last frame and the frame after it match)
      if (uLens > 0.0) {
        vec2 a = vec2(vUv.x * 0.5625, vUv.y);
        float ed = min(min(vUv.x, 1.0 - vUv.x) * 0.5625, min(vUv.y, 1.0 - vUv.y));
        vec2 w = vec2(lf(a * 4.0), lf(a * 4.0 + 9.0)) - 0.5;
        float fr = (1.0 - smoothstep(0.0, 0.07, vorE(a * 6.0 + w * 0.8))) * 0.55
                 + (1.0 - smoothstep(0.0, 0.06, vorE(a * 17.0 + w * 1.6))) * 0.35
                 + (1.0 - smoothstep(0.0, 0.05, vorE(a * 46.0 + w * 3.0))) * 0.22;
        float grain = lf(a * 120.0);
        float e = ed - 0.09 * lf(a * 5.0 + 2.0) - 0.035 * fr;
        float grow = uLens * 0.36;
        float cov = 1.0 - smoothstep(grow - 0.03, grow, e);
        float edge = smoothstep(grow - 0.04, grow - 0.004, e) * cov;
        vec3 ice = mix(vec3(0.56, 0.69, 0.84), vec3(0.9, 0.95, 1.0), clamp(fr * 0.95 + grain * 0.25 + 0.15, 0.0, 1.0));
        ice += vec3(0.28, 0.3, 0.32) * edge;
        float thick = clamp(smoothstep(0.0, 0.07, grow - e) * 0.6 + 0.4 + 0.3 * fr, 0.0, 1.0);
        thick = mix(thick, 1.0, smoothstep(0.85, 1.0, uLens));
        float near = (1.0 - smoothstep(grow, grow + 0.06, e)) * (1.0 - cov);
        col = mix(col, col * 0.7 + vec3(0.32, 0.36, 0.42), near * 0.5);
        col = mix(col, ice, cov * thick);
      }
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.5 * exp(-pow((vUv.y - 0.37) / 0.11, 2.0));
      col *= 1.0 - uCounter * 0.38 * exp(-pow((vUv.y - 0.5) / 0.07, 2.0)) * smoothstep(0.66, 0.1, vUv.x);
      col *= 1.0 - uCap * 0.45 * exp(-pow((vUv.y - 0.175) / 0.04, 2.0));
      col *= 1.0 - uPop * 0.45 * exp(-pow((vUv.y - 0.175) / 0.05, 2.0));
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- the camera ----------
// You start among the crowd and walk down toward the water during the time-lapse; at 0:07.6 your eyes go up to the Sun
// and the phone zooms in on it as it goes out; back down at the dark beach; then a crash zoom ~1,000x into the spot where
// the Sun was (the ring); then the beach in the dark: one look per beat (the sea, back at the promenade, the fire, the sea,
// the palms, along the beach, the surf at your feet, the frozen sea), and finally you rise as the lens freezes.
// az: degrees right of straight out to sea; pitch: up; fov: vertical degrees
const SUN_AZ = SUN_AE.az, SUN_EL = SUN_AE.el;
const POS = [[-2, CAM_A.x, CAM_A.z], [0, CAM_A.x, CAM_A.z], [6, 0.05, 4.6], [7.6, CAM_B.x, CAM_B.z], [36.35, CAM_B.x, CAM_B.z], [36.95, 0.3, Z_W + 4], [42.6, 0.3, Z_W + 4], [46.8, 14, CAM_B.z + 22]];
const AZ = [[-2, 3], [0, 3], [6, 4], [7.6, 5.5], [8.4, SUN_AZ], [11.35, SUN_AZ], [11.95, 4], [12.25, 4], [12.95, SUN_AZ], [15.0, SUN_AZ], [15.45, 4],
  [18.35, 4], [18.95, 172], [21.35, 176], [21.95, 316], [24.35, 318], [24.95, 364], [30.35, 366], [30.95, 538], [33.35, 536], [33.95, 432],
  [36.35, 430], [36.95, 364], [42.3, 364], [43.2, 349], [46.8, 348]];
const PITCH = [[-2, 12], [0, 12], [3, 10], [6, 8], [7.6, 13], [8.4, SUN_EL], [11.35, SUN_EL], [11.95, 7], [12.25, 7], [12.95, SUN_EL], [15.0, SUN_EL], [15.45, 7],
  [18.35, 7], [18.95, 11], [21.35, 11], [21.95, -9], [24.35, -9], [24.95, 5], [27.35, 5], [27.95, 1], [30.35, 1], [30.95, 20], [33.35, 20], [33.95, -2],
  [36.35, -2], [36.95, -24], [39.35, -24], [39.95, 4], [42.3, 4], [43.2, -4], [46.8, -7]];
const FOVK = [[-2, 64], [0, 64], [6, 62], [7.6, 58], [8.4, 12], [11.35, 12], [11.95, 62], [12.25, 62], [12.7, 30], [13.55, 0.075], [14.95, 0.075], [15.45, 62],
  [21.35, 62], [21.95, 54], [24.35, 54], [24.95, 62], [30.35, 62], [30.95, 52], [33.35, 52], [33.95, 60], [36.35, 60], [36.95, 50], [39.35, 50], [39.95, 64], [42.3, 64], [43.2, 56], [46.8, 56]];
const HEIGHT = [[-2, 0], [42.3, 0], [46.8, 24]];
// FOV through the zoom: interpolated in log space, so the zoom feels steady
const fovAt = (v) => {
  let i = 0;
  if (v <= FOVK[0][0]) return FOVK[0][1];
  while (i < FOVK.length - 1 && v > FOVK[i + 1][0]) i++;
  if (i >= FOVK.length - 1) return FOVK[FOVK.length - 1][1];
  const [a, fa] = FOVK[i], [b, fb] = FOVK[i + 1];
  const k = smooth(a, b, v);
  return Math.exp(lerp(Math.log(fa), Math.log(fb), k));
};
function camAt(v) {
  const x = keys(POS.map((p) => [p[0], p[1]]), v), z = keys(POS.map((p) => [p[0], p[2]]), v);
  const walking = smooth(-0.5, 0.2, v) * (1 - smooth(5.6, 7.4, v));
  const y = groundY(x, z) + EYE + keys(HEIGHT, v) + Math.abs(Math.sin(v * 7.2)) * 0.035 * walking;
  let az = keys(AZ, v), pitch = keys(PITCH, v), fov = fovAt(v);
  const k = fov / 62;
  // a hand-held phone: a small drift, scaled with the zoom (the zoomed shots are on a tripod-steady hand)
  const steady = 1 - smooth(8.1, 8.5, v) * (1 - smooth(11.3, 11.7, v)) - smooth(12.5, 12.9, v) * (1 - smooth(14.9, 15.2, v));
  az += wobble(v * 0.45, 4) * 0.35 * k * (0.15 + 0.85 * steady) + Math.sin(v * 7.2 + 1) * 0.25 * walking;
  pitch += wobble(v * 0.55, 3) * 0.3 * k * (0.15 + 0.85 * steady);
  const roll = wobble(v * 0.3, 7) * 0.5 * DEG * steady;
  return { pos: new THREE.Vector3(x, y, z), yaw: -az * DEG, pitch: pitch * DEG, roll, fov };
}
// is a point in shot at time v (with a margin)? (people leave the beach only while they're out of it)
const _c = new THREE.PerspectiveCamera(62, W / H, 0.4, 30000); _c.rotation.order = 'YXZ';
const _p = new THREE.Vector3();
function inView(v, x, y, z, margin = 1.15) {
  const c = camAt(v);
  _c.position.copy(c.pos); _c.rotation.set(c.pitch, c.yaw, c.roll); _c.fov = c.fov * margin; _c.updateProjectionMatrix(); _c.updateMatrixWorld();
  _p.set(x, y, z).applyMatrix4(_c.matrixWorldInverse);
  if (_p.z > -0.2) return false;
  _p.applyMatrix4(_c.projectionMatrix);
  return Math.abs(_p.x) < 1.15 && Math.abs(_p.y) < 1.1;
}
people.planHide(inView, VIDEO_DURATION + 0.1);

// the steam off the sea: columns of sea smoke rising in the dark, drifting off shore
const STEAM = [];
{
  const R = rng(4);
  for (let i = 0; i < 700; i++) STEAM.push({ x: (R() - 0.5) * 500, o: 3 + Math.pow(R(), 1.7) * 700, r: 2 + R() * 7, ph: R() * 10, sp: 0.6 + R() * 0.8 });
}

const tmpC = new THREE.Color(), tmpV = new THREE.Vector3();
const BH = SUN.clone();
const E1 = new THREE.Vector3().crossVectors(BH, new THREE.Vector3(0, 1, 0)).normalize();
const E2 = new THREE.Vector3().crossVectors(E1, BH).normalize();
const fwd = new THREE.Vector3(), rgt = new THREE.Vector3(), upv = new THREE.Vector3();
function update(v, cover = -1) {
  const s = state(v);
  const lens = Math.max(s.lens, cover);
  if (cover >= 0) s.title *= 1 - smooth(0.55, 1, cover);   // (in the loop's lead-in the title fades in as the ice clears)
  // ---------- the camera ----------
  const cam = camAt(v);
  const sh = (s.kick * 0.6 + 0.015) * 0.012 * cam.fov / 60;
  cam.pitch += wobble(v * 43, 3) * sh - s.kick * 0.3 * DEG * cam.fov / 62;
  cam.yaw += wobble(v * 47, 4) * sh;
  camera.position.copy(cam.pos);
  camera.rotation.set(cam.pitch, cam.yaw, cam.roll);
  camera.fov = cam.fov * (1 - 0.025 * s.kick * Math.min(1, cam.fov / 20));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const pxAng = 2 * Math.tan(camera.fov * DEG / 2) / H;

  // ---------- the sky ----------
  const night = s.night, lights = s.lights;
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  sky.mesh.scale.setScalar(5000);
  u.uSun.value.copy(SUN);
  u.uDarkR.value = darkR(s.sunS);
  u.uLight.value = s.sun;
  u.uPx.value = pxAng;
  u.uTime.value = v;
  u.uStars.value = smooth(0.9, 1.0, night);
  u.uCloud.value = 1 - smooth(V_DARK - 1, V_DARK, v) * 0;
  // clouds race in the time-lapse (capped, so they glide rather than flicker)
  u.uDrift.value = 9 * (Math.min(s.anim, 60) * 6);
  u.uOver.value = s.clouds;
  u.uCityGlow.value = lights * (1 - 0.6 * s.cityDim) + 0.15 * night;
  // the deep zoom: where the black hole is in this frame, worked out in double precision here
  {
    const deep = smooth(4, 0.6, camera.fov);
    u.uDeep.value = deep;
    if (deep > 0) {
      camera.getWorldDirection(fwd);
      rgt.set(1, 0, 0).applyQuaternion(camera.quaternion);
      upv.set(0, 1, 0).applyQuaternion(camera.quaternion);
      const ty = Math.tan(camera.fov * DEG / 2), tx = ty * W / H;
      const fb = fwd.dot(BH);
      u.uOff.value.set(fwd.dot(E1) / fb, fwd.dot(E2) / fb);
      u.uM.value.set(tx * rgt.dot(E1) / fb, ty * upv.dot(E1) / fb, tx * rgt.dot(E2) / fb, ty * upv.dot(E2) / fb);
      u.uDeepPx.value = pxAng * 206264.8;
    }
  }

  // ---------- light ----------
  const dayK = s.sun;
  // after the Sun: the lamps behind you light the beach (long shadows toward the sea), with the city's glow
  const lampK = lights * (1 - 0.35 * s.cityDim);
  if (dayK > 0.002) {
    sunL.position.copy(SUN).multiplyScalar(400).add(tmpV.set(CAM_B.x, 0, CAM_B.z));
    sunL.color.setRGB(1, 0.96, 0.9);
    sunL.intensity = 2.6 * dayK;
  } else {
    sunL.position.copy(LAMPDIR).multiplyScalar(400).add(tmpV.set(CAM_B.x, 0, CAM_B.z));
    sunL.color.setRGB(1.0, 0.86, 0.68).lerp(tmpC.setRGB(0.9, 0.92, 1.0), s.cover * 0.6);
    sunL.intensity = (0.55 + 0.35 * s.cover) * lampK;
  }
  sunL.target.position.set(CAM_B.x, 0, CAM_B.z);
  sunL.target.updateMatrixWorld();
  // the sky's light goes with the Sun; then starlight and (later) the city's orange glow, and the snow throwing it back
  hemi.intensity = 0.95 * dayK + (1 - dayK) * (0.05 + 0.1 * lampK + 0.5 * s.cover * (0.4 + 0.6 * lampK));
  hemi.color.setRGB(0.61, 0.75, 1.0).lerp(tmpC.setRGB(0.32, 0.36, 0.5), 1 - dayK).lerp(tmpC.setRGB(0.75, 0.6, 0.45), lampK * (1 - dayK) * 0.45).lerp(tmpC.setRGB(0.7, 0.74, 0.86), s.cover * (1 - dayK) * 0.8);
  hemi.groundColor.setRGB(0.7, 0.6, 0.45).lerp(tmpC.setRGB(0.2, 0.18, 0.16), 1 - dayK).lerp(tmpC.setRGB(0.6, 0.62, 0.7), s.cover * (1 - dayK));
  // the fire
  const fl = s.fire * (0.8 + 0.12 * Math.sin(v * 17) + 0.08 * Math.sin(v * 31 + 1));
  fireL.intensity = 9 * fl;
  // the phone camera fighting the dark: exposure up (it can't quite: the dark stays dark)
  renderer.toneMappingExposure = lerp(1.0, 3.4, s.expo) * lerp(1, 0.5, smooth(6, 1, camera.fov)) * (1 - 0.1 * s.cover * (1 - dayK)) * lerp(1, 0.5, smooth(V_LIGHTS, V_LIGHTS + 2, v));
  // the sky colours, for what the sea mirrors
  const su = sea.u;
  su.uTime.value = v; su.uSun.value.copy(SUN); su.uSunI.value = dayK; su.uPx.value = pxAng;
  su.uSkyHi.value.setRGB(0.12, 0.32, 0.78).multiplyScalar(dayK).add(tmpC.setRGB(0.006, 0.008, 0.016));
  su.uSkyLo.value.setRGB(0.56, 0.7, 0.88).multiplyScalar(dayK).add(tmpC.setRGB(0.008, 0.009, 0.013).multiplyScalar(1 + 2 * lampK)).add(tmpC.setRGB(0.05, 0.035, 0.025).multiplyScalar(s.clouds));
  su.uSteam.value = s.steam; su.uSlush.value = s.slush; su.uIce.value = s.ice; su.uLights.value = lampK; su.uNight.value = 1 - dayK; su.uCover.value = s.cover;
  su.uCityDim.value = s.cityDim;

  // ---------- the cold ----------
  FU.uTime.value = v; FU.uFrost.value = s.frost; FU.uCover.value = s.cover;
  BU.uWin.value = smooth(V_DARK, V_LIGHTS + 1, v); BU.uGlowK.value = lerp(0.12, 1.0, 1 - dayK); BU.uDim.value = s.cityDim; BU.uPalm.value = s.palms;

  // ---------- things ----------
  { const d = 0.45 * smooth(V_SNOW + 0.6, V_BURY + 1.0, v); beach.snow.visible = d > 0.004; beach.snow.position.y = d; }
  glows.begin(camera);
  smoke.begin();
  people.frame(v, s, s.anim, glows);
  // cars
  {
    const on = smooth(V_DARK + 1, V_DARK + 2, v) * (1 - smooth(V_FIRE + 3, V_FIRE + 4, v));
    CARS.forEach((c, i) => {
      const x = carX(c, s.anim);
      const m = new THREE.Matrix4().compose(tmpV.set(x, ROAD.y, c.lane.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, c.lane.dir > 0 ? -Math.PI / 2 : Math.PI / 2, 0)), new THREE.Vector3(1, 1, 1));
      fleet.set(i, m, on > 0.5);
    });
    fleet.commit();
  }
  // lamps on the promenade and the pier
  if (lights > 0.001) {
    beach.lamps.forEach(([x, y, z], i) => { const k = lampK * smooth(0, 0.25, lights * 1.3 - (i % 7) * 0.04); glows.add(x, y, z, 1.4, 4.2 * k, 3.1 * k, 1.9 * k); });
    beach.pierLamps.forEach(([x, y, z], i) => { const k = lampK * smooth(0, 0.25, lights * 1.3 - ((i >> 1) % 9) * 0.05); glows.add(x, y, z, 1.6, 4.0 * k, 3.0 * k, 1.8 * k); });
    for (const [x, y, z, r] of FARLIGHTS) { const k = lampK * (r < 0.6 - 0.45 * s.cityDim ? 1 : 0) * smooth(0, 0.3, lights * 1.4 - r * 0.4); glows.add(x, y, z, 7 + 5 * r, 3.2 * k, 2.2 * k, 1.2 * k); }
  }
  // the Ferris wheel: it turns until the jam is over, then stands still; its lights come on with the rest
  wheelFrame(beach, -0.017 * Math.min(v, V_STEAM), glows, lampK, v);
  // fires: the one close to you, and others along the beach
  fire.visible = s.fire > 0.001;
  if (s.fire > 0.001) {
    const fy = sandY(FIRE.z);
    FLAMES.forEach((f, k) => {
      const fh = s.fire * (0.75 + 0.25 * Math.sin(v * (7 + k * 1.3) + k) + 0.12 * Math.sin(v * 19 + k * 2));
      f.scale.set(0.8 + 0.2 * fh, fh, 0.8 + 0.2 * fh);
      f.rotation.y = v * (0.6 + k * 0.2) + k;
    });
    for (let k = 0; k < 5; k++) {
      const a = k * 2.4, fh = 0.3 + 0.4 * Math.abs(Math.sin(v * (5 + k) + k));
      glows.add(FIRE.x + Math.cos(a) * 0.2, fy + 0.3 + fh * 0.5, FIRE.z + Math.sin(a) * 0.2, 0.35 + 0.2 * fh, 0.9 * s.fire, 0.38 * s.fire, 0.1 * s.fire);
    }
    glows.add(FIRE.x, fy + 0.5, FIRE.z, 2.2, 0.35 * fl, 0.15 * fl, 0.04 * fl);
    // sparks lifting off it
    for (let k = 0; k < 14; k++) {
      const T = 1.6 + (k % 4) * 0.3, age = ((v * 1.0 + k * 0.37) % T + T) % T;
      const a = k * 2.1;
      glows.add(FIRE.x + Math.cos(a) * 0.15 * age + 0.2 * Math.sin(age * 3 + k), fy + 0.6 + age * 1.6, FIRE.z + Math.sin(a) * 0.15 * age, 0.05, 3 * s.fire * (1 - age / T), 1.2 * s.fire * (1 - age / T), 0.3 * s.fire * (1 - age / T));
    }
    for (let k = 0; k < 7; k++) {
      const T = 3.0, age = ((v + k * 0.43) % T + T) % T;
      smoke.puff(FIRE.x + 0.4 * age, fy + 1.4 + 1.2 * age, FIRE.z - 0.2 * age, 0.25 + 0.3 * age, 0.12 * s.fire * Math.sin(Math.PI * age / T), 0.3, 0.12 * (1 - age / T), (k * 0.29) % 1);
    }
    for (const [x, z] of FAR_FIRES) {
      const k = s.fire * (0.85 + 0.15 * Math.sin(v * 9 + x));
      glows.add(x, sandY(z) + 0.6, z, 2.4, 3.8 * k, 1.5 * k, 0.4 * k);
    }
  }
  // the sea smoke: columns of steam rising off the water, drifting out to sea
  if (s.steam > 0.01) {
    for (const st of STEAM) {
      const T = 9, age = ((v * st.sp + st.ph) % T + T) % T;
      const z = Z_W - st.o - age * 1.5, y = st.r * 0.4 + age * 1.3;
      const fade = Math.sin(Math.PI * age / T) * smooth(0, 20, st.o);
      smoke.puff(st.x + age * 0.8, y, z, st.r * (0.7 + 0.1 * age), 0.4 * s.steam * fade * (1 - s.ice), 0.95, 0, (st.ph * 0.1) % 1);
    }
  }
  smoke.end();
  glows.end();
  smoke.mat.uniforms.uTime.value = v;
  smoke.mat.uniforms.uLight.value.setRGB(1.0, 0.82, 0.66).multiplyScalar(0.25 + 0.75 * lampK).lerp(tmpC.setRGB(1.6, 1.6, 1.6), dayK);
  smoke.mat.uniforms.uSun.value.set(0, 1, 0);
  const wu = weather.uniforms;
  wu.uTime.value = v;
  wu.uC.value.set(camera.position.x, camera.position.y - 16, camera.position.z);
  wu.uYaw.value = camera.rotation.y;
  wu.uSnow.value = s.snowFall;
  wu.uDiamond.value = smooth(V_ICE + 0.5, V_YEAR, v) * 0.5;      // ice crystals in the air, in the deep cold
  wu.uLight.value = 0.35 + 0.65 * lampK;
  wu.uSky.value.setRGB(0.4, 0.35, 0.3);

  // ---------- post ----------
  const deepK = smooth(6, 1, camera.fov);
  bloom.strength = (0.28 + 0.3 * s.kick + 0.25 * (1 - dayK) * lampK) * (1 - 0.6 * deepK);
  finish.uniforms.uTime.value = v;
  finish.uniforms.uAb.value = s.kick * 0.5;
  finish.uniforms.uBlur.value = window.__cover ? 0 : s.kick * 0.015;
  finish.uniforms.uLens.value = window.__cover ? 0 : lens;
  finish.uniforms.uScope.value = smooth(3, 0.5, camera.fov) * 0.6;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  { let cv = 0; for (const c of COUNTERS) cv = Math.max(cv, Math.min(clamp((v - c.from) / 0.45), clamp((c.to - v) / 0.45))); finish.uniforms.uCounter.value = window.__cover ? 0 : cv * (1 - lens); }
  finish.uniforms.uVig.value = 0.22;

  s.hide = smooth(0.82, 1.0, lens);
  overlay(v, s, v);
  {
    const p = window.__cover ? null : popupAt(v);
    const a = p ? smooth(0, 0.06, p.dt) * (1 - smooth(POP - 0.35, POP, p.dt)) * (1 - s.hide) : 0;
    stampEl.style.opacity = a.toFixed(3);
    finish.uniforms.uPop.value = a;
    { const c = window.__cover ? null : captionAt(v); finish.uniforms.uCap.value = c ? c.alpha * (1 - s.hide) : 0; }
    stampW.style.opacity = '0';
    if (a > 0) {
      if (stampEl.textContent !== p.say) stampEl.textContent = p.say;
      const fit = Math.max(56, Math.min(118, 1560 / p.say.length));
      stampEl.style.fontSize = `${fit.toFixed(1)}px`;
      stampEl.style.transform = `translateY(${(22 * (1 - smooth(0, 0.18, p.dt))).toFixed(1)}px)`;
    }
  }
  return s;
}

let comp = null;
function renderFrame(t) {
  const tail = t - (VIDEO_DURATION - LOOP);
  if (tail >= 0) update(t - VIDEO_DURATION, 1 - smooth(0, LOOP * 0.92, tail));
  else update(t);
  composer.render();
  if (comp) comp.paint();
}

async function boot() {
  await document.fonts.load('500 40px Cormorant');
  await document.fonts.load('italic 500 40px Cormorant');
  await document.fonts.load('600 40px Cormorant');
  await document.fonts.ready;
  if (!params.has('dom')) {
    const { makeCompositor } = await import('./compose.js');
    comp = await makeCompositor(renderer.domElement, stage);
  }
  for (const t of [44, 38, 33, 28, 22, 19, 16, 14, 10, 4, 0]) renderFrame(t);
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, sky, sea, state, update, camAt, BU, FU, comp: () => comp };
  window.DURATION = VIDEO_DURATION;
  window.__glInfo = (() => {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  })();
  window.__ready = true;
  if (!RENDER_MODE) startPreview();
}

function startPreview() {
  const fit = () => { stage.style.transform = `scale(${Math.min(innerWidth / W, innerHeight / H)})`; };
  fit();
  addEventListener('resize', fit);
  const hud = document.createElement('div');
  hud.id = 'hud';
  document.body.appendChild(hud);
  const still = params.has('still');
  let t = Number(params.get('still') ?? params.get('t') ?? 0);
  let playing = !still;
  let last = performance.now();
  addEventListener('keydown', (e) => {
    if (e.code === 'Space') playing = !playing;
    if (e.code === 'ArrowRight') t = Math.min(VIDEO_DURATION, t + 5);
    if (e.code === 'ArrowLeft') t = Math.max(0, t - 5);
  });
  window.__seek = (x) => { t = x; playing = false; renderFrame(t); };
  const loop = (now) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (playing) t = (t + dt) % VIDEO_DURATION;
    renderFrame(t);
    hud.textContent = `${t.toFixed(2)}s ${playing ? '▶' : '❚❚'}  ${(1 / Math.max(dt, 1e-3)).toFixed(0)}fps  [space] [←/→]`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

boot().catch((e) => {
  console.error(e);
  window.__error = String((e && e.stack) || e);
});

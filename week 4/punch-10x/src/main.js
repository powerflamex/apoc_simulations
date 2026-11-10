import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeEarth, SUN_DIR, SURF, EARTH_C, MOON_C, MOON_DIR, DMG } from './earth.js';
import { makeGround, GU } from './ground.js';
import { makeCity } from './city.js';
import { makeWall } from './wall.js';
import { makeFx, cloudH } from './fx.js';
import { F } from './facade.js';
import { makeYou } from './you.js';
import { makeSmoke } from './smoke.js';
import { makeGlows } from './glows.js';
import { makeOverlay } from './overlay.js';
import { state, VIDEO_DURATION, LOOP, popupAt, POP, vPunch, N_PUNCH, V_LAST, T_SWITCH, R_E, R_MOON, MOON_DIST, AU, inSpace, punchAt } from './timeline.js';
import { IMP } from './layout.js';
import { DEG, lerp, smooth, wobble, clamp, keys, rng } from './util.js';
import { makeCompositor } from './compose.js';

const W = 1080, H = 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));
const RW = Math.round(W * RES), RH = Math.round(H * RES);

const stage = document.getElementById('stage');
// log depth: the scene runs from the bricks at your fist to the Moon
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const FOG0 = new THREE.Color(0.78, 0.66, 0.6);
scene.fog = new THREE.FogExp2(FOG0.clone(), 0.00004);
const camera = new THREE.PerspectiveCamera(60, W / H, 0.05, 1e13);
camera.rotation.order = 'YXZ';
scene.add(camera);

// ---------- the world ----------
const sky = makeSky();
scene.add(sky.mesh);
const earth = makeEarth(scene);
const ground = makeGround(earth.earthG);
const plainMat = (color, rough = 0.9, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };
const ctx = { plainMat, glowMat, shadowy };
// (everything in the city sits in one group, hidden once the city is gone, including in the shots back down in the crater)
const cityG = new THREE.Group();
scene.add(cityG);
const city = makeCity(cityG, ctx);
const wall = makeWall(scene);
const you = makeYou(scene);
const glows = makeGlows(scene, 7000);
const smoke = makeSmoke(scene, 7000);
const fx = makeFx(scene);
smoke.mat.uniforms.uLight.value.setRGB(1.0, 0.9, 0.8);
F.uLit.value = 0.32;

// light: the low Sun (casts the shadows near you), the sky's blue from above and the warm ground bounce
const sunL = new THREE.DirectionalLight(0xffd2a0, 3.0);
sunL.castShadow = true;
sunL.shadow.mapSize.set(4096, 4096);
sunL.shadow.bias = -0.0004;
scene.add(sunL, sunL.target);
const hemi = new THREE.HemisphereLight(0x9ab8ee, 0x8a6a52, 1.5);
scene.add(hemi);
const blastL = new THREE.PointLight(0xffe0b0, 0, 0, 2);
scene.add(blastL);

const overlay = makeOverlay();
const stampEl = document.getElementById('stamp');
const stampW = document.getElementById('stampw');
const youEl = document.getElementById('you');

// ---------- post ----------
const rt = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(RW, RH);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv);
    if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 60.0), 1.0); }`,
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.45, 0.5, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
// the finish: zoom blur at the punch, chromatic fringes, the flash, anime speed lines and the black-and-white impact
// frames on the big hits, vignette, darkening behind the title and the counter
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.3 }, uTitle: { value: 0 }, uCounter: { value: 0 },
    uAb: { value: 0 }, uFlash: { value: 0 }, uFlashC: { value: new THREE.Color(1, 0.95, 0.85) }, uBlur: { value: 0 },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uImpact: { value: 0 }, uLines: { value: 0 }, uSeed: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uAb; uniform float uFlash; uniform vec3 uFlashC; uniform float uBlur; uniform vec2 uCenter;
    uniform float uImpact; uniform float uLines; uniform float uSeed;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 d = vUv - uCenter;
      vec3 col = vec3(0.0);
      float jit = h(vUv * 1920.0 + uTime) - 0.5;
      vec2 off = (vUv - 0.5) * uAb * 0.01;
      for (int i = 0; i < 8; i++) {
        float k = (float(i) + jit) / 8.0;
        vec2 uv = uCenter + d * (1.0 - uBlur * k);
        col += vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      }
      col /= 8.0;
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.22);
      // speed lines: thin white streaks radiating from the hit
      vec2 dd = d * vec2(1.0, ${(H / W).toFixed(4)});
      float ang = atan(dd.y, dd.x), rr = length(dd);
      float ln = h(vec2(floor(ang * 90.0), uSeed));
      float streak = step(0.82, ln) * smoothstep(0.22, 0.6, rr) * (0.5 + 0.5 * h(vec2(floor(ang * 90.0), uSeed + 3.0)));
      col = mix(col, vec3(1.0), streak * uLines * 0.55);
      // the impact frame: everything turned to hard black and white, inverted, the streaks in black
      float lum = dot(col, vec3(0.3, 0.55, 0.15));
      vec3 bw = vec3(1.0 - smoothstep(0.32, 0.4, lum));
      bw = mix(bw, vec3(0.0), streak * 0.9);
      col = mix(col, bw, uImpact);
      col += uFlashC * uFlash;
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4 * (1.0 - uImpact);
      col *= 1.0 - uTitle * 0.45 * exp(-pow((vUv.y - 0.345) / 0.09, 2.0));
      col *= 1.0 - uCounter * 0.32 * exp(-pow((vUv.y - 0.53) / 0.065, 2.0)) * smoothstep(0.8, 0.2, vUv.x);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);
// Only the scene needs 4 samples per pixel. When every scene render lands in renderTarget2 (checked below by walking
// the passes), renderTarget1 only ever receives full-screen passes, where all samples of a pixel are equal: a plain
// buffer gives the same image without filling and resolving a second multisampled target every frame.
{
  // the last pass draws to the screen; swapping the buffers after it only decides which one the next frame starts
  // in. Keep the number of swaps per frame even, so the scene always starts in the same (multisampled) buffer.
  if (composer.passes.filter((pass) => pass.needsSwap).length % 2 === 1) composer.passes[composer.passes.length - 1].needsSwap = false;
  let read = composer.renderTarget2, write = composer.renderTarget1, sceneInTwo = true;
  for (const pass of composer.passes) {
    if (pass instanceof RenderPass && read !== composer.renderTarget2) sceneInTwo = false;
    if (pass.needsSwap) [read, write] = [write, read];
  }
  if (sceneInTwo && read === composer.renderTarget2) {
    const old = composer.renderTarget1;
    composer.renderTarget1 = composer.writeBuffer = new THREE.WebGLRenderTarget(old.width, old.height, { type: old.texture.type, depthBuffer: false });
    old.dispose();
  }
}
// the big hits that get an impact frame (3 frames of black and white)
const IMPACT = [7, 11, 14, 18, 22, 28];

// ---------- the camera: one function per shot ----------
const v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), v5 = new THREE.Vector3();
const lookAt = (pos, tgt) => { v3.copy(tgt).sub(pos); return { yaw: Math.atan2(-v3.x, -v3.z), pitch: Math.atan2(v3.y, Math.hypot(v3.x, v3.z)) }; };
// your spot seen from space: the surface point under you, and the directions there
const LA = new THREE.Vector3(0, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
// the space camera's direction from Earth's centre: tilted from straight over you toward the Sun (west) and south
const SPACE_DIR = new THREE.Vector3(-0.42, 1, 0.36).normalize();
const MOON_HIT = MOON_C.clone();
function camAt(v, s) {
  const sh = s.shot;
  const k = smooth(sh.a, sh.b, v);
  const kl = clamp((v - sh.a) / (sh.b - sh.a));
  let pos = new THREE.Vector3(), tgt = new THREE.Vector3(), fov = 60, roll = wobble(v * 0.3, 7) * 0.4 * DEG, near = 0.05;
  if (sh.k === 'shoulder') {
    // over your right shoulder, close: the wall fills the bottom of the frame, the avenue and the towers above it;
    // after punch 2 it rises a little to watch the bricks fly out across the street
    const up = smooth(2.6, 4.2, v);
    pos.set(lerp(0.78, 0.62, kl) + 0.1 * up, lerp(2.12, 2.02, kl) + 0.4 * up, lerp(1.6, 1.3, kl) + 0.3 * up);
    tgt.set(-0.12, lerp(1.45, 1.2, up), lerp(-6, -12, up));
    fov = 60;
  } else if (sh.k === 'street') {
    // behind you on the left, a little higher than the wall: the hole, the avenue, the car, the bus
    pos.set(lerp(-4.8, -3.8, kl), lerp(7.6, 8.2, kl), lerp(7.0, 5.6, kl));
    tgt.set(lerp(0.8, -0.8, kl), lerp(-0.6, -0.2, kl), lerp(-15, -17, kl));
    fov = 64;
  } else if (sh.k === 'street2') {
    // further back and up: the dust ball rolling over the avenue, the shops across the street caving in
    pos.set(lerp(-9, -7.5, kl), lerp(8.5, 12, kl), lerp(19, 15, kl));
    tgt.set(lerp(1, 0, kl), lerp(6, 9, kl), lerp(-36, -44, kl));
    fov = 60;
  } else if (sh.k === 'rise') {
    // rising up behind you: the office block bursting, then straight down the line of towers
    const e = Math.pow(kl, 1.4);
    pos.set(lerp(-5, -26, e), lerp(12, 95, e), lerp(14, 70, e));
    tgt.set(lerp(0, -4, e), lerp(22, 70, e), lerp(-70, -260, e));
    fov = lerp(60, 56, e);
  } else if (sh.k === 'aerial') {
    // a drone climbing away from you: the city blasted flat ahead, then all round you; the mushroom cloud
    const D = keys([[16.35, 260], [18.4, 520], [20.4, 1300], [22.3, 5200], [24.35, 15000]], v, true);
    pos.copy(new THREE.Vector3(-0.22, 0.62, 0.75).normalize().multiplyScalar(D));
    tgt.set(0, D * lerp(0.0, 0.32, smooth(21.5, 24.35, v)), -D * 0.42);
    fov = 58;
    near = Math.max(0.5, D * 0.002);
  } else if (sh.k === 'high') {
    // far out and high: the mushroom clouds towering over the plain, each one bigger, the land scorched round them
    const D = keys([[24.35, 18000], [26.5, 50000], [28.5, 105000], [30.5, 210000], [32.35, 360000]], v, true);
    const el = lerp(28, 22, kl) * DEG;
    pos.set(-Math.sin(30 * DEG) * Math.cos(el) * D, Math.sin(el) * D, Math.cos(30 * DEG) * Math.cos(el) * D);
    const n = clamp(Math.floor((v - vPunch(1)) / 2) + 1, 12, 16);
    tgt.set(0, cloudH(n) * 0.42, 0);
    fov = 56;
    near = D * 0.002;
  } else if (sh.k === 'crater') {
    // down in the crater where Los Angeles was: you, unhurt, still punching; three angles
    if (sh.i === 0) {
      // over your shoulder again, like the first frame
      pos.set(lerp(0.8, 0.66, kl), lerp(2.05, 1.95, kl), lerp(1.6, 1.25, kl));
      tgt.set(-0.12, 1.55, -8);
      fov = 60;
    } else if (sh.i === 1) {
      // low in front of you, the fist coming at the lens
      pos.set(lerp(-0.85, -1.05, kl), lerp(0.75, 0.6, kl), lerp(-2.7, -2.35, kl));
      tgt.set(0.08, 1.45, 0);
      fov = 64;
    } else {
      // wide from the side: you small, the blast racing away to the horizon
      pos.set(lerp(8.5, 10.5, kl), lerp(1.5, 1.9, kl), lerp(5, 3.5, kl));
      tgt.set(-3, 1.3, -3);
      fov = 60;
    }
    near = 0.05;
  } else if (sh.k === 'orbit') {
    // space: the planet from above the Pacific, you near the middle; pulling back as the damage spreads
    const alt = keys([[32.35, 1.2e6], [36.5, 3.2e6], [42, 8e6], [48, 1.6e7], [52.35, 2.4e7]], v, true);
    pos.copy(SPACE_DIR).multiplyScalar(R_E + alt).add(EARTH_C);
    // aim between you and the planet's centre, so the planet's limb and the space beyond are in the frame
    tgt.copy(LA).lerp(EARTH_C, smooth(1.5e6, 2e7, alt) * 0.6);
    fov = 52;
    near = alt * 0.01;
    roll += 8 * DEG;
  } else if (sh.k === 'moon') {
    // by the Moon, looking back at Earth: the Moon big at the top of the frame, Earth small below; the punch's
    // blast comes up from Earth and shatters it
    // (behind the Moon and below the line to Earth: the Moon high in the frame, Earth small below it)
    const toE = v4.copy(EARTH_C).sub(MOON_C).normalize();
    const upP = v5.copy(UP).addScaledVector(toE, -UP.dot(toE)).normalize();
    const d2 = R_MOON * lerp(4.2, 5.0, kl);
    pos.copy(MOON_C).addScaledVector(toE, -d2).addScaledVector(upP, -d2 * 0.55).addScaledVector(new THREE.Vector3().crossVectors(toE, upP), d2 * 0.12);
    const dm = new THREE.Vector3().copy(MOON_C).sub(pos).normalize(), de = new THREE.Vector3().copy(EARTH_C).sub(pos).normalize();
    tgt.copy(pos).add(dm.multiplyScalar(0.5).add(de.multiplyScalar(0.5)).normalize());
    fov = lerp(44, 48, kl);
    near = R_MOON * 0.01;
  } else {
    // the end: Earth glowing, filling the frame, then blowing apart
    const alt = lerp(2.2e7, 1.6e7, Math.pow(kl, 0.8));
    pos.copy(SPACE_DIR).multiplyScalar(R_E + alt).add(EARTH_C);
    tgt.copy(EARTH_C).lerp(LA, 0.25);
    fov = 50;
    near = alt * 0.01;
  }
  const o = lookAt(pos, tgt);
  const wk = fov / 60;
  return { pos, yaw: o.yaw + wobble(v * 0.4, 4) * 0.3 * DEG * wk, pitch: o.pitch + wobble(v * 0.5, 3) * 0.3 * DEG * wk, roll, fov, near };
}

const tmpV = new THREE.Vector3(), tmpC = new THREE.Color();
const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), s4 = new THREE.Vector3();
function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) s.flash = Math.max(s.flash, cover);
  const shot = s.shot.k;

  // ---------- you ----------
  you.root.position.set(0.105, 0, 0);
  you.root.rotation.set(0, Math.PI, 0);
  you.punch(s.arm, 0);
  you.root.visible = v < 30 || shot === 'crater';
  you.root.updateMatrixWorld(true);

  // ---------- the camera, shaken by every punch ----------
  const cam = camAt(v, s);
  let shake = 0, kick = 0;
  for (let n = 1; n <= N_PUNCH; n++) {
    const t = v - vPunch(n);
    if (t < 0 || t > 2.5) continue;
    const a = clamp(0.25 + 0.09 * n, 0, 1.6) * Math.exp(-t / (0.25 + 0.03 * Math.min(n, 15)));
    shake = Math.max(shake, a);
    kick = Math.max(kick, smooth(0, 0.03, t) * Math.exp(-t / 0.14) * clamp(0.3 + 0.05 * n, 0, 1));
  }
  const sh = shake * 0.012 * cam.fov / 60;
  cam.pitch += wobble(v * 43, 3) * sh - kick * 1.0 * DEG;
  cam.yaw += wobble(v * 47, 4) * sh;
  cam.roll += wobble(v * 29, 5) * sh * 0.8;
  if (shot === 'shoulder' || shot === 'street' || shot === 'street2') { cam.pos.x += wobble(v * 31, 1) * sh * 4; cam.pos.y += wobble(v * 37, 2) * sh * 4; }
  camera.position.copy(cam.pos);
  camera.rotation.set(cam.pitch, cam.yaw, cam.roll);
  camera.fov = cam.fov * (1 - 0.05 * kick);
  camera.near = cam.near;
  camera.far = 1e13;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const camY = camera.position.y;
  const camAlt = camera.position.distanceTo(EARTH_C) - R_E;

  // ---------- sky, air ----------
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  sky.mesh.scale.setScalar(Math.max(1, camera.near * 50));
  u.uAlt.value = Math.max(camAlt, 0);
  const rC = R_E + Math.max(camAlt, 0);
  u.uDip.value = Math.sqrt(Math.max(0, 1 - Math.pow(R_E / rC, 2)));
  u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / RH;
  u.uTime.value = v;
  u.uSunDir.value.copy(SUN_DIR);
  const crater = shot === 'crater';
  u.uSpace.value = inSpace(shot) ? 1 : crater ? 0 : smooth(31, 34, v);
  u.uHell.value = crater ? 1 : 0;
  u.uSunAng.value = 0.0047;
  u.uGlare.value = 1;
  u.uDust.value = smooth(vPunch(9), vPunch(12), v) * 0.5 * (1 - smooth(24, 30, v));
  const fogD = 0.00004 / (1 + Math.max(camY, 0) / 600) * (1 - smooth(24, 32, v)) + smooth(vPunch(5), vPunch(7), v) * 0.0005 * (1 - smooth(12.3, 13.5, v));
  scene.fog.density = fogD;
  scene.fog.color.copy(FOG0).lerp(tmpC.setRGB(0.55, 0.47, 0.4), smooth(vPunch(5), vPunch(7), v));
  glows.mat.uniforms.uFogD.value = fogD;
  earth.atmoU.uOn.value = smooth(1e5, 1e6, camAlt);
  SURF.uSunL.value.copy(SUN_DIR);
  SURF.uTime.value = v;
  F.uSunDir.value.copy(SUN_DIR);
  F.uDust.value = smooth(vPunch(5), vPunch(6) + 1, v) * 0.25 + smooth(vPunch(9), vPunch(11), v) * 0.35;
  GU.uDust.value = F.uDust.value * 0.6;
  wall.U.uDust.value = smooth(vPunch(5), vPunch(5) + 2, v) * 0.35;

  // ---------- light ----------
  const camNearYou = v < 24.35 || crater;
  sunL.castShadow = camNearYou;
  if (camNearYou) {
    const half = shot === 'aerial' ? 1200 : shot === 'rise' ? 260 : shot === 'street2' ? 70 : crater ? 12 : 28;
    const ctrS = shot === 'rise' || shot === 'aerial' ? tmpV.set(0, 0, -half * 0.5) : tmpV.set(0, 0, -half * 0.3);
    sunL.position.copy(ctrS).addScaledVector(SUN_DIR, half * 3);
    sunL.target.position.copy(ctrS);
    sunL.target.updateMatrixWorld();
    const sc = sunL.shadow.camera;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
    sc.near = half * 0.5; sc.far = half * 7;
    sc.updateProjectionMatrix();
  } else {
    sunL.position.copy(SUN_DIR).multiplyScalar(1e9);
    sunL.target.position.set(0, 0, 0); sunL.target.updateMatrixWorld();
  }
  const space = inSpace(shot) ? 1 : crater ? 0 : smooth(31, 34, v);
  hemi.intensity = lerp(1.5, 0.05, space);
  sunL.intensity = 3.4;
  hemi.color.set(0x9ab8ee); hemi.groundColor.set(0x8a6a52);
  if (crater) {
    // lit from below by the molten crater and the burning horizon, the Sun a dim red disc through the dust
    hemi.color.setRGB(0.35, 0.16, 0.1); hemi.groundColor.setRGB(1.0, 0.38, 0.12); hemi.intensity = 1.6;
    sunL.intensity = 1.1; sunL.color.setRGB(1.0, 0.45, 0.25);
  } else sunL.color.set(0xffd2a0);
  renderer.toneMappingExposure = lerp(1.05, 1.0, space);

  // ---------- the city, the wall, the blasts ----------
  glows.begin(camera); smoke.begin();
  smoke.mat.uniforms.uTime.value = v;
  smoke.mat.uniforms.uSun.value.copy(SUN_DIR);
  const cityOn = v < 30;
  earth.earthG.visible = true;
  ground.disk.visible = !inSpace(shot);
  earth.globeU.uHole.value = !inSpace(shot) ? 400e3 / R_E : 0;
  cityG.visible = cityOn;
  if (cityOn) city.frame(v, s, glows, smoke, camY);
  wall.frame(v, 20.4, smoke, glows);
  let flashK = fx.frame(v, smoke, glows, camera.position, crater);
  // ---------- down in the crater: embers in the air, smoke drifting, and each punch's blast tearing outward ----------
  if (crater) {
    scene.fog.color.setRGB(0.42, 0.16, 0.07);
    scene.fog.density = 0.00035;
    glows.mat.uniforms.uFogD.value = 0.00035;
    const Re = rng(808);
    for (let k = 0; k < 140; k++) {
      const x0 = (Re() - 0.5) * 60, z0 = (Re() - 0.5) * 60 - 8, y0 = Re() * 14, sp = 0.5 + Re() * 1.5, ph = Re() * 10;
      const y = (y0 + v * sp) % 16, x = x0 + Math.sin(v * 0.7 + ph) * 1.5 + v * 1.2, z = z0 + Math.cos(v * 0.5 + ph);
      const tw = 0.6 + 0.4 * Math.sin(v * 9 + ph * 7);
      glows.add(((x + 30) % 60) - 30, y, z, 0.05 + 0.08 * Re(), 2.6 * tw, 0.9 * tw, 0.2 * tw);
    }
    const n = punchAt(v + 0.001).n, t = v - vPunch(n);
    if (n >= 17 && t >= 0 && t < 2) {
      // the flash at the fist, a white-hot shell racing out over the ground, a wall of fire and dust behind it
      const k = Math.exp(-t / 0.12);
      glows.add(IMP.x, IMP.y, IMP.z - 0.25, 0.35 + 1.2 * (1 - k), 1.4 * k, 1.2 * k, 1.0 * k);
      flashK = Math.max(flashK, 0.35 * k);
      const R = 25 + 2600 * Math.pow(smooth(0, 1.5, t), 0.7);
      if (fx.shells.count < 8) {
        const i = fx.shells.count++;
        m4.compose(tmpV.set(IMP.x, 0, IMP.z), q4.identity(), s4.set(R, R * 0.6, R));
        fx.shells.setMatrixAt(i, m4);
        fx.shells.geometry.attributes.aA.setX(i, 1.0 * (1 - smooth(0.9, 2, t)));
        fx.shells.instanceMatrix.needsUpdate = true; fx.shells.geometry.attributes.aA.needsUpdate = true;
      }
      const Rp = rng(n * 77);
      for (let j = 0; j < 90; j++) {
        const a = (j / 90) * Math.PI * 2 + Rp() * 0.05;
        const rr = R * (0.94 + 0.08 * Rp());
        const pr = Math.max(3, R * 0.05) * (0.7 + 0.6 * Rp());
        smoke.puff(IMP.x + Math.sin(a) * rr, pr * 0.5, IMP.z - Math.cos(a) * rr, pr, 0.75 * smooth(0.05, 0.25, t) * (1 - smooth(1.2, 2, t)), 0.35 + 0.2 * Rp(), 1.3 * Math.exp(-t / 0.6) + 0.35, Rp());
      }
      // glowing rock thrown out of the ground ahead of the fist
      for (let j = 0; j < 70; j++) {
        const a = -Math.PI / 2 + (Rp() - 0.5) * 2.2, sp = 20 + Rp() * 90, up = 5 + Rp() * 25;
        const x = IMP.x + Math.cos(a) * sp * t, z = IMP.z + Math.sin(a) * sp * t, y = 0.5 + up * t - 4.9 * t * t;
        if (y < 0) continue;
        glows.add(x, y, z, 0.25 + 0.5 * Rp(), 2.6, 0.9, 0.25);
      }
    }
    blastL.intensity = 0;
  }
  // the blast's light on everything near it
  blastL.position.set(IMP.x, IMP.y + 1, IMP.z - 2);
  blastL.intensity = flashK * 60 * (v < 13 ? 1 : 0);

  // ---------- the planet: what the big punches do to it ----------
  {
    // angular radii (rad) of the damage, punch by punch (from punch 17, once it's bigger than a region)
    const burnOf = (n) => (n < 17 ? 0 : Math.min(Math.PI, 0.03 * Math.pow(1.55, n - 17)));
    let burn = 0, fireR = 0, ringR = 0, ringA = 0, dustR = 0, crackR = 0, crackA = 0, flashE = 0;
    for (let n = 13; n <= N_PUNCH; n++) {
      const t = v - vPunch(n);
      if (t < 0) break;
      const B = burnOf(n), B0 = burnOf(n - 1);
      const g = smooth(0, 1.4, t);
      burn = Math.max(burn, lerp(B0, B, g));
      if (n >= 17) {
        fireR = lerp(B0, B * 1.08, smooth(0, 1.6, t)) * (n < 27 ? 1 : 0);
        dustR = Math.max(dustR, Math.min(Math.PI, B * (1.6 + 0.8 * g)));
        flashE = Math.max(flashE, Math.exp(-t / 0.25) * clamp((n - 16) / 6));
      }
      // the shock ring runs right round the world (from punch 18: in ~3 s)
      if (n >= 18 && t < 4) { ringR = Math.min(Math.PI * 0.98, (0.05 + Math.PI * Math.pow(t / 3.2, 0.8))); ringA = 0.9 * (1 - smooth(2.6, 4, t)) * smooth(0, 0.1, t); }
      if (n >= 23) { crackR = Math.max(crackR, Math.min(Math.PI, 0.35 * Math.pow(1.9, n - 23) * smooth(0, 1.5, t) + 0.1)); crackA = Math.max(crackA, clamp(0.45 + 0.15 * (n - 23)) * smooth(0, 0.4, t)); }
    }
    DMG.uBurnR.value = burn; DMG.uFireR.value = fireR; DMG.uRingR.value = ringR; DMG.uRingA.value = ringA;
    DMG.uDustR.value = dustR; DMG.uSplitR.value = crackR; DMG.uSplitA.value = crackA;
    DMG.uSteam.value = smooth(vPunch(26), vPunch(26) + 2.2, v);
    DMG.uMolten.value = smooth(vPunch(29), vPunch(29) + 1.5, v) * 0.55 + smooth(vPunch(30), vPunch(30) + 1.5, v) * 0.35 + smooth(V_LAST, V_LAST + 0.3, v) * 0.1;
    earth.atmoU.uOn.value *= 1 - 0.7 * DMG.uMolten.value;
    DMG.uFlash.value = flashE * 0.25;
    // the flash and the glowing debris thrown up into space on each big punch (punch 17 on)
    for (let n = 17; n <= N_PUNCH && !crater; n++) {
      const t = v - vPunch(n);
      if (t < 0 || t > 6) continue;
      const big = Math.pow(1.3, Math.min(n, 26) - 17);
      const k = Math.exp(-t / 0.25);
      const gs = Math.min(R_E * 0.9, 3e5 * big * (1 + 1.5 * (1 - k)));
      glows.add(0, 2e4, 0, gs, 2.6 * k + 0.15 * Math.exp(-t / 2), 1.8 * k + 0.06 * Math.exp(-t / 2), 0.9 * k);
      // glowing rock thrown up into space: a fan of small hot pieces (not a cloud)
      if (n >= 19 && n <= 28) {
        const Rp = rng(n * 31);
        const np = 90;
        for (let j = 0; j < np; j++) {
          const sp = (0.25 + Rp()) * 9e5 * Math.sqrt(big), a = Rp() * Math.PI * 2, tilt = Math.pow(Rp(), 0.7) * 0.9;
          const dir = tmpV.set(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
          const d = sp * t - 0.5 * 1.2e5 * t * t;
          if (d < 1e4) continue;
          const hot = Math.exp(-t / 1.6);
          glows.add(dir.x * d, dir.y * d, dir.z * d, (1.5e4 + 3e4 * Rp()) * Math.sqrt(big), 2.4 * hot + 0.3, 0.9 * hot + 0.1, 0.25 * hot, );
        }
      }
      // the shock shell where it meets the planet: a bright circle racing out over the surface
      if (t < 1.5 && n >= 17 && n < 24) {
        const rr = Math.min(R_E * 0.8, R_E * burnOf(n) * 2.0 * smooth(0, 1.2, t) + 5e4);
        fx.shells.count = Math.min(fx.shells.count + 1, 8);
        const i = fx.shells.count - 1;
        m4.compose(tmpV.set(0, 0, 0), q4.identity(), s4.setScalar(rr));
        fx.shells.setMatrixAt(i, m4);
        fx.shells.geometry.attributes.aA.setX(i, 0.8 * (1 - smooth(0.6, 1.5, t)));
        fx.shells.instanceMatrix.needsUpdate = true; fx.shells.geometry.attributes.aA.needsUpdate = true;
      }
    }
  }

  // ---------- the Moon: the blast of punch 28 comes up from Earth and shatters it ----------
  {
    const V28 = vPunch(28);
    const tB = v - V28;                         // the beam leaves Earth at the punch, reaches the Moon 0.35 s later
    const arrive = 0.35;
    const toMoon = tmpV.copy(MOON_C).sub(LA).normalize();
    earth.moonU.uHitDir.value.copy(toMoon).negate();
    // (in the shot by the Moon, light it partly from the camera's side, so its face reads: a gibbous Moon)
    if (shot === 'moon') earth.moonU.uSunL.value.copy(SUN_DIR).multiplyScalar(0.35).add(v5.copy(camera.position).sub(MOON_C).normalize().multiplyScalar(0.65)).normalize();
    else earth.moonU.uSunL.value.copy(SUN_DIR);
    earth.moonU.uHit.value = smooth(arrive - 0.05, arrive + 0.15, tB) * (tB < arrive + 0.5 ? 1 : 0);
    earth.moon.visible = tB < arrive + 0.12;
    // the beam: a line of light from you to the Moon (glow points along it)
    if (tB > 0 && tB < 1.6 && (shot === 'moon' || shot === 'orbit')) {
      const reach = Math.min(1, tB / arrive);
      const fade = 1 - smooth(arrive, 1.6, tB);
      const L = MOON_DIST - R_E - R_MOON;
      const nb = 160;
      for (let j = 0; j <= nb; j++) {
        const f = j / nb;
        if (f > reach) break;
        const p = v4.copy(toMoon).multiplyScalar(f * L).add(LA);
        const w = (2.5e6 + 1.5e6 * Math.sin(f * 40 + v * 30) * 0.2) * (0.6 + 0.4 * f);
        glows.add(p.x, p.y, p.z, w, 2.4 * fade, 2.0 * fade, 1.6 * fade);
      }
    }
    // the pieces: flung out from the far side, glowing on their broken faces
    const fr = earth.mfrags;
    const dt = tB - arrive;
    if (dt > -0.02 && v < T_SWITCH + 0.5) {
      fr.count = earth.MF.length;
      earth.MF.forEach((f, i) => {
        const t = Math.max(dt, 0);
        const out = f.r0 * R_MOON * 0.9 + f.sp * R_MOON * 2.2 * (1 - Math.exp(-t / 0.9)) + f.sp * R_MOON * 0.25 * t;
        const p = v4.copy(f.dir).multiplyScalar(out).addScaledVector(toMoon, R_MOON * 0.9 * f.sp * t).add(MOON_C);
        e4.set(f.spin.x * t, f.spin.y * t, f.spin.z * t);
        q4.setFromEuler(e4);
        m4.compose(p, q4, s4.setScalar(f.size * R_MOON));
        fr.setMatrixAt(i, m4);
      });
      fr.instanceMatrix.needsUpdate = true;
      fr.material.emissiveIntensity = 0.5 * Math.exp(-Math.max(dt, 0) / 0.8);
      if (dt < 1.2) { const k = Math.exp(-Math.max(dt, 0) / 0.25); glows.add(MOON_C.x, MOON_C.y, MOON_C.z, R_MOON * (3 + 5 * Math.max(dt, 0)), 3.2 * k, 2.4 * k, 1.5 * k); }
    } else fr.count = 0;
  }
  // ---------- Earth blows apart (punch 31) ----------
  {
    const dt = v - V_LAST - 0.12;
    const fr = earth.frags;
    if (dt > -0.02 && cover < 0) {
      earth.globe.visible = dt < 0.06;
      earth.atmo.visible = dt < 0.06;
      fr.count = earth.FR.length;
      earth.FR.forEach((f, i) => {
        const t = Math.max(dt, 0);
        const out = f.r0 * R_E * 0.95 + f.sp * R_E * 1.4 * (1 - Math.exp(-t / 0.5)) + f.sp * R_E * 0.5 * t;
        const p = v4.copy(f.dir).multiplyScalar(out).add(EARTH_C);
        e4.set(f.spin.x * t, f.spin.y * t, f.spin.z * t);
        q4.setFromEuler(e4);
        m4.compose(p, q4, s4.setScalar(f.size * R_E));
        fr.setMatrixAt(i, m4);
      });
      fr.instanceMatrix.needsUpdate = true;
      fr.material.emissiveIntensity = 3.0;
      const k = smooth(-0.02, 0.1, dt);
      glows.add(EARTH_C.x, EARTH_C.y, EARTH_C.z, R_E * (2.5 + 6 * Math.max(dt, 0)), 4 * k, 3.2 * k, 2.4 * k);
    } else { fr.count = 0; earth.globe.visible = true; earth.atmo.visible = true; }
  }
  glows.end(); smoke.end();

  // ---------- post ----------
  bloom.strength = 0.45 + 0.3 * flashK;
  finish.uniforms.uTime.value = v;
  {
    // the zoom blur and the speed lines right after each punch, centred on where it hits on screen
    let blur = 0, lines = 0, impact = 0, seed = 0;
    for (let n = 1; n <= N_PUNCH; n++) {
      const t = v - vPunch(n);
      if (t < 0 || t > 0.6) continue;
      blur = Math.max(blur, (0.02 + 0.006 * Math.min(n, 15)) * Math.exp(-t / 0.08));
      if (n >= 3) { lines = Math.max(lines, Math.exp(-t / 0.12) * clamp(0.4 + 0.04 * n)); seed = n; }
      if (IMPACT.includes(n) && t < 0.05) impact = 1;
    }
    finish.uniforms.uBlur.value = window.__cover ? 0 : blur;
    finish.uniforms.uLines.value = window.__cover ? 0 : lines;
    finish.uniforms.uImpact.value = window.__cover ? 0 : impact;
    finish.uniforms.uSeed.value = seed * 7.3;
    const ctr = crater ? tmpV.set(IMP.x, IMP.y, IMP.z) : v < 30 ? tmpV.set(IMP.x, v < 12.3 ? IMP.y : 30, IMP.z - (v < 12.3 ? 0.5 : 40)) : v4.set(0, 0, 0);
    if (v > 54 && v < 58.35) ctr.copy(MOON_C);
    ctr.project(camera);
    finish.uniforms.uCenter.value.set(clamp(ctr.x * 0.5 + 0.5, 0.05, 0.95), clamp(ctr.y * 0.5 + 0.5, 0.05, 0.95));
  }
  finish.uniforms.uAb.value = kick * 0.8 + shake * 0.05;
  finish.uniforms.uFlash.value = window.__cover ? 0 : Math.min(0.7, flashK * (v < 12.3 ? 0.25 : 0.45));
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : (1 - s.flash) * 0.9;

  overlay(v, s, v);
  // the gold popup: one phrase saying what just happened (never a number), sized to fit the width
  {
    const p = window.__cover ? null : popupAt(v);
    const a = p ? smooth(0, 0.06, p.dt) * (1 - smooth(POP - 0.35, POP, p.dt)) * (1 - s.flash) : 0;
    stampEl.style.opacity = a.toFixed(3);
    stampW.style.opacity = '0';
    if (a > 0) {
      if (stampEl.textContent !== p.say) stampEl.textContent = p.say;
      const fit = Math.max(64, Math.min(118, 1700 / p.say.length));
      stampEl.style.fontSize = `${fit.toFixed(1)}px`;
      stampEl.style.transform = `translateY(${(22 * (1 - smooth(0, 0.18, p.dt))).toFixed(1)}px)`;
    }
  }
  // "YOU" over your spot once the camera has left the street
  {
    v4.set(0, 2, 0).project(camera);
    const sx = (v4.x * 0.5 + 0.5) * W, sy = (-v4.y * 0.5 + 0.5) * H;
    const vis = v4.z < 1 && sx > 80 && sx < W - 80 && sy > 200 && sy < H - 80;
    const on = smooth(16.6, 17.2, v) * (1 - smooth(46, 47, v)) * (crater ? 0 : 1);
    const a = window.__cover || !vis ? 0 : on * (1 - s.flash);
    youEl.style.opacity = a.toFixed(3);
    if (a > 0) { youEl.style.left = `${(sx - 120).toFixed(1)}px`; youEl.style.top = `${(sy - 112).toFixed(1)}px`; }
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
  await earth.ready;
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  for (const t of [60, 55, 50, 40, 30, 22, 14, 6, 0]) renderFrame(t);
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, earth, you };
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

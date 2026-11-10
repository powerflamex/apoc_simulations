import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeLand, SURF, EARTH_C } from './land.js';
import { makeCity, CU } from './city.js';
import { makeThings } from './things.js';
import { makeHole, accR } from './hole.js';
import { makeGlows } from './glows.js';
import { makeOverlay } from './overlay.js';
import { PU, B } from './pull.js';
import { state, VIDEO_DURATION, LOOP, popupAt, POP, R_E, STEP, gmAt, V_YOU, V_MARBLE, sizeAt, V_EARTH, T_SWITCH } from './timeline.js';
import { DEG, lerp, smooth, wobble, clamp, keys } from './util.js';
import { makeCompositor } from './compose.js';

const W = 1080, H = 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));
const RW = Math.round(W * RES), RH = Math.round(H * RES);

const stage = document.getElementById('stage');
// log depth: the scene runs from the coins at your feet to the whole planet seen from space
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, W / H, 0.05, 1e13);
camera.rotation.order = 'YXZ';
scene.add(camera);

// ---------- the world ----------
const sky = makeSky();
scene.add(sky.mesh);
const land = makeLand(scene);
const plainMat = (color, rough = 0.9, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
const shadowy = (m) => { m.frustumCulled = false; return m; };
const ctx = { plainMat, glowMat, shadowy };
const cityG = new THREE.Group();
scene.add(cityG);
const city = makeCity(cityG);
const thingsG = new THREE.Group();
scene.add(thingsG);
const things = makeThings(thingsG, ctx);
const glows = makeGlows(scene, 12000);
const hole = makeHole(scene);

// light: a dim night sky and the city's glow from below; a fill from the neon behind the camera; the black hole's
// own light is in hole.js
const hemi = new THREE.HemisphereLight(0x2a2f5a, 0x5a3a2a, 0.9);
scene.add(hemi);
const fill = new THREE.PointLight(0xff8ac0, 0, 0, 2);
scene.add(fill);
const fill2 = new THREE.PointLight(0x8ab0ff, 0, 0, 2);
scene.add(fill2);

const overlay = makeOverlay();
const stampEl = document.getElementById('stamp');
const stampW = document.getElementById('stampw');

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
    if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 16.0), 1.0); }`,
}));
// the marble: everything behind it bent round its shadow (a point lens: a pixel at angle t from it shows what is at
// t - tE^2 / t), black inside the shadow, a thin bright photon ring at its edge. Done on the linear HDR frame.
const lens = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uC: { value: new THREE.Vector2(0.5, 0.5) }, uE: { value: 0 }, uS: { value: 0 }, uAsp: { value: W / H },
    uRing: { value: new THREE.Vector3(1.8, 1.44, 1.08) }, uHalo: { value: 0 }, uPx: { value: 1 / H } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `uniform sampler2D tDiffuse; uniform vec2 uC; uniform float uE; uniform float uS; uniform float uAsp; uniform vec3 uRing; uniform float uHalo; uniform float uPx; varying vec2 vUv;
    void main(){
      if (uS <= 0.0) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
      vec2 d = (vUv - uC) * vec2(uAsp, 1.0);
      float r = length(d);
      float rs = max(r, 1e-5);
      vec2 src = uC + (d * (1.0 - uE * uE / (rs * rs))) / vec2(uAsp, 1.0);
      vec3 c = texture2D(tDiffuse, src).rgb;
      // the photon ring and the shadow
      float ring = exp(-pow((r - uS * 1.015) / max(uS * 0.02, uPx * 0.9), 2.0));
      c = mix(c, vec3(0.0), 1.0 - smoothstep(uS * 0.985 - uPx * 0.7, uS * 1.005 + uPx * 0.7, r));
      c += uRing * ring;
      // (street shots) a hot orange glow hugging the ring and a violet halo further out: its own colour, nothing on
      // the Strip has it
      c += vec3(2.2, 0.75, 0.15) * uHalo * exp(-pow((r - uS * 1.3) / (uS * 0.3), 2.0));
      c += vec3(0.75, 0.18, 1.35) * uHalo * 0.5 * exp(-max(r - uS * 1.6, 0.0) / (uS * 1.6)) * step(uS, r);
      gl_FragColor = vec4(c, 1.0);
    }`,
});
composer.addPass(lens);
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.5, 0.35, 0.9);
composer.addPass(bloom);
// (after the glow: the shadow stays pure black, the glow of its own ring doesn't fill it in)
const dot = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uC: { value: new THREE.Vector2(0.5, 0.5) }, uS: { value: 0 }, uAsp: { value: W / H }, uPx: { value: 1 / H } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `uniform sampler2D tDiffuse; uniform vec2 uC; uniform float uS; uniform float uAsp; uniform float uPx; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (uS > 0.0) { float r = length((vUv - uC) * vec2(uAsp, 1.0)); c *= smoothstep(uS * 0.9 - uPx, uS * 0.97 + uPx * 0.5, r); }
      gl_FragColor = vec4(c, 1.0);
    }`,
});
composer.addPass(dot);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.35 }, uTitle: { value: 0 }, uCounter: { value: 0 },
    uAb: { value: 0 }, uFlash: { value: 0 }, uFlashC: { value: new THREE.Color(1, 0.97, 0.92) }, uBlur: { value: 0 }, uCenter: { value: new THREE.Vector2(0.5, 0.5) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uAb; uniform float uFlash; uniform vec3 uFlashC; uniform float uBlur; uniform vec2 uCenter;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 d = vUv - uCenter;
      vec3 col = vec3(0.0);
      float jit = h(vUv * 1920.0 + uTime) - 0.5;
      vec2 off = (vUv - 0.5) * uAb * 0.01;
      for (int i = 0; i < 6; i++) {
        float k = (float(i) + jit) / 6.0;
        vec2 uv = uCenter + d * (1.0 - uBlur * k);
        col += vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      }
      col /= 6.0;
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.15);
      col += uFlashC * uFlash;
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.5 * exp(-pow((vUv.y - 0.33) / 0.1, 2.0));
      col *= 1.0 - uCounter * 0.32 * exp(-pow((vUv.y - 0.5) / 0.07, 2.0)) * smoothstep(0.85, 0.2, vUv.x);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- the camera: one function per shot ----------
const v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), v5 = new THREE.Vector3();
const lookAt = (pos, tgt) => { v3.copy(tgt).sub(pos); return { yaw: Math.atan2(-v3.x, -v3.z), pitch: Math.atan2(v3.y, Math.hypot(v3.x, v3.z)) }; };
const TOWER = new THREE.Vector3(720, 300, 2480);              // you, on a tower 2.6 km away (south-east, across the low city)
const dirFrom = (az, el) => new THREE.Vector3(Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), Math.cos(az * DEG) * Math.cos(el * DEG));
const HIGH_D = [[24.2, 2.2e4], [27, 3.6e4], [30, 1.1e5], [33, 3.5e5], [36, 1.2e6], [38.5, 6.5e6], [40, 1.25e7]];
const highAz = (v) => lerp(-8, 22, smooth(24.2, 40, v));
const highEl = (v) => lerp(42, 68, smooth(24.6, 38.5, v));
function camAt(v, s) {
  const sh = s.shot;
  const kl = clamp((v - sh.a) / (sh.b - sh.a));
  const pos = new THREE.Vector3(), tgt = new THREE.Vector3();
  // pOff: how far (deg) the view is tipped down from the black hole, so it sits in the upper third, clear of the counter
  let fov = 60, roll = wobble(v * 0.3, 7) * 0.5 * DEG, near = 0.05, hand = 1, pOff = 0, yOff = 0;
  if (sh.k === 'face') {
    // right in front of it: it hangs just above the middle of the frame, people at your shoulders; you back away
    const k = Math.pow(smooth(-0.5, 4.5, v), 1.3);
    pos.set(1.75 - 0.2 * k, 1.62 + 0.08 * k, 2.75 + 1.9 * k);
    tgt.copy(B);
    fov = 70;
    pOff = 11.5; yOff = 1.5;
  } else if (sh.k === 'walk') {
    pos.set(-3.0 - 0.3 * kl, 3.6, 24.6 + 1.6 * kl);
    tgt.set(1.4, 1.3, 0);
    fov = 52;
    pOff = 10.5;
  } else if (sh.k === 'block') {
    pos.set(-4.2, 11.5 + 0.8 * kl, 104 + 5 * kl);
    tgt.set(1.6, 1.3, 0);
    fov = 40;
    pOff = 7.5;
  } else if (sh.k === 'rise') {
    const e = Math.pow(kl, 1.2);
    pos.set(lerp(9, 16, e), lerp(26, 200, e), lerp(300, 680, e));
    tgt.set(0.6, 1.3, 0);
    fov = 52;
    pOff = 10;
    near = 0.3;
  } else if (sh.k === 'tower') {
    // you, on the roof of a tower 2.6 km south. Its pull on you passes Earth's at 21 s: you fall sideways toward it
    const t = Math.max(0, v - V_YOU);
    const fallD = 9.81 * 1.697 * (Math.pow(10, t / 3) - 1 - (Math.LN10 / 3) * t);
    const dir = v4.copy(B).sub(TOWER).normalize();
    pos.copy(TOWER).addScaledVector(dir, fallD);
    tgt.copy(B);
    fov = lerp(48, 44, smooth(16.6, 21, v));
    pOff = 9.5;
    roll += 62 * DEG * smooth(V_YOU, V_YOU + 2.2, v);
    near = 0.5;
    hand = 1 + 3 * smooth(V_YOU, V_YOU + 2.5, v);
  } else if (sh.k === 'high') {
    const D = keys(HIGH_D, v, true);
    pos.copy(dirFrom(highAz(v), highEl(v))).multiplyScalar(D).add(B);
    tgt.copy(B).lerp(EARTH_C, 0.25 * smooth(1.5e6, 1.2e7, D));
    fov = 50;
    near = D * 0.002;
  } else {
    // down into it: from space to 35 cm from the marble in under 2 s, ending a little above its swirl
    const k = smooth(sh.a, V_MARBLE, v);
    const e = k * k * (3 - 2 * k);
    const D0 = HIGH_D[HIGH_D.length - 1][1], D1 = 0.36;
    let D = Math.exp(lerp(Math.log(D0), Math.log(D1), e));
    D *= 1 - 0.12 * smooth(V_MARBLE, T_SWITCH, v);
    const az = lerp(highAz(sh.a), 35, e) + 6 * smooth(V_MARBLE, T_SWITCH, v), el = lerp(highEl(sh.a), 9, e);
    pos.copy(dirFrom(az, el)).multiplyScalar(D).add(B);
    tgt.copy(B).lerp(EARTH_C, 0.25 * smooth(1.5e6, 1.2e7, D));
    fov = lerp(50, 40, e);
    near = Math.max(D * 0.002, 0.002);
    hand = 0.4;
  }
  const o = lookAt(pos, tgt);
  o.pitch -= pOff * DEG;
  o.yaw += yOff * DEG;
  // (from the sky and space, the hole sits in the upper third: the counter is in the middle of the frame)
  if (sh.k === 'high') o.pitch -= 9 * DEG;
  if (sh.k === 'zoom') o.pitch -= 9 * DEG * (1 - smooth(sh.a, V_MARBLE, v)) + 7 * DEG * smooth(40.6, V_MARBLE, v);
  const wk = fov / 60 * hand;
  return { pos, yaw: o.yaw + wobble(v * 0.45, 4) * 0.35 * DEG * wk, pitch: o.pitch + wobble(v * 0.55, 3) * 0.3 * DEG * wk, roll, fov, near };
}

const tmpC = new THREE.Color();
function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) s.flash = Math.max(s.flash, cover);
  const shot = s.shot.k;
  PU.uGM.value = gmAt(v);
  CU.uTime.value = v;
  SURF.uTime.value = v;

  // ---------- the camera, jolted on every step (10x every 3 s) ----------
  const cam = camAt(v, s);
  let kick = 0;
  for (let n = 1; n * STEP < v + 0.01 && n < 15; n++) {
    const t = v - n * STEP;
    if (t >= 0 && t < 1.2) kick = Math.max(kick, smooth(0, 0.04, t) * Math.exp(-t / 0.22) * clamp(0.35 + 0.05 * n));
  }
  const shakeAmp = (shot === 'tower' ? 0.3 + 2.5 * smooth(V_YOU, V_YOU + 3, v) : 0.25) * (shot === 'high' || shot === 'zoom' ? 0.3 : 1);
  const sh = (kick * 0.9 + 0.08 * shakeAmp) * 0.012 * cam.fov / 60 * (shot === 'zoom' ? 0.2 : 1);
  cam.pitch += wobble(v * 43, 3) * sh - kick * 0.8 * DEG;
  cam.yaw += wobble(v * 47, 4) * sh;
  cam.roll += wobble(v * 29, 5) * sh * 0.8;
  camera.position.copy(cam.pos);
  camera.rotation.set(cam.pitch, cam.yaw, cam.roll);
  camera.fov = cam.fov * (1 - 0.04 * kick);
  camera.near = cam.near;
  camera.far = 1e13;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const camAlt = camera.position.distanceTo(EARTH_C) - R_E;
  const camD = camera.position.distanceTo(B);

  // ---------- sky ----------
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  sky.mesh.scale.setScalar(Math.max(1, camera.near * 50));
  const rC = R_E + Math.max(camAlt, 0);
  u.uDip.value = Math.sqrt(Math.max(0, 1 - Math.pow(R_E / rC, 2)));
  u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / RH;
  u.uSpace.value = shot === 'zoom' ? 1 : smooth(4e4, 2.5e5, camAlt);
  u.uGlow.value = 1 - smooth(24, 30, v);
  land.atmoU.uOn.value = smooth(1e5, 8e5, camAlt);
  // the grid fails as the valley goes (and the lamps near it flicker out with their poles)
  SURF.uLamps.value = 1;
  CU.uDim.value = 1;

  // ---------- what is drawn ----------
  const deep = shot === 'zoom' && camD < 3e4;     // the last part of the dive: only the swirl and the marble
  const streetOn = v < 24.2;
  cityG.visible = v < 24.2;
  thingsG.visible = streetOn;
  land.ground.visible = !deep;
  land.globe.visible = !deep;
  land.atmo.visible = !deep;

  glows.begin(camera);
  if (streetOn) things.frame(v, glows, camera.position);
  const crush = streetOn ? things.crushRate(v) : 2;
  // the swirl: physical size; at the marble its inner edge is where nothing can orbit (3 x its radius)
  const rs = sizeAt(v) / 2;
  const R = accR(v);
  const inner = shot === 'zoom' ? clamp(3 * rs / R, 0, 0.5) : 0;
  const near3 = shot === 'face' || shot === 'walk' || shot === 'block';
  const hs = hole.frame(v, glows, crush, camera.position, { R, inner, diskK: shot === 'zoom' ? 0.75 : shot === 'high' ? 0.8 * (1 - 0.35 * smooth(37, 39.5, v)) : shot === 'tower' ? 0.8 : 1, cap: shot === 'zoom' ? 0.5 : shot === 'face' ? 1.0 : 6, streaks: shot === 'high' ? 1 - smooth(38, 39.6, v) : 0, overGround: shot === 'high' && v < 38.5, noStar: near3, noHawk: near3, focus: shot === 'zoom' ? Math.max(camD * 0.45, 0.1) : 1e12, tilt: shot === 'zoom' ? 24 * (1 - smooth(40.4, 41.4, v)) : 24, lightK: streetOn ? 1 : 0 });
  glows.end();

  // ---------- lights ----------
  hemi.intensity = streetOn ? 0.75 : 0.2;
  const near = shot === 'face' || shot === 'walk' || shot === 'block';
  fill.position.copy(camera.position).add(v4.set(-1.5, 1.2, 2.5).applyQuaternion(camera.quaternion));
  fill.intensity = near ? 9 : 0;
  fill2.position.copy(camera.position).add(v4.set(2.2, 0.5, 1.5).applyQuaternion(camera.quaternion));
  fill2.intensity = near ? 6 : 0;
  SURF.uBHL.value.set(hole.light.color.r, hole.light.color.g, hole.light.color.b).multiplyScalar(hole.light.intensity * 0.25);
  renderer.toneMappingExposure = shot === 'face' ? 1.15 : 1.05;

  // ---------- the lens round the marble ----------
  {
    let S = 0, E = 0;
    const scr0 = 1 / (2 * Math.tan(camera.fov * DEG / 2));
    lens.uniforms.uRing.value.set(1.8, 1.44, 1.08);
    lens.uniforms.uHalo.value = 0;
    if (near3 || (shot === 'rise' && v < 13.6)) {
      v4.copy(B).applyMatrix4(camera.matrixWorldInverse);
      if (v4.z < 0) {
        const fade = 1 - smooth(12.6, 13.5, v);
        S = Math.max(0.03 / camD * scr0, 0.0048) * fade;
        E = S * 3.8;
        v4.copy(B).project(camera);
        lens.uniforms.uC.value.set(v4.x * 0.5 + 0.5, v4.y * 0.5 + 0.5);
        lens.uniforms.uRing.value.set(3.0, 1.15, 0.22);
        lens.uniforms.uHalo.value = (0.4 + 0.45 * hs.hk) * fade;
      }
    }
    if (shot === 'zoom') {
      const rsE = sizeAt(V_EARTH) / 2;
      const th = Math.atan(2.6 * rsE / camD);                    // the shadow's angular radius
      const tE = Math.sqrt(2 * rsE / camD);                      // the bending
      const scr = 1 / (2 * Math.tan(camera.fov * DEG / 2));
      S = Math.tan(th) * scr; E = Math.min(tE * scr, 0.45) * smooth(5, 1, camD);
      v4.copy(B).project(camera);
      lens.uniforms.uC.value.set(v4.x * 0.5 + 0.5, v4.y * 0.5 + 0.5);
      if (S < 0.0015) S = 0;
    }
    lens.uniforms.uS.value = S;
    lens.uniforms.uE.value = E;
    // (ShaderPass copies its uniforms, so the dot pass gets them set here)
    dot.uniforms.uS.value = S; dot.uniforms.uC.value.copy(lens.uniforms.uC.value);
  }

  // ---------- post ----------
  bloom.strength = (shot === 'face' ? 0.32 : 0.55) + 0.25 * kick - (shot === 'zoom' ? 0.3 * smooth(40.8, V_MARBLE, v) : 0);
  finish.uniforms.uTime.value = v;
  finish.uniforms.uAb.value = kick * 0.7 + (shot === 'tower' ? smooth(V_YOU, V_YOU + 2, v) * 0.4 : 0);
  finish.uniforms.uBlur.value = window.__cover ? 0 : kick * 0.025 + (shot === 'zoom' ? 0.06 * Math.sin(Math.PI * smooth(40, V_MARBLE, v)) : 0);
  v4.copy(B).project(camera);
  finish.uniforms.uCenter.value.set(clamp(v4.x * 0.5 + 0.5, 0.05, 0.95), clamp(v4.y * 0.5 + 0.5, 0.05, 0.95));
  finish.uniforms.uFlash.value = 0;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : (1 - s.flash) * 0.9;

  overlay(v, s, v);
  // the gold popup: one phrase saying what is happening (never a number), sized to fit the width
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
  await land.ready;
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  for (const t of [42, 35, 28, 22, 18, 14, 10, 6, 2, 0]) renderFrame(t);
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, things, hole, land, SURF, lens, dot };
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

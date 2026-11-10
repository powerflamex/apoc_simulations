import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeEarth, SUN_DIR, MOON_C } from './earth.js';
import { makeGround, GU } from './ground.js';
import { makeBuildings } from './buildings.js';
import { makeTraffic } from './traffic.js';
import { makeProps } from './props.js';
import { makeCrowd } from './crowd.js';
import { PEOPLE, personPose } from './people.js';
import { makeYou } from './you.js';
import { makeBlasts, V_MAIN0, V_MAIN1 } from './blasts.js';
import { makeClouds } from './clouds.js';
import { makeSmoke } from './smoke.js';
import { makeGlows } from './glows.js';
import { makeOverlay } from './overlay.js';
import { state, VIDEO_DURATION, LOOP, BOUNCES, jumpOf, N_LAST, MOON_D, MOON_R, R_E, V_MOON, altitude, mphOf, V_SOUND } from './timeline.js';
import { DEG, lerp, smooth, wobble, clamp } from './util.js';
import { makeCompositor } from './compose.js';
import { shotAt, groundPos, trackY } from './shots.js';

const W = 1080, H = 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));
const RW = Math.round(W * RES), RH = Math.round(H * RES);
const OFF = (params.get('off') || '').split(',');

const stage = document.getElementById('stage');
// log depth: the scene runs from your shoes to the Moon
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const FOG0 = new THREE.Color(0.2, 0.19, 0.3);
scene.fog = new THREE.FogExp2(FOG0.clone(), 0.0001);
const camera = new THREE.PerspectiveCamera(62, W / H, 0.3, 2e9);
camera.rotation.order = 'YXZ';
scene.add(camera);

// ---------- the world ----------
const sky = makeSky();
scene.add(sky.mesh);
const earth = makeEarth(scene);
const ground = makeGround(scene);
const plainMat = (color, rough = 0.9, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
const shadowy = (m) => { m.frustumCulled = false; return m; };
const ctx = { plainMat, glowMat, shadowy };
const buildings = makeBuildings(scene);
const traffic = makeTraffic(scene, ctx);
const props = makeProps(scene);
const crowd = makeCrowd(scene, PEOPLE.length, plainMat(0xffffff, 0.85), { castShadow: false });
PEOPLE.forEach((p, i) => crowd.color(i, ...p.col));
const you = makeYou(scene);
const glows = makeGlows(scene, 7000);
const smoke = makeSmoke(scene, 3500);
const blasts = makeBlasts(scene, buildings.glassFrom);
const clouds = OFF.includes('clouds') ? null : makeClouds(scene);

// light: no Sun down here (it has set); the sky's blue from above, the street's warm glow from below, the afterglow
const hemi = new THREE.HemisphereLight(0x5a6c9a, 0x3a2a20, 1.1);
scene.add(hemi);
const glowLight = new THREE.DirectionalLight(0xff9a66, 0.5);
glowLight.position.copy(SUN_DIR).setY(0.25).multiplyScalar(1000);
scene.add(glowLight, glowLight.target);

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
// safety: no infinities or NaNs into the bloom (one bad pixel would black out the whole frame)
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv);
    if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 60.0), 1.0); }`,
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.5, 0.45, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.32 }, uTitle: { value: 0 }, uCounter: { value: 0 },
    uBlur: { value: 0 }, uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uAb: { value: 0 }, uFlash: { value: 0 }, uFlashC: { value: new THREE.Color(1, 0.8, 0.6) }, uYou: { value: new THREE.Vector2(0.5, 0.8) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uBlur; uniform vec2 uCenter; uniform float uAb; uniform float uFlash; uniform vec3 uFlashC; uniform vec2 uYou;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 d = vUv - uCenter;
      float r = length(d * vec2(1.0, ${(H / W).toFixed(4)}));
      vec3 col = vec3(0.0);
      float jit = h(vUv * 1920.0 + uTime) - 0.5;
      float bl = uBlur * smoothstep(0.03, 0.5, r) * smoothstep(0.06, 0.2, length((vUv - uYou) * vec2(1.0, ${(H / W).toFixed(4)})));
      vec2 off = (vUv - 0.5) * uAb * 0.01;
      for (int i = 0; i < 10; i++) {
        float k = (float(i) + jit) / 10.0;
        vec2 uv = uCenter + d * (1.0 - bl * k);
        col += vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      }
      col /= 10.0;
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.25);
      col += uFlashC * uFlash;
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
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

// ---------- the camera ----------
// The chase rig: above and south of you, looking north and down past you (you sit in the top fifth of the frame,
// the city or the planet fills the rest). It pulls back with your height and tips over to look down as you climb.
// Fixed street cameras for a few big landings; at the top of the last jumps it swings under you to look at the Moon.
const YOU_NDC = 0.64;    // you at 18% from the top
const lookOffset = (fov) => Math.atan(YOU_NDC * Math.tan(fov * DEG / 2));
// (always along a street: the avenue (0 / 180) or the cross street (90 / -90), so it never ends up inside a tower)
const AZ = { 6: 5, 7: 5, 8: 5, 9: 5, 10: 5, 11: 90, 12: -90, 13: 180, 14: 5, 15: 5, 16: 90, 17: -90, 18: 180, 19: 5, 20: 5, 21: 180, 22: 90, 23: 5, 24: -90, 25: 180, 26: 90, 27: 5, 28: -90, 29: 180, 30: 5, 31: 5 };
const D0_KEYS = [[6, 10], [7, 14], [8, 20], [9, 26], [11, 34], [13, 46], [15, 60], [19, 85], [22, 105], [25, 120]];
const d0At = (x) => { let a = D0_KEYS[0]; for (const k of D0_KEYS) { if (x < k[0]) return lerp(a[1], k[1], smooth(a[0], k[0], x)); a = k; } return a[1]; };
const v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), youP = new THREE.Vector3();
function camAt(v, s) {
  const y = s.y;
  youP.set(0, y + 1.0 - (s.bounce ? s.bounce.depth : 0) * (1 - smooth(0, 3 * (s.bounce ? s.bounce.depth : 0) + 1, y)), 0);
  const shot = shotAt(v);
  let fov = shot.fov || 62, pos = new THREE.Vector3(), yaw, pitch, mode = shot.kind === 'chase' || shot.kind === 'moon' ? 'rig' : 'street';
  if (mode === 'street') {
    // a camera on the ground (or a drone): holds still, drifts a little, a little handheld; it doesn't chase you
    const k = smooth(shot.a, shot.b, v);
    pos.set(...groundPos(shot, v));
    if (shot.track) v3.set(0, trackY(v), 0);
    else if (shot.kind === 'orbit') v3.set(...shot.aim);
    else v3.set(...shot.aim.map((x, i) => lerp(x, shot.aim2[i], k)));
    v3.sub(pos);
    yaw = Math.atan2(-v3.x, -v3.z) + wobble(v * 0.45, 4) * 0.45 * DEG;
    pitch = Math.atan2(v3.y, Math.hypot(v3.x, v3.z)) + wobble(v * 0.55, 3) * 0.45 * DEG;
    return { pos, yaw, pitch, roll: wobble(v * 0.35, 5) * 0.5 * DEG, fov, mode };
  }
  const x = s.n + s.p;
  const D0 = d0At(x);
  // close behind you in the air (you fill a good part of the frame); near the ground it backs off to D0 so the
  // landing and the blast fit in. Its angle: looking down at the street near the ground, level with the horizon
  // higher up (the horizon sits just above you), straight down at the planet from far out.
  const dip = Math.acos(clamp(R_E / (R_E + Math.max(y, 0)), -1, 1));
  const Dn = 7 + 2.5 * smooth(8, 20, s.n);
  // in the crater (and on the way out of it) the camera is in close and low: you crouched in the glow
  const j = s.j, inCrater = clamp((v - j.t0) / Math.max(j.dw, 0.01));
  const Dd = Math.max(9, 1.45 * (s.bounce ? s.bounce.crater : 0) + 6);   // just outside the crater, looking down into it
  const closeK = j.dw > 0 && s.p < 0.5 ? smooth(0, 1, inCrater) : 0;
  const Dbase = lerp(D0, Dd, closeK);
  const D = lerp(Dbase, Dn, smooth(Dbase * 0.5, Dbase * 3.5 + D0 * 0.5, y));
  const ly = Math.log10(Math.max(y, 1));
  const th = lerp(lerp(28, 24, closeK) * DEG, Math.max(dip - 2 * DEG, 4 * DEG), smooth(1.9, 3.4, ly));
  // which side of the crossing the camera watches from: a new side for most landings (the bay, downtown, the sunset
  // behind the towers...), swinging round while you are high up
  const azOf = (n) => (AZ[n] ?? 8) * DEG;
  const azJ = azOf(s.n), azN = azOf(s.n + 1);
  const az = azJ + Math.atan2(Math.sin(azN - azJ), Math.cos(azN - azJ)) * smooth(0.35, 0.65, s.p) + 3 * DEG * Math.sin(v * 0.11) + 16 * DEG * closeK;   // (off the median's palms)
  pos.set(Math.sin(az) * Math.cos(th) * D, y + Math.sin(th) * D, Math.cos(az) * Math.cos(th) * D);
  v3.copy(youP).sub(pos);
  yaw = Math.atan2(-v3.x, -v3.z);
  pitch = Math.atan2(v3.y, Math.hypot(v3.x, v3.z)) - lookOffset(fov);
  // the last jumps: at the top, swing under you and look up past you at the Moon (closer every time); the last one
  // is all Moon. The lens zooms so the Moon fills a good part of the frame and you stay the same size.
  let wM = shot.kind === 'moon' ? 1 : 0;
  if (s.n === N_LAST) wM = smooth(0.0, 0.07, s.p);
  if (wM > 0) {
    const dM = Math.max(MOON_D - y, 1);
    const thM = 2 * Math.atan(MOON_R / (dM + MOON_R)) / DEG;
    const fovM = clamp(thM * 2.4, 9, 62);
    const Dm = 9 * Math.tan(31 * DEG) / Math.tan(fovM * DEG / 2);
    const tH = Math.tan(fovM * DEG / 2), up = Math.atan(0.5 * tH);
    const al = up + Math.atan(0.66 * tH);
    const pm = new THREE.Vector3(-Math.sin(az) * Math.sin(al) * Dm, y + 1 - Math.cos(al) * Dm, -Math.cos(az) * Math.sin(al) * Dm);
    pos.lerp(pm, wM);
    v3.copy(MOON_C).sub(pos);
    const yawM = Math.atan2(-v3.x, -v3.z), pitchM = Math.atan2(v3.y, Math.hypot(v3.x, v3.z));
    yaw = yaw + Math.atan2(Math.sin(yawM - yaw), Math.cos(yawM - yaw)) * wM;
    pitch = lerp(pitch, pitchM - up, wM);
    fov = Math.exp(lerp(Math.log(fov), Math.log(fovM), wM));
  }
  return { pos, yaw, pitch, roll: wobble(v * 0.3, 7) * 0.5 * DEG, fov, mode };
}

const tmpC = new THREE.Color();
let lastMode = '';
function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) s.flash = Math.max(s.flash, cover);
  const cam = camAt(v, s);
  // the bounce: the ground jumps, the view shakes; the shock reaches the camera a moment later
  let shake = 0, punch = 0, flash = 0;
  for (const b of BOUNCES) {
    const age0 = v - b.v;
    if (age0 < -0.1 || age0 > 3) continue;
    const dist = cam.pos.length();
    const delay = Math.min(0.5, dist / 900);
    const age = age0 - delay;
    if (age < 0) continue;
    const c = Math.cbrt(Math.max(b.Y, 1e-4));
    const near = clamp(1.6 - dist / (60 + 40 * c));
    const a = (0.25 + 0.35 * c + 1.2 * b.hot) * Math.exp(-age / 0.28) * clamp(near + 0.25);
    shake = Math.max(shake, a);
    punch = Math.max(punch, smooth(0, 0.04, age) * Math.exp(-age / 0.18) * clamp(0.3 + 0.2 * c));
    flash = Math.max(flash, (0.1 * clamp(c / 3) + 0.6 * b.hot) * Math.exp(-age0 / 0.06));
  }
  shake = Math.min(shake, 2.2);
  const sh = shake * 0.012;
  cam.pos.x += wobble(v * 31, 1) * sh * 8; cam.pos.y += wobble(v * 37, 2) * sh * 8;
  cam.pitch += wobble(v * 43, 3) * sh + -punch * 1.5 * DEG;
  cam.yaw += wobble(v * 47, 4) * sh;
  cam.roll += wobble(v * 29, 5) * sh * 0.8;
  camera.position.copy(cam.pos);
  camera.rotation.set(cam.pitch, cam.yaw, cam.roll);
  camera.fov = cam.fov - 4 * punch;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const camY = camera.position.y;

  // ---------- sky, air ----------
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  u.uAlt.value = Math.max(camY, 0);
  const rC = R_E + Math.max(camY, 0);
  u.uDip.value = Math.sqrt(Math.max(0, 1 - Math.pow(R_E / rC, 2)));
  u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / RH;
  u.uTime.value = v;
  u.uFlash.value = flash * 0.4;
  u.uSmoke.value = smooth(36, 50, v) * 0.7;
  const fogD = 0.00009 / (1 + Math.max(camY, 0) / 300);
  scene.fog.density = fogD;
  scene.fog.color.copy(FOG0).lerp(tmpC.setRGB(0.18, 0.12, 0.1), smooth(30, 50, v) * 0.6).lerp(tmpC.setRGB(0.02, 0.025, 0.05), smooth(600, 6000, camY));
  glows.mat.uniforms.uFogD.value = fogD;
  earth.atmoU.uOn.value = smooth(15e3, 90e3, camY);
  GU.uHaze.value = 1;

  // ---------- the damage so far ----------
  const b = s.bounce;
  {
    let crater = 0.12, crack = 0.8, torn = 0, scorch = 0, outR = 0;
    for (const x of BOUNCES) {
      if (x.v > v) break;
      const k = smooth(0, 0.18, v - x.v);
      crater = lerp(crater, x.crater, k);
      crack = Math.max(crack, lerp(crack, x.crack * 1.6 + 2.5, k));
      torn = Math.max(torn, x.crater * 1.8 * k);
      if (x.hot > 0) scorch = Math.max(scorch, (x.crater * 2.2 + 6 * x.hot) * k);
    }
    // the street lights go out in a widening circle (layout.js OUTAGE)
    const OUT = [[12, 25], [14, 45], [15, 90], [17, 160], [19, 300], [21, 600], [23, 1100], [25, 1600]];
    for (const [n, r] of OUT) { const bb = BOUNCES.find((q) => q.n === n); if (bb && v > bb.v + 0.15) outR = r; }
    GU.uCrater.value = crater; GU.uDepth.value = crater * 0.42; GU.uCrack.value = crack; GU.uTorn.value = torn; GU.uScorch.value = scorch;
    GU.uOutR.value = outR;
    GU.uHot.value = b ? b.hot * Math.exp(-s.sinceB / 1.2) * 1.0 + b.hot * 0.2 : 0;
    GU.uFresh.value = b ? Math.exp(-s.sinceB / 0.25) * (0.3 + 0.5 * clamp(Math.cbrt(b.Y))) : 0;
    GU.uWet.value = v > V_MAIN0 && v < V_MAIN1 + 1 ? 22 * smooth(V_MAIN0, V_MAIN0 + 2.5, v) * (1 - smooth(V_MAIN1, V_MAIN1 + 1, v)) : 0;
  }

  // ---------- light ----------
  const hot = b ? b.hot * Math.exp(-s.sinceB / 1.6) : 0;
  hemi.intensity = 1.1 + 0.2 * flash;
  hemi.groundColor.setRGB(0.23, 0.16, 0.12).lerp(tmpC.setRGB(0.6, 0.25, 0.08), clamp(hot + smooth(30, 55, v) * 0.25));

  // ---------- everything in the city ----------
  smoke.mat.uniforms.uLight.value.setRGB(0.3, 0.29, 0.32).multiplyScalar(1 + 0.8 * flash);
  smoke.mat.uniforms.uTime.value = v;
  glows.begin(camera); smoke.begin();
  buildings.frame(v, smoke, glows);
  traffic.frame(v, s, glows, smoke);
  props.frame(v, s, glows, smoke);
  if (camY < 4000) { PEOPLE.forEach((p, i) => crowd.pose(i, personPose(p, v))); crowd.commit(); }
  you.frame(v, s, glows, smoke, camera);
  blasts.frame(v, s, smoke, glows, camera.position);
  if (clouds) clouds.frame(v, camera.position, SUN_DIR);
  // far traffic: headlights and tail lights streaming along the avenue beyond the stopped queues, and across town
  if (camY < 900) for (let k = 0; k < 90; k++) {
    const lane = k % 6, dir = lane < 3 ? 1 : -1;
    const z0 = ((k * 97.3 + v * 14 * dir) % 1800 + 1800) % 1800;
    const z = dir > 0 ? -160 - z0 : 160 + z0;
    const xl = [-10.3, -6.9, -3.5, 3.5, 6.9, 10.3][lane];
    const head = dir > 0;   // southbound (x < 0) coming toward the camera shows headlights
    glows.add(xl, 0.8, z, 1.2, head ? 1.2 : 0.9, head ? 1.1 : 0.08, head ? 0.9 : 0.05);
  }
  glows.end(); smoke.end();

  // ---------- post ----------
  renderer.toneMappingExposure = 1.25;
  bloom.strength = 0.5 + 0.2 * flash;
  finish.uniforms.uTime.value = v;
  // zoom blur centred on the crater while you blast off and plunge
  {
    const dl = Math.abs(Math.log(1 + altitude(v + 1 / 120) / 12) - Math.log(1 + altitude(v - 1 / 120) / 12)) * 60;
    const blur = cam.mode === 'rig' ? clamp((dl - 2) / 25) * 0.05 * (s.y < 60000 ? 1 : 0.4) : 0;
    finish.uniforms.uBlur.value = blur;
    v3.set(0, 0, 0).project(camera);
    finish.uniforms.uCenter.value.set(clamp(v3.x * 0.5 + 0.5, 0.05, 0.95), clamp(v3.y * 0.5 + 0.5, 0.05, 0.95));
    v3.set(0, s.y + 0.9, 0).project(camera);
    finish.uniforms.uYou.value.set(v3.x * 0.5 + 0.5, v3.y * 0.5 + 0.5);
  }
  finish.uniforms.uAb.value = punch * 0.8 + shake * 0.04;
  finish.uniforms.uFlash.value = Math.min(0.8, flash * (cam.mode === 'street' ? 0.7 : 0.4));
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : (1 - s.flash) * 0.9;

  overlay(v, s, v);
  // "YOU" over your head
  {
    v3.set(0, s.y + 2.2, 0).project(camera);
    const sx = (v3.x * 0.5 + 0.5) * W, sy = (-v3.y * 0.5 + 0.5) * H;
    const vis = v3.z < 1 && sx > 80 && sx < W - 80 && sy > 150 && sy < H - 60;
    const px = 1.8 / (2 * camera.position.distanceTo(v4.set(0, s.y + 1, 0)) * Math.tan(camera.fov * DEG / 2)) * H;
    const a = window.__cover || !vis ? 0 : (1 - s.flash) * (1 - smooth(60, 110, px)) * (s.y > 6 || cam.mode === 'street' ? 1 : 0.0);
    youEl.style.opacity = a.toFixed(3);
    if (a > 0) { youEl.style.left = `${(sx - 120).toFixed(1)}px`; youEl.style.top = `${(sy - 112).toFixed(1)}px`; }
  }
  // the takeoff speed pops up at every bounce
  {
    const bb = s.bounce;
    const dt = bb ? v - bb.v : 99;
    const a = bb && bb.n >= 8 && !window.__cover ? smooth(0, 0.06, dt) * (1 - smooth(1.15, 1.55, dt)) * (1 - s.flash) : 0;
    stampEl.style.opacity = a.toFixed(3);
    stampW.style.opacity = a.toFixed(3);
    if (a > 0) {
      const t = `${Math.round(bb.upMph).toLocaleString('en-US')} mph`;
      if (stampEl.textContent !== t) stampEl.textContent = t;
      const lbl = bb.upMph > 767 && bb.upMph < 1100 ? 'TAKEOFF · FASTER THAN SOUND' : 'TAKEOFF';
      if (stampW.textContent !== lbl) stampW.textContent = lbl;
      stampEl.style.fontSize = `${(138 * (1 + 0.3 * Math.exp(-dt * 9))).toFixed(1)}px`;
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
  await earth.ready;
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  for (const t of [60, 45, 30, 18, 8, 0]) renderFrame(t);
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, earth };
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

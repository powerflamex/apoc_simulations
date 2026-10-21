// Camera, light and post for "What if space ripped apart?" (1920x1080, 30 fps). The video is a pure function of time:
// renderFrame(v). The first FF_LEN seconds replay a moment of the split (the flash-forward); after the white the
// closing shot is the city as it was at the start.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeWorld } from './world.js';
import { makeOverlay } from './overlay.js';
import { makeHand } from './hand.js';
import { state, SEC, VIDEO_DURATION, V_FF, FF_LEN, beatAt } from './timeline.js';
import { SKY } from './layout.js';
import { DEG, smooth, wobble, clamp, lerp } from './util.js';
import { makeCompositor } from './compose.js';
import { SCOPE_GLSL } from './scope.js';

const W = 1920, H = 1080;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));
const RW = Math.round(W * RES), RH = Math.round(H * RES);

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, logarithmicDepthBuffer: false });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(new THREE.Color(0.03, 0.035, 0.06), 0.00022);
const camera = new THREE.PerspectiveCamera(55, W / H, 0.5, 40000);
camera.rotation.order = 'YXZ';
scene.add(camera);
const sky = makeSky();
scene.add(sky.mesh);
const world = makeWorld(scene);
const hand = makeHand(scene, camera);
const overlay = makeOverlay();

const rt = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(RW, RH);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.55, 0.5, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.35 }, uTitle: { value: 0 }, uCounter: { value: 0 },
    uScope: { value: 0 }, uJupR: { value: 1 }, uJupI: { value: 1 }, uNight: { value: 0 }, uPhone: { value: 0 }, uGps: { value: 0 },
    uAb: { value: 0 }, uAspect: { value: W / H },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uScope; uniform float uJupR; uniform float uJupI; uniform float uNight; uniform float uPhone; uniform float uGps;
    uniform float uAb; uniform float uAspect;
    varying vec2 vUv;
    ${SCOPE_GLSL}
    void main() {
      vec2 c = vUv - 0.5;
      vec2 off = c * uAb * 0.01;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.25);
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.8), c * vec2(1.0, 0.8)) * 2.2;
      // dark bands behind the title and the counter so they always read
      col *= 1.0 - uTitle * 0.5 * exp(-pow((vUv.y - 0.63) / 0.16, 2.0));
      col *= 1.0 - uCounter * 0.4 * exp(-pow((vUv.y - 0.17) / 0.11, 2.0)) * smoothstep(0.55, 0.05, vUv.x);
      if (uScope > 0.0) col = mix(col, scopeView(vUv, uAspect, uJupR, uJupI, uTime), uScope);
      if (uPhone > 0.0) col = mix(col, phoneView(tDiffuse, vUv, uAspect, uGps, uTime), uPhone);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- the shots ----------
// Catmull-Rom through [time, value] keys
function spline(list, t) {
  if (t <= list[0][0]) return list[0][1];
  const n = list.length;
  if (t >= list[n - 1][0]) return list[n - 1][1];
  let i = 0;
  while (t > list[i + 1][0]) i++;
  const [t0, p0] = list[i], [t1, p1] = list[i + 1];
  const tm = i > 0 ? list[i - 1] : [t0 - (t1 - t0), p0 - (p1 - p0)];
  const tp = i + 2 < n ? list[i + 2] : [t1 + (t1 - t0), p1 + (p1 - p0)];
  const m0 = (p1 - tm[1]) / (t1 - tm[0]) * (t1 - t0), m1 = (tp[1] - p0) / (tp[0] - t0) * (t1 - t0);
  const u = (t - t0) / (t1 - t0), u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
}
const K = (...pairs) => pairs;
// each shot: [start, end, keys]; keys: x y z yaw pitch fov (degrees), on the video clock
const SHOTS = [
  // the city: on the promenade, drifting forward, then tilting up to the Milky Way and holding on it
  [SEC.city, SEC.stars, {
    x: K([5, 0.4], [76, 0.9]), y: K([5, 1.66]), z: K([5, 3], [30, -2], [76, -4]),
    yaw: K([5, 0], [18, 3], [30, 6], [44, 10], [58, 2], [70, -6], [76, -8]),
    pitch: K([5, 6], [16, 8], [28, 22], [38, 34], [56, 40], [66, 30], [76, 18]), fov: K([5, 55], [30, 58], [56, 62], [76, 56]),
  }],
  // the stars going out: the street and the whole sky, turning toward the planets
  [SEC.stars, SEC.scope0, {
    x: K([76, 0.9], [122, 1.5]), y: K([76, 1.66]), z: K([76, -4], [122, -5]),
    yaw: K([76, -8], [100, -16], [122, -20]), pitch: K([76, 18], [96, 20], [122, 17]), fov: K([76, 56], [122, 54]),
  }],
  // (the telescope view is a 2D insert over this)
  [SEC.scope0, SEC.gone, { x: K([0, 1.5]), y: K([0, 1.66]), z: K([0, -5]), yaw: K([0, -20]), pitch: K([0, 17]), fov: K([0, 54]) }],
  // the empty patch of sky where Jupiter was (a slow tilt up from the street)
  [SEC.gone, SEC.mars, {
    x: K([136, 1.5], [142, 1.6]), y: K([136, 1.66]), z: K([136, -5], [142, -5.8]),
    yaw: K([136, -20], [142, -22]), pitch: K([136, 17], [142, 22]), fov: K([136, 54], [142, 52]),
  }],
  // Mars, to the right
  [SEC.mars, SEC.sun, { x: K([142, 1.0]), y: K([142, 1.66]), z: K([142, -6], [152, -7]), yaw: K([142, 14], [152, 22]), pitch: K([142, 13], [152, 15]), fov: K([142, 54]) }],
  // the mornings: toward the Sun, low in the east
  [SEC.sun, SEC.month, { x: K([152, 0.4], [182, 0.6]), y: K([152, 1.66]), z: K([152, -6], [182, -10]), yaw: K([152, -30], [182, -34]), pitch: K([152, 8], [182, 10]), fov: K([152, 52]) }],
  // snow in summer: down the boulevard, people in coats
  [SEC.month, SEC.moon, { x: K([182, 3.0], [218, 2.6]), y: K([182, 1.7]), z: K([182, -18], [218, -30]), yaw: K([182, -16], [218, -20]), pitch: K([182, 6], [218, 9]), fov: K([182, 54]) }],
  // the Moon: a long lens over the rooftops
  [SEC.moon, SEC.moonHush + 10, {
    x: K([218, 0.4]), y: K([218, 1.66]), z: K([218, 0]),
    // starts wide enough to see the rooftops under it, then closes in as it shrinks so the dot stays on screen
    yaw: K([218, SKY_AZ('moon') - 6], [240, SKY_AZ('moon') - 1.5], [250, SKY_AZ('moon') - 1]),
    pitch: K([218, SKY_EL('moon') - 9], [240, SKY_EL('moon') - 2.2], [250, SKY_EL('moon') - 1.6]), fov: K([218, 32], [240, 11], [250, 9]),
  }],
  // the empty sky; people looking up
  [SEC.moonHush + 10, SEC.sats, { x: K([250, 1.0]), y: K([250, 1.66]), z: K([250, -8], [262, -10]), yaw: K([250, 14], [262, 6]), pitch: K([250, 20], [262, 14]), fov: K([250, 56]) }],
  // the big screen
  [SEC.sats, SEC.gps - 2, { x: K([262, -3.0], [272, -2.6]), y: K([262, 1.66]), z: K([262, -40], [272, -42]), yaw: K([262, 30], [272, 32]), pitch: K([262, 16.5], [272, 17.5]), fov: K([262, 40], [272, 36]) }],
  // (the phone is a 2D insert over this)
  [SEC.gps - 2, SEC.gps + 8, { x: K([0, 0.4]), y: K([0, 1.66]), z: K([0, -4]), yaw: K([0, 0]), pitch: K([0, 2]), fov: K([0, 50]) }],
  // everyone staring at their phones; then the ground starts to shake and crack; then you float up over the split
  [SEC.gps + 8, SEC.you, {
    x: K([282, 0.4], [312, 0.4], [340, 2]), y: K([282, 1.66], [312, 1.66], [318, 4], [326, 16], [340, 48]),
    z: K([282, -4], [300, -4], [312, -4.5], [326, 6], [340, 30]),
    yaw: K([282, 0], [300, -2], [312, 0], [340, 4]), pitch: K([282, 3], [296, 1], [304, -7], [312, -9], [318, -12], [326, -18], [340, -26]), fov: K([282, 52], [312, 56], [340, 60]),
  }],
  // drifting up among the pieces
  [SEC.you, SEC.hand, { x: K([340, 2], [350, 3]), y: K([340, 48], [350, 70]), z: K([340, 30], [350, 42]), yaw: K([340, 4], [350, 12]), pitch: K([340, -26], [350, -20]), fov: K([340, 60]) }],
  // your hand, against the broken Earth
  [SEC.hand, SEC.end + 1, { x: K([350, 3], [392, 4]), y: K([350, 70], [392, 82]), z: K([350, 42], [392, 50]), yaw: K([350, 12], [392, 18]), pitch: K([350, -14], [392, -10]), fov: K([350, 50], [386, 44]) }],
];
function SKY_AZ(k) { const d = SKY[k]; return Math.atan2(d[0], -d[2]) / DEG; }
function SKY_EL(k) { return Math.asin(SKY[k][1]) / DEG; }
function shotAt(v) {
  for (const s of SHOTS) if (v >= s[0] && v < s[1]) return s;
  return v < SEC.city ? SHOTS[0] : SHOTS[SHOTS.length - 1];
}

const tmpV = new THREE.Vector3(), tmpC = new THREE.Color();
// v: the story moment to show; vv: the video clock (title, closing)
function update(v, vv = v) {
  const s = state(v);
  const sh = shotAt(v)[2];
  // derived: the light of the shrinking Sun; the heat of the split
  s.dayK = s.day;
  s.dayLight = Math.pow(1 / (s.au * s.au), 0.55);
  // how dark it is for the city's lights: night, or a day so dim the street lights come on
  s.dark = 1 - s.dayK * smooth(0.06, 0.3, s.dayLight);
  s.sunDir = tmpV.set(...SKY.sun).clone();
  s.heat = clamp(0.25 * s.crack + 0.75 * smooth(SEC.splitHush, SEC.splitHush + 6, v) - 0.3 * smooth(SEC.hand, SEC.rip, v));
  s.phoneShot = v >= SEC.gps - 2 && v < SEC.gps + 8 ? smooth(SEC.gps - 2, SEC.gps - 1.6, v) * (1 - smooth(SEC.gps + 7.6, SEC.gps + 8, v)) : 0;
  // the title, the white and the closing follow the video clock (the flash-forward and the closing shot show
  // other moments of the story)
  const sv = vv === v ? s : state(vv);
  s.title = sv.title; s.name = sv.name; s.flash = sv.flash; s.after = sv.after; s.fadeOut = sv.fadeOut;

  // ---------- camera ----------
  let x = spline(sh.x, v), y = spline(sh.y, v), z = spline(sh.z, v);
  let yaw = spline(sh.yaw, v) * DEG, pitch = spline(sh.pitch, v) * DEG, roll = 0, fov = spline(sh.fov, v);
  // a hand-held drift; the ground shaking before the split
  x += wobble(v * 0.3, 1) * 0.04; y += wobble(v * 0.35, 2) * 0.02;
  yaw += wobble(v * 0.25, 3) * 0.25 * DEG * (fov / 55); pitch += wobble(v * 0.28, 4) * 0.2 * DEG * (fov / 55); roll += wobble(v * 0.2, 5) * 0.3 * DEG;
  const quake = smooth(SEC.split + 2, SEC.crack + 2, v) * (1 - smooth(SEC.splitHush + 2, SEC.float, v));
  x += wobble(v * 13, 6) * 0.05 * quake; y += wobble(v * 15, 7) * 0.04 * quake;
  pitch += wobble(v * 11, 8) * 0.6 * DEG * quake; roll += wobble(v * 9, 9) * 0.8 * DEG * quake;
  const b = beatAt(v);
  let punch = 0;
  if (b && !window.__cover && vv >= FF_LEN) { punch = smooth(0, 0.06, b.dt) * Math.exp(-Math.max(0, b.dt - 0.06) * 4); fov *= 1 - 0.03 * punch; }
  camera.position.set(x, y, z);
  camera.rotation.set(pitch, -yaw, roll);   // (yaw keys: + turns to the right)
  camera.fov = fov;
  camera.near = v >= SEC.hand ? 0.05 : 0.4;
  camera.far = v >= SEC.hand ? 20000 : 40000;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // ---------- sky ----------
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / RH;
  u.uTime.value = v;
  u.uDay.value = s.dayK;
  u.uDayI.value = s.dayLight;
  u.uSunR.value = 0.00465 / s.au;
  u.uSunI.value = 1 / (s.au * s.au);
  u.uRip.value = s.rip; u.uMW.value = s.mw; u.uStars.value = s.stars; u.uRed.value = s.red;
  u.uJupI.value = s.jupiter; u.uSatI.value = s.saturn; u.uMarsI.value = s.mars;
  u.uMoonR.value = 0.00452 / s.moonD;
  u.uMoonI.value = s.moon;
  u.uSats.value = v > SEC.sats - 4 && v < SEC.split ? smooth(SEC.sats - 4, SEC.gps + 6, v) : 0;
  u.uGlow.value = s.grid * (1 - s.air * 0.7);
  u.uAir.value = s.air;
  // fog: blue-black at night, day haze, dust in the split
  const fogN = tmpC.setRGB(0.025, 0.03, 0.055);
  scene.fog.color.copy(fogN).lerp(new THREE.Color(0.55, 0.65, 0.8).multiplyScalar(s.dayLight), s.dayK).lerp(new THREE.Color(0.25, 0.08, 0.03), s.heat * 0.5);
  scene.fog.density = 0.00022 + 0.00012 * s.dayK * (1 - s.dayLight) - 0.00012 * s.air;

  world.frame(v, s, camera);
  hand.frame(v, s, camera);

  renderer.toneMappingExposure = 1.0;
  bloom.strength = 0.5 + 0.1 * s.heat;
  finish.uniforms.uTime.value = v;
  finish.uniforms.uScope.value = s.scope;
  finish.uniforms.uJupR.value = s.jupR;
  finish.uniforms.uJupI.value = s.jupiter;
  finish.uniforms.uPhone.value = s.phoneShot;
  finish.uniforms.uGps.value = s.gps;
  finish.uniforms.uAb.value = punch * 1.2 + quake * 0.6;
  finish.uniforms.uTitle.value = window.__cover ? 1.2 : Math.max(s.title, 0.8 * s.name);
  finish.uniforms.uCounter.value = window.__cover ? 0 : (1 - s.flash) * (1 - s.scope) * (1 - s.phoneShot) * 0.9;
  overlay(v, s, vv);
  return s;
}

let comp = null;
// t is video time
function renderFrame(t) {
  if (t < FF_LEN) update(V_FF + t, t);                        // the flash-forward
  else if (t >= SEC.end + 1) {
    // the closing shot: the city as it was, before all this (the white clears onto it)
    update(SEC.city + 2 + (t - SEC.end - 1), t);
  } else update(t);
  composer.render();
  if (comp) comp.paint();
}

// ---------- boot ----------
async function boot() {
  await document.fonts.load('500 40px Cormorant');
  await document.fonts.load('italic 500 40px Cormorant');
  await document.fonts.load('600 40px Cormorant');
  await document.fonts.load('700 40px Cormorant');
  await document.fonts.ready;
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  for (const t of [2, 20, 60, 125, 165, 200, 230, 265, 275, 300, 330, 360, 400]) renderFrame(t);   // compile everything once
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, world };
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

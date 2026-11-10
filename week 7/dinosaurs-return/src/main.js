import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeGround, GU, NPRINT } from './ground.js';
import { makeCity, CU } from './city.js';
import { makeRexes, PRINTS, PATH1, sRex1, PATH2, sRex2 } from './rex.js';
import { makeTraffic } from './traffic.js';
import { CRUSH_CAR } from './rex.js';
import { makePeople } from './people.js';
import { makeBeasts, quetzAt } from './beasts.js';
import { makeGlows } from './glows.js';
import { makeSmoke } from './smoke.js';
import { makeOverlay } from './overlay.js';
import { CAM0, EYE } from './layout.js';
import { state, VIDEO_DURATION, LOOP, popupAt, captionAt, POP, V_STOMP, V_ROAR, V_QUETZ, V_HERD, V_SEA, V_BRACH, V_BACK, V_TWO, V_SEES, V_SNIFF, V_LUNGE, V_WHITE } from './timeline.js';
import { lerp, smooth, wobble, clamp, keys } from './util.js';

const W = 1080, H = 1920, DEG = Math.PI / 180;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');

const stage = document.getElementById('stage');
// a plain depth buffer (street scale: the nearest thing is a snout half a metre from you, the far shore 1 km off)
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, W / H, 0.25, 6000);
camera.rotation.order = 'YXZ';
scene.add(camera);

// ---------- the world ----------
const plainMat = (color, rough = 0.9, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };
const ctx = { plainMat, glowMat, shadowy };
const sky = makeSky();
scene.add(sky.mesh);
makeGround(scene);
const city = makeCity(scene, ctx);
const rexes = makeRexes(scene);
const traffic = makeTraffic(scene, ctx, rexes);
const people = makePeople(scene);
const beasts = makeBeasts(scene, ctx);
const glows = makeGlows(scene, 3000);
const smoke = makeSmoke(scene, 1600);

// the Sun high behind you (south-east): the street, the crowd and the animals' fronts are lit, nothing goes black
const SUN = new THREE.Vector3(0.3, 0.68, 0.67).normalize();
const sunL = new THREE.DirectionalLight(0xfff3e2, 2.9);
sunL.castShadow = true;
sunL.shadow.mapSize.set(4096, 4096);
sunL.shadow.bias = -0.0004; sunL.shadow.normalBias = 0.04;
Object.assign(sunL.shadow.camera, { left: -60, right: 60, top: 85, bottom: -85, near: 20, far: 900 });
scene.add(sunL, sunL.target);
const hemi = new THREE.HemisphereLight(0x9cc0ff, 0x9a8a78, 1.15);
scene.add(hemi);

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
    if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 16.0), 1.0); }`,
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.2, 0.4, 1.2);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.2 }, uTitle: { value: 0 }, uCounter: { value: 0 },
    uAb: { value: 0 }, uCap: { value: 0 }, uPop: { value: 0 }, uBlur: { value: 0 }, uWhite: { value: 0 }, uWhip: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uAb; uniform float uCap; uniform float uPop; uniform float uBlur; uniform float uWhite; uniform float uWhip;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5;
      vec3 col = vec3(0.0);
      float jit = h(vUv * 1920.0 + uTime) - 0.5;
      vec2 off = d * uAb * 0.01;
      for (int i = 0; i < 6; i++) {
        float k = (float(i) + jit) / 6.0 - 0.5;
        // a footstep's jolt zooms the frame a hair; a whip pan smears it sideways
        vec2 uv = 0.5 + d * (1.0 - uBlur * (k + 0.5)) + vec2(uWhip * k * 0.06, 0.0);
        col += vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      }
      col /= 6.0;
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.12);
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.5 * exp(-pow((vUv.y - 0.29) / 0.1, 2.0));
      col *= 1.0 - uCounter * 0.38 * exp(-pow((vUv.y - 0.79) / 0.06, 2.0)) * smoothstep(0.66, 0.1, vUv.x);
      col *= 1.0 - uCap * 0.45 * exp(-pow((vUv.y - 0.175) / 0.04, 2.0));
      col *= 1.0 - uPop * 0.45 * exp(-pow((vUv.y - 0.175) / 0.05, 2.0));
      col = mix(col, vec3(1.0), uWhite);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- the camera: you stand on the median filming with your phone; only your eyes (and the zoom) move ----------
// 0:00 zoomed in on the T. rex down the street; up at the pterosaur; right with the herd and on to the harbour; back to
// the end of the street (the Brachiosaurus over the roofs); back to the T. rex, zooming out as it comes; round behind you
// at 0:33 (the second one); back round; its head fills the frame.
const PITCH = [[-2, 1], [14.5, 2], [15.0, 6], [17.0, 3], [18.3, 1], [19.6, 1.5], [22.6, 2.2], [25.3, 2.2], [25.9, 5], [27.5, 5], [28.1, 3], [33.0, 4], [33.4, 6], [35.4, 6], [36.2, 4], [50, 6]];
const FOV = [[-2, 20], [5.2, 21], [5.7, 17], [7.4, 17], [8.0, 23], [8.6, 30], [14.5, 34], [15.2, 56], [16.9, 56], [17.3, 46], [18.3, 46], [19.6, 54], [21.6, 54], [22.6, 30], [25.3, 30], [25.9, 34], [27.5, 34], [28.1, 44], [32.6, 52], [33.4, 46], [35.4, 46], [36.2, 56], [41, 62], [44, 66], [50, 66]];
const YAW = [[-2, 1], [14.5, 0], [15.0, 6], [16.6, 6], [17.3, 24], [18.3, 22], [19.6, -6], [20.6, -40], [21.6, -54], [22.6, -64], [25.3, -64], [25.9, -4], [27.5, -4], [28.1, 0], [32.8, 0], [33.35, 140], [35.4, 150], [36.2, 0], [50, 0]];
// while it is on the T. rex the camera follows it (its chest, then its head as it comes close)
const TRACK = [[-2, 1], [14.5, 1], [15.0, 0], [27.5, 0], [28.1, 1], [32.6, 1], [33.0, 0], [35.6, 0], [36.2, 1], [50, 1]];
const AIM_Y = [[-2, 2.2], [26, 2.2], [30, 2.4], [35, 2.6], [37, 2.0], [44, 1.8], [50, 1.8]];
function camAt(v) {
  const pos = new THREE.Vector3(CAM0.x, EYE, CAM0.z);
  let pitch = keys(PITCH, v) * DEG, fov = keys(FOV, v), yaw = keys(YAW, v) * DEG;
  // (the pterosaur: followed as it comes over; the crushed car: the zoom drops to it)
  const tq = keys([[-2, 0], [14.9, 0], [15.25, 1], [16.5, 1], [17.0, 0], [50, 0]], v);
  if (tq > 0) {
    const q = quetzAt(v), tx = q.x - pos.x, tz = q.z - pos.z;
    let ty = Math.atan2(-tx, -tz); while (ty - yaw > Math.PI) ty -= 2 * Math.PI; while (ty - yaw < -Math.PI) ty += 2 * Math.PI;
    yaw = lerp(yaw, ty, tq); pitch = lerp(pitch, Math.min(Math.atan2(q.y - pos.y, Math.hypot(tx, tz)), 60 * DEG) - 6 * DEG, tq);
  }
  // (the second one, when you turn round)
  const t2 = keys([[-2, 0], [32.8, 0], [33.35, 1], [35.4, 1], [35.6, 0], [50, 0]], v);
  if (t2 > 0) {
    const q = PATH2.at(sRex2(v)), tx = q.x + Math.sin(q.yaw) * 2.5 - pos.x, tz = q.z + Math.cos(q.yaw) * 2.5 - pos.z;
    let ty = Math.atan2(-tx, -tz); while (ty - yaw > Math.PI) ty -= 2 * Math.PI; while (ty - yaw < -Math.PI) ty += 2 * Math.PI;
    yaw = lerp(yaw, ty, t2); pitch = lerp(pitch, Math.atan2(2.6 - pos.y, Math.hypot(tx, tz)), t2);
  }
  const tr = keys(TRACK, v);
  if (tr > 0) {
    const q = PATH1.at(sRex1(v));
    const ahead = lerp(2.2, 4.6, smooth(30, 40, v));
    const tx = q.x + Math.sin(q.yaw) * ahead - pos.x, tz = q.z + Math.cos(q.yaw) * ahead - pos.z;
    let ty = Math.atan2(-tx, -tz);
    while (ty - yaw > Math.PI) ty -= 2 * Math.PI;
    while (ty - yaw < -Math.PI) ty += 2 * Math.PI;
    // (at the crush the aim drops to the car under its foot)
    const tc = keys([[-2, 0], [5.2, 0], [5.7, 1], [7.3, 1], [7.9, 0], [50, 0]], v);
    const ax = lerp(tx, CRUSH_CAR.x - pos.x, tc), az = lerp(tz, CRUSH_CAR.z - pos.z, tc);
    let ty2 = Math.atan2(-ax, -az);
    while (ty2 - yaw > Math.PI) ty2 -= 2 * Math.PI;
    while (ty2 - yaw < -Math.PI) ty2 += 2 * Math.PI;
    yaw = lerp(yaw, ty2, tr);
    pitch = lerp(pitch, Math.atan2(lerp(keys(AIM_Y, v), 1.6, tc) - EYE, Math.hypot(ax, az)), tr);
  }
  let roll = wobble(v * 0.3, 7) * 0.5 * DEG;
  pos.x += wobble(v * 0.5, 2) * 0.03; pos.y += wobble(v * 0.7, 5) * 0.02;
  const k = fov / 60;
  yaw += wobble(v * 0.45, 4) * 0.35 * DEG * k; pitch += wobble(v * 0.55, 3) * 0.3 * DEG * k;
  return { pos, yaw, pitch, roll, fov };
}

// how hard the ground shakes under you now (each footstep, louder as it comes closer)
function shakeAt(v) {
  let k = 0;
  for (const p of PRINTS) {
    const dt = v - p.t;
    if (dt < -0.02 || dt > 1.2) continue;
    const d = Math.hypot(p.x - CAM0.x, p.z - CAM0.z);
    k = Math.max(k, smooth(-0.02, 0.03, dt) * Math.exp(-Math.max(dt, 0) / 0.25) * clamp(9 / (d + 4), 0, 1.3));
  }
  return k;
}

const tmpC = new THREE.Color(), tmpS = new THREE.Vector3();
const SKY_HI = new THREE.Color(0.09, 0.28, 0.76), SKY_LO = new THREE.Color(0.6, 0.76, 0.94);
function update(v, cover = -1) {
  const s = state(v);
  const white = Math.max(s.white, cover);
  if (cover >= 0) s.title *= 1 - smooth(0.55, 1, cover);   // (in the loop's lead-in the title fades in as the white clears)
  rexes.frame(v);
  // ---------- the camera ----------
  const cam = camAt(v);
  const kick = shakeAt(v);
  s.kick = kick;
  const sh = (kick * 1.0 + 0.02) * 0.014 * cam.fov / 60;
  cam.pitch += wobble(v * 43, 3) * sh - kick * 0.35 * DEG * cam.fov / 62;
  cam.yaw += wobble(v * 47, 4) * sh;
  cam.roll += wobble(v * 29, 5) * sh * 0.8;
  camera.position.copy(cam.pos);
  camera.rotation.set(cam.pitch, cam.yaw, cam.roll);
  camera.fov = cam.fov * (1 - 0.025 * kick);
  // (debugging: ?dbg=x,y,z,tx,ty,tz,fov looks at a point from anywhere)
  if (params.has('dbg')) { const d = params.get('dbg').split(',').map(Number); camera.position.set(d[0], d[1], d[2]); camera.lookAt(d[3], d[4], d[5]); camera.fov = d[6] || 40; }
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // ---------- the sky and the light ----------
  GU.uTime.value = v; CU.uTime.value = v;
  GU.uSkyHi.value.copy(SKY_HI); CU.uSkyHi.value.copy(SKY_HI);
  GU.uSkyLo.value.copy(SKY_LO); CU.uSkyLo.value.copy(SKY_LO);
  GU.uHaze.value.copy(SKY_LO); CU.uHaze.value.copy(SKY_LO);
  GU.uHazeD.value = 5500; CU.uHazeD.value = 5500;
  GU.uSun.value.copy(SUN); CU.uSun.value.copy(SUN);
  // the footprints made so far (the latest NPRINT)
  {
    let n = 0;
    for (let i = PRINTS.length - 1; i >= 0 && n < NPRINT; i--) {
      const p = PRINTS[i];
      if (p.t > v + 0.001) continue;
      GU.uPrints.value[n++].set(p.x, p.z, p.yaw, p.t);
    }
    for (; n < NPRINT; n++) GU.uPrints.value[n].set(0, 0, 0, -1);
  }
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  sky.mesh.scale.setScalar(4000);
  u.uTime.value = v; u.uSun.value.copy(SUN);
  // the shadows follow what you look at
  const look = tmpS.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw)).multiplyScalar(30).add(camera.position); look.y = 0;
  sunL.position.copy(SUN).multiplyScalar(400).add(look);
  sunL.target.position.copy(look);
  sunL.target.updateMatrixWorld();

  // ---------- things ----------
  glows.begin(camera);
  smoke.begin();
  traffic.frame(v, s, glows, smoke);
  people.frame(v, s);
  beasts.frame(v, s, glows, smoke);
  // dust kicked up where each foot lands
  for (const p of PRINTS) {
    const dt = v - p.t;
    if (dt < 0 || dt > 2.2) continue;
    for (let k = 0; k < 5; k++) {
      const a = k * 1.26 + p.x, rr = 0.6 + 1.6 * Math.sqrt(dt);
      smoke.puff(p.x + Math.cos(a) * rr, 0.2 + 0.35 * dt, p.z + Math.sin(a) * rr, 0.35 + 0.5 * dt, 0.28 * (1 - dt / 2.2) * smooth(0, 0.1, dt), 0.85, 0, (k * 0.21 + p.t) % 1);
    }
  }
  // its breath: puffs of dust blown off the ground and off you when it sniffs, and when it roars at you
  {
    const A = rexes.r1.act;
    const out = rexes.r1.out;
    if (A && (A.sniff > 0.02 || A.lunge > 0.02)) {
      for (const n of out.nose) {
        for (let k = 0; k < 3; k++) {
          const T = 0.7, age = ((v * 1.0 + k * T / 3) % T);
          const a = A.sniff * (0.5 + 0.5 * Math.sin(v * 6.0)) * 0.07 * (1 - age / T);
          smoke.puff(n.x + (CAM0.x - n.x) * age * 0.35, n.y - 0.25 * age, n.z + (CAM0.z - n.z) * age * 0.35, 0.05 + 0.18 * age, a, 0.95, 0, (k * 0.3 + v * 0.1) % 1);
        }
      }
    }
  }
  smoke.end();
  glows.end();
  smoke.mat.uniforms.uTime.value = v;
  smoke.mat.uniforms.uLight.value.setRGB(1.55, 1.5, 1.42);
  smoke.mat.uniforms.uSun.value.copy(SUN);

  // ---------- post ----------
  bloom.strength = 0.2 + 0.2 * kick;
  finish.uniforms.uTime.value = v;
  finish.uniforms.uAb.value = kick * 0.7;
  finish.uniforms.uBlur.value = window.__cover ? 0 : kick * 0.02;
  const whip = Math.abs(keys(YAW, v + 0.02) - keys(YAW, v - 0.02)) / 0.04;
  finish.uniforms.uWhip.value = window.__cover ? 0 : clamp((whip - 60) / 300, 0, 1);
  finish.uniforms.uWhite.value = window.__cover ? 0 : Math.pow(white, 1.2);
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : 1 - white;
  finish.uniforms.uVig.value = 0.2;

  s.hide = smooth(0.5, 0.9, white);
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
  for (const t of [44, 40, 34, 28, 22, 16, 10, 4, 0]) renderFrame(t);
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, sky, state, update, CU, GU, rexes, traffic, people, beasts, comp: () => comp };
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

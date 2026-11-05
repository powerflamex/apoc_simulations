import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeGround, GU } from './ground.js';
import { makeTown, CU } from './town.js';
import { makePeople } from './people.js';
import { makeTraffic } from './traffic.js';
import { makeDebris } from './debris.js';
import { makeGlows } from './glows.js';
import { makeSmoke } from './smoke.js';
import { makeOverlay } from './overlay.js';
import { CAM0, FAR } from './layout.js';
import { state, VIDEO_DURATION, LOOP, popupAt, POP, WALL_R, WALL_H, V_TOWN, V_WALL, V_YOU, T_SWITCH, windInt } from './timeline.js';
import { lerp, smooth, wobble, clamp, rng } from './util.js';

const W = 1080, H = 1920, DEG = Math.PI / 180;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');

const stage = document.getElementById('stage');
// a plain depth buffer: the street scene runs from 0.3 m to the far farms; the wall is in the sky shader
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const FOG0 = new THREE.Color(0.5, 0.5, 0.4);
scene.fog = new THREE.FogExp2(FOG0.clone(), 0.0007);
const camera = new THREE.PerspectiveCamera(58, W / H, 0.3, 30000);
camera.rotation.order = 'YXZ';
scene.add(camera);

// ---------- the world ----------
const plainMat = (color, rough = 0.9, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };
const ctx = { plainMat, glowMat, shadowy };
const sky = makeSky();
scene.add(sky.mesh);
const ground = makeGround(scene);
const town = makeTown(scene, ctx);
const people = makePeople(scene, town.lampObjs);
const traffic = makeTraffic(scene, ctx);
const debris = makeDebris(scene, ctx);
const glows = makeGlows(scene, 6000);
const smoke = makeSmoke(scene, 900);

// light: the low Sun behind you on the left (gold, long shadows across the street), the storm's grey-green sky,
// and the lightning (a flash from the wall's direction)
const SUN = new THREE.Vector3(-0.62, 0.42, 0.66).normalize();
sky.uniforms.uSun.value.copy(SUN);
const hemi = new THREE.HemisphereLight(0x8a9a8a, 0x5a4a3a, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb878, 4.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -110; sun.shadow.camera.right = 110; sun.shadow.camera.top = 110; sun.shadow.camera.bottom = -110;
sun.shadow.camera.near = 10; sun.shadow.camera.far = 900;
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.06;
scene.add(sun, sun.target);
const bolt = new THREE.DirectionalLight(0xc8d4ff, 0);
scene.add(bolt, bolt.target);

const overlay = makeOverlay();
const stampEl = document.getElementById('stamp');
const stampW = document.getElementById('stampw');

// ---------- post ----------
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv);
    if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 16.0), 1.0); }`,
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.4, 0.4, 1.1);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.32 }, uTitle: { value: 0 }, uCounter: { value: 0 },
    uAb: { value: 0 }, uFlash: { value: 0 }, uFlashC: { value: new THREE.Color(0.95, 0.96, 1) }, uBlur: { value: 0 }, uCenter: { value: new THREE.Vector2(0.5, 0.5) },
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
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.12);
      col += uFlashC * uFlash;
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.5 * exp(-pow((vUv.y - 0.36) / 0.1, 2.0));
      col *= 1.0 - uCounter * 0.32 * exp(-pow((vUv.y - 0.5) / 0.07, 2.0)) * smoothstep(0.85, 0.2, vUv.x);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- the debris cloud at the wall's foot, the far end's dust, the dust rolling down the street ----------
const PUFF = (() => { const R = rng(31); return Array.from({ length: 26 }, (_, i) => ({ k: (i / 25 - 0.5) * 2, ph: R() * 10, r: 0.7 + R() * 0.6 })); })();
const FARDUST = (() => { const R = rng(32); return Array.from({ length: 14 }, () => ({ x: (R() - 0.5) * 200, z: -420 - R() * 120, ph: R() * 10, r: 0.8 + R() * 0.8 })); })();
const NEARDUST = (() => { const R = rng(33); return Array.from({ length: 16 }, () => ({ x: (R() - 0.5) * 26, z: -15 - R() * 90, ph: R() * 10, r: 0.6 + R() * 0.8 })); })();

// ---------- the camera ----------
function camAt(v, s) {
  // looking up the street; tipping up as the wall grows, so it never leaves the frame and the street stays in view
  let pitch = (-3.0 + 7.5 * smooth(12, 36, v) + 9 * smooth(36, 45, v)) * DEG;
  let yaw = -1.0 * DEG;                                   // (a touch to the right, toward the middle of the street)
  let fov = lerp(58, 63, smooth(16, 42, v));
  let roll = wobble(v * 0.3, 7) * 0.5 * DEG;
  const pos = new THREE.Vector3(CAM0.x, 1.75, CAM0.z);
  // handheld: sway, and the wind buffets you more and more
  pos.x += wobble(v * 0.5, 2) * 0.03; pos.y += wobble(v * 0.7, 5) * 0.02;
  yaw += wobble(v * 0.45, 4) * 0.4 * DEG; pitch += wobble(v * 0.55, 3) * 0.35 * DEG;
  const buf = s.shake;
  yaw += wobble(v * 3.1, 9) * 0.9 * DEG * buf; pitch += wobble(v * 2.7, 8) * 0.7 * DEG * buf; roll += wobble(v * 2.2, 6) * 0.8 * DEG * buf;
  // leaning back against the pull
  pos.z += 0.25 * smooth(20, 40, v);
  // at the end you lose your footing: lifted, rolling, looking up into it
  const up = s.you;
  if (up > 0) {
    pos.y += 1.2 * up * up;
    pos.z -= 0.8 * up * up;
    pitch += 22 * DEG * smooth(0, 1.6, up);
    roll += 16 * DEG * smooth(0, 1.4, up) * Math.sin(up * 2.2);
  }
  return { pos, yaw, pitch, roll, fov };
}

const tmpC = new THREE.Color();
const pv = new THREE.Vector3();
function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) s.flash = Math.max(s.flash, cover);
  GU.uTime.value = v;
  sky.uniforms.uTime.value = v;

  // ---------- the camera, jolted on every jump ----------
  const cam = camAt(v, s);
  const sh = (s.kick * 0.9 + 0.06 + 0.5 * s.shake + (v > V_YOU ? 1.5 * smooth(V_YOU, V_YOU + 0.6, v) : 0)) * 0.012 * cam.fov / 60;
  cam.pitch += wobble(v * 43, 3) * sh - s.kick * 0.9 * DEG;
  cam.yaw += wobble(v * 47, 4) * sh;
  cam.roll += wobble(v * 29, 5) * sh * 0.8;
  camera.position.copy(cam.pos);
  camera.rotation.set(cam.pitch, cam.yaw, cam.roll);
  camera.fov = cam.fov * (1 - 0.035 * s.kick);
  camera.near = 0.3; camera.far = 30000;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // ---------- the sky ----------
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  sky.mesh.scale.setScalar(8000);
  u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / H;
  u.uD.value = s.d; u.uR.value = WALL_R; u.uH.value = WALL_H; u.uRot.value = s.rot;
  u.uCamY.value = camera.position.y;
  u.uGreen.value = s.green; u.uDark.value = s.dark; u.uDebris.value = s.debris; u.uSunK.value = s.sun;
  u.uFlash.value = Math.min(0.7, 0.2 * s.bolt) + s.flash;
  u.uShift.value = windInt(v) * 0.35;
  for (let k = 0; k < 4; k++) { const b = s.bolts[k]; if (b) u.uBolt.value[k].set(b[0], b[1], b[2], b[3]); else u.uBolt.value[k].set(0, 0, 0, 0); }

  // ---------- lights and fog ----------
  const dayK = 1 - 0.8 * s.dark;
  hemi.intensity = (0.85 + 0.2 * s.green) * dayK + 0.45 * Math.min(1, s.bolt * 0.4) + 0.08;
  tmpC.setRGB(0.55, 0.6, 0.56).lerp(new THREE.Color(0.5, 0.62, 0.34), s.green);
  hemi.color.copy(tmpC);
  hemi.groundColor.setRGB(0.36, 0.3, 0.24);
  sun.intensity = 4.5 * s.sun;
  sun.color.setRGB(1.0, 0.68, 0.38);
  sun.position.copy(camera.position).addScaledVector(SUN, 420).add(new THREE.Vector3(0, 0, -60));
  sun.target.position.set(camera.position.x, 0, camera.position.z - 60);
  sun.target.updateMatrixWorld();
  bolt.intensity = 3.2 * Math.min(s.bolt, 1.6);
  bolt.position.set(camera.position.x + 20 * Math.sin((s.bolts[0] || [0])[0]), 160, camera.position.z - 300);
  bolt.target.position.set(camera.position.x, 0, camera.position.z - 40);
  bolt.target.updateMatrixWorld();
  tmpC.copy(FOG0).lerp(new THREE.Color(0.5, 0.56, 0.28), s.green).lerp(new THREE.Color(0.03, 0.03, 0.03), s.dark);
  scene.fog.color.copy(tmpC);
  scene.fog.density = 0.0006 + 0.0004 * smooth(18, 36, v) + 0.0016 * s.dark;
  renderer.toneMappingExposure = 1.0 + 0.15 * s.green * (1 - s.dark);
  // the shops' lights and the lamps: the power fails as the wall nears (flickering first)
  const flick = v > 29 && v < 35 && Math.sin(v * 23) * Math.sin(v * 7.1) > 0.6 ? 0.3 : 1;
  CU.uPower.value = (1 - 0.95 * smooth(33, 36.5, v)) * flick;
  CU.uSkyK.value = 0.3 + 0.7 * dayK;
  GU.uWallZ.value = -s.d;
  GU.uWet.value = 0.5 * smooth(V_TOWN, V_TOWN + 4, v);
  ground.peel(s.peel, v);

  // ---------- things ----------
  glows.begin(camera);
  town.frame(v, s, glows, camera.position.z);
  people.frame(v, s, glows);
  traffic.frame(v, s, glows);
  debris.frame(v, s, glows);
  glows.end();
  smoke.begin();
  {
    // the debris cloud at the wall's foot (once it is near enough for the puffs to read)
    const d = s.d;
    if (d < 2600 && s.debris > 0) {
      const half = Math.min(d * 1.1, 1800);
      for (const p of PUFF) {
        const x = p.k * half + 40 * Math.sin(v * 0.3 + p.ph);
        const z = -d + 30 + 60 * Math.sin(p.ph * 3) * (d / 1500);
        const r = (18 + d * 0.09) * p.r;
        smoke.puff(x, r * 0.55 + 10 * Math.sin(v * 0.9 + p.ph), z, r, 0.2 * s.debris * smooth(250, 800, d), 0.22, 0, p.ph);
      }
    }
    // the far end of town going: dust rising where it stood
    const fd = smooth(V_TOWN, V_TOWN + 1.5, v) * (1 - smooth(V_TOWN + 9, V_TOWN + 13, v));
    if (fd > 0) for (const p of FARDUST) { const t = (v - V_TOWN) * 0.08; smoke.puff(p.x, 8 + 60 * t * p.r, p.z - 120 * t, 18 * p.r * (1 + 2 * t), 0.3 * fd, 0.45, 0, p.ph); }
    // dust rolling down the street round you at the end
    const nd = smooth(36, 40, v);
    if (nd > 0) for (const p of NEARDUST) { const t = ((v * 0.25 + p.ph) % 1); smoke.puff(p.x, 1.5 + 6 * t, p.z - 40 * t, 5 * p.r * (1 + t), 0.18 * nd * (1 - t), 0.4, 0, p.ph); }
  }
  smoke.end();
  smoke.mat.uniforms.uTime.value = v;
  smoke.mat.uniforms.uLight.value.setRGB(0.75, 0.62, 0.48).multiplyScalar(dayK * 0.9 + 0.5 * Math.min(1, s.bolt * 0.4));
  smoke.mat.uniforms.uSun.value.copy(SUN);

  // ---------- post ----------
  bloom.strength = 0.4 + 0.35 * s.kick + 0.5 * Math.min(1, s.bolt * 0.3);
  finish.uniforms.uTime.value = v;
  finish.uniforms.uAb.value = s.kick * 0.8 + s.shake * 0.25;
  finish.uniforms.uBlur.value = window.__cover ? 0 : s.kick * 0.03;
  // (the zoom blur of each jump comes out of the wall)
  pv.set(0, 300, -s.d).add(camera.position);
  const pc = pv.project(camera);
  finish.uniforms.uCenter.value.set(clamp(pc.x * 0.5 + 0.5, 0.05, 0.95), clamp(pc.y * 0.5 + 0.5, 0.05, 0.95));
  finish.uniforms.uFlash.value = 0;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : (1 - s.flash) * 0.9;

  overlay(v, s, v);
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
  if (!params.has('dom')) {
    const { makeCompositor } = await import('./compose.js');
    comp = await makeCompositor(renderer.domElement, stage);
  }
  for (const t of [44, 40, 34, 28, 22, 16, 10, 4, 0]) renderFrame(t);
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, sky, state };
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

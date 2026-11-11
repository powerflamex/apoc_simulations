import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { GU } from './ground.js';
import { WU } from './water.js';
import { makeShots } from './shots.js';
import { makePeople } from './people.js';
import { makeSmoke } from './smoke.js';
import { makeOverlay } from './overlay.js';
import { state, VIDEO_DURATION, LOOP, popupAt, captionAt, POP } from './timeline.js';
import { lerp, smooth, wobble, clamp } from './util.js';

const W = 1080, H = 1920, DEG = Math.PI / 180;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');

const stage = document.getElementById('stage');
// a plain depth buffer (the nearest thing is a fish at your feet, the farthest a mountain 3 miles off)
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, W / H, 0.4, 40000);
camera.rotation.order = 'YXZ';
scene.add(camera);

// ---------- the world ----------
const sky = makeSky();
scene.add(sky.mesh);
const smoke = makeSmoke(scene, 1400);
const ctx = { scene, smoke };
const shots = makeShots(ctx);
for (const st of shots) { st.group.visible = false; if (!st.group.parent) scene.add(st.group); }
const people = makePeople(scene, Math.max(...shots.map((st) => st.people.length)));

// the Sun high behind your left shoulder: everything ahead of you is lit, nothing goes black
const SUN = new THREE.Vector3(-0.42, 0.8, 0.48).normalize();
const sunL = new THREE.DirectionalLight(0xfff4e4, 3.1);
sunL.castShadow = true;
sunL.shadow.mapSize.set(4096, 4096);
sunL.shadow.bias = -0.0004; sunL.shadow.normalBias = 0.05;
Object.assign(sunL.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 20, far: 900 });
scene.add(sunL, sunL.target);
const hemi = new THREE.HemisphereLight(0xa8ccff, 0xb0a084, 1.25);
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
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.14, 0.4, 1.25);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.18 }, uTitle: { value: 0 }, uCounter: { value: 0 },
    uAb: { value: 0 }, uCap: { value: 0 }, uPop: { value: 0 }, uBlur: { value: 0 }, uWhite: { value: 0 }, uWash: { value: 0 }, uSat: { value: 1.14 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uAb; uniform float uCap; uniform float uPop; uniform float uBlur; uniform float uWhite; uniform float uWash; uniform float uSat;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
    float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n2(p); p = p * 2.1 + 3.7; a *= 0.5; } return s; }
    void main() {
      // the dash: the frame streaks out from a point a little above the middle (where you are heading)
      vec2 ctr = vec2(0.5, 0.52);
      vec2 d = vUv - ctr;
      vec3 col = vec3(0.0);
      float jit = h(vUv * 1920.0 + uTime) - 0.5;
      vec2 off = d * uAb * 0.01;
      for (int i = 0; i < 10; i++) {
        float k = (float(i) + jit) / 10.0;
        vec2 uv = ctr + d * (1.0 - uBlur * k);
        col += vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      }
      col /= 10.0;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = max(mix(vec3(l), col, uSat), 0.0);
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.1);
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.42 * exp(-pow((vUv.y - 0.36) / 0.085, 2.0));
      col *= 1.0 - uCounter * 0.36 * exp(-pow((vUv.y - 0.525) / 0.07, 2.0)) * smoothstep(0.72, 0.1, vUv.x);
      col *= 1.0 - uCap * 0.45 * exp(-pow((vUv.y - 0.165) / 0.045, 2.0));
      col *= 1.0 - uPop * 0.45 * exp(-pow((vUv.y - 0.165) / 0.05, 2.0));
      // white water over the lens, then plain white
      if (uWash > 0.0) {
        float f = fbm(vUv * vec2(3.0, 4.5) + vec2(0.0, uTime * 2.6)) + 0.35 * fbm(vUv * vec2(9.0, 13.0) + vec2(uTime * 1.3, uTime * 4.0));
        float m = smoothstep(0.0, 0.3, uWash * 2.1 - (1.25 - f) + (vUv.y - 0.5) * 0.5);
        col = mix(col, mix(vec3(0.82, 0.93, 0.97), vec3(1.0), smoothstep(0.5, 1.0, f)), m);
      }
      col = mix(col, vec3(1.0), uWhite);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

const tmpS = new THREE.Vector3();
let lastShot = -1;
function update(v, cover = -1) {
  const s = state(v);
  const white = Math.max(s.white, cover);
  if (cover >= 0) s.title *= 1 - smooth(0.55, 1, cover);   // (in the loop's lead-in the title fades in as the white clears)
  const si = Math.min(v < 0 ? 0 : s.shot, shots.length - 1);
  const st = shots[si];
  if (si !== lastShot) { shots.forEach((q, k) => { q.group.visible = k === si; }); lastShot = si; }
  GU.uTime.value = v;
  GU.uLevel.value = st.level(v);
  WU.uFlow.value = st.flow ?? 1;

  // ---------- the camera: you, walking (a dash forward between shots) ----------
  const c = st.cam(v, s);
  const kick = s.kick;
  const fwdX = -Math.sin(c.yaw), fwdZ = -Math.cos(c.yaw);
  const y = c.y ?? (st.h(c.x, c.z) + c.eye);
  camera.position.set(c.x + fwdX * s.push, y + (c.rise || 0) * 0, c.z + fwdZ * s.push);
  const sh = (kick + 0.015) * 0.012;
  camera.rotation.set(c.pitch + wobble(v * 43, 3) * sh + wobble(v * 0.55, 3) * 0.2 * DEG, c.yaw + wobble(v * 47, 4) * sh + wobble(v * 0.45, 4) * 0.25 * DEG, (c.roll || 0) + wobble(v * 29, 5) * sh * 0.8 + wobble(v * 0.3, 7) * 0.4 * DEG);
  camera.fov = c.fov * (1 + 0.07 * s.dash);
  if (params.has('dbg')) { const d = params.get('dbg').split(',').map(Number); camera.position.set(d[0], d[1], d[2]); camera.lookAt(d[3], d[4], d[5]); camera.fov = d[6] || 40; }
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  WU.uPx.value = 2 * Math.tan(camera.fov * DEG / 2) / H;

  // ---------- the sky and the light ----------
  const sun = st.sun || SUN;
  GU.uSun.value.copy(sun);
  sky.mesh.position.copy(camera.position);
  sky.mesh.scale.setScalar(20000);
  sky.uniforms.uTime.value = v; sky.uniforms.uSun.value.copy(sun);
  const look = tmpS.set(fwdX, 0, fwdZ).multiplyScalar(st.shadowAhead ?? 28).add(camera.position); look.y = camera.position.y - 1.6;
  sunL.position.copy(sun).multiplyScalar(400).add(look);
  sunL.target.position.copy(look);
  sunL.target.updateMatrixWorld();
  sunL.intensity = st.sunI ?? 3.1;
  hemi.intensity = st.hemiI ?? 1.25;

  // ---------- things ----------
  smoke.begin();
  people.frame(v, st.people, st.h);
  st.frame(v, s, { smoke, camera });
  smoke.end();
  smoke.mat.uniforms.uTime.value = v;
  smoke.mat.uniforms.uLight.value.setRGB(1.56, 1.66, 1.82);
  smoke.mat.uniforms.uSun.value.copy(sun);

  // ---------- post ----------
  bloom.strength = 0.14;
  finish.uniforms.uTime.value = v;
  finish.uniforms.uAb.value = kick * 0.5 + s.dash * 0.6;
  finish.uniforms.uBlur.value = window.__cover ? 0 : s.dash * 0.34 + kick * 0.012;
  finish.uniforms.uWash.value = window.__cover ? 0 : s.wash;
  finish.uniforms.uWhite.value = window.__cover ? 0 : Math.pow(white, 1.2);
  finish.uniforms.uTitle.value = window.__cover ? 1.1 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : 1 - white;

  s.hide = smooth(0.5, 0.9, white);
  overlay(v, s, v);
  {
    const p = window.__cover ? null : popupAt(v);
    const a = p ? smooth(0, 0.06, p.dt) * (1 - smooth(POP - 0.3, POP, p.dt)) * (1 - s.hide) : 0;
    stampEl.style.opacity = a.toFixed(3);
    finish.uniforms.uPop.value = a;
    { const cp = window.__cover ? null : captionAt(v); finish.uniforms.uCap.value = cp ? cp.alpha * (1 - s.hide) : 0; }
    stampW.style.opacity = '0';
    if (a > 0) {
      if (stampEl.textContent !== p.say) stampEl.textContent = p.say;
      const fit = Math.max(56, Math.min(112, 1500 / p.say.length));
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
  // warm up every shot (compiles its shaders, uploads its meshes)
  for (const t of [44, 38, 32, 27, 23, 19, 15, 9, 6, 0]) renderFrame(t);
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, sky, state, update, GU, WU, shots, people, comp: () => comp };
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

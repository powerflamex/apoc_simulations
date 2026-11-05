import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeGround, GU } from './ground.js';
import { makeCity, CU } from './city.js';
import { makePeople } from './people.js';
import { makeTraffic } from './traffic.js';
import { makeRod } from './rod.js';
import { makeBlast } from './blast.js';
import { makeGlows } from './glows.js';
import { makeSmoke } from './smoke.js';
import { makeOverlay } from './overlay.js';
import { CAM0, HIT } from './layout.js';
import { state, VIDEO_DURATION, LOOP, popupAt, POP, ROD_L, V_HIT, V_WALL, T_SWITCH } from './timeline.js';
import { lerp, smooth, wobble, clamp } from './util.js';

const W = 1080, H = 1920, DEG = Math.PI / 180;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');

const stage = document.getElementById('stage');
// a plain depth buffer: the street runs from 0.3 m to the far towers 3 km off
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
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
const city = makeCity(scene, ctx);
const people = makePeople(scene);
const traffic = makeTraffic(scene, ctx);
const glows = makeGlows(scene, 9000);
glows.cam = camera.position;
const smoke = makeSmoke(scene, 1400);
const rod = makeRod(scene);
const blast = makeBlast(scene, smoke);

// light: the Sun behind you and to the right (south-east, 46° up), the sky's blue from above and the warm bounce
// off the street; later the burning rod's orange light taking over (the shadows swing toward it), then the flash and
// the fireball
const SUN = new THREE.Vector3(0.55, 0.74, 0.40).normalize();
const sunL = new THREE.DirectionalLight(0xfff1dc, 3.2);
sunL.castShadow = true;
sunL.shadow.mapSize.set(2048, 2048);
sunL.shadow.camera.left = -80; sunL.shadow.camera.right = 80; sunL.shadow.camera.top = 80; sunL.shadow.camera.bottom = -80;
sunL.shadow.camera.near = 10; sunL.shadow.camera.far = 700;
sunL.shadow.bias = -0.0005; sunL.shadow.normalBias = 0.04;
scene.add(sunL, sunL.target);
const hemi = new THREE.HemisphereLight(0x9cc2ff, 0x8a7a66, 1.25);
scene.add(hemi);
const rodL = new THREE.PointLight(0xffa040, 0, 0, 2);
scene.add(rodL);
const fireL = new THREE.PointLight(0xff7a20, 0, 0, 2);
scene.add(fireL);

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
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.35, 0.4, 1.1);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.3 }, uTitle: { value: 0 }, uCounter: { value: 0 },
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

// ---------- the rod's path (what is drawn: from high over the far city down to the avenue 500 m ahead; it comes
// nearer at an even rate per step, so it is visibly bigger every 3 s) ----------
const C0 = new THREE.Vector3(CAM0.x, 1.75, CAM0.z);
const P0 = new THREE.Vector3(0, 1036, -1585), P1 = new THREE.Vector3(HIT.x, 0, HIT.z);
const D0 = P0.distanceTo(C0), D1 = P1.distanceTo(C0);
const tmpA = new THREE.Vector3();
function tipAt(p, out) {
  const d = D0 * Math.pow(D1 / D0, p);
  let a = 0, b = 1;
  for (let i = 0; i < 40; i++) { const m = (a + b) / 2; tmpA.lerpVectors(P0, P1, m); if (tmpA.distanceTo(C0) > d) a = m; else b = m; }
  return out.lerpVectors(P0, P1, (a + b) / 2);
}
const tip = new THREE.Vector3(), rodDir = new THREE.Vector3(), fireC = new THREE.Vector3();

// ---------- the camera ----------
function camAt(v, s) {
  const pos = new THREE.Vector3(CAM0.x, 1.75, CAM0.z);
  // aim: the rod in the upper part of the frame, the crowd below; you tilt down with it as it comes
  rodDir.copy(tip).addScaledVector(new THREE.Vector3(0, 1, 0), ROD_L * 0.5).sub(pos);
  const el = Math.asin(rodDir.y / rodDir.length());
  const az = Math.atan2(rodDir.x, -rodDir.z);
  let pitch = el - 16 * DEG;
  // after the hit: the fireball and the wall down the avenue
  pitch = lerp(pitch, 7 * DEG, smooth(V_HIT - 0.4, V_HIT + 1.8, v));
  let yaw = -az * 0.9;
  let fov = lerp(62, 66, smooth(16, 40, v));
  let roll = wobble(v * 0.3, 7) * 0.5 * DEG;
  // creeping forward a little into the crowd, swaying like a handheld phone
  pos.z -= 0.8 * smooth(0, 14, v);
  pos.x += wobble(v * 0.5, 2) * 0.03; pos.y += wobble(v * 0.7, 5) * 0.02;
  yaw += wobble(v * 0.45, 4) * 0.4 * DEG; pitch += wobble(v * 0.55, 3) * 0.35 * DEG;
  // the wall hits: you're thrown
  const th = smooth(V_WALL - 0.1, V_WALL + 0.35, v);
  pitch += 30 * DEG * th; roll += 25 * DEG * th; pos.y += 1.5 * th; pos.z += 2.5 * th;
  return { pos, yaw, pitch, roll, fov };
}

const tmpC = new THREE.Color(), tmpL = new THREE.Vector3(), tmpS = new THREE.Vector3();
function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) s.flash = Math.max(s.flash, cover);
  CU.uTime.value = v; GU.uTime.value = v;
  sky.uniforms.uTime.value = v;
  tipAt(s.p, tip);

  // ---------- the camera, jolted on every jump, shaken by the ground shock and the wall ----------
  const cam = camAt(v, s);
  const quake = s.hit ? (0.9 * smooth(0.25, 0.6, s.age) * Math.exp(-Math.max(0, s.age - 0.6) / 1.6) + 1.6 * smooth(V_WALL - 1.2, V_WALL, v)) : 0;
  const sh = (s.kick * 0.9 + 0.06 + quake) * 0.012 * cam.fov / 60;
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
  u.uSunDir.value.copy(SUN);
  rodDir.copy(tip).add(tmpS.set(0, ROD_L * 0.35, 0)).sub(camera.position).normalize();
  u.uRodDir.value.copy(rodDir);
  u.uFire.value = s.fire * (1 - smooth(V_HIT, V_HIT + 0.3, v));
  u.uDust.value = smooth(0.4, 4.5, s.age);
  u.uFlash.value = s.flashPop * 0.45;
  renderer.toneMappingExposure = 1.0 - 0.22 * smooth(0.5, 3, s.age);

  // ---------- lights ----------
  // the Sun, then the burning rod's light taking over from the north (the shadows swing round), then the fireball
  const toRod = tmpL.copy(tip).add(tmpS.set(0, ROD_L * 0.3, 0)).sub(C0).normalize();
  const wR = s.light * 0.85 * (1 - smooth(V_HIT, V_HIT + 0.5, v));
  fireC.copy(blast.fireball.position);
  const toFire = tmpS.copy(fireC).sub(C0).normalize();
  const wF = smooth(V_HIT + 0.2, V_HIT + 1.5, v);
  const L = new THREE.Vector3().copy(SUN).lerp(toRod, wR).lerp(toFire, wF).normalize();
  sunL.position.copy(C0).addScaledVector(L, 300).add(tmpS.set(0, 0, -20));
  sunL.target.position.set(CAM0.x, 0, CAM0.z - 20);
  sunL.target.updateMatrixWorld();
  sunL.color.setRGB(1, 0.95, 0.86).lerp(tmpC.setRGB(1, 0.58, 0.3), Math.max(wR, wF));
  sunL.intensity = (3.2 + 0.2 * wR - 1.4 * wF) * (1 + 4 * s.flashPop);
  hemi.color.setRGB(0.61, 0.76, 1.0).lerp(tmpC.setRGB(1, 0.6, 0.35), Math.max(s.light * 0.7, wF * 0.9));
  hemi.groundColor.setRGB(0.54, 0.48, 0.4).lerp(tmpC.setRGB(0.6, 0.3, 0.12), Math.max(s.light * 0.6, wF));
  hemi.intensity = 1.25 + 0.25 * s.light + 3 * s.flashPop - 0.55 * smooth(0.5, 3, s.age);
  rodL.position.copy(tip).add(tmpS.set(0, 30, 0));
  rodL.intensity = s.hit ? 0 : 1.4e5 * s.fire * (0.85 + 0.15 * Math.sin(v * 21));
  fireL.position.copy(fireC);
  fireL.intensity = s.hit ? 2.5e5 * (1 - 0.6 * smooth(1, 5, s.age)) : 0;
  fireL.color.setRGB(1, 0.5, 0.18).lerp(tmpC.setRGB(1, 0.92, 0.8), smooth(0.8, 0, s.age));

  // the screens: ads, then the emergency alert; the blast front for the buildings, the street and the screens
  CU.uAlert.value = s.alert;
  CU.uBlastR.value = s.front; GU.uBlastR.value = s.front;
  CU.uFireL.value = s.light; GU.uFireL.value = s.light;
  CU.uSkyK.value = 1 - 0.85 * smooth(0.3, 2.5, s.age);
  CU.uSun.value.copy(L);
  rod.U.uSun.value.copy(SUN);
  rod.U.uSkyLit.value = 1;

  // ---------- things ----------
  glows.begin(camera);
  smoke.begin();
  rod.frame(v, s, tip, glows);
  people.frame(v, s, glows);
  traffic.frame(v, s, glows);
  city.glows(glows, v, s);
  blast.frame(v, s, glows);
  smoke.end();
  glows.end();
  smoke.mat.uniforms.uTime.value = v;
  smoke.mat.uniforms.uLight.value.setRGB(1.0, 0.9, 0.8).lerp(tmpC.setRGB(1.2, 0.5, 0.2), wF * 0.7);
  smoke.mat.uniforms.uSun.value.copy(L);

  // ---------- post ----------
  bloom.strength = 0.35 + 0.3 * s.kick + 0.1 * s.fire + 1.2 * s.flashPop + 0.3 * smooth(V_WALL - 1, V_WALL, v);
  finish.uniforms.uTime.value = v;
  finish.uniforms.uAb.value = s.kick * 0.8 + quake * 0.3;
  finish.uniforms.uBlur.value = window.__cover ? 0 : s.kick * 0.03;
  // (the zoom blur of each jump comes out of the rod)
  tmpS.copy(tip).add(tmpL.set(0, ROD_L * 0.4, 0));
  const pc = tmpS.project(camera);
  finish.uniforms.uCenter.value.set(clamp(pc.x * 0.5 + 0.5, 0.05, 0.95), clamp(pc.y * 0.5 + 0.5, 0.05, 0.95));
  finish.uniforms.uFlash.value = s.flashPop * 0.75;
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
  for (const t of [46, 44, 40, 34, 28, 22, 16, 10, 4, 0]) renderFrame(t);
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, sky, state, tipAt, CU, GU, update, comp: () => comp };
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

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
import { makeBlast } from './blast.js';
import { makeGlows } from './glows.js';
import { makeSmoke } from './smoke.js';
import { makePhone } from './phone.js';
import { makeFlames } from './flames.js';
import { makeEvents } from './events.js';
import { makeOverlay } from './overlay.js';
import { CAM0, HIT, PLAIN } from './layout.js';
import { state, VIDEO_DURATION, LOOP, popupAt, POP, REAL_HIT as V_WALL, V_DROP, V_HELI, V_STREET, V_HEAT as V_HEAT_L } from './timeline.js';
import { lerp, smooth, wobble, clamp, keys } from './util.js';

const W = 1080, H = 1920, DEG = Math.PI / 180;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');

const stage = document.getElementById('stage');
// a plain depth buffer: the street is 0.4 m from you, the far city 13 miles
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, W / H, 0.4, 42000);
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
const smoke = makeSmoke(scene, 2200);
const blast = makeBlast(scene, smoke);
const phone = makePhone(camera, ctx);
const flames = makeFlames(scene);
const events = makeEvents(scene, ctx, smoke, flames);

// light: the blue of the evening from above, the warm light of the street's own shops, stalls and bulbs (until the
// blackout), and the fireball ahead of you, low down: every shadow on the street points at you, shortening as it climbs
const fireL = new THREE.DirectionalLight(0xffffff, 3.2);
fireL.castShadow = true;
fireL.shadow.mapSize.set(2048, 2048);
fireL.shadow.camera.left = -90; fireL.shadow.camera.right = 90; fireL.shadow.camera.top = 90; fireL.shadow.camera.bottom = -90;
fireL.shadow.camera.near = 10; fireL.shadow.camera.far = 900;
fireL.shadow.bias = -0.0006; fireL.shadow.normalBias = 0.05;
scene.add(fireL, fireL.target);
const hemi = new THREE.HemisphereLight(0x7f96d8, 0x4a4038, 1.25);
scene.add(hemi);
// the street's own light, hung over the promenade ahead of you
const shopL = new THREE.PointLight(0xffb878, 0, 0, 1.6);
shopL.position.set(CAM0.x + 1, 7, CAM0.z - 14);
scene.add(shopL);
// the fire on your own street: two lights low on either side, flickering
const burnL = [new THREE.PointLight(0xff7a24, 0, 0, 1.5), new THREE.PointLight(0xff8a30, 0, 0, 1.5), new THREE.PointLight(0xff9a3a, 0, 0, 1.5)];
burnL[0].position.set(-12, 6, -28); burnL[1].position.set(10, 6, -40); burnL[2].position.set(4.5, 3.5, -8);
scene.add(...burnL);

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
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.35, 0.55, 1.1);
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
      col *= 1.0 - uCounter * 0.5 * exp(-pow((vUv.y - 0.525) / 0.075, 2.0)) * smoothstep(0.56, 0.2, vUv.x);
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
// (you're up on a low ledge at the edge of the promenade: over the heads, you can see the road and the city)
const EYE = 2.5;
function camAt(v, s) {
  const pos = new THREE.Vector3(CAM0.x, EYE, CAM0.z);
  // you stand still, swaying like a handheld phone, and your eyes go up with the cloud: then down to what's coming up the hill
  let pitch = keys([[-1, 8], [0, 8], [10, 8.5], [22, 12], [36, 17], [39, 17], [43.2, 12], [46, 11]], v) * DEG;
  let yaw = -1.2 * DEG * smooth(30, 38, v);
  let fov = lerp(62, 65, smooth(20, 40, v));
  let roll = wobble(v * 0.3, 7) * 0.5 * DEG;
  pos.x += wobble(v * 0.5, 2) * 0.03; pos.y += wobble(v * 0.7, 5) * 0.02;
  yaw += wobble(v * 0.45, 4) * 0.4 * DEG; pitch += wobble(v * 0.55, 3) * 0.35 * DEG;
  // you get down too, as everyone does
  pos.y -= 0.5 * smooth(V_DROP + 0.2, V_DROP + 1.3, v);
  // the wall hits: you're thrown
  const th = smooth(V_WALL - 0.01, V_WALL + 0.25, v);
  pitch += 26 * DEG * th; roll += 22 * DEG * th; pos.y += 1.5 * th; pos.z += 2.5 * th;
  return { pos, yaw, pitch, roll, fov };
}

const C0 = new THREE.Vector3(CAM0.x, EYE, CAM0.z);
const tmpC = new THREE.Color(), tmpS = new THREE.Vector3(), L = new THREE.Vector3();
const COOL = new THREE.Color(1, 0.94, 0.82), HOT = new THREE.Color(1, 0.42, 0.14), DUSK_H = new THREE.Color(0.5, 0.62, 1.0), DUSK_G = new THREE.Color(0.3, 0.26, 0.24);
function update(video, cover = -1) {
  const s = state(video);
  const v = s.rv;                          // (the world runs on real seconds; only the title, text and white run on video time)
  if (cover >= 0) s.flash = Math.max(s.flash, cover);
  CU.uTime.value = v; GU.uTime.value = v;
  const c = s.cloud;

  // ---------- the camera, jolted on each beat, shaking as the wall comes ----------
  const cam = camAt(v, s);
  const quake = 1.5 * smooth(V_STREET - 1, V_WALL, v);
  const sh = (s.kick * 0.5 + 0.05 + quake) * 0.012 * cam.fov / 60;
  cam.pitch += wobble(v * 43, 3) * sh - s.kick * 0.35 * DEG;
  cam.yaw += wobble(v * 47, 4) * sh;
  cam.roll += wobble(v * 29, 5) * sh * 0.8;
  camera.position.copy(cam.pos);
  camera.rotation.set(cam.pitch, cam.yaw, cam.roll);
  camera.fov = cam.fov * (1 - 0.02 * s.kick);
  s.camPos = camera.position;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // ---------- the bomb's place in the sky ----------
  // the sky works in km, ground zero at the origin, on the plain
  const ux = (camera.position.x - HIT.x) / 1000, uy = (camera.position.y - PLAIN) / 1000, uz = (camera.position.z - HIT.z) / 1000;
  const brightY = Math.max(c.H, 1) * 1000 + PLAIN;
  L.set(HIT.x, brightY, HIT.z).sub(C0).normalize();
  // how the light on the street falls off as it cools
  const I = s.I;
  const warm = smooth(0.95, 0.5, s.heat);
  const fc = tmpC.copy(COOL).lerp(HOT, warm);

  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  sky.mesh.scale.setScalar(8000);
  u.uTime.value = v; u.uAge.value = s.pt;
  u.uRo.value.set(ux, uy, uz);
  u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / H;
  u.uR.value = c.R; u.uH.value = c.H; u.uFlat.value = c.flat; u.uA.value = c.A; u.uB.value = c.B; u.uStem.value = c.stem;
  u.uHeat.value = s.heat;
  u.uBright.value = 0.6 + 0.7 * I * I;
  u.uGlow.value = 0.05 + 0.3 * I;
  u.uDir.value.copy(L);
  u.uSkyO.value = smooth(0.62, 0.3, I) * 0.5 + 0.2 * s.fill;
  u.uShock.value = Math.max(s.front, 0) / 1000;
  u.uShockK.value = 1 - smooth(8, 26, v);
  u.uFlash.value = 0;
  renderer.toneMappingExposure = 1.0;

  // ---------- lights ----------
  fireL.position.copy(C0).addScaledVector(L, 450).add(tmpS.set(0, 0, -40));
  fireL.target.position.set(CAM0.x, 0, CAM0.z - 40);
  fireL.target.updateMatrixWorld();
  fireL.color.copy(fc);
  fireL.intensity = 0.3 + 2.0 * I;
  hemi.color.copy(DUSK_H).lerp(fc, smooth(0, 0.5, I) * 0.8);
  hemi.groundColor.copy(DUSK_G).lerp(tmpC.copy(fc).multiplyScalar(0.55), 0.8);
  hemi.intensity = 0.8 + 0.6 * I;
  shopL.intensity = 70 * (1 - s.dark);
  {
    const crash = v > V_HELI ? 5 * Math.exp(-(v - V_HELI) / 0.5) : 0;
    burnL[0].intensity = (360 * s.street + 100 * crash) * (0.7 + 0.3 * Math.sin(v * 11) * Math.sin(v * 7.3 + Math.sin(v * 1.3)));
    // (the car that's coming at you is lit by the fires behind you)
    const carL = smooth(V_WALL - 0.42, V_WALL - 0.1, v);
    burnL[0].position.set(-12 + carL * (camera.position.x + 12), 6 - 2 * carL, -28 + carL * (camera.position.z + 0.5 + 28));
    burnL[0].intensity *= 1 - 0.75 * carL;
    burnL[1].intensity = (420 * s.street + 900 * crash) * (0.7 + 0.3 * Math.sin(v * 13 + 1) * Math.sin(v * 5.7 + Math.sin(v * 2.1)));
    burnL[2].intensity = 70 * smooth(V_HEAT_L, V_HEAT_L + 1.5, v) * (0.65 + 0.35 * Math.sin(v * 17 + 2) * Math.sin(v * 7.9));
  }

  // the blackout, the blast front, the fires, for the buildings and the ground
  CU.uBlastR.value = s.front; GU.uBlastR.value = s.front;
  CU.uPowerR.value = s.powerR; GU.uPowerR.value = s.powerR;
  CU.uBurn.value = s.burn; GU.uBurn.value = s.burn;
  CU.uBurnNear.value = s.street;
  CU.uSun.value.copy(L); GU.uFbDir.value.copy(L);
  const K = 0.5 + 1.25 * I;
  CU.uFbC.value.copy(fc).multiplyScalar(K); GU.uFbC.value.copy(fc).multiplyScalar(K);
  CU.uSkyK.value = 1 - 0.7 * s.fill;
  // the air between you and the far city takes the colour of the sky low down
  const hz = GU.uHaze.value;
  hz.setRGB(0.2, 0.19, 0.28).lerp(tmpC.setRGB(0.62, 0.3, 0.12), Math.min(1, I * 1.1)).multiplyScalar(0.4 + 0.25 * I);
  CU.uHaze.value.copy(hz).multiplyScalar(0.55);
  GU.uAmb.value.setRGB(0.1, 0.11, 0.16).lerp(tmpC.copy(fc).multiplyScalar(0.3), Math.min(1, I * 1.2));
  blast.WU.uLight.value.copy(fc); blast.WU.uHaze.value.copy(hz);

  // ---------- things ----------
  glows.begin(camera);
  smoke.begin();
  flames.begin(v);
  people.frame(v, s, glows);
  traffic.frame(v, s, glows);
  city.glows(glows, v, s);
  blast.frame(v, s, glows);
  events.frame(v, s, glows);
  phone.frame(v);
  flames.end();
  smoke.end();
  glows.end();
  smoke.mat.uniforms.uTime.value = v;
  smoke.mat.uniforms.uLight.value.setRGB(0.8, 0.68, 0.58).lerp(fc, 0.35).multiplyScalar(0.6 + 0.5 * I);
  smoke.mat.uniforms.uSun.value.copy(L);

  // ---------- post ----------
  bloom.strength = 0.2 + 0.12 * I + 0.12 * s.kick + 0.3 * smooth(V_WALL - 1, V_WALL, v);
  finish.uniforms.uTime.value = video;
  finish.uniforms.uAb.value = s.kick * 0.6 + quake * 0.4;
  finish.uniforms.uBlur.value = window.__cover ? 0 : s.kick * 0.022;
  // (the zoom blur of each jump comes out of the fireball)
  tmpS.copy(camera.position).addScaledVector(L, 5000);
  const pc = tmpS.project(camera);
  finish.uniforms.uCenter.value.set(clamp(pc.x * 0.5 + 0.5, 0.05, 0.95), clamp(pc.y * 0.5 + 0.5, 0.05, 0.95));
  finish.uniforms.uFlash.value = 0;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : (1 - s.flash) * 0.95;

  overlay(video, s, video);
  {
    const p = window.__cover ? null : popupAt(video);
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
  window.__dbg = { scene, camera, renderer, composer, sky, state, CU, GU, update, comp: () => comp };
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

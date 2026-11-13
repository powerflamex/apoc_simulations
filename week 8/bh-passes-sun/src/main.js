import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeGround, GU, NPRINT } from './ground.js';
import { makeCity, CU } from './city.js';
import { makeTraffic } from './traffic.js';
import { makePeople } from './people.js';
import { makeGlows } from './glows.js';
import { makeOverlay } from './overlay.js';
import { CAM0, EYE } from './layout.js';
import { state, skyAt, VIDEO_DURATION, LOOP, popupAt, captionAt, POP, V_EGG, V_FLICK, V_RING, V_SWING, V_PASS, V_FLARE, V_SKY } from './timeline.js';
import { lerp, smooth, wobble, clamp, keys } from './util.js';

const W = 1080, H = 1920, DEG = Math.PI / 180;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');

const stage = document.getElementById('stage');
// a plain depth buffer (street scale)
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, W / H, 0.25, 6000);
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
makeCity(scene, ctx);
const traffic = makeTraffic(scene, ctx);
const people = makePeople(scene);
const glows = makeGlows(scene, 3000);

// ---------- where the hole is in the sky: a little east of north, 27 degrees up, over the end of the avenue ----------
const AZ = 0.1, EL = 18 * DEG;
const B0 = new THREE.Vector3(Math.cos(EL) * Math.sin(AZ), Math.sin(EL), -Math.cos(EL) * Math.cos(AZ)).normalize();
const E1 = new THREE.Vector3().crossVectors(B0, new THREE.Vector3(0, 1, 0)).normalize();
const E2 = new THREE.Vector3().crossVectors(E1, B0).normalize();
const RANG = 2.8 * DEG;                          // one Sun radius in the sky, as drawn (about 10x real)
const skyDir = (x, y, out) => out.copy(B0).addScaledVector(E1, Math.tan(x * RANG)).addScaledVector(E2, Math.tan(y * RANG)).normalize();

// (main.js)
// the Sun's light (it moves with the Sun) and the light of the ring of fire / the flare (a second shadow)
const sunL = new THREE.DirectionalLight(0xfff3e2, 2.9);
sunL.castShadow = true;
sunL.shadow.mapSize.set(4096, 4096);
sunL.shadow.bias = -0.0004; sunL.shadow.normalBias = 0.04;
Object.assign(sunL.shadow.camera, { left: -45, right: 45, top: 70, bottom: -70, near: 20, far: 900 });
scene.add(sunL, sunL.target);
const bhL = new THREE.DirectionalLight(0xffa060, 0);
bhL.castShadow = true;
bhL.shadow.mapSize.set(2048, 2048);
bhL.shadow.bias = -0.0005; bhL.shadow.normalBias = 0.05;
Object.assign(bhL.shadow.camera, { left: -45, right: 45, top: 70, bottom: -70, near: 20, far: 900 });
scene.add(bhL, bhL.target);
const hemi = new THREE.HemisphereLight(0x9cc0ff, 0x9a8a78, 1.25);
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
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.25, 0.12, 3.5);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.2 }, uTitle: { value: 0 }, uCounter: { value: 0 },
    uAb: { value: 0 }, uCap: { value: 0 }, uPop: { value: 0 }, uWhite: { value: 0 }, uWarm: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uAb; uniform float uCap; uniform float uPop; uniform float uWhite; uniform float uWarm;
    varying vec2 vUv;
    void main() {
      vec2 d = vUv - 0.5;
      vec2 off = d * uAb * 0.01;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.12);
      // the light turning strange: a warm, slightly sickly cast as the Sun is stretched
      col *= mix(vec3(1.0), vec3(1.06, 0.95, 0.82), uWarm);
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.5 * exp(-pow((vUv.y - 0.29) / 0.1, 2.0));
      col *= 1.0 - uCounter * 0.4 * exp(-pow((vUv.y - 0.79) / 0.06, 2.0)) * smoothstep(0.85, 0.1, vUv.x);
      col *= 1.0 - uCap * 0.45 * exp(-pow((vUv.y - 0.175) / 0.04, 2.0));
      col *= 1.0 - uPop * 0.45 * exp(-pow((vUv.y - 0.175) / 0.05, 2.0));
      col = mix(col, vec3(1.0), uWhite);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- the camera: you stand on the median among the crowd, phone up at the sky ----------
// 0:00 wide (the crowd and the bent Sun); 0:05-0:07 a push in on the Sun as it stretches; holds on it with the raised arms
// below; 0:26 the eyes drop to the street (two shadows each, swinging); back up for the pass at 0:31, wider for the spiral;
// wide in the flare.
const PITCH = [[-2, 13], [4.8, 13], [6.8, 14], [25.6, 14], [26.5, 8], [29.4, 8], [30.4, 14], [50, 14]];
const FOV = [[-2, 54], [4.8, 54], [6.8, 42], [16, 40], [21, 44], [25.6, 46], [26.5, 58], [29.4, 58], [30.4, 52], [33, 58], [40, 68], [50, 68]];
const aimV = new THREE.Vector3();
function camAt(v) {
  const pos = new THREE.Vector3(CAM0.x, EYE, CAM0.z);
  // the phone follows the action: a point between the empty spot and the Sun (smoothed: sampled over a second)
  let ax = 0, ay = 0;
  for (let i = -4; i <= 4; i++) { const k = skyAt(v + i * 0.25); ax += k.sx; ay += k.sy; }
  skyDir(0.3 * ax / 9, 0.25 * ay / 9, aimV);
  let pitch = keys(PITCH, v) * DEG, fov = keys(FOV, v), yaw = Math.atan2(-aimV.x, -aimV.z);
  let roll = wobble(v * 0.3, 7) * 0.5 * DEG;
  pos.x += wobble(v * 0.5, 2) * 0.03; pos.y += wobble(v * 0.7, 5) * 0.02;
  const k = fov / 60;
  yaw += wobble(v * 0.45, 4) * 0.35 * DEG * k; pitch += wobble(v * 0.55, 3) * 0.3 * DEG * k;
  return { pos, yaw, pitch, roll, fov };
}

const sunDir = new THREE.Vector3(), tmpS = new THREE.Vector3();
const SKY_HI = new THREE.Color(0.09, 0.28, 0.76), SKY_LO = new THREE.Color(0.6, 0.76, 0.94);
const cHi = new THREE.Color(), cLo = new THREE.Color(), cWarm = new THREE.Color(), WHITE = new THREE.Color(1, 1, 1);
function update(v, cover = -1) {
  const s = state(v);
  const white = Math.max(s.white, cover);
  if (cover >= 0) s.title *= 1 - smooth(0.55, 1, cover);   // (in the loop's lead-in the title fades in as the white clears)
  const k = skyAt(v);
  // ---------- the camera ----------
  const cam = camAt(v);
  const jolt = Math.exp(-Math.max(v - V_PASS, 0) / 0.5) * smooth(V_PASS - 0.05, V_PASS + 0.05, v);
  const sh = (jolt * 0.8 + 0.02) * 0.014 * cam.fov / 60;
  cam.pitch += wobble(v * 43, 3) * sh; cam.yaw += wobble(v * 47, 4) * sh; cam.roll += wobble(v * 29, 5) * sh * 0.8;
  camera.position.copy(cam.pos);
  camera.rotation.set(cam.pitch, cam.yaw, cam.roll);
  camera.fov = cam.fov;
  if (params.has('dbg')) { const d = params.get('dbg').split(',').map(Number); camera.position.set(d[0], d[1], d[2]); camera.lookAt(d[3], d[4], d[5]); camera.fov = d[6] || 40; }
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // ---------- the light ----------
  // the Sun: brighter as the lens lines up, a flicker as it is stretched and torn, dimmer once almost a third is gone
  const flick = k.flick * (0.1 * Math.sin(v * 7.3) + 0.07 * Math.sin(v * 17.1 + 1.3) + 0.05 * Math.sin(v * 31.7));
  const sunI = clamp((0.82 + 0.2 * k.mag) * (1 + flick) * (1 - 0.15 * k.tear), 0.8, 1.5);
  const fl = k.flareVis;                                           // 0 .. 1 (the white)
  const ringI = k.ring * (1 - fl) + 0.35 * k.stream * k.river;
  skyDir(k.sx, k.sy, sunDir);
  const warm = clamp(k.e * 0.6 + k.ring * 0.3, 0, 1) * (1 - fl);
  sunL.intensity = 2.9 * sunI * (1 - 0.6 * fl);
  sunL.color.setRGB(1.0, lerp(0.95, 0.82, warm), lerp(0.88, 0.62, warm));
  bhL.intensity = 1.4 * ringI + 9 * fl * fl;
  bhL.color.setRGB(1.0, lerp(0.58, 0.97, fl), lerp(0.3, 0.92, fl));
  const look = tmpS.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw)).multiplyScalar(26).add(camera.position); look.y = 0;
  sunL.position.copy(sunDir).multiplyScalar(400).add(look); sunL.target.position.copy(look); sunL.target.updateMatrixWorld();
  bhL.position.copy(B0).multiplyScalar(400).add(look); bhL.target.position.copy(look); bhL.target.updateMatrixWorld();
  const skyI = (0.85 + 0.15 * sunI) + 6 * fl * fl * fl;
  hemi.intensity = 1.25 * (0.8 + 0.2 * sunI) + 5 * fl * fl;
  hemi.color.setRGB(lerp(0.61, 1, fl), lerp(0.75, 0.97, fl), lerp(1.0, 0.93, fl));
  renderer.toneMappingExposure = 1 + 1.5 * fl * fl;

  // ---------- the sky ----------
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  sky.mesh.scale.setScalar(4000);
  u.uTime.value = v; u.uB.value.copy(B0); u.uE1.value.copy(E1); u.uE2.value.copy(E2); u.uRang.value = RANG;
  u.uSun.value.set(k.sx, k.sy); u.uE.value = k.e; u.uRs.value = k.rs; u.uThE.value = k.thE;
  u.uSunI.value = 1.4 * sunI; u.uStream.value = k.stream; u.uRiver.value = k.river; u.uRing.value = k.ring;
  u.uTear.value = k.tear; u.uArmOut.value = k.armOut; u.uFlare.value = fl; u.uSkyI.value = skyI; u.uSunDir.value.copy(sunDir);
  u.uFlick.value = flick;
  cHi.copy(SKY_HI).multiplyScalar(skyI).lerp(WHITE, fl * fl);
  cLo.copy(SKY_LO).multiplyScalar(skyI).lerp(WHITE, fl * fl);
  GU.uTime.value = v; CU.uTime.value = v;
  GU.uSkyHi.value.copy(cHi); CU.uSkyHi.value.copy(cHi);
  GU.uSkyLo.value.copy(cLo); CU.uSkyLo.value.copy(cLo);
  GU.uHaze.value.copy(cLo); CU.uHaze.value.copy(cLo);
  GU.uHazeD.value = 5500; CU.uHazeD.value = 5500;
  GU.uSun.value.copy(sunDir); CU.uSun.value.copy(sunDir);
  for (let n = 0; n < NPRINT; n++) GU.uPrints.value[n].set(0, 0, 0, -1);

  // ---------- things ----------
  glows.begin(camera);
  traffic.frame(v, s, glows);
  people.frame(v, s);
  glows.end();

  // ---------- post ----------
  bloom.strength = 0.7 * fl;
  finish.uniforms.uTime.value = v;
  finish.uniforms.uAb.value = jolt * 0.6 + fl * 0.4;
  finish.uniforms.uWarm.value = warm * 0.2;
  finish.uniforms.uWhite.value = window.__cover ? 0 : Math.pow(white, 1.2);
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : 1 - white;
  finish.uniforms.uVig.value = 0.2 * (1 - fl);

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
  window.__dbg = { scene, camera, renderer, composer, sky, state, update, CU, GU, traffic, people, comp: () => comp };
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

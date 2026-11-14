import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky, skyColors } from './sky.js';
import { makeGround } from './ground.js';
import { makeCity, CU, hazed } from './city.js';
import { makeForest } from './forest.js';
import { makeGhosts, ghostMatOf } from './ghosts.js';
import { makeDeer } from './deer.js';
import { makeYou } from './you.js';
import { makeOverlay } from './overlay.js';
import { YOU, YOU_FACE, CZ } from './layout.js';
import { state, VIDEO_DURATION, LOOP, captionAt, BEATS, T_SWITCH } from './timeline.js';
import { lerp, smooth, wobble, clamp, keys } from './util.js';

const W = 1080, H_PX = 1920, DEG = Math.PI / 180;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H_PX, false);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
// a plain depth buffer: a street-scale scene (near plane 0.3 m)
const camera = new THREE.PerspectiveCamera(60, W / H_PX, 0.3, 6000);
camera.rotation.order = 'YXZ';
scene.add(camera);

// ---------- the camera: over your shoulder, at eye level, drifting slowly round you all video ----------
const FX_ = Math.sin(YOU_FACE), FZ_ = Math.cos(YOU_FACE);       // the way you face
const RX = -FZ_, RZ = FX_;                                        // your right
function camAt(v) {
  // (degrees round you: + = toward your right side; metres back; metres to the right; height)
  const orbit = keys([[-2, -6], [0, -6], [14, 2], [30, 10], [46, 16], [50, 16]], v) * DEG;
  const back = keys([[-2, 3.7], [0, 3.7], [20, 3.5], [46, 3.3]], v);
  const right = 1.0;
  const fx = FX_ * Math.cos(orbit) - RX * Math.sin(orbit), fz = FZ_ * Math.cos(orbit) - RZ * Math.sin(orbit);
  const rx = -fz, rz = fx;
  const pos = [YOU.x - fx * back + rx * right, 1.72, YOU.z - fz * back + rz * right];
  // aim past you, a little above the horizon (you stand low in the frame, the city over your shoulder)
  const tx = YOU.x + fx * 30 - rx * 1.5, tz = YOU.z + fz * 30 - rz * 1.5;
  const yaw = Math.atan2(-(tx - pos[0]), -(tz - pos[2]));
  const pitch = keys([[-2, 4], [0, 4], [12, 5.5], [30, 7], [46, 7]], v) * DEG;
  return { pos, yaw, pitch, fov: 62 };
}
const CAM_POS0 = (() => { const c = camAt(0); return new THREE.Vector3(c.pos[0], 0, c.pos[2]); })();

// ---------- the world ----------
const plainMat = (color, rough = 0.9, extra = {}) => hazed(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };
const ctx = { plainMat, glowMat, shadowy, hazedMat: hazed };
const sky = makeSky();
scene.add(sky.mesh);
const ground = makeGround(scene);
const city = makeCity(scene, ctx);
const forest = makeForest(scene, ctx);
const ghosts = makeGhosts(scene, ctx, CAM_POS0);
const deer = makeDeer(scene, ghostMatOf(hazed), CAM_POS0);
// you: an orange hoodie, jeans; greying, stooped, a cane by 32 years
const you = makeYou(scene, { hoodie: 0xe8641e, jeans: 0x2f4d7d, skin: 0xd59b72, hair: 0x2a1a10 });
you.root.position.set(YOU.x, 0, YOU.z);
you.root.rotation.y = YOU_FACE;
const cane = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1, 8).translate(0, -0.5, 0), new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.6 }));
const caneTop = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 6, 12, Math.PI), cane.material);
cane.add(caneTop); caneTop.rotation.z = 0; caneTop.position.set(0.05, 0, 0);
cane.castShadow = true;
scene.add(cane);
const HAIR0 = new THREE.Color(0x2a1a10), HAIR1 = new THREE.Color(0xd8d6d0);

const sunL = new THREE.DirectionalLight(0xfff3e2, 3.0);
sunL.castShadow = true;
sunL.shadow.mapSize.set(4096, 4096);
sunL.shadow.bias = -0.0004; sunL.shadow.normalBias = 0.04;
Object.assign(sunL.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 10, far: 900 });
scene.add(sunL, sunL.target);
const hemi = new THREE.HemisphereLight(0x9cc0ff, 0x9a8a78, 1.2);
scene.add(hemi);

const overlay = makeOverlay();

// ---------- post ----------
const rt = new THREE.WebGLRenderTarget(W, H_PX, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H_PX);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv);
    if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 16.0), 1.0); }`,
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H_PX / 2), 0.25, 0.45, 1.05);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.22 }, uTitle: { value: 0 }, uCounter: { value: 0 }, uCap: { value: 0 }, uWhite: { value: 0 }, uAb: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVig; uniform float uTitle; uniform float uCounter; uniform float uCap; uniform float uWhite; uniform float uAb;
    varying vec2 vUv;
    void main() {
      vec2 off = (vUv - 0.5) * uAb * 0.01;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.12);
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      // (soft darkening behind the title, the counter and the captions, so the text reads)
      col *= 1.0 - uTitle * 0.5 * exp(-pow((vUv.y - 0.77) / 0.09, 2.0));
      col *= 1.0 - uCounter * 0.4 * exp(-pow((vUv.y - 0.5) / 0.07, 2.0)) * smoothstep(0.95, 0.1, vUv.x);
      col *= 1.0 - uCap * 0.45 * exp(-pow((vUv.y - 0.175) / 0.045, 2.0));
      col = mix(col, vec3(1.0), uWhite);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- update ----------
const tmpC = new THREE.Color(), tv = new THREE.Vector3();
const C = (a) => tmpC.setRGB(a[0], a[1], a[2]);
function update(v, cover = -1) {
  const s = state(v);
  const white = Math.max(s.flash, cover);
  if (cover >= 0) s.title *= 1 - smooth(0.55, 1, cover);
  // the decade beats: a kick on each
  s.kick = 0;
  for (const t of BEATS) { const dt = v - t; if (dt > -0.05 && dt < 1.2) s.kick = Math.max(s.kick, smooth(-0.05, 0.04, dt) * Math.exp(-Math.max(dt, 0) / 0.3) * 0.5); }
  if (window.__cover) s.kick = 0;
  const elDeg = s.sun.el / DEG;

  // ---------- camera ----------
  const cam = camAt(v);
  const sh = (s.kick * 0.7 + 0.02) * 0.012;
  camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
  const roll = wobble(v * 0.3, 7) * 0.25 * DEG;
  camera.rotation.set(cam.pitch + wobble(v * 0.55, 3) * 0.2 * DEG + wobble(v * 43, 3) * sh - s.kick * 0.4 * DEG, cam.yaw + wobble(v * 0.45, 4) * 0.25 * DEG + wobble(v * 47, 4) * sh, roll);
  camera.fov = cam.fov * (1 - 0.025 * s.kick);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // ---------- light and sky (1:30 PM; greyer under winter overcast) ----------
  const sc = skyColors(elDeg);
  const snow = s.season.snow;
  const grey = (a) => { const l = a[0] * 0.3 + a[1] * 0.55 + a[2] * 0.15; return a.map((x) => lerp(x, l * 1.05, snow * 0.6)); };
  const zen = grey(sc.zen), hor = grey(sc.hor);
  const SUN = tv.set(s.sun.x, s.sun.y, s.sun.z);
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  u.uSun.value.copy(SUN); u.uZen.value.copy(C(zen)); u.uHor.value.copy(C(hor)); u.uGlow.value.copy(C(sc.glow)); u.uSunCol.value.copy(C(sc.sun));
  u.uSunI.value = 1 - 0.6 * snow; u.uStars.value = 0;
  // clouds race by; once a frame spans hours they blur into a soft, even sky
  u.uT.value = (s.S * 0.05) % 20000;
  u.uCloud.value = (0.85 + 0.15 * snow) / (1 + s.rate / 60 / 2400);
  u.uPx.value = (camera.fov * DEG) / H_PX; u.uCity.value = 0;
  const hi = C(zen).clone(), lo = C(hor).clone();
  CU.uSkyHi.value.copy(hi); CU.uSkyLo.value.copy(lo);
  CU.uHaze.value.copy(lo);
  CU.uHazeD.value = lerp(2600, 1700, snow);
  CU.uSun.value.copy(SUN); CU.uSunCol.value.copy(C(sc.sun));
  CU.uTime.value = v;
  const lc = new THREE.Vector3(camera.position.x - Math.sin(camera.rotation.y) * 45, 0, camera.position.z - Math.cos(camera.rotation.y) * 45);
  sunL.position.copy(SUN).multiplyScalar(500).add(lc);
  sunL.target.position.copy(lc); sunL.target.updateMatrixWorld();
  sunL.intensity = 3.6 * (1 - 0.55 * snow);
  sunL.color.copy(C(sc.sun)).lerp(new THREE.Color(1, 1, 1), 0.4);
  hemi.intensity = 2.0 + 0.6 * snow;
  hemi.color.copy(C(zen)).multiplyScalar(2.2).lerp(new THREE.Color(0.75, 0.8, 0.95), 0.4 + 0.3 * snow);
  hemi.groundColor.setRGB(0.5, 0.45, 0.4).lerp(new THREE.Color(0.85, 0.87, 0.9), snow * 0.7).lerp(new THREE.Color(0.25, 0.32, 0.15), s.soil * 0.7);
  renderer.toneMappingExposure = 1.08;

  city.frame(v, s);
  ground.frame(s);
  forest.frame(v, s);
  ghosts.frame(v, s);
  deer.frame(v, s);

  // ---------- you ----------
  {
    const age = s.age;
    // little movements a time-lapse catches: a look round at each new thing, the weight shifting
    const look = keys([[-2, 0], [3, 0], [4, 0.25], [9, 0.3], [10.5, -0.2], [16, 0.35], [21, -0.3], [28, 0.25], [35, -0.15], [42, 0.1], [50, 0.1]], v);
    const up = keys([[-2, 0.02], [8, 0.02], [10, 0.25], [12, 0.1], [17, 0.3], [20, 0.05], [27, 0.2], [32, 0.05], [50, 0.05]], v);
    you.pose({ lift: [0, 0], lean: 0.17 * age, head: [-up + 0.18 * age, look], curl: 0.4 });
    you.M.hair.color.copy(HAIR0).lerp(HAIR1, age);
    you.root.updateMatrixWorld(true);
    // the cane in your right hand, its tip on the pavement
    cane.visible = s.cane > 0;
    if (cane.visible) {
      const hand = you.palmPoint(new THREE.Vector3(), 0.0);
      const tip = new THREE.Vector3(hand.x + FX_ * 0.12, 0, hand.z + FZ_ * 0.12);
      const d = hand.clone().sub(tip);
      cane.position.copy(hand).add(new THREE.Vector3(0, 0.06, 0));
      cane.scale.set(1, d.length() + 0.06, 1);
      cane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    }
  }

  bloom.strength = 0.22 + 0.2 * s.kick;
  // ---------- post ----------
  finish.uniforms.uAb.value = s.kick * 0.5;
  finish.uniforms.uWhite.value = window.__cover ? 0 : white;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : 1 - smooth(0.6, 1, white);
  { const c = window.__cover ? null : captionAt(v); finish.uniforms.uCap.value = c ? c.alpha * (1 - smooth(0.6, 1, white)) : 0; }
  s.hide = smooth(0.6, 1.0, white);
  overlay(v, s);
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
  for (const t of [44, 38, 30, 24, 19, 14, 8, 5, 0]) renderFrame(t);
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, sky, state, update, CU, comp: () => comp };
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
  const fit = () => { stage.style.transform = `scale(${Math.min(innerWidth / W, innerHeight / H_PX)})`; };
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

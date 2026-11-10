import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeGround, GU } from './ground.js';
import { makeSea } from './sea.js';
import { makeTowers, BU } from './towers.js';
import { makeProps } from './props.js';
import { makePeople } from './people.js';
import { makeBlast } from './blast.js';
import { makeGlows } from './glows.js';
import { makeSmoke } from './smoke.js';
import { makeHand } from './hand.js';
import { makeOverlay } from './overlay.js';
import { CAM0, HIT, rollY } from './layout.js';
import { state, VIDEO_DURATION, LOOP, popupAt, captionAt, POP, HITS, SHOCK, ROLL_A, V_TURN, V_BACK, V_LIFT, V_REACH, T_SWITCH } from './timeline.js';
import { lerp, smooth, wobble, clamp, keys } from './util.js';

const W = 1080, H = 1920, DEG = Math.PI / 180;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');

const stage = document.getElementById('stage');
// a plain depth buffer: the beach runs from 0.5 m to the far side of the bay (the finger has its own pass)
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(new THREE.Color(0.74, 0.84, 0.94), 0.00005);
const camera = new THREE.PerspectiveCamera(62, W / H, 0.4, 60000);
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
const sea = makeSea(scene);
const towers = makeTowers(scene);
const props = makeProps(scene, ctx);
const people = makePeople(scene);
const glows = makeGlows(scene, 3000);
glows.cam = camera.position;
const smoke = makeSmoke(scene, 1500);
const blast = makeBlast(scene, smoke);
const hand = makeHand();

// the Sun behind you, high to the south, so the crowd and the sand are lit and nothing in the bottom half goes black
const SUN = new THREE.Vector3(-0.3, 0.74, 0.6).normalize();
const sunL = new THREE.DirectionalLight(0xfff1dc, 3.4);
sunL.castShadow = true;
sunL.shadow.mapSize.set(4096, 4096);
sunL.shadow.bias = -0.0004; sunL.shadow.normalBias = 0.05;
Object.assign(sunL.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, near: 20, far: 1800 });
scene.add(sunL, sunL.target);
const hemi = new THREE.HemisphereLight(0xa6c8ff, 0xc2a57e, 1.45);
scene.add(hemi);
const fireL = new THREE.PointLight(0xffa860, 0, 0, 2);
scene.add(fireL);

const overlay = makeOverlay();
const stampEl = document.getElementById('stamp');
const stampW = document.getElementById('stampw');

// ---------- post ----------
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const handPass = new RenderPass(hand.scene, hand.camera);
handPass.clear = false; handPass.clearDepth = true;
composer.addPass(handPass);
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv);
    if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 16.0), 1.0); }`,
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.3, 0.4, 1.1);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.22 }, uTitle: { value: 0 }, uCounter: { value: 0 },
    uAb: { value: 0 }, uCap: { value: 0 }, uPop: { value: 0 }, uFlash: { value: 0 }, uFlashC: { value: new THREE.Color(1, 0.97, 0.92) }, uBlur: { value: 0 }, uCenter: { value: new THREE.Vector2(0.5, 0.5) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uAb; uniform float uCap; uniform float uPop; uniform float uFlash; uniform vec3 uFlashC; uniform float uBlur; uniform vec2 uCenter;
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
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.14);
      col += uFlashC * uFlash;
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.52 * exp(-pow((vUv.y - 0.36) / 0.11, 2.0));
      col *= 1.0 - uCounter * 0.34 * exp(-pow((vUv.y - 0.5) / 0.07, 2.0)) * smoothstep(1.1, 0.2, vUv.x);
      col *= 1.0 - uCap * 0.5 * exp(-pow((vUv.y - 0.362) / 0.04, 2.0));
      col *= 1.0 - uPop * 0.5 * exp(-pow((vUv.y - 0.228) / 0.05, 2.0));
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- the camera: you never leave the deck. You look where the grain lands, zoom in like a phone for the tiny hits and
// back out as they grow; you look up at the mushroom, turn round to the city, back to the sea, down at the ground ----------
const toHit = Math.atan2(HIT.x - CAM0.x, -(HIT.z - CAM0.z));          // how far right of north the spot is
const FF = [[-3, 62], [2.4, 62], [2.95, 13], [6.0, 11.5], [6.5, 15], [9.0, 16], [9.6, 26], [12.0, 28], [12.7, 42], [15.0, 44], [15.8, 60], [20.6, 62], [21.3, 78], [23.2, 78], [24, 70], [28.05, 72], [28.8, 76], [32.2, 76], [33, 62], [41, 62], [42, 68], [45, 68], [46, 76]];
// (where the spot sits on the screen, from the top, in pixels)
const AIM = [[-3, 640], [2.4, 640], [2.95, 720], [12, 660], [15.8, 620], [20.6, 640], [21.4, 1370], [23.2, 1400], [28.8, 1320], [32.2, 1320], [33.1, 900], [37, 1000], [39.2, 1250], [41.4, 1250], [42.3, 640], [44.8, 680], [46, 780]];
const YAW = [[-3, 0.2], [15.6, 0.2], [16.4, 2.5], [17.8, 2.5], [18.5, 22], [20.6, 22], [21.3, 0], [32.3, 0], [33.1, 16], [36.8, 14], [37.6, 0], [50, 0]];
function camAt(v, s) {
  const pos = new THREE.Vector3(CAM0.x, CAM0.y + s.deckY, CAM0.z);
  const fov = keys(FF, v);
  // the spot's elevation from here (a hair below the horizon), and the pitch that puts it at that height on the screen
  const elev = Math.atan2(-CAM0.y, Math.hypot(HIT.x - CAM0.x, HIT.z - CAM0.z));
  const aimY = keys(AIM, v);
  const tanV = Math.tan(fov * DEG / 2);
  let pitch = elev + Math.atan((aimY - H / 2) / (H / 2) * tanV);
  let yaw = -toHit - keys(YAW, v) * DEG;
  // the look back at the city: over your left shoulder
  const back = smooth(V_TURN, V_TURN + 0.75, v) * (1 - smooth(V_BACK, V_BACK + 0.75, v));
  const yawCity = 92 * DEG, pitchCity = 15 * DEG;
  yaw = lerp(yaw, yawCity, back); pitch = lerp(pitch, pitchCity, back);
  let roll = wobble(v * 0.3, 7) * 0.4 * DEG;
  const shake = (0.3 + 0.7 * smooth(21, 45, v));
  pos.x += wobble(v * 0.5, 2) * 0.02; pos.y += wobble(v * 0.7, 5) * 0.015;
  yaw += wobble(v * 0.45, 4) * 0.3 * DEG * (fov / 62) * shake; pitch += wobble(v * 0.55, 3) * 0.28 * DEG * (fov / 62) * shake;
  return { pos, yaw, pitch, roll, fov };
}

const tmpC = new THREE.Color(), tmpL = new THREE.Vector3(), tmpS = new THREE.Vector3();
const HITV = new THREE.Vector3(HIT.x, 40, HIT.z);
function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) s.flash = Math.max(s.flash, cover);
  // when the blast slams into the tower (it takes ~0.75 s to reach you from the spot)
  const DT = 200 / SHOCK;
  s.slam = 0;
  for (const h of HITS) { if (h.k < 6) continue; const dt = v - h.t - DT; if (dt > -0.04 && dt < 1.4) s.slam = Math.max(s.slam, smooth(-0.04, 0.03, dt) * Math.exp(-Math.max(dt, 0) / 0.35) * Math.min(1, 0.5 + h.k * 0.06)); }
  s.deckY = rollY(200, v, ROLL_A * s.roll);
  GU.uTime.value = v; GU.uSeaY.value = s.seaY; GU.uRc.value = s.Rc; GU.uRollA.value = ROLL_A * s.roll;
  GU.uScorch.value = smooth(5.9, 6.3, v) * 0.9 + smooth(11.9, 22, v) * 0.1; GU.uFront.value = s.front; GU.uCrack.value = s.crack;
  GU.uHot.value = s.hit ? clamp(s.hit.k / 5) * (0.2 + 0.8 * Math.exp(-s.age / 1.1)) : 0;
  sky.uniforms.uTime.value = v;

  const cam = camAt(v, s);
  const sh = (s.kick * 0.7 + s.slam * 1.5 + 0.02) * 0.012 * cam.fov / 60 * (1 + 2.4 * s.roll);
  cam.pitch += wobble(v * 43, 3) * sh - s.kick * 0.5 * DEG * cam.fov / 62;
  cam.yaw += wobble(v * 47, 4) * sh;
  cam.roll += wobble(v * 29, 5) * sh * 0.8;
  camera.position.copy(cam.pos);
  camera.rotation.set(cam.pitch, cam.yaw, cam.roll);
  camera.fov = cam.fov * (1 - 0.03 * s.kick);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // ---------- the sky ----------
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  sky.mesh.scale.setScalar(20000);
  u.uSunDir.value.copy(SUN);
  u.uHitDir.value.copy(tmpL.copy(HITV).setY(90).sub(camera.position)).normalize();
  u.uPall.value = s.pall;
  u.uWhite.value = s.white;
  u.uGlow.value = 0.16 * s.fireK * (1 - s.white) + (s.hit ? Math.min(1, s.hit.k / 9) * Math.exp(-s.age / 0.5) : 0);
  u.uBand.value = smooth(V_LIFT - 0.5, V_LIFT + 3.5, v);
  u.uFlash.value = s.hit && s.hit.k >= 5 ? Math.exp(-s.age / 0.14) * 0.5 : 0;

  // ---------- lights: the Sun fading into the dust; the fire of the blasts taking over ----------
  // the light swings low, to behind the blast, so everything is rim-lit and throws long shadows at you
  const L = tmpL.copy(HITV).setY(0).sub(tmpS.set(CAM0.x, 0, CAM0.z)).normalize().multiplyScalar(0.9).setY(0.2).normalize().lerp(SUN, 1 - s.burn).normalize();
  const sp = camera.position;
  sunL.position.set(CAM0.x - 40 + L.x * 900, L.y * 900, CAM0.z - 120 + L.z * 900);
  sunL.target.position.set(CAM0.x - 40, 0, CAM0.z - 120);
  sunL.target.updateMatrixWorld();
  sunL.intensity = lerp(3.4, 1.5, s.burn) + 1.5 * s.white;
  sunL.color.setRGB(1, 0.95, 0.86).lerp(tmpC.setRGB(1, 0.5, 0.22), s.burn).lerp(tmpC.setRGB(1, 0.95, 0.85), s.white);
  hemi.intensity = lerp(1.45, 0.5, s.burn);
  hemi.color.setRGB(0.65, 0.78, 1.0).lerp(tmpC.setRGB(1, 0.72, 0.5), s.pall * 0.8).lerp(tmpC.setRGB(1, 0.95, 0.9), s.white);
  hemi.groundColor.setRGB(0.76, 0.65, 0.5).lerp(tmpC.setRGB(0.6, 0.34, 0.18), s.fireK * 0.8);
  scene.fog.density = 0.00005 + 0.00016 * s.burn + 0.00022 * s.white;
  scene.fog.color.setRGB(0.74, 0.84, 0.94).lerp(tmpC.setRGB(0.28, 0.16, 0.09), s.burn).lerp(tmpC.setRGB(1, 0.97, 0.92), s.white);

  // ---------- the sea's mirror ----------
  const su = sea.u;
  su.uTime.value = v; su.uSeaY.value = s.seaY;
  su.uSun.value.copy(SUN);
  su.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / H;
  su.uFirePos.value.copy(HITV);
  su.uFire.value = 0.35 * s.fireK + (s.hit ? Math.min(1, s.hit.k / 7) * Math.exp(-s.age / 0.5) : 0);
  su.uSkyHi.value.setRGB(0.16, 0.4, 0.8).lerp(tmpC.setRGB(0.4, 0.27, 0.2), s.pall).lerp(tmpC.setRGB(1.2, 1.15, 1.05), s.white);
  su.uSkyLo.value.setRGB(0.72, 0.84, 0.95).lerp(tmpC.setRGB(0.5, 0.36, 0.26), s.pall).lerp(tmpC.setRGB(1.2, 1.15, 1.05), s.white);

  // ---------- the city ----------
  BU.uTime.value = v;
  BU.uLit.value = (s.hit ? Math.min(1.2, s.hit.k / 7) * Math.exp(-s.age / 0.7) : 0) + 0.25 * s.fireK;
  // (the blast of hit 8 reaches the condos first; hit 9 takes all the glass)
  BU.uWin.value = smooth(24.9, 25.6, v) * 0.32 + smooth(27.6, 28.6, v) * 0.68;
  BU.uFire.value = smooth(25, 29, v) * 0.5;
  towers.frame((b) => (b.row > 2 ? smooth(38.5 + b.seed * 3, 41.5 + b.seed * 3, v) : smooth(30.4 + b.seed * 3 + b.row, 32.6 + b.seed * 3 + b.row, v) * 0.45 + smooth(36 + b.seed * 3, 38.5 + b.seed * 3, v) * 0.55));

  // ---------- things ----------
  glows.begin(camera);
  smoke.begin();
  blast.frame(v, s, glows, fireL);
  fireL.color.setRGB(1, 0.62, 0.32);
  props.frame(v, s, smoke, glows);
  people.frame(v, s);
  hand.frame(v);
  handPass.enabled = v < 2.9;
  smoke.end();
  glows.end();
  smoke.mat.uniforms.uTime.value = v;
  smoke.mat.uniforms.uLight.value.setRGB(1.3, 1.16, 0.96).lerp(tmpC.setRGB(0.62, 0.38, 0.26), s.burn).lerp(tmpC.setRGB(0.42, 0.34, 0.3), s.white);
  smoke.mat.uniforms.uSun.value.copy(L);
  renderer.toneMappingExposure = 1.0;

  // ---------- post ----------
  bloom.strength = 0.3 + 0.3 * s.kick;
  finish.uniforms.uTime.value = v;
  finish.uniforms.uAb.value = s.kick * 0.7 + s.slam * 0.8;
  finish.uniforms.uBlur.value = window.__cover ? 0 : s.kick * 0.022;
  tmpS.set(HIT.x, 6, HIT.z).project(camera);
  finish.uniforms.uCenter.value.set(clamp(tmpS.x * 0.5 + 0.5, 0.05, 0.95), clamp(tmpS.y * 0.5 + 0.5, 0.05, 0.95));
  // each flash: bigger each time (the last one builds until it's all there is)
  let fl = 0;
  for (const h of HITS) { const dt = v - h.t; if (dt >= 0 && dt < 1.5) fl = Math.max(fl, Math.min(0.85, Math.pow(h.k / 15, 1.3) * 0.9) * Math.exp(-dt / 0.13)); }
  finish.uniforms.uFlash.value = window.__cover ? 0 : fl;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : (1 - s.flash) * lerp(1.75, 0.9, s.burn) * (1 - smooth(44.9, 45.3, v));
  finish.uniforms.uVig.value = 0.22 * (1 - smooth(44.9, 45.6, v));

  overlay(v, s, v);
  {
    const p = window.__cover ? null : popupAt(v);
    const a = p ? smooth(0, 0.06, p.dt) * (1 - smooth(POP - 0.35, POP, p.dt)) * (1 - s.flash) : 0;
    stampEl.style.opacity = a.toFixed(3);
    finish.uniforms.uPop.value = a;
    { const c = window.__cover ? null : captionAt(v); finish.uniforms.uCap.value = c ? c.alpha * (1 - s.flash) : 0; }
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
  window.__dbg = { scene, camera, renderer, composer, sky, state, update, comp: () => comp };
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

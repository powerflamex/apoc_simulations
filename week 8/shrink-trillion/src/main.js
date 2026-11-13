import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeYou } from './you.js';
import { makeWorlds } from './worlds.js';
import { makeOverlay } from './overlay.js';
import { state, VIDEO_DURATION, LOOP, H0 } from './timeline.js';
import { DEG, lerp, smooth, wobble, keys, clamp } from './util.js';
import { makeCompositor } from './compose.js';

const W = 1080, H_ = 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));
const RW = Math.round(W * RES), RH = Math.round(H_ * RES);

const stage = document.getElementById('stage');
// plain depth buffer: every world is drawn in your metres, from your shoes out to a few km at most
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, logarithmicDepthBuffer: false });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(new THREE.Color(0.7, 0.8, 0.9), 0.0);
const camera = new THREE.PerspectiveCamera(60, W / H_, 0.12, 60000);
camera.rotation.order = 'YXZ';
scene.add(camera);
const sky = makeSky();
scene.add(sky.mesh);

// light: the Sun (shadows), the sky's fill, and a soft light from the camera's side so you always read
const sun = new THREE.DirectionalLight(0xfff3e0, 3.0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x7a6a50, 1.2);
scene.add(hemi);
const fill = new THREE.DirectionalLight(0xffffff, 0.4);
scene.add(fill, fill.target);

// you: 1.7 m, the middle of your feet at the origin (the figure is built 1.75 m tall, right sole at its origin)
const YS = H0 / 1.75;
const you = makeYou(scene, {});
you.root.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
const youHead = new THREE.Vector3();

const worlds = makeWorlds(scene, { renderer, camera, you });
const overlay = makeOverlay();

// ---------- post: MSAA -> bloom -> tone map -> dash blur, the "smaller than light" soft dim, white, grade, text bands ----------
const rt = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(RW, RH);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv);
    if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 60.0), 1.0); }`,
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.3, 0.5, 1.4);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.28 }, uTitle: { value: 0 }, uCounter: { value: 1 }, uCap: { value: 0 }, uAb: { value: 0 }, uBlur: { value: 0 },
    uLight: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 }, uFlashC: { value: new THREE.Color(1, 0.98, 0.94) }, uAspect: { value: W / H_ } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVig, uTitle, uCounter, uCap, uAb, uBlur, uLight, uTime, uFlash, uAspect; uniform vec3 uFlashC;
    varying vec2 vUv;
    float h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    void main() {
      vec2 d = vUv - 0.5;
      float jit = h(vUv * 1920.0 + uTime) - 0.5;
      vec2 off = d * uAb * 0.012;
      vec3 col = vec3(0.0);
      // the dash: a zoom blur pushing in (one world to the next)
      for (int i = 0; i < 6; i++) {
        float k = (float(i) + jit) / 6.0;
        vec2 uv = 0.5 + d * (1.0 - uBlur * k);
        col += vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      }
      col /= 6.0;
      // smaller than light: soft (a wide blur), grey and dim, slowly wavering
      if (uLight > 0.0) {
        vec3 b = vec3(0.0); float wsum = 0.0;
        for (int i = 0; i < 12; i++) {
          float a = float(i) * 2.39996 + jit; float r = sqrt((float(i) + 0.5) / 12.0) * 0.018 * uLight;
          vec2 o = vec2(cos(a), sin(a) * uAspect) * r;
          o += 0.004 * uLight * vec2(sin(vUv.y * 30.0 + uTime * 3.0), sin(vUv.x * 24.0 + uTime * 2.3));
          b += texture2D(tDiffuse, vUv + o).rgb; wsum += 1.0;
        }
        b /= wsum;
        float g = dot(b, vec3(0.299, 0.587, 0.114));
        b = mix(b, vec3(g) * vec3(0.8, 0.88, 1.08), 0.5);
        col = mix(col, b * 0.58, uLight);
      }
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.12);
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.45 * exp(-pow((vUv.y - 0.855) / 0.07, 2.0));
      col *= 1.0 - uCounter * 0.3 * exp(-pow((vUv.y - 0.735) / 0.055, 2.0));
      col *= 1.0 - uCap * 0.4 * exp(-pow((vUv.y - 0.15) / 0.045, 2.0));
      col = mix(col, uFlashC, uFlash);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

const tmpV = new THREE.Vector3();
function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) { s.flash = Math.max(s.flash, cover); s.title *= 1 - smooth(0.55, 1, cover); }
  const W_ = worlds.get(s.world.k);
  for (const w of worlds.all) w.group.visible = w === W_;

  // ---------- the world, you, the camera (the world decides the shot) ----------
  const shot = W_.frame(v, s);
  you.root.scale.setScalar(YS);
  you.root.rotation.set(0, shot.yaw ?? Math.PI, 0);
  // (the figure's right sole is its origin: put the middle of your feet at your spot)
  const fx = -0.105 * YS;
  you.root.position.set(Math.cos(you.root.rotation.y) * fx + (shot.youPos ? shot.youPos.x : 0), shot.youPos ? shot.youPos.y : 0,
    -Math.sin(you.root.rotation.y) * fx + (shot.youPos ? shot.youPos.z : 0));
  you.pose(shot.pose || { head: [-0.3, 0] });
  if (shot.after) shot.after(you);
  you.root.updateMatrixWorld(true);
  you.head.getWorldPosition(youHead);

  const cam = shot.cam;
  let { pos, tgt, fov } = cam;
  let yaw = Math.atan2(-(tgt.x - pos.x), -(tgt.z - pos.z));
  let pitch = Math.atan2(tgt.y - pos.y, Math.hypot(tgt.x - pos.x, tgt.z - pos.z));
  let roll = (cam.roll || 0) + wobble(v * 0.27, 9) * 0.25 * DEG;
  // hand-held drift
  yaw += wobble(v * 0.35, 5) * 0.3 * DEG; pitch += wobble(v * 0.3, 7) * 0.25 * DEG;
  if (cam.shake) { pitch += wobble(v * 17, 6) * cam.shake * DEG; yaw += wobble(v * 15, 2) * cam.shake * 0.8 * DEG; roll += wobble(v * 9, 8) * cam.shake * DEG; }
  // the dash: a push forward
  fov *= 1 - 0.22 * s.dash;
  camera.position.copy(pos);
  camera.rotation.set(pitch, yaw, roll);
  camera.fov = fov;
  camera.near = cam.near ?? 0.12;
  camera.far = cam.far ?? 60000;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // ---------- light, sky, fog (the world's look) ----------
  const L = shot.look;
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  sky.mesh.scale.setScalar(camera.far * 0.5);
  u.uT.value = v;
  u.uTop.value.setRGB(...L.top); u.uHor.value.setRGB(...L.hor); u.uLow.value.setRGB(...L.low);
  u.uHorY.value = L.horY ?? 0; u.uHorW.value = L.horW ?? 0.18;
  u.uCloud.value = L.cloud ?? 0; u.uBlot.value = L.blot ?? 0; if (L.blotC) u.uBlotC.value.setRGB(...L.blotC);
  const sd = tmpV.set(...L.sunDir).normalize();
  u.uSun.value.copy(sd); u.uSunI.value = L.sunDisc ?? 0; if (L.sunC) u.uSunC.value.setRGB(...L.sunC);
  sun.color.setRGB(...(L.sunCol || [1, 0.95, 0.88]));
  sun.intensity = L.sunI ?? 3;
  const ext = L.shadowExt ?? 8;
  sun.position.copy(L.shadowAt || new THREE.Vector3(0, 0, 0)).addScaledVector(sd, ext * 2.5);
  sun.target.position.copy(L.shadowAt || new THREE.Vector3(0, 0, 0));
  sun.target.updateMatrixWorld();
  sun.castShadow = L.shadows !== false;
  { const sc = sun.shadow.camera; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 0.1; sc.far = ext * 5; sc.updateProjectionMatrix(); }
  hemi.color.setRGB(...L.hemiSky); hemi.groundColor.setRGB(...L.hemiGnd); hemi.intensity = L.hemiI ?? 1.2;
  fill.intensity = L.fillI ?? 0.35;
  fill.position.copy(camera.position).add(tmpV.set(0, 1.5, 0)); fill.target.position.copy(youHead); fill.target.updateMatrixWorld();
  scene.fog.color.setRGB(...L.fog);
  scene.fog.density = L.fogD ?? 0;
  you.setRim(...(L.rim || [0, 0, 0]));
  renderer.toneMappingExposure = L.exp ?? 1.0;
  bloom.strength = L.bloom ?? 0.25;
  bloom.threshold = L.bloomT ?? 1.4;

  // ---------- post + text ----------
  finish.uniforms.uAb.value = 0.8 * s.dash + (cam.shake || 0) * 0.2;
  finish.uniforms.uBlur.value = 0.24 * s.dash;
  finish.uniforms.uLight.value = s.light;
  finish.uniforms.uFlash.value = Math.max(s.flash, 0.35 * s.dash * s.dash);
  finish.uniforms.uTime.value = v;
  finish.uniforms.uTitle.value = window.__cover ? 0 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : 1 - s.flash;
  // the "YOU" tag over your head (the pull-back that shows the whole atom)
  s.youScreen = null;
  if (s.youTag > 0) {
    const p = youHead.clone().add(tmpV.set(0, 0.25, 0)).project(camera);
    s.youScreen = { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H_ };
  }
  overlay(v, s);
  finish.uniforms.uCap.value = window.__cover ? 1.2 : s.capBand || 0;
  return s;
}

let comp = null;
// t is video time. The last LOOP seconds replay the moments just before the first frame while the white clears,
// so the video loops seamlessly.
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
  await document.fonts.load('700 40px Cormorant');
  await document.fonts.ready;
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  for (const t of [46, 44, 41, 38, 35, 31.5, 29, 25.5, 21.5, 16, 9, 4, 0]) renderFrame(t);   // compile everything once
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, worlds, sky, you, state, comp: () => comp };
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
  const fit = () => { stage.style.transform = `scale(${Math.min(innerWidth / W, innerHeight / H_)})`; };
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

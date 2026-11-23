// "What if you were 1 trillion times more magnetic?" — one street, one shot. You stand on the middle of a packed
// promenade that runs down to a harbour; the camera stands just behind your right shoulder and eases back and up as the
// pile round you grows, always keeping you in frame (the side of the pile facing it is kept clear, fly.js). Everything
// steel comes to you, one kind per step (smalls.js, things.js, traffic.js, city.js, harbor.js); water and people are
// pushed away (people.js, nature.js); at 1 trillion everything near you is stretched along the field into threads of
// light (field.js) and it all goes white. Post: a ripple out from you at each step, bloom, a soft vignette, darkening
// behind the text, the white; the last LOOP seconds replay the moments before frame 0 while the white clears.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky, skyColors } from './sky.js';
import { makeGround, GU } from './ground.js';
import { makeCity, CU, hazed, CHUNKS } from './city.js';
import { makeThings, LANDINGS } from './things.js';
import { makeTraffic, BUSF } from './traffic.js';
import { makeHarbor, DECK } from './harbor.js';
import { makeNature } from './nature.js';
import { makeSmalls, SMALLS } from './smalls.js';
import { makeGlows } from './glows.js';
import { makeSmoke } from './smoke.js';
import { makeCrowd } from './crowd.js';
import { makeOverlay } from './overlay.js';
import { makeYou } from './you.js';
import { PEOPLE, personAt } from './people.js';
import { CARS, SHIPS } from './layout.js';
import { FU, stretchy } from './field.js';
import { flyPose } from './fly.js';
import { state, VIDEO_DURATION, LOOP, captionAt, HITS, V_WHITE, V_TRILLION, stretchAt } from './timeline.js';
import { lerp, smooth, wobble, clamp } from './util.js';

const W = 1080, H_PX = 1920, DEG = Math.PI / 180;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
const DBG = params.get('dbg') || '';
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
const camera = new THREE.PerspectiveCamera(56, W / H_PX, 0.25, 14000);
scene.add(camera);
const plainMat = (color, rough = 0.9, extra = {}) => hazed(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };
const ctx = { plainMat, glowMat, shadowy, hazedM: hazed };
const sky = makeSky();
scene.add(sky.mesh);
makeGround(scene, ctx);
const city = makeCity(scene);
const things = makeThings(scene, ctx);
const traffic = makeTraffic(scene, ctx);
const harbor = makeHarbor(scene, ctx);
const nature = makeNature(scene, ctx);
const glows = makeGlows(scene, 3000);
const smoke = makeSmoke(scene, 5000);
const crowd = makeCrowd(scene, PEOPLE.length, stretchy(plainMat(0xffffff, 0.82), 'crowd'), { castShadow: true });
PEOPLE.forEach((p) => crowd.color(p.i, p.shirt, p.pants, p.skin, p.hair, p.sleeves));
const SUN_EL = 52, SUN_AZ = 16;   // (azimuth from south, toward the east: the Sun behind the camera's left... right shoulder)
const SUNDIR = (() => { const el = SUN_EL * DEG, az = SUN_AZ * DEG; return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)); })();
const sunL = new THREE.DirectionalLight(0xfff3e2, 3.0);
sunL.castShadow = true;
sunL.shadow.mapSize.set(4096, 4096);
sunL.shadow.bias = -0.0004; sunL.shadow.normalBias = 0.05;
Object.assign(sunL.shadow.camera, { left: -70, right: 70, top: 80, bottom: -80, near: 10, far: 1200 });
scene.add(sunL, sunL.target);
const hemi = new THREE.HemisphereLight(0x9cc0ff, 0x9a8a78, 1.3);
scene.add(hemi);

// ---------- you: braced, arms out from your sides ----------
const you = makeYou(scene, { hoodie: 0xc23b2e, jeans: 0x2a2e38, skin: 0xd09a74, hair: 0x2a1a10, glow: false });
you.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
function place(fig, x, y, z, yaw) { fig.root.rotation.y = yaw; fig.root.position.set(x - 0.105 * Math.cos(yaw), y, z + 0.105 * Math.sin(yaw)); }
const kickAt = (v) => { let k = 0; HITS.forEach((t, n) => { const dt = v - t; if (dt > -0.05 && dt < 1.5) k = Math.max(k, smooth(-0.05, 0.04, dt) * Math.exp(-Math.max(dt, 0) / 0.35) * (0.25 + 0.04 * n)); }); return k; };
function poseYou(v) {
  let flinch = 0;
  HITS.forEach((h) => { const dt = v - h; if (dt > -0.1 && dt < 1.0) flinch = Math.max(flinch, smooth(-0.1, 0.06, dt) * Math.exp(-Math.max(dt, 0) / 0.4)); });
  const brace = smooth(3.5, 5, v);
  you.pose({ hipY: 0.86 - 0.03 * brace - 0.02 * flinch, footZ: 0.02, lift: [0, 0], lean: -0.05 * flinch + 0.04 * brace,
    head: [0.04 - 0.08 * flinch + 0.06 * Math.sin(v * 0.6), 0.32 * Math.sin(v * 0.45 + 0.4) + 0.06 * wobble(v * 0.6, 2)],
    armsOut: 0.42 + 0.12 * brace + 0.05 * Math.sin(v * 0.8), armsFwd: 0.12 + 0.1 * brace, curl: 0.35 + 0.5 * brace });
  you.arms.forEach((A, i) => { A.el.rotation.set(-0.35 - 0.25 * brace + 0.05 * Math.sin(v * 1.3 + i), 0, 0); A.wr.rotation.set(0.15, 0, 0); });
  place(you, 0, 0, 0, Math.PI);
  you.root.updateMatrixWorld(true);
}
poseYou(0);
const smalls = makeSmalls(scene, you);

// ---------- the field lines at the end: glowing loops out of the top of you and back in at your feet ----------
const fieldMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.75, 1.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
const FIELD = new THREE.Group();
for (let k = 0; k < 12; k++) for (const L of [3.6, 7]) {
  const a = k * Math.PI / 8 + L, pts = [];
  for (let j = 1; j < 48; j++) { const th = j / 48 * Math.PI; const r = L * Math.sin(th) ** 2; pts.push(new THREE.Vector3(Math.cos(a) * r * Math.sin(th), 1.0 + r * Math.cos(th), Math.sin(a) * r * Math.sin(th))); }
  FIELD.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.012 * L, 5), fieldMat));
}
scene.add(FIELD);

const overlay = makeOverlay();

// ---------- post ----------
const rt = new THREE.WebGLRenderTarget(W, H_PX, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H_PX);
composer.addPass(new RenderPass(scene, camera));
// a ripple out from you at each step (the field jumping): a ring of bent light racing out across the frame
const ripple = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uC: { value: new THREE.Vector2(0.5, 0.5) }, uR: { value: 0 }, uK: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `uniform sampler2D tDiffuse; uniform vec2 uC; uniform float uR; uniform float uK; varying vec2 vUv;
    void main(){
      vec2 d = (vUv - uC) * vec2(${(W / H_PX).toFixed(4)}, 1.0);
      float e = length(d);
      float w = exp(-pow((e - uR) / 0.035, 2.0)) * uK;
      vec2 o = (e > 1e-4 ? d / e : vec2(0.0)) * w * 0.018 / vec2(${(W / H_PX).toFixed(4)}, 1.0);
      vec3 c = texture2D(tDiffuse, vUv - o).rgb;
      c += vec3(0.5, 0.65, 1.0) * w * 0.12;
      if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
      gl_FragColor = vec4(clamp(c, 0.0, 24.0), 1.0);
    }`,
});
composer.addPass(ripple);
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H_PX / 2), 0.25, 0.3, 1.3);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uVig: { value: 0.22 }, uTitle: { value: 0 }, uCounter: { value: 0 }, uCap: { value: 0 }, uWhite: { value: 0 },
    uFloodC: { value: new THREE.Vector2(0.5, 0.5) }, uFlood: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVig; uniform float uTitle; uniform float uCounter; uniform float uCap; uniform float uWhite;
    uniform vec2 uFloodC; uniform float uFlood;
    varying vec2 vUv;
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.12);
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.5 * exp(-pow((vUv.y - 0.79) / 0.09, 2.0));
      col *= 1.0 - uCounter * 0.42 * exp(-pow((vUv.y - 0.6) / 0.085, 2.0)) * smoothstep(1.1, 0.2, vUv.x);
      col *= 1.0 - uCap * 0.45 * exp(-pow((vUv.y - 0.125) / 0.045, 2.0));
      // the light from you swallowing the frame
      vec2 fd = (vUv - uFloodC) * vec2(${(W / H_PX).toFixed(4)}, 1.0);
      float e = length(fd), fa = atan(fd.y, fd.x);
      float rays = 0.5 + 0.5 * sin(fa * 23.0) * sin(fa * 7.0 + 1.3);
      float reach = uFlood * (1.0 + 0.35 * rays);
      vec3 fc = vec3(0.92, 0.95, 1.0);
      col = mix(col, fc, smoothstep(reach * 1.25 + 0.02, reach * 0.7, e) * smoothstep(0.0, 0.03, uFlood));
      col += fc * 0.6 * smoothstep(0.0, 0.08, uFlood) * rays * exp(-e * 3.0);
      col = mix(col, vec3(1.0, 0.99, 0.97), uWhite);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- what lands (sparks and dust where things hit the pile) ----------
const HITLIST = [];
for (const L of LANDINGS) HITLIST.push({ t: L.t, x: L.x, y: L.y, z: L.z, s: L.size, kind: L.kind });
for (const c of CARS) if (c.f) HITLIST.push({ t: c.f.tL, x: c.f.p1.x, y: c.f.p1.y, z: c.f.p1.z, s: 2.5, kind: 'car', dust: true });
HITLIST.push({ t: BUSF.tL, x: BUSF.p1.x, y: BUSF.p1.y, z: BUSF.p1.z, s: 5, kind: 'bus', dust: true });
for (const c of CHUNKS) HITLIST.push({ t: c.f.tL, x: c.f.p1.x, y: c.f.p1.y, z: c.f.p1.z, s: 8, kind: 'chunk', dust: true });
for (const s of SHIPS) HITLIST.push({ t: s.f.tL, x: s.f.p1.x, y: s.f.p1.y, z: s.f.p1.z, s: s.kind < 2 ? 30 : 8, kind: 'ship', dust: true });
for (const d of DECK) if (d.f) HITLIST.push({ t: d.f.tL, x: d.f.p1.x, y: d.f.p1.y, z: d.f.p1.z, s: 18, kind: 'deck', dust: true });
HITLIST.sort((a, b) => a.t - b.t);

// ---------- the camera: keys relative to you, [t, x, y, z, target x, y, z, fov] ----------
const CAMK = [
  [-2, 0.55, 1.66, 2.9, -0.25, 1.0, -6, 56], [0, 0.55, 1.66, 2.9, -0.25, 1.0, -6, 56], [4, 0.75, 1.8, 3.2, -0.15, 0.95, -6, 56], [8, 1.7, 2.6, 4.8, 0.2, 0.8, -7, 57],
  [10.4, 2.3, 4.0, 6.4, -4.4, 0.0, -12, 58], [14.6, 2.6, 4.4, 7.0, -3.6, 0.4, -13, 59], [17.4, 1.6, 4.8, 8.6, -0.6, 0.9, -12, 60], [22.5, 3.1, 6.2, 10.0, 0.3, 1.6, -12, 61], [25.6, 1.4, 2.7, 5.7, -1.5, 0.8, -60, 66], [30, 1.35, 2.6, 5.6, -1.5, 1.6, -60, 66],
  [34.5, 1.35, 2.6, 5.6, -1.5, 1.2, -60, 66], [38, 1.9, 2.4, 5.4, -0.1, 1.6, -5, 60], [44.6, 1.4, 2.1, 3.8, 0, 1.25, -4, 56], [48, 1.4, 2.1, 3.8, 0, 1.25, -4, 56]];
const camSpl = [1, 2, 3, 4, 5, 6, 7].map((j) => {
  const x = CAMK.map((k) => k[0]), y = CAMK.map((k) => k[j]), n = x.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  m[0] = 0; m[n - 1] = 0;
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]);
  return (t) => {
    if (t <= x[0]) return y[0]; if (t >= x[n - 1]) return y[n - 1];
    let i = 0; while (t > x[i + 1]) i++;
    const h = x[i + 1] - x[i], s = (t - x[i]) / h;
    return (2 * s ** 3 - 3 * s ** 2 + 1) * y[i] + (s ** 3 - 2 * s ** 2 + s) * h * m[i] + (-2 * s ** 3 + 3 * s ** 2) * y[i + 1] + (s ** 3 - s ** 2) * h * m[i + 1];
  };
});

const tmpC = new THREE.Color(), tv = new THREE.Vector3(), P = {};
function update(v, cover = -1) {
  const s = state(v);
  const white = Math.max(s.flash, cover);
  if (cover >= 0) s.title *= 1 - smooth(0.55, 1, cover);
  s.kick = kickAt(v);
  FU.uV.value = v;
  FU.uStretch.value = DBG.includes('nostretch') ? 0 : s.stretch;
  FU.uReach.value = 4 + 900 * Math.pow(s.stretch, 2.2);
  GU.uGT.value = v;
  // ---- you ----
  poseYou(v);
  you.setRim(0.25 * s.kick + 0.25 * s.stretch, 0.35 * s.kick + 0.3 * s.stretch, 0.7 * s.kick + 0.55 * s.stretch);
  // ---- the camera ----
  const K = (j) => camSpl[j](v);
  camera.position.set(K(0), K(1), K(2));
  camera.lookAt(tv.set(K(3), K(4), K(5)));
  camera.fov = K(6);
  const shake = 0.0012 + s.kick * 0.007 + 0.0015 * smooth(10, 30, v) + 0.008 * smooth(V_TRILLION, V_WHITE, v);
  camera.rotation.x += wobble(v * 43, 3) * shake; camera.rotation.y += wobble(v * 47, 4) * shake; camera.rotation.z += wobble(v * 39, 6) * shake * 0.5;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  // ---- sky and light ----
  const sc = skyColors(SUN_EL);
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  const zen = tmpC.setRGB(...sc.zen).clone(), hor = new THREE.Color(...sc.hor).lerp(new THREE.Color(0.5, 0.66, 0.88), 0.4);
  const kEnd = s.stretch;
  // (the sky darkens to a deep violet so the threads of light stand out)
  hor.lerp(new THREE.Color(0.16, 0.18, 0.42), kEnd); zen.lerp(new THREE.Color(0.02, 0.025, 0.09), kEnd);
  u.uSun.value.copy(SUNDIR); u.uZen.value.copy(zen); u.uHor.value.copy(hor); u.uGlow.value.setRGB(...sc.glow);
  u.uSunCol.value.setRGB(...sc.sun); u.uSunI.value = 1; u.uStars.value = 0; u.uT.value = v; u.uPx.value = (camera.fov * DEG) / H_PX; u.uCloud.value = 0.5; u.uCity.value = 0; u.uDark.value = 0;
  CU.uSkyHi.value.copy(zen); CU.uSkyLo.value.copy(hor); CU.uHaze.value.copy(hor); CU.uHazeD.value = 5200;
  CU.uSun.value.copy(SUNDIR); CU.uSunCol.value.setRGB(...sc.sun);
  const lc = new THREE.Vector3(0, 0, -30);
  sunL.position.copy(SUNDIR).multiplyScalar(600).add(lc);
  sunL.target.position.copy(lc); sunL.target.updateMatrixWorld();
  sunL.intensity = 3.0 * (1 - 0.6 * kEnd); sunL.color.setRGB(...sc.sun).lerp(new THREE.Color(1, 1, 1), 0.4);
  hemi.intensity = 1.4 * (1 - 0.5 * kEnd); hemi.color.copy(zen).multiplyScalar(2.0).lerp(new THREE.Color(0.75, 0.8, 0.95), 0.4);
  renderer.toneMappingExposure = 1.0 - 0.15 * kEnd;
  // ---- the world ----
  glows.begin(camera);
  smoke.begin(0, v, camera.position);
  city.frame(v, flyPose);
  things.frame(v);
  traffic.frame(v);
  harbor.frame(v, smoke);
  nature.frame(v);
  smalls.frame(v, glows);
  // sparks and dust where things land
  for (const h of HITLIST) {
    const a = v - h.t;
    if (a < -0.01) break;
    if (a > (h.dust ? 6 : 0.25)) continue;
    const k = 1 - a / 0.25;
    if (a < 0.2) { const g = Math.min(2, 0.8 + h.s * 0.12) * (1 - a / 0.2); glows.add(h.x, h.y + 0.15, h.z, 0.1 + 0.08 * Math.min(h.s, 12), 4.0 * g, 3.4 * g, 2.6 * g); }
    if (h.dust) {
      const n = h.s > 10 ? 6 : h.s > 4 ? 4 : 2;
      for (let j = 0; j < n; j++) {
        const sd = ((h.t * 7.31 + j * 0.618) % 1 + 1) % 1, ang = sd * 6.28;
        smoke.puff(h.x + Math.cos(ang) * h.s * 0.4 * (0.5 + a * 0.3), h.y + 0.3 * h.s * (0.2 + 0.25 * a), h.z + Math.sin(ang) * h.s * 0.4 * (0.5 + a * 0.3), h.s * (0.35 + 0.18 * a), 0.4 * smooth(0, 0.15, a) * (1 - smooth(1.5, 6, a)), 0.62, 0, sd);
      }
    }
  }
  // the people
  PEOPLE.forEach((p) => { personAt(p, v, P); crowd.pose(p.i, P); });
  crowd.commit();
  // the field lines (only at the end)
  fieldMat.opacity = 0.16 * smooth(V_TRILLION, V_TRILLION + 2, v);
  // (off: the loops all meet at your head and feet and made a column of glare over you)
  FIELD.visible = false;
  FIELD.scale.setScalar(1 + 40 * Math.pow(s.stretch, 1.6));
  smoke.end(); glows.end();
  smoke.mat.uniforms.uTime.value = v;
  smoke.mat.uniforms.uLight.value.setRGB(1.1, 1.05, 1.0);
  smoke.mat.uniforms.uSun.value.copy(SUNDIR);
  bloom.strength = DBG.includes('nobloom') ? 0 : 0.22 + 0.12 * s.kick + 0.2 * s.stretch;
  // ---------- post ----------
  tv.set(0, 1.0, 0).project(camera);
  const sx = tv.x * 0.5 + 0.5, sy = tv.y * 0.5 + 0.5;
  // the ripple from the last step
  let rk = 0, rr = 0;
  for (const h of HITS) { const a = v - h; if (a >= 0 && a < 0.9) { rk = 1 - a / 0.9; rr = a * 1.6; } }
  ripple.uniforms.uC.value.set(sx, sy); ripple.uniforms.uR.value = rr; ripple.uniforms.uK.value = rk * rk;
  finish.uniforms.uFloodC.value.set(sx, sy);
  finish.uniforms.uFlood.value = 1.15 * Math.pow(smooth(V_WHITE - 1.6, V_WHITE, v), 2.4);
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
  for (const t of [44, 38, 32, 27, 22, 17, 12, 8, 4, 2, 0]) renderFrame(t);
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, sky, state, update, you, PEOPLE, SMALLS };
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

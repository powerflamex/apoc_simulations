// "What if you screamed 1 trillion times louder?" — one street, one shot. The camera stands 2.3 m in front of you on
// the sidewalk and looks past you up the street; it never cuts. Your scream sends out rings: ripples in the air from
// your mouth (drawn in the post pass), and from the shock-wave stage on a white condensation shell and a ring of dust
// along the ground at every step. Everything else (glass, people, cars, lamps, buildings) breaks by itself in its own
// module, from the pressure where it is. Post: bloom, a soft vignette, darkening behind the text, the white at the
// end; the last LOOP seconds replay the moments before frame 0 while the white clears.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky, skyColors } from './sky.js';
import { makeGround, GU } from './ground.js';
import { makeCity, CU, hazed, DUST, TOWERS, towerAngle } from './city.js';
import { makeTraffic } from './traffic.js';
import { makeProps } from './props.js';
import { makeGlass } from './glass.js';
import { makeGlows } from './glows.js';
import { makeSmoke } from './smoke.js';
import { makeCrowd } from './crowd.js';
import { makeOverlay } from './overlay.js';
import { makeYou, FLAP } from './you.js';
import { PEOPLE, personAt, earArms } from './people.js';
import { YOU, YOU_YAW, MOUTH, CAM } from './layout.js';
import { state, VIDEO_DURATION, LOOP, captionAt, BEATS, HITS, V_FILL, V_FLASH, T_SWITCH, logMult, V_RING, V_BACK, V_WHITE } from './timeline.js';
import { lerp, smooth, wobble, clamp, rng, easeInOut } from './util.js';

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
const camera = new THREE.PerspectiveCamera(56, W / H_PX, 0.3, 6000);
scene.add(camera);
const plainMat = (color, rough = 0.9, extra = {}) => hazed(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };
const ctx = { plainMat, glowMat, shadowy };
const sky = makeSky();
scene.add(sky.mesh);
makeGround(scene);
const city = makeCity(scene, ctx);
const glass = makeGlass(scene);
const props = makeProps(scene, ctx, glass);
const traffic = makeTraffic(scene, ctx);
const glows = makeGlows(scene, 800);
const smoke = makeSmoke(scene, 1100);
const crowd = makeCrowd(scene, PEOPLE.length, plainMat(0xffffff, 0.82), { castShadow: true });
PEOPLE.forEach((p) => crowd.color(p.i, p.shirt, p.pants, p.skin, p.hair, p.sleeves));
const sunL = new THREE.DirectionalLight(0xfff3e2, 3.0);
sunL.castShadow = true;
sunL.shadow.mapSize.set(4096, 4096);
sunL.shadow.bias = -0.0004; sunL.shadow.normalBias = 0.05;
Object.assign(sunL.shadow.camera, { left: -60, right: 60, top: 75, bottom: -75, near: 10, far: 900 });
scene.add(sunL, sunL.target);
const hemi = new THREE.HemisphereLight(0x9cc0ff, 0x9a8a78, 1.2);
scene.add(hemi);

// ---------- you ----------
const you = makeYou(scene, { hoodie: 0x2f6fd0, jeans: 0x2a2e38, skin: 0xd09a74, hair: 0x2a1a10 });
you.root.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
// (place you with your middle, between your feet, at x, z facing yaw; the figure's origin is its right sole)
function placeYou(x, y, z, yaw) { you.root.rotation.y = yaw; you.root.position.set(x - 0.105 * Math.cos(yaw), y, z + 0.105 * Math.sin(yaw)); }

// ---------- the shells: a white condensation shell from the shock-wave stage on, one per step ----------
const shellMat = new THREE.ShaderMaterial({
  uniforms: { uA: { value: 0 } },
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
    void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vP = position; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform float uA; varying vec3 vN; varying vec3 vV; varying vec3 vP;
    float h(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
    float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
    void main(){
      float rim = 1.0 - abs(dot(normalize(vN), normalize(vV)));
      float n = n3(vP * 9.0) * 0.6 + n3(vP * 23.0) * 0.4;
      float a = (pow(rim, 2.5) * 0.9 + 0.08) * (0.55 + 0.7 * n) * uA * smoothstep(-0.02, 0.1, vP.y);
      gl_FragColor = vec4(vec3(0.95, 0.96, 0.98), a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
const SHELLS = [];
for (let k = 0; k < 5; k++) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), shellMat.clone());
  m.renderOrder = 7; m.frustumCulled = false; m.visible = false;
  scene.add(m); SHELLS.push(m);
}
const SHOCK = BEATS.filter(([, L]) => L >= 3).map(([t, L]) => ({ t, L }));
const RING_DUST = [];
{
  const R = rng(99);
  for (const b of SHOCK) if (b.L >= 6) for (let k = 0; k < 40; k++) RING_DUST.push({ t: b.t, a: (k / 40) * Math.PI * 2 + R() * 0.15, L: b.L, s: R(), sh: 0.55 + 0.25 * R() });
  // the last ring: racing down the street to the horizon
  for (let k = 0; k < 90; k++) RING_DUST.push({ t: V_RING, a: -Math.PI / 2 + (R() - 0.5) * 2.2, L: 14, s: R(), sh: 0.7 + 0.2 * R(), last: true });
}

// ---------- the crater under your feet: sidewalk slabs that crack loose and tip up round you from the shock wave on ----------
const CRATER = [];
{
  const R = rng(4040);
  for (let k = 0; k < 22; k++) {
    const a = (k / 22) * Math.PI * 2 + R() * 0.2, r = 0.6 + 0.6 * R();
    CRATER.push({ a, r, t: HITS[6] + 0.05 + (r - 0.75) * 0.2 + R() * 0.1, tilt: 0.35 + 0.5 * R(), grow: 0.2 + 0.3 * R(), sx: 0.22 + 0.2 * R(), sz: 0.2 + 0.18 * R() });
  }
}
const slabs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.09, 1).translate(0, 0, 0.5), plainMat(0x77726c, 0.9), CRATER.length);
slabs.castShadow = true; slabs.receiveShadow = true; slabs.frustumCulled = false;
scene.add(slabs);
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
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H_PX / 2), 0.3, 0.45, 1.05);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const NR = 10;
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.22 }, uTitle: { value: 0 }, uCounter: { value: 0 }, uCap: { value: 0 }, uWhite: { value: 0 }, uAb: { value: 0 },
    uRings: { value: Array.from({ length: NR }, () => new THREE.Vector4(0.5, 0.5, -1, 0)) }, uDustW: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter; uniform float uCap; uniform float uWhite; uniform float uAb;
    uniform vec4 uRings[${NR}]; uniform float uDustW;
    varying vec2 vUv;
    void main() {
      // the ripples: rings round your mouth that bend the light passing through them
      vec2 uv = vUv; float glow = 0.0;
      const vec2 AS = vec2(${(W / H_PX).toFixed(4)}, 1.0);
      for (int i = 0; i < ${NR}; i++) {
        vec4 R = uRings[i];
        if (R.z < 0.0) continue;
        vec2 d = (vUv - R.xy) * AS;
        float dist = length(d);
        float w = 0.018 + R.z * 0.05;
        float x = (dist - R.z) / w;
        float g = exp(-x * x);
        uv -= normalize(d + 1e-6) / AS * R.w * x * g;
        glow += R.w * g;
      }
      vec2 off = (uv - 0.5) * uAb * 0.01;
      vec3 col = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      col += vec3(0.9, 0.93, 1.0) * glow * 11.0;
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.12);
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.5 * exp(-pow((vUv.y - 0.79) / 0.09, 2.0));
      col *= 1.0 - uCounter * 0.45 * exp(-pow((vUv.y - 0.6) / 0.085, 2.0)) * smoothstep(1.1, 0.2, vUv.x);
      col *= 1.0 - uCap * 0.45 * exp(-pow((vUv.y - 0.125) / 0.045, 2.0));
      // the blast filling the frame: a dusty white from the edges in
      float e = length(c * vec2(1.3, 1.0));
      col = mix(col, vec3(0.93, 0.9, 0.86), uDustW * smoothstep(0.75 - 0.75 * uDustW, 0.95 - 0.6 * uDustW, e));
      col = mix(col, vec3(1.0, 0.99, 0.96), uWhite);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- update ----------
const tmpC = new THREE.Color(), tv = new THREE.Vector3(), mouthV = new THREE.Vector3();
const C = (a) => tmpC.setRGB(a[0], a[1], a[2]);
const SUN_EL = 58, SUNDIR = (() => { const el = SUN_EL * DEG, az = 182 * DEG; return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)); })();
const kickAt = (v) => { let k = 0; HITS.forEach((t, n) => { const dt = v - t; if (dt > -0.05 && dt < 1.5) k = Math.max(k, smooth(-0.05, 0.04, dt) * Math.exp(-Math.max(dt, 0) / 0.35) * (0.25 + 0.06 * n)); }); return k; };
const P = {};
function update(v, cover = -1) {
  const s = state(v);
  const white = Math.max(s.flash, cover);
  if (cover >= 0) s.title *= 1 - smooth(0.55, 1, cover);
  s.kick = kickAt(v);
  // ---- you: leaning into the scream, fists clenched, head shaking, hoodie and hair whipping; each step a lunge ----
  const tr = 0.012 + 0.004 * s.L;
  let lunge = 0;
  HITS.forEach((h) => { const dt = v - h; if (dt > -0.15 && dt < 1.2) lunge = Math.max(lunge, smooth(-0.15, 0.05, dt) * Math.exp(-Math.max(dt, 0) / 0.45)); });
  const shakeH = 0.5 + 0.5 * smooth(0, 12, v);
  const lean = 0.16 + 0.05 * Math.sin(v * 2.3) + 0.14 * lunge;
  you.pose({ hipY: 0.84 + 0.015 * Math.sin(v * 2.3) - 0.04 * lunge, footZ: 0.08, lean,
    head: [-0.5 + 0.07 * Math.sin(v * 6.3) * shakeH + tr * wobble(v * 31, 2) - 0.15 * lunge, 0.06 + 0.22 * Math.sin(v * 4.7) * shakeH + 0.06 * wobble(v * 13, 5)],
    armsOut: 0.55 + 0.06 * Math.sin(v * 3.1) + 0.15 * lunge, armsFwd: -0.15 + 0.06 * Math.sin(v * 2.3 + 1) - 0.15 * lunge, curl: 1.0 });
  you.pelvis.rotation.x = lean;
  // (elbows bent, fists clenched in front of you, shaking with the effort)
  you.arms.forEach((A, i) => {
    A.el.rotation.set(-0.75 + 0.1 * Math.sin(v * 9 + i) - 0.2 * lunge, 0, 0); A.wr.rotation.set(0.25, 0, 0);
    A.sh.rotation.z += (i ? 1 : -1) * 0.04 * wobble(v * 21, i + 3);
    // clenched fists
    A.fingers.forEach((f) => f.forEach((seg) => seg.rotation.set(0, 0, 1.35)));
    A.thumb.forEach((seg, k) => seg.rotation.set(0, 0, k ? 0.9 : 0.4));
  });
  FLAP.uFT.value = v;
  FLAP.uFlap.value = 0.35 + 0.65 * smooth(10.5, 12.5, v) + 0.3 * lunge;
  you.tufts.forEach((t) => { const a = t.userData.a; t.rotation.set(-0.9 + 0.45 * Math.sin(v * 23 + a * 3) * FLAP.uFlap.value, 0, a * 0.5 + 0.35 * Math.sin(v * 19 + a * 5) * FLAP.uFlap.value); });
  placeYou(YOU.x, 0, YOU.z, YOU_YAW);
  you.root.updateMatrixWorld(true);
  you.head.localToWorld(mouthV.set(0, 0.041, 0.09));
  // ---- the camera: one shot; from 0:05 it eases back and up (you end about half the size, off-centre, the street
  //      readable behind you); a shake that grows with the power ----
  const cx0 = clamp((v - 5) / 35, 0, 1), ce = smooth(0, 1, cx0) * 0.55 + (1 - Math.pow(1 - cx0, 2.2)) * 0.45;
  const pos = new THREE.Vector3(lerp(CAM.x, 7.85, ce), lerp(CAM.y, 2.9, ce), lerp(CAM.z, 4.55, ce));
  const yaw = lerp(3.2, -2.5, ce) * DEG, pitch = lerp(9.5, -3.5, ce) * DEG;
  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  camera.position.copy(pos);
  camera.lookAt(tv.copy(pos).add(dir));
  camera.fov = 56 + 4 * ce;
  const shake = 0.0015 + s.kick * 0.012 + 0.0006 * Math.max(0, s.L - 8) + 0.004 * smooth(V_RING, V_RING + 0.3, v) + 0.02 * smooth(V_BACK, V_WHITE, v);
  camera.rotation.x += wobble(v * 43, 3) * shake; camera.rotation.y += wobble(v * 47, 4) * shake; camera.rotation.z += wobble(v * 39, 6) * shake * 0.5;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  // ---- sky and light ----
  const sc = skyColors(SUN_EL);
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  u.uSun.value.copy(SUNDIR); u.uZen.value.copy(C(sc.zen)); u.uHor.value.copy(C(sc.hor)); u.uGlow.value.copy(C(sc.glow)); u.uSunCol.value.copy(C(sc.sun));
  u.uSunI.value = 1; u.uStars.value = 0; u.uT.value = v; u.uPx.value = (camera.fov * DEG) / H_PX; u.uCloud.value = 0.7; u.uCity.value = 0;
  const hi = C(sc.zen).clone(), lo = C(sc.hor).clone();
  CU.uSkyHi.value.copy(hi); CU.uSkyLo.value.copy(lo); GU.uSkyHi.value.copy(hi); GU.uSkyLo.value.copy(lo);
  CU.uHaze.value.copy(lo); CU.uHazeD.value = 2600;
  CU.uSun.value.copy(SUNDIR); CU.uSunCol.value.copy(C(sc.sun));
  CU.uTime.value = v; GU.uTime.value = v;
  CU.uL.value = s.L;
  CU.uDust.value = smooth(15.5, 24, v);
  GU.uCrack.value = v < HITS[6] ? 0 : 1.2 + 2.2 * smooth(HITS[6], HITS[6] + 0.4, v) + 6 * smooth(HITS[6] + 0.4, 40, v);
  GU.uPit.value = v < HITS[6] ? 0 : 0.55 * smooth(HITS[6], HITS[6] + 0.3, v) + 0.45 * smooth(HITS[8], HITS[8] + 0.3, v);
  CRATER.forEach((c, i) => {
    const k = smooth(c.t, c.t + 0.25, v), k2 = smooth(HITS[8], HITS[8] + 0.4, v) + smooth(HITS[10], HITS[10] + 0.4, v);
    const ang = (c.tilt + 0.25 * k2) * k, rr = c.r + (c.grow + 0.2 * k2) * k;
    const e = new THREE.Euler(-ang, -c.a + Math.PI / 2, 0, 'YXZ');
    slabs.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(YOU.x + Math.cos(c.a) * (rr - 0.3), -0.05 + 0.05 * k, YOU.z + Math.sin(c.a) * (rr - 0.3)), new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(c.sx, 1, c.sz * k + 0.001)));
  });
  slabs.instanceMatrix.needsUpdate = true;
  const lc = new THREE.Vector3(YOU.x - 4, 0, YOU.z - 50);
  sunL.position.copy(SUNDIR).multiplyScalar(500).add(lc);
  sunL.target.position.copy(lc); sunL.target.updateMatrixWorld();
  sunL.intensity = 3.3;
  sunL.color.copy(C(sc.sun)).lerp(new THREE.Color(1, 1, 1), 0.5);
  hemi.intensity = 1.9;
  hemi.color.copy(C(sc.zen)).multiplyScalar(2.2).lerp(new THREE.Color(0.75, 0.8, 0.95), 0.4);
  hemi.groundColor.setRGB(0.5, 0.45, 0.4);
  renderer.toneMappingExposure = 1.05;
  glass.mat.uniforms.uSun.value.copy(SUNDIR); glass.mat.uniforms.uSky.value.copy(lo);
  // ---- the world ----
  glows.begin(camera);
  smoke.begin();
  city.frame(v, s);
  glass.frame(v);
  props.frame(v, s);
  traffic.frame(v, s, glows);
  // dust where chunks break away: a puff that swells and drifts off, away from you
  for (const [t0, x, y, z, sz] of DUST) {
    const t = v - t0; if (t < 0 || t > 7) continue;
    const dx = x - MOUTH.x, dz = z - MOUTH.z, dh = Math.hypot(dx, dz) || 1;
    smoke.puff(x + dx / dh * 3 * t, y + 0.6 * t, z + dz / dh * 3 * t, sz * (0.6 + 0.9 * (1 - Math.exp(-t * 0.8))), 0.75 * smooth(0, 0.25, t) * (1 - smooth(2.5, 7, t)), 0.72, 0, (x * 0.13 + z * 0.07) % 1);
  }
  // the ring of dust along the ground at each shock step
  for (const d of RING_DUST) {
    const t = v - d.t; if (t < 0 || t > 3.2) continue;
    if (d.last) {
      if (t > 2.4) continue;
      const R = 8 + 160 * Math.pow(t, 1.5) * (0.8 + 0.4 * d.s);
      smoke.puff(MOUTH.x + Math.cos(d.a) * R, 2 + 4 * d.s + 0.03 * R, MOUTH.z + Math.sin(d.a) * R, 3 + 0.06 * R, 0.8 * smooth(0, 0.1, t) * (1 - smooth(1.5, 2.4, t)), d.sh, 0, d.s);
      continue;
    }
    const R = 2 + 40 * (1 - Math.exp(-t * 1.6)) * clamp(0.25 + 0.12 * (d.L - 6), 0.25, 1.0);
    smoke.puff(MOUTH.x + Math.cos(d.a) * R, 0.6 + 0.8 * t, MOUTH.z + Math.sin(d.a) * R, (1.0 + 1.6 * t + d.s) * (d.L < 9 ? 0.6 : 1), 0.6 * smooth(0, 0.15, t) * (1 - smooth(1.2, 3.2, t)), d.sh, 0, d.s);
  }
  // the towers: dust at the foot as one starts to go, a huge burst along it where it lands
  for (const T of TOWERS) {
    const t = v - T.t; if (t < 0 || t > T.T + 7) continue;
    const b = T.b;
    for (let i = 0; i < 4; i++) {
      const f = (i * 0.618) % 1, ang = i * 2.4;
      smoke.puff(b.x + Math.cos(ang) * b.w * 0.4, 2 + 2 * f + 0.8 * t, b.z + Math.sin(ang) * b.d * 0.4, 4 + 3 * f + t, 0.55 * smooth(0, 0.6, t) * (1 - smooth(3, 6, t)), 0.7, 0, f);
    }
    const ti = t - T.T;
    if (ti > 0) for (let i = 0; i < 14; i++) {
      const f = i / 13, d = b.h * f;
      smoke.puff(T.px + T.ux * d + Math.sin(i * 3.1) * 6, 4 + 10 * ((i * 0.37) % 1) + 2.5 * ti, T.pz + T.uz * d + Math.cos(i * 2.3) * 6, 10 + 8 * ((i * 0.53) % 1) + 4 * ti, 0.85 * smooth(0, 0.3, ti) * (1 - smooth(3, 7, ti)), 0.74, 0, (i * 0.29) % 1);
    }
  }
  // the echo: the last ring bounced off the far towers comes back up the street, a wall of white, at the camera
  if (v > V_BACK) {
    const k = clamp((v - V_BACK) / (V_WHITE - V_BACK), 0, 1);
    const zf = lerp(-210, camera.position.z + 2, Math.pow(k, 1.25));
    for (let i = 0; i < 120; i++) {
      const fx = (i * 0.618) % 1, fy = (i * 0.377) % 1, fz = (i * 0.211) % 1;
      const x = -40 + 90 * fx, y = 1 + 70 * fy * fy;
      smoke.puff(x, y, zf - 18 * fz, 13 + 12 * fy, smooth(0, 0.12, k), 1.0, 0, fx);
    }
  }
  smoke.end(); glows.end();
  smoke.mat.uniforms.uTime.value = v;
  smoke.mat.uniforms.uLight.value.setRGB(1.25, 1.2, 1.1);
  smoke.mat.uniforms.uSun.value.copy(SUNDIR);
  // the shells
  let si = 0;
  for (const b of SHOCK) {
    const t = v - b.t;
    if (t < 0 || t > 1.8 || si >= SHELLS.length) continue;
    const m = SHELLS[si++];
    m.visible = true;
    const R = 1.2 + 60 * t * clamp(0.25 + 0.12 * (b.L - 3), 0.25, 1.3);
    m.position.set(MOUTH.x, 0, MOUTH.z); m.scale.setScalar(R);
    m.material.uniforms.uA.value = clamp(0.25 + 0.06 * (b.L - 3), 0.25, 0.75) * smooth(0, 0.08, t) * (1 - smooth(0.4, 1.8, t));
  }
  {
    const t = v - V_RING;
    if (t > 0 && t < 2.6 && si < SHELLS.length) {
      const m = SHELLS[si++];
      m.visible = true;
      const R = 8 + 160 * Math.pow(t, 1.5);
      m.position.set(MOUTH.x, 0, MOUTH.z); m.scale.setScalar(R);
      m.material.uniforms.uA.value = 2.2 * smooth(0, 0.06, t) * (1 - smooth(1.6, 2.6, t));
    }
  }
  for (; si < SHELLS.length; si++) SHELLS[si].visible = false;
  // the people
  PEOPLE.forEach((p) => {
    personAt(p, v, P);
    crowd.pose(p.i, P);
    earArms(crowd, p.i, P);
  });
  crowd.commit();
  bloom.strength = 0.2 + 0.15 * s.kick + 0.35 * Math.exp(-Math.max(0, v - V_RING) / 0.5) * (v > V_RING ? 1 : 0) + 0.25 * smooth(V_BACK, V_WHITE, v);
  // ---------- the ripples from your mouth ----------
  tv.copy(mouthV).project(camera);
  const cx = tv.x * 0.5 + 0.5, cy = tv.y * 0.5 + 0.5;
  const rings = finish.uniforms.uRings.value;
  let ri = 0;
  // small, steady ones (every 0.2 s), stronger as the power grows
  for (let k = Math.floor((v - 1.1) / 0.2); k <= Math.floor(v / 0.2) && ri < NR - 3; k++) {
    const t = v - k * 0.2; if (t < 0 || t > 1.1) continue;
    const R = 0.05 + 0.75 * t;
    const L = logMult(k * 0.2);
    rings[ri++].set(cx, cy, R, (0.0065 + 0.0003 * L) * (1 - smooth(0.5, 1.1, t)) * smooth(0, 0.08, t));
  }
  // a big one at every step
  HITS.forEach((h, n) => {
    const t = v - h; if (t < 0 || t > 1.0 || ri >= NR) return;
    const L = BEATS[n][1];
    rings[ri++].set(cx, cy, 0.06 + 1.25 * t, (0.02 + 0.0016 * L) * (1 - smooth(0.4, 1.0, t)) * smooth(0, 0.04, t));
  });
  for (; ri < NR; ri++) rings[ri].z = -1;
  // ---------- post ----------
  finish.uniforms.uTime.value = v;
  finish.uniforms.uAb.value = s.kick * 0.6 + 0.6 * smooth(V_BACK, V_WHITE, v);
  finish.uniforms.uDustW.value = 0.6 * smooth(V_BACK + 0.6, V_WHITE, v);
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
  window.__dbg = { scene, camera, renderer, composer, sky, state, update, you, PEOPLE };
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

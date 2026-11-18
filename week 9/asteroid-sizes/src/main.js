import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeGround, GU } from './ground.js';
import { makeCity } from './city.js';
import { makeTerrace } from './terrace.js';
import { makePeople } from './people.js';
import { makeGlows } from './glows.js';
import { makeSmoke } from './smoke.js';
import { makeFire } from './fire.js';
import { makeEffects } from './effects.js';
import { makeOverlay } from './overlay.js';
import { LU } from './looks.js';
import { BLD, TREES, GZ, EYE, HILL, RAIL_Z, LOW_Y, shore } from './layout.js';
import { state, VIDEO_DURATION, LOOP, S, STOPS, WHITE_CLEAR } from './timeline.js';
import { lerp, smooth, wobble, clamp, keys, rng } from './util.js';

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
// (a plain depth buffer: the nearest person is 3 m off; the far plane takes in the Moon-size rock 6,000 km out)
const camera = new THREE.PerspectiveCamera(56, W / H_PX, 1.0, 1.4e7);
camera.rotation.order = 'YXZ';
scene.add(camera);

// directions: az 0 = straight ahead (-z), + to the right; el up
const dirAE = (az, el, out = new THREE.Vector3()) => out.set(Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), -Math.cos(az * DEG) * Math.cos(el * DEG));
const azel = (p, from) => { const dx = p.x - from.x, dy = p.y - from.y, dz = p.z - from.z; return [Math.atan2(dx, -dz) / DEG, Math.atan2(dy, Math.hypot(dx, dz)) / DEG]; };
const SUN_AZ = 158, SUN_EL = 34;
const SUN = dirAE(SUN_AZ, SUN_EL);

// ---------- the world ----------
const sky = makeSky();
scene.add(sky.mesh);
makeGround(scene);
const city = makeCity(scene);
const terrace = makeTerrace(scene);
const people = makePeople(scene);
const glows = makeGlows(scene, 9000);
const smoke = makeSmoke(scene, 3000);
const fire = makeFire(scene, 1800);
const fx = makeEffects(scene);
const overlay = makeOverlay();

// the Sun, behind your right shoulder (shadows over the terrace only)
const sunL = new THREE.DirectionalLight(0xfff1dc, 2.6);
sunL.castShadow = true;
sunL.shadow.mapSize.set(4096, 4096);
sunL.shadow.bias = -0.0004; sunL.shadow.normalBias = 0.03;
Object.assign(sunL.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 10, far: 400 });
scene.add(sunL, sunL.target);
// the light of whatever is burning in front of you (shadows run back toward you)
const frL = new THREE.DirectionalLight(0xffffff, 0);
frL.castShadow = true;
frL.shadow.mapSize.set(2048, 2048);
frL.shadow.bias = -0.0005; frL.shadow.normalBias = 0.04;
Object.assign(frL.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 10, far: 600 });
scene.add(frL, frL.target);
const hemi = new THREE.HemisphereLight(0xa8c4ff, 0x8a8070, 1.2);
scene.add(hemi);

// ---------- post ----------
const rt = new THREE.WebGLRenderTarget(W, H_PX, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H_PX);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv);
    if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 16.0), 1.0); }`,
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H_PX / 2), 0.3, 0.3, 1.05);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.2 }, uTitle: { value: 0 }, uCounter: { value: 0 }, uAb: { value: 0 }, uBlur: { value: 0 }, uWhite: { value: 0 }, uCenter: { value: new THREE.Vector2(0.5, 0.5) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uAb; uniform float uBlur; uniform float uWhite; uniform vec2 uCenter;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 col = vec3(0.0);
      float jit = h(vUv * 1920.0 + uTime) - 0.5;
      vec2 off = (vUv - 0.5) * uAb * 0.01;
      for (int i = 0; i < 6; i++) {
        float k = (float(i) + jit) / 6.0;
        vec2 uv = uCenter + (vUv - uCenter) * (1.0 - uBlur * k);
        col += vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      }
      col /= 6.0;
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      // a soft shade behind the title, the picker and the counter so the text reads over a bright sky
      col *= 1.0 - uTitle * 0.42 * exp(-pow((vUv.y - 0.86) / 0.07, 2.0));
      col *= 1.0 - uCounter * 0.22 * exp(-pow((vUv.y - 0.66) / 0.05, 2.0)) * exp(-pow((vUv.x - 0.5) / 0.2, 2.0));
      col = mix(col, vec3(1.0, 0.99, 0.97), uWhite);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- the camera: your phone, held up over the crowd, looking over the city at ground zero ----------
const GZ_AZ = Math.atan2(GZ.x, -GZ.z) / DEG;
const CAM = new THREE.Vector3(0, EYE, 0.4);
function camAt(v, s) {
  const pos = CAM.clone();
  const i = s.i;
  // (a little higher in the sky for the bigger ones; a little wider for the biggest two)
  const pitchBase = [7.5, 7.5, 7.5, 11, 10.5, 11][i];
  const fovBase = [56, 56, 56, 58, 62, 64][i];
  let pitch = pitchBase * DEG, fov = fovBase, yaw = -(GZ_AZ + 0.6) * DEG;
  let roll = wobble(v * 0.3, 7) * 0.35 * DEG;
  pos.x += wobble(v * 0.5, 2) * 0.02; pos.y += wobble(v * 0.7, 5) * 0.015;
  yaw += wobble(v * 0.45, 4) * 0.3 * DEG; pitch += wobble(v * 0.55, 3) * 0.25 * DEG;
  return { pos, yaw, pitch, roll, fov };
}

// ---------- planned once ----------
const R0 = rng(5150);
// glints of breaking glass on every building's face toward you (house-size and jumbo-jet-size stops)
const GLINT = [];
BLD.forEach((b, i) => {
  if (b.kind === 5 && b.dist > 600) return;
  if (Math.abs(b.x) > 120 + b.dist * 0.4) return;
  const n = b.kind >= 2 ? 16 : 4;
  for (let k = 0; k < n; k++) GLINT.push({ i, x: b.x + (R0() - 0.5) * b.w, y: b.y + 3 + R0() * Math.max(2, b.h - 6), z: b.z + b.d * 0.5 + 0.5, dl: R0() * 0.35, vx: (R0() - 0.5) * 3, ph: R0() });
});
// shards from the terrace's glass panels
const SHARD = [];
terrace.PANELS.forEach((p) => {
  if (Math.abs(p.x) > 12) return;
  for (let k = 0; k < 40; k++) SHARD.push({ x: p.x + (R0() - 0.5) * 1.8, y: p.y + (R0() - 0.5) * 0.9, z: p.z + 0.05, vx: (R0() - 0.5) * 6, vy: 1 + R0() * 4, vz: 6 + R0() * 12, sp: (R0() - 0.5) * 30, ph: R0() * 6, dl: R0() * 0.06 });
});
// steam over the bay where it boils (spots on the water you can see)
const STEAM = [];
for (let k = 0; k < 220 && STEAM.length < 70; k++) {
  const z = -1950 - R0() * 3500, x = (R0() - 0.5) * 2 * (300 + -z * 0.32);
  if (shore(x, z) > -60) continue;
  STEAM.push({ x, z, r: 110 + R0() * 150, ph: R0(), sp: 0.7 + R0() * 0.6, seed: R0() });
}
// puffs from each tower's foot and body as it falls
const TOWERS = BLD.map((b, i) => ({ b, i })).filter((t) => t.b.h > 45 && t.b.kind !== 5);
// chunks thrown out of the crater (skyscraper-size): [direction az, speed, size, delay]
const CHUNK = Array.from({ length: 90 }, () => ({ a: (R0() - 0.5) * 1.4 + Math.PI, up: 0.5 + R0() * 0.5, sp: 380 + R0() * 520, s: 25 + R0() * 70, dl: R0() * 2.2, seed: R0() }));

// ---------- per stop: what the rock does ----------
const tmpC = new THREE.Color(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
const GZV = new THREE.Vector3(GZ.x, GZ.y, GZ.z);
const R_CERES = 469700, R_MOON = 1737400;
// the airburst over downtown (jumbo jet), drawn ~600 m up (real: 5.4 miles)
const BURST = new THREE.Vector3(GZ.x, 540, GZ.z);
// blast fronts (m from ground zero) per stop
const ring2 = (v) => { const st = S.jet, t1 = st.hit + 0.12; return v < t1 ? 0 : 2440 * Math.pow(clamp((v - t1) / (st.you - t1), 0, 1.3), 0.8); };
const tRing2 = (g) => { const st = S.jet, t1 = st.hit + 0.12; return t1 + (st.you - t1) * Math.pow(g / 2440, 1.25); };
const crater3 = (v) => { const st = S.tower; const u = clamp((v - st.hit) / 4.6); return 2000 * Math.pow(u, 0.75); };
const surge3 = (v) => { const st = S.tower; return v < st.hit ? 0 : 2440 * Math.pow(clamp((v - st.hit) / (st.you - st.hit), 0, 1.3), 0.85); };
const tSurge3 = (g) => { const st = S.tower; return st.hit + (st.you - st.hit) * Math.pow(g / 2440, 1 / 0.85); };
const dome4 = (v) => { const st = S.everest; return v < st.hit ? 0 : 2460 * Math.pow(clamp((v - st.hit) / (st.you - st.hit), 0, 1.3), 0.7); };
const tDome4 = (g) => { const st = S.everest; return st.hit + (st.you - st.hit) * Math.pow(g / 2460, 1 / 0.7); };
// the biggest two: the height of their lowest point over ground zero (m), and the fire blowing out from under them
// before the hit: its size in the sky grows from a26 (seen whole, ~25 deg wide) to touching (sped up); its centre comes in along A
// after the hit: (slowed right down) its lowest point, over ground zero, goes from the towers' tops (350 m) to your hilltop
const gapAt = (st, v) => {
  const u = clamp((v - st.hit) / (st.you - st.hit));
  return lerp(350, 104, 1 - Math.pow(1 - u, 1.4));
};
const bodyCentre = (st, v, R, A, a0, out) => {
  const P0 = new THREE.Vector3(GZ.x, GZ.y + 350 + R, GZ.z);
  if (v >= st.hit) return out.set(GZ.x, GZ.y + gapAt(st, v) + R, GZ.z);
  const u = clamp((v - st.t0) / (st.hit - st.t0));
  const ang = (a0 + (88.5 - a0) * u * u * u) * DEG;
  const d = R / Math.sin(ang);
  const B = P0.clone().sub(CAM), ab = A.dot(B), disc = ab * ab - B.lengthSq() + d * d;
  const L = disc > 0 ? Math.max(0, -ab + Math.sqrt(disc)) : 0;
  return out.copy(P0).addScaledVector(A, L);
};
const blow = (st, v) => (v < st.hit ? 0 : 2440 * Math.pow(clamp((v - st.hit) / (st.you - st.hit), 0, 1.3), 0.75));
const tBlow = (st, g) => st.hit + (st.you - st.hit) * Math.pow(g / 2440, 1 / 0.75);

// the side of a rock that glows: its leading edge as you see it (the direction it moves across the sky, a little toward you)
const leadFront = (A, p, out) => {
  const view = tmpV2.copy(p).sub(CAM).normalize();
  out.copy(A).negate();
  out.addScaledVector(view, -out.dot(view)).normalize().multiplyScalar(0.92).addScaledVector(view, -0.4).normalize();
  return out;
};
function hideAll() {
  fx.rock.visible = false; fx.body.visible = false; fx.ring.visible = false; fx.ring2.visible = false;
  fx.curtain.visible = false; fx.ball.visible = false; fx.dome.visible = false; fx.shards.count = 0;
}

function update(v, cover = -1) {
  const s = state(v);
  const st = s.stop, i = s.i;
  const white = Math.max(s.white, cover);
  if (cover >= 0) s.title *= 1;
  s.shake = 0; s.lookEl = 12;
  let kick = 0;
  const kickAt = (t, k) => { const dt = v - t; if (dt > -0.05 && dt < 1.5) kick = Math.max(kick, smooth(-0.05, 0.04, dt) * Math.exp(-Math.max(dt, 0) / 0.32) * k); };
  hideAll();
  glows.begin(camera); smoke.begin(); fire.begin();
  // defaults: a clear morning
  const U = sky.uniforms;
  U.uTrail.value = 0; U.uHot.value = 0; U.uCloud.value = 0; U.uFlash.value = 0; U.uFire.value = 0; U.uDust.value = 0; U.uDim.value = 0;
  let frontI = 0; const frontDir = tmpV2.set(0, 0.2, -1).normalize(); let frontCol = tmpC.setRGB(1, 0.85, 0.65);
  let flash = 0, sunDim = 0, burnAll = 0, fireSky = 0, dustSky = 0;
  LU.uFront.value = 1e9; LU.uKind.value = 0; LU.uCrater.value = 0; LU.uMelt.value = 0; LU.uScorch.value = 0; LU.uBoil.value = 0; LU.uTide.value = 0;
  terrace.glass.visible = true;
  let carsStop = 1e9;

  // ---------------- the stops ----------------
  // building state, filled per stop: (break time, tip angle, sink, burn, dust)
  const BS = BLD.map(() => null);
  const set = (k, tb, ang, sink, burn, dust) => { BS[k] = [tb, ang, sink, burn, dust]; };

  if (st.key === 'house') {
    // a fireball crossing the sky from the right, bursting high up
    const u = clamp((v - st.t0) / (st.hit - st.t0));
    const az = lerp(15, -5, u), el = lerp(13.5, 9.6, u) + 0.8 * Math.sin(u * Math.PI);
    U.uHead.value.set(az, el); U.uTail.value.set(30, 19); U.uHeadR.value = 1.35 + 0.35 * u;
    U.uHot.value = 1 - smooth(st.hit, st.hit + 0.25, v);
    U.uTrail.value = 1; U.uAge.value = Math.max(0, v - st.t0 + 1.5); U.uTrailW.value = 0.55;
    U.uBurstP.value.set(-5, 9.6);
    const tb = v - st.hit;
    U.uCloud.value = smooth(0, 0.1, tb); U.uBurst.value = Math.max(0, tb); U.uBurstR.value = 1.2 + 3.2 * (1 - Math.exp(-Math.max(0, tb) / 0.8));
    flash = tb > 0 ? Math.exp(-tb / 0.35) * 0.6 : 0;
    U.uFlashP.value.set(-5, 9.6);
    // its light: brighter than the Sun as it flares (30x at the peak in 2013: capped here)
    dirAE(az, el, frontDir);
    frontI = (tb < 0 ? 2.0 + 0.6 * u : 0.4 + 2.2 * Math.exp(-tb / 0.6)) * (1 - smooth(st.hit + 1.5, st.hit + 2.5, v));
    frontCol.setRGB(1, 0.93, 0.8);
    s.lookEl = el;
    // the shock: a front sweeping in across the city from the burst, breaking every window it passes
    const T0 = 1.05, TD = st.you - 1.05;
    BLD.forEach((b, k) => set(k, T0 + TD * (1 - Math.min(b.dist, 3600) / 3600), 0, 0, 0, 0));
    for (const g of GLINT) {
      const b = BLD[g.i], tb2 = T0 + TD * (1 - Math.min(b.dist, 3600) / 3600) + g.dl, age = v - tb2;
      if (age < 0 || age > 1.6) continue;
      const y = g.y - 4.9 * age * age - 2 * age, a = 1.6 * Math.exp(-age / 0.7) * (0.45 + 0.55 * Math.sin(age * 34 + g.ph * 20) ** 2);
      if (y < b.y) continue;
      const sz = 3 + b.dist * 0.0042;
      glows.add(g.x + g.vx * age, y, g.z + 1.5 * age, sz, 3.0 * a, 3.0 * a, 3.2 * a);
    }
    kickAt(st.hit, 0.35);
    // the boom reaches the terrace: the glass panels burst toward you
    const ta = v - st.you;
    if (ta > 0) {
      terrace.glass.visible = false;
      let n = 0;
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
      for (const sh of SHARD) {
        const t = ta - sh.dl; if (t < 0) continue;
        p.set(sh.x + sh.vx * t, sh.y + sh.vy * t - 4.9 * t * t, sh.z + sh.vz * t);
        if (p.z > CAM.z - 0.8) continue;
        e.set(sh.ph + sh.sp * t, sh.ph * 2 + sh.sp * 0.7 * t, sh.sp * 0.3 * t); q.setFromEuler(e);
        m4.compose(p, q, sc); fx.shards.setMatrixAt(n++, m4);
        if (n % 3 === 0) glows.add(p.x, p.y, p.z, 0.25, 2.5, 2.5, 2.7);
      }
      fx.shards.count = n; fx.shards.instanceMatrix.needsUpdate = true;
      kickAt(st.you, 1.0);
      s.shake = smooth(0, 0.1, ta) * Math.exp(-ta / 0.5);
    }
    kickAt(T0 + 0.6, 0.25);
  }

  else if (st.key === 'jet') {
    // a bigger fireball coming down steeply toward downtown, bursting ~600 m over it
    const [baz, bel] = azel(BURST, CAM);
    const u = clamp((v - st.t0 + 0.35) / (st.hit - st.t0 + 0.35));
    const e = 1 - Math.pow(1 - u, 1.3);
    const az = lerp(14, baz, e), el = lerp(27, bel, e);
    U.uHead.value.set(az, el); U.uTail.value.set(24, 40); U.uHeadR.value = 1.0 + 0.9 * u;
    U.uHot.value = 1 - smooth(st.hit, st.hit + 0.12, v);
    U.uTrail.value = 1 - smooth(st.hit + 2, st.hit + 4, v); U.uAge.value = Math.max(0, v - st.t0 + 1.0); U.uTrailW.value = 0.8;
    s.lookEl = el;
    const tb = v - st.hit;
    // the airburst: a fireball ~500 m wide that cools to dark smoke and rises
    if (tb > 0) {
      fx.ball.visible = true;
      const r = 210 * (1 - Math.exp(-tb / 0.2)) + 30 * tb;
      fx.ball.position.set(BURST.x, BURST.y + 30 * Math.max(0, tb - 0.5) ** 1.2, BURST.z);
      fx.ball.scale.set(r, r * 0.92, r);
      const m = fx.ball.material.uniforms;
      m.uMode.value = 1; m.uHeat.value = 1.15 * Math.exp(-tb / 1.1); m.uA.value = 1 - smooth(1.0, 2.6, tb); m.uLump.value = 2.2; m.uTop.value = 1.4;
      // it cools into a dark cloud that boils up
      const sk = smooth(0.7, 1.6, tb);
      // (a ring of rolling smoke that spreads and rises, lit orange underneath at first)
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2 + 0.3 * Math.sin(k * 2.7), R1 = r * (0.55 + 0.3 * smooth(0.8, 5, tb)) * (0.85 + 0.3 * ((k * 7) % 3) / 2);
        const yy = BURST.y + 45 * tb + 30 * Math.sin(a * 3 + 1.0) + 40 * Math.max(0, tb - 1.2);
        smoke.puff(BURST.x + Math.cos(a) * R1, yy, BURST.z + Math.sin(a) * R1 * 0.7, r * 0.42 + 18 * tb, 0.7 * sk, 0.42, 0.5 * Math.exp(-tb / 1.2), (k * 0.137) % 1);
      }
      for (let k = 0; k < 5; k++) smoke.puff(BURST.x + (k - 2) * 25, BURST.y + 45 * tb + 60 + 40 * Math.max(0, tb - 1.2), BURST.z, r * 0.5 + 12 * tb, 0.6 * sk, 0.5, 0.35 * Math.exp(-tb / 1.2), (k * 0.31) % 1);
    }
    flash = tb > 0 ? Math.exp(-tb / 0.3) * 1.0 : 0;
    U.uFlashP.value.set(baz, bel);
    dirAE(tb > 0 ? baz : az, tb > 0 ? bel : el, frontDir);
    frontI = tb < 0 ? 0.8 + 1.2 * u : 0.6 + 3.6 * Math.exp(-tb / 0.5);
    frontCol.setRGB(1, 0.8 + 0.15 * Math.exp(-Math.max(tb, 0) / 0.6), 0.55 + 0.35 * Math.exp(-Math.max(tb, 0) / 0.6));
    // the shock: a dust ring racing out over the city; every tower near ground zero goes down
    const R = ring2(v);
    if (R > 0) {
      fx.ring.visible = true; fx.ring2.visible = true;
      const h = 55 + 0.09 * R;
      fx.ring.position.set(GZ.x, 0, GZ.z); fx.ring.scale.set(R, h, R);
      fx.ring2.position.set(GZ.x, 0, GZ.z); fx.ring2.scale.set(Math.max(1, R - 160), h * 2.2 + 60, Math.max(1, R - 160));
      for (const [mesh, a] of [[fx.ring, 0.95], [fx.ring2, 0.55]]) { const m = mesh.material.uniforms; m.uMode.value = 0; m.uA.value = a; m.uLump.value = 1.6; m.uTop.value = 1; }
      LU.uFront.value = R; LU.uKind.value = 1;
      dustSky = smooth(900, 2400, R) * 0.6;
    }
    carsStop = st.hit + 0.3;
    BLD.forEach((b, k) => {
      const ta = tRing2(b.g);
      let ang = 0, sink = 0, dust = 0;
      if (v > ta) {
        const near = 1 - smooth(900, 2000, b.g);
        if (b.h > 45) {
          const tF = ta + 0.15 + 0.5 * b.seed, dur = 2.3 + 0.004 * b.h;
          const f = clamp((v - tF) / dur);
          ang = (Math.PI * 0.46) * Math.pow(f, 1.7) * near; sink = 0.3 * f * near;
        } else sink = (0.55 * near + 0.15) * smooth(ta, ta + 0.7, v);
        dust = smooth(ta, ta + 0.4, v) * (0.4 + 0.6 * near);
      }
      set(k, ta, ang, sink, 0, dust);
    });
    // dust from each tower as it goes down
    for (const t of TOWERS) {
      const b = t.b, ta = tRing2(b.g); if (v < ta || b.g > 2000) continue;
      const age = v - ta, near = 1 - smooth(900, 2000, b.g);
      for (let k = 0; k < 3; k++) {
        const T = 2.6, a = ((age + k * T / 3 + b.seed * T) % T);
        if (age < a) continue;
        smoke.puff(b.x + (b.x - GZ.x) * 0.02 * a, b.y + 10 + 18 * a, b.z + 8 * a, (16 + b.h * 0.12) * (0.6 + a * 0.5), 0.75 * near * (1 - a / T), 0.62, 0, (b.seed + k * 0.3) % 1);
      }
    }
    // glass glinting as the front passes each building
    for (const g of GLINT) {
      const b = BLD[g.i], tb2 = tRing2(b.g) - 0.15 + g.dl * 0.5, age = v - tb2;
      if (age < 0 || age > 1.2) continue;
      const a = Math.exp(-age / 0.5) * (0.5 + 0.5 * Math.sin(age * 40 + g.ph * 20));
      glows.add(g.x + g.vx * age, g.y - 4.9 * age * age, g.z + 2 * age, 3 + b.dist * 0.004, 3.2 * a, 3.2 * a, 3.4 * a);
    }
    kickAt(st.hit, 0.6); kickAt(st.you, 1.0);
    s.shake = smooth(st.you - 1.5, st.you, v) * 0.6;
  }

  else if (st.key === 'tower') {
    // a rock as big as a skyscraper (drawn 1.6x), coming in low from beyond the bay, white-hot in front
    const A = dirAE(15, 14);                          // (from ground zero toward where it comes from: beyond, a little right, 21 deg up)
    const u = clamp((v - st.t0 + 0.3) / (st.hit - st.t0 + 0.3));
    const L = 9000 * Math.pow(1 - u, 1.1);
    const size = 340 * 2.2;
    const p = tmpV.copy(GZV).addScaledVector(A, L + size * 0.5);
    if (v < st.hit + 0.05) {
      fx.rock.visible = true;
      fx.rock.position.copy(p); fx.rock.scale.setScalar(size * 0.5);
      fx.rock.rotation.set(0.4 + v * 0.3, 1.1 + v * 0.2, 0.3);
      leadFront(A, p, fx.RU.uFront.value); fx.RU.uHot.value = 1; fx.RU.uTime.value = v;
      const [az, el] = azel(p, CAM);
      const far = azel(tmpV.copy(GZV).addScaledVector(A, L + 26000), CAM);
      U.uHead.value.set(az, el); U.uTail.value.set(far[0], far[1]); U.uHeadR.value = 0.9 * (size / p.distanceTo(CAM)) / DEG;
      U.uHot.value = 0.55; U.uTrail.value = 1; U.uAge.value = 1.2; U.uTrailW.value = 1.2 * (size / p.distanceTo(CAM)) / DEG + 0.5;
      // the air blazing round it
      glows.add(p.x - A.x * size * 0.6, p.y - A.y * size * 0.6, p.z - A.z * size * 0.6, size * 2.6, 1.6, 0.85, 0.35);
      s.lookEl = el;
      dirAE(az, el, frontDir); frontI = 0.6 + 1.6 * u; frontCol.setRGB(1, 0.75, 0.45);
    } else { U.uTrail.value = 1 - smooth(st.hit, st.hit + 1.5, v); s.lookEl = 4; }
    const tb = v - st.hit;
    // the crater opens: a curtain of rock and dust rising from its growing edge; the city inside goes into the pit
    if (tb > 0) {
      const rb = Math.max(1, crater3(v));
      fx.curtain.visible = true;
      fx.curtain.position.set(GZ.x, 0, GZ.z); fx.curtain.scale.set(rb, rb * 0.95 + 120, rb);
      const m = fx.curtain.material.uniforms; m.uMode.value = 0; m.uA.value = 1; m.uLump.value = 1.4; m.uTop.value = 0.8;
      LU.uCrater.value = rb;
      const Rs = Math.max(surge3(v), rb + 50);
      fx.ring.visible = true; fx.ring.position.set(GZ.x, 0, GZ.z); fx.ring.scale.set(Rs, 90 + 0.12 * Rs, Rs);
      const mr = fx.ring.material.uniforms; mr.uMode.value = 0; mr.uA.value = 0.95; mr.uLump.value = 1.6; mr.uTop.value = 1;
      LU.uFront.value = Rs; LU.uKind.value = 1;
      flash = Math.exp(-tb / 0.3) * 1.2; U.uFlashP.value.set(GZ_AZ, 0);
      dirAE(GZ_AZ, 3, frontDir); frontI = 2.8 * Math.exp(-tb / 0.6); frontCol.setRGB(1, 0.85, 0.65);
      dustSky = smooth(2.5, st.you - st.hit, tb) * 0.75;
      // the column of dust over the crater
      for (let k = 0; k < 10; k++) {
        const T = 3.5, a = ((tb + k * T / 10) % T);
        if (tb < a) continue;
        smoke.puff(GZ.x + Math.sin(k * 2.1) * 90, 150 + 420 * a, GZ.z + Math.cos(k * 1.7) * 90, 90 + 70 * a, 0.75 * (1 - a / T), 0.42, 0, (k * 0.37) % 1);
      }
      // big blocks thrown out toward you on arcs
      for (const c of CHUNK) {
        const t = tb - c.dl; if (true) continue;
        const dx = Math.sin(c.a + Math.PI) * 0, hz = c.sp * Math.cos(c.up * 1.2) * t, hy = c.sp * Math.sin(c.up * 1.2) * t - 4.9 * 9 * t * t;
        const x = GZ.x + Math.sin(c.a) * hz, z = GZ.z - Math.cos(c.a) * hz, y = 50 + hy;
        if (y < 0) continue;
        smoke.puff(x, y, z, c.s * 0.45, 0.9, 0.12, 0, c.seed);
      }
    }
    carsStop = st.hit + 0.3;
    BLD.forEach((b, k) => {
      const rb = crater3(v);
      let ang = 0, sink = 0, dust = 0;
      if (tb > 0 && b.g < rb + 30) sink = 1;
      else {
        const ta = tSurge3(b.g);
        if (v > ta) {
          if (b.h > 40) { const f = clamp((v - ta - 0.1 - 0.4 * b.seed) / (2.0 + 0.004 * b.h)); ang = Math.PI * 0.46 * Math.pow(f, 1.7); sink = 0.3 * f; }
          else sink = 0.6 * smooth(ta, ta + 0.6, v);
          dust = smooth(ta, ta + 0.4, v);
        }
      }
      set(k, tb > 0 ? tSurge3(b.g) : 0, ang, sink, 0, dust);
    });
    kickAt(st.hit, 0.8); kickAt(st.hit + 0.5, 0.5); kickAt(st.you, 1.0);
    s.shake = (tb > 0 ? Math.exp(-tb / 1.2) * 0.8 : 0) + smooth(st.you - 1.5, st.you, v) * 0.7;
  }

  else if (st.key === 'everest') {
    // a rock 6 miles wide at its real size, coming in at 25 deg from beyond the bay at ~20 km/s; its lowest point lands on ground zero
    const A = dirAE(-13, 13);
    const u = clamp((v - st.t0 + 0.25) / (st.hit - st.t0 + 0.25));
    const L = 40000 * Math.pow(1 - u, 1.05);
    const Rr = 5000;
    const tb = v - st.hit;
    const p = tmpV.set(GZ.x, Rr, GZ.z).addScaledVector(A, L);
    if (tb > 0) p.y -= Math.min(tb, 2.5) * 900;          // (it ploughs on into the ground, inside its own fire)
    fx.rock.visible = tb < 2.5;
    fx.rock.position.copy(p); fx.rock.scale.setScalar(Rr);
    fx.rock.rotation.set(0.2 + v * 0.05, 0.6, 0.1);
    leadFront(A, p, fx.RU.uFront.value); fx.RU.uHot.value = 0.7 + 0.3 * u; fx.RU.uTime.value = v;
    const [az, el] = azel(p, CAM);
    s.lookEl = Math.min(el + 8, 40);
    const far = azel(tmpV2.set(GZ.x, Rr, GZ.z).addScaledVector(A, L + 60000), CAM);
    U.uHead.value.set(az, el); U.uTail.value.set(far[0], far[1]); U.uHeadR.value = Math.asin(Math.min(1, Rr / p.distanceTo(CAM))) / DEG * 1.05;
    U.uHot.value = 0.0; U.uTrail.value = 1; U.uAge.value = 0.8; U.uTrailW.value = U.uHeadR.value * 0.9;
    // the sky catches fire as it comes in, and stays on fire
    fireSky = smooth(st.hit - 1.2, st.hit + 0.2, v);
    U.uFireP.value.set(az, Math.max(el, 5));
    frontDir.set(0, 0, 0); dirAE(az, Math.max(el, 4), frontDir);
    frontI = 0.6 + 1.4 * u + (tb > 0 ? 1.4 * Math.exp(-tb / 0.8) : 0);
    frontCol.setRGB(1, 0.62, 0.3);
    sunDim = smooth(st.hit - 1.5, st.hit, v) * 0.85;
    flash = tb > 0 ? Math.exp(-tb / 0.35) * 1.1 : 0; U.uFlashP.value.set(GZ_AZ, 2);
    // its fireball: a dome of fire rising over the city and rolling out toward you (slowed down a lot)
    if (tb > 0) {
      const Rf = dome4(v);
      fx.dome.visible = true; fx.dome.position.set(GZ.x, 0, GZ.z); fx.dome.scale.set(Rf * 1.02, Rf * 1.25 + 400 * smooth(0, 1, tb), Rf * 1.02);
      const md = fx.dome.material.uniforms; md.uMode.value = 1; md.uHeat.value = 1.0; md.uA.value = 1; md.uLump.value = 0.9; md.uTop.value = 1.6;
      fx.ring.visible = true; fx.ring.position.set(GZ.x, 0, GZ.z); fx.ring.scale.set(Rf + 60, 160 + 0.25 * Rf, Rf + 60);
      const mr = fx.ring.material.uniforms; mr.uMode.value = 1; mr.uHeat.value = 0.95; mr.uA.value = 1; mr.uLump.value = 1.5; mr.uTop.value = 1;
      LU.uMelt.value = Rf * 0.92; LU.uFront.value = Rf; LU.uKind.value = 0; LU.uScorch.value = Rf + 900;
    }
    burnAll = smooth(st.hit - 0.8, st.hit + 0.6, v);
    carsStop = st.hit;
    BLD.forEach((b, k) => {
      let sink = 0, burn = burnAll * (b.dist < 4500 ? 0.5 : 0.2), ang = 0;
      if (tb > 0) {
        const ta = tDome4(b.g);
        burn = Math.max(burn, smooth(ta - 0.6, ta, v));
        if (v > ta) { sink = smooth(ta, ta + 0.5, v); ang = b.h > 40 ? 0.9 * smooth(ta - 0.1, ta + 0.4, v) : 0; }
      }
      set(k, tb > 0 ? tDome4(b.g) - 0.4 : st.hit - 0.3, ang, sink, burn, 0);
    });
    kickAt(st.hit, 1.0); kickAt(st.you, 1.0);
    s.shake = (tb > 0 ? 0.7 : smooth(st.hit - 1, st.hit, v) * 0.4) + smooth(st.you - 1.5, st.you, v) * 0.5;
  }

  else {
    // ---------- the biggest two: a world-size ball coming down on downtown ----------
    const moon = st.key === 'moon';
    const Rb = moon ? R_MOON : R_CERES;
    const A = dirAE(moon ? 2 : -4, moon ? 7 : 6);
    const C = bodyCentre(st, v, Rb, A, moon ? 15 : 12, tmpV);
    const zb = v >= st.hit ? gapAt(st, v) : C.y - Rb - GZ.y;
    fx.body.visible = true;
    fx.body.position.copy(C); fx.body.scale.setScalar(Rb);
    fx.BU.uC.value.copy(C); fx.BU.uR.value = Rb;
    fx.body.updateMatrixWorld();
    const B = fx.BU;
    B.uMoon.value = moon ? 1 : 0;
    const toCam = tmpV2.copy(CAM).sub(C).normalize();
    B.uToCam.value.copy(toCam);
    // (its face as you see it: x to your right, y up)
    const toBody = toCam.clone().negate();
    B.uRight.value.crossVectors(toBody, new THREE.Vector3(0, 1, 0)).normalize();
    B.uUp.value.crossVectors(B.uRight.value, toBody).normalize();
    const dist = C.distanceTo(CAM);
    const ang = Math.asin(Math.min(1, Rb / dist)) / DEG;
    const [az, el] = azel(C, CAM);
    s.lookEl = Math.min(el + ang * 0.4, 45);
    // the air it rams glows on its underside once it is low enough to be in the air
    B.uHotH.value = 1100; B.uGlow.value = smooth(st.hit - 0.9, st.hit, v);
    B.uBelow.value = (moon ? 0 : 0.25 * smooth(st.hit - 1.0, st.hit, v)) + 0.7 * smooth(st.hit, st.hit + 1.5, v);
    B.uCrack.value = moon ? smooth(st.hit - 1.6, st.hit + 2.5, v) : smooth(st.hit + 1, st.you, v) * 0.6;
    B.uHazeK.value = 0.16 * (1 - smooth(st.hit - 1.5, st.hit, v));
    // as it closes in it shuts out the sky: the day goes dim, lit from below by the burning air
    sunDim = smooth(st.t0, st.hit, v) * 0.55;
    const tb = v - st.hit;
    dirAE(GZ_AZ, 3, frontDir);
    frontI = smooth(st.hit - 0.8, st.hit, v) * 1.6 + (tb > 0 ? 0.6 : 0);
    frontCol.setRGB(1, 0.6, 0.28);
    flash = tb > 0 ? Math.exp(-tb / 0.3) * 1.0 : 0; U.uFlashP.value.set(GZ_AZ, 0);
    // the Moon's pull heaps the bay up toward it before it lands
    if (moon) LU.uTide.value = 650 * smooth(st.t0 + 0.2, st.hit + 0.3, v) * (1 - smooth(st.hit + 0.6, st.hit + 1.6, v));
    GU.uTideP.value.set(GZ.x - 900, GZ.z - 3600); GU.uTideR.value = 2600;
    // the fire blowing out from under it, across the city to you; the ground melting behind it
    const Rf = blow(st, v);
    if (tb > 0) {
      fx.ring.visible = true; fx.ring.position.set(GZ.x, 0, GZ.z);
      const hgt = zb + 60;
      fx.ring.scale.set(Rf + 40, hgt, Rf + 40);
      // embers and burning debris blown out ahead of it, toward you
      for (let k = 0; k < 160; k++) {
        const T = 1.4, ph0 = (k * 0.6180339) % 1, a = ((v - st.hit) / T + ph0) % 1;
        const ang = (k * 2.39996) % (Math.PI * 2) * 0.12 - 0.06 + Math.atan2(-GZ.x, -GZ.z);
        const rr = Rf + 40 + a * Math.min(700, 2440 - Rf);
        const ex = GZ.x + Math.sin(ang) * rr, ez = GZ.z + Math.cos(ang) * rr;
        const ey = 8 + (zb * 0.7) * ((k * 0.377) % 1) + 30 * a;
        const f = (1 - a) * smooth(0, 0.4, v - st.hit);
        glows.add(ex, ey, ez, 6 + 10 * ((k * 0.71) % 1), 2.6 * f, 0.9 * f, 0.2 * f);
      }
      const mr = fx.ring.material.uniforms; mr.uMode.value = moon ? 2 : 1; mr.uHeat.value = 1.0; mr.uA.value = 1; mr.uLump.value = 2.2; mr.uTop.value = 1.6;
      LU.uMelt.value = moon ? Rf * 1.25 + 400 : Rf * 0.8; LU.uScorch.value = Rf + 1500;
    }
    // the bay: boiling under the Texas-size one, thrown up under the Moon
    LU.uBoil.value = moon ? smooth(st.hit, st.hit + 1, v) : smooth(st.hit - 1.1, st.hit + 0.4, v);
    // steam boiling off the bay (left of downtown and behind it)
    if (!moon && LU.uBoil.value > 0.01) for (const sp of STEAM) {
      const T = 2.6, a = ((v - st.hit + 1.1) * 1.0 + sp.ph * T) % T;
      if (v - st.hit + 1.1 < a) continue;
      smoke.puff(sp.x + 20 * a, 20 + Math.min(240 * a * sp.sp, Math.max(40, (st.hit < v ? gapAt(st, v) : 350) - 60)), sp.z, sp.r * (0.5 + 0.7 * a), 0.6 * LU.uBoil.value * (1 - a / T) * (1 - 0.7 * smooth(st.hit + 0.5, st.hit + 2.0, v)), 1.0, 0.12, sp.seed);
    }
    burnAll = smooth(st.hit - 1.0, st.hit + 0.5, v);
    carsStop = st.hit;
    const R2 = 2 * Rb;
    BLD.forEach((b, k) => {
      // pressed flat from the top: nothing stands taller than its underside
      const under = zb + (b.g * b.g) / R2 - b.y;
      let sink = b.h > under ? clamp(1 - under / b.h) : 0;
      const ta = tBlow(st, b.g);
      if (tb > 0 && v > ta) sink = Math.max(sink, smooth(ta, ta + 0.4, v));
      set(k, st.hit - 0.4, 0, sink, Math.max(burnAll * 0.7, tb > 0 ? smooth(ta - 0.8, ta, v) : 0), 0);
    });
    kickAt(st.hit, 1.0); kickAt(st.hit + 1.2, 0.6); kickAt(st.you, 1.0);
    s.shake = smooth(st.hit - 0.6, st.hit, v) * 0.6 + smooth(st.you - 2, st.you, v) * 0.6;
  }

  // ---------------- the camera ----------------
  const cam = camAt(v, s);
  const sh = (kick * 0.8 + 0.02 + 1.4 * s.shake) * 0.012 * cam.fov / 60;
  cam.pitch += wobble(v * 43, 3) * sh - kick * 0.35 * DEG;
  cam.yaw += wobble(v * 47, 4) * sh;
  cam.roll += wobble(v * 29, 5) * sh * 0.8;
  camera.position.copy(cam.pos);
  camera.rotation.set(cam.pitch, cam.yaw, cam.roll);
  camera.fov = cam.fov * (1 - 0.03 * kick);
  if (params.has('top')) { camera.position.set(0, 4200, -1700); camera.rotation.set(-Math.PI / 2, 0, 0); camera.fov = 70; }
  if (params.has('side')) { camera.position.set(2600, 150, -2400); camera.rotation.set(0, Math.PI / 2, 0); camera.fov = 40; }
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // ---------------- the city ----------------
  BLD.forEach((b, k) => {
    const q = BS[k] || [0, 0, 0, 0, 0];
    city.place(k, b, q[1], q[2]);
    city.set(k, q[0], q[3], q[4]);
  });
  city.commit(v);
  city.traffic(v, st.t0, carsStop);

  // ---------------- light ----------------
  const lc = new THREE.Vector3(0, LOW_Y, -10);
  sunL.position.copy(SUN).multiplyScalar(200).add(lc);
  sunL.target.position.copy(lc); sunL.target.updateMatrixWorld();
  sunL.intensity = 2.6 * (1 - sunDim) * (1 - 0.5 * dustSky * 0);
  frL.position.copy(frontDir).multiplyScalar(300).add(lc);
  frL.target.position.copy(lc); frL.target.updateMatrixWorld();
  frL.color.copy(frontCol);
  frL.intensity = Math.min(frontI, 3.0) + flash * 1.0;
  frL.castShadow = frL.intensity > 0.05;
  hemi.intensity = 1.15 * (1 - 0.55 * sunDim) + 0.3 * fireSky;
  hemi.color.setRGB(0.66, 0.77, 1.0).lerp(tmpC.setRGB(1.0, 0.45, 0.2), fireSky);
  hemi.groundColor.setRGB(0.55, 0.5, 0.44).lerp(tmpC.setRGB(0.6, 0.25, 0.1), Math.max(fireSky, burnAll * 0.6));
  // the same light for the shader-drawn far things
  LU.uTime.value = v;
  LU.uSunDir.value.copy(SUN);
  LU.uSunC.value.setRGB(1.0, 0.94, 0.86).multiplyScalar(2.6 * (1 - sunDim) / Math.PI * 1.15);
  LU.uSkyC.value.copy(hemi.color).multiplyScalar(hemi.intensity / Math.PI * 1.1);
  LU.uGndC.value.copy(hemi.groundColor).multiplyScalar(hemi.intensity / Math.PI * 0.9);
  LU.uFrontDir.value.copy(frontDir);
  LU.uFrontC.value.copy(frontCol).multiplyScalar(frL.intensity / Math.PI);
  const hz = tmpC.setRGB(0.62, 0.72, 0.86).lerp(new THREE.Color(0.55, 0.46, 0.38), dustSky).lerp(new THREE.Color(0.42, 0.14, 0.05), fireSky * 0.8);
  hz.multiplyScalar(1 - 0.5 * sunDim * (1 - fireSky));
  LU.uHazeC.value.copy(hz);
  LU.uHazeD.value = lerp(26000, 7000, dustSky) * (1 - 0.35 * fireSky);
  LU.uSkyHi.value.setRGB(0.07, 0.22, 0.62).lerp(new THREE.Color(0.5, 0.12, 0.03), fireSky).multiplyScalar(1 - 0.6 * sunDim);
  LU.uSkyLo.value.setRGB(0.56, 0.7, 0.88).lerp(new THREE.Color(1.0, 0.4, 0.1), fireSky).multiplyScalar(1 - 0.5 * sunDim);
  renderer.toneMappingExposure = 1.0 - 0.2 * Math.min(1, flash) - 0.15 * fireSky;

  // ---------------- the sky ----------------
  sky.mesh.position.copy(camera.position);
  U.uT.value = v; U.uSun.value.copy(SUN);
  U.uFlash.value = flash; U.uFire.value = fireSky; U.uDust.value = dustSky; U.uDim.value = sunDim * 0.8;
  U.uHazeC.value.copy(hz);

  // ---------------- people, fires, smoke ----------------
  glows.view(camera);
  people.frame(v, s);
  // fires across the city once it burns
  if (burnAll > 0.02) {
    for (let k = 0; k < TOWERS.length; k += 3) {
      const b = TOWERS[k].b; if (b.dist > 4000) continue;
      const f = burnAll;
      glows.add(b.x, b.y + b.h * 0.3, b.z + b.d * 0.5 + 2, 18 + b.h * 0.12, 1.3 * f, 0.45 * f, 0.08 * f);
    }
  }
  smoke.end(); glows.end(); fire.end();
  fire.mat.uniforms.uTime.value = v;
  smoke.mat.uniforms.uTime.value = v;
  smoke.mat.uniforms.uLight.value.setRGB(1.4, 1.35, 1.3).lerp(tmpC.setRGB(1.8, 0.8, 0.4), fireSky);
  smoke.mat.uniforms.uSun.value.copy(SUN);

  // ---------------- post ----------------
  bloom.strength = 0.22 + 0.2 * kick + 0.15 * Math.min(1, flash);
  finish.uniforms.uTime.value = v;
  finish.uniforms.uAb.value = kick * 0.6 + s.shake * 0.4;
  finish.uniforms.uBlur.value = window.__cover ? 0 : kick * 0.02;
  finish.uniforms.uWhite.value = window.__cover ? 0 : white;
  finish.uniforms.uTitle.value = window.__cover ? 1.1 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : 1 - smooth(0.5, 1, white);
  s.hide = smooth(0.5, 1.0, white);
  overlay(v, s);
  return s;
}

let comp = null;
function renderFrame(t) {
  const tail = t - (VIDEO_DURATION - LOOP);
  if (tail >= 0) update(t - VIDEO_DURATION, WHITE_CLEAR(tail));
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
  if (!params.has('dom')) {
    const { makeCompositor } = await import('./compose.js');
    comp = await makeCompositor(renderer.domElement, stage);
  }
  for (const t of [44, 36, 28, 20, 12, 6, 2, 0]) renderFrame(t);
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, sky, state, update, LU, fx, city, comp: () => comp };
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

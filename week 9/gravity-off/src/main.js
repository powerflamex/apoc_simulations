// "What if gravity turned off?" — the time ladder. Five stops, each the same start played to the moment gravity comes
// back: 5 SECONDS (the square at real speed), 1 MINUTE (you above the rooftops, the fountain a half-mile column, the
// air leaving), 10 MINUTES (2.5 miles up, black sky, the city far below), 1 HOUR (79 miles up, the bare sea floors, the
// oceans lifted off), 1 DAY (the whole Earth in a flat cloud of everything flung off it, the Sun blowing apart). The
// camera stays close to you; the world changes behind you. The square, the city and you are one scene; in space only
// you are drawn from it (layer 1), over the Earth's own scene (space.js). Post: bloom, a soft vignette, darkening
// behind the text, the white.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky, skyColors } from './sky.js';
import { makeGround, GU } from './ground.js';
import { makeCity, CU, hazed } from './city.js';
import { makeFountain, makeBlobs } from './fountain.js';
import { makePool } from './pool.js';
import { makeProps } from './props.js';
import { makeTraffic } from './traffic.js';
import { makeSmoke } from './smoke.js';
import { makeCrowd } from './crowd.js';
import { makeOverlay } from './overlay.js';
import { makeYou } from './you.js';
import { ck, camPos, SPACE_YOU } from './camera.js';
import { PEOPLE, personAt, poseFloat, FIGS, figAt, flail, setAnim } from './people.js';
import { BASIN } from './layout.js';
import { state, VIDEO_DURATION, LOOP, captionAt, setGravityBack, STOPS, T_SPLASH, V_WHITE, youAt, G, R_E, heightAt } from './timeline.js';
import { makeSpace, youInertial } from './space.js';
import { makeFarCity } from './farcity.js';
import { CARS, carAt } from './traffic.js';
import { smooth, clamp, wobble, rng, lerp } from './util.js';

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
const camera = new THREE.PerspectiveCamera(60, W / H_PX, 0.15, 6000);
scene.add(camera);
const plainMat = (color, rough = 0.9, extra = {}) => hazed(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };
const ctx = { plainMat, glowMat: (c) => new THREE.MeshBasicMaterial({ color: c }), shadowy };
const sky = makeSky();
scene.add(sky.mesh);
makeGround(scene);
makeCity(scene);
const far = makeFarCity(scene);
const space = makeSpace();
const fountain = makeFountain(scene, ctx);
const pool = makePool(scene, ctx);
const props = makeProps(scene, ctx);
const traffic = makeTraffic(scene, ctx);
const smoke = makeSmoke(scene, 1400);
const crowd = makeCrowd(scene, PEOPLE.length + pool.count, plainMat(0xffffff, 0.82), { castShadow: true });
PEOPLE.forEach((p) => crowd.color(p.i, p.shirt, p.pants, p.skin, p.hair, p.sleeves));
{
  const R = rng(55);
  const SH = [0x2a9d8f, 0xe63946, 0xf4a261, 0x264653, 0xe9c46a, 0x8ecae6, 0xb5838d, 0x1d1d1d, 0xffffff];
  for (let k = 0; k < pool.count; k++) crowd.color(PEOPLE.length + k, SH[k % SH.length], k < 5 ? 0x1d3a6a : 0x2b2d42, [0xf1c8a6, 0xc68a62, 0x9a6440, 0xe0ac86][k % 4], 0x2e2018, false);
}
const sunL = new THREE.DirectionalLight(0xfff3e2, 3.0);
sunL.castShadow = true;
sunL.shadow.mapSize.set(4096, 4096);
sunL.shadow.bias = -0.0004; sunL.shadow.normalBias = 0.04;
Object.assign(sunL.shadow.camera, { left: -48, right: 48, top: 60, bottom: -60, near: 10, far: 700 });
scene.add(sunL, sunL.target);
sunL.layers.enable(1);
const hemi = new THREE.HemisphereLight(0x9cc0ff, 0x9a8a78, 1.2);
scene.add(hemi);
hemi.layers.enable(1);

// ---- the detailed figures: each in a holder at its hips, so it turns about its middle ----
const FIG = FIGS.map((F) => {
  const fig = makeYou(scene, F.colors);
  const holder = new THREE.Group();
  scene.add(holder);
  scene.remove(fig.root);
  holder.add(fig.root);
  fig.root.position.set(-0.105, -0.9, 0);
  fig.root.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = true; } });
  return { F, fig, holder, st: {} };
});
const ME = FIG[0];
// you are drawn in every stop (layer 1 is all that's drawn from this scene in space)
ME.holder.traverse((o) => o.layers.enable(1));

// ---- the splash when you land in the basin: a crown of water thrown up and out (gravity's back) ----
const splash = makeBlobs(scene, 1400);
const DRIFTER = CARS.find((c) => c.drifter), drift9 = carAt(DRIFTER, 9, {});
const CROWN = [];
{
  const R = rng(7070);
  for (let k = 0; k < 260; k++) {
    const a = R() * Math.PI * 2, sp = 1.5 + 5.5 * R(), up = 2.5 + 6 * R() * R();
    CROWN.push({ a, sp, up, r: 0.02 + 0.07 * R() * R(), d: 0.15 + 0.35 * R(), t0: (R() - 0.3) * 0.06 });
  }
}
const overlay = makeOverlay();

// ---- post ----
const rt = new THREE.WebGLRenderTarget(W, H_PX, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H_PX);
const spacePass = new RenderPass(space.scene, space.camera);
composer.addPass(spacePass);
const mainPass = new RenderPass(scene, camera);
composer.addPass(mainPass);
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv);
    if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 16.0), 1.0); }`,
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H_PX / 2), 0.22, 0.35, 1.1);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.2 }, uTitle: { value: 0 }, uCounter: { value: 0 }, uCap: { value: 0 }, uSpray: { value: 0 }, uWhite: { value: 0 }, uSP: { value: new THREE.Vector2(0.5, 0.25) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter; uniform float uCap; uniform float uSpray; uniform float uWhite; uniform vec2 uSP;
    varying vec2 vUv;
    float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
    void main() {
      vec2 uv = vUv;
      const vec2 AS = vec2(${(W / H_PX).toFixed(4)}, 1.0);
      // the spray hitting the lens: water drops (round, refracting) landing first near the splash, then sheets of white
      vec2 q = (uv - uSP) * AS;
      float dist = length(q);
      float drops = 0.0; vec2 warp = vec2(0.0);
      if (uSpray > 0.0) {
        for (int k = 0; k < 3; k++) {
          float sc = 9.0 + 7.0 * float(k);
          vec2 g = uv * AS * sc + float(k) * 3.7;
          vec2 id = floor(g), f = fract(g) - 0.5;
          float hh = h21(id + float(k) * 11.0);
          vec2 c = (vec2(h21(id + 1.3), h21(id + 2.7)) - 0.5) * 0.5;
          float r = 0.18 + 0.22 * h21(id + 5.1);
          float arrive = hh * 0.85 + 0.35 * length((id / sc / AS) - uSP);
          float on = smoothstep(arrive, arrive + 0.08, uSpray * 1.25);
          float d = length(f - c);
          float m = (1.0 - smoothstep(r * 0.85, r, d)) * on;
          drops = max(drops, m);
          warp += (f - c) * m * 0.06 / sc;
        }
        uv -= warp;
      }
      vec3 col = texture2D(tDiffuse, uv).rgb;
      col = mix(col, col * 1.15 + 0.12, drops * 0.75);
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.12);
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.45 * exp(-pow((vUv.y - 0.86) / 0.07, 2.0));
      col *= 1.0 - uCounter * 0.4 * exp(-pow((vUv.y - 0.725) / 0.075, 2.0));
      col *= 1.0 - uCap * 0.45 * exp(-pow((vUv.y - 0.125) / 0.045, 2.0));
      // sheets of white spray rolling over the lens from the splash out
      float n = n2(vUv * AS * 7.0 + uTime * 0.4) * 0.6 + n2(vUv * AS * 19.0 - uTime * 0.3) * 0.4;
      float cover = smoothstep(0.0, 0.25, uSpray * 1.7 - dist * 1.1 - (n - 0.5) * 0.7);
      col = mix(col, vec3(0.96, 0.98, 1.0), cover * 0.97 * step(0.001, uSpray));
      col = mix(col, vec3(0.97, 0.985, 1.0), uWhite);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);



const tmpC = new THREE.Color(), tv = new THREE.Vector3();
const C = (a) => tmpC.setRGB(a[0], a[1], a[2]);
const SUN_EL = 32, SUN_AZ = 200;
const SUNDIR = (() => { const el = SUN_EL * DEG, az = SUN_AZ * DEG; return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)); })();
const BLACK = new THREE.Color(0, 0, 0);
const P = {}, F0 = {}, pYou = new THREE.Vector3(), offL = new THREE.Vector3(), sunLoc = new THREE.Vector3();
function update(v, cover = -1) {
  const s = state(v);
  setGravityBack(s.T);
  const i = s.i, S = STOPS[i], t = s.t, mode = S.scene;
  const back = t > S.T;
  // the calm clock for limbs and tumbling in the time-lapses (real time from the stop's start)
  setAnim(i === 0 ? null : 5 + (v - S.v0));
  const fk = i === 0 ? undefined : (back ? smooth(S.on, S.on + 0.3, v) : 0);
  if (cover >= 0) s.title *= 1 - smooth(0.55, 1, cover);
  // ---- you and the other close figures ----
  for (const X of FIG) {
    const F = X.F;
    X.holder.visible = mode !== 'space' || X === ME;
    const f = figAt(F, t, X.st);
    const sit = F.mode === 'sit';
    X.fig.pose({ hipY: 0.9, footZ: 0, lean: 0, head: [(F.name === 'you' ? -0.12 : -0.35) + 0.1 * Math.sin(t * 5 + F.p[0]), 0.25 * Math.sin(t * 3.1 + F.p[2])], armsOut: 0.5, curl: 0.2 });
    flail(X.fig, F, t, (F.p[0] * 7.3 + F.p[2] * 3.1) % 1, fk);
    // hair drifting loose (no weight to hold it down)
    const ta = i === 0 ? t : 5 + (v - S.v0);
    X.fig.tufts.forEach((h) => { const a = h.userData.a; h.rotation.set(-0.75 + 0.3 * Math.sin(ta * 2.1 + a * 3) * smooth(0, 1, t), 0, a * 0.55 + 0.25 * Math.sin(ta * 1.6 + a * 5) * smooth(0, 1, t)); });
    // landed (you in the water): knees up, arms out wide
    if (f.landed && i === 0) {
      const k = smooth(0, 0.12, t - f.tl);
      X.fig.legs.forEach((L) => { L.hip.rotation.x = lerp(L.hip.rotation.x, -1.3, k); L.knee.rotation.x = lerp(L.knee.rotation.x, 1.6, k); });
    }
    if (mode === 'space' && X === ME) {
      // in space you float where the camera expects you, turning slowly
      X.holder.position.set(SPACE_YOU.x, SPACE_YOU.y + 0.9, SPACE_YOU.z);
      X.holder.rotation.set(0.25 * Math.sin(v * 0.3), 0.3 + 0.15 * Math.sin(v * 0.21), 0.12 * Math.sin(v * 0.37), 'YXZ');
    } else {
      X.holder.position.set(f.x, f.y + (sit ? 0.08 : 0.9) * F.s, f.z);
      X.holder.rotation.set(f.pitch, i === 0 ? f.yaw : F.yaw + 0.25 * Math.sin(v * 0.23 + F.p[0]), f.roll, 'YXZ');
    }
    X.holder.scale.setScalar(F.s);
    X.holder.updateMatrixWorld(true);
  }
  const me = mode === 'space' ? SPACE_YOU : youAt(t, F0);
  // ---- the camera ----
  const yaw = ck(3, v) * DEG, pitch = ck(4, v) * DEG;
  const pos = camPos(v, new THREE.Vector3());
  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  camera.position.copy(pos);
  camera.up.set(0, 1, 0);
  camera.lookAt(tv.copy(pos).add(dir));
  camera.fov = ck(5, v);
  // a drifting handheld float; a jolt as gravity snaps back
  const jolt = (v0, k, d = 0.6) => (v > v0 ? k * Math.exp(-(v - v0) / d) : 0);
  const shake = 0.0018 + jolt(S.on, 0.016, 0.5) + (i === 0 ? jolt(4.62 + (T_SPLASH - 5), 0.01) : 0);
  camera.rotation.x += wobble(v * 0.9, 3) * 0.006 + wobble(v * 23, 7) * shake;
  camera.rotation.y += wobble(v * 0.7, 4) * 0.006 + wobble(v * 27, 8) * shake;
  camera.rotation.z += wobble(v * 0.5, 6) * 0.01;
  camera.near = mode === 'city' ? 0.5 : 0.15;
  camera.far = mode === 'city' ? 60000 : mode === 'space' ? 200 : 9000;
  camera.layers.set(mode === 'space' ? 1 : 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  // ---- the sky, the light: the air thins (1 MINUTE) and is gone (10 MINUTES on) ----
  const air = s.air, airK = Math.pow(air, 0.55);
  const sc = skyColors(SUN_EL);
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  u.uSun.value.copy(SUNDIR);
  u.uZen.value.copy(C(sc.zen)).lerp(BLACK, 1 - airK);
  u.uHor.value.copy(C(sc.hor)).lerp(BLACK, 1 - Math.pow(air, 0.35));
  u.uGlow.value.copy(C(sc.glow)).multiplyScalar(airK);
  u.uSunCol.value.copy(C(sc.sun)).lerp(new THREE.Color(1, 0.97, 0.92), 1 - airK);
  u.uSunI.value = 1; u.uStars.value = 0; u.uT.value = i === 0 ? t * 2 : v * 0.5; u.uPx.value = (camera.fov * DEG) / H_PX;
  u.uCloud.value = 0.55 * smooth(0.55, 0.95, air); u.uCity.value = 0;
  CU.uSkyHi.value.copy(u.uZen.value); CU.uSkyLo.value.copy(u.uHor.value);
  CU.uHaze.value.copy(u.uHor.value); CU.uHazeD.value = air < 0.01 ? 1e8 : 1800 / air;
  CU.uSun.value.copy(SUNDIR); CU.uSunCol.value.copy(u.uSunCol.value);
  CU.uFog.value = 0; CU.uFogD.value = 140;
  CU.uTime.value = t;
  GU.uTime.value = t;
  GU.uWet.value = i === 0 ? smooth(6.4, 7.6, t) : 0;
  // the sunlight: whiter and harder as the air goes; the sky's fill goes with the air
  const lc = mode === 'plaza' ? new THREE.Vector3(me.x, 0, me.z - 15) : new THREE.Vector3(me.x, me.y, me.z);
  if (mode === 'space') {
    youInertial(Math.min(t, S.T), pYou);
    if (back) pYou.setLength(R_E + heightAt(i, t));
    space.sunLocal(pYou, sunLoc);
    sunL.position.copy(sunLoc).multiplyScalar(400).add(lc);
  } else sunL.position.copy(SUNDIR).multiplyScalar(400).add(lc);
  sunL.target.position.copy(lc); sunL.target.updateMatrixWorld();
  sunL.intensity = 3.4 + 0.8 * (1 - airK);
  sunL.color.copy(u.uSunCol.value).lerp(new THREE.Color(1, 1, 1), 0.45);
  // (with the sky gone dark, the shade is lit by the sunlit ground and walls round it: a grey bounce)
  hemi.intensity = mode === 'space' ? 0.9 : 1.1 + 0.8 * airK;
  hemi.color.copy(C(sc.zen)).multiplyScalar(2.2).lerp(new THREE.Color(0.75, 0.8, 0.95), 0.4).lerp(new THREE.Color(0.42, 0.41, 0.4), 1 - airK);
  if (mode === 'space') { hemi.color.setRGB(0.01, 0.01, 0.012); hemi.groundColor.setRGB(0.32, 0.28, 0.24).multiplyScalar(i === 3 ? 1 : 0.4); }
  else hemi.groundColor.setRGB(0.5, 0.46, 0.42);
  renderer.toneMappingExposure = 1.0;
  // ---- the world ----
  far.mesh.visible = mode === 'city';
  fountain.blobs.mesh.visible = mode === 'plaza';
  if (mode !== 'space') {
    if (mode === 'plaza') fountain.frame(t);
    props.frame(t);
    traffic.frame(t);
    PEOPLE.forEach((p) => { personAt(p, t, P); poseFloat(crowd, p.i, P); });
    pool.frame(i === 0 ? t : Math.min(t, 4.5), crowd, PEOPLE.length, (k, Q, tt, ph, pm) => {
      Object.assign(Q, { abL: 1.1 + 0.4 * Math.sin(tt * 2 + ph), abR: 1.2 + 0.4 * Math.sin(tt * 1.7 + ph * 2), fwL: 0.3, fwR: 0.2, legL: 0.3 * Math.sin(tt * 2.2 + ph), legR: -0.3 * Math.sin(tt * 2.0 + ph), spread: 0.2, look: 0.2 });
      poseFloat(crowd, k, Q);
    });
    crowd.commit();
  }
  // the crown of your splash and the drifting car's (5 SECONDS), and a white mist off them
  splash.begin();
  smoke.begin();
  if (i === 0) {
    const crown = (sx, sz, ts, K, r0) => {
      if (t < ts - 0.08 || t > ts + 2.5) return;
      for (const c of CROWN) {
        const s2 = t - ts - c.t0; if (s2 <= 0) continue;
        const rr = r0 + c.sp * K * s2, up = c.up * K, yy = BASIN.water + up * s2 - 0.5 * G * s2 * s2;
        if (yy < BASIN.water - 0.05) continue;
        splash.add(sx + Math.cos(c.a) * rr, yy, sz + Math.sin(c.a) * rr, Math.cos(c.a) * c.sp, up - G * s2, Math.sin(c.a) * c.sp, c.r * (0.7 + 0.5 * K), c.r * 2.2);
      }
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2, s2 = Math.max(0, t - ts);
        smoke.puff(sx + Math.cos(a) * (r0 + 2.5 * K * s2), 0.3 + 3 * K * s2 * (0.5 + 0.5 * ((k * 0.37) % 1)), sz + Math.sin(a) * (r0 + 2.5 * K * s2), (0.4 + 1.0 * s2) * K, 0.45 * smooth(0, 0.05, s2) * (1 - smooth(0.25, 0.9, s2)), 1.0, 0, (k * 0.61) % 1);
      }
    };
    crown(drift9.x, drift9.z, drift9.tl, 1.35, 1.6);
    crown(me.x, me.z, T_SPLASH, 1.0, 0.35);
    for (const [x, z, age] of pool.SPLASH) smoke.puff(x, 0.4 + 2.5 * (age - 2.2), z + 0.6, 0.9 + 2.5 * Math.max(0, age - 2.2), 0.5, 1.0, 0, (x * 0.37) % 1);
    for (const [x, y, z, a] of fountain.HITS) if (Math.hypot(x - camera.position.x, z - camera.position.z) > 3) smoke.puff(x, y + 0.1 + 0.9 * a, z, 0.12 + 0.5 * a, 0.18 * (1 - a / 0.5), 1.0, 0, (x * 0.53 + z * 0.29) % 1);
  }
  splash.end();
  smoke.end();
  smoke.mat.uniforms.uTime.value = t;
  smoke.mat.uniforms.uLight.value.setRGB(1.6, 1.66, 1.75);
  smoke.mat.uniforms.uSun.value.copy(SUNDIR);
  bloom.strength = mode === 'space' ? 0.22 : 0.18;
  // ---- space: the Earth's own scene behind you ----
  spacePass.enabled = mode === 'space';
  mainPass.clear = mode !== 'space';
  mainPass.clearDepth = mode === 'space';
  if (mode === 'space') {
    offL.copy(camera.position).sub(tv.set(SPACE_YOU.x, SPACE_YOU.y, SPACE_YOU.z));
    space.frame(t, S.T, pYou, offL, camera.quaternion, camera.fov);
  }
  // ---- post ----
  finish.uniforms.uTime.value = v;
  const white = Math.max(s.flash, cover);
  finish.uniforms.uSpray.value = 0;
  finish.uniforms.uWhite.value = window.__cover ? 0 : Math.max(cover, Math.pow(s.flash, 2));
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : 1 - smooth(0.6, 1, white);
  { const c = window.__cover ? null : captionAt(v); finish.uniforms.uCap.value = c ? c.alpha * (1 - smooth(0.6, 1, white)) : 0; }
  s.hide = smooth(0.5, 0.9, white);
  overlay(v, s);
  return s;
}

let comp = null;
function renderFrame(tv0) {
  const tail = tv0 - (VIDEO_DURATION - LOOP);
  if (tail >= 0) update(tv0 - VIDEO_DURATION, 1 - smooth(0, LOOP * 0.92, tail));
  else update(tv0);
  composer.render();
  if (comp) comp.paint();
}

async function boot() {
  await document.fonts.load('500 40px Cormorant');
  await document.fonts.load('italic 500 40px Cormorant');
  await document.fonts.load('600 40px Cormorant');
  await document.fonts.ready;
  await space.ready;
  if (!params.has('dom')) {
    const { makeCompositor } = await import('./compose.js');
    comp = await makeCompositor(renderer.domElement, stage);
  }
  for (const x of [46, 42, 36, 29, 25, 21, 16, 12, 8, 5, 2, 0]) renderFrame(x);
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, sky, state, update, FIG, PEOPLE, fountain, pool };
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

// "What if you were 1 trillion times hotter?" — one street, one shot. The camera stands 2.5 m in front of you in the
// parking lane and looks past you up the street; it never cuts: it eases back and up as the street burns, rises over
// it as it boils away, then sinks to look up at you against the sky. You are a black body at T (timeline.js): you glow
// (you.js GLOW) and light the street (a point light at your middle, shadows off everything round you). Everything else
// heats from the heat where it is, in its own module (heat.js). Here: your friend and her ice cream, the boiling gas
// (puffs that rise off each spot as it passes ~100 MW/m²), the fireball's edge racing out at 1,000x, the sky lit from
// below, the air itself glowing, the Sun looking dark next to you, the light flooding the frame. Post: heat shimmer
// round you, bloom, a soft vignette, darkening behind the text, the white at the end; the last LOOP seconds replay
// the moments before frame 0 while the white clears.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky, skyColors } from './sky.js';
import { makeGround, GU } from './ground.js';
import { makeCity, CU, hazed, heated } from './city.js';
import { makeTrees } from './trees.js';
import { makeTraffic } from './traffic.js';
import { makeProps } from './props.js';
import { makeFire } from './fire.js';
import { makeGlows } from './glows.js';
import { makeSmoke, emitColumn } from './smoke.js';
import { makeCrowd } from './crowd.js';
import { makeOverlay } from './overlay.js';
import { makeYou, FLAP, GLOW } from './you.js';
import { PEOPLE, personAt } from './people.js';
import { BLD, CAM, FRIEND, AWNINGS } from './layout.js';
import { makeStreet } from './street.js';
import { state, VIDEO_DURATION, LOOP, captionAt, HITS, T_SWITCH, logMult, logQ, radiusAt, timeOfQAt, lqHist, heartAt, walkZ, craterY, craterR, craterD, CRATER, WALK_V, Q, V_WHITE, V_TRILLION, T_BODY } from './timeline.js';
import { setHeat, bbColor, HU, LQ, HEAT_GLSL } from './heat.js';
import { lerp, smooth, wobble, clamp, rng } from './util.js';

const W = 1080, H_PX = 1920, DEG = Math.PI / 180;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
const DBG = params.get('dbg') || '';
globalThis.__DBG = DBG;
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
const camera = new THREE.PerspectiveCamera(56, W / H_PX, 0.3, 12000);
scene.add(camera);
const plainMat = (color, rough = 0.9, extra = {}) => hazed(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };
const ctx = { plainMat, glowMat, shadowy, heated };
const sky = makeSky();
scene.add(sky.mesh);
makeGround(scene, ctx);
const city = makeCity(scene, ctx);
const trees = makeTrees(scene, ctx);
const props = makeProps(scene, ctx);
const traffic = makeTraffic(scene, ctx);
const street = makeStreet(scene, ctx);
const fire = makeFire(scene, 3000);
const glows = makeGlows(scene, 1500);
const smoke = makeSmoke(scene, 6500);
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
// your light: from your middle, shadows off everything round you (you yourself don't block it)
const youL = new THREE.PointLight(0xff6020, 5, 0, 2);
youL.castShadow = true;
youL.shadow.mapSize.set(1024, 1024);
youL.shadow.camera.near = 0.35; youL.shadow.camera.far = 400;
youL.shadow.bias = -0.002; youL.shadow.normalBias = 0.04;
scene.add(youL);

// ---------- you, and your friend ----------
const you = makeYou(scene, { hoodie: 0x3a5f8a, jeans: 0x2a2e38, skin: 0xd09a74, hair: 0x2a1a10 });
you.root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
const friend = makeYou(scene, { hoodie: 0xf2c23a, jeans: 0x7d9cc2, skin: 0xe8b894, hair: 0x5a3418, glow: false, ponytail: true });
friend.tufts.forEach((t) => { t.visible = false; });
friend.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
function place(fig, x, y, z, yaw) { fig.root.rotation.y = yaw; fig.root.position.set(x - 0.105 * Math.cos(yaw), y, z + 0.105 * Math.sin(yaw)); }

// ---------- her ice cream: a waffle cone, two scoops (strawberry, vanilla), melting; drips; the scoops slide off ----------
const iceMat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35 });
const cone = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.13, 14).rotateX(Math.PI).translate(0, -0.065, 0), new THREE.MeshStandardMaterial({ color: 0xc88a48, roughness: 0.8 }));
const scoopA = new THREE.Mesh(new THREE.SphereGeometry(0.042, 16, 12), iceMat(0xf4a0b8));
const scoopB = new THREE.Mesh(new THREE.SphereGeometry(0.038, 16, 12), iceMat(0xfaf2dc));
const DRIPS = [];
for (let k = 0; k < 5; k++) {
  const d = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.02, 3, 6), iceMat(k % 2 ? 0xfaf2dc : 0xf4a0b8));
  d.userData = { a: k * 1.25 + 0.3, t0: -1.2 + k * 0.35, sp: 0.06 + 0.03 * (k % 3) };
  scene.add(d); DRIPS.push(d);
}
const splat = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), iceMat(0xf2b4c4));
for (const m of [cone, scoopA, scoopB, splat]) { m.castShadow = true; scene.add(m); }
// (where the scoops land: on the road at her feet)
const SPLAT = { x: FRIEND.x + 0.2, z: FRIEND.z - 0.05, t: 0.62 };

// ---------- the boiling: points over every near building, the ground and the cars, each puffing glowing gas once its
//            heat passes ~100 MW/m² (rock boiling) ----------
const GAS = [];
{
  const R = rng(4242);
  for (const b of BLD) {
    if (b.dist > 1500 || b.z > 60) continue;
    if (b.dist > 140) {
      // far blocks and towers: a plume off the middle and the top as each one goes
      for (const f of [0.45, 0.9]) GAS.push({ x: b.x, y: b.h * f, z: b.z, t: timeOfQAt(Q.VAPOR * (0.8 + 0.4 * R()), b.x, b.h * f, b.z, Math.min(b.w, b.d) * 0.4) + 0.2 * R(), s: Math.max(b.w, b.d) * 0.55, seed: R(), r: b.dist, big: true });
      continue;
    }
    const nx = Math.max(1, Math.round(b.w / 14)), nz = Math.max(1, Math.round(b.d / 14)), ny = Math.max(2, Math.round(b.h / 12));
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) {
      const x = b.x - b.w / 2 + (i + 0.5) / nx * b.w, z = b.z - b.d / 2 + (k + 0.5) / nz * b.d, y = (j + 0.5) / ny * b.h;
      GAS.push({ x, y, z, t: timeOfQAt(Q.VAPOR * (0.8 + 0.4 * R()), x, 1, z) + 0.15 * R(), s: Math.min(b.w / nx, b.h / ny) * 0.8, seed: R(), r: b.dist });
    }
  }
  // the ground itself, along your walk and out to the horizon (bigger plumes further off)
  for (let k = 0; k < 700; k++) {
    const r = 6 + Math.pow(R(), 2.2) * 3000, a = R() * Math.PI * 2;
    const x = Math.cos(a) * r, z = -30 + Math.sin(a) * r;
    GAS.push({ x, y: 0.5, z, t: timeOfQAt(Q.VAPOR * (0.8 + 0.4 * R()), x, 0, z) + 0.15 * R(), s: 2.5 + 0.06 * r, seed: R(), r, ground: true });
  }
  GAS.sort((a, b) => a.t - b.t);
  console.log(`gas: ${GAS.length} points, first at ${GAS[0].t.toFixed(2)} s`);
}

// ---------- the Earth coming apart (from 100,000,000x): slabs of crust lifting off round you, tumbling up into the glare ----------
const SLABS = [];
{
  const R = rng(777);
  for (let k = 0; k < 70; k++) {
    // (in front of the camera, round you, nearer ones later; none on the camera or on you)
    const a = -Math.PI / 2 + (R() - 0.5) * 2.6, r = 5 + Math.pow(R(), 1.4) * 70;
    const t0 = 37.0 + 4.2 * Math.pow(R(), 0.8) + (r < 15 ? 0.8 : 0), H0 = heartAt(t0);
    const x = H0.x + Math.cos(a) * r, z = H0.z + Math.sin(a) * r;
    SLABS.push({ x, z, a, y0: craterY(x, z, t0), w: 1.5 + R() * 4.5 * (0.5 + r / 70), d: 1.5 + R() * 4 * (0.5 + r / 70), h: 0.5 + R() * 1.2, t: t0, up: 2 + 5 * R(), acc: 2 + 6 * R(), out: 1 + 3 * R(),
      ax: new THREE.Vector3(R() - 0.5, (R() - 0.5) * 0.4, R() - 0.5).normalize(), spin: 0.3 + 1.2 * R() });
  }
}
const slabMat = new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 0.95 });
slabMat.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
    varying vec3 vSP;`).replace('#include <begin_vertex>', `#include <begin_vertex>
    vSP = position;`);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
    varying vec3 vSP;`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      // a dark crust on top; underneath and its broken edges white-hot rock
      float under = smoothstep(0.1, -0.45, vSP.y) + 0.6 * smoothstep(0.38, 0.5, max(abs(vSP.x), abs(vSP.z)));
      totalEmissiveRadiance += vec3(5.0, 2.6, 1.1) * clamp(under, 0.0, 1.0) * 2.2;`);
};
const slabs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), slabMat, SLABS.length);
slabs.frustumCulled = false; slabs.castShadow = true;
scene.add(slabs);

// ---------- the crater: from 1,000x the ground ahead of you boils away into a glowing pit, deepening; you walk down into
//            it (timeline.js craterY; ground.js leaves a hole for it) ----------
const CRU = { uCrR: { value: 0 }, uCrD: { value: 0 } };
const craterMat = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.5 });
craterMat.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, CRU, HU);
  sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
    uniform float uCrR; uniform float uCrD; varying vec3 vCW; varying float vCr;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      { float r = length(position.xz); vCr = r;
        transformed = vec3(position.x * uCrR, -uCrD * pow(max(1.0 - r * r, 0.0), 1.3), position.z * uCrR); }`)
    .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      { float r = length(position.xz); float dydr = uCrD * 2.6 * r * pow(max(1.0 - r * r, 0.0), 0.3) / max(uCrR, 0.01);
        objectNormal = normalize(vec3(-normalize(position.xz + 1e-5).x * dydr, 1.0, -normalize(position.xz + 1e-5).y * dydr)); }`)
    .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vCW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
    varying vec3 vCW; varying float vCr; uniform float uCrD;
    ${HEAT_GLSL}`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { // boiling rock: churning, brighter (hotter) deeper down, dark crust rafts near the rim
        float churn = fb3(vec3(vCW.xz * 0.15, uHT * 0.5)) * 0.6 + fb3(vec3(vCW.xz * 0.6 + uHT * 0.3, uHT * 1.3)) * 0.4;
        float deep = 1.0 - vCr;
        float T = 1500.0 + 1400.0 * deep + 300.0 * churn;
        float crust = smoothstep(0.5, 0.68, churn) * (0.55 + 0.45 * smoothstep(0.5, 0.0, deep));
        // (the rim a dark broken lip, so the pit reads against the glowing plain round it)
        float lip = smoothstep(0.86, 0.97, vCr) * (1.0 - smoothstep(0.97, 1.0, vCr));
        totalEmissiveRadiance += bbCol(T) * glowOf(T) * (0.55 + 0.8 * churn) * (1.0 - 0.9 * crust) * (1.4 + 1.6 * deep) * (1.0 - 0.8 * lip); }`);
};
craterMat.customProgramCacheKey = () => 'hot-crater-v1';
const crater = new THREE.Mesh(new THREE.RingGeometry(0.0, 1, 128, 48).rotateX(-Math.PI / 2), craterMat);
crater.position.set(CRATER.x, 0, CRATER.z);
crater.frustumCulled = false; crater.receiveShadow = true;
scene.add(crater);

const overlay = makeOverlay();

// ---------- post ----------
const rt = new THREE.WebGLRenderTarget(W, H_PX, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H_PX);
composer.addPass(new RenderPass(scene, camera));
const shimmer = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uC: { value: new THREE.Vector2(0.5, 0.5) }, uR: { value: 0.1 }, uK: { value: 0 }, uAll: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uC; uniform float uR; uniform float uK; uniform float uAll; varying vec2 vUv;
    float h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
    void main(){
      // the air over you (and, later, over the whole burning street) bends the light: wavering, rising
      vec2 d = (vUv - uC) * vec2(${(W / H_PX).toFixed(4)}, 1.0);
      float m = uK * exp(-dot(d * vec2(1.6, 0.9), d * vec2(1.6, 0.9)) / (uR * uR)) * smoothstep(-0.25, 0.05, vUv.y - uC.y + uR * 0.6) + uAll * smoothstep(0.05, 0.6, 1.0 - vUv.y) * 0.6;
      vec2 q = vUv * vec2(38.0, 22.0) + vec2(0.0, -uTime * 3.2);
      vec2 o = vec2(n2(q) - 0.5, n2(q + 17.3) - 0.5) * 0.006 * m;
      gl_FragColor = texture2D(tDiffuse, vUv + o);
      if (any(isnan(gl_FragColor)) || any(isinf(gl_FragColor))) gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      gl_FragColor = vec4(clamp(gl_FragColor.rgb, 0.0, 24.0), 1.0);
    }`,
});
composer.addPass(shimmer);
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H_PX / 2), 0.3, 0.3, 1.25);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uVig: { value: 0.22 }, uTitle: { value: 0 }, uCounter: { value: 0 }, uCap: { value: 0 }, uWhite: { value: 0 },
    uFloodC: { value: new THREE.Vector2(0.5, 0.5) }, uFlood: { value: 0 }, uFloodCol: { value: new THREE.Color(1, 1, 1) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVig; uniform float uTitle; uniform float uCounter; uniform float uCap; uniform float uWhite;
    uniform vec2 uFloodC; uniform float uFlood; uniform vec3 uFloodCol;
    varying vec2 vUv;
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.1);
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.5 * exp(-pow((vUv.y - 0.79) / 0.09, 2.0));
      col *= 1.0 - uCounter * 0.45 * exp(-pow((vUv.y - 0.6) / 0.085, 2.0)) * smoothstep(1.1, 0.2, vUv.x);
      col *= 1.0 - uCap * 0.45 * exp(-pow((vUv.y - 0.125) / 0.045, 2.0));
      // your light flooding the frame from where you stand
      vec2 fd = (vUv - uFloodC) * vec2(${(W / H_PX).toFixed(4)}, 1.0);
      float e = length(fd), fa = atan(fd.y, fd.x);
      // rays of light out of you, then the glare swallowing everything
      float rays = 0.5 + 0.5 * sin(fa * 23.0) * sin(fa * 7.0 + 1.3);
      float reach = uFlood * (1.0 + 0.35 * rays);
      col = mix(col, uFloodCol, smoothstep(reach * 1.25 + 0.02, reach * 0.7, e) * smoothstep(0.0, 0.03, uFlood));
      col += uFloodCol * 0.6 * smoothstep(0.0, 0.08, uFlood) * rays * exp(-e * 3.0);
      col = mix(col, vec3(1.0, 0.99, 0.97), uWhite);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- update ----------
const tmpC = new THREE.Color(), tv = new THREE.Vector3(), tv2 = new THREE.Vector3(), cc = new THREE.Color();
const C = (a) => tmpC.setRGB(a[0], a[1], a[2]);
const SUN_EL = 34, SUN_AZ = 12;
const SUNDIR = (() => { const el = SUN_EL * DEG, az = SUN_AZ * DEG; return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)); })();
const kickAt = (v) => { let k = 0; HITS.forEach((t, n) => { const dt = v - t; if (dt > -0.05 && dt < 1.5) k = Math.max(k, smooth(-0.05, 0.04, dt) * Math.exp(-Math.max(dt, 0) / 0.35) * (0.2 + 0.035 * n)); }); return k; };
const P = {};
// the camera's keys, relative to you: [time, dx, height above the ground under you, dz (behind you), yaw, pitch, fov]
// (yaw + = toward +x; pitch + = up). Close behind your right shoulder; up over you for the crater and the horizon;
// down low behind you looking up past you at the sky for the end.
const CAMK = [
  [-2, CAM.x, CAM.y, CAM.z, -8.0, 4.0, 56], [9, 0.68, 1.62, 2.75, -6.0, 4.0, 55], [14, 0.75, 1.7, 3.0, -2.5, 3.5, 55], [19, 0.85, 1.85, 3.3, -4.5, 3.0, 54],
  [23.5, 1.0, 2.6, 4.6, -5.0, 0.5, 55], [27, 1.0, 4.8, 6.8, -3.0, -5.0, 56], [31, 0.9, 4.4, 6.2, -2.0, -9.0, 57],
  [35, 0.3, 0.95, 3.6, 2.0, 13.0, 60], [42, 0.28, 0.85, 3.35, 2.0, 13.0, 60], [48, 0.28, 0.85, 3.35, 2.0, 13.0, 60]];
const camSpl = [1, 2, 3, 4, 5, 6].map((j) => {
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
const camKey = (j, v) => camSpl[j](v);
// the exposure: the street gets brighter and brighter round you; the camera stops down to keep you readable
const EXPK = [[-2, 1.0], [8, 0.95], [12, 0.75], [16, 0.55], [20, 0.42], [24, 0.33], [30, 0.27], [36, 0.22], [42, 0.18]];
const expAt = (v) => { for (let i = 0; i < EXPK.length - 1; i++) if (v <= EXPK[i + 1][0]) return lerp(EXPK[i][1], EXPK[i + 1][1], smooth(EXPK[i][0], EXPK[i + 1][0], v)); return EXPK[EXPK.length - 1][1]; };

function update(v, cover = -1) {
  const s = state(v);
  const white = Math.max(s.flash, cover);
  if (cover >= 0) s.title *= 1 - smooth(0.55, 1, cover);
  s.kick = kickAt(v);
  setHeat(s.L, v);
  const T = s.T;
  // ---- your glow: a black body at T (shifted a little warmer-bright on screen so 1,000 °F reads as orange) ----
  const Tv = Math.max(T * lerp(1.12, 1.0, smooth(2000, 5000, T)), 1150);
  bbColor(Tv, cc);
  // (you always read as the brightest thing: about 2.8 on screen once you're white-hot, whatever the exposure)
  const exp0 = expAt(v);
  const gk = Math.min(1.45 + 1.4 * smooth(800, 3500, T) + 3 * Math.log10(Math.max(T / 3500, 1)), 2.9 / exp0);
  GLOW.uGlowC.value.copy(cc); GLOW.uGlowK.value = gk;
  GLOW.uVein.value = smooth(1500, 9000, T);
  // ---- you: walking slowly up the middle of the street, never stopping; arms swinging a little, held a touch out ----
  const H = heartAt(v);
  const gy = H.y - 1;
  {
    const TW = 0.8, ST = 0.62, S = WALK_V * TW * ST / 2;
    const stepZ = [0, 0], lift = [0, 0];
    for (let i = 0; i < 2; i++) {
      const ph = ((v / TW + i * 0.5) % 1 + 1) % 1;
      if (ph < ST) { stepZ[i] = S - 2 * S * ph / ST; }
      else { const u = (ph - ST) / (1 - ST); stepZ[i] = -S + 2 * S * smooth(0, 1, u); lift[i] = 0.11 * Math.sin(Math.PI * u); }
    }
    const bob = Math.abs(Math.cos(Math.PI * 2 * v / TW));
    let flinch = 0;
    HITS.forEach((h) => { const dt = v - h; if (dt > -0.1 && dt < 1.0) flinch = Math.max(flinch, smooth(-0.1, 0.06, dt) * Math.exp(-Math.max(dt, 0) / 0.4)); });
    you.pose({ hipY: 0.815 + 0.02 * bob - 0.01 * flinch, footZ: 0, stepZ, lift, lean: 0.06,
      head: [0.05 + 0.03 * Math.sin(v * 0.7) - 0.05 * flinch, 0.18 * Math.sin(v * 0.33 + 0.5) + 0.04 * wobble(v * 0.5, 2)],
      armsOut: 0.22 + 0.06 * smooth(0, 10, v), armsFwd: 0, curl: 0.3 });
    you.arms.forEach((A, i) => {
      // (each arm swings with the opposite leg)
      A.sh.rotation.x += -0.5 * stepZ[1 - i] / S * 0.55;
      A.el.rotation.set(-0.35 + 0.05 * Math.sin(v * 1.3 + i), 0, 0);
      A.wr.rotation.set(0.1, 0, 0);
    });
  }
  FLAP.uFT.value = v;
  FLAP.uFlap.value = 0.15 + 0.35 * smooth(4, 12, v);
  you.tufts.forEach((t) => { const a = t.userData.a; t.rotation.set(-0.7 + 0.25 * Math.sin(v * 9 + a * 3) * FLAP.uFlap.value, 0, a * 0.5 + 0.2 * Math.sin(v * 7 + a * 5) * FLAP.uFlap.value); });
  place(you, H.x, gy, H.z, Math.PI);
  you.root.updateMatrixWorld(true);
  // ---- your friend: ice cream in her right hand; she jerks back from you, the scoops slide off, she runs ----
  {
    const tF = 0.08, tRun = 0.95;
    const kB = smooth(tF, tF + 0.35, v), kR = smooth(tRun, tRun + 0.4, v);
    const tr = Math.max(0, v - tRun - 0.2);
    const run = tr < 0.6 ? 0.5 * 4.2 * tr * tr / 0.6 : 4.2 * (tr - 0.3);
    // (she walked with you up to frame 0; she jerks back, then runs off to the left sidewalk, past the camera)
    const fx = FRIEND.x - 0.3 * kB - run * 0.72, fz = FRIEND.z - WALK_V * Math.min(v, tF) + 0.2 * kB + run * 0.7;
    const yaw = lerp(1.25, 1.0, kB) * (1 - kR) + (-Math.PI / 4) * kR;
    const ph = tr * 11;
    const stride = kR * Math.min(1, tr * 2);
    friend.pose({ hipY: 0.88 - 0.03 * kB, footZ: -0.05 * kB, lean: -0.22 * kB * (1 - kR) + 0.18 * kR,
      lift: [Math.max(0, Math.sin(ph)) * 0.22 * stride, Math.max(0, -Math.sin(ph)) * 0.22 * stride],
      head: [0.15 * (1 - kB) - 0.1 * kB, -0.55 * (1 - kR) + 0.1 * kB],
      armsOut: 0.1 + 0.1 * kB, armsFwd: 0.2 * stride * Math.sin(ph), curl: 0.6,
      reach: (1 - kR) * 0.85, reachDir: new THREE.Vector3(0.25, -0.35 + 0.45 * kB, 1).normalize() });
    // the left arm up over her face
    const A = friend.arms[1];
    A.sh.rotation.set(-2.3 * kB * (1 - kR) - 0.4 * stride * Math.sin(ph + Math.PI), 0, 0.3 * kB, 'XYZ');
    A.el.rotation.set(-1.3 * kB * (1 - kR), 0, 0);
    place(friend, fx, 0, fz, yaw);
    friend.root.visible = !(v > 7 && lqHist(fx, 1.0, fz, v) > LQ.TREE);
    friend.root.updateMatrixWorld(true);
    // the cone in her palm, pointing up out of her hand
    friend.palmPoint(tv, 0.01);
    const nrm = friend.palmNormal(tv2);
    cone.position.copy(tv).addScaledVector(nrm, 0.02);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tv2.lerp(new THREE.Vector3(0, 1, 0), 0.6).normalize());
    cone.visible = v < tRun + 2.5;
    // the scoops: soft and sagging, sliding off when she jerks back (falling to the road and splatting)
    const sag = clamp((v + 1.5) / 2.2, 0, 1);
    const top = cone.position.clone().add(new THREE.Vector3(0, 0.02, 0));
    const tOff = 0.32, fall = Math.max(0, v - tOff);
    for (const [S, k] of [[scoopA, 0], [scoopB, 1]]) {
      const y0 = top.y + 0.03 + k * 0.05 - 0.012 * sag;
      if (v < tOff) { S.position.set(top.x + 0.004 * k, y0, top.z); S.scale.set(1 + 0.18 * sag, 1 - 0.22 * sag, 1 + 0.18 * sag); S.visible = true; }
      else {
        const yy = y0 - 0.5 * 9.81 * fall * fall;
        S.visible = yy > 0.03;
        S.position.set(top.x + 0.08 * fall - 0.03 * k, yy, top.z + 0.25 * fall);
        S.scale.set(1.2, 0.75, 1.2);
      }
    }
    splat.visible = v > SPLAT.t;
    const ks = smooth(SPLAT.t, SPLAT.t + 0.12, v), km = smooth(SPLAT.t, SPLAT.t + 5, v);
    splat.position.set(SPLAT.x, 0.005, SPLAT.z);
    splat.scale.set(0.07 + 0.05 * ks + 0.06 * km, 0.035 * (1 - 0.8 * km) + 0.002, 0.06 + 0.04 * ks + 0.05 * km);
    // drips down the cone and her hand
    DRIPS.forEach((d) => {
      const u = d.userData, t = v - u.t0, cyc = ((t % 1.1) + 1.1) % 1.1;
      d.visible = v < tOff + 0.15 && t > 0;
      d.position.set(top.x + Math.cos(u.a) * 0.035, top.y + 0.01 - cyc * u.sp * 1.6 - 0.02 * cyc * cyc, top.z + Math.sin(u.a) * 0.035);
      d.scale.set(1, 1 + 0.8 * cyc, 1);
    });
  }
  // ---- the camera: one shot ----
  const C3 = (a) => camKey(a, v);
  const pos = new THREE.Vector3(H.x + C3(0), gy + C3(1), H.z + C3(2));
  // (never below the crater's floor where the camera is)
  pos.y = Math.max(pos.y, craterY(pos.x, pos.z, v) + 0.45);
  const yaw = C3(3) * DEG, pitch = C3(4) * DEG;
  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  camera.position.copy(pos);
  camera.lookAt(tv.copy(pos).add(dir));
  camera.fov = C3(5);
  const shake = 0.0012 + s.kick * 0.006 + 0.0012 * smooth(20, 42, v) + 0.01 * smooth(V_TRILLION, V_WHITE, v);
  camera.rotation.x += wobble(v * 43, 3) * shake; camera.rotation.y += wobble(v * 47, 4) * shake; camera.rotation.z += wobble(v * 39, 6) * shake * 0.5;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  // ---- the late sky: lit from below by the boiling city, then the air itself glowing; the Sun dark next to you ----
  const kHot = smooth(22, 30, v), kPlasma = smooth(31.6, 34.0, v), kSunDim = smooth(34.2, 35.2, v);
  const sc = skyColors(SUN_EL);
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  const zen = C(sc.zen).clone(), hor = C(sc.hor).clone().lerp(new THREE.Color(0.42, 0.6, 0.86), 0.45);
  // lit from below by the boiling city (an orange horizon), then the air itself glowing (violet-pink, like a lightning
  // channel); the picture is stopped down for your glare, so the day sky itself goes dark
  hor.lerp(new THREE.Color(1.5, 0.42, 0.1), kHot).lerp(new THREE.Color(2.2, 0.9, 1.6), kPlasma * 0.7);
  zen.lerp(new THREE.Color(0.06, 0.035, 0.05), kHot).lerp(new THREE.Color(0.9, 0.35, 1.1), kPlasma * 0.6);
  u.uSun.value.copy(SUNDIR); u.uZen.value.copy(zen); u.uHor.value.copy(hor); u.uGlow.value.copy(C(sc.glow)).multiplyScalar(1 - kHot);
  u.uSunCol.value.copy(C(sc.sun)).multiplyScalar(1 - 0.97 * kSunDim);
  u.uSunI.value = 1; u.uStars.value = 0; u.uT.value = v; u.uPx.value = (camera.fov * DEG) / H_PX; u.uCloud.value = 0.55 * (1 - kHot); u.uCity.value = 0;
  u.uDark.value = kSunDim;
  CU.uSkyHi.value.copy(zen); CU.uSkyLo.value.copy(hor);
  // the haze: thick glowing gas closing in once the street boils
  CU.uHaze.value.copy(hor);
  CU.uHazeD.value = lerp(2400, 9000, kHot);
  CU.uSun.value.copy(SUNDIR); CU.uSunCol.value.copy(C(sc.sun));
  CU.uSmokeK.value = smooth(6, 14, v);
  GU.uTear.value = smooth(36.8, 42.4, v);
  // ---- light ----
  const lc = new THREE.Vector3(H.x - 4, 0, H.z - 50);
  sunL.position.copy(SUNDIR).multiplyScalar(500).add(lc);
  sunL.target.position.copy(lc); sunL.target.updateMatrixWorld();
  sunL.intensity = 3.0 * (1 - 0.8 * kHot);
  sunL.color.copy(C(sc.sun)).lerp(new THREE.Color(1, 1, 1), 0.4);
  hemi.intensity = 1.7 * (1 - 0.5 * kHot);
  hemi.color.copy(zen).multiplyScalar(2.0).lerp(new THREE.Color(0.75, 0.8, 0.95), 0.4 * (1 - kHot));
  hemi.groundColor.setRGB(0.5, 0.45, 0.4).lerp(new THREE.Color(1.2, 0.5, 0.15), smooth(10, 24, v));
  youL.position.set(H.x, H.y + 0.05, H.z);
  youL.color.copy(cc);
  youL.intensity = Math.min(110, 2.5 * Math.pow(T / 837, 1.6));
  renderer.toneMappingExposure = expAt(v);
  if (DBG.includes('nolight')) youL.intensity = 0;
  if (DBG.includes('noyou')) GLOW.uGlowK.value = 0;
  smoke.mesh.visible = !DBG.includes('nosmoke');
  if (DBG.includes('nohaze')) CU.uHazeD.value = 1e9;
  // ---- the world ----
  glows.begin(camera);
  smoke.begin(s.L, v, camera.position); fire.begin(s.L, v);
  city.frame(v);
  props.frame(v);
  trees.frame(v, fire, smoke);
  traffic.frame(v, fire, smoke);
  street.frame(v, fire, smoke);
  CRU.uCrR.value = craterR(v); CRU.uCrD.value = craterD(v); crater.visible = craterR(v) > 0.05;
  GU.uCrater.value.set(CRATER.x, CRATER.z, craterR(v) * 0.999, craterD(v));
  // the awnings' canvas burning: flames along it while it goes (city.js burns the canvas through)
  for (const a of AWNINGS) {
    const t = v - a.tIgn;
    if (!(t > 0) || t > a.burn + 6) continue;
    const k = Math.min(1, t / 0.3) * (1 - smooth(a.burn * 0.7, a.burn + 0.6, t));
    const out = a.out ?? 1.5, n = Math.max(2, Math.round(a.w / 1.1));
    for (let j = 0; j < n; j++) {
      const zz = a.z - a.w / 2 + (j + 0.5) / n * a.w, f = ((j * 0.618 + a.z * 0.13) % 1 + 1) % 1;
      if (k > 0.01) fire.add(a.x - a.side * out * (0.35 + 0.5 * f), 2.75 + 0.2 * f, zz, 1.3, 1.6 + 0.8 * f, 0.9 * k, f);
    }
    emitColumn(smoke, a.x - a.side * out * 0.6, 3.6, a.z, t, { life: a.burn + 0.5, every: 0.35, rise: 2.4, size: 0.8, grow: 0.8, alpha: 0.7, shade: 0.08, glow: 0.4, seed: (a.z * 0.37 % 1 + 1) % 1, maxAge: 5 });
  }
  // under your feet: the asphalt smoking from frame 0
  emitColumn(smoke, H.x, gy + 0.1, H.z + 0.3, v + 3, { life: 999, every: 0.35, rise: 1.4, dx: 0.1, dz: 0.4, size: 0.18, grow: 0.5, alpha: 0.32, shade: 0.2, glow: 0, seed: 0.3, maxAge: 3 });
  // the crust coming apart
  {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc2 = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    SLABS.forEach((S, i) => {
      const t = v - S.t;
      if (!(t > 0)) { slabs.setMatrixAt(i, zero); return; }
      const rise = Math.min(1, t / 0.4);
      q.setFromAxisAngle(S.ax, S.spin * t * t * 0.5 + 0.25 * rise);
      p.set(S.x + Math.cos(S.a) * S.out * t * t * 0.5, S.y0 - S.h * 0.5 + S.h * rise + S.up * t + 0.5 * S.acc * t * t, S.z + Math.sin(S.a) * S.out * t * t * 0.5);
      slabs.setMatrixAt(i, m4.compose(p, q, sc2.set(S.w, S.h, S.d)));
    });
    slabs.instanceMatrix.needsUpdate = true;
  }
  // the boiling gas
  const camP = camera.position;
  for (const g of DBG.includes('nogas') ? [] : GAS) {
    const a = v - g.t;
    if (a < 0) break;
    const life = g.big ? 8 : g.ground ? 6 : 6;
    if (a > life) continue;
    const rr = Math.hypot(g.x - camP.x, g.z - camP.z);
    // (none on the lens or between the camera and you: the view of you stays clear)
    if (rr < 7 + g.s) continue;
    { const ax = H.x - camP.x, az = H.z - camP.z, al = Math.hypot(ax, az), f = ((g.x - camP.x) * ax + (g.z - camP.z) * az) / al;
      if (f > 0 && f < al + 3 && Math.abs((g.x - camP.x) * az - (g.z - camP.z) * ax) / al < 3 + g.s) continue; }
    const k = smooth(0, 0.5, a) * (1 - smooth(life * 0.45, life, a));
    if (g.ground && g.r > 400) {
      // far off: the whole horizon going up in a band of fire
      bbColor(3000, tmpC);
      smoke.puff(g.x, g.y + g.s * 0.4 + 12 * a, g.z, g.s * (0.7 + 0.15 * a), 0.45 * k, 0.05, 2.4, g.seed, tmpC.r * 1.6, tmpC.g * 1.6, tmpC.b * 1.6);
      continue;
    }
    // boiling rock: a glowing gas at a few thousand degrees, rising fast and spreading
    const Tg = 2400 + 900 * smooth(18, 30, v) + 1500 * Math.exp(-a * 0.8);
    bbColor(Tg, tmpC);
    const up = (g.big ? 9 : 4) * a + (g.big ? 3 : 1.5) * a * a;
    const sz = g.s * (0.8 + 0.45 * a);
    smoke.puff(g.x + Math.sin(g.seed * 30) * a * 0.1 * g.s, g.y + up, g.z + Math.cos(g.seed * 20) * a * 0.1 * g.s, sz * 0.8, (g.big ? 0.12 : 0.09) * k, 0.05, 2.6 * Math.exp(-a * 0.4), g.seed, tmpC.r * 1.6, tmpC.g * 1.6, tmpC.b * 1.6);
  }
  // the air over you, heated far past anything and rising: a pillar of glowing gas climbing out of the street behind you
  // and spreading at the top (from the moment the street boils until the air itself starts to glow)
  for (let j = Math.floor((v - 26.6 - 7) / 0.1); j * 0.1 + 26.6 <= Math.min(v, 31.8) && false; j++) {
    const t0 = 26.6 + j * 0.1, a = v - t0; if (j < 0 || a < 0 || a > 7) continue;
    const f = (j * 0.618) % 1, f2 = (j * 0.377) % 1;
    const V = 30 + 25 * smooth(26.6, 30, t0);
    const y = 3 + V * a + 4 * a * a, spread = Math.max(0, y - 120) * 0.35;
    const ang = f * Math.PI * 2;
    const H0 = heartAt(t0);
    const x = H0.x + Math.cos(ang) * (2 + 6 * f2 + spread), z = H0.z - 6 + Math.sin(ang) * (2 + 6 * f2 + spread) - 0.2 * spread;
    bbColor(4200 - 1200 * Math.min(1, a / 5), tmpC);
    const k = smooth(0, 0.3, a) * (1 - smooth(4.5, 7, a));
    smoke.puff(x, y, z, 5 + 4 * a + 0.12 * spread, 0.32 * k * smooth(14, 45, y), 0.05, 2.8, f, tmpC.r * 1.6, tmpC.g * 1.6, tmpC.b * 1.6);
  }
  smoke.end(); glows.end(); fire.end();
  fire.mat.uniforms.uTime.value = v;
  smoke.mat.uniforms.uTime.value = v;
  smoke.mat.uniforms.uLight.value.setRGB(1.1, 1.0, 0.95).lerp(new THREE.Color(1.8, 0.8, 0.35), smooth(8, 20, v));
  smoke.mat.uniforms.uSun.value.copy(SUNDIR);
  // the people
  PEOPLE.forEach((p) => { personAt(p, v, P); crowd.pose(p.i, P); });
  crowd.commit();
  bloom.strength = DBG.includes('nobloom') ? 0 : 0.25 + 0.12 * s.kick + 0.15 * smooth(20, 40, v);
  // ---------- post ----------
  tv.set(H.x, H.y, H.z).project(camera);
  const sx = tv.x * 0.5 + 0.5, sy = tv.y * 0.5 + 0.5;
  shimmer.uniforms.uTime.value = v;
  shimmer.uniforms.uC.value.set(sx, sy);
  shimmer.uniforms.uR.value = 0.18 + 0.1 * smooth(0, 10, v);
  shimmer.uniforms.uK.value = 0.9 + 0.8 * smooth(0, 8, v);
  shimmer.uniforms.uAll.value = smooth(6, 14, v);
  finish.uniforms.uFloodC.value.set(sx, sy);
  finish.uniforms.uFlood.value = 1.15 * Math.pow(smooth(V_TRILLION + 1.0, V_WHITE, v), 2.4);
  finish.uniforms.uFloodCol.value.setRGB(0.92, 0.95, 1.0);
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
  window.__dbg = { scene, camera, renderer, composer, sky, state, update, you, friend, PEOPLE, HU };
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

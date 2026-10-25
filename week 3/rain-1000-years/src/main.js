import { WIDE } from './wide.js';   // first: it changes how the scene camera frames 16:9
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeWater } from './water.js';
import { makeRain } from './rain.js';
import { makeGround } from './ground.js';
import { makeBuildings } from './buildings.js';
import { makeProps } from './props.js';
import { makeTraffic, carFrame, HERO } from './traffic.js';
import { makeCrowd } from './crowd.js';
import { PEOPLE, personPose, umbrellaOf } from './people.js';
import { makeGlows } from './glows.js';
import { makeTerrain, TU, seattleH } from './terrain.js';
import { makeEverest, everestH } from './everest.js';
import { makeSpace, RE } from './space.js';
import { makeOverlay } from './overlay.js';
import { DW, drownMat, underK } from './drown.js';
import { F } from './facade.js';
import { B, CAM0, NEEDLE, COLUMBIA, RAINIER, PATH, CARS } from './layout.js';
import {
  STORY_START, state, beatAt, popupAt, POP, VIDEO_DURATION, LOOP, UNDER_COLOR, V_EVEREST0, V_EVEREST, V_UP, V_SPACE, V_PLUNGE, V_SPLASH, V_BOTTOM,
  V_SIGN, V_POWER, V_NEEDLE, V_COLUMBIA, V_RAINIER, V_SCREAM, V_UNDER, levelAt, fmtDepth,
} from './timeline.js';
import { DEG, lerp, smooth, wobble, clamp, rng, keys } from './util.js';
import { makeCompositor } from './compose.js';

const W = WIDE ? 1920 : 1080, H = WIDE ? 1080 : 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));
const RW = Math.round(W * RES), RH = Math.round(H * RES);

const stage = document.getElementById('stage');
// Plain depth buffer (faster than the log one); the near/far planes follow the place (street, mountains, space).
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, logarithmicDepthBuffer: false });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const FOG0 = new THREE.Color(0.15, 0.16, 0.2);
scene.fog = new THREE.FogExp2(FOG0.clone(), 0.001);
const camera = new THREE.PerspectiveCamera(58, W / H, 0.3, 30000);
camera.rotation.order = 'YXZ';
scene.add(camera);

// ---------- the world ----------
const sky = makeSky();
scene.add(sky.mesh);
const plainMat = (color, rough = 0.85, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
const ctx = { plainMat, glowMat };
const ground = makeGround(scene);
const buildings = makeBuildings(scene);
const props = makeProps(scene, ctx);
const before = new Set(scene.children);
const traffic = makeTraffic(scene, ctx);
const carMeshes = scene.children.filter((o) => !before.has(o));
const crowd = makeCrowd(scene, PEOPLE.length + 5, drownMat(plainMat(0xffffff, 0.8)), { castShadow: false });
PEOPLE.forEach((p, i) => crowd.color(i, ...p.col));
crowd.color(PEOPLE.length + 4, 0xf2c230, 0x1b2631, 0xe0ac86, 0x2e2018);   // the man in the car (yellow raincoat)
const umbGeo = new THREE.ConeGeometry(0.55, 0.26, 10, 1, true).translate(0, -0.13, 0);
const umbs = new THREE.InstancedMesh(umbGeo, drownMat(plainMat(0xffffff, 0.35, { side: THREE.DoubleSide })), PEOPLE.length);
const uc = new THREE.Color();
PEOPLE.forEach((p, i) => umbs.setColorAt(i, uc.set(p.umbCol)));
umbs.frustumCulled = false;
scene.add(umbs);
const terrain = makeTerrain(scene);
const everest = makeEverest(scene, crowd, PEOPLE.length);
const glows = makeGlows(scene, 5000);
const water = makeWater(scene);
const rain = makeRain(scene);
const space = makeSpace();

// light: no Sun (it has set behind the clouds); the sky's grey-blue from above, the street's glow from below,
// a little warm light from the sunset band in the west
const hemi = new THREE.HemisphereLight(0x6a7896, 0x2a2420, 1.15);
scene.add(hemi);
const heroLight = new THREE.PointLight(0xffd9a8, 0, 9, 1.5);   // a streetlamp's light on the man in the car
scene.add(heroLight);
const glowLight = new THREE.DirectionalLight(0xff9a66, 0.55);
glowLight.position.set(0, 300, -1000);
scene.add(glowLight, glowLight.target);

// what belongs to which place
const SEATTLE = [...ground.group, buildings.mesh, ...buildings.group, ...props.street, ...props.marketGroup, ...props.needleGroup, ...props.boats, umbs, ...carMeshes, ...terrain.group];
const EVEREST = [...everest.group];

const overlay = makeOverlay();
const stampEl = document.getElementById('stamp');
const stampW = document.getElementById('stampw');

// flashlights in the windows once the power is out (people still upstairs)
const TORCH = [];
{
  const R = rng(4040);
  for (const b of B) {
    if (Math.hypot(b.x, b.z) > 700 || b.h < 12) continue;
    const n = b.front ? 3 : 2;
    for (let k = 0; k < n; k++) {
      if (R() < 0.35) continue;
      const fx = R() < 0.5;
      const sgn = R() < 0.5 ? -1 : 1;
      const x = fx ? b.x + sgn * (b.w / 2 + 0.15) : b.x + (R() - 0.5) * b.w * 0.8;
      const z = fx ? b.z + (R() - 0.5) * b.d * 0.8 : b.z + sgn * (b.d / 2 + 0.15);
      TORCH.push({ x, z, y: 6 + Math.floor(R() * Math.max(1, (b.h - 8) / 3.8)) * 3.8 + 1.4, seed: R(), v0: V_POWER + 0.5 + R() * 6 });
    }
  }
}

// ---------- post ----------
const rt = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(RW, RH);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv);
    if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 60.0), 1.0); }`,
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.55, 0.5, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.34 }, uTitle: { value: 0 }, uCounter: { value: 0 },
    uRainK: { value: 1 }, uWhite: { value: 0 }, uUnder: { value: 0 }, uDeep: { value: 0 }, uFlash: { value: 0 }, uAb: { value: 0 },
    uDrops: { value: 0 }, uIce: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uRainK; uniform float uWhite; uniform float uUnder; uniform float uDeep; uniform float uFlash; uniform float uAb;
    uniform float uDrops; uniform float uIce;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
    float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * vn(p); p = p * 2.07 + 3.1; a *= 0.5; } return s; }
    // rain further off: fine slanted streaks in layers, falling
    float sheet(vec2 uv, float sc, float sp, float seed) {
      vec2 p = vec2(uv.x * sc + uv.y * sc * 0.08, uv.y * sc * 0.07 + uTime * sp);
      vec2 i = floor(p), f = fract(p);
      float on = step(0.93, h(i + seed));
      return on * (1.0 - abs(f.x - 0.5) * 2.0) * smoothstep(0.0, 0.4, f.y) * smoothstep(1.0, 0.6, f.y);
    }
    void main() {
      vec2 c = vUv - 0.5;
      vec2 wob = vec2(sin(vUv.y * 30.0 + uTime * 3.0), cos(vUv.x * 24.0 + uTime * 2.6)) * 0.004 * uUnder;
      vec2 off = c * uAb * 0.01;
      vec3 col = vec3(texture2D(tDiffuse, vUv + wob + off).r, texture2D(tDiffuse, vUv + wob).g, texture2D(tDiffuse, vUv + wob - off).b);
      // far rain
      float r = sheet(vUv, 260.0, 9.0, 1.0) * 0.6 + sheet(vUv, 420.0, 12.0, 7.0) * 0.4;
      col += vec3(0.6, 0.63, 0.7) * r * 0.05 * uRainK;
      // drops running on the lens (a few, sliding down)
      if (uDrops > 0.0) {
        vec2 q = vUv * vec2(9.0, 5.0);
        vec2 qi = floor(q);
        float t = fract(uTime * (0.05 + 0.1 * h(qi)) + h(qi + 3.0));
        vec2 dc = vec2(h(qi + 1.3), 1.0 - t) - fract(q);
        float d = length(dc * vec2(1.0, 0.6));
        float drop = smoothstep(0.09, 0.05, d) * step(0.55, h(qi + 9.1));
        col = mix(col, texture2D(tDiffuse, vUv + dc * 0.06).rgb * 1.2 + 0.02, drop * uDrops * 0.8);
      }
      col += vec3(0.75, 0.8, 1.0) * uFlash;
      // under the sea: blue light from above fading with depth, shafts, motes, bubbles; then the dark
      if (uUnder > 0.0) {
        float y = vUv.y;
        vec3 deep = mix(vec3(0.0, 0.03, 0.06), vec3(0.02, 0.16, 0.26), smoothstep(0.0, 1.0, y));
        float shafts = fbm(vec2(vUv.x * 7.0 + y * 1.5 + uTime * 0.12, uTime * 0.2)) * smoothstep(0.2, 1.0, y);
        deep += vec3(0.05, 0.16, 0.2) * shafts * 0.8;
        vec2 bp = vUv * vec2(14.0, 24.0) + vec2(0.0, -uTime * 2.5);
        vec2 bi = floor(bp), bf = fract(bp) - 0.5;
        float bub = step(0.8, h(bi)) * smoothstep(0.16, 0.08, length(bf + (vec2(h(bi + 3.1), h(bi + 7.7)) - 0.5) * 0.5));
        deep += vec3(0.4, 0.6, 0.7) * bub * 0.35 * (1.0 - uDeep);
        float motes = step(0.996, h(floor(vUv * vec2(540.0, 960.0)) + floor(uTime * 3.0)));
        deep += vec3(0.3, 0.45, 0.5) * motes * 0.4;
        deep *= mix(1.0, 0.06, uDeep);
        // the floor 138 miles down: a faint pale glitter of ice
        float ice = uIce * smoothstep(0.35, 0.0, y) * (0.5 + 0.5 * fbm(vec2(vUv.x * 20.0, y * 60.0)));
        deep += vec3(0.25, 0.4, 0.5) * ice * 0.35 + vec3(0.6, 0.8, 0.9) * step(0.985, h(floor(vUv * vec2(200.0, 360.0)))) * uIce * smoothstep(0.3, 0.0, y) * 0.5;
        col = mix(col, deep, uUnder);
      }
      col = mix(col, vec3(0.9, 0.92, 0.95), uWhite);
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.25);
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.45 * exp(-pow((vUv.y - ${WIDE ? '0.665' : '0.36'}) / ${WIDE ? '0.17' : '0.1'}, 2.0));
      col *= 1.0 - uCounter * 0.32 * exp(-pow((vUv.y - ${WIDE ? '0.35' : '0.53'}) / ${WIDE ? '0.11' : '0.065'}, 2.0)) * smoothstep(${WIDE ? '0.42' : '0.8'}, ${WIDE ? '0.08' : '0.2'}, vUv.x);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- the camera ----------
// Catmull-Rom through [time, value] keys
function spline(list, t) {
  if (t <= list[0][0]) return list[0][1];
  const n = list.length;
  if (t >= list[n - 1][0]) return list[n - 1][1];
  let i = 0;
  while (t > list[i + 1][0]) i++;
  const [t0, p0] = list[i], [t1, p1] = list[i + 1];
  const tm = i > 0 ? list[i - 1] : [t0 - (t1 - t0), p0 - (p1 - p0)];
  const tp = i + 2 < n ? list[i + 2] : [t1 + (t1 - t0), p1 + (p1 - p0)];
  const m0 = (p1 - tm[1]) / (t1 - tm[0]) * (t1 - t0), m1 = (tp[1] - p0) / (tp[0] - t0) * (t1 - t0);
  const u = (t - t0) / (t1 - t0), u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
}
const softMax = (a, b, k) => 0.5 * (a + b + Math.sqrt((a - b) * (a - b) + k * k));
const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
const RAIN_END = { x: RAINIER.x + 0.885 * 21500, z: RAINIER.z - 0.465 * 21500 };
// Seattle: on Pike St (the street, then floating up with the water toward the market), out over Belltown to the
// Space Needle, round to downtown (Columbia Center), then out across the new sea toward Rainier
const SX = [[-4, CAM0.x], [11, CAM0.x], [16, 0], [20, 2], [22.6, 300], [25.4, 900], [29.2, 935], [31, 940]];
const SZ = [[-4, CAM0.z], [11, CAM0.z], [16, -14], [20, -40], [22.6, -190], [25.4, -420], [29.2, -425], [31, -425]];
function seattleCam(v, s) {
  let x = spline(SX, v), z = spline(SZ, v);
  if (v > 31) {   // out across the new sea, straight for Rainier
    const e = smooth(31, 40.3, v);
    x = lerp(940, RAIN_END.x, e); z = lerp(-425, RAIN_END.z, e);
  }
  const L = s.level;
  // you stand on the street until the water lifts you; then float a little over it, higher out at sea
  const over = lerp(1.45, 2.4, smooth(11, 16, v)) + 1.6 * smooth(20, 27, v) + 8 * smooth(31, 34, v);
  let y = softMax(CAM0.y, L + over, 0.7);
  if (v > 31) y = Math.max(y, terrainClear(x, z) + 25);
  // where it looks
  // the three aims (each a function of where the camera is now), blended in turn
  const atSign = () => {
    const tx = 4.3, ty = 10.4 - 2.5 * smooth(11, 16, v), tz = -70;
    return [yawTo(tx - x, tz - z), Math.atan2(ty - y, Math.hypot(tx - x, tz - z)) - lerp(5.5, 3, smooth(10, 16, v)) * DEG];
  };
  const atNeedle = () => {
    const tyN = Math.max(L + 20, 120 + 40 * smooth(24, 27.5, v));
    return [yawTo(NEEDLE.x - x, NEEDLE.z - z) - 4 * DEG, Math.atan2(tyN - y, Math.hypot(NEEDLE.x - x, NEEDLE.z - z)) - 6 * DEG];
  };
  const atColumbia = () => [yawTo(COLUMBIA.x - x, COLUMBIA.z - z) - 2 * Math.PI, Math.atan2(COLUMBIA_TOP - y, Math.hypot(COLUMBIA.x - x, COLUMBIA.z - z)) - 3 * DEG];
  const atRainier = () => [yawTo(RAINIER.x - x, RAINIER.z - z) - 2 * Math.PI, Math.atan2(2600 - y, Math.hypot(RAINIER.x - x, RAINIER.z - z)) - 4 * DEG];
  const mix2 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
  let aim;
  // the push-in on the man in the car while he screams and goes under
  const wH = smooth(6.2, 6.9, v) * (1 - smooth(8.9, 10.0, v));
  if (v < 16.5) aim = atSign();
  if (wH > 0) { const h = heroPose(v, L).head; aim = mix2(aim, [yawTo(h.x - x, h.z - z) + 1.5 * DEG, Math.atan2(h.y - y, Math.hypot(h.x - x, h.z - z)) - 3.5 * DEG], wH * 0.9); }   // (him right of centre, clear of the counter and captions)
  else if (v < 28.2) aim = mix2(atSign(), atNeedle(), smooth(16.5, 21.5, v));
  else aim = mix2(mix2(atNeedle(), atColumbia(), smooth(28.2, 30.6, v)), atRainier(), smooth(31.2, 33.5, v));
  const [yaw, pitch] = aim;
  let fov = v < 16.5 ? lerp(54, 52, smooth(8, 16, v)) : v < 28.2 ? lerp(52, 50, smooth(16.5, 21.5, v)) : lerp(50, 44, smooth(31, 40, v));
  fov = lerp(fov, 30, wH);
  return { x, y, z, yaw, pitch, roll: 0, fov };
}
const COLUMBIA_TOP = 286;
// the man leaning out of the passenger window of the car stuck ahead: waving for help, then screaming as it goes down
const heroObj = new THREE.Object3D(), heroV = new THREE.Vector3();
function heroPose(v, level) {
  const f = carFrame(CARS[HERO], v, level);
  heroObj.position.set(f.x, f.y, f.z); heroObj.rotation.set(f.pitch, f.yaw, f.roll, 'YXZ'); heroObj.updateMatrixWorld(true);
  heroV.set(0.62, 0.45, -0.15).applyMatrix4(heroObj.matrixWorld);          // his seat (the car's right is its +x)
  const scream = smooth(V_SCREAM - 0.15, V_SCREAM + 0.1, v);
  // sitting facing forward (legs inside the car), leaning out sideways through the passenger window
  const P = f.yaw - Math.PI + 0.3;
  const lean = 0.62 + 0.12 * scream + 0.05 * Math.sin(v * 3.1);
  const o = { x: heroV.x, y: heroV.y, z: heroV.z, yaw: P, s: 1.05, walk: 0, stride: 0, sit: 0.9,
    pitch: 0.08 * Math.sin(v * 2.3), roll: lean, look: -0.2 + 0.3 * scream,
    armL: lerp(0.6, 1.4 + 0.15 * Math.sin(v * 9), scream), armR: 1.45 + 0.3 * Math.sin(v * (6 + 4 * scream)), visible: v < V_UNDER + 2.5 };
  // his head (for the camera): out to his right
  const rx = -Math.cos(P), rz = Math.sin(P), hh = 1.6 * 1.05;
  const hx = heroV.x + rx * hh * Math.sin(lean), hy = heroV.y - 0.38 + hh * Math.cos(lean), hz = heroV.z + rz * hh * Math.sin(lean);
  return { o, head: { x: hx, y: hy, z: hz } };
}
// keep the camera off the islands on the way to Rainier
function terrainClear(x, z) { let m = -1e9; for (const [dx, dz] of [[0, 0], [600, -300], [-600, 300], [1200, -600]]) m = Math.max(m, seattleH(x + dx, z + dz)); return m; }

// Everest: in from the south-west across the water, closing on the summit as the sea climbs it
const EV_DIR = { x: -0.707, z: -0.707 };
const ED = [[V_EVEREST0, 13000], [44, 6500], [47, 1600], [49, 120], [V_EVEREST, 16]];
function everestCam(v, s) {
  const d = Math.exp(spline(ED.map(([t, x]) => [t, Math.log(x)]), v));
  const side = 0.04 * Math.sin(v * 0.2);
  const x = EV_DIR.x * d - EV_DIR.z * d * side, z = EV_DIR.z * d + EV_DIR.x * d * side;
  let y = Math.max(s.level + lerp(6, 2.2, smooth(46, V_EVEREST, v)), everestH(x, z) + 3);
  const up = smooth(V_UP, V_SPACE, v);
  y += 9000 * up * up;
  const ty = lerp(8849 - 0.5 * Math.min(d, 1500) * 0.4, 8850.5, smooth(47, 50, v));
  let pitch = Math.atan2(ty - y, d) - lerp(2, 6, smooth(46, 50, v)) * DEG;
  pitch = lerp(pitch, -60 * DEG, smooth(V_UP, V_SPACE - 0.3, v));
  return { x, y, z, yaw: yawTo(-x, -z) + 2 * DEG, pitch, roll: 0, fov: lerp(60, 46, smooth(44, 50, v)) };
}

// Space: around the planet, then the dive
const spaceCam = new THREE.PerspectiveCamera(40, W / H, 1, 3e6);
spaceCam.rotation.order = 'YXZ';
function placeSpaceCam(v) {
  const k = clamp((v - V_PLUNGE) / (V_SPLASH - V_PLUNGE));
  const alt = Math.exp(lerp(Math.log(33000), Math.log(0.002), Math.pow(k, 1.6)));
  const a = 0.6 + (v - V_SPACE) * 0.035;
  const dir = new THREE.Vector3(Math.cos(a) * 0.86, 0.32 + 0.1 * k, Math.sin(a) * 0.86).normalize();
  spaceCam.position.copy(dir).multiplyScalar(RE + alt);
  // look at the planet's centre at first; while diving, tip toward the horizon ahead
  const tgt = new THREE.Vector3(0, 0, 0);
  spaceCam.lookAt(tgt);
  const tilt = smooth(0.55, 1, k) * 55 * DEG;
  spaceCam.rotateX(tilt);
  spaceCam.near = Math.max(0.0005, alt * 0.3); spaceCam.far = 3e6;
  spaceCam.fov = lerp(36, 62, smooth(0.3, 1, k));
  spaceCam.updateProjectionMatrix();
  spaceCam.updateMatrixWorld();
  return { alt, k };
}

const tmpC = new THREE.Color(), v3 = new THREE.Vector3();
function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) { s.flash = cover; s.flashColor = UNDER_COLOR; s.under = cover; s.deep = 1; }
  const L = s.level;
  DW.uLevel.value = L;
  const where = s.place;
  for (const o of SEATTLE) o.visible = where === 'seattle';
  for (const o of EVEREST) o.visible = where === 'everest';
  const inSpace = where === 'space' && cover < 0;
  renderPass.scene = inSpace ? space.scene : scene;
  renderPass.camera = inSpace ? spaceCam : camera;

  // lightning: where the bolt is (ahead, a little to one side), how bright
  const bolt = s.bolt;
  const Rb = rng(Math.floor(s.boltV * 100) + 3);
  const boltSide = (Rb() - 0.5) * 50 * DEG;

  let cam;
  if (!inSpace) {
    cam = where === 'everest' ? everestCam(v, s) : seattleCam(v, s);
    // a little handheld drift, and a jolt at each beat (the thunderclap)
    const b = beatAt(v);
    let punch = 0;
    if (b && !window.__cover) punch = smooth(0, 0.05, b.dt) * Math.exp(-Math.max(0, b.dt - 0.05) * 4);
    cam.yaw += (wobble(v * 0.4, 5) * 0.45 + wobble(v * 9, 2) * 0.25 * punch) * DEG;
    cam.pitch += (wobble(v * 0.35, 7) * 0.35 - punch * 0.9) * DEG;
    cam.roll += (wobble(v * 0.3, 9) * 0.5 + wobble(v * 11, 3) * 0.6 * punch) * DEG;
    cam.y += 0.05 * Math.sin(v * 1.3) * smooth(5, 9, v);
    camera.position.set(cam.x, cam.y, cam.z);
    camera.rotation.set(cam.pitch, cam.yaw, cam.roll);
    camera.fov = cam.fov - 2.5 * punch;
    const hi = Math.max(cam.y - L, 1);
    camera.near = where === 'everest' ? 0.3 : v < 30 ? 0.3 : 2;
    camera.far = where === 'everest' ? 90000 : v < 29 ? 30000 : 400000;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    s.punch = punch;
  } else {
    placeSpaceCam(v);
    s.punch = 0;
  }

  // ---------- sky, air, light ----------
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  u.uTime.value = v;
  u.uScroll.value = v * 0.05;
  u.uFlash.value = bolt * 0.6;
  u.uBolt.value = bolt > 0.2 ? bolt : 0;
  u.uBoltAz.value = camera.rotation.y * -1 + boltSide;
  u.uBoltSeed.value = Rb() * 100;
  // the air: thick with rain on the street, clearing a little for the long views
  const fogD = where === 'everest' ? 1.2e-5 : keys([[18, 0.0011], [21, 0.0005], [24, 0.00035], [27, 0.0002], [29.5, 0.00002], [31, 0.000006], [34, 0.000005]], v, true);
  scene.fog.density = fogD;
  scene.fog.color.copy(FOG0).lerp(tmpC.setRGB(0.6, 0.62, 0.75), bolt * 0.3);
  glows.mat.uniforms.uFogD.value = fogD;
  TU.uFogD.value = fogD; TU.uFogC.value.copy(scene.fog.color); TU.uFlash.value = bolt * 0.5;
  water.u.uFogD.value = fogD; water.u.uFogC.value.copy(scene.fog.color); water.u.uFlash.value = bolt;
  water.u.uChop.value = lerp(0.25, 1.0, smooth(18, 34, v));
  F.uFlash.value = bolt * 0.6; F.uTime.value = v; F.uGrid.value = s.grid;
  hemi.intensity = 1.15 + 1.2 * bolt;
  glowLight.intensity = 0.55 * (where === 'everest' ? 1.6 : 1);

  // ---------- everything ----------
  glows.begin(inSpace ? spaceCam : camera);
  if (where === 'seattle') {
    props.frame(v, s, glows, L, camera);
    traffic.frame(v, s, glows, L);
    if (camera.position.y < 60) {
      const ud = new THREE.Object3D();
      PEOPLE.forEach((p, i) => {
        const o = personPose(p, v);
        crowd.pose(i, o);
        const um = umbrellaOf(p, o);
        if (um) { ud.position.set(um.x, um.y, um.z); ud.rotation.set(um.tilt, o.yaw, 0, 'YXZ'); ud.scale.setScalar(1); ud.updateMatrix(); umbs.setMatrixAt(i, ud.matrix); }
        else { ud.scale.setScalar(0); ud.updateMatrix(); umbs.setMatrixAt(i, ud.matrix); }
      });
      umbs.instanceMatrix.needsUpdate = true;
    } else PEOPLE.forEach((p, i) => crowd.pose(i, { visible: false }));
    for (let i = 0; i < 4; i++) crowd.pose(PEOPLE.length + i, { visible: false });
    crowd.pose(PEOPLE.length + 4, camera.position.y < 60 ? heroPose(v, L).o : { visible: false });
    if (v < V_UNDER + 1) { const h = heroPose(v, L).head; glows.add(h.x + 0.6, h.y + 0.9, h.z + 1.2, 0.0001, 0, 0, 0); heroLight.position.set(h.x - 1.5, h.y + 2.5, h.z + 4); heroLight.intensity = 6 * (1 - smooth(V_UNDER, V_UNDER + 0.6, v)); } else heroLight.intensity = 0;
    // torches in the windows after the blackout; they go when their window goes under
    if (v > V_POWER && camera.position.y < 400) for (const t of TORCH) {
      if (v < t.v0 || t.y < L + 0.3) continue;
      const fl = 0.5 + 0.5 * Math.sin(v * (1.5 + t.seed * 2) + t.seed * 30);
      glows.add(t.x, t.y, t.z, 0.9, 2.2 * fl, 2.0 * fl, 1.6 * fl);
      glows.reflect(t.x, t.y, t.z, 0.8, 0.8 * fl, 0.7 * fl, 0.55 * fl, L);
    }
  } else if (where === 'everest') {
    PEOPLE.forEach((p, i) => crowd.pose(i, { visible: false }));
    everest.pose(v, crowd, PEOPLE.length);
    crowd.pose(PEOPLE.length + 4, { visible: false });
    everest.frame(v, glows, L);
  }
  crowd.commit();
  glows.end();
  if (!inSpace) {
    water.frame(v, L, camera, where === 'seattle' && v < 29 ? 40000 : 800000);
    rain.frame(v, camera, L);
    rain.u.uLight.value.setRGB(0.5, 0.52, 0.58).multiplyScalar(1 + 3 * bolt);
  } else {
    space.u.uTime.value = v; space.u.uSpin.value = v * 0.02;
  }

  // ---------- post ----------
  renderer.toneMappingExposure = inSpace ? 1.1 : 1.3;
  bloom.strength = 0.55;
  const f = finish.uniforms;
  f.uTime.value = v;
  f.uRainK.value = inSpace ? 0 : 1;
  f.uDrops.value = inSpace ? 0 : 0.6;
  f.uFlash.value = bolt * 0.06;
  // the clouds between Everest and space, the clouds on the way down, the splash
  let white = s.cloud;
  if (inSpace) {
    const k = clamp((v - V_PLUNGE) / (V_SPLASH - V_PLUNGE));
    white = Math.max(white, smooth(0.86, 0.93, k) * (1 - smooth(0.96, 1.0, k)) * 0.9, Math.exp(-Math.max(0, v - V_SPLASH) / 0.12) * (v > V_SPLASH ? 1 : 0));
  }
  f.uWhite.value = window.__cover ? 0 : white;
  f.uUnder.value = s.under;
  f.uDeep.value = s.deep;
  f.uIce.value = smooth(V_BOTTOM - 1.6, V_BOTTOM - 0.9, v) * (1 - smooth(V_BOTTOM - 0.6, V_BOTTOM - 0.1, v));
  f.uAb.value = (s.punch || 0) * 1.2;
  f.uTitle.value = window.__cover ? 1.15 : s.title;
  f.uCounter.value = window.__cover ? 0 : (1 - s.flash) * 0.9;

  overlay(v, s, v);
  // the gold popup: one phrase saying what just happened (never a number), sized to fit the width
  {
    const p = window.__cover ? null : popupAt(v);
    const a = p ? smooth(0, 0.06, p.dt) * (1 - smooth(POP - 0.35, POP, p.dt)) * (1 - s.flash) : 0;
    stampEl.style.opacity = a.toFixed(3);
    stampW.style.opacity = '0';
    if (a > 0) {
      if (stampEl.textContent !== p.say) stampEl.textContent = p.say;
      // a steady size (growing it for a "pop" made long phrases wrap to two lines for a few frames): it rises in instead
      const fit = Math.max(64, Math.min(118, 1700 / p.say.length));
      stampEl.style.fontSize = `${fit.toFixed(1)}px`;
      stampEl.style.transform = `translateY(${(22 * (1 - smooth(0, 0.18, p.dt))).toFixed(1)}px)`;
    }
  }

  return s;
}

let comp = null;
// t is video time. The last LOOP seconds replay the moments just before the first frame while the deep water
// clears, so the video loops seamlessly.
function renderFrame(t) {
  const tail = t - (VIDEO_DURATION - LOOP);
  if (tail >= 0) update(t - VIDEO_DURATION + STORY_START, 1 - smooth(0, LOOP * 0.92, tail));
  else update(t + STORY_START);
  composer.render();
  if (comp) comp.paint();
}

async function boot() {
  await document.fonts.load('500 40px Cormorant');
  await document.fonts.load('italic 500 40px Cormorant');
  await document.fonts.load('600 40px Cormorant');
  await document.fonts.ready;
  await space.ready;
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  for (const t of [55, 47, 36, 25, 12, 0]) renderFrame(t);   // compile everything once
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer };
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

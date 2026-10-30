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
import { makeTraffic } from './traffic.js';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { PEOPLE, personPose, umbrellaOf } from './people.js';
import { makeGlows } from './glows.js';
import { makeTerrain, TU } from './terrain.js';
import { makePuffs, makeDomes, makeDebris } from './fx.js';
import { makePlanet, RE, SEA, toN } from './planet.js';
import { makeOverlay } from './overlay.js';
import { DW } from './drown.js';
import { F } from './facade.js';
import { B, CAM0, PIKE } from './layout.js';
import {
  state, popupAt, captionAt, POP, dropsAt, VIDEO_DURATION, LOOP, DROPS, LAST_DROP, FALL, psiAt, wreckOf, blastR, statDrops,
  V_GLASS, V_NEAR, V_DRONE, V_UP, V_END, CITIES, vFrontAt, SOUND,
} from './timeline.js';
import { DEG, lerp, smooth, wobble, clamp, rng, keys } from './util.js';
import { makeCompositor } from './compose.js';

const W = WIDE ? 1920 : 1080, H = WIDE ? 1080 : 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const OFF = new Set((params.get('off') || '').split(','));
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));
const RW = Math.round(W * RES), RH = Math.round(H * RES);

const stage = document.getElementById('stage');
// Plain depth buffer (faster than the log one); the near/far planes follow the place (street, city, space).
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

// people standing in the street ahead of you (out of their stuck cars, on the 1st Ave crosswalk), in view:
// each has a row of its own, so when they run for the sidewalk nobody runs through anybody.
// And on the Portland rooftop: a few people at the parapet watching the northern sky.
const COAT = [0x7b241c, 0x1f618d, 0xd4ac0d, 0x145a32, 0xc0392b, 0x5d6d7e, 0x212f3d, 0xb9770e, 0x4a235a, 0xe8e2d6];
const WATCH = [], ROOF = [];
{
  const R = rng(4321);
  const mk = (o) => ({ yaw: Math.PI + (R() - 0.5) * 1.2, s: 0.93 + R() * 0.12, ph: R() * 10, seed: R(), umb: R() < 0.4,
    umbCol: [0x111111, 0xb3141a, 0x1e3f8a, 0xe8c21a, 0x0e7a4a][Math.floor(R() * 5)],
    col: [COAT[Math.floor(R() * COAT.length)], 0x1b2631, SKIN[Math.floor(R() * SKIN.length)], HAIR[Math.floor(R() * HAIR.length)]], react: R() * 0.35, ...o });
  const rows = [];
  for (let z = -46; z <= -31; z += 1.15) rows.push([z, -10.5, 10.5]);       // the crosswalk and the crossing
  for (let z = -27; z <= -9; z += 1.3) rows.push([z, -1.1, 1.1]);            // the gap between the two stuck lanes
  for (const [z, a, b] of rows) {
    if (R() < 0.25) continue;
    const x = a + R() * (b - a);
    WATCH.push(mk({ x, z: z + (R() - 0.5) * 0.3, side: x < 0 ? -1 : 1 }));
  }
  // in the other cities: people a few metres ahead of you, watching the sky the blast comes from (ahead, side: m)
  for (let k = 0; k < 9; k++) ROOF.push(mk({ ahead: 6.5 + R() * 3, side: -9 + k * 2.2 + (R() - 0.5) * 0.6, turn: (R() - 0.5) * 0.6, umb: false }));
}
const NP = PEOPLE.length + WATCH.length + ROOF.length;
const crowd = makeCrowd(scene, NP, plainMat(0xffffff, 0.8), { castShadow: false });
PEOPLE.forEach((p, i) => crowd.color(i, ...p.col));
WATCH.forEach((p, i) => crowd.color(PEOPLE.length + i, ...p.col));
ROOF.forEach((p, i) => crowd.color(PEOPLE.length + WATCH.length + i, ...p.col));
const umbGeo = new THREE.ConeGeometry(0.55, 0.26, 10, 1, true).translate(0, -0.13, 0);
const umbs = new THREE.InstancedMesh(umbGeo, plainMat(0xffffff, 0.35, { side: THREE.DoubleSide }), NP);
const uc = new THREE.Color();
PEOPLE.forEach((p, i) => umbs.setColorAt(i, uc.set(p.umbCol)));
WATCH.forEach((p, i) => umbs.setColorAt(PEOPLE.length + i, uc.set(p.umbCol)));
ROOF.forEach((p, i) => umbs.setColorAt(PEOPLE.length + WATCH.length + i, uc.set(0x111111)));
umbs.frustumCulled = false;
scene.add(umbs);
const terrain = makeTerrain(scene);
const glows = makeGlows(scene, 6000);
const fires = makeGlows(scene, 16000, { near: 10 });     // fireballs, falling drops, fires: never shrunk near the lens
const puffs = makePuffs(scene, 5000);
const domes = makeDomes(scene, 300);
const debris = makeDebris(scene, 26000);
const water = makeWater(scene);
const rain = makeRain(scene);
const planet = makePlanet();
const ejecta = makeGlows(planet.scene, 4000, { near: 1e6 });

// the Portland rooftop: a flat roof with a parapet, under you
const roof = new THREE.Group();
const PDX_CAM = CITIES[0].cam;
{
  const m = plainMat(0x4a4744, 0.9), mp = plainMat(0x6a655e, 0.8);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(30, 62, 26), m); slab.position.set(PDX_CAM.x - 6, 31, PDX_CAM.z); roof.add(slab);
  const par = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, 26), mp); par.position.set(PDX_CAM.x + 11.5, 62.55, PDX_CAM.z); roof.add(par);
  for (const s of [-1, 1]) { const p2 = new THREE.Mesh(new THREE.BoxGeometry(30, 1.1, 0.4), mp); p2.position.set(PDX_CAM.x - 6, 62.55, PDX_CAM.z + s * 12.8); roof.add(p2); }
  const hut = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 4), mp); hut.position.set(PDX_CAM.x - 4, 63.5, PDX_CAM.z + 8); roof.add(hut);
  scene.add(roof);
}

// light: the storm sky from above, the street's glow from below, a little sunset in the west;
// the blasts: a hard white light from wherever the brightest one is
const hemi = new THREE.HemisphereLight(0x6a7896, 0x2a2420, 1.15);
scene.add(hemi);
const glowLight = new THREE.DirectionalLight(0xff9a66, 0.55);
glowLight.position.set(0, 300, -1000);
scene.add(glowLight, glowLight.target);
const burstLight = new THREE.DirectionalLight(0xfff2e8, 0);
scene.add(burstLight, burstLight.target);

const SEATTLE = [...ground.group, buildings.mesh, ...buildings.group, ...props.street, ...props.marketGroup, ...props.needleGroup, umbs, ...carMeshes, ...terrain.group];
const LANDMARKS = [...props.marketGroup, ...props.needleGroup];

const overlay = makeOverlay();
const stampEl = document.getElementById('stamp');
const stampW = document.getElementById('stampw');

// ---------- the buildings: when each is blown apart, and into which pieces ----------
const BUILD = B.map((b, i) => {
  const R = rng(Math.floor(b.seed * 1e7) + i);
  const nx = clamp(Math.round(b.w / 13), 1, 3), nz = clamp(Math.round(b.d / 13), 1, 3), ny = clamp(Math.round(b.h / 9), 2, 10);
  const parts = [];
  for (let ix = 0; ix < nx; ix++) for (let iy = 0; iy < ny; iy++) for (let iz = 0; iz < nz; iz++) {
    parts.push({ fx: (ix + 0.5) / nx - 0.5, fy: (iy + 0.5) / ny, fz: (iz + 0.5) / nz - 0.5, sx: b.w / nx * (0.6 + 0.35 * R()), sy: b.h / ny * (0.6 + 0.35 * R()),
      sz: b.d / nz * (0.6 + 0.35 * R()), r1: R(), r2: R(), r3: R(), wx: (R() - 0.5) * 6, wy: (R() - 0.5) * 6, wz: (R() - 0.5) * 6 });
  }
  return { b, i, parts, sea: wreckOf(b.x, b.z), stump: Math.min(b.h, 4 + b.h * 0.07), down: false };
});
// a building's wreck for this place: Seattle (the drops), Portland (the front from the north)
function wreckFor(o, city) {
  if (city) return { v: vFrontAt(city, o.b.x, o.b.z), ox: o.b.x + city.fwd.x * 6000, oz: o.b.z + city.fwd.z * 6000 };
  return o.sea;
}

// glass: shards falling from the Pike St windows when the first blast arrives (it comes from the west, so the
// windows go from the far end of the street toward you)
const SHARDS = [];
{
  const R = rng(5150);
  for (const b of B) {
    if (!b.front || b.z > 140 || b.z < -40) continue;
    const n = Math.round(b.d * b.h * 0.12);
    for (let k = 0; k < n; k++) {
      const z = b.z + (R() - 0.5) * b.d, y = 4.5 + R() * (b.h - 6);
      SHARDS.push({
        x: b.side * (PIKE.walk - 0.05), y, z, v0: V_GLASS + (z + 40) / SOUND + R() * 0.08,
        vx: -b.side * (0.6 + R() * 3.2), vz: (R() - 0.3) * 2.5, vy: R() * 1.5, seed: R(), s: 0.05 + R() * 0.1,
      });
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
    uRainK: { value: 1 }, uWhite: { value: 0 }, uFlash: { value: 0 }, uAb: { value: 0 }, uDrops: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uRainK; uniform float uWhite; uniform float uFlash; uniform float uAb; uniform float uDrops;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    // rain further off: fine slanted streaks in layers, falling
    float sheet(vec2 uv, float sc, float sp, float seed) {
      vec2 p = vec2(uv.x * sc + uv.y * sc * 0.08, uv.y * sc * 0.07 + uTime * sp);
      vec2 i = floor(p), f = fract(p);
      float on = step(0.93, h(i + seed));
      return on * (1.0 - abs(f.x - 0.5) * 2.0) * smoothstep(0.0, 0.4, f.y) * smoothstep(1.0, 0.6, f.y);
    }
    void main() {
      vec2 c = vUv - 0.5;
      vec2 off = c * uAb * 0.01;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float r = sheet(vUv, 260.0, 9.0, 1.0) * 0.6 + sheet(vUv, 420.0, 12.0, 7.0) * 0.4;
      col += vec3(0.6, 0.63, 0.7) * r * 0.05 * uRainK * (1.0 + 6.0 * uFlash);
      if (uDrops > 0.0) {
        vec2 q = vUv * vec2(9.0, 5.0);
        vec2 qi = floor(q);
        float t = fract(uTime * (0.05 + 0.1 * h(qi)) + h(qi + 3.0));
        vec2 dc = vec2(h(qi + 1.3), 1.0 - t) - fract(q);
        float d = length(dc * vec2(1.0, 0.6));
        float drop = smoothstep(0.09, 0.05, d) * step(0.55, h(qi + 9.1));
        col = mix(col, texture2D(tDiffuse, vUv + dc * 0.06).rgb * 1.2 + 0.02, drop * uDrops * 0.8);
      }
      col += vec3(0.85, 0.85, 1.0) * uFlash;
      col = mix(col, vec3(1.0, 0.98, 0.96), uWhite);
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.25);
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.45 * exp(-pow((vUv.y - ${WIDE ? '0.665' : '0.36'}) / ${WIDE ? '0.17' : '0.1'}, 2.0));
      col *= 1.0 - uCounter * 0.32 * exp(-pow((vUv.y - ${WIDE ? '0.35' : '0.53'}) / ${WIDE ? '0.11' : '0.065'}, 2.0)) * smoothstep(${WIDE ? '0.42' : '0.8'}, ${WIDE ? '0.08' : '0.2'}, vUv.x);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- the cameras ----------
const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
const aim = (x, y, z, tx, ty, tz) => ({ yaw: yawTo(tx - x, tz - z), pitch: Math.atan2(ty - y, Math.hypot(tx - x, tz - z)) });
// the street: you on Pike St looking west at the Market and the bay, tipping up a little as the sky fills
function streetCam(v) {
  const x = CAM0.x, y = CAM0.y, z = CAM0.z + 0.6 * smooth(4, 10.8, v);
  const a = aim(x, y, z, 4.3, 10.4, -70);
  return { x, y, z, yaw: a.yaw, pitch: a.pitch - 3.5 * DEG + 6 * DEG * smooth(4, 10.8, v), roll: 0, fov: lerp(56, 60, smooth(4, 10.8, v)) };
}
// the drone: out over Elliott Bay looking back at the skyline as it's blown apart (the drops fall thickest over
// downtown), drifting in; then climbing until the whole burning region is under it
const DA = { x: -2400, y: 520, z: 1850 }, DM = { x: -2200, y: 600, z: 1650 }, DB = { x: -4500, y: 9500, z: 3500 };
function droneCam(v) {
  const k = smooth(V_DRONE, 18.5, v), up = Math.pow(smooth(18.5, V_UP + 0.3, v), 1.6);
  const x = lerp(lerp(DA.x, DM.x, k), DB.x, up), y = lerp(lerp(DA.y, DM.y, k), DB.y, up), z = lerp(lerp(DA.z, DM.z, k), DB.z, up);
  const tx = lerp(-350, -300, up), ty = lerp(20, 0, up), tz = lerp(450, 500, up);
  const a = aim(x, y, z, tx, ty, tz);
  return { x, y, z, yaw: a.yaw, pitch: a.pitch + 3 * DEG * (1 - up), roll: -1.0 * DEG * (1 - up), fov: lerp(44, 62, up) };
}
// another city: where you are, looking the way the blast will come (a rooftop, the street, a helicopter at night)
function cityCam(v, c) {
  const k = smooth(c.v0, c.arr, v);
  const yaw = Math.atan2(-c.fwd.x, -c.fwd.z) + (c.kind === 'roof' ? 4 : 0) * DEG;
  const pitch = (c.kind === 'roof' ? lerp(4, 8, k) : c.kind === 'street' ? lerp(9, 14, k) : lerp(-13, -9, k)) * DEG;
  const push = c.kind === 'air' ? 160 * k : 0;
  return { x: c.cam.x + c.fwd.x * push, y: c.cam.y, z: c.cam.z + c.fwd.z * push, yaw, pitch, roll: 0, fov: lerp(c.kind === 'street' ? 66 : 60, c.kind === 'street' ? 70 : 64, k) };
}
// space: low over the western US looking north at the blast, climbing until the whole planet is in view
const spaceCam = new THREE.PerspectiveCamera(46, W / H, 1, 3e6);
const NORTH = (n) => new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize();
const EAST = (n) => new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), n).normalize().negate();
const OVER = toN(41.5, -119.5);                      // northern Nevada
function placeSpaceCam(v) {
  const alt = keys([[V_UP, 1400], [30.4, 2000], [35.2, 2200], [39.4, 3200], [44.2, 4400], [46.8, 5600], [51.6, 8000], [V_END, 26000]], v, true);
  const back = keys([[V_UP, 0.0], [48, 0.06], [V_END, 0.12]], v);
  const base = OVER.clone().lerp(SEA, (1 - smooth(V_UP, 30, v)) * 0.8 + smooth(46, V_END, v) * 0.6).normalize();
  const pos = base.clone().addScaledVector(NORTH(base), -back).normalize().multiplyScalar(RE + alt);
  spaceCam.position.copy(pos);
  // look toward Seattle along the ground at first (the horizon high in the frame), then down at the globe
  const look = SEA.clone().multiplyScalar(RE).lerp(new THREE.Vector3(0, 0, 0), smooth(44, 58, v));
  spaceCam.up.copy(base);
  spaceCam.lookAt(look);
  spaceCam.rotateX(lerp(-6, -12, smooth(44, 56, v)) * DEG);
  spaceCam.near = Math.max(1, alt * 0.05); spaceCam.far = 3e6;
  spaceCam.fov = lerp(62, 46, smooth(V_UP, 50, v));
  spaceCam.updateProjectionMatrix();
  spaceCam.updateMatrixWorld();
}

// ---------- people ----------
const V_LOOK = 0.3, V_RUN = V_GLASS + 1.3;
function crowdClock(v) {
  if (v < V_LOOK) return v;
  const stop = V_LOOK + 0.35 * (1 - Math.exp(-(v - V_LOOK) / 0.35));
  return v < V_RUN ? stop : V_LOOK + 0.35 * (1 - Math.exp(-(V_RUN - V_LOOK) / 0.35)) + 2.4 * (v - V_RUN);
}
function crowdPose(p, v) {
  const o = personPose(p, crowdClock(v));
  if (o.visible === false) return o;
  const R = p.seed;
  const look = smooth(V_LOOK, V_LOOK + 0.5, v) * (1 - smooth(V_GLASS, V_GLASS + 0.2, v));
  const duck = smooth(V_GLASS + 0.02, V_GLASS + 0.25, v) * (1 - smooth(V_RUN - 0.2, V_RUN + 0.3, v));
  const run = smooth(V_RUN - 0.2, V_RUN + 0.3, v);
  const toF = Math.atan2(DROPS[0].x - o.x, DROPS[0].z - o.z);
  let dy = toF - o.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  o.yaw += dy * 0.8 * look;
  o.stride *= 1 - look; o.stride = lerp(o.stride, 1.7, run);
  o.look = lerp(o.look, 0.6, look);
  if (R < 0.35) o.armR = lerp(o.armR, 1.05, look);
  else if (R < 0.5) o.armL = lerp(o.armL, 1.2, look);
  o.sit = 0.55 * duck; o.pitch = lerp(o.pitch, 0.45, duck); o.look = lerp(o.look, -0.4, duck);
  o.armL = lerp(o.armL, 1.65, duck); o.armR = lerp(o.armR, 1.65, duck);
  o.pitch = lerp(o.pitch, 0.22, run * (1 - duck));
  return o;
}
// someone standing still who looks, ducks and runs: on the street (toward their sidewalk) or on the roof (away
// from the parapet, past you): tLook / tDuck / tRun are when, (dx, dz) the way they run, (fx, fz) what they watch
function standerPose(p, v, tLook, tDuck, tRun, dx, dz, fx, fz) {
  const look = smooth(tLook + p.react, tLook + p.react + 0.5, v) * (1 - smooth(tDuck, tDuck + 0.2, v));
  const duck = smooth(tDuck + 0.02, tDuck + 0.25, v) * (1 - smooth(tRun - 0.2 + p.react, tRun + 0.3 + p.react, v));
  const tr = Math.max(0, v - tRun - p.react);
  const run = smooth(0, 0.4, tr);
  const dist = 4.2 * Math.max(0, tr - 0.2) + 2.1 * Math.min(tr, 0.2) * tr / 0.2;
  const toF = Math.atan2(fx - p.x, fz - p.z);
  let yaw = p.yaw + Math.atan2(Math.sin(toF - p.yaw), Math.cos(toF - p.yaw)) * 0.85 * look;
  const runYaw = Math.atan2(dx, dz);
  yaw = lerp(yaw, yaw + Math.atan2(Math.sin(runYaw - yaw), Math.cos(runYaw - yaw)), run);
  const x = p.x + dx * dist, z = p.z + dz * dist;
  const o = { x, y: 0, z, yaw, s: p.s, walk: p.ph + dist / 0.9 * Math.PI, stride: 1.7 * run, sit: 0.55 * duck, pitch: 0.45 * duck + 0.22 * run * (1 - duck),
    roll: 0, armL: 0, armR: p.umb ? 1.15 : 0, look: 0.75 * look - 0.4 * duck, visible: true };
  if (!p.umb && p.seed < 0.5) o.armR = 1.05 * look;
  if (p.seed > 0.8) o.armL = 1.2 * look;
  o.armL = lerp(o.armL, 1.65, duck); o.armR = lerp(o.armR, 1.65, duck);
  return o;
}

// ---------- the drops ----------
// the drops to draw at time v: the first 3,000 one by one, after that a steady random rain of new ones
// (the real rate is thousands a second by then; a few dozen at a time are enough to read)
function dropsNow(v, where) {
  const out = [];
  if (where !== 'street' && where !== 'drone') return out;
  for (const d of DROPS) { if (d.v - FALL > v) break; if (v - d.v < 32) out.push(d); }
  if (v > LAST_DROP.v) {
    for (let j = Math.floor((v - 9) * 30); j <= Math.floor((v + FALL) * 30); j++) for (const d of statDrops(j)) if (d.v - FALL <= v) out.push(d);
  }
  return out;
}
const shockR = (t) => 90 + 520 * Math.pow(t, 0.75);
// one drop: its glowing fall, the flash, the fireball, the shock dome and dust ring, the mushroom cloud, the fires
// (cf: how crowded the sky is. Hundreds a second all at full brightness turn the frame white, so each one dims as
// the rate climbs; the nearest stay vivid)
const CLOUD = 700;                                  // m: the storm's base, where the drops come out
function drawDrop(d, v, cam, out, cf) {
  const t = v - d.v;
  const dc = Math.hypot(d.x - cam.x, d.y - cam.y, d.z - cam.z);
  const bf = Math.max(Math.pow(cf, 0.7), Math.min(1, Math.pow(900 / dc, 2)));
  if (t < 0) {
    // falling: a violet-white streak out of the cloud base, the head brightest
    const hb = d.hb || 0, k = -t / FALL, top = d.y + CLOUD;
    const head = d.y + hb + (CLOUD - hb) * k;
    const len = Math.min(220, top - head + 1);
    const wdt = 2.5 + dc * 0.0012;
    fires.add(d.x, head + len * 0.5, d.z, wdt, 3.2 * bf, 3.0 * bf, 6.0 * bf, -(len / wdt));
    fires.add(d.x, head, d.z, wdt * 5, 2.0 * bf, 1.8 * bf, 4.0 * bf);
    out.light += 0.05 * Math.min(1, Math.pow(1500 / dc, 2));
    return;
  }
  const near = Math.min(1, Math.pow(1300 / dc, 2));
  const flash = Math.exp(-t / 0.08) + 0.3 * Math.exp(-t / 0.6);
  const heat = Math.exp(-t / 1.4);
  const r = 75 * Math.min(1, Math.pow(t / 0.5, 0.4));
  const rise = 30 * t;
  const fy = d.y + (d.hb || 0) + r * 0.55 + rise;
  // the fireball: white-hot, cooling to orange; a wide glow round it while it's flashing
  const h3 = heat * heat * heat;
  const cr = (10 * flash + 3.4 * h3) * bf, cg = (9.2 * flash + 1.2 * h3) * bf, cb = (8.6 * flash + 0.3 * h3) * bf;
  if (cr > 0.03) {
    fires.add(d.x, fy, d.z, r * 2.3, cr, cg, cb, -1);
    if (bf > 0.3) fires.add(d.x, fy, d.z, r * 8, cr * 0.06, cg * 0.05, cb * 0.04);
  }
  out.light += (flash * near * 0.9 + heat * near * 0.05) * bf;
  if (flash > 0.02 || heat > 0.25) out.top.push({ d, fy, w: (flash * near + 0.02 * heat * near) * bf, flash });
  // the shock: a glowing shell racing out, and the dust (or spray) it kicks up along the ground
  if (dc < 6000 && dc > 1100 && t < 2.6 && bf > 0.25 && shockR(t) < dc * 0.8) domes.dome(d.x, d.y, d.z, shockR(t), 0.45 * bf * Math.exp(-t / 0.55));
  const wet = d.water;
  if ((dc < 2500 || (dc < 7000 && cf > 0.25)) && t < 9) {
    const R0 = Math.min(shockR(t), 260 + 60 * t), a = 0.45 * (1 - smooth(2, 9, t)) * smooth(0, 0.15, t);
    const n = dc < 3000 ? 12 : 7;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + d.seed * 9;
      const rr = R0 * (0.85 + 0.25 * Math.sin(i * 3.7 + d.seed * 20));
      const sz = 45 + 22 * t;
      if (wet) puffs.puff(d.x + Math.cos(ang) * rr, d.y + sz * 0.5, d.z + Math.sin(ang) * rr, sz, 0.45, 0.48, 0.52, a, 0.3 * h3, 0.12 * h3, 0.03 * h3, d.seed + i);
      else puffs.puff(d.x + Math.cos(ang) * rr, d.y + sz * 0.45, d.z + Math.sin(ang) * rr, sz, 0.24, 0.2, 0.17, a, 0.6 * h3, 0.22 * h3, 0.05 * h3, d.seed + i);
    }
  }
  // the column and the mushroom cap (steam over the water: white)
  if (dc < 14000 && t > 0.25) {
    const top = Math.min(wet ? 1500 : 2200, 80 + 210 * Math.pow(t, 0.75));
    const capR = Math.min(420, 70 + 30 * t);
    const a = (wet ? 0.5 : 0.7) * smooth(0.25, 1.0, t) * (1 - (wet ? smooth(6, 12, t) : smooth(20, 30, t)));
    const g = 0.15 + 2.2 * h3;
    const [cr2, cg2, cb2] = wet ? [0.5, 0.52, 0.56] : [0.22, 0.19, 0.17];
    const crowd = dc < 3500 || cf > 0.15 ? 1 : 0.45;
    puffs.puff(d.x, d.y + top, d.z, capR, cr2, cg2, cb2, a * crowd, 1.3 * g * crowd, 0.45 * g * crowd, 0.1 * g * crowd, d.seed);
    if (dc < 2500 || (dc < 8000 && cf > 0.3)) {
      for (let i = 0; i < 4; i++) { const ang = i * 1.57 + d.seed * 7; puffs.puff(d.x + Math.cos(ang) * capR * 0.75, d.y + top - capR * 0.25, d.z + Math.sin(ang) * capR * 0.75, capR * 0.7, cr2, cg2, cb2, a * 0.85, 1.1 * g, 0.38 * g, 0.08 * g, d.seed + i * 0.3); }
      for (let i = 1; i <= 3; i++) puffs.puff(d.x, d.y + top * (i / 4), d.z, capR * (0.25 + 0.06 * i), cr2, cg2, cb2, a * 0.8, 1.6 * g, 0.55 * g, 0.12 * g, d.seed + i);
    }
  }
  // the ground burns where it landed
  if (!wet && t > 0.3) {
    const fl = smooth(0.3, 1.5, t);
    for (let j = 0; j < 5; j++) {
      const a = d.seed * 50 + j * 2.4, rr = 40 + 160 * ((d.seed * (3 + j * 7)) % 1);
      const f2 = fl * (0.6 + 0.4 * Math.sin(v * (5 + j) + d.seed * 30 + j));
      fires.add(d.x + Math.cos(a) * rr, d.y + 4, d.z + Math.sin(a) * rr, 16, 2.4 * f2, 0.8 * f2, 0.13 * f2);
    }
  }
}

// one building, blown apart by a blast from (ox, oz) at time w.v: a stump left standing, the rest thrown as
// tumbling chunks that land as rubble; dust rolling out, fire in the ruin
const dummy = new THREE.Object3D();
function drawWreck(o, w, v, detail) {
  const b = o.b, t = v - w.v;
  const mesh = buildings.mesh;
  if (t < 0) {
    if (!o.down) return false;
    dummy.position.set(b.x, 0, b.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(b.w, b.h, b.d); dummy.updateMatrix();
    mesh.setMatrixAt(o.i, dummy.matrix); o.down = false;
    return true;
  }
  dummy.position.set(b.x, 0, b.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(b.w * 0.92, o.stump, b.d * 0.92); dummy.updateMatrix();
  mesh.setMatrixAt(o.i, dummy.matrix); o.down = true;
  let dx = b.x - w.ox, dz = b.z - w.oz;
  const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
  const S = clamp(Math.pow(420 / Math.max(L, 60), 1.1), 0.35, 3.5);
  const hot = S > 1.6 ? 0.35 * Math.exp(-t / 2) : 0.06 * Math.exp(-t / 1.5);
  if (detail) for (const p of o.parts) {
    if (p.fy * b.h < o.stump) continue;
    const x0 = b.x + p.fx * b.w, y0 = p.fy * b.h, z0 = b.z + p.fz * b.d;
    const hs = Math.max(p.sx, p.sy, p.sz) * 0.35;
    const sp = S * (9 + 26 * p.r1) * (0.5 + 0.5 * p.fy);
    const vx = dx * sp + (p.r2 - 0.5) * 6 * S, vz = dz * sp + (p.r3 - 0.5) * 6 * S, vy = S * (2 + 9 * p.r2) * (0.4 + p.fy);
    const tl = (vy + Math.sqrt(vy * vy + 2 * 9.8 * Math.max(0, y0 - hs))) / 9.8;
    const tt = Math.min(t, tl), slide = Math.max(0, Math.min(t - tl, 0.6)) * 0.25;
    const x = x0 + vx * (tt + slide), z = z0 + vz * (tt + slide);
    const y = t < tl ? y0 + vy * tt - 4.9 * tt * tt : hs;
    debris.chunk(x, y, z, p.sx, p.sy, p.sz, p.wx * tt, p.wy * tt, p.wz * tt, b.col, hot * (0.4 + 0.6 * p.r1), 0.3);
  }
  // dust boiling out of the collapse
  if (t < 9) {
    const sz = Math.max(b.w, b.d) * (0.8 + 0.25 * t), a = 0.5 * (1 - smooth(4, 9, t)) * smooth(0, 0.3, t);
    puffs.puff(b.x + dx * 12 * t, Math.min(b.h * 0.4, 30) + 6 * t, b.z + dz * 12 * t, sz, 0.36, 0.33, 0.3, a, 0.4 * hot, 0.15 * hot, 0.03 * hot, b.seed);
    if (detail) puffs.puff(b.x + dx * 20 * t, sz * 0.4, b.z + dz * 20 * t, sz * 0.9, 0.34, 0.31, 0.28, a * 0.8, 0, 0, 0, b.seed + 0.5);
  }
  if (t > 0.6) { const fl = 0.6 + 0.4 * Math.sin(v * 7 + b.seed * 40); fires.add(b.x, o.stump + 3, b.z, Math.max(b.w, b.d) * 0.5, 3.2 * fl, 1.1 * fl, 0.2 * fl); }
  return true;
}

const tmpC = new THREE.Color(), v3 = new THREE.Vector3();
const BURN = new THREE.Color(1.0, 0.45, 0.12);
function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) { s.flash = cover; s.flashColor = '#fff'; }
  const L = 0.02;                           // wet street: puddles, not a flood
  DW.uLevel.value = -0.05;
  const where = s.place;
  const inSpace = where === 'space';
  for (const o of SEATTLE) o.visible = !inSpace;
  for (const o of LANDMARKS) o.visible = where === 'street' || where === 'drone';
  for (const b of props.boats) b.visible = false;
  const city = s.city;
  roof.visible = !!city && city.kind === 'roof';
  renderPass.scene = inSpace ? planet.scene : scene;
  renderPass.camera = inSpace ? spaceCam : camera;

  // ---------- the camera ----------
  if (!inSpace) {
    const cam = where === 'street' ? streetCam(v) : where === 'drone' ? droneCam(v) : cityCam(v, city);
    let punch = 0;
    if (where === 'street') {
      for (const d of DROPS) {
        if (d.v > v) break;
        const dt = v - (d.v + d.dist / SOUND);
        if (dt < 0 || dt > 1.5) continue;
        punch = Math.max(punch, clamp(psiAt(d.dist) / 1.5) * smooth(0, 0.04, dt) * Math.exp(-Math.max(0, dt - 0.04) * 3.5));
      }
      // the flash of a landing drop jolts you too (it's that bright)
      for (const d of DROPS) { if (d.v > v) break; const dt = v - d.v; if (dt < 0.25) punch = Math.max(punch, 0.25 * Math.min(1, 2500 / d.dist) * Math.exp(-dt / 0.08)); }
    } else if (where === 'drone') punch = 0.3 * (0.5 + 0.5 * Math.sin(v * 13.1) * Math.sin(v * 7.3));
    else punch = (0.15 + 0.6 * smooth(city.arr - 3, city.arr, v)) * (0.5 + 0.5 * Math.sin(v * 17.3) * Math.sin(v * 9.1));
    if (window.__cover) punch = 0;
    cam.yaw += (wobble(v * 0.4, 5) * 0.45 + wobble(v * 9, 2) * 0.9 * punch) * DEG;
    cam.pitch += (wobble(v * 0.35, 7) * 0.35 - punch * 1.2) * DEG;
    cam.roll += (wobble(v * 0.3, 9) * 0.5 + wobble(v * 11, 3) * 1.2 * punch) * DEG;
    camera.position.set(cam.x, cam.y, cam.z);
    camera.rotation.set(cam.pitch, cam.yaw, cam.roll);
    camera.fov = cam.fov - 2.5 * punch;
    camera.near = where === 'street' ? 0.3 : 1;
    camera.far = 400000;
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
  u.uFlash.value = 0; u.uBolt.value = 0;
  const fogD = where === 'street' ? 0.0005 : where === 'drone' ? keys([[V_DRONE, 0.00009], [V_UP, 0.00004]], v) : 0.00011;
  scene.fog.density = fogD;
  glows.mat.uniforms.uFogD.value = fogD;
  fires.mat.uniforms.uFogD.value = fogD * 0.35;
  TU.uFogD.value = fogD; TU.uFlash.value = 0;
  water.u.uFogD.value = fogD;
  water.u.uChop.value = where === 'street' ? 0.25 : 0.6;
  F.uTime.value = v; F.uGrid.value = s.grid;
  F.uBroken.value = city ? 0 : smooth(V_GLASS, V_GLASS + 0.5, v);
  TU.uBurnR.value = where === 'drone' ? Math.min(blastR(v), 60000) : 0; TU.uBurnT.value = v;

  glows.begin(inSpace ? spaceCam : camera);
  fires.begin(inSpace ? spaceCam : camera);
  puffs.begin(inSpace ? spaceCam : camera);
  domes.begin(); debris.begin();
  const out = { light: 0, top: [] };
  let fireGlow = 0;
  if (!inSpace) {
    const camP = camera.position;
    // the drops: falling, landing, exploding
    const cf = clamp(6 / (0.51 * Math.max(1, dropsAt(v))), 0.03, 1);
    for (const d of dropsNow(v, where)) drawDrop(d, v, camP, out, cf);
    // the city: blown apart building by building (pieces only near enough to see)
    let changed = false;
    for (const o of BUILD) {
      const w = wreckFor(o, city);
      const dc = Math.hypot(o.b.x - camP.x, o.b.z - camP.z);
      if (drawWreck(o, w, v, dc < (where === 'drone' ? 3200 : 5000))) changed = true;
    }
    if (changed) buildings.mesh.instanceMatrix.needsUpdate = true;
    // another city: the sky the blast comes from. A wall of light over the horizon, the fireball climbing above it,
    // flickering; and the front: a mile-high wall of dust lit orange from below, rolling over the city toward you
    if (city) {
      const fx = city.fwd.x, fz = city.fwd.z, sx = -fz, sz = fx;
      const k = smooth(city.v0 - 3, city.arr - 1.5, v);
      const flick = 0.75 + 0.25 * Math.sin(v * 23) * Math.sin(v * 13.7) + 0.3 * Math.max(0, Math.sin(v * 7.1 + 2) * Math.sin(v * 4.3));
      const far = 150000, rise = lerp(20000, 60000, k);
      const g0 = (0.5 + k) * flick;
      const hx = camP.x + fx * far - sx * 30000, hz = camP.z + fz * far - sz * 30000;
      fires.add(hx, rise * 0.5, hz, rise * 2.2, 1.6 * g0, 0.6 * g0, 0.15 * g0);
      fires.add(hx, rise * 0.6, hz, rise * 1.0, 3.5 * k * flick, 2.0 * k * flick, 0.9 * k * flick, -1);
      for (let i = 0; i < 8; i++) fires.add(camP.x + fx * far * 0.9 + sx * (i - 3.5) * 22000, 2500, camP.z + fz * far * 0.9 + sz * (i - 3.5) * 22000, 40000, 0.7 * g0, 0.22 * g0, 0.04 * g0);
      out.light += 0.15 * k * flick;
      fireGlow = 0.4 + 0.6 * k;
      for (let i = 0; i < 6; i++) { const dir = new THREE.Vector3(fx + sx * (i - 2.5) * 0.35, 0.03 + 0.05 * i * k, fz + sz * (i - 2.5) * 0.35).normalize(); out.top.push({ dir, w: (0.25 + 0.6 * k) * flick * (1 - i * 0.08), flash: 0.05 }); }
      const ahead = (city.arr - v) * 1200;
      if (ahead < 14000) {
        const ox = city.cam.x + fx * ahead, oz = city.cam.z + fz * ahead;
        for (let i = -16; i <= 16; i++) for (let j = 0; j < 7; j++) {
          const lat = i * 300 + Math.sin(i * 7.3) * 80, hh = 80 + j * 230 + 60 * Math.sin(i * 3.1 + j + v * 0.7), fw = j * 160 + 60 * Math.sin(i * 2.3 + j);
          puffs.puff(ox + sx * lat + fx * fw, hh, oz + sz * lat + fz * fw, 230 + 45 * j, 0.1, 0.085, 0.075, 0.97, Math.max(0, 1.8 - j * 0.4), Math.max(0, 0.55 - j * 0.12), 0.06, i * 0.37 + j);
        }
        for (let i = -20; i <= 20; i++) fires.add(ox - fx * 30 + sx * i * 180, 25, oz - fz * 30 + sz * i * 180, 140, 3, 1.0, 0.18);
      }
    }
    // the brightest blasts light the clouds
    out.top.sort((a, c) => c.w - a.w);
    for (let i = 0; i < 8; i++) {
      const t = out.top[i];
      if (!t) { u.uB.value[i].w = 0; continue; }
      if (t.dir) v3.copy(t.dir); else v3.set(t.d.x - camP.x, t.fy - camP.y, t.d.z - camP.z).normalize();
      u.uB.value[i].set(v3.x, v3.y, v3.z, Math.min(where === 'drone' ? 1.0 : 2.5, t.w * 1.5));
      u.uBC.value[i].setRGB(1, 0.9, 0.85).lerp(BURN, 1 - Math.min(1, t.flash * 3));
    }
    if (where === 'drone') fireGlow = 0.35 + 0.6 * smooth(V_DRONE, 18, v);
    if (where === 'street') fireGlow = 0.25 * smooth(1, 10, v);
    const flashAll = Math.min(1.3, out.light);
    u.uFire.value.setRGB(0.9, 0.32, 0.08).multiplyScalar(fireGlow * (where === 'drone' ? 0.22 : 0.35));
    F.uFire.value.setRGB(0.9, 0.35, 0.1).multiplyScalar(fireGlow * 0.5 + flashAll * 0.15);
    F.uFlash.value = flashAll * 0.12;
    hemi.intensity = (city ? (city.kind === 'street' ? 1.0 : 0.7) : 1.15) + 0.9 * flashAll;
    hemi.groundColor.setRGB(0.16, 0.14, 0.12).lerp(tmpC.setRGB(0.9, 0.35, 0.1), clamp(fireGlow * 0.6));
    glowLight.intensity = where === 'street' ? 0.12 : 0.4;
    const t0 = out.top[0];
    if (t0) { if (t0.dir) burstLight.position.copy(camP).addScaledVector(t0.dir, 1000); else burstLight.position.set(t0.d.x, t0.fy, t0.d.z); burstLight.target.position.copy(camP); }
    burstLight.intensity = 0.6 * flashAll;
    burstLight.color.setRGB(1, 0.95, 0.9).lerp(BURN, city ? 0.8 : 0);
    scene.fog.color.copy(FOG0).multiplyScalar(where === 'street' ? 0.8 : 0.5).lerp(tmpC.setRGB(0.3, 0.12, 0.05), clamp(fireGlow * 0.5));
    TU.uFogC.value.copy(scene.fog.color); water.u.uFogC.value.copy(scene.fog.color);
    puffs.mat.uniforms.uFogD.value = fogD * 0.6; puffs.mat.uniforms.uFogC.value.copy(scene.fog.color);
    puffs.mat.uniforms.uTime.value = v;
    s.flashAll = flashAll;
  }

  // ---------- people and the street ----------
  const ud = new THREE.Object3D();
  const hideUmb = (i) => { ud.position.set(0, 0, 0); ud.rotation.set(0, 0, 0); ud.scale.setScalar(0); ud.updateMatrix(); umbs.setMatrixAt(i, ud.matrix); };
  const showUmb = (i, p, o) => {
    const um = o.visible !== false && umbrellaOf(p, o);
    if (!um) return hideUmb(i);
    ud.position.set(um.x, um.y - 0.42 * (o.sit || 0), um.z); ud.rotation.set(um.tilt + 0.5 * (o.sit || 0), o.yaw, 0, 'YXZ'); ud.scale.setScalar(1); ud.updateMatrix(); umbs.setMatrixAt(i, ud.matrix);
  };
  for (let i = 0; i < NP; i++) { crowd.pose(i, { visible: false }); hideUmb(i); }
  if (where === 'street') {
    props.frame(v, s, glows, L, camera);
    traffic.frame(v, s, glows, L);
    PEOPLE.forEach((p, i) => { const o = crowdPose(p, v); crowd.pose(i, o); showUmb(i, p, o); });
    WATCH.forEach((p, j) => {
      const i = PEOPLE.length + j, o = standerPose(p, v, V_LOOK, V_GLASS, V_RUN, p.side, 0, DROPS[0].x, DROPS[0].z);
      o.visible = Math.abs(o.x) < 16;
      crowd.pose(i, o); showUmb(i, p, o);
    });
    for (const g of SHARDS) {
      const t = v - g.v0;
      if (t < 0) continue;
      const tf = Math.min(t, (g.vy + Math.sqrt(g.vy * g.vy + 2 * 9.8 * g.y)) / 9.8);
      const x = g.x + g.vx * tf, z = g.z + g.vz * tf, y = Math.max(0.03, g.y + g.vy * tf - 4.9 * tf * tf);
      const landed = t > tf;
      const gl = landed ? 0.25 * (0.5 + 0.5 * Math.sin(g.seed * 80)) : 0.5 + 1.5 * Math.max(0, Math.sin(v * 25 * (0.5 + g.seed) + g.seed * 60));
      const lit = 1 + 1.5 * (s.flashAll || 0);
      glows.add(x, y, z, g.s, 1.6 * gl * lit, 1.7 * gl * lit, 1.9 * gl * lit);
    }
  } else if (where === 'drone' || city) {
    traffic.frame(v, s, { add() {}, reflect() {} }, L);
    // people watching (on the roof, or in the street), then running off to the sides, out of the picture
    if (city && city.kind !== 'air') ROOF.forEach((p, j) => {
      const fx = city.fwd.x, fz = city.fwd.z, sx = -fz, sz = fx;
      const q = { ...p, x: city.cam.x + fx * p.ahead + sx * p.side, z: city.cam.z + fz * p.ahead + sz * p.side, yaw: Math.atan2(fx, fz) + p.turn };
      const side = p.side < 0 ? -1 : 1;
      const o = standerPose(q, v, city.v0 + 0.2, city.arr - 2.6, city.arr - 2.0, sx * side - fx * 0.25, sz * side - fz * 0.25, q.x + fx * 1e5, q.z + fz * 1e5);
      o.y = city.kind === 'roof' ? 62.0 : 0;
      o.visible = Math.abs((o.x - city.cam.x) * sx + (o.z - city.cam.z) * sz) < 12.5;
      crowd.pose(PEOPLE.length + WATCH.length + j, o);
    });
  }
  umbs.instanceMatrix.needsUpdate = true;
  crowd.commit();

  // ---------- space ----------
  if (inSpace) {
    const pu = planet.u;
    pu.uTime.value = v; pu.uR.value = Math.min(Math.PI * 1.05, blastR(v) / 1000 / RE);
    pu.uFlash.value = 1 + 0.4 * Math.sin(v * 31) * Math.sin(v * 17);
    pu.uEnd.value = smooth(V_END - 3, V_END, v);
    // burning debris thrown up from the front, arcing out over the planet and falling back
    ejecta.begin(spaceCam);
    const nS = NORTH(SEA), eS = EAST(SEA);
    for (let j = Math.floor((v - 7) * 12); j <= Math.floor(v * 12); j++) {
      const Rj = rng(j * 131 + 7);
      for (let q = 0; q < 16; q++) {
        const tb = (j + Rj()) / 12, t = v - tb, a = Rj() * Math.PI * 2, sp = 0.6 + Rj() * 0.8, seed = Rj();
        if (t < 0 || t > 7 || tb < V_UP - 7) continue;
        const Rb = Math.min(Math.PI * 1.02, blastR(tb) / 1000 / RE) * (0.98 + 0.04 * seed);
        const hgt = (380 * sp * t - 55 * t * t) * Math.min(1, Rb * RE / 600);   // (small while the blast is small)
        if (hgt <= 0) continue;
        const n = SEA.clone().multiplyScalar(Math.cos(Rb)).addScaledVector(nS.clone().multiplyScalar(Math.cos(a)).addScaledVector(eS, Math.sin(a)), Math.sin(Rb)).normalize();
        const p = n.multiplyScalar(RE + hgt);
        const k = Math.exp(-t / 3);
        ejecta.add(p.x, p.y, p.z, 14 + 6 * t, 1.6 * k + 0.2, 0.7 * k + 0.06, 0.18 * k + 0.01);
      }
    }
    ejecta.end();
  }
  glows.end(); fires.end(); puffs.end(); domes.end(); debris.end();
  for (const [k, m] of [['fires', fires.mesh], ['puffs', puffs.mesh], ['domes', domes.mesh], ['debris', debris.mesh], ['glows', glows.mesh]]) if (OFF.has(k)) m.visible = false;   // (debugging: ?off=fires,puffs)
  if (!inSpace) {
    water.mesh.visible = where === 'drone' || (!!city && city.kind === 'roof');
    water.frame(v, L, camera, where === 'street' ? 4000 : 400000);
    rain.mesh.visible = false;   // (no ordinary rain: everything you see falling is antimatter)
    rain.frame(v, camera, L);
    rain.u.uLight.value.setRGB(0.5, 0.52, 0.58).multiplyScalar(1 + 1.2 * (s.flashAll || 0));
  }

  // ---------- post ----------
  renderer.toneMappingExposure = inSpace ? 1.1 : where === 'drone' ? 1.0 : city ? 1.15 : 1.3;
  bloom.strength = inSpace ? 0.8 : 0.5;
  const f = finish.uniforms;
  f.uTime.value = v;
  f.uRainK.value = 0;
  f.uDrops.value = 0;
  f.uFlash.value = window.__cover ? 0 : Math.min(0.12, (s.flashAll || 0) * 0.04);
  let white = 0;
  if (where === 'street') white = smooth(V_NEAR - 0.02, V_NEAR + 0.12, v);
  if (where === 'drone') white = 1 - smooth(V_DRONE, V_DRONE + 0.5, v);
  if (city) white = smooth(city.arr - 0.2, city.arr + 0.02, v);
  if (inSpace) { const prev = CITIES.filter((c) => c.v1 <= v + 1e-6).pop(); if (prev) white = 1 - smooth(prev.v1, prev.v1 + 0.5, v); }
  white = Math.max(white, cover >= 0 ? cover : 0, smooth(V_END - 0.6, V_END + 0.3, v));
  f.uWhite.value = window.__cover ? 0 : white;
  f.uAb.value = (s.punch || 0) * 1.4;
  const capK = inSpace && captionAt(v) ? captionAt(v).alpha : 0;
  f.uTitle.value = window.__cover ? 1.15 : Math.max(s.title, capK * 1.3);
  f.uCounter.value = window.__cover ? 0 : (1 - s.flash) * (inSpace ? 1.9 : 0.9);

  overlay(v, s, v);
  {
    const p = window.__cover ? null : popupAt(v);
    const a = p ? smooth(0, 0.06, p.dt) * (1 - smooth(POP - 0.35, POP, p.dt)) * (1 - s.flash) : 0;
    stampEl.style.opacity = a.toFixed(3);
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
  await document.fonts.ready;
  await planet.ready;
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  for (const t of [45, 30, 16, 8, 0]) renderFrame(t);   // compile everything once
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

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
import { makeCrowd } from './crowd.js';
import { PEOPLE, personPose, umbrellaOf } from './people.js';
import { SKIN, HAIR } from './crowd.js';
import { makeGlows } from './glows.js';
import { makeTerrain, TU } from './terrain.js';
import { makeSmoke } from './smoke.js';
import { makePlanet, RE, SEA } from './planet.js';
import { makeOverlay } from './overlay.js';
import { DW } from './drown.js';
import { F } from './facade.js';
import { B, CAM0, PIKE } from './layout.js';
import {
  state, beatAt, popupAt, captionAt, POP, VIDEO_DURATION, LOOP, BURSTS, NEAR, fireball, psiAt, vDestroyed, blastR,
  V_GLASS, V_NEAR, V_DRONE, V_SPACE, V_END, V_DINO, dropsAt, SOUND,
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
// each has a row of its own, so when they run for the sidewalk nobody runs through anybody
const WATCH = [];
{
  const R = rng(4321);
  const COAT = [0x7b241c, 0x1f618d, 0xd4ac0d, 0x145a32, 0xc0392b, 0x5d6d7e, 0x212f3d, 0xb9770e, 0x4a235a, 0xe8e2d6];
  const rows = [];
  for (let z = -46; z <= -31; z += 1.15) rows.push([z, -10.5, 10.5]);       // the crosswalk and the crossing
  for (let z = -27; z <= -9; z += 1.3) rows.push([z, -1.1, 1.1]);            // the gap between the two stuck lanes
  for (const [z, a, b] of rows) {
    if (R() < 0.25) continue;
    const x = a + R() * (b - a);
    WATCH.push({ x, z: z + (R() - 0.5) * 0.3, yaw: Math.PI + (R() - 0.5) * 1.2, side: x < 0 ? -1 : 1, s: 0.93 + R() * 0.12, ph: R() * 10, seed: R(),
      umb: R() < 0.4, umbCol: [0x111111, 0xb3141a, 0x1e3f8a, 0xe8c21a, 0x0e7a4a][Math.floor(R() * 5)],
      col: [COAT[Math.floor(R() * COAT.length)], 0x1b2631, SKIN[Math.floor(R() * SKIN.length)], HAIR[Math.floor(R() * HAIR.length)]], react: R() * 0.35 });
  }
}
const NP = PEOPLE.length + WATCH.length;
const crowd = makeCrowd(scene, NP, plainMat(0xffffff, 0.8), { castShadow: false });
PEOPLE.forEach((p, i) => crowd.color(i, ...p.col));
WATCH.forEach((p, i) => crowd.color(PEOPLE.length + i, ...p.col));
const umbGeo = new THREE.ConeGeometry(0.55, 0.26, 10, 1, true).translate(0, -0.13, 0);
const umbs = new THREE.InstancedMesh(umbGeo, plainMat(0xffffff, 0.35, { side: THREE.DoubleSide }), NP);
const uc = new THREE.Color();
PEOPLE.forEach((p, i) => umbs.setColorAt(i, uc.set(p.umbCol)));
WATCH.forEach((p, i) => umbs.setColorAt(PEOPLE.length + i, uc.set(p.umbCol)));
umbs.frustumCulled = false;
scene.add(umbs);
const terrain = makeTerrain(scene);
const smoke = makeSmoke(scene, 2600);
const glows = makeGlows(scene, 6000);
const fires = makeGlows(scene, 16000, { near: 10 });     // fireballs and fires: big, never shrunk near the lens
const water = makeWater(scene);
const rain = makeRain(scene);
const planet = makePlanet();

// light: the storm sky from above, the street's glow from below, a little sunset in the west;
// the bursts: a hard white light from wherever the brightest one is
const hemi = new THREE.HemisphereLight(0x6a7896, 0x2a2420, 1.15);
scene.add(hemi);
const glowLight = new THREE.DirectionalLight(0xff9a66, 0.55);
glowLight.position.set(0, 300, -1000);
scene.add(glowLight, glowLight.target);
const burstLight = new THREE.DirectionalLight(0xfff2e8, 0);
scene.add(burstLight, burstLight.target);

const SEATTLE = [...ground.group, buildings.mesh, ...buildings.group, ...props.street, ...props.marketGroup, ...props.needleGroup, ...props.boats, umbs, ...carMeshes, ...terrain.group];
for (const b of props.boats) b.visible = false;

const overlay = makeOverlay();
const stampEl = document.getElementById('stamp');
const stampW = document.getElementById('stampw');

// when each building is flattened (the first burst within 650 m of it), and where its dust and fire go
B.forEach((b) => { b.vD = vDestroyed(b.x, b.z); b.tilt = (rng(Math.floor(b.seed * 1e6))() - 0.5) * 0.25; });

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

// ---------- the camera ----------
const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
// the street: you on Pike St looking west at the Market sign, tipping up a little toward the sky as it lights up
function streetCam(v) {
  const x = CAM0.x, y = CAM0.y, z = CAM0.z + 0.6 * smooth(4, 11.5, v);
  const tx = 4.3, ty = 10.4, tz = -70;
  const yaw = yawTo(tx - x, tz - z);
  const pitch = Math.atan2(ty - y, Math.hypot(tx - x, tz - z)) - 5.5 * DEG + 7 * DEG * smooth(5, 11.5, v);
  return { x, y, z, yaw, pitch, roll: 0, fov: lerp(54, 58, smooth(5, 11.5, v)) };
}
// the drone: high over the burning city, drifting back and up while it flattens
// (the skyline from the south-east, then straight up until the whole burning region is under you)
const DA = { x: -1500, y: 330, z: 1700 }, DM = { x: -1750, y: 520, z: 1450 }, DB = { x: -2600, y: 15000, z: 3000 };
function droneCam(v) {
  const k = smooth(V_DRONE, 21, v), up = Math.pow(smooth(20.5, V_SPACE + 0.5, v), 1.7);
  const x = lerp(lerp(DA.x, DM.x, k), DB.x, up), y = lerp(lerp(DA.y, DM.y, k), DB.y, up), z = lerp(lerp(DA.z, DM.z, k), DB.z, up);
  const tx = lerp(350, 0, up), ty = lerp(80, 0, up), tz = lerp(-250, 0, up);
  const yaw = yawTo(tx - x, tz - z) + 3 * DEG * (1 - up);
  const pitch = Math.atan2(ty - y, Math.hypot(tx - x, tz - z)) + 4 * DEG * (1 - up);
  return { x, y, z, yaw, pitch, roll: -1.5 * DEG * (1 - up), fov: lerp(56, 62, up) };
}
// space: over the Pacific north-west at dusk, pulling back as the blast grows until the whole planet is in view
const spaceCam = new THREE.PerspectiveCamera(40, W / H, 1, 3e6);
const south = new THREE.Vector3(0, -1, 0).addScaledVector(SEA, SEA.y).normalize();   // the way south from Seattle
const westT = new THREE.Vector3().crossVectors(SEA, new THREE.Vector3(0, 1, 0)).normalize().negate();
function placeSpaceCam(v) {
  const R = blastR(v) / 1000;                                     // km
  const alt = lerp(900, 3.2 * R + 1500, smooth(V_SPACE, V_SPACE + 4, v)) * (1 + 0.5 * smooth(V_END - 8, V_END, v));
  const altC = Math.min(alt, 42000);
  // look at Seattle from the south and a little west at first (the horizon in view), then straight down at the globe
  const back = lerp(0.42, 0.15, smooth(40, 60, v));
  const dir = SEA.clone().addScaledVector(south, back).addScaledVector(westT, 0.12).normalize();
  spaceCam.position.copy(dir).multiplyScalar(RE + altC);
  const look = SEA.clone().multiplyScalar(RE * clamp(1 - altC / 16000, 0, 1));
  spaceCam.up.set(0, 1, 0);
  spaceCam.lookAt(look);
  spaceCam.rotateX(-lerp(3, 13, smooth(40, 52, v)) * DEG);   // (Seattle high in the frame: the counter and captions below it stay readable)
  spaceCam.near = Math.max(1, altC * 0.05); spaceCam.far = 3e6;
  spaceCam.fov = 46;
  spaceCam.updateProjectionMatrix();
  spaceCam.updateMatrixWorld();
}

// people on the street: they stop and look up at the first flash, duck when the blast hits, then run for the doors
const V_LOOK = 0.2, V_RUN = V_GLASS + 1.3;
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
  // looking: turn toward the flash, head back; some lift a phone, some point
  const toF = Math.atan2(BURSTS[0].x - o.x, BURSTS[0].z - o.z);
  let dy = toF - o.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  o.yaw += dy * 0.8 * look;
  o.stride *= 1 - look; o.stride = lerp(o.stride, 1.7, run);
  o.look = lerp(o.look, 0.75, look);
  if (R < 0.35) o.armR = lerp(o.armR, 1.05, look);
  else if (R < 0.5) o.armL = lerp(o.armL, 1.2, look);
  // ducking: crouched, arms over the head
  o.sit = 0.55 * duck; o.pitch = lerp(o.pitch, 0.45, duck); o.look = lerp(o.look, -0.4, duck);
  o.armL = lerp(o.armL, 1.65, duck); o.armR = lerp(o.armR, 1.65, duck);
  o.pitch = lerp(o.pitch, 0.22, run * (1 - duck));
  return o;
}

// the bursts to draw at time v: the first 3,200 one by one, after that a steady random rain of new ones
// (the real rate is thousands a second by then; a few dozen at a time are enough to read)
const LAST = BURSTS[BURSTS.length - 1];
function burstsNow(v) {
  const out = [];
  for (const b of BURSTS) { if (b.v > v) break; if (v - b.v < 30) out.push(b); }
  if (v > LAST.v) {
    const per = Math.min(10, 2 + (v - LAST.v) * 0.7);
    for (let j = Math.floor((v - 1.5) * 60); j <= Math.floor(v * 60); j++) {
      const R = rng(j * 7919 + 13);
      for (let q = 0; q < per; q++) {
        const t = (j + R()) / 60, r = 12000 * Math.sqrt(R()), a = R() * Math.PI * 2, y = 300 + R() * 600, seed = R();
        if (t > v || t < LAST.v) continue;
        out.push({ v: t, x: r * Math.cos(a), y, z: r * Math.sin(a), seed });
      }
    }
  }
  return out;
}
// a watcher: standing, then (from its own moment) looking up at the fireball, ducking at the blast, running for
// its side of the street (and out of the picture)
function watchPose(p, v) {
  const look = smooth(V_LOOK + p.react, V_LOOK + p.react + 0.5, v) * (1 - smooth(V_GLASS, V_GLASS + 0.2, v));
  const duck = smooth(V_GLASS + 0.02, V_GLASS + 0.25, v) * (1 - smooth(V_RUN - 0.2 + p.react, V_RUN + 0.3 + p.react, v));
  const tr = Math.max(0, v - V_RUN - p.react);
  const run = smooth(0, 0.4, tr);
  const dist = 4.2 * Math.max(0, tr - 0.2) + 2.1 * Math.min(tr, 0.2) * tr / 0.2;
  const toF = Math.atan2(BURSTS[0].x - p.x, BURSTS[0].z - p.z);
  let yaw = p.yaw + Math.atan2(Math.sin(toF - p.yaw), Math.cos(toF - p.yaw)) * 0.85 * look;
  yaw = lerp(yaw, p.side * Math.PI / 2, run);
  const x = p.x + p.side * dist;
  const o = { x, y: 0, z: p.z, yaw, s: p.s, walk: p.ph + dist / 0.9 * Math.PI, stride: 1.7 * run, sit: 0.55 * duck, pitch: 0.45 * duck + 0.22 * run * (1 - duck),
    roll: 0, armL: 0, armR: p.umb ? 1.15 : 0, look: 0.75 * look - 0.4 * duck, visible: Math.abs(x) < 16 };
  if (!p.umb && p.seed < 0.5) o.armR = 1.05 * look;
  if (p.seed > 0.8) o.armL = 1.2 * look;
  o.armL = lerp(o.armL, 1.65, duck); o.armR = lerp(o.armR, 1.65, duck);
  return o;
}
const tmpC = new THREE.Color(), v3 = new THREE.Vector3(), m4 = new THREE.Matrix4(), dummy = new THREE.Object3D();
const BURN = new THREE.Color(1.0, 0.45, 0.12);
const SMOKE = false;   // (puffs read as bubbles from the drone: left out)
function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) { s.flash = cover; s.flashColor = '#fff'; }
  const L = 0.02;                           // wet street: puddles, not a flood
  DW.uLevel.value = -0.05;
  const where = s.place;
  const inSpace = where === 'space';
  for (const o of SEATTLE) o.visible = !inSpace;
  for (const b of props.boats) b.visible = false;
  renderPass.scene = inSpace ? planet.scene : scene;
  renderPass.camera = inSpace ? spaceCam : camera;

  // ---------- the camera ----------
  let flashAll = 0;                          // how much the bursts light everything (for exposure and the lens)
  if (!inSpace) {
    const cam = where === 'street' ? streetCam(v) : droneCam(v);
    // handheld drift, and a jolt when a blast arrives
    let punch = 0;
    if (where === 'street') {
      for (const b of BURSTS) {
        if (b.v > v) break;
        const dt = v - b.vHit;
        if (dt < 0 || dt > 1.5) continue;
        punch = Math.max(punch, clamp(psiAt(b.d) / 1.5) * smooth(0, 0.04, dt) * Math.exp(-Math.max(0, dt - 0.04) * 3.5));
      }
    } else {
      punch = 0.25 * (0.5 + 0.5 * Math.sin(v * 13.1) * Math.sin(v * 7.3));
    }
    if (window.__cover) punch = 0;
    cam.yaw += (wobble(v * 0.4, 5) * 0.45 + wobble(v * 9, 2) * 0.9 * punch) * DEG;
    cam.pitch += (wobble(v * 0.35, 7) * 0.35 - punch * 1.4) * DEG;
    cam.roll += (wobble(v * 0.3, 9) * 0.5 + wobble(v * 11, 3) * 1.2 * punch) * DEG;
    camera.position.set(cam.x, cam.y, cam.z);
    camera.rotation.set(cam.pitch, cam.yaw, cam.roll);
    camera.fov = cam.fov - 2.5 * punch;
    camera.near = where === 'street' ? 0.3 : 2;
    camera.far = where === 'street' ? 30000 : 400000;
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
  const fogD = where === 'street' ? 0.0007 : keys([[V_DRONE, 0.00008], [20, 0.00005], [30, 0.00004]], v);
  scene.fog.density = fogD;
  glows.mat.uniforms.uFogD.value = fogD;
  fires.mat.uniforms.uFogD.value = fogD * 0.35;
  TU.uFogD.value = fogD; TU.uFogC.value.copy(scene.fog.color); TU.uFlash.value = 0;
  water.u.uFogD.value = fogD; water.u.uFogC.value.copy(scene.fog.color);
  water.u.uChop.value = where === 'street' ? 0.25 : 0.6;
  F.uTime.value = v; F.uGrid.value = s.grid;
  F.uBroken.value = smooth(V_GLASS, V_GLASS + 0.5, v);
  TU.uBurnR.value = where === 'drone' ? blastR(v) : 0; TU.uBurnT.value = v;

  glows.begin(inSpace ? spaceCam : camera);
  fires.begin(inSpace ? spaceCam : camera);
  smoke.begin();
  if (!inSpace) {
    // the bursts: fireballs, the light they throw, their smoke; the brightest 8 light the clouds
    const top = [];
    const camP = camera.position;
    let fireGlow = 0, bx = 0, by = 0, bz = 0, bw = 0;
    const smokeMax = where === 'drone' ? 2400 : 400;
    for (const b of burstsNow(v)) {
      const f = fireball(b, v);
      const d = Math.hypot(b.x - camP.x, f.y - camP.y, b.z - camP.z);
      const near = Math.min(1, Math.pow(1300 / d, 2)) * (where === 'drone' ? smooth(250, 900, d) : 1);
      const lum = f.flash * near * 0.8 + f.heat * near * 0.05;
      // the ball: white-hot, cooling to orange; reflected in the wet street
      const hot = f.flash, warm = f.heat;
      if (near <= 0) continue;
      const w2 = warm * warm * warm;   // (the ball cools fast: no pale disc hanging in the sky)
      const cr = 9 * hot + 3.2 * w2, cg = 8.2 * hot + 1.1 * w2, cb = 7.6 * hot + 0.25 * w2;
      if (cr + cg + cb > 0.05) {
        fires.add(b.x, f.y, b.z, f.r * 2.3, cr, cg, cb, -1);
        fires.add(b.x, f.y, b.z, f.r * 7, cr * 0.05, cg * 0.04, cb * 0.035);
        if (where === 'street') fires.reflect(b.x, f.y, b.z, f.r * 0.3, cr * 0.03, cg * 0.03, cb * 0.03, L);
      }
      // the ground under it burns, and the city lights it from below
      const tg = v - b.v - b.y / SOUND;
      if (tg > 0) {
        const fl = (0.6 + 0.4 * Math.sin(v * (5 + b.seed * 4) + b.seed * 30)) * smooth(0, 1.5, tg);
        for (let j = 0; j < 4; j++) fires.add(b.x + (((b.seed * (3 + j * 5)) % 1) - 0.5) * 400, 4, b.z + (((b.seed * (7 + j * 3)) % 1) - 0.5) * 400, 16, 3.2 * fl, 1.1 * fl, 0.18 * fl);
        fireGlow += smooth(0, 2, tg) * Math.min(1, Math.pow(2500 / Math.hypot(b.x - camP.x, b.z - camP.z), 2)) * 0.02;
      }
      // the mushroom: a rising, glowing column and a spreading cap (only near ones are drawn one by one)
      if (SMOKE && f.t > 0.8 && d < 6500) {
        const cap = Math.min(2200, b.y + 70 * f.t), rad = 70 + 16 * f.t;
        const glow = f.heat * 0.35 + 0.02;
        const a = 0.32 * smooth(0.8, 2.0, f.t) * (1 - smooth(14, 22, f.t));
        smoke.puff(b.x, cap, b.z, Math.min(rad, 330), a, 0.22, glow, b.seed);
        if (f.t < 10) smoke.puff(b.x, (cap + 20) * 0.5, b.z, Math.min(rad * 0.4, 130), a * 0.8, 0.2, glow * 1.2, b.seed + 0.5);
      }
      flashAll += lum;
      if (f.flash > 0.02 || f.heat > 0.3) top.push({ b, f, w: lum + 0.02 * f.heat * near });
      if (lum > 0.01) { bx += (b.x - camP.x) * lum; by += (f.y - camP.y) * lum; bz += (b.z - camP.z) * lum; bw += lum; }
    }
    top.sort((a, c) => c.w - a.w);
    for (let i = 0; i < 8; i++) {
      const t = top[i];
      if (!t) { u.uB.value[i].w = 0; continue; }
      v3.set(t.b.x - camP.x, t.f.y - camP.y, t.b.z - camP.z).normalize();
      u.uB.value[i].set(v3.x, v3.y, v3.z, Math.min(where === 'drone' ? 0.9 : 2.5, t.w * 1.5));
      u.uBC.value[i].setRGB(1, 0.9, 0.85).lerp(BURN, 1 - Math.min(1, t.f.flash * 3));
    }
    fireGlow = Math.min(1.4, fireGlow + (where === 'drone' ? 0.25 + 0.6 * smooth(V_DRONE, 22, v) : 0));
    u.uFire.value.setRGB(0.9, 0.32, 0.08).multiplyScalar(fireGlow * (where === 'drone' ? 0.22 : 0.4));
    flashAll = Math.min(1.3, flashAll);
    F.uFire.value.setRGB(0.9, 0.35, 0.1).multiplyScalar(fireGlow * 0.5 + flashAll * 0.15);
    F.uFlash.value = flashAll * 0.12;
    hemi.intensity = 1.15 + 0.9 * flashAll;
    glowLight.intensity = where === 'street' ? 0.12 : 0.4;   // (low in the west: on the wet street it glared as a long stripe)
    hemi.groundColor.setRGB(0.16, 0.14, 0.12).lerp(tmpC.setRGB(0.9, 0.35, 0.1), clamp(fireGlow * 0.6));
    if (bw > 0) { burstLight.position.set(camP.x + bx / bw, camP.y + by / bw, camP.z + bz / bw); burstLight.target.position.copy(camP); }
    burstLight.intensity = (where === 'street' ? 0.6 : 0.6) * flashAll;
    scene.fog.color.copy(FOG0).multiplyScalar(where === 'street' ? 0.8 : 0.5).lerp(tmpC.setRGB(0.3, 0.12, 0.05), clamp(fireGlow * 0.5));

    // the city: buildings flattened by the blasts (they slump and break, dust rolls out, then they burn)
    const mesh = buildings.mesh;
    let changed = false;
    B.forEach((b, i) => {
      const k = smooth(b.vD, b.vD + 2.4, v);
      if (k <= 0 && !b.wasDown) return;
      b.wasDown = k > 0;
      const hh = b.h * (1 - 0.86 * k);
      dummy.position.set(b.x, 0, b.z); dummy.rotation.set(b.tilt * k, 0, -b.tilt * k * 0.6); dummy.scale.set(b.w, Math.max(hh, 0.5), b.d); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix); changed = true;
      if (where === 'drone') {
        const dt = v - b.vD;
        if (SMOKE && dt > 0 && dt < 6) smoke.puff(b.x, b.h * 0.25 + dt * 12, b.z, (Math.max(b.w, b.d) * 0.8 + dt * 14), 0.45 * (1 - smooth(3, 6, dt)), 0.45, 0.06, b.seed);
        if (dt > 0.8) { const fl = 0.6 + 0.4 * Math.sin(v * 7 + b.seed * 40); fires.add(b.x, 4, b.z, Math.max(b.w, b.d) * 0.45, 3.0 * fl, 1.0 * fl, 0.2 * fl); }
      }
    });
    if (changed) mesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- the street ----------
  if (where === 'street') {
    props.frame(v, s, glows, L, camera);
    traffic.frame(v, s, glows, L);
    const ud = new THREE.Object3D();
    PEOPLE.forEach((p, i) => {
      const o = crowdPose(p, v);
      crowd.pose(i, o);
      const um = umbrellaOf(p, o);
      if (um) { ud.position.set(um.x, um.y - 0.42 * (o.sit || 0), um.z); ud.rotation.set(um.tilt + 0.5 * (o.sit || 0), o.yaw, 0, 'YXZ'); ud.scale.setScalar(1); ud.updateMatrix(); umbs.setMatrixAt(i, ud.matrix); }
      else { ud.scale.setScalar(0); ud.updateMatrix(); umbs.setMatrixAt(i, ud.matrix); }
    });
    WATCH.forEach((p, j) => {
      const i = PEOPLE.length + j, o = watchPose(p, v);
      crowd.pose(i, o);
      const um = o.visible !== false && umbrellaOf(p, o);
      if (um) { ud.position.set(um.x, um.y - 0.42 * o.sit, um.z); ud.rotation.set(um.tilt + 0.5 * o.sit, o.yaw, 0, 'YXZ'); ud.scale.setScalar(1); ud.updateMatrix(); umbs.setMatrixAt(i, ud.matrix); }
      else { ud.scale.setScalar(0); ud.updateMatrix(); umbs.setMatrixAt(i, ud.matrix); }
    });
    umbs.instanceMatrix.needsUpdate = true;
    // glass: falling and glinting, then lying in the street
    for (const g of SHARDS) {
      const t = v - g.v0;
      if (t < 0) continue;
      const tf = Math.min(t, (g.vy + Math.sqrt(g.vy * g.vy + 2 * 9.8 * g.y)) / 9.8);
      const x = g.x + g.vx * tf, z = g.z + g.vz * tf, y = Math.max(0.03, g.y + g.vy * tf - 4.9 * tf * tf);
      const landed = t > tf;
      const gl = landed ? 0.25 * (0.5 + 0.5 * Math.sin(g.seed * 80)) : 0.5 + 1.5 * Math.max(0, Math.sin(v * 25 * (0.5 + g.seed) + g.seed * 60));
      const lit = 1 + 1.5 * flashAll;
      glows.add(x, y, z, g.s, 1.6 * gl * lit, 1.7 * gl * lit, 1.9 * gl * lit);
    }
  } else {
    for (let i = 0; i < NP; i++) crowd.pose(i, { visible: false });
    if (!inSpace) traffic.frame(v, s, { add() {}, reflect() {} }, L);
  }
  umbs.count = where === 'street' ? NP : 0;
  crowd.commit();
  glows.end(); fires.end(); smoke.end();
  if (!inSpace) {
    water.mesh && (water.mesh.visible = where !== 'street');
    water.frame(v, L, camera, where === 'street' ? 4000 : 400000);
    rain.frame(v, camera, L);
    rain.mesh.visible = where === 'street';
    rain.u.uLight.value.setRGB(0.5, 0.52, 0.58).multiplyScalar(1 + 1.2 * flashAll);
    smoke.mat.uniforms.uTime.value = v;
    smoke.mat.uniforms.uLight.value.setRGB(0.5, 0.45, 0.42).multiplyScalar(1 + flashAll);
  } else {
    // ---------- space ----------
    const pu = planet.u;
    pu.uTime.value = v;
    pu.uR.value = Math.min(Math.PI * 1.05, blastR(v) / 1000 / RE);
    pu.uFlash.value = 1 + 0.4 * Math.sin(v * 31) * Math.sin(v * 17);
    pu.uEnd.value = smooth(V_END - 3, V_END, v);
  }

  // ---------- post ----------
  renderer.toneMappingExposure = inSpace ? 1.1 : where === 'drone' ? 1.0 : 1.3;
  bloom.strength = inSpace ? 0.8 : 0.45;
  const f = finish.uniforms;
  f.uTime.value = v;
  f.uRainK.value = inSpace ? 0 : where === 'street' ? 1 : 0.25;
  f.uDrops.value = where === 'street' ? 0.6 : 0;
  f.uFlash.value = window.__cover ? 0 : Math.min(0.12, flashAll * 0.04);
  // white: the near burst over the street (into the cut), and the end
  let white = 0;
  if (where === 'street') white = smooth(V_NEAR - 0.02, V_NEAR + 0.12, v);
  if (where === 'drone') white = 1 - smooth(V_DRONE, V_DRONE + 0.55, v);
  white = Math.max(white, cover >= 0 ? cover : 0, smooth(V_END - 0.6, V_END + 0.3, v));
  f.uWhite.value = window.__cover ? 0 : white;
  f.uAb.value = (s.punch || 0) * 1.4;
  // (in space the text sits on the glowing planet: a darker band behind the counter and the captions)
  const capK = inSpace && captionAt(v) ? captionAt(v).alpha : 0;
  f.uTitle.value = window.__cover ? 1.15 : Math.max(s.title, capK * 1.3);
  f.uCounter.value = window.__cover ? 0 : (1 - s.flash) * (inSpace ? 1.9 : 0.9);

  overlay(v, s, v);
  // the gold popup: one phrase saying what just happened (never a number), sized to fit the width
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
  for (const t of [50, 20, 8, 0]) renderFrame(t);   // compile everything once
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

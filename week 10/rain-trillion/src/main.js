// "What if it rained 1 trillion times harder?" One continuous ride with you (yellow raincoat): the flooded avenue,
// onto the bus roof, the bus floats and rises past the balconies, over the roofs, past the tallest tower's deck and the
// mountain's summit, up through the weather into black sky; then the camera pulls out to space (Earth swelling into a
// ball of water), dives back down to you, and the falling water hits the lens: white, and the loop.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeWorld } from './world.js';
import { makeBus } from './bus.js';
import { makeActors, carRoof, carFrame, VIEW_T } from './actors.js';
import { makeYou } from './you.js';
import { makeGlows } from './glows.js';
import { makeWater } from './water.js';
import { makeRain } from './rain.js';
import { makeSpace, RE } from './space.js';
import { makeOverlay } from './overlay.js';
import { DW } from './drown.js';
import { F } from './facade.js';
import { TU } from './terrain.js';
import { makeStreet, GAUGE } from './street.js';
import { makeEverest, everestH } from './everest.js';
import { mtnH, TO_CITY } from './mountain.js';
import { CARS, TAXI_I, YOU0, BAL, TOWER, SUMMIT, TOWN, LAMPS, busAt } from './layout.js';
import {
  state, popupAt, POP, VIDEO_DURATION, LOOP, STEPS, V_BUS, V_TOWER, V_SUMMIT, V_EVEREST, V_SPACE, V_TRILLION, V_OUT, V_DIVE, V_LAND, V_WHITE,
  V_CUT2, V_SC0, V_SC1, V_EC0, V_EC1, depthAt, logM,
} from './timeline.js';
import { DEG, lerp, smooth, clamp, wobble, rng, keys } from './util.js';
import { makeCompositor } from './compose.js';

const W = 1080, H = 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const DBG = params.get('dbg') || '';
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));
const RW = Math.round(W * RES), RH = Math.round(H * RES);

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, logarithmicDepthBuffer: false });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const FOG0 = new THREE.Color(0.42, 0.45, 0.5);
scene.fog = new THREE.FogExp2(FOG0.clone(), 0.002);
const camera = new THREE.PerspectiveCamera(60, W / H, 0.25, 300000);
camera.rotation.order = 'YXZ';
scene.add(camera);

// ---------- the world ----------
const sky = makeSky();
scene.add(sky.mesh);
const world = makeWorld(scene);
const bus = makeBus(scene);
const actors = makeActors(scene);
const you = makeYou(scene, { hoodie: 0xf6c21c, jeans: 0x1e2a44, skin: 0xd8a07a, hair: 0x2a1a10, hoodUp: true });
you.M.hoodie.roughness = 0.32;                          // a wet raincoat
{
  // the raincoat's hood, up: a shell round the head (open at the face) whose skirt runs down the neck into the coat's
  // high collar (the collar sits on the torso, so the gap never shows when you turn or tip your head)
  const prof = [[0.0, 0.232], [0.05, 0.226], [0.088, 0.205], [0.114, 0.165], [0.124, 0.115], [0.122, 0.07], [0.112, 0.03],
    [0.098, -0.01], [0.094, -0.045], [0.104, -0.075], [0.128, -0.1]].map(([r, y]) => new THREE.Vector2(r, y));
  const open = 0.95;                                    // half-angle of the face opening (rad)
  const g = new THREE.LatheGeometry(prof, 40, open, Math.PI * 2 - 2 * open);
  const pa = g.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const y = pa.getY(i), k = Math.min(1, Math.max(0, -y / 0.1));
    pa.setX(i, pa.getX(i) * (1 + 0.32 * k)); pa.setZ(i, pa.getZ(i) * (1.04 - 0.1 * k) - 0.012);
  }
  g.computeVertexNormals();
  const hoodMat = you.M.hoodie.clone(); hoodMat.side = THREE.DoubleSide;
  const hood = new THREE.Mesh(g, hoodMat);
  hood.position.y = 0.0;
  you.head.add(hood);
  // the rim of the face opening: a rolled edge
  const rimPts = [];
  for (let k = 0; k <= 24; k++) {
    const y = 0.205 - (0.205 + 0.045) * k / 24;
    let r = 0; for (let j = 0; j < prof.length - 1; j++) if (y <= prof[j].y && y >= prof[j + 1].y) { const t = (y - prof[j].y) / (prof[j + 1].y - prof[j].y); r = prof[j].x + (prof[j + 1].x - prof[j].x) * t; }
    const kk = Math.min(1, Math.max(0, -y / 0.1));
    for (const sgn of [-1, 1]) rimPts[sgn < 0 ? 'push' : 'push']([sgn, new THREE.Vector3(sgn * Math.sin(open) * r * (1 + 0.32 * kk), y, Math.cos(open) * r * (1.04 - 0.1 * kk) - 0.012)]);
  }
  for (const sgn of [-1, 1]) {
    const pts = rimPts.filter((q) => q[0] === sgn).map((q) => q[1]);
    const top = new THREE.Vector3(0, 0.226, 0.03);
    const curve = new THREE.CatmullRomCurve3([top, ...pts]);
    you.head.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 0.011, 6, false), hoodMat));
  }
  // the coat's high collar round the neck (on the torso)
  const col = new THREE.LatheGeometry([[0.15, 0.5], [0.12, 0.54], [0.095, 0.575], [0.084, 0.61], [0.086, 0.632]].map(([r, y]) => new THREE.Vector2(r, y)), 36);
  you.torso.add(new THREE.Mesh(col, hoodMat));
  you.tufts.forEach((t) => { t.visible = false; });
}
you.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
const glows = makeGlows(scene, 3000);
const street = makeStreet(scene);
const everest = makeEverest(scene);
const water = makeWater(scene);
const rain = makeRain(scene, 26000);
const space = makeSpace();
const spaceCam = new THREE.PerspectiveCamera(50, W / H, 50, 3e6);

// the falling water at the end: a ceiling of churning water coming down on you
const wallU = { uTime: { value: 0 }, uK: { value: 0 } };
const wall = new THREE.Mesh(new THREE.PlaneGeometry(900, 900, 1, 1).rotateX(Math.PI / 2), new THREE.ShaderMaterial({
  uniforms: wallU, side: THREE.DoubleSide, transparent: true, depthWrite: false,
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: /* glsl */ `
    uniform float uTime; uniform float uK; varying vec3 vW;
    float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h1(i), h1(i + vec2(1, 0)), f.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1, 1)), f.x), f.y); }
    float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.03 + 3.7; a *= 0.5; } return s; }
    void main() {
      vec2 p = vW.xz * 0.06;
      p += vec2(sin(uTime * 2.3 + vW.z * 0.02), cos(uTime * 1.9 + vW.x * 0.02)) * 0.4;
      float f = fbm(p + vec2(uTime * 0.9, -uTime * 0.6)) * 0.6 + fbm(p * 3.0 - vec2(uTime * 1.7, uTime * 1.1)) * 0.4;
      // a churning white mass of foam and spray, grey-blue in the folds, tearing apart into streamers at its edges
      float st = fbm(vec2(atan(vW.z - cameraPosition.z, vW.x - cameraPosition.x) * 12.0, length(vW.xz - cameraPosition.xz) * 0.05 - uTime * 3.0));
      float near = 1.0 - smoothstep(4.0, 60.0, vW.y - cameraPosition.y);
      vec3 c = mix(vec3(0.3, 0.38, 0.46), vec3(0.95, 0.97, 0.99), smoothstep(0.28, 0.6, f));
      c = mix(c, vec3(0.95), near * 0.6);
      c = mix(c, vec3(1.0), smoothstep(0.55, 0.8, f * 0.6 + st * 0.5));
      float d = length(vW.xz - cameraPosition.xz);
      gl_FragColor = vec4(c * 1.05, uK * (1.0 - smoothstep(200.0 * (0.5 + 0.5 * f), 300.0, d)));
    }`,
}));
wall.frustumCulled = false; wall.renderOrder = 8;
scene.add(wall);

// light: the storm's grey sky from above, a dim bounce from the water, a soft key on you; the Sun once the sky opens
const hemi = new THREE.HemisphereLight(0xa8b4c6, 0x3a3834, 1.7);
scene.add(hemi);
const skyL = new THREE.DirectionalLight(0xd8e0ea, 0.9);
skyL.position.set(-200, 600, 300);
scene.add(skyL, skyL.target);
const sun = new THREE.DirectionalLight(0xfff1dc, 0);
scene.add(sun, sun.target);
const key = new THREE.PointLight(0xfff4e6, 0, 14, 1.6);
scene.add(key);
const SUN_DIR = new THREE.Vector3(0.5, 0.42, 0.75).normalize();     // behind the camera's usual side, so you are lit

const overlay = makeOverlay();
const stampEl = document.getElementById('stamp');
const youEl = document.getElementById('you');
const moonEl = document.getElementById('moonlab');
const ringEl = document.getElementById('ringlab');

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
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.45, 0.4, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.3 }, uTitle: { value: 0 }, uCounter: { value: 0 },
    uRainK: { value: 1 }, uWhite: { value: 0 }, uFlash: { value: 0 }, uAb: { value: 0 }, uDrops: { value: 0 }, uSheet: { value: 1 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uRainK; uniform float uWhite; uniform float uFlash; uniform float uAb; uniform float uDrops; uniform float uSheet;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    // rain further off: fine slanted streaks in layers, falling
    float sheet(vec2 uv, float sc, float sp, float seed) {
      vec2 p = vec2(uv.x * sc + uv.y * sc * 0.08, uv.y * sc * 0.07 * uSheet + uTime * sp);
      vec2 i = floor(p), f = fract(p);
      float on = step(0.93 - 0.05 * uRainK, h(i + seed));
      return on * (1.0 - abs(f.x - 0.5) * 2.0) * smoothstep(0.0, 0.4, f.y) * smoothstep(1.0, 0.6, f.y);
    }
    void main() {
      vec2 c = vUv - 0.5;
      vec2 off = c * uAb * 0.01;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float r = sheet(vUv, 260.0, 9.0, 1.0) * 0.6 + sheet(vUv, 420.0, 12.0, 7.0) * 0.4;
      col += vec3(0.7, 0.74, 0.8) * r * 0.06 * uRainK;
      // drops running down the lens
      if (uDrops > 0.0) {
        vec2 q = vUv * vec2(9.0, 5.0);
        vec2 qi = floor(q);
        float t = fract(uTime * (0.05 + 0.1 * h(qi)) + h(qi + 3.0));
        vec2 dc = vec2(h(qi + 1.3), 1.0 - t) - fract(q);
        float d = length(dc * vec2(1.0, 0.6));
        float drop = smoothstep(0.09, 0.05, d) * step(0.55, h(qi + 9.1));
        col = mix(col, texture2D(tDiffuse, vUv + dc * 0.06).rgb * 1.15 + 0.02, drop * uDrops * 0.75);
      }
      col += vec3(0.75, 0.8, 1.0) * uFlash;
      col = mix(col, vec3(0.93, 0.95, 0.97), uWhite);
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.5 * exp(-pow((vUv.y - 0.79) / 0.09, 2.0));
      col *= 1.0 - uCounter * 0.4 * exp(-pow((vUv.y - 0.6) / 0.085, 2.0)) * smoothstep(1.1, 0.2, vUv.x);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- the bus ----------
const busObj = new THREE.Object3D();
function placeBus(v) {
  const b = busAt(v);
  busObj.position.set(b.x, b.roof, b.z);
  busObj.rotation.set(b.pitch, b.yaw, b.roll, 'YXZ');
  busObj.updateMatrixWorld(true);
  return b;
}
const onRoof = (lx, lz, out = new THREE.Vector3()) => out.set(lx, 0.07, lz).applyMatrix4(busObj.matrixWorld);

// ---------- you ----------
// returns { p: where you stand (world), yaw (world), onBus, q (pose) | run (gait) }
const TAXI = CARS[TAXI_I];
function youAt(v, L, b) {
  const P = new THREE.Vector3();
  const sway = 0.04 * Math.sin(v * 1.7);
  if (v < 2.6) {
    // knee-deep, facing the camera, flinching at the sky
    P.set(YOU0.x, 0, YOU0.z);
    return { p: P, yaw: -0.25 + 0.06 * Math.sin(v * 0.9), q: { head: [-0.5 + 0.1 * Math.sin(v * 2.2), 0.35 * Math.sin(v * 0.8)], lean: -0.05, curl: 0.8 },
      hands: (hd, fw, rt) => ({ R: hd.clone().addScaledVector(fw, 0.24).addScaledVector(rt, 0.14).add(new THREE.Vector3(0, 0.16 + 0.03 * Math.sin(v * 7), 0)), L: hd.clone().addScaledVector(fw, 0.2).addScaledVector(rt, -0.18).add(new THREE.Vector3(0, 0.08 + 0.03 * Math.sin(v * 6), 0)), grip: 0.2, wristUp: 0.6 }) };
  }
  const tA = new THREE.Vector3(6.1, 0, 2.7);
  if (v < 3.6) {
    // wading to the taxi wedged behind the bus
    const k = smooth(2.6, 3.6, v);
    P.set(lerp(YOU0.x, tA.x, k), 0, lerp(YOU0.z, tA.z, k));
    const yaw = lerp(-0.25, Math.atan2(tA.x - YOU0.x, tA.z - YOU0.z), smooth(2.6, 2.9, v));
    return { p: P, yaw, run: { ph: v * 8, amp: 0.45, t: v } };
  }
  const roofA = carRoof(TAXI, v, L, -0.15, 0.1).p;
  const roofF = carRoof(TAXI, v, L, -0.1, -0.85).p;
  if (v < 4.2) {
    // up onto the taxi's roof
    const k = smooth(3.6, 4.2, v);
    P.lerpVectors(tA, roofA, k); P.y += Math.sin(Math.PI * k) * 0.35;
    return { p: P, yaw: lerp(Math.atan2(tA.x - YOU0.x, tA.z - YOU0.z), Math.PI, k), q: { lean: 0.45 * Math.sin(Math.PI * k), lift: [0.35 * Math.sin(Math.PI * k), 0.15], armsFwd: 0.7 * Math.sin(Math.PI * k), head: [0.2, 0] } };
  }
  if (v < 4.65) {
    // forward to the front of its roof, reaching up for the bus roof's edge
    const k = smooth(4.2, 4.65, v);
    P.lerpVectors(roofA, roofF, k);
    return { p: P, yaw: Math.PI, q: { head: [-0.6 * k, 0], lean: -0.05 },
      hands: (hd, fw, rt) => ({ R: hd.clone().addScaledVector(fw, 0.3).addScaledVector(rt, 0.2).lerp(onRoof(0.05, 6.05), k), L: hd.clone().addScaledVector(fw, 0.3).addScaledVector(rt, -0.2).lerp(onRoof(0.65, 6.05), k), grip: 0.7 }) };
  }
  const land = onRoof(0.3, 4.7);
  if (v < 5.55) {
    // the pull-up: over the edge on your belly, the man on the roof hauling you by the arms
    const k = smooth(4.65, 5.55, v);
    const edge = onRoof(0.3, 6.25); edge.y -= 0.75;
    if (k < 0.5) P.lerpVectors(roofF, edge, k * 2); else P.lerpVectors(edge, land, k * 2 - 1);
    return { p: P, yaw: Math.PI + b.yaw, onBus: true, q: { lean: 1.25 * Math.sin(Math.PI * clamp(k * 1.1)), lift: [0.45 * k, 0.25 * k], head: [-0.3, 0] },
      hands: () => ({ R: onRoof(0.05, lerp(6.0, 4.0, k)), L: onRoof(0.65, lerp(6.0, 4.1, k)), grip: 0.8 }) };
  }
  if (v < 6.4) {
    // up on your knees, then standing
    const k = smooth(5.55, 6.4, v);
    P.copy(onRoof(0.3, lerp(4.7, 3.6, k)));
    return { p: P, yaw: Math.PI + b.yaw + lerp(0, 0.4, k), onBus: true, q: { hipY: lerp(0.45, 0.91, k), lean: lerp(0.65, 0.05, k), armsFwd: lerp(0.5, 0.1, k), armsOut: 0.2, head: [lerp(0.2, -0.2, k), 0] } };
  }
  // on the bus roof from here on
  const lurch = Math.exp(-Math.max(0, v - V_BUS) * 2.2) * smooth(V_BUS - 0.05, V_BUS + 0.15, v);
  const press = smooth(26.3, 28.2, v);
  let lz = lerp(3.6, 1.3, smooth(6.4, 8.0, v)), lx = 0.3;
  let yaw = Math.PI + b.yaw + 0.4, q;
  const arms = { armsOut: 0.3 + 0.35 * lurch + 0.15 * smooth(8.4, 9.5, v), armsFwd: 0.15 };
  if (v < 10.2) {
    yaw = lerp(Math.PI + b.yaw + 0.4, Math.PI + b.yaw - 0.2, smooth(6.4, 8.5, v));
    q = { ...arms, hipY: 0.91 - 0.22 * lurch, lean: 0.1 * lurch, head: [-0.15 + 0.1 * Math.sin(v * 1.3), 0.5 * Math.sin(v * 0.7)] };
  } else if (v < 17) {
    // facing the balconies (+x), the right arm out to the people at the rail as you pass them
    yaw = lerp(Math.PI + b.yaw - 0.2, Math.PI / 2 + 0.15, smooth(10.2, 11.2, v));
    const r = smooth(12.6, 13.4, v) * (1 - smooth(16.2, 16.9, v));
    q = { ...arms, head: [-0.25, 0], lean: 0.05 };
    if (r > 0.02) {
      const up = new THREE.Vector3(0, 1, 0);
      return { p: onRoof(lx, lz), yaw, onBus: true, q, hands: (hd, fw, rt) => ({ R: hd.clone().addScaledVector(rt, 0.25).addScaledVector(up, -0.4).lerp(hd.clone().addScaledVector(fw, 0.6).addScaledVector(rt, 0.15).addScaledVector(up, 0.1 + 0.08 * Math.sin(v * 3)), r), grip: 0.3 }) };
    }
  } else {
    // toward the tower, then the summit; pressed down from 26.5 s (you weigh 10x as the push grows)
    const tgt = v < V_TOWER + 0.6 ? TOWER : SUMMIT;
    const tyaw = Math.atan2(tgt.x - b.x, tgt.z - b.z);
    yaw = tyaw + 0.15 * Math.sin(v * 0.5);
    if (v < 18.2) yaw = lerp(Math.PI / 2 + 0.15, tyaw, smooth(17, 18.2, v));
    if (v > V_SUMMIT + 0.8) yaw = lerp(tyaw, tyaw + 2.2, smooth(V_SUMMIT + 0.8, V_SUMMIT + 3, v));
    const look = v > V_LAND - 0.3 ? smooth(V_LAND - 0.3, V_LAND + 0.2, v) : 0;
    q = { armsOut: lerp(arms.armsOut, 0.25, press), armsFwd: lerp(0.15, 0.55, press), armsUp: 0.95 * look, hipY: lerp(0.91, 0.42, press), lean: lerp(0.05, 0.45, press) - 0.35 * look,
      head: [lerp(-0.2, -0.5, press) - 0.6 * look + 0.08 * Math.sin(v * 1.1), 0.4 * Math.sin(v * 0.4)], curl: 0.7 };
  }
  P.copy(onRoof(lx, lz));
  const res = { p: P, yaw, onBus: true, q };
  if (v > 17 && (press > 0.15 || v > V_LAND - 0.3)) {
    const look = smooth(V_LAND - 0.3, V_LAND + 0.2, v), up = new THREE.Vector3(0, 1, 0), base = P.clone();
    res.hands = (hd, fw, rt) => {
      const rR = base.clone().addScaledVector(fw, 0.5).addScaledVector(rt, 0.24).addScaledVector(up, 0.04);
      const rL = base.clone().addScaledVector(fw, 0.5).addScaledVector(rt, -0.24).addScaledVector(up, 0.04);
      const sR = hd.clone().addScaledVector(up, 0.32).addScaledVector(rt, 0.2).addScaledVector(fw, 0.12);
      const sL = hd.clone().addScaledVector(up, 0.3).addScaledVector(rt, -0.2).addScaledVector(fw, 0.12);
      return { R: rR.lerp(sR, look), L: rL.lerp(sL, look), grip: 0.4, wristUp: 0.5 * look };
    };
  }
  return res;
}
function placeYou(y) {
  // the figure's anchor is its right sole; centre it on y.p
  const s = 1;
  you.root.scale.setScalar(s);
  const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), y.yaw);
  if (y.onBus) {
    const qb = new THREE.Quaternion().setFromEuler(new THREE.Euler(busObj.rotation.x, 0, busObj.rotation.z, 'YXZ'));
    you.root.quaternion.copy(qb.multiply(qy));
  } else you.root.quaternion.copy(qy);
  const off = new THREE.Vector3(-0.105, 0, 0).applyQuaternion(you.root.quaternion);
  you.root.position.copy(y.p).add(off);
  if (y.run) you.run(y.run); else you.pose(y.q || {});
  you.root.updateMatrixWorld(true);
  // hands placed in the world (shielding your face, gripping the roof edge, reaching out, braced on the roof)
  if (y.hands) {
    const fw = new THREE.Vector3(0, 0, 1).applyQuaternion(you.root.quaternion), rt = new THREE.Vector3(-1, 0, 0).applyQuaternion(you.root.quaternion);
    const head = new THREE.Vector3(); you.head.getWorldPosition(head); head.y += 0.1;
    const hs = y.hands(head, fw, rt);
    // (the elbows bend out to your sides and down)
    const poleR = rt.clone().multiplyScalar(0.8).add(new THREE.Vector3(0, -1, 0)).addScaledVector(fw, -0.3);
    const poleL = rt.clone().multiplyScalar(-0.8).add(new THREE.Vector3(0, -1, 0)).addScaledVector(fw, -0.3);
    if (hs.R) you.armTo(0, hs.R, { pole: poleR, grip: hs.grip ?? 0.5, wristUp: hs.wristUp ?? 0 });
    if (hs.L) you.armTo(1, hs.L, { pole: poleL, grip: hs.grip ?? 0.5, wristUp: hs.wristUp ?? 0 });
    you.root.updateMatrixWorld(true);
  }
}

// ---------- the camera ----------
// Keys: [t, az (deg: where the camera is from you, in the world; 0 = +z, behind you up the avenue; 90 = +x), dist (m),
// h (m above your feet), lookY (m above your feet), fov, focus, w (0 = look at you .. 1 = at the focus)].
// az may be a string 'opp:tower' / 'opp:summit': on the far side of you from that place.
// On the bus roof the camera stays low (about a metre above the roof, out past its edge) so the roof is a strip at the
// bottom and the water and the city fill the frame.
const CK = [
  [-2, 12, 3.2, 2.35, 2.12, 62, null, 0],
  [2.5, 12, 3.2, 2.35, 2.12, 62, null, 0],
  [3.55, 6, 4.0, 2.0, 1.4, 62, null, 0],
  [4.5, 10, 4.6, 2.4, 1.7, 62, null, 0],
  [5.6, 12, 5.0, 2.3, 0.9, 62, null, 0],
  [6.6, -62, 8.0, 0.3, 1.0, 60, 'ahead', 0.06],
  [9.8, -58, 8.2, 0.3, 1.0, 60, 'ahead', 0.06],
  [11.0, -100, 4.2, 0.9, 1.6, 64, 'balc', 0.45],
  [16.4, -104, 4.4, 0.9, 1.7, 64, 'balc', 0.45],
  [18.0, -62, 8.0, 0.3, 1.0, 60, 'ahead', 0.06],
  [20.8, ['opp:tower', -32], 8.0, 0.3, 1.1, 62, 'tower', 0.2],
  [25.0, ['opp:tower', -36], 8.0, 0.3, 1.0, 62, 'tower', 0.15],
  [25.7, ['opp:summit', 7], 9.0, 5.0, 1.0, 58, 'mtnLow', 1.0],
  [28.6, ['opp:summit', 5], 8.5, 4.6, 0.8, 58, 'mtnLow', 1.0],
  [29.85, 30, 6.0, 0.35, 0.8, 60, null, 0],
  [30.4, 25, 6.0, 0.35, 0.8, 60, null, 0],
  [31.72, 20, 6.0, 0.4, 0.8, 62, null, 0],
  [35.6, 10, 5.0, 0.6, 0.8, 66, null, 0],
];
let LEVEL = 0;
const focusPoint = (name, P) => {
  switch (name) {
    case 'ahead': return new THREE.Vector3(8, P.y + 2, P.z - 140);
    case 'balc': return new THREE.Vector3(BAL.x0 - 1, P.y + 4.0, P.z - 2.5);
    case 'tower': return new THREE.Vector3(TOWER.x - TOWER.w / 2 + 4, Math.max(TOWER.h + 4, P.y + 1.5), TOWER.z + TOWER.w / 2 - 4);
    case 'summit': return new THREE.Vector3(SUMMIT.x - 2, Math.max(SUMMIT.h + 3, P.y + 1.5), SUMMIT.z + 7);
    // the mountain: aim between its waterline and its top, never below your eye line
    // the mountain in the band above the counter: look 13° down toward it (you below the counter)
    case 'mtnLow': return new THREE.Vector3(SUMMIT.x + 220, P.y + 4.8 - 980, SUMMIT.z);
    case 'mtn': return new THREE.Vector3(SUMMIT.x + 250, Math.max(P.y + 1.5, (Math.max(LEVEL, 600) + SUMMIT.h) * 0.5), SUMMIT.z);
  }
  return null;
};
function keyCam(k, P) {
  let az = k[1];
  if (Array.isArray(az) || typeof az === 'string') {
    const [name, off] = Array.isArray(az) ? az : [az, 0];
    const t = name === 'opp:tower' ? TOWER : SUMMIT;
    az = Math.atan2(P.x - t.x, P.z - t.z) / DEG + off;
  }
  const pos = new THREE.Vector3(P.x + Math.sin(az * DEG) * k[2], P.y + k[3], P.z + Math.cos(az * DEG) * k[2]);
  const look = new THREE.Vector3(P.x, P.y + k[4], P.z);
  const f = k[6] ? focusPoint(k[6], P) : null;
  if (f) { const d1 = look.clone().sub(pos).normalize(), d2 = f.clone().sub(pos).normalize(); look.copy(pos).add(d1.lerp(d2, k[7]).normalize().multiplyScalar(10)); }
  return { pos, look, fov: k[5], az };
}

// ---------- the cut-aways ----------
// the summit: just behind and above the last climbers, looking down the city face as the water races up it
const SC_CAM = (() => {
  const back = 7.0, side = 2.0;
  const x = SUMMIT.x - TO_CITY.x * back - TO_CITY.y * side, z = SUMMIT.z - TO_CITY.y * back + TO_CITY.x * side;
  return { x, z };
})();
function summitCam(v, L) {
  // at the climbers' eye level, a few metres behind them; tipping down the face as the water comes up it
  const y = Math.max(SUMMIT.h + 4.2, L + 3);
  const k = smooth(V_SC0, V_SUMMIT, v);
  camera.position.set(SC_CAM.x, y, SC_CAM.z);
  const reach = 60;
  const tgt = new THREE.Vector3(SUMMIT.x + TO_CITY.x * reach, SUMMIT.h - lerp(9, 13, k), SUMMIT.z + TO_CITY.y * reach);
  if (L > SUMMIT.h) tgt.y = Math.max(tgt.y, L - 12);
  const dir = tgt.sub(camera.position).normalize();
  return { pos: camera.position.clone(), dir, fov: 60 };
}
// the Himalaya: from the south-west, high over the water, the range ahead; closing in on Everest's top at the end
function everestCam(v, L) {
  const d = 13500;
  const pos = new THREE.Vector3(-0.707 * d, Math.max(10800, L + 260), -0.707 * d - 2500);
  const k = smooth(30.8, V_EVEREST - 0.05, v);
  const tgt = new THREE.Vector3(-1200 * (1 - k), lerp(6400, 8760, k), 600 * (1 - k));
  if (L > 8849) tgt.y = Math.max(tgt.y, L - 400);
  return { pos, dir: tgt.sub(pos).normalize(), fov: lerp(58, 12, k) };
}
function camLocal(v, P) {
  let i = 0;
  while (i < CK.length - 2 && v > CK[i + 1][0]) i++;
  const a = CK[i], b = CK[i + 1];
  const k = smooth(a[0], b[0], v);
  const A = keyCam(a, P), Bk = keyCam(b, P);
  // interpolate the azimuth the short way round (positions on the circle round you), then distance and height
  let da = Bk.az - A.az; da = ((da + 540) % 360) - 180;
  const az = (A.az + da * k) * DEG, dist = lerp(a[2], b[2], k), hh = lerp(a[3], b[3], k);
  const pos = new THREE.Vector3(P.x + Math.sin(az) * dist, P.y + hh, P.z + Math.cos(az) * dist);
  const dA = A.look.clone().sub(A.pos).normalize(), dB = Bk.look.clone().sub(Bk.pos).normalize();
  const dir = dA.lerp(dB, k).normalize();
  return { pos, dir, fov: lerp(a[5], b[5], k) };
}

// ---------- space ----------
const YDIR = new THREE.Vector3(0.16, 0.1, 0.98).normalize();       // where you are on the ball (day side)
const VIEW = new THREE.Vector3(0.1, 0.3, 1.0).normalize();          // where the camera ends up looking from
space.u.uSun.value.set(-0.35, 0.5, 0.8).normalize();
// the Moon: behind the ball, 21° off the line to the camera, so from the camera it sits just past the ball's edge at
// the end (the swelling ball closes in on it)
const MOON_DIR = (() => {
  const up = new THREE.Vector3(0, 1, 0).sub(VIEW.clone().multiplyScalar(VIEW.y)).normalize();
  const side = new THREE.Vector3().crossVectors(VIEW, up).normalize();
  const off = up.clone().multiplyScalar(Math.cos(0.5)).addScaledVector(side, Math.sin(0.5));
  return VIEW.clone().negate().multiplyScalar(Math.cos(21 * DEG)).addScaledVector(off, Math.sin(21 * DEG)).normalize();
})();
const V_CUT1 = V_OUT + 0.95;                                         // flash cut: local -> space
const FAR = 42000;                                                   // km from Earth's centre: the camera holds here
function spaceCamAt(v, R) {
  // out from ~2,600 km above you to 42,000 km from the centre, then held still while the ball swells; the dive back in
  let D;
  const D0 = R + 2600;
  if (v < V_DIVE) D = Math.exp(lerp(Math.log(D0), Math.log(FAR), smooth(V_CUT1, V_CUT1 + 1.7, v)));
  else D = Math.exp(lerp(Math.log(FAR), Math.log(D0), Math.pow(clamp((v - V_DIVE) / (V_CUT2 - V_DIVE)), 1.4)));
  const k = smooth(Math.log(D0), Math.log(FAR * 0.8), Math.log(D));
  const dir = YDIR.clone().lerp(VIEW, k).normalize();
  const youP = YDIR.clone().multiplyScalar(R);
  spaceCam.position.copy(dir).multiplyScalar(D);
  // aim a little above the centre, so the ball sits low in the frame (under the counter)
  const tgt = youP.clone().lerp(new THREE.Vector3(0, D * Math.tan(5.5 * DEG), 0), k);
  spaceCam.up.set(0, 1, 0);
  spaceCam.lookAt(tgt);
  spaceCam.fov = 50;
  spaceCam.near = Math.max(1, (D - R) * 0.05); spaceCam.far = 3e6;
  spaceCam.updateProjectionMatrix();
  spaceCam.updateMatrixWorld();
  return { D, youP, k };
}
// the old Earth's outline: a dashed ring the size of the Earth before the rain, facing the camera (drawn over the ball)
const ringU = { uK: { value: 0 } };
const oldRing = new THREE.Mesh(new THREE.RingGeometry(RE * 0.986, RE * 1.014, 256, 1), new THREE.ShaderMaterial({
  uniforms: ringU, transparent: true, depthTest: false, depthWrite: false,
  vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float uK; varying vec2 vP; void main(){ float a = atan(vP.y, vP.x); float dash = step(0.45, fract(a * 72.0 / 6.2831853));
    gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * 1.6, dash * uK); }`,
}));
oldRing.renderOrder = 20;
space.scene.add(oldRing);

// ---------- lamps (glows) ----------
const tmpV = new THREE.Vector3(), tmpC = new THREE.Color();
const proj = new THREE.Vector3();
let lastV = -1e9, fallAcc = 0;

function update(v, cover = -1) {
  const s = state(v);
  const L = s.level;
  LEVEL = L;
  DW.uLevel.value = L;
  const b = placeBus(v);
  const inSpace = v >= V_CUT1 && v < V_CUT2 && cover < 0;
  const inSummit = v >= V_SC0 && v < V_SC1 && cover < 0;
  const inEverest = v >= V_EC0 && v < V_EC1 && cover < 0;

  // ---------- you and the camera ----------
  const y = youAt(v, L, b);
  placeYou(y);
  const P = y.p;
  let cam = camLocal(v, P);
  // the pull-out (local, before the cut): straight up off you, looking down
  let up = 0;
  if (v > V_OUT && v < V_CUT1 + 0.01) up = smooth(V_OUT, V_CUT1, v);
  if (up > 0) {
    const kk = Math.pow(up, 1.6);
    const h = Math.exp(lerp(Math.log(5), Math.log(2600), kk));
    const back = new THREE.Vector3(Math.sin(10 * DEG), 0, Math.cos(10 * DEG));
    cam.pos.set(P.x + back.x * 4.4 * (1 - kk), P.y + Math.max(1.6, h), P.z + back.z * 4.4 * (1 - kk));
    const toYou = P.clone().add(new THREE.Vector3(0, 0.6, 0)).sub(cam.pos).normalize();
    cam.dir = cam.dir.clone().lerp(toYou, smooth(0, 0.25, kk)).normalize();
    cam.fov = 66;
  }
  if (v >= V_LAND) {
    // the end: low behind you on the bus roof, looking up past you at the falling water coming down
    const k = smooth(V_LAND, V_LAND + 0.5, v);
    cam.pos.set(P.x + Math.sin(10 * DEG) * 3.4, P.y + 0.9, P.z + Math.cos(10 * DEG) * 3.4);
    const lookAt = P.clone().add(new THREE.Vector3(0, 1.3 + 1.5 * k, 0)).sub(cam.pos).normalize();
    cam.dir = lookAt; cam.fov = 72;
  }
  if (inSummit) cam = summitCam(v, L);
  if (inEverest) cam = everestCam(v, L);
  // handheld drift, a jolt at the counter's big steps and when the bus lifts
  let punch = 0;
  for (const t of [...STEPS, V_BUS]) if (v >= t) punch = Math.max(punch, smooth(0, 0.05, v - t) * Math.exp(-Math.max(0, v - t - 0.05) * 4));
  if (window.__cover) punch = 0;
  camera.position.copy(cam.pos);
  const yawC = Math.atan2(-cam.dir.x, -cam.dir.z), pitchC = Math.asin(clamp(cam.dir.y, -1, 1));
  const shake = (1 + 2.5 * smooth(17, 29, v) * (1 - smooth(30, 32, v))) * (inEverest ? 0.3 : 1);
  camera.rotation.set(pitchC + (wobble(v * 0.35, 7) * 0.4 * shake - punch * 1.0) * DEG, yawC + (wobble(v * 0.4, 5) * 0.5 * shake + wobble(v * 9, 2) * 0.3 * punch) * DEG, (wobble(v * 0.3, 9) * 0.6 + wobble(v * 11, 3) * 0.7 * punch) * DEG);
  camera.fov = cam.fov - 2.5 * punch;
  camera.near = inEverest ? 5 : up > 0.3 ? 2 : 0.25;
  camera.far = inEverest ? 200000 : 300000;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  // keep the camera above the water (never the underwater screen)
  if (camera.position.y < L + 0.6) { camera.position.y = L + 0.6; camera.updateMatrixWorld(); }

  // ---------- sky, air, light ----------
  const space01 = smooth(V_EVEREST - 0.2, V_SPACE + 0.3, v);        // the sky goes black as the water passes the weather
  const clear = smooth(V_SUMMIT + 0.4, V_EVEREST - 0.4, v);         // the clouds tear open
  const bolt = s.bolt * (1 - space01) * (inEverest ? 0.3 : 1);
  const Rb = rng(Math.floor(s.boltV * 100) + 3);
  const su = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  su.uTime.value = v; su.uScroll.value = v * 0.05 + v * v * 0.0006; su.uFlash.value = bolt * 0.6;
  su.uBolt.value = bolt > 0.2 ? bolt : 0; su.uBoltAz.value = -camera.rotation.y + (Rb() - 0.5) * 40 * DEG; su.uBoltSeed.value = Rb() * 100;
  su.uSpace.value = space01; su.uClear.value = clear; su.uSun.value.copy(SUN_DIR);
  const fogD = 0.0013 * (1 - smooth(16, 22, v)) + 0.0003 * (1 - space01);
  scene.fog.density = inEverest ? 0.00001 : fogD;
  scene.fog.color.copy(FOG0).lerp(tmpC.setRGB(0.7, 0.74, 0.85), bolt * 0.3).lerp(tmpC.setRGB(0.25, 0.35, 0.55), clear);
  glows.mat.uniforms.uFogD.value = inEverest ? 0.000005 : v > 17 ? Math.min(fogD, 0.00012) : fogD;
  // the land: little haze (the mountain 5 km off has to read), a touch more in the storm
  TU.uFogD.value = inEverest ? 0.000012 : lerp(0.00011, 0.00004, clear);
  TU.uFogC.value.copy(scene.fog.color); TU.uFlash.value = bolt * 0.5;
  TU.uAmb.value.setRGB(0.62, 0.66, 0.7).multiplyScalar(1 - 0.5 * space01); TU.uSun.value.setRGB(0.3, 0.3, 0.3).lerp(tmpC.setRGB(1.3, 1.2, 1.05), clear);
  // the mountain catches a break of light in the storm (it has to read 5 km off); the Himalaya in hard high sun
  { const m = smooth(24.8, 25.6, v) * (1 - smooth(28.5, 28.6, v)); TU.uSun.value.lerp(tmpC.setRGB(1.0, 0.92, 0.78), m); TU.uAmb.value.multiplyScalar(1 - 0.25 * m); }
  if (inEverest) { TU.uAmb.value.setRGB(0.2, 0.24, 0.32); TU.uSun.value.setRGB(1.05, 0.98, 0.86); }
  TU.uLight.value.copy(SUN_DIR);
  if (inEverest) TU.uLight.value.set(-0.75, 0.45, 0.2).normalize();
  water.u.uFogD.value = inEverest ? 0.000008 : fogD; water.u.uFogC.value.copy(scene.fog.color); water.u.uFlash.value = bolt;
  water.u.uSkyTop.value.setRGB(0.15, 0.17, 0.2); water.u.uSkyLow.value.setRGB(0.3, 0.33, 0.37);
  water.u.uSpace.value = space01; water.u.uSun.value.copy(SUN_DIR);
  water.u.uChop.value = lerp(0.45, 1.0, smooth(12, 30, v));
  water.u.uFoam.value = 1.0 * (1 - smooth(14, 20, v)) + 0.15;
  water.u.uFlow.value.set(0, -(v < 12 ? 2.6 * v : 31.2 + (v - 12) * 0.8));
  water.u.uBrown.value = 1 - smooth(10, 18, v);
  water.u.uRefl.value = lerp(0.6, 1.0, smooth(10, 18, v));
  // the water: brown flood in the street, green-grey over the city, blue in the open
  DW.uMurk.value.setRGB(0.09, 0.075, 0.045).lerp(tmpC.setRGB(0.03, 0.06, 0.06), smooth(10, 20, v)).lerp(tmpC.setRGB(0.008, 0.035, 0.07), smooth(24, 32, v));
  F.uFlash.value = bolt * 0.6; F.uTime.value = v; F.uGrid.value = 1;
  const storm = 1 - space01;
  hemi.intensity = (1.7 + 1.4 * bolt) * (0.35 + 0.65 * storm);
  hemi.color.setRGB(0.66, 0.71, 0.78).lerp(tmpC.setRGB(0.25, 0.35, 0.55), clear);
  skyL.intensity = 0.9 * storm;
  sun.intensity = 3.0 * clear;
  sun.position.copy(camera.position).addScaledVector(SUN_DIR, 500); sun.target.position.copy(camera.position);
  key.position.copy(camera.position).add(new THREE.Vector3(0, 1.2, 0)); key.intensity = 2.5 * storm * (v < V_OUT || v >= V_LAND ? 1 : 0) * (inSummit || inEverest ? 0 : 1);

  // ---------- everything ----------
  const local = !inSpace && !inEverest;
  glows.begin(inSpace ? spaceCam : camera);
  const showStreet = v < 30 && !inSummit;
  for (const o of world.group) o.visible = local;
  for (const o of everest.group) o.visible = inEverest;
  bus.group.visible = local && !inSummit; you.root.visible = local && !inSummit;
  bus.group.position.copy(busObj.position); bus.group.quaternion.copy(busObj.quaternion);
  for (const o of actors.group) o.visible = local;
  VIEW_T.copy(P);
  actors.frame(v, s, b, busObj, glows, camera.position, showStreet && local);
  // the street up close (the first seconds): gauge, junk, falls, splashes; foam round what stands in the current
  const nearStreet = local && !inSummit && v < 15;
  {
    const rate = 1 + 1.2 * clamp((s.L - 5) / 3);
    street.frame(v, L, rate, tmpC.setRGB(0.62, 0.65, 0.7).multiplyScalar(1 + 2.5 * bolt), nearStreet);
    street.beginSurf();
    const obs = water.u.uObs.value, obsS = water.u.uObsS.value;
    let no = 0;
    const ob = (x, z, yaw, hw, hl, k = 1) => { if (no >= 24) return; obs[no].set(x, z, Math.cos(yaw), Math.sin(yaw)); obsS[no].set(hw, hl, k, 0); no++; };
    if (nearStreet) {
      // the water in view: a few big patches ahead of the camera
      const fw = new THREE.Vector3(); camera.getWorldDirection(fw); fw.y = 0; fw.normalize();
      const cyaw = Math.atan2(fw.x, fw.z);
      for (const [dd, hw, hl, dn] of [[3.5, 2.2, 1.6, 1], [7, 4, 2, 1], [12, 6, 3, 0.9], [19, 8, 4, 0.7]]) for (let r = 0; r < (dd > 10 ? 2 : 3); r++) street.surf(camera.position.x + fw.x * dd, L + 0.01, camera.position.z + fw.z * dd, cyaw, hw, hl, dn);
      // car roofs and bonnets near the camera
      const near = CARS.map((c) => ({ c, f: carFrame(c, v, L) })).filter((o) => o.f.y + 1.2 > L && camera.position.distanceTo(tmpV.set(o.f.x, o.f.y, o.f.z)) < 28)
        .sort((a, b2) => camera.position.distanceToSquared(tmpV.set(a.f.x, 0, a.f.z)) - camera.position.distanceToSquared(tmpV.set(b2.f.x, 0, b2.f.z)));
      for (const { c, f } of near.slice(0, 12)) {
        if (v < c.vSink + 0.5) { const r = carRoof(c, v, L, 0, 0).p; street.surf(r.x, r.y + 0.02, r.z, f.yaw, 0.7, 0.95, 0.8); }
        if (f.y + 0.95 > L) street.surf(f.x, f.y + 0.95, f.z, f.yaw, 0.85, 2.2, 0.6);
        ob(f.x, f.z, -f.yaw, 0.95, 2.35, f.y + 0.3 > L - 0.6 ? 1 : 0.5);
      }
      // the bus roof, you (hood and shoulders), the gauge, the awnings
      street.surf(busObj.position.x, busObj.position.y + 0.08, busObj.position.z, busObj.rotation.y, 1.15, 5.8, 1);
      { const hd = new THREE.Vector3(); you.head.getWorldPosition(hd); street.surf(hd.x, hd.y + 0.23, hd.z, 0, 0.09, 0.09, 1); street.surf(hd.x, hd.y - 0.12, hd.z, y.yaw, 0.2, 0.08, 1); }
      street.surf(GAUGE.x, 2.27, GAUGE.z, 0.25, 0.16, 0.05, 1);
      for (const a of street.AWN) if (a.y > L && Math.abs(a.z - camera.position.z) < 45) street.surf(a.x, a.y + 0.2, a.z, 0, 0.6, a.w / 2, 0.7);
      ob(busObj.position.x, busObj.position.z, -busObj.rotation.y, 1.3, 6.1, 1);
      if (!y.onBus) ob(P.x, P.z, 0, 0.22, 0.15, 1);
      ob(GAUGE.x, GAUGE.z, 0, 0.06, 0.06, 1);
    }
    street.endSurf();
    for (let i = no; i < 24; i++) obsS[i].set(0, 0, 0, 0);
    water.u.uWall.value = nearStreet ? 1 : 0;
  }
  if (local) {
    if (!inSummit) {
      // street lamps (dim under the water)
      if (camera.position.y < 120) for (const l of LAMPS) {
        const hx = l.x - l.side * 1.7, hy = 7.75, hz = l.z;
        const kk = hy > L ? 1 : Math.exp(-(L - hy) / 0.8) * 0.6;
        if (kk > 0.02) glows.add(hx, hy, hz, 1.2, 2.6 * kk, 2.2 * kk, 1.6 * kk);
      }
      // the tower's spire light
      if (L < TOWER.h + TOWER.spire) glows.add(TOWER.x, TOWER.h + TOWER.spire + 0.5, TOWER.z, 3.5, 6 * (Math.sin(v * 4) > 0 ? 1 : 0.2), 0.3, 0.2);
      // the bus's own lights
      const bl = (lx, ly, lz, sz, r, g, bb) => { tmpV.set(lx, ly, lz).applyMatrix4(busObj.matrixWorld); const kk = tmpV.y > L ? 1 : Math.exp(-(L - tmpV.y) / 0.8) * 0.6; glows.add(tmpV.x, tmpV.y, tmpV.z, sz, r * kk, g * kk, bb * kk); };
      for (const sx of [-1, 1]) { bl(sx * 0.98, -2.33, -6.2, 0.8, 3, 2.8, 2.4); bl(sx * 1.02, -2.13, 6.2, 0.6, 2.5, 0.15, 0.05); }
    }
    // the mountain's lights: the town, cars on the road, headlamps on the trail
    if (v > 15 && v < 31) world.mtn.frame(v, glows, camera, L);
  }
  glows.end();
  if (!inSpace) {
    water.frame(v, L, camera, inEverest ? 2400000 : 160000);
    // the rain: heavier, faster, thicker with every step (dense from the very first frame)
    const k = clamp((s.L - 5) / 7);
    const dt = clamp(v - lastV, 0, 0.1); lastV = v;
    const spd = 1 + 1.6 * k;
    fallAcc = dt > 0 ? fallAcc + dt * spd : v * spd;
    rain.u.uFall.value = fallAcc; rain.u.uSpeed.value = spd;
    rain.u.uLen.value = 1.35 + 1.9 * k; rain.u.uWid.value = 1.15 + 0.8 * k; rain.u.uN.value = 0.85 + 0.15 * k;
    const mtnShot = smooth(25.2, 25.8, v) * (1 - smooth(28.4, 28.6, v));
    rain.u.uK.value = 1.55 * (1 - 0.45 * k) * (1 - 0.5 * space01) * (1 - 0.55 * mtnShot) * (inEverest ? 0 : inSummit ? 0.6 : 1) * (1 + 0.8 * smooth(V_LAND, V_WHITE, v));
    rain.u.uRide.value = L;
    rain.frame(v, camera, L);
    rain.u.uLight.value.setRGB(0.55, 0.58, 0.64).multiplyScalar(1 + 3 * bolt).lerp(tmpC.setRGB(1.0, 0.95, 0.85), clear);
  }
  // the falling water at the very end
  {
    const k = clamp((V_WHITE - v) / (V_WHITE - V_LAND));
    const hgt = 2.2 + 240 * Math.pow(k, 1.5);
    wall.visible = local && v > V_LAND - 0.05 && v < V_WHITE + 0.5;
    wall.position.set(P.x, P.y + hgt, P.z);
    wallU.uTime.value = v; wallU.uK.value = smooth(V_LAND - 0.05, V_LAND + 0.25, v);
  }

  // ---------- space ----------
  const R = RE + s.depth / 1000;
  let youScreen = null, moonScreen = null, ringScreen = null;
  if (inSpace) {
    spaceCamAt(v, R);
    space.frame(v, R, YDIR, spaceCam);
    space.rain.uK.value = 0.6;
    space.moon.position.copy(MOON_DIR).multiplyScalar(384400);
    youScreen = space.you.position.clone().project(spaceCam);
    // the old Earth's outline (once the camera has pulled out), and where to put the two small labels
    oldRing.position.set(0, 0, 0); oldRing.lookAt(spaceCam.position);
    ringU.uK.value = smooth(V_CUT1 + 1.0, V_CUT1 + 1.8, v) * (1 - smooth(V_DIVE, V_DIVE + 0.3, v));
    const upS = new THREE.Vector3().setFromMatrixColumn(spaceCam.matrixWorld, 1), rtS = new THREE.Vector3().setFromMatrixColumn(spaceCam.matrixWorld, 0);
    ringScreen = upS.multiplyScalar(Math.sin(-62 * DEG)).addScaledVector(rtS, Math.cos(-62 * DEG)).multiplyScalar(RE * 0.8).project(spaceCam);
    moonScreen = space.moon.position.clone().project(spaceCam);
  } else if (up > 0) {
    youScreen = P.clone().add(new THREE.Vector3(0, 1.0, 0)).project(camera);
  }
  renderPass.scene = inSpace ? space.scene : scene;
  renderPass.camera = inSpace ? spaceCam : camera;

  // ---------- post ----------
  renderer.toneMappingExposure = inSpace ? 1.15 : inEverest ? 0.95 : lerp(1.05, 0.95, clear);
  bloom.strength = inSpace ? 0.7 : 0.45;
  const f = finish.uniforms;
  f.uTime.value = v;
  {
    const mtnShot = smooth(25.2, 25.8, v) * (1 - smooth(28.4, 28.6, v));
    f.uRainK.value = inSpace ? 0 : (1.8 - 0.9 * clamp((s.L - 5) / 7)) * (1 - 0.6 * mtnShot) * (inEverest ? 0.3 : 1);
  }
  f.uSheet.value = 1 / (1 + 2.5 * clamp((s.L - 5) / 7));
  f.uDrops.value = inSpace || inEverest ? 0 : 0.55;
  // a flash on each cut (lightning-white), plus a little at each lightning stroke
  let cutF = 0;
  for (const t of [V_CUT1, V_CUT2, V_SC0, V_SC1, V_EC0, V_EC1]) cutF = Math.max(cutF, Math.exp(-Math.abs(v - t) / 0.06));
  f.uFlash.value = bolt * 0.07 + 0.85 * cutF;
  let white = s.white;
  if (cover >= 0) white = cover;
  f.uWhite.value = window.__cover ? 0 : white;
  f.uAb.value = punch * 1.2;
  f.uTitle.value = window.__cover ? 1.15 : s.title;
  f.uCounter.value = window.__cover ? 0 : (1 - white) * 0.9;

  s.hide = white;
  overlay(v, s);
  // the gold popup: one phrase saying what just went under (never a number)
  {
    const p = window.__cover ? null : popupAt(v);
    const a = p ? smooth(0, 0.06, p.dt) * (1 - smooth(POP - 0.35, POP, p.dt)) * (1 - white) : 0;
    stampEl.style.opacity = a.toFixed(3);
    if (a > 0) {
      if (stampEl.textContent !== p.say) stampEl.textContent = p.say;
      const fit = Math.max(60, Math.min(112, 1750 / p.say.length));
      stampEl.style.fontSize = `${fit.toFixed(1)}px`;
      stampEl.style.transform = `translateY(${(22 * (1 - smooth(0, 0.18, p.dt))).toFixed(1)}px)`;
    }
  }
  // the small labels in space: YOU over your point, MOON, and the old Earth's size on its ring
  const place = (el, scr, a, dx, dy) => {
    if (scr && scr.z < 1) { el.style.left = `${((scr.x * 0.5 + 0.5) * W + dx).toFixed(1)}px`; el.style.top = `${((1 - (scr.y * 0.5 + 0.5)) * H + dy).toFixed(1)}px`; }
    el.style.opacity = (window.__cover || !scr ? 0 : a * (1 - white)).toFixed(3);
  };
  place(youEl, youScreen, inSpace ? 1 : clamp((camera.position.y - P.y - 25) / 60), -120, -128);
  place(moonEl, moonScreen, inSpace ? smooth(V_CUT1 + 1.2, V_CUT1 + 1.8, v) * (1 - smooth(V_DIVE, V_DIVE + 0.3, v)) : 0, -120, -78);
  place(ringEl, ringScreen, inSpace ? ringU.uK.value : 0, -200, -18);
  return s;
}

let comp = null;
// t is video time. The last LOOP seconds replay the moments just before the first frame while the white clears.
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
  await space.ready;
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  for (const t of [40, 30, 20, 10, 0]) renderFrame(t);   // compile everything once
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, you, bus, actors, CK, THREE };
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

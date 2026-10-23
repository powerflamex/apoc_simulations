import { WIDE } from './wide.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeCity } from './city.js';
import { makeStreet, SU } from './street.js';
import { makeFx } from './fx.js';
import { makeGojo } from './gojo.js';
import { makeVoid } from './void.js';
import { makeCrowd } from './crowd.js';
import { makeGlows } from './glows.js';
import { makeSmoke } from './smoke.js';
import { PEOPLE, personPose } from './people.js';
import { updateCuts } from './cuts.js';
import { makeOverlay } from './overlay.js';
import { state, beatAt, VIDEO_DURATION, LOOP, GOJO, BLUE, CAM0, V_RELEASE, BALL_LAND, V_RED_FORM, V_RED, V_RED_HIT, RED_P1, PURPLES, purpleAt,
  V_SIGN, V_DOMAIN, V_INSIDE, V_WHITE, voidR, blueOn } from './timeline.js';
import { DEG, lerp, smooth, wobble, clamp } from './util.js';
import { makeCompositor } from './compose.js';

const W = WIDE ? 1920 : 1080, H = WIDE ? 1080 : 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));
const RW = Math.round(W * RES), RH = Math.round(H * RES);

const stage = document.getElementById('stage');
// plain depth buffer: the near plane is 0.4 m (the close shots of him are a few metres off), the far city ~6 km
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, logarithmicDepthBuffer: false });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const FOG0 = new THREE.Color(0.1, 0.09, 0.15);
scene.fog = new THREE.FogExp2(FOG0.clone(), 0.00022);
const camera = new THREE.PerspectiveCamera(50, W / H, 0.4, 16000);
camera.rotation.order = 'YXZ';
scene.add(camera);

const plainMat = (color, rough = 0.9, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
const shadowy = (m) => { m.frustumCulled = false; return m; };
const ctx = { plainMat, glowMat, shadowy };

const sky = makeSky();
scene.add(sky.mesh);
const city = makeCity(scene);
const street = makeStreet(scene, ctx);
const glows = makeGlows(scene, 9000);
const smoke = makeSmoke(scene, 3200);
const crowd = makeCrowd(scene, PEOPLE.length, plainMat(0xffffff, 0.85), { castShadow: false });
PEOPLE.forEach((p, i) => crowd.color(i, ...p.col));
const gojo = makeGojo(scene);
const fx = makeFx(scene, ctx, street);
const vd = makeVoid(scene);
{
  const c = new THREE.Vector3(GOJO.x - CAM0.x, GOJO.y + 1.5 - CAM0.y, GOJO.z - CAM0.z).normalize();
  c.y += 0.16; vd.U.uC.value.copy(c.normalize());
}
const gojoMats = [];
gojo.root.traverse((o) => { if (o.isMesh && !gojoMats.includes(o.material)) gojoMats.push(o.material); });

const hemi = new THREE.HemisphereLight(0x3a4a7a, 0x2a1c16, 0.9);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0x9fb2ff, 0.35);
moon.position.set(0.08, 0.36, -1).multiplyScalar(1000);
scene.add(moon, moon.target);
// a light that only matters in the void: the ring behind him rims his outline
const ringLight = new THREE.DirectionalLight(0xdfe8ff, 0);
const gojoFill = new THREE.PointLight(0xc8d8ff, 10, 7, 2);
scene.add(gojoFill);
scene.add(ringLight, ringLight.target);

const overlay = makeOverlay();
const stampEl = document.getElementById('stamp');
const stampW = document.getElementById('stampw');
const youEl = document.getElementById('you');   // (the GOJO marker over his head while he is small on screen)

// ---------- post ----------
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
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.6, 0.5, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.34 }, uTitle: { value: 0 }, uCounter: { value: 0 }, uAb: { value: 0 }, uWarp: { value: 0 }, uWarpC: { value: new THREE.Vector2(0.5, 0.5) }, uT: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVig; uniform float uTitle; uniform float uCounter; uniform float uAb; uniform float uWarp; uniform vec2 uWarpC; uniform float uT;
    varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      // Blue bends the picture toward itself a little (a lens of gravity)
      vec2 d = (vUv - uWarpC) * vec2(1.0, ${(H / W).toFixed(4)});
      float r = length(d);
      vec2 uv = vUv - normalize(d + 1e-5) * uWarp * 0.02 * exp(-r * 6.0) * sin(min(r * 40.0, 3.14));
      vec2 off = c * uAb * 0.012;
      vec3 col = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.25);
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.5 * exp(-pow((vUv.y - ${WIDE ? '0.665' : '0.69'}) / ${WIDE ? '0.17' : '0.1'}, 2.0));
      col *= 1.0 - uCounter * 0.34 * exp(-pow((vUv.y - ${WIDE ? '0.35' : '0.53'}) / ${WIDE ? '0.11' : '0.065'}, 2.0)) * smoothstep(${WIDE ? '0.42' : '0.8'}, ${WIDE ? '0.08' : '0.2'}, vUv.x);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- Gojo's moves ----------
const P1 = PURPLES[0], P2 = PURPLES[1];
const YAW_P1 = Math.atan2(P1.d.x, P1.d.z), YAW_P2 = Math.atan2(P2.d.x, P2.d.z), YAW_CAM = Math.atan2(CAM0.x - GOJO.x, CAM0.z - GOJO.z);
const keyed = (list, v) => { if (v <= list[0][0]) return list[0][1]; for (let i = 0; i < list.length - 1; i++) { const [a, x] = list[i], [b, y] = list[i + 1]; if (v <= b) return lerp(x, y, smooth(a, b, v)); } return list[list.length - 1][1]; };
const YAW = [[-3, 0.12], [13.3, 0.12], [14.3, Math.PI], [22.6, Math.PI], [23.6, YAW_P1], [32.4, YAW_P1], [33.6, YAW_P2 + 2 * Math.PI - 2 * Math.PI], [39.8, YAW_P2], [40.6, YAW_CAM]];
// (from YAW_P1 ~ 2.8 down to YAW_P2 ~ -0.6 he turns through facing you)
function gojoPose(v) {
  const q = { x: GOJO.x, y: GOJO.y + 0.12 * Math.sin(v * 1.3) + 1.2 * smooth(V_DOMAIN, V_DOMAIN + 6, v), z: GOJO.z, yaw: keyed(YAW, v),
    lean: 0.04, sh: [0.12, 0.12], shOut: [0.1, 0.1], el: [0.25, 0.25], hip: [0.06, 0.24], knee: [0.12, 0.5], head: 0.05, fing: [0, 0], wrist: [0, 0], blind: 0 };
  // Blue: right hand out toward the point below him, two fingers up
  const kB = smooth(-3, -2, v) * (1 - smooth(12.9, 13.5, v));
  q.sh[1] = lerp(q.sh[1], 0.75, kB); q.shOut[1] = lerp(q.shOut[1], 0.75, kB); q.el[1] = lerp(q.el[1], 0.15, kB); q.fing[1] = kB; q.head = lerp(q.head, 0.28, kB); q.headYaw = 0.35 * kB;
  q.t = v;
  q.lean += 0.04 * Math.sin(v * 0.9 + 0.5); q.roll = 0.035 * Math.sin(v * 0.7);
  q.hip[0] += 0.08 * Math.sin(v * 1.1); q.hip[1] += 0.08 * Math.sin(v * 1.1 + 1.7); q.knee[1] += 0.1 * Math.sin(v * 1.3);
  q.sh[0] += 0.05 * Math.sin(v * 1.2 + 2.0);
  // Red: right arm straight up the avenue, finger pointing
  const kR = smooth(13.8, 14.6, v) * (1 - smooth(17.5, 18.5, v));
  q.sh[1] = lerp(q.sh[1], 1.5, kR); q.el[1] = lerp(q.el[1], 0.05, kR); q.fing[1] = Math.max(q.fing[1], kR); q.head = lerp(q.head, -0.05, kR);
  q.sh[1] += 0.25 * Math.exp(-Math.max(0, v - V_RED) / 0.15) * (v > V_RED ? 1 : 0);   // the flick
  // Purple 1: arms out to the sides (Blue left, Red right), then pushed together in front
  const kO = smooth(22.6, 23.4, v) * (1 - smooth(25.0, 25.8, v));
  const kT = smooth(25.0, 25.8, v) * (1 - smooth(28.5, 29.5, v));
  for (const k of [0, 1]) { q.shOut[k] = lerp(q.shOut[k], 1.35, kO); q.sh[k] = lerp(q.sh[k], 0.25, kO); q.el[k] = lerp(q.el[k], 0.3, kO); q.fing[k] = Math.max(q.fing[k], kO * 0.6);
    q.sh[k] = lerp(q.sh[k], 1.45, kT); q.shOut[k] = lerp(q.shOut[k], 0.18, kT); q.el[k] = lerp(q.el[k], 0.15, kT); q.fing[k] = Math.max(q.fing[k], kT); }
  // Purple 2: the same push, turned to you
  const kT2 = smooth(33.6, 34.4, v) * (1 - smooth(38.0, 39.0, v));
  for (const k of [0, 1]) { q.sh[k] = lerp(q.sh[k], 1.45, kT2); q.shOut[k] = lerp(q.shOut[k], 0.18, kT2); q.el[k] = lerp(q.el[k], 0.15, kT2); q.fing[k] = Math.max(q.fing[k], kT2); }
  // the Domain: left hand pulls the blindfold down, right hand up in front of his chest, two fingers crossed
  const kBl = smooth(V_SIGN, V_SIGN + 0.45, v) * (1 - smooth(V_SIGN + 1.0, V_SIGN + 1.4, v));
  q.sh[0] = lerp(q.sh[0], 2.5, kBl); q.el[0] = lerp(q.el[0], 2.2, kBl); q.shOut[0] = lerp(q.shOut[0], 0.35, kBl);
  q.blind = smooth(V_SIGN + 0.45, V_SIGN + 0.95, v);
  const kS = smooth(V_SIGN + 0.9, V_DOMAIN - 0.1, v);
  q.sh[1] = lerp(q.sh[1], 1.1, kS); q.el[1] = lerp(q.el[1], 1.9, kS); q.shOut[1] = lerp(q.shOut[1], 0.05, kS); q.fing[1] = Math.max(q.fing[1], kS); q.wrist[1] = lerp(0, -0.3, kS);
  q.head = lerp(q.head, -0.12, smooth(V_SIGN, V_SIGN + 1, v));
  return q;
}

// ---------- the camera: a shot list ----------
const v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
const Gc = (dy = 1.4) => new THREE.Vector3(GOJO.x, GOJO.y + dy, GOJO.z);
// a look point that puts `target` at height yFrac of the frame (0 = top), clear of the counter in the middle
function framed(pos, target, fov, yFrac) {
  const d = target.clone().sub(pos), dist = d.length();
  const a = Math.atan((0.5 - yFrac) * 2 * Math.tan(fov * DEG / 2));
  const horiz = Math.hypot(d.x, d.z), pitch = Math.atan2(d.y, horiz) - a;
  return new THREE.Vector3(pos.x + d.x / horiz * Math.cos(pitch) * dist, pos.y + Math.sin(pitch) * dist, pos.z + d.z / horiz * Math.cos(pitch) * dist);
}
const side1 = new THREE.Vector3(-P1.d.z, 0, P1.d.x);   // to his right-hand side for Purple 1 (east)
if (side1.x < 0) side1.multiplyScalar(-1);
function shotAt(v) {
  const k = (a, b) => smooth(a, b, v);
  if (v < 1.7) {
    // down on the avenue: people running past you, Blue ripping cars up off the street on his right, and him
    // above it all against the sky and the moon
    const t = k(-1.5, 1.7);
    const p = new THREE.Vector3(lerp(0.3, 0, t), 1.75, lerp(-46.5, -49, t)), fov = Math.exp(lerp(Math.log(50), Math.log(34), t));
    const aim = new THREE.Vector3(lerp(GOJO.x, BLUE.x, 0.5), GOJO.y + 1.6, lerp(GOJO.z, BLUE.z, 0.5));
    return { pos: v3.copy(p), look: v4.copy(framed(p, aim, fov, 0.14)), fov, hand: 0.8 };
  }
  if (v < 3.6) {
    // the long lens up at him from the street: silhouetted on the sky, the moon behind him
    const t = k(1.7, 3.6);
    // (from just west of the avenue's middle, so the line up to him passes clear of the thick of the debris round Blue)
    const p = new THREE.Vector3(lerp(-3.4, -2.8, t), lerp(9.5, 10.5, t), lerp(-61, -63, t)), fov = lerp(24, 21, t);
    return { pos: v3.copy(p), look: v4.copy(framed(p, Gc(1.0), fov, 0.16)), fov, hand: 0.4 };
  }
  if (v < 8.3) {
    // you, at the curb: the street being pulled up into the point over it
    const t = k(3.6, 8.3);
    return { pos: v3.set(CAM0.x, CAM0.y, CAM0.z), look: v4.set(lerp(3, 4, t), lerp(16, 19, t), lerp(-76, -88, t)), fov: lerp(46, 42, t), hand: 1 };
  }
  if (v < 12.9) {
    const t = k(8.3, 12.9);
    return { pos: v3.set(lerp(-9.5, -8.0, t), lerp(1.3, 1.8, t), lerp(-27, -31, t)), look: v4.set(BLUE.x, lerp(13, 16, t), BLUE.z), fov: lerp(58, 50, t), hand: 0.8 };
  }
  if (v >= 15.2 && v < 18.7) {
    // from high behind him: Red flies up the avenue, everything thrown aside, the tower hit
    const t = k(15.2, 18.7);
    return { pos: v3.set(lerp(4, 2, t), lerp(48, 56, t), lerp(-60, -75, t)), look: v4.set(0, lerp(40, 70, k(15.2, 16.4)), lerp(-400, -760, k(15.2, 16.4))), fov: lerp(46, 40, t), hand: 0.5 };
  }
  if (v < 18.7) {
    // you: the ball comes down, he turns, Red forms on his fingertip
    const z = 0;
    const look = new THREE.Vector3(lerp(BLUE.x * 0.6, 0, k(12.9, 14.6)), lerp(12, 22, k(12.9, 14.6)), lerp(-82, -92, k(12.9, 14.6))).lerp(new THREE.Vector3(0, 70, -760), z);
    return { pos: v3.set(CAM0.x, CAM0.y, CAM0.z), look: v4.copy(look), fov: Math.exp(lerp(Math.log(50), Math.log(24), z)), hand: 1 };
  }
  if (v < 22.8) {
    // closer to the tower as its top tips back and falls
    const t = k(18.7, 22.8);
    return { pos: v3.set(lerp(-6, -4, t), lerp(150, 135, t), lerp(-430, -460, t)), look: v4.set(0, lerp(120, 70, t), -790), fov: lerp(50, 54, t), hand: 0.4 };
  }
  if (v < 26.7) {
    // beside him (arms out, Blue left, Red right), then over his shoulder as he pushes them together
    const t = k(22.8, 24.6), w = k(24.4, 25.4);
    const pSide = Gc(0.7).addScaledVector(side1, lerp(2.6, 1.8, t)).addScaledVector(P1.d, lerp(7.5, 6.8, t));
    const pBack = Gc(2.0).addScaledVector(P1.d, lerp(-4.5, -6.5, k(25.4, 26.7))).addScaledVector(side1, 1.6);
    const lSide = framed(pSide, Gc(1.05), 46, 0.3);
    const lBack = Gc(0.8).addScaledVector(P1.d, 40);
    return { pos: v3.copy(pSide.lerp(pBack, w)), look: v4.copy(lSide.lerp(lBack, w)), fov: lerp(46, 58, w), hand: 0.5 };
  }
  if (v < 32.4) {
    // high above the city behind him: the sphere runs away to the horizon, cutting a trench through the towers
    const t = k(26.7, 32.4);
    const p = Gc(0).addScaledVector(P1.d, lerp(-60, 40, t)).addScaledVector(side1, 25); p.y = lerp(620, 660, t);
    return { pos: v3.copy(p), look: v4.copy(Gc(0).addScaledVector(P1.d, lerp(650, 1000, t))).setY(0), fov: lerp(58, 54, t), hand: 0.3 };
  }
  if (v < 40.6) {
    // you again: he turns to you, the bigger sphere forms front-left, comes past you; you look down at the edge
    const at = Gc(1.4);
    const p2 = P2.p0;
    const fov = lerp(lerp(lerp(9, 66, k(33.6, 35.3)), 70, k(35.4, 36)), 9, k(39.4, 40.6));
    const C0 = new THREE.Vector3(CAM0.x, CAM0.y, CAM0.z);
    const lookG = framed(C0, at, fov, 0.27).lerp(new THREE.Vector3(p2.x * 0.5, 22, p2.z * 0.5), k(33.6, 35.2) * 0.75);
    const lookPast = new THREE.Vector3(-55, 8, 30);
    const lookDown = new THREE.Vector3(-45, -16, 22);
    let L = lookG.clone().lerp(lookPast, k(35.4, 36.4)).lerp(lookDown, k(36.6, 37.8)).lerp(framed(C0, at, 9, 0.26), k(39.6, 40.6));
    return { pos: v3.set(CAM0.x, CAM0.y, CAM0.z), look: v4.copy(L), fov, hand: 1 };
  }
  if (v < V_INSIDE) {
    const fov = Math.exp(lerp(Math.log(9), Math.log(68), k(V_DOMAIN, V_INSIDE)));
    const p = new THREE.Vector3(CAM0.x - 1.5, CAM0.y, CAM0.z);
    return { pos: v3.copy(p), look: v4.copy(framed(p, Gc(1.0), fov, lerp(0.26, 0.4, k(V_DOMAIN, V_INSIDE)))), fov, hand: 0.6 };
  }
  // inside the void: drifting toward him; he floats in front of the black sphere
  const t = k(V_INSIDE, V_WHITE);
  const e = 1 - Math.pow(1 - t, 2);
  const p = new THREE.Vector3(lerp(CAM0.x - 1.5, 2, e), lerp(CAM0.y, 23.0, e), lerp(CAM0.z, -80, e)), fov = lerp(60, 38, e);
  return { pos: v3.copy(p), look: v4.copy(framed(p, Gc(1.0), fov, 0.84)), fov, hand: 0.3 };
}

const tmpC = new THREE.Color();
const tv = new THREE.Vector3();
function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) s.flash = Math.max(s.flash, cover);
  updateCuts(v);
  SU.uTime.value = v;
  for (const o of scene.children) if (o.userData.hv) { o.visible = true; o.userData.hv = false; }
  // ---------- camera ----------
  const sh = shotAt(v);
  const b = beatAt(v);
  let shake = 0.15 + 0.5 * s.blueOn * (1 - smooth(10, 12.9, v)) + 0.6 * smooth(V_RED, V_RED + 0.2, v) * (1 - smooth(V_RED + 0.8, V_RED + 2, v))
    + (v > V_RED_HIT + 2.3 && v < V_RED_HIT + 5 ? 0.7 * Math.exp(-(v - V_RED_HIT - 2.3) / 0.8) : 0);   // (the shock from the tower reaches you)
  const q2 = purpleAt(P2, v);
  if (v > P2.form0 && v < P2.end) shake += 0.5 * smooth(P2.form0, P2.fire, v) + 2.2 * Math.exp(-Math.abs(v - 35.93) / 0.35);
  if (v > P1.fire - 0.3 && v < P1.end) shake += 0.6 * Math.exp(-Math.abs(v - P1.fire) / 0.5);
  if (v > V_DOMAIN && v < V_INSIDE + 0.5) shake += 0.6 * smooth(V_DOMAIN, V_INSIDE, v);
  let punch = 0;
  if (b && !window.__cover) { punch = smooth(0, 0.05, b.dt) * Math.exp(-Math.max(0, b.dt - 0.05) * 5); shake += 1.5 * punch; }
  if (v > BALL_LAND && v < BALL_LAND + 1) shake += 1.4 * Math.exp(-(v - BALL_LAND) / 0.25);
  shake *= sh.hand;
  camera.position.copy(sh.pos);
  camera.position.x += wobble(v * 0.5, 2) * 0.05 + wobble(v * 13, 1) * 0.05 * shake;
  camera.position.y += wobble(v * 0.4, 3) * 0.04 + wobble(v * 11, 3) * 0.05 * shake;
  camera.lookAt(sh.look);
  camera.rotation.order = 'YXZ';
  camera.rotation.setFromQuaternion(camera.quaternion, 'YXZ');
  camera.rotation.y += (wobble(v * 0.4, 5) * 0.3 + wobble(v * 12, 4) * 0.35 * shake) * DEG;
  camera.rotation.x += (wobble(v * 0.35, 7) * 0.25 + wobble(v * 14, 6) * 0.4 * shake) * DEG + punch * 0.7 * DEG;
  camera.rotation.z += (wobble(v * 0.3, 9) * 0.4 + wobble(v * 7, 8) * 0.6 * shake) * DEG;
  camera.fov = sh.fov * (1 - 0.05 * punch);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // ---------- sky, air ----------
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / (WIDE ? RH * 16 / 9 : RH);
  u.uTime.value = v;
  u.uRed.value = (v > V_RED_HIT ? 1.4 * Math.exp(-(v - V_RED_HIT) / 0.6) + 0.35 * Math.exp(-(v - V_RED_HIT) / 6) : 0) + (v > V_RED && v < V_RED_HIT ? 0.3 : 0);
  const pOn = Math.max(purpleAt(P1, v).on * purpleAt(P1, v).r / P1.R, q2.on * q2.r / P2.R);
  u.uPurple.value = 0.6 * pOn;
  u.uDust.value = 0.35 * smooth(V_RED_HIT + 3, V_RED_HIT + 9, v);
  const fogD = 0.00018 + 0.00012 * smooth(V_RED_HIT + 3, V_RED_HIT + 10, v) * (1 - smooth(26, 28, v));
  scene.fog.density = fogD;
  scene.fog.color.copy(FOG0).lerp(tmpC.setRGB(0.18, 0.14, 0.13), smooth(V_RED_HIT + 3, V_RED_HIT + 9, v) * 0.7);
  glows.mat.uniforms.uFogD.value = fogD;
  street.signMat.uniforms.uFogD.value = fogD;

  // ---------- him ----------
  const gq = gojoPose(v);
  gojo.pose(gq);
  // a soft key light just in front of him, toward the camera (its reach ends a few metres off)
  gojo.headPos(tv);
  gojoFill.position.copy(tv).addScaledVector(camera.position.clone().sub(tv).normalize(), 2.6).add(new THREE.Vector3(0, 1.2, 0));
  gojoFill.intensity = s.inside ? 14 : 26;
  // in the void his outline is lit by the ring behind him
  ringLight.intensity = s.inside ? 3.0 : 0;
  ringLight.position.copy(camera.position).addScaledVector(vd.U.uC.value, 1000);
  ringLight.target.position.copy(camera.position);

  // ---------- the world ----------
  glows.begin(camera); smoke.begin();
  smoke.mat.uniforms.uTime.value = v;
  smoke.mat.uniforms.uLight.value.setRGB(0.35, 0.33, 0.38).multiplyScalar(1 + 2.5 * (v > V_RED_HIT ? Math.exp(-(v - V_RED_HIT) / 1.5) : 0));
  city.frame(v, smoke);
  fx.frame(v, s, camera, glows, smoke, gojo);
  if (!s.inside) { PEOPLE.forEach((p, i) => crowd.pose(i, personPose(p, v))); crowd.commit(); }
  // windows and screens near you mirrored in the wet street (soft glows below the ground plane)
  glows.end(); smoke.end();

  // ---------- the void ----------
  const inside = s.inside > 0;
  const showBubble = v >= V_DOMAIN && !inside;
  vd.bubble.visible = showBubble;
  if (showBubble) { vd.bubble.position.set(GOJO.x, GOJO.y + 1.2, GOJO.z); vd.bubble.scale.setScalar(Math.max(s.voidR, 0.01)); }
  vd.sky.visible = inside;
  vd.sky.position.copy(camera.position);
  vd.U.uTime.value = v;
  vd.U.uC.value.set(GOJO.x - camera.position.x, GOJO.y + 1.2 - camera.position.y, GOJO.z - camera.position.z).normalize();
  vd.U.uC.value.y += 0.2; vd.U.uC.value.normalize();
  vd.U.uInfo.value = smooth(V_INSIDE, V_WHITE - 0.5, v);
  vd.U.uWhite.value = smooth(V_WHITE - 1.6, V_WHITE, v) ** 2;
  vd.U.uRim.value = 1;
  // inside the void the city is gone: only he is left
  if (inside) for (const o of scene.children) if (o !== camera && o !== vd.sky && o !== vd.bubble && o !== gojo.root && !o.isLight && o.visible) { o.visible = false; o.userData.hv = true; }
  for (const m of gojoMats) { m.transparent = showBubble; }
  gojo.root.traverse((o) => { if (o.isMesh) o.renderOrder = showBubble ? 21 : 0; });
  hemi.intensity = inside ? 0.25 : 0.9;
  moon.intensity = inside ? 0 : 0.35;

  // ---------- post ----------
  renderer.toneMappingExposure = 1.0;
  bloom.strength = 0.55 + 0.1 * pOn - (inside ? 0.15 : 0);
  finish.uniforms.uT.value = v;
  {
    tv.set(BLUE.x, BLUE.y, BLUE.z).project(camera);
    finish.uniforms.uWarpC.value.set(tv.x * 0.5 + 0.5, tv.y * 0.5 + 0.5);
    finish.uniforms.uWarp.value = tv.z < 1 && Math.abs(tv.x) < 1.3 && Math.abs(tv.y) < 1.3 ? blueOn(v) : 0;
  }
  finish.uniforms.uAb.value = (0.1 * shake + punch * 0.6) * clamp(camera.fov / 45, 0.2, 1);
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : (1 - s.flash) * 0.9;

  overlay(v, s, v);
  {
    gojo.headPos(tv); tv.y += 0.25;
    const dist = camera.position.distanceTo(tv);
    const px = 1.9 / (2 * dist * Math.tan(camera.fov * DEG / 2)) * H;
    tv.project(camera);
    const sx = (tv.x * 0.5 + 0.5) * W, sy = (-tv.y * 0.5 + 0.5) * H;
    const vis = tv.z < 1 && sx > 90 && sx < W - 90 && sy > 140 && sy < H - 80 && !s.inside && v < V_DOMAIN;
    const a = window.__cover || !vis ? 0 : (1 - smooth(90, 150, px)) * (1 - s.flash);
    youEl.style.opacity = a.toFixed(3);
    if (a > 0) { youEl.style.left = `${(sx - 120).toFixed(1)}px`; youEl.style.top = `${(sy - 118).toFixed(1)}px`; }
  }
  {
    const a = b && !window.__cover ? smooth(0, 0.06, b.dt) * (1 - smooth(1.4, 1.9, b.dt)) * (1 - s.flash) : 0;
    stampEl.style.opacity = a.toFixed(3);
    stampW.style.opacity = a.toFixed(3);
    if (a > 0) {
      let txt = b.text;
      if (b.label === 'CRUSHED') txt = `${fx.BALL_TONS.toLocaleString('en-US')} tons`;
      if (stampEl.textContent !== txt) stampEl.textContent = txt;
      if (stampW.textContent !== b.label) stampW.textContent = b.label;
      stampEl.style.color = b.color;
      stampEl.style.fontSize = `${((b.small ? 110 : 138) * (1 + 0.3 * Math.exp(-b.dt * 9))).toFixed(1)}px`;
    }
  }
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
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  for (const t of [55, 45, 36, 27, 16, 8, 0]) renderFrame(t);
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
  let t = Number(params.get('still') ?? params.get('t') ?? 0);
  let playing = !params.has('still');
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

boot().catch((e) => { console.error(e); window.__error = String((e && e.stack) || e); });

// Camera, light and post for "What if your IQ was 1,000 times higher?" (1920x1080, 30 fps). The video is a pure
// function of time: renderFrame(v). The world runs on world time s.w (it slows as your brain speeds up, see
// timeline.js); the camera runs on the video clock: through your eyes on the plaza (you walk to the curb and catch
// the ball), then your mind's eye leaving your body to glide through the frozen street (2:20-4:45), then back.
// The first FF_LEN seconds replay the frozen plaza from V_FF (the flash-forward). Your phone (phone.js) shows the
// IQ test you just took on iqmaxx.ing at the start, and again near the end.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeCity } from './city.js';
import { makeCrowd } from './crowd.js';
import { peopleFrame, makeUmbrellas, NPEOPLE, ballAt, kidAt, CATCH, BALL_R } from './people.js';
import { makeTraffic } from './traffic.js';
import { makeRain } from './rain.js';
import { makeBirds } from './birds.js';
import { makeBubbles } from './bubbles.js';
import { makeBolt, BOLT_TOP, BOLT_GROUND } from './bolt.js';
import { makeFountain, makeBall, makeGuitar, makeWand, makeHand } from './props.js';
import { makeHud } from './hud.js';
import { makePhone } from './phone.js';
import { makeCube } from './cube.js';
import { makeChess } from './chess.js';
import { makeHolo } from './holo.js';
import { makeFuture } from './future.js';
import { makeMind } from './mind.js';
import { makeHospital } from './hospital.js';
import { makeMoney } from './money.js';
import { makeHeroPigeon } from './heropigeon.js';
import { makeOverlay } from './overlay.js';
import { state, SEC, W, VIDEO_DURATION, V_FF, FF_LEN, beatAt, worldT, DOUBLINGS, cutAt, CUTS, MONEY_V, PIGEON_CLOSE, CHESS_CLOSE } from './timeline.js';
import { YOU0, YOU1, EYE, GUITAR } from './layout.js';
import { DEG, smooth, wobble, clamp, lerp } from './util.js';
import { makeCompositor } from './compose.js';

const Wd = 1920, Hd = 1080;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));
const RW = Math.round(Wd * RES), RH = Math.round(Hd * RES);

const stage = document.getElementById('stage');
// plain depth buffer (a street-scale scene: near 0.05 m for the hand and the bubble, the far skyline ~3 km)
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x9aa6b4, 0.00042);
const camera = new THREE.PerspectiveCamera(48, Wd / Hd, 0.05, 9000);
camera.rotation.order = 'YXZ';
scene.add(camera);
const sky = makeSky();
scene.add(sky.mesh);

// the environment (reflections in the glass, the bubbles, the wet street): the sky, baked once
{
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = makeSky();
  envSky.mesh.geometry = new THREE.SphereGeometry(50, 32, 16);
  envSky.uniforms.uSunDir.value.set(-0.45, 0.62, 0.64).normalize();
  envSky.uniforms.uStorm.value = 0.3;
  envSky.uniforms.uSunCol.value.setScalar(0);   // (no hot sun spot mirrored in every window)
  envScene.add(envSky.mesh);
  scene.environment = pm.fromScene(envScene, 0.02, 0.1, 100).texture;
}

// light: the afternoon Sun behind you (south-west), the sky, and the lightning
const SUN = new THREE.Vector3(-0.45, 0.62, 0.64).normalize();
// ten years later: a clear golden evening, the Sun low in the west
const SUN_DUSK = new THREE.Vector3(-0.97, 0.12, 0.2).normalize();
const sunDir = new THREE.Vector3();
const sun = new THREE.DirectionalLight(0xfff0dc, 3.0);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
const sc = sun.shadow.camera;
sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 400;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xbfd4ee, 0x6b6257, 0.9);
scene.add(hemi);
const boltLight = new THREE.DirectionalLight(0xc8d4ff, 0);
boltLight.position.copy(BOLT_TOP).normalize().multiplyScalar(100);
scene.add(boltLight);

const shadowy = (m) => { m.castShadow = true; m.receiveShadow = true; };
const city = makeCity(scene, { shadowy });
const crowdMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
const crowd = makeCrowd(scene, NPEOPLE, crowdMat);
const crowdCache = new Int32Array(NPEOPLE).fill(-99);
const umbrellas = makeUmbrellas(scene, 40);
const traffic = makeTraffic(scene, { shadowy });
const rain = makeRain(scene);
const birds = makeBirds(scene);
const bubbles = makeBubbles(scene);
const bolt = makeBolt(scene);
const fountain = makeFountain(scene);
const ball = makeBall(scene);
const guitar = makeGuitar(scene);
const wand = makeWand(scene);
const hand = makeHand(scene, ball.mesh.material);
const hud = makeHud(stage);
const phone = makePhone(camera);
const cube = makeCube(camera);
const chess = makeChess(scene);
const holo = makeHolo(scene);
const future = makeFuture(scene);
const mind = makeMind();
const hospital = makeHospital();
const money = makeMoney(scene, worldT(MONEY_V));
const heroPigeon = makeHeroPigeon(scene);
const overlay = makeOverlay();

const rt = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(RW, RH);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
// (a high threshold: only lights, the bolt and the flash glow; bright sky mirrored in the glass doesn't haze over)
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.3, 0.4, 1.6);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.3 }, uTitle: { value: 0 }, uCounter: { value: 0 }, uAb: { value: 0 }, uCool: { value: 0 }, uHeat: { value: 0 }, uTime: { value: 0 }, uRing: { value: -1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVig, uTitle, uCounter, uAb, uCool, uHeat, uTime, uRing;
    float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
    varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      // your brain heating up: the air shimmers (strongest toward the edges) and the view reddens from the edges in
      float edge = smoothstep(0.18, 0.75, length(c * vec2(1.0, 0.75)));
      vec2 uv = vUv + uHeat * (0.0025 + 0.004 * edge) * vec2(vn(vUv * vec2(7.0, 22.0) + vec2(0.0, uTime * 2.2)) - 0.5, vn(vUv * vec2(7.0, 22.0) + vec2(5.0, uTime * 1.9)) - 0.5);
      // each doubling: a ripple races out from the middle and bends the picture as it passes
      if (uRing >= 0.0) {
        float rr = length(c * vec2(1.78, 1.0)), front = uRing * 2.2;
        float band = exp(-pow((rr - front) / 0.07, 2.0)) * (1.0 - uRing);
        uv -= normalize(c + 1e-5) * band * 0.018;
      }
      vec2 off = c * uAb * 0.01;
      vec3 col = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.22);
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = max(mix(vec3(lum), col, 1.1 - 0.25 * uCool), 0.0);
      col = mix(col, col * vec3(0.93, 1.0, 1.08), uCool);   // frozen time: a cooler, stiller look
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.8), c * vec2(1.0, 0.8)) * 2.2;
      float pulse = 0.85 + 0.15 * sin(uTime * 2.4);
      col = mix(col, col * vec3(1.3, 0.5, 0.36) + vec3(0.4, 0.05, 0.02) * edge, clamp(uHeat * (edge * 1.25 + 0.08) * pulse, 0.0, 1.0));
      col = mix(col, col * vec3(1.06, 0.97, 0.92), uHeat * 0.5);
      col *= 1.0 - uTitle * 0.5 * exp(-pow((vUv.y - 0.63) / 0.16, 2.0));
      col *= 1.0 - uCounter * 0.42 * exp(-pow((vUv.y - 0.15) / 0.11, 2.0)) * max(smoothstep(0.5, 0.12, vUv.x), smoothstep(0.62, 0.92, vUv.x));
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- the shots ----------
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
const K = (...pairs) => pairs;
// where you look (degrees; yaw + turns right, 0 = north up the avenue; fov vertical), video clock. Your eyes follow
// these keys; where they stand comes from your body (eyePos), except while your mind's eye glides.
const LOOK = {
  // the phone (6-10.5) -> the cube in your hands -> the walkers in slow motion -> the chess board -> up into the rain ->
  // the couple arguing -> the kid and the ball -> the car passing -> math in the sky and the pigeons -> the kid ("hi")
  // -> the guitar -> up at the cure building itself over the café -> the street going silent
  yaw: K([6, -4], [10.5, -4], [11.5, -2], [15.6, -2], [17.5, -14], [20.5, -22], [22.5, 44], [30.5, 46], [32, 10], [34, 0],
    [36, 66], [41, 66], [43.5, 36],
    [50, 26], [57, 14], [63.5, 9], [66, -26], [70, -6], [74, 4], [85.8, 4], [88, 14], [90.8, 24], [97.2, 40],
    [99, 58], [102, 60], [106, 84], [108, 87], [111, 87], [115, 2], [127, 4], [133, 4], [137, 2], [140, -2]),
  pitch: K([6, -3], [10.5, -4], [11.5, -9], [15.6, -9], [17.5, -1], [20.5, 0], [22.5, -19], [30.5, -18], [32, 8], [33.5, 22],
    [35, 4], [41, 2], [43.5, 0], [47, -14], [55, -26],
    [60, -33], [63.5, -36], [66, -12], [70, -4], [76, 10], [85.8, 30], [88, 26], [90.8, 16], [97.2, -14], [99, -24],
    [102, -22], [106, -6], [111, -6], [115, 24], [127, 24], [133, 8], [140, 6]),
  fov: K([6, 50], [11.5, 48], [16, 50], [20.5, 50], [22.5, 46], [30.5, 46], [33.5, 56], [36, 46], [41, 46], [43.5, 52], [63.5, 56], [70, 50], [79, 60],
    [85.8, 62], [90.8, 56], [97.2, 48], [102, 44], [106, 24], [108, 20], [111, 20], [115, 54], [127, 54], [133, 50], [140, 50]),
};
// the mind's eye: out of your body, through the hanging rain, up the avenue to the lightning; the fusion reactor
// igniting over the avenue; round to the rocket over the fountain and its path up to Mars (your brain heating up);
// back to you; then a slow drift around the bubble as it pops; back into your eyes as you let go
const E = { x: YOU1.x, y: EYE, z: YOU1.z };
const GLIDE = {
  x: K([140, E.x], [145, 0.9], [150, 1.2], [156, -2.6], [163, -3.4], [168, -2.6], [172, -2.0], [180, -1.6], [186, -2.2], [194, -2.0],
    [200, -4.0], [207, -3.5], [214, -3.0], [222, 5.5], [229, 6.4], [236, 3.0], [244, E.x + 0.05], [250, E.x], [262, 1.0], [274, -0.25], [283, E.x], [285, E.x]),
  y: K([140, E.y], [145, 2.2], [150, 2.6], [156, 2.0], [163, 3.4], [168, 60], [172, 125], [180, 132], [186, 7.5], [194, 9.0],
    [200, 3.0], [207, 2.2], [214, 2.0], [222, 2.0], [229, 1.6], [236, 1.8], [244, E.y], [250, E.y], [262, 1.72], [274, 1.62], [283, E.y], [285, E.y]),
  z: K([140, E.z], [145, E.z + 1.0], [150, -1.0], [156, -5.2], [163, -9.0], [168, -14], [172, -20], [180, -24], [186, -6.0], [194, -2.0],
    [200, -4.6], [207, -5.0], [214, -5.0], [222, -1.8], [229, -2.4], [236, -2.4], [244, E.z], [250, E.z], [262, -3.85], [274, -3.75], [283, E.z], [285, E.z]),
  yaw: K([140, -2], [145, -14], [150, -30], [156, 25], [163, 8], [168, 2], [172, -2], [180, -3], [186, -1], [194, 0], [200, -137],
    [207, -140], [214, -146], [222, -112], [229, -110], [236, -60], [244, -3], [250, -3], [262, -23], [274, 17], [283, -2], [285, -3]),
  pitch: K([140, 6], [145, -12], [150, -16], [156, -2], [163, 8], [168, 10], [172, 9], [180, 9], [186, 20], [194, 17], [200, 14],
    [207, 30], [214, 40], [222, -8], [229, -8], [236, -8], [244, 6], [250, 8], [262, 4], [274, 6], [283, 7], [285, 7]),
  fov: K([140, 50], [150, 56], [163, 50], [168, 54], [172, 56], [180, 54], [186, 44], [194, 40], [200, 56], [207, 62], [214, 62], [222, 52], [229, 52], [244, 50], [250, 50], [262, 46], [274, 46], [285, 50]),
};
// back in your eyes: everything rushes back, the kid takes his ball; TEN YEARS LATER: up the avenue at the new city and
// the rocket climbing; your phone; the question
const LATE = {
  yaw: K([285, -3], [291, 4], [294, 40], [295.8, 40], [297.5, 4], [305, 0], [312, -1], [318, 16], [328, 16], [331, 4], [336, 2]),
  pitch: K([285, 7], [291, 2], [294, -14], [295.8, -14], [297.5, 8], [305, 12], [312, 20], [318, -6], [328, -6], [331, 12], [336, 12]),
  fov: K([285, 50], [291, 54], [295.8, 50], [297.5, 52], [312, 50], [336, 52]),
};
// the flash-forward: gliding through the frozen street (the scene at V_FF + t)
const FF = {
  x: K([0, 0.95], [6, 0.55]), y: K([0, 1.55], [6, 1.64]), z: K([0, -2.7], [6, -3.45]),
  yaw: K([0, -12], [6, -5]), pitch: K([0, 10], [6, 8]), fov: K([0, 54], [6, 50]),
};

// the pigeon in close-up flies north-west over the curb, 2.5 m up (world time: it barely moves at 20x)
const PIGEON0 = new THREE.Vector3(-2.2, 2.5, -5.4);
function pigeonPos(w) { const d = w - worldT(PIGEON_CLOSE[0]); return new THREE.Vector3(PIGEON0.x - 2.2 * d, PIGEON0.y + 0.8 * d, PIGEON0.z - 4.5 * d); }

// your body: from where you stand to the curb (it walks in real time: slow to you); you crouch for the ball
function eyePos(w, out) {
  const k = smooth(W.walk, W.catch - 0.25, w);
  const x = lerp(YOU0.x, YOU1.x, k), z = lerp(YOU0.z, YOU1.z + 0.1, k);
  const crouch = smooth(W.catch - 0.9, W.catch - 0.1, w) * (1 - smooth(W.catch + 0.3, W.catch + 1.6, w));
  const walking = k > 0 && k < 1 ? 1 : 0;
  const bob = walking * 0.03 * Math.abs(Math.sin(w * Math.PI * 1.9));
  return out.set(x, EYE - 0.3 * crouch + bob, z);
}
// where the ball is: bouncing (people.js), in your hand, then back in the kid's hands
const ballPos = new THREE.Vector3(), wrist = new THREE.Vector3(), shoulder = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
const HOLD = new THREE.Vector3(YOU1.x + 0.1, 1.12, YOU1.z - 0.42);
function heldBall(w, out) {
  const up = smooth(W.catch + 0.1, W.catch + 1.6, w);
  out.set(lerp(CATCH.x, HOLD.x, up), lerp(CATCH.y, HOLD.y, up), lerp(CATCH.z, HOLD.z, up));
  // the closing: held out to the kid, who takes it
  const give = smooth(W.back + 2.6, W.back + 4.2, w);
  if (give > 0) { const k = kidAt(w); out.lerp(tmp.set(k.x - 0.15, 0.82, k.z + 0.2), give); }
  return out;
}

const tmpC = new THREE.Color();
const eye = new THREE.Vector3();
// v: the story moment to show; vv: the video clock (title, closing)
function update(v, vv = v) {
  const s = state(v);
  const sv = vv === v ? s : state(vv);
  s.title = sv.title; s.fadeOut = sv.fadeOut;
  const w = s.w;
  const ff = vv < FF_LEN;
  if (window.__cover) s.channel = 0.9;   // (the thumbnail: the bolt lit)

  // ---------- camera ----------
  const glide = !ff && v >= SEC.frozen && v < SEC.letgo;
  let x, y, z, yaw, pitch, roll = 0, fov;
  if (ff) {
    x = spline(FF.x, vv); y = spline(FF.y, vv); z = spline(FF.z, vv);
    yaw = spline(FF.yaw, vv); pitch = spline(FF.pitch, vv); fov = spline(FF.fov, vv);
  } else if (glide) {
    x = spline(GLIDE.x, v); y = spline(GLIDE.y, v); z = spline(GLIDE.z, v);
    yaw = spline(GLIDE.yaw, v); pitch = spline(GLIDE.pitch, v); fov = spline(GLIDE.fov, v);
  } else {
    eyePos(w, eye);
    x = eye.x; y = eye.y; z = eye.z;
    const L = v >= SEC.letgo ? LATE : LOOK;
    yaw = spline(L.yaw, v); pitch = spline(L.pitch, v); fov = spline(L.fov, v);
  }
  // a living hand-held drift (your head), calmer as time freezes
  const live = 0.3 + 0.7 * (1 - smooth(16, 64, s.f));
  yaw += wobble(vv * 0.23, 3) * 0.35 * live * (fov / 50); pitch += wobble(vv * 0.27, 4) * 0.25 * live * (fov / 50); roll += wobble(vv * 0.19, 5) * 0.25 * live;
  // the big word at each doubling: a small jolt
  const b = beatAt(v);
  let punch = 0;
  if (b && !window.__cover && !ff) punch = smooth(0, 0.06, b.dt) * Math.exp(-Math.max(0, b.dt - 0.06) * 4);
  // letting go: everything rushes back
  const rush = smooth(SEC.letgo, SEC.letgo + 2, v) * (1 - smooth(SEC.back - 1, SEC.back + 1.5, v));
  yaw += rush * 0.8 * Math.sin(vv * 23); pitch += rush * 0.6 * Math.sin(vv * 19 + 1);
  fov *= 1 - 0.03 * punch + 0.08 * rush;
  // close-ups in the plaza: the chess board (looking down over your side of it), one pigeon in flight
  if (!ff && v >= CHESS_CLOSE[0] && v < CHESS_CLOSE[1]) {
    const k = smooth(CHESS_CLOSE[0], CHESS_CLOSE[1], v);
    x = lerp(2.44, 2.58, k); y = lerp(1.24, 1.12, k); z = lerp(3.24, 3.12, k); yaw = lerp(44, 50, k); pitch = lerp(-36, -42, k); roll = 0; fov = lerp(42, 36, k);
  }
  if (!ff && v >= PIGEON_CLOSE[0] && v < PIGEON_CLOSE[1]) {
    const k = smooth(PIGEON_CLOSE[0], PIGEON_CLOSE[1], v), pp = pigeonPos(w);
    const a = lerp(1.5, 2.5, k);   // round its right side, front to back
    x = pp.x + Math.sin(a) * 1.5; y = pp.y + 0.3 - 0.15 * k; z = pp.z + Math.cos(a) * 1.5;
    yaw = Math.atan2(pp.x - x, -(pp.z - z)) / DEG; pitch = -9; roll = 0; fov = 38;
  }
  // the thumbnail: from the curb, up the avenue at the lightning, the hanging rain all around (node render.mjs --cover 181)
  if (window.__cover) { x = 0.2; y = 1.5; z = -3.2; yaw = -4; pitch = 15; roll = 0; fov = 52; }
  camera.position.set(x, y, z);
  camera.rotation.set(pitch * DEG, -yaw * DEG, roll * DEG);
  camera.fov = fov;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  s.self = glide && camera.position.distanceTo(tmp.set(YOU1.x, EYE, YOU1.z)) > 1.7;

  // ---------- light ----------
  const dim = s.sunDim;
  sunDir.copy(SUN).lerp(SUN_DUSK, s.future).normalize();
  sun.position.copy(sunDir).multiplyScalar(150).add(tmp.set(0, 0, -10));
  sun.target.position.set(0, 0, -10);
  sun.intensity = 3.6 * (1 - 0.85 * dim);
  sun.color.setRGB(1, 0.94, 0.86).lerp(tmpC.setRGB(1.0, 0.62, 0.32), s.future);
  if (s.future > 0) sun.intensity = lerp(sun.intensity, 2.6, s.future);
  hemi.intensity = lerp(0.85, 0.55, dim) + 1.3 * s.flash;
  hemi.color.setRGB(0.75, 0.83, 0.95).lerp(tmpC.setRGB(0.55, 0.6, 0.7), dim);
  boltLight.intensity = 9 * s.flash + 0.25 * s.channel;
  scene.fog.color.setRGB(0.6, 0.66, 0.72).lerp(tmpC.setRGB(0.25, 0.28, 0.33), dim).lerp(tmpC.setRGB(0.6, 0.64, 0.78), s.flash * 0.3);
  scene.fog.density = (0.00042 + 0.0011 * s.rain) * (window.__cover ? 0.35 : 1);
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  u.uSunDir.value.copy(sunDir); u.uClear.value = s.future; u.uSunCol.value.setRGB(1, 0.92, 0.8).lerp(tmpC.setRGB(1.2, 0.55, 0.25), s.future); u.uStorm.value = 0.25 + 0.75 * dim; u.uDim.value = dim; u.uFlash.value = s.flash; u.uGlow.value = s.channel;
  u.uBoltDir.value.copy(tmp.copy(BOLT_TOP).lerp(BOLT_GROUND, 0.35).sub(camera.position).normalize());
  u.uDrift.value.set(w * 0.004, w * 0.0025);
  // the wet street: darker and glossy once it rains
  const M = city.M;
  for (const [m, r0, c0] of [[M.paver, 0.85, 1], [M.asphalt, 0.92, 1], [M.sidewalk, 0.9, 1]]) {
    m.roughness = lerp(r0, 0.18, s.wet); m.color.setScalar(lerp(c0, 0.72, s.wet)); m.envMapIntensity = lerp(1, 2.2, s.wet);
  }

  // ---------- the world, at world time w ----------
  peopleFrame(w, s, crowd, crowdCache, umbrellas);
  traffic.frame(w);
  rain.frame(s, camera, RH);
  birds.frame(w);
  bubbles.frame(w, s, sunDir);
  cube.frame(vv);
  money.frame(w, s.future > 0.2 ? 1 : 0, v, MONEY_V);
  heroPigeon.frame(!ff && v >= PIGEON_CLOSE[0] - 0.5 && v < PIGEON_CLOSE[1] + 0.5, w, pigeonPos(w), 0.45);
  chess.frame(v);
  holo.frame(v, s, camera);
  future.frame(v, s);
  bolt.frame(s);
  fountain.frame(w, s);
  ball.frame(w);
  guitar.frame(w);
  wand.frame(w);
  // your hand: reaches for the ball as it bounces up, holds it (hidden while your mind's eye is out of your body)
  {
    const reach = smooth(W.catch - 0.75, W.catch, w);
    const held = w >= W.catch;
    const gone = smooth(W.back + 4.2, W.back + 5.2, w);      // the kid has it: your hand drops away
    // (while your mind's eye is just behind your head on its way back in, neither your body nor your hand shows)
    const between = glide && !s.self && camera.position.distanceTo(tmp.set(YOU1.x, EYE, YOU1.z)) > 0.35;
    const on = reach > 0.001 && !ff && !s.self && !between && gone < 1;
    // shoulder: right of and below your eyes
    tmp.set(0.22, -0.3, 0.05).applyQuaternion(camera.quaternion);
    shoulder.copy(camera.position).add(tmp);
    if (held) heldBall(w, ballPos);
    else { const bp = ballAt(W.catch - 1e-4); ballPos.set(bp.x, bp.y, bp.z); }
    // the wrist sits under and behind the ball; before the catch it rises from below toward where the ball will be
    wrist.copy(ballPos).add(tmp2.set(0, -BALL_R - 0.03, 0)).add(tmp.copy(shoulder).sub(ballPos).normalize().multiplyScalar(0.07));
    if (!held) wrist.lerp(tmp.copy(shoulder).add(tmp2.set(0.05, -0.45, -0.25).applyQuaternion(camera.quaternion)), 1 - reach);
    wrist.y -= 0.25 * gone;
    hand.frame(on, wrist, shoulder, held && w < W.back + 4.2 ? ballPos : null, held ? 1 : 0.2 * reach, 0);
    // once the kid has it, the ball rides in his hands
    if (w >= W.back + 4.2) { const k = kidAt(w); ball.mesh.visible = true; ball.mesh.position.set(k.x - 0.12, 0.8, k.z + 0.16); }
    else if (held && !on && !between) { ball.mesh.visible = true; ball.mesh.position.copy(ballPos); }
    else if (held && between) ball.mesh.visible = false;
  }

  // ---------- exposure, post ----------
  renderer.toneMappingExposure = lerp(1.0, 1.12, dim) * (1 + 0.22 * s.flash);
  bloom.strength = window.__cover ? 0.12 : 0.22 + 0.3 * s.flash + 0.15 * s.channel;
  finish.uniforms.uAb.value = punch * 0.5 + rush * 1.2;
  finish.uniforms.uCool.value = smooth(Math.log(30), Math.log(300), Math.log(s.f)) * 0.8 * (1 - 0.7 * s.heat);
  finish.uniforms.uHeat.value = window.__cover ? 0 : s.heat * (ff ? 0.45 : 1);
  finish.uniforms.uTime.value = vv;
  { let r = -1; if (!ff && !window.__cover) for (const d of DOUBLINGS) if (v >= d && v < d + 0.9) r = (v - d) / 0.9; finish.uniforms.uRing.value = r; }
  finish.uniforms.uTitle.value = window.__cover ? 1.2 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : 0.9;
  phone.frame(vv);
  // ---------- the cutaways: what you're thinking about ----------
  const cut = ff || window.__cover ? null : cutAt(v);
  if (cut) {
    if (cut.kind === 'sick' || cut.kind === 'cured') { hospital.frame(cut.kind, cut.u, v); renderPass.scene = hospital.scene; renderPass.camera = hospital.camera; bloom.strength = 0.35; bloom.threshold = 1.4; bloom.radius = 0.4; }
    else { mind.frame(cut.kind, cut.u, v); renderPass.scene = mind.scene; renderPass.camera = mind.camera; bloom.strength = cut.kind === 'cells' || cut.kind === 'fusion' ? 0.45 : 0.75; bloom.threshold = 0.9; bloom.radius = 0.5; renderer.toneMappingExposure = 1.0; }
    finish.uniforms.uCool.value = 0;
    if (cut.kind !== 'brain') finish.uniforms.uHeat.value = 0;
  } else { renderPass.scene = scene; renderPass.camera = camera; bloom.threshold = 1.6; bloom.radius = 0.4; }
  // a quick white blink at every cut in and out
  { let b = 0; if (!ff) for (const c of CUTS) for (const e of [c.from, c.to]) b = Math.max(b, Math.exp(-Math.abs(v - e) * 14)); s.white = Math.max(s.white || 0, b * 0.55); }
  hud.frame(camera, s, v, vv, { rain, birds, chess, dangerX: traffic.dangerX, heroPos: bubbles.heroPos, cut: !!cut });
  overlay(v, s, vv);
  return s;
}

let comp = null;
// t is video time
function renderFrame(t) {
  if (t < FF_LEN) update(V_FF + t, t);   // the flash-forward
  else update(t);
  composer.render();
  if (comp) comp.paint();
}

// ---------- boot ----------
async function boot() {
  await document.fonts.load('500 40px Cormorant');
  await document.fonts.load('italic 500 40px Cormorant');
  await document.fonts.load('600 40px Cormorant');
  await document.fonts.load('700 40px Cormorant');
  await document.fonts.ready;
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage, [hud.canvas]);
  for (const t of [2, 10, 30, 65, 90, 101, 120, 170, 230, 258, 320, 350, 370]) renderFrame(t);   // compile everything once
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, state, worldT };
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
  const fit = () => { stage.style.transform = `scale(${Math.min(innerWidth / Wd, innerHeight / Hd)})`; };
  fit();
  addEventListener('resize', fit);
  const hudEl = document.createElement('div');
  hudEl.id = 'hud';
  document.body.appendChild(hudEl);
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
    hudEl.textContent = `${t.toFixed(2)}s ${playing ? '▶' : '❚❚'}  ${(1 / Math.max(dt, 1e-3)).toFixed(0)}fps  [space] [←/→]`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

boot().catch((e) => {
  console.error(e);
  window.__error = String((e && e.stack) || e);
});

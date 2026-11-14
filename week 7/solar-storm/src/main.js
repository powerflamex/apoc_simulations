import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky, NSAT } from './sky.js';
import { makeGround, GU, NSPOT } from './ground.js';
import { makeCity, CU } from './city.js';
import { makePower, drawSparks, RUNNERS, runnerAt, wireAt, XF } from './power.js';
import { makeTraffic, cAt, C_X, EB_Z, HERO_N, carAt, nShove } from './traffic.js';
import { makePeople } from './people.js';
import { makePhone } from './phone.js';
import { makeGlows } from './glows.js';
import { makeOverlay } from './overlay.js';
import { CAM_X, camZ, EYE, LAMPS, lampHead, SIGNALS, SUBWAY, SIGNS, SCREENS } from './layout.js';
import { state, VIDEO_DURATION, LOOP, popupAt, captionAt, POP, ORIGIN, dieAt, V_HIT, V_XF, V_LINES, V_BUMP, V_PHONE, V_SUBWAY, V_SATS, V_CANDLE, V_FLARE, V_WHITE, V_FLICK } from './timeline.js';
import { lerp, smooth, wobble, clamp, keys } from './util.js';

const W = 1080, H = 1920, DEG = Math.PI / 180;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');

const stage = document.getElementById('stage');
// a plain depth buffer (street scale; the far skyline is 1.5 km off)
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.NeutralToneMapping;     // (ACES bleaches the aurora's greens and reds)
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, W / H, 0.25, 6000);
camera.rotation.order = 'YXZ';
scene.add(camera);

// ---------- the world ----------
const plainMat = (color, rough = 0.9, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };
const ctx = { plainMat, glowMat, shadowy };
const sky = makeSky();
scene.add(sky.mesh);
makeGround(scene);
const city = makeCity(scene, ctx);
const power = makePower(scene, ctx);
const traffic = makeTraffic(scene, ctx);
const people = makePeople(scene);
const phone = makePhone(camera, ctx);
const glows = makeGlows(scene, 5000);

// the light: the aurora fills the whole sky (green low, red high), brightest overhead and to the south behind you; before
// the hit the street lamps and signs add a warm fill near you
const auroraL = new THREE.DirectionalLight(0xffffff, 1);
auroraL.castShadow = true;
auroraL.shadow.mapSize.set(2048, 2048);
auroraL.shadow.bias = -0.0005; auroraL.shadow.normalBias = 0.05; auroraL.shadow.radius = 4;
Object.assign(auroraL.shadow.camera, { left: -40, right: 40, top: 60, bottom: -60, near: 10, far: 400 });
scene.add(auroraL, auroraL.target);
const AUR_DIR = new THREE.Vector3(0.25, 0.85, 0.45).normalize();
const hemi = new THREE.HemisphereLight(0xffffff, 0x221a1a, 1);
scene.add(hemi);
const warm = new THREE.HemisphereLight(0xffc890, 0x6a4a30, 0);
scene.add(warm);
const auroraG = new THREE.DirectionalLight(0x60ff90, 0);
auroraG.position.set(0, 50, -100);
scene.add(auroraG);
const flashL = new THREE.PointLight(0xcfe0ff, 0, 60, 1.6);
// the phones of the two people coming up the stairs closest to you light their faces
const phoneL = [new THREE.PointLight(0xe8f0ff, 0, 3.5, 2), new THREE.PointLight(0xe8f0ff, 0, 3.5, 2)];
phoneL.forEach((l) => scene.add(l));
scene.add(flashL);

const overlay = makeOverlay();
const stampEl = document.getElementById('stamp');
const stampW = document.getElementById('stampw');

// ---------- the satellites coming down (direction from (azimuth from north toward the west, elevation), degrees) ----------
const dirOf = (az, el) => new THREE.Vector3(-Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), -Math.cos(az * DEG) * Math.cos(el * DEG));
const SATS = [[V_SATS - 0.2, 4.6, 30, 46, 2, 34], [V_SATS + 0.4, 5.0, 14, 44, -20, 32], [V_SATS + 1.0, 4.4, 34, 40, 10, 30], [V_SATS + 1.6, 4.8, 4, 46, -24, 34],
  [V_SATS + 2.3, 4.2, 32, 44, 6, 32], [V_SATS + 3.0, 4.6, 18, 40, -14, 30], [V_SATS + 3.7, 4.0, 26, 46, -6, 34], [V_SATS + 9.0, 4.0, 30, 30, 5, 15]];
SATS.forEach(([t0, dur, a0, e0, a1, e1], k) => {
  const A = dirOf(a0, e0), B = dirOf(a1, e1);
  sky.uniforms.uSatA.value[k].set(A.x, A.y, A.z, t0);
  sky.uniforms.uSatB.value[k].set(B.x, B.y, B.z, dur);
});

// ---------- post ----------
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv);
    if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 16.0), 1.0); }`,
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.35, 0.45, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.2 }, uTitle: { value: 0 }, uCounter: { value: 0 },
    uAb: { value: 0 }, uCap: { value: 0 }, uPop: { value: 0 }, uBlur: { value: 0 }, uWhite: { value: 0 }, uWhip: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uAb; uniform float uCap; uniform float uPop; uniform float uBlur; uniform float uWhite; uniform float uWhip;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5;
      vec3 col = vec3(0.0);
      float jit = h(vUv * 1920.0 + uTime) - 0.5;
      vec2 off = d * uAb * 0.01;
      for (int i = 0; i < 6; i++) {
        float k = (float(i) + jit) / 6.0 - 0.5;
        vec2 uv = 0.5 + d * (1.0 - uBlur * (k + 0.5)) + vec2(uWhip * k * 0.06, 0.0);
        col += vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      }
      col /= 6.0;
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.1);
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.5 * exp(-pow((vUv.y - 0.29) / 0.1, 2.0));
      col *= 1.0 - uCounter * 0.38 * exp(-pow((vUv.y - 0.79) / 0.06, 2.0)) * smoothstep(0.66, 0.1, vUv.x);
      col *= 1.0 - uCap * 0.45 * exp(-pow((vUv.y - 0.175) / 0.04, 2.0));
      col *= 1.0 - uPop * 0.45 * exp(-pow((vUv.y - 0.175) / 0.05, 2.0));
      col = mix(col, vec3(1.0), uWhite);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- the camera: you walk up the east sidewalk with the crowd, filming; only your eyes and your zoom change ----------
// 0:00 up the street as the dark rushes at you; up at the sky (0:02-0:04); the street ahead; up at the transformer (0:06.6); along the wires after
// the sparks; the crossing, zoomed (0:12); your phone (0:17); the subway (0:21.5); the sky (0:26); the skyline down the
// avenue, zoomed (0:28.6); the street and the torches; the sky as it flares (0:42).
const PITCH = [[-2, 12], [1.4, 12], [3.3, 19], [4.1, 19], [5.0, 7], [6.4, 7], [7.2, 34], [8.1, 34], [9.0, 20], [11.2, 16], [12.0, -3.0], [16.6, -3.0], [17.4, 2], [21.3, 2], [21.9, -14], [26.4, -14], [27.3, 28], [32.2, 28], [33.0, 6], [41.2, 8], [42.6, 30], [50, 34]];
const YAW = [[-2, 2], [4.8, 3], [6.4, 3], [7.2, 14], [8.1, 14], [9.0, 10], [11.2, 7], [12.0, 30], [16.6, 30], [17.4, 9], [21.3, 9], [21.9, -20], [26.4, -20], [27.3, 8], [32.2, 8], [33.0, 11], [37, 15], [41.2, 9], [42.6, 6], [50, 6]];
const FOV = [[-2, 66], [4.8, 64], [6.4, 64], [7.2, 56], [8.1, 56], [9.0, 54], [11.2, 52], [12.0, 42], [16.6, 42], [17.4, 58], [21.3, 58], [21.9, 60], [26.4, 60], [27.3, 70], [32.2, 70], [33.0, 58], [41.2, 60], [42.6, 68], [50, 70]];
// (while the arcs run along the wires the eyes follow the lead one)
const CROSS_NZ = EB_Z - 0.35;
const TRACK = [[-2, 0], [8.4, 0], [9.0, 1], [10.8, 1], [11.6, 0], [50, 0]];
function camAt(v) {
  const pos = new THREE.Vector3(CAM_X, EYE + 0.55 * keys([[-2, 0], [11.0, 0], [11.8, 1], [16.2, 1], [17.0, 0], [50, 0]], v), camZ(v));
  let pitch = keys(PITCH, v) * DEG, fov = keys(FOV, v), yaw = keys(YAW, v) * DEG;
  // the transformer: look right at it as it buzzes and blows
  const tx = keys([[-2, 0], [6.5, 0], [7.2, 1], [8.1, 1], [8.8, 0], [50, 0]], v);
  if (tx > 0) {
    const dx = XF.x - pos.x, dy = XF.y - pos.y, dz = XF.z - pos.z;
    yaw = lerp(yaw, Math.atan2(-dx, -dz), tx); pitch = lerp(pitch, Math.atan2(dy, Math.hypot(dx, dz)) - 4 * DEG, tx);
  }
  // the subway entrance just ahead on your right, as people come up out of the dark
  const ts = keys([[-2, 0], [21.2, 0], [21.9, 1], [26.3, 1], [27.0, 0], [50, 0]], v);
  if (ts > 0) {
    const dx = SUBWAY.x - pos.x, dy = -3.0 - pos.y, dz = SUBWAY.z1 + 1.2 - pos.z;
    yaw = lerp(yaw, Math.atan2(-dx, -dz) + 2 * DEG, ts); pitch = lerp(pitch, Math.atan2(dy, Math.hypot(dx, dz)) + 9 * DEG, ts);
  }
  // the crashed car in the crossing, people round it and candles in the windows above (0:35-0:40)
  const tc = keys([[-2, 0], [34.9, 0], [35.8, 1], [39.6, 1], [40.6, 0], [50, 0]], v);
  if (tc > 0) {
    const dx = 2.6 - pos.x, dy = 2.0 - pos.y, dz = CROSS_NZ - pos.z;
    yaw = lerp(yaw, Math.atan2(-dx, -dz), tc); pitch = lerp(pitch, Math.atan2(dy, Math.hypot(dx, dz)) + 7 * DEG, tc); fov = lerp(fov, 40, tc);
  }
  const tr = keys(TRACK, v);
  if (tr > 0) {
    const q = runnerAt(RUNNERS[3], v) || runnerAt(RUNNERS[0], v);
    if (q) {
      const w = wireAt(q.i, q.k, q.u), dx = w.x - pos.x, dz = w.z - pos.z;
      yaw = lerp(yaw, Math.atan2(-dx, -dz) - 4 * DEG, tr); pitch = lerp(pitch, Math.atan2(w.y - pos.y, Math.hypot(dx, dz)) - 10 * DEG, tr);
    }
  }
  let roll = wobble(v * 0.3, 7) * 0.6 * DEG;
  // walking: a gentle bob
  pos.y += Math.sin(v * 5.2) * 0.012 + wobble(v * 0.7, 5) * 0.02;
  pos.x += wobble(v * 0.5, 2) * 0.04;
  const k = fov / 60;
  yaw += wobble(v * 0.45, 4) * 0.4 * DEG * k; pitch += wobble(v * 0.55, 3) * 0.35 * DEG * k;
  return { pos, yaw, pitch, roll, fov };
}
// the jolts (the hit, the transformer)
const kickAt = (v) => 0.8 * Math.exp(-Math.max(v - V_HIT, 0) / 0.35) * smooth(V_HIT - 0.02, V_HIT + 0.03, v) + 1.0 * Math.exp(-Math.max(v - V_XF, 0) / 0.3) * smooth(V_XF - 0.02, V_XF + 0.03, v);

const tmpS = new THREE.Vector3();
const AUR_LO = new THREE.Color(0.1, 0.62, 0.26), AUR_HI = new THREE.Color(0.5, 0.07, 0.13);
const dist = (x, z) => Math.hypot(x - ORIGIN.x, z - ORIGIN.z);
LAMPS.forEach((l) => { l.die = dieAt(dist(l.x, l.z)); });
const SUB_DIE = dieAt(dist(SUBWAY.x, SUBWAY.zc));
// a lit thing's brightness at time v (dies with a last surge and a stutter)
function lit(die, v, fl) {
  const dt = v - die;
  if (dt < 0) return fl;
  if (dt < 0.05) return 2.2;
  if (dt < 0.16) return 0.35 * (Math.floor(dt * 37) % 2);
  return 0;
}
function update(v, cover = -1) {
  const s = state(v);
  const white = Math.max(s.white, cover);
  if (cover >= 0) s.title *= 1 - smooth(0.55, 1, cover);   // (in the loop's lead-in the title fades in as the white clears)
  // ---------- the camera ----------
  const cam = camAt(v);
  const kick = kickAt(v);
  s.kick = kick;
  const sh = (kick * 1.0 + 0.02) * 0.014 * cam.fov / 60;
  cam.pitch += wobble(v * 43, 3) * sh;
  cam.yaw += wobble(v * 47, 4) * sh;
  cam.roll += wobble(v * 29, 5) * sh * 0.8;
  camera.position.copy(cam.pos);
  camera.rotation.set(cam.pitch, cam.yaw, cam.roll);
  camera.fov = cam.fov;
  if (params.has('dbg')) { const d = params.get('dbg').split(',').map(Number); camera.position.set(d[0], d[1], d[2]); camera.lookAt(d[3], d[4], d[5]); camera.fov = d[6] || 40; }
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // ---------- the sky and the light ----------
  const aur = s.aur;
  const near = s.front > 12 ? 1 : 0;                        // the street's own power (near you)
  for (const U of [GU, CU]) { U.uTime.value = v; U.uSkyHi.value.copy(AUR_HI); U.uSkyLo.value.copy(AUR_LO); U.uAur.value = aur; }
  CU.uFront.value = s.front; CU.uFlick.value = s.flick;
  CU.uStreetK.value = near * s.flick;
  CU.uCandle.value = smooth(V_CANDLE - 0.6, V_CANDLE + 3.5, v);
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  sky.mesh.scale.setScalar(4000);
  u.uTime.value = v; u.uAur.value = aur; u.uLow.value = s.low;
  u.uWhiteSky.value = smooth(V_FLARE + 2.5, V_WHITE, v) ** 2;
  // the aurora's light: green-white from the whole sky, a pinker key from high behind you
  const ak = Math.min(aur, 3);
  hemi.color.setRGB(0.5, 0.72, 0.62); hemi.groundColor.setRGB(0.18, 0.14, 0.15);
  hemi.intensity = 0.52 * ak;
  auroraL.color.setRGB(1.0, 0.42, 0.58);
  auroraL.intensity = 0.8 * ak;
  auroraG.position.set(camera.position.x, 50, camera.position.z - 100); auroraG.target.position.copy(camera.position); auroraG.target.updateMatrixWorld();
  auroraG.intensity = 0.55 * ak;
  const look = tmpS.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw)).multiplyScalar(25).add(camera.position); look.y = 0;
  auroraL.position.copy(AUR_DIR).multiplyScalar(200).add(look);
  auroraL.target.position.copy(look);
  auroraL.target.updateMatrixWorld();
  warm.intensity = 0.55 * near * s.flick;
  // the flash: the hit's surge and the transformer
  {
    const xf = v - V_XF;
    const fx = xf > 0 ? 9 * Math.exp(-xf / 0.12) + 2.5 * Math.exp(-xf / 0.6) * (0.6 + 0.4 * Math.sin(xf * 60)) : 0;
    const hit = v - V_HIT;
    const fh = hit > 0 ? 3 * Math.exp(-hit / 0.15) : 0;
    flashL.intensity = (fx + fh) * 60;
    if (fx >= fh) flashL.position.set(XF.x, XF.y, XF.z); else flashL.position.set(CAM_X - 3, 6, camZ(v) - 4);
    s.flashK = fx + fh;
  }

  // ---------- things ----------
  glows.begin(camera);
  const spots = [];                 // [x, z, yaw/radius, length, r, g, b, spread]
  // street lamps: heads and warm pools, until the wave reaches them
  for (const l of LAMPS) {
    const k = lit(l.die, v, s.flick);
    if (k <= 0) continue;
    const h = lampHead(l);
    glows.add(h.x, h.y - 0.1, h.z, 0.9, 3.2 * k, 2.3 * k, 1.3 * k);
    glows.add(h.x, h.y - 0.12, h.z, 0.25, 6 * k, 5 * k, 3.6 * k);
    spots.push([h.x, h.z, 7.5, 0, 0.75 * k, 0.55 * k, 0.32 * k, 0, Math.hypot(h.x - camera.position.x, h.z - camera.position.z)]);
  }
  // the traffic lights: green for the avenue (the heads over the northbound lanes face you), red for the cross street
  {
    const k = v < V_HIT ? s.flick : 0;
    if (k > 0) for (const sg of SIGNALS) {
      if (sg.faces === 'S') for (const ax of [3.5, 7.0]) glows.add(sg.x + sg.arm * ax, 5.55 - 0.33, sg.z + 0.2, 0.32, 0.3 * k, 3.2 * k, 1.4 * k);
      if (sg.faces === 'E' || sg.faces === 'W') glows.add(sg.x + (sg.faces === 'E' ? 0.2 : -0.2), 4.2 + 0.33, sg.z, 0.28, 3.4 * k, 0.25 * k, 0.15 * k);
      if (sg.faces === 'N') for (const ax of [3.5, 7.0]) glows.add(sg.x + sg.arm * ax, 5.55 - 0.33, sg.z - 0.2, 0.2, 0.15 * k, 1.2 * k, 0.5 * k);
      glows.add(sg.x + (sg.x > 0 ? -0.33 : 0.33), 2.8, sg.z, 0.16, 3.0 * k, 0.9 * k, 0.2 * k);     // the DON'T WALK hand
    }
  }
  // the subway's globes and sign
  {
    const k = lit(SUB_DIE, v, s.flick);
    for (const x of [SUBWAY.x - SUBWAY.w / 2 - 0.05, SUBWAY.x + SUBWAY.w / 2 + 0.05]) if (k > 0) glows.add(x, 2.45, SUBWAY.z0 + 0.1, 0.32, 0.4 * k, 3.0 * k, 0.9 * k);
    city.subMat.color.setScalar(0.06 + 1.5 * k);
  }
  // signs and screens: a little light thrown on the sidewalk below them while they're on
  for (const sg of SIGNS) {
    const k = lit(sg.die, v, s.flick);
    if (k > 0 && Math.abs(sg.z - camera.position.z) < 50) spots.push([sg.x - Math.sign(sg.x) * 2.2, sg.z, 3.2, 0, 0.35 * k, 0.3 * k, 0.32 * k, 0, Math.hypot(sg.x - camera.position.x, sg.z - camera.position.z) + 8]);
  }
  for (const sc of SCREENS) {
    const k = lit(sc.die, v, s.flick);
    if (k > 0) spots.push([sc.x - Math.sign(sc.x) * 6, sc.z, 9, 0, 0.35 * k, 0.32 * k, 0.5 * k, 0, Math.hypot(sc.x - camera.position.x, sc.z - camera.position.z)]);
  }
  // the traffic and the crowd (their headlights and torches come back as cones on the ground)
  const beams = [], torches = [];
  traffic.frame(v, glows, beams, camera.position);
  people.frame(v, glows, torches, camera.position);
  for (const b of beams) spots.push([b[0], b[1], b[2], 7, 0.33 * b[3], 0.32 * b[3], 0.29 * b[3], 0.22, b[4]]);
  // the climbers' faces, lit by their phones
  {
    const st = torches.filter((t) => t[6]).sort((a, b) => a[4] - b[4]);
    phoneL.forEach((l, i) => { const t = st[i]; if (t) { l.position.set(t[0], t[5] + 0.05, t[1]); l.intensity = 1.2 * t[3]; } else l.intensity = 0; });
  }
  // the crashed car: its cabin light on, doors-open glow, people round it (and its radio, in the soundtrack)
  {
    const k = smooth(V_CANDLE - 1.5, V_CANDLE - 0.5, v);
    const a = carAt(HERO_N, v);
    if (k > 0 && a) { const n = nShove(v); glows.add(a.x + n.dx, 1.2, a.z, 0.9, 1.6 * k, 1.2 * k, 0.7 * k); glows.add(a.x + n.dx, 1.15, a.z, 0.3, 3.0 * k, 2.4 * k, 1.5 * k); spots.push([a.x + n.dx, a.z, 3.2, 0, 0.35 * k, 0.27 * k, 0.17 * k, 0, 0]); }
  }
  for (const t of torches) if (!t[6]) spots.push([t[0] + Math.sin(t[2]) * 0.3, t[1] + Math.cos(t[2]) * 0.3, t[2], 3.2, 0.55 * t[3], 0.55 * t[3], 0.5 * t[3], 0.4, t[4] * 0.6]);
  // the transformer: buzzing arcs before it blows, the blast, then the arcs running along the wires
  {
    const pre = v > V_XF - 0.9 && v < V_XF ? Math.max(0, Math.sin(v * 53) * Math.sin(v * 31)) * smooth(V_XF - 0.9, V_XF - 0.1, v) : 0;
    if (pre > 0) glows.add(XF.x, XF.y + 0.7, XF.z, 0.3 + 0.3 * pre, 3 * pre, 4 * pre, 8 * pre);
    const xf = v - V_XF;
    if (xf > 0 && xf < 1.4) {
      const k = Math.exp(-xf / 0.18) * 1.0 + 0.3 * Math.exp(-xf / 0.7) * (0.5 + 0.5 * Math.sin(xf * 47));
      glows.add(XF.x, XF.y + 0.3, XF.z, 2.0 * k + 0.3, 6 * k, 7 * k, 10 * k);
      glows.add(XF.x, XF.y + 0.3, XF.z, 0.8, 12 * k, 13 * k, 16 * k);
    }
    for (const r of RUNNERS) {
      const q = runnerAt(r, v);
      if (!q) continue;
      const w = wireAt(q.i, q.k, q.u), fl = 0.6 + 0.4 * Math.sin(v * 70 + r[0] * 9);
      glows.add(w.x, w.y, w.z, 1.1 * fl, 5 * fl, 6 * fl, 9 * fl);
      glows.add(w.x, w.y, w.z, 0.14, 12, 13, 16);
    }
  }
  drawSparks(v, glows);
  glows.end();
  power.frame(v);
  phone.frame(v);
  // the ground's light: the nearest NSPOT spots
  spots.sort((a, b) => a[8] - b[8]);
  for (let i = 0; i < NSPOT; i++) {
    const sp = spots[i];
    if (sp) { GU.uSpotP.value[i].set(sp[0], sp[1], sp[2], sp[3]); GU.uSpotC.value[i].set(sp[4], sp[5], sp[6], sp[7]); }
    else GU.uSpotC.value[i].set(0, 0, 0, 0);
  }

  // ---------- post ----------
  bloom.strength = 0.35 + 0.25 * kick + 0.1 * clamp(s.flashK || 0, 0, 3);
  finish.uniforms.uTime.value = v;
  finish.uniforms.uAb.value = kick * 0.8;
  finish.uniforms.uBlur.value = window.__cover ? 0 : kick * 0.02;
  const whip = Math.abs(keys(YAW, v + 0.02) - keys(YAW, v - 0.02)) / 0.04;
  finish.uniforms.uWhip.value = window.__cover ? 0 : clamp((whip - 60) / 300, 0, 1);
  finish.uniforms.uWhite.value = window.__cover ? 0 : Math.pow(white, 1.2);
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : 1 - white;
  finish.uniforms.uVig.value = 0.2;
  renderer.toneMappingExposure = 1.0;

  s.hide = smooth(0.5, 0.9, white);
  overlay(v, s, v);
  {
    const p = window.__cover ? null : popupAt(v);
    const a = p ? smooth(0, 0.06, p.dt) * (1 - smooth(POP - 0.35, POP, p.dt)) * (1 - s.hide) : 0;
    stampEl.style.opacity = a.toFixed(3);
    finish.uniforms.uPop.value = a;
    { const c = window.__cover ? null : captionAt(v); finish.uniforms.uCap.value = c ? c.alpha * (1 - s.hide) : 0; }
    stampW.style.opacity = '0';
    if (a > 0) {
      if (stampEl.textContent !== p.say) stampEl.textContent = p.say;
      const fit = Math.max(56, Math.min(118, 1560 / p.say.length));
      stampEl.style.fontSize = `${fit.toFixed(1)}px`;
      stampEl.style.transform = `translateY(${(22 * (1 - smooth(0, 0.18, p.dt))).toFixed(1)}px)`;
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
  if (!params.has('dom')) {
    const { makeCompositor } = await import('./compose.js');
    comp = await makeCompositor(renderer.domElement, stage);
  }
  for (const t of [44, 40, 34, 28, 22, 16, 10, 4, 0]) renderFrame(t);
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, sky, state, update, CU, GU, traffic, people, comp: () => comp };
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

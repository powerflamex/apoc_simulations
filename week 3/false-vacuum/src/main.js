import { WIDE } from './wide.js';   // first: it changes how the scene camera frames 16:9
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './csky.js';
import { makeCity } from './city.js';
import { makeCrowd } from './crowd.js';
import { makeFleet } from './cars.js';
import { makeGlows } from './glows.js';
import { makeTrails } from './trails.js';
import { makeSpace, BODIES, wallPos } from './space.js';
import { WU, wallify } from './wall.js';
import { makeOverlay } from './overlay.js';
import { STILL, WALKERS, stillPose, walkerPose } from './people.js';
import { CARS, LANES, carAt, sunAt, SUN0, WALL_N, MOON_DIR, EYE, ARC_Z, groundY } from './paris.js';
import {
  state, beatAt, tauAt, rateOf, VIDEO_DURATION, LOOP, V_HIT, SHOTS, shotStart, CLEAR, T, R, C_KM, SUN_EL,
} from './timeline.js';
import { DEG, lerp, smooth, wobble, clamp, keys } from './util.js';
import { makeCompositor } from './compose.js';

const W = WIDE ? 1920 : 1080, H = WIDE ? 1080 : 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));
const RW = Math.round(W * RES), RH = Math.round(H * RES);
const C_M = C_KM * 1000;

const stage = document.getElementById('stage');
// plain depth buffer (the street scene: near 0.25 m, far 12 km); space shots set their own near/far in body radii
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, logarithmicDepthBuffer: false });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

// ================= Paris =================
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(new THREE.Color(0.92, 0.62, 0.45), 0.00021);
const camera = new THREE.PerspectiveCamera(34, W / H, 0.25, 12000);
camera.rotation.order = 'YXZ';
scene.add(camera);
const sky = makeSky();
scene.add(sky.mesh);
sky.uniforms.uMoon.value.copy(MOON_DIR);
const plainMat = (color, rough = 0.85, extra = {}) => wallify(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
const glowMat = (color) => wallify(new THREE.MeshBasicMaterial({ color, toneMapped: true }));
const city = makeCity(scene, { plainMat, glowMat });
const still = makeCrowd(scene, STILL.length, plainMat(0xffffff, 0.8));
STILL.forEach((p, i) => still.color(i, ...p.col));
// the walkers and the cars: see-through ghosts while the time-lapse is fast (a long exposure), solid at real speed
const ghostMats = [], walkMats = [];
const ghost = (list) => (m) => { m.transparent = true; list.push(m); return m; };
const walkers = makeCrowd(scene, WALKERS.length, ghost(walkMats)(plainMat(0xffffff, 0.8)), { castShadow: false });
WALKERS.forEach((p, i) => walkers.color(i, ...p.col));
const fleet = makeFleet(scene, CARS.length, {
  plainMat: (c, r, e) => ghost(ghostMats)(plainMat(c, r, e)), glowMat: (c) => ghost(ghostMats)(glowMat(c)),
  shadowy: (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; },
});
const PAL = [0xb8bcc2, 0x1f2328, 0xf2f2f0, 0x8c1d1d, 0x24406b, 0x55595e, 0xd9c9a3, 0x2f4f3a, 0x111111, 0x6d1f4f, 0xf2f2f0, 0x1f2328, 0x3a5a8a, 0xdedcd8];
CARS.forEach((c, i) => fleet.color(i, PAL[c.col % PAL.length], c.kind));
const glows = makeGlows(scene, 5000);
const trails = makeTrails(scene, 2400);

const sun = new THREE.DirectionalLight(0xffa060, 2.3);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06;
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 160, bottom: -160, near: 10, far: 3000 });
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0x9aa6d0, 0x6a5040, 1.5);
scene.add(hemi);

// ================= space =================
const space = makeSpace();
const spaceCam = new THREE.PerspectiveCamera(40, W / H, 0.01, 1e5);

const overlay = makeOverlay();
const stampEl = document.getElementById('stamp');
const stampW = document.getElementById('stampw');
const youEl = document.getElementById('you');

// ================= post =================
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
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.5, 0.45, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.3 }, uTitle: { value: 0 }, uCounter: { value: 0 }, uAb: { value: 0 }, uWhite: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVig; uniform float uTitle; uniform float uCounter; uniform float uAb; uniform float uWhite;
    varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      vec2 off = c * uAb * 0.01;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.2);
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.45 * exp(-pow((vUv.y - ${WIDE ? '0.665' : '0.36'}) / ${WIDE ? '0.17' : '0.1'}, 2.0));
      col *= 1.0 - uCounter * 0.32 * exp(-pow((vUv.y - ${WIDE ? '0.35' : '0.53'}) / ${WIDE ? '0.11' : '0.065'}, 2.0)) * smoothstep(${WIDE ? '0.42' : '0.8'}, ${WIDE ? '0.08' : '0.2'}, vUv.x);
      col = mix(col, vec3(0.985, 0.975, 1.0), uWhite);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ================= space shots =================
// Each body sits at the origin (radius 1). The camera starts beside it, just ahead of the wall, with the wall's
// direction of travel pointing up the screen (turned by psi); as the wall comes through, the camera rises ahead of
// it and the wall reaches the camera exactly when the shot cuts.
const SHOT = {
  neptune: { D: 6.4, h0: 0.35, psi: 0.55, side: [0.2, 0.0, 1.0], lit: 0.85 },
  saturn: { D: 12.5, h0: 0.25, psi: 1.45, side: [0.0, 0.3, 1.0], lit: 0.7 },
  jupiter: { D: 6.0, h0: 0.3, psi: -0.45, side: [1.0, 0.0, 0.6], lit: 0.9 },
  sun: { D: 5.2, h0: 0.3, psi: 0.35, side: [0.3, -0.1, 1.0] },
  moon: { D: 5.0, h0: 0.25, psi: -0.3, side: [0.0, 0.2, 1.0] },
};
const ANCH = { neptune: [0, 2.5], saturn: [4.3, 7.0], jupiter: [8.6, 10.8], sun: [12.2, 17.6], moon: [29.9, 31.3] };
const tmpV = new THREE.Vector3(), tmpU = new THREE.Vector3(), tmpR = new THREE.Vector3(), tmpF = new THREE.Vector3();
const m3 = new THREE.Matrix3(), m4 = new THREE.Matrix4();
// Earth: the Sun is over the point (16° N, 103.5° W) when the wall reaches Paris (Sun 1.9° up in the west in Paris)
const toN = (lat, lon) => new THREE.Vector3(Math.cos(lat * DEG) * Math.cos(lon * DEG), Math.sin(lat * DEG), -Math.cos(lat * DEG) * Math.sin(lon * DEG));
const PARIS = toN(48.86, 2.35);
const SUB = (() => {   // find the subsolar longitude that puts the Sun 1.9° up in Paris, in the west
  const dec = 16;
  let best = null, bd = 9;
  for (let lon = -180; lon < 0; lon += 0.05) { const s = toN(dec, lon); const el = Math.asin(s.dot(PARIS)) / DEG; if (Math.abs(el - SUN_EL) < bd) { bd = Math.abs(el - SUN_EL); best = s; } }
  return best;
})();
BODIES.earth.L = SUB.clone(); BODIES.earth.N = SUB.clone().negate();

function placeBody(name, v, tau) {
  const b = BODIES[name], u = space.u, cfg = SHOT[name] || {};
  const N = b.N.clone();
  const w = wallPos(b, tau);
  u.uN.value.copy(N); u.uType.value = b.type; u.uTime.value = v;
  if (b.sphere) { u.uMode.value = 1; u.uBC.value.copy(N).multiplyScalar(-b.sphere); u.uBR.value = b.sphere + w; }
  else { u.uMode.value = 0; u.uW.value = w; }
  space.rings.visible = !!b.ring;
  space.corona.visible = !!b.corona;
  space.atmo.visible = !!b.atmo;
  if (b.atmo) space.atmo.material.uniforms.uTint.value.setRGB(...b.atmo);

  if (name === 'earth') {
    // look at Paris from above and a little ahead of it: the sunlit half below, the night above, Paris between
    const S = PARIS.clone().addScaledVector(N, -PARIS.dot(N)).normalize();
    // from the side, almost along the wall: the planet's sunlit half is sliced away flat beneath the night half
    const k = smooth(shotStart('earth'), shotStart('slowmo'), v);
    const phi = lerp(9, 4, k) * DEG, D = 3.4;
    const dir = S.clone().multiplyScalar(Math.cos(phi)).addScaledVector(N, Math.sin(phi)).normalize();
    const tgt = N.clone().multiplyScalar(0.05 + 0.12 * k);
    spaceCam.position.copy(tgt).addScaledVector(dir, D - 0.25 * k);
    spaceCam.up.copy(N);
    spaceCam.lookAt(tgt);
    u.uL.value.copy(b.L);
    u.uTilt.value.identity();
    spaceCam.fov = 40;
  } else {
    const S = new THREE.Vector3(...cfg.side).addScaledVector(N, -new THREE.Vector3(...cfg.side).dot(N)).normalize();
    // the camera's height ahead of the body's centre: steady, then keeping ahead of the wall, then caught
    const [a0, a1] = ANCH[name];
    const hEnd = CLEAR[name];
    let h = Math.max(cfg.h0, w + 0.9 * (1 - smooth(a1 - 1.2, a1, v)));
    h = Math.min(h, hEnd - 0.01);
    const D = cfg.D;
    const phi = Math.asin(clamp(h / D, -0.95, 0.95));
    const dir = S.clone().multiplyScalar(Math.cos(phi)).addScaledVector(N, Math.sin(phi));
    const drift = (v - a0) * 0.012;
    spaceCam.position.copy(dir).multiplyScalar(D * (1 - drift));
    spaceCam.position.addScaledVector(N, h - spaceCam.position.dot(N));   // (exactly h ahead)
    tmpF.copy(spaceCam.position).negate().normalize();
    tmpR.crossVectors(tmpF, N).normalize();
    tmpU.crossVectors(tmpR, tmpF).normalize();
    const up = tmpU.clone().multiplyScalar(Math.cos(cfg.psi)).addScaledVector(tmpR, Math.sin(cfg.psi));
    spaceCam.up.copy(up);
    spaceCam.lookAt(0, 0, 0);
    // the body's own axis: up the screen at the start of the shot (bands across the picture); lit from ahead of the
    // wall and toward the camera (outer planets), from the Sun's side (the Moon), or glowing (the Sun)
    const axis = b.axis || (b.axis = up.clone());
    const ax2 = new THREE.Vector3().crossVectors(axis, S).normalize(), ax3 = new THREE.Vector3().crossVectors(ax2, axis);
    m4.makeBasis(ax2, axis, ax3);
    u.uTilt.value.setFromMatrix4(m4).transpose();
    if (name === 'moon') u.uL.value.copy(N).negate().addScaledVector(S, 0.9).normalize();
    else u.uL.value.copy(N).multiplyScalar(1).addScaledVector(S, cfg.lit ?? 0.8).normalize();
    if (b.ring) {
      // the rings: tilted 24° toward you, their plane along the wall's path (so it slices across them)
      const rn = new THREE.Vector3().crossVectors(N, S).normalize().multiplyScalar(Math.cos(24 * DEG)).addScaledVector(S, Math.sin(24 * DEG)).normalize();
      space.u.uRing.value.copy(rn);
      space.rings.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), rn);
      const a2 = new THREE.Vector3().crossVectors(rn, S).normalize(), a3 = new THREE.Vector3().crossVectors(a2, rn);
      m4.makeBasis(a2, rn, a3);
      u.uTilt.value.setFromMatrix4(m4).transpose();
    }
    spaceCam.fov = 40;
  }
  // beat: a small jolt
  const bt = beatAt(v);
  if (bt && bt.dt < 0.6 && !window.__cover) {
    const j = Math.exp(-bt.dt * 7) * smooth(0, 0.04, bt.dt);
    spaceCam.position.addScaledVector(spaceCam.up, j * 0.03 * Math.sin(bt.dt * 60));
    spaceCam.fov -= 2.5 * j;
  }
  if (b.corona) space.corona.quaternion.copy(spaceCam.quaternion);
  const dist = spaceCam.position.length();
  spaceCam.near = Math.max(0.002, (dist - 2.5) * 0.3); spaceCam.far = 1e5;
  spaceCam.updateProjectionMatrix();
  spaceCam.updateMatrixWorld();
  space.sky.position.copy(spaceCam.position); space.sky.scale.setScalar(5e4);
  space.sky.updateMatrixWorld();
  // where Paris is on the screen (Earth shot): the YOU marker
  if (name === 'earth') {
    const pp = PARIS.clone().multiplyScalar(1.0).project(spaceCam);
    const facing = PARIS.dot(tmpV.copy(spaceCam.position).sub(PARIS).normalize()) > 0.05;
    return { you: facing && pp.z < 1 ? { x: (pp.x * 0.5 + 0.5) * W, y: (-pp.y * 0.5 + 0.5) * H } : null };
  }
  return {};
}

// ================= the Paris cameras =================
// time-lapse: at the tip of the island, over the sightseers' shoulders, looking up the avenue at the Arc and the Sun.
// slow motion: (A) the same view, frozen, while the sky goes dark from the horizon and the Arc is cut; (B) flying
// back down the avenue just ahead of the wall, looking at it slicing through the trees, the cars and the crowd;
// (C) your own eyes, turned toward the people beside you, as it reaches them and then you.
const ARC_LOOK = new THREE.Vector3(0, groundY(ARC_Z) + 17, ARC_Z);
export const V_CHASE = 48.0, V_YOU = 54.6;
function parisCam(v, shot, tau) {
  if (shot === 'paris') {
    const k = smooth(shotStart('paris'), shotStart('moon'), v);
    return { x: 0.05, y: 1.95, z: lerp(-6.5, -8.5, k), look: ARC_LOOK, fov: lerp(31, 27, k), roll: 0 };
  }
  if (v < V_CHASE) {
    const k = smooth(shotStart('slowmo'), V_CHASE, v);
    return { x: lerp(-0.6, 0.4, k), y: 1.95, z: lerp(-7.0, -9.0, k), look: ARC_LOOK, fov: lerp(33, 30, k), roll: 0 };
  }
  if (v < V_YOU) {
    const D = C_M * tau;                          // how far the wall still is from you
    const g = Math.max(3, 0.24 * D);
    const z = -(D - g);
    const k = smooth(V_CHASE, V_CHASE + 1.2, v);
    return { x: lerp(0.4, 4.5, k) * Math.min(1, D / 60 + 0.3), y: 2.3 + Math.min(18, 0.03 * D), z, look: new THREE.Vector3(0, 1.0 + Math.min(10, 0.05 * D), z - g - 5), fov: lerp(30, 58, k), roll: 0 };
  }
  // your eyes: looking north-west at the people next to you on the island
  const k = smooth(V_YOU, V_HIT, v);
  const yaw = lerp(112, 98, k) * DEG;
  const look = new THREE.Vector3(EYE.x + Math.sin(yaw) * 10, 1.6, EYE.z - Math.cos(yaw) * 10);
  return { x: EYE.x, y: EYE.y + 0.1, z: EYE.z, look, fov: lerp(62, 56, k), roll: 0 };
}

const tmpC = new THREE.Color();
const dummy = new THREE.Object3D();
function updateParis(v, s) {
  const t = -s.tau;                       // the clock in Paris: seconds until the wall arrives (negative)
  const E = clamp(s.rate / 60, 1 / 500, 5); // how much story time one frame's exposure covers
  const shot = s.shot;
  const cam = parisCam(v, shot, s.tau);
  camera.position.set(cam.x, cam.y, cam.z);
  camera.up.set(0, 1, 0);
  camera.lookAt(cam.look);
  camera.rotateZ(cam.roll);
  camera.fov = cam.fov;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  const sd = sunAt(t);
  sky.mesh.position.copy(camera.position);
  sky.uniforms.uSun.value.copy(sd);
  sky.uniforms.uTime.value = t * 0.02 + v * 0.0;
  sun.position.copy(camera.position).addScaledVector(sd, 1500);
  sun.target.position.set(camera.position.x, 0, camera.position.z - 140);
  sun.position.add(new THREE.Vector3(0, 0, -140));
  // the wall: N away from the Sun; it reaches your eyes at the end
  WU.uWallN.value.copy(WALL_N);
  WU.uWallD.value = EYE.dot(WALL_N) - C_M * s.tau;
  WU.uWallOn.value = 1;
  WU.uWallT.value = v;
  sky.uniforms.uWallN.value.copy(WALL_N);
  sky.uniforms.uGap.value = C_M * s.tau + camera.position.clone().sub(EYE).dot(WALL_N);
  sky.uniforms.uWallOn.value = 1;

  // ghosts: what moves too far in one frame's exposure fades (the cars: only their light trails stay)
  const carA = smooth(9, 1.2, 11 * E), walkA = smooth(1.3, 0.2, 1.3 * E);
  for (const m of ghostMats) { m.opacity = carA; m.depthWrite = carA > 0.6; m.visible = carA > 0.01; }
  for (const m of walkMats) { m.opacity = walkA; m.depthWrite = walkA > 0.6; m.visible = walkA > 0.01; }

  glows.begin(camera); trails.begin();
  const cp = camera.position;
  // cars, their lights, and their light trails
  CARS.forEach((c, i) => {
    const a = carAt(c, t);
    const ln = c.lane;
    const fade = smooth(0, 25, a.s) * smooth(ln.L, ln.L - 60, a.s);
    dummy.position.set(a.x, a.y + 0.14, a.z);
    dummy.rotation.set(Math.atan2(0.011, 1) * (ln.dir < 0 ? -1 : 1) * -1, ln.dir < 0 ? 0 : Math.PI, 0, 'YXZ');
    dummy.scale.setScalar(fade > 0.02 ? 1 : 0);
    dummy.updateMatrix();
    fleet.set(i, dummy.matrix, true);
    if (fade < 0.02) return;
    const dist = Math.hypot(a.x - cp.x, a.z - cp.z);
    const front = ln.dir < 0 ? -1 : 1;           // the way it drives along z
    const half = c.kind === 3 ? 2.45 : 2.2;
    const sz = Math.max(0.42, dist * 0.0016), k = fade * Math.min(1, 0.42 / sz * 1.6);
    const s0 = Math.max(0, a.s - ln.speed * E);
    const z0 = a.z - front * (a.s - s0);
    const blur = Math.abs(a.z - z0);
    for (const sx of [-0.62, 0.62]) {
      const hz = a.z + front * half, tz = a.z - front * half;
      const hy = groundY(hz) + 0.85, ty = groundY(tz) + 0.9;
      glows.add(a.x + sx, hy, hz, sz * 1.1, 2.4 * k, 2.2 * k, 1.9 * k);
      glows.add(a.x + sx, ty, tz, sz * 0.9, 2.2 * k, 0.12 * k, 0.08 * k);
      if (blur > 0.4) {
        const w = Math.max(0.16, dist * 0.0011);
        trails.add([a.x + sx, groundY(z0 + front * half) + 0.85, z0 + front * half], [a.x + sx, hy, hz], w, 1.5 * fade, 1.4 * fade, 1.2 * fade, 1);
        trails.add([a.x + sx, groundY(z0 - front * half) + 0.9, z0 - front * half], [a.x + sx, ty, tz], w, 1.6 * fade, 0.1 * fade, 0.06 * fade, 1);
      }
    }
  });
  fleet.commit();
  STILL.forEach((p, i) => still.pose(i, stillPose(p, t)));
  still.commit();
  WALKERS.forEach((p, i) => walkers.pose(i, walkerPose(p, t)));
  walkers.commit();
  // the lamps along the kerbs
  for (const [x, y, z] of city.lampPos) {
    const dist = Math.hypot(x - cp.x, z - cp.z);
    const sz = Math.max(0.55, dist * 0.0018);
    glows.add(x, y, z, sz, 2.2, 1.6, 0.9);
  }
  glows.end(); trails.end();
  // the low Sun: warm, raking light straight down the avenue
  sun.intensity = 2.4; hemi.intensity = 1.45;
  scene.fog.density = 0.00021;
}

// ================= the frame =================
function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) s.flash = Math.max(s.flash, cover);
  const inSpace = !['paris', 'slowmo'].includes(s.shot);
  renderPass.scene = inSpace ? space.scene : scene;
  renderPass.camera = inSpace ? spaceCam : camera;
  let you = null;
  if (inSpace) you = placeBody(s.shot, v, s.tau).you;
  else updateParis(v, s);

  const b = beatAt(v);
  const punch = b && !window.__cover ? smooth(0, 0.05, b.dt) * Math.exp(-Math.max(0, b.dt - 0.05) * 4) : 0;
  renderer.toneMappingExposure = s.shot === 'sun' ? 0.55 : 1.0;
  bloom.strength = s.shot === 'sun' ? 0.5 : inSpace ? 0.55 : 0.45;
  const f = finish.uniforms;
  f.uAb.value = punch * 1.4;
  f.uTitle.value = window.__cover ? 1.15 : s.title;
  f.uCounter.value = window.__cover ? 0 : (1 - s.flash) * 0.9;
  f.uWhite.value = 0;

  overlay(v, s, v);
  {
    const a = b && !window.__cover ? smooth(0, 0.06, b.dt) * (1 - smooth(1.6, 2.1, b.dt)) * (1 - s.flash) : 0;
    stampEl.style.opacity = a.toFixed(3);
    stampW.style.opacity = a.toFixed(3);
    if (a > 0) {
      if (stampEl.textContent !== b.w) stampEl.textContent = b.w;
      if (stampW.textContent !== b.k) stampW.textContent = b.k;
      stampEl.style.fontSize = `${(140 * (1 + 0.25 * Math.exp(-b.dt * 9))).toFixed(1)}px`;
    }
  }
  {
    const a = you && !window.__cover ? smooth(shotStart('earth') + 0.3, shotStart('earth') + 0.8, v) : 0;
    youEl.style.opacity = a.toFixed(3);
    if (you) { youEl.style.left = `${(you.x - 120).toFixed(1)}px`; youEl.style.top = `${(you.y - 112).toFixed(1)}px`; }
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
  await space.ready;
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  for (const t of [50, 40, 33, 30, 22, 14, 9, 5, 0]) renderFrame(t);
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, space, spaceCam };
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

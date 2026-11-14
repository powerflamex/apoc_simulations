// "What if you were 1 trillion times heavier?" — three places, one per stretch of the story (timeline.js sceneAt):
//   street  (to V_PUNCH): a downtown corner at midday (men-vanish's city: buildings, traffic, signals, props), you on
//           a bench at the curb (street.js); the camera in front of you, looking past you up the avenue;
//   station (to V_SINK): the subway station under it (station.js); the camera on the platform;
//   bore    (after):     the hole you punch down through the rock (bore.js); the camera falls with you.
// You (you.js) are moved into whichever scene is drawn. Post: bloom, a soft vignette, darkening behind the text,
// the white at the end; the last LOOP seconds replay the moments before frame 0 while the white clears.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky, skyColors } from './sky.js';
import { makeGround, GU } from './ground.js';
import { makeCity, CU, hazed, LAMP_HEADS, SIG_LAMPS } from './city.js';
import { makeTraffic } from './traffic.js';
import { makeProps } from './props.js';
import { makeGlows } from './glows.js';
import { makeSmoke } from './smoke.js';
import { makeCrowd } from './crowd.js';
import { makeOverlay } from './overlay.js';
import { makeYou } from './you.js';
import { makeStreetBits, SEAT_Y } from './street.js';
import { makeStation, PLAT_Y } from './station.js';
import { makeBore } from './bore.js';
import { STREET, streetPersonAt, armsAt, stopTime } from './people.js';
import { YOU } from './layout.js';
import {
  state, VIDEO_DURATION, LOOP, captionAt, HITS, V_SNAP, V_CRACK, V_PUNCH, V_LAND, V_SINK, V_GRAV, V_ORBIT, V_WALLS, V_MTN, V_LAPSE, V_CORE, V_FLASH, T_SWITCH,
} from './timeline.js';
import { lerp, smooth, wobble, clamp, keys } from './util.js';

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

// ---------- the street ----------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, W / H_PX, 0.1, 6000);
scene.add(camera);
const plainMat = (color, rough = 0.9, extra = {}) => hazed(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };
const ctx = { plainMat, glowMat, shadowy };
const sky = makeSky();
scene.add(sky.mesh);
makeGround(scene);
const city = makeCity(scene, ctx);
const traffic = makeTraffic(scene, ctx);
makeProps(scene, ctx);
const bits = makeStreetBits(scene, ctx);
const glows = makeGlows(scene, 4000);
const smoke = makeSmoke(scene, 400);
const crowd = makeCrowd(scene, STREET.length, plainMat(0xffffff, 0.82), { castShadow: true });
STREET.forEach((p) => crowd.color(p.i, p.shirt, p.pants, p.skin, p.hair, p.sleeves));
const sunL = new THREE.DirectionalLight(0xfff3e2, 3.0);
sunL.castShadow = true;
sunL.shadow.mapSize.set(4096, 4096);
sunL.shadow.bias = -0.0004; sunL.shadow.normalBias = 0.04;
Object.assign(sunL.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 10, far: 900 });
scene.add(sunL, sunL.target);
const hemi = new THREE.HemisphereLight(0x9cc0ff, 0x9a8a78, 1.2);
scene.add(hemi);

// ---------- the station, the bore ----------
const station = makeStation();
const bore = makeBore();
const camS = new THREE.PerspectiveCamera(50, W / H_PX, 0.05, 800);
const camB = new THREE.PerspectiveCamera(60, W / H_PX, 0.03, 3000);

// ---------- you ----------
const you = makeYou(scene, { hoodie: 0xd8342a, jeans: 0x2f4d7d });
you.root.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });

const overlay = makeOverlay();

// ---------- post ----------
const rt = new THREE.WebGLRenderTarget(W, H_PX, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H_PX);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv);
    if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 16.0), 1.0); }`,
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H_PX / 2), 0.3, 0.45, 1.05);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.22 }, uTitle: { value: 0 }, uCounter: { value: 0 }, uCap: { value: 0 }, uWhite: { value: 0 }, uAb: { value: 0 }, uHeat: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter; uniform float uCap; uniform float uWhite; uniform float uAb; uniform float uHeat;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv + uHeat * 0.0022 * vec2(sin(vUv.y * 90.0 + uTime * 7.0) + sin(vUv.y * 37.0 - uTime * 5.0), cos(vUv.x * 70.0 + uTime * 6.0));
      vec2 off = (uv - 0.5) * uAb * 0.01;
      vec3 col = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.12);
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.5 * exp(-pow((vUv.y - 0.37) / 0.11, 2.0));
      col *= 1.0 - uCounter * 0.4 * exp(-pow((vUv.y - 0.5) / 0.07, 2.0)) * smoothstep(0.85, 0.1, vUv.x);
      col *= 1.0 - uCap * 0.45 * exp(-pow((vUv.y - 0.175) / 0.045, 2.0));
      col = mix(col, vec3(1.0, 0.99, 0.96), uWhite);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- your pose through the story ----------
// hipY: your pelvis height above your soles' ground; footZ: how far forward your feet are
const SIT = { hipY: SEAT_Y + 0.11, footZ: 0.42, lean: 0.0 };
const GROUND = { hipY: 0.15, footZ: 0.68, lean: -0.05 };
const SQUAT = { hipY: 0.5, footZ: 0.22, lean: 0.45 };
const STAND = { hipY: 0.92, footZ: 0.0, lean: 0.0 };
const mixPose = (a, b, k) => ({ hipY: lerp(a.hipY, b.hipY, k), footZ: lerp(a.footZ, b.footZ, k), lean: lerp(a.lean, b.lean, k) });
function poseAt(v) {
  if (v < V_SNAP) return { ...SIT, head: [0.25, 0.35], armsOut: 0.05, armsFwd: 0.25 };
  if (v < V_PUNCH) {
    // the drop onto the pavement, a moment's shock, then up through a squat to standing; braced as it breaks
    let P = SIT;
    P = mixPose(P, GROUND, smooth(V_SNAP, V_SNAP + 0.2, v));
    P = mixPose(P, SQUAT, smooth(1.5, 2.2, v));
    P = mixPose(P, STAND, smooth(2.2, 2.9, v));
    const brace = smooth(V_CRACK, V_CRACK + 0.3, v);
    return { ...P, head: [lerp(0.25, 0.55, smooth(2.6, 3.4, v)) - 0.3 * brace, 0.35 - 0.3 * smooth(3.6, 5, v)], armsOut: 0.1 + 0.5 * brace + 0.3 * smooth(1.2, 1.6, v) * (1 - smooth(2.4, 2.9, v)), armsFwd: 0.6 * smooth(1.2, 1.6, v) * (1 - smooth(2.4, 2.9, v)) };
  }
  if (v < V_LAND) return { ...mixPose(STAND, { hipY: 0.86, footZ: 0.1, lean: -0.1 }, 1), head: [-0.6, 0], armsUp: 0.75, armsOut: 0.5 };
  if (v < V_SINK) {
    // the landing: down into a crouch, then you straighten up, looking at your feet sinking
    const k1 = smooth(V_LAND, V_LAND + 0.12, v), k2 = smooth(V_LAND + 0.6, V_LAND + 1.6, v);
    let P = mixPose(STAND, SQUAT, k1 * (1 - k2));
    return { ...P, head: [lerp(0.2, 0.7, smooth(V_LAND + 1.4, V_LAND + 2.4, v)), 0.15 * Math.sin(v * 0.9)], armsOut: 0.45 * (1 - k2) + 0.25, armsFwd: 0.3 * k1 * (1 - k2) };
  }
  // falling: arms out and up, legs a little bent; a slow turn of the head
  const fl = smooth(V_SINK, V_SINK + 0.6, v);
  return { hipY: 0.88, footZ: 0.06, lean: 0.0, head: [lerp(0.5, -0.1, smooth(V_SINK + 0.4, V_SINK + 3, v)) + 0.15 * Math.sin(v * 0.4), 0.3 * Math.sin(v * 0.23)], armsOut: 0.55 + 0.25 * fl, armsUp: 0.35 * fl + 0.1 * Math.sin(v * 0.7), float: 0.3 * fl };
}
// put you with your middle (between your feet) at x, z, facing yaw (the figure's origin is its right sole)
function placeYou(x, y, z, yaw) { you.root.rotation.y = yaw; you.root.position.set(x - 0.105 * Math.cos(yaw), y, z + 0.105 * Math.sin(yaw)); }
function poseYou(v) {
  const P = poseAt(v);
  you.pose(P);
  you.pelvis.rotation.x = P.lean || 0;
}

// ---------- update ----------
const tmpC = new THREE.Color(), tv = new THREE.Vector3();
const C = (a) => tmpC.setRGB(a[0], a[1], a[2]);
const SUNDIR = (() => {   // midday, late September, 40° N: the Sun high in the south, a little west
  const el = 46 * DEG, az = 200 * DEG;
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
})();
const kickAt = (v) => { let k = 0; for (const t of HITS) { const dt = v - t; if (dt > -0.05 && dt < 1.2) k = Math.max(k, smooth(-0.05, 0.04, dt) * Math.exp(-Math.max(dt, 0) / 0.3) * 0.6); } return k; };
function sinkGround(v) {
  // how far the ground under you has gone down in the street (m)
  if (v < V_CRACK) return 0;
  const a = 0.32 * smooth(V_CRACK, V_CRACK + 0.25, v) + 0.55 * smooth(V_CRACK + 0.3, V_PUNCH - 0.4, v);
  const t = Math.max(0, v - (V_PUNCH - 0.45));
  return a + 4.9 * t * t + 0.8 * t;
}
function update(v, cover = -1) {
  const s = state(v);
  const white = Math.max(s.flash, cover);
  if (cover >= 0) s.title *= 1 - smooth(0.55, 1, cover);
  s.kick = kickAt(v);
  s.sinkGround = sinkGround(v);
  s.day = 0; s.power = { p: 1, f: 1 }; s.decay = 0; s.era = 2;
  poseYou(v);
  let cam = camera;
  if (s.scene === 'street') {
    renderPass.scene = scene; renderPass.camera = camera;
    if (you.root.parent !== scene) scene.add(you.root);
    // you: on the bench at the curb, facing the shops (west); your right sole is the figure's origin
    you.root.rotation.set(0, 0, 0);
    const sitX = v < V_SNAP ? 0.02 : 0.02 - 0.08 * smooth(V_SNAP, V_SNAP + 0.2, v);
    placeYou(YOU.x + sitX, -s.sinkGround, YOU.z, -Math.PI / 2);
    you.setRim(0, 0, 0);
    // the camera: in front of you, a little to your left, looking past you up the avenue
    const sh = smooth(V_CRACK + 0.3, V_PUNCH, v);
    const pos = new THREE.Vector3(YOU.x - 1.8 + 0.25 * smooth(0, 5, v), 1.2 - 0.3 * sh, YOU.z + 1.5 - 0.2 * smooth(0, 5, v));
    const tgt = new THREE.Vector3(YOU.x - 0.05, lerp(0.86, 0.75, smooth(V_SNAP, 2.0, v)) + 0.25 * smooth(2.0, 2.9, v) - 0.9 * sh, YOU.z - 0.1);
    camera.position.copy(pos);
    camera.lookAt(tgt);
    // (aim a little left of you, so the avenue opens up behind you)
    camera.rotateY(-6 * DEG);
    camera.fov = 58 - 2 * smooth(0, 5, v);
    const k = s.kick;
    camera.rotation.x += wobble(v * 43, 3) * 0.003 * (k * 3 + 0.2) - k * 0.006;
    camera.rotation.y += wobble(v * 47, 4) * 0.003 * (k * 3 + 0.2);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    // sky and light
    const sc = skyColors(46);
    const u = sky.uniforms;
    sky.mesh.position.copy(camera.position);
    u.uSun.value.copy(SUNDIR); u.uZen.value.copy(C(sc.zen)); u.uHor.value.copy(C(sc.hor)); u.uGlow.value.copy(C(sc.glow)); u.uSunCol.value.copy(C(sc.sun));
    u.uSunI.value = 1; u.uStars.value = 0; u.uT.value = v; u.uPx.value = (camera.fov * DEG) / H_PX; u.uCloud.value = 0.8; u.uCity.value = 0;
    const hi = C(sc.zen).clone(), lo = C(sc.hor).clone();
    CU.uSkyHi.value.copy(hi); CU.uSkyLo.value.copy(lo); GU.uSkyHi.value.copy(hi); GU.uSkyLo.value.copy(lo);
    CU.uHaze.value.copy(lo); GU.uHaze.value.copy(lo);
    CU.uHazeD.value = GU.uHazeD.value = 2600;
    CU.uSun.value.copy(SUNDIR); CU.uSunCol.value.copy(C(sc.sun));
    CU.uTime.value = v; GU.uTime.value = v;
    CU.uNight.value = 0; GU.uNight.value = 0;
    CU.uPowerP.value = 1; CU.uFlick.value = 1; CU.uDecay.value = 0; GU.uDecay.value = 0;
    GU.uCrack.value = v < V_SNAP + 0.3 ? 0 : 0.5 * smooth(V_SNAP + 0.3, 2.2, v) + 0.9 * smooth(2.4, V_CRACK, v) + 1.2 * smooth(V_CRACK, V_PUNCH, v);
    GU.uHoleR.value = v < V_CRACK ? 0 : 1.0;
    const lc = new THREE.Vector3(YOU.x, 0, YOU.z - 15);
    sunL.position.copy(SUNDIR).multiplyScalar(500).add(lc);
    sunL.target.position.copy(lc); sunL.target.updateMatrixWorld();
    sunL.intensity = 3.4;
    sunL.color.copy(C(sc.sun)).lerp(new THREE.Color(1, 1, 1), 0.5);
    hemi.intensity = 1.9;
    hemi.color.copy(C(sc.zen)).multiplyScalar(2.2).lerp(new THREE.Color(0.75, 0.8, 0.95), 0.4);
    hemi.groundColor.setRGB(0.5, 0.45, 0.4);
    renderer.toneMappingExposure = 1.08;
    glows.begin(camera);
    for (const L of SIG_LAMPS) {
      const red = L.group === 'av';
      glows.add(L.x, L.y + (red ? 0.33 : -0.33), L.z, 0.55, red ? 4 : 0.2, red ? 0.25 : 3.2, red ? 0.1 : 1.4);
    }
    smoke.begin();
    city.frame(v, s);
    traffic.frame(v, s, glows, smoke);
    bits.frame(v, s);
    // dust: a puff when the bench snaps, a cloud when the sidewalk breaks
    for (const [t0, n, r0, a0] of [[V_SNAP, 10, 0.5, 0.25], [V_CRACK, 22, 0.9, 0.45]]) for (let k = 0; k < n; k++) {
      const t = v - t0 - k * 0.012; if (t < 0 || t > 4) continue;
      const a = k * 2.39, r = r0 + 1.2 * (1 - Math.exp(-t * 1.5));
      smoke.puff(YOU.x + Math.cos(a) * r, 0.15 + 0.35 * t * (0.4 + (k % 3) * 0.3), YOU.z + Math.sin(a) * r, 0.25 + 0.3 * t, a0 * Math.exp(-t / 1.6), 0.75, 0, (k * 0.17) % 1);
    }
    smoke.end(); glows.end();
    smoke.mat.uniforms.uTime.value = v;
    smoke.mat.uniforms.uLight.value.setRGB(1.2, 1.15, 1.05);
    smoke.mat.uniforms.uSun.value.copy(SUNDIR);
    // the people
    STREET.forEach((p) => {
      const a = streetPersonAt(p, v);
      const t0 = stopTime(p);
      const arms = armsAt(p, v, t0);
      // the nearest step back when the sidewalk breaks
      const d = Math.hypot(a.x - YOU.x, a.z - YOU.z);
      const back = d < 9 ? smooth(V_CRACK + 0.15, V_CRACK + 0.8, v) * 0.8 : 0;
      const bx = (a.x - YOU.x) / d * back, bz = (a.z - YOU.z) / d * back;
      crowd.pose(p.i, { x: a.x + bx, y: 0, z: a.z + bz, yaw: a.yaw, s: p.s, walk: a.moving ? (v * 7.5 + p.ph) : 0, stride: a.moving ? 1 : 0, armL: arms.armL, armR: arms.armR, look: 0.05 });
    });
    crowd.commit();
    bloom.strength = 0.22 + 0.2 * s.kick;
    finish.uniforms.uHeat.value = 0;
  } else if (s.scene === 'station') {
    cam = camS;
    renderPass.scene = station.scene; renderPass.camera = camS;
    if (you.root.parent !== station.scene) station.scene.add(you.root);
    // you fall in through the roof and land on the track bed, facing the platform (+x)
    const tf = v - V_PUNCH;
    const y = v < V_LAND ? Math.max(0, 4.6 - 4.9 * tf * tf) : 0;
    const sink = v < V_LAND ? 0 : 0.12 * smooth(V_LAND, V_LAND + 0.1, v) + 0.45 * smooth(V_LAND + 0.4, V_SINK - 0.2, v);
    const drop = v > V_SINK - 0.12 ? 4.9 * Math.pow(v - V_SINK + 0.12, 2) * 3 : 0;
    you.root.rotation.set(0, 0, 0);
    placeYou(0, y - sink - drop, 0, Math.PI / 2 - 0.35);
    you.setRim(0, 0, 0);
    // camera: on the platform, low, looking at you and down the track into the tunnel; up at the roof as you break it
    const up = 1 - smooth(V_PUNCH + 0.55, V_LAND, v);
    const pos = new THREE.Vector3(2.25 + 0.1 * smooth(V_LAND, V_SINK, v), PLAT_Y + 0.72 + 0.25 * up, 1.75 - 0.2 * smooth(V_LAND, V_SINK, v));
    const yy = Math.max(y - sink, -0.2);
    const tgt = new THREE.Vector3(-0.6, lerp(0.9, 3.2, up) + Math.min(yy, 3) * 0.5 * (1 - up) - 0.5 * smooth(V_SINK - 0.2, V_SINK + 0.2, v), -0.9);
    camS.position.copy(pos);
    camS.lookAt(tgt);
    const k = s.kick;
    camS.rotation.x += wobble(v * 43, 3) * 0.004 * (k * 3 + 0.2);
    camS.rotation.y += wobble(v * 47, 4) * 0.004 * (k * 3 + 0.2);
    camS.fov = 52;
    camS.updateProjectionMatrix();
    camS.updateMatrixWorld();
    station.frame(v, s, camS, sink + drop);
    renderer.toneMappingExposure = 1.0;
    bloom.strength = 0.3 + 0.2 * s.kick;
    finish.uniforms.uHeat.value = 0;
  } else {
    cam = camB;
    renderPass.scene = bore.scene; renderPass.camera = camB;
    if (you.root.parent !== bore.scene) bore.scene.add(you.root);
    you.root.rotation.set(0.04 * Math.sin(v * 0.31), 0, 0.04 * Math.sin(v * 0.27 + 1));
    placeYou(0, 0, 0, Math.PI / 2 - 0.35 + (v - V_SINK) * 0.06);
    // the light on you from the glow below: a warm rim
    bore.frame(v, s, camB);
    const heatRim = bore.U.uFeet.value;
    you.setRim(heatRim.r * 0.04, heatRim.g * 0.04, heatRim.b * 0.04);
    // camera shots, each a different angle (a new picture every few seconds)
    const sh = (a, b) => smooth(a, b, v);
    let pos, tgt, fov = 62;
    const orbit = (ang, r, y) => new THREE.Vector3(Math.cos(ang) * r, y, Math.sin(ang) * r);
    // (angles round you measured from straight in front of your face, so it stays in view)
    const face = Math.PI / 2 - you.root.rotation.y;
    if (v < V_SINK + 0.9) {
      // following you down out of the station: from above, looking down past you
      pos = orbit(face + 0.4, 0.9, 3.0 - 0.6 * sh(V_SINK, V_SINK + 0.9)); tgt = new THREE.Vector3(0, 0.4, 0); fov = 66;
    } else if (v < V_GRAV) {
      // below and in front, looking up past you at the light of the station shrinking above
      const k = sh(V_SINK + 0.9, V_GRAV);
      pos = orbit(face + 0.55 - 0.2 * k, 1.45, -0.45 + 0.2 * k); tgt = new THREE.Vector3(0, 1.5 + 0.8 * (1 - k), 0); fov = 64;
    } else if (v < V_ORBIT) {
      // beside you, swinging round in front, the gravel drifting in and starting to circle you
      const k = sh(V_GRAV, V_ORBIT);
      pos = orbit(face + 0.9 - 1.2 * k, 1.65, 1.0 + 0.15 * k); tgt = new THREE.Vector3(0, 0.9, 0); fov = 62;
    } else if (v < V_MTN) {
      // above and in front, looking down at you: the ring of things orbiting you, the glow below
      const k = sh(V_ORBIT, V_MTN);
      pos = orbit(face - 0.35 + 0.3 * k, 1.25, 2.4 - 0.15 * k); tgt = new THREE.Vector3(0, 0.6, 0); fov = 64;
    } else if (v < V_LAPSE) {
      // close in front as the wall caves in round you
      const k = sh(V_MTN, V_LAPSE);
      pos = orbit(face + 0.45 - 0.2 * k, 1.6, 1.2 - 0.1 * k); tgt = new THREE.Vector3(0, 0.85, 0); fov = 64;
    } else if (v < V_CORE) {
      // the long drop: the layers rushing up, red then orange
      const k = sh(V_LAPSE, V_CORE);
      pos = orbit(face - 0.6 + 0.4 * k, 1.7, 0.7 + 0.4 * k); tgt = new THREE.Vector3(0, 0.95 + 0.2 * k, 0); fov = 64;
    } else {
      // the core: below you looking up as it goes white
      const k = sh(V_CORE, T_SWITCH);
      pos = orbit(face + 0.3 + 0.2 * k, 1.6, -0.35 - 0.2 * k); tgt = new THREE.Vector3(0, 1.2, 0); fov = 66;
    }
    const shake = (s.kick * 0.6 + 0.04 + 0.08 * smooth(V_MTN, V_MTN + 2, v) + 0.06 * smooth(V_LAPSE, V_CORE, v)) * 0.02;
    camB.position.copy(pos);
    camB.lookAt(tgt);
    camB.rotation.x += wobble(v * 43, 3) * shake; camB.rotation.y += wobble(v * 47, 4) * shake;
    camB.fov = fov;
    camB.updateProjectionMatrix();
    camB.updateMatrixWorld();
    bore.fill.position.copy(pos).multiplyScalar(0.8).add(new THREE.Vector3(0, 0.3, 0));
    bore.fill.intensity = 2.0 + 1.5 * (1 - smooth(V_SINK, V_SINK + 3, v));
    // the core's white: the wall goes white just before the flash
    bore.U.uWhite.value = smooth(V_CORE + 1.6, V_FLASH + 0.6, v) * 0.7;
    renderer.toneMappingExposure = 1.0;
    bloom.strength = 0.12 + 0.15 * s.kick + 0.12 * smooth(V_LAPSE, V_CORE, v);
    finish.uniforms.uHeat.value = smooth(36, 40, v) * 0.8;
  }
  // ---------- post ----------
  finish.uniforms.uTime.value = v;
  finish.uniforms.uAb.value = s.kick * 0.5;
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
  window.__dbg = { scene, camera, renderer, composer, sky, state, update, you, station, bore };
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

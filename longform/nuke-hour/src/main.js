// "What if a nuke hit your city? Survive the first hour" (1920x1080, 30 fps, no voice). A pure function of time:
// renderFrame(v). timeline.js says where you are (shotAt), what story moment it is (storyOf) and what is on screen.
// The world is the Short's (week 6/biggest-nuke: the avenue on the hill, the city, the fireball and the blast, run on
// its own clock sv = t - 2), plus your building's lobby and stairwell (lobby.js), the hour after (after.js: the fires,
// the wreck, the park) and the garage (garage.js, its own scene).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeGround, GU } from './ground.js';
import { makeCity, CU } from './city.js';
import { makePeople } from './people.js';
import { makeTraffic } from './traffic.js';
import { makeBlast } from './blast.js';
import { makeGlows } from './glows.js';
import { makeSmoke } from './smoke.js';
import { makeFlames } from './flames.js';
import { makeEvents } from './events.js';
import { makeLobby } from './lobby.js';
import { makeAfter } from './after.js';
import { makeGarage, RAMP } from './garage.js';
import { makeMyPhone } from './myphone.js';
import { makeOverlay } from './overlay.js';
import { CAM0, HIT, PLAIN, HEROES } from './layout.js';
import * as SH from './short.js';
import { state, VIDEO_DURATION, FF_LEN, T_HIT, V_FLASH, GAS, SLAB_FALL, V_SIREN } from './timeline.js';
import { lerp, smooth, wobble, clamp, keys } from './util.js';
import { makeCompositor } from './compose.js';

const Wd = 1920, Hd = 1080, DEG = Math.PI / 180;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(Wd, Hd, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(48, Wd / Hd, 0.25, 42000);
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
const people = makePeople(scene);
const traffic = makeTraffic(scene, ctx);
const glows = makeGlows(scene, 12000);
const smoke = makeSmoke(scene, 2600);
const blast = makeBlast(scene, smoke);
const flames = makeFlames(scene, 900);
const events = makeEvents(scene, ctx, smoke, flames);
const lobby = makeLobby(scene, ctx);
const after = makeAfter(scene, ctx);
const phone = makeMyPhone(camera, ctx);
const garage = makeGarage(ctx);
const gGlows = makeGlows(garage.scene, 800);

const fireL = new THREE.DirectionalLight(0xffffff, 3.2);
fireL.castShadow = true;
fireL.shadow.mapSize.set(2048, 2048);
fireL.shadow.camera.left = -90; fireL.shadow.camera.right = 90; fireL.shadow.camera.top = 90; fireL.shadow.camera.bottom = -90;
fireL.shadow.camera.near = 10; fireL.shadow.camera.far = 900;
fireL.shadow.bias = -0.0006; fireL.shadow.normalBias = 0.05;
scene.add(fireL, fireL.target);
const hemi = new THREE.HemisphereLight(0x7f96d8, 0x4a4038, 1.25);
scene.add(hemi);
const shopL = new THREE.PointLight(0xffb878, 0, 0, 1.6);
shopL.position.set(-14, 6, 0);
scene.add(shopL);
const burnL = [new THREE.PointLight(0xff7a24, 0, 0, 1.5), new THREE.PointLight(0xff8a30, 0, 0, 1.5)];
burnL[0].position.set(-12, 6, -28); burnL[1].position.set(10, 6, -40);
scene.add(...burnL);

const overlay = makeOverlay();

// ---------- post ----------
const rt = new THREE.WebGLRenderTarget(Wd, Hd, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(Wd, Hd);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv);
    if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 16.0), 1.0); }`,
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(Wd / 2, Hd / 2), 0.35, 0.55, 1.1);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.3 }, uTitle: { value: 0 }, uCounter: { value: 0 }, uAb: { value: 0 }, uFlash: { value: 0 }, uCap: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVig, uTitle, uCounter, uAb, uFlash, uCap;
    varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      vec2 off = c * uAb * 0.01;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.8), c * vec2(1.0, 0.8)) * 2.2;
      // soft dark bands behind the title, under the counter and behind the captions, so the text reads on any picture
      col *= 1.0 - uTitle * 0.5 * exp(-pow((vUv.y - 0.56) / 0.12, 2.0));
      col *= 1.0 - uCounter * 0.42 * exp(-pow((vUv.y - 0.14) / 0.12, 2.0)) * smoothstep(0.55, 0.12, vUv.x);
      col *= 1.0 - uCap * 0.35 * exp(-pow((vUv.y - 0.375) / 0.07, 2.0));
      col = mix(col, vec3(1.0, 0.98, 0.94), uFlash);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- the clouds of the hour after (the Short's cloudAt covers the first 47 s) ----------
function cloudLong(t) {
  if (t <= 47) return { ...SH.cloudAt(t), stemW: 1 };
  const R = keys([[47, 9.6], [90, 15], [200, 26], [400, 39], [600, 47]], t);
  const H = keys([[47, 17], [90, 24], [200, 34], [400, 46], [600, 52]], t);
  const flat = keys([[47, 0.62], [400, 0.38]], t);
  return { R, H, flat, A: 0.62 * R, B: 0.4 * R, stem: 1, stemW: keys([[47, 1], [300, 2.4], [600, 3.2]], t) };
}
const lightLong = (t) => (t <= 47 ? SH.lightAt(t) : keys([[47, 0.16], [90, 0.06], [300, 0.0]], t));
const heatLong = (t) => (t <= 47 ? SH.heatAt(t) : keys([[47, 0.5], [120, 0.34], [400, 0.14]], t));

// ---------- the cameras ----------
const EYE = 1.65;
const P = (x, y, z) => new THREE.Vector3(x, y, z);
const path = (list, t) => { const a = keys(list.map(([k, q]) => [k, q.x]), t), b = keys(list.map(([k, q]) => [k, q.y]), t), c = keys(list.map(([k, q]) => [k, q.z]), t); return P(a, b, c); };
// where the thrown car aims when you are inside (it tumbles past the lobby's glass)
const STREET_AIM = P(-13, 2.2, 30);
const aim = (from, to) => { const d = to.clone().sub(from); return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) }; };
const DOOR = P(-22.2, 1.55, 4.95);
// the 47 seconds, cut between views every few seconds (story time t): [from, view]
//   doorway: you, at the corner, looking out; phone: your phone, close; beside: the people crouched in the doorway with
//   you; shoulder: over your shoulder at the street catching fire; heli: zoomed on the helicopter; across: the burning
//   shop fronts across the street; sky: up at the cloud; tower: zoomed on the tallest tower; run: inside, to the stairwell
const CUTS = [[-99, 'doorway'], [9.0, 'phone'], [14.0, 'beside'], [20.0, 'shoulder'], [25.5, 'heli'], [30.5, 'across'], [35.6, 'sky'], [39.2, 'tower'], [42.6, 'run']];
// the park (shot time u, 0..45 s)
const PARK_CUTS = [[0, 'wide'], [6, 'faces'], [12, 'phone'], [18, 'stem'], [23, 'embers'], [27, 'sleeve'], [32, 'ashwide'], [38.5, 'go']];
const parkCut = (u) => { let c = PARK_CUTS[0]; for (const x of PARK_CUTS) if (u >= x[0]) c = x; return { view: c[1], dt: u - c[0] }; };
export const streetCut = (t) => { let c = CUTS[0]; for (const x of CUTS) if (t >= x[0]) c = x; return { view: c[1], dt: t - c[0] }; };
function camAt(v, s) {
  const t = s.t;
  let pos, yaw = 0, pitch = 0, roll = 0, fov = 48, shake = 0.04;
  s.you = false; s.phoneClose = false; s.view = ''; s.sleeve = -1; s.ashNear = 0; s.nearEmbers = 0;
  switch (s.shot) {
    case 'ff': {
      // the Short's spot: on the ledge on the promenade, the city ahead, the wall coming up the hill
      pos = P(CAM0.x, 2.5, CAM0.z);
      pitch = keys([[43, 19], [45.2, 18], [47, 16]], t) * DEG; yaw = -1.2 * DEG; fov = 62;
      shake = 0.3 + 1.6 * smooth(44, 47, t);
      const th = smooth(T_HIT - 0.01, T_HIT + 0.25, t);
      pitch += 26 * DEG * th; roll += 22 * DEG * th; pos.y += 1.5 * th; pos.z += 2.5 * th;
      break;
    }
    case 'street': {
      const c = streetCut(t), u = c.dt;
      s.view = c.view;
      shake = 0.12;
      if (c.view === 'doorway') {
        // the evening on the sidewalk; at the flash you dash back into the doorway and stay in its shade
        pos = path([[-7, P(-18.6, EYE, 9.8)], [0, P(-18.9, EYE, 9.4)], [0.2, P(-19.4, EYE, 9.0)], [1.0, P(-22.9, EYE - 0.1, 6.6)], [2.4, DOOR], [9, DOOR]], t);
        yaw = keys([[-7, -9], [0, -13], [0.15, -13], [0.9, -72], [1.6, -80], [2.6, -11], [9, -12]], t) * DEG;
        pitch = keys([[-7, -2.5], [0, -1.5], [0.4, -6], [1.5, -8], [2.6, 3], [9, 4.5]], t) * DEG;
        shake = t < 0 ? 0.04 : t < 2.4 ? 0.7 : 0.12;
      } else if (c.view === 'phone') {
        pos = P(-22.45, 1.5, 5.35); yaw = (-28 + 3 * u / 5) * DEG; pitch = -14 * DEG; fov = 50; s.phoneClose = true;
      } else if (c.view === 'beside') {
        pos = P(-26.5 + 0.05 * u, 1.25, 9.6 - 0.06 * u); yaw = (-36 + 0.6 * u) * DEG; pitch = 1.5 * DEG; fov = 60; s.you = true;
      } else if (c.view === 'shoulder') {
        pos = P(-24.0 + 0.06 * u, 1.75, 6.7 - 0.04 * u); yaw = (-40 + 1.2 * u) * DEG; pitch = 4 * DEG; fov = 54; s.you = true;
      } else if (c.view === 'heli') {
        // (following it down: aimed a little behind where it is, so it drops through the frame)
        pos = DOOR.clone(); fov = 32;
        const h = events.heliAt(t - 2 - 0.25);
        const a = aim(pos, P(h.x, h.y + 4, h.z)); yaw = a.yaw; pitch = a.pitch;
        shake = 0.1 + 0.8 * Math.exp(-Math.abs(u - 3.5) / 0.4) * (u > 3.2 ? 1 : 0);
      } else if (c.view === 'across') {
        pos = P(-22.05, 1.5, 5.5); yaw = (-68 - 2.4 * u) * DEG; pitch = 3 * DEG; fov = 44;
      } else if (c.view === 'sky') {
        pos = DOOR.clone(); yaw = (-16 - u) * DEG; pitch = (24 + 1.2 * u) * DEG; fov = 64;
      } else if (c.view === 'tower') {
        // (down the hill past the corner: the dust wall coming across the city at you)
        pos = P(-21.7, 1.55, 4.9); yaw = (-9 - 0.6 * u) * DEG; pitch = (9 - 0.6 * u) * DEG; fov = 42; shake = 0.15 + 0.1 * u;
      } else {
        // run inside, through the lobby into the stairwell; down behind the wall, looking back out through the door
        pos = path([[42.6, P(-22.3, 1.55, 5.0)], [43.3, P(-25.0, 1.6, 7.2)], [43.9, P(-28.0, 1.6, 8.3)], [44.5, P(-37.0, 1.6, 9.7)], [44.9, P(-43.4, 1.5, 9.7)], [45.1, P(-44.9, 1.2, 9.7)], [45.6, P(-45.15, 0.95, 9.72)], [47.5, P(-45.2, 0.92, 9.72)]], t);
        yaw = keys([[42.6, -12], [43.1, 70], [43.8, 88], [44.7, 92], [45.2, -70], [45.7, -88], [47.5, -86]], t) * DEG;
        pitch = keys([[42.6, 4], [43.1, -4], [44.9, -3], [45.6, 2], [47.5, 3]], t) * DEG;
        fov = keys([[42.6, 48], [43.1, 56], [45.2, 60], [47.5, 60]], t);
        shake = t < 45.2 ? 0.6 : 0.2 + 1.6 * smooth(46.2, 47, t);
        // the hit: you're thrown back against the stairs
        const th = smooth(T_HIT + 0.15, T_HIT + 0.3, t);
        pos.x -= 0.7 * th; pitch += 18 * DEG * th; roll += 10 * DEG * th;
      }
      break;
    }
    case 'stairs': {
      // a few seconds down on the stairwell floor; then the wind comes back, yanks the door open, and you get up and go
      pos = path([[47, P(-47.4, 0.75, 12.5)], [50.3, P(-47.3, 0.8, 12.4)], [53.6, P(-47.2, 0.85, 12.3)], [55.6, P(-47.0, 0.95, 12.0)], [57.6, P(-45.6, 1.55, 10.5)]], t);
      yaw = keys([[47, -42], [50.3, -48], [53.6, -46], [54.6, -52], [56, -45], [57.6, -70]], t) * DEG;
      pitch = keys([[47, 14], [48, 6], [50.3, 4], [53.6, 4], [54.6, 8], [56, 3], [57.6, 0]], t) * DEG;
      roll = keys([[47, 10], [48.5, 3], [50, 0]], t) * DEG;
      fov = 60;
      shake = t < 51 ? 0.25 + 0.9 * Math.exp(-(t - 47) / 3) : t < 57.6 ? 0.9 * Math.exp(-Math.abs(t - 54.5) / 1.2) + 0.15 : 0.1;
      break;
    }
    case 'lobby': {
      const u = s.dt;
      pos = path([[0, P(-44.4, EYE, 9.8)], [2, P(-36, EYE, 10.8)], [4.2, P(-27, EYE, 15.5)], [6.3, P(-21.0, EYE, 17.6)]], u);
      yaw = keys([[0, -80], [1.6, -62], [3.0, -112], [4.6, -80], [6.3, -38]], u) * DEG;
      pitch = keys([[0, -4], [2, -9], [4, -4], [6.3, 2]], u) * DEG;
      fov = 60; shake = 0.12;
      break;
    }
    case 'after': {
      // out on the sidewalk: the burning city down the hill; then straight up at the cloud over you; then the people round you
      const u = s.dt;
      pos = path([[0, P(-20.4, EYE, 17.4)], [7, P(-15.5, EYE, 12.5)], [10, P(-9.5, EYE, 9.5)], [20, P(-8.5, EYE, 8.8)], [30, P(-6.5, EYE, 4.4)]], u);
      yaw = keys([[0, -30], [4, -14], [8, -12], [11, -4], [19, 10], [21, -10], [25, -48], [30, -30]], u) * DEG;
      pitch = keys([[0, 2], [4, 3], [8, 4], [11.5, 52], [19, 58], [21.5, 8], [25, 0], [30, 2]], u) * DEG;
      fov = keys([[0, 54], [8, 54], [11.5, 82], [19, 82], [21.5, 56], [30, 54]], u); shake = 0.07;
      break;
    }
    case 'burning': {
      // the cloud overhead; your building burning, a slab coming off it and landing close; the wind turning toward the fire
      const u = s.dt;
      pos = path([[0, P(2.6, EYE, 26)], [7.5, P(3.0, EYE, 26.8)], [9, P(4.6, EYE, 29.0)], [24, P(4.4, EYE, 28.6)], [33, P(2.6, EYE, 31)], [36, P(1.4, EYE, 34.5)]], u);
      yaw = keys([[0, -8], [7, -4], [9, 58], [14, 60], [17.6, 61], [20, 40], [24, 8], [28, -4], [32, -10], [34.5, 120], [36, 178]], u) * DEG;
      pitch = keys([[0, 26], [7, 30], [9, 22], [14.6, 24], [16.6, 12], [18, 6], [24, 8], [28, 10], [33, 4], [36, 0]], u) * DEG;
      fov = keys([[0, 64], [7, 64], [9, 64], [18, 60], [24, 54], [36, 54]], u);
      shake = 0.08 + 0.9 * Math.exp(-Math.abs(v - (SLAB_FALL.v + 2.45)) / 0.4) * (v > SLAB_FALL.v + 2.3 ? 1 : 0);
      break;
    }
    case 'walk': {
      // into the wind (south), debris coming at you, then the gas main
      const u = s.dt;
      pos = P(0.5 + wobble(u * 0.4, 3) * 0.3, EYE + Math.abs(Math.sin(u * 5.2)) * 0.03, 36 + 1.6 * u);
      yaw = (180 + keys([[0, 0], [6, 8], [11, -6], [16, 4], [18, 14], [22, 16], [26, 4], [30, 0]], u)) * DEG;
      pitch = keys([[0, 2], [8, 4], [16, 3], [18, 10], [22, 6], [30, 2]], u) * DEG;
      fov = 58; shake = 0.25 + 1.8 * Math.exp(-Math.max(0, v - GAS.t) / 0.7) * (v > GAS.t ? 1 : 0);
      break;
    }
    case 'park': {
      // the park, cut every 4-6 s: the city burning under the cloud; the people beside you, lit by it; your phone; the
      // cloud's stem from below; embers and ash blowing past; the first ash on your sleeve; the city again, ash falling;
      // then off to the garage
      const u = s.dt;
      const c = parkCut(u), w = c.dt;
      s.view = c.view; shake = 0.07;
      const CREST = P(-182, EYE + 1.2, -100);
      if (c.view === 'wide') { pos = CREST.clone(); yaw = (-4 - 0.8 * w) * DEG; pitch = (-1 + 0.5 * w) * DEG; fov = 52; }
      else if (c.view === 'faces') { pos = P(-170.3 + 0.06 * w, 1.5, -133.6); yaw = (170 + 2.0 * w) * DEG; pitch = -1 * DEG; fov = 42; }
      else if (c.view === 'phone') { pos = CREST.clone(); yaw = (-6 + 0.4 * w) * DEG; pitch = -8 * DEG; fov = 50; s.phoneClose = true; }
      else if (c.view === 'stem') { pos = CREST.clone(); yaw = (-5.5 + 0.3 * w) * DEG; pitch = (30 + 1.6 * w) * DEG; fov = 70; }
      else if (c.view === 'embers') { pos = P(-180 - 0.1 * w, 1.3, -103); yaw = (-15 + w) * DEG; pitch = 3 * DEG; fov = 46; s.nearEmbers = 1; }
      else if (c.view === 'sleeve') { pos = CREST.clone(); yaw = -10 * DEG; pitch = (-24 - 0.6 * w) * DEG; fov = 55; s.sleeve = w; s.ashNear = 1; }
      else if (c.view === 'ashwide') { pos = P(-195 + 0.15 * w, 1.8, -108); yaw = (6 - 0.6 * w) * DEG; pitch = 3 * DEG; fov = 56; s.ashNear = 1; }
      else {
        pos = path([[0, P(-181, EYE, -99)], [6.5, P(-177, EYE, -80)]], w);
        yaw = keys([[0, 170], [6.5, 176]], w) * DEG; pitch = keys([[0, -4], [6.5, -6]], w) * DEG; fov = 54;
      }
      break;
    }
    default: {
      // the garage, cut in five: down the ramp; the car with the radio; the people along the wall; your phone; the ramp
      const u = s.dt;
      fov = 58; shake = 0.05;
      if (u < 6) {
        pos = path([[0, P(0, RAMP.top + EYE, RAMP.z1 - 1)], [6, P(0, EYE + 0.2, RAMP.z0 - 2)]], u); yaw = 0; pitch = keys([[0, -10], [6, -6]], u) * DEG;
      } else if (u < 13) {
        const r = garage.radio;
        pos = P(r.x - 4.4 + 0.08 * (u - 6), 1.35, r.z + 3.2 - 0.05 * (u - 6));
        const a = aim(pos, P(r.x - 1.6, 0.9, r.z)); yaw = a.yaw; pitch = a.pitch; fov = 54;
      } else if (u < 18) {
        pos = P(-25.4 - 0.1 * (u - 13), 1.25, -16); yaw = (72 + 1.2 * (u - 13)) * DEG; pitch = -6 * DEG; fov = 58;
      } else if (u < 28) {
        pos = P(3.0, 1.55, -5.5); yaw = -30 * DEG; pitch = -24 * DEG; fov = 50; s.phoneClose = true;
      } else {
        pos = P(1.0, EYE, -2 + 0.1 * (u - 28)); yaw = keys([[28, 178], [43, 180]], u) * DEG; pitch = keys([[28, 4], [43, 7]], u) * DEG; fov = 56;
      }
    }
  }
  // a hand-held sway
  pos.x += wobble(v * 0.5, 2) * 0.02; pos.y += wobble(v * 0.7, 5) * 0.015;
  yaw += wobble(v * 0.45, 4) * 0.35 * DEG + wobble(v * 41, 3) * shake * 0.01;
  pitch += wobble(v * 0.55, 3) * 0.3 * DEG + wobble(v * 37, 7) * shake * 0.01;
  roll += wobble(v * 0.3, 7) * 0.4 * DEG + wobble(v * 29, 5) * shake * 0.006;
  return { pos, yaw, pitch, roll, fov };
}

// ---------- the world, frame by frame ----------
const C0 = new THREE.Vector3(CAM0.x, 2.5, CAM0.z);
const tmpC = new THREE.Color(), tmpS = new THREE.Vector3(), L = new THREE.Vector3(), Lf = new THREE.Vector3();
const COOL = new THREE.Color(1, 0.94, 0.82), HOT = new THREE.Color(1, 0.42, 0.14), DUSK_H = new THREE.Color(0.5, 0.62, 1.0), DUSK_G = new THREE.Color(0.3, 0.26, 0.24);
const FIREC = new THREE.Color(1, 0.45, 0.16), NIGHT_H = new THREE.Color(0.12, 0.13, 0.2);
const NO_FRONT = { front: -1, left: 1e9 };
const HAZE_FIRE = new THREE.Color(0.62, 0.3, 0.12);

function updateWorld(v, s) {
  const t = s.t, sv = t - 2;
  const afterK = s.after && s.shot !== 'ff';
  // the Short's quantities at this moment (its clock sv, the picture of the fireball a few seconds ahead early on)
  const pt = t < T_HIT ? t + 6 * (1 - smooth(0, 40, t)) : t;
  const c = cloudLong(pt);
  const I = lightLong(pt), heat = heatLong(pt);
  const front = t > 0 ? SH.miAt(t) * SH.MILE : -1;
  const ws = {
    front: afterK ? -1 : front, left: SH.D_M - front, frontW: SH.D_M + 3000, wreck: afterK,
    powerR: 32000 * smooth(SH.V_POWER + 2, SH.V_POWER + 4, t), dark: smooth(SH.V_POWER + 2.9, SH.V_POWER + 3.5, t),
    camPos: s.shot === 'ff' ? camera.position : STREET_AIM, glare: I * (1 - (afterK ? 1 : 0)),
  };
  if (t < 0) { ws.powerR = 0; ws.dark = 0; }
  CU.uTime.value = v; GU.uTime.value = v;

  // the sky: the fireball, then the cloud cooling, the night, the fires' light from below
  const ux = (camera.position.x - HIT.x) / 1000, uy = (camera.position.y - PLAIN) / 1000, uz = (camera.position.z - HIT.z) / 1000;
  const brightY = Math.max(c.H, 1) * 1000 + PLAIN;
  L.set(HIT.x, brightY, HIT.z).sub(C0).normalize();
  const warm = smooth(0.95, 0.5, heat);
  const fc = tmpC.copy(COOL).lerp(HOT, warm).clone();
  const fireK = afterK ? 0.25 + 0.5 * smooth(120, 1400, t) + 0.25 * s.storm : 0;
  s.fireK = fireK;
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  sky.mesh.scale.setScalar(8000);
  // (the cloud's churning slows once it has stopped rising: its age in the shader grows slowly after the first minutes)
  u.uTime.value = v; u.uAge.value = pt < 120 ? pt : 120 + (pt - 120) * 0.04;
  u.uRo.value.set(ux, uy, uz);
  u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / Hd;
  u.uR.value = t > 0 ? c.R : 0.001; u.uH.value = c.H; u.uFlat.value = c.flat; u.uA.value = c.A; u.uB.value = c.B; u.uStem.value = t > 0 ? c.stem : 0;
  u.uStemW.value = c.stemW;
  u.uHeat.value = heat;
  u.uBright.value = t > 0 ? 0.6 + 0.7 * I * I : 0;
  u.uGlow.value = t > 0 ? 0.05 + 0.3 * I : 0;
  u.uDir.value.copy(L);
  u.uSkyO.value = t > 0 ? smooth(0.62, 0.3, I) * 0.5 + 0.2 * smooth(SH.V_CLOUD + 2, SH.V_CLOUD + 7, t) : 0;
  if (afterK) u.uSkyO.value = 0.3 + 0.3 * fireK;
  u.uShock.value = Math.max(front, 0) / 1000;
  u.uShockK.value = afterK ? 0 : 1 - smooth(10, 28, t);
  u.uCool.value = smooth(50, 400, t);
  u.uNight.value = s.night;
  u.uUnder.value.setRGB(0.9, 0.3, 0.07).multiplyScalar(fireK * 1.1);

  // lights: the fireball (then, after, the burning city low in the north), the evening, the street's own lights
  if (!afterK) {
    fireL.position.copy(camera.position).addScaledVector(L, 450).add(tmpS.set(0, 0, -40));
    fireL.target.position.set(camera.position.x, 0, camera.position.z - 40);
    fireL.color.copy(fc);
    // (the first seconds: a light like a dozen suns, low in the north)
    const early = smooth(0, 0.06, t) * (1 - smooth(1.5, 6, t));
    fireL.intensity = t > 0 ? 0.3 + 2.0 * I + 7 * early : 0.0;
    hemi.color.copy(DUSK_H).lerp(fc, (t > 0 ? smooth(0, 0.5, I) : 0) * 0.8);
    hemi.groundColor.copy(DUSK_G).lerp(fc.clone().multiplyScalar(0.55), t > 0 ? 0.8 : 0);
    hemi.intensity = t > 0 ? 0.8 + 0.6 * I : 0.85;
  } else {
    Lf.set(HIT.x, PLAIN + 2500, HIT.z).sub(camera.position).normalize();
    fireL.position.copy(camera.position).addScaledVector(Lf, 450);
    fireL.target.position.set(camera.position.x, 0, camera.position.z - 40);
    fireL.color.copy(FIREC);
    fireL.intensity = 0.25 + 0.5 * fireK;
    hemi.color.copy(NIGHT_H).lerp(FIREC, 0.35 + 0.3 * fireK);
    hemi.groundColor.copy(FIREC).multiplyScalar(0.25 + 0.3 * fireK);
    hemi.intensity = 0.5 + 0.35 * fireK;
  }
  // (indoors: little of the sky's light gets in)
  if (s.shot === 'stairs' || s.shot === 'lobby' || (s.shot === 'street' && t > 42.9)) hemi.intensity *= s.shot === 'stairs' ? 0.15 : 0.4;
  fireL.target.updateMatrixWorld();
  // (before the flash the street's own warm light is the main light; it goes with the blackout)
  shopL.intensity = 110 * (1 - ws.dark) * (afterK ? 0 : 1);
  if (t < 0) { hemi.intensity = 1.05; }
  {
    const street = smooth(SH.V_HEAT + 1.5, SH.V_FIRE + 5, t);
    burnL[0].intensity = afterK ? 0 : 380 * street * (0.7 + 0.3 * Math.sin(v * 11) * Math.sin(v * 7.3));
    burnL[1].intensity = afterK ? 0 : 420 * street * (0.7 + 0.3 * Math.sin(v * 13 + 1) * Math.sin(v * 5.7));
  }

  // buildings and ground
  CU.uBlastR.value = afterK ? SH.D_M + 3000 : front; GU.uBlastR.value = CU.uBlastR.value;
  CU.uKeepR.value = SH.D_M - 1500;
  CU.uRoomFire.value = s.roomFire;
  CU.uPowerR.value = ws.powerR; GU.uPowerR.value = ws.powerR;
  CU.uBurn.value = afterK ? 0 : smooth(SH.V_SMOKE + 4, SH.V_BURN + 6, t); GU.uBurn.value = afterK ? 1 : CU.uBurn.value;
  CU.uBurnNear.value = afterK ? 0 : smooth(SH.V_HEAT + 1.5, SH.V_FIRE + 5, t);
  CU.uSun.value.copy(afterK ? Lf : L); GU.uFbDir.value.copy(afterK ? Lf : L);
  const K = afterK ? 0.4 + 0.5 * fireK : t > 0 ? 0.5 + 1.25 * I : 0;
  CU.uFbC.value.copy(afterK ? FIREC : fc).multiplyScalar(K); GU.uFbC.value.copy(CU.uFbC.value);
  CU.uSkyK.value = afterK ? 0.5 : 1 - 0.7 * smooth(SH.V_CLOUD + 2, SH.V_CLOUD + 7, t);
  const hz = GU.uHaze.value;
  hz.setRGB(0.2, 0.19, 0.28).lerp(HAZE_FIRE, Math.min(1, (t > 0 ? I : 0) * 1.1 + fireK * 0.7)).multiplyScalar((0.4 + 0.25 * I) * (1 - 0.5 * s.night));
  CU.uHaze.value.copy(hz).multiplyScalar(0.55);
  GU.uAmb.value.setRGB(0.1, 0.11, 0.16).lerp(tmpC.copy(afterK ? FIREC : fc).multiplyScalar(0.3), Math.min(1, (t > 0 ? I : 0) * 1.2 + fireK * 0.6));
  blast.WU.uLight.value.copy(fc); blast.WU.uHaze.value.copy(hz);

  // things
  glows.begin(camera);
  smoke.begin();
  flames.begin(v);
  const showShort = !afterK;
  for (const m of people.crowd.meshes) m.visible = showShort;
  for (const m of events.meshes) m.visible = showShort;
  city.leaves.visible = city.canopies.visible = showShort;
  city.trunks.visible = showShort;
  if (showShort) {
    people.frame(sv, ws, glows);
    city.glows(glows, sv, ws);
    events.frame(sv, ws, glows);
    after.hide();
  }
  traffic.frame(sv, ws, glows);
  blast.frame(sv, afterK ? NO_FRONT : ws, glows);
  if (afterK) after.frame(t, v, s, camera.position, glows, flames, smoke);
  lobby.frame(t, { ...ws, front, roomFire: s.roomFire }, v, glows, smoke, s.you);
  flames.end();
  smoke.end();
  glows.end();
  smoke.mat.uniforms.uTime.value = v;
  smoke.mat.uniforms.uLight.value.setRGB(0.8, 0.68, 0.58).lerp(afterK ? FIREC : fc, 0.35).multiplyScalar(afterK ? 0.5 + 0.4 * fireK : 0.6 + 0.5 * I);
  smoke.mat.uniforms.uSun.value.copy(afterK ? Lf : L);
  return I;
}

function update(v) {
  const s = state(v);
  const cam = camAt(v, s);
  // the thumbnail (cover mode only): from the promenade, low, the mushroom cloud over the burning avenue
  if (window.__cover) { cam.pos.set(CAM0.x - 1.2, 1.3, CAM0.z + 4); cam.yaw = -3.5 * DEG; cam.pitch = 16.5 * DEG; cam.roll = 0; cam.fov = 58; }
  camera.position.copy(cam.pos);
  camera.rotation.set(cam.pitch, cam.yaw, cam.roll);
  camera.fov = cam.fov;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  let exposure = 1.0, I = 0;
  // (the camera, with the phone in your hand, belongs to whichever scene is drawn)
  const into = s.shot === 'garage' ? garage.scene : scene;
  if (camera.parent !== into) into.add(camera);
  if (s.shot === 'garage') {
    s.sirens = smooth(V_SIREN - 0.4, V_SIREN + 1.0, v); s.sirT = v - V_SIREN;
    gGlows.begin(camera);
    garage.frame(v, s, gGlows);
    gGlows.end();
    renderPass.scene = garage.scene;
    // (the last shot looks up the ramp at the sirens: less exposure, so their red and blue show)
    exposure = s.dt > 28 ? 1.1 : 1.4;
    bloom.strength = 0.45; bloom.threshold = 1.0;
  } else {
    I = updateWorld(v, s);
    renderPass.scene = scene;
    const t = s.t;
    // (the first seconds of the flash: the street goes white)
    exposure = t < 0 ? 1.15 : !s.after ? 1.0 + 0.6 * s.flashW + 0.5 * smooth(0, 0.08, t) * (1 - smooth(1.5, 6, t)) : s.shot === 'stairs' ? 1.3 : 1.25;
    bloom.threshold = 1.0;
    bloom.strength = (t < 0 ? 0.3 : !s.after ? 0.22 + 0.12 * I + 0.5 * smooth(0, 0.06, t) * (1 - smooth(1.5, 6, t)) : 0.4) + 0.3 * smooth(T_HIT - 1, T_HIT, t) * (s.after ? 0 : 1);
  }
  renderer.toneMappingExposure = exposure;
  phone.frame(v, 1, s.phoneClose, s.sleeve);
  finish.uniforms.uAb.value = s.shot === 'ff' || (s.t > 45 && s.t < 48 && !s.after) ? 0.6 : s.slow ? 0.4 : 0;
  finish.uniforms.uTitle.value = window.__cover ? 0.2 : v < FF_LEN ? 1 - smooth(4.3, 4.6, v) : 0;
  finish.uniforms.uCounter.value = window.__cover ? 0 : 0.9 * (1 - Math.max(s.white, s.black));
  finish.uniforms.uFlash.value = Math.max(s.flashW, s.ffWhite);
  overlay(v, s);
  finish.uniforms.uCap.value = window.__cover ? 0 : s.capA || 0;
  return s;
}

let comp = null;
function renderFrame(t) {
  update(t);
  composer.render();
  if (comp) comp.paint();
}

async function boot() {
  await document.fonts.load('500 40px Cormorant');
  await document.fonts.load('italic 500 40px Cormorant');
  await document.fonts.load('600 40px Cormorant');
  await document.fonts.load('700 40px Cormorant');
  await document.fonts.ready;
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  for (const t of [2, 8, 22, 30, 40, 58, 62, 70, 80, 110, 150, 190, 222, 240]) renderFrame(t);   // compile everything once
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, sky, state, CU, GU, update, garage, lobby, after, comp: () => comp };
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

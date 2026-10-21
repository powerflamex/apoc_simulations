// Camera, light and post for "What if the universe started shrinking?" (1920x1080, 30 fps). The video is a pure
// function of time: renderFrame(v). The first FF_LEN seconds replay the city melting (the flash-forward); after the
// white the closing shot is the promenade at dusk, as at the start.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky, blackbody, fireColor } from './sky.js';
import { makeWorld } from './world.js';
import { makeSpace } from './space.js';
import { makeOverlay } from './overlay.js';
import { state, SEC, VIDEO_DURATION, V_FF, FF_LEN, beatAt, sunDir, clockT } from './timeline.js';
import { DEG, smooth, wobble, clamp, lerp } from './util.js';
import { makeCompositor } from './compose.js';
import { SCOPE_GLSL } from './scope.js';

const W = 1920, H = 1080;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));
const RW = Math.round(W * RES), RH = Math.round(H * RES);

const stage = document.getElementById('stage');
// Plain depth buffer (not logarithmic: that one makes the GPU shade hidden surfaces, ~1.6x slower). Near 0.5 m keeps
// the precision where it matters; far away only the sea, the sea floor and the hills meet, tens of metres apart.
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, logarithmicDepthBuffer: false });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xd09060, 0.00005);
const camera = new THREE.PerspectiveCamera(44, W / H, 0.5, 400000);
camera.rotation.order = 'YXZ';
scene.add(camera);
const sky = makeSky();
scene.add(sky.mesh);
const world = makeWorld(scene);
const space = makeSpace();
const overlay = makeOverlay();

const rt = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(RW, RH);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.35, 0.45, 0.96);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.32 }, uTitle: { value: 0 }, uCounter: { value: 0 },
    uScope: { value: 0 }, uShift: { value: -1 }, uAb: { value: 0 }, uAspect: { value: W / H }, uHeat: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uScope; uniform float uShift; uniform float uAb; uniform float uAspect; uniform float uHeat;
    varying vec2 vUv;
    ${SCOPE_GLSL}
    void main() {
      vec2 c = vUv - 0.5;
      // the heat makes the air shimmer
      vec2 uv = vUv + uHeat * 0.0012 * vec2(sn2(vUv * vec2(9.0, 30.0) + vec2(0.0, uTime * 2.3)) - 0.5, sn2(vUv * vec2(9.0, 30.0) + vec2(5.0, uTime * 2.0)) - 0.5);
      vec2 off = c * uAb * 0.01;
      vec3 col = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.25);
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = max(mix(vec3(lum), col, 1.12), 0.0);
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.8), c * vec2(1.0, 0.8)) * 2.2;
      // dark bands behind the title and the counters so they always read
      col *= 1.0 - uTitle * 0.5 * exp(-pow((vUv.y - 0.63) / 0.16, 2.0));
      col *= 1.0 - uCounter * 0.4 * exp(-pow((vUv.y - 0.17) / 0.11, 2.0));
      if (uScope > 0.0) col = mix(col, scopeView(vUv, uAspect, uShift, uTime), uScope);
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
// where the Sun stands in the frames from the melt on (an hour before sunset), for aiming at it
const SUN_LATE = sunDir(clockT(SEC.melt + 1));
const SUN_YAW = Math.atan2(SUN_LATE[0], -SUN_LATE[2]) / DEG, SUN_EL = Math.asin(SUN_LATE[1]) / DEG;
// each shot: [start, end, keys]; keys: x y z yaw pitch fov (degrees; yaw + turns right, fov vertical), video clock.
// You stand at the railing at x = 0, z = 0, looking west (-z) over the bay; the sea is on the left, the city along
// the shore on the right.
const SHOTS = [
  // dusk: behind you at the railing, looking along the promenade, then turning to the sunset over the bay
  [SEC.prom, SEC.lapse, {
    x: K([5, -0.5], [30, -0.8], [50, -1.0]), y: K([5, 1.95], [30, 2.1], [50, 2.4]), z: K([5, 4.6], [30, 5.8], [50, 7.0]),
    yaw: K([5, 9], [20, 5], [36, -2], [50, -8]), pitch: K([5, 1.5], [30, 2], [50, 6]), fov: K([5, 40], [50, 44]),
  }],
  // the hours race; night falls; the view lifts to the sky over the bay
  [SEC.lapse, SEC.andro, { x: K([50, -1.0], [54, -1.2]), y: K([50, 2.4], [54, 2.7]), z: K([50, 7.0], [54, 8.0]), yaw: K([50, -8], [54, -14]), pitch: K([50, 6], [54, 16]), fov: K([50, 44], [54, 52]) }],
  // Andromeda swelling over the bay; a night with people at the railing under it; the crash; one ball of stars
  [SEC.andro, SEC.turn, {
    x: K([54, -1.2], [94.5, -1.4]), y: K([54, 2.7], [63, 2.4], [72, 2.6], [94.5, 2.8]), z: K([54, 8.0], [63, 9.5], [72, 10], [94.5, 10.5]),
    yaw: K([54, -14], [63, -16], [72, -19], [88, -14], [94.5, -10]), pitch: K([54, 16], [61, 17], [64, 13], [71, 14], [76, 22], [88, 26], [94.5, 24]),
    fov: K([54, 52], [64, 58], [72, 62], [88, 66], [94.5, 62]),
  }],
  // the turn (the telescope view is a 2D insert over this)
  [SEC.turn, SEC.back, { x: K([94.5, -1.4], [129, -1.2]), y: K([94.5, 2.8], [129, 2.6]), z: K([94.5, 10.5], [129, 9]), yaw: K([94.5, -10], [129, 4]), pitch: K([94.5, 24], [129, 28]), fov: K([94.5, 62], [129, 60]) }],
  // the galaxies come back and crash together: the whole sky
  [SEC.back, SEC.warm, { x: K([129, -1.2], [153, -1.0]), y: K([129, 2.6], [153, 2.4]), z: K([129, 9], [153, 8]), yaw: K([129, 4], [141, 8], [153, -2]), pitch: K([129, 28], [141, 32], [153, 18]), fov: K([129, 60], [141, 64], [153, 56]) }],
  // the night gets warm: the promenade under the bright sky; people out again on a summer night; then the bay boils
  [SEC.warm, SEC.glow, {
    x: K([153, -1.0], [178, -0.6], [182, -0.5], [192, -0.7], [198, -1.2], [208, -1.3]),
    y: K([153, 2.4], [178, 2.0], [182, 1.95], [192, 2.0], [198, 2.8], [208, 3.2]),
    z: K([153, 8], [178, 5.5], [182, 4.8], [192, 5.6], [198, 7.5], [208, 8.5]),
    yaw: K([153, -2], [170, 4], [182, 8], [192, 2], [197, -14], [208, -18]),
    pitch: K([153, 18], [168, 12], [182, 6], [192, 7], [198, 3], [208, 4]),
    fov: K([153, 56], [182, 44], [192, 46], [208, 48]),
  }],
  // the sky glows red over the dry bay and the dark city
  [SEC.glow, SEC.melt, { x: K([208, -1.3], [225, -1.0]), y: K([208, 3.2], [225, 3.0]), z: K([208, 8.5], [225, 9]), yaw: K([208, -18], [216, -2], [225, 14]), pitch: K([208, 4], [216, 9], [225, 6]), fov: K([208, 48], [225, 50]) }],
  // the ground melts, the towers sag; you rise off the promenade and float over the lava
  [SEC.melt, SEC.stars, {
    x: K([225, -1.0], [238, -0.6], [252, -1.0], [270, -1.2]), y: K([225, 3.0], [238, 2.8], [252, 2.6], [270, 3.0]), z: K([225, 9], [238, 8], [252, 7], [270, 7]),
    yaw: K([225, 14], [232, 26], [238, 24], [248, 6], [258, SUN_YAW + 6], [270, SUN_YAW + 3]),
    pitch: K([225, 6], [238, 5], [246, -6], [256, -9], [270, -4]), fov: K([225, 50], [238, 48], [250, 52], [270, 50]),
  }],
  // hotter than the Sun: look for it; it fades into the sky
  [SEC.stars, SEC.space, {
    x: K([270, -1.2], [298, -1.2]), y: K([270, 3.0], [298, 3.0]), z: K([270, 7], [298, 7]),
    yaw: K([270, SUN_YAW + 3], [278, SUN_YAW + 1], [298, SUN_YAW]), pitch: K([270, -4], [278, SUN_EL - 3], [298, SUN_EL - 2]), fov: K([270, 50], [280, 34], [298, 32]),
  }],
];
function shotAt(v) {
  for (const s of SHOTS) if (v >= s[0] && v < s[1]) return s;
  return v < SEC.prom ? SHOTS[0] : SHOTS[SHOTS.length - 1];
}
// the Milky Way (galactic centre low in the south-west, the band arching up over the sky to the north-east) and
// Andromeda, high over the bay ahead and to the left, tilted
const GC = new THREE.Vector3(-0.72, 0.1, -0.68).normalize();
const GP = new THREE.Vector3().crossVectors(GC, new THREE.Vector3(0.1, 0.72, -0.68).normalize()).normalize();
const AND = new THREE.Vector3(-0.42, 0.52, -0.74).normalize();
const AND_A = new THREE.Vector3().crossVectors(AND, new THREE.Vector3(0, 1, 0)).normalize().applyAxisAngle(AND, 35 * DEG);
const AND_B = new THREE.Vector3().crossVectors(AND_A, AND).normalize();

const tmp = new THREE.Color(), glowC = new THREE.Color();
const v3 = new THREE.Vector3();
const look = {
  sunDir: new THREE.Vector3(), sunCol: new THREE.Color(), sunI: 1, sunR: 0.00465, sunC: 1,
  skyHi: new THREE.Color(), skyLo: new THREE.Color(), night: 0, lights: 0, windows: 0,
};
// the sky's colours near the horizon (lo) and above (hi) for the Sun's elevation (degrees): for the sea and glass
function skyColors(e, hi, lo) {
  const day = smooth(8, 22, e), gold = smooth(-1, 3, e), twi = smooth(-8, -1, e), dark = smooth(-14, -8, e);
  hi.setRGB(0.006, 0.01, 0.03).lerp(tmp.setRGB(0.04, 0.07, 0.2), dark).lerp(tmp.setRGB(0.05, 0.09, 0.24), twi)
    .lerp(tmp.setRGB(0.3, 0.42, 0.68), gold).lerp(tmp.setRGB(0.17, 0.34, 0.74), day);
  lo.setRGB(0.03, 0.04, 0.08).lerp(tmp.setRGB(0.25, 0.12, 0.12), dark).lerp(tmp.setRGB(0.8, 0.35, 0.18), twi)
    .lerp(tmp.setRGB(1.05, 0.6, 0.3), gold).lerp(tmp.setRGB(0.62, 0.74, 0.92), day);
}

// v: the story moment to show; vv: the video clock (title, white, closing)
function update(v, vv = v) {
  const s = state(v);
  // the title, the white and the closing follow the video clock (the flash-forward and the closing shot show
  // other moments of the story)
  const sv = vv === v ? s : state(vv);
  s.title = sv.title; s.name = sv.name; s.flash = sv.flash; s.after = sv.after; s.fadeOut = sv.fadeOut;
  const b = beatAt(v);
  let punch = 0;
  if (b && !window.__cover && vv >= FF_LEN) punch = smooth(0, 0.06, b.dt) * Math.exp(-Math.max(0, b.dt - 0.06) * 4);
  let heat = 0;

  if (s.space) {
    // ---------- after Earth: you, adrift in the glow ----------
    renderPass.scene = space.scene;
    space.frame(v, camera, s);
    camera.rotation.x -= punch * 0.8 * DEG;
    camera.fov = 42 - 2 * punch;
    camera.near = 0.05; camera.far = 4000;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    renderer.toneMappingExposure = 1.15 * (1 - 0.3 * (1 - s.squash));
    bloom.strength = 0.6 * (1 - 0.6 * (1 - s.squash));
    heat = (1 - s.dim) * (1 - s.bang) * 0.8;
  } else {
    renderPass.scene = scene;
    // ---------- camera ----------
    const sh = shotAt(v)[2];
    let x = spline(sh.x, v), y = spline(sh.y, v), z = spline(sh.z, v);
    let yaw = spline(sh.yaw, v) * DEG, pitch = spline(sh.pitch, v) * DEG, roll = 0, fov = spline(sh.fov, v);
    // you float up off the melting promenade (the view goes with you, behind and a little above)
    const up = 42 * s.rise;
    s.youY = up;
    y += up; z += 2.5 * s.rise;
    x += wobble(v * 0.3, 1) * 0.04; y += wobble(v * 0.35, 2) * 0.02;
    yaw += wobble(v * 0.25, 3) * 0.25 * DEG * (fov / 50); pitch += wobble(v * 0.28, 4) * 0.2 * DEG * (fov / 50); roll += wobble(v * 0.2, 5) * 0.3 * DEG;
    fov *= 1 - 0.03 * punch;
    camera.position.set(x, y, z);
    camera.rotation.set(pitch, -yaw, roll);
    camera.fov = fov;
    camera.near = 0.4; camera.far = 400000;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    // ---------- the Sun, the sky, the light ----------
    look.sunDir.fromArray(s.sunD);
    const e = Math.asin(look.sunDir.y) / DEG;
    blackbody(5772, look.sunCol);
    look.sunCol.lerp(tmp.setRGB(1.0, 0.55, 0.3), (1 - smooth(2, 20, e)) * 0.75 * (1 - s.glowI));
    look.sunI = 22; look.sunR = 0.00465; look.sunC = s.sunC;
    look.night = 1 - smooth(-7, 1, e);
    look.lights = (1 - smooth(-3, 9, e)) * s.lights;
    look.windows = (0.06 + 0.5 * (1 - smooth(-4, 6, e))) * (0.1 + 0.9 * s.lights);
    skyColors(e, look.skyHi, look.skyLo);
    // the starlight of the crashed galaxies brightens the night
    const starL = 0.7 * s.merge + 0.12 * s.ball;
    look.skyHi.lerp(tmp.setRGB(0.22, 0.27, 0.42), starL * 0.6); look.skyLo.lerp(tmp.setRGB(0.25, 0.28, 0.4), starL * 0.5);
    // the heat: the sky's glow, brightening steeply as it heats
    fireColor(s.K, glowC);
    const gI = s.glowI * (0.3 + 0.55 * smooth(900, 7000, s.K)) * (1 + 0.4 * s.earthGone);
    look.skyHi.lerp(tmp.copy(glowC).multiplyScalar(0.7 * gI), s.glowI); look.skyLo.lerp(tmp.copy(glowC).multiplyScalar(gI), s.glowI);
    // steam haze while the bay boils
    look.skyLo.lerp(tmp.setRGB(0.5, 0.5, 0.55), s.steam * 0.3);

    const u = sky.uniforms;
    sky.mesh.position.copy(camera.position);
    u.uSunDir.value.copy(look.sunDir); u.uSunR.value = look.sunR; u.uSunCol.value.copy(look.sunCol); u.uSunI.value = look.sunI;
    u.uSunC.value = look.sunC; u.uSunFuzz.value = s.sunFuzz;
    u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / RH;
    u.uTime.value = v;
    u.uCloudCov.value = 1 - smooth(SEC.lapse, SEC.lapse + 2.5, v);
    u.uCloudPhase.value.set(((s.T * 0.004) % 50) + 3, ((s.T * 0.0013) % 50) + 7);
    u.uCityGlow.value = s.lights * (1 - s.glowI);
    u.uGC.value.copy(GC); u.uGP.value.copy(GP); u.uMW.value = 1 - s.ball;
    u.uAnd.value.copy(AND); u.uAndA.value.copy(AND_A); u.uAndB.value.copy(AND_B);
    u.uAndR.value = s.andR; u.uCollide.value = s.collide; u.uBall.value = s.ball;
    u.uBack.value = s.back; u.uMerge.value = s.merge * (1 - 0.85 * s.glowI);
    u.uGlow.value.set(glowC.r * gI, glowC.g * gI, glowC.b * gI);
    u.uFog.value = Math.max(s.fog, s.earthGone);
    u.uSeethe.value = 1 + 2 * smooth(3000, 9000, s.K);

    const L = world.sun, hemi = world.hemi;
    L.color.copy(look.sunCol);
    L.intensity = 3.0 * smooth(-1.5, 2.5, e) * (1 - 0.7 * s.glowI) * look.sunC;
    hemi.color.copy(look.skyHi).lerp(look.skyLo, 0.4);
    hemi.groundColor.setRGB(0.35, 0.27, 0.2).multiplyScalar(0.3 + 0.7 * (1 - look.night)).lerp(tmp.copy(glowC).multiplyScalar(0.6 * gI), s.glowI);
    hemi.intensity = lerp(0.75, 0.3, look.night) + 0.3 * starL + 1.2 * s.glowI;
    scene.fog.color.copy(look.skyLo).multiplyScalar(0.9);
    // the fog of fire: you can't see far; at the end nothing at all
    scene.fog.density = 0.00004 + 0.00003 * s.steam + 0.004 * s.fog * s.fog + 0.06 * s.earthGone;
    world.frame(v, s, camera, look);
    renderer.toneMappingExposure = lerp(1.05, 1.35, look.night) * (1 - 0.25 * starL) / (1 + 0.3 * gI);
    bloom.strength = 0.35 + 0.25 * s.glowI;
    heat = s.glowI;
  }
  const bright = Math.max(heat, s.space ? 1 : 0);
  finish.uniforms.uTime.value = v;
  finish.uniforms.uHeat.value = heat;
  finish.uniforms.uScope.value = s.scope;
  finish.uniforms.uShift.value = s.shift;
  finish.uniforms.uAb.value = punch * 0.5;
  finish.uniforms.uTitle.value = window.__cover ? 1.2 : Math.max(s.title, 0.8 * s.name);
  finish.uniforms.uCounter.value = window.__cover ? 0 : (1 - s.flash) * (1 - s.scope) * (1 - s.after) * 0.9 * (1 - 0.6 * bright);
  overlay(v, s, vv);
  return s;
}

let comp = null;
// t is video time
function renderFrame(t) {
  if (t < FF_LEN) update(V_FF + t, t);                        // the flash-forward
  else if (t >= SEC.end + 1) update(SEC.prom + 2 + (t - SEC.end - 1), t);   // the closing shot: the promenade at dusk
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
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  for (const t of [2, 20, 60, 80, 110, 140, 185, 200, 215, 240, 260, 285, 310, 340, 346, 360]) renderFrame(t);   // compile everything once
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, world, space };
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

// Camera, light and post for "What if you watched the universe die?" (1920x1080, 30 fps). The video is a pure
// function of time: renderFrame(v). The first FF_LEN seconds replay the black hole's disk over the frozen city (the
// flash-forward); then the whole universe from outside (src/demo.js) until SEC.walk; the terrace from there; after
// Earth evaporates you float in the dark; Penrose's idea is the universe from outside again; after the white at the
// end the closing shot is the terrace at dusk.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky, blackbody } from './sky.js';
import { makeWorld } from './world.js';
import { makeDemo } from './demo.js';
import { makeOverlay } from './overlay.js';
import { state, SEC, VIDEO_DURATION, V_FF, FF_LEN, beatAt, sunDir, clockT, CRASHES, POPS, closingAt } from './timeline.js';
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
// Plain depth buffer (a logarithmic one makes the GPU shade hidden surfaces, ~1.6x slower); near 0.5 m.
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, logarithmicDepthBuffer: false });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xd09060, 0.00004);
const camera = new THREE.PerspectiveCamera(44, W / H, 0.5, 120000);
camera.rotation.order = 'YXZ';
scene.add(camera);
const sky = makeSky();
scene.add(sky.mesh);
const world = makeWorld(scene);
const demo = makeDemo();
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
    uScope: { value: 0 }, uRed: { value: 0 }, uGone: { value: 0 }, uAb: { value: 0 }, uAspect: { value: W / H }, uWhite: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uScope; uniform float uRed; uniform float uGone; uniform float uAb; uniform float uAspect; uniform float uWhite;
    varying vec2 vUv;
    ${SCOPE_GLSL}
    void main() {
      vec2 c = vUv - 0.5;
      vec2 off = c * uAb * 0.01;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.25);
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = max(mix(vec3(lum), col, 1.12), 0.0);
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.8), c * vec2(1.0, 0.8)) * 2.2;
      // dark bands behind the title and the counters so they always read
      col *= 1.0 - uTitle * 0.5 * exp(-pow((vUv.y - 0.63) / 0.16, 2.0));
      col *= 1.0 - uCounter * 0.45 * exp(-pow((vUv.y - 0.16) / 0.11, 2.0)) * max(smoothstep(0.5, 0.12, vUv.x), smoothstep(0.62, 0.92, vUv.x));
      if (uScope > 0.0) col = mix(col, scopeView(vUv, uAspect, uRed, uGone, uTime), uScope);
      col = mix(col, vec3(1.0), uWhite);
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
// where the Sun stands from the lock on (an hour before sunset), for aiming at it
const SUN_LATE = sunDir(clockT(SEC.lock + 1));
const SUN_YAW = Math.atan2(SUN_LATE[0], -SUN_LATE[2]) / DEG, SUN_EL = Math.asin(SUN_LATE[1]) / DEG;
const BH_DIR = new THREE.Vector3(0.3, 0.5, -0.81).normalize();
const BH_YAW = Math.atan2(BH_DIR.x, -BH_DIR.z) / DEG, BH_EL = Math.asin(BH_DIR.y) / DEG;
// each shot: [start, end, keys]; keys: x y z yaw pitch fov (degrees; yaw + turns right, fov vertical), video clock.
// You stand at the railing at x = 0, z = 0.15, looking west (-z) over the city; the observatory is on the right.
const S_ = SEC;
const SHOTS = [
  // the terrace at sunset in real time (seen only in the closing shot): behind you at the railing, the dome on the
  // right, turning to the sunset over the city
  [SEC.prom, SEC.lapse, {
    x: K([-24, -1.6], [-10, -1.5], [6, -1.3]), y: K([-24, 2.9], [6, 3.0]), z: K([-24, 6.6], [-10, 7.2], [6, 8.2]),
    yaw: K([-24, 22], [-14, 14], [-4, 6], [6, 2]), pitch: K([-24, -6], [6, -5]), fov: K([-24, 44], [6, 47]),
  }],
  // the cut from the flash-forward: time already racing; days and nights sweep over the city; the view lifts to the sky
  [SEC.lapse, SEC.lock, { x: K([S_.lapse, -1.3], [S_.lock, -1.2]), y: K([S_.lapse, 3.0], [S_.lock, 3.2]), z: K([S_.lapse, 8.2], [S_.lock, 9.5]), yaw: K([S_.lapse, 4], [S_.lock, SUN_YAW + 14]), pitch: K([S_.lapse, -5], [S_.lock, 1]), fov: K([S_.lapse, 47], [S_.lock, 58]) }],
  // the red giant swelling over the city; it blows apart in glowing shells; the white dwarf
  [SEC.lock, SEC.day - 0.5, {
    x: K([S_.lock, -1.2], [S_.day - 0.5, -1.1]), y: K([S_.lock, 3.2], [S_.day - 0.5, 3.4]), z: K([S_.lock, 9.5], [S_.day - 0.5, 10.5]),
    yaw: K([S_.lock, SUN_YAW + 14], [S_.giant + 4, SUN_YAW + 16], [S_.shed + 2, SUN_YAW + 17], [S_.day - 0.5, SUN_YAW + 18]),
    pitch: K([S_.lock, 1], [S_.giant + 3, 4], [S_.shed + 1.5, 9], [S_.wd + 0.5, 8], [S_.day - 0.5, 5]), fov: K([S_.lock, 58], [S_.giant + 3, 64], [S_.shed + 2, 66], [S_.day - 0.5, 62]),
  }],
  // the black daytime sky, the tiny blinding star; Earth freezes; the air falls as snow
  [SEC.day - 0.5, SEC.leave, {
    x: K([S_.day - 0.5, -1.1], [S_.freeze, -1.2], [S_.snow, -1.4], [S_.leave, -1.4]), y: K([S_.day - 0.5, 3.4], [S_.freeze, 3.0], [S_.snow, 2.8], [S_.leave, 2.9]),
    z: K([S_.day - 0.5, 10.5], [S_.freeze, 8.5], [S_.snow, 6.8], [S_.leave, 7.0]),
    yaw: K([S_.day - 0.5, SUN_YAW + 18], [S_.freeze, SUN_YAW + 22], [S_.snow + 0.5, 10], [S_.leave, 4]), pitch: K([S_.day - 0.5, 5], [S_.freeze, -1], [S_.snow + 0.5, -5], [S_.leave, 2]),
    fov: K([S_.day - 0.5, 62], [S_.freeze, 54], [S_.snow + 0.5, 48], [S_.leave, 54]),
  }],
  // night: the merged galaxy, one ball of stars (the telescope view is a 2D insert over this)
  [SEC.leave, SEC.out, { x: K([S_.leave, -1.4], [S_.out, -1.5]), y: K([S_.leave, 2.9], [S_.out, 3.0]), z: K([S_.leave, 7.0], [S_.out, 8.0]), yaw: K([S_.leave, 4], [S_.scope0, -22], [S_.out, -26]), pitch: K([S_.leave, 2], [S_.scope0, 9], [S_.out, 10]), fov: K([S_.leave, 54], [S_.scope0, 64], [S_.out, 66]) }],
  // the stars go out over the frozen city (the last one ahead and left); the dying Sun; dead stars crash
  [SEC.out, SEC.bh, {
    x: K([S_.out, -1.5], [S_.bh, -1.6]), y: K([S_.out, 3.0], [S_.bh, 3.1]), z: K([S_.out, 8.0], [S_.last + 3, 8.6], [S_.bh, 9.0]),
    yaw: K([S_.out, -26], [S_.bright + 1, -16], [S_.small + 2, -10], [S_.last + 0.5, -10], [S_.last + 3, SUN_YAW + 12], [S_.black + 1, SUN_YAW + 14], [S_.crash - 1, -10], [S_.crash + 4, 2], [S_.bh, BH_YAW * 0.45]),
    pitch: K([S_.out, 10], [S_.small + 2, 9], [S_.last + 0.5, 8], [S_.last + 3, 4], [S_.black + 1, 4], [S_.crash - 1, 7], [S_.crash + 4, 8], [S_.bh, 9]),
    fov: K([S_.out, 66], [S_.small + 2, 62], [S_.last + 3, 56], [S_.black + 1, 56], [S_.crash - 1, 64], [S_.bh, 64]),
  }],
  // the black hole grows overhead; its disk lights the frozen city
  [SEC.bh, SEC.evap, {
    x: K([S_.bh, -1.6], [S_.evap, -1.8]), y: K([S_.bh, 3.1], [S_.evap, 3.3]), z: K([S_.bh, 9.0], [S_.fire, 9.8], [S_.evap, 10.2]),
    yaw: K([S_.bh, BH_YAW * 0.45], [S_.disk, BH_YAW * 0.5], [S_.evap, BH_YAW * 0.3]), pitch: K([S_.bh, 9], [S_.bh + 6, 11], [S_.fire + 3, 11], [S_.evap, 6]), fov: K([S_.bh, 64], [S_.fire, 64], [S_.evap, 60]),
  }],
  // Earth evaporates under you; you float up into the dark
  [SEC.evap, SEC.float, { x: K([S_.evap, -1.8], [S_.float, -2.0]), y: K([S_.evap, 3.3], [S_.float, 2.4]), z: K([S_.evap, 10.2], [S_.float, 6.0]), yaw: K([S_.evap, BH_YAW * 0.3], [S_.float, -12]), pitch: K([S_.evap, 6], [S_.evap + 4.5, -8], [S_.float, 4]), fov: K([S_.evap, 60], [S_.float, 60]) }],
  // floating under the last black hole, to its last flash and the afterglow
  [SEC.float, SEC.end, {
    x: K([S_.float, -2.0], [S_.holes + 2, -1.5], [S_.googol, -1.0], [S_.until, -0.4], [S_.void, 0.2]), y: K([S_.float, 2.4], [S_.holes + 2, 2.8], [S_.void, 2.8]),
    z: K([S_.float, 6.0], [S_.holes + 2, 5.0], [S_.lastLight, 5.0], [S_.void, 4.6]),
    yaw: K([S_.float, -12], [S_.holes + 2, BH_YAW - 14], [S_.googol, BH_YAW - 6], [S_.until, BH_YAW + 3], [S_.void, BH_YAW + 6]), pitch: K([S_.float, 4], [S_.holes + 2, 7], [S_.hotter, 7], [S_.lastLight, 8], [S_.void, 6]),
    fov: K([S_.float, 60], [S_.holes + 2, 72], [S_.hotter, 70], [S_.lastLight, 64], [S_.lastLight + 7, 70], [S_.void, 72]),
  }],
];
function shotAt(v) {
  for (const s of SHOTS) if (v >= s[0] && v < s[1]) return s;
  return v < SEC.prom ? SHOTS[0] : SHOTS[SHOTS.length - 1];
}
// the Milky Way (galactic centre low in the south-west, the band arching over to the north-east)
const GC = new THREE.Vector3(-0.72, 0.18, -0.66).normalize();
const GP = new THREE.Vector3().crossVectors(GC, new THREE.Vector3(0.1, 0.72, -0.68).normalize()).normalize();

const tmp = new THREE.Color();
const look = {
  sunDir: new THREE.Vector3(), sunCol: new THREE.Color(), skyHi: new THREE.Color(), skyLo: new THREE.Color(), night: 0, lights: 0,
  fxDir: new THREE.Vector3(0, 1, 0), fxCol: new THREE.Color(0, 0, 0), flakeLight: 1,
};
const sunC = new THREE.Color(), wdC = new THREE.Color(), giantC = new THREE.Color();
// the sky's colours near the horizon (lo) and above (hi) for the Sun's elevation (degrees): for glass and ambient
function skyColors(e, hi, lo) {
  const day = smooth(8, 22, e), gold = smooth(-1, 3, e), twi = smooth(-8, -1, e), dark = smooth(-14, -8, e);
  hi.setRGB(0.006, 0.01, 0.03).lerp(tmp.setRGB(0.04, 0.07, 0.2), dark).lerp(tmp.setRGB(0.05, 0.09, 0.24), twi)
    .lerp(tmp.setRGB(0.3, 0.42, 0.68), gold).lerp(tmp.setRGB(0.17, 0.34, 0.74), day);
  lo.setRGB(0.03, 0.04, 0.08).lerp(tmp.setRGB(0.25, 0.12, 0.12), dark).lerp(tmp.setRGB(0.8, 0.35, 0.18), twi)
    .lerp(tmp.setRGB(1.05, 0.6, 0.3), gold).lerp(tmp.setRGB(0.62, 0.74, 0.92), day);
}
const v4 = (d, w) => new THREE.Vector4(d[0], d[1], d[2], w);

// v: the story moment to show; vv: the video clock (title, white, closing)
function update(v, vv = v) {
  const s = state(v);
  const sv = vv === v ? s : state(vv);
  s.title = sv.title; s.name = sv.name; s.flash = sv.flash; s.after = sv.after; s.fadeOut = sv.fadeOut;
  const b = beatAt(v);
  let punch = 0;
  if (b && !b.quiet && !window.__cover && vv >= FF_LEN) punch = smooth(0, 0.06, b.dt) * Math.exp(-Math.max(0, b.dt - 0.06) * 4);
  let white = 0;

  const demoOn = vv === v && s.demo2;
  if (demoOn) {
    // ---------- the whole universe from outside ----------
    renderPass.scene = demo.scene;
    s.here = demo.frame(v, camera, punch);
    renderer.toneMappingExposure = 1.0;
    bloom.strength = 0.8;
  } else {
    renderPass.scene = scene;
    // ---------- camera ----------
    const sh = shotAt(v)[2];
    let x = spline(sh.x, v), y = spline(sh.y, v), z = spline(sh.z, v);
    let yaw = spline(sh.yaw, v) * DEG, pitch = spline(sh.pitch, v) * DEG, roll = 0, fov = spline(sh.fov, v);
    // you float up off the evaporating terrace (the view goes with you)
    const up = 9 * s.rise;
    s.youY = up;
    y += up;
    x += wobble(v * 0.3, 1) * 0.04; y += wobble(v * 0.35, 2) * 0.02;
    yaw += wobble(v * 0.25, 3) * 0.25 * DEG * (fov / 50); pitch += wobble(v * 0.28, 4) * 0.2 * DEG * (fov / 50); roll += wobble(v * 0.2, 5) * 0.3 * DEG;
    if (s.rise > 0) roll += Math.sin(v * 0.11) * 3 * DEG * s.rise;
    fov *= 1 - 0.03 * punch;
    pitch -= punch * 0.6 * DEG;
    camera.position.set(x, y, z);
    camera.rotation.set(pitch, -yaw, roll);
    camera.fov = fov;
    camera.near = 0.5; camera.far = 120000;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    // ---------- the Sun, the sky, the light ----------
    look.sunDir.fromArray(s.sunD);
    const e = Math.asin(look.sunDir.y) / DEG;
    blackbody(5772, sunC);
    sunC.lerp(tmp.setRGB(1.0, 0.55, 0.3), (1 - smooth(2, 20, e)) * 0.75);
    giantC.setRGB(1.0, 0.24, 0.05);
    blackbody(s.wdK, wdC);
    const gi = s.giantC * (1 - s.wd);
    look.sunCol.copy(sunC).lerp(giantC, gi).lerp(wdC, s.wd);
    const sunUp = smooth(-1.5, 2.5, e);
    // the light it casts: an ordinary evening; the giant's deep red flood; the white dwarf's harsh little light,
    // fading out over trillions of years
    let sunL = 3.0 * sunUp;
    sunL = lerp(sunL, 2.4 * sunUp, gi);
    sunL = lerp(sunL, 1.7 * sunUp * s.wdI, s.wd);
    look.night = 1 - smooth(-7, 1, e);
    look.lights = (1 - smooth(-4, 5, e)) * s.lights;
    skyColors(e, look.skyHi, look.skyLo);
    // the red giant floods the air with red; the air thins away to black
    look.skyHi.lerp(tmp.setRGB(0.5, 0.12, 0.04), gi * 0.9); look.skyLo.lerp(tmp.setRGB(0.95, 0.3, 0.08), gi * 0.9);
    look.skyHi.multiplyScalar(s.air); look.skyLo.multiplyScalar(s.air);

    const u = sky.uniforms;
    sky.mesh.position.copy(camera.position);
    u.uSunDir.value.copy(look.sunDir);
    // the disk (the Sun, then the red giant, which dissolves into its shells), and the white dwarf's point
    u.uSunR.value = s.sunR;
    u.uSunCol.value.copy(sunC).lerp(giantC, s.giantC);
    u.uSunI.value = lerp(22, 1.35, s.giantC);
    u.uGiant.value = s.giantC;
    u.uSunVis.value = 1 - s.shed;
    u.uWd.value = s.wd * s.wdI;
    u.uWdCol.value.copy(wdC);
    u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / RH;
    u.uTime.value = v;
    u.uCloudCov.value = 1 - smooth(SEC.lapse, SEC.lapse + 2.5, v);
    u.uCloudPhase.value.set(((s.T * 0.004) % 50) + 3, ((s.T * 0.0013) % 50) + 7);
    u.uCityGlow.value = look.lights;
    u.uAir.value = s.air; u.uRedSky.value = gi * 0.92; u.uNoGround.value = s.earthGone;
    u.uGC.value.copy(GC); u.uGP.value.copy(GP); u.uMW.value = 1 - s.ball; u.uBall.value = s.ball; u.uGalDim.value = s.galDim;
    u.uStarsOut.value = s.starsOut; u.uStarRed.value = s.starRed; u.uFar.value = s.far; u.uLastStar.value = s.lastStar;
    u.uNeb.value = s.nebula; u.uNebI.value = s.shed * (1 - s.nebula) * 1.4;
    // two dead stars crashing; far black holes evaporating
    let fxI = 0;
    look.fxDir.set(0, 1, 0);
    CRASHES.forEach(([t, d, k], i) => {
      const dt = v - t;
      const env = dt > -0.1 && dt < 8 ? smooth(-0.1, 0.05, dt) * Math.exp(-Math.max(0, dt) * 0.9) * k : 0;
      u.uCrash.value[i].copy(v4(d, env));
      if (env > fxI) { fxI = env; look.fxDir.fromArray(d).normalize(); }
    });
    let pi = 0;
    for (const p of u.uPop.value) p.w = 0;
    for (const [t, d] of POPS) {
      const dt = v - t;
      if (dt > -0.05 && dt < 1.2 && pi < 4) {
        const e = smooth(-0.05, 0.03, dt) * Math.exp(-Math.max(0, dt) * 4);
        u.uPop.value[pi++].copy(v4(d, e));
        if (e * 0.7 > fxI) { fxI = e * 0.7; look.fxDir.fromArray(d).normalize(); }
      }
    }
    look.fxCol.setRGB(0.8, 0.88, 1.0).multiplyScalar(fxI * 2.2);
    // the black hole
    u.uBhDir.value.copy(BH_DIR);
    u.uBhR.value = s.bh > 0 && !s.bhGone ? s.bhR * Math.max(s.bh, 0.02) : 0;
    u.uDisk.value = s.disk;
    u.uHawk.value = s.hawk;
    u.uLastFlash.value = s.lastFlash;
    u.uShell.value = s.shell > 0 ? s.shell : 0;
    // its disk lights the frozen city (and casts the terrace's shadows); later the last flash
    if (s.disk > 0.001) {
      look.sunDir.lerp(BH_DIR, Math.min(1, s.disk * 2)).normalize();
      look.sunCol.lerp(tmp.setRGB(1.0, 0.6, 0.32), Math.min(1, s.disk * 2));
      sunL = lerp(sunL, 2.1 * s.disk, Math.min(1, s.disk * 2));
    }
    const flashL = s.lastFlash + 0.5 * s.hawk;
    if (flashL > fxI * 0.5) { look.fxDir.copy(BH_DIR); look.fxCol.setRGB(1, 0.75 + 0.25 * s.lastFlash, 0.55 + 0.45 * s.lastFlash).multiplyScalar(flashL * 3 + 2.5 * s.hawk * s.earthGone); }

    const L = world.sun, hemi = world.hemi;
    L.color.copy(look.sunCol);
    L.intensity = sunL;
    // the ambient light: the sky's (dusk, night) while there is air; then starlight, and once the stars are gone a
    // faint cold blue so the frozen city still reads
    hemi.color.copy(look.skyHi).lerp(look.skyLo, 0.4).lerp(tmp.setRGB(0.3, 0.34, 0.46), 1 - s.air);
    hemi.groundColor.setRGB(0.35, 0.27, 0.2).multiplyScalar(0.3 + 0.7 * (1 - look.night)).lerp(tmp.setRGB(0.12, 0.13, 0.17), 1 - s.air);
    hemi.intensity = lerp(lerp(0.75, 0.3, look.night), 0.5 * s.amb, 1 - s.air) + 0.5 * gi + 0.25 * s.disk;
    scene.fog.color.copy(look.skyLo).multiplyScalar(0.9);
    // no air, no haze: the frozen world is crystal clear
    scene.fog.density = lerp(0.00004, 0.000004, 1 - s.air);
    world.basin.LU.uFogD.value = scene.fog.density;
    look.flakeLight = 0.5 + 1.2 * s.wdI;
    world.frame(v, s, camera, look);
    const dark = smooth(SEC.out, SEC.black, v) * (1 - s.disk);
    renderer.toneMappingExposure = lerp(1.05, 1.35, look.night) * (1 - 0.2 * gi) * (1 + 0.8 * dark) * (1 - 0.3 * s.disk);
    bloom.strength = 0.35 + 0.25 * s.disk + 0.4 * s.lastFlash + 0.2 * gi;
    white = Math.min(1, s.lastFlash * 1.3) * (1 - smooth(SEC.lastLight + 0.4, SEC.lastLight + 2.6, v));
  }
  finish.uniforms.uTime.value = v;
  finish.uniforms.uScope.value = s.scope;
  finish.uniforms.uRed.value = s.redden;
  finish.uniforms.uGone.value = s.fadeGal;
  finish.uniforms.uAb.value = punch * 0.5;
  finish.uniforms.uWhite.value = white;
  const cl = closingAt(vv);
  finish.uniforms.uTitle.value = window.__cover ? 0 : Math.max(s.title, 0.8 * s.name, cl ? 0.9 * cl.a : 0);
  finish.uniforms.uCounter.value = window.__cover ? 1.3 : (1 - s.flash) * (1 - s.scope) * (1 - s.after) * 0.9;
  overlay(v, s, vv);
  return s;
}

let comp = null;
// t is video time
function renderFrame(t) {
  if (t < FF_LEN) update(V_FF + t, t);                        // the flash-forward
  else if (t >= SEC.end + 1) update(SEC.prom + 2 + (t - SEC.end - 1), t);   // the closing shot: the terrace at dusk
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
  for (const t of [2, 8, 16, 24, 30, 40, 52, 70, 96.6, 112, 135, 150, 174, 190, 215, 225]) renderFrame(t);   // compile everything once
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, world };
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

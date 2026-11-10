import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeShaft, RS } from './shaft.js';
import { makeMetro, METRO_TOP, METRO_BOT } from './metro.js';
import { makeMadrid, makeWellington } from './ends.js';
import { makeSuit } from './suit.js';
import { makeCutaway } from './cutaway.js';
import { makeOverlay } from './overlay.js';
import {
  state, joltAt, sAt, storyT, tempAt, R_KM, VIDEO_DURATION, LOOP, T_SWITCH, V_CENTER, V_STREET, V_APEX,
  V_BURJ, V_KOLA, V_MINE, seenAt, seenFlowAt,
} from './timeline.js';
import { DEG, lerp, smooth, wobble, keys, clamp } from './util.js';
import { makeCompositor } from './compose.js';

const W = 1080, H = 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));
const RW = Math.round(W * RES), RH = Math.round(H * RES);

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.prepend(renderer.domElement);

// ---------- the world round you (you stay at the origin: your feet; the world moves) ----------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, W / H, 0.05, 9000);
scene.add(camera);
const sky = makeSky();
scene.add(sky.mesh);
const shaft = makeShaft();
scene.add(shaft.mesh);
const metro = makeMetro();
scene.add(metro.group);
const madrid = makeMadrid();
scene.add(madrid.group);
const nz = makeWellington();
scene.add(nz.group);
const suit = makeSuit();
const body = new THREE.Group();     // pivot at your middle (1 m up), so turning you doesn't swing you round
body.position.set(0, 1.0, 0);
suit.root.position.set(0, -0.05, 0);
body.add(suit.root);
scene.add(body);

const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
sun.position.set(35, 82, -45);
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0x9fb6d8, 0x6a5a48, 0.8);
scene.add(hemi);
const above = new THREE.PointLight(0xffffff, 0, 14, 1.4);
const below = new THREE.PointLight(0xffffff, 0, 14, 1.4);
scene.add(above, below);
const fill = new THREE.PointLight(0xfff4e8, 0, 12, 1.5);
scene.add(fill);
// the visor reflects the hole round you (a small cube camera at your helmet, drawn every frame)
const cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
const cubeCam = new THREE.CubeCamera(0.05, 3000, cubeRT);
scene.add(cubeCam);
suit.visorMat.envMap = cubeRT.texture;
suit.visorMat.envMapIntensity = 1.6;
const cut = makeCutaway();
const overlay = makeOverlay();

const rt = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(RW, RH);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.2, 0.35, 2.4);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uVig: { value: 0.3 }, uTitle: { value: 0 }, uCounter: { value: 0 }, uCap: { value: 0 },
    uZoom: { value: 0 }, uZC: { value: new THREE.Vector2(0.5, 0.5) }, uHeat: { value: 0 }, uTime: { value: 0 }, uWhite: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVig, uTitle, uCounter, uCap, uZoom, uHeat, uTime, uWhite; uniform vec2 uZC;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      // heat haze in the glowing layers
      uv += uHeat * 0.0025 * vec2(sin(uv.y * 90.0 + uTime * 7.0) + sin(uv.y * 37.0 - uTime * 5.0), cos(uv.x * 70.0 + uTime * 6.0));
      // speed: a radial blur out from the end of the tunnel
      vec3 col = vec3(0.0);
      vec2 d = uv - uZC;
      for (int i = 0; i < 8; i++) { float k = float(i) / 7.0; col += texture2D(tDiffuse, uZC + d * (1.0 - uZoom * k)).rgb; }
      col /= 8.0;
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.42 * exp(-pow((vUv.y - 0.36) / 0.08, 2.0));
      col *= 1.0 - uCounter * 0.3 * exp(-pow((vUv.y - 0.5) / 0.06, 2.0)) * smoothstep(0.85, 0.2, vUv.x);
      col *= 1.0 - uCap * 0.22 * exp(-pow((vUv.y - 0.36) / 0.05, 2.0));
      col = mix(col, vec3(1.0, 0.98, 0.94), uWhite);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);
// Only the scene needs 4 samples per pixel. When every scene render lands in renderTarget2 (checked below by walking
// the passes), renderTarget1 only ever receives full-screen passes, where all samples of a pixel are equal: a plain
// buffer gives the same image without filling and resolving a second multisampled target every frame.
{
  // the last pass draws to the screen; swapping the buffers after it only decides which one the next frame starts
  // in. Keep the number of swaps per frame even, so the scene always starts in the same (multisampled) buffer.
  if (composer.passes.filter((pass) => pass.needsSwap).length % 2 === 1) composer.passes[composer.passes.length - 1].needsSwap = false;
  let read = composer.renderTarget2, write = composer.renderTarget1, sceneInTwo = true;
  for (const pass of composer.passes) {
    if (pass instanceof RenderPass && read !== composer.renderTarget2) sceneInTwo = false;
    if (pass.needsSwap) [read, write] = [write, read];
  }
  if (sceneInTwo && read === composer.renderTarget2) {
    const old = composer.renderTarget1;
    composer.renderTarget1 = composer.writeBuffer = new THREE.WebGLRenderTarget(old.width, old.height, { type: old.texture.type, depthBuffer: false });
    old.dispose();
  }
}

// ---------- the shots ----------
// kinds: up (below you, looking up past you), down (above you, looking down the hole), side (beside you, across
// the hole), cut (the cutaway: views given as [v, center y below Madrid's surface (km), height (km), center x]),
// street (New Zealand, from the street).
// (a globe with your dot about every 8 s; zoom: it opens on the whole planet, then dives in to you)
const GLOBE = [6371, 15500, 0];
const SHOTS = [
  { v0: -3, v1: 6.4, kind: 'up', a: 0 },
  { v0: 6.4, v1: 9.0, kind: 'cut', follow: [1.5, 0.08, -0.15], zoom: 1, ghost: [1, 1, 0], trail: 1 },
  { v0: 9.0, v1: 11.6, kind: 'side', a: 0 },
  { v0: 11.6, v1: 14.2, kind: 'cut', follow: [10, 0.5, 0.2], zoom: 1, ghost: [1, 1, 1], trail: 1 },
  { v0: 14.2, v1: 16.8, kind: 'visor', a: 0 },
  { v0: 16.8, v1: 19.4, kind: 'down', a: 1 },
  { v0: 19.4, v1: 22.0, kind: 'side', a: 1 },
  { v0: 22.0, v1: 24.6, kind: 'cut', view: [[22.0, 6371, 15500, 0], [24.6, 6371, 14200, 0]], ghost: [0, 0, 0], trail: 1, places: 1 },
  { v0: 24.6, v1: 27.4, kind: 'side', a: 2 },
  { v0: 27.4, v1: 29.2, kind: 'down', a: 3 },
  { v0: 29.2, v1: V_CENTER, kind: 'visor', a: 1 },
  { v0: V_CENTER, v1: 33.9, kind: 'cut', view: [[V_CENTER, 6371, 5200, 0], [33.9, 6371, 7400, 0]], ghost: [0, 0, 0], trail: 1, places: 0 },
  { v0: 33.9, v1: 35.6, kind: 'up', a: 2 },
  { v0: 35.6, v1: 37.6, kind: 'visor', a: 2 },
  { v0: 37.6, v1: 39.6, kind: 'cut', view: [[37.6, 12300, 5600, -560], [39.6, 12500, 2600, -260]], ghost: [0, 0, 0], trail: 1, places: 2 },
  { v0: 39.6, v1: 41.4, kind: 'side', a: 3 },
  { v0: 41.4, v1: 42.9, kind: 'cut', view: [[41.4, 6371, 15500, 0], [41.85, 6371, 15000, 0], [42.9, 12600, 650, -30]], ghost: [0, 0, 0], trail: 1, places: 2 },
  { v0: 42.9, v1: V_STREET, kind: 'up', a: 3 },
  { v0: V_STREET, v1: 99, kind: 'street' },
];
const shotAt = (v) => SHOTS.find((s) => v >= s.v0 && v < s.v1) || SHOTS[SHOTS.length - 1];

const heatI = (T) => Math.pow(clamp((T - 480) / 1100, 0, 6), 1.45) * 1.1;
const heatC = (T, out) => {
  const st = (a, b, x) => smooth(a, b, x);
  const c = [0.6, 0.03, 0.0];
  const mixTo = (t, k) => { for (let i = 0; i < 3; i++) c[i] = lerp(c[i], t[i], k); };
  mixTo([1.0, 0.22, 0.02], st(550, 950, T)); mixTo([1.0, 0.48, 0.12], st(950, 1400, T));
  mixTo([1.0, 0.68, 0.32], st(1400, 2400, T)); mixTo([1.0, 0.86, 0.62], st(2400, 4200, T)); mixTo([1.0, 0.96, 0.9], st(4200, 5500, T));
  return out.setRGB(c[0], c[1], c[2]);
};
const tmpC = new THREE.Color(), tmpC2 = new THREE.Color();
// the walls' own glow by depth (km), roughly as in shaft.js: what lights you deep down
function glowAt(km, out) {
  out.setRGB(0, 0, 0);
  const add = (r, g, b, k) => out.setRGB(lerp(out.r, r, k), lerp(out.g, g, k), lerp(out.b, b, k));
  add(0.16 + 0.3, 0.04, 0.0, smooth(30, 45, km));
  add(0.7, 0.17, 0.02, smooth(90, 400, km));
  add(0.8, 0.34, 0.07, smooth(700, 2400, km));
  add(1.2, 0.7, 0.25, smooth(2885, 2900, km));
  add(1.1, 0.75, 0.35, smooth(5140, 5160, km));
  return out;
}
const tmpV = new THREE.Vector3(), mLook = new THREE.Matrix4();

function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) s.flash = Math.max(s.flash, cover);   // loop tail: the white clears into the first frame
  const shot = shotAt(v);
  const j = joltAt(v);
  const marks = {};
  const I = heatI(s.temp);

  if (shot.kind === 'cut') {
    // ---------- the cutaway ----------
    renderPass.scene = cut.scene; renderPass.camera = cut.camera;
    const sKm = sAt(s.T) / 1000;
    let yb, hh, xc;
    if (shot.follow) {
      // keep you a little below the middle and the surface just inside the top: the view grows as you fall
      const [hMin, x0, x1] = shot.follow;
      hh = Math.max(hMin, 1.9 * s.km); yb = s.km - 0.04 * hh; xc = -0.1 * hh + lerp(x0, x1, clamp((v - shot.v0) / (shot.v1 - shot.v0))) * 0.0;
      if (shot.zoom) {
        // open on the whole planet (your dot right at the top), then dive in: the zoom is even in log scale and
        // your dot glides from where it is on the globe to where it sits in the close view
        const k = smooth(shot.v0 + 0.55, shot.v1 - 0.55, v);
        const hF = hh, spF = (yb - s.km) / hF;
        const sp0 = (R_KM - s.km - (R_KM - GLOBE[0])) / GLOBE[1];
        hh = Math.exp(lerp(Math.log(GLOBE[1]), Math.log(hF), k));
        const sp = lerp(sp0, spF, k);
        const cy = (R_KM - s.km) - sp * hh;
        yb = R_KM - cy;
        xc = -0.1 * hh * k;
      }
    } else {
      const kv = shot.view;
      yb = keys(kv.map((k) => [k[0], k[1]]), v, true); hh = keys(kv.map((k) => [k[0], k[2]]), v, true); xc = keys(kv.map((k) => [k[0], k[3]]), v);
    }
    cut.U.uC.value.set(xc, R_KM - yb);
    cut.U.uH.value = hh;
    cut.U.uYou.value = sKm;
    cut.U.uYouA.value = 1;
    cut.U.uGhost.value.set(...shot.ghost);
    cut.U.uTime.value = v;
    cut.U.uTrail.value = shot.trail;
    const p = cut.toScreen(0, R_KM - sKm);
    marks.you = { x: p.x, y: p.y, a: smooth(shot.v0, shot.v0 + 0.3, v) * (1 - smooth(shot.v1 - 0.2, shot.v1, v)) };
    if (shot.places || shot.zoom) {
      const pa = cut.toScreen(0, R_KM), pb = cut.toScreen(0, -R_KM);
      const fa = smooth(shot.v0 + 0.2, shot.v0 + 0.6, v) * (1 - smooth(shot.v1 - 0.2, shot.v1, v)) * (shot.zoom ? 1 - smooth(shot.v0 + 0.5, shot.v0 + 0.9, v) : 1);
      if (shot.places === 1 || shot.zoom) marks.a = { x: pa.x, y: pa.y, a: fa };
      marks.b = { x: pb.x, y: pb.y, a: fa };
    }
    renderer.toneMappingExposure = 1.0;
    bloom.strength = 0.12;
    finish.uniforms.uZoom.value = 0;
    finish.uniforms.uHeat.value = 0;
    finish.uniforms.uWhite.value = 0.4 * s.glow;
  } else {
    renderPass.scene = scene; renderPass.camera = camera;
    const side = s.side, depth = s.depth;
    const street = shot.kind === 'street';

    // ---------- you ----------
    // Madrid half: upright, falling feet first. The New Zealand half starts head-down (you keep the same
    // orientation in space, and "down" now points the other way) and you turn over on the way up.
    const flip = side < 0 ? Math.PI * (1 - smooth(37.75, 39.45, v)) : 0;   // you turn over during the cutaway (37.6-39.6 s)
    const spin = street ? Math.PI + 0.35 + 0.25 * Math.sin(v * 0.8) : v * 0.12 + wobble(v * 0.15, 2) * 0.25;   // facing the street's camera at the end
    body.rotation.set(flip + wobble(v * 0.2, 4) * 0.06, spin, wobble(v * 0.17, 6) * 0.06);
    const flail = (1 - smooth(1.5, 4.5, v)) + 0.35 * smooth(V_STREET + 1.6, V_APEX + 1.0, v);
    const look = shot.kind === 'up' ? 0.6 : shot.kind === 'down' ? -0.8 : street ? 0.0 : shot.kind === 'visor' ? 0.15 : 0.1;
    suit.pose(v, { arms: street ? 0.9 : 0.6, look, flail, reach: shot.kind === 'up' && v < 6 ? 0.6 * (1 - smooth(3, 6, v)) : 0 });
    body.visible = true;

    // ---------- the ends of the hole, the metro ----------
    madrid.group.visible = side > 0 && depth < 2500;
    madrid.group.position.set(0, depth, 0);
    nz.group.visible = side < 0 && depth < 2500;
    nz.group.position.set(0, depth, 0);
    metro.group.visible = side > 0 && depth < 600;
    metro.group.position.set(0, depth, 0);
    if (madrid.group.visible) madrid.update(v, s);
    if (nz.group.visible) nz.update(v, s, -depth);
    sky.U.uNight.value = side > 0 ? 0 : 1;
    sky.mesh.visible = depth < 4000;

    // ---------- the wall ----------
    const near = 1 - smooth(150, 3000, depth);
    shaft.update(s, {
      blur: seenFlowAt(v) / 60, seen: seenAt(v), lightPeriod: 5, k: 300 * (1 - near), time: v, glow: s.glow,
      lit: 1, surf: side > 0 ? 1 : 0.06, tunnel: side > 0, tunnelTop: depth + METRO_TOP, tunnelBottom: depth + METRO_BOT,
    });

    // ---------- light on you ----------
    const lights = 1 - smooth(25000, 40000, depth);
    const wallE = glowAt(s.km, tmpC).clone().multiplyScalar(0.8);
    const lampE = new THREE.Color(1.0, 0.93, 0.82).multiplyScalar(0.9 * lights);
    const amb = wallE.clone().add(lampE);
    hemi.color.copy(amb).multiplyScalar(0.8);
    hemi.groundColor.copy(amb).multiplyScalar(0.55);
    hemi.intensity = 1.0;
    const dayK = side > 0 ? Math.exp(-depth / 25) : 0;
    sun.intensity = 2.6 * dayK;
    hemi.color.lerp(new THREE.Color(0x9fb6d8), dayK * 0.6);
    above.position.set(0.6, 4, 0.4); below.position.set(-0.4, -3, -0.3);
    above.color.copy(amb); below.color.copy(amb);
    above.intensity = 3 + 30 * s.glow; below.intensity = 3 + 30 * s.glow;
    fill.intensity = street ? 0 : 3;
    if (street) {
      hemi.color.setRGB(0.08, 0.08, 0.12); hemi.groundColor.setRGB(0.25, 0.2, 0.15); hemi.intensity = 1;
      above.intensity = 0; below.color.setRGB(1, 0.9, 0.75); below.intensity = 10 * smooth(0, 6, depth + 2);
    }

    // ---------- the camera ----------
    let pos, tgt, fov, up = new THREE.Vector3(0, 1, 0);
    const k0 = clamp((v - shot.v0) / Math.max(0.5, shot.v1 - shot.v0));
    const dr = wobble(v * 0.25, 3);
    if (shot.kind === 'up') {
      const a = shot.a;
      pos = new THREE.Vector3(2.15 - 0.15 * a, lerp(0.1, -0.5, k0) + 0.15 * dr, 0.95 + 0.2 * a);
      tgt = new THREE.Vector3(-0.9, 9.5, -0.6 + 0.3 * dr);
      fov = 74;
      if (a === 0) { pos.y += -0.4 * smooth(0, 6, v); }
      if (a === 3) { fov = lerp(70, 64, k0); }
    } else if (shot.kind === 'down') {
      pos = new THREE.Vector3(1.35, 3.3 + 0.2 * dr, 1.0 - 0.2 * shot.a * 0.3);
      tgt = new THREE.Vector3(-0.35, -9, -0.25 + 0.2 * dr);
      fov = 72 + 4 * k0;
    } else if (shot.kind === 'side') {
      const a = shot.a;
      const ang = 0.4 + a * 1.3 + 0.25 * k0;
      pos = new THREE.Vector3(Math.sin(ang) * 2.45, 1.2 + 0.25 * dr, Math.cos(ang) * 2.45);
      tgt = new THREE.Vector3(-Math.sin(ang) * 1.5, 0.9, -Math.cos(ang) * 1.5);
      fov = 66;
    } else if (shot.kind === 'visor') {
      // close on your visor: the glow of the layer you're in, reflected in the gold glass
      const hp = suit.helmetPos(new THREE.Vector3());
      const hq = suit.head.getWorldQuaternion(new THREE.Quaternion());
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(hq);
      const rt = new THREE.Vector3(1, 0, 0).applyQuaternion(hq);
      const a = shot.a;
      pos = hp.clone().addScaledVector(fwd, lerp(0.78, 0.6, k0)).addScaledVector(rt, 0.2 - 0.18 * a).add(new THREE.Vector3(0, 0.1 - 0.06 * a, 0));
      tgt = hp.clone().addScaledVector(fwd, 0.05).add(new THREE.Vector3(0, -0.04, 0));
      fov = 46;
    } else {
      // the street in New Zealand: fixed to the ground (which is depth m above your feet)
      const g = depth;
      const push = smooth(V_STREET, V_APEX + 0.6, v);
      pos = new THREE.Vector3(1.5 - 0.3 * push, g + 1.45 - 0.15 * push, 6.2 - 1.0 * push);
      tgt = new THREE.Vector3(0, g + 0.9 + 0.8 * push, 0);
      fov = 54;
    }
    // shake: a buzz that grows with speed, a kick at every beat
    const buzz = 0.002 * Math.log10(1 + s.flow / 5) * (street ? 0 : 1);
    const shake = j * 0.02 + buzz;
    tgt.x += wobble(v * 23, 7) * shake * 10; tgt.z += wobble(v * 19, 9) * shake * 10;
    fill.position.copy(pos);
    camera.position.copy(pos);
    mLook.lookAt(pos, tgt, up);
    camera.quaternion.setFromRotationMatrix(mLook);
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    sky.mesh.position.copy(camera.position);
    suit.helmetPos(cubeCam.position);
    body.visible = false;
    cubeCam.update(renderer, scene);
    body.visible = true;

    // the end of the tunnel on screen (where the speed blur streams out from)
    const dir = shot.kind === 'down' ? -1 : 1;
    const vp = tmpV.set(0, dir * 1e4, 0).project(camera);
    const inFront = tmpV.z < 1;
    finish.uniforms.uZC.value.set(clamp(vp.x * 0.5 + 0.5, -0.5, 1.5), clamp(vp.y * 0.5 + 0.5, -0.5, 1.5));
    finish.uniforms.uZoom.value = (shot.kind === 'side' || shot.kind === 'visor' || street) ? 0 : clamp(0.006 * Math.log10(1 + s.flow / 40), 0, 0.025) * (inFront ? 1 : 0.5);
    finish.uniforms.uHeat.value = smooth(500, 1500, s.temp) * (street ? 0 : 1);
    finish.uniforms.uWhite.value = 0.45 * s.glow;
    renderer.toneMappingExposure = shot.kind === 'visor' ? 1.0 - 0.3 * smooth(4000, 5400, s.temp) : 1.0;   // (the white-hot core: the gold visor still reads)
    bloom.strength = (0.16 + 0.18 * smooth(40, 3000, s.km)) * (shot.kind === 'visor' ? 0.6 : 1) + (street ? 0.1 : 0);
  }
  finish.uniforms.uTime.value = v;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : (1 - s.flash) * 0.9;
  finish.uniforms.uCap.value = window.__cover ? 0 : 1;
  overlay(v, s, marks);
  return s;
}

let comp = null;
// t is video time. The last LOOP seconds replay the moments just before the first frame while the
// white clears, so the video loops seamlessly.
function renderFrame(t) {
  const tail = t - (VIDEO_DURATION - LOOP);
  if (tail >= 0) update(t - VIDEO_DURATION, 1 - smooth(0, LOOP * 0.92, tail));
  else update(t);
  composer.render();
  if (comp) comp.paint();
}

// ---------- boot ----------
async function boot() {
  await document.fonts.load('500 40px Cormorant');
  await document.fonts.load('italic 500 40px Cormorant');
  await document.fonts.load('600 40px Cormorant');
  await document.fonts.ready;
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  for (const t of [57, 50, 44, 36, 30, 25, 20, 13, 7, 1, 0]) renderFrame(t);   // compile everything once
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, suit, shaft, cut };
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

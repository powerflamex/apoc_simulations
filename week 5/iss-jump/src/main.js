import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeEarth } from './earth.js';
import { makeStation } from './station.js';
import { makeSuit, S as SUIT } from './suit.js';
import { makePlasma } from './plasma.js';
import { makeGround } from './ground.js';
import { makeOverlay } from './overlay.js';
import {
  state, joltAt, stationAt, stationAhead, pchip, VIDEO_DURATION, LOOP, T_SWITCH, V_JUMP, V_LAPSE, V_FRONT, V_O2, V_DROP, V_GLOW, V_FIRE, V_GROUND, V_BACK, V_BURST,
} from './timeline.js';
import { DEG, lerp, smooth, wobble, clamp } from './util.js';
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

// ---------- the world round you (you stay at the origin; the station and the Earth move) ----------
// local frame: x right, y up (away from the Earth), z backward; metres
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, W / H, 0.05, 2500);
scene.add(camera);
const earth = makeEarth();
scene.add(earth.mesh);
const station = makeStation();
scene.add(station.group);
const suit = makeSuit();
const body = new THREE.Group();     // pivot at your middle, so tumbling doesn't swing you round
body.position.set(0, 0.4, 0);
suit.root.position.set(0, -0.4, 0);
body.add(suit.root);
scene.add(body);
const plasmaG = new THREE.Group();  // the fire: never turns with you (the trail streams straight back)
scene.add(plasmaG);
const plasma = makePlasma(plasmaG);
const ground = makeGround();

const sun = new THREE.DirectionalLight(0xfff4e6, 3.0);
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0x0a0c12, 0x6f8fc0, 1.0);
scene.add(hemi);
const fill = new THREE.PointLight(0xfff4e8, 0, 10, 1.5);
scene.add(fill);
// the visor reflects the Earth and the station (a small cube camera at your helmet, drawn every frame)
const cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
const cubeCam = new THREE.CubeCamera(0.05, 2400, cubeRT);
scene.add(cubeCam);
suit.visorMat.envMap = cubeRT.texture;
suit.visorMat.envMapIntensity = 1.5;
// the station as a bright dot once it is far off (beyond the camera's reach)
const dotTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,250,240,1)'); gr.addColorStop(0.2, 'rgba(255,245,225,0.9)'); gr.addColorStop(0.5, 'rgba(255,240,210,0.25)'); gr.addColorStop(1, 'rgba(255,240,210,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
dot.visible = false;
scene.add(dot);
const overlay = makeOverlay();

const rt = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(RW, RH);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.25, 0.4, 1.4);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uVig: { value: 0.3 }, uTitle: { value: 0 }, uCounter: { value: 0 }, uCap: { value: 0 },
    uHeat: { value: 0 }, uTime: { value: 0 }, uWhite: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVig, uTitle, uCounter, uCap, uHeat, uTime, uWhite;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      // heat haze in the fire
      uv += uHeat * 0.0028 * vec2(sin(uv.y * 90.0 + uTime * 9.0) + sin(uv.y * 37.0 - uTime * 6.0), cos(uv.x * 70.0 + uTime * 7.0));
      vec3 col = texture2D(tDiffuse, uv).rgb;
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.42 * exp(-pow((vUv.y - 0.31) / 0.08, 2.0));
      col *= 1.0 - uCounter * 0.3 * exp(-pow((vUv.y - 0.44) / 0.1, 2.0)) * smoothstep(0.85, 0.2, vUv.x);
      col *= 1.0 - uCap * 0.22 * exp(-pow((vUv.y - 0.3) / 0.05, 2.0));
      col = mix(col, vec3(1.0, 0.97, 0.92), uWhite);
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
const SHOTS = [
  { v0: -3, v1: V_LAPSE, kind: 'open' },
  { v0: V_LAPSE, v1: V_FRONT, kind: 'shoulder' },
  { v0: V_FRONT, v1: V_O2, kind: 'front' },
  { v0: V_O2, v1: 17.0, kind: 'visor' },
  { v0: 17.0, v1: V_DROP, kind: 'wide' },
  { v0: V_DROP, v1: V_GLOW, kind: 'down' },
  { v0: V_GLOW, v1: V_FIRE, kind: 'glow' },
  { v0: V_FIRE, v1: V_GROUND, kind: 'fire' },
  { v0: V_GROUND, v1: V_BACK, kind: 'ground' },
  { v0: V_BACK, v1: 99, kind: 'fireball' },
];
const shotAt = (v) => SHOTS.find((s) => v >= s.v0 && v < s.v1) || SHOTS[SHOTS.length - 1];
// how far you have tumbled (rad): slow after the push, kept readable through the time-lapses
const TUMBLE = pchip([[V_LAPSE, 0], [V_FRONT, 0.02], [V_O2, 0.4], [17, 0.8], [V_DROP, 2.4], [V_GLOW, 6.3], [V_FIRE, 8.0], [V_GROUND, 9.6], [T_SWITCH + LOOP + 1, 11.2]]);
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), mLook = new THREE.Matrix4(), tmpC = new THREE.Color();
const OFF = { L: { pos: new THREE.Vector3(), rot: 0 }, R: { pos: new THREE.Vector3(), rot: 0 }, LL: { pos: new THREE.Vector3(), rot: 0 }, RL: { pos: new THREE.Vector3(), rot: 0 }, pack: { pos: new THREE.Vector3(), rot: 0 } };
// a part tears off at k0 and flies back, spinning
function tear(part, k, k0, side) {
  const f = smooth(k0, k0 + 0.16, k);
  part.pos.set(side * 1.4 * f, 0.6 * f + 0.5 * f * f, 10 * f * f + 2.5 * f);
  part.rot = 11 * f;
}

function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) s.flash = Math.max(s.flash, cover);   // loop tail: the white clears into the first frame
  const shot = shotAt(v);
  const j = joltAt(v);
  const k0 = clamp((v - shot.v0) / Math.max(0.5, shot.v1 - shot.v0));
  const dr = wobble(v * 0.25, 3);

  if (shot.kind === 'ground') {
    renderPass.scene = ground.scene; renderPass.camera = ground.camera;
    ground.frame(v, (v - V_GROUND) / (V_BACK - V_GROUND));
    bloom.strength = 0.35;
    finish.uniforms.uHeat.value = 0;
    finish.uniforms.uWhite.value = 0;
    renderer.toneMappingExposure = 1.0;
  } else {
    renderPass.scene = scene; renderPass.camera = camera;

    // ---------- the station: still, until you push off; then drifting away; then a dot ----------
    const st = v < V_LAPSE ? stationAt(s.T) : stationAhead(s.T);
    const dotLit = earth.U.uSunAlt.value > 5 ? 1 : 0.08;   // (last frame's Sun: a dot only shines in sunlight)
    const near = st.d < 1600;
    station.group.visible = near;
    station.group.position.set(st.x - station.YOU.x, st.y - station.YOU.y, st.z - station.YOU.z);   // you start on the end of its arm
    station.update(v, 1 - smooth(V_JUMP + 1.5, V_JUMP + 4, v));
    if (!near) {
      tmpV.copy(station.group.position).normalize().multiplyScalar(1500);
      dot.position.copy(tmpV);
      const size = clamp(100 * 1500 / st.d, 5, 100);
      dot.scale.set(size, size, 1);
      dot.material.opacity = clamp(1.2 - st.d / 150000, 0.15, 1) * dotLit;
      dot.visible = true;
    } else dot.visible = false;

    // ---------- you ----------
    // the leap: a crouch, then the legs drive you up and out (feet on the plate until V_JUMP); after that you sail on
    // in a straight line, arms and legs going, turned side-on to the camera; for the time-lapse you face forward
    const tb = TUMBLE(v);
    const jit = s.glow * 0.08;
    const crouch = 0.8 * smooth(1.7, 2.5, v) * (1 - smooth(2.55, V_JUMP - 0.03, v));
    const drive = smooth(2.55, V_JUMP - 0.03, v);
    const yaw = v < V_LAPSE ? 2.45 + 0.05 * Math.max(0, v - V_JUMP) : -0.55 * smooth(V_O2, 17, v);
    body.position.set(v < V_LAPSE ? -0.35 * drive : 0, 0.4 - 0.46 * crouch, 0);
    suit.root.rotation.x = v < V_LAPSE ? -(0.45 * crouch + 0.4 * drive * (1 - smooth(V_JUMP, 4.4, v))) : 0;
    body.rotation.set(tb * 0.9 + wobble(v * 0.12, 4) * 0.05 + wobble(v * 5.5, 8) * jit, yaw + tb * 0.45 + wobble(v * 0.1, 6) * 0.05 + wobble(v * 4.7, 9) * jit, tb * 0.3 + wobble(v * 6.1, 10) * jit);
    const swing = v < 2.5 ? -0.9 * smooth(1.7, 2.45, v) : (-0.9 + 2.0 * smooth(2.5, V_JUMP - 0.05, v)) * (1 - smooth(V_JUMP + 0.1, 4.2, v));
    const flail = smooth(3.3, 4.0, v) * (1 - smooth(6.6, V_LAPSE, v)) * 0.75 * (1 - s.dead);
    const look = shot.kind === 'visor' ? 0.1 : v < V_JUMP - 0.3 ? -0.75 : shot.kind === 'open' ? -0.2 : 0.1;
    const kb = s.breakup;
    tear(OFF.L, kb, 0.12, -1); tear(OFF.RL, kb, 0.36, 1); tear(OFF.pack, kb, 0.52, 0); tear(OFF.R, kb, 0.66, 1); tear(OFF.LL, kb, 0.82, -1);
    suit.pose(v, { arms: 0.25 + 0.4 * smooth(V_JUMP, V_JUMP + 1, v), look, flail, crouch, swing, dead: s.dead, off: OFF });
    body.visible = true;
    SUIT.uHot.value = clamp(s.glow * 0.6, 0, 0.8);
    SUIT.uHotCol.value.setRGB(1.0, 0.22 + 0.35 * clamp(s.glow - 0.5, 0, 1), 0.03 + 0.2 * clamp(s.glow - 0.8, 0, 1));
    SUIT.uCrack.value = smooth(0.18, 0.7, kb);
    SUIT.uTime.value = v;
    SUIT.uFrost.value = 0; SUIT.uWet.value = 0;
    // ---------- the camera ----------
    let pos, tgt, fov;
    const up = new THREE.Vector3(0, 1, 0);
    if (shot.kind === 'open') {
      // held still on the station while you crouch and leap, so you can see yourself leave it; then it lets go of the
      // station and stays with you, and the station slides away
      const stn = station.group.position;
      const posA = tmpV.set(0.95, 0.95, 5.3).add(stn).clone(), tgtA = tmpV.set(-0.45, 0.1, -0.5).add(stn).clone();
      const k = smooth(3.4, 6.4, v);
      pos = posA.lerp(new THREE.Vector3(-0.7, 0.3, 4.6), k);
      tgt = tgtA.lerp(new THREE.Vector3(-0.95, -0.1, 0), smooth(2.85, 3.6, v));
      fov = 78;
    } else if (shot.kind === 'shoulder') {
      // locked, over your shoulder: you, the station shrinking straight ahead, each sunrise coming up in front of you
      pos = new THREE.Vector3(-0.75, 2.5, 2.9);
      tgt = new THREE.Vector3(-0.75, 2.5 - 1.2, -7.1);
      fov = 70;
    } else if (shot.kind === 'front') {
      // locked, from the front, with a very slow push in, as the alarm starts
      pos = new THREE.Vector3(1.0, 0.3, -5.2 + 0.4 * k0);
      tgt = new THREE.Vector3(0.75, -0.75, 0);
      fov = 62;
    } else if (shot.kind === 'visor') {
      const hp = suit.helmetPos(new THREE.Vector3());
      const hq = suit.head.getWorldQuaternion(new THREE.Quaternion());
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(hq);
      const rt = new THREE.Vector3(1, 0, 0).applyQuaternion(hq);
      pos = hp.clone().addScaledVector(fwd, lerp(0.8, 0.62, k0)).addScaledVector(rt, 0.18).add(new THREE.Vector3(0, 0.08, 0));
      tgt = hp.clone().addScaledVector(fwd, 0.05).add(new THREE.Vector3(0, -0.03, 0));
      fov = 46;
    } else if (shot.kind === 'wide') {
      pos = new THREE.Vector3(0.9, 3.0 + 0.1 * dr, 2.4);
      tgt = new THREE.Vector3(0, 0.1, -0.2);
      fov = 72;
    } else if (shot.kind === 'down') {
      pos = new THREE.Vector3(lerp(0.9, 0.3, k0), lerp(3.0, 3.8, k0) + 0.1 * dr, lerp(2.4, 1.0, k0));
      tgt = new THREE.Vector3(0, 0.2, -0.1);
      fov = lerp(72, 58, k0);
    } else if (shot.kind === 'glow') {
      const a = -0.75 + 0.5 * k0;
      pos = new THREE.Vector3(Math.sin(a) * 3.0, 0.5 + 0.15 * dr, Math.cos(a) * -3.0);
      tgt = new THREE.Vector3(0, 0.7, 1.2);
      fov = 70;
    } else if (shot.kind === 'fire') {
      pos = new THREE.Vector3(2.4 - 0.4 * k0, 0.3 + 0.1 * dr, -1.9);
      tgt = new THREE.Vector3(0, 0.7, 0.4);
      fov = 60;
    } else {
      // from the side and above, so the trail streams off to the left and the ground shows under you
      pos = new THREE.Vector3(lerp(3.0, 2.4, k0), lerp(2.2, 1.7, k0), lerp(-0.9, -0.4, k0));
      tgt = new THREE.Vector3(0, 0.2, 0.6);
      fov = 74;
    }
    // shake: a kick at every beat, and the air's buffeting in the fire
    const shake = j * 0.025 + 0.006 * smooth(0.2, 0.9, s.glow);
    tgt.x += wobble(v * 23, 7) * shake * 10; tgt.y += wobble(v * 17, 12) * shake * 6; tgt.z += wobble(v * 19, 9) * shake * 10;
    fill.position.copy(pos);
    camera.position.copy(pos);
    mLook.lookAt(pos, tgt, up);
    camera.quaternion.setFromRotationMatrix(mLook);
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    earth.mesh.position.copy(camera.position);

    // ---------- the Earth, the Sun, the lights ----------
    const L = earth.update(v, s.h, camera.position);
    earth.U.uPx.value = (fov * DEG) / RH;
    sun.position.copy(L.sun).multiplyScalar(300);
    sun.target.position.set(0, 0, 0);
    sun.intensity = (v < V_O2 ? 2.2 : 2.7) * L.sunK * (1 - 0.65 * smooth(0.2, 0.8, s.glow));
    sun.color.setRGB(1.0, 0.96 - 0.4 * L.warm, 0.9 - 0.65 * L.warm);
    hemi.groundColor.setRGB(0.55, 0.68, 0.95).multiplyScalar(0.25 + 1.0 * L.lit);
    hemi.color.setRGB(0.04, 0.045, 0.06);
    hemi.intensity = 1.0;
    fill.intensity = (0.6 + 2.2 * (1 - L.sunK)) * (1 - 0.8 * smooth(0.2, 0.8, s.glow));
    earth.U.uFire.value = s.glow * 0.1 + s.fireball * 1.2;
    earth.U.uHazeK.value = 1;
    plasma.update(v, s.glow, s.fireball);

    // the visor's reflection
    suit.helmetPos(cubeCam.position);
    body.visible = false;
    cubeCam.update(renderer, scene);
    body.visible = true;

    finish.uniforms.uHeat.value = smooth(0.3, 1.0, s.glow) * 0.6;
    finish.uniforms.uWhite.value = 0.3 * s.fireball * s.fireball * s.fireball;
    renderer.toneMappingExposure = shot.kind === 'visor' ? 1.05 : 1.0;
    bloom.strength = 0.22 + 0.12 * smooth(0.2, 1.0, s.glow) + 0.15 * s.fireball;
  }
  finish.uniforms.uTime.value = v;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : (1 - s.flash) * 0.9;
  finish.uniforms.uCap.value = window.__cover ? 0 : 1;
  overlay(v, s);
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
  await earth.ready;
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  for (const t of [48, 45, 42.5, 40, 33, 30, 25, 18, 15, 10, 5, 1, 0]) renderFrame(t);   // compile everything once
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, suit, station, earth, plasma };
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

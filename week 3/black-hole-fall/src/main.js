import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeSuit, S } from './suit.js';
import { makeStreaks } from './streaks.js';
import { makeOverlay } from './overlay.js';
import { state, joltAt, VIDEO_DURATION, LOOP, T_SWITCH, V_EDGE, V_WIDE0, V_WIDE1, V_SLOW, V_END, V_BURN0, V_BURN1 } from './timeline.js';
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

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, W / H, 0.05, 3000);
scene.add(camera);
const sky = makeSky();
sky.mesh.layers.enable(1);
scene.add(sky.mesh);
const suit = makeSuit();
scene.add(suit.root);
const streaks = makeStreaks(2600, 30);
scene.add(streaks.mesh);
const overlay = makeOverlay();

// the hole is far ahead along F; the basis around it (Rw right, Uw up)
const F = sky.uniforms.uF.value.clone();
const Rw = new THREE.Vector3().crossVectors(F, new THREE.Vector3(0, 1, 0)).normalize();
const Uw = new THREE.Vector3().crossVectors(Rw, F).normalize();

// lights: the disk's glow from ahead and below, the starlight, the circle of sky above you inside the edge
const diskLight = new THREE.DirectionalLight(0xffb070, 2);
scene.add(diskLight, diskLight.target);
const skyLight = new THREE.DirectionalLight(0xcfe0ff, 0);
scene.add(skyLight, skyLight.target);
const hemi = new THREE.HemisphereLight(0x5a6a90, 0xa06030, 0.5);
scene.add(hemi);
// reflections in the visor: the sky alone, rendered around your helmet
const cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
const cubeCam = new THREE.CubeCamera(0.1, 3000, cubeRT);
cubeCam.children.forEach((c) => c.layers.set(1));
scene.add(cubeCam);
scene.environment = cubeRT.texture;
scene.environmentIntensity = 0.6;

const rt = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(RW, RH);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.35, 0.4, 2.2);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.35 }, uTitle: { value: 0 }, uCounter: { value: 0 }, uCap: { value: 0 }, uWarp: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVig; uniform float uTitle; uniform float uCounter; uniform float uCap; uniform float uWarp;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      // the end: the picture is pulled toward the middle (stretched along the fall)
      vec2 c0 = uv - 0.5;
      uv = 0.5 + c0 * vec2(1.0 - 0.35 * uWarp * (1.0 - abs(c0.y)), 1.0 + 0.0);
      vec3 col = texture2D(tDiffuse, uv).rgb;
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.45 * exp(-pow((vUv.y - 0.735) / 0.09, 2.0));
      col *= 1.0 - uCounter * 0.3 * exp(-pow((vUv.y - 0.535) / 0.06, 2.0)) * smoothstep(0.8, 0.2, vUv.x);
      col *= 1.0 - uCap * 0.25 * exp(-pow((vUv.y - 0.355) / 0.05, 2.0));
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

const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion();
const mLook = new THREE.Matrix4(), mBody = new THREE.Matrix4();
const helmet = new THREE.Vector3();
const youDir = new THREE.Vector3();

// your body: outside, belly toward the hole like a skydiver; inside, you turn feet-first and look up
const ABER = 0.6;   // how much of your speed goes into the aberration (the full amount blows up at the edge)
function shadowDeg(r, b) {
  let ps = Math.asin(Math.min(1, (2.598 / r) * Math.sqrt(1 - 1 / r)));
  if (r < 1.5) ps = Math.PI - ps;
  const cf = (Math.cos(ps) + b) / (1 + b * Math.cos(ps));
  return Math.acos(clamp(cf, -1, 1)) / DEG;
}

function bodyQuat(v, out) {
  const spin = v * 0.06 + wobble(v * 0.15, 2) * 0.12;
  const headOut = Uw.clone().applyAxisAngle(F, 0.5 + spin);           // head direction while belly-down
  const front = F.clone();
  const x1 = new THREE.Vector3().crossVectors(headOut, front.clone().negate()).normalize();
  mBody.makeBasis(x1, headOut, front.clone().negate());
  const qa = new THREE.Quaternion().setFromRotationMatrix(mBody);
  // feet-first: head away from the centre, facing the camera's side
  const tilt = 0.95 * (1 - smooth(V_SLOW - 0.2, V_SLOW + 0.7, v));
  const headIn = F.clone().negate().applyAxisAngle(Rw, tilt);
  const faceIn = Rw.clone().applyAxisAngle(headIn, 0.9 + spin * 0.5).negate();
  const x2 = new THREE.Vector3().crossVectors(headIn, faceIn.clone().negate()).normalize();
  mBody.makeBasis(x2, headIn, faceIn.clone().negate());
  const qb = new THREE.Quaternion().setFromRotationMatrix(mBody);
  return out.copy(qa).slerp(qb, smooth(V_EDGE + 0.6, V_EDGE + 5.5, v));
}

function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) s.flash = Math.max(s.flash, cover);   // loop tail: the white clears into the first frame
  const u = sky.uniforms;
  const j = joltAt(v);

  // ---------- you ----------
  bodyQuat(v, suit.root.quaternion);
  // spaghetti: stretched along the fall, thinned across
  const st = s.stretch;
  const sy = 1 + 14 * st, sxz = 1 / Math.sqrt(1 + 30 * st);
  suit.root.scale.set(sxz, sy, sxz);
  suit.root.position.set(0, 0, 0);
  suit.pose(v, s);
  // stretched thin, you glow
  S.uHot.value = Math.min(1.4, st * 2.2);
  S.uHotCol.value.setRGB(0.75, 0.85, 1.0);
  suit.helmetPos(helmet);
  suit.root.visible = !s.wide;

  // ---------- the camera ----------
  // It looks at the rim of the growing shadow (where the disk and the bent light are), turning further from the
  // hole as the shadow spreads over the sky; inside the edge it ends up below you looking up at the circle of sky.
  // the shadow's radius as you see it (degrees from straight ahead), from the static view + your aberration
  const psi = shadowDeg(Math.max(1.03, s.r), s.beta * ABER);
  const thOut = lerp(3, psi + 10, smooth(1, 12, v));
  const thL = (v < V_EDGE ? thOut : lerp(psi + 10, 176, smooth(V_EDGE, V_EDGE + 5.5, v)) - 84 * smooth(V_SLOW - 0.2, V_SLOW + 0.7, v)) * DEG;
  const yaw = keys([[-2, -8], [8, 4], [16, -6], [24, 10], [30.8, 0], [36, -14], [V_EDGE + 6, 10], [V_BURN0, 30], [V_SLOW, 60], [V_END, 75]], v) * DEG;
  let fov = keys([[-2, 44], [0, 46], [6, 56], [12, 66], [18, 72], [26, 76], [30.8, 78], [36, 82], [V_EDGE + 6, 72], [V_SLOW, 64], [V_SLOW + 0.7, 74], [V_END, 90]], v);
  // you: about a fifth of the frame tall, low on the right
  const tv = Math.tan((fov * DEG) / 2), th = tv * (W / H);
  const dist = (1.9 / (0.21 * 2 * tv)) * keys([[-2, 1], [V_EDGE, 1], [V_EDGE + 5.5, 0.85], [V_SLOW, 0.8], [V_SLOW + 0.7, 1.6], [V_END, 2.6]], v);
  const nx = keys([[-2, 0.42], [30, 0.4], [V_EDGE + 5.5, -0.35], [V_SLOW, -0.3], [V_SLOW + 0.7, 0], [V_END, 0]], v);
  const ny = keys([[-2, -0.5], [30, -0.45], [V_EDGE + 5.5, -0.42], [V_SLOW, -0.4], [V_SLOW + 0.7, 0.05], [V_END, 0.1]], v);
  const camH = -ny * tv * dist, camS = nx * th * dist;
  const look = F.clone().applyAxisAngle(Rw, -thL).applyAxisAngle(F, yaw);
  const up = Uw.clone().applyAxisAngle(Rw, -thL).applyAxisAngle(F, yaw);
  const rightC = new THREE.Vector3().crossVectors(look, up).normalize();
  const camPos = look.clone().multiplyScalar(-dist).addScaledVector(up, camH).addScaledVector(rightC, -camS);
  const shake = j * 0.012 + (s.burn * 0.004) + 0.003 * smooth(V_SLOW, V_END, v);
  look.addScaledVector(up, wobble(v * 21, 7) * shake).addScaledVector(rightC, wobble(v * 17, 9) * shake).normalize();
  // the shot from far away: a static camera, you a dot at the edge of the shadow
  if (s.wide) {
    const w = (v - V_WIDE0) / (V_WIDE1 - V_WIDE0);
    camPos.set(0, 0, 0);
    look.copy(F).applyAxisAngle(Rw, (-3 + 1.5 * w) * DEG).normalize();
    up.copy(Uw);
    fov = lerp(64, 58, w);
  }
  camera.position.copy(camPos);
  mLook.lookAt(camPos, tmpV.copy(camPos).add(look), up);
  camera.quaternion.setFromRotationMatrix(mLook);
  camera.fov = fov;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // ---------- the hole and its disk ----------
  u.uD.value = s.wide ? lerp(9.5, 9.0, (v - V_WIDE0) / (V_WIDE1 - V_WIDE0)) : Math.max(1.03, s.r);
  u.uBeta.value = s.wide ? 0 : s.beta * ABER;
  u.uShrink.value = s.shrink;
  u.uRing.value = s.ring;
  u.uTime.value = v * 0.9;
  u.uPx.value = (2 * Math.tan((fov * DEG) / 2)) / RH;
  u.uStar.value = 1;
  u.uSkyGain.value = 1 + 1.2 * smooth(V_EDGE, V_SLOW, v) + 2 * smooth(V_SLOW, V_END, v) + 40 * Math.pow(smooth(V_END - 0.6, T_SWITCH, v), 2);
  u.uDisk.value = 1;
  // your dot from far away: just outside the shadow, frozen, reddening and fading
  if (s.wide) {
    const w = smooth(V_WIDE0 + 0.4, V_WIDE1 - 0.2, v);
    const alpha = Math.asin(Math.min(1, (2.598 / u.uD.value) * Math.sqrt(1 - 1 / u.uD.value))) * 0.86;
    youDir.copy(F).applyAxisAngle(Uw, -alpha * 0.55).applyAxisAngle(Rw, alpha * 0.84).normalize();
    u.uYou.value.set(youDir.x, youDir.y, youDir.z, lerp(1.0, 0.12, w));
    u.uYouCol.value.setRGB(1.0, lerp(0.95, 0.12, w), lerp(0.9, 0.04, w));
  } else u.uYou.value.w = 0;
  sky.mesh.position.copy(camera.position);

  // ---------- light on you ----------
  const near = smooth(34, 4, s.r);                        // the disk looms larger as you fall
  diskLight.position.copy(F).multiplyScalar(5).addScaledVector(Uw, -2.5).addScaledVector(Rw, 1.5);
  diskLight.target.position.set(0, 0, 0);
  diskLight.intensity = (1.6 + 2.6 * near) * (1 - smooth(V_EDGE - 1, V_EDGE + 4, v) * 0.85);
  diskLight.color.setRGB(1.0, 0.72, 0.45);
  skyLight.position.copy(F).multiplyScalar(-5).addScaledVector(Rw, -1.2);
  skyLight.target.position.set(0, 0, 0);
  skyLight.intensity = smooth(V_EDGE - 0.5, V_EDGE + 4, v) * (1.6 + 1.5 * smooth(V_EDGE + 4, V_SLOW, v) + 3 * smooth(V_SLOW, V_END, v));
  hemi.color.setRGB(0.36, 0.42, 0.6);
  hemi.groundColor.setRGB(0.7, 0.42, 0.22).multiplyScalar(1 - 0.7 * smooth(V_EDGE, V_EDGE + 5, v));
  hemi.intensity = 0.55 + 0.4 * near;

  // ---------- specks of gas and dust streaming past (you fall toward F, so they stream back) ----------
  const su = streaks.u;
  const speed = lerp(14, 70, smooth(0, V_EDGE, v)) * (s.inside ? lerp(1, 0.35, smooth(V_EDGE, V_EDGE + 4, v)) : 1);
  su.uVel.value.copy(F).multiplyScalar(-speed);
  su.uOffset.value.copy(F).multiplyScalar(-integSpeed(v));
  su.uCenter.value.copy(camera.position);
  su.uShutter.value = 1 / 60;
  su.uColor.value.setRGB(...(s.inside ? [0.7, 0.8, 1.0] : [1.0, 0.75, 0.5]));
  su.uAlpha.value = (s.wide ? 0 : 0.5 + 0.4 * near) * (1 - s.flash);
  su.uSize.value = 0.006;
  su.uCount.value = 0.55;
  su.uLit.value = 1.0;
  su.uLamp.value = 0;

  cubeCam.position.copy(helmet);
  renderer.toneMappingExposure = (s.wide ? 1.0 : 1.05 - 0.25 * near) * (1 + 0.25 * smooth(V_EDGE + 2, V_SLOW, v));
  bloom.strength = 0.3 + 0.15 * near + 0.6 * smooth(V_SLOW, V_END, v);
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : (1 - s.flash) * 0.9;
  finish.uniforms.uCap.value = window.__cover ? 0 : 1;
  finish.uniforms.uWarp.value = s.stretch;

  // the "YOU" marker in the far shot
  let mark = null;
  if (s.wide) {
    const p = youDir.clone().multiplyScalar(100).add(camera.position).project(camera);
    mark = { x: (p.x * 0.5 + 0.5) * W, y: (0.5 - p.y * 0.5) * H, a: smooth(V_WIDE0 + 0.2, V_WIDE0 + 0.6, v) * (1 - smooth(V_WIDE1 - 0.25, V_WIDE1, v)) };
  }
  overlay(v, s, v, mark);
  return s;
}

// distance the specks have moved (integral of their speed), by a fine table
const integSpeed = (() => {
  const dt = 1 / 120, t0 = -3, n = Math.ceil((VIDEO_DURATION + 4) / dt);
  const xs = new Float32Array(n + 1);
  const sp = (v) => lerp(14, 70, smooth(0, V_EDGE, v)) * (v >= V_EDGE ? lerp(1, 0.35, smooth(V_EDGE, V_EDGE + 4, v)) : 1);
  for (let i = 1; i <= n; i++) xs[i] = xs[i - 1] + sp(t0 + (i - 0.5) * dt) * dt;
  return (v) => { const f = clamp((v - t0) / dt, 0, n - 1), i = Math.floor(f); return lerp(xs[i], xs[i + 1], f - i); };
})();

let comp = null;
// t is video time. The last LOOP seconds replay the moments just before the first frame while the
// white clears, so the video loops seamlessly.
function renderFrame(t) {
  const tail = t - (VIDEO_DURATION - LOOP);
  if (tail >= 0) update(t - VIDEO_DURATION, 1 - smooth(0, LOOP * 0.92, tail));
  else update(t);
  cubeCam.update(renderer, scene);
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
  for (const t of [62, 50, 40, 33, 20, 10, 0]) renderFrame(t);   // compile everything once
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, suit, sky };
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

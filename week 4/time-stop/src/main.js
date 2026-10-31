import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeStreet, YOU0, TRUCK, RADIO_COP } from './street.js';
import { makeRain } from './rain.js';
import { makeJewel } from './jewel.js';
import { makeBank } from './bank.js';
import { makeGold } from './gold.js';
import { makeYou, streetYou, WALK_X } from './you.js';
import { makeGlows } from './glows.js';
import { makeOverlay } from './overlay.js';
import { state, VIDEO_DURATION, LOOP, popupAt, POP, T_SWITCH, FREEZES, RESUMES, lastOf, GOLD_STEPS } from './timeline.js';
import { DEG, lerp, smooth, wobble, clamp, keys } from './util.js';
import { makeCompositor } from './compose.js';

const W = 1080, H = 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));
const RW = Math.round(W * RES), RH = Math.round(H * RES);

const stage = document.getElementById('stage');
// plain depth buffer: everything is street-scale (the rain right at the lens to the towers ~1 km off)
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, W / H, 0.08, 3000);
camera.rotation.order = 'YXZ';
scene.add(camera);

// ---------- the places ----------
const sky = makeSky();
scene.add(sky.mesh);
const street = makeStreet(scene);
const rain = makeRain(scene, street.U);
const jewel = makeJewel(scene);
const bank = makeBank(scene);
const gold = makeGold(scene);
const you = makeYou(scene);
const glows = makeGlows(scene, 9000);
const PLACES = { street: [street.G, street.M], jewel: [jewel.G], bank: [bank.G], gold: [gold.G] };

// light in the square: the screens' glow all round (violet above, warm off the wet ground), coloured fills that
// follow the camera so the people near it are lit like the screens light them
const hemi = new THREE.HemisphereLight(0x8a70c0, 0x3a2a40, 1.1);
scene.add(hemi);
const fills = [[0xff3a9a, 28], [0x3ac8ff, 24], [0xffd8a0, 16]].map(([c, i]) => { const l = new THREE.PointLight(c, i, 0, 1.25); l.userData.i = i; scene.add(l); return l; });
const streetLights = [hemi, ...fills];

const overlay = makeOverlay();
const stampEl = document.getElementById('stamp');
const stampW = document.getElementById('stampw');

// ---------- post ----------
const rt = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(RW, RH);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv);
    if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 60.0), 1.0); }`,
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.4, 0.45, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
// the finish: the time-stop look (colour drains a little and cools; a ripple of bent light races out from you as it
// stops, a smaller warm one as it starts), chromatic fringes, the flash, vignette, darkening behind the title/counter
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.32 }, uTitle: { value: 0 }, uCounter: { value: 0 },
    uFrozen: { value: 0 }, uRip: { value: 9 }, uRes: { value: 9 }, uC: { value: new THREE.Vector2(0.5, 0.5) },
    uFlash: { value: 0 }, uFlashC: { value: new THREE.Color(0.9, 0.95, 1.0) }, uAb: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uFrozen; uniform float uRip; uniform float uRes; uniform vec2 uC; uniform float uFlash; uniform vec3 uFlashC; uniform float uAb;
    varying vec2 vUv;
    void main() {
      vec2 asp = vec2(1.0, ${(H / W).toFixed(4)});
      vec2 d = (vUv - uC) * asp;
      float r = length(d);
      vec2 dir = r > 1e-5 ? d / r : vec2(0.0);
      // the stop: a ring racing out over ~0.55 s, bending the picture as it passes
      float R1 = 2.2 * sqrt(clamp(uRip / 0.55, 0.0, 1.5));
      float ring = exp(-pow((r - R1) / 0.07, 2.0)) * (1.0 - smoothstep(0.35, 0.6, uRip));
      // the start: a smaller, faster warm ring
      float R2 = 2.0 * sqrt(clamp(uRes / 0.35, 0.0, 1.5));
      float ring2 = exp(-pow((r - R2) / 0.05, 2.0)) * (1.0 - smoothstep(0.2, 0.35, uRes)) * 0.6;
      vec2 off = dir / asp * (ring * 0.035 + ring2 * 0.02);
      float ab = uAb + ring * 0.012 + ring2 * 0.006;
      vec2 uv = vUv - off;
      vec2 ca = dir / asp * ab;
      vec3 col = vec3(texture2D(tDiffuse, uv + ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - ca).b);
      // frozen: a little less colour, cooler, a touch more contrast
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      vec3 cold = mix(col, vec3(lum), 0.22) * vec3(0.92, 0.98, 1.08);
      cold = mix(cold, cold * cold * (3.0 - 2.0 * clamp(cold, 0.0, 1.0)), 0.18);
      col = mix(col, cold, uFrozen);
      col += vec3(0.75, 0.88, 1.0) * ring * 0.35 + vec3(1.0, 0.85, 0.6) * ring2 * 0.25;
      col += uFlashC * uFlash;
      vec2 c = vUv - 0.5;
      col *= 1.0 - (uVig + 0.12 * uFrozen) * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.5 * exp(-pow((vUv.y - 0.345) / 0.1, 2.0));
      col *= 1.0 - uCounter * 0.32 * exp(-pow((vUv.y - 0.53) / 0.065, 2.0)) * smoothstep(0.85, 0.2, vUv.x);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- the camera: one function per shot ----------
const v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
const lookAt = (pos, tgt) => { v3.copy(tgt).sub(pos); return { yaw: Math.atan2(-v3.x, -v3.z), pitch: Math.atan2(v3.y, Math.hypot(v3.x, v3.z)) }; };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const path = (list, v) => {         // [[t, Vector3], ...] eased per segment
  if (v <= list[0][0]) return list[0][1].clone();
  for (let i = 0; i < list.length - 1; i++) { const [a, p] = list[i], [b, q] = list[i + 1]; if (v <= b) return p.clone().lerp(q, smooth(a, b, v)); }
  return list[list.length - 1][1].clone();
};
function camAt(v, s) {
  const sh = s.shot, k = sh.k;
  const kl = clamp((v - sh.a) / (sh.b - sh.a));
  let pos, tgt, fov = 62, roll = wobble(v * 0.3, 7) * 0.35 * DEG;
  if (k === 'truck') {
    // over your right shoulder at the truck's open doors: you, the bags, the screens towering above
    const t = clamp((v + 0.5) / 3.9);
    pos = V(lerp(1.95, 2.05, t), lerp(2.0, 1.9, t), lerp(2.45, 2.15, t));
    tgt = V(lerp(3.7, 3.75, t), lerp(2.2, 1.9, t), -4.0);
    fov = 68;
  } else if (k === 'walkoff') {
    // back and up: the guard finds the truck empty, you slip off into the crowd; the world stops again
    pos = path([[3.4, V(3.4, 1.9, 2.8)], [4.6, V(2.0, 3.0, 6.5)], [6.0, V(0.6, 3.4, 8.0)]], v);
    const yp = streetYou(v);
    tgt = V(lerp(3.2, yp.x, smooth(3.6, 5.2, v)), lerp(2.0, 1.7, kl), lerp(-3, yp.z - 2, smooth(3.6, 5.2, v)));
    fov = 62;
  } else if (k === 'jewel') {
    const yp = you.lastPos || V(-2, 0, -2);
    pos = path([[6.0, V(1.4, 1.95, 0.5)], [9.6, V(-0.6, 2.0, 0.0)]], v);
    tgt = V(yp.x * 0.75 - 0.4, 0.5, yp.z - 1.2);
    fov = 64;
  } else if (k === 'jewelAlarm') {
    pos = V(lerp(-0.2, 0.1, kl), 1.65, lerp(0.6, 0.2, kl));
    tgt = V(-1.6, 1.1, -4.0);
    fov = 62;
  } else if (k === 'forensic') {
    pos = V(lerp(1.2, 0.9, kl), lerp(1.8, 1.7, kl), lerp(-1.2, -1.6, kl));
    tgt = V(-3.0, 1.0, -5.0);
    fov = 58;
  } else if (k === 'bank') {
    pos = path([[15.8, V(0.3, 1.7, -0.6)], [19.6, V(-0.2, 1.75, -1.6)]], v);
    const yp = you.lastPos || V(0, 0, -5);
    tgt = V(yp.x * 0.5, 1.2, lerp(-6, -7, kl));
    fov = 64;
  } else if (k === 'bankAlarm') {
    pos = V(0.2, 1.7, lerp(-6.8, -6.3, kl));
    tgt = V(0.4, 1.4, 2);
    fov = 64;
  } else if (k === 'hunt') {
    // the square, hunting you: high over the plaza, coming down to you in the crowd
    pos = path([[21.4, V(9.0, 13.0, 18.0)], [25.0, V(1.2, 2.6, 6.2)]], v);
    const yp = streetYou(v);
    tgt = V(lerp(-1, yp.x, smooth(21.4, 25, v)), lerp(8, 1.7, smooth(21.4, 25, v)), lerp(-40, yp.z - 3, smooth(21.4, 25, v)));
    fov = 62;
  } else if (k === 'past') {
    // frozen: gliding past the cop on his radio, under the searchlight's beam of hanging drops, to you
    const yp = streetYou(v);
    pos = path([[25.0, V(1.2, 2.6, 6.2)], [26.6, V(-0.9, 1.75, -4.8)], [28.5, V(-1.0, 1.7, -10.8)]], v);
    tgt = V(lerp(yp.x, -2.3, smooth(25.6, 27.0, v) * (1 - smooth(27.3, 28.3, v))), 1.55, lerp(yp.z - 2, RADIO_COP.z, smooth(25.6, 27.2, v)));
    if (v > 27.3) tgt.set(lerp(-2.3, yp.x, smooth(27.3, 28.3, v)), 1.55, lerp(RADIO_COP.z, yp.z - 3, smooth(27.3, 28.4, v)));
    fov = 60;
  } else if (k === 'gold') {
    if (v < GOLD_STEPS[1]) {
      // at the first cage's door looking in at its gold, then turning down the row as it empties
      pos = path([[28.5, V(-1.2, 1.75, 1.2)], [GOLD_STEPS[0], V(-0.9, 1.8, -0.6)], [GOLD_STEPS[1], V(-1.0, 2.1, -3.5)]], v);
      tgt = path([[28.5, V(6.5, 0.6, -3.0)], [GOLD_STEPS[0] - 0.3, V(6.0, 0.6, -3.5)], [GOLD_STEPS[1], V(4.0, 0.7, -24)]], v);
    } else {
      // through the ceiling: all three halls from above, emptying
      // (steep enough that the halls fill the frame: nothing but vault beyond them)
      pos = path([[GOLD_STEPS[1], V(0, 24, 4)], [GOLD_STEPS[2], V(0, 40, -2)], [43.6, V(0, 58, -8)]], v);
      tgt = path([[GOLD_STEPS[1], V(0, 0, -24)], [GOLD_STEPS[2], V(0, 0, -36)], [43.6, V(0, 0, -42)]], v);
    }
    fov = v < GOLD_STEPS[1] ? 64 : 62;
  } else if (k === 'goldAlarm') {
    pos = V(0.7, 1.65, lerp(-8.5, -8.0, kl));
    tgt = V(0, 1.45, 4);
    fov = 64;
  } else {
    // the finale: high over the square (helicopters, every screen), down to you in the crowd, looking up
    pos = path([[46.0, V(-10, 26, 26)], [49.5, V(3, 6, 6)], [52.0, V(WALK_X + 0.5, 1.8, -0.8)]], v);
    tgt = path([[46.0, V(0, 10, -60)], [49.5, V(0, 6, -40)], [52.0, V(WALK_X, 2.6, -14)]], v);
    fov = 62;
  }
  const o = lookAt(pos, tgt);
  const wk = fov / 60;
  return { pos, yaw: o.yaw + wobble(v * 0.4, 4) * 0.25 * DEG * wk, pitch: o.pitch + wobble(v * 0.5, 3) * 0.25 * DEG * wk, roll, fov };
}

const tmpV = new THREE.Vector3();
function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) s.flash = Math.max(s.flash, cover);
  // ---------- places ----------
  for (const [name, groups] of Object.entries(PLACES)) for (const g of groups) g.visible = s.place === name;
  const inStreet = s.place === 'street';
  rain.visible = inStreet;
  sky.mesh.visible = inStreet;
  for (const l of streetLights) l.visible = inStreet;
  scene.background = inStreet ? null : new THREE.Color(0x000000);

  // ---------- you (needed by the camera in some shots) ----------
  glows.begin(null);
  const me = you.frame(v, s, street.bags, { add() {} });
  you.lastPos = me.pos;

  // ---------- camera ----------
  const cam = camAt(v, s);
  camera.position.copy(cam.pos);
  camera.rotation.set(cam.pitch, cam.yaw, cam.roll);
  camera.fov = cam.fov;
  camera.near = 0.08;
  camera.far = 3000;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  sky.mesh.position.copy(camera.position);
  sky.mesh.scale.setScalar(1000);

  glows.begin(camera);
  you.frame(v, s, street.bags, glows);
  if (inStreet) {
    street.frame(v, s, glows);
    rain.update(camera, (2 * Math.tan((camera.fov * DEG) / 2)) / RH, 1);
    // the fills follow the camera (the screens' light falls on whoever is near it)
    const f = camera.position;
    fills[0].position.set(f.x - 9, 7, f.z - 6);
    fills[1].position.set(f.x + 12, 8, f.z - 4);
    fills[2].position.set(f.x + 1, 4, f.z + 5);
    glows.mat.uniforms.uFogD.value = street.U.uFogD.value;
  } else if (s.place === 'jewel') jewel.frame(v, s, glows);
  else if (s.place === 'bank') bank.frame(v, s, glows);
  else gold.frame(v, s, glows, { noCeiling: s.shot.k === 'gold' && v >= GOLD_STEPS[1], cam: camera.position });
  if (!inStreet) glows.mat.uniforms.uFogD.value = 0;
  glows.end();
  renderer.toneMappingExposure = inStreet ? 1.0 : 1.0;

  // ---------- post: the time-stop look ----------
  finish.uniforms.uTime.value = v;
  finish.uniforms.uFrozen.value = window.__cover ? 0.6 : s.frozen;
  finish.uniforms.uRip.value = window.__cover ? 9 : lastOf(FREEZES, v);
  finish.uniforms.uRes.value = window.__cover ? 9 : lastOf(RESUMES, v);
  // the ripple starts from you when you're on screen (otherwise the middle)
  {
    tmpV.copy(me.pos).setY(1.4).project(camera);
    const onScreen = me.vis && tmpV.z < 1 && Math.abs(tmpV.x) < 1 && Math.abs(tmpV.y) < 1;
    finish.uniforms.uC.value.set(onScreen ? tmpV.x * 0.5 + 0.5 : 0.5, onScreen ? tmpV.y * 0.5 + 0.5 : 0.45);
  }
  const rip = lastOf(FREEZES, v);
  finish.uniforms.uFlash.value = window.__cover ? 0 : 0.18 * Math.exp(-rip / 0.07) * (rip >= 0 ? 1 : 0) + 0.08 * Math.exp(-lastOf(RESUMES, v) / 0.06);
  finish.uniforms.uAb.value = 0.0015;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : (1 - s.flash) * 0.9;
  bloom.strength = inStreet ? 0.42 : s.place === 'gold' ? 0.22 : 0.3;

  overlay(v, s, v);
  // the gold popup: one phrase saying what just happened (never a number), sized to fit the width
  {
    const p = window.__cover ? null : popupAt(v);
    const a = p ? smooth(0, 0.06, p.dt) * (1 - smooth(POP - 0.35, POP, p.dt)) * (1 - s.flash) : 0;
    stampEl.style.opacity = a.toFixed(3);
    stampW.style.opacity = '0';
    if (a > 0) {
      if (stampEl.textContent !== p.say) stampEl.textContent = p.say;
      const fit = Math.max(64, Math.min(118, 1700 / p.say.length));
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
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  // draw every place once so their shaders are compiled before the first timed frame
  for (const t of [50, 44, 40, 30, 22, 18, 13, 8, 4, 0]) renderFrame(t);
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer };
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

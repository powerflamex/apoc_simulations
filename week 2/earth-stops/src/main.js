import { WIDE, wideBand } from './wide.js';   // first: it changes how the scene camera frames 16:9
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeWorld } from './world.js';
import { makeOverlay } from './overlay.js';
import { state, beatAt, VIDEO_DURATION, LOOP, IW, tOf, V_HIT, V_SOUND, UNDER_COLOR, SPIN0 } from './timeline.js';
import { CAM } from './layout.js';
import { youHead } from './people.js';
import { DEG, lerp, smooth, wobble, clamp } from './util.js';
import { makeCompositor } from './compose.js';

const W = WIDE ? 1920 : 1080, H = WIDE ? 1080 : 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));
const RW = Math.round(W * RES), RH = Math.round(H * RES);

const stage = document.getElementById('stage');
// Plain depth buffer, not the logarithmic one: the log depth writes depth per pixel, which stops the GPU from
// skipping hidden surfaces (frames took ~1.6x as long). Compared frame by frame: no visible difference here, since
// the city never spans more than a few km (near 0.5 m keeps the precision).
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, logarithmicDepthBuffer: false });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const FOG0 = new THREE.Color(0.8, 0.54, 0.4), DUSTC = new THREE.Color(0.52, 0.42, 0.33);
scene.fog = new THREE.FogExp2(FOG0.clone(), 0.0002);
const camera = new THREE.PerspectiveCamera(62, W / H, 0.5, 30000);
camera.rotation.order = 'YXZ';
scene.add(camera);
const sky = makeSky();
scene.add(sky.mesh);
const world = makeWorld(scene);
sky.uniforms.uSunDir.value.copy(world.sunDir);
const overlay = makeOverlay();
const stampEl = document.getElementById('stamp');
const stampW = document.getElementById('stampw');
const youEl = document.getElementById('you');

// post: MSAA scene target -> bloom -> tone map -> grade (dust), gust shake blur, underwater, vignette, title/counter bands
const rt = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(RW, RH);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.4, 0.45, 0.95);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.32 }, uTitle: { value: 0 }, uCounter: { value: 0 },
    uUnder: { value: 0 }, uAb: { value: 0 }, uDust: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uUnder; uniform float uAb; uniform float uDust;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
    float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * vn(p); p = p * 2.07 + 3.1; a *= 0.5; } return s; }
    void main() {
      vec2 c = vUv - 0.5;
      vec2 wob = vec2(sin(vUv.y * 40.0 + uTime * 6.0), cos(vUv.x * 30.0 + uTime * 5.0)) * 0.006 * uUnder;
      vec2 off = c * uAb * 0.012;
      vec3 col = vec3(texture2D(tDiffuse, vUv + wob + off).r, texture2D(tDiffuse, vUv + wob).g, texture2D(tDiffuse, vUv + wob - off).b);
      // the dust storm: a warm, flat brown cast
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, mix(vec3(lum), col, 0.8) * vec3(1.05, 0.95, 0.82), uDust * 0.25);
      if (uUnder > 0.0) {
        // churning deep water, bubbles rising; nothing of the scene shows through
        float churn = fbm(vUv * vec2(3.0, 5.0) + wob * 20.0 + vec2(uTime * 0.4, uTime * 1.3));
        vec3 murk = vec3(0.02, 0.12, 0.13) * (1.2 - vUv.y * 0.8) + vec3(0.03, 0.09, 0.09) * churn;
        vec2 bp = vUv * vec2(18.0, 32.0) + vec2(0.0, -uTime * 3.0);
        vec2 bi = floor(bp), bf = fract(bp) - 0.5;
        float bub = step(0.82, h(bi)) * smoothstep(0.18, 0.1, length(bf + (vec2(h(bi + 3.1), h(bi + 7.7)) - 0.5) * 0.4));
        murk += vec3(0.5, 0.7, 0.7) * bub * 0.5;
        col = mix(col, murk, uUnder);
      }
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.3);   // a gentle S-curve: more punch
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.45 * exp(-pow((vUv.y - ${WIDE ? '0.665' : '0.69'}) / ${WIDE ? '0.17' : '0.1'}, 2.0));
      col *= 1.0 - uCounter * 0.32 * exp(-pow((vUv.y - ${WIDE ? '0.35' : '0.53'}) / ${WIDE ? '0.11' : '0.065'}, 2.0)) * smoothstep(${WIDE ? '0.42' : '0.8'}, ${WIDE ? '0.08' : '0.2'}, vUv.x);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// Catmull-Rom through [time, value] keys (smooth speed through each key: the camera never stops and starts)
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
// the camera's path: on the footbridge for the first 20 s, then up and forward along the avenue into the wind,
// rising over the falling city, and holding high up to face the ocean
const PX = [[-3, CAM.x], [20, CAM.x], [30, -1.2], [44, 0], [64, 0]];
const PY = [[-3, CAM.y], [20, CAM.y], [24, 9.5], [34, 20], [44, 38], [52, 80], [58, 90], [64, 92]];
const PZ = [[-3, CAM.z - 0.1], [16, CAM.z - 0.2], [20, CAM.z - 1.0], [24, 13], [34, -90], [44, -240], [52, -330], [58, -355], [64, -360]];
const YAW = [[-3, 0], [5, 1], [9, 5], [13, 6], [16, 1], [19, -4], [22, -2], [26, 0], [40, 1], [46, -2], [50, 3], [56, 0], [64, 0]];
const PITCH = [[-3, CAM.pitch], [5, -7.5], [9, -3.5], [13, -2.5], [16, -6], [20, -6.5], [26, -8], [40, -7], [45, -3], [48.5, 4], [52, 1], [56, 0], [60, 1.5], [63, 5], [64, 7]];

const fogC = new THREE.Color();
const tmp = new THREE.Color();
const v3 = new THREE.Vector3();

function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) { s.flash = cover; s.flashColor = UNDER_COLOR; s.under = cover; }

  // ---------- camera ----------
  let x = spline(PX, v), y = spline(PY, v), z = spline(PZ, v);
  let yaw = spline(YAW, v) * DEG, pitch = spline(PITCH, v) * DEG, roll = 0;
  // the gusts: buffeting that grows with the wind, plus a slow sway
  const sh = s.shake * (v < 21 ? 0.7 : 1);
  x += wobble(v * 9, 1) * 0.03 * sh + wobble(v * 0.5, 2) * 0.05;
  y += wobble(v * 11, 3) * 0.025 * sh;
  yaw += (wobble(v * 13, 4) * 0.25 * sh + wobble(v * 0.4, 5) * 0.4) * DEG;
  pitch += (wobble(v * 15, 6) * 0.22 * sh + wobble(v * 0.35, 7) * 0.3) * DEG;
  roll += (wobble(v * 7, 8) * 0.35 * sh + wobble(v * 0.3, 9) * 0.6) * DEG;
  // every 100 mph lands like a blow: a hard gust jolts the view and it punches in
  const b = beatAt(v);
  let punch = 0;
  if (b && !window.__cover) {
    punch = smooth(0, 0.05, b.dt) * Math.exp(-Math.max(0, b.dt - 0.05) * 5);
    pitch -= punch * 1.0 * DEG; roll += punch * 1.4 * DEG * Math.sin(b.w);
    x += punch * 0.12 * Math.sin(v * 50);
  }
  // the sonic boom: a shock passes, the whole view kicks
  const boom = Math.exp(-Math.pow((v - V_SOUND - 0.1) / 0.12, 2));
  pitch += boom * 1.5 * DEG * Math.sin(v * 70);
  camera.position.set(x, y, z);
  camera.rotation.set(pitch, yaw, roll);
  camera.fov = 62 - 3 * punch;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // ---------- sky, air, light ----------
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / (WIDE ? RH * 16 / 9 : RH);
  u.uTime.value = v;
  u.uShift.value = IW(tOf(v)) + v * 3;
  u.uDust.value = s.dust;
  u.uCamY.value = y;
  fogC.copy(FOG0).lerp(DUSTC, clamp(s.dust * 1.4));
  const fogD = 0.00012 + 0.00026 * s.dust;
  scene.fog.color.copy(fogC); scene.fog.density = fogD;
  world.glows.mat.uniforms.uFogD.value = fogD;
  world.streaks.u.uFogD.value = fogD; world.streaks.u.uFogC.value.copy(fogC);
  const sunK = 1 - 0.65 * clamp(s.dust * 1.3);
  world.sun.intensity = 3.2 * sunK;
  world.sun.color.setRGB(1.0, 0.69, 0.44).lerp(tmp.setRGB(1.0, 0.5, 0.28), s.dust);
  world.hemi.intensity = 1.4 + 0.2 * s.dust;
  world.hemi.color.setRGB(0.56, 0.65, 0.84).lerp(tmp.setRGB(0.62, 0.52, 0.42), clamp(s.dust * 1.3));
  world.streaks.u.uLight.value.setScalar(0.65 + 0.35 * sunK);
  world.streaks.u.uDens.value.set(0.25 + 0.75 * smooth(-2, 10, v), 0.05 + 0.6 * smooth(5, 30, v), 1, 1);
  world.smoke.mat.uniforms.uTime.value = v;
  world.smoke.mat.uniforms.uSun.value.copy(world.sunDir);
  world.smoke.mat.uniforms.uLight.value.setRGB(1.0, 0.82, 0.66).multiplyScalar(0.75 + 0.35 * sunK);
  world.ocean.u.uFogC.value.copy(fogC); world.ocean.u.uFogD.value = fogD * 0.85;
  world.ocean.u.uLight.value = 0.8 + 0.3 * sunK;

  world.frame(v, s, camera);

  renderer.toneMappingExposure = 1.2 + 0.1 * s.dust;
  bloom.strength = 0.4;
  finish.uniforms.uTime.value = v;
  finish.uniforms.uUnder.value = s.under;
  finish.uniforms.uAb.value = 0.3 * s.k + punch * 1.5 + boom * 2;
  finish.uniforms.uDust.value = s.dust;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : (1 - s.flash) * 0.9;

  overlay(v, s, v);
  // "YOU": a label over your head on the crosswalk for the first seconds
  {
    const hd = youHead(v, z);
    v3.set(hd.x, hd.y, hd.z).project(camera);
    const a = window.__cover || !hd.visible || v3.z > 1 ? 0 : s.you * (1 - s.flash);
    youEl.style.opacity = a.toFixed(3);
    if (a > 0) {
      const sx = (v3.x * 0.5 + 0.5) * W, sy = (-v3.y * 0.5 + 0.5) * H;
      youEl.style.left = `${(sx - 120).toFixed(1)}px`;
      youEl.style.top = `${(sy - 112).toFixed(1)}px`;
    }
  }
  // the big number at each beat: the wind speed pops in, holds, fades
  {
    const a = b && !window.__cover ? smooth(0, 0.06, b.dt) * (1 - smooth(1.2, 1.7, b.dt)) * (1 - s.flash) : 0;
    stampEl.style.opacity = a.toFixed(3);
    stampW.style.opacity = a.toFixed(3);
    if (a > 0) {
      const t = `${b.w.toLocaleString('en-US')} mph`;
      if (stampEl.textContent !== t) stampEl.textContent = t;
      const lbl = b.stop ? 'EARTH HAS STOPPED · WIND' : 'WIND';
      if (stampW.textContent !== lbl) stampW.textContent = lbl;
      stampEl.style.fontSize = `${(138 * (1 + 0.3 * Math.exp(-b.dt * 9))).toFixed(1)}px`;
    }
  }
  return s;
}

let comp = null;
// t is video time. The last LOOP seconds replay the moments just before the first frame while the
// deep water clears, so the video loops seamlessly.
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
  for (const t of [63.5, 50, 35, 20, 10, 0]) renderFrame(t);   // compile everything once
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

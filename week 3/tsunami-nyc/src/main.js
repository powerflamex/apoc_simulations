import { WIDE } from './wide.js';   // first: it changes how the scene camera frames 16:9
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeWorld } from './world.js';
import { makeOverlay } from './overlay.js';
import { state, beatAt, VIDEO_DURATION, LOOP, V_HIT, FOAM_COLOR } from './timeline.js';
import { CAM, SUN, YOU } from './layout.js';
import { DEG, lerp, smooth, wobble, clamp } from './util.js';
import { makeCompositor } from './compose.js';

const W = WIDE ? 1920 : 1080, H = WIDE ? 1080 : 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));
const RW = Math.round(W * RES), RH = Math.round(H * RES);

const stage = document.getElementById('stage');
// Plain depth buffer with the near plane at 0.5 m (the far shores are only ~9 km off)
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, logarithmicDepthBuffer: false });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const FOG0 = new THREE.Color(0.8, 0.66, 0.6), FOGS = new THREE.Color(0.5, 0.56, 0.6);
scene.fog = new THREE.FogExp2(FOG0.clone(), 0.00005);
const camera = new THREE.PerspectiveCamera(64, W / H, 0.5, 30000);
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

const rt = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(RW, RH);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.28, 0.4, 0.95);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.3 }, uTitle: { value: 0 }, uCounter: { value: 0 }, uAb: { value: 0 }, uCool: { value: 0 }, uFoam: { value: 0 }, uT: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVig; uniform float uTitle; uniform float uCounter; uniform float uAb; uniform float uCool;
    uniform float uFoam; uniform float uT;
    varying vec2 vUv;
    float h1(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h1(i), h1(i+vec2(1,0)), f.x), mix(h1(i+vec2(0,1)), h1(i+vec2(1,1)), f.x), f.y); }
    float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * vn(p); p = p * 2.07 + 3.1; a *= 0.5; } return s; }
    void main() {
      vec2 c = vUv - 0.5;
      vec2 off = c * uAb * 0.012;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      // in the wave's shadow the light goes cold
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, mix(vec3(lum), col, 0.85) * vec3(0.9, 0.98, 1.08), uCool * 0.6);
      // the water hitting the camera: torn white foam and green water rushing past and up, flooding in from the
      // bottom and the edges (no underwater scene: it goes straight on to white)
      if (uFoam > 0.0) {
        vec2 q = vUv * vec2(2.2, 4.0);
        float f1 = fbm(q + vec2(uT * 1.1, -uT * 9.0));
        float f2 = fbm(q * 2.4 + vec2(-uT * 2.3, -uT * 14.0) + f1);
        float st = fbm(vec2(vUv.x * 16.0 + f1 * 2.0, vUv.y * 1.2 - uT * 12.0));
        float foam = smoothstep(0.38, 0.72, f1 * 0.55 + f2 * 0.35 + st * 0.3);
        vec3 water = mix(vec3(0.05, 0.2, 0.19), vec3(0.4, 0.62, 0.6), f2);
        vec3 fc = mix(water, vec3(0.94, 0.97, 0.97), foam);
        float edge = max(abs(vUv.x - 0.5) * 1.2, 1.0 - vUv.y);
        float cov = clamp(uFoam * 2.2 - (1.0 - edge) * 1.1 + (f1 - 0.5) * 0.6, 0.0, 1.0);
        col = mix(col, fc, smoothstep(0.0, 0.25, cov));
      }
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.28);
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.45 * exp(-pow((vUv.y - ${WIDE ? '0.665' : '0.69'}) / ${WIDE ? '0.17' : '0.1'}, 2.0));
      col *= 1.0 - uCounter * 0.32 * exp(-pow((vUv.y - ${WIDE ? '0.35' : '0.53'}) / ${WIDE ? '0.11' : '0.065'}, 2.0)) * smoothstep(${WIDE ? '0.42' : '0.8'}, ${WIDE ? '0.08' : '0.2'}, vUv.x);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

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
// The camera: over your shoulder at the railing, looking out at the wall and the Statue; at 16.5 s it turns round
// (right, past Jersey City) to the people running for the city, and the wave's shadow falls over the towers; it
// turns on round to the bay, rises like a drone to 150 m to see the whole wall take the ferry and Governors Island,
// and comes back down to you at the railing, looking up at the lip curling over.
const PX = [[-3, CAM.x], [16, CAM.x], [20, 1.5], [27, 2.5], [31, 0], [38, 0], [46, 2], [52, 0], [56, -0.5], [60, -0.5]];
const PY = [[-3, CAM.y], [16, CAM.y], [20, 2.4], [28, 2.4], [30, 4], [33.8, 9], [37.5, 90], [41.5, 150], [47, 140], [52, 40], [55.5, 3.5], [57, 2.4], [58.9, 3.0], [59.15, 3.4], [59.5, 6], [60, 6]];
const PZ = [[-3, CAM.z], [16, CAM.z - 1], [20, 12], [27, 14], [31, 16], [38, 70], [46, 60], [52, 25], [56, 5], [57.5, 8.5], [58.9, 12], [59.15, 13], [59.5, 24], [60, 30]];
// a long lens at the start (the wall and the Statue big on the horizon), wide from the turn on
const FOV = [[-3, 30], [10, 30], [13.5, 25], [16.4, 25], [18, 50], [20, 62], [29.5, 62], [31.3, 26], [33.8, 26], [36, 60], [52, 64], [57, 74], [60, 76]];
const YAW = [[-3, -2], [11, -3], [13.5, -4.5], [16.4, -4.8], [17.3, -12], [19, -120], [20.5, -178], [26.5, -182], [29, -300], [30.4, -362], [31.3, -369], [33.8, -369.5], [36, -361], [40, -360], [43, -350], [47, -343], [51, -354], [56, -362], [60, -362]];
const PITCH = [[-3, 0.5], [11, 1.2], [13.5, 2.2], [16.4, 3], [20, 6], [26.5, 8], [30, 3], [31.3, 1.5], [33.8, 2.5], [36, -3], [41, -5], [47, 0], [52, 6], [55, 14], [57.5, 17], [58.8, 18], [59.1, 22], [59.3, 40], [59.6, 55], [60, 60]];

const fogC = new THREE.Color();
const tmp = new THREE.Color();
const v3 = new THREE.Vector3();
const sunEl = SUN.el * DEG;

function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) { s.flash = cover; s.flashColor = FOAM_COLOR; }
  let x = spline(PX, v), y = spline(PY, v), z = spline(PZ, v);
  let yaw = spline(YAW, v) * DEG, pitch = spline(PITCH, v) * DEG, roll = 0;
  const sh = s.shake;
  x += wobble(v * 0.5, 2) * 0.05 + wobble(v * 12, 1) * 0.04 * sh;
  y += wobble(v * 0.4, 3) * 0.04 + wobble(v * 10, 3) * 0.05 * sh;
  yaw += (wobble(v * 0.4, 5) * 0.35 + wobble(v * 12, 4) * 0.3 * sh) * DEG;
  pitch += (wobble(v * 0.35, 7) * 0.3 + wobble(v * 14, 6) * 0.35 * sh) * DEG;
  roll += (wobble(v * 0.3, 9) * 0.5 + wobble(v * 7, 8) * 0.6 * sh) * DEG;
  const b = beatAt(v);
  let punch = 0;
  if (b && !window.__cover) { punch = smooth(0, 0.05, b.dt) * Math.exp(-Math.max(0, b.dt - 0.05) * 5); pitch += punch * 0.6 * DEG; }
  camera.position.set(x, y, z);
  camera.rotation.set(pitch, yaw, roll);
  camera.fov = spline(FOV, v) * (1 - 0.04 * punch);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // is the Sun behind the wave yet (seen from the camera)? Then the light goes cold and dim
  const crest = Math.atan2(s.level + s.H - y, Math.max(1, z - s.front + 0.5 * s.H));
  const sunVis = 1 - smooth(sunEl - 0.5 * DEG, sunEl + 0.8 * DEG, crest);
  s.shade = 1 - sunVis;

  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / (WIDE ? RH * 16 / 9 : RH);
  u.uTime.value = v; u.uShift.value = v * 3; u.uDust.value = 0; u.uCamY.value = y;
  fogC.copy(FOG0).lerp(FOGS, s.shade);
  const fogD = 0.00005 + 0.0002 * s.spray;
  scene.fog.color.copy(fogC); scene.fog.density = fogD;
  world.glows.mat.uniforms.uFogD.value = fogD;
  world.harbour.u.uFogC.value.copy(fogC); world.harbour.u.uFogD.value = fogD;
  world.harbour.u.uLight.value = 1 - 0.35 * s.shade;
  world.sun.intensity = 3.0 * sunVis;
  world.hemi.intensity = 1.3 - 0.35 * s.shade;
  world.hemi.color.setRGB(0.6, 0.69, 0.86).lerp(tmp.setRGB(0.55, 0.62, 0.7), s.shade);
  world.smoke.mat.uniforms.uTime.value = v;
  world.smoke.mat.uniforms.uSun.value.copy(world.sunDir);
  world.smoke.mat.uniforms.uLight.value.setRGB(1.6, 1.45, 1.35).multiplyScalar(1 - 0.35 * s.shade);   // (spray: near white)

  world.frame(v, s, camera);

  renderer.toneMappingExposure = 1.2 - 0.15 * s.shade;
  finish.uniforms.uAb.value = 0.3 * sh + punch * 1.2;
  finish.uniforms.uCool.value = s.shade;
  finish.uniforms.uFoam.value = s.foam || 0; finish.uniforms.uT.value = v;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : (1 - s.flash) * 0.9;

  overlay(v, s, v);
  {
    v3.set(YOU.x, 2.05, YOU.z).project(camera);
    const a = window.__cover || v3.z > 1 ? 0 : s.you * (1 - s.flash);
    youEl.style.opacity = a.toFixed(3);
    if (a > 0) {
      const sx = (v3.x * 0.5 + 0.5) * W, sy = (-v3.y * 0.5 + 0.5) * H;
      youEl.style.left = `${(sx - 120).toFixed(1)}px`;
      youEl.style.top = `${(sy - 112).toFixed(1)}px`;
    }
  }
  {
    const a = b && !window.__cover ? smooth(0, 0.06, b.dt) * (1 - smooth(1.3, 1.8, b.dt)) * (1 - s.flash) : 0;
    stampEl.style.opacity = a.toFixed(3);
    stampW.style.opacity = a.toFixed(3);
    if (a > 0) {
      if (stampEl.textContent !== b.text) stampEl.textContent = b.text;
      if (stampW.textContent !== b.label) stampW.textContent = b.label;
      stampEl.style.fontSize = `${((b.small ? 110 : 138) * (1 + 0.3 * Math.exp(-b.dt * 9))).toFixed(1)}px`;
    }
  }
  return s;
}

let comp = null;
// The last LOOP seconds replay the moments just before the first frame while the white foam clears.
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
  for (const t of [58, 45, 30, 20, 10, 0]) renderFrame(t);
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
  let t = Number(params.get('still') ?? params.get('t') ?? 0);
  let playing = !params.has('still');
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

boot().catch((e) => { console.error(e); window.__error = String((e && e.stack) || e); });

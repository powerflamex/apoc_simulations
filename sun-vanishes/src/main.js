import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeWorld, CAM_BASE } from './world.js';
import { makeOverlay } from './overlay.js';
import { state, DURATION, STORY_START, VIDEO_DURATION, LOOP, GRID, gridBrown } from './timeline.js';
import { DEG, lerp, smooth, wobble, keys } from './util.js';
import { G } from './bend.js';
import { makeCompositor } from './compose.js';

// ?wide=1: a 1920x1080 version for the long-form compilation (same story, wider frame)
const WIDE = new URLSearchParams(location.search).has('wide');
const W = WIDE ? 1920 : 1080, H = WIDE ? 1080 : 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x8899aa, 0.0001);
const camera = new THREE.PerspectiveCamera(62, W / H, 0.05, 60000);
camera.rotation.order = 'YXZ';

const sky = makeSky();
scene.add(sky.mesh);
const world = makeWorld(scene);
const overlay = makeOverlay();

const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.4, 0.45, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
// grain, vignette, and frost creeping over the lens at the end
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uGrain: { value: params.has('grain') ? 0.026 : 0 }, uVig: { value: 0.3 }, uFrost: { value: 0 }, uTitle: { value: 0 }, uIce: { value: 0 }, uCrack: { value: 0 }, uShatter: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uGrain; uniform float uVig; uniform float uFrost; uniform float uTitle; uniform float uIce; uniform float uCrack; uniform float uShatter;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
    float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * vn(p); p = p * 2.07 + 3.1; a *= 0.5; } return s; }
    void main() {
      vec2 c = vUv - 0.5;
      vec2 asp = vec2(1.0, ${H.toFixed(1)} / ${W.toFixed(1)});
      // frost: grows in from the edges along crystal-like noise
      vec2 fp = vUv * asp * 9.0;
      float crystal = fbm(fp) * 0.6 + fbm(fp * 3.7 + 9.0) * 0.4;
      float veins = pow(1.0 - abs(fbm(fp * 1.6 + 4.0) * 2.0 - 1.0), 6.0);
      // facets: voronoi cell edges at two scales
      float facet = 0.0;
      for (int k = 0; k < 2; k++) {
        vec2 q = fp * (k == 0 ? 1.4 : 4.3) + float(k) * 13.0;
        vec2 i = floor(q), f = fract(q);
        float d1 = 8.0, d2 = 8.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 g = vec2(x, y); vec2 o = vec2(h(i + g), h(i + g + 7.7));
          float d = length(g + o - f);
          if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
        }
        facet += smoothstep(0.08, 0.0, d2 - d1) * (k == 0 ? 0.6 : 0.4);
      }
      float edge = max(abs(c.x) * 2.0, abs(c.y) * 2.0);
      float reach = uFrost * 1.1;
      float mask = smoothstep(1.0 - reach, 1.0 - reach + 0.3, edge + (crystal - 0.5) * 0.35 + veins * 0.08);
      mask *= step(0.001, uFrost);
      vec2 off = (vec2(vn(fp * 2.0), vn(fp * 2.0 + 5.0)) - 0.5) * 0.02 * mask;
      vec3 col = texture2D(tDiffuse, vUv + off).rgb;
      vec3 blur = (texture2D(tDiffuse, vUv + off + vec2(0.006, 0.0)).rgb + texture2D(tDiffuse, vUv + off - vec2(0.006, 0.0)).rgb +
                   texture2D(tDiffuse, vUv + off + vec2(0.0, 0.004)).rgb + texture2D(tDiffuse, vUv + off - vec2(0.0, 0.004)).rgb) * 0.25;
      vec3 frost = blur * 0.5 + vec3(0.24, 0.29, 0.36) * (0.4 + 0.6 * crystal) + vec3(0.5, 0.58, 0.68) * (facet * 0.3 + veins * 0.3);
      col = mix(col, frost, mask * 0.92);
      // a soft dark band behind the opening title so it reads on any sky
      col *= 1.0 - uTitle * 0.45 * exp(-pow((vUv.y - 0.69) / 0.095, 2.0));
      // the end: the frost closes into solid ice, cracks out from the middle, then shatters away; the video
      // loops into its first frame underneath (the shards shrink and drop, each inside its own cell)
      if (uIce > 0.0) {
        vec3 ice = vec3(0.50, 0.59, 0.67) * (0.62 + 0.38 * crystal) + vec3(0.78, 0.85, 0.92) * (facet * 0.3 + veins * 0.25);
        const float CELLS = 4.2;
        vec2 sp = vUv * asp * CELLS;
        vec2 hit = vec2(0.5, 0.57) * asp * CELLS;
        vec2 si = floor(sp);
        float d1 = 8.0, d2 = 8.0; vec2 cid = vec2(0.0), cpt = vec2(0.0);
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 g = si + vec2(x, y);
          vec2 pt = g + 0.15 + 0.7 * vec2(h(g + 3.3), h(g + 9.1));
          float d = length(pt - sp);
          if (d < d1) { d2 = d1; d1 = d; cid = g; cpt = pt; } else if (d < d2) d2 = d;
        }
        float hd = length(cpt - hit);
        // cracks run out from the hit point along the shard edges
        float crack = smoothstep(0.035, 0.0, d2 - d1) * smoothstep(uCrack * 5.2, uCrack * 5.2 - 0.4, length(sp - hit));
        float alpha = 1.0, glint = 0.0;
        if (uShatter > 0.0) {
          float ts = 0.05 + 0.5 * clamp(hd / 4.6, 0.0, 1.0) + 0.1 * h(cid + 1.7);
          float lp = clamp((uShatter - ts) / 0.35, 0.0, 1.0);
          float sc = max(1.0 - lp, 1e-3);
          vec2 q = cpt + (sp + vec2(0.0, 0.12 * lp * lp) - cpt) / sc;   // back to where this point of the shard started
          vec2 qi = floor(q);
          float e1 = 8.0, e2 = 8.0; vec2 qid = vec2(-99.0);
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            vec2 g = qi + vec2(x, y);
            vec2 pt = g + 0.15 + 0.7 * vec2(h(g + 3.3), h(g + 9.1));
            float d = length(pt - q);
            if (d < e1) { e2 = e1; e1 = d; qid = g; } else if (d < e2) e2 = d;
          }
          alpha = (all(equal(qid, cid)) ? 1.0 : 0.0) * (1.0 - smoothstep(0.65, 1.0, lp));
          float loose = smoothstep(0.0, 0.15, lp);
          glint = smoothstep(0.05, 0.0, e2 - e1) * loose;                       // bright broken edges
          ice *= 1.0 + (0.3 * h(cid + 5.5) - 0.15 + 0.25 * lp) * loose;        // each shard tilts and catches the light
          crack *= 1.0 - loose;                                               // cracks stay until the shard breaks loose
        }
        ice += vec3(0.85, 0.92, 1.0) * (crack * 0.9 + glint * 0.6);
        col = mix(col, ice, clamp(uIce * alpha, 0.0, 1.0));
      }
      float v = 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= v;
      col += (h(vUv * 1920.0 + fract(uTime * 7.13) * 100.0) - 0.5) * uGrain;   // film grain: off by default, it wrecks TikTok/YouTube compression
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ----- story -> scene -----
const dirFromAzEl = (az, el) => new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
const SUN_DIR = dirFromAzEl(-6 * DEG, 19 * DEG);
// facing west at ~34°N: the celestial pole is up and to the right (north)
const POLE = new THREE.Vector3(Math.cos(34 * DEG), Math.sin(34 * DEG), 0).normalize();
const VENUS = dirFromAzEl(-11 * DEG, 8 * DEG);
const JUPITER = dirFromAzEl(10 * DEG, 21 * DEG);
const SATURN = dirFromAzEl(-15 * DEG, 13 * DEG);
const ctx = { sunDir: SUN_DIR.clone(), fogColor: new THREE.Color(), city: 0 };

function update(t, cover = -1) {
  const s = state(t);
  if (cover >= 0) {   // loop tail: the ice shatters away from the first frame
    s.lensIce = 1; s.crack = 1; s.shatter = 1 - cover; s.hideText = 1 - smooth(0.4, 0.95, 1 - cover);
    s.fadeOut = 0; s.endcard = 0; s.endText = 0;
  }
  const day = s.day;
  // city glow on the horizon at night while the grid holds
  ctx.city = smooth(27, 32, t) * gridBrown(t) * (1 - smooth(GRID.t0, GRID.t0 + GRID.span, t));
  ctx.fogColor.setRGB(lerp(0.004, 0.52, day), lerp(0.006, 0.62, day), lerp(0.012, 0.78, day))
    .add(new THREE.Color(0.05, 0.03, 0.015).multiplyScalar(ctx.city))
    .add(new THREE.Color(0.02, 0.025, 0.035).multiplyScalar(s.snowFall));

  // camera: steady handheld phone
  camera.position.set(
    CAM_BASE.x + wobble(t * 0.35, 1) * 0.03,
    CAM_BASE.y + wobble(t * 0.4, 2) * 0.02,
    CAM_BASE.z + wobble(t * 0.3, 3) * 0.03,
  );
  const shiver = s.frost * 0.08 * DEG;
  // slow camera moves that follow the story (degrees; keys ease between points)
  const pan = keys([[14.5, -2.5], [22, 3], [25, -1.5], [33, 0]], t) * DEG;
  const tilt = keys([[14.5, -9.5], [22.5, -9], [25, -2], [27.5, -2.5], [33, -8.5], [42, -8], [48, -4], [55, -4], [62, -9]], t) * DEG;
  camera.rotation.set(
    tilt + wobble(t * 0.5, 4) * 0.12 * DEG + Math.sin(t * 37) * shiver,
    pan + wobble(t * 0.42, 5) * 0.18 * DEG + Math.sin(t * 29 + 1) * shiver,
    wobble(t * 0.37, 6) * 0.1 * DEG,
  );
  camera.fov = 62;
  if (WIDE) camera.fov = 2 * Math.atan(Math.tan(camera.fov * DEG / 2) * 0.62) / DEG;   // same scene, a wider and shorter frame
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  u.uTime.value = t;
  u.uDay.value = day;
  u.uCity.value = ctx.city;
  u.uSunCore.value = s.sunCore;
  u.uSunDir.value.copy(SUN_DIR);
  u.uStarVis.value = Math.pow(1 - day, 10);
  u.uRot.value = (s.hours / 24) * Math.PI * 2;
  u.uTrail.value = s.trail;
  u.uPole.value.copy(POLE);
  u.uPlanetA.value.copy(VENUS);
  u.uPlanetB.value.copy(JUPITER);
  u.uPlanetC.value.copy(SATURN);
  u.uPlanetVis.value.set(s.venus, s.jupiter, s.saturn);
  u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / H;
  u.uSnowHaze.value = s.snowFall * 0.6;

  world.frame(t, s, ctx);

  renderer.toneMappingExposure = s.exposure;
  bloom.strength = lerp(0.45, 0.22, day);
  finish.uniforms.uTime.value = t;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uFrost.value = s.frost;
  finish.uniforms.uIce.value = s.lensIce;
  finish.uniforms.uCrack.value = s.crack;
  finish.uniforms.uShatter.value = s.shatter;

  overlay(t, s);
  return s;
}

let comp = null;
// t is video time; the story starts STORY_START seconds in. The last LOOP seconds replay the moments just
// before the first frame while the ice shatters away, so the video loops seamlessly.
function renderFrame(t) {
  const tail = t - (VIDEO_DURATION - LOOP);
  if (tail >= 0) update(t - VIDEO_DURATION + STORY_START, 1 - smooth(0, LOOP * 0.92, tail));
  else update(t + STORY_START);
  if (world.beforeRender) world.beforeRender(renderer, camera, sky.mesh);
  composer.render();
  if (comp) comp.paint();
}

async function boot() {
  await document.fonts.load('500 40px Cormorant');
  await document.fonts.load('italic 500 40px Cormorant');
  await document.fonts.load('600 40px Cormorant');
  await document.fonts.ready;
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  renderFrame(60);
  renderFrame(0);
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.DURATION = VIDEO_DURATION;
  window.__dbg = { G, scene, camera, renderer, composer };
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

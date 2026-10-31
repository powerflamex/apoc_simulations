import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeWorld } from './world.js';
import { makeOverlay } from './overlay.js';
import { H } from './heat.js';
import { BU } from './buildings.js';
import { state, VIDEO_DURATION, LOOP, LAND } from './timeline.js';
import { lookAt } from './looks.js';
import { CAM0, STAR_POS, landY } from './layout.js';
import { DEG, lerp, smooth, wobble, clamp } from './util.js';
import { makeCompositor } from './compose.js';

const W = 1080, H_ = 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));
const RW = Math.round(W * RES), RH = Math.round(H_ * RES);

const stage = document.getElementById('stage');
// plain depth buffer (street scale near, the mountains far off; the sea handles its own shoreline)
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, logarithmicDepthBuffer: false });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(new THREE.Color(0.78, 0.84, 0.92), 0.00006);
const FOV = 60;
const camera = new THREE.PerspectiveCamera(FOV, W / H_, 0.4, 120000);
camera.rotation.order = 'YXZ';
scene.add(camera);
const sky = makeSky();
scene.add(sky.mesh);
const world = makeWorld(scene);
const overlay = makeOverlay();

// post: MSAA -> bloom -> tone map -> heat shimmer, grade, vignette, bands behind the title and the picker
const rt = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(RW, RH);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.3, 0.5, 1.6);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.28 }, uTitle: { value: 0 }, uPick: { value: 0 },
    uHeat: { value: 0 }, uAb: { value: 0 }, uWarm: { value: 0 }, uCold: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uPick;
    uniform float uHeat; uniform float uAb; uniform float uWarm; uniform float uCold;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
    void main() {
      vec2 uv = vUv;
      // heat shimmer, strongest low in the frame
      if (uHeat > 0.0) {
        float k = uHeat * (0.4 + 0.6 * smoothstep(0.75, 0.2, vUv.y));
        uv += vec2(vn(vec2(uv.x * 26.0, uv.y * 14.0 - uTime * 3.0)) - 0.5, vn(vec2(uv.x * 22.0 + 3.0, uv.y * 12.0 - uTime * 2.6)) - 0.5) * 0.007 * k;
      }
      vec2 c = vUv - 0.5;
      vec2 off = c * uAb * 0.012;
      vec3 col = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      col = mix(col, col * vec3(1.12, 0.92, 0.72), uWarm);
      // the frost at the edges of the frame (Proxima)
      float edge = smoothstep(0.35, 0.8, length(c * vec2(1.0, 0.6)) * 1.6 + 0.25 * (vn(vUv * vec2(9.0, 16.0)) - 0.5));
      float crys = 0.75 + 0.25 * vn(vUv * vec2(40.0, 71.0)) * vn(vUv * vec2(23.0, 41.0) + 3.0);
      col = mix(col, vec3(0.78, 0.85, 0.93) * crys, uCold * edge * 0.3);
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.18 + uWarm * 0.4);
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.45 * exp(-pow((vUv.y - 0.84) / 0.085, 2.0));
      col *= 1.0 - uPick * 0.34 * exp(-pow((vUv.y - 0.665) / 0.1, 2.0));
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

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
// The camera (video time). You open standing on the sand among the towels at eye height, looking out to sea at the
// star, the pier and its wheel on the right. People run past you (Sirius); you walk down toward the water as it steams
// (Vega); look right at the burning pier, rising (Arcturus); turn round to the melting city (Aldebaran) and back; rise
// like a drone over the drained bay under Rigel; and tilt up into Betelgeuse.
const L = LAND;
const X0 = CAM0.x;
const XX = [[-4, X0], [0, X0], [L.sirius, X0 - 1.2], [L.sirius + 2.2, X0 - 1.3], [L.vega - 0.5, X0 - 4], [L.vega + 4, X0 - 9], [L.arcturus, X0 - 12], [L.arcturus + 4, X0 - 14], [L.aldebaran, X0 - 15], [L.aldebaran + 6, X0 - 15], [L.rigel, X0 - 16], [L.rigel + 5, X0 - 30], [L.betelgeuse, X0 - 40], [64, X0 - 46]];
const HH = [[-4, CAM0.eye], [0, CAM0.eye], [L.proxima + 0.9, CAM0.eye], [L.proxima + 5.5, 5.2], [L.sirius + 0.6, 5.4], [L.sirius + 5, 3.6], [L.vega + 1, 3.0], [L.arcturus + 1, 2.6], [L.arcturus + 4.5, 9], [L.aldebaran, 11], [L.aldebaran + 3, 16], [L.rigel, 18], [L.rigel + 4, 45], [L.rigel + 8, 75], [L.betelgeuse, 85], [64, 95]];
const BB = [[-4, 13], [0, 13], [L.sirius, 12], [L.vega, 11], [L.vega + 0.3, 12], [L.vega + 1.3, 92], [L.vega + 2.3, 88], [L.vega + 3.3, 13], [L.vega + 6.6, 11], [L.arcturus + 0.6, 10], [L.arcturus + 2.6, 15], [L.arcturus + 4.6, 27], [L.arcturus + 6.6, 26], [L.aldebaran, 12],
  [L.aldebaran + 0.9, 11], [L.aldebaran + 2.3, 70], [L.aldebaran + 3.6, 152], [L.aldebaran + 5.6, 166], [L.aldebaran + 6.6, 150], [L.rigel - 0.3, 22], [L.rigel + 0.3, 11], [L.rigel + 5, 9], [L.betelgeuse, 9], [64, 9]];
const PP = [[-4, 3.2], [0, 3.2], [L.proxima + 0.5, 3.0], [L.proxima + 5.5, -1.5], [L.sirius, -1.0], [L.sirius + 5, 1.5], [L.vega - 1, 2.6], [L.vega + 3, 0.5], [L.vega + 5, 0.5], [L.arcturus + 1, 3], [L.arcturus + 4.5, 1], [L.arcturus + 6.6, 0.5], [L.aldebaran, 3],
  [L.aldebaran + 1, 3], [L.aldebaran + 3, -1.5], [L.aldebaran + 5.6, -2], [L.aldebaran + 6.6, -1], [L.rigel - 0.3, 3], [L.rigel + 0.5, 6], [L.rigel + 4, 9], [L.rigel + 8, 8], [L.betelgeuse, 8], [L.betelgeuse + 2, 12], [L.betelgeuse + 5, 30], [64, 34]];

// the lens: zoomed in on the burning pier (Arcturus) and on the melting city (Aldebaran)
const FF = [[-4, 60], [L.arcturus + 1.5, 60], [L.arcturus + 4.5, 42], [L.arcturus + 6.6, 42], [L.aldebaran + 0.2, 60], [L.aldebaran + 1.6, 60], [L.aldebaran + 3.6, 34], [L.aldebaran + 6.0, 34], [L.aldebaran + 7.0, 60], [64, 60]];
const dirOf = (b, el) => new THREE.Vector3(-Math.cos(b * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), -Math.sin(b * DEG) * Math.cos(el * DEG));
const STAR_DIR = dirOf(STAR_POS.b, STAR_POS.el);
const HEAT_DIR = dirOf(STAR_POS.b, 42);          // (what heats: the star as if high in the sky, so the ground heats too)
const col = (a) => new THREE.Color(a[0], a[1], a[2]);
const tmpC = new THREE.Color();

function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) s.flash = Math.max(s.flash, cover);
  const lk = lookAt(s.prev.key, s.star.key, s.sw);
  s.nightL = lk.nightL;

  // ---------- camera ----------
  const cx = spline(XX, v);
  let x = cx, z = CAM0.z - (CAM0.x - cx) * Math.tan(CAM0.b * DEG);
  let y = landY(Math.max(cx, 1), z) + spline(HH, v);
  const B = spline(BB, v);
  s.camB = B * DEG;
  let yaw = (90 - B) * DEG, pitch = spline(PP, v) * DEG, roll = 0;
  const hand = 1 + 0.6 * smooth(L.arcturus + 2, L.arcturus + 5, v);
  x += wobble(v * 0.5, 2) * 0.04 * hand; y += wobble(v * 0.4, 3) * 0.03 * hand;
  yaw += wobble(v * 0.35, 5) * 0.25 * DEG; pitch += wobble(v * 0.3, 7) * 0.2 * DEG; roll += wobble(v * 0.27, 9) * 0.3 * DEG;
  // each landing: a jolt (harder for the bigger stars); Betelgeuse: shaking
  const big = [0, 0.6, 0.9, 1, 1.3, 1.5, 1.9, 2.4][s.i] || 0;
  const punch = window.__cover ? 0 : s.snap * big;
  pitch -= punch * 0.7 * DEG; roll += punch * 0.5 * DEG * Math.sin(v * 31);
  const sh = s.inside * (1 - 0.5 * s.cover);
  x += wobble(v * 13, 1) * 0.5 * sh; y += wobble(v * 11, 4) * 0.5 * sh;
  pitch += wobble(v * 17, 6) * 1.0 * DEG * sh; roll += wobble(v * 9, 8) * 1.6 * DEG * sh;
  camera.position.set(x, y, z);
  camera.rotation.set(pitch, yaw, roll);
  camera.fov = spline(FF, v) * (1 - 0.03 * punch) * (1 + 0.08 * sh);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // ---------- the star, the sky ----------
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  u.uSun.value.copy(STAR_DIR);
  const a0 = s.prev.key === 'betelgeuse' ? 0.4 : s.prev.ang, a1 = s.star.key === 'betelgeuse' ? 0.4 : s.star.ang;
  u.uAng.value = Math.exp(lerp(Math.log(a0), Math.log(a1), s.sw));
  u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / RH;
  u.uT.value = v;
  u.uStarCol.value.setRGB(...lk.star); u.uStarI.value = lk.starI; u.uGran.value = lk.gran;
  u.uGlare.value = lk.glare * (1 + 0.6 * s.snap); u.uGlareCol.value.setRGB(...lk.glareCol);
  u.uTop.value.setRGB(...lk.top); u.uLow.value.setRGB(...lk.low); u.uNear.value.setRGB(...lk.near);
  u.uNight.value = lk.night; u.uCloud.value = lk.cloud; u.uDrift.value = v * 4;
  u.uSmoke.value = s.smoke * 0.35 * (1 - s.inside); u.uDark.value = s.smoke * 0.35 * (1 - s.inside);
  u.uInside.value = s.inside;
  // ---------- the light ----------
  const sun = world.sun;
  sun.color.setRGB(...lk.light);
  sun.intensity = lk.li * (1 + 0.8 * s.snap * (s.i > 1 ? 1 : 0));
  const sp = camera.position;
  sun.position.set(sp.x + STAR_DIR.x * 1500, STAR_DIR.y * 1500 + 2, sp.z + STAR_DIR.z * 1500);
  sun.target.position.set(sp.x - 50 * Math.sin(yaw), 0, sp.z - 50 * Math.cos(yaw));
  sun.shadow.camera.updateProjectionMatrix();
  world.hemi.color.setRGB(...lk.hemiSky);
  world.hemi.groundColor.setRGB(...lk.hemiGnd).lerp(tmpC.setRGB(1.0, 0.45, 0.15), s.melt * 0.6);
  world.hemi.intensity = lk.hi;
  scene.fog.color.setRGB(...lk.fog).lerp(tmpC.setRGB(0.55, 0.38, 0.25), s.smoke * 0.3 * (1 - s.inside));
  scene.fog.density = lk.fogD + 0.00004 * s.smoke + 0.0015 * s.vapor;
  // heat and cold on every surface
  H.uSunW.value.copy(HEAT_DIR);
  H.uTK.value = s.heatK;
  H.uAmbK.value = s.ambK;
  H.uGlowGain.value = 2.2 + 1.2 * smooth(L.rigel, L.rigel + 6, v);
  H.uCharK.value = 1;
  H.uFrost.value = s.cold;
  BU.uWhiteB.value = lk.exp < 0.7 ? 1 : 0;
  // the sea's mirror
  const su = world.sea.u;
  su.uTime.value = v;
  su.uWaveT.value = waveClock(v);
  su.uSun.value.copy(STAR_DIR);
  su.uSunR.value = u.uAng.value;
  su.uSunI.value = lk.glint * (1 - 0.5 * s.smoke);
  su.uSunCol.value.setRGB(...lk.star);
  su.uSkyHi.value.setRGB(...lk.seaHi);
  su.uSkyLo.value.setRGB(...lk.seaLo);
  su.uDirC.value.setRGB(...lk.light).multiplyScalar(lk.li);
  su.uAmbC.value.setRGB(...lk.hemiSky).multiplyScalar(lk.hi);
  su.uBright.value = lk.bright;
  su.uPx.value = u.uPx.value;
  su.uGlow.value = s.melt;

  world.fire.mat.uniforms.uOcc.value = 0.6;
  // smoke and steam lit by the star and the sky
  world.smoke.mat.uniforms.uLight.value.setRGB(...lk.light).multiplyScalar(lk.li * 0.22).add(tmpC.setRGB(...lk.hemiSky).multiplyScalar(lk.hi * 0.45));
  world.smoke.mat.uniforms.uSun.value.copy(STAR_DIR);
  world.frame(v, s, camera);

  renderer.toneMappingExposure = lk.exp * (1 + 0.25 * s.snap * (s.i > 1 ? 1 : 0));
  bloom.strength = 0.22 + 0.1 * lk.glare + 0.1 * s.melt + 0.1 * s.inside;
  bloom.threshold = 2.2;
  finish.uniforms.uTime.value = v;
  finish.uniforms.uHeat.value = clamp(smooth(500, 800, s.heatK) * 0.25 + 0.2 * smooth(900, 2000, s.heatK) + 0.4 * s.inside);
  finish.uniforms.uAb.value = punch * 0.8 + sh * 1.2;
  finish.uniforms.uWarm.value = Math.max(0.35 * s.melt, 0.25 * s.inside, 0.15 * s.smoke * (1 - s.inside));
  finish.uniforms.uCold.value = s.cold;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uPick.value = window.__cover ? 0 : (1 - s.flash) * 0.9;

  overlay(v, s);
  return s;
}
// the waves' clock: real time, slowing to a stop as the sea freezes (Proxima), back to real time as it thaws (Sirius)
const WAVE = (() => {
  const dt = 1 / 120, t0 = -10, n = Math.ceil((70 - t0) / dt);
  const c = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) {
    const t = t0 + (i - 0.5) * dt;
    const rate = 1 - smooth(L.proxima, L.proxima + 1.2, t) * (1 - smooth(L.sirius + 0.6, L.sirius + 3.0, t));
    c[i] = c[i - 1] + rate * dt;
  }
  return { c, t0, dt, n };
})();
function waveClock(v) {
  const x = (v - WAVE.t0) / WAVE.dt, i = Math.max(0, Math.min(WAVE.n - 1, Math.floor(x)));
  return WAVE.c[i] + (WAVE.c[i + 1] - WAVE.c[i]) * (x - i) + WAVE.t0;
}

let comp = null;
// t is video time. The last LOOP seconds replay the moments just before the first frame while the cover clears,
// so the video loops seamlessly.
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
  await document.fonts.load('700 40px Cormorant');
  await document.fonts.ready;
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  for (const t of [55, 45, 36, 27, 19, 10, 2, 0]) renderFrame(t);   // compile everything once
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
  const fit = () => { stage.style.transform = `scale(${Math.min(innerWidth / W, innerHeight / H_)})`; };
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

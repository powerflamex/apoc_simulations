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
import { state, beatAt, popupAt, POP, VIDEO_DURATION, LOOP, V_FLASH, V_BLAST, T_FLASH, T_BLAST, storyT } from './timeline.js';
import { CAM, CAM0, SUN_PATH, arcXZ, Y, sandY } from './layout.js';
import { DEG, lerp, smooth, wobble, clamp } from './util.js';
import { makeCompositor } from './compose.js';

const W = 1080, H_ = 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));
const RW = Math.round(W * RES), RH = Math.round(H_ * RES);

const stage = document.getElementById('stage');
// plain depth buffer (street scale near, the hills a few km off; the sea plane handles its own shoreline)
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, logarithmicDepthBuffer: false });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(new THREE.Color(0.78, 0.84, 0.92), 0.00012);
const FOV = 60;
const camera = new THREE.PerspectiveCamera(FOV, W / H_, 0.5, 90000);
camera.rotation.order = 'YXZ';
scene.add(camera);
const sky = makeSky();
scene.add(sky.mesh);
const world = makeWorld(scene);
const overlay = makeOverlay();
const stampEl = document.getElementById('stamp');
const stampW = document.getElementById('stampw');

// post: MSAA -> bloom -> tone map -> heat shimmer, grade, vignette, bands behind the title and the counter
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
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.28 }, uTitle: { value: 0 }, uCounter: { value: 0 },
    uHeat: { value: 0 }, uAb: { value: 0 }, uWarm: { value: 0 }, uBleach: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uHeat; uniform float uAb; uniform float uWarm; uniform float uBleach;
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
      // the harsh light: contrast up, colour drained (bleach), then the furnace orange
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, mix(vec3(lum), col, 0.72) * 1.04, uBleach);
      col = mix(col, col * vec3(1.12, 0.92, 0.72), uWarm);
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.22);
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.45 * exp(-pow((vUv.y - 0.69) / 0.1, 2.0));
      col *= 1.0 - uCounter * 0.3 * exp(-pow((vUv.y - 0.53) / 0.065, 2.0)) * smoothstep(0.85, 0.2, vUv.x);
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
// The camera (video time). You open standing on the sand in the middle of the crowd, at eye height, looking out to sea
// and the Sun; the people run up the beach past you as the light lands, the towels and umbrellas around you smoke and
// catch fire. Then you rise and pull back onto the promenade (just after 0:12), turn to the avenue (the cars, the
// towers), back to the sea as it boils; then it rises like a drone over the beach to watch the sea drain away, higher
// over the burning city as the towers fall, and finally tilts up into the fireball.
const SAND = CAM0.eye + sandY(CAM0.d) - Y.prom;   // eye height on the sand, above the promenade's level
const PHI = [[-4, 0.0017], [9, 0.0017], [12, 0.0017], [16, 0.0021], [24, 0.0025], [32, 0.003], [40, 0.0036], [48, 0.0046], [56, 0.006], [64, 0.0065]];
const DD = [[-4, CAM0.d + 1.4], [0, CAM0.d + 1], [8, CAM0.d - 1], [11, CAM0.d - 1.6], [13.5, CAM0.d + 1], [16, CAM0.d + 20], [18.5, CAM.d - 1], [26, CAM.d - 2.5], [34, CAM.d - 10], [42, CAM.d - 40], [50, CAM.d - 60], [58, CAM.d - 70], [64, CAM.d - 72]];
const HH = [[-4, SAND], [0, SAND], [8, SAND], [11, SAND], [13.5, CAM.h - 0.6], [16, CAM.h + 0.6], [20, CAM.h + 0.6], [28, CAM.h + 2], [33, CAM.h + 8], [38, 30], [44, 70], [50, 120], [56, 170], [64, 200]];
const YAW = [[-4, CAM0.yaw], [0, CAM0.yaw], [8, CAM0.yaw - 1], [11, CAM0.yaw - 3], [13.5, 40], [17, 8], [21, -30], [24.5, -38], [27.5, 0], [31, 26], [34, 18], [38, 10], [42, 6], [46, 4], [48.7, 6], [51, 48], [54.6, 56], [57.4, -12], [60, -10], [64, -6]];
const PITCH = [[-4, -6], [0, -6], [8, -6], [11, -6.5], [14, -10], [17, -7], [21, -5], [25, -3], [28, -8], [32, -9], [36, -12], [42, -14], [46, -6], [48.7, 4], [51, -2], [54.6, 0], [57.4, 20], [60, 34], [64, 40]];

const sunDirAt = (T) => {
  const k = clamp((T - T_FLASH) / (T_BLAST - T_FLASH));
  const az = lerp(SUN_PATH.az0, SUN_PATH.az1, k) * DEG, el = lerp(SUN_PATH.el0, SUN_PATH.el1, k) * DEG;
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
};
// Mercury and Venus: fixed angles from the Sun's centre, toward the lower left (they ride the sky with it)
const planetDir = (sd, angDeg, tiltDeg) => {
  const left = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), sd).normalize();   // to the left of the Sun
  const upT = new THREE.Vector3().crossVectors(sd, left).normalize();
  const off = left.clone().multiplyScalar(Math.cos(tiltDeg * DEG)).addScaledVector(upT, Math.sin(tiltDeg * DEG)).normalize();
  const a = angDeg * DEG;
  return sd.clone().multiplyScalar(Math.cos(a)).addScaledVector(off, Math.sin(a)).normalize();
};

const tmpC = new THREE.Color();
function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) s.flash = Math.max(s.flash, cover);
  const T = s.T;
  const open = 1 - smooth(14, 22, v);     // the opening's harder, more colourful look (back to the old grade by 0:22)
  const hot = smooth(500, 600, T) * open;  // the light gets harsher through the opening

  // ---------- camera ----------
  const phi = spline(PHI, v), d = spline(DD, v);
  const c = arcXZ(phi, d);
  let x = c.x, z = c.z, y = Y.prom + spline(HH, v);
  let yaw = -spline(YAW, v) * DEG, pitch = spline(PITCH, v) * DEG, roll = 0;
  const hand = 1 + 0.5 * smooth(33, 40, v);
  x += wobble(v * 0.5, 2) * 0.05 * hand; y += wobble(v * 0.4, 3) * 0.04 * hand;
  yaw += wobble(v * 0.35, 5) * 0.3 * DEG; pitch += wobble(v * 0.3, 7) * 0.25 * DEG; roll += wobble(v * 0.27, 9) * 0.35 * DEG;
  // the flash: a flinch of the camera; each beat: a jolt
  const fl = s.flashHit;
  pitch -= fl * 1.6 * DEG;
  const b = beatAt(v);
  let punch = 0;
  if (b && !window.__cover) {
    punch = smooth(0, 0.05, b.dt) * Math.exp(-Math.max(0, b.dt - 0.05) * 5);
    pitch -= punch * 0.8 * DEG; roll += punch * 0.6 * DEG * Math.sin(v * 31);
  }
  // the blast: shaking, everything thrown back
  const bl = s.blast;
  x += wobble(v * 13, 1) * 0.6 * bl; y += wobble(v * 11, 4) * 0.6 * bl;
  pitch += wobble(v * 17, 6) * 1.2 * DEG * bl; roll += wobble(v * 9, 8) * 2.0 * DEG * bl;
  camera.position.set(x, y, z);
  camera.rotation.set(pitch, yaw, roll);
  camera.fov = FOV * (1 - 0.035 * punch) * (1 + 0.12 * bl);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // ---------- the Sun, the sky, the light ----------
  const sd = sunDirAt(T);
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  u.uSun.value.copy(sd);
  u.uAng.value = s.ang;
  u.uDisk.value = smooth(0.006, 0.02, s.ang);          // the fireball's face shows once it's big enough to see
  u.uLit.value = s.lit;
  u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / RH;
  u.uTime.value = v; u.uT.value = v * 0.6 + T * 0.0004;
  u.uWhite.value = s.lit * (0.18 + 0.15 * smooth(700, 4000, T)) * (1 - 0.4 * s.hazeSteam) * (1 - 0.65 * open);
  u.uDark.value = smooth(1200, 5000, T) * (1 - smooth(V_BLAST - 2, V_BLAST, v));
  u.uSmoke.value = smooth(620, 1500, T) * 0.6 * (1 - 0.5 * s.melt);
  u.uHaze.value = s.hazeSteam * 0.3;
  u.uGlare.value = s.lit * (0.25 + 0.75 * smooth(500, 3000, T));
  u.uBlast.value = smooth(V_BLAST - 1.4, V_BLAST, v);
  u.uCloud.value = 1 - smooth(510, 700, T);
  u.uDrift.value = v * 3 + (T - 498) * 3;
  const md = planetDir(sd, 21.4, -32), vd = planetDir(sd, 45.2, -32);
  u.uMerc.value.copy(md); u.uVen.value.copy(vd);
  u.uMercOn.value = s.mercury; u.uVenOn.value = s.venus;
  u.uPlanetI.value = s.lit * (0.6 + 0.4 * smooth(600, 3000, T)) * smooth(-0.02, 0.03, Math.min(md.y, 1));
  const sun = world.sun;
  // the light: warm and low before; after the flash a white-blue glare, harder and hotter as it grows
  const pre = 1 - s.lit;
  sun.color.setRGB(1.0, 0.86, 0.66).lerp(tmpC.setRGB(0.95, 0.97, 1.0), s.lit).lerp(tmpC.setRGB(1.0, 0.85, 0.65), s.hazeSteam * 0.4);
  sun.intensity = (pre * 2.9 + s.lit * (4.2 + 1.2 * smooth(600, 3000, T)) * (1 + 0.5 * hot) + fl * 6) * (1 - 0.7 * smooth(1500, 6000, T));
  const sp = camera.position;
  sun.position.set(sp.x + sd.x * 1500, sd.y * 1500, sp.z + sd.z * 1500);
  sun.target.position.set(sp.x - 55 * Math.sin(yaw), 0, sp.z - 55 * Math.cos(yaw));
  sun.shadow.camera.updateProjectionMatrix();
  world.hemi.color.setRGB(0.55, 0.7, 0.95).lerp(tmpC.setRGB(0.95, 0.95, 1.0), s.lit * 0.7).lerp(tmpC.setRGB(1.0, 0.75, 0.5), smooth(900, 4000, T) * 0.6);
  world.hemi.groundColor.setRGB(0.75, 0.62, 0.48).lerp(tmpC.setRGB(1.0, 0.45, 0.15), s.glow * 0.7);
  world.hemi.intensity = (0.55 + 0.25 * s.lit * (1 - open) - 0.12 * hot) * (1 - 0.6 * smooth(1500, 6000, T));   // (less fill: harsh black shadows)
  // the fog: morning haze, then smoke and steam
  scene.fog.color.setRGB(0.8, 0.85, 0.92).lerp(tmpC.setRGB(0.95, 0.95, 1.0), s.lit * 0.6 * (1 - 0.7 * open)).lerp(tmpC.setRGB(0.75, 0.55, 0.38), smooth(700, 2000, T) * 0.5).lerp(tmpC.setRGB(0.7, 0.45, 0.3), s.hazeSteam * 0.6);
  scene.fog.density = 0.00005 + 0.00006 * smooth(700, 2500, T) + 0.00006 * s.hazeSteam;
  // heat on every surface
  H.uSunW.value.copy(sd);
  H.uTK.value = s.tK;
  H.uAmbK.value = 300 + 500 * smooth(900, 2400, T) + 1400 * smooth(2400, 9000, T) + 2200 * smooth(9000, 14800, T);
  H.uGlowGain.value = 2.2 + 1.2 * smooth(1500, 9000, T);
  H.uCharK.value = s.lit;
  BU.uWhiteB.value = s.lit;
  // the sea's mirror
  const su = world.sea.u;
  su.uSun.value.copy(sd);
  su.uSunR.value = s.ang;
  su.uSunI.value = (pre * 5 + s.lit * (9 + 4 * smooth(600, 3000, T))) * (1 - 0.5 * s.hazeSteam);
  su.uSunCol.value.setRGB(1.0, 0.88, 0.7).lerp(tmpC.setRGB(1, 1, 1), s.lit);
  su.uSkyHi.value.setRGB(0.32, 0.52, 0.82).lerp(tmpC.setRGB(0.6, 0.72, 0.95), s.lit * 0.6 * (1 - 0.8 * open)).lerp(tmpC.setRGB(0.6, 0.38, 0.22), smooth(1200, 5000, T) * 0.8);
  su.uSkyLo.value.setRGB(0.78, 0.83, 0.9).lerp(tmpC.setRGB(0.9, 0.93, 1.0), s.lit * 0.5 * (1 - 0.8 * open)).lerp(tmpC.setRGB(0.25, 0.45, 0.72), 0.5 * open).lerp(tmpC.setRGB(0.55, 0.36, 0.22), smooth(1200, 5000, T) * 0.8);
  su.uPx.value = u.uPx.value;
  su.uGlow.value = s.glow;

  world.fire.mat.uniforms.uOcc.value = 0.8 * open;
  world.smoke.mat.uniforms.uLight.value.setScalar(1 + 0.5 * open);   // (the steam off the surf reads white in the glare)
  world.frame(v, s, camera);

  renderer.toneMappingExposure = (1.0 - 0.2 * s.lit - 0.25 * hot + 0.1 * smooth(900, 3000, T)) * (1 + fl * 2.5);
  bloom.strength = 0.28 + 0.15 * s.lit + 0.12 * s.glow + 0.6 * s.blast;
  bloom.threshold = 1.6 + 0.6 * smooth(1500, 6000, T);
  finish.uniforms.uTime.value = v;
  finish.uniforms.uHeat.value = Math.max(smooth(560, 900, T) * 0.5, smooth(503, 560, T) * 0.4) + 0.5 * s.glow + bl;   // the sand shimmers
  finish.uniforms.uAb.value = punch * 1.2 + fl * 1.5 + bl * 1.5;
  finish.uniforms.uBleach.value = s.lit * 0.22 * (1 - 0.6 * s.glow) * (1 - 0.8 * open);
  finish.uniforms.uWarm.value = Math.max(s.glow * 0.55, 0.22 * smooth(540, 620, T) * open);   // the fire's orange
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : (1 - s.flash) * 0.9;

  overlay(v, s, v);
  // the gold popup: one phrase saying what just happened (never a number), sized to fit the width
  {
    const p = window.__cover ? null : popupAt(v);
    const a = p ? smooth(0, 0.06, p.dt) * (1 - smooth(POP - 0.35, POP, p.dt)) * (1 - s.flash) : 0;
    stampEl.style.opacity = a.toFixed(3);
    stampW.style.opacity = '0';
    if (a > 0) {
      if (stampEl.textContent !== p.say) stampEl.textContent = p.say;
      // a steady size (growing it for a "pop" made long phrases wrap to two lines for a few frames): it rises in instead
      const fit = Math.max(64, Math.min(118, 1700 / p.say.length));
      stampEl.style.fontSize = `${fit.toFixed(1)}px`;
      stampEl.style.transform = `translateY(${(22 * (1 - smooth(0, 0.18, p.dt))).toFixed(1)}px)`;
    }
  }

  return s;
}

let comp = null;
// t is video time. The last LOOP seconds replay the moments just before the first frame while the white clears,
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
  await document.fonts.ready;
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  for (const t of [62, 50, 35, 25, 12, 0]) renderFrame(t);   // compile everything once
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

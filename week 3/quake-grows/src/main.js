import { WIDE } from './wide.js';   // first: it changes how the scene camera frames 16:9
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeGround, GU } from './ground.js';
import { makeBuildings } from './buildings.js';
import { makeProps, tossY } from './props.js';
import { makeTraffic } from './traffic.js';
import { makeBay } from './bay.js';
import { makeCrowd } from './crowd.js';
import { PEOPLE, RIDERS, personPose, riderPose } from './people.js';
import { makeGlows } from './glows.js';
import { makeSmoke } from './smoke.js';
import { makePlanet, RE, SF } from './planet.js';
import { makeOverlay } from './overlay.js';
import { QU, quakeD, quakeMat } from './quake.js';
import { F } from './facade.js';
import { CAM0, SUN, streetY } from './layout.js';
import {
  STORY_START, state, beatAt, magAt, vAtMag, VIDEO_DURATION, LOOP, T_SWITCH, V_BREAK, V_PLANET, V_DUST, V_AIR, V_SPLIT, V_ROLL,
} from './timeline.js';
import { DEG, lerp, smooth, wobble, clamp, keys } from './util.js';
import { makeCompositor } from './compose.js';

const W = WIDE ? 1920 : 1080, H = WIDE ? 1080 : 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));
const RW = Math.round(W * RES), RH = Math.round(H * RES);

const stage = document.getElementById('stage');
// plain depth buffer (the city spans ~15 km; near 0.5 m keeps the precision)
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, logarithmicDepthBuffer: false });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const FOG0 = new THREE.Color(0.78, 0.62, 0.6), DUSTC = new THREE.Color(0.45, 0.37, 0.29);
scene.fog = new THREE.FogExp2(FOG0.clone(), 0.00009);
const camera = new THREE.PerspectiveCamera(56, W / H, 0.5, 40000);
camera.rotation.order = 'YXZ';
scene.add(camera);

// ---------- the city ----------
const sky = makeSky();
scene.add(sky.mesh);
const plainMat = (color, rough = 0.85, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
const ctx = { plainMat, glowMat };
const ground = makeGround(scene);
const buildings = makeBuildings(scene);
const props = makeProps(scene, ctx);
const traffic = makeTraffic(scene, ctx);
const bay = makeBay(scene, ctx);
const crowd = makeCrowd(scene, PEOPLE.length + RIDERS.length, quakeMat(plainMat(0xffffff, 0.8), { rigid: true }), { castShadow: false });
PEOPLE.forEach((p, i) => crowd.color(i, ...p.col));
RIDERS.forEach((p, i) => crowd.color(PEOPLE.length + i, ...p.col));
const glows = makeGlows(scene, 4000);
const smoke = makeSmoke(scene, 3000);
const planet = makePlanet();

// light: the low Sun behind you (gold, long shadows down the hill), a blue-pink sky
const sunDir = new THREE.Vector3(Math.sin(SUN.az * DEG) * Math.cos(SUN.el * DEG), Math.sin(SUN.el * DEG), Math.cos(SUN.az * DEG) * Math.cos(SUN.el * DEG)).normalize();
F.uSunDir.value.copy(sunDir);
sky.uniforms.uSunDir.value.copy(sunDir);
bay.u.uSun.value.copy(sunDir);
const sun = new THREE.DirectionalLight(0xffb070, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.08;
Object.assign(sun.shadow.camera, { left: -320, right: 320, top: 260, bottom: -260, near: 10, far: 3500 });
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0x9ab0dc, 0x8a6a50, 1.6);
scene.add(hemi);

const overlay = makeOverlay();
const stampEl = document.getElementById('stamp');
const stampW = document.getElementById('stampw');

// ---------- post ----------
const rt = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(RW, RH);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv);
    if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 60.0), 1.0); }`,
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.45, 0.45, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.32 }, uTitle: { value: 0 }, uCounter: { value: 0 },
    uDust: { value: 0 }, uBrown: { value: 0 }, uAb: { value: 0 }, uBlur: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uDust; uniform float uBrown; uniform float uAb; uniform float uBlur;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
    float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * vn(p); p = p * 2.07 + 3.1; a *= 0.5; } return s; }
    void main() {
      vec2 c = vUv - 0.5;
      vec2 off = c * uAb * 0.01;
      // shaken: a short streak along the jolt
      vec3 col = vec3(0.0);
      for (int i = 0; i < 4; i++) {
        vec2 o = vec2(uBlur, uBlur * 0.6) * (float(i) / 3.0 - 0.5);
        col += vec3(texture2D(tDiffuse, vUv + o + off).r, texture2D(tDiffuse, vUv + o).g, texture2D(tDiffuse, vUv + o - off).b);
      }
      col /= 4.0;
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, mix(vec3(lum), col, 0.75) * vec3(1.06, 0.95, 0.8), uDust * 0.4);
      // the wall of dust: churning brown, nothing shows through
      if (uBrown > 0.0) {
        float n = fbm(vUv * vec2(3.0, 5.0) + vec2(uTime * 0.3, -uTime * 0.6));
        vec3 dc = mix(vec3(0.24, 0.19, 0.14), vec3(0.6, 0.48, 0.34), n) * (0.7 + 0.5 * vUv.y);
        col = mix(col, dc, uBrown);
      }
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.25);
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.45 * exp(-pow((vUv.y - ${WIDE ? '0.665' : '0.36'}) / ${WIDE ? '0.17' : '0.1'}, 2.0));
      col *= 1.0 - uCounter * 0.32 * exp(-pow((vUv.y - ${WIDE ? '0.35' : '0.53'}) / ${WIDE ? '0.11' : '0.065'}, 2.0)) * smoothstep(${WIDE ? '0.42' : '0.8'}, ${WIDE ? '0.08' : '0.2'}, vUv.x);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- the cameras ----------
// the city: you stand between the cable car tracks at the top of the hill; you ride the rolling street; at
// magnitude 11 you are thrown up into the air, and from up there you see the city in the air, then the dust
const CY = [[-4, 1.7], [V_AIR - 0.3, 1.7], [V_AIR + 1.5, 16], [V_AIR + 3.5, 38], [V_DUST, 60], [V_PLANET, 80]];
const CZ = [[-4, CAM0.z], [V_AIR - 0.3, CAM0.z], [V_AIR + 3.5, CAM0.z - 30], [V_PLANET, CAM0.z - 60]];
const CP = [[-4, -4.5], [V_ROLL, -5.5], [V_AIR - 0.3, -5], [V_AIR + 2.5, -16], [V_DUST, -22]];
function cityCam(v, s) {
  let x = CAM0.x, y = keys(CY, v), z = keys(CZ, v);
  // standing on the ground: the ground carries you (half of the jolt, all of the roll and the rift)
  const air = smooth(V_AIR - 0.3, V_AIR + 1, v);
  const d = quakeD(x, streetY(z), z);
  x += d.x * 0.35 * (1 - air); y += d.y * (1 - air) + (Math.min(s.shake, 2) * 0.03) * Math.sin(v * 17) * (1 - air); z += d.z * 0.35 * (1 - air);
  const sh = s.shake * (1 - 0.5 * air);
  const shk = Math.pow(sh, 0.7);   // (the jolting you feel holding the camera)
  const yaw = (wobble(v * 0.35, 4) * 0.6 + wobble(v * 9.3, 1) * 0.9 * shk + 0.6 * Math.sin(v * 0.13)) * DEG + air * wobble(v * 0.6, 8) * 4 * DEG;
  const pitch = (keys(CP, v) + wobble(v * 10.7, 2) * 0.85 * shk + wobble(v * 0.3, 7) * 0.4) * DEG + air * 3 * DEG * Math.sin(v * 0.9);
  const roll = (wobble(v * 8.1, 3) * 1.1 * shk + wobble(v * 0.27, 9) * 0.5) * DEG + air * 6 * DEG * Math.sin(v * 0.7 + 1);
  return { x, y, z, yaw, pitch, roll, fov: 64 + 4 * smooth(V_AIR, V_AIR + 4, v) };
}
// space: straight above San Francisco, then pulling back until the whole planet is in view
const spaceCam = new THREE.PerspectiveCamera(40, W / H, 10, 3e6);
const ALT = [[V_PLANET, 2600], [vAtMag(13.5), 3800], [vAtMag(14.5), 6500], [vAtMag(15.5), 15000], [vAtMag(16.5), 23000], [vAtMag(17.5), 28000], [T_SWITCH, 33000]];
const camN = SF.clone().add(new THREE.Vector3(0, -0.08, 0)).normalize();       // a little south of SF
function placeSpace(v) {
  const alt = keys(ALT, v, true);
  const look = smooth(V_PLANET, vAtMag(15.5), v);
  spaceCam.position.copy(camN).multiplyScalar(RE + alt);
  // look at SF's spot on the ground at first, then at the planet's middle
  const tgt = SF.clone().multiplyScalar(RE * (1 - look));
  spaceCam.up.set(0, 1, 0);
  spaceCam.lookAt(tgt);
  spaceCam.rotateZ(wobble(v * 0.2, 3) * 0.6 * DEG);
  spaceCam.near = Math.max(1, alt * 0.2); spaceCam.far = 3e6;
  spaceCam.fov = 50;
  spaceCam.updateProjectionMatrix();
  spaceCam.updateMatrixWorld();
}

const v3 = new THREE.Vector3(), tmpC = new THREE.Color();
function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) s.flash = Math.max(s.flash, cover);
  const inSpace = s.place === 'planet' && cover < 0;
  renderPass.scene = inSpace ? planet.scene : scene;
  renderPass.camera = inSpace ? spaceCam : camera;
  QU.uTime.value = v; F.uTime.value = v;
  QU.uShake.value = inSpace ? 0 : s.shake * 0.09;
  QU.uRoll.value = s.roll;
  QU.uSplit.value = smooth(V_SPLIT - 0.2, V_SPLIT + 2.0, v);
  GU.uCrack.value = smooth(vAtMag(8.8), vAtMag(11), v) * 1.6;
  const b = beatAt(v);
  let punch = 0;
  if (b && !window.__cover) punch = smooth(0, 0.05, b.dt) * Math.exp(-Math.max(0, b.dt - 0.05) * 4);

  if (!inSpace) {
    const cam = cityCam(v, s);
    camera.position.set(cam.x, cam.y, cam.z);
    camera.rotation.set(cam.pitch - punch * 1.2 * DEG, cam.yaw, cam.roll + punch * 1.5 * DEG * Math.sin(b ? b.m * 7 : 0));
    camera.fov = cam.fov - 3 * punch;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    sky.mesh.position.copy(camera.position);
    sky.uniforms.uTime.value = v;
    sky.uniforms.uDust.value = s.dust;
    const fogD = 0.00009 + 0.0005 * s.dust * s.dust + 0.0004 * smooth(V_AIR + 2, V_DUST, v);
    scene.fog.density = fogD;
    scene.fog.color.copy(FOG0).lerp(DUSTC, clamp(s.dust * 1.6));
    glows.mat.uniforms.uFogD.value = fogD;
    bay.u.uFogD.value = fogD; bay.u.uFogC.value.copy(scene.fog.color);
    F.uDust.value = s.dust; GU.uDust.value = s.dust;
    const sunK = 1 - 0.6 * clamp(s.dust * 1.5);
    sun.intensity = 2.4 * sunK; hemi.intensity = 1.6 + 0.3 * s.dust;
    sun.color.setRGB(1.0, 0.69, 0.44).lerp(tmpC.setRGB(1.0, 0.5, 0.3), s.dust);
    sun.position.copy(camera.position).addScaledVector(sunDir, 1500).add(new THREE.Vector3(0, 0, -260));
    sun.target.position.set(camera.position.x, streetY(camera.position.z - 260), camera.position.z - 260);
    smoke.mat.uniforms.uTime.value = v;
    smoke.mat.uniforms.uSun.value.copy(sunDir);
    smoke.mat.uniforms.uLight.value.setRGB(1.0, 0.8, 0.62).multiplyScalar(0.8 + 0.3 * sunK);

    glows.begin(camera); smoke.begin();
    buildings.frame(v, s, smoke, glows);
    props.frame(v, s, glows, smoke);
    traffic.frame(v, s, glows);
    bay.frame(v, s, glows);
    PEOPLE.forEach((p, i) => crowd.pose(i, personPose(p, v, s)));
    RIDERS.forEach((r, i) => crowd.pose(PEOPLE.length + i, riderPose(r, v, s)));
    crowd.commit();
    // dust thrown up off the ground everywhere once it rolls; at 11 the whole street leaps in brown clouds
    {
      const k = smooth(V_ROLL, V_AIR + 2, v);
      if (k > 0.01) for (let n = 0; n < 120; n++) {
        const a = n * 2.399, rr = 15 + (n * 37 % 300);
        const x = camera.position.x + Math.cos(a) * rr * 0.5, z = camera.position.z - 20 - Math.abs(Math.sin(a)) * rr;
        const ph = (v * (0.3 + (n % 7) * 0.05) + n * 0.13) % 1;
        const y = streetY(z) + 1 + ph * (6 + 30 * s.toss / 10);
        if (rr < 30) continue;
        smoke.puff(x, y, z, 4 + ph * 10 + rr * 0.02, 0.035 * k * Math.sin(Math.PI * ph), 0.62, 0, (n * 0.618) % 1);
      }
    }
    glows.end(); smoke.end();
  } else {
    placeSpace(v);
    const u = planet.u, m = s.m;
    u.uTime.value = v;
    u.uFault.value = smooth(12.6, 13.2, m);
    u.uReach.value = keys([[12.8, 0.0], [13.2, 0.04], [14, 0.35], [15, 0.9], [16, 1.8], [17, 3.3]], m, false);
    u.uHot.value = smooth(14.8, 17, m);
    u.uSteam.value = smooth(15.0, 16.2, m);
    u.uPlates.value = smooth(16.8, 17.4, m);
    u.uMelt.value = smooth(17.4, 18.1, m);
    u.uBreak.value = v > V_BREAK - 0.1 ? Math.pow(Math.max(0, v - V_BREAK + 0.1), 1.3) * 0.45 : 0;
    planet.atmo.material.uniforms.uFade.value = 1 - smooth(16.5, 18, m);
  }

  // ---------- post ----------
  renderer.toneMappingExposure = inSpace ? 1.0 : 0.95;
  bloom.strength = inSpace ? 0.6 : 0.45;
  const f = finish.uniforms;
  f.uTime.value = v;
  f.uDust.value = inSpace ? 0 : s.dust;
  f.uBrown.value = window.__cover ? 0 : s.brown;
  f.uAb.value = punch * 1.4 + (inSpace ? 0 : Math.min(s.shake, 1.5) * 0.25);
  f.uBlur.value = inSpace ? 0 : Math.min(0.006, s.shake * 0.0018) * Math.abs(Math.sin(v * 13));
  f.uTitle.value = window.__cover ? 1.15 : s.title;
  f.uCounter.value = window.__cover ? 0 : (1 - s.flash) * 0.9;

  overlay(v, s, v);
  {
    const a = b && !window.__cover ? smooth(0, 0.06, b.dt) * (1 - smooth(1.6, 2.1, b.dt)) * (1 - s.flash) : 0;
    stampEl.style.opacity = a.toFixed(3);
    stampW.style.opacity = a.toFixed(3);
    if (a > 0) {
      const t = b.m === 18.4 ? '18.4' : String(b.m);
      if (stampEl.textContent !== t) stampEl.textContent = t;
      if (stampW.textContent !== b.k) stampW.textContent = b.k;
      stampEl.style.fontSize = `${(150 * (1 + 0.3 * Math.exp(-b.dt * 9))).toFixed(1)}px`;
    }
  }
  return s;
}

let comp = null;
function renderFrame(t) {
  const tail = t - (VIDEO_DURATION - LOOP);
  if (tail >= 0) update(t - VIDEO_DURATION + STORY_START, 1 - smooth(0, LOOP * 0.92, tail));
  else update(t + STORY_START);
  composer.render();
  if (comp) comp.paint();
}

async function boot() {
  await document.fonts.load('500 40px Cormorant');
  await document.fonts.load('italic 500 40px Cormorant');
  await document.fonts.load('600 40px Cormorant');
  await document.fonts.ready;
  await planet.ready;
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  for (const t of [55, 40, 26, 14, 0]) renderFrame(t);
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

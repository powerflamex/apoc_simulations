import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky, skyColors } from './sky.js';
import { makeGround, GU } from './ground.js';
import { makeCity, CU, hazed, LAMP_HEADS, SIG_LAMPS } from './city.js';
import { makeTraffic, CRASHES, CARS, carAt, JACK } from './traffic.js';
import { makeFolk } from './folk.js';
import { makePlane, planeAt, IMPACT } from './plane.js';
import { makeCrane } from './crane.js';
import { makeLab } from './lab.js';
import { makeProps } from './props.js';
import { makeGlows } from './glows.js';
import { makeSmoke } from './smoke.js';
import { makeFire } from './fire.js';
import { makeOverlay } from './overlay.js';
import { CAM0, EYE, CZ, BENCH, MOTHER, HWY } from './layout.js';
import {
  state, VIDEO_DURATION, LOOP, captionAt, HITS, V_EVENT, V_NIGHT1, V_MORN, V_BOOM, V_CRANE, V_DUSK, V_TRUCK, V_LAPSE, V_LAB, V_PREG, V_BABY, V_SUNTURN, T_SWITCH,
} from './timeline.js';
import { lerp, smooth, wobble, clamp, keys } from './util.js';

const W = 1080, H_PX = 1920, DEG = Math.PI / 180;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H_PX, false);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
// a plain depth buffer: a street-scale scene (near plane 0.3 m)
const camera = new THREE.PerspectiveCamera(60, W / H_PX, 0.3, 6000);
camera.rotation.order = 'YXZ';
scene.add(camera);

// ---------- the world ----------
const plainMat = (color, rough = 0.9, extra = {}) => hazed(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };
const ctx = { plainMat, glowMat, shadowy };
const sky = makeSky();
scene.add(sky.mesh);
makeGround(scene);
const city = makeCity(scene, ctx);
const traffic = makeTraffic(scene, ctx);
const crane = makeCrane(scene, ctx);
makeProps(scene, ctx);
const folk = makeFolk(scene, ctx, crane);
const plane = makePlane(scene, ctx);
const glows = makeGlows(scene, 6000);
glows.cam = camera.position;
const smoke = makeSmoke(scene, 1600);
const fire = makeFire(scene, 600);
const lab = makeLab();

const sunL = new THREE.DirectionalLight(0xfff3e2, 3.0);
sunL.castShadow = true;
sunL.shadow.mapSize.set(4096, 4096);
sunL.shadow.bias = -0.0004; sunL.shadow.normalBias = 0.04;
Object.assign(sunL.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 900 });
scene.add(sunL, sunL.target);
const hemi = new THREE.HemisphereLight(0x9cc0ff, 0x9a8a78, 1.2);
scene.add(hemi);
// street lamps near you light the pavement after dark (a few real lights; the rest are glows)
const NEAR_LAMPS = LAMP_HEADS.map((l) => ({ ...l, d: Math.hypot(l.x - 4, l.z - CZ) })).sort((a, b) => a.d - b.d).slice(0, 8);
const lampLights = NEAR_LAMPS.map((l) => { const p = new THREE.PointLight(0xffc98a, 0, 32, 1.6); p.position.set(l.x, l.y - 0.4, l.z); scene.add(p); return p; });

const overlay = makeOverlay();

// ---------- post ----------
const rt = new THREE.WebGLRenderTarget(W, H_PX, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H_PX);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv);
    if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 16.0), 1.0); }`,
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H_PX / 2), 0.3, 0.45, 1.05);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.22 }, uTitle: { value: 0 }, uCounter: { value: 0 }, uCap: { value: 0 }, uWhite: { value: 0 }, uAb: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter; uniform float uCap; uniform float uWhite; uniform float uAb;
    varying vec2 vUv;
    void main() {
      vec2 off = (vUv - 0.5) * uAb * 0.01;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.12);
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      // (soft darkening behind the title, the counter and the captions, so the text reads)
      col *= 1.0 - uTitle * 0.5 * exp(-pow((vUv.y - 0.37) / 0.11, 2.0));
      col *= 1.0 - uCounter * 0.4 * exp(-pow((vUv.y - 0.5) / 0.07, 2.0)) * smoothstep(0.85, 0.1, vUv.x);
      col *= 1.0 - uCap * 0.45 * exp(-pow((vUv.y - 0.175) / 0.045, 2.0));
      col = mix(col, vec3(1.0), uWhite);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- the camera, scene by scene ----------
const look = (from, to) => { const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2]; return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) }; };
const P0 = [CAM0.x, EYE, CAM0.z];
const PM = [3.4, EYE, -28.6];                          // (the next morning: you stand out on the north crosswalk, looking up the empty lanes)
const SMOKE_VIEW = look(PM, [IMPACT.x, 60, IMPACT.z]);
function camAt(v, s) {
  let pos = [...P0], yaw = -40 * DEG, pitch = 1.5 * DEG, fov = 62, shake = 1;
  if (v < V_NIGHT1) {
    // the corner at rush hour: across the crosswalk into the intersection; a small push in as the cars crash
    yaw = keys([[-1, -40], [2.0, -40], [3.2, -36]], v) * DEG; pitch = keys([[-1, 1.5], [2.0, 1.0], [3.2, 0.5]], v) * DEG; fov = keys([[-1, 62], [2.0, 62], [3.4, 56]], v);
  } else if (v < V_MORN) {
    // the first night, locked, from a first-floor window over the corner: the wrecks, the clothes, nobody left
    pos = [-15.5, 9.5, 5.5]; const t = look(pos, [-1, 0, -17]); yaw = t.yaw; pitch = t.pitch; fov = 58; shake = 0;
  } else if (v < V_CRANE) {
    // the next morning: up to the jet, follow it down; then the smoke
    pos = [...PM];
    const pl = planeAt(Math.min(Math.max(v + 0.12, V_MORN + 0.25), V_BOOM)).pos;
    const tr = look(PM, pl);
    const k = smooth(V_MORN + 0.1, V_MORN + 0.9, v), k2 = smooth(V_BOOM - 0.3, V_BOOM + 0.6, v);
    let dy = tr.yaw + 36 * DEG; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    yaw = -36 * DEG + dy * k; pitch = lerp(0.5 * DEG, tr.pitch - 2 * DEG, k);
    let d2 = SMOKE_VIEW.yaw - yaw; d2 = Math.atan2(Math.sin(d2), Math.cos(d2));
    yaw += d2 * k2; pitch = lerp(pitch, SMOKE_VIEW.pitch - 1 * DEG, k2);
    fov = lerp(lerp(56, 50, k), 46, k2);
  } else if (v < V_DUSK) {
    // day 1, locked: up past the people at the crane's load over the street, the jib against the sky
    pos = [10.5, EYE, 6.0];
    const lp = crane.loadPos();
    const t = look(pos, [lp.x, lp.y + 6, lp.z]);
    yaw = t.yaw; pitch = t.pitch - 6 * DEG; fov = 74; shake = 0;
  } else if (v < V_TRUCK) {
    // day 2 evening, locked: up the avenue as the lights come on, flicker and go out
    pos = [9.2, EYE, 3.5]; yaw = 9 * DEG; pitch = 4 * DEG; fov = 56; shake = 0;
  } else if (v < V_LAPSE) {
    // days 3-6, locked: the highway, nothing moving on it
    const jx = JACK ? JACK.xEnd : -30;
    pos = [jx - 23, HWY.y + 1.62, HWY.z + 0.2]; yaw = -88 * DEG; pitch = -4 * DEG; fov = 58; shake = 0;   // (behind the spill, looking east at the jack-knifed truck)
  } else if (v < V_LAB) {
    // days 6-14, locked: the shop fronts along the avenue
    pos = [10.2, EYE, 8.0]; yaw = -5 * DEG; pitch = 1.5 * DEG; fov = 54; shake = 0;
  } else if (v < V_BABY) {
    // the months after, locked: the woman on the bench in profile, the avenue and its trees beyond
    pos = [11.6, 1.3, -2.0]; yaw = -12 * DEG; pitch = -3 * DEG; fov = 60; shake = 0;
  } else {
    // day 280: the mother and the baby, then a turn to the low Sun down the cross street
    pos = [MOTHER.x - 0.6, 1.5, MOTHER.z + 3.1];
    const t = look(pos, [MOTHER.x, 1.05, MOTHER.z]);
    const k = smooth(V_SUNTURN, V_SUNTURN + 1.4, v);
    const sunYaw = Math.atan2(-s.sun.x, -s.sun.z), sunPitch = Math.asin(s.sun.y);
    let dy = sunYaw - t.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    yaw = t.yaw + dy * k + 4 * DEG * (1 - k); pitch = lerp(t.pitch + 3 * DEG, sunPitch, k);
    fov = keys([[V_BABY, 50], [V_BABY + 4, 44], [V_SUNTURN, 44], [V_SUNTURN + 1.4, 54]], v);
    pos[2] -= 0.35 * smooth(V_BABY, V_SUNTURN, v);
  }
  const k = fov / 60;
  yaw += wobble(v * 0.45, 4) * 0.35 * DEG * k * shake; pitch += wobble(v * 0.55, 3) * 0.3 * DEG * k * shake;
  const roll = wobble(v * 0.3, 7) * 0.35 * DEG * shake;
  return { pos, yaw, pitch, roll, fov };
}

// the crane beat: from the street, up past the hanging load and in through the cab's front glass to the empty seat;
// then a look down through the floor glass at the load over the street
const sm = (a, b, x) => smooth(a, b, x);
function craneCam(v) {
  const t = v - V_CRANE;
  const S0 = new THREE.Vector3(-3.0, 1.7, -9.5);
  const P1 = crane.cabPoint(9, -0.4, 0.2), P2 = crane.cabPoint(3.3, 0.3, 0.1);
  const C = new THREE.Vector3(S0.x * 0.4 + P1.x * 0.6 + 6, P1.y * 0.55, S0.z * 0.4 + P1.z * 0.6 + 4);
  const u = sm(0.5, 2.4, t), w = sm(2.3, 3.0, t);
  const a = S0.clone().multiplyScalar((1 - u) * (1 - u)).add(C.clone().multiplyScalar(2 * u * (1 - u))).add(P1.clone().multiplyScalar(u * u));
  const pos = a.lerp(P2, w);
  const lp = crane.loadPos();
  const T1 = new THREE.Vector3(lp.x, lp.y + 8, lp.z), T2 = crane.cabPoint(0, -0.2, 0), T3 = crane.cabPoint(-0.25, -0.75, 0.05), T4 = new THREE.Vector3(lp.x, lp.y - 4, lp.z);
  const tgt = T1.clone().lerp(T2, sm(1.4, 2.4, t)).lerp(T3, sm(2.7, 3.3, t)).lerp(T4, sm(3.6, 4.3, t));
  const fov = lerp(lerp(lerp(64, 50, sm(0.5, 2.3, t)), 52, sm(2.6, 3.2, t)), 70, sm(3.6, 4.3, t));
  return { pos, tgt, fov };
}

// ---------- update ----------
const tmpC = new THREE.Color(), tv = new THREE.Vector3();
const C = (a) => tmpC.setRGB(a[0], a[1], a[2]);
function update(v, cover = -1) {
  const s = state(v);
  const white = Math.max(s.flash, cover);
  if (cover >= 0) s.title *= 1 - smooth(0.55, 1, cover);
  // the beats: a kick on each
  s.kick = 0;
  for (const t of [...HITS, ...CRASHES.filter((c) => Math.hypot(c.x, c.z - CZ) < 30).map((c) => c.t)]) { const dt = v - t; if (dt > -0.05 && dt < 1.2) s.kick = Math.max(s.kick, smooth(-0.05, 0.04, dt) * Math.exp(-Math.max(dt, 0) / 0.3) * 0.5); }
  const elDeg = s.sun.el / DEG;
  s.dark = smooth(4, -7, elDeg);
  // ---------- the lab: its own scene ----------
  if (s.scene === 'lab') {
    lab.frame(v);
    renderPass.scene = lab.scene; renderPass.camera = lab.camera;
    renderer.toneMappingExposure = 0.85;
    bloom.strength = 0.08;
  } else {
    renderPass.scene = scene; renderPass.camera = camera;
    const cam = camAt(v, s);
    const sh = (s.kick * 0.7 + 0.02) * 0.012 * cam.fov / 60;
    camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
    camera.rotation.set(cam.pitch + wobble(v * 43, 3) * sh - s.kick * 0.3 * DEG, cam.yaw + wobble(v * 47, 4) * sh, cam.roll);
    camera.fov = cam.fov * (1 - 0.02 * s.kick);
    if (s.scene === 'crane') {
      const c = craneCam(v);
      camera.position.copy(c.pos); camera.lookAt(c.tgt); camera.fov = c.fov;
      camera.near = 0.08;
    } else camera.near = 0.3;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    // ---------- light and sky from the Sun's height ----------
    const sc = skyColors(elDeg);
    const SUN = tv.set(s.sun.x, s.sun.y, s.sun.z);
    const u = sky.uniforms;
    sky.mesh.position.copy(camera.position);
    u.uSun.value.copy(SUN); u.uZen.value.copy(C(sc.zen)); u.uHor.value.copy(C(sc.hor)); u.uGlow.value.copy(C(sc.glow)); u.uSunCol.value.copy(C(sc.sun));
    u.uSunI.value = 1; u.uStars.value = smooth(-6, -14, elDeg); u.uT.value = v * (s.lapse ? 40 : 1);
    u.uPx.value = (camera.fov * DEG) / H_PX; u.uCloud.value = 0.8;
    u.uCity.value = 0.25 * s.dark * s.power.p * s.power.f;
    const hi = C(sc.zen).clone(), lo = C(sc.hor).clone();
    CU.uSkyHi.value.copy(hi); CU.uSkyLo.value.copy(lo); GU.uSkyHi.value.copy(hi); GU.uSkyLo.value.copy(lo);
    const hz = lo.clone().lerp(new THREE.Color(0.02, 0.025, 0.04), s.dark * 0.5);
    CU.uHaze.value.copy(hz); GU.uHaze.value.copy(hz);
    CU.uHazeD.value = GU.uHazeD.value = lerp(2600, 1500, s.dark);
    CU.uSun.value.copy(SUN); CU.uSunCol.value.copy(C(sc.sun));
    CU.uTime.value = v; GU.uTime.value = v;
    CU.uNight.value = s.dark; GU.uNight.value = s.dark;
    CU.uPowerP.value = s.power.p; CU.uFlick.value = s.power.f;
    CU.uDecay.value = s.decay; GU.uDecay.value = s.decay;
    const lc = new THREE.Vector3(camera.position.x - Math.sin(camera.rotation.y) * 45, 0, camera.position.z - Math.cos(camera.rotation.y) * 45);
    sunL.position.copy(SUN).multiplyScalar(500).add(lc);
    sunL.target.position.copy(lc); sunL.target.updateMatrixWorld();
    sunL.intensity = 3.7 * smooth(-1.5, 6, elDeg);
    sunL.color.copy(C(sc.sun)).lerp(new THREE.Color(1, 1, 1), smooth(10, 40, elDeg) * 0.4);
    hemi.intensity = 0.12 + 2.1 * smooth(-10, 12, elDeg);
    hemi.color.copy(C(sc.zen)).multiplyScalar(2.2).lerp(new THREE.Color(0.75, 0.8, 0.95), 0.4);
    hemi.groundColor.setRGB(0.5, 0.45, 0.4).multiplyScalar(0.3 + 0.7 * smooth(-6, 10, elDeg));
    renderer.toneMappingExposure = lerp(1.12, 1.7, s.dark);
    // the lamps
    const lit = s.dark * s.power.f * (s.power.p > 0.5 ? 1 : 0);
    lampLights.forEach((l) => { l.intensity = 40 * lit; });
    glows.begin(camera);
    for (const l of LAMP_HEADS) glows.add(l.x, l.y - 0.1, l.z, 1.2, 3.2 * lit, 2.4 * lit, 1.4 * lit);
    // the traffic signals: the cross street green, the avenue red (normal days); dead once the grid fails
    const sigOn = s.power.f * (s.power.p > 0.5 ? 1 : 0);
    if (sigOn > 0) for (const L of SIG_LAMPS) {
      const red = L.group === 'av';
      glows.add(L.x, L.y + (red ? 0.33 : -0.33), L.z, 0.55, red ? 4 * sigOn : 0.2 * sigOn, red ? 0.25 * sigOn : 3.2 * sigOn, red ? 0.1 * sigOn : 1.4 * sigOn);
    }
    smoke.begin(); fire.begin();
    city.frame(v, s);
    traffic.frame(v, s, glows, smoke);
    crane.frame(v, s);
    folk.frame(v, s, glows);
    plane.frame(v, s, glows, fire, smoke);
    smoke.end(); fire.end(); glows.end();
    fire.mat.uniforms.uTime.value = v; fire.mat.uniforms.uOcc.value = 0.6; fire.mat.uniforms.uGain.value = 1.0;
    smoke.mat.uniforms.uTime.value = v;
    smoke.mat.uniforms.uLight.value.copy(C(sc.sun)).multiplyScalar(0.8 + 0.8 * (1 - s.dark)).add(new THREE.Color(0.25, 0.27, 0.32));
    smoke.mat.uniforms.uSun.value.copy(SUN);
    bloom.strength = 0.28 + 0.2 * s.kick + 0.15 * s.dark;
  }
  // ---------- post ----------
  finish.uniforms.uTime.value = v;
  finish.uniforms.uAb.value = s.kick * 0.5;
  finish.uniforms.uWhite.value = window.__cover ? 0 : white;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : 1 - smooth(0.6, 1, white);
  { const c = window.__cover ? null : captionAt(v); finish.uniforms.uCap.value = c ? c.alpha * (1 - smooth(0.6, 1, white)) : 0; }
  s.hide = smooth(0.6, 1.0, white);
  overlay(v, s);
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
  if (!params.has('dom')) {
    const { makeCompositor } = await import('./compose.js');
    comp = await makeCompositor(renderer.domElement, stage);
  }
  for (const t of [46, 38, 32, 27, 22, 17, 12, 7, 2, 0]) renderFrame(t);
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, sky, state, update, CU, GU, lab, comp: () => comp };
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
  const fit = () => { stage.style.transform = `scale(${Math.min(innerWidth / W, innerHeight / H_PX)})`; };
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

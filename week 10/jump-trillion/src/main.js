// "What if you jumped 1 trillion times higher?" — the street shots (city scene) cut with the space shots (space.js,
// its own scene and camera), as listed in camera.js. Post: bloom, a soft vignette, darkening behind the text, the white
// at the end; the last LOOP seconds replay the lead-in to frame 0 while the white clears.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky, skyColors } from './sky.js';
import { makeWorld, GU, hazed, craterH } from './world.js';
import { makeBus } from './things.js';
import { makeFleet } from './cars.js';
import { CARS, carAt, busAt } from './carsplan.js';
import { makeGlows } from './glows.js';
import { makeSmoke } from './smoke.js';
import { makeCrowd } from './crowd.js';
import { makeOverlay } from './overlay.js';
import { makeYou, FLAP } from './you.js';
import { makePeople } from './people.js';
import { makeFx } from './fx.js';
import { makeSpace } from './space.js';
import { youAt } from './choreo.js';
import { EVENTS, damageAt } from './events.js';
import { P } from './layout.js';
import { state, VIDEO_DURATION, LOOP, captionAt, popupAt, POP, V_WHITE, JUMPS, V_SPACE } from './timeline.js';
import { lerp, smooth, wobble, clamp } from './util.js';
import { camAt } from './camera.js';

const W = 1080, H_PX = 1920, DEG = Math.PI / 180;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H_PX, false);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(66, W / H_PX, 0.2, 60000);
scene.add(camera);
const plainMat = (color, rough = 0.9, extra = {}) => hazed(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };
const ctx = { plainMat, glowMat, shadowy };
const sky = makeSky();
scene.add(sky.mesh);
sky.mesh.scale.setScalar(8);
const world = makeWorld(scene, ctx);

// ---------- the bus and the stopped cars ----------
const bus = makeBus(ctx);
bus.matrixAutoUpdate = false;
scene.add(bus);
const fleet = makeFleet(scene, CARS.length, { plainMat, glowMat, shadowy });
CARS.forEach((c, i) => fleet.color(i, c.col, c.kind));

const glows = makeGlows(scene, 1500);
const smoke = makeSmoke(scene, 2600);
const people = makePeople();
const crowd = makeCrowd(scene, people.list.length, plainMat(0xffffff, 0.82), { castShadow: true });
people.list.forEach((p) => crowd.color(p.i, p.shirt, p.pants, p.skin, p.hair, p.sleeves));
const fx = makeFx(scene, ctx, { smoke, glows });

const sunL = new THREE.DirectionalLight(0xfff3e2, 3.0);
sunL.castShadow = true;
sunL.shadow.mapSize.set(4096, 4096);
sunL.shadow.bias = -0.0003; sunL.shadow.normalBias = 0.04;
scene.add(sunL, sunL.target);
const hemi = new THREE.HemisphereLight(0x9cc0ff, 0x9a8a78, 1.2);
scene.add(hemi);
const fireL = new THREE.PointLight(0xff8a3a, 0, 120, 1.6);
scene.add(fireL);

// ---------- you ----------
const you = makeYou(scene, { hoodie: 0xff8a1e, jeans: 0x283246, skin: 0xd09a74, hair: 0x2a1a10 });
you.root.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = true; } });
function placeYou(x, y, z, yaw) { you.root.rotation.y = yaw; you.root.position.set(x - 0.105 * Math.cos(yaw), y, z + 0.105 * Math.sin(yaw)); }

// ---------- space ----------
const space = await makeSpace(renderer);

const overlay = makeOverlay();
const stampEl = document.getElementById('stamp');

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
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H_PX / 2), 0.25, 0.3, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.22 }, uTitle: { value: 0 }, uCounter: { value: 0 }, uCap: { value: 0 }, uWhite: { value: 0 }, uAb: { value: 0 }, uWarm: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVig; uniform float uTitle; uniform float uCounter; uniform float uCap; uniform float uWhite; uniform float uAb; uniform float uWarm;
    varying vec2 vUv;
    void main() {
      vec2 off = (vUv - 0.5) * uAb * 0.01;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.12);
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.5 * exp(-pow((vUv.y - 0.85) / 0.09, 2.0));
      col *= 1.0 - uCounter * 0.42 * exp(-pow((vUv.y - 0.617) / 0.085, 2.0)) * smoothstep(1.1, 0.2, vUv.x);
      col *= 1.0 - uCap * 0.45 * exp(-pow((vUv.y - 0.385) / 0.045, 2.0));
      col = mix(col, vec3(0.42, 0.36, 0.3), uWarm);
      col = mix(col, vec3(1.0, 0.99, 0.96), uWhite);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

const DBG_CAM = params.get('cam') ? params.get('cam').split(',').map(Number) : null;

// ---------- update ----------
const tmpC = new THREE.Color();
const C = (a) => tmpC.setRGB(a[0], a[1], a[2]);
const SUN_EL = 48, SUN_AZ = 150;
const SUNDIR = (() => { const el = SUN_EL * DEG, az = SUN_AZ * DEG; return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)); })();
const kickAt = (v) => { let k = 0; for (const e of EVENTS) { const dt = v - e.t; if (dt > -0.05 && dt < 1.6) k = Math.max(k, smooth(-0.05, 0.03, dt) * Math.exp(-Math.max(dt, 0) / 0.3) * e.kick); } return k; };

function update(v, cover = -1) {
  const s = state(v);
  const white = Math.max(s.flash, cover);
  if (cover >= 0) s.title *= 1 - smooth(0.55, 1, cover);
  s.kick = kickAt(v);
  const cm = camAt(v);
  s.space = !!cm.space;
  if (s.space) {
    space.update(v, cm);
    renderPass.scene = space.scene; renderPass.camera = space.camera;
    bloom.strength = 0.35; bloom.radius = 0.4;
    renderer.toneMappingExposure = 1.0;
  } else {
    renderPass.scene = scene; renderPass.camera = camera;
    // ---- the bus and the cars ----
    bus.matrix.copy(busAt(v)); bus.matrixWorldNeedsUpdate = true;
    CARS.forEach((c, i) => fleet.set(i, carAt(i, v), false));
    fleet.commit();
    // ---- the crater, the damage ----
    fx.craters(v, GU);
    const dmg = damageAt(v);
    GU.uBl.value.set(P.x, P.z, dmg.glass, dmg.wreck);
    GU.uBurn.value = dmg.wreck > 0 ? 1 : 0;
    // ---- you ----
    const Y = youAt(v);
    const ground = craterH(Y.x, Y.z);
    // facing the camera (three-quarters on); in the air arms and legs working (a hitch-kick), straight on the drive,
    // legs reaching down before the landing
    if (cm.pos) Y.yaw = Math.atan2(cm.pos.x - Y.x, cm.pos.z - Y.z) + 0.45;
    if (Y.mode === 'air' && Y.drive < 0.5 && Y.reach < 0.35) you.run({ ph: v * 10.5 + Y.jump, amp: 0.85, float: 1, t: v, wind: 0.6 });
    else you.pose(Y.pose);
    placeYou(Y.x, ground + Y.y, Y.z, Y.yaw);
    you.root.visible = Y.visible;
    you.root.updateMatrixWorld(true);
    FLAP.uFT.value = v; FLAP.uFlap.value = Y.y > 3 ? 0.7 : 0.15;
    const youP = new THREE.Vector3(Y.x, ground + Y.y + 0.9, Y.z);
    // ---- the camera ----
    if (DBG_CAM) {
      camera.position.set(DBG_CAM[0], DBG_CAM[1], DBG_CAM[2]);
      camera.lookAt(DBG_CAM[3], DBG_CAM[4], DBG_CAM[5]);
      camera.fov = DBG_CAM[6] || 60;
    } else {
      camera.position.copy(cm.pos);
      camera.lookAt(cm.look);
      camera.fov = cm.fov;
      const shake = (0.0012 + s.kick * 0.016) * camera.fov / 60;
      camera.rotation.x += wobble(v * 43, 3) * shake; camera.rotation.y += wobble(v * 47, 4) * shake; camera.rotation.z += wobble(v * 39, 6) * shake * 0.5;
    }
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    // ---- sky and light ----
    const sc = skyColors(SUN_EL);
    const u = sky.uniforms;
    sky.mesh.position.copy(camera.position);
    // high above the clouds the sky deepens
    const hi = smooth(1500, 5000, camera.position.y);
    u.uSun.value.copy(SUNDIR); u.uZen.value.copy(C(sc.zen)).multiplyScalar(1 - 0.35 * hi); u.uHor.value.copy(C(sc.hor)); u.uGlow.value.copy(C(sc.glow)); u.uSunCol.value.copy(C(sc.sun));
    u.uSunI.value = 1; u.uStars.value = 0; u.uT.value = v; u.uPx.value = (camera.fov * DEG) / H_PX; u.uCloud.value = 0.25; u.uCity.value = 0;
    GU.uHaze.value.copy(C(sc.hor));
    GU.uHazeD.value = 3500 + 4 * camera.position.y + 2 * Math.max(0, camera.position.z);
    world.cloudU.uSun.value.copy(SUNDIR);
    world.frame(v);
    const lc = new THREE.Vector3(camera.position.x * 0.5 + P.x * 0.5, 0, camera.position.z * 0.5 + P.z * 0.5);
    const big = clamp(camera.position.distanceTo(new THREE.Vector3(P.x, 0, P.z)) * 0.9 + 40, 50, 700);
    sunL.shadow.camera.left = -big; sunL.shadow.camera.right = big; sunL.shadow.camera.top = big; sunL.shadow.camera.bottom = -big;
    sunL.shadow.camera.near = 10; sunL.shadow.camera.far = 4000; sunL.shadow.camera.updateProjectionMatrix();
    sunL.position.copy(SUNDIR).multiplyScalar(1500).add(lc);
    sunL.target.position.copy(lc); sunL.target.updateMatrixWorld();
    sunL.intensity = 3.2;
    sunL.color.copy(C(sc.sun)).lerp(new THREE.Color(1, 1, 1), 0.45);
    hemi.intensity = 1.45;
    hemi.color.copy(C(sc.zen)).multiplyScalar(2.2).lerp(new THREE.Color(0.75, 0.8, 0.95), 0.4);
    hemi.groundColor.setRGB(0.55, 0.5, 0.44);
    renderer.toneMappingExposure = 1.0;
    // ---- the people, the effects ----
    glows.begin(camera);
    smoke.begin();
    people.frame(v, crowd);
    fireL.intensity = 0;
    fx.frame(v, { you: Y, youP, camera, fireL, GU });
    smoke.end(); glows.end();
    smoke.mat.uniforms.uTime.value = v;
    smoke.mat.uniforms.uLight.value.setRGB(1.25, 1.2, 1.1);
    smoke.mat.uniforms.uSun.value.copy(SUNDIR);
    bloom.strength = 0.18 + 0.15 * s.kick; bloom.radius = 0.3;
  }
  // ---------- post ----------
  finish.uniforms.uAb.value = s.kick * 0.5;
  finish.uniforms.uWhite.value = window.__cover ? 0 : white;
  finish.uniforms.uWarm.value = smooth(V_SPACE - 0.55, V_SPACE - 0.05, v) * (v < V_SPACE ? 1 : 0);
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : 1 - smooth(0.6, 1, white);
  finish.uniforms.uCap.value = 0;          // (no dark stripe behind the caption line)
  s.hide = smooth(0.6, 1.0, white);
  overlay(v, s);
  {
    const p = window.__cover ? null : popupAt(v);
    const a = p ? smooth(0, 0.06, p.dt) * (1 - smooth(POP - 0.35, POP, p.dt)) * (1 - s.hide) : 0;
    stampEl.style.opacity = a.toFixed(3);
    if (a > 0) {
      if (stampEl.textContent !== p.say) stampEl.textContent = p.say;
      const fit = Math.max(60, Math.min(112, 1750 / p.say.length));
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
  if (!params.has('dom')) {
    const { makeCompositor } = await import('./compose.js');
    comp = await makeCompositor(renderer.domElement, stage);
  }
  for (const t of [44, 40.5, 38, 36, 33, 31, 29.5, 27, 25, 22, 20, 17, 15, 12.5, 11, 9, 7, 4, 2, 0]) renderFrame(t);
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, sky, state, update, you, people, youAt, space };
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

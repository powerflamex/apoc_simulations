import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky, NL } from './sky.js';
import { makeGround, GU, NSPOT } from './ground.js';
import { makeCity, CU } from './city.js';
import { makeWater, WU, NSPL } from './water.js';
import { makePeople } from './people.js';
import { makeGlows } from './glows.js';
import { makeFire } from './fire.js';
import { makeSmoke } from './smoke.js';
import { makeEffects } from './effects.js';
import { makeBigHead } from './bighead.js';
import { makeStreaks, drawMeteors, RAD, RS, IMPACT_DIR, SPLASHES, bigAt, BIG0 } from './meteors.js';
import { makeOverlay } from './overlay.js';
import { EYE, LAMPS, HIT_CAR, SPLASH, PIER, QZ } from './layout.js';
import { state, VIDEO_DURATION, LOOP, popupAt, captionAt, POP, V_FB1, V_BOOM1, V_DAY, V_BOOM, V_SPLASH, V_CAR, V_RUN, V_BIG, V_FULL, V_DIVE, V_IMPACT, V_WHITE } from './timeline.js';
import { lerp, smooth, wobble, clamp, keys } from './util.js';

const W = 1080, H = 1920, DEG = Math.PI / 180;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');

const stage = document.getElementById('stage');
// a plain depth buffer (the near crowd is 1.7 m off, the skyline 2.5 km, the meteors drawn 4 km out)
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, W / H, 0.3, 7000);
camera.rotation.order = 'YXZ';
scene.add(camera);

// ---------- the world ----------
const plainMat = (color, rough = 0.9, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };
const ctx = { plainMat, glowMat, shadowy };
const sky = makeSky();
scene.add(sky.mesh);
makeGround(scene);
makeCity(scene, ctx);
makeWater(scene);
const people = makePeople(scene);
const glows = makeGlows(scene, 6000);
const streaks = makeStreaks(scene, 5000);
const fire = makeFire(scene, 200);
const smoke = makeSmoke(scene, 800);
const spray = makeSmoke(scene, 1200);
const effects = makeEffects(scene, ctx, fire, smoke, spray);
const bigHead = makeBigHead(scene);

// ---------- the light ----------
// the night: a cool sky fill and the warm lamps along the quay; the fireballs: one shadow-casting light from the
// brightest of them (moving with it), and the whole sky's fill lifting toward a lit blue
const hemi = new THREE.HemisphereLight(0x4a5f8a, 0x2a2018, 0.55);
scene.add(hemi);
const warm = new THREE.HemisphereLight(0xffb070, 0x5a3a20, 0.35);
scene.add(warm);
const fbL = new THREE.DirectionalLight(0xe8f0ff, 0);
fbL.castShadow = true;
fbL.shadow.mapSize.set(2048, 2048);
fbL.shadow.bias = -0.0004; fbL.shadow.normalBias = 0.04; fbL.shadow.radius = 3;
Object.assign(fbL.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 10, far: 500 });
scene.add(fbL, fbL.target);
const lift = new THREE.HemisphereLight(0x9ab8ff, 0x3a4050, 0);
// the restaurants and lamps behind you: a warm light on the crowd's backs
const back = new THREE.DirectionalLight(0xffc896, 1.3);
back.position.set(2, 7, 14); back.target.position.set(0, 0, -8);
scene.add(back, back.target);
scene.add(lift);
// the four lamps nearest the crowd light their backs and shoulders
const NEAR_LAMPS = LAMPS.filter((l) => !l.street).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)).slice(0, 4);
const lampL = NEAR_LAMPS.map((l) => { const p = new THREE.PointLight(0xffb070, 9, 26, 1.6); p.position.set(l.x, l.h - 0.2, l.z); scene.add(p); return p; });
// the burning car
const carL = new THREE.PointLight(0xff8030, 0, 30, 1.6);
carL.position.set(HIT_CAR.x, 2.2, HIT_CAR.z);
scene.add(carL);
// a rock's glow as it comes down close
const rockL = new THREE.PointLight(0xffc080, 0, 90, 1.4);
scene.add(rockL);

const overlay = makeOverlay();
const stampEl = document.getElementById('stamp');
const stampW = document.getElementById('stampw');

// ---------- post ----------
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv);
    if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 16.0), 1.0); }`,
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.5, 0.4, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.2 }, uTitle: { value: 0 }, uCounter: { value: 0 },
    uAb: { value: 0 }, uCap: { value: 0 }, uPop: { value: 0 }, uBlur: { value: 0 }, uWhite: { value: 0 }, uWhip: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uAb; uniform float uCap; uniform float uPop; uniform float uBlur; uniform float uWhite; uniform float uWhip;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5;
      vec3 col = vec3(0.0);
      float jit = h(vUv * 1920.0 + uTime) - 0.5;
      vec2 off = d * uAb * 0.01;
      for (int i = 0; i < 6; i++) {
        float k = (float(i) + jit) / 6.0 - 0.5;
        vec2 uv = 0.5 + d * (1.0 - uBlur * (k + 0.5)) + vec2(uWhip * k * 0.06, 0.0);
        col += vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      }
      col /= 6.0;
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.1);
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.5 * exp(-pow((vUv.y - 0.29) / 0.1, 2.0));
      col *= 1.0 - uCounter * 0.38 * exp(-pow((vUv.y - 0.79) / 0.06, 2.0)) * smoothstep(0.66, 0.1, vUv.x);
      col *= 1.0 - uCap * 0.45 * exp(-pow((vUv.y - 0.175) / 0.04, 2.0));
      col *= 1.0 - uPop * 0.45 * exp(-pow((vUv.y - 0.175) / 0.05, 2.0));
      col = mix(col, vec3(1.0), uWhite);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- the camera: you stand on a bench at the back of the crowd (eyes 2.6 m up, over their heads); only your
// eyes and your zoom change ----------
const CAM_Y = 2.6;
// aim (yaw, pitch) at a point, from your eye
const aimAt = (x, y, z) => { const dx = x, dy = y - CAM_Y, dz = z; return [Math.atan2(-dx, -dz) / DEG, Math.atan2(dy, Math.hypot(dx, dz)) / DEG]; };
const radAz = Math.atan2(-RAD.x, -RAD.z) / DEG, radEl = Math.asin(RAD.y) / DEG;
const [carYaw, carPitch] = aimAt(HIT_CAR.x, 0.8, HIT_CAR.z);
const [splYaw, splPitch] = aimAt(SPLASH.x, 4, SPLASH.z);
const impAz = Math.atan2(-IMPACT_DIR.x, -IMPACT_DIR.z) / DEG;
// 0:00 the sky over the crowd and the skyline; 0:05 up after the first fireball; 0:09 down at the lit street and the
// crowd's shadows; 0:12.6 right, the jetty's windows and the car alarms; 0:16.4 the harbour (zoomed); 0:20.8 the car;
// 0:25.6 left, the crowd running for the pier; 0:30.4 up at the biggest one (zoomed 0:33-0:37); 0:41 down after it.
const YAW = [[-2, 7], [4.6, 7], [5.6, 9], [8.6, 6], [12.4, 4], [13.0, -27], [16.0, -27], [16.8, splYaw + 1], [20.6, splYaw + 1], [21.3, carYaw + 1], [25.4, carYaw + 1], [26.4, 20], [29.6, 28], [30.6, radAz + 1], [37.5, radAz + 1], [41.0, radAz - 1], [44.5, impAz + 3], [50, impAz + 3]];
const PITCH = [[-2, 16], [4.8, 16], [5.8, 22], [8.4, 16], [9.4, 3], [11.6, 3], [12.4, 9], [16.0, 9], [16.8, splPitch + 2], [20.6, splPitch + 4], [21.3, carPitch + 3], [25.4, carPitch + 3], [26.4, 6], [29.6, 8], [30.6, radEl - 3], [37.5, radEl - 3], [39.0, radEl - 8], [41.0, radEl - 10], [44.6, 11], [50, 11]];
const FOV = [[-2, 62], [8.4, 62], [9.4, 64], [12.4, 62], [16.0, 62], [16.8, 40], [20.6, 40], [21.3, 32], [25.4, 32], [26.4, 64], [30.6, 62], [33.0, 62], [34.2, 40], [37.0, 40], [38.4, 62], [41, 64], [50, 66]];
function camAt(v) {
  const pos = new THREE.Vector3(0, CAM_Y, 0);
  let pitch = keys(PITCH, v) * DEG, fov = keys(FOV, v), yaw = keys(YAW, v) * DEG;
  // while the biggest one is up, the eyes stay on it
  const big = bigAt(v);
  const tb = keys([[-2, 0], [V_BIG + 3.5, 0], [V_BIG + 4.5, 0.85], [V_IMPACT, 0.85], [50, 0.85]], v);
  if (big && tb > 0) {
    const az = Math.atan2(-big.dir.x, -big.dir.z), el = Math.asin(big.dir.y);
    yaw = lerp(yaw, az, tb); pitch = lerp(pitch, el - (v > V_DIVE ? 4 : 2) * DEG, tb);
  }
  let roll = wobble(v * 0.3, 7) * 0.6 * DEG;
  pos.y += wobble(v * 0.7, 5) * 0.015;
  pos.x += wobble(v * 0.5, 2) * 0.03;
  const k = fov / 60;
  yaw += wobble(v * 0.45, 4) * 0.4 * DEG * k; pitch += wobble(v * 0.55, 3) * 0.35 * DEG * k;
  return { pos, yaw, pitch, roll, fov };
}
// the jolts: the booms, the splash, the car, the sun-bright one's boom, the impact
const KICKS = [[V_BOOM1, 0.35], [V_BOOM, 1.0], [V_SPLASH, 0.35], [V_CAR, 0.7], [V_RUN + 1.0, 0.6], [V_DIVE + 2.2, 0.4], [V_IMPACT, 1.2]];
const kickAt = (v) => KICKS.reduce((s, [t, k]) => s + k * Math.exp(-Math.max(v - t, 0) / 0.32) * smooth(t - 0.02, t + 0.03, v), 0);

const tmpV = new THREE.Vector3();
const spotsBase = [];
for (const l of LAMPS) spotsBase.push([l.x, l.z, l.roof ? 4.5 : l.street ? 8 : 6.5, 0, l.roof ? 0.6 : 0.85, l.roof ? 0.42 : 0.56, l.roof ? 0.22 : 0.3, 0, 0]);
function update(v, cover = -1) {
  const s = state(v);
  const white = Math.max(s.white, cover);
  if (cover >= 0) s.title *= 1 - smooth(0.55, 1, cover);   // (in the loop's lead-in the title fades in as the white clears)
  // ---------- the camera ----------
  const cam = camAt(v);
  const kick = kickAt(v);
  const sh = (kick * 1.0 + 0.02) * 0.014 * cam.fov / 60;
  cam.pitch += wobble(v * 43, 3) * sh;
  cam.yaw += wobble(v * 47, 4) * sh;
  cam.roll += wobble(v * 29, 5) * sh * 0.8;
  camera.position.copy(cam.pos);
  camera.rotation.set(cam.pitch, cam.yaw, cam.roll);
  camera.fov = cam.fov;
  if (params.has('dbg')) { const d = params.get('dbg').split(',').map(Number); camera.position.set(d[0], d[1], d[2]); camera.lookAt(d[3], d[4], d[5]); camera.fov = d[6] || 40; }
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const pxPerRad = (H / 2) / Math.tan(camera.fov * DEG / 2);

  // ---------- the meteors (and the light they throw) ----------
  glows.begin(camera);
  streaks.begin();
  const { lights, big } = drawMeteors(v, camera, streaks, glows, pxPerRad);
  streaks.end();
  streaks.mat.uniforms.uTime.value = v;
  // the biggest one's burning head
  bigHead.mesh.visible = !!big;
  if (big) {
    const hd = tmpV.copy(big.dir).multiplyScalar(RS * 0.98).add(camera.position);
    bigHead.mesh.position.copy(hd);
    bigHead.mesh.scale.setScalar(big.size * DEG * RS * 3.4);
    bigHead.mesh.updateMatrixWorld();
    const p1 = hd.clone().project(camera);
    const p2 = big.dir.clone().lerp(BIG0, 0.3).normalize().multiplyScalar(RS).add(camera.position).project(camera);
    const tx = (p2.x - p1.x) * W, ty = (p2.y - p1.y) * H, tl = Math.hypot(tx, ty) || 1;
    bigHead.uniforms.uTail.value.set(tx / tl, ty / tl);
    bigHead.uniforms.uLen.value = 1 + 1.6 * big.trail;
    bigHead.uniforms.uI.value = clamp(big.I / 3, 0.12, 1.25);
    bigHead.uniforms.uTime.value = v;
  }
  const imp = smooth(V_IMPACT - 0.05, V_IMPACT + 0.3, v);
  let total = 0;
  for (const L of lights) total += L.I;
  const top = lights.find((L) => L.dir.y > 0.03 && !L.pos);
  // the shadow-casting light: from the brightest fireball in the sky
  const I0 = top ? top.I : 0;
  fbL.intensity = 1.25 * Math.pow(Math.min(I0, 8), 0.6);
  if (top) {
    const look = tmpV.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw)).multiplyScalar(14).add(camera.position); look.y = 0;
    fbL.position.copy(top.dir).multiplyScalar(220).add(look);
    fbL.target.position.copy(look); fbL.target.updateMatrixWorld();
  }
  const liftK = Math.pow(total, 0.7);
  lift.intensity = 0.22 * Math.min(liftK, 3.5) + 3 * imp;
  // a rock coming down close lights everything near it
  const rk = lights.find((L) => L.pos);
  if (rk) { rockL.position.copy(rk.pos); rockL.intensity = 400 * rk.I; } else rockL.intensity = 0;
  // the sky and the water get the four brightest
  for (let i = 0; i < NL; i++) {
    const L = lights[i];
    if (L && !L.pos) { sky.uniforms.uL.value[i].set(L.dir.x, L.dir.y, L.dir.z, L.I); WU.uL.value[i].set(L.dir.x, L.dir.y, L.dir.z, L.I); }
    else { sky.uniforms.uL.value[i].w = 0; WU.uL.value[i].w = 0; }
  }
  sky.uniforms.uImpDir.value.copy(IMPACT_DIR); sky.uniforms.uImp.value = imp;
  WU.uImpDir.value.copy(IMPACT_DIR); WU.uImp.value = imp;
  sky.uniforms.uTime.value = v;
  sky.mesh.position.copy(camera.position);
  sky.mesh.scale.setScalar(6000);
  WU.uTime.value = v; WU.uPx.value = 1 / pxPerRad;
  WU.uLift.value.setRGB(0.07 * 0.06 * total, 0.13 * 0.06 * total, 0.27 * 0.06 * total);
  // the splashes' rings
  {
    const live = SPLASHES.filter((sp) => v > sp.t1 - 0.01 && v < sp.t1 + 14).slice(-NSPL);
    for (let i = 0; i < NSPL; i++) { const sp = live[i]; if (sp) WU.uSpl.value[i].set(sp.x, sp.z, v - sp.t1, sp.big ? 1 : 0.45); else WU.uSpl.value[i].set(0, 0, -100, 0); }
  }
  // the buildings' glass: the sky they mirror lifts with the fireballs
  CU.uTime.value = v;
  CU.uSkyHi.value.setRGB(0.01 + 0.03 * liftK, 0.015 + 0.06 * liftK, 0.04 + 0.12 * liftK);
  CU.uSkyLo.value.setRGB(0.12 + 0.03 * liftK, 0.08 + 0.05 * liftK, 0.05 + 0.08 * liftK);
  CU.uRattle.value = smooth(V_BOOM, V_BOOM + 0.05, v) * Math.exp(-Math.max(v - V_BOOM, 0) / 0.9) + 0.5 * smooth(V_RUN + 1.0, V_RUN + 1.05, v) * Math.exp(-Math.max(v - V_RUN - 1, 0) / 0.7);
  GU.uTime.value = v;
  GU.uSkyC.value.setRGB(0.03 + 0.04 * liftK, 0.04 + 0.08 * liftK, 0.07 + 0.16 * liftK);
  GU.uScorch.value.set(HIT_CAR.x, HIT_CAR.z, 3.2, smooth(V_CAR, V_CAR + 1.5, v));

  // ---------- things ----------
  const spots = spotsBase.map((sp) => { sp[8] = Math.hypot(sp[0] - camera.position.x, sp[1] - camera.position.z); return sp; });
  for (const l of LAMPS) {
    const r = l.roof ? 0.35 : 0.5;
    glows.add(l.x, l.h + (l.roof ? -0.15 : 0.1), l.z, r * 2.2, 2.6, 1.7, 0.85);
    glows.add(l.x, l.h + (l.roof ? -0.15 : 0.1), l.z, r * 0.7, 6, 4.6, 2.8);
  }
  const burn = smooth(V_CAR + 0.15, V_CAR + 1.2, v);
  carL.intensity = v > V_CAR ? (40 * burn * (0.85 + 0.15 * Math.sin(v * 23) * Math.sin(v * 13)) + 400 * Math.exp(-(v - V_CAR) / 0.12)) : 0;
  fire.begin(); smoke.begin(); spray.begin();
  effects.frame(v, glows, spots);
  fire.end(); smoke.end(); spray.end();
  spray.mat.uniforms.uTime.value = v;
  fire.mat.uniforms.uTime.value = v;
  smoke.mat.uniforms.uTime.value = v;
  const amb = 0.35 + 0.18 * liftK + 4 * imp;
  smoke.mat.uniforms.uLight.value.setRGB(amb * 0.95, amb, amb * 1.1);
  spray.mat.uniforms.uLight.value.setRGB(1.2 + 0.5 * liftK, 1.3 + 0.55 * liftK, 1.45 + 0.6 * liftK);
  people.frame(v, glows, (x, z) => (big ? Math.atan2(big.dir.x, big.dir.z) : Math.PI));
  glows.end();
  spots.sort((a, b) => a[8] - b[8]);
  for (let i = 0; i < NSPOT; i++) {
    const sp = spots[i];
    if (sp) { GU.uSpotP.value[i].set(sp[0], sp[1], sp[2], 0); GU.uSpotC.value[i].set(sp[4], sp[5], sp[6], 0); }
    else GU.uSpotC.value[i].set(0, 0, 0, 0);
  }

  // ---------- post ----------
  bloom.strength = 0.45 + 0.25 * kick + 0.02 * Math.min(total, 6);
  finish.uniforms.uTime.value = v;
  finish.uniforms.uAb.value = kick * 0.8;
  finish.uniforms.uBlur.value = window.__cover ? 0 : kick * 0.02;
  const whip = Math.abs(keys(YAW, v + 0.02) - keys(YAW, v - 0.02)) / 0.04;
  finish.uniforms.uWhip.value = window.__cover ? 0 : clamp((whip - 60) / 300, 0, 1);
  finish.uniforms.uWhite.value = window.__cover ? 0 : Math.pow(white, 1.2);
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : 1 - white;
  finish.uniforms.uVig.value = 0.2;

  s.hide = smooth(0.5, 0.9, white);
  overlay(v, s, v);
  {
    const p = window.__cover ? null : popupAt(v);
    const a = p ? smooth(0, 0.06, p.dt) * (1 - smooth(POP - 0.35, POP, p.dt)) * (1 - s.hide) : 0;
    stampEl.style.opacity = a.toFixed(3);
    finish.uniforms.uPop.value = a;
    { const c = window.__cover ? null : captionAt(v); finish.uniforms.uCap.value = c ? c.alpha * (1 - s.hide) : 0; }
    stampW.style.opacity = '0';
    if (a > 0) {
      if (stampEl.textContent !== p.say) stampEl.textContent = p.say;
      const fit = Math.max(56, Math.min(118, 1560 / p.say.length));
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
  for (const t of [44, 40, 34, 28, 22, 16, 10, 4, 0]) renderFrame(t);
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, sky, state, update, CU, GU, WU, people, comp: () => comp };
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

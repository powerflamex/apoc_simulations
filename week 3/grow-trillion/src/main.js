import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeEarth, SUN_DIR, SURF, EARTH_C, MOON_C } from './earth.js';
import { makeGround, GU } from './ground.js';
import { makeCity } from './city.js';
import { F } from './facade.js';
import { makeYou } from './you.js';
import { makeAir } from './air.js';
import { makeSmoke } from './smoke.js';
import { makeGlows } from './glows.js';
import { makeOverlay } from './overlay.js';
import {
  state, VIDEO_DURATION, LOOP, STAMPS, lastStamp, popupAt, POP, footLift, stompAge, STOMP1, STOMP2, V_CAR, V_PLANE, V_TOUCH, S_TOUCH,
  V_EARTH_CRACK, V_EARTH_BURST, V_PUSH, T_SWITCH, AU, R_E, R_SUN, FOOT_X, sizeAt,
} from './timeline.js';
import { DEG, lerp, smooth, wobble, clamp } from './util.js';
import { makeCompositor } from './compose.js';

const W = 1080, H = 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));
const RW = Math.round(W * RES), RH = Math.round(H * RES);

const stage = document.getElementById('stage');
// log depth: the scene runs from the asphalt at your shoes to the Sun
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const FOG0 = new THREE.Color(0.62, 0.7, 0.8);
scene.fog = new THREE.FogExp2(FOG0.clone(), 0.00004);
const camera = new THREE.PerspectiveCamera(60, W / H, 0.05, 1e14);
camera.rotation.order = 'YXZ';
scene.add(camera);

// ---------- the world ----------
const sky = makeSky();
scene.add(sky.mesh);
const earth = makeEarth(scene);
const ground = makeGround(earth.earthG);
const plainMat = (color, rough = 0.9, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };
const ctx = { plainMat, glowMat, shadowy };
const cityG = new THREE.Group();
earth.earthG.add(cityG);
const city = makeCity(cityG, ctx);
const you = makeYou(scene);
const air = makeAir(scene, ctx);
const glows = makeGlows(scene, 6000);
const smoke = makeSmoke(scene, 6000);
smoke.mat.uniforms.uLight.value.setRGB(1.0, 0.97, 0.92);

// light: the Sun (casts your shadow), the sky's blue from above and the ground's bounce; a point light for the end
const sunL = new THREE.DirectionalLight(0xfff1dc, 3.3);
sunL.castShadow = true;
sunL.shadow.mapSize.set(4096, 4096);
sunL.shadow.bias = -0.0004;
scene.add(sunL, sunL.target);
const hemi = new THREE.HemisphereLight(0x9cc2ff, 0x6b6155, 1.15);
scene.add(hemi);
const nearL = new THREE.PointLight(0xffe2b0, 0, 0, 2);
scene.add(nearL);
// in space: a dim cool fill from the camera's side (starlight), so you read even with the Sun behind you
const fillL = new THREE.DirectionalLight(0x9fb4ff, 0);
scene.add(fillL, fillL.target);

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
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.45, 0.5, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.3 }, uTitle: { value: 0 }, uCounter: { value: 0 },
    uAb: { value: 0 }, uFlash: { value: 0 }, uFlashC: { value: new THREE.Color(1, 0.95, 0.85) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uAb; uniform float uFlash; uniform vec3 uFlashC;
    varying vec2 vUv;
    void main() {
      vec2 off = (vUv - 0.5) * uAb * 0.01;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.22);
      col += uFlashC * uFlash;
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.45 * exp(-pow((vUv.y - 0.345) / 0.09, 2.0));
      col *= 1.0 - uCounter * 0.32 * exp(-pow((vUv.y - 0.53) / 0.065, 2.0)) * smoothstep(0.8, 0.2, vUv.x);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- you in space: facing the Sun, the right hand reaching for it ----------
// your heading in space (after Earth is gone): the Sun 35 degrees to your right
const sunYaw = Math.atan2(SUN_DIR.x, SUN_DIR.z);
const SPACE_YAW = sunYaw + 35 * DEG;
const V_TURN0 = 41.2, V_TURN1 = 44.5;
// the reach direction in the figure's own frame (it points at the Sun), and where the palm ends up (you-units,
// world-aligned, relative to the anchor) when the reach is complete: the Sun closes in on that point
const reachLocal = SUN_DIR.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -SPACE_YAW);
const HANDREF = new THREE.Vector3(), NREF = new THREE.Vector3();
{
  you.root.position.set(0, 0, 0); you.root.scale.setScalar(1); you.root.rotation.set(0, SPACE_YAW, 0);
  you.pose({ float: 1, reach: 1, reachDir: reachLocal, curl: 0.2, lift: [0, 0] });
  you.root.updateMatrixWorld(true);
  you.palmPoint(HANDREF);
  you.palmNormal(NREF);
}
const L_TOUCH = AU / S_TOUCH;         // you-units between the palm and the Sun when the reach is done... at the touch: 0
// the Sun's position (world metres) at video time v: where it really is, seen from a you that grows round it
function sunPos(v, out) {
  const s = sizeAt(v);
  // (resting on the palm: its centre one solar radius above the skin)
  if (v >= V_TOUCH) return you.palmPoint(out, R_SUN / s);
  return out.copy(HANDREF).addScaledVector(NREF, R_SUN / s).multiplyScalar(s).addScaledVector(SUN_DIR, Math.max(0, AU - s * L_TOUCH));
}

// ---------- the camera: one function per shot (positions in metres; most scale with you) ----------
const dirAz = (az) => new THREE.Vector3(Math.sin(az * DEG), 0, -Math.cos(az * DEG));
const v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), v5 = new THREE.Vector3();
const lookAt = (pos, tgt) => { v3.copy(tgt).sub(pos); return { yaw: Math.atan2(-v3.x, -v3.z), pitch: Math.atan2(v3.y, Math.hypot(v3.x, v3.z)) }; };
const sunW = new THREE.Vector3();
const pelW = new THREE.Vector3();
function camAt(v, s) {
  const S = s.s;
  // the point under the middle of your body (it moves when you turn round your right foot in space)
  you.pelvis.getWorldPosition(pelW);
  const C = new THREE.Vector3(pelW.x, 0, pelW.z), cx = C.x;
  const sh = s.shot;
  const k = smooth(sh.a, sh.b, v);
  let pos = new THREE.Vector3(), tgt = new THREE.Vector3(), fov = 60, roll = wobble(v * 0.3, 7) * 0.4 * DEG;
  if (sh.k === 'street') {
    // backing away down the avenue from the taxi in front of your shoe, looking up as you grow
    // low by the taxi at first, then backing off down the avenue and rising like a drone, so you always fill the frame
    const d = 8.5 * Math.pow(10, Math.max(v, -1.5) * 0.168);
    // (from 5.5 s it climbs out of the street canyon, so the towers in front don't hide you once you're wider than the street)
    pos.set(-3.4 - 0.012 * d + wobble(v * 0.6, 2) * 0.12, 1.25 + 0.115 * d + 0.62 * d * smooth(5.5, 9.5, v) + Math.abs(Math.sin(v * 5.5)) * 0.03 * smooth(4, 0, v), d);
    const aimY = S * 1.75 * lerp(0.5, 0.56, smooth(1, 9.5, v));
    tgt.set(cx * 0.6, aimY, 0);
    fov = lerp(64, 70, smooth(2, 9.5, v));
  } else if (sh.k === 'drone') {
    const az = lerp(200, 236, k), dist = lerp(3.3, 4.0, k), hh = lerp(1.25, 1.05, k);
    pos.copy(C).addScaledVector(dirAz(az), dist * S).add(v4.set(0, hh * S, 0));
    tgt.set(cx, 0.82 * S, 0);
    fov = 56;
  } else if (sh.k === 'feet') {
    const az = lerp(214, 236, k), dist = lerp(2.0, 3.2, Math.pow(k, 1.2)), hh = lerp(0.42, 1.05, Math.pow(k, 1.2));
    pos.copy(C).addScaledVector(dirAz(az), dist * S).add(v4.set(0, hh * S, 0));
    tgt.set(cx, lerp(0.62, 0.8, Math.pow(k, 1.2)) * S, 0.02 * S);
    fov = lerp(62, 54, k);
  } else if (sh.k === 'ball') {
    // then down to the ball under your shoe, level with it, to watch it crack
    const kz = smooth(36.8, 39.4, v);
    const az = lerp(230, 250, k);
    const rB = R_E / S;                       // Earth's radius in your own size
    const dist = lerp(lerp(3.3, 2.9, k), 1.15, kz), hh = lerp(lerp(1.0, 0.9, k), 0.03, kz);
    pos.copy(C).addScaledVector(dirAz(az), dist * S).add(v4.set(0, hh * S, 0));
    pos.lerp(v5.set(0, 0, 0).addScaledVector(dirAz(az + 25), dist * S).add(v4.set(0, hh * S, 0)), kz);
    tgt.set(lerp(cx, 0.03 * S, kz), lerp(0.72 * S, -rB * S * 0.3 + 0.02 * S, kz), 0);
    fov = lerp(54, 44, kz);
  } else if (sh.k === 'sun') {
    // far behind you on the line from the Sun, a long lens: your silhouette against the Sun, the Sun shrinking
    sunPos(v, sunW);
    const toSun = v4.copy(sunW).sub(C).normalize();
    const side = v5.crossVectors(toSun, new THREE.Vector3(0, 1, 0)).normalize();
    const D = 260 * S;
    // (camera above and to the side of the line, so the Sun, further away, shows up beside your head)
    pos.copy(C).addScaledVector(toSun, -D).addScaledVector(side, 1.3 * S).add(new THREE.Vector3(0, 3.4 * S, 0));
    tgt.copy(C).add(new THREE.Vector3(0, 0.85 * S, 0));
    fov = 2 * Math.atan(1.25 * S / D) / DEG;
  } else if (sh.k === 'reach') {
    // from behind your right shoulder; the view aimed between your chest and the Sun, so both stay in frame
    sunPos(v, sunW);
    const toSun = v4.copy(sunW).sub(C).setY(0).normalize();
    const side = v5.crossVectors(new THREE.Vector3(0, 1, 0), toSun).normalize();     // to your left of the Sun line
    pos.copy(C).addScaledVector(toSun, -lerp(2.3, 1.8, k) * S).addScaledVector(side, -lerp(1.0, 0.8, k) * S).add(new THREE.Vector3(0, lerp(1.8, 1.65, k) * S, 0));
    const palm = you.palmPoint(new THREE.Vector3());
    const chest = new THREE.Vector3().copy(C).add(new THREE.Vector3(0, 1.2 * S, 0)).lerp(palm, 0.35);
    const d1 = chest.sub(pos).normalize(), d2 = new THREE.Vector3().copy(sunW).sub(pos).normalize();
    tgt.copy(pos).add(d1.multiplyScalar(0.6).addScaledVector(d2, 0.4).normalize());
    fov = lerp(58, 44, k);
  } else {
    // the palm: from above and behind your hand, the Sun on it; at the end, pushing into the Sun until it's all you see
    const palm = you.palmPoint(new THREE.Vector3());
    const nrm = you.palmNormal(new THREE.Vector3());
    const toSun0 = v4.copy(palm).sub(C).setY(0).normalize();
    // (a slow push in; the white at the end is the Sun's light swelling, not the lens going into your hand)
    const push = smooth(V_PUSH - 0.4, T_SWITCH, v);
    const dd = lerp(lerp(1.0, 0.7, smooth(55, 57.9, v)), 0.45, push);
    const dir = new THREE.Vector3().copy(nrm).multiplyScalar(0.75).addScaledVector(toSun0, -0.6).add(new THREE.Vector3(0, 0.3, 0)).normalize();
    pos.copy(palm).addScaledVector(dir, dd * S);
    tgt.copy(palm).lerp(you.pelvis.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.55 * S, 0)), 0.12 * (1 - push));
    fov = lerp(44, 36, push);
  }
  const o = lookAt(pos, tgt);
  // (the drift is in proportion to the lens: a long lens would otherwise swing you out of the frame)
  const wk = fov / 60;
  return { pos, yaw: o.yaw + wobble(v * 0.4, 4) * 0.3 * DEG * wk, pitch: o.pitch + wobble(v * 0.5, 3) * 0.3 * DEG * wk, roll, fov, C };
}

const tmpC = new THREE.Color();
const tmpV = new THREE.Vector3();
let lastShot = '';
function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) s.flash = Math.max(s.flash, cover);
  const S = s.s;

  // ---------- you ----------
  const turn = smooth(V_TURN0, V_TURN1, v);
  const floatK = smooth(V_EARTH_BURST, V_EARTH_BURST + 1.6, v);
  you.root.scale.setScalar(S);
  you.root.position.set(0, -s.sink * S, 0);
  you.root.rotation.set(0, SPACE_YAW * turn, 0);
  const lift = footLift(v);
  const headLook = v < 21.5 ? [0.35 + 0.25 * smooth(0, 9, v), 0.08 * Math.sin(v * 0.4)] : v < 41 ? [0.45, 0] : [lerp(0.4, -0.1, turn), 0];
  you.pose({ lift, float: floatK, reach: s.reach, reachDir: reachLocal, curl: lerp(0.4, 0.2, s.reach), head: headLook, armsOut: 0.08 * Math.sin(v * 0.9) * (1 - floatK) });
  you.root.updateMatrixWorld(true);

  // ---------- the camera ----------
  const cam = camAt(v, s);
  // stomps: the shock reaches the camera a moment later; earthquakes while you sink
  let shake = 0, punch = 0;
  {
    const { age, st } = stompAge(v);
    if (st) {
      const fx = FOOT_X[st.foot] * sizeAt(st.down);
      const delay = Math.min(0.35, cam.pos.distanceTo(tmpV.set(fx, 0, 0)) / 3500);
      const a = age - delay;
      if (a > 0) { shake = Math.max(shake, (st === STOMP1 ? 1.4 : 1.0) * Math.exp(-a / 0.45)); punch = Math.max(punch, smooth(0, 0.05, a) * Math.exp(-a / 0.25)); }
    }
    if (v > V_CAR && v < V_CAR + 0.8 && s.shot.k === 'street') shake = Math.max(shake, 0.35 * Math.exp(-(v - V_CAR) / 0.2));
    if (s.shot.k === 'feet' || (s.shot.k === 'drone' && v > 19.5)) shake = Math.max(shake, 0.12 + 0.2 * smooth(24, 31, v));
    if (v > V_EARTH_CRACK && v < V_EARTH_BURST + 1.5) shake = Math.max(shake, 0.5 * smooth(V_EARTH_CRACK, V_EARTH_BURST, v) * (1 - smooth(V_EARTH_BURST + 0.3, V_EARTH_BURST + 1.5, v)));
    if (v > V_TOUCH && v < V_TOUCH + 1.2) { const a = v - V_TOUCH; shake = Math.max(shake, 0.6 * Math.exp(-a / 0.3)); punch = Math.max(punch, Math.exp(-a / 0.2) * 0.6); }
  }
  shake = Math.min(shake, 1.6);
  const sh = shake * 0.01 * cam.fov / 60;
  cam.pitch += wobble(v * 43, 3) * sh + -punch * 1.2 * DEG;
  cam.yaw += wobble(v * 47, 4) * sh;
  cam.roll += wobble(v * 29, 5) * sh * 0.8;
  camera.position.copy(cam.pos);
  camera.rotation.set(cam.pitch, cam.yaw, cam.roll);
  camera.fov = cam.fov * (1 - 0.04 * punch);
  // near / far planes follow your size (the street shot needs the asphalt in front of the lens)
  const camD = cam.pos.distanceTo(cam.C);
  camera.near = s.shot.k === 'street' ? 0.08 : s.shot.k === 'palm' ? Math.max(0.0005 * S, 1) : Math.max(0.02 * S, 0.05) * (s.shot.k === 'sun' ? 50 : 1);
  camera.far = 1e14;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const camY = Math.max(camera.position.y, 0);

  // ---------- the Sun, the sky ----------
  sunPos(v, sunW);
  earth.sun.position.copy(sunW);
  earth.sunU.uTime.value = v;
  const toSun = tmpV.copy(sunW).sub(cam.C.clone().add(new THREE.Vector3(0, 0.9 * S, 0))).normalize();
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  sky.mesh.scale.setScalar(Math.max(1, camera.near * 50));
  u.uAlt.value = camY;
  const rC = R_E + camY;
  u.uDip.value = Math.sqrt(Math.max(0, 1 - Math.pow(R_E / rC, 2)));
  u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / RH;
  u.uTime.value = v;
  const sunFromCam = v4.copy(sunW).sub(camera.position).normalize();
  u.uSunDir.value.copy(sunFromCam);
  u.uSpace.value = smooth(28, 33, v);
  const sunAng = Math.atan(R_SUN / Math.max(sunW.distanceTo(camera.position), 1));
  u.uSunAng.value = sunAng;
  u.uGlare.value = 1 - smooth(52, 54, v);
  const fogD = 0.000035 / (1 + camY / 400) * (1 - smooth(9, 20, v)) + 0.000003 / (1 + camY / 4000) * (1 - smooth(20, 26, v));
  scene.fog.density = fogD;
  scene.fog.color.copy(FOG0);
  glows.mat.uniforms.uFogD.value = fogD;
  earth.atmoU.uOn.value = smooth(1e5, 1e6, camY);
  SURF.uSunL.value.copy(SUN_DIR);
  SURF.uTime.value = v;
  F.uSunDir.value.copy(SUN_DIR);
  F.uDust.value = smooth(STOMP1.down + 0.3, STOMP1.down + 2.5, v) * 0.3 + smooth(STOMP2.down, STOMP2.down + 3, v) * 0.5;
  GU.uDust.value = F.uDust.value;
  // cracks and molten rock round your shoes, from when the rock gives way
  SURF.uCrack.value = s.crack * (1 - 0.6 * smooth(31, 34, v));
  SURF.uCrackR.value = lerp(0.25, 1.6, smooth(19.5, 31, v)) * (1 - 0.6 * smooth(31, 35, v));
  SURF.uCrackS.value = S;
  SURF.uHeat.value = smooth(22, 28, v) * (1 - smooth(32, 34, v));

  // ---------- light ----------
  sunL.position.copy(cam.C).addScaledVector(toSun, 8 * S).add(v5.set(0, 0.9 * S, 0));
  sunL.target.position.copy(cam.C).add(v5.set(0, 0.9 * S, 0));
  sunL.target.updateMatrixWorld();
  const shadowOn = v < 33;
  sunL.castShadow = shadowOn;
  if (shadowOn) {
    const sc = sunL.shadow.camera;
    const half = 3.4 * S;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
    sc.near = 0.5 * S; sc.far = 16 * S;
    sc.updateProjectionMatrix();
    sunL.shadow.normalBias = 0.0;
  }
  const space = smooth(22, 30, v);
  sunL.intensity = 3.3 * (1 + 0.25 * space);
  hemi.intensity = lerp(1.15, 0.04, space);
  hemi.color.setRGB(0.61, 0.76, 1.0);
  you.setRim(lerp(0.0, 0.08, space), lerp(0.0, 0.1, space), lerp(0.0, 0.16, space));
  fillL.intensity = (s.shot.k === 'sun' ? 0.12 : 0.55) * smooth(28, 34, v);
  fillL.position.copy(camera.position); fillL.target.position.copy(cam.C).add(v5.set(0, 0.9 * S, 0)); fillL.target.updateMatrixWorld();
  // the Sun in your hand lights it from inside the palm
  const nearK = smooth(V_TOUCH - 1.5, V_TOUCH, v);
  nearL.position.copy(sunW);
  nearL.intensity = nearK * 0.02 * S * S;
  renderer.toneMappingExposure = lerp(1.0, 1.15, space);

  // ---------- Earth: crushed under your shoe, then pieces ----------
  {
    const kc = s.earthCrack;
    earth.earthG.visible = s.earthBurst < 0.5;
    earth.earthG.scale.set(1 + 0.3 * kc, 1 - 0.35 * kc, 1 + 0.3 * kc);
    earth.globeU.uCrush.value = kc;
    cityG.visible = v < 31;
    earth.globeU.uHole.value = v < 31 ? 400e3 / R_E : 0;
    ground.disk.visible = v < 31;
    const fr = earth.frags;
    const dt = v - V_EARTH_BURST;
    if (dt > -0.05 && dt < 3) {
      fr.count = earth.FR.length;
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), scl = new THREE.Vector3();
      earth.FR.forEach((f, i) => {
        const t = Math.max(dt, 0);
        // flung out, slowed, then pulled back onto your sole and smeared round it
        const out = 1 + f.sp * (1 - Math.exp(-t / 0.35)) * (1 - smooth(0.5, 2.6, t) * 0.8);
        p.copy(f.dir).multiplyScalar(R_E * 1.3 * out).add(EARTH_C);
        p.y *= 1 - 0.4 * smooth(0.0, 0.8, t);
        p.lerp(tmpV.set(p.x * 0.6, -0.01 * S, p.z * 0.6), smooth(0.8, 2.6, t) * 0.6);
        e.set(f.spin.x * t, f.spin.y * t, f.spin.z * t);
        q.setFromEuler(e);
        m4.compose(p, q, scl.setScalar(f.size * R_E * (1 - smooth(1.5, 3, t))));
        fr.setMatrixAt(i, m4);
      });
      fr.instanceMatrix.needsUpdate = true;
      fr.material.emissiveIntensity = 2.2 * Math.exp(-Math.max(dt, 0) / 1.4);
    } else fr.count = 0;
    // the Moon: there until you're bigger than its whole orbit (it ends up a speck)
    earth.moon.visible = v < 46;
  }
  // the planets' orbits fade in once you are as big as the inner Solar System
  {
    const ko = smooth(45.5, 49, v);
    earth.orbitMat.opacity = 0.5 * ko * (1 - smooth(V_PUSH, V_PUSH + 0.8, v));
    earth.orbits.position.copy(sunW);
    earth.orbits.visible = ko > 0;
    const pxS = R_SUN / Math.max(sunW.distanceTo(camera.position), 1) / Math.tan(camera.fov * DEG / 2) * H;
    earth.sunU.uBright.value = clamp(1.6 / (1 + pxS / 40), 0.0, 1) + 3 * smooth(V_PUSH, T_SWITCH, v);
  }

  // ---------- everything in the city ----------
  glows.begin(camera); smoke.begin();
  smoke.mat.uniforms.uTime.value = v;
  smoke.mat.uniforms.uSun.value.copy(SUN_DIR);
  if (v < 31) city.frame(v, s, glows, smoke, camY);
  const pl = v < 30 ? air.frame(v, camera.position, SUN_DIR, S) : (air.smoke.begin(), air.smoke.end(), air.plane.visible = false, null);
  if (pl && pl.on > 0) glows.add(pl.px, pl.y, pl.z, 160, 3, 2.8, 2.5);
  // dust rings from the stomps, rolling out across the city
  for (const st of [STOMP1, STOMP2]) {
    const age = v - st.down;
    if (age < 0 || age > 8) continue;
    const sAt = sizeAt(st.down), fx = FOOT_X[st.foot] * sAt;
    const n = 64, big = st === STOMP2;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + 0.1 * Math.sin(k * 3.1);
      const rr = sAt * 0.16 + (big ? 2600 : 50) * (1 - Math.exp(-age / (big ? 1.4 : 0.9)));
      const r = (big ? 260 : 7) + age * (big ? 160 : 4);
      smoke.puff(fx + Math.cos(a) * rr, r * 0.5, Math.sin(a) * rr + sAt * 0.05, r, 0.42 * smooth(0, 0.2, age) * (1 - smooth(3, 8, age)), 0.7, 0, (k * 0.31) % 1);
    }
  }
  // the flash when Earth bursts under your shoe
  {
    const dt = v - V_EARTH_BURST;
    if (dt > -0.05 && dt < 1.5) {
      const k = Math.exp(-Math.max(dt, 0) / 0.25) * smooth(-0.05, 0.02, dt);
      glows.add(EARTH_C.x, EARTH_C.y + R_E * 0.6, EARTH_C.z, R_E * (3 + 6 * Math.max(dt, 0)), 3.0 * k, 1.6 * k, 0.6 * k);
    }
  }
  // the Sun's corona glow, and the planets as points of light on their orbits
  {
    const dS = sunW.distanceTo(camera.position);
    const px = R_SUN / dS / Math.tan(camera.fov * DEG / 2) * H;   // the Sun's radius in pixels
    // a tight corona once the disc is resolved; a point of light of ~30 px when it's too small to see as a disc
    const wh = smooth(V_PUSH, T_SWITCH - 0.05, v);
    const gs = Math.max(R_SUN * (px > 40 ? 1.7 : 2.4), 30 / H * dS * Math.tan(camera.fov * DEG / 2)) * (1 + 60 * wh * wh);
    const b = (v > 20 ? 1 : 0.4) * clamp(1.4 / (1 + px / 80), 0.15, 1) * (1 + 6 * wh);
    glows.add(sunW.x, sunW.y, sunW.z, gs, 1.6 * b, 1.3 * b, 0.95 * b);
    if (earth.orbits.visible) {
      const ko = smooth(45.5, 49, v);
      for (const pz of earth.PLANETS) {
        if (pz.a === 1.0) continue;   // Earth is gone
        tmpV.set(Math.cos(pz.ph) * pz.a * AU, 0, Math.sin(pz.ph) * pz.a * AU).applyEuler(earth.orbits.rotation).add(sunW);
        const dd = tmpV.distanceTo(camera.position);
        const sz = dd * 0.0035 * Math.tan(camera.fov * DEG / 2);
        glows.add(tmpV.x, tmpV.y, tmpV.z, sz, pz.col[0] * ko, pz.col[1] * ko, pz.col[2] * ko);
      }
    }
  }
  glows.end(); smoke.end();

  // ---------- post ----------
  bloom.strength = 0.45 + 0.4 * smooth(V_PUSH, T_SWITCH, v);
  finish.uniforms.uTime.value = v;
  finish.uniforms.uAb.value = punch * 0.8 + shake * 0.05;
  finish.uniforms.uFlash.value = 0;
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
  await earth.ready;
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  for (const t of [58, 50, 44, 36, 26, 15, 5, 0]) renderFrame(t);
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, earth, you };
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

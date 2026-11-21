// "What if you were 1 trillion times stronger?" — one continuous shot. The camera starts close in front of you on a
// harbor plaza (a car over your head) and eases back the whole time as the things you lift get bigger, following you
// from the bus to the truck, the jet, the cruise ship, the tower, across the harbor, to the mountain. Post: bloom, a
// soft vignette, darkening behind the text, the white at the end; the last LOOP seconds replay the lead-in to frame 0
// while the white clears.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky, skyColors } from './sky.js';
import { makeWorld, GU, hazed, craterH, NCR } from './world.js';
import { makeBus, makeTruck, makeJet, makeShip, makeTower, JET_GEAR, SHIP_CUTS } from './things.js';
import { makeMountain } from './mountain.js';
import { makeFleet } from './cars.js';
import { makeGlows } from './glows.js';
import { makeSmoke } from './smoke.js';
import { makeCrowd } from './crowd.js';
import { makeOverlay } from './overlay.js';
import { makeYou, FLAP } from './you.js';
import { makePeople } from './people.js';
import { makeFx } from './fx.js';
import { SPOT, BUS, TRUCK, JET, SHIP, TOWER, MTN, SEA_Y, STREET, QUAY_Z } from './layout.js';
import { thingAt, youAt, towerPiece, mountainAt, shipSag, CAR_C, BUS_C, TRUCK_C, JET_C } from './choreo.js';
import { state, VIDEO_DURATION, LOOP, captionAt, B, HITS, T_SWITCH, V_WHITE } from './timeline.js';
import { lerp, smooth, wobble, clamp, rng } from './util.js';
import { CAMK } from './camera.js';

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
const camera = new THREE.PerspectiveCamera(56, W / H_PX, 0.2, 40000);
scene.add(camera);
const plainMat = (color, rough = 0.9, extra = {}) => hazed(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };
const ctx = { plainMat, glowMat, shadowy };
const sky = makeSky();
scene.add(sky.mesh);
sky.mesh.scale.setScalar(6);
const world = makeWorld(scene, ctx);

// ---------- the things ----------
const centred = (built, c) => {           // a parent at the thing's centre, the model below it
  const P = new THREE.Group();
  built.g.position.y = -c;
  P.add(built.g); scene.add(P);
  return { ...built, P };
};
const bus = centred(makeBus(), BUS_C);
const truck = centred(makeTruck(), TRUCK_C);
const jet = centred(makeJet(), JET_C);
const ship = makeShip().map((pc) => { const P = new THREE.Group(); P.add(pc.g); scene.add(P); return { ...pc, P }; });
const tower = makeTower().map((pc) => { const P = new THREE.Group(); P.add(pc.g); scene.add(P); return { ...pc, P }; });
const mtn = makeMountain(scene);
// the cars: the one in your hand (0) and the parked ones
const CARS = [];
{
  const R = rng(808);
  const PAINT = [0x2b5fb8, 0xd8d8d4, 0x1c1c1e, 0x8a1d1d, 0x6b7280, 0xe7e2d6, 0x2f4f3a, 0x9fb0c4, 0x343a46];
  CARS.push({ x: 0, z: 0, yaw: 0, col: 0x2b5fb8, kind: 0, hero: true });
  // the street's east curb lane north of the bus, the west curb lane, a few stopped in the middle lanes
  for (let z = -16; z > QUAY_Z + 10; z -= 6.2 + 2 * R()) if (z > -38 || z < -80) CARS.push({ x: STREET.x1 - 1.6, z, yaw: Math.PI, col: PAINT[Math.floor(R() * 9)], kind: Math.floor(R() * 3) });
  for (let z = 24; z > QUAY_Z + 10; z -= 6.4 + 2.5 * R()) CARS.push({ x: STREET.x0 + 1.6, z, yaw: 0, col: PAINT[Math.floor(R() * 9)], kind: Math.floor(R() * 4) });
  for (const [x, z, y] of [[-15.5, 14, 0.08], [-11.8, 22, -0.05], [-15.6, -24, 0.12], [-8.9, 16, 0.02]]) CARS.push({ x, z, yaw: Math.PI + y, col: PAINT[Math.floor(R() * 9)], kind: Math.floor(R() * 3) });
  // on the plaza's drop-off by the terminal
  for (const [x, z, y] of [[-1.5, -60, 1.3], [3.5, -64, 1.6], [-0.5, -72, 1.5]]) CARS.push({ x, z, yaw: y, col: PAINT[Math.floor(R() * 9)], kind: Math.floor(R() * 3) });
}
const fleet = makeFleet(scene, CARS.length, { plainMat, glowMat, shadowy });
CARS.forEach((c, i) => fleet.color(i, c.col, c.kind));
const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), v4 = new THREE.Vector3(), s4 = new THREE.Vector3(1, 1, 1);
CARS.forEach((c, i) => { if (!c.hero) fleet.set(i, m4.compose(v4.set(c.x, 0, c.z), q4.setFromEuler(e4.set(0, c.yaw, 0)), s4), false); });

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
// a fire light for the burning jet
const fireL = new THREE.PointLight(0xff8a3a, 0, 120, 1.6);
scene.add(fireL);

// ---------- you ----------
const you = makeYou(scene, { hoodie: 0xff8a1e, jeans: 0x283246, skin: 0xd09a74, hair: 0x2a1a10 });
you.root.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
// (place you with your middle, between your feet, at x, z facing yaw; the figure's origin is its right sole)
function placeYou(x, y, z, yaw) { you.root.rotation.y = yaw; you.root.position.set(x - 0.105 * Math.cos(yaw), y, z + 0.105 * Math.sin(yaw)); }

const overlay = makeOverlay();

// ---------- post ----------
const rt = new THREE.WebGLRenderTarget(W, H_PX, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H_PX);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv);
    if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 16.0), 1.0); }`,
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H_PX / 2), 0.25, 0.35, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.22 }, uTitle: { value: 0 }, uCounter: { value: 0 }, uCap: { value: 0 }, uWhite: { value: 0 }, uAb: { value: 0 }, uDustW: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVig; uniform float uTitle; uniform float uCounter; uniform float uCap; uniform float uWhite; uniform float uAb; uniform float uDustW;
    varying vec2 vUv;
    void main() {
      vec2 off = (vUv - 0.5) * uAb * 0.01;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.12);
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.5 * exp(-pow((vUv.y - 0.79) / 0.09, 2.0));
      col *= 1.0 - uCounter * 0.42 * exp(-pow((vUv.y - 0.6) / 0.085, 2.0)) * smoothstep(1.1, 0.2, vUv.x);
      col *= 1.0 - uCap * 0.45 * exp(-pow((vUv.y - 0.125) / 0.045, 2.0));
      float e = length(c * vec2(1.3, 1.0));
      col = mix(col, vec3(0.86, 0.8, 0.72), uDustW * smoothstep(0.75 - 0.75 * uDustW, 0.95 - 0.6 * uDustW, e));
      col = mix(col, vec3(1.0, 0.99, 0.96), uWhite);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- the camera: keys [t, x, y, z, tx, ty, tz, fov], monotone cubic per channel ----------
const camSpl = [1, 2, 3, 4, 5, 6, 7].map((j) => {
  const x = CAMK.map((k) => k[0]), y = CAMK.map((k) => k[j]), n = x.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  m[0] = 0; m[n - 1] = 0;
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]);
  return (t) => {
    if (t <= x[0]) return y[0]; if (t >= x[n - 1]) return y[n - 1];
    let i = 0; while (t > x[i + 1]) i++;
    const h = x[i + 1] - x[i], s = (t - x[i]) / h;
    return (2 * s ** 3 - 3 * s ** 2 + 1) * y[i] + (s ** 3 - 2 * s ** 2 + s) * h * m[i] + (-2 * s ** 3 + 3 * s ** 2) * y[i + 1] + (s ** 3 - s ** 2) * h * m[i + 1];
  };
});
const DBG_CAM = params.get('cam') ? params.get('cam').split(',').map(Number) : null;

// ---------- update ----------
const tmpC = new THREE.Color(), tv = new THREE.Vector3(), tv2 = new THREE.Vector3();
const C = (a) => tmpC.setRGB(a[0], a[1], a[2]);
const SUN_EL = 46, SUN_AZ = 138;
const SUNDIR = (() => { const el = SUN_EL * DEG, az = SUN_AZ * DEG; return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)); })();
const kickAt = (v) => { let k = 0; HITS.forEach((t, n) => { const dt = v - t; if (dt > -0.05 && dt < 1.5) k = Math.max(k, smooth(-0.05, 0.04, dt) * Math.exp(-Math.max(dt, 0) / 0.35) * (0.3 + 0.08 * n)); }); return k; };
const mtx = (p, q, off = 0) => m4.compose(p, q, s4).multiply(new THREE.Matrix4().makeTranslation(0, -off, 0));
const place = (obj, st) => { obj.P.position.copy(st.p); obj.P.quaternion.copy(st.q); };
const local = (obj, x, y, z) => tv.set(x, y, z).applyMatrix4(obj.P.matrixWorld);

function update(v, cover = -1) {
  const s = state(v);
  const white = Math.max(s.flash, cover);
  if (cover >= 0) s.title *= 1 - smooth(0.55, 1, cover);
  s.kick = kickAt(v);
  // ---- the things ----
  const car = thingAt('car', v);
  fleet.set(0, mtx(car.p, car.q, CAR_C), false);
  fleet.commit();
  const bs = thingAt('bus', v); place(bus, bs); bus.DU.uCrush.value = bs.crush || 0;
  const ts = thingAt('truck', v); place(truck, ts); truck.DU.uCrush.value = ts.crush || 0;
  const js = thingAt('jet', v); place(jet, js); jet.DU.uCrush.value = js.crush || 0;
  const sm = thingAt('shipMid', v);
  const sag = shipSag(v);
  {
    // the middle piece is held; the bow and stern pieces hang from its ends, sagging
    const Mmid = new THREE.Matrix4().compose(sm.p, sm.q, s4);
    const piv = (x, ang, apart) => new THREE.Matrix4().makeTranslation(x + apart, -4 - Math.abs(apart) * 0.3, 0).multiply(new THREE.Matrix4().makeRotationZ(ang)).multiply(new THREE.Matrix4().makeTranslation(-x, 4, 0));
    const Ms = [Mmid.clone().multiply(piv(SHIP_CUTS[1], sag.bow, -sag.apart)), Mmid, Mmid.clone().multiply(piv(SHIP_CUTS[2], -sag.stern, sag.apart))];
    ship.forEach((pc, i) => { pc.P.matrixAutoUpdate = false; pc.P.matrix.copy(Ms[i]); pc.P.matrixWorldNeedsUpdate = true; pc.DU.uCrush.value = sm.crush || 0; });
  }
  tower.forEach((pc, k) => { const st = towerPiece(k, v); place(pc, st); pc.DU.uCrush.value = st.crush || 0; });
  const ms = mountainAt(v);
  mtn.g.matrixAutoUpdate = false; mtn.g.matrix.copy(ms.M).multiply(new THREE.Matrix4().makeTranslation(MTN.x, 0, MTN.z)); mtn.g.matrixWorldNeedsUpdate = true;
  mtn.MU.uCrack.value = ms.crack; mtn.MU.uTime.value = v;
  scene.updateMatrixWorld(true);

  // ---- craters and cracks under your feet ----
  fx.craters(v, GU);
  // ---- you ----
  const Y = youAt(v);
  const ground = craterH(Y.x, Y.z);
  let yy = ground + Y.air;
  const pose = { hipY: 0.9, footZ: 0.0, lean: 0.03, head: [0.05, 0], curl: 0.4 };
  const L = Y.lift;
  if (Y.mode === 'run') {
    you.run({ ph: Y.gaitPh, amp: Y.amp, t: v, wind: 0.3 });
  } else if (Y.mode === 'bound' || Y.mode === 'leap') {
    // airborne: a long stride, leaning in, arms driving; crouched on each touchdown
    const k = Y.boundK ?? 0;
    if (Y.mode === 'leap' && Y.preK < 1) { you.pose({ hipY: 0.62, footZ: 0.15, lean: 0.45, head: [-0.3, 0], armsFwd: -0.4 }); }
    else you.run({ ph: Math.PI * (0.5 + 0.9 * k) + Math.PI * (Y.boundI % 2), amp: 1, float: 1, fly: Y.mode === 'leap' ? 0.25 * Math.sin(Math.PI * k) : 0, t: v, wind: 0.7 });
  } else {
    // standing / lifting
    const lk = L ? L.k : 0;
    const strain = L && !L.rel ? 1 : 0;
    const crouchDepth = L ? (L.thing === 'car' ? 0 : L.thing === 'mtn' || L.thing === 'ship' || L.thing === 'tower' ? 0.42 : 0.32) : 0;
    const cr = L ? (L.thing === 'car' ? 0 : (1 - smooth(0.25, 0.85, lk)) * smooth(0, 0.15, lk)) : 0;
    const big = L && (L.thing === 'mtn' || L.thing === 'tower' || L.thing === 'ship');
    const crouch = big ? Math.max(cr, 0.55 * smooth(0, 0.12, lk)) : cr;
    pose.hipY = 0.92 - crouchDepth * crouch - 0.12 * (L ? L.throwK : 0) * 0;
    pose.lean = 0.04 + 0.35 * crouch + (L ? 0.12 * L.throwK : 0);
    pose.footZ = 0.05 + 0.12 * crouch;
    pose.head = [L && L.thing !== 'car' ? -0.35 - 0.25 * (1 - crouch) : -0.1, 0.0];
    if (L && L.thing === 'car') pose.head = [0.05 + 0.05 * Math.sin(v * 1.3), 0.15];
    you.pose(pose);
  }
  placeYou(Y.x, yy, Y.z, Y.yaw);
  you.root.updateMatrixWorld(true);
  // the hands on the grip points of what you hold
  if (L && !(Y.mode === 'run' || Y.mode === 'bound' || Y.mode === 'leap')) {
    const sh = 0.004 * Math.sin(v * 41) + 0.003 * Math.sin(v * 67);
    const gL = new THREE.Vector3(), gR = new THREE.Vector3();
    const fw = tv2.set(Math.sin(Y.yaw), 0, Math.cos(Y.yaw));
    const rightV = new THREE.Vector3(-Math.cos(Y.yaw), 0, Math.sin(Y.yaw));
    let wristUp = 1, pole = null;
    if (L.thing === 'car') {
      gL.copy(local({ P: { matrixWorld: m4.compose(car.p, car.q, s4) } }, 0.1, -0.44, 0.15));
      if (v > B.carToss + 0.08) gL.set(Y.x, 1.9, Y.z).addScaledVector(rightV, -0.35).addScaledVector(fw, 0.45);
      you.armTo(1, gL, { wristUp: v < B.carToss ? 1 : 0.2, grip: 0.3 });
    } else {
      if (L.thing === 'bus' || L.thing === 'truck') {
        const obj = L.thing === 'bus' ? bus : truck, C0 = L.thing === 'bus' ? BUS_C : TRUCK_C, floor = L.thing === 'bus' ? 0.33 : 1.05, half = L.thing === 'bus' ? 1.25 : 1.2;
        const k = smooth(0.35, 0.85, L.k), sd = L.thing === 'bus' ? 1 : -1;
        const x = lerp(sd * half, sd * 0.2, k), y = lerp(-C0 + floor + 0.05, -C0 + floor, k);
        gL.copy(local(obj, x, y, -0.45)); gR.copy(local(obj, x, y, 0.45));
        wristUp = k;
      } else if (L.thing === 'jet') {
        gL.copy(local(jet, -0.32, -JET_C + 1.25, JET_GEAR.nose[1] - 0.2));
        gR.copy(local(jet, 0.32, -JET_C + 1.25, JET_GEAR.nose[1] - 0.2));
        wristUp = 0.6;
      } else if (L.thing === 'ship') {
        const rise = clamp((sm.p.y - SEA_Y) / 9.8, 0, 1);
        const zf = Math.max(sm.p.z + 19, Y.z - 0.75);
        const yh = lerp(0.9, 2.05, Math.max(rise, 0.25 * smooth(0, 0.3, L.k)));
        gL.set(Y.x, yh, zf).addScaledVector(rightV, -0.3); gR.set(Y.x, yh, zf).addScaledVector(rightV, 0.3);
        wristUp = 0.8;
      } else if (L.thing === 'tower') {
        const st = tower[0];
        gL.copy(local(st, -TOWER.w / 2 - 0.05, lerp(0.5, 0.45, L.k), Y.z - TOWER.z - 0.35));
        gR.copy(local(st, -TOWER.w / 2 - 0.05, lerp(0.5, 0.45, L.k), Y.z - TOWER.z + 0.35));
        wristUp = 0.7;
      } else if (L.thing === 'mtn') {
        const p = (dx) => tv.set(Y.x + dx - MTN.x, -0.2, MTN.z + MTN.rz - MTN.z + 0.1).add(new THREE.Vector3(MTN.x, 0, MTN.z)).applyMatrix4(ms.M).clone();
        gL.copy(p(0.3)); gR.copy(p(-0.3));
        wristUp = 0.8;
      }
      if (L.rel) {
        // after letting go: arms follow through, up and forward
        const f = smooth(0, 0.45, L.throwK);
        const up = new THREE.Vector3(Y.x, yy + 2.15, Y.z).addScaledVector(fw, 0.5);
        gL.lerp(up.clone().addScaledVector(rightV, -0.3), 1 - f * 0); gR.lerp(up.clone().addScaledVector(rightV, 0.3), 1);
      }
      gL.y += sh; gR.y -= sh;
      you.armTo(1, gL, { wristUp, grip: 0.7, pole: new THREE.Vector3().addScaledVector(rightV, -0.8).add(new THREE.Vector3(0, -0.6, 0)) });
      you.armTo(0, gR, { wristUp, grip: 0.7, pole: new THREE.Vector3().addScaledVector(rightV, 0.8).add(new THREE.Vector3(0, -0.6, 0)) });
    }
  }
  FLAP.uFT.value = v; FLAP.uFlap.value = 0.15 + 0.5 * smooth(30, 40, v) + (Y.mode === 'bound' || Y.mode === 'leap' ? 0.4 : 0);

  // ---- the camera ----
  if (DBG_CAM) {
    camera.position.set(DBG_CAM[0], DBG_CAM[1], DBG_CAM[2]);
    camera.lookAt(DBG_CAM[3], DBG_CAM[4], DBG_CAM[5]);
    camera.fov = DBG_CAM[6] || 56;
  } else {
    const K = (j) => camSpl[j](v);
    camera.position.set(K(0), K(1), K(2));
    camera.lookAt(K(3), K(4), K(5));
    camera.fov = K(6);
    const shake = (0.0012 + s.kick * 0.012 + 0.006 * smooth(B.mtnGrab, B.mtnUp, v) + 0.012 * smooth(B.mtnLand, V_WHITE, v)) * camera.fov / 56;
    camera.rotation.x += wobble(v * 43, 3) * shake; camera.rotation.y += wobble(v * 47, 4) * shake; camera.rotation.z += wobble(v * 39, 6) * shake * 0.5;
  }
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  // ---- sky and light ----
  const sc = skyColors(SUN_EL);
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  u.uSun.value.copy(SUNDIR); u.uZen.value.copy(C(sc.zen)); u.uHor.value.copy(C(sc.hor)); u.uGlow.value.copy(C(sc.glow)); u.uSunCol.value.copy(C(sc.sun));
  u.uSunI.value = 1; u.uStars.value = 0; u.uT.value = v; u.uPx.value = (camera.fov * DEG) / H_PX; u.uCloud.value = 0.75; u.uCity.value = 0;
  GU.uHaze.value.copy(C(sc.hor)).lerp(new THREE.Color(0.78, 0.74, 0.68), 0.25 * smooth(B.towerLand, B.mtnLand, v)); GU.uHazeD.value = 5200;
  world.waterU.uSky.value.copy(C(sc.hor)); world.waterU.uZen.value.copy(C(sc.zen)); world.waterU.uSun.value.copy(SUNDIR); world.waterU.uSunCol.value.copy(C(sc.sun));
  world.frame(v);
  // the sun's shadow box follows the action and grows with it
  const lc = new THREE.Vector3(Y.x, 0, Y.z);
  const big = v < 12 ? 45 : v < 18.5 ? 90 : v < 33 ? 190 : 260;
  sunL.shadow.camera.left = -big; sunL.shadow.camera.right = big; sunL.shadow.camera.top = big; sunL.shadow.camera.bottom = -big;
  sunL.shadow.camera.near = 10; sunL.shadow.camera.far = 3000; sunL.shadow.camera.updateProjectionMatrix();
  sunL.position.copy(SUNDIR).multiplyScalar(1200).add(lc);
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
  people.frame(v, crowd, Y);
  fx.frame(v, { you: Y, yy, js, sm, ms, bs, ts, world, camera, fireL });
  smoke.end(); glows.end();
  smoke.mat.uniforms.uTime.value = v;
  smoke.mat.uniforms.uLight.value.setRGB(1.25, 1.2, 1.1);
  smoke.mat.uniforms.uSun.value.copy(SUNDIR);
  bloom.strength = 0.18 + 0.15 * s.kick;
  // ---------- post ----------
  finish.uniforms.uAb.value = s.kick * 0.5;
  finish.uniforms.uDustW.value = 0.75 * smooth(V_WHITE - 1.2, V_WHITE, v);
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
  for (const t of [44, 40, 36, 32, 28, 24, 20, 16, 12, 8, 4, 2, 0]) renderFrame(t);
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, sky, state, update, you, people, youAt };
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

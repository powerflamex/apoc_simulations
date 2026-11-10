// Everything the techniques move, and how they look.
// Every movable thing (car, lamp, signal mast, neon sign, LED screen, facade chunk, bit of street) gets a fate,
// decided once from where it is:
//   blue: torn loose when Blue's reach gets to it (closest first), dragged along a spiral into the point (faster
//         and faster), tumbling, crushed smaller as it reaches the ball; the ball grows by what it swallows.
//   red:  thrown when the Red orb passes it: outward and forward, tumbling, slowed by the air, falling; it slams
//         against the building fronts and comes to rest where it lands.
//   erased: gone the moment a Hollow Purple covers it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { B, CARS, LAMPS, SIGNALS, SIGNS, SCREENS, WALK, FH } from './layout.js';
import { cellsOf, redPerp, vRedAt, GLASS_R } from './city.js';
import { vErased, erasedAt } from './cuts.js';
import { V_LAUNCH, V_LAND, throwK } from './timeline.js';
import { BLUE, GOJO, BLUE_MAX, vBlueAt, blueR, V_BLUE0, V_RELEASE, BALL_LAND, RED_LEN, redReach, redFront, V_RED, V_RED_FORM, V_RED_HIT,
  RED_P0, RED_P1, RED_SPEED, PURPLES, purpleAt, TALLY, setCarsPulled, V_DOMAIN } from './timeline.js';
import { rng, smooth, clamp, lerp } from './util.js';
import { makeFleet } from './cars.js';
import { SU } from './street.js';

const Bv = new THREE.Vector3(BLUE.x, BLUE.y, BLUE.z);
const G = 9.8, DRAG = 0.55;
const R0 = rng(31337);

// ---------- fates ----------
function blueFate(c, size, vol, extraDelay = 0) {
  const d = c.distanceTo(Bv);
  if (d > BLUE_MAX - 0.5) return null;
  const t0 = vBlueAt(d + 1.5) + extraDelay;
  if (t0 > V_RELEASE - 1.3) return null;
  const T = 0.7 + 0.025 * d;
  return { type: 'blue', t0, T, d, rel: c.clone().sub(Bv), spinDir: R0() < 0.85 ? 1 : -1, spin: 1.6 + d / 22 + R0() * 0.6,
    ax: new THREE.Vector3(R0() - 0.5, R0() - 0.5, R0() - 0.5).normalize(), tumble: 2 + R0() * 5, size, vol, ta: 0 };
}
function redFate(c, size, opts = {}) {
  const { s, q } = redPerp(c.x, c.y, c.z);
  if (s < 0 || s > RED_LEN + 30) return null;
  const reach = redReach(s) * (opts.reachK || 1.35);
  if (q > reach) return null;
  const t0 = vRedAt(s) + q / 400;
  const k = 1 - q / reach;
  const out = new THREE.Vector3(c.x - RED_P0.x, 0, 0);
  if (Math.abs(out.x) < 1) out.x = R0() < 0.5 ? -1 : 1;
  out.normalize();
  const fwd = new THREE.Vector3(RED_P1.x - RED_P0.x, 0, RED_P1.z - RED_P0.z).normalize();
  const sp = (opts.speed || 45) * (0.35 + 0.9 * k) * (0.7 + 0.6 * R0());
  const v0 = out.multiplyScalar(sp * (opts.out ?? 0.55)).addScaledVector(fwd, sp * (opts.fwd ?? 0.8));
  v0.y = (opts.up || 9) * (0.5 + R0()) * (0.5 + k);
  const f = { type: 'red', t0, c0: c.clone(), v0, ax: new THREE.Vector3(R0() - 0.5, R0() - 0.5, R0() - 0.5).normalize(), w: 2 + R0() * 7, size, rest: size * 0.35, wall: Math.abs(c.x) < WALK };
  // when it comes down (bisection on the closed-form flight)
  const p = new THREE.Vector3();
  let a = 0.05, b = 12;
  const y = (tau) => { redPos(f, tau, p); return p.y; };
  if (y(b) > f.rest) f.tl = b; else { for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (y(m) > f.rest) a = m; else b = m; } f.tl = b; }
  return f;
}
function redPos(f, tau, out) {
  const e = (1 - Math.exp(-DRAG * tau)) / DRAG;
  out.copy(f.c0).addScaledVector(f.v0, e);
  out.y += -G / DRAG * tau + G / DRAG * e;
  if (f.wall) out.x = clamp(out.x, -WALK + f.size * 0.4, WALK - f.size * 0.4);
  return out;
}
const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), mT = new THREE.Matrix4(), mR = new THREE.Matrix4(), vT = new THREE.Vector3(), vS = new THREE.Vector3(1, 1, 1);
let ballR = 1;
// world matrix of a thing with home matrix H (centre offset cOff in its own frame) at v; false = not drawn
function fateMatrix(f, H, cOff, v, out, te) {
  if (v >= te) return false;
  if (!f || v < f.t0) { out.copy(H); return true; }
  if (f.type === 'blue') {
    if (v >= f.ta) return false;
    const k = clamp((v - f.t0) / f.T);
    const kk = k * k;
    const r = f.d * (1 - kk);
    const phi = f.spinDir * kk * f.spin;
    vT.copy(f.rel).multiplyScalar(r / f.d).applyAxisAngle(Yax, phi).add(Bv);
    if (v > V_RELEASE) return false;
    qA.setFromAxisAngle(Yax, phi); qB.setFromAxisAngle(f.ax, kk * f.tumble);
    qA.multiply(qB);
    const crush = 1 - 0.6 * smooth(ballR + f.size * 2.5, ballR + f.size * 0.3, r);
    out.compose(vT, qA, vS.set(crush, crush, crush));
    // keep the thing's own orientation: H's rotation, about its centre
    mR.extractRotation(H);
    out.multiply(mR).multiply(mT.makeTranslation(-cOff.x, -cOff.y, -cOff.z));
    return true;
  }
  // red
  const tau = Math.min(v - f.t0, f.tl);
  redPos(f, tau, vT);
  qA.setFromAxisAngle(f.ax, f.w * tau);
  out.compose(vT, qA, vS.set(1, 1, 1));
  mR.extractRotation(H);
  out.multiply(mR).multiply(mT.makeTranslation(-cOff.x, -cOff.y, -cOff.z));
  return true;
}
const Yax = new THREE.Vector3(0, 1, 0);
const centreOf = (H, off) => new THREE.Vector3().copy(off).applyMatrix4(H);

export function makeFx(scene, ctx, street) {
  const { plainMat, glowMat, shadowy } = ctx;
  const items = [];    // { f, H, off, te, set(i, matrix|null), kind }
  const add = (kind, H, off, size, vol, setter, opts = {}) => {
    const c = centreOf(H, off);
    let f = blueFate(c, size, vol, opts.delay || 0);
    if (!f && opts.red !== false) f = redFate(c, size, opts.red || {});
    const te = vErased(f && f.type === 'red' ? (() => { const p = new THREE.Vector3(); redPos(f, f.tl, p); return p; })() : c);
    const it = { kind, f, H, off, te, set: setter, c };
    items.push(it);
    return it;
  };

  // ---------- cars ----------
  const fleet = makeFleet(scene, CARS.length, { plainMat, glowMat, shadowy });
  const carIt = CARS.map((car, i) => {
    fleet.color(i, car.col, car.kind);
    const H = new THREE.Matrix4().makeRotationY(car.yaw).setPosition(car.x, 0, car.z);
    return add('car', H, new THREE.Vector3(0, 0.75, 0), 4.5, 1.2, (m, lit) => fleet.set(i, m || ZERO, lit), { red: { speed: 50, up: 10 } });
  });
  // ---------- street furniture ----------
  const lampIt = LAMPS.map((l, i) => add('lamp', street.home.lamps[i], new THREE.Vector3(-1, 4.5, 0), 9, 0.4, (m) => street.lamps.setMatrixAt(i, m || ZERO), { red: { speed: 40, up: 6 } }));
  const sigIt = SIGNALS.map((s, i) => add('signal', street.home.signals[i], new THREE.Vector3(-3, 5, 0), 9, 0.5, (m) => street.signals.setMatrixAt(i, m || ZERO), { red: { speed: 40, up: 6 } }));
  const signIt = SIGNS.map((s, i) => add('sign', street.home.signs[i], new THREE.Vector3(0, 0, 0), 4, 0.3, (m) => street.signs.setMatrixAt(i, m || ZERO), { red: { speed: 35, up: 5, out: 0.2 } }));
  const scrIt = SCREENS.map((s, i) => add('screen', street.home.screens[i], new THREE.Vector3(0, 0, 0), s.w * 0.7, s.w * s.h * 0.2 * 0.5, (m) => street.screens.setMatrixAt(i, m || ZERO), { red: { speed: 25, up: 3, out: 0.15 } }));
  setCarsPulled(carIt.filter((it) => it.f && it.f.type === 'blue').length);

  // ---------- facade chunks: the window cells Blue tears out and Red blows out ----------
  const chunkList = [];
  for (const b of B) {
    if (Math.abs(b.x) > 200 || b.z < -900 || b.z > 120) continue;
    const near = Math.hypot(Math.max(0, Math.abs(b.x - BLUE.x) - b.w / 2), Math.max(0, Math.abs(b.z - BLUE.z) - b.d / 2)) < BLUE_MAX;
    const cells = cellsOf(b, (x, y, z) => {
      if (near && Math.hypot(x - BLUE.x, y - BLUE.y, z - BLUE.z) < BLUE_MAX - 2) return true;
      const { s, q } = redPerp(x, y, z);
      return s > 0 && s < RED_LEN && q < redReach(s);
    });
    for (const c of cells) {
      const keep = (c.c * 7 + c.r * 13 + Math.floor(c.b.seed * 1009 + 0.5) * 3) % 3 === 0;   // (same rule as the facade shader)
      const blue = keep && Math.hypot(c.x - BLUE.x, c.y - BLUE.y, c.z - BLUE.z) < BLUE_MAX - 2;
      { const { s, q } = redPerp(c.x, c.y, c.z); if (!blue && !(s > 0 && s < RED_LEN && q < redReach(s))) continue; }
      if (!blue && R0() > 0.3) continue;   // (Red: one cell in three flies as a chunk, the rest are dust)
      chunkList.push({ ...c, blue });
    }
  }
  const NCH = chunkList.length;
  const chunkGeo = new THREE.BoxGeometry(1, 1, 1);
  const chunkMat = plainMat(0xffffff, 0.8);
  chunkMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCP; varying float vLit;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCP = position; vLit = step(0.55, fract(float(gl_InstanceID) * 0.6180339));');
    sh.fragmentShader = 'varying vec3 vCP; varying float vLit;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float win = step(abs(vCP.x), 0.36) * step(abs(vCP.y + 0.05), 0.33) * step(0.3, abs(vCP.z) * 2.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.04, 0.05, 0.06), win);
      totalEmissiveRadiance += win * vLit * vec3(1.0, 0.75, 0.45) * 0.9;`);
  };
  const chunks = new THREE.InstancedMesh(chunkGeo, chunkMat, NCH);
  chunks.frustumCulled = false;
  scene.add(chunks);
  const col = new THREE.Color();
  const chunkIt = chunkList.map((c, i) => {
    const H = new THREE.Matrix4().compose(new THREE.Vector3(c.x - c.nx * 0.15, c.y, c.z - c.nz * 0.15),
      new THREE.Quaternion().setFromAxisAngle(Yax, c.nx ? Math.PI / 2 : 0), new THREE.Vector3(c.cw * 0.92, FH * 0.86, 0.3));
    chunks.setColorAt(i, col.set(c.b.col).multiplyScalar(0.55 + 0.3 * R0()));
    let f;
    const cc = new THREE.Vector3(c.x, c.y, c.z);
    if (c.blue) {
      f = blueFate(cc, 2.4, 0.35);
    } else {
      // blown out of the face: forward with the blast and out across the street, some inward
      f = redFate(cc, 2.5, { speed: 60, up: 8, out: -0.8 * Math.sign(c.x || 1) * (R0() < 0.6 ? 1 : -0.4), fwd: 1.0, reachK: 1.0 });
      if (f) f.wall = false;
    }
    const te = vErased(cc);
    return { kind: 'chunk', f, H, off: new THREE.Vector3(0, 0, 0), te, set: (m, lit, v) => chunks.setMatrixAt(i, m && f && v >= f.t0 ? m : ZERO), c: cc };
  });
  items.push(...chunkIt);

  // ---------- bits of the street: grit, paper, leaves, pulled in from the first frame ----------
  const NB = 1600;
  const bitGeo = mergeGeometries([new THREE.TetrahedronGeometry(1).toNonIndexed()]);
  const bits = new THREE.InstancedMesh(bitGeo, plainMat(0xffffff, 0.9), NB);
  bits.frustumCulled = false;
  scene.add(bits);
  for (let i = 0; i < NB; i++) {
    const a = R0() * 6.283, rr = 6 + Math.sqrt(R0()) * 52;
    const x = BLUE.x + Math.cos(a) * rr, z = BLUE.z + Math.sin(a) * rr;
    if (Math.abs(x) > WALK - 0.3) { i--; continue; }
    const paper = R0() < 0.35;
    const sz = paper ? 0.12 + R0() * 0.12 : 0.06 + R0() * 0.2;
    bits.setColorAt(i, paper ? col.setRGB(0.85, 0.83, 0.78) : col.setRGB(0.08 + R0() * 0.1, 0.08, 0.08));
    const H = new THREE.Matrix4().compose(new THREE.Vector3(x, sz * 0.4, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(R0() * 6, R0() * 6, R0() * 6)), new THREE.Vector3(sz, paper ? sz * 0.08 : sz, sz));
    const c = new THREE.Vector3(x, sz * 0.4, z);
    const f = blueFate(c, sz, 0, R0() * 4.5 - 1.5);
    if (f) f.t0 = Math.max(f.t0, -3);
    items.push({ kind: 'bit', f, H, off: new THREE.Vector3(), te: 1e9, set: (m) => bits.setMatrixAt(i, m || ZERO), c });
  }

  // arrival times: when each Blue-pulled thing reaches the ball (it hides there); the ball's volume follows
  // (crushed solid: everything Blue swallows packs into a ball 30 ft across)
  {
    let V = 0; for (const it of items) if (it.f && it.f.type === 'blue') V += it.f.vol;
    const VOLK = (4 / 3 * Math.PI * Math.pow(4.57 - 0.8, 3)) / Math.max(V, 1);
    for (const it of items) if (it.f && it.f.type === 'blue') it.f.vol *= VOLK;
  }
  const BALL_FINAL = 4.57;
  const arrivals = [];
  for (const it of items) {
    const f = it.f; if (!f || f.type !== 'blue') continue;
    const rr = Math.min(f.d * 0.9, BALL_FINAL * 0.8 + f.size * 0.3);
    f.ta = f.t0 + f.T * Math.sqrt(1 - rr / f.d);
    arrivals.push([f.ta, f.vol]);
  }
  arrivals.sort((a, b) => a[0] - b[0]);
  const ballAt = (v) => { let V = 0; for (const [t, vol] of arrivals) { if (t > v) break; V += vol; } return Math.cbrt(V * 3 / (4 * Math.PI)) + 0.8 * smooth(V_BLUE0, V_BLUE0 + 2, v); };
  const BALL_TONS = Math.round(carIt.filter((it) => it.f && it.f.type === 'blue').length * 1.6 + chunkIt.filter((it) => it.f && it.f.type === 'blue').length * 2.6 + 30);

  // tallies for the counter
  const carT0 = carIt.filter((it) => it.f && it.f.type === 'blue').map((it) => it.f.t0).sort((a, b) => a - b);
  TALLY.cars = (v) => { let n = 0; for (const t of carT0) { if (t > v) break; n++; } return n; };
  const winT = [];
  for (const b of B) if (b.glass < 1e9) {
    let n = 0; for (const [W] of [[b.w], [b.w], [b.d], [b.d]]) n += Math.max(1, Math.floor(W / b.colW + 0.5)) * Math.max(0, Math.floor((b.h - 1.5 - 5) / FH));
    winT.push([b.glass, n]);
  }
  winT.sort((a, b) => a[0] - b[0]);
  TALLY.windows = (v) => { let n = 0; for (const [t, k] of winT) { if (t > v) break; n += k; } return n; };
  TALLY.miles = (v) => (purpleAt(PURPLES[0], v).s + purpleAt(PURPLES[1], v).s) / 1609.34;

  // ---------- glass: shards bursting out of the windows Red's blast breaks, falling and glinting ----------
  const GL = [];
  {
    const front = B.filter((b) => b.glass < 1e9 && Math.abs(b.x) < 80 && b.z > -820);
    for (let i = 0; i < 3200; i++) {
      const b = front[Math.floor(R0() * front.length)];
      const cs = cellsOf(b, () => true);
      if (!cs.length) continue;
      const c = cs[Math.floor(R0() * cs.length)];
      const t0 = b.glass + R0() * 0.35;
      GL.push({ t0, x: c.x + (R0() - 0.5) * c.cw, y: c.y + (R0() - 0.5) * 2.5, z: c.z, vx: -c.nx * 0 + c.nx * (2 + R0() * 6), vz: c.nz * (2 + R0() * 6) - 3 * R0(), vy: 1 + R0() * 3, s: 0.12 + R0() * 0.25, ph: R0() * 6.28 });
    }
  }

  // ---------- Blue: the point, its glow, the ball ----------
  const haloMat = (color, arms) => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uK: { value: 1 }, uC: { value: new THREE.Color(...color) }, uArms: { value: arms } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); vec3 sc = vec3(length(modelMatrix[0].xyz)); mv.xy += position.xy * sc.xy; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform float uK; uniform vec3 uC; uniform float uArms; varying vec2 vUv;
      void main(){ float r = length(vUv); if (r > 1.0) discard;
        float a = atan(vUv.y, vUv.x);
        float sp = 0.5 + 0.5 * sin(a * 3.0 + log(r + 0.02) * 6.0 * uArms + uTime * 7.0);
        float glow = exp(-r * r * 40.0) * 2.0 + exp(-r * 7.0) * 0.35 + exp(-r * 3.0) * 0.05;
        float arms = uArms * sp * exp(-r * 3.5) * smoothstep(0.03, 0.15, r) * 0.9;
        vec3 c = uC * (glow + arms) * (1.0 - smoothstep(0.85, 1.0, r));
        gl_FragColor = vec4(c * uK, 1.0); }`,
  });
  const quad = new THREE.PlaneGeometry(2, 2);
  const blueCore = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 4.5, 8) }));
  const blueHalo = new THREE.Mesh(quad, haloMat([0.3, 0.8, 1.5], 1));
  blueHalo.renderOrder = 7; blueHalo.frustumCulled = false;
  scene.add(blueCore, blueHalo);
  // the ball: crushed cars and concrete, glowing blue in the cracks
  const ballGeo = new THREE.IcosahedronGeometry(1, 5);
  {
    const p = ballGeo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = Math.sin(v.x * 7.1 + 1.3) * Math.sin(v.y * 6.3 + 2.1) * Math.sin(v.z * 8.2) * 0.12 + Math.sin(v.x * 19 + v.y * 13) * 0.04 + Math.sin(v.y * 23 + v.z * 17) * 0.03;
      v.multiplyScalar(1 + n);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    ballGeo.computeVertexNormals();
  }
  const ballMat = new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.45, metalness: 0.6, flatShading: true });
  ballMat.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = BALL_U.uGlow;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position;');
    sh.fragmentShader = 'uniform float uGlow; varying vec3 vOP;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float h = fract(sin(dot(floor(vOP * 26.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      vec3 paint = h < 0.15 ? vec3(0.5, 0.06, 0.05) : h < 0.25 ? vec3(0.08, 0.14, 0.32) : h < 0.4 ? vec3(0.4) : h < 0.5 ? vec3(0.45, 0.38, 0.16) : h < 0.75 ? vec3(0.12) : vec3(0.35, 0.33, 0.3);
      diffuseColor.rgb = paint;`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      vec3 q3 = vOP * 5.0;
      float cn = sin(q3.x * 2.1 + sin(q3.y * 3.3)) + sin(q3.y * 2.7 + sin(q3.z * 2.9)) + sin(q3.z * 2.3 + sin(q3.x * 3.1));
      float crack = 1.0 - smoothstep(0.0, 0.12, abs(cn));
      float mu = abs(dot(normal, normalize(vViewPosition)));
      totalEmissiveRadiance += vec3(0.35, 0.75, 1.6) * uGlow * (crack * 1.6 + pow(1.0 - mu, 3.0) * 0.8);`);
  };
  const BALL_U = { uGlow: { value: 1 } };
  const ball = new THREE.Mesh(ballGeo, ballMat);
  scene.add(ball);
  const blueLight = new THREE.PointLight(0x5ab4ff, 0, 0, 2);
  blueLight.position.copy(Bv);
  scene.add(blueLight);

  // ---------- Red ----------
  const redCore = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.9, 0.7) }));
  const redHalo = new THREE.Mesh(quad, haloMat([1.8, 0.25, 0.15], 0.6));
  redHalo.renderOrder = 7; redHalo.frustumCulled = false;
  scene.add(redCore, redHalo);
  const redLight = new THREE.PointLight(0xff4a3a, 0, 0, 2);
  scene.add(redLight);
  const boomLight = new THREE.PointLight(0xff7a40, 0, 0, 2);
  boomLight.position.set(RED_P1.x, RED_P1.y, RED_P1.z + 15);
  scene.add(boomLight);

  // ---------- Hollow Purple ----------
  const purpleMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uK: { value: 1 }, uDeep: { value: new THREE.Color(0.16, 0.01, 0.7) }, uHot: { value: new THREE.Color(0.75, 0.25, 2.1) }, uEdge: { value: new THREE.Color(1.1, 0.3, 2.6) }, uScale: { value: 3 } },
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); vP = position; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform float uK; uniform vec3 uDeep; uniform vec3 uHot; uniform vec3 uEdge; uniform float uScale; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      float h3(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y), mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z); }
      void main(){
        float mu = abs(dot(normalize(vN), normalize(vV)));
        vec3 p = vP * 3.0;
        float sw = n3(p + vec3(uTime * 1.3, -uTime * 0.9, uTime)) * 0.6 + n3(p * 2.3 - uTime * 2.1) * 0.4;
        float bands = 0.5 + 0.5 * sin((vP.y + sw * 0.6) * 18.0 + uTime * 6.0);
        vec3 deep = uDeep, hot = uHot;
        vec3 c = mix(deep, hot, pow(mu, 3.0) * 0.8 + sw * 0.3) + uEdge * pow(1.0 - mu, 2.5) * 0.9;
        c *= 0.45 + 0.95 * bands;
        c += vec3(0.9, 0.6, 1.6) * smoothstep(0.93, 1.0, n3(vP * 9.0 + uTime * 4.0)) * 2.0;
        gl_FragColor = vec4(c * uK, 1.0); }`,
  });
  // Blue in his hand / on its way down: a small swirling ball of blue light (the same look as Purple's sphere)
  const blueBallMat = purpleMat.clone();
  blueBallMat.uniforms.uDeep.value.setRGB(0.01, 0.06, 0.4); blueBallMat.uniforms.uHot.value.setRGB(0.22, 0.6, 1.25); blueBallMat.uniforms.uEdge.value.setRGB(0.25, 0.6, 1.6);
  const blueBall = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), blueBallMat);
  blueBall.visible = false;
  scene.add(blueBall);
  const purples = PURPLES.map(() => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), purpleMat);
    const h = new THREE.Mesh(quad, haloMat([0.8, 0.25, 1.5], 0.4));
    h.renderOrder = 7; h.frustumCulled = false;
    const l = new THREE.PointLight(0xb46cff, 0, 0, 2);
    scene.add(m, h, l);
    return { m, h, l };
  });
  // the two orbs in his hands before they merge (Purple 1)
  const handBlue = new THREE.Mesh(quad, haloMat([0.35, 0.6, 1.6], 1)); handBlue.renderOrder = 7; handBlue.frustumCulled = false;
  const handRed = new THREE.Mesh(quad, haloMat([1.8, 0.25, 0.15], 0.6)); handRed.renderOrder = 7; handRed.frustumCulled = false;
  const hbCore = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 2.0, 3.6) }));
  const hrCore = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.45, 0.35) }));
  scene.add(handBlue, handRed, hbCore, hrCore);
  const handLight = new THREE.PointLight(0xffffff, 0, 0, 2);
  scene.add(handLight);

  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const BALL_TE = vErased(new THREE.Vector3(BLUE.x, 3, BLUE.z));
  const out = new THREE.Matrix4();
  const tv = new THREE.Vector3(), tv2 = new THREE.Vector3();
  return {
    BALL_TONS, items, carsPulled: carIt.filter((it) => it.f && it.f.type === 'blue').length,
    lights: { blueLight, redLight, boomLight, handLight, purples },
    frame(v, s, cam, glows, smoke, gojo) {
      ballR = ballAt(Math.min(v, V_RELEASE));
      // ---- every movable thing ----
      for (const it of items) {
        let ok = fateMatrix(it.f, it.H, it.off, v, out, it.te);
        if (ok && it.kind === 'chunk') { const e = out.elements; const dx = e[12] - cam.position.x, dy = e[13] - cam.position.y, dz = e[14] - cam.position.z; if (dx * dx + dy * dy + dz * dz < 36) ok = false; }
        if (it.kind === 'car') it.set(ok ? out : null, ok && v < (it.f && it.f.type ? it.f.t0 + 6 : 1e9));
        else it.set(ok ? out : null, true, v);
        // the car's lights while it sits in the jam (glows: headlights forward, tail lights back); hazards after 2 s
        if (ok && it.kind === 'car' && (!it.f || v < it.f.t0) && v < it.te) {
          const car = it;
          const H = car.H.elements;
          const fx = -H[8], fz = -H[10];
          const x = H[12], z = H[14];
          const dx = x - cam.position.x, dz = z - cam.position.z;
          if (dx * dx + dz * dz < 900 * 900) {
            glows.add(x + fx * 2.3, 0.72, z + fz * 2.3, 0.55, 2.2, 2.0, 1.7);
            glows.add(x - fx * 2.3, 0.75, z - fz * 2.3, 0.45, 1.6, 0.08, 0.05);
            if (v > 2 && Math.sin((v + car.c.x * 0.37) * 9.4) > 0.2) { glows.add(x - fx * 2.3 + 0.75 * fz, 0.75, z - fz * 2.3 - 0.75 * fx, 0.3, 2.4, 1.0, 0.1); }
            // their reflections in the wet street
            if (dx * dx + dz * dz < 250 * 250) glows.add(x + fx * 2.3, -0.75, z + fz * 2.3, 0.7, 0.5, 0.45, 0.4);
          }
        }
      }
      fleet.commit();
      chunks.instanceMatrix.needsUpdate = true; bits.instanceMatrix.needsUpdate = true;
      for (const m of [street.lamps, street.signals, street.signs, street.screens]) m.instanceMatrix.needsUpdate = true;
      // lamp heads glow, their pools on the ground follow (off once the lamp has gone)
      lampIt.forEach((it, i) => {
        const home = (!it.f || v < it.f.t0) && v < it.te;
        SU.uLamps.value[i].w = home ? 1 : 0;
        if (home) {
          const L = LAMPS[i];
          glows.add(L.x - Math.sign(L.x) * 2.35, 8.7, L.z, 1.4, 2.6, 2.0, 1.3);
          glows.add(L.x - Math.sign(L.x) * 2.35, -8.7, L.z, 1.8, 0.45, 0.35, 0.22);
        }
      });
      sigIt.forEach((it, i) => {
        if (it.f && v >= it.f.t0) return; if (v >= it.te) return;
        const S = SIGNALS[i], sd = -Math.sign(S.x);
        const red = (Math.floor((v + 7) / 9) % 2) === 0;
        for (const x of [2.5, 5.8, 9]) glows.add(S.x + sd * x, red ? 6.65 : 5.95, S.z + 0.2 * sd, 0.5, red ? 3 : 0.2, red ? 0.15 : 2.6, red ? 0.1 : 0.9);
      });

      // ---- Blue ----
      const bOn = s.blueOn;
      const pulse = 1 + 0.12 * Math.sin(v * 23) + 0.08 * Math.sin(v * 37);
      // where the point is: in his hand, on its way down (an arc), or at its spot over the street
      const tk = throwK(v);
      gojo.handPos(1, tv2); tv2.y += 0.12; tv2.z += 0.08;
      const orb = tv.copy(tv2).lerp(Bv, tk);
      orb.y += 3.0 * Math.sin(Math.PI * Math.min(tk, 1)) * (1 - tk);
      const landed = v >= V_LAND && v < V_RELEASE + 0.3;
      const flare = v >= V_LAND ? Math.exp(-(v - V_LAND) / 0.18) : 0;   // it opens with a flash
      const inHand = v < V_LAND;
      const size = inHand ? 0.065 + 0.09 * tk : 1;
      blueCore.visible = inHand || bOn > 0.01;
      // (kept to a sensible size on screen through a long lens)
      const frameH = 2 * cam.position.distanceTo(orb) * Math.tan(cam.fov * Math.PI / 360);
      blueCore.material.color.setRGB(2.2, 4.5, 8);
      blueBall.visible = inHand; blueBall.position.copy(orb); blueBall.scale.setScalar(size * (1 + 0.06 * Math.sin(v * 17)));
      blueBallMat.uniforms.uTime.value = v * 1.6;
      blueCore.position.copy(orb); blueCore.scale.setScalar(inHand ? size * 0.3 * pulse : Math.min(0.4, 0.014 * frameH) * pulse * (0.4 + 0.6 * bOn));
      blueHalo.visible = blueCore.visible;
      blueHalo.position.copy(orb); blueHalo.scale.setScalar(inHand ? 0.32 + 1.6 * tk : Math.min(4 + 1 * Math.sin(v * 3), 0.13 * frameH) * (1 + 1.5 * flare));
      blueHalo.material.uniforms.uTime.value = v; blueHalo.material.uniforms.uK.value = inHand ? 0.22 + 0.5 * tk : bOn + 2 * flare;
      blueLight.position.copy(orb);
      blueLight.intensity = inHand ? 0.6 + 60 * tk * tk : 750 * bOn * pulse + 4000 * flare;
      // sparks crackling round it and spiralling in (in his hand, and as it flies)
      if (inHand) for (let j = 0; j < 36; j++) {
        const ph = (v * (0.9 + 0.3 * ((j * 0.37) % 1)) + j * 0.618) % 1;
        const r = (0.12 + 0.9 * (1 - ph) * (1 - ph)) * (1 + 3 * tk);
        const a = j * 2.399 + ph * 9 * (j % 2 ? 1 : -1), b = Math.sin(j * 1.7) * 1.2;
        glows.add(orb.x + Math.cos(a) * Math.cos(b) * r, orb.y + Math.sin(b) * r * 0.7, orb.z + Math.sin(a) * Math.cos(b) * r, 0.035 + 0.03 * ph, 0.6 * ph + 0.2, 1.1 * ph + 0.3, 2.2 * ph + 0.5);
      }
      // its trail on the way down: where it was a moment ago
      if (v > V_LAUNCH && inHand) {
        gojo.handPos(1, tv2); tv2.y += 0.12; tv2.z += 0.08;
        for (let j = 1; j < 28; j++) {
          const kk = throwK(v - j * 0.01), q = j / 28;
          const x = tv2.x + (Bv.x - tv2.x) * kk, z = tv2.z + (Bv.z - tv2.z) * kk;
          const y = tv2.y + (Bv.y - tv2.y) * kk + 3.0 * Math.sin(Math.PI * kk) * (1 - kk);
          glows.add(x, y, z, 0.35 * (1 - q) + 0.05, 0.35 * (1 - q), 0.7 * (1 - q), 1.6 * (1 - q));
        }
      }
      SU.uBlueL.value = bOn;
      // the ball: grows in the point, dropped when he lets go, a crater where it lands
      const bR = ballAt(Math.min(v, V_RELEASE));
      ball.visible = bR > 0.9 && v < BALL_TE;
      ball.scale.setScalar(Math.max(bR, 0.01));
      if (v < V_RELEASE) { ball.position.copy(Bv); ball.rotation.set(v * 0.7, v * 1.9, v * 0.4); }
      else {
        const dt = v - V_RELEASE, yEnd = bR * 0.7;
        const y = Math.max(BLUE.y - 0.5 * G * dt * dt, yEnd);
        ball.position.set(BLUE.x, y, BLUE.z);
        if (v < BALL_LAND) ball.rotation.set(V_RELEASE * 0.7 + dt * 0.4, V_RELEASE * 1.9 + dt * 0.8, V_RELEASE * 0.4);
      }
      BALL_U.uGlow.value = v < V_RELEASE ? 1 : Math.exp(-(v - V_RELEASE) / 2.5) + 0.05;
      SU.uCrater.value = smooth(BALL_LAND, BALL_LAND + 0.15, v);
      // where it opens: a shock ring of dust off the street below it
      if (v > V_LAND && v < V_LAND + 3) {
        const dt = v - V_LAND;
        for (let j = 0; j < 30; j++) {
          const a = j / 30 * 6.283 + Math.sin(j * 2.7);
          const r = 3 + 26 * (1 - Math.exp(-dt * 2.2)) * (0.8 + 0.2 * Math.sin(j * 1.3));
          smoke.puff(BLUE.x + Math.cos(a) * r, 1.2 + 1.5 * dt, BLUE.z + Math.sin(a) * r, 2.5 + 3 * dt, 0.5 * Math.exp(-dt / 1.2), 0.42, 0.15 * Math.exp(-dt * 4), j * 0.21 + 7);
        }
      }
      // dust where it lands
      if (v > BALL_LAND && v < BALL_LAND + 6) {
        const dt = v - BALL_LAND;
        for (let j = 0; j < 26; j++) {
          const a = j / 26 * 6.283 + Math.sin(j * 3.7);
          const r = bR + 3 + (16 + 4 * Math.sin(j)) * (1 - Math.exp(-dt * 1.5));
          smoke.puff(BLUE.x + Math.cos(a) * r, 1.5 + 2.5 * dt * (0.4 + 0.3 * Math.sin(j * 2.3)), BLUE.z + Math.sin(a) * r, 3 + 3 * dt, 0.55 * Math.exp(-dt / 3.5), 0.4, 0, j * 0.17);
        }
      }

      // ---- Red: forms on his fingertip, flies up the avenue, blows the tower ----
      const formK = smooth(V_RED_FORM, V_RED - 0.1, v);
      const flying = v >= V_RED && v < V_RED_HIT;
      if (v > V_RED_FORM && v < V_RED_HIT) {
        if (!flying) gojo.handPos(1, tv); else {
          const k = redFront(v) / RED_LEN;
          tv.set(lerp(RED_P0.x, RED_P1.x, k), lerp(RED_P0.y, RED_P1.y, k), lerp(RED_P0.z, RED_P1.z, k));
        }
        const r = flying ? 1.1 : 0.12 + 0.5 * formK;
        redCore.visible = redHalo.visible = true;
        redCore.position.copy(tv); redCore.scale.setScalar(r);
        redHalo.position.copy(tv); redHalo.scale.setScalar(r * 9); redHalo.material.uniforms.uTime.value = v;
        redLight.position.copy(tv); redLight.intensity = (flying ? 9000 : 600 * formK);
        // the trail: a line of red light behind it
        if (flying) for (let j = 1; j < 50; j++) {
          const sB = redFront(v) - j * 4;
          if (sB < 0) break;
          const k = sB / RED_LEN;
          glows.add(lerp(RED_P0.x, RED_P1.x, k), lerp(RED_P0.y, RED_P1.y, k), lerp(RED_P0.z, RED_P1.z, k), 3.5 * (1 - j / 50), 2.4 * (1 - j / 50), 0.3 * (1 - j / 50), 0.15 * (1 - j / 50));
        }
      } else { redCore.visible = redHalo.visible = false; redLight.intensity = 0; }
      // the hit: a fireball in the tower's middle, dust and smoke pouring out of the gap, a light that fades
      const dh = v - V_RED_HIT;
      boomLight.intensity = dh > 0 ? 1.5e6 * Math.exp(-dh / 0.35) + 1e5 * Math.exp(-dh / 3) : 0;
      if (dh > 0 && dh < 12) {
        for (let j = 0; j < 70; j++) {
          const a = j * 2.399, u = (j % 10) / 10;
          const r = (8 + 40 * (1 - Math.exp(-dh * 1.6))) * (0.4 + 0.6 * ((j * 0.618) % 1));
          const y = 64 + Math.sin(a * 1.7) * r * 0.5 + dh * 3 * u;
          smoke.puff(RED_P1.x + Math.cos(a) * r * 1.1, Math.max(y, 6), RED_P1.z - 10 + Math.sin(a) * r * 0.5, 8 + 10 * dh * (0.3 + u), clamp(0.8 - dh / 14) , 0.25, 2.2 * Math.exp(-dh / (0.5 + u)), j * 0.11);
        }
        // the dust storm rolling down the avenue from the collapse
        const dd = Math.max(0, dh - 3.2);
        for (let j = 0; j < 40; j++) {
          const z = RED_P1.z + 20 + (j / 40) * Math.min(dd * 30, 420);
          const x = (((j * 37) % 17) / 17 - 0.5) * 34;
          smoke.puff(x, 6 + 10 * ((j * 0.37) % 1), z, 10 + 6 * ((j * 0.53) % 1), 0.3 * smooth(0, 1.5, dd) * (1 - smooth(8, 12, dh)), 0.45, 0, j * 0.29 + 4);
        }
      }
      // glass shards
      for (const g of GL) {
        const t = v - g.t0;
        if (t < 0 || t > 6) continue;
        const y = g.y + g.vy * t - 0.5 * G * t * t;
        if (y < 0.05) continue;
        const x = g.x + g.vx * t, z = g.z + g.vz * t;
        const tw = 0.5 + 0.5 * Math.sin(v * 25 + g.ph);
        glows.add(x, y, z, g.s * (0.6 + tw), 0.9 * tw + 0.2, 1.0 * tw + 0.25, 1.2 * tw + 0.3);
      }
      // Red's blast lifts dust off the facades it strips
      if (v > V_RED && v < V_RED + 6) {
        const front = redFront(v);
        for (let j = 0; j < 60; j++) {
          const sj = (j / 60) * front;
          const age = v - (V_RED + sj / RED_SPEED);
          if (age < 0 || age > 5) continue;
          const k = sj / RED_LEN;
          const py = lerp(RED_P0.y, RED_P1.y, k);
          const z = lerp(RED_P0.z, RED_P1.z, k);
          if (j % 2 === 0) for (const sd of [-1, 1]) smoke.puff(sd * (17 - 2 * age), py * 0.5 + 4 * Math.sin(j), z - age * 10, 3 + 3 * age, 0.22 * (1 - age / 5), 0.42, 0.25 * Math.exp(-age * 3), j * 0.31 + sd);
        }
      }

      // ---- Purple 1: Blue in his left hand, Red in his right, pushed together ----
      const P1 = PURPLES[0];
      const hv = v > P1.form0 - 2.0 && v < P1.form0 + 1.0;
      if (hv) {
        const kIn = smooth(P1.form0 - 2.0, P1.form0 - 1.4, v);
        gojo.handPos(-1, tv); gojo.handPos(1, tv2);
        const merge = smooth(P1.form0 + 0.3, P1.form0 + 0.9, v);
        const mid = tv.clone().add(tv2).multiplyScalar(0.5);
        const pb = tv.clone().lerp(mid, merge), pr = tv2.clone().lerp(mid, merge);
        handBlue.visible = handRed.visible = hbCore.visible = hrCore.visible = true;
        handBlue.position.copy(pb); handBlue.scale.setScalar(0.55 * kIn); handBlue.material.uniforms.uTime.value = v; handBlue.material.uniforms.uK.value = 0.3;
        handRed.position.copy(pr); handRed.scale.setScalar(0.55 * kIn); handRed.material.uniforms.uTime.value = v; handRed.material.uniforms.uK.value = 0.3;
        hbCore.position.copy(pb); hbCore.scale.setScalar(0.11 * kIn); hrCore.position.copy(pr); hrCore.scale.setScalar(0.11 * kIn);
        handLight.position.copy(mid); handLight.intensity = 25 * kIn; handLight.color.setRGB(0.8, 0.45, 1.0);
      } else { handBlue.visible = handRed.visible = hbCore.visible = hrCore.visible = false; handLight.intensity = 0; }
      // ---- the purple spheres ----
      purpleMat.uniforms.uTime.value = v;
      PURPLES.forEach((P, k) => {
        const q = purpleAt(P, v), o = purples[k];
        const vis = !!(q.on && q.r > 0.05 && !q.gone);
        o.m.visible = o.h.visible = vis;
        o.l.intensity = 0;
        if (!vis) return;
        tv.set(P.p0.x + P.d.x * q.s, P.p0.y + P.d.y * q.s, P.p0.z + P.d.z * q.s);
        // it starts as a spark between his hands and swells
        o.m.position.copy(tv); o.m.scale.setScalar(q.r);
        o.h.position.copy(tv); o.h.scale.setScalar(q.r * 2.6); o.h.material.uniforms.uTime.value = v;
        o.h.material.uniforms.uK.value = clamp((cam.position.distanceTo(tv) - q.r * 1.1) / (q.r * 1.5));   // (no wash when you are right beside it)
        o.l.position.copy(tv); o.l.intensity = 25 * q.r * q.r * (1 - smooth(P.end - 0.6, P.end, v));
        // sparks crackling round it
        for (let j = 0; j < 40; j++) {
          const a = j * 2.399 + v * 7, b = Math.sin(j * 1.37 + v * 5) * 1.4;
          const rr = q.r * (1.02 + 0.1 * ((j * 0.37 + v * 3) % 1));
          glows.add(tv.x + Math.cos(a) * Math.cos(b) * rr, tv.y + Math.sin(b) * rr, tv.z + Math.sin(a) * Math.cos(b) * rr, 0.6 + q.r * 0.03, 1.6, 0.6, 2.8);
        }
      });
    },
  };
}

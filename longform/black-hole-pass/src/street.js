// The avenue at night: a canyon of lit towers with giant screens, four lanes of cabs, crowds on both sidewalks, a
// subway entrance on your side. Everything is a function of the video clock v and the story state s (timeline.js).
// It comes back four times, each worse: a normal night (the alert), the evacuation (gridlock, suitcases), the last
// hour (the disk lights the street orange, everyone runs for the subway), and the end (the street flooded, gravity
// flips, everything falls up, the horizon peels up into the sky).
// Metres; +x east, +y up, -z north (up the avenue, where the hole comes from). You walk the east sidewalk.
import * as THREE from 'three';
import { G, patch } from './bend.js';
import { makeSky } from './sky.js';
import { makeFleet } from './cars.js';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { makeScreens } from './screens.js';
import { rng, smooth, clamp, lerp, DEG, wobble } from './util.js';
import { V_FF, FF_LEN } from './timeline.js';

const ROAD = 11, WALK = 17;              // road |x| < 11, sidewalks 11..17, buildings beyond
const CROSS_Z0 = -84, CROSS_Z1 = -66;    // the cross street
export const SUB = { x0: 13.4, x1: 15.9, z0: -27.5, z1: -20.0, depth: 4.2 };   // the subway stairs (down toward -z)
const dummy = new THREE.Object3D();
const tmpC = new THREE.Color();
const tmpV = new THREE.Vector3();

// rising things: slow start, then accelerating (m)
const liftDisp = (dt, a, j) => (dt <= 0 ? 0 : 0.5 * a * dt * dt + j * dt * dt * dt);

// Catmull-Rom through [time, value] keys (video clock)
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
const K = (...p) => p;

// ---------- the camera: your eyes, per visit (video clock; yaw + turns right, 0 = north; pitch + up) ----------
// Each visit is a list of keys [v, x, z, yaw, pitch, fov]; y is your eye height unless a key sets it (the stairs).
const VISITS = [
  // the flash-forward: things falling up all around, the hole overhead (shown at V_FF + v; keys in story time)
  { from: 280, to: 285, keys: [[280, 13.0, -9.0, -2, 29, 76], [285, 13.0, -9.6, -2, 32, 74]] },
  // a normal night; the alert; up at the sky; back down to the big screen, zooming in on its LIVE picture
  { from: 5, to: 24, keys: [
    [5, 13.4, 7.0, -30, 6, 58], [8.6, 13.4, 3.4, -18, 2, 58], [10.5, 13.4, 3.0, 8, -8, 56], [12.0, 13.4, 3.0, 0, 6, 56],
    [13.6, 13.4, 3.0, -2, 30, 50], [16.6, 13.4, 3.0, -4, 31, 46], [18.6, 13.4, 3.0, -16, 6, 54], [21.0, 13.4, 3.0, -6, 8, 40],
    [24.0, 13.4, 3.0, -5, 9, 22]] },
  // after Neptune: panic; NASA's note; Mom; (19 days later, from 44.4) the evacuation: gridlock, suitcases; Dad's
  // text; zoom into the LIVE picture of Saturn (the story jumps from 49 to the Saturn cutaway at 62)
  // (two visits: a single spline across the cut swung the camera past its mark)
  { from: 37, to: 44.35, keys: [
    [37, 13.4, 3.0, -5, 9, 24], [38.4, 13.4, 3.0, -8, 7, 48], [41, 13.4, 3.0, -30, 0, 56], [44.35, 13.4, 3.0, -6, 3, 56]] },
  { from: 44.35, to: 49, keys: [
    [44.35, -13.2, -4.0, 26, 2, 60], [46.4, -13.2, -6.0, 12, 1, 58], [47.6, -13.2, -8.4, 6, 8, 44], [49, -13.2, -9.2, 7, 9, 24]] },
  // after Saturn: look up, now you can see it; Mom's text; you start walking south (for the airport)
  { from: 78, to: 95, keys: [
    [78, -13.2, -9.2, 7, 9, 26], [79.5, -13.2, -9.2, 4, 20, 50], [84, -13.2, -9.2, 2, 30, 46], [88, -13.2, -9.2, -12, 12, 56],
    [91, -13.2, -8.4, 120, 2, 60], [95, -13.0, -4.0, 168, 0, 62]] },
  // the last hour: orange light from the disk; up at it and the Moon stretching; the alert; run for the subway; down
  { from: 150, to: 200, keys: [
    [150, 13.0, 13.0, -14, 10, 60], [154, 13.0, 11.0, -6, 22, 56], [158, 13.0, 10.4, -8, 30, 46], [162, 13.0, 10.0, -6, 37, 40],
    [169, 13.0, 10.0, -5, 38, 38], [173, 13.0, 8.0, -10, 22, 54], [177, 13.0, 2.4, -2, 4, 58], [179, 13.0, 2.4, 6, -6, 58],
    [182.5, 13.0, 1.6, -10, 0, 60], [186, 13.6, -6.0, -6, -2, 62], [189.5, 14.4, -14.5, -2, -6, 62], [192.5, 14.65, -19.6, 0, -16, 62],
    [196.5, 14.65, -24.0, 0, -22, 62, -2.0], [200, 14.65, -27.0, 0, -14, 62, -4.0]] },
  // 30 minutes left, outside: the ocean racing down the avenue toward you, then pouring down the subway stairs
  { from: 222.6, to: 225, keys: [[222.6, 12.4, -11.5, -3, 7, 64], [223.8, 12.5, -12.5, 6, -4, 62], [225, 12.6, -13.2, 11, -20, 60]] },
  // the end: up the stairs (facing south), turn round: the flooded avenue under the hole; gravity flips; the horizon
  // peels up; you're lifted: first person all the way up (292-306), looking down at the street falling away from you,
  // then up into the ring
  { from: 252, to: 300, keys: [
    [252, 14.65, -27.2, 180, 10, 62, -3.6], [254.2, 14.65, -22.0, 180, 4, 62, -0.5], [255.4, 14.65, -19.6, 180, 0, 62],
    [258, 14.2, -17.5, 30, 10, 60], [261, 13.6, -16.0, -6, 16, 56], [265, 13.4, -15.4, -14, 4, 58], [270, 13.2, -15.0, 8, 8, 60],
    [274, 13.0, -14.0, -8, 14, 64], [279, 13.0, -14.6, -4, 16, 62], [284, 13.0, -14.8, -26, 8, 62], [289, 13.0, -14.8, 2, 12, 64],
    [293, 13.0, -14.8, 0, 18, 66], [296.5, 13.0, -14.8, 8, -34, 72], [300, 13.0, -14.8, -12, -46, 76], [303, 13.0, -14.8, -6, 18, 76],
    [306, 13.0, -14.8, -2, 58, 82]] },
];
const EYE = 1.66;

export function makeStreet(renderer) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0b0d14, 0.0012);
  const camera = new THREE.PerspectiveCamera(58, 1920 / 1080, 0.1, 6000);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  const sky = makeSky();
  scene.add(sky.mesh);
  const R = rng(2024);

  const plainMat = (color, rough = 0.9, extra = {}) => patch(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
  const glowMat = (color) => patch(new THREE.MeshBasicMaterial({ color, toneMapped: true }));
  const shadowy = (m) => { m.frustumCulled = false; return m; };
  const buildingMat = patch(new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.0 }), { windows: true });

  // the reflections (glass, the flood): a dark night sky with the city glow, baked once
  {
    const pm = new THREE.PMREMGenerator(renderer);
    const env = new THREE.Scene();
    env.background = new THREE.Color(0x0a0c14);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(50, 16, 8), new THREE.MeshBasicMaterial({ color: 0x3a2a24, side: THREE.BackSide }));
    env.add(glow);
    for (const [x, c] of [[-20, 0xff4fa0], [20, 0x4fb8ff], [0, 0xffc860]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
      m.position.set(x, 8, -40); env.add(m);
    }
    scene.environment = pm.fromScene(env, 0.03).texture;
  }

  // ---------- the ground ----------
  const box = (mat, x0, x1, y1, z0, z1, y0 = -2) => {
    const sx = Math.min(80, Math.ceil((x1 - x0) / 10)), sz = Math.min(80, Math.ceil((z1 - z0) / 10));
    const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0, sx, 1, sz).translate(0, -(y1 - y0) / 2, 0);
    const m = new THREE.Mesh(geo, mat);
    m.position.set((x0 + x1) / 2, y1, (z0 + z1) / 2);
    m.frustumCulled = false;
    scene.add(m);
    return m;
  };
  const M = {
    asphalt: plainMat(0x18191d, 0.82, { envMapIntensity: 0.6 }),
    walk: plainMat(0x55524e, 0.9, { envMapIntensity: 0.4 }),
    curb: plainMat(0x77726b, 0.85),
    stair: plainMat(0x3b3a38, 0.9),
    wall: plainMat(0x2d3a33, 0.8),
  };
  const Z_FAR = -760, Z_NEAR = 80;
  box(M.asphalt, -ROAD, ROAD, 0, CROSS_Z0, Z_NEAR, -1);
  box(M.asphalt, -900, 900, 0.0, CROSS_Z0, CROSS_Z1, -1);                      // the cross street
  for (const side of [-1, 1]) {
    // the sidewalks (the east one has the subway opening cut out of it)
    const xa = side < 0 ? -WALK : ROAD, xb = side < 0 ? -ROAD : WALK;
    for (const [z0, z1] of [[CROSS_Z1, Z_NEAR]]) {
      if (side > 0 && z0 === CROSS_Z1) {
        box(M.walk, xa, xb, 0.15, SUB.z1, z1);
        box(M.walk, xa, xb, 0.15, z0, SUB.z0);
        box(M.walk, xa, SUB.x0, 0.15, SUB.z0, SUB.z1);
        box(M.walk, SUB.x1, xb, 0.15, SUB.z0, SUB.z1);
      } else box(M.walk, xa, xb, 0.15, z0, z1);
      box(M.curb, side < 0 ? -ROAD - 0.2 : ROAD, side < 0 ? -ROAD : ROAD + 0.2, 0.16, z0, z1);
    }
    box(plainMat(0x22201e, 0.95), side < 0 ? -900 : WALK, side < 0 ? -WALK : 900, 0.14, Z_FAR, Z_NEAR, -1);
  }
  // the avenue ends at the cross street: across it, the low building with the main screen (screens.js)
  box(M.walk, -120, 120, 0.15, CROSS_Z0 - 4, CROSS_Z0);
  box(plainMat(0x22201e, 0.95), -900, 900, 0.14, Z_FAR, CROSS_Z0 - 4, -1);
  // lane markings, crosswalks and stop lines
  {
    const lines = glowMat(new THREE.Color(0.32, 0.31, 0.28));
    const dash = new THREE.BoxGeometry(0.16, 0.02, 3);
    const xs = [-5.5, 5.5];
    const n = 150;
    const im = new THREE.InstancedMesh(dash, lines, n * 2 + 60);
    let k = 0;
    for (let i = 0; i < n; i++) for (const x of xs) {
      const z = Z_NEAR - 2 - i * 5.6;
      if (z < CROSS_Z1 + 4) continue;
      dummy.position.set(x, 0.011, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); im.setMatrixAt(k++, dummy.matrix);
    }
    // zebra stripes on both sides of the intersection
    for (const zc of [CROSS_Z1 + 3, CROSS_Z0 - 3]) for (let i = 0; i < 14; i++) {
      dummy.position.set(-ROAD + 0.8 + i * 1.6, 0.012, zc); dummy.scale.set(4.5, 1, 1); dummy.rotation.set(0, Math.PI / 2, 0); dummy.updateMatrix(); im.setMatrixAt(k++, dummy.matrix);
    }
    im.count = k;
    im.frustumCulled = false;
    scene.add(im);
    const yellow = glowMat(new THREE.Color(0.45, 0.33, 0.06));
    box(yellow, -0.2, -0.05, 0.012, CROSS_Z1 + 6, Z_NEAR, 0);
    box(yellow, 0.05, 0.2, 0.012, CROSS_Z1 + 6, Z_NEAR, 0);
  }

  // ---------- the subway entrance (stairs down toward -z, a railing, two green globes) ----------
  {
    const { x0, x1, z0, z1, depth } = SUB;
    const nSteps = 22, run = (z1 - z0) / nSteps, rise = depth / nSteps;
    const steps = new THREE.InstancedMesh(new THREE.BoxGeometry(x1 - x0, rise, run + 0.02), M.stair, nSteps);
    for (let i = 0; i < nSteps; i++) {
      dummy.position.set((x0 + x1) / 2, -rise * (i + 0.5), z1 - run * (i + 0.5)); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); steps.setMatrixAt(i, dummy.matrix);
    }
    steps.frustumCulled = false;
    scene.add(steps);
    // side walls (tiled green), the landing, and the ceiling over the bottom
    box(M.wall, x0 - 0.25, x0, 0.15, z0 - 6, z1, -depth - 3);
    box(M.wall, x1, x1 + 0.25, 0.15, z0 - 6, z1, -depth - 3);
    box(M.stair, x0, x1, -depth, z0 - 6, z0, -depth - 0.3);
    box(M.wall, x0 - 0.25, x1 + 0.25, 0.15, z0 - 6.25, z0 - 6, -depth - 3);
    box(M.wall, x0, x1, 0.15, z0 - 6, z0 + 0.2, -2.0);
    // the railing round three sides
    const rail = plainMat(0x1d3a2c, 0.5, { metalness: 0.4 });
    const rbar = (ax, az, bx, bz) => {
      const len = Math.hypot(bx - ax, bz - az);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, len), rail);
      m.position.set((ax + bx) / 2, 1.05, (az + bz) / 2); m.rotation.y = Math.atan2(bx - ax, bz - az); scene.add(m);
      for (let i = 0; i <= Math.round(len / 1.2); i++) {
        const k = i / Math.max(1, Math.round(len / 1.2));
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.05, 0.05), rail);
        p.position.set(lerp(ax, bx, k), 0.6, lerp(az, bz, k)); scene.add(p);
      }
    };
    rbar(x0, z1, x0, z0); rbar(x1, z1, x1, z0); rbar(x0, z0, x1, z0);
    for (const x of [x0, x1]) {
      const globe = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), glowMat(new THREE.Color(0.25, 1.1, 0.45)));
      globe.position.set(x, 1.62, z1); scene.add(globe);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.5, 8), rail);
      post.position.set(x, 0.85, z1); scene.add(post);
    }
    // the stairwell is lit from below
    const pl = new THREE.PointLight(0xdfe8ff, 26, 12, 1.4);
    pl.position.set((x0 + x1) / 2, -depth + 0.6, z0 - 2.5); scene.add(pl);
  }

  // ---------- the buildings ----------
  const B = [];
  const addB = (x, z, w, d, h, color) => B.push({ x, z, w, d, h, seed: R(), color: color ?? [0x5b5550, 0x6a625b, 0x4c4a4c, 0x7a6e62, 0x3f4650, 0x58606a][Math.floor(R() * 6)] });
  for (const side of [-1, 1]) {
    // the canyon walls: front row along the sidewalks, with the cross street gap
    let z = Z_NEAR + 10;
    while (z > CROSS_Z1 + 6) {
      const d = Math.min(18 + R() * 26, z - CROSS_Z1);
      const zc = z - d / 2;
      const tower = R() < 0.35;
      const h = tower ? 90 + R() * 140 : 28 + R() * 60;
      const w = 22 + R() * 14;
      addB(side * (WALK + 0.2 + w / 2), zc, w, d - 0.6, h, tower ? [0x46505c, 0x3c4652, 0x55606c][Math.floor(R() * 3)] : undefined);
      z -= d;
    }
    // behind them, and along the cross street beyond the screen building
    for (let i = 0; i < 90; i++) {
      const x = side * (60 + R() * 300), zz = Z_NEAR - R() * 820;
      const w = 18 + R() * 30, tower = R() < 0.3;
      addB(x, zz, w, 18 + R() * 30, tower ? 80 + R() * 160 : 25 + R() * 60);
    }
    for (let x = 38; x < 300; x += 24 + R() * 10) addB(side * x, CROSS_Z0 - 18 - R() * 6, 22, 26, 22 + R() * 40);
  }
  // the skyline beyond the screen building (kept low enough that the sky over it stays open)
  for (let i = 0; i < 80; i++) { const zz = -330 - R() * 900; addB(-300 + R() * 600, zz, 20 + R() * 40, 20 + R() * 40, (30 + R() * 110) * (-zz / 500)); }
  const bGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const seedA = new Float32Array(B.length), groundA = new Float32Array(B.length).fill(0.15);
  B.forEach((b, i) => (seedA[i] = b.seed));
  bGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seedA, 1));
  bGeo.setAttribute('aGround', new THREE.InstancedBufferAttribute(groundA, 1));
  const bMesh = new THREE.InstancedMesh(bGeo, buildingMat, B.length);
  bMesh.frustumCulled = false;
  B.forEach((b, i) => {
    dummy.position.set(b.x, 0, b.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(b.w, b.h, b.d); dummy.updateMatrix();
    bMesh.setMatrixAt(i, dummy.matrix); bMesh.setColorAt(i, tmpC.set(b.color));
  });
  scene.add(bMesh);
  // rooftop beacons on the towers (red, slow blink)
  const beacons = B.filter((b) => b.h > 120);
  const beaconMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.9, 8, 6), glowMat(new THREE.Color(4, 0.25, 0.15)), beacons.length);
  beacons.forEach((b, i) => { dummy.position.set(b.x, b.h + 1.5, b.z); dummy.scale.setScalar(1); dummy.updateMatrix(); beaconMesh.setMatrixAt(i, dummy.matrix); });
  beaconMesh.frustumCulled = false;
  scene.add(beaconMesh);

  // ---------- the giant screens ----------
  const screens = makeScreens(scene, patch);

  // ---------- street lamps and traffic lights ----------
  const LAMPS = [];
  for (let z = Z_NEAR - 6; z > CROSS_Z1 + 2; z -= 26) for (const side of [-1, 1]) LAMPS.push({ x: side * (ROAD + 0.7), z, side });
  const poleMat = plainMat(0x2a2c30, 0.6, { metalness: 0.4 });
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.11, 8, 6).translate(0, 4, 0), poleMat, LAMPS.length);
  const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 0.1, 0.12).translate(-1.1, 0, 0), poleMat, LAMPS.length);
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.12, 0.35), glowMat(new THREE.Color(5.0, 3.6, 2.2)), LAMPS.length);
  LAMPS.forEach((l, i) => {
    dummy.rotation.set(0, l.side > 0 ? 0 : Math.PI, 0); dummy.scale.set(1, 1, 1);
    dummy.position.set(l.x, 0.15, l.z); dummy.updateMatrix(); poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(l.x, 8.0, l.z); dummy.updateMatrix(); arms.setMatrixAt(i, dummy.matrix);
    dummy.position.set(l.x - l.side * 2.0, 7.9, l.z); dummy.updateMatrix(); heads.setMatrixAt(i, dummy.matrix);
  });
  for (const m of [poles, arms, heads]) { m.frustumCulled = false; scene.add(m); }
  // pools of light under the lamps nearest you (real lights), the rest only glow
  const lampLights = [];
  for (let i = 0; i < 6; i++) { const pl = new THREE.PointLight(0xffc98a, 0, 34, 1.5); scene.add(pl); lampLights.push(pl); }
  // traffic lights at the intersection (they go dark with the grid)
  const tlMat = { r: glowMat(new THREE.Color(5, 0.3, 0.15)), g: glowMat(new THREE.Color(0.2, 4, 1.6)) };
  const tls = [];
  for (const [x, z] of [[ROAD + 0.5, CROSS_Z1 + 1], [-ROAD - 0.5, CROSS_Z0 - 1]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 6, 6).translate(0, 3, 0), poleMat); post.position.set(x, 0.15, z); scene.add(post);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.3, 0.4), plainMat(0x15161a, 0.6)); head.position.set(x, 5.6, z); scene.add(head);
    const r = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), tlMat.r); r.position.set(x, 6.0, z + (z > -70 ? 0.22 : -0.22)); scene.add(r);
    const g = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), tlMat.g); g.position.set(x, 5.25, z + (z > -70 ? 0.22 : -0.22)); scene.add(g);
    tls.push({ r, g });
  }

  // ---------- light ----------
  const hemi = new THREE.HemisphereLight(0x33405a, 0x1a1512, 0.55);
  scene.add(hemi);
  const diskLight = new THREE.DirectionalLight(0xff9a52, 0);
  scene.add(diskLight, diskLight.target);
  const screenLights = [0, 1, 2].map(() => { const p = new THREE.PointLight(0xffffff, 0, 60, 1.4); scene.add(p); return p; });

  // ---------- cars ----------
  const CAR_N = 88;
  const LANES = [-8.3, -2.8, 2.8, 8.3];   // the west two drive north (-z), the east two south (+z)
  const cars = [];
  for (let i = 0; i < CAR_N; i++) {
    const lane = LANES[i % 4];
    cars.push({
      lane, dir: lane < 0 ? -1 : 1, u0: R() * 300, speed: 7 + R() * 5,
      jamZ: (i >> 2) * 6.8 + R() * 1.2, liftT: 266 + R() * 18, spin: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(1.6),
      color: [0xb8b8b8, 0x1e1e22, 0xe0ddd5, 0x8a1c1c, 0x1d3557, 0x2f4f3f, 0x6d6d73][Math.floor(R() * 7)], taxi: R() < 0.45,
    });
  }
  const fleet = makeFleet(scene, CAR_N, { plainMat, glowMat, shadowy });
  { const RK = rng(77); cars.forEach((c, i) => fleet.color(i, c.taxi ? 0xf2b705 : c.color, c.taxi ? 0 : [0, 1, 2, 0, 3, 2, 1][Math.floor(RK() * 7)])); }
  const ROAD_LEN = 150, ROAD_Z0 = Z_NEAR - 10;
  function updateCars(v, s) {
    const t = s.t;
    cars.forEach((c, i) => {
      let z, lights = true, yaw = c.dir < 0 ? 0 : Math.PI;
      if (t < 44.4) {
        // a normal night: moving, then (after Neptune) slowing to a crawl
        const tr = t < 38 ? t : 38 + (Math.min(t, 48) - 38) * 0.4;
        const u = (c.u0 + c.speed * tr) % ROAD_LEN;
        z = c.dir < 0 ? ROAD_Z0 - u : ROAD_Z0 - ROAD_LEN + u;
      } else {
        // gridlock, bumper to bumper (from 150 the cars stand abandoned, lights on)
        const creep = t < 150 ? Math.max(0, Math.sin(t * 0.3 + c.u0) * 0.6) : 0;
        z = ROAD_Z0 - 4 - c.jamZ + creep - (c.dir < 0 ? 0 : 3.2);
        if (t >= 150) yaw += (c.u0 % 1 - 0.5) * 0.3;
      }
      const dt = t - c.liftT;
      const up = liftDisp(dt, 0.7, 0.4) * (1 + s.curl * 3);
      const r = dt > 0 ? dt * dt * 0.35 : 0;
      dummy.position.set(c.lane, (t >= 252 ? s.flood * 0.25 : 0) + up, z - up * 0.25);
      dummy.rotation.set(c.spin.x * r, yaw + c.spin.y * r, c.spin.z * r);
      const endFade = t < 44.4 ? Math.min(clamp((ROAD_Z0 - z) / 4), clamp((z - (ROAD_Z0 - ROAD_LEN)) / 4)) : 1;
      dummy.scale.setScalar(t >= 44.4 && z < CROSS_Z1 + 2 ? 0.0001 : Math.max(endFade, 0.0001));
      dummy.updateMatrix();
      fleet.set(i, dummy.matrix, lights);
    });
    fleet.commit();
  }

  // ---------- people ----------
  // Everyone has a lane (a fixed x) and an even spot along it, so nobody walks through anyone: 6 lanes per sidewalk,
  // 0.7 m apart, none where you stand (x 13.4 on the east side, -13.2 on the west); 40 people per lane, 6.5 m apart,
  // on a loop that starts 90 m behind you and turns off into the cross street at the north end (out of sight).
  // On a normal night the lanes alternate north/south; in the evacuation everyone heads south. Standing crowds (the
  // last hour, the flood) stand on a grid along the same lanes. (crowd.js people face +z at yaw 0: yaw here is the
  // direction they face with -z ahead, and pose() gets yaw + PI.)
  // (the east sidewalk has the subway opening and its railing at x 13.4-15.9: its three lanes go round it)
  const LANE_X = { 1: [11.75, 12.45, 16.45], [-1]: [-11.9, -12.55, -13.95, -14.65, -15.35, -16.05] };
  const PER_LANE = 40, LOOP = 260, Z_START = 100, TURN_Z = -78;
  const WALK_LANES = [...LANE_X[1].map((x, lane) => [1, lane]), ...LANE_X[-1].map((x, lane) => [-1, lane])];
  const PEOPLE_N = WALK_LANES.length * PER_LANE;
  const people = [];
  for (let i = 0; i < PEOPLE_N; i++) {
    const [side, lane] = WALK_LANES[Math.floor(i / PER_LANE)], k = i % PER_LANE;
    const RL = rng(lane * 31 + (side > 0 ? 7 : 3));
    const laneSpeed = 1.15 + RL() * 0.3, laneOff = RL() * LOOP;
    people.push({
      side, lane, x: LANE_X[side][lane], u0: laneOff + k * (LOOP / PER_LANE) + (R() - 0.5) * 0.8, dir: lane % 2 ? 1 : -1, speed: laneSpeed,
      hop: R() * 6.28, h: 0.9 + R() * 0.2, liftT: 264 + R() * 22, spin: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(3),
      bag: R() < 0.45, phone: R() < 0.8, look: R(), stay: R() < 0.42,
      // a standing spot: this lane, every 3 m along it (odd lanes offset by half, so neighbours don't line up)
      gz: 34 - k * 2.6 - (lane % 2) * 1.3 + (R() - 0.5) * 0.3,
    });
  }
  const crowd = makeCrowd(scene, PEOPLE_N, plainMat(0xffffff, 0.85), { castShadow: false });
  const clothes = [0x2b2d42, 0x8d99ae, 0xb3243a, 0xd8d8d0, 0x3a5a40, 0xc49a6c, 0x264653, 0xd9b44a, 0x6d597a, 0x1d1d1d, 0x7b2d26, 0x3e5c76];
  { const RP = rng(4141); people.forEach((p, i) => crowd.color(i, clothes[Math.floor(RP() * clothes.length)], [0x2b2d42, 0x3d405b, 0x1d1d1d, 0x6b705c, 0x284b63][Math.floor(RP() * 5)], SKIN[Math.floor(RP() * SKIN.length)], HAIR[Math.floor(RP() * HAIR.length)], RP() < 0.7)); }
  // rolling suitcases (the evacuation)
  const bags = new THREE.InstancedMesh(new THREE.BoxGeometry(0.38, 0.55, 0.24), plainMat(0xffffff, 0.6), PEOPLE_N);
  { const RB = rng(55); for (let i = 0; i < PEOPLE_N; i++) bags.setColorAt(i, tmpC.set([0x1b1b1f, 0x2d4a7a, 0x7a2a2a, 0x3a3a3a, 0x8a7a5a][Math.floor(RB() * 5)])); }
  bags.frustumCulled = false;
  scene.add(bags);
  // glowing phone screens in people's hands
  const phones = new THREE.InstancedMesh(new THREE.BoxGeometry(0.075, 0.14, 0.012), glowMat(new THREE.Color(0.9, 1.0, 1.25)), PEOPLE_N);
  phones.frustumCulled = false;
  scene.add(phones);
  const cam = { x: 0, z: 0, yaw: 0, fov: 60 };
  const STRAIGHT = Z_START - TURN_Z;
  // u along a lane's path (northbound): straight up the avenue, then out along the cross street
  // (the outermost lane turns first, so the turning lanes never cross each other)
  const along = (p, u, out) => {
    const dz = 2 + (LANE_X[p.side].length - 1 - p.lane) * 0.7;
    if (u < STRAIGHT + dz) { out.x = p.x; out.z = Z_START - u; out.yaw = 0; }
    else { out.x = p.x + p.side * (u - STRAIGHT - dz); out.z = TURN_Z - dz; out.yaw = -p.side * Math.PI / 2; }
    return out;
  };
  const tmpP = { x: 0, z: 0, yaw: 0 };
  // nobody stands where you stand in the last hour (x 13, z 13 -> 1.6) or at the end (x 13, z -15)
  const onYourPath = (p, end) => p.side > 0 && p.lane === 1 && (end ? p.gz - 10 < -4 && p.gz - 10 > -32 : p.gz > 0 && p.gz < 18);
  // the subway runners: the east lane beside the stairs (x 12.45), south of them; they run north up the lane, step
  // across into the stairs (x 14.65) and go down, all at once and at one pace, so the order holds all the way down
  const subRunner = (p) => p.side > 0 && p.lane === 1 && p.gz > SUB.z1 + 2.5;
  const SX = (SUB.x0 + SUB.x1) / 2, Z_STEP = SUB.z1 + 2.5, DIAG = Math.hypot(SX - LANE_X[1][1], 2.5);
  function updatePeople(v, s) {
    const t = s.t;
    people.forEach((p, i) => {
      let x = p.x, z, yaw, stride = 1, walkT = t, look = 0, armR = 0, armL = 0, pitch = 0, roll = 0, visible = true, y = 0.15;
      if (t < 44.4) {
        // walking in their lanes; at the alert everyone stops to read their phone, then looks up; after Neptune they
        // hurry on (everyone in a lane at the same pace, so the spacing holds)
        const stop = smooth(8.6, 9.6, t) * (1 - smooth(34, 37, t));
        const tw = t < 8.6 ? t : 8.6 + (Math.min(t, 9.6) - 8.6) * 0.5 + Math.max(0, Math.min(t, 37) - 34) * 0.5 + Math.max(0, t - 37) * 1.6;
        const u = (p.u0 + p.speed * tw) % LOOP;
        along(p, p.dir < 0 ? u : LOOP - u, tmpP);
        x = tmpP.x; z = tmpP.z; yaw = p.dir < 0 ? tmpP.yaw : tmpP.yaw + Math.PI;
        stride = (1 - stop) * (1 + 0.5 * smooth(37, 39, t));
        walkT = tw;
        armR = p.phone ? 0.7 * stop * (1 - s.lookUp * 0.7) : 0;
        look = s.lookUp * (0.5 + 0.5 * p.look) * stop;
      } else if (t < 150) {
        // the evacuation: every lane heads south, many with suitcases
        const u = (p.u0 + p.speed * 1.1 * (t - 44.4)) % LOOP;
        along(p, LOOP - u, tmpP);
        x = tmpP.x; z = tmpP.z; yaw = tmpP.yaw + Math.PI;
        armR = p.bag ? 0.15 : (p.phone ? 0.7 : 0);
        stride = 1.1;
      } else if (t < 252) {
        // the last hour: standing on their spots, staring up; after the alert the east side runs for the subway
        // (and down the stairs), the west side runs south (the southmost first, so nobody runs through anyone)
        const sx = x, sz = p.gz;
        if (onYourPath(p, false)) visible = false;
        const START = 179.6;
        if (t < START) { z = sz; yaw = Math.PI; stride = 0; look = s.lookUp * (0.4 + 0.6 * p.look); armR = p.phone && p.look > 0.6 ? 1.1 : 0; }
        else if (subRunner(p)) {
          // north up the lane, across into the stairs and down them (a little faster: you follow them down)
          let d = (t - START) * 4.2;
          const run1 = sz - Z_STEP;
          if (d < run1) { z = sz - d; yaw = 0; }
          else if (d < run1 + DIAG) { const k2 = (d - run1) / DIAG; x = lerp(x, SX, k2); z = lerp(Z_STEP, SUB.z1, k2); yaw = Math.atan2(-(SX - LANE_X[1][1]), 2.5); }
          else {
            const down = d - run1 - DIAG;
            x = SX; z = SUB.z1 - down; yaw = 0;
            y = 0.15 - Math.min(down, SUB.z1 - SUB.z0) * (SUB.depth / (SUB.z1 - SUB.z0));
            if (down > SUB.z1 - SUB.z0 + 2) visible = false;
          }
          stride = 1.5; walkT = t * 1.3;
        } else if (p.side > 0 && p.lane === 1) {
          // (the rest of the stairs lane, north of the stairs: on up the avenue, the same way and pace as the lane)
          z = sz - (t - START) * 3.6; yaw = 0; stride = 1.5; walkT = t * 1.3;
        } else {
          // everyone else runs south, down their own lane, all at one pace
          z = sz + (t - START) * 3.6; yaw = Math.PI; stride = 1.5; walkT = t * 1.3;
        }
      } else {
        // the end: the few left stand in the flood on their spots, staring up (none on your path)
        if (!p.stay || onYourPath(p, true)) visible = false;
        z = p.gz - 10;
        yaw = Math.PI + (p.look - 0.5) * 1.2;
        stride = 0;
        look = s.lookUp * (0.5 + 0.5 * p.look);
        y = 0.1;
      }
      // gravity going: a slow drift up off the ground, arms out for balance; then (each at their own moment) they fall
      // up, turning over, arms and legs flailing. Everything eases in: no hops, no snapping into the flail.
      const light = s.lift;
      const drift = t > 255 ? light * light * (0.35 + 0.15 * Math.sin(t * 0.9 + p.hop)) : 0;
      const dt = t - p.liftT;
      const up = liftDisp(dt, 0.9, 0.35) * (1 + s.curl * 2);
      const r = dt > 0 ? dt * dt * 0.4 : 0;
      const fl = smooth(0, 1.5, dt);
      const bal = t > 255 ? smooth(0.2, 0.7, light) : 0;
      crowd.pose(i, {
        x, y: y + drift + up, z: z - up * 0.2, yaw: yaw + Math.PI + p.spin.y * r, s: p.h, visible,
        walk: fl > 0 ? t * 4 + p.hop : walkT * 5.6 + p.hop, stride: lerp(stride, 1.1, fl), pitch: pitch + p.spin.x * r, roll: roll + p.spin.z * r,
        armL: lerp(Math.max(armL, bal * 0.9), 1.3 + 0.5 * Math.sin(t * 3.1 + p.hop), fl), armR: lerp(Math.max(armR, bal * 0.9), 1.4 + 0.5 * Math.sin(t * 2.7 + p.hop * 2), fl),
        look: look * (1 - fl),
      });
      const flail = fl > 0.5;
      // the suitcase rolls behind them; the phone sits in the raised right hand
      const showBag = visible && p.bag && t >= 44.4 && t < 150;
      if (showBag) {
        tmpV.set(0.42 * p.h, 0.3, 0.45).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        dummy.position.set(x + tmpV.x, y + 0.3, z + tmpV.z); dummy.rotation.set(0.25, yaw, 0); dummy.scale.setScalar(1);
      } else dummy.scale.setScalar(0);
      dummy.updateMatrix(); bags.setMatrixAt(i, dummy.matrix);
      if (visible && armR > 0.5 && !flail) {
        // at the end of the raised arm (shoulder 1.40 m, arm 0.6 m, swung forward by armR * 1.45 rad)
        const a = armR * 1.45;
        tmpV.set(-0.215 * p.h, (1.40 - 0.62 * Math.cos(a)) * p.h, -0.62 * Math.sin(a) * p.h).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        dummy.position.set(x + tmpV.x, y + tmpV.y, z + tmpV.z); dummy.rotation.set(a - 0.4, yaw, 0); dummy.scale.setScalar(p.h);
      } else dummy.scale.setScalar(0);
      dummy.updateMatrix(); phones.setMatrixAt(i, dummy.matrix);
    });
    crowd.commit();
    bags.instanceMatrix.needsUpdate = true; phones.instanceMatrix.needsUpdate = true;
  }

  // ---------- the flood (from 252) and the water that falls up ----------
  const waterMat = patch(new THREE.MeshStandardMaterial({ color: 0x0e1a20, roughness: 0.08, metalness: 0.1, envMapIntensity: 1.6, transparent: true, opacity: 0.94 }));
  waterMat.onBeforeCompile = ((prev) => (sh) => {
    prev(sh);
    sh.uniforms.uWT = G.uTime;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWT;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec2 q = vWPre.xz;
          float a = sin(q.x * 1.7 + uWT * 1.9) + sin(q.y * 2.3 - uWT * 1.4) + 0.6 * sin((q.x + q.y) * 4.1 + uWT * 2.7) + 0.4 * sin((q.x - q.y) * 6.3 - uWT * 3.1);
          float b = cos(q.x * 1.7 + uWT * 1.9) - cos(q.y * 2.3 - uWT * 1.4) + 0.6 * cos((q.x + q.y) * 4.1 + uWT * 2.7);
          normal = normalize(normal + (viewMatrix * vec4(a * 0.035, 0.0, b * 0.035, 0.0)).xyz); }`);
  })(waterMat.onBeforeCompile);
  // (the plane runs from its front edge 900 m north: the front races down the avenue at 28 m/s from 221.5)
  const water = new THREE.Mesh(new THREE.PlaneGeometry(200, 900, 40, 120).rotateX(-Math.PI / 2).translate(0, 0, -450), waterMat);
  water.position.set(0, 0, 150);
  const frontAt = (t) => (t >= 252 ? 150 : -84 + 28 * (t - 221.5));
  const foamU = { uT: G.uTime };
  const foamMat = new THREE.ShaderMaterial({
    uniforms: foamU, transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uT; varying vec2 vUv;
      float h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float f = n(vec2(vUv.x * 60.0, vUv.y * 8.0 - uT * 9.0)) * 0.6 + n(vec2(vUv.x * 140.0, vUv.y * 17.0 + uT * 5.0)) * 0.4;
        float a = smoothstep(0.35, 0.7, f) * smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
        gl_FragColor = vec4(vec3(0.85, 0.82, 0.78) * a, a);
      }`,
  });
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(34, 5).rotateX(-Math.PI / 2), foamMat);
  scene.add(foam);
  // the wave's breaking face: a churning white wall ~1.2 m high, leaning forward as it comes
  const crestMat = foamMat.clone();
  crestMat.side = THREE.DoubleSide;
  const crest = new THREE.Mesh(new THREE.PlaneGeometry(34, 2.2, 1, 1).translate(0, 1.1, 0), crestMat);
  crest.rotation.x = -0.5;
  scene.add(crest);
  // the torrent down the subway stairs (the same churning water as inside)
  const tor = new THREE.Mesh(new THREE.PlaneGeometry(SUB.x1 - SUB.x0, Math.hypot(SUB.z1 - SUB.z0, SUB.depth) + 0.6), new THREE.ShaderMaterial({
    uniforms: foamU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uT; varying vec2 vUv;
      float h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec2 q = vec2(vUv.x * 9.0 + vUv.y * 3.0, vUv.y * 7.0 + uT * 9.0);
        float f = n(q) * 0.5 + n(q * 2.3 + 3.1) * 0.3 + n(q * 5.1 - 7.3) * 0.2;
        float foam = smoothstep(0.35, 0.8, f);
        vec3 c = mix(vec3(0.06, 0.1, 0.09), vec3(0.62, 0.68, 0.64), foam * 0.85);
        gl_FragColor = vec4(c, 0.93);
      }`,
  }));
  {
    const ang = Math.atan2(SUB.depth, SUB.z1 - SUB.z0);
    tor.rotation.set(-Math.PI / 2 - ang, 0, 0);
    tor.position.set((SUB.x0 + SUB.x1) / 2, -SUB.depth / 2 + 0.35, (SUB.z0 + SUB.z1) / 2);
    scene.add(tor);
  }
  water.frustumCulled = false;
  scene.add(water);
  const BLOB_N = 700;
  const blobs = [];
  for (let i = 0; i < BLOB_N; i++) blobs.push({ x: (R() * 2 - 1) * 16, z: 6 - R() * 130, t0: 262 + R() * 26, s: 0.05 + R() * 0.35, w: R() * 6.28 });
  const blobMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), patch(new THREE.MeshStandardMaterial({ color: 0x223844, roughness: 0.05, metalness: 0.2, envMapIntensity: 2.2 })), BLOB_N);
  blobMesh.frustumCulled = false;
  scene.add(blobMesh);
  // loose things lifting off the street: trash, bins, signs, glass
  const JUNK_N = 260;
  const junk = [];
  for (let i = 0; i < JUNK_N; i++) junk.push({ x: (R() * 2 - 1) * 16, z: 8 - R() * 160, t0: 266 + R() * 22, s: 0.15 + R() * 0.6, spin: new THREE.Vector3(R(), R(), R()).multiplyScalar(4) });
  const junkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.6, 0.8), plainMat(0xffffff, 0.8), JUNK_N);
  { const RJ = rng(31); for (let i = 0; i < JUNK_N; i++) junkMesh.setColorAt(i, tmpC.set([0x2a2a2a, 0x3c5a3c, 0x777068, 0x8a6d3b, 0x9aa3ad][Math.floor(RJ() * 5)])); }
  junkMesh.frustumCulled = false;
  scene.add(junkMesh);
  function updateFlood(s) {
    const t = s.t;
    water.visible = s.flood > 0;
    water.position.y = s.flood * 0.62;
    water.position.z = frontAt(t);
    foam.visible = t >= 221.5 && t < 252;
    foam.position.set(0, water.position.y + 0.03, water.position.z - 1.8);
    crest.visible = foam.visible && t < 224.6;
    crest.position.set(0, water.position.y - 0.2, water.position.z - 0.4);
    tor.visible = t > 223.6 && t < 251.9;
    blobs.forEach((b, i) => {
      const dt = t - b.t0;
      if (t < 252 || dt <= 0) { dummy.scale.setScalar(0); }
      else {
        const up = liftDisp(dt, 0.6 + b.s, 0.25);
        dummy.position.set(b.x + Math.sin(dt + b.w) * 0.2, water.position.y + up, b.z);
        const st = 1 + Math.min(up * 0.15, 1.5);
        dummy.scale.set(b.s / Math.sqrt(st), b.s * st, b.s / Math.sqrt(st));
      }
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix(); blobMesh.setMatrixAt(i, dummy.matrix);
    });
    blobMesh.instanceMatrix.needsUpdate = true;
    junk.forEach((j, i) => {
      const dt = t - j.t0;
      if (t < 252) { dummy.scale.setScalar(0); }
      else {
        const up = liftDisp(dt, 0.8, 0.4) * (1 + s.curl * 2);
        const r = dt > 0 ? dt * dt * 0.3 : 0;
        dummy.position.set(j.x, water.position.y - 0.2 + up, j.z);
        dummy.rotation.set(j.spin.x * r, j.spin.y * r, j.spin.z * r);
        dummy.scale.setScalar(j.s);
      }
      dummy.updateMatrix(); junkMesh.setMatrixAt(i, dummy.matrix);
    });
    junkMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- sky directions ----------
  const dirFromAzEl = (az, el, out) => out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  const bhDir = new THREE.Vector3(), moonDir = new THREE.Vector3(), moon0 = new THREE.Vector3(), tail = new THREE.Vector3();
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), q0 = new THREE.Quaternion(), fwd = new THREE.Vector3(0, 0, -1);
  const slerpDir = (a, b, k, out) => { qa.setFromUnitVectors(fwd, a); qb.setFromUnitVectors(fwd, b); q0.slerpQuaternions(qa, qb, k); return out.copy(fwd).applyQuaternion(q0); };

  function camKeys(v) {
    const t = v < FF_LEN ? V_FF + v : v;
    for (const vis of VISITS) if (t >= vis.from && t <= vis.to + 0.001) return { vis, t };
    return { vis: VISITS[1], t };
  }

  return {
    scene, camera, screens, crowd,
    frame(v, s) {
      const t = s.t;
      G.uTime.value = t;
      // ---- camera ----
      const { vis, t: tk } = camKeys(v);
      const k = vis.keys;
      const col = (j) => k.map((r) => [r[0], r[j]]);
      let x = spline(col(1), tk), z = spline(col(2), tk), yaw = spline(col(3), tk), pitch = spline(col(4), tk), fov = spline(col(5), tk);
      const yOff = spline(k.map((r) => [r[0], r[6] ?? 0]), tk);
      // walking bob while you move; running bob in the last hour; the shaking ground
      const sp = Math.hypot(spline(col(1), tk + 0.05) - x, spline(col(2), tk + 0.05) - z) / 0.05;
      const bob = Math.min(sp, 4) * 0.018 * Math.sin(tk * (sp > 2.5 ? 11 : 7.5));
      const hf = (q) => Math.sin(t * 31 + q) * 0.5 + Math.sin(t * 47.3 + q * 2.1) * 0.3 + Math.sin(t * 73.1 + q * 3.7) * 0.2;
      const shake = s.quake * 0.35;
      yaw += wobble(t * 0.23, 3) * 0.6 * (fov / 55) + hf(2) * shake;
      pitch += wobble(t * 0.27, 4) * 0.4 * (fov / 55) + hf(1) * shake;
      const roll = wobble(t * 0.19, 5) * 0.4 + hf(3) * shake * 0.6;
      // you: lifted off the ground at the very end
      // (slow at first, so you see the street drop away under you: ~15 m by 296, ~100 m by 300, ~350 m by 306)
      const youUp = liftDisp(t - 292, 1.0, 0.09);
      camera.position.set(x, EYE + yOff + bob + youUp + (s.flood > 0 && yOff === 0 ? 0 : 0), z);
      camera.rotation.set(pitch * DEG, -yaw * DEG, (roll + s.you * 35 + 10 * Math.sin(t * 0.7) * smooth(293, 297, t)) * DEG);
      camera.fov = fov;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();

      // ---- sky ----
      // high over the avenue at first; at the end it comes down the sky and looms over the end of the avenue
      const bhEl = s.ff ? 50 : lerp(31, 37, smooth(5, 200, t)) - 6 * smooth(240, 262, t);
      dirFromAzEl((s.ff ? -7 : -2) * DEG, bhEl * DEG, bhDir);
      dirFromAzEl(-10 * DEG, 45 * DEG, moon0);   // (above the avenue, where the buildings don't hide it)
      const prog = Math.pow(smooth(158, 256, t), 1.6);
      slerpDir(moon0, bhDir, prog * 0.92, moonDir);
      tail.copy(bhDir).sub(moon0).normalize();
      const u = sky.uniforms;
      sky.mesh.position.copy(camera.position);
      u.uTime.value = t;
      u.uNight.value = 1;
      u.uStarVis.value = 0.55 + 0.25 * smooth(150, 200, t);
      u.uSunDir.value.set(0.2, -0.4, 1).normalize();
      u.uBhDir.value.copy(bhDir);
      u.uBhD.value = s.bhD;
      u.uDisk.value = Math.min(s.disk, 1.05);
      u.uMoonDir.value.copy(moonDir);
      u.uMoonTail.value.copy(tail);
      u.uMoonStretch.value = s.moonStretch;
      u.uMoonFade.value = 1 - smooth(236, 252, t);
      u.uJupFade.value = 0;
      u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / 1080;

      // ---- the bend: the horizon peels up toward the hole ----
      G.uCurl.value = s.curl * 3.2;
      G.uCurlOrigin.value.set(x, z);
      G.uCurlDir.value.set(0, -1);
      // the grid: lights go out building by building in the last hour and at the end
      G.uLightsOut.value = 0.12 * smooth(150, 200, t) + 0.3 * smooth(267, 271, t) + 0.5 * smooth(272, 292, t);

      // ---- light ----
      const disk = s.disk;
      diskLight.position.copy(bhDir).multiplyScalar(200).add(camera.position);
      diskLight.target.position.copy(camera.position);
      diskLight.intensity = 2.2 * smooth(0.3, 1.8, disk) + 2.5 * smooth(252, 280, t) + (s.ff ? 3 : 0);
      hemi.intensity = 0.5 + 0.35 * smooth(0.3, 1.8, disk) + 0.9 * smooth(252, 280, t) + (s.ff ? 1.2 : 0);
      hemi.color.setRGB(0.2, 0.25, 0.35).lerp(tmpC.setRGB(0.55, 0.36, 0.22), smooth(0.4, 1.8, disk));
      scene.fog.color.setRGB(0.04, 0.05, 0.08).lerp(tmpC.setRGB(0.16, 0.08, 0.04), smooth(0.4, 1.8, disk));
      scene.fog.density = 0.0011 * (1 - 0.6 * s.curl);
      // the lamps nearest you light the street; they die with the grid
      const near = LAMPS.map((l, i) => [i, Math.hypot(l.x - camera.position.x, l.z - camera.position.z)]).sort((a, b) => a[1] - b[1]).slice(0, lampLights.length);
      const lampOn = t < 268 ? 1 : t < 271 ? (Math.sin(t * 53) > 0 ? 1 : 0) : 0;
      near.forEach(([i], j) => { const l = LAMPS[i]; lampLights[j].position.set(l.x - l.side * 2.0, 7.4, l.z); lampLights[j].intensity = 42 * lampOn; });
      heads.visible = lampOn > 0.01;
      for (const tl of tls) { const red = t >= 38 || Math.floor(t / 12) % 2 === 0; tl.r.visible = red && lampOn > 0; tl.g.visible = !red && lampOn > 0; }
      beaconMesh.visible = Math.sin(t * 2.2) > 0.2 && lampOn > 0;

      // ---- the world ----
      cam.x = x; cam.z = z; cam.yaw = yaw * DEG; cam.fov = fov;
      updateCars(v, s);
      updatePeople(v, s);
      updateFlood(s);
      const sc = screens.frame(v, s);
      sc.lights.forEach((l, i) => { const p = screenLights[i]; if (!p) return; p.position.copy(l.pos); p.color.copy(l.color); p.intensity = l.power * 160 * lampOn; });
      return { bhDir };
    },
  };
}

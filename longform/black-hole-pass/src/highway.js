// The highway to the airport at dusk, 8 days before: every outbound lane jammed for miles (a river of tail lights), the
// inbound lanes empty, the airport's lights ahead with the last planes climbing out. In the sky the black hole (its
// disk now glowing) and Jupiter beside it, then (after the cutaway) Jupiter's streak. Your flight is cancelled; people
// leave their cars and walk. Metres; the highway runs north (-z); you stand on the right shoulder by your car.
import * as THREE from 'three';
import { makeSky } from './sky.js';
import { makeFleet } from './cars.js';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { rng, smooth, clamp, lerp, DEG, wobble } from './util.js';

const OUT = [2.2, 5.8, 9.4, 13.0];       // outbound lanes (to the airport, -z)
const IN = [-2.2, -5.8, -9.4, -13.0];
const EYE = 1.66 + 1.05;   // you climbed onto the median barrier to see how far the jam goes
const dummy = new THREE.Object3D();
const tmpC = new THREE.Color();

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
// [v, x, z, yaw, pitch, fov]
const KEYS = [
  [95, 0.5, 3.0, 14, -2, 56], [99, 0.5, 2.0, 8, 0, 54], [102.8, 0.5, 1.6, 2, 1, 54], [106, 0.5, 1.5, -14, 22, 34],
  [120, 0.5, 1.5, -18, 26, 30], [122.6, 0.5, 1.5, -19, 26, 30], [125, 0.5, 1.5, 4, 2, 54], [127.5, 0.5, 1.5, 6, 1, 54], [131, 0.5, 1.5, 34, -6, 56],
  [135, 0.5, 1.5, 12, -2, 54], [140, 0.5, 1.5, 6, 0, 52], [143, 0.5, 1.0, -8, 12, 46], [150, 0.5, -6.0, 6, 2, 56],
];

export function makeHighway() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x12131c, 0.0003);
  const camera = new THREE.PerspectiveCamera(56, 1920 / 1080, 0.1, 9000);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  const sky = makeSky();
  scene.add(sky.mesh);
  const R = rng(9191);
  const plainMat = (color, rough = 0.9, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
  const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
  const shadowy = (m) => { m.frustumCulled = false; return m; };

  // ---------- the highway: deck, barriers, lane lines, lamps; the ground far below with the city's lights ----------
  const Z0 = 60, Z1 = -2600;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(34, 1.2, Z0 - Z1).translate(0, -0.6, (Z0 + Z1) / 2), plainMat(0x2a2a2d, 0.9));
  scene.add(deck);
  const conc = plainMat(0x77746e, 0.85);
  for (const x of [-16.5, 16.5, 0]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(x === 0 ? 0.6 : 0.45, 1.05, Z0 - Z1).translate(x, 0.52, (Z0 + Z1) / 2), conc);
    scene.add(b);
  }
  {
    const n = 420;
    const lines = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, 0.02, 3), glowMat(new THREE.Color(0.42, 0.4, 0.36)), n * 6);
    let k = 0;
    for (let i = 0; i < n; i++) for (const x of [4.0, 7.6, 11.2, -4.0, -7.6, -11.2]) {
      dummy.position.set(x, 0.01, Z0 - 3 - i * 6.2); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); lines.setMatrixAt(k++, dummy.matrix);
    }
    lines.frustumCulled = false; scene.add(lines);
  }
  // sodium lamps on the median every 45 m
  const LN = 60;
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 12, 6).translate(0, 6, 0), plainMat(0x3a3b3f, 0.6, { metalness: 0.4 }), LN);
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(1.0, 0.18, 0.4), glowMat(new THREE.Color(6, 3.6, 1.4)), LN * 2);
  for (let i = 0; i < LN; i++) {
    const z = Z0 - 50 - i * 45;   // (none right in front of you: the nearest ahead is 36 m away)
    dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
    dummy.position.set(0, 1.0, z); dummy.updateMatrix(); poles.setMatrixAt(i, dummy.matrix);
    for (const s of [-1, 1]) { dummy.position.set(s * 2.2, 12.6, z); dummy.updateMatrix(); heads.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), dummy.matrix); }
  }
  for (const m of [poles, heads]) { m.frustumCulled = false; scene.add(m); }
  const lampLights = [0, 1, 2].map((i) => { const p = new THREE.PointLight(0xffb060, 60, 70, 1.4); p.position.set(2.2, 12.2, Z0 - 50 - i * 45); scene.add(p); return p; });
  // the overhead sign gantry: AIRPORT 9 MI, and the message board (ALL FLIGHTS CANCELLED after the news)
  const signCanvas = document.createElement('canvas'); signCanvas.width = 1024; signCanvas.height = 300;
  const signTex = new THREE.CanvasTexture(signCanvas); signTex.colorSpace = THREE.SRGBColorSpace; signTex.anisotropy = 8;
  const boardCanvas = document.createElement('canvas'); boardCanvas.width = 1024; boardCanvas.height = 256;
  const boardTex = new THREE.CanvasTexture(boardCanvas); boardTex.colorSpace = THREE.SRGBColorSpace; boardTex.anisotropy = 8;
  {
    const g = signCanvas.getContext('2d');
    g.fillStyle = '#0d6b3a'; g.fillRect(0, 0, 1024, 300);
    g.strokeStyle = '#fff'; g.lineWidth = 10; g.strokeRect(12, 12, 1000, 276);
    g.fillStyle = '#fff'; g.font = '700 120px "Segoe UI", Arial'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('✈ AIRPORT', 50, 110); g.font = '600 90px "Segoe UI", Arial'; g.fillText('9 MI', 60, 225);
    g.textAlign = 'right'; g.font = '800 160px "Segoe UI", Arial'; g.fillText('↑', 960, 160);
    const gantryZ = -70;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.9), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.5, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.35 }));
    sign.position.set(7.8, 8.4, gantryZ + 0.3); sign.rotation.y = 0; scene.add(sign);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: true, color: new THREE.Color(1.8, 1.8, 1.8) }));
    board.position.set(-7.8, 8.4, gantryZ + 0.3); board.rotation.y = 0; scene.add(board);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(34, 0.6, 0.6), plainMat(0x5a5b5e, 0.6, { metalness: 0.5 })); beam.position.set(0, 10.2, gantryZ); scene.add(beam);
    for (const x of [-16.6, 16.6]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 10.4, 0.5), beam.material); p.position.set(x, 5.2, gantryZ); scene.add(p); }
  }
  let boardKey = '';
  const drawBoard = (t) => {
    const msg = t < 128.4 ? ['AIRPORT TRAFFIC', 'EXPECT LONG DELAYS'] : ['ALL FLIGHTS', 'CANCELLED'];
    const on = t < 128.4 || Math.floor(t * 1.6) % 2 === 0 || t > 136;
    const key = msg.join() + on;
    if (key === boardKey) return;
    boardKey = key;
    const g = boardCanvas.getContext('2d');
    g.fillStyle = '#080808'; g.fillRect(0, 0, 1024, 256);
    if (on) {
      g.fillStyle = '#ffb000'; g.font = '800 92px "Segoe UI", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(msg[0], 512, 74); g.fillText(msg[1], 512, 184);
    }
    boardTex.needsUpdate = true;
  };

  // the ground below (12 m down): dark, with the suburbs' lights; the city behind you; the airport ahead
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), plainMat(0x0d0e10, 1));
  ground.position.y = -12; scene.add(ground);
  {
    const N = 9000;
    const pts = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.6, 1.2), glowMat(new THREE.Color(3.2, 2.2, 1.2)), N);
    for (let i = 0; i < N; i++) {
      let x, z;
      do { x = (R() * 2 - 1) * 3500; z = 400 - R() * 3600; } while (Math.abs(x) < 40);
      dummy.position.set(x, -11.6, z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(0.6 + R()); dummy.updateMatrix(); pts.setMatrixAt(i, dummy.matrix);
      pts.setColorAt(i, tmpC.setRGB(1, 0.65 + R() * 0.3, 0.35 + R() * 0.4).multiplyScalar(1.5 + R() * 2));
    }
    pts.frustumCulled = false; scene.add(pts);
    // the skyline behind (south) and its glow
    const bl = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), plainMat(0x15161a, 0.9, { emissive: 0x2a2018, emissiveIntensity: 0.4 }), 120);
    for (let i = 0; i < 120; i++) { dummy.position.set((R() * 2 - 1) * 900, -12, 900 + R() * 900); dummy.scale.set(30 + R() * 50, 40 + R() * 260, 30 + R() * 50); dummy.updateMatrix(); bl.setMatrixAt(i, dummy.matrix); }
    bl.frustumCulled = false; scene.add(bl);
  }
  // the airport: a terminal strip, the tower, rows of runway lights
  const AZ = -2700;
  {
    const term = new THREE.Mesh(new THREE.BoxGeometry(700, 22, 120).translate(-150, 11 - 12, AZ), plainMat(0x22242a, 0.8, { emissive: 0xffd9a0, emissiveIntensity: 0.25 }));
    scene.add(term);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(6, 9, 70, 10).translate(250, 35 - 12, AZ - 60), plainMat(0x2b2c30, 0.7));
    scene.add(tower);
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(14, 10, 10, 12).translate(250, 75 - 12, AZ - 60), glowMat(new THREE.Color(1.2, 1.6, 1.4)));
    scene.add(cab);
    const N = 600;
    const rl = new THREE.InstancedMesh(new THREE.SphereGeometry(1.4, 6, 4), glowMat(new THREE.Color(4, 4, 4.4)), N);
    for (let i = 0; i < N; i++) {
      const row = i % 4, k = Math.floor(i / 4);
      const x = -1200 + k * 16, z = AZ - 200 - [0, 45, 300, 345][row];
      dummy.position.set(x, -11.5, z); dummy.scale.setScalar(1); dummy.updateMatrix(); rl.setMatrixAt(i, dummy.matrix);
      rl.setColorAt(i, row % 2 ? tmpC.setRGB(1, 1, 1.1) : tmpC.setRGB(0.4, 0.6, 1.6));
    }
    rl.frustumCulled = false; scene.add(rl);
  }
  // planes climbing out (only until the flights are grounded): white strobes + red/green tips on a simple body
  const planes = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 36, 8).rotateX(Math.PI / 2), plainMat(0x9a9ca2, 0.5));
    const wing = new THREE.Mesh(new THREE.BoxGeometry(34, 0.6, 5), body.material);
    const strobe = new THREE.Mesh(new THREE.SphereGeometry(1.3, 6, 4), glowMat(new THREE.Color(14, 14, 16)));
    strobe.position.set(0, -2.2, 0);
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 4), glowMat(new THREE.Color(10, 0.5, 0.3))); l.position.set(-17, 0, 0);
    const r = new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 4), glowMat(new THREE.Color(0.3, 8, 1.5))); r.position.set(17, 0, 0);
    const land = new THREE.Mesh(new THREE.SphereGeometry(1.6, 6, 4), glowMat(new THREE.Color(12, 11, 9))); land.position.set(0, -1, -18);
    g.add(body, wing, strobe, l, r, land);
    g.userData = { strobe, t0: 93 + i * 7.5, x: -500 + i * 260 };
    scene.add(g);
    planes.push(g);
  }

  // ---------- the jam: four outbound lanes, bumper to bumper for miles ----------
  const ROWS = 150;
  const CAR_N = ROWS * 4;
  const cars = [];
  for (let r = 0; r < ROWS; r++) for (let l = 0; l < 4; l++) {
    const z = 10 - r * 6.6 - R() * 1.4 - l * 1.1;
    cars.push({ x: OUT[l] + (R() - 0.5) * 0.3, z, yaw: (R() - 0.5) * 0.05, color: [0xb8b8b8, 0x1e1e22, 0xe0ddd5, 0x8a1c1c, 0x1d3557, 0x2f4f3f, 0x6d6d73, 0x3b2f2a][Math.floor(R() * 8)], kind: [0, 1, 2, 0, 3, 2, 1][Math.floor(R() * 7)], creep: R() * 6.28 });
  }
  // your car: right lane, beside you, driver's door side
  const fleet = makeFleet(scene, CAR_N, { plainMat, glowMat, shadowy });
  cars.forEach((c, i) => fleet.color(i, c.color, c.kind));
  function updateCars(t) {
    cars.forEach((c, i) => {
      const creep = t < 128 ? Math.max(0, Math.sin(t * 0.25 + c.creep)) * 0.5 : 0;
      dummy.position.set(c.x, 0, c.z - creep);
      dummy.rotation.set(0, c.yaw, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      fleet.set(i, dummy.matrix, true);
    });
    fleet.commit();
  }

  // ---------- people: by their cars, on their phones; after the news they leave the cars and walk on ----------
  // (one person per car, beside its right-hand door, for the first 120 cars; crowd.js people face +z at yaw 0, so
  // pose() gets yaw + PI to face north)
  const PN = 120;
  const people = [];
  for (let i = 0; i < PN; i++) {
    const c = cars[i * 2 + (i % 2)];
    people.push({ x: c.x + 1.3, z: c.z + 0.6, yaw: 0.6 + R() * 1.4, go: 129 + R() * 6, hop: R() * 6.28, phone: R() < 0.6, h: 0.9 + R() * 0.2 });
  }
  const crowd = makeCrowd(scene, PN, plainMat(0xffffff, 0.85), { castShadow: false });
  { const RP = rng(77); const clothes = [0x2b2d42, 0x8d99ae, 0xb3243a, 0xd8d8d0, 0x3a5a40, 0xc49a6c, 0x264653, 0xd9b44a, 0x6d597a, 0x1d1d1d]; people.forEach((p, i) => crowd.color(i, clothes[Math.floor(RP() * clothes.length)], [0x2b2d42, 0x3d405b, 0x1d1d1d, 0x6b705c][Math.floor(RP() * 4)], SKIN[Math.floor(RP() * SKIN.length)], HAIR[Math.floor(RP() * HAIR.length)], RP() < 0.7)); }
  function updatePeople(t, cam) {
    people.forEach((p, i) => {
      // turn to face north over half a second, then walk (1.25 m/s, everyone the same)
      const turn = smooth(p.go - 0.6, p.go, t);
      const d = Math.max(0, t - p.go) * 1.25;
      const yaw = p.yaw * (1 - turn);
      crowd.pose(i, { x: p.x, y: 0, z: p.z - d, yaw: yaw + Math.PI, s: p.h, walk: t * 5.4 + p.hop, stride: smooth(p.go, p.go + 0.4, t), armR: p.phone ? 0.7 * (1 - turn) : 0, look: 0.15 * (1 - turn) });
    });
    crowd.commit();
  }

  // ---------- light ----------
  const hemi = new THREE.HemisphereLight(0x5a6a90, 0x2a2018, 0.55);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xff9a60, 0.5);
  sunLight.position.set(-100, 8, 10); scene.add(sunLight);

  const dirFromAzEl = (az, el, out) => out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  const bhDir = new THREE.Vector3(), jup = new THREE.Vector3(), jTail = new THREE.Vector3();
  const cam = { x: 0, z: 0 };
  return {
    scene, camera,
    frame(v, s) {
      const t = s.t;
      const col = (j) => KEYS.map((r) => [r[0], r[j]]);
      const x = spline(col(1), v), z = spline(col(2), v);
      let yaw = spline(col(3), v), pitch = spline(col(4), v);
      const fov = spline(col(5), v);
      yaw += wobble(t * 0.23, 3) * 0.6; pitch += wobble(t * 0.27, 4) * 0.4;
      const sp = Math.abs(spline(col(2), v + 0.05) - z) / 0.05;
      camera.position.set(x, EYE + Math.min(sp, 2) * 0.02 * Math.sin(v * 7.5), z);
      camera.rotation.set(pitch * DEG, -yaw * DEG, wobble(t * 0.19, 5) * 0.4 * DEG);
      camera.fov = fov;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      cam.x = x; cam.z = z;

      // dusk: the Sun just set in the west (left)
      dirFromAzEl(-20 * DEG, 27 * DEG, bhDir);
      // Jupiter: a bright point beside the hole; after the cutaway, a long glowing streak curving round it
      dirFromAzEl(-15.0 * DEG, 25.5 * DEG, jup);
      jTail.copy(bhDir).sub(jup).normalize();
      const torn = smooth(119, 121, t);
      const u = sky.uniforms;
      sky.mesh.position.copy(camera.position);
      u.uTime.value = t;
      u.uNight.value = lerp(0.68, 0.86, smooth(95, 146, t));
      u.uStarVis.value = 0.5;
      u.uSunDir.value.set(-1, -0.04, 0.1).normalize();
      u.uBhDir.value.copy(bhDir);
      u.uBhD.value = s.bhD;
      u.uDisk.value = Math.min(s.disk, 1.0);
      u.uMoonFade.value = 0;
      u.uJupDir.value.copy(jup).lerp(bhDir, 0.35 * torn).normalize();
      u.uJupTail.value.copy(jTail);
      u.uJupStretch.value = torn * 0.95;
      u.uJupFade.value = 1.6;
      u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / 1080;
      hemi.intensity = 0.5 + 0.2 * Math.min(s.disk, 1);

      // the planes take off until the airport stops (the last one leaves at ~117)
      planes.forEach((g) => {
        const k = t - g.userData.t0;
        g.visible = k > 0 && k < 30 && t < 127;
        if (!g.visible) return;
        g.position.set(g.userData.x - k * 20, -12 + 40 + k * 22, AZ + 300 + k * 70);
        g.rotation.set(-0.22, Math.PI + 0.3, 0);
        g.userData.strobe.visible = Math.floor(t * 1.5 + g.userData.t0) % 2 === 0;
      });
      drawBoard(t);
      updateCars(t);
      updatePeople(t, cam);
    },
  };
}

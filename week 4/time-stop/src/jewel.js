// The jewelry store just off the square: a bright, warm room (x -5..5, z -9..2, ceiling 3.4 m), glass display cases
// round three sides with rings, necklaces and loose diamonds on black velvet, the street's lights through the front
// window. You sweep the cases left -> back -> right (JEWEL_A..JEWEL_B); each piece goes as you pass. A clerk, two
// customers and a guard frozen mid-moment; when time runs: the alarm (a red strobe), hands up, heads turning; then
// forensics: a tech in white at the case with a UV light, a cop, the police lights through the window.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, clamp, smooth, lerp } from './util.js';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { JEWEL_A, JEWEL_B } from './timeline.js';

const R = rng(77);
// the cases: [x, z, length along, axis ('z' runs along z), facing (+1/-1: which side the customers stand)]
export const CASES = [
  { x: -3.6, z: -4.2, len: 6.4, ax: 'z' },
  { x: 0.0, z: -7.6, len: 5.0, ax: 'x' },
  { x: 3.6, z: -4.2, len: 6.4, ax: 'z' },
];
// your path past them (x, z), in order, with the time you're at each point
export const PATH = [
  [-2.3, -0.4, JEWEL_A - 0.3], [-2.4, -1.5, JEWEL_A], [-2.4, -6.6, JEWEL_A + 1.0], [-1.6, -6.4, JEWEL_A + 1.25], [1.6, -6.4, JEWEL_A + 1.95],
  [2.4, -6.6, JEWEL_A + 2.15], [2.4, -1.4, JEWEL_B], [2.0, -0.2, JEWEL_B + 0.4],
];
export function youAt(v) {
  if (v <= PATH[0][2]) return { x: PATH[0][0], z: PATH[0][1], yaw: Math.PI };
  for (let i = 0; i < PATH.length - 1; i++) {
    const [x0, z0, t0] = PATH[i], [x1, z1, t1] = PATH[i + 1];
    if (v <= t1) { const k = (v - t0) / (t1 - t0); return { x: lerp(x0, x1, k), z: lerp(z0, z1, k), yaw: Math.atan2(-(x1 - x0), -(z1 - z0)), k }; }
  }
  const l = PATH[PATH.length - 1];
  return { x: l[0], z: l[1], yaw: 0 };
}
// the pieces: on the case tops (under the glass), each taken when you're nearest it
export const ITEMS = [];
for (const c of CASES) {
  const n = Math.round(c.len / 0.22);
  for (let i = 0; i < n; i++) {
    for (let row = 0; row < 2; row++) {
      const a = -c.len / 2 + 0.15 + (i + 0.5) * (c.len - 0.3) / n;
      const b = (row - 0.5) * 0.32;
      const x = c.ax === 'z' ? c.x + b : c.x + a, z = c.ax === 'z' ? c.z + a : c.z + b;
      const t = R();
      ITEMS.push({ x, y: 0.97, z, kind: t < 0.45 ? 0 : t < 0.75 ? 1 : 2, seed: R(), take: 0 });
    }
  }
}
// when you pass each: the nearest point of your path
{
  for (const it of ITEMS) {
    let best = 1e9, bt = JEWEL_A;
    for (let v = JEWEL_A; v <= JEWEL_B; v += 0.01) { const p = youAt(v); const d = Math.hypot(p.x - it.x, p.z - it.z); if (d < best) { best = d; bt = v; } }
    it.take = bt + (it.seed - 0.5) * 0.12;
  }
}
// people: [x, z, yaw, kind]
const PEOPLE = [
  { x: 4.5, z: -3.6, yaw: Math.PI / 2, kind: 'clerk', shirt: 0x1a1a1a, pants: 0x1a1a1a, skin: SKIN[1], hair: HAIR[0] },
  { x: -2.4, z: -2.9, yaw: Math.PI / 2 - 0.2, kind: 'cust', shirt: 0xb83a4a, pants: 0x222222, skin: SKIN[5], hair: HAIR[4] },
  { x: -2.25, z: -3.6, yaw: Math.PI / 2 + 0.1, kind: 'cust', shirt: 0x2a3a5a, pants: 0x3a3a3a, skin: SKIN[2], hair: HAIR[1] },
  { x: 3.9, z: 0.9, yaw: 0.35, kind: 'guard', shirt: 0x202a3a, pants: 0x1a1d24, skin: SKIN[4], hair: HAIR[7] },
  // forensics (only after the alarm)
  { x: -2.6, z: -4.6, yaw: Math.PI / 2, kind: 'tech', shirt: 0xf2f2f2, pants: 0xf2f2f2, skin: SKIN[0], hair: 0xf2f2f2 },
  { x: -1.0, z: -2.0, yaw: 0.54, kind: 'cop', shirt: 0x1a2440, pants: 0x161c2e, skin: SKIN[3], hair: 0x0a0a0a },
  { x: 1.4, z: -0.6, yaw: 0.78, kind: 'cop', shirt: 0x1a2440, pants: 0x161c2e, skin: SKIN[0], hair: 0x0a0a0a },
];

export function makeJewel(scene) {
  const G = new THREE.Group();
  scene.add(G);
  const std = (c, r = 0.5, m = 0, x = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, ...x });
  // the room
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 11).rotateX(-Math.PI / 2).translate(0, 0, -3.5), std(0x6e655a, 0.2, 0.1));
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(10, 11).rotateX(Math.PI / 2).translate(0, 3.4, -3.5), std(0xb8ad9c, 0.9));
  const walls = new THREE.Mesh(mergeGeometries([
    new THREE.PlaneGeometry(11, 3.4).rotateY(Math.PI / 2).translate(-5, 1.7, -3.5),
    new THREE.PlaneGeometry(11, 3.4).rotateY(-Math.PI / 2).translate(5, 1.7, -3.5),
    new THREE.PlaneGeometry(10, 3.4).translate(0, 1.7, -9),
  ]), std(0x5a4636, 0.7));
  // wall panels with warm lit niches
  const niches = [];
  for (let k = -3; k <= 3; k++) niches.push(new THREE.PlaneGeometry(0.9, 0.6).translate(k * 1.25, 1.75, -8.98));
  for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) niches.push(new THREE.PlaneGeometry(0.9, 0.6).rotateY(-sx * Math.PI / 2).translate(sx * 4.98, 1.8, -1.2 - k * 1.6));
  const nicheM = new THREE.Mesh(mergeGeometries(niches), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.72, 0.5) }));
  // the front: a big window onto the rainy street (a painted glow of the screens, blurred), the door frame
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
  {
    const ctx = cv.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#1a0c2a'); g.addColorStop(0.6, '#3a1a3a'); g.addColorStop(1, '#120a12');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 256);
    const Rw = rng(5);
    for (let i = 0; i < 70; i++) {
      const cols = ['#ff2a6d', '#00e5ff', '#ffd60a', '#ffffff', '#39ff14', '#ff7b00', '#b26bff'];
      ctx.globalAlpha = 0.25 + Rw() * 0.5; ctx.fillStyle = cols[Math.floor(Rw() * cols.length)];
      const x = Rw() * 512, y = Rw() * 200, r = 6 + Rw() * 30;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  const winTex = new THREE.CanvasTexture(cv); winTex.colorSpace = THREE.SRGBColorSpace;
  const winMat = new THREE.MeshBasicMaterial({ map: winTex, color: new THREE.Color(0.8, 0.8, 0.8) });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.4).rotateY(Math.PI).translate(0, 1.7, 2.0), winMat);
  const mull = new THREE.Mesh(mergeGeometries([-2.5, 0, 2.5].map((x) => new THREE.BoxGeometry(0.12, 3.4, 0.12).translate(x, 1.7, 1.95)).concat([new THREE.BoxGeometry(10, 0.15, 0.15).translate(0, 2.6, 1.95)])), std(0x111111, 0.4, 0.6));
  G.add(floor, ceil, walls, nicheM, win, mull);
  // the cases: a dark wood base, a brass trim, black velvet, a glass top with bright edges
  const baseG = [], velG = [], glassG = [], trimG = [];
  for (const c of CASES) {
    const along = c.len, across = 0.75;
    const [w, d] = c.ax === 'z' ? [across, along] : [along, across];
    baseG.push(new THREE.BoxGeometry(w, 0.92, d).translate(c.x, 0.46, c.z));
    velG.push(new THREE.BoxGeometry(w - 0.06, 0.02, d - 0.06).translate(c.x, 0.93, c.z));
    glassG.push(new THREE.BoxGeometry(w, 0.32, d).translate(c.x, 1.1, c.z));
    trimG.push(new THREE.BoxGeometry(w + 0.04, 0.03, d + 0.04).translate(c.x, 0.93, c.z), new THREE.BoxGeometry(w + 0.02, 0.02, d + 0.02).translate(c.x, 1.27, c.z));
  }
  G.add(new THREE.Mesh(mergeGeometries(baseG), std(0x2a1a12, 0.45)));
  G.add(new THREE.Mesh(mergeGeometries(velG), std(0x0a0608, 0.95)));
  // a warm light strip along the inside top edge of each case, lighting the pieces
  const lightG = CASES.map((c) => { const [w, d] = c.ax === 'z' ? [0.7, c.len - 0.1] : [c.len - 0.1, 0.7]; return new THREE.BoxGeometry(w, 0.012, d).translate(c.x, 1.255, c.z); });
  G.add(new THREE.Mesh(mergeGeometries(lightG), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.4, 1.1) })));
  G.add(new THREE.Mesh(mergeGeometries(trimG), std(0xc9a35a, 0.25, 0.9)));
  const glass = new THREE.Mesh(mergeGeometries(glassG), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.12, specularIntensity: 1, depthWrite: false }));
  glass.renderOrder = 3;
  G.add(glass);
  // the pieces: rings (gold torus + a stone), pendants (a chain of glints), loose diamonds (octahedra)
  const ringG = mergeGeometries([new THREE.TorusGeometry(0.035, 0.008, 6, 16).rotateX(-0.3).translate(0, 0.04, 0).toNonIndexed(), new THREE.OctahedronGeometry(0.014).translate(0, 0.08, 0).toNonIndexed()]);
  const gemG = new THREE.OctahedronGeometry(0.02).scale(1, 0.7, 1).translate(0, 0.02, 0);
  const pendG = new THREE.TorusGeometry(0.07, 0.004, 4, 24).rotateX(-Math.PI / 2).translate(0, 0.01, 0);
  const N = ITEMS.length;
  const mk = (g, m) => { const x = new THREE.InstancedMesh(g, m, N); x.frustumCulled = false; G.add(x); return x; };
  const rings = mk(ringG, std(0xe8c25a, 0.15, 1.0, { emissive: new THREE.Color(0.25, 0.18, 0.05) }));
  const gems = mk(gemG, std(0xeaf6ff, 0.0, 0.2, { emissive: new THREE.Color(0.6, 0.7, 0.8) }));
  const pends = mk(pendG, std(0xf0f0f0, 0.1, 1.0, { emissive: new THREE.Color(0.3, 0.3, 0.3) }));
  // lights: warm spots over the cases, a soft fill
  const hemi = new THREE.HemisphereLight(0xfff4e6, 0x5a4a3a, 1.0);
  G.add(hemi);
  const spots = [];
  for (const [x, z] of [[-3.6, -2], [-3.6, -5.5], [0, -7.6], [3.6, -2], [3.6, -5.5], [0, -3.5]]) {
    const l = new THREE.PointLight(0xffe2b8, 7, 8, 1.6); l.position.set(x, 3.2, z); G.add(l); spots.push(l);
  }
  const red = new THREE.PointLight(0xff1010, 0, 14, 1.2); red.position.set(0, 3.0, -3.5); G.add(red);
  const pol = new THREE.PointLight(0xff2020, 0, 16, 1.0); pol.position.set(0, 2.0, 3.5); G.add(pol);
  const uv = new THREE.PointLight(0x8a3aff, 0, 3, 1.5); G.add(uv);
  // people
  const pmat = std(0xffffff, 0.6);
  const crowd = makeCrowd(G, PEOPLE.length, pmat, { castShadow: false });
  PEOPLE.forEach((p, i) => crowd.color(i, p.shirt, p.pants, p.skin, p.hair));

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  const W_ALARM = { at: null };

  function frame(v, s, glows) {
    const W = s.W;
    // the alarm: from the resume after the sweep; forensics later (by video time: the shot changes)
    const tA = v - 9.6;
    const alarm = v >= 9.6;
    const forensic = s.shot.k === 'forensic';
    const wa = alarm ? W - s.Wresume : 0;      // world time since the alarm
    // pieces
    ITEMS.forEach((it, i) => {
      const gone = v >= it.take;
      const k = it.kind;
      const rot = it.seed * 6.28;
      if (gone) { rings.setMatrixAt(i, hide); gems.setMatrixAt(i, hide); pends.setMatrixAt(i, hide); return; }
      m4.compose(v3.set(it.x, it.y, it.z), q.setFromEuler(e.set(0, rot, 0)), s3.setScalar(2.0));
      rings.setMatrixAt(i, k === 0 ? m4 : hide);
      gems.setMatrixAt(i, k === 2 ? m4 : hide);
      pends.setMatrixAt(i, k === 1 ? m4 : hide);
      // the glint: each stone flashes as the camera moves (view-dependent, so it twinkles even with time stopped)
      const tw = Math.pow(Math.max(0, Math.sin(v * (2.0 + it.seed * 3) + it.seed * 40)), 18);
      if (k !== 1) glows.add(it.x, it.y + 0.06, it.z, 0.025 + 0.05 * tw, 0.6 + 4 * tw, 0.65 + 4 * tw, 0.8 + 4 * tw);
      else glows.add(it.x, it.y + 0.02, it.z, 0.03 + 0.03 * tw, 0.5 + 2 * tw, 0.5 + 2 * tw, 0.55 + 2 * tw);
    });
    rings.instanceMatrix.needsUpdate = gems.instanceMatrix.needsUpdate = pends.instanceMatrix.needsUpdate = true;
    // the stones flying into your bag as you sweep (a short trail of sparkles from each piece to your hand)
    // (drawn by main.js through glows: it knows where your hand is) -> exported list
    // people
    PEOPLE.forEach((p, i) => {
      let yaw = p.yaw, armL = 0, armR = 0, look = 0.05, pitch = 0, vis = true, x = p.x, z = p.z;
      if (p.kind === 'tech' || p.kind === 'cop') vis = forensic;
      if ((p.kind === 'cust' || p.kind === 'clerk') && forensic) vis = p.kind === 'clerk';
      if (p.kind === 'cust' && !forensic) {
        // frozen leaning in at the case; when the alarm goes: they jump back, hands up
        pitch = 0.18 * (1 - smooth(0, 0.3, wa));
        armR = alarm ? lerp(0.6, 1.55, smooth(0.05, 0.35, wa)) : 0.6;
        armL = alarm ? lerp(0.0, 1.4, smooth(0.1, 0.4, wa)) : 0;
        x = p.x + 0.35 * smooth(0, 0.4, wa);
        yaw = p.yaw + 0.6 * smooth(0.2, 0.8, wa);
      }
      if (p.kind === 'clerk') {
        armR = forensic ? 0.0 : alarm ? lerp(0.35, 1.0, smooth(0, 0.3, wa)) : 0.35;
        yaw = p.yaw + (alarm && !forensic ? -0.5 * smooth(0.1, 0.6, wa) : 0);
        if (forensic) { x = 4.4; z = -6.5; yaw = 2.2; armL = 0.4; }
      }
      if (p.kind === 'guard') { armR = alarm ? 1.0 * smooth(0.2, 0.5, wa) : 0; yaw = p.yaw + (alarm ? -0.9 * smooth(0, 0.5, wa) : 0); }
      if (p.kind === 'tech') { pitch = 0.12; armR = 0.95; armL = 0.6; look = -0.3; }
      if (p.kind === 'cop') { armL = i === 5 ? 1.1 : 0.2; }
      crowd.pose(i, { x, y: 0, z, yaw, armL, armR, look, pitch, visible: vis });
    });
    crowd.commit();
    // the alarm's red strobe; the police lights through the window; the UV lamp at the case
    const strobe = alarm && !forensic ? (Math.sin(W * 14) > 0.3 ? 1 : 0.15) : 0;
    red.intensity = 40 * strobe;
    const pflash = Math.floor(W * 5) % 2;
    pol.intensity = forensic ? 30 : alarm ? 22 * smooth(10.6, 11.4, v) : 0;
    pol.color.setRGB(pflash ? 1 : 0.1, 0.1, pflash ? 0.1 : 1);
    winMat.color.setRGB(0.8 + (forensic || v > 10.6 ? (pflash ? 1.0 : 0) : 0), 0.8, 0.8 + (forensic || v > 10.6 ? (pflash ? 0 : 1.2) : 0));
    uv.intensity = forensic ? 3.5 : 0;
    uv.position.set(-3.3, 1.35, -4.5);
    if (forensic) glows.add(-3.25, 1.38, -4.45, 0.09, 1.6, 0.6, 3.2);
    if (alarm && !forensic) for (const [x, z] of [[-4.9, -8.9], [4.9, -8.9]]) glows.add(x, 3.0, z, 0.25 * (0.3 + strobe), 6 * strobe + 0.3, 0.1, 0.05);
  }
  return { G, frame, ITEMS };
}

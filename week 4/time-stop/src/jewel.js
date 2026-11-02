// The jewelry store just off the square: a bright, warm room (x -5..5, z -9..2, ceiling 3.4 m), glass display cases
// round three sides with rings, necklaces and loose diamonds on black velvet, the square's lights through the front
// window (rain running down it while time runs, its drops hanging still when it stops), a door at x 0.15..2.35.
// You sweep the cases left -> back -> right (JEWEL_A..JEWEL_B); each piece goes as you pass.
// Nine people, all on the world clock: frozen mid-moment while you work (a couple trying on a ring, a clerk holding
// a necklace up to the light, a guard by the door, a shopper just coming in); when time runs they carry on and react
// (hands to mouths, pointing at the empty cases, looking round), two cops and a forensics tech in white walk in
// through the door; the tech sweeps the right case with a UV lamp: glowing "?" where prints and DNA should be, and
// "?" over the heads of the police. When time stops again they freeze mid-motion.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, clamp, smooth, lerp } from './util.js';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { JEWEL_A, JEWEL_B } from './timeline.js';

const R = rng(77);
export const CASES = [
  { x: -3.6, z: -4.2, len: 6.4, ax: 'z' },
  { x: 0.0, z: -7.6, len: 5.0, ax: 'x' },
  { x: 3.6, z: -4.2, len: 6.4, ax: 'z' },
];
export const DOOR = { x: 1.25, z: 2.0 };
// your path past them (x, z), in order, with the time you're at each point (behind the couple at the left case)
export const PATH = [
  [-1.0, -0.3, JEWEL_A - 0.3], [-1.6, -1.6, JEWEL_A], [-2.4, -3.2, JEWEL_A + 0.35], [-2.4, -6.6, JEWEL_A + 1.0], [-1.6, -6.4, JEWEL_A + 1.25],
  [1.6, -6.4, JEWEL_A + 1.95], [2.4, -6.6, JEWEL_A + 2.15], [2.4, -2.4, JEWEL_B - 0.2], [1.2, -0.4, JEWEL_B + 0.4],
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
for (const it of ITEMS) {
  let best = 1e9, bt = JEWEL_A;
  for (let v = JEWEL_A; v <= JEWEL_B; v += 0.01) { const p = youAt(v); const d = Math.hypot(p.x - it.x, p.z - it.z); if (d < best) { best = d; bt = v; } }
  it.take = bt + (it.seed - 0.5) * 0.12;
}

// ---- the people: each a pose as a function of the world clock (wa: world seconds since the alarm; 0 before it) ----
// (yaw: 0 faces -z, +PI/2 faces -x, -PI/2 faces +x)
const walkTo = (pts, t0, sp, wa) => {
  // along a polyline from world time t0 at sp m/s: position, heading, distance walked, still walking?
  let d = Math.max(0, (wa - t0) * sp);
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const L = Math.hypot(x1 - x0, z1 - z0);
    if (d <= L || i === pts.length - 2) {
      const k = Math.min(1, d / L);
      return { x: lerp(x0, x1, k), z: lerp(z0, z1, k), yaw: Math.atan2(-(x1 - x0), -(z1 - z0)), d: Math.max(0, (wa - t0) * sp), moving: wa > t0 && d < L };
    }
    d -= L;
  }
};
const sway = (wa, f, ph) => Math.sin(wa * f + ph);
export const PEOPLE = [
  // the couple at the left case: she's trying on a ring; he leans in
  { name: 'her', shirt: 0xb83a4a, pants: 0x222222, skin: SKIN[5], hair: HAIR[4], s: 0.95, pose: (wa) => {
    const r = smooth(0.05, 0.45, wa);
    return { x: -2.55 + 0.75 * smooth(0.1, 1.0, wa), z: -1.45 + 0.4 * smooth(0.1, 1.0, wa), yaw: Math.PI / 2 - 1.3 * r + 0.3 * sway(wa, 1.1, 0) * r,
      armR: lerp(0.9, 1.28, r), armL: lerp(0.2, 1.28, smooth(0.15, 0.5, wa)), look: 0.05, walk: wa * 5, stride: 0.5 * smooth(0.1, 0.3, wa) * (1 - smooth(0.8, 1.1, wa)) };
  } },
  { name: 'him', shirt: 0x2a3a5a, pants: 0x3a3a3a, skin: SKIN[2], hair: HAIR[1], pose: (wa) => {
    const r = smooth(0.2, 0.6, wa);
    return { x: -2.5 + 0.25 * r, z: -2.25, yaw: Math.PI / 2 - 0.2 + 0.5 * sway(wa, 0.9, 1.0) * smooth(1.5, 2.5, wa),
      pitch: 0.15 * (1 - r), armR: lerp(0.3, 1.05, r), armL: 0.1 + 0.3 * r * (0.5 + 0.5 * sway(wa, 2.0, 0)), look: 0.0 };
  } },
  // the clerk behind the left case, holding a ring out to her: after, hands to her head
  { name: 'clerkL', shirt: 0x1a1a1a, pants: 0x1a1a1a, skin: SKIN[1], hair: HAIR[0], s: 0.97, pose: (wa) => {
    const r = smooth(0.3, 0.9, wa);
    return { x: -4.35, z: -1.75 - 0.6 * smooth(1, 3, wa), yaw: -Math.PI / 2 + 0.25 * sway(wa, 0.8, 2) * r, armR: lerp(1.0, 1.62, r), armL: lerp(0.1, 1.62, smooth(0.4, 1.0, wa)),
      look: -0.15 * (1 - r) + 0.1 * r, walk: wa * 4, stride: 0.3 * smooth(1, 1.3, wa) * (1 - smooth(2.7, 3, wa)) };
  } },
  // the clerk behind the right case holding a necklace up to the light: after, on the phone, pacing
  { name: 'clerkR', shirt: 0x2a2228, pants: 0x1a1a1a, skin: SKIN[0], hair: HAIR[5], s: 0.96, pose: (wa) => {
    const r = smooth(0.2, 0.7, wa);
    return { x: 4.4, z: -1.9 - 1.2 * (0.5 - 0.5 * Math.cos(Math.max(0, wa - 1) * 0.9)), yaw: Math.PI / 2 + (wa > 1 ? 0.6 * Math.sin((wa - 1) * 0.9) : 0),
      armR: lerp(1.45, 0.15, r), armL: lerp(0.1, 1.5, smooth(0.5, 1.0, wa)), look: lerp(0.35, 0.05, r), walk: wa * 4, stride: 0.6 * smooth(1, 1.3, wa) };
  } },
  // the customer she was showing it to: backs off into the middle, looking round
  { name: 'custR', shirt: 0x3f9a6a, pants: 0x2a2a2a, skin: SKIN[3], hair: HAIR[2], pose: (wa) => {
    const p = walkTo([[2.85, -1.25], [2.0, -2.4], [0.7, -4.6]], 0.25, 1.1, wa);
    const r = smooth(0.05, 0.4, wa);
    return { x: p.x, z: p.z, yaw: p.moving ? p.yaw + Math.PI : -Math.PI / 2 - 0.3 + 0.7 * sway(wa, 1.2, 3) * r, armR: lerp(0.4, 1.6, r), armL: lerp(0.1, 1.6, r), look: lerp(0.3, 0.1, r),
      walk: p.d * 2.6, stride: p.moving ? 0.6 : 0 };
  } },
  // the staff member arranging the back case: stands up, turns round
  { name: 'staff', shirt: 0x1a1a1a, pants: 0x1a1a1a, skin: SKIN[4], hair: HAIR[0], pose: (wa) => {
    const r = smooth(0.3, 0.9, wa);
    return { x: 0.6, z: -8.45, yaw: Math.PI + 0.6 * sway(wa, 0.7, 1) * r, pitch: 0.3 * (1 - r), armR: lerp(0.8, 0.1, r), armL: lerp(0.6, 1.0, r), look: 0 };
  } },
  // the guard by the door: turns, then walks into the middle with his hand on his radio
  { name: 'guard', shirt: 0x202a3a, pants: 0x1a1d24, skin: SKIN[4], hair: HAIR[7], s: 1.03, pose: (wa) => {
    const p = walkTo([[3.9, 0.9], [3.0, -0.4], [1.9, -1.2]], 0.5, 1.3, wa);
    return { x: p.x, z: p.z, yaw: wa < 0.5 ? 0.35 - 0.5 * smooth(0, 0.5, wa) : p.yaw + (p.moving ? 0 : 0.5 * sway(wa, 0.8, 0)), armL: 1.05 * smooth(0.3, 0.7, wa), armR: 0.1, walk: p.d * 2.6, stride: p.moving ? 1 : 0 };
  } },
  // a shopper just coming in, mid-stride: stops, stares
  { name: 'shopper', shirt: 0xe0b040, pants: 0x1f2a44, skin: SKIN[6], hair: HAIR[3], pose: (wa) => {
    const p = walkTo([[-0.35, 0.3], [-0.45, -0.6]], 0.0, 1.1, wa);
    return { x: p.x, z: p.z, yaw: p.moving ? p.yaw : -0.6 * smooth(0.9, 1.5, wa) + 0.3 * sway(wa, 1.0, 2) * smooth(1.5, 2.5, wa), walk: 1.1 + p.d * 2.6, stride: p.moving || wa === 0 ? 1 : 0,
      armR: 1.2 * smooth(1.0, 1.4, wa), armL: 0, look: 0.05 };
  } },
  // looking out of the window at the rain: turns round
  { name: 'window', shirt: 0x4fb3d9, pants: 0x3a4a6a, skin: SKIN[1], hair: HAIR[6], pose: (wa) => {
    const r = smooth(0.2, 0.9, wa);
    return { x: -3.9, z: 1.25, yaw: Math.PI * (1 - r) + 0.3 * sway(wa, 0.9, 4) * r, armR: 0.2 + 0.9 * r, armL: 0.1, look: 0.1 };
  } },
  // more shoppers and staff in the middle of the store, close to the door (frozen right beside you as you come in);
  // when time runs they jump, hands up, and look round where they stand
  { name: 'coat', shirt: 0xe8e2d6, pants: 0x2a2a2a, skin: SKIN[0], hair: HAIR[7], s: 0.97, pose: (wa) => {
    const r = smooth(0.1, 0.5, wa);
    return { x: 0.2, z: -1.35, yaw: Math.PI / 2 - 0.9 * r + 0.3 * sway(wa, 1.0, 1) * smooth(1, 2, wa), walk: 0.9, stride: 1 - r, armR: lerp(0.15, 1.5, r), armL: lerp(-0.1, 1.5, smooth(0.15, 0.55, wa)), look: 0.05 };
  } },
  { name: 'tray', shirt: 0x1a1a1a, pants: 0x1a1a1a, skin: SKIN[2], hair: HAIR[1], pose: (wa) => {
    const r = smooth(0.2, 0.6, wa);
    return { x: -0.95, z: -2.75, yaw: -2.5 + 0.5 * sway(wa, 0.8, 2) * r, armR: lerp(0.95, 0.4, r), armL: lerp(0.95, 1.6, r), look: lerp(-0.2, 0.15, r) };
  } },
  { name: 'phone', shirt: 0x8a2a2a, pants: 0x30343c, skin: SKIN[4], hair: HAIR[0], s: 1.02, pose: (wa) => {
    // (then backs off toward the back of the store, out of the forensics shot)
    const r = smooth(0.15, 0.5, wa);
    const p = walkTo([[0.85, -3.0], [-0.3, -4.4]], 0.8, 0.9, wa);
    return { x: p.x, z: p.z, yaw: p.moving ? p.yaw + Math.PI : -2.8 + 1.2 * r, armR: lerp(1.0, 1.15, r), armL: lerp(0.05, 0.5, r), look: lerp(-0.3, 0.1, r), walk: p.d * 2.6, stride: p.moving ? 0.6 : 0 };
  } },
  { name: 'kid', shirt: 0x3a7ad9, pants: 0x2a2a44, skin: SKIN[1], hair: HAIR[3], s: 0.6, pose: (wa) => {
    const r = smooth(0.1, 0.5, wa);
    return { x: -0.65, z: -1.75, yaw: Math.PI / 2 - 1.6 * r, armR: lerp(1.0, 1.55, r), armL: lerp(0.1, 1.55, r), look: lerp(0.1, 0.3, r) };
  } },
  { name: 'lean', shirt: 0xd98ab0, pants: 0x222222, skin: SKIN[6], hair: HAIR[4], s: 0.96, pose: (wa) => {
    const r = smooth(0.25, 0.7, wa);
    return { x: -1.2, z: -5.0, yaw: -2.3 + 0.9 * r, armR: lerp(1.0, 1.5, r), armL: lerp(0.85, 1.5, r), look: lerp(-0.35, 0.1, r) };
  } },
  // the police and forensics, in through the door
  { name: 'cop1', cop: true, shirt: 0x1a2440, pants: 0x161c2e, skin: SKIN[3], hair: 0x0a0a0a, s: 1.02, pose: (wa) => {
    const p = walkTo([[DOOR.x, 3.2], [DOOR.x + 0.3, 0.6], [2.0, -2.0], [2.55, -3.6]], 0.9, 1.5, wa);
    return { x: p.x, z: p.z, yaw: p.moving ? p.yaw : -Math.PI / 2 - 0.4 + 0.3 * sway(wa, 0.7, 1), armL: p.moving ? 0.1 : 0.9, armR: p.moving ? 0.1 : 0.4, walk: p.d * 2.6, stride: p.moving ? 1 : 0, look: 0.05 };
  } },
  { name: 'cop2', cop: true, shirt: 0x1a2440, pants: 0x161c2e, skin: SKIN[0], hair: 0x0a0a0a, pose: (wa) => {
    const p = walkTo([[DOOR.x + 0.4, 3.4], [DOOR.x - 0.1, 0.9], [0.3, -0.4]], 1.15, 1.4, wa);
    return { x: p.x, z: p.z, yaw: p.moving ? p.yaw : 0.4 + 0.8 * sway(wa, 0.5, 2), armL: p.moving ? 0.1 : 1.1, armR: 0.15, walk: p.d * 2.6, stride: p.moving ? 1 : 0, look: 0.15 };
  } },
  { name: 'tech', tech: true, shirt: 0xf2f2f2, pants: 0xf2f2f2, skin: SKIN[0], hair: 0xe8e8e8, pose: (wa) => {
    const p = walkTo([[DOOR.x - 0.3, 3.4], [DOOR.x + 0.2, 0.8], [2.35, -0.9], [2.62, -1.7]], 0.95, 1.9, wa);
    const at = !p.moving && wa > 2;
    return { x: p.x, z: at ? -1.7 - 0.45 * Math.sin((wa - 3.4) * 0.8) : p.z, yaw: at ? -Math.PI / 2 : p.yaw, pitch: at ? 0.12 : 0,
      armR: at ? 0.95 + 0.12 * Math.sin(wa * 3.1) : 0.15, armL: at ? 0.6 : 0.4, walk: p.d * 2.6, stride: p.moving ? 1 : 0, look: at ? -0.35 : 0 };
  } },
];
const ALARM_V = 9.6;
// the tech's UV lamp: on once he's at the case; where it shines (z) at world time wa since the alarm
const TECH = PEOPLE.find((p) => p.tech);
let LAMP_ON = 99;
for (let w = 0; w < 10; w += 0.01) if (TECH.pose(w).armR > 0.8) { LAMP_ON = w; break; }
const lampZ = (wa) => TECH.pose(wa).z;
// when the lamp first passes each mark (pure function of time: frames are drawn out of order)
const UVMARKS = Array.from({ length: 7 }, (_, k) => {
  const z = -1.25 - k * 0.15, x = 3.38 + (k % 2) * 0.28 + 0.06 * Math.sin(k * 7);
  let seen = 99;
  for (let w = LAMP_ON; w < 10; w += 0.01) if (Math.abs(lampZ(w) - z) < 0.12) { seen = w; break; }
  return { x, z, seen };
});

function qTexture(color, glow) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  c.font = 'bold 104px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.shadowColor = glow; c.shadowBlur = 18;
  c.fillStyle = color; c.fillText('?', 64, 70); c.fillText('?', 64, 70);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function makeJewel(scene) {
  const G = new THREE.Group();
  scene.add(G);
  const std = (c, r = 0.5, m = 0, x = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, ...x });
  // the room: warm cream walls, a light ceiling, a polished stone floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 11).rotateX(-Math.PI / 2).translate(0, 0, -3.5), std(0x5e544a, 0.4, 0.05));
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(10, 11).rotateX(Math.PI / 2).translate(0, 3.4, -3.5), std(0xb0a590, 0.9));
  const walls = new THREE.Mesh(mergeGeometries([
    new THREE.PlaneGeometry(11, 3.4).rotateY(Math.PI / 2).translate(-5, 1.7, -3.5),
    new THREE.PlaneGeometry(11, 3.4).rotateY(-Math.PI / 2).translate(5, 1.7, -3.5),
    new THREE.PlaneGeometry(10, 3.4).translate(0, 1.7, -9),
  ]), std(0x8a6e52, 0.75));
  // wall panels with warm lit niches
  const niches = [];
  for (let k = -3; k <= 3; k++) niches.push(new THREE.PlaneGeometry(0.9, 0.6).translate(k * 1.25, 1.75, -8.98));
  for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) niches.push(new THREE.PlaneGeometry(0.9, 0.6).rotateY(-sx * Math.PI / 2).translate(sx * 4.98, 1.8, -1.2 - k * 1.6));
  const nicheM = new THREE.Mesh(mergeGeometries(niches), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.9, 0.62) }));
  // the front: windows onto the rainy square either side of the door (a painted glow of the screens, rain on the glass),
  // and the square itself seen through the open door
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
  const WU = { map: { value: winTex }, uTint: { value: new THREE.Color(0.8, 0.8, 0.8) }, uW: { value: 0 }, uGlass: { value: 1 } };
  const winMat = new THREE.ShaderMaterial({
    uniforms: WU,
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map; uniform vec3 uTint; uniform float uW; uniform float uGlass; varying vec2 vUv; varying vec3 vP;
      float h11(float x) { return fract(sin(x * 91.17) * 43758.5453); }
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec3 c = pow(texture2D(map, vUv).rgb, vec3(2.2)) * uTint;
        if (uGlass > 0.5) {
          // drops stuck on the glass (they don't move), and runnels sliding down on the world clock (frozen when it stops)
          vec2 g = vP.xy / 0.045; vec2 id = floor(g), f = fract(g) - 0.5;
          float h = h21(id);
          float bead = step(0.9, h) * smoothstep(0.3, 0.1, length(f - (vec2(h21(id + 1.3), h21(id + 2.1)) - 0.5) * 0.4));
          float col = floor(vP.x / 0.06), fx = fract(vP.x / 0.06) - 0.5;
          float s = h11(col);
          float head = 3.4 - fract(s * 7.0 + uW * (0.22 + 0.35 * s)) * 4.0;
          float dy = vP.y - head;
          float run = step(0.55, s) * exp(-fx * fx / 0.02) * (dy > 0.0 ? exp(-dy / 0.35) : exp(-dy * dy / 0.0004));
          c += vec3(0.7, 0.75, 0.9) * (bead * 0.6 + run * 0.35);
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const winGeo = mergeGeometries([
    new THREE.PlaneGeometry(5.15, 3.4).rotateY(Math.PI).translate(-2.425, 1.7, 2.0),
    new THREE.PlaneGeometry(2.65, 3.4).rotateY(Math.PI).translate(3.675, 1.7, 2.0),
    new THREE.PlaneGeometry(2.2, 0.8).rotateY(Math.PI).translate(1.25, 3.0, 2.0),
  ]);
  const win = new THREE.Mesh(winGeo, winMat);
  const outMat = winMat.clone(); outMat.uniforms = { ...WU, uGlass: { value: 0 } };
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(12, 5).rotateY(Math.PI).translate(1.25, 2.2, 6.0), outMat);
  const mull = new THREE.Mesh(mergeGeometries([-2.5, 0.15, 2.35].map((x) => new THREE.BoxGeometry(0.12, 3.4, 0.12).translate(x, 1.7, 1.95)).concat([new THREE.BoxGeometry(10, 0.15, 0.15).translate(0, 2.6, 1.95)])), std(0x111111, 0.4, 0.6));
  const step = new THREE.Mesh(new THREE.PlaneGeometry(12, 5).rotateX(-Math.PI / 2).translate(1.25, 0, 4.5), std(0x2a2630, 0.15, 0.2));
  G.add(floor, ceil, walls, nicheM, win, outside, mull, step);
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
  G.add(new THREE.Mesh(mergeGeometries(baseG), std(0x3a2418, 0.45)));
  G.add(new THREE.Mesh(mergeGeometries(velG), std(0x0a0608, 0.95)));
  const lightG = CASES.map((c) => { const [w, d] = c.ax === 'z' ? [0.7, c.len - 0.1] : [c.len - 0.1, 0.7]; return new THREE.BoxGeometry(w, 0.012, d).translate(c.x, 1.255, c.z); });
  G.add(new THREE.Mesh(mergeGeometries(lightG), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.4, 1.1) })));
  G.add(new THREE.Mesh(mergeGeometries(trimG), std(0xc9a35a, 0.25, 0.9)));
  const glass = new THREE.Mesh(mergeGeometries(glassG), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.12, specularIntensity: 1, depthWrite: false }));
  glass.renderOrder = 3;
  G.add(glass);
  // the pieces: rings (gold torus + a stone), pendants, loose diamonds (octahedra)
  const ringG = mergeGeometries([new THREE.TorusGeometry(0.035, 0.008, 6, 16).rotateX(-0.3).translate(0, 0.04, 0).toNonIndexed(), new THREE.OctahedronGeometry(0.014).translate(0, 0.08, 0).toNonIndexed()]);
  const gemG = new THREE.OctahedronGeometry(0.02).scale(1, 0.7, 1).translate(0, 0.02, 0);
  const pendG = new THREE.TorusGeometry(0.07, 0.004, 4, 24).rotateX(-Math.PI / 2).translate(0, 0.01, 0);
  const N = ITEMS.length;
  const mk = (g, m) => { const x = new THREE.InstancedMesh(g, m, N); x.frustumCulled = false; G.add(x); return x; };
  const rings = mk(ringG, std(0xe8c25a, 0.15, 1.0, { emissive: new THREE.Color(0.25, 0.18, 0.05) }));
  const gems = mk(gemG, std(0xeaf6ff, 0.0, 0.2, { emissive: new THREE.Color(0.6, 0.7, 0.8) }));
  const pends = mk(pendG, std(0xf0f0f0, 0.1, 1.0, { emissive: new THREE.Color(0.3, 0.3, 0.3) }));
  // lights: warm spots over the cases and the middle, a bright fill
  G.add(new THREE.HemisphereLight(0xfff4e6, 0x6a5440, 0.85));
  for (const [x, z] of [[-3.6, -2], [-3.6, -5.5], [0, -7.6], [3.6, -2], [3.6, -5.5], [0, -3.5], [0, -0.5]]) {
    const l = new THREE.PointLight(0xffe2b8, 6, 9, 1.6); l.position.set(x, 3.2, z); G.add(l);
  }
  const red = new THREE.PointLight(0xff1010, 0, 14, 1.2); red.position.set(0, 3.0, -3.5); G.add(red);
  const pol = new THREE.PointLight(0xff2020, 0, 16, 1.0); pol.position.set(1.25, 2.0, 3.5); G.add(pol);
  const uv = new THREE.PointLight(0x8a3aff, 0, 3, 1.5); G.add(uv);
  // people (with a small lit clipboard / phone where needed)
  const pmat = std(0xffffff, 0.6);
  const crowd = makeCrowd(G, PEOPLE.length, pmat, { castShadow: false });
  PEOPLE.forEach((p, i) => crowd.color(i, p.shirt, p.pants, p.skin, p.hair));
  // the "?" marks: glowing UV ones on the case where prints should be; over the heads of the police and the tech
  const uvQ = new THREE.SpriteMaterial({ map: qTexture('#e9c8ff', '#9a3aff'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(1.6, 1.3, 2.2) });
  const headQ = new THREE.SpriteMaterial({ map: qTexture('#fff2c0', '#ffb000'), transparent: true, depthWrite: false });
  const UVQ = UVMARKS.map((m) => ({ ...m, sp: new THREE.Sprite(uvQ.clone()) }));
  UVQ.forEach((q) => { q.sp.scale.setScalar(0.17); G.add(q.sp); });
  const HQ = PEOPLE.filter((p) => p.cop || p.tech).map((p) => { const sp = new THREE.Sprite(headQ.clone()); sp.scale.setScalar(0.32); sp.renderOrder = 8; G.add(sp); return { p, sp }; });

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  function frame(v, s, glows) {
    const W = s.W;
    const alarm = v >= ALARM_V;
    const forensic = s.shot.k === 'forensic';
    const wa = alarm ? W - s.Wresume : 0;       // world time since the alarm (stays put when time stops at 15.4)
    WU.uW.value = W;
    // pieces
    ITEMS.forEach((it, i) => {
      const k = it.kind;
      if (v >= it.take) { rings.setMatrixAt(i, hide); gems.setMatrixAt(i, hide); pends.setMatrixAt(i, hide); return; }
      m4.compose(v3.set(it.x, it.y, it.z), q.setFromEuler(e.set(0, it.seed * 6.28, 0)), s3.setScalar(2.0));
      rings.setMatrixAt(i, k === 0 ? m4 : hide);
      gems.setMatrixAt(i, k === 2 ? m4 : hide);
      pends.setMatrixAt(i, k === 1 ? m4 : hide);
      const tw = Math.pow(Math.max(0, Math.sin(v * (2.0 + it.seed * 3) + it.seed * 40)), 18);
      if (k !== 1) glows.add(it.x, it.y + 0.06, it.z, 0.03 + 0.06 * tw, 0.8 + 5 * tw, 0.85 + 5 * tw, 1.0 + 5 * tw);
      else glows.add(it.x, it.y + 0.02, it.z, 0.035 + 0.03 * tw, 0.6 + 2.5 * tw, 0.6 + 2.5 * tw, 0.65 + 2.5 * tw);
    });
    rings.instanceMatrix.needsUpdate = gems.instanceMatrix.needsUpdate = pends.instanceMatrix.needsUpdate = true;
    // people
    PEOPLE.forEach((p, i) => {
      const P = p.pose(wa);
      const vis = !(p.cop || p.tech) || (alarm && P.z < 3.0);
      crowd.pose(i, { x: P.x, y: 0, z: P.z, yaw: P.yaw, walk: P.walk || 0, stride: P.stride || 0, armL: P.armL || 0, armR: P.armR || 0, look: P.look || 0, pitch: P.pitch || 0, s: p.s || 1, visible: vis });
      p.cur = P;
    });
    crowd.commit();
    // the alarm's red strobe; the police lights through the window and the door; the UV lamp at the case
    const strobe = alarm ? (Math.sin(W * 14) > 0.3 ? 1 : 0.15) : 0;
    red.intensity = forensic ? 5 * strobe : 25 * strobe;
    const pflash = Math.floor(W * 5) % 2;
    const pk = alarm ? smooth(0.6, 1.3, wa) : 0;
    pol.intensity = (forensic ? 12 : 20) * pk;
    pol.color.setRGB(pflash ? 1 : 0.1, 0.1, pflash ? 0.1 : 1);
    WU.uTint.value.setRGB(0.8 + pk * (pflash ? 1.0 : 0), 0.8, 0.8 + pk * (pflash ? 0 : 1.2));
    const tech = PEOPLE.find((p) => p.tech).cur;
    const lampOn = alarm && tech.armR > 0.8;
    const lx = tech.x + 0.7, lz = tech.z;
    uv.intensity = lampOn ? 3.5 : 0;
    uv.position.set(lx, 1.4, lz);
    if (lampOn) glows.add(lx, 1.38, lz, 0.09, 1.6, 0.6, 3.2);
    if (alarm && !forensic) for (const [x, z] of [[-4.9, -8.9], [4.9, -8.9]]) glows.add(x, 3.0, z, 0.25 * (0.3 + strobe), 6 * strobe + 0.3, 0.1, 0.05);
    // "?" where the lamp has passed: nothing there (no prints, no DNA)
    UVQ.forEach((qq, k) => {
      const a = (alarm ? smooth(qq.seen, qq.seen + 0.25, wa) : 0) * (0.7 + 0.3 * Math.sin(W * 3 + k));
      qq.sp.visible = a > 0.01;
      qq.sp.material.opacity = a;
      qq.sp.position.set(qq.x, 1.3 + 0.03 * Math.sin(W * 2 + k), qq.z);
    });
    // "?" over the heads of the police and the tech once they're in and looking (bobbing on the world clock)
    HQ.forEach(({ p, sp }, k) => {
      const P = p.cur;
      const a = alarm && !(P.stride > 0) && wa > 2.6 ? smooth(2.6, 3.0, wa) : 0;
      sp.visible = a > 0.01;
      sp.material.opacity = a;
      sp.position.set(P.x, 2.25 + 0.06 * Math.sin(W * 2.4 + k * 2), P.z);
    });
  }
  return { G, frame, ITEMS };
}

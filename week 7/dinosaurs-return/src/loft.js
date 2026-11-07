// The animals' skin: smooth tubes through a list of stations (body + tail + neck, head, jaw, each leg), rebuilt every
// frame on the CPU so they bend as the animal walks. Plus the small helpers every animal shares: a bone chain that
// bends joint by joint, two-bone leg IK with the knee pointing forward (elbows back), a gait clock that plants each
// foot and never lets it slide, a scaly skin material, and instanced spikes (teeth, claws, horns).
//   const L = makeLoft(nStations, nRing, { color: (u, a) => [r, g, b] (sRGB 0..1; u along, a = angle round it) });
//   each frame: L.update(stations)  station: { p: Vector3, up: Vector3, w (half width), t (height above), b (depth below) }
import * as THREE from 'three';
import { clamp, smooth } from './util.js';

const _T = new THREE.Vector3(), _S = new THREE.Vector3(), _U = new THREE.Vector3(), _c = new THREE.Color();

// a pebbly scale pattern (tileable), used as the colour detail and the bump of every skin
let SCALES = null;
function scaleTexture() {
  if (SCALES) return SCALES;
  const N = 512, cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, N, N);
  let seed = 7;
  const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let k = 0; k < 2600; k++) {
    const x = R() * N, y = R() * N, r = 4 + R() * 9 + (R() < 0.06 ? 8 : 0);
    for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
      const gr = g.createRadialGradient(x + ox - r * 0.3, y + oy - r * 0.3, r * 0.1, x + ox, y + oy, r);
      const v = 170 + Math.floor(R() * 70);
      gr.addColorStop(0, `rgb(${v},${v},${v})`); gr.addColorStop(0.75, `rgb(${v - 40},${v - 40},${v - 40})`); gr.addColorStop(1, 'rgba(70,70,70,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x + ox, y + oy, r, 0, Math.PI * 2); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  SCALES = t;
  return t;
}

export function skinMaterial({ rough = 0.72, bump = 1.0, sheen = 0 } = {}) {
  const tex = scaleTexture();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: 0, map: tex, bumpMap: tex, bumpScale: bump });
  m.onBeforeCompile = (sh) => {
    // the map is detail only: lift it so it darkens the creases, not the whole skin
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec4 sc = texture2D(map, vMapUv);
        diffuseColor.rgb *= 0.62 + 0.55 * sc.r;
      #endif`);
  };
  m.customProgramCacheKey = () => 'dino-skin-' + bump;
  return m;
}

export function makeLoft(nS, nR, { color, uvLen = 4, uvRound = 2, mat, caps = [true, true] }) {
  const nV = nS * nR + 2;
  const pos = new Float32Array(nV * 3), col = new Float32Array(nV * 3), uv = new Float32Array(nV * 2);
  const idx = [];
  for (let i = 0; i < nS - 1; i++) for (let j = 0; j < nR; j++) {
    const a = i * nR + j, b = i * nR + ((j + 1) % nR), c = (i + 1) * nR + j, d = (i + 1) * nR + ((j + 1) % nR);
    idx.push(a, c, b, b, c, d);
  }
  const cA = nS * nR, cB = nS * nR + 1;
  if (caps[0]) for (let j = 0; j < nR; j++) idx.push(cA, j, (j + 1) % nR);
  if (caps[1]) for (let j = 0; j < nR; j++) idx.push(cB, (nS - 1) * nR + ((j + 1) % nR), (nS - 1) * nR + j);
  for (let i = 0; i < nS; i++) for (let j = 0; j < nR; j++) {
    const k = i * nR + j, u = i / (nS - 1), a = (j / nR) * Math.PI * 2;
    const [r, g, b] = color(u, a);
    _c.setRGB(r, g, b, THREE.SRGBColorSpace);
    col.set([_c.r, _c.g, _c.b], k * 3);
    uv.set([u * uvLen, (j / nR) * uvRound], k * 2);
  }
  for (const [k, u] of [[cA, 0], [cB, 1]]) { const [r, g, b] = color(u, Math.PI / 2); _c.setRGB(r, g, b, THREE.SRGBColorSpace); col.set([_c.r, _c.g, _c.b], k * 3); uv.set([u * uvLen, 0], k * 2); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  const COS = [], SIN = [];
  for (let j = 0; j < nR; j++) { const a = (j / nR) * Math.PI * 2; COS.push(Math.cos(a)); SIN.push(Math.sin(a)); }
  return {
    mesh, nS,
    update(st) {
      for (let i = 0; i < nS; i++) {
        const s = st[i], pa = st[Math.max(i - 1, 0)].p, pb = st[Math.min(i + 1, nS - 1)].p;
        _T.subVectors(pb, pa).normalize();
        _S.crossVectors(_T, s.up).normalize();
        _U.crossVectors(_S, _T);
        for (let j = 0; j < nR; j++) {
          const c = COS[j], sn = SIN[j];
          const h = sn > 0 ? s.t : s.b;
          // a slightly squarer section than an ellipse (flanks), so bodies don't read as sausages
          const cx = Math.sign(c) * Math.pow(Math.abs(c), s.sq ?? 0.85), sy = Math.sign(sn) * Math.pow(Math.abs(sn), s.sq ?? 0.85);
          const k = (i * nR + j) * 3;
          pos[k] = s.p.x + _S.x * s.w * cx + _U.x * h * sy;
          pos[k + 1] = s.p.y + _S.y * s.w * cx + _U.y * h * sy;
          pos[k + 2] = s.p.z + _S.z * s.w * cx + _U.z * h * sy;
        }
      }
      const a = st[0].p, b = st[nS - 1].p;
      pos.set([a.x, a.y, a.z], cA * 3); pos.set([b.x, b.y, b.z], cB * 3);
      geo.attributes.position.needsUpdate = true;
      geo.computeVertexNormals();
    },
  };
}

// ---- stations from a few key ones: Catmull-Rom between their centres, smoothstep between their sizes ----
export function resample(keys, perSeg) {
  const out = [];
  const n = keys.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = keys[Math.max(i - 1, 0)].p, p1 = keys[i].p, p2 = keys[i + 1].p, p3 = keys[Math.min(i + 2, n - 1)].p;
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg, t2 = t * t, t3 = t2 * t;
      const p = new THREE.Vector3(
        0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3));
      const e = t * t * (3 - 2 * t), A = keys[i], B = keys[i + 1];
      out.push({ p, up: new THREE.Vector3().lerpVectors(A.up, B.up, t).normalize(), w: A.w + (B.w - A.w) * e, t: A.t + (B.t - A.t) * e, b: A.b + (B.b - A.b) * e, sq: (A.sq ?? 0.85) + ((B.sq ?? 0.85) - (A.sq ?? 0.85)) * e });
    }
  }
  const L = keys[n - 1];
  out.push({ p: L.p.clone(), up: L.up.clone(), w: L.w, t: L.t, b: L.b, sq: L.sq });
  return out;
}

// ---- a frame: where a part sits and which way it faces (X forward, Y up, Z its right side) ----
export class Frame {
  constructor() { this.o = new THREE.Vector3(); this.q = new THREE.Quaternion(); }
  at(lx, ly, lz, out = new THREE.Vector3()) { return out.set(lx, ly, lz).applyQuaternion(this.q).add(this.o); }
  dir(lx, ly, lz, out = new THREE.Vector3()) { return out.set(lx, ly, lz).applyQuaternion(this.q); }
  copy(f) { this.o.copy(f.o); this.q.copy(f.q); return this; }
  // turn about its own axes: yaw (left +), pitch (nose up +), roll
  turn(yaw, pitch, roll = 0) { _q.setFromEuler(_e.set(roll, yaw, pitch, 'YZX')); this.q.multiply(_q); return this; }
  matrix(m, s = 1) { return m.compose(this.o, this.q, _sc.setScalar(s)); }
}
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _sc = new THREE.Vector3();

// a bone chain: from a root frame, segments (rest offsets in the parent's frame) each turned by (yaw, pitch);
// returns the frame at every joint
export function chain(root, segs, bends) {
  const out = [new Frame().copy(root)];
  let f = new Frame().copy(root);
  for (let i = 0; i < segs.length; i++) {
    const [yaw, pitch] = bends[i] || [0, 0];
    f.turn(yaw, pitch);
    const nf = new Frame().copy(f);
    nf.o.copy(f.at(segs[i][0], segs[i][1], segs[i][2] || 0));
    out.push(nf);
    f = nf;
  }
  return out;
}

// ---- two-bone IK: hip H, end A, lengths; the knee bends toward 'hint' (forward for knees, back for elbows) ----
export function ik2(H, A, L1, L2, hint, out = new THREE.Vector3()) {
  const D = _T.subVectors(A, H);
  let d = D.length();
  d = clamp(d, Math.abs(L1 - L2) + 1e-3, (L1 + L2) * 0.9995);
  D.normalize();
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(L1 * L1 - a * a, 0));
  const K = _S.copy(hint).addScaledVector(D, -hint.dot(D)).normalize();
  return out.copy(H).addScaledVector(D, a).addScaledVector(K, h);
}

// ---- a gait clock: phase g(v) from the speed, with shorter steps when slow; each foot's plants, worked out once ----
//   path: { pointAt(s) -> {x, z, yaw} }, sAt(v), C: stride (m per cycle) at full speed, vFull: the speed of full strides
export function makeGait({ sAt, speedAt, C, vFull, v0 = -4, v1 = 50, dt = 1 / 240, minStep = 0.28 }) {
  const n = Math.ceil((v1 - v0) / dt);
  const G = new Float64Array(n + 1);
  let g = 0;
  for (let k = 0; k <= n; k++) {
    G[k] = g;
    const sp = speedAt(v0 + k * dt);
    g += (sp / (C * clamp(sp / vFull, minStep, 1.15))) * dt;
  }
  const gAt = (v) => { const f = clamp((v - v0) / dt, 0, n - 1.001), k = Math.floor(f); return G[k] + (G[k + 1] - G[k]) * (f - k); };
  // the time when the phase reaches x (binary search: g is increasing)
  const vOf = (x) => { let lo = 0, hi = n; if (x <= G[0]) return v0; if (x >= G[n]) return v1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (G[m] < x) lo = m; else hi = m; } return v0 + (lo + (x - G[lo]) / (G[hi] - G[lo])) * dt; };
  return {
    gAt, vOf,
    // foot with phase offset 'off' and stance share 'beta': where it is (planted point or mid-swing), how high, and
    // when its last plant was
    foot(v, off, beta, plantAt) {
      const c = gAt(v) + off, nn = Math.floor(c), ph = c - nn;
      if (ph < beta) {
        const P = plantAt(vOf(nn + beta / 2 - off), nn);
        return { p: P, lift: 0, swing: 0, down: vOf(nn - off), n: nn };
      }
      const u = (ph - beta) / (1 - beta);
      const A = plantAt(vOf(nn + beta / 2 - off), nn), B = plantAt(vOf(nn + 1 + beta / 2 - off), nn + 1);
      const e = u * u * (3 - 2 * u);
      return { p: { x: A.x + (B.x - A.x) * e, z: A.z + (B.z - A.z) * e, y: (A.y || 0) + ((B.y || 0) - (A.y || 0)) * e, yaw: A.yaw + (B.yaw - A.yaw) * e }, lift: Math.sin(Math.PI * u), swing: u, down: vOf(nn + 1 - off), n: nn };
    },
  };
}

// ---- spikes: teeth, claws, horns (one instanced cone, each placed by a matrix every frame) ----
export function makeSpikes(scene, n, color, rough = 0.45) {
  const geo = new THREE.ConeGeometry(0.5, 1, 7).translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color, roughness: rough }), n);
  mesh.castShadow = true; mesh.frustumCulled = false;
  scene.add(mesh);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3();
  let k = 0;
  return {
    mesh,
    begin() { k = 0; },
    // base point, direction it points (unnormalised ok), length, base radius
    add(p, dir, len, r) {
      if (k >= n) return;
      d.copy(dir).normalize();
      q.setFromUnitVectors(up, d);
      m4.compose(p, q, s.set(r * 2, len, r * 2));
      mesh.setMatrixAt(k++, m4);
    },
    end() { mesh.count = k; mesh.instanceMatrix.needsUpdate = true; },
  };
}

export { smooth, clamp };

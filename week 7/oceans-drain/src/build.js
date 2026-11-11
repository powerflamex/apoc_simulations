// The building kit: coloured boxes and tubes merged into single meshes, ship hulls lofted from their sections,
// painted canvas textures (rust, plates, portholes), and the lit materials for everything that isn't the seabed.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, clamp, lerp } from './util.js';
import { GU } from './ground.js';

const tc = new THREE.Color();
// give a geometry one flat colour (as vertex colours, sRGB hex in)
export function paint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  tc.set(color);
  for (let i = 0; i < n; i++) { a[i * 3] = tc.r; a[i * 3 + 1] = tc.g; a[i * 3 + 2] = tc.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}
const E = new THREE.Euler(), Q = new THREE.Quaternion(), M4 = new THREE.Matrix4(), V1 = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1);
export function place(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
  E.set(rx, ry, rz, 'YXZ'); Q.setFromEuler(E);
  return geo.applyMatrix4(M4.compose(V1.set(x, y, z), Q, S1.set(s, s, s)));
}
export const box = (w, h, d, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => place(paint(new THREE.BoxGeometry(w, h, d), color), x, y, z, rx, ry, rz);
export const cyl = (r0, r1, h, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 10) => place(paint(new THREE.CylinderGeometry(r0, r1, h, seg), color), x, y, z, rx, ry, rz);
export const ball = (r, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, seg = 12) => place(paint(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 4)).scale(sx, sy, sz), color), x, y, z);
// a tube between two points
export function rod(ax, ay, az, bx, by, bz, r, color, seg = 6) {
  const d = new THREE.Vector3(bx - ax, by - ay, bz - az), L = d.length();
  const g = paint(new THREE.CylinderGeometry(r, r, L, seg), color);
  Q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return g.applyMatrix4(M4.compose(V1.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), Q, S1.set(1, 1, 1)));
}
export const merge = (list) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)), false);

// ---- materials ----
// everything was under water a moment ago: a wet sheen that mirrors the sky at grazing angles
export function propMaterial(o = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: o.vertexColors ?? true, map: o.map ?? null, roughness: o.rough ?? 0.7, metalness: o.metal ?? 0, side: o.side ?? THREE.FrontSide, flatShading: !!o.flat });
  const gloss = o.gloss ?? 0.35;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, GU, { pGloss: { value: gloss } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 pWP; varying vec3 pNW;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          pWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz; pNW = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        #else
          pWP = (modelMatrix * vec4(transformed, 1.0)).xyz; pNW = normalize(mat3(modelMatrix) * normal);
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 pWP; varying vec3 pNW; uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform float pGloss;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 V = normalize(cameraPosition - pWP);
          vec3 nn = normalize(pNW); if (dot(nn, V) < 0.0) nn = -nn;
          float fr = pow(1.0 - clamp(dot(nn, V), 0.0, 1.0), 3.0);
          totalEmissiveRadiance += mix(uSkyLo, uSkyHi, 0.3) * fr * pGloss * (0.5 + 0.5 * nn.y);
        }`);
  };
  mat.customProgramCacheKey = () => `prop${mat.map ? 1 : 0}${o.flat ? 1 : 0}`;
  return mat;
}

// ---- painted textures ----
export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
// rust and grime over whatever is already painted: blotches, then runs streaking down from random points
export function rust(g, w, h, R, { blotches = 500, runs = 260, cols = ['#7a3a16', '#a8551f', '#5a2c14', '#c9742c', '#3c2416'], alpha = 0.5, y0 = 0, y1 = 1 } = {}) {
  // (many small soft blobs, so it builds up as mottling, never as clean ovals)
  for (let i = 0; i < blotches * 6; i++) {
    const x = R() * w, y = (y0 + R() * (y1 - y0)) * h, r = (0.006 + R() * R() * 0.035) * h;
    const c = cols[Math.floor(R() * cols.length)];
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, c); gr.addColorStop(1, c + '00');
    g.globalAlpha = alpha * (0.25 + 0.6 * R());
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  for (let i = 0; i < runs; i++) {
    const x = R() * w, y = (y0 + R() * (y1 - y0)) * h, L = (0.05 + R() * 0.4) * h, wd = 0.8 + R() * 2.2;
    const gr = g.createLinearGradient(0, y, 0, y + L);
    const c = cols[Math.floor(R() * cols.length)];
    gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(90,40,16,0)');
    g.globalAlpha = alpha * (0.5 + 0.5 * R());
    g.fillStyle = gr;
    g.fillRect(x, y, wd, L);
  }
  g.globalAlpha = 1;
}

// ---- a ship's hull, lofted from its sections ----
// x runs along the ship (stern at -L/2, bow at +L/2), y up from the keel, z across. uv = (along 0..1, height 0..1).
// Returns { hull, deck, edge(u) -> { x, y, z } of the deck edge on the +z side, D(u) }.
export function hullGeo({ L, B, D, bow = 0.3, stern = 0.18, transom = 0.55, sheer = 0, sheerStern = 0.4, rake = 0, sternRake = 0, eMid = 0.4, eBow = 1.6, bowPow = 1.8, nL = 40, nS = 9, deckDrop = 0, deckColor = 0x6a6258, u0 = 0 }) {
  const sec = (u) => {
    const wb = clamp((u - (1 - bow)) / bow), ws = clamp((stern - u) / stern);
    const hb = Math.max(0.012 * B, (B / 2) * (1 - Math.pow(wb, bowPow)) * (1 - (1 - transom) * ws * ws));
    const e = Math.max(lerp(eMid, eBow, Math.pow(wb, 0.8)), lerp(eMid, 1.0, ws));
    const Du = D + sheer * (wb * wb + sheerStern * ws * ws);
    const yk = D * 0.34 * ws * ws + D * 0.06 * Math.pow(wb, 4);
    return { wb, ws, hb, e, Du, yk, x0: (u - 0.5) * L };
  };
  const pt = (c, s, sign) => {
    const th = s * Math.PI / 2;
    const y = c.yk + (c.Du - c.yk) * (1 - Math.pow(Math.cos(th), c.e));
    const z = sign * c.hb * Math.pow(Math.sin(th), c.e);
    const x = c.x0 + (rake * Math.pow(c.wb, 1.5) - sternRake * Math.pow(c.ws, 1.5)) * (y / c.Du);
    return [x, y, z];
  };
  const ring = 2 * nS + 1;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= nL; i++) {
    const u = u0 + (1 - u0) * (i / nL), c = sec(u);
    for (let k = -nS; k <= nS; k++) {
      const [x, y, z] = pt(c, Math.abs(k) / nS, k < 0 ? -1 : 1);
      pos.push(x, y, z); uv.push(u, y / c.Du);
    }
  }
  for (let i = 0; i < nL; i++) for (let k = 0; k < ring - 1; k++) {
    const a = i * ring + k, b = a + 1, c = a + ring, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // the stern (or the break) closed off
  { const c0 = pos.length / 3; const s0 = sec(u0); pos.push(s0.x0, (s0.yk + s0.Du) / 2, 0); uv.push(u0, 0.5); for (let k = 0; k < ring - 1; k++) idx.push(c0, k + 1, k); }
  const hull = new THREE.BufferGeometry();
  hull.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hull.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  hull.setIndex(idx);
  hull.computeVertexNormals();
  // the deck
  const dp = [], di = [];
  for (let i = 0; i <= nL; i++) {
    const u = u0 + (1 - u0) * (i / nL), c = sec(u);
    const [x, y, z] = pt(c, 1, 1);
    dp.push(x, y - deckDrop, -z, x, y - deckDrop, z);
  }
  for (let i = 0; i < nL; i++) { const a = i * 2; di.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  let deck = new THREE.BufferGeometry();
  deck.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
  deck.setIndex(di);
  deck.computeVertexNormals();
  deck = paint(deck, deckColor);
  return {
    hull, deck,
    edge(u, sign = 1) { const [x, y, z] = pt(sec(u), 1, sign); return { x, y, z }; },
    side(u, s, sign = 1) { const [x, y, z] = pt(sec(u), s, sign); return { x, y, z }; },
    D: (u) => sec(u).Du, hb: (u) => sec(u).hb,
  };
}

// a rail along a deck edge: posts and two rails between successive points
export function railing(pts, h, color, r = 0.035) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    out.push(rod(p.x, p.y, p.z, p.x, p.y + h, p.z, r, color, 5));
    if (i) { const q = pts[i - 1]; out.push(rod(q.x, q.y + h, q.z, p.x, p.y + h, p.z, r, color, 5), rod(q.x, q.y + h * 0.5, q.z, p.x, p.y + h * 0.5, p.z, r * 0.8, color, 5)); }
  }
  return out;
}

export { mergeGeometries, rng };

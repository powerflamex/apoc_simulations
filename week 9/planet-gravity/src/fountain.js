// The plaza fountain: a round stone basin of rippling water, a two-tier centrepiece (a column, a wide lower bowl, a
// stem, a small upper bowl), water sheeting over both bowls' lips, a tall jet from the top and eight arcing jets from
// the basin's rim that land in the water round the centrepiece. Every stream is a solid tube of water rebuilt each frame
// from the drops' paths (Earth's gravity up to the wipe, this world's after), so at the wipe the jets visibly stretch
// (the Moon: 6x higher and longer, the arcs overshoot the basin onto the plaza; Pluto: 16x, the centre jet a column
// into the sky) or collapse (Jupiter, the Sun). A jet's height and reach scale as 1/gravity.
//   const f = makeFountain(scene, { plainMat, shadowy, parts });  each frame: f.frame(g, tt, show) -> how much lands outside
import * as THREE from 'three';
import { FOUNTAIN } from './layout.js';
import { patchHeat } from './heat.js';

const gE = 9.8;
const hash = (i, s) => { const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };

// rippling water: small waves everywhere, rings spreading from where the jets land, white foam there
function waterMat(nHits) {
  const U = { uHits: { value: Array.from({ length: nHits }, () => new THREE.Vector3()) }, uT: { value: 0 } };
  const m = new THREE.MeshStandardMaterial({ color: 0x2a7f8f, roughness: 0.05, metalness: 0.0 });
  const prev = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWw;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWw = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWw; uniform vec3 uHits[${nHits}]; uniform float uT;
      float wh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float wn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(wh(i), wh(i+vec2(1,0)), f.x), mix(wh(i+vec2(0,1)), wh(i+vec2(1,1)), f.x), f.y); }
      float wHeight(vec2 p) {
        float h = (wn(p * 3.0 + vec2(uT * 0.7, uT * 0.4)) + wn(p * 7.0 - vec2(uT * 0.9, -uT * 0.6)) * 0.5) * 0.02;
        for (int i = 0; i < ${nHits}; i++) { float d = length(p - uHits[i].xy); h += uHits[i].z * 0.03 * sin(d * 22.0 - uT * 9.0) * exp(-d * 1.6); }
        return h;
      }
      float wFoam(vec2 p) { float f = 0.0; for (int i = 0; i < ${nHits}; i++) { float d = length(p - uHits[i].xy); f += uHits[i].z * exp(-d * d * 18.0) * (0.6 + 0.6 * wn(p * 14.0 + uT * 3.0)); } return clamp(f, 0.0, 1.0); }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 p = vWw.xz; float e = 0.02;
          vec3 nw = normalize(vec3(-(wHeight(p + vec2(e, 0.0)) - wHeight(p - vec2(e, 0.0))) / (2.0 * e), 1.0, -(wHeight(p + vec2(0.0, e)) - wHeight(p - vec2(0.0, e))) / (2.0 * e)));
          normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        { float fm = wFoam(vWw.xz); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.96, 1.0), fm * 0.85); }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.05, 0.6, wFoam(vWw.xz));');
  };
  patchHeat(m, 'fwater', { prev });
  return { m, U };
}

// a stream of water: a tube with a bright core and see-through edges, streaks running along it
function streamMat() {
  const m = new THREE.MeshStandardMaterial({ color: 0xe2f3ff, roughness: 0.15, metalness: 0, transparent: true, depthWrite: false, emissive: new THREE.Color(0.3, 0.34, 0.38) });
  const U = { uT: { value: 0 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aOp; varying float vOp; varying vec2 vSu; varying vec3 vSn; varying vec3 vSv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvSu = uv; vOp = aOp;')
      .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvSn = normalize(normalMatrix * objectNormal);')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvSv = -mvPosition.xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying float vOp; varying vec2 vSu; varying vec3 vSn; varying vec3 vSv; uniform float uT;
      float sh21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float sn21(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(sh21(i), sh21(i+vec2(1,0)), f.x), mix(sh21(i+vec2(0,1)), sh21(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float edge = abs(dot(normalize(vSn), normalize(vSv)));                  // 1 facing you .. 0 at the edges
          float streak = sn21(vec2(vSu.y * 6.0, vSu.x * 0.8 - uT * 3.0)) * 0.6 + sn21(vec2(vSu.y * 13.0, vSu.x * 2.5 - uT * 5.0)) * 0.4;
          diffuseColor.rgb *= 0.85 + 0.35 * streak;
          diffuseColor.a = clamp((0.5 + 0.4 * edge + 0.25 * streak) * vOp, 0.0, 0.95);
        }`);
  };
  return { m, U };
}

export function makeFountain(scene, { plainMat, shadowy, parts }) {
  const F = FOUNTAIN;
  const stone = plainMat(0xc4b9a6, 0.8), stoneD = plainMat(0x8f8676, 0.85);
  const lathe = (pts, mat, seg = 64) => { const m = shadowy(new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat)); m.position.set(F.x, 0, F.z); scene.add(m); return m; };
  // the basin: a broad stone lip, its inner wall, a dark tiled floor under the water
  lathe([[F.r - 0.3, 0.05], [F.r - 0.3, F.rim - 0.02], [F.r - 0.34, F.rim + 0.02], [F.r - 0.3, F.rim + 0.06], [F.r + 0.06, F.rim + 0.06], [F.r + 0.12, F.rim], [F.r + 0.1, 0.08], [F.r + 0.16, 0.0]], stone);
  { const fl = new THREE.Mesh(new THREE.CircleGeometry(F.r - 0.3, 48).rotateX(-Math.PI / 2), plainMat(0x24414a, 0.9)); fl.position.set(F.x, 0.06, F.z); scene.add(fl); }
  // the centrepiece: a column, the lower bowl, a stem, the upper bowl, a finial with the nozzle
  const B1 = { r: 1.08, y: 1.14 }, B2 = { r: 0.48, y: 1.72 }, NOZ = 1.86;
  lathe([[0, 0.3], [0.45, 0.3], [0.38, 0.42], [0.3, 0.5], [0.24, 0.85], [0.3, 0.92], [0.7, 1.0], [B1.r - 0.04, B1.y - 0.05], [B1.r + 0.02, B1.y], [B1.r - 0.03, B1.y + 0.03], [0.6, B1.y - 0.06], [0.2, B1.y - 0.1], [0.14, B1.y - 0.06],
    [0.11, 1.4], [0.15, 1.5], [0.32, 1.6], [B2.r - 0.02, B2.y - 0.03], [B2.r + 0.02, B2.y], [B2.r - 0.03, B2.y + 0.02], [0.2, B2.y - 0.05], [0.09, B2.y - 0.03], [0.1, 1.78], [0.06, NOZ - 0.02], [0, NOZ]], stone);
  // the water in the basin and in the two bowls
  const W = waterMat(10);
  const water = new THREE.Mesh(new THREE.CircleGeometry(F.r - 0.3, 64).rotateX(-Math.PI / 2), W.m);
  water.position.set(F.x, F.water, F.z); water.receiveShadow = true; scene.add(water);
  for (const [r, y] of [[B1.r - 0.06, B1.y - 0.02], [B2.r - 0.05, B2.y - 0.02]]) { const w = new THREE.Mesh(new THREE.RingGeometry(0.12, r, 40).rotateX(-Math.PI / 2), W.m); w.position.set(F.x, y, F.z); scene.add(w); }

  // ---- the streams: one dynamic tube mesh for all of them ----
  const S = streamMat();
  const SIDES = 7, MAXP = 110, NJ = 9 + 2;            // nine jets + the two overflow sheets are separate (below)
  const JETS = [{ p: [F.x, NOZ, F.z], v: [0, 6.57, 0], r: 0.075, spread: 0.3 }];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.2, sp = 3.69;
    JETS.push({ p: [F.x + Math.sin(a) * (F.r - 0.12), F.rim + 0.1, F.z + Math.cos(a) * (F.r - 0.12)], v: [-Math.sin(a) * sp * 0.5, sp * 0.866, -Math.cos(a) * sp * 0.5], r: 0.045, spread: 0.15 });
  }
  const maxV = JETS.length * MAXP * (SIDES + 1);
  const pos = new Float32Array(maxV * 3), nor = new Float32Array(maxV * 3), uv = new Float32Array(maxV * 2), col = new Float32Array(maxV);     // col: opacity along it (frayed near the tip)
  const idx = [];
  for (let j = 0; j < JETS.length; j++) for (let k = 0; k < MAXP - 1; k++) for (let s = 0; s < SIDES; s++) {
    const a = (j * MAXP + k) * (SIDES + 1) + s, b = a + SIDES + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); tg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  tg.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); tg.setAttribute('aOp', new THREE.BufferAttribute(col, 1));
  tg.setIndex(idx);
  const tubes = new THREE.Mesh(tg, S.m); tubes.frustumCulled = false; tubes.renderOrder = 6; scene.add(tubes);
  // the sheets of water over the bowls' lips: lathed curtains whose curve follows gravity (they bow out more when it's weak)
  const CN = 14;
  const mkCurtain = () => {
    const g = new THREE.LatheGeometry(Array.from({ length: CN }, (_, i) => new THREE.Vector2(1, -i / (CN - 1))), 48);
    g.setAttribute('aOp', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(0.75), 1));
    const m = new THREE.Mesh(g, S.m); m.position.set(F.x, 0, F.z); m.frustumCulled = false; m.renderOrder = 6; scene.add(m); return m;
  };
  const curtains = [{ m: mkCurtain(), r0: B1.r + 0.03, y0: B1.y, y1: F.water, v: 0.35 }, { m: mkCurtain(), r0: B2.r + 0.03, y0: B2.y, y1: B1.y - 0.02, v: 0.28 }];

  const P = new THREE.Vector3(), D = new THREE.Vector3(), N1 = new THREE.Vector3(), N2 = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0), SIDEV = new THREE.Vector3(1, 0, 0);
  // where a drop that left jet J `age` s ago is now (t = time since the wipe; before it, Earth's gravity)
  function dropAt(J, age, t, g, out) {
    const e = t - age;                    // when it left
    let x, y, z, vy;
    if (e >= 0) { x = J.p[0] + J.v[0] * age; z = J.p[2] + J.v[2] * age; y = J.p[1] + J.v[1] * age - 0.5 * g * age * age; vy = J.v[1] - g * age; }
    else {
      const a = -e, y1 = J.p[1] + J.v[1] * a - 0.5 * gE * a * a, vy1 = J.v[1] - gE * a;
      x = J.p[0] + J.v[0] * age; z = J.p[2] + J.v[2] * age; y = y1 + vy1 * t - 0.5 * g * t * t; vy = vy1 - g * t;
      out.early = a;                      // (how long it flew under Earth's gravity)
    }
    out.x = x; out.y = y; out.z = z; out.vy = vy;
    return out;
  }
  const floorAt = (x, z) => { const d = Math.hypot(x - F.x, z - F.z); return d < B2.r ? B2.y : d < B1.r ? B1.y : d < F.r - 0.3 ? F.water : 0.02; };
  const tmp = {}, pts = [];

  return {
    water, U: W.U,
    // g: gravity (m/s²) since the wipe; tt: time since the wipe; show: false hides the moving water (pressed flat)
    frame(g, tt, show, camPos) {
      W.U.uT.value = tt; S.U.uT.value = tt;
      tubes.visible = show; curtains.forEach((c) => { c.m.visible = show; });
      let outside = 0, nHit = 0;
      for (const h of W.U.uHits.value) h.set(0, 0, 0);
      if (!show) return 0;
      let vi = 0;
      JETS.forEach((J, j) => {
        // walk the stream from the nozzle (age 0) to where its oldest drops come down
        pts.length = 0;
        const da = 0.02;
        let land = null;
        for (let age = 0; age < 40; age += da) {
          tmp.early = 0; dropAt(J, age, tt, g, tmp);
          if (tmp.early && J.p[1] + J.v[1] * tmp.early - 0.5 * gE * tmp.early ** 2 < floorAt(tmp.x, tmp.z) - 0.01 && J.v[1] - gE * tmp.early < 0) break;   // (landed before the wipe)
          const fl = floorAt(tmp.x, tmp.z);
          if (tmp.y < fl && tmp.vy < 0) { land = { x: tmp.x, z: tmp.z, y: fl, vy: tmp.vy }; pts.push([tmp.x, fl, tmp.z, age]); break; }
          pts.push([tmp.x, tmp.y, tmp.z, age]);
        }
        // fewer, evenly spread points along it
        const n = Math.min(MAXP, pts.length), step = (pts.length - 1) / Math.max(1, n - 1);
        const A = pts.length ? pts[pts.length - 1][3] : 0;
        for (let k = 0; k < MAXP; k++) {
          const q = pts.length ? pts[Math.min(pts.length - 1, Math.round(Math.min(k, n - 1) * step))] : [J.p[0], J.p[1], J.p[2], 0];
          const qn = pts.length ? pts[Math.min(pts.length - 1, Math.round(Math.min(k + 1, n - 1) * step))] : q;
          const qp = pts.length ? pts[Math.min(pts.length - 1, Math.round(Math.min(Math.max(k - 1, 0), n - 1) * step))] : q;
          P.set(q[0], q[1], q[2]);
          D.set(qn[0] - qp[0], qn[1] - qp[1], qn[2] - qp[2]);
          if (D.lengthSq() < 1e-10) D.set(0, 1, 0);
          D.normalize();
          N1.crossVectors(D, Math.abs(D.y) > 0.9 ? SIDEV : UPV).normalize(); N2.crossVectors(D, N1).normalize();
          // it widens a little as it goes and frays toward its end
          const u = A > 0 ? q[3] / A : 0;
          const rr = J.r * (1 + 0.6 * Math.min(1, q[3] * 0.6)) * (k >= n - 1 ? 0.6 : 1);
          const op = 1 - 0.65 * Math.max(0, (u - 0.75) / 0.25) * (land ? 0.6 : 1);
          for (let s = 0; s <= SIDES; s++) {
            const a = (s / SIDES) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
            const nx = N1.x * c + N2.x * sn, ny = N1.y * c + N2.y * sn, nz = N1.z * c + N2.z * sn;
            pos[vi * 3] = P.x + nx * rr; pos[vi * 3 + 1] = P.y + ny * rr; pos[vi * 3 + 2] = P.z + nz * rr;
            nor[vi * 3] = nx; nor[vi * 3 + 1] = ny; nor[vi * 3 + 2] = nz;
            uv[vi * 2] = q[3] * 4.0; uv[vi * 2 + 1] = s / SIDES;
            col[vi] = op;
            vi++;
          }
        }
        // spray: drops shaken off along it, mist where it breaks up at the top, a splash where it comes down
        for (let k = 0; k < pts.length; k += 3) {
          const q = pts[k], h1 = hash(k + j * 131, 1.7), h2 = hash(k + j * 131, 2.9), h3 = hash(k + j * 131, 4.1);
          const off = J.spread * Math.min(1, q[3] * 0.5) * (0.4 + h3);
          if (h1 < 0.5) parts.add(q[0] + (h2 - 0.5) * off * 2, q[1] + (h1 - 0.25) * off, q[2] + (h3 - 0.5) * off * 2, 0.012 + 0.012 * h2, 0, -1.5, 0, 1, 0.86, 0.93, 1.0, 0.6, h1);
          if (k % 6 === 0) parts.add(q[0], q[1], q[2], J.r * 3 + 0.08 * Math.min(1, q[3] * 0.4), 0, 0, 0, 0, 0.92, 0.96, 1.0, 0.08, h2);
        }
        if (land) {
          for (let m = 0; m < 10; m++) {
            const h1 = hash(m + j * 17, tt * 7 % 13 + 0.3), ph = (tt * 3 + m / 10) % 1;
            parts.add(land.x + (h1 - 0.5) * 0.4 * ph, land.y + 0.05 + ph * Math.min(0.8, 0.15 * -land.vy) * (1 - ph) * 3, land.z + (hash(m, j) - 0.5) * 0.4 * ph, 0.05 + 0.18 * ph, 0, 0.5, 0, 0, 0.9, 0.95, 1.0, 0.5 * (1 - ph), h1);
          }
          if (land.y <= 0.05) outside++;
          else if (nHit < 10) W.U.uHits.value[nHit++].set(land.x, land.z, Math.min(1, -land.vy / 5));
        }
      });
      tg.attributes.position.needsUpdate = true; tg.attributes.normal.needsUpdate = true; tg.attributes.uv.needsUpdate = true; tg.attributes.aOp.needsUpdate = true;
      // the sheets over the lips: water leaving at v m/s sideways falls in a curve x = v t, y = g t²/2
      for (const c of curtains) {
        const p = c.m.geometry.attributes.position, H = c.y0 - c.y1, T = Math.sqrt(2 * H / g);
        for (let i = 0; i < p.count; i++) {
          const ring = i % CN, ang = Math.floor(i / CN) / 48 * Math.PI * 2;
          const t = (ring / (CN - 1)) * T, r = c.r0 + c.v * t, y = c.y0 - 0.5 * g * t * t;
          p.setXYZ(i, Math.sin(ang) * r, y, Math.cos(ang) * r);
        }
        p.needsUpdate = true; c.m.geometry.computeVertexNormals();
      }
      return outside / 8;
    },
  };
}

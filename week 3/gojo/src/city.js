// The towers: one instanced box per building with the facade look (night version of the facade patch: lit office
// floors, shopfronts, glass mirroring the dusk sky), plus every mark the techniques leave on them:
//   Blue: window cells inside its reach are torn out (fx.js flies the same cells into it); the frame stays.
//   Red: cells near its path are blown out, every window within reach of the blast bursts (goes dark), the tower at
//     the end is split: the bottom keeps standing, the top (a second instance) tips back and falls.
//   Hollow Purple: anything inside the swept sphere is discarded, the cut edges glow violet; towers the sphere
//     cuts right through lose their middle and their tops (second instances) drop into the trench.
import * as THREE from 'three';
import { B, FH, G0, TOWER_B } from './layout.js';
import { CU, CUT_GLSL } from './cuts.js';
import { PURPLES, BLUE, RED_P0, RED_P1, RED_LEN, V_RED, V_RED_HIT, RED_SPEED, redReach, blueR, V_BLUE0, redFront } from './timeline.js';
import { smooth, clamp, rng } from './util.js';

export const FU = {
  uBlueC: { value: new THREE.Vector3(BLUE.x, BLUE.y, BLUE.z) }, uBlueCut: { value: 0 },
  uRedP0: { value: new THREE.Vector3(RED_P0.x, RED_P0.y, RED_P0.z) },
  uRedD: { value: new THREE.Vector3(RED_P1.x - RED_P0.x, RED_P1.y - RED_P0.y, RED_P1.z - RED_P0.z).normalize() },
  uRedS: { value: -1 }, uDim: { value: 1 },
};

// ---- the window grid (shared with the chunk spawner) ----
// faces: 0 +x, 1 -x, 2 +z, 3 -z. Returns the cells of a building whose centres pass test(x, y, z).
export function cellsOf(b, test, yOff = 0) {
  const out = [];
  const faces = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let f = 0; f < 4; f++) {
    const [nx, nz] = faces[f];
    const W = nx ? b.d : b.w;
    const nCol = Math.max(1, Math.floor(W / b.colW + 0.5)), cw = W / nCol;
    const nRow = Math.floor((b.h - 1.5 - G0) / FH);
    for (let r = 0; r < nRow; r++) {
      const y = G0 + (r + 0.5) * FH;
      for (let c = 0; c < nCol; c++) {
        const u = (c + 0.5) * cw - W / 2;
        const x = nx ? b.x + nx * b.w / 2 : b.x + u;
        const z = nz ? b.z + nz * b.d / 2 : b.z + u;
        if (test(x, y, z)) out.push({ x, y, z, nx, nz, cw, b, r, c });
      }
    }
  }
  return out;
}
const redS = (x, y, z) => { const d = FU.uRedD.value; return (x - RED_P0.x) * d.x + (y - RED_P0.y) * d.y + (z - RED_P0.z) * d.z; };
export function redPerp(x, y, z) {
  const d = FU.uRedD.value, s = redS(x, y, z);
  return { s, q: Math.hypot(x - RED_P0.x - d.x * s, y - RED_P0.y - d.y * s, z - RED_P0.z - d.z * s) };
}
// when the blast passes a point
export const vRedAt = (s) => V_RED + Math.max(0, s) / RED_SPEED;
// window glass bursts out to this distance from the path (and the burst is late by the distance at the speed of sound)
export const GLASS_R = (s) => 60 + 0.04 * s;

const PARS = /* glsl */ `
uniform float uTime; uniform vec3 uBlueC; uniform float uBlueCut; uniform vec3 uRedP0; uniform vec3 uRedD; uniform float uRedS; uniform float uDim;
${CUT_GLSL}
varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vT; varying vec4 vS; varying vec3 vON; varying vec4 vC; varying vec3 vHome;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float rect(vec2 f, vec2 a, vec2 b, vec2 w) { vec2 s = smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f)); return s.x * s.y; }
vec3 skyRefl(vec3 r) {
  float h = clamp(r.y, -0.2, 1.0);
  vec3 c = mix(vec3(0.55, 0.32, 0.36), vec3(0.08, 0.1, 0.22), smoothstep(0.0, 0.35, h));
  c = mix(c, vec3(0.05, 0.05, 0.06), smoothstep(0.0, -0.12, r.y));
  return c;
}
struct Cell { vec2 f; vec2 id; vec2 fw; float ok; float far; float W; float y; float ground; vec3 cc; };
Cell cellOf() {
  Cell c;
  bool sx = abs(vON.x) > 0.5;
  float W = sx ? vSc.z : vSc.x;
  float lu = sx ? vLoc.z : vLoc.x;
  float u = (lu + 0.5) * W;
  float y = vLoc.y * vSc.y + vC.w;
  float colW = vS.z;
  float nCol = max(1.0, floor(W / colW + 0.5));
  colW = W / nCol;
  vec2 g = vec2(u / colW, (y - ${G0.toFixed(1)}) / ${FH.toFixed(1)});
  c.id = floor(g); c.f = fract(g);
  c.fw = max(fwidth(g), vec2(1e-4));
  c.far = smoothstep(0.12, 0.38, max(c.fw.x, c.fw.y));
  float nRow = floor((vS.w - 1.5 - ${G0.toFixed(1)}) / ${FH.toFixed(1)});
  c.ok = step(0.0, g.y) * step(c.id.y, nRow - 1.0) * step(abs(vON.y), 0.5);
  c.W = W; c.y = y; c.ground = step(y, ${G0.toFixed(1)});
  // the cell's centre where the building stands (for pieces that have since moved too)
  float uc = (c.id.x + 0.5) * colW - W * 0.5;
  float yc = ${G0.toFixed(1)} + (c.id.y + 0.5) * ${FH.toFixed(1)};
  c.cc = sx ? vHome + vec3(sign(vON.x) * vSc.x * 0.5, yc, uc) : vHome + vec3(uc, yc, sign(vON.z) * vSc.z * 0.5);
  return c;
}
float redCut(vec3 p) {
  float s = dot(p - uRedP0, uRedD);
  float q = length(p - uRedP0 - uRedD * s);
  return step(0.0, s) * step(s, uRedS) * step(q, 22.0 + 0.025 * s);
}
`;

const CUT = /* glsl */ `
  {
    Cell c = cellOf();
    // Hollow Purple: erased (not on the falling tops: they have moved out of it)
    if (vC.x < 1.5 && purpleD(vWP) < 0.0) discard;
    // a severed building: after the cut, only the stub below it is left
    if (vC.x > 0.5 && vC.x < 1.5 && uTime > vC.z && vWP.y > vC.y) discard;
    // Blue and Red: whole window cells torn out; the slabs and every third column stay
    if (c.ok > 0.5) {
      // (Blue takes one cell in three, the same ones fx.js flies: blueKeep)
      float seedI = floor(vS.x * 1009.0 + 0.5);
      bool keep = mod(c.id.x * 7.0 + c.id.y * 13.0 + seedI * 3.0, 3.0) < 0.5;
      bool gone = (keep && distance(c.cc, uBlueC) < uBlueCut) || redCut(c.cc) > 0.5;
      if (gone) {
        float slab = 1.0 - step(0.14, c.f.y);
        float col = step(mod(c.id.x, 3.0), 0.5) * (1.0 - step(0.1, c.f.x));
        if (slab + col < 0.5) discard;
      }
    }
  }
`;

const LOOK = /* glsl */ `
  #include <emissivemap_fragment>
  {
    float kind = floor(vS.y + 0.5);
    float seed = floor(vS.x * 1009.0 + 0.5);
    float fallK = clamp((uTime - vT.z) / max(vT.w, 0.1), 0.0, 1.0);
    float rubble = smoothstep(0.35, 0.8, fallK);
    float on = uDim * (1.0 - smoothstep(0.0, 0.25, fallK));
    vec3 base = diffuseColor.rgb;
    vec3 V = normalize(vWP - cameraPosition);
    Cell c = cellOf();
    if (!gl_FrontFacing) {
      // inside a gutted building: dark, the floor slabs catching a little light
      float slab = 1.0 - step(0.12, fract((c.y - ${G0.toFixed(1)}) / ${FH.toFixed(1)}));
      diffuseColor.rgb = vec3(0.035, 0.032, 0.03) + base * 0.05 * slab;
    } else if (abs(vON.y) < 0.5) {
      float hB = h21(vec2(seed, 8.1));
      float r = h21(c.id + vec2(seed * 0.173, floor(vON.x * 2.0 + vON.z + 3.5) * 1.37));
      float floorR = h21(vec2(c.id.y, seed * 0.29 + floor(vON.x * 2.0 + vON.z + 0.5)));
      float broken = step(vT.x + 0.35 * h21(c.id * 1.7 + seed), uTime);
      vec3 col = base; float win = 0.0;
      vec3 refl = skyRefl(reflect(V, normalize(vWN)));
      float fres = 0.25 + 0.75 * pow(1.0 - abs(dot(V, normalize(vWN))), 3.0);
      if (kind > 1.5 && kind < 2.5) {
        win = rect(c.f, vec2(0.04, 0.22), vec2(0.96, 0.98), c.fw) * c.ok;
        vec3 glass = mix(base * 0.18, refl * mix(vec3(1.0), base * 1.6, 0.4), 0.55 + 0.45 * fres);
        glass = mix(glass, vec3(0.02, 0.02, 0.025), broken);
        col = mix(base * 0.35, glass, mix(win, 0.85 * c.ok, c.far));
      } else if (kind > 2.5) {
        float band = 1.0 - step(0.2, c.f.y);
        win = rect(c.f, vec2(0.12, 0.3), vec2(0.88, 0.92), c.fw) * c.ok;
        vec3 glass = mix(vec3(0.05, 0.06, 0.08), refl * 0.6, 0.5 * fres);
        glass = mix(glass, vec3(0.02), broken);
        col = mix(base * 0.6, glass, win * (1.0 - c.far * 0.5));
        col = mix(col, base * 0.9, band * c.ok);
      } else {
        float wTop = kind < 0.5 ? 0.86 : 0.88;
        win = rect(c.f, vec2(0.22, 0.26), vec2(0.78, wTop), c.fw) * c.ok;
        float sill = rect(c.f, vec2(0.18, 0.2), vec2(0.82, 0.26), c.fw) * c.ok;
        vec3 glass = mix(vec3(0.05, 0.055, 0.07), refl * 0.7, 0.45 * fres) * (0.8 + 0.4 * r);
        glass = mix(glass, vec3(0.02), broken);
        col = mix(base * 0.8, glass, win * (1.0 - c.far));
        col = mix(col, base * 1.05, sill * (1.0 - c.far));
        col = mix(col, base * 0.6 + glass * 0.25, c.far * c.ok * 0.5);
      }
      // ground floor: shopfronts and lobbies lit warm, a dark fascia above
      if (c.ground > 0.5 && vC.w < 0.5) {
        float g0 = ${G0.toFixed(1)};
        float bay = fract((((abs(vON.x) > 0.5 ? vLoc.z : vLoc.x) + 0.5) * c.W) / 4.5);
        float pane = step(0.35, c.y) * step(c.y, g0 - 1.1) * step(0.06, bay) * step(bay, 0.94);
        vec3 inside = mix(vec3(1.0, 0.8, 0.55), vec3(0.8, 0.92, 1.0), step(0.7, hB)) * (0.5 + 0.5 * h21(vec2(floor(bay * 9.0), seed)));
        col = mix(base * 0.5, mix(vec3(0.05), inside * 0.25, 1.0 - broken), pane);
        col = mix(col, vec3(0.06, 0.055, 0.055), step(g0 - 1.1, c.y));
        totalEmissiveRadiance += pane * inside * vec3(0.9, 0.72, 0.55) * on * (1.0 - broken * 0.9);
      }
      col = mix(col, base * 0.3, smoothstep(vS.w - 2.5, vS.w - 2.3, c.y));
      // lit floors: most offices still lit at dusk, warm and cool white, some blue TV light in the flats
      float lit = step(r, 0.25 + 0.5 * step(floorR, 0.5 + 0.3 * hB)) * c.ok * (1.0 - c.ground);
      vec3 warm = mix(vec3(1.0, 0.74, 0.46), vec3(0.82, 0.9, 1.0), step(0.6, h21(vec2(c.id.y, seed))));
      if (kind > 2.5) warm = mix(warm, vec3(0.45, 0.6, 1.0), step(0.85, r));
      float e = mix(win * lit * (0.5 + 0.7 * r), 0.16 * c.ok * (0.6 + 0.4 * hB), c.far) * on * (1.0 - 0.45 * broken);
      totalEmissiveRadiance += e * warm * 0.75;
      diffuseColor.rgb = col;
    } else {
      diffuseColor.rgb = base * 0.3 + 0.02 * h21(floor(vWP.xz * 0.5));
      // the red aircraft-warning lights on the tall roofs
      vec2 rq = abs(vLoc.xz) - 0.44;
      float rl = step(80.0, vS.w) * step(0.0, rq.x) * step(0.0, rq.y) * (0.6 + 0.4 * sin(uTime * 3.0 + seed));
      totalEmissiveRadiance += vec3(3.0, 0.15, 0.08) * rl * on;
    }
    float n = h21(floor(vWP.xz * 1.3) + floor(vWP.y * 1.3));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.29, 0.26) * (0.75 + 0.5 * n), rubble);
    totalEmissiveRadiance *= 1.0 - rubble;
    totalEmissiveRadiance += purpleGlow(vWP);
  }
`;

export function facadeMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, CU, FU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aT; attribute vec4 aS; attribute vec4 aC; attribute vec3 aHome;
        varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vT; varying vec4 vS; varying vec3 vON; varying vec4 vC; varying vec3 vHome;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vLoc = position; vON = normal; vT = aT; vS = aS; vC = aC; vHome = aHome;
        vSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vec4 wpp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWP = wpp.xyz;
        vWN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * (normal / (vSc * vSc)));`);
    shader.fragmentShader = PARS + shader.fragmentShader
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + CUT)
      .replace('#include <emissivemap_fragment>', LOOK);
  };
  m.customProgramCacheKey = () => 'gojo-facade-v1';
  return m;
}

// ---- which buildings the purples cut through, and the pieces that fall ----
export const PIECES = [];     // { b, kind: 'top' | 'tower', yOff, h, t0, ... }
const R = rng(404);
for (const b of B) {
  b.cut = null;
  for (let k = 0; k < PURPLES.length; k++) {
    const P = PURPLES[k];
    const dxz = Math.hypot(P.d.x, P.d.z), ux = P.d.x / dxz, uz = P.d.z / dxz;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, c]) => [b.x + a * b.w / 2 - P.p0.x, b.z + c * b.d / 2 - P.p0.z]);
    const qs = corners.map(([x, z]) => Math.abs(x * uz - z * ux));
    const ss = corners.map(([x, z]) => x * ux + z * uz);
    const qc = Math.abs((b.x - P.p0.x) * uz - (b.z - P.p0.z) * ux);
    const qmax = Math.max(...qs), qmin = Math.min(qc, ...qs);
    if (Math.min(...ss) < -P.R * 0.5 || Math.max(...ss) > P.len) continue;
    const top = P.yc + Math.sqrt(Math.max(0, P.R * P.R - qmin * qmin));
    if (qmax < P.R * 0.96 && b.h > top + 6 && !b.cut) {
      const sMax = Math.max(...ss);
      const vPass = P.fire + 0.2 + (sMax + P.R) / P.speed;
      const floor = P.yc - Math.sqrt(Math.max(0, P.R * P.R - qc * qc));
      b.cut = { k, y: P.yc, t: vPass };
      PIECES.push({ b, kind: 'top', yOff: top, h: b.h - top, t0: vPass, floor: Math.min(floor, 0), seed: R(), k });
    }
  }
}
// the tower at the end of the avenue: Red takes out its middle; the top tips back and falls
TOWER_B.cut = { k: -1, y: 52, t: V_RED_HIT + 0.05 };
PIECES.push({ b: TOWER_B, kind: 'tower', yOff: 80, h: TOWER_B.h - 80, t0: V_RED_HIT + 0.05, floor: 0, seed: 0.3 });

// glass: when each building's windows burst (Red's blast, late by the distance at the speed of sound)
for (const b of B) {
  b.glass = 1e9;
  const { s, q } = redPerp(b.x, 30, b.z);
  if (s > -60 && s < RED_LEN + 60) {
    const dq = Math.max(0, q - Math.max(b.w, b.d) / 2);
    if (dq < GLASS_R(s)) b.glass = vRedAt(s) + dq / 343;
  }
}

export function makeCity(scene) {
  const n = B.length + PIECES.length;
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const aT = new Float32Array(n * 4), aS = new Float32Array(n * 4), aC = new Float32Array(n * 4), aH = new Float32Array(n * 3);
  B.forEach((b, i) => {
    aT.set([b.glass, 1e9, 1e9, 1], i * 4);
    aS.set([b.seed, b.kind, b.colW, b.h], i * 4);
    aC.set(b.cut ? [1, b.cut.y, b.cut.t, 0] : [0, 0, 1e9, 0], i * 4);
    aH.set([b.x, 0, b.z], i * 3);
  });
  PIECES.forEach((p, j) => {
    const i = B.length + j, b = p.b;
    p.i = i;
    aT.set([b.glass, 1e9, p.kind === 'tower' ? p.t0 + 3.2 : 1e9, 4.5], i * 4);
    aS.set([b.seed, b.kind, b.colW, b.h], i * 4);
    aC.set([2, 0, p.t0, p.yOff], i * 4);
    aH.set([b.x, 0, b.z], i * 3);
  });
  geo.setAttribute('aT', new THREE.InstancedBufferAttribute(aT, 4));
  geo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
  geo.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 4));
  geo.setAttribute('aHome', new THREE.InstancedBufferAttribute(aH, 3));
  const mat = facadeMaterial();
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.frustumCulled = false;
  const m4 = new THREE.Matrix4(), mS = new THREE.Matrix4(), col = new THREE.Color();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  B.forEach((b, i) => { mesh.setMatrixAt(i, m4.makeTranslation(b.x, 0, b.z).multiply(mS.makeScale(b.w, b.h, b.d))); mesh.setColorAt(i, col.set(b.col)); });
  PIECES.forEach((p) => { mesh.setMatrixAt(p.i, zero); mesh.setColorAt(p.i, col.set(p.b.col)); });
  scene.add(mesh);

  const q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), piv = new THREE.Vector3();
  // where a piece is at v: { y (bottom), tilt (rad, about x for the tower; about a random axis for the tops), crush }
  function pieceAt(p, v) {
    const dt = v - p.t0;
    if (p.kind === 'tower') {
      // tips back (away from you) about its back edge as it drops into the gap, then crumbles into its own dust
      const tilt = 0.5 * 0.22 * dt * dt;
      const drop = Math.min(0.5 * 6.5 * dt * dt, p.yOff - 20);
      return { y: p.yOff - drop, tilt: Math.min(tilt, 1.25), crush: smooth(3.2, 7.5, dt) };
    }
    const fall = p.yOff - p.floor;
    const tLand = Math.sqrt(2 * fall / 9.8);
    const d = Math.min(0.5 * 9.8 * dt * dt, fall);
    return { y: p.yOff - d, tilt: (0.04 + 0.1 * p.seed) * dt, crush: smooth(tLand - 0.05, tLand + 1.4, dt), tLand };
  }
  return {
    mesh, mat, pieceAt,
    frame(v, smoke) {
      for (const p of PIECES) {
        if (v < p.t0) { mesh.setMatrixAt(p.i, zero); continue; }
        const b = p.b, s = pieceAt(p, v);
        const hNow = p.h * (1 - 0.72 * s.crush);
        if (p.kind === 'tower') {
          // pivot at the east-bottom edge of the top piece: it tips over sideways (you see it go from the avenue)
          piv.set(b.x + b.w / 2, s.y, b.z);
          m4.makeTranslation(piv.x, piv.y, piv.z);
          m4.multiply(mS.makeRotationZ(-s.tilt));
          m4.multiply(mS.makeTranslation(-b.w / 2, 0, 0));
          m4.multiply(mS.makeScale(b.w, hNow, b.d));
        } else {
          e.set(s.tilt * (p.seed - 0.5), 0, s.tilt * 0.6 * (0.5 - p.seed)); q.setFromEuler(e);
          m4.compose(pos.set(b.x, s.y, b.z), q, sc.set(b.w, hNow, b.d));
        }
        mesh.setMatrixAt(p.i, m4);
        // dust where it lands / where it breaks
        if (smoke && s.crush > 0 && s.crush < 1) {
          const k = s.crush;
          for (let j = 0; j < 10; j++) {
            const a = j / 10 * 6.283 + p.seed * 9;
            const rr = Math.max(b.w, b.d) * (0.4 + 0.9 * k);
            smoke.puff(b.x + Math.cos(a) * rr, Math.max(s.y, p.floor) + 4 + 18 * k * (0.5 + 0.5 * Math.sin(j * 2.1)), b.z + Math.sin(a) * rr, 9 + 22 * k, 0.55 * (1 - k * 0.6), 0.35, 0, p.seed + j);
          }
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      FU.uBlueCut.value = Math.max(0, blueR(v) - 1.5);
      FU.uRedS.value = v < V_RED ? -1 : redFront(v);
    },
  };
}

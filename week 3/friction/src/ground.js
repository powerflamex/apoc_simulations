// The ground: one heightfield over the hill and the flat waterfront, its height and look drawn in the shader from
// world position: asphalt with the cable car tracks (two rails and the cable slot), lane lines, crosswalks, scored
// concrete sidewalks, gardens behind the houses, the turntable plaza, the lawn and the promenade at the bottom.
// When the hillside lets go (uD = how far it has slid) the street's pattern slides down with it (it is drawn at
// z - uD), the slab rides out over the lower street 6 m thick with a nose of churned earth (surfaceY in
// timeline.js, mirrored here), cracks open (uCrack), the surface breaks into tilting blocks, and the bed it left
// behind shows bare earth.
import * as THREE from 'three';
import { GRADE, Z_FOOT, Z_EDGE, S1, RR, SLAB } from './timeline.js';
import { ST, CROSS } from './layout.js';

export const GU = { uD: { value: 0 }, uCrack: { value: 0 }, uDust: { value: 0 }, uTime: { value: 0 } };

const FUNCS = /* glsl */ `
uniform float uD; uniform float uCrack; uniform float uDust; uniform float uTime;
float gh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(gh(i), gh(i+vec2(1,0)), f.x), mix(gh(i+vec2(0,1)), gh(i+vec2(1,1)), f.x), f.y); }
float sm(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float hillY(float z) {
  float s = ${Z_FOOT.toFixed(1)} - z;
  if (s <= 0.0) return 0.0;
  if (s < 6.0) return ${GRADE} * s * s / 12.0;
  if (s < ${S1.toFixed(1)}) return ${GRADE} * (s - 3.0);
  if (s < ${(S1 + RR).toFixed(1)}) return ${GRADE} * ${(S1 - 3).toFixed(1)} + ${GRADE} * (s - ${S1.toFixed(1)}) * (1.0 - (s - ${S1.toFixed(1)}) / ${(2 * RR).toFixed(1)});
  return ${GRADE} * ${(S1 - 3 + RR / 2).toFixed(1)};
}
float surfY(float z, float D) {
  float y = hillY(z);
  if (D <= 0.0) return y;
  float front = min(${SLAB.toe.toFixed(1)} + D, ${(Z_EDGE + 1).toFixed(1)});
  float grow = min(1.0, D / 25.0);
  float ride = sm(${SLAB.toe.toFixed(1)}, ${(SLAB.toe + 25).toFixed(1)}, z) * (1.0 - sm(front - 10.0, front + 0.5, z));
  float nose = 2.4 * exp(-pow((z - (front - 8.0)) / 4.5, 2.0)) * sm(10.0, 30.0, D) * step(z, ${(Z_EDGE + 0.5).toFixed(1)});
  float bed = z < ${SLAB.head.toFixed(1)} + D ? -${SLAB.th.toFixed(1)} * sm(${SLAB.head.toFixed(1)}, ${SLAB.head.toFixed(1)} + 8.0, z) : 0.0;
  return y + ${SLAB.th.toFixed(1)} * grow * ride + nose + bed;
}
// the slab's material coordinate (where this bit of ground was before it slid) and whether it is part of the slab
float onSlab(float z) { return uD > 0.0 && z > ${SLAB.head.toFixed(1)} + uD && z < min(${SLAB.toe.toFixed(1)} + uD, ${(Z_EDGE + 1).toFixed(1)}) ? 1.0 : 0.0; }
// the moving slab breaks into blocks that tilt and grind against each other
float rumple(vec2 p, float k) {
  vec2 c = floor(p / vec2(9.0, 7.0));
  float r = gh(c);
  return k * ((r - 0.5) * 0.9 + (gn(p * 0.35) - 0.5) * 0.8);
}
`;

const LOOK = /* glsl */ `
  #include <color_fragment>
  {
    float slab = onSlab(vGP.z);
    vec2 p = vec2(vGP.x, vGP.z - uD * slab);          // the pattern rides with the ground
    float ax = abs(p.x);
    float w = max(fwidth(p.x), fwidth(p.y)) * 0.7 + 0.004;
    float grain = gn(p * 3.1) * 0.5 + gn(p * 19.0) * 0.5;
    vec3 asphalt = vec3(0.12, 0.118, 0.12) * (0.82 + 0.3 * grain) * (0.92 + 0.16 * gn(p * 0.07));
    vec3 concrete = vec3(0.6, 0.57, 0.53) * (0.86 + 0.2 * grain);
    vec3 col = asphalt;
    float mark = 0.0;
    // nearest cross street
    float zc = ${CROSS.z[0].toFixed(1)}, d0 = 1e9;
    ${CROSS.z.map((c) => `if (abs(p.y - (${c.toFixed(1)})) < d0) { d0 = abs(p.y - (${c.toFixed(1)})); zc = ${c.toFixed(1)}; }`).join('\n    ')}
    float adz = abs(p.y - zc);
    float hw = ${(CROSS.w / 2).toFixed(1)};
    #define BAND(x, a, b) (sm((a) - w, (a) + w, x) * (1.0 - sm((b) - w, (b) + w, x)))
    if (p.y > ${Z_EDGE.toFixed(1)} - 8.0 && p.y < ${Z_EDGE.toFixed(1)} + 2.0) {
      // the promenade along the seawall
      vec2 t = fract(p / vec2(2.0, 1.0));
      col = concrete * 1.05 * (1.0 - 0.18 * max(BAND(t.x, -0.02, 0.02), BAND(t.y, -0.03, 0.03)));
    } else if (p.y > 0.0 && p.y <= ${Z_EDGE.toFixed(1)} - 8.0) {
      if (p.x > 10.5) col = mix(vec3(0.16, 0.26, 0.08), vec3(0.26, 0.36, 0.12), grain) * (0.85 + 0.3 * gn(p * 0.2));   // the lawn
      else if (p.x < -10.5) col = vec3(0.42, 0.38, 0.34) * (0.8 + 0.3 * grain);
      else {
        // red brick paving round the cable car turntable
        vec2 b = fract(p / vec2(0.4, 0.2) + vec2(0.0, floor(p.x / 0.4) * 0.5));
        col = vec3(0.5, 0.25, 0.18) * (0.75 + 0.35 * gh(floor(p / vec2(0.4, 0.2)))) * (1.0 - 0.3 * max(BAND(b.x, -0.04, 0.04), BAND(b.y, -0.06, 0.06)));
        float r = length(p - vec2(${ST.tracks.toFixed(1)}, 9.0));
        col = mix(col, vec3(0.3, 0.29, 0.28), BAND(r, 0.0, 3.4));
        col = mix(col, vec3(0.62, 0.6, 0.56), BAND(r, 3.3, 3.5));
      }
    } else if (adz < hw && ax > ${ST.road.toFixed(1)}) {
      // a cross street (asphalt running east-west); zebra across it at the corners
      col = asphalt;
      mark += BAND(ax, ${(ST.road + 0.4).toFixed(1)}, ${(ST.walk - 0.2).toFixed(1)}) * step(0.5, fract(adz / 1.0)) * step(adz, hw - 0.6);
      mark += BAND(p.y - zc, -0.08, 0.08) * step(0.4, fract(ax / 8.0)) * step(ax, 1200.0);
    } else if (ax < ${ST.road.toFixed(1)}) {
      // the main street: the cable car tracks, lane lines, the parking lanes, zebra across it at each crossing
      float tx = abs(ax - ${ST.tracks.toFixed(1)});
      vec3 bed = vec3(0.3, 0.29, 0.27) * (0.85 + 0.25 * grain);
      col = mix(col, bed, BAND(tx, -1.0, 0.85) * 0.75);
      float rail = BAND(tx, ${(RAIL_HALF() - 0.04).toFixed(3)}, ${(RAIL_HALF() + 0.04).toFixed(3)});
      col = mix(col, vec3(0.75, 0.72, 0.68), rail);
      col = mix(col, vec3(0.02), BAND(tx, -0.012, 0.012));                   // the slot the cable runs in
      if (adz > hw) {
        float yel = BAND(ax, 0.06, 0.16);
        col = mix(col, vec3(0.86, 0.66, 0.15), yel);
        mark += BAND(ax, 5.0, 5.12) * step(fract(p.y / 6.0), 0.5);
      } else {
        mark += BAND(adz, hw - 3.4, hw - 0.4) * step(0.5, fract(ax / 1.1)) * step(0.9, tx);
      }
    } else if (ax < ${ST.walk.toFixed(1)} || (adz < hw + 3.5 && adz > hw)) {
      // sidewalks: scored squares, a lighter curb
      vec2 t = fract(p / 1.5);
      col = concrete * (0.9 + 0.12 * gh(floor(p / 1.5))) * (1.0 - 0.22 * max(BAND(t.x, -0.02, 0.02), BAND(t.y, -0.02, 0.02)));
      col = mix(col, concrete * 1.2, BAND(ax, ${ST.road.toFixed(1)}, ${(ST.road + 0.25).toFixed(2)}) * step(hw, adz));
    } else {
      // gardens and yards behind the houses; the hillside beyond
      col = mix(vec3(0.17, 0.22, 0.09), vec3(0.32, 0.3, 0.17), gn(p * 0.15)) * (0.75 + 0.4 * grain);
    }
    col = mix(col, vec3(0.88, 0.87, 0.82) * (0.85 + 0.2 * grain), clamp(mark, 0.0, 1.0) * 0.9);

    // ---- the hillside giving way ----
    vec3 earth = mix(vec3(0.33, 0.25, 0.17), vec3(0.45, 0.36, 0.25), grain) * (0.7 + 0.5 * gn(vGP.xz * 0.5));
    // cracks across the street and along it, opening wider (in the slab's own coordinates: they ride with it)
    if (uCrack > 0.0) {
      float cr = 0.0;
      for (int i = 0; i < 7; i++) {
        float zc2 = -505.0 + float(i) * -0.0 + float(i) * 52.0 + 8.0 * sin(float(i) * 4.1);
        float zz = p.y - zc2 - 3.0 * (gn(vec2(p.x * 0.25, float(i) * 7.0)) - 0.5) - 0.8 * (gn(vec2(p.x * 1.7, float(i))) - 0.5);
        float wd = (0.04 + 0.32 * uCrack) * (0.6 + 0.8 * gn(vec2(p.x * 0.3, float(i) * 3.0)));
        cr = max(cr, 1.0 - smoothstep(wd * 0.5, wd * 0.5 + w * 2.0, abs(zz)));
      }
      float xc = abs(p.x - 6.4 - 1.5 * (gn(vec2(p.y * 0.2, 2.0)) - 0.5));
      cr = max(cr, (1.0 - smoothstep(0.1 + 0.25 * uCrack, 0.1 + 0.25 * uCrack + w * 2.0, xc)) * step(p.y, -170.0) * uCrack);
      col = mix(col, vec3(0.04, 0.03, 0.02), cr * clamp(uCrack * 3.0, 0.0, 1.0));
    }
    // the nose of the slab and the bed it left: churned earth, broken asphalt
    float front = min(${SLAB.toe.toFixed(1)} + uD, ${(Z_EDGE + 1).toFixed(1)});
    float churn = uD > 0.0 ? sm(front - 16.0, front - 5.0, vGP.z) * step(vGP.z, front + 1.0) : 0.0;
    float chunk = step(0.62, gn(vGP.xz * 0.9 + uTime * 0.0));
    col = mix(col, mix(earth, asphalt * 1.2, chunk * 0.5), churn);
    if (uD > 0.0 && vGP.z < ${SLAB.head.toFixed(1)} + uD) col = earth * 0.9;
    // the gap where the slab rode up over the ground below its old toe: torn earth along its edge
    col = mix(col, earth, uD > 0.0 ? BAND(vGP.z - ${SLAB.toe.toFixed(1)}, -1.5, 4.0) * sm(0.0, 6.0, uD) : 0.0);
    col = mix(col, vec3(0.5, 0.44, 0.37) * (0.8 + 0.3 * grain), uDust * 0.35);
    diffuseColor.rgb = col;
  }
`;

function RAIL_HALF() { return 0.535; }

export function groundMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, GU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGP;\n' + FUNCS)
      .replace('#include <beginnormal_vertex>', `
        vec3 gw = (modelMatrix * vec4(position, 1.0)).xyz;
        float sl = onSlab(gw.z);
        vec2 mp = vec2(gw.x, gw.z - uD * sl);
        float k = sl * sm(0.0, 8.0, uD);
        float yA = surfY(gw.z, uD) + rumple(mp, k);
        float yX = surfY(gw.z, uD) + rumple(mp + vec2(0.6, 0.0), k);
        float yZ = surfY(gw.z + 0.6, uD) + rumple(mp + vec2(0.0, 0.6), k);
        vec3 objectNormal = normalize(vec3(-(yX - yA) / 0.6, 1.0, -(yZ - yA) / 0.6));`)
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position.x, yA - gw.y + position.y, position.z);`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vGP = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = 'varying vec3 vGP;\n' + FUNCS + shader.fragmentShader.replace('#include <color_fragment>', LOOK);
  };
  m.customProgramCacheKey = () => 'friction-ground-v1';
  return m;
}

// rows of the grid: fine where the slab's front runs, coarser far up the hill and behind the top
function rows() {
  const out = [];
  for (let z = -800; z < -560; z += 4) out.push(z);
  for (let z = -560; z < -172; z += 1.5) out.push(z);
  for (let z = -172; z <= Z_EDGE + 0.01; z += 0.6) out.push(z);
  if (out[out.length - 1] < Z_EDGE) out.push(Z_EDGE);
  return out;
}
function cols() {
  const out = [];
  for (let x = -600; x < -60; x += 12) out.push(x);
  for (let x = -60; x < -12; x += 2) out.push(x);
  for (let x = -12; x < 12; x += 0.75) out.push(x);
  for (let x = 12; x < 60; x += 2) out.push(x);
  for (let x = 60; x <= 600; x += 12) out.push(x);
  return out;
}

export function makeGround(scene) {
  const mat = groundMaterial();
  const Z = rows(), X = cols();
  const pos = new Float32Array(Z.length * X.length * 3);
  let n = 0;
  for (const z of Z) for (const x of X) { pos[n++] = x; pos[n++] = 0; pos[n++] = z; }
  const idx = [];
  for (let j = 0; j < Z.length - 1; j++) for (let i = 0; i < X.length - 1; i++) {
    const a = j * X.length + i, b = a + 1, c = a + X.length, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true; mesh.frustumCulled = false;
  scene.add(mesh);
  // the seawall's face, down to the water
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1400, 3.2, 0.8).translate(0, -1.2, Z_EDGE + 0.4), new THREE.MeshStandardMaterial({ color: 0x8c8780, roughness: 0.95 }));
  wall.receiveShadow = true;
  scene.add(wall);
  return { mesh, mat, wall };
}

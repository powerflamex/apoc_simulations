// Your umbrella: a blue-and-white canopy of 8 panels on 8 steel ribs with their stretchers, a shaft, a hooked handle.
// Built round its top (the apex, the local origin) with the shaft down local -y. The canopy is a grid in (r, a) that the
// vertex shader shapes every frame (the same function for the fabric, the ribs and their shadow):
//   uFlip   0 a dome .. 1 blown inside out into a cup        uFlut   wind ripples running across the fabric
//   uBend   ribs bent and snapped every which way            uShred  the fabric torn away in ragged pieces (Neptune)
//   uBurn   burnt away from the rim inward, a glowing edge   uScorch charred and holed round the top (lightning)
//   uFrost / uDust / uWet: rime, red Martian dust, a wet sheen
//   uCrack  frozen stiff, cracks running through it         uShatter it breaks into shards like glass (Titan)
import * as THREE from 'three';

const NR = 16, NA = 96;
export const RAD = 0.7;          // canopy radius (m): a big beach-and-rain umbrella
export const GRIP = 0.95;         // from the apex down to where your hand holds the shaft (m)

const SHAPE = /* glsl */ `
uniform float uFlip; uniform float uFlut; uniform float uBend; uniform float uShred; uniform float uBurn; uniform float uScorch;
uniform float uT; uniform vec3 uWindL;
const float PI_ = 3.14159265, TAU_ = 6.2831853;
float uh(float x) { return fract(sin(x * 127.1) * 43758.5453); }
float un(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(uh(i), uh(i + 1.0), f); }
vec3 canopy(float r, float a) {
  float R = ${RAD.toFixed(3)};
  float pa = mod(a, TAU_ / 8.0) / (TAU_ / 8.0);
  float mid = sin(pa * PI_);                           // 1 in the middle of a panel, 0 on a rib
  float rib = floor(a / (TAU_ / 8.0) + 0.5);
  float rr = r * R * (1.0 - 0.05 * mid * r);
  float y = -0.4 * R * r * r * (1.0 - 0.08 * mid * r);
  // inside out: the ribs spring up into a cup, the fabric bellies between them
  float yf = 0.52 * R * pow(r, 1.25) - 0.05 * R * mid * r;
  y = mix(y, yf, uFlip);
  rr *= mix(1.0, 0.84 + 0.05 * mid, uFlip);
  // wind ripples
  y += uFlut * r * r * (0.045 * sin(a * 8.0 + uT * 29.0 + r * 7.0) + 0.025 * sin(a * 3.0 - uT * 21.0 + 1.3)) * (0.35 + mid);
  vec3 p = vec3(cos(a) * rr, y, sin(a) * rr);
  // bent and snapped ribs: each rib (and the cloth on it) thrown its own way
  float ra = floor(a / (TAU_ / 8.0)) + step(0.5, pa);
  float s1 = uh(ra + 3.1), s2 = uh(ra + 7.7);
  p.y += uBend * r * r * R * (0.9 * (s1 - 0.35) + 0.25 * sin(uT * 23.0 + ra * 2.0));
  p.xz += uBend * r * r * R * 0.5 * vec2(s2 - 0.5, uh(ra + 1.9) - 0.5);
  // the wind drags the cloth downwind, more at the rim
  p += uWindL * r * r * (uFlut * 0.04 + uBend * 0.25 + uShred * 0.12 * (0.6 + 0.4 * sin(uT * 37.0 + a * 5.0)));
  return p;
}
`;

const NOISE = /* glsl */ `
float cn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453), b = fract(sin(dot(i + vec2(1,0), vec2(127.1, 311.7))) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0,1), vec2(127.1, 311.7))) * 43758.5453), d = fract(sin(dot(i + vec2(1,1), vec2(127.1, 311.7))) * 43758.5453);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
float cf(vec2 p) { return cn(p) * 0.55 + cn(p * 2.3 + 4.0) * 0.3 + cn(p * 5.1 + 9.0) * 0.15; }
// angular shards: (distance to the nearest cell point, how close to a crack between cells, the shard's own number)
vec3 shard(float r, float a) {
  vec2 x = vec2(a * 3.0, r * 5.5);
  vec2 n = floor(x), f = fract(x);
  float d1 = 8.0, d2 = 8.0; vec2 id = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = vec2(fract(sin(dot(n + g, vec2(127.1, 311.7))) * 43758.5453), fract(sin(dot(n + g, vec2(269.5, 183.3))) * 43758.5453));
    vec2 rr = g + o - f;
    float d = max(abs(rr.x), abs(rr.y)) * 0.6 + length(rr) * 0.4;
    if (d < d1) { d2 = d1; d1 = d; id = n + g; } else if (d < d2) d2 = d;
  }
  return vec3(d1, d2 - d1, fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453));
}
// what's left of the cloth at (r, a): < 0 means burnt or torn away
float clothLeft(float r, float a) {
  float pa = mod(a, 6.2831853 / 8.0) / (6.2831853 / 8.0);
  float mid = sin(pa * 3.14159265);
  float burn = (1.15 - uBurn * 1.4 + 0.2 * (cf(vec2(a * 2.2, r * 3.0)) - 0.5)) - r;
  float tear = cf(vec2(a * 3.3 + 2.0, r * 5.0)) + 0.35 * (1.0 - mid) - uShred * 1.25;
  float hole = cf(vec2(a * 4.0, r * 7.0) + 11.0) - 0.08 - 0.3 * uScorch * (1.0 - 0.5 * smoothstep(0.2, 0.8, r)) + 0.5 * step(uScorch, 0.01);
  float sh = uShatter > 0.0 ? shard(r, a).z - uShatter * 1.12 + 0.1 * (1.0 - r) : 1.0;
  return min(min(burn, sh), min(tear, hole));
}
`;

export function makeUmbrella(scene) {
  const U = {
    uFlip: { value: 0 }, uFlut: { value: 0 }, uBend: { value: 0 }, uShred: { value: 0 }, uBurn: { value: 0 }, uScorch: { value: 0 },
    uFrost: { value: 0 }, uDust: { value: 0 }, uWet: { value: 0 }, uT: { value: 0 }, uWindL: { value: new THREE.Vector3() },
    uCrack: { value: 0 }, uShatter: { value: 0 },
  };
  // ---- the canopy grid ----
  const ra = new Float32Array((NR + 1) * (NA + 1) * 2), pos = new Float32Array((NR + 1) * (NA + 1) * 3);
  let k = 0;
  for (let i = 0; i <= NR; i++) for (let j = 0; j <= NA; j++) { ra[k * 2] = Math.pow(i / NR, 0.9); ra[k * 2 + 1] = (j / NA) * Math.PI * 2; k++; }
  const idx = [];
  for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) {
    const a = i * (NA + 1) + j, b = a + 1, c = a + NA + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const cGeo = new THREE.BufferGeometry();
  cGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  cGeo.setAttribute('aRA', new THREE.BufferAttribute(ra, 2));
  cGeo.setIndex(idx);
  const vertCanopy = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec2 aRA; varying vec2 vRA;\n${SHAPE}`)
      .replace('#include <beginnormal_vertex>', `vec3 objectNormal;
        { float e = 0.01; vec3 pr = canopy(aRA.x + e, aRA.y) - canopy(max(aRA.x - e, 0.0), aRA.y); vec3 pa = canopy(max(aRA.x, 0.02), aRA.y + e) - canopy(max(aRA.x, 0.02), aRA.y - e);
          objectNormal = normalize(cross(pa, pr)); }
        #ifdef USE_TANGENT
        vec3 objectTangent = vec3(1.0, 0.0, 0.0);
        #endif`)
      .replace('#include <begin_vertex>', 'vec3 transformed = canopy(aRA.x, aRA.y); vRA = aRA;');
  };
  const cMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0, side: THREE.DoubleSide });
  cMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    vertCanopy(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vRA; uniform float uFrost; uniform float uDust; uniform float uWet; uniform float uBurn; uniform float uScorch; uniform float uShred; uniform float uT; uniform float uCrack; uniform float uShatter;\n${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float left = clothLeft(vRA.x, vRA.y);
        if (left < 0.0) discard;
        {
          float r = vRA.x, a = vRA.y;
          float panel = mod(floor(a / (6.2831853 / 8.0)), 2.0);
          vec3 c = mix(vec3(0.06, 0.27, 0.8), vec3(0.93, 0.93, 0.9), panel);
          float pa = mod(a, 6.2831853 / 8.0) / (6.2831853 / 8.0);
          c *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.05, min(pa, 1.0 - pa)));     // seams over the ribs
          c = mix(c, c * 0.55, smoothstep(0.955, 0.975, r));                        // the hem
          float n = cf(vec2(a * 6.0, r * 9.0));
          // charred where lightning went through it; scorched along a burning edge
          float ch = uScorch * smoothstep(0.35, 0.8, n + 0.55 * (1.0 - r));
          c = mix(c, vec3(0.05, 0.04, 0.035), clamp(ch, 0.0, 1.0));
          c = mix(c, vec3(0.06, 0.045, 0.035), (1.0 - smoothstep(0.0, 0.12, left)) * step(0.001, uBurn));
          // dust, then rime over it, wet
          c = mix(c, vec3(0.62, 0.3, 0.15) * (0.8 + 0.4 * n), uDust * smoothstep(0.2, 0.7, n + 0.5 * uDust));
          c = mix(c, vec3(0.86, 0.92, 1.0), uFrost * (0.55 + 0.45 * n));
          c *= 1.0 - 0.28 * uWet;
          // frozen stiff: dark cracks running between the shards, a glassy glint along them
          if (uCrack > 0.0) {
            vec3 sv = shard(r, a);
            float line = 1.0 - smoothstep(0.0, 0.035, sv.y);
            float grown = step(sv.z * 0.8, uCrack);
            c = mix(c, vec3(0.1, 0.16, 0.26), line * grown * 0.9);
          }
          diffuseColor.rgb = c;
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.25, uWet);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(4.0, 1.3, 0.25) * (1.0 - smoothstep(0.0, 0.035, left)) * step(0.001, uBurn) * (0.7 + 0.3 * sin(uT * 40.0 + vRA.y * 9.0));`);
  };
  cMat.customProgramCacheKey = () => 'umb-canopy-2';
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  depth.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    vertCanopy(sh);
    sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', '').replace(/vec3 objectNormal;[\s\S]*?#endif/, '');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vRA; uniform float uBurn; uniform float uScorch; uniform float uShred; uniform float uShatter;\n${NOISE}`)
      .replace('void main() {', 'void main() {\n if (clothLeft(vRA.x, vRA.y) < 0.0) discard;');
  };
  depth.customProgramCacheKey = () => 'umb-depth-2';
  const canopy = new THREE.Mesh(cGeo, cMat);
  canopy.customDepthMaterial = depth;
  canopy.castShadow = true; canopy.receiveShadow = true; canopy.frustumCulled = false;

  // ---- ribs and stretchers: thin strips that follow the same shape ----
  const rPos = [], rAt = [], rIdx = [];
  const strip = (kind, ang) => {
    const base = rPos.length / 3;
    const N = 14;
    for (let i = 0; i <= N; i++) for (const s of [-1, 1]) { rPos.push(0, 0, 0); rAt.push(i / N, ang, s, kind); }
    for (let i = 0; i < N; i++) { const a = base + i * 2; rIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  };
  for (let r = 0; r < 8; r++) { strip(0, (r / 8) * Math.PI * 2 + 1e-4); strip(1, (r / 8) * Math.PI * 2 + 1e-4); }
  const rGeo = new THREE.BufferGeometry();
  rGeo.setAttribute('position', new THREE.Float32BufferAttribute(rPos, 3));
  rGeo.setAttribute('aRS', new THREE.Float32BufferAttribute(rAt, 4));
  rGeo.setIndex(rIdx);
  const ribVert = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec4 aRS;\n${SHAPE}
        vec3 ribAt(vec4 s) {
          if (s.w < 0.5) { vec3 p = canopy(s.x * 1.01, s.y); p.y -= 0.006; return p; }
          vec3 run = vec3(0.0, -0.38 + 0.22 * uFlip, 0.0);          // the runner slides up the shaft as it flips
          return mix(run, canopy(0.52, s.y) - vec3(0.0, 0.006, 0.0), s.x);
        }`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(1.0, 0.0, 0.0);\n#endif')
      .replace('#include <begin_vertex>', `vec3 transformed;
        { vec3 p0 = ribAt(aRS), p1 = ribAt(vec4(min(aRS.x + 0.05, 1.0), aRS.yzw)), p2 = ribAt(vec4(max(aRS.x - 0.05, 0.0), aRS.yzw));
          vec3 t = normalize(p1 - p2 + vec3(1e-5));
          vec3 sd = normalize(cross(t, vec3(0.0, 1.0, 0.0)) + vec3(1e-5));
          transformed = p0 + sd * aRS.z * (aRS.w < 0.5 ? 0.0055 : 0.0035); }`);
  };
  const rMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.35, metalness: 0.7, side: THREE.DoubleSide });
  rMat.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, U); ribVert(sh); };
  rMat.customProgramCacheKey = () => 'umb-ribs-1';
  const rDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  rDepth.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, U); ribVert(sh); sh.vertexShader = sh.vertexShader.replace(/vec3 objectNormal = [^\n]*\n#ifdef USE_TANGENT\n[^\n]*\n#endif/, ''); };
  rDepth.customProgramCacheKey = () => 'umb-rdepth-1';
  const ribs = new THREE.Mesh(rGeo, rMat);
  ribs.customDepthMaterial = rDepth;
  ribs.castShadow = true; ribs.frustumCulled = false;

  // ---- shaft, tip, handle ----
  const steel = new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.3, metalness: 0.8 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 1.1, 10).translate(0, -0.49, 0), steel);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.009, 0.09, 8).translate(0, 0.045, 0), steel);
  const hookCurve = new THREE.CatmullRomCurve3([[0, -0.92], [0, -1.08], [0.012, -1.13], [0.05, -1.15], [0.085, -1.13], [0.095, -1.08]].map(([x, y]) => new THREE.Vector3(x, y, 0)));
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x1d1a17, roughness: 0.55 });
  const handle = new THREE.Mesh(new THREE.TubeGeometry(hookCurve, 20, 0.014, 8, false), handleMat);
  for (const m of [shaft, tip, handle]) { m.castShadow = true; m.frustumCulled = false; }

  const group = new THREE.Group();
  group.add(canopy, ribs, shaft, tip, handle);
  scene.add(group);
  const tmp = new THREE.Vector3();
  return {
    group, U, canopy, ribs,
    // world position of a local point (after the group's matrix is up to date)
    at(out, x, y, z) { group.updateMatrixWorld(true); return out.set(x, y, z).applyMatrix4(group.matrixWorld); },
    tipWorld(out) { return this.at(out, 0, 0.09, 0); },
    gripWorld(out) { return this.at(out, 0, -GRIP, 0); },
    // a point on the canopy (for splashes, flames, frost): r 0..1, a radians; local only (no flip/bend)
    canopyPoint(out, r, a) {
      const rr = r * RAD * (1 - 0.05 * r), y = -0.4 * RAD * r * r;
      const f = U.uFlip.value, yf = 0.52 * RAD * Math.pow(r, 1.25);
      return this.at(out, Math.cos(a) * rr * (1 - 0.16 * f), y + (yf - y) * f, Math.sin(a) * rr * (1 - 0.16 * f));
    },
    tmp,
  };
}

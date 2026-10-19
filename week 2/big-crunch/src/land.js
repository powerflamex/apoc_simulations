// The land and the sea floor: one height field laid out along the shore (u = metres inland from the sea wall,
// negative out under the sea), dense where you stand. Its look is drawn from position: the sea floor (sand, then
// mud), the sea wall, the promenade's stone tiles, the road with its lane markings, the sidewalk and the city's
// lots, grassy hills inland. Later: uLand turns it all into bare, natural ground that slowly reshapes itself over
// millions of years (uMorph), the plants die (uGreen), the dried-up sea floor is crusted with salt (uSalt), and in
// the end the rock glows and melts under the giant Sun (uLava).
import * as THREE from 'three';
import { coastX, ROAD, PROM } from './layout.js';

export const LU = {
  uLand: { value: 0 }, uMorph: { value: 0 }, uGreen: { value: 1 }, uSalt: { value: 0 }, uLava: { value: 0 },
  uTime: { value: 0 }, uWet: { value: 0 }, uSeaY: { value: -2.4 }, uLampGlow: { value: 0 },
};

// height before anything changes: flat city, the sea wall, a gently sloping sea floor, hills far inland
export function baseHeight(u) {
  if (u >= 0) return u < 600 ? 0 : Math.pow(Math.min(u - 600, 6000) / 6000, 1.4) * 260;
  if (u > -0.05) return u * 60;                                   // the sea wall face
  return -3.0 - 0.022 * (-u) - 0.0006 * Math.max(0, -u - 6000);
}

const NOISE = /* glsl */ `
float lh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float ln(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(lh(i), lh(i+vec2(1,0)), f.x), mix(lh(i+vec2(0,1)), lh(i+vec2(1,1)), f.x), f.y); }
float lfbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * ln(p); p = p * 2.03 + 3.7; a *= 0.5; } return s; }
float band(float x, float a, float b, float w) { return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }
`;
// natural ground: a beach where the sea wall was, rolling land that drifts and reshapes as uMorph grows
const NAT = /* glsl */ `
float beachH(float u) { return u > 0.0 ? u * 0.02 : max(-3.0 - 0.022 * (-u), u * 0.15); }
float natH(vec2 xz, float u, float base) {
  float dYou = length(xz);
  float hills = (lfbm(xz * 0.0025 + vec2(uMorph * 0.7, uMorph * 0.4)) - 0.42) * 45.0 + (lfbm(xz * 0.02 + uMorph) - 0.5) * 4.0;
  float k = smoothstep(6.0, 450.0, dYou);
  float land = u > 0.0 ? beachH(u) + max(hills, -beachH(u) - 1.0) * k : beachH(u) + (hills * 0.1 - 2.0) * k;
  return mix(base, land, uLand);
}
`;

const PARS = NOISE + /* glsl */ `
uniform float uLand; uniform float uMorph; uniform float uGreen; uniform float uSalt; uniform float uLava; uniform float uTime; uniform float uWet; uniform float uSeaY; uniform float uLampGlow;
varying vec3 vGP; varying float vU;
`;

export function makeLand(scene) {
  // grid: u across the shore, z along it (both denser near you)
  const us = [];
  for (let u = 0; u < 30000; u += Math.max(1.0, u * 0.1)) us.push(u);
  us.push(30000);
  const neg = [-0.05];
  for (let u = 0.6; u < 90000; u += Math.max(1.2, u * 0.12)) neg.push(-u);
  neg.push(-90000);
  const U = [...neg.reverse(), ...us];
  const Z = [];
  for (let z = 600; z > -90000; z -= Math.max(1.5, Math.abs(z) * 0.07)) Z.push(z);
  Z.push(-90000);
  const nu = U.length, nz = Z.length;
  const pos = new Float32Array(nu * nz * 3), au = new Float32Array(nu * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nu; i++) {
    const k = j * nu + i, u = U[i], z = Z[j];
    pos[k * 3] = coastX(z) + u; pos[k * 3 + 1] = baseHeight(u); pos[k * 3 + 2] = z; au[k] = u;
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nu - 1; i++) {
    const a = j * nu + i, b = a + 1, c = a + nu, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aU', new THREE.BufferAttribute(au, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, LU);
    shader.vertexShader = PARS + NAT + 'attribute float aU;\n' + shader.vertexShader
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        if (uLand > 0.001) {
          float e = 1.5;
          float h0 = natH(position.xz, aU, position.y);
          float hx = natH(position.xz + vec2(e, 0.0), aU + e, position.y);
          float hz = natH(position.xz + vec2(0.0, e), aU, position.y);
          objectNormal = normalize(mix(objectNormal, normalize(vec3(h0 - hx, e, h0 - hz)), uLand));
        }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        if (uLand > 0.001) transformed.y = natH(position.xz, aU, position.y);
        vU = aU;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vGP = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = PARS + shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec2 p = vGP.xz;
        float u = vU;
        float w = max(fwidth(u), fwidth(p.y)) * 0.8 + 0.005;
        float grain = ln(p * 3.0) * 0.5 + ln(p * 17.0) * 0.5;
        float big = lfbm(p * 0.01);
        vec3 col;
        if (u < -0.04) {
          // the sea floor: pale sand near the shore, darker mud further out, ripples
          float rip = 0.5 + 0.5 * sin(dot(p, vec2(0.9, 0.4)) * 2.2 + ln(p * 0.3) * 6.0);
          col = mix(vec3(0.58, 0.52, 0.42), vec3(0.3, 0.3, 0.26), smoothstep(30.0, 900.0, -u)) * (0.85 + 0.2 * rip * (1.0 - smoothstep(50.0, 400.0, -u)) + 0.15 * big);
          col *= mix(1.0, 0.62, uWet * (1.0 - smoothstep(-0.5, 0.5, vGP.y - uSeaY - 0.3)));
          // salt crust once the sea has boiled away: white, cracked into plates
          vec2 q = p * 0.35;
          float cell = min(fract(q.x + ln(q * 0.5) * 0.6), fract(q.y + ln(q.yx * 0.5) * 0.6));
          vec3 salt = vec3(0.88, 0.86, 0.8) * (0.8 + 0.25 * big) * (1.0 - 0.45 * smoothstep(0.06, 0.0, cell));
          col = mix(col, salt, uSalt * smoothstep(0.0, 400.0, -u + 200.0 * big));
        } else if (u < 0.0) {
          col = vec3(0.42, 0.4, 0.37) * (0.8 + 0.3 * grain);                    // the sea wall
        } else if (u < ${(PROM.w).toFixed(1)}) {
          // the promenade: big light stone tiles
          vec2 t = fract(vec2(u, p.y) / 1.2);
          float joint = max(band(t.x, -0.02, 0.02, w * 2.0), band(t.y, -0.02, 0.02, w * 2.0));
          col = vec3(0.44, 0.4, 0.35) * (0.88 + 0.2 * lh(floor(vec2(u, p.y) / 1.2))) * (1.0 - 0.3 * joint) * (0.9 + 0.15 * grain);
          col = mix(col, vec3(0.4, 0.38, 0.35), band(u, ${(PROM.w - 0.6).toFixed(1)}, 13.0, w));
        } else if (u < ${ROAD.u1.toFixed(1)}) {
          col = vec3(0.11, 0.11, 0.115) * (0.8 + 0.35 * grain);
          float dash = step(fract(p.y / 9.0), 0.4);
          float mark = (band(u, 16.55, 16.7, w) + band(u, 21.35, 21.5, w)) * dash + band(u, 18.95, 19.1, w) + band(u, 19.2, 19.35, w);
          col = mix(col, mix(vec3(0.85, 0.84, 0.8), vec3(0.85, 0.65, 0.12), band(u, 18.9, 19.4, 0.01)), clamp(mark, 0.0, 1.0) * 0.85);
          col = mix(col, vec3(0.45, 0.43, 0.4), band(u, 12.9, 13.25, w));
        } else if (u < 28.5) {
          vec2 t = fract(vec2(u, p.y) / 0.6);
          float joint = max(band(t.x, -0.03, 0.03, w * 2.0), band(t.y, -0.03, 0.03, w * 2.0));
          col = vec3(0.48, 0.45, 0.41) * (0.85 + 0.25 * lh(floor(vec2(u, p.y) / 0.6))) * (1.0 - 0.25 * joint);
        } else if (u < 650.0) {
          col = vec3(0.27, 0.26, 0.25) * (0.8 + 0.3 * grain);                   // the city's lots and streets
        } else {
          col = mix(vec3(0.12, 0.17, 0.08), vec3(0.22, 0.24, 0.12), big) * (0.8 + 0.3 * grain);   // hills
        }
        // natural ground: scrub and grass while there is life, then bare dust and rock
        vec3 green = mix(vec3(0.17, 0.3, 0.08), vec3(0.36, 0.42, 0.14), big) * (0.75 + 0.4 * grain);
        vec3 bare = mix(vec3(0.52, 0.4, 0.29), vec3(0.66, 0.53, 0.38), big) * (0.75 + 0.4 * grain);
        vec3 nat = mix(bare, green, uGreen * smoothstep(-2.0, 1.0, vGP.y - uSeaY));
        if (u < 0.0) nat = mix(col, bare * 1.05, 1.0 - uGreen);
        col = mix(col, nat, uLand);
        if (u >= 600.0) col = mix(col, mix(bare, green, uGreen), 1.0 - uGreen);
        diffuseColor.rgb = col;
      }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      if (uLampGlow > 0.0 && vU > -0.1 && vU < 26.0) {
        // pools of warm light under the promenade lamps (every 18 m at u = 10.4) and along the road
        float kz = 24.0 - 18.0 * floor((24.0 - vGP.z) / 18.0 + 0.5);
        float d2 = pow(vU - 10.4, 2.0) + pow(vGP.z - kz, 2.0);
        totalEmissiveRadiance += vec3(1.0, 0.72, 0.42) * uLampGlow * (exp(-d2 / 28.0) * 0.35 + 0.02) * (1.0 - uLand);
      }
      if (uLava > 0.0) {
        // the rock melts: dark crust broken by glowing cracks, then a glowing sea of lava
        vec2 p = vGP.xz * 0.08;
        float cr = abs(lfbm(p + vec2(uTime * 0.05, 0.0)) - 0.5);
        float cr2 = abs(lfbm(p * 3.1 + 7.0) - 0.5);
        float glow = smoothstep(0.03 + 0.05 * uLava, 0.0, cr) + 0.5 * smoothstep(0.02 + 0.03 * uLava, 0.0, cr2) * uLava;
        glow += smoothstep(0.8, 1.0, uLava) * 0.25 * smoothstep(0.35, 0.0, cr);   // at the end the rock runs molten
        totalEmissiveRadiance += vec3(1.6, 0.42, 0.08) * glow * uLava;
        diffuseColor.rgb *= 1.0 - 0.75 * uLava;
      }`);
  };
  mat.customProgramCacheKey = () => 'land-v1';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { mesh, mat };
}

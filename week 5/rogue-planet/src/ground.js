// The street: asphalt, the scramble's zebra stripes (four sides and both diagonals), lane lines and stop lines,
// paved sidewalks with curbs, the coloured light the screens and shops throw on it; then the cracks that run across
// the crossing, the glowing fissure that tears open down the avenue, and the split that opens under you.
// The fissure and the split are shared with the water (it glows and steams over them).
import * as THREE from 'three';
import { POOLS, ROAD_X, ROAD_Z, FX, FZ, BAY_Z, CAM0 } from './layout.js';

export const NPOOL = POOLS.length;
export const GU = {
  uTime: { value: 0 }, uCracks: { value: 0 }, uFissure: { value: 0 }, uSplit: { value: 0 }, uLava: { value: 0 },
  uPoolP: { value: POOLS.map((p) => new THREE.Vector4(p.x, p.y, p.z, p.rad)) },
  uPoolC: { value: POOLS.map((p) => new THREE.Vector3(p.r, p.g, p.b)) },
  uPoolK: { value: 1 },
};

// the fissure's line down the avenue, how open it is at z (0..1), and the split's line toward you
export const CRACK_GLSL = /* glsl */ `
  float g21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(g21(i), g21(i + vec2(1, 0)), f.x), mix(g21(i + vec2(0, 1)), g21(i + vec2(1, 1)), f.x), f.y); }
  // distance to the nearest crack (cell edges of a jittered grid, warped)
  float crackD(vec2 p) {
    p += vec2(gn(p * 0.35), gn(p * 0.35 + 7.0)) * 2.2;
    vec2 i = floor(p / 3.2), f = p / 3.2 - i;
    float d1 = 9.0, d2 = 9.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 c = vec2(x, y) + vec2(g21(i + vec2(x, y)), g21(i + vec2(x, y) + 3.1));
      float d = length(c - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    return (d2 - d1) * 3.2;
  }
  // how far the cracks have spread to p (0 none .. 1), and their width
  float crackGrow(vec2 p, float k) { return uCracks * 70.0 - length(p - vec2(-2.0, -3.0)) * 0.9 - gn(p * 0.08) * 12.0; }
`;
export const RIFT_GLSL = /* glsl */ `
  uniform float uFissure; uniform float uSplit;
  float fisX(float z) { return 2.0 + 2.6 * sin(z * 0.013 + 0.6) + 0.9 * sin(z * 0.051); }
  // distance (m) to the open rift at p, and its half-width there (0 where it isn't open)
  vec2 rift(vec2 p) {
    float zEnd = mix(${BAY_Z.toFixed(1)}, -11.0, uFissure);
    float d = 1e4, w = 0.0;
    if (uFissure > 0.0 && p.y < zEnd + 6.0) {
      float x = fisX(p.y) + 0.35 * sin(p.y * 0.9) * 0.4;
      float tip = smoothstep(zEnd + 6.0, zEnd - 30.0, p.y);
      d = abs(p.x - x); w = (0.25 + 1.5 * uFissure) * tip * (0.8 + 0.2 * sin(p.y * 0.37));
    }
    if (uSplit > 0.0) {
      // from the end of the fissure, across the crossing, under you
      vec2 a = vec2(fisX(-11.0), -11.0), b = vec2(${(CAM0.x + 0.6).toFixed(1)}, ${(CAM0.z + 2.5).toFixed(1)});
      vec2 ab = b - a; float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
      float reach = smoothstep(0.0, 0.35, uSplit);
      vec2 q = a + ab * t;
      q.x += 1.2 * sin(t * 9.0) + 0.5 * sin(t * 23.0);
      float ds = length(p - q);
      float ws = (0.3 + 4.5 * smoothstep(0.25, 1.0, uSplit)) * step(t, reach * 1.02) * smoothstep(reach, reach - 0.05, t);
      if (ds - ws < d - w) { d = ds; w = ws; }
    }
    return vec2(d, w);
  }
  vec3 lavaGlow(float d, float w, float t) {
    if (w <= 0.0) return vec3(0.0);
    float core = 1.0 - smoothstep(w * 0.2, w, d);
    float halo = exp(-max(d - w, 0.0) / (0.8 + w));
    return vec3(3.6, 0.95, 0.16) * core * (0.8 + 0.2 * sin(t * 6.0 + d * 3.0)) + vec3(1.1, 0.25, 0.04) * halo * 0.6;
  }
`;

export function makeGround(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, GU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGW;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGW;
        uniform float uTime; uniform float uCracks; uniform float uLava;
        uniform vec4 uPoolP[${NPOOL}]; uniform vec3 uPoolC[${NPOOL}]; uniform float uPoolK;
        ${RIFT_GLSL}
        ${CRACK_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 P = vGW.xz;
        float aw = max(fwidth(P.x), fwidth(P.y));
        bool road = (abs(P.x) < ${ROAD_X.toFixed(1)} && P.y > ${BAY_Z.toFixed(1)}) || abs(P.y) < ${ROAD_Z.toFixed(1)};
        vec3 c;
        float paint = 0.0;
        if (road) {
          float n = gn(P * 3.0) * 0.5 + gn(P * 11.0) * 0.5;
          c = vec3(0.075, 0.075, 0.08) * (0.8 + 0.4 * n);
          // the scramble: stripes on all four sides and both diagonals
          float bx = abs(P.x), bz = abs(P.y);
          float sw = 0.5 + 0.5 * smoothstep(-aw, aw, sin(P.x * 3.14159 / 0.5));
          float swz = 0.5 + 0.5 * smoothstep(-aw, aw, sin(P.y * 3.14159 / 0.5));
          if (bx < ${ROAD_X.toFixed(1)} && bz > 6.4 && bz < 10.0) paint = max(paint, step(0.5, fract(P.x / 1.0)) * smoothstep(6.4, 6.5, bz));
          if (bz < ${ROAD_Z.toFixed(1)} && bx > 11.4 && bx < 15.0) paint = max(paint, step(0.5, fract(P.y / 1.0)) * smoothstep(11.4, 11.5, bx));
          if (bx < 11.0 && bz < 6.0) {
            vec2 dA = normalize(vec2(15.0, 10.0)), dB = normalize(vec2(-15.0, 10.0));
            float pA = dot(P, vec2(-dA.y, dA.x)), pB = dot(P, vec2(-dB.y, dB.x));
            if (abs(pA) < 1.8) paint = max(paint, step(0.5, fract(dot(P, dA) / 1.0)));
            if (abs(pB) < 1.8) paint = max(paint, step(0.5, fract(dot(P, dB) / 1.0)));
          }
          // lane lines and stop lines on the avenue and the cross street
          if (bz > 11.0 && bx < ${ROAD_X.toFixed(1)}) {
            float lane = min(abs(bx - 5.0), abs(bx - 10.0));
            paint = max(paint, (1.0 - smoothstep(0.07, 0.07 + aw, lane)) * step(0.5, fract(P.y / 8.0)));
            paint = max(paint, (1.0 - smoothstep(0.1, 0.1 + aw, abs(P.x))) * 0.8);
            paint = max(paint, 1.0 - smoothstep(0.25, 0.25 + aw, abs(bz - 11.4)));
          }
          if (bx > 16.0 && bz < ${ROAD_Z.toFixed(1)}) {
            float lane = abs(bz - 5.0);
            paint = max(paint, (1.0 - smoothstep(0.07, 0.07 + aw, lane)) * step(0.5, fract(P.x / 8.0)));
            paint = max(paint, (1.0 - smoothstep(0.1, 0.1 + aw, abs(P.y))) * 0.8);
          }
          c = mix(c, vec3(0.62, 0.62, 0.6) * (0.85 + 0.15 * gn(P * 20.0)), paint * 0.92);
        } else {
          // paving
          vec2 t = fract(P / 0.6);
          float joint = min(min(t.x, 1.0 - t.x), min(t.y, 1.0 - t.y));
          c = vec3(0.24, 0.23, 0.22) * (0.85 + 0.3 * g21(floor(P / 0.6)));
          c *= 0.7 + 0.3 * smoothstep(0.0, 0.04, joint);
          // the curb
          float curb = min(abs(abs(P.x) - ${ROAD_X.toFixed(1)}), abs(abs(P.y) - ${ROAD_Z.toFixed(1)}));
          c = mix(c, vec3(0.42, 0.41, 0.39), 1.0 - smoothstep(0.18, 0.2 + aw, curb));
        }
        // the cracks across the crossing (growing out from where the ground breaks first)
        float cr = 0.0;
        if (uCracks > 0.0) {
          float grow = crackGrow(P, uCracks);
          float cd = crackD(P);
          float wdt = 0.025 + 0.1 * smoothstep(0.0, 25.0, grow) + 0.25 * uLava;
          cr = (1.0 - smoothstep(wdt, wdt + aw * 1.5, cd)) * smoothstep(0.0, 4.0, grow);
          c = mix(c, vec3(0.012), cr);
        }
        diffuseColor.rgb = c;
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = road ? 0.38 + 0.25 * gn(P * 2.0) - paint * 0.05 : 0.6;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // light from the screens and shops
        {
          vec3 acc = vec3(0.0);
          for (int i = 0; i < ${NPOOL}; i++) {
            vec3 L = uPoolP[i].xyz - vGW;
            float d2 = dot(L, L);
            float rr = uPoolP[i].w * uPoolP[i].w;
            acc += uPoolC[i] * rr / (d2 + rr * 0.15) * (uPoolP[i].y / sqrt(d2 + 1.0)) * smoothstep(rr * 5.0, rr * 0.5, d2);
          }
          totalEmissiveRadiance += diffuseColor.rgb * acc * 0.55 * uPoolK;
        }
        // the cracks glow once the crust is torn; the fissure and the split
        vec2 rf = rift(P);
        totalEmissiveRadiance += vec3(2.2, 0.6, 0.12) * cr * uLava;
        if (rf.y > 0.0) {
          float open = 1.0 - smoothstep(rf.y - aw, rf.y + aw, rf.x);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.01), open);
          totalEmissiveRadiance += lavaGlow(rf.x, rf.y, uTime);
          // broken, scorched edges
          diffuseColor.rgb *= 1.0 - 0.7 * exp(-max(rf.x - rf.y, 0.0) / 0.8);
        }`);
  };
  mat.customProgramCacheKey = () => 'rogue-ground-v1';
  const geo = new THREE.PlaneGeometry(2400, 2400).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 0, -300);
  mesh.receiveShadow = true;
  scene.add(mesh);
  // curbs: thin raised edges along the road (the sidewalk itself is drawn flat)
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x6a6762, roughness: 0.7 });
  const curbs = [];
  for (const s of [-1, 1]) {
    curbs.push([s * ROAD_X, 0, (-ROAD_Z + BAY_Z) / 2, 0.25, -ROAD_Z - BAY_Z]);          // avenue, north
    curbs.push([s * ROAD_X, 0, (ROAD_Z + 300) / 2, 0.25, 300 - ROAD_Z]);                 // avenue, south
    curbs.push([s * 200, 0, -ROAD_Z, 370, 0.25]);
    curbs.push([s * 200, 0, ROAD_Z, 370, 0.25]);
  }
  const cg = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.15, 1).translate(0, 0.075, 0), curbMat, curbs.length);
  const m4 = new THREE.Matrix4();
  curbs.forEach(([x, , z, w, d], i) => cg.setMatrixAt(i, m4.makeScale(w, 1, d).setPosition(x, 0, z)));
  cg.frustumCulled = false;
  scene.add(cg);
  return { mesh, mat };
}

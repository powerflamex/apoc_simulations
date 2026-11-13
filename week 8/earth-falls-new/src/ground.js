// The ground: the avenue at noon (the paved plaza down the middle, two lanes each way, sidewalks), the quay at its end and
// the bay beyond. The heat, in the order it comes: a mirage on the road (the hot air over it bends the sky's light up off
// the far asphalt, like water); the tar going soft and glossy; the asphalt smoking; then everything that faces the Sun
// glowing dull red through a net of cracks, then orange. The bay: blue water with the Sun's glitter path, then steam
// (uSteam), then a rolling boil (uBoil).
import * as THREE from 'three';
import { ROAD_X, PROM, QUAY, FX, groundGLSL, SEA_Y, DROP } from './layout.js';
import { H, HEAT_GLSL } from './heat.js';

export const GU = {
  uTime: { value: 0 }, uMirage: { value: 0 }, uTar: { value: 0 }, uBoil: { value: 0 }, uSteam: { value: 0 }, uEnd: { value: 0 },
  uSkyHi: { value: new THREE.Color(0.1, 0.3, 0.78) }, uSkyLo: { value: new THREE.Color(0.62, 0.78, 0.95) }, uSun: { value: new THREE.Vector3(0.3, 0.6, 0.7) },
  uSunCol: { value: new THREE.Color(1, 0.9, 0.7) }, uSunA: { value: 0.02 },
  uHaze: { value: new THREE.Color(0.7, 0.8, 0.92) }, uHazeD: { value: 9000 },
};

const NOISE = /* glsl */ `
  float g21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(g21(i), g21(i + vec2(1, 0)), f.x), mix(g21(i + vec2(0, 1)), g21(i + vec2(1, 1)), f.x), f.y); }
  vec3 skyRef(vec3 r) { return mix(uSkyLo, uSkyHi, pow(clamp(r.y, 0.0, 1.0), 0.5)); }
  float vEdge(vec2 p) { vec2 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 o = vec2(float(x), float(y)); vec2 r = o + vec2(g21(i + o), g21(i + o + 31.0)) - f; float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
    return sqrt(d2) - sqrt(d1); }
`;

export function makeGround(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, GU, H);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGW;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { float z = (modelMatrix * vec4(position, 1.0)).z; transformed.y += ${groundGLSL('z')}; }`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGW;
        uniform float uTime; uniform float uMirage; uniform float uTar; uniform float uEnd;
        uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uHaze; uniform float uHazeD;
        ${HEAT_GLSL}
        ${NOISE}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 P = vGW.xz;
        float aw = max(fwidth(P.x), fwidth(P.y));
        float bx = abs(P.x);
        bool road = bx > ${PROM.toFixed(1)} && bx < ${ROAD_X.toFixed(1)} && P.y > ${(QUAY + 12).toFixed(1)};
        bool quay = P.y <= ${(QUAY + 12).toFixed(1)};
        vec3 c;
        float paint = 0.0;
        float n = gn(P * 3.0) * 0.5 + gn(P * 11.0) * 0.5;
        if (road) {
          c = vec3(0.2, 0.2, 0.21) * (0.85 + 0.3 * n);
          float lane = abs(bx - ${((PROM + ROAD_X) / 2).toFixed(1)});
          paint = max(paint, (1.0 - smoothstep(0.07, 0.07 + aw, lane)) * step(0.5, fract(P.y / 8.0)));
          float zc = abs(P.y + 30.0);
          paint = max(paint, step(zc, 2.0) * step(0.5, fract(P.x / 1.1)));
          // the tar softens: darker, glossy, the paint sinking into it
          c = mix(c, vec3(0.07, 0.065, 0.065), uTar * 0.75);
          c = mix(c, vec3(0.86, 0.86, 0.82), paint * 0.9 * (1.0 - 0.45 * uTar));
        } else if (bx <= ${PROM.toFixed(1)} || quay) {
          vec2 t = fract(P / vec2(2.4, 1.2));
          float joint = min(min(t.x, 1.0 - t.x) * 2.4, min(t.y, 1.0 - t.y) * 1.2);
          c = vec3(0.70, 0.64, 0.56) * (0.86 + 0.26 * g21(floor(P / vec2(2.4, 1.2))));
          c = mix(c, vec3(0.66, 0.48, 0.36), step(bx, 1.2) * (quay ? 0.0 : 1.0));
          c *= 0.8 + 0.2 * smoothstep(0.0, 0.05, joint);
        } else {
          vec2 t = fract(P / 0.6);
          float joint = min(min(t.x, 1.0 - t.x), min(t.y, 1.0 - t.y));
          c = vec3(0.62, 0.59, 0.55) * (0.88 + 0.24 * g21(floor(P / 0.6)));
          c *= 0.82 + 0.18 * smoothstep(0.0, 0.04, joint);
        }
        float cb = min(abs(bx - ${PROM.toFixed(1)}), abs(bx - ${ROAD_X.toFixed(1)}));
        if (!quay) c = mix(c, vec3(0.72, 0.7, 0.66), 1.0 - smoothstep(0.14, 0.17 + aw, cb));
        // scorch: dark where the heat has passed ~600 K (it stays)
        float Tp = surfTP(vec3(0.0, 1.0, 0.0), 1.0);
        float sc = smoothstep(620.0, 1000.0, Tp) * (0.6 + 0.4 * gn(P * 0.7));
        c = mix(c, c * 0.25 + vec3(0.02, 0.015, 0.012), sc * 0.85);
        diffuseColor.rgb = c;
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = road ? mix(0.75 + 0.15 * gn(P * 2.0) - paint * 0.1, 0.32, uTar) : 0.8;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 V = normalize(vGW - cameraPosition);
          // the mirage: at a grazing look the hot layer over the ground bends the sky up into your eye (shimmering)
          float graze = smoothstep(0.075, 0.012, -V.y);
          float wob = gn(vec2(P.x * 0.6, P.y * 0.08 + uTime * 1.7)) * 0.6 + gn(vec2(P.x * 1.7, P.y * 0.3 - uTime * 2.3)) * 0.4;
          float mir = uMirage * graze * smoothstep(0.25, 0.7, wob + graze * 0.4);
          vec3 Rf = reflect(V, vec3(0.0, 1.0, 0.0));
          totalEmissiveRadiance += skyRef(Rf + vec3(0.0, 0.02 * (wob - 0.5), 0.0)) * mir * 1.1;
          diffuseColor.rgb *= 1.0 - mir * 0.8;
          // the glow: dull red through a net of cracks first, then the whole face
          float T = surfT(vec3(0.0, 1.0, 0.0), 1.0);
          float e = vEdge(P * 0.55 + vec2(3.0, 7.0)) + 0.4 * vEdge(P * 1.7);
          float cr = 1.0 - smoothstep(0.03, 0.12 + aw * 0.6, e);
          float whole = smoothstep(1050.0, 1500.0, T);
          totalEmissiveRadiance += heatGlow(T) * uGlowGain * (cr * 1.4 + whole * 0.6 + 0.15);
        }`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, 1.0 - exp(-length(vGW - cameraPosition) / uHazeD));`);
  };
  mat.customProgramCacheKey = () => 'heat-ground-v1';
  const geo = new THREE.PlaneGeometry(1400, 560, 1, 280).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 0, QUAY + 280);
  mesh.receiveShadow = true;
  scene.add(mesh);
  // the curbs
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x8a8680, roughness: 0.8 });
  curbMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      { float z = (modelMatrix * instanceMatrix * vec4(position, 1.0)).z; transformed.y += ${groundGLSL('z')}; }`);
  };
  const curbs = [];
  for (const s of [-1, 1]) for (const x of [ROAD_X, PROM]) for (let k = 0; k < 82; k++) curbs.push([s * x, 290 - (k + 0.5) * 5, 5]);
  const cg = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.16, 1).translate(0, 0.08, 0), curbMat, curbs.length);
  const m4 = new THREE.Matrix4();
  curbs.forEach((c, i) => cg.setMatrixAt(i, m4.makeScale(1, 1, c[2]).setPosition(c[0], 0, c[1])));
  cg.receiveShadow = true;
  scene.add(cg);

  // ---- the bay ----
  const seaMat = new THREE.ShaderMaterial({
    uniforms: GU,
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uBoil;
      varying vec3 vW; varying float vH;
      float g21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(g21(i), g21(i + vec2(1, 0)), f.x), mix(g21(i + vec2(0, 1)), g21(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        float t = uTime;
        float h = 0.45 * sin(w.x * 0.05 + w.z * 0.11 + t * 1.3) + 0.25 * sin(w.x * 0.13 - w.z * 0.07 + t * 1.9) + 0.12 * sin(w.x * 0.31 + w.z * 0.23 + t * 2.7);
        // the boil: the surface heaves in domes
        h += uBoil * 1.4 * (gn(w.xz * 0.06 + vec2(t * 0.9, -t * 0.7)) - 0.5);
        w.y += h; vH = h; vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform vec3 uSun; uniform vec3 uSunCol; uniform float uSunA;
      uniform float uBoil; uniform float uSteam; uniform float uEnd; uniform vec3 uHaze; uniform float uHazeD;
      varying vec3 vW; varying float vH;
      ${NOISE}
      void main() {
        vec3 V = normalize(vW - cameraPosition);
        vec2 P = vW.xz;
        float dist = length(vW - cameraPosition);
        // ripples on the waves (faded out where they'd be smaller than a pixel)
        float fade = 1.0 - smoothstep(300.0, 1400.0, dist);
        vec2 rp = P * 0.35 + vec2(uTime * 0.6, uTime * 0.4);
        vec2 grad = vec2(gn(rp + vec2(0.1, 0.0)) - gn(rp - vec2(0.1, 0.0)), gn(rp + vec2(0.0, 0.1)) - gn(rp - vec2(0.0, 0.1))) * 2.5;
        vec3 N = normalize(vec3(-dFdx(vH) * 0.0, 1.0, 0.0) + vec3(grad.x, 0.0, grad.y) * (0.25 + 0.6 * uBoil) * fade);
        vec3 R = reflect(V, N);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
        vec3 deep = vec3(0.02, 0.12, 0.2);
        vec3 c = mix(deep, skyRef(R), fres);
        // the Sun's glitter path: a broad one, it's a big Sun
        float sp = max(dot(R, uSun), 0.0);
        float spread = 0.002 + uSunA * 0.9;
        c += uSunCol * (smoothstep(cos(spread * 3.0), cos(spread * 0.6), sp) * 2.2 + pow(sp, 600.0) * 3.0) * (0.4 + 0.6 * gn(P * 0.8 + uTime));
        // steam haze on the water, then the boil: white churning water
        float churn = smoothstep(0.45, 0.8, gn(P * 0.09 + vec2(uTime * 0.5, uTime * 0.3)) * 0.6 + gn(P * 0.4 - uTime) * 0.4);
        c = mix(c, vec3(0.85, 0.86, 0.84), uBoil * (0.35 + 0.55 * churn));
        c = mix(c, vec3(0.8, 0.78, 0.74), uSteam * 0.25);
        c = mix(c, vec3(1.0, 0.55, 0.2) * 0.9, uEnd * 0.6);
        c = mix(c, uHaze, 1.0 - exp(-dist / uHazeD));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sg = new THREE.PlaneGeometry(2600, 1800, 260, 180).rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(sg, seaMat);
  sea.position.set(0, SEA_Y, QUAY - 900);
  const far = new THREE.Mesh(new THREE.PlaneGeometry(12000, 4000).rotateX(-Math.PI / 2), seaMat);
  far.position.set(0, SEA_Y - 0.6, QUAY - 1800 - 2000);
  far.frustumCulled = false;
  scene.add(far);
  sea.frustumCulled = false;
  scene.add(sea);
  // the quay's wall
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x8c8378, roughness: 0.9 });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1400, 2.4, 1.2).translate(0, -1.0, 0), wallMat);
  wall.position.set(0, -DROP, QUAY);
  wall.receiveShadow = true;
  scene.add(wall);
  return { mesh, sea, GU, wallMat };
}
export const STREET_W = FX;

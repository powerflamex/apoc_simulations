// The ground: the street (one lane each way, a double yellow line, white lines marking the parking lanes), the cross
// street 120 m up with its crosswalks, concrete sidewalks with curbs. Your light heats it spot by spot (heat.js):
//   under your shoes from frame 0 (you're over 1,000 °F and standing on it) the asphalt goes soft, black and smoking;
//   ~60 kW/m²: asphalt runs liquid, bubbling, the paint lines burn off;
//   past that it glows at its own temperature: a lava field with a dark crust breaking up on it, the crust thinning
//   as it heats until it's all glowing liquid; the concrete sidewalks scorch, glow, then melt (~10 MW/m²);
//   ~100 MW/m²: the rock boils, a churning glowing surface;
//   at the end (uTear) the Earth splits: glowing rifts run out from under you to the horizon and widen.
import * as THREE from 'three';
import { RW, FX, CZ, CW } from './layout.js';
import { PATH_X, Z0, CRATER } from './timeline.js';
import { CU } from './city.js';
import { HU, HEAT_GLSL, LQ_GLSL } from './heat.js';

export const GU = { uTear: { value: 0 }, uCool: { value: 0 }, uCrater: { value: new THREE.Vector4(CRATER.x, CRATER.z, 0, 0) } };
const f = (x) => x.toFixed(2);

export function makeGround(scene, ctx) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, GU, HU, { uHaze: CU.uHaze, uHazeD: CU.uHazeD });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGW;
        uniform float uTear; uniform float uCool; uniform vec3 uHaze; uniform float uHazeD; uniform vec4 uCrater;
        ${HEAT_GLSL}
        ${LQ_GLSL}
        float band(float x, float a, float b, float w) { return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }
        float gEm = 0.0; vec3 gEmC = vec3(0.0); float gRough = 0.85;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 P = vGW.xz;
        // (inside the crater the crater's own bowl is drawn)
        if (uCrater.z > 0.01 && length(P - uCrater.xy) < uCrater.z) discard;
        float aw = max(fwidth(P.x), fwidth(P.y)) * 0.7;
        float ax = abs(P.x), dz = abs(P.y - (${f(CZ)}));
        bool road = ax < ${f(RW)};
        bool cross = dz < ${f(CW)};
        vec3 c;
        float paint = 0.0, yellow = 0.0;
        float n = nn2(P * 2.5) * 0.5 + nn2(P * 9.0) * 0.5;
        bool asphalt = road || cross;
        if (asphalt) {
          c = vec3(0.17, 0.17, 0.18) * (0.85 + 0.3 * n);
          c *= 0.92 + 0.08 * nn2(P * 0.3);
          bool inX = road && cross;
          if (road && !inX) {
            yellow = max(band(P.x, -0.26, -0.1, aw), band(P.x, 0.1, 0.26, aw));
            paint = max(paint, band(ax, 3.45, 3.6, aw));
            paint = max(paint, band(ax, 3.6, ${f(RW)}, aw) * band(fract(P.y / 6.5), 0.0, 0.025, aw / 6.5));
            float onX = band(dz, ${f(CW + 1.0)}, ${f(CW + 4.5)}, aw);
            paint = max(paint, onX * band(fract(P.x / 1.2), 0.0, 0.55, aw / 1.2));
            yellow *= 1.0 - onX;
          } else if (cross && !inX) {
            float rz = P.y - (${f(CZ)});
            yellow = max(band(rz, -0.26, -0.1, aw), band(rz, 0.1, 0.26, aw));
            float onX = band(ax, ${f(RW + 1.0)}, ${f(RW + 4.5)}, aw);
            paint = max(paint, onX * band(fract(P.y / 1.2), 0.0, 0.55, aw / 1.2));
            yellow *= 1.0 - onX;
          }
        } else {
          vec2 t = fract(P / 1.5);
          float joint = min(min(t.x, 1.0 - t.x), min(t.y, 1.0 - t.y));
          c = vec3(0.5, 0.48, 0.45) * (0.88 + 0.2 * hh2(floor(P / 1.5))) * (0.9 + 0.15 * n);
          c *= 0.84 + 0.16 * smoothstep(0.0, 0.03 + aw, joint);
          if (ax > ${f(FX + 0.5)} && dz > ${f(CW + 5.5)}) c *= 0.7;
        }
        // ---- the heat ----
        vec3 G = vec3(P.x, 0.0, P.y);
        float r = distance(G, uHeart);
        float lq = lqAt(G);
        // (where your shoes have been: the heat flows straight in by contact; a trail of melted footsteps behind you)
        float dxw = P.x - ${PATH_X.toFixed(2)};
        float onPath = step(uHeart.z - 0.35, P.y) * step(P.y, ${(Z0 + 4).toFixed(2)});
        float step2 = 0.55 + 0.45 * smoothstep(0.1, 0.0, abs(fract(P.y / 0.725) - 0.5) - 0.32);
        lq += 0.9 * exp(-dxw * dxw / 0.05) * onPath * step2;
        float Ts = tSurf(lq);
        float tar = clamp((lq - LQ_TAR + 0.35) / 0.5, 0.0, 1.0);
        float lit = clamp((lq - LQ_TAR - 0.15) / 0.9, 0.0, 1.0);
        float melt = clamp((lq - LQ_POUR) / 0.6, 0.0, 1.0);
        float boil = clamp((lq - LQ_VAPOR) / 0.5, 0.0, 1.0);
        float wear = 0.75 + 0.25 * nn2(P * 1.7);
        float lines = 1.0 - smoothstep(0.0, 0.5, tar + lit);
        c = mix(c, vec3(0.86, 0.86, 0.82) * wear, paint * 0.92 * lines);
        c = mix(c, vec3(0.85, 0.66, 0.14) * wear, yellow * 0.9 * lines);
        // the flow: a slow churn, faster the hotter it is
        vec2 fl = P * 0.9 + vec2(sin(P.y * 0.31 + uHT * 0.4), cos(P.x * 0.27 - uHT * 0.35)) * (0.6 + 1.5 * lit);
        float crust = fb3(vec3(fl * 1.3, uHT * 0.15 * (0.3 + lit)));
        if (asphalt) {
          // soft, wet, black, bubbling
          float bub = smoothstep(0.78, 0.86, nn2(P * 7.0 + vec2(0.0, uHT * 1.7))) * tar;
          c = mix(c, vec3(0.025, 0.022, 0.02) * (1.0 + 2.0 * bub), tar);
          gRough = mix(0.8, 0.18, tar);
        } else {
          c = mix(c, c * vec3(0.3, 0.27, 0.24), smoothstep(LQ_TAR, LQ_GLASS, lq));
          lit *= smoothstep(LQ_GLASS - 0.3, LQ_POUR, lq);
          gRough = mix(0.85, 0.3, melt);
        }
        // glowing: cracks of fire through a dark crust that breaks up as it heats, then all liquid
        float open = mix(0.12, 1.0, max(melt, smoothstep(0.35, 1.0, lit)));
        float vein = smoothstep(0.5 - open * 0.5, 0.5 + 0.02, crust);
        float glow = glowOf(Ts) * lit * mix(0.06, 1.0, vein);
        gEmC = bbCol(Ts) * glow * (0.8 + 0.4 * nn2(fl * 4.0));
        // boiling rock: a churning bright surface
        float churn = fb3(vec3(P * 0.12, uHT * 0.6)) * 0.6 + fb3(vec3(P * 0.5, uHT * 1.4)) * 0.4;
        gEmC = mix(gEmC, bbCol(max(Ts, 3000.0)) * glowOf(max(Ts, 3000.0)) * (0.5 + 0.9 * churn), boil);
        c *= 1.0 - 0.8 * boil;
        // the Earth splitting: rifts out from under you to the horizon, widening
        if (uTear > 0.0) {
          vec2 Q2 = P - uHeart.xz;
          float rq = length(Q2), aq = atan(Q2.y, Q2.x);
          float wig = (nn2(vec2(rq * 0.004, aq * 3.0)) - 0.5) * 0.35 + (nn2(vec2(rq * 0.03, aq * 9.0)) - 0.5) * 0.06;
          float sec = (aq / 6.2832 + 0.5) * 13.0 + wig;
          float ds = abs(fract(sec) - 0.5) * 6.2832 / 13.0 * rq;
          float reach = uTear * 2600.0 * (0.5 + 0.5 * hh2(vec2(floor(sec), 3.0)));
          float wdt = (0.4 + 0.012 * rq) * (0.3 + 2.5 * uTear) * smoothstep(reach, reach * 0.6, rq);
          float rift = (1.0 - smoothstep(wdt, wdt + aw * 2.0 + 0.002 * rq, ds)) * step(rq, reach);
          gEmC = mix(gEmC, vec3(1.0, 0.85, 0.7) * 14.0, rift);
          c *= 1.0 - rift;
        }
        diffuseColor.rgb = c;
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = gRough;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += gEmC;`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, (1.0 - exp(-length(vGW - cameraPosition) / uHazeD)) * (1.0 - smoothstep(0.0, 4.0, length(gEmC)) * 0.7));`);
  };
  mat.customProgramCacheKey = () => 'hot-ground-v1';
  const geo = new THREE.PlaneGeometry(9000, 9000, 1, 1).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 0, -1500);
  mesh.receiveShadow = true;
  scene.add(mesh);
  // the curbs (open at the crosswalks)
  const curbMat = ctx.heated(new THREE.MeshStandardMaterial({ color: 0x8e8a84, roughness: 0.8 }), 'curb', { charAt: 'TAR', glowAt: 'GLASS' });
  const curbs = [];
  for (const s of [-1, 1]) {
    for (let z = 120; z > -900; z -= 2) if (Math.abs(z - 1 - CZ) > CW + 0.2) curbs.push([s * RW, z - 1, 0]);
    for (let x = RW; x < 700; x += 2) for (const zs of [-1, 1]) if (Math.abs(x + 1) > RW + 4.7 || Math.abs(x + 1) < RW + 0.8) curbs.push([s * (x + 1), CZ + zs * CW, 1]);
  }
  const cg = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.15, 2.0).translate(0, 0.075, 0), curbMat, curbs.length);
  const m4 = new THREE.Matrix4();
  curbs.forEach(([x, z, k], i) => cg.setMatrixAt(i, k ? m4.makeRotationY(Math.PI / 2).setPosition(x, 0, z) : m4.makeTranslation(x, 0, z)));
  cg.receiveShadow = true; cg.frustumCulled = false;
  scene.add(cg);
  return { mesh };
}

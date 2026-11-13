// The buildings, the quay walls, the railings, the covered pier and the lamp posts, at night. One instanced box per
// building with its front drawn in the shader (lit window grids, glass towers, older brick blocks with cornices, lit
// shop and restaurant fronts at street level). The windows' reflections shiver after the sonic boom (uRattle).
import * as THREE from 'three';
import { BLD, LAMPS, QZ, JX, JZ, PIER, WATER_Y, FX } from './layout.js';

export const CU = {
  uTime: { value: 0 }, uFront: { value: -1 }, uOrigin: { value: new THREE.Vector2(0, 0) }, uFlick: { value: 1 },
  uSkyHi: { value: new THREE.Color(0.01, 0.015, 0.04) }, uSkyLo: { value: new THREE.Color(0.12, 0.08, 0.05) }, uAur: { value: 1 },
  uHaze: { value: new THREE.Color(0.03, 0.03, 0.045) }, uHazeD: { value: 5000 }, uStreetK: { value: 1 }, uCandle: { value: 0 }, uRattle: { value: 0 },
};

const PARS = /* glsl */ `
uniform float uTime; uniform float uFront; uniform vec2 uOrigin; uniform float uFlick; uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform float uAur;
uniform vec3 uHaze; uniform float uHazeD; uniform float uStreetK; uniform float uCandle; uniform float uRattle;
varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vS; varying vec3 vON; varying vec3 vCol; varying vec2 vIC;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float rect(vec2 f, vec2 a, vec2 b, vec2 w) { vec2 s = smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f)); return s.x * s.y; }
// the aurora in a mirror: red high up, green lower, the dark street below
vec3 skyRefl(vec3 r) {
  float h = clamp(r.y, -0.3, 1.0);
  vec3 c = mix(uSkyLo, uSkyHi, smoothstep(0.15, 0.7, h)) * smoothstep(-0.02, 0.12, h);
  return c * uAur + vec3(0.015, 0.02, 0.02);
}
`;

const LOOK = /* glsl */ `
  #include <emissivemap_fragment>
  {
    float kind = floor(vS.y + 0.5);
    float seed = floor(vS.x * 1009.0 + 0.5);
    float H = vS.w;
    vec3 base = vCol;
    vec3 V = normalize(vWP - cameraPosition);
    bool sx = abs(vON.x) > 0.5;
    float W = sx ? vSc.z : vSc.x;
    float u = ((sx ? vLoc.z : vLoc.x) + 0.5) * W;
    float y = (vLoc.y + 0.5) * vSc.y;
    float face = floor(vON.x + 0.5) * 2.0 + floor(vON.z + 0.5) + 3.0;
    float FH = kind > 1.5 && kind < 2.5 ? 3.7 : 3.4;
    float g0 = kind > 1.5 && kind < 2.5 ? 4.8 : 5.4;
    float colW = kind > 0.5 && kind < 1.5 ? 1.7 : kind > 1.5 && kind < 2.5 ? 3.1 : 2.5 + 0.6 * h21(vec2(seed, 2.0));
    float nCol = max(1.0, floor(W / colW + 0.5)); colW = W / nCol;
    vec2 g = vec2(u / colW, (y - g0) / FH);
    vec2 id = floor(g), f = fract(g);
    vec2 fw = max(fwidth(g), vec2(1e-4));
    float far = smoothstep(0.15, 0.45, max(fw.x, fw.y));
    float ok = step(0.0, g.y) * step(y, H - 1.5);
    // the blackout: this building's power goes when the front reaches it (and stays out)
    float rr = length(vIC - uOrigin);
    float seedR = h21(vec2(seed, 5.0));
    float power = 1.0;
    if (abs(vON.y) < 0.5) {
      float r = h21(id + vec2(seed * 0.173, face * 1.37));
      vec3 N = normalize(vWN);
      vec3 refl = skyRefl(reflect(V, N)) * (1.0 + uRattle * 2.5 * sin(uTime * 70.0 + h21(id + seed) * 40.0) * step(abs(vWP.x), 200.0));
      float fres = 0.18 + 0.82 * pow(1.0 - abs(dot(V, N)), 3.0);
      vec3 col = base; float win = 0.0;
      // who's home: about half the windows lit, warm or office white; a far building's lit share is an even tone
      float lit = step(0.58, h21(id * 1.31 + vec2(seed * 0.71, face)));
      // candles: after the blackout people light them, one window here and there, more as time goes on (near buildings only)
      float cnd = step(1.0 - 0.2 * uCandle * (0.4 + 0.6 * h21(vec2(seed, 9.0))), h21(id * 2.71 + vec2(seed * 0.33, face))) * smoothstep(260.0, 60.0, length(vWP - cameraPosition));
      float flk = 0.75 + 0.25 * sin(uTime * 9.0 + r * 50.0) * sin(uTime * 5.3 + r * 23.0);
      vec3 room = mix(vec3(1.0, 0.72, 0.42), vec3(0.86, 0.92, 1.0), step(0.7, h21(id + vec2(seed, 2.0))));
      room *= 0.6 + 0.7 * h21(id * 2.1 + seed);
      if (kind > 0.5 && kind < 1.5 || kind > 3.5) {
        win = rect(f, vec2(0.04, 0.14), vec2(0.96, 0.97), fw) * ok;
        vec3 glass = mix(base * 0.16, vec3(0.05, 0.055, 0.06), 0.5);
        col = mix(base * 0.45, glass, mix(win, 0.88 * ok, far));
        totalEmissiveRadiance += refl * (0.02 + 0.08 * fres) * mix(win, 0.88 * ok, far);
      } else if (kind > 1.5 && kind < 2.5) {
        win = rect(f, vec2(0.3, 0.2), vec2(0.7, 0.8), fw) * ok;
        vec3 glass = mix(vec3(0.04, 0.05, 0.06), refl * 0.6, 0.4 * fres) * (0.8 + 0.4 * r);
        col = mix(base, glass, win * (1.0 - far));
        col = mix(col, base * 0.78 + glass * 0.22, far * ok * 0.5);
        float course = step(0.86, f.y) * step(f.y, 0.92) * ok;
        col = mix(col, base * 1.14, course * (1.0 - far));
        col = mix(col, base * 0.92, smoothstep(H - 2.6, H - 2.3, y) * (1.0 - smoothstep(H - 0.5, H - 0.2, y)));
        totalEmissiveRadiance += refl * 0.06 * fres * win * (1.0 - far);
      } else {
        vec2 a = kind > 3.5 ? vec2(0.08, 0.2) : vec2(0.16, 0.22), b = kind > 3.5 ? vec2(0.92, 0.9) : vec2(0.84, 0.86);
        win = rect(f, a, b, fw) * ok;
        vec3 glass = mix(vec3(0.04, 0.05, 0.06), refl * 0.65, 0.4 * fres) * (0.8 + 0.4 * r);
        col = mix(base, glass, win * (1.0 - far));
        col = mix(col, base * 0.75 + glass * 0.25, far * ok * 0.55);
        col = mix(col, base * 0.86, step(f.y, 0.2) * ok * (1.0 - far));
        totalEmissiveRadiance += refl * 0.06 * fres * win;
      }
      // the rooms' lights
      float rows = step(g0, y) * ok;
      float wv = mix(win, 0.8, far) * rows;
      float dcam = length(vWP - cameraPosition);
      float farLit = mix(0.42, 0.16, smoothstep(400.0, 1600.0, dcam));
      totalEmissiveRadiance += room * mix(lit, farLit, far) * wv * power * mix(0.55, 0.9, far) * mix(1.0, 1.6, smoothstep(400.0, 1600.0, dcam));
      // a candle: a small warm glow low in the window
      float spot = exp(-pow((f.x - 0.5) / 0.3, 2.0) - pow((f.y - 0.38) / 0.32, 2.0));
      totalEmissiveRadiance += vec3(1.0, 0.55, 0.2) * cnd * mix(spot, 0.4, far) * flk * rows * (1.0 - power) * 3.0;
      // street level: shop fronts (lit glass, a fascia band), the light they and the lamps throw on the walls
      if (y < g0 && kind < 2.5) {
        float nb = max(1.0, floor(W / 5.5));
        float bw = W / nb;
        float bay = fract(u / bw);
        float bid = floor(u / bw);
        float pane = step(0.3, y) * step(y, g0 - 1.7) * step(0.06, bay) * step(bay, 0.94);
        vec3 inside = mix(vec3(1.0, 0.78, 0.5), vec3(0.8, 0.88, 1.0), step(0.55, h21(vec2(bid, seed)))) * (0.6 + 0.4 * h21(vec2(floor(bay * 6.0), seed)));
        vec3 shopGlass = mix(inside * 0.2, refl * 0.6, 0.45 * fres);
        col = mix(base * 0.7, shopGlass, pane);
        float band = step(g0 - 1.6, y) * step(y, g0 - 0.3);
        col = mix(col, vec3(0.08, 0.08, 0.09), band);
        totalEmissiveRadiance += pane * inside * 0.85 * power;
        win = max(win, pane);
      }
      // warm spill from the street lamps and signs on the lower walls while the power's on
      totalEmissiveRadiance += col * vec3(1.0, 0.7, 0.45) * 0.35 * uStreetK * smoothstep(16.0, 2.0, y) * smoothstep(60.0, 15.0, length(vWP.xz - cameraPosition.xz)) * power;
      diffuseColor.rgb = col * mix(1.0, 0.3, smoothstep(300.0, 1500.0, length(vWP - cameraPosition)));
    } else {
      diffuseColor.rgb = base * 0.42 + 0.04 * h21(floor(vWP.xz * 0.5));
      vec2 rq = abs(vLoc.xz) - 0.46;
      diffuseColor.rgb = mix(diffuseColor.rgb, base * 0.7, step(0.0, max(rq.x, rq.y)));
    }
    // red lights on the tall roofs, while the power's on
    if (H > 100.0 && y > H - 1.2 && (u < 1.2 || u > W - 1.2) && abs(vON.y) < 0.5) totalEmissiveRadiance += vec3(4.0, 0.3, 0.2) * power * step(0.0, sin(uTime * 3.0 + seed));
  }
`;

function facadeMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, CU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aS; attribute vec3 aCol;
        varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vS; varying vec3 vON; varying vec3 vCol; varying vec2 vIC;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vIC = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
        vLoc = position - vec3(0.0, 0.5, 0.0); vON = normal; vS = aS; vCol = aCol;
        vSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        { vec4 wpp = modelMatrix * instanceMatrix * vec4(transformed, 1.0); vWP = wpp.xyz; }
        vWN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * (normal / (vSc * vSc)));`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${PARS}`)
      .replace('#include <emissivemap_fragment>', LOOK)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, 1.0 - exp(-length(vWP - cameraPosition) / uHazeD));`);
  };
  m.customProgramCacheKey = () => 'meteor-facade-v1';
  return m;
}


export function makeCity(scene, ctx) {
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  // ---- buildings ----
  const geo = new THREE.BoxGeometry(1, 1, 1, 1, 24, 1).translate(0, 0.5, 0);
  const n = BLD.length;
  const aS = new Float32Array(n * 4), aCol = new Float32Array(n * 3);
  const mesh = new THREE.InstancedMesh(geo, facadeMaterial(), n);
  BLD.forEach((b, i) => {
    m4.makeScale(b.w, b.h, b.d).setPosition(b.x, b.y, b.z);
    mesh.setMatrixAt(i, m4);
    aS.set([(i * 0.6180339) % 1, b.kind, 0, b.h], i * 4);
    col.set(b.col).convertSRGBToLinear();
    aCol.set([col.r, col.g, col.b], i * 3);
  });
  geo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
  geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 3));
  mesh.frustumCulled = false;
  mesh.receiveShadow = true; mesh.castShadow = true;
  scene.add(mesh);

  // ---- helpers: lots of boxes of one material as one instanced mesh ----
  const boxes = (list, mat, { shadow = true } = {}) => {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, list.length);
    list.forEach(([cx, cy, cz, sx, sy, sz], i) => im.setMatrixAt(i, m4.makeScale(sx, sy, sz).setPosition(cx, cy, cz)));
    im.frustumCulled = false; im.castShadow = shadow; im.receiveShadow = true;
    scene.add(im);
    return im;
  };
  // ---- the quay walls (stone, down into the water) ----
  const wallTop = 0.02, wallBot = WATER_Y - 3;
  const wy = (wallTop + wallBot) / 2, wh = wallTop - wallBot;
  boxes([
    [(-480 + JX) / 2, wy, QZ + 0.5, JX + 480, wh, 1],
    [JX + 0.5, wy, (QZ + JZ) / 2, 1, wh, QZ - JZ],
    [(JX + 120) / 2, wy, JZ + 0.5, 120 - JX, wh, 1],
  ], ctx.plainMat(0x4a453e, 0.9));
  // a dark coping stone along the top edge
  boxes([
    [(-480 + JX) / 2, 0.08, QZ + 0.3, JX + 480, 0.16, 0.6],
    [JX + 0.3, 0.08, (QZ + JZ) / 2, 0.6, 0.16, QZ - JZ],
  ], ctx.plainMat(0x5c5852, 0.8));
  // ---- the railings: posts every 2 m, a top rail and a middle rail (dark painted steel) ----
  {
    const posts = [], rails = [];
    const runX = (x0, x1, z) => { for (let x = x0; x <= x1; x += 2) posts.push([x, 0.55, z, 0.07, 1.1, 0.07]); rails.push([(x0 + x1) / 2, 1.08, z, x1 - x0, 0.06, 0.08], [(x0 + x1) / 2, 0.55, z, x1 - x0, 0.04, 0.04]); };
    const runZ = (z0, z1, x) => { for (let z = z1; z <= z0; z += 2) posts.push([x, 0.55, z, 0.07, 1.1, 0.07]); rails.push([x, 1.08, (z0 + z1) / 2, 0.08, 0.06, z0 - z1], [x, 0.55, (z0 + z1) / 2, 0.04, 0.04, z0 - z1]); };
    runX(-480, PIER.x0, QZ + 0.35); runX(PIER.x1, JX - 0.2, QZ + 0.35);
    runZ(QZ, JZ, JX + 0.35); runX(JX + 0.35, 120, JZ + 0.35);
    runZ(PIER.z0, PIER.z1, PIER.x0 + 0.15); runZ(PIER.z0, PIER.z1, PIER.x1 - 0.15);
    const steel = ctx.plainMat(0x22252a, 0.45, { metalness: 0.6 });
    boxes(posts, steel); boxes(rails, steel);
  }
  // ---- the covered pier: a plank deck on piles, posts carrying a long flat roof, lamps under it ----
  {
    const P = PIER, cx = (P.x0 + P.x1) / 2, W = P.x1 - P.x0;
    boxes([[cx, -0.15, (P.z0 + P.z1) / 2, W, 0.3, P.z0 - P.z1]], ctx.plainMat(0x5a4836, 0.85));
    const piles = [], posts = [];
    for (let z = P.z0 - 3; z > P.z1; z -= 6) for (const x of [P.x0 + 0.6, cx, P.x1 - 0.6]) piles.push([x, (WATER_Y - 3) / 2, z, 0.4, -WATER_Y + 3, 0.4]);
    for (let z = P.z0 - 1; z >= P.roofZ1; z -= 6.5) for (const x of [P.x0 + 0.5, P.x1 - 0.5]) posts.push([x, P.roofY / 2, z, 0.28, P.roofY, 0.28]);
    boxes(piles, ctx.plainMat(0x2e2620, 0.9), { shadow: false });
    boxes(posts, ctx.plainMat(0x2a2d32, 0.5, { metalness: 0.4 }));
    boxes([[cx, P.roofY + 0.2, (P.z0 + P.roofZ1) / 2 + 0.5, W + 2.4, 0.4, P.z0 - P.roofZ1 + 3]], ctx.plainMat(0x3a3e44, 0.7, { metalness: 0.2 }));
    // the roof's fascia: a lit sign band along its front edge
    boxes([[cx, P.roofY + 0.2, P.z0 + 2.0, W + 2.5, 0.7, 0.1]], ctx.glowMat(new THREE.Color(1.6, 1.25, 0.7)), { shadow: false });
  }
  // ---- lamp posts (the lanterns themselves are glows, from main.js) ----
  {
    const posts = [], heads = [];
    for (const l of LAMPS) {
      if (l.roof) { heads.push([l.x, l.h, l.z, 0.5, 0.18, 0.5]); continue; }
      posts.push([l.x, l.h / 2, l.z, 0.14, l.h, 0.14]);
      heads.push([l.x, l.h + 0.1, l.z, 0.42, 0.42, 0.42]);
    }
    boxes(posts, ctx.plainMat(0x1d2024, 0.5, { metalness: 0.5 }));
    boxes(heads, ctx.plainMat(0x2a2620, 0.6), { shadow: false });
  }
  return { mesh };
}

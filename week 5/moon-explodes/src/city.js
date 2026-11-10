// Across the water: the towers (instanced boxes, one shader for every kind of lit facade), the ground they stand on and
// the mountain behind (dark, dotted with lights), the observation wheel, red lights on the tallest roofs.
// Hits (timeline HITS): a tower's top is knocked off at the impact height, the floors round it burn, the ones above
// go dark. Later the city's power fails block by block (uBlack). The dust rolling across the water hides it (fog).
import * as THREE from 'three';
import { TOWERS, WHEEL, farY, SHORE_Z } from './layout.js';
import { HITS } from './timeline.js';
import { smooth } from './util.js';

export const CU = {
  uTime: { value: 0 }, uBlack: { value: 0 }, uAmb: { value: 0.05 }, uLightDir: { value: new THREE.Vector3(0, 1, 0) },
  uLightC: { value: new THREE.Color(0, 0, 0) }, uFlashC: { value: new THREE.Color(0, 0, 0) }, uFogC: { value: new THREE.Color(0.03, 0.025, 0.03) },
  uFogD: { value: 0.0001 }, uHeat: { value: 0 },
};
const NOISE = /* glsl */ `
  float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
`;
const UNI = /* glsl */ `uniform float uTime, uBlack, uAmb, uFogD, uHeat; uniform vec3 uLightDir, uLightC, uFlashC, uFogC;`;

export function makeCity(scene) {
  // ---- towers ----
  const n = TOWERS.length;
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const aS = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);   // w, h, d, style
  const aK = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);   // seed, base y, hit time, hit height (fraction)
  const aX = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2);   // crown, share of windows lit
  geo.setAttribute('aS', aS); geo.setAttribute('aK', aK); geo.setAttribute('aX', aX);
  const hitOf = new Map(HITS.map((h) => [h.tower, h]));
  TOWERS.forEach((t, i) => {
    const h = hitOf.get(i);
    aS.setXYZW(i, t.w, t.h, t.d, t.style);
    aK.setXYZW(i, t.seed, t.base, h ? h.v : -1, h ? h.frac : 1);
    aX.setXY(i, t.crown ? 1 : 0, t.style === 3 ? 0.3 : 0.38 + 0.4 * ((t.seed * 7.13) % 1));
  });
  const mat = new THREE.ShaderMaterial({
    uniforms: CU,
    vertexShader: /* glsl */ `
      attribute vec4 aS; attribute vec4 aK; attribute vec2 aX;
      varying vec3 vWP; varying vec3 vN; varying vec4 vS; varying vec4 vK; varying vec2 vX; varying vec3 vLoc;
      void main() {
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWP = w.xyz; vN = normalize(mat3(modelMatrix * instanceMatrix) * normal); vS = aS; vK = aK; vX = aX; vLoc = position;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${UNI}
      varying vec3 vWP; varying vec3 vN; varying vec4 vS; varying vec4 vK; varying vec2 vX; varying vec3 vLoc;
      ${NOISE}
      void main() {
        vec3 N = normalize(vN);
        float style = floor(vS.w + 0.5), seed = vK.x;
        float y = vWP.y - vK.y;
        bool side = abs(N.y) < 0.5;
        float u = abs(N.x) > 0.5 ? vWP.z : vWP.x;
        vec3 base = mix(vec3(0.03, 0.035, 0.045), vec3(0.06, 0.06, 0.065), fract(seed * 13.0));
        vec3 col = base * (uAmb + max(dot(N, uLightDir), 0.0) * uLightC + uFlashC * (0.4 + 0.6 * max(N.z, 0.0)));
        vec3 emis = vec3(0.0);
        if (side) {
          // clean window grids: each tower one colour (warm or cool white), whole stretches of a floor (an office)
          // lit or dark together, a few single windows out; far off, the grid fades to its average (no pixel noise)
          float fy = y / 4.0, fi = floor(fy), ff = fract(fy);
          float cw = style > 0.5 && style < 1.5 ? 2.6 : 3.2;
          float fu = u / cw, ci = floor(fu), fc = fract(fu);
          float faceId = N.x > 0.5 ? 1.0 : N.x < -0.5 ? 2.0 : N.z > 0.5 ? 3.0 : 4.0;
          float hh = h31(vec3(floor(ci / 5.0), fi, seed * 91.0 + faceId * 17.0));
          float hw = h31(vec3(ci, fi, seed * 37.0 + faceId * 5.0));
          float hh2 = h31(vec3(floor(ci / 6.0), fi, seed * 13.0 + faceId));
          vec2 fw = fwidth(vec2(fu, fy)) + 1e-4;
          float wx = smoothstep(0.16 - fw.x, 0.16 + fw.x, fc) * (1.0 - smoothstep(0.84 - fw.x, 0.84 + fw.x, fc));
          float wy = smoothstep(0.25 - fw.y, 0.25 + fw.y, ff) * (1.0 - smoothstep(0.82 - fw.y, 0.82 + fw.y, ff));
          float far = smoothstep(0.2, 0.5, max(fw.x, fw.y));
          float win = mix(wx * wy, 0.39, far);
          vec3 tc = fract(seed * 5.7) < 0.55 ? vec3(1.0, 0.76, 0.48) : vec3(0.84, 0.9, 1.0);
          vec3 wc = tc * (0.85 + 0.2 * fract(hh * 13.1));
          float inside = step(5.0, y) * step(y, vS.y - 2.5);
          float lit = step(hh, vX.y + 0.15) * mix(step(0.07, hw), 0.93, far) * inside;
          if (style < 0.5) emis = wc * win * lit * 1.1;
          else if (style < 1.5) {
            float band = step(0.38, hh2);
            float mull = 0.65 + 0.35 * mix(smoothstep(0.0, 0.08 + fw.x, fc) * (1.0 - smoothstep(0.92 - fw.x, 1.0, fc)), 0.85, far);
            emis = tc * band * mull * mix(wy, 0.57, far) * inside * 0.8;
          } else if (style < 2.5) {
            // windows with a clean white line of light up every 8 m
            float line = 1.0 - smoothstep(0.0, 0.05 + 1.5 * fwidth(u / 8.0), abs(fract(u / 8.0) - 0.5) * 2.0 - 0.9);
            emis = wc * win * lit * 0.85 + vec3(1.0, 1.15, 1.4) * clamp(line, 0.0, 1.0) * 0.9 * step(5.0, y);
          } else if (style < 3.5) {
            // the waterfront podiums: one neon sign per shopfront (a clean strip along the top and a lit panel), one colour each
            float sx = floor(u / 16.0), sf = fract(u / 16.0);
            float hp = h31(vec3(sx, 3.0, seed * 50.0));
            vec3 nc = hp < 0.2 ? vec3(2.6, 0.35, 0.9) : hp < 0.4 ? vec3(0.35, 1.6, 2.6) : hp < 0.55 ? vec3(2.6, 0.9, 0.2) : hp < 0.7 ? vec3(2.0, 1.9, 1.8) : vec3(0.0);
            float fwy = fwidth(y) + 1e-3, fwu = fwidth(sf) + 1e-3;
            float strip = smoothstep(vS.y - 3.6 - fwy, vS.y - 3.6 + fwy, y) * (1.0 - smoothstep(vS.y - 2.6 - fwy, vS.y - 2.6 + fwy, y));
            float py = vS.y * 0.45;
            float panel = smoothstep(py - fwy, py + fwy, y) * (1.0 - smoothstep(py + 3.5 - fwy, py + 3.5 + fwy, y))
              * smoothstep(0.18 - fwu, 0.18 + fwu, sf) * (1.0 - smoothstep(0.82 - fwu, 0.82 + fwu, sf));
            emis = nc * (strip * 1.1 + panel * 0.8) + wc * win * lit * 0.45;
          } else {
            float uu = (abs(N.x) > 0.5 ? vLoc.z : vLoc.x) + 0.5, yy = y / vS.y;
            float dx = min(abs(uu - fract(yy * 3.0)), abs(1.0 - uu - fract(yy * 3.0)));
            float lineX = 1.0 - smoothstep(0.0, 0.012 + 2.0 * fwidth(uu), dx);
            float edge = 1.0 - smoothstep(0.0, 0.01 + 2.0 * fwidth(uu), min(uu, 1.0 - uu));
            emis = wc * win * lit * 0.6 + vec3(1.5, 1.65, 2.0) * max(lineX, edge) * step(3.0, y);
          }
          // the crown: a ring of light round the top floors
          if (vX.x > 0.5) emis += vec3(1.6, 1.8, 2.2) * smoothstep(vS.y - 24.0, vS.y - 20.0, y) * (0.7 + 0.3 * step(0.5, fract(y / 4.0)));
        }
        // the power failing, block by block
        emis *= 1.0 - smoothstep(fract(seed * 7.31) - 0.03, fract(seed * 7.31) + 0.03, uBlack * 1.05);
        // the hit: the floors round it burn, everything above is gone (the top is knocked off), below goes dark
        if (vK.z > 0.0 && uTime > vK.z) {
          float hk = smoothstep(vK.z, vK.z + 0.35, uTime);
          float hy = vK.w * vS.y;
          float dy = y - hy;
          float fl = 0.55 + 0.7 * vn(vec2(u * 0.15, y * 0.25 - uTime * 2.5));
          emis *= 1.0 - hk * (0.6 + 0.4 * smoothstep(-60.0, 0.0, dy));
          emis += vec3(3.2, 1.1, 0.25) * fl * hk * exp(-dy * dy / 1400.0) * (side ? 1.0 : 0.5) * (1.0 + 2.0 * exp(-(uTime - vK.z) * 3.0));
        }
        col += emis;
        float dist = length(vWP - cameraPosition);
        col = mix(col, uFogC, 1.0 - exp(-uFogD * dist));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const m4 = new THREE.Matrix4();
  const setTower = (i, hk) => { const t = TOWERS[i]; m4.makeScale(t.w, t.h * hk, t.d).setPosition(t.x, t.base, t.z); mesh.setMatrixAt(i, m4); };
  TOWERS.forEach((t, i) => setTower(i, 1));

  // ---- the ground over there and the mountain ----
  const cols = 220, rows = 60, X0 = -9000, X1 = 9000, Z0 = SHORE_Z, Z1 = -7000;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array((cols + 1) * (rows + 2) * 3);
  let k = 0;
  const zAt = (r) => Z0 - Math.pow(r / rows, 1.5) * (Z0 - Z1);
  for (let r = -1; r <= rows; r++) for (let c = 0; c <= cols; c++) {
    const x = X0 + (X1 - X0) * c / cols;
    const z = r < 0 ? Z0 + 0.1 : zAt(r);
    pos[k++] = x; pos[k++] = r < 0 ? -6 : farY(x, z); pos[k++] = z;
  }
  const idx = [];
  for (let r = 0; r <= rows; r++) for (let c = 0; c < cols; c++) {
    const a = r * (cols + 1) + c, b = a + 1, d = a + cols + 1, e = d + 1;
    idx.push(a, d, b, b, d, e);
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const landMat = new THREE.ShaderMaterial({
    uniforms: CU,
    vertexShader: /* glsl */ `varying vec3 vWP; varying vec3 vN; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz; vN = normal; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      ${UNI}
      varying vec3 vWP; varying vec3 vN;
      ${NOISE}
      void main() {
        vec3 N = normalize(vN);
        float trees = vn(vWP.xz * 0.02) * 0.6 + vn(vWP.xz * 0.1) * 0.4;
        vec3 base = mix(vec3(0.012, 0.016, 0.012), vec3(0.025, 0.03, 0.022), trees);
        vec3 col = base * (uAmb * 1.5 + max(dot(N, uLightDir), 0.0) * uLightC + uFlashC * 0.6);
        // lights: streets and homes, thick on the flat, thinning up the slope; none on the ridge
        vec2 g = vWP.xz / vec2(9.0, 9.0);
        vec2 id = floor(g), f = fract(g) - 0.5;
        float h = h21(id);
        float up = vWP.y;
        float dens = mix(0.22, 0.04, smoothstep(10.0, 300.0, up)) * (0.5 + vn(vWP.xz * 0.004) * 1.0);
        float fw = length(fwidth(g));
        float pt = h < dens ? smoothstep(0.25 + fw, 0.05, length(f - (vec2(h21(id + 3.3), h21(id + 7.1)) - 0.5) * 0.5)) : 0.0;
        vec3 lc = mix(vec3(1.0, 0.7, 0.4), vec3(0.85, 0.9, 1.0), step(0.6, h21(id + 1.1)));
        col += lc * pt * 1.3 * (1.0 - smoothstep(0.0, 1.5, fw)) + lc * dens * 0.25 * smoothstep(0.5, 2.0, fw);
        col *= 1.0 - smoothstep(h21(id * 0.05) - 0.03, h21(id * 0.05) + 0.03, uBlack * 1.05) * 0.85;
        float dist = length(vWP - cameraPosition);
        col = mix(col, uFogC, 1.0 - exp(-uFogD * dist * 0.8));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const land = new THREE.Mesh(g, landMat);
  land.frustumCulled = false;
  scene.add(land);

  return {
    mesh,
    frame(v, s, glows) {
      CU.uTime.value = v;
      // knocked-off tops
      for (const h of HITS) setTower(h.tower, v < h.v ? 1 : 1 - (1 - h.frac) * smooth(h.v, h.v + 0.9, v));
      mesh.instanceMatrix.needsUpdate = true;
      // the wheel: a ring of coloured lights turning slowly, and its spokes
      const lightsOn = 1 - smooth(0.45, 0.55, s.black);
      if (lightsOn > 0.01) {
        const a0 = v * 0.05;
        for (let i = 0; i < 48; i++) {
          const a = a0 + i / 48 * Math.PI * 2;
          const c = 0.5 + 0.5 * Math.cos(v * 0.8 + i * 0.4);
          glows.add(WHEEL.x + Math.cos(a) * WHEEL.r, WHEEL.y + Math.sin(a) * WHEEL.r, WHEEL.z, 3.2, (0.8 + 1.4 * c) * lightsOn, (0.4 + 0.8 * (1 - c)) * lightsOn, 1.6 * lightsOn);
          if (i % 6 === 0) for (let q = 1; q < 5; q++) glows.add(WHEEL.x + Math.cos(a) * WHEEL.r * q / 5, WHEEL.y + Math.sin(a) * WHEEL.r * q / 5, WHEEL.z, 1.8, 0.5 * lightsOn, 0.6 * lightsOn, 0.9 * lightsOn);
        }
      }
      // red lights on the tallest roofs, blinking
      TOWERS.forEach((t, i) => {
        if (t.h < 200) return;
        const hit = HITS.find((h) => h.tower === i);
        if (hit && v > hit.v) return;
        const b = (Math.sin(v * 3 + t.seed * 20) > 0.2 ? 1 : 0.15) * lightsOn;
        glows.add(t.x, t.base + t.h + 1, t.z + t.d / 2, 5, 2.4 * b, 0.15 * b, 0.1 * b);
      });
    },
  };
}

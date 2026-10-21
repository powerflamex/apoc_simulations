// The buildings: one instanced box each (base at y = 0), the whole look drawn in one material patch from the box's
// own coordinates (so it rides along when the ground breaks and the blocks drift apart):
//   kind 0 old block: plaster, punched windows with sills, a cornice, a lit shopfront at street level
//   kind 1 office: stone grid, punched windows; kind 2 glass tower: curtain wall, floor bands; kind 3 flats: balconies
// Night: windows lit warm or cool (whole floors and runs), shopfronts glowing; day: plaster in sunlight, the glass
// mirrors a sky that dims as the Sun shrinks. Snow settles on roofs, sills and ledges (uSnow).
import * as THREE from 'three';
import { B } from './layout.js';

export const CU = {
  uGrid: { value: 1 }, uNight: { value: 1 }, uSnow: { value: 0 }, uSky: { value: new THREE.Color(0.3, 0.45, 0.7) },
  uSunDir: { value: new THREE.Vector3(-0.5, 0.3, -0.6) }, uHeat: { value: 0 },
};

const PARS = /* glsl */ `
uniform float uGrid; uniform float uNight; uniform float uSnow; uniform vec3 uSky; uniform vec3 uSunDir; uniform float uHeat;
varying vec3 vLoc; varying vec3 vSc; varying vec3 vWN; varying vec4 vS; varying vec3 vON; varying vec3 vWP;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float rect(vec2 f, vec2 a, vec2 b, vec2 w) {
  vec2 s = smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f));
  return s.x * s.y;
}
`;

const LOOK = /* glsl */ `
  #include <emissivemap_fragment>
  {
    float kind = floor(vS.y + 0.5);
    float seed = floor(vS.x * 1009.0 + 0.5);
    float H = vS.z;
    vec3 base = diffuseColor.rgb;
    vec3 V = normalize(vWP - cameraPosition);
    bool side = abs(vON.y) < 0.5;
    bool sx = abs(vON.x) > 0.5;
    float W = sx ? vSc.z : vSc.x;
    float u = ((sx ? vLoc.z : vLoc.x) + 0.5) * W;
    float y = vLoc.y * vSc.y;
    float FH = kind < 0.5 ? 3.4 : 3.6;
    float g0 = kind < 0.5 ? 4.6 : 5.2;
    float colW = kind > 1.5 && kind < 2.5 ? 1.5 : kind < 0.5 ? 2.5 + 0.8 * h21(vec2(seed, 2.0)) : 2.1 + h21(vec2(seed, 5.0));
    float nCol = max(1.0, floor(W / colW + 0.5));
    colW = W / nCol;
    vec2 g = vec2(u / colW, (y - g0) / FH);
    vec2 id = floor(g), f = fract(g);
    vec2 fw = max(fwidth(g), vec2(1e-4));
    float far = smoothstep(0.18, 0.5, max(fw.x, fw.y));
    float ok = step(0.0, g.y) * step(y, H - 1.4);
    float face = floor(vON.x + 0.5) * 2.0 + floor(vON.z + 0.5) + 3.0;
    float ground = step(y, g0);
    float night = uNight;
    vec3 col = base;
    float snowAmt = 0.0;
    if (side) {
      float r = h21(id + vec2(seed * 0.173, face * 1.37));
      float floorR = h21(vec2(id.y, seed * 0.29 + face));
      float hB = h21(vec2(seed, 8.1));
      float win = 0.0;
      vec3 N = normalize(vWN);
      float fres = 0.2 + 0.8 * pow(1.0 - abs(dot(V, N)), 3.0);
      vec3 R = reflect(V, N);
      vec3 refl = mix(uSky * 0.55, uSky, smoothstep(-0.1, 0.5, R.y)) * mix(1.0, 0.25, night);
      refl = mix(refl, vec3(0.03, 0.03, 0.035), smoothstep(0.02, -0.12, R.y));
      if (kind > 1.5 && kind < 2.5) {
        win = rect(f, vec2(0.04, 0.2), vec2(0.96, 0.98), fw) * ok;
        vec3 glass = mix(base * 0.22, refl * mix(vec3(1.0), base * 1.8, 0.35), 0.45 + 0.55 * fres);
        col = mix(base * 0.45, glass, mix(win, 0.85 * ok, far));
      } else if (kind > 2.5) {
        float band = 1.0 - step(0.2, f.y);
        win = rect(f, vec2(0.12, 0.3), vec2(0.88, 0.92), fw) * ok;
        vec3 glass = mix(vec3(0.05, 0.06, 0.08), refl * 0.6, 0.5 * fres);
        col = mix(base * 0.78, glass, win * (1.0 - far * 0.5));
        col = mix(col, base * 1.08, band * ok);
        snowAmt = max(snowAmt, band * ok * step(0.1, f.y) * 0.8);
      } else {
        float wTop = kind < 0.5 ? 0.84 : 0.88;
        win = rect(f, vec2(0.22, 0.26), vec2(0.78, wTop), fw) * ok;
        float sill = rect(f, vec2(0.18, 0.2), vec2(0.82, 0.26), fw) * ok;
        vec3 glass = mix(vec3(0.05, 0.055, 0.07), refl * 0.7, 0.45 * fres) * (0.8 + 0.4 * r);
        if (kind < 0.5 && r > 0.82) glass = mix(glass, base * 0.5, step(0.5, f.y));   // shutters
        col = mix(base, glass, win * (1.0 - far));
        col = mix(col, base * 1.15, sill * (1.0 - far));
        col = mix(col, base * 0.72 + glass * 0.28, far * ok * 0.5);
        snowAmt = max(snowAmt, sill * 0.9);
        // the old blocks: a cornice under the roof, a string course over the shops
        if (kind < 0.5) {
          float corn = smoothstep(H - 1.6, H - 1.5, y) * (1.0 - smoothstep(H - 0.9, H - 0.8, y));
          col = mix(col, base * 1.2, corn);
          snowAmt = max(snowAmt, corn * 0.6);
        }
      }
      // street level: shopfronts and lobbies, glass lit warm from inside, a dark fascia
      if (ground > 0.5) {
        float bay = fract(u / 4.6);
        float pane = step(0.3, y) * step(y, g0 - 1.2) * step(0.06, bay) * step(bay, 0.94);
        vec3 inside = mix(vec3(1.0, 0.8, 0.55), vec3(0.8, 0.92, 1.0), step(0.65, h21(vec2(floor(u / 4.6), seed)))) * (0.55 + 0.45 * h21(vec2(floor(u / 1.1), seed)));
        inside *= 0.7 + 0.3 * smoothstep(0.3, g0 - 1.2, y);
        // what's in the window: shelves and displays (dark shapes), a counter along the bottom, mullions
        float shelf = step(0.5, h21(vec2(floor(u / 0.7), floor(y / 0.55)) + seed)) * step(0.9, y) * 0.55;
        float counter = 1.0 - step(0.85, y);
        float mul = step(0.94, fract(u / 1.55));
        float stuff = 1.0 - max(max(shelf, counter * 0.7), mul * 0.9);
        col = mix(base * 0.65, inside * 0.18, pane);
        col = mix(col, vec3(0.06, 0.055, 0.055), step(g0 - 1.2, y));
        totalEmissiveRadiance += pane * inside * vec3(1.0, 0.82, 0.6) * 0.62 * uGrid * (0.35 + 0.65 * stuff);
      }
      col = mix(col, base * 0.45, smoothstep(H - 2.0, H - 1.8, y) * step(0.5, kind));
      // rooms lit at night: runs of windows and whole floors, warm and cool white, some with curtains or blinds,
      // a few blue with a TV; brighter near the ceiling
      float lit = step(r, 0.12 + 0.38 * step(floorR, 0.35 + 0.3 * hB)) * ok * (1.0 - ground);
      float tone = h21(vec2(id.y * 3.1 + id.x, seed));
      vec3 warm = mix(vec3(1.0, 0.68, 0.38), vec3(1.0, 0.82, 0.6), tone);
      warm = mix(warm, vec3(0.78, 0.88, 1.0), step(0.72, h21(vec2(id.y, seed))));
      warm = mix(warm, vec3(0.45, 0.58, 1.0), step(0.95, h21(id + seed * 0.7)));
      float curtain = step(0.55, h21(id * 2.3 + seed));
      float blinds = step(0.82, h21(id * 3.7 + seed));
      float wy = clamp((f.y - 0.25) / 0.6, 0.0, 1.0);
      float inner = (0.55 + 0.6 * wy * wy) * (0.45 + 0.75 * r);
      inner *= mix(1.0, 0.55 + 0.25 * sin(f.x * 40.0), curtain * 0.8);
      inner *= mix(1.0, 0.6 + 0.4 * step(0.5, fract(f.y * 14.0)), blinds);
      float mull = 1.0 - (1.0 - smoothstep(0.0, fw.x * 1.5, abs(f.x - 0.5) - 0.012)) * step(kind, 1.5);
      float e = mix(win * lit * inner * mull, 0.07 * ok * (0.6 + 0.4 * hB), far) * uGrid * mix(0.12, 1.0, night);
      totalEmissiveRadiance += e * warm * 1.25;
      // dark windows still catch a little of the city's glow
      totalEmissiveRadiance += win * (1.0 - lit) * vec3(0.05, 0.045, 0.05) * night * (1.0 - far);
      // the walls at night: washed warm from the street lamps and shops below, a halo round lit windows
      float wash = exp(-max(y - 4.0, 0.0) / 9.0) * (1.0 - ground * 0.5);
      totalEmissiveRadiance += base * vec3(1.0, 0.7, 0.42) * (0.09 * wash + 0.012) * uGrid * night * (1.0 - win);
      float halo = lit * (1.0 - win) * smoothstep(0.5, 0.2, max(abs(f.x - 0.5), abs(f.y - 0.55) * 0.9));
      totalEmissiveRadiance += base * warm * halo * 0.05 * uGrid * night;
      col *= 0.85 + 0.3 * h21(floor(vec2(u * 0.7, y * 0.9)) + seed);    // weathering, patched render
      diffuseColor.rgb = col;
      // ledges: snow on the tops of things
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.88, 0.92), snowAmt * uSnow);
    } else {
      diffuseColor.rgb = mix(base * 0.4 + 0.03 * h21(floor(vWP.xz * 0.5)), vec3(0.88, 0.9, 0.94), uSnow * step(0.5, vON.y));
    }
    // the broken faces glow as the ground tears (uHeat: lit from below)
    totalEmissiveRadiance += vec3(1.6, 0.45, 0.1) * uHeat * smoothstep(8.0, 0.0, y) * 0.04;
  }
`;

export function cityMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, CU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aS;
        varying vec3 vLoc; varying vec3 vSc; varying vec3 vWN; varying vec4 vS; varying vec3 vON; varying vec3 vWP;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vLoc = position; vON = normal; vS = aS;
        vSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vec4 wpp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWP = wpp.xyz;
        vWN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * (normal / (vSc * vSc)));`);
    shader.fragmentShader = PARS + shader.fragmentShader.replace('#include <emissivemap_fragment>', LOOK);
  };
  m.customProgramCacheKey = () => 'city-v1';
  return m;
}

const m4 = new THREE.Matrix4(), mS = new THREE.Matrix4();
const col = new THREE.Color();
export function makeCity(scene) {
  const n = B.length;
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const aS = new Float32Array(n * 4);
  B.forEach((b, i) => aS.set([b.seed, b.kind, b.h, 0], i * 4));
  geo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
  const mesh = new THREE.InstancedMesh(geo, cityMaterial(), n);
  mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
  B.forEach((b, i) => { mesh.setColorAt(i, col.set(b.col)); b.local = new THREE.Matrix4().makeTranslation(b.x, 0, b.z).multiply(mS.makeScale(b.w, b.h, b.d)); mesh.setMatrixAt(i, b.local); });
  scene.add(mesh);
  let moved = false;
  return {
    mesh,
    // plateOf(b) -> Matrix4 or null: where the ground under each building has gone
    frame(plateOf) {
      if (!plateOf && !moved) return;
      moved = !!plateOf;
      for (let i = 0; i < n; i++) {
        const P = plateOf && plateOf(B[i]);
        mesh.setMatrixAt(i, P ? m4.multiplyMatrices(P, B[i].local) : B[i].local);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

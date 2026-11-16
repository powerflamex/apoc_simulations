// The ground: the avenue and the cross street (two lanes each way, double yellow lines, crosswalks on all four
// sides), concrete sidewalks with curbs. Snow in winter (sidewalks white, the roads grey slush in the tyre tracks).
// The empty centuries: cracks spread, weeds and grass come up through them, the asphalt breaks up into meadow; then
// the forest floor (leaf litter and moss) covers everything.
import * as THREE from 'three';
import { AV, FX, CZ, CR, FZ, XWALK_S, XWALK_N, XWALK_E, XWALK_W } from './layout.js';
import { hazed } from './city.js';
import { GLSL_TERRAIN, PATCH } from './terrain.js';
import { smooth } from './util.js';

export const GU = {
  uSnow: { value: 0 }, uWild: { value: 0 }, uSoil: { value: 0 }, uEra: { value: 0 },
  uRiver: { value: 0 }, uMeander: { value: 0 }, uSoilH: { value: 0 },
};
const f = (x) => x.toFixed(2);

export function makeGround(scene) {
  const mat = hazed(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 }));
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    Object.assign(shader.uniforms, GU);
    // the ground bends into the river valley and the mounds (terrain.js); the normal from the slope
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGW; varying float vBed;
        ${GLSL_TERRAIN}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        {
          vec2 P0 = (modelMatrix * vec4(position, 1.0)).xz;
          float hx = groundH(P0 + vec2(0.4, 0.0)) - groundH(P0 - vec2(0.4, 0.0));
          float hz = groundH(P0 + vec2(0.0, 0.4)) - groundH(P0 - vec2(0.0, 0.4));
          objectNormal = normalize(vec3(-hx / 0.8, 1.0, -hz / 0.8));
        }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec2 P0 = (modelMatrix * vec4(position, 1.0)).xz;
          transformed.y += groundH(P0);
          vBed = riverDepth(P0);
        }`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGW; varying float vBed;
        uniform float uSnow; uniform float uWild; uniform float uSoil; uniform float uEra;
        float g21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(g21(i), g21(i + vec2(1, 0)), f.x), mix(g21(i + vec2(0, 1)), g21(i + vec2(1, 1)), f.x), f.y); }
        float fb(vec2 p){ return gn(p) * 0.5 + gn(p * 2.1 + 3.7) * 0.3 + gn(p * 4.3 + 1.1) * 0.2; }
        float band(float x, float a, float b, float w) { return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }
        // a network of cracks: thin dark lines along the edges of a warped cell noise
        float cracks(vec2 p) {
          p += vec2(gn(p * 0.7), gn(p * 0.7 + 9.0)) * 1.4;
          vec2 i = floor(p), fr = fract(p);
          float d1 = 9.0, d2 = 9.0;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            vec2 o = vec2(float(x), float(y));
            vec2 c = o + vec2(g21(i + o), g21(i + o + 5.3)) - fr;
            float d = dot(c, c);
            if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
          }
          return sqrt(d2) - sqrt(d1);
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 P = vGW.xz;
        float aw = max(fwidth(P.x), fwidth(P.y)) * 0.7;
        float ax = abs(P.x), dz = abs(P.y - (${f(CZ)}));
        bool avRoad = ax < ${f(AV)};
        bool crRoad = dz < ${f(CR)};
        bool road = avRoad || crRoad;
        vec3 c;
        float paint = 0.0, yellow = 0.0;
        float n = gn(P * 2.5) * 0.5 + gn(P * 9.0) * 0.5;
        if (road) {
          c = vec3(0.16, 0.16, 0.17) * (0.85 + 0.3 * n);
          c *= 0.92 + 0.08 * gn(P * 0.3);
          bool inX = avRoad && crRoad;
          if (avRoad && !inX) {
            yellow = max(band(P.x, -0.28, -0.1, aw), band(P.x, 0.1, 0.28, aw));
            float dash = step(0.45, fract(P.y / 9.0));
            paint = max(paint, (band(P.x, 3.65, 3.85, aw) + band(P.x, -3.85, -3.65, aw)) * dash);
            float onS = band(P.y, ${f(XWALK_S[0])}, ${f(XWALK_S[1])}, aw), onN = band(P.y, ${f(XWALK_N[0])}, ${f(XWALK_N[1])}, aw);
            paint = max(paint, (onS + onN) * band(fract(P.x / 1.2), 0.0, 0.55, aw / 1.2));
            yellow *= 1.0 - onS - onN;
          } else if (crRoad && !inX) {
            float rz = P.y - (${f(CZ)});
            yellow = max(band(rz, -0.28, -0.1, aw), band(rz, 0.1, 0.28, aw));
            float dash = step(0.45, fract(P.x / 9.0));
            paint = max(paint, (band(rz, 3.5, 3.7, aw) + band(rz, -3.7, -3.5, aw)) * dash);
            float onE = band(P.x, ${f(XWALK_E[0])}, ${f(XWALK_E[1])}, aw), onW = band(P.x, ${f(XWALK_W[0])}, ${f(XWALK_W[1])}, aw);
            paint = max(paint, (onE + onW) * band(fract(P.y / 1.2), 0.0, 0.55, aw / 1.2));
            yellow *= 1.0 - onE - onW;
          }
          // (the new city repaints its roads: paler, the lines fade with neglect)
          float wear = 0.75 + 0.25 * gn(P * 1.7);
          float fade = 1.0 - 0.8 * uWild;
          c = mix(c, vec3(0.86, 0.86, 0.82) * wear, paint * 0.92 * fade);
          c = mix(c, mix(vec3(0.85, 0.66, 0.14), vec3(0.8, 0.82, 0.84), uEra) * wear, yellow * 0.9 * fade);
          c = mix(c, c * 1.35 + 0.03, uEra * (1.0 - paint) * (1.0 - yellow) * 0.6);
        } else {
          // concrete sidewalk slabs
          vec2 t = fract(P / 1.5);
          float joint = min(min(t.x, 1.0 - t.x), min(t.y, 1.0 - t.y));
          c = vec3(0.6, 0.58, 0.55) * (0.88 + 0.2 * g21(floor(P / 1.5))) * (0.9 + 0.15 * n);
          c *= 0.84 + 0.16 * smoothstep(0.0, 0.03 + aw, joint);
          if (ax > ${f(FX + 0.5)} && dz > ${f(FZ + 0.5)}) c *= 0.7;
        }
        // snow: white on the sidewalks, grey slush in the tyre tracks on the roads
        {
          float drift = 0.8 + 0.2 * gn(P * 0.6);
          vec3 snowC = vec3(0.86, 0.89, 0.94) * drift;
          float tracks = road ? 0.55 * (0.5 + 0.5 * sin(P.x * 1.7) * sin(P.y * 0.03 + P.x)) : 0.0;
          c = mix(c, mix(snowC, vec3(0.42, 0.42, 0.44), tracks), uSnow * (road ? 0.75 : 0.95));
        }
        // the empty centuries: cracks, weeds in them, then grass and meadow breaking up the asphalt
        float wildK = uWild;
        float cr = cracks(P * (road ? 0.35 : 0.55));
        float crack = (1.0 - smoothstep(0.0, 0.06 + aw * 0.4, cr)) * smoothstep(0.0, 0.25, wildK);
        vec3 weed = mix(vec3(0.16, 0.26, 0.07), vec3(0.32, 0.4, 0.12), gn(P * 3.0));
        c = mix(c, vec3(0.05), crack * 0.6);
        c = mix(c, weed, crack * smoothstep(0.15, 0.5, wildK));
        float meadow = smoothstep(wildK * 1.25 - 0.15, wildK * 1.25 + 0.05, 1.0 - fb(P * 0.18) * 0.9 - (road ? 0.0 : 0.1));
        vec3 grass = mix(vec3(0.2, 0.34, 0.08), vec3(0.42, 0.48, 0.16), fb(P * 0.9)) * (0.85 + 0.3 * gn(P * 6.0));
        c = mix(c, grass, (1.0 - meadow) * smoothstep(0.05, 0.3, wildK));
        // the forest floor: leaf litter and moss under the trees
        vec3 floorC = mix(vec3(0.17, 0.13, 0.08), vec3(0.14, 0.22, 0.07), fb(P * 0.5)) * (0.8 + 0.4 * gn(P * 5.0));
        c = mix(c, floorC, uSoil * smoothstep(0.0, 0.4, uSoil + fb(P * 0.3) * 0.5 - 0.2));
        // the river valley: bare earth banks, wet mud and pebbles on the bed
        float bank = smoothstep(0.05, 0.5, vBed);
        vec3 earth = mix(vec3(0.3, 0.22, 0.14), vec3(0.22, 0.17, 0.11), gn(P * 1.3));
        vec3 bed = mix(vec3(0.16, 0.14, 0.11), vec3(0.34, 0.31, 0.26), step(0.62, gn(P * 4.0))) * (0.8 + 0.3 * gn(P * 9.0));
        c = mix(c, earth, bank * 0.85);
        c = mix(c, bed, smoothstep(1.2, 2.0, vBed));
        diffuseColor.rgb = c;
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = road ? mix(0.72 + 0.15 * gn(P * 2.0) - paint * 0.1, 0.95, max(uWild, uSnow * 0.5)) : 0.85;`);
    prev(shader, r);
  };
  mat.customProgramCacheKey = () => 'ts-ground-v2';
  // the patch that can change shape (finely divided), and flat ground round it out to the horizon
  const PW = PATCH.x1 - PATCH.x0, PD = PATCH.z1 - PATCH.z0;
  const patch = new THREE.PlaneGeometry(PW, PD, Math.round(PW / 0.8), Math.round(PD / 0.8)).rotateX(-Math.PI / 2).translate((PATCH.x0 + PATCH.x1) / 2, 0, (PATCH.z0 + PATCH.z1) / 2);
  const R = 1400, cz = CZ;
  const rect = (x0, x1, z0, z1) => new THREE.PlaneGeometry(x1 - x0, z1 - z0, 1, 1).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const outer = [rect(-R, R, cz - R, PATCH.z0), rect(-R, R, PATCH.z1, cz + R), rect(-R, PATCH.x0, PATCH.z0, PATCH.z1), rect(PATCH.x1, R, PATCH.z0, PATCH.z1)];
  const mesh = new THREE.Mesh(patch, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
  for (const g of outer) { const m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m); }
  // the curbs (left open at the crosswalks); they sink under the soil
  const curbMat = hazed(new THREE.MeshStandardMaterial({ color: 0x8e8a84, roughness: 0.8 }));
  const curbs = [];
  const runZ = (x, z0, z1) => { for (let z = z0; z > z1; z -= 2) curbs.push([x, z - 1, 0]); };
  const runX = (z, x0, x1) => { for (let x = x0; x < x1; x += 2) curbs.push([x + 1, z, 1]); };
  for (const s of [-1, 1]) {
    runZ(s * AV, 300, CZ + CR);
    runZ(s * AV, CZ - CR, -800);
    runX(CZ + s * CR, AV, 700);
    runX(CZ + s * CR, -700, -AV);
  }
  const keep = curbs.filter(([x, z, k]) => {
    if (k === 0) return !(z > XWALK_S[0] - 0.2 && z < XWALK_S[1] + 0.2) && !(z > XWALK_N[0] - 0.2 && z < XWALK_N[1] + 0.2);
    return !(Math.abs(x) > AV + 0.8 && Math.abs(x) < AV + 5.2);
  });
  const cg = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.15, 2.0).translate(0, 0.075, 0), curbMat, keep.length);
  const m4 = new THREE.Matrix4();
  keep.forEach(([x, z, k], i) => cg.setMatrixAt(i, k ? m4.makeRotationY(Math.PI / 2).setPosition(x, 0, z) : m4.makeTranslation(x, 0, z)));
  cg.receiveShadow = true; cg.frustumCulled = false;
  scene.add(cg);
  return {
    mesh,
    frame(s) {
      GU.uSnow.value = s.season.snow * (1 - s.wild);
      GU.uWild.value = s.wild; GU.uSoil.value = s.soil; GU.uEra.value = s.eraB;
      GU.uRiver.value = s.river; GU.uMeander.value = s.meander; GU.uSoilH.value = s.soil;
      // (the curbs crack and sink under the grass as the street goes wild)
      const sinkC = smooth(0.25, 0.75, s.wild);
      cg.visible = sinkC < 0.999;
      cg.position.y = -0.17 * sinkC;
      curbMat.color.setHex(0x8e8a84).lerp(new THREE.Color(0x5a6a3a), s.wild * 0.6);
    },
  };
}

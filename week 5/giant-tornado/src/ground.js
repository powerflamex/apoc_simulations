// The ground: Main Street's asphalt (a double yellow line, angled parking stalls, crosswalks at the cross streets),
// the concrete sidewalks with curbs, the back lots, the fields beyond the town (rows of young corn), the highway on
// through them; then the dark under the wall's foot (uWallZ), and the street itself peeling up at the end: a sheet
// of asphalt (a separate mesh) that stands up from the far end and curls toward the wall, leaving torn dirt behind
// (uPeelZ: the front of the peel).
import * as THREE from 'three';
import { ROAD_X, FX, CROSS, CROSS_W, TOWN_END, HWY_X, CAM0 } from './layout.js';

export const GU = { uTime: { value: 0 }, uWallZ: { value: -1e5 }, uPeelZ: { value: -1e5 }, uPeelK: { value: 0 }, uWet: { value: 0 } };

// the look of the street at rest position P (x, z); shared by the ground and the peeling sheet
export const STREET_GLSL = /* glsl */ `
  float g21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(g21(i), g21(i + vec2(1, 0)), f.x), mix(g21(i + vec2(0, 1)), g21(i + vec2(1, 1)), f.x), f.y); }
  const float ROAD_X = ${ROAD_X.toFixed(1)}, FX = ${FX.toFixed(1)}, TOWN_END = ${TOWN_END.toFixed(1)}, HWY_X = ${HWY_X.toFixed(1)}, CW = ${CROSS_W.toFixed(1)};
  const vec4 CROSSZ = vec4(${CROSS.map((c) => c.toFixed(1)).join(', ')});
  float nearCross(vec2 P) { float d = 1e4; for (int i = 0; i < 4; i++) d = min(d, abs(P.y - CROSSZ[i])); return d; }
  // returns colour; sets 'road' (on asphalt) and 'paint' (markings)
  vec3 streetLook(vec2 P, float aw, out float road, out float paint) {
    float dc = nearCross(P);
    bool town = P.y > TOWN_END - 2.0 && P.y < 90.0;
    bool main = abs(P.x) < ROAD_X && town;
    bool hwy = abs(P.x) < HWY_X && P.y <= TOWN_END - 2.0;
    bool cross = dc < CW && abs(P.x) < 400.0;
    road = (main || hwy || cross) ? 1.0 : 0.0;
    paint = 0.0;
    vec3 c;
    if (road > 0.5) {
      float n = gn(P * 3.0) * 0.5 + gn(P * 13.0) * 0.5;
      c = vec3(0.1, 0.1, 0.105) * (0.75 + 0.5 * n);
      if (main && dc > CW + 0.5) {
        // the double yellow line
        float dy = min(abs(abs(P.x) - 0.2), 1.0);
        paint = max(paint, (1.0 - smoothstep(0.07, 0.07 + aw, dy)) * 0.9);
        // angled parking stalls on both sides (lines every 2.9 m at 55 degrees), each side's own slant
        float s = sign(P.x);
        float along = P.y + s * (ROAD_X - abs(P.x)) * 0.7;
        float st = abs(fract(along / 2.9) - 0.5) * 2.9;
        float inStall = step(ROAD_X - 5.0, abs(P.x));
        paint = max(paint, (1.0 - smoothstep(0.06, 0.06 + aw, st)) * inStall * 0.85);
      }
      if (main && dc < CW + 4.0 && dc > CW + 0.8) {
        // crosswalk stripes at each corner
        float st = fract(P.x / 1.2);
        paint = max(paint, step(0.5, st) * 0.9);
      }
      if (hwy) {
        float dy = abs(P.x);
        paint = max(paint, (1.0 - smoothstep(0.08, 0.08 + aw, dy)) * step(0.5, fract(P.y / 9.0)) * 0.8);
      }
      vec3 pc = mix(vec3(0.85, 0.82, 0.72), vec3(0.9, 0.7, 0.2), step(abs(P.x), 0.6) * step(0.5, road) * (main ? 1.0 : 0.0));
      c = mix(c, pc * (0.8 + 0.2 * gn(P * 20.0)), paint);
    } else if (town && abs(P.x) < FX + 0.2) {
      // the sidewalks: concrete slabs with joints, and the curb
      vec2 tt = fract(P / 1.5);
      float joint = min(min(tt.x, 1.0 - tt.x), min(tt.y, 1.0 - tt.y));
      c = vec3(0.5, 0.49, 0.46) * (0.85 + 0.25 * g21(floor(P / 1.5)));
      c *= 0.72 + 0.28 * smoothstep(0.0, 0.03, joint);
      float curb = abs(abs(P.x) - ROAD_X);
      c = mix(c, vec3(0.6, 0.58, 0.54), 1.0 - smoothstep(0.25, 0.27 + aw, curb));
    } else if (town && abs(P.x) < 160.0) {
      // back lots: gravel, lawns, a few drives
      float n = gn(P * 0.4);
      c = mix(vec3(0.28, 0.33, 0.14), vec3(0.4, 0.37, 0.3), smoothstep(0.45, 0.6, n)) * (0.85 + 0.3 * gn(P * 9.0));
    } else {
      // the fields: rows of young corn running north, a dirt road now and then
      float rows = 0.5 + 0.5 * sin(P.x * 8.4 + gn(P * 0.05) * 3.0);
      float n = gn(P * 0.02);
      vec3 crop = mix(vec3(0.27, 0.36, 0.1), vec3(0.42, 0.44, 0.18), rows * 0.7 + 0.3 * n);
      vec3 dirt = vec3(0.36, 0.27, 0.17);
      c = mix(crop, dirt, smoothstep(0.62, 0.7, gn(P * 0.004 + 3.0)));
      c *= 0.8 + 0.3 * gn(P * 1.5);
    }
    return c;
  }
`;

export function makeGround(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0 });
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
        uniform float uTime, uWallZ, uPeelZ, uPeelK, uWet;
        ${STREET_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 P = vGW.xz;
        float aw = max(fwidth(P.x), fwidth(P.y));
        float road, paint;
        vec3 c = streetLook(P, aw, road, paint);
        // where the street has peeled away: torn dirt and gravel, the broken edge
        float peeled = step(P.y, uPeelZ) * road * step(abs(P.x), ROAD_X + 0.01) * step(TOWN_END, P.y);
        vec3 dirt = vec3(0.3, 0.22, 0.14) * (0.7 + 0.6 * gn(P * 4.0)) * (0.8 + 0.4 * gn(P * 0.5));
        c = mix(c, dirt, peeled);
        // under the wall's foot: dark, the ground churned brown
        float under = smoothstep(uWallZ + 120.0, uWallZ - 60.0, P.y);
        c = mix(c, vec3(0.08, 0.06, 0.045) * (0.6 + 0.8 * gn(P * 0.3 + uTime)), under * 0.85);
        diffuseColor.rgb = c;
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = road > 0.5 ? 0.55 - 0.3 * uWet + 0.2 * gn(P * 2.0) : 0.8;`);
  };
  mat.customProgramCacheKey = () => 'tornado-ground-v1';
  const geo = new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 0, -700);
  mesh.receiveShadow = true;
  scene.add(mesh);
  // curbs: thin raised edges along the road
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x8c8a84, roughness: 0.7 });
  const curbs = [];
  for (const s of [-1, 1]) {
    let z0 = 90;
    for (const c of [...CROSS, TOWN_END - CROSS_W]) {
      curbs.push([s * ROAD_X, (z0 + c + CROSS_W) / 2, z0 - (c + CROSS_W)]);
      z0 = c - CROSS_W;
    }
  }
  const cg = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.15, 1).translate(0, 0.075, 0), curbMat, curbs.length);
  const m4 = new THREE.Matrix4();
  curbs.forEach(([x, z, d], i) => cg.setMatrixAt(i, m4.makeScale(0.3, 1, d).setPosition(x, 0, z)));
  cg.frustumCulled = false;
  cg.receiveShadow = true;
  scene.add(cg);

  // ---- the sheet of asphalt that peels up at the end ----
  const SZ0 = -30, SZ1 = -150;           // the stretch of road that goes
  const SU = { uFront: { value: 1e4 }, uK: { value: 0 }, uTime: GU.uTime };
  const smat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  smat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uFront, uK, uTime;
        varying vec3 vGW; varying float vLift;
        float sh21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float sn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(sh21(i), sh21(i + vec2(1, 0)), f.x), mix(sh21(i + vec2(0, 1)), sh21(i + vec2(1, 1)), f.x), f.y); }
        // where the sheet point that rested at (x, z) is now: beyond the front it stands up and curls toward the wall
        vec3 peelPos(vec2 rest) {
          float s = uFront - rest.y;                       // how far beyond the front (m)
          s += 6.0 * (sn(vec2(rest.x * 0.3, rest.y * 0.05)) - 0.5);
          if (s <= 0.0) return vec3(rest.x, 0.0, rest.y);
          const float RC = 10.0;
          float th = min(s / RC, 1.5708);
          float y = RC * (1.0 - cos(th));
          float z = uFront - RC * sin(th);
          float rest2 = max(s - RC * 1.5708, 0.0);
          y += rest2 * 0.3 + 2.5 * sin(rest2 * 0.14 + uTime * 5.0 + rest.x * 0.3) * smoothstep(0.0, 15.0, rest2);
          z -= rest2 * 1.7;
          // tearing: strips at different heights
          float tear = (sn(vec2(rest.x * 0.45 + 2.0, rest.y * 0.08)) - 0.5) * 14.0 * smoothstep(0.0, 25.0, s);
          y += tear * uK;
          return vec3(rest.x + (sn(vec2(rest.y * 0.1, 1.0)) - 0.5) * 3.0 * smoothstep(0.0, 30.0, s), y, z);
        }`)
      .replace('#include <beginnormal_vertex>', `
        vec2 rest = vec2(position.x, position.z);
        vec3 pp = peelPos(rest);
        // the normal from the displaced neighbours
        vec3 pz = peelPos(rest + vec2(0.0, -1.0)), px = peelPos(rest + vec2(1.0, 0.0));
        vec3 nn = normalize(cross(px - pp, pz - pp));
        vec3 objectNormal = nn;`)
      .replace('#include <begin_vertex>', `
        vec3 transformed = pp;
        vLift = max(uFront - rest.y, 0.0);
        vGW = vec3(rest.x, 0.0, rest.y);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGW; varying float vLift;
        uniform float uTime, uFront, uK;
        ${STREET_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 P = vGW.xz;
        float aw = max(fwidth(P.x), fwidth(P.y));
        float road, paint;
        vec3 c = streetLook(P, aw, road, paint);
        // the underside, where it's lifted, is torn gravel and tar
        vec3 under = vec3(0.22, 0.17, 0.12) * (0.6 + 0.8 * gn(P * 5.0));
        c = mix(c, under, gl_FrontFacing ? 0.0 : 1.0);
        diffuseColor.rgb = c;`);
  };
  smat.customProgramCacheKey = () => 'tornado-sheet-v1';
  const sgeo = new THREE.PlaneGeometry(ROAD_X * 2, SZ0 - SZ1, 6, 180).rotateX(-Math.PI / 2);
  sgeo.translate(0, 0.03, (SZ0 + SZ1) / 2);
  const sheet = new THREE.Mesh(sgeo, smat);
  sheet.frustumCulled = false;
  sheet.castShadow = false; sheet.receiveShadow = true;
  sheet.visible = false;
  scene.add(sheet);
  return {
    mesh, mat, sheet, SU,
    // k: 0..1 how far the peel has run (the front runs from the far end of the sheet toward you)
    peel(k, v) {
      sheet.visible = k > 0;
      const front = SZ1 + 8 + (-60 - SZ1 - 8) * k;
      SU.uFront.value = k > 0 ? front : 1e4;
      SU.uK.value = k;
      GU.uPeelZ.value = k > 0 ? front : -1e5;
      GU.uPeelK.value = k;
      return front;
    },
    SZ0, SZ1,
  };
}

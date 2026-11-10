// The ground: the avenue (two lanes each way, the paved median you stand on, the west sidewalk, the side streets), the
// promenade along the harbour, the quay wall and the harbour itself. Where the T. rex has put its feet the asphalt is
// cracked (uPrints: up to 32 footprints, x, z, heading, time). The harbour: small waves that mirror the sky, the Sun's
// glitter, and the rings and foam where the Mosasaurus comes down (uSplash).
import * as THREE from 'three';
import { MED, CURB, FXW, QX, SIDE1, SIDE2, END_Z, END_Z2, SEA_Y } from './layout.js';

export const NPRINT = 32;
export const GU = {
  uTime: { value: 0 },
  uSkyHi: { value: new THREE.Color(0.1, 0.3, 0.78) }, uSkyLo: { value: new THREE.Color(0.62, 0.78, 0.95) }, uSun: { value: new THREE.Vector3(0.3, 0.6, 0.7) },
  uHaze: { value: new THREE.Color(0.7, 0.8, 0.92) }, uHazeD: { value: 6000 },
  uPrints: { value: Array.from({ length: NPRINT }, () => new THREE.Vector4(0, 0, 0, -1)) },
  uSplash: { value: new THREE.Vector4(0, 0, -100, 0) },      // x, z, time it hit, strength
};

const NOISE = /* glsl */ `
  float g21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(g21(i), g21(i + vec2(1, 0)), f.x), mix(g21(i + vec2(0, 1)), g21(i + vec2(1, 1)), f.x), f.y); }
  vec3 skyRef(vec3 r) { return mix(uSkyLo, uSkyHi, pow(clamp(r.y, 0.0, 1.0), 0.5)); }
`;

export function makeGround(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0 });
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
        uniform float uTime; uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform vec3 uSun; uniform vec3 uHaze; uniform float uHazeD;
        uniform vec4 uPrints[${NPRINT}];
        ${NOISE}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 P = vGW.xz;
        float aw = max(fwidth(P.x), fwidth(P.y));
        float bx = abs(P.x);
        bool side1 = P.y > ${SIDE1[0].toFixed(1)} && P.y < ${SIDE1[1].toFixed(1)} && P.x < -${CURB.toFixed(1)};
        bool side2 = P.y > ${SIDE2[0].toFixed(1)} && P.y < ${SIDE2[1].toFixed(1)} && P.x < -${CURB.toFixed(1)};
        bool cross = P.y < ${END_Z.toFixed(1)} && P.y > ${END_Z2.toFixed(1)} && P.x < ${(CURB).toFixed(1)};
        bool road = (bx > ${MED.toFixed(1)} && bx < ${CURB.toFixed(1)}) || side1 || side2 || cross;
        bool prom = P.x > ${CURB.toFixed(1)};
        vec3 c;
        float paint = 0.0;
        if (road) {
          float n = gn(P * 3.0) * 0.5 + gn(P * 11.0) * 0.5;
          c = vec3(0.19, 0.19, 0.2) * (0.85 + 0.3 * n) * (0.92 + 0.16 * gn(P * 0.15));
          if (!side1 && !side2 && !cross) {
            float lane = abs(bx - ${((MED + CURB) / 2).toFixed(2)});
            paint = max(paint, (1.0 - smoothstep(0.07, 0.07 + aw, lane)) * step(0.5, fract(P.y / 9.0)));
            // a solid yellow line along the median, a white one along the curbs
            float ml = abs(bx - ${(MED + 0.35).toFixed(2)});
            float ye = 1.0 - smoothstep(0.06, 0.06 + aw, ml);
            c = mix(c, vec3(0.85, 0.66, 0.16), ye * 0.9);
            float cl = abs(bx - ${(CURB - 0.35).toFixed(2)});
            paint = max(paint, 1.0 - smoothstep(0.06, 0.06 + aw, cl));
            // zebra crossings at the side streets
            float zc = min(abs(P.y - ${((SIDE1[0] + SIDE1[1]) / 2).toFixed(1)}), abs(P.y - ${((SIDE2[0] + SIDE2[1]) / 2).toFixed(1)}));
            paint = max(paint, step(zc, 1.8) * step(0.5, fract(P.x / 1.1)) * step(${(MED + 0.8).toFixed(1)}, bx) * step(bx, ${(CURB - 0.8).toFixed(1)}) * step(P.x, 0.0));
          }
          c = mix(c, vec3(0.86, 0.86, 0.82), paint * 0.9);
        } else if (prom) {
          // the promenade: warm stone pavers
          vec2 t = fract(P / vec2(1.2, 0.6));
          float joint = min(min(t.x, 1.0 - t.x) * 1.2, min(t.y, 1.0 - t.y) * 0.6);
          c = vec3(0.7, 0.62, 0.52) * (0.86 + 0.24 * g21(floor(P / vec2(1.2, 0.6))));
          c *= 0.82 + 0.18 * smoothstep(0.0, 0.035, joint);
          c = mix(c, vec3(0.5, 0.48, 0.45), step(${(QX - 1.2).toFixed(1)}, P.x));
        } else if (bx <= ${MED.toFixed(1)}) {
          // the median: big pale slabs
          vec2 t = fract(P / vec2(2.5, 1.25));
          float joint = min(min(t.x, 1.0 - t.x) * 2.5, min(t.y, 1.0 - t.y) * 1.25);
          c = vec3(0.68, 0.65, 0.6) * (0.86 + 0.24 * g21(floor(P / vec2(2.5, 1.25))));
          c *= 0.8 + 0.2 * smoothstep(0.0, 0.05, joint);
        } else {
          vec2 t = fract(P / 0.6);
          float joint = min(min(t.x, 1.0 - t.x), min(t.y, 1.0 - t.y));
          c = vec3(0.62, 0.6, 0.57) * (0.88 + 0.24 * g21(floor(P / 0.6)));
          c *= 0.82 + 0.18 * smoothstep(0.0, 0.04, joint);
        }
        // where its feet came down: a dark cracked dent, three toes long
        float crk = 0.0;
        for (int i = 0; i < ${NPRINT}; i++) {
          vec4 F = uPrints[i];
          if (F.w < 0.0 || uTime < F.w) continue;
          vec2 d = P - F.xy;
          float cs = cos(F.z), sn = sin(F.z);
          vec2 q = vec2(d.x * cs - d.y * sn, d.x * sn + d.y * cs);       // q.y: along its heading
          if (dot(q, q) > 9.0) continue;
          // the three toes splayed forward and the heel pad
          float toe = 0.0;
          for (int k = -1; k <= 1; k++) {
            float a = float(k) * 0.42;
            vec2 o = vec2(sin(a), cos(a));
            float along = dot(q, o), across = abs(dot(q, vec2(o.y, -o.x)));
            toe = max(toe, (1.0 - smoothstep(0.16, 0.24, across)) * smoothstep(-0.1, 0.1, along) * (1.0 - smoothstep(0.85, 1.05, along)));
          }
          float pad = 1.0 - smoothstep(0.28, 0.4, length(q * vec2(1.0, 1.3)));
          float dent = max(toe, pad) * smoothstep(0.0, 0.05, uTime - F.w);
          // cracks spreading out from it
          float r = length(q), ang = atan(q.y, q.x);
          float ray = 1.0 - smoothstep(0.0, 0.05 + aw * 2.0, abs(fract(ang * 1.6 + gn(vec2(r * 3.0, F.x)) * 0.8) - 0.5) * r);
          float cr = ray * (1.0 - smoothstep(0.6, 1.7 + gn(vec2(ang * 3.0, F.y)) * 0.8, r)) * smoothstep(0.3, 0.5, r);
          crk = max(crk, max(dent * 0.8, cr * 0.7) * smoothstep(0.0, 0.08, uTime - F.w));
        }
        c = mix(c, c * 0.35, crk);
        diffuseColor.rgb = c;
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = road ? 0.78 + 0.12 * gn(P * 2.0) - paint * 0.1 : 0.82;`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.directSpecular *= 0.35;`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, 1.0 - exp(-length(vGW - cameraPosition) / uHazeD));`);
  };
  mat.customProgramCacheKey = () => 'dino-ground-v1';
  const geo = new THREE.PlaneGeometry(QX + 400, 320).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((QX - 400) / 2, 0, -15);
  mesh.receiveShadow = true;
  scene.add(mesh);
  // the curbs
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x8a8680, roughness: 0.8 });
  const curbs = [];
  const gap = (z, x) => x < 0 && x < -CURB + 1 && ((z > SIDE1[0] && z < SIDE1[1]) || (z > SIDE2[0] && z < SIDE2[1]));
  for (const x of [-CURB, -MED, MED, CURB]) for (let k = 0; k < 46; k++) {
    const z = 120 - (k + 0.5) * 5;
    if (z < END_Z || gap(z, x)) continue;
    curbs.push([x, z, 5]);
  }
  const cg = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.16, 1).translate(0, 0.08, 0), curbMat, curbs.length);
  const m4 = new THREE.Matrix4();
  curbs.forEach((c, i) => cg.setMatrixAt(i, m4.makeScale(1, 1, c[2]).setPosition(c[0], 0, c[1])));
  cg.receiveShadow = true;
  scene.add(cg);
  // the quay wall and a railing along it
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x8c8378, roughness: 0.9 });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1.0, -SEA_Y + 1.2, 320).translate(0, (SEA_Y - 1.2) / 2, 0), wallMat);
  wall.position.set(QX + 0.5, 0, -15);
  wall.receiveShadow = true;
  scene.add(wall);
  const railMat = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.5, metalness: 0.5 });
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 320), railMat);
  rail.position.set(QX - 0.2, 1.05, -15);
  scene.add(rail);
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 1.05, 0.07).translate(0, 0.525, 0), railMat, 160);
  for (let k = 0; k < 160; k++) posts.setMatrixAt(k, m4.makeTranslation(QX - 0.2, 0, 145 - k * 2));
  posts.castShadow = true;
  scene.add(posts);

  // ---- the harbour ----
  const seaMat = new THREE.ShaderMaterial({
    uniforms: GU,
    vertexShader: /* glsl */ `
      uniform float uTime; uniform vec4 uSplash;
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        // the rings running out from where it came down
        float st = uTime - uSplash.z;
        if (st > 0.0 && uSplash.w > 0.0) {
          float r = length(w.xz - uSplash.xy);
          float R = 4.0 + st * 9.0;
          w.y += uSplash.w * 1.3 * exp(-pow((r - R) / 3.5, 2.0)) * exp(-st * 0.35) * sin((r - R) * 0.7 + 1.5);
        }
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform vec3 uSun; uniform vec3 uHaze; uniform float uHazeD; uniform vec4 uSplash;
      varying vec3 vW;
      ${NOISE}
      vec2 wv(vec2 p, float t) {   // slope of a few crossing wave trains
        vec2 g = vec2(0.0);
        vec4 D[4]; D[0] = vec4(0.8, 0.6, 0.35, 1.3); D[1] = vec4(-0.5, 0.86, 0.6, 1.9); D[2] = vec4(0.2, -0.98, 1.1, 2.6); D[3] = vec4(0.95, -0.3, 2.3, 3.7);
        for (int i = 0; i < 4; i++) { float k = D[i].z; float a = 0.12 / k; g += D[i].xy * k * a * cos(dot(D[i].xy, p) * k + t * D[i].w); }
        return g;
      }
      void main() {
        vec3 V = normalize(vW - cameraPosition);
        float dist = length(vW - cameraPosition);
        vec2 P = vW.xz;
        vec2 g = wv(P, uTime);
        // (small ripples fade with distance, so they don't shimmer)
        float fine = 1.0 - smoothstep(60.0, 220.0, dist);
        g += fine * 0.08 * (vec2(gn(P * 1.7 + uTime * 0.6), gn(P * 1.7 - uTime * 0.5 + 9.0)) - 0.5);
        vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 R = reflect(V, N);
        float fres = 0.03 + 0.97 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
        vec3 deep = vec3(0.03, 0.12, 0.16);
        vec3 c = mix(deep, skyRef(R) * 0.95, clamp(fres, 0.0, 1.0));
        c += vec3(1.2, 1.1, 0.9) * pow(max(dot(R, uSun), 0.0), 300.0) * 6.0;
        // foam where it came down: a white boil that thins as it spreads
        float st = uTime - uSplash.z;
        if (st > 0.0 && uSplash.w > 0.0) {
          float r = length(P - uSplash.xy);
          float R0 = 4.0 + st * 9.0;
          float foam = (exp(-r / (6.0 + st * 4.0)) * exp(-st * 0.4) + 0.6 * exp(-pow((r - R0) / 2.5, 2.0)) * exp(-st * 0.5)) * uSplash.w;
          foam *= 0.6 + 0.6 * gn(P * 0.9 + st);
          c = mix(c, vec3(0.92, 0.95, 0.96), clamp(foam, 0.0, 0.95));
        }
        c = mix(c, uHaze, 1.0 - exp(-dist / uHazeD));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sg = new THREE.PlaneGeometry(400, 400, 200, 200).rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(sg, seaMat);
  sea.position.set(QX + 200, SEA_Y, -20);
  sea.frustumCulled = false;
  scene.add(sea);
  const far = new THREE.Mesh(new THREE.PlaneGeometry(4000, 6000).rotateX(-Math.PI / 2), seaMat);
  far.position.set(QX + 400 + 2000, SEA_Y - 0.05, -20);
  far.frustumCulled = false;
  scene.add(far);
  // (the near strip, out to 400 m, is a separate mesh so the far one can be coarse)
  return { mesh, sea, GU };
}

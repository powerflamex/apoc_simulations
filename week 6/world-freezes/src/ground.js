// The ground: the avenue on a sunny day (the paved plaza down the middle, two lanes each way, sidewalks), the quay at its
// end and the sea beyond. Then the cold, in the order it comes: rime racing up the street just ahead of the frost front;
// a glittering crust of dry ice; puddles of liquid air, pale blue mirrors; and the frozen air lying over everything like
// snow. The sea's waves were caught by the front before you could see them: they stand frozen mid-roll; at 0:33 the ice
// splits into plates, the cracks racing in from the bay toward you.
import * as THREE from 'three';
import { ROAD_X, PROM, QUAY, FX, groundGLSL, SEA_Y, DROP } from './layout.js';

export const GU = {
  uTime: { value: 0 }, uFront: { value: -1e4 }, uFrost: { value: 0 }, uDust: { value: 0 }, uPool: { value: 0 }, uCover: { value: 0 },
  uSkyHi: { value: new THREE.Color(0.1, 0.3, 0.78) }, uSkyLo: { value: new THREE.Color(0.62, 0.78, 0.95) }, uSun: { value: new THREE.Vector3(0.3, 0.6, 0.7) },
  uCrackR: { value: -300 }, uFrontSea: { value: 0 }, uHaze: { value: new THREE.Color(0.7, 0.8, 0.92) }, uHazeD: { value: 9000 },
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
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { float z = (modelMatrix * vec4(position, 1.0)).z; transformed.y += ${groundGLSL('z')}; }`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGW;
        uniform float uTime; uniform float uFront; uniform float uFrost; uniform float uDust; uniform float uPool; uniform float uCover;
        uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform vec3 uSun; uniform vec3 uHaze; uniform float uHazeD;
        ${NOISE}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 P = vGW.xz;
        float aw = max(fwidth(P.x), fwidth(P.y));
        float bx = abs(P.x);
        bool road = bx > ${PROM.toFixed(1)} && bx < ${ROAD_X.toFixed(1)} && P.y > ${(QUAY + 12).toFixed(1)};
        bool quay = P.y <= ${(QUAY + 12).toFixed(1)};
        vec3 c;
        float paint = 0.0;
        if (road) {
          float n = gn(P * 3.0) * 0.5 + gn(P * 11.0) * 0.5;
          c = vec3(0.2, 0.2, 0.21) * (0.85 + 0.3 * n);
          float lane = abs(bx - ${((PROM + ROAD_X) / 2).toFixed(1)});
          paint = max(paint, (1.0 - smoothstep(0.07, 0.07 + aw, lane)) * step(0.5, fract(P.y / 8.0)));
          // a zebra crossing just ahead of you
          float zc = abs(P.y + 30.0);
          paint = max(paint, step(zc, 2.0) * step(0.5, fract(P.x / 1.1)));
          c = mix(c, vec3(0.86, 0.86, 0.82), paint * 0.9);
        } else if (bx <= ${PROM.toFixed(1)} || quay) {
          // the plaza: big pale slabs, a band of warm stone down the middle
          vec2 t = fract(P / vec2(2.4, 1.2));
          float joint = min(min(t.x, 1.0 - t.x) * 2.4, min(t.y, 1.0 - t.y) * 1.2);
          c = vec3(0.66, 0.62, 0.56) * (0.86 + 0.26 * g21(floor(P / vec2(2.4, 1.2))));
          c = mix(c, vec3(0.62, 0.48, 0.38), step(bx, 1.2) * (quay ? 0.0 : 1.0));
          c *= 0.8 + 0.2 * smoothstep(0.0, 0.05, joint);
        } else {
          vec2 t = fract(P / 0.6);
          float joint = min(min(t.x, 1.0 - t.x), min(t.y, 1.0 - t.y));
          c = vec3(0.6, 0.58, 0.55) * (0.88 + 0.24 * g21(floor(P / 0.6)));
          c *= 0.82 + 0.18 * smoothstep(0.0, 0.04, joint);
        }
        float cb = min(abs(bx - ${PROM.toFixed(1)}), abs(bx - ${ROAD_X.toFixed(1)}));
        if (!quay) c = mix(c, vec3(0.72, 0.7, 0.66), 1.0 - smoothstep(0.14, 0.17 + aw, cb));
        // rime: it runs up the street a few metres ahead of the frost front, in feathery fingers
        float fing = gn(P * vec2(0.9, 0.25)) * 6.0 + gn(P * 3.0) * 2.0;
        float rime = smoothstep(uFront + 3.0 + fing, uFront - 6.0 + fing, P.y);
        float fn = gn(P * 9.0) * 0.6 + gn(P * 31.0) * 0.4;
        float frK = clamp(rime * uFrost * (0.75 + 0.5 * fn), 0.0, 1.0);
        c = mix(c, vec3(0.84, 0.9, 0.97), frK * 0.85);
        // dry ice: a brighter, glittering crust
        c = mix(c, vec3(0.93, 0.95, 0.98), uDust * 0.5 * rime);
        // liquid air: shallow pools that join up as it pours
        float pn = gn(P * 0.16) * 0.6 + gn(P * 0.55) * 0.3 + gn(P * 2.0) * 0.1;
        float pool = smoothstep(0.72 - 0.55 * uPool, 0.76 - 0.55 * uPool, pn) * uPool;
        c = mix(c, vec3(0.06, 0.2, 0.45), pool * 0.92);
        // the frozen air, lying on everything
        float cov = uCover * smoothstep(0.25, 0.6, uCover + 0.35 * fn - 0.12);
        c = mix(c, vec3(0.94, 0.96, 1.0), cov);
        diffuseColor.rgb = c;
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = road ? 0.75 + 0.15 * gn(P * 2.0) - paint * 0.1 : 0.8;
        roughnessFactor = mix(roughnessFactor, 0.45, frK);
        roughnessFactor = mix(roughnessFactor, 0.08, pool);
        roughnessFactor = mix(roughnessFactor, 0.9, cov);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 V = normalize(vGW - cameraPosition);
          vec3 Rf = reflect(V, vec3(0.0, 1.0, 0.0));
          float fres = 0.04 + 0.96 * pow(1.0 - abs(V.y), 5.0);
          // the pools mirror the sky
          // (rings where the drops land)
          vec2 rc = floor(P * 0.7); vec2 rf = fract(P * 0.7) - 0.5;
          float ph = fract(uTime * 1.3 + g21(rc));
          float ring = (1.0 - smoothstep(0.0, 0.05, abs(length(rf) - ph * 0.45))) * (1.0 - ph) * step(0.4, g21(rc + 4.0));
          totalEmissiveRadiance += (skyRef(Rf) * 0.5 + vec3(0.1, 0.28, 0.6)) * pool * (0.5 + 0.5 * fres) + vec3(0.5, 0.65, 0.9) * ring * pool * 0.6;
          // glints in the rime and the dry ice
          vec2 cc = floor(P * 26.0);
          float g = step(0.985 - 0.01 * uDust, g21(cc)) * (0.5 + 0.5 * sin(uTime * 4.0 + g21(cc + 9.0) * 50.0));
          float sizeOk = smoothstep(0.08, 0.02, aw);
          totalEmissiveRadiance += vec3(1.7, 1.85, 2.1) * g * (frK + uDust * rime + cov * 0.6) * 0.8 * sizeOk;
        }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.directSpecular *= 0.3 + 0.7 * pool;`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, 1.0 - exp(-length(vGW - cameraPosition) / uHazeD));`);
  };
  mat.customProgramCacheKey = () => 'freeze-ground-v1';
  const geo = new THREE.PlaneGeometry(1400, 360, 1, 180).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 0, QUAY + 180);
  mesh.receiveShadow = true;
  scene.add(mesh);
  // the curbs
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x8a8680, roughness: 0.8 });
  curbMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      { float z = (modelMatrix * instanceMatrix * vec4(position, 1.0)).z; transformed.y += ${groundGLSL('z')}; }`);
  };
  const curbs = [];
  for (const s of [-1, 1]) for (const x of [ROAD_X, PROM]) for (let k = 0; k < 60; k++) curbs.push([s * x, 70 - (k + 0.5) * 5, 5]);
  const cg = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.16, 1).translate(0, 0.08, 0), curbMat, curbs.length);
  const m4 = new THREE.Matrix4();
  curbs.forEach((c, i) => cg.setMatrixAt(i, m4.makeScale(1, 1, c[2]).setPosition(c[0], 0, c[1])));
  cg.receiveShadow = true;
  scene.add(cg);

  // ---- the sea ----
  const seaMat = new THREE.ShaderMaterial({
    uniforms: GU,
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uFrontSea; uniform float uCrackR;
      varying vec3 vW; varying float vH;
      float g21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      vec3 vorV(vec2 p) {
        vec2 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0; vec2 id = vec2(0.0);
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 o = vec2(float(x), float(y)); vec2 r = o + vec2(g21(i + o), g21(i + o + 17.0)) - f;
          float d = dot(r, r);
          if (d < d1) { d2 = d1; d1 = d; id = i + o; } else if (d < d2) d2 = d;
        }
        return vec3(sqrt(d2) - sqrt(d1), id);
      }
      float wave(vec2 p, float t) {
        return 0.45 * sin(p.x * 0.05 + p.y * 0.11 + t * 1.3) + 0.25 * sin(p.x * 0.13 - p.y * 0.07 + t * 1.9) + 0.12 * sin(p.x * 0.31 + p.y * 0.23 + t * 2.7);
      }
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        // the waves stop where they were when the front passed (it came in from the bay)
        float t = min(uTime, 3.0 + (w.z - 8.0) / 40.0);
        float h = wave(w.xz, t);
        // the ice splits into plates; along the cracks it heaves up in ridges, and each plate tilts
        vec3 vo = vorV(w.xz / 70.0);
        float xc = 2400.0 + w.z + 80.0 * g21(vo.yz);
        float reach = smoothstep(uCrackR + 40.0, uCrackR - 40.0, xc);
        float ridge = (1.0 - smoothstep(0.0, 0.09, vo.x)) * (0.6 + 0.8 * g21(vo.yz + 5.0));
        h += reach * (4.5 * ridge + 1.2 * (g21(vo.yz + 3.0) - 0.5));
        w.y += h; vH = h; vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform vec3 uSun; uniform float uCrackR; uniform float uCover; uniform vec3 uHaze; uniform float uHazeD;
      varying vec3 vW; varying float vH;
      ${NOISE}
      // plates: the nearest of a jittered grid of points
      vec3 vor(vec2 p) {
        vec2 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0; vec2 id = vec2(0.0);
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 o = vec2(float(x), float(y)); vec2 r = o + vec2(g21(i + o), g21(i + o + 17.0)) - f;
          float d = dot(r, r);
          if (d < d1) { d2 = d1; d1 = d; id = i + o; } else if (d < d2) d2 = d;
        }
        return vec3(sqrt(d2) - sqrt(d1), id);
      }
      void main() {
        vec3 V = normalize(vW - cameraPosition);
        vec2 P = vW.xz;
        float dist = length(vW - cameraPosition);
        // sea ice: blue-white, darker in the troughs of the frozen waves, with a sheen of the sky
        vec3 N = normalize(vec3(-dFdx(vH), 1.0, -dFdy(vH)) + vec3(0.0, 2.0, 0.0));
        vec3 ice = mix(vec3(0.24, 0.5, 0.6), vec3(0.6, 0.82, 0.9), smoothstep(-0.6, 0.6, vH));
        ice *= 0.85 + 0.2 * gn(P * 0.08);
        float lit = 0.85 + 0.25 * max(dot(N, uSun), 0.0);
        vec3 c = ice * lit;
        c += skyRef(reflect(V, vec3(0.0, 1.0, 0.0))) * 0.18 * pow(1.0 - abs(V.y), 3.0);
        // the cracks: they race in from the bay (uCrackR: how far from the far side they have come)
        vec3 vo = vor(P / 70.0);
        float xc = 2400.0 + P.y + 80.0 * g21(vo.yz);
        float reach = smoothstep(uCrackR + 40.0, uCrackR - 40.0, xc);
        float lineW = max(fwidth(P.x), fwidth(P.y)) / 70.0;
        float crack = (1.0 - smoothstep(0.0, 0.02 + 1.5 * lineW, vo.x)) * reach;
        float tilt = (g21(vo.yz + 3.0) - 0.5) * reach;
        c *= 1.0 + 0.45 * tilt;
        c = mix(c, vec3(0.95, 0.98, 1.0), crack);
        c += vec3(0.25, 0.3, 0.35) * smoothstep(1.0, 4.0, vH) * reach;
        c += vec3(0.6, 0.8, 1.0) * crack * 0.8 * exp(-abs(uCrackR - xc) / 120.0) * step(0.0, uCrackR);
        // the frozen air over it
        c = mix(c, vec3(0.92, 0.95, 1.0), uCover * 0.25 * (1.0 - crack));
        c = mix(c, uHaze, 1.0 - exp(-dist / uHazeD));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sg = new THREE.PlaneGeometry(2600, 1800, 520, 360).rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(sg, seaMat);
  sea.position.set(0, SEA_Y, QUAY - 900);
  // (beyond it, the open bay to the horizon, flat)
  const far = new THREE.Mesh(new THREE.PlaneGeometry(12000, 4000).rotateX(-Math.PI / 2), seaMat);
  far.position.set(0, SEA_Y - 0.6, QUAY - 1800 - 2000);
  far.frustumCulled = false;
  scene.add(far);
  sea.frustumCulled = false;
  scene.add(sea);
  // the quay's wall and its railing
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x8c8378, roughness: 0.9 });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1400, 2.4, 1.2).translate(0, -1.0, 0), wallMat);
  wall.position.set(0, -DROP, QUAY);
  wall.receiveShadow = true;
  scene.add(wall);
  return { mesh, sea, GU, wallMat };
}
export const STREET_W = FX;

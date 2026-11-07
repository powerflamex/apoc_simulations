// The ground. Near you: the rain-wet avenue at dusk (the paved promenade down the middle, a carriageway of two lanes on
// each side, sidewalks), which falls away down the hill and mirrors the fireball in a long streak up the street. Beyond it:
// the plain, the whole city seen from above as a carpet of streets and lights that goes dark with the blackout, catches
// fire, and is scorched behind the blast front.
import * as THREE from 'three';
import { ROAD_X, FX, PROM, HIT, PLAIN, groundGLSL } from './layout.js';

export const GU = {
  uTime: { value: 0 }, uBlastR: { value: -1 }, uHit: { value: new THREE.Vector2(HIT.x, HIT.z) }, uFireL: { value: 0 },
  uPowerR: { value: 0 }, uBurn: { value: 0 }, uFbDir: { value: new THREE.Vector3(0, 0.2, -1) }, uFbC: { value: new THREE.Color(1, 1, 1) },
  uHaze: { value: new THREE.Color(0.1, 0.1, 0.15) }, uAmb: { value: new THREE.Color(0.1, 0.1, 0.15) },
};

export function makeGround(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, GU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGW;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { float z = (modelMatrix * vec4(position, 1.0)).z; transformed.y += ${groundGLSL}; }`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGW;
        uniform float uTime; uniform float uBlastR; uniform vec2 uHit; uniform vec3 uFbDir; uniform vec3 uFbC; uniform vec3 uHaze;
        float g21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(g21(i), g21(i + vec2(1, 0)), f.x), mix(g21(i + vec2(0, 1)), g21(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 P = vGW.xz;
        float aw = max(fwidth(P.x), fwidth(P.y));
        float bx = abs(P.x);
        bool road = bx > ${PROM.toFixed(1)} && bx < ${ROAD_X.toFixed(1)};
        vec3 c;
        float paint = 0.0;
        if (road) {
          float n = gn(P * 3.0) * 0.5 + gn(P * 11.0) * 0.5;
          c = vec3(0.13, 0.13, 0.14) * (0.8 + 0.4 * n);
          float lane = abs(bx - ${((PROM + ROAD_X) / 2).toFixed(1)});
          paint = max(paint, (1.0 - smoothstep(0.07, 0.07 + aw, lane)) * step(0.5, fract(P.y / 8.0)));
          c = mix(c, vec3(0.72, 0.72, 0.68), paint * 0.9);
        } else if (bx <= ${PROM.toFixed(1)}) {
          // the promenade: big pale slabs, a band of darker stone down the middle
          vec2 t = fract(P / vec2(2.4, 1.2));
          float joint = min(min(t.x, 1.0 - t.x) * 2.4, min(t.y, 1.0 - t.y) * 1.2);
          c = vec3(0.42, 0.40, 0.38) * (0.8 + 0.34 * g21(floor(P / vec2(2.4, 1.2))));
          c = mix(c, c * 0.55, step(bx, 1.2));
          c *= 0.7 + 0.3 * smoothstep(0.0, 0.05, joint);
        } else {
          vec2 t = fract(P / 0.6);
          float joint = min(min(t.x, 1.0 - t.x), min(t.y, 1.0 - t.y));
          c = vec3(0.4, 0.39, 0.38) * (0.85 + 0.3 * g21(floor(P / 0.6)));
          c *= 0.75 + 0.25 * smoothstep(0.0, 0.04, joint);
        }
        // the curbs
        float cb = min(abs(bx - ${PROM.toFixed(1)}), abs(bx - ${ROAD_X.toFixed(1)}));
        c = mix(c, vec3(0.5, 0.49, 0.47), 1.0 - smoothstep(0.14, 0.17 + aw, cb));
        float behind = uBlastR > 0.0 ? smoothstep(uBlastR + 6.0, uBlastR - 12.0, length(P - uHit)) : 0.0;
        c = mix(c, c * vec3(0.3, 0.26, 0.24), behind);
        diffuseColor.rgb = c;
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = road ? 0.6 + 0.2 * gn(P * 2.0) - paint * 0.1 : 0.68;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // the wet street's mirror: a long streak under the fireball, broken up by puddles
          vec3 V = normalize(vGW - cameraPosition);
          vec3 Rf = reflect(V, vec3(0.0, 1.0, 0.0));
          vec2 az = normalize(Rf.xz) - normalize(uFbDir.xz);
          float wet = 0.45 + 0.55 * smoothstep(0.42, 0.62, gn(vGW.xz * 0.28) * 0.7 + gn(vGW.xz * 1.3) * 0.3);
          float dy = Rf.y - uFbDir.y;
          float streak = exp(-dot(az, az) / 0.022) * exp(-dy * dy / 0.05);
          float wide = exp(-dot(az, az) / 0.3) * exp(-dy * dy / 0.3);
          totalEmissiveRadiance += uFbC * (streak * 0.3) * wet * (road ? 1.0 : 0.72);
        }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.directSpecular *= 0.1;`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, 1.0 - exp(-length(vGW - cameraPosition) / 9000.0));`);
  };
  mat.customProgramCacheKey = () => 'nuke-ground-v1';
  // (long thin strips: the road's curve down the hill needs rows of vertices)
  const geo = new THREE.PlaneGeometry(3200, 2900, 8, 280).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 0, -550);
  mesh.receiveShadow = true;
  scene.add(mesh);
  // the curbs: thin raised edges along the avenue
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x77746f, roughness: 0.8 });
  curbMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      { float z = (modelMatrix * instanceMatrix * vec4(position, 1.0)).z; transformed.y += ${groundGLSL}; }`);
  };
  const curbs = [];
  for (const s of [-1, 1]) for (const x of [ROAD_X, PROM]) {
    for (let k = 0; k < 80; k++) curbs.push([s * x, 320 - (k + 0.5) * 22, 22]);
  }
  const cg = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.16, 1, 1, 1, 1).translate(0, 0.08, 0), curbMat, curbs.length);
  const m4 = new THREE.Matrix4();
  curbs.forEach((c, i) => cg.setMatrixAt(i, m4.makeScale(1, 1, c[2]).setPosition(c[0], 0, c[1])));
  cg.receiveShadow = true;
  scene.add(cg);

  // ---- the plain ----
  const plainMat = new THREE.ShaderMaterial({
    uniforms: GU,
    vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uBlastR; uniform vec2 uHit; uniform float uPowerR; uniform float uBurn;
      uniform vec3 uFbDir; uniform vec3 uFbC; uniform vec3 uHaze; uniform vec3 uAmb;
      varying vec3 vW;
      float g21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(g21(i), g21(i + vec2(1, 0)), f.x), mix(g21(i + vec2(0, 1)), g21(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec2 P = vW.xz;
        vec2 fw = vec2(max(fwidth(P.x), fwidth(P.y)));
        float dist = length(vW - cameraPosition);
        float rr = length(P - uHit);
        // a grid of city blocks; once a street is thinner than a video pixel it fades into an even tone
        vec2 cell = vec2(120.0, 90.0);
        vec2 f = fract(P / cell), id = floor(P / cell);
        vec2 e = min(f, 1.0 - f) * cell;
        float px = max(fw.x / cell.x, fw.y / cell.y);
        float fade = smoothstep(0.25, 0.05, px);
        float street = (1.0 - smoothstep(4.0, 6.0 + fw.x, min(e.x, e.y))) * fade;
        vec3 c = mix(vec3(0.075, 0.075, 0.085) * (0.7 + 0.6 * g21(id)), vec3(0.03), street);
        c = c * uAmb * 5.0;
        // the fireball's light, raking across the roofs
        c += uFbC * 0.012 * (0.5 + gn(P * 0.01));
        // the lights: streetlight chains along the blocks, and a warm scatter of windows; an even glow far off
        float on = smoothstep(-400.0, 300.0, rr - uPowerR);
        float chain = street * (0.5 + 0.5 * step(0.5, fract((P.x + P.y) / 26.0)));
        vec2 sub = P / 14.0, sid = floor(sub);
        float dotty = step(0.72, g21(sid)) * smoothstep(0.5, 0.2, length(fract(sub) - 0.5)) * smoothstep(0.5, 0.12, px * 8.0);
        vec3 warm = mix(vec3(1.0, 0.72, 0.42), vec3(0.85, 0.9, 1.0), step(0.75, g21(sid + 3.0)));
        vec3 lights = warm * dotty * 1.5 + vec3(1.0, 0.68, 0.36) * chain * 1.9;
        lights += vec3(1.0, 0.74, 0.46) * (1.0 - fade) * (0.2 + 0.5 * gn(P * 0.004));
        c += lights * on;
        // fires: more and more blocks catch; far off they merge into a red glow
        float fid = g21(floor(P / 240.0));
        float fl = 0.65 + 0.35 * sin(uTime * 7.0 + fid * 40.0);
        float caught = smoothstep(fid * 1.1, fid * 1.1 + 0.12, uBurn) * step(0.4, g21(floor(P / 240.0) + 9.0));
        vec2 fc = fract(P / 240.0) - 0.5;
        c += vec3(3.2, 0.95, 0.14) * caught * fl * exp(-dot(fc, fc) / 0.03) * 1.5;
        c += vec3(1.2, 0.32, 0.05) * uBurn * (0.12 + 0.26 * gn(P * 0.002 + 3.0)) * (1.0 - fade * 0.5);
        // behind the front: nothing left but scorched ground under the dust
        float behind = uBlastR > 0.0 ? smoothstep(uBlastR + 20.0, uBlastR - 60.0, rr) : 0.0;
        c = mix(c, vec3(0.02, 0.016, 0.014), behind);
        // the air between
        c = mix(c, uHaze, 1.0 - exp(-dist / 9000.0));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const pg = new THREE.PlaneGeometry(36000, 27000).rotateX(-Math.PI / 2);
  const plain = new THREE.Mesh(pg, plainMat);
  plain.position.set(0, PLAIN - 0.4, -1900 - 13500);
  plain.frustumCulled = false;
  scene.add(plain);
  return { mesh, GU };
}

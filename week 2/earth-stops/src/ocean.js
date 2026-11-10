// The ocean arriving. It was never attached to the ground either: it keeps going east at the old speed, so the
// coast's water runs inland, its front at oceanZ(v) (timeline.js), arriving at ~1,000 mph. A churning wall of water
// ~300 m high, leaning forward, the low Sun behind it lighting the spray crest gold; mist and spray billow off the
// top and the foot (smoke puffs, see world.js). When it reaches the camera, everything is deep water.
import * as THREE from 'three';
import { oceanZ, V_OCEAN, V_HIT } from './timeline.js';
import { smooth } from './util.js';

export const WALL_H = 420;

export function makeOcean(scene) {
  const u = {
    uTime: { value: 0 }, uZ: { value: -20000 }, uH: { value: WALL_H }, uSun: { value: new THREE.Vector3(0, 0.15, -1) },
    uFogC: { value: new THREE.Color() }, uFogD: { value: 0 }, uLight: { value: 1 },
  };
  const geo = new THREE.PlaneGeometry(16000, 1, 320, 60).translate(0, 0.5, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: u, side: THREE.DoubleSide, transparent: true, depthWrite: true,
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uZ; uniform float uH;
      varying vec3 vW; varying float vH; varying float vN;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h1(i), h1(i + vec2(1, 0)), f.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec3 p = position;
        float k = p.y;                                   // 0 foot .. 1 crest
        // the front is ragged across its width (but passes the camera, at x ~ 0, on time)
        float bulge = (n2(vec2(p.x * 0.0012, 3.0)) - n2(vec2(0.0, 3.0))) * 380.0 + (n2(vec2(p.x * 0.005, 7.0)) - n2(vec2(0.0, 7.0))) * 90.0;
        float hh = uH * (0.75 + 0.5 * n2(vec2(p.x * 0.002, 1.3)));
        float boil = (n2(vec2(p.x * 0.02, k * 6.0 - uTime * 2.5)) - 0.5) * 30.0 * k;
        vec3 w = vec3(p.x, k * hh, uZ + bulge + k * k * hh * 0.12 + boil);
        // the foot runs ahead a little, flattened (the leading sheet of water over the ground)
        w.z += (1.0 - smoothstep(0.0, 0.25, k)) * 40.0;
        vW = w; vH = k; vN = boil;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uSun; uniform vec3 uFogC; uniform float uFogD; uniform float uLight;
      varying vec3 vW; varying float vH; varying float vN;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h1(i), h1(i + vec2(1, 0)), f.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.1 + 3.7; a *= 0.5; } return s; }
      void main() {
        #include <logdepthbuf_fragment>
        // streaks of foam torn upward, churning dark water below
        // water torn upward in long streaks (it hits the land at 1,000 mph), foam thickening toward the crest
        vec2 q = vec2(vW.x * 0.035, vW.y * 0.0045 - uTime * 0.9);
        float f = fbm(q + vec2(fbm(q * 0.6 + 3.0) * 0.8, 0.0));
        float streak = smoothstep(0.5, 0.8, f);
        float boilT = fbm(vec2(vW.x * 0.02, vW.y * 0.02 - uTime * 2.0));
        float foam = streak * 0.35 + smoothstep(0.8, 0.95, vH + (boilT - 0.5) * 0.3) * 0.9 + smoothstep(0.14, 0.02, vH + (boilT - 0.5) * 0.1) * 0.8;
        vec3 deep = mix(vec3(0.025, 0.07, 0.08), vec3(0.04, 0.14, 0.15), smoothstep(0.0, 0.8, vH));
        vec3 white = vec3(0.82, 0.88, 0.88);
        vec3 c = mix(deep, white, clamp(foam, 0.0, 1.0));
        // the Sun behind: the thin crest glows gold through the spray
        float crest = smoothstep(0.8, 1.0, vH);
        c += vec3(1.2, 0.68, 0.35) * crest * (0.4 + 0.6 * f);
        c *= uLight;
        float d = length(vW - cameraPosition);
        float fog = 1.0 - exp(-uFogD * uFogD * d * d);
        c = mix(c, uFogC, fog * 0.85);
        float a = smoothstep(1.0, 0.86, vH + (f - 0.5) * 0.25);     // ragged top
        gl_FragColor = vec4(c, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 3;
  scene.add(mesh);
  return {
    u, mesh,
    frame(v) {
      u.uTime.value = v;
      u.uZ.value = oceanZ(v);
      mesh.visible = v > V_OCEAN - 4 && v < V_HIT + 0.05;
    },
  };
}

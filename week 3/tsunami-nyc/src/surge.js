// The surge: the broken white water at the wave's foot. When the wave hits the seawall its foot comes over the
// top as a rolling, lumpy wall of foam 10-20 m high and runs across the promenade at the wave's speed, swallowing
// the people at the railing, and reaches you. A heightfield band that travels with the front: d (m behind the
// front) and x; its top boils (animated noise) and its leading edge rolls over; lit white, with grey-green water
// showing between the clots of foam.
import * as THREE from 'three';
import { frontZ, V_HIT } from './timeline.js';

export const SU = { uT: { value: 0 }, uFront: { value: -100 }, uOn: { value: 0 }, uSun: { value: new THREE.Vector3(0.5, 0.1, -0.85) }, uLight: { value: 1 } };

export function makeSurge(scene, { camX = 0 } = {}) {
  const geo = new THREE.PlaneGeometry(1, 1, 160, 70);
  const P = geo.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const w = P.getX(i), u = P.getY(i) + 0.5;     // u: 0 the leading edge .. 1 far behind it
    P.setXYZ(i, camX + Math.sign(w) * 180 * Math.pow(Math.abs(w) * 2, 1.6), 90 * Math.pow(u, 1.5), 0);
  }
  const mat = new THREE.ShaderMaterial({
    uniforms: SU, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uT; uniform float uFront; uniform float uOn;
      varying vec3 vW; varying float vD; varying float vN; varying vec3 vNor;
      float hh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float nn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hh(i), hh(i+vec2(1,0)), f.x), mix(hh(i+vec2(0,1)), hh(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * nn(p); p = p * 2.07 + 3.7; a *= 0.5; } return s; }
      // height of the foam above the ground at (x, d) and time t
      float hgt(float x, float d) {
        float n = fbm(vec2(x * 0.09, d * 0.12 - uT * 9.0));
        float rise = smoothstep(0.0, 7.0, d) * (1.0 - 0.35 * smoothstep(40.0, 90.0, d));
        return (3.0 + 15.0 * rise * (0.55 + 0.6 * n)) * uOn;
      }
      void main() {
        float x = position.x, d = position.y;
        float h = hgt(x, d);
        // the leading edge rolls forward over itself (the top runs ahead of the foot)
        float roll = (1.0 - smoothstep(0.0, 9.0, d)) * 3.5 * (fbm(vec2(x * 0.05, uT * 3.0)) - 0.2);
        float z = uFront - d + roll + (fbm(vec2(x * 0.03, 1.0)) - 0.5) * 6.0;
        float base = z > 0.0 ? 0.0 : -3.0;          // the promenade, or the seawall's foot
        vec3 p = vec3(x, base + h * (0.25 + 0.75 * smoothstep(0.0, 3.0, d)), z);
        float e = 0.8;
        float hx = hgt(x + e, d) - h, hd = hgt(x, d + e) - h;
        vNor = normalize(vec3(-hx / e, 1.0, hd / e));
        vN = fbm(vec2(x * 0.25, d * 0.3 - uT * 14.0));
        vD = d; vW = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun; uniform float uLight;
      varying vec3 vW; varying float vD; varying float vN; varying vec3 vNor;
      void main() {
        vec3 N = normalize(vNor);
        float sky = 0.55 + 0.45 * N.y;
        float sun = max(dot(N, normalize(uSun)), 0.0);
        // clots of white foam, grey-green water showing through between them
        float foam = smoothstep(0.32, 0.55, vN);
        vec3 water = vec3(0.12, 0.26, 0.25);
        vec3 c = mix(water, vec3(0.93, 0.96, 0.96), foam) * (0.5 + 0.45 * sky + 0.35 * sun) * uLight;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 3;
  scene.add(mesh);
  return {
    u: SU,
    frame(v) {
      SU.uT.value = v; SU.uFront.value = frontZ(v);
      // it shows as the wave's foot reaches the seawall (before that it's the wave's own foam on the water)
      SU.uOn.value = Math.min(1, Math.max(0, (v - (V_HIT - 0.25)) / 0.25));
      mesh.visible = v > V_HIT - 0.25;
    },
  };
}

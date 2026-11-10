// Everything small the wind carries, drawn on the GPU as streaks (a quad from where it is now back to where it was
// 1/120 s ago, so fast things smear like a real camera's motion blur). All positions are closed-form in time.
//   field kinds (they fill a box that travels with the camera and wrap around it):
//     0 litter: paper, leaves, wrappers tumbling low over the street
//     1 grit and dust: fine streaks everywhere, denser as the wind rises
//   event kinds (released at a time from a place, then dragged toward the wind's speed, see drift() in timeline.js):
//     2 glass: shards out of the towers' windows, glinting in the low sun
//     3 leaves stripped off the trees
import * as THREE from 'three';
import { rng } from './util.js';
import { ACC, D, WMAX, tOf } from './timeline.js';

const MOTION = /* glsl */ `
uniform float uAcc; uniform float uD; uniform float uWmax;
float IW(float t) { return t <= 0.0 ? 0.0 : (t <= uD ? 0.5 * uAcc * t * t : 0.5 * uAcc * uD * uD + uWmax * (t - uD)); }
float Wms(float t) { return uWmax * clamp(t / uD, 0.0, 1.0); }
float drift(float ts, float tau, float t) {
  if (t <= ts) return 0.0;
  return IW(t) - IW(ts) - Wms(ts) * tau * (1.0 - exp(-(t - ts) / tau));
}
`;

export function makeStreaks(scene, { glassFrom = [], leafFrom = [] }) {
  const R = rng(4711);
  const items = [];
  // field particles
  for (let i = 0; i < 7000; i++) items.push([0, (R() - 0.5) * 60, 0.05 + Math.pow(R(), 1.8) * 14, R() * 220, R(), 0.05 + R() * 0.13, 0.55 + R() * 0.45, R()]);
  for (let i = 0; i < 16000; i++) items.push([1, (R() - 0.5) * 70, R() * 60, R() * 260, R(), 0.015 + R() * 0.035, 0.8 + R() * 0.2, R()]);
  // glass: [kind, x, y, z, seed, size, ts (story), tau]
  for (const g of glassFrom) items.push([2, g.x, g.y, g.z, R(), 0.05 + R() * 0.12, g.ts, 0.25 + R() * 0.5]);
  for (const l of leafFrom) items.push([3, l.x, l.y, l.z, R(), 0.07 + R() * 0.08, l.ts, 0.35 + R() * 0.4]);
  const n = items.length;
  const base = new THREE.BufferGeometry();
  // 4 corners: x = 0 head / 1 tail, y = -1 / +1 side
  base.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 0, 1, 0, 1, -1, 0, 1, 1, 0], 3));
  base.setIndex([0, 2, 1, 1, 2, 3]);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index; geo.attributes.position = base.attributes.position;
  const A = new Float32Array(n * 4), Bv = new Float32Array(n * 4);
  items.forEach((it, i) => { A.set([it[1], it[2], it[3], it[4]], i * 4); Bv.set([it[0], it[5], it[6], it[7]], i * 4); });
  geo.setAttribute('aA', new THREE.InstancedBufferAttribute(A, 4));
  geo.setAttribute('aB', new THREE.InstancedBufferAttribute(Bv, 4));
  geo.instanceCount = n;
  const u = {
    uT: { value: 0 }, uCam: { value: new THREE.Vector3() }, uDens: { value: new THREE.Vector4(1, 0, 1, 1) },
    uAcc: { value: ACC }, uD: { value: D }, uWmax: { value: WMAX }, uShutter: { value: 1 / 120 },
    uLight: { value: new THREE.Color(1, 1, 1) }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uFogD: { value: 0 }, uFogC: { value: new THREE.Color() },
    uDustC: { value: new THREE.Color(0.55, 0.47, 0.38) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec4 aA; attribute vec4 aB;
      uniform float uT; uniform vec3 uCam; uniform vec4 uDens; uniform float uShutter; uniform vec3 uSun; uniform float uFogD;
      varying vec2 vUv; varying float vA; varying vec3 vC; varying float vFog;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      ${MOTION}
      float hh(float x) { return fract(sin(x * 91.7) * 43758.5453); }
      vec3 posAt(float t, out float alive) {
        float kind = aB.x, seed = aA.w;
        alive = 1.0;
        if (kind < 1.5) {
          // the field: rides the wind (k = share of the wind's speed), wraps around the camera
          float k = aB.z;
          vec3 box = kind < 0.5 ? vec3(60.0, 14.0, 220.0) : vec3(70.0, 60.0, 260.0);
          float z = aA.z + k * IW(t) + 0.6 * t;
          float x = aA.x + sin(t * (0.7 + seed) + seed * 40.0) * (kind < 0.5 ? 1.5 : 3.0);
          vec3 p;
          p.z = uCam.z + mod(z - uCam.z + box.z * 0.7, box.z) - box.z * 0.7;
          p.x = uCam.x + mod(x - uCam.x + box.x * 0.5, box.x) - box.x * 0.5;
          if (kind < 0.5) {
            // litter skips and tumbles along the street, lofted higher as the wind grows
            float lift = 1.0 + 6.0 * clamp(Wms(t) / 150.0, 0.0, 1.0);
            p.y = 0.04 + aA.y * lift * (0.6 + 0.4 * abs(sin(t * (1.3 + seed * 2.0) + seed * 9.0)));
          } else {
            p.y = uCam.y + mod(aA.y - uCam.y + box.y * 0.5 + sin(t * 0.9 + seed * 7.0) * 2.0, box.y) - box.y * 0.5;
            p.y = max(p.y, 0.05);
          }
          // fade out at the ends of the box
          float ez = (p.z - uCam.z + box.z * 0.7) / box.z;
          float ex = abs(p.x - uCam.x) / (box.x * 0.5);
          alive *= smoothstep(0.0, 0.12, ez) * smoothstep(1.0, 0.9, ez) * smoothstep(1.0, 0.8, ex);
          return p;
        }
        // events
        float ts = aB.z, tau = aB.w, dt = t - ts;
        if (dt < 0.0 || dt > 7.0) { alive = 0.0; return vec3(0.0); }
        vec3 p = aA.xyz;
        p.z += drift(ts, tau, t);
        p.x += sin(dt * (1.1 + seed) + seed * 30.0) * min(dt, 1.5) * 2.5 - sign(aA.x) * min(dt * 3.0, 4.0);
        float turb = sin(dt * (1.7 + seed * 1.3) + seed * 17.0) * min(dt, 1.0) * (kind < 2.5 ? 6.0 : 4.0);
        p.y = max(0.05, aA.y - (kind < 2.5 ? 4.0 : 1.5) * dt + turb + 3.0 * min(dt, 1.0));
        alive = smoothstep(0.0, 0.05, dt) * smoothstep(7.0, 5.5, dt);
        return p;
      }
      void main() {
        float kind = aB.x, seed = aA.w;
        // field density: only a share of them exist at a given wind
        float dens = kind < 0.5 ? uDens.x : kind < 1.5 ? uDens.y : kind < 2.5 ? uDens.z : uDens.w;
        float al, al2;
        vec3 H = posAt(uT, al);
        vec3 T = posAt(uT - uShutter, al2);
        al *= step(seed, dens);
        if (al < 0.003) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        vec4 hv = viewMatrix * vec4(H, 1.0), tv = viewMatrix * vec4(T, 1.0);
        float size = aB.y;
        vec3 d = tv.xyz - hv.xyz;
        float len = length(d);
        vec3 dir = len > 1e-4 ? d / len : vec3(0.0, 1.0, 0.0);
        // at least as long as it is wide (slow flakes are little squares that flip)
        if (len < size) { tv.xyz = hv.xyz + dir * size; len = size; }
        vec3 side = normalize(cross(dir, normalize(hv.xyz + 1e-4)));
        float w = size * 0.5;
        if (kind < 0.5 || kind > 2.5) w *= 0.35 + 0.65 * abs(sin(uT * (6.0 + seed * 8.0) + seed * 50.0));   // paper and leaves flip
        vec3 P = mix(hv.xyz, tv.xyz, position.x) + side * position.y * w;
        float dist = -hv.z;
        al *= smoothstep(0.8, 3.0, dist);                // nothing smears across the lens
        vUv = position.xy;
        vA = al;
        // colour
        float hc = hh(seed * 13.1);
        if (kind < 0.5) vC = hc < 0.35 ? vec3(0.9, 0.88, 0.82) : hc < 0.6 ? vec3(0.3, 0.42, 0.14) : hc < 0.8 ? vec3(0.5, 0.36, 0.18) : vec3(0.75, 0.2, 0.15);
        else if (kind < 1.5) vC = vec3(0.58, 0.5, 0.41) * (0.8 + 0.4 * hc);
        else if (kind < 2.5) {
          float glint = pow(hh(seed * 7.0 + floor(uT * 24.0)), 8.0);
          vC = vec3(0.7, 0.75, 0.8) + vec3(4.0, 3.2, 2.2) * glint;
        } else vC = mix(vec3(0.22, 0.36, 0.1), vec3(0.42, 0.5, 0.16), hc);
        vFog = 1.0 - exp(-uFogD * uFogD * dist * dist);
        gl_Position = projectionMatrix * vec4(P, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLight; uniform vec3 uFogC;
      varying vec2 vUv; varying float vA; varying vec3 vC; varying float vFog;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        float a = vA * (1.0 - vUv.y * vUv.y) * (1.0 - 0.7 * vUv.x);
        vec3 c = mix(vC * uLight, uFogC, vFog);
        gl_FragColor = vec4(c, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 7;
  scene.add(mesh);
  return {
    u,
    frame(v, cam, s) {
      u.uT.value = tOf(v);
      u.uCam.value.copy(cam);
    },
  };
}

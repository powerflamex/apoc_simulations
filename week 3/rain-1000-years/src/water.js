// The flood water's surface: one big plane that rides the water line under the camera. Rain hits it everywhere
// (expanding rings, real time), wind chop on top (rougher out on the open sea later), the storm sky mirrored in
// it (dark overhead, the warm band low in the west), and you see a little way down into the murk when looking
// steeply down (what is under the water is tinted by drown.js, so the two match).
import * as THREE from 'three';
import { DW } from './drown.js';

export function makeWater(scene) {
  const u = {
    uTime: { value: 0 }, uFogC: { value: new THREE.Color() }, uFogD: { value: 0 }, uFlash: { value: 0 },
    uGlow: { value: new THREE.Vector3(0, 0.05, -1) }, uChop: { value: 0.3 }, uRain: { value: 1 }, uMurk: DW.uMurk,
    uSkyTop: { value: new THREE.Color(0.06, 0.07, 0.09) }, uSkyLow: { value: new THREE.Color(0.17, 0.18, 0.22) },
    uBand: { value: new THREE.Color(0.95, 0.42, 0.2) }, uOrigin: { value: new THREE.Vector2() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uFogC; uniform float uFogD; uniform float uFlash; uniform vec3 uGlow;
      uniform float uChop; uniform float uRain; uniform vec2 uOrigin; uniform vec3 uMurk; uniform vec3 uSkyTop; uniform vec3 uSkyLow; uniform vec3 uBand;
      varying vec3 vW;
      float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 s = f * f * (3.0 - 2.0 * f);
        return mix(mix(h1(i), h1(i + vec2(1, 0)), s.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1, 1)), s.x), s.y); }
      // slope of a noise field (finite differences), for chop
      vec2 grad(vec2 p) { float e = 0.15; return vec2(n2(p + vec2(e, 0.0)) - n2(p - vec2(e, 0.0)), n2(p + vec2(0.0, e)) - n2(p - vec2(0.0, e))) / (2.0 * e); }
      // one layer of raindrop rings: each cell gets a drop at a random moment every ~0.7 s
      vec2 rings(vec2 p, float cell, float t) {
        vec2 id = floor(p / cell), f = p / cell - id;
        vec2 c = vec2(h1(id), h1(id + 7.3)) * 0.6 + 0.2;
        float ph = fract(t * (1.2 + 0.6 * h1(id + 3.1)) + h1(id + 1.7));
        vec2 d = f - c; float r = length(d);
        float R = ph * 0.45;
        float w = exp(-pow((r - R) / 0.03, 2.0)) * (1.0 - ph) * (1.0 - ph);
        return d / max(r, 1e-3) * w * sin((r - R) * 60.0);
      }
      vec3 sky(vec3 r) {
        float h = clamp(r.y, 0.0, 1.0);
        float w = pow(max(dot(normalize(vec3(r.x, 0.0, r.z)), normalize(vec3(uGlow.x, 0.0, uGlow.z))), 0.0), 3.0);
        vec3 c = mix(uSkyLow + uBand * w * (1.0 - smoothstep(0.0, 0.09, h)), uSkyTop, smoothstep(0.02, 0.4, h));
        return c * (1.0 + uFlash * 2.5);
      }
      void main() {
        vec3 toC = cameraPosition - vW;
        float d = length(toC);
        vec3 V = toC / d;
        vec2 p = vW.xz - uOrigin;   // (near the camera: keeps the float maths fine far from the city)
        float px = length(fwidth(p));
        // chop: slopes from two scales of noise, drifting with the wind
        vec2 g = grad(p * 0.35 + vec2(uTime * 0.25, uTime * 0.1)) * 0.35 + grad(p * 0.06 + vec2(-uTime * 0.05, uTime * 0.08)) * 0.6;
        g *= uChop;
        // the rain: two layers of rings, faded out where a pixel covers several of them
        vec2 rg = rings(p, 0.36, uTime) * smoothstep(0.08, 0.02, px) + rings(p + 13.0, 0.6, uTime * 0.83) * smoothstep(0.14, 0.04, px);
        g += rg * 0.3 * uRain;
        g *= 1.0 - smoothstep(30.0, 400.0, d) * 0.6;
        vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 Rf = reflect(-V, N);
        Rf.y = abs(Rf.y);
        float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 body = uMurk * (1.0 + 0.3 * n2(p * 0.05));
        vec3 col = mix(body, sky(Rf), fres);
        // a soft sheen of the flash
        col += vec3(0.6, 0.65, 0.8) * uFlash * fres * 0.4;
        float a = mix(0.62, 1.0, fres);
        float fog = 1.0 - exp(-uFogD * uFogD * d * d);
        col = mix(col, uFogC, fog);
        a = mix(a, 1.0, fog);
        gl_FragColor = vec4(col, a);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat);
  mesh.frustumCulled = false; mesh.renderOrder = 2;
  scene.add(mesh);
  return {
    u, mesh,
    frame(v, level, cam, size) {
      u.uTime.value = v;
      mesh.position.set(cam.position.x, level, cam.position.z);
      u.uOrigin.value.set(Math.round(cam.position.x / 99) * 99, Math.round(cam.position.z / 99) * 99);
      mesh.scale.set(size, 1, size);
    },
  };
}

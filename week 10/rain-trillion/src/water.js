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
    uFlow: { value: new THREE.Vector2() }, uSpace: { value: 0 }, uSun: { value: new THREE.Vector3(0.5, 0.45, -0.75).normalize() }, uFoam: { value: 0.5 },
    // things standing in the current (boxes: centre xz, cos/sin yaw; half width, half length, on) and the avenue's walls
    uObs: { value: Array.from({ length: 24 }, () => new THREE.Vector4()) }, uObsS: { value: Array.from({ length: 24 }, () => new THREE.Vector4()) },
    uWall: { value: 0 }, uRefl: { value: 1 }, uBrown: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uFogC; uniform float uFogD; uniform float uFlash; uniform vec3 uGlow;
      uniform float uChop; uniform float uRain; uniform vec2 uOrigin; uniform vec2 uFlow; uniform float uSpace; uniform vec3 uSun; uniform float uFoam; uniform vec3 uMurk; uniform vec3 uSkyTop; uniform vec3 uSkyLow; uniform vec3 uBand;
      uniform vec4 uObs[24]; uniform vec4 uObsS[24]; uniform float uWall; uniform float uRefl; uniform float uBrown;
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
        vec3 c = mix(uSkyLow, uSkyTop, smoothstep(0.02, 0.4, h));
        c = mix(c, vec3(0.0, 0.004, 0.015) + vec3(0.1, 0.25, 0.6) * exp(-h * 18.0) * 0.5, uSpace);
        return c * (1.0 + uFlash * 2.5);
      }
      void main() {
        vec3 toC = cameraPosition - vW;
        float d = length(toC);
        vec3 V = toC / d;
        vec2 p = vW.xz - uOrigin + uFlow;   // (near the camera: keeps the float maths fine far from the city)
        float px = length(fwidth(p));
        // chop: slopes from two scales of noise, drifting with the wind
        vec2 g = grad(p * 0.35 + vec2(uTime * 0.25, uTime * 0.1)) * 0.35 + grad(p * 0.06 + vec2(-uTime * 0.05, uTime * 0.08)) * 0.6;
        g *= uChop;
        // the rain: two layers of rings, faded out where a pixel covers several of them
        vec2 rg = rings(p, 0.36, uTime) * smoothstep(0.08, 0.02, px) + rings(p + 13.0, 0.6, uTime * 0.83) * smoothstep(0.14, 0.04, px);
        g += rg * 0.22 * uRain;
        g *= 1.0 - smoothstep(30.0, 400.0, d) * 0.6;
        vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 Rf = reflect(-V, N);
        Rf.y = abs(Rf.y);
        float fres = 0.04 + 0.62 * pow(1.0 - max(dot(N, V), 0.0), 4.0);
        fres *= mix(1.0, 0.55, uBrown);
        // the flood: muddy brown-olive water, silt swirling in it
        vec3 silt = mix(vec3(0.075, 0.055, 0.03), vec3(0.05, 0.045, 0.026), n2(p * 0.12 + vec2(0.0, uTime * 0.3)));
        vec3 body = mix(uMurk, silt, uBrown) * (1.0 + 0.5 * n2(p * 0.05) + 0.4 * n2(p * 0.7));
        vec3 col = mix(body, sky(Rf) * uRefl, fres);
        // a soft sheen of the flash
        col += vec3(0.6, 0.65, 0.8) * uFlash * fres * 0.4;
        // the current's foam streaks (stretched along the flow), the Sun's glint once it is out
        float fo = n2(vec2(p.x * 0.9, p.y * 0.12)) * n2(p * 0.5 + 7.0);
        float foam = smoothstep(0.5, 0.68, fo) * uFoam * 0.4 * (1.0 - smoothstep(20.0, 120.0, d));
        // foam heaped against whatever stands in the current, a wake trailing downstream (-z), and along the walls
        float fn = n2(p * 2.2) * 0.6 + n2(p * 6.0) * 0.4;
        vec2 wp = vW.xz;
        for (int i = 0; i < 24; i++) {
          vec4 O = uObs[i], OS = uObsS[i];
          if (OS.z <= 0.0) continue;
          vec2 q = wp - O.xy;
          q = vec2(q.x * O.z - q.y * O.w, q.x * O.w + q.y * O.z);
          vec2 e = abs(q) - OS.xy;
          float sd = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0);
          float wake = (1.0 - smoothstep(-1.0, 0.0, (wp.y - O.y) + OS.y)) * exp(-abs(q.x) / (OS.x + 0.6)) * exp(-max(0.0, -(wp.y - O.y) - OS.y) / 5.0);
          foam += OS.z * (exp(-max(sd, 0.0) / 0.18) * smoothstep(0.35, 0.65, fn) * 0.7 + wake * 0.35 * smoothstep(0.45, 0.75, fn));
        }
        float wd = 14.0 - abs(vW.x);
        foam += uWall * exp(-max(wd, 0.0) / 0.4) * smoothstep(0.3, 0.6, fn) * step(-0.5, wd);
        col = mix(col, vec3(0.5, 0.48, 0.43) * (0.75 + 0.35 * fn), clamp(foam, 0.0, 0.75));
        vec3 Hs = normalize(normalize(uSun) + V);
        col += vec3(1.0, 0.92, 0.8) * (pow(max(dot(N, Hs), 0.0), 300.0) * 6.0 + pow(max(dot(N, Hs), 0.0), 30.0) * 0.15) * uSpace;
        float a = mix(mix(0.72, 0.9, uBrown), 1.0, fres);
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

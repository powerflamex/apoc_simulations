// Earth beyond the city, the atmosphere's glow seen from space, and the Moon straight overhead.
// One local frame for everything (metres): Miami's crossing at the origin, x east, -z north, y up; Earth's centre
// at (0, -R, 0). The ground near the city is a curved disk (ground.js) out to DISK_R; the globe draws the rest and
// both colour the surface with the same function (NASA Blue Marble / Black Marble / clouds, public domain).
import * as THREE from 'three';
import { R_E, MOON_D, MOON_R } from './timeline.js';
import { DEG, rng } from './util.js';

export const LAT0 = 25.765, LON0 = -80.19;
export const DISK_R = 400e3;
// the Sun has just set (west-south-west, 3 degrees under the horizon); the Moon is in its first quarter, overhead
const SUN_AZ = 256, SUN_EL = -3.0;
export const SUN_DIR = new THREE.Vector3(Math.sin(SUN_AZ * DEG) * Math.cos(SUN_EL * DEG), Math.sin(SUN_EL * DEG), -Math.cos(SUN_AZ * DEG) * Math.cos(SUN_EL * DEG)).normalize();
export const MOON_C = new THREE.Vector3(0, MOON_D + MOON_R, 0);

// local (east, up, south) -> Earth-fixed (x to lon 0, z to the north pole)
export const L2E = (() => {
  const la = LAT0 * DEG, lo = LON0 * DEG;
  const U = new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la));
  const E = new THREE.Vector3(-Math.sin(lo), Math.cos(lo), 0);
  const N = new THREE.Vector3().crossVectors(U, E);
  // columns: where local x, y, z go (local z = south = -N)
  return new THREE.Matrix3().set(E.x, U.x, -N.x, E.y, U.y, -N.y, E.z, U.z, -N.z);
})();

export const SURF = {
  uDay: { value: null }, uNight: { value: null }, uClouds: { value: null },
  uSunL: { value: SUN_DIR.clone() }, uL2E: { value: L2E }, uLights: { value: 1 },
};

// the surface colour of Earth at local unit normal n (from Earth's centre), seen along V; returns HDR colour
export const SURFACE_GLSL = /* glsl */ `
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
uniform sampler2D uDay; uniform sampler2D uNight; uniform sampler2D uClouds; uniform vec3 uSunL; uniform mat3 uL2E; uniform float uLights;
vec2 earthUV(vec3 n) {
  vec3 e = uL2E * n;
  float lon = atan(e.y, e.x), lat = asin(clamp(e.z, -1.0, 1.0));
  return vec2(lon / 6.2831853 + 0.5, lat / 3.14159265 + 0.5);
}
vec3 earthSurface(vec3 n, vec3 V, float cloudK, float lightK, out float isWater) {
  vec2 uv = earthUV(n);
  vec3 day = texture2D(uDay, uv).rgb;
  float lights = texture2D(uNight, uv).r;
  // break the (coarse) lights map up into towns and streets: fine noise that only shows close up
  {
    vec3 q = n * 3000.0;
    vec3 qi = floor(q), qf = fract(q); qf = qf * qf * (3.0 - 2.0 * qf);
    float vn = mix(mix(mix(hash13(qi), hash13(qi + vec3(1,0,0)), qf.x), mix(hash13(qi + vec3(0,1,0)), hash13(qi + vec3(1,1,0)), qf.x), qf.y),
                   mix(mix(hash13(qi + vec3(0,0,1)), hash13(qi + vec3(1,0,1)), qf.x), mix(hash13(qi + vec3(0,1,1)), hash13(qi + vec3(1,1,1)), qf.x), qf.y), qf.z);
    float px = length(fwidth(q));
    lights *= mix(0.35 + 1.3 * vn * vn, 1.0, smoothstep(0.4, 1.5, px));
  }
  float cloud = texture2D(uClouds, uv).r * cloudK;
  float ndl = dot(n, uSunL);
  float water = smoothstep(0.12, 0.05, day.r + day.g * 0.4 - day.b * 0.6) * (1.0 - smoothstep(0.35, 0.6, dot(day, vec3(0.33))));
  isWater = water;
  vec3 H = normalize(uSunL + V);
  float glint = pow(max(dot(n, H), 0.0), 500.0) * water;
  vec3 col = day * (0.012 + 1.05 * max(ndl, 0.0));
  col += vec3(1.0, 0.8, 0.6) * glint * smoothstep(-0.05, 0.1, ndl);
  col += vec3(0.9, 0.35, 0.1) * exp(-pow(ndl / 0.06, 2.0)) * 0.1 * (1.0 - water * 0.5);
  float cl = smoothstep(0.2, 0.85, cloud);
  col = mix(col, vec3(1.0) * (0.015 + 1.0 * max(ndl + 0.04, 0.0)), cl * 0.9);
  float night = 1.0 - smoothstep(-0.1, 0.06, ndl);
  col += vec3(1.0, 0.62, 0.3) * pow(lights, 1.5) * 2.2 * lightK * night * (1.0 - cl * 0.7) * uLights;
  return col;
}
`;

export function makeEarth(scene) {
  const loader = new THREE.TextureLoader();
  const waits = [];
  const load = (f, srgb) => {
    let done;
    waits.push(new Promise((res, rej) => { done = [res, rej]; }));
    const t = loader.load(f, () => done[0](), undefined, () => done[1](new Error('could not load ' + f)));
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping;
    return t;
  };
  SURF.uDay.value = load('textures/earth_day.jpg', true);
  SURF.uNight.value = load('textures/earth_night.jpg', false);
  SURF.uClouds.value = load('textures/earth_clouds.jpg', false);
  const ready = Promise.all(waits);

  // ---------- the globe (everything beyond the city disk) ----------
  const globeMat = new THREE.ShaderMaterial({
    uniforms: { ...SURF, uHole: { value: DISK_R / R_E }, uFade: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() { vN = normalize(position); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uHole; uniform float uFade;
      varying vec3 vN; varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${SURFACE_GLSL}
      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vN);
        if (acos(clamp(n.y, -1.0, 1.0)) < uHole * 0.997) discard;
        float w;
        vec3 col = earthSurface(n, normalize(cameraPosition - vW), 1.0, 1.0, w);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const globe = new THREE.Mesh(new THREE.SphereGeometry(R_E, 512, 256), globeMat);
  globe.position.set(0, -R_E, 0);
  globe.frustumCulled = false;
  scene.add(globe);

  // ---------- the atmosphere seen from outside: a blue rim, warm at the terminator ----------
  const atmoU = { uSunL: SURF.uSunL, uOn: { value: 0 } };
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(R_E + 90e3, 256, 128), new THREE.ShaderMaterial({
    uniforms: atmoU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){ vN = normalize(position); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `uniform vec3 uSunL; uniform float uOn; varying vec3 vN; varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        vec3 V = normalize(cameraPosition - vW);
        float rim = pow(1.0 - max(dot(normalize(vN), V), 0.0), 2.6);
        float ndl = dot(normalize(vN), uSunL);
        vec3 c = mix(vec3(0.22, 0.48, 1.0), vec3(1.0, 0.45, 0.18), exp(-pow(ndl / 0.14, 2.0)) * 0.8) * smoothstep(-0.25, 0.25, ndl) * rim * 1.8;
        gl_FragColor = vec4(c * uOn, 1.0);
      }`,
  }));
  atmo.position.copy(globe.position);
  atmo.frustumCulled = false;
  scene.add(atmo);

  // ---------- the Moon (first quarter, overhead): maria, craters at every scale near where you land ----------
  const moonU = { uSunL: SURF.uSunL, uTime: { value: 0 }, uHit: { value: 0 }, uEarthL: { value: 0.05 } };
  const moonMat = new THREE.ShaderMaterial({
    uniforms: moonU,
    vertexShader: /* glsl */ `varying vec3 vP; varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){ vP = position; vec4 w = modelViewMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `uniform vec3 uSunL; uniform float uTime; uniform float uHit; uniform float uEarthL; varying vec3 vP; varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      vec2 h22(vec2 p) { vec3 a = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); a += dot(a, a.yzx + 33.33); return fract((a.xx + a.yz) * a.zy); }
      float noise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
      // craters on a plane (x, z of the Moon-local position; good near the point facing Earth, where you land)
      float craters(vec2 q, float pxm) {
        float h = 0.0;
        float sc = 160000.0;
        for (int o = 0; o < 15; o++) {
          float fade = 1.0 - smoothstep(0.08, 0.35, pxm / sc);
          if (fade <= 0.0) break;
          vec2 g = q / sc, gi = floor(g), gf = fract(g);
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 c = vec2(float(i), float(j));
            vec2 rr = h22(gi + c + float(o) * 17.0);
            float rad = 0.12 + 0.3 * rr.y * rr.y;
            float d = length(gf - c - rr) / rad;
            float bowl = d < 1.0 ? (d * d - 1.0) * 0.5 : 0.0;
            float rim = exp(-pow((d - 1.0) / 0.18, 2.0)) * 0.25;
            h += (bowl + rim) * rad * sc * 0.18 * fade * step(0.35, fract(rr.x * 7.3));
          }
          sc *= 0.4;
        }
        return h;
      }
      void main(){
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vP);
        float pxm = length(fwidth(vW)) * 1.5 + 1.0;
        vec2 q = vP.xz;
        float e = max(pxm, 5.0);
        float h0 = craters(q, pxm), hx = craters(q + vec2(e, 0.0), pxm), hz = craters(q + vec2(0.0, e), pxm);
        vec3 tx = normalize(vec3(1.0, 0.0, 0.0) - n * n.x), tz = normalize(vec3(0.0, 0.0, 1.0) - n * n.z);
        vec3 nn = normalize(n - tx * (hx - h0) / e - tz * (hz - h0) / e);
        // the maria: big dark basins on the near side
        float mar = smoothstep(0.52, 0.62, fbm(n * 2.2 + vec3(3.0, 1.0, 7.0)));
        float alb = mix(0.62, 0.34, mar) * (0.85 + 0.3 * fbm(n * 40.0)) * (0.9 + 0.2 * fbm(vP * 0.0003)) * (0.85 + 0.3 * fbm(vP * 0.4) * smoothstep(4.0, 0.5, pxm));
        float ndl = max(dot(nn, uSunL), 0.0);
        float sh = smoothstep(-0.02, 0.06, dot(n, uSunL));
        vec3 col = vec3(1.0, 0.97, 0.92) * alb * ndl * 1.6 * sh + vec3(0.4, 0.5, 0.7) * alb * uEarthL;
        // the impact: a white-hot splash where you land
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(MOON_R, 384, 192), moonMat);
  moon.position.copy(MOON_C);
  moon.frustumCulled = false;
  scene.add(moon);

  return { ready, globe, globeMat, atmo, atmoU, moon, moonU };
}

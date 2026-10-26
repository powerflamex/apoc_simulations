// Earth beyond the city disk, its atmosphere seen from space, the Moon (and its pieces after punch 28), the Sun, and
// the pieces of Earth after punch 31. One frame for everything (metres): you on the plaza in Los Angeles at the
// origin, x east, -z north, y up; Earth's centre at (0, -R, 0). The ground near you is a curved disk (ground.js) out
// to DISK_R; the globe draws the rest (and everything, once the camera is in space); both colour the surface with the
// same function (NASA Blue Marble / Black Marble / clouds, public domain). The globe also draws what the big punches
// do to the planet, centred on you: the scorched and burning land, the shock ring running round the world, the
// crust cracking open, the oceans boiling off, the whole surface glowing red.
import * as THREE from 'three';
import { R_E, R_SUN, AU, MOON_DIST, R_MOON } from './timeline.js';
import { DEG, rng } from './util.js';

export const LAT0 = 34.05, LON0 = -118.25;    // downtown Los Angeles
export const DISK_R = 400e3;
// golden hour: the Sun low in the south-west, 20 degrees up
const SUN_AZ = 238, SUN_EL = 20;
export const SUN_DIR = new THREE.Vector3(Math.sin(SUN_AZ * DEG) * Math.cos(SUN_EL * DEG), Math.sin(SUN_EL * DEG), -Math.cos(SUN_AZ * DEG) * Math.cos(SUN_EL * DEG)).normalize();
export const EARTH_C = new THREE.Vector3(0, -R_E, 0);
// the Moon: nearly full, rising in the east (opposite the low Sun)
const MOON_AZ = 95, MOON_EL = 18;
export const MOON_DIR = new THREE.Vector3(Math.sin(MOON_AZ * DEG) * Math.cos(MOON_EL * DEG), Math.sin(MOON_EL * DEG), -Math.cos(MOON_AZ * DEG) * Math.cos(MOON_EL * DEG)).normalize();
export const MOON_C = MOON_DIR.clone().multiplyScalar(MOON_DIST).add(EARTH_C);

// local (east, up, south) -> Earth-fixed (x to lon 0, z to the north pole)
export const L2E = (() => {
  const la = LAT0 * DEG, lo = LON0 * DEG;
  const U = new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la));
  const E = new THREE.Vector3(-Math.sin(lo), Math.cos(lo), 0);
  const N = new THREE.Vector3().crossVectors(U, E);
  return new THREE.Matrix3().set(E.x, U.x, -N.x, E.y, U.y, -N.y, E.z, U.z, -N.z);
})();

export const DMG = {
  uBurnR: { value: 0 }, uFireR: { value: 0 }, uRingR: { value: 0 }, uRingA: { value: 0 }, uSplitR: { value: 0 }, uSplitA: { value: 0 },
  uMolten: { value: 0 }, uSteam: { value: 0 }, uDustR: { value: 0 }, uFlash: { value: 0 },
};
export const SURF = {
  uDay: { value: null }, uNight: { value: null }, uClouds: { value: null },
  uSunL: { value: SUN_DIR.clone() }, uL2E: { value: L2E }, uLights: { value: 1 },
  uCrackR: { value: 0 }, uCrackS: { value: 1 }, uCrack: { value: 0 }, uHeat: { value: 0 }, uTime: { value: 0 },
  uFoot2: { value: 0.21 },
};

// the surface colour of Earth at local unit normal n (from Earth's centre), seen along V; returns HDR colour.
// lava(): glowing cracks round your shoes: a cell pattern in your own size (uCrackS = your size s), so the
// cracks keep their size next to you as you grow; two octaves crossfade so it never visibly zooms.
export const SURFACE_GLSL = /* glsl */ `
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { return vec2(hash12(p), hash12(p + 17.31)); }
uniform sampler2D uDay; uniform sampler2D uNight; uniform sampler2D uClouds; uniform vec3 uSunL; uniform mat3 uL2E; uniform float uLights;
uniform float uCrackR; uniform float uCrackS; uniform float uCrack; uniform float uHeat; uniform float uTime; uniform float uFoot2;
vec2 earthUV(vec3 n) {
  vec3 e = uL2E * n;
  float lon = atan(e.y, e.x), lat = asin(clamp(e.z, -1.0, 1.0));
  return vec2(lon / 6.2831853 + 0.5, lat / 3.14159265 + 0.5);
}
float cellEdge2(vec2 p, out vec2 id) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 9.0, d2 = 9.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 c = vec2(float(x), float(y));
    vec2 o = c + hash22(i + c) - f;
    float d = dot(o, o);
    if (d < d1) { d2 = d1; d1 = d; id = i + c; } else if (d < d2) d2 = d;
  }
  return sqrt(d2) - sqrt(d1);
}
// q: position on the ground in metres (east, south) from your right sole; returns glow (0..) and darkening.
// Long cracks radiate from your soles (a cell pattern in log-polar coordinates), finer cracks branch between
// them, both fading with distance; right round your soles the rock is molten.
vec2 lava(vec2 q) {
  if (uCrack <= 0.0 && uHeat <= 0.0) return vec2(0.0);
  vec2 u = q / uCrackS;                                   // in your own size (your shoe is 0.27 long)
  vec2 uc = u - vec2(uFoot2 * 0.5, 0.0);
  float r = min(length(u), length(u - vec2(uFoot2, 0.0)));
  float rc = length(uc);
  float reach = uCrackR;
  float fall = pow(clamp(1.0 - rc / max(reach, 1e-3), 0.0, 1.0), 1.6);
  float g = 0.0, dk = 0.0;
  if (fall > 0.0) {
    // radial cracks
    vec2 pr = vec2(log(max(rc, 0.01)) * 2.2, atan(uc.y, uc.x) * 3.0);
    vec2 id;
    float e = cellEdge2(pr, id);
    float pw = fwidth(pr.x) + fwidth(pr.y);
    float rad = 1.0 - smoothstep(0.0, 0.03 + pw * 1.2, e);
    // finer cracks between them (two octaves of plain cells that crossfade with your size, so they never zoom)
    float L = log2(uCrackS) * 0.5, fo = fract(L);
    float fine = 0.0;
    for (int o = 0; o < 2; o++) {
      float sc = 7.0 * exp2(float(o) - fo);
      vec2 pp = u * sc + float(o) * 7.3;
      vec2 id2;
      float e2 = cellEdge2(pp, id2);
      float pw2 = fwidth(pp.x) + fwidth(pp.y);
      fine += (1.0 - smoothstep(0.0, 0.025 + pw2, e2)) * step(0.35, hash12(id2)) * (o == 0 ? 1.0 - fo : fo);
    }
    g = (rad + 0.55 * fine) * fall * uCrack;
    dk = fall * uCrack * 0.5;
  }
  // the ground right round your soles is molten
  float pool = (1.0 - smoothstep(0.05, 0.05 + 0.1 * uHeat, r)) * uHeat;
  return vec2(g + pool, dk + pool);
}
vec3 lavaColor(float g, vec2 q) {
  float fl = 0.75 + 0.25 * sin(uTime * 3.0 + q.x * 0.0 + hash12(floor(q / uCrackS * 40.0)) * 6.0);
  return vec3(2.4, 0.62, 0.12) * g * fl + vec3(1.8, 1.1, 0.5) * g * g * 0.4;
}
vec3 earthSurface(vec3 n, vec3 V, float cloudK, float lightK, out float isWater) {
  vec2 uv = earthUV(n);
  vec3 day = texture2D(uDay, uv).rgb;
  float lights = texture2D(uNight, uv).r;
  float cloud = texture2D(uClouds, uv).r * cloudK;
  float ndl = dot(n, uSunL);
  float water = smoothstep(0.12, 0.05, day.r + day.g * 0.4 - day.b * 0.6) * (1.0 - smoothstep(0.35, 0.6, dot(day, vec3(0.33))));
  isWater = water;
  vec3 H = normalize(uSunL + V);
  float glint = pow(max(dot(n, H), 0.0), 400.0) * water;
  vec3 col = day * (0.012 + 1.05 * max(ndl, 0.0));
  col += vec3(1.0, 0.8, 0.6) * glint * 1.4 * smoothstep(-0.05, 0.1, ndl);
  col += vec3(0.9, 0.35, 0.1) * exp(-pow(ndl / 0.06, 2.0)) * 0.1 * (1.0 - water * 0.5);
  float cl = smoothstep(0.2, 0.85, cloud);
  col = mix(col, vec3(1.0) * (0.015 + 1.0 * max(ndl + 0.04, 0.0)), cl * 0.9);
  float night = 1.0 - smoothstep(-0.1, 0.06, ndl);
  col += vec3(1.0, 0.62, 0.3) * pow(lights, 1.5) * 2.2 * lightK * night * (1.0 - cl * 0.7) * uLights;
  // the cracks round your shoes, on the globe (once they are bigger than the city disk)
  float dA = acos(clamp(n.y, -1.0, 1.0)) * ${R_E.toFixed(1)};
  vec2 q = normalize(vec2(n.x, n.z) + 1e-9) * dA;
  vec2 lv = lava(q);
  col *= 1.0 - 0.7 * clamp(lv.y, 0.0, 1.0);
  col += lavaColor(lv.x, q);
  return col;
}
`;

const LOGV = /* glsl */ `#include <common>
  #include <logdepthbuf_pars_vertex>`;

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

  // everything that is Earth sits in one group, so it can be squashed under your shoe at the end
  const earthG = new THREE.Group();
  scene.add(earthG);

  // ---------- the globe (everything beyond the city disk) ----------
  const globeU = { ...SURF, uHole: { value: DISK_R / R_E }, uCrush: { value: 0 }, ...DMG };
  const globeMat = new THREE.ShaderMaterial({
    uniforms: globeU,
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vW;
      ${LOGV}
      void main() { vN = normalize(position); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uHole; uniform float uCrush;
      uniform float uBurnR; uniform float uFireR; uniform float uRingR; uniform float uRingA; uniform float uSplitR; uniform float uSplitA;
      uniform float uMolten; uniform float uSteam; uniform float uDustR; uniform float uFlash;
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
        // ---- what the punches do to the planet (angular distance from you: d) ----
        {
          float d = acos(clamp(n.y, -1.0, 1.0));
          float nz = hash13(floor(n * 400.0)) * 0.5 + hash13(floor(n * 90.0)) * 0.5;
          float eN = (nz - 0.5) * 0.08;
          // dust thrown up round the blast: a pale brown veil
          float dust = (1.0 - smoothstep(uDustR * 0.7, uDustR * (1.0 + eN), d)) * step(1e-5, uDustR);
          col = mix(col, vec3(0.32, 0.27, 0.22) * (0.25 + 0.9 * max(dot(n, uSunL) + 0.15, 0.0)), dust * 0.75);
          // scorched land, burning: dark with glowing embers, a bright band of fire at its edge
          float burn = (1.0 - smoothstep(uBurnR * 0.85, uBurnR * (1.0 + eN), d)) * step(1e-5, uBurnR);
          col = mix(col, vec3(0.03, 0.02, 0.015), burn * 0.9);
          float emb = smoothstep(0.55, 0.9, nz);
          col += vec3(1.8, 0.45, 0.1) * emb * burn * 0.6;
          float fireBand = exp(-pow((d - uFireR) / max(uFireR * 0.07, 0.004), 2.0)) * step(1e-5, uFireR) * (0.6 + 0.4 * nz);
          col += vec3(3.0, 1.0, 0.25) * fireBand;
          // the shock ring running round the world: a thin bright line, cloud swept out behind it
          float ring = exp(-pow((d - uRingR) / max(0.006, uRingR * 0.012), 2.0)) * uRingA;
          col += vec3(1.6, 1.55, 1.45) * ring;
          // the crust cracking open: glowing seams (big plates, finer cracks between them), spreading from you
          if (uSplitA > 0.0) {
            vec2 id;
            vec3 a = abs(n);
            vec2 pp = a.x > a.y && a.x > a.z ? n.yz / a.x : a.y > a.z ? n.xz / a.y : n.xy / a.z;
            float e = cellEdge2(pp * 4.0, id);
            float e2 = cellEdge2(pp * 13.0 + 3.0, id);
            float reach = 1.0 - smoothstep(uSplitR * 0.8, uSplitR, d + eN * 0.5);
            float cr = (1.0 - smoothstep(0.0, 0.03 + 0.06 * uSplitA, e)) + 0.5 * (1.0 - smoothstep(0.0, 0.04, e2)) * smoothstep(0.3, 1.0, uSplitA);
            col = mix(col, col * 0.4, reach * uSplitA * 0.6);
            col += vec3(3.0, 0.8, 0.15) * cr * reach * uSplitA;
          }
          // the oceans boil off: the water turns to a white sheet of steam (it glows faintly on the night side)
          float wtr;
          { vec2 uv = earthUV(n); vec3 day = texture2D(uDay, uv).rgb; wtr = smoothstep(0.12, 0.05, day.r + day.g * 0.4 - day.b * 0.6) * (1.0 - smoothstep(0.35, 0.6, dot(day, vec3(0.33)))); }
          col = mix(col, vec3(0.75, 0.73, 0.7) * (0.05 + 0.75 * max(dot(n, uSunL) + 0.1, 0.0)), uSteam * wtr * 0.85);
          // the whole surface red-hot: dark crust, glowing seams
          col = mix(col, vec3(0.32, 0.035, 0.008) * (0.5 + 0.8 * nz), uMolten);
          col += vec3(2.0, 0.8, 0.3) * uFlash;
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const globe = new THREE.Mesh(new THREE.SphereGeometry(R_E, 512, 256), globeMat);
  globe.position.copy(EARTH_C);
  globe.frustumCulled = false;
  earthG.add(globe);

  // ---------- the atmosphere seen from outside: a blue rim, warm at the terminator ----------
  const atmoU = { uSunL: SURF.uSunL, uOn: { value: 0 } };
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(R_E + 90e3, 256, 128), new THREE.ShaderMaterial({
    uniforms: atmoU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW;
      ${LOGV}
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
  atmo.position.copy(EARTH_C);
  atmo.frustumCulled = false;
  earthG.add(atmo);

  // ---------- the Moon ----------
  const moonU = { uSunL: { value: SUN_DIR.clone() }, uHit: { value: 0 }, uHitDir: { value: new THREE.Vector3(0, -1, 0) } };
  const moon = new THREE.Mesh(new THREE.SphereGeometry(R_MOON, 192, 96), new THREE.ShaderMaterial({
    uniforms: moonU,
    vertexShader: /* glsl */ `varying vec3 vP;
      ${LOGV}
      void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `uniform vec3 uSunL; uniform float uHit; uniform vec3 uHitDir; varying vec3 vP;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      float h3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
      void main(){
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vP);
        float mar = smoothstep(0.52, 0.62, fbm(n * 2.2 + vec3(3.0, 1.0, 7.0)));
        float alb = mix(0.62, 0.34, mar) * (0.8 + 0.4 * fbm(n * 30.0));
        float ndl = max(dot(n, uSunL), 0.0);
        vec3 c = vec3(1.0, 0.97, 0.92) * alb * ndl * 1.5 + 0.004;
        // the blast from Earth arriving: the face it hits glows white-hot, cracks open
        float face = max(dot(n, uHitDir), 0.0);
        float cr = smoothstep(0.62, 0.66, fbm(n * 9.0)) * (1.0 - smoothstep(0.66, 0.72, fbm(n * 9.0)));
        c += vec3(3.0, 1.5, 0.6) * pow(face, 2.0) * uHit + vec3(2.6, 0.8, 0.2) * cr * uHit * 1.5 * (0.3 + face);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  moon.position.copy(MOON_C);
  moon.frustumCulled = false;
  scene.add(moon);

  // ---------- the Sun: a white-hot ball with granulation and a limb darkened to orange; a corona of glow ----------
  const sunU = { uTime: { value: 0 }, uBright: { value: 1 } };
  const sun = new THREE.Mesh(new THREE.SphereGeometry(R_SUN, 128, 64), new THREE.ShaderMaterial({
    uniforms: sunU,
    vertexShader: /* glsl */ `varying vec3 vP; varying vec3 vN; varying vec3 vV;
      ${LOGV}
      void main(){ vP = position; vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform float uBright; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      float h3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
      void main(){
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vP);
        float mu = max(dot(normalize(vN), normalize(vV)), 0.0);
        float gran = n3(n * 120.0 + uTime * 0.2) * 0.5 + n3(n * 300.0 - uTime * 0.3) * 0.5;
        float spots = smoothstep(0.76, 0.82, n3(n * 9.0 + 4.0)) * 0.3;
        vec3 c = mix(vec3(2.2, 0.75, 0.2), vec3(5.0, 4.0, 2.8), pow(mu, 0.45)) * (0.82 + 0.3 * gran) * (1.0 - spots);
        // dimmed (when it fills the frame) it keeps its colour: deep orange at the limb, gold in the middle
        // (when it fills a good part of the frame it is drawn dimmer but deeper in colour: gold in the middle,
        // orange to red at the limb, so it reads as the Sun and not as a white-out)
        vec3 warm = mix(vec3(1.1, 0.24, 0.03), vec3(1.25, 0.62, 0.16), pow(mu, 0.5)) * 2.6 * (0.9 + 0.16 * gran) * (1.0 - spots);
        float big = clamp(1.0 - uBright, 0.0, 1.0);
        c = mix(c * uBright, warm, big);
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  sun.frustumCulled = false;
  scene.add(sun);

  const R = rng(17);

  // ---------- the Moon in pieces (punch 28): rock thrown out from the side the blast hits, glowing ----------
  const NM = 700;
  const mfrags = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x9a948c, roughness: 0.95, emissive: new THREE.Color(1.0, 0.4, 0.1), emissiveIntensity: 0, flatShading: true }), NM);
  mfrags.frustumCulled = false;
  mfrags.count = 0;
  scene.add(mfrags);
  const MF = [];
  for (let i = 0; i < NM; i++) {
    const u = R() * 2 - 1, t = R() * Math.PI * 2, rr = Math.sqrt(1 - u * u);
    const dir = new THREE.Vector3(rr * Math.cos(t), u, rr * Math.sin(t));
    MF.push({ dir, r0: Math.pow(R(), 0.33), sp: 0.15 + R() * 0.6, size: 0.008 + Math.pow(R(), 4) * 0.07, spin: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(3), seed: R() });
  }

  // ---------- Earth in pieces: rock fragments thrown out of the planet, glowing on their broken faces ----------
  const NF = 1400;
  const fragGeo = new THREE.IcosahedronGeometry(1, 0);
  const fragMat = new THREE.MeshStandardMaterial({ color: 0x6b5a4a, roughness: 0.9, emissive: new THREE.Color(1.0, 0.35, 0.08), emissiveIntensity: 1.6 });
  const frags = new THREE.InstancedMesh(fragGeo, fragMat, NF);
  frags.frustumCulled = false;
  frags.count = 0;
  scene.add(frags);
  const FR = [];
  for (let i = 0; i < NF; i++) {
    // a random point on the sphere, flung outward (mostly sideways: squashed between your sole and the rest)
    const u = R() * 2 - 1, t = R() * Math.PI * 2, rr = Math.sqrt(1 - u * u);
    const dir = new THREE.Vector3(rr * Math.cos(t), u, rr * Math.sin(t));
    FR.push({ dir, r0: Math.pow(R(), 0.33), sp: 0.25 + R() * 1.1, size: 0.025 + Math.pow(R(), 3) * 0.12, spin: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(6), seed: R() });
  }

  return { ready, earthG, globe, globeMat, globeU, atmo, atmoU, moon, moonU, sun, sunU, frags, FR, mfrags, MF };
}

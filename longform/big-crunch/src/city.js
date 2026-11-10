// The city along the shore, rebuilt over and over. Every lot (layout.js) runs its own cycle: an empty site, a
// building going up floor by floor under a tower crane, then standing until it is torn down for the next one, which
// has its own height, look and colour. In real time nothing moves; at a year a second the cranes come and go; at
// centuries a second the skyline churns. Once a frame spans many buildings' lives the blocks turn into ghosts (seen
// through, stippled), and between 100,000 and 10 million years they fade out altogether (s.city).
// Facades are drawn in the shader: concrete offices with punched windows, glass towers mirroring the golden sky,
// apartment blocks with balcony bands, and bare concrete frames while being built. Windows light up at night
// (a different random set each simulated day: the time-lapse twinkle).
import * as THREE from 'three';
import { LOTS, coastX } from './layout.js';
import { rng, clamp } from './util.js';

export const CU = {
  uSkyHi: { value: new THREE.Color(0.4, 0.5, 0.7) }, uSkyLo: { value: new THREE.Color(1, 0.6, 0.35) },
  uSunDir: { value: new THREE.Vector3(0, 0.07, -1) }, uLit: { value: 0.1 }, uDay: { value: 0 }, uGlow: { value: 1 },
  uMelt: { value: 0 },
};
const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };

const PARS = /* glsl */ `
uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform vec3 uSunDir; uniform float uLit; uniform float uDay; uniform float uGlow; uniform float uMelt;
attribute vec4 aBox; attribute vec4 aLook;
varying vec3 vLoc; varying vec4 vBox; varying vec4 vLook; varying vec3 vON; varying vec3 vWP2;
`;
const FPARS = /* glsl */ `
uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform vec3 uSunDir; uniform float uLit; uniform float uDay; uniform float uGlow; uniform float uMelt;
varying vec3 vLoc; varying vec4 vBox; varying vec4 vLook; varying vec3 vON; varying vec3 vWP2;
float ch(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float rect(vec2 f, vec2 a, vec2 b, vec2 w) { vec2 s = smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f)); return s.x * s.y; }
vec3 skyRefl(vec3 r) {
  float h = clamp(r.y, -0.2, 1.0);
  vec3 c = mix(uSkyLo, uSkyHi, smoothstep(0.0, 0.45, h));
  c = mix(c, uSkyLo * 0.25, smoothstep(0.0, -0.15, r.y));
  return c + uSkyLo * 2.0 * pow(max(dot(r, uSunDir), 0.0), 40.0);
}
`;

export function makeCity(scene) {
  const n = LOTS.length;
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const aBox = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);    // w, h, d, presence
  const aLook = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);   // seed, kind, hue, built (0..1)
  geo.setAttribute('aBox', aBox); geo.setAttribute('aLook', aLook);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0 });
  mat.alphaToCoverage = true;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, CU);
    shader.vertexShader = PARS + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vLoc = position; vBox = aBox; vLook = aLook; vON = normal;
      vWP2 = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;`);
    shader.fragmentShader = FPARS + shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
      vec3 glassAdd = vec3(0.0); vec3 litAdd = vec3(0.0);
      {
        bool sx = abs(vON.x) > 0.5;
        bool top = vON.y > 0.5;
        float W = sx ? vBox.z : vBox.x;
        float uu = ((sx ? vLoc.z : vLoc.x) + 0.5) * W;
        float y = vLoc.y * vBox.y;
        float kind = floor(vLook.y + 0.5);
        float seed = vLook.x;
        float FH = kind > 1.5 && kind < 2.5 ? 3.2 : 3.8;
        float colW = kind > 0.5 && kind < 1.5 ? 1.5 : kind > 1.5 && kind < 2.5 ? 3.0 : 2.2 + ch(vec2(seed, 1.0));
        float nCol = max(1.0, floor(W / colW + 0.5));
        colW = W / nCol;
        vec2 g = vec2(uu / colW, y / FH);
        vec2 id = floor(g), f = fract(g);
        vec2 fw = max(fwidth(g), vec2(1e-4));
        float far = smoothstep(0.2, 0.5, max(fw.x, fw.y));
        // wall colour for this building (hue from vLook.z)
        vec3 tint = 0.5 + 0.5 * cos(6.2832 * (vLook.z + vec3(0.0, 0.33, 0.67)));
        vec3 wall = mix(vec3(0.62, 0.58, 0.52), tint * 0.7 + 0.15, 0.25);
        float win = 0.0;
        vec3 col = wall;
        if (kind < 0.5) { win = rect(f, vec2(0.16, 0.28), vec2(0.84, 0.86), fw); }
        else if (kind < 1.5) { win = rect(f, vec2(0.04, 0.12), vec2(0.96, 0.96), fw); col = mix(vec3(0.2, 0.22, 0.25), tint * 0.3, 0.3); }
        else if (kind < 2.5) { win = rect(f, vec2(0.2, 0.3), vec2(0.8, 0.88), fw); col = mix(vec3(0.85, 0.8, 0.72), tint, 0.18); col *= 1.0 - 0.25 * smoothstep(0.12, 0.08, f.y); }
        else { win = rect(f, vec2(0.0, 0.18), vec2(1.0, 1.0), fw) * 0.9; col = vec3(0.55, 0.53, 0.5); }   // a bare frame
        win = mix(win, 0.55, far);
        if (top) win = 0.0;
        // glass: mirrors the sky; a random set of windows lit
        vec3 Vd = normalize(vWP2 - cameraPosition);
        vec3 N = normalize(vec3(vON.x, 0.0, vON.z) + vec3(0.0, 1e-4, 0.0));
        vec3 r = reflect(Vd, N);
        float fres = 0.08 + 0.6 * pow(1.0 - max(dot(-Vd, N), 0.0), 3.0);
        vec3 gl = kind > 2.5 ? vec3(0.02) : skyRefl(r) * fres * (kind > 0.5 && kind < 1.5 ? 1.2 : 0.7);
        float lit = step(ch(id + vec2(seed * 31.0, uDay * 0.37 + seed)), uLit) * step(0.0, y - 0.5) * step(kind, 2.5);
        col = mix(col, vec3(0.05, 0.06, 0.07), win);
        glassAdd = gl * win;
        litAdd = vec3(1.0, 0.72, 0.42) * lit * win * 1.6 * uGlow;
        litAdd = mix(litAdd, vec3(1.0, 0.72, 0.42) * uLit * 0.55 * uGlow * step(kind, 2.5), far);
        col *= 0.85 + 0.25 * ch(vec2(id.y, seed));
        diffuseColor.rgb = col * (1.0 - 0.75 * uMelt);
        // a ghost of a building that only stood for part of this frame: stippled
        float dither = ch(gl_FragCoord.xy * 0.37 + uDay * 0.01);
        diffuseColor.a = clamp(vBox.w + (dither - 0.5) * 0.3 * step(vBox.w, 0.999), 0.0, 1.0);
      }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += glassAdd + litAdd;
      // melting: the walls go dark and glow red-hot, most at the bottom, in molten runs
      if (uMelt > 0.0) {
        float run = ch(floor(vec2(vWP2.x + vWP2.z, vWP2.y * 0.15) * vec2(0.4, 1.0)));
        float hot = uMelt * (0.25 + 0.75 * smoothstep(0.7, 0.0, vLoc.y)) * (0.55 + 0.9 * run);
        totalEmissiveRadiance = totalEmissiveRadiance * (1.0 - uMelt) + vec3(1.5, 0.36, 0.06) * hot;
      }`);
  };
  mat.customProgramCacheKey = () => 'city-v1';
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  scene.add(mesh);

  // tower cranes on the building sites: a mast and a jib
  const crMat = new THREE.MeshStandardMaterial({ color: 0xd9a21b, roughness: 0.6 });
  const mast = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 1, 1.6).translate(0, 0.5, 0), crMat, n);
  const jib = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 1.1, 1).translate(0, 0, -0.32), crMat, n);
  for (const m of [mast, jib]) { m.castShadow = true; m.frustumCulled = false; scene.add(m); }

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  // the building on lot l during its cycle g
  const gen = (l, g) => {
    const r1 = hash(l.seed * 999, g), r2 = hash(g, l.seed * 77), r3 = hash(l.seed * 13 + g, 5.1);
    let h = l.hBase * (0.55 + 0.9 * r1);
    if (l.next && g === Math.floor(l.phase) + 1) h = l.next;
    const tall = h > 45;
    return { h, w: l.w * (0.8 + 0.35 * r2), d: l.d * (0.8 + 0.35 * r3), kind: tall ? (r2 < 0.55 ? 1 : 0) : r3 < 0.45 ? 2 : r3 < 0.8 ? 0 : 1, hue: hash(g, l.seed), seed: hash(l.seed, g * 3.3) };
  };
  // where the lot's cycle stands at year Y: which building, how far it is built (-1 = empty site)
  const at = (l, Y) => {
    const c = Y / l.period + l.phase;
    const g = Math.floor(c), yrs = (c - g) * l.period;
    if (yrs < l.gap) return { g, built: -1 };
    if (yrs < l.gap + l.build) return { g, built: (yrs - l.gap) / l.build };
    return { g, built: 1 };
  };
  const lights = [];
  return {
    mesh, lights,
    frame(s, glows, nightGlow) {
      // (the long video: the city stays as it is tonight, never rebuilt or smeared; it sags as it melts)
      const Y = s.Y, Ey = 0;
      lights.length = 0;
      LOTS.forEach((l, i) => {
        const a = at(l, Y);
        // presence: how much of this frame the building stood (blurs once a frame spans its life), and the city's fade
        const smear = clamp(Ey / l.period);
        let pres = a.built < 0 ? smear * 0.8 : 1 - smear * 0.25;
        pres *= s.city;
        const b = gen(l, a.g);
        const x = coastX(l.z) + l.u + b.w / 2, z = l.z;
        const slope = Math.atan((coastX(z - 1) - coastX(z + 1)) / 2);
        q.setFromAxisAngle(up, -slope);
        if (a.built < 0 || pres < 0.02) {
          if (a.built < 0 && smear > 0.5 && pres > 0.02) {
            const bb = gen(l, a.g - 1);   // a long exposure still holds a ghost of the last one
            m4.compose(p.set(x, 0, z), q, sc.set(bb.w, bb.h, bb.d));
            mesh.setMatrixAt(i, m4);
            aBox.setXYZW(i, bb.w, bb.h, bb.d, pres);
            aLook.setXYZW(i, bb.seed, bb.kind, bb.hue, 1);
          } else mesh.setMatrixAt(i, zero);
          mast.setMatrixAt(i, zero); jib.setMatrixAt(i, zero);
          return;
        }
        const sag = 1 - 0.6 * (s.cityMelt || 0) * (0.35 + 0.65 * hash(l.seed, 7.7));
        const h = Math.max(0.5, b.h * (a.built < 1 ? Math.max(0.04, a.built) : 1) * sag);
        m4.compose(p.set(x, 0, z), q, sc.set(b.w, h, b.d));
        mesh.setMatrixAt(i, m4);
        aBox.setXYZW(i, b.w, h, b.d, pres);
        aLook.setXYZW(i, b.seed, a.built < 1 ? 3 : b.kind, b.hue, a.built);
        if (a.built < 1 && pres > 0.3) {
          const mh = h + 18 + b.h * 0.1;
          const cx = x - b.w / 2 - 2, cz = z + b.d / 2 + 2;
          m4.compose(p.set(cx, 0, cz), q, sc.set(1, mh, 1)); mast.setMatrixAt(i, m4);
          // the jib swings around: slowly in real time, a random way every frame in a time-lapse
          const swing = s.E < 0.05 ? s.T * 0.02 + l.seed * 6 : hash(Math.floor(s.T), l.seed) * 6.28;
          const qj = new THREE.Quaternion().setFromAxisAngle(up, swing);
          m4.compose(p.set(cx, mh, cz), qj, sc.set(1, 1, 50)); jib.setMatrixAt(i, m4);
          if (nightGlow > 0.02) glows.add(cx, mh + 1.5, cz, 3.0, 3.5 * nightGlow, 0.3 * nightGlow, 0.15 * nightGlow);
        } else { mast.setMatrixAt(i, zero); jib.setMatrixAt(i, zero); }
        // red aviation lights on the tall towers at night
        if (b.h > 90 && a.built >= 1 && nightGlow > 0.02 && pres > 0.5) glows.add(x, b.h + 1, z, 4.0, 4 * nightGlow, 0.25 * nightGlow, 0.12 * nightGlow);
      });
      for (const m of [mesh, mast, jib]) m.instanceMatrix.needsUpdate = true;
      aBox.needsUpdate = true; aLook.needsUpdate = true;
    },
  };
}

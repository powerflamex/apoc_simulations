// The harbor water and the wave.
//   water: the bay ahead of the wave, at uLevel (it has run out: the level drops 12 m, the shallows near the seawall
//          go dry); a wave-spectrum surface with the low Sun's golden path, streaked by the current running out
//          toward the wave. (Behind the wave's foot it is hidden under the wave.)
//   wave:  a moving wall across the whole bay (x ±7 km). Profile, from its foot: a steep face up to the crest
//          (height uH), which leans forward over the last seconds, then a long back sloping down to half height.
//          The Sun is behind it: its face is in shadow, deep green, streaked with foam sliding down; light shines
//          through the thin water near the lip (turquoise), the crest is a ragged rim of foam and spray lit gold.
import * as THREE from 'three';
import { WATER0 } from './timeline.js';

export const HU = {
  uTime: { value: 0 }, uLevel: { value: WATER0 }, uFront: { value: -3000 }, uH: { value: 180 }, uLean: { value: 0 }, uCurl: { value: 0 },
  uSun: { value: new THREE.Vector3(0.3, 0.1, -0.95) }, uFogC: { value: new THREE.Color() }, uFogD: { value: 0 }, uLight: { value: 1 },
  uShade: { value: 0 },
};

const NOISE = /* glsl */ `
float hh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float nn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hh(i), hh(i+vec2(1,0)), f.x), mix(hh(i+vec2(0,1)), hh(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * nn(p); p = p * 2.03 + 3.7; a *= 0.5; } return s; }
vec3 skyC(vec3 r, vec3 sun) {
  float h = clamp(r.y, 0.0, 1.0);
  float az = max(dot(normalize(vec3(r.x, 0.0, r.z)), normalize(vec3(sun.x, 0.0, sun.z))), 0.0);
  vec3 low = mix(vec3(0.9, 0.55, 0.42), vec3(1.4, 0.75, 0.35), pow(az, 4.0));
  return mix(low, vec3(0.3, 0.42, 0.7), smoothstep(0.0, 0.45, h));
}
`;

export function makeHarbour(scene) {
  // ---------- the water ahead of the wave ----------
  const wgeo = new THREE.PlaneGeometry(1, 1, 200, 240).rotateX(-Math.PI / 2);
  const P = wgeo.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const u = P.getZ(i) + 0.5, w = P.getX(i);       // u: 0 far .. 1 at the seawall
    P.setXYZ(i, Math.sign(w) * 7000 * Math.pow(Math.abs(w) * 2, 2.0), 0, -9000 * Math.pow(1 - u, 2.4));
  }
  wgeo.computeBoundingSphere();
  const water = new THREE.Mesh(wgeo, new THREE.ShaderMaterial({
    uniforms: HU,
    vertexShader: /* glsl */ `
      uniform float uLevel; uniform float uFront;
      varying vec3 vW;
      void main() {
        vec3 p = position;
        // the water rises into the wave's foot over the last few hundred metres in front of it
        float near = exp(-max(0.0, p.z - uFront) / 260.0);
        p.y = uLevel + near * 6.0;
        vW = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uSun; uniform vec3 uFogC; uniform float uFogD; uniform float uLight; uniform float uFront; uniform float uShade;
      varying vec3 vW;
      ${NOISE}
      void main() {
        if (vW.z < uFront - 30.0) discard;
        vec3 V = normalize(vW - cameraPosition);
        float dist = length(vW - cameraPosition);
        vec2 p = vW.xz;
        // the current running out toward the wave: streaks drawn out along z, sliding away from you
        vec2 g = vec2(0.0);
        float fade = 1.0 / (1.0 + dist / 800.0);
        for (int i = 0; i < 12; i++) {
          float fi = float(i);
          float a = fi * 2.39996 + 0.3;
          vec2 dir = normalize(vec2(cos(a) * 0.6, sin(a)));
          float k = 0.05 * pow(1.4, fi);
          float amp = 0.14 / (1.0 + fi * 0.8) * exp(-k * dist * 0.004);
          float ph = dot(p, dir) * k + uTime * sqrt(9.81 * k) + fi * 1.9 + p.y * 0.0;
          g += dir * cos(ph) * amp * k;
        }
        float streak = fbm(vec2(p.x * 0.02, p.y * 0.004 + uTime * 0.35));
        g += vec2(0.0, (streak - 0.5) * 0.08);
        g *= fade * 2.2;
        vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 R = reflect(V, N);
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
        vec3 c = mix(vec3(0.015, 0.07, 0.11), skyC(R, uSun) * 0.8, fres * 0.6);
        float sp = pow(max(dot(R, normalize(uSun)), 0.0), 160.0);
        c += vec3(3.0, 1.7, 0.7) * sp * 0.9 * (1.0 - uShade) + vec3(1.2, 0.6, 0.25) * pow(max(dot(R, normalize(uSun)), 0.0), 14.0) * 0.1 * (1.0 - uShade);
        // churned and muddy just in front of the wave
        float churn = exp(-max(0.0, vW.z - uFront) / 120.0);
        c = mix(c, mix(vec3(0.2, 0.22, 0.2), vec3(0.75, 0.8, 0.78), smoothstep(0.45, 0.7, fbm(p * 0.05 + uTime * 0.5))), churn * 0.8);
        c *= uLight;
        c = mix(c, uFogC, (1.0 - exp(-uFogD * uFogD * dist * dist)) * 0.9);
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  water.frustumCulled = false;
  scene.add(water);

  // ---------- the wave ----------
  const NX = 300, NS = 150;
  const geo = new THREE.PlaneGeometry(1, 1, NX, NS);
  const Q = geo.attributes.position;
  for (let i = 0; i < Q.count; i++) {
    const w = Q.getX(i), s = Q.getY(i) + 0.5;       // s: 0 the foot .. 1 the far back
    Q.setXYZ(i, Math.sign(w) * 8000 * Math.pow(Math.abs(w) * 2, 2.2), s, 0);
  }
  const wave = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms: HU, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uLevel; uniform float uFront; uniform float uH; uniform float uLean; uniform float uCurl;
      varying vec3 vW; varying float vS; varying float vHf; varying vec3 vN;
      ${NOISE}
      const float PIV = 0.7;
      // the face (t: 0 foot .. 1 lip) before it curls
      vec2 face(float t, float H, float Lf) { return vec2(Lf * (pow(t, 0.7) - (0.15 + uLean) * pow(t, 5.0)), H * t); }
      // the profile: q (m behind the foot) and h (m above the trough) at parameter s. At the end (uCurl) the top
      // of the face curls over and down: the lip, everything above PIV, swings forward about it like a falling
      // sheet (the back of the wave then starts from the pivot, under the curl)
      vec2 prof(float s, float x) {
        float H = uH * (0.92 + 0.16 * nn(vec2(x * 0.0013, 2.0)));
        float Lf = 0.55 * H;
        float k = smoothstep(0.0, 0.3, uCurl);
        if (s < 0.55) {
          float t = s / 0.55;
          vec2 p = face(t, H, Lf);
          if (t > PIV && uCurl > 0.0) {
            vec2 pv = face(PIV, H, Lf);
            vec2 d = vec2(pv.x - p.x, p.y - pv.y);          // (forward, up) from the pivot
            float a = uCurl * 2.3 * pow((t - PIV) / (1.0 - PIV), 1.2);
            vec2 r = vec2(d.x * cos(a) + d.y * sin(a), -d.x * sin(a) + d.y * cos(a));
            p = vec2(pv.x - r.x, pv.y + r.y);
          }
          return p;
        }
        float t2 = (s - 0.55) / 0.45;
        vec2 top = mix(face(1.0, H, Lf), face(PIV, H, Lf) + vec2(Lf * 0.25, 0.0), k);
        return vec2(top.x + 2600.0 * pow(t2, 1.6), mix(top.y, H, smoothstep(0.0, 0.08, t2) * k) * (1.0 - 0.45 * pow(t2, 0.6)));
      }
      void main() {
        float s = position.y, x = position.x;
        vec2 a = prof(s, x);
        // the front is ragged across the bay (but reaches you, at x ~ 0, on time)
        float rag = (nn(vec2(x * 0.0011, 5.0)) - nn(vec2(0.0, 5.0))) * 260.0 + (nn(vec2(x * 0.006, 9.0)) - nn(vec2(0.0, 9.0))) * 50.0;
        rag *= smoothstep(0.0, 900.0, abs(x));
        float boil = (fbm(vec2(x * 0.012, s * 30.0 - uTime * 1.4)) - 0.5) * 14.0 * smoothstep(0.0, 0.3, s);
        vec3 p = vec3(x, uLevel + a.y + boil * 0.5, uFront - a.x + rag + boil);
        vS = s; vHf = s < 0.55 ? s / 0.55 : a.y / max(uH, 1.0);   // (on the face: how far up it, even when curled)
        vec2 b = prof(min(s + 0.01, 1.0), x);
        vec2 tng = normalize(vec2(b.x - a.x, b.y - a.y) + 1e-5);
        vN = normalize(vec3(0.0, tng.x, tng.y));    // facing the camera (+z) on the face
        vW = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uSun; uniform vec3 uFogC; uniform float uFogD; uniform float uLight; uniform float uH;
      varying vec3 vW; varying float vS; varying float vHf; varying vec3 vN;
      ${NOISE}
      void main() {
        vec3 V = normalize(vW - cameraPosition);
        float dist = length(vW - cameraPosition);
        // foam sliding down the face in long streaks, thick at the foot and along the lip
        vec2 q = vec2(vW.x * 0.03, vW.y * 0.012 + uTime * 0.55);
        float f = fbm(q + vec2(fbm(q * 0.7 + 4.0) * 0.9, 0.0));
        float streak = smoothstep(0.52, 0.8, f);
        // up close: finer runs of foam sliding down the face, and the base a churning white wall of broken water
        float near = 1.0 - smoothstep(80.0, 450.0, dist);
        float fd = fbm(vec2(vW.x * 0.11, vW.y * 0.045 + uTime * 1.7));
        streak = max(streak, smoothstep(0.56, 0.8, fd) * near * 0.8);
        float foot = 1.0 - smoothstep(0.0, 0.06 + 0.1 * near, vHf + (f - 0.5) * 0.05 + (fd - 0.5) * 0.08 * near);
        float lip = smoothstep(0.9, 0.98, vHf + (f - 0.5) * 0.1) * step(vS, 0.62);
        vec3 deep = mix(vec3(0.006, 0.035, 0.045), vec3(0.02, 0.1, 0.11), smoothstep(0.0, 0.85, vHf));
        // light through the thin water near the top (the Sun is behind the wave)
        float back = pow(max(dot(V, normalize(uSun)), 0.0), 3.0);
        float thin = smoothstep(0.78, 0.97, vHf) * step(vS, 0.6);
        vec3 c = deep + vec3(0.05, 0.36, 0.33) * thin * (0.15 + 0.8 * back) * uLight;
        c *= 0.85 + 0.3 * fbm(vec2(vW.x * 0.02, vW.y * 0.004 + uTime * 0.2));   // darker and lighter runs down the face
        // the sky on its glassy face, faintly
        vec3 R = reflect(V, normalize(vN));
        c += vec3(0.25, 0.3, 0.38) * pow(1.0 - abs(dot(V, normalize(vN))), 4.0) * 0.4;
        vec3 foam = vec3(0.86, 0.9, 0.9) * (0.7 + 0.3 * uLight);
        foam += vec3(1.3, 0.7, 0.3) * back * smoothstep(0.85, 1.0, vHf) * uLight;
        c = mix(c, foam * (0.62 + 0.38 * vHf + 0.25 * near * foot), clamp(streak * (0.22 + 0.3 * near) * (0.3 + vHf) + foot * 0.92 + lip, 0.0, 1.0));
        c = mix(c, uFogC, (1.0 - exp(-uFogD * uFogD * dist * dist)) * 0.85);
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  wave.frustumCulled = false; wave.renderOrder = 2;
  scene.add(wave);
  return { water, wave, u: HU };
}

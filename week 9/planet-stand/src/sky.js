// The sky dome, one shader for every place: a gradient with a haze band at the horizon, the Sun (a limb-darkened disc,
// or a star with spikes when it is too small to have one), its glow, stars, Mars's dust storm rolling in, Pluto's thin
// blue haze layers, and for the giant planets the cloud deck below you (Jupiter's bands and swirls, Neptune's blue with
// white streaks racing in the wind), which rises toward you as you fall.
import * as THREE from 'three';

export const NOISE2 = /* glsl */ `
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1, 0)), f.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), f.x), f.y); }
float fbm2(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.3; a *= 0.5; } return s; }
// distance to the nearest cell edge and cell id (Voronoi)
vec3 vor(vec2 p) { vec2 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0; vec2 id = vec2(0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(x, y); vec2 o = vec2(h12(i + g), h12(i + g + 17.1)); vec2 r = g + o - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = i + g; } else if (d < d2) d2 = d; }
  return vec3(sqrt(d2) - sqrt(d1), h12(id), h12(id + 3.7)); }
// distance to the nearest scattered point and its id
vec2 dots(vec2 p) { vec2 i = floor(p), f = fract(p); float d1 = 9.0; vec2 id = vec2(0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(x, y); vec2 o = vec2(h12(i + g), h12(i + g + 17.1)); vec2 r = g + o - f; float d = dot(r, r);
    if (d < d1) { d1 = d; id = i + g; } }
  return vec2(sqrt(d1), h12(id + 5.3)); }
`;

export function makeSky() {
  const u = {
    uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() },
    uHazeK: { value: 0 }, uHazeW: { value: 8 }, uSkyPow: { value: 0.5 },
    uSunD: { value: new THREE.Vector3(0, 1, 0) }, uSunR: { value: 0.01 }, uSunI: { value: 1 }, uSunCol: { value: new THREE.Color(1, 1, 1) },
    uGlow: { value: new THREE.Color() }, uGlowK: { value: 0 }, uGlowW: { value: 0.1 },
    uStars: { value: 0 }, uT: { value: 0 }, uPx: { value: 0.001 },
    uDeck: { value: 0 }, uDeckH: { value: 300 }, uDeckOff: { value: new THREE.Vector2() },
    uD1: { value: new THREE.Color() }, uD2: { value: new THREE.Color() }, uD3: { value: new THREE.Color() },
    uStorm: { value: 0 }, uPlutoHaze: { value: 0 }, uBolt: { value: 0 }, uBoltD: { value: new THREE.Vector3(0, -0.3, 1).normalize() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: /* glsl */ `varying vec3 vDir;
      void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHor, uHaze, uSunD, uSunCol, uGlow, uD1, uD2, uD3, uBoltD; uniform float uBolt;
      uniform float uHazeK, uHazeW, uSkyPow, uSunR, uSunI, uGlowK, uGlowW, uStars, uT, uPx, uDeck, uDeckH, uStorm, uPlutoHaze;
      uniform vec2 uDeckOff;
      varying vec3 vDir;
      ${NOISE2}
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        float az = atan(d.x, d.z);
        vec3 col = mix(uHor, uTop, pow(clamp(h, 0.0, 1.0), uSkyPow));
        col = mix(col, uHaze, uHazeK * exp(-abs(h) * uHazeW));
        // stars (black skies)
        if (uStars > 0.0) {
          vec2 g = vec2(az * 260.0, h * 260.0);
          vec2 c = floor(g);
          float r = h12(c);
          float st = step(0.985, r) * smoothstep(0.42, 0.0, length(fract(g) - 0.5 - (h12(c + 5.1) - 0.5) * 0.4));
          col += vec3(0.9, 0.93, 1.0) * st * uStars * (0.4 + 2.0 * h12(c + 9.0)) * smoothstep(0.0, 0.08, h);
        }
        // Pluto: thin blue haze layers hugging the horizon
        if (uPlutoHaze > 0.0) {
          float e = h * 57.3;
          float layers = 0.0;
          for (int k = 0; k < 6; k++) { float c = 0.4 + float(k) * 1.15; layers += exp(-pow((e - c) / 0.22, 2.0)) * (1.0 - float(k) * 0.13); }
          col += vec3(0.25, 0.55, 1.25) * layers * 0.55 * uPlutoHaze * smoothstep(-0.5, 0.3, e);
          col += vec3(0.1, 0.25, 0.7) * exp(-max(e, 0.0) / 2.5) * 0.6 * uPlutoHaze;
        }
        // the cloud deck below (Jupiter: 1, Neptune: 2)
        if (uDeck > 0.5 && h < 0.03) {
          float hh = min(h, -0.002);
          float t = uDeckH / -hh;
          vec2 p = d.xz * t + uDeckOff;
          vec3 dc;
          if (uDeck < 1.5) {
            vec2 q = p / 900.0;
            vec2 w = q + vec2(fbm2(q * 1.3 + 2.0), fbm2(q * 1.3 + 9.0)) * 1.6;
            float b = sin(w.y * 3.2 + 1.5 * fbm2(w * 0.7));
            float b2 = sin(w.y * 7.5 + 2.0 * fbm2(w * 1.6 + 4.0));
            dc = mix(uD1, uD2, smoothstep(-0.2, 0.6, b));
            dc = mix(dc, uD3, smoothstep(0.55, 0.95, b2) * 0.7);
            float puff = fbm2(p / 60.0 + w * 3.0);
            dc *= 0.55 + 0.75 * puff;
            // a big oval storm off to the left
            vec2 so = (p - vec2(5200.0, 9000.0) - uDeckOff * 0.0) / vec2(2600.0, 1500.0);
            float sd = length(so);
            dc = mix(dc, vec3(0.95, 0.42, 0.25) * (0.7 + 0.5 * fbm2(so * 3.0 + atan(so.y, so.x))), smoothstep(1.0, 0.75, sd) * 0.9);
          } else {
            vec2 q = p / 700.0;
            float base = fbm2(q * vec2(0.5, 1.4));
            dc = mix(uD2, uD1, base);
            float streak = fbm2(vec2((p.x - uT * 520.0) / 2600.0, p.y / 260.0));
            float streak2 = fbm2(vec2((p.x - uT * 520.0) / 900.0 + 4.0, p.y / 120.0));
            dc = mix(dc, uD3, clamp(smoothstep(0.52, 0.7, streak) * 0.95 + smoothstep(0.6, 0.75, streak2) * 0.5, 0.0, 1.0));
          }
          float fog = 1.0 - exp(-t / (uDeck < 1.5 ? 60000.0 : 30000.0));
          dc = mix(dc, uHor, fog);
          col = mix(col, dc, smoothstep(0.03, -0.004, h));
        }
        // Mars: the dust storm, a wall rolling in over the horizon on your left
        if (uStorm > 0.0) {
          float a = az;
          float top = (0.02 + 0.13 * uStorm) * (0.75 + 0.5 * fbm2(vec2(a * 6.0 - uT * 0.25, 1.0))) * smoothstep(-0.45, 0.25, a);
          float inside = smoothstep(top, top - 0.02, h) * smoothstep(-0.05, 0.0, h);
          vec3 sc = vec3(0.85, 0.42, 0.2) * (0.55 + 0.6 * fbm2(vec2(a * 14.0 - uT * 0.5, h * 40.0 - uT * 0.3)));
          sc += vec3(0.35, 0.2, 0.1) * smoothstep(top - 0.03, top, h);      // its sunlit top
          col = mix(col, sc, inside * 0.95);
        }
        // the Sun
        float cd = dot(d, uSunD);
        float ang = acos(clamp(cd, -1.0, 1.0));
        float px = uPx;
        if (uSunR > px * 2.5) {
          float r = ang / uSunR;
          float disc = 1.0 - smoothstep(1.0 - px / uSunR * 1.2, 1.0, r);
          float limb = 0.55 + 0.45 * sqrt(max(0.0, 1.0 - r * r));
          col = mix(col, uSunCol * uSunI * limb, disc);
          col += uGlow * uGlowK * (exp(-max(ang - uSunR, 0.0) / uGlowW) * 0.9 + exp(-max(ang - uSunR, 0.0) / (uGlowW * 5.0)) * 0.35) * (1.0 - disc);
        } else {
          // a star: a hot point with four short spikes and a soft halo
          vec3 rt = normalize(cross(uSunD, vec3(0.0, 1.0, 0.0)));
          vec3 up = cross(rt, uSunD);
          vec2 sp = vec2(dot(d, rt), dot(d, up)) / px;
          float core = exp(-dot(sp, sp) / 2.2);
          float spikes = (exp(-abs(sp.y) * 1.4) * exp(-abs(sp.x) / 14.0) + exp(-abs(sp.x) * 1.4) * exp(-abs(sp.y) / 14.0)) * 0.5;
          col += uSunCol * (core * uSunI * 0.25 + spikes * uSunI * 0.05) + uGlow * uGlowK * exp(-ang / uGlowW);
        }
        // lightning inside the clouds: the whole sky flickers, brightest round the strike
        if (uBolt > 0.0) { float ab = acos(clamp(dot(d, uBoltD), -1.0, 1.0)); col += vec3(0.75, 0.85, 1.25) * uBolt * (0.15 + 1.1 * exp(-ab / 0.07)); }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(5000, 64, 32), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, u };
}

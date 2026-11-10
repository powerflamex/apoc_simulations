// The cutaway: the Earth sliced through the hole, drawn straight-on in one full-screen shader (km units, the
// Earth's center at the origin, Madrid straight up at (0, R), New Zealand straight down). Works at every
// zoom, from the plaza's buildings (a view 2 km tall) to the whole planet:
//   the sky (by day) or space, the city on top, sediment bands, granite, the glowing mantle with its slow
//   convection, the liquid outer core, the white-hot inner core; the hole as a bright line; you as a dot.
//   "Ghosts" for scale: the Burj Khalifa hung upside down from the plaza, the deepest mine, the deepest hole.
import * as THREE from 'three';

export function makeCutaway() {
  const U = {
    uC: { value: new THREE.Vector2(0, 6371) },       // view center (km)
    uH: { value: 2.4 },                              // view height (km)
    uYou: { value: 0 },                              // your depth from the Madrid surface along the hole (km): y = R - this
    uYouA: { value: 1 },
    uGhost: { value: new THREE.Vector3(0, 0, 0) },   // Burj, mine, Kola
    uTime: { value: 0 },
    uAsp: { value: 1080 / 1920 },
    uTrail: { value: 0 },                            // the hole lit from Madrid down to you
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform vec2 uC; uniform float uH, uYou, uYouA, uTime, uAsp, uTrail; uniform vec3 uGhost;
      varying vec2 vUv;
      const float R = 6371.0;
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
      vec3 heat(float T) {
        vec3 c = mix(vec3(0.6, 0.03, 0.0), vec3(1.0, 0.22, 0.02), smoothstep(550.0, 950.0, T));
        c = mix(c, vec3(1.0, 0.48, 0.12), smoothstep(950.0, 1400.0, T));
        c = mix(c, vec3(1.0, 0.68, 0.32), smoothstep(1400.0, 2400.0, T));
        c = mix(c, vec3(1.0, 0.86, 0.62), smoothstep(2400.0, 4200.0, T));
        c = mix(c, vec3(1.0, 0.96, 0.9), smoothstep(4200.0, 5500.0, T));
        float I = pow(clamp((T - 480.0) / 1100.0, 0.0, 6.0), 1.45) * 1.1;
        return c * I;
      }
      float tempAt(float km) {
        if (km < 4.0) return 15.0 + 11.25 * km;
        if (km < 12.3) return mix(60.0, 180.0, (km - 4.0) / 8.3);
        if (km < 35.0) return mix(180.0, 600.0, (km - 12.3) / 22.7);
        if (km < 150.0) return mix(600.0, 1300.0, (km - 35.0) / 115.0);
        if (km < 660.0) return mix(1300.0, 1600.0, (km - 150.0) / 510.0);
        if (km < 2890.0) return mix(1600.0, 3700.0, (km - 660.0) / 2230.0);
        if (km < 5150.0) return mix(4000.0, 5400.0, (km - 2890.0) / 2260.0);
        return mix(5400.0, 5500.0, (km - 5150.0) / 1221.0);
      }
      // the Burj Khalifa's outline, upside down: half-width (km) at depth d (km) below the plaza
      float burjHW(float d) {
        if (d < 0.0 || d > 0.828) return -1.0;
        if (d > 0.6) return 0.004 * (1.0 - (d - 0.6) / 0.228) + 0.0008;
        float tier = floor(d / 0.075);
        return 0.034 * pow(1.0 - tier * 0.075 / 0.66, 0.9) + 0.004;
      }
      float line(float d, float w) { return 1.0 - smoothstep(w * 0.5, w * 0.5 + uH / 1920.0, abs(d)); }
      void main() {
        float px = uH / 1920.0;
        vec2 p = uC + (vUv - 0.5) * vec2(uH * uAsp, uH);
        float r = length(p);
        float km = R - r;                                  // depth below the surface (km), negative above it
        float big = smoothstep(30.0, 600.0, uH);           // 0 = close up (sky blue), 1 = the whole planet (space)
        vec3 col;
        if (km < 0.0) {
          // above ground: the afternoon sky over Madrid when close, space when far
          float alt = -km;
          vec3 sky = mix(vec3(0.42, 0.64, 0.95), vec3(0.1, 0.3, 0.78), smoothstep(0.0, uH * 0.6, alt));
          vec3 space = vec3(0.004, 0.006, 0.014) + vec3(0.8, 0.85, 1.0) * step(0.9975, h21(floor(vUv * vec2(540.0, 960.0)))) * 0.9;
          float atm = exp(-alt / 60.0) * 0.9;
          space += vec3(0.25, 0.5, 1.0) * atm;
          col = mix(sky, space, big);
          // Madrid's buildings round the plaza (close up only)
          if (p.y > 0.0 && alt < 0.06) {
            float x = p.x;
            float ax = abs(x);
            float cell = floor(x / 0.028);
            float hgt = (ax < 0.07) ? 0.0 : 0.018 + 0.012 * h21(vec2(cell, 3.0)) + 0.03 * step(0.93, h21(vec2(cell, 7.0)));
            if (ax > 0.08 && ax < 0.1) hgt = 0.032;    // the clock tower side
            if (alt < hgt) {
              vec3 fac = mix(vec3(0.86, 0.72, 0.52), vec3(0.93, 0.86, 0.74), h21(vec2(cell, 1.0)));
              vec2 w = vec2(fract(x / 0.0035), fract(alt / 0.0034));
              float win = step(0.3, w.x) * step(w.x, 0.7) * step(0.25, w.y) * step(w.y, 0.8) * step(0.004, alt);
              fac = mix(fac, vec3(0.25, 0.3, 0.36), win * smoothstep(3.0, 1.0, px * 1000.0));
              col = mix(col, fac * 1.1, 1.0 - big);
            }
          }
        } else {
          // ---- inside: by depth ----
          float ang = atan(p.x, p.y);
          vec2 polar = vec2(ang * R, km);                 // km along the surface, km deep
          float T = tempAt(km);
          // sediments (bands that follow the surface, a little wavy) and granite with folds
          float bnd = fbm(vec2(polar.x * 0.6, km * 9.0 + 0.6 * fbm(polar * vec2(1.2, 3.0))));
          vec3 sed = mix(vec3(0.66, 0.48, 0.28), vec3(0.52, 0.27, 0.15), smoothstep(0.4, 0.6, bnd));
          sed = mix(sed, vec3(0.78, 0.75, 0.68), smoothstep(0.62, 0.72, fbm(vec2(polar.x * 0.3, km * 23.0))) * 0.7);
          float fold = fbm(vec2(polar.x * 0.25 + 2.0 * fbm(polar * 0.08), km * 0.6));
          float gb = fbm(vec2(polar.x * 0.12 + 2.5 * fold, km * 0.45 + 1.2 * fold));
          vec3 gra = mix(vec3(0.24, 0.22, 0.23), vec3(0.55, 0.4, 0.35), smoothstep(0.3, 0.7, gb));
          vec3 rock = mix(sed, gra, smoothstep(1.2, 1.8, km));
          rock = mix(rock, gra * 0.55 + vec3(0.05, 0.02, 0.0), smoothstep(10.0, 35.0, km));
          // the mantle: dark rock glowing by its heat, with big slow convection swirls
          vec2 q = vec2(ang * 3.0, km / 800.0);
          float conv = fbm(q * 2.0 + vec2(fbm(q * 1.5 + uTime * 0.02) * 1.6, uTime * 0.015));
          vec3 man = mix(vec3(0.5, 0.07, 0.01), vec3(0.95, 0.36, 0.05), smoothstep(35.0, 2890.0, km)) * (0.55 + 0.75 * conv);
          // a dull red seam where the crust meets the mantle, then glowing deeper
          vec3 c = mix(rock, man, smoothstep(33.0, 37.0, km));
          c += vec3(0.6, 0.08, 0.01) * smoothstep(20.0, 35.0, km) * (1.0 - smoothstep(33.0, 37.0, km)) * 0.5;
          // the liquid outer core: brighter, faster swirls
          float sw = fbm(vec2(ang * 5.0 + 1.2 * sin(uTime * 0.3 + km / 400.0), km / 300.0 - uTime * 0.05));
          vec3 core = mix(vec3(1.0, 0.5, 0.06), vec3(1.0, 0.82, 0.35) * 1.3, smoothstep(0.35, 0.75, sw));
          c = mix(c, core, smoothstep(2885.0, 2895.0, km));
          // inner core: white-hot, faceted
          float fac = fbm(p / 260.0);
          vec3 inner = mix(vec3(1.0, 0.78, 0.4), vec3(1.0, 0.92, 0.75), smoothstep(0.35, 0.7, fac)) * 1.15;
          c = mix(c, inner, smoothstep(5145.0, 5155.0, km));
          // thin boundaries drawn faintly, so the layers read when far
          float bline = max(max(line(km - 35.0, 2.0 * px), line(km - 2890.0, 2.0 * px)), line(km - 5150.0, 2.0 * px));
          c = mix(c, c * 1.35 + 0.08, bline * big * 0.6);
          // the surface skin: land/sea colour, a little bright edge
          c = mix(c, vec3(0.25, 0.32, 0.18), smoothstep(px * 3.0 + 0.003, 0.0, km) * (1.0 - big * 0.5));
          col = c;
        }
        // ---- the ghosts for scale ----
        {
          // Burj Khalifa, upside down, just right of the hole
          float d = R - p.y;
          float hw = burjHW(d);
          float bx = abs(p.x - 0.13);
          float inside = hw > 0.0 ? 1.0 - smoothstep(hw - px, hw + px, bx) : 0.0;
          float edge = hw > 0.0 ? line(bx - hw, 2.0 * px) : 0.0;
          col = mix(col, col * 0.5 + vec3(0.35, 0.75, 1.0) * 0.8, inside * 0.7 * uGhost.x);
          col += vec3(0.5, 0.9, 1.2) * edge * 1.5 * uGhost.x;
          // the deepest mine (4 km): a headframe and a shaft, with levels near the bottom
          float mx = p.x + 1.3;
          float mshaft = line(mx, max(0.02, 1.8 * px)) * step(0.0, d) * step(d, 4.0);
          float lv = 0.0;
          for (int i = 0; i < 5; i++) { float ld = 2.2 + float(i) * 0.42; lv = max(lv, line(d - ld, max(0.012, 1.4 * px)) * step(abs(mx), 0.35 + 0.1 * float(i))); }
          float head = step(-0.06, -d) * step(-d, 0.06) * step(abs(mx), 0.03);
          col = mix(col, vec3(1.0, 0.85, 0.35) * 1.4, max(max(mshaft, lv), head) * uGhost.y);
          // the deepest hole ever dug (12.3 km): a thin borehole with a small rig on top
          float kx = p.x - 2.2;
          float kola = line(kx, max(0.006, 1.6 * px)) * step(0.0, d) * step(d, 12.262);
          float rig = step(-0.12, -d) * step(-d, 0.0) * step(abs(kx), 0.04 * (1.0 + d / 0.12));
          col = mix(col, vec3(1.0, 0.45, 0.35) * 1.6, max(kola, rig * 0.0) * uGhost.z);
          col += vec3(1.0, 0.5, 0.4) * line(length(vec2(kx, d - 12.262)) , max(0.05, 4.0 * px)) * uGhost.z;
        }
        // ---- the hole: a bright line from Madrid to New Zealand, lit above you ----
        {
          float w = max(0.006, 1.6 * px);
          float inHole = step(abs(p.y), R);
          float l = line(p.x, w) * inHole;
          float halo = exp(-abs(p.x) / (6.0 * px)) * inHole;
          float yy = R - uYou;                           // your height on the picture (km)
          float lit = mix(0.35, 1.0, step(yy, p.y) * uTrail);
          col = mix(col, vec3(1.0, 0.95, 0.82) * 1.6 * lit, l);
          col += vec3(1.0, 0.9, 0.7) * halo * 0.25 * lit;
          // you: a bright dot with a halo
          float dy = length(vec2(p.x, p.y - yy)) / px;
          col = mix(col, vec3(1.0), (1.0 - smoothstep(4.5, 6.0, dy)) * uYouA);
          col += vec3(1.0, 0.9, 0.7) * exp(-dy / 10.0) * 1.2 * uYouA;
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  scene.add(quad);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  // where a point (km) lands on the screen (px)
  const toScreen = (x, y) => ({
    x: ((x - U.uC.value.x) / (U.uH.value * U.uAsp.value) + 0.5) * 1080,
    y: (0.5 - (y - U.uC.value.y) / U.uH.value) * 1920,
  });
  return { scene, camera, U, toScreen };
}

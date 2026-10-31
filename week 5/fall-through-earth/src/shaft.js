// The hole: a 6 m wide shaft, drawn as one open cylinder around you (you stay at the origin; the world moves).
// Its wall is a single shader, a pure function of where along the hole each point is:
//   the top 30 m: a concrete lining with LED ring lights every 4 m (the lights run the whole crust, every 10 m)
//   to 1.5 km: Madrid's sediments (sand, clay, gypsum bands); to 35 km: granite and gneiss, warmer the deeper
//   then the rock glows by itself, by its temperature: dull red cracks below the crust, orange, flowing mantle rock,
//   the liquid iron of the outer core (bright, churning), the white-hot crystals of the inner core.
// Speed: everything along the hole is box-blurred over one frame of travel (the patterns are a sum of octaves; an
// octave finer than the blur fades out, and the ring lights are a Fourier series whose harmonics die off), so
// at thousands of km per second the wall turns into smooth streaks instead of flickering.
// Far down the shaft the depth is stretched (uK), so the next layer's colour shows at the end of the tunnel and
// its edge comes rushing at you.
import * as THREE from 'three';

export const RS = 3.0;                     // shaft radius (m)
export const LEN = 1600;                   // the cylinder reaches this far above and below you
export const OCT = [0.7, 2.6, 10, 40, 160, 640, 2560, 10240, 40960, 163840];   // octave scales (m)

export function makeShaft() {
  const U = {
    uSide: { value: 1 },                   // +1: the Madrid half (s grows with depth), -1: the New Zealand half
    uQb: { value: 0 },                     // your depth below this half's surface (m)
    uOff: { value: new Float32Array(OCT.length) },   // (s / scale) mod 512 for each octave, from JS doubles
    uScale: { value: new Float32Array(OCT) },
    uBlur: { value: 0 },                   // metres of hole that pass in one frame
    uLPh: { value: 0 },                    // ring lights: phase of your position in their period
    uLPer: { value: 4 },
    uK: { value: 0 },                      // far-field depth stretch
    uTime: { value: 0 },
    uGlow: { value: 0 },                   // the white at the center
    uLit: { value: 1 },                    // ring lights on (they melt below the crust)
    uSurf: { value: 1 },                   // how much of the daylight above reaches in
    uTunnel: { value: new THREE.Vector2(-17.5, -22.5) },   // the metro's roof and floor (frame y, relative to you)
    uTunnelOn: { value: 1 },
  };
  const geo = new THREE.CylinderGeometry(RS, RS, LEN * 2, 96, 160, true);
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    side: THREE.BackSide,
    vertexShader: /* glsl */ `
      varying vec3 vP;
      void main() { vP = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.0); }`,
    fragmentShader: /* glsl */ `
      #define NO ${OCT.length}
      uniform float uSide, uQb, uOff[NO], uScale[NO], uBlur, uLPh, uLPer, uK, uTime, uGlow, uLit, uSurf, uTunnelOn;
      uniform vec2 uTunnel;
      varying vec3 vP;
      const float RKM = 6371.0;
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n2(vec2 p) {
        vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
      }
      // noise that wraps round the shaft: x is an angle index with period P
      float nw(float x, float y, float P) {
        float i = floor(x), f = fract(x); float u = f * f * (3.0 - 2.0 * f);
        float a = mix(h21(vec2(mod(i, P), floor(y))), h21(vec2(mod(i + 1.0, P), floor(y))), u);
        float b = mix(h21(vec2(mod(i, P), floor(y) + 1.0)), h21(vec2(mod(i + 1.0, P), floor(y) + 1.0)), u);
        float fy = fract(y); fy = fy * fy * (3.0 - 2.0 * fy);
        return mix(a, b, fy);
      }
      // blackbody-ish glow by temperature (deg C)
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
      void main() {
        float th = atan(vP.z, vP.x);                        // angle round the shaft
        float dq = -vP.y;                                   // m deeper than you (negative: above you)
        // far down (or up) the shaft the depth is stretched, so the next layers show at the end of the tunnel
        float a = abs(dq);
        float dqe = dq * (1.0 + uK * pow(a / ${LEN.toFixed(1)}, 4.0));
        float D = uQb + dqe;                               // depth below this half's surface (m)
        if (D < -0.02) discard;                           // above the ground: the street / plaza draw there
        float r = abs(RKM * 1000.0 - D);
        float km = (RKM * 1000.0 - r) / 1000.0;            // depth below the nearer surface (km)
        float sd = uSide * dqe;                            // change of s (distance from Madrid) from you
        // the metro tunnel crosses here (Madrid side only): the wall is open where it passes
        if (uTunnelOn > 0.5 && vP.y < uTunnel.x && vP.y > uTunnel.y && abs(vP.z) < 2.9) discard;
        float circ = 6.2832 * ${RS.toFixed(1)};
        float ang = (th + 3.14159) / 6.2832;               // 0..1 round the shaft
        float pxw = max(fwidth(dqe), 1e-4);                // m of hole per pixel here
        float blur = max(uBlur, pxw * 1.5);

        // ---- the rock: octaves of noise along the hole, blurred by the travel in one frame ----
        float bands[NO];
        for (int k = 0; k < NO; k++) {
          float sc = uScale[k];
          float u = uOff[k] + sd / sc;
          float b = blur / sc;                             // how many of this octave's features pass in a frame
          float ring = floor(circ / sc + 0.5);             // features round the shaft (wrap cleanly)
          float x = ang * max(ring, 1.0);
          float sharp = (ring >= 1.0) ? nw(x, u, max(ring, 1.0)) : n2(vec2(float(k) * 17.0, u));
          // streaked: varies round the shaft only, drifting slowly
          float streak = (ring >= 1.0) ? nw(x * 3.0, float(k) * 13.0 + uTime * 0.6, max(ring, 1.0) * 3.0) : 0.5;
          float m = smoothstep(0.35, 1.6, b);
          bands[k] = mix(sharp, mix(0.5, streak, 0.55), m);
        }
        // a layered "strata" value, mostly the big octaves
        float strata = bands[3] * 0.35 + bands[4] * 0.3 + bands[5] * 0.2 + bands[2] * 0.15;
        float grain = bands[0] * 0.6 + bands[1] * 0.4;

        vec3 alb;
        // concrete lining, top 30 m: panels 2 m tall, 12 round, with seams
        float conc = 1.0 - smoothstep(28.0, 32.0, km * 1000.0);
        {
          vec3 sed = mix(vec3(0.62, 0.5, 0.36), vec3(0.52, 0.32, 0.22), smoothstep(0.35, 0.65, bands[3]));
          sed = mix(sed, vec3(0.78, 0.75, 0.68), smoothstep(0.62, 0.75, bands[2]) * 0.8);
          sed = mix(sed, vec3(0.45, 0.42, 0.38), smoothstep(0.55, 0.8, bands[4]) * 0.6);
          sed *= (0.82 + 0.3 * grain) * 0.7;
          vec3 gra = mix(vec3(0.55, 0.5, 0.48), vec3(0.62, 0.48, 0.44), bands[3]);   // grey / pink granite
          gra = mix(gra, vec3(0.2, 0.2, 0.22), smoothstep(0.62, 0.8, bands[0]) * 0.7);  // dark mica specks
          gra = mix(gra, gra * 0.45, smoothstep(0.4, 0.6, bands[4]) * 0.8);              // gneiss banding
          gra = mix(gra, vec3(0.75, 0.45, 0.38), smoothstep(0.62, 0.72, bands[5]) * 0.7);  // pink feldspar layers
          gra = mix(gra, vec3(0.1, 0.1, 0.11), smoothstep(0.66, 0.74, bands[3]) * 0.8);    // dark dykes
          gra *= (0.85 + 0.25 * strata) * 0.6;
          vec3 man = mix(vec3(0.14, 0.16, 0.11), vec3(0.22, 0.2, 0.14), strata);        // peridotite
          alb = mix(sed, gra, smoothstep(1.2, 1.8, km));
          alb = mix(alb, gra * 0.55 + vec3(0.06, 0.02, 0.0), smoothstep(12.0, 35.0, km));
          alb = mix(alb, man, smoothstep(33.0, 40.0, km));
          // concrete
          float seamY = 1.0 - smoothstep(0.0, 0.03, abs(fract((uOff[1] * 2.6 + sd) / 2.0) - 0.5) - 0.48 + 0.0);
          float pc = fract(ang * 12.0);
          float seamX = 1.0 - smoothstep(0.0, 0.004, min(pc, 1.0 - pc) - 0.002);
          vec3 cc = vec3(0.6, 0.6, 0.58) * (0.9 + 0.12 * grain) * (1.0 - 0.45 * max(seamY * smoothstep(1.5, 0.3, blur), seamX));
          alb = mix(alb, cc, conc);
        }

        // ---- the ring lights: a Fourier series of a narrow pulse, harmonics fading with the blur ----
        float P = uLPer;
        float ph = uLPh + sd / P;                         // position in the light period
        float lamp = 0.0, spill = 0.0;
        float wl = 0.05 / P, ws = 0.9 / P, wb = blur / P * 0.45;
        lamp = 0.12 / P * 1.0; spill = 0.5;
        for (int n = 1; n <= 10; n++) {
          float fn = float(n);
          float c = cos(6.2832 * fn * ph);
          float att = exp(-pow(3.14159 * fn * wb, 2.0));
          lamp += 2.0 * 0.12 / P * exp(-pow(3.14159 * fn * wl, 2.0)) * att * c;
          spill += 2.0 * 0.5 * exp(-pow(3.14159 * fn * ws, 2.0)) * att * c;
        }
        lamp = max(lamp, 0.0) / (0.12 / P);               // 1 = the average; the fixture itself peaks high
        // the fixtures are 16 lamps round the ring
        float seg = smoothstep(0.18, 0.35, abs(fract(ang * 16.0) - 0.5));
        float segMix = smoothstep(2.0, 0.5, blur);
        lamp *= mix(1.0, 0.3 + 1.4 * seg, segMix);
        float lights = uLit * (1.0 - smoothstep(25.0, 40.0, km));
        vec3 lampCol = mix(vec3(1.0, 0.93, 0.82), vec3(1.0, 0.62, 0.3), smoothstep(0.3, 4.0, km));
        vec3 lightOnWall = lampCol * (0.1 + 0.7 * max(spill, 0.0)) * lights;
        // daylight falling in from the opening, near the top
        lightOnWall += vec3(0.9, 0.95, 1.05) * uSurf * 2.2 * exp(-km * 1000.0 / 9.0);

        vec3 col = alb * lightOnWall * 0.9;
        col += lampCol * lamp * 0.2 * lights;
        col *= mix(1.0, 0.55 + 0.9 * nw(ang * 40.0, uTime * 0.6, 40.0), smoothstep(1.0, 10.0, blur) * (1.0 - smoothstep(40.0, 60.0, km)));

        // ---- glowing by its own heat: a palette by depth, broken up by streaks (at speed) and big bands ----
        float st = nw(ang * 28.0, uTime * 0.5 + 3.0, 28.0) * 0.6 + nw(ang * 71.0, uTime * 0.8 + 9.0, 71.0) * 0.4;
        float big = bands[7] * 0.4 + bands[8] * 0.35 + bands[9] * 0.25;
        float near = smoothstep(4.0, 0.3, blur / uScale[3]);          // slow enough to see the rock itself
        float pat = smoothstep(0.22, 0.78, mix(0.55 * st + 0.45 * big, strata, near));
        float veins = max(1.0 - smoothstep(0.0, 0.07, abs(bands[2] - 0.5)), 1.0 - smoothstep(0.0, 0.09, abs(bands[5] - 0.5)) * 0.8);
        veins = mix(pow(st, 5.0) * 4.0, veins, near);
        vec3 g = vec3(0.0);
        // below the crust: dark rock with red-hot cracks
        g = mix(g, vec3(0.16, 0.02, 0.0) + vec3(1.0, 0.16, 0.02) * 1.5 * veins, smoothstep(30.0, 45.0, km));
        // the upper mantle: red-orange, patchy
        g = mix(g, vec3(1.0, 0.24, 0.03) * (0.35 + 0.85 * pat) + vec3(1.0, 0.3, 0.05) * veins * 0.5, smoothstep(90.0, 400.0, km));
        // deeper: orange, slowly flowing plumes
        float plume = n2(vec2(ang * 5.0 + 0.3 * sin(uTime * 0.4 + bands[7] * 6.0), bands[7] * 3.0 + bands[8] * 2.0 + uTime * 0.15));
        g = mix(g, vec3(1.0, 0.42, 0.08) * (0.4 + 0.7 * pat + 0.35 * plume), smoothstep(700.0, 2400.0, km));
        // the liquid iron of the outer core: yellow-orange, churning bright swirls
        float liq = smoothstep(2885.0, 2900.0, km) * (1.0 - smoothstep(5140.0, 5160.0, km));
        float sw = n2(vec2(ang * 7.0 + 1.5 * sin(uTime * 1.3 + bands[7] * 5.0), bands[7] * 4.0 - uTime * 0.9));
        sw = 0.5 * sw + 0.5 * n2(vec2(ang * 15.0 - uTime * 0.7, bands[8] * 3.0 + sw * 3.0));
        sw = smoothstep(0.25, 0.8, sw * 0.7 + st * 0.3);
        g = mix(g, mix(vec3(0.9, 0.32, 0.04), vec3(1.0, 0.8, 0.38) * 2.0, sw), liq);
        // the inner core: white-hot iron crystals
        float inner = smoothstep(5140.0, 5160.0, km);
        float fac = abs(fract(ang * 9.0 + bands[7] * 2.0) - 0.5) * 2.0;
        g = mix(g, vec3(1.0, 0.62, 0.22) * (0.6 + 0.8 * fac * pat + 0.3 * st), inner);
        // diamonds: glints streaking past, 120-250 km down
        float dia = smoothstep(110.0, 140.0, km) * (1.0 - smoothstep(230.0, 270.0, km));
        float gl = pow(nw(ang * 140.0, uTime * 1.7 + 5.0, 140.0), 14.0) + pow(nw(ang * 230.0 + 0.5, uTime * 2.3, 230.0), 16.0);
        g += vec3(0.75, 0.9, 1.0) * gl * 9.0 * dia;
        col = mix(col + g, g, smoothstep(40.0, 60.0, km));
        // the center: everything goes white
        col += vec3(1.0, 0.95, 0.85) * uGlow * 2.5;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  mat.extensions = { derivatives: true };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;

  // ---- update: you at the origin, depth q (m) below this half's surface, s along the hole ----
  function update(s, opt) {
    U.uSide.value = s.side;
    U.uQb.value = s.depth;
    const sAlong = s.side > 0 ? s.depth : 2 * 6371e3 - s.depth;
    for (let k = 0; k < OCT.length; k++) U.uOff.value[k] = ((sAlong / OCT[k]) % 512 + 512) % 512;
    U.uBlur.value = opt.blur;
    U.uLPer.value = opt.lightPeriod;
    U.uLPh.value = ((sAlong / opt.lightPeriod) % 1 + 1) % 1;
    U.uK.value = opt.k;
    U.uTime.value = opt.time;
    U.uGlow.value = opt.glow;
    U.uLit.value = opt.lit;
    U.uSurf.value = opt.surf;
    U.uTunnelOn.value = opt.tunnel ? 1 : 0;
    U.uTunnel.value.set(opt.tunnelTop, opt.tunnelBottom);
    mesh.position.set(0, 0, 0);
  }
  return { mesh, U, update };
}

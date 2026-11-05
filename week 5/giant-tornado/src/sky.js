// The sky over Main Street: the storm's base overhead (a dark deck of cloud, its underside toward you lit gold by the
// low Sun behind you while it lasts, inflow bands curving in toward the tornado, a pale green band of rain-lit sky
// low down), and the wall itself, worked out per pixel from where it really is: a vertical cylinder 10 miles across,
// its near edge uD metres up the street, up to the cloud base (uH), turning (uRot) with rising helical striations,
// rain curtains, a brown debris cloud at its foot, and lightning inside it (uBolt: up to four bolts, each phi (rad
// round the wall), strength, seed, how far down it reaches). uGreen tints everything green, uDark is the dark inside
// the wall at the end. A dome that follows the camera, drawn first.
import * as THREE from 'three';

export function makeSky() {
  const uniforms = {
    uPx: { value: 0.001 }, uTime: { value: 0 }, uSun: { value: new THREE.Vector3(-0.5, 0.4, 0.7) }, uSunK: { value: 1 },
    uD: { value: 13000 }, uR: { value: 8047 }, uH: { value: 914 }, uRot: { value: 0 }, uCamY: { value: 1.75 },
    uGreen: { value: 0 }, uDark: { value: 0 }, uDebris: { value: 0 }, uFlash: { value: 0 }, uShift: { value: 0 },
    uBolt: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uPx, uTime, uSunK, uD, uR, uH, uRot, uCamY, uGreen, uDark, uDebris, uFlash, uShift;
      uniform vec3 uSun; uniform vec4 uBolt[4];
      varying vec3 vD;
      float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float h11(float x){ return fract(sin(x * 91.7) * 43758.5); }
      float n1(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h11(i), h11(i + 1.0), f); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n2(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
      void main() {
        vec3 r = normalize(vD);
        vec3 rh = normalize(vec3(r.x, 0.0, r.z));
        vec3 sh = normalize(vec3(uSun.x, 0.0, uSun.z));
        // ---- the wall: a vertical cylinder of radius uR whose near edge is uD ahead (-z) ----
        float cz = -(uD + uR);
        float a = r.x * r.x + r.z * r.z;
        float b = 2.0 * r.z * (uD + uR);
        float cc = (uD + uR) * (uD + uR) - uR * uR;
        float disc = b * b - 4.0 * a * cc;
        float wall = 0.0, wy = -1.0, top = uH, phi = 0.0, u = 0.0, t = -1.0, st = 0.0;
        vec3 wc = vec3(0.0);
        if (disc > 0.0 && a > 1e-7) {
          t = (-b - sqrt(disc)) / (2.0 * a);
          if (t > 0.0) {
            vec3 P = vec3(0.0, uCamY, 0.0) + r * t;
            phi = atan(P.x, P.z - cz);
            u = (phi + uRot) * uR;
            wy = P.y;
            top = uH * (1.0 + 0.12 * (n1(u / 900.0) - 0.5) + 0.07 * (n1(u / 260.0 + 3.0) - 0.5) + 0.04 * (n1(u / 70.0 + 7.0) - 0.5) + 0.02 * (n1(u / 22.0 + 11.0) - 0.5));
            float edge = max(uPx * t * 1.5, 6.0);
            wall = step(0.0, wy + 50.0) * (1.0 - smoothstep(top - edge, top + edge, wy));
            // rising helical striations (the rotation), finer the closer it is
            st = fbm(vec2(u / 240.0 + wy / 520.0, wy / 150.0));
            float st2 = fbm(vec2(u / 55.0 - wy / 300.0, wy / 40.0) + 7.0);
            float st3 = fbm(vec2(u / 14.0 - wy / 120.0, wy / 11.0) + 3.0) * smoothstep(3000.0, 600.0, uD);
            float band = 0.5 + 0.5 * sin(u / 160.0 - wy / 260.0 + st * 5.0);
            float lum = (0.012 + 0.08 * pow(st, 1.6) + 0.04 * st2 * st2 + 0.035 * st3) * (0.35 + 1.1 * band) * (0.75 + 0.5 * smoothstep(0.0, top, wy));
            vec3 col = vec3(lum, lum * 0.98, lum * 1.08);
            // the top catches a little of the light from behind you
            col += vec3(0.1, 0.09, 0.07) * smoothstep(top - 180.0, top, wy) * uSunK * 0.6;
            // the debris cloud at its foot: brown, ragged, higher as it nears
            float dh = (40.0 + 170.0 * uDebris) * (0.7 + 0.6 * n1(u / 160.0 + 9.0));
            float deb = smoothstep(dh, dh * 0.25, wy) * (0.55 + 0.45 * fbm(vec2(u / 90.0, wy / 45.0) - vec2(uTime * 0.6, 0.0)));
            col = mix(col, vec3(0.13, 0.095, 0.065) * (0.5 + 0.9 * st), deb);
            // rain curtains hanging down it
            float rn = n2(vec2(u / 9.0, wy / 700.0 + uTime * 2.0));
            col += vec3(0.025, 0.027, 0.03) * rn * smoothstep(top, top * 0.15, wy) * (1.0 - deb);
            // lightning inside it
            for (int k = 0; k < 4; k++) {
              vec4 B = uBolt[k];
              if (B.y <= 0.001) continue;
              float dphi = phi - B.x;
              float bu = dphi * uR;
              float bx = 160.0 * (n1(wy / 110.0 + B.z) - 0.5) + 50.0 * (n1(wy / 28.0 + B.z * 3.0) - 0.5);
              float dd = abs(bu - bx);
              float inY = step(top * (1.0 - B.w) * smoothstep(80.0, 1500.0, uD), wy);
              float ib = B.y * inY * (2.6 * exp(-dd / 5.0) + 0.7 * exp(-dd / 70.0));
              col += vec3(2.0, 2.2, 3.0) * ib;
              col += vec3(0.4, 0.45, 0.6) * B.y * exp(-abs(dphi) / 0.22) * (0.3 + st) * 0.6;
            }
            col += vec3(0.35, 0.38, 0.48) * uFlash * (0.5 + st);
            wc = col * (1.0 - 0.5 * uDark);
          }
        }
        // ---- the storm's base overhead: a dark deck, inflow bands curving in, its underside lit by the Sun behind you ----
        float Hc = mix(2500.0, 650.0, uDark);
        float ry = max(r.y, 0.012);
        float dist = (Hc - uCamY) / ry;
        vec2 p = r.xz * dist;
        p.y += uShift;
        vec2 q = p / 1500.0;
        float n = fbm(q + vec2(0.0, uTime * 0.003));
        float nb = fbm(q * 3.1 + 5.0);
        n = smoothstep(0.3, 0.75, n);
        vec2 rel = p - vec2(0.0, cz);
        float rho = length(rel), th = atan(rel.x, -rel.y);
        float band = 0.5 + 0.5 * sin(rho / 520.0 - th * 2.0 + n * 4.0);
        vec3 dark = mix(vec3(0.075, 0.08, 0.07), vec3(0.06, 0.1, 0.05), uGreen);
        vec3 light = mix(vec3(0.3, 0.31, 0.26), vec3(0.3, 0.4, 0.17), uGreen);
        float lit = (0.15 + 0.85 * n) * (0.65 + 0.35 * band) + 0.12 * nb;
        // darker still near the tornado (the rain-free base under the mesocyclone)
        lit *= 0.55 + 0.45 * smoothstep(6000.0, 16000.0, rho);
        vec3 sky = mix(dark, light, lit);
        // the undersides facing you (away from the Sun) catch its gold
        float gold = pow(max(dot(rh, -sh), 0.0), 1.5) * uSunK * (0.45 + 0.55 * (1.0 - smoothstep(0.0, 0.5, r.y)));
        sky = sky * (1.0 + 0.5 * gold * vec3(1.0, 0.78, 0.5)) + 0.05 * gold * vec3(1.0, 0.7, 0.4) * lit;
        // haze far off: the pale green-yellow of the rain-lit sky
        vec3 hz = mix(vec3(0.5, 0.5, 0.4), vec3(0.48, 0.56, 0.26), uGreen);
        sky = mix(sky, hz, (1.0 - exp(-dist / 45000.0)) * 0.5);
        // below the horizon (past the ground's edge): the dark haze over the fields
        sky = mix(sky, vec3(0.1, 0.1, 0.085), smoothstep(0.0, -0.03, r.y));
        // the lit band of rain just above the wall's top edge
        float above = (t > 0.0) ? exp(-max(wy - top, 0.0) / (70.0 + 0.035 * uD)) : 0.0;
        sky += mix(vec3(0.3, 0.3, 0.17), vec3(0.26, 0.36, 0.08), uGreen) * above * (1.0 - uDark) * 0.9;
        // lightning glowing in the cloud above each bolt, and the big flash
        for (int k = 0; k < 4; k++) {
          vec4 B = uBolt[k];
          if (B.y <= 0.001) continue;
          float az = atan(r.x, -r.z);
          sky += vec3(0.28, 0.32, 0.45) * B.y * exp(-abs(az - B.x) / 0.35) * 0.7;
        }
        sky += vec3(0.4, 0.44, 0.6) * uFlash;
        sky *= 1.0 - 0.85 * uDark;
        vec3 c = mix(sky, wc, wall);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

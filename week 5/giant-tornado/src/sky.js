// The sky over Main Street, painted per pixel in view directions (the camera barely moves, so nothing needs parallax):
//   - a bright band of rain-lit sky low down (gold, then sick green): it is what the tornado's shape reads against;
//   - a low storm ceiling, a plane with its own perspective, with spiral arms turning round the point where the
//     tornado meets it (cyclonic: the near side moves left to right, like the funnel);
//   - the tornado: a wedge with both edges in frame, drawn much bigger than life. uA is its half-width at the ground
//     and uE the height where it meets the ceiling (both angles, grown in timeline.js with a visible step on every
//     time-lapse jump). The surface is mapped like a real cone, so its bands curve round it, bunch up at the edges and
//     slide across the front as it turns. Lit from behind you on its left side;
//   - a boiling brown debris cloud at its foot, with dark flecks of wreckage going round;
//   - a smaller rope tornado walking across in front of it for a few seconds (uRope: az, half-width, height, strength);
//   - lightning inside it (uBolt: offset across the funnel, strength, seed, how far down) and blue-green power flashes
//     at its foot (uPow: az, el, strength).
// uGreen tints everything green, uDark is the dark at the end. A dome that follows the camera, drawn first.
import * as THREE from 'three';

export function makeSky() {
  const uniforms = {
    uPx: { value: 0.001 }, uTime: { value: 0 }, uSun: { value: new THREE.Vector3(-0.2, 0.3, 0.9) }, uSunK: { value: 1 },
    uA: { value: 0.1 }, uE: { value: 0.5 }, uRot: { value: 0 }, uDebH: { value: 0.06 },
    uGreen: { value: 0 }, uDark: { value: 0 }, uFlash: { value: 0 },
    uRope: { value: new THREE.Vector4() },
    uBolt: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    uPow: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uPx, uTime, uSunK, uA, uE, uRot, uDebH, uGreen, uDark, uFlash;
      uniform vec3 uSun; uniform vec4 uBolt[4]; uniform vec3 uPow[3]; uniform vec4 uRope;
      varying vec3 vD;
      float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float h11(float x){ return fract(sin(x * 91.7) * 43758.5); }
      float n1(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h11(i), h11(i + 1.0), f); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n2(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
      mat2 rot2(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
      void main() {
        vec3 r = normalize(vD);
        float el = asin(clamp(r.y, -1.0, 1.0));
        float az = atan(r.x, -r.z);
        // ---- the bright band low down, then the sky above it ----
        vec3 lowC = mix(vec3(1.9, 1.15, 0.5), vec3(1.0, 1.5, 0.4), uGreen);
        vec3 midC = mix(vec3(0.72, 0.56, 0.4), vec3(0.34, 0.62, 0.22), uGreen);
        vec3 c = mix(lowC, midC, smoothstep(0.03, 0.3, el));
        // ---- the storm ceiling: a plane at height 1, its hub where the tornado meets it ----
        float cov = 0.0;
        vec3 ceil = vec3(0.0);
        if (r.y > 0.004) {
          float D = 1.0 / tan(uE);
          vec2 p = r.xz / r.y;
          vec2 rel = p - vec2(0.0, -D);
          float rho = length(rel);
          // inner parts turn faster, so the arms wind up
          vec2 q = rot2(uRot * 0.5 / (0.55 + rho)) * rel;
          float th = atan(q.x, q.y);
          float n = fbm(q * 1.4 + 3.0);
          float arm = 0.5 + 0.5 * sin(th * 3.0 - uRot * 0.45 + log(rho + 0.08) * 4.6 + n * 3.5);
          float det = fbm(q * 4.2);
          float lit = pow(arm, 1.4) * (0.45 + 0.9 * det);
          vec3 dk = mix(vec3(0.016, 0.018, 0.024), vec3(0.012, 0.03, 0.018), uGreen);
          vec3 lt = mix(vec3(0.3, 0.3, 0.29), vec3(0.17, 0.33, 0.13), uGreen);
          ceil = mix(dk, lt, lit);
          ceil *= 0.3 + 0.7 * smoothstep(0.05, 1.3, rho);              // darker round the hub, where the funnel pours out of it
          // the far rim, scalloped; beyond it the bright band shows
          float Rc = 1.3;
          cov = smoothstep(Rc * 1.08, Rc * 0.9, rho + 0.5 * (n - 0.5));
        }
        c = mix(c, ceil, cov);
        // ---- the tornado ----
        float e = el / uE;
        float rot = uRot;
        float cx = uA * (0.2 * sin(e * 2.3 + 0.7 + uTime * 0.09) + 0.05 * sin(uTime * 0.8 + e * 5.0));
        float w = uA * (1.0 + 0.42 * e + 0.8 * e * e * e);
        w *= 1.0 + 0.1 * (fbm(vec2(e * 7.0 + rot * 0.1, rot * 0.12)) - 0.5);
        float u = (az - cx) / w;
        float inF = 1.0 - smoothstep(0.93, 1.03, abs(u));
        inF *= 1.0 - smoothstep(0.78, 1.12, e);
        float bandAt = 0.0, det = 0.0;
        if (inF > 0.0 && el > -0.08) {
          float uc = clamp(u, -0.999, 0.999);
          float phi = asin(uc);
          float cv = sqrt(1.0 - uc * uc);
          // rings on a cone seen from below bow upward in the middle
          float b = e - (0.1 + 0.3 * e) * cv;
          float hx = phi - rot;
          float warp = fbm(vec2(hx * 0.8 + b * 2.0, b * 3.4));
          // the big bands wind up it, uneven, torn by the finer ribbons that follow the same slant
          float rib = fbm(vec2(hx * 1.1 + b * 3.2, b * 11.0 + warp * 2.2));
          float rib2 = fbm(vec2(hx * 2.8 + b * 6.0, b * 34.0 + warp * 4.0));
          bandAt = 0.5 + 0.5 * sin((b * 4.6 + hx * 0.16) * 6.2832 + warp * 7.0);
          bandAt = 0.5 * bandAt + 0.5 * smoothstep(0.28, 0.72, rib);
          det = rib2;
          float lum = mix(0.01, 0.17, bandAt * bandAt) * (0.55 + 0.95 * det);
          lum += 0.03 * fbm(vec2(hx * 8.0, b * 70.0));
          // round: lit on the left, falling into shadow on the right, dark at the very edges
          float shade = (0.5 + 0.8 * smoothstep(0.85, -0.65, u)) * (0.4 + 0.6 * smoothstep(0.0, 0.55, cv));
          vec3 tint = mix(vec3(0.92, 0.97, 1.08), vec3(0.72, 1.08, 0.72), uGreen);
          vec3 f = lum * shade * tint;
          f += vec3(0.16, 0.1, 0.05) * uSunK * shade * pow(bandAt, 3.0) * smoothstep(0.7, -0.5, u) * 0.5;
          f *= 0.72 + 0.28 * smoothstep(1.0, 0.55, e);                  // it darkens into the ceiling's hub
          // lightning inside it
          for (int k = 0; k < 4; k++) {
            vec4 B = uBolt[k];
            if (B.y <= 0.001) continue;
            float ax = cx + B.x * w;
            float jit = 0.055 * uA * (n1(el * 26.0 + B.z) - 0.5) + 0.02 * uA * (n1(el * 90.0 + B.z * 3.0) - 0.5);
            float dd = abs(az - ax - jit) / uPx;
            float reach = step(uE * (1.0 - B.w), el);
            f += vec3(2.0, 2.2, 3.0) * B.y * reach * (exp(-dd / 2.2) + 0.4 * exp(-dd / 16.0));
            f += vec3(0.42, 0.47, 0.64) * B.y * exp(-abs(u - B.x) / 0.55) * (0.3 + det);
          }
          f += vec3(0.35, 0.38, 0.48) * uFlash * (0.4 + det);
          c = mix(c, f * (1.0 - 0.45 * uDark), inF);
        }
        // ---- the debris cloud boiling at its foot ----
        float dw = uA * 1.55;
        float du = az / dw;
        if (abs(du) < 1.35 && el < uDebH * 1.7) {
          float prof = sqrt(max(0.0, 1.0 - du * du * 0.72));
          // billows that roll up and over, going round with the funnel on the near side
          vec2 bq = vec2(az * 2.1 / uA - rot * 0.42, el * 2.3 / uDebH - uTime * 0.55);
          float bn = fbm(bq);
          float bn2 = fbm(bq + vec2(0.16, -0.2));
          float boil = 1.0 - abs(2.0 * fbm(bq * 1.9 + 4.0) - 1.0);
          float crest = fbm(vec2(az * 6.5 / uA - rot * 0.42, uTime * 0.22));
          float top = uDebH * (0.3 + 0.7 * prof) * (0.62 + 0.62 * crest + 0.14 * boil);
          float dm = (1.0 - smoothstep(top * 0.72, top, el)) * (1.0 - smoothstep(1.0, 1.28, abs(du)));
          float relief = clamp(0.5 + 3.2 * (bn - bn2), 0.0, 1.0);
          vec3 dc = mix(vec3(0.05, 0.034, 0.022), vec3(0.6, 0.41, 0.24), relief * relief * (0.35 + 0.65 * uSunK));
          dc *= 0.62 + 0.55 * smoothstep(0.9, -0.6, du);
          dc *= 0.5 + 0.5 * smoothstep(0.0, uDebH * 0.5, el);
          // flecks of wreckage going round in it
          float cell = 1.6 / sqrt(uA);
          vec2 fq = vec2((az - rot * 0.035) * 26.0, el * 26.0) * cell;
          vec2 fi = floor(fq), ff = fract(fq) - 0.5;
          float hf = h21(fi);
          ff = rot2(hf * 6.0 + uTime * 3.0 * (hf - 0.5)) * ff;
          float fl = step(0.88, hf) * (1.0 - smoothstep(0.1, 0.17, abs(ff.x))) * (1.0 - smoothstep(0.03, 0.08, abs(ff.y))) * smoothstep(0.0, 0.5, dm);
          dc = mix(dc, vec3(0.012), fl);
          c = mix(c, dc * (1.0 - 0.6 * uDark) + vec3(0.3, 0.32, 0.42) * uFlash * 0.5, dm);
        }
        // the rope tornado: thin at the road, flaring at the top, dust going round it fast
        if (uRope.w > 0.001 && el < uRope.z * 1.1) {
          float e2 = max(el, 0.0) / uRope.z;
          float ax = uRope.x + uRope.y * (1.5 * sin(e2 * 4.0 + uTime * 1.3) + 2.5 * e2 * e2 * sin(uTime * 0.7 + 1.0));
          float w2 = uRope.y * (0.55 + 0.9 * e2 + 2.4 * e2 * e2 * e2);
          float u2 = (az - ax) / w2;
          float m2 = (1.0 - smoothstep(0.72, 1.06, abs(u2))) * (1.0 - smoothstep(0.72, 1.05, e2));
          if (m2 > 0.0) {
            float ph2 = asin(clamp(u2, -0.999, 0.999)) - uTime * 7.0;
            float b2 = e2 - 0.1 * sqrt(max(0.0, 1.0 - u2 * u2));
            float g2 = 0.5 + 0.5 * sin((b2 * 11.0 + ph2 * 0.5) * 6.2832 / 2.0 + 3.0 * fbm(vec2(ph2 * 0.7, b2 * 6.0)));
            float det2 = fbm(vec2(ph2 * 1.6, b2 * 26.0));
            vec3 rc = mix(vec3(0.15, 0.12, 0.09), vec3(0.5, 0.41, 0.3), (0.35 + 0.65 * g2) * (0.3 + 1.0 * det2));
            rc *= (0.55 + 0.7 * smoothstep(0.8, -0.6, u2)) * (1.0 - 0.45 * uDark);
            c = mix(c, rc, m2 * uRope.w);
          }
          // the skirt of dust where it touches down
          float sk = exp(-pow((az - uRope.x) / (uRope.y * 3.2), 2.0)) * (1.0 - smoothstep(0.0, uRope.y * (1.4 + 1.6 * fbm(vec2(az * 60.0 - uTime * 4.0, uTime))), el));
          c = mix(c, vec3(0.42, 0.31, 0.2), sk * 0.85 * uRope.w);
        }
        // the power flashes: blue-green, low down
        for (int k = 0; k < 3; k++) {
          vec3 P = uPow[k];
          if (P.z <= 0.001) continue;
          float d = length(vec2(az - P.x, el - P.y));
          c += vec3(0.3, 1.0, 1.05) * P.z * (1.6 * exp(-d / 0.012) + 0.5 * exp(-d / 0.07));
        }
        // lightning glowing in the ceiling, the big flash, the dark at the end
        for (int k = 0; k < 4; k++) {
          vec4 B = uBolt[k];
          if (B.y <= 0.001) continue;
          c += vec3(0.28, 0.32, 0.45) * B.y * exp(-abs(az - B.x * uA) / 0.35) * 0.5 * (1.0 - inF);
        }
        c += vec3(0.32, 0.35, 0.48) * uFlash * (1.0 - inF);
        c *= 1.0 - 0.72 * uDark * (1.0 - inF);
        // below the horizon (past the ground's edge)
        c = mix(c, vec3(0.1, 0.1, 0.085), smoothstep(0.0, -0.03, el));
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

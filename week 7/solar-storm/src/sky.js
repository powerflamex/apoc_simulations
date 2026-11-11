// The sky: a great aurora over the whole sky, as in 1859, when it reached the tropics and stood overhead in the U.S.
// Curtains of light hang in the upper air: a sharp lower edge ~100 km up, green (oxygen at 100-150 km), red above them
// (oxygen at 200-400 km), a pink fringe along the bottom edge; rays run up each curtain; the curtains fold and ripple
// fast. Behind them a patchy red glow (the "blood-red sky" of 1859's papers), green glow low down, a few stars.
// Satellites that the storm drags down cross it as fireballs (0:26). A dome that follows the camera, drawn first.
// The curtains are vertical sheets z' = k * SP of the folded coordinate z' = y + fold(x) (ground position in km). For
// each view ray we solve, sheet by sheet, the height where the ray crosses it (Newton steps on z'(h)), and add that
// sheet's light at that height, divided by how fast the ray crosses it (so a sheet seen edge-on is bright, and overhead
// the sheets converge into a corona the way real auroral rays do).
import * as THREE from 'three';

export const NSAT = 8;

export function makeSky() {
  const uniforms = {
    uTime: { value: 0 }, uAur: { value: 1 }, uLow: { value: 0 }, uWhiteSky: { value: 0 },
    uSatA: { value: Array.from({ length: NSAT }, () => new THREE.Vector4(0, 1, 0, -100)) },
    uSatB: { value: Array.from({ length: NSAT }, () => new THREE.Vector4(0, 1, 0, 1)) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uAur; uniform float uLow; uniform float uWhiteSky;
      uniform vec4 uSatA[${NSAT}]; uniform vec4 uSatB[${NSAT}];
      varying vec3 vD;
      float h12(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h12(i), h12(i + vec2(1, 0)), f.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n2(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
      const float SP = 70.0;
      // the folded coordinate along the ray at height h
      float F(float h, vec2 d2, vec2 w, float t) {
        vec2 q = d2 * h;
        return q.y + 40.0 * sin(q.x * 0.010 + t * 0.32 + 6.0 * w.x) + 24.0 * sin(q.x * 0.026 - t * 0.55 + 4.0 * w.y) + 9.0 * sin(q.x * 0.071 + t * 1.25);
      }
      void main() {
        vec3 d = normalize(vD);
        float y = d.y;
        vec3 c = vec3(0.004, 0.006, 0.012);
        float t = uTime;
        if (y > 0.0) {
          float yy = max(y, 0.01);
          vec2 d2 = d.xz / yy;
          float hb = 102.0 - 9.0 * uLow;                     // the curtains' lower edge
          // the slow warp of the folds, taken once per ray
          vec2 qm = d2 * (hb + 40.0);
          vec2 w = vec2(fbm(qm * 0.005 + vec2(t * 0.04, 0.0)), fbm(qm * 0.005 + vec2(3.1, t * 0.035)));
          // diffuse glow: green patches low, a red veil high
          vec2 qg = d2 * (hb + 12.0), qr = d2 * 260.0;
          float gp = smoothstep(0.35, 0.8, fbm(qg * 0.012 + vec2(t * 0.06, -t * 0.03)));
          float rp = 0.45 + 0.55 * smoothstep(0.3, 0.75, fbm(qr * 0.004 + vec2(-t * 0.02, t * 0.015)));
          vec3 acc = vec3(0.1, 0.75, 0.3) * gp * 0.05 * smoothstep(0.0, 0.25, y) + vec3(0.55, 0.05, 0.12) * rp * 0.06 * smoothstep(0.02, 0.5, y);
          // the sheets
          float hA = hb - 5.0, hB = 400.0;
          float fA = F(hA, d2, w, t), fB = F(hB, d2, w, t);
          float dk = fB > fA ? 1.0 : -1.0;
          float k0 = dk > 0.0 ? ceil(fA / SP) : floor(fA / SP);
          for (int i = 0; i < 12; i++) {
            float k = k0 + dk * float(i);
            float target = k * SP;
            if ((target - fB) * dk > 0.0) break;
            float h = hA + (target - fA) / (fB - fA) * (hB - hA);
            float df = 1.0;
            for (int j = 0; j < 3; j++) {
              float fh = F(h, d2, w, t);
              df = (F(h + 0.8, d2, w, t) - F(h - 0.8, d2, w, t)) / 1.6;
              h -= (fh - target) / (abs(df) > 0.02 ? df : 0.02 * sign(df + 1e-6));
              h = clamp(h, hA, hB);
            }
            vec2 q = d2 * h;
            float G = smoothstep(hb - 4.0, hb + 2.0, h) * exp(-max(h - hb, 0.0) / 34.0);
            float Rr = smoothstep(130.0, 200.0, h) * exp(-max(h - 200.0, 0.0) / 120.0);
            float P = exp(-pow((h - hb + 0.5) / 3.5, 2.0));
            vec3 e = vec3(0.1, 1.0, 0.36) * G * 1.3 + vec3(1.0, 0.08, 0.2) * Rr * 0.55 + vec3(1.0, 0.25, 0.85) * P * 0.9;
            // each sheet's strength along its length (it comes and goes), and the rays (fine striations that flicker and travel)
            float along = q.x * 0.0045 + k * 7.31;
            float strength = 0.15 + 0.85 * smoothstep(0.25, 0.7, fbm(vec2(along, k * 1.7 - t * 0.1)));
            float s = q.x * 0.25 + k * 13.0;
            float ray = 0.35 + 0.65 * n2(vec2(s - t * 2.2, k)) * (0.5 + 0.5 * n2(vec2(s * 2.7 + t * 3.0, k + 9.0)));
            float wd = 3.0 + 4.0 * h12(vec2(k, 3.0));
            float cross = wd / max(abs(df) * yy, wd / 70.0);
            acc += e * strength * ray * min(cross, 6.0) * 0.22;
          }
          acc *= smoothstep(0.0, 0.06, y);
          c += acc * uAur;
          // stars, faint behind it all
          vec2 sc = d.xz / (yy + 0.4) * 340.0;
          c += vec3(0.8, 0.85, 1.0) * step(0.997, h12(floor(sc))) * h12(floor(sc) + 7.0) * 0.35 * smoothstep(0.1, 0.4, y);
          // satellites burning up: big slow streaks, a white-hot head breaking into pieces, a long orange trail
          for (int k = 0; k < ${NSAT}; k++) {
            vec4 A = uSatA[k], B = uSatB[k];
            float u = (t - A.w) / B.w;
            if (u < 0.0 || u > 1.2) continue;
            float uh = min(u, 1.0);
            vec3 head = normalize(mix(A.xyz, B.xyz, uh));
            vec3 tail = normalize(mix(A.xyz, B.xyz, max(uh - 0.5, 0.0)));
            vec3 ab = head - tail; float L = max(length(ab), 1e-5);
            float pr = clamp(dot(d - tail, ab) / (L * L), 0.0, 1.0);
            float dist = length(d - (tail + ab * pr));
            float fade = smoothstep(0.0, 0.06, u) * (1.0 - smoothstep(0.9, 1.2, u));
            float flick = 0.7 + 0.3 * sin(pr * 90.0 - t * 22.0);
            float core = exp(-dist * dist / 1.4e-5), glow = exp(-dist * dist / 1.6e-4);
            c += (vec3(1.3, 1.05, 0.7) * core * 6.0 + vec3(1.6, 0.5, 0.12) * glow * 2.0) * pr * flick * fade;
            vec3 side = normalize(cross(A.xyz, B.xyz));
            for (int j = 0; j < 3; j++) {
              float fj = float(j);
              vec3 hj = normalize(mix(A.xyz, B.xyz, max(uh - 0.03 * fj * (0.4 + u), 0.0)) + side * (fj - 1.0) * 0.003 * u * step(0.5, fj));
              float dj = dot(d - hj, d - hj);
              c += (vec3(9.0, 8.0, 6.5) * exp(-dj / 2.0e-5) + vec3(2.6, 1.1, 0.35) * exp(-dj / 5.0e-4) * 0.9) * fade * (1.0 - 0.3 * fj);
            }
          }
          c = mix(c, vec3(1.0, 0.98, 0.95) * 6.0, uWhiteSky);
        } else {
          c = vec3(0.02, 0.025, 0.03);
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

// The sky at dusk and the bomb in it. A deep blue evening; then the fireball and the mushroom cloud, ray-marched at their
// real size and distance (kilometres, ground zero at the origin, y up from the plain): a ball that swells white, touches
// the ground, cools through yellow and orange into a boiling cap that rolls over itself on a stem of dust and fire, with
// a dust skirt round its foot. Round it the sky glows, thin high cloud catches the light, and the shock's pale shell
// spreads out through the air (the same radius as the dust wall on the ground). A dome that follows the camera, drawn first.
import * as THREE from 'three';

export function makeSky() {
  const uniforms = {
    uTime: { value: 0 }, uRo: { value: new THREE.Vector3(0, 0.085, 20.9) }, uPx: { value: 0.001 },
    uR: { value: 1 }, uH: { value: 4 }, uFlat: { value: 1 }, uA: { value: 0 }, uB: { value: 0 }, uStem: { value: 0 },
    uHeat: { value: 1 }, uBright: { value: 1 }, uAge: { value: 0 }, uShock: { value: 0 }, uShockK: { value: 1 },
    uGlow: { value: 1 }, uSkyO: { value: 0 }, uFlash: { value: 0 }, uDir: { value: new THREE.Vector3(0, 0.2, -1) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, depthTest: true,
    vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uRo; uniform float uPx;
      uniform float uR; uniform float uH; uniform float uFlat; uniform float uA; uniform float uB; uniform float uStem;
      uniform float uHeat; uniform float uBright; uniform float uAge; uniform float uShock; uniform float uShockK;
      uniform float uGlow; uniform float uSkyO; uniform float uFlash; uniform vec3 uDir;
      varying vec3 vD;
      float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n3(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
      float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
      // cauliflower: rounded puffs with sharp creases between them, at three sizes
      float puffs(vec3 p) {
        float s = 0.0, a = 1.0;
        for (int i = 0; i < 3; i++) { float n = abs(2.0 * n3(p) - 1.0); n = 1.0 - (1.0 - n) * (1.0 - n); s += a * n; p = p * 2.1 + 3.7; a *= 0.4; }
        return s / 1.56;
      }
      // the cloud's flesh turns over: the cap's cross-section rolls round its ring as it rises
      vec3 flow(vec3 p) {
        vec3 q = p - vec3(0.0, uH, 0.0);
        float r = length(q.xz), ang = 0.05 * uAge * smoothstep(0.1, 1.0, uB / max(uR, 0.1));
        vec2 s = vec2(r - uA, q.y);
        float c = cos(ang), n = sin(ang);
        s = vec2(s.x * c - s.y * n, s.x * n + s.y * c);
        vec2 dir = r > 1e-3 ? q.xz / r : vec2(1.0, 0.0);
        return vec3(dir.x * (uA + s.x), s.y, dir.y * (uA + s.x));
      }
      float body(vec3 p) {
        vec3 q = p - vec3(0.0, uH, 0.0);
        vec3 e = vec3(uR, uR * uFlat, uR);
        float k0 = length(q / e), k1 = length(q / (e * e));
        float d = k0 * (k0 - 1.0) / max(k1, 1e-4);
        if (uB > 0.01) d = smin(d, length(vec2(length(q.xz) - uA, q.y + uB * 0.35)) - uB, uB * 0.7);
        if (uStem > 0.001) {
          float y = clamp(p.y, 0.0, uH);
          float rad = mix(1.9, 1.45, smoothstep(0.0, 4.0, y)) * uStem + 2.6 * exp(-y / 0.7) * uStem;
          d = smin(d, max((length(p.xz) - rad) * 0.85, p.y - uH), 0.6);
        }
        return max(d, -p.y);
      }
      float amp() { return 0.2 + 0.09 * uR * smoothstep(0.0, 6.0, uAge); }
      float map(vec3 p) {
        float d = body(p);
        if (d > 2.4) return d - 1.8;
        return d - amp() * (puffs(flow(p) * (1.0 - 0.45 * smoothstep(5.0, 11.0, uR)) + vec3(0.0, -uAge * 0.09, 0.0)) * 1.9 - 0.5);
      }
      vec3 ramp(float T) {
        // soot, deep red, orange, yellow, white
        vec3 c = mix(vec3(0.03, 0.02, 0.018), vec3(0.42, 0.06, 0.012), smoothstep(0.08, 0.34, T));
        c = mix(c, vec3(1.9, 0.52, 0.06), smoothstep(0.3, 0.58, T));
        c = mix(c, vec3(3.4, 2.0, 0.55), smoothstep(0.54, 0.8, T));
        return mix(c, vec3(4.2, 3.9, 3.5), smoothstep(0.78, 1.08, T));
      }
      void main() {
        vec3 d = normalize(vD);
        float h = d.y;
        // ---- the evening ----
        vec3 zen = vec3(0.012, 0.03, 0.095);
        vec3 mid = vec3(0.045, 0.085, 0.2);
        vec3 hor = vec3(0.22, 0.2, 0.3);
        vec3 sky = mix(hor, mid, smoothstep(0.0, 0.2, h));
        sky = mix(sky, zen, smoothstep(0.12, 0.8, h));
        // (the last of the sunset, behind you and off to the left)
        sky += vec3(0.5, 0.2, 0.1) * pow(max(dot(d, normalize(vec3(-0.75, 0.03, 0.65))), 0.0), 7.0) * exp(-max(h, 0.0) * 5.0);
        float ang = acos(clamp(dot(d, uDir), -1.0, 1.0));
        float n = fbm(d * 7.0 + vec3(0.0, uTime * 0.02, 0.0));
        // ---- the glow in the air round it ----
        vec3 gc = mix(vec3(1.0, 0.42, 0.14), vec3(1.0, 0.86, 0.68), smoothstep(0.55, 1.05, uHeat));
        float gl = (0.8 * exp(-ang / 0.13) + 0.2 * exp(-ang / 0.42) + 0.025 * exp(-ang / 1.5)) * uGlow;
        sky += gc * gl * (1.0 + 0.22 * smoothstep(0.3, -0.02, h));
        // the whole sky goes the colour of the fire
        sky = mix(sky, vec3(0.5, 0.17, 0.05) * (0.45 + 0.75 * n) * (0.45 + 0.6 * smoothstep(0.9, 0.0, h)), uSkyO * 0.86);
        // thin high cloud, lit from below
        if (h > 0.02) {
          vec2 q = d.xz / (h + 0.2);
          float w = fbm(vec3(q * 2.4 + vec2(0.0, uTime * 0.006), 1.7));
          float cl = smoothstep(0.5, 0.72, w) * smoothstep(0.02, 0.16, h) * 0.75;
          sky = mix(sky, vec3(0.05, 0.05, 0.09) + gc * (0.05 * uGlow + 0.9 * gl), cl * 0.7);
        }
        // ---- the shock's shell in the air: a pale edge spreading out through the sky ----
        {
          vec3 oc = uRo - vec3(0.0, 1.5, 0.0);
          float b = dot(oc, d), c = dot(oc, oc) - uShock * uShock, disc = b * b - c;
          if (disc > 0.0 && uShock > 1.0) {
            float s = sqrt(disc) / uShock;                                   // 0 at the shell's limb, 1 through its middle
            float e = exp(-s * s / 0.05);
            sky += vec3(0.75, 0.82, 0.95) * e * 0.14 * uShockK * (0.6 + 0.7 * n) * smoothstep(0.0, 0.08, h);
          }
        }
        // ---- the fireball and the cloud ----
        {
          vec3 ro = uRo;
          // only rays that can reach it
          vec3 c0 = vec3(0.0, uH * 0.55, 0.0) - ro;
          float tc = dot(c0, d);
          float rb = uR * 1.5 + uH * 0.6 + 2.0;
          float miss = length(c0 - d * tc);
          if (tc > 0.0 && miss < rb) {
            float t = max(tc - rb * 1.3, 0.2), best = 1e9, hit = 0.0;
            vec3 p = ro;
            for (int i = 0; i < 64; i++) {
              p = ro + d * t;
              float m = map(p);
              float pxs = uPx * t;
              best = min(best, m / pxs);
              if (m < pxs * 0.7) { hit = 1.0; break; }
              t += m * 0.72;
              if (t > tc + rb * 1.4) break;
            }
            float a = hit > 0.5 ? 1.0 : 1.0 - smoothstep(0.0, 1.6, best);
            if (a > 0.0) {
              float e2 = 0.16;
              vec2 k = vec2(1.0, -1.0);
              vec3 N = normalize(k.xyy * map(p + k.xyy * e2) + k.yyx * map(p + k.yyx * e2) + k.yxy * map(p + k.yxy * e2) + k.xxx * map(p + k.xxx * e2));
              vec3 f = flow(p);
              float m1 = fbm(f * 0.55 + vec3(0.0, -uAge * 0.06, 0.0));
              float m2 = n3(f * 2.4 + uAge * 0.15);
              float crease = clamp(body(p) / max(amp(), 1e-3) + 0.5, 0.0, 1.0);    // the bumps' tops are cooler than the folds
              // hottest deep inside and under the cap; the stem is mostly dust
              float q = length((p - vec3(0.0, uH, 0.0)) / vec3(uR, uR * uFlat, uR));
              float inCap = smoothstep(uH - uR * 0.75, uH - uR * 0.25, p.y);
              float T = uHeat * (1.25 - 0.42 * q) + (m1 - 0.5) * (0.35 + 1.05 * (1.15 - min(uHeat, 1.15))) + 0.12 * (1.0 - crease) - 0.05 * m2;
              T = mix(T - 0.34 - 0.5 * smoothstep(0.0, 3.0, p.y) * (1.0 - smoothstep(4.0, uH, p.y)) * 0.2, T, inCap);
              vec3 c = ramp(T) * uBright;
              // its own light on the soot, the sky above it
              float lit = 0.5 + 0.5 * dot(N, normalize(vec3(0.0, -0.4, 0.6)));
              c += vec3(0.5, 0.15, 0.05) * (0.1 + 0.5 * uHeat) * lit * (0.5 + m1);
              c *= mix(mix(0.42, 1.2, 0.5 + 0.5 * dot(N, normalize(vec3(0.15, 0.7, 0.7)))), 1.0, smoothstep(0.72, 1.0, T));
              c += vec3(0.05, 0.07, 0.14) * max(N.y, 0.0) * (1.0 - uSkyO) * (1.0 - smoothstep(0.2, 0.5, T)) + vec3(0.2, 0.07, 0.02) * max(N.y, 0.0) * uSkyO;
              // the air between you and it
              c = mix(c, c * vec3(1.0, 0.86, 0.72), 0.3);
              sky = mix(sky, c, a);
            }
          }
        }
        // below the horizon line (past the plain's edge): the haze over the far city
        sky = mix(sky, hor * 0.9 + gc * 0.5 * uGlow, smoothstep(0.0, -0.03, h));
        sky = mix(sky, vec3(1.0, 0.97, 0.92) * 3.0, uFlash);
        gl_FragColor = vec4(sky, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  mesh.frustumCulled = false;
  // Drawn after every other opaque object, depth-tested at the far plane: the sky shader then only runs where sky
  // is actually visible, instead of on the whole frame before the world is drawn over it. Transparent objects
  // still come after it, so the picture is the same. (Needs every other opaque object to write and test depth.)
  mesh.renderOrder = 1000;
  return { mesh, uniforms };
}

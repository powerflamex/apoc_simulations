// Shared GLSL: hashes, 3D value noise, a 2D Voronoi (plate edges), and the pit's haze.
export const NOISE = /* glsl */ `
  float h31(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
  float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  vec2 h22(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h31(i), h31(i + vec3(1, 0, 0)), f.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), f.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float vnoise2(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
  }
  // fbm whose octaves fade out once they are smaller than a pixel (fw: world size of a pixel) or than the blur
  float fbmA(vec3 p, float fw, float blur) {
    float s = 0.0, a = 0.5, f = 1.0, n = 0.0;
    for (int i = 0; i < 6; i++) {
      float k = 1.0 - smoothstep(0.35, 1.0, fw * f) ;
      k *= exp(-blur * f * 1.2);
      s += a * (mix(0.5, vnoise(p * f), k));
      n += a; a *= 0.5; f *= 2.03;
    }
    return s / n;
  }
  // Voronoi: distance to the nearest edge (approx F2 - F1), and the nearest cell's id
  vec3 voro(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float d1 = 9.0, d2 = 9.0; vec2 id = vec2(0.0);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = g + 0.15 + 0.7 * h22(i + g) - f;
      float d = dot(o, o);
      if (d < d1) { d2 = d1; d1 = d; id = i + g; } else if (d < d2) d2 = d;
    }
    return vec3(sqrt(d2) - sqrt(d1), id);
  }
`;

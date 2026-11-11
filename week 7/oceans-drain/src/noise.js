// Value noise for the terrain (JS) and the same family for the shaders (GLSL).
export function hash2(ix, iz) {
  let h = Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  let fx = x - ix, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
export function fbm(x, z, oct = 4) {
  let a = 0.5, s = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x, z); x = x * 2.03 + 17.1; z = z * 2.03 + 9.7; a *= 0.5; }
  return s;
}
// ridged: sharp crests (rock ribs, mountain ridges), 0..1
export function ridged(x, z, oct = 4) {
  let a = 0.5, s = 0;
  for (let i = 0; i < oct; i++) { s += a * (1 - Math.abs(2 * vnoise(x, z) - 1)); x = x * 2.03 + 17.1; z = z * 2.03 + 9.7; a *= 0.5; }
  return s;
}

export const NOISE_GLSL = /* glsl */ `
float h2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
float fbm2(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n2(p); p = p * 2.03 + vec2(17.1, 9.7); a *= 0.5; } return s; }
`;

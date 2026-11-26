// Math + deterministic randomness helpers.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeIn = (t) => t * t * t;
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const DEG = Math.PI / 180;

// mulberry32 seeded PRNG
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Piecewise interpolation through [t, value] keys with smoothstep easing per segment.
// log=true interpolates in log space (for distances spanning orders of magnitude).
export function keys(list, t, log = false) {
  if (t <= list[0][0]) return list[0][1];
  for (let i = 0; i < list.length - 1; i++) {
    const [t0, v0] = list[i];
    const [t1, v1] = list[i + 1];
    if (t <= t1) {
      const k = smooth(t0, t1, t);
      return log ? Math.exp(lerp(Math.log(v0), Math.log(v1), k)) : lerp(v0, v1, k);
    }
  }
  return list[list.length - 1][1];
}

// Cheap smooth 1D noise (sum of incommensurate sines), deterministic.
export function wobble(t, seed = 0) {
  return (
    Math.sin(t * 1.31 + seed * 12.9) * 0.5 +
    Math.sin(t * 2.71 + seed * 3.7) * 0.3 +
    Math.sin(t * 5.13 + seed * 7.1) * 0.2
  );
}

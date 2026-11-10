// The view through the coin telescope on the terrace (a 2D insert drawn in the finish pass): a far-off spiral galaxy
// in the round eyepiece field. As space stretches faster and faster it slides away: its light reddens (red 0..1),
// it shrinks and dims, and then it is gone (fade 0..1), leaving the empty field.
export const SCOPE_GLSL = /* glsl */ `
float sh1(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float sn2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(sh1(i), sh1(i+vec2(1,0)), f.x), mix(sh1(i+vec2(0,1)), sh1(i+vec2(1,1)), f.x), f.y); }
float sfbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * sn2(p); p = p * 2.07 + 1.3; a *= 0.5; } return s; }

vec3 scopeView(vec2 uv, float aspect, float red, float fade, float t) {
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  float field = 0.44;
  float rr = length(p);
  vec3 c = vec3(0.004, 0.005, 0.012);
  // a few faint field stars
  for (int i = 0; i < 9; i++) {
    vec2 sp = (vec2(sh1(vec2(float(i), 3.0)), sh1(vec2(float(i), 7.0))) - 0.5) * 0.82;
    c += vec3(0.85, 0.88, 1.0) * exp(-dot(p - sp, p - sp) / 0.000005) * 0.6;
  }
  // the air shimmers: the image dances by a hair
  vec2 jit = vec2(0.0);
  vec2 q = p - jit;
  float a = 0.5;
  q = mat2(cos(a), -sin(a), sin(a), cos(a)) * q / (0.3 * (1.0 - 0.5 * red));
  q.y *= 2.3;                                               // seen tilted
  float r = length(q);
  float ang = atan(q.y, q.x);
  float arms = 0.5 + 0.5 * sin(ang * 2.0 - log(r + 0.03) * 4.0);
  float knots = pow(sfbm(q * 7.0 + 3.0), 3.0) * 2.0;
  float core = exp(-r * r / 0.008) * 2.2 + exp(-r * r / 0.05) * 0.5;
  float disk = exp(-r / 0.28) * (0.35 + 0.9 * arms) * (0.7 + 0.6 * knots);
  float dust = 1.0 - 0.5 * smoothstep(0.55, 0.8, sfbm(q * 5.0 + 9.0)) * exp(-pow((r - 0.35) / 0.15, 2.0));
  vec3 gal = vec3(1.0, 0.88, 0.7) * core + vec3(0.8, 0.85, 1.0) * disk * dust;
  // its light, stretched: redder and fainter, then gone
  vec3 tint = mix(vec3(1.0), vec3(1.35, 0.4, 0.2), red) * (1.0 - 0.55 * red) * (1.0 - fade);
  c += gal * tint * 0.9;
  // the round field, a soft dark edge; black outside
  c *= smoothstep(field, field - 0.03, rr);
  c *= 1.0 - 0.35 * smoothstep(field * 0.6, field, rr);
  return c;
}
`;

// Two 2D inserts drawn in the finish pass:
//   scopeView: the view through the amateur's telescope: Jupiter's banded disk and its four big moons in a round
//     eyepiece field, trembling a little in the air. Night after night the disk is smaller (uJupR) and fainter.
//   phoneView: a phone held up close, the scene behind it out of focus; its map shows your blue dot, then the GPS
//     goes (uGps): the accuracy circle balloons, the dot greys out (the banner text is in the DOM overlay).
export const SCOPE_GLSL = /* glsl */ `
float sh1(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float sn2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(sh1(i), sh1(i+vec2(1,0)), f.x), mix(sh1(i+vec2(0,1)), sh1(i+vec2(1,1)), f.x), f.y); }
float sfbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * sn2(p); p = p * 2.07 + 1.3; a *= 0.5; } return s; }

vec3 scopeView(vec2 uv, float aspect, float jr, float ji, float t) {
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  float field = 0.44;
  float rr = length(p);
  vec3 c = vec3(0.004, 0.005, 0.012);
  // a couple of faint field stars
  for (int i = 0; i < 6; i++) {
    vec2 sp = (vec2(sh1(vec2(float(i), 3.0)), sh1(vec2(float(i), 7.0))) - 0.5) * 0.8;
    c += vec3(0.8, 0.85, 1.0) * exp(-dot(p - sp, p - sp) / 0.000004) * 0.5 * ji;
  }
  // the air shimmers: the image dances by a hair
  vec2 jit = vec2(sn2(vec2(t * 3.1, 1.0)) - 0.5, sn2(vec2(t * 2.7, 5.0)) - 0.5) * 0.004;
  vec2 q = p - jit;
  float R = max(0.165 * jr, 0.004);
  float d = length(q);
  float mu = sqrt(max(1.0 - d * d / (R * R), 0.0));
  if (d < R * 1.02) {
    float lat = q.y / R;
    float lon = q.x / (R * max(mu, 0.05));
    float turb = sfbm(vec2(lon * 1.5 + t * 0.05, lat * 9.0)) - 0.5;
    float l2 = lat + turb * 0.06;
    // belts (dark, tan-brown) and zones (cream)
    float belts = smoothstep(0.1, 0.16, abs(l2 - 0.2)) * smoothstep(0.1, 0.16, abs(l2 + 0.22)) * smoothstep(0.05, 0.08, abs(l2 - 0.48)) * smoothstep(0.05, 0.08, abs(l2 + 0.5));
    vec3 zone = vec3(0.95, 0.9, 0.8), belt = vec3(0.68, 0.48, 0.34);
    vec3 jc = mix(belt, zone, belts);
    jc = mix(jc, vec3(0.62, 0.62, 0.66), smoothstep(0.65, 0.9, abs(lat)));   // the greyer poles
    // the Great Red Spot, drifting across as the planet turns
    vec2 g = vec2((lon - (fract(t * 0.02) * 4.0 - 2.0)) * 1.0, (lat + 0.36) * 2.6);
    jc = mix(jc, vec3(0.78, 0.4, 0.28), smoothstep(0.22, 0.14, length(g)) * step(-1.0, lon) * step(lon, 1.0));
    jc *= 0.45 + 0.55 * mu;                                  // limb darkening
    float edge = smoothstep(R * 1.02, R * 0.97, d);
    c = mix(c, jc * 1.6 * ji, edge);
  }
  c += vec3(1.0, 0.95, 0.85) * exp(-max(d - R, 0.0) / 0.004) * 0.06 * ji;
  // the four big moons along the equator (orbits in Jupiter radii: 5.9, 9.4, 15, 26.4)
  for (int i = 0; i < 4; i++) {
    float a = float(i == 0 ? 5.9 : i == 1 ? 9.4 : i == 2 ? 15.0 : 26.4);
    float ph = t * (0.9 / pow(a, 1.5)) * 6.0 + float(i) * 1.7;
    vec2 mp = vec2(cos(ph) * a * R * 0.98, sin(ph) * a * R * 0.03);
    if (sin(ph) < 0.0 && abs(mp.x) < R) continue;            // behind the planet
    c += vec3(0.95, 0.9, 0.8) * exp(-dot(q - mp, q - mp) / max(0.0000025, R * R * 0.0016)) * 1.2 * ji;
  }
  // the round field, a soft dark edge; black outside
  c *= smoothstep(field, field - 0.03, rr);
  c *= 1.0 - 0.35 * smoothstep(field * 0.6, field, rr);
  return c;
}

vec3 phoneView(sampler2D tex, vec2 uv, float aspect, float gps, float t) {
  // the scene behind, out of focus and darker
  vec3 bg = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    float a = float(i) * 2.399, r = sqrt(float(i) / 16.0) * 0.035;
    bg += texture2D(tex, uv + vec2(cos(a) / aspect, sin(a)) * r).rgb;
  }
  bg = bg / 16.0 * 0.55;
  vec2 p = (uv - vec2(0.5, 0.48)) * vec2(aspect, 1.0);
  vec2 hs = vec2(0.197, 0.42);
  float rad = 0.045;
  vec2 dq = abs(p) - (hs - rad);
  float sd = length(max(dq, 0.0)) + min(max(dq.x, dq.y), 0.0) - rad;
  float px = 1.5 / 1080.0;
  vec3 c = bg;
  // the hand holding it: a dark blur under the lower edge
  c *= 1.0 - 0.5 * smoothstep(0.25, 0.0, length((p - vec2(0.17, -0.42)) * vec2(1.0, 1.6)));
  c = mix(c, vec3(0.015), smoothstep(px, -px, sd));                     // the body / bezel
  float ss = sd + 0.012;
  if (ss < 0.0) {
    // the map
    vec2 s = (p + hs) / (hs * 2.0);                                     // 0..1 over the screen
    vec2 m = vec2(s.x * 0.47, s.y) * 5.0 + vec2(1.3, 0.6);
    vec2 gm = m * mat2(0.94, -0.34, 0.34, 0.94);
    vec3 col = vec3(0.93, 0.91, 0.86);
    float road = 1.0 - smoothstep(0.035, 0.05, min(abs(fract(gm.x) - 0.5), abs(fract(gm.y * 1.4) - 0.5)) - 0.43);
    float big = 1.0 - smoothstep(0.03, 0.045, abs(gm.x - 2.0 - 0.1 * sin(gm.y)) - 0.02);
    vec2 bi = floor(vec2(gm.x, gm.y * 1.4));
    if (sh1(bi) < 0.12) col = vec3(0.72, 0.86, 0.66);                    // parks
    if (gm.x + 0.3 * sin(gm.y * 1.3) < 0.4) col = vec3(0.66, 0.8, 0.94); // the river
    col = mix(col, vec3(1.0), road * 0.95);
    col = mix(col, vec3(0.99, 0.86, 0.45), big);
    // your blue dot, its accuracy circle ballooning as the satellites go; then grey
    vec2 dp = (s - vec2(0.5, 0.45)) * vec2(0.47, 1.0);
    float dd = length(dp);
    float acc = 0.025 + 0.35 * smoothstep(0.0, 0.8, gps);
    vec3 blue = mix(vec3(0.16, 0.45, 0.98), vec3(0.6, 0.62, 0.66), smoothstep(0.6, 0.9, gps));
    col = mix(col, blue, 0.16 * smoothstep(acc, acc - 0.004, dd) * (1.0 - smoothstep(0.85, 1.0, gps)));
    col = mix(col, vec3(1.0), smoothstep(0.022, 0.019, dd));
    col = mix(col, blue, smoothstep(0.016, 0.013, dd));
    float pulse = fract(t * 0.8);
    col = mix(col, blue, 0.35 * (1.0 - pulse) * smoothstep(0.004, 0.0, abs(dd - 0.016 - pulse * 0.05)) * (1.0 - gps));
    // the top banner (the words are in the overlay)
    float bar = step(0.86, s.y) * step(s.y, 0.95);
    col = mix(col, mix(vec3(0.15, 0.17, 0.2), vec3(0.75, 0.12, 0.1), smoothstep(0.55, 0.65, gps)), bar * 0.95);
    col = mix(col, vec3(0.05), step(0.955, s.y));                       // the status bar
    c = col * 0.95;
    // a little glare on the glass
    c += vec3(0.04) * smoothstep(0.3, 0.0, abs(p.x + p.y * 0.5 - 0.05));
  }
  return c;
}
`;

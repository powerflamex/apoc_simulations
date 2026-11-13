// The sky over the avenue at noon, and the Sun coming closer.
//   The Sun (uSun, drawn angular radius uSunA): drawn as a real ball of radius 1 at distance 1/sin(uSunA), so the same code
//   is right from a white-hot dot to the last seconds, when its surface fills the frame. Its face: granules (3D Voronoi cells,
//   ~700 across the Sun, faded out once a cell is under a pixel), supergranules and a few sunspots; limb darkening; a white-hot
//   look while it's small (uWhite); a glare round it; prominences licking off the rim once it's big (uProm).
//   Venus (uVen, uVenA): a ball lit from the Sun: a crescent, its night side the colour of the sky in front of it.
//   The sky: deep blue, paling with the heat (uHeat), browned by the smoke of the fires (uSmoke), orange at the end (uEnd).
import * as THREE from 'three';

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w * 0.99999;
}`;

const frag = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 uSun; uniform float uSunA; uniform float uSunI; uniform float uWhite; uniform float uProm; uniform float uGlowK;
uniform vec3 uVen; uniform float uVenA; uniform float uVenVis;
uniform float uPx; uniform float uT; uniform float uCloud;
uniform float uHeat; uniform float uSmoke; uniform float uEnd;
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 hash33(vec3 p) { return vec3(hash13(p), hash13(p + 17.3), hash13(p + 41.9)); }
float noise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
// granules: bright cells, dark lanes (F2 - F1 of a jittered 3D grid; the points drift so the cells churn)
float granule(vec3 p, float t) {
  vec3 i = floor(p), f = fract(p);
  float d1 = 9.0, d2 = 9.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 h = hash33(i + o);
    vec3 r = o + 0.5 + 0.38 * sin(6.2831 * h + t * (0.6 + 0.8 * h.yzx)) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return sqrt(d2) - sqrt(d1);
}
// a ball of angular radius A round direction c, seen along v: (coverage, normal); the ball has radius 1 at distance 1/sin(A)
float ball(vec3 v, vec3 c, float A, out vec3 n, out float ang) {
  ang = 2.0 * asin(clamp(length(v - c) * 0.5, 0.0, 1.0));
  float w = uPx * 0.9;
  float inside = 1.0 - smoothstep(A - w, A + w, ang);
  float D = 1.0 / max(sin(A), 1e-6);
  float b = D * dot(v, c);
  float disc = max(b * b - D * D + 1.0, 0.0);
  float t = b - sqrt(disc);
  n = normalize(v * t - c * D);
  return inside;
}

void main() {
  vec3 v = normalize(vDir);
  float h = v.y, hh = clamp(h, 0.0, 1.0);
  // ---------- the sky ----------
  vec3 zen = vec3(0.07, 0.24, 0.70), hor = vec3(0.52, 0.70, 0.92);
  hor = mix(hor, vec3(0.80, 0.80, 0.76), uHeat * 0.55);
  zen = mix(zen, vec3(0.16, 0.30, 0.62), uHeat * 0.5);
  vec3 c = mix(hor, zen, pow(smoothstep(0.0, 0.85, hh), 0.55));
  // fair-weather clouds (they burn off in the first days of heat)
  if (h > 0.02 && uCloud > 0.0) {
    vec2 q = v.xz / (h + 0.08) * 1.6;
    float cl = smoothstep(0.55, 0.8, fbm3(vec3(q * 1.3, 1.0))) * smoothstep(0.02, 0.2, h) * uCloud;
    float shade = 0.82 + 0.18 * smoothstep(0.4, 0.9, fbm3(vec3(q * 2.6 + 3.0, 2.0)));
    c = mix(c, vec3(1.0, 0.99, 0.97) * shade * 1.05, cl * 0.9);
  }
  // the smoke of the fires: a brown pall, darkest overhead and away from the Sun
  float sd = max(dot(v, uSun), 0.0);
  vec3 smk = mix(vec3(0.55, 0.3, 0.13), vec3(0.15, 0.075, 0.035), pow(smoothstep(0.0, 0.7, hh), 0.7));
  smk = mix(smk, vec3(1.0, 0.62, 0.3), pow(sd, 6.0) * 0.6);
  c = mix(c, smk, uSmoke);
  // the end: everything orange-red in the Sun's light
  vec3 endc = mix(vec3(0.85, 0.3, 0.05), vec3(0.3, 0.07, 0.015), pow(1.0 - sd, 2.0));
  c = mix(c, endc, uEnd);
  // ---------- the Sun's glare ----------
  float sAng = 2.0 * asin(clamp(length(v - uSun) * 0.5, 0.0, 1.0));
  float o = max(sAng - uSunA, 0.0);
  vec3 gc = mix(vec3(1.0, 0.75, 0.45), vec3(1.0, 0.95, 0.85), uWhite);
  c += gc * uGlowK * (exp(-o / (0.003 + 0.12 * uSunA)) * (0.9 + 0.5 * uWhite) + exp(-o / (0.03 + 0.5 * uSunA)) * 0.22);
  // harsh glare while it's white-hot: a starburst of rays round the disc
  if (uWhite > 0.0 && o > 0.0) {
    vec3 r1 = normalize(cross(uSun, vec3(0.0, 1.0, 0.0))), r2 = cross(r1, uSun);
    vec3 rp = v - uSun * dot(v, uSun);
    float phi = atan(dot(rp, r2), dot(rp, r1));
    float rays = pow(abs(cos(phi * 3.0 + 0.3)), 70.0) + 0.55 * pow(abs(cos(phi * 3.0 + 0.82)), 110.0);
    c += vec3(1.0, 0.97, 0.9) * uWhite * rays * exp(-o / (0.02 + 1.4 * uSunA)) * 0.75;
  }
  // ---------- Venus ----------
  if (uVenVis > 0.0) {
    vec3 n; float a;
    float k = ball(v, uVen, uVenA, n, a);
    if (k > 0.0) {
      // a planet, not the Moon: pale yellow cloud tops in soft bands and chevrons, lit from the Sun's side (a phase), the
      // night side darker than the daytime sky round it so the whole ball shows
      float ndl = dot(n, uSun);
      float lit = smoothstep(-0.03, 0.18, ndl) * (0.55 + 0.45 * smoothstep(0.0, 0.7, ndl));
      float mu = max(dot(n, -v), 0.0);
      float lat = n.y;
      float bands = fbm3(vec3(n.x * 2.0 + abs(lat) * 5.0, lat * 11.0, n.z * 2.0)) * 0.7 + 0.3 * fbm3(n * 7.0 + 2.0);
      vec3 cloud = mix(vec3(0.8, 0.6, 0.27), vec3(1.0, 0.9, 0.58), smoothstep(0.3, 0.75, bands));
      vec3 vc = cloud * (0.55 + 0.45 * pow(mu, 0.4)) * 0.95;
      vec3 night = c * 0.55;
      c = mix(c, mix(night, vc, lit), k * uVenVis);
    }
  }
  // ---------- the Sun ----------
  {
    vec3 n; float a;
    float k = ball(v, uSun, uSunA, n, a);
    if (k > 0.0) {
      float mu = clamp(dot(n, -v), 0.0, 1.0);
      // granules: ~700 across the Sun's radius; fade them once a cell is smaller than ~2 pixels
      vec3 p = n * 700.0;
      float fp = length(fwidth(p));
      float gk = 1.0 - smoothstep(0.35, 0.9, fp);
      float g = gk > 0.0 ? granule(p, uT) : 0.5;
      float cell = smoothstep(0.02, 0.32, g);
      cell = mix(0.62, cell, gk);
      // fine grain inside the cells once you're close
      float gk2 = 1.0 - smoothstep(0.35, 0.9, fp * 7.0);
      if (gk2 > 0.0) cell *= 1.0 - 0.28 * gk2 * noise3(p * 7.0 + uT * 0.3);
      // boiling plasma at every scale you can see: big turbulent cells, bright twisting filaments, fine churn (each faded
      // out once it gets smaller than a couple of pixels, so it never shimmers)
      vec3 fl = vec3(0.0, uT * 0.12, uT * 0.07);
      float f1 = fbm3(n * 13.0 + fl);
      float r1 = 1.0 - abs(2.0 * fbm3(n * 34.0 + fl * 1.6 + 5.0) - 1.0);
      r1 = r1 * r1 * r1;
      float k3 = 1.0 - smoothstep(0.25, 0.8, length(fwidth(n * 110.0)));
      float f3 = k3 > 0.0 ? fbm3(n * 110.0 + fl * 2.5 + 9.0) : 0.5;
      float heat = -0.08 + 0.62 * f1 + 0.5 * r1 + 0.3 * (f3 - 0.5) * k3 + 0.32 * (cell - 0.62) * gk;
      // active regions: a few small spots, each in a bright, hot ring of plage and magnetic loops (not flat black holes)
      vec3 f0 = -uSun;
      vec3 e1 = normalize(cross(f0, vec3(0.0, 1.0, 0.0))), e2 = cross(e1, f0);
      float spot = 0.0, pen = 0.0, plage = 0.0;
      for (int i = 0; i < 4; i++) {
        vec2 off = i == 0 ? vec2(-0.34, 0.22) : i == 1 ? vec2(-0.27, 0.29) : i == 2 ? vec2(0.41, -0.18) : vec2(0.12, 0.47);
        float rr = (i == 0 ? 0.05 : i == 1 ? 0.03 : i == 2 ? 0.045 : 0.025) * 0.55;
        vec3 sc0 = normalize(f0 + e1 * off.x + e2 * off.y);
        vec3 dv = n - sc0;
        float dd = length(dv);
        float ang = atan(dot(dv, e2), dot(dv, e1));
        float fil = noise3(vec3(ang * 9.0, dd * 60.0, float(i)));
        spot = max(spot, 1.0 - smoothstep(rr * 0.8, rr, dd));
        pen = max(pen, (1.0 - smoothstep(rr * 1.7, rr * 2.1, dd)) * (0.7 + 0.3 * fil));
        float ring = exp(-pow((dd - rr * 3.2) / (rr * 1.8), 2.0)) * (0.5 + 0.5 * noise3(vec3(ang * 5.0, dd * 30.0, 7.0 + float(i))));
        plage = max(plage, ring);
      }
      heat += 0.22 * plage;
      // limb darkening: the rim is cooler and redder
      heat *= 0.62 + 0.38 * pow(mu, 0.45);
      heat = clamp(heat, 0.0, 1.15);
      // a fire ramp: dark red, red-orange, orange, yellow, near-white at the hottest
      vec3 fire = mix(vec3(0.42, 0.04, 0.0), vec3(0.95, 0.24, 0.02), smoothstep(0.0, 0.35, heat));
      fire = mix(fire, vec3(1.0, 0.52, 0.07), smoothstep(0.3, 0.6, heat));
      fire = mix(fire, vec3(1.05, 0.8, 0.3), smoothstep(0.55, 0.85, heat));
      fire = mix(fire, vec3(1.2, 1.05, 0.72), smoothstep(0.85, 1.1, heat));
      vec3 sc = fire * 0.98;
      sc = mix(sc, vec3(0.55, 0.12, 0.01), pen * 0.55);
      sc = mix(sc, vec3(0.22, 0.04, 0.0), spot * 0.85);
      // the glowing rim
      sc += vec3(1.0, 0.38, 0.05) * pow(1.0 - mu, 4.0) * 0.55;
      // white-hot while it's small (the glare of a too-big Sun at noon)
      vec3 wh = vec3(1.55, 1.5, 1.4) * (0.82 + 0.18 * pow(mu, 0.4));
      sc = mix(sc, wh, uWhite);
      c = mix(c, sc * uSunI, k);
    } else if (uProm > 0.0) {
      // outside the rim: a fringe of spicules, prominences (loops and tongues of glowing gas, flowing), and the corona's
      // streamers
      vec3 e1 = normalize(cross(uSun, vec3(0.0, 1.0, 0.0))), e2 = cross(e1, uSun);
      vec3 vp = v - uSun * dot(v, uSun);
      float phi = atan(dot(vp, e2), dot(vp, e1));
      float hgt = (a - uSunA) / uSunA;
      vec2 cp = vec2(cos(phi), sin(phi));
      float fringe = (1.0 - smoothstep(0.0, 0.025, hgt)) * (0.55 + 0.45 * fbm3(vec3(cp * 60.0, uT * 0.3)));
      float sh = fbm3(vec3(cp * 6.0, uT * 0.04));
      float tall = 0.04 + 0.34 * smoothstep(0.42, 0.78, sh);
      float lick = fbm3(vec3(cp * 26.0, hgt * 14.0 - uT * 0.5));
      float pr = (1.0 - smoothstep(tall * 0.35, tall, hgt)) * smoothstep(0.32, 0.58, lick) * smoothstep(0.0, 0.003, hgt);
      float streak = (0.35 + 0.65 * pow(fbm3(vec3(cp * 9.0, 3.0)), 2.0)) * exp(-hgt / 0.3);
      c = mix(c, c * 0.55, uProm * 0.6 * exp(-hgt / 0.6));   // (the sky right round it darkened by the smoke, so the flames show)
      c += (vec3(1.0, 0.45, 0.06) * fringe * 1.8 + vec3(1.0, 0.26, 0.03) * pr * 3.2 + vec3(1.0, 0.55, 0.2) * streak * 0.4) * uProm;
    }
  }
  // below the horizon (hidden by the sea and the ground anyway)
  c = mix(c, hor * 0.7, smoothstep(0.0, -0.05, h) * (1.0 - uEnd));
  gl_FragColor = vec4(clamp(c, 0.0, 40.0), 1.0);
}`;

export function makeSky() {
  const V = (x, y, z) => ({ value: new THREE.Vector3(x, y, z) });
  const uniforms = {
    uSun: V(0, 0.5, -0.8), uSunA: { value: 0.02 }, uSunI: { value: 1 }, uWhite: { value: 1 }, uProm: { value: 0 }, uGlowK: { value: 1 },
    uVen: V(0, 0.8, -0.5), uVenA: { value: 0.02 }, uVenVis: { value: 0 },
    uPx: { value: 0.0006 }, uT: { value: 0 }, uCloud: { value: 1 },
    uHeat: { value: 0 }, uSmoke: { value: 0 }, uEnd: { value: 0 },
  };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

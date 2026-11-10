// Sky for "Yellowstone erupts": a summer sky with the eruption column 97 km away behind the far ridge, its ash
// cloud (the umbrella, at 0.72-1.0 of the column height) spreading out until it covers the whole sky and day
// turns to night, lightning in the column and later in the ash ceiling, and the red glow of the hot ash cloud
// on the horizon at the end. Everything is worked out in kilometres from the camera; the same umbrella maths
// runs on the CPU (umbCover in timeline.js) for the sunlight.
import * as THREE from 'three';

export const SKY_COMMON = /* glsl */ `
uniform float uDay;
uniform vec3 uSunDir;
uniform float uCity;
vec3 atmosphere(vec3 v) {
  float e = v.y;
  float h = clamp(e, 0.0, 1.0);
  float cs = max(dot(v, uSunDir), 0.0);
  vec3 zen = vec3(0.05, 0.16, 0.45);
  vec3 hor = vec3(0.5, 0.62, 0.78);
  vec3 day = mix(hor, zen, pow(h, 0.45));
  day += vec3(1.0, 0.86, 0.62) * (pow(cs, 8.0) * 0.06 + pow(cs, 64.0) * 0.15);
  vec3 night = vec3(0.012, 0.010, 0.009) + vec3(0.07, 0.04, 0.02) * uCity * exp(-max(e, 0.0) * 9.0);
  vec3 c = mix(night, day, uDay);
  if (e < 0.0) c = mix(c, mix(night, vec3(0.42, 0.5, 0.62), uDay) * 0.6, smoothstep(0.0, -0.08, e));
  return c;
}
`;

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w;   // exactly on the far plane (see makeSky)
}
`;

const frag = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform float uTime;
uniform float uVentAz;
uniform float uVentD;
uniform float uColH;
uniform float uUmbR;
uniform float uBolt;
uniform vec4 uBoltP;      // azimuth offset, height (0..1 of the column), size, seed
uniform float uAsh;       // falling ash haze
uniform float uFlowGlow;  // the hot ash cloud's glow on the horizon
uniform float uPx;
${SKY_COMMON}

float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
// billows: sharp-edged bumps (absolute-value noise) read like cauliflower ash clouds
float billow(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * (1.0 - abs(noise3(p) * 2.0 - 1.0)); p = p * 2.1 + 3.7; a *= 0.5; } return s; }

void main() {
  vec3 v = normalize(vDir);
  vec3 c = atmosphere(v);
  // a few fair-weather clouds low on the horizon
  if (v.y > 0.0) {
    vec2 cp = v.xz / (v.y + 0.06) * 1.6 + vec2(uTime * 0.01, 0.0);
    float cl = smoothstep(0.55, 0.75, fbm3(vec3(cp * 1.4, 2.0))) * smoothstep(0.0, 0.08, v.y) * (1.0 - smoothstep(0.3, 0.7, v.y));
    c = mix(c, vec3(0.92, 0.93, 0.95) * uDay + 0.01, cl * 0.7);
  }

  float el = asin(clamp(v.y, -1.0, 1.0));
  float az = atan(v.x, -v.z);
  float daz = az - uVentAz;
  daz = mod(daz + 3.14159265, 6.2831853) - 3.14159265;
  float H = uColH;
  float light = mix(0.06, 1.0, uDay);
  vec2 vent = vec2(sin(uVentAz), -cos(uVentAz)) * uVentD;
  vec2 dirXZ = vec2(v.x, v.z) / max(length(v.xz), 1e-5);

  // ----- the eruption: a boiling column that widens up into the umbrella, which spreads out at Hb..H -----
  // The umbrella is physical: a ray hits its underside if it reaches the height Hb inside the radius, or its
  // sunlit side wall if it only gets inside the radius higher up. The column sits at the vent (97 km).
  float hc = uVentD * tan(max(el, 0.0));            // height on the column axis seen in this direction, km
  float xk = daz * uVentD;                          // sideways from the axis, km
  float rise = uTime * 0.55;                        // billows climb (time-lapse)
  float shadeR = mix(1.0, 0.45, smoothstep(45.0, 105.0, uUmbR));   // once the umbrella is overhead, it's dark under it
  vec2 vp = vec2(xk, hc - rise);
  float Hb = H * (0.6 + 0.07 * (noise3(vec3(xk * 0.08, 2.0, uTime * 0.02)) - 0.5));
  bool col = false; vec3 colC = vec3(0.0); float colA = 0.0;
  if (el > -0.01 && hc < Hb + 2.0 && abs(daz) < 0.6) {
    float r = 2.6 + 0.2 * hc + 5.0 * smoothstep(Hb * 0.55, Hb, hc);
    float n = fbm3(vec3(vp * 0.11, 1.7));
    float edge = abs(xk) / (r * (0.62 + 0.75 * n));
    if (edge < 1.0) {
      col = true;
      float b = billow(vec3(vp * 0.22, 4.3));
      float lobe = pow(clamp(b * 1.25 - 0.1, 0.0, 1.0), 1.6);
      float lift = smoothstep(0.0, Hb, hc);
      vec3 dark = vec3(0.1, 0.09, 0.08), mid = vec3(0.36, 0.33, 0.3), hi = vec3(0.7, 0.67, 0.62);
      colC = mix(dark, mid, lobe) + hi * pow(lobe, 3.0) * (0.35 + 0.65 * lift) * clamp(0.6 - xk / r * 0.4, 0.0, 1.0);
      colC *= light * shadeR;
      // the base: choked with ash, a dull red glow from the vents, a grey skirt rolling out along the ground
      colC += vec3(0.6, 0.18, 0.04) * exp(-hc * 1.1) * (0.3 + 0.7 * b) * 0.5;
      // lightning: a glow inside the column and a jagged bolt
      if (uBolt > 0.0) {
        float bx = uBoltP.x * uVentD, bh = uBoltP.y * Hb;
        float dg = length(vec2(xk - bx, hc - bh));
        colC += vec3(0.75, 0.8, 1.0) * uBolt * exp(-dg * dg / (6.0 * uBoltP.z)) * 1.2;
        float len = 3.0 + 5.0 * uBoltP.z;
        if (hc < bh && hc > bh - len) {
          float k = (bh - hc) / len;
          float wig = (noise3(vec3(hc * 1.6, uBoltP.w * 40.0, 0.0)) - 0.5) * 2.0 + (noise3(vec3(hc * 6.0, uBoltP.w * 40.0, 3.0)) - 0.5) * 0.6;
          float dl = abs(xk - bx - wig * (0.4 + k));
          colC += vec3(0.85, 0.9, 1.0) * uBolt * exp(-dl * dl / 0.01) * 3.0 * (1.0 - k * 0.5);
        }
      }
      colA = smoothstep(1.0, 0.8, edge) * (1.0 - 0.85 * uAsh) * mix(1.0, smoothstep(Hb, Hb * 0.55, hc), smoothstep(40.0, 90.0, uUmbR));
    }
  }
  vec3 umbC = vec3(0.0); float cov = 0.0;
  if (el > 0.0) {
    float tn = max(tan(el), 1e-4);
    vec2 pb = dirXZ * (Hb / tn), pt = dirXZ * (H / tn);
    float ang = atan(pb.y - vent.y, pb.x - vent.x);
    float R = uUmbR * (0.84 + 0.32 * fbm3(vec3(ang * 4.0, uTime * 0.03, 5.0)));
    float qb = length(pb - vent), qt = length(pt - vent);
    float under = smoothstep(R + 3.0, R - 5.0, qb);    // looking up at its underside
    float side = smoothstep(R + 3.0, R - 5.0, qt);     // looking at its sunlit side wall
    cov = max(under, side) * smoothstep(0.0, 0.02, el);
    if (cov > 0.0) {
      vec2 p = (under > 0.5 ? pb : pt);
      float m = billow(vec3(p * 0.07, uTime * 0.02));
      float lobe = pow(clamp(m * 1.25 - 0.1, 0.0, 1.0), 1.6);
      float mam = fbm3(vec3(p * 0.3, 2.0));
      vec3 undC = mix(vec3(0.07, 0.065, 0.06), vec3(0.3, 0.28, 0.26), lobe) * (0.7 + 0.5 * mam);
      vec3 sideC = mix(vec3(0.2, 0.19, 0.18), vec3(0.5, 0.47, 0.44), lobe) + vec3(0.72, 0.7, 0.66) * pow(lobe, 3.0);
      umbC = mix(sideC, undC, under) * light;
      // the town's lights glow on the underside; lightning lights it all up
      umbC += vec3(0.09, 0.055, 0.025) * uCity * (0.6 + 0.4 * m) * exp(-el * 2.5);
      umbC += vec3(0.42, 0.45, 0.55) * uBolt * (0.25 + 0.75 * m) * smoothstep(0.0, 0.6, under) * 0.7;
    }
  }
  // the column is in front of the umbrella's underside where it is lower than Hb
  if (col && hc < Hb) c = mix(mix(c, umbC, cov), colC, colA);
  else { c = mix(c, colC, colA * (1.0 - cov)); c = mix(c, umbC, cov); }

  // ----- falling ash: everything far away fades into a dark brown haze -----
  vec3 haze = vec3(0.035, 0.031, 0.028) * (0.4 + 0.6 * light) + vec3(0.035, 0.022, 0.011) * uCity + vec3(0.3, 0.32, 0.38) * uBolt * 0.12;
  c = mix(c, haze, uAsh * (0.55 + 0.4 * smoothstep(0.35, 0.0, el)));

  // ----- the hot ash cloud: a red glow on the horizon to the north -----
  if (uFlowGlow > 0.0) {
    float g = exp(-max(el, 0.0) * 9.0) * exp(-daz * daz * 0.8);
    c += vec3(1.0, 0.32, 0.06) * uFlowGlow * g * 0.9;
  }
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  gl_FragColor = vec4(clamp(c, 0.0, 60.0), 1.0);
}
`;

export function makeSky() {
  const uniforms = {
    uTime: { value: 0 },
    uDay: { value: 1 },
    uCity: { value: 0 },
    uSunDir: { value: new THREE.Vector3() },
    uVentAz: { value: 0 },
    uVentD: { value: 97 },
    uColH: { value: 24 },
    uUmbR: { value: 8 },
    uBolt: { value: 0 },
    uBoltP: { value: new THREE.Vector4() },
    uAsh: { value: 0 },
    uFlowGlow: { value: 0 },
    uPx: { value: 0.0006 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: vert, fragmentShader: frag,
    side: THREE.BackSide, depthWrite: false, depthTest: true,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), mat);
  mesh.frustumCulled = false;
  // Drawn after every other opaque object, depth-tested at the far plane: the sky shader then only runs where sky
  // is actually visible, instead of on the whole frame before the world is drawn over it. Transparent objects
  // still come after it, so the picture is the same. (Needs every other opaque object to write and test depth.)
  mesh.renderOrder = 1000;
  return { mesh, uniforms };
}

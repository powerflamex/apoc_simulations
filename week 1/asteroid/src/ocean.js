// The sea: a wind-wave spectrum (instead of a few crossed sines), turquoise shallows over the sand,
// lapping surf, plus the drawback, the shockwave ripple and the tsunami from the story.
//
// Small waves are summed per pixel from ~24 components with scattered directions, deep-water speeds and
// random phases, warped by low-frequency noise and modulated by wind patches and glassy slicks, so the
// surface never forms a lattice. Each component fades out once it is smaller than a few pixels; the
// slope it would have added becomes roughness in the sun glint, so the far glitter turns into a soft
// path of light instead of aliasing.
import * as THREE from 'three';
import { G } from './bend.js';
import { SKY_COMMON } from './sky.js';
import { lerp, DEG } from './util.js';

const WAVES_GLSL = /* glsl */ `
float h1(float n) { return fract(sin(n * 12.9898 + 4.1) * 43758.5453); }
float hh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hh(i), hh(i+vec2(1,0)), f.x), mix(hh(i+vec2(0,1)), hh(i+vec2(1,1)), f.x), f.y); }
float fbm2(vec2 p) { return vn(p) * 0.55 + vn(p * 2.13 + 7.1) * 0.3 + vn(p * 4.37 + 3.3) * 0.15; }
float shoreZf(float x) { return -250.0 - 680.0 * smoothstep(260.0, 950.0, abs(x)) + 25.0 * sin(x * 0.011) + 15.0 * sin(x * 0.031); }
float bedY(vec2 p) { float dz = p.y - shoreZf(p.x); return dz < 0.0 ? max(-1.0 + dz * 0.035, -45.0) : 1.2 + dz * 0.14; }
const float WIND = 1.38;   // mean travel direction (radians in x/z): toward the beach, a little oblique
`;

export function makeOcean({ CAM_BASE, DIR_I }) {
  const rings = 340, segs = 380;
  const r0 = 12, r1 = 26000, a0 = -78 * DEG, a1 = 78 * DEG;
  const pos = new Float32Array((rings + 1) * (segs + 1) * 3);
  let k = 0;
  for (let i = 0; i <= rings; i++) {
    const r = r0 * Math.pow(r1 / r0, i / rings);
    for (let j = 0; j <= segs; j++) {
      const a = lerp(a0, a1, j / segs);
      pos[k++] = CAM_BASE.x + Math.sin(a) * r;
      pos[k++] = 0;
      pos[k++] = CAM_BASE.z - Math.cos(a) * r;
    }
  }
  const idx = [];
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = i * (segs + 1) + j, b = a + segs + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);

  const uniforms = {
    uTime: G.uTime,
    uSunDir: { value: new THREE.Vector3() }, uHaze: { value: 0 }, uImpactLight: { value: 0 }, uImpactDir: { value: new THREE.Vector3() },
    uSunVis: { value: 1 },
    uDir: { value: new THREE.Vector2(DIR_I.x, DIR_I.y) }, uCam: { value: new THREE.Vector2(CAM_BASE.x, CAM_BASE.z) },
    uDraw: { value: 0 }, uWaveOn: { value: 0 }, uWaveF: { value: 1e5 }, uWaveH: { value: 0 }, uLip: { value: 0 },
    uShockF: { value: 1e5 }, uShockOn: { value: 0 }, uRough: { value: 1 },
    uFogDensity: { value: 0.0001 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      uniform float uTime; uniform vec2 uDir; uniform vec2 uCam;
      uniform float uDraw; uniform float uWaveOn; uniform float uWaveF; uniform float uWaveH; uniform float uLip;
      uniform float uShockF; uniform float uShockOn; uniform float uRough;
      varying vec3 vW; varying float vDist; varying vec2 vPre; varying float vCrest; varying float vXw; varying float vShock;
      ${WAVES_GLSL}
      void main() {
        vec3 p = position;
        vPre = p.xz;
        vec2 o = p.xz - uCam;
        float dist = length(o);
        float u = dot(o, uDir);
        // swell: long components only, each dropped before the mesh is too coarse to carry it
        float spacing = dist * 0.024 + 0.4;
        float h = 0.0;
        for (int i = 0; i < 9; i++) {
          float fi = float(i);
          float L = 110.0 * pow(0.74, fi);
          float ang = WIND + (h1(fi * 3.1) - 0.5) * 1.3;
          float kk = 6.2832 / L;
          float A = (0.018 + 0.012 * h1(fi * 5.7)) / kk * smoothstep(3.0 * spacing, 6.0 * spacing, L);
          h += A * sin(dot(vec2(cos(ang), sin(ang)), p.xz) * kk - sqrt(9.81 * kk) * uTime + h1(fi * 7.7) * 6.2832);
        }
        h *= uRough * (1.0 - 0.6 * smoothstep(120.0, 0.0, shoreZf(p.x) - p.z));
        h -= 14.0 * uDraw * (1.0 - smoothstep(1500.0, 9000.0, u));
        float crest = 0.0, xw = 1e5;
        if (uWaveOn > 0.5) {
          float H = uWaveH;
          xw = u - uWaveF;
          float Wf = H * mix(0.9, 0.32, uLip), Wb = 3.0 * H + 500.0;
          crest = xw >= 0.0 ? exp(-pow(xw / Wb, 2.0)) : exp(-pow(xw / Wf, 2.0));
          float trough = -0.22 * H * exp(-pow((xw + 2.5 * Wf + 150.0) / (2.0 * H + 400.0), 2.0));
          // churning, lumpy face
          float churn = ((fbm2(p.xz * vec2(0.03, 0.012) + vec2(0.0, uTime * 0.25)) - 0.5) * 6.0 + sin(p.x * 0.21 + uTime * 2.3) * sin(p.z * 0.17 - uTime * 1.9) * 0.8) * crest;
          h += H * crest + trough + churn;
          // the lip throws forward over the face
          float lip = uLip * H * 0.42 * smoothstep(0.72, 1.0, crest) * step(xw, H * 0.5);
          p.xz -= uDir * lip;
          h -= lip * 0.25 * smoothstep(0.9, 1.0, crest);
        }
        // shockwave ripple racing across the water
        vShock = uShockOn * exp(-pow((u - uShockF) / (40.0 + uShockF * 0.01), 2.0));
        h += vShock * (1.2 + 1.8 * vn(p.xz * 0.05 + uTime)) * (0.6 + 0.4 * sin(p.x * 0.3 + uTime * 20.0));   // the sea surface is torn into spray along the front
        p.y = h;
        vCrest = crest; vXw = xw / max(uWaveH, 1.0);
        vDist = dist;
        vW = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float uTime; uniform float uFogDensity; uniform float uSunVis; uniform float uWaveH; uniform vec2 uDir;
      uniform float uDraw; uniform float uRough;
      ${SKY_COMMON}
      varying vec3 vW; varying float vDist; varying vec2 vPre; varying float vCrest; varying float vXw; varying float vShock;
      ${WAVES_GLSL}
      // slope of the wind-wave field at p; 'lost' = slope variance of components too small to resolve
      vec2 waveSlope(vec2 p, float fp, out float lost) {
        vec2 grad = vec2(0.0);
        lost = 0.0;
        // wind patches and glassy slicks modulate the short waves
        float patchy = fbm2(p * 0.0035 + vec2(uTime * 0.004, 0.0));
        float slick = smoothstep(0.08, 0.0, abs(fbm2(p * vec2(0.0016, 0.006) + 3.0) - 0.5));
        float shortAmp = mix(0.45, 1.45, smoothstep(0.3, 0.7, patchy)) * (1.0 - 0.75 * slick);
        vec2 warp = (vec2(vn(p * 0.011), vn(p * 0.011 + 17.0)) - 0.5) * 22.0;
        for (int i = 0; i < 24; i++) {
          float fi = float(i);
          float L = 85.0 * pow(0.745, fi);                    // 85 m .. 0.1 m
          float ang = WIND + (h1(fi * 1.7) - 0.5) * (1.2 + fi * 0.06);
          vec2 d = vec2(cos(ang), sin(ang));
          float kk = 6.2832 / L;
          float S = (0.02 + 0.028 * h1(fi * 5.3)) * (L < 6.0 ? shortAmp : 1.0);
          float fade = smoothstep(1.5 * fp, 4.0 * fp, L);
          vec2 q = p + warp * min(1.0, 8.0 / L);
          float ph = dot(d, q) * kk - sqrt(9.81 * kk) * uTime + h1(fi * 9.1) * 6.2832;
          grad += d * (S * fade * cos(ph));
          lost += 0.5 * S * S * (1.0 - fade);
        }
        return grad * uRough;
      }
      void main() {
        #include <logdepthbuf_fragment>
        vec3 Nc = cross(dFdx(vW), dFdy(vW));
        vec3 Ng = dot(Nc, Nc) > 1e-12 ? normalize(Nc) : vec3(0.0, 1.0, 0.0);
        if (dot(Ng, cameraPosition - vW) < 0.0) Ng = -Ng;
        float big = smoothstep(0.01, 0.12, vCrest);
        float fp = max(length(fwidth(vPre)), 0.002);
        float lost;
        vec2 sl = waveSlope(vPre, fp, lost) * (1.0 - 0.85 * big);
        vec3 N = normalize(mix(vec3(0.0, 1.0, 0.0), Ng, big) + vec3(-sl.x, 0.0, -sl.y));
        vec3 V = normalize(cameraPosition - vW);
        float NdV = max(dot(N, V), 0.02);
        float fres = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
        vec3 Rf = reflect(-V, N); Rf.y = abs(Rf.y);
        vec3 sky = atmosphere(normalize(Rf + vec3(0.0, 0.02, 0.0)));
        // water body: deep blue-green offshore, turquoise over sand in the bay
        float light = (0.45 + 0.55 * uSunVis) * (1.0 - 0.35 * uHaze);
        float depth = max(vW.y - bedY(vW.xz), 0.0);
        vec3 deep = vec3(0.01, 0.05, 0.068);
        vec3 turq = vec3(0.045, 0.24, 0.25);
        vec3 sand = vec3(0.42, 0.37, 0.27) * (0.85 + 0.3 * vn(vPre * 0.15));
        vec3 body = mix(turq, sand, exp(-depth / 1.2) * 0.8);
        body = mix(deep, body, exp(-depth / 9.0)) * light;
        vec3 c = mix(body, sky, fres);
        // sun glint: Beckmann lobe whose width grows with the unresolved wave slope
        vec3 Hh = normalize(V + uSunDir);
        float NdH = max(dot(N, Hh), 1e-3);
        float m2 = 0.0012 + lost * 1.6;
        float t2 = (1.0 - NdH * NdH) / (NdH * NdH);
        float D = exp(-t2 / m2) / (3.14159 * m2 * NdH * NdH * NdH * NdH);
        float Fs = 0.02 + 0.98 * pow(1.0 - max(dot(V, Hh), 0.0), 5.0);
        c += vec3(1.0, 0.78, 0.5) * D * Fs * 0.03 / NdV * smoothstep(-0.02, 0.05, uSunDir.y) * uSunVis * (1.0 - 0.5 * uHaze);
        // surf: a lacy line at the water's edge and soft bands running up the beach
        float shoreD = max(shoreZf(vW.x) - vW.z, 0.0) * 0.035;            // 'depth' measured from the waterline
        float edgeD = shoreD + 0.06 * sin(uTime * 0.9 + vPre.x * 0.05) - 0.06;
        float lace = smoothstep(0.35, 0.75, fbm2(vPre * vec2(0.45, 0.9) + vec2(uTime * 0.15, 0.0)));
        float bands = smoothstep(0.8, 1.0, sin(shoreD * 9.0 - uTime * 1.1 + vn(vPre * 0.03) * 4.0)) * smoothstep(1.3, 0.15, shoreD);
        float foam = max(smoothstep(0.16, 0.0, edgeD), bands * 0.6) * (0.35 + 0.65 * lace) * (1.0 - uDraw);
        c = mix(c, vec3(0.86, 0.83, 0.78) * light, clamp(foam, 0.0, 1.0) * 0.85);
        // the wave: backlit translucent crest, white water down the face
        if (vCrest > 0.01) {
          vec3 dirToFrag = -V;
          float back = pow(max(dot(dirToFrag, uSunDir), 0.0), 4.0);
          float lat = dot(vPre, vec2(-uDir.y, uDir.x));
          c = mix(c, vec3(0.006, 0.035, 0.045) + sky * 0.08, smoothstep(0.05, 0.35, vCrest) * 0.85);
          float thin = smoothstep(0.86, 0.995, vCrest) * smoothstep(0.35, -0.1, vXw);
          c += vec3(0.05, 0.5, 0.42) * thin * (0.35 + 1.4 * back) * uSunVis + vec3(0.01, 0.06, 0.05) * thin;
          float face = smoothstep(0.2, 0.9, vCrest) * step(vXw, 0.3);
          float s1 = fbm2(vec2(lat * 0.09, vW.y * 0.022 + uTime * 1.1));
          float s2 = fbm2(vec2(lat * 0.33 + 7.0, vW.y * 0.07 + uTime * 1.9));
          float s3 = vn(vec2(lat * 1.3 + 3.0, vW.y * 0.25 + uTime * 3.0));
          float patches = smoothstep(0.3, 0.62, fbm2(vec2(lat * 0.018, vW.y * 0.014 + uTime * 0.6)));
          float streak = s1 * 0.5 + s2 * 0.32 + s3 * 0.18;
          float white = face * patches * smoothstep(0.5, 0.72, streak + (1.0 - vCrest) * 0.2);
          c += sky * 0.06 * face * (1.0 - patches);
          white = max(white, smoothstep(0.93, 1.0, vCrest) * smoothstep(0.35, 0.6, s2) * 0.9);
          float base = smoothstep(0.7, 0.0, abs(vXw + 1.0)) * smoothstep(0.03, 0.25, vCrest);
          white = max(white, base * smoothstep(0.3, 0.7, fbm2(vec2(lat * 0.15, uTime * 1.5))) * 1.1);
          vec3 whiteC = mix(vec3(0.16, 0.18, 0.19), vec3(0.92, 0.86, 0.78), 0.25 + 0.75 * uSunVis * clamp(dot(Ng, uSunDir) + 0.3, 0.0, 1.0));
          c = mix(c, whiteC, clamp(white, 0.0, 1.0) * 0.9);
        }
        c = mix(c, vec3(0.9, 0.87, 0.82) * light, vShock * 0.85);   // a white wall of spray racing toward the beach
        float d = length(vW - cameraPosition);
        float fog = (1.0 - exp(-d * uFogDensity)) * (1.0 - 0.75 * smoothstep(0.1, 0.5, vCrest));   // the wall stands out of the haze
        vec3 fogC = atmosphere(normalize(vec3(vW.x - cameraPosition.x, max(vW.y - cameraPosition.y, 0.0) + 0.002 * d, vW.z - cameraPosition.z)));
        c = mix(c, fogC, fog);
        if (any(isnan(c)) || any(isinf(c))) c = fogC;
        gl_FragColor = vec4(clamp(c, 0.0, 40.0), 1.0);
      }`,
  });
  mat.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return {
    mesh,
    frame(t, s, ctx) {
      uniforms.uSunDir.value.copy(ctx.sunDir);
      uniforms.uSunVis.value = ctx.sunVis;
      uniforms.uHaze.value = s.haze;
      uniforms.uImpactLight.value = s.impactLight;
      uniforms.uImpactDir.value.copy(ctx.impactDir);
      uniforms.uDraw.value = s.drawback;
      uniforms.uWaveOn.value = s.waveOn;
      uniforms.uWaveF.value = s.waveF;
      uniforms.uWaveH.value = s.waveH;
      uniforms.uLip.value = s.lip;
      uniforms.uShockF.value = s.shockFront;
      uniforms.uShockOn.value = s.shockOn;
      uniforms.uRough.value = 1 + 0.6 * s.haze;
      uniforms.uFogDensity.value = 0.0001 + s.haze * 0.00006;
    },
  };
}

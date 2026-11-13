// The harbour: a flat sheet 1.6 m below the quay with small travelling waves (each faded once it's finer than a pixel,
// so nothing shimmers). It mirrors the sky, the skyline's lit windows (a reflection of the skyline's outline looked up
// in a 1D texture: elevation of the rooftops per direction, stretched and broken up by the waves), the lamps along the
// quay, and the fireballs (glitter paths). Rings spread from where rocks hit it.
import * as THREE from 'three';
import { BLD, WATER_Y, LAMPS } from './layout.js';
import { NL } from './sky.js';

export const NSPL = 8;
export const WU = {
  uTime: { value: 0 }, uPx: { value: 0.001 },
  uL: { value: Array.from({ length: NL }, () => new THREE.Vector4(0, 1, 0, 0)) },
  uLift: { value: new THREE.Color(0, 0, 0) },
  uSpl: { value: Array.from({ length: NSPL }, () => new THREE.Vector4(0, 0, -100, 0)) },    // x, z, time since, size
  uSkyline: { value: null }, uImp: { value: 0 }, uImpDir: { value: new THREE.Vector3(0, 0, -1) },
};

// the skyline seen from the quay: per degree of direction (az -90..90, to the left = +), the rooftops' elevation (deg)
// and how lit the windows are
function skylineTex() {
  const N = 720, el = new Float32Array(N), lit = new Float32Array(N);
  const C = { x: 0, y: -1.6, z: -12 };
  for (const b of BLD) {
    if (b.z > -300) continue;
    const dx = b.x - C.x, dz = b.z - C.z, dist = Math.hypot(dx, dz);
    const az = Math.atan2(-dx, -dz) * 180 / Math.PI;
    const half = Math.atan2(b.w / 2, dist) * 180 / Math.PI;
    const e = Math.atan2(b.h - C.y, dist) * 180 / Math.PI;
    for (let a = az - half; a <= az + half; a += 0.25) {
      const i = Math.round((a + 90) * 4);
      if (i < 0 || i >= N) continue;
      if (e > el[i]) { el[i] = e; lit[i] = b.kind === 4 ? 1 : b.kind === 3 ? 0.6 : 0.8; }
    }
  }
  const data = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) { data[i * 4] = el[i]; data[i * 4 + 1] = lit[i]; }
  const t = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

export function makeWater(scene) {
  WU.uSkyline.value = skylineTex();
  const lamps = LAMPS.filter((l) => !l.street).slice(0, 24);
  const mat = new THREE.ShaderMaterial({
    uniforms: WU, transparent: false,
    vertexShader: /* glsl */ `varying vec3 vWP; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime; uniform float uPx; uniform vec4 uL[${NL}]; uniform vec3 uLift; uniform vec4 uSpl[${NSPL}];
      uniform sampler2D uSkyline; uniform float uImp; uniform vec3 uImpDir;
      varying vec3 vWP;
      float h2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
      const vec3 LAMP[${lamps.length}] = vec3[](${lamps.map((l) => `vec3(${l.x.toFixed(1)}, ${l.h.toFixed(1)}, ${l.z.toFixed(1)})`).join(', ')});
      vec2 waveG(vec2 p, float px) {
        vec2 g = vec2(0.0);
        for (int i = 0; i < 14; i++) {
          float fi = float(i);
          float L = 14.0 * pow(0.76, fi);
          float a = 0.035 * L * (1.0 + 0.3 * sin(fi * 7.1));
          vec2 dir = normalize(vec2(cos(fi * 2.4 + 0.3), sin(fi * 2.4 + 0.3) * 0.8 + 0.6));
          float k = 6.2832 / L, w = sqrt(9.81 * k);
          float fade = 1.0 - smoothstep(L * 0.25, L * 0.6, px * 2.0);
          g += dir * cos(dot(p, dir) * k - w * uTime + fi * 1.7) * a * k * fade;
        }
        return g;
      }
      void main() {
        vec2 p = vWP.xz;
        vec3 V = normalize(vWP - cameraPosition);
        float dist = length(vWP - cameraPosition);
        float px = uPx * dist;
        vec2 g = waveG(p, px);
        // rings from the rocks that hit it
        float foam = 0.0;
        for (int i = 0; i < ${NSPL}; i++) {
          vec4 s = uSpl[i];
          if (s.z < 0.0 || s.z > 14.0) continue;
          vec2 d = p - s.xy; float r = length(d);
          float R = 4.0 + 9.0 * s.z * s.w;
          float ring = exp(-pow((r - R) / (1.5 + 0.6 * s.w + 0.3 * s.z), 2.0)) * exp(-s.z / 4.0) * s.w;
          g += (d / max(r, 0.01)) * ring * 0.7 * cos((r - R) * 1.4);
          foam += exp(-pow(r / (3.0 + 3.0 * s.w), 2.0)) * exp(-s.z / 2.5) * s.w + ring * 0.25 * exp(-s.z / 2.0);
        }
        vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 R = reflect(V, N); R.y = abs(R.y);
        float F = 0.02 + 0.98 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
        float el = R.y;
        // the sky in it
        vec3 sky = mix(vec3(0.05, 0.045, 0.06) + vec3(0.11, 0.065, 0.035) * 0.8, vec3(0.01, 0.015, 0.04), smoothstep(0.0, 0.4, el)) + uLift;
        // the skyline in it: under its rooftops, lit windows stretched by the waves
        float az = atan(-R.x, -R.z) * 57.2958;
        vec4 sk = texture2D(uSkyline, vec2((az + 90.0) / 180.0, 0.5));
        float eld = asin(clamp(el, 0.0, 1.0)) * 57.2958;
        float under = 1.0 - smoothstep(sk.x - 0.12, sk.x + 0.05, eld);
        float win = n2(vec2(az * 6.0, eld * 1.4)) * n2(vec2(az * 17.0 + 3.0, eld * 3.0 + 7.0));
        vec3 city = vec3(0.012, 0.012, 0.016) + vec3(1.0, 0.68, 0.36) * smoothstep(0.25, 0.75, win) * 0.9 * sk.y + uLift * 0.2;
        sky = mix(sky, city, under);
        vec3 col = mix(vec3(0.004, 0.012, 0.02) + uLift * 0.06, sky, F);
        // the lamps along the quay: long wavering streaks of warm light
        for (int i = 0; i < ${lamps.length}; i++) {
          vec3 Lp = LAMP[i];
          vec3 toL = normalize(Lp - vWP);
          float c = max(dot(R, toL), 0.0);
          col += vec3(1.0, 0.7, 0.4) * pow(c, 900.0) * 6.0 * smoothstep(400.0, 30.0, distance(Lp.xz, p));
        }
        // the fireballs: glitter paths
        for (int i = 0; i < ${NL}; i++) {
          vec4 L = uL[i];
          if (L.w <= 0.0) continue;
          float ca = acos(clamp(dot(R, L.xyz), -1.0, 1.0));
          col += vec3(0.9, 0.95, 1.0) * min(L.w, 4.0) * (exp(-pow(ca / 0.05, 2.0)) * 1.4 + 0.04 * exp(-ca / 0.25));
        }
        if (uImp > 0.0) { float ca = acos(clamp(dot(R, uImpDir), -1.0, 1.0)); col += vec3(1.0, 0.92, 0.75) * uImp * (6.0 * exp(-ca / (0.08 + 0.5 * uImp)) + 0.6); }
        col = mix(col, vec3(0.75, 0.78, 0.8) * (0.25 + uLift * 2.0 + 0.4 * length(uLift)), clamp(foam, 0.0, 1.0));
        // haze far out
        col = mix(col, vec3(0.05, 0.04, 0.05), smoothstep(800.0, 3000.0, dist) * 0.6);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const geo = new THREE.PlaneGeometry(12000, 6000, 1, 1).rotateX(-Math.PI / 2).translate(0, WATER_Y, -3000 - 12);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

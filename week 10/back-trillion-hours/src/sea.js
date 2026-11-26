// Water: the lake at the forest stop (k 2) and the sea at the shore stop (k 6). Small moving waves (normals only, faded
// out where they'd be smaller than a few pixels so nothing shimmers), the sky reflected at grazing angles, the Sun's
// glitter, foam along the waterline (from the same ground height the land uses) and round the shark (uSplash).
import * as THREE from 'three';
import { RAW_GLSL } from './ground.js';

export const WU = {
  uTime: { value: 0 }, uStop: { value: 6 }, uLevel: { value: -1 }, uDeep: { value: new THREE.Color(0.01, 0.06, 0.1) }, uShallow: { value: new THREE.Color(0.05, 0.3, 0.32) },
  uSky: { value: new THREE.Color(0.5, 0.7, 0.9) }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunC: { value: new THREE.Color(1, 1, 1) },
  uFogC: { value: new THREE.Color(0.6, 0.7, 0.8) }, uFogD: { value: 0.001 }, uSplash: { value: new THREE.Vector4(0, 0, -100, 0) }, uWave: { value: 1 },
};

export function makeWater(scene) {
  const geo = new THREE.PlaneGeometry(4000, 4000, 1, 1).rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: WU, transparent: false,
    vertexShader: /* glsl */ `uniform float uLevel; varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position.x, uLevel, position.z, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uLevel, uFogD, uWave; uniform int uStop; uniform vec3 uDeep, uShallow, uSky, uSun, uSunC, uFogC; uniform vec4 uSplash;
      varying vec3 vW;
      ${RAW_GLSL}
      float wh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float wn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(wh(i), wh(i + vec2(1,0)), f.x), mix(wh(i + vec2(0,1)), wh(i + vec2(1,1)), f.x), f.y); }
      vec2 waveGrad(vec2 p, float fade) {
        vec2 g = vec2(0.0);
        float a = 0.18, f = 0.35;
        for (int i = 0; i < 5; i++) {
          float ang = float(i) * 1.7 + 0.4;
          vec2 d = vec2(cos(ang), sin(ang));
          float ph = dot(p, d) * f + uTime * (1.2 + 0.25 * float(i)) * sqrt(f * 9.8) * 0.35;
          float k = a * f * smoothstep(1.0, 0.25, fade * f);     // small waves far away fade out
          g += d * cos(ph) * k;
          a *= 0.62; f *= 1.9;
        }
        return g * uWave;
      }
      void main() {
        vec3 V = cameraPosition - vW; float dist = length(V); V /= dist;
        float fade = dist / 60.0;
        vec2 g = waveGrad(vW.xz, fade);
        vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
        float gH = groundH(uStop, vW.x, vW.z);
        float depth = uLevel - gH;
        float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 body = mix(uShallow, uDeep, smoothstep(0.2, 3.5, depth));
        vec3 col = mix(body, uSky, fres * 0.85);
        vec3 Rf = reflect(-V, N);
        col += uSunC * pow(max(dot(Rf, normalize(uSun)), 0.0), 220.0) * 6.0;
        col += uSunC * pow(max(dot(Rf, normalize(uSun)), 0.0), 18.0) * 0.12;
        // foam at the waterline, broken up and pulsing with the swell
        float swell = 0.5 + 0.5 * sin(uTime * 1.3 + vW.x * 0.15 + vW.z * 0.1);
        float foam = smoothstep(0.35 + 0.25 * swell, 0.0, depth) * smoothstep(0.35, 0.65, wn(vW.xz * 1.8 + uTime * 0.3));
        // white water where the shark breaks the surface (uSplash: x, z, radius, strength)
        float sd = length(vW.xz - uSplash.xy);
        foam = max(foam, uSplash.w * smoothstep(uSplash.z, uSplash.z * 0.3, sd) * (0.6 + 0.4 * wn(vW.xz * 2.5 + uTime)));
        col = mix(col, vec3(0.9, 0.93, 0.95), clamp(foam, 0.0, 1.0));
        if (depth < 0.0) discard;
        float fog = 1.0 - exp(-uFogD * uFogD * dist * dist);
        col = mix(col, uFogC, fog);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

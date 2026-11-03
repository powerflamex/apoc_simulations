// The sea coming up the avenue: a sheet of dark water whose front (white, churning) runs down the street from the bay
// toward you, then keeps rising. It reflects the planet and the sky (traced like the sky does), the screens' and
// signs' light in long rippling streaks, and glows orange and steams where the fissure opens under it.
import * as THREE from 'three';
import { PLANET_GLSL } from './sky.js';
import { RIFT_GLSL, CRACK_GLSL, GU, NPOOL } from './ground.js';

export function makeWater(scene, skyU) {
  const U = {
    uTime: { value: 0 }, uLevel: { value: -1 }, uFront: { value: -700 }, uPx: skyU.uPx,
    uPDir: skyU.uPDir, uPD: skyU.uPD, uSun: skyU.uSun, uAxis: skyU.uAxis, uAxX: skyU.uAxX, uRot: skyU.uRot, uSkyLit: skyU.uSkyLit, uCity: skyU.uCity,
    uFissure: GU.uFissure, uSplit: GU.uSplit, uCracks: GU.uCracks, uLava: GU.uLava, uStorm: skyU.uStorm, uPoolP: GU.uPoolP, uPoolC: GU.uPoolC, uPoolK: GU.uPoolK, uPlanetK: skyU.uPlanetK,
    uLight: { value: new THREE.Color(0, 0, 0) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `uniform float uLevel; varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); w.y = uLevel; vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uLevel; uniform float uFront; uniform float uPx;
      uniform vec3 uPDir; uniform float uPD; uniform vec3 uSun; uniform vec3 uAxis; uniform vec3 uAxX; uniform float uRot; uniform float uSkyLit; uniform float uCity; uniform float uPlanetK;
      uniform vec4 uPoolP[${NPOOL}]; uniform vec3 uPoolC[${NPOOL}]; uniform float uPoolK; uniform vec3 uLight; uniform float uCracks; uniform float uLava;
      varying vec3 vW;
      ${PLANET_GLSL}
      ${RIFT_GLSL}
      ${CRACK_GLSL}
      vec3 skyC(vec3 r) {
        float h = max(r.y, 0.0);
        vec3 c = mix(vec3(0.3, 0.15, 0.11) * uCity + 0.04, vec3(0.02, 0.025, 0.06), smoothstep(0.0, 0.4, h));
        float cosP = dot(r, uPDir);
        float b = uPD * cosP, disc = b * b - (uPD * uPD - 1.0);
        float pa = asin(clamp(1.0 / uPD, 0.0, 1.0));
        float edgeD = max(acos(clamp(cosP, -1.0, 1.0)) - pa, 0.0);
        c += vec3(0.16, 0.28, 0.6) * uSkyLit * (0.55 + 0.45 * exp(-edgeD / 0.6)) + vec3(0.9, 0.8, 0.6) * uSkyLit * 0.4 * exp(-edgeD / 0.06);
        if (disc > 0.0) {
          float t = b - sqrt(disc);
          vec3 N = normalize(r * t - uPDir * uPD);
          vec3 axY = cross(uAxis, uAxX);
          vec3 alb = planetClouds(vec3(dot(N, uAxX), dot(N, axY), dot(N, uAxis)), uRot, 0.0, uTime);
          float mu = dot(N, uSun);
          c = alb * smoothstep(-0.06, 0.22, mu) * (0.2 + 0.9 * max(mu, 0.0)) * 1.15 * uPlanetK;
        }
        return c;
      }
      void main() {
        // the front: churning white where it runs; nothing beyond it
        float n1 = n3(vec3(vW.xz * 0.35, uTime * 0.6)), n2 = n3(vec3(vW.xz * 1.3, uTime * 1.4));
        float fz = uFront + (n1 - 0.5) * 5.0;
        if (vW.z > fz + 1.5) discard;
        vec3 V = normalize(vW - cameraPosition);
        // small ripples flowing toward you (finer far off, so they don't shimmer)
        float far = smoothstep(15.0, 80.0, length(vW - cameraPosition));
        vec2 fl = vec2(0.0, uTime * 3.0);
        vec2 g = vec2(n3(vec3(vW.xz * 3.0 - fl, uTime * 0.7)) - 0.5, n3(vec3(vW.xz * 3.0 + 7.0 - fl, uTime * 0.7)) - 0.5) * 0.12;
        g += vec2(n3(vec3(vW.xz * 9.0 - fl * 2.0, uTime)) - 0.5, n3(vec3(vW.xz * 9.0 + 3.0 - fl * 2.0, uTime)) - 0.5) * 0.07 * (1.0 - far);
        vec3 N = normalize(vec3(g.x, 1.0, g.y));
        vec3 R = reflect(V, N);
        R.y = abs(R.y);
        float fres = 0.03 + 0.97 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
        vec3 col = vec3(0.02, 0.03, 0.032) + uLight * vec3(0.05, 0.05, 0.04);
        col = mix(col, skyC(R), fres);
        // the screens' and signs' light in long streaks
        for (int i = 0; i < ${NPOOL}; i++) {
          vec3 L = normalize(uPoolP[i].xyz + vec3(0.0, uPoolP[i].y * 1.2, 0.0) - vW);
          float sp = pow(max(dot(R, L), 0.0), 220.0);
          col += uPoolC[i] * sp * 2.5 * uPoolK * smoothstep(9000.0, 400.0, dot(uPoolP[i].xyz - vW, uPoolP[i].xyz - vW));
        }
        // flow lines: thin streaks of foam running with the water
        float st = n3(vec3(vW.x * 1.8, vW.z * 0.25 - uTime * 2.2, uTime * 0.3));
        col += vec3(0.5, 0.55, 0.55) * smoothstep(0.72, 0.8, st) * 0.25 * (1.0 - far) * (0.3 + uLight);
        // foam at the front and in streaks behind it
        float front = smoothstep(fz - 9.0, fz, vW.z) * (1.0 - smoothstep(fz, fz + 1.5, vW.z));
        float foam = smoothstep(0.45, 0.75, n2 + front * 0.6) * (front + 0.15 * smoothstep(fz - 40.0, fz, vW.z));
        col = mix(col, vec3(0.75, 0.78, 0.78) * (0.3 + uLight * 0.4 + uSkyLit * 0.6), clamp(foam, 0.0, 1.0));
        // the cracks under it: the water swirls down into them (white lines), then they glow
        if (uCracks > 0.0) {
          float grow = crackGrow(vW.xz, uCracks);
          float cd = crackD(vW.xz);
          float wd = 0.05 + 0.12 * smoothstep(0.0, 25.0, grow);
          float cl = (1.0 - smoothstep(wd, wd * 2.5, cd)) * smoothstep(0.0, 4.0, grow);
          col = mix(col, vec3(0.8, 0.84, 0.85) * (0.45 + uLight * 0.5), cl * 0.75 * (1.0 - uLava) * (0.6 + 0.4 * n2));
          col += vec3(2.0, 0.55, 0.1) * cl * uLava;
        }
        // the fissure under it: glowing through, boiling
        vec2 rf = rift(vW.xz);
        if (rf.y > 0.0) col += lavaGlow(rf.x, rf.y, uTime) * 0.55 * (0.7 + 0.3 * n2);
        // shallow water is clear: you see the street (the stripes, the cracks) through it
        float a = mix(0.45, 0.85, smoothstep(0.15, 1.0, uLevel)) * (1.0 - smoothstep(fz, fz + 1.5, vW.z));
        a = max(a, clamp(foam, 0.0, 1.0)) ;
        a = mix(a, 1.0, fres * 0.6);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(900, 1100).rotateX(-Math.PI / 2), mat);
  mesh.position.set(0, 0, -250);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  scene.add(mesh);
  // the surge's front: a low wall of churning white water, leaning forward as it runs
  const boreMat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uLight: U.uLight, uH: { value: 1 }, uPoolK: U.uPoolK },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `uniform float uH; uniform float uTime; varying vec2 vUv; varying vec3 vW;
      float hh(float x){ return fract(sin(x * 12.9898) * 43758.5453); }
      void main(){
        vUv = uv; vec3 p = position;
        float x = p.x;
        p.y = uv.y * uH * (0.75 + 0.25 * sin(x * 0.35 + uTime * 3.0) * sin(x * 0.13 - uTime * 2.0));
        p.z = -uv.y * uH * 0.9 + sin(x * 0.21 + uTime * 2.0) * 0.6;
        vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform vec3 uLight; uniform float uPoolK; varying vec2 vUv; varying vec3 vW;
      float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z); }
      void main(){
        float n = n3(vec3(vW.x * 1.3, vW.y * 2.5 - uTime * 3.0, uTime)) * 0.6 + n3(vec3(vW.x * 4.0, vW.y * 6.0 - uTime * 5.0, uTime * 2.0)) * 0.4;
        float a = smoothstep(0.25, 0.6, n + 0.35 * (1.0 - vUv.y)) * (1.0 - smoothstep(0.7, 1.0, vUv.y)) * smoothstep(0.0, 0.08, vUv.y);
        vec3 c = vec3(0.7, 0.74, 0.76) * (0.35 + 0.65 * n) * (0.75 + uLight * 0.8) + vec3(0.9, 0.12, 0.08) * 0.15 * uPoolK;
        gl_FragColor = vec4(c, a * 0.95);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const bore = new THREE.Mesh(new THREE.PlaneGeometry(130, 1, 260, 6), boreMat);
  bore.frustumCulled = false;
  bore.renderOrder = 4;
  scene.add(bore);
  return { mesh, U, bore };
}

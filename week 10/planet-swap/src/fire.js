// Flames: camera-facing (upright) quads with a licking, flickering flame drawn in the shader, added onto the frame.
//   const fire = makeFire(scene, max); each frame: fire.begin(); fire.add(x, y, z, width, height, strength, seed); fire.end()
// y is the flame's base. The shape tapers to tongues that rise and break off; the colour runs from a yellow-white
// core to orange and a dark red edge.
import * as THREE from 'three';

export function makeFire(scene, max = 3000) {
  const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const aC = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);   // base xyz, width
  const aK = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);   // height, strength, seed
  geo.setAttribute('aC', aC); geo.setAttribute('aK', aK);
  const mat = new THREE.ShaderMaterial({
    // uOcc: 0 = pure glow added onto the frame; up to 1 the flame also covers what's behind it (so it reads orange,
    // not white, over bright sand in the daylight)
    uniforms: { uTime: { value: 0 }, uGain: { value: 1 }, uOcc: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute vec4 aC; attribute vec3 aK; varying vec2 vUv; varying vec3 vK;
      void main() {
        vUv = uv; vK = aK;
        vec3 c = aC.xyz;
        vec3 toCam = cameraPosition - c; toCam.y = 0.0;
        vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), normalize(toCam + vec3(1e-4, 0.0, 0.0))));
        // the flame leaps and drops (each its own rhythm)
        float t = uTime + aK.z * 37.0;
        float flick = 0.8 + 0.16 * sin(t * 7.3) + 0.1 * sin(t * 13.1 + 1.7) + 0.07 * sin(t * 23.0 + 4.0);
        vec3 wp = c + side * position.x * aC.w * (1.0 + 0.08 * sin(t * 9.0)) + vec3(0.0, position.y * aK.x * flick, 0.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uGain; uniform float uOcc; varying vec2 vUv; varying vec3 vK;
      float h2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
      void main() {
        float x = (vUv.x - 0.5) * 2.0, y = vUv.y;
        float t = uTime + vK.z * 50.0;
        // the whole flame sways more the higher up; turbulence races up through it
        float sway = (n2(vec2(y * 1.6 - t * 1.4, vK.z * 7.0)) - 0.5) * 0.8 * y;
        float xs = x - sway;
        float n = n2(vec2(xs * 2.6 + vK.z * 9.0, y * 3.6 - t * 3.4)) * 0.55 + n2(vec2(xs * 6.5 - vK.z * 3.0, y * 8.0 - t * 5.6)) * 0.3
                + n2(vec2(xs * 14.0, y * 16.0 - t * 8.5)) * 0.15;
        // a wide base narrowing into licking tongues that tear off at the top
        float w = pow(1.0 - y, 0.7);
        float edge = w - abs(xs) * (1.0 + 0.6 * y) + (n - 0.5) * (0.5 + 0.9 * y);
        float dens = smoothstep(-0.02, 0.22, edge) * smoothstep(0.0, 0.07, y);
        dens *= smoothstep(0.0, 0.2, n + (1.0 - y) * 1.05 - 0.5);
        if (dens < 0.02) discard;
        float hot = clamp(edge * 1.6 * (1.1 - 0.8 * y), 0.0, 1.0);
        vec3 col = mix(vec3(0.62, 0.06, 0.01), vec3(1.0, 0.36, 0.035), smoothstep(0.05, 0.35, hot));   // red edges -> orange
        col = mix(col, vec3(1.0, 0.55, 0.1), smoothstep(0.4, 0.7, hot));                                  // a deeper orange body
        col = mix(col, vec3(1.0, 0.8, 0.38), smoothstep(0.72, 0.95, hot) * (1.0 - y));                   // a small hot heart low down
        float I = (0.7 + 1.5 * hot) * vK.y * uGain;
        gl_FragColor = vec4(col * dens * I, clamp(dens * vK.y * uOcc * 1.5, 0.0, 1.0));
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false; mesh.renderOrder = 7;
  scene.add(mesh);
  let n = 0;
  return {
    mat,
    begin() { n = 0; },
    add(x, y, z, w, h, k, seed) {
      if (n >= max || k <= 0.01 || h <= 0) return;
      aC.setXYZW(n, x, y, z, w); aK.setXYZ(n, h, k, seed); n++;
    },
    end() { mesh.count = n; aC.needsUpdate = true; aK.needsUpdate = true; },
  };
}

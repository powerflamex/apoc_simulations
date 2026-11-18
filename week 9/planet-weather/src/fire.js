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
      attribute vec4 aC; attribute vec3 aK; varying vec2 vUv; varying vec3 vK;
      void main() {
        vUv = uv; vK = aK;
        vec3 c = aC.xyz;
        vec3 toCam = cameraPosition - c; toCam.y = 0.0;
        vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), normalize(toCam + vec3(1e-4, 0.0, 0.0))));
        vec3 wp = c + side * position.x * aC.w + vec3(0.0, position.y * aK.x, 0.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uGain; uniform float uOcc; varying vec2 vUv; varying vec3 vK;
      float h2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
      void main() {
        float x = (vUv.x - 0.5) * 2.0, y = vUv.y;
        float t = uTime * 2.2 + vK.z * 50.0;
        // turbulence rising through the flame
        float n = n2(vec2(x * 2.5 + vK.z * 9.0, y * 3.5 - t * 1.6)) * 0.6 + n2(vec2(x * 6.0, y * 7.0 - t * 2.7)) * 0.4;
        float w = (1.0 - y) * (0.75 + 0.25 * sin(t * 1.3 + vK.z * 20.0)) ;
        float xs = x + (n - 0.5) * 0.9 * y;
        float body = smoothstep(w, w * 0.25, abs(xs)) * smoothstep(0.0, 0.08, y);
        float dens = body * smoothstep(0.15, 0.7, n + (1.0 - y) * 0.6);
        if (dens < 0.01) discard;
        float core = smoothstep(0.55, 1.0, dens) * (1.0 - y);
        vec3 col = mix(vec3(0.9, 0.12, 0.02), vec3(1.0, 0.5, 0.08), smoothstep(0.1, 0.5, dens));
        col = mix(col, vec3(1.0, 0.75, 0.3), core);
        gl_FragColor = vec4(col * dens * vK.y * uGain * 1.1, clamp(dens * vK.y * uOcc * 1.6, 0.0, 1.0));
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

// Snow in summer: flakes falling in a box that follows the camera (wrapping, so it never runs out), drifting a
// little in the wind and catching the light. uK fades it in and out.
import * as THREE from 'three';
import { rng } from './util.js';

export function makeSnow(scene, n = 14000) {
  const R = rng(808);
  const pos = new Float32Array(n * 3), rnd = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos[i * 3] = R(); pos[i * 3 + 1] = R(); pos[i * 3 + 2] = R(); rnd[i] = R(); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aR', new THREE.BufferAttribute(rnd, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uK: { value: 0 }, uLight: { value: 1 }, uPxH: { value: 1080 } },
    transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `attribute float aR; uniform float uTime; uniform vec3 uCam; uniform float uPxH; varying float vA;
      void main(){
        vec3 box = vec3(60.0, 30.0, 60.0);
        float fall = uTime * (0.9 + 0.5 * aR);
        vec3 p = position * box + vec3(sin(uTime * 0.7 + aR * 30.0) * 0.6 + uTime * 0.4, -fall, cos(uTime * 0.5 + aR * 20.0) * 0.5);
        p = mod(p - (uCam - box * 0.5), box) + (uCam - box * 0.5);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = -mv.z;
        gl_PointSize = clamp(uPxH * 0.045 / max(d, 0.3) * (0.6 + 0.8 * aR), 1.0, 22.0);
        vA = smoothstep(0.4, 1.5, d) * smoothstep(45.0, 20.0, d);
      }`,
    fragmentShader: /* glsl */ `uniform float uK; uniform float uLight; varying float vA;
      void main(){ vec2 q = gl_PointCoord - 0.5; float r = length(q); if (r > 0.5) discard;
        gl_FragColor = vec4(vec3(0.95, 0.97, 1.0) * uLight, smoothstep(0.5, 0.15, r) * vA * uK * 0.85); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.renderOrder = 8;
  scene.add(pts);
  return {
    mat,
    frame(v, k, cam, light) {
      pts.visible = k > 0.001;
      mat.uniforms.uTime.value = v; mat.uniforms.uK.value = k; mat.uniforms.uCam.value.copy(cam.position); mat.uniforms.uLight.value = light;
    },
  };
}

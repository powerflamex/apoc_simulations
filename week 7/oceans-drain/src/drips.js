// Water still running off things that were under the sea a moment ago: streaks falling from fixed points (a hull's
// edge, a rail, a ledge), each on its own loop. Drawn as thin upright cards turned to the camera; all the motion is in
// the vertex shader, so thousands cost nothing.
//   emitters: [{ x, y, z, fall (m down to the ground), w (width, m), len (m), ph }]
import * as THREE from 'three';

export function makeDrips(parent, emitters) {
  const n = emitters.length;
  const geo = new THREE.InstancedBufferGeometry();
  const base = new THREE.PlaneGeometry(1, 1);
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  const aO = new Float32Array(n * 3), aP = new Float32Array(n * 4);
  emitters.forEach((d, i) => {
    aO.set([d.x, d.y, d.z], i * 3);
    aP.set([Math.max(0.3, d.fall), d.ph ?? ((i * 0.6180339) % 1), d.w ?? 0.05, d.len ?? 0.8], i * 4);
  });
  geo.setAttribute('aO', new THREE.InstancedBufferAttribute(aO, 3));
  geo.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 4));
  geo.instanceCount = n;
  const uniforms = { uTime: { value: 0 }, uAmount: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec3 aO; attribute vec4 aP; uniform float uTime; uniform float uAmount;
      varying vec2 vUv; varying float vA;
      void main() {
        float T = sqrt(2.0 * aP.x / 9.81);
        float cyc = uTime / (T + 0.25) + aP.y * 7.0;
        float t = fract(cyc) * (T + 0.25);
        float on = step(fract(aP.y * 37.7 + floor(cyc) * 0.37), uAmount);
        float y = -0.5 * 9.81 * t * t;
        float len = aP.w * (0.25 + 1.3 * t);
        vec3 o = (modelMatrix * vec4(aO, 1.0)).xyz;
        vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), cameraPosition - o));
        vec3 wp = o + right * position.x * aP.z + vec3(0.0, y + (position.y - 0.5) * len, 0.0);
        vUv = uv;
        vA = on * step(t, T) * smoothstep(0.0, 0.05, t);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying float vA;
      void main() {
        float a = vA * (1.0 - pow(abs(vUv.x * 2.0 - 1.0), 2.0)) * smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
        if (a < 0.01) discard;
        gl_FragColor = vec4(vec3(0.9, 0.96, 1.0) * 1.1, a * 0.6);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  parent.add(mesh);
  return { mesh, uniforms };
}

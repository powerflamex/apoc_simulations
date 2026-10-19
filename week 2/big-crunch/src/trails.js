// Streaks of light: what a long exposure makes of anything bright that moves (cars' headlights and tail lights on
// the road; debris falling back through the sky after the impact). Each streak is a soft ribbon from p0 to p1,
// facing the camera, added onto the frame.
//   const trails = makeTrails(scene, max); each frame: trails.begin(); trails.add(p0, p1, width, r, g, b); trails.end()
import * as THREE from 'three';

export function makeTrails(scene, max = 2000) {
  const geo = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);   // x: 0..1 along, y: -0.5..0.5 across
  const a0 = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);   // p0, width
  const a1 = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);   // p1, head brightness (0 = even)
  const aK = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  geo.setAttribute('a0', a0); geo.setAttribute('a1', a1); geo.setAttribute('aK', aK);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec4 a0; attribute vec4 a1; attribute vec3 aK; varying vec2 vUv; varying vec3 vK; varying float vHead;
      void main() {
        vec3 p = mix(a0.xyz, a1.xyz, position.x);
        vec3 seg = a1.xyz - a0.xyz;
        vec3 side = normalize(cross(seg + vec3(1e-4, 0.0, 0.0), p - cameraPosition));
        p += side * position.y * a0.w;
        vUv = vec2(position.x, position.y * 2.0); vK = aK; vHead = a1.w;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vK; varying float vHead;
      void main() {
        float across = exp(-vUv.y * vUv.y * 4.0);
        float ends = smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.96, vUv.x);
        float head = mix(1.0, 0.25 + 0.75 * pow(vUv.x, 3.0), vHead);
        gl_FragColor = vec4(vK * across * ends * head, 1.0);
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false; mesh.renderOrder = 7;
  scene.add(mesh);
  let n = 0;
  return {
    mesh,
    begin() { n = 0; },
    add(p0, p1, w, r, g, b, head = 0) {
      if (n >= max || r + g + b < 0.001) return;
      a0.setXYZW(n, p0[0], p0[1], p0[2], w); a1.setXYZW(n, p1[0], p1[1], p1[2], head); aK.setXYZ(n, r, g, b); n++;
    },
    end() { mesh.count = n; a0.needsUpdate = true; a1.needsUpdate = true; aK.needsUpdate = true; },
  };
}

// Burning streaks: a camera-facing ribbon from a tail point to a head point (world metres), its width given as an
// angle (so a streak 200 km away is still a crisp line a pixel or two wide), brightest at the head. Added onto the frame.
//   const streaks = makeStreaks(scene, max); each frame: begin(); add(head, tail, widthRad, r, g, b); end()
import * as THREE from 'three';

export function makeStreaks(scene, max = 3000) {
  const geo = new THREE.PlaneGeometry(1, 1, 1, 1).translate(0.5, 0, 0);
  const aH = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);   // head xyz, width (rad)
  const aT = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);   // tail xyz
  const aC = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);   // colour (HDR)
  geo.setAttribute('aH', aH); geo.setAttribute('aT', aT); geo.setAttribute('aC', aC);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec4 aH; attribute vec3 aT; attribute vec3 aC; varying vec2 vUv; varying vec3 vC;
      void main() {
        vec4 h = viewMatrix * vec4(aH.xyz, 1.0), t = viewMatrix * vec4(aT.xyz, 1.0);
        vec4 p = mix(t, h, position.x);
        vec2 hs = h.xy / max(-h.z, 1.0), ts = t.xy / max(-t.z, 1.0);
        vec2 dir = hs - ts; float L = length(dir); dir = L > 1e-7 ? dir / L : vec2(1.0, 0.0);
        vec2 side = vec2(-dir.y, dir.x);
        p.xy += side * position.y * aH.w * max(-p.z, 1.0) * 2.0;
        // a little past the head so it ends round
        p.xy += dir * (position.x - 0.5) * 2.0 * aH.w * max(-p.z, 1.0) * step(0.99, position.x);
        vUv = vec2(position.x, position.y * 2.0); vC = aC;
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vC;
      void main() {
        float across = exp(-vUv.y * vUv.y * 3.5);
        float along = pow(clamp(vUv.x, 0.0, 1.0), 1.8);
        gl_FragColor = vec4(vC * across * along, 1.0);
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false; mesh.renderOrder = 4;
  scene.add(mesh);
  let n = 0;
  return {
    mat,
    begin() { n = 0; },
    add(h, t, w, r, g, b) {
      if (n >= max || r + g + b < 0.002) return;
      aH.setXYZW(n, h[0], h[1], h[2], w); aT.setXYZ(n, t[0], t[1], t[2]); aC.setXYZ(n, r, g, b); n++;
    },
    end() { mesh.count = n; aH.needsUpdate = true; aT.needsUpdate = true; aC.needsUpdate = true; },
  };
}

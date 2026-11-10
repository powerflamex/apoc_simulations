// Soft glowing points (street lamps, traffic signals, headlights, windows' lamps, sparks): camera-facing quads with
// a radial falloff, added onto the frame. Reflections in the rippled flood water are long vertical smears, placed
// where the line from the camera to the mirrored light meets the water (so buildings in front still hide them).
//   const glows = makeGlows(scene, max); each frame: glows.begin(camera); glows.add(x, y, z, size, r, g, b);
//   glows.reflect(x, y, z, size, r, g, b, waterLevel); glows.end()
import * as THREE from 'three';

export function makeGlows(scene, max = 6000, { near = 0.03 } = {}) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const aC = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);   // centre xyz, size
  const aK = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);   // colour (HDR), vertical stretch
  geo.setAttribute('aC', aC); geo.setAttribute('aK', aK);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uFogD: { value: 0 }, uView: { value: new THREE.Matrix4() } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec4 aC; attribute vec4 aK; varying vec2 vUv; varying vec3 vK; varying float vFog; varying float vStr; varying float vDisc;
      uniform float uFogD; uniform mat4 uView;
      void main() {
        vUv = uv * 2.0 - 1.0; vK = aK.rgb; vStr = abs(aK.w); vDisc = aK.w < 0.0 ? 1.0 : 0.0;   // (negative stretch: a solid ball)
        vec4 mv = uView * vec4(aC.xyz, 1.0);
        float d = length(mv.xyz);
        float sz = min(aC.w, ${near.toFixed(4)} * d + 0.02);          // (lights right by the lens don't swell into big blobs)
        mv.xy += position.xy * sz * vec2(1.0, vStr);
        mv.y -= sz * (vStr - 1.0) * 0.5;          // a stretched smear hangs down from its point
        vFog = 1.0 - exp(-uFogD * uFogD * d * d);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vK; varying float vFog; varying float vStr; varying float vDisc;
      void main() {
        float r = length(vUv);
        if (r > 1.0) discard;
        float a = exp(-r * r * 9.0) + 0.25 * exp(-r * r * 2.5) * (1.0 - r);
        if (vDisc > 0.5) a = smoothstep(1.0, 0.82, r) * (0.7 + 0.3 * (1.0 - r * r));
        else if (vStr > 1.5) a = exp(-vUv.x * vUv.x * 7.0) * (1.0 - abs(vUv.y)) * (0.6 + 0.4 * sin(vUv.y * 23.0 + vK.r * 5.0));
        gl_FragColor = vec4(vK * a * (1.0 - vFog * 0.92), 1.0);
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false; mesh.renderOrder = 6;
  scene.add(mesh);
  let n = 0;
  const O = new THREE.Vector3(), T = new THREE.Matrix4(), C = new THREE.Vector3();
  const api = {
    mat, mesh,
    begin(cam) {
      n = 0;
      if (cam) { C.copy(cam.position); O.copy(cam.position); mat.uniforms.uView.value.multiplyMatrices(cam.matrixWorldInverse, T.makeTranslation(O.x, O.y, O.z)); }
    },
    add(x, y, z, size, r, g, b, str = 1) {   // str < 0: a solid ball of that stretch
      if (n >= max || size <= 0 || r + g + b <= 0.002) return;
      aC.setXYZW(n, x - O.x, y - O.y, z - O.z, size); aK.setXYZW(n, r, g, b, str); n++;
    },
    reflect(x, y, z, size, r, g, b, level) {
      const h = y - level;
      if (h <= 0.05 || C.y <= level + 0.05) return;
      const my = level - h;                                      // the mirrored light
      const t = (C.y - level) / (C.y - my);
      const px = C.x + (x - C.x) * t, pz = C.z + (z - C.z) * t;
      const d = Math.hypot(px - C.x, pz - C.z);
      if (d > 2500) return;
      // the smear's length on the water grows with the light's height and the grazing angle
      const str = Math.min(14, 2.5 + h / Math.max(size, 0.3) * 0.9);
      api.add(px, level + 0.02, pz, size * 0.75, r, g, b, str);
    },
    end() { mesh.count = n; aC.needsUpdate = true; aK.needsUpdate = true; },
  };
  return api;
}

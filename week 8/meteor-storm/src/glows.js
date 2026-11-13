// Soft glowing points (street lamps, traffic signals, headlights and tail lights seen far off, sparks):
// camera-facing quads with a radial falloff, added onto the frame.
//   const glows = makeGlows(scene, max); each frame: glows.begin(); glows.add(x, y, z, size, r, g, b); glows.end()
import * as THREE from 'three';

export function makeGlows(scene, max = 6000) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const aC = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);   // centre xyz, size
  const aK = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);   // colour (HDR)
  geo.setAttribute('aC', aC); geo.setAttribute('aK', aK);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uFogD: { value: 0 }, uView: { value: new THREE.Matrix4() } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec4 aC; attribute vec3 aK; varying vec2 vUv; varying vec3 vK; varying float vFog;
      uniform float uFogD; uniform mat4 uView;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vUv = uv * 2.0 - 1.0; vK = aK;
        vec4 mv = uView * vec4(aC.xyz, 1.0);
        mv.xy += position.xy * aC.w;
        float d = length(mv.xyz);
        vFog = 1.0 - exp(-uFogD * uFogD * d * d);
        // a glow right at the lens would be a big blur over the frame: fade it out
        vK *= smoothstep(2.5, 8.0, d / max(aC.w, 1e-6));
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vK; varying float vFog;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        float r = length(vUv);
        if (r > 1.0) discard;
        float a = exp(-r * r * 9.0) + 0.25 * exp(-r * r * 2.5) * (1.0 - r);
        gl_FragColor = vec4(vK * a * (1.0 - vFog * 0.9), 1.0);
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false; mesh.renderOrder = 6;
  scene.add(mesh);
  let n = 0;
  // positions are stored relative to an origin near the camera (float32 can't hold 'a few metres' at 300,000 km);
  // the view matrix that goes with them is built here in double precision
  const O = new THREE.Vector3(), T = new THREE.Matrix4();
  return {
    mat,
    begin(cam) {
      n = 0;
      if (cam) { O.copy(cam.position); mat.uniforms.uView.value.multiplyMatrices(cam.matrixWorldInverse, T.makeTranslation(O.x, O.y, O.z)); }
    },
    add(x, y, z, size, r, g, b) {
      if (n >= max || size <= 0 || r + g + b <= 0.001) return;
      aC.setXYZW(n, x - O.x, y - O.y, z - O.z, size); aK.setXYZ(n, r, g, b); n++;
    },
    end() { mesh.count = n; aC.needsUpdate = true; aK.needsUpdate = true; },
  };
}

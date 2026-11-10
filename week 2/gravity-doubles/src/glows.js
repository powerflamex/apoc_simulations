// Soft glowing points (lamp heads, car and street lights seen far off, beacons, the plane's landing lights,
// fireballs): camera-facing quads with a radial falloff, added onto the frame. They follow the world's bend.
//   const glows = makeGlows(scene, max); each frame: glows.begin(); glows.add(x, y, z, size, r, g, b); glows.end()
import * as THREE from 'three';
import { BEND_GLSL, G } from './bend.js';

export function makeGlows(scene, max = 6000) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const aC = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);   // centre xyz, size
  const aK = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);   // colour (HDR)
  geo.setAttribute('aC', aC); geo.setAttribute('aK', aK);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCap: G.uCap, uFlow: G.uFlow, uR: G.uR, uCam: G.uCam, uTime: G.uTime, uFogD: { value: 0 }, uFogC: { value: new THREE.Color() } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec4 aC; attribute vec3 aK; varying vec2 vUv; varying vec3 vK; varying float vFog;
      uniform float uFogD;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      ${BEND_GLSL}
      void main() {
        vUv = uv * 2.0 - 1.0; vK = aK;
        vec3 c = bendWorld(aC.xyz);
        vec4 mv = viewMatrix * vec4(c, 1.0);
        mv.xy += position.xy * aC.w;
        float d = length(mv.xyz);
        vFog = 1.0 - exp(-uFogD * uFogD * d * d);
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
        gl_FragColor = vec4(vK * a * (1.0 - vFog * 0.85), 1.0);
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false; mesh.renderOrder = 6;
  scene.add(mesh);
  let n = 0;
  return {
    mat,
    begin() { n = 0; },
    add(x, y, z, size, r, g, b) {
      if (n >= max || size <= 0 || r + g + b <= 0.001) return;
      aC.setXYZW(n, x, y, z, size); aK.setXYZ(n, r, g, b); n++;
    },
    end() { mesh.count = n; aC.needsUpdate = true; aK.needsUpdate = true; },
  };
}

// a radial glow texture for sprites
export function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,220,170,0.7)'); gr.addColorStop(0.6, 'rgba(255,150,80,0.15)'); gr.addColorStop(1, 'rgba(255,120,60,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

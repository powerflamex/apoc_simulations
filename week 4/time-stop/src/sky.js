// The sky over Times Square on a rainy night: low cloud lit from below by the city (a violet-pink glow, brightest
// near the horizon and right overhead the square), darker toward the top; no stars. A dome that follows the camera.
import * as THREE from 'three';

export function makeSky() {
  const uniforms = { uGlow: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uGlow; varying vec3 vD;
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec3 d = normalize(vD);
        float h = max(d.y, 0.0);
        vec3 low = vec3(0.30, 0.15, 0.24), mid = vec3(0.11, 0.07, 0.13), top = vec3(0.035, 0.03, 0.05);
        vec3 c = mix(low, mid, smoothstep(0.0, 0.25, h));
        c = mix(c, top, smoothstep(0.25, 0.9, h));
        // the cloud's underside: soft lumps, lit pink from the screens
        vec2 p = d.xz / max(h, 0.08) * 1.4;
        float cl = n2(p) * 0.6 + n2(p * 2.3) * 0.3 + n2(p * 5.1) * 0.1;
        c *= 0.75 + 0.5 * cl;
        c += vec3(0.12, 0.05, 0.1) * exp(-pow(h / 0.08, 2.0)) * uGlow;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

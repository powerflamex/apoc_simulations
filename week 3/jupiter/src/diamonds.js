// Diamond rain: tiny stones drifting past you, each glinting now and then as a four-pointed star (a theory:
// methane breaks down to soot, which may be squeezed into diamond deeper down).
import * as THREE from 'three';

export function makeDiamonds(count = 700, box = 16) {
  const geo = new THREE.BufferGeometry();
  const seed = new Float32Array(count * 4);
  let a = 777;
  const r = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count * 4; i++) seed[i] = r();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const u = {
    uBox: { value: box }, uOffset: { value: new THREE.Vector3() }, uCenter: { value: new THREE.Vector3() },
    uTime: { value: 0 }, uOn: { value: 0 }, uPx: { value: 1144 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uBox; uniform vec3 uOffset; uniform vec3 uCenter; uniform float uTime; uniform float uOn; uniform float uPx;
      varying float vG; varying float vA;
      void main() {
        vec3 p = mod(aSeed.xyz * uBox + uOffset * (0.7 + 0.6 * aSeed.w) - uCenter + uBox * 0.5, uBox) - uBox * 0.5 + uCenter;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = -mv.z;
        // each stone tumbles; it flashes when a facet catches the glow
        float g = pow(max(0.0, sin(uTime * (1.5 + 3.0 * aSeed.y) + aSeed.x * 50.0)), 8.0);
        vG = g;
        vA = uOn * smoothstep(0.4, 1.5, d) * smoothstep(uBox * 0.5, uBox * 0.3, length(p - uCenter));
        gl_PointSize = clamp((0.02 + 0.09 * g) * uPx / max(d, 0.1), 3.0, 90.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vG; varying float vA;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float core = exp(-dot(c, c) * 18.0);
        float star = exp(-abs(c.x) * 22.0) * exp(-abs(c.y) * 2.5) + exp(-abs(c.y) * 22.0) * exp(-abs(c.x) * 2.5);
        float k = core * (0.6 + 2.0 * vG) + star * vG * 1.6;
        gl_FragColor = vec4(vec3(0.85, 0.93, 1.0) * k * vA * 5.0, 1.0);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  return { mesh: pts, u };
}

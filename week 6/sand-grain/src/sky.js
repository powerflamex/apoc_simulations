// The sky over the beach on a clear day: deep blue overhead, paler to the horizon, the Sun behind you, a few fair-weather
// clouds. Later the brown pall of the dust spreading from the blast (uPall, thickest over the hit), the blast's glow round it,
// and at the end the whole sky going white (uWhite). A dome that follows the camera, drawn first.
import * as THREE from 'three';

export function makeSky() {
  const uniforms = {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uTime: { value: 0 }, uHitDir: { value: new THREE.Vector3(0, 0, -1) },
    uPall: { value: 0 }, uWhite: { value: 0 }, uFlash: { value: 0 }, uGlow: { value: 0 }, uBand: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, depthTest: true,
    vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir; uniform float uTime; uniform vec3 uHitDir; uniform float uPall; uniform float uWhite; uniform float uFlash; uniform float uGlow; uniform float uBand;
      varying vec3 vD;
      float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vD);
        float h = d.y, cs = dot(d, uSunDir);
        vec3 zen = vec3(0.07, 0.24, 0.66);
        vec3 hor = vec3(0.66, 0.8, 0.94);
        vec3 sky = mix(hor, zen, pow(smoothstep(-0.02, 0.62, h), 0.55));
        sky += vec3(1.0, 0.95, 0.85) * (pow(max(cs, 0.0), 300.0) * 2.0 + pow(max(cs, 0.0), 30.0) * 0.25);
        // fair-weather cumulus, low over the sea
        if (h > 0.0) {
          vec2 q = d.xz / (h + 0.09);
          float w = fbm(vec3(q * 1.5 + vec2(uTime * 0.006, 0.0), 1.7));
          float w2 = n3(vec3(q * 7.0, 3.1));
          float cl = smoothstep(0.5, 0.64, w + 0.07 * w2) * smoothstep(0.01, 0.08, h) * 0.9;
          sky = mix(sky, vec3(1.0, 0.99, 0.97) * (0.8 + 0.28 * w2), cl);
        }
        sky = mix(sky, vec3(0.7, 0.8, 0.9), smoothstep(0.0, -0.05, h));
        // the dust pall: boiling brown, thickest over the hit, spreading up and round the sky as it grows
        float a = acos(clamp(dot(d, uHitDir), -1.0, 1.0));
        float rough = fbm(d * 4.0 + vec3(0.0, -uTime * 0.05, uTime * 0.03));
        float pall = smoothstep(uPall * 2.9, uPall * 2.9 - 0.7, a + (rough - 0.5) * 0.9) * smoothstep(0.0, 0.2, uPall);
        vec3 pc = mix(vec3(0.2, 0.12, 0.08), vec3(0.06, 0.045, 0.045), smoothstep(0.35, 0.68, rough));
        sky = mix(sky, pc, pall * 0.96);
        sky += vec3(1.6, 0.62, 0.18) * uGlow * (0.34 * exp(-a / 0.3) + 0.2 * exp(-a / 0.9));
        // a band of white-hot light along the far horizon, behind the wall
        sky += vec3(1.5, 1.05, 0.62) * uBand * exp(-max(h - 0.02, 0.0) / 0.12) * smoothstep(0.1, 0.7, dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uHitDir.x, 0.0, uHitDir.z))));
        // the white: boiling up from the horizon behind the dust
        float wh = smoothstep(0.0, 1.0, uWhite * 1.55 - max(h, 0.0) * 0.9 + (rough - 0.5) * 0.5 * (1.0 - uWhite));
        sky = mix(sky, vec3(1.0, 0.97, 0.9) * 1.25, wh);
        sky = mix(sky, vec3(1.0, 0.97, 0.92) * 3.0, uFlash);
        gl_FragColor = vec4(sky, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  mesh.frustumCulled = false;
  // Drawn after every other opaque object, depth-tested at the far plane: the sky shader then only runs where sky
  // is actually visible, instead of on the whole frame before the world is drawn over it. Transparent objects
  // still come after it, so the picture is the same. (Needs every other opaque object to write and test depth.)
  mesh.renderOrder = 1000;
  return { mesh, uniforms };
}

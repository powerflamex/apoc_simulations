// The biggest one's head: a camera-facing quad at its place in the sky with a burning rock drawn in the shader: a
// white-hot core, a turbulent sheath of yellow and orange plasma streaming back along its path (uTail: that direction on
// screen), and a wide orange glow. Added onto the frame; the skyline in front of it hides it.
import * as THREE from 'three';

export function makeBigHead(scene) {
  const uniforms = { uTime: { value: 0 }, uI: { value: 0 }, uTail: { value: new THREE.Vector2(0, 1) }, uLen: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = position.xy;
        vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float s = length(modelMatrix[0].xyz);
        mv.xy += position.xy * s;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uI; uniform vec2 uTail; uniform float uLen;
      varying vec2 vUv;
      float h2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n2(p); p = p * 2.1 + 3.7; a *= 0.5; } return s; }
      void main() {
        vec2 uv = vUv;                                  // -1..1 across the quad
        float a = dot(uv, uTail), b = dot(uv, vec2(-uTail.y, uTail.x));
        float r = length(uv);
        const float R0 = 0.09;                          // the white-hot core
        float back = max(a, 0.0);
        // the flames: a sheath streaming back along the path, widening, torn into tongues that rush backward
        float w = R0 * (1.5 + 2.2 * back / uLen);
        float n = fbm(vec2(a * 16.0 - uTime * 9.0, b * 22.0)) * 0.65 + fbm(vec2(a * 40.0 - uTime * 17.0, b * 50.0 + 4.0)) * 0.35;
        float dens = exp(-b * b / (w * w)) * exp(-back / (0.42 * uLen)) * smoothstep(-R0 * 2.0, -R0 * 0.3, a);
        // round the core (seen nearly head-on): a ragged ring of flame
        float ang = atan(uv.y, uv.x);
        float ring = exp(-pow((r - R0 * 1.25) / (R0 * (0.5 + 0.9 * fbm(vec2(ang * 3.0, uTime * 2.0)))), 2.0));
        float f = clamp(max(dens, ring * 0.9) * (0.45 + 0.9 * n), 0.0, 1.5);
        float flame = smoothstep(0.22, 0.75, f);
        vec3 fc = mix(vec3(0.75, 0.12, 0.02), vec3(1.0, 0.45, 0.08), smoothstep(0.2, 0.6, f));
        fc = mix(fc, vec3(1.0, 0.85, 0.5), smoothstep(0.7, 1.1, f));
        float core = smoothstep(R0, R0 * 0.85, r);
        float hot = exp(-r * r / (R0 * R0 * 3.0));
        vec3 c = vec3(1.0, 0.98, 0.95) * core * 3.0 + vec3(1.0, 0.85, 0.6) * hot * 0.8 + fc * flame * 1.7;
        float edge = 1.0 - smoothstep(0.8, 1.0, max(abs(uv.x), abs(uv.y)));
        gl_FragColor = vec4(c * uI * edge, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.visible = false;
  scene.add(mesh);
  return { mesh, uniforms };
}

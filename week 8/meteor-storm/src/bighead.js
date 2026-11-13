// The flames round the biggest one (the rock itself is rock.js, drawn in front of this): a camera-facing quad just
// behind the rock with, drawn in the shader, a thin white-hot bow of compressed air hugging its leading side, a sheath
// of fire torn into tongues streaming back along its path (uTail: that direction on screen), and chunks of flame
// peeling off and falling back. No round halo: the edges stay crisp. Added onto the frame; the skyline hides it.
import * as THREE from 'three';

export function makeBigHead(scene) {
  const uniforms = { uTime: { value: 0 }, uI: { value: 0 }, uTail: { value: new THREE.Vector2(0, 1) }, uLen: { value: 1 }, uR: { value: 0.16 } };
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
      uniform float uTime; uniform float uI; uniform vec2 uTail; uniform float uLen; uniform float uR;
      varying vec2 vUv;
      float h1(float x){ return fract(sin(x * 91.7) * 43758.5); }
      float h2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n2(p); p = p * 2.1 + 3.7; a *= 0.5; } return s; }
      void main() {
        vec2 uv = vUv;                                  // -1..1 across the quad
        float R0 = uR;                                  // the rock's radius here
        float a = dot(uv, uTail), b = dot(uv, vec2(-uTail.y, uTail.x));
        float r = length(uv);
        // the sheath: starts just ahead of the rock, widens and streams back, torn into tongues rushing backward
        float back = max(a + R0 * 0.7, 0.0);
        float L = 0.55 * uLen;
        float w = R0 * (1.0 + 1.5 * back / L);
        float n = fbm(vec2(back / R0 * 1.6 - uTime * 6.0, b / R0 * 2.4)) * 0.65 + fbm(vec2(back / R0 * 4.0 - uTime * 11.0, b / R0 * 6.0 + 4.0)) * 0.35;
        float dens = exp(-pow(b / w, 2.0) * (1.3 - 0.9 * n)) * exp(-back / L) * smoothstep(-R0 * 1.2, -R0 * 0.75, a);
        float f = dens * (0.45 + 0.95 * n);
        float flame = smoothstep(0.26, 0.62, f);
        vec3 fc = mix(vec3(0.85, 0.16, 0.02), vec3(1.0, 0.5, 0.1), smoothstep(0.3, 0.7, f));
        fc = mix(fc, vec3(1.0, 0.86, 0.55), smoothstep(0.75, 1.1, f) * exp(-back / (0.5 * L)));
        vec3 c = fc * flame * 1.7;
        // the bow: a thin white-hot shell hugging the leading side
        float lead = smoothstep(0.2, -0.9, a / max(r, 1e-4));
        c += vec3(1.0, 0.92, 0.75) * exp(-pow((r - R0 * 1.08) / (R0 * 0.1), 2.0)) * lead * 2.2;
        // chunks of flame peeling off and falling back
        for (int i = 0; i < 9; i++) {
          float fi = float(i);
          float ph = fract(uTime * (0.55 + 0.25 * h1(fi)) + h1(fi + 7.0));
          float pa = R0 * 0.6 + ph * L * 1.3;
          float pb = (h1(fi + 3.0) - 0.5) * R0 * (1.6 + 2.5 * ph);
          float rad = R0 * (0.2 + 0.12 * h1(fi + 5.0)) * (1.0 - 0.6 * ph);
          float d = length(vec2(a - pa, b - pb));
          float blob = smoothstep(rad, rad * 0.35, d) * (1.0 - ph);
          c += mix(vec3(1.0, 0.75, 0.35), vec3(1.0, 0.3, 0.05), ph) * blob * 2.0;
        }
        float edge = 1.0 - smoothstep(0.85, 1.0, max(abs(uv.x), abs(uv.y)));
        gl_FragColor = vec4(c * uI * edge, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.visible = false;
  scene.add(mesh);
  return { mesh, uniforms };
}

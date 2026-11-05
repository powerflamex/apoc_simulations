// The sky over the avenue on a clear day: deep blue overhead, paler toward the horizon, warm toward the Sun (which is
// behind you and to the right, so only its aureole shows), thin wisps of high cloud; later the orange cast of the
// burning trail round the rod, and after the hit the brown pall rising over the far end of the avenue.
// A dome that follows the camera, drawn first.
import * as THREE from 'three';

export function makeSky() {
  const uniforms = {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uPx: { value: 0.001 }, uTime: { value: 0 },
    uRodDir: { value: new THREE.Vector3(0, 0.5, -0.8) }, uFire: { value: 0 }, uDust: { value: 0 }, uFlash: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir; uniform float uPx; uniform float uTime; uniform vec3 uRodDir; uniform float uFire; uniform float uDust; uniform float uFlash;
      varying vec3 vD;
      float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vD);
        float h = d.y;
        float cs = dot(d, uSunDir);
        vec3 sd = normalize(vec3(uSunDir.x, 0.0, uSunDir.z));
        float csH = dot(normalize(vec3(d.x, 0.0, d.z) + 1e-5), sd);
        // the clear day: deep blue up, pale and a little warm low down, brightest toward the Sun's side
        vec3 zen = vec3(0.13, 0.30, 0.70);
        vec3 hor = mix(vec3(0.70, 0.79, 0.90), vec3(0.86, 0.86, 0.84), 0.5 + 0.5 * csH);
        vec3 sky = mix(hor, zen, pow(smoothstep(-0.02, 0.8, h), 0.62));
        sky += vec3(1.0, 0.9, 0.75) * pow(max(cs, 0.0), 8.0) * 0.35 * exp(-max(h, 0.0) * 1.5);
        // the Sun's aureole (behind you: only its glare at the edge of the frame, if at all)
        sky += vec3(1.0, 0.95, 0.85) * (pow(max(cs, 0.0), 300.0) * 2.0 + pow(max(cs, 0.0), 40.0) * 0.25);
        // thin high cloud
        if (h > 0.03) {
          vec2 q = d.xz / (h + 0.25);
          float w = fbm(vec3(q * 2.2 + vec2(0.0, uTime * 0.004), 1.7));
          float w2 = n3(vec3(q * 9.0, 3.1));
          float cl = smoothstep(0.52, 0.72, w + 0.08 * w2) * smoothstep(0.03, 0.2, h) * 0.55;
          sky = mix(sky, vec3(0.97, 0.97, 0.98) * (0.85 + 0.15 * w2), cl);
        }
        // below the horizon (seen past the buildings' ends): the haze over the far city
        sky = mix(sky, vec3(0.62, 0.64, 0.68), smoothstep(0.0, -0.05, h));
        // the burning air round the rod: an orange glow in the sky round it, fading with the angle from it
        float ang = acos(clamp(dot(d, uRodDir), -1.0, 1.0));
        sky += vec3(1.0, 0.45, 0.12) * uFire * (0.9 * exp(-ang / 0.12) + 0.35 * exp(-ang / 0.5)) * (0.85 + 0.15 * n3(vec3(d * 20.0 + uTime * 2.0)));
        sky = mix(sky, sky * vec3(1.0, 0.72, 0.5) + vec3(0.25, 0.1, 0.02), uFire * 0.45 * smoothstep(0.7, 0.0, h));
        // after the hit: the dust pall climbing over the north, the sky darkening
        float north = smoothstep(0.3, 0.98, -d.z);
        float pall = uDust * north * smoothstep(0.75, -0.05, h) * (0.7 + 0.3 * fbm(d * 6.0 + uTime * 0.2));
        sky = mix(sky, vec3(0.3, 0.2, 0.14), clamp(pall, 0.0, 1.0));
        sky += vec3(1.5, 0.55, 0.15) * pall * 0.5 * smoothstep(0.35, 0.0, h);
        sky = mix(sky, vec3(1.0, 0.97, 0.92) * 3.0, uFlash);
        gl_FragColor = vec4(sky, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

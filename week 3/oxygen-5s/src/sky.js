// The sky over Rio, early afternoon: deep blue overhead, pale at the horizon, the Sun high to the north. With a fifth
// of the air gone it is a little darker; the dust of a whole city and its mountains hazes the horizon beige; at 5.00 s
// the hydrogen burns and the sky is fire.
import * as THREE from 'three';

export function makeSky(sunDir) {
  const uniforms = { uSunDir: { value: sunDir.clone() }, uDim: { value: 0 }, uDust: { value: 0 }, uFire: { value: 0 }, uTime: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir; uniform float uDim; uniform float uDust; uniform float uFire; uniform float uTime;
      varying vec3 vD;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main() {
        vec3 d = normalize(vD);
        float up = clamp(d.y, -0.1, 1.0);
        vec3 zen = mix(vec3(0.13, 0.3, 0.62), vec3(0.08, 0.2, 0.5), uDim);
        vec3 hor = mix(vec3(0.66, 0.77, 0.9), vec3(0.55, 0.68, 0.86), uDim);
        vec3 col = mix(hor, zen, pow(smoothstep(-0.02, 0.85, up), 0.7));
        float sd = max(dot(d, uSunDir), 0.0);
        col += vec3(1.0, 0.9, 0.75) * (pow(sd, 8.0) * 0.25 + pow(sd, 120.0) * 0.6);
        col += vec3(12.0, 11.0, 9.5) * smoothstep(0.99955, 0.99975, sd);
        // the dust of the collapse: a beige haze rising from the horizon
        col = mix(col, vec3(0.72, 0.66, 0.58), uDust * (1.0 - smoothstep(-0.05, 0.35, up)) * 0.85);
        // fire
        float fl = vn(d.xz / max(d.y + 1.2, 0.2) * 3.0 + vec2(uTime * 0.6, -uTime * 0.4));
        col = mix(col, mix(vec3(2.4, 0.7, 0.15), vec3(4.0, 2.8, 1.4), fl), uFire);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
  mesh.renderOrder = -10; mesh.frustumCulled = false;
  return { mesh, uniforms };
}

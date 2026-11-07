// Real-looking flames for things close to you: upright camera-facing cards (awnings, windows, cars, the billboard, the
// helicopter), each a tongue of fire drawn in the shader. Filled every frame: flames.begin(); flames.add(x, y, z, size,
// strength, seed); flames.end(). (x, y, z) is the foot of the flame.
import * as THREE from 'three';

export function makeFlames(scene, max = 1400) {
  const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const aC = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);   // foot xyz, size
  const aK = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2);   // strength, seed
  geo.setAttribute('aC', aC); geo.setAttribute('aK', aK);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    // (flame over flame stays flame-coloured: added light would burn out to white)
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: /* glsl */ `attribute vec4 aC; attribute vec2 aK; varying vec2 vUv; varying vec2 vK;
      void main() {
        vUv = uv; vK = aK;
        vec3 to = cameraPosition - aC.xyz;
        vec3 right = normalize(vec3(to.z, 0.0, -to.x));
        vec3 w = aC.xyz + right * position.x * aC.w * 0.8 + vec3(0.0, position.y * aC.w * 1.3, 0.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */ `uniform float uTime; varying vec2 vUv; varying vec2 vK;
      float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n3(p); p = p * 2.05 + 1.3; a *= 0.5; } return s; }
      void main() {
        vec2 p = vec2((vUv.x - 0.5) * 2.0, vUv.y);
        float t = uTime * 1.3 + vK.y * 17.0;
        // a soft mass of fire that breaks into licks on its way up, not one clean spike
        p.x += (fbm(vec3(p.y * 1.6 - t * 0.7, vK.y * 5.0, t * 0.25)) - 0.47) * 0.9 * p.y;
        float mass = 1.0 - length(vec2(p.x / (0.86 - 0.3 * p.y), (p.y - 0.28) / 0.74));
        float n = fbm(vec3(p.x * 2.1, p.y * 2.3 - t * 1.8, vK.y * 9.0));
        float n2 = fbm(vec3(p.x * 5.5, p.y * 5.0 - t * 3.2, vK.y * 3.0));
        float f = smoothstep(0.0, 0.62, mass * 1.15 + (n - 0.45) * 1.25 + (n2 - 0.47) * 0.5 * p.y);
        f *= smoothstep(0.0, 0.08, vUv.y);
        float hot = f * (1.15 - 0.85 * p.y);
        vec3 c = mix(vec3(0.5, 0.05, 0.008), vec3(1.25, 0.26, 0.022), smoothstep(0.08, 0.5, hot));
        c = mix(c, vec3(1.75, 0.62, 0.07), smoothstep(0.5, 0.95, hot));
        float a = pow(f, 1.4) * vK.x;
        gl_FragColor = vec4(c * min(a, 1.0), min(a * 0.8, 0.92));
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false; mesh.renderOrder = 7;
  scene.add(mesh);
  let n = 0;
  return {
    mat,
    begin(v) { n = 0; mat.uniforms.uTime.value = v; },
    add(x, y, z, size, k, seed) {
      if (n >= max || k < 0.01 || size <= 0) return;
      aC.setXYZW(n, x, y, z, size); aK.setXY(n, k, seed); n++;
    },
    end() { mesh.count = n; aC.needsUpdate = true; aK.needsUpdate = true; },
  };
}

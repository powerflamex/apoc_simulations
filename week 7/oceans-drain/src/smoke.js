// Smoke and dust: soft billowing puffs (instanced spheres with a noisy, ragged edge), each with its own colour,
// opacity and glow. Columns over the burning buildings, a puff of steam over the crash, dust clouds where
// buildings collapse. Callers fill the puff list each frame: smoke.puff(x, y, z, radius, alpha, shade, glow, seed).
import * as THREE from 'three';

const NOISE = /* glsl */ `
  float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float noise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise3(p); p = p * 2.07 + 3.1; a *= 0.5; } return s; }
`;

export function makeSmoke(scene, max = 2600) {
  const geo = new THREE.IcosahedronGeometry(1, 3);
  const aP = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);   // alpha, shade, glow, seed
  geo.setAttribute('aP', aP);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLight: { value: new THREE.Color(1, 1, 1) }, uSun: { value: new THREE.Vector3(0, 1, 0) } },
    transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `attribute vec4 aP; uniform float uTime; varying vec4 vP; varying vec3 vN; varying vec3 vView; varying vec3 vObj; varying float vNear;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      ${NOISE}
      void main() {
        vP = aP; vObj = position;
        // fade a puff out as the camera gets inside it (no black-outs when the dust rolls over the camera)
        vec3 ctr = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float rad = length((modelMatrix * instanceMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
        vNear = smoothstep(rad * 0.8, rad * 1.6, length(cameraPosition - ctr));
        vec3 p = position + normal * (fbm(position * 2.0 + vec3(aP.w * 13.0, -uTime * 0.15, aP.w * 7.0)) - 0.5) * 0.5;
        vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
        vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
        vView = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform vec3 uLight; uniform vec3 uSun; varying vec4 vP; varying vec3 vN; varying vec3 vView; varying vec3 vObj; varying float vNear;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${NOISE}
      void main() {
        #include <logdepthbuf_fragment>
        float rim = abs(dot(normalize(vN), vView));
        float n = fbm(vObj * 2.4 + vec3(vP.w * 9.0, -uTime * 0.2, 0.0));
        float a = smoothstep(0.42, 0.66, n * 1.25 + 0.22 * rim - 0.08) * smoothstep(0.05, 0.95, rim) * vP.x * vNear;
        float lit = 0.55 + 0.45 * max(dot(normalize(vN), uSun), 0.0);
        vec3 c = mix(vec3(0.07, 0.065, 0.06), vec3(0.62, 0.58, 0.52), vP.y) * lit * uLight;
        c += vec3(1.6, 0.55, 0.12) * vP.z * (0.4 + 0.8 * n);   // lit from below by the fire
        gl_FragColor = vec4(c, a);
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false; mesh.renderOrder = 5;
  scene.add(mesh);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
  let n = 0;
  return {
    mat,
    begin() { n = 0; },
    puff(x, y, z, r, alpha, shade, glow, seed) {
      if (n >= max || alpha < 0.004 || r <= 0) return;
      e.set(seed * 3.1, seed * 7.7, seed * 1.3); q.setFromEuler(e);
      m4.compose(pos.set(x, y, z), q, sc.setScalar(r));
      mesh.setMatrixAt(n, m4);
      aP.setXYZW(n, alpha, shade, glow, seed);
      n++;
    },
    end() { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; aP.needsUpdate = true; },
  };
}

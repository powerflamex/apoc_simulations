// Soft puffs: instanced balls with a ragged noisy edge, each with its own colour and opacity, lit by the place's Sun
// and sky. Steam off the drink (Venus), froth and vapour (Mars), dust (Mars), drink blobs floating (Jupiter), clouds
// rushing past (Jupiter, Neptune), ice glitter (Pluto). Callers fill the list every frame: puff(x, y, z, r, a, col, seed).
import * as THREE from 'three';

const NOISE = /* glsl */ `
  float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float noise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise3(p); p = p * 2.07 + 3.1; a *= 0.5; } return s; }
`;

export function makePuffs(scene, max = 1500) {
  const geo = new THREE.IcosahedronGeometry(1, 3);
  const aC = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);   // rgb, alpha
  const aS = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);       // seed
  geo.setAttribute('aC', aC); geo.setAttribute('aS', aS);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunC: { value: new THREE.Color(1, 1, 1) }, uAmb: { value: new THREE.Color(0.5, 0.5, 0.5) }, uSoft: { value: 1 } },
    transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `attribute vec4 aC; attribute float aS; uniform float uT; varying vec4 vC; varying float vS; varying vec3 vN; varying vec3 vView; varying vec3 vObj;
      ${NOISE}
      void main() {
        vC = aC; vS = aS; vObj = position;
        vec3 p = position + normal * (fbm(position * 2.0 + vec3(aS * 13.0, -uT * 0.3, aS * 7.0)) - 0.5) * 0.5;
        vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
        vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
        vView = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `uniform float uT; uniform vec3 uSun; uniform vec3 uSunC; uniform vec3 uAmb; uniform float uSoft; varying vec4 vC; varying float vS; varying vec3 vN; varying vec3 vView; varying vec3 vObj;
      ${NOISE}
      void main() {
        float rim = abs(dot(normalize(vN), vView));
        float n = fbm(vObj * 2.4 + vec3(vS * 9.0, -uT * 0.4, 0.0));
        float a = smoothstep(0.3, 0.62, n + 0.32 * rim) * smoothstep(0.0, 0.5, rim) * vC.a;
        float lit = max(dot(normalize(vN), uSun), 0.0);
        vec3 c = vC.rgb * (uAmb + uSunC * (0.35 + 0.65 * lit)) * (0.8 + 0.35 * n);
        gl_FragColor = vec4(c, a);
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false; mesh.renderOrder = 5;
  scene.add(mesh);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
  let n = 0;
  return {
    mat, mesh,
    begin() { n = 0; },
    puff(x, y, z, r, alpha, col, seed, stretch = 1) {
      if (n >= max || alpha < 0.004 || r <= 0) return;
      if (stretch !== 1) q.identity(); else { e.set(seed * 3.1, seed * 7.7, seed * 1.3); q.setFromEuler(e); }
      m4.compose(pos.set(x, y, z), q, sc.set(r * stretch, r, r));
      mesh.setMatrixAt(n, m4);
      aC.setXYZW(n, col[0], col[1], col[2], alpha);
      aS.setX(n, seed);
      n++;
    },
    end() { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; aC.needsUpdate = true; aS.needsUpdate = true; },
  };
}

// Smoke, dust and glowing gas (a puff's glow colour can be set: the hot gas glows at its own temperature):
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
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const aP = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);   // alpha, shade, glow, seed
  const aG = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);   // the glow's colour (HDR)
  geo.setAttribute('aP', aP); geo.setAttribute('aG', aG);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLight: { value: new THREE.Color(1, 1, 1) }, uSun: { value: new THREE.Vector3(0, 1, 0) } },
    transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `attribute vec4 aP; attribute vec3 aG; varying vec3 vG; uniform float uTime; varying vec4 vP; varying vec3 vN; varying vec3 vView; varying vec3 vObj; varying float vNear;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      ${NOISE}
      void main() {
        vP = aP; vG = aG; vObj = position;
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
    fragmentShader: /* glsl */ `uniform float uTime; uniform vec3 uLight; uniform vec3 uSun; varying vec3 vG; varying vec4 vP; varying vec3 vN; varying vec3 vView; varying vec3 vObj; varying float vNear;
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
        c += vG * vP.z * (0.35 + 0.9 * n);   // glowing (hot gas) or lit from below by the fire
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
    L: undefined, V: 0, cam: null,
    begin(L, v, cam) { n = 0; this.L = L; this.V = v; this.cam = cam || null; },
    puff(x, y, z, r, alpha, shade, glow, seed, gr = 1.6, gg = 0.55, gb = 0.12) {
      // (a puff near the lens would fog the whole picture: thin it out as it gets close)
      if (this.cam) { const d = Math.hypot(x - this.cam.x, y - this.cam.y, z - this.cam.z); alpha *= Math.min(1, Math.max(0, (d - (r + 2)) / (r + 6))); }
      if (n >= max || alpha < 0.004 || r <= 0) return;
      e.set(seed * 3.1, seed * 7.7, seed * 1.3); q.setFromEuler(e);
      m4.compose(pos.set(x, y, z), q, sc.setScalar(r));
      mesh.setMatrixAt(n, m4);
      aP.setXYZW(n, alpha, shade, glow, seed); aG.setXYZ(n, gr, gg, gb);
      n++;
    },
    end() { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; aP.needsUpdate = true; aG.needsUpdate = true; },
  };
}

// A column of smoke from a fire that started t seconds ago and burns for `life` s: puffs leave the source every `every`
// s, rise at `rise` m/s (drifting dx, dz m/s), swell and fade; after the fire's out the last ones drift off. Pure
// function of t, so it never pops.
export function emitColumn(smoke, x, y, z, t, {
  heat = true, life = 4, every = 0.45, rise = 2.2, dx = 0.4, dz = 0.2, size = 1, grow = 0.6, alpha = 0.7, shade = 0.12, glow = 0, seed = 0, maxAge = 6, gc } = {}) {
  if (t < 0) return;
  // a fire's smoke thins out once the thing is past burning (glowing on its own)
  let fade = 1;
  if (fade <= 0.01) return;
  alpha *= fade;
  const j1 = Math.floor(Math.min(t, life) / every);
  for (let j = Math.max(0, j1 - Math.ceil(maxAge / every)); j <= j1; j++) {
    const a = t - j * every;
    if (a < 0 || a > maxAge) continue;
    const s = ((j * 0.618 + seed) % 1);
    const k = Math.min(1, a / 0.5) * (1 - Math.min(1, Math.max(0, (a - maxAge * 0.55) / (maxAge * 0.45))));
    const g = glow * Math.exp(-a * 1.5);
    smoke.puff(x + dx * a + Math.sin(s * 20) * 0.4 * size, y + rise * a, z + dz * a + Math.cos(s * 17) * 0.4 * size, size * (0.7 + grow * a), alpha * k, shade, g, s,
      ...(gc || [1.6, 0.55, 0.12]));
  }
}

// The biggest one's body: a real lumpy, cratered asteroid (a displaced sphere: lumps from noise, a dozen bowl craters
// with raised rims), placed in the sky at its true direction and scaled to its size there. Its shader: dark grey-brown
// stone, white-orange hot on the side facing its path (uFront) with glowing cracks running back into the dark side, the
// dark side lit only by the flames streaming past it (a warm rim) and the sky. It tumbles slowly.
import * as THREE from 'three';
import { rng } from './util.js';

function makeRockGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 6);
  const R = rng(4179);
  const craters = Array.from({ length: 14 }, () => {
    const v = new THREE.Vector3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1).normalize();
    return { v, r: 0.16 + R() * 0.3, d: 0.05 + R() * 0.07 };
  });
  // smooth 3D value noise for the lumps
  const H = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
  const N3 = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const L = (a, b, t) => a + (b - a) * t;
    return L(L(L(H(xi, yi, zi), H(xi + 1, yi, zi), u), L(H(xi, yi + 1, zi), H(xi + 1, yi + 1, zi), u), v),
      L(L(H(xi, yi, zi + 1), H(xi + 1, yi, zi + 1), u), L(H(xi, yi + 1, zi + 1), H(xi + 1, yi + 1, zi + 1), u), v), w);
  };
  const p = g.attributes.position, q = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    q.fromBufferAttribute(p, i).normalize();
    // an elongated potato with lumps
    let r = 1 + 0.22 * (N3(q.x * 1.3 + 3, q.y * 1.3, q.z * 1.3) - 0.5) * 2 + 0.08 * (N3(q.x * 4 + 9, q.y * 4, q.z * 4) - 0.5) * 2 + 0.025 * (N3(q.x * 11, q.y * 11 + 5, q.z * 11) - 0.5) * 2;
    for (const c of craters) {
      const a = q.angleTo(c.v) / c.r;
      if (a < 1.35) r += a < 1 ? -c.d * (1 - a * a) : c.d * 0.5 * Math.sin((a - 1) / 0.35 * Math.PI);
    }
    q.multiplyScalar(r);
    q.x *= 1.25; q.z *= 0.88;
    p.setXYZ(i, q.x, q.y, q.z);
  }
  g.computeVertexNormals();
  return g;
}

export function makeRock(scene) {
  const uniforms = { uFront: { value: new THREE.Vector3(0, -1, 0) }, uHot: { value: 1 }, uTime: { value: 0 }, uSky: { value: new THREE.Color(0.1, 0.12, 0.2) } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vP; varying vec3 vObj;
      void main() {
        vObj = position;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uFront; uniform float uHot; uniform float uTime; uniform vec3 uSky;
      varying vec3 vN; varying vec3 vP; varying vec3 vObj;
      float h3(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
      void main() {
        vec3 N = normalize(vN);
        vec3 V = normalize(cameraPosition - vP);
        float facing = dot(N, uFront);                      // +1 on the face ploughing into the air
        // stone: dark grey-brown, mottled
        float m = n3(vObj * 6.0) * 0.6 + n3(vObj * 17.0) * 0.4;
        vec3 stone = mix(vec3(0.05, 0.043, 0.038), vec3(0.13, 0.11, 0.095), m);
        // lit by the sky a little, and by the flames streaming back past it (a warm rim on the trailing side)
        vec3 col = stone * (uSky * 1.5 + vec3(0.05));
        float rim = pow(1.0 - max(dot(N, V), 0.0), 2.5);
        col += vec3(1.0, 0.45, 0.12) * rim * smoothstep(0.4, -0.6, facing) * 0.9 * uHot;
        col += stone * vec3(1.0, 0.6, 0.3) * 0.8 * smoothstep(-0.6, 0.4, facing) * uHot;
        // the leading face: melting white-orange, brightest dead ahead, seething
        float boil = n3(vObj * 9.0 + vec3(0.0, uTime * 1.5, 0.0));
        float heat = smoothstep(-0.05, 0.75, facing + 0.25 * (boil - 0.5));
        vec3 hot = mix(vec3(1.6, 0.42, 0.08), vec3(3.2, 2.5, 1.6), smoothstep(0.55, 1.0, heat));
        col = mix(col, hot * uHot, heat * heat);
        // glowing cracks running back into the dark side
        float cr = abs(n3(vObj * 5.0 + 4.0) - 0.5) * 2.0;
        float crack = (1.0 - smoothstep(0.0, 0.06, cr)) * smoothstep(-0.7, 0.1, facing) * (1.0 - heat);
        col += vec3(1.5, 0.45, 0.08) * crack * uHot;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(makeRockGeometry(), mat);
  mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 6;
  scene.add(mesh);
  return { mesh, uniforms };
}

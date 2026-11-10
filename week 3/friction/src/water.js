// The bay at the bottom of the hill, and what's across it: a wave-spectrum water surface (the golden sky mirrored
// in it, the low Sun's glitter off to the west), Alcatraz straight down the street, Angel Island and the Marin hills
// beyond in the haze. Late on, the hillside pours into it at the seawall: the water there turns to churning brown
// mud, a fan of earth spreads out and a wave of muddy water runs out into the bay (uPour, uWave).
import * as THREE from 'three';
import { Z_EDGE, WATER_Y } from './timeline.js';
import { rng } from './util.js';

export const WU = {
  uTime: { value: 0 }, uSun: { value: new THREE.Vector3(0.8, 0.2, -0.5) }, uFogC: { value: new THREE.Color() }, uFogD: { value: 0 },
  uPour: { value: 0 }, uWave: { value: -1 }, uLight: { value: 1 },
};

const NOISE = /* glsl */ `
float wh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float wn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(wh(i), wh(i+vec2(1,0)), f.x), mix(wh(i+vec2(0,1)), wh(i+vec2(1,1)), f.x), f.y); }
`;

export function makeWater(scene) {
  const geo = new THREE.PlaneGeometry(1, 1, 220, 220).rotateX(-Math.PI / 2);
  // stretch the grid: dense near the seawall, sparse far out (z' = Z_EDGE + 9000 u^2.6), x across ±7 km
  const P = geo.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const u = P.getZ(i) + 0.5, w = P.getX(i);
    P.setXYZ(i, Math.sign(w) * 7000 * Math.pow(Math.abs(w) * 2, 2.2), 0, Z_EDGE + 0.6 + 9000 * Math.pow(u, 2.6));
  }
  geo.computeBoundingSphere();
  const mat = new THREE.ShaderMaterial({
    uniforms: WU, transparent: false,
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uPour; uniform float uWave;
      varying vec3 vW; varying float vMud;
      ${NOISE}
      void main() {
        vec3 p = position;
        float d = p.z - ${Z_EDGE.toFixed(1)};
        // the earth pouring in: a fan of mud spreading from the seawall, and the wave it pushes out
        float L = 10.0 + 260.0 * uPour;
        float on = step(0.001, uPour) * smoothstep(900.0, 500.0, abs(p.x));
        float fan = on * (smoothstep(L * 1.15, L * 0.6, d) * (0.75 + 0.5 * wn(p.xz * 0.04 + vec2(uTime * 0.2, -uTime * 0.5))));
        float wave = uWave > 0.0 ? 7.0 * exp(-pow((d - uWave) / 12.0, 2.0)) * exp(-uWave / 400.0) * smoothstep(1000.0, 500.0, abs(p.x)) : 0.0;
        p.y = ${WATER_Y.toFixed(2)} + fan * (1.0 + 2.5 * exp(-d / 25.0)) + wave;
        vMud = clamp(fan + wave * 0.1 + on * smoothstep(L * 1.6, L, d) * 0.5, 0.0, 1.0);
        vW = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uSun; uniform vec3 uFogC; uniform float uFogD; uniform float uLight; uniform float uPour;
      varying vec3 vW; varying float vMud;
      ${NOISE}
      vec3 sky(vec3 r) {
        float h = clamp(r.y, 0.0, 1.0);
        float az = max(dot(normalize(vec3(r.x, 0.0, r.z)), normalize(vec3(uSun.x, 0.0, uSun.z))), 0.0);
        vec3 low = mix(vec3(0.95, 0.62, 0.42), vec3(1.15, 0.72, 0.4), pow(az, 3.0));
        return mix(low, vec3(0.36, 0.5, 0.74), smoothstep(0.0, 0.5, h));
      }
      void main() {
        vec3 V = normalize(vW - cameraPosition);
        float dist = length(vW - cameraPosition);
        // a sum of small swells and chop; the slopes fade out with distance (no shimmer far off)
        vec2 p = vW.xz;
        vec2 g = vec2(0.0);
        float fade = 1.0 / (1.0 + dist / 900.0);
        for (int i = 0; i < 14; i++) {
          float fi = float(i);
          float a = fi * 2.39996 + 0.4;
          vec2 dir = vec2(cos(a), sin(a) * 0.7 + 0.4);
          float k = 0.06 * pow(1.38, fi);
          float amp = 0.12 / (1.0 + fi * 0.9) * exp(-k * dist * 0.004);
          float ph = dot(p, dir) * k + uTime * sqrt(9.81 * k) + fi * 1.7;
          g += dir * cos(ph) * amp * k;
        }
        g *= fade * 2.2;
        vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 R = reflect(V, N);
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
        // (the bay is a deep blue-green; the low sky it mirrors is pale, so keep the mirror modest)
        vec3 deep = vec3(0.012, 0.075, 0.2);
        vec3 c = mix(deep, sky(R) * 0.6, fres * 0.38);
        // the low Sun's glitter
        float sp = pow(max(dot(R, normalize(uSun)), 0.0), 220.0);
        c += vec3(2.6, 1.6, 0.8) * sp * 1.4 + vec3(1.4, 0.9, 0.5) * pow(max(dot(R, normalize(uSun)), 0.0), 18.0) * 0.12;
        // the mud: churning brown with foam, where the hill pours in
        float churn = wn(p * 0.12 + vec2(uTime * 0.6, -uTime * 0.9)) * 0.6 + wn(p * 0.5 - uTime * 1.3) * 0.4;
        vec3 mud = mix(vec3(0.075, 0.06, 0.04), vec3(0.22, 0.17, 0.11), churn);
        mud = mix(mud, vec3(0.7, 0.66, 0.58), smoothstep(0.72, 0.92, churn) * 0.55);
        c = mix(c, mud, clamp(vMud * 1.6, 0.0, 1.0));
        c *= uLight;
        float fog = 1.0 - exp(-uFogD * uFogD * dist * dist);
        c = mix(c, uFogC, fog * 0.9);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);

  // ---------- across the bay ----------
  const land = new THREE.MeshStandardMaterial({ color: 0x7d7a5c, roughness: 1, flatShading: true });
  const far = new THREE.Group();
  // Alcatraz: a long rock with the cellhouse and the lighthouse, 2.6 km out, straight down the street
  {
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2).scale(160, 32, 380), new THREE.MeshStandardMaterial({ color: 0x6e6a58, roughness: 1, flatShading: true }));
    rock.position.set(-120, WATER_Y - 6, 2650);
    far.add(rock);
    const cell = new THREE.Mesh(new THREE.BoxGeometry(80, 16, 150), new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: 0.9 }));
    cell.position.set(-120, 30, 2640);
    far.add(cell);
    const lh = new THREE.Mesh(new THREE.CylinderGeometry(3, 4, 30, 8), new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.8 }));
    lh.position.set(-150, 44, 2560);
    far.add(lh);
    for (const [x, z, w, h, d] of [[-60, 2520, 40, 10, 30], [-180, 2760, 50, 8, 40], [-90, 2800, 30, 12, 25]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: 0xc9c2b0, roughness: 0.9 }));
      b.position.set(x, 16 + h / 2, z);
      far.add(b);
    }
  }
  // Angel Island and the Marin hills: hazy ridges across the water
  const ridge = (x0, x1, z, hmax, seed, n = 90) => {
    const R = rng(seed);
    const pts = [];
    const nn = [];
    for (let i = 0; i <= n; i++) nn.push(R());
    const g = new THREE.PlaneGeometry(1, 1, n, 1);
    const P2 = g.attributes.position;
    for (let i = 0; i < P2.count; i++) {
      const u = P2.getX(i) + 0.5, top = P2.getY(i) > 0;
      const k = Math.round(u * n);
      const env = Math.sin(Math.PI * u) ** 0.6;
      const h = hmax * env * (0.55 + 0.3 * Math.sin(u * 9 + seed) + 0.15 * nn[k]);
      P2.setXYZ(i, x0 + (x1 - x0) * u, top ? h : WATER_Y - 2, z + (top ? 120 : 0));
    }
    g.computeVertexNormals();
    return new THREE.Mesh(g, land);
  };
  far.add(ridge(-3800, -900, 5600, 240, 3));         // Angel Island
  far.add(ridge(-1500, 6500, 8200, 520, 7, 140));    // the Marin headlands and hills
  far.add(ridge(-9000, -3000, 9500, 420, 11));       // Tiburon, Belvedere
  far.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  scene.add(far);
  return { mesh, u: WU, far };
}

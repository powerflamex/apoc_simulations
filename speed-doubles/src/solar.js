// The solar system: the Sun, the planets on their orbits (distances squeezed so they all fit: r = AU^0.55),
// a fading ring of hot debris where Earth was, and you lapping the Sun. The path widens lap by lap (past Mars,
// Jupiter... Neptune), then every lap takes a new direction until the whole system is wrapped in a ball of light.
import * as THREE from 'three';
import { smooth, clamp, lerp, DEG, rng, keys } from './util.js';
import { makeRings } from './rings.js';
import { mphAt, rateAt, solarPathAU, V_SUN, V_BALL, T_SWITCH, VIDEO_DURATION } from './timeline.js';

export const rv = (au) => Math.pow(au, 0.55);   // squeezed distance on screen
const MI_PER_AU = 9.296e7;
const PLANETS = [
  { name: 'mercury', au: 0.39, r: 0.016, c: 0x9a8f86, ang: 2.1 },
  { name: 'venus', au: 0.72, r: 0.028, c: 0xe3c58e, ang: 4.0 },
  { name: 'mars', au: 1.52, r: 0.022, c: 0xc0603a, ang: 0.9 },
  { name: 'jupiter', au: 5.2, r: 0.075, c: 0xd2b48c, ang: 3.3, bands: true },
  { name: 'saturn', au: 9.54, r: 0.062, c: 0xe2cf9c, ang: 5.4, ring: true },
  { name: 'uranus', au: 19.2, r: 0.045, c: 0x9fd6dc, ang: 1.7 },
  { name: 'neptune', au: 30.1, r: 0.044, c: 0x4f73d6, ang: 0.3 },
];
const EARTH_ANG = 0.0;

export function makeSolar(glowTex) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1080 / 1920, 0.005, 5000);
  const solar = { scene, camera };

  // stars
  {
    const R = rng(12), n = 8000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const d = new THREE.Vector3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1).normalize().multiplyScalar(1800);
      pos.set([d.x, d.y, d.z], i * 3);
      const b = 0.2 + Math.pow(R(), 6) * 3.2, w = R();
      col.set([b * (0.8 + 0.2 * w), b * 0.9, b * (1.0 - 0.25 * w)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const st = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.0, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
    st.frustumCulled = false;
    scene.add(st);
  }
  // the Sun
  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.08, 64, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.6, 2.0) }));
  scene.add(sun);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc070, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(0.7);
  scene.add(halo);
  scene.add(new THREE.PointLight(0xfff0dd, 3.0, 0, 0), new THREE.AmbientLight(0x202838, 0.35));

  // planets and their orbits
  const orbits = makeRings(16, 384);
  orbits.uniforms.uWidth.value = 1.3;
  orbits.uniforms.uColor.value.setRGB(0.45, 0.55, 0.75);
  scene.add(orbits.mesh);
  const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1), O = new THREE.Vector3();
  const planetMeshes = PLANETS.map((p, i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(p.r, 32, 16), new THREE.MeshStandardMaterial({ color: p.c, roughness: 0.9 }));
    const rr = rv(p.au);
    m.position.set(Math.cos(p.ang) * rr, 0, -Math.sin(p.ang) * rr);
    scene.add(m);
    if (p.ring) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(p.r * 1.4, p.r * 2.3, 64), new THREE.MeshBasicMaterial({ color: 0xcdb98a, side: THREE.DoubleSide, transparent: true, opacity: 0.75 }));
      ring.rotation.x = -Math.PI / 2 + 0.45;
      m.add(ring);
    }
    orbits.set(i, O, rr, X, Z, Math.PI * 2, Math.PI * 2, 0.35);
    return m;
  });
  orbits.set(PLANETS.length, O, 1, X, Z, Math.PI * 2, Math.PI * 2, 0.5);   // Earth's orbit
  orbits.count = PLANETS.length + 1;
  orbits.commit();

  // where Earth was: a smear of glowing debris spreading along its orbit
  const debris = (() => {
    const R = rng(3), n = 3000, pos = new Float32Array(n * 3), seed = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { seed.set([R(), R()], i * 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
    const u = { uT: { value: 0 }, uGlow: { value: glowTex } };
    const m = new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `attribute vec2 aSeed; uniform float uT; varying float vA;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main() {
          float spread = (aSeed.x - 0.5) * (0.04 + uT * 0.05);              // along the orbit (radians)
          float rr = 1.0 + (aSeed.y - 0.5) * (0.02 + uT * 0.006);
          float a = ${EARTH_ANG.toFixed(3)} + spread;
          vec3 p = vec3(cos(a) * rr, (fract(aSeed.x * 91.7) - 0.5) * (0.01 + uT * 0.004), -sin(a) * rr);
          vA = exp(-uT * 0.12) * (0.4 + 0.6 * fract(aSeed.y * 37.1));
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = 2.0 + 2.0 * fract(aSeed.x * 13.3);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `varying float vA;
        #include <common>
        #include <logdepthbuf_pars_fragment>
        void main(){
          #include <logdepthbuf_fragment>
          float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
          gl_FragColor = vec4(vec3(1.0, 0.45, 0.15) * vA * (1.0 - d * 2.0) * 2.0, 1.0); }`,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    return { pts, u };
  })();
  scene.add(debris.pts);

  // ---------- your path ----------
  const rings = makeRings(512, 256);
  rings.uniforms.uColor.value.setRGB(1.0, 0.8, 0.58);
  scene.add(rings.mesh);
  // laps run so far (video time), from the speed and the path's radius
  const DV = 1 / 480, VA = V_SUN - 0.5, VB = VIDEO_DURATION + 2;
  const NL = Math.round((VB - VA) / DV) + 1;
  const lapTab = new Float64Array(NL);
  for (let i = 1; i < NL; i++) {
    const v = VA + (i - 0.5) * DV;
    const rMi = solarPathAU(v) * MI_PER_AU * 2 * Math.PI;
    lapTab[i] = lapTab[i - 1] + mphAt(v) * rateAt(v) / 3600 / rMi * DV;
  }
  const lapOf = (v) => { const f = clamp((v - VA) / DV, 0, NL - 1.001), i = Math.floor(f); return lerp(lapTab[i], lapTab[i + 1], f - i); };
  const vOfLap = (L) => { let lo = 0, hi = NL - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (lapTab[m] < L) lo = m; else hi = m; } return VA + lo * DV; };
  // each lap's circle: flat in the plane of the planets at first, then tilting more and more, then any direction
  const bases = [];
  {
    const RB = rng(31);
    const LMAX = Math.ceil(lapOf(VB)) + 2;
    const q = new THREE.Quaternion(), ax = new THREE.Vector3();
    let a = X.clone(), b = Z.clone().negate();
    for (let k = 0; k <= LMAX; k++) {
      bases.push([a.clone(), b.clone(), rv(solarPathAU(vOfLap(k + 0.5)))]);
      const vk = vOfLap(k + 1);
      const wild = smooth(V_SUN + 5.0, V_BALL, vk);
      if (wild > 0) {
        ax.set(RB() * 2 - 1, RB() * 2 - 1, RB() * 2 - 1).normalize();
        q.setFromAxisAngle(ax, lerp(1.5, 80, wild * wild) * DEG);
        a.applyQuaternion(q); b.applyQuaternion(q);
        b.sub(a.clone().multiplyScalar(a.dot(b))).normalize();
      }
    }
  }
  const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe2b0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
  head.renderOrder = 20;
  scene.add(head);
  solar.head = head.position;

  const tmp = new THREE.Vector3();
  solar.frame = (v, s) => {
    debris.u.uT.value = Math.max(0, v - V_SUN + 1.6);
    const L = lapOf(v);
    const lapsPerSec = (lapOf(v + 0.02) - lapOf(v - 0.02)) / 0.04;
    const W = clamp(lapsPerSec * 0.3, 1, 480);
    const k0 = Math.floor(L);
    const Ltrail = Math.max(W, Math.min(L, 1), 0.01);
    const start = L - Ltrail;
    let n = 0;
    const ball = smooth(V_BALL - 1, T_SWITCH, v);
    rings.uniforms.uWidth.value = lerp(2.6, 3.4, ball);
    rings.uniforms.uGain.value = 1.6 + 2.5 * ball;
    for (let k = k0; k >= 0 && n < 480; k--) {
      const segStart = Math.max(k, start), segEnd = Math.min(k + 1, L);
      if (segEnd <= segStart) break;
      const [a, b, r] = bases[Math.min(k, bases.length - 1)];
      const age = L - segEnd;
      const alpha = k === k0 ? 0.999 : clamp(1 - age / Ltrail, 0.05, 1) * 0.9;
      rings.set(n++, O, r, a, b, (segEnd - k) * Math.PI * 2, Math.max((segEnd - segStart) * Math.PI * 2, 0.01), alpha);
    }
    rings.count = n;
    rings.uniforms.uGain.value *= Math.min(1, Math.sqrt(60 / Math.max(n, 1)));
    rings.commit();
    {
      const [a, b, r] = bases[Math.min(k0, bases.length - 1)];
      const phi = (L - k0) * Math.PI * 2;
      head.position.copy(a).multiplyScalar(Math.cos(phi) * r).addScaledVector(b, Math.sin(phi) * r);
      head.scale.setScalar(lerp(0.16, 0.4, smooth(V_SUN, V_BALL, v)));
    }
    // camera: near where Earth was, looking at the Sun; it pulls back as the path widens, and rises above it all
    const dist = keys([[V_SUN, 2.3], [V_SUN + 2.5, 2.6], [V_SUN + 5.5, 7.5], [V_SUN + 7.5, 14], [V_BALL, 17], [T_SWITCH, 12.5], [VIDEO_DURATION + 1, 12]], v, true);
    const elev = keys([[V_SUN, 14], [V_SUN + 4, 22], [V_BALL, 30], [T_SWITCH, 34]], v) * DEG;
    const az = 0.5 + (v - V_SUN) * 0.04;
    camera.position.set(Math.cos(az) * Math.cos(elev) * dist, Math.sin(elev) * dist, -Math.sin(az) * Math.cos(elev) * dist);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.fov = 50;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    halo.scale.setScalar(0.55 + 0.05 * smooth(V_SUN, V_SUN + 6, v) * 10);
  };
  return solar;
}

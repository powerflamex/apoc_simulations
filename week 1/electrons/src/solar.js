// The solar system. The camera rides the blast: it waits by the Sun as the wall of light arrives, then flies to
// Jupiter, Saturn and Neptune in turn, each bursting in close-up as the front sweeps over it; then it pulls back
// to the ball of light, which fills the screen with white.
import * as THREE from 'three';
import { smooth, lerp, rng } from './util.js';
import { V_SOLAR, V_SUNHIT, V_JUP, V_SAT, V_NEP, T_SWITCH, VIDEO_DURATION, PLANETS, tauAt } from './timeline.js';
import { starField, shellMat } from './space.js';

const C = 299792458, AU = 1.496e11;
export const rv = (au) => Math.pow(au, 0.55);   // squeezed distance on screen

export function makeSolarScene(glowTex) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1080 / 1920, 0.002, 20000);
  const S = { scene, camera };
  scene.add(starField(8000, 12));
  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.09, 64, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.6, 2.0) }));
  scene.add(sun);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc070, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(0.6);
  scene.add(halo);
  const sunLight = new THREE.PointLight(0xfff0dd, 3.0, 0, 0);
  scene.add(sunLight, new THREE.AmbientLight(0x202838, 0.35));
  const EARTH = new THREE.Vector3(1, 0, 0);
  const look = {
    jupiter: { c: 0xd2b48c, r: 0.07, bands: true }, saturn: { c: 0xe2cf9c, r: 0.058, ring: true }, neptune: { c: 0x4f73d6, r: 0.042 },
    mercury: { c: 0x9a8f86, r: 0.014 }, venus: { c: 0xe3c58e, r: 0.024 }, mars: { c: 0xc0603a, r: 0.02 }, uranus: { c: 0x9fd6dc, r: 0.042 },
  };
  const orbitMat = new THREE.LineBasicMaterial({ color: 0x5a6f99, transparent: true, opacity: 0.4 });
  const ringLine = (rr) => {
    const pts = [];
    for (let k = 0; k <= 256; k++) { const a = k / 256 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * rr, 0, -Math.sin(a) * rr)); }
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), orbitMat);
  };
  scene.add(ringLine(1));
  // cloud bands for the gas giants
  const bandTex = (() => {
    const c = document.createElement('canvas'); c.width = 4; c.height = 128;
    const g = c.getContext('2d');
    for (let y = 0; y < 128; y++) {
      const t = Math.sin(y * 0.55) * 0.5 + Math.sin(y * 0.17 + 1) * 0.5;
      g.fillStyle = `rgb(${(200 + 40 * t) | 0},${(170 + 40 * t) | 0},${(130 + 30 * t) | 0})`;
      g.fillRect(0, y, 4, 1);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const planets = PLANETS.map((p) => {
    const L = look[p.name], rr = rv(p.au);
    scene.add(ringLine(rr));
    const m = new THREE.Mesh(new THREE.SphereGeometry(L.r, 48, 24), new THREE.MeshStandardMaterial({ color: L.bands || L.ring ? 0xffffff : L.c, map: L.bands || L.ring ? bandTex : null, roughness: 0.9 }));
    m.position.set(Math.cos(p.ang) * rr, 0, -Math.sin(p.ang) * rr);
    if (L.ring) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(L.r * 1.4, L.r * 2.3, 96), new THREE.MeshBasicMaterial({ color: 0xcdb98a, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
      ring.rotation.x = -Math.PI / 2 + 0.45;
      m.add(ring);
    }
    scene.add(m);
    // its burst: a shell of glowing gas in its own colour, and a spray of fragments
    const burst = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), shellMat(L.c));
    burst.position.copy(m.position); burst.visible = false;
    scene.add(burst);
    const R = rng((p.au * 100) | 0), n = 400, dir = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const d = new THREE.Vector3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1).normalize().multiplyScalar(0.4 + R()); dir.set([d.x, d.y, d.z], i * 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
    const fu = { uT: { value: 0 }, uR: { value: L.r }, uCol: { value: new THREE.Color(L.c).lerp(new THREE.Color(0xffffff), 0.4) } };
    const frags = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: fu, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `attribute vec3 aDir; uniform float uT; uniform float uR; varying float vA;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main(){
          vec3 p = aDir * uR * (1.0 + uT * 9.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(60.0 * uR / max(-mv.z, 0.01), 1.5, 6.0);
          vA = exp(-uT * 1.2);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `uniform vec3 uCol; varying float vA;
        #include <common>
        #include <logdepthbuf_pars_fragment>
        void main(){
          #include <logdepthbuf_fragment>
          float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
          gl_FragColor = vec4(uCol * vA * (1.0 - 2.0 * d) * 1.6, 1.0);
        }`,
    }));
    frags.position.copy(m.position); frags.visible = false; frags.frustumCulled = false;
    scene.add(frags);
    return { ...p, ...L, mesh: m, burst, frags, fu, sq: m.position.distanceTo(EARTH) };
  });
  const P = (n) => planets.find((p) => p.name === n);
  const HIT_V = { jupiter: V_JUP, saturn: V_SAT, neptune: V_NEP };
  // the front's on-screen radius for the real distance it has travelled (AU): passes exactly through each planet
  // at the moment it's hit (the squeezed layout isn't to scale, so the radius is keyed planet by planet)
  const KEYS = [[1, 1], [P('jupiter').fromEarth, P('jupiter').sq], [P('saturn').fromEarth, P('saturn').sq], [P('neptune').fromEarth, P('neptune').sq]];
  const frontSq = (au) => {
    if (au <= 1) return au;
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (au <= KEYS[i + 1][0]) {
        const [a0, s0] = KEYS[i], [a1, s1] = KEYS[i + 1];
        return s0 * Math.pow(s1 / s0, Math.log(au / a0) / Math.log(a1 / a0));
      }
    }
    const [a0, s0] = KEYS[KEYS.length - 1];
    return s0 * Math.pow(au / a0, 0.55);
  };
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), shellMat(0xd8e6ff));
  shell.position.copy(EARTH);
  scene.add(shell);
  const sunBurst = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), shellMat(0xffb060));
  scene.add(sunBurst);

  // camera stops: [video time, target, distance]. It looks at each body from the side and a little above, so the
  // front sweeps in across the frame from the Earth side.
  const O = new THREE.Vector3();
  const STOPS = [
    [V_SOLAR, O.clone().lerp(EARTH, 0.5), 2.6], [V_SUNHIT - 1.2, O, 0.75], [V_SUNHIT + 0.9, O, 0.95],
    [V_JUP - 1.3, P('jupiter').mesh.position, 0.42], [V_JUP + 0.7, P('jupiter').mesh.position, 0.6],
    [V_SAT - 1.3, P('saturn').mesh.position, 0.38], [V_SAT + 0.7, P('saturn').mesh.position, 0.55],
    [V_NEP - 1.3, P('neptune').mesh.position, 0.34], [V_NEP + 0.7, P('neptune').mesh.position, 0.6],
    [45.4, O, 26], [T_SWITCH, O, 30], [VIDEO_DURATION + 1, O, 30],
  ];
  const sideDir = (tgt) => {
    const toT = tgt.clone().sub(EARTH);
    if (toT.lengthSq() < 1e-6) toT.set(-1, 0, 0);
    const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), toT).normalize();
    return side.multiplyScalar(0.8).addScaledVector(toT.normalize(), 0.35).add(new THREE.Vector3(0, 0.55, 0)).normalize();
  };
  const camAt = (v) => {
    let i = 0;
    while (i < STOPS.length - 2 && v > STOPS[i + 1][0]) i++;
    const [v0, t0, d0] = STOPS[i], [v1, t1, d1] = STOPS[i + 1];
    const k = smooth(v0, v1, v);
    const tgt = t0.clone().lerp(t1, k);
    const dir = sideDir(t0).lerp(sideDir(t1), k).normalize();
    const d = Math.exp(lerp(Math.log(d0), Math.log(d1), k));
    return { tgt, pos: tgt.clone().addScaledVector(dir, d) };
  };

  S.frame = (v) => {
    const au = C * tauAt(v) / AU;
    shell.scale.setScalar(Math.max(frontSq(au), 0.02));
    shell.material.uniforms.uT.value = v;
    shell.material.uniforms.uA.value = 0.6 + 0.8 * smooth(V_NEP, T_SWITCH, v);
    // the Sun bursts when the front arrives: an expanding orange shell, the core fading
    const sh = smooth(V_SUNHIT - 0.1, V_SUNHIT + 0.15, v);
    sun.scale.setScalar(1 + sh * 1.2);
    sun.visible = v < V_SUNHIT + 0.25;
    sunLight.intensity = 3 * (1 - sh * 0.7);
    halo.scale.setScalar(0.6 * (1 + sh * 0.6) * Math.exp(-Math.max(0, v - V_SUNHIT) * 0.8));
    sunBurst.visible = v > V_SUNHIT;
    sunBurst.scale.setScalar(0.09 + Math.max(0, v - V_SUNHIT) * 0.45);
    sunBurst.material.uniforms.uT.value = v;
    sunBurst.material.uniforms.uA.value = 1.6 * Math.exp(-Math.max(0, v - V_SUNHIT) * 0.35);
    // each planet bursts as the front passes it
    for (const p of planets) {
      const hit = au >= p.fromEarth;
      const since = HIT_V[p.name] !== undefined ? v - HIT_V[p.name] : 0.6;
      p.mesh.visible = !hit || since < 0.12;
      p.mesh.scale.setScalar(hit ? 1 + Math.max(since, 0) * 4 : 1);
      p.burst.visible = p.frags.visible = hit;
      if (hit) {
        p.burst.scale.setScalar(p.r * (1.2 + since * 5));
        p.burst.material.uniforms.uT.value = v;
        p.burst.material.uniforms.uA.value = 1.5 * Math.exp(-since * 0.9);
        p.fu.uT.value = since;
      }
    }
    const c = camAt(v);
    // the wall of light fades out as it sweeps over the camera itself (no full-screen flash)
    const gap = Math.abs(c.pos.distanceTo(EARTH) - frontSq(au));
    shell.material.uniforms.uA.value *= smooth(0.03, 0.35, gap);
    for (const p of planets) if (p.burst.visible) p.burst.material.uniforms.uA.value *= smooth(0.0, 0.15, Math.abs(c.pos.distanceTo(p.mesh.position) - p.burst.scale.x));
    camera.position.copy(c.pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(c.tgt);
    camera.updateMatrixWorld();
  };
  return S;
}

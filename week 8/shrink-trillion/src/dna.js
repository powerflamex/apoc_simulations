// DNA and one of its atoms.
//  DNA (nanometres): a stretch of the double helix, 2 nm thick (as thick as you at 1 billion x), every atom a ball:
//    the two backbones (phosphorus orange, oxygen red, carbon grey) and the rungs between them (the bases, tinted
//    by kind: A green, T pink, G yellow, C blue), 0.34 nm apart. You float beside it.
//  The atom (picometres): one carbon atom of the backbone, right in front of you, swells round you: a glowing cloud
//    ~150 m across at 1 trillion x, almost all empty, its nucleus (~5 fm: a 5 mm grain) glowing at the centre.
//  The stadium: a ghost outline (pitch, stands, floodlights) round the atom, to show its size in the pull-back.
import * as THREE from 'three';
import { procMat } from './mats.js';
import { rng, smooth, lerp } from './util.js';

const ELEM = { P: [1.0, 0.5, 0.08, 0.13], O: [0.92, 0.12, 0.12, 0.1], C: [0.62, 0.64, 0.68, 0.1], N: [0.25, 0.42, 1.0, 0.1] };   // colour, radius (nm)
const BASEC = { A: [0.3, 0.85, 0.35], T: [1.0, 0.42, 0.62], G: [1.0, 0.82, 0.18], C: [0.25, 0.62, 1.0] };
const PAIR = { A: 'T', T: 'A', G: 'C', C: 'G' };

export function makeTiny(scene) {
  const root = new THREE.Group();
  scene.add(root);
  // ---------- DNA ----------
  const dnaG = new THREE.Group();
  root.add(dnaG);
  const atoms = [];
  const R = rng(3);
  const seq = 'GATTACACGTCAGGTACCATGCAATGCGTTAGCAGTCCATGA';
  const NB = seq.length, RISE = 0.34, TW = 34.3 * Math.PI / 180;
  // (angle a, radius r, height y) -> x, y, z ; strand 1's sugar carbon at bp 0 faces -z (you)
  const at = (a, r, y) => new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a));
  let chosen = null;
  for (let i = 0; i < NB; i++) {
    const y = (i - 14) * RISE;
    const a1 = i * TW - Math.PI / 2, a2 = a1 + 2.4;
    for (const [a, base, sgn] of [[a1, seq[i], 1], [a2, PAIR[seq[i]], -1]]) {
      // backbone: phosphate (P + 2 O), sugar ring (4 C + O)
      atoms.push({ e: 'P', p: at(a + 0.18 * sgn, 0.92, y + 0.12 * sgn) });
      atoms.push({ e: 'O', p: at(a + 0.3 * sgn, 1.05, y + 0.2 * sgn) });
      atoms.push({ e: 'O', p: at(a + 0.08 * sgn, 1.06, y + 0.02 * sgn) });
      for (let k = 0; k < 5; k++) {
        const aa = a - 0.1 * sgn + 0.16 * Math.cos(k * 1.2566) / 0.75, rr = 0.72 + 0.11 * Math.sin(k * 1.2566);
        const el = k === 2 ? 'O' : 'C';
        const A_ = { e: el, p: at(aa, rr, y - 0.06 * sgn + 0.08 * Math.sin(k * 1.2566 + 1)) };
        atoms.push(A_);
        if (i === 14 && sgn === 1 && k === 0) chosen = A_;
      }
      // the base: a flat ring reaching toward the middle, tinted by kind
      const n = base === 'A' || base === 'G' ? 9 : 6;
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const rr = lerp(0.58, 0.07, t), aa = a + 0.22 * Math.sin(k * 2.1) * (1 - t);
        atoms.push({ e: k % 3 === 1 ? 'N' : 'C', p: at(aa, rr, y + 0.09 * Math.cos(k * 2.3)), tint: BASEC[base] });
      }
    }
  }
  const sphere = new THREE.SphereGeometry(1, 20, 14);
  {
    const rungM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, emissive: 0x222222 });
    const bar = new THREE.CylinderGeometry(0.075, 0.075, 1, 10);
    const rungs = new THREE.InstancedMesh(bar, rungM, NB * 2 + NB * 2);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(); let k = 0;
    const put = (a, b, col) => { const d = b.clone().sub(a); q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()); m.compose(a.clone().lerp(b, 0.5), q, new THREE.Vector3(1, d.length(), 1)); rungs.setMatrixAt(k, m); rungs.setColorAt(k++, c.setRGB(...col)); };
    for (let i = 0; i < NB; i++) {
      const y = (i - 14) * RISE, a1 = i * TW - Math.PI / 2, a2 = a1 + 2.4;
      const p1 = at(a1, 0.62, y), p2 = at(a2, 0.62, y), mid = p1.clone().lerp(p2, 0.5);
      put(p1, mid, BASEC[seq[i]]); put(mid, p2, BASEC[PAIR[seq[i]]]);
      // the backbones: a bar to the next step on each strand
      if (i < NB - 1) for (const [a, da] of [[a1, 0], [a2, 0]]) put(at(a + 0.12, 0.9, y), at(a + TW + 0.12, 0.9, y + RISE), [1.0, 0.62, 0.2]);
    }
    rungs.count = k;
    dnaG.add(rungs);
    root.userData.rungs = rungs; root.userData.rungM = rungM;
  }
  const atomM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.0, transparent: true, opacity: 1, emissive: 0x111111 });
  atomM.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * 0.22;'); };
  const inst = new THREE.InstancedMesh(sphere, atomM, atoms.length);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  atoms.forEach((A_, i) => {
    const E = ELEM[A_.e];
    const r = E[3];
    m4.makeScale(r, r, r).setPosition(A_.p);
    inst.setMatrixAt(i, m4);
    col.setRGB(...(A_.tint ? A_.tint.map((c, j) => c * 0.75 + E[j] * 0.25) : E.slice(0, 3)));
    if (A_ === chosen) col.setRGB(0.72, 0.74, 0.8);
    inst.setColorAt(i, col);
  });
  inst.castShadow = true; inst.receiveShadow = true;
  dnaG.add(inst);
  // water molecules floating round it (O red + 2 H white), ~0.28 nm
  const water = [];
  {
    const wO = new THREE.MeshStandardMaterial({ color: 0xe8302a, roughness: 0.4, transparent: true });
    const wH = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.4, transparent: true });
    for (let i = 0; i < 70; i++) {
      const g = new THREE.Group();
      const o = new THREE.Mesh(sphere, wO); o.scale.setScalar(0.152); g.add(o);
      for (const s of [-1, 1]) { const h = new THREE.Mesh(sphere, wH); h.scale.setScalar(0.11); h.position.set(s * 0.076, 0.059, 0); g.add(h); }
      let p;
      do { p = new THREE.Vector3((R() - 0.5) * 9, (R() - 0.5) * 12, (R() - 0.5) * 9); } while (Math.hypot(p.x, p.z) < 1.5 || (p.z < -1.5 && Math.abs(p.x) < 2.2 && Math.abs(p.y) < 2.5));
      g.position.copy(p); g.rotation.set(R() * 6, R() * 6, R() * 6);
      dnaG.add(g);
      water.push({ g, p, w: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5) });
    }
  }

  // ---------- the atom: a glowing cloud (ray-marched in a sphere) ----------
  const hazeU = { uC: { value: new THREE.Vector3() }, uR: { value: 1 }, uI: { value: 1 }, uT: { value: 0 } };
  const haze = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.ShaderMaterial({
    uniforms: hazeU, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uC; uniform float uR, uI, uT; varying vec3 vW;
      float h13(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z); }
      void main(){
        vec3 ro = cameraPosition, rd = normalize(vW - cameraPosition);
        vec3 oc = ro - uC; float b = dot(oc, rd), c = dot(oc, oc) - uR * uR, d = b * b - c;
        if (d < 0.0) discard;
        float sq = sqrt(d), t0 = max(0.0, -b - sq), t1 = -b + sq;
        if (t1 <= 0.0) discard;
        vec3 acc = vec3(0.0);
        const int N = 40;
        float dt = (t1 - t0) / float(N);
        for (int i = 0; i < N; i++) {
          float t = t0 + (float(i) + 0.5) * dt;
          vec3 p = (ro + rd * t - uC) / uR;
          float x = length(p);
          // the inner shell (dense, near the nucleus) and the outer one (wide, faint), shimmering
          float inner = exp(-pow(x / 0.1, 2.0)) * 0.9;
          float outer = exp(-pow((x - 0.5) / 0.22, 2.0)) * 0.7 + exp(-x * 3.0) * 0.15;
          float sh = 0.75 + 0.5 * n3(p * 9.0 + vec3(0.0, uT * 0.8, uT * 0.5)) * n3(p * 3.0 - uT * 0.3);
          vec3 cIn = vec3(0.55, 0.65, 1.0), cOut = vec3(0.45, 0.3, 1.0);
          acc += (cIn * inner + cOut * outer * sh) * dt / uR;
        }
        acc *= 1.0 - smoothstep(0.85, 1.0, length(ro + rd * t1 - uC) / uR) * 0.0;
        gl_FragColor = vec4(acc * uI, 1.0);
      }`,
  }));
  haze.frustumCulled = false;
  haze.renderOrder = 5;
  root.add(haze);
  // the nucleus: 6 protons and 6 neutrons (each ~1.7 fm), glowing; a soft glow round it
  const nucG = new THREE.Group();
  root.add(nucG);
  {
    const pM = new THREE.MeshStandardMaterial({ color: 0xff5a3a, emissive: 0xff3a1a, emissiveIntensity: 1.6, roughness: 0.3 });
    const nM = new THREE.MeshStandardMaterial({ color: 0x9fc4ff, emissive: 0x6a9cff, emissiveIntensity: 1.4, roughness: 0.3 });
    const pts = [];
    for (let i = 0; i < 12; i++) { const u = 2 * ((i + 0.5) / 12) - 1, a = i * 2.39996, r = i < 2 ? 0.25 : 1; pts.push(new THREE.Vector3(Math.sqrt(1 - u * u) * Math.cos(a) * r, u * r, Math.sqrt(1 - u * u) * Math.sin(a) * r)); }
    pts.forEach((p, i) => { const m = new THREE.Mesh(sphere, i % 2 ? nM : pM); m.scale.setScalar(0.95); m.position.copy(p).multiplyScalar(1.05); nucG.add(m); });
  }
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d'), g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,250,235,1)'); g.addColorStop(0.08, 'rgba(255,225,170,0.9)'); g.addColorStop(0.3, 'rgba(255,170,110,0.28)'); g.addColorStop(1, 'rgba(255,140,90,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, toneMapped: false }));
  glow.renderOrder = 10;
  root.add(glow);
  const nucLight = new THREE.PointLight(0xffd8a8, 0, 0, 2);
  root.add(nucLight);

  // ---------- the ghost stadium (metres, centred on the atom) ----------
  const stad = new THREE.Group();
  root.add(stad);
  const ghost = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
  const lineM = ghost(new THREE.Color(1.2, 1.2, 1.25), 0.9), standM = ghost(new THREE.Color(0.25, 0.35, 0.7), 0.25), pitchM = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uO: { value: 1 } },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uO; varying vec2 vP;
      float ln(float d){ return 1.0 - smoothstep(0.25, 0.6, abs(d)); }
      void main(){
        vec2 p = vP; vec2 a = abs(p);
        float l = max(ln(a.x - 52.5) * step(a.y, 34.0), ln(a.y - 34.0) * step(a.x, 52.5));
        l = max(l, ln(p.x) * step(a.y, 34.0));
        l = max(l, ln(length(p) - 9.15));
        l = max(l, max(ln(a.x - 36.0) * step(a.y, 20.2) * step(36.0, a.x + 0.6), ln(a.y - 20.2) * step(36.0, a.x) * step(a.x, 52.5)));
        float stripe = step(0.5, fract(p.x / 10.5));
        vec3 g = mix(vec3(0.12, 0.42, 0.16), vec3(0.16, 0.5, 0.2), stripe);
        vec3 col = mix(g, vec3(1.0), l);
        gl_FragColor = vec4(col, uO * mix(0.55, 0.95, l));
      }`,
  });
  const PITCH_Y = -42;
  {
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(112, 76).rotateX(-Math.PI / 2), pitchM);
    pitch.geometry = new THREE.PlaneGeometry(112, 76);
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.y = PITCH_Y;
    stad.add(pitch);
    // the stands: elliptical rings rising outward, a translucent bowl between them, and floodlight masts
    const ring = (ax, az, y, r = 0.7) => {
      const pts = [];
      for (let i = 0; i <= 96; i++) { const a = (i / 96) * Math.PI * 2; pts.push(new THREE.Vector3(ax * Math.cos(a), y, az * Math.sin(a))); }
      return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 192, r, 6, true), lineM);
    };
    const tiers = [[64, 46, PITCH_Y + 1], [78, 60, PITCH_Y + 12], [92, 74, PITCH_Y + 24], [106, 88, PITCH_Y + 36], [118, 100, PITCH_Y + 50]];
    for (const [ax, az, y] of tiers) stad.add(ring(ax, az, y, y === PITCH_Y + 50 ? 1.1 : 0.6));
    {
      const P = [], I = [];
      const NA = 96;
      tiers.forEach(([ax, az, y], k) => { for (let i = 0; i <= NA; i++) { const a = (i / NA) * Math.PI * 2; P.push(ax * Math.cos(a), y, az * Math.sin(a)); } });
      for (let k = 0; k < tiers.length - 1; k++) for (let i = 0; i < NA; i++) { const a = k * (NA + 1) + i, b = a + NA + 1; I.push(a, b, a + 1, b, b + 1, a + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I);
      stad.add(new THREE.Mesh(g, standM));
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const p0 = new THREE.Vector3(64 * Math.cos(a), PITCH_Y + 1, 46 * Math.sin(a)), p1 = new THREE.Vector3(118 * Math.cos(a), PITCH_Y + 50, 100 * Math.sin(a));
      stad.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(p0, p1), 4, 0.4, 5), lineM));
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = sx * 112, z = sz * 92;
      stad.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(x, PITCH_Y, z), new THREE.Vector3(x, PITCH_Y + 95, z)), 4, 0.8, 6), lineM));
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(16, 7, 2), ghost(new THREE.Color(1.6, 1.5, 1.2), 0.9));
      lamp.position.set(x, PITCH_Y + 97, z); lamp.lookAt(0, PITCH_Y, 0);
      stad.add(lamp);
    }
  }
  stad.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.renderOrder = 6; } });

  const chosenP = chosen.p.clone();
  return {
    group: root, dnaG, inst, atomM, haze, hazeU, nucG, glow, nucLight, stad, pitchM, lineM, standM, water, chosenP,
    // P: where the atom's centre is (your metres); S: how many times smaller you are
    frame(v, S, P) {
      const uN = S * 1e-9, uP = S * 1e-12;
      dnaG.scale.setScalar(uN);
      dnaG.position.copy(P).addScaledVector(chosenP, -uN);
      dnaG.rotation.set(0, 0, 0);
      // the DNA turns slowly about its own axis (round the chosen atom, so the atom stays put)
      const t = v - 33.2;
      for (const w of water) { w.g.position.copy(w.p).addScaledVector(w.w, t * 0.25); w.g.rotation.x += 0; w.g.rotation.y = t * 0.4 + w.p.x; }
      // the atom swells: the ball fades into the cloud; the rest of the DNA fades away
      const swell = smooth(36.9, 38.3, v);
      atomM.opacity = 1 - smooth(36.8, 37.45, v);
      this.group.userData.rungM.transparent = true; this.group.userData.rungM.opacity = atomM.opacity;
      dnaG.visible = atomM.opacity > 0.01;
      water.forEach((w) => w.g.children.forEach((m) => { m.material.opacity = atomM.opacity; }));
      const Ratom = 77 * uP;               // 77 pm
      haze.position.copy(P); haze.scale.setScalar(Ratom);
      hazeU.uC.value.copy(P); hazeU.uR.value = Ratom; hazeU.uT.value = v;
      hazeU.uI.value = 1.1 * swell;
      haze.visible = swell > 0.001;
      // the nucleus (2.7 fm radius; protons and neutrons ~0.85 fm)
      nucG.position.copy(P); nucG.scale.setScalar(0.00105 * uP);
      nucG.visible = v > 37.5;
      return { swell, Ratom };
    },
  };
}

// Inside your head: the cutaways where the picture shows what you're thinking, drawn in white neon on black. Each is
// its own small world with its own camera, built once; main.js renders this scene instead of the plaza during
// CUTS (timeline.js). Bright colours (> 1) bloom into glow.
//   math    the Riemann hypothesis: the zeta function's spiral drawing itself, every loop passing through zero as
//           the zeros light up along the critical line; equations writing themselves around it; SOLVED
//   cells   inside the blood: cancer cells, and the protein you designed hunting them down; they burst
//   fusion  a tokamak: magnetic coils round a ring of plasma that swirls brighter until it ignites (a star)
//   space   the rocket you designed leaves Earth, and arrives at Mars
//   brain   your brain, glowing, overheating at 20,000 watts
//   cosmos  everything at once: a galaxy, atoms, DNA, equations, all joined in one web of light
import * as THREE from 'three';
import { rng, smooth, clamp, lerp } from './util.js';

const WHITE = (k = 3) => new THREE.Color(k * 0.5, k * 0.5, k * 0.54);   // (halved: the bloom does the rest)
const neon = (c, opacity = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });

// a tube through points
function tube(points, radius, mat, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, points.length * 3), radius, 6, closed), mat);
  return m;
}
// glowing text on a plane (canvas texture)
function textPlane(str, height, { color = '#ffffff', font = "italic 500 120px 'Cambria Math', Cambria, Georgia, serif", glow = '#9fd8ff' } = {}) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = font;
  const w = Math.ceil(g.measureText(str).width) + 80;
  c.width = w; c.height = 200;
  g.font = font; g.textBaseline = 'middle'; g.textAlign = 'center';
  g.shadowColor = glow; g.shadowBlur = 30; g.fillStyle = color;
  g.fillText(str, w / 2, 100); g.shadowBlur = 10; g.fillText(str, w / 2, 100);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(1.2, 1.2, 1.3) });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(height * w / 200, height), mat);
  return m;
}
// the build of a tube: show only the first k of it (TubeGeometry is laid out along its length)
function growTube(mesh, k) {
  const g = mesh.geometry, per = 6 * 6;   // indices per tubular segment (radial segments 6 -> 6 quads x 6 indices)
  const n = g.index.count / per;
  g.setDrawRange(0, Math.floor(clamp(k) * n) * per);
}

// ---------- the zeta function on the critical line (Dirichlet eta, averaged partial sums) ----------
function zetaHalf(t) {
  // eta(s) = sum (-1)^(n-1) n^-s, s = 1/2 + it; zeta = eta / (1 - 2^(1-s))
  const N = 1400;
  let re = 0, im = 0, pre = 0, pim = 0;
  for (let n = 1; n <= N; n++) {
    const a = Math.pow(n, -0.5), th = -t * Math.log(n), sg = n % 2 ? 1 : -1;
    pre = re; pim = im;
    re += sg * a * Math.cos(th); im += sg * a * Math.sin(th);
  }
  re = (re + pre) / 2; im = (im + pim) / 2;
  // 1 - 2^(1-s) = 1 - sqrt2 * 2^(-it) = 1 - sqrt2 (cos(t ln2) - i sin(t ln2))
  const c = Math.cos(t * Math.LN2), s = Math.sin(t * Math.LN2);
  const dr = 1 - Math.SQRT2 * c, di = Math.SQRT2 * s;
  const den = dr * dr + di * di;
  return [(re * dr + im * di) / den, (im * dr - re * di) / den];
}
export const ZEROS = [14.1347, 21.022, 25.0109, 30.4249, 32.9351, 37.5862];

export function makeMind(CUT) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020308);
  scene.fog = new THREE.FogExp2(0x020308, 0.02);
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 2000);
  camera.rotation.order = 'YXZ';
  const amb = new THREE.HemisphereLight(0x8090c0, 0x101018, 0.6);
  const key = new THREE.PointLight(0xffffff, 40, 60);
  scene.add(amb, key);
  // dust of light everywhere (depth)
  {
    const r = rng(9), n = 2500, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { p[i * 3] = (r() - 0.5) * 120; p[i * 3 + 1] = (r() - 0.5) * 70; p[i * 3 + 2] = (r() - 0.5) * 120; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: new THREE.Color(0.7, 0.75, 0.95), size: 0.06, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })));
  }
  const groups = {};

  // ---------------- math ----------------
  {
    const g = new THREE.Group(); groups.math = g;
    // the spiral: zeta(1/2 + it) for t = 0..40, scaled
    const P = [];
    for (let i = 0; i <= 900; i++) { const t = i / 900 * 40; const [x, y] = zetaHalf(t); P.push(new THREE.Vector3(x * 2.2, y * 2.2, -t * 0.12)); }
    const sp = tube(P, 0.045, neon(WHITE(3.2)));
    g.add(sp);
    // the axes and the origin
    const axM = neon(new THREE.Color(0.6, 0.8, 1.4), 0.6);
    g.add(tube([new THREE.Vector3(-4, 0, 0), new THREE.Vector3(8, 0, 0)], 0.012, axM), tube([new THREE.Vector3(0, -6, 0), new THREE.Vector3(0, 6, 0)], 0.012, axM));
    const origin = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), neon(new THREE.Color(2, 1.5, 0.6)));
    g.add(origin);
    // the critical strip, off to the right: a glowing band with the line Re = 1/2, the zeros lighting up on it
    const strip = new THREE.Group();
    strip.position.set(10.5, -5, -3);
    const band = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 13), neon(new THREE.Color(0.12, 0.18, 0.4), 0.35));
    band.position.y = 6.5; strip.add(band);
    strip.add(tube([new THREE.Vector3(0, 0, 0.01), new THREE.Vector3(0, 13, 0.01)], 0.03, neon(new THREE.Color(0.8, 1, 1.6))));
    const zeroDots = ZEROS.map((z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), neon(new THREE.Color(2, 1.6, 0.6))); m.position.set(0, z * 0.32, 0.05); strip.add(m); return m; });
    const lab = textPlane('Re(s) = ½', 0.7); lab.position.set(0, 13.8, 0); strip.add(lab);
    g.add(strip);
    // equations writing themselves around it
    const EQ = ['ζ(s) = Σ 1/nˢ', 'ζ(s) = 2ˢπˢ⁻¹ sin(πs/2) Γ(1−s) ζ(1−s)', 'ζ(½ + it) = 0', 'π(x) ≈ Li(x)', '∏ (1 − p⁻ˢ)⁻¹', 'Re(ρ) = ½ ?'];
    const eqs = EQ.map((e, i) => { const m = textPlane(e, 0.9); const a = i / EQ.length * Math.PI * 2; m.position.set(Math.cos(a) * 9, Math.sin(a) * 4.5 + 1, -4 - (i % 3) * 2); g.add(m); return m; });
    const solved = textPlane('SOLVED', 2.6, { font: "700 150px 'Cormorant', Georgia, serif", color: '#ffe9b0', glow: '#ffbf40' });
    solved.position.set(2, 0.5, 2.5); g.add(solved);
    g.userData = { sp, P, zeroDots, eqs, solved, origin };
  }
  // ---------------- cells ----------------
  {
    const g = new THREE.Group(); groups.cells = g;
    const r = rng(31);
    const cellGeo = new THREE.IcosahedronGeometry(1, 4);
    // lumpy cancer cells
    const pos = cellGeo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); const k = 1 + 0.12 * Math.sin(v.x * 7) * Math.sin(v.y * 6) * Math.sin(v.z * 5); v.multiplyScalar(k); pos.setXYZ(i, v.x, v.y, v.z); }
    cellGeo.computeVertexNormals();
    const cellMat = new THREE.MeshStandardMaterial({ color: 0x6a2a6e, roughness: 0.5, emissive: new THREE.Color(0.18, 0.02, 0.15) });
    const cells = [];
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(cellGeo, cellMat.clone());
      m.position.set((r() - 0.5) * 14, (r() - 0.5) * 7, -4 - r() * 10);
      m.scale.setScalar(1.1 + r() * 0.9);
      m.userData = { s: m.scale.x, hit: 0.15 + i * 0.07 + r() * 0.05, rot: r() * 6 };
      g.add(m); cells.push(m);
    }
    // red blood cells drifting (discs)
    const rbc = new THREE.InstancedMesh(new THREE.TorusGeometry(0.45, 0.22, 8, 16), new THREE.MeshStandardMaterial({ color: 0x8a1010, roughness: 0.6, emissive: new THREE.Color(0.25, 0.02, 0.02) }), 60);
    const rb = [];
    for (let i = 0; i < 60; i++) rb.push([(r() - 0.5) * 30, (r() - 0.5) * 14, -2 - r() * 20, r() * 6, r() * 6]);
    g.add(rbc);
    // the proteins: glowing white sparks streaming in from behind you, each to a cell
    const prot = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.07, 0), neon(WHITE(1.6)), 180);
    const pr = [];
    for (let i = 0; i < 180; i++) pr.push({ c: i % cells.length, t0: r() * 0.55, ox: (r() - 0.5) * 3, oy: (r() - 0.5) * 3 });
    g.add(prot);
    // bursts
    const burst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.08, 6, 4), neon(new THREE.Color(1.4, 0.6, 1.3)), cells.length * 30);
    const bdir = []; for (let i = 0; i < cells.length * 30; i++) bdir.push(new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize());
    g.add(burst);
    const bloodFog = new THREE.Color(0x1a0204);
    g.userData = { cells, rbc, rb, prot, pr, burst, bdir, bloodFog };
  }
  // ---------------- fusion ----------------
  {
    const g = new THREE.Group(); groups.fusion = g;
    const R = 6, r0 = 1.7;
    const coilM = neon(WHITE(1.1));
    for (let k = 0; k < 18; k++) {
      const a = k / 18 * Math.PI * 2;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r0 * 1.4, 0.06, 6, 32), coilM);
      ring.position.set(Math.cos(a) * R, 0, Math.sin(a) * R);
      ring.rotation.y = -a;
      g.add(ring);
    }
    // the vessel's outline
    g.add(new THREE.Mesh(new THREE.TorusGeometry(R, r0 * 1.7, 12, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.6, 1.2), wireframe: true, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false })));
    // the plasma: a swirling torus shader, getting brighter until it ignites
    const plasmaMat = new THREE.ShaderMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      uniforms: { uT: { value: 0 }, uI: { value: 0 } },
      vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform float uT, uI; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){ float sw = 0.5 + 0.5*sin(vUv.x*60.0 - uT*8.0 + sin(vUv.y*6.28)*3.0);
          float f = pow(1.0 - abs(dot(vN, vV)), 1.5);
          vec3 c = mix(vec3(0.35,0.08,0.4), vec3(1.0,0.8,1.1), uI) * (0.35 + 0.65*sw) * (0.4 + 0.6*f + 0.3*uI);
          gl_FragColor = vec4(min(c * (0.3 + 0.7*uI), vec3(3.0)), 1.0); }`,
    });
    const plasma = new THREE.Mesh(new THREE.TorusGeometry(R, r0 * 0.75, 24, 96).rotateX(Math.PI / 2), plasmaMat);
    g.add(plasma);
    const star = new THREE.Mesh(new THREE.SphereGeometry(0.8, 24, 16), neon(new THREE.Color(2.4, 2.1, 1.6)));
    g.add(star);
    g.userData = { plasmaMat, star };
  }
  // ---------------- space: Earth -> Mars ----------------
  {
    const g = new THREE.Group(); groups.space = g;
    const planet = (rad, a, b, seed) => new THREE.Mesh(new THREE.SphereGeometry(rad, 64, 48), new THREE.ShaderMaterial({
      uniforms: { uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) }, uSeed: { value: seed }, uSun: { value: new THREE.Vector3(1, 0.3, 0.4).normalize() } },
      vertexShader: `varying vec3 vP; varying vec3 vN; void main(){ vP = position; vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform vec3 uA, uB, uSun; uniform float uSeed; varying vec3 vP; varying vec3 vN;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
        float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
        void main(){ vec3 p = normalize(vP)*3.0 + uSeed; float n = n3(p)*0.5 + n3(p*2.1)*0.3 + n3(p*4.3)*0.2;
          vec3 c = mix(uA, uB, smoothstep(uSeed < 2.0 ? 0.56 : 0.45, uSeed < 2.0 ? 0.62 : 0.55, n)); float l = max(dot(vN, uSun), 0.0);
          gl_FragColor = vec4(c * (0.06 + 1.2*l) + vec3(0.2,0.4,0.9)*pow(1.0-abs(vN.z),3.0)*0.0, 1.0); }`,
    }));
    const earth = planet(40, 0x123c86, 0x5a6e3a, 1.0); earth.position.set(22, -50, -38);
    const mars = planet(18, 0xb4532a, 0x7a3418, 4.0); mars.position.set(900, 20, -900);
    g.add(earth, mars);
    const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(Array.from({ length: 6000 }, () => (Math.random() - 0.5) * 3000), 3)), new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: false }));
    g.add(stars);
    const rocket = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4, metalness: 0.2 });
    rocket.add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 5, 16), body));
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.6, 16), body); nose.position.y = 3.3; rocket.add(nose);
    for (let k = 0; k < 4; k++) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.9), body); fin.position.set(Math.cos(k * Math.PI / 2) * 0.7, -2.1, Math.sin(k * Math.PI / 2) * 0.7); fin.rotation.y = -k * Math.PI / 2; rocket.add(fin); }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.55, 4, 16, 1, true).rotateX(Math.PI).translate(0, -4.5, 0), neon(new THREE.Color(1.2, 0.65, 0.22)));
    rocket.add(flame);
    rocket.rotation.z = -Math.PI / 2;
    g.add(rocket);
    const sun = new THREE.DirectionalLight(0xffffff, 3); sun.position.set(1, 0.3, 0.4); g.add(sun);
    // the neon path from Earth to Mars
    const path = []; for (let i = 0; i <= 80; i++) { const u = i / 80; path.push(new THREE.Vector3(lerp(0, 900, u), lerp(0, 20, u) + Math.sin(u * Math.PI) * 120, lerp(-10, -900, u))); }
    const pathM = tube(path, 0.12, neon(new THREE.Color(0.5, 0.75, 1.3), 0.5));
    g.add(pathM);
    g.userData = { rocket, flame, earth, mars, path, pathM };
  }
  // ---------------- brain ----------------
  {
    const g = new THREE.Group(); groups.brain = g;
    const mk = (side) => {
      const geo = new THREE.SphereGeometry(1, 96, 64);
      const p = geo.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const fold = 0.05 * Math.sin(v.x * 18 + Math.sin(v.y * 9) * 2) * Math.sin(v.z * 15 + Math.cos(v.x * 7) * 2) + 0.03 * Math.sin(v.y * 31 + v.z * 9);
        v.multiplyScalar(1 + fold);
        v.x = v.x * 0.55 + side * 0.58; v.y *= 0.8; v.z *= 1.15;
        p.setXYZ(i, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();
      return geo;
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: { uHeat: { value: 0 }, uT: { value: 0 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP = position; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform float uHeat, uT; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.0);
          float folds = 0.5 + 0.5*sin(vP.x*40.0 + vP.y*20.0 + uT*(1.0+6.0*uHeat));
          vec3 cool = vec3(0.45,0.65,1.4), hot = vec3(1.9,0.5,0.12);
          vec3 c = mix(cool, hot, uHeat);
          gl_FragColor = vec4(c*(0.15 + 0.6*f + 0.35*folds*(0.3+0.7*uHeat)), 1.0); }`,
    });
    g.add(new THREE.Mesh(mk(-1), mat), new THREE.Mesh(mk(1), mat));
    // the firing: sparks running along the surface
    const r = rng(5), n = 400, pts = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const a = r() * 6.28, b = Math.acos(2 * r() - 1); pts[i * 3] = Math.sin(b) * Math.cos(a) * 1.15; pts[i * 3 + 1] = Math.cos(b) * 0.9; pts[i * 3 + 2] = Math.sin(b) * Math.sin(a) * 1.3; }
    const sp = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pts, 3)), new THREE.PointsMaterial({ color: new THREE.Color(1.6, 1.6, 1.8), size: 0.035, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(sp);
    const watts = textPlane('20,000 W', 0.5, { font: "700 140px 'Cormorant', Georgia, serif", color: '#ffd0b0', glow: '#ff6020' });
    watts.position.set(0, 1.25, 0.4); g.add(watts);
    g.userData = { mat, sp };
  }
  // ---------------- cosmos ----------------
  {
    const g = new THREE.Group(); groups.cosmos = g;
    const r = rng(77);
    // a spiral galaxy of points
    const n = 9000, p = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const arm = i % 3, d = Math.pow(r(), 0.6) * 14, a = d * 0.45 + arm * 2.094 + (r() - 0.5) * 0.5;
      p[i * 3] = Math.cos(a) * d; p[i * 3 + 1] = (r() - 0.5) * 0.6 * (1 - d / 16); p[i * 3 + 2] = Math.sin(a) * d;
      const w = 1 - d / 14; col[i * 3] = 0.8 + 0.8 * w; col[i * 3 + 1] = 0.7 + 0.6 * w; col[i * 3 + 2] = 0.9 + 0.2 * w;
    }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(p, 3)); gg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const gal = new THREE.Points(gg, new THREE.PointsMaterial({ size: 0.07, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    gal.position.set(0, -3, -16); gal.rotation.x = 0.5;
    g.add(gal);
    // atoms
    const atoms = [];
    for (let k = 0; k < 5; k++) {
      const at = new THREE.Group();
      at.add(new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), neon(new THREE.Color(2, 1.5, 0.7))));
      for (let j = 0; j < 3; j++) { const o = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.012, 6, 64), neon(WHITE(2.4))); o.rotation.set(j * 1.05, j * 0.6, 0); at.add(o); }
      at.position.set((r() - 0.5) * 16, (r() - 0.5) * 6 + 1, -4 - r() * 8);
      g.add(at); atoms.push(at);
    }
    // a DNA helix
    const A = [], B = [];
    for (let i = 0; i <= 80; i++) { const u = i / 80, t = u * Math.PI * 8; A.push(new THREE.Vector3(Math.cos(t) * 0.6 - 6, u * 8 - 3, Math.sin(t) * 0.6 - 5)); B.push(new THREE.Vector3(-Math.cos(t) * 0.6 - 6, u * 8 - 3, -Math.sin(t) * 0.6 - 5)); }
    g.add(tube(A, 0.04, neon(WHITE(2.8))), tube(B, 0.04, neon(WHITE(2.8))));
    // equations
    for (const [s, x, y, z] of [['E = mc²', 5, 3, -6], ['iℏ ∂ψ/∂t = Ĥψ', -3, 4.5, -8], ['Gμν + Λgμν = 8πG Tμν', 4, -2, -9], ['F = Gm₁m₂ / r²', -7, -1.5, -7]]) { const m = textPlane(s, 0.8); m.position.set(x, y, z); g.add(m); }
    // the web joining it all
    const web = [];
    const nodes = atoms.map((a) => a.position.clone()).concat([new THREE.Vector3(0, -3, -16), new THREE.Vector3(-6, 1, -5), new THREE.Vector3(5, 3, -6), new THREE.Vector3(-3, 4.5, -8), new THREE.Vector3(4, -2, -9), new THREE.Vector3(-7, -1.5, -7)]);
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) if (r() < 0.45) web.push(tube([nodes[i], nodes[j]], 0.02, neon(new THREE.Color(1.6, 1.2, 0.45), 0.8)));
    web.forEach((w) => g.add(w));
    g.userData = { gal, atoms, web };
  }

  for (const k in groups) { groups[k].visible = false; scene.add(groups[k]); }
  const v3 = new THREE.Vector3(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0);

  return {
    scene, camera,
    // which: the cut's kind; u: 0..1 through the cut; v: the video clock
    frame(which, u, v) {
      for (const k in groups) groups[k].visible = k === which;
      scene.fog.color.set(0x020308); scene.background.set(0x020308); scene.fog.density = 0.02;
      key.position.set(0, 4, 6);
      const G = groups[which] && groups[which].userData;
      camera.fov = 50;
      if (which === 'math') {
        // the spiral draws itself; each zero lights when the path passes through the origin
        const tNow = u * 40 * 1.05;
        growTube(G.sp, tNow / 40);
        G.zeroDots.forEach((d, i) => { const on = smooth(ZEROS[i] - 0.2, ZEROS[i] + 0.4, tNow); d.scale.setScalar(0.3 + on * (1 + 0.6 * Math.exp(-(tNow - ZEROS[i]) * 2))); d.material.opacity = on; });
        const nearZero = ZEROS.reduce((a, z) => Math.max(a, Math.exp(-Math.pow((tNow - z) / 0.5, 2))), 0);
        G.origin.scale.setScalar(1 + 2.5 * nearZero);
        G.eqs.forEach((e, i) => { e.material.opacity = smooth(0.05 + i * 0.1, 0.15 + i * 0.1, u) * (1 - smooth(0.86, 0.92, u)); });
        G.solved.material.opacity = smooth(0.88, 0.93, u); G.solved.scale.setScalar(0.9 + 0.1 * smooth(0.88, 1, u));
        // the camera: in along the spiral, round to the strip, back out to SOLVED
        const a = lerp(-0.5, 0.9, u);
        camera.position.set(Math.sin(a) * 12 + 2, 1.5 + 2 * Math.sin(u * 3), Math.cos(a) * 12 - 1);
        camera.lookAt(lerp(1, 4, smooth(0.5, 0.8, u)), 0.5, lerp(-2, 0, u));
      } else if (which === 'cells') {
        scene.background.copy(G.bloodFog); scene.fog.color.copy(G.bloodFog); scene.fog.density = 0.06;
        G.rb.forEach((b, i) => { v3.set(b[0] + Math.sin(v * 0.3 + b[3]) * 0.5 + u * 2, b[1] + Math.cos(v * 0.25 + b[4]) * 0.4, b[2]); q.setFromEuler(new THREE.Euler(b[3] + v * 0.2, b[4], 0)); m4.compose(v3, q, sc.set(1, 1, 1)); G.rbc.setMatrixAt(i, m4); });
        G.rbc.instanceMatrix.needsUpdate = true;
        // proteins fly from behind the camera to their cell; the cell shrinks and bursts after its hits
        G.pr.forEach((p, i) => {
          const c = G.cells[p.c], k = clamp((u - p.t0) / 0.3);
          if (k <= 0 || k >= 1 || c.userData.dead) { G.prot.setMatrixAt(i, zero); return; }
          v3.set(lerp(p.ox, c.position.x, k), lerp(p.oy, c.position.y, k), lerp(1, c.position.z, k));
          m4.compose(v3, q.identity(), sc.setScalar(1)); G.prot.setMatrixAt(i, m4);
        });
        G.prot.instanceMatrix.needsUpdate = true;
        G.cells.forEach((c, ci) => {
          const d = c.userData, k = smooth(d.hit + 0.15, d.hit + 0.32, u);
          c.scale.setScalar(d.s * (1 - 0.85 * k) * (1 + 0.04 * Math.sin(v * 3 + d.rot)));
          c.visible = k < 0.98;
          c.rotation.set(v * 0.1 + d.rot, v * 0.13, 0);
          c.material.emissive.setRGB(0.18 + 0.5 * smooth(d.hit, d.hit + 0.2, u), 0.02 + 0.25 * smooth(d.hit, d.hit + 0.2, u), 0.15 + 0.4 * smooth(d.hit, d.hit + 0.2, u));
          const bk = clamp((u - d.hit - 0.3) / 0.12);
          for (let j = 0; j < 30; j++) {
            const idx = ci * 30 + j;
            if (bk <= 0 || bk >= 1) { G.burst.setMatrixAt(idx, zero); continue; }
            v3.copy(G.bdir[idx]).multiplyScalar(bk * 4 * d.s).add(c.position);
            m4.compose(v3, q.identity(), sc.setScalar(1 - bk)); G.burst.setMatrixAt(idx, m4);
          }
        });
        G.burst.instanceMatrix.needsUpdate = true;
        camera.position.set(Math.sin(u * 1.2) * 2, 0.5, 8 - u * 6);
        camera.lookAt(0, 0, -8);
      } else if (which === 'fusion') {
        G.plasmaMat.uniforms.uT.value = v; G.plasmaMat.uniforms.uI.value = smooth(0.15, 0.85, u);
        G.star.scale.setScalar(0.2 + 2.2 * smooth(0.7, 0.95, u));
        G.star.material.opacity = smooth(0.65, 0.8, u);
        const a = u * 2.2 + 0.3;
        camera.position.set(Math.cos(a) * 11, 2.5 + 3 * (1 - u), Math.sin(a) * 11);
        camera.lookAt(0, 0, 0);
      } else if (which === 'space') {
        // leaving Earth (first half), then a jump to arriving at Mars
        const P = G.path, k = u < 0.5 ? smooth(0, 0.5, u) * 0.025 : 0.9 + 0.065 * smooth(0.5, 1, u);
        const i = Math.min(P.length - 2, Math.floor(k * (P.length - 1))), f = k * (P.length - 1) - i;
        const pos = P[i].clone().lerp(P[i + 1], f), nxt = P[Math.min(P.length - 1, i + 2)];
        G.rocket.position.copy(pos);
        G.rocket.lookAt(nxt); G.rocket.rotateX(Math.PI / 2);
        G.flame.scale.set(1, 1 + 0.2 * Math.sin(v * 40), 1);
        G.pathM.visible = false;
        if (u < 0.5) { camera.position.copy(pos).add(v3.set(-20, 2, 28)); camera.lookAt(lerp(pos.x, 22, 0.25), lerp(pos.y, -10, 0.25), lerp(pos.z, -38, 0.25)); camera.fov = 58; }
        else {
          // from the side and a little behind, Mars filling the far half of the frame
          const dir = P[i + 1].clone().sub(P[i]).normalize(), side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
          camera.position.copy(pos).addScaledVector(side, 11).addScaledVector(dir, -7).add(v3.set(0, 3, 0));
          camera.lookAt(pos.clone().addScaledVector(dir, 14));
        }
        if (u >= 0.5) camera.fov = 45;
      } else if (which === 'brain') {
        const heat = smooth(0.1, 0.9, u);
        G.mat.uniforms.uHeat.value = heat; G.mat.uniforms.uT.value = v;
        G.sp.material.size = 0.035 + 0.03 * heat;
        const a = u * 1.5 - 0.4;
        camera.position.set(Math.sin(a) * 3.6, 0.6, Math.cos(a) * 3.6);
        camera.lookAt(0, -0.1, 0);
      } else if (which === 'cosmos') {
        G.gal.rotation.y = v * 0.08;
        G.atoms.forEach((a, i) => { a.rotation.set(v * (0.5 + i * 0.1), v * 0.7, 0); });
        G.web.forEach((w, i) => { w.material.opacity = smooth(0.3 + i * 0.012, 0.36 + i * 0.012, u); });
        camera.position.set(Math.sin(u * 0.8) * 4, 1 + u * 2, 10 - u * 8);
        camera.lookAt(0, 0, -8);
      }
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
    },
  };
}

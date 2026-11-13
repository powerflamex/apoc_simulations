// The dew drop and what lives in it (built in micrometres, real origin = your feet).
// The drop (3.2 mm across) hangs on the tall blade leaning over you, slides off, falls and lands over you; then you
// are inside it: its surface a bright silvery dome overhead, sunlight drawing caustics on the ground. In the water:
// a paramecium (~250 µm, a one-celled creature) swimming past with its fringe of beating hairs, glassy diatoms on the
// ground, green algae and specks of grit drifting round you.
import * as THREE from 'three';
import { procMat, ellipsoid } from './mats.js';
import { rng, smooth, lerp, clamp, keys } from './util.js';
import { T_DROP } from './timeline.js';

export const DROP_R = 1600;
// the drop's centre (µm): on the blade, sliding down it, falling, landed (it spreads a little and wobbles)
const DROP_K = [[0, [-2000, 3450, 3000]], [T_DROP[0], [-2000, 3450, 3000]], [T_DROP[0] + 0.8, [-1850, 3150, 2700]], [T_DROP[1], [-250, 950, 650]], [99, [-250, 950, 650]]];
export function dropAt(v, out = new THREE.Vector3()) {
  const k = [0, 1, 2].map((i) => {
    const list = DROP_K.map(([t, p]) => [t, p[i]]);
    // the fall accelerates (no easing at the bottom)
    if (v > T_DROP[0] + 0.8 && v < T_DROP[1]) { const u = (v - T_DROP[0] - 0.8) / (T_DROP[1] - T_DROP[0] - 0.8); return lerp(list[2][1], list[3][1], u * u); }
    return keys(list, v);
  });
  return out.set(...k);
}

export function makeDrop(scene) {
  const G = new THREE.Group();
  scene.add(G);
  const R = rng(17);
  // ---------- the water: a sphere with a fresnel sheen; from inside, a bright dome ----------
  const wU = { uSun: { value: new THREE.Vector3(-0.35, 0.8, -0.5).normalize() }, uIn: { value: 0 }, uT: { value: 0 } };
  const water = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.ShaderMaterial({
    uniforms: wU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun; uniform float uIn, uT; varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 V = normalize(cameraPosition - vW);
        vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
        float c = clamp(dot(N, V), 0.0, 1.0);
        float fr = 0.03 + 0.97 * pow(1.0 - c, 5.0);
        vec3 R = reflect(-V, N);
        vec3 sky = mix(vec3(0.62, 0.8, 0.95), vec3(0.95, 0.98, 1.0), smoothstep(-0.2, 0.8, R.y));
        float spec = pow(max(dot(R, uSun), 0.0), 300.0) * 6.0 + pow(max(dot(R, uSun), 0.0), 20.0) * 0.4;
        vec3 col; float a;
        if (gl_FrontFacing) {   // from outside: a clear lens of water, bright rim, the Sun's glint
          col = sky * fr + vec3(0.85, 0.95, 1.0) * 0.12 + vec3(1.0) * spec;
          a = clamp(0.18 + fr * 0.8 + spec, 0.0, 1.0);
        } else {                // from inside: the underside of the surface, bright toward the rim (total reflection)
          float tir = smoothstep(0.55, 0.85, 1.0 - c);
          float rip = 0.5 + 0.5 * sin(dot(vW, vec3(0.7, 0.2, 0.5)) * 0.002 + uT * 1.5);
          col = mix(vec3(0.7, 0.9, 1.0), vec3(1.0), tir) * (0.75 + 0.2 * rip) + vec3(1.0) * spec * 0.5;
          a = mix(0.35, 0.85, tir);
        }
        gl_FragColor = vec4(col, a);
      }`,
  }));
  water.renderOrder = 4;
  water.frustumCulled = false;
  G.add(water);

  // ---------- the paramecium ----------
  const para = new THREE.Group();
  {
    const bodyM = procMat({ color: 0x9fdc9a, rough: 0.35, transparent: true, opacity: 0.94, physical: { clearcoat: 0.6, clearcoatRoughness: 0.3 },
      col: `c *= 0.82 + 0.25 * n3(vOP * 0.06); c = mix(c, vec3(0.55, 0.75, 0.5), smoothstep(0.55, 0.9, n3(vOP * 0.02 + 3.0)) * 0.4);`,
      height: 'n3(vOP * 0.25) + 0.4 * sin(vOP.z * 0.35 + vOP.x * 0.2)', bump: 1.5, emis: `e += diffuseColor.rgb * 0.18;` });
    const g = ellipsoid(32, 30, 125, 48);
    { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const t = z / 125; p.setX(i, x * (1 - 0.25 * t) + 6 * Math.sin(t * 2.5)); p.setY(i, y * (1 - 0.15 * t)); if (x > 10 && t > -0.2 && t < 0.4) p.setX(i, x - 9 * Math.sin((t + 0.2) / 0.6 * Math.PI)); } g.computeVertexNormals(); }
    para.add(new THREE.Mesh(g, bodyM));
    const inner = (r, c, x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, emissive: c, emissiveIntensity: 0.25 })); m.position.set(x, y, z); para.add(m); };
    inner(16, 0x7f9d5a, 0, 2, 10);                                  // the big nucleus
    for (let i = 0; i < 14; i++) inner(3 + R() * 4, [0xe39b3a, 0xd46a7a, 0x9ac44a, 0xe2c25a][i % 4], (R() - 0.5) * 34, (R() - 0.5) * 30, (R() - 0.5) * 180);   // food vacuoles
    for (const z of [-70, 70]) { inner(7, 0xe8fbff, 0, 14, z); for (let k = 0; k < 7; k++) { const a = k * 0.9; const m = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.6, 16, 5), new THREE.MeshStandardMaterial({ color: 0xd8f6ff, emissive: 0x88c8dd, emissiveIntensity: 0.3 })); m.position.set(Math.cos(a) * 9, 14, z + Math.sin(a) * 9); m.rotation.set(Math.PI / 2, 0, -a); m.lookAt(0, 14, z); m.rotateX(Math.PI / 2); para.add(m); } }
    // the cilia: thousands of beating hairs (instanced)
    const n = 1400;
    const cg = new THREE.CylinderGeometry(0.5, 0.25, 11, 4).translate(0, 5.5, 0);
    const cil = new THREE.InstancedMesh(cg, new THREE.MeshStandardMaterial({ color: 0xd9f3dc, roughness: 0.5, emissive: 0x4a6a50, emissiveIntensity: 0.3 }), n);
    const P = g.attributes.position, N = g.attributes.normal;
    const base = [];
    for (let i = 0; i < n; i++) { const k = Math.floor(R() * P.count); base.push({ p: new THREE.Vector3().fromBufferAttribute(P, k), n: new THREE.Vector3().fromBufferAttribute(N, k), ph: 0 }); base[i].ph = base[i].p.z * 0.06; }
    para.add(cil);
    para.userData = { cil, base };
    para.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  }
  G.add(para);

  // ---------- diatoms on the ground: little glass boats and discs with fine ribs ----------
  {
    const dm = procMat({ color: 0xd9b45a, rough: 0.2, transparent: true, opacity: 0.88, physical: { clearcoat: 1, clearcoatRoughness: 0.1 },
      col: `float rib = smoothstep(0.3, 0.7, sin(vOP.z * 1.6) * 0.5 + 0.5); c *= 0.75 + 0.3 * rib; c = mix(c, vec3(0.55, 0.42, 0.18), smoothstep(0.6, 0.95, abs(vOP.x) / 10.0) * 0.4);`,
      height: 'sin(vOP.z * 1.6) + 0.5 * sin(length(vOP.xz) * 1.4)', bump: 0.3, emis: `e += diffuseColor.rgb * 0.25;` });
    for (let i = 0; i < 26; i++) {
      let x, z; do { x = (R() - 0.5) * 900; z = -150 + R() * 900; } while (Math.hypot(x, z) < 70 || (z < 30 && Math.abs(x) < 120));
      const boat = R() < 0.65, L = 25 + R() * 60;
      const geo = boat ? ellipsoid(L * 0.18, L * 0.12, L * 0.5, 28) : new THREE.CylinderGeometry(L * 0.35, L * 0.35, L * 0.14, 40);
      const m = new THREE.Mesh(geo, dm);
      m.position.set(x, boat ? L * 0.1 : L * 0.07, z); m.rotation.y = R() * 6.3;
      m.castShadow = true; m.receiveShadow = true;
      G.add(m);
    }
  }
  // ---------- green algae and grit drifting in the water ----------
  const alg = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 3), procMat({ color: 0x4caf50, rough: 0.4, col: `c *= 0.75 + 0.4 * n3(vOP * 2.0 + vIP * 0.1);`, emis: `e += diffuseColor.rgb * 0.3;`, transparent: true, opacity: 0.9 }), 45);
  const grit = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), procMat({ color: 0xc9b89a, rough: 0.8, col: `c *= 0.7 + 0.5 * h13(floor(vIP));` }), 260);
  const A = [], Gr = [];
  for (let i = 0; i < 45; i++) { let p; do { p = new THREE.Vector3((R() - 0.5) * 300, 4 + R() * 90, -20 + R() * 320); } while (p.z < 30 && Math.abs(p.x) < 40); A.push({ p, r: 2.5 + R() * 3.5, w: new THREE.Vector3(R() - 0.5, (R() - 0.5) * 0.4, R() - 0.5) }); }
  for (let i = 0; i < 260; i++) { let p; do { p = new THREE.Vector3((R() - 0.5) * 30, 0.2 + R() * 12, -3 + R() * 30); } while (p.z < 2 && Math.abs(p.x) < 3); Gr.push({ p, r: 0.12 + Math.pow(R(), 2) * 0.6, w: new THREE.Vector3(R() - 0.5, (R() - 0.5) * 0.3, R() - 0.5), a: R() * 6 }); }
  G.add(alg, grit);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), pp = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  return {
    group: G, water, para, wU,
    paraAt(v, out = new THREE.Vector3()) {
      const k = clamp((v - 11.5) / 6.5);
      return out.set(lerp(-330, 260, k), 50 + 8 * Math.sin(v * 0.8), lerp(300, 200, k));
    },
    frame(v, S) {
      const t = v - 11;
      // the drop: falls, lands, wobbles, settles
      const c = dropAt(v);
      const land = v - T_DROP[1];
      const wob = land > 0 ? Math.exp(-land / 0.5) * Math.sin(land * 14) * 0.12 : 0;
      water.position.copy(c);
      water.scale.set(DROP_R * (1 + wob * 0.5), DROP_R * (1 - wob), DROP_R * (1 + wob * 0.5));
      wU.uT.value = v;
      // the paramecium swims past, its hairs beating in waves
      const pc = this.paraAt(v);
      para.position.copy(pc);
      para.rotation.set(0.05 * Math.sin(v), Math.atan2(720, -190) + 0.08 * Math.sin(v * 0.7), 0.25 * Math.sin(v * 0.9));
      para.visible = S > 3000;
      if (para.visible) {
        const { cil, base } = para.userData;
        base.forEach((b, i) => {
          const beat = Math.sin(b.ph * 1.0 - v * 9.0);
          const dir = b.n.clone().add(new THREE.Vector3(0, 0, -0.9 + 0.7 * beat)).normalize();
          q.setFromUnitVectors(up, dir);
          m4.compose(b.p, q, sc.set(1, 1, 1));
          cil.setMatrixAt(i, m4);
        });
        cil.instanceMatrix.needsUpdate = true;
      }
      A.forEach((a, i) => { pp.copy(a.p).addScaledVector(a.w, t * 2.5); m4.compose(pp, q.identity(), sc.setScalar(a.r)); alg.setMatrixAt(i, m4); });
      alg.instanceMatrix.needsUpdate = true;
      Gr.forEach((a, i) => { pp.copy(a.p).addScaledVector(a.w, t * 0.5); e.set(a.a + t, a.a * 2, 0); q.setFromEuler(e); m4.compose(pp, q, sc.setScalar(a.r)); grit.setMatrixAt(i, m4); });
      grit.instanceMatrix.needsUpdate = true;
      const wet = smooth(T_DROP[1] - 0.1, T_DROP[1] + 0.2, v);
      alg.visible = grit.visible = wet > 0.5;
      return { inside: wet, centre: c };
    },
  };
}

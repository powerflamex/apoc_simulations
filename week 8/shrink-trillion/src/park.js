// The park (frame 0 to the first dash): a red-and-white picnic blanket on a sunny lawn, built in real metres round
// your feet (the origin) and scaled by S. You stand near the middle of the blanket facing the camera (-z). Round you:
// a friend sitting on the blanket with their legs out (their white sneaker right beside you), another sitting to the
// side with a sandwich, a golden retriever behind you lowering its head to sniff you, an apple and a soda can,
// people standing and sitting on other blankets, trees, the sky.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { procMat, ellipsoid, tube } from './mats.js';
import { makeYou } from './you.js';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { rng, smooth, lerp, clamp, keys } from './util.js';

// the dog's nose, in real metres from your feet, over the first seconds: high over you, then down until it sniffs you
export const NOSE_K = [[-3, [0.03, 0.5, 0.3]], [0, [0.02, 0.47, 0.26]], [1.6, [0.01, 0.34, 0.2]], [3.0, [0.0, 0.21, 0.13]],
  [4.3, [0.0, 0.085, 0.065]], [5.6, [0.0, 0.035, 0.032]], [7, [0.0, 0.03, 0.03]]];
export function noseAt(v, out = new THREE.Vector3()) {
  const k = [0, 1, 2].map((i) => keys(NOSE_K.map(([t, p]) => [t, p[i]]), v));
  return out.set(k[0], k[1], k[2]);
}

export function makePark(scene) {
  const G = new THREE.Group();
  scene.add(G);
  const R = rng(11);

  // ---------- the lawn ----------
  const lawnMat = procMat({ color: 0x5f9a35, rough: 0.95,
    col: `float f = fbm3(vWP * 0.0 + vOP * vec3(1.3, 1.0, 1.3));
          float stripe = smoothstep(0.3, 0.7, sin(vOP.x * 0.9) * 0.5 + 0.5);
          float fine = n3(vOP * 220.0) * 0.6 + n3(vOP * 60.0) * 0.4;
          c *= 0.78 + 0.25 * f + 0.1 * stripe + 0.22 * (fine - 0.5);
          c = mix(c, c * vec3(1.15, 1.05, 0.6), smoothstep(0.62, 0.8, fbm3(vOP * 0.25)) * 0.5);`,
    height: 'n3(vOP * 400.0) + 0.5 * n3(vOP * 900.0)', bump: 0.002 });
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(400, 96).rotateX(-Math.PI / 2).translate(0, -0.004, 0), lawnMat);
  lawn.receiveShadow = true;   // (not added: the zoom ground, ground.js, is the lawn now)

  // grass blades round the blanket (it lies on the lawn; the blades nearest the camera stay short)
  {
    const prof = [];
    const N = 6;
    for (let i = 0; i <= N; i++) {
      const t = i / N, w = 0.5 * (1 - Math.pow(t, 1.6)) + 0.02;
      prof.push([-w, t], [w, t]);
    }
    const g = new THREE.BufferGeometry();
    const P = [], I = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, bend = 0.35 * t * t;
      for (const [x] of [prof[i * 2], prof[i * 2 + 1]]) P.push(x, t, bend);
    }
    for (let i = 0; i < N; i++) { const a = i * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setIndex(I);
    g.computeVertexNormals();
    const bladeMat = procMat({ color: 0x5aa02c, rough: 0.7, side: THREE.DoubleSide,
      col: `float r = h13(floor(vIP * 997.0)); c *= 0.7 + 0.5 * r; c = mix(c, vec3(0.75, 0.72, 0.3), step(0.93, r) * 0.6);
            c *= 0.75 + 0.35 * vOP.y; c *= 0.9 + 0.12 * sin(vOP.x * 60.0);`,
      emis: `e += diffuseColor.rgb * 0.18;` });
    const n = 9000;
    const inst = new THREE.InstancedMesh(g, bladeMat, n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    let k = 0;
    for (let tries = 0; tries < 80000 && k < n; tries++) {
      const r = Math.pow(R(), 1.2) * 2.4, a = R() * Math.PI * 2;
      const x = Math.cos(a) * (0.08 + r), z = Math.sin(a) * (0.08 + r);
      if (x > -0.92 && x < 1.12 && z > 0.03 && z < 2.07) continue;
      if (Math.hypot(x, z) < 0.1 || (z < 0.02 && Math.hypot(x, z) < 0.22)) continue;                   // the lawn right round you is the small world's (grass.js)
      // keep the strip the camera crosses at the start low
      const camStrip = z < -0.1 && z > -1.6 && Math.abs(x - 0.2) < 0.55;
      const hgt = (camStrip ? 0.035 : 0.06) + R() * (camStrip ? 0.03 : 0.07);
      e.set((R() - 0.5) * 0.5, R() * Math.PI * 2, (R() - 0.5) * 0.5);
      q.setFromEuler(e);
      m4.compose(p.set(x, -0.004, z), q, sc.set(0.004 + R() * 0.002, hgt, hgt));
      inst.setMatrixAt(k++, m4);
    }
    inst.count = k;
    inst.castShadow = false; inst.receiveShadow = true;
    G.add(inst);
  }

  // ---------- the blanket: red-and-white gingham, woven (the threads show once you're small) ----------
  const blanketMat = procMat({ color: 0xffffff, rough: 0.92,
    col: `vec2 q = vOP.xz / 0.055;
          float cx = step(0.5, fract(q.x)), cz = step(0.5, fract(q.y));
          // gingham: red where both stripes cross, pink where one does, white elsewhere
          float red = cx * cz, half_ = abs(cx - cz);
          vec3 base = mix(vec3(0.96, 0.94, 0.9), vec3(0.85, 0.08, 0.1), red);
          base = mix(base, vec3(0.93, 0.5, 0.5), half_);
          // the weave: over-under threads 0.6 mm apart
          vec2 w = vOP.xz / 0.0006;
          float over = step(0.5, fract((floor(w.x) + floor(w.y)) * 0.5));
          float tx = sin(fract(w.x) * 3.14159), tz = sin(fract(w.y) * 3.14159);
          float th = mix(tz, tx, over);
          c = base * (0.72 + 0.32 * th) * (0.93 + 0.1 * n3(vOP * 900.0));`,
    height: `sin(fract(vOP.x / 0.0006) * 3.14159) * step(0.5, fract((floor(vOP.x / 0.0006) + floor(vOP.z / 0.0006)) * 0.5)) + sin(fract(vOP.z / 0.0006) * 3.14159) * (1.0 - step(0.5, fract((floor(vOP.x / 0.0006) + floor(vOP.z / 0.0006)) * 0.5)))`,
    bump: 0.00025 });
  {
    const g = new THREE.PlaneGeometry(2.0, 2.0, 80, 80).rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      // soft folds, flat where you stand
      const near = smooth(0.15, 0.6, Math.hypot(x, z));
      p.setY(i, 0.003 + near * 0.006 * (Math.sin(x * 7.0 + 1.0) * Math.sin(z * 5.0) + 0.5 * Math.sin(x * 13 + z * 4)) + 0.002 * (Math.abs(x) > 0.95 || Math.abs(z) > 0.95 ? 1 : 0));
    }
    g.translate(0.1, 0, 1.05);
    g.computeVertexNormals();
    const b = new THREE.Mesh(g, blanketMat);
    b.receiveShadow = true;
    G.add(b);
  }

  // ---------- picnic food ----------
  {
    const apple = new THREE.Mesh(new THREE.SphereGeometry(0.04, 32, 24).scale(1, 0.92, 1), procMat({ color: 0xc8161c, rough: 0.35,
      col: `c = mix(c, vec3(0.95, 0.75, 0.2), smoothstep(0.55, 0.9, fbm3(vOP * vec3(60.0, 15.0, 60.0))) * 0.6); c *= 0.85 + 0.25 * n3(vOP * vec3(300.0, 40.0, 300.0));`,
      height: 'n3(vOP * 2000.0)', bump: 0.00002 }));
    apple.position.set(-0.42, 0.037, 0.73);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0025, 0.022, 8).translate(0, 0.044, 0).rotateZ(0.2), procMat({ color: 0x5a3a1a }));
    apple.add(stem);
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.122, 40), procMat({ color: 0xd31b22, rough: 0.25, metal: 0.6,
      col: `float a = atan(vOP.z, vOP.x); c = mix(c, vec3(0.97), smoothstep(0.02, 0.025, abs(vOP.y - 0.01 * sin(a * 2.0)) ) < 0.5 ? 1.0 : 0.0);
            c = mix(c, vec3(0.97), step(0.75, fract(a * 0.477)) * step(abs(vOP.y), 0.03));` }));
    can.position.set(0.72, 0.061, 0.63);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.029, 0.033, 0.006, 40), procMat({ color: 0xcfcfd4, rough: 0.3, metal: 0.9 }));
    top.position.y = 0.064; can.add(top);
    // a sandwich on a paper plate
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.006, 48), procMat({ color: 0xf6f3ec, rough: 0.8 }));
    plate.position.set(-0.5, 0.003, 1.4);
    const breadM = procMat({ color: 0xe9c48a, rough: 0.9, col: `c *= 0.82 + 0.3 * fbm3(vOP * 300.0);`, height: 'fbm3(vOP * 600.0)', bump: 0.0003 });
    const crustM = procMat({ color: 0xa8662b, rough: 0.9 });
    const sw = new THREE.Group();
    for (const [y, m] of [[0.012, breadM], [0.03, breadM]]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.1), [crustM, crustM, m, m, crustM, crustM]);
      s.position.y = y; sw.add(s);
    }
    const lettuce = new THREE.Mesh(new THREE.BoxGeometry(0.108, 0.004, 0.108), procMat({ color: 0x6cbf3a, rough: 0.6 }));
    lettuce.position.y = 0.02; sw.add(lettuce);
    const cheese = new THREE.Mesh(new THREE.BoxGeometry(0.104, 0.003, 0.104).rotateY(0.4), procMat({ color: 0xf4c430, rough: 0.5 }));
    cheese.position.y = 0.0235; sw.add(cheese);
    sw.position.set(-0.5, 0.006, 1.4); sw.rotation.y = 0.3;
    for (const m of [apple, can, plate, sw]) { m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); G.add(m); }
  }

  // ---------- the people on the blanket ----------
  // A: sitting with legs out toward the camera, leaning back on the hands; the right sneaker beside you
  const A = makeYou(G, { hoodie: 0x2f7fd8, jeans: 0x38506e, skin: 0xe0ac86, hair: 0x4a3020 });
  A.root.position.set(0.95, 0.0, 0.75);
  A.root.rotation.y = Math.PI + 0.5;
  // B: sitting at the side, knees up, a sandwich in hand
  const B = makeYou(G, { hoodie: 0xf4f1ea, jeans: 0x2c3e50, skin: 0x9a6440, hair: 0x151515 });
  B.root.position.set(-1.05, 0.0, 1.0);
  B.root.rotation.y = Math.PI - 0.6;
  // C: standing right over you, filming you with a phone (a sneaker beside you); D: standing further back
  const C = makeYou(G, { hoodie: 0xe9437a, jeans: 0x3a5a8c, skin: 0xf1c8a6, hair: 0xa07a48 });
  C.root.position.set(-0.17, 0, 0.2); C.root.rotation.y = Math.PI + 0.35;
  const D = makeYou(G, { hoodie: 0x27ae60, jeans: 0x5d6d7e, skin: 0xc68a62, hair: 0x2e2018 });
  D.root.position.set(1.4, 0, 2.9); D.root.rotation.y = Math.PI + 0.45;
  const FIG = [A, B, C, D];
  for (const f of FIG) f.root.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = true; } });
  function sit(F, { lean = -0.18, knee = 0, hipA = -Math.PI / 2 + 0.05, arms = 'back', look = [0.3, 0] }) {
    F.pose({ head: look });
    F.pelvis.position.set(0.105, 0.11, 0);
    F.torso.rotation.set(lean, 0, 0);
    F.legs.forEach((L, i) => { L.hip.rotation.set(hipA, (i ? 1 : -1) * 0.35, (i ? 1 : -1) * 0.1); L.knee.rotation.set(knee, 0, 0); L.ankle.rotation.set(0.4 - knee * 0.5, 0, (i ? 1 : -1) * 0.5); });
    if (arms === 'back') F.arms.forEach((a) => { a.sh.rotation.set(0.75, 0, a.sx * 0.28); a.el.rotation.set(-0.15, 0, 0); });
  }

  // ---------- the dog: a golden retriever behind you, head down to sniff you ----------
  const fur = procMat({ color: 0xd9a259, rough: 0.85,
    col: `vec3 q = vOP * vec3(700.0, 90.0, 700.0);
          float s1 = n3(q) * 0.6 + n3(q * 2.3) * 0.4;
          c *= 0.72 + 0.42 * s1;
          c = mix(c, c * vec3(1.12, 1.0, 0.82), smoothstep(0.4, 0.8, fbm3(vOP * 20.0)) * 0.5);`,
    height: 'n3(vOP * vec3(1400.0, 160.0, 1400.0))', bump: 0.00012 });
  const furDark = procMat({ color: 0xb87c3a, rough: 0.85, col: `c *= 0.75 + 0.4 * n3(vOP * vec3(600.0, 80.0, 600.0));`, height: 'n3(vOP * vec3(1200.0, 150.0, 1200.0))', bump: 0.0001 });
  const noseM = procMat({ color: 0x1a1412, rough: 0.32, physical: { clearcoat: 0.6, clearcoatRoughness: 0.3 },
    col: `vec2 v = vor3(vOP * 700.0); c *= 0.6 + 0.9 * smoothstep(0.0, 0.25, v.y - v.x);`,
    height: 'smoothstep(0.0, 0.3, vor3(vOP * 700.0).y - vor3(vOP * 700.0).x)', bump: 0.00025 });
  const eyeM = procMat({ color: 0x2a1408, rough: 0.08, physical: { clearcoat: 1, clearcoatRoughness: 0.05 } });
  const tongueM = procMat({ color: 0xe8707a, rough: 0.45, col: `c *= 0.85 + 0.25 * n3(vOP * 900.0);` });
  const lipM = procMat({ color: 0x2b1d18, rough: 0.6 });
  const dog = new THREE.Group();
  G.add(dog);
  const body = new THREE.Group(); dog.add(body);
  body.add(new THREE.Mesh(ellipsoid(0.125, 0.145, 0.32, 32), fur));
  body.add(new THREE.Mesh(ellipsoid(0.12, 0.16, 0.14, 24).translate(0, 0.01, 0.2), fur));        // chest
  for (const [x, z] of [[-0.075, 0.2], [0.075, 0.2], [-0.075, -0.24], [0.075, -0.24]]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.36, 6, 14).translate(x, -0.24, z), fur);
    body.add(leg);
    body.add(new THREE.Mesh(ellipsoid(0.04, 0.025, 0.055, 14).translate(x, -0.435, z + 0.02), furDark));
  }
  body.add(new THREE.Mesh(tube([[0, 0.06, -0.3], [0, 0.14, -0.42], [0, 0.22, -0.48], [0, 0.3, -0.47]], (t) => 0.035 * (1 - 0.6 * t), 24, 10), fur));
  const neckM = new THREE.Mesh(new THREE.BufferGeometry(), fur);
  dog.add(neckM);
  const head = new THREE.Group(); dog.add(head);
  {
    head.add(new THREE.Mesh(ellipsoid(0.075, 0.072, 0.088, 32).translate(0, 0.022, -0.005), fur));       // skull
    head.add(new THREE.Mesh(ellipsoid(0.062, 0.052, 0.062, 28).translate(0, 0.005, 0.05), fur));          // stop
    head.add(new THREE.Mesh(ellipsoid(0.047, 0.04, 0.078, 28).translate(0, -0.02, 0.098), fur));          // muzzle
    head.add(new THREE.Mesh(ellipsoid(0.036, 0.022, 0.06, 20).translate(0, -0.052, 0.082), fur));         // chin
    head.add(new THREE.Mesh(ellipsoid(0.034, 0.004, 0.05, 20).translate(0, -0.047, 0.1), lipM));          // mouth line
    const nose = new THREE.Mesh(ellipsoid(0.023, 0.017, 0.015, 28).translate(0, -0.004, 0.17), noseM);
    head.add(nose);
    for (const sx of [-1, 1]) {
      head.add(new THREE.Mesh(ellipsoid(0.0055, 0.0042, 0.004, 12).rotateZ(sx * 0.6).translate(sx * 0.0095, -0.0085, 0.1838), lipM));   // nostrils
      head.add(new THREE.Mesh(new THREE.SphereGeometry(0.0125, 20, 14).translate(sx * 0.036, 0.036, 0.066), eyeM));
      head.add(new THREE.Mesh(ellipsoid(0.017, 0.006, 0.014, 12).translate(sx * 0.037, 0.05, 0.068), furDark));    // brow
      const ear = new THREE.Mesh(ellipsoid(0.017, 0.075, 0.048, 20).translate(0, -0.05, 0), furDark);
      ear.position.set(sx * 0.07, 0.05, -0.02); ear.rotation.set(0.1, 0, sx * 0.22);
      head.add(ear);
    }
    head.add(new THREE.Mesh(new THREE.BoxGeometry(0.0011, 0.009, 0.003).translate(0, -0.024, 0.1795), lipM));   // philtrum
    const tongue = new THREE.Mesh(ellipsoid(0.021, 0.006, 0.04, 20).rotateX(0.7).translate(0, -0.068, 0.112), tongueM);
    head.add(tongue);
  }
  dog.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const DOG_BODY = new THREE.Vector3(0.12, 0.47, 0.98);
  dog.position.copy(DOG_BODY);
  dog.rotation.y = Math.atan2(-0.12, -0.98);  // facing you (its +z toward the origin)
  dog.updateMatrixWorld(true);

  // ---------- around: other blankets, people, trees ----------
  {
    const blMat = (a, b) => procMat({ color: 0xffffff, rough: 0.9, uniforms: { uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) } },
      col: `vec2 q = vOP.xz / 0.12; c = mix(uA, uB, step(0.5, fract(q.x + 0.0)) );` });
    [[-3.2, 4.0, 0x2f6fd0, 0xf2f2f2], [3.8, 5.2, 0xf6c445, 0xe94f37], [-5.5, -2.5, 0x16a085, 0xf2f2f2], [6.5, -1.0, 0x8e44ad, 0xffffff]].forEach(([x, z, a, b]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.6).rotateX(-Math.PI / 2), blMat(a, b));
      m.position.set(x, 0.0, z); m.rotation.y = R() * 3; m.receiveShadow = true; G.add(m);
    });
    const crowdMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
    const n = 70;
    const crowd = makeCrowd(G, n, crowdMat, { castShadow: true });
    const TOPS = [0xffffff, 0x222222, 0xe94f37, 0x3b8ed0, 0xf6c445, 0x6dbf73, 0xff9ec4, 0x8e44ad, 0x16a085, 0xc0392b, 0x2e86c1];
    const PANTS = [0x1b2631, 0x2c3e50, 0x5d6d7e, 0xd5c4a1, 0x4a6fa5, 0x212121];
    const ppl = [];
    for (let i = 0; i < n; i++) {
      let x, z;
      do { const r = 3.5 + Math.pow(R(), 1.3) * 26, a = R() * Math.PI * 2; x = Math.cos(a) * r; z = Math.sin(a) * r * 0.9 + 4; } while (z < 1.5 && Math.abs(x) < 6);
      const sitting = R() < 0.4;
      ppl.push({ x, z, yaw: Math.atan2(-x, -(z - 0.5)) + (R() - 0.5) * 1.4, sit: sitting ? 1 : 0, s: 0.92 + R() * 0.15, ph: R() * 6, armR: R() < 0.2 ? 1 : 0, look: R() * 0.3 });
      crowd.color(i, TOPS[(R() * TOPS.length) | 0], PANTS[(R() * PANTS.length) | 0], SKIN[(R() * SKIN.length) | 0], HAIR[(R() * HAIR.length) | 0], R() < 0.5);
    }
    G.userData.crowd = { crowd, ppl };
    // trees: trunks and leafy crowns
    const trunkM = procMat({ color: 0x6b4a32, rough: 0.95, col: `c *= 0.7 + 0.4 * n3(vOP * vec3(30.0, 4.0, 30.0));`, height: 'n3(vOP * vec3(40.0, 6.0, 40.0))', bump: 0.02 });
    const leafM = procMat({ color: 0x3f8a2e, rough: 0.9, col: `float f = fbm3(vOP * 2.2 + vIP * 0.01); c *= 0.55 + 0.75 * f; c = mix(c, vec3(0.55, 0.75, 0.2), smoothstep(0.6, 0.85, f) * 0.5);`,
      height: 'fbm3(vOP * 6.0)', bump: 0.25 });
    const crownG = new THREE.IcosahedronGeometry(1, 3);
    {
      const p = crownG.attributes.position;
      for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); const d = 1 + 0.18 * Math.sin(v.x * 5 + v.y * 3) * Math.sin(v.z * 4 + 1); p.setXYZ(i, v.x * d, v.y * d * 0.85, v.z * d); }
      crownG.computeVertexNormals();
    }
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + R() * 0.3, r = 16 + R() * 26;
      const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.8 + 8;
      const h = 4 + R() * 3;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, h, 12).translate(0, h / 2, 0), trunkM);
      t.position.set(x, 0, z); t.castShadow = true;
      G.add(t);
      for (let k = 0; k < 5; k++) {
        const c = new THREE.Mesh(crownG, leafM);
        const cr = 1.6 + R() * 1.4;
        c.scale.setScalar(cr);
        c.position.set(x + (R() - 0.5) * 2.4, h + (R() - 0.2) * 1.8, z + (R() - 0.5) * 2.4);
        c.castShadow = true;
        G.add(c);
      }
    }
  }

  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const qq = new THREE.Quaternion(), mm = new THREE.Matrix4();
  return {
    group: G, FIG, dog, head, sun: null,
    frame(v, s) {
      // the people
      sit(A, { lean: -0.2 + 0.03 * Math.sin(v * 0.8), look: [0.75, 0.05 * Math.sin(v)] });
      sit(B, { lean: -0.05, hipA: -1.2, knee: 1.9, arms: 'none', look: [0.35, 0.2] });
      B.arms.forEach((a, i) => { a.sh.rotation.set(i ? -0.9 : -0.6, 0, a.sx * 0.15); a.el.rotation.set(i ? -1.3 : -0.7, 0, 0); });
      C.pose({ head: [1.0, 0.1], armsOut: 0.0, lean: 0.12 });
      C.arms[0].sh.rotation.set(-0.85, 0, -0.15); C.arms[0].el.rotation.set(-0.9, 0, 0);     // filming you, phone down at you
      C.arms[1].sh.rotation.set(-0.7, 0, 0.25); C.arms[1].el.rotation.set(-1.1, 0, 0);
      D.pose({ head: [0.5, -0.2] });
      D.arms[0].sh.rotation.set(-0.3, 0, -0.5); D.arms[0].el.rotation.set(-1.9, 0, 0);      // hand to mouth
      // the crowd
      const { crowd, ppl } = G.userData.crowd;
      ppl.forEach((p, i) => crowd.pose(i, { x: p.x, y: 0, z: p.z, yaw: p.yaw + 0.1 * Math.sin(v * 0.5 + p.ph), sit: p.sit, s: p.s, armR: p.armR, look: p.look }));
      crowd.commit();
      // the dog's head: the nose follows the keys; the head aims along the line from the chest to the nose
      const nose = noseAt(v, tmp);
      // sniffing: the nose twitches
      nose.y += 0.0018 * Math.sin(v * 31) * smooth(2.5, 3.5, v);
      nose.z += 0.0012 * Math.sin(v * 27 + 1);
      dog.updateMatrix();
      const local = nose.clone().applyMatrix4(mm.copy(dog.matrix).invert());
      // head pose in the dog's frame: snout pointing from a pivot above the chest toward the nose
      const piv = tmp2.set(0, 0.22, 0.3);
      const dir = local.clone().sub(piv).normalize();
      const fwd = new THREE.Vector3(0, -0.15, 1).normalize();
      qq.setFromUnitVectors(fwd, dir);
      head.quaternion.copy(qq);
      head.position.copy(local).addScaledVector(dir, -0.17);
      head.rotateZ(0.12 * Math.sin(v * 0.7));
      // the neck: a tube from the chest to the back of the head
      const hb = head.position.clone().add(new THREE.Vector3(0, 0.0, -0.06).applyQuaternion(head.quaternion));
      const chest = new THREE.Vector3(0, 0.08, 0.24);
      const mid = chest.clone().lerp(hb, 0.5).add(new THREE.Vector3(0, 0.05, 0));
      neckM.geometry.dispose();
      neckM.geometry = tube([chest, mid, hb], (t) => lerp(0.085, 0.06, t), 16, 16);
    },
  };
}

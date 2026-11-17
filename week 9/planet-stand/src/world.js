// The whole scene, set up for one stop at a time: setPlace(i, v) puts the sky, ground, rocks, light, you, the chair
// and the drink into the state of stop i at video time v (each stop starts fresh: a full drink, a whole chair), so
// main.js can draw two stops in the same frame for the wipe.
// What happens to you at each stop (e: seconds into it): one thing at once, a bigger beat ~3 s in
//   Venus: the drink flashes to steam, the cloth chars, you glow dull red and slump; the seat burns through, you drop
//   Mercury: the plastic chair sags into a puddle under you; you shield your eyes from the huge Sun, the drink bursts
//   Mars: the drink froths over, you clutch your throat; a wall of dust sweeps in and swallows you
//   Titan: you leap up in a wingsuit, run for the bluff, jump and glide out over the methane lake (the camera follows)
//   Jupiter: you float up off the seat (falling = weightless); you punch through the cloud deck into lightning storms
//   Neptune: the wind tears the glass away and shoves you; a bigger gust blows you and the chair away, tumbling
//   Pluto: frost races over you, the drink freezes; the frozen drink shatters
//   Earth: a wave runs up the sand, gulls fly past, you raise your glass
import * as THREE from 'three';
import { makeSky } from './sky.js';
import { makeGround, GU } from './ground.js';
import { makeChair, makeDrink } from './props.js';
import { makeYou } from './you.js';
import { makePuffs } from './puffs.js';
import { FX } from './fx.js';
import { LOOKS } from './looks.js';
import { STOPS } from './timeline.js';
import { smooth, clamp, rng, wobble, DEG } from './util.js';

const dirOf = (az, el) => new THREE.Vector3(-Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), Math.cos(az * DEG) * Math.cos(el * DEG));

export function makeWorld(scene) {
  const sky = makeSky();
  scene.add(sky.mesh);
  const ground = makeGround(scene);
  ground.mat.side = THREE.DoubleSide;

  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 80 });
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5);      // light off the ground and sky behind the camera, onto your back
  scene.add(fill, fill.target);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
  scene.add(hemi);

  // ---- rocks, one set per place ----
  const rockSets = {};
  const R = rng(91);
  const mkRocks = (key, n, rMin, rMax, col, flat, near, far, detail = 1) => {
    const geo = new THREE.IcosahedronGeometry(1, detail);
    const p = geo.attributes.position;
    const ph = [R() * 6, R() * 6, R() * 6];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 0.8 + 0.14 * Math.sin(x * 3.1 + ph[0]) + 0.12 * Math.sin(y * 4.3 + ph[1]) + 0.1 * Math.sin(z * 5.7 + ph[2]);
      p.setXYZ(i, x * k, y * k, z * k);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.9, flatShading: detail < 2 });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    let c = 0;
    while (c < n) {
      const a = R() * Math.PI * 2, d = near + (far - near) * Math.pow(R(), 1.6);
      const x = Math.sin(a) * d, z = Math.cos(a) * d;
      if (Math.hypot(x, z) < 1.6 || (z < 0.2 && Math.abs(x + 0.3) < 1.2)) continue;      // keep the chair and the camera clear
      if (key === 'titan' && z > 5.5) continue;                                            // not in the lake
      if (key === 'earth' && z > 6) continue;
      const s = rMin + (rMax - rMin) * Math.pow(R(), 2.2);
      e.set(R() * 3, R() * 6, R() * 3); q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, s * flat * 0.35, z), q, new THREE.Vector3(s, s * flat, s * (0.8 + 0.4 * R())));
      mesh.setMatrixAt(c++, m4);
    }
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    rockSets[key] = mesh;
  };
  mkRocks('venus', 50, 0.2, 1.2, 0x6a5a4c, 0.25, 3, 45);
  mkRocks('mars', 130, 0.04, 0.5, 0x6a3420, 0.6, 2.2, 50);
  mkRocks('mercury', 90, 0.05, 0.6, 0x77716b, 0.55, 2.5, 50);
  mkRocks('titan', 160, 0.03, 0.16, 0xd8c8a8, 0.65, 1.7, 7, 2);
  mkRocks('pluto', 30, 0.4, 2.2, 0xeee6e4, 0.6, 8, 90);

  // ---- you, the chair, the drink ----
  const rig = new THREE.Group();          // the chair and you (Jupiter and Neptune move it)
  scene.add(rig);
  const chair = makeChair(rig);
  const you = makeYou(rig, { hoodie: 0x12b5c4, jeans: 0x22305e, skin: 0xc98d68, hair: 0x2a1a10 });
  const drink = makeDrink(scene);
  drink.group.scale.setScalar(1.3);
  // Titan's wings: a wingsuit membrane from each arm down to your hip (rebuilt every frame from your pose)
  const NW = 10;
  const wingMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, side: THREE.DoubleSide });
  wingMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aW; varying vec2 vW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = aW;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vW;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        { vec3 c = mix(vec3(1.0, 0.78, 0.06), vec3(1.0, 0.28, 0.06), smoothstep(0.25, 0.95, vW.y));
          float rib = smoothstep(0.035, 0.0, abs(fract(vW.x * 5.0 + 0.5) - 0.5));
          c = mix(c, vec3(0.12, 0.08, 0.06), rib * 0.85);
          c = mix(c, vec3(0.12, 0.08, 0.06), smoothstep(0.04, 0.0, vW.y) * 0.9);
          diffuseColor.rgb = c; }`);
  };
  wingMat.customProgramCacheKey = () => 'wingsuit';
  const wings = [0, 1].map(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array((NW + 1) * 2 * 3), w = new Float32Array((NW + 1) * 2 * 2), idx = [];
    for (let k = 0; k <= NW; k++) { w.set([k / NW, 0], k * 4); w.set([k / NW, 1], k * 4 + 2); }
    for (let k = 0; k < NW; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aW', new THREE.BufferAttribute(w, 2));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, wingMat);
    m.frustumCulled = false; m.castShadow = true;
    scene.add(m);
    return m;
  });
  const wpA = new THREE.Vector3(), wpB = new THREE.Vector3(), wpC = new THREE.Vector3(), wpD = new THREE.Vector3(), wpE = new THREE.Vector3();
  function buildWings() {
    you.arms.forEach((A, k) => {
      const m = wings[k];
      wp(A.sh, wpA);                                      // shoulder
      A.hand.updateMatrixWorld(true);
      wpB.set(0, -0.12, 0).applyMatrix4(A.hand.matrixWorld);   // fingertips
      wpC.copy(wpB).sub(wpA).normalize();
      wpB.addScaledVector(wpC, 0.3);                      // the wing reaches past your hand
      wp(you.pelvis, wpD); wpD.x += A.sx * 0.16; wpD.y -= 0.06;   // your hip
      const knee = wp(you.legs[k].knee, wpE);
      const p = m.geometry.attributes.position;
      for (let i = 0; i <= NW; i++) {
        const u = i / NW;
        const a = wpA.clone().lerp(wpB, u);
        // the trailing edge: from your armpit down your side to the hip, then out to the knee, billowing back
        const b = u < 0.6 ? wpA.clone().add(V(0, -0.08, -0.03)).lerp(wpD, u / 0.6) : wpD.clone().lerp(knee, (u - 0.6) / 0.4).lerp(wpB, 0.0);
        const mid = a.clone().lerp(b, 0.5);
        b.lerp(mid, 0.0).add(V(0, 0, -0.05 * Math.sin(Math.PI * u)));
        p.setXYZ(i * 2, a.x, a.y, a.z);
        p.setXYZ(i * 2 + 1, b.x, b.y, b.z);
      }
      p.needsUpdate = true;
      m.geometry.computeVertexNormals();
      m.geometry.computeBoundingSphere();
    });
  }
  const puffs = makePuffs(scene, 1600);

  // aim a bone so its -y axis points along dir (world), with its z axis as close as possible to zHint (world)
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), mB = new THREE.Matrix4();
  const vX = new THREE.Vector3(), vY = new THREE.Vector3(), vZ = new THREE.Vector3();
  function aim(bone, dir, zHint = new THREE.Vector3(0, 0, 1)) {
    vY.copy(dir).normalize().negate();
    vZ.copy(zHint).addScaledVector(vY, -zHint.dot(vY)).normalize();
    vX.crossVectors(vY, vZ);
    mB.makeBasis(vX, vY, vZ);
    qa.setFromRotationMatrix(mB);
    bone.parent.updateMatrixWorld(true);
    bone.parent.getWorldQuaternion(qb);
    bone.quaternion.copy(qb.invert().multiply(qa));
    bone.updateMatrixWorld(true);
  }
  const wp = (o, out = new THREE.Vector3()) => { o.updateMatrixWorld(true); return out.setFromMatrixPosition(o.matrixWorld); };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // sitting: pelvis on the seat, leaning back on the backrest, legs out, arms on the armrests, the drink up in your
  // right hand. o: { lift (m), sink (m), raise (0..1: the glass up), look [yaw, pitch], float (0..1: arms drift up),
  //   slump (0..1: Venus, you sag forward, the glass hand drops), throat (0..1: Mars, left hand to your throat),
  //   shield (0..1: Mercury, left hand up over your eyes), flat (0..1: sitting on the ground, legs straight out) }
  function sit(o) {
    const sl = o.slump || 0, flat = o.flat || 0;
    you.root.position.set(-0.105, -(o.sink || 0) + (o.lift || 0), 0);
    you.root.rotation.set(0, 0, 0);
    const P = you.pelvis;
    P.position.set(0.105, 0.36, -0.1);
    P.rotation.set(0, 0, 0);
    const look = o.look || [0, 0];
    you.torso.rotation.set(-0.48 + 0.42 * sl + 0.2 * flat, 0, 0.05 * sl);
    you.neck.rotation.set(0.3 + look[1] * 0.5 + 0.45 * sl, look[0] * 0.5, 0);
    you.head.rotation.set(0.12 + look[1] * 0.5 + 0.35 * sl, look[0] * 0.6, 0.12 * sl);
    you.legs.forEach((L, i) => {
      const sx = i === 0 ? -1 : 1;
      const k = (o.kick || 0) * Math.sin((o.t || 0) * 5 + i * 2) * 0.25;
      const hip = -1.45 * (1 - flat) - 1.52 * flat + k;
      const knee = 0.45 * (1 - flat) + 0.05 * flat + Math.abs(k);
      L.hip.rotation.set(hip, 0, sx * 0.1);
      L.knee.rotation.set(knee, 0, 0);
      L.ankle.rotation.set(-(hip + knee) * (1 - flat) + 1.2 * flat, 0, 0);
    });
    you.root.updateMatrixWorld(true);
    const rise = o.raise || 0, fl = o.float || 0;
    const shR = wp(you.arms[0].sh), shL = wp(you.arms[1].sh);
    const R0 = rig.position;
    const lift = (o.lift || 0) - (o.sink || 0);
    // right: elbow on the armrest, forearm up, the glass at the top of the hand (dropped to the armrest when you slump)
    const elbR = V(-0.32, 0.53 + lift + 0.25 * fl, -0.12).add(R0);
    aim(you.arms[0].sh, elbR.clone().sub(shR), V(0, 0, 1));
    const handR = V(-0.35 - 0.04 * rise + 0.02 * sl, 0.76 + lift + 0.22 * rise + 0.2 * fl - 0.2 * sl, 0.04 + 0.12 * rise + 0.12 * sl).add(R0);
    aim(you.arms[0].el, handR.clone().sub(wp(you.arms[0].el)), V(1, 0, 0.3));
    you.arms[0].wr.rotation.set(0, 0, 0.5 * sl);
    // left: on the armrest, or up to your throat / over your eyes
    const th = o.throat || 0, shd = o.shield || 0;
    const neckP = wp(you.neck), headP = wp(you.head);
    let elbL = V(0.32, 0.53 + lift + 0.3 * fl, -0.14).add(R0);
    let handL = V(0.33, 0.55 + lift + 0.35 * fl, 0.13).add(R0);
    elbL.lerp(neckP.clone().add(V(0.2, -0.22, 0.12)), th).lerp(headP.clone().add(V(0.3, -0.1, 0.05)), shd);
    handL.lerp(neckP.clone().add(V(0.02, 0.0, 0.11)), th).lerp(headP.clone().add(V(0.02, 0.17, 0.14)), shd);
    aim(you.arms[1].sh, elbL.clone().sub(shL), V(0, 0, 1));
    aim(you.arms[1].el, handL.clone().sub(wp(you.arms[1].el)), V(0, 1, 0).lerp(V(-1, 0, 0), Math.max(th, shd)));
    you.arms[1].wr.rotation.set(0.1, 0, 0);
    you.arms.forEach((A, k) => {
      const curl = k === 0 ? 1.0 : 0.35 + 0.3 * th - 0.25 * shd;
      A.fingers.forEach((f, j) => f.forEach((seg, kk) => seg.rotation.set(0, 0, (kk === 0 ? 0.9 : 1.1) * curl * (1 + j * 0.05))));
      A.thumb.forEach((seg) => seg.rotation.set(0, 0, 0.3 * curl));
    });
    you.root.updateMatrixWorld(true);
  }
  // standing, running and gliding (Titan). o: { pos (feet, world), lean (rad forward), crouch (0..1), run (0..1),
  //   ph (stride phase), glide (0..1), flap (rad: wings up +), spread (0..1: arms out) }
  const X1 = new THREE.Vector3(1, 0, 0);
  function stand(o) {
    you.root.position.set(o.pos.x - 0.105, o.pos.y, o.pos.z);
    you.root.rotation.set(o.lean, 0, 0);
    const cr = o.crouch || 0, run = o.run || 0, gl = o.glide || 0, ph = o.ph || 0;
    you.pelvis.position.set(0.105, 0.91 - 0.3 * cr - 0.04 * run, 0);
    you.pelvis.rotation.set(0, 0, 0);
    you.torso.rotation.set(0.25 * cr + 0.08 * run, 0, 0);
    you.neck.rotation.set(-o.lean * 0.45 - 0.1 * cr, 0, 0);
    you.head.rotation.set(-o.lean * 0.3, 0, 0);
    you.legs.forEach((L, i) => {
      const sx = i === 0 ? -1 : 1;
      const s = Math.sin(ph + i * Math.PI);
      let hip = -0.75 * s * run - 1.0 * cr + 0.2 * gl;
      let knee = (0.25 + 1.1 * Math.max(0, Math.sin(ph + i * Math.PI + 1.3))) * run + 1.6 * cr + (0.25 + 0.1 * i) * gl;
      L.hip.rotation.set(hip, 0, sx * (0.06 + 0.06 * gl));
      L.knee.rotation.set(knee, 0, 0);
      L.ankle.rotation.set(-(hip + knee) * (1 - gl) * 0.8 + 0.6 * gl, 0, 0);
    });
    you.root.updateMatrixWorld(true);
    you.arms.forEach((A) => {
      const f = o.flap || 0, sp = o.spread ?? 1;
      const out = V(A.sx * Math.cos(f), Math.sin(f), 0.12).normalize();
      const down = V(A.sx * 0.25, -1, 0.1).normalize();
      const dir = down.lerp(out, sp).normalize().applyAxisAngle(X1, o.lean);
      aim(A.sh, dir, V(0, 0, 1).applyAxisAngle(X1, o.lean));
      A.el.rotation.set(0, 0, 0); A.wr.rotation.set(0, 0, 0);
      A.fingers.forEach((fg) => fg.forEach((seg) => seg.rotation.set(0, 0, 0.15)));
      A.thumb.forEach((seg) => seg.rotation.set(0, 0, 0.1));
    });
    you.root.updateMatrixWorld(true);
  }
  // Titan: where your feet are at time e (run along the plateau, off the bluff, out over the lake)
  const T_RUN = 0.45, T_JUMP = 1.9;
  function titanPath(e) {
    if (e < T_RUN) return { z: 0.4, y: 0, speed: 0 };
    if (e < T_JUMP) { const t = e - T_RUN; return { z: 0.4 + 2.2 * t + 1.9 * t * t, y: 0, speed: 2.2 + 3.8 * t }; }
    const t0 = T_JUMP - T_RUN, z0 = 0.4 + 2.2 * t0 + 1.9 * t0 * t0, v0 = 2.2 + 3.8 * t0;
    const t = e - T_JUMP;
    return { z: z0 + v0 * t, y: 0.55 * smooth(0, 0.35, t) + 0.85 * t - 0.035 * t * t + 0.12 * Math.sin(t * 5.5 - 1.0) * smooth(0.3, 1.0, t), speed: v0 };
  }
  // where the glass sits in your right hand (its foot), after sit()
  const tmp = new THREE.Vector3();
  function glassInHand(out) {
    const A = you.arms[0];
    A.hand.updateMatrixWorld(true);
    out.set(0.0, -0.05, 0.0).applyMatrix4(A.hand.matrixWorld);
    return out.add(tmp.set(0, -0.07, 0.035));
  }

  // Jupiter's lightning: a jagged bolt between the cloud layers, shown for a flicker at each strike
  const boltM = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 5.5, 7), toneMapped: false, fog: false });
  const bolt = (() => {
    const R = rng(44), pts = [];
    let p = new THREE.Vector3(-28, -20, 190);
    for (let k = 0; k < 16; k++) { pts.push(p.clone()); p = p.clone().add(V((R() - 0.5) * 22, -14 - R() * 8, (R() - 0.5) * 14)); }
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05), 120, 0.9, 6, false), boltM);
    m.frustumCulled = false; m.visible = false;
    scene.add(m);
    return m;
  })();
  const STRIKES = [3.75, 4.55, 4.72, 5.5];
  // Earth's gulls: a white body and two wings beating
  const gullM = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.8, side: THREE.DoubleSide, emissive: 0x9a9a96 });
  const tipM = new THREE.MeshStandardMaterial({ color: 0x8a8c92, roughness: 0.8, side: THREE.DoubleSide, emissive: 0x303236 });
  const gulls = [0, 1, 2].map(() => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8).scale(1, 0.8, 2.4), gullM));
    // each wing: an inner half rising from the body and an outer half bent down at the wrist (the gull's "M")
    const half = (len, w0, w1) => { const sh = new THREE.Shape(); sh.moveTo(0, w0 / 2); sh.lineTo(len, w1 / 2); sh.lineTo(len, -w1 / 2); sh.lineTo(0, -w0 / 2); return new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2); };
    const wing = (sx) => {
      const inner = new THREE.Group();
      const gi = half(0.3, 0.2, 0.17); if (sx < 0) gi.scale(-1, 1, 1);
      inner.add(new THREE.Mesh(gi, gullM));
      const outer = new THREE.Group(); outer.position.x = sx * 0.3; inner.add(outer);
      const go = half(0.34, 0.17, 0.03); if (sx < 0) go.scale(-1, 1, 1);
      outer.add(new THREE.Mesh(go, tipM));
      outer.rotation.z = -sx * 0.55;
      g.add(inner);
      inner.userData.sx = sx;
      return inner;
    };
    g.userData.w = [wing(-1), wing(1)];
    g.visible = false;
    scene.add(g);
    return g;
  });

  const R2 = rng(7);
  const SEEDS = Array.from({ length: 600 }, () => [R2(), R2(), R2(), R2()]);
  const col = (c, k = 1) => [c[0] * k, c[1] * k, c[2] * k];
  const bell = (e, c, w) => Math.exp(-(((e - c) / w) ** 2));

  // ---- one stop's state ----
  function setPlace(i, v) {
    const st = STOPS[i], key = st.key, L = LOOKS[key];
    const e = i === 0 ? v : v - st.land;          // seconds into the stop (Venus counts from frame 0)
    const out = { key, e, cam: { dy: 0, pitch: 0, shake: 0, roll: 0, dx: 0, dz: 0, yaw: 0 }, exp: L.exp, shimmer: 0, veil: null };
    // sky
    const u = sky.u;
    u.uTop.value.setRGB(...L.top); u.uHor.value.setRGB(...L.hor); u.uHaze.value.setRGB(...L.haze);
    u.uHazeK.value = L.hazeK; u.uHazeW.value = L.hazeW; u.uSkyPow.value = L.skyPow;
    const sd = dirOf(L.sun[0], L.sun[1]);
    u.uSunD.value.copy(sd); u.uSunR.value = L.sunR; u.uSunI.value = L.sunI;
    u.uSunCol.value.setRGB(...(L.sunCol || [1.0, 0.97, 0.92])); u.uGlow.value.setRGB(...L.glow); u.uGlowK.value = L.glowK; u.uGlowW.value = L.glowW;
    u.uStars.value = L.stars; u.uT.value = v; u.uBolt.value = 0;
    u.uDeck.value = L.deck || 0; u.uStorm.value = 0; u.uPlutoHaze.value = key === 'pluto' ? 1 : 0;
    if (L.deck) { u.uD1.value.setRGB(...L.deck1); u.uD2.value.setRGB(...L.deck2); u.uD3.value.setRGB(...L.deck3); }
    // ground
    const hasGround = !L.deck;
    ground.mesh.visible = hasGround;
    GU.uK.value = L.kind; GU.uMount.value = L.mount; GU.uT.value = v;
    GU.uWaterY.value = key === 'titan' ? -8.6 : key === 'earth' ? -0.6 : -1e4;
    GU.uReflK.value = key === 'titan' ? 0.3 : 1;
    if (key === 'titan') GU.uWaterCol.value.setRGB(0.03, 0.018, 0.01); else GU.uWaterCol.value.setRGB(0.0, 0.2, 0.32);
    GU.uSkyTop.value.setRGB(...L.top); GU.uSkyHor.value.setRGB(...L.hor);
    GU.uSunD.value.copy(sd); GU.uSunCol.value.setRGB(...L.light).multiplyScalar(L.li);
    for (const k in rockSets) rockSets[k].visible = k === key;
    // light
    sun.color.setRGB(...L.light); sun.intensity = L.li;
    sun.position.copy(sd).multiplyScalar(30); sun.target.position.set(0, 0, 0.6);
    fill.color.setRGB(...L.hemiSky); fill.intensity = L.hi * 0.45;
    fill.position.set(-0.6, 1.4, -6); fill.target.position.set(0, 0.6, 0);
    hemi.color.setRGB(...L.hemiSky); hemi.groundColor.setRGB(...L.hemiGnd); hemi.intensity = L.hi;
    scene.fog.color.setRGB(...L.fog); scene.fog.density = L.fogD;
    you.setRim(L.light[0] * 0.35, L.light[1] * 0.35, L.light[2] * 0.35);
    puffs.mat.uniforms.uSun.value.copy(sd); puffs.mat.uniforms.uSunC.value.setRGB(...L.light).multiplyScalar(L.li * 0.35);
    puffs.mat.uniforms.uAmb.value.setRGB(...L.hemiSky).multiplyScalar(L.hi * 0.55); puffs.mat.uniforms.uT.value = v;

    // ---- defaults: sitting still, a full drink ----
    FX.uFrost.value = 0; FX.uDust.value = 0; FX.uScorch.value = 0; FX.uMelt.value = 0; FX.uHeat.value = 0; FX.uBurn.value = 0;
    drink.U.uIce.value = 0; drink.U.uBoil.value = 0; drink.U.uT.value = v;
    let level = 1, sitO = { look: [wobble(v * 0.3, 2) * 0.05, 0] }, standO = null;
    rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
    wings[0].visible = wings[1].visible = false;
    bolt.visible = false;
    for (const g of gulls) g.visible = false;
    drink.group.visible = true;
    let glassFree = null;
    puffs.begin();
    const breathe = Math.sin(v * 1.6) * 0.004;

    if (key === 'venus') {
      // at once: the drink flashes to steam, the cloth chars, you glow and slump. ~3 s: the seat burns through and you drop
      level = 1 - smooth(0.12, 0.9, e);
      drink.U.uBoil.value = smooth(0.0, 0.2, e) * (1 - smooth(0.9, 1.2, e));
      FX.uScorch.value = smooth(0.1, 0.9, e);
      FX.uHeat.value = 0.55 * smooth(0.15, 1.0, e) + 0.25 * smooth(2.8, 3.6, e);
      FX.uBurn.value = 0.72 * smooth(2.7, 3.5, e);
      out.shimmer = 1;
      sitO.slump = smooth(0.25, 0.95, e);
      sitO.sink = 0.2 * smooth(3.25, 3.45, e);
      out.cam.shake = 1.4 * bell(e, 3.45, 0.15) + 0.4 * bell(e, 0.5, 0.25);
    } else if (key === 'mercury') {
      // at once: the plastic chair sags into a puddle and you sink to the ground. ~3 s: you shield your eyes; the drink bursts
      const m = 0.82 * smooth(0.05, 1.0, e) + 0.18 * smooth(1.0, 2.6, e);
      FX.uMelt.value = m;
      sitO.sink = 0.3 * Math.pow(m, 1.3);
      sitO.flat = smooth(0.35, 1.3, e);
      sitO.shield = smooth(2.5, 3.0, e);
      sitO.look = [0, -0.18 * smooth(2.5, 3.0, e)];
      level = 1 - smooth(2.95, 3.15, e);
      drink.U.uBoil.value = 0.6 * smooth(0.1, 0.4, e);
      out.burst = e - 3.0;
    } else if (key === 'mars') {
      // at once: the drink froths over, you clutch your throat. ~3 s: the dust storm's wall arrives and swallows you
      drink.U.uBoil.value = smooth(0.05, 0.22, e) * (1 - smooth(2.2, 2.9, e));
      level = 1 - 0.35 * smooth(0.1, 1.6, e);
      drink.U.uIce.value = smooth(2.0, 3.0, e);
      sitO.throat = smooth(0.15, 0.55, e);
      sitO.look = [0.45 * smooth(1.7, 2.4, e), -0.25 * smooth(0.15, 0.55, e) * (1 - smooth(1.7, 2.4, e))];
      u.uStorm.value = 0.4 + 0.6 * smooth(0, 2.5, e);
      const sF = 125 - 31 * e;                        // the wall's front, metres from you (it reaches you ~4 s in)
      out.wallF = sF;
      const sw = smooth(8, -4, sF);                   // swallowed
      out.swallow = sw;
      FX.uDust.value = 0.7 * smooth(4, -4, sF);
      const dust = [0.92, 0.46, 0.22];
      scene.fog.color.setRGB(...dust); scene.fog.density = L.fogD + 0.045 * sw;
      u.uTop.value.lerp(new THREE.Color(...dust), 0.75 * sw); u.uHor.value.lerp(new THREE.Color(...dust), 0.85 * sw);
      sun.intensity = L.li * (1 - 0.45 * sw);
      out.veil = [0.95, 0.5, 0.25, 0.3 * sw];
      out.cam.shake = 0.9 * sw;
      out.dust = sw;
    } else if (key === 'titan') {
      // at once: you leap up out of the chair, wings spreading. Then you run for the edge, jump and glide out over the lake
      wings[0].visible = wings[1].visible = true;
      const p = titanPath(e), pc = titanPath(Math.max(0, e - 0.18));
      const gl = smooth(T_JUMP - 0.1, T_JUMP + 0.5, e);
      const run = smooth(T_RUN - 0.1, T_RUN + 0.2, e) * (1 - gl);
      const tg = Math.max(0, e - T_JUMP);
      standO = {
        pos: V(0, p.y, p.z), lean: 0.12 + 0.25 * run + 0.95 * gl, crouch: 0.7 * (1 - smooth(0.05, 0.4, e)) * (1 - run),
        run, ph: e * 9.5, glide: gl,
        flap: (1 - gl) * (0.25 + 0.3 * Math.sin(e * 7)) + gl * (0.1 + 0.55 * Math.sin(tg * 5.5)), spread: smooth(0.05, 0.5, e),
      };
      out.cam.dz = pc.z - 0.4;
      out.cam.dy = pc.y * 0.92 + 0.35 * gl;
      out.cam.pitch = -7 * gl;
      out.you = V(0, p.y, p.z);
      drink.U.uIce.value = smooth(1.2, 4.5, e);
      glassFree = V(-0.31, 0.512, 0.16);             // the glass stays on the armrest
    } else if (key === 'jupiter') {
      // at once: you float up off the seat (falling = weightless). ~3 s: you punch through the cloud deck into storms with lightning
      const fall = smooth(0.0, 0.3, e);
      rig.rotation.set(0.1 * smooth(0.3, 5, e) + 0.02 * Math.sin(e * 3), 0, 0.05 * Math.sin(e * 1.3) * fall);
      sitO.lift = 0.2 * smooth(0.1, 0.8, e) + 0.03 * Math.sin(e * 2.5) * fall;
      sitO.float = 0.8 * smooth(0.1, 0.9, e);
      sitO.kick = smooth(0.2, 0.8, e); sitO.t = e;
      sitO.look = [0.2 * Math.sin(e * 0.8) * fall, -0.25 * fall];
      level = 1 - 0.75 * smooth(0.3, 2.6, e);
      out.cam.shake = 0.5 * fall + 1.6 * bell(e, 3.0, 0.25); out.cam.roll = 3 * Math.sin(e * 1.3) * fall;
      const below = smooth(2.95, 3.05, e);           // under the top deck now
      const H1 = Math.max(0.5, 95 - 10.5 * e * e), H2 = 390 - 10.5 * Math.max(0, e * e - 9);
      u.uDeckH.value = below > 0.5 ? H2 : H1;
      u.uDeckOff.value.set(300 + 15 * e + 4000 * below, 4000 + 30 * e);
      out.cam.pitch = -3 * smooth(0.2, 2.0, e);
      out.fallD = 10.5 * e * e;
      out.veil = [1.0, 0.93, 0.82, 0.95 * bell(e, 3.0, 0.32)];
      if (below > 0.5) {
        u.uTop.value.setRGB(0.95, 0.7, 0.45); u.uHor.value.setRGB(0.85, 0.52, 0.28); u.uHaze.value.setRGB(1.0, 0.75, 0.5);
        u.uD1.value.setRGB(1.0, 0.68, 0.38); u.uD2.value.setRGB(0.55, 0.26, 0.1); u.uD3.value.setRGB(1.0, 0.9, 0.75);
        u.uSunI.value = 0; u.uGlowK.value = 0;
        sun.intensity = 1.4; sun.color.setRGB(1.0, 0.8, 0.55); hemi.color.setRGB(1.0, 0.7, 0.42); hemi.intensity = 1.4;
        let fl = 0;
        for (const tb of STRIKES) { const d = e - tb; if (d >= 0 && d < 0.35) fl = Math.max(fl, Math.exp(-d / 0.07) * (0.6 + 0.4 * Math.sin(d * 90))); }
        u.uBolt.value = 1.4 * fl; u.uBoltD.value.set(-0.14, -0.28, 0.95).normalize();
        bolt.visible = fl > 0.25;
        sun.intensity += 2.5 * fl; sun.color.lerp(new THREE.Color(0.8, 0.88, 1.0), fl);
        out.flash = fl;
      }
    } else if (key === 'neptune') {
      // at once: the wind tears the glass out of your hand and shoves you. ~3 s: a bigger gust blows you and the chair away
      const gust = smooth(0.12, 0.4, e);
      const t = Math.max(0, e - 2.9), away = smooth(2.85, 3.3, e);
      const rx = (te) => { const tt = Math.max(0, te - 2.9); return 0.18 + 2.8 * tt * tt + 1.0 * tt; };
      rig.position.set(rx(e) + 0.04 * wobble(e * 9, 3) * gust, 0.03 * wobble(e * 11, 5) * gust + 0.9 * t, 0);
      rig.rotation.set(0.04 * wobble(e * 7, 2) * gust + 0.25 * Math.sin(t * 2.0) * away, 0.05 * gust + 0.3 * t, 0.16 * gust + 1.5 * t);
      { const c = V(0, 0.55, 0); rig.position.add(c.clone().sub(c.applyEuler(rig.rotation))); }      // (it tumbles about its middle)
      sitO.look = [0.5 * gust, -0.1 * gust];
      out.cam.dx = rx(e) * away;
      out.cam.dy = 0.9 * t * away;
      out.cam.shake = 1.4 * gust + 0.8 * away; out.cam.roll = 4 * gust + 10 * away * Math.min(1, t);
      u.uDeckH.value = 900 - 20 * e; u.uDeckOff.value.set(0, 3000);
      if (e > 0.25) {
        const tg = e - 0.25;
        glassFree = V(-0.35 + 9 * tg + 3 * tg * tg, 0.95 + 1.5 * tg - 2 * tg * tg, 0.04 + 1.2 * tg);
        out.glassSpin = tg * 14;
        if (tg > 1.5) drink.group.visible = false;
      }
      level = e > 0.25 ? 1 - smooth(0.25, 0.6, e) : 1;
      out.wind = gust + 0.6 * away;
    } else if (key === 'pluto') {
      // at once: frost races over you and the drink freezes solid. ~3 s: the frozen drink shatters
      FX.uFrost.value = smooth(0.05, 0.9, e);
      drink.U.uIce.value = smooth(0.05, 0.6, e);
      sitO.look = [0.06 * Math.sin(e * 40) * (1 - smooth(0.4, 1.0, e)), 0.12 * smooth(0.1, 0.8, e)];
      sitO.t = e;
      if (e > 3.0) drink.group.visible = false;
      out.shatter = e - 3.0;
      out.cam.shake = 0.9 * bell(e, 3.05, 0.12);
    } else if (key === 'earth') {
      // a wave runs up the sand and slides back; gulls fly past; you raise your glass
      sitO.raise = smooth(0.4, 1.2, e);
      sitO.look = [0.15 * smooth(0.3, 1.2, e), -0.05 * smooth(0.4, 1.2, e)];
      GU.uWaterY.value = -0.62 + 0.56 * (smooth(0.0, 0.9, e) - smooth(1.1, 2.9, e)) + 0.03 * Math.sin(e * 3);
      gulls.forEach((g, k) => {
        const s = SEEDS[500 + k];
        g.visible = true;
        // (they fly out to sea from over your shoulder: seen from behind, wings spread)
        const tt = e + 0.5 + k * 0.35;
        const x = [0.9, -1.6, 2.6][k] + 0.3 * Math.sin(tt * 1.3 + k), z = 2.2 + (4.0 + 0.8 * s[0]) * tt, y = 2.0 + 0.12 * tt + 0.22 * k + 0.06 * Math.sin(tt * 3 + k);
        g.scale.setScalar(1.7);
        g.position.set(x, y, z);
        g.rotation.set(-0.12, 0.15 * Math.sin(tt + k), 0.12 * Math.sin(tt * 2.2 + k));
        const fl = 0.3 + 0.4 * Math.sin(e * (8 + k) + k * 2);
        for (const w of g.userData.w) w.rotation.z = w.userData.sx * fl;
      });
    }
    // ---- pose and place ----
    you.torso.position.y = breathe;
    rig.updateMatrixWorld(true);
    if (standO) stand(standO); else sit(sitO);
    rig.updateMatrixWorld(true);
    if (wings[0].visible) buildWings();
    if (out.you) { sun.target.position.copy(out.you); sun.position.copy(out.you).addScaledVector(sd, 30); }
    const gp = glassFree ? glassFree.clone() : glassInHand(new THREE.Vector3());
    drink.group.position.copy(gp);
    drink.group.rotation.set(0, 0, 0);
    if (out.glassSpin) drink.group.rotation.set(out.glassSpin * 0.7, out.glassSpin * 0.3, out.glassSpin);
    else if (glassFree == null) drink.group.rotation.set(rig.rotation.x, 0, rig.rotation.z + (sitO.slump || 0) * 0.5);
    drink.set(level);
    const top = gp.clone().add(V(0, drink.H * 1.3, 0));

    // ---- puffs ----
    if (key === 'venus' && e > 0.06) {
      // steam: a fat column boiling off the glass, drifting up and back in the thick air, lit orange
      for (let k = 0; k < 60; k++) {
        const s = SEEDS[k];
        const born = 0.06 + s[0] * 1.3;
        const age = e - born;
        if (age < 0 || age > 2.6) continue;
        const a = age / 2.6;
        const r = 0.05 + 0.34 * Math.pow(a, 0.7) * (0.6 + 0.6 * s[1]);
        puffs.puff(top.x + (s[2] - 0.5) * 0.1 + 0.25 * a, top.y + 0.05 + 1.3 * Math.pow(a, 0.8), top.z + (s[3] - 0.5) * 0.1 - 0.15 * a,
          r, 0.5 * (born < 1.0 ? 1 : 0.4) * (1 - a) * smooth(0, 0.08, age), [1.25, 1.1, 0.95], s[0]);
      }
      // black flakes of burnt cloth lifting off in the heat as the seat goes
      const bk = smooth(2.7, 3.3, e) * (1 - smooth(5.0, 6.0, e));
      for (let k = 0; k < 50 * bk; k++) {
        const s = SEEDS[k + 60];
        const ph = (e * (0.35 + 0.3 * s[0]) + s[1]) % 1;
        puffs.puff((s[2] - 0.5) * 0.6, 0.25 + 1.6 * ph, -0.15 + (s[3] - 0.5) * 0.7 - 0.3 * ph, 0.012 + 0.01 * s[3], 0.9 * bk * Math.sin(Math.PI * ph), [0.06, 0.04, 0.03], s[0]);
      }
    }
    if (key === 'mercury') {
      if (drink.U.uBoil.value > 0.01 && e < 3.0) {
        // no air: the drink spits vapour and ice bits straight out
        for (let k = 0; k < 30; k++) {
          const s = SEEDS[k + 200];
          const ph = (e * (1.2 + s[0]) + s[1]) % 1;
          puffs.puff(top.x + (s[2] - 0.5) * 0.6 * ph, top.y + 0.6 * ph - 0.9 * ph * ph, top.z + (s[3] - 0.5) * 0.6 * ph, 0.008, 0.9 * drink.U.uBoil.value * (1 - ph), [1.4, 1.4, 1.4], s[0]);
        }
      }
      if (out.burst > 0) {
        // the burst: a fountain of glittering ice flung out in straight arcs (no air to slow it; gravity 3.7 m/s2)
        const t = out.burst;
        for (let k = 0; k < 220; k++) {
          const s = SEEDS[k + 230];
          const a = s[0] * Math.PI * 2, up = 1.5 + 3.5 * s[1], side = 0.6 + 2.2 * s[2];
          const y = top.y + up * t - 1.85 * t * t;
          if (y < 0.01) continue;
          puffs.puff(top.x + Math.cos(a) * side * t, y, top.z + Math.sin(a) * side * t, 0.004 + 0.006 * s[3], 0.95 * (1 - smooth(2.6, 3.2, t)), [2.6, 2.4, 1.9], s[0]);
        }
      }
    }
    if (key === 'mars') {
      // froth boiling up and over the rim
      const boil = drink.U.uBoil.value;
      for (let k = 0; k < 40 * boil; k++) {
        const s = SEEDS[k];
        const ph = (e * (1.5 + s[0]) + s[1]) % 1;
        puffs.puff(top.x + (s[2] - 0.5) * 0.08 + 0.05 * ph * (s[2] - 0.5), top.y - 0.02 + 0.08 * ph - (s[3] > 0.6 ? 0.18 * ph * ph : 0), top.z + (s[3] - 0.5) * 0.08, 0.014 + 0.03 * ph, 0.85 * (1 - ph) * boil, [1.1, 1.08, 1.05], s[0]);
      }
      // the wall of dust: billows on a front sweeping in from ahead-left
      const sF = out.wallF;
      if (sF > -30) {
        const n = V(0.55, 0, 0.83), lat = V(0.83, 0, -0.55);
        for (let a = 0; a < 16; a++) for (let b = 0; b < 6; b++) {
          const s = SEEDS[300 + a * 6 + b];
          // (a towering front, lit from above: dark rust at its foot, bright where the Sun catches its billowing top)
          const l = (a - 7.5) * 12 + (s[0] - 0.5) * 6, hgt = 5 + b * 11 + s[1] * 6 + 6 * Math.sin(a * 1.7 + s[2] * 5);
          const f = sF + (s[2] - 0.3) * 8 + b * 3;
          if (f < 3) continue;
          const p = n.clone().multiplyScalar(f).addScaledVector(lat, l);
          const r = 8 + 6 * s[3] + b * 1.6;
          const lt = 0.55 + 0.1 * b + (b === 5 ? 0.2 : 0);
          puffs.puff(p.x, hgt + 2.5 * Math.sin(e * 0.9 + a), p.z, r, 0.97 * smooth(170, 130, f), [1.05 * lt, 0.52 * lt, 0.28 * lt], s[0]);
        }
      }
      // dust streaming past close by once you're inside it
      const dk = out.dust || 0;
      for (let k = 0; k < 120 * dk; k++) {
        const s = SEEDS[k + 50];
        const ph = (e * (0.45 + 0.3 * s[0]) + s[1]) % 1;
        const x = 12 - 24 * ph, z = 1.5 + 18 * s[2], y = 0.1 + 2.2 * s[3] * s[3];
        puffs.puff(x, y, z, 0.35 + 0.8 * s[3], 0.22 * dk * Math.sin(Math.PI * ph), [0.95, 0.5, 0.28], s[0], 1.8);
      }
    }
    if (key === 'titan' && out.you) {
      // sand kicked up by your feet while you run; ice pebbles skittering
      const run = standO.run;
      for (let k = 0; k < 24 * run; k++) {
        const s = SEEDS[k + 400];
        const ph = (e * (2 + s[0]) + s[1]) % 1;
        puffs.puff(out.you.x + (s[2] - 0.5) * 0.4, 0.05 + 0.25 * ph, out.you.z - 0.4 - 0.8 * ph, 0.05 + 0.12 * ph, 0.35 * (1 - ph) * run, [0.75, 0.45, 0.2], s[0]);
      }
    }
    if (key === 'jupiter') {
      // drink blobs floating up out of the glass
      for (let k = 0; k < 14; k++) {
        const s = SEEDS[k + 300];
        const born = 0.25 + s[0] * 2.0;
        const age = e - born;
        if (age < 0) continue;
        puffs.puff(top.x + (s[1] - 0.5) * 0.25 * age, top.y + 0.18 * age + 0.03 * Math.sin(age * 4 + k), top.z + (s[2] - 0.5) * 0.2 * age,
          0.012 + 0.012 * s[3], 0.95 * (1 - smooth(2.5, 3.5, age)), [0.1, 0.55, 1.4], s[0]);
      }
      // cloud banks rushing up past you; close round you as you punch through the deck
      const d = out.fallD;
      for (let k = 0; k < 40; k++) {
        const s = SEEDS[k + 100];
        const a = (s[0] - 0.5) * 2.4, dist = 70 + 220 * s[1];
        const x = Math.sin(a) * dist, z = Math.cos(a) * dist + 30;
        const yy = ((-s[2] * 500 + d) % 500 + 500) % 500 - 430;
        const r = 28 + 40 * s[3];
        const c = e > 3.0 ? [1.0, 0.72, 0.45] : s[2] < 0.5 ? LOOKS.jupiter.deck1 : [1.0, 0.75, 0.55];
        puffs.puff(x, yy, z, r, 0.28 * smooth(-430, -360, yy) * (1 - smooth(-60, -20, yy)), col(c, 1.6), s[0]);
      }
      const near = bell(e, 3.0, 0.45);
      for (let k = 0; k < 40 * near; k++) {
        const s = SEEDS[k + 150];
        const a = s[0] * Math.PI * 2, dist = 3 + 14 * s[1];
        const yy = (s[2] - 0.5) * 30 + (e - 3.0) * 60;
        puffs.puff(Math.sin(a) * dist, yy, Math.cos(a) * dist + 2, 3 + 5 * s[3], 0.6 * near, [1.2, 1.1, 0.95], s[0]);
      }
    }
    if (key === 'neptune') {
      const w = out.wind || 0;
      // white methane cloud streaks racing past (the wind blows from your right)
      const cx = out.cam.dx;
      for (let k = 0; k < 90; k++) {
        const s = SEEDS[k + 150];
        const ph = (e * (0.6 + 0.6 * s[0]) + s[1]) % 1;
        const dist = 8 + 120 * s[2];
        const x = cx - 110 + 220 * ph, z = 6 + dist, y = -25 + 45 * s[3] + out.cam.dy;
        puffs.puff(x, y, z, 2 + 5 * s[3], 0.5 * Math.sin(Math.PI * ph), [1.05, 1.1, 1.2], s[0], 6);
      }
      // the drink ripped out as spray
      if (e > 0.25) for (let k = 0; k < 40 * Math.min(1, w); k++) {
        const s = SEEDS[k + 250];
        const ph = (e * (1.8 + s[0]) + s[1]) % 1;
        puffs.puff(gp.x - 0.6 + 4 * ph * (0.6 + s[2]), gp.y + 0.1 + (s[3] - 0.4) * 0.8 * ph, gp.z + (s[2] - 0.5) * 0.6 * ph, 0.01 + 0.02 * s[3], 0.9 * (1 - ph) * (1 - smooth(1.5, 2.5, e)), [0.15, 0.6, 1.4], s[0], 2.5);
      }
    }
    if (key === 'pluto') {
      // ice glitter puffing off you as you freeze
      const f = FX.uFrost.value * (1 - smooth(2.4, 4.0, e));
      for (let k = 0; k < 40 * f; k++) {
        const s = SEEDS[k + 340];
        const ph = (e * (0.4 + 0.3 * s[0]) + s[1]) % 1;
        puffs.puff(-0.2 + (s[2] - 0.5) * 0.7, 0.6 + 0.6 * s[3] + 0.4 * ph, -0.25 + (s[0] - 0.5) * 0.5, 0.006, 0.9 * f * Math.sin(Math.PI * ph), [1.6, 1.7, 1.9], s[0]);
      }
      if (out.shatter > 0) {
        // the frozen drink and the glass burst into shards and ice chips, flying far in Pluto's weak pull (0.62 m/s2)
        const t = out.shatter;
        for (let k = 0; k < 140; k++) {
          const s = SEEDS[k + 380 > 590 ? k : k + 380];
          const a = s[0] * Math.PI * 2, el = (s[1] - 0.3) * 1.6, sp = 0.6 + 2.6 * s[2];
          const y = gp.y + 0.1 + Math.sin(el) * sp * t - 0.31 * t * t;
          if (y < 0.01) continue;
          const glass = k % 3 === 0;
          puffs.puff(gp.x + Math.cos(a) * Math.cos(el) * sp * t, y, gp.z + Math.sin(a) * Math.cos(el) * sp * t, glass ? 0.01 : 0.008 + 0.014 * s[3],
            0.95 * (1 - smooth(2.4, 3.2, t)), glass ? [1.5, 1.7, 2.0] : [0.55, 0.85, 1.6], s[0]);
        }
      }
    }
    puffs.end();
    return out;
  }
  return { sky, ground, sun, rig, you, chair, drink, puffs, setPlace };
}

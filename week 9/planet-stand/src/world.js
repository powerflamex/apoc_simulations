// The whole scene, set up for one stop at a time: setPlace(i, v) puts the sky, ground, rocks, light, you, the chair
// and the drink into the state of stop i at video time v (each stop starts fresh: a full drink, a whole chair), so
// main.js can draw two stops in the same frame for the wipe.
// What happens to you at each stop (e: seconds into it):
//   Venus: the drink flashes to steam (0.15-1.1 s), the cloth scorches, the air shimmers
//   Mars: the drink froths (it boils, 0.2 s) then ices over; the dust storm rolls in from the left and dusts you red
//   Mercury: the plastic chair slumps under you (0.3-2.6 s) under the huge Sun
//   Titan: wings on your arms: you flap, lift off the chair (0.5 s) and hover over the methane lake
//   Jupiter: no ground: you and the chair drop into the clouds; the drink floats up out of the glass (falling = weightless)
//   Neptune: the wind tears the glass out of your hand (0.25 s) and shoves you and the chair sideways, clouds streaking past
//   Pluto: frost grows over you and the chair, the drink freezes solid (0.2-2.2 s); the Sun is a star
//   Earth: you raise your glass
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
      if (key === 'titan' && z > 7) continue;                                            // not in the lake
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
  // right hand. o: { lift (m), fly (0..1: arms out with the wings), flap (rad), raise (0..1: the glass up), look [yaw, pitch],
  //   sink (m), float (0..1: arms drift up, Jupiter) }
  function sit(o) {
    const fly = o.fly || 0;
    you.root.position.set(-0.105, -(o.sink || 0) + (o.lift || 0), 0);
    you.root.rotation.set(0, 0, 0);
    const P = you.pelvis;
    P.position.set(0.105, 0.36, -0.1);
    P.rotation.set(0, 0, 0);
    you.torso.rotation.set(-0.48 * (1 - fly) - 0.08 * fly, 0, 0);
    you.neck.rotation.set(0.3 * (1 - fly) + 0.1 * fly + (o.look ? o.look[1] : 0) * 0.5, (o.look ? o.look[0] : 0) * 0.5, 0);
    you.head.rotation.set(0.12 + (o.look ? o.look[1] : 0) * 0.5, (o.look ? o.look[0] : 0) * 0.6, 0);
    you.legs.forEach((L, i) => {
      const sx = i === 0 ? -1 : 1;
      const hip = -1.45 * (1 - fly) - 0.3 * fly + (o.kick || 0) * Math.sin((o.t || 0) * 9 + i * 2) * 0.15;
      const knee = 0.45 * (1 - fly) + 0.45 * fly;
      L.hip.rotation.set(hip, 0, sx * (0.1 + 0.08 * fly));
      L.knee.rotation.set(knee, 0, 0);
      L.ankle.rotation.set(-(hip + knee) * (1 - fly) + 0.5 * fly, 0, 0);
    });
    you.root.updateMatrixWorld(true);
    // arms: rest on the armrests (x = +-0.31, top 0.51), the right one lifting the glass
    const rise = o.raise || 0;
    const shR = wp(you.arms[0].sh), shL = wp(you.arms[1].sh);
    const rig0 = rig.position;
    const lift = (o.lift || 0) - (o.sink || 0);
    if (fly > 0.001) {
      for (const [k, A] of [[0, you.arms[0]], [1, you.arms[1]]]) {
        const sx = A.sx, f = o.flap || 0;
        const rest = k === 0 ? V(-0.33, 0.55 + lift, 0.12).add(rig0).sub(shR) : V(0.33, 0.55 + lift, 0.1).add(rig0).sub(shL);
        const out = V(sx * Math.cos(f), Math.sin(f), 0.12);
        aim(A.sh, rest.normalize().lerp(out, fly).normalize(), V(0, 0, 1));
        A.el.rotation.set(0, 0, 0); A.wr.rotation.set(0, 0, 0);
      }
    } else {
      const fl = o.float || 0;
      // right: elbow on the armrest, forearm up, the glass at the top of the hand
      const elbR = V(-0.32, 0.53 + lift + 0.25 * fl, -0.12).add(rig0);
      aim(you.arms[0].sh, elbR.clone().sub(shR), V(0, 0, 1));
      const handR = V(-0.35 - 0.04 * rise, 0.76 + lift + 0.22 * rise + 0.2 * fl, 0.04 + 0.12 * rise).add(rig0);
      aim(you.arms[0].el, handR.clone().sub(wp(you.arms[0].el)), V(1, 0, 0.3));
      you.arms[0].wr.rotation.set(0, 0, 0);
      // left: elbow and hand on the armrest
      const elbL = V(0.32, 0.53 + lift + 0.3 * fl, -0.14).add(rig0);
      aim(you.arms[1].sh, elbL.clone().sub(shL), V(0, 0, 1));
      const handL = V(0.33, 0.55 + lift + 0.35 * fl, 0.13).add(rig0);
      aim(you.arms[1].el, handL.clone().sub(wp(you.arms[1].el)), V(0, 1, 0));
      you.arms[1].wr.rotation.set(0.1, 0, 0);
    }
    const curlR = fly > 0.5 ? 0.2 : 1.0;
    you.arms.forEach((A, k) => {
      const curl = k === 0 ? curlR : 0.35;
      A.fingers.forEach((f, j) => f.forEach((seg, kk) => seg.rotation.set(0, 0, (kk === 0 ? 0.9 : 1.1) * curl * (1 + j * 0.05))));
      A.thumb.forEach((seg) => seg.rotation.set(0, 0, 0.3 * curl));
    });
    you.root.updateMatrixWorld(true);
  }
  // where the glass sits in your right hand (its foot), after sit()
  const tmp = new THREE.Vector3();
  function glassInHand(out) {
    const A = you.arms[0];
    A.hand.updateMatrixWorld(true);
    out.set(0.0, -0.05, 0.0).applyMatrix4(A.hand.matrixWorld);
    return out.add(tmp.set(0, -0.07, 0.035));
  }

  const R2 = rng(7);
  const SEEDS = Array.from({ length: 400 }, () => [R2(), R2(), R2(), R2()]);
  const col = (c, k = 1) => [c[0] * k, c[1] * k, c[2] * k];

  // ---- one stop's state ----
  function setPlace(i, v) {
    const st = STOPS[i], key = st.key, L = LOOKS[key];
    const e = i === 0 ? v : v - st.land;          // seconds into the stop (Venus counts from frame 0)
    const out = { key, e, cam: { dy: 0, pitch: 0, shake: 0, roll: 0, dx: 0 }, exp: L.exp, shimmer: 0 };
    // sky
    const u = sky.u;
    u.uTop.value.setRGB(...L.top); u.uHor.value.setRGB(...L.hor); u.uHaze.value.setRGB(...L.haze);
    u.uHazeK.value = L.hazeK; u.uHazeW.value = L.hazeW; u.uSkyPow.value = L.skyPow;
    const sd = dirOf(L.sun[0], L.sun[1]);
    u.uSunD.value.copy(sd); u.uSunR.value = L.sunR; u.uSunI.value = L.sunI;
    u.uSunCol.value.setRGB(...(L.sunCol || [1.0, 0.97, 0.92])); u.uGlow.value.setRGB(...L.glow); u.uGlowK.value = L.glowK; u.uGlowW.value = L.glowW;
    u.uStars.value = L.stars; u.uT.value = v;
    u.uDeck.value = L.deck || 0; u.uStorm.value = 0; u.uPlutoHaze.value = key === 'pluto' ? 1 : 0;
    if (L.deck) { u.uD1.value.setRGB(...L.deck1); u.uD2.value.setRGB(...L.deck2); u.uD3.value.setRGB(...L.deck3); }
    // ground
    const hasGround = !L.deck;
    ground.mesh.visible = hasGround;
    GU.uK.value = L.kind; GU.uMount.value = L.mount; GU.uT.value = v;
    GU.uWaterY.value = key === 'titan' ? -0.35 : key === 'earth' ? -0.6 : -1e4;
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
    // puffs lit like everything else
    puffs.mat.uniforms.uSun.value.copy(sd); puffs.mat.uniforms.uSunC.value.setRGB(...L.light).multiplyScalar(L.li * 0.35);
    puffs.mat.uniforms.uAmb.value.setRGB(...L.hemiSky).multiplyScalar(L.hi * 0.55); puffs.mat.uniforms.uT.value = v;

    // ---- defaults: sitting still, a full drink ----
    FX.uFrost.value = 0; FX.uDust.value = 0; FX.uScorch.value = 0; FX.uMelt.value = 0;
    drink.U.uIce.value = 0; drink.U.uBoil.value = 0; drink.U.uT.value = v;
    let level = 1, sitO = { look: [wobble(v * 0.3, 2) * 0.05, 0] };
    rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
    wings[0].visible = wings[1].visible = false;
    let glassFree = null;           // when the glass leaves your hand: its own position
    puffs.begin();
    const breathe = Math.sin(v * 1.6) * 0.004;

    if (key === 'venus') {
      level = 1 - smooth(0.15, 1.1, e);
      drink.U.uBoil.value = smooth(0.0, 0.25, e) * (1 - smooth(1.1, 1.4, e));
      FX.uScorch.value = 0.9 * smooth(0.3, 4.0, e);
      out.shimmer = 1;
      sitO.look = [-0.35 * smooth(0.2, 0.6, e) * (1 - smooth(1.8, 2.6, e)), 0.25 * smooth(0.2, 0.6, e) * (1 - smooth(1.8, 2.6, e))];
    } else if (key === 'mars') {
      drink.U.uBoil.value = smooth(0.15, 0.4, e) * (1 - smooth(1.8, 2.6, e));
      level = 1 - 0.3 * smooth(0.2, 2.2, e);
      drink.U.uIce.value = smooth(2.0, 3.6, e);
      u.uStorm.value = 0.25 + 0.75 * smooth(-0.5, 6.0, e);
      FX.uDust.value = 0.65 * smooth(2.8, 6.2, e);
      sitO.look = [-0.3 * smooth(0.3, 0.7, e) * (1 - smooth(2.6, 3.4, e)) + 0.25 * smooth(3.4, 4.2, e), 0.2 * smooth(0.3, 0.7, e) * (1 - smooth(2.6, 3.4, e))];
      out.dust = smooth(2.4, 5.5, e);
    } else if (key === 'mercury') {
      FX.uMelt.value = smooth(0.3, 2.6, e);
      sitO.sink = 0.15 * FX.uMelt.value;
      sitO.look = [0, 0.15 * smooth(0.4, 1.0, e) * (1 - smooth(2.8, 3.6, e))];
      level = 1 - 0.6 * smooth(0.3, 3.0, e);
      drink.U.uBoil.value = smooth(0.2, 0.5, e) * (1 - smooth(2.5, 3.2, e)) * 0.6;
    } else if (key === 'titan') {
      wings[0].visible = wings[1].visible = true;
      const fly = smooth(0.15, 0.6, e);
      const up = smooth(0.5, 2.4, e);
      sitO.fly = fly;
      sitO.flap = 0.15 + 0.55 * Math.sin(Math.max(0, e - 0.3) * 6.2) * fly;
      sitO.lift = 1.15 * up + 0.08 * Math.sin(Math.max(0, e - 0.3) * 6.2 - 1.2) * up;
      sitO.t = e; sitO.kick = up;
      out.cam.dy = 0.1 * up; out.cam.pitch = 13 * up;
      drink.U.uIce.value = smooth(1.2, 4.5, e);
      glassFree = V(-0.31, 0.512, 0.16);               // you set it down on the armrest
    } else if (key === 'jupiter') {
      const fall = smooth(0.0, 0.4, e);
      rig.rotation.set(0.12 * smooth(0.3, 5, e) + 0.02 * Math.sin(e * 3), 0, 0.05 * Math.sin(e * 1.3) * fall);
      sitO.float = 0.6 * smooth(0.2, 1.2, e);
      sitO.look = [0.2 * Math.sin(e * 0.8) * fall, -0.25 * fall];
      level = 1 - 0.75 * smooth(0.3, 2.6, e);
      out.cam.shake = 0.5 * fall; out.cam.roll = 3 * Math.sin(e * 1.3) * fall;
      // the deck below comes up at you: Jupiter's pull (24.8 m/s2) less a little drag; you start ~430 m over it
      const d = 10 * e * e;
      u.uDeckH.value = Math.max(25, 430 - d);
      out.cam.pitch = -9 * smooth(0.2, 2.5, e);
      u.uDeckOff.value.set(300 + 15 * e, 4000 + 30 * e);
      out.fallD = d;
    } else if (key === 'neptune') {
      const gust = smooth(0.15, 0.45, e);
      rig.position.set(0.18 * gust + 0.04 * wobble(e * 9, 3) * gust, 0.03 * wobble(e * 11, 5) * gust, 0);
      rig.rotation.set(0.04 * wobble(e * 7, 2) * gust, 0.05 * gust, 0.16 * gust + 0.05 * wobble(e * 8, 1) * gust);
      sitO.look = [0.5 * gust, -0.1 * gust];
      out.cam.shake = 1.4 * gust; out.cam.roll = 4 * gust;
      u.uDeckH.value = 900 - 20 * e; u.uDeckOff.value.set(0, 3000);
      if (e > 0.25) {
        const t = e - 0.25;
        glassFree = V(-0.35 + 9 * t + 3 * t * t, 0.95 + 1.5 * t - 2 * t * t, 0.04 + 1.2 * t);
        out.glassSpin = t * 14;
      }
      level = e > 0.25 ? 1 - smooth(0.25, 0.6, e) : 1;
      out.wind = gust;
    } else if (key === 'pluto') {
      FX.uFrost.value = smooth(0.2, 2.3, e);
      drink.U.uIce.value = smooth(0.15, 1.3, e);
      sitO.look = [0, 0.1 * smooth(0.5, 1.5, e)];
    } else if (key === 'earth') {
      sitO.raise = smooth(0.6, 1.5, e);
      sitO.look = [0.08 * Math.sin(v * 0.5), -0.05 * smooth(0.6, 1.5, e)];
    }
    // ---- pose and place ----
    you.torso.position.y = breathe;
    rig.updateMatrixWorld(true);
    sit(sitO);
    rig.updateMatrixWorld(true);
    if (wings[0].visible) buildWings();
    const gp = glassFree ? glassFree.clone() : glassInHand(new THREE.Vector3());
    drink.group.position.copy(gp);
    drink.group.rotation.set(0, 0, 0);
    if (out.glassSpin) drink.group.rotation.set(out.glassSpin * 0.7, out.glassSpin * 0.3, out.glassSpin);
    else if (glassFree == null) drink.group.rotation.set(rig.rotation.x, 0, rig.rotation.z);
    drink.set(level);
    const top = gp.clone().add(V(0, drink.H * 1.3, 0));

    // ---- puffs ----
    if (key === 'venus' && e > 0.08) {
      // steam: a fat column boiling off the glass, drifting up and back in the thick air, lit orange
      for (let k = 0; k < 60; k++) {
        const s = SEEDS[k];
        const born = 0.08 + s[0] * 1.6;
        const age = e - born;
        if (age < 0 || age > 2.6) continue;
        const a = age / 2.6;
        const r = 0.04 + 0.32 * Math.pow(a, 0.7) * (0.6 + 0.6 * s[1]);
        const strength = born < 1.2 ? 1 : 0.4;
        puffs.puff(top.x + (s[2] - 0.5) * 0.1 + 0.25 * a, top.y + 0.05 + 1.3 * Math.pow(a, 0.8), top.z + (s[3] - 0.5) * 0.1 - 0.15 * a,
          r, 0.5 * strength * (1 - a) * smooth(0, 0.08, age), [1.25, 1.1, 0.95], s[0]);
      }
    }
    if (key === 'mars') {
      // froth at the rim, then vapour wisps
      const boil = drink.U.uBoil.value;
      for (let k = 0; k < 26 * boil; k++) {
        const s = SEEDS[k];
        const ph = (e * (1.5 + s[0]) + s[1]) % 1;
        puffs.puff(top.x + (s[2] - 0.5) * 0.06, top.y - 0.02 + 0.12 * ph, top.z + (s[3] - 0.5) * 0.06, 0.012 + 0.03 * ph, 0.8 * (1 - ph) * boil, [1.1, 1.1, 1.15], s[0]);
      }
      // dust streaming past along the ground from your left, thicker as the storm arrives
      const dk = out.dust || 0;
      for (let k = 0; k < 110 * dk; k++) {
        const s = SEEDS[k + 50];
        const ph = (e * (0.25 + 0.2 * s[0]) + s[1]) % 1;
        const x = 14 - 28 * ph, z = 3.5 + 22 * s[2], y = 0.1 + 1.3 * s[3] * s[3];
        puffs.puff(x, y, z, 0.3 + 0.7 * s[3], 0.2 * dk * Math.sin(Math.PI * ph), [0.95, 0.5, 0.28], s[0], 1.8);
      }
    }
    if (key === 'mercury' && drink.U.uBoil.value > 0.01) {
      // no air: the drink spits vapour and ice bits straight out, which fall back
      for (let k = 0; k < 30; k++) {
        const s = SEEDS[k + 200];
        const ph = (e * (1.2 + s[0]) + s[1]) % 1;
        const vx = (s[2] - 0.5) * 0.6, vz = (s[3] - 0.5) * 0.6;
        puffs.puff(top.x + vx * ph, top.y + 0.6 * ph - 0.9 * ph * ph, top.z + vz * ph, 0.008, 0.9 * drink.U.uBoil.value * (1 - ph), [1.4, 1.4, 1.4], s[0]);
      }
    }
    if (key === 'jupiter') {
      // drink blobs floating up out of the glass
      for (let k = 0; k < 14; k++) {
        const s = SEEDS[k + 300];
        const born = 0.3 + s[0] * 2.0;
        const age = e - born;
        if (age < 0) continue;
        puffs.puff(top.x + (s[1] - 0.5) * 0.25 * age, top.y + 0.18 * age + 0.03 * Math.sin(age * 4 + k), top.z + (s[2] - 0.5) * 0.2 * age,
          0.012 + 0.012 * s[3], 0.95 * (1 - smooth(2.5, 3.5, age)), [0.1, 0.55, 1.4], s[0]);
      }
      // clouds rushing up past you
      const d = out.fallD;
      for (let k = 0; k < 40; k++) {
        const s = SEEDS[k + 100];
        const a = (s[0] - 0.5) * 2.4, dist = 70 + 220 * s[1];
        const x = Math.sin(a) * dist, z = Math.cos(a) * dist + 30;
        const yy = ((-s[2] * 500 + d) % 500 + 500) % 500 - 430;
        const r = 28 + 40 * s[3];
        const c = s[2] < 0.5 ? LOOKS.jupiter.deck1 : [1.0, 0.75, 0.55];
        puffs.puff(x, yy, z, r, 0.28 * smooth(-430, -360, yy) * (1 - smooth(-60, -20, yy)), col(c, 1.6), s[0]);
      }
    }
    if (key === 'neptune') {
      const w = out.wind || 0;
      // white methane cloud streaks racing past (the wind blows from your right)
      for (let k = 0; k < 90; k++) {
        const s = SEEDS[k + 150];
        const ph = (e * (0.6 + 0.6 * s[0]) + s[1]) % 1;
        const dist = 8 + 120 * s[2];
        const x = -110 + 220 * ph, z = 6 + dist, y = -25 + 45 * s[3];
        puffs.puff(x, y, z, 2 + 5 * s[3], 0.5 * Math.sin(Math.PI * ph), [1.05, 1.1, 1.2], s[0], 6);
      }
      // the drink ripped out as spray
      for (let k = 0; k < 40 * w; k++) {
        const s = SEEDS[k + 250];
        const ph = (e * (1.8 + s[0]) + s[1]) % 1;
        if (e < 0.25) break;
        puffs.puff(gp.x - 0.6 + 4 * ph * (0.6 + s[2]), gp.y + 0.1 + (s[3] - 0.4) * 0.8 * ph, gp.z + (s[2] - 0.5) * 0.6 * ph, 0.01 + 0.02 * s[3], 0.9 * (1 - ph) * (1 - smooth(1.5, 2.5, e)), [0.15, 0.6, 1.4], s[0], 2.5);
      }
    }
    if (key === 'pluto') {
      // ice glitter puffing off you as you freeze
      const f = FX.uFrost.value * (1 - smooth(2.6, 4.5, e));
      for (let k = 0; k < 40 * f; k++) {
        const s = SEEDS[k + 340];
        const ph = (e * (0.4 + 0.3 * s[0]) + s[1]) % 1;
        puffs.puff(-0.2 + (s[2] - 0.5) * 0.7, 0.6 + 0.6 * s[3] + 0.4 * ph, -0.25 + (s[0] - 0.5) * 0.5, 0.006, 0.9 * f * Math.sin(Math.PI * ph), [1.6, 1.7, 1.9], s[0]);
      }
    }
    puffs.end();
    return out;
  }
  return { sky, ground, sun, rig, you, chair, drink, puffs, setPlace };
}

// The street things: lamp posts, trolley-wire poles, street trees, the cable car with people riding on its running
// boards, and the Transamerica Pyramid. They ride the ground (quake.js, rigid), lamps and trees topple once the
// street rolls, and from magnitude 11 (the shaking beats gravity) everything loose is thrown up and tumbles.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAMPS, POLES, TREES, CABLE, LANDMARKS, streetY, groundY } from './layout.js';
import { vAtMag, tossAt, V_GLASS, V_ROLL, V_FALL, V_AIR, V_PYRAMID } from './timeline.js';
import { quakeMat, quakeDepth, quakeD } from './quake.js';
import { rng, smooth, clamp, lerp } from './util.js';

const dummy = new THREE.Object3D();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
// thrown up by shaking stronger than gravity: hops of growing height, each object on its own rhythm
export function tossY(toss, v, seed) {
  if (toss <= 0) return 0;
  const ph = v * (2.2 + seed * 1.6) + seed * 40;
  const s = Math.sin(ph);
  return toss * (0.4 + 0.9 * seed) * Math.max(0, s) * Math.max(0, s);
}

// the cable car's frame at video time v: climbing at 9.5 mph; brakes at magnitude 6; slides back down the rolling
// street; derails at 9; thrown and tumbling from 11
const CAR_L = 8.6;
export function cableFrame(v) {
  const vStop = V_GLASS - 0.4;
  const e = clamp(v - vStop, 0, 0.6);
  let z = CABLE.z0 + CABLE.speed * Math.min(v, vStop) + CABLE.speed * e * (1 - e / 1.2);
  const back = Math.max(0, v - V_ROLL);
  z -= 0.6 * back * back;
  const derail = smooth(V_FALL, V_FALL + 2, v);
  const x = CABLE.x + 1.6 * derail;
  const y = streetY(z) + tossY(tossAt(v) * 0.8, v, 0.37);
  const slope = Math.atan2(streetY(z + 2) - streetY(z - 2), 4);
  const tum = v > V_AIR ? (v - V_AIR) * 1.4 * smooth(V_AIR, V_AIR + 1, v) : 0;
  return { x, y, z, slope, yaw: 0.35 * derail + tum * 0.5, rx: -slope + tum * 0.3, rz: 0.2 * derail * Math.sin(v * 2) + tum };
}

export function makeProps(scene, { plainMat, glowMat }) {
  const Q = (m) => quakeMat(m, { rigid: true });
  const cast = (m) => { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.customDepthMaterial = quakeDepth({ rigid: true }); return m; };
  const R = rng(321);
  // ---------- lamp posts: SF's tall double-arm posts ----------
  const lampGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.09, 0.14, 8.8, 8).translate(0, 4.4, 0),
    new THREE.BoxGeometry(2.2, 0.1, 0.1).translate(1.0, 8.6, 0),
    new THREE.BoxGeometry(0.6, 0.18, 0.3).translate(2.0, 8.5, 0),
  ].map((g) => g.toNonIndexed()));
  const lamps = cast(new THREE.InstancedMesh(lampGeo, Q(plainMat(0x3a3d40, 0.5, { metalness: 0.5 })), LAMPS.length));
  const poleGeo = new THREE.CylinderGeometry(0.11, 0.16, 9.5, 8).translate(0, 4.75, 0);
  const poles = cast(new THREE.InstancedMesh(poleGeo, Q(plainMat(0x2a2c2e, 0.6)), POLES.length));
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 4.0, 6).translate(0, 2.0, 0);
  const crownGeo = mergeGeometries([0, 1, 2, 3].map((k) => new THREE.IcosahedronGeometry(1.4 + 0.3 * (k % 2), 1).translate(Math.cos(k * 1.7) * 0.8, 4.4 + k * 0.4, Math.sin(k * 1.7) * 0.8).toNonIndexed()));
  const trunks = cast(new THREE.InstancedMesh(trunkGeo, Q(plainMat(0x4a3a2c, 0.95)), TREES.length));
  const crowns = cast(new THREE.InstancedMesh(crownGeo, Q(plainMat(0xffffff, 0.85, { flatShading: true })), TREES.length));
  const lc = new THREE.Color();
  TREES.forEach((t, i) => crowns.setColorAt(i, lc.setHSL(0.23 + R() * 0.06, 0.45, 0.22 + R() * 0.08)));
  scene.add(lamps, poles, trunks, crowns);
  // when each one goes over (once the street rolls), and which way
  for (const a of [...LAMPS, ...POLES, ...TREES]) {
    a.y0 = streetY(a.z);
    a.vTip = vAtMag(8.2 + R() * 1.6); a.tipDir = (R() - 0.5) * 2; a.yaw = R() * 6.28; a.seed = a.seed ?? R();
  }

  // ---------- the cable car (California line: red, cream band, open ends, people on the running boards) ----------
  const L = CAR_L, Wd = 2.5;
  const carParts = {
    body: mergeGeometries([new THREE.BoxGeometry(Wd, 1.2, L - 2.4).translate(0, 0.95, 0), new THREE.BoxGeometry(Wd + 0.3, 0.12, L).translate(0, 0.42, 0)].map((g) => g.toNonIndexed())),
    band: new THREE.BoxGeometry(Wd + 0.02, 1.05, L - 2.4).translate(0, 2.08, 0),
    roof: mergeGeometries([new THREE.BoxGeometry(Wd + 0.4, 0.16, L + 0.2).translate(0, 3.15, 0), new THREE.BoxGeometry(1.2, 0.3, L - 1).translate(0, 3.35, 0)].map((g) => g.toNonIndexed())),
    posts: mergeGeometries([-1, 1].flatMap((sx) => [-L / 2 + 0.15, -L / 2 + 1.1, L / 2 - 1.1, L / 2 - 0.15].map((z) => new THREE.CylinderGeometry(0.04, 0.04, 2.6, 5).translate(sx * (Wd / 2 + 0.1), 1.85, z).toNonIndexed()))),
    wheels: mergeGeometries([-1, 1].flatMap((sx) => [-2.8, 2.8].map((z) => new THREE.CylinderGeometry(0.38, 0.38, 0.18, 12).rotateZ(Math.PI / 2).translate(sx * 0.75, 0.38, z).toNonIndexed()))),
    glass: new THREE.BoxGeometry(Wd + 0.04, 0.75, L - 2.6).translate(0, 2.05, 0),
  };
  const carMats = {
    body: Q(plainMat(0x9a1c1a, 0.45)), band: Q(plainMat(0xe8dcc0, 0.6)), roof: Q(plainMat(0x2a2422, 0.7)),
    posts: Q(plainMat(0xc8a050, 0.3, { metalness: 0.8 })), wheels: Q(plainMat(0x111111, 0.8)), glass: Q(plainMat(0x1a2228, 0.15, { metalness: 0.6 })),
  };
  const cable = new THREE.Group();
  for (const k of Object.keys(carParts)) { const m = new THREE.Mesh(carParts[k], carMats[k]); m.castShadow = true; m.customDepthMaterial = quakeDepth({ rigid: true }); m.frustumCulled = false; cable.add(m); }
  scene.add(cable);

  // ---------- the Transamerica Pyramid: a white four-sided spire, 260 m, with its "wings" ----------
  const P = LANDMARKS.pyramid;
  const pyrGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.01, 37, 212, 4, 1).rotateY(Math.PI / 4).translate(0, 106, 0),
    new THREE.CylinderGeometry(0.3, 4, 48, 4).rotateY(Math.PI / 4).translate(0, 236, 0),
    new THREE.BoxGeometry(9, 70, 14).translate(18, 120, 0), new THREE.BoxGeometry(9, 70, 14).translate(-18, 120, 0),
  ].map((g) => g.toNonIndexed()));
  const pyrMat = quakeMat(new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.55 }), { sway: false, rigid: false });
  const pyramid = new THREE.Mesh(pyrGeo, pyrMat);
  pyramid.castShadow = true; pyramid.customDepthMaterial = quakeDepth({});
  const pyY = groundY(P.x, P.z);
  scene.add(pyramid);

  return {
    cable,
    frame(v, s, glows, smoke) {
      const toss = s.toss;
      // ---- posts and trees: sway, then go over; thrown up from magnitude 11 ----
      const place = (mesh, list, i, a, h) => {
        const tip = smooth(a.vTip, a.vTip + 1.2, v) * 1.45;
        const sw = (s.shake * 0.04 + s.roll * 0.02) * Math.sin(v * (3 + a.seed * 3) + a.seed * 9) * (1 - smooth(a.vTip, a.vTip + 0.3, v));
        const ty = tossY(toss, v, a.seed);
        dummy.position.set(a.x, a.y0 + ty, a.z);
        dummy.rotation.set(sw + tip * Math.cos(a.tipDir), a.yaw, tip * Math.sin(a.tipDir) + (ty > 0 ? ty * 0.3 : 0), 'YXZ');
        dummy.scale.setScalar(a.s ? a.s * 1.6 : 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      };
      LAMPS.forEach((a, i) => { a.s = 0; place(lamps, LAMPS, i, a); });
      POLES.forEach((a, i) => place(poles, POLES, i, a));
      TREES.forEach((a, i) => { place(trunks, TREES, i, a); crowns.setMatrixAt(i, dummy.matrix); });
      lamps.instanceMatrix.needsUpdate = true; poles.instanceMatrix.needsUpdate = true; trunks.instanceMatrix.needsUpdate = true; crowns.instanceMatrix.needsUpdate = true;
      // lamps are on (dusk); they flicker and die as the power goes (sparks where wires snap)
      for (const a of LAMPS) {
        const on = 1 - smooth(a.vTip - 0.6, a.vTip, v);
        const flick = v > V_GLASS && Math.sin(v * 37 + a.seed * 50) > 0.6 ? 0.3 : 1;
        const d = quakeD(a.x, a.y0, a.z);
        if (on > 0.02) glows.add(a.x - a.side * 2.0 + d.x, a.y0 + 8.4 + d.y, a.z + d.z, 1.6, 2.2 * on * flick, 1.7 * on * flick, 1.1 * on * flick);
        if (v > a.vTip - 0.8 && v < a.vTip + 0.4) {
          const Rs = rng(Math.floor(v * 40) + Math.floor(a.seed * 1000));
          if (Rs() < 0.6) glows.add(a.x - a.side * (0.5 + Rs() * 1.5), a.y0 + 6 + Rs() * 3, a.z + (Rs() - 0.5) * 2, 0.4 + Rs() * 0.6, 7, 6, 4);
        }
      }

      // ---- the cable car: climbing at 9.5 mph; brakes at magnitude 6; slides back down the hill on the rolling
      // street; derails; thrown and tumbling at 11 ----
      {
        const c = cableFrame(v);
        cable.position.set(c.x, c.y, c.z);
        cable.rotation.set(c.rx, c.yaw, c.rz, 'YXZ');
        s.cable = c;
        // its lights: the headlamp facing you, and the warm cabin glow
        if (v < V_FALL + 1) {
          const d = quakeD(c.x, c.y, c.z);
          glows.add(c.x + d.x, c.y + d.y + 2.9, c.z + d.z + L / 2 + 0.2, 1.0, 3, 2.7, 2.2);
          glows.add(c.x + d.x, c.y + d.y + 2.1, c.z + d.z, 3.5, 0.35, 0.25, 0.12);
        }
      }
      // ---- the pyramid: sways, then breaks at the base and topples to the north, in its own dust ----
      {
        const k = clamp((v - V_PYRAMID) / 3.2);
        const tip = 1.35 * k * k;
        pyramid.position.set(P.x, pyY - 2 - 30 * k * k, P.z);
        pyramid.rotation.set(0, 0, tip * 1.0 + (s.shake * 0.002 + s.roll * 0.0015) * Math.sin(v * 1.3));
        if (k > 0 && k < 1) for (let n = 0; n < 16; n++) {
          const Rr = rng(n * 31 + 7);
          const age = (v - V_PYRAMID) - n * 0.15;
          if (age < 0) continue;
          smoke.puff(P.x + (Rr() - 0.5) * 60 - 80 * k, pyY + 10 + Rr() * 40 + age * 6, P.z + (Rr() - 0.5) * 60, 20 + age * 10, 0.2 * (1 - smooth(3, 6, age)), 0.75, 0, Rr());
        }
      }
    },
  };
}

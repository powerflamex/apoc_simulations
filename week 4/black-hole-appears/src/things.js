// Everything loose that falls in: people, cars, lampposts, palms and posts, things on the ground (casino tokens,
// chips, cards, flyers, cups, bags, luggage, chairs, bins, cones), the shop windows' glass and dust in the air.
// Each one holds (people stand, lean away from it, grab a pole and swing out toward it; cars sit in the jam; poles
// bend) until the pull at its spot passes its strength, then falls along its own spiral (pull.js makeFall), tumbling,
// and is crushed into the glow. Pure functions of video time.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PEOPLE, CARS, POLES, PROPS, SHARDS, GLASS_K, VICTIM } from './layout.js';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { makeFleet } from './cars.js';
import { B, makeFall, fallAt, frame, spiralPos, pullWarp, aAt } from './pull.js';
import { vWhen, GEE, gmAt } from './timeline.js';
import { rng, clamp, smooth, wobble } from './util.js';

const v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), v5 = new THREE.Vector3();
const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), s4 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const zero = new THREE.Matrix4().makeScale(0, 0, 0);

// the hanging pose: hand on the pole, body along the effective gravity (down + a toward it)
function hangDir(hand, a, out) {
  out.subVectors(B, hand); out.y = 0; out.normalize().multiplyScalar(a); out.y -= 1;
  return out.normalize();
}

export function makeThings(scene, ctx) {
  const R = rng(777);
  const eaten = [];       // { v, size }: flashes in the glow when something is crushed

  // ---------------- people ----------------
  const crowdMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 });
  const crowd = makeCrowd(scene, PEOPLE.length, crowdMat, { castShadow: false });
  for (const p of PEOPLE) {
    crowd.color(p.i, p.shirt, p.pants, SKIN[Math.floor(R() * SKIN.length)], HAIR[Math.floor(R() * HAIR.length)], R() < 0.5);
    const home = new THREE.Vector3(p.x, 1.0, p.z);
    if (p.hold) {
      const pole = p.hold;
      p.hand = new THREE.Vector3(pole.x, 1.55, pole.z);
      // where the body hangs when they let go
      const u = hangDir(p.hand, p.k, new THREE.Vector3());
      const c = p.hand.clone().addScaledVector(u, 1.0);
      p.tGrab = vWhen(home.distanceTo(B), 0.35);
      p.tr = Math.min(vWhen(p.hand.distanceTo(B), p.k), vWhen(Math.hypot(pole.x - B.x, 4.5 - B.y, pole.z - B.z), pole.brk) - 0.02);
      p.fr = frame(c);
      p.F = makeFall(p.fr.r0, p.k, { tr: p.tr, lam: 0.2 + 0.2 * R(), rEat: 0.12 });
    } else {
      p.fr = frame(home);
      p.F = makeFall(p.fr.r0, p.k, { lam: 0.15 + 0.25 * R(), rEat: 0.12 });
      p.tr = p.F.tr;
    }
    p.spin = (R() - 0.5) * 9;
    p.ph = R() * 10;
  }
  function people(v, glows) {
    for (const p of PEOPLE) {
      const a = aAt(v, v3.set(p.x, 1.0, p.z));
      const toB = Math.atan2(B.x - p.x, B.z - p.z);
      if (v < p.tr) {
        if (p.hold && v > p.tGrab) {
          // grab the pole, then swing out toward it as the pull grows
          const ah = aAt(v, p.hand);
          const u = hangDir(p.hand, ah, v4);
          const g = smooth(p.tGrab, p.tGrab + 0.6, v);
          const feet = v5.copy(p.hand).addScaledVector(u, 1.95);
          // from standing beside the pole to hanging off it
          const fx = THREE.MathUtils.lerp(p.x, feet.x, g), fz = THREE.MathUtils.lerp(p.z, feet.z, g), fy = THREE.MathUtils.lerp(0, Math.max(feet.y, 0), g);
          const up = v3.copy(u).negate();
          const yaw = Math.atan2(up.x, up.z) || toB + Math.PI;
          const pitch = Math.acos(clamp(up.y, -1, 1)) * g;
          crowd.pose(p.i, { x: fx, y: fy, z: fz, yaw: g > 0.5 ? yaw : toB + Math.PI, s: p.s, pitch: g > 0.5 ? pitch : -0.2 * g, armL: 1.6 * g, armR: 1.6 * g, walk: v * 9 + p.ph, stride: (1 - g) * 0.4 + 0.25 * Math.min(ah, 2) * g, look: 0.2 });
        } else {
          // standing: watching it, phones up; then leaning back from it, staggering, arms out
          const lean = Math.atan(a) * 0.75;
          const stag = smooth(0.25, 0.9, a);
          const step = smooth(0.4, 1.0, a) * 0.35;          // dragged a little toward it before they go
          const x = p.x + Math.sin(toB) * step, z = p.z + Math.cos(toB) * step;
          const flail = stag * (0.6 + 0.4 * Math.sin(v * 7 + p.ph));
          crowd.pose(p.i, {
            x, y: 0, z, yaw: toB + wobble(v * 0.6, p.ph) * 0.3 * (1 - stag), s: p.s, pitch: -lean,
            walk: v * (2 + 8 * stag) + p.ph, stride: 0.15 * stag + 0.05,
            armL: p.phone && stag < 0.3 ? 0.2 : 0.4 + flail * 0.9, armR: p.phone && stag < 0.3 ? 1.0 : 0.3 + flail * 1.1, look: 0.15 + 0.3 * stag,
          });
        }
        continue;
      }
      const f = fallAt(p.F, v);
      if (f.gone) { crowd.pose(p.i, { x: 0, y: 0, z: 0, visible: false }); continue; }
      spiralPos(p.fr, f.r, f.th, v4);
      // tumbling head first, arms and legs flailing, shrinking into it at the end
      const t = f.age;
      const s = p.s * Math.pow(clamp(f.r / 1.6), 0.6);
      const dir = v5.subVectors(B, v4).normalize();
      crowd.pose(p.i, {
        x: v4.x, y: v4.y - 1.0 * s, z: v4.z, yaw: Math.atan2(dir.x, dir.z) + p.spin * t * 0.3, s,
        pitch: Math.min(1.4, t * 3) + p.spin * t * 0.5, roll: p.spin * t * 0.4,
        armL: 1.6, armR: 1.3 + 0.3 * Math.sin(t * 13), walk: t * 14, stride: 1.2, look: 0.5,
      });
    }
    crowd.commit();
  }

  // ---------------- cars ----------------
  const fleet = makeFleet(scene, CARS.length, ctx);
  for (const c of CARS) {
    fleet.color(c.i, c.col, c.kind);
    const home = new THREE.Vector3(c.x, 0.75, c.z);
    c.fr = frame(home);
    c.F = makeFall(c.fr.r0, c.k, { lam: 0.15 + 0.2 * R(), rEat: 0.3 });
    c.spin = (R() - 0.5) * 3;
    c.tumble = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(4);
    c.yaw0 = c.dir > 0 ? Math.PI : 0;
  }
  function cars(v) {
    for (const c of CARS) {
      if (v < c.F.tr) {
        // in the jam: stopped, rocking a little as the pull grows
        const a = aAt(v, v3.set(c.x, 0.75, c.z));
        const rock = smooth(0.2, 0.7, a) * 0.03;
        e4.set(wobble(v * 5, c.seed * 9) * rock, c.yaw0, wobble(v * 6, c.seed * 7) * rock);
        q4.setFromEuler(e4);
        m4.compose(v4.set(c.x, 0, c.z), q4, s4.set(1, 1, 1));
        fleet.set(c.i, m4, true);
        continue;
      }
      const f = fallAt(c.F, v);
      if (f.gone) { fleet.set(c.i, zero, false); continue; }
      spiralPos(c.fr, f.r, f.th, v4);
      const t = f.age;
      // slides first (yawing), then lifts and tumbles once it is close
      const air = smooth(10, 3, f.r);
      e4.set(c.tumble.x * t * air, c.yaw0 + c.spin * t, c.tumble.z * t * air);
      q4.setFromEuler(e4);
      const s = Math.pow(clamp(f.r / 4.0), 0.7);
      m4.compose(v4.setY(v4.y - 0.75 * s), q4, s4.set(s, s, s));
      fleet.set(c.i, m4, f.r > 2);
    }
    fleet.commit();
  }

  // ---------------- lampposts, palms, posts ----------------
  const plainMat = ctx.plainMat;
  const lampGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.09, 0.14, 1, 8).translate(0, 0.5, 0).toNonIndexed(),
  ]);
  const armGeo = new THREE.BoxGeometry(1, 0.08, 0.08).translate(0.5, 0, 0);
  const headGeo = new THREE.BoxGeometry(0.6, 0.14, 0.3);
  const trunkGeo = new THREE.CylinderGeometry(0.17, 0.26, 1, 7, 4).translate(0, 0.5, 0);
  const frondGeo = new THREE.ConeGeometry(0.5, 3.2, 4, 1).rotateX(Math.PI / 2).scale(1, 0.12, 1).translate(0, 0, 1.6);
  const postGeo = new THREE.CylinderGeometry(0.04, 0.04, 1, 6).translate(0, 0.5, 0);
  const plateGeo = new THREE.BoxGeometry(0.45, 0.6, 0.03);
  const lamps = POLES.filter((p) => p.kind === 'lamp'), palms = POLES.filter((p) => p.kind === 'palm'), posts = POLES.filter((p) => p.kind === 'post');
  const mk = (g, m, n) => { const x = new THREE.InstancedMesh(g, m, n); x.frustumCulled = false; scene.add(x); return x; };
  const metal = plainMat(0x3a3d42, 0.45, { metalness: 0.6 });
  const lampM = mk(lampGeo, metal, lamps.length), armM = mk(armGeo, metal, lamps.length), headM = mk(headGeo, ctx.glowMat(new THREE.Color(3.0, 2.0, 1.0)), lamps.length);
  const trunkM = mk(trunkGeo, plainMat(0x5a4632, 0.95), palms.length), frondM = mk(frondGeo, plainMat(0x2f4a22, 0.8, { side: THREE.DoubleSide }), palms.length * 7);
  const postM = mk(postGeo, metal, posts.length), plateM = mk(plateGeo, plainMat(0x1d5a2c, 0.5), posts.length);
  for (const p of POLES) {
    const mid = new THREE.Vector3(p.x, p.h * 0.5, p.z);
    p.fr = frame(mid);
    p.F = makeFall(p.fr.r0, p.brk, { lam: 0.2 + 0.2 * R(), rEat: 0.4, tr: vWhen(p.fr.r0, p.brk) });
    p.spin = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(3);
    p.ph = R() * 6;
    p.yaw = p.kind === 'lamp' ? (p.arm > 0 ? 0 : Math.PI) : R() * 6.28;
  }
  // the pose of a pole: its base and rotation (lean toward it about the base, then free), and a shrink
  const poleQ = new THREE.Quaternion(), axis = new THREE.Vector3();
  function poleFrame(p, v, out) {
    if (v < p.F.tr) {
      const a = aAt(v, v3.set(p.x, p.h * 0.5, p.z));
      const th = 0.45 * (1 - Math.exp(-a / 1.2)) + (p.kind === 'palm' ? 0.04 * smooth(0.1, 0.6, a) * Math.sin(v * 5 + p.ph) : 0);
      axis.set(B.z - p.z, 0, -(B.x - p.x)).normalize();
      poleQ.setFromAxisAngle(axis, -th);
      out.base.set(p.x, 0, p.z); out.s = 1; out.free = false;
      out.q.copy(poleQ).multiply(q4.setFromAxisAngle(UP, p.yaw));
      return out;
    }
    const f = fallAt(p.F, v);
    if (f.gone) { out.s = 0; return out; }
    spiralPos(p.fr, f.r, f.th, v4);
    const t = f.age;
    e4.set(p.spin.x * t, p.yaw + p.spin.y * t, p.spin.z * t + 0.45);
    out.q.setFromEuler(e4);
    out.s = Math.pow(clamp(f.r / (p.h * 0.6)), 0.7);
    // the base sits half a length below the centre along the pole's axis
    out.base.copy(v4).addScaledVector(v5.set(0, 1, 0).applyQuaternion(out.q), -p.h * 0.5 * out.s);
    out.free = true;
    return out;
  }
  const PF = { base: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1, free: false };
  const loc = new THREE.Matrix4(), w4 = new THREE.Matrix4();
  function poles(v, glows) {
    lamps.forEach((p, i) => {
      poleFrame(p, v, PF);
      if (PF.s <= 0) { lampM.setMatrixAt(i, zero); armM.setMatrixAt(i, zero); headM.setMatrixAt(i, zero); return; }
      w4.compose(PF.base, PF.q, s4.setScalar(PF.s));
      lampM.setMatrixAt(i, m4.copy(w4).multiply(loc.makeScale(1, p.h, 1)));
      armM.setMatrixAt(i, m4.copy(w4).multiply(loc.makeTranslation(0, p.h - 0.2, 0)).multiply(new THREE.Matrix4().makeScale(2.6, 1, 1)));
      headM.setMatrixAt(i, m4.copy(w4).multiply(loc.makeTranslation(2.5, p.h - 0.32, 0)));
      // the lamp's glow (flickers once the pull is strong, dies when it snaps)
      v4.set(2.5, p.h - 0.4, 0).applyMatrix4(w4);
      const a = aAt(v, v4);
      const on = PF.free ? 0 : (1 - smooth(2.5, 5, a)) * (a > 1.5 ? (0.5 + 0.5 * Math.sign(Math.sin(v * 31 + p.ph * 5))) : 1);
      if (on > 0) glows.add(v4.x, v4.y, v4.z, 1.3, 1.6 * on, 0.95 * on, 0.45 * on);
    });
    palms.forEach((p, i) => {
      poleFrame(p, v, PF);
      if (PF.s <= 0) { trunkM.setMatrixAt(i, zero); for (let j = 0; j < 7; j++) frondM.setMatrixAt(i * 7 + j, zero); return; }
      w4.compose(PF.base, PF.q, s4.setScalar(PF.s));
      trunkM.setMatrixAt(i, m4.copy(w4).multiply(loc.makeScale(1, p.h, 1)));
      // fronds: drooping from the top, streaming toward it as the pull grows
      const a = aAt(v, v3.set(p.x, p.h, p.z));
      const stream = PF.free ? 1 : smooth(0.1, 1.2, a);
      for (let j = 0; j < 7; j++) {
        const yaw = (j / 7) * Math.PI * 2 + p.seed * 3;
        const droop = 0.55 - 0.25 * (j % 2) + 0.05 * Math.sin(v * 2 + j);
        e4.set(droop * (1 - stream * 0.6), yaw, 0, 'YXZ');
        q4.setFromEuler(e4);
        loc.compose(v5.set(0, p.h, 0), q4, s4.set(1, 1, 1));
        frondM.setMatrixAt(i * 7 + j, m4.copy(w4).multiply(loc));
      }
    });
    posts.forEach((p, i) => {
      poleFrame(p, v, PF);
      if (PF.s <= 0) { postM.setMatrixAt(i, zero); plateM.setMatrixAt(i, zero); return; }
      w4.compose(PF.base, PF.q, s4.setScalar(PF.s));
      postM.setMatrixAt(i, m4.copy(w4).multiply(loc.makeScale(1, p.h, 1)));
      plateM.setMatrixAt(i, m4.copy(w4).multiply(loc.makeTranslation(0, p.h - 0.35, 0.05)));
    });
    for (const x of [lampM, armM, headM, trunkM, frondM, postM, plateM]) x.instanceMatrix.needsUpdate = true;
  }

  // ---------------- props ----------------
  const TYPES = {
    coin: { g: new THREE.CylinderGeometry(0.02, 0.02, 0.004, 10), m: plainMat(0xe8c050, 0.25, { metalness: 0.9, emissive: new THREE.Color(0.25, 0.18, 0.05) }), y: 0.002 },
    chip: { g: new THREE.CylinderGeometry(0.02, 0.02, 0.0045, 10), m: plainMat(0xffffff, 0.5), y: 0.003, colors: [0xc81e1e, 0x1e3ec8, 0x1e8a3a, 0x111111, 0xe8e8e8] },
    card: { g: new THREE.BoxGeometry(0.063, 0.0006, 0.088), m: plainMat(0xf4f0e8, 0.6, { emissive: new THREE.Color(0.06, 0.06, 0.06) }), y: 0.001 },
    paper: { g: new THREE.BoxGeometry(0.21, 0.0008, 0.28), m: plainMat(0xffffff, 0.8, { emissive: new THREE.Color(0.05, 0.05, 0.05) }), y: 0.001, colors: [0xf8f8f8, 0xf2ead8, 0xfff2b0, 0xf8f8f8] },
    cup: { g: new THREE.CylinderGeometry(0.045, 0.032, 0.13, 10).translate(0, 0.065, 0), m: plainMat(0xffffff, 0.6), y: 0, colors: [0xd8262a, 0xf2f2f2, 0x2a6ad8] },
    bag: { g: new THREE.BoxGeometry(0.32, 0.36, 0.12).translate(0, 0.18, 0), m: plainMat(0xffffff, 0.7), y: 0, colors: [0x1a1a1a, 0xd8b04a, 0xb02a6a, 0xf0f0f0] },
    case: { g: new THREE.BoxGeometry(0.42, 0.62, 0.26).translate(0, 0.36, 0), m: plainMat(0xffffff, 0.5), y: 0, colors: [0x2a3a6a, 0x8a1f1f, 0x222222, 0xc0c4c8] },
    chair: { g: mergeGeometries([new THREE.BoxGeometry(0.45, 0.04, 0.45).translate(0, 0.45, 0), new THREE.BoxGeometry(0.45, 0.45, 0.04).translate(0, 0.68, -0.21), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => new THREE.BoxGeometry(0.035, 0.45, 0.035).translate(a * 0.2, 0.225, b * 0.2))]), m: plainMat(0x9a9ea4, 0.4, { metalness: 0.7 }), y: 0 },
    can: { g: new THREE.CylinderGeometry(0.3, 0.27, 0.95, 12).translate(0, 0.475, 0), m: plainMat(0x1f3a2a, 0.6), y: 0 },
    cone: { g: new THREE.ConeGeometry(0.17, 0.5, 10).translate(0, 0.25, 0), m: plainMat(0xff6a1a, 0.6, { emissive: new THREE.Color(0.2, 0.05, 0) }), y: 0 },
    leaf: { g: new THREE.BoxGeometry(0.55, 0.01, 0.14), m: plainMat(0x4a5a2a, 0.8, { side: THREE.DoubleSide }), y: 0.005 },
  };
  const byType = {};
  for (const p of PROPS) (byType[p.type] = byType[p.type] || []).push(p);
  const propMeshes = [];
  for (const [type, list] of Object.entries(byType)) {
    const T = TYPES[type];
    const mesh = mk(T.g, T.m, list.length);
    list.forEach((p, j) => {
      p.j = j;
      if (T.colors) mesh.setColorAt(j, new THREE.Color(T.colors[Math.floor(R() * T.colors.length)]));
      const home = new THREE.Vector3(p.x, p.y + 0.05, p.z);
      p.fr = frame(home);
      p.F = makeFall(p.fr.r0, p.k, { lam: 0.3 + 0.4 * R(), vt: p.vt, rEat: 0.05 });
      p.spin = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(p.vt > 0 ? 14 : 6);
      p.yaw = R() * 6.28;
      p.flut = R() * 6;
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    propMeshes.push({ mesh, list, T });
  }
  function props(v, glows) {
    for (const { mesh, list, T } of propMeshes) {
      for (const p of list) {
        if (v < p.F.tr) {
          // on the ground (or fluttering in the air where they hang), twitching as the pull grows
          const a = aAt(v, v3.set(p.x, p.y, p.z));
          const tw = smooth(0.3, 1, a / p.k) * 0.15;
          e4.set(tw * Math.sin(v * 9 + p.flut), p.yaw, 0);
          q4.setFromEuler(e4);
          m4.compose(v4.set(p.x, p.y + T.y, p.z), q4, s4.set(1, 1, 1));
          mesh.setMatrixAt(p.j, m4);
          continue;
        }
        const f = fallAt(p.F, v);
        if (f.gone) { mesh.setMatrixAt(p.j, zero); continue; }
        spiralPos(p.fr, f.r, f.th, v4);
        const t = f.age;
        e4.set(p.spin.x * t + (p.vt > 0 ? Math.sin(t * 5 + p.flut) : 0), p.yaw + p.spin.y * t, p.spin.z * t);
        q4.setFromEuler(e4);
        const s = Math.pow(clamp(f.r / 0.5), 0.5);
        m4.compose(v4, q4, s4.set(s, s, s));
        mesh.setMatrixAt(p.j, m4);
        // tokens and chips catch the light as they tumble in
        if ((p.type === 'coin') && f.r < 4 && Math.sin(t * 17 + p.flut * 3) > 0.92) glows.add(v4.x, v4.y, v4.z, 0.05, 1.6, 1.3, 0.7);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------------- glass from the shop windows ----------------
  const shardGeo = new THREE.BufferGeometry();
  shardGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.4, 0, 0.5, -0.5, 0, 0.1, 0.55, 0], 3));
  shardGeo.computeVertexNormals();
  const shardM = mk(shardGeo, new THREE.MeshStandardMaterial({ color: 0xbfe0ff, roughness: 0.05, metalness: 0.9, emissive: new THREE.Color(0.25, 0.32, 0.4), side: THREE.DoubleSide, transparent: true, opacity: 0.85 }), SHARDS.length);
  for (const s of SHARDS) {
    s.tr = vWhen(Math.hypot(s.x - B.x, s.cy - B.y, s.cz - B.z), GLASS_K);
    s.start = pullWarp(new THREE.Vector3(s.x, s.y, s.z), s.tr, 10, 3, 0.4);
    s.fr = frame(s.start);
    s.F = makeFall(s.fr.r0, GLASS_K, { tr: s.tr, lam: 0.2 + 0.4 * R(), rEat: 0.05 });
    s.spin = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(20);
  }
  function shards(v, glows) {
    SHARDS.forEach((s, i) => {
      if (v < s.tr) { shardM.setMatrixAt(i, zero); return; }
      const f = fallAt(s.F, v);
      if (f.gone) { shardM.setMatrixAt(i, zero); return; }
      spiralPos(s.fr, f.r, f.th, v4);
      const t = f.age;
      e4.set(s.spin.x * t, s.spin.y * t, s.spin.z * t);
      q4.setFromEuler(e4);
      const k = s.s * Math.pow(clamp(f.r / 0.6), 0.5);
      m4.compose(v4, q4, s4.set(k, k, k));
      shardM.setMatrixAt(i, m4);
      if (Math.sin(t * 23 + s.seed * 40) > 0.85) glows.add(v4.x, v4.y, v4.z, 0.12, 0.9, 1.0, 1.2);
    });
    shardM.instanceMatrix.needsUpdate = true;
  }

  // ---------------- dust in the air ----------------
  const DUST = [];
  for (let i = 0; i < 1400; i++) {
    const r = 0.7 * Math.pow(500 / 0.7, Math.pow(R(), 1.3));
    const a = R() * Math.PI * 2, y = 0.15 + Math.pow(R(), 2) * Math.min(14, 2 + r * 0.3);
    const home = new THREE.Vector3(B.x + Math.cos(a) * r, y, B.z + Math.sin(a) * r);
    const fr = frame(home);
    DUST.push({ fr, F: makeFall(fr.r0, 0.015 + R() * 0.04, { lam: 0.3 + 0.5 * R(), vt: 1.5 + R() * 2.5, rEat: 0.03 }), size: 0.012 + R() * 0.02, tw: R() * 6 });
  }
  function dust(v, glows) {
    for (const d of DUST) {
      if (v < d.F.tr) continue;
      const f = fallAt(d.F, v);
      if (f.gone || f.r > 60) continue;
      spiralPos(d.fr, f.r, f.th, v4);
      // lit by its glow (bright close in) and the street
      const lit = 0.05 + Math.min(0.35, 0.12 / (f.r * f.r + 0.3));
      const tw = 0.7 + 0.3 * Math.sin(v * 11 + d.tw);
      glows.add(v4.x, v4.y, v4.z, d.size * (1 + 0.15 * Math.min(f.sp, 20)), 1.0 * lit * tw, 0.9 * lit * tw, 0.8 * lit * tw);
    }
  }

  // ---------------- the spiral right round it at the start: chips, cards and flyers whirling in ----------------
  // (a steady stream: each piece comes in from ~1.3 m, winds round on a tipped plane facing the first camera and
  // vanishes into it; then the next. Fades out by 8 s, when the loose things on the ground have taken over.)
  const SWN = new THREE.Vector3(0.18, 0.882, 0.44).normalize();
  const SWE1 = new THREE.Vector3().crossVectors(UP, SWN).normalize(), SWE2 = new THREE.Vector3().crossVectors(SWN, SWE1);
  const swirl = [['chip', 48, 1.9], ['card', 34, 1.3], ['paper', 12, 0.8]].map(([type, n, sc]) => {
    const T = TYPES[type];
    const mesh = mk(T.g, T.m, n);
    const list = [];
    for (let j = 0; j < n; j++) {
      if (T.colors) mesh.setColorAt(j, new THREE.Color([0xd8262a, 0x2a5ad8, 0x22a050, 0xf2f2f2, 0xe8b020][j % 5]));
      list.push({ T: 1.5 + R() * 1.8, ph: R(), a: R() * 6.28, sc, spin: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(14), off: (R() - 0.5) * 0.08 });
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return { mesh, list };
  });
  function spiral(v) {
    const fade = 1 - smooth(6, 8, v);
    for (const { mesh, list } of swirl) {
      list.forEach((p, j) => {
        if (fade <= 0) { mesh.setMatrixAt(j, zero); return; }
        const u = ((v / p.T + p.ph) % 1 + 1) % 1;
        const r = 0.03 + 1.3 * Math.pow(1 - u, 1.7);
        const th = p.a + 2.8 * Math.log(1.33 / r) + 0.8 * v;
        v4.copy(B).addScaledVector(SWE1, Math.cos(th) * r).addScaledVector(SWE2, Math.sin(th) * r).addScaledVector(SWN, p.off * r);
        const t = u * p.T;
        e4.set(p.spin.x * t, p.spin.y * t, p.spin.z * t);
        q4.setFromEuler(e4);
        const s = p.sc * smooth(0, 0.1, u) * smooth(0.12, 0.4, r) * fade;
        m4.compose(v4, q4, s4.set(s, s, s));
        mesh.setMatrixAt(j, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // what was crushed in the last moments (for the flashes in the glow and the light it throws)
  const ALL = [...PEOPLE.map((p) => [p.F, 1.0]), ...CARS.map((c) => [c.F, 2.0]), ...POLES.map((p) => [p.F, 1.2]), ...PROPS.map((p) => [p.F, 0.15])];
  function crushRate(v, win = 0.35) {
    let n = 0;
    for (const [F, w] of ALL) { const dt = v - F.tEnd; if (dt > 0 && dt < win) n += w * (1 - dt / win); }
    return n;
  }

  return {
    crowd, fleet,
    frame(v, glows) { people(v, glows); cars(v); poles(v, glows); props(v, glows); shards(v, glows); dust(v, glows); spiral(v); },
    crushRate,
    victim: VICTIM,
  };
}

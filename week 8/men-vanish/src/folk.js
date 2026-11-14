// Draws the people of every scene (people.js plans them): the bodies (crowd.js), the women's long hair and skirts,
// a pregnant belly, prams, phones (their screens light up after dark), and at the vanishing the men's clothes falling
// into heaps on the pavement with their shoes, and what they held dropping (phones, bags, coffee cups).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCrowd } from './crowd.js';
import { PEOPLE, ITEMS, HEAPS, personAt, itemAt, heapAt, HEAP_T, SCENE_OF } from './people.js';
import { V_EVENT, V_MORN, V_BOOM, V_TRUCK, V_BABY } from './timeline.js';
import { planeAt } from './plane.js';
import { smooth, clamp, rng } from './util.js';

const HIP = 0.9, SHOULDER = 1.42;

export function makeFolk(scene, ctx, crane) {
  const mat = ctx.plainMat(0xffffff, 0.82);
  const crowd = makeCrowd(scene, PEOPLE.length, mat, { castShadow: true });
  PEOPLE.forEach((p) => crowd.color(p.i, p.shirt, p.skirt || p.pants, p.skin, p.hair, p.sleeves));
  const tmpC = new THREE.Color();
  const W = PEOPLE.filter((p) => !p.man);
  const wIdx = new Int32Array(PEOPLE.length).fill(-1); W.forEach((p, k) => (wIdx[p.i] = k));
  const longHair = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8).scale(0.13, 0.26, 0.085).translate(0, SHOULDER + 0.1, -0.08), ctx.plainMat(0xffffff, 0.75), W.length);
  const skirt = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.28, 0.52, 12, 1, true).translate(0, HIP - 0.17, 0), ctx.plainMat(0xffffff, 0.85, { side: THREE.DoubleSide }), W.length);
  const bump = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 12, 10).scale(1, 1.05, 0.95).translate(0, HIP + 0.2, 0.1), ctx.plainMat(0xffffff, 0.85), W.length);
  W.forEach((p, k) => { longHair.setColorAt(k, tmpC.set(p.hair)); skirt.setColorAt(k, tmpC.set(p.skirt || 0)); bump.setColorAt(k, tmpC.set(p.shirt)); });
  // prams: a deep body, a hood, a handle, four wheels
  const pramGeo = mergeGeometries([
    new THREE.BoxGeometry(0.5, 0.36, 0.8).translate(0, 0.62, 0),
    new THREE.SphereGeometry(0.34, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.75, 0.9, 0.9).translate(0, 0.8, -0.18),
    new THREE.BoxGeometry(0.46, 0.04, 0.04).translate(0, 1.02, -0.62),
    new THREE.BoxGeometry(0.03, 0.5, 0.03).rotateX(-0.5).translate(-0.2, 0.8, -0.5),
    new THREE.BoxGeometry(0.03, 0.5, 0.03).rotateX(-0.5).translate(0.2, 0.8, -0.5),
    ...[[-0.24, 0.3], [0.24, 0.3], [-0.24, -0.3], [0.24, -0.3]].map(([x, z]) => new THREE.CylinderGeometry(0.13, 0.13, 0.04, 12).rotateZ(Math.PI / 2).translate(x, 0.13, z)),
  ].map((g) => g.toNonIndexed()));
  const PR = PEOPLE.filter((p) => p.pram);
  const pram = new THREE.InstancedMesh(pramGeo, ctx.plainMat(0xffffff, 0.7), Math.max(1, PR.length));
  const pIdx = new Int32Array(PEOPLE.length).fill(-1); PR.forEach((p, k) => { pIdx[p.i] = k; pram.setColorAt(k, tmpC.set([0x2a3a5a, 0x5a2a3a, 0x3a3a3a, 0x7a8a9a, 0x2a5a4a][k % 5])); });
  // the clothes left behind: a shirt (or a suit jacket) and trousers, falling and crumpling into a heap; the shoes
  const lumpy = (w, h, d, seed) => {
    const g = new THREE.BoxGeometry(w, h, d, 4, 4, 4);
    const a = g.attributes.position, R = rng(seed);
    const ph = [R() * 6, R() * 6, R() * 6];
    for (let i = 0; i < a.count; i++) {
      const x = a.getX(i), y = a.getY(i), z = a.getZ(i);
      const k = 1 + 0.12 * Math.sin(x * 17 + ph[0]) * Math.sin(z * 13 + ph[1]) + 0.08 * Math.sin(y * 21 + x * 9 + ph[2]);
      a.setXYZ(i, x * k, y * k, z * k);
    }
    g.computeVertexNormals();
    return g;
  };
  const shirtH = new THREE.InstancedMesh(lumpy(0.36, 0.5, 0.2, 3), ctx.plainMat(0xffffff, 0.9), HEAPS.length);
  const pantsH = new THREE.InstancedMesh(lumpy(0.3, 0.88, 0.17, 7), ctx.plainMat(0xffffff, 0.9), HEAPS.length);
  const shoes = new THREE.InstancedMesh(mergeGeometries([new THREE.BoxGeometry(0.11, 0.09, 0.27).translate(-0.09, 0.045, 0.04), new THREE.BoxGeometry(0.11, 0.09, 0.27).translate(0.1, 0.045, -0.02)]), ctx.plainMat(0x1a1612, 0.5), HEAPS.length);
  HEAPS.forEach((h, k) => { shirtH.setColorAt(k, tmpC.set(h.shirt)); pantsH.setColorAt(k, tmpC.set(h.pants)); });
  // what they held: bags, phones, coffee cups
  const itemGeo = [new THREE.BoxGeometry(0.36, 0.27, 0.1).translate(0, 0.135, 0), new THREE.BoxGeometry(0.075, 0.012, 0.155).translate(0, 0.006, 0), null, new THREE.CylinderGeometry(0.045, 0.035, 0.14, 10).translate(0, 0.07, 0)];
  const itemMesh = itemGeo.map((g) => (g ? new THREE.InstancedMesh(g, ctx.plainMat(0xffffff, 0.6), Math.max(1, ITEMS.length)) : null));
  ITEMS.forEach((it, i) => itemMesh[it.kind].setColorAt(i, tmpC.set(it.color)));
  // the first new baby: a bundle in a cream blanket, a tiny face
  const baby = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10).scale(0.11, 0.1, 0.21), ctx.plainMat(0xf4c8d4, 0.9), 1);
  const babyHead = new THREE.InstancedMesh(new THREE.SphereGeometry(0.068, 12, 10), ctx.plainMat(0xf0c0a0, 0.7), 1);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (const m of [longHair, skirt, bump, pram, shirtH, pantsH, shoes, baby, babyHead, ...itemMesh.filter(Boolean)]) {
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m);
    for (let i = 0; i < m.count; i++) m.setMatrixAt(i, zero);
  }

  const base = new THREE.Matrix4(), loc = new THREE.Matrix4(), m4 = new THREE.Matrix4(), m5 = new THREE.Matrix4();
  const e = new THREE.Euler(), q = new THREE.Quaternion(), vv = new THREE.Vector3(), sc = new THREE.Vector3();
  const bodyFrame = (o) => {
    const bob = Math.abs(Math.cos(o.walk || 0)) * 0.045 * (o.stride || 0);
    e.set((o.pitch || 0) + 0.06 * (o.sit || 0), o.yaw, 0, 'YXZ'); q.setFromEuler(e);
    vv.set(o.x, (o.y || 0) + bob - (o.sit || 0) * 0.42, o.z); sc.setScalar(o.s);
    return base.compose(vv, q, sc);
  };
  const aimYaw = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
  const blendYaw = (a, b, k) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * k; };

  return {
    crowd,
    frame(v, s, glows) {
      const sceneNow = SCENE_OF(v);
      const tau = v - V_EVENT;
      const dark = s.dark;
      const load = crane.loadPos();
      const pl = planeAt(Math.min(Math.max(v, V_MORN), V_BOOM - 0.05)).pos;
      const day = s.day;
      for (const p of PEOPLE) {
        const i = p.i, wk = wIdx[i];
        let show = p.scene === sceneNow;
        if (p.scene === 'rush' && p.man && v >= V_EVENT) show = false;
        if (p.tA !== undefined) show = show && v >= p.tA && v < p.tB;
        if (!show) {
          crowd.pose(i, { x: 0, y: 0, z: 0, visible: false });
          if (wk >= 0) { longHair.setMatrixAt(wk, zero); skirt.setMatrixAt(wk, zero); bump.setMatrixAt(wk, zero); }
          if (pIdx[i] >= 0) pram.setMatrixAt(pIdx[i], zero);
          continue;
        }
        const at = personAt(p, v);
        const walk = at.moving ? at.d * 3.9 + p.ph : 0;
        let yaw = at.yaw, look = 0.05, armL = 0, armR = 0, sit = 0, pitch = 0, y = p.y0 || 0, preg = 0;
        if (p.kind === 'wait' && p.scene !== 'rush') yaw = p.yaw + Math.sin(v * 0.7 + p.ph) * 0.15;
        if (p.scene === 'rush' && !p.man && v >= V_EVENT) {
          // the women: a start, a look round, then toward the crashes in the intersection; phones out; a few kneel
          const te = (p.stopAt ?? V_EVENT + 0.2);
          const startle = smooth(V_EVENT + 0.05, V_EVENT + 0.25, v) * (1 - smooth(V_EVENT + 0.6, V_EVENT + 1.3, v));
          const lookRound = smooth(te + 0.3, te + 1.6, v);
          yaw = at.yaw + p.turn * lookRound + Math.sin(v * 0.8 + p.ph) * 0.3 * lookRound;
          const crash = smooth(2.3 + 0.4 * (p.ph % 1), 2.9 + 0.4 * (p.ph % 1), v);
          yaw = blendYaw(yaw, aimYaw(at.x, at.z, -6, -17), crash * 0.75);
          armL = 0.45 * startle; armR = 0.45 * startle; pitch = -0.04 * startle;
          if (p.cover) { armR = Math.max(armR, 1.25 * smooth(V_EVENT + 0.4, V_EVENT + 0.9, v)); look = -0.05; }
          if (p.callPhone) armR = Math.max(armR, 1.0 * smooth(V_EVENT + 1.4, V_EVENT + 2.2, v));
          if (p.kneel) sit = 0.6 * smooth(V_EVENT + 1.0, V_EVENT + 1.9, v);
        } else if (p.scene === 'morning') {
          // the next morning, among the clothes: then up at the jet, then toward its smoke
          if (p.callPhone) armR = 1.0;
          look = -0.25;
          const up = smooth(V_MORN + 0.3 + 0.4 * (p.ph % 1), V_MORN + 1.1 + 0.4 * (p.ph % 1), v) * (1 - smooth(V_BOOM + 0.4, V_BOOM + 1.2, v));
          if (up > 0) { yaw = blendYaw(yaw, aimYaw(at.x, at.z, pl[0], pl[2]), up * 0.9); look = look + (0.85 - look) * up; if (p.ph % 1 < 0.3) armR = Math.max(armR, 1.3 * up); }
          const smk = smooth(V_BOOM + 0.3, V_BOOM + 1.0, v);
          if (smk > 0) { yaw = blendYaw(yaw, aimYaw(at.x, at.z, 4, -650), smk * 0.9); look = Math.max(look, 0.2 * smk); if (p.ph % 1 < 0.3) { armL = Math.max(armL, 1.25 * smk); armR = Math.max(armR, 1.25 * smk); } }
        } else if (p.scene === 'crane') {
          if (p.lookUp) { yaw = blendYaw(yaw, aimYaw(at.x, at.z, load.x, load.z), at.moving ? 0.3 : 0.9); look = 0.7; }
        } else if (p.scene === 'dusk' || p.scene === 'highway' || p.scene === 'shops') {
          if (p.callPhone) armR = 1.0;
          if (p.scene === 'shops') { armL = 0.25; }
        } else if (p.bench) {
          // on the bench, every morning: her belly grows (from about month 3), her clothes change with the months
          sit = 1; y = 0.03; look = -0.1 + 0.1 * Math.sin(day * 0.7); armL = 0.15; armR = 0.1;
          preg = smooth(70, 265, day);
          const month = Math.floor(day / 26);
          const OUT = [0x2a5a9a, 0x7a2a3a, 0x3a3a40, 0x2b2d42, 0x5a3a2a, 0x3a5a7a, 0xe8b0b8, 0xf4efe4, 0x8ecae6, 0xf4a261, 0xe9c46a];
          const c = OUT[month % OUT.length];
          if (p.lastC !== c) { crowd.color(i, c, 0x2b2d42, p.skin, p.hair, day < 160 || day > 230 ? true : false); bump.setColorAt(wk, tmpC.set(c)); bump.instanceColor.needsUpdate = true; p.lastC = c; }
        } else if (p.mother) {
          armL = 0.62; armR = 0.62; look = -0.5 + 0.25 * smooth(V_BABY + 2.0, V_BABY + 2.8, v) * (1 - smooth(V_BABY + 3.6, V_BABY + 4.4, v));
          yaw = p.yaw + 0.25 * smooth(V_BABY + 2.0, V_BABY + 2.8, v) * (1 - smooth(V_BABY + 3.6, V_BABY + 4.4, v));
        } else if (p.admire) {
          look = -0.3; armL = p.ph % 1 < 0.4 ? 0.3 : 0; armR = p.ph % 1 > 0.7 ? 1.25 : 0.15;
        }
        if (p.pram) { armL = 0.72; armR = 0.72; }
        const o = { x: at.x, y, z: at.z, yaw, s: p.h, walk, stride: at.moving ? 1 : 0, sit, pitch, armL, armR, look };
        crowd.pose(i, o);
        if (wk >= 0) {
          bodyFrame(o);
          if (p.longHair) { e.set(-look * 0.55, 0, 0, 'XYZ'); loc.makeTranslation(0, SHOULDER, 0).multiply(m4.makeRotationFromEuler(e)).multiply(m5.makeTranslation(0, -SHOULDER, 0)); longHair.setMatrixAt(wk, m4.multiplyMatrices(base, loc)); }
          else longHair.setMatrixAt(wk, zero);
          skirt.setMatrixAt(wk, p.skirt ? base : zero);
          if (preg > 0.01) { m5.makeTranslation(0, HIP + 0.16, 0.05 + 0.08 * preg).multiply(m4.makeScale(0.6 + 0.75 * preg, 0.6 + 0.7 * preg, 0.25 + 1.75 * preg)).multiply(loc.makeTranslation(0, -(HIP + 0.2), -0.1)); bump.setMatrixAt(wk, m4.multiplyMatrices(base, m5)); }
          else bump.setMatrixAt(wk, zero);
          if (p.mother) {
            // the baby: a small bundle in a cream blanket in the crook of her arms, its face to her
            m5.makeTranslation(0.02, 1.13, 0.24).multiply(m4.makeRotationFromEuler(e.set(0.35, 0.5, 1.25, 'XYZ')));
            baby.setMatrixAt(0, m4.multiplyMatrices(base, m5));
            m5.makeTranslation(-0.15, 1.22, 0.26);
            babyHead.setMatrixAt(0, m4.multiplyMatrices(base, m5));
          }
        }
        if (pIdx[i] >= 0) {
          const fx = Math.sin(yaw), fz = Math.cos(yaw);
          e.set(0, yaw + Math.PI, 0); q.setFromEuler(e);
          pram.setMatrixAt(pIdx[i], m4.compose(vv.set(at.x + fx * 0.85 * p.h, 0, at.z + fz * 0.85 * p.h), q, sc.setScalar(1)));
        }
        // a phone's screen after dark
        if (dark > 0.2 && armR >= 0.95 && (p.callPhone || p.phone)) {
          const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
          glows.add(at.x + fx * 0.42 * p.h + rx * 0.2 * p.h, 1.32 * p.h, at.z + fz * 0.42 * p.h + rz * 0.2 * p.h, 0.14, 1.6 * dark, 1.8 * dark, 2.2 * dark);
        }
      }
      if (sceneNow !== 'baby') { baby.setMatrixAt(0, zero); babyHead.setMatrixAt(0, zero); }
      // the clothes: hanging where he stood for an instant, then dropping and crumpling into a heap; they lie there
      // for the first two days
      const showHeaps = v >= V_EVENT && v < V_TRUCK;
      HEAPS.forEach((h, k) => {
        if (!showHeaps) { shirtH.setMatrixAt(k, zero); pantsH.setMatrixAt(k, zero); shoes.setMatrixAt(k, zero); return; }
        const a = heapAt(h, tau), u = a.k, sS = h.s;
        const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw);
        const sy = (HIP + 0.27) * sS * (1 - u) + 0.1 * u;
        e.set(0.25 * u * (h.seed - 0.5) * 2, h.yaw + 0.6 * u * (h.seed - 0.5), 0.15 * u, 'YXZ'); q.setFromEuler(e);
        shirtH.setMatrixAt(k, m4.compose(vv.set(a.x + fx * 0.12 * u, sy, a.z + fz * 0.12 * u), q, sc.set(sS * (1 + 0.45 * u), sS * (1 - 0.8 * u), sS * (1 + 1.4 * u))));
        const py = (HIP / 2) * sS * (1 - u) + 0.05 * u, sd = h.seed > 0.5 ? 1 : -1;
        e.set(1.35 * u * sd, h.yaw + 0.4 * (h.seed - 0.5), 0, 'YXZ'); q.setFromEuler(e);
        pantsH.setMatrixAt(k, m4.compose(vv.set(a.x + fx * 0.15 * u * sd, py, a.z + fz * 0.15 * u * sd), q, sc.set(sS * (1 + 0.5 * u), sS * (1 - 0.35 * u), sS * (1 + 0.4 * u))));
        e.set(0, h.yaw, 0); q.setFromEuler(e);
        shoes.setMatrixAt(k, m4.compose(vv.set(h.x, 0, h.z), q, sc.setScalar(sS)));
      });
      // what they held: it drops as they vanish, and lies there
      ITEMS.forEach((it, k) => {
        const m = itemMesh[it.kind];
        if (!showHeaps) { m.setMatrixAt(k, zero); return; }
        const a = itemAt(it, tau);
        e.set(it.kind === 1 ? -1.1 * (1 - a.tilt) : it.kind === 0 ? a.tilt * 1.45 * (it.spin > 0 ? 1 : -1) : a.tilt * 1.5, it.yaw + it.spin * 0.08 * Math.min(tau, 0.5), 0); q.setFromEuler(e);
        m.setMatrixAt(k, m4.compose(vv.set(a.x, a.y + (it.kind === 3 ? 0.045 * a.tilt : 0), a.z), q, sc.setScalar(1)));
      });
      crowd.commit();
      for (const m of [longHair, skirt, bump, pram, shirtH, pantsH, shoes, baby, babyHead, ...itemMesh.filter(Boolean)]) m.instanceMatrix.needsUpdate = true;
    },
  };
}

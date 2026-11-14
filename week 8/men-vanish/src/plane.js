// The jet: a twin-engine airliner (about 38 m long, 34 m wingspan) low over downtown on its way in to land, hand-flown
// at this height, so when its pilots vanish nobody is flying it. It rolls to the right, its nose drops, and it curves
// away north and down at the far end of the avenue; at V_BOOM it hits the ground there (a park beyond the last
// buildings: nothing is shown hitting a building). A fireball rises among the towers and a column of smoke climbs for the rest of the day.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { V_MORN, V_BOOM, V_TRUCK } from './timeline.js';
import { smooth, clamp } from './util.js';

// the flight (video s, x, y, z): a Catmull-Rom path through these
// (the next morning, real time: it enters the frame at V_MORN; times squeezed from a first layout: t' = 9.35 - (9.35 - t) * 0.806)
const SQ = (t) => 9.35 - (9.35 - t) * 0.806;
const KEYS = [
  [3.8, 245, 238, -240], [4.7, 190, 230, -262], [5.6, 128, 218, -292], [6.5, 72, 196, -338], [7.4, 30, 160, -400],
  [8.2, 8, 110, -470], [8.9, 2, 52, -565], [9.35, 4, 0, -650], [9.8, 8, -50, -720],
].map(([t, ...p]) => [SQ(t), ...p]);
const ROLL = [[3.8, 0], [5.4, 0.05], [6.4, 0.35], [7.4, 0.62], [8.4, 0.8], [9.4, 0.9]].map(([t, r]) => [SQ(t), r]);   // (right wing down)
export const IMPACT = { x: 4, y: 0, z: -650 };
function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
export function planeAt(v) {
  const n = KEYS.length;
  let i = 0;
  while (i < n - 2 && v > KEYS[i + 1][0]) i++;
  const k = clamp((v - KEYS[i][0]) / (KEYS[i + 1][0] - KEYS[i][0]), 0, 1);
  const g = (j) => KEYS[Math.max(0, Math.min(n - 1, j))];
  const pos = [1, 2, 3].map((c) => cr(g(i - 1)[c], g(i)[c], g(i + 1)[c], g(i + 2)[c], k));
  let r = 0;
  for (let j = 0; j < ROLL.length - 1; j++) if (v >= ROLL[j][0]) r = ROLL[j][1] + (ROLL[j + 1][1] - ROLL[j][1]) * smooth(ROLL[j][0], ROLL[j + 1][0], v);
  return { pos, roll: r };
}

function airliner(ctx) {
  // fuselage: a lathe along the axis (front = -z)
  const prof = [];
  const L = 37.6, R0 = 2.0;
  for (let i = 0; i <= 40; i++) {
    const s = i / 40;   // 0 nose .. 1 tail
    let r = R0;
    if (s < 0.1) r = R0 * Math.sqrt(1 - Math.pow(1 - s / 0.1, 2.2));
    if (s > 0.72) r = R0 * (1 - 0.8 * Math.pow((s - 0.72) / 0.28, 1.4));
    prof.push(new THREE.Vector2(Math.max(r, 0.05), -L / 2 + s * L));
  }
  const fus = new THREE.LatheGeometry(prof, 20).rotateX(Math.PI / 2).toNonIndexed();
  // (the tail end sweeps up: lift the rear vertices)
  {
    const a = fus.attributes.position;
    for (let i = 0; i < a.count; i++) { const z = a.getZ(i); if (z > L * 0.22) a.setY(i, a.getY(i) + Math.pow((z - L * 0.22) / (L * 0.28), 2) * 1.1); }
    fus.computeVertexNormals();
  }
  const plan = (pts, thick) => {
    const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
    return new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, thick / 2, 0).toNonIndexed();
  };
  // wings (swept back ~25°), a little dihedral
  const wingR = plan([[1.8, -3.5], [17, 3.6], [17, 5.0], [1.8, 3.8]], 0.45);
  wingR.rotateZ(0.08).translate(0, -1.0, 1.5);
  const wingL = wingR.clone().scale(-1, 1, 1);
  const stabR = plan([[0.5, 13.6], [6.2, 16.7], [6.2, 17.7], [0.5, 17.4]], 0.25).translate(0, 1.6, 0);
  const stabL = stabR.clone().scale(-1, 1, 1);
  const finS = new THREE.Shape([[0, 12.0], [0, 18.6], [7.2, 18.9], [7.2, 17.7]].map(([y, z]) => new THREE.Vector2(z, y)));
  const fin = new THREE.ExtrudeGeometry(finS, { depth: 0.3, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(0.15, 1.6, 0).toNonIndexed();
  // engines under the wings
  const eng = (x) => new THREE.CylinderGeometry(1.0, 0.9, 4.2, 14).rotateX(Math.PI / 2).translate(x, -1.9, -1.2).toNonIndexed();
  const pylon = (x) => new THREE.BoxGeometry(0.3, 1.1, 2.6).translate(x, -1.3, -0.4).toNonIndexed();
  const body = mergeGeometries([fus, wingR, wingL, stabR, stabL, pylon(5.8), pylon(-5.8)]);
  const blue = mergeGeometries([fin, eng(5.8), eng(-5.8)]);
  // a dark band of windows along each side, the cockpit glass
  const winG = mergeGeometries([
    new THREE.BoxGeometry(0.06, 0.32, 25).translate(1.98, 0.45, 0.5).toNonIndexed(),
    new THREE.BoxGeometry(0.06, 0.32, 25).translate(-1.98, 0.45, 0.5).toNonIndexed(),
    new THREE.BoxGeometry(2.4, 0.5, 0.9).translate(0, 0.75, -16.4).toNonIndexed(),
  ]);
  const g = new THREE.Group();
  const mB = new THREE.Mesh(body, ctx.plainMat(0xf2f2f0, 0.45, { metalness: 0.15 }));
  const mT = new THREE.Mesh(blue, ctx.plainMat(0x1d3a7a, 0.45, { metalness: 0.15 }));
  const mW = new THREE.Mesh(winG, ctx.plainMat(0x101418, 0.2));
  for (const m of [mB, mT, mW]) { m.castShadow = false; m.frustumCulled = false; g.add(m); }
  return g;
}

export function makePlane(scene, ctx) {
  const jet = airliner(ctx);
  scene.add(jet);
  const fwd = new THREE.Vector3(), up = new THREE.Vector3(), right = new THREE.Vector3(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), qr = new THREE.Quaternion();
  const tmp = new THREE.Vector3();
  // the smoke column: puffs that rise and spread, drifting a little east on the wind
  const COL = Array.from({ length: 90 }, (_, i) => ({ ph: i / 90, a: (i * 2.39) % 6.28, r: (i * 0.618) % 1 }));
  return {
    jet,
    frame(v, s, glows, fire, smoke) {
      const vis = v > V_MORN && v < V_BOOM;
      jet.visible = vis;
      if (vis) {
        const a = planeAt(v), b = planeAt(v + 0.02);
        fwd.set(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]).normalize();
        right.crossVectors(fwd, tmp.set(0, 1, 0)).normalize();
        up.crossVectors(right, fwd);
        // the jet's own axes: front = -z, so z = -forward
        m.makeBasis(right, up, tmp.copy(fwd).negate());
        q.setFromRotationMatrix(m);
        qr.setFromAxisAngle(tmp.set(0, 0, 1), -a.roll);
        jet.quaternion.copy(q).multiply(qr);
        jet.position.set(a.pos[0], a.pos[1], a.pos[2]);
        jet.updateMatrixWorld();
        // lights: red and green wingtips, white strobes, the anti-collision beacon
        const wl = (x, y, z, sz, r, g, bb) => { tmp.set(x, y, z).applyMatrix4(jet.matrixWorld); glows.add(tmp.x, tmp.y, tmp.z, sz, r, g, bb); };
        wl(-17, -0.4, 4.5, 2.4, 6, 0.3, 0.2);
        wl(17, -0.4, 4.5, 2.4, 0.2, 6, 1.0);
        const strobe = (v * 1.1) % 1 < 0.06 ? 1 : 0;
        if (strobe) { wl(-17.2, -0.3, 5.0, 4.5, 9, 9, 9); wl(17.2, -0.3, 5.0, 4.5, 9, 9, 9); }
        const bea = 0.5 + 0.5 * Math.sin(v * 7);
        wl(0, -2.1, 0, 2.2, 5 * bea, 0.4 * bea, 0.2 * bea);
        // engines' heat haze is too small to see; a faint trail of vapour off the wingtips in the turn
        if (smoke) for (const sd of [-1, 1]) for (let k = 1; k < 5; k++) {
          const p2 = planeAt(v - k * 0.05);
          smoke.puff(p2.pos[0] + right.x * sd * 17, p2.pos[1] + right.y * sd * 17, p2.pos[2] + right.z * sd * 17, 0.6 + k * 0.2, 0.18 * (1 - k / 5) * a.roll, 1.0, 0, k * 0.1);
        }
      }
      // the crash: a fireball, then the smoke column (rising all through day 1 and still smoking on day 2)
      if (v >= V_BOOM - 0.05 && v < V_TRUCK) {
        const t = v - V_BOOM;
        const fb = smooth(-0.05, 0.25, t) * (1 - smooth(1.2, 5.0, t));
        if (fb > 0.01) {
          for (let k = 0; k < 12; k++) {
            const a2 = k * 0.52, rr = 25 + 25 * ((k * 0.37) % 1);
            const hh = (60 + 130 * smooth(0, 2.5, t)) * (0.7 + 0.3 * Math.sin(k * 3.1 + t * 2));
            fire.add(IMPACT.x + Math.cos(a2) * rr * (0.4 + t * 0.3), 0 + 15 * Math.min(t, 2), IMPACT.z + Math.sin(a2) * rr * 0.5, 70 + 40 * ((k * 0.61) % 1), hh, fb, k * 0.13);
          }
          glows.add(IMPACT.x, 60 + 40 * Math.min(t, 2), IMPACT.z, 340 * fb, 5 * fb, 2.2 * fb, 0.7 * fb);
          // (the fireball's body: a rolling ball of flame and dark smoke rising off it)
          if (smoke) for (let k = 0; k < 14; k++) {
            const a3 = k * 2.39, rr = 20 + 30 * ((k * 0.37) % 1), up = 25 + 90 * smooth(0, 3, t) * ((k * 0.61) % 1);
            smoke.puff(IMPACT.x + Math.cos(a3) * rr, up, IMPACT.z + Math.sin(a3) * rr * 0.5, 30 + 25 * smooth(0, 2, t), 0.8 * fb, 0.3, 1.6 * fb * (1 - smooth(0.5, 3, t)), (k * 0.17) % 1);
          }
        }
        // a lasting fire at the foot of the column
        const lf = smooth(1.5, 4, t);
        if (lf > 0) { for (let k = 0; k < 5; k++) fire.add(IMPACT.x + (k - 2) * 22, 0, IMPACT.z + (k % 2) * 15, 45, 55 * (0.8 + 0.3 * Math.sin(v * 3 + k)), lf * 0.8, 0.5 + k * 0.1); glows.add(IMPACT.x, 30, IMPACT.z, 160, 2.4 * lf * (0.5 + s.dark), 1.0 * lf * (0.5 + s.dark), 0.25 * lf); }
        if (smoke) {
          const grow = smooth(0, 6, t);
          for (const c of COL) {
            const T = 14, age = ((t * 1.0 + c.ph * T) % T);
            if (t < age) continue;
            const h = 20 + age * 38 * (0.6 + 0.4 * grow);
            const r = 18 + age * 7;
            smoke.puff(IMPACT.x + Math.cos(c.a) * r * 0.4 + age * 6, h, IMPACT.z + Math.sin(c.a) * r * 0.4, r, 0.75 * Math.min(1, age / 0.8) * (1 - age / T) * smooth(0, 1.2, t), 0.12, 0.35 * s.dark * Math.exp(-h / 160), c.r);
          }
        }
      }
    },
  };
}

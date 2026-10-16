// Cars on the shore road: four lanes, evenly spaced slots per lane at the lane's speed (so nobody overlaps), one car
// per pass along the road, each with its own colour and body. Like the people, they blur out of the picture as the
// time-lapse speeds up; their lights don't: at night (and later in the long exposure) the road becomes ribbons of
// white headlights coming toward you and red tail lights going away.
import * as THREE from 'three';
import { makeFleet } from './cars.js';
import { ROAD, coastX } from './layout.js';

const PAINT = [0xf2f2f2, 0x1a1a1a, 0x8c9399, 0xb3202a, 0x1f4e8c, 0x2d6b45, 0xc9b28a, 0x5a5f66, 0xe3a72f, 0x4a2c5e, 0xd9d9d9, 0x23272c];
const hash = (a, b) => { const x = Math.sin(a * 91.7 + b * 47.3 + 0.71) * 43758.5453; return x - Math.floor(x); };
const Z0 = 70, LEN = 1900;          // the road from behind you (z = +70) to far ahead (z = -1830)
const PER = 22;                     // slots per lane

export function makeTraffic(scene, ctx) {
  const n = ROAD.lanes.length * PER;
  const fleet = makeFleet(scene, n, ctx);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  const who = new Float64Array(n).fill(-1);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const at = (lane, d) => {          // position at distance d along the lane
    const dir = ROAD.dir[lane];
    const z = dir < 0 ? Z0 - d : Z0 - LEN + d;
    return [coastX(z) + ROAD.lanes[lane], 0.7, z];
  };
  // a streak along the lane from d0 to d1, in pieces so it follows the curve of the shore
  const streak = (trails, lane, d0, d1, k) => {
    const n = Math.max(1, Math.ceil((d1 - d0) / 60));
    for (let i = 0; i < n; i++) {
      const a = at(lane, d0 + (d1 - d0) * i / n), b = at(lane, d0 + (d1 - d0) * (i + 1) / n);
      if (ROAD.dir[lane] > 0) trails.add(a, b, 1.1, 2.6 * k, 2.4 * k, 2.0 * k);
      else trails.add(a, b, 1.0, 2.4 * k, 0.18 * k, 0.1 * k);
    }
  };
  const full = [0, 0, 0, 0];
  return {
    frame(s, trails, night) {
      const ts = s.T * 60, Es = s.E * 60;
      let i = 0;
      ROAD.lanes.forEach((u, lane) => {
        const sp = ROAD.speed[lane], dir = ROAD.dir[lane];
        for (let j = 0; j < PER; j++, i++) {
          const pos = ts * sp + (j / PER + 0.37 * lane) * LEN;
          const cyc = Math.floor(pos / LEN), d = pos - cyc * LEN;
          const id = cyc * 101 + lane * 7 + j * 1009;
          const on = hash(id, 1) < 0.62;
          // the body: there in real time, gone once it smears across a frame
          if (on && hash(id, 2) < s.crowd && s.city > 0.3) {
            if (who[i] !== id) { who[i] = id; fleet.set(i, zero, false); /* clear the last car's body (it may be another kind) */ fleet.color(i, PAINT[Math.floor(hash(id, 3) * PAINT.length)], Math.floor(hash(id, 4) * 4)); }
            const [x, y, z] = at(lane, d);
            const slope = Math.atan((coastX(z - 1) - coastX(z + 1)) / 2);
            q.setFromAxisAngle(up, (dir < 0 ? 0 : Math.PI) - slope);
            m4.compose(p.set(x, 0, z), q, one);
            fleet.set(i, m4, night > 0.15);
          } else fleet.set(i, zero, false);
          // the lights' streak over this frame's exposure (only the part of it on the road)
          if (on && s.city > 0.05) {
            const len = Es * sp;
            const k = (0.12 + 0.88 * night) * s.city * (len > 3 ? 1 : 0);
            if (k > 0.01) {
              // a long streak is fainter per metre (the car spends less of the exposure on each point)
              const fade = Math.min(1, 40 / Math.max(len, 1)) * 0.6 + 0.4;
              const add = (d0, d1) => streak(trails, lane, d0, d1, k * fade);
              if (len >= LEN) full[lane] += k * fade;                   // the whole road: drawn once per lane below
              else { add(Math.max(0, d - len), d); if (len > d) add(LEN - (len - d), LEN); }
            }
          }
        }
      });
      full.forEach((k, lane) => { if (k > 0.01) streak(trails, lane, 0, LEN, k * 0.35); full[lane] = 0; });
      fleet.commit();
    },
  };
}

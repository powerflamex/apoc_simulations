// What happens near you while the blast crosses the city, something new every few seconds (the times are in timeline.js):
//   - the news helicopter over the avenue: its pilot blinded, it drifts toward you, loses it, spins and hits the road;
//   - the birds: a flock bursts past you, black against the fireball;
//   - the heat: stall awnings, then the shop awnings, then the windows of the blocks on both sides go up in flames;
//   - cars catching one after another; sparks and embers blowing past you;
//   - the billboard on the left, lit at first, dead, burning, then coming down across the road;
//   - the tallest tower's pieces, thrown as it breaks.
import * as THREE from 'three';
import { STALLS, CAM0, FX, HEROES, PLAIN, groundY } from './layout.js';
import { CARS } from './traffic.js';
import { rng, smooth, clamp, keys, wobble } from './util.js';
import { V_HEAT, V_FIRE, V_HELI, V_BIRDS, V_SIGN, V_TALL } from './short.js';

const BOARD = { x: 17.5, z: -74, w: 19, h: 9.5, top: 19 };

function boardTex() {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 512;
  const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 1024, 512);
  gr.addColorStop(0, '#ff7a1a'); gr.addColorStop(0.5, '#e8235a'); gr.addColorStop(1, '#4a1a9a');
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 150px Georgia, serif'; g.fillText('SUMMER', 512, 190);
  g.font = '900 104px Georgia, serif'; g.fillText('STARTS TONIGHT', 512, 340);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function makeEvents(scene, ctx, smoke, flames) {
  const R = rng(4242);
  const dark = ctx.plainMat(0x14161b, 0.5, { metalness: 0.3 });

  // ---- the helicopter ----
  const heli = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10).scale(1.35, 1.45, 3.1), dark);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.5, 7, 8).rotateX(Math.PI / 2).translate(0, 0.35, 6.2), dark);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.2, 1.2).translate(0, 1.2, 9.3), dark);
  const skid = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.14, 5).translate(0, -2.1, 0), dark);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(6.2, 28).rotateX(-Math.PI / 2).translate(0, 2.0, 0), new THREE.MeshBasicMaterial({ color: 0x0c0d10, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
  const tail = new THREE.Mesh(new THREE.CircleGeometry(1.4, 16).rotateY(Math.PI / 2).translate(0.2, 1.1, 9.3), disc.material);
  heli.add(body, boom, fin, skid, disc, tail);
  heli.traverse((o) => { o.frustumCulled = false; });
  scene.add(heli);
  const V_LOSE = V_HELI - 3.1, Y_LOSE = 60;
  const CRASH = { x: 10.5, y: groundY(-92) + 1.2, z: -92 };
  const heliAt = (v) => ({
    x: keys([[0, -28], [12, -24], [V_LOSE, -6], [V_HELI, CRASH.x]], v),
    z: keys([[0, -150], [12, -130], [V_LOSE, -78], [V_HELI, CRASH.z]], v),
    y: v < V_LOSE ? keys([[0, 72], [12, 70], [V_LOSE, Y_LOSE]], v) : Math.max(CRASH.y, Y_LOSE - 0.5 * ((Y_LOSE - CRASH.y) * 2 / (3.1 * 3.1)) * (v - V_LOSE) ** 2),
  });

  // ---- the birds ----
  const birdGeo = new THREE.BufferGeometry();
  birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 1, 0, 0, 0, -0.3, 0, 0, 0.3, 1, 1, 0, 0, 0, 0.3, 0, 0, -0.3], 3));
  const N_BIRDS = 90;
  const birds = new THREE.InstancedMesh(birdGeo, new THREE.MeshBasicMaterial({ color: 0x08080a, side: THREE.DoubleSide }), N_BIRDS);
  birds.frustumCulled = false;
  scene.add(birds);
  const BIRDS = Array.from({ length: N_BIRDS }, () => ({ t0: V_BIRDS + R() * 1.7, x: 26 + R() * 34, y: 12 + R() * 34, z: -24 - R() * 44, sp: 19 + R() * 9, s: 0.5 + R() * 0.4, ph: R() * 6, dip: (R() - 0.5) * 3 }));

  // ---- the billboard: two steel legs, the board lit until the blackout ----
  const board = new THREE.Group();
  board.position.set(BOARD.x, 0, BOARD.z);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.w, BOARD.h).translate(0, BOARD.top - BOARD.h / 2, 0.21), new THREE.MeshStandardMaterial({ map: boardTex(), emissive: 0xffffff, emissiveMap: null, roughness: 0.6 }));
  face.material.emissiveMap = face.material.map;
  const back = new THREE.Mesh(new THREE.BoxGeometry(BOARD.w + 0.6, BOARD.h + 0.6, 0.4).translate(0, BOARD.top - BOARD.h / 2, 0), dark);
  const legs = [-6, 6].map((x) => new THREE.Mesh(new THREE.BoxGeometry(0.7, BOARD.top - BOARD.h, 0.7).translate(x, (BOARD.top - BOARD.h) / 2, 0), dark));
  board.add(back, face, ...legs);
  board.traverse((o) => { o.frustumCulled = false; o.castShadow = true; });
  scene.add(board);

  // ---- the tallest tower's pieces ----
  const tall = HEROES.find((h) => h.tall);
  const N_CH = 130;
  const chunks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), ctx.plainMat(0x2a2b30, 0.8), N_CH);
  chunks.frustumCulled = false;
  scene.add(chunks);
  const CH = Array.from({ length: N_CH }, () => ({ y: 330 + R() * 420, vx: (R() - 0.65) * 170, vy: 10 + R() * 90, vz: (R() - 0.3) * 120, s: 10 + R() * 34, sp: [R() * 3, R() * 3, R() * 3], t0: R() * 1.5 }));

  // ---- what burns on the street ----
  const F = [];
  // (each fire its own size, shape and timing: wide = across, tall = up, as multiples of size)
  const add = (x, y, z, size, t0, seed, wide = 1, tall = 1) => F.push({ x, y, z, size, t0, seed, wide, tall });
  // a stall right beside you goes first, then the others along the promenade
  const near = [...STALLS].sort((a, b) => Math.hypot(a.x - CAM0.x, a.z - CAM0.z) - Math.hypot(b.x - CAM0.x, b.z - CAM0.z));
  near.forEach((st, i) => add(st.x, groundY(st.z) + 2.4, st.z, 3.6 + R() * 1.8, V_HEAT + i * 0.45 + R() * 0.4, R(), 1.1 + R() * 0.6, 0.9 + R() * 0.7));
  // the shop awnings, running away down both sides of the street
  // (none on your building's front: its ground floor is the lobby's glass, no awnings)
  for (const side of [-1, 1]) for (let z = 36 - R() * 6; z > -120; z -= 9 + R() * 6) {
    if (side < 0 && z > -30 && z < 26) continue;
    add(side * (FX - 1.2), groundY(z) + 3.0, z, 3.6 + R() * 2.2, V_HEAT + 1.5 + R() * 3 + Math.abs(z) * 0.012, R(), 1.0 + R() * 0.7, 0.8 + R() * 0.7);
  }
  // the blocks on both sides, floor by floor from the street up
  // (a few big blazes low on each block, one per shop front, each sending its smoke up the face: no stacked layers)
  // (several separate fires per front, each with its own tongues, rather than one huge card that blurs)
  for (const side of [-1, 1]) for (let i = 0; i < 14; i++) {
    const z = -40 - i * 4.2 - R() * 3, y = 1.5 + R() * 6;
    add(side * (FX - 1.5), groundY(z) + y, z, 4.5 + R() * 3, V_FIRE - 0.2 + i * 0.16 + R() * 1.2, R(), 0.8 + R() * 0.5, 1.0 + R() * 0.8);
  }
  // cars, one after another
  const burning = CARS.filter((c) => c.z < -8 && c.z > -150).sort(() => R() - 0.5).slice(0, 12);
  burning.forEach((c, i) => { c.fire = V_FIRE + 0.6 + i * 0.5 + R() * 0.4; });

  // ---- embers on the wind ----
  // (rising off the fires on both sides and blowing away from you, toward the city)
  const EMB = Array.from({ length: 420 }, () => ({ x: (R() < 0.5 ? -1 : 1) * (FX - 3 - R() * 9), y: 2 + R() * 14, z: 10 - R() * 120, r: R(), ph: R() * 6, s: 0.07 + R() * 0.16 }));

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), sc = new THREE.Vector3();
  return {
    meshes: [heli, birds, board, chunks], heliAt: (v) => heliAt(Math.min(v, V_HELI)),
    frame(v, s, glows) {
      // the helicopter
      {
        const crashed = v >= V_HELI;
        const h = heliAt(Math.min(v, V_HELI));
        const lost = Math.max(0, Math.min(v, V_HELI) - V_LOSE);
        e.set(crashed ? 0.5 : 0.12 + 0.3 * smooth(0, 1.2, lost) * Math.sin(lost * 3), 2.5 + 0.08 * v + 4.2 * lost * lost, crashed ? 1.1 : 0.14 * wobble(v, 3) + 0.35 * smooth(0, 1.5, lost));
        heli.position.set(h.x, h.y, h.z);
        heli.quaternion.setFromEuler(e);
        disc.visible = tail.visible = !crashed;
        if (!crashed) {
          if (Math.sin(v * 7) > 0.3) glows.add(h.x, h.y - 1.6, h.z, 1.4, 5, 0.3, 0.2);
          glows.add(h.x, h.y - 1.5, h.z, 0.9, 3, 3, 3);
        }
        if (lost > 0 && !crashed) {
          flames.add(h.x, h.y - 1.5, h.z, 4 + 2 * lost, 1, 0.3, 1, 1.2);
          for (let k = 0; k < 7; k++) { const u = ((lost * 0.8 + k / 7) % 1); smoke.puff(h.x, h.y + u * 16, h.z, 2.4 + 5 * u, 0.42 * (1 - u), 0.08, 0.1, k + 0.3); }
        }
        const age = v - V_HELI;
        if (crashed) {
          // the impact: a ball of fire off the road, then the wreck burning
          const big = Math.exp(-age / 0.9);
          glows.add(CRASH.x, CRASH.y + 8, CRASH.z, 60 * (0.4 + big), 6 * big, 2.6 * big, 0.5 * big);
          for (let k = 0; k < 5; k++) {
            const a = k * 2.4;
            flames.add(CRASH.x + Math.cos(a) * (2 + k * 0.6), CRASH.y, CRASH.z + Math.sin(a) * (2 + k * 0.6), (7 + (k % 3) * 3) * (0.4 + 1.6 * big), 1.0, k * 0.13, 1.2 + 0.2 * k, 0.8 + 0.15 * (k % 3));
          }
          for (let k = 0; k < 9; k++) { const u = ((age * 0.13 + k / 9) % 1); smoke.puff(CRASH.x + u * 8, CRASH.y + 6 + u * 70, CRASH.z, 6 + 15 * u, 0.5 * (1 - u) * smooth(0, 1, age), 0.07, 0.12 * (1 - u), k + 0.7); }
        }
      }
      // the birds
      {
        const on = v > V_BIRDS - 0.2 && v < V_BIRDS + 7;
        birds.visible = on;
        if (on) {
          BIRDS.forEach((b, i) => {
            const t = v - b.t0;
            const flap = Math.sin(v * 15 + b.ph);
            p.set(b.x - b.sp * t, b.y + 1.1 * t + b.dip * Math.sin(t * 1.3), b.z + 2.2 * t);
            m4.compose(p, q.identity(), sc.set(b.s * 1.1, b.s * (0.1 + 0.75 * flap), b.s * 1.1));
            birds.setMatrixAt(i, t > 0 ? m4 : m4.makeScale(0, 0, 0));
          });
          birds.instanceMatrix.needsUpdate = true;
        }
      }
      // the billboard
      {
        const off = 1 - s.dark;
        face.material.emissiveIntensity = 0.9 * off;
        const f = clamp((v - V_SIGN) / 1.45);
        const fall = f * f;
        // it folds over the legs, away from the fire and down across the road
        board.rotation.x = 1.5 * fall; board.rotation.z = 0.32 * fall;
        board.position.y = -0.4 * fall;
        const burn = smooth(V_HEAT + 4, V_HEAT + 8, v);
        for (let k = 0; k < 5; k++) {
          const u = k / 4 - 0.5;
          const hgt = BOARD.top - BOARD.h * (0.25 + 0.6 * ((k * 3) % 5) / 5);
          const y = hgt * Math.cos(1.5 * fall), z = BOARD.z + 0.4 + hgt * Math.sin(1.5 * fall);
          flames.add(BOARD.x + u * BOARD.w * 0.85, y, z, 5 + (k % 3) * 1.8, burn, k * 0.21, 1.1 + 0.3 * (k % 2), 0.9 + 0.2 * (k % 3));
        }
        const hit = v - (V_SIGN + 1.45);
        if (hit > 0 && hit < 1.2) {
          for (let k = 0; k < 40; k++) {
            const a = k * 2.4, sp = 4 + (k % 7) * 3, u = hit * (0.6 + (k % 3) * 0.25), g = Math.max(0, 1 - hit * 1.5);
            glows.add(BOARD.x + Math.cos(a) * sp * u, groundY(BOARD.z) + 1 + (9 * u - 4.9 * u * u), BOARD.z + 16 + Math.sin(a) * sp * u, 0.4, 5 * g, 2.6 * g, 0.5 * g);
          }
        }
      }
      // the street on fire
      for (const f of F) {
        const a = v - f.t0;
        if (a < 0) continue;
        if (Math.abs(f.x) > 30 && s.front > 0 && s.left < 40) continue;
        const k = smooth(0, 1.1, a);
        flames.add(f.x, f.y, f.z, f.size * (0.55 + 0.45 * k), k, f.seed, f.wide, f.tall);
      }
      for (const c of CARS) {
        if (!c.fire || v < c.fire || c.px === undefined) continue;
        const k = smooth(c.fire, c.fire + 1, v);
        flames.add(c.px, c.py + 0.6, c.pz, 3.4 + (c.ph % 1.5), k, c.ph, 1.3, 0.9 + 0.3 * (c.ph % 1));
      }
      // embers blown past you
      {
        const g = smooth(V_HEAT, V_FIRE + 2, v);
        if (g > 0) for (const m of EMB) {
          const u = ((v * (0.11 + 0.14 * m.r) + m.ph) % 1);
          const f = (0.55 + 0.45 * Math.sin(v * 11 + m.ph * 3)) * g * Math.sin(Math.PI * u);
          glows.add(m.x * (1 - 0.3 * u) + Math.sin(v * 1.7 + m.ph) * 1.2, groundY(m.z) + m.y + 26 * u, m.z - 34 * u, m.s, 5 * f, 1.8 * f, 0.25 * f);
        }
      }
      // the tower's pieces
      {
        const a = v - V_TALL - 0.3;
        chunks.visible = a > 0 && !!tall;
        if (chunks.visible) {
          CH.forEach((c, i) => {
            const t = a - c.t0;
            if (t < 0) { chunks.setMatrixAt(i, m4.makeScale(0, 0, 0)); return; }
            const y = PLAIN + c.y + c.vy * t - 4.9 * t * t;
            e.set(c.sp[0] * t, c.sp[1] * t, c.sp[2] * t);
            m4.compose(p.set(tall.x + c.vx * t, Math.max(PLAIN, y), tall.z + c.vz * t), q.setFromEuler(e), sc.setScalar(c.s));
            chunks.setMatrixAt(i, m4);
          });
          chunks.instanceMatrix.needsUpdate = true;
        }
      }
    },
  };
}

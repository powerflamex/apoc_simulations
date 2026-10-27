// What stands on the beach and the promenade, and what the heat does to it:
//   palms (curved trunks, a crown of drooping fronds): the fronds brown, catch fire and burn away to stubs
//   beach umbrellas (striped canopies), towels, chairs: they scorch, burn and are gone
//   kiosks (small glass pavilions), street lamps, volleyball nets
//   the hills at the far end (Leme, the Sugarloaf, Urca) and the Cagarras islands out at sea
// Burning is keyed per object from its own seed (ignite at story time), so it spreads rather than all at once.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALMS, KIOSKS, LAMPS, UMBRELLAS, TOWELS, CHAIRS, NETS, PEAKS, arcXZ, landY, RC, CAM0_XZ } from './layout.js';
import { patchHeat } from './heat.js';
import { rng, smooth, clamp, lerp } from './util.js';

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
const hide = new THREE.Matrix4().makeScale(0, 0, 0);
const tmpC = new THREE.Color();

function frond(len) {
  // a long leaf: a strip that arches up and droops, with leaflets (a wide flat strip, folded a little)
  const segs = 8, g = new THREE.PlaneGeometry(1, 1, 1, segs);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getY(i) + 0.5, side = pos.getX(i);
    const s = u * len;
    const w = (0.18 + 0.55 * Math.sin(Math.PI * Math.min(1, u * 1.15))) * (1 - u * 0.5);
    const y = 0.45 * s - 0.09 * s * s;
    pos.setXYZ(i, side * w, y - Math.abs(side) * 0.18 * w, -s * 0.95);
  }
  g.computeVertexNormals();
  return g;
}

export function makeProps(scene, { plainMat, shadowy }) {
  const charred = (m, key, burnK = 1) => patchHeat(m, key, { burnK });
  // ---------- palms ----------
  const trunkSegs = [];
  for (let k = 0; k < 6; k++) trunkSegs.push(new THREE.CylinderGeometry(0.17 - k * 0.012, 0.19 - k * 0.012, 1 / 6 + 0.01, 7, 1).translate(0.06 * Math.pow(k / 6, 2), (k + 0.5) / 6, 0));
  const trunkGeo = mergeGeometries(trunkSegs.map((g) => g.toNonIndexed()));
  const crownGeo = mergeGeometries(Array.from({ length: 11 }, (_, i) => {
    const g = frond(3.4 + (i % 3) * 0.5);
    g.rotateX(-0.15 + (i % 2) * 0.25);
    g.rotateY((i / 11) * Math.PI * 2 + (i % 2) * 0.2);
    return g.toNonIndexed();
  }));
  const trunkMat = charred(plainMat(0x8a7a64, 0.95), 'palm-trunk');
  const crownMat = charred(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide }), 'palm-crown');
  const trunks = shadowy(new THREE.InstancedMesh(trunkGeo, trunkMat, PALMS.length));
  const crowns = shadowy(new THREE.InstancedMesh(crownGeo, crownMat, PALMS.length));
  scene.add(trunks, crowns);
  const palmTop = [];
  PALMS.forEach((pl, i) => {
    const c = arcXZ(pl.phi, pl.d);
    const y0 = landY(pl.d);
    const yaw = pl.seed * 6.28;
    e.set(pl.lean, yaw, 0, 'YXZ'); q.setFromEuler(e);
    m4.compose(p.set(c.x, y0, c.z), q, sc.set(1, pl.h, 1));
    trunks.setMatrixAt(i, m4);
    const top = new THREE.Vector3(0.06, 1, 0).multiply(sc).applyQuaternion(q).add(p);
    palmTop.push({ x: top.x, y: top.y, z: top.z, yaw, seed: pl.seed, ig: 0 });
  });
  // ---------- umbrellas, towels, chairs ----------
  const canopyGeo = new THREE.ConeGeometry(1.15, 0.38, 10, 1, true).translate(0, -0.19, 0);   // apex at the pole's top
  const poleGeo = new THREE.CylinderGeometry(0.022, 0.022, 1, 5).translate(0, 0.5, 0);
  const canopyMat = charred(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, side: THREE.DoubleSide }), 'umb');
  const canopies = shadowy(new THREE.InstancedMesh(canopyGeo, canopyMat, UMBRELLAS.length + KIOSKS.length * 4));
  const poles = shadowy(new THREE.InstancedMesh(poleGeo, charred(plainMat(0xdedede, 0.4, { metalness: 0.5 }), 'pole', 0.5), UMBRELLAS.length + KIOSKS.length * 4 + LAMPS.length + NETS.length * 2));
  const umb = [];
  UMBRELLAS.forEach((u) => { const c = arcXZ(u.phi, u.d); umb.push({ x: c.x, y: landY(u.d), z: c.z, h: u.h, col: u.col, tilt: u.tilt, seed: u.seed, phi: u.phi, d: u.d, near: Math.hypot(c.x - CAM0_XZ.x, c.z - CAM0_XZ.z) < 150 }); });
  KIOSKS.forEach((k) => {
    for (let j = 0; j < 4; j++) {
      const c = arcXZ(k.phi + (j < 2 ? -1 : 1) * 4.5 / (RC + 92), 92 + (j % 2) * 2.5 + 1.5);
      umb.push({ x: c.x, y: landY(95), z: c.z, h: 2.3, col: 0xf4f0e6, tilt: 0, seed: k.seed + j * 0.13, phi: k.phi, d: 95 });
    }
  });
  umb.forEach((u, i) => canopies.setColorAt(i, tmpC.set(u.col)));
  const towelGeo = new THREE.BoxGeometry(0.9, 0.012, 1.8).translate(0, 0.006, 0);
  const towelAt = TOWELS.map((t) => { const c = arcXZ(t.phi, t.d); return { x: c.x, y: landY(t.d), z: c.z, near: Math.hypot(c.x - CAM0_XZ.x, c.z - CAM0_XZ.z) < 120 }; });
  const towels = shadowy(new THREE.InstancedMesh(towelGeo, charred(plainMat(0xffffff, 0.95), 'towel'), TOWELS.length));
  TOWELS.forEach((t, i) => {
    const c = arcXZ(t.phi, t.d);
    e.set(0, t.yaw, 0); q.setFromEuler(e);
    m4.compose(p.set(c.x, landY(t.d), c.z), q, sc.set(1, 1, 1));
    towels.setMatrixAt(i, m4); towels.setColorAt(i, tmpC.set(t.col));
  });
  const chairGeo = mergeGeometries([
    new THREE.BoxGeometry(0.55, 0.04, 0.55).translate(0, 0.32, 0),
    new THREE.BoxGeometry(0.55, 0.6, 0.04).rotateX(-0.35).translate(0, 0.58, 0.3),
    new THREE.BoxGeometry(0.04, 0.32, 0.04).translate(-0.25, 0.16, -0.25), new THREE.BoxGeometry(0.04, 0.32, 0.04).translate(0.25, 0.16, -0.25),
    new THREE.BoxGeometry(0.04, 0.32, 0.04).translate(-0.25, 0.16, 0.25), new THREE.BoxGeometry(0.04, 0.32, 0.04).translate(0.25, 0.16, 0.25),
  ].map((g) => g.toNonIndexed()));
  const chairs = shadowy(new THREE.InstancedMesh(chairGeo, charred(plainMat(0xffffff, 0.6), 'chair'), CHAIRS.length));
  CHAIRS.forEach((t, i) => {
    const c = arcXZ(t.phi, t.d);
    e.set(0, t.yaw + Math.PI / 2 - t.phi, 0); q.setFromEuler(e);
    m4.compose(p.set(c.x, landY(t.d), c.z), q, sc.set(1, 1, 1));
    chairs.setMatrixAt(i, m4); chairs.setColorAt(i, tmpC.set(t.seed < 0.5 ? 0xf2f2ee : t.seed < 0.75 ? 0x2f6db5 : 0xe9b949));
  });
  // ---------- kiosks: a glass pavilion with a white roof ----------
  const kioskGeo = mergeGeometries([
    new THREE.BoxGeometry(5.2, 0.25, 4.2).translate(0, 3.05, 0),
    new THREE.BoxGeometry(4.4, 0.6, 3.4).translate(0, 0.3, 0),
  ].map((g) => g.toNonIndexed()));
  const glassGeo = new THREE.BoxGeometry(4.3, 2.3, 3.3).translate(0, 1.75, 0);
  const kiosks = shadowy(new THREE.InstancedMesh(kioskGeo, charred(plainMat(0xf3f1ec, 0.6), 'kiosk', 0.6), KIOSKS.length));
  const kglass = shadowy(new THREE.InstancedMesh(glassGeo, charred(plainMat(0x22303a, 0.08, { metalness: 0.4 }), 'kglass', 0.4), KIOSKS.length));
  KIOSKS.forEach((k, i) => {
    const c = arcXZ(k.phi, k.d);
    e.set(0, Math.PI / 2 - k.phi, 0); q.setFromEuler(e);
    m4.compose(p.set(c.x, landY(k.d), c.z), q, sc.set(1, 1, 1));
    kiosks.setMatrixAt(i, m4); kglass.setMatrixAt(i, m4);
  });
  // ---------- street lamps: a tall pole, one or two arms ----------
  const headGeo = mergeGeometries([
    new THREE.BoxGeometry(0.1, 0.1, 2.2).translate(0, 9.6, -1.1), new THREE.BoxGeometry(0.4, 0.14, 0.7).translate(0, 9.5, -2.1),
  ].map((g) => g.toNonIndexed()));
  const heads = shadowy(new THREE.InstancedMesh(headGeo, charred(plainMat(0x9aa0a6, 0.4, { metalness: 0.6 }), 'lamp', 0.5), LAMPS.length * 2));
  let pi = umb.length, hi = 0;
  LAMPS.forEach((l) => {
    const c = arcXZ(l.phi, l.d);
    const y0 = landY(l.d);
    m4.compose(p.set(c.x, y0, c.z), q.identity(), sc.set(5, 9.7, 5));
    poles.setMatrixAt(pi++, m4);
    for (const s of l.two ? [1, -1] : [1]) {
      e.set(0, Math.PI / 2 - l.phi + (s > 0 ? 0 : Math.PI), 0); q.setFromEuler(e);   // arms reach out over the road
      m4.compose(p.set(c.x, y0, c.z), q, sc.set(1, 1, 1));
      heads.setMatrixAt(hi++, m4);
    }
  });
  for (; hi < LAMPS.length * 2; hi++) heads.setMatrixAt(hi, hide);
  // ---------- volleyball nets ----------
  const netGeo = new THREE.BoxGeometry(9, 0.9, 0.02).translate(0, 2.0, 0);
  const nets = shadowy(new THREE.InstancedMesh(netGeo, charred(plainMat(0xf0f0f0, 0.9, { transparent: true, opacity: 0.55 }), 'net'), NETS.length));
  NETS.forEach((nt, i) => {
    const c = arcXZ(nt.phi, nt.d);
    e.set(0, -nt.phi, 0); q.setFromEuler(e);   // across the beach
    m4.compose(p.set(c.x, landY(nt.d), c.z), q, sc.set(1, 1, 1));
    nets.setMatrixAt(i, m4);
    const a = new THREE.Vector3(4.5, 0, 0).applyQuaternion(q);
    for (const s of [1, -1]) { m4.compose(p.set(c.x + a.x * s, landY(nt.d), c.z + a.z * s), new THREE.Quaternion(), sc.set(2.2, 2.5, 2.2)); poles.setMatrixAt(pi++, m4); }
  });
  scene.add(canopies, poles, towels, chairs, kiosks, kglass, heads, nets);

  // ---------- the hills and islands ----------
  const peaks = [];
  const R = rng(55);
  for (const pk of PEAKS) {
    const prof = [];
    const N = 28;
    for (let k = 0; k <= N; k++) {
      const u = k / N;              // 0 base .. 1 top
      let r;
      if (pk.kind === 2) r = Math.pow(1 - Math.pow(u, 2.6), 0.5) * (1 - 0.08 * u);          // a sugarloaf: steep and rounded
      else if (pk.kind === 1) r = Math.pow(1 - Math.pow(u, 1.6), 0.8);                       // a rounded hill
      else r = Math.pow(1 - Math.pow(u, 1.3), 0.9);                                           // a low island
      prof.push(new THREE.Vector2(Math.max(r, 0.001), u));
    }
    const g = new THREE.LatheGeometry(prof, 40);
    const pos = g.attributes.position, cols = new Float32Array(pos.count * 3);
    const seed = R() * 100;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const ang = Math.atan2(z, x);
      const n = Math.sin(ang * 3 + seed) * 0.06 + Math.sin(ang * 7 + y * 6 + seed) * 0.035 + Math.sin(ang * 13 + y * 11) * 0.02;
      const k = 1 + n * (pk.kind === 2 ? 0.6 : 1);
      pos.setXYZ(i, x * k * pk.rad * (pk.kind === 2 ? 1 : 1), y * (pk.h + 40) - 40, z * k * pk.rad * pk.sq);
    }
    g.computeVertexNormals();
    const nrm = g.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const steep = 1 - Math.abs(nrm.getY(i));
      const y = pos.getY(i);
      // granite where it is steep (the Sugarloaf is bare rock), forest on the gentler slopes, a sandy band at the water
      const rock = pk.kind === 2 ? smooth(0.25, 0.55, steep) : smooth(0.55, 0.8, steep);
      const fr = [0.08 + 0.05 * R(), 0.16 + 0.06 * R(), 0.06], rk = [0.46, 0.43, 0.4];
      const c = fr.map((f, j) => lerp(f, rk[j], rock));
      if (pk.kind === 3) { c[0] = lerp(0.4, c[0], smooth(0, 20, y)); c[1] = lerp(0.38, c[1], smooth(0, 20, y)); c[2] = lerp(0.33, c[2], smooth(0, 20, y)); }
      cols.set(c, i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const mat = patchHeat(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9 }), 'peak', { burnK: 0.8 });
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(pk.x, 0, pk.z);
    mesh.castShadow = false; mesh.receiveShadow = true;
    scene.add(mesh);
    peaks.push(mesh);
  }

  // ---------- burning, per frame ----------
  const T_IGN = (seed, a, b) => a + (b - a) * seed;      // ignition story time (s)
  return {
    palmTop, umb,
    frame(v, s, fire, smoke, cam) {
      const T = s.T;
      // palms: fronds brown (scorch), flare up (~15 s), then hang as charred stubs
      PALMS.forEach((pl, i) => {
        const t0 = T_IGN(pl.seed, 585, 700);
        const k = clamp((T - t0) / 50);
        const scorch = smooth(t0 - 80, t0, T);
        const top = palmTop[i];
        e.set(0, top.yaw, 0); q.setFromEuler(e);
        const shrink = 1 - 0.65 * smooth(0.3, 1, k);
        m4.compose(p.set(top.x, top.y, top.z), q, sc.set(shrink, 1 - 0.4 * smooth(0.3, 1, k), shrink));
        crowns.setMatrixAt(i, m4);
        crowns.setColorAt(i, tmpC.setRGB(0.18, 0.33, 0.1).lerp(new THREE.Color(0.38, 0.3, 0.14), scorch).lerp(new THREE.Color(0.05, 0.04, 0.03), smooth(0.2, 0.7, k)));
        const burning = k > 0 && k < 1 ? Math.sin(Math.PI * Math.pow(k, 0.6)) : 0;
        const dc = Math.hypot(top.x - cam.position.x, top.z - cam.position.z);
        if (burning > 0 && dc < 2500) {
          const nF = dc < 120 ? 7 : 3;
          for (let j = 0; j < nF; j++) {
            const a = j / nF * 6.28 + pl.seed * 9;
            const rr = 1.2 + 0.8 * Math.sin(j * 2.1);
            fire.add(top.x + Math.cos(a) * rr, top.y - 0.6, top.z + Math.sin(a) * rr, 1.6, 3.2 + 1.4 * Math.sin(j + v * 3), burning, pl.seed + j * 0.1);
          }
          smoke.puff(top.x, top.y + 4 + (v * 3 % 6), top.z, 2.5 + burning * 2, 0.25 * burning, 0.12, 0.6 * burning, pl.seed);
        }
      });
      crowns.instanceMatrix.needsUpdate = true; if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
      // umbrellas: the canopy scorches, flares, and burns away
      umb.forEach((u, i) => {
        // the ones around you go up together on the beat (~30× brighter, 9:15), the rest of the beach after them
        const t0 = u.near ? T_IGN(u.seed, 553, 575) : T_IGN(u.seed, 560, 660);
        const k = clamp((T - t0) / (u.near ? 150 : 120));
        const left = 1 - smooth(0.35, 1, k);
        e.set(u.tilt, u.seed * 6, 0); q.setFromEuler(e);
        m4.compose(p.set(u.x, u.y, u.z), q, sc.set(1, u.h, 1));
        poles.setMatrixAt(i, m4);
        const top = new THREE.Vector3(0, u.h, 0).applyQuaternion(q).add(p);
        if (left > 0.02) { m4.compose(top, q, sc.set(left, left, left)); canopies.setMatrixAt(i, m4); } else canopies.setMatrixAt(i, hide);
        canopies.setColorAt(i, tmpC.set(u.col).lerp(new THREE.Color(0.2, 0.15, 0.1), smooth(t0 - 60, t0 + 5, T) * 0.6).lerp(new THREE.Color(0.04, 0.03, 0.03), smooth(0.05, 0.5, k)));
        const burning = k > 0 && k < 1 ? Math.sin(Math.PI * Math.pow(k, 0.55)) : 0;
        const dc = Math.hypot(u.x - cam.position.x, u.z - cam.position.z);
        // before it catches: the canopy smokes (thin grey wisps off the top)
        const smo = smooth(t0 - 40, t0, T) * (1 - smooth(0.2, 0.6, k));
        // (not right next to you: up close a puff reads as a grey ball, not smoke)
        if (smo > 0.02 && dc < 160 && dc > 16) for (let j = 0; j < 8; j++) {
          const ph = (v * 0.9 + u.seed * 7 + j / 8) % 1;
          smoke.puff(top.x + ph * 0.8, top.y + 0.1 + ph * 3.5, top.z, 0.22 + ph * 0.5, 0.14 * smo * Math.sin(Math.PI * ph), 0.32, 0.0, u.seed + j);
        }
        if (burning > 0) {
          if (dc < 1500) {
            fire.add(top.x, top.y - 0.35, top.z, 1.8 * left + 0.4, 1.8 + 0.8 * burning, burning, u.seed);
            if (dc < 60) fire.add(top.x + 0.4, top.y - 0.4, top.z - 0.3, 1.4 * left + 0.3, 1.4 + 0.6 * burning, burning * 0.8, u.seed + 0.27);
            fire.add(u.x + 0.6, u.y, u.z, 0.6, 0.7, burning * 0.6, u.seed + 0.5);   // what fell burns on the sand
            if (i % 3 === 0 && dc > 28) for (let j = 0; j < 3; j++) {
              const ph = (v * 0.5 + u.seed * 5 + j / 3) % 1;
              smoke.puff(top.x + ph * 1.5, top.y + 1 + ph * 6, top.z, 0.7 + ph * 1.2, 0.2 * burning * Math.sin(Math.PI * ph), 0.1, 0.5 * burning * (1 - ph), u.seed + j);
            }
          }
        }
      });
      canopies.instanceMatrix.needsUpdate = true; poles.instanceMatrix.needsUpdate = true;
      if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
      // towels: they smoke first (the dark ones soonest), then burn low with small flames and are left black
      TOWELS.forEach((t, i) => {
        const a = towelAt[i];
        const t0 = a.near ? T_IGN(t.seed, 540, 560) : T_IGN(t.seed, 555, 640);
        const k = clamp((T - t0) / 120);
        towels.setColorAt(i, tmpC.set(t.col).lerp(new THREE.Color(0.25, 0.17, 0.1), smooth(t0 - 35, t0, T) * 0.5).lerp(new THREE.Color(0.04, 0.03, 0.03), smooth(0, 0.6, k)));
        if (!a.near) return;
        const dc = Math.hypot(a.x - cam.position.x, a.z - cam.position.z);
        if (dc > 120) return;
        const smo = smooth(t0 - 38, t0, T) * (1 - smooth(0.5, 1, k)) * smooth(10, 14, dc);   // (none right next to you)
        if (smo > 0.02) for (let j = 0; j < 3; j++) {
          const ph = (v * 0.8 + t.seed * 5 + j / 3) % 1;
          smoke.puff(a.x + (j - 1) * 0.35 + ph * 0.6, a.y + 0.1 + ph * 2.4, a.z, 0.12 + ph * 0.4, 0.45 * smo * Math.sin(Math.PI * ph), 0.3, 0.2 * k, t.seed + j);
        }
        const burning = k > 0 && k < 1 ? Math.sin(Math.PI * Math.pow(k, 0.5)) : 0;
        if (burning > 0) for (let j = 0; j < 3; j++) fire.add(a.x + (j - 1) * 0.45, a.y, a.z + (j - 1) * 0.3, 0.7, 0.55 + 0.45 * burning, burning, t.seed + j * 0.31);
      });
      if (towels.instanceColor) towels.instanceColor.needsUpdate = true;
    },
  };
}

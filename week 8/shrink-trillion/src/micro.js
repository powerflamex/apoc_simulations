// The two smallest living worlds.
//  makeBact (micrometres): you stand on a cotton fibre's grooved surface; rod-shaped bacteria (2 µm long, 0.8 µm
//    thick) lie and swim round you trailing wavy whips (flagella); one lies right beside you, as long as you are tall.
//  makeVirus (nanometres): you stand on a bacterium's skin (a bumpy carpet of proteins); viruses (~100 nm balls
//    studded with spikes) drift down and land round you; one sits beside you, up to your waist. Waves of light
//    (450-700 nm) roll through: glowing ribbons, bigger than you.
import * as THREE from 'three';
import { procMat, ellipsoid, tube } from './mats.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, smooth, lerp } from './util.js';

export function makeBact(scene) {
  const G = new THREE.Group();
  scene.add(G);
  const R = rng(31);
  const floorM = procMat({ color: 0xe9e2cf, rough: 0.7,
    col: `float gr = sin(vOP.x * 4.2 + 1.5 * sin(vOP.z * 0.35)); c *= 0.8 + 0.12 * gr + 0.12 * n3(vOP * vec3(0.6, 1.0, 0.15));
          c = mix(c, vec3(0.72, 0.85, 0.82), 0.25 * smoothstep(0.4, 0.8, fbm3(vOP * 0.05)));`,
    height: 'sin(vOP.x * 4.2 + 1.5 * sin(vOP.z * 0.35)) + 0.4 * n3(vOP * vec3(0.6, 1.0, 0.15))', bump: 0.06,
    emis: `e += diffuseColor.rgb * 0.08;` });
  {
    const g = new THREE.PlaneGeometry(260, 260, 120, 120).rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, -Math.pow(Math.max(0, Math.abs(x) - 12) / 40, 2) * 18 + 0.05 * Math.sin(z * 0.4)); }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, floorM); m.receiveShadow = true; G.add(m);
  }
  const bacM = procMat({ color: 0x32b37a, rough: 0.4, physical: { clearcoat: 0.6, clearcoatRoughness: 0.3, sheen: 0.6, sheenColor: new THREE.Color(0.6, 1, 0.8) },
    col: `float r = h13(floor(vIP * 3.0)); c = mix(c, vec3(0.2, 0.62, 0.78), step(0.6, r)); c = mix(c, vec3(0.62, 0.78, 0.22), step(0.88, r));
          c *= 0.78 + 0.3 * n3(vOP * 3.0 + vIP);`,
    height: 'n3(vOP * 6.0 + vIP) + 0.5 * n3(vOP * 14.0)', bump: 0.02, emis: `e += diffuseColor.rgb * 0.18;` });
  const flagM = procMat({ color: 0xbfe8d0, rough: 0.5, emis: `e += diffuseColor.rgb * 0.25;` });
  const bacG = new THREE.CapsuleGeometry(0.4, 1.2, 10, 24).rotateX(Math.PI / 2);
  const B = [];
  const add = (x, y, z, yaw, pitch, swim) => {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(bacG, bacM);
    body.castShadow = true; body.receiveShadow = true;
    grp.add(body);
    const fl = [];
    for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(new THREE.BufferGeometry(), flagM); grp.add(m); fl.push(m); }
    grp.position.set(x, y, z); grp.rotation.set(pitch, yaw, 0, 'YXZ');
    G.add(grp);
    B.push({ grp, fl, x, y, z, yaw, pitch, swim, ph: R() * 6, seed: R() });
  };
  add(-1.05, 0.42, 0.5, 0.15, 0, 0);                        // beside you, lying down
  for (let i = 0; i < 46; i++) {
    let x, z;
    do { x = (R() - 0.5) * 50; z = -6 + R() * 60; } while (Math.hypot(x, z) < 3.5 || (z < 2 && Math.abs(x) < 4));
    const swim = R() < 0.45;
    add(x, swim ? 0.6 + R() * 6 : 0.4, z, R() * 6.28, swim ? (R() - 0.5) * 0.6 : 0, swim);
  }
  return {
    group: G,
    frame(v) {
      const t = v - 23.6;
      for (const b of B) {
        if (b.swim) {
          const d = 1.2 * t;
          b.grp.position.set(b.x + Math.sin(b.yaw) * d, b.y + 0.15 * Math.sin(t + b.ph), b.z + Math.cos(b.yaw) * d);
        }
        b.grp.rotation.z = b.swim ? 0.5 * t : 0;
        b.fl.forEach((m, k) => {
          const pts = [];
          const a0 = k * 2.1 + b.seed;
          for (let i = 0; i <= 14; i++) {
            const s = i / 14, L = 5.5;
            const w = 0.35 * s * Math.sin(s * 9 - (v * 9 + b.ph));
            pts.push(new THREE.Vector3(Math.cos(a0) * (0.25 + 0.4 * s) + w * Math.cos(a0 + 1.5), Math.sin(a0) * (0.25 + 0.4 * s) * 0.6 + w * Math.sin(a0 + 1.5) * 0.6, -0.9 - L * s));
          }
          m.geometry.dispose();
          m.geometry = tube(pts, 0.035, 40, 5);
        });
      }
    },
  };
}

export function makeVirus(scene) {
  const G = new THREE.Group();
  scene.add(G);
  const R = rng(41);
  const floorM = procMat({ color: 0x3fae74, rough: 0.55,
    col: `vec2 v = vor3(vOP * 0.11); c *= 0.7 + 0.45 * smoothstep(0.0, 0.5, v.y - v.x); c = mix(c, vec3(0.28, 0.72, 0.75), 0.35 * smoothstep(0.4, 0.8, n3(vOP * 0.01)));`,
    height: 'smoothstep(0.0, 0.5, vor3(vOP * 0.11).y - vor3(vOP * 0.11).x) + 0.5 * n3(vOP * 0.3)', bump: 1.5, emis: `e += diffuseColor.rgb * 0.15;` });
  {
    const g = new THREE.PlaneGeometry(12000, 12000, 140, 140).rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, -Math.pow(Math.max(0, Math.abs(x) - 120) / 900, 2) * 600 + 6 * Math.sin(x * 0.02) * Math.sin(z * 0.03)); }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, floorM); m.receiveShadow = true; G.add(m);
  }
  // a virus: a ball ~100 nm across studded with club-shaped spikes
  const capM = procMat({ color: 0x3a7fd6, rough: 0.45, col: `c *= 0.75 + 0.35 * n3(vOP * 0.15);`, height: 'n3(vOP * 0.25)', bump: 1.0, emis: `e += diffuseColor.rgb * 0.2;` });
  const spikeM = procMat({ color: 0xf0457a, rough: 0.45, emis: `e += diffuseColor.rgb * 0.25;` });
  const capG = new THREE.IcosahedronGeometry(42, 4);
  const spikes = [];
  for (let i = 0; i < 64; i++) {
    const u = 2 * ((i + 0.5) / 64) - 1, a = i * 2.39996, d = new THREE.Vector3(Math.sqrt(1 - u * u) * Math.cos(a), u, Math.sqrt(1 - u * u) * Math.sin(a));
    const stalk = new THREE.CylinderGeometry(2.2, 3.0, 14, 6).translate(0, 7, 0);
    const club = new THREE.SphereGeometry(5.5, 10, 8).scale(1, 1.25, 1).translate(0, 16, 0);
    for (const g of [stalk, club]) { g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d)); g.translate(d.x * 40, d.y * 40, d.z * 40); spikes.push(g); }
  }
  const spikeG = mergeGeometries(spikes);
  const makeOne = () => {
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(capG, capM));
    grp.add(new THREE.Mesh(spikeG, spikeM));
    grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    G.add(grp);
    return grp;
  };
  const V = [];
  V.push({ g: makeOne(), x: -95, y: 52, z: 80, fall: 0, ax: new THREE.Vector3(0.3, 1, 0.2).normalize(), w: 0.15 });   // beside you
  for (let i = 0; i < 26; i++) {
    let x, z;
    do { x = (R() - 0.5) * 2600; z = -200 + R() * 2600; } while (Math.hypot(x, z) < 260 || (z < 100 && Math.abs(x) < 300));
    const fall = R() < 0.5 ? 120 + R() * 900 : 0;
    V.push({ g: makeOne(), x, y: 52 + fall, z, fall, ax: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(), w: (R() - 0.5) * 0.6, sp: 40 + R() * 80 });
  }
  // light: three waves (red 700 nm, green 550 nm, blue 450 nm) rolling across in front of you
  const waveM = (col) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const WAVES = [{ lam: 700, col: new THREE.Color(2.8, 0.45, 0.3), x: -300, z: 700, amp: 110 }, { lam: 550, col: new THREE.Color(0.5, 3.0, 0.6), x: -60, z: 620, amp: 95 }, { lam: 450, col: new THREE.Color(0.45, 0.75, 3.2), x: 170, z: 760, amp: 80 }];
  for (const w of WAVES) { w.m = new THREE.Mesh(new THREE.BufferGeometry(), waveM(w.col)); w.m.frustumCulled = false; G.add(w.m); }
  return {
    group: G, V, WAVES,
    frame(v, s) {
      const t = v - 27.4;
      V.forEach((o, i) => {
        const y = i === 0 ? o.y : 52 + Math.max(0, o.fall - (o.sp || 0) * t);
        o.g.position.set(o.x, y, o.z);
        o.g.setRotationFromAxisAngle(o.ax, (i === 0 ? 0.3 : 0) + o.w * t);
      });
      // the waves: from the "smaller than light" step on
      const on = smooth(30.2, 30.9, v);
      for (const w of WAVES) {
        w.m.visible = on > 0.01;
        if (!w.m.visible) continue;
        w.m.material.opacity = 0.9 * on;
        const pts = [], ph = v * 2.2;
        for (let i = 0; i <= 120; i++) { const y = -100 + i * 30; pts.push(new THREE.Vector3(w.x + w.amp * Math.sin(2 * Math.PI * y / w.lam - ph), y, w.z)); }
        w.m.geometry.dispose();
        w.m.geometry = tube(pts, 13, 240, 6);
      }
    },
  };
}

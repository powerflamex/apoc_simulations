// Bacteria and the virus (inside the dew drop, on the ground beside you).
//  makeBact (micrometres, real origin = your feet): one bacterium (E. coli: a 2 µm rod, 0.8 µm thick) lies on the
//    ground right in front of you; others swim past trailing their whips (flagella). Its wall is a soft gel you can sink
//    through (from inside: a glowing membrane).
//  makePhages (nanometres): a T4 bacteriophage (~200 nm tall: a 20-sided head, a striped tail, six jointed legs) comes
//    down through the water and lands on the bacterium's bulging side just above you; two more land further off.
import * as THREE from 'three';
import { procMat, tube } from './mats.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, smooth } from './util.js';
import { T_PHAGE } from './timeline.js';

export const BAC_C = new THREE.Vector3(-0.5, 0.4, 0.3);    // the bacterium on your left (µm), lying along z
export const BAC_R = 0.4, BAC_L = 2.1;

export function makeBact(scene) {
  const G = new THREE.Group();
  scene.add(G);
  const R = rng(31);
  // (uHole: a round opening in the wall, in the rod's own coordinates; its lips glow)
  const holeU = { uHole: { value: new THREE.Vector4(0, 0, 0, 0) } };
  const skin = (alpha, U = null) => procMat({ color: 0x35b07a, rough: 0.4, transparent: alpha < 1, opacity: alpha, side: THREE.DoubleSide, uniforms: U || { uHole: { value: new THREE.Vector4(0, 0, 0, 0) } },
    physical: { clearcoat: 0.6, clearcoatRoughness: 0.3, sheen: 0.6, sheenColor: new THREE.Color(0.6, 1, 0.8) },
    col: `float r = h13(floor(vIP * 3.0)); c = mix(c, vec3(0.2, 0.62, 0.78), step(0.6, r)); c = mix(c, vec3(0.62, 0.78, 0.22), step(0.88, r));
          c *= 0.78 + 0.3 * n3(vOP * 3.0 + vIP); c *= 0.9 + 0.15 * n3(vOP * 30.0);
          if (!gl_FrontFacing) { c = mix(c, vec3(0.95, 0.75, 0.55), 0.6); diffuseColor.a *= 0.3; }
          if (uHole.w > 0.0) { float hd = distance(vOP, uHole.xyz); if (hd < uHole.w) discard; c = mix(c, vec3(0.75, 1.0, 0.85), (1.0 - smoothstep(uHole.w, uHole.w * 1.35, hd)) * 0.7); }`,
    height: 'n3(vOP * 6.0 + vIP) + 0.5 * n3(vOP * 14.0) + 0.3 * n3(vOP * 60.0)', bump: 0.02, emis: `e += diffuseColor.rgb * 0.2;` });
  const bacG = new THREE.CapsuleGeometry(BAC_R, BAC_L - 2 * BAC_R, 16, 40).rotateZ(Math.PI / 2);
  const flagM = procMat({ color: 0xbfe8d0, rough: 0.5, emis: `e += diffuseColor.rgb * 0.25;` });
  const B = [];
  const add = (p, yaw, swim, mat) => {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(bacG, mat);
    body.castShadow = true; body.receiveShadow = true;
    grp.add(body);
    const fl = [];
    for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(new THREE.BufferGeometry(), flagM); grp.add(m); fl.push(m); }
    grp.position.copy(p); grp.rotation.set(0, yaw, 0);
    G.add(grp);
    B.push({ grp, body, fl, p: p.clone(), yaw, swim, ph: R() * 6, seed: R() });
    return B[B.length - 1];
  };
  const target = add(BAC_C.clone(), Math.PI / 2, 0, skin(0.97, holeU));
  // the inner membrane (seen as you pass through the wall), slightly smaller
  const innerM = procMat({ color: 0xf2c79a, rough: 0.5, transparent: true, opacity: 0.22, side: THREE.BackSide, emis: `e += diffuseColor.rgb * 0.35;`, uniforms: holeU,
    col: `c *= 0.8 + 0.3 * n3(vOP * 40.0); if (uHole.w > 0.0 && distance(vOP * vec3(1.0, 1.0 / 0.93, 1.0 / 0.93), uHole.xyz) < uHole.w) discard;` });
  const inner = new THREE.Mesh(new THREE.CapsuleGeometry(BAC_R * 0.93, BAC_L - 2 * BAC_R, 16, 40).rotateZ(Math.PI / 2), innerM);
  target.grp.add(inner);
  const swimM = skin(1);
  for (let i = 0; i < 16; i++) {
    let p;
    do { p = new THREE.Vector3((R() - 0.5) * 10, 0.5 + R() * 3.5, 1.4 + R() * 7); } while (Math.hypot(p.x + 0.5, p.z - 0.3) < 2.0);
    add(p, R() * 6.28, 0.6 + R() * 0.8, swimM);
  }
  return {
    group: G, target, inner,
    // guard: keeps swimmers off you and the camera; hole: where you go in (µm), holeK: how far it has opened
    frame(v, guard = null, hole = null, holeK = 0) {
      if (hole) {
        const h = hole.clone().sub(BAC_C).applyAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
        holeU.uHole.value.set(h.x, h.y, h.z, 0.17 * holeK);
      }
      G.updateMatrixWorld(true);
      const inv = G.matrixWorld.clone().invert(), gv = new THREE.Vector3();
      const t = v - 15;
      for (const b of B) {
        if (b.swim) {
          const d = b.swim * t;
          b.grp.position.set(b.p.x + Math.cos(b.yaw) * d, b.p.y + 0.1 * Math.sin(t + b.ph), b.p.z - Math.sin(b.yaw) * d);
          if (guard) { gv.copy(b.grp.position).applyMatrix4(G.matrixWorld); if (guard(gv, 1.1 * G.scale.x)) b.grp.position.copy(gv.applyMatrix4(inv)); }
          b.body.rotation.x = 2.5 * t + b.ph;
        }
        b.fl.forEach((m, k) => {
          const pts = [];
          const a0 = k * 1.6 + b.seed * 6;
          for (let i = 0; i <= 16; i++) {
            const s = i / 16, L = 6;
            const w = 0.32 * s * Math.sin(s * 10 - (v * (b.swim ? 11 : 4) + b.ph));
            pts.push(new THREE.Vector3(-BAC_L * 0.45 - L * s, Math.sin(a0) * (0.25 + 0.5 * s) + w * Math.cos(a0), Math.cos(a0) * (0.25 + 0.5 * s) + w * Math.sin(a0)));
          }
          m.geometry.dispose();
          m.geometry = tube(pts, 0.03, 48, 5);
        });
      }
    },
  };
}

// ---------- the bacteriophage (nm), built standing on its legs at the origin, head up +y ----------
function phageModel() {
  const G = new THREE.Group();
  const headM = procMat({ color: 0x9f7bea, rough: 0.35, physical: { clearcoat: 0.6 }, col: `c *= 0.8 + 0.3 * n3(vOP * 0.2);`, emis: `e += diffuseColor.rgb * 0.22;` });
  const tailM = procMat({ color: 0xe9a23b, rough: 0.4, col: `c *= 0.75 + 0.35 * step(0.5, fract(vOP.y / 4.2));`, emis: `e += diffuseColor.rgb * 0.2;` });
  const legM = procMat({ color: 0xf2e7c9, rough: 0.5, emis: `e += diffuseColor.rgb * 0.2;` });
  const hg = new THREE.IcosahedronGeometry(42, 0).scale(1, 1.35, 1);
  hg.computeVertexNormals();
  const head = new THREE.Mesh(hg, headM); head.position.y = 170; G.add(head);
  G.add(new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 8, 6).translate(0, 118, 0), tailM));          // collar
  G.add(new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 98, 16).translate(0, 66, 0), tailM));          // sheath
  G.add(new THREE.Mesh(new THREE.CylinderGeometry(26, 22, 8, 6).translate(0, 16, 0), legM));             // baseplate
  const legs = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const knee = new THREE.Vector3(Math.cos(a) * 85, 52, Math.sin(a) * 85), foot = new THREE.Vector3(Math.cos(a) * 125, 0, Math.sin(a) * 125);
    const t = tube([new THREE.Vector3(Math.cos(a) * 22, 16, Math.sin(a) * 22), new THREE.Vector3(Math.cos(a) * 55, 40, Math.sin(a) * 55), knee, knee.clone().lerp(foot, 0.5).add(new THREE.Vector3(0, 6, 0)), foot], 2.4, 30, 6);
    t.deleteAttribute('aU');
    legs.push(t.toNonIndexed());
    legs.push(new THREE.SphereGeometry(4, 8, 6).translate(foot.x, foot.y, foot.z).toNonIndexed());
  }
  G.add(new THREE.Mesh(mergeGeometries(legs), legM));
  G.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return G;
}

// where each virus lands (µm, on the bacterium's surface: the direction from its axis) and when
export const PHAGES = [
  { dir: new THREE.Vector3(0.9, -0.42, 0), x: 0.32, t0: T_PHAGE[0], t1: T_PHAGE[1] },
  { dir: new THREE.Vector3(0.55, 0.83, 0), x: 0.85, t0: T_PHAGE[0] - 0.8, t1: T_PHAGE[1] - 0.6 },
  { dir: new THREE.Vector3(0.3, 0.95, 0), x: -0.3, t0: T_PHAGE[0] + 0.5, t1: T_PHAGE[1] + 0.9 },
];
export function phageSpot(P) {   // the landing point (µm) and the surface's outward direction
  const n = P.dir.clone().normalize();
  return { p: new THREE.Vector3(BAC_C.x + n.x * BAC_R, BAC_C.y + n.y * BAC_R, BAC_C.z + P.x), n };   // (P.x: along the rod)
}

export function makePhages(scene) {
  const list = PHAGES.map((P) => {
    const G = new THREE.Group();
    scene.add(G);
    const m = phageModel();
    G.add(m);
    return { P, G, m, sp: phageSpot(P) };
  });
  const up = new THREE.Vector3(0, 1, 0);
  return {
    list,
    frame(v) {
      for (const o of list) {
        const k = smooth(o.P.t0, o.P.t1, v);
        o.m.position.copy(o.sp.n).multiplyScalar((1 - k) * 900);
        o.m.quaternion.setFromUnitVectors(up, o.sp.n);
        o.m.rotateY(0.6 * (1 - k) + 0.3 * Math.sin(v * 0.4));
        o.m.rotateX(0.35 * (1 - k) * Math.sin(v * 1.3));
        o.m.scale.set(1, 1 - 0.12 * smooth(o.P.t1 + 0.6, o.P.t1 + 2.0, v), 1);
      }
    },
  };
}

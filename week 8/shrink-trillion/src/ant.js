// A red wood ant, ~12 mm long, built in millimetres (+z forward, y up, origin on the ground under the waist):
// head with jaws, eyes and elbowed antennae, a humped thorax, the waist node, the big striped gaster, six legs that
// walk a tripod gait (each foot planted where the body will be at mid-stance, so feet never slide).
import * as THREE from 'three';
import { procMat, ellipsoid, tube } from './mats.js';
import { lerp, smooth, clamp } from './util.js';

const shell = (color, o = {}) => procMat({ color, rough: 0.38, physical: { clearcoat: 0.7, clearcoatRoughness: 0.35 },
  col: `c *= 0.82 + 0.3 * n3(vOP * 6.0); ${o.col || ''}`, height: o.height || 'n3(vOP * 14.0) * 0.6 + n3(vOP * 40.0) * 0.4', bump: o.bump ?? 0.05 });

// rest positions of the feet (body frame, mm) and the leg roots on the thorax
const ROOT = [[0.55, 1.35, 2.6], [0.7, 1.3, 1.5], [0.72, 1.3, 0.45]];
const FOOT = [[3.6, 0, 5.4], [4.6, 0, 1.3], [4.1, 0, -3.6]];
const FEMUR = 3.3, TIBIA = 3.8;
// tripod: L1, R2, L3 together; R1, L2, R3 half a cycle later
const OFFS = [[0, 0.5], [0.5, 0], [0, 0.5]];   // [leg row][side L, R]

export function makeAnt() {
  const red = shell(0xb8401c, { col: `c = mix(c, vec3(0.45, 0.12, 0.05), smoothstep(0.55, 0.85, n3(vOP * 2.0)) * 0.5);` });
  const black = shell(0x1c1310, { col: `c *= 0.8 + 0.6 * smoothstep(0.6, 1.0, fract(-vOP.z * 0.62 + 0.3));` });   // the gaster's bands
  const dark = shell(0x2a1710);
  const eyeM = procMat({ color: 0x0b0b0d, rough: 0.15, physical: { clearcoat: 1, clearcoatRoughness: 0.1 },
    col: `vec2 v = vor3(vOP * 9.0); c *= 0.7 + 0.8 * smoothstep(0.0, 0.2, v.y - v.x);`, height: 'smoothstep(0.0, 0.25, vor3(vOP * 9.0).y - vor3(vOP * 9.0).x)', bump: 0.03 });
  const hairM = new THREE.MeshStandardMaterial({ color: 0xd8b070, roughness: 0.6 });
  const G = new THREE.Group();            // on the ground, along the path
  const body = new THREE.Group();         // bobs a little
  G.add(body);
  // gaster (abdomen), waist node, thorax, head
  const gaster = new THREE.Mesh(ellipsoid(1.95, 1.65, 2.6, 36).rotateX(-0.25).translate(0, 2.1, -3.6), black);
  const node = new THREE.Mesh(ellipsoid(0.5, 0.7, 0.35, 16).translate(0, 1.85, -0.75), red);
  const thorax = new THREE.Group();
  thorax.add(new THREE.Mesh(ellipsoid(0.85, 0.85, 1.25, 28).translate(0, 2.05, 2.2), red));     // front part
  thorax.add(new THREE.Mesh(ellipsoid(0.8, 0.9, 1.2, 28).translate(0, 1.95, 0.75), red));       // hump
  thorax.add(new THREE.Mesh(ellipsoid(0.55, 0.45, 0.6, 16).translate(0, 1.8, 3.25), red));      // neck
  body.add(gaster, node, thorax);
  const head = new THREE.Group();
  head.position.set(0, 2.15, 3.7);
  body.add(head);
  head.add(new THREE.Mesh(ellipsoid(1.3, 1.15, 1.25, 32).translate(0, 0.1, 0.9), red));
  for (const sx of [-1, 1]) {
    head.add(new THREE.Mesh(ellipsoid(0.38, 0.5, 0.48, 18).translate(sx * 1.12, 0.35, 1.05), eyeM));
    // jaws: curved, toothed, meeting in front
    const jaw = new THREE.Mesh(tube([[sx * 0.55, -0.55, 1.9], [sx * 0.7, -0.6, 2.45], [sx * 0.35, -0.62, 2.85], [sx * 0.05, -0.6, 2.9]], (t) => 0.22 * (1 - 0.7 * t), 16, 8), dark);
    head.add(jaw);
  }
  // antennae: a long scape up and forward, then the bent whip (rebuilt each frame as they sweep)
  const antM = [new THREE.Mesh(new THREE.BufferGeometry(), dark), new THREE.Mesh(new THREE.BufferGeometry(), dark)];
  head.add(...antM);
  // fine golden hairs on the gaster
  {
    const g = new THREE.CylinderGeometry(0.018, 0.01, 0.55, 4).translate(0, 0.27, 0);
    const n = 160, inst = new THREE.InstancedMesh(g, hairM, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), nn = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2;
      nn.set(Math.sqrt(1 - u * u) * Math.cos(a), u, Math.sqrt(1 - u * u) * Math.sin(a));
      if (nn.y < -0.3) nn.y = -nn.y;
      p.set(nn.x * 1.95, nn.y * 1.65, nn.z * 2.6).applyAxisAngle(new THREE.Vector3(1, 0, 0), -0.25).add(new THREE.Vector3(0, 2.1, -3.6));
      nn.add(new THREE.Vector3(0, 0, -0.8)).normalize();
      q.setFromUnitVectors(up, nn);
      m.compose(p, q, new THREE.Vector3(1, 1, 1));
      inst.setMatrixAt(i, m);
    }
    body.add(inst);
  }
  // legs: femur and tibia as tapered tubes rebuilt each frame (cheap at 12 segments), a tarsus claw
  const legs = [];
  for (let r = 0; r < 3; r++) for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.BufferGeometry(), r === 0 ? red : dark);
    G.add(m);
    legs.push({ r, sx, mesh: m, off: OFFS[r][sx < 0 ? 0 : 1] });
  }
  G.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });

  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  // frameAt(d): { p: Vector3 (mm), yaw }; the body's frame on the path at distance d
  function legGeom(a, k, f) {
    // a: root, k: knee, f: foot (all in G's frame); femur root->knee, tibia knee->foot, then a short claw
    const pts = [a, a.clone().lerp(k, 0.5).add(tmp.set(0, 0.15, 0)), k, k.clone().lerp(f, 0.5), f.clone().add(tmp2.set(0, 0.25, 0)), f];
    return tube(pts, (t) => (t < 0.4 ? lerp(0.32, 0.26, t / 0.4) : lerp(0.2, 0.09, (t - 0.4) / 0.6)), 22, 7);
  }
  return {
    group: G,
    // d: distance walked (mm); frameAt: (d) => { p, yaw }; look: 0..1 the head turned toward 'target' (G frame)
    pose(v, d, frameAt, stride = 2.6, lookAt = null, look = 0) {
      const F = frameAt(d);
      G.position.copy(F.p);
      G.rotation.set(0, F.yaw, 0);
      G.updateMatrix();
      const inv = G.matrix.clone().invert();
      body.position.y = 0.08 * Math.sin(d / stride * Math.PI * 2 * 2);
      body.rotation.set(0.02 * Math.sin(d / stride * Math.PI * 2), 0, 0.02 * Math.sin(d / stride * Math.PI * 2 + 1));
      // the head: a slow look about, turning to the target
      let hy = 0.15 * Math.sin(v * 0.9), hp = 0.1 + 0.05 * Math.sin(v * 1.3);
      if (lookAt && look > 0) {
        const l = lookAt.clone().applyMatrix4(inv);
        hy = lerp(hy, clamp(Math.atan2(l.x, l.z - 3.7), -0.7, 0.7), look);
        hp = lerp(hp, clamp(-Math.atan2(l.y - 2.2, Math.hypot(l.x, l.z - 3.7)), -0.5, 0.5), look);
      }
      head.rotation.set(hp, hy, 0, 'YXZ');
      // antennae: the whips sweep, reaching forward when looking
      antM.forEach((m, i) => {
        const sx = i ? 1 : -1;
        const sw = Math.sin(v * 2.3 + i * 1.7) * 0.35 + look * 0.3;
        const b = new THREE.Vector3(sx * 0.55, 0.85, 1.85);
        const e = new THREE.Vector3(sx * (1.1 + 0.4 * sw), 2.4, 2.9 + 0.3 * look);
        const t1 = e.clone().add(new THREE.Vector3(sx * (0.6 + 0.4 * sw), -0.2 + 0.4 * Math.sin(v * 1.7 + i), 1.6 + 0.8 * look));
        const t2 = t1.clone().add(new THREE.Vector3(sx * 0.3 * sw, -0.9 + 0.4 * look, 1.3 + 0.5 * look));
        m.geometry.dispose();
        m.geometry = tube([b, b.clone().lerp(e, 0.5).add(new THREE.Vector3(0, 0.1, 0)), e, t1, t2], (t) => lerp(0.17, 0.1, t), 26, 6);
      });
      // legs
      for (const L of legs) {
        const root = new THREE.Vector3(L.sx * ROOT[L.r][0], ROOT[L.r][1] + body.position.y, ROOT[L.r][2]);
        const rest = new THREE.Vector3(L.sx * FOOT[L.r][0], 0, FOOT[L.r][2]);
        const u = d / stride + L.off, k = Math.floor(u), f = u - k;
        const plant = (kk) => {
          const dd = (kk + 0.25 - L.off) * stride;
          const Fk = frameAt(dd);
          return rest.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), Fk.yaw).add(Fk.p);
        };
        let footW;
        if (f < 0.5) footW = plant(k);
        else {
          const s = (f - 0.5) / 0.5, a = plant(k), b = plant(k + 1);
          footW = a.lerp(b, smooth(0, 1, s)); footW.y += 1.2 * Math.sin(Math.PI * s);
        }
        const foot = footW.applyMatrix4(inv);
        // the knee: up and out from the line root->foot
        const mid = root.clone().lerp(foot, 0.5);
        const dist = root.distanceTo(foot);
        const hgt = Math.sqrt(Math.max(0.3, (FEMUR + TIBIA) * (FEMUR + TIBIA) / 4 - dist * dist / 4));
        const out = new THREE.Vector3(foot.x - root.x, 0, foot.z - root.z).normalize();
        const knee = mid.add(new THREE.Vector3(0, hgt * 0.9, 0)).addScaledVector(out, 0.35 * hgt);
        L.mesh.geometry.dispose();
        L.mesh.geometry = legGeom(root, knee, foot);
      }
    },
  };
}

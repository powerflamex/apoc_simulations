// Our bank: the fountain (a tall centre jet and a ring of arcing jets: a jet's height is v^2 / 2g, so it halves
// every time gravity doubles), benches, iron lamp posts lit for the evening, plane trees along the river, the
// railing. Under the weight the trees sag, then their crowns break off and drop; the lamp posts bow and fold over;
// the fountain's pumps die with the power.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BEND_GLSL, G } from './bend.js';
import { FOUNTAIN, LAMPS, TREES, BENCHES, PROM } from './layout.js';
import { gAt, vAtG } from './timeline.js';
import { smooth, clamp, rng } from './util.js';

const dummy = new THREE.Object3D();
const tmpC = new THREE.Color();
const F = FOUNTAIN;

export function makePlaza(scene, { plainMat, glowMat, shadowy }) {
  const out = {};
  // ---------- fountain: basin wall, water, a three-tier centre piece ----------
  {
    const rimProfile = [[F.r - 0.45, 0], [F.r - 0.45, 0.48], [F.r - 0.5, 0.55], [F.r + 0.3, 0.55], [F.r + 0.25, 0.5], [F.r + 0.2, 0]].map(([r, y]) => new THREE.Vector2(r, y));
    const rim = new THREE.Mesh(new THREE.LatheGeometry(rimProfile, 96).translate(F.x, 0, F.z), plainMat(0xb9b0a3, 0.6));
    shadowy(rim); scene.add(rim);
    const water = new THREE.Mesh(new THREE.CircleGeometry(F.r - 0.45, 64).rotateX(-Math.PI / 2).translate(F.x, 0.38, F.z),
      plainMat(0x6f8796, 0.25));
    water.receiveShadow = true; scene.add(water);
    const tiers = mergeGeometries([
      new THREE.CylinderGeometry(1.2, 1.5, 1.0, 32).translate(0, 0.5, 0),
      new THREE.CylinderGeometry(2.6, 2.2, 0.25, 40).translate(0, 1.1, 0),
      new THREE.CylinderGeometry(0.45, 0.6, 1.0, 20).translate(0, 1.7, 0),
      new THREE.CylinderGeometry(1.3, 1.1, 0.2, 32).translate(0, 2.25, 0),
      new THREE.CylinderGeometry(0.25, 0.3, 0.6, 16).translate(0, 2.6, 0),
    ].map((g) => g.toNonIndexed())).translate(F.x, 0, F.z);
    const t = new THREE.Mesh(tiers, plainMat(0xc4bbae, 0.55)); shadowy(t); scene.add(t);
  }
  // the jets: droplets on ballistic arcs, recomputed in the shader from the gravity of the moment
  {
    const R = rng(21);
    const jets = [];   // origin xyz, launch velocity xyz (m/s), count
    jets.push({ o: [F.x, 2.9, F.z], v: [0, 15.3, 0], n: 4200, spread: 0.012 });                 // 12 m at 1 g
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const r = F.r - 0.9;
      jets.push({ o: [F.x + Math.sin(a) * r, 0.5, F.z + Math.cos(a) * r], v: [-Math.sin(a) * 2.6, 9.6, -Math.cos(a) * 2.6], n: 700, spread: 0.014 });   // ~4.7 m arcs
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.2;
      jets.push({ o: [F.x + Math.sin(a) * 1.6, 1.25, F.z + Math.cos(a) * 1.6], v: [Math.sin(a) * 1.4, 6.3, Math.cos(a) * 1.4], n: 300, spread: 0.016 });
    }
    const total = jets.reduce((s, j) => s + j.n, 0);
    const aO = new Float32Array(total * 3), aV = new Float32Array(total * 3), aP = new Float32Array(total * 4);
    let i = 0;
    for (const j of jets) for (let k = 0; k < j.n; k++, i++) {
      aO.set(j.o, i * 3);
      const sp = j.spread;
      aV.set([j.v[0] + (R() - 0.5) * sp * 14, j.v[1] * (1 + (R() - 0.5) * sp * 3), j.v[2] + (R() - 0.5) * sp * 14], i * 3);
      aP.set([R(), 0.012 + R() * 0.02, R(), R()], i * 4);
    }
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.setAttribute('aO', new THREE.InstancedBufferAttribute(aO, 3));
    geo.setAttribute('aV', new THREE.InstancedBufferAttribute(aV, 3));
    geo.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 4));
    geo.instanceCount = total;
    const u = { uCap: G.uCap, uFlow: G.uFlow, uR: G.uR, uCam: G.uCam, uTime: G.uTime, uG: { value: 9.81 }, uPump: { value: 1 }, uLight: { value: new THREE.Color(1, 0.85, 0.7) } };
    out.jetU = u;
    const mat = new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec3 aO; attribute vec3 aV; attribute vec4 aP; uniform float uG; uniform float uPump;
        varying vec2 vUv; varying float vA;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        ${BEND_GLSL}
        void main() {
          vec3 vel = aV * uPump;
          float tf = 2.0 * max(vel.y, 0.01) / uG;             // time of flight back to the launch height
          float tau = fract(uTime / max(tf, 0.02) + aP.x) * tf;
          vec3 p = aO + vel * tau - vec3(0.0, 0.5 * uG * tau * tau, 0.0);
          p.y = max(p.y, 0.4);
          vA = smoothstep(0.0, 0.05, tau / tf) * (1.0 - smoothstep(0.85, 1.0, tau / tf)) * smoothstep(0.02, 0.3, uPump) * (0.22 + 0.3 * aP.z);
          vec4 mv = viewMatrix * vec4(bendWorld(p), 1.0);
          // droplets stretch along their motion a little
          mv.xy += position.xy * aP.y * (1.0 + 0.6 * position.y * position.y);
          vUv = position.xy;
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; varying float vA; uniform vec3 uLight;
        #include <common>
        #include <logdepthbuf_pars_fragment>
        void main() {
          #include <logdepthbuf_fragment>
          float r = length(vUv);
          if (r > 1.0) discard;
          gl_FragColor = vec4(uLight, vA * (1.0 - r * r));
        }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false; m.renderOrder = 4;
    scene.add(m);
  }

  // ---------- benches ----------
  {
    const parts = [
      new THREE.BoxGeometry(1.9, 0.08, 0.5).translate(0, 0.45, 0),
      new THREE.BoxGeometry(1.9, 0.45, 0.06).translate(0, 0.72, -0.24).rotateX(-0.12),
      new THREE.BoxGeometry(0.08, 0.45, 0.5).translate(-0.85, 0.22, 0), new THREE.BoxGeometry(0.08, 0.45, 0.5).translate(0.85, 0.22, 0),
    ].map((g) => g.toNonIndexed());
    const g = mergeGeometries(parts);
    const m = new THREE.InstancedMesh(g, plainMat(0x5a3d26, 0.8), BENCHES.length);
    BENCHES.forEach((b, i) => { dummy.position.set(b.x, 0, b.z); dummy.rotation.set(0, b.yaw + Math.PI, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); });
    shadowy(m); scene.add(m);
  }

  // ---------- the railing along the river ----------
  {
    const g = mergeGeometries([
      new THREE.BoxGeometry(600, 0.07, 0.07, 300, 1, 1).translate(0, 1.05, 0),
      new THREE.BoxGeometry(600, 0.05, 0.05, 300, 1, 1).translate(0, 0.55, 0),
    ]);
    const m = new THREE.Mesh(g.translate(0, 0, PROM.z0 + 0.5), plainMat(0x22262a, 0.5, { metalness: 0.5 }));
    m.frustumCulled = false; scene.add(m);
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 1.08, 0.08).translate(0, 0.54, 0), plainMat(0x22262a, 0.5), 300);
    for (let i = 0; i < 300; i++) { dummy.position.set(-300 + i * 2, 0, PROM.z0 + 0.5); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); posts.setMatrixAt(i, dummy.matrix); }
    posts.frustumCulled = false; scene.add(posts);
  }

  // ---------- lamp posts: a fluted pole, a lantern; bowed then folded by the weight ----------
  const lampPole = new THREE.InstancedMesh(mergeGeometries([
    new THREE.CylinderGeometry(0.09, 0.14, 1, 8).translate(0, 0.5, 0).toNonIndexed(),
  ]), plainMat(0x1d2328, 0.45, { metalness: 0.6 }), LAMPS.length);
  const lampHead = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.14, 0.5, 8).translate(0, 0.25, 0), glowMat(new THREE.Color(3.2, 2.3, 1.3)), LAMPS.length);
  const lampCap = new THREE.InstancedMesh(new THREE.ConeGeometry(0.32, 0.3, 8).translate(0, 0.65, 0), plainMat(0x1d2328, 0.45, { metalness: 0.6 }), LAMPS.length);
  shadowy(lampPole); lampHead.frustumCulled = false; shadowy(lampCap);
  scene.add(lampPole, lampHead, lampCap);

  // ---------- trees ----------
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 4.2, 7).translate(0, 2.1, 0);
  const crownGeo = (() => {
    const R = rng(8);
    const parts = [];
    for (let k = 0; k < 7; k++) parts.push(new THREE.IcosahedronGeometry(1.3 + R() * 0.8, 1).translate((R() - 0.5) * 2.6, (R() - 0.5) * 1.2, (R() - 0.5) * 2.6).toNonIndexed());
    return mergeGeometries(parts);
  })();
  const trunks = new THREE.InstancedMesh(trunkGeo, plainMat(0x5b4a3a, 0.9), TREES.length);
  const crowns = new THREE.InstancedMesh(crownGeo, plainMat(0xffffff, 0.85, { flatShading: true }), TREES.length);
  const RT = rng(13);
  TREES.forEach((t, i) => crowns.setColorAt(i, tmpC.setHSL(0.2 + RT() * 0.07, 0.38, 0.2 + RT() * 0.07)));
  shadowy(trunks); shadowy(crowns);
  scene.add(trunks, crowns);

  out.lampOn = (l, v) => clamp(1 - smooth(vAtG(l.g) - 0.1, vAtG(l.g) + 0.15, v)) ;
  out.frame = (v, s, glows) => {
    const g = gAt(v);
    out.jetU.uG.value = 9.81 * g;
    out.jetU.uPump.value = s.pump;
    // lamps: from their failure point the pole bows, then folds to the ground
    LAMPS.forEach((l, i) => {
      const vf = vAtG(l.g);
      const k = clamp((v - vf) / 0.55);
      const bow = 0.06 * smooth(vf - 2.5, vf, v);
      const tilt = bow + (Math.PI / 2 - 0.08) * k * k;
      dummy.position.set(l.x, 0, l.z);
      dummy.rotation.set(Math.cos(l.dir) * tilt, 0, Math.sin(l.dir) * tilt);
      dummy.scale.set(1, l.h, 1); dummy.updateMatrix();
      lampPole.setMatrixAt(i, dummy.matrix);
      // the lantern sits on top of the pole
      const top = new THREE.Vector3(0, l.h, 0).applyEuler(dummy.rotation);
      dummy.position.set(l.x + top.x, top.y, l.z + top.z); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      lampCap.setMatrixAt(i, dummy.matrix);
      const on = s.grid * out.lampOn(l, v);
      dummy.scale.setScalar(on > 0.02 ? 1 : 0.0001); dummy.updateMatrix();
      lampHead.setMatrixAt(i, dummy.matrix);
      if (on > 0.02) glows.add(l.x + top.x, top.y + 0.3, l.z + top.z, 2.2, 1.4 * on, 0.95 * on, 0.5 * on);
    });
    lampPole.instanceMatrix.needsUpdate = lampHead.instanceMatrix.needsUpdate = lampCap.instanceMatrix.needsUpdate = true;
    // trees: the crown sags as it gets heavier, branches break and the crown drops; the trunk leans
    TREES.forEach((t, i) => {
      const sag = smooth(vAtG(1.3), vAtG(t.gs), v);
      const vf = vAtG(t.gf);
      const k = clamp((v - vf) / 0.4);
      const lean = t.lean * smooth(vf, vf + 0.3, v) * 0.5;
      dummy.position.set(t.x, 0, t.z); dummy.rotation.set(lean, t.seed * 6, 0); dummy.scale.setScalar(t.s); dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      const y = (5.3 - 0.9 * sag) * (1 - k * k) + 1.0 * k * k;
      dummy.position.set(t.x, y * t.s, t.z);
      dummy.rotation.set(lean + 0.3 * k, t.seed * 6, 0.25 * k * Math.sin(t.seed * 9));
      dummy.scale.set(t.s * (1 + 0.15 * sag + 0.25 * k), t.s * (1 - 0.3 * sag - 0.35 * k), t.s * (1 + 0.15 * sag + 0.25 * k));
      dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
    });
    trunks.instanceMatrix.needsUpdate = crowns.instanceMatrix.needsUpdate = true;
  };
  return out;
}

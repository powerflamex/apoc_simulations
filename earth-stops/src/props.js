// Street furniture and signs: lamp posts, traffic signals, the median's rain trees and the sidewalk trees, shop
// signs (lit, from a canvas atlas of made-up names), the big LED screen on the corner, the footbridge you stand on,
// and two city buses. Everything that can tear loose has a release time (layout.js) and then flies (fly.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAMPS, SIGNALS, TREES, BUSES, B, AVE, BRIDGE, CROSS, inCross } from './layout.js';
import { vAtWind, windAt, tOf, Wms } from './timeline.js';
import { flight } from './fly.js';
import { rng, smooth, clamp, lerp } from './util.js';

const dummy = new THREE.Object3D();
const e3 = new THREE.Euler();
const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
const AX = new THREE.Vector3();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
const fl = {};

// a matrix for something at (x, y, z) with base yaw, tumbling by ang about an axis picked by seed
function tumbleMatrix(x, y, z, yaw, ang, seed, scale = 1, sx = 1, sy = 1, sz = 1) {
  q1.setFromEuler(e3.set(0, yaw, 0));
  AX.set(Math.sin(seed * 12.1), 0.35 * Math.cos(seed * 7.3), Math.cos(seed * 12.1)).normalize();
  // tumbles mostly end over end in the wind's direction: about the x axis, plus a wobble
  AX.set(1, AX.y, AX.z * 0.6).normalize();
  q2.setFromAxisAngle(AX, ang);
  dummy.quaternion.copy(q2).multiply(q1);
  dummy.position.set(x, y, z);
  dummy.scale.set(sx * scale, sy * scale, sz * scale);
  dummy.updateMatrix();
  return dummy.matrix;
}
export { tumbleMatrix };

function signAtlas() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 1024, 1024);
  const FASCIA = ['PHARMACY', 'CAFÉ LUNA', 'HOTEL ROYAL', 'SUSHI', 'BANK', 'PIZZA', '24H MARKET', 'BAR', 'CINEMA', 'BAKERY', 'OPTICS', 'SHOES',
    'BOOKS', 'NOODLES', 'PHONES', 'FASHION', 'TACOS', 'JUICE BAR', 'GYM', 'DENTAL', 'TAILOR', 'FLOWERS', 'GRILL', 'KARAOKE', 'HOSTEL', 'ICE CREAM',
    'CHICKEN', 'ELECTRONICS', 'SALON', 'COFFEE', 'TOYS', 'BURGERS', 'LAUNDRY', 'MOVIES', 'SPORTS', 'RAMEN', 'BOUTIQUE', 'MUSIC', 'JEWELRY', 'BARBER',
    'TATTOO', 'LOUNGE', 'DINER', 'DONUTS', 'MINI MART', 'EXCHANGE', 'TRAVEL', 'CLINIC'];
  const BLADE = ['HOTEL', 'BAR', 'CAFE', 'SUSHI', 'CINE', 'GYM', 'OPEN', '24H', 'PIZZA', 'BANK', 'BOOKS', 'TACOS', 'JUICE', 'SHOP', 'LIVE', 'CLUB'];
  const PAL = [['#ff3b5c', '#1a0408'], ['#3ef0ff', '#03141a'], ['#ffd23e', '#1a1203'], ['#ffffff', '#b3001b'], ['#ffffff', '#0b3d91'], ['#7dff6a', '#061a04'],
    ['#ff7a1a', '#180a02'], ['#ffffff', '#111111'], ['#ff5ad8', '#16031a'], ['#1a1a1a', '#ffd23e'], ['#ffffff', '#0a7a3a'], ['#ffffff', '#e0601a']];
  const R = rng(99);
  FASCIA.forEach((t, i) => {
    const x = (i % 4) * 256, y = Math.floor(i / 4) * 64;
    const [fg, bg] = PAL[Math.floor(R() * PAL.length)];
    g.fillStyle = bg; g.fillRect(x + 2, y + 2, 252, 60);
    g.strokeStyle = fg; g.globalAlpha = 0.5; g.lineWidth = 2; g.strokeRect(x + 6, y + 6, 244, 52); g.globalAlpha = 1;
    g.fillStyle = fg; g.font = `bold ${t.length > 9 ? 30 : 38}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = fg; g.shadowBlur = 10; g.fillText(t, x + 128, y + 34); g.shadowBlur = 0;
  });
  BLADE.forEach((t, i) => {
    const x = i * 64, y = 768;
    const [fg, bg] = PAL[Math.floor(R() * PAL.length)];
    g.fillStyle = bg; g.fillRect(x + 2, y + 2, 60, 252);
    g.fillStyle = fg; g.font = 'bold 40px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = fg; g.shadowBlur = 8;
    [...t].forEach((ch, k) => g.fillText(ch, x + 32, y + 128 + (k - (t.length - 1) / 2) * 44));
    g.shadowBlur = 0;
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true;
  return { tex, nF: FASCIA.length, nB: BLADE.length };
}

export function makeProps(scene, { plainMat, glowMat, shadowy }) {
  const R = rng(321);
  // ---------- lamp posts ----------
  const lampGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.07, 0.11, 8.6, 8).translate(0, 4.3, 0),
    new THREE.BoxGeometry(2.6, 0.1, 0.12).translate(1.2, 8.4, 0),
    new THREE.BoxGeometry(0.7, 0.16, 0.32).translate(2.45, 8.3, 0),
  ].map((g) => g.toNonIndexed()));
  const lamps = shadowy(new THREE.InstancedMesh(lampGeo, plainMat(0x3a3d40, 0.5, { metalness: 0.5 }), LAMPS.length));
  scene.add(lamps);
  LAMPS.forEach((l) => { Object.assign(l, { y: 0, tau: 2.2, r: 4, lift: 3, ground: 0.2, yaw: l.side > 0 ? Math.PI : 0 }); });
  // ---------- traffic signals ----------
  const sigGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.11, 0.14, 6.6, 8).translate(0, 3.3, 0),
    new THREE.BoxGeometry(8.5, 0.18, 0.18).translate(4.2, 6.3, 0),
    ...[3.2, 6.2, 8.2].map((o) => new THREE.BoxGeometry(0.36, 1.05, 0.3).translate(o, 5.7, 0)),
    new THREE.BoxGeometry(0.3, 0.7, 0.3).translate(0, 2.8, 0.22),
  ].map((g) => g.toNonIndexed()));
  const signals = shadowy(new THREE.InstancedMesh(sigGeo, plainMat(0x1d2124, 0.6, { metalness: 0.3 }), SIGNALS.length));
  scene.add(signals);
  SIGNALS.forEach((s) => { Object.assign(s, { y: 0, tau: 2.6, r: 4, lift: 3, ground: 0.2, yaw: s.side > 0 ? Math.PI : 0 }); });
  // ---------- trees: a trunk and an umbrella crown (rain trees on the median, smaller ones on the sidewalks) ----------
  const trunkGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.16, 0.28, 4.4, 7).translate(0, 2.2, 0),
    new THREE.CylinderGeometry(0.08, 0.14, 2.4, 5).rotateZ(0.7).translate(0.8, 4.6, 0),
    new THREE.CylinderGeometry(0.08, 0.14, 2.4, 5).rotateZ(-0.7).translate(-0.8, 4.6, 0.2),
  ].map((g) => g.toNonIndexed()));
  const crownParts = [];
  const RC = rng(8);
  for (let k = 0; k < 7; k++) {
    const a = k / 7 * Math.PI * 2, r = k === 0 ? 0 : 2.0 + RC() * 0.8;
    crownParts.push(new THREE.IcosahedronGeometry(1.9 + RC() * 0.7, 1).scale(1, 0.55, 1).translate(Math.cos(a) * r, 5.9 + RC() * 0.8, Math.sin(a) * r).toNonIndexed());
  }
  const crownGeo = mergeGeometries(crownParts);
  const trunks = shadowy(new THREE.InstancedMesh(trunkGeo, plainMat(0x4a3a2c, 0.95), TREES.length));
  const crowns = shadowy(new THREE.InstancedMesh(crownGeo, plainMat(0xffffff, 0.9, { flatShading: true }), TREES.length));
  scene.add(trunks, crowns);
  const leafC = new THREE.Color();
  TREES.forEach((t, i) => {
    crowns.setColorAt(i, leafC.setHSL(0.24 + R() * 0.06, 0.45 + R() * 0.2, 0.2 + R() * 0.1));
    Object.assign(t, { y: 0, tau: 3.2, r: 3.5, lift: 6, ground: 0.3, yaw: R() * 6.28 });
  });
  // ---------- shop signs ----------
  const atlas = signAtlas();
  const SIGNS = [];
  for (const b of B) {
    if (!b.front || !b.sign || b.z < -1500) continue;
    const xf = b.x - b.side * b.w / 2;
    if (Math.abs(xf) > AVE.walk + 0.5) continue;
    const slot = Math.floor(R() * atlas.nF);
    SIGNS.push({ b, kind: 0, slot, x: xf - b.side * 0.1, y: b.kind === 0 ? 3.75 : 4.4, z: b.z, w: Math.min(b.d * 0.72, 8 + R() * 3), h: Math.min(b.d * 0.72, 8) / 4, yaw: -b.side * Math.PI / 2 });
    if (b.kind === 0 && R() < 0.6) SIGNS.push({ b, kind: 1, slot: Math.floor(R() * atlas.nB), x: xf - b.side * 0.75, y: 6.2 + R() * 1.5, z: b.z + (R() - 0.5) * b.d * 0.5, w: 0.62, h: 2.45, yaw: 0 });
  }
  SIGNS.forEach((s) => Object.assign(s, { v: vAtWind(150 + R() * 120), tau: 0.9, r: 1.2, lift: 14, ground: 0.05, seed: R() }));
  const signGeo = new THREE.PlaneGeometry(1, 1);
  const aUV = new THREE.InstancedBufferAttribute(new Float32Array(SIGNS.length * 4), 4);
  SIGNS.forEach((s, i) => {
    if (s.kind === 0) aUV.setXYZW(i, (s.slot % 4) * 0.25, 1 - (Math.floor(s.slot / 4) + 1) / 16, 0.25, 1 / 16);
    else aUV.setXYZW(i, s.slot / 16, 0, 1 / 16, 0.25);
  });
  signGeo.setAttribute('aUV', aUV);
  const signMat = new THREE.MeshBasicMaterial({ map: atlas.tex, side: THREE.DoubleSide, toneMapped: true });
  signMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aUV;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n vMapUv = uv * aUV.zw + aUV.xy;');
  };
  const signs = new THREE.InstancedMesh(signGeo, signMat, SIGNS.length);
  signs.frustumCulled = false;
  scene.add(signs);
  // ---------- the LED screen on the corner building (faces the crossing and you) ----------
  const corner = B.filter((b) => b.front && b.side < 0 && b.z < 0 && b.z > -60).sort((a, b) => b.z - a.z)[0];
  const SCREEN = corner ? { x: corner.x + 1.0, y: Math.min(corner.h - 6, 16), z: corner.z + corner.d / 2 + 0.15, w: Math.min(corner.w - 2, 13), h: 7.5 } : null;
  if (SCREEN) { SCREEN.y = Math.max(SCREEN.y, 9); Object.assign(SCREEN, { v: vAtWind(250), tau: 1.6, r: 6, lift: 12, ground: 0.1, seed: 0.42, b: corner, off: corner.vOff }); }
  const screenU = { uTime: { value: 0 }, uOn: { value: 1 } };
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: screenU, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `uniform float uTime; uniform float uOn; varying vec2 vUv;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        // an ad: a slow colour wash, a bright product disc, a band of moving text blocks, LED pixel grid
        vec2 p = vUv;
        float t = uTime;
        vec3 a = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + p.x * 0.4 + t * 0.12));
        vec3 c = mix(vec3(0.05, 0.02, 0.12), a, 0.7);
        float disc = smoothstep(0.24, 0.22, length((p - vec2(0.3 + 0.05 * sin(t * 1.3), 0.55)) * vec2(1.6, 1.0)));
        c = mix(c, vec3(1.0, 0.95, 0.85), disc);
        float band = step(0.12, p.y) * step(p.y, 0.26) * step(0.5, fract((p.x + t * 0.25) * 6.0));
        c = mix(c, vec3(1.0), band * 0.9);
        vec2 px = fract(p * vec2(240.0, 140.0));
        c *= 0.75 + 0.25 * step(0.2, px.x) * step(0.2, px.y);
        gl_FragColor = vec4(c * 2.2 * uOn + vec3(0.02) * (1.0 - uOn), 1.0);
      }`,
  }));
  screen.frustumCulled = false;
  if (SCREEN) scene.add(screen);
  // ---------- the footbridge (deck, glass-panel railings, piers, stairs down to both sidewalks) ----------
  {
    const parts = [];
    const L = 2 * AVE.walk + 2, z = BRIDGE.z, y = BRIDGE.y, w = BRIDGE.w;
    parts.push(new THREE.BoxGeometry(L, 0.5, w).translate(0, y - 0.25, z));
    for (const s of [-1, 1]) {
      parts.push(new THREE.BoxGeometry(L, 0.05, 0.05).translate(0, y + 1.1, z + s * (w / 2 - 0.05)));
      for (let x = -L / 2; x <= L / 2; x += 2.0) parts.push(new THREE.BoxGeometry(0.06, 1.1, 0.06).translate(x, y + 0.55, z + s * (w / 2 - 0.05)));
      parts.push(new THREE.BoxGeometry(0.8, y - 0.5, 0.8).translate(s * (AVE.road + 2.2), (y - 0.5) / 2, z));
      // stairs down along the sidewalk (eastward)
      for (let k = 0; k < 18; k++) parts.push(new THREE.BoxGeometry(2.2, 0.17, 0.62).translate(s * (AVE.road + 3.6), y - 0.34 - k * 0.32, z + w / 2 + 0.3 + k * 0.3));
    }
    const bridge = new THREE.Mesh(mergeGeometries(parts.map((g) => g.toNonIndexed())), plainMat(0x8d9196, 0.55, { metalness: 0.3 }));
    bridge.castShadow = bridge.receiveShadow = true;
    if (location.search.includes('nobridge')) bridge.visible = false;
    scene.add(bridge);
    const glass = new THREE.Mesh(mergeGeometries([-1, 1].map((s) => new THREE.PlaneGeometry(L, 1.0).translate(0, y + 0.55, z + s * (w / 2 - 0.05)).toNonIndexed())),
      new THREE.MeshStandardMaterial({ color: 0x9fc4d0, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    scene.add(glass);
  }
  // ---------- buses ----------
  const busGeo = mergeGeometries([
    new THREE.BoxGeometry(2.55, 2.6, 12).translate(0, 1.75, 0),
    ...[-1, 1].flatMap((sx) => [-4, 3.6].map((zz) => new THREE.CylinderGeometry(0.5, 0.5, 0.3, 12).rotateZ(Math.PI / 2).translate(sx * 1.2, 0.5, zz))),
  ].map((g) => g.toNonIndexed()));
  const busWin = mergeGeometries([new THREE.BoxGeometry(2.6, 1.0, 11.2).translate(0, 2.25, 0.2).toNonIndexed()]);
  const buses = shadowy(new THREE.InstancedMesh(busGeo, plainMat(0xffffff, 0.45), BUSES.length));
  const busW = new THREE.InstancedMesh(busWin, glowMat(new THREE.Color(1.4, 1.2, 0.9)), BUSES.length);
  busW.frustumCulled = false;
  scene.add(buses, busW);
  BUSES.forEach((b, i) => { buses.setColorAt(i, new THREE.Color(i ? 0x1f8a5a : 0xd8342c)); Object.assign(b, { y: 0, v: vAtWind(205 + i * 30), tau: 5, r: 3, lift: 2.5, ground: 0, yaw: b.dir > 0 ? Math.PI : 0 }); });

  return {
    SIGNS, SCREEN,
    frame(v, s, glows, camZ) {
      const t = tOf(v);
      const W = Wms(t);
      const sway = W / 45;                       // bending in the wind (rad scale)
      // lamps
      LAMPS.forEach((l, i) => {
        const f = flight(l, v, fl);
        if (f.dt > 0 && (f.z > camZ + 60 || f.dz > 2000)) { lamps.setMatrixAt(i, HIDE); return; }
        if (f.dt <= 0) {
          const lean = Math.min(0.05, 0.0004 * W * W / 20) * (1 + 0.3 * Math.sin(v * 3 + l.seed * 9));
          dummy.position.set(l.x, 0, l.z); dummy.rotation.set(lean, l.yaw, 0, 'YXZ'); dummy.scale.setScalar(1); dummy.updateMatrix();
          lamps.setMatrixAt(i, dummy.matrix);
          const on = s.grid * (1 - smooth(l.v - 0.6, l.v, v));
          const hx = l.x + (l.side > 0 ? -2.45 : 2.45);
          if (on > 0.01) glows.add(hx, 8.1, l.z + lean * 8, 1.7, 2.0 * on, 1.35 * on, 0.65 * on);
        } else lamps.setMatrixAt(i, tumbleMatrix(f.x, f.y, f.z, l.yaw, f.ang + Math.PI / 2 * smooth(0, 0.5, f.dt), l.seed));
      });
      lamps.instanceMatrix.needsUpdate = true;
      // signals
      SIGNALS.forEach((g, i) => {
        const f = flight(g, v, fl);
        if (f.dt > 0 && (f.z > camZ + 60 || f.dz > 2000)) { signals.setMatrixAt(i, HIDE); return; }
        if (f.dt <= 0) {
          const lean = Math.min(0.06, 0.0005 * W * W / 20);
          dummy.position.set(g.x, 0, g.z); dummy.rotation.set(lean, g.yaw, 0, 'YXZ'); dummy.scale.setScalar(1); dummy.updateMatrix();
          signals.setMatrixAt(i, dummy.matrix);
          // avenue red, cross street green; pedestrian heads lit
          const on = s.grid * (1 - smooth(g.v - 0.4, g.v, v));
          if (on > 0.01) {
            const dir = g.side > 0 ? -1 : 1;
            for (const o of [3.2, 6.2, 8.2]) glows.add(g.x + dir * o, 5.95, g.z + g.face * 0.2, 0.9, 4.0 * on, 0.25 * on, 0.15 * on);
            glows.add(g.x, 2.8, g.z + 0.4, 0.6, 0.6 * on, 2.6 * on, 1.2 * on);
          }
        } else signals.setMatrixAt(i, tumbleMatrix(f.x, f.y, f.z, g.yaw, f.ang + Math.PI / 2 * smooth(0, 0.5, f.dt), g.seed));
      });
      signals.instanceMatrix.needsUpdate = true;
      // trees: crowns thrash, leaves strip (the crown thins), then the tree is torn out and tumbles away
      TREES.forEach((tr, i) => {
        const f = flight(tr, v, fl);
        const bare = smooth(tr.vStrip, tr.vStrip + 3, v);
        const cs = tr.s * (1 - 0.55 * bare);
        if (f.dt > 0 && (f.z > camZ + 60 || f.dz > 2000)) { trunks.setMatrixAt(i, HIDE); crowns.setMatrixAt(i, HIDE); return; }
        if (f.dt <= 0) {
          const bend = Math.min(0.5, sway * sway * 0.04) * (1 + 0.25 * Math.sin(v * (2 + tr.seed) + tr.seed * 20)) + 0.02 * Math.sin(v * 1.7 + tr.seed * 9);
          // a bend is a tilt toward +z (east, downwind): rotate about x
          dummy.position.set(tr.x, 0, tr.z); dummy.rotation.set(bend * (1 - 0.4 * bare), tr.yaw, 0, 'XYZ'); dummy.scale.setScalar(tr.s); dummy.updateMatrix();
          trunks.setMatrixAt(i, dummy.matrix);
          dummy.rotation.set(bend, tr.yaw, 0, 'XYZ'); dummy.scale.set(cs, tr.s * (1 - 0.35 * bare), cs); dummy.updateMatrix();
          crowns.setMatrixAt(i, dummy.matrix);
        } else {
          trunks.setMatrixAt(i, tumbleMatrix(f.x, f.y, f.z, tr.yaw, f.ang + 1.2 * smooth(0, 0.6, f.dt), tr.seed, tr.s));
          crowns.setMatrixAt(i, tumbleMatrix(f.x, f.y, f.z, tr.yaw, f.ang + 1.2 * smooth(0, 0.6, f.dt), tr.seed, 1, cs, tr.s * 0.65, cs));
        }
      });
      trunks.instanceMatrix.needsUpdate = true; crowns.instanceMatrix.needsUpdate = true;
      // signs: lit until their building's power goes, flutter, then rip off and sail away
      const col = new THREE.Color();
      SIGNS.forEach((g, i) => {
        const f = flight(g, v, fl);
        if (f.dt > 0 && (f.z > camZ + 60 || f.dz > 2500)) { signs.setMatrixAt(i, HIDE); return; }
        const lit = s.grid * (1 - smooth(g.b.vOff, g.b.vOff + 0.3, v)) * (1 - smooth(g.v - 0.2, g.v + 0.3, v));
        signs.setColorAt(i, col.setScalar(0.25 + 2.2 * lit));
        if (f.dt <= 0) {
          const flap = g.kind === 1 ? Math.min(0.5, 0.0009 * W * W / 10) * (0.7 + 0.3 * Math.sin(v * 9 + g.seed * 30)) : 0;
          dummy.position.set(g.x, g.y, g.z); dummy.rotation.set(0, g.yaw + flap, 0); dummy.scale.set(g.w, g.h, 1); dummy.updateMatrix();
          signs.setMatrixAt(i, dummy.matrix);
        } else signs.setMatrixAt(i, tumbleMatrix(f.x, f.y, f.z, g.yaw, f.ang, g.seed, 1, g.w, g.h, 1));
      });
      signs.instanceMatrix.needsUpdate = true; if (signs.instanceColor) signs.instanceColor.needsUpdate = true;
      // the screen
      if (SCREEN) {
        const f = flight(SCREEN, v, fl);
        screenU.uTime.value = v;
        screenU.uOn.value = s.grid * (1 - smooth(SCREEN.off, SCREEN.off + 0.3, v)) * (1 - smooth(SCREEN.v - 0.3, SCREEN.v, v));
        screen.visible = !(f.dt > 0 && (f.z > camZ + 60 || f.dz > 2500));
        if (f.dt <= 0) { screen.position.set(SCREEN.x, SCREEN.y, SCREEN.z); screen.rotation.set(0, 0, 0); screen.scale.set(SCREEN.w, SCREEN.h, 1); }
        else { screen.matrixAutoUpdate = false; screen.matrix.copy(tumbleMatrix(f.x, f.y, f.z, 0, f.ang, SCREEN.seed, 1, SCREEN.w, SCREEN.h, 1)); }
        if (f.dt <= 0) screen.matrixAutoUpdate = true;
      }
      // buses: rock, slide, then roll over and tumble
      BUSES.forEach((b, i) => {
        const f = flight(b, v, fl);
        if (f.dt > 0 && (f.z > camZ + 80 || f.dz > 2000)) { buses.setMatrixAt(i, HIDE); busW.setMatrixAt(i, HIDE); return; }
        let m;
        if (f.dt <= 0) {
          const rock = Math.min(0.06, W * W * 0.00001) * Math.sin(v * 2.3 + b.seed * 5);
          const slide = 0.35 * (v + 2) * (v + 2) * 0.05;
          dummy.position.set(b.x, 0, b.z + slide); dummy.rotation.set(rock, b.yaw, 0, 'XYZ'); dummy.scale.setScalar(1); dummy.updateMatrix();
          m = dummy.matrix;
        } else m = tumbleMatrix(f.x, f.y, f.z + 0.35 * (b.v + 2) * (b.v + 2) * 0.05, b.yaw, f.ang * 0.8, b.seed);
        buses.setMatrixAt(i, m); busW.setMatrixAt(i, m);
      });
      buses.instanceMatrix.needsUpdate = true; busW.instanceMatrix.needsUpdate = true;
      busW.material.color.setRGB(1.4, 1.2, 0.9).multiplyScalar(s.grid);
    },
  };
}

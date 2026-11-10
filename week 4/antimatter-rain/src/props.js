// The street furniture (lamp posts, traffic signals, trees), the Pike Place Market arcade with its neon sign and
// clock, the Space Needle, and the boats that come out once the street is a canal.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAMPS, SIGNALS, TREES, MARKET, NEEDLE, PIKE } from './layout.js';
import { V_SIGN, SIGN_TOP } from './timeline.js';
import { drownMat, underK } from './drown.js';
import { rng, smooth, clamp, lerp, wobble } from './util.js';

const m4 = new THREE.Matrix4(), mS = new THREE.Matrix4();
const dummy = new THREE.Object3D();

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function makeProps(scene, { plainMat }) {
  const P = (m) => drownMat(m);
  // ---------- lamp posts (Seattle's dark green posts with a pendant head) ----------
  const lampGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.08, 0.13, 8.4, 8).translate(0, 4.2, 0),
    new THREE.CylinderGeometry(0.04, 0.04, 1.8, 5).rotateZ(Math.PI / 2).translate(0.85, 8.2, 0),
    new THREE.CylinderGeometry(0.12, 0.3, 0.42, 10).translate(1.7, 7.95, 0),
  ].map((g) => g.toNonIndexed()));
  const lamps = new THREE.InstancedMesh(lampGeo, P(plainMat(0x1f2e26, 0.45, { metalness: 0.4 })), LAMPS.length);
  LAMPS.forEach((l, i) => { dummy.position.set(l.x, 0, l.z); dummy.rotation.set(0, l.side > 0 ? Math.PI : 0, 0); dummy.updateMatrix(); lamps.setMatrixAt(i, dummy.matrix); l.hx = l.x - l.side * 1.7; l.hy = 7.75; });
  // ---------- traffic signals ----------
  const sigGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.11, 0.14, 6.4, 8).translate(0, 3.2, 0),
    new THREE.BoxGeometry(5.2, 0.16, 0.16).translate(2.6, 6.1, 0),
    new THREE.BoxGeometry(0.36, 1.05, 0.3).translate(4.6, 5.5, 0),
  ].map((g) => g.toNonIndexed()));
  const signals = new THREE.InstancedMesh(sigGeo, P(plainMat(0x22272a, 0.6, { metalness: 0.3 })), SIGNALS.length);
  SIGNALS.forEach((s, i) => { dummy.position.set(s.x, 0, s.z); dummy.rotation.set(0, s.side > 0 ? -Math.PI / 2 : Math.PI / 2, 0); dummy.updateMatrix(); signals.setMatrixAt(i, dummy.matrix); s.hx = s.x - s.side * 4.6; s.hy = 5.5; });
  // ---------- trees ----------
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 4.2, 6).translate(0, 2.1, 0);
  const crownGeo = mergeGeometries([0, 1, 2, 3].map((k) => new THREE.IcosahedronGeometry(1.5 + 0.3 * (k % 2), 1).translate(Math.cos(k * 1.7) * 0.9, 4.6 + k * 0.45, Math.sin(k * 1.7) * 0.9).toNonIndexed()));
  const trunks = new THREE.InstancedMesh(trunkGeo, P(plainMat(0x2e241c, 0.95)), TREES.length);
  const crowns = new THREE.InstancedMesh(crownGeo, P(plainMat(0xffffff, 0.8, { flatShading: true })), TREES.length);
  const R = rng(321), lc = new THREE.Color();
  TREES.forEach((t, i) => {
    dummy.position.set(t.x, 0, t.z); dummy.rotation.set(0, R() * 6.28, 0); dummy.scale.setScalar(t.s * 1.6); dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix); crowns.setMatrixAt(i, dummy.matrix);
    crowns.setColorAt(i, lc.setHSL(0.27 + R() * 0.05, 0.4, 0.13 + R() * 0.06));
  });
  scene.add(lamps, signals, trunks, crowns);

  // ---------- Pike Place Market: the arcade's front, the neon sign and the clock on its roof ----------
  const W = MARKET.x1 - MARKET.x0, Hm = MARKET.h;
  const frontTex = canvasTex(2048, 256, (g, w, h) => {
    g.fillStyle = '#c9bfa8'; g.fillRect(0, 0, w, h);
    const bays = 22;
    for (let k = 0; k < bays; k++) {
      const x = k * w / bays;
      // ground-floor arcade openings, lit stalls inside
      const grd = g.createLinearGradient(0, h * 0.55, 0, h);
      grd.addColorStop(0, '#ffcf86'); grd.addColorStop(1, '#ff9a4a');
      g.fillStyle = grd; g.fillRect(x + 8, h * 0.56, w / bays - 16, h * 0.44);
      g.fillStyle = 'rgba(80,30,10,0.55)'; for (let s = 0; s < 5; s++) g.fillRect(x + 12 + s * 17, h * 0.8, 10, h * 0.2);
      // upper windows
      g.fillStyle = k % 3 === 1 ? '#f2d6a0' : '#2a2a30'; g.fillRect(x + 22, h * 0.12, w / bays - 44, h * 0.28);
    }
    g.fillStyle = '#3b2c22'; g.fillRect(0, h * 0.48, w, h * 0.06);
    g.fillStyle = '#7a1a14'; g.fillRect(w * 0.37, h * 0.47, w * 0.26, h * 0.09);
    g.fillStyle = '#ffe9c8'; g.font = 'bold 22px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('PUBLIC MARKET', w * 0.5, h * 0.515);
  });
  const emissiveFront = frontTex.clone(); emissiveFront.needsUpdate = true;
  const arcadeMat = P(new THREE.MeshStandardMaterial({ map: frontTex, emissiveMap: frontTex, emissive: 0xffffff, emissiveIntensity: 0.0, roughness: 0.8 }));
  const arcade = new THREE.Mesh(new THREE.BoxGeometry(W, Hm, MARKET.z1 - MARKET.z0), [P(plainMat(0xb8ae98)), P(plainMat(0xb8ae98)), P(plainMat(0x3a3430)), P(plainMat(0x3a3430)), arcadeMat, P(plainMat(0xb8ae98))]);
  arcade.position.set((MARKET.x0 + MARKET.x1) / 2, Hm / 2, (MARKET.z0 + MARKET.z1) / 2);
  // (box face order +x -x +y -y +z -z: +z (east) is the front; its texture runs along x)
  arcade.rotation.y = 0;
  scene.add(arcade);
  // the sign: red neon capitals on a dark frame, set back on the roof edge
  const signTex = canvasTex(2048, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.font = 'bold 190px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.strokeStyle = '#ffffff'; g.lineWidth = 18; g.strokeText('PUBLIC MARKET', w * 0.5, h * 0.54);
    g.fillStyle = '#ff2216'; g.shadowColor = '#ff2a10'; g.shadowBlur = 24; g.fillText('PUBLIC MARKET', w * 0.5, h * 0.54);
  });
  const sign2Tex = canvasTex(1024, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.font = 'bold 180px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.strokeStyle = '#ffffff'; g.lineWidth = 16; g.strokeText('CENTER', w * 0.5, h * 0.54);
    g.fillStyle = '#ff2216'; g.shadowColor = '#ff2a10'; g.shadowBlur = 22; g.fillText('CENTER', w * 0.5, h * 0.54);
  });
  const farmTex = canvasTex(1024, 128, (g, w, h) => {
    g.fillStyle = '#16100c'; g.fillRect(0, 0, w, h);
    g.font = 'bold 84px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ff3a26'; g.shadowColor = '#ff3a26'; g.shadowBlur = 16; g.fillText('FARMERS MARKET', w * 0.5, h * 0.54);
  });
  const clockTex = canvasTex(512, 512, (g, w) => {
    g.clearRect(0, 0, w, w);
    const c = w / 2;
    g.fillStyle = '#f6efe0'; g.beginPath(); g.arc(c, c, 236, 0, 7); g.fill();
    g.strokeStyle = '#ff2216'; g.lineWidth = 22; g.shadowColor = '#ff2216'; g.shadowBlur = 18; g.beginPath(); g.arc(c, c, 226, 0, 7); g.stroke();
    g.shadowBlur = 0; g.fillStyle = '#ff2216'; g.font = 'bold 44px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('PUBLIC', c, c - 120); g.fillText('MARKET', c, c + 120);
    g.fillStyle = '#222'; for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; g.fillRect(c + Math.sin(a) * 175 - 5, c - Math.cos(a) * 175 - 12, 10, 24); }
    g.lineCap = 'round'; g.strokeStyle = '#111'; g.lineWidth = 14;
    g.beginPath(); g.moveTo(c, c); g.lineTo(c + 80, c - 70); g.stroke();
    g.lineWidth = 9; g.beginPath(); g.moveTo(c, c); g.lineTo(c - 30, c - 160); g.stroke();
  });
  const neon = (tex) => P(new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.04, color: new THREE.Color(2.4, 2.4, 2.4), depthWrite: true }));
  const signMat = neon(signTex), sign2Mat = neon(sign2Tex), clockMat = neon(clockTex);
  const farmMat = P(new THREE.MeshBasicMaterial({ map: farmTex, color: new THREE.Color(1.8, 1.8, 1.8) }));
  const zF = MARKET.z1 + 0.05;
  const xc = 3;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(22, 2.75), signMat); sign.position.set(xc - 2.5, 10.75, zF - 1.5);
  const sign2 = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 2.6), sign2Mat); sign2.position.set(xc + 13.2, 10.7, zF - 1.5);
  const clock = new THREE.Mesh(new THREE.CircleGeometry(1.75, 48), clockMat); clock.position.set(xc - 16.0, SIGN_TOP - 1.85, zF - 1.0);
  const farm = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 1.2), farmMat); farm.position.set(xc - 2, 5.0, zF + 0.02);
  // the frame behind the letters and the clock's post
  const frame = new THREE.Mesh(mergeGeometries([
    new THREE.BoxGeometry(34, 0.25, 0.3).translate(xc + 2.5, 9.45, zF - 1.7),
    ...[-12, -4, 4, 12, 18].map((x) => new THREE.BoxGeometry(0.18, 2.9, 0.18).translate(xc + x, 10.8, zF - 1.75)),
    new THREE.BoxGeometry(0.3, 4.2, 0.3).translate(xc - 16.0, 10.0, zF - 1.2),
  ].map((g) => g.toNonIndexed())), P(plainMat(0x15130f, 0.6, { metalness: 0.5 })));
  scene.add(sign, sign2, clock, farm, frame);
  const marketGroup = [arcade, sign, sign2, clock, farm, frame];

  // ---------- the Space Needle (184 m): three pairs of legs pinched at the waist, the saucer, the spire ----------
  const needleParts = [];
  const legCurve = (a) => new THREE.CatmullRomCurve3([
    new THREE.Vector3(Math.cos(a) * 19, 0, Math.sin(a) * 19), new THREE.Vector3(Math.cos(a) * 10, 45, Math.sin(a) * 10),
    new THREE.Vector3(Math.cos(a) * 4.2, 112, Math.sin(a) * 4.2), new THREE.Vector3(Math.cos(a) * 7.5, 140, Math.sin(a) * 7.5),
    new THREE.Vector3(Math.cos(a) * 10.5, 152, Math.sin(a) * 10.5)]);
  for (let k = 0; k < 3; k++) for (const o of [-0.16, 0.16]) needleParts.push(new THREE.TubeGeometry(legCurve(k * 2.094 + o + 0.3), 48, 0.9, 6).toNonIndexed());
  needleParts.push(new THREE.CylinderGeometry(2.6, 3.2, 152, 12, 1, true).translate(0, 76, 0).toNonIndexed());
  for (const y of [30, 60, 100]) needleParts.push(new THREE.TorusGeometry(lerp(14, 4.8, y / 112), 0.35, 4, 24).rotateX(Math.PI / 2).translate(0, y, 0).toNonIndexed());
  const needleMat = P(plainMat(0xd8d4cc, 0.5, { metalness: 0.2 }));
  const saucer = new THREE.LatheGeometry([[0.1, 150], [10, 150.5], [21, 157], [21.5, 158.5], [19.5, 163], [14, 166], [5, 170], [1, 171]].map(([r, y]) => new THREE.Vector2(r, y)), 48).toNonIndexed();
  const spire = new THREE.CylinderGeometry(0.25, 0.9, 13.5, 8).translate(0, 177.7, 0).toNonIndexed();
  const needle = new THREE.Mesh(mergeGeometries([...needleParts, spire]), needleMat);
  const top = new THREE.Mesh(saucer, P(new THREE.MeshStandardMaterial({ color: 0xc8c0b4, roughness: 0.4, metalness: 0.3, emissive: 0x302418 })));
  // the restaurant's window band: a lit ring under the roof
  const band = new THREE.Mesh(new THREE.CylinderGeometry(21.3, 20.6, 2.4, 48, 1, true).translate(0, 159.6, 0), P(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.6, 1.0), side: THREE.DoubleSide })));
  for (const o of [needle, top, band]) { o.position.set(NEEDLE.x, 0, NEEDLE.z); scene.add(o); }
  const needleGroup = [needle, top, band];

  // ---------- boats: small launches with a searchlight, out on the flooded streets ----------
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-1.1, -2.6); hullShape.lineTo(1.1, -2.6); hullShape.lineTo(1.15, 1.2); hullShape.quadraticCurveTo(0.9, 2.5, 0, 3.1); hullShape.quadraticCurveTo(-0.9, 2.5, -1.15, 1.2); hullShape.closePath();
  const hull = new THREE.ExtrudeGeometry(hullShape, { depth: 0.9, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, 0.5, 0).toNonIndexed();
  const cabin = new THREE.BoxGeometry(1.6, 0.9, 1.4).translate(0, 0.95, -0.5).toNonIndexed();
  const BOATS = [];
  {
    const Rb = rng(808);
    // (start x, z), (end x, z), when (video time)
    const runs = [
      [[70, -42], [-90, -36], 12.6, 17.2], [[6, -30], [10, -260], 15.6, 20], [[-80, -90], [120, -130], 17.5, 23],
      [[300, -200], [80, 40], 18.5, 25], [[700, -350], [400, -100], 21, 27], [[-200, 300], [120, 180], 19.5, 26],
      [[950, -300], [1150, -650], 23, 28.5], [[600, -600], [1000, -300], 24, 29],
    ];
    for (const [[x0, z0], [x1, z1], a, b] of runs) BOATS.push({ x0, z0, x1, z1, a, b, seed: Rb(), col: [0xd84a2a, 0xe8e2d6, 0xf0b020, 0x2a5a8a][Math.floor(Rb() * 4)] });
  }
  const boatHull = new THREE.InstancedMesh(hull, P(plainMat(0xffffff, 0.5)), BOATS.length);
  const boatCab = new THREE.InstancedMesh(cabin, P(plainMat(0xe6e6e0, 0.5)), BOATS.length);
  const bc = new THREE.Color();
  BOATS.forEach((b, i) => boatHull.setColorAt(i, bc.set(b.col)));
  boatHull.frustumCulled = boatCab.frustumCulled = false;
  scene.add(boatHull, boatCab);
  // the searchlight beams: soft additive cones
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uK: { value: 1 } },
    vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
      vN = normalize(mat3(modelMatrix * instanceMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uK; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float e = pow(abs(dot(normalize(vN), vV)), 1.5);
      gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * 0.09 * uK * e * pow(vY, 1.5), 1.0); }`,
  });
  const beamGeo = new THREE.ConeGeometry(4.5, 40, 16, 1, true).translate(0, -20, 0).rotateX(-Math.PI / 2);   // apex at the origin, pointing +z
  const beams = new THREE.InstancedMesh(beamGeo, beamMat, BOATS.length);
  beams.frustumCulled = false; beams.renderOrder = 8;
  scene.add(beams);
  const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

  return {
    street: [lamps, signals, trunks, crowns],
    marketGroup, needleGroup, boats: [boatHull, boatCab, beams],
    frame(v, s, glows, level, cam) {
      // street lights and signals (glows), under the water they fade into the murk; all go out with the grid
      if (cam.position.y < 400) {
        for (const l of LAMPS) {
          const k = underK(l.hy, level) * s.grid;
          if (k > 0.01) { glows.add(l.hx, l.hy, l.z, 1.4, 2.6 * k, 2.2 * k, 1.6 * k); glows.reflect(l.hx, l.hy, l.z, 2.0, 1.1 * k, 0.9 * k, 0.6 * k, level); }
        }
        for (const sg of SIGNALS) {
          const k = underK(sg.hy, level) * s.grid;
          const red = Math.sin(sg.seed * 9) > 0;
          if (k > 0.01) { glows.add(sg.hx, sg.hy + (red ? 0.33 : -0.33), sg.z, 0.9, (red ? 3.2 : 0.3) * k, (red ? 0.25 : 2.4) * k, (red ? 0.1 : 1.2) * k); glows.reflect(sg.hx, sg.hy, sg.z, 0.8, (red ? 1.4 : 0.1) * k, (red ? 0.1 : 1.0) * k, (red ? 0.05 : 0.5) * k, level); }
        }
      }
      // the market sign: full on, then it flickers and dies as the water closes over it (sparks)
      {
        const k = clamp(1 - smooth(V_SIGN - 0.7, V_SIGN, v));
        const flick = v > V_SIGN - 0.9 ? (Math.sin(v * 53) > -0.2 ? 1 : 0.15) * (Math.sin(v * 17.3) > -0.6 ? 1 : 0.3) : 1;
        const on = k * flick;
        signMat.color.setScalar(0.25 + 3.6 * on); sign2Mat.color.setScalar(0.25 + 3.6 * on); clockMat.color.setScalar(0.35 + 2.4 * on);
        farmMat.color.setScalar(0.12 + 1.7 * clamp(1 - smooth(4.6, 5.3, level)) * s.grid);
        arcadeMat.emissiveIntensity = 1.1 * s.grid * clamp(1 - smooth(1.2, 2.2, level));
        // red glow off the letters onto the rain and the water
        if (on > 0.05 && cam.position.y < 200) {
          for (let x = -10; x <= 18; x += 4) { glows.add(x, 10.8, MARKET.z1 - 0.6, 6, 1.0 * on, 0.08 * on, 0.04 * on); glows.reflect(x, 10.8, MARKET.z1 - 0.6, 4, 0.9 * on, 0.06 * on, 0.03 * on, level); }
        }
        if (v > V_SIGN - 0.9 && v < V_SIGN + 0.4) {
          const Rs = rng(Math.floor(v * 30));
          for (let n = 0; n < 6; n++) if (Rs() < 0.5) glows.add(-12 + Rs() * 30, level + 0.2 + Rs() * 1.2, MARKET.z1 - 1.5, 0.5 + Rs(), 6, 5, 3.5);
        }
      }
      // the Needle's lights: the band, the floodlights under the saucer, the red beacon on the spire
      {
        const nb = underK(159.6, level), nt = underK(184, level);
        if (nb > 0.01) for (let k = 0; k < 16; k++) { const a = k / 16 * 6.283; glows.add(NEEDLE.x + Math.cos(a) * 21.5, 160, NEEDLE.z + Math.sin(a) * 21.5, 2.5, 0.9 * nb, 0.7 * nb, 0.45 * nb); }
        const blink = Math.sin(v * 4) > 0 ? 1 : 0.15;
        if (nt > 0.01) glows.add(NEEDLE.x, 184.6, NEEDLE.z, 5, 6 * nt * blink, 0.3 * nt * blink, 0.15 * nt * blink);
      }
      // boats
      const up = new THREE.Vector3();
      BOATS.forEach((b, i) => {
        const k = (v - b.a) / (b.b - b.a);
        if (k < 0 || k > 1 || level < 3) { boatHull.setMatrixAt(i, HIDE); boatCab.setMatrixAt(i, HIDE); beams.setMatrixAt(i, HIDE); return; }
        const x = lerp(b.x0, b.x1, k), z = lerp(b.z0, b.z1, k);
        const yaw = Math.atan2(b.x1 - b.x0, b.z1 - b.z0);
        const y = level - 0.25 + 0.12 * Math.sin(v * 2.3 + b.seed * 9);
        dummy.position.set(x, y, z); dummy.rotation.set(0.04 * Math.sin(v * 1.9 + b.seed * 5), yaw, 0.05 * Math.sin(v * 2.7 + b.seed * 3), 'YXZ'); dummy.scale.setScalar(1.4); dummy.updateMatrix();
        boatHull.setMatrixAt(i, dummy.matrix); boatCab.setMatrixAt(i, dummy.matrix);
        // the searchlight sweeps over the buildings
        const sw = Math.sin(v * 0.9 + b.seed * 7) * 0.9;
        const by = yaw + sw;
        dummy.position.set(x + Math.sin(yaw) * 1.5, y + 1.9, z + Math.cos(yaw) * 1.5); dummy.rotation.set(-0.12, by, 0, 'YXZ'); dummy.scale.setScalar(1); dummy.updateMatrix();
        beams.setMatrixAt(i, dummy.matrix);
        glows.add(dummy.position.x, dummy.position.y, dummy.position.z, 1.6, 7, 6.5, 5.5);
        glows.reflect(dummy.position.x, dummy.position.y, dummy.position.z, 1.5, 2.5, 2.3, 2.0, level);
        glows.add(x - Math.sin(yaw) * 3.4, y + 1.2, z - Math.cos(yaw) * 3.4, 0.6, 3, 0.2, 0.1);
      });
      boatHull.instanceMatrix.needsUpdate = true; boatCab.instanceMatrix.needsUpdate = true; beams.instanceMatrix.needsUpdate = true;
    },
  };
}

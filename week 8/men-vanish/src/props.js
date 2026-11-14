// Street detail: newspaper boxes, a mailbox, a hot-dog cart under a striped umbrella, parking meters along the curbs,
// bollards at the corners, planters with shrubs, striped awnings over the shop fronts, water towers and air-conditioning
// units on the roofs, street-name signs and walk signals on the signal poles. (Positions: PROPS in layout.js, which the
// crowd planner keeps people clear of.)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PROPS, AWNINGS, ROOFTOP, SIGNALS, CZ } from './layout.js';

export function makeProps(scene, ctx) {
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
  const G = (geos) => mergeGeometries(geos.map((g) => g.toNonIndexed()));
  const inst = (geo, mat, list, place, color) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    list.forEach((o, i) => { m.setMatrixAt(i, place(o)); if (color) m.setColorAt(i, col.set(color(o, i))); });
    if (!list.length) m.setMatrixAt(0, new THREE.Matrix4().makeScale(0, 0, 0));
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m);
    return m;
  };
  const at = (o, sc = 1) => { e.set(0, o.yaw || 0, 0); q.setFromEuler(e); return m4.compose(p.set(o.x, o.y || 0, o.z), q, s.setScalar(sc)); };
  const of = (k) => PROPS.filter((o) => o.kind === k);
  // newspaper boxes: a box on legs with a window and a coin slot plate
  inst(G([new THREE.BoxGeometry(0.48, 0.75, 0.42).translate(0, 0.62, 0), new THREE.BoxGeometry(0.5, 0.06, 0.44).translate(0, 1.02, 0), ...[-1, 1].map((sx) => new THREE.BoxGeometry(0.04, 0.25, 0.04).translate(sx * 0.2, 0.12, 0))]),
    ctx.plainMat(0xffffff, 0.5), of('news'), (o) => at(o), (o, i) => [0xc8201a, 0x2a5ab0, 0xe8c020, 0x2a8a4a, 0xf0f0f0][i % 5]);
  inst(new THREE.BoxGeometry(0.36, 0.28, 0.02).translate(0, 0.75, 0.22), ctx.plainMat(0x1a2028, 0.15), of('news'), (o) => at(o));
  // the mailbox
  inst(G([new THREE.BoxGeometry(0.5, 0.95, 0.5).translate(0, 0.62, 0), new THREE.CylinderGeometry(0.25, 0.25, 0.5, 14, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, 1.1, 0), ...[-1, 1].map((sx) => new THREE.BoxGeometry(0.05, 0.16, 0.45).translate(sx * 0.22, 0.08, 0))]),
    ctx.plainMat(0x1d3a8a, 0.45), of('mailbox'), (o) => at(o));
  // the hot-dog cart: a steel body on wheels, a striped umbrella on a pole
  const carts = of('cart');
  inst(G([new THREE.BoxGeometry(1.9, 0.85, 0.85).translate(0, 0.75, 0), new THREE.BoxGeometry(2.0, 0.06, 0.95).translate(0, 1.2, 0), new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6).translate(0, 2.0, 0)]),
    ctx.plainMat(0xc8ccd0, 0.3, { metalness: 0.6 }), carts, (o) => at(o));
  inst(G([...[-1, 1].map((sx) => new THREE.CylinderGeometry(0.3, 0.3, 0.06, 14).rotateX(Math.PI / 2).translate(sx * 0.6, 0.3, 0.45))]), ctx.plainMat(0x1a1a1a, 0.8), carts, (o) => at(o));
  {
    const umb = new THREE.ConeGeometry(1.25, 0.45, 12, 1, true).translate(0, 2.9, 0);
    const c = []; const pos = umb.attributes.position;
    for (let i = 0; i < pos.count; i++) { const a = Math.atan2(pos.getZ(i), pos.getX(i)); const k = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 12) % 2; c.push(...(k ? [0.85, 0.12, 0.08] : [0.95, 0.8, 0.2])); }
    umb.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    inst(umb, ctx.plainMat(0xffffff, 0.7, { vertexColors: true, side: THREE.DoubleSide, flatShading: true }), carts, (o) => at(o));
  }
  // parking meters, bollards
  inst(G([new THREE.CylinderGeometry(0.035, 0.04, 1.1, 8).translate(0, 0.55, 0), new THREE.BoxGeometry(0.18, 0.3, 0.14).translate(0, 1.25, 0)]), ctx.plainMat(0x3a3e44, 0.5, { metalness: 0.4 }), of('meter'), (o) => at(o));
  inst(new THREE.CylinderGeometry(0.11, 0.12, 0.9, 10).translate(0, 0.45, 0), ctx.plainMat(0x2a2c30, 0.5), of('bollard'), (o) => at(o));
  // planters with a shrub
  inst(new THREE.BoxGeometry(1.2, 0.55, 1.2).translate(0, 0.275, 0), ctx.plainMat(0x8a8276, 0.85), of('planter'), (o) => at(o));
  inst(new THREE.IcosahedronGeometry(0.55, 1).scale(1, 0.8, 1).translate(0, 0.85, 0), ctx.plainMat(0x3a6a2a, 0.9, { flatShading: true }), of('planter'), (o) => at(o));
  // awnings: a sloping striped canvas over a shop door, on two arms
  {
    const geo = new THREE.BoxGeometry(1.6, 0.06, 1, 1, 1, 6).translate(0.8, 0, 0);
    const c = []; const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) c.push(...(Math.floor((pos.getZ(i) + 0.5) * 6 + 0.001) % 2 ? [1, 1, 1] : [0.6, 0.6, 0.6]));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    inst(geo, ctx.plainMat(0xffffff, 0.85, { vertexColors: true }), AWNINGS, (a) => {
      e.set(0, a.yaw, -0.32, 'YXZ'); q.setFromEuler(e); return m4.compose(p.set(a.x, 3.75, a.z), q, s.set(1, 1, a.w));
    }, (a) => a.col);
  }
  // roofs: water towers (a wooden tank on legs, a cone hat) and air-conditioning units
  const towers = ROOFTOP.filter((r) => r.kind === 'tank'), acs = ROOFTOP.filter((r) => r.kind === 'ac');
  inst(G([new THREE.CylinderGeometry(1.4, 1.4, 2.6, 14).translate(0, 4.3, 0), new THREE.ConeGeometry(1.55, 1.0, 14).translate(0, 6.1, 0), ...[0, 1, 2, 3].map((k) => new THREE.BoxGeometry(0.15, 3.0, 0.15).translate(Math.cos(k * 1.57 + 0.78) * 1.1, 1.5, Math.sin(k * 1.57 + 0.78) * 1.1))]),
    ctx.plainMat(0x6a4a32, 0.9), towers, (o) => at(o));
  inst(G([new THREE.BoxGeometry(2.2, 1.3, 1.6).translate(0, 0.65, 0), new THREE.CylinderGeometry(0.45, 0.45, 0.1, 12).translate(0.45, 1.35, 0)]), ctx.plainMat(0xb8bcc0, 0.5, { metalness: 0.3 }), acs, (o) => at(o));
  // street-name signs (green blades) and walk signals on the four signal poles
  {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
    const g = cv.getContext('2d');
    g.fillStyle = '#1a6a3a'; g.fillRect(0, 0, 512, 128); g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(6, 6, 500, 116);
    g.fillStyle = '#fff'; g.font = '700 70px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('MAIN ST', 256, 68);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const blade = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.36, 0.03), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }), SIGNALS.length);
    const walk = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.34, 0.24), ctx.plainMat(0x1d1f14, 0.6), SIGNALS.length);
    SIGNALS.forEach((sg, i) => {
      blade.setMatrixAt(i, m4.makeRotationY(sg.z > CZ ? 0 : Math.PI).setPosition(sg.x, 7.0, sg.z));
      walk.setMatrixAt(i, m4.makeTranslation(sg.x + (sg.x > 0 ? -0.25 : 0.25), 2.7, sg.z));
    });
    for (const m of [blade, walk]) { m.castShadow = true; m.frustumCulled = false; scene.add(m); }
  }
}

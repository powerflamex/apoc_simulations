// The space station, built from simple shapes at its real size (the truss 109 m across, the modules 4.4 m wide),
// laid out round the Cupola: the window you float under is at the origin's top (the pane at y = 1.8 m, facing down
// at you), with two of the crew behind the glass banging on it. The station sits in the local frame (x right,
// y up away from Earth, z backward); the whole group is moved as you drift away.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function makeStation() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xa9a9a4, roughness: 0.78, metalness: 0.1 });
  const foil = new THREE.MeshStandardMaterial({ color: 0xcfcbc0, roughness: 0.45, metalness: 0.45 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x8a8d93, roughness: 0.5, metalness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.6, metalness: 0.3 });
  const alu = new THREE.MeshStandardMaterial({ color: 0xb9bcc2, roughness: 0.35, metalness: 0.8 });
  const radi = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide });
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const cyl = (r, l, n = 28) => new THREE.CylinderGeometry(r, r, l, n);

  // ---- a module: a cylinder with ribs and an end cone, axis along 'x' or 'z' ----
  function module(len, r, x, y, z, axis, mat = white) {
    const m = add(cyl(r, len), mat, x, y, z);
    m.rotation.set(axis === 'z' ? Math.PI / 2 : 0, 0, axis === 'x' ? Math.PI / 2 : 0);
    const ribs = Math.floor(len / 1.7);
    for (let i = 0; i < ribs; i++) {
      const rb = add(new THREE.TorusGeometry(r + 0.03, 0.05, 6, 36), grey, x, y, z);
      const off = -len / 2 + 0.6 + i * 1.7;
      if (axis === 'z') { rb.position.z += off; } else { rb.position.x += off; rb.rotation.y = Math.PI / 2; }
    }
    return m;
  }
  const Y = 5.2;                 // the modules' centre line height above you
  // Tranquility (the Cupola hangs under it), Unity, Destiny, Harmony, Columbus, Kibo, Zarya, Zvezda
  module(6.7, 2.2, 0, Y, 0, 'x');
  module(5.5, 2.2, 5.2, Y, 0, 'z');
  module(8.5, 2.2, 5.2, Y, -9.0, 'z');
  module(6.7, 2.2, 5.2, Y, -17.0, 'z');
  module(6.9, 2.2, 10.9, Y, -17.0, 'x');
  module(11.0, 2.2, -2.6, Y, -17.0, 'x');
  add(new RoundedBoxGeometry(5.5, 3.2, 4.6, 3, 0.2), foil, -11.2, Y - 0.4, -17.0);
  module(12.5, 2.0, 5.2, Y, 9.5, 'z', foil);
  module(13.0, 2.0, 5.2, Y, 22.5, 'z', foil);
  // a capsule docked at the front, another at the back
  const cap = (x, y, z, dir) => {
    const c = add(cyl(1.9, 3.0, 24), white, x, y, z); c.rotation.x = Math.PI / 2;
    const n = add(new THREE.ConeGeometry(1.9, 2.4, 24), alu, x, y, z + dir * 2.7); n.rotation.x = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    const tr = add(cyl(1.6, 2.0, 24), dark, x, y, z - dir * 2.5); tr.rotation.x = Math.PI / 2;
  };
  cap(5.2, Y, -22.6, -1);
  cap(5.2, Y, 31.0, 1);
  // Zvezda's small arrays
  for (const sx of [-1, 1]) { const p = add(new THREE.BoxGeometry(11, 0.08, 1.6), new THREE.MeshStandardMaterial({ color: 0x3b4a6b, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide }), 5.2 + sx * 7.5, Y + 0.6, 24.5); p.rotation.x = 0.4; }

  // ---- the Cupola under Tranquility: a six-sided bay of slanted windows round a big round one, open frames so
  // you can see in; two of the crew float behind the pane that faces you, hands on the glass ----
  const cup = new THREE.Group();
  g.add(cup);
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x88aacc, roughness: 0.3, metalness: 0.0, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false });
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.9, side: THREE.DoubleSide });
  // the ring where the bay meets the module, its lit ceiling, the ring round the bottom window
  add(new THREE.TorusGeometry(1.5, 0.1, 10, 48), white, 0, 3.0, 0, cup).rotation.x = Math.PI / 2;
  const ceil = add(new THREE.CircleGeometry(1.5, 48), cabinMat, 0, 3.04, 0, cup);
  ceil.rotation.x = Math.PI / 2; ceil.castShadow = false;
  add(new THREE.TorusGeometry(1.12, 0.08, 10, 48), white, 0, 1.8, 0, cup).rotation.x = Math.PI / 2;
  const glass = add(new THREE.CircleGeometry(0.98, 48), glassMat, 0, 1.8, 0, cup);
  glass.rotation.x = Math.PI / 2;
  glass.castShadow = false;
  const frame = add(new THREE.TorusGeometry(0.99, 0.05, 8, 48), dark, 0, 1.8, 0, cup);
  frame.rotation.x = Math.PI / 2;
  // six ribs at the corners (tilted: the bay tapers), and a slanted pane in a dark border between each pair
  const crew = [];
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3;
    const rg = new THREE.Group();
    rg.rotation.y = -a;
    cup.add(rg);
    const rib = add(new THREE.BoxGeometry(0.16, 1.32, 0.16), white, 1.35, 2.4, 0, rg);
    rib.rotation.z = -0.3;
    const ap = a + Math.PI / 6;
    const pane = add(new THREE.PlaneGeometry(1.1, 0.86), glassMat, Math.cos(ap) * 1.3, 2.42, Math.sin(ap) * 1.3, cup);
    pane.lookAt(Math.cos(ap) * 10, 2.42 - 5.0, Math.sin(ap) * 10);
    pane.castShadow = false;
    for (const [w, h, x, y] of [[1.22, 0.07, 0, 0.465], [1.22, 0.07, 0, -0.465], [0.07, 0.86, -0.575, 0], [0.07, 0.86, 0.575, 0]]) add(new THREE.BoxGeometry(w, h, 0.05), dark, x, y, 0, pane);
    if (k === 5) {
      // the two faces at the glass (their +z is out through the pane, toward you)
      const mkHead = (x, y, skin, hair, shirt) => {
        const hd = new THREE.Group();
        hd.position.set(x, y, -0.44);
        pane.add(hd);
        const sk = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.75 });
        const head = add(new THREE.SphereGeometry(0.17, 24, 18), sk, 0, 0, 0, hd);
        head.scale.set(0.92, 1.08, 1.0);
        const hr = add(new THREE.SphereGeometry(0.18, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: hair, roughness: 0.95 }), 0, 0.04, -0.02, hd);
        hr.scale.set(0.95, 1.0, 1.05);
        const eye = new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.4 });
        add(new THREE.SphereGeometry(0.028, 10, 8), eye, -0.06, 0.03, 0.15, hd);
        add(new THREE.SphereGeometry(0.028, 10, 8), eye, 0.06, 0.03, 0.15, hd);
        add(new THREE.SphereGeometry(0.05, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }), -0.06, 0.03, 0.135, hd).scale.set(1, 0.8, 0.5);
        add(new THREE.SphereGeometry(0.05, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }), 0.06, 0.03, 0.135, hd).scale.set(1, 0.8, 0.5);
        const brow = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.9 });
        add(new THREE.BoxGeometry(0.07, 0.014, 0.02), brow, -0.06, 0.09, 0.155, hd).rotation.z = 0.35;
        add(new THREE.BoxGeometry(0.07, 0.014, 0.02), brow, 0.06, 0.09, 0.155, hd).rotation.z = -0.35;
        const mouth = add(new THREE.SphereGeometry(0.045, 12, 10), new THREE.MeshStandardMaterial({ color: 0x3a1512, roughness: 0.6 }), 0, -0.075, 0.145, hd);
        mouth.scale.set(1.1, 0.9, 0.5);
        const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85 });
        add(new RoundedBoxGeometry(0.5, 0.26, 0.3, 3, 0.06), shirtMat, 0, -0.32, -0.04, hd);
        const hands = [];
        for (const sx of [-1, 1]) {
          const hand = add(new RoundedBoxGeometry(0.11, 0.14, 0.03, 2, 0.012), sk, sx * 0.3, -0.26, 0.4, hd);
          const fingers = add(new RoundedBoxGeometry(0.11, 0.09, 0.028, 2, 0.012), sk, sx * 0.3, -0.15, 0.4, hd);
          const arm = add(new THREE.CapsuleGeometry(0.05, 0.3, 4, 10), shirtMat, sx * 0.28, -0.3, 0.2, hd);
          arm.rotation.x = Math.PI / 2;
          hands.push({ hand, fingers, arm, sx });
        }
        crew.push({ h: hd, hands, base: hd.position.clone(), lean: x > 0 ? 1 : -1 });
      };
      mkHead(-0.27, 0.06, 0xe0ac86, 0x2e2018, 0x2b4a8a);
      mkHead(0.3, -0.02, 0x9a6440, 0x151515, 0x8a2b2b);
      // the light on their faces
      const lamp2 = new THREE.PointLight(0xffe8c8, 10, 4, 1.6);
      lamp2.position.set(0.1, 0.45, -0.15);
      pane.add(lamp2);
    }
  }
  const lamp = new THREE.PointLight(0xffe2b8, 12, 4.5, 1.6);
  lamp.position.set(-0.3, 2.75, 0.2);
  cup.add(lamp);

  // handrails round the Cupola and along Tranquility's underside (the one you hold is at the right)
  const rail = (x0, y0, z0, x1, y1, z1) => {
    const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1);
    const m = add(cyl(0.02, a.distanceTo(b), 8), alu, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    for (const p of [a, b]) add(new THREE.BoxGeometry(0.05, 0.08, 0.05), grey, p.x, p.y, p.z);
    return m;
  };
  rail(1.75, 2.9, -0.3, 1.75, 2.9, 0.6);
  rail(0.9, 1.95, 0.9, 1.6, 2.5, 0.9);
  rail(-1.7, 3.0, -0.6, -1.7, 3.0, 0.6);
  rail(2.9, 3.3, -2.0, 2.9, 3.3, 2.0);
  rail(-2.9, 3.3, -2.0, -2.9, 3.3, 2.0);

  // ---- the truss: a long lattice above the modules, and the big arrays at its ends ----
  const TY = 12.6, X0 = -50, X1 = 60;
  const bar = new THREE.BoxGeometry(0.14, 0.14, 1);
  const n = Math.floor((X1 - X0) / 2.3);
  const lattice = new THREE.InstancedMesh(bar, alu, n * 12 + 8);
  lattice.castShadow = true;
  let bi = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const seg = (ax, ay, az, bx, by, bz) => {
    const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz);
    p.lerpVectors(a, b, 0.5); q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.clone().sub(a).normalize()); sc.set(1, 1, a.distanceTo(b));
    lattice.setMatrixAt(bi++, m4.compose(p, q, sc));
  };
  const H = 1.6;
  for (const [dy, dz] of [[-H, -H], [-H, H], [H, -H], [H, H]]) seg(X0, TY + dy, dz, X1, TY + dy, dz);
  for (let i = 0; i <= n; i++) {
    const x = X0 + i * 2.3;
    seg(x, TY - H, -H, x, TY - H, H); seg(x, TY + H, -H, x, TY + H, H); seg(x, TY - H, -H, x, TY + H, -H); seg(x, TY - H, H, x, TY + H, H);
    if (i < n) {
      const s = i % 2 ? 1 : -1;
      seg(x, TY - H, -H, x + 2.3, TY + H, -H); seg(x, TY + H * s, H, x + 2.3, TY - H * s, H);
      seg(x, TY - H, -H * s, x + 2.3, TY - H, H * s); seg(x, TY + H, H * s, x + 2.3, TY + H, -H * s);
    }
  }
  lattice.count = bi;
  lattice.instanceMatrix.needsUpdate = true;
  g.add(lattice);
  // Z1 and the struts joining the truss to the modules
  add(new RoundedBoxGeometry(4.6, 3.0, 4.6, 2, 0.2), foil, 5.2, Y + 3.9, 0);
  add(new RoundedBoxGeometry(4.2, 2.6, 4.2, 2, 0.15), alu, 5.2, TY - 1.2, 0);
  // the array cells: a canvas of panels with thin bright lines, warm gold
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 1024;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#6b4a1e'; cx.fillRect(0, 0, 512, 1024);
  for (let yy = 0; yy < 1024; yy += 16) for (let xx = 0; xx < 512; xx += 32) {
    const k = 0.75 + 0.3 * Math.sin(xx * 0.37 + yy * 0.11) * Math.cos(yy * 0.07);
    cx.fillStyle = `rgb(${Math.round(150 * k)}, ${Math.round(100 * k)}, ${Math.round(45 * k)})`;
    cx.fillRect(xx + 1, yy + 1, 30, 14);
  }
  cx.strokeStyle = '#d9c9a0'; cx.lineWidth = 2;
  cx.beginPath(); cx.moveTo(256, 0); cx.lineTo(256, 1024); cx.stroke();
  const cells = new THREE.CanvasTexture(cv);
  cells.colorSpace = THREE.SRGBColorSpace; cells.wrapS = cells.wrapT = THREE.RepeatWrapping; cells.repeat.set(1, 3);
  const arrayMat = new THREE.MeshStandardMaterial({ map: cells, roughness: 0.42, metalness: 0.55, side: THREE.DoubleSide, emissive: 0x7a4a14, emissiveIntensity: 0.55 });
  const wings = [];
  const tilt = 0.6;             // the arrays turned toward the Sun (about the truss)
  for (const mx of [-30, -44, 37, 51]) {
    const hub = add(new THREE.BoxGeometry(2.2, 2.2, 2.2), alu, mx, TY, 0);
    for (const dir of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(11.7, 35.5), arrayMat);
      w.position.set(mx, TY + dir * 19.6 * Math.cos(tilt), dir * 19.6 * Math.sin(tilt));
      w.rotation.set(-tilt + Math.PI / 2 - Math.PI / 2, 0, 0);
      w.rotation.x = -tilt;
      w.castShadow = true; w.receiveShadow = true;
      g.add(w);
      const mast = add(new THREE.BoxGeometry(0.5, 35, 0.5), alu, mx, TY + dir * 19.6 * Math.cos(tilt), dir * 19.6 * Math.sin(tilt));
      mast.rotation.x = -tilt;
      wings.push(w);
    }
  }
  // the radiators: white panels folded out from the truss, fore and aft
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
    const r = add(new THREE.BoxGeometry(3.2, 0.12, 14), radi, sx * (14 + k * 4) + 5, TY - 2.4, -8.5 - 1.5 * k);
    r.rotation.x = 0.15;
  }
  // antennas, boxes, a dish
  add(new THREE.CylinderGeometry(0.6, 0.6, 0.3, 24), alu, 8.5, TY + 2.2, 1.5).rotation.x = 0.6;
  add(new THREE.CylinderGeometry(0.04, 0.04, 6, 8), alu, 9.5, TY + 3.5, -2);
  for (let k = 0; k < 8; k++) add(new RoundedBoxGeometry(0.8 + (k % 3) * 0.3, 0.6, 0.9, 2, 0.08), k % 2 ? grey : foil, -20 + k * 7, TY - 2.1, 2.0 + (k % 2) * 0.8);

  // ---- per frame: the crew banging on the glass (v: video time; bang: 0..1 how hard) ----
  function update(v, bang) {
    crew.forEach((c, i) => {
      const f = 3.6 + 0.4 * i;
      c.h.position.copy(c.base).add(new THREE.Vector3(0.02 * Math.sin(v * 1.7 + i), 0.025 * Math.sin(v * 2.3 + i * 2), 0.015 * Math.cos(v * 1.3 + i)));
      c.h.rotation.set(0.08 * Math.sin(v * 1.1 + i), 0.12 * Math.sin(v * 0.7 + i * 1.5) + c.lean * 0.15, 0.06 * Math.cos(v * 0.9 + i));
      c.hands.forEach((hd, k) => {
        const ph = ((v * f + k * 0.5 + i * 0.3) % 1 + 1) % 1;
        const lift = bang * Math.pow(Math.max(0, Math.sin(ph * Math.PI)), 0.7) * 0.17;
        hd.hand.position.z = 0.4 - lift; hd.fingers.position.z = 0.4 - lift;
        hd.arm.position.z = 0.2 - lift * 0.5;
      });
    });
  }
  return { group: g, cupola: cup, update, lamp, wings };
}

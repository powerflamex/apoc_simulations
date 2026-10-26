// The city around the plaza, built once: the street and the avenue, sidewalks and curbs, the towers across the
// street, the blocks beside and behind the plaza, the far skyline down the avenue, trees, lamps, traffic lights,
// benches, the café, the fountain's basin and a big screen. Facades are canvas textures with UVs in metres, so one
// material per facade style serves every building. Static meshes are merged per material.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './util.js';
import { CURB, ROAD, FAR, FAR_BLD, AVE_X0, AVE_X1, XWALK_X, TREES, BENCHES, CAFE, FOUNTAIN, LANES_Z, GUITAR } from './layout.js';

const R = rng(20261022);

function canvasTex(w, h, draw, { repeat = true, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
// facade tiles: 8 bays x 8 floors per tile
const BAY = 3.2, FLOOR = 3.6, TB = 8;
function facadeTex(style, seed) {
  const r = rng(seed);
  return canvasTex(512, 576, (g, w, h) => {
    const bw = w / TB, fh = h / TB;
    g.fillStyle = style.wall; g.fillRect(0, 0, w, h);
    for (let j = 0; j < TB; j++) for (let i = 0; i < TB; i++) {
      const x = i * bw, y = j * fh;
      // the window: sky reflections (lighter at the top), some blinds, some lit inside
      const k = r();
      const gr = g.createLinearGradient(0, y, 0, y + fh);
      const base = style.glass[Math.floor(r() * style.glass.length)];
      gr.addColorStop(0, base[0]); gr.addColorStop(1, base[1]);
      g.fillStyle = gr;
      g.fillRect(x + style.mx * bw, y + style.my * fh, bw * (1 - 2 * style.mx), fh * (1 - style.my - style.mb));
      if (k < 0.18) { g.fillStyle = 'rgba(230,220,200,0.55)'; g.fillRect(x + style.mx * bw, y + style.my * fh, bw * (1 - 2 * style.mx), fh * (1 - style.my - style.mb) * (0.3 + 0.6 * r())); }
      if (style.mullion) { g.fillStyle = style.mullion; g.fillRect(x + bw / 2 - 1, y + style.my * fh, 2, fh * (1 - style.my - style.mb)); }
    }
    if (style.band) { g.fillStyle = style.band; for (let j = 0; j < TB; j++) g.fillRect(0, j * fh + fh - 5, w, 5); }
  });
}
const STYLES = {
  glassBlue: { wall: '#2d3a48', glass: [['#9fb6cc', '#4d6680'], ['#8aa4bf', '#3e5670'], ['#b5c7d6', '#5a7189']], mx: 0.03, my: 0.04, mb: 0.04, mullion: '#2a333d' },
  glassGreen: { wall: '#2b3a3a', glass: [['#a5c2bf', '#4b6a68'], ['#8fb0ad', '#3f5c5a']], mx: 0.02, my: 0.05, mb: 0.03, band: '#cfd6d4' },
  stone: { wall: '#c9b99d', glass: [['#5a6b7b', '#2c3742'], ['#6d7f90', '#33404c'], ['#4a5966', '#222a33']], mx: 0.22, my: 0.18, mb: 0.22, band: '#b5a487' },
  brick: { wall: '#8c4b37', glass: [['#58697a', '#262f38'], ['#6a7c8c', '#2f3943']], mx: 0.25, my: 0.2, mb: 0.25, band: '#a8907a' },
  white: { wall: '#e8e4dc', glass: [['#5d7083', '#29323c'], ['#7a8c9c', '#38444f']], mx: 0.12, my: 0.12, mb: 0.18 },
};
const shopTex = () => canvasTex(1024, 128, (g, w, h) => {
  const r = rng(77);
  g.fillStyle = '#2a2622'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) {
    const x = i * w / 8;
    const gr = g.createLinearGradient(0, 0, 0, h);
    const warm = ['#f2d6a0', '#e8c48c', '#d9e4ea', '#f5e1c0', '#c7d9e0'][Math.floor(r() * 5)];
    gr.addColorStop(0, '#3b4650'); gr.addColorStop(0.35, warm); gr.addColorStop(1, '#6b5a48');
    g.fillStyle = gr; g.fillRect(x + 6, 26, w / 8 - 12, h - 30);
    g.fillStyle = ['#b03a2e', '#1f618d', '#196f3d', '#7d3c98', '#ca6f1e', '#212f3c'][Math.floor(r() * 6)];
    g.fillRect(x + 2, 0, w / 8 - 4, 22);   // the awning / sign band
  }
});

// a box with UVs in metres (u along the face / (BAY*TB), v up / (FLOOR*TB)); y0 = bottom
function bldBox(cx, cz, w, d, y0, h) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.translate(cx, y0 + h / 2, cz);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), nx = n.getX(i), nz = n.getZ(i);
    const along = Math.abs(nx) > 0.5 ? z * Math.sign(nx) : -x * Math.sign(nz || 1);
    uv.setXY(i, along / (BAY * TB), y / (FLOOR * TB));
  }
  return g;
}

export function makeCity(scene, { shadowy }) {
  const groups = new Map();
  const add = (mat, geo) => { if (!groups.has(mat)) groups.set(mat, []); groups.get(mat).push(geo.index ? geo.toNonIndexed() : geo); };
  const std = (o) => new THREE.MeshStandardMaterial(o);

  // ---------- materials ----------
  const paverTex = canvasTex(512, 512, (g, w, h) => {
    const r = rng(5);
    g.fillStyle = '#b9b1a5'; g.fillRect(0, 0, w, h);
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
      const c = 170 + r() * 30;
      g.fillStyle = `rgb(${c},${c - 6},${c - 14})`;
      g.fillRect(i * 64 + 2, j * 64 + 2, 60, 60);
    }
  });
  const asphaltTex = canvasTex(512, 512, (g, w, h) => {
    const r = rng(9);
    g.fillStyle = '#3d3f42'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const c = 45 + r() * 40; g.fillStyle = `rgba(${c},${c},${c + 3},0.5)`; g.fillRect(r() * w, r() * h, 2, 2); }
  });
  const M = {
    paver: std({ map: paverTex, roughness: 0.85 }),
    sidewalk: std({ color: 0xa8a29a, roughness: 0.9 }),
    asphalt: std({ map: asphaltTex, roughness: 0.92 }),
    paint: std({ color: 0xe8e6df, roughness: 0.7 }),
    yellow: std({ color: 0xe0b23a, roughness: 0.7 }),
    curb: std({ color: 0x9c968d, roughness: 0.85 }),
    shop: std({ map: shopTex(), roughness: 0.4, metalness: 0.1 }),
    roof: std({ color: 0x55585c, roughness: 0.9 }),
    trunk: std({ color: 0x4a3828, roughness: 0.95 }),
    leaf: std({ color: 0x3d6b2e, roughness: 0.85 }),
    leaf2: std({ color: 0x4f7d34, roughness: 0.85 }),
    metal: std({ color: 0x2d3136, roughness: 0.5, metalness: 0.6 }),
    wood: std({ color: 0x8a5a36, roughness: 0.8 }),
    stoneLight: std({ color: 0xd8d2c6, roughness: 0.7 }),
    umbrellaA: std({ color: 0xc0392b, roughness: 0.8, side: THREE.DoubleSide }),
    umbrellaB: std({ color: 0xf2efe6, roughness: 0.8, side: THREE.DoubleSide }),
    tableTop: std({ color: 0xe9e6df, roughness: 0.5 }),
    redLight: new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.25, 0.15) }),
    greenLight: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 4, 1.4) }),
    dark: std({ color: 0x1b1d20, roughness: 0.6 }),
  };
  const FAC = {};
  for (const [k, st] of Object.entries(STYLES)) {
    const glassy = k.startsWith('glass');
    FAC[k] = std({ map: facadeTex(st, 100 + k.length * 7), roughness: glassy ? 0.4 : 0.75, metalness: glassy ? 0.12 : 0.05, envMapIntensity: glassy ? 1.1 : 0.6 });
  }

  // ---------- ground ----------
  const plane = (x0, x1, z0, z1, y, mat, uvScale = 1) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    const uv = g.attributes.uv, p = g.attributes.position;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (8 * uvScale), p.getZ(i) / (8 * uvScale));
    add(mat, g);
  };
  plane(-400, 400, CURB, 400, 0, M.paver, 0.5);                  // the plaza and the near sidewalk
  plane(-400, 400, FAR, CURB, ROAD, M.asphalt, 1);                // our street
  plane(-400, AVE_X0, FAR_BLD, FAR, 0, M.sidewalk);              // the far sidewalk (both sides of the avenue)
  plane(AVE_X1, 400, FAR_BLD, FAR, 0, M.sidewalk);
  plane(AVE_X0 - 4, AVE_X1 + 4, -3000, FAR, ROAD, M.asphalt, 1);  // the avenue north (with its sidewalks below)
  plane(AVE_X0 - 4, AVE_X0, -3000, FAR_BLD, 0.001, M.sidewalk);
  plane(AVE_X1, AVE_X1 + 4, -3000, FAR_BLD, 0.001, M.sidewalk);
  // curbs
  const box = (mat, x, y, z, w, h, d, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); add(mat, g); };
  box(M.curb, 0, -0.07, CURB - 0.12, 800, 0.16, 0.24);
  box(M.curb, (-400 + AVE_X0) / 2, -0.07, FAR + 0.12, 400 + AVE_X0, 0.16, 0.24);
  box(M.curb, (AVE_X1 + 400) / 2, -0.07, FAR + 0.12, 400 - AVE_X1, 0.16, 0.24);
  // lane markings: dashed white between lanes, double yellow in the middle, the crosswalks
  for (let x = -300; x < 300; x += 9) {
    for (const z of [(LANES_Z[0] + LANES_Z[1]) / 2, (LANES_Z[2] + LANES_Z[3]) / 2]) box(M.paint, x, ROAD + 0.005, z, 3, 0.01, 0.14);
  }
  const mid = (LANES_Z[1] + LANES_Z[2]) / 2;
  for (const dz of [-0.12, 0.12]) box(M.yellow, 0, ROAD + 0.005, mid + dz, 600, 0.01, 0.12);
  for (let z = CURB - 0.8; z > FAR + 0.5; z -= 1.0) box(M.paint, XWALK_X, ROAD + 0.006, z, 3.2, 0.01, 0.5);
  for (let x = AVE_X0 + 0.6; x < AVE_X1 - 0.3; x += 1.0) box(M.paint, x, ROAD + 0.006, FAR_BLD - 2, 0.5, 0.01, 3.2);
  for (let z = FAR_BLD - 12; z > -2500; z -= 12) box(M.paint, (AVE_X0 + AVE_X1) / 2, ROAD + 0.005, z, 0.14, 0.01, 4);
  // stop line on the avenue
  box(M.paint, (AVE_X0 + AVE_X1) / 2 - 2, ROAD + 0.006, FAR_BLD - 4.2, 8, 0.01, 0.4);

  // ---------- buildings ----------
  const shadowCasters = [];
  const building = (cx, cz, w, d, h, style, shop = true) => {
    const fac = FAC[style];
    if (shop) {
      add(M.shop, (() => {
        const g = new THREE.BoxGeometry(w, 5, d).toNonIndexed().translate(cx, 2.5, cz);
        const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
        for (let i = 0; i < p.count; i++) { const along = Math.abs(n.getX(i)) > 0.5 ? p.getZ(i) : p.getX(i); uv.setXY(i, along / 28, (p.getY(i)) / 5); }
        return g;
      })());
      add(fac, bldBox(cx, cz, w, d, 5, h - 5));
    } else add(fac, bldBox(cx, cz, w, d, 0, h));
    box(M.roof, cx, h + 0.4, cz, w * 0.6, 0.8, d * 0.6);
  };
  const styles = Object.keys(STYLES);
  // across the street: west of the avenue and east of it, tall
  {
    let x = AVE_X0 - 2;
    const westH = [64, 118, 46, 152, 88, 70, 130, 54];
    for (let i = 0; i < westH.length; i++) {
      const w = 18 + R() * 12;
      building(x - w / 2, FAR_BLD - 14, w, 26, westH[i], styles[(i * 3 + 1) % styles.length]);
      x -= w + 1.5;
    }
    x = AVE_X1 + 2;
    const eastH = [96, 58, 168, 76, 110, 62, 140, 84];
    for (let i = 0; i < eastH.length; i++) {
      const w = 18 + R() * 12;
      building(x + w / 2, FAR_BLD - 14, w, 26, eastH[i], styles[(i * 2 + 2) % styles.length]);
      x += w + 1.5;
    }
  }
  // lining the avenue further north (both sides), then the far skyline at the end of it
  for (let z = FAR_BLD - 30; z > -1400; z -= 34 + R() * 10) {
    building(AVE_X0 - 18, z - 15, 28, 30, 30 + R() * 110, styles[Math.floor(R() * styles.length)]);
    building(AVE_X1 + 18, z - 15, 28, 30, 30 + R() * 110, styles[Math.floor(R() * styles.length)]);
  }
  for (let i = 0; i < 40; i++) {
    const x = -900 + i * 45 + R() * 20, z = -1500 - R() * 900;
    building(x, z, 30 + R() * 30, 30 + R() * 30, 60 + R() * 260, styles[Math.floor(R() * styles.length)], false);
  }
  // the blocks beside the plaza (west and east) and behind you
  for (let z = 20; z > -2; z -= 22) {
    building(-34, z - 8, 20, 22, 26 + R() * 30, styles[Math.floor(R() * styles.length)]);
    building(36, z - 8, 20, 22, 26 + R() * 30, styles[Math.floor(R() * styles.length)]);
  }
  for (let x = -60; x < 60; x += 24) building(x + 12, 46, 22, 24, 24 + R() * 40, styles[Math.floor(R() * styles.length)]);
  // a low café pavilion behind the café tables
  building((CAFE.x0 + CAFE.x1) / 2 + 3, CAFE.z1 + 5, CAFE.x1 - CAFE.x0 + 8, 8, 9, 'white');

  // ---------- the big screen on the tower east of the avenue ----------
  const screenTex = canvasTex(512, 288, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, '#ff4f6d'); gr.addColorStop(0.5, '#ffb347'); gr.addColorStop(1, '#3fd2ff');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.font = 'bold 74px Arial'; g.textAlign = 'center';
    g.fillText('SUMMER', w / 2, 120); g.font = 'bold 58px Arial'; g.fillText('SALE  -40%', w / 2, 200);
  }, { repeat: false });
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, color: new THREE.Color(1.6, 1.6, 1.6) });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(16, 9), screenMat);
  screen.position.set(AVE_X1 + 12, 26, FAR_BLD - 0.6);
  scene.add(screen);

  // ---------- trees ----------
  const leafGeo = [];
  for (const [tx, tz] of TREES) {
    const rr = rng(Math.round(tx * 31 + tz * 7) >>> 0);
    const h = 4.2 + rr() * 1.5;
    add(M.trunk, new THREE.CylinderGeometry(0.14, 0.2, h, 7).translate(tx, h / 2, tz));
    add(M.stoneLight, new THREE.BoxGeometry(1.5, 0.12, 1.5).translate(tx, 0.05, tz));
    for (let k = 0; k < 9; k++) {
      const a = rr() * 6.28, rad = rr() * 1.6;
      const s = 1.1 + rr() * 0.9;
      leafGeo.push([new THREE.IcosahedronGeometry(s, 1).translate(tx + Math.cos(a) * rad, h + 0.6 + rr() * 1.8, tz + Math.sin(a) * rad), k % 2 ? M.leaf : M.leaf2]);
    }
  }
  for (const [g, m] of leafGeo) add(m, g);

  // ---------- street lamps and traffic lights ----------
  for (let x = -40; x <= 40; x += 16) {
    if (Math.abs(x - 0.4) < 3 || (x > 2 && x < 11)) continue;
    add(M.metal, new THREE.CylinderGeometry(0.07, 0.1, 6, 8).translate(x, 3, CURB + 0.5));
    add(M.metal, new THREE.BoxGeometry(0.14, 0.1, 1.6).translate(x, 6, CURB - 0.25));
    add(M.stoneLight, new THREE.BoxGeometry(0.4, 0.16, 0.7).translate(x, 5.9, CURB - 0.9));
  }
  const tlight = (x, z, ry, green) => {
    add(M.metal, new THREE.CylinderGeometry(0.08, 0.1, 4.2, 8).translate(x, 2.1, z));
    const head = new THREE.BoxGeometry(0.36, 1.0, 0.3).rotateY(ry).translate(x, 3.9, z);
    add(M.dark, head);
    const lamp = (dy, m) => add(m, new THREE.SphereGeometry(0.1, 8, 6).translate(x + Math.sin(ry) * 0.16, 3.9 + dy, z + Math.cos(ry) * 0.16));
    lamp(green ? -0.3 : 0.3, green ? M.greenLight : M.redLight);
  };
  tlight(AVE_X0 - 0.8, CURB + 0.6, Math.PI, true);
  tlight(AVE_X1 + 0.8, FAR + 0.8, 0, true);
  tlight(AVE_X1 + 0.8, FAR_BLD - 1, -Math.PI / 2, false);
  tlight(AVE_X0 - 0.8, FAR_BLD - 1, Math.PI / 2, false);

  // ---------- benches, bollards, planters ----------
  for (const [bx, bz] of BENCHES) {
    add(M.wood, new THREE.BoxGeometry(1.9, 0.08, 0.5).translate(bx, 0.45, bz));
    add(M.wood, new THREE.BoxGeometry(1.9, 0.4, 0.06).translate(bx, 0.7, bz - 0.24));
    for (const dx of [-0.8, 0.8]) add(M.metal, new THREE.BoxGeometry(0.06, 0.45, 0.45).translate(bx + dx, 0.22, bz));
  }
  for (let x = -24; x <= 30; x += 3) {
    if (Math.abs(x) < 6 || (x > 2 && x < 11) || (x > AVE_X0 - 6 && x < AVE_X0 + 1) || Math.abs(x - XWALK_X) < 3) continue;
    add(M.metal, new THREE.CylinderGeometry(0.08, 0.08, 0.9, 8).translate(x + 0.5, 0.45, CURB + 0.35));
  }

  // the guitarist's stool and his open case
  add(M.metal, new THREE.CylinderGeometry(0.03, 0.03, 0.62, 6).translate(GUITAR.x, 0.31, GUITAR.z));
  add(M.dark, new THREE.CylinderGeometry(0.2, 0.2, 0.06, 14).translate(GUITAR.x, 0.64, GUITAR.z));
  add(M.dark, new THREE.BoxGeometry(1.0, 0.1, 0.38).rotateY(0.3).translate(GUITAR.x - 1.1, 0.05, GUITAR.z + 0.55));

  // ---------- the café: tables, chairs, umbrellas ----------
  {
    const rr = rng(44);
    for (let x = CAFE.x0 + 1; x < CAFE.x1; x += 2.6) for (let z = CAFE.z0 + 1.4; z < CAFE.z1 - 0.5; z += 2.8) {
      const jx = x + (rr() - 0.5) * 0.4, jz = z + (rr() - 0.5) * 0.4;
      add(M.tableTop, new THREE.CylinderGeometry(0.4, 0.4, 0.04, 14).translate(jx, 0.74, jz));
      add(M.metal, new THREE.CylinderGeometry(0.03, 0.03, 0.72, 6).translate(jx, 0.37, jz));
      for (const a of [0.4, 2.0, 3.6, 5.2]) {
        const cx = jx + Math.cos(a) * 0.62, cz = jz + Math.sin(a) * 0.62;
        add(M.metal, new THREE.BoxGeometry(0.42, 0.04, 0.42).rotateY(-a).translate(cx, 0.45, cz));
        add(M.metal, new THREE.BoxGeometry(0.42, 0.45, 0.04).rotateY(-a + Math.PI / 2).translate(cx + Math.cos(a) * 0.2, 0.68, cz + Math.sin(a) * 0.2));
      }
      add(M.metal, new THREE.CylinderGeometry(0.025, 0.025, 2.3, 6).translate(jx, 1.15, jz));
      add((Math.round(x + z) % 2) ? M.umbrellaA : M.umbrellaB, new THREE.ConeGeometry(1.25, 0.5, 8, 1, true).translate(jx, 2.35, jz));
    }
    // the café's menu board (the HUD adds it up)
    add(M.dark, new THREE.BoxGeometry(0.7, 1.0, 0.05).rotateY(-0.5).translate(CAFE.x0 - 0.4, 0.7, CAFE.z0 - 0.4));
  }

  // ---------- the fountain's basin ----------
  {
    const { x, z, r } = FOUNTAIN;
    const ring = new THREE.CylinderGeometry(r + 0.35, r + 0.45, 0.55, 48, 1, true).translate(x, 0.27, z);
    add(M.stoneLight, ring);
    add(M.stoneLight, new THREE.RingGeometry(r, r + 0.35, 48).rotateX(-Math.PI / 2).translate(x, 0.55, z));
    add(M.stoneLight, new THREE.CylinderGeometry(0.5, 0.7, 1.0, 16).translate(x, 0.5, z));
    add(M.stoneLight, new THREE.CylinderGeometry(1.4, 0.3, 0.3, 24).translate(x, 1.1, z));
  }

  // ---------- merge and add ----------
  for (const [mat, list] of groups) {
    const g = mergeGeometries(list.map((x) => { const y = x.index ? x.toNonIndexed() : x; for (const k of Object.keys(y.attributes)) if (!['position', 'normal', 'uv'].includes(k)) y.deleteAttribute(k); if (!y.attributes.uv) y.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(y.attributes.position.count * 2), 2)); return y; }));
    const m = new THREE.Mesh(g, mat);
    shadowy(m);
    scene.add(m);
    shadowCasters.push(m);
  }
  // the fountain's water surface (its own mesh: it ripples in the rain)
  const water = new THREE.Mesh(new THREE.CircleGeometry(FOUNTAIN.r, 48).rotateX(-Math.PI / 2).translate(FOUNTAIN.x, 0.42, FOUNTAIN.z),
    std({ color: 0x3f6f7a, roughness: 0.08, metalness: 0.3, envMapIntensity: 1.4 }));
  water.receiveShadow = true;
  scene.add(water);
  return { M, FAC, screen, screenMat, water };
}

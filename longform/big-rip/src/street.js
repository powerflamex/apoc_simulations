// Street furniture and signs: the promenade's double lamps and the sidewalk lamps (their light is glows + the pools
// in ground.js), benches, planters, kiosks, the telescope someone set up on the promenade, the shop signs (lit, from a
// canvas atlas of made-up names: fascias over the shops, blade signs sticking out higher up, a few rooftop signs),
// the big LED screen on the right (a broadcast, then static once the satellites go), and red beacons on the towers.
// Everything stands on a ground plate (split.js) and rides along when the ground breaks.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAMPS, BENCHES, KIOSKS, PLANTERS, B, WALK, PROM, SCREEN } from './layout.js';
import { nearestSeed } from './split.js';
import { TEL } from './people.js';
import { rng } from './util.js';

const m4 = new THREE.Matrix4(), mA = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
const P = new THREE.Vector3(), S = new THREE.Vector3(), V3 = new THREE.Vector3();
const mat = (x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(P.set(x, y, z), q.setFromEuler(e.set(0, yaw, 0)), S.set(sx, sy, sz));

// an instanced mesh whose instances sit on ground plates: frame(M) re-places them on their plates
function placed(scene, geo, material, items, { shadow = true } = {}) {
  const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, items.length));
  mesh.frustumCulled = false; mesh.castShadow = shadow; mesh.receiveShadow = true;
  items.forEach((it, i) => { it.plate = nearestSeed(it.px ?? it.m.elements[12], it.pz ?? it.m.elements[14]); mesh.setMatrixAt(i, it.m); });
  mesh.count = items.length;
  scene.add(mesh);
  let moved = false;
  return {
    mesh, items,
    frame(M, extra) {
      if (!M && !moved) return;
      moved = !!M;
      items.forEach((it, i) => {
        if (M) m4.multiplyMatrices(M[it.plate], it.m); else m4.copy(it.m);
        if (extra) extra(it, m4);
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

function signAtlas() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 1024, 1024);
  const FASCIA = ['PHARMACY', 'CAFÉ NOIR', 'HOTEL ASTOR', 'SUSHI BAR', 'BANK', 'PIZZERIA', '24H MARKET', 'BAR CENTRAL', 'CINEMA', 'BAKERY',
    'OPTICIAN', 'SHOES', 'BOOKS', 'NOODLES', 'PHONES', 'FASHION', 'TAPAS', 'JUICE BAR', 'WINE BAR', 'DENTIST', 'TAILOR', 'FLOWERS', 'STEAKHOUSE',
    'KARAOKE', 'HOSTEL', 'GELATO', 'RAMEN', 'ELECTRONICS', 'SALON', 'COFFEE', 'TOYS', 'BURGERS', 'LAUNDRY', 'THEATRE', 'SPORTS', 'BISTRO',
    'BOUTIQUE', 'RECORDS', 'JEWELLER', 'BARBER', 'TATTOO', 'LOUNGE', 'DINER', 'DONUTS', 'MINI MART', 'EXCHANGE', 'TRAVEL', 'NIGHT CLUB'];
  const BLADE = ['HOTEL', 'BAR', 'CAFE', 'SUSHI', 'CINE', 'JAZZ', 'OPEN', '24H', 'PIZZA', 'CLUB', 'BOOKS', 'TAPAS', 'LIVE', 'SHOP', 'GRILL', 'INN'];
  const PAL = [['#ff3b5c', '#1a0408'], ['#3ef0ff', '#03141a'], ['#ffd23e', '#1a1203'], ['#ffffff', '#b3001b'], ['#ffffff', '#0b3d91'],
    ['#7dff6a', '#061a04'], ['#ff7a1a', '#180a02'], ['#ffffff', '#111111'], ['#ff5ad8', '#16031a'], ['#1a1a1a', '#ffd23e'], ['#ffffff', '#0a7a3a']];
  const R = rng(99);
  FASCIA.forEach((t, i) => {
    const x = (i % 4) * 256, y = Math.floor(i / 4) * 64;
    const [fg, bg] = PAL[Math.floor(R() * PAL.length)];
    g.fillStyle = bg; g.fillRect(x + 2, y + 2, 252, 60);
    g.strokeStyle = fg; g.globalAlpha = 0.5; g.lineWidth = 2; g.strokeRect(x + 6, y + 6, 244, 52); g.globalAlpha = 1;
    g.fillStyle = fg; g.font = `bold ${t.length > 9 ? 29 : 37}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
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
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { tex, nF: FASCIA.length, nB: BLADE.length };
}

export function makeStreet(scene, { plainMat }) {
  const R = rng(321);
  const parts = [];
  // ---------- lamps ----------
  const promLamp = mergeGeometries([
    new THREE.CylinderGeometry(0.08, 0.13, 7.5, 10).translate(0, 3.75, 0),
    new THREE.CylinderGeometry(0.2, 0.24, 0.5, 10).translate(0, 0.25, 0),
    new THREE.BoxGeometry(1.9, 0.07, 0.07).translate(0, 7.3, 0),
    new THREE.CylinderGeometry(0.18, 0.1, 0.55, 8).translate(-0.95, 7.05, 0),
    new THREE.CylinderGeometry(0.18, 0.1, 0.55, 8).translate(0.95, 7.05, 0),
    new THREE.ConeGeometry(0.28, 0.22, 8).translate(-0.95, 7.42, 0),
    new THREE.ConeGeometry(0.28, 0.22, 8).translate(0.95, 7.42, 0),
  ].map((g) => g.toNonIndexed()));
  const roadLamp = mergeGeometries([
    new THREE.CylinderGeometry(0.08, 0.12, 8.5, 8).translate(0, 4.25, 0),
    new THREE.BoxGeometry(2.4, 0.09, 0.1).translate(1.1, 8.35, 0),
    new THREE.BoxGeometry(0.75, 0.15, 0.32).translate(2.2, 8.25, 0),
  ].map((g) => g.toNonIndexed()));
  const metal = plainMat(0x22262a, 0.45, { metalness: 0.6 });
  const lampItems = LAMPS.filter((l) => l.prom).map((l) => ({ ...l, m: mat(l.x, 0, l.z, 0) }));
  const roadItems = LAMPS.filter((l) => !l.prom).map((l) => ({ ...l, m: mat(l.x, 0, l.z, l.x > 0 ? Math.PI : 0) }));
  parts.push(placed(scene, promLamp, metal, lampItems), placed(scene, roadLamp, metal, roadItems));
  // where each lamp's light comes from (for the glows)
  const lights = [];
  for (const l of lampItems) for (const s of [-1, 1]) lights.push({ lx: l.x + s * 0.95, ly: 7.0, lz: l.z, it: l, r: 1.6 });
  for (const l of roadItems) lights.push({ lx: l.x - Math.sign(l.x) * 2.2, ly: 8.15, lz: l.z, it: l, r: 1.9 });

  // ---------- benches, planters, kiosks ----------
  const bench = mergeGeometries([
    new THREE.BoxGeometry(1.8, 0.06, 0.45).translate(0, 0.45, 0),
    new THREE.BoxGeometry(1.8, 0.4, 0.05).translate(0, 0.72, 0.21),
    new THREE.BoxGeometry(0.06, 0.45, 0.42).translate(-0.8, 0.22, 0),
    new THREE.BoxGeometry(0.06, 0.45, 0.42).translate(0.8, 0.22, 0),
  ].map((g) => g.toNonIndexed()));
  parts.push(placed(scene, bench, plainMat(0x4a3424, 0.7), BENCHES.map((b) => ({ m: mat(b.x, 0, b.z, b.yaw) }))));
  const planter = mergeGeometries([
    new THREE.BoxGeometry(1.6, 0.6, 1.6).translate(0, 0.3, 0),
    new THREE.SphereGeometry(0.85, 8, 6).scale(1, 0.7, 1).translate(0, 0.95, 0),
  ].map((g) => g.toNonIndexed()));
  parts.push(placed(scene, planter, plainMat(0x3c4a32, 0.9), PLANTERS.map((p) => ({ m: mat(p.x, 0, p.z) }))));
  const kiosk = mergeGeometries([
    new THREE.BoxGeometry(2.6, 2.5, 2.0).translate(0, 1.25, 0),
    new THREE.BoxGeometry(3.2, 0.15, 2.6).translate(0, 2.62, 0),
  ].map((g) => g.toNonIndexed()));
  parts.push(placed(scene, kiosk, plainMat(0x1d4a3a, 0.6), KIOSKS.map((k) => ({ m: mat(k.x, 0, k.z, k.x > 0 ? -Math.PI / 2 : Math.PI / 2) }))));
  // the kiosks' lit counters
  const kioskLit = KIOSKS.map((k) => ({ x: k.x - Math.sign(k.x) * 1.05, y: 1.4, z: k.z, it: { plate: nearestSeed(k.x, k.z) } }));

  // ---------- the telescope on the promenade (an amateur with a Dobsonian-ish tube on a tripod) ----------
  const tel = mergeGeometries([
    new THREE.CylinderGeometry(0.11, 0.11, 1.45, 14).rotateX(-1.0).translate(0, 1.32, -0.1),
    new THREE.CylinderGeometry(0.025, 0.025, 1.3, 6).rotateZ(0.32).translate(0.22, 0.62, 0),
    new THREE.CylinderGeometry(0.025, 0.025, 1.3, 6).rotateZ(-0.32).translate(-0.22, 0.62, 0),
    new THREE.CylinderGeometry(0.025, 0.025, 1.3, 6).rotateX(0.32).translate(0, 0.62, 0.22),
  ].map((g) => g.toNonIndexed()));
  parts.push(placed(scene, tel, plainMat(0xd8dadc, 0.35, { metalness: 0.3 }), [{ m: mat(TEL.x, 0, TEL.z, -0.55) }]));

  // ---------- signs ----------
  const atlas = signAtlas();
  const signMat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: atlas.tex }, uOn: { value: 1 }, uDay: { value: 0 } },
    vertexShader: /* glsl */ `attribute vec4 aUV; varying vec2 vUv;
      void main(){ vUv = aUV.xy + uv * aUV.zw; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform sampler2D uMap; uniform float uOn; uniform float uDay; varying vec2 vUv;
      void main(){ vec3 c = texture2D(uMap, vUv).rgb; c = c * c * 2.4; gl_FragColor = vec4(c * mix(0.06, 1.0, uOn) * mix(1.0, 0.5, uDay), 1.0); }`,
    side: THREE.DoubleSide,
  });
  const fascia = [], blades = [];
  for (const b of B) {
    if (!b.front || !b.sign || b.screen) continue;
    const xf = b.side * (WALK - 0.06);
    const w = Math.min(b.d - 2, 7 + R() * 3), hgt = 0.95;
    const yaw = b.side > 0 ? -Math.PI / 2 : Math.PI / 2;
    const i = Math.floor(R() * atlas.nF);
    fascia.push({ m: mat(xf, 4.05, b.z, yaw, w, hgt, 1), uv: [(i % 4) * 0.25, 1 - (Math.floor(i / 4) + 1) * 0.0625, 0.25, 0.0625], px: b.x, pz: b.z });
    if (b.kind === 0 && R() < 0.45) {
      const k = Math.floor(R() * atlas.nB);
      const y = 7 + R() * 3;
      blades.push({ m: mat(b.side * (WALK - 0.6), y, b.z + (R() - 0.5) * (b.d - 3), 0, 1.0, 3.8, 1), uv: [k * 0.0625, 0, 0.0625, 0.25], px: b.x, pz: b.z });
    }
  }
  // a few big rooftop signs on the towers ahead
  for (const b of B.filter((o) => o.kind === 2 && !o.far && o.z < -150 && o.z > -900).slice(0, 5)) {
    const i = Math.floor(R() * atlas.nF);
    fascia.push({ m: mat(b.x - b.side * (b.w / 2 + 0.2), b.h + 3.5, b.z, b.side > 0 ? -Math.PI / 2 : Math.PI / 2, 22, 3.2, 1), uv: [(i % 4) * 0.25, 1 - (Math.floor(i / 4) + 1) * 0.0625, 0.25, 0.0625], px: b.x, pz: b.z });
  }
  const signs = [];
  for (const [list, geo] of [[fascia, new THREE.PlaneGeometry(1, 1)], [blades, new THREE.BoxGeometry(0.12, 1, 1).rotateY(Math.PI / 2)]]) {
    const g = geo.clone();
    const aUV = new Float32Array(Math.max(1, list.length) * 4);
    list.forEach((s, i) => aUV.set(s.uv, i * 4));
    g.setAttribute('aUV', new THREE.InstancedBufferAttribute(aUV, 4));
    signs.push(placed(scene, g, signMat, list, { shadow: false }));
  }
  // fix blade UVs: a box's side faces use the 0..1 uv too, which is what the vertical letters want
  parts.push(...signs);

  // ---------- the LED screen ----------
  const screenMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uTV: { value: 0 }, uOn: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform float uTV; uniform float uOn; varying vec2 vUv;
      float h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      void main(){
        vec2 u = vUv;
        // a news broadcast: a studio backdrop, a presenter-shaped blob, a lower-third banner and a ticker
        vec3 bg = mix(vec3(0.05, 0.12, 0.35), vec3(0.15, 0.35, 0.75), u.y) + 0.08 * sin(u.x * 12.0 + uTime * 0.6);
        float body = smoothstep(0.2, 0.18, length((u - vec2(0.38, 0.3)) * vec2(1.0, 1.4)));
        float head = smoothstep(0.075, 0.065, length((u - vec2(0.38, 0.6)) * vec2(1.0, 0.85)));
        vec3 c = mix(bg, vec3(0.12, 0.1, 0.12), body);
        c = mix(c, vec3(0.85, 0.62, 0.5), head);
        float banner = step(0.12, u.y) * step(u.y, 0.24);
        c = mix(c, vec3(0.75, 0.06, 0.08), banner);
        float txt = step(0.5, h(floor(vec2(u.x * 60.0 + uTime * 8.0, u.y * 40.0)))) * step(0.15, u.y) * step(u.y, 0.21);
        c = mix(c, vec3(1.0), txt * 0.9);
        float tick = step(u.y, 0.1) * step(0.02, u.y);
        c = mix(c, vec3(0.05), tick);
        c = mix(c, vec3(0.95, 0.9, 0.3), tick * step(0.55, h(floor(vec2(u.x * 90.0 + uTime * 20.0, 3.0)))) * step(0.035, u.y) * step(u.y, 0.085));
        float panel = step(0.62, u.x) * step(u.x, 0.95) * step(0.35, u.y) * step(u.y, 0.85);
        c = mix(c, vec3(0.02, 0.02, 0.04) + 0.25 * vec3(0.4, 0.6, 1.0) * step(0.5, h(floor(u * vec2(20.0, 14.0)) + floor(uTime * 2.0))), panel);
        // the signal is lost: static, then a blue NO SIGNAL card
        float st = h(floor(u * vec2(320.0, 180.0)) + fract(uTime * 37.0) * 91.0);
        vec3 snow = vec3(st) * 0.9;
        float lost = smoothstep(0.0, 0.25, uTV);
        c = mix(c, snow, lost * (1.0 - smoothstep(0.8, 1.0, uTV)));
        c = mix(c, vec3(0.05, 0.1, 0.55) + vec3(0.9) * step(abs(u.y - 0.5), 0.06) * step(abs(u.x - 0.5), 0.22) * step(0.5, h(floor(u * vec2(60.0, 10.0)))), smoothstep(0.8, 1.0, uTV));
        // LED pixel grid
        vec2 g = fract(u * vec2(192.0, 108.0));
        c *= 0.6 + 0.4 * smoothstep(0.5, 0.2, length(g - 0.5));
        gl_FragColor = vec4(c * 2.2 * uOn, 1.0);
      }`,
  });
  const screenGeo = new THREE.PlaneGeometry(SCREEN.w, SCREEN.h);
  const screenItems = [{ m: mat(SCREEN.x, SCREEN.y, SCREEN.z, -Math.PI / 2), px: SCREEN.x + 5, pz: SCREEN.z }];
  const screen = placed(scene, screenGeo, screenMat, screenItems, { shadow: false });
  const frameGeo = new THREE.BoxGeometry(0.5, SCREEN.h + 0.6, SCREEN.w + 0.6);
  parts.push(screen, placed(scene, frameGeo, plainMat(0x111214, 0.6), [{ m: mat(SCREEN.x + 0.27, SCREEN.y, SCREEN.z, 0), px: SCREEN.x + 5, pz: SCREEN.z }]));

  // ---------- beacons on the tall towers ----------
  const beacons = B.filter((b) => b.beacon || b.h > 90).map((b) => ({ x: b.x, y: b.h + 2, z: b.z, ph: R() * 2, it: { plate: nearestSeed(b.x, b.z) } }));

  return {
    lights, kioskLit, beacons, TEL, signMat, screenMat,
    frame(v, s, glows, M) {
      for (const p of parts) p.frame(M);
      signMat.uniforms.uOn.value = s.grid;
      signMat.uniforms.uDay.value = 1 - s.dark;
      screenMat.uniforms.uTime.value = v;
      screenMat.uniforms.uTV.value = s.tv;
      screenMat.uniforms.uOn.value = s.grid;
      const on = s.grid * (0.15 + 0.85 * s.dark);
      const at = (l, x, y, z) => (M ? V3.set(x, y, z).applyMatrix4(M[l.it.plate]) : V3.set(x, y, z));
      if (on > 0.01) {
        for (const l of lights) { const p = at(l, l.lx, l.ly, l.lz); glows.add(p.x, p.y, p.z, l.r * 0.75, 2.6 * on, 1.8 * on, 0.95 * on); }
        for (const k of kioskLit) { const p = at(k, k.x, k.y, k.z); glows.add(p.x, p.y, p.z, 2.2, 1.4 * on, 1.1 * on, 0.7 * on); }
      }
      for (const b of beacons) {
        const blink = Math.pow(Math.max(0, Math.sin((v + b.ph) * Math.PI * 0.8)), 6) * s.grid;
        if (blink > 0.02) { const p = at(b, b.x, b.y, b.z); glows.add(p.x, p.y, p.z, 6, 6 * blink, 0.3 * blink, 0.2 * blink); }
      }
    },
  };
}

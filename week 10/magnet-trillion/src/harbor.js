// The harbour: the water (a sum of small waves, the sky in it, the Sun's glitter), the ships and the suspension bridge.
// From 10,000,000x (28.5 s) the ships come: a ship floats, so even a weak pull drags it; then it lifts clear of the water
// (a burst of spray where it was) and flies up the street to the pile, the nearest first. From 100,000,000x (30.8 s)
// the bridge's deck tears off its hangers from the middle of the span outward, piece by piece, and comes; its towers
// lean in toward you.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SHIPS, BRIDGE, QUAY_Z, WATER_Y } from './layout.js';
import { releaseAt } from './timeline.js';
import { flight, flyPose, pileSlot, randQuat } from './fly.js';
import { CU } from './city.js';
import { NOISE_GLSL, stretchy } from './field.js';
import { rng, smooth } from './util.js';

const ni = (g) => g.toNonIndexed();
const box = (w, h, d, x = 0, y = 0, z = 0) => ni(new THREE.BoxGeometry(w, h, d).translate(x, y, z));

export const SHIPF = [];
export const DECK = [];
{
  const R = rng(3131);
  const near = [...SHIPS].sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  near.forEach((s, n) => {
    const d = Math.hypot(s.x, s.z);
    const big = s.kind < 2;
    // (they come down the street and crash at its end, in full view: the big ones across it, the small ones nearer)
    const az = Math.PI + (n % 2 ? 1 : -1) * (0.04 + 0.12 * R()), r = big ? 125 + 45 * (s.kind === 1 ? 0 : 1) : 62 + 30 * R();
    const p1 = new THREE.Vector3(Math.sin(az) * r, big ? 10 + 6 * R() : 3 + 5 * R(), Math.cos(az) * r);
    // (a ship lands tilted, lying across the street, its side to you)
    const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler((R() - 0.5) * 0.5, (R() - 0.5) * 0.5, (R() - 0.5) * 0.7));
    const q0 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw);
    s.f = flight({ p0: new THREE.Vector3(s.x, WATER_Y, s.z), q0, p1, q1, tR: releaseAt('ship', d, 150, 480, 0.2 * R()), acc: big ? 70 : 90, dMin: 2.2, dMax: 3.6, arc: big ? 70 : 25, spin: big ? 0.8 : 2, shake: 1.2, size: big ? 30 : 6 }, R);
    s.drag = 0.9;   // (it's dragged along the water toward you for a moment before it lifts)
  });
  // the deck: 50 m pieces of the span between the towers and the side spans, from the middle out
  const [ta, tb] = BRIDGE.towers;
  for (let x = BRIDGE.x0; x < BRIDGE.x1; x += 50) {
    const cx = x + 25;
    const mid = (ta + tb) / 2;
    const inMain = cx > ta && cx < tb;
    const dm = Math.abs(cx - mid);
    const go = dm < 900;
    const tR = go ? releaseAt('bridge', dm, 0, 900, 0.15 * R()) : 999;
    const p0 = new THREE.Vector3(cx, BRIDGE.y + WATER_Y, BRIDGE.z);
    const p1 = pileSlot(cx, BRIDGE.z, { rMin: 200, rMax: 320, yMin: 10, yMax: 40 }, R);
    DECK.push({ x: cx, inMain, f: go ? flight({ p0, q0: new THREE.Quaternion(), p1, q1: randQuat(R), tR, acc: 260, dMin: 2.4, dMax: 3.4, arc: 60 + 60 * R(), spin: 1 + R(), shake: 0.8, size: 20 }, R) : null });
  }
}
export const towerLean = (v) => 0.12 * smooth(31.5, 35, v);

function shipGeo(s) {
  const L = s.len, B = s.beam, g = [], dk = [], tr = [], life = [], fun = [];
  // hull: a box with a pointed bow (scaled per ship), the waterline at y 0
  const hullShape = new THREE.Shape([[-L / 2, -B / 2], [L / 2 - B * 1.2, -B / 2], [L / 2, 0], [L / 2 - B * 1.2, B / 2], [-L / 2, B / 2]].map(([a, b]) => new THREE.Vector2(a, b)));
  const hullH = s.kind === 0 ? 14 : s.kind === 1 ? 12 : s.kind === 2 ? 4 : 2.2;
  const hull = new THREE.ExtrudeGeometry(hullShape, { depth: hullH + 3, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -3, 0);
  g.push(ni(hull));
  if (s.kind === 0) {
    // the cruise ship: white decks stepping back, balconies (dark bands), a funnel
    for (let k = 0; k < 8; k++) { const l = L * (0.84 - k * 0.012) - (k > 5 ? 40 : 0), w = B * (0.96 - k * 0.01); dk.push(box(l, 3.6, w, -L * 0.06, hullH + 1.8 + k * 3.6, 0)); tr.push(box(l + 0.2, 1.1, w + 0.2, -L * 0.06, hullH + 1.0 + k * 3.6, 0)); }
    // lifeboats (orange) along both sides, a red funnel
    for (let k = 0; k < 14; k++) for (const sz of [-1, 1]) life.push(box(9, 2.6, 3, -L * 0.36 + k * 13, hullH + 2 * 3.6 + 1.3, sz * (B / 2 + 1.2)));
    fun.push(box(18, 12, 10, -L * 0.28, hullH + 8 * 3.6 + 6, 0), box(18.4, 2.5, 10.4, -L * 0.28, hullH + 8 * 3.6 + 11, 0));
  } else if (s.kind === 1) {
    // the container ship: stacks of coloured boxes, the bridge house at the stern
    const C = [0xb23a2a, 0x2a5a9a, 0xd8a030, 0x3a7a4a, 0x7a3a6a, 0xe0e0d8, 0x2a2a2a];
    for (let i = 0; i < 14; i++) for (let j = 0; j < 7; j++) for (let h = 0; h < 4; h++) {
      if ((i * 7 + j * 3 + h) % 9 === 0 && h === 3) continue;
      const bx = box(12, 2.5, 2.4, -L / 2 + 30 + i * 13, hullH + 1.3 + h * 2.6, -B / 2 + 3 + j * 3.9);
      const col = new THREE.Color(C[(i * 5 + j * 3 + h * 7) % C.length]);
      const ca = new Float32Array(bx.attributes.position.count * 3); for (let k = 0; k < ca.length; k += 3) { ca[k] = col.r; ca[k + 1] = col.g; ca[k + 2] = col.b; }
      bx.setAttribute('color', new THREE.BufferAttribute(ca, 3));
      dk.push(bx);
    }
    tr.push(box(12, 18, B * 0.9, -L / 2 + 14, hullH + 9, 0));
  } else if (s.kind === 2) {
    tr.push(box(8, 4, 6, -2, hullH + 2, 0), box(3, 3, 3, -2, hullH + 5.5, 0));
  } else {
    tr.push(box(L * 0.5, 1.6, B * 0.7, -L * 0.05, hullH + 0.8, 0));
    tr.push(ni(new THREE.CylinderGeometry(0.1, 0.12, L * 1.1, 6).translate(L * 0.05, hullH + L * 0.55, 0)));
  }
  return { hull: mergeGeometries(g), decks: dk.length ? mergeGeometries(dk) : null, trim: tr.length ? mergeGeometries(tr) : null, life: life.length ? mergeGeometries(life) : null, fun: fun.length ? mergeGeometries(fun) : null };
}

export function makeHarbor(scene, ctx) {
  // ---- the water ----
  const WU = { uT: { value: 0 }, uSun: CU.uSun, uSkyHi: CU.uSkyHi, uSkyLo: CU.uSkyLo, uSunCol: CU.uSunCol, uHaze: CU.uHaze, uHazeD: CU.uHazeD, uSplash: { value: new THREE.Vector4(0, 0, 0, 0) } };
  const wmat = new THREE.ShaderMaterial({
    uniforms: WU,
    vertexShader: /* glsl */ `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uT; uniform vec3 uSun; uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform vec3 uSunCol; uniform vec3 uHaze; uniform float uHazeD;
      varying vec3 vW;
      ${NOISE_GLSL}
      void main() {
        vec2 p = vW.xz;
        float dist = length(cameraPosition - vW);
        float px = dist * 0.0012;
        // a spectrum of small waves (faded where they'd be smaller than a pixel)
        vec2 g = vec2(0.0);
        for (int i = 0; i < 9; i++) {
          float fi = float(i);
          float k = 0.35 * pow(1.55, fi);
          vec2 d = vec2(cos(fi * 2.39 + 0.4), sin(fi * 2.39 + 0.4));
          float a = 0.16 / pow(1.55, fi) * smoothstep(1.6, 0.4, k * px * 6.0);
          float ph = dot(d, p) * k + uT * sqrt(9.8 * k) + fi * 1.7;
          g += d * cos(ph) * a * k;
        }
        g += (vec2(nn2(p * 0.7 + uT * 0.3), nn2(p * 0.7 - uT * 0.25 + 9.0)) - 0.5) * 0.12 * smoothstep(0.5, 0.05, px);
        vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 V = normalize(vW - cameraPosition);
        vec3 r = reflect(V, N);
        float h = clamp(r.y, 0.0, 1.0);
        vec3 sky = mix(uSkyLo, uSkyHi, pow(smoothstep(0.0, 0.8, h), 0.6));
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
        vec3 deep = vec3(0.02, 0.07, 0.09);
        vec3 col = mix(deep, sky, fres);
        col += uSunCol * 3.5 * pow(max(dot(r, uSun), 0.0), 400.0);
        col = mix(col, uHaze, 1.0 - exp(-dist / uHazeD));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(9000, 4000).rotateX(-Math.PI / 2), wmat);
  water.position.set(0, WATER_Y, QUAY_Z - 2000);
  scene.add(water);
  // the far shore: low green hills
  const hill = new THREE.Mesh(new THREE.PlaneGeometry(9000, 1600, 120, 20).rotateX(-Math.PI / 2), ctx.plainMat(0x5a6a4a, 0.95));
  { const p = hill.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); const e = Math.max(0, (-z + 400) / 800); p.setY(i, e * (60 + 70 * Math.sin(x * 0.002 + 1) + 40 * Math.sin(x * 0.0051))); } hill.geometry.computeVertexNormals(); }
  hill.position.set(0, WATER_Y + 0.3, -3100);
  scene.add(hill);

  // ---- ships ----
  const white = stretchy(ctx.plainMat(0xf2f0ea, 0.5), 'shipw'), hullM = stretchy(ctx.plainMat(0x1d2a3a, 0.6), 'shiph'), red = stretchy(ctx.plainMat(0x8a2a22, 0.6), 'shipr');
  const boxes = stretchy(ctx.plainMat(0xffffff, 0.7, { vertexColors: true }), 'shipc');
  const ships = SHIPS.map((s) => {
    const G = shipGeo(s), grp = new THREE.Group();
    const hm = s.kind === 0 ? hullM : s.kind === 1 ? red : s.kind === 2 ? stretchy(ctx.plainMat(0x2a3a4a, 0.6), 'tug') : white;
    for (const [geo, m] of [[G.hull, hm], [G.decks, s.kind === 1 ? boxes : white], [G.trim, s.kind === 0 ? stretchy(ctx.plainMat(0x2a3440, 0.3, { metalness: 0.3 }), 'shipt') : white], [G.life, stretchy(ctx.plainMat(0xe8701a, 0.6), 'lifeb')], [G.fun, red]]) {
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, m); mesh.castShadow = true; mesh.receiveShadow = true; grp.add(mesh);
    }
    scene.add(grp);
    return { s, grp };
  });

  // ---- the bridge ----
  const bridgeM = stretchy(ctx.plainMat(0xb84a32, 0.6, { metalness: 0.2 }), 'bridge');
  const deckM = stretchy(ctx.plainMat(0x6a6660, 0.7), 'deck');
  const [ta, tb] = BRIDGE.towers;
  const towers = BRIDGE.towers.map((tx) => {
    const g = mergeGeometries([box(9, BRIDGE.th, 9, 0, BRIDGE.th / 2, -14), box(9, BRIDGE.th, 9, 0, BRIDGE.th / 2, 14), box(8, 8, 28, 0, BRIDGE.th - 4, 0), box(8, 7, 28, 0, BRIDGE.th * 0.62, 0), box(8, 6, 28, 0, BRIDGE.y - 4, 0)]);
    const m = new THREE.Mesh(g, bridgeM); m.position.set(tx, WATER_Y, BRIDGE.z); m.castShadow = true; scene.add(m); return m;
  });
  const deckGeo = mergeGeometries([box(50, 2.5, 26, 0, 0, 0), box(50, 4, 1.2, 0, -3, -12.5), box(50, 4, 1.2, 0, -3, 12.5)]);
  const decks = new THREE.InstancedMesh(deckGeo, deckM, DECK.length);
  decks.castShadow = true; decks.frustumCulled = false; scene.add(decks);
  // main cables: catenaries between the towers, and down to the anchorages; hangers every 25 m
  const cablePts = (z) => {
    const pts = [];
    const span = (x0, x1, y0, y1, sag) => { for (let k = 0; k <= 40; k++) { const u = k / 40, x = x0 + (x1 - x0) * u; pts.push(new THREE.Vector3(x, y0 + (y1 - y0) * u - sag * 4 * u * (1 - u), z)); } };
    span(BRIDGE.x0 + 600, ta, BRIDGE.y + 5, BRIDGE.th, 30); span(ta, tb, BRIDGE.th, BRIDGE.th, BRIDGE.th - BRIDGE.y - 6); span(tb, BRIDGE.x1 - 600, BRIDGE.th, BRIDGE.y + 5, 30);
    return pts;
  };
  const cableY = (x) => { const u = (x - ta) / (tb - ta); return BRIDGE.th - (BRIDGE.th - BRIDGE.y - 6) * 4 * u * (1 - u); };
  const cables = [-14, 14].map((z) => { const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cablePts(z)), 240, 0.9, 6), bridgeM); m.position.y = WATER_Y; scene.add(m); return m; });
  const HANG = [];
  for (let x = ta + 25; x < tb; x += 25) for (const z of [-14, 14]) HANG.push({ x, z });
  const hangers = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.25, 1, 4).translate(0, 0.5, 0), bridgeM, HANG.length);
  hangers.frustumCulled = false; scene.add(hangers);

  // ---- spray where the ships lift out ----
  const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    frame(v, smoke) {
      WU.uT.value = v;
      for (const { s, grp } of ships) {
        const f = s.f;
        if (v < f.tR) {
          // rocking at its mooring; dragged toward you through the water for the last moment
          const k = smooth(f.tR - s.drag, f.tR, v);
          grp.position.set(s.x - s.x * 0.02 * k, WATER_Y + 0.15 * Math.sin(v * 0.9 + s.x) + 0.0, s.z - s.z * 0.03 * k);
          grp.quaternion.copy(f.q0);
          f.p0.copy(grp.position);
        } else {
          flyPose(f, v, pos, q); grp.position.copy(pos); grp.quaternion.copy(q);
          // the spray: a burst where it left the water
          const a = v - f.tR;
          if (a < 5) for (let k = 0; k < 10; k++) {
            const fx = (k / 9 - 0.5) * s.len * 0.8, ang = s.yaw;
            smoke.puff(s.x + Math.cos(ang) * fx, WATER_Y + 4 + a * (6 + k % 3 * 3) - 1.5 * a * a, s.z - Math.sin(ang) * fx, (s.kind < 2 ? 14 : 5) * (0.6 + 0.35 * a), 0.5 * smooth(0, 0.3, a) * (1 - smooth(2.5, 5, a)), 0.95, 0, (k * 0.37) % 1);
          }
        }
      }
      // the bridge: towers lean in; the deck pieces come; the hangers go with them
      towers.forEach((t) => { t.rotation.x = towerLean(v); });
      DECK.forEach((d, i) => {
        if (!d.f) { decks.setMatrixAt(i, m4.compose(pos.set(d.x, BRIDGE.y + WATER_Y, BRIDGE.z), q.identity(), sc.set(1, 1, 1))); return; }
        flyPose(d.f, v, pos, q);
        decks.setMatrixAt(i, m4.compose(pos, q, sc.set(1, 1, 1)));
      });
      decks.instanceMatrix.needsUpdate = true;
      HANG.forEach((h, i) => {
        const d = DECK.find((dd) => Math.abs(dd.x - h.x) < 25.01);
        if (d && d.f && v > d.f.tR) { hangers.setMatrixAt(i, zero); return; }
        const y0 = BRIDGE.y + WATER_Y + 1, y1 = cableY(h.x) + WATER_Y;
        hangers.setMatrixAt(i, m4.compose(pos.set(h.x, y0, BRIDGE.z + h.z), q.identity(), sc.set(1, y1 - y0, 1)));
      });
      hangers.instanceMatrix.needsUpdate = true;
      cables.forEach((c) => { c.rotation.x = 0; });
    },
  };
}

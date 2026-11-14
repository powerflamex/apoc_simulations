// The tower crane on the north-west corner's building site: a yellow lattice mast 64 m high, its jib reaching out over
// the intersection, a counter-jib with concrete weights, the operator's cab at the top. At frame 0 it is mid-lift: a
// bundle of steel beams rising on the hook over the street while the jib slews round. When the operator vanishes the
// hoist brake holds the load where it is, the slewing jib coasts to a stop, and the load, still moving, swings on its
// 30 m of cable over the people below (a slow pendulum; it also turns on the hook).
import * as THREE from 'three';
import { CRANE } from './layout.js';
import { V_EVENT, V_NIGHT1 } from './timeline.js';
import { smooth } from './util.js';

// lattice: steel members on every face of a box (chords on the edges, a zigzag of braces), the rest cut away
function latticeMat(color) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.3, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLP; varying vec3 vLN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLP = position; vLN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLP; varying vec3 vLN;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        {
          vec3 n = abs(vLN);
          // the face's own 2D coords in metres, and its size (from the box's half extents passed in via the edges)
          vec2 c = n.x > 0.5 ? vLP.zy : n.y > 0.5 ? vLP.xz : vLP.xy;
          vec2 e = n.x > 0.5 ? vec2(uHalf.z, uHalf.y) : n.y > 0.5 ? vec2(uHalf.x, uHalf.z) : vec2(uHalf.x, uHalf.y);
          vec2 d = e - abs(c);                                  // distance to the face's edges
          float bay = uBay;
          // braces run along the long side
          bool longY = e.y >= e.x;
          float along = longY ? c.y : c.x, across = longY ? c.x : c.y, w = longY ? e.x : e.y;
          float fa = fract(along / bay + 0.5);
          float diag = abs((across / (2.0 * w) + 0.5) - (fa < 0.5 ? fa * 2.0 : 2.0 - fa * 2.0));
          float th = 0.09;
          float pw = fwidth(along) * 1.2;
          bool chord = min(d.x, d.y) < 0.13 + pw;
          bool brace = diag * 2.0 * w < th + pw * 1.5;
          bool strut = abs(fract(along / bay) - 0.5) * bay > bay * 0.5 - 0.06 - pw;
          if (!chord && !brace && !strut) discard;
        }`)
      .replace('void main() {', 'uniform vec3 uHalf; uniform float uBay;\nvoid main() {');
    sh.uniforms.uHalf = m.userData.uHalf; sh.uniforms.uBay = m.userData.uBay;
  };
  return m;
}
function latticeBox(w, h, d, color, bay = 2.0) {
  const mat = latticeMat(color);
  mat.userData.uHalf = { value: new THREE.Vector3(w / 2, h / 2, d / 2) };
  mat.userData.uBay = { value: bay };
  mat.customProgramCacheKey = () => 'lattice-v1';
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}

export function makeCrane(scene, ctx) {
  const Y = 0xf0b818;
  const g = new THREE.Group();
  g.position.set(CRANE.x, 0, CRANE.z);
  const mast = latticeBox(2.0, CRANE.h, 2.0, Y);
  mast.position.y = CRANE.h / 2;
  g.add(mast);
  // the slewing top: jib, counter-jib, cab, the A-frame and its ties
  const top = new THREE.Group();
  top.position.y = CRANE.h;
  g.add(top);
  const jib = latticeBox(CRANE.jib, 1.8, 1.6, Y, 2.4);
  jib.position.set(CRANE.jib / 2 + 1, 0.9, 0);
  const cjib = latticeBox(CRANE.cjib, 1.0, 2.2, Y, 2.4);
  cjib.position.set(-CRANE.cjib / 2 - 1, 0.5, 0);
  const apex = latticeBox(1.4, 9, 1.4, Y, 1.8);
  apex.position.set(0, 4.5 + 1.8, 0);
  const weights = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.6, 2.6), ctx.plainMat(0x8e8a82, 0.9));
  weights.position.set(-CRANE.cjib + 1.2, -0.3, 0);
  // the operator's cab: a glass box hung beside the jib's root (front and floor glass to look down at the load), a seat
  // between two control consoles with joysticks, a small screen. On the seat and the floor: what he was wearing (a hi-vis
  // vest, jeans, boots) and his hard hat.
  const cab = new THREE.Group();
  cab.position.set(1.6, -1.6, 1.9);
  {
    const W = 2.4, Hh = 2.6, D = 2.2;
    const white = ctx.plainMat(0xe8e4dc, 0.5), dark = ctx.plainMat(0x2a2c30, 0.6), grey = ctx.plainMat(0x55585e, 0.6);
    const glass = new THREE.MeshStandardMaterial({ color: 0x9ab8d0, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });
    const box = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; cab.add(b); return b; };
    box(W, 0.08, D, 0, -Hh / 2, 0, dark);                                         // floor
    box(W, 0.1, D, 0, Hh / 2, 0, white);                                          // roof
    box(0.08, Hh, D, -W / 2, 0, 0, white);                                        // back wall
    for (const sz of [-1, 1]) box(W, Hh * 0.38, 0.06, 0, -Hh / 2 + Hh * 0.19, sz * D / 2, white);   // lower side walls
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.08, Hh, 0.08, sx * W / 2, 0, sz * D / 2, white);   // corner posts
    box(0.08, 0.08, D, W / 2, -0.15, 0, white);                                   // the front glass's cross bar
    // glass: front, the upper sides, the front half of the floor
    const gl = (w, h, d, x, y, z) => { const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glass); g.position.set(x, y, z); g.renderOrder = 2; cab.add(g); };
    gl(0.02, Hh - 0.1, D - 0.1, W / 2, 0, 0);
    for (const sz of [-1, 1]) gl(W - 0.1, Hh * 0.6, 0.02, 0, Hh * 0.18, sz * D / 2);
    // seat: base, cushion, back, headrest
    box(0.5, 0.45, 0.5, -0.25, -Hh / 2 + 0.25, 0, grey);
    box(0.55, 0.12, 0.55, -0.25, -Hh / 2 + 0.53, 0, dark);
    box(0.12, 0.75, 0.55, -0.55, -Hh / 2 + 0.95, 0, dark);
    box(0.1, 0.22, 0.32, -0.57, -Hh / 2 + 1.45, 0, dark);
    // consoles with joysticks either side; a small screen on a stalk
    for (const sz of [-1, 1]) {
      box(0.6, 0.55, 0.22, -0.15, -Hh / 2 + 0.55, sz * 0.42, grey);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 8), dark); st.position.set(0.02, -Hh / 2 + 0.93, sz * 0.42); st.rotation.z = -0.2; cab.add(st);
      const kn = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), ctx.plainMat(0xc02a1a, 0.4)); kn.position.set(0.04, -Hh / 2 + 1.05, sz * 0.42); cab.add(kn);
    }
    const scr = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.9, 0.6) }));
    scr.position.set(0.55, -Hh / 2 + 1.15, 0.35); scr.rotation.y = 0.3; cab.add(scr);
    // his clothes: the vest slumped on the cushion and over the back, jeans fallen in front of the seat, boots, hard hat
    const lumpy = (w, h, d, seed) => {
      const g = new THREE.BoxGeometry(w, h, d, 5, 3, 5); const a = g.attributes.position;
      for (let i = 0; i < a.count; i++) { const x = a.getX(i), y = a.getY(i), z = a.getZ(i); const k = 1 + 0.14 * Math.sin(x * 19 + seed) * Math.sin(z * 15 + seed * 2) + 0.08 * Math.sin(y * 23 + x * 7); a.setXYZ(i, x * k, y * k, z * k); }
      g.computeVertexNormals(); return g;
    };
    const vest = new THREE.Mesh(lumpy(0.42, 0.1, 0.5, 1), ctx.plainMat(0xe8e020, 0.7)); vest.position.set(-0.22, -Hh / 2 + 0.64, 0); vest.rotation.set(0.1, 0.3, 0.12); cab.add(vest);
    const vest2 = new THREE.Mesh(lumpy(0.1, 0.4, 0.46, 2), ctx.plainMat(0xe8e020, 0.7)); vest2.position.set(-0.47, -Hh / 2 + 0.88, 0.02); cab.add(vest2);
    for (const k of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.025, 0.05), ctx.plainMat(0xd8dde0, 0.3)); st.position.set(-0.22, -Hh / 2 + 0.7, k * 0.12); st.rotation.y = 0.3; cab.add(st); }   // (reflective stripes)
    const jeans = new THREE.Mesh(lumpy(0.55, 0.1, 0.32, 3), ctx.plainMat(0x34507a, 0.85)); jeans.position.set(0.22, -Hh / 2 + 0.1, 0.05); jeans.rotation.y = -0.4; cab.add(jeans);
    for (const k of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.12), ctx.plainMat(0x4a3018, 0.7)); b.position.set(0.05, -Hh / 2 + 0.12, k * 0.12); b.rotation.y = k * 0.25; cab.add(b); }
    const hat = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), ctx.plainMat(0xf0f0ec, 0.4)); hat.position.set(-0.15, -Hh / 2 + 0.83, -0.42); hat.rotation.z = 0.5; cab.add(hat);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.015, 16), ctx.plainMat(0xf0f0ec, 0.4)); brim.position.copy(hat.position); brim.rotation.z = 0.5; cab.add(brim);
  }
  top.add(cab);
  // ties from the apex out along the jib and back along the counter-jib
  const tie = (x1, y1) => {
    const L = Math.hypot(x1, y1 - 10.6);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, L, 5), ctx.plainMat(0x404040, 0.5));
    m.position.set(x1 / 2, (10.6 + y1) / 2, 0);
    m.rotation.z = Math.atan2(x1, 10.6 - y1);
    return m;
  };
  for (const m of [jib, cjib, apex, weights, tie(CRANE.jib * 0.62, 1.8), tie(-CRANE.cjib + 1, 1.0)]) { m.castShadow = true; top.add(m); }
  // trolley, cable, hook block, the load (six steel I-beams on two slings)
  const trolley = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 2.0), ctx.plainMat(0x303030, 0.6));
  top.add(trolley);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 5).translate(0, -0.5, 0), ctx.plainMat(0x222222, 0.5));
  scene.add(cable);
  const load = new THREE.Group();
  {
    const hook = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.2, 0.5), ctx.plainMat(0xd84a1a, 0.5));
    hook.position.y = -0.6;
    load.add(hook);
    const beamMat = ctx.plainMat(0x7a3a26, 0.6, { metalness: 0.4 });
    for (let k = 0; k < 6; k++) {
      const b = new THREE.Group();
      const web = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.4, 9.0), beamMat);
      const f1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 9.0), beamMat); f1.position.y = 0.2;
      const f2 = f1.clone(); f2.position.y = -0.2;
      b.add(web, f1, f2);
      b.position.set((k % 3 - 1) * 0.36, -5.2 - Math.floor(k / 3) * 0.42, 0);
      load.add(b);
    }
    for (const sd of [-1, 1]) {
      const L = Math.hypot(3.6, 4.0);
      const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, L, 4), ctx.plainMat(0x222222, 0.5));
      sl.position.set(0, -1.2 - 2.0, sd * 1.8);
      sl.rotation.x = -sd * Math.atan2(3.6, 4.0);
      load.add(sl);
    }
    load.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }
  scene.add(load);
  scene.add(g);

  // the motion: slew angle (rad, 0 = jib pointing +x), trolley radius, hook height
  const R_TROL = 40;
  const SLEW0 = Math.atan2(-(-24 - CRANE.z), -6 - CRANE.x);   // (the jib's bearing toward a point over the intersection)
  const W0 = 0.045;                                         // slew rate at frame 0 (rad/s)
  const slewAt = (v) => {
    const t = v - V_EVENT;
    if (t < 0) return SLEW0 + W0 * t;
    const T = 3.2;                                          // the brakes ease it to a stop
    const u = Math.min(t, T);
    return SLEW0 + W0 * (u - u * u / (2 * T));
  };
  const hookY0 = 30, HOIST = 0.9;                          // rising at 0.9 m/s
  const hookYAt = (v) => (v < V_EVENT ? hookY0 + HOIST * (v - V_EVENT) : hookY0 + 0.25 * Math.sin((v - V_EVENT) * 9) * Math.exp(-(v - V_EVENT) * 1.5));
  const tmp = new THREE.Vector3();
  return {
    group: g,
    frame(v, s) {
      // (a year later: the crane is still there but the load is gone; in 2046 the tower is finished and the crane gone)
      // (day 0: live; from then on the load hangs still where it stopped; in the months after it's gone)
      g.visible = true;
      const era1 = s.era > 0;
      const live = v < V_NIGHT1, vl = live ? v : 60;
      const sl = era1 ? SLEW0 - 0.6 : slewAt(vl);
      top.rotation.y = sl;
      const tx = Math.cos(sl) * R_TROL, tz = -Math.sin(sl) * R_TROL;
      trolley.position.set(R_TROL + 1, -0.4, 0);
      const hy = era1 ? CRANE.h - 4 : hookYAt(vl);
      // the swing: the load carries on round as the jib stops, and swings back and forth on the cable
      const Lc = CRANE.h - hy, w = Math.sqrt(9.8 / Lc), t = Math.max(0, v - V_EVENT);
      const amp = W0 * R_TROL / w;                          // (from its speed when the jib stops)
      const sw = v < V_EVENT || !live ? 0 : amp * Math.sin(w * t) * Math.exp(-0.02 * t);
      const tang = [-Math.sin(sl), -Math.cos(sl)];          // the way the jib was turning
      const hx = CRANE.x + tx + tang[0] * sw, hz = CRANE.z + tz + tang[1] * sw;
      load.visible = cable.visible = !era1;
      load.position.set(hx, hy, hz);
      load.rotation.set(0, sl + 0.3 + (v > V_EVENT ? 0.25 * Math.sin(Math.min(t, 2.6) * 0.35) : 0), sw * 0.012);
      const topX = CRANE.x + tx, topZ = CRANE.z + tz, topY = CRANE.h - 0.7;
      tmp.set(hx - topX, hy - topY, hz - topZ);
      const L = tmp.length();
      cable.position.set(topX, topY, topZ);
      cable.scale.set(1, L, 1);
      cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), tmp.normalize());
    },
    loadPos: () => load.position,
    // a point given in the cab's own frame (x: forward along the jib, y: up, z: across), in the world
    cabPoint: (x, y, z) => { g.updateMatrixWorld(true); return cab.localToWorld(new THREE.Vector3(x, y, z)); },
  };
}

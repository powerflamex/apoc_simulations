// The park: the ground (one fine grid painted in the shader: the court with its lines, the apron, grass, the plaza's
// paving, the sidewalks, the street with its markings), the far hoop on its post, the fountain's basin, the street
// lamps and the benches. frame(key, tt) poses the hoop and the lamps for one stop (the Sun folds and bends them).
// The white dwarf cracks the ground into plates with glowing seams (uCrack, uPlate); the neutron star turns it into
// one smooth glowing film (uFilm + the heat glow from heat.js).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { H, HEAT_GLSL, patchHeat } from './heat.js';
import { COURT, HOOP, BOARD, POLE, APRON, Z, FOUNTAIN, LAMPS, BENCHES } from './layout.js';
import { smooth, clamp } from './util.js';
import { SUN_HOOP, SUN_BOARD_HIT, SUN_LAMPS } from './sched.js';

export const GU = {
  uCrack: { value: 0 }, uCrackR: { value: 0 }, uCrackGlow: { value: 0 }, uPlate: { value: 0 }, uFilm: { value: 0 }, uWet: { value: 0 },
  uCam: { value: new THREE.Vector2() }, uTime: { value: 0 },
};
const L = { cx: (HOOP.x).toFixed(3), z0: COURT.z0.toFixed(3), z1: COURT.z1.toFixed(3), x0: COURT.x0.toFixed(3), x1: COURT.x1.toFixed(3), ap: APRON.toFixed(2) };

const GROUND_GLSL = /* glsl */ `
uniform float uCrack; uniform float uCrackR; uniform float uCrackGlow; uniform float uPlate; uniform float uFilm; uniform float uWet; uniform vec2 uCam; uniform float uTime;
float g21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(g21(i), g21(i+vec2(1,0)), f.x), mix(g21(i+vec2(0,1)), g21(i+vec2(1,1)), f.x), f.y); }
// plates: the nearest cell point (id) and the gap to the next (F2 - F1)
vec3 plates(vec2 p) {
  vec2 i = floor(p); float d1 = 9.0, d2 = 9.0; vec2 id = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 c = i + vec2(float(x), float(y));
    vec2 q = c + vec2(g21(c), g21(c + 7.3)) * 0.9 + 0.05;
    float d = length(p - q);
    if (d < d1) { d2 = d1; d1 = d; id = c; } else if (d < d2) d2 = d;
  }
  return vec3(id, d2 - d1);
}
`;

function groundMat() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, GU, H);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWP;\n${GROUND_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          // the white dwarf: plates of crust tilt and drop a little (each its own way), the seams between them open
          vec3 pl = plates(position.xz / 3.2);
          float h = g21(pl.xy + 3.1), h2 = g21(pl.xy + 9.7);
          float on = uPlate * smoothstep(uCrackR + 2.0, uCrackR - 2.0, length(position.xz - uCam));
          transformed.y += on * (-0.06 - 0.16 * h + 0.05 * (h2 - 0.5) * (position.x - pl.x * 3.2));
          transformed.y -= on * 0.25 * smoothstep(0.08, 0.0, pl.z);
        }`)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${HEAT_GLSL}\nvarying vec3 vWP;\n${GROUND_GLSL}
        float lineD(float d, float w) { float fw = max(fwidth(d), 1e-4); return 1.0 - smoothstep(w * 0.5 - fw, w * 0.5 + fw, abs(d)); }
        float boxIn(vec2 p, vec2 a, vec2 b) { return step(a.x, p.x) * step(p.x, b.x) * step(a.y, p.y) * step(p.y, b.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 p = vWP.xz;
          float n1 = gn(p * 0.35), n2 = gn(p * 2.3), n3 = gn(p * 11.0);
          // grass
          vec3 c = mix(vec3(0.2, 0.36, 0.11), vec3(0.3, 0.46, 0.16), n1) * (0.85 + 0.25 * n2) * (0.9 + 0.15 * n3);
          float rough = 0.95;
          // the plaza: warm stone flags
          if (p.y < ${L.z0} - ${L.ap} + 0.001 && p.y > ${Z.plaza1.toFixed(2)}) {
            vec2 t = p / vec2(0.9, 0.6); vec2 tf = fract(t + vec2(0.5 * step(0.5, fract(floor(t.y) * 0.5)), 0.0));
            float j = max(lineD(tf.x - 0.5, 0.95) * 0.0, 0.0) + (1.0 - smoothstep(0.0, 0.04, min(min(tf.x, 1.0 - tf.x), min(tf.y, 1.0 - tf.y))));
            c = mix(vec3(0.72, 0.66, 0.57), vec3(0.8, 0.75, 0.66), g21(floor(t))) * (0.92 + 0.12 * n2);
            c *= 1.0 - 0.35 * j; rough = 0.85;
          }
          // the near sidewalk, the kerb, the street, the far sidewalk
          if (p.y <= ${Z.plaza1.toFixed(2)}) {
            vec2 t = p / 1.5; vec2 tf = fract(t);
            float j = 1.0 - smoothstep(0.0, 0.02, min(min(tf.x, 1.0 - tf.x), min(tf.y, 1.0 - tf.y)));
            c = vec3(0.64, 0.63, 0.6) * (0.92 + 0.12 * n2) * (1.0 - 0.3 * j); rough = 0.9;
            if (p.y < ${Z.walk1.toFixed(2)} + 0.25) c = vec3(0.56, 0.55, 0.53) * (0.95 + 0.1 * n3);
            if (p.y < ${Z.walk1.toFixed(2)} && p.y > ${Z.street1.toFixed(2)}) {
              c = vec3(0.15, 0.15, 0.16) * (0.85 + 0.3 * n2) * (0.9 + 0.2 * n3); rough = 0.85;
              float yl = max(lineD(p.y - (${Z.lane.toFixed(2)} + 0.09), 0.11), lineD(p.y - (${Z.lane.toFixed(2)} - 0.09), 0.11));
              c = mix(c, vec3(0.85, 0.66, 0.12), yl);
              float wl = max(lineD(p.y - ${Z.park1.toFixed(2)}, 0.1), lineD(p.y - ${Z.park2.toFixed(2)}, 0.1));
              wl = max(wl, lineD(p.y - (${Z.park1.toFixed(2)} + ${Z.lane.toFixed(2)}) * 0.5, 0.12) * step(0.5, fract(p.x / 6.0)));
              wl = max(wl, lineD(p.y - (${Z.park2.toFixed(2)} + ${Z.lane.toFixed(2)}) * 0.5, 0.12) * step(0.5, fract(p.x / 6.0 + 0.3)));
              c = mix(c, vec3(0.82, 0.82, 0.8), wl * 0.9);
            }
            if (p.y <= ${Z.street1.toFixed(2)} && p.y > ${Z.street1.toFixed(2)} - 0.25) c = vec3(0.56, 0.55, 0.53);
          }
          // the court: blue, the key red, green apron round it, white lines
          vec2 q = vec2(p.x - ${L.cx}, min(p.y - (${L.z0}), (${L.z1}) - p.y));     // across, in from the nearer baseline
          float inApron = boxIn(p, vec2(${L.x0} - ${L.ap}, ${L.z0} - ${L.ap}), vec2(${L.x1} + ${L.ap}, ${L.z1} + ${L.ap}));
          float inCourt = boxIn(p, vec2(${L.x0}, ${L.z0}), vec2(${L.x1}, ${L.z1}));
          if (inApron > 0.5) {
            c = vec3(0.16, 0.42, 0.28) * (0.94 + 0.1 * n2); rough = 0.7;
            if (inCourt > 0.5) {
              c = vec3(0.12, 0.29, 0.6) * (0.95 + 0.08 * n2);
              if (abs(q.x) < 2.45 && q.y < 5.8) c = vec3(0.74, 0.22, 0.14) * (0.95 + 0.08 * n2);
              if (length(vec2(q.x, q.y - 14.0)) < 1.8) c = vec3(0.74, 0.22, 0.14) * (0.95 + 0.08 * n2);
            }
            // scuffs
            c *= 0.93 + 0.1 * gn(p * 0.8) ;
            float ln = 0.0;
            ln = max(ln, lineD(p.x - (${L.x0}), 0.05) * step(${L.z0}, p.y) * step(p.y, ${L.z1}));
            ln = max(ln, lineD(p.x - (${L.x1}), 0.05) * step(${L.z0}, p.y) * step(p.y, ${L.z1}));
            ln = max(ln, lineD(q.y, 0.05) * step(abs(q.x), 7.5));
            ln = max(ln, lineD(q.y - 14.0, 0.05) * step(abs(q.x), 7.5));
            ln = max(ln, lineD(length(vec2(q.x, q.y - 14.0)) - 1.8, 0.05));
            ln = max(ln, lineD(abs(q.x) - 2.45, 0.05) * step(q.y, 5.8));
            ln = max(ln, lineD(q.y - 5.8, 0.05) * step(abs(q.x), 2.45));
            ln = max(ln, lineD(length(vec2(q.x, q.y - 5.8)) - 1.8, 0.05) * step(5.8, q.y));
            ln = max(ln, lineD(abs(q.x) - 6.6, 0.05) * step(q.y, 2.99));
            ln = max(ln, lineD(length(vec2(q.x, q.y - 1.575)) - 6.75, 0.05) * step(2.99, q.y));
            ln = max(ln, lineD(length(vec2(q.x, q.y - 1.575)) - 1.25, 0.05) * step(1.575, q.y));
            c = mix(c, vec3(0.93, 0.93, 0.9), ln * inApron);
          }
          // wet where the fountain's water lands (the Moon, Pluto)
          float wet = uWet * smoothstep(14.0, 4.0, length(p - vec2(${FOUNTAIN.x.toFixed(2)}, ${FOUNTAIN.z.toFixed(2)})));
          c *= 1.0 - 0.35 * wet; rough = mix(rough, 0.25, wet);
          // the white dwarf: plates and their seams; the neutron star: one smooth film
          vec3 pl = plates(p / 3.2);
          float reach = smoothstep(uCrackR + 1.5, uCrackR - 1.5, length(p - uCam));
          float seamMask = smoothstep(0.35, 0.6, gn(pl.xy * 0.7 + 4.0) + 0.25 * gn(p * 0.4));
          float seam = (1.0 - smoothstep(0.0, 0.045 + 0.06 * g21(pl.xy), pl.z)) * uCrack * reach * seamMask;
          c = mix(c, vec3(0.05, 0.03, 0.02), seam);
          c *= 1.0 - 0.15 * uPlate * reach * (g21(pl.xy + 3.1) - 0.3);
          c = mix(c, vec3(dot(c, vec3(0.3, 0.5, 0.2))) * 0.45 + vec3(0.05, 0.03, 0.02), uFilm);
          diffuseColor.rgb = c;
          vec3 seamGlow = vec3(1.0, 0.32, 0.06) * seam * uCrackGlow * (0.6 + 0.8 * gn(p * 1.3 + uTime));
          float rk = mix(rough, 0.3, uFilm);
          diffuseColor.a = 1.0;
          gl_FragColor = vec4(0.0);
          // (the glow is added after the lights: see emissivemap)
          vGlowAdd = seamGlow;
          vRough = rk;
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vRough;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float n = gn(vWP.xz * 0.6 + uTime * 0.2) * 0.6 + gn(vWP.xz * 3.0) * 0.4;
          float Tg = uAmbK * (0.88 + 0.22 * n);
          totalEmissiveRadiance += vGlowAdd + heatGlow(Tg) * uGlowGain;
        }`)
      .replace('void main() {', 'vec3 vGlowAdd; float vRough;\nvoid main() {');
  };
  mat.customProgramCacheKey = () => 'park-ground';
  return mat;
}

// a canvas texture for the backboard: white, an orange border and target square
function boardTex() {
  const c = document.createElement('canvas'); c.width = 360; c.height = 210;
  const x = c.getContext('2d');
  x.fillStyle = '#f4f4f0'; x.fillRect(0, 0, 360, 210);
  x.strokeStyle = '#e2541c'; x.lineWidth = 10; x.strokeRect(5, 5, 350, 200);
  x.lineWidth = 9; x.strokeRect(121, 92, 118, 92);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function makePark(scene, { plainMat, shadowy }) {
  // ---- the ground ----
  const gGeo = new THREE.PlaneGeometry(170, 120, 510, 360).rotateX(-Math.PI / 2).translate(0, 0, -45);
  const ground = new THREE.Mesh(gGeo, groundMat());
  ground.receiveShadow = true; ground.frustumCulled = false;
  scene.add(ground);
  // beyond it, a plain far plane (behind the buildings, under the sky's haze)
  const far = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2).translate(0, -3, -1900), new THREE.MeshStandardMaterial({ color: 0x55574f, roughness: 0.95 }));   // (not squashed: it sits under everything)
  scene.add(far);

  // ---- the far hoop: the lower post, then everything above the kink in one group that can fold forward ----
  const steel = plainMat(0x2d3a4c, 0.45, { metalness: 0.5 });
  const KINK = 1.15;
  const post = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.17, KINK, 0.17).translate(0, KINK / 2, 0), steel));
  post.position.set(POLE.x, 0, POLE.z);
  const pad = shadowy(new THREE.Mesh(new RoundedBoxGeometry(0.3, 1.0, 0.3, 2, 0.04).translate(0, 0.55, 0), plainMat(0x1b4fa8, 0.7)));
  pad.position.set(POLE.x, 0, POLE.z);
  scene.add(post, pad);
  const top = new THREE.Group();
  top.position.set(POLE.x, KINK, POLE.z);
  scene.add(top);
  const addTop = (geo, mat, x, y, z) => { const m = shadowy(new THREE.Mesh(geo, mat)); m.position.set(x, y - KINK, z - POLE.z); top.add(m); return m; };
  addTop(new THREE.BoxGeometry(0.17, POLE.top - KINK, 0.17).translate(0, (POLE.top - KINK) / 2, 0), steel, 0, KINK, POLE.z);
  const armL = (BOARD.z - 0.08) - POLE.z;
  addTop(new THREE.BoxGeometry(0.12, 0.12, armL).translate(0, 0, armL / 2), steel, 0, POLE.top - 0.05, POLE.z);
  // a brace from the post to the arm
  { const g = new THREE.BoxGeometry(0.08, 0.08, 1.35); const m = addTop(g, steel, 0, POLE.top - 0.42, POLE.z + 0.6); m.rotation.x = -0.52; }
  const board = addTop(new THREE.BoxGeometry(BOARD.w, BOARD.y1 - BOARD.y0, 0.04), [steel, steel, steel, steel, patchHeat(new THREE.MeshStandardMaterial({ map: boardTex(), roughness: 0.4 }), 'board'), steel], 0, (BOARD.y0 + BOARD.y1) / 2, BOARD.z - 0.02);
  const orange = plainMat(0xe0521a, 0.4, { metalness: 0.3 });
  addTop(new THREE.TorusGeometry(HOOP.r, 0.011, 8, 40).rotateX(Math.PI / 2), orange, 0, HOOP.y, HOOP.z);
  addTop(new THREE.BoxGeometry(0.16, 0.03, 0.17), orange, 0, HOOP.y - 0.01, BOARD.z + 0.08);
  // the net: an open cone, its mesh drawn in the shader
  const netMat = patchHeat(new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.9, side: THREE.DoubleSide, alphaTest: 0.5, transparent: false }), 'net');
  const netPrev = netMat.onBeforeCompile;
  netMat.onBeforeCompile = (sh) => {
    netPrev(sh);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vNu;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvNu = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vNu;').replace('#include <alphatest_fragment>', `
      { vec2 a = vec2(vNu.x * 12.0 + vNu.y * 2.2, vNu.x * 12.0 - vNu.y * 2.2); vec2 f = abs(fract(a) - 0.5);
        float k = 1.0 - smoothstep(0.05, 0.12, min(f.x, f.y)); if (k < 0.5 && vNu.y < 0.97) discard; }`);
  };
  const net = addTop(new THREE.CylinderGeometry(HOOP.r, 0.15, 0.42, 24, 1, true).translate(0, -0.21, 0), netMat, 0, HOOP.y, HOOP.z);
  net.castShadow = false;
  // the angle at which the folding top's lowest point (the board's near bottom corner) meets the ground
  const pts = [[BOARD.y0 - KINK, BOARD.z - POLE.z + 0.02], [BOARD.y1 - KINK, BOARD.z - POLE.z + 0.02], [HOOP.y - 0.45 - KINK, HOOP.z - POLE.z]];
  let thMax = 0;
  for (let th = 0; th < 1.6; th += 0.002) {
    const low = Math.min(...pts.map(([y, z]) => KINK + y * Math.cos(th) - z * Math.sin(th)));
    if (low <= 0.06) { thMax = th; break; }
  }
  // the board's centre in the top group's frame (for the glass bursting where it lands)
  const boardC = new THREE.Vector3(0, (BOARD.y0 + BOARD.y1) / 2 - KINK, BOARD.z - POLE.z);

  // ---- the fountain: a round stone basin, its water, a pedestal with a bowl ----
  const stone = plainMat(0xb9b0a0, 0.85);
  const F = FOUNTAIN;
  const rim = shadowy(new THREE.Mesh(new THREE.LatheGeometry([[F.r - 0.32, 0], [F.r - 0.32, F.rim], [F.r - 0.28, F.rim + 0.03], [F.r + 0.02, F.rim + 0.03], [F.r + 0.06, F.rim], [F.r + 0.06, 0]].map(([r, y]) => new THREE.Vector2(r, y)), 64), stone));
  rim.position.set(F.x, 0, F.z);
  const waterMat = patchHeat(new THREE.MeshStandardMaterial({ color: 0x1f5a6a, roughness: 0.06, metalness: 0.2 }), 'water');
  const water = new THREE.Mesh(new THREE.CircleGeometry(F.r - 0.3, 48).rotateX(-Math.PI / 2), waterMat);
  water.position.set(F.x, F.water, F.z); water.receiveShadow = true;
  const ped = shadowy(new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.42, 0], [0.32, 0.25], [0.26, 0.85], [0.9, 1.0], [1.02, 1.12], [0.95, 1.16], [0.2, 1.1], [0.1, 1.28], [0, 1.3]].map(([r, y]) => new THREE.Vector2(r, y)), 40), stone));
  ped.position.set(F.x, 0, F.z);
  scene.add(rim, water, ped);

  // ---- street lamps: a post in two pieces (so the Sun can bend it), an arm and a lantern ----
  const lampMat = plainMat(0x1d2124, 0.5, { metalness: 0.4 });
  const lamps = LAMPS.map(([x, z], i) => {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    g.add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 2.6, 10).translate(0, 1.3, 0), lampMat)));
    const up = new THREE.Group(); up.position.y = 2.6; g.add(up);
    up.add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.0, 10).translate(0, 1.5, 0), lampMat)));
    up.add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.5, 8).translate(0, 3.25, 0), lampMat)));
    up.add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8).translate(0, 3.05, 0), plainMat(0xfff2d0, 0.3, { emissive: new THREE.Color(0.25, 0.22, 0.15) })));
    scene.add(g);
    return { g, up, dir: i % 2 ? 1 : -1 };
  });

  // ---- benches ----
  const wood = plainMat(0x8a5a32, 0.8), iron = plainMat(0x222222, 0.6, { metalness: 0.4 });
  for (const [x, z, yaw] of BENCHES) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw;
    for (let k = 0; k < 3; k++) g.add(shadowy(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.04, 0.12), wood)).translateY(0.45).translateZ(-0.15 + k * 0.15));
    for (let k = 0; k < 2; k++) { const b = shadowy(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.04), wood)); b.position.set(0, 0.62 + k * 0.15, -0.26); g.add(b); }
    for (const sx of [-0.75, 0.75]) { const l = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.5), iron)); l.position.set(sx, 0.225, -0.05); g.add(l); }
    scene.add(g);
  }

  const tmp = new THREE.Vector3();
  return {
    ground, water, waterMat, top, board, net, lamps,
    // the world position of the backboard's centre now
    boardCentre(out) { top.updateMatrixWorld(true); return out.copy(boardC).applyMatrix4(top.matrixWorld); },
    frame(key, tt) {
      // the hoop: the Sun buckles its post at the kink and the top crashes forward onto the court, the board
      // hitting first; it rocks a little where it lands
      let th = 0;
      if (key === 'sun') {
        const t = tt - SUN_HOOP, T = SUN_BOARD_HIT - SUN_HOOP;
        if (t > 0) th = t < T ? thMax * (t / T) * (t / T) : thMax - 0.05 * Math.exp(-(t - T) / 0.12) * Math.abs(Math.sin((t - T) * 22));
        th += 0.04 * smooth(0, 0.3, tt) * (t < 0 ? 1 : 0);              // (sagging before it goes)
      } else if (key === 'jupiter') th = 0.035 * smooth(0, 0.3, tt);    // (the arm dips under the weight)
      
      top.rotation.x = th;
      // the lamps: the Sun bends them over (the upper post more than the lower)
      lamps.forEach((l, i) => {
        let b0 = 0, b1 = 0;
        if (key === 'sun') {
          const k = smooth(SUN_LAMPS + 0.07 * i, SUN_LAMPS + 0.07 * i + 0.25, tt);
          b0 = 0.35 * k; b1 = 1.05 * k;
        }
        l.g.rotation.z = b0 * l.dir; l.up.rotation.z = b1 * l.dir;
      });
      return th;
    },
    thMax,
  };
}

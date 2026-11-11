// Shots 7 and 8, the Mariana Trench (0:30-0:48.6, -20,000 to -36,000 ft). A slot between walls that go up out of frame
// on both sides, the sky only a thin bright strip high above, the floor in deep shade except where a shaft of sun lands.
// Something new every few seconds down there: deep-sea fish stranded on the mud (0:34), jellyfish that light up in the
// dark (0:37), the marker at the deepest spot in the shaft of sun (0:40.6, the counter stops at -36,000 ft). Then a
// roar, and the water comes back as a wall round the bend, down the trench, into the lens. No water in the trench
// before that.
// (The real trench is about 43 miles wide with gentle slopes, and there is no marker at the bottom; it is drawn as a
// narrow slot so both walls are in frame. The anglerfish and the glowing jellyfish live higher up, 3,000-13,000 ft.)
import * as THREE from 'three';
import { groundMaterial, makeGrid, GU } from './ground.js';
import { makeWater } from './water.js';
import { NOISE_GLSL, fbm, vnoise } from './noise.js';
import { box, cyl, merge, paint, propMaterial, canvasTex } from './build.js';
import { makeFish, makeHalos, anglerGeo, jellyGeo } from './creatures.js';
import { cast } from './people.js';
import { walker } from './wreck.js';
import { V_TRENCH, V_BOTTOM, V_FLOOR, V_ROAR, V_WAVE, V_HIT, V_FISH, V_GLOW } from './timeline.js';
import { rng, smooth, lerp, clamp, DEG } from './util.js';

const WALL_H = 1800, WALL_L = 85;
function canyon(x, z, P) {
  const d = Math.abs(x - P.cx(z)) - P.wf(z);
  const yf = P.floor(x, z);
  if (d <= 0) return yf;
  const k = 1 - Math.exp(-d / WALL_L);
  const led = WALL_H * 0.01 * Math.sin(k * 38 + 4 * vnoise(x * 0.01, z * 0.01)) * smooth(0.02, 0.2, k);
  const rough = 26 * (fbm(x * 0.02 + 3, z * 0.02) - 0.5) * smooth(0, 0.1, k) + 2.5 * (fbm(x * 0.15, z * 0.15) - 0.5) * smooth(0, 3, d);
  return yf + 0.45 * Math.min(d, 6) + WALL_H * k + led + rough;
}

// a shaft of sunlight: a soft column from the patch it lights on the floor up towards the strip of sky
function makeBeam(parent, x, y, z, r) {
  const dir = new THREE.Vector3(0.04, 1, -0.22).normalize();
  const geo = new THREE.CylinderGeometry(r * 1.05, r, 1400, 24, 1, true).translate(0, 700, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW; varying float vH;
      void main() { vH = position.y / 1400.0; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `varying vec3 vN; varying vec3 vW; varying float vH;
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        float edge = pow(abs(dot(normalize(vN), V)), 2.5);
        float a = edge * smoothstep(0.0, 0.004, vH) * (1.0 - smoothstep(0.15, 0.7, vH)) * 0.09;
        gl_FragColor = vec4(vec3(1.0, 0.93, 0.76) * a, 1.0);
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  m.frustumCulled = false; m.renderOrder = 7;
  parent.add(m);
  return m;
}
const deepGround = (o) => groundMaterial({ colA: 0xd2bc92, colB: 0xb9a27c, rock: 0xc4a07a, strata: 0.9, layer: 0.05, scale: 0.06, ripple: 0.25, pebble: 0.3, falls: 0.35, fallS: 0.3, steep0: 0.8, steep1: 0.5, wet: 0.3, ...o });

// ---- shot 7: down the trench; stranded deep-sea fish ----
const A = {
  cx: (z) => 14 * Math.sin(z * 0.011),
  floor: (x, z) => 0.1 * z + 0.4 * (fbm(x * 0.12, z * 0.12) - 0.5),
  wf: (z) => 12 + 3 * (vnoise(z * 0.03, 4.4) - 0.5),
};
const FISH_Z = -15, SHAFT_A = { x: 0.8, z: -15.5, r: 7.5 };
export function makeTrench(ctx) {
  const group = new THREE.Group();
  const h = (x, z) => canyon(x, z, A);
  const grid = makeGrid(h, { zNear: 16, zFar: -2600, w0: 170, w1: 2200, nx: 190, nz: 190, p: 2.0 });
  const ground = new THREE.Mesh(grid.ground, deepGround({}));
  ground.receiveShadow = true; ground.frustumCulled = false;
  group.add(ground);
  makeBeam(group, SHAFT_A.x, A.floor(SHAFT_A.x, SHAFT_A.z), SHAFT_A.z, SHAFT_A.r * 0.8);

  // the fish: three anglerfish, big jaws towards you, and a scatter of silver deep-sea fish, all in the patch of sun
  const R = rng(36);
  const ang = anglerGeo();
  // (yaw -PI/2 turns the open jaws towards you)
  const ANG = [{ x: -1.5, z: FISH_Z + 1.2, yaw: -1.3, s: 1.15 }, { x: 1.7, z: FISH_Z - 0.2, yaw: -1.9, s: 1.0 }, { x: -0.3, z: FISH_Z - 2.0, yaw: -1.5, s: 1.05 }];
  const angM = new THREE.InstancedMesh(ang.geo, propMaterial({ rough: 0.35, gloss: 0.8 }), ANG.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), bv = new THREE.Vector3();
  const lures = [];
  ANG.forEach((a, i) => {
    e.set(0, a.yaw, 0.12); q.setFromEuler(e);
    m4.compose(p3.set(a.x, A.floor(a.x, a.z) - 0.05, a.z), q, s3.setScalar(a.s));
    angM.setMatrixAt(i, m4);
    bv.set(ang.bulb.x, ang.bulb.y, ang.bulb.z).applyMatrix4(m4);
    lures.push({ x: bv.x, y: bv.y, z: bv.z, r: 0.18 * a.s, col: [0.4, 1.6, 2.0], ph: i * 0.3 });
    lures.push({ x: bv.x, y: bv.y, z: bv.z, r: 0.06 * a.s, col: [3, 4, 4], ph: i * 0.3 });
  });
  angM.castShadow = true; angM.receiveShadow = true; angM.frustumCulled = false;
  group.add(angM);
  const halos = makeHalos(group, lures);
  const FISH = [];
  for (let k = 0; k < 16; k++) FISH.push({ x: (R() - 0.5) * 8, z: FISH_Z + (R() - 0.5) * 9, s: 0.5 + R() * 0.5, yaw: R() * 6.28, ph: R() * 20 });
  const fish = makeFish(group, FISH);

  const T = V_TRENCH;
  const people = cast([
    { ...walker(1.6, -5.6, 2.4, T, { hero: true, yaw: Math.PI }), dur: 5 + 5.2, then: 'lookDown' },
    walker(-1.8, -8.8, 2.3, T, { dur: 5 + 4.6, then: 'pointR' }), { ...walker(3.4, -11, 2.2, T), dur: 5 + 3.6, then: 'phone', lookUp: -0.3 },
    walker(-0.6, -24, 2.0, T), walker(-4.2, -30, 1.9, T), walker(4.0, -34, 1.8, T),
  ], 71);
  const level = () => -60;
  // walking down the slot, looking up at the walls; at 0:34 the eye drops to the fish in the sun ahead
  const camZ = (t) => -(2.2 * t - 0.9 * Math.pow(Math.max(0, t - 3.6), 2) / 2);
  function cam(v) {
    const t = v - T, z = camZ(t);
    return {
      x: 0.2 + A.cx(z) * 0.3, z, eye: 1.66 + 0.035 * Math.sin(t * 9),
      yaw: (2 * Math.sin(t * 0.5)) * DEG, pitch: (13 - 30 * smooth(V_FISH - T - 0.5, V_FISH - T + 0.5, t)) * DEG, fov: 66,
    };
  }
  const sun = new THREE.Vector3(-0.15, 0.95, 0.27).normalize();
  return {
    name: 'trench', group, h, level, cam, people, flow: 0.4, sun, sunI: 2.4, hemiI: 1.1, shadowAhead: 18,
    deep: (v) => ({ k: 1, floor: A.floor(0, camZ(v - T)) - 1, x: SHAFT_A.x, z: SHAFT_A.z, r: SHAFT_A.r }),
    frame(v) { fish.frame(v, (x, z) => A.floor(x, z) - 0.05); halos.uniforms.uTime.value = v; },
  };
}

// ---- shot 8: the bottom: glowing jellyfish, the marker at the deepest spot, and the water coming back ----
const B = {
  cx: (z) => 22 * smooth(-250, -700, z),
  floor: (x, z) => 0.12 * (fbm(x * 0.1, z * 0.1) - 0.5),
  wf: (z) => 12 + 4 * (vnoise(z * 0.03, 2.2) - 0.5),
};
const STOP_Z = -7.2, MARK = { x: 2.6, z: -14.4 }, SHAFT_B = { x: 1.6, z: -14, r: 7.5 };
function markerSign() {
  return canvasTex(512, 256, (g, w, hh) => {
    g.fillStyle = '#f2ede0'; g.fillRect(0, 0, w, hh);
    g.strokeStyle = '#1d2a3a'; g.lineWidth = 14; g.strokeRect(10, 10, w - 20, hh - 20);
    g.fillStyle = '#1d2a3a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 74px Georgia, serif'; g.fillText('CHALLENGER', w / 2, hh * 0.37);
    g.fillText('DEEP', w / 2, hh * 0.7);
  });
}
export function makeBottom(ctx) {
  const group = new THREE.Group();
  const h = (x, z) => canyon(x, z, B);
  const grid = makeGrid(h, { zNear: 16, zFar: -1700, w0: 170, w1: 1700, nx: 190, nz: 180, p: 1.9 });
  const ground = new THREE.Mesh(grid.ground, deepGround({ colA: 0xdcc69c, colB: 0xc7b086 }));
  ground.receiveShadow = true; ground.frustumCulled = false;
  group.add(ground);
  makeBeam(group, SHAFT_B.x, 0, SHAFT_B.z, SHAFT_B.r * 0.8);

  // the marker: a striped survey pole with a flag, and a sign
  {
    const P = [];
    for (let k = 0; k < 8; k++) P.push(cyl(0.06, 0.06, 0.5, k % 2 ? 0xffffff : 0xd8281c, MARK.x, 0.25 + k * 0.5, MARK.z, 0, 0, 0, 10));
    const flag = paint(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.7, 0), new THREE.Vector3(1.1, -0.32, 0.1)]), 0xe8261c);
    flag.computeVertexNormals(); flag.translate(MARK.x + 0.05, 3.95, MARK.z);
    P.push(flag, cyl(0.04, 0.04, 1.2, 0x5a4636, MARK.x + 0.2, 0.6, MARK.z + 0.5), cyl(0.04, 0.04, 1.2, 0x5a4636, MARK.x + 1.55, 0.6, MARK.z + 0.5));
    const m = new THREE.Mesh(merge(P), propMaterial({ rough: 0.5, gloss: 0.3, side: THREE.DoubleSide }));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), propMaterial({ map: markerSign(), vertexColors: false, rough: 0.6, gloss: 0.2 }));
    sign.position.set(MARK.x + 0.85, 1.05, MARK.z + 0.53);
    for (const o of [m, sign]) { o.castShadow = true; o.receiveShadow = true; group.add(o); }
  }
  // jellyfish lying on the mud in the shade; they light up at 0:37
  const JEL = [];
  { const R = rng(37); for (const [x, z] of [[-1.8, -7.2], [-3.0, -9.6], [2.0, -8.2], [3.6, -10.4], [-1.0, -11.8], [-3.9, -13.6], [4.6, -13.4], [-0.2, -9.2], [3.0, -6.4], [-4.4, -7.0], [5.6, -8.6], [-5.6, -11.2]]) JEL.push({ x: x + (R() - 0.5) * 0.4, z, s: 0.75 + R() * 0.5, yaw: R() * 6.28 }); }
  const jg = jellyGeo();
  const jBody = new THREE.InstancedMesh(jg.body, propMaterial({ rough: 0.25, gloss: 0.9 }), JEL.length);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const jRing = new THREE.InstancedMesh(jg.ring, ringMat, JEL.length);
  const glowPts = [];
  {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3();
    JEL.forEach((j, i) => {
      e.set(0, j.yaw, 0); q.setFromEuler(e);
      m4.compose(p3.set(j.x, B.floor(j.x, j.z), j.z), q, s3.setScalar(j.s));
      jBody.setMatrixAt(i, m4); jRing.setMatrixAt(i, m4);
      glowPts.push({ x: j.x, y: B.floor(j.x, j.z) + 0.12 * j.s, z: j.z, r: 0.75 * j.s, col: [0.25, 0.75, 1.9], ph: i * 0.29 });
      glowPts.push({ x: j.x, y: B.floor(j.x, j.z) + 0.2 * j.s, z: j.z, r: 0.22 * j.s, col: [1.2, 0.2, 0.4], ph: i * 0.29 + 0.5 });
    });
    for (const o of [jBody, jRing]) { o.frustumCulled = false; o.receiveShadow = true; group.add(o); }
  }
  const glows = makeHalos(group, glowPts);

  // ---- the wall of water ----
  const WH = 460;
  const wgeo = new THREE.PlaneGeometry(560, WH, 70, 40).translate(0, WH / 2, 0);
  const wu = { uTime: GU.uTime, uNear: { value: 0 } };
  const wave = new THREE.Mesh(wgeo, new THREE.ShaderMaterial({
    uniforms: wu, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `uniform float uTime; varying vec2 vP;
      void main() {
        vec3 p = position; float t = p.y / ${WH.toFixed(1)};
        vP = p.xy;
        // the face leans over you, and heaves
        p.z += 46.0 * pow(t, 1.6) + 9.0 * sin(p.x * 0.03 + uTime * 1.3 + t * 5.0) * t + 5.0 * sin(p.x * 0.11 - uTime * 2.1 + t * 9.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform float uNear; varying vec2 vP;
      ${NOISE_GLSL}
      void main() {
        float top = 372.0 + 40.0 * n2(vec2(vP.x * 0.012, uTime * 0.6)) + 16.0 * n2(vec2(vP.x * 0.06, uTime * 1.7));
        if (vP.y > top) discard;
        float hgt = vP.y / top;
        // a dark blue-green face, paler and glassy towards the lip
        vec3 col = mix(vec3(0.005, 0.11, 0.22), vec3(0.02, 0.34, 0.45), smoothstep(0.0, 0.7, hgt));
        col = mix(col, vec3(0.2, 0.72, 0.74), smoothstep(0.72, 0.97, hgt));
        // ribs of water climbing the face
        col *= 0.82 + 0.3 * n2(vec2(vP.x * 0.018, vP.y * 0.05 - uTime * 2.2)) + 0.12 * sin(vP.y * 0.21 - uTime * 7.0 + 3.0 * n2(vP * 0.02));
        // veils of foam falling from the lip, in long streaks
        float veil = fbm2(vec2(vP.x * 0.07, vP.y * 0.011 + uTime * 0.9));
        float veils = smoothstep(0.5, 0.68, veil) * smoothstep(0.25, 0.8, hgt);
        // the lip: thick white, ragged below; a shadow under its overhang
        float lip = smoothstep(top - 62.0 - 40.0 * n2(vec2(vP.x * 0.045, uTime * 1.1)), top - 12.0, vP.y);
        col *= 1.0 - 0.45 * smoothstep(top - 150.0, top - 80.0, vP.y) * (1.0 - lip);
        // the foot: boiling white
        float foot = smoothstep(95.0 + 50.0 * n2(vec2(vP.x * 0.04, uTime * 1.6)), 8.0, vP.y);
        float foam = clamp(veils * 0.75 + lip + foot, 0.0, 1.0);
        col = mix(col, vec3(1.3, 1.36, 1.42) * (0.72 + 0.4 * fbm2(vP * 0.06 + vec2(0.0, uTime * 2.4))), foam);
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  wave.frustumCulled = false;
  wave.visible = false;
  group.add(wave);

  const T = V_BOTTOM;
  const FLEE = V_WAVE + 0.25;
  const people = cast([
    // the walker reaches the marker as the counter stops, and raises his arms in the sun
    { ...walker(1.0, -5.2, 1.5, T, { hero: true, yaw: Math.PI }), dur: 5 + 4.9, then: 'arms', flee: FLEE + 0.25, fleeYaw: 0.06 },
    { ...walker(-1.9, -8.5, 1.4, T), dur: 5 + 4.4, then: 'lookUp', flee: FLEE + 0.1, fleeYaw: -0.1 },
    { ...walker(3.6, -9.5, 1.0, T), dur: 5 + 1.6, then: 'lookDown', flee: FLEE, fleeYaw: 0.12 },
    { x: -3.6, z: -22, act: 'touch', yaw: Math.PI + 0.9, flee: FLEE - 0.1, fleeYaw: -0.12 }, { x: 0.4, z: -27, act: 'lookUp', yaw: Math.PI, flee: FLEE - 0.2, fleeYaw: 0.02 },
    { x: 5.2, z: -19, act: 'point', yaw: Math.PI - 0.2, s: 0.66, flee: FLEE + 0.05, fleeYaw: 0.14 },
  ], 81);

  const level = () => -60;
  const camZ = (v) => STOP_Z * smooth(-0.4, V_FLOOR - T, (v - T));
  function cam(v, s) {
    const t = v - T;
    const z = camZ(v);
    const up = smooth(V_HIT - 1.5, V_HIT - 0.1, v);
    // up at the walls, down at the jellyfish as they light up (0:37), up to the marker in the sun, then at the roar up the trench
    const down = smooth(V_GLOW - 0.5, V_GLOW + 0.3, v) * (1 - smooth(V_GLOW + 1.9, V_GLOW + 2.8, v));
    return {
      x: 0.2, z, eye: 1.66 + 0.03 * Math.sin(t * 5.5) * (1 - smooth(4.3, 4.9, t)),
      yaw: (-1.5 - 2.5 * smooth(V_ROAR, V_ROAR + 1, v)) * DEG,
      pitch: (lerp(18, 8, smooth(0.2, 1.4, t)) - 20 * down + 10 * smooth(V_ROAR - 0.1, V_ROAR + 0.9, v) + 14 * up) * DEG,
      fov: 66 + 4 * up,
    };
  }
  const sun = new THREE.Vector3(-0.1, 0.9, 0.42).normalize();
  const dcx = (z) => (B.cx(z + 1) - B.cx(z - 1)) / 2;
  return {
    name: 'bottom', group, h, level, cam, people, flow: 0.4, sun, sunI: 2.4, hemiI: 1.1, shadowAhead: 20,
    deep: { k: 1, floor: 0, x: SHAFT_B.x, z: SHAFT_B.z, r: SHAFT_B.r },
    waveZ: (v) => lerp(-600, camZ(v) + 30, Math.pow(clamp((v - V_WAVE) / (V_HIT - V_WAVE)), 1.15)),
    frame(v, s, fx) {
      // the jellyfish light up
      const k = 0.08 + 0.92 * smooth(V_GLOW - 0.3, V_GLOW + 0.5, v);
      glows.uniforms.uK.value = k; glows.uniforms.uTime.value = v;
      ringMat.color.setRGB(0.35 * k * 3, 0.9 * k * 3, 2.2 * k * 3);
      const on = v > V_WAVE - 0.05;
      wave.visible = on;
      if (on) {
        const zw = this.waveZ(v), xw = B.cx(zw), yaw = Math.atan(dcx(zw));
        wave.position.set(xw, -4, zw);
        wave.rotation.y = yaw;
        // spray: thrown up along its crest
        const rx = Math.cos(yaw), rz = -Math.sin(yaw), fxx = Math.sin(yaw), fz = Math.cos(yaw);
        for (let k2 = 0; k2 < 16; k2++) {
          const u = (k2 + 0.5) / 16 - 0.5, a = ((v * 0.9 + k2 * 0.37) % 1 + 1) % 1;
          const lx = u * 200, top = 376 + 24 * Math.sin(k2 * 2.1);
          fx.smoke.puff(xw + rx * lx + fxx * (52 + 8 * a), top + 30 * a, zw + rz * lx + fz * (52 + 8 * a), 16 + 14 * a, 0.5 * (1 - a) * smooth(0, 0.1, a), 1.0, 0, (k2 * 0.13) % 1);
        }
      }
      // the roar shakes dust off the walls
      if (v > V_ROAR) {
        for (let k2 = 0; k2 < 14; k2++) {
          const a = (((v - V_ROAR) * 0.45 + k2 * 0.21) % 1 + 1) % 1, sd = k2 % 2 ? 1 : -1, z = -20 - k2 * 9;
          const x = B.cx(z) + sd * (B.wf(z) + 5 + 0.4 * k2);
          fx.smoke.puff(x - sd * 3 * a, h(x, z) + 6 - 9 * a, z, 2 + 5 * a, 0.4 * (1 - a) * smooth(0, 0.15, a) * smooth(V_ROAR, V_ROAR + 0.6, v), 0.75, 0, (k2 * 0.3) % 1);
        }
      }
    },
  };
}

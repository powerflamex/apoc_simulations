// Shots 7 and 8, the Mariana Trench (0:30-0:46.9, -20,000 to -36,000 ft). First you walk down into it and its walls
// rise on both sides; then the bottom: a narrow floor of pale mud lit by a shaft of sun between walls that go up out of
// sight, the last pool draining away, the counter stopping at -36,000 ft. Then a roar, and the water comes back as a
// wall round the bend, down the trench, into the lens.
// (The real trench is about 43 miles wide with gentle slopes; it is drawn narrow and steep so both walls are in frame.)
import * as THREE from 'three';
import { groundMaterial, makeGrid, GU } from './ground.js';
import { makeWater } from './water.js';
import { NOISE_GLSL, fbm, vnoise } from './noise.js';
import { cast } from './people.js';
import { walker } from './wreck.js';
import { V_TRENCH, V_BOTTOM, V_FLOOR, V_ROAR, V_WAVE, V_HIT } from './timeline.js';
import { smooth, lerp, clamp, wobble, DEG } from './util.js';

function canyon(x, z, P) {
  const d = Math.abs(x - P.cx(z)) - P.wf(z);
  const yf = P.floor(x, z);
  if (d <= 0) return yf;
  const Hw = P.Hw(z);
  const k = 1 - Math.exp(-d / (Hw * 0.33));
  const led = Hw * 0.014 * Math.sin(k * 17 + 4 * vnoise(x * 0.008, z * 0.008)) * smooth(0.02, 0.15, k);
  const rough = Hw * 0.06 * (fbm(x * 0.012 + 3, z * 0.012) - 0.5) * smooth(0, 0.12, k) + 3 * (fbm(x * 0.13, z * 0.13) - 0.5) * smooth(0, 4, d);
  return yf + Hw * k + led + rough;
}

// ---- shot 7: down into the trench ----
const A = {
  cx: (z) => 16 * Math.sin(z * 0.011),
  floor: (x, z) => 0.3 * z + 0.5 * (fbm(x * 0.12, z * 0.12) - 0.5),
  wf: (z) => lerp(34, 13, smooth(0, -260, z)),
  Hw: (z) => lerp(45, 640, smooth(30, -420, z)),
};
export function makeTrench(ctx) {
  const group = new THREE.Group();
  const h = (x, z) => canyon(x, z, A);
  const grid = makeGrid(h, { zNear: 16, zFar: -2600, w0: 150, w1: 2200, nx: 170, nz: 190, p: 2.0 });
  const ground = new THREE.Mesh(grid.ground, groundMaterial({ colA: 0xa08a6a, colB: 0x8a7458, rock: 0x97856f, strata: 0.9, layer: 0.07, scale: 0.05, ripple: 0, pebble: 0.5, falls: 0.6, fallS: 0.35, steep0: 0.8, steep1: 0.5 }));
  ground.receiveShadow = true; ground.frustumCulled = false;
  group.add(ground, makeWater(grid.water));

  const T = V_TRENCH;
  const cz = (t) => -2.6 * t;
  const people = cast([
    walker(1.1, -5.6, 2.6, T, { hero: true, yaw: Math.PI }),
    walker(-1.8, -8.8, 2.4, T), walker(3.0, -12, 2.3, T), walker(-0.6, -17, 2.2, T), walker(-4.5, -22, 2.1, T), walker(4.5, -27, 2.0, T),
    { x: -4.2, z: -15.5, act: 'lookUp', yaw: Math.PI + 0.3 }, { x: 5.4, z: -19, act: 'phone', lookUp: 0.7, yaw: Math.PI - 0.3 },
  ], 71);
  // the last of the water runs away down the trench ahead of you
  const level = (v) => A.floor(0, lerp(-55, -330, smooth(T - 0.3, V_BOTTOM + 0.2, v))) + 0.3;
  function cam(v) {
    const t = v - T, z = cz(t);
    return {
      x: A.cx(z) * 0.5 + 0.3, z, eye: 1.66 + 0.035 * Math.sin(t * 9),
      yaw: 0, pitch: lerp(-13, -6, smooth(0, 5.6, t)) * DEG, fov: 66,
    };
  }
  return { name: 'trench', group, h, level, cam, people, flow: 1, shadowAhead: 22, frame() {} };
}

// ---- shot 8: the bottom, and the water coming back ----
const B = {
  cx: (z) => 150 * smooth(-190, -520, z),
  floor: (x, z) => 0.12 * (fbm(x * 0.1, z * 0.1) - 0.5) - 0.6 * Math.exp(-Math.pow((z + 22) / 13, 2) - Math.pow(x / 7, 2)),
  wf: (z) => 12 + 4 * (vnoise(z * 0.03, 2.2) - 0.5),
  Hw: () => 680,
};
const STOP_Z = -7.2;
export function makeBottom(ctx) {
  const group = new THREE.Group();
  const h = (x, z) => canyon(x, z, B);
  const grid = makeGrid(h, { zNear: 16, zFar: -1700, w0: 170, w1: 1700, nx: 180, nz: 180, p: 1.9 });
  const ground = new THREE.Mesh(grid.ground, groundMaterial({ colA: 0xd9c49a, colB: 0xc2ab80, rock: 0x97856f, strata: 0.9, layer: 0.06, scale: 0.06, ripple: 0.3, pebble: 0.3, falls: 0.55, fallS: 0.35, steep0: 0.8, steep1: 0.5 }));
  ground.receiveShadow = true; ground.frustumCulled = false;
  group.add(ground, makeWater(grid.water));

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
    { ...walker(1.2, -5.2, 1.5, T, { hero: true, yaw: Math.PI }), dur: 5 + 4.9, then: 'arms', flee: FLEE + 0.25, fleeYaw: 0.06 },
    { ...walker(-1.9, -8.5, 1.4, T), dur: 5 + 4.4, then: 'lookUp', flee: FLEE + 0.1, fleeYaw: -0.1 },
    { ...walker(3.4, -11.5, 1.3, T), dur: 5 + 4.0, then: 'phone', lookUp: 0.9, flee: FLEE, fleeYaw: 0.12 },
    { x: -3.6, z: -22, act: 'touch', yaw: Math.PI + 0.9, flee: FLEE - 0.1, fleeYaw: -0.12 }, { x: 0.4, z: -27, act: 'lookUp', yaw: Math.PI, flee: FLEE - 0.2, fleeYaw: 0.02 },
    { x: 5.2, z: -19, act: 'point', yaw: Math.PI - 0.2, s: 0.66, flee: FLEE + 0.05, fleeYaw: 0.14 },
  ], 81);

  const level = (v) => lerp(-0.1, -0.85, smooth(T - 0.2, V_FLOOR - 0.4, v));
  const camZ = (v) => STOP_Z * smooth(-0.4, V_FLOOR - T, (v - T));
  function cam(v, s) {
    const t = v - T;
    const z = camZ(v);
    const up = smooth(V_HIT - 1.5, V_HIT - 0.1, v);
    return {
      x: 0.2, z, eye: 1.66 + 0.03 * Math.sin(t * 5.5) * (1 - smooth(4.3, 4.9, t)),
      yaw: (-1.5 - 2.5 * smooth(V_ROAR, V_ROAR + 1, v)) * DEG,
      pitch: (lerp(17, 5, smooth(0.2, 2.6, t)) - 5 * smooth(2.6, 4.9, t) + 12 * smooth(V_ROAR - 0.1, V_ROAR + 0.9, v) + 14 * up) * DEG,
      fov: 66 + 4 * up,
    };
  }
  const sun = new THREE.Vector3(-0.1, 0.9, 0.42).normalize();
  const dcx = (z) => (B.cx(z + 1) - B.cx(z - 1)) / 2;
  return {
    name: 'bottom', group, h, level, cam, people, flow: 0.4, sun, sunI: 3.5, hemiI: 1.05, shadowAhead: 20,
    waveZ: (v) => lerp(-600, camZ(v) + 30, Math.pow(clamp((v - V_WAVE) / (V_HIT - V_WAVE)), 1.15)),
    frame(v, s, fx) {
      const on = v > V_WAVE - 0.05;
      wave.visible = on;
      if (on) {
        const zw = this.waveZ(v), xw = B.cx(zw), yaw = Math.atan(dcx(zw));
        wave.position.set(xw, -4, zw);
        wave.rotation.y = yaw;
        // spray: thrown up along its crest and boiling at its foot
        const rx = Math.cos(yaw), rz = -Math.sin(yaw), fxx = Math.sin(yaw), fz = Math.cos(yaw);
        for (let k = 0; k < 16; k++) {
          const u = (k + 0.5) / 16 - 0.5, a = ((v * 0.9 + k * 0.37) % 1 + 1) % 1;
          const lx = u * 200, top = 376 + 24 * Math.sin(k * 2.1);
          fx.smoke.puff(xw + rx * lx + fxx * (52 + 8 * a), top + 30 * a, zw + rz * lx + fz * (52 + 8 * a), 16 + 14 * a, 0.5 * (1 - a) * smooth(0, 0.1, a), 1.0, 0, (k * 0.13) % 1);
        }
      }
      // the roar shakes dust off the walls
      if (v > V_ROAR) {
        for (let k = 0; k < 14; k++) {
          const a = (((v - V_ROAR) * 0.45 + k * 0.21) % 1 + 1) % 1, sd = k % 2 ? 1 : -1, z = -20 - k * 9;
          const x = B.cx(z) + sd * (B.wf(z) + 5 + 0.4 * k);
          fx.smoke.puff(x - sd * 3 * a, h(x, z) + 6 - 9 * a, z, 2 + 5 * a, 0.4 * (1 - a) * smooth(0, 0.15, a) * smooth(V_ROAR, V_ROAR + 0.6, v), 0.75, 0, (k * 0.3) % 1);
        }
      }
    },
  };
}

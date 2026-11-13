// The shooting stars, the fireballs and the rocks that come down.
//   - The shower: thousands of meteors, each a streak moving away from the radiant along a great circle, a bright head
//     and a fading tail, ~0.2-0.8 s; the brighter ones leave a glowing green train that fades over a few seconds (as
//     real Leonids do). Drawn on a sphere 4 km round the camera so the skyline hides the low ones.
//   - Fireballs (the beats): big, slow, flaring streaks that break up, each lighting the scene (main.js turns their
//     brightness into the light that throws the crowd's shadows).
//   - Rocks that reach the water or the street: real 3D paths (coming from the radiant's direction), glowing to the end.
//   - The biggest one: a growing ball at the radiant that slides down the sky toward the skyline and dives behind it.
// One instanced quad per streak: its two ends projected in the vertex shader, widened across in screen pixels.
import * as THREE from 'three';
import { rng, smooth, clamp, keys, lerp } from './util.js';
import { radiant, SPLASH, HIT_CAR } from './layout.js';
import { showerRate, V_FB1, V_DAY, V_BOOM, V_SPLASH, V_CAR, V_RUN, V_BIG, V_FULL, V_DIVE, V_IMPACT, VIDEO_DURATION } from './timeline.js';

const DEG = Math.PI / 180;
export const RS = 4000;
// a direction from (az: degrees to the left of straight ahead (-z), el: degrees up)
export const dirOf = (az, el) => new THREE.Vector3(-Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), -Math.cos(az * DEG) * Math.cos(el * DEG));
export const RAD = dirOf(radiant.az, radiant.el);
// two unit vectors across the radiant (for position angles round it): E1 to the right-ish, E2 up-ish
const E1 = new THREE.Vector3().crossVectors(RAD, new THREE.Vector3(0, 1, 0)).normalize();
const E2 = new THREE.Vector3().crossVectors(E1, RAD).normalize();
// the direction at angular distance d (deg) from the radiant, at position angle phi (deg; 0 = straight down, + = to the right)
export function fromRadiant(d, phi, out = new THREE.Vector3()) {
  const a = phi * DEG, s = Math.sin(d * DEG), c = Math.cos(d * DEG);
  return out.copy(RAD).multiplyScalar(c).addScaledVector(E2, -Math.cos(a) * s).addScaledVector(E1, Math.sin(a) * s);
}
// the impact point: just past the city, a little right of straight ahead (behind the skyline)
export const IMPACT_DIR = dirOf(-7, 0.4);

// ---------- the shower: a fixed schedule (the same every render) ----------
export const SHOWER = [];
{
  const R = rng(1833);
  for (let t = -4; t < VIDEO_DURATION + 2;) {
    t += -Math.log(1 - R()) / showerRate(t) * 0.25;   // (drawn on the front quarter of the sky only: 4x the rate there)
    const d0 = 2 + 75 * Math.pow(R(), 1.35);
    const phi = (R() - 0.5) * 2 * 115;                // (none going straight up: the radiant is high, those would leave the frame)
    const L = (4 + 26 * Math.pow(R(), 1.2)) * (0.3 + 0.7 * Math.sin(Math.min(d0 + 10, 90) * DEG));
    const B = 0.35 + 2.4 * Math.pow(R(), 5);
    const dur = 0.18 + 0.5 * R() + 0.2 * B;
    SHOWER.push({ t0: t, d0, phi, L, B, dur, train: B > 1.1 ? 1.5 + 2.5 * R() : 0, hue: R() });
  }
}

// ---------- the fireballs (in the sky: they burn out high up) ----------
// t0, dur, d0, phi, L (deg), peak light, head size (deg), colour, train (s), boom (s after t0, 0: none)
const FB = (t0, dur, d0, phi, L, I, size, train, boom = 0, breakUp = 0) => ({ t0, dur, d0, phi, L, I, size, train, boom, breakUp });
export const FIREBALLS = [
  FB(V_FB1 - 0.05, 1.55, 6, -10, 34, 1.0, 1.0, 7, 1.7, 0.9),     // (aimed down at the skyline so it bursts in frame, over the harbor, ~0:06.2)
  FB(V_DAY - 0.25, 1.5, 9, 30, 46, 1.6, 1.3, 6, 0, 0.3),
  FB(V_DAY + 0.15, 1.7, 4, -12, 40, 1.8, 1.4, 6, 0, 0.4),
  FB(V_DAY + 0.65, 1.4, 14, 62, 40, 1.6, 1.2, 5, 0, 0.3),
  FB(V_BOOM - 1.35, 1.45, 8, 42, 48, 3.0, 2.0, 7, 0, 0.6),          // low over the jetty: its boom is the 0:13 one
  FB(V_SPLASH - 1.7, 1.2, 5, 4, 30, 3.0, 1.8, 6, 0, 0.8),           // breaks up: a piece goes on into the harbour
  FB(V_CAR - 1.6, 1.25, 7, 32, 34, 3.5, 2.0, 6, 0, 0.8),            // breaks up: a piece goes on to the car
  FB(23.6, 1.3, 16, -50, 36, 2.6, 1.6, 5, 0, 0.5),
  FB(25.0, 1.2, 11, 70, 34, 2.4, 1.5, 5, 0, 0.5),
  FB(V_RUN - 1.25, 1.6, 6, -20, 46, 9.0, 3.6, 9, 0, 0.9),           // as bright as the Sun
  FB(29.2, 1.3, 13, 40, 38, 2.6, 1.6, 5, 0, 0.5),
  FB(34.5, 1.2, 18, -64, 34, 2.4, 1.5, 4, 0, 0.5),
  FB(37.1, 1.3, 15, 58, 36, 2.6, 1.6, 4, 0, 0.5),
];
// a fireball's brightness over its life (0..1 of dur): builds, flares as it breaks up, dies
export const fbLight = (f, u) => (u < 0 || u > 1 ? 0 : (0.25 + 0.75 * smooth(0, 0.55, u)) * (1 + 1.2 * f.breakUp * Math.exp(-Math.pow((u - 0.78) / 0.07, 2))) * (1 - smooth(0.82, 1, u)));

// ---------- rocks that reach the ground (come in along the meteors' direction: from the radiant's side of the sky) ----------
// end point, time it lands, how long its last 4 km take, size of the glow (m), kind ('water' | 'car' | 'street')
export const ROCKS = [];
{
  ROCKS.push({ x: SPLASH.x, y: -1.6, z: SPLASH.z, t1: V_SPLASH, fall: 1.15, size: 5, kind: 'water', big: 1 });
  ROCKS.push({ x: HIT_CAR.x, y: 1.2, z: HIT_CAR.z, t1: V_CAR, fall: 1.1, size: 4, kind: 'car', big: 1 });
  const R = rng(77);
  // the rain after the car: pieces into the harbour all round, a few onto the far jetty and the far shore
  const add = (t1, x, z, size = 2.5, kind = 'water') => ROCKS.push({ x, y: kind === 'water' ? -1.6 : 0.2, z, t1, fall: 0.9 + R() * 0.4, size, kind, big: 0 });
  for (let k = 0; k < 22; k++) add(V_CAR + 1.1 + k * 0.42 + R() * 0.3, -260 + R() * 420, -110 - R() * 700, 2 + R() * 2.5);
  for (let k = 0; k < 16; k++) add(V_BIG + 2.2 + k * 0.62 + R() * 0.3, -300 + R() * 500, -120 - R() * 800, 2 + R() * 3);
  add(V_RUN - 2.6, -40, -150, 3.5); add(V_RUN + 0.9, 30, -90, 3);
}
export const SPLASHES = ROCKS.filter((r) => r.kind === 'water');
// where a rock is at time v (u: 0 at 4 km out, 1 when it lands)
const tmpA = new THREE.Vector3();
export function rockAt(r, v, out = new THREE.Vector3()) {
  const u = (v - (r.t1 - r.fall)) / r.fall;
  // (it comes from the radiant's direction, slowing a little at the end)
  const s = Math.pow(1 - clamp(u, 0, 1), 2.6) * 4000;
  return { u, p: out.set(r.x, r.y, r.z).addScaledVector(RAD, s) };
}

// ---------- the biggest one ----------
// where it is in the sky: starts just off the radiant, creeps toward the skyline, then races down behind it
// (it starts 2.5 deg from the radiant on the great circle through the impact point, so like every other meteor it moves
// straight away from the radiant and its trail points back at it, parallel to the shower's streaks)
export const BIG0 = (() => {
  const t = IMPACT_DIR.clone().addScaledVector(RAD, -IMPACT_DIR.dot(RAD)).normalize();
  return RAD.clone().multiplyScalar(Math.cos(2.5 * DEG)).addScaledVector(t, Math.sin(2.5 * DEG)).normalize();
})();
export function bigAt(v) {
  if (v < V_BIG - 0.2) return null;
  // (steadily down the sky at first, faster and faster once it dives)
  const k = v < V_DIVE ? 0.42 * Math.pow(clamp((v - V_BIG + 0.2) / (V_DIVE - V_BIG + 0.2), 0, 1), 1.15) : 0.42 + 0.58 * Math.pow((v - V_DIVE) / (V_IMPACT - V_DIVE), 1.5);
  const dir = new THREE.Vector3().copy(BIG0).lerp(IMPACT_DIR, k).normalize();
  // the rock's radius in the sky (deg): from 0:32 it grows ~23% every second (visibly bigger each second)
  const rockR = v < V_FULL ? lerp(0.12, 0.35, smooth(V_BIG - 0.2, V_FULL, v)) : 0.35 * Math.exp(0.205 * (v - V_FULL));
  const size = rockR / 0.45;
  // its light (what it throws on the crowd and the water), growing with it
  const I = v < V_FULL ? 1.2 * smooth(V_BIG - 0.2, V_FULL, v) : 1.2 * Math.exp(0.18 * (v - V_FULL));
  // the trail behind it (deg), longer as it comes closer
  const trailLen = 3 + 2.6 * Math.max(v - V_BIG, 0);
  // which way is back along its path (on the sky, at the rock)
  const tan = new THREE.Vector3().subVectors(BIG0, IMPACT_DIR);
  tan.addScaledVector(dir, -tan.dot(dir)).normalize();
  return { dir, size, rockR, I, k, trailLen, tan, trail: smooth(V_BIG, V_IMPACT - 1, v) };
}

// ---------- the streak mesh ----------
export function makeStreaks(scene, max = 4000) {
  const geo = new THREE.PlaneGeometry(1, 2, 1, 1).translate(0.5, 0, 0);    // x 0..1 along, y -1..1 across
  const aA = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);    // tail xyz, half-width (px)
  const aB = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);    // head xyz, half-width (px)
  const aK = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);    // rgb, kind (0 meteor, 1 train, 2 fireball, 3 ember)
  const aS = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2);    // seed, age
  geo.setAttribute('aA', aA); geo.setAttribute('aB', aB); geo.setAttribute('aK', aK); geo.setAttribute('aS', aS);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uRes: { value: new THREE.Vector2(1080, 1920) }, uTime: { value: 0 }, uGain: { value: 1 } },
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec4 aA; attribute vec4 aB; attribute vec4 aK; attribute vec2 aS;
      uniform vec2 uRes;
      varying vec2 vQ; varying vec4 vK; varying vec2 vS; varying float vLen;
      void main() {
        vec4 ca = projectionMatrix * viewMatrix * vec4(aA.xyz, 1.0);
        vec4 cb = projectionMatrix * viewMatrix * vec4(aB.xyz, 1.0);
        vK = aK; vS = aS;
        if (ca.w < 0.05 || cb.w < 0.05) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        vec2 pa = ca.xy / ca.w * 0.5 * uRes, pb = cb.xy / cb.w * 0.5 * uRes;
        vec2 d = pb - pa; float L = length(d);
        vec2 dir = L > 1e-3 ? d / L : vec2(0.0, 1.0), n = vec2(-dir.y, dir.x);
        float s = position.x;
        float w = mix(aA.w, aB.w, s);
        // the caps: the quad runs a half-width past each end
        float cap = (s < 0.5 ? -1.0 : 1.0) * max(aA.w, aB.w);
        vec4 c = mix(ca, cb, s);
        vec2 off = n * position.y * w + dir * cap;
        c.xy += off / (0.5 * uRes) * c.w;
        gl_Position = c;
        vLen = L;
        vQ = vec2(s * L + cap, position.y * w);          // pixels along (0 at the tail) and across
        vQ = vec2(vQ.x / max(L, 1e-3), position.y);
        vS.y = aS.y; vLen = L + 2.0 * abs(cap);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uGain;
      varying vec2 vQ; varying vec4 vK; varying vec2 vS; varying float vLen;
      float h(float x){ return fract(sin(x * 91.7) * 43758.5); }
      float n1(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h(i), h(i + 1.0), f); }
      float h2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float q2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
      float fb(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * q2(p); p = p * 2.07 + 1.3; a *= 0.5; } return s; }
      void main() {
        float s = vQ.x, y = vQ.y;
        float kind = vK.w;
        vec3 c = vK.rgb;
        float a;
        float ends = smoothstep(-0.02, 0.06, s) * (1.0 - smoothstep(1.0, 1.04 + 4.0 / max(vLen, 1.0), s));
        if (kind < 0.5) {
          // a meteor: thin, brightest at the head, fading back along the tail; a blue-green head, warmer tail
          float core = exp(-y * y * 5.0);
          float along = pow(clamp(s, 0.0, 1.0), 2.2);
          a = core * along * ends;
          c = mix(c * vec3(1.15, 0.85, 0.7), c * vec3(0.8, 1.1, 1.15), smoothstep(0.6, 1.0, s));
        } else if (kind < 1.5) {
          // a train: a soft green band, lumpy along its length, fading with age
          float lump = 0.45 + 0.55 * n1(s * 18.0 + vS.x * 40.0 + vS.y * 0.6) * n1(s * 7.0 - vS.x * 13.0);
          a = exp(-y * y * 2.2) * lump * smoothstep(0.0, 0.12, s) * (1.0 - smoothstep(0.85, 1.0, s));
        } else if (kind < 2.5) {
          // a fireball's trail: a white-hot core, orange edges, flickering
          float core = exp(-y * y * 7.0), edge = exp(-y * y * 1.6);
          float along = pow(clamp(s, 0.0, 1.0), 1.4);
          float fl = 0.8 + 0.2 * n1(s * 30.0 - uTime * 40.0 + vS.x * 9.0);
          c = c * core * 1.4 + vec3(1.0, 0.42, 0.1) * edge * 0.6 * length(c);
          a = along * fl * ends;
        } else if (kind > 3.5) {
          // the biggest one's trail: fire by the rock turning to glowing smoke further back; turbulence rushing back;
          // torn, crisp edges (vS.y: the rock's radius in pixels)
          float u = (1.0 - s) * vLen / max(vS.y, 1.0);          // rock radii back from the rock
          float n = fb(vec2(u * 0.55 - uTime * 6.0, y * 2.2 + 3.0)) * 0.7 + fb(vec2(u * 1.6 - uTime * 11.0, y * 5.0)) * 0.3;
          float edge = abs(y) + (n - 0.5) * 0.85;
          float body = 1.0 - smoothstep(0.42, 0.62, edge);
          float core = exp(-y * y * 9.0);
          float fireK = max(exp(-u / 14.0), smoothstep(0.55, 1.0, s));
          vec3 fire = mix(vec3(1.0, 0.32, 0.05), vec3(1.0, 0.8, 0.45), core * fireK * (0.5 + 0.6 * n));
          vec3 smk = vec3(0.32, 0.2, 0.13) * (0.35 + 0.8 * n);
          c *= mix(smk, fire * (0.55 + 0.9 * n), fireK);
          a = body * ends * (0.3 + 0.7 * s) * smoothstep(0.0, 0.08, s);
        } else {
          // an ember: a short glowing streak with a dull red tail (a rock still glowing as it falls)
          float core = exp(-y * y * 4.0);
          float along = pow(clamp(s, 0.0, 1.0), 1.6);
          c = mix(c * vec3(1.0, 0.35, 0.12), c, smoothstep(0.7, 1.0, s) * core);
          a = core * along * ends;
        }
        gl_FragColor = vec4(c * a * uGain, 1.0);
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false; mesh.renderOrder = 4;
  scene.add(mesh);
  let n = 0;
  return {
    mat,
    begin() { n = 0; },
    // tail, head: world positions; wa, wb: half-widths (px); colour; kind
    add(tail, head, wa, wb, r, g, b, kind = 0, seed = 0, age = 0) {
      if (n >= max || r + g + b < 0.002) return;
      aA.setXYZW(n, tail.x, tail.y, tail.z, wa); aB.setXYZW(n, head.x, head.y, head.z, wb);
      aK.setXYZW(n, r, g, b, kind); aS.setXY(n, seed, age); n++;
    },
    end() { mesh.count = n; for (const a of [aA, aB, aK, aS]) a.needsUpdate = true; },
  };
}

// ---------- each frame: put every streak, head and train in, and collect the light they throw ----------
// lights: [{ dir, I, r, g, b }] (the fireballs and the big one, brightest first)
const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3(), vD = new THREE.Vector3();
let firstIdx = 0;
export function drawMeteors(v, cam, streaks, glows, pxPerRad) {
  const C = cam.position;
  const lights = [];
  const sky = (d, out) => out.copy(d).multiplyScalar(RS).add(C);
  // the shower
  while (firstIdx > 0 && SHOWER[firstIdx].t0 > v - 6) firstIdx--;
  while (firstIdx < SHOWER.length - 1 && SHOWER[firstIdx].t0 < v - 6) firstIdx++;
  for (let i = firstIdx; i < SHOWER.length; i++) {
    const m = SHOWER[i];
    if (m.t0 > v) break;
    const age = v - m.t0;
    const u = age / m.dur;
    if (u <= 1) {
      const br = m.B * Math.sin(Math.PI * Math.min(u * 1.1, 1)) ** 0.6;
      const uh = u, ut = Math.max(0, u - 0.45);
      fromRadiant(m.d0 + m.L * uh, m.phi, vC); fromRadiant(m.d0 + m.L * ut, m.phi, vD);
      sky(vD, vA); sky(vC, vB);
      const w = 1.1 + 0.6 * Math.min(m.B, 2);
      const g = 0.75 + 0.25 * m.hue;
      streaks.add(vA, vB, w * 0.5, w, 2.0 * br, 2.15 * br * g, 2.3 * br, 0, m.hue);
      glows.add(vB.x, vB.y, vB.z, RS * (0.0028 + 0.0028 * m.B), 0.9 * br, 1.1 * br, 1.2 * br);
    }
    if (m.train > 0 && age > m.dur * 0.3 && age < m.dur + m.train) {
      const ta = age - m.dur * 0.3, k = (1 - smooth(0, m.train, ta)) * smooth(0, 0.25, ta) * 0.16 * m.B;
      fromRadiant(m.d0 + m.L * 0.12, m.phi + ta * 0.3, vC); fromRadiant(m.d0 + m.L * Math.min(age / m.dur, 0.95), m.phi + ta * 0.2, vD);
      sky(vC, vA); sky(vD, vB);
      const w = 2.0 + ta * 2.2;
      streaks.add(vA, vB, w, w, 0.25 * k, 1.0 * k, 0.55 * k, 1, m.hue * 7.3, ta);
    }
  }
  // the fireballs
  for (const f of FIREBALLS) {
    const age = v - f.t0;
    if (age < 0 || age > f.dur + f.train) continue;
    const u = age / f.dur;
    if (u <= 1) {
      const br = fbLight(f, u);
      fromRadiant(f.d0 + f.L * u, f.phi, vC); fromRadiant(f.d0 + f.L * Math.max(0, u - 0.6), f.phi, vD);
      sky(vD, vA); sky(vC, vB);
      const wpx = f.size * DEG * pxPerRad * 0.35 * (0.6 + 0.4 * br);
      streaks.add(vA, vB, wpx * 0.25, wpx, 1.4 * br, 1.3 * br, 1.15 * br, 2, f.t0);
      glows.add(vB.x, vB.y, vB.z, RS * f.size * DEG * (1.2 + 0.6 * br), 3 * br, 3.1 * br, 3.2 * br);
      glows.add(vB.x, vB.y, vB.z, RS * f.size * DEG * 4, 0.6 * br, 0.62 * br, 0.7 * br);
      // breaking up: pieces peeling off the head, each with its own little trail
      if (f.breakUp > 0 && u > 0.7) {
        for (let k = 0; k < 6; k++) {
          const du = (u - 0.7) * (0.25 + 0.12 * k), dp = (k - 2.5) * 1.1 * (u - 0.7) * 3;
          fromRadiant(f.d0 + f.L * (u - du), f.phi + dp, vC); fromRadiant(f.d0 + f.L * (u - du - 0.08), f.phi + dp, vD);
          sky(vD, vA); sky(vC, vB);
          const b = br * 0.5 * f.breakUp;
          streaks.add(vA, vB, 0.6, 2.2, 2.0 * b, 1.4 * b, 0.8 * b, 0, k);
          glows.add(vB.x, vB.y, vB.z, RS * 0.006, 1.5 * b, 1.2 * b, 0.8 * b);
        }
      }
      lights.push({ dir: vC.clone(), I: f.I * br, r: 0.85, g: 0.92, b: 1.0 });
    }
    // its train: a long glowing green-white trail that lingers and drifts
    if (age > f.dur * 0.2) {
      const ta = age - f.dur * 0.2, k = (1 - smooth(0, f.train, ta)) * smooth(0, 0.4, ta) * 0.5;
      fromRadiant(f.d0 + f.L * 0.05, f.phi - ta * 0.15, vC); fromRadiant(f.d0 + f.L * Math.min(u, 1) * 0.98, f.phi + ta * 0.25, vD);
      sky(vC, vA); sky(vD, vB);
      const w = f.size * DEG * pxPerRad * 0.18 + ta * 3.0;
      streaks.add(vA, vB, w, w, 0.3 * k, 0.9 * k, 0.6 * k, 1, f.t0 * 3.1, ta);
    }
  }
  // the rocks coming down
  for (const r of ROCKS) {
    const { u, p } = rockAt(r, v, vB);
    if (u < 0 || u > 1.001) continue;
    const head = p.clone();
    const tail = rockAt(r, v - r.fall * 0.22, vA).p;
    const d = Math.max(head.distanceTo(C), 1);
    const wpx = Math.max(1.6, r.size * 0.6 / d * pxPerRad);
    const br = (1.2 + 1.5 * r.big) * (1 - 0.5 * smooth(0.75, 1, u)) * smooth(0, 0.08, u);
    streaks.add(tail, head, wpx * 0.3, wpx, 2.2 * br, 1.7 * br, 1.2 * br, 3, r.t1);
    glows.add(head.x, head.y, head.z, r.size * (2.2 + 2 * r.big), 4 * br, 3.2 * br, 2.2 * br);
    glows.add(head.x, head.y, head.z, r.size * 0.6, 12 * br, 11 * br, 9 * br);
    if (r.big) lights.push({ dir: head.clone().sub(C).normalize(), I: 0.5 * br, r: 1, g: 0.8, b: 0.6, pos: head });
  }
  // the biggest one (its rock is rock.js, its flames bighead.js: here its trail, the chunks it sheds, a faint glow)
  const big = bigAt(v);
  if (big) {
    const hd = sky(big.dir, new THREE.Vector3());
    const I = big.I;
    const rockPx = big.rockR * DEG * pxPerRad, rockW = big.rockR * DEG * RS;
    glows.add(hd.x, hd.y, hd.z, rockW * 3.0, 0.05 * I, 0.04 * I, 0.03 * I);
    // the trail: fire near the rock turning to glowing smoke further back, torn at the edges
    const L = big.trailLen * DEG;
    const back = vC.copy(big.dir).multiplyScalar(Math.cos(L)).addScaledVector(big.tan, Math.sin(L));
    sky(back, vA);
    const ti = Math.min(0.6 + 0.1 * I, 1.4);
    streaks.add(vA, hd, rockPx * 2.6 + 6, rockPx * 1.15, ti, ti, ti, 4, 9.1, Math.max(rockPx, 1));
    // chunks of flame shed along the trail, each with a short tail of its own
    for (let k = 0; k < 12; k++) {
      const s0 = (k * 0.618) % 1, ph = (v * (0.45 + 0.2 * s0) + s0) % 1;
      const along = (1.6 + ph * 9) * big.rockR * DEG, side = (((k * 0.37) % 1) - 0.5) * (2.0 + 3.0 * ph) * big.rockR * DEG;
      const pd = vC.copy(big.dir).addScaledVector(big.tan, along).addScaledVector(vD.crossVectors(big.dir, big.tan), side).normalize();
      sky(pd, vB);
      const pt = vC.copy(pd).addScaledVector(big.tan, (0.8 + ph) * big.rockR * DEG).normalize();
      sky(pt, vA);
      const b = Math.min(I, 8) * 0.28 * (1 - ph);
      streaks.add(vA, vB, 0.6 + rockPx * 0.05, 1.5 + rockPx * 0.14, 2 * b, 1.1 * b, 0.35 * b, 3, k);
    }
    lights.push({ dir: big.dir.clone(), I: I, r: 1.0, g: 0.9, b: 0.8, big: true });
  }
  lights.sort((a, b) => b.I - a.I);
  return { lights, big };
}

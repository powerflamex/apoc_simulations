// The fountain: a round stone basin (you stand on its south ledge), a two-tier pedestal with one big jet (13 m/s,
// 8.6 m high while gravity is on) and a ring of ten jets fanned out like a tulip (6.6 m/s at 70°: arcs 2 m high).
// The water is drawn as blobs: every blob is shot from its nozzle at a known story time and flies on its own (gravity
// before t = 0, a straight line while it's off, gravity again after 5 s), so the streams straighten into columns the
// instant gravity goes, the falling halves of the arcs splash in, and those splashes' drops keep rising. The basin's
// stirred water grows fingers (crests and splash jets that keep going up). makeBlobs() is shared with the pool.
import * as THREE from 'three';
import { BASIN, PED, JET0, RING } from './layout.js';
import { G, T_ON } from './timeline.js';
import { CU, HAZE_GLSL, hazed } from './city.js';
import { rng } from './util.js';

export const WU = { uSkyHi: CU.uSkyHi, uSkyLo: CU.uSkyLo, uSun: CU.uSun, uSunCol: CU.uSunCol, uT: { value: 0 }, uFoam: { value: 0 } };
const HZ = { uHaze: CU.uHaze, uHazeD: CU.uHazeD, uFog: CU.uFog, uFogCol: CU.uFogCol, uFogD: CU.uFogD };
const WATER_PARS = /* glsl */ `
  uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform vec3 uSun; uniform vec3 uSunCol;
  uniform vec3 uHaze; uniform float uHazeD; uniform float uFog; uniform vec3 uFogCol; uniform float uFogD;
  ${HAZE_GLSL}
  vec3 skyR(vec3 r) {
    float h = clamp(r.y, -0.3, 1.0);
    vec3 c = mix(uSkyLo, uSkyHi, pow(smoothstep(0.0, 0.8, h), 0.6));
    return mix(c, vec3(0.3, 0.29, 0.27), smoothstep(0.0, -0.2, r.y));
  }`;

// ---- water blobs: instanced ellipsoids, each set by (centre, axis, radius, length) ----
export function makeBlobs(scene, max) {
  const geo = new THREE.SphereGeometry(1, 12, 9);
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...WU, ...HZ },
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW;
      void main(){ vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz;
        vN = normalize(mat3(modelMatrix * instanceMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `varying vec3 vN; varying vec3 vW;
      ${WATER_PARS}
      void main(){
        vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
        if (dot(N, V) < 0.0) N = -N;
        float fr = 0.08 + 0.92 * pow(1.0 - max(dot(N, V), 0.0), 4.0);
        vec3 body = vec3(0.62, 0.78, 0.84) * (0.55 + 0.5 * max(dot(N, uSun), 0.0)) + vec3(0.18, 0.24, 0.27);
        vec3 c = mix(body, skyR(reflect(-V, N)) * 1.15, fr);
        c += uSunCol * 3.5 * pow(max(dot(reflect(-uSun, N), V), 0.0), 60.0);
        c = hazeIt(c, vW);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false; mesh.castShadow = true;
  scene.add(mesh);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), d = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  let n = 0;
  return {
    mesh,
    begin() { n = 0; },
    // centre (x, y, z), direction (dx, dy, dz: need not be unit), radius r, half-length along the direction hl
    add(x, y, z, dx, dy, dz, r, hl) {
      if (n >= max || r <= 0.002) return;
      d.set(dx, dy, dz); const L = d.length();
      if (L > 1e-6) q.setFromUnitVectors(Y, d.multiplyScalar(1 / L)); else q.identity();
      m4.compose(p.set(x, y, z), q, sc.set(r, Math.max(hl, r), r));
      mesh.setMatrixAt(n++, m4);
    },
    end() { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; },
    get count() { return n; },
  };
}

// where a blob shot at story time te from p0 with velocity v0 is at story time t (gravity on before 0 and after T_ON);
// returns false if it has hit the water (inside the basin) or the ground (outside) by then; out: x y z vx vy vz,
// and out.hit: the time it hit (if it did)
const WY = BASIN.water;
function phase(o, dt, grav) {
  o.x += o.vx * dt; o.z += o.vz * dt;
  if (grav) { o.y += o.vy * dt - 0.5 * G * dt * dt; o.vy -= G * dt; } else o.y += o.vy * dt;
}
// first time in [0, dt] the height y0 + vy s (- g s²/2) reaches h going down, or -1
function hitTime(y0, vy, dt, grav, h) {
  if (y0 <= h) return 0;
  if (!grav) { if (vy >= 0) return -1; const s = (h - y0) / vy; return s <= dt ? s : -1; }
  const s = (vy + Math.sqrt(vy * vy + 2 * G * (y0 - h))) / G;
  return s <= dt ? s : -1;
}
export function blobAt(te, p0, v0, t, o, floorFn) {
  if (t < te) { o.hit = Infinity; return false; }
  o.x = p0[0]; o.y = p0[1]; o.z = p0[2]; o.vx = v0[0]; o.vy = v0[1]; o.vz = v0[2]; o.hit = Infinity;
  // the three legs: [te, 0) gravity, [0, T_ON) none, [T_ON, t] gravity
  const legs = [[te, Math.min(t, 0), true], [Math.max(te, 0), Math.min(t, T_ON), false], [Math.max(te, T_ON), t, true]];
  for (const [a, b, grav] of legs) {
    const dt = b - a; if (!(dt > 0)) continue;
    const h = floorFn(o.x, o.z);
    const s = hitTime(o.y, o.vy, dt, grav, h);
    if (s >= 0 && (o.vy < 0 || grav)) { phase(o, s, grav); o.hit = a + s; return false; }
    phase(o, dt, grav);
  }
  return true;
}
// the surface a blob dies on: the basin's water inside the rim, the pedestal top, the ground outside
export const floorOf = (x, z) => { const r = Math.hypot(x, z); return r < PED.r * 0.6 ? PED.h : r < BASIN.rIn ? WY : r < BASIN.rOut ? BASIN.ledge : 0; };

export function makeFountain(scene, ctx) {
  const stone = hazed(new THREE.MeshStandardMaterial({ color: 0xd2ccc0, roughness: 0.75 }));
  // the basin wall and its ledge (a lathe: inner wall, rounded coping, outer wall)
  const prof = [[BASIN.rIn, -0.05], [BASIN.rIn, BASIN.ledge - 0.06], [BASIN.rIn + 0.03, BASIN.ledge - 0.01], [BASIN.rIn + 0.1, BASIN.ledge], [BASIN.rOut - 0.1, BASIN.ledge],
    [BASIN.rOut - 0.03, BASIN.ledge - 0.01], [BASIN.rOut, BASIN.ledge - 0.06], [BASIN.rOut + 0.04, 0.05], [BASIN.rOut + 0.04, -0.02]].map(([r, y]) => new THREE.Vector2(r, y));
  const rim = new THREE.Mesh(new THREE.LatheGeometry(prof, 160), stone);
  ctx.shadowy(rim); scene.add(rim);
  // the pedestal: a drum, a wide bowl, a column, a small cap with the nozzle
  const pg = new THREE.LatheGeometry([[0, 0], [PED.r, 0], [PED.r, 0.5], [PED.r + 0.08, 0.56], [0.55, 0.6], [0.45, 0.78], [0.95, 0.86], [1.0, 0.92], [0.42, 0.95],
    [0.3, 1.1], [0.36, 1.18], [0.18, 1.25], [0.06, 1.3], [0, 1.3]].map(([r, y]) => new THREE.Vector2(r, y)), 64);
  const ped = new THREE.Mesh(pg, stone);
  ctx.shadowy(ped); scene.add(ped);
  // the ring nozzles: little bronze stubs
  const nz = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.07, 0.2, 10).translate(0, 0.08, 0), ctx.plainMat(0x6a5032, 0.4, { metalness: 0.6 }), RING.length);
  RING.forEach((J, i) => nz.setMatrixAt(i, new THREE.Matrix4().makeTranslation(J.x, 0, J.z)));
  nz.castShadow = true; scene.add(nz);

  // ---- the basin's water surface: sky reflection, ripples, foam where the jets land ----
  const surf = new THREE.Mesh(new THREE.CircleGeometry(BASIN.rIn + 0.01, 128).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: { ...WU, ...HZ },
    transparent: true, depthWrite: true,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `varying vec3 vW; uniform float uT; uniform float uFoam;
      ${WATER_PARS}
      float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      float hgt(vec2 p){ float r = length(p);
        return 0.5 * n2(p * 3.0 + vec2(uT * 0.9, -uT * 0.7)) + 0.3 * n2(p * 7.0 - vec2(uT * 1.6, uT * 1.1)) + 0.25 * sin(r * 9.0 - uT * 7.0) * exp(-abs(r - 5.9) * 1.2); }
      void main(){
        vec2 p = vW.xz; float r = length(p);
        float e = 0.02;
        vec3 N = normalize(vec3(-(hgt(p + vec2(e, 0.0)) - hgt(p - vec2(e, 0.0))) * 0.6, 2.0 * e * 6.0, -(hgt(p + vec2(0.0, e)) - hgt(p - vec2(0.0, e))) * 0.6));
        vec3 V = normalize(cameraPosition - vW);
        float fr = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 c = mix(vec3(0.05, 0.2, 0.24), skyR(reflect(-V, N)), fr);
        c += uSunCol * 4.0 * pow(max(dot(reflect(-uSun, N), V), 0.0), 220.0);
        float foam = uFoam * smoothstep(0.55, 0.9, n2(p * 6.0 + uT) * exp(-pow(abs(r - 5.95) / 0.7, 2.0)) + 0.35 * exp(-pow(r / 1.6, 2.0)));
        c = mix(c, vec3(0.9, 0.93, 0.95), foam * 0.8);
        float a = mix(0.55, 0.97, fr) + foam * 0.4;
        c = hazeIt(c, vW);
        gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  surf.position.y = BASIN.water; surf.renderOrder = 2;
  scene.add(surf);

  // ---- the jets' blobs: emission lists ----
  const R = rng(808);
  const JETS = [];
  {
    // the big jet: straight up, a little jitter per blob (so the falling water before 0 spreads into an umbrella)
    const rate = JET0.v / 0.09, list = [];
    for (let te = -2.4; te < 6.3; te += 1 / rate) {
      const a = R() * Math.PI * 2, j = 0.18 + 0.3 * R() * R();
      list.push({ te, p: [JET0.x, JET0.y, JET0.z], v: [Math.cos(a) * j, JET0.v * (0.985 + 0.03 * R()), Math.sin(a) * j], r: JET0.r * (0.75 + 0.5 * R()), s: R() });
    }
    JETS.push({ list, r: JET0.r, v: JET0.v, sp: 1 / rate * JET0.v });
    for (const J of RING) {
      const rt = J.v / 0.075, L = [];
      const ux = Math.cos(J.a), uz = Math.sin(J.a);
      for (let te = -1.6; te < 6.3; te += 1 / rt) {
        const j = 0.05 * (R() - 0.5), vh = J.v * Math.cos(J.el), vy = J.v * Math.sin(J.el);
        L.push({ te, p: [J.x, J.y, J.z], v: [ux * vh + j, vy * (0.99 + 0.02 * R()), uz * vh + 0.05 * (R() - 0.5)], r: J.r * (0.75 + 0.5 * R()), s: R() });
      }
      JETS.push({ list: L, r: J.r, v: J.v, sp: 1 / rt * J.v });
    }
  }
  // the long stops: the pumps keep going for a minute (and more): the same jets, thinned (every 3rd blob of the big
  // jet, every 8th of the ring's, a little fatter), shot until gravity's back plus a few seconds
  const JETS_LONG = [];
  {
    const RL = rng(909);
    const rate = JET0.v / 0.09 / 3, list = [];
    for (let te = -2.4; te < 66; te += 1 / rate) {
      const a = RL() * Math.PI * 2, j = 0.18 + 0.3 * RL() * RL();
      list.push({ te, p: [JET0.x, JET0.y, JET0.z], v: [Math.cos(a) * j * 0.3, JET0.v * (0.985 + 0.03 * RL()), Math.sin(a) * j * 0.3], r: JET0.r * 1.25 * (0.75 + 0.5 * RL()), s: RL() });
    }
    JETS_LONG.push({ list, r: JET0.r, v: JET0.v, sp: 1 / rate * JET0.v * 0.45 });
    for (const J of RING) {
      const rt = J.v / 0.075 / 8, L = [];
      const ux = Math.cos(J.a), uz = Math.sin(J.a);
      for (let te = -1.6; te < 66; te += 1 / rt) {
        const jj = 0.05 * (RL() - 0.5), vh = J.v * Math.cos(J.el), vy = J.v * Math.sin(J.el);
        L.push({ te, p: [J.x, J.y, J.z], v: [ux * vh + jj, vy * (0.99 + 0.02 * RL()), uz * vh + 0.05 * (RL() - 0.5)], r: J.r * 1.5 * (0.75 + 0.5 * RL()), s: RL() });
      }
      JETS_LONG.push({ list: L, r: J.r, v: J.v, sp: 1 / rt * J.v * 0.2 });
    }
  }
  // splash drops thrown up where the falling water hits (only the hits after gravity goes off matter: those drops
  // never come back). Found by running every blob once.
  const DROPS = [];
  {
    const o = {};
    for (const J of JETS) for (const b of J.list) {
      if (b.te > 0) continue;
      if (blobAt(b.te, b.p, b.v, 1.0, o, floorOf)) continue;
      if (!(o.hit >= -0.25 && o.hit < 0.9)) continue;
      const n = R() < 0.7 ? 1 : 0;
      for (let k = 0; k < n; k++) {
        const a = R() * Math.PI * 2, up = 0.4 + 2.6 * R() * R(), sd = 0.25 + 0.9 * R();
        DROPS.push({ te: o.hit, p: [o.x, floorOf(o.x, o.z) + 0.01, o.z], v: [Math.cos(a) * sd + o.vx * 0.15, up, Math.sin(a) * sd + o.vz * 0.15], r: 0.004 + 0.011 * R() * R() });
      }
    }
  }
  // fingers: the stirred water's crests and splash jets that keep rising from the basin: [x, z, up speed, radius]
  const FING = [];
  for (let k = 0; k < 64; k++) {
    const inner = k < 14;
    const a = R() * Math.PI * 2, r = inner ? PED.r + 0.15 + 0.6 * R() : 5.1 + 1.6 * R();
    FING.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, u: 0.15 + 0.9 * R() * R(), rad: (inner ? 0.04 : 0.03) + 0.08 * R() * R(), t0: 0.05 + 0.3 * R(), s: R() });
  }

  const blobs = makeBlobs(scene, 15000);
  const HITS = [];
  const o = {};
  return {
    blobs, JETS, DROPS, FING, surf, HITS,
    frame(t) {
      WU.uT.value = t;
      // foam where the arcs come down: full before 0, gone ~0.6 s after (nothing lands while it's off), back after 0.00
      WU.uFoam.value = t < 0.15 ? 1 : t < T_ON ? Math.max(0, 1 - (t - 0.15) / 0.5) : Math.min(1, (t - T_ON - 0.25) / 0.3);
      blobs.begin();
      HITS.length = 0;
      let nh = 0;
      for (const J of (T_ON === 5 ? JETS : JETS_LONG)) {
        for (const b of J.list) {
          if (b.te > t) break;
          if (!blobAt(b.te, b.p, b.v, t, o, floorOf)) {
            // water that has come back down since 0.00: a splash where it lands (every other blob)
            if (o.hit > T_ON && t - o.hit < 0.5 && (nh++ & 1) === 0 && HITS.length < 300) HITS.push([o.x, floorOf(o.x, o.z), o.z, t - o.hit]);
            continue;
          }
          const age = t - b.te;
          // near the nozzle a smooth rope (blobs stretched along the flow, overlapping), further out it breaks into
          // separate wobbling drops
          const brk = Math.min(1, age / 0.35);
          const sp = Math.hypot(o.vx, o.vy, o.vz);
          const hl = J.sp * 0.75 * (1 - brk) + b.r * (1 + 0.6 * brk * Math.sin(b.s * 40 + t * 6));
          const rr = b.r * (1 - 0.25 * brk) * (0.9 + 0.2 * Math.sin(b.s * 17 + age * 9));
          const wob = 0.012 * brk * Math.min(age, 2);
          blobs.add(o.x + wob * Math.sin(b.s * 31), o.y, o.z + wob * Math.cos(b.s * 29), o.vx, o.vy, o.vz, rr, Math.max(hl, rr) * (sp > 0.1 ? 1 : 0.5));
        }
      }
      for (const d of DROPS) if (blobAt(d.te, d.p, d.v, t, o, floorOf)) blobs.add(o.x, o.y, o.z, o.vx, o.vy, o.vz, d.r, d.r * 1.3);
      // fingers: a neck from the water up to a round head; the neck pinches off after a while and the head flies on
      for (const F of FING) {
        const tt = Math.min(t, T_ON) - F.t0;
        if (tt <= 0) continue;
        let top = WY + F.u * tt;
        // gravity back: the heads fall back in
        if (t > T_ON) { const s = t - T_ON; top += F.u * s - 0.5 * G * s * s; if (top < WY) continue; }
        const len = top - WY;
        const pinch = len > F.rad * 9 ? Math.min(1, (len - F.rad * 9) / (F.rad * 6)) : 0;
        const nb = 6;
        for (let k = 0; k <= nb; k++) {
          const f = k / nb;
          if (f < pinch * 0.85 && k < nb) continue;
          const y = WY + len * f;
          const rr = k === nb ? F.rad : F.rad * (0.45 + 0.35 * (1 - f)) * (1 - 0.6 * pinch);
          blobs.add(F.x + 0.03 * Math.sin(F.s * 9 + f * 3), y, F.z + 0.03 * Math.cos(F.s * 7 + f * 3), 0, 1, 0, rr, Math.max(rr, len / nb * 0.6));
        }
      }
    },
  };
}

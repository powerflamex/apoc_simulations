// The Moon coming apart as real 3D rock (from the burst until the pieces are ground into the ring):
//   - the 7 big pieces (rockgeo.js) fit the cracks exactly at the burst, then drift apart and tumble, so their sunlit
//     faces turn away (the dark side goes black) and the broken grey walls, glowing hot at first, come round;
//   - collisions (timeline SHATTER), all in the first seconds and overlapping: the big piece rams one, two pairs grind
//     into each other, a fragment flung from a crash breaks the last; each crash flashes, puffs dust, and breaks the
//     piece into its 5 fragments, which spring apart and tumble faster, with a spray of rubble squirting out sideways;
//   - then the fragments keep crashing into each other, more and more often (timeline CRASHES: they jolt apart, a
//     flash, dust, gravel), shed gravel and shrink; everything is dragged out along the Moon's orbit (the shear that
//     makes the ring), and in the time-lapse's leap from 2 days to 3 weeks it is strung out into the band;
//   - the big piece (BIG_PIECE) never breaks: it rams two others and slowly grows as it sinks toward you.
// All of it hangs in a group 20 km out along the Moon's direction, scaled so 1 unit = 1 Moon radius at the lens's
// magnification (the same mapping as the sky shader), drawn on top of the sky; the city in front hides it as usual.
import * as THREE from 'three';
import { buildMoonPieces, SEEDS } from './rockgeo.js';
import { MOON_FNS, MOON_DIR, SCR_R, SCR_UP } from './sky.js';
import { makeGlows } from './glows.js';
import { ALPHA, V_BURST, SHATTER, CRASHES, BIG_PIECE, storyT, shearR } from './timeline.js';
import { ORBIT_TILT } from './layout.js';
import { smooth, clamp, rng } from './util.js';

const D = 20000;
const HR = 3600, DAY = 86400;
const UORB = new THREE.Vector3(Math.cos(ORBIT_TILT * Math.PI / 180), Math.sin(ORBIT_TILT * Math.PI / 180), 0);
// the Sun, behind you and a little left and up (the same light as the full Moon on the first frames)
const L_LOCAL = new THREE.Vector3(-0.3, 0.14, 1).normalize();

// how far the big pieces have drifted apart (x where each started from the middle), and the shear along the orbit
// (a quick first shove from the blast, then the slow drift of a loosely bound pile)
const drift = (T) => 1.9 * (1 - Math.exp(-Math.pow(Math.max(0, T) / (8 * HR), 0.5))) + 0.4 * (1 - Math.exp(-Math.max(0, T) / 500));
const shear = shearR;       // (Moon radii: ~5 at 2 days, ~85 at 3 weeks)

const ROCK_VS = /* glsl */ `
  varying vec3 vO, vS, vN;
  void main() {
    vO = position;
    vS = mat3(modelMatrix) * position;
    vN = mat3(modelMatrix) * normal;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }`;
const ROCK_FS = /* glsl */ `
  uniform vec3 uL;
  uniform float uHot, uBright;
  varying vec3 vO, vS, vN;
  ${MOON_FNS}
  float n3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h31(i), h31(i + vec3(1, 0, 0)), f.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), f.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
  void main() {
    float r = length(vO);
    // the old surface (the Moon's face, or its far side) vs the broken rock inside
    float outer = smoothstep(0.955, 0.985, r);
    vec3 nS = normalize(vS);
    float far = 1.0 - smoothstep(-0.12, 0.12, vO.z);
    vec3 farA = vec3(0.8, 0.78, 0.74) * (0.86 + 0.24 * (vn(vO.xy * 34.0) * 0.6 + vn(vO.xy * 80.0 + 3.0) * 0.4))
      * (1.0 - 0.3 * smoothstep(0.55, 0.75, vn(vO.xy * 3.0 + 9.0)));
    vec3 alb = mix(moonAlbedo(vO.xy), farA, far);
    vec3 colS = alb * (0.025 + 0.975 * pow(max(dot(nS, uL), 0.0), 0.42)) * 0.95;
    // broken rock: grey, grainy, in layers (the crust, then the mantle's darker rock deeper in)
    vec3 g = vec3(n3(vO * 48.0), n3(vO * 48.0 + 7.3), n3(vO * 48.0 + 13.1)) - 0.5 + 0.5 * (vec3(n3(vO * 110.0), n3(vO * 110.0 + 3.1), n3(vO * 110.0 + 5.7)) - 0.5);
    vec3 nC = normalize(normalize(vN) + 0.45 * g);
    float strata = 0.9 + 0.2 * n3(vec3(r * 34.0, vO.x * 2.0, vO.y * 2.0));
    vec3 rock = mix(vec3(0.52, 0.49, 0.45), vec3(0.4, 0.38, 0.36), smoothstep(0.85, 0.5, r)) * strata * (0.85 + 0.3 * n3(vO * 70.0));
    vec3 colC = rock * (0.025 + 1.15 * max(dot(nC, uL), 0.0));
    // fresh breaks glow: orange-hot cracks in the rock, hottest deep inside
    float lava = smoothstep(0.42, 0.75, n3(vO * 9.0) * 0.65 + n3(vO * 26.0) * 0.35) * 0.7 + 0.3;
    colC += vec3(3.2, 1.2, 0.3) * uHot * lava * (1.0 - outer) * 1.3;
    gl_FragColor = vec4(mix(colC, colS, outer) * uBright, 1.0);
  }`;

// the gravel and small rocks: lumpy, sunlit grey (hot orange when fresh)
const GRAVEL_VS = /* glsl */ `
  attribute float aHot;
  varying vec3 vN; varying float vHot, vK;
  void main() {
    mat4 m = modelMatrix * instanceMatrix;
    vN = mat3(m) * normal;
    vHot = aHot;
    vK = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453);
    gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.0);
  }`;
const GRAVEL_FS = /* glsl */ `
  uniform vec3 uL; uniform float uBright;
  varying vec3 vN; varying float vHot, vK;
  void main() {
    vec3 a = vec3(0.58, 0.55, 0.51) * (0.6 + 0.7 * vK);
    vec3 col = a * (0.03 + 1.2 * max(dot(normalize(vN), uL), 0.0)) + vec3(3.0, 1.15, 0.3) * vHot;
    gl_FragColor = vec4(col * uBright, 1.0);
  }`;

export function makeMoonRocks(scene) {
  const P = buildMoonPieces();
  const group = new THREE.Group();
  group.matrixAutoUpdate = false;
  scene.add(group);
  const basis = new THREE.Matrix4().makeBasis(SCR_R, SCR_UP, MOON_DIR.clone().negate());
  const L = L_LOCAL.clone().applyMatrix4(basis).normalize();
  const mkMat = () => new THREE.ShaderMaterial({ uniforms: { uL: { value: L }, uHot: { value: 0 }, uBright: { value: 1 } }, vertexShader: ROCK_VS, fragmentShader: ROCK_FS, fog: false });
  const glows = makeGlows(scene, 700);

  // ---- the 7 pieces and how they move ----
  const PC = P.map((p, i) => {
    const R = rng(70 + i);
    const ax = new THREE.Vector3(R() - 0.5, R() - 0.5, (R() - 0.5) * 0.6).normalize();
    const mesh = new THREE.Mesh(p.geo, mkMat());
    mesh.matrixAutoUpdate = false; mesh.frustumCulled = false;
    group.add(mesh);
    return {
      ...p, mesh, sd: SEEDS[i], k: 0.75 + 0.5 * R(), perp: (R() - 0.5) * 0.5, ax,
      // a turn every 1.5-3 days (the big piece slower)
      w: (R() < 0.5 ? -1 : 1) * 2 * Math.PI / ((1.5 + 1.5 * R()) * DAY) * (i === BIG_PIECE ? 0.6 : 1),
      vBreak: Infinity, frags: [],
    };
  });
  // who hits whom: the big piece rams 3; 5 and 6 grind into each other, so do 0 and 1 (mutual: both move, half way
  // each); a fragment flung out of the 0-1 crash breaks 2 (striker: { piece } or { frag: parent })
  const STRIKER = { 3: { piece: BIG_PIECE }, 5: { piece: 6, mutual: true }, 6: { piece: 5, mutual: true }, 1: { piece: 0, mutual: true }, 0: { piece: 1, mutual: true }, 2: { frag: 1 } };
  const EV = SHATTER.map(([cell, v]) => ({ cell, v, T: storyT(v), by: STRIKER[cell] || { piece: BIG_PIECE } }));
  for (const e of EV) PC[e.cell].vBreak = e.v;
  const LEAD = 0.9;          // how long (video s) a striker takes to close in

  const tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
  // where piece i is at video time v (centre, rotation, scale) - before any striker pulls it in
  function freePiece(i, v, out) {
    const c = PC[i], T = Math.max(0, storyT(v));
    const d = drift(T) * c.k;
    out.p.set(c.c.x + c.sd[0] * d - c.sd[1] * d * c.perp, c.c.y + c.sd[1] * d + c.sd[0] * d * c.perp, c.c.z);
    out.q.setFromAxisAngle(c.ax, c.w * T);
    out.s = 1;
    if (i === BIG_PIECE) {
      // it sinks toward you: lower on screen and bigger
      const g = smooth(2.0, 10.5, v);
      out.s = 1 + 0.6 * g;
      out.p.y -= 0.3 * g; out.p.x -= 0.15 * g;
      out.p.addScaledVector(UORB, 0.3 * shear(T));                       // (dragged along the orbit with the rest)
      out.s *= 1 - 0.6 * smooth(11.5, 14.5, v);                          // (and ground down too)
    }
    return out;
  }
  // with the strikers closing in on their victims (and recoiling after)
  function piecePose(i, v, out) {
    freePiece(i, v, out);
    for (const e of EV) {
      if (e.by.piece !== i) continue;
      const u = clamp((v - (e.v - LEAD)) / LEAD), pull = (v <= e.v ? u * u * u : Math.exp(-(v - e.v) / 0.6) * 0.85) * (e.by.mutual ? 0.5 : 1);
      if (pull <= 0) continue;
      const vic = freePiece(e.cell, Math.min(v, e.v), { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 });
      const target = vic.p.clone().addScaledVector(tmpV.copy(PC[i].c).sub(PC[e.cell].c), 0.84 * (0.5 + 0.5 * out.s));
      out.p.lerp(target, pull);
    }
    return out;
  }

  // ---- the fragments ----
  // each event: where the crash happens (between striker and victim), and the victim's 5 fragments flying apart
  const posePiece = (i, v) => piecePose(i, v, { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 });
  const FR = [];
  for (const e of EV) {
    const vic = PC[e.cell], pv = posePiece(e.cell, e.v);
    let sp;
    if (e.by.piece !== undefined) sp = posePiece(e.by.piece, e.v).p;
    else sp = null;            // (a fragment: filled in below once fragments exist)
    e.vicPose = pv;
    e.sp = sp;
    vic.frags = vic.subs.map((sub, j) => {
      const R = rng(900 + e.cell * 10 + j);
      const mesh = new THREE.Mesh(sub.geo, mkMat());
      mesh.matrixAutoUpdate = false; mesh.frustumCulled = false; mesh.visible = false;
      group.add(mesh);
      // where it is at the moment of the crash
      const p0 = tmpV2.copy(sub.c).sub(vic.c).applyQuaternion(pv.q).add(pv.p).clone();
      const f = { parent: e.cell, j, e, sub, mesh, p0, q0: pv.q.clone(), vBorn: e.v, TBorn: e.T, vDie: Infinity,
        ax: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(), w: (R() < 0.5 ? -1 : 1) * 2 * Math.PI / ((0.25 + 0.5 * R()) * DAY),
        sh: (R() * 2 - 1) * 1.0, speed: 0.08 + 0.12 * R(), pop: 0.05 + 0.07 * R(), rnd: new THREE.Vector3(R() - 0.5, R() - 0.5, (R() - 0.5) * 0.5), kicks: [] };
      FR.push(f);
      return f;
    });
  }
  // fragment strikers: the fragment of the named parent that starts nearest the victim
  for (const e of EV) {
    if (e.by.frag === undefined) continue;
    const vc = PC[e.cell].c;
    let best = null, bd = 1e9;
    for (const f of PC[e.by.frag].frags) { const d = f.p0.distanceTo(vc); if (d < bd) { bd = d; best = f; } }
    best.strike = e; best.vDie = e.v + 0.12;
    e.striker = best;
  }
  // each fragment's direction away from its crash point
  for (const e of EV) {
    const C = e.sp ? e.vicPose.p.clone().lerp(e.sp, 0.45) : e.vicPose.p.clone().addScaledVector(tmpV.copy(e.striker.p0).sub(e.vicPose.p).normalize(), 0.45);
    e.C = C;
    for (const f of PC[e.cell].frags) f.dir = f.p0.clone().sub(C).normalize().add(f.rnd.clone().multiplyScalar(0.8)).normalize();
  }
  // a fragment's pose at video time v (free flight)
  function fragFree(f, v, out) {
    const dtH = Math.max(0, storyT(v) - f.TBorn) / HR, dv = Math.max(0, v - f.vBorn);
    out.p.copy(f.p0).addScaledVector(f.dir, f.pop * (1 - Math.exp(-dv / 0.3)) + f.speed * 10 * (1 - Math.exp(-dtH / 10)));
    out.p.addScaledVector(UORB, f.sh * (shear(storyT(v)) - shear(f.TBorn)));
    // the jolts from crashing into other fragments
    for (const k of f.kicks) if (v > k.v) out.p.addScaledVector(k.dir, k.amt * (1 - Math.exp(-(v - k.v) / 0.4)));
    out.q.setFromAxisAngle(f.ax, f.w * dtH * HR).multiply(f.q0);
    // ground down: it sheds gravel and shrinks
    out.s = 1 - 0.45 * smooth(f.vBorn + 1.0, 10.5, v) - 0.25 * smooth(11, 13.5, v);
    return out;
  }
  function fragPose(f, v, out) {
    fragFree(f, v, out);
    if (f.strike) {
      const e = f.strike, v0 = Math.max(e.v - LEAD * 1.3, f.vBorn + 0.02), u = clamp((v - v0) / (e.v - v0)), pull = u * u * u;
      if (pull > 0) {
        const vic = freePiece(e.cell, Math.min(v, e.v), { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 });
        out.p.lerp(vic.p.clone().addScaledVector(tmpV.copy(f.p0).sub(PC[e.cell].c).normalize(), 0.42), pull);
      }
    }
    return out;
  }
  // the crash point of fragment-struck events: where the fragment meets the victim
  for (const e of EV) if (e.striker) {
    const sp = fragPose(e.striker, e.v, { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 }).p;
    e.C = e.vicPose.p.clone().lerp(sp, 0.55);
    for (const f of PC[e.cell].frags) f.dir = f.p0.clone().sub(e.C).normalize().add(f.rnd.clone().multiplyScalar(0.8)).normalize();
  }

  // ---- the gravel (instanced small rocks) ----
  const rockGeo = new THREE.IcosahedronGeometry(1, 1);
  {
    const p = rockGeo.attributes.position, R = rng(5);
    const bump = new Map();
    for (let i = 0; i < p.count; i++) {
      const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      if (!bump.has(key)) bump.set(key, 0.65 + 0.55 * R());
      const k = bump.get(key);
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k);
    }
    rockGeo.computeVertexNormals();
  }
  const GR = [];
  const R = rng(77);
  const addG = (v0, p0, dir, speed, pop, size, hot, sh) => GR.push({ v0, T0: Math.max(0, storyT(v0)), p0, dir, speed, pop, size, hot, sh,
    ax: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(), w: 2 * Math.PI / ((0.1 + 0.4 * R()) * DAY) });
  const rdir = () => new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize();
  const sizeOf = (a, b) => a * Math.pow(b / a, Math.pow(R(), 2.2));
  // the burst: rubble blown out of every crack
  for (let n = 0; n < 340;) {
    const x = (R() * 2 - 1) * 0.98, y = (R() * 2 - 1) * 0.98;
    if (x * x + y * y > 0.96) continue;
    // (mostly along the cracks: near the boundary between two cells)
    const ds = SEEDS.map((s) => Math.hypot(x - s[0], y - s[1])).sort((a, b) => a - b);
    if (ds[1] - ds[0] > 0.08 && R() > 0.15) continue;
    const zf = Math.sqrt(1 - x * x - y * y);
    const p0 = new THREE.Vector3(x, y, zf * (0.6 + 0.4 * R()));
    const dir = new THREE.Vector3(x, y, 0.6 + R()).normalize().add(rdir().multiplyScalar(0.5)).normalize();
    addG(V_BURST, p0, dir, 0.3 + 1.2 * R(), 0.15 + 0.6 * Math.pow(R(), 1.5), sizeOf(0.006, 0.04), 1, (R() * 2 - 1) * 1.3);
    n++;
  }
  // each crash: a spray squirting out sideways (across the line of the hit), and a puff
  for (const e of EV) {
    const axis = (e.sp ? e.sp.clone() : fragPose(e.striker, e.v, { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 }).p).sub(e.vicPose.p).normalize();
    e.axis = axis;
    for (let n = 0; n < 150; n++) {
      const d = rdir();
      d.addScaledVector(axis, -0.85 * d.dot(axis)).normalize();
      addG(e.v, e.C.clone().addScaledVector(rdir(), 0.08 * R()), d, 0.1 + 0.6 * R(), 0.08 + 0.4 * Math.pow(R(), 1.6), sizeOf(0.005, 0.035), 0.9, (R() * 2 - 1) * 1.3);
    }
  }
  // the fragments crashing into each other (timeline CRASHES): a fragment and its nearest neighbour jolt apart, with a
  // flash, a puff and a spray of gravel where they meet
  const CR = [];
  {
    const pa = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 }, pb = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 };
    for (const c of CRASHES) {
      const alive = FR.filter((f) => f.vBorn < c.v - 0.25 && f.vDie > c.v + 0.3);
      if (alive.length < 2) continue;
      const f = alive[Math.floor(c.seed * alive.length)];
      fragPose(f, c.v, pa);
      let g = null, bd = 1e9;
      for (const o of alive) { if (o === f) continue; fragPose(o, c.v, pb); const d = pb.p.distanceTo(pa.p); if (d < bd) { bd = d; g = o; } }
      fragPose(g, c.v, pb);
      const axis = pb.p.clone().sub(pa.p).normalize();
      const C = pa.p.clone().lerp(pb.p, 0.5);
      const R4 = rng(Math.floor(c.seed * 1e6));
      const puffs = Array.from({ length: 5 }, () => ({ d: new THREE.Vector3(R4() - 0.5, R4() - 0.5, 0.3 + R4() * 0.4).normalize(), s: 0.5 + 0.6 * R4() }));
      CR.push({ v: c.v, C, size: c.size, puffs });
      f.kicks.push({ v: c.v, dir: axis.clone().negate(), amt: 0.08 * c.size });
      g.kicks.push({ v: c.v, dir: axis.clone(), amt: 0.08 * c.size });
      for (let n = 0; n < 40 * c.size; n++) {
        const d = rdir();
        d.addScaledVector(axis, -0.85 * d.dot(axis)).normalize();
        addG(c.v, C.clone().addScaledVector(rdir(), 0.05 * R()), d, 0.05 + 0.3 * R(), 0.05 + 0.25 * Math.pow(R(), 1.6), sizeOf(0.004, 0.025), 0.7, (f.sh + g.sh) / 2 + (R() - 0.5) * 0.6);
      }
    }
  }
  // the grinding: gravel shed by the fragments as they keep knocking together
  const tmpPose = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 };
  for (let n = 0; n < 900; n++) {
    const v0 = 2.6 + 9.6 * Math.pow(R(), 0.8);
    const alive = FR.filter((f) => f.vBorn < v0 - 0.3 && f.vDie > v0);
    if (!alive.length) continue;
    const f = alive[Math.floor(R() * alive.length)];
    fragPose(f, v0, tmpPose);
    addG(v0, tmpPose.p.clone().addScaledVector(rdir(), f.sub.r * 0.45 * tmpPose.s), rdir(), 0.02 + 0.1 * R(), 0.01 + 0.05 * R(), sizeOf(0.004, 0.022), 0.15 * R(), f.sh + (R() - 0.5) * 0.5);
  }
  const gravel = new THREE.InstancedMesh(rockGeo, new THREE.ShaderMaterial({ uniforms: { uL: { value: L }, uBright: { value: 1 } }, vertexShader: GRAVEL_VS, fragmentShader: GRAVEL_FS, fog: false }), GR.length);
  const aHot = new THREE.InstancedBufferAttribute(new Float32Array(GR.length), 1);
  rockGeo.setAttribute('aHot', aHot);
  gravel.frustumCulled = false;
  group.add(gravel);

  // the small flashes as the fragments keep hitting each other (on a fragment, picked at random)
  const SPARK = [];
  { const R2 = rng(31); for (let t = 2.6; t < 12.6; t += 0.16 + R2() * 0.28) SPARK.push({ v: t, pick: R2(), off: new THREE.Vector3(R2() - 0.5, R2() - 0.5, 0.5).multiplyScalar(0.4), I: 0.5 + R2() * 0.7 }); }
  // the puffs at each crash
  for (const e of EV) { const R3 = rng(400 + e.cell); e.puffs = Array.from({ length: 9 }, () => ({ d: new THREE.Vector3(R3() - 0.5, R3() - 0.5, 0.3 + R3() * 0.4).normalize(), s: 0.6 + 0.8 * R3() })); }

  const m4 = new THREE.Matrix4(), mC = new THREE.Matrix4(), sc = new THREE.Vector3();
  const setPose = (mesh, pose, c) => {
    mesh.matrix.compose(pose.p, pose.q, sc.set(pose.s, pose.s, pose.s)).multiply(mC.makeTranslation(-c.x, -c.y, -c.z));
    mesh.matrixWorldNeedsUpdate = true;
  };
  const toWorld = (p) => p.clone().applyMatrix4(group.matrixWorld);

  return {
    group,
    frame(v, s, camera, px) {
      glows.begin();
      const on = v >= V_BURST && s.pieces > 0;
      group.visible = on;
      if (!on) { glows.end(); return; }
      const fade = s.pieces;
      // the group: out along the Moon's direction, at the lens's magnification
      const k = D * ALPHA * s.M;
      group.matrix.copy(basis).scale(sc.set(k, k, k)).setPosition(tmpV.copy(camera.position).addScaledVector(MOON_DIR, D));
      group.matrixWorldNeedsUpdate = true;
      group.updateMatrixWorld(true);
      const T = Math.max(0, s.T);
      const pose = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 };
      // the big pieces
      PC.forEach((c, i) => {
        const vis = v < c.vBreak;
        c.mesh.visible = vis;
        if (!vis) return;
        piecePose(i, v, pose);
        pose.s *= i === BIG_PIECE ? fade : 1;
        setPose(c.mesh, pose, c.c);
        c.mesh.material.uniforms.uHot.value = Math.exp(-T / 1500);
      });
      // the fragments
      for (const f of FR) {
        const vis = v >= f.vBorn && v < f.vDie;
        f.mesh.visible = vis;
        if (!vis) continue;
        fragPose(f, v, pose);
        if (f.strike) pose.s *= 1 - smooth(f.strike.v - 0.05, f.vDie, v);
        pose.s *= fade;
        setPose(f.mesh, pose, f.sub.c);
        f.mesh.material.uniforms.uHot.value = 0.55 * Math.exp(-Math.max(0, T - f.TBorn) / 1500) + 0.15 * Math.exp(-T / 1500);
      }
      // the gravel
      let n = 0;
      for (const g of GR) {
        if (v < g.v0) continue;
        const Tg = Math.max(0, T - g.T0), dv = v - g.v0;
        tmpV.copy(g.p0).addScaledVector(g.dir, g.pop * (1 - Math.exp(-dv / 0.35)) + g.speed * 6 * (1 - Math.exp(-Tg / HR / 6)));
        tmpV.addScaledVector(UORB, g.sh * (shear(T) - shear(g.T0)));
        tmpQ.setFromAxisAngle(g.ax, g.w * Tg);
        // (never smaller than ~1 pixel: far off, the gravel stays a glint instead of flickering out)
        const sz = Math.max(g.size, 1.1 * px / (ALPHA * s.M)) * fade * smooth(g.v0, g.v0 + 0.08, v);
        gravel.setMatrixAt(n, m4.compose(tmpV, tmpQ, sc.set(sz, sz, sz)));
        aHot.setX(n, g.hot * Math.exp(-dv / 0.6) * 1.2);
        n++;
      }
      gravel.count = n;
      gravel.instanceMatrix.needsUpdate = true; aHot.needsUpdate = true;

      // ---- light: the crashes (a flash and a puff of sunlit dust), the burst, the grinding sparks ----
      const W = (r) => Math.max(r * k, 3 * px * D);
      for (const e of EV) {
        const dt = v - e.v;
        if (dt < -0.03 || dt > 2.5) continue;
        const C = toWorld(tmpV.copy(e.C).add(tmpV2.set(0, 0, 1.4)));
        const fl = Math.exp(-Math.max(0, dt) / 0.16);
        glows.add(C.x, C.y, C.z, W(0.5 + 0.8 * Math.max(0, dt)), 4.5 * fl, 3.4 * fl, 2.4 * fl);
        for (const p of e.puffs) {
          const a = smooth(0, 0.15, dt) * Math.exp(-Math.max(0, dt) / 0.9) * fade;
          const hot = Math.exp(-Math.max(0, dt) / 0.25);
          const P2 = toWorld(tmpV.copy(e.C).addScaledVector(p.d, (0.1 + 0.35 * Math.sqrt(Math.max(0, dt))) * p.s).add(tmpV2.set(0, 0, 1.3)));
          glows.add(P2.x, P2.y, P2.z, W((0.18 + 0.4 * Math.sqrt(Math.max(0, dt))) * p.s), (0.32 + 1.6 * hot) * a, (0.3 + 0.7 * hot) * a, (0.27 + 0.2 * hot) * a);
        }
      }
      const db = v - V_BURST;
      if (db < 1.5) {
        const C = toWorld(tmpV.set(0, 0, 1.2)), a = Math.exp(-db / 0.25);
        glows.add(C.x, C.y, C.z, W(1.6), 2.2 * a, 1.6 * a, 1.0 * a);
      }
      for (const c of CR) {
        const dt = v - c.v;
        if (dt < -0.02 || dt > 1.8) continue;
        const C = toWorld(tmpV.copy(c.C).add(tmpV2.set(0, 0, 1.2)));
        const fl = Math.exp(-Math.max(0, dt) / 0.12) * c.size;
        glows.add(C.x, C.y, C.z, W(0.25 + 0.4 * Math.max(0, dt)), 3.6 * fl, 2.6 * fl, 1.7 * fl);
        for (const p of c.puffs) {
          const a = smooth(0, 0.12, dt) * Math.exp(-Math.max(0, dt) / 0.7) * fade * c.size, hot = Math.exp(-Math.max(0, dt) / 0.2);
          const P2 = toWorld(tmpV.copy(c.C).addScaledVector(p.d, (0.05 + 0.2 * Math.sqrt(Math.max(0, dt))) * p.s).add(tmpV2.set(0, 0, 1.1)));
          glows.add(P2.x, P2.y, P2.z, W((0.1 + 0.25 * Math.sqrt(Math.max(0, dt))) * p.s), (0.3 + 1.4 * hot) * a, (0.28 + 0.6 * hot) * a, (0.25 + 0.2 * hot) * a);
        }
      }
      const alive = FR.filter((f) => v >= f.vBorn + 0.4 && v < f.vDie);
      for (const sp of SPARK) {
        const dt = v - sp.v;
        if (dt < 0 || dt > 0.4 || !alive.length) continue;
        const f = alive[Math.floor(sp.pick * alive.length)];
        fragPose(f, v, pose);
        const C = toWorld(tmpV.copy(pose.p).addScaledVector(sp.off, f.sub.r * pose.s));
        const a = sp.I * Math.exp(-dt / 0.09) * fade;
        glows.add(C.x, C.y, C.z, W(0.16), 3.0 * a, 2.2 * a, 1.5 * a);
      }
      glows.end();
    },
  };
}

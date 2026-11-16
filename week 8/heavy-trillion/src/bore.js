// The hole you punch down through the rock, its own scene: you stay at the origin (your feet at y = 0) and the rock
// streams up past you. The wall (one open cylinder, radius RS, a single shader) is a pure function of the depth of
// each point: the station's concrete and fill for the first metres, then Manhattan-style schist (dark grey, silver
// mica glints, white quartz veins), deeper grey gneiss, then the rock glows by its temperature: dull red cracks below
// the crust (~35 km), orange flowing mantle rock, the liquid iron of the outer core (2,890 km), white-hot.
// What lights it: the rock you crush under your feet glows (white-orange, uFeet), the station's light from the hole
// above for the first seconds (uTop), and in the deep the rock's own glow.
// Speed: the pattern along the hole is box-blurred over one frame of travel (octaves finer than the blur fade out).
// At x1e12 (uCrush) the wall near you bulges in and splits with hot cracks: the rock is being pulled onto you.
// The debris: gravel, chunks and water drops that fell into the hole with you fall alongside you; from V_GRAV your
// gravity pulls them in and they orbit you (angular speed sqrt(GM / r³), from timeline's real GM, capped for sight);
// from V_MTN pieces torn off the wall stream in onto you; sparks of glowing rock stream up from your feet.
import * as THREE from 'three';
import { V_SINK, V_GRAV, V_ORBIT, V_WALLS, V_MTN, V_KOLA, GMAt, depthAt, speedAt, rateAt, D_STATION } from './timeline.js';
// the angle round the shaft your face points at (main.js turns you slowly: yaw = PI/2 - 0.35 + 0.06 (v - V_SINK))
export const faceAng = (v) => 0.35 - 0.06 * (v - V_SINK);
import { makeGlows } from './glows.js';
import { makeLayers, CAVE, SEWER_R, NMINE } from './layers.js';
import { rng, smooth, clamp, lerp } from './util.js';

export const RS = 0.95;                    // the hole: hardly wider than you (it's drawn jagged, 0.65-1.25 m)
const LEN = 900;
const OCT = [0.7, 2.6, 10, 40, 160, 640, 2560, 10240, 40960, 163840];

// where the wall's pattern is: the real flow (m of hole per video second), eased off above F0 so it streams instead of
// flickering; tabulated over the video
// (through the named layers the rock streams at a readable 12-30 m/s; in the mantle time-lapse it may race)
const capAt = (v) => 14 + 16 * smooth(21.0, 22.0, v) + 90 * smooth(29.0, 32.0, v);
const seenFlowV = (f, v) => { const F0 = 0.4 * capAt(v), FCAP = capAt(v); return f <= F0 ? f : F0 + (FCAP - F0) * (1 - Math.exp(-(f - F0) / (FCAP - F0))); };
const flowAt = (v) => (v < V_SINK ? 0 : speedAt(v) * rateAt(v));
const SDT = 1 / 240, SV0 = V_SINK - 0.5;
const ST = new Float64Array(Math.ceil((60 - SV0) / SDT) + 2);
{ let x = 0; for (let i = 0; i < ST.length; i++) { ST[i] = x; const vv = SV0 + (i + 0.5) * SDT; x += seenFlowV(flowAt(vv), vv) * SDT; } }
export function seenAt(v) {
  const x = (v - SV0) / SDT, i = clamp(Math.floor(x), 0, ST.length - 2), f = clamp(x - i, 0, 1);
  return ST[i] + (ST[i + 1] - ST[i]) * f;
}
export const seenFlowAt = (v) => seenFlowV(flowAt(v), v);

export function makeBore() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const U = {
    uD: { value: 0 },                       // depth of your feet below the street (m)
    uOff: { value: new Float32Array(OCT.length) },
    uScale: { value: new Float32Array(OCT) },
    uBlur: { value: 0 },
    uTime: { value: 0 },
    uFeet: { value: new THREE.Color(1, 0.6, 0.25) },   // the glow under your feet (HDR)
    uTop: { value: 1 },                     // the station's light from above
    uCrush: { value: 0 },
    uWhite: { value: 0 },
    uSeenM: { value: 0 },                  // where the strata pattern is (m, wrapped)
    uSewerY: { value: -1e4 }, uCaveY: { value: -1e4 }, uMineY: { value: new Float32Array(NMINE).fill(-1e4) }, uMineA: { value: new Float32Array(NMINE) },
  };
  const geo = new THREE.CylinderGeometry(RS, RS, LEN * 2, 72, 700, true);
  // (rings packed close round you, sparse far off: y = LEN u³)
  { const pa = geo.attributes.position; for (let i = 0; i < pa.count; i++) { const u = pa.getY(i) / LEN; pa.setY(i, LEN * u * u * u); } }
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    side: THREE.BackSide,
    vertexShader: /* glsl */ `
      uniform float uCrush, uTime, uSeenM; varying vec3 vP;
      float vh(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(vh(i), vh(i + vec2(1, 0)), f.x), mix(vh(i + vec2(0, 1)), vh(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec3 p = position;
        // the wall near you bulges in (pulled toward you), flowing past
        float a = atan(p.z, p.x);
        float near = exp(-p.y * p.y / 30.0);
        float bump = vn(vec2(a * 3.0, p.y * 0.5 + uTime * 3.0)) * 0.6 + 0.4;
        p.xz *= 1.0 - uCrush * near * 0.25 * bump;
        // jagged: the rock you smash through breaks unevenly, lumps and ledges sticking in (they move with the rock)
        float al = uSeenM - p.y;
        vec2 cs = vec2(cos(a), sin(a));
        float j = vn(cs * 1.6 + vec2(al * 0.45, -al * 0.3)) * 0.55 + vn(cs * 4.0 + vec2(-al * 1.3, al * 1.1)) * 0.3 + vn(cs * 9.0 + vec2(al * 3.0, al * 2.7)) * 0.15;
        float ledge = smoothstep(0.55, 0.75, vn(vec2(al * 0.35, cs.x * 1.3 + cs.y * 0.7)));
        p.xz *= max(0.66, 0.66 + 0.62 * j - 0.18 * ledge);
        vP = (modelMatrix * vec4(p, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      #define NO ${OCT.length}
      uniform float uD, uOff[NO], uScale[NO], uBlur, uTime, uTop, uCrush, uWhite, uSeenM, uSewerY, uCaveY, uMineY[${NMINE}], uMineA[${NMINE}];
      uniform vec3 uFeet;
      varying vec3 vP;
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n2(vec2 p) {
        vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
      }
      float nw(float x, float y, float P) {
        float i = floor(x), f = fract(x); float u = f * f * (3.0 - 2.0 * f);
        float y0 = mod(floor(y), 4096.0), y1 = mod(floor(y) + 1.0, 4096.0);
        float a = mix(h21(vec2(mod(i, P), y0)), h21(vec2(mod(i + 1.0, P), y0)), u);
        float b = mix(h21(vec2(mod(i, P), y1)), h21(vec2(mod(i + 1.0, P), y1)), u);
        float fy = fract(y); fy = fy * fy * (3.0 - 2.0 * fy);
        return mix(a, b, fy);
      }
      vec2 cells(float x, float y, float P) {
        vec2 p = vec2(x, y), i = floor(p), f = fract(p);
        float d1 = 9.0, d2 = 9.0, id = 0.0;
        for (int a = -1; a <= 1; a++) for (int b = -1; b <= 1; b++) {
          vec2 g = vec2(float(a), float(b)), c = i + g;
          vec2 cw = vec2(mod(c.x, P), mod(c.y, 4096.0));
          vec2 r = g + vec2(h21(cw), h21(cw + 17.3)) * 0.8 + 0.1 - f;
          float d = dot(r, r);
          if (d < d1) { d2 = d1; d1 = d; id = h21(cw + 3.1); } else if (d < d2) d2 = d;
        }
        return vec2(sqrt(d2) - sqrt(d1), id);
      }
      float fbw(float x, float y, float P) { return 0.55 * nw(x, y, P) + 0.3 * nw(x * 2.0, y * 2.0 + 5.0, P * 2.0) + 0.15 * nw(x * 4.0, y * 4.0 + 9.0, P * 4.0); }
      void main() {
        float th = atan(vP.z, vP.x);
        float dq = -vP.y;                                   // m deeper than your feet
        float D = uD + dq;                                  // depth below the street (m)
        float km = D / 1000.0;
        // openings: the sewer pipe, the cave, the mine's tunnels
        { float yy = vP.y - uSewerY; if (yy * yy + vP.z * vP.z < ${(SEWER_R*SEWER_R).toFixed(3)}) discard; }
        { float yy = (vP.y - uCaveY) / ${CAVE.b.toFixed(1)}; vec2 xz = vP.xz / ${CAVE.a.toFixed(1)}; if (dot(xz, xz) + yy * yy < 0.8 * 0.8) discard; }
        float tunLight = 0.0;
        for (int k = 0; k < ${NMINE}; k++) {
          float dy = vP.y - uMineY[k];
          float da = abs(mod(th - uMineA[k] + 3.14159, 6.28318) - 3.14159) * ${RS.toFixed(1)};
          if (abs(dy) < 1.4 && da < 0.85) discard;
          tunLight += exp(-max(abs(dy) - 1.4, 0.0) * 0.9) * exp(-max(da - 0.85, 0.0) * 0.8);   // the tunnel's light spilling out
        }
        float ang = (th + 3.14159) / 6.2832;
        float circ = 6.2832 * ${RS.toFixed(1)};
        float pxw = max(fwidth(dq), 1e-4);
        float blur = max(uBlur, pxw * 1.5);
        float bands[NO];
        for (int k = 0; k < NO; k++) {
          float sc = uScale[k];
          float u = uOff[k] + dq / sc;
          float b = blur / sc;
          float ring = floor(circ / sc + 0.5);
          float x = ang * max(ring, 1.0);
          float sharp = (ring >= 1.0) ? nw(x, u, max(ring, 1.0)) : n2(vec2(float(k) * 17.0, u));
          float streak = (ring >= 1.0) ? nw(x * 3.0, float(k) * 13.0 + uTime * 0.6, max(ring, 1.0) * 3.0) : 0.5;
          float m = smoothstep(0.35, 1.6, b);
          bands[k] = mix(sharp, mix(0.5, streak, 0.55), m);
        }
        float strata = bands[3] * 0.35 + bands[4] * 0.3 + bands[5] * 0.2 + bands[2] * 0.15;
        float grain = bands[0] * 0.6 + bands[1] * 0.4;
        float y1 = uOff[1] + dq / uScale[1], y2 = uOff[2] + dq / uScale[2], y3 = uOff[3] + dq / uScale[3];
        float clr2 = smoothstep(0.9, 0.25, blur / uScale[2]);
        float clr1 = smoothstep(0.9, 0.25, blur / uScale[1]);
        float clr0 = smoothstep(0.9, 0.25, blur / uScale[0]);

        // ---- the rock's colour ----
        // the station's slab, the fill under it, then the bedrock: clear coloured strata (gneiss, schist, marble,
        // amphibolite...), a few metres to tens of metres thick, tilted a little; deeper, darker and hotter-looking
        float sy = uSeenM + dq + 1.6 * sin(th + 0.7) + 0.6 * sin(th * 2.0 + 2.0);
        float bi = floor(sy / 2.6 + 0.45 * sin(sy / 9.0));
        float bh = h21(vec2(bi, 3.7));
        vec3 band = vec3(0.55, 0.37, 0.32);                                   // pink gneiss
        band = mix(band, vec3(0.16, 0.16, 0.18), step(0.18, bh));             // dark schist
        band = mix(band, vec3(0.78, 0.76, 0.7), step(0.38, bh));              // white marble
        band = mix(band, vec3(0.5, 0.3, 0.16), step(0.52, bh));               // rusty iron-stained rock
        band = mix(band, vec3(0.22, 0.27, 0.22), step(0.66, bh));             // green amphibolite
        band = mix(band, vec3(0.62, 0.52, 0.36), step(0.8, bh));              // tan quartzite
        band = mix(band, vec3(0.32, 0.3, 0.3), step(0.92, bh));               // grey granite
        float edgeB = abs(fract(sy / 2.6 + 0.45 * sin(sy / 9.0)) - 0.5);
        band *= (0.7 + 0.45 * grain) * 0.8;
        band *= 1.0 - 0.6 * (1.0 - smoothstep(0.0, 0.03, 0.5 - edgeB)) * clr1;   // the dark seams between layers
        { vec2 ck = cells(ang * 41.0, (uSeenM + dq) / 0.85, 41.0); band *= 1.0 - 0.3 * (1.0 - smoothstep(0.02, 0.06, ck.x)) * clr0; band *= 0.85 + 0.3 * ck.y * clr0; }   // cracks and blocks
        float qv = fbw(ang * 7.0, y2 * 0.9, 7.0);
        float quartz = (1.0 - smoothstep(0.0, 0.035, abs(qv - 0.5))) * mix(0.4, 1.0, clr2);
        band = mix(band, vec3(0.85, 0.83, 0.78), quartz * 0.8);
        band = mix(band, band * 0.55 + vec3(0.05, 0.02, 0.0), smoothstep(12000.0, 33000.0, D));
        vec3 fill = mix(vec3(0.36, 0.3, 0.24), vec3(0.5, 0.48, 0.44), step(0.5, n2(vec2(ang * 40.0, y1 * 4.0)))) * (0.8 + 0.3 * grain);
        vec3 concr = vec3(0.55, 0.54, 0.5) * (0.85 + 0.2 * grain);
        vec3 alb = concr;
        alb = mix(alb, fill, smoothstep(7.5, 7.8, D));
        alb = mix(alb, band, smoothstep(14.0, 16.0, D));
        float strataK = 1.0;
        alb *= 0.85 + 0.3 * strata;
        // mica glints catching the light as they pass
        float glint = pow(nw(ang * 90.0, y1 * 5.0 + uTime * 0.2, 90.0), 14.0) * 4.0 * clr0 * (1.0 - smoothstep(8000.0, 20000.0, D));

        // ---- the light on it ----
        float ad = abs(dq + 0.1);
        float feet = 0.4 / (1.0 + ad * ad * 0.25) + 0.05 * exp(-ad / 25.0);           // the glow at your feet
        vec3 L = uFeet * feet;
        float dc = length(vP - cameraPosition);
        L += vec3(0.95, 0.95, 1.0) * 1.1 / (1.0 + dc * dc * 0.3);                     // a soft light from the camera
        L += vec3(1.0, 0.9, 0.72) * tunLight * 1.4;                                      // the mine's lights
        L += vec3(1.0, 0.97, 0.9) * uTop * 1.6 * exp(-max(D - 7.0, 0.0) / 2.5) * step(D, 40.0);   // the station above
        L += vec3(0.05, 0.05, 0.06);                                                       // (a touch, so the dark still reads)
        vec3 col = alb * L + vec3(1.0, 0.9, 0.75) * glint * feet * length(uFeet) * 0.2;

        // ---- the rock's own glow, from the crust's base down: red cracks, flowing orange rock, liquid iron ----
        vec3 gl = vec3(0.0);
        float mant = smoothstep(30000.0, 45000.0, D);
        float deepM = smoothstep(500000.0, 2400000.0, D);
        {
          float flow = deepM * 0.4 * sin(y3 * 1.3 + uTime * 0.5);
          vec2 c2 = cells(ang * 11.0 + flow, y2 * 0.9, 11.0);
          vec2 c1 = cells(ang * 27.0, y2 * 2.2 + 7.0, 27.0);
          float crack = 1.0 - smoothstep(0.02, mix(0.08, 0.18, deepM), c2.x);
          crack = max(crack, (1.0 - smoothstep(0.015, 0.06, c1.x)) * 0.55 * clr2);
          crack = mix(0.35, crack, clr2);
          float plate = 0.5 + 0.5 * c2.y;
          vec3 hotC = mix(vec3(1.0, 0.18, 0.02), vec3(1.0, 0.5, 0.1), deepM);
          vec3 plateC = mix(vec3(0.12, 0.02, 0.0), vec3(0.6, 0.16, 0.02), deepM) * (0.5 + 0.7 * plate);
          plateC *= 0.7 + 0.5 * smoothstep(90000.0, 600000.0, D);
          gl = mix(plateC, hotC * (2.0 + 1.0 * deepM), crack) * mant;
        }
        float liq = smoothstep(2885000.0, 2900000.0, D);
        {
          float q1 = fbw(ang * 6.0 + uTime * 0.35, y2 * 0.6 - uTime * 1.2, 6.0);
          float q2 = fbw(ang * 11.0 + 2.4 * q1 - uTime * 0.6, y2 * 1.1 + 2.8 * q1 + uTime * 0.7, 11.0);
          float crest = smoothstep(0.58, 0.78, q2);
          vec3 iron = mix(vec3(0.38, 0.05, 0.0), vec3(1.0, 0.42, 0.06) * 1.7, smoothstep(0.38, 0.62, q2));
          iron = mix(iron, vec3(1.0, 0.86, 0.55) * 2.8, crest * crest);
          gl = mix(gl, iron, liq);
        }
        col = mix(col + gl, gl + col * 0.15, smoothstep(40000.0, 60000.0, D));
        // ---- x1e12: the wall near you splits with hot cracks as it's dragged in ----
        if (uCrush > 0.0) {
          float near = exp(-dq * dq / 40.0);
          vec2 cc = cells(ang * 18.0, y1 * 1.2 + uTime * 0.0, 18.0);
          float cr = (1.0 - smoothstep(0.02, 0.09, cc.x)) * near * uCrush;
          col = mix(col, vec3(1.0, 0.45, 0.12) * 2.2, cr * 0.85);
          col *= 1.0 - 0.35 * near * uCrush * (0.5 + 0.5 * cc.y);
        }
        col = mix(col, vec3(1.0, 0.97, 0.9) * 3.0, uWhite);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  mat.extensions = { derivatives: true };
  const wall = new THREE.Mesh(geo, mat);
  wall.frustumCulled = false;
  scene.add(wall);

  // lights on you: the glow at your feet (below), a soft fill so your front reads, the station's light from above
  const feetL = new THREE.PointLight(0xffa050, 0, 12, 1.5);
  feetL.position.set(0, -0.15, 0);
  const fill = new THREE.PointLight(0xdfe6ff, 0, 10, 1.6);
  const topL = new THREE.SpotLight(0xfff6e8, 0, 40, 0.5, 0.7, 1.0);
  topL.position.set(0, 12, 0); topL.target.position.set(0, 0, 0);
  const hemi = new THREE.HemisphereLight(0x8090a0, 0x402010, 0.25);
  scene.add(feetL, fill, topL, topL.target, hemi);
  // the white-hot rock under your feet: a squashed glowing blob
  const hotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.8, 0.8), transparent: true, opacity: 1 });
  const hot = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 12).scale(1, 0.32, 1), hotMat);
  hot.position.set(0, -0.06, 0);
  scene.add(hot);

  // ---- the debris that fell in with you: gravel, chunks, water drops ----
  const R = rng(2626);
  const NP = 90, NW = 1, NWALL = 220;
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const stones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), stoneMat, NP + NWALL);
  stones.frustumCulled = false;
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x9fc4e0, roughness: 0.05, metalness: 0.2, emissive: new THREE.Color(0.05, 0.08, 0.12) });
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), waterMat, NW);
  drops.visible = false;   // (no water drops: they read as bubbles in space)
  drops.frustumCulled = false;
  scene.add(stones, drops);
  const cc = new THREE.Color();
  const P = [];
  for (let i = 0; i < NP; i++) {
    const water = false;
    // before your gravity: tumbling round you, wherever they were when the floor went
    const r0 = 0.32 + R() * 0.3, a0 = R() * Math.PI * 2, y0 = -0.3 + R() * 2.4;
    // their orbit: a radius, a tilted plane (most near your waist level), a phase
    const ro = 0.33 + Math.pow(R(), 0.7) * 0.27;
    const tilt = (R() - 0.5) * 0.9, node = R() * Math.PI * 2;
    P.push({ water, r0, a0, y0, ro, tilt, node, ph: R() * Math.PI * 2, cap: 19.4 + R() * 3.0, s: 0.015 + Math.pow(R(), 2) * 0.04, spin: R() * 6, dr: (R() - 0.5) * 0.3, dy: (R() - 0.5) * 0.25 });
    if (!water) stones.setColorAt(i, cc.set(R() < 0.4 ? 0x8a857c : R() < 0.5 ? 0x5a5550 : R() < 0.5 ? 0x3a3530 : 0x9a9488));
  }
  // pieces torn off the wall at x1e11+ (they fly in along spirals and hit you)
  const PW = [];
  for (let k = 0; k < NWALL; k++) {
    PW.push({ t0: V_WALLS + 0.3 + R() * 14, a: R() * Math.PI * 2, y: -2 + R() * 5, s: 0.02 + Math.pow(R(), 2) * 0.09, spin: R() * 9, dur: 0.5 + R() * 0.6, sw: (R() < 0.5 ? -1 : 1) * (0.8 + R() * 1.5) });
    stones.setColorAt(NP + k, cc.set(R() < 0.5 ? 0x4a4440 : 0x2e2a26));
  }
  // the orbit phase: integral of the angular speed sqrt(GM / r³) over the video, for r = 1 m (scaled per radius below)
  const OMAX = 9;                      // rad/s at 1 m at most (faster ones would only strobe on screen)
  const ODT = 1 / 240;
  const OT = new Float64Array(Math.ceil(60 / ODT) + 2);
  { let x = 0; for (let i = 0; i < OT.length; i++) { OT[i] = x; const v = i * ODT; x += (v < V_GRAV ? 0 : Math.min(Math.sqrt(GMAt(v)), OMAX)) * ODT; } }
  const phase1 = (v) => { const x = clamp(v / ODT, 0, OT.length - 2), i = Math.floor(x); return OT[i] + (OT[i + 1] - OT[i]) * (x - i); };
  const glows = makeGlows(scene, 1500);
  const layers = makeLayers(scene, RS);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();

  return {
    scene, U, feetL, fill, topL, hot, glows, layers,
    frame(v, s, camera) {
      const depthFeet = D_STATION + depthAt(v);
      U.uD.value = depthFeet;
      const seen = seenAt(v);
      for (let k = 0; k < OCT.length; k++) U.uOff.value[k] = ((seen / OCT[k]) % 4096 + 4096) % 4096;
      // (uOff is where the pattern is; the shader adds the distance along the hole from you)
      U.uBlur.value = seenFlowAt(v) / 60;
      U.uSeenM.value = seen % 20000;
      U.uTime.value = v;
      U.uTop.value = 1 - smooth(V_SINK + 0.5, V_SINK + 4.0, v);
      U.uCrush.value = smooth(V_MTN - 0.3, V_MTN + 1.2, v);
      // the glow at your feet: brighter the faster you go and the heavier you are
      const sp = speedAt(v);
      const heat = clamp(0.25 + 0.5 * Math.log10(1 + sp / 20) + 0.08 * Math.max(0, s.L - 6), 0, 1.8);
      const fc = new THREE.Color(1.0, 0.55, 0.2).lerp(new THREE.Color(1.0, 0.85, 0.6), smooth(0.8, 1.6, heat));
      U.uFeet.value.copy(fc).multiplyScalar(0.6 + 1.6 * heat);
      feetL.color.copy(fc); feetL.intensity = 3 + 7 * heat;
      hot.scale.setScalar(0.32 + 0.12 * heat);
      hotMat.color.copy(fc).multiplyScalar(0.7 + 0.35 * heat);
      topL.intensity = 60 * U.uTop.value;
      // the named layers, and their openings in the wall
      layers.frame(v, depthFeet, U.uFeet.value, faceAng(V_KOLA) + 0.5 + Math.PI + 0.6);
      const C = layers.CUTS;
      U.uSewerY.value = C.sewerY; U.uCaveY.value = C.caveY;
      U.uMineY.value.set(C.mineY); U.uMineA.value.set(C.mineA);
      // (in the cave your glow reaches further)
      feetL.distance = 12 + 30 * smooth(60, 20, Math.abs(C.caveY));
      // ---- debris ----
      const GM = GMAt(v);
      const ph1 = phase1(v);
      P.forEach((d, i) => {
        // before capture: drifting slowly round you (all falling together)
        const tf = v - V_SINK;
        let x0 = Math.cos(d.a0 + 0.05 * tf) * (d.r0 + d.dr * Math.sin(tf * 0.7)), z0 = Math.sin(d.a0 + 0.05 * tf) * (d.r0 + d.dr * Math.sin(tf * 0.7)), yy0 = d.y0 + d.dy * tf;
        yy0 = clamp(yy0, -1.5, 3.2);
        // pulled in and circling: (an orbit about your middle, 0.9 m up)
        const k = smooth(d.cap, d.cap + 1.6, v);
        const w = Math.pow(1 / d.ro, 1.5);
        const a = d.ph + ph1 * w;
        const ox = Math.cos(a) * d.ro, oy0 = Math.sin(a) * d.ro;
        // tilt the orbit plane about the node line
        const ct = Math.cos(d.tilt), st = Math.sin(d.tilt), cn = Math.cos(d.node), sn = Math.sin(d.node);
        let lx = ox, lz = oy0 * ct, ly = oy0 * st;
        const rx = lx * cn - lz * sn, rz = lx * sn + lz * cn;
        const ox2 = rx, oz2 = rz, oyw = 0.9 + ly;
        // at x1e12 they spiral in and hit you
        const fallIn = smooth(V_MTN + 1.0 + (i % 17) * 0.2, V_MTN + 2.5 + (i % 17) * 0.2, v);
        const shrink = 1 - 0.75 * fallIn;
        let x = lerp(x0, ox2 * shrink, k), z = lerp(z0, oz2 * shrink, k), y = lerp(yy0, 0.9 + (oyw - 0.9) * shrink, k);
        const vis = v >= V_SINK && fallIn < 0.98;
        e.set(d.spin * v, d.spin * 0.7 * v, 0);
        q.setFromEuler(e);
        m4.compose(p.set(x, y, z), q, sc.setScalar(vis ? d.s : 0));
        if (d.water) drops.setMatrixAt(i - NP, m4); else stones.setMatrixAt(i, m4);
      });
      // wall chunks: torn off and flung in along a spiral onto you
      PW.forEach((c, k) => {
        const t = (v - c.t0) / c.dur;
        if (t < 0 || t > 1) { stones.setMatrixAt(NP + k, m4.makeScale(0, 0, 0)); return; }
        const r = lerp(RS * 0.9, 0.25, t * t);
        const a = c.a + c.sw * t;
        e.set(c.spin * t, c.spin * t * 0.6, 0);
        q.setFromEuler(e);
        m4.compose(p.set(Math.cos(a) * r, lerp(c.y, 0.9, t), Math.sin(a) * r), q, sc.setScalar(c.s));
        stones.setMatrixAt(NP + k, m4);
      });
      stones.instanceMatrix.needsUpdate = true; drops.instanceMatrix.needsUpdate = true;
      // sparks: bits of glowing rock streaming up past you from your feet
      glows.begin(camera);
      const RS2 = rng(7);
      const flow = Math.min(seenFlowAt(v), 200);
      for (let k = 0; k < 55; k++) {
        const a = RS2() * 6.28, r = 0.12 + RS2() * 0.3 + RS2() * 0.2, life = 0.25 + RS2() * 0.5;
        const ph = (v * (1 + RS2()) / life + RS2()) % 1;
        const up = ph * (1.5 + flow * 0.02) * (1 + RS2());
        const y = -0.1 + up;
        const b = (1 - ph) * heat * 1.4;
        if (v < V_SINK) continue;
        const rr = Math.min(r + ph * 0.2, 0.6);
        for (let j = 0; j < 3; j++) glows.add(Math.cos(a) * rr, y - j * 0.04 * (1 + flow * 0.01), Math.sin(a) * rr, 0.04, 1.4 * b, 0.6 * b, 0.15 * b);
      }
      // the splash as you plunge through the cave's lake: spray thrown up round you
      const lakeY = layers.CUTS.caveY - CAVE.b * 0.62;
      if (lakeY > -0.3 && lakeY < 9) {
        const RS3 = rng(11), k = smooth(-0.3, 0.4, lakeY) * (1 - smooth(4, 9, lakeY));
        for (let i = 0; i < 140; i++) {
          const a = RS3() * 6.28, r = 0.2 + RS3() * 0.45, up = RS3() * Math.min(lakeY + 0.3, 3.5) * (0.5 + RS3());
          const b = 0.5 * k * (0.5 + RS3());
          glows.add(Math.cos(a) * r, lakeY - up, Math.sin(a) * r, 0.05 + RS3() * 0.06, 0.8 * b, 0.95 * b, 1.0 * b);
        }
      }
      glows.end();
    },
  };
}

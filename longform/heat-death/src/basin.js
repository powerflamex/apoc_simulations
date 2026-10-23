// The city on the plain below the terrace, out to the horizon.
//   The ground: one big plane whose shader draws the street grid (a boulevard every mile, streets every 200 m,
//   freeways across), the roofs of houses on their lots, parks; at night the streets' average glow. Fine detail
//   fades to its average where it gets smaller than a pixel, so nothing shimmers.
//   The lights: points along every street and boulevard (thinned out with distance, the survivors brighter), lit
//   windows scattered in the blocks, and cars driving the boulevards and freeways (white coming, red going). In a
//   time-lapse the cars smear into ribbons (drawn in the ground shader). When the city goes dark it goes out in patches.
//   The buildings: low boxes on the lots close by, and downtown's towers with their windows, lit at night.
import * as THREE from 'three';
import { BASIN, GRID, DOWNTOWN, FREEWAYS, TOWERS, hillH } from './layout.js';
import { patch, FXU } from './fx.js';
import { rng } from './util.js';
import { rangeH } from './terrain.js';

export const BU = {
  uStreak: { value: 0 }, uOut: { value: 0 }, uNightK: { value: 1 },
  uSkyHi: { value: new THREE.Color(0.3, 0.4, 0.6) }, uSkyLo: { value: new THREE.Color(1, 0.6, 0.4) }, uSunDir: { value: new THREE.Vector3(0, 0.1, -1) },
};
const CA = Math.cos(GRID.ang), SA = Math.sin(GRID.ang);
// world <-> grid coordinates
const toGrid = (x, z) => [CA * x - SA * z, SA * x + CA * z];
const toWorld = (u, w) => [CA * u + SA * w, -SA * u + CA * w];

const FW_MIN = FREEWAYS.map(([x0, z0, x1, z1]) => `fwD(vFxW.xz, vec2(${x0.toFixed(1)}, ${z0.toFixed(1)}), vec2(${x1.toFixed(1)}, ${z1.toFixed(1)}))`).reduce((a, b) => `min(${a}, ${b})`);
const PARS = /* glsl */ `
uniform float uStreak; uniform float uOut; uniform float uNightK;
float fwD(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float band(float d, float w, float fw) { return 1.0 - smoothstep(w * 0.5 - fw, w * 0.5 + fw, d); }
// the city's lights in this patch of town (they go out in patches as uOut climbs)
// (the same hash as region() in makeBasin, so the streets' glow and their points go out together)
float litHere(vec2 P) { vec2 a = floor(P / 2400.0) + 3.7; return smoothstep(uOut - 0.04, uOut, fract(sin(a.x * 127.1 + a.y * 311.7) * 43758.5453)); }
`;
const COLOR = /* glsl */ `
{
  vec2 P = vec2(${CA.toFixed(6)} * vFxW.x - ${SA.toFixed(6)} * vFxW.z, ${SA.toFixed(6)} * vFxW.x + ${CA.toFixed(6)} * vFxW.z);
  vec2 fw = max(fwidth(P), vec2(0.01));
  float fwm = max(fw.x, fw.y);
  float city = smoothstep(-450.0, -900.0, vFxW.z) * (1.0 - smoothstep(-30000.0, -40000.0, vFxW.z)) * (1.0 - smoothstep(22000.0, 30000.0, abs(vFxW.x)));
  vec2 dS = abs(mod(P + 100.0, 200.0) - 100.0);
  vec2 dB = abs(mod(P + 800.0, 1600.0) - 800.0);
  float street = max(band(dS.x, 13.0, fw.x), band(dS.y, 13.0, fw.y));
  float blvd = max(band(dB.x, 34.0, fw.x), band(dB.y, 34.0, fw.y));
  float fd = ${FW_MIN};
  float fwy = band(fd, 64.0, fwm);
  vec2 blk = floor(P / 200.0);
  float bh = fxh2(blk);
  float park = step(bh, 0.05);
  float dtn = exp(-pow(length(vFxW.xz - vec2(${DOWNTOWN.x.toFixed(1)}, ${DOWNTOWN.z.toFixed(1)})) / 1900.0, 2.0));
  // lots: a house roof on each, in the middle of its yard
  vec2 lp = P / 25.0, lf = fract(lp), li = floor(lp);
  float lh = fxh2(li + 11.0), lh2 = fxh2(li + 47.0);
  vec2 lw = max(fwidth(lp), vec2(1e-3));
  vec2 rr = smoothstep(vec2(0.18) - lw, vec2(0.18) + lw, lf) * (1.0 - smoothstep(vec2(0.82) - lw, vec2(0.82) + lw, lf));
  float roof = rr.x * rr.y;
  vec3 roofC = lh < 0.3 ? vec3(0.42, 0.24, 0.17) : lh < 0.55 ? vec3(0.36, 0.35, 0.33) : lh < 0.8 ? vec3(0.55, 0.54, 0.5) : vec3(0.2, 0.2, 0.22);
  vec3 yard = mix(vec3(0.11, 0.13, 0.07), vec3(0.2, 0.19, 0.13), lh2);
  vec3 lot = mix(yard, roofC, roof);
  float far = smoothstep(0.25, 0.7, max(lw.x, lw.y));
  lot = mix(lot, vec3(0.24, 0.22, 0.19), far);
  lot = mix(lot, vec3(0.28, 0.28, 0.28) * (0.8 + 0.4 * lh), dtn);          // downtown: concrete and parking
  lot = mix(lot, vec3(0.09, 0.15, 0.06) * (0.8 + 0.4 * lh2), park);
  vec3 c = mix(lot, vec3(0.085, 0.085, 0.09), max(max(street * 0.9, blvd), fwy));
  diffuseColor.rgb = mix(diffuseColor.rgb, c, city);
  // night: the streets' glow (sodium orange; the boulevards and freeways whiter and brighter), windows in the blocks
  float lit = litHere(P) * uLit * city;
  vec3 g = vec3(1.0, 0.5, 0.17) * street * 0.22 + vec3(1.0, 0.72, 0.42) * blvd * 0.5 + vec3(1.0, 0.82, 0.6) * fwy * 0.45;
  g += vec3(1.0, 0.7, 0.4) * (1.0 - park) * 0.022 * (0.6 + 0.8 * lh) + vec3(0.9, 0.85, 1.0) * dtn * 0.08;
  fxGlow += g * lit * uNightK;
  // a time-lapse: the cars' lights smear into ribbons along the boulevards and freeways
  fxGlow += (vec3(1.0, 0.86, 0.7) * 0.9 * fwy + vec3(1.0, 0.55, 0.35) * 0.6 * blvd) * uStreak * lit;
}`;

export function makeBasin(scene) {
  // ---- the ground ----
  const gGeo = new THREE.PlaneGeometry(90000, 64000, 90, 64).rotateX(-Math.PI / 2).translate(0, BASIN, -30000);
  const gMat = patch(new THREE.MeshStandardMaterial({ color: 0x40382c, roughness: 0.95, metalness: 0 }), 'basin-v1',
    { pars: PARS, color: COLOR, uniforms: BU, scale: 0.02, snowSide: 1 });
  const ground = new THREE.Mesh(gGeo, gMat);
  ground.frustumCulled = false; ground.receiveShadow = false;
  scene.add(ground);

  // ---- the lights ----
  const R = rng(777);
  const pos = [], col = [], misc = [], car = [];
  const region = (u, w) => { const a = Math.floor(u / 2400) + 3.7, b = Math.floor(w / 2400) + 3.7; const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
  const inView = (x, z) => z < GRID.z0 && z > GRID.zMax && Math.abs(x) < GRID.xMax && Math.abs(x) < -z * 1.25 + 2500 && rangeH(x, z) < BASIN - 5 && hillH(x, z) < BASIN + 2;
  const addPt = (x, z, rgb, size, keep, y = BASIN + 4) => {
    pos.push(x, y, z); col.push(rgb[0] / keep, rgb[1] / keep, rgb[2] / keep);
    const [u, w] = toGrid(x, z);
    misc.push(R(), 0, size, region(u, w)); car.push(0, 0, 0, 0);
  };
  const keepAt = (d, near, p) => Math.min(1, Math.pow(near / d, p));
  // along the streets (grid lines every 200 m; boulevards every 1600 m)
  const U0 = -40000, U1 = 40000, W0 = -42000, W1 = 2000;
  for (let axis = 0; axis < 2; axis++) {
    for (let k = Math.ceil(U0 / 200); k * 200 < U1; k++) {
      const c = k * 200, bl = k % 8 === 0;
      const step = bl ? 40 : 46;
      for (let t = W0; t < W1; t += step) {
        const tt = t + (R() - 0.5) * (bl ? 3 : 10);
        const [x, z] = axis ? toWorld(tt, c) : toWorld(c, tt);
        if (!inView(x, z)) continue;
        const d = Math.hypot(x, z);
        const keep = keepAt(d, bl ? 5200 : 2300, bl ? 1.25 : 1.65);
        if (R() > keep) continue;
        const tint = R();
        const rgb = bl ? (tint < 0.7 ? [0.95, 0.72, 0.46] : [0.8, 0.8, 0.9]) : tint < 0.75 ? [1.9, 0.9, 0.3] : [1.7, 1.45, 1.0];
        addPt(x, z, rgb, bl ? 9 : 6.5, Math.pow(keep, 0.9));
      }
    }
  }
  // windows and porch lights scattered in the blocks
  for (let i = 0; i < 90000; i++) {
    const d = 700 + Math.pow(R(), 2.2) * 34000, a = (R() - 0.5) * 1.6;
    const x = Math.sin(a) * d, z = -Math.cos(a) * d;
    if (!inView(x, z)) continue;
    const keep = keepAt(d, 2600, 1.2);
    if (R() > keep * 1.4) continue;
    addPt(x, z, R() < 0.8 ? [1.5, 0.95, 0.5] : [1.2, 1.25, 1.4], 4.5, Math.pow(Math.min(1, keep * 1.4), 0.9), BASIN + 3 + R() * 6);
  }
  // houses up on the hills on either side
  for (let i = 0; i < 3500; i++) {
    const x = (R() - 0.5) * 9000, z = -200 - R() * 3500;
    const h = hillH(x, z);
    if (h < BASIN + 25 || Math.hypot(x - 10, z) < 420) continue;
    addPt(x, z, [1.6, 1.0, 0.5], 4, 1, h + 3);
  }
  // cars: on the boulevards (both ways) and the freeways, out to ~14 km
  const carLine = (ax, az, bx, bz, n, speed) => {
    const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
    for (let i = 0; i < n; i++) for (const dir of [1, -1]) {
      const side = dir * 7;
      const sx = (dir > 0 ? ax : bx) + -dz * side, sz = (dir > 0 ? az : bz) + dx * side;
      pos.push(sx, BASIN + 1.2, sz);
      // coming toward you (headlights, white) or going away (tail lights, red), decided per point in the shader
      col.push(2.6, 2.4, 2.1);
      misc.push(R(), 1, 5.0, region(...toGrid(sx, sz)));
      car.push(dx * dir, dz * dir, speed * (0.85 + 0.3 * R()), L);
    }
  };
  for (let k = -14; k <= 14; k++) {
    // boulevards in both directions of the grid, within ~14 km
    const c = k * 1600;
    const [ax, az] = toWorld(c, -16000), [bx, bz] = toWorld(c, 1500);
    carLine(ax, az, bx, bz, 70, 15);
    const [cx, cz] = toWorld(-16000, -c - 6000), [ex, ez] = toWorld(16000, -c - 6000);
    if (-c - 6000 < -800) carLine(cx, cz, ex, ez, 60, 15);
  }
  for (const [x0, z0, x1, z1] of FREEWAYS) carLine(x0, z0, x1, z1, 420, 27);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aMisc', new THREE.Float32BufferAttribute(misc, 4));
  geo.setAttribute('aCar', new THREE.Float32BufferAttribute(car, 4));
  const LU = {
    uPx: { value: 1300 }, uLit: { value: 1 }, uOut: BU.uOut, uCars: { value: 1 }, uT: { value: 0 }, uTime: { value: 0 },
    uFogD: { value: 0.00004 }, uFogC: { value: new THREE.Color() }, uCam: { value: new THREE.Vector3() },
  };
  const lightMat = new THREE.ShaderMaterial({
    uniforms: LU, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec3 aCol; attribute vec4 aMisc; attribute vec4 aCar;
      uniform float uPx; uniform float uLit; uniform float uOut; uniform float uCars; uniform float uT; uniform float uTime; uniform float uFogD; uniform vec3 uCam;
      varying vec3 vC; varying float vFog;
      void main() {
        vec3 p = position;
        float on = uLit * smoothstep(uOut - 0.04, uOut, aMisc.w);
        vec3 c = aCol;
        if (aCar.w > 0.0) {
          float s = mod(uT * aCar.z + aMisc.x * aCar.w, aCar.w);
          p.xz += aCar.xy * s;
          on *= uCars;
          // coming toward you: headlights; going away: red tail lights
          vec2 toYou = normalize(uCam.xz - p.xz);
          if (dot(aCar.xy, toYou) < 0.0) c = vec3(2.2, 0.16, 0.08);
        }
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float d = max(-mv.z, 1.0);
        float px = aMisc.z * uPx / d;
        float sz = max(px, 2.4);
        gl_PointSize = min(sz, 14.0);
        float tw = 1.0 + 0.18 * sin(uTime * (3.0 + 4.0 * aMisc.x) + aMisc.x * 40.0) * smoothstep(2500.0, 9000.0, d);
        vC = c * on * min(1.0, pow(px / 2.4, 2.0)) * tw;
        vFog = exp(-uFogD * uFogD * d * d);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uFogC;
      varying vec3 vC; varying float vFog;
      void main() {
        vec2 q = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(q, q);
        if (r2 > 1.0) discard;
        float a = exp(-r2 * 5.0);
        gl_FragColor = vec4(vC * a * vFog, 1.0);
      }`,
  });
  const lights = new THREE.Points(geo, lightMat);
  lights.frustumCulled = false; lights.renderOrder = 5;
  scene.add(lights);
  console.log('city lights', pos.length / 3);

  // ---- low buildings on the lots close by ----
  const BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const near = [];
  for (let i = 0; i < 26000 && near.length < 9000; i++) {
    const d = 700 + Math.pow(R(), 1.4) * 3600, a = (R() - 0.5) * 1.7;
    const x = Math.sin(a) * d, z = -Math.cos(a) * d;
    if (!inView(x, z)) continue;
    const [u, w] = toGrid(x, z);
    // not on a street
    const ds = Math.min(Math.abs(((u % 200) + 300) % 200 - 100), Math.abs(((w % 200) + 300) % 200 - 100));
    if (ds > 70) continue;
    if (R() > 0.07) continue;   // houses are drawn on the ground; boxes only for apartments, offices, stores
    near.push({ x, z, w: 14 + R() * 22, d: 12 + R() * 18, h: 8 + R() * 26, c: R() });
  }
  const bMat = patch(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), 'blocks-v1', {
    vpars: 'attribute float aSeed; varying float vSeed;', vcode: 'vSeed = aSeed;', pars: 'varying float vSeed;', scale: 0.05,
    emissive: 'totalEmissiveRadiance += vec3(1.0, 0.72, 0.42) * uLit * step(0.35, fract(vSeed * 13.7)) * 0.12 * (1.0 - step(0.5, uSnow)) * step(0.2, 1.0 - vFxN.y);',
  });
  const blocks = new THREE.InstancedMesh(BOX, bMat, near.length);
  const seedA = new Float32Array(near.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), GRID.ang), cc = new THREE.Color();
  near.forEach((b, i) => {
    m4.compose(new THREE.Vector3(b.x, BASIN, b.z), q, new THREE.Vector3(b.w, b.h, b.d));
    blocks.setMatrixAt(i, m4);
    blocks.setColorAt(i, cc.setHSL(0.07 + 0.06 * b.c, 0.1, 0.2 + 0.22 * b.c));
    seedA[i] = b.c;
  });
  BOX.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seedA, 1));
  blocks.frustumCulled = false;
  scene.add(blocks);

  // ---- downtown's towers ----
  const TBOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const aBox = new THREE.InstancedBufferAttribute(new Float32Array(TOWERS.length * 4), 4);
  const aLook = new THREE.InstancedBufferAttribute(new Float32Array(TOWERS.length * 4), 4);
  TBOX.setAttribute('aBox', aBox); TBOX.setAttribute('aLook', aLook);
  const tMat = patch(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 }), 'towers-v1', {
    uniforms: BU, scale: 0.03,
    vpars: 'attribute vec4 aBox; attribute vec4 aLook; varying vec3 vLoc; varying vec4 vBox; varying vec4 vLook; varying vec3 vON;',
    vcode: 'vLoc = position; vBox = aBox; vLook = aLook; vON = normal;',
    pars: `varying vec3 vLoc; varying vec4 vBox; varying vec4 vLook; varying vec3 vON;
      uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform vec3 uSunDir;
      float rect(vec2 f, vec2 a, vec2 b, vec2 w) { vec2 s = smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f)); return s.x * s.y; }`,
    color: `
      vec3 towGlow = vec3(0.0);
      {
        bool sx = abs(vON.x) > 0.5;
        bool top = vON.y > 0.5;
        float W = sx ? vBox.z : vBox.x;
        float uu = ((sx ? vLoc.z : vLoc.x) + 0.5) * W;
        float y = vLoc.y * vBox.y;
        float kind = vLook.y;
        float seed = vLook.x;
        vec2 g = vec2(uu / 3.0, y / 3.8);
        vec2 id = floor(g), f = fract(g);
        vec2 fw = max(fwidth(g), vec2(1e-4));
        float far = smoothstep(0.2, 0.5, max(fw.x, fw.y));
        vec3 tint = 0.5 + 0.5 * cos(6.2832 * (vLook.z + vec3(0.0, 0.33, 0.67)));
        vec3 wall = kind > 0.5 ? mix(vec3(0.18, 0.2, 0.24), tint * 0.3, 0.3) : mix(vec3(0.6, 0.57, 0.52), tint * 0.6 + 0.2, 0.2);
        float win = kind > 0.5 ? rect(f, vec2(0.04, 0.12), vec2(0.96, 0.96), fw) : rect(f, vec2(0.18, 0.3), vec2(0.82, 0.86), fw);
        win = mix(win, 0.55, far);
        if (top) win = 0.0;
        vec3 Vd = normalize(vFxW - cameraPosition);
        vec3 N = normalize(vec3(vFxN.x, 0.0, vFxN.z) + vec3(0.0, 1e-4, 0.0));
        vec3 r = reflect(Vd, N);
        float fres = 0.1 + 0.6 * pow(1.0 - max(dot(-Vd, N), 0.0), 3.0);
        float hr = clamp(r.y, -0.2, 1.0);
        vec3 sky = mix(uSkyLo, uSkyHi, smoothstep(0.0, 0.45, hr)) + uSkyLo * 2.0 * pow(max(dot(r, uSunDir), 0.0), 40.0);
        float lit = step(fxh2(id + vec2(seed * 31.0, seed * 7.0)), 0.45) * step(0.0, y - 3.0);
        diffuseColor.rgb = mix(wall, vec3(0.04, 0.05, 0.06), win) * (0.85 + 0.25 * fxh2(vec2(id.y, seed)));
        fxGlow += sky * fres * win * (kind > 0.5 ? 1.0 : 0.6) * (1.0 - uSnow * 0.6);
        towGlow = vec3(1.0, 0.75, 0.48) * mix(lit * win * 1.5, 0.45 * 0.6, far) * uLit * (1.0 - step(0.5, uSnow));
        fxGlow += towGlow;
        // red aviation lights on top
      }`,
  });
  const towers = new THREE.InstancedMesh(TBOX, tMat, TOWERS.length);
  TOWERS.forEach((t, i) => {
    m4.compose(new THREE.Vector3(t.x, BASIN, t.z), q, new THREE.Vector3(t.w, t.h, t.d));
    towers.setMatrixAt(i, m4);
    aBox.setXYZW(i, t.w, t.h, t.d, 1);
    aLook.setXYZW(i, t.seed, t.kind, t.hue, 1);
  });
  towers.frustumCulled = false;
  scene.add(towers);
  // aviation lights on the tall towers (glows, added each frame)
  const beacons = TOWERS.filter((t) => t.h > 150).map((t) => [t.x, BASIN + t.h + 2, t.z]);

  return {
    LU, beacons, ground, lights, blocks, towers,
    frame(s, cam, look, glows) {
      LU.uPx.value = 1080 / (2 * Math.tan(cam.fov * Math.PI / 360));
      LU.uLit.value = look.lights;
      LU.uCars.value = s.crowd * s.traffic;
      LU.uT.value = s.T * 60;
      LU.uTime.value = s.v;
      LU.uCam.value.copy(cam.position);
      BU.uSkyHi.value.copy(look.skyHi); BU.uSkyLo.value.copy(look.skyLo); BU.uSunDir.value.copy(look.sunDir);
      BU.uStreak.value = (1 - s.crowd) * s.traffic * look.lights * 0.8;
      BU.uOut.value = 1.05 * (1 - s.lights);
      // red aviation lights, blinking
      if (look.lights > 0.02) for (const [x, y, z] of beacons) {
        const on = 0.5 + 0.5 * Math.sin(s.v * 3 + x);
        glows.add(x, y, z, 14, 3.5 * on * look.lights, 0.2 * on * look.lights, 0.1 * on * look.lights);
      }
    },
  };
}

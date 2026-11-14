// The subway station under the street, its own scene. You land at the origin on the track bed (y = 0, 7 m below the
// street). The track runs along z; the platform is on the +x side (edge at x = 1.55, top 1.1 m up); between the
// tracks a row of steel columns (x = -2.4); the far track and a tiled wall beyond (x = -7.6). White tile walls with a
// coloured band, a low ceiling (4.2 m) with strip lights, the hole you made in it (daylight pours down through it,
// with the dust), rubble falling with you. The bed cracks round you and the rails bend down as you sink; at V_SINK
// it gives way. A train's headlights come down the tunnel from V_TRAIN and it brakes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCrowd } from './crowd.js';
import { makeGlows } from './glows.js';
import { makeSmoke } from './smoke.js';
import { STATION, stationPersonAt, armsAt, V_TRAIN } from './people.js';
import { V_PUNCH, V_LAND, V_SINK } from './timeline.js';
import { rng, smooth, clamp, lerp } from './util.js';

export const EDGE = 1.55, PLAT_Y = 1.1, CEIL = 4.2, COLX = 5.2, WALLX = -8.2, PWALL = 8.2;
const ZMIN = -90, ZMAX = 40;

export function makeStation() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020202);
  const std = (color, rough = 0.85, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
  // ---- tile walls: a shader on a standard material (white tiles, grout, a mosaic band, grime low down) ----
  const tileMat = std(0xffffff, 0.35);
  tileMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTW;\nfloat th(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 t = vec2(vTW.z, vTW.y) / vec2(0.15, 0.075);
        vec2 f = fract(t);
        float grout = 1.0 - smoothstep(0.0, 0.08, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) * 2.0);
        vec3 c = vec3(0.86, 0.85, 0.8) * (0.93 + 0.08 * th(floor(t)));
        float y = vTW.y;
        float band = step(2.55, y) * (1.0 - step(3.05, y));
        vec2 m = floor(vec2(vTW.z, y) / 0.05);
        vec3 mos = mix(vec3(0.1, 0.35, 0.3), vec3(0.75, 0.6, 0.25), step(0.6, th(m)));
        mos = mix(mos, vec3(0.62, 0.2, 0.12), step(0.85, th(m + 3.0)));
        c = mix(c, mos, band);
        c *= 1.0 - 0.35 * grout;
        c *= mix(0.55, 1.0, smoothstep(0.0, 2.0, y - (vTW.x > 0.0 ? 1.1 : 0.0)));   // grime low down
        diffuseColor.rgb = c;`);
  };
  tileMat.customProgramCacheKey = () => 'tiles-v1';
  const conc = std(0x77736c, 0.9);
  const g = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); scene.add(m); return m; };
  const L = ZMAX - ZMIN, ZC = (ZMIN + ZMAX) / 2;
  // platform slab + its edge (a yellow strip, a dark lip)
  for (const sd of [-1, 1]) {
    g(new THREE.BoxGeometry(PWALL - EDGE, PLAT_Y, L), conc, sd * (EDGE + PWALL) / 2, PLAT_Y / 2, ZC);
    g(new THREE.BoxGeometry(0.6, 0.012, L), std(0xe0b020, 0.6), sd * (EDGE + 0.3), PLAT_Y + 0.006, ZC);
  }
  // the platform wall and the far wall (tiles), the ceiling
  g(new THREE.PlaneGeometry(L, CEIL + 0.1).rotateY(-Math.PI / 2), tileMat, PWALL, (CEIL) / 2, ZC);
  g(new THREE.PlaneGeometry(L, CEIL + 0.1).rotateY(Math.PI / 2), tileMat, WALLX, CEIL / 2, ZC);
  // the ceiling: a plane with the hole above you cut out (discard within the hole)
  const ceilMat = std(0x5a5852, 0.95);
  ceilMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvCW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCW;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float r = length(vCW.xz);
        float a = atan(vCW.z, vCW.x);
        if (r < 0.75 + 0.18 * sin(a * 5.0) + 0.1 * sin(a * 11.0 + 1.0)) discard;
        diffuseColor.rgb *= 0.85 + 0.15 * step(0.5, fract(vCW.z / 1.5));
        diffuseColor.rgb *= mix(0.4, 1.0, smoothstep(0.7, 2.2, r));   // scorched / dirty round the hole`);
  };
  g(new THREE.PlaneGeometry(PWALL - WALLX, L).rotateX(Math.PI / 2), ceilMat, (PWALL + WALLX) / 2, CEIL, ZC);
  // the shaft above the hole: rough sides (soil, slab) up to the daylight
  const shaft = g(new THREE.CylinderGeometry(0.9, 0.9, 3.0, 24, 1, true).translate(0, 1.5, 0), new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1, side: THREE.BackSide }), 0, CEIL, 0);
  const sky = g(new THREE.CircleGeometry(0.95, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.7, 1.9) }), 0, CEIL + 2.95, 0);
  // the track bed: concrete between the walls, with a shader for the cracks round you and the hole at the end
  const bedU = { uCrack: { value: 0 }, uHole: { value: 0 } };
  const bedMat = std(0x45423d, 0.95);
  bedMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, bedU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvBW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vBW; uniform float uCrack, uHole;
        float bh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float bn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(bh(i), bh(i + vec2(1, 0)), f.x), mix(bh(i + vec2(0, 1)), bh(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 P = vBW.xz;
        float r = length(P), a = atan(P.y, P.x);
        if (uHole > 0.0 && r < uHole * (0.85 + 0.3 * bn(vec2(a * 2.0, 5.0)))) discard;
        vec3 c = vec3(0.3, 0.29, 0.27) * (0.8 + 0.4 * bn(P * 3.0)) * (0.85 + 0.2 * bn(P * 0.4));
        c = mix(c, vec3(0.12, 0.1, 0.08), 0.5 * smoothstep(0.6, 0.0, abs(P.x)));   // oil and grime down the middle
        float wig = (bn(vec2(r * 3.0, a * 2.0)) - 0.5) * 0.9;
        float sec = (a / 6.2832 + 0.5) * 11.0 + wig;
        float ds = abs(fract(sec) - 0.5) * 6.2832 / 11.0 * r;
        float reach = uCrack * (0.5 + 0.5 * bh(vec2(floor(sec), 3.0)));
        float crack = (1.0 - smoothstep(0.012, 0.03, ds)) * (1.0 - smoothstep(reach - 0.3, reach, r));
        c = mix(c, vec3(0.02), crack);
        c *= 1.0 - 0.5 * smoothstep(uCrack * 0.6 + 0.3, 0.0, r) * step(0.01, uCrack);
        diffuseColor.rgb = c;`);
  };
  g(new THREE.PlaneGeometry(2 * EDGE, L).rotateX(-Math.PI / 2), bedMat, 0, 0, ZC);
  // under the bed (seen through the hole at the end): the dark pit
  g(new THREE.CylinderGeometry(1.2, 1.2, 6, 24, 1, true).translate(0, -3, 0), new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 1, side: THREE.BackSide }), 0, 0, 0);
  // ties and rails (two tracks); the rails near you are short pieces that bend down as you sink
  const tie = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 0.12, 0.22), std(0x3a2a20, 0.9), Math.ceil(L / 0.65));
  let nt = 0; const m4 = new THREE.Matrix4();
  for (const tx of [0]) for (let z = ZMIN; z < ZMAX; z += 0.65) tie.setMatrixAt(nt++, m4.makeTranslation(tx, 0.06, z));
  tie.count = nt; scene.add(tie);
  const railMat = std(0x8a8680, 0.35, { metalness: 0.8 });
  const railGeo = new THREE.BoxGeometry(0.07, 0.15, 1);
  const NR = 2 * Math.ceil(L / 1.0);
  const rails = new THREE.InstancedMesh(railGeo, railMat, NR * 2 + 4);
  const railSegs = [];
  for (const tx of [0]) for (const sx of [-0.72, 0.72]) for (let z = ZMIN; z < ZMAX; z += 1.0) railSegs.push({ x: tx + sx, z: z + 0.5 });
  // third rail with its wooden cover, on the far side of each track
  for (const tx of [0]) g(new THREE.BoxGeometry(0.25, 0.08, L), std(0x6a5a40, 0.9), tx - 1.2, 0.35, ZC);
  rails.count = railSegs.length; scene.add(rails);
  // steel columns between the tracks (H-sections, painted dark green, rivet strips)
  const colGeo = mergeGeometries([new THREE.BoxGeometry(0.3, CEIL, 0.03).translate(0, CEIL / 2, 0.14), new THREE.BoxGeometry(0.3, CEIL, 0.03).translate(0, CEIL / 2, -0.14), new THREE.BoxGeometry(0.03, CEIL, 0.28).translate(0, CEIL / 2, 0)]);
  const cols = new THREE.InstancedMesh(colGeo.scale(1, (CEIL - PLAT_Y) / CEIL, 1), std(0x2a3a30, 0.6, { metalness: 0.3 }), 80);
  let nc = 0;
  for (const sd of [-1, 1]) for (let z = ZMIN + 2; z < ZMAX; z += 4.5) cols.setMatrixAt(nc++, m4.makeTranslation(sd * COLX, PLAT_Y, z));
  cols.count = nc; scene.add(cols);
  // strip lights on the ceiling over the platform and the tracks (emissive), and a few real lights
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.35, 2.1) });
  const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.05, 1.2), lampMat, 120);
  let nl = 0;
  for (const lx of [4.6, 0.0, -4.6]) for (let z = ZMIN + 1; z < ZMAX; z += 3.0) lamps.setMatrixAt(nl++, m4.makeTranslation(lx, CEIL - 0.04, z));
  lamps.count = nl; scene.add(lamps);
  const hemi = new THREE.HemisphereLight(0xd8dcd0, 0x3a3630, 1.4);
  scene.add(hemi);
  const pl = [];
  for (const [x, z] of [[4.5, 3], [4.5, -6], [0.0, -2], [0.0, -12], [-4.5, -4], [-4.5, 4], [-4.5, -14], [4.5, -16], [0.0, 8]]) { const p = new THREE.PointLight(0xfff4e0, 14, 16, 1.6); p.position.set(x, CEIL - 0.3, z); scene.add(p); pl.push(p); }
  // daylight down the hole onto you
  const beam = new THREE.SpotLight(0xfff6e8, 0, 14, 0.42, 0.6, 1.2);
  beam.position.set(0.1, CEIL + 2.8, 0.1); beam.target.position.set(0, 0, 0);
  scene.add(beam, beam.target);
  // a soft shaft of light in the dust (additive cone)
  const coneMat = new THREE.ShaderMaterial({
    uniforms: { uA: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = position.y; vec4 w = modelViewMatrix * vec4(position,1.0); vV = -w.xyz; vN = normalMatrix * normal; gl_Position = projectionMatrix * w; }',
    fragmentShader: 'uniform float uA; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float f = abs(dot(normalize(vN), normalize(vV))); gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * uA * f * f * smoothstep(-0.2, 3.0, vY), 1.0); }',
  });
  const cone = g(new THREE.CylinderGeometry(0.75, 1.4, CEIL, 24, 1, true).translate(0, CEIL / 2, 0), coneMat, 0, 0, 0);
  // the people
  const crowdMat = std(0xffffff, 0.82);
  const crowd = makeCrowd(scene, STATION.length, crowdMat, { castShadow: false });
  STATION.forEach((p) => crowd.color(p.i, p.shirt, p.pants, p.skin, p.hair, p.sleeves));
  // the train: a stainless car body with lit windows; headlights
  const train = new THREE.Group();
  const bodyMat = std(0xb8bcc0, 0.3, { metalness: 0.7 });
  const winMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.25, 1.1) });
  train.add(new THREE.Mesh(new THREE.BoxGeometry(3.0, 3.4, 60).translate(0, 2.0, -30), bodyMat));
  for (let k = 0; k < 10; k++) for (const sx of [-1.505, 1.505]) train.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.8, 1.6).translate(sx, 2.4, -3 - k * 5.6), winMat));
  train.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.02).translate(0, 2.5, 0.01), winMat));
  scene.add(train);
  // falling rubble from the roof and the street (with you), and chunks thrown up when you land
  const R = rng(919);
  const NRB = 70;
  const rub = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.08, 0), std(0xffffff, 0.9), NRB);
  const RB = [];
  const cc = new THREE.Color();
  for (let i = 0; i < NRB; i++) {
    const fall = i < 40;
    const a = R() * Math.PI * 2, r = fall ? R() * 0.8 : 0.3 + R() * 0.4;
    RB.push({ fall, t0: fall ? V_PUNCH + 0.2 + R() * 0.9 : V_LAND + R() * 0.05, x: Math.cos(a) * r, z: Math.sin(a) * r, y0: fall ? CEIL + R() * 1.5 : 0.1,
      vx: fall ? (R() - 0.5) * 0.8 : Math.cos(a) * (1.5 + R() * 3), vz: fall ? (R() - 0.5) * 0.8 : Math.sin(a) * (1.5 + R() * 3), vy: fall ? -1 - R() * 2 : 2 + R() * 3,
      s: 0.5 + R() * 1.6, spin: R() * 8 });
    rub.setColorAt(i, cc.set(R() < 0.5 ? 0x8a857c : R() < 0.5 ? 0x5a4a3a : 0x6a6660));
  }
  scene.add(rub);
  const glows = makeGlows(scene, 600);
  const smoke = makeSmoke(scene, 400);
  const q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();

  return {
    scene, glows, smoke, bedU,
    // sink: how far you've sunk into the bed (m)
    frame(v, s, camera, sink) {
      // cracks and the hole
      bedU.uCrack.value = v < V_LAND ? 0 : 0.8 + 2.2 * smooth(V_LAND, V_SINK, v);
      bedU.uHole.value = v < V_SINK - 0.15 ? Math.max(0, sink - 0.2) * 1.2 : 0.9 + 1.5 * smooth(V_SINK - 0.15, V_SINK + 0.2, v);
      // rails bend down round you
      railSegs.forEach((r, i) => {
        const d = Math.abs(r.x) < 2 ? Math.exp(-Math.pow(r.z / 1.6, 2)) : 0;
        const dip = d * (sink * 0.8 + (v > V_SINK - 0.15 ? 3 * Math.pow(v - V_SINK + 0.15, 2) * 4.9 : 0));
        const slope = Math.abs(r.x) < 2 ? -2 * r.z / (1.6 * 1.6) * d * sink * 0.8 : 0;
        e.set(Math.atan(slope), 0, 0);
        q.setFromEuler(e);
        m4.compose(p.set(r.x, 0.2 - dip, r.z), q, sc.set(1, 1, 1));
        rails.setMatrixAt(i, m4);
      });
      rails.instanceMatrix.needsUpdate = true;
      // daylight shaft: on once the roof is open
      const open = smooth(V_PUNCH + 0.3, V_PUNCH + 0.6, v);
      beam.intensity = 30 * open;
      coneMat.uniforms.uA.value = 0.07 * open;
      shaft.visible = sky.visible = cone.visible = v > V_PUNCH + 0.25;
      // the train: lights far down the tunnel from V_TRAIN, braking toward the station
      const tt = v - V_TRAIN;
      const tc = clamp(tt, 0, 5);
      const tz = tt < 0 ? -400 : -125 + 30 * tc - 2.6 * tc * tc;          // (braking hard: 30 m/s, 2.6 m/s²)
      train.position.set(0, 0, tz - 6);
      train.visible = tt > 0;
      glows.begin(camera);
      if (tt > 0) {
        const k = smooth(0, 0.6, tt);
        for (const sx of [-0.8, 0.8]) glows.add(sx, 1.0, tz - 5.9, 1.4, 10 * k, 9 * k, 7 * k);
        glows.add(0, 3.3, tz - 5.9, 0.9, 6 * k, 5 * k, 3 * k);
      }
      for (let i = 0; i < nl; i += 1) { lamps.getMatrixAt(i, m4); p.setFromMatrixPosition(m4); glows.add(p.x, p.y - 0.06, p.z, 1.2, 0.35, 0.34, 0.3); }
      glows.end();
      // people
      STATION.forEach((pp) => {
        const a = stationPersonAt(pp, v);
        const arms = armsAt(pp, v, V_PUNCH + 0.4);
        crowd.pose(pp.i, { x: a.x, y: PLAT_Y, z: a.z, yaw: a.yaw, s: pp.s, walk: 0, stride: 0, armL: arms.armL, armR: arms.armR, look: 0.25 });
      });
      crowd.commit();
      // rubble
      RB.forEach((C, i) => {
        const t = v - C.t0;
        if (t < 0) { rub.setMatrixAt(i, m4.makeScale(0, 0, 0)); return; }
        const tl = Math.min(t, (C.vy + Math.sqrt(C.vy * C.vy + 2 * 9.8 * Math.max(C.y0 - 0.08, 0))) / 9.8);
        let y = Math.max(0.08, C.y0 + C.vy * tl - 4.9 * tl * tl);
        const x = C.x + C.vx * tl, z = C.z + C.vz * tl;
        if (v > V_SINK - 0.1 && Math.hypot(x, z) < 1.4) y -= 4.9 * Math.pow(v - V_SINK + 0.1, 2) * 2;
        e.set(C.spin * tl, C.spin * 0.6 * tl, 0);
        q.setFromEuler(e);
        m4.compose(p.set(x, y, z), q, sc.setScalar(C.s));
        rub.setMatrixAt(i, m4);
      });
      rub.instanceMatrix.needsUpdate = true;
      // dust: a burst when you land, the haze in the light shaft
      smoke.begin();
      const RS = rng(31);
      for (let k = 0; k < 40; k++) {
        const a = RS() * 6.28, sp = 0.6 + RS() * 1.6, t0 = V_LAND + RS() * 0.1;
        const t = v - t0;
        if (t < 0 || t > 5) continue;
        const r = 0.3 + sp * (1 - Math.exp(-t * 1.4)) * 1.4;
        smoke.puff(Math.cos(a) * r, 0.2 + 0.25 * t * (0.5 + RS()), Math.sin(a) * r, 0.35 + 0.35 * t, 0.42 * Math.exp(-t / 2.2), 0.72, 0, RS());
      }
      for (let k = 0; k < 14; k++) {
        const t = v - (V_PUNCH + 0.3 + k * 0.05);
        if (t < 0) continue;
        smoke.puff(Math.sin(k * 2.1) * 0.4, CEIL - 0.3 - Math.min(t, 3) * 0.6 * (0.3 + (k % 5) * 0.2), Math.cos(k * 1.3) * 0.4, 0.35 + 0.25 * Math.min(t, 3), 0.28 * Math.exp(-t / 3), 0.8, 0, k * 0.137 % 1);
      }
      if (v > V_SINK - 0.2) for (let k = 0; k < 20; k++) {
        const t = v - (V_SINK - 0.2) - k * 0.01; if (t < 0) continue;
        const a = k * 0.9;
        smoke.puff(Math.cos(a) * (0.6 + t), 0.2 + t * 0.8, Math.sin(a) * (0.6 + t), 0.4 + 0.5 * t, 0.4, 0.65, 0, (k * 0.31) % 1);
      }
      smoke.end();
      smoke.mat.uniforms.uTime.value = v;
      smoke.mat.uniforms.uLight.value.setRGB(0.9, 0.88, 0.82);
      smoke.mat.uniforms.uSun.value.set(0, 1, 0);
    },
  };
}

// 42nd Street at Manhattanhenge, from Bryant Park west to the Hudson and on into New Jersey.
// You run down the middle of the street (x = 0) toward the setting Sun (-z). Traffic is stopped at the red lights,
// crowds stand on the crosswalks photographing the Sun, people walk the sidewalks. Times Square glows at Broadway.
// Once you break the sound barrier, the shock you drag behind you shatters the windows you pass (glass pours into
// the street), knocks people down and sets off car alarms. Everything is a pure function of video time v.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patch, G } from './bend.js';
import { rng, smooth, clamp, lerp, DEG } from './util.js';
import { makeFleet } from './cars.js';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { AVENUES, RIVER_Z0, RIVER_Z1, V_SOUND, TofDist, V_GO } from './timeline.js';

export const ROAD = 9.5, WALK = 15.5;          // 42nd St: roadway half-width, building line
const SIDE_ROAD = 6, SIDE_LINE = 10;           // the other streets
const STREET_DX = 80;                          // E-W streets every 80 m (x)
const EAST = [{ z: 1100, w: 30 }, { z: 840, w: 24 }, { z: 700, w: 40 }, { z: 540, w: 24 }];   // 3rd, Lexington, Park, Madison
const ALL_AVES = [...EAST, ...AVENUES].sort((a, b) => b.z - a.z);
const PARK = { x0: -70, x1: -WALK, z0: AVENUES[1].z + AVENUES[1].w / 2 + 4, z1: AVENUES[0].z - AVENUES[0].w / 2 - 4 };   // Bryant Park
const SHOCK_Z = -0.5;                          // (filled in below from the timeline)
const dummy = new THREE.Object3D();
const tmpC = new THREE.Color();
const SPEED_OF_SOUND = 343;

// video time at which you pass a point z on the street (rate 1 there: v = V_GO + T)
export const vPass = (z) => V_GO + TofDist(Math.max(-z, 1e-3));
const Z_MACH1 = -(() => { let d = 0; while (vPass(-d) < V_SOUND) d += 0.5; return d; })();
// when the shock (dragged behind you once you're supersonic) reaches a point at (x, y, z)
const shockAt = (x, y, z) => vPass(z) + Math.hypot(x, y) / SPEED_OF_SOUND * 0.9;

export function makeCity(scene) {
  const R = rng(4242);
  const city = {};

  // ---------- materials ----------
  const plainMat = (color, rough = 0.9, extra = {}) => patch(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
  const glowMat = (color) => patch(new THREE.MeshBasicMaterial({ color, toneMapped: true }));
  const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };

  // ---------- the ground: asphalt everywhere, with 42nd Street's markings and crosswalks ----------
  {
    const aveData = ALL_AVES.map((a) => new THREE.Vector2(a.z, a.w));
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.93 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uAves = { value: aveData };
      sh.vertexShader = 'varying vec3 vGW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = `varying vec3 vGW; uniform vec2 uAves[${aveData.length}];
        float h2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float vn2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
        ` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 p = vGW.xz;
          float fw = max(fwidth(p.x), fwidth(p.y));
          float aa = max(fw * 0.7, 0.01);
          vec3 asph = vec3(0.13, 0.13, 0.135) * (0.8 + 0.35 * vn2(p * 0.7) + 0.15 * vn2(p * 6.0));
          asph *= 1.0 - 0.18 * smoothstep(0.6, 1.0, vn2(p * vec2(0.9, 0.05)));          // tyre-polished strips
          vec3 col = asph;
          float onAve = 0.0, cross = 0.0;
          for (int i = 0; i < ${aveData.length}; i++) {
            float dz = abs(p.y - uAves[i].x) - uAves[i].y * 0.5;
            onAve = max(onAve, 1.0 - smoothstep(-aa, aa, dz));
            // the crosswalks across 42nd: white bars, 0.6 m wide, 1.2 m apart
            float cw = (1.0 - smoothstep(-aa, aa, dz - 4.0)) * smoothstep(-aa, aa, dz - 0.6);
            cross = max(cross, cw);
          }
          float in42 = 1.0 - smoothstep(${ROAD.toFixed(1)} - aa, ${ROAD.toFixed(1)} + aa, abs(p.x));
          // double yellow centre line, white lane dashes (3 m every 9 m), stop bars
          float yel = (1.0 - smoothstep(0.055 - aa, 0.055 + aa, abs(abs(p.x) - 0.13))) * in42 * (1.0 - onAve);
          float dash = (1.0 - smoothstep(0.07 - aa, 0.07 + aa, abs(abs(p.x) - 4.8))) * step(fract(p.y / 9.0), 0.33) * in42 * (1.0 - onAve);
          float bars = cross * in42 * step(0.5, fract(p.x / 1.2 + 0.25)) * step(1.0, abs(p.x));
          vec3 paint = vec3(0.78, 0.77, 0.72) * (0.75 + 0.25 * vn2(p * 3.0));
          col = mix(col, vec3(0.85, 0.62, 0.12), yel * 0.9);
          col = mix(col, paint, max(dash * 0.85, bars * 0.9));
          // manholes and patches
          col *= 1.0 - 0.25 * step(0.985, h2(floor(p / 7.0))) * (1.0 - smoothstep(0.55, 0.6, length(fract(p / 7.0) - 0.5) * 7.0 / 3.0));
          diffuseColor.rgb = col;
        }`);
    };
    const g = new THREE.Mesh(new THREE.PlaneGeometry(4000, 3200).rotateX(-Math.PI / 2).translate(0, 0, (1400 + RIVER_Z0) / 2 + 400 - 400), mat);
    g.geometry = new THREE.PlaneGeometry(4000, 1400 - RIVER_Z0).rotateX(-Math.PI / 2).translate(0, 0, (1400 + RIVER_Z0) / 2);
    g.receiveShadow = true; g.frustumCulled = false;
    scene.add(g);
  }

  // ---------- sidewalks (raised, concrete slabs) along 42nd ----------
  {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'varying vec3 vSW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vSW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'varying vec3 vSW;\n float hs(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }\n' +
        sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 q = vSW.xz / 1.6; vec2 f = fract(q); vec2 fw = fwidth(q);
          float joint = 1.0 - min(smoothstep(0.0, fw.x * 1.5 + 0.01, min(f.x, 1.0 - f.x)), smoothstep(0.0, fw.y * 1.5 + 0.01, min(f.y, 1.0 - f.y)));
          vec3 c = vec3(0.47, 0.45, 0.43) * (0.85 + 0.25 * hs(floor(q)));
          float curb = 1.0 - smoothstep(0.3, 0.32, abs(abs(vSW.x) - ${ROAD.toFixed(1)}));
          c = mix(c, vec3(0.62, 0.6, 0.57), curb);
          diffuseColor.rgb = c * (1.0 - 0.3 * joint);
        }`);
    };
    const parts = [];
    for (let i = 0; i < ALL_AVES.length - 1; i++) {
      const a = ALL_AVES[i], b = ALL_AVES[i + 1];
      const z0 = b.z + b.w / 2, z1 = a.z - a.w / 2;
      for (const sd of [-1, 1]) parts.push(new THREE.BoxGeometry(WALK - ROAD, 0.15, z1 - z0).translate(sd * (ROAD + WALK) / 2, 0.075, (z0 + z1) / 2));
    }
    const m = new THREE.Mesh(mergeGeometries(parts), mat);
    m.receiveShadow = true; m.frustumCulled = false;
    scene.add(m);
  }

  // ---------- buildings: the Manhattan grid, front rows on 42nd, the skyline behind ----------
  const B = [];
  const pal = [0x9c8f80, 0x8a8076, 0x7e7468, 0x77736e, 0xab9f8a, 0x8a6d5c, 0x6b7179, 0x5f6670, 0x9a948b, 0x8b7766, 0xc3bcb0, 0x7a5a48];
  const glassPal = [0x4f6478, 0x58708a, 0x6c8296, 0x445566, 0x7f95a6, 0x3e5266];
  const addB = (x0, x1, z0, z1, h, opts = {}) => {
    B.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, h, color: opts.color ?? pal[Math.floor(R() * pal.length)], seed: R(), front: !!opts.front, ground: opts.ground ?? 0.15 });
  };
  const inside = (x, z, box) => x > box.x0 && x < box.x1 && z > box.z0 && z < box.z1;
  const LANDMARKS = [
    { x0: -712, x1: -648, z0: 190, z1: 262 },      // Empire State Building (5th Ave & 34th St)
    { x0: 14, x1: 62, z0: 852, z1: 902 },          // Chrysler Building (Lexington & 42nd)
    PARK,
  ];
  const heightAt = (x, z, r) => {
    const core = smooth(-1500, -700, z) * (1 - smooth(900, 1400, Math.abs(x)));
    let h = 22 + Math.pow(r, 1.5) * lerp(70, 150, core);
    if (R() < lerp(0.05, 0.12, core)) h = lerp(140, 260, R());                 // towers
    if (x > -820 && x < -520 && z < -1250 && z > -1700) h = Math.max(h, 180 + R() * 200);   // Hudson Yards
    if (Math.abs(x) > 1100) h *= 0.75;
    return h;
  };
  for (let j = -16; j < 16; j++) {
    const xs = j * STREET_DX, xn = (j + 1) * STREET_DX;
    const lineS = xs + (j === 0 ? WALK : SIDE_LINE), lineN = xn - (j + 1 === 0 ? WALK : SIDE_LINE);
    const mid = (lineS + lineN) / 2;
    for (let i = 0; i < ALL_AVES.length - 1; i++) {
      const a = ALL_AVES[i], b = ALL_AVES[i + 1];
      const zE = a.z - a.w / 2 - 4, zW = b.z + b.w / 2 + 4;
      for (const [x0, x1] of [[lineS, mid], [mid, lineN]]) {
        const front = (x0 === WALK && j === 0) || (x1 === -WALK && j === -1);
        const far = Math.abs(j) > 5;
        let z = zE;
        while (z > zW + 4) {
          const len = Math.min(z - zW, far ? 30 + R() * 50 : 14 + R() * 32);
          const z1 = z, z0 = Math.max(z - len, zW);
          const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
          if (!LANDMARKS.some((L) => inside(cx, cz, L))) {
            const h = heightAt(cx, cz, R());
            // set back from the corner a little at random so the street wall isn't a perfect slab
            addB(x0, x1, z0 + 0.3, z1 - 0.3, h, { front });
          }
          z = z0;
        }
      }
    }
  }
  // Empire State Building: stepped tiers + mast
  const spires = [];
  {
    const c = { x: -680, z: 226 };
    const tiers = [[64, 66, 26], [56, 44, 260], [40, 32, 300], [30, 24, 320], [22, 18, 373]];
    let y0 = 0;
    for (const [w, d, top] of tiers) { B.push({ x: c.x, z: c.z, w, d, h: top, y0, color: 0xa79f93, seed: R(), front: false, ground: 0.15 }); y0 = top; }
    spires.push([c.x, 373, c.z, 3.5, 70]);
  }
  // Chrysler Building: shaft, stepped crown, needle
  {
    const c = { x: 38, z: 877 };
    const tiers = [[48, 50, 60], [36, 36, 210], [26, 26, 240], [20, 20, 256], [15, 15, 268], [10, 10, 278]];
    let y0 = 0;
    for (const [w, d, top] of tiers) { B.push({ x: c.x, z: c.z, w, d, h: top, y0, color: top > 215 ? 0xc9ccd2 : 0x9fa1a3, seed: R(), front: false, ground: 0.15 }); y0 = top; }
    spires.push([c.x, 278, c.z, 2.0, 42]);
  }
  // New Jersey: a row of waterfront towers, then low town blocks beyond (for the run across the state)
  for (let i = 0; i < 70; i++) {
    const x = (R() - 0.5) * 2400, z = RIVER_Z1 - 30 - R() * 120;
    if (Math.abs(x) < 160) continue;   // keep the gap where the Sun sets clear
    const w = 20 + R() * 30;
    addB(x - w / 2, x + w / 2, z - 15, z + 15, 30 + R() * 80);
  }
  for (let i = 0; i < 2600; i++) {
    const x = (R() < 0.5 ? -1 : 1) * (14 + Math.pow(R(), 1.5) * 900), z = RIVER_Z1 - 200 - R() * 26000;
    if (Math.abs(x) < 120 && z > RIVER_Z1 - 3000) continue;
    const w = 8 + R() * 18;
    addB(x - w / 2, x + w / 2, z - w / 2, z + w / 2, 6 + Math.pow(R(), 2) * 22);
  }
  // shared facade material (bend.js) with per-building seeds
  const bGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  bGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(Float32Array.from(B, (b) => b.seed), 1));
  bGeo.setAttribute('aGround', new THREE.InstancedBufferAttribute(Float32Array.from(B, (b) => b.ground), 1));
  const bMesh = shadowy(new THREE.InstancedMesh(bGeo, patch(new THREE.MeshStandardMaterial({ roughness: 0.82 }), { windows: true }), B.length));
  B.forEach((b, i) => {
    const y0 = b.y0 || 0;
    dummy.position.set(b.x, y0, b.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(b.w, b.h - y0, b.d); dummy.updateMatrix();
    bMesh.setMatrixAt(i, dummy.matrix);
    bMesh.setColorAt(i, tmpC.set(b.color));
  });
  scene.add(bMesh);
  {
    const sp = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0), plainMat(0xb9bcc2, 0.35, { metalness: 0.5 }), spires.length);
    spires.forEach(([x, y, z, r, h], i) => { dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(r, h, r); dummy.updateMatrix(); sp.setMatrixAt(i, dummy.matrix); });
    sp.frustumCulled = false; scene.add(sp);
  }
  // rooftop water tanks on the low buildings (a New York signature), red aviation lights on the tall ones
  {
    const RA = rng(77);
    const tanks = [], beacons = [];
    for (const b of B) {
      if (Math.abs(b.x) > 700 || b.z < RIVER_Z0) continue;
      if (b.h < 70 && RA() < 0.35) tanks.push([b.x + (RA() - 0.5) * b.w * 0.5, b.h, b.z + (RA() - 0.5) * b.d * 0.5]);
      if (b.h > 150) beacons.push([b.x, b.h + 1, b.z]);
    }
    const tankGeo = mergeGeometries([
      new THREE.CylinderGeometry(1.6, 1.6, 3.4, 12).translate(0, 4.3, 0).toNonIndexed(),
      new THREE.ConeGeometry(1.75, 1.3, 12).translate(0, 6.65, 0).toNonIndexed(),
      new THREE.CylinderGeometry(0.1, 0.1, 2.6, 4).translate(1.1, 1.3, 1.1).toNonIndexed(),
      new THREE.CylinderGeometry(0.1, 0.1, 2.6, 4).translate(-1.1, 1.3, -1.1).toNonIndexed(),
      new THREE.CylinderGeometry(0.1, 0.1, 2.6, 4).translate(1.1, 1.3, -1.1).toNonIndexed(),
      new THREE.CylinderGeometry(0.1, 0.1, 2.6, 4).translate(-1.1, 1.3, 1.1).toNonIndexed(),
    ]);
    const tm = new THREE.InstancedMesh(tankGeo, plainMat(0x5b4636, 0.95, { flatShading: true }), tanks.length);
    tanks.forEach(([x, y, z], i) => { dummy.position.set(x, y, z); dummy.scale.setScalar(1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); tm.setMatrixAt(i, dummy.matrix); });
    tm.frustumCulled = false; tm.castShadow = true; scene.add(tm);
    const bm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.9, 8, 6), glowMat(new THREE.Color(9, 0.5, 0.35)), beacons.length);
    beacons.forEach(([x, y, z], i) => { dummy.position.set(x, y, z); dummy.updateMatrix(); bm.setMatrixAt(i, dummy.matrix); });
    bm.frustumCulled = false; scene.add(bm);
    city.beacons = bm; city.beaconPos = beacons;
  }

  // ---------- Times Square: walls of billboards around Broadway ----------
  {
    const T = AVENUES[2];
    const boards = [];
    for (const sd of [-1, 1]) {
      for (let k = 0; k < 9; k++) {   // along 42nd, facing the street
        const z = T.z + (R() - 0.5) * 150, h = 8 + R() * 22, w = 10 + R() * 18, y = 5 + R() * 40;
        if (Math.abs(z - T.z) < T.w / 2 + 3) continue;
        boards.push({ p: [sd * (WALK - 0.25), y + h / 2, z], w, h, yaw: sd > 0 ? -Math.PI / 2 : Math.PI / 2 });
      }
      for (let k = 0; k < 7; k++) {   // on the corner buildings, facing across Broadway
        for (const fz of [-1, 1]) {
          const x = sd * (WALK + 4 + R() * 50), h = 10 + R() * 26, w = 10 + R() * 16, y = 4 + R() * 50;
          boards.push({ p: [x, y + h / 2, T.z + fz * (T.w / 2 + 4.25)], w, h, yaw: fz > 0 ? 0 : Math.PI });
        }
      }
    }
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(Float32Array.from(boards, () => R()), 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: G.uTime },
      vertexShader: /* glsl */ `
        attribute float aSeed; varying vec2 vUv; varying float vSeed;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main() { vUv = uv; vSeed = aSeed; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; varying vec2 vUv; varying float vSeed;
        #include <common>
        #include <logdepthbuf_pars_fragment>
        float h1(float n){ return fract(sin(n * 91.7) * 43758.5); }
        void main() {
          #include <logdepthbuf_fragment>
          float slide = floor(uTime / (2.5 + vSeed * 3.0) + vSeed * 7.0);
          vec3 a = 0.5 + 0.5 * cos(6.2831 * (h1(slide + vSeed * 13.0) + vec3(0.0, 0.33, 0.67)));
          vec3 b = 0.5 + 0.5 * cos(6.2831 * (h1(slide * 1.7 + vSeed * 5.0) + vec3(0.1, 0.4, 0.8)));
          float kind = h1(slide * 3.1 + vSeed);
          vec3 c;
          if (kind < 0.33) c = mix(a, b, smoothstep(0.3, 0.7, vUv.y + 0.2 * sin(vUv.x * 6.0 + uTime)));                       // gradient ad
          else if (kind < 0.66) c = mix(a * 0.3, b, step(0.5, fract(vUv.y * 4.0 - uTime * 0.6)) * step(0.15, vUv.x) * step(vUv.x, 0.85));   // ticker bands
          else c = mix(vec3(0.05), a, smoothstep(0.32, 0.3, length(vUv - vec2(0.5 + 0.2 * sin(uTime * 0.7 + vSeed * 9.0), 0.5))));  // product shot
          float frame = step(0.02, vUv.x) * step(vUv.x, 0.98) * step(0.02, vUv.y) * step(vUv.y, 0.98);
          gl_FragColor = vec4(c * (0.4 + 2.8 * frame), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const im = new THREE.InstancedMesh(geo, mat, boards.length);
    boards.forEach((b, i) => { dummy.position.set(...b.p); dummy.rotation.set(0, b.yaw, 0); dummy.scale.set(b.w, b.h, 1); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
    im.frustumCulled = false; scene.add(im);
  }

  // ---------- Bryant Park: a lawn under plane trees behind a low stone wall ----------
  const trees = [];
  {
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(PARK.x1 - PARK.x0, PARK.z1 - PARK.z0).rotateX(-Math.PI / 2).translate((PARK.x0 + PARK.x1) / 2, 0.05, (PARK.z0 + PARK.z1) / 2), plainMat(0x3f5a2c, 1.0));
    lawn.receiveShadow = true; scene.add(lawn);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, PARK.z1 - PARK.z0).translate(PARK.x1 - 0.3, 0.45, (PARK.z0 + PARK.z1) / 2), plainMat(0x9d968a, 0.85));
    wall.castShadow = wall.receiveShadow = true; scene.add(wall);
    for (let z = PARK.z0 + 4; z < PARK.z1 - 4; z += 7 + R() * 4) for (const x of [PARK.x1 - 3.5, PARK.x1 - 11 - R() * 4, PARK.x0 + 8 + R() * 10]) trees.push({ x: x + (R() - 0.5) * 2, z, s: 1.0 + R() * 0.5 });
    // street trees here and there along 42nd
    for (let z = 300; z > RIVER_Z0 + 40; z -= 9 + R() * 14) {
      const sd = R() < 0.5 ? -1 : 1;
      if (R() < 0.55 || ALL_AVES.some((a) => Math.abs(z - a.z) < a.w / 2 + 6)) continue;
      if (sd < 0 && z < PARK.z1 && z > PARK.z0) continue;
      trees.push({ x: sd * (WALK - 1.5), z, s: 0.65 + R() * 0.3 });
    }
    const trunk = new THREE.CylinderGeometry(0.18, 0.28, 5.5, 7).translate(0, 2.75, 0);
    const crown = mergeGeometries([[0, 7.2, 0, 3.4], [-2.0, 6.4, 0.9, 2.4], [1.9, 6.8, -0.6, 2.6], [0.4, 8.6, 0.8, 2.3], [-0.7, 8.0, -1.6, 2.2]]
      .map(([x, y, z, r]) => new THREE.IcosahedronGeometry(r, 1).translate(x, y, z).toNonIndexed()));
    const tm = shadowy(new THREE.InstancedMesh(trunk, plainMat(0x4a3a2c, 0.9), trees.length));
    const cm = shadowy(new THREE.InstancedMesh(crown, plainMat(0xffffff, 0.85, { flatShading: true }), trees.length));
    const RT = rng(5);
    trees.forEach((t, i) => {
      dummy.position.set(t.x, 0, t.z); dummy.rotation.set(0, RT() * 6, 0); dummy.scale.setScalar(t.s); dummy.updateMatrix();
      tm.setMatrixAt(i, dummy.matrix); cm.setMatrixAt(i, dummy.matrix);
      cm.setColorAt(i, tmpC.setHSL(0.22 + RT() * 0.07, 0.42, 0.2 + RT() * 0.08));
    });
    scene.add(tm, cm);
  }

  // ---------- street lamps and traffic lights ----------
  const lamps = [];
  {
    for (let z = 290; z > RIVER_Z0 + 30; z -= 31) for (const sd of [-1, 1]) {
      if (ALL_AVES.some((a) => Math.abs(z - a.z) < a.w / 2 + 3)) continue;
      lamps.push({ x: sd * (ROAD + 0.5), z, sd });
    }
    const pole = mergeGeometries([
      new THREE.CylinderGeometry(0.1, 0.16, 9, 8).translate(0, 4.5, 0).toNonIndexed(),
      new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6).rotateZ(Math.PI / 2).translate(-1.1, 8.8, 0).toNonIndexed(),
      new THREE.BoxGeometry(0.7, 0.18, 0.35).translate(-2.1, 8.75, 0).toNonIndexed(),
    ]);
    const pm = shadowy(new THREE.InstancedMesh(pole, plainMat(0x253228, 0.6), lamps.length));
    const bm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.06, 0.28).translate(-2.1, 8.63, 0), glowMat(new THREE.Color(7, 5.2, 3)), lamps.length);
    lamps.forEach((l, i) => { dummy.position.set(l.x, 0, l.z); dummy.rotation.set(0, l.sd > 0 ? 0 : Math.PI, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); pm.setMatrixAt(i, dummy.matrix); bm.setMatrixAt(i, dummy.matrix); });
    bm.frustumCulled = false;
    scene.add(pm, bm);
    // traffic signals at the four corners of every avenue crossing: red for 42nd (the traffic is stopped)
    const sig = [];
    for (const a of ALL_AVES) for (const sd of [-1, 1]) for (const fz of [-1, 1]) sig.push({ x: sd * (ROAD + 0.9), z: a.z + fz * (a.w / 2 + 1.0), face: fz });
    const sp = shadowy(new THREE.InstancedMesh(mergeGeometries([
      new THREE.CylinderGeometry(0.11, 0.13, 4.2, 8).translate(0, 2.1, 0).toNonIndexed(),
      new THREE.BoxGeometry(0.42, 1.2, 0.36).translate(0, 4.6, 0).toNonIndexed(),
    ]), plainMat(0x1c1f1a, 0.6), sig.length));
    const red = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 8, 6).translate(0, 5.0, 0.2), glowMat(new THREE.Color(9, 0.6, 0.3)), sig.length);
    const walkSig = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.3, 0.05).translate(0, 3.2, 0.14), glowMat(new THREE.Color(1.2, 3.2, 3.6)), sig.length);
    sig.forEach((g, i) => { dummy.position.set(g.x, 0, g.z); dummy.rotation.set(0, g.face > 0 ? 0 : Math.PI, 0); dummy.updateMatrix(); sp.setMatrixAt(i, dummy.matrix); red.setMatrixAt(i, dummy.matrix); walkSig.setMatrixAt(i, dummy.matrix); });
    red.frustumCulled = walkSig.frustumCulled = false;
    scene.add(sp, red, walkSig);
  }

  // ---------- cars: queued at the red lights on 42nd, waiting on the avenues, parked at the curbs ----------
  const cars = [];
  {
    const lanes = [[3.2, -1], [6.4, -1], [-3.2, 1], [-6.4, 1]];   // [x, heading] -1 = westbound (-z)
    for (let i = 0; i < ALL_AVES.length - 1; i++) {
      const a = ALL_AVES[i], b = ALL_AVES[i + 1];
      if (b.z < RIVER_Z0) break;
      const zE = a.z - a.w / 2 - 5, zW = b.z + b.w / 2 + 5, len = zE - zW;
      for (const [x, dir] of lanes) {
        const fill = 0.35 + R() * 0.65;
        let d = 0;
        while (d < len * fill) {
          const z = dir < 0 ? zW + 1.5 + d : zE - 1.5 - d;   // queue back from the stop line
          cars.push({ x: x + (R() - 0.5) * 0.3, z, yaw: dir < 0 ? 0 : Math.PI, creep: R() < 0.4 ? 0.3 + R() * 0.6 : 0, ph: R() * 6.28 });
          d += 5.6 + R() * 2.4;
        }
      }
      // parked along the curbs
      for (const sd of [-1, 1]) for (let z = zW + 3; z < zE - 3; z += 6 + R() * 5) if (R() < 0.6) cars.push({ x: sd * 8.4, z, yaw: sd > 0 ? 0 : Math.PI, parked: true, ph: R() * 6.28 });
    }
    // waiting on the avenues (their light is green... but they're blocked by the crowd); queues facing 42nd
    for (const a of ALL_AVES) {
      if (a.z < RIVER_Z0) continue;
      for (const sd of [-1, 1]) for (const lane of [-1, 1]) {
        const n = 3 + Math.floor(R() * 4);
        for (let k = 0; k < n; k++) cars.push({ x: sd * (WALK + 7 + k * 7.2), z: a.z + lane * a.w * 0.22, yaw: sd > 0 ? Math.PI / 2 : -Math.PI / 2, ph: R() * 6.28 });
      }
    }
  }
  const fleet = makeFleet(scene, cars.length, { plainMat, glowMat, shadowy });
  {
    const RK = rng(99);
    const paint = [0xb8b8b8, 0x1e1e22, 0xe0ddd5, 0x8a1c1c, 0x1d3557, 0x2f4f3f, 0x6d6d73, 0xf2f2f2, 0x3a3f46];
    cars.forEach((c, i) => {
      const taxi = RK() < 0.42;
      c.lights = !c.parked;
      fleet.color(i, taxi ? 0xf2b705 : paint[Math.floor(RK() * paint.length)], taxi ? (RK() < 0.6 ? 0 : 2) : [0, 1, 2, 0, 3, 2, 1][Math.floor(RK() * 7)]);
      c.vShock = shockAt(c.x, 1, c.z);
    });
  }

  // ---------- people ----------
  const P = [];
  {
    const addP = (kind, x, z, yaw, extra = {}) => P.push({ kind, x, z, yaw, h: 0.92 + R() * 0.15, ph: R() * 6.28, ...extra });
    // sunset watchers on the crosswalks across 42nd, phones up toward the Sun (more at 6th Ave and Times Square)
    for (const a of AVENUES) {
      if (a.z < RIVER_Z0) continue;
      const n = a.name === '6TH AVE' || a.name === 'BROADWAY' ? 46 : a.name === '8TH AVE' ? 26 : 12;
      for (const fz of [-1, 1]) for (let k = 0; k < n; k++) {
        let x = (R() < 0.5 ? -1 : 1) * (1.9 + Math.pow(R(), 0.8) * (ROAD + 3));
        const z = a.z + fz * (a.w / 2 + 0.8 + R() * 3.0);
        addP('watch', x, z, Math.PI + (R() - 0.5) * 0.5, { phone: R() < 0.7, both: R() < 0.5 });
      }
    }
    // right around you at the start: people standing in the street by the centre line, photographing the Sun
    for (const [x, z] of [[-1.9, -6], [1.95, -9], [-2.0, -13.5], [1.9, -17], [-1.9, -21], [2.0, -2.5], [-1.95, 2.5], [1.9, 5]]) addP('watch', x, z, Math.PI + (R() - 0.5) * 0.3, { phone: true, both: R() < 0.6 });
    // the sidewalks: people walking both ways, and some stopped to look west
    for (const sd of [-1, 1]) for (let z = 280; z > RIVER_Z0 + 20; z -= (z > -700 ? 2.6 : 5.5) + R() * 3) {
      const x = sd * (ROAD + 0.9 + R() * (WALK - ROAD - 1.8));
      if (sd < 0 && z < PARK.z1 && z > PARK.z0 && R() < 0.3) continue;
      if (R() < 0.3) addP('watch', x, z, Math.PI + (R() - 0.5) * 0.8, { phone: R() < 0.5, both: R() < 0.4 });
      else addP('walk', x, z, 0, { dir: R() < 0.5 ? -1 : 1, speed: 1.1 + R() * 0.5 });
    }
  }
  const crowd = makeCrowd(scene, P.length, plainMat(0xffffff, 0.8), { castShadow: true });
  {
    const RP = rng(31);
    const clothes = [0x2b2d42, 0x8d99ae, 0xef233c, 0xedf2f4, 0x3a5a40, 0xd4a373, 0x264653, 0xe9c46a, 0x6d597a, 0x1d1d1d, 0xf4a261, 0xb5838d];
    P.forEach((p, i) => {
      crowd.color(i, clothes[Math.floor(RP() * clothes.length)], [0x2b2d42, 0x3d405b, 0x1d1d1d, 0x6b705c, 0x284b63, 0x8a817c][Math.floor(RP() * 6)],
        SKIN[Math.floor(RP() * SKIN.length)], HAIR[Math.floor(RP() * HAIR.length)], RP() < 0.6);
      p.vShock = shockAt(p.x, 1, p.z);
      p.fallDir = Math.sign(p.x) || 1;
    });
  }

  // ---------- the glass: every window you pass after the sound barrier blows out into the street ----------
  {
    const MAXN = 42000;
    const p0 = [], vel = [], t0 = [], spin = [], size = [];
    const RG = rng(8);
    for (const b of B) {
      if (!b.front || b.z > Z_MACH1 + 10 || b.z < RIVER_Z0) continue;
      const sd = Math.sign(b.x), xf = sd * (WALK - 0.05);
      const area = b.d * Math.min(b.h, 90);
      const n = Math.min(Math.round(area / 2.2), 2600);
      for (let k = 0; k < n && p0.length / 3 < MAXN; k++) {
        const y = 4.5 + RG() * (Math.min(b.h, 90) - 5), z = b.z + (RG() - 0.5) * b.d;
        p0.push(xf, y, z);
        vel.push(-sd * (2 + RG() * 9), -0.5 + RG() * 3, (RG() - 0.6) * 5);
        t0.push(shockAt(xf, y, z) + RG() * 0.08);
        spin.push((RG() - 0.5) * 2, (RG() - 0.5) * 2, (RG() - 0.5) * 2, 4 + RG() * 18);
        size.push(0.12 + Math.pow(RG(), 2) * 0.45);
      }
    }
    const n = t0.length;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.setAttribute('aP0', new THREE.InstancedBufferAttribute(new Float32Array(p0), 3));
    geo.setAttribute('aVel', new THREE.InstancedBufferAttribute(new Float32Array(vel), 3));
    geo.setAttribute('aT0', new THREE.InstancedBufferAttribute(new Float32Array(t0), 1));
    geo.setAttribute('aSpin', new THREE.InstancedBufferAttribute(new Float32Array(spin), 4));
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(size), 1));
    geo.instanceCount = n;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: G.uTime, uSunDir: G.uSunDir },
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute vec3 aP0; attribute vec3 aVel; attribute float aT0; attribute vec4 aSpin; attribute float aSize;
        uniform float uTime; varying vec3 vN; varying vec3 vW; varying float vAlive;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        mat3 rotAxis(vec3 k, float a) { k = normalize(k); float c = cos(a), s = sin(a), t = 1.0 - c;
          return mat3(t*k.x*k.x + c, t*k.x*k.y + s*k.z, t*k.x*k.z - s*k.y, t*k.x*k.y - s*k.z, t*k.y*k.y + c, t*k.y*k.z + s*k.x, t*k.x*k.z + s*k.y, t*k.y*k.z - s*k.x, t*k.z*k.z + c); }
        void main() {
          float dt = uTime - aT0;
          vAlive = step(0.0, dt);
          dt = max(dt, 0.0);
          // fall with a little air drag; stop on the ground
          float tl = (aVel.y + sqrt(aVel.y * aVel.y + 2.0 * 9.0 * aP0.y)) / 9.0;
          float t = min(dt, tl);
          vec3 p = aP0 + vec3(aVel.x, 0.0, aVel.z) * (1.0 - exp(-t * 0.9)) / 0.9 + vec3(0.0, aVel.y * t - 4.5 * t * t, 0.0);
          p.y = max(p.y, 0.16 + 0.02 * fract(aSize * 31.0));
          mat3 Rm = rotAxis(aSpin.xyz, aSpin.w * t);
          if (dt >= tl) Rm = mat3(1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, -1.0, 0.0) * rotAxis(vec3(0.0, 0.0, 1.0), aSpin.w);   // lying flat
          vec3 lp = Rm * (position * aSize * vec3(1.0, 0.7, 1.0));
          vN = Rm * vec3(0.0, 0.0, 1.0);
          vW = p + lp;
          gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0) * vAlive + vec4(0.0, 0.0, 2.0, 1.0) * (1.0 - vAlive);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir; varying vec3 vN; varying vec3 vW; varying float vAlive;
        #include <common>
        #include <logdepthbuf_pars_fragment>
        void main() {
          #include <logdepthbuf_fragment>
          if (vAlive < 0.5) discard;
          vec3 V = normalize(cameraPosition - vW);
          vec3 N = normalize(vN); if (dot(N, V) < 0.0) N = -N;
          vec3 Rr = reflect(-V, N);
          float glint = pow(max(dot(Rr, uSunDir), 0.0), 80.0) * 30.0 + pow(max(dot(Rr, uSunDir), 0.0), 6.0) * 1.2;
          float fres = 0.08 + 0.9 * pow(1.0 - max(dot(N, V), 0.0), 4.0);
          vec3 c = vec3(0.16, 0.2, 0.22) + vec3(1.0, 0.68, 0.38) * (glint + fres * 0.8);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    city.glassCount = n;
  }

  // ---------- the Hudson: calm water with the Sun's glitter path coming straight down the river at you ----------
  {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: G.uTime, uSunDir: G.uSunDir, uFog: { value: new THREE.Color() }, uFogD: { value: 0.0001 } },
      vertexShader: /* glsl */ `varying vec3 vW;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `uniform float uTime; uniform vec3 uSunDir; uniform vec3 uFog; uniform float uFogD; varying vec3 vW;
        #include <common>
        #include <logdepthbuf_pars_fragment>
        float hh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hh(i), hh(i+vec2(1,0)), f.x), mix(hh(i+vec2(0,1)), hh(i+vec2(1,1)), f.x), f.y); }
        void main() {
          #include <logdepthbuf_fragment>
          vec2 p = vW.xz;
          float fp = max(length(fwidth(p)), 0.01);
          vec2 g = vec2(0.0);
          for (int i = 0; i < 6; i++) {
            float fi = float(i); float L = 9.0 * pow(0.62, fi); float k = 6.2831 / L;
            float a = 0.6 + fi * 1.9; vec2 d = vec2(cos(a), sin(a));
            g += d * cos(dot(d, p) * k - uTime * sqrt(9.8 * k) + fi * 1.7) * 0.05 * smoothstep(1.5 * fp, 5.0 * fp, L);
          }
          vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
          vec3 V = normalize(cameraPosition - vW);
          vec3 Rr = reflect(-V, N); Rr.y = abs(Rr.y);
          float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
          vec3 sky = mix(vec3(0.55, 0.42, 0.42), vec3(1.0, 0.62, 0.32), pow(max(dot(normalize(Rr.xz + 1e-5), normalize(uSunDir.xz + 1e-5)), 0.0), 3.0));
          vec3 c = mix(vec3(0.03, 0.05, 0.06), sky, fres);
          float sp = max(dot(Rr, uSunDir), 0.0);
          c += vec3(1.0, 0.6, 0.28) * (pow(sp, 300.0) * 22.0 + pow(sp, 40.0) * 1.2);
          float fog = 1.0 - exp(-length(vW - cameraPosition) * uFogD);
          gl_FragColor = vec4(mix(c, uFog, fog), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const w = new THREE.Mesh(new THREE.PlaneGeometry(16000, RIVER_Z0 - RIVER_Z1, 1, 1).rotateX(-Math.PI / 2).translate(0, -0.6, (RIVER_Z0 + RIVER_Z1) / 2), mat);
    w.frustumCulled = false;
    scene.add(w);
    city.water = mat;
  }

  // ---------- New Jersey and beyond: a ground that streams past ----------
  {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'varying vec3 vNW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vNW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'varying vec3 vNW;\n float hn(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }\n float vnn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hn(i), hn(i+vec2(1,0)), f.x), mix(hn(i+vec2(0,1)), hn(i+vec2(1,1)), f.x), f.y); }\n' +
        sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 p = vNW.xz;
          vec2 fw = fwidth(p);
          // town grid: blocks of lawns and roofs with streets, fading to fields further out
          vec2 q = p / 70.0; vec2 f = fract(q); float rq = hn(floor(q));
          float street = 1.0 - min(smoothstep(0.0, 0.06 + fw.x / 70.0, f.x), smoothstep(0.0, 0.06 + fw.y / 70.0, f.y));
          vec3 lawn = mix(vec3(0.16, 0.2, 0.1), vec3(0.24, 0.24, 0.14), vnn(p * 0.05));
          vec3 roofs = mix(vec3(0.28, 0.22, 0.2), vec3(0.4, 0.38, 0.36), rq);
          vec3 c = mix(lawn, roofs, step(0.45, vnn(p * 0.11 + rq)) * 0.7);
          c = mix(c, vec3(0.12, 0.12, 0.13), street);
          float town = smoothstep(0.35, 0.6, vnn(p * 0.0007));
          c = mix(mix(vec3(0.22, 0.24, 0.12), vec3(0.3, 0.26, 0.16), vnn(p * 0.003)), c, max(town, 1.0 - smoothstep(2000.0, 6000.0, -p.y + ${RIVER_Z1.toFixed(1)})));
          diffuseColor.rgb = c;
        }`);
    };
    const g = new THREE.Mesh(new THREE.PlaneGeometry(60000, 120000).rotateX(-Math.PI / 2).translate(0, -0.05, RIVER_Z1 - 60000), mat);
    g.receiveShadow = true; g.frustumCulled = false;
    scene.add(g);
  }

  // ---------- lights ----------
  const sun = new THREE.DirectionalLight(0xffb070, 3.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 4096);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  const sc = sun.shadow.camera;
  sc.left = -48; sc.right = 48; sc.top = 150; sc.bottom = -4; sc.near = 1; sc.far = 1700;
  const hemi = new THREE.HemisphereLight(0x8ea6d6, 0x6a4c3a, 1.05);
  scene.add(sun, sun.target, hemi);

  // ---------- per-frame ----------
  const camWas = new THREE.Vector3();
  city.frame = (v, s, cam) => {
    G.uTime.value = v;
    G.uCity.value = 0.42;
    G.uSunDir.value.copy(city.sunDir);
    // the Sun's shadow box follows you down the street (it looks back along the light, toward you)
    const cz = cam.position.z, cx = cam.position.x;
    sun.position.set(cx + city.sunDir.x * 1300, city.sunDir.y * 1300, cz + city.sunDir.z * 1300 - 200);
    sun.target.position.set(cx, 0, cz - 200);
    sun.castShadow = s.scene === 'street' && cam.position.z > RIVER_Z1 - 3000;

    // cars: queued traffic inches forward; after the shock: a jolt, and their hazard lights start flashing (alarms)
    cars.forEach((c, i) => {
      const creep = c.creep ? c.creep * (1 - Math.cos(Math.min(v, 30) * 0.4 + c.ph)) * 0.6 : 0;
      const z = c.z + (c.yaw === 0 ? -creep : c.yaw === Math.PI ? creep : 0);
      const ds = v - c.vShock;
      const jolt = ds > 0 ? Math.exp(-ds * 4) * Math.sin(ds * 30) * 0.06 : 0;
      dummy.position.set(c.x, jolt * 2, z);
      dummy.rotation.set(jolt, c.yaw, jolt * 0.7);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      const alarm = ds > 0.15 && Math.sin((v + c.ph) * Math.PI * 2.2) > 0;
      fleet.set(i, dummy.matrix, ds > 0.15 ? alarm : c.lights);
    });
    fleet.commit();

    // people: watching the Sun and filming; they turn to look as you blur past; the shock throws them down
    P.forEach((p, i) => {
      let x = p.x, z = p.z, yaw = p.yaw, walk = 0, stride = 0, armL = 0, armR = 0, look = 0.05, pitch = 0, roll = 0, y = p.kind === 'watch' && Math.abs(p.x) > ROAD ? 0.15 : 0;
      if (p.kind === 'walk') {
        z = p.z + p.dir * p.speed * v;
        yaw = p.dir > 0 ? 0 : Math.PI;
        walk = v * 5.6 * p.speed + p.ph; stride = 1;
        y = 0.15;
      } else {
        armR = p.phone ? 1.0 : 0; armL = p.phone && p.both ? 0.95 : 0;
        if (!p.phone && i % 5 === 0) armR = 1.25;   // pointing at the Sun
        yaw += Math.sin(v * 0.4 + p.ph) * 0.08;
      }
      // as you go past: they whip round to follow you
      const passed = v - vPass(z);
      if (passed > -0.4 && v > V_GO) {
        const turn = smooth(-0.4, 0.5, passed) * (1 - smooth(4, 7, passed));
        const toward = Math.atan2(-x, cam.position.z - z);
        yaw = lerp(yaw, toward, turn * 0.8);
        if (p.kind === 'walk') stride *= 1 - turn;
      }
      // knocked flat by the sonic boom
      const ds = v - p.vShock;
      if (ds > 0) {
        const f = smooth(0, 0.45, ds) * (1 + 0.08 * Math.exp(-ds * 5) * Math.sin(ds * 25));
        const th = 1.42 * f;
        // fall away from the street: tilt toward world +-x, expressed in the person's own frame
        const lx = p.fallDir * Math.cos(yaw), lz = p.fallDir * Math.sin(yaw);
        pitch = th * lz; roll = -th * lx;
        y += 0.12 * f;
        armL = 1.4; armR = 1.5; stride = 0;
        if (p.kind === 'walk') z = p.z + p.dir * p.speed * p.vShock;
      }
      crowd.pose(i, { x, y, z, yaw, s: p.h, walk, stride, armL, armR, look, pitch, roll });
    });
    crowd.commit();

    // aviation lights blink
    city.beaconPos.forEach(([x, y, z], i) => {
      dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(Math.sin(v * 2.2 + i) > 0.2 ? 1 : 0.001); dummy.updateMatrix();
      city.beacons.setMatrixAt(i, dummy.matrix);
    });
    city.beacons.instanceMatrix.needsUpdate = true;
    camWas.copy(cam.position);
  };
  city.sun = sun;
  city.hemi = hemi;
  city.sunDir = new THREE.Vector3(0, Math.sin(1.25 * DEG), -1).normalize();
  city.zMach1 = Z_MACH1;
  return city;
}

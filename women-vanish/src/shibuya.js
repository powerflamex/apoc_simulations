// Shibuya Crossing at noon, at real proportions (the scramble is ~44 x 40 m), from the north-east corner looking
// across to Q-Front's giant screens. ~900 people (planned in people.js so nobody overlaps), cars waiting at the red
// on all four approaches (traffic.js). When every woman vanishes, what she carried drops to the street and her car
// creeps forward. Over the time-lapse the crossing empties, the screens go dark, and over the decades the city goes
// green: weeds and bushes through the asphalt, trees, ivy up the walls, moss on the roofs (G.uGreen), dust on the cars.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patch, G } from './bend.js';
import { rng, smooth, clamp, lerp, DEG } from './util.js';
import { makeFleet } from './cars.js';
import { makeCrowd } from './crowd.js';
import { V_EVENT, V_RISE } from './timeline.js';
import { RX, RZ, CW, CARS, carsAlong, carPose } from './traffic.js';
import { PEOPLE, ITEMS, personAt, itemAt } from './people.js';

const dummy = new THREE.Object3D();
const tmpC = new THREE.Color(), tmpC2 = new THREE.Color();
const HIP = 0.9, SHOULDER = 1.42;   // (same as crowd.js)

export function makeShibuya(scene) {
  const R = rng(1109);
  const S = {};
  const plainMat = (color, rough = 0.9, extra = {}) => patch(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
  const glowMat = (color) => patch(new THREE.MeshBasicMaterial({ color, toneMapped: true }));
  const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };

  // ---------- the ground: asphalt, the scramble markings, sidewalks; weeds and grass take it over in the end ----------
  {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uGreen = G.uGreen;
      sh.vertexShader = 'varying vec3 vGW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = `varying vec3 vGW; uniform float uGreen;
        float h2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float vn2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
        float bars(float along, float aa) { return smoothstep(0.5 - aa, 0.5 + aa, fract(along / 0.9)) ; }
        ` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 p = vGW.xz;
          float aa = max(max(fwidth(p.x), fwidth(p.y)) * 0.8, 0.01);
          vec3 col = vec3(0.17, 0.17, 0.18) * (0.82 + 0.3 * vn2(p * 0.6) + 0.12 * vn2(p * 5.0));
          float inX = 1.0 - smoothstep(${RX}.0 - aa, ${RX}.0 + aa, abs(p.x));
          float inZ = 1.0 - smoothstep(${RZ}.0 - aa, ${RZ}.0 + aa, abs(p.y));
          float road = max(inX, inZ);
          float cwE = step(${RX}.0 + 0.5, abs(p.x)) * step(abs(p.x), ${RX + CW}.0) * inZ;
          float cwN = step(${RZ}.0 + 0.5, abs(p.y)) * step(abs(p.y), ${RZ + CW}.0) * inX;
          float zeb = cwE * bars(p.y, aa / 0.9) + cwN * bars(p.x, aa / 0.9);
          float d1 = abs(p.x - p.y * ${(RX / RZ).toFixed(3)}) * 0.7, d2 = abs(p.x + p.y * ${(RX / RZ).toFixed(3)}) * 0.7;
          float inMid = inX * inZ;
          float diag = inMid * (step(d1, 3.4) * bars((p.x + p.y) * 0.707, aa) + step(d2, 3.4) * bars((p.x - p.y) * 0.707, aa));
          float stopL = (1.0 - smoothstep(0.2 - aa, 0.2 + aa, abs(abs(p.x) - ${(RX + CW + 1.5).toFixed(1)}))) * inZ + (1.0 - smoothstep(0.2 - aa, 0.2 + aa, abs(abs(p.y) - ${(RZ + CW + 1.5).toFixed(1)}))) * inX;
          float lane = (1.0 - smoothstep(0.07 - aa, 0.07 + aa, abs(abs(p.y) - 4.35))) * step(${RX + CW + 2}.0, abs(p.x)) * step(fract(p.x / 8.0), 0.45) * inZ
                     + (1.0 - smoothstep(0.07 - aa, 0.07 + aa, abs(abs(p.y) - 7.85))) * step(${RX + CW + 2}.0, abs(p.x)) * step(fract(p.x / 8.0), 0.45) * inZ
                     + (1.0 - smoothstep(0.07 - aa, 0.07 + aa, abs(abs(p.x) - 4.35))) * step(${RZ + CW + 2}.0, abs(p.y)) * step(fract(p.y / 8.0), 0.45) * inX
                     + (1.0 - smoothstep(0.07 - aa, 0.07 + aa, abs(abs(p.x) - 7.85))) * step(${RZ + CW + 2}.0, abs(p.y)) * step(fract(p.y / 8.0), 0.45) * inX;
          float centre = (1.0 - smoothstep(0.1 - aa, 0.1 + aa, abs(p.y))) * step(${RX + CW + 2}.0, abs(p.x)) + (1.0 - smoothstep(0.1 - aa, 0.1 + aa, abs(p.x))) * step(${RZ + CW + 2}.0, abs(p.y));
          vec3 paint = vec3(0.82, 0.81, 0.77) * (0.7 + 0.3 * vn2(p * 2.0)) * (1.0 - 0.35 * uGreen);
          col = mix(col, paint, clamp(max(zeb, diag) * 0.92 + stopL + lane * 0.8, 0.0, 1.0) * road);
          col = mix(col, vec3(0.8, 0.62, 0.15) * (1.0 - 0.35 * uGreen), centre * 0.85 * road);
          vec2 q = p / 0.6; vec2 f = fract(q);
          vec3 tile = vec3(0.56, 0.54, 0.5) * (0.88 + 0.18 * h2(floor(q)));
          tile *= 0.85 + 0.15 * smoothstep(0.0, 0.08, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
          col = mix(tile, col, road);
          // decades later: dirt, cracks with weeds, then grass in spreading patches
          col *= 1.0 - 0.3 * uGreen;
          float crack = 1.0 - smoothstep(0.0, 0.06, abs(vn2(p * 0.35) - 0.5)) ;
          float patchN = vn2(p * 0.07) * 0.55 + vn2(p * 0.4) * 0.3 + vn2(p * 2.5) * 0.15;
          float gk = uGreen * mix(1.0, 0.62, road);   // (the asphalt holds out longest: the crossing's stripes still show through)
          float grass = max(crack * smoothstep(0.05, 0.3, uGreen), smoothstep(1.02 - gk * 0.95, 1.1 - gk * 0.95, patchN));
          vec3 grassC = mix(vec3(0.16, 0.25, 0.08), vec3(0.3, 0.38, 0.12), vn2(p * 3.0)) * (0.8 + 0.3 * vn2(p * 9.0));
          col = mix(col, grassC, clamp(grass, 0.0, 1.0) * step(0.003, uGreen));
          diffuseColor.rgb = col;
        }`);
    };
    mat.customProgramCacheKey = () => 'ground-wv';
    const g = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2), mat);
    g.receiveShadow = true; g.frustumCulled = false;
    scene.add(g);
    const curb = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      curb.push(new THREE.BoxGeometry(400, 0.15, 0.3).translate(sx * (RX + 200), 0.075, sz * RZ));
      curb.push(new THREE.BoxGeometry(0.3, 0.15, 400).translate(sx * RX, 0.075, sz * (RZ + 200)));
    }
    scene.add(shadowy(new THREE.Mesh(mergeGeometries(curb), plainMat(0x8a8780, 0.8))));
  }

  // ---------- buildings: dense mid-rise blocks in every quadrant, a few towers ----------
  const B = [];
  const pal = [0xb9b2a6, 0xa49d92, 0x8f8c88, 0xd1cbc0, 0x7f7a74, 0xc8c1b5, 0x6f747a, 0x9da4ab, 0xb3a28c, 0x8a7f73];
  const glassPal = [0x55697d, 0x5e7690, 0x6f879b, 0x46586a];
  const addB = (x0, x1, z0, z1, h, color) => B.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, h, color: color ?? pal[Math.floor(R() * pal.length)], seed: R() });
  const EX = RX + CW + 2, EZ = RZ + CW + 2;                     // where the blocks start
  const QF = { x0: -EX - 27, x1: -EX, z0: -EZ - 24, z1: -EZ };   // Q-Front, the giant-screen building on the far corner
  const SQ = { x0: EX, x1: EX + 50, z0: -EZ - 44, z1: -EZ };    // Shibuya Scramble Square over the station
  const L109 = { x: -200, z: 0, r: 13 };                        // Shibuya 109 where the road forks
  const inBox = (x, z, b, m = 2) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m;
  const clear = (x, z) => inBox(x, z, QF) || inBox(x, z, SQ) || Math.hypot(x - L109.x, z - L109.z) < 22;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 7; col++) {
        const bx0 = EX + col * 46, bz0 = EZ + row * 42;
        let x = bx0;
        while (x < bx0 + 38) {
          const w = 7 + R() * 14;
          let z = bz0;
          while (z < bz0 + 34) {
            const d = 9 + R() * 14;
            const cx = sx * (x + Math.min(w, bx0 + 38 - x) / 2), cz = sz * (z + Math.min(d, bz0 + 34 - z) / 2);
            if (!clear(cx, cz)) {
              let h = 14 + Math.pow(R(), 1.3) * 36 + (Math.hypot(cx, cz) > 150 ? R() * 20 : 0);
              if (R() < 0.05) h = 70 + R() * 70;
              const X0 = sx > 0 ? x : -(x + Math.min(w, bx0 + 38 - x)), X1 = sx > 0 ? x + Math.min(w, bx0 + 38 - x) : -x;
              const Z0 = sz > 0 ? z : -(z + Math.min(d, bz0 + 34 - z)), Z1 = sz > 0 ? z + Math.min(d, bz0 + 34 - z) : -z;
              addB(X0 + 0.25, X1 - 0.25, Z0 + 0.25, Z1 - 0.25, h, h > 70 ? glassPal[Math.floor(R() * glassPal.length)] : undefined);
            }
            z += d;
          }
          x += w;
        }
      }
    }
  }
  addB(SQ.x0, SQ.x1, SQ.z0, SQ.z1, 230, 0x5a6f84);
  addB(QF.x0, QF.x1, QF.z0, QF.z1, 38, 0x3f4a55);
  const bGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  bGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(Float32Array.from(B, (b) => b.seed), 1));
  bGeo.setAttribute('aGround', new THREE.InstancedBufferAttribute(new Float32Array(B.length).fill(0.15), 1));
  const bMesh = shadowy(new THREE.InstancedMesh(bGeo, patch(new THREE.MeshStandardMaterial({ roughness: 0.8 }), { windows: true }), B.length));
  B.forEach((b, i) => { dummy.position.set(b.x, 0, b.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(b.w, b.h, b.d); dummy.updateMatrix(); bMesh.setMatrixAt(i, dummy.matrix); bMesh.setColorAt(i, tmpC.set(b.color)); });
  scene.add(bMesh);
  {
    const g = mergeGeometries([
      new THREE.CylinderGeometry(L109.r, L109.r, 46, 32).translate(0, 23, 0).toNonIndexed(),
      new THREE.CylinderGeometry(L109.r * 0.92, L109.r * 0.92, 10, 32).translate(0, 51, 0).toNonIndexed(),
    ]);
    const m = shadowy(new THREE.Mesh(g, plainMat(0xc9ccd0, 0.35, { metalness: 0.35 })));
    m.position.set(L109.x, 0, L109.z);
    scene.add(m);
  }
  const insideB = (x, z, m = 0.5) => B.some((b) => Math.abs(x - b.x) < b.w / 2 + m && Math.abs(z - b.z) < b.d / 2 + m);

  // ---------- giant screens and signs (they show the news after it happens; dark once the power fails) ----------
  const screens = [];
  screens.push({ p: [QF.x1 + 0.3, 21, (QF.z0 + QF.z1) / 2], w: 22, h: 26, yaw: Math.PI / 2 });
  screens.push({ p: [(QF.x0 + QF.x1) / 2, 21, QF.z1 + 0.3], w: 25, h: 26, yaw: 0 });
  for (const b of B) {
    const nearCorner = Math.abs(b.x) < 95 && Math.abs(b.z) < 95 && b.h > 18;
    if (!nearCorner || R() < 0.45) continue;
    const faceX = Math.abs(b.x) > Math.abs(b.z);
    const w = Math.min(faceX ? b.d : b.w, 8 + R() * 10), h = 6 + R() * 10, y = 8 + R() * Math.max(b.h - h - 10, 2);
    if (faceX) screens.push({ p: [b.x - Math.sign(b.x) * (b.w / 2 + 0.3), y + h / 2, b.z], w, h, yaw: b.x > 0 ? -Math.PI / 2 : Math.PI / 2 });
    else screens.push({ p: [b.x, y + h / 2, b.z - Math.sign(b.z) * (b.d / 2 + 0.3)], w, h, yaw: b.z > 0 ? Math.PI : 0 });
  }
  const screenU = { uTime: G.uTime, uOn: { value: 1 }, uNews: { value: 0 } };
  {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(Float32Array.from(screens, () => R()), 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: screenU,
      vertexShader: /* glsl */ `attribute float aSeed; varying vec2 vUv; varying float vSeed;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main() { vUv = uv; vSeed = aSeed; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `uniform float uTime; uniform float uOn; uniform float uNews; varying vec2 vUv; varying float vSeed;
        #include <common>
        #include <logdepthbuf_pars_fragment>
        float h1(float n){ return fract(sin(n * 91.7) * 43758.5); }
        void main() {
          #include <logdepthbuf_fragment>
          float slide = floor(uTime / (2.0 + vSeed * 2.5) + vSeed * 7.0);
          vec3 a = 0.5 + 0.5 * cos(6.2831 * (h1(slide + vSeed * 13.0) + vec3(0.0, 0.33, 0.67)));
          vec3 b = 0.5 + 0.5 * cos(6.2831 * (h1(slide * 1.7 + vSeed * 5.0) + vec3(0.1, 0.4, 0.8)));
          float kind = h1(slide * 3.1 + vSeed);
          vec3 c;
          if (kind < 0.3) c = mix(a, b, smoothstep(0.2, 0.8, vUv.y + 0.25 * sin(vUv.x * 5.0 + uTime * 1.3)));
          else if (kind < 0.6) c = mix(a * 0.25, b, step(0.5, fract(vUv.x * 3.0 - uTime * 0.5)) * step(0.2, vUv.y) * step(vUv.y, 0.8));
          else c = mix(vec3(0.05, 0.05, 0.08), a, smoothstep(0.3, 0.27, length((vUv - vec2(0.5 + 0.18 * sin(uTime * 0.8 + vSeed * 9.0), 0.5)) * vec2(1.6, 1.0))));
          // breaking news: a red banner with a white headline bar, a dark studio above
          vec3 news = mix(vec3(0.12, 0.13, 0.17), vec3(0.3, 0.32, 0.38), step(0.55, vUv.y) * step(vUv.x, 0.6) * step(0.3, vUv.x));
          news = mix(news, vec3(0.85, 0.06, 0.05), step(vUv.y, 0.3));
          news = mix(news, vec3(1.0), step(0.08, vUv.y) * step(vUv.y, 0.2) * step(0.06, vUv.x) * step(vUv.x, 0.94) * step(0.35, fract(vUv.x * 9.0 + vSeed)));
          c = mix(c, news, uNews);
          float fr = step(0.015, vUv.x) * step(vUv.x, 0.985) * step(0.015, vUv.y) * step(vUv.y, 0.985);
          c = c * (0.5 + 2.4 * fr) * uOn + vec3(0.05, 0.06, 0.075) * (1.0 - uOn);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const im = new THREE.InstancedMesh(geo, mat, screens.length);
    screens.forEach((s, i) => { dummy.position.set(...s.p); dummy.rotation.set(0, s.yaw, 0); dummy.scale.set(s.w, s.h, 1); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
    im.frustumCulled = false; scene.add(im);
  }
  const signMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  {
    const signs = [];
    for (const b of B) {
      if (Math.hypot(b.x, b.z) > 150 || b.h < 14) continue;
      const n = Math.floor(R() * 3);
      for (let k = 0; k < n; k++) {
        const faceX = Math.abs(b.x) > Math.abs(b.z) ? R() < 0.7 : R() < 0.3;
        const h = 3 + R() * 9, y = 4 + R() * Math.max(b.h - h - 6, 1), off = (R() - 0.5) * (faceX ? b.d : b.w) * 0.8;
        if (faceX) signs.push({ p: [b.x - Math.sign(b.x) * (b.w / 2 + 0.9), y + h / 2, b.z + off], h, yaw: 0, c: R() });
        else signs.push({ p: [b.x + off, y + h / 2, b.z - Math.sign(b.z) * (b.d / 2 + 0.9)], h, yaw: Math.PI / 2, c: R() });
      }
    }
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 1, 1.4), signMat, signs.length);
    const cols = [0xff3b5c, 0x39d0ff, 0xffd23f, 0x7dff6a, 0xff8a2a, 0xffffff, 0xd56bff];
    signs.forEach((s, i) => { dummy.position.set(...s.p); dummy.rotation.set(0, s.yaw, 0); dummy.scale.set(1, s.h, 1); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, tmpC.set(cols[Math.floor(s.c * cols.length)]).multiplyScalar(2.2)); });
    im.frustumCulled = false; scene.add(im);
  }

  // ---------- traffic lights on the corners ----------
  const lampMat = glowMat(new THREE.Color(9, 0.6, 0.3));
  {
    const poles = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const k of [0, 1]) poles.push({ x: sx * (RX + 0.8 + k * (CW + 1.5)), z: sz * (RZ + 0.8 + (1 - k) * (CW + 1.5)) });
    const pg = mergeGeometries([new THREE.CylinderGeometry(0.12, 0.15, 5.5, 8).translate(0, 2.75, 0).toNonIndexed(), new THREE.BoxGeometry(0.4, 1.3, 0.35).translate(0, 5.0, 0).toNonIndexed()]);
    const pm = shadowy(new THREE.InstancedMesh(pg, plainMat(0x404448, 0.6), poles.length));
    poles.forEach((p, i) => { dummy.position.set(p.x, 0, p.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); pm.setMatrixAt(i, dummy.matrix); });
    scene.add(pm);
    const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 8, 6).translate(0, 5.35, 0.2), lampMat, poles.length);
    poles.forEach((p, i) => { dummy.position.set(p.x, 0, p.z); dummy.updateMatrix(); lamps.setMatrixAt(i, dummy.matrix); });
    lamps.frustumCulled = false; scene.add(lamps);
    S.lamps = lamps;
  }

  // ---------- cars and buses at the red ----------
  const fleet = makeFleet(scene, CARS.length, { plainMat, glowMat, shadowy });
  const carColor = CARS.map((c) => new THREE.Color(c.bus ? 0x2e8b57 : c.taxi ? (c.paint < 0.6 ? 0x1c2a22 : 0xd9b23a) : [0xf2f2f2, 0x1b1b1f, 0xb8b8b8, 0x2b4a6b, 0x7a1e22, 0xe6e2d8][Math.floor(c.paint * 6)]));
  CARS.forEach((c, i) => fleet.color(i, carColor[i], c.kind));
  const dust = new THREE.Color(0x6b6252);
  const along = new Float32Array(CARS.length);

  // ---------- people ----------
  const crowd = makeCrowd(scene, PEOPLE.length, plainMat(0xffffff, 0.8), { castShadow: true });
  PEOPLE.forEach((p, i) => crowd.color(i, p.shirt, p.skirt || p.pants, p.skin, p.hair, p.sleeves));
  // the women's long hair and skirts (posed with the same body frame crowd.js uses)
  const W = PEOPLE.map((p, i) => i).filter((i) => PEOPLE[i].woman);
  const wIdx = new Int32Array(PEOPLE.length).fill(-1); W.forEach((pi, k) => (wIdx[pi] = k));
  const longHair = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8).scale(0.125, 0.25, 0.08).translate(0, SHOULDER + 0.1, -0.075), plainMat(0xffffff, 0.75), W.length);
  const skirt = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.27, 0.5, 12, 1, true).translate(0, HIP - 0.17, 0), plainMat(0xffffff, 0.85, { side: THREE.DoubleSide }), W.length);
  for (const m of [longHair, skirt]) { shadowy(m); scene.add(m); }
  W.forEach((pi, k) => { const p = PEOPLE[pi]; longHair.setColorAt(k, tmpC.set(p.hair)); skirt.setColorAt(k, tmpC.set(p.skirt || 0x000000)); });
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const base = new THREE.Matrix4(), loc = new THREE.Matrix4(), m4 = new THREE.Matrix4();
  const e = new THREE.Euler(), q = new THREE.Quaternion(), vv = new THREE.Vector3(), sc = new THREE.Vector3();
  function bodyFrame(o) {
    const bob = Math.abs(Math.cos(o.walk)) * 0.045 * o.stride;
    e.set(o.pitch || 0, o.yaw, 0, 'YXZ'); q.setFromEuler(e);
    vv.set(o.x, o.y + bob - (o.sit || 0) * 0.42, o.z); sc.setScalar(o.s);
    return base.compose(vv, q, sc);
  }
  // what the women carried: handbags, phones, umbrellas
  const itemGeo = [new THREE.BoxGeometry(0.32, 0.25, 0.12).translate(0, 0.125, 0), new THREE.BoxGeometry(0.075, 0.012, 0.155).translate(0, 0.006, 0), new THREE.CylinderGeometry(0.035, 0.05, 0.85, 8).rotateZ(Math.PI / 2).translate(0, 0.05, 0)];
  const itemMesh = itemGeo.map((g) => { const m = shadowy(new THREE.InstancedMesh(g, plainMat(0xffffff, 0.6), Math.max(1, ITEMS.length))); scene.add(m); return m; });
  ITEMS.forEach((it, i) => itemMesh[it.kind].setColorAt(i, tmpC.set(it.color)));

  // ---------- plants: weeds and bushes through the asphalt, trees (they grow over the decades) ----------
  const RG = rng(31);
  const bushes = [];
  for (let n = 0; n < 6000 && bushes.length < 1700; n++) {
    const r = 6 + Math.pow(RG(), 0.7) * 150, a = RG() * 6.283, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (insideB(x, z)) continue;
    bushes.push({ x, z, s: 0.35 + Math.pow(RG(), 2) * 1.6, b: Math.pow(RG(), 0.8) * 0.85, yaw: RG() * 6.28, c: RG() });
  }
  const bushMesh = shadowy(new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1).scale(1, 0.7, 1).translate(0, 0.45, 0), plainMat(0xffffff, 0.95, { flatShading: true }), bushes.length));
  bushes.forEach((b, i) => bushMesh.setColorAt(i, tmpC.setHSL(0.24 + b.c * 0.08, 0.45, 0.16 + b.c * 0.1)));
  scene.add(bushMesh);
  const trees = [];
  for (let n = 0; n < 3000 && trees.length < 130; n++) {
    const r = 8 + Math.pow(RG(), 0.8) * 140, a = RG() * 6.283, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (insideB(x, z, 2.5)) continue;
    if (Math.abs(x) < RX - 2 && Math.abs(z) < RZ - 2 && RG() < 0.8) continue;   // (the crossing itself stays mostly open: you still see the stripes)
    trees.push({ x, z, h: 5 + RG() * 7, b: 0.35 + RG() * 0.55, c: RG(), yaw: RG() * 6.28 });
  }
  const trunk = shadowy(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.1, 1, 6).translate(0, 0.5, 0), plainMat(0x4a3a2a, 0.95), trees.length));
  // a clumpy crown: a few lumps of leaves, not one ball
  const crownGeo = mergeGeometries([[0, 0, 0, 1], [0.6, -0.15, 0.2, 0.7], [-0.5, -0.1, -0.35, 0.75], [0.1, 0.45, -0.3, 0.6], [-0.2, -0.2, 0.6, 0.65]].map(([x, y, z, r]) => new THREE.IcosahedronGeometry(r, 1).translate(x, y, z).toNonIndexed()));
  const crown = shadowy(new THREE.InstancedMesh(crownGeo, plainMat(0xffffff, 0.95, { flatShading: true }), trees.length));
  trees.forEach((t, i) => crown.setColorAt(i, tmpC.setHSL(0.25 + t.c * 0.07, 0.5, 0.15 + t.c * 0.08)));
  scene.add(trunk, crown);

  // ---------- lights ----------
  const sun = new THREE.DirectionalLight(0xfff2e0, 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.04;
  Object.assign(sun.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120, near: 10, far: 900 });
  const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x8a7b6a, 1.1);
  scene.add(sun, sun.target, hemi);
  const sd = new THREE.Vector3();

  // ---------- per frame ----------
  S.frame = (v, s, cam) => {
    const tau = s.tau;                       // real seconds since the vanishing (negative before)
    const t = Math.min(v, V_RISE);           // real time on the street (people stand still after V_RISE anyway)
    G.uTime.value = v < V_RISE ? v : V_RISE + (v - V_RISE) * 0.3;
    G.uGreen.value = s.green;
    G.uPower.value = s.power;
    G.uCity.value = s.night * s.power;
    sd.fromArray(s.sun); G.uSunDir.value.copy(sd);
    // light: the Sun (gone at night), the sky; at night the city's own glow
    const up = smooth(-0.04, 0.12, sd.y);
    sun.intensity = 3.2 * up;
    sun.color.setRGB(1.0, lerp(0.62, 0.95, smooth(0.0, 0.35, sd.y)), lerp(0.4, 0.88, smooth(0.0, 0.35, sd.y)));
    sun.position.set(0, 0, 0).addScaledVector(sd, 450); sun.target.position.set(0, 0, 0);
    sun.castShadow = up > 0.01;
    hemi.intensity = lerp(1.1, 0.22, s.night) * lerp(1, 0.75, smooth(0.25, 0.0, sd.y) * (1 - s.night));
    hemi.color.setRGB(lerp(0.74, 0.5, s.night), lerp(0.83, 0.42, s.night), lerp(1.0, 0.5, s.night));
    hemi.groundColor.setRGB(lerp(0.54, 0.35, s.night), lerp(0.48, 0.22, s.night), lerp(0.42, 0.12, s.night));
    screenU.uOn.value = s.power;
    screenU.uNews.value = smooth(V_EVENT + 2.5, V_EVENT + 3.2, v);
    signMat.color.setScalar(s.power * lerp(0.75, 1.2, s.night));
    lampMat.color.setRGB(9 * s.power, 0.6 * s.power, 0.3 * s.power);

    // cars: the driverless ones creep and bump; decades of dust
    carsAlong(Math.max(0, tau), along);
    CARS.forEach((c, i) => {
      const p = carPose(i, along[i]);
      dummy.position.set(p.x, 0, p.z); dummy.rotation.set(0, p.yaw, 0); dummy.scale.set(c.bus ? 1.35 : 1, c.bus ? 1.7 : 1, c.bus ? 2.3 : 1); dummy.updateMatrix();
      fleet.set(i, dummy.matrix, s.night > 0.3 && s.years < 0.02);
      fleet.color(i, tmpC2.copy(carColor[i]).lerp(dust, s.decay * 0.85), c.kind);
    });
    fleet.commit();

    // people: the women until they vanish; the men stop, look around, and leave during the time-lapse
    PEOPLE.forEach((p, i) => {
      const wk = wIdx[i];
      const show = p.woman ? v < V_EVENT : !(v > V_RISE && p.leave < s.leave);
      if (!show) { crowd.pose(i, { x: 0, y: 0, z: 0, visible: false }); if (wk >= 0) { longHair.setMatrixAt(wk, zero); skirt.setMatrixAt(wk, zero); } return; }
      const at = personAt(p, t);
      const y = Math.abs(at.x) > RX && Math.abs(at.z) > RZ ? 0.15 : 0;
      const walk = at.moving ? t * 5.5 * p.speed + p.ph : 0;
      // after: a startled look round, some turn right round, phones up, a few crouch by what was left behind
      const after = p.woman ? 0 : smooth(p.te, p.te + 1.2, t);
      const yaw = at.yaw + p.turn * smooth(p.te + 0.4, p.te + 2.4, t) + Math.sin(t * 0.9 + p.ph) * 0.45 * after;
      const o = { x: at.x, y, z: at.z, yaw, s: p.h, walk, stride: at.moving ? 1 : 0, sit: p.crouch ? 0.55 * smooth(p.te + 1.0, p.te + 2.0, t) : 0,
        armR: p.phone ? 1.0 : (p.callPhone ? 1.0 * smooth(p.te + 1.5, p.te + 2.6, t) : 0), armL: p.umb ? 1.25 : 0, look: p.lookUp ? 0.25 + 0.6 * after : 0.05 };
      crowd.pose(i, o);
      if (wk >= 0) {
        bodyFrame(o);
        if (p.longHair) { e.set(-o.look * 0.55, 0, 0, 'XYZ'); loc.makeTranslation(0, SHOULDER, 0).multiply(m4.makeRotationFromEuler(e)).multiply(new THREE.Matrix4().makeTranslation(0, -SHOULDER, 0)); longHair.setMatrixAt(wk, m4.multiplyMatrices(base, loc)); }
        else longHair.setMatrixAt(wk, zero);
        skirt.setMatrixAt(wk, p.skirt ? base : zero);
      }
    });
    crowd.commit();
    longHair.instanceMatrix.needsUpdate = skirt.instanceMatrix.needsUpdate = true;
    // what they carried: in hand while they walk, then it drops
    ITEMS.forEach((it, i) => {
      const p = PEOPLE[it.who], m = itemMesh[it.kind];
      if (v < V_EVENT) {
        const at = personAt(p, t), fx = Math.sin(at.yaw), fz = Math.cos(at.yaw), rx = -fz, rz = fx;
        const walk = at.moving ? t * 5.5 * p.speed + p.ph : 0, sw = Math.sin(walk) * 0.12 * (at.moving ? 1 : 0);
        if (it.kind === 0) dummy.position.set(at.x + rx * 0.26 * p.h + fx * sw, (0.72 - 0.25) * p.h, at.z + rz * 0.26 * p.h + fz * sw);
        else if (it.kind === 1) dummy.position.set(at.x + fx * 0.3 * p.h + rx * 0.12, 1.22 * p.h, at.z + fz * 0.3 * p.h + rz * 0.12);
        else dummy.position.set(at.x - rx * 0.25, 0.95 * p.h, at.z - rz * 0.25);
        dummy.rotation.set(it.kind === 1 ? -1.1 : 0, at.yaw, it.kind === 2 ? 0.9 : 0);
      } else {
        const a = itemAt(it, tau);
        dummy.position.set(a.x, a.y + (it.kind === 0 ? 0.06 * a.tilt : 0), a.z);
        dummy.rotation.set(it.kind === 0 ? a.tilt * 1.45 * (it.spin > 0 ? 1 : -1) : it.kind === 1 ? -1.1 * (1 - a.tilt) : 0, it.yaw + it.spin * 0.08 * Math.min(tau, 0.5), it.kind === 2 ? 0.9 * (1 - a.tilt) : 0);
      }
      dummy.scale.setScalar(1);
      // decades: covered by the weeds
      if (s.green > 0.55) dummy.scale.setScalar(Math.max(0.0001, 1 - smooth(0.55, 0.8, s.green)));
      dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
    });
    for (const m of itemMesh) m.instanceMatrix.needsUpdate = true;
    // plants
    bushes.forEach((b, i) => {
      const g = smooth(b.b, b.b + 0.2, s.green);
      dummy.position.set(b.x, 0, b.z); dummy.rotation.set(0, b.yaw, 0); dummy.scale.setScalar(Math.max(b.s * g, 0.0001)); dummy.updateMatrix(); bushMesh.setMatrixAt(i, dummy.matrix);
    });
    bushMesh.instanceMatrix.needsUpdate = true;
    trees.forEach((tr, i) => {
      const g = smooth(tr.b, tr.b + 0.35, s.green), h = Math.max(tr.h * g, 0.0001);
      dummy.position.set(tr.x, 0, tr.z); dummy.rotation.set(0, tr.yaw, 0); dummy.scale.set(h * 0.3, h * 0.62, h * 0.3); dummy.updateMatrix(); trunk.setMatrixAt(i, dummy.matrix);
      dummy.position.set(tr.x, h * 0.74, tr.z); dummy.scale.set(h * 0.24, h * 0.22, h * 0.24); dummy.updateMatrix(); crown.setMatrixAt(i, dummy.matrix);
    });
    trunk.instanceMatrix.needsUpdate = crown.instanceMatrix.needsUpdate = true;
  };
  S.sun = sun;
  return S;
}

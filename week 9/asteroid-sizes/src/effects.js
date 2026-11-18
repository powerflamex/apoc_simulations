// The things each asteroid does, as meshes in the world (main.js places and times them per stop):
//   - rock: the skyscraper-size and mountain-size rocks themselves (a lumpy cratered stone, its front white-hot);
//   - body: the Texas-size and Moon-size ones (a sphere at true size and distance: grey cratered stone / the Moon's face
//     with its real maria; the underside glows where it is ramming the air);
//   - ball: the jumbo-jet-size one's airburst (a boiling fireball that cools to dark smoke);
//   - ring: a wall round ground zero that grows outward (dust for the air blast and the crater's debris, fire for the
//     dinosaur killer, torn-up crust and lava for the biggest two);
//   - curtain: the crater's ejecta curtain, an inverted cone of rock and dust rising from the crater's growing edge;
//   - dome: the dinosaur killer's fireball rising over the city;
//   - shards: the terrace's glass panels bursting toward you.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { LU, LIGHT_GLSL } from './looks.js';
import { rng } from './util.js';

const NOISE = /* glsl */ `
  float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
  float puffs(vec3 p) { float s = 0.0, a = 1.0; for (int i = 0; i < 4; i++) { float n = abs(2.0 * n3(p) - 1.0); n = 1.0 - (1.0 - n) * (1.0 - n); s += a * n; p = p * 2.1 + 3.7; a *= 0.45; } return s / 1.7; }
  vec3 ramp(float T) {
    vec3 c = mix(vec3(0.03, 0.02, 0.018), vec3(0.5, 0.06, 0.01), smoothstep(0.08, 0.34, T));
    c = mix(c, vec3(2.0, 0.5, 0.05), smoothstep(0.3, 0.58, T));
    c = mix(c, vec3(3.4, 2.0, 0.55), smoothstep(0.54, 0.8, T));
    return mix(c, vec3(4.4, 4.1, 3.7), smoothstep(0.78, 1.08, T));
  }
`;
const TAIL = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

// ---------- a lumpy cratered rock (unit size) ----------
function rockGeometry(seed) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, 6));
  const R = rng(seed);
  const craters = Array.from({ length: 18 }, () => ({ v: new THREE.Vector3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1).normalize(), r: 0.14 + R() * 0.3, d: 0.05 + R() * 0.07 }));
  const H = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
  const N3 = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const L = (a, b, t) => a + (b - a) * t;
    return L(L(L(H(xi, yi, zi), H(xi + 1, yi, zi), u), L(H(xi, yi + 1, zi), H(xi + 1, yi + 1, zi), u), v),
      L(L(H(xi, yi, zi + 1), H(xi + 1, yi, zi + 1), u), L(H(xi, yi + 1, zi + 1), H(xi + 1, yi + 1, zi + 1), u), v), w);
  };
  const p = g.attributes.position, q = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    q.fromBufferAttribute(p, i).normalize();
    let r = 1 + 0.22 * (N3(q.x * 1.3 + 3, q.y * 1.3, q.z * 1.3) - 0.5) * 2 + 0.08 * (N3(q.x * 4 + 9, q.y * 4, q.z * 4) - 0.5) * 2 + 0.03 * (N3(q.x * 11, q.y * 11 + 5, q.z * 11) - 0.5) * 2;
    for (const c of craters) { const a = q.angleTo(c.v) / c.r; if (a < 1.35) r += a < 1 ? -c.d * (1 - a * a) : c.d * 0.5 * Math.sin((a - 1) / 0.35 * Math.PI); }
    q.multiplyScalar(r); q.x *= 1.15; q.z *= 0.92;
    p.setXYZ(i, q.x, q.y, q.z);
  }
  g.computeVertexNormals();
  return g;
}

export function makeEffects(scene) {
  // ---------- the rock ----------
  const RU = {
    uFront: { value: new THREE.Vector3(0, -1, 0) }, uHot: { value: 0 }, uTime: { value: 0 },
    uSun: LU.uSunDir, uSunC: { value: new THREE.Color(1, 0.95, 0.85) }, uSky: { value: new THREE.Color(0.25, 0.32, 0.45) },
  };
  const rock = new THREE.Mesh(rockGeometry(66066), new THREE.ShaderMaterial({
    uniforms: RU,
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vP; varying vec3 vObj;
      void main() { vObj = position; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform vec3 uFront; uniform float uHot; uniform float uTime; uniform vec3 uSun; uniform vec3 uSunC; uniform vec3 uSky;
      varying vec3 vN; varying vec3 vP; varying vec3 vObj;
      ${NOISE}
      void main() {
        vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vP);
        float facing = dot(N, uFront);
        float m = n3(vObj * 5.0) * 0.55 + n3(vObj * 16.0) * 0.3 + n3(vObj * 40.0) * 0.15;
        vec3 stone = mix(vec3(0.07, 0.06, 0.055), vec3(0.3, 0.26, 0.22), m);
        float ndl = dot(N, uSun);
        vec3 col = stone * (uSunC * smoothstep(-0.05, 0.3, ndl) * (0.4 + 0.6 * max(ndl, 0.0)) * 1.7 + uSky * (0.15 + 0.1 * N.y));
        float rim = pow(1.0 - max(dot(N, V), 0.0), 2.5);
        col += vec3(1.0, 0.45, 0.12) * rim * 0.9 * uHot;
        float boil = n3(vObj * 9.0 + vec3(0.0, uTime * 1.5, 0.0));
        float heat = smoothstep(0.45, 0.95, facing + 0.3 * (boil - 0.5)) * uHot;
        col += vec3(0.9, 0.3, 0.06) * smoothstep(0.1, 0.6, facing) * 0.35 * uHot;
        col = mix(col, mix(vec3(1.0, 0.26, 0.04), vec3(1.9, 1.25, 0.5), smoothstep(0.55, 1.0, heat)), heat * heat);
        float cr = abs(n3(vObj * 5.0 + 4.0) - 0.5) * 2.0;
        col += vec3(1.5, 0.45, 0.08) * (1.0 - smoothstep(0.0, 0.06, cr)) * smoothstep(-0.7, 0.1, facing) * (1.0 - heat) * uHot;
        gl_FragColor = vec4(col, 1.0);
        ${TAIL}
      }`,
  }));
  rock.frustumCulled = false; rock.visible = false;
  scene.add(rock);

  // ---------- the giant bodies (Ceres-size, Moon-size) ----------
  const BU = {
    uMoon: { value: 0 }, uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) }, uToCam: { value: new THREE.Vector3(0, 0, 1) },
    uC: { value: new THREE.Vector3() }, uR: { value: 1 }, uHotH: { value: 0 }, uGlow: { value: 0 }, uCrack: { value: 0 }, uHazeK: { value: 0.3 }, uBelow: { value: 0 },
  };
  const bodyMat = new THREE.ShaderMaterial({
    uniforms: { ...LU, ...BU },
    vertexShader: /* glsl */ `varying vec3 vObj; varying vec3 vW;
      void main() { vObj = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      ${LIGHT_GLSL}
      ${NOISE}
      uniform float uMoon; uniform vec3 uRight; uniform vec3 uUp; uniform vec3 uToCam; uniform vec3 uC; uniform float uR;
      uniform float uHotH; uniform float uGlow; uniform float uCrack; uniform float uHazeK; uniform float uBelow;
      varying vec3 vObj; varying vec3 vW;
      // (ragged edges: the maria's shores wander, with bays and islands)
      float blob(vec2 x, vec2 c, vec2 r) { vec2 d = (x - c) / r; float w = 0.42 * (f21(x * 7.0 + c * 5.0) - 0.5) + 0.2 * (n21(x * 23.0 + c * 3.0) - 0.5); return smoothstep(1.0, 0.62, length(d) + w); }
      vec3 moonAlbedo(vec2 x) {
        float m = blob(x, vec2(-0.32, 0.36), vec2(0.30, 0.25)) + blob(x, vec2(0.17, 0.39), vec2(0.16, 0.14))
          + blob(x, vec2(0.34, 0.11), vec2(0.21, 0.17)) + blob(x, vec2(0.66, 0.30), vec2(0.10, 0.08))
          + blob(x, vec2(0.50, -0.20), vec2(0.13, 0.17)) + blob(x, vec2(0.30, -0.32), vec2(0.10, 0.10))
          + blob(x, vec2(-0.18, -0.30), vec2(0.16, 0.12)) + blob(x, vec2(-0.64, 0.04), vec2(0.24, 0.44))
          + blob(x, vec2(-0.47, -0.37), vec2(0.08, 0.08)) + 0.6 * blob(x, vec2(0.0, 0.06), vec2(0.13, 0.1));
        m = clamp(m, 0.0, 1.0) * (0.78 + 0.3 * f21(x * 12.0 + 4.0));
        vec3 a = mix(vec3(0.9, 0.88, 0.84), vec3(0.4, 0.4, 0.43), clamp(m, 0.0, 1.0));
        a *= 0.9 + 0.2 * f21(x * 40.0);
        vec2 ty = x - vec2(-0.12, -0.72);
        a += vec3(0.25) * exp(-dot(ty, ty) * 900.0) + vec3(0.06) * (0.5 + 0.5 * sin(atan(ty.y, ty.x) * 14.0)) * exp(-length(ty) * 4.0) * (1.0 - m);
        return a;
      }
      // craters at many sizes: bowls with bright rims (a height-ish value and a rim brightness)
      vec2 craters(vec3 p, float sc) {
        vec3 q = p * sc; vec3 i = floor(q); vec3 f = fract(q);
        float best = 1e9, rr = 0.0;
        for (int a = -1; a <= 1; a++) for (int b = -1; b <= 1; b++) for (int c = -1; c <= 1; c++) {
          vec3 o = vec3(float(a), float(b), float(c));
          vec3 cp = o + vec3(h13(i + o), h13(i + o + 17.0), h13(i + o + 31.0));
          float r = 0.25 + 0.35 * h13(i + o + 7.0);
          float d = length(f - cp) / r;
          if (d < best) { best = d; rr = r; }
        }
        float bowl = 1.0 - smoothstep(0.0, 1.0, best);
        float rim = smoothstep(0.75, 0.98, best) * (1.0 - smoothstep(0.98, 1.25, best));
        return vec2(bowl, rim);
      }
      void main() {
        vec3 n = normalize(vObj);
        // where on its face: the side toward you (x right, y up)
        vec2 x = vec2(dot(n, uRight), dot(n, uUp));
        float facing = dot(n, uToCam);
        vec3 alb;
        if (uMoon > 0.5) alb = moonAlbedo(x * (0.6 + 0.4 * facing));
        else {
          float m = fbm3(n * 3.0) * 0.6 + fbm3(n * 11.0) * 0.4;
          alb = mix(vec3(0.2, 0.19, 0.18), vec3(0.4, 0.38, 0.35), m);
          alb += vec3(0.8) * smoothstep(0.82, 0.9, fbm3(n * 7.0 + 3.0)) * 0.4;      // bright salt spots
        }
        vec2 c1 = craters(n, 9.0), c2 = craters(n, 31.0), c3 = craters(n, 95.0);
        // finer craters and rubble for when it is right overhead (faded in with closeness)
        float near = smoothstep(0.6, 0.98, facing) * smoothstep(0.85, 0.999, uR / max(length(uC - cameraPosition), 1.0));
        vec2 c4 = craters(n, 330.0), c5 = craters(n, 1100.0), c6 = craters(n, 3600.0);
        float fine = (-0.35 * c4.x + 0.3 * c4.y - 0.3 * c5.x + 0.25 * c5.y - 0.25 * c6.x + 0.2 * c6.y) + 0.35 * (n3(n * 9000.0) - 0.5) + 0.25 * (n3(n * 27000.0) - 0.5);
        float ck = uMoon > 0.5 ? 0.22 : 1.0;
        float shade = 1.0 - ck * (0.45 * c1.x + 0.35 * c2.x + 0.2 * c3.x) + ck * (0.4 * c1.y + 0.3 * c2.y + 0.15 * c3.y);
        alb *= shade * (1.0 + fine * near);
        // lit by the Sun behind you (full face), a little darker toward its edge
        float ndl = max(dot(n, uSunDir), 0.0);
        vec3 col = alb * (uSunC * 0.8 * (0.25 + 0.75 * pow(ndl, 0.6)) + uSkyC * 0.08);
        // the air it is ramming: where its surface is low in the air it glows white-orange
        float alt = length(vW - vec3(0.0, -6371000.0, 0.0)) - 6371000.0;
        // lit from below by the fires (its underside never sees the Sun)
        float lowEl = 1.0 - smoothstep(0.02, 0.3, normalize(vW - cameraPosition).y);
        col += alb * vec3(1.0, 0.4, 0.13) * max(-n.y, 0.0) * uBelow * (0.12 + 0.88 * lowEl);
        float hot = (1.0 - smoothstep(150.0, uHotH, alt)) * uGlow;
        float boil = mix(fbm3(n * 60.0 + uTime * 0.6), fbm3(n * 7000.0 + uTime * 0.6), near);
        col = mix(col, ramp(0.58 + 0.2 * hot + 0.15 * (boil - 0.5)) * 0.42, clamp(hot * 0.35 * smoothstep(0.35, 0.65, boil), 0.0, 1.0));
        // cracks glowing as it starts to break up
        // (seen from far: long cracks across its face; right overhead: a web of small ones)
        float cr = mix(min(abs(n3(n * 40.0 + 5.0) - 0.5), abs(n3(n * 110.0 + 9.0) - 0.5) * 1.4), min(abs(n3(n * 2400.0 + 5.0) - 0.5), abs(n3(n * 7000.0 + 9.0) - 0.5) * 1.4), near) * 2.0;
        col += vec3(2.2, 0.7, 0.15) * (1.0 - smoothstep(0.0, 0.04, cr)) * uCrack;
        // the sky's haze in front of it
        float d = length(vW - cameraPosition);
        col = mix(col, uHazeC * 0.95, uHazeK * (1.0 - exp(-d / 60000.0)) + uHazeK * 0.35);
        gl_FragColor = vec4(col, 1.0);
        ${TAIL}
      }`,
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 320, 160), bodyMat);
  body.frustumCulled = false; body.visible = false;
  scene.add(body);

  // ---------- clouds of dust, fire and torn crust: one material per thing ----------
  const cloudMat = (mode, extra = {}) => new THREE.ShaderMaterial({
    uniforms: { ...LU, uMode: { value: mode }, uHeat: { value: 0 }, uA: { value: 1 }, uLump: { value: 1 }, uTop: { value: 1 }, uSeed: { value: mode * 3.1 }, ...extra },
    transparent: true, depthWrite: false, side: THREE.FrontSide,
    vertexShader: /* glsl */ `
      ${NOISE}
      uniform float uTime; uniform float uLump; uniform float uSeed;
      varying vec3 vW; varying vec2 vUv; varying vec3 vN; varying vec3 vObj;
      void main() {
        vUv = uv; vObj = position;
        vec4 w0 = modelMatrix * vec4(position, 1.0);
        vec3 nw = normalize(mat3(modelMatrix) * normal);
        // billowing lumps (in world metres)
        float n = puffs(w0.xyz * 0.004 * uLump + vec3(uSeed, -uTime * 0.25, uSeed));
        vec4 w = w0 + vec4(nw * (n - 0.45) * 90.0 / uLump, 0.0);
        vW = w.xyz; vN = nw;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${LIGHT_GLSL}
      ${NOISE}
      uniform float uMode; uniform float uHeat; uniform float uA; uniform float uLump; uniform float uTop; uniform float uSeed;
      varying vec3 vW; varying vec2 vUv; varying vec3 vN; varying vec3 vObj;
      void main() {
        vec3 P = vW * 0.004 * uLump + vec3(uSeed, -uTime * 0.25, uSeed);
        float pf = puffs(P), m = fbm3(P * 2.5 + 3.0);
        float H = min(uHeat, 0.82);
        vec3 N = normalize(vN + 0.8 * vec3(m - 0.5, pf - 0.5, n3(P * 3.0) - 0.5));
        float y = vUv.y;
        // a ragged top that thins out
        float top = 1.0 - smoothstep(uTop * (0.62 + 0.38 * pf) - 0.12, uTop * (0.62 + 0.38 * pf), y);
        // (soft where you see it edge-on, so its outline is ragged, not a straight line)
        float edge = smoothstep(0.05, 0.4, abs(dot(normalize(vN), normalize(cameraPosition - vW))));
        float a = top * uA * (0.85 + 0.15 * m) * mix(0.35 + 0.65 * pf, 1.0, edge);
        vec3 c;
        if (uMode < 0.5) {
          // dust: lit by the Sun, brown-grey, darker in the creases
          vec3 alb = uDustC * (0.55 + 0.6 * pf);
          c = lit(alb, N, 0.8);
        } else if (uMode < 1.5) {
          // fire: white-yellow low down and at the front, black smoke above
          float T = min(H, 0.76) * (0.95 - 0.55 * y) + 0.6 * (pf - 0.45) + 0.35 * (m - 0.5);
          c = ramp(clamp(T, 0.0, 0.84)) * 0.42;
          c = mix(c, lit(vec3(0.05, 0.04, 0.035), N, 0.6) + vec3(0.06, 0.015, 0.0) * H, smoothstep(0.52, 0.3, T));
        } else {
          // torn crust: dark slabs of rock, glowing cracks, a burning crest, dust
          float slab = abs(n3(P * 6.0) - 0.5) * 2.0;
          vec3 rockC = lit(vec3(0.16, 0.13, 0.11) * (0.6 + 0.6 * m), N, 0.8);
          float lava = (1.0 - smoothstep(0.0, 0.1, slab)) * (0.6 + 0.4 * uHeat);
          c = rockC + vec3(3.2, 0.9, 0.12) * lava * (0.5 + 0.5 * pf);
          float T = uHeat * smoothstep(0.45, 1.0, y) * (0.8 + 0.4 * pf);
          c = mix(c, ramp(0.55 + 0.4 * T) * 0.42, smoothstep(0.55, 0.95, y) * 0.8);
        }
        c = haze(c, length(vW - cameraPosition), vW.y);
        gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));
        ${TAIL}
      }`,
  });

  // ring: an open cylinder, radius 1, height 1 (base at y = 0)
  const ringGeo = new THREE.CylinderGeometry(1, 1, 1, 720, 28, true).translate(0, 0.5, 0);
  const ring = new THREE.Mesh(ringGeo, cloudMat(0));
  ring.frustumCulled = false; ring.visible = false; ring.renderOrder = 4;
  scene.add(ring);
  // a second, taller and softer bank of dust behind the front
  const ring2 = new THREE.Mesh(ringGeo, cloudMat(0));
  ring2.material.uniforms.uSeed.value = 7.7;
  ring2.frustumCulled = false; ring2.visible = false; ring2.renderOrder = 3;
  scene.add(ring2);
  // the crater's curtain: a cone opening upward (bottom radius 1 at y = 0, top radius 2 at y = 1)
  const curtGeo = new THREE.CylinderGeometry(2, 1, 1, 540, 24, true).translate(0, 0.5, 0);
  const curtain = new THREE.Mesh(curtGeo, cloudMat(0, {}));
  curtain.material.uniforms.uSeed.value = 3.3;
  curtain.frustumCulled = false; curtain.visible = false; curtain.renderOrder = 4;
  scene.add(curtain);
  // the fireball over the city (jumbo jet) and the dinosaur killer's dome (a hemisphere)
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), cloudMat(1));
  ball.frustumCulled = false; ball.visible = false; ball.renderOrder = 5;
  scene.add(ball);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 220, 80, 0, Math.PI * 2, 0, Math.PI / 2), cloudMat(1));
  dome.frustumCulled = false; dome.visible = false; dome.renderOrder = 5;
  scene.add(dome);

  // ---------- the terrace's glass bursting toward you ----------
  const NSH = 700;
  const shards = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.09, 0.06), new THREE.MeshStandardMaterial({ color: 0xdff0f5, roughness: 0.05, metalness: 0.6, emissive: 0x8899aa, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }), NSH);
  shards.frustumCulled = false; shards.count = 0;
  scene.add(shards);

  return { rock, RU, body, BU, ring, ring2, curtain, ball, dome, shards, NSH };
}

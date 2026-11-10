// Earth comes apart under the city. The ground is cut into plates (Voronoi cells of SEEDS; the first edge runs right
// down the middle of the promenade, so the boulevard tears in two). Every plate is a slab of rock, the street on top.
// Once the stretch beats Earth's own gravity, everything moves away from everything else, the way the universe
// expands: each plate drifts away from yours at a speed that grows with its distance, faster and faster (a Hubble
// flow, a(t) ~ t^2), tilting as it goes; the hot rock below opens up into a glowing abyss.
import * as THREE from 'three';
import { groundMaterial, GU, MAXSEEDS } from './ground.js';
import { rng, smooth } from './util.js';

// ---- the plates ----
export const SEEDS = [];
{
  const R = rng(9090);
  for (let z = 150, k = 0; z > -1500; z -= 120 + R() * 50, k++) {
    SEEDS.push([-(42 + R() * 30), z + (R() - 0.5) * 60]);
    SEEDS.push([42 + R() * 30, z - 40 + (R() - 0.5) * 60]);
  }
  for (let z = 300; z > -1700; z -= 260 + R() * 80) for (const s of [-1, 1]) SEEDS.push([s * (230 + R() * 120), z + (R() - 0.5) * 100]);
  while (SEEDS.length < MAXSEEDS) {
    const a = R() * Math.PI * 2, r = 1200 + R() * 3500;
    SEEDS.push([Math.cos(a) * r, -600 + Math.sin(a) * r]);
  }
  SEEDS.length = MAXSEEDS;
}
const REGION = [-7000, -9000, 7000, 5000];      // x0, z0, x1, z1
export const nearestSeed = (x, z) => {
  let best = 0, bd = 1e18;
  for (let i = 0; i < SEEDS.length; i++) { const d = (x - SEEDS[i][0]) ** 2 + (z - SEEDS[i][1]) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
};
// clip a polygon (list of [x, z]) to the half-plane closer to seed a than to seed b
function clip(poly, a, b) {
  const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, nx = b[0] - a[0], nz = b[1] - a[1];
  const side = (p) => (p[0] - mx) * nx + (p[1] - mz) * nz;   // < 0: a's side
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], sp = side(p), sq = side(q);
    if (sp <= 0) out.push(p);
    if ((sp < 0) !== (sq < 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  }
  return out;
}
export const CELLS = SEEDS.map((s, i) => {
  let poly = [[REGION[0], REGION[1]], [REGION[2], REGION[1]], [REGION[2], REGION[3]], [REGION[0], REGION[3]]];
  for (let j = 0; j < SEEDS.length; j++) if (j !== i) poly = clip(poly, s, SEEDS[j]);
  let cx = 0, cz = 0;
  for (const p of poly) { cx += p[0]; cz += p[1]; }
  return { poly, cx: cx / poly.length, cz: cz / poly.length };
});
export const REF = nearestSeed(0.4, 0);          // your plate (the camera's): it stays put, everything else moves away

// how far apart things have spread: the Hubble-like scale factor, seconds after the split
export const spread = (ts) => (ts <= 0 ? 0 : 0.0009 * ts * ts + 0.004 * ts);
const plateM = SEEDS.map(() => new THREE.Matrix4());
const q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3();
const pivot = new THREE.Matrix4(), back = new THREE.Matrix4();
export function platesAt(ts) {
  const a = spread(ts);
  const R = rng(31);
  const ref = CELLS[REF];
  for (let i = 0; i < CELLS.length; i++) {
    const c = CELLS[i];
    const r1 = R(), r2 = R(), r3 = R();
    if (a <= 0) { plateM[i].identity(); continue; }
    const dx = c.cx - ref.cx, dz = c.cz - ref.cz;
    const dist = Math.hypot(dx, dz);
    // the far plates also sink away (the planet's curve), the near ones lurch up or down a little
    const dy = -dist * 0.12 * a - (r3 - 0.4) * 30 * a;
    pos.set(dx * a, dy, dz * a);
    // tilt about the plate's own centre, more as it goes
    const tilt = (i === REF ? 0.25 : 1) * Math.min(1, a * 1.6);
    e.set((r1 - 0.5) * 0.5 * tilt, (r3 - 0.5) * 0.3 * tilt, (r2 - 0.5) * 0.5 * tilt);
    q.setFromEuler(e);
    // T(pos) * T(c) * R * T(-c): the plate turns about a point 20 m under its centre
    back.makeTranslation(-c.cx, 20, -c.cz);
    plateM[i].makeTranslation(pos.x + c.cx, pos.y - 20, pos.z + c.cz).multiply(pivot.makeRotationFromQuaternion(q)).multiply(back);
  }
  return plateM;
}

// ---- the meshes ----
export function makePlates(scene) {
  const top = groundMaterial();
  const rock = new THREE.ShaderMaterial({
    uniforms: { uHeat: { value: 0 }, uTime: GU.uTime },
    vertexShader: /* glsl */ `varying vec3 vP; varying vec3 vN; void main(){ vP = position; vN = normal;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uHeat; uniform float uTime; varying vec3 vP; varying vec3 vN;
      float h(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i), h(i+vec3(1,0,0)), f.x), mix(h(i+vec3(0,1,0)), h(i+vec3(1,1,0)), f.x), f.y),
                   mix(mix(h(i+vec3(0,0,1)), h(i+vec3(1,0,1)), f.x), mix(h(i+vec3(0,1,1)), h(i+vec3(1,1,1)), f.x), f.y), f.z); }
      float ridge(vec3 p){ return pow(1.0 - abs(2.0 * n3(p) - 1.0), 10.0); }
      void main(){
        float d = -vP.y;                                     // depth below the street
        float n = n3(vP * 0.25) * 0.6 + n3(vP * 1.3) * 0.4;
        // soil and fill under the paving, then grey rock in layers
        vec3 rockC = mix(vec3(0.05, 0.045, 0.04), vec3(0.11, 0.1, 0.09), n3(vec3(vP.x * 0.02, vP.y * 0.7, vP.z * 0.02)));
        vec3 c = mix(vec3(0.09, 0.06, 0.04), rockC, smoothstep(1.5, 4.0, d)) * (0.6 + 0.6 * n);
        // deeper down it is hot: a dull red glow growing toward the bottom, and bright cracks of molten rock
        float hot = smoothstep(18.0, 60.0, d + (n - 0.5) * 16.0);
        float vein = ridge(vP * vec3(0.09, 0.16, 0.09) + vec3(0.0, uTime * 0.01, 0.0)) * smoothstep(6.0, 30.0, d);
        vec3 glow = vec3(0.5, 0.06, 0.01) * hot * (0.5 + 0.8 * n) + vec3(2.4, 0.8, 0.15) * vein * 0.8 + vec3(1.6, 0.45, 0.08) * pow(hot, 3.0) * 0.6;
        gl_FragColor = vec4(c * (0.4 + 0.6 * (1.0 - uHeat * 0.3)) + glow * uHeat, 1.0);
      }`,
  });
  const meshes = CELLS.map((c, i) => {
    const sh = new THREE.Shape(c.poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    const depth = 60;
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 1 });
    // shape in (x, -z) -> rotate so the shape's plane is the ground (y = 0 on top) and depth goes down
    g.rotateX(-Math.PI / 2);          // (x, y=-z, zDepth) -> (x, zDepth, z)...; the top cap ends up at y = depth
    g.translate(0, -depth, 0);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, [top, rock]);
    m.matrixAutoUpdate = false;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  });
  // the hot rock under the crust: a glowing floor far below that churns, and chunks of mantle rock
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: { uHeat: rock.uniforms.uHeat, uTime: GU.uTime },
    vertexShader: `varying vec3 vP; void main(){ vP = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uHeat; uniform float uTime; varying vec3 vP;
      float h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * n2(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
      void main(){
        vec2 p = vP.xz * 0.003;
        float n = fbm(p + vec2(uTime * 0.004, -uTime * 0.005));
        float f = pow(1.0 - abs(2.0 * fbm(p * 3.0 + 7.0 + uTime * 0.006) - 1.0), 12.0);
        vec3 c = vec3(0.16, 0.02, 0.005) * (0.4 + n) + vec3(2.2, 0.7, 0.12) * f * 0.7 + vec3(0.8, 0.18, 0.03) * smoothstep(0.55, 0.8, n) * 0.5;
        float far = exp(-length(vP.xz - cameraPosition.xz) * 0.00035);
        gl_FragColor = vec4(c * uHeat * (0.3 + 0.7 * far), 1.0);
      }`,
  }));
  floor.position.y = -400;
  scene.add(floor);
  return {
    meshes, rock, floor, top,
    frame(ts, heat) {
      const M = platesAt(ts);
      meshes.forEach((m, i) => { m.matrix.copy(M[i]); m.matrixWorldNeedsUpdate = true; });
      rock.uniforms.uHeat.value = heat;
      floor.visible = heat > 0.001;
      floor.position.y = -260 - 2600 * spread(ts);
      floor.updateMatrixWorld();
      return M;
    },
  };
}

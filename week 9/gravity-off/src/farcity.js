// The city round the square as seen from far above (the 10 MINUTES stop, 0.75-4 km up; also the 1 MINUTE stop's edges):
// a ground pattern from 200 m out (a street grid, blocks cut into lots with roofs of every colour, parks, avenues;
// suburbs further out, then fields and woods) and instanced buildings from 650 m out to 6 km, a downtown of towers to
// the north. No rivers in view (their water would be floating up with you). It only has to read from above.
import * as THREE from 'three';
import { rng } from './util.js';

export const CITY_GLSL = /* glsl */ `
  float cH(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float cN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(cH(i), cH(i + vec2(1, 0)), f.x), mix(cH(i + vec2(0, 1)), cH(i + vec2(1, 1)), f.x), f.y); }
  // the city's colour at ground point P (metres), aw = the pixel's footprint
  vec3 cityAt(vec2 P, float aw) {
    float r = length(P);
    // blocks: 96 x 64 m with 14 m streets; every 6th street an avenue (26 m)
    vec2 B = vec2(110.0, 78.0);
    vec2 g = P / B, id = floor(g), f = fract(g) * B;
    float av = mod(id.x, 6.0) < 0.5 ? 12.0 : 7.0, avz = mod(id.y, 5.0) < 0.5 ? 12.0 : 7.0;
    vec2 e = min(f, B - f);
    float street = 1.0 - smoothstep(0.0, aw * 1.5 + 0.5, min(e.x - av, e.y - avz));
    float hb = cH(id + 3.1);
    float sub = smoothstep(7000.0, 14000.0, r + 1500.0 * (cN(P / 3000.0) - 0.5));
    float farm = smoothstep(16000.0, 26000.0, r + 4000.0 * (cN(P / 5000.0) - 0.5));
    // lots: 2 x 4 (city) or 3 x 6 (suburbs: houses with yards)
    vec2 nl = mix(vec2(2.0, 4.0), vec2(3.0, 7.0), sub);
    vec2 lg = (f - vec2(av, avz)) / (B - 2.0 * vec2(av, avz)) * nl;
    vec2 lid = floor(lg), lf = fract(lg);
    float hl = cH(id * 7.0 + lid + 0.5);
    vec3 roofs[6];
    roofs[0] = vec3(0.55, 0.54, 0.52); roofs[1] = vec3(0.38, 0.37, 0.37); roofs[2] = vec3(0.62, 0.55, 0.45);
    roofs[3] = vec3(0.45, 0.33, 0.27); roofs[4] = vec3(0.7, 0.7, 0.68); roofs[5] = vec3(0.3, 0.31, 0.33);
    vec3 roof = roofs[int(floor(hl * 5.99))] * (0.85 + 0.3 * cH(lid + id));
    // parapet / gaps between lots, rooftop boxes
    float edge = smoothstep(0.0, 0.08 + aw * 0.02, min(min(lf.x, 1.0 - lf.x), min(lf.y, 1.0 - lf.y)));
    roof *= 0.75 + 0.25 * edge;
    roof = mix(roof, vec3(0.75, 0.75, 0.73), step(0.93, cN(lg * 6.0 + hl * 9.0)) * 0.6);
    // suburbs: a small roof in a green yard
    vec3 yard = vec3(0.26, 0.33, 0.18) * (0.8 + 0.4 * cN(P / 7.0));
    float house = step(abs(lf.x - 0.5), 0.28) * step(abs(lf.y - 0.45), 0.3);
    vec3 lot = mix(roof, mix(yard, roof * 0.9, house), sub);
    // parks: some blocks are trees and grass (autumn)
    float park = step(hb, 0.06 + 0.05 * sub);
    vec3 trees = mix(vec3(0.3, 0.3, 0.14), vec3(0.62, 0.4, 0.14), cN(P / 9.0)) * (0.6 + 0.5 * cN(P / 3.0));
    lot = mix(lot, trees, park);
    vec3 asphalt = vec3(0.2, 0.2, 0.21) * (0.9 + 0.2 * cN(P / 40.0));
    vec3 c = mix(lot, asphalt, street);
    // far away: fields and woods
    vec3 land = mix(vec3(0.42, 0.38, 0.26), vec3(0.24, 0.26, 0.15), cN(P / 900.0)) * (0.8 + 0.4 * cN(P / 260.0));
    land = mix(land, vec3(0.5, 0.36, 0.2), step(0.7, cN(P / 1500.0 + 7.0)) * 0.6);
    c = mix(c, land, farm);
    // too small to see: the average
    vec3 avg = mix(mix(vec3(0.43, 0.42, 0.4), vec3(0.34, 0.36, 0.27), sub), land, farm);
    return mix(c, avg, smoothstep(6.0, 22.0, aw));
  }`;

export function makeFarCity(scene) {
  const R = rng(1717);
  const boxes = [];
  const B = [110, 78];
  for (let ix = -55; ix <= 55; ix++) for (let iz = -78; iz <= 78; iz++) {
    const cx = (ix + 0.5) * B[0], cz = (iz + 0.5) * B[1], r = Math.hypot(cx, cz);
    if (r < 650 || r > 6200) continue;
    const hb = ((Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453) % 1 + 1) % 1;
    if (hb < 0.08) continue;                     // a park
    const down = Math.exp(-((cx - 300) ** 2 + (cz + 1700) ** 2) / (2 * 700 * 700));   // downtown, north of the square
    const n = 2 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) {
      const w = 22 + R() * 30, d = 18 + R() * 22;
      const x = cx + (R() - 0.5) * (B[0] - 14 - w), z = cz + (R() - 0.5) * (B[1] - 14 - d);
      const h = 9 + R() * 26 + (R() < 0.08 ? 40 * R() : 0) + down * (60 + 260 * R() * R());
      boxes.push([x, z, w, d, h]);
    }
  }
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  const mesh = new THREE.InstancedMesh(geo, mat, boxes.length);
  const m4 = new THREE.Matrix4(), c = new THREE.Color();
  const COLS = [0xb8ab98, 0x9a8a7a, 0xd2cbbe, 0x7d6656, 0x8f9aa8, 0x6f7f92, 0xc9b79a, 0x5f6a78];
  boxes.forEach(([x, z, w, d, h], i) => {
    mesh.setMatrixAt(i, m4.makeScale(w, h, d).setPosition(x, 0, z));
    mesh.setColorAt(i, c.setHex(COLS[Math.floor(R() * COLS.length)]).multiplyScalar(0.8 + 0.3 * R()));
  });
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { mesh, count: boxes.length };
}

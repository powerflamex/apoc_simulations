// The Champs-Élysées: the street (asphalt, lanes, the crosswalk, the island, granite sidewalks), the Haussmann
// blocks (cream stone, tall windows, iron balconies on the 2nd and 5th floors, lit shops, zinc mansard roofs with
// dormers), the clipped chestnut trees, the lamps, the Arc de Triomphe, the Étoile and La Défense far behind it.
// Every material goes through wallify() (wall.js), so the bubble's wall cuts everything the same way.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { wallify } from './wall.js';
import { B, TREES, LAMPS, ROAD, WALK, ARC_Z, groundY } from './paris.js';

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), e3 = new THREE.Euler();

// ---------- the street ----------
const GROUND = /* glsl */ `
{
  float x = wp.x, z = wp.z, ax = abs(x);
  float n = wNoise(wp * vec3(3.0, 1.0, 3.0)) * 0.5 + wNoise(wp * 0.4) * 0.5;
  vec3 c;
  if (ax < ${ROAD.toFixed(2)}) {
    c = vec3(0.13, 0.125, 0.12) * (0.8 + 0.4 * n);
    // lane lines (dashed), the crosswalk's stripes
    float dash = step(fract(z / 12.0), 0.3);
    for (int i = 1; i <= 3; i++) { float lx = 1.6 + 3.0 * float(i); c = mix(c, vec3(0.75), smoothstep(0.09, 0.06, abs(ax - lx)) * dash * step(abs(z), 1e4)); }
    c = mix(c, vec3(0.78), smoothstep(0.08, 0.05, abs(ax - 1.6)) * step(7.5, abs(z + 1.5)));
    float cw = step(abs(z + 1.0), 3.0) * step(0.5, fract(x / 1.1)) * step(1.7, ax);
    c = mix(c, vec3(0.8, 0.79, 0.76) * (0.85 + 0.2 * n), cw);
  } else if (ax < ${(ROAD + 0.35).toFixed(2)}) {
    c = vec3(0.5, 0.48, 0.45);   // the granite kerb
  } else {
    // pale paving in big slabs, with joints
    vec2 g = fract(vec2(x / 1.2, z / 0.8));
    float joint = smoothstep(0.03, 0.0, min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y)) * 1.2);
    c = vec3(0.58, 0.55, 0.5) * (0.85 + 0.25 * n) * (1.0 - 0.25 * joint);
    // the Étoile round the Arc: cobbles
    float dA = length(vec2(x, z - (${ARC_Z.toFixed(1)})));
    if (dA < 170.0 && ax < 170.0 && z < -850.0) c = vec3(0.32, 0.3, 0.28) * (0.8 + 0.4 * n);
  }
  // the roads beyond the avenue (side streets, the Étoile's ring)
  if (ax > ${WALK.toFixed(1)} + 1.0) c = vec3(0.16, 0.155, 0.15) * (0.8 + 0.4 * n);
  diffuseColor.rgb = c;
}`;

// ---------- the buildings: one instanced box each ----------
const FACADE = /* glsl */ `
{
  bool sx = abs(vON.x) > 0.5;
  float W = sx ? vSc.z : vSc.x;
  float u = ((sx ? vLoc.z : vLoc.x) + 0.5) * W;
  float y = vLoc.y * vSc.y - 1.5;
  float seed = vB.x, kind = vB.w;
  vec3 V = normalize(wp - cameraPosition);
  vec3 nW = normalize(vWN);
  float fres = pow(1.0 - abs(dot(V, nW)), 3.0);
  vec3 sky = mix(vec3(1.05, 0.62, 0.35), vec3(0.45, 0.48, 0.62), clamp(reflect(V, nW).y * 3.0, 0.0, 1.0));
  vec3 col; vec3 em = vec3(0.0);
  vec2 fw = vec2(max(fwidth(u), 1e-4), max(fwidth(y), 1e-4));
  float far = smoothstep(0.12, 0.4, max(fw.x, fw.y));
  if (abs(vON.y) > 0.5) {
    col = vec3(0.22, 0.22, 0.24);
  } else if (kind > 0.5) {
    // La Défense: glass towers, a few lit floors
    float fy = fract(y / 4.0), fx = fract(u / 1.6);
    float lit = step(wHash(vec3(floor(y / 4.0), floor(u / 9.0), seed * 50.0)), 0.25);
    col = mix(vec3(0.16, 0.18, 0.22), sky * 0.5, 0.6 + 0.4 * fres);
    em = vec3(1.0, 0.85, 0.6) * lit * 0.35 * step(0.15, fy);
  } else {
    float top = vB.y;
    float stone = 0.9 + 0.12 * wHash(vec3(seed * 91.0, 1.0, 2.0));
    vec3 st = vec3(0.86, 0.79, 0.66) * stone;
    col = st * (0.94 + 0.08 * wNoise(wp * 2.0));
    float nb = max(1.0, floor(W / 3.1 + 0.5)), bw = W / nb;
    float fu = fract(u / bw), iu = floor(u / bw);
    float win = 0.0, glass = 0.0, lit = 0.0, rail = 0.0;
    if (y < 5.4) {
      // shopfronts: tall lit glass between stone piers, a dark band for the signs
      float pane = step(0.06, fu) * step(fu, 0.94) * step(0.25, y) * step(y, 4.3);
      float sign = step(4.45, y) * step(y, 5.25) * step(0.04, fu) * step(fu, 0.96);
      col = mix(col * 0.92, vec3(0.05), pane);
      float hue = wHash(vec3(iu, seed * 7.0, 3.0));
      vec3 shop = mix(vec3(1.0, 0.82, 0.6), vec3(0.95, 0.97, 1.0), step(0.6, hue));
      em += shop * pane * (0.8 + 0.5 * wHash(vec3(iu, floor(y * 2.0), seed))) * 1.1;
      col = mix(col, vec3(0.06, 0.055, 0.05), sign);
      em += mix(vec3(1.0, 0.9, 0.7), vec3(1.0, 0.75, 0.4), hue) * sign * step(0.35, fract(u * 0.9 + hue)) * step(fract(u * 0.9 + hue), 0.65) * 0.9;
      col *= 1.0 - 0.15 * step(fract(y / 0.55), 0.06);   // rusticated joints
    } else if (y < top - 0.9) {
      float fy, h0, h1;
      if (y < 8.4) { fy = (y - 5.4) / 3.0; h0 = 0.18; h1 = 0.82; }
      else { fy = fract((y - 8.4) / 3.25); h0 = 0.1; h1 = 0.86; }
      float fl = y < 8.4 ? 1.0 : 2.0 + floor((y - 8.4) / 3.25);
      win = step(0.3, fu) * step(fu, 0.7) * step(h0, fy) * step(fy, h1);
      float surround = step(0.25, fu) * step(fu, 0.75) * step(h0 - 0.05, fy) * step(fy, h1 + 0.07) * (1.0 - win);
      col = mix(col, st * 1.08, surround);
      float r = wHash(vec3(iu, fl, seed * 13.0));
      lit = step(r, vB.z) * win;
      vec3 g = mix(vec3(0.05, 0.06, 0.08), sky * 0.7, 0.35 + 0.65 * fres);
      col = mix(col, g, win * (1.0 - far));
      em += vec3(1.0, 0.72, 0.42) * lit * (0.5 + 0.6 * wHash(vec3(iu, fl, 7.0))) * (1.0 - far);
      // the continuous iron balconies on the 2nd and 5th floors
      float b2 = step(8.45, y) * step(y, 9.45), b5 = step(18.2, y) * step(y, 19.2);
      rail = max(b2, b5) * (step(0.6, fract(u * 6.0)) + step(0.85, fract((y - 8.45) / 1.0)) + step(0.85, fract((y - 18.2) / 1.0)));
      col = mix(col, vec3(0.04, 0.04, 0.045), clamp(rail, 0.0, 1.0) * (1.0 - far) * max(b2, b5));
      col = mix(col, st * 0.65, max(b2, b5) * far * 0.6);
      col *= 1.0 - 0.25 * smoothstep(0.1, 0.0, abs(y - 8.4)) - 0.2 * smoothstep(0.08, 0.0, abs(y - 18.1));
      col = mix(col, mix(st * 0.85, g * 0.6 + vec3(0.25, 0.18, 0.12) * vB.z, 0.4), far * 0.5);
      em += vec3(1.0, 0.72, 0.42) * vB.z * 0.12 * far;
    } else {
      // the cornice: a projecting band with its shadow
      col = st * mix(1.1, 0.7, smoothstep(top - 0.3, top - 0.8, y));
    }
  }
  diffuseColor.rgb = col;
  vEm = em;
}`;

function facadeMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aB; varying vec3 vLoc; varying vec3 vSc; varying vec3 vON; varying vec4 vB; varying vec3 vWN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLoc = position; vON = normal; vB = aB;
        vSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vWN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * (normal / (vSc * vSc)));`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLoc; varying vec3 vSc; varying vec3 vON; varying vec4 vB; varying vec3 vWN; vec3 vEm;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEm;');
  };
  m.customProgramCacheKey = () => 'facade-paris';
  return wallify(m, { color: FACADE, key: 'facade' });
}

// the mansard roofs: a steep zinc slope with dormer windows (a prism along each block)
const ROOFC = /* glsl */ `
{
  float slope = 1.0 - abs(vRN.y);
  float u = vRU;
  float y = vRY;
  vec3 c = vec3(0.36, 0.4, 0.46) * (0.9 + 0.15 * wNoise(wp * 1.5));
  float fu = fract(u / 3.1);
  float dorm = step(0.32, fu) * step(fu, 0.68) * step(0.15, y) * step(y, 0.55) * step(0.25, slope);
  float frame = step(0.27, fu) * step(fu, 0.73) * step(0.1, y) * step(y, 0.62) * step(0.25, slope) * (1.0 - dorm);
  c = mix(c, vec3(0.82, 0.78, 0.7), frame);
  c = mix(c, vec3(0.05, 0.05, 0.07), dorm);
  vEm2 = vec3(1.0, 0.75, 0.45) * dorm * step(wHash(vec3(floor(u / 3.1), vRS * 77.0, 5.0)), 0.25) * 0.7;
  c *= 1.0 - 0.35 * step(0.92, y);
  diffuseColor.rgb = c;
}`;
function roofGeometry() {
  // cross-section (across the block, x: -0.5..0.5; y: 0..1): steep lower slope, flat top
  const sh = new THREE.Shape([[-0.5, 0], [0.5, 0], [0.42, 0.85], [0.3, 1.0], [-0.3, 1.0], [-0.42, 0.85]].map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  return g;
}
function roofMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.2 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRS; varying vec3 vRN; varying float vRU; varying float vRY; varying float vRS;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRN = normal; vRY = position.y; vRS = aRS;
        vRU = (position.z + 0.5) * length(instanceMatrix[2].xyz);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRN; varying float vRU; varying float vRY; varying float vRS; vec3 vEm2;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEm2;');
  };
  m.customProgramCacheKey = () => 'roof-paris';
  return wallify(m, { color: ROOFC, key: 'roof' });
}

// ---------- trees: clipped chestnut "curtains", lit gold on the Sun's side ----------
const LEAF = /* glsl */ `
{
  float n = wNoise(wp * 1.7) * 0.6 + wNoise(wp * 5.0) * 0.4;
  diffuseColor.rgb = mix(vec3(0.09, 0.15, 0.05), vec3(0.26, 0.36, 0.11), n) * (0.85 + 0.3 * wHash(floor(wp * 0.25)));
}`;

export function makeCity(scene, { plainMat, glowMat }) {
  const W = (m, o) => wallify(m, o);
  // ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 7400, 1, 740).rotateX(-Math.PI / 2).translate(0, 0, -3500),
    W(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 }), { color: GROUND, key: 'ground' }));
  { const pa = ground.geometry.attributes.position; for (let i = 0; i < pa.count; i++) pa.setY(i, groundY(pa.getZ(i))); ground.geometry.computeVertexNormals(); }
  ground.receiveShadow = true;
  scene.add(ground);
  // the island you stand on, and the kerbs (a step up)
  const island = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.15, 21).translate(0, 0.075, -6), W(plainMat(0x8f8a82, 0.9)));
  island.receiveShadow = true; island.castShadow = true;
  scene.add(island);
  const walkMat = W(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 }), { color: GROUND, key: 'ground2' });
  for (const side of [-1, 1]) {
    const g = new THREE.BoxGeometry(WALK - ROAD, 0.14, 1000, 1, 1, 100).translate(side * (ROAD + WALK) / 2, 0.07, -380);
    const pa = g.attributes.position; for (let i = 0; i < pa.count; i++) pa.setY(i, pa.getY(i) + groundY(pa.getZ(i)));
    g.computeVertexNormals();
    const walk = new THREE.Mesh(g, walkMat); walk.receiveShadow = true;
    scene.add(walk);
  }

  // buildings
  const n = B.length;
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const aB = new Float32Array(n * 4);
  B.forEach((b, i) => aB.set([b.seed, b.h + 1.5, b.lit, b.kind], i * 4));
  geo.setAttribute('aB', new THREE.InstancedBufferAttribute(aB, 4));
  const blocks = new THREE.InstancedMesh(geo, facadeMaterial(), n);
  blocks.castShadow = true; blocks.receiveShadow = true; blocks.frustumCulled = false;
  B.forEach((b, i) => {
    const y0 = groundY(b.z) - 1.5;
    m4.compose(p3.set(b.x, y0, b.z), q.setFromEuler(e3.set(0, b.rot || 0, 0)), s3.set(b.w, b.h + 1.5, b.d));
    blocks.setMatrixAt(i, m4);
  });
  scene.add(blocks);
  // mansard roofs on the stone blocks
  const RB = B.filter((b) => b.kind === 0);
  const rgeo = roofGeometry();
  const aRS = new Float32Array(RB.length);
  RB.forEach((b, i) => { aRS[i] = b.seed; });
  rgeo.setAttribute('aRS', new THREE.InstancedBufferAttribute(aRS, 1));
  const roofs = new THREE.InstancedMesh(rgeo, roofMaterial(), RB.length);
  roofs.castShadow = true; roofs.frustumCulled = false;
  RB.forEach((b, i) => {
    m4.compose(p3.set(b.x, groundY(b.z) + b.h, b.z), q.setFromEuler(e3.set(0, b.rot || 0, 0)), s3.set(b.w, 6.2, b.d));
    roofs.setMatrixAt(i, m4);
  });
  scene.add(roofs);
  // chimney stacks along the roof ridges
  {
    const CH = [];
    RB.forEach((b) => { if (b.far) return; for (let k = 0; k < Math.floor(b.d / 9); k++) CH.push([b.x + (b.side || 1) * 4, groundY(b.z) + b.h + 6.2, b.z - b.d / 2 + 4 + k * 9]); });
    const ch = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 1.6, 3.2).translate(0, 0.6, 0), W(plainMat(0xb08a70, 0.9)), CH.length);
    CH.forEach(([x, y, z], i) => { m4.makeTranslation(x, y, z); ch.setMatrixAt(i, m4); });
    ch.castShadow = true; ch.frustumCulled = false;
    scene.add(ch);
  }

  // trees
  {
    // a crown of a few leafy lumps (5..13 m up), so you see the facades between the trees
    const lumps = [[0, 9.2, 0, 3.0], [1.6, 10.6, 1.2, 2.3], [-1.5, 10.2, -1.3, 2.4], [0.4, 11.9, -0.6, 2.0], [-0.9, 8.0, 1.5, 2.1], [1.2, 7.9, -1.6, 2.0]];
    const crown = mergeGeometries(lumps.map(([x, y, z, r]) => new THREE.IcosahedronGeometry(r, 2).translate(x, y, z)));
    { const pa = crown.attributes.position; for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i); const k = 1 + 0.16 * Math.sin(x * 3.1 + y * 2.3) * Math.sin(z * 2.7 + y * 1.9); pa.setXYZ(i, x * k, 9.5 + (y - 9.5) * k, z * k); } crown.computeVertexNormals(); }
    const leafMat = W(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), { color: LEAF, key: 'leaf' });
    const crowns = new THREE.InstancedMesh(crown, leafMat, TREES.length);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.24, 8, 7).translate(0, 4, 0), W(plainMat(0x3a3028, 0.9)), TREES.length);
    TREES.forEach((t, i) => {
      m4.compose(p3.set(t.x, groundY(t.z) + 0.14, t.z), q.setFromEuler(e3.set(0, t.seed * 6, 0)), s3.set(t.s, t.s * (0.95 + t.seed * 0.1), t.s));
      crowns.setMatrixAt(i, m4); trunks.setMatrixAt(i, m4);
    });
    crowns.castShadow = true; crowns.receiveShadow = true; trunks.castShadow = true;
    crowns.frustumCulled = false; trunks.frustumCulled = false;
    scene.add(crowns, trunks);
  }

  // lamps: dark green posts with a lantern
  const lampPos = [];
  {
    const post = mergeGeometries([new THREE.CylinderGeometry(0.07, 0.12, 4.6, 8).translate(0, 2.3, 0), new THREE.CylinderGeometry(0.18, 0.22, 0.6, 8).translate(0, 0.3, 0),
      new THREE.CylinderGeometry(0.22, 0.12, 0.7, 6).translate(0, 4.95, 0)]);
    const posts = new THREE.InstancedMesh(post, W(plainMat(0x1e2a22, 0.6)), LAMPS.length);
    LAMPS.forEach((l, i) => { m4.makeTranslation(l.x, groundY(l.z) + 0.14, l.z); posts.setMatrixAt(i, m4); lampPos.push([l.x, groundY(l.z) + 5.0, l.z]); });
    posts.castShadow = true; posts.frustumCulled = false;
    scene.add(posts);
  }

  // the Arc de Triomphe: 50 m high, 45 wide, 22 deep; the great arch 29 m high, 14.6 wide; cornices, the attic
  {
    const stone = W(new THREE.MeshStandardMaterial({ color: 0xd8ccb2, roughness: 0.9 }));
    const shape = new THREE.Shape([[-22.5, 0], [22.5, 0], [22.5, 50], [-22.5, 50]].map(([x, y]) => new THREE.Vector2(x, y)));
    const hole = new THREE.Path();
    hole.moveTo(-7.3, 0); hole.lineTo(7.3, 0); hole.lineTo(7.3, 21.9); hole.absarc(0, 21.9, 7.3, 0, Math.PI, false); hole.lineTo(-7.3, 0);
    shape.holes.push(hole);
    const body = new THREE.ExtrudeGeometry(shape, { depth: 22, bevelEnabled: false, curveSegments: 24 }).translate(0, 0, -11);
    const y0 = groundY(ARC_Z);
    const arc = new THREE.Group();
    arc.position.set(0, y0, ARC_Z);
    const add = (g) => { const m = new THREE.Mesh(g, stone); m.castShadow = true; m.receiveShadow = true; arc.add(m); return m; };
    add(body);
    add(new THREE.BoxGeometry(46.4, 1.6, 23.4).translate(0, 37.4, 0));     // the main cornice
    add(new THREE.BoxGeometry(45.6, 0.8, 22.8).translate(0, 29.6, 0));     // the impost band
    add(new THREE.BoxGeometry(46.0, 1.2, 23.0).translate(0, 49.4, 0));     // the top cornice
    add(new THREE.BoxGeometry(45.2, 2.0, 22.4).translate(0, 45.0, 0));     // the attic's shields band
    add(new THREE.BoxGeometry(46.0, 1.4, 23.0).translate(0, 0.7, 0));      // plinth
    // the sculpture groups on the piers (darker, in relief), and the side arches
    const relief = W(new THREE.MeshStandardMaterial({ color: 0xa89a80, roughness: 0.95 }));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(9, 11.5, 1.2).translate(sx * 14.9, 15.5, sz * 11.3), relief); arc.add(r);
      const r2 = new THREE.Mesh(new THREE.BoxGeometry(11, 4.2, 0.6).translate(sx * 14.9, 33.0, sz * 11.15), relief); arc.add(r2);
    }
    for (const sx of [-1, 1]) {
      const sideArch = new THREE.Mesh(new THREE.BoxGeometry(0.4, 18.7, 8.4).translate(sx * 22.45, 9.35, 0), W(plainMat(0x2a2620, 0.9))); arc.add(sideArch);
    }
    scene.add(arc);
  }
  return { ground, blocks, roofs, lampPos };
}

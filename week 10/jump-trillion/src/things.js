// The red city bus (12.2 m, front at -z, its origin the middle of its footprint at the ground) and the Space Station
// (for the space scene: a long truss with eight pairs of gold solar wings, white radiators and the module stack, ~109 m
// across, its origin at its middle).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const shadowAll = (g) => { g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } }); return g; };

export function makeBus(ctx) {
  const g = new THREE.Group();
  const M = (c, r = 0.6, e = {}) => ctx.plainMat(c, r, e);
  const red = M(0xc4211d, 0.45), glass = M(0x101418, 0.12, { metalness: 0.4 }), white = M(0xf2f0ea, 0.5),
    black = M(0x161616, 0.8), tire = M(0x111111, 0.9), hub = M(0x9a9da2, 0.4, { metalness: 0.5 }),
    sign = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.6, 0.4) });
  const L = 12.2, W = 2.55;
  g.add(new THREE.Mesh(new RoundedBoxGeometry(W, 2.75, L, 3, 0.16).translate(0, 0.32 + 1.375, 0), red));
  g.add(new THREE.Mesh(new RoundedBoxGeometry(W - 0.25, 0.22, L - 1.4, 2, 0.1).translate(0, 3.1, 0.3), M(0xa81b18, 0.5)));   // roof (red, seen from above)
  g.add(new THREE.Mesh(new RoundedBoxGeometry(1.4, 0.28, 2.6, 2, 0.08).translate(0, 3.3, 2.6), M(0x6a6d72, 0.6)));       // the AC unit
  g.add(new THREE.Mesh(box(0.9, 0.02, 3.2, 0, 3.22, -2.4), M(0xf2f0ea, 0.5)));                                        // the fleet number panel
  g.add(new THREE.Mesh(box(W + 0.03, 1.15, L - 1.9, 0, 2.05, 0.35), glass));
  const pil = [];
  for (let z = -4.6; z < 6.0; z += 1.55) for (const sx of [-1, 1]) pil.push(box(0.04, 1.17, 0.12, sx * (W / 2 + 0.02), 2.05, z));
  g.add(new THREE.Mesh(mergeGeometries(pil), red));
  g.add(new THREE.Mesh(box(W - 0.2, 1.75, 0.04, 0, 1.95, -L / 2 - 0.01), glass));
  g.add(new THREE.Mesh(box(W - 0.4, 0.8, 0.04, 0, 2.15, L / 2 + 0.01), glass));
  g.add(new THREE.Mesh(box(W - 0.5, 0.28, 0.05, 0, 2.95, -L / 2 - 0.02), sign));
  g.add(new THREE.Mesh(mergeGeometries([box(0.04, 2.3, 1.1, W / 2 + 0.02, 1.5, -4.9), box(0.04, 2.3, 1.1, W / 2 + 0.02, 1.5, 0.9)]), glass));
  g.add(new THREE.Mesh(mergeGeometries([box(W + 0.04, 0.32, 0.18, 0, 0.5, -L / 2 - 0.05), box(W + 0.04, 0.32, 0.18, 0, 0.5, L / 2 + 0.05)]), black));
  g.add(new THREE.Mesh(box(W + 0.035, 0.12, L - 1.6, 0, 1.4, 0.2), white));
  for (const [z, sx] of [[-3.7, -1], [-3.7, 1], [3.0, -1], [3.0, 1]]) {
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.32, 18).rotateZ(Math.PI / 2).translate(sx * (W / 2 - 0.12), 0.5, z), tire));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.04, 12).rotateZ(Math.PI / 2).translate(sx * (W / 2 + 0.05), 0.5, z), hub));
  }
  g.add(new THREE.Mesh(mergeGeometries([box(0.35, 0.16, 0.04, -0.85, 0.85, -L / 2 - 0.02), box(0.35, 0.16, 0.04, 0.85, 0.85, -L / 2 - 0.02)]), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.9, 2.6) })));
  // a few riders at the windows (heads and shoulders)
  const ride = [];
  for (let k = 0; k < 7; k++) {
    const z = -4.2 + k * 1.55 + 0.4, sx = k % 2 ? 1 : -1;
    ride.push(new THREE.SphereGeometry(0.12, 8, 6).translate(sx * 0.75, 2.2, z), box(0.4, 0.35, 0.22, sx * 0.75, 1.9, z));
  }
  g.add(new THREE.Mesh(mergeGeometries(ride), M(0x8a6a52, 0.8)));
  shadowAll(g);
  return g;
}

export function makeISS() {
  const g = new THREE.Group();
  const S = (c, r = 0.5, m = 0.3, e = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, emissive: c, emissiveIntensity: e });
  const truss = S(0xb8bcc2, 0.5, 0.5), white = S(0xe8e8e4, 0.6, 0.1), gold = S(0xb88a2a, 0.3, 0.6), panel = S(0x2a2414, 0.35, 0.5), rad = S(0xf2f2f0, 0.7, 0);
  // the main truss (x), 109 m
  g.add(new THREE.Mesh(box(109, 1.6, 1.6, 0, 0, 0), truss));
  // solar wings: 4 pairs each side, each wing ~35 x 11.6 m, gold, with a dark grid
  const wings = [];
  for (const sx of [-1, 1]) for (const dx of [44, 52]) for (const sz of [-1, 1]) wings.push(box(4.6, 0.12, 34, sx * dx, 0, sz * 19));
  const wingMat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: new THREE.Vector3(0.5, 0.7, 0.5) } },
    vertexShader: `varying vec3 vP; varying vec3 vN; void main(){ vP = position; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uSun; varying vec3 vP; varying vec3 vN; void main(){
      vec2 c = fract(vec2(vP.x / 0.9, vP.z / 1.1)); float grid = step(0.08, c.x) * step(0.06, c.y);
      float l = 0.35 + 0.65 * abs(dot(normalize(vN), uSun));
      vec3 col = mix(vec3(0.35, 0.25, 0.08), vec3(0.85, 0.6, 0.2), grid) * l;
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  g.add(new THREE.Mesh(mergeGeometries(wings), wingMat));
  g.add(new THREE.Mesh(mergeGeometries([box(1, 1, 76, -48, 0, 0), box(1, 1, 76, 48, 0, 0)]), truss));
  // radiators
  g.add(new THREE.Mesh(mergeGeometries([box(3, 0.1, 14, -18, 0, 8), box(3, 0.1, 14, 18, 0, 8), box(3, 0.1, 14, -22, 0, 8), box(3, 0.1, 14, 22, 0, 8)]), rad));
  // the modules: a stack along z through the middle, a cross of labs
  const mods = [];
  const cyl = (r, l, x, y, z, ax = 'z') => { const c = new THREE.CylinderGeometry(r, r, l, 16); if (ax === 'z') c.rotateX(Math.PI / 2); if (ax === 'x') c.rotateZ(Math.PI / 2); return c.translate(x, y, z); };
  mods.push(cyl(2.1, 45, 0, -2.6, 2), cyl(2.2, 8.5, 0, -2.6, -22), cyl(2.1, 8, 6, -2.6, -8, 'x'), cyl(2.1, 8, -6, -2.6, -8, 'x'), cyl(1.6, 6, 0, -2.6, 27));
  g.add(new THREE.Mesh(mergeGeometries(mods), white));
  g.add(new THREE.Mesh(mergeGeometries([box(9, 0.1, 3, 0, -2.6, 20), box(9, 0.1, 3, 0, -2.6, 24)]), gold));
  g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return { g, wingMat };
}

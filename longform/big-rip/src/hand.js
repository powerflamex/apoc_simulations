// Your hand, held up in front of you in the dark, among the pieces of Earth (the last shots). Built from smooth
// pieces (palm, three bones per finger, thumb, wrist, a jacket sleeve), attached to the camera. In the last fraction
// of a second the space inside it stretches: the fingers draw out longer and longer, the joints pull apart with
// light shining through, a glow leaks out from inside the skin, and finally it comes apart into specks of light
// (atoms) that fly away from each other, faster and faster, into the white.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SEC } from './timeline.js';
import { rng, smooth, clamp } from './util.js';

const SKIN = /* glsl */ `
uniform float uGlow; uniform float uTime;
float hh(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float nn(vec3 p) { vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hh(i), hh(i+vec3(1,0,0)), f.x), mix(hh(i+vec3(0,1,0)), hh(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hh(i+vec3(0,0,1)), hh(i+vec3(1,0,1)), f.x), mix(hh(i+vec3(0,1,1)), hh(i+vec3(1,1,1)), f.x), f.y), f.z); }
`;

export function makeHand(scene, camera) {
  const group = new THREE.Group();
  camera.add(group);
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xc88b6a, roughness: 0.62, metalness: 0 });
  const uni = { uGlow: { value: 0 }, uTime: { value: 0 } };
  skinMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvHP = position;');
    sh.fragmentShader = SKIN + 'varying vec3 vHP;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        // skin: a little mottling, redder at the knuckles' creases
        float m = nn(vHP * 900.0) * 0.5 + nn(vHP * 160.0) * 0.5;
        diffuseColor.rgb *= 0.9 + 0.16 * m;
        // light from inside: a warm glow through the skin, then bright veins of white light breaking through
        float vein = smoothstep(0.46, 0.5, nn(vHP * 140.0 + uTime * 0.3)) * (1.0 - smoothstep(0.5, 0.54, nn(vHP * 140.0 + uTime * 0.3)));
        totalEmissiveRadiance += vec3(1.6, 0.55, 0.3) * uGlow * 0.6 + vec3(3.0, 2.6, 2.2) * vein * smoothstep(0.3, 1.0, uGlow) * 3.0;
      }`);
  };
  skinMat.customProgramCacheKey = () => 'skin-v1';
  const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.9 });

  // the hand in its own frame: wrist at the origin, fingers along +y, palm facing +z (toward you)
  const cap = (r, len, taper = 0.9) => {
    const g = new THREE.CapsuleGeometry(r, len, 6, 14).translate(0, len / 2 + r * 0.15, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 1 - (1 - taper) * Math.min(1, Math.max(0, p.getY(i) / (len + r))); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k * 0.92); }
    g.computeVertexNormals();
    return g;
  };
  // the palm: a rounded slab, thicker at the heel, a little cupped
  const palmGeo = (() => {
    const g = new THREE.BoxGeometry(0.084, 0.098, 0.028, 10, 12, 4).translate(0, 0.049, 0);
    const p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const u = v.x / 0.042, w = (v.y - 0.049) / 0.049;
      // round the corners: pull the edges in on an ellipse
      const r = Math.max(Math.abs(u), Math.abs(w));
      const sq = Math.sqrt(u * u + w * w) / Math.max(r, 1e-6);
      const k = r > 0.75 ? 1 - (1 - 1 / Math.max(sq, 1)) * smooth(0.75, 1, r) * 0.9 : 1;
      v.x *= k; v.y = 0.049 + (v.y - 0.049) * k;
      // thinner toward the knuckles and the edges, cupped in the middle
      v.z *= (1.05 - 0.25 * Math.max(0, w)) * (1 - 0.35 * u * u);
      if (v.z > 0) v.z -= 0.004 * (1 - u * u) * (1 - w * w);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  })();
  // fingers: [x at the knuckle, spread, lengths of the three bones, radius]
  const FING = [[-0.031, 0.1, [0.042, 0.025, 0.021], 0.0093], [-0.0105, 0.02, [0.047, 0.028, 0.022], 0.0098], [0.0105, -0.05, [0.044, 0.027, 0.021], 0.0093], [0.03, -0.14, [0.034, 0.021, 0.019], 0.0083]];
  const bones = [];
  for (const [x, spread, lens, r] of FING) {
    let parent = null;
    lens.forEach((len, k) => {
      const node = new THREE.Group();
      const mesh = new THREE.Mesh(cap(r * (1 - k * 0.09), len), skinMat);
      node.add(mesh);
      if (!parent) { node.position.set(x, 0.092, 0.0); node.rotation.z = spread; node.rotation.x = 0.1; group.add(node); }
      else { node.position.set(0, lens[k - 1] + r * 0.3, 0); node.rotation.x = 0.12 + k * 0.1; parent.add(node); }
      bones.push({ node, mesh, len, r, k, rx: 0.12 + k * 0.1 });
      parent = node;
    });
  }
  // the thumb: from the side of the heel, out and forward, thicker
  {
    let parent = null;
    const TL = [0.036, 0.03, 0.024];
    [[TL[0], 0.0125], [TL[1], 0.0112], [TL[2], 0.0102]].forEach(([len, r], k) => {
      const node = new THREE.Group();
      const mesh = new THREE.Mesh(cap(r, len), skinMat);
      node.add(mesh);
      if (!parent) { node.position.set(-0.036, 0.022, 0.006); node.rotation.set(0.45, 0.25, 0.85); group.add(node); }
      else { node.position.set(0, TL[k - 1] + r * 0.3, 0); node.rotation.set(0.12, 0, -0.18); parent.add(node); }
      bones.push({ node, mesh, len, r, k, thumb: true, rx: node.rotation.x });
      parent = node;
    });
  }
  const palmMesh = new THREE.Mesh(palmGeo, skinMat);
  group.add(palmMesh);
  // wrist, forearm and sleeve, running back and down toward the bottom-right corner of the frame
  const arm = new THREE.Group();
  const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.22, 20).scale(1, 1, 0.75).translate(0, -0.1, 0), skinMat);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.052, 0.45, 22, 1, true).translate(0, -0.37, 0), sleeveMat);
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.007, 8, 28).rotateX(Math.PI / 2).translate(0, -0.15, 0), sleeveMat);
  arm.add(forearm, sleeve, cuff);
  arm.position.set(0, 0.012, -0.004);
  group.add(arm);
  group.visible = false;

  // the specks it comes apart into: points sampled over the hand
  const R = rng(777);
  const N = 26000;
  const P0 = new Float32Array(N * 3), rnd = new Float32Array(N);
  {
    group.updateMatrixWorld(true);
    const meshes = [palmMesh, forearm, ...bones.map((b) => b.mesh)];
    const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const v = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const m = meshes[Math.floor(Math.pow(R(), 1.3) * meshes.length)];
      const pos = m.geometry.attributes.position;
      v.fromBufferAttribute(pos, Math.floor(R() * pos.count)).applyMatrix4(m.matrixWorld).applyMatrix4(inv);
      P0.set([v.x, v.y, v.z], i * 3); rnd[i] = R();
    }
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(P0, 3));
  pg.setAttribute('aR', new THREE.BufferAttribute(rnd, 1));
  const pmat = new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 }, uSpread: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `attribute float aR; uniform float uK; uniform float uSpread; varying float vA;
      void main(){
        vec3 c = vec3(0.0, 0.06, 0.0);
        vec3 p = position + (position - c) * uSpread * (0.6 + 0.8 * aR) + vec3(sin(aR * 91.0), cos(aR * 53.0), sin(aR * 37.0)) * uSpread * 0.02;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(2.2 / max(-mv.z, 0.05), 1.0, 6.0);
        vA = uK;
      }`,
    fragmentShader: `varying float vA; void main(){ vec2 q = gl_PointCoord - 0.5; float r = length(q); if (r > 0.5) discard;
      gl_FragColor = vec4(vec3(2.6, 2.3, 2.0) * smoothstep(0.5, 0.0, r) * vA, 1.0); }`,
  });
  const specks = new THREE.Points(pg, pmat);
  specks.frustumCulled = false;
  group.add(specks);
  // a warm light on the hand from the glowing ground below and a cool rim from behind
  const key = new THREE.PointLight(0xff7a3a, 0, 2, 1.5);
  key.position.set(-0.15, -0.25, 0.1);
  const rim = new THREE.PointLight(0x9fb8ff, 0, 2, 1.5);
  rim.position.set(0.2, 0.25, -0.35);
  group.add(key, rim);
  const glows = bones.map(() => null);
  void glows;

  return {
    frame(v, s) {
      const on = v >= SEC.hand - 0.5 && v < SEC.end + 1;
      group.visible = on && s.hand > 0.001;
      if (!group.visible) { key.intensity = 0; rim.intensity = 0; return; }
      const st = s.stretch;
      // raised into view, a slow drift, the fingers flexing a little
      const rise = 1 - Math.pow(1 - s.hand, 3);
      group.position.set(0.055 + 0.004 * Math.sin(v * 0.6), -0.22 + 0.15 * rise + 0.003 * Math.sin(v * 0.8), -0.4);
      group.rotation.set(-0.18 + 0.03 * Math.sin(v * 0.5), 0.18, -0.12 + 0.03 * Math.sin(v * 0.4));
      arm.rotation.set(0.6, 0, 0.55);
      // the stretch: bones longer, joints apart
      const k = Math.pow(st, 2.2);
      const len = 1 + 2.4 * k;
      for (const b of bones) {
        b.mesh.scale.set(1 - 0.25 * k, len, 1 - 0.25 * k);
        if (!b.thumb) b.node.rotation.x = (b.k === 0 ? 0.1 : b.rx) * (1 - 0.6 * k) + 0.05 * Math.sin(v * 0.7 + b.k);
      }
      // re-space the joints along the stretched bones, with a gap that opens
      for (let i = 0; i < bones.length; i++) {
        const b = bones[i];
        if (b.k === 0) continue;
        const prev = bones[i - 1];
        b.node.position.y = (prev.len + prev.r * 0.3) * len + 0.012 * k;
      }
      palmMesh.scale.set(1 - 0.15 * k, 1 + 1.2 * k, 1 - 0.15 * k);
      uni.uGlow.value = smooth(0.05, 0.75, st);
      uni.uTime.value = v;
      // coming apart into specks
      const dis = smooth(SEC.rip - 3.2, SEC.rip - 0.6, v);
      const solid = 1 - smooth(SEC.rip - 2.2, SEC.rip - 1.0, v);
      for (const b of bones) b.mesh.visible = solid > 0.02;
      palmMesh.visible = forearm.visible = solid > 0.02;
      skinMat.opacity = 1;
      pmat.uniforms.uK.value = dis * 0.6;
      pmat.uniforms.uSpread.value = Math.pow(dis, 2) * 3.5;
      specks.visible = dis > 0.001;
      key.intensity = 0.5 * (0.4 + s.heat) * 1.2;
      rim.intensity = 0.25;
    },
  };
}

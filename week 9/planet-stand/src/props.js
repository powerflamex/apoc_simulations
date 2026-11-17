// The things that stay with you: a low beach chair (white plastic frame, red-and-white striped cloth, wooden arms),
// a tall glass of a blue drink (ice, a lemon wheel, a striped straw), and the wings you strap on for Titan.
// The chair sits at the origin facing +z; its seat is 0.26-0.3 m up.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchFX } from './fx.js';

const tube = (pts, r = 0.014) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.0), 24, r, 10, false);

export function makeChair(scene) {
  const g = new THREE.Group();
  scene.add(g);
  const frameM = patchFX(new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.45 }), 'chair-frame', { melt: true });
  const woodM = patchFX(new THREE.MeshStandardMaterial({ color: 0xb07a45, roughness: 0.7 }), 'chair-wood', { melt: true, scorch: 0.6 });
  // the cloth: stripes along its length, sagging between the bars
  const clothM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide });
  const prevCloth = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aSt; varying vec2 vSt;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSt = aSt;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vSt;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        { float s = step(0.5, fract(vSt.x * 4.5 + 0.25));
          diffuseColor.rgb = mix(vec3(0.82, 0.07, 0.09), vec3(0.96, 0.94, 0.9), s);
          diffuseColor.rgb *= 0.92 + 0.08 * sin(vSt.y * 900.0) * sin(vSt.x * 700.0); }`);
  };
  patchFX(clothM, 'chair-cloth', { melt: true, scorch: 1, prev: prevCloth });

  // seat and back: a sheet hung between two side bars (x = +-0.26), sagging in the middle
  const sheet = (p0, p1, sag, nu = 14, nv = 16) => {
    const pos = [], st = [], idx = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv;
      const x = -0.26 + 0.52 * u;
      const a = new THREE.Vector3(...p0).lerp(new THREE.Vector3(...p1), v);
      const d = Math.sin(Math.PI * u) * sag * (0.6 + 0.4 * Math.sin(Math.PI * v));
      // sag away from you (down for the seat, back for the backrest): along the sheet's normal
      const n = new THREE.Vector3(...p1).sub(new THREE.Vector3(...p0)).normalize();
      const nrm = new THREE.Vector3(0, -n.z, n.y).normalize();     // perpendicular in the y-z plane
      pos.push(x, a.y - nrm.y * d, a.z - nrm.z * d);
      st.push(u, v);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i; idx.push(a, a + 1, a + nu + 1, a + 1, a + nu + 2, a + nu + 1); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aSt', new THREE.Float32BufferAttribute(st, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  };
  const seat = new THREE.Mesh(sheet([0, 0.3, 0.27], [0, 0.23, -0.23], 0.05), clothM);
  const back = new THREE.Mesh(sheet([0, 0.23, -0.25], [0, 0.95, -0.6], 0.06), clothM);
  // the frame
  const parts = [];
  for (const sx of [-1, 1]) {
    const x = sx * 0.27;
    parts.push(tube([[x, 0.3, 0.28], [x, 0.27, 0.0], [x, 0.23, -0.24]]));                   // seat bar
    parts.push(tube([[x, 0.23, -0.25], [x, 0.6, -0.43], [x, 0.96, -0.61]]));                // back bar
    parts.push(tube([[x, 0.31, 0.27], [x * 1.04, 0.15, 0.3], [x * 1.08, 0.0, 0.32]], 0.016));   // front leg
    parts.push(tube([[x, 0.24, -0.26], [x * 1.04, 0.12, -0.35], [x * 1.08, 0.0, -0.44]], 0.016)); // back leg
    parts.push(tube([[x * 1.12, 0.31, 0.27], [x * 1.15, 0.42, 0.28], [x * 1.15, 0.49, 0.28]], 0.012));   // arm post
  }
  parts.push(tube([[-0.27, 0.96, -0.61], [0, 0.975, -0.62], [0.27, 0.96, -0.61]]));       // top bar
  parts.push(tube([[-0.27, 0.3, 0.28], [0, 0.305, 0.285], [0.27, 0.3, 0.28]]));           // front bar
  const frame = new THREE.Mesh(mergeGeometries(parts), frameM);
  const armG = [];
  for (const sx of [-1, 1]) armG.push(new THREE.BoxGeometry(0.075, 0.022, 0.62).translate(sx * 0.31, 0.5, -0.03));
  const arms = new THREE.Mesh(mergeGeometries(armG), woodM);
  for (const m of [seat, back, frame, arms]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  return { group: g, mats: [frameM, woodM, clothM] };
}

// the drink: a tall glass at the origin (its foot), liquid level uLevel (0..1), frozen uIce (0..1), boiling uBoil
export function makeDrink(scene) {
  const g = new THREE.Group();
  scene.add(g);
  const H = 0.15, R1 = 0.036, R0 = 0.031;
  const glassM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(R1, R0, H, 28, 1, true).translate(0, H / 2, 0), glassM);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(R0, R0, 0.012, 28).translate(0, 0.006, 0), glassM);
  const U = { uIce: { value: 0 }, uBoil: { value: 0 }, uT: { value: 0 } };
  const liqM = new THREE.MeshStandardMaterial({ color: 0x1aa0ff, roughness: 0.15, emissive: 0x0a3a80, emissiveIntensity: 0.6, transparent: true, opacity: 0.92 });
  liqM.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uIce; uniform float uBoil; uniform float uT;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.93, 1.0), uIce * 0.8);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.97, 1.0), uBoil * 0.35);`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance *= 1.0 - 0.7 * uIce;');
  };
  liqM.customProgramCacheKey = () => 'liquid';
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(R1 * 0.93, R0 * 0.93, 1, 28).translate(0, 0.5, 0), liqM);
  const iceM = new THREE.MeshStandardMaterial({ color: 0xe8f6ff, roughness: 0.1, transparent: true, opacity: 0.75 });
  const ice = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.024, 0.026), iceM);
    c.position.set(Math.cos(k * 2.1) * 0.012, H * 0.62 + k * 0.012, Math.sin(k * 2.1) * 0.012);
    c.rotation.set(k, k * 0.7, k * 1.3);
    ice.add(c);
  }
  const strawM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  strawM.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vSy;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSy = position.y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vSy;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = mix(vec3(1.0, 0.25, 0.5), vec3(1.0), step(0.5, fract(vSy * 40.0)));');
  };
  strawM.customProgramCacheKey = () => 'straw';
  const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.22, 10).translate(0, 0.11, 0), strawM);
  straw.position.set(-0.012, 0.03, 0.008); straw.rotation.set(0.15, 0, -0.32);
  const lemon = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.007, 24), new THREE.MeshStandardMaterial({ color: 0xffd21a, roughness: 0.6, emissive: 0x3a2a00 }));
  lemon.position.set(0.03, H - 0.004, 0); lemon.rotation.set(0, 0, Math.PI / 2 - 0.25);
  g.add(glass, foot, liquid, ice, straw, lemon);
  for (const m of [liquid, straw, lemon]) m.castShadow = true;
  return {
    group: g, U, H, liquid, ice, straw, lemon, glassM, liqM,
    set(level) {
      const l = Math.max(0.001, level);
      liquid.scale.set(1, H * 0.9 * l, 1); liquid.position.y = 0.012;
      liquid.visible = level > 0.004;
      ice.visible = level > 0.25;
      ice.position.y = (l - 1) * H * 0.75;
    },
  };
}

// wings strapped to your arms (Titan): bright orange fabric on a frame, built in the shoulder's frame: the arm runs
// down its -y axis and the cloth trails back along -z
export function makeWing(side) {
  const sh = new THREE.Shape();
  // (u along the arm from the shoulder, w back from the arm)
  const pts = [[0.02, 0.04], [0.55, 0.05], [1.05, 0.0], [1.22, -0.12], [1.05, -0.28], [0.8, -0.48], [0.45, -0.62], [0.12, -0.58], [0.0, -0.3]];
  sh.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) sh.lineTo(p[0], p[1]);
  const geo = new THREE.ShapeGeometry(sh, 12);
  // shape (x, y) -> shoulder frame: x -> -y (along the arm), y -> z (back is -z)
  const p = geo.attributes.position;
  const st = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i), w = p.getY(i);
    st[i * 2] = u; st[i * 2 + 1] = w;
    p.setXYZ(i, 0.03 * Math.sin(u * 3.0) * (-w), -u, w);
  }
  geo.setAttribute('aW', new THREE.BufferAttribute(st, 2));
  geo.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aW; varying vec2 vW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = aW;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vW;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        { float rib = smoothstep(0.012, 0.0, abs(fract(atan(-vW.y, vW.x - 0.0) * 4.0) - 0.5) * 0.3);
          vec3 c = mix(vec3(1.0, 0.82, 0.1), vec3(0.95, 0.3, 0.12), smoothstep(-0.2, -0.55, vW.y));
          diffuseColor.rgb = mix(c, vec3(0.15, 0.1, 0.08), rib * 0.0 + smoothstep(0.035, 0.0, abs(vW.y - 0.03)) * 0.8); }`);
  };
  m.customProgramCacheKey = () => 'wing';
  const mesh = new THREE.Mesh(geo, m);
  mesh.castShadow = true;
  if (side > 0) mesh.scale.z = 1;
  return mesh;
}

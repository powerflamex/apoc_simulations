// You: a spacesuit built from simple shapes (origin at the hips, facing -z), posed every frame.
// The suit materials keep the frost/wet/heat/crack hooks from the Jupiter suit (unused here); thrusters added.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clamp, lerp, smooth, wobble, keys, DEG } from './util.js';

export const S = {   // shared material uniforms
  uFrost: { value: 0 }, uWet: { value: 0 }, uHot: { value: 0 }, uHotCol: { value: new THREE.Color(1, 0.3, 0.05) },
  uCrack: { value: 0 }, uTime: { value: 0 },
};

const NOISE = /* glsl */ `
  float sh(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
  float sn(vec3 p) {
    vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3.0 - 2.0 * f);
    float a = mix(mix(sh(i), sh(i + vec3(1, 0, 0)), u.x), mix(sh(i + vec3(0, 1, 0)), sh(i + vec3(1, 1, 0)), u.x), u.y);
    float b = mix(mix(sh(i + vec3(0, 0, 1)), sh(i + vec3(1, 0, 1)), u.x), mix(sh(i + vec3(0, 1, 1)), sh(i + vec3(1, 1, 1)), u.x), u.y);
    return mix(a, b, u.z);
  }`;

// frost / wet / heat on any standard material
function patch(mat, { hotK = 1, frostK = 1 } = {}) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, S);
    sh.uniforms.uHotK = { value: hotK }; sh.uniforms.uFrostK = { value: frostK };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vSP; uniform float uFrost, uWet, uHot, uHotK, uFrostK, uTime; uniform vec3 uHotCol;
        ${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float fr = 0.0;
        if (uFrost > 0.0) {
          // rime grows in patches; inside them, feathery crystal lines
          float n = sn(vSP * 5.0) * 0.65 + sn(vSP * 13.0) * 0.35;
          fr = smoothstep(1.0 - uFrost * 1.2, 1.12 - uFrost * 1.2, n) * uFrostK;
          float feather = pow(1.0 - abs(2.0 * sn(vSP * vec3(60.0, 22.0, 60.0)) - 1.0), 3.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.93, 1.0) * (0.9 + 0.2 * feather), fr * 0.95);
        }
        float wt = uWet * (0.6 + 0.4 * sn(vSP * 14.0));
        diffuseColor.rgb *= 1.0 - 0.25 * wt;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.35, fr);
        roughnessFactor = mix(roughnessFactor, 0.18, wt);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (uHot > 0.0) {
          float n = sn(vSP * 6.0 + vec3(0.0, uTime * 0.6, 0.0));
          float h = clamp(uHot * uHotK * (0.75 + 0.5 * n), 0.0, 1.5);
          totalEmissiveRadiance += uHotCol * h * h * 1.1;
        }
        totalEmissiveRadiance += vec3(0.55, 0.68, 0.85) * fr * 0.22;   // ice catches what little light there is
        `);
  };
  return mat;
}

export function makeSuit() {
  const root = new THREE.Group();
  const white = patch(new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.82, metalness: 0.0 }));
  const grey = patch(new THREE.MeshStandardMaterial({ color: 0x8c8e93, roughness: 0.55, metalness: 0.4 }));
  const dark = patch(new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.6, metalness: 0.2 }));
  const red = patch(new THREE.MeshStandardMaterial({ color: 0xb8322a, roughness: 0.7 }));
  const metal = patch(new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.25, metalness: 1.0 }), { hotK: 1.2 });
  const mats = [white, grey, dark, red, metal];

  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 6, 14);

  // torso, hips, backpack, chest unit
  const torso = new THREE.Group();
  torso.position.y = 0.08;
  root.add(torso);
  const chest = add(torso, cap(0.22, 0.36), white, 0, 0.36, 0);
  chest.scale.set(1.22, 1, 0.82);
  const belly = add(torso, cap(0.2, 0.12), white, 0, 0.04, 0);
  belly.scale.set(1.15, 1, 0.85);
  add(torso, new THREE.TorusGeometry(0.205, 0.022, 8, 28), grey, 0, 0.13, 0).rotation.x = Math.PI / 2;
  const pack = add(torso, new RoundedBoxGeometry(0.52, 0.64, 0.24, 4, 0.06), white, 0, 0.42, 0.25);
  add(torso, new RoundedBoxGeometry(0.4, 0.22, 0.04, 2, 0.015), grey, 0, 0.55, 0.375);
  add(torso, new RoundedBoxGeometry(0.4, 0.16, 0.04, 2, 0.015), white, 0, 0.3, 0.375);
  add(torso, new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8), grey, 0, 0.76, 0.3).rotation.z = Math.PI / 2;
  add(torso, new THREE.BoxGeometry(0.44, 0.08, 0.2), grey, 0, 0.08, 0.26);
  const unit = add(torso, new THREE.BoxGeometry(0.26, 0.14, 0.08), grey, 0, 0.36, -0.2);
  unit.rotation.x = -0.2;
  add(torso, new THREE.BoxGeometry(0.05, 0.03, 0.02), red, -0.06, 0.38, -0.245);
  add(torso, new THREE.BoxGeometry(0.05, 0.03, 0.02), dark, 0.03, 0.38, -0.245);
  // helmet: shell, neck ring, gold visor, lamp
  const head = new THREE.Group();
  head.position.set(0, 0.74, -0.02);
  torso.add(head);
  add(head, new THREE.TorusGeometry(0.17, 0.03, 10, 30), metal, 0, -0.1, 0).rotation.x = Math.PI / 2;
  const shell = add(head, new THREE.SphereGeometry(0.205, 40, 28), white, 0, 0.06, 0.01);
  const visorMat = new THREE.MeshStandardMaterial({ color: 0xffd27a, roughness: 0.06, metalness: 1.0 });
  visorMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, S);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vVP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvVP = normalize(position);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vVP; uniform float uCrack, uFrost, uHot, uTime; uniform vec3 uHotCol;
        ${NOISE}
        // cracks spreading from a point low on the right of the visor
        float cracks(vec3 p) {
          vec3 c0 = normalize(vec3(0.35, -0.25, -1.0));
          vec3 d = p - c0;
          float r = length(d);
          vec3 t1 = normalize(cross(c0, vec3(0.0, 1.0, 0.0))), t2 = cross(t1, c0);
          float a = atan(dot(d, t2), dot(d, t1));
          float reach = uCrack * 1.5;
          float k = 0.0;
          // radial cracks, each zig-zagging a little
          for (int i = 0; i < 9; i++) {
            float fi = float(i);
            float ai = fi * 0.698 + (sh(vec3(fi, 1.0, 2.0)) - 0.5) * 0.5;
            float len = (0.45 + 0.8 * sh(vec3(fi, 4.0, 1.0))) * reach;
            float zig = (sn(vec3(r * 14.0, fi, 0.0)) - 0.5) * 0.25;
            float da = abs(mod(a - ai - zig + 3.14159, 6.28318) - 3.14159) * r;
            k = max(k, smoothstep(0.012, 0.0, da) * step(r, len));
          }
          // a ring crack partway out
          float ring = smoothstep(0.012, 0.0, abs(r - 0.32 - 0.03 * sn(vec3(a * 3.0, 0.0, 5.0)))) * step(0.5, sn(vec3(a * 2.2, 3.0, 0.0))) * step(0.5, uCrack);
          return max(k, ring) * step(0.001, uCrack);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float fr = 0.0;
        if (uFrost > 0.0) {
          float n = sn(vVP * 6.0) * 0.6 + sn(vVP * 16.0) * 0.4;
          float edge = smoothstep(0.55, 0.95, length(vVP.xy) + 0.0);
          fr = smoothstep(1.0 - uFrost * 1.9 * (0.6 + edge), 1.1 - uFrost * 1.9 * (0.6 + edge), n);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.92, 1.0), fr);
        }
        float ck = cracks(vVP);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.55, fr);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, 0.0, fr);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.95, 0.9) * ck * (0.6 + 2.5 * uHot) * mix(vec3(1.0), uHotCol, 0.5);
        if (uHot > 0.0) totalEmissiveRadiance += uHotCol * uHot * uHot * 0.6;`);
  };
  const visor = add(head, new THREE.SphereGeometry(0.212, 48, 32, Math.PI * 1.12, Math.PI * 0.76, Math.PI * 0.2, Math.PI * 0.5), visorMat, 0, 0.06, 0.005);
  visor.castShadow = false;
  // the visor frame
  const frame = add(head, new THREE.TorusGeometry(0.2, 0.014, 8, 40, Math.PI * 1.1), grey, 0, 0.07, -0.02);
  frame.rotation.set(0, 0, -0.05 * Math.PI);
  frame.rotation.x = -0.15;
  frame.scale.set(1, 1.08, 1);
  frame.visible = false;
  // helmet lamp on the right side
  const lampHouse = add(head, new THREE.BoxGeometry(0.06, 0.05, 0.1), grey, 0.19, 0.12, -0.04);
  const lampGlass = add(head, new THREE.CircleGeometry(0.02, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }), 0.19, 0.12, -0.091);
  lampGlass.rotation.y = Math.PI;
  lampGlass.material.color.setRGB(0.15, 0.15, 0.15);
  // a red band on the left arm (like a crew commander's stripes)

  // arms
  const arm = (side) => {
    const sh = new THREE.Group();
    sh.position.set(0.3 * side, 0.52, 0);
    torso.add(sh);
    add(sh, new THREE.SphereGeometry(0.1, 16, 12), white, 0, 0, 0);
    const up = add(sh, cap(0.085, 0.22), white, 0, -0.17, 0);
    if (side < 0) add(sh, new THREE.CylinderGeometry(0.089, 0.089, 0.04, 16), red, 0, -0.1, 0);
    const el = new THREE.Group();
    el.position.set(0, -0.32, 0);
    sh.add(el);
    add(el, new THREE.TorusGeometry(0.075, 0.016, 8, 18), grey, 0, 0, 0).rotation.x = Math.PI / 2;
    add(el, cap(0.075, 0.2), white, 0, -0.14, 0);
    add(el, new THREE.TorusGeometry(0.068, 0.016, 8, 18), grey, 0, -0.28, 0).rotation.x = Math.PI / 2;
    const hand = new THREE.Group();
    hand.position.set(0, -0.32, 0);
    el.add(hand);
    const glove = add(hand, new THREE.BoxGeometry(0.1, 0.13, 0.055), white, 0, -0.04, 0);
    add(hand, cap(0.022, 0.05), white, 0.055 * side, -0.02, -0.02).rotation.z = 0.5 * side;
    return { sh, el, hand, glove };
  };
  const L = arm(-1), R = arm(1);
  // legs
  const leg = (side) => {
    const hip = new THREE.Group();
    hip.position.set(0.12 * side, 0.0, 0);
    root.add(hip);
    add(hip, cap(0.11, 0.3), white, 0, -0.2, 0);
    const knee = new THREE.Group();
    knee.position.set(0, -0.42, 0);
    hip.add(knee);
    add(knee, new THREE.TorusGeometry(0.098, 0.018, 8, 20), grey, 0, 0, 0).rotation.x = Math.PI / 2;
    add(knee, cap(0.095, 0.28), white, 0, -0.2, 0);
    const foot = new THREE.Group();
    foot.position.set(0, -0.42, 0);
    knee.add(foot);
    add(foot, new THREE.BoxGeometry(0.15, 0.12, 0.3), white, 0, -0.03, -0.05);
    add(foot, new THREE.BoxGeometry(0.155, 0.04, 0.31), dark, 0, -0.1, -0.05);
    add(foot, new THREE.TorusGeometry(0.095, 0.02, 8, 20), grey, 0, 0.04, 0).rotation.x = Math.PI / 2;
    return { hip, knee, foot };
  };
  const LL = leg(-1), RL = leg(1);

  // the helmet lamp: a spot light with its target ahead of the visor
  const lamp = new THREE.SpotLight(0xfff1dc, 0, 40, 24 * DEG, 0.55, 1.5);
  lamp.position.set(0.19, 0.12, -0.1);
  head.add(lamp);
  lamp.target.position.set(0.25, -0.6, -3);
  head.add(lamp.target);

  // the beam you can see in the murk: a soft cone along the light
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uOn: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uOn; varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ float along = clamp(-vP.y / 6.0 + 0.5, 0.0, 1.0); float edge = pow(abs(dot(vN, vV)), 1.5); gl_FragColor = vec4(vec3(1.0, 0.94, 0.85) * uOn * 0.11 * edge * (1.0 - along) * smoothstep(0.0, 0.08, along), 1.0); }',
  });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(2.4, 6, 24, 1, true), beamMat);
  beam.position.set(0.19, 0.12, -0.1);
  head.add(beam);
  const spill = new THREE.PointLight(0xfff1dc, 0, 3, 2);
  spill.position.set(0.25, 0.2, -0.35);
  head.add(spill);
  // thrusters: two jets under the backpack, firing toward the centre (to push you away)
  const flameMat = new THREE.ShaderMaterial({
    uniforms: { uOn: { value: 0 }, uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform float uOn; uniform float uTime; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){ float along = clamp(0.5 - vP.y / 0.9, 0.0, 1.0); float edge = pow(abs(dot(vN, vV)), 1.2);
        float flick = 0.8 + 0.2 * sin(uTime * 90.0 + vP.y * 30.0);
        vec3 c = mix(vec3(0.75, 0.85, 1.0), vec3(0.35, 0.5, 1.0), along);
        gl_FragColor = vec4(c * uOn * edge * (1.0 - along) * 3.0 * flick, 1.0); }`,
  });
  const jets = [];
  for (const sx of [-0.14, 0.14]) {
    const nz = add(torso, new THREE.CylinderGeometry(0.035, 0.05, 0.08, 12), grey, sx, 0.06, 0.3);
    const jet = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.9, 16, 1, true), flameMat);
    jet.position.set(sx, 0.06 - 0.49, 0.3);
    jet.rotation.x = Math.PI;      // apex at the nozzle, opening downward
    jet.castShadow = false;
    torso.add(jet);
    jets.push(jet, nz);
  }
  const jetLight = new THREE.PointLight(0x9fb8ff, 0, 4, 2);
  jetLight.position.set(0, -0.5, 0.3);
  torso.add(jetLight);

  const W = new THREE.Vector3();
  // pose: video time v and o = { arms: 0 at your sides .. 1 out wide, look: -1 down at your feet .. 1 up,
  // flail: 0 calm .. 1 arms and legs thrashing (the first seconds), reach: 0 .. 1 one arm up toward the opening }
  function pose(v, o = {}) {
    const arms = o.arms ?? 0.7, look = o.look ?? 0, flail = o.flail ?? 0, reach = o.reach ?? 0;
    const fl = (k) => flail * Math.sin(v * (7.3 + k) + k * 2.1) * 0.35;
    const out = 0.35 + 1.0 * arms + wobble(v * 0.35, 3) * 0.1;
    L.sh.rotation.set(-0.15 + wobble(v * 0.4, 3) * 0.12 + fl(1), 0, -out - fl(2) * 0.6);
    // (the reaching arm goes up and forward, over your head toward the opening)
    // (and stays nearly straight, flailing less: a bent elbow flicked the hand back over your head)
    const rf = 1 - 0.7 * Math.min(1, reach / 0.6);
    R.sh.rotation.set(-0.15 + wobble(v * 0.4, 5) * 0.12 + fl(3) * rf + reach * 2.5, 0, out + fl(4) * 0.6 * rf - reach * 0.75);
    L.el.rotation.x = 0.35 + wobble(v * 0.5, 1) * 0.12 + Math.abs(fl(5));
    R.el.rotation.x = (0.35 + wobble(v * 0.5, 2) * 0.12 + Math.abs(fl(6)) * rf) * (1 - 0.85 * Math.min(1, reach / 0.6));
    // legs: together, a little bent, kicking in the first seconds
    const sw = wobble(v * 0.4, 9) * 0.08;
    LL.hip.rotation.set(0.12 + sw + fl(7), 0, -0.08);
    RL.hip.rotation.set(0.05 - sw - fl(8), 0, 0.08);
    LL.knee.rotation.x = -0.3 + 0.08 * Math.sin(v * 0.7) - Math.abs(fl(9));
    RL.knee.rotation.x = -0.2 - 0.08 * Math.sin(v * 0.6) - Math.abs(fl(10));
    LL.foot.rotation.x = 0.25; RL.foot.rotation.x = 0.2;
    head.rotation.set(0.5 * look - 0.05 + wobble(v * 0.3, 7) * 0.06, wobble(v * 0.2, 11) * 0.15, 0);
    for (const j of jets) if (j.geometry.type === 'ConeGeometry') j.visible = false;
    jetLight.intensity = 0;
    lamp.intensity = 0; spill.intensity = 0; beam.visible = false;
    root.updateMatrixWorld(true);
  }
  const helmetPos = (out) => head.getWorldPosition(out || W);
  return { root, pose, lamp, head, mats, helmetPos, visorMat };
}

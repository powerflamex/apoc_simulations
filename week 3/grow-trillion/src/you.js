// You: a jointed figure built at 1x in metres (1.75 m tall; red hoodie, blue jeans, white sneakers), facing +z
// (south), your right sole at the origin, left foot 21 cm east. The whole figure is one group scaled by your
// size s, so its shape never changes; main.js places and lights it. Joints: pelvis -> torso -> neck / shoulders
// -> elbows -> wrists -> fingers; pelvis -> hips -> knees -> ankles. pose(q) sets them every frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { FOOT_X } from './timeline.js';

const HIP_Y = 0.9, THIGH = 0.42, SHIN = 0.41, ANKLE_Y = 0.075;
const SH_Y = 1.43, UPPER = 0.28, FORE = 0.25;

// fabric / skin detail in object space (the figure's own metres), so it scales with you
const DETAIL = /* glsl */ `
float yh(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float yn(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(yh(i), yh(i + vec3(1,0,0)), f.x), mix(yh(i + vec3(0,1,0)), yh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(yh(i + vec3(0,0,1)), yh(i + vec3(1,0,1)), f.x), mix(yh(i + vec3(0,1,1)), yh(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;

function fabric(color, rough, kind) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
  m.userData.kind = kind;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = m.userData.uRim || (m.userData.uRim = { value: new THREE.Color(0, 0, 0) });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vOP; uniform vec3 uRim;\n${DETAIL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float k = ${kind.toFixed(1)};
          if (k < 0.5) {          // denim: diagonal twill, faded on the thighs and knees, darker seams
            float tw = sin((vOP.x + vOP.y + vOP.z) * 2600.0) * 0.5 + 0.5;
            float fade = yn(vOP * 18.0) * 0.6 + yn(vOP * 70.0) * 0.4;
            diffuseColor.rgb *= 0.82 + 0.16 * tw + 0.35 * smoothstep(0.45, 0.85, fade);
          } else if (k < 1.5) {   // fleece hoodie
            diffuseColor.rgb *= 0.85 + 0.25 * yn(vOP * 160.0) + 0.1 * yn(vOP * 25.0);
          } else if (k < 2.5) {   // skin
            diffuseColor.rgb *= 0.93 + 0.12 * yn(vOP * 90.0);
          } else if (k < 3.5) {   // hair
            diffuseColor.rgb *= 0.7 + 0.6 * yn(vOP * vec3(400.0, 60.0, 400.0));
          } else {                // sneaker leather / rubber
            diffuseColor.rgb *= 0.92 + 0.1 * yn(vOP * 300.0);
          }
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * uRim * pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 3.0);`);
  };
  m.customProgramCacheKey = () => 'you-' + kind;
  return m;
}

// a lathe (surface of revolution) from [radius, y] pairs, squashed front-to-back by zs
function lathe(pts, zs = 1, seg = 28) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  g.scale(1, 1, zs);
  return g;
}
// a shoe part: a side profile [along, up] extruded across the width, then pinched to a foot outline
function shoePart(profile, width, bevel, plan, smoothOutline = false) {
  let shape;
  if (smoothOutline) {
    // a smooth curve through the points (the upper's outline), closed back to the start
    shape = new THREE.Shape();
    shape.moveTo(profile[0][0], profile[0][1]);
    shape.splineThru([...profile.slice(1), profile[0]].map(([a, y]) => new THREE.Vector2(a, y)));
  } else shape = new THREE.Shape(profile.map(([a, y]) => new THREE.Vector2(a, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 6, steps: 1 });
  g.translate(0, 0, -(width - 2 * bevel) / 2);
  // the profile's x is along the foot: rotate so it points +z (forward), the extrusion's z becomes x (across)
  g.rotateY(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i), y = p.getY(i);
    const w = plan(z, y);
    p.setX(i, p.getX(i) * w);
  }
  // weld the extrusion's vertices so it shades smooth (a soft, padded look) instead of in facets
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  const w = mergeVertices(g, 1e-5);
  w.computeVertexNormals();
  return w;
}
// foot outline: narrow heel, wide ball, rounded toe (a width factor along the foot, z from heel -0.085 to toe 0.19)
const footPlan = (z, y) => {
  const t = (z + 0.085) / 0.275;
  let w = 0.78 + 0.22 * Math.sin(Math.min(1, t / 0.72) * Math.PI / 2);
  if (t > 0.8) w *= Math.sqrt(Math.max(0.05, 1 - Math.pow((t - 0.8) / 0.215, 2)));
  if (t < 0.08) w *= 0.75 + 0.25 * Math.sqrt(Math.max(0, t / 0.08));
  return w * (1 - 0.15 * Math.max(0, y - 0.05) / 0.06);
};

function makeShoe(M) {
  const g = new THREE.Group();
  // midsole: white foam, a little thicker at the heel, the toe kicked up
  const sole = shoePart([[-0.085, 0.006], [-0.07, 0], [0.16, 0], [0.183, 0.006], [0.192, 0.018], [0.188, 0.028], [0.15, 0.027], [-0.05, 0.034], [-0.088, 0.035]], 0.106, 0.006, footPlan);
  const out = shoePart([[-0.08, 0], [0.17, 0], [0.188, 0.008], [0.17, 0.006], [-0.08, 0.006]], 0.1, 0.003, footPlan);   // gum outsole
  out.translate(0, -0.004, 0);
  // the upper: heel counter, collar, tongue, lace run down to the toe box
  const upPts = [[-0.083, 0.03], [-0.09, 0.07], [-0.084, 0.098], [-0.065, 0.108], [-0.03, 0.094], [0.0, 0.088], [0.025, 0.104], [0.04, 0.1],
    [0.085, 0.08], [0.13, 0.062], [0.165, 0.048], [0.186, 0.032], [0.185, 0.026], [0.15, 0.027], [-0.05, 0.032]];
  const upper = shoePart(upPts, 0.094, 0.012, (z, y) => footPlan(z, y) * 0.97, true);
  // a red stripe on each side (a thin copy of the side panel, scaled out), and the heel tab
  const stripe = shoePart([[-0.06, 0.045], [-0.02, 0.05], [0.07, 0.07], [0.1, 0.066], [0.02, 0.043], [-0.05, 0.037]], 0.1, 0.004, (z, y) => footPlan(z, y) * 1.0);
  const tab = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.04, 0.012, 2, 0.004), M.red);
  tab.position.set(0, 0.085, -0.088);
  // laces: five bars across the tongue
  const laceG = [];
  for (let k = 0; k < 5; k++) {
    const z = 0.035 + k * 0.022, y = 0.097 - k * 0.0085;
    laceG.push(new THREE.BoxGeometry(0.05, 0.005, 0.007).rotateX(-0.45).translate(0, y + 0.002, z));
  }
  g.add(new THREE.Mesh(sole, M.sole), new THREE.Mesh(out, M.gum), new THREE.Mesh(upper, M.shoe), new THREE.Mesh(stripe, M.red), tab,
    new THREE.Mesh(mergeGeometries(laceG), M.lace));
  return g;
}

function makeHand(M, side) {
  // a right hand by default (side = -1 for the left), at the wrist, fingers pointing -y; palm faces the body (+x for
  // the left hand) when the arm hangs; fingers: groups so they can curl
  const hand = new THREE.Group();
  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.094, 0.082, 5, 0.014).translate(0, -0.05, 0), M.skin);
  hand.add(palm);
  const fingers = [];
  const LEN = [[0.04, 0.025, 0.02], [0.044, 0.027, 0.021], [0.042, 0.026, 0.02], [0.033, 0.02, 0.017]];
  for (let f = 0; f < 4; f++) {
    const root = new THREE.Group();
    root.position.set(0, -0.094, (f - 1.5) * 0.019);
    hand.add(root);
    let parent = root;
    const segs = [];
    for (let k = 0; k < 3; k++) {
      const L = LEN[f][k], r = 0.0098 - k * 0.0011 - (f === 3 ? 0.001 : 0);
      const seg = new THREE.Group();
      if (k > 0) seg.position.y = -LEN[f][k - 1];
      parent.add(seg);
      seg.add(new THREE.Mesh(new THREE.CapsuleGeometry(r, L - r, 6, 14).translate(0, -L / 2, 0), M.skin));
      segs.push(seg);
      parent = seg;
    }
    fingers.push(segs);
  }
  // thumb: from the palm's lower side, toward the front
  const tRoot = new THREE.Group();
  tRoot.position.set(0.006, -0.03, 0.036 * -side);
  hand.add(tRoot);
  const thumb = [];
  {
    let parent = tRoot;
    const TL = [0.04, 0.03, 0.026];
    for (let k = 0; k < 3; k++) {
      const seg = new THREE.Group();
      if (k > 0) seg.position.y = -TL[k - 1];
      parent.add(seg);
      const r = 0.011 - k * 0.0012;
      seg.add(new THREE.Mesh(new THREE.CapsuleGeometry(r, TL[k] - r, 4, 10).translate(0, -TL[k] / 2, 0), M.skin));
      thumb.push(seg);
      parent = seg;
    }
    tRoot.rotation.set(-0.5 * side, 0, 0.35);
  }
  return { hand, fingers, thumb, tRoot };
}

export function makeYou(scene) {
  const M = {
    hoodie: fabric(0xb3241f, 0.92, 1), jeans: fabric(0x2f4d7d, 0.85, 0), skin: fabric(0xc98d68, 0.55, 2), hair: fabric(0x2a1a10, 0.7, 3),
    shoe: fabric(0xf3f1ec, 0.55, 4), sole: fabric(0xfbfaf6, 0.7, 4), gum: fabric(0x8a5a2c, 0.85, 4), red: fabric(0xc8261e, 0.6, 4),
    lace: fabric(0xf6f6f2, 0.8, 4), dark: fabric(0x151515, 0.6, 4), cord: fabric(0xeeeeea, 0.8, 1),
  };
  const mats = Object.values(M);
  const root = new THREE.Group();          // at the anchor (your right sole), scaled by s
  scene.add(root);
  const pelvis = new THREE.Group();
  root.add(pelvis);

  // ---- hips and legs ----
  pelvis.add(new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16).scale(0.158, 0.1, 0.1).translate(0, -0.035, 0), M.jeans));
  const legs = [];
  for (const side of [0, 1]) {
    const x = side === 0 ? -0.105 : 0.105;
    const hip = new THREE.Group(); hip.position.set(x, -0.01, 0); pelvis.add(hip);
    hip.add(new THREE.Mesh(lathe([[0.0, 0.03], [0.07, 0.025], [0.088, -0.02], [0.084, -0.12], [0.077, -0.25], [0.066, -0.36], [0.06, -0.42], [0.0, -0.43]], 0.92), M.jeans));
    const knee = new THREE.Group(); knee.position.set(0, -THIGH, 0); hip.add(knee);
    knee.add(new THREE.Mesh(lathe([[0.0, 0.035], [0.056, 0.03], [0.059, -0.005], [0.057, -0.08], [0.052, -0.2], [0.049, -0.3], [0.052, -0.36], [0.056, -0.395], [0.054, -0.405], [0.0, -0.41]], 0.93), M.jeans));
    const ankle = new THREE.Group(); ankle.position.set(0, -SHIN, 0); knee.add(ankle);
    const shoe = makeShoe(M);
    shoe.position.set(0, -ANKLE_Y, 0);
    ankle.add(shoe);
    legs.push({ hip, knee, ankle, x });
  }
  // ---- torso: hoodie ----
  const torso = new THREE.Group(); torso.position.set(0, 0.0, 0); pelvis.add(torso);
  const T0 = -0.07;   // hoodie hem, relative to the pelvis
  torso.add(new THREE.Mesh(lathe([[0.0, T0 - 0.01], [0.165, T0], [0.172, T0 + 0.04], [0.168, 0.12], [0.164, 0.2], [0.172, 0.33], [0.18, 0.42], [0.172, 0.49], [0.14, 0.53], [0.085, 0.555], [0.05, 0.565], [0.0, 0.565]], 0.64, 32), M.hoodie));
  // hem band, kangaroo pocket, drawstrings, the hood bunched round the back of the neck
  torso.add(new THREE.Mesh(lathe([[0.168, T0 - 0.005], [0.172, T0 + 0.045]], 0.66, 32).translate(0, 0, 0), M.hoodie));
  torso.add(new THREE.Mesh(new RoundedBoxGeometry(0.19, 0.1, 0.012, 2, 0.005).translate(0, 0.1, 0.1), M.hoodie));
  for (const sx of [-0.035, 0.035]) torso.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.15, 6).translate(sx, 0.42, 0.112).rotateX(0.0), M.cord));
  torso.add(new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.04, 10, 24).scale(1, 1, 0.8).rotateX(Math.PI / 2 - 0.5).translate(0, 0.56, -0.045), M.hoodie));
  for (const sx of [-1, 1]) torso.add(new THREE.Mesh(new THREE.SphereGeometry(0.056, 16, 12).scale(1.0, 0.85, 0.85).translate(sx * 0.172, 0.49, -0.005), M.hoodie));
  // ---- neck and head ----
  const neck = new THREE.Group(); neck.position.set(0, 0.555, 0); torso.add(neck);
  neck.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.09, 14).translate(0, 0.03, 0), M.skin));
  const head = new THREE.Group(); head.position.set(0, 0.075, 0.005); neck.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 18).scale(0.86, 1.08, 0.98).translate(0, 0.1, 0), M.skin));
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12).scale(1.05, 0.78, 0.92).translate(0, 0.05, 0.022), M.skin));     // jaw
  head.add(new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.034, 8).rotateX(Math.PI / 2 + 0.25).translate(0, 0.085, 0.105), M.skin));   // nose
  for (const sx of [-1, 1]) {
    head.add(new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8).scale(0.45, 1, 0.8).translate(sx * 0.087, 0.095, -0.005), M.skin));   // ears
    head.add(new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6).scale(1.1, 0.75, 0.5).translate(sx * 0.033, 0.112, 0.091), M.dark));  // eyes
    head.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.01).rotateZ(-sx * 0.12).translate(sx * 0.034, 0.133, 0.091), M.hair));  // brows
  }
  // hair: a cap over the top and back with a short fringe
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.106, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.56).scale(0.9, 1.0, 1.02).translate(0, 0.115, -0.008), M.hair));
  // ---- arms ----
  const arms = [];
  for (const side of [0, 1]) {
    const sx = side === 0 ? -1 : 1;
    const sh = new THREE.Group(); sh.position.set(sx * 0.19, 0.48, -0.01); torso.add(sh);
    sh.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.052, UPPER - 0.04, 6, 16).translate(0, -UPPER / 2, 0), M.hoodie));
    const el = new THREE.Group(); el.position.set(0, -UPPER, 0); sh.add(el);
    el.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.046, FORE - 0.05, 6, 16).translate(0, -FORE / 2 + 0.01, 0), M.hoodie));
    el.add(new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.04, 0.03, 16).translate(0, -FORE + 0.012, 0), M.hoodie));   // cuff
    const wr = new THREE.Group(); wr.position.set(0, -FORE + 0.005, 0); el.add(wr);
    const H = makeHand(M, side === 0 ? 1 : -1);
    // the hand's palm faces the body (+x for the right hand at x < 0): its thin axis is x already
    if (side === 1) H.hand.scale.x = -1;
    wr.add(H.hand);
    arms.push({ sh, el, wr, ...H, sx });
  }
  // you cast your shadow on the city, but don't take the towers' shadows (you'd stand in their shade at street size)
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; } });

  // 2-bone leg IK in the leg's own plane: the ankle at (dy down from the hip, dz forward) -> hip and knee angles
  function legIK(dy, dz) {
    const d = Math.min(Math.hypot(dy, dz), THIGH + SHIN - 1e-4);
    const a = Math.acos((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d));
    const k = Math.PI - Math.acos((THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN));
    const base = Math.atan2(dz, dy);
    return { hip: base + a, knee: k };
  }
  const tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
  const tmpM = new THREE.Matrix4();

  return {
    root, mats, M, arms, legs, head, torso, pelvis,
    // q: { lift: [L, R] (feet raised, m), sink (m), lean, head: [pitch, yaw], arms: 'down' | 'out' | 'float',
    //      reach (0..1), reachDir (Vector3 in the figure's frame), curl (0..1 fingers), float (0..1) }
    pose(q) {
      const fl = q.float || 0;
      // pelvis between the feet; a little lower when a knee bends to lift a foot
      const lift = q.lift || [0, 0];
      const px = (FOOT_X[0] + FOOT_X[1]) / 2;
      const hipH = HIP_Y + 0.01 - 0.03 * Math.max(lift[0], lift[1]) / 0.13 - 0.04 * fl;
      pelvis.position.set(px, hipH, 0);
      pelvis.rotation.set(q.lean || 0, 0, 0.04 * (lift[1] - lift[0]) / 0.13);
      torso.rotation.set(-0.02 + 0.06 * fl, 0, 0);
      legs.forEach((L, i) => {
        // ankle target relative to the hip joint
        const fz = (i === 0 ? 0.02 : 0.0) + lift[i] * 0.35 + fl * (i === 0 ? 0.06 : -0.08);
        const fy = hipH - 0.01 - ANKLE_Y - lift[i] - fl * (i === 0 ? 0.08 : 0.03);
        const ik = legIK(fy, fz);
        L.hip.rotation.set(-ik.hip, 0, (i === 0 ? -1 : 1) * 0.02);
        L.knee.rotation.set(ik.knee, 0, 0);
        L.ankle.rotation.set(-(ik.hip - ik.knee) - lift[i] * 1.2 + fl * 0.35, 0, 0);
      });
      neck.rotation.set((q.head ? q.head[0] : 0) * 0.5, (q.head ? q.head[1] : 0) * 0.4, 0);
      head.rotation.set((q.head ? q.head[0] : 0) * 0.5, (q.head ? q.head[1] : 0) * 0.6, 0);
      // arms: hanging a little away from the body (unsettled), floating out in space, the right one reaching
      arms.forEach((A, i) => {
        const out = 0.16 + 0.35 * fl + (q.armsOut || 0);
        A.sh.rotation.set(0.06 + 0.25 * fl, 0, A.sx * out, 'XYZ');
        A.el.rotation.set(0.25 + 0.4 * fl, 0, 0);
        A.wr.rotation.set(0.05, 0, 0);
        const curl = q.curl ?? 0.35;
        A.fingers.forEach((f, j) => f.forEach((seg, k) => seg.rotation.set(0, 0, (k === 0 ? 0.25 : 0.35) * curl * (1 + j * 0.08))));
        A.thumb.forEach((seg, k) => seg.rotation.set(0, 0, 0.15 * curl));
      });
      // the right arm (arms[0], at x < 0) reaches along reachDir (figure frame), palm up, fingers open
      const rk = q.reach || 0;
      if (rk > 0 && q.reachDir) {
        const A = arms[0];
        // direction in the torso's frame: the torso's world rotation is pelvis * torso (the root has no rotation)
        torso.updateMatrixWorld(true);
        tmpM.copy(root.matrixWorld).invert().multiply(A.sh.parent.matrixWorld);
        const m3 = new THREE.Matrix3().setFromMatrix4(tmpM).invert();
        tmpV.copy(q.reachDir).applyMatrix3(m3).normalize();
        tmpQ.setFromUnitVectors(down, tmpV);
        const qRest = new THREE.Quaternion().setFromEuler(A.sh.rotation);
        A.sh.quaternion.copy(qRest.slerp(tmpQ, rk));
        A.el.rotation.set(0.25 * (1 - rk) + 0.1 * rk, 0, 0);
        // palm up: the fingers along the reach (local -y), the palm's face (local +x) turned to the sky
        A.el.updateMatrixWorld(true);
        const rdW = tmpV2.copy(q.reachDir).applyQuaternion(root.quaternion).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const X = up.clone().addScaledVector(rdW, -up.dot(rdW)).normalize();
        const Y = rdW.clone().negate();
        const Z = new THREE.Vector3().crossVectors(X, Y);
        const qW = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
        const qEl = new THREE.Quaternion(); A.el.getWorldQuaternion(qEl);
        const qLoc = qEl.invert().multiply(qW);
        const qRestW = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.05, 0, 0));
        A.wr.quaternion.copy(qRestW.slerp(qLoc, rk));
        A.fingers.forEach((f, j) => f.forEach((seg, k) => seg.rotation.set(0, 0, 0.12 * (1 - rk) + (k === 0 ? 0.08 : 0.22) * rk)));
        A.thumb.forEach((seg, k) => seg.rotation.set(0, 0, 0.1));
      }
    },
    // the world position of a point on the right palm (for the Sun to sit in), after pose() and updateMatrixWorld
    palmPoint(out, lift = 0.0) {
      const A = arms[0];
      A.hand.updateMatrixWorld(true);
      return out.set(0.017 + lift, -0.056, 0.004).applyMatrix4(A.hand.matrixWorld);
    },
    palmNormal(out) {
      const A = arms[0];
      const q = new THREE.Quaternion(); A.hand.getWorldQuaternion(q);
      return out.set(1, 0, 0).applyQuaternion(q).normalize();
    },
    setRim(r, g, b) { for (const m of mats) { if (!m.userData.uRim) m.userData.uRim = { value: new THREE.Color() }; m.userData.uRim.value.setRGB(r, g, b); } },
  };
}

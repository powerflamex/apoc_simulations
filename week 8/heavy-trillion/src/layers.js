// The named things you fall past in the rock, each at its real depth (timeline.js: D_SEWER, D_CAVE, D_MINE, D_KOLA),
// placed relative to you (your feet at y = 0, so a thing at depth D is at y = depthFeet - D) and streaming up past you:
//   the sewer: a brick pipe (2.4 m) crossing under the station, broken open where you go through it, water in it;
//   the cave: a groundwater cave ~32 m across, 28 m tall: wet rock, hanging stalactites, a waterfall, a lake on its
//     floor that you plunge through (bore.js opens the wall where the cave is);
//   the deepest mine ever dug (Mponeng, ~4 km): its levels, tunnels running off the shaft with rails and strip lights,
//     every 30 m from 3.69 to 4.02 km, flashing past;
//   the deepest hole ever drilled (Kola, 12,262 m): its drill pipe in the wall beside you, the bit at its end.
// The wall shader cuts its openings (CUTS, filled in frame()).
import * as THREE from 'three';
import { D_SEWER, D_CAVE, D_KOLA } from './timeline.js';
import { rng, smooth, clamp } from './util.js';

export const SEWER_R = 1.2;
export const CAVE = { a: 16, b: 14, dy: 0 };          // the cave's half-width and half-height (m); its middle at D_CAVE
export const MINE = [];                              // { D, a (angle of the tunnel), lit }
{
  const R = rng(4040);
  for (let D = 3690; D <= 4025; D += 30) MINE.push({ D, a: R() * Math.PI * 2, a2: R() < 0.5 ? null : R() * Math.PI * 2 });
}
export const NMINE = 6;                              // tunnel openings drawn at once (the nearest)

export function makeLayers(scene, RS) {
  const g = new THREE.Group();
  scene.add(g);
  // ---- shared: light from your glow and a fill from the camera, done per pixel ----
  const U = {
    uFeet: { value: new THREE.Color(1, 0.6, 0.3) }, uTime: { value: 0 }, uAmb: { value: 0.04 },
  };
  const LIGHT = /* glsl */ `
    uniform vec3 uFeet; uniform float uTime, uAmb;
    vec3 lightAt(vec3 p) {
      float df = length(p - vec3(0.0, -0.1, 0.0));
      float dc = length(p - cameraPosition);
      return uFeet * (1.2 / (1.0 + df * df * 0.08)) + vec3(0.85, 0.88, 1.0) * (0.9 / (1.0 + dc * dc * 0.05)) + uAmb;
    }
    float lh(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float ln(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(lh(i), lh(i + vec2(1, 0)), f.x), mix(lh(i + vec2(0, 1)), lh(i + vec2(1, 1)), f.x), f.y); }
  `;
  const VS = /* glsl */ `varying vec3 vW; varying vec3 vL; varying vec3 vN; void main() { vL = position; vN = normalize(mat3(modelMatrix) * normal);
    vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`;
  const mk = (frag, extra = {}) => new THREE.ShaderMaterial({ uniforms: U, vertexShader: VS, fragmentShader: LIGHT + frag, side: THREE.BackSide, ...extra });

  // ---- the sewer: an old brick pipe along x, its water ----
  const sewer = new THREE.Group();
  const brick = mk(/* glsl */ `varying vec3 vW; varying vec3 vL; varying vec3 vN;
    void main() {
      if (length(vW.xz) < ${RS.toFixed(2)}) discard;                 // (broken open where you went through)
      float a = atan(vL.z, vL.x);                     // round the pipe (vL.y runs along it)
      vec2 b = vec2(vL.y / 0.22, a * 1.2 / 0.075);
      b.x += step(1.0, mod(floor(b.y), 2.0)) * 0.5;
      vec2 f = fract(b);
      float mortar = 1.0 - smoothstep(0.0, 0.07, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y) * 3.0) );
      vec3 c = mix(vec3(0.42, 0.2, 0.13), vec3(0.55, 0.3, 0.18), lh(floor(b)));
      c = mix(c, vec3(0.3, 0.3, 0.28), mortar * 0.8);
      c *= mix(0.45, 1.0, smoothstep(-0.9, -0.3, cos(a)));     // slime and stain low down
      gl_FragColor = vec4(c * lightAt(vW), 1.0);
    }`);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(SEWER_R, SEWER_R, 60, 40, 1, true).rotateZ(Math.PI / 2), brick);
  // (rotateZ put the axis along x: the shader's vL is the rotated position, so rebuild the brick frame from it)
  brick.vertexShader = `varying vec3 vW; varying vec3 vL; varying vec3 vN; void main() { vL = vec3(position.y, -position.x, position.z); vN = normalize(mat3(modelMatrix) * normal);
    vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`;
  sewer.add(pipe);
  const waterMat = mk(/* glsl */ `varying vec3 vW; varying vec3 vL; varying vec3 vN;
    void main() {
      if (length(vW.xz) < ${RS.toFixed(2)}) discard;
      float n = ln(vec2(vW.x * 1.5 - uTime * 2.5, vW.z * 4.0)) * 0.6 + ln(vec2(vW.x * 4.0 - uTime * 4.0, vW.z * 9.0)) * 0.4;
      vec3 c = vec3(0.12, 0.13, 0.1) + vec3(0.25, 0.27, 0.22) * smoothstep(0.55, 0.9, n);
      gl_FragColor = vec4(c * lightAt(vW) + vec3(0.04), 1.0);
    }`, { side: THREE.DoubleSide });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(60, 2 * Math.sqrt(SEWER_R * SEWER_R - 0.8 * 0.8)).rotateX(-Math.PI / 2), waterMat);
  water.position.y = -0.8;
  sewer.add(water);
  g.add(sewer);

  // ---- the cave ----
  const cave = new THREE.Group();
  const caveGeo = new THREE.IcosahedronGeometry(1, 5);
  {
    const p = caveGeo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = 1 + 0.12 * Math.sin(v.x * 7 + v.y * 3) * Math.sin(v.z * 6 - v.y * 4) + 0.06 * Math.sin(v.x * 17 + v.z * 13);
      v.multiplyScalar(n);
      p.setXYZ(i, v.x * CAVE.a, v.y * CAVE.b, v.z * CAVE.a);
    }
    caveGeo.computeVertexNormals();
  }
  const rockMat = mk(/* glsl */ `varying vec3 vW; varying vec3 vL; varying vec3 vN;
    void main() {
      float n = ln(vL.xz * 0.7 + vL.y * 0.3) * 0.5 + ln(vL.xy * 2.1) * 0.3 + ln(vL.zy * 5.0) * 0.2;
      vec3 c = mix(vec3(0.2, 0.18, 0.16), vec3(0.42, 0.38, 0.33), n);
      c = mix(c, vec3(0.55, 0.5, 0.42), smoothstep(0.62, 0.7, ln(vec2(vL.y * 1.4, atan(vL.z, vL.x) * 3.0))) * 0.6);   // flowstone bands
      vec3 L = lightAt(vW);
      // wet: glints
      float wet = pow(ln(vL.xz * 9.0 + vL.y * 7.0), 14.0) * 0.8;
      gl_FragColor = vec4(c * L + wet * L * 0.25, 1.0);
    }`);
  cave.add(new THREE.Mesh(caveGeo, rockMat));
  // stalactites hanging from the roof
  const R = rng(91);
  const stalMat = new THREE.MeshStandardMaterial({ color: 0x9a8f80, roughness: 0.5 });
  const NST = 70;
  const stal = new THREE.InstancedMesh(new THREE.ConeGeometry(0.25, 1, 7).rotateX(Math.PI), stalMat, NST);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < NST; i++) {
    let x, z;
    do { const a = R() * Math.PI * 2, r = Math.sqrt(R()) * CAVE.a * 0.8; x = Math.cos(a) * r; z = Math.sin(a) * r; } while (Math.hypot(x, z) < RS + 1.2);
    const roof = CAVE.b * Math.sqrt(Math.max(0, 1 - (x * x + z * z) / (CAVE.a * CAVE.a))) * 0.95;
    const len = 0.6 + R() * 3.5, w = 0.4 + R() * 1.2;
    m4.makeScale(w, len, w).setPosition(x, roof - len / 2 + 0.2, z);
    stal.setMatrixAt(i, m4);
  }
  cave.add(stal);
  // the lake on its floor (you go through it: the bore opens under it) and a waterfall down one side
  const lakeMat = mk(/* glsl */ `varying vec3 vW; varying vec3 vL; varying vec3 vN;
    void main() {
      float r = length(vW.xz);
      float n = ln(vW.xz * 0.8 + uTime * 0.3) * 0.5 + ln(vW.xz * 3.0 - uTime * 0.5) * 0.5;
      vec3 c = mix(vec3(0.02, 0.07, 0.08), vec3(0.08, 0.2, 0.22), n);
      // ripples out from where you hit it
      c += vec3(0.25, 0.3, 0.3) * smoothstep(0.75, 0.95, sin(r * 4.0 - uTime * 9.0)) * exp(-r * 0.15);
      vec3 L = lightAt(vW);
      gl_FragColor = vec4(c * (0.4 + L) + uFeet * 0.25 * exp(-r * 0.25), 1.0);
    }`, { side: THREE.DoubleSide });
  const lakeY = -CAVE.b * 0.62;
  const lake = new THREE.Mesh(new THREE.RingGeometry(RS * 0.9, CAVE.a * 0.8, 48, 1).rotateX(-Math.PI / 2), lakeMat);
  lake.position.y = lakeY;
  cave.add(lake);
  const fallMat = mk(/* glsl */ `varying vec3 vW; varying vec3 vL; varying vec3 vN;
    void main() {
      float s = ln(vec2(vL.x * 6.0, vL.y * 0.6 + uTime * 6.0)) * 0.6 + ln(vec2(vL.x * 15.0, vL.y * 1.5 + uTime * 9.0)) * 0.4;
      float edge = smoothstep(1.3, 0.6, abs(vL.x));
      vec3 c = vec3(0.6, 0.7, 0.72) * smoothstep(0.35, 0.8, s);
      gl_FragColor = vec4(c * (0.3 + lightAt(vW)) * edge, edge * 0.85);
    }`, { side: THREE.DoubleSide, transparent: true, depthWrite: false });
  const wf = new THREE.Mesh(new THREE.PlaneGeometry(2.8, CAVE.b * 1.5, 1, 1), fallMat);
  wf.position.set(CAVE.a * 0.72, 0, -3);
  wf.rotation.y = -Math.PI / 2 + 0.3;
  cave.add(wf);
  g.add(cave);

  // ---- the mine's tunnels: boxes seen from inside, running out from the shaft ----
  const tunMat = mk(/* glsl */ `varying vec3 vW; varying vec3 vL; varying vec3 vN;
    void main() {
      // vL: x across, y up (floor -1.6), z along (0 at the shaft end, negative outward)
      float along = -vL.z;
      vec3 c = mix(vec3(0.3, 0.27, 0.23), vec3(0.45, 0.42, 0.36), ln(vec2(vL.x + vL.z * 0.3, vL.y) * 2.0));
      // rails on the floor, mesh and bolts on the walls
      float rail = (1.0 - smoothstep(0.02, 0.05, abs(abs(vL.x) - 0.45))) * step(vL.y, -1.55);
      c = mix(c, vec3(0.7, 0.68, 0.62), rail);
      c *= 0.85 + 0.15 * step(0.5, fract(vL.x * 6.0 + vL.y * 6.0));
      // strip lights along the roof every 4 m: bright, and the light they throw
      float k = fract(along / 4.0 + 0.5);
      float lamp = (1.0 - smoothstep(0.04, 0.12, abs(k - 0.5) * 4.0)) * step(1.5, vL.y) * (1.0 - smoothstep(0.1, 0.3, abs(vL.x)));
      float near = exp(-pow((k - 0.5) * 4.0, 2.0) * 0.6);
      vec3 lampC = vec3(1.0, 0.92, 0.75);
      vec3 col = c * (lampC * (0.45 + 0.9 * near) * exp(-along * 0.012) + lightAt(vW) * 0.5) + lampC * lamp * 4.0;
      gl_FragColor = vec4(col, 1.0);
    }`);
  const tunGeo = new THREE.BoxGeometry(3.0, 3.2, 60).translate(0, 0, -30 - RS + 0.05);
  const tunnels = [];
  for (let i = 0; i < NMINE; i++) { const m = new THREE.Mesh(tunGeo, tunMat); m.visible = false; g.add(m); tunnels.push(m); }

  // ---- the Kola drill pipe: in its 23 cm hole in the wall beside you, its tool joints every 9 m, the bit at the end ----
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x8a8a8c, roughness: 0.35, metalness: 0.85 });
  const PL = 400;
  const kola = new THREE.Group();
  const kpipe = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, PL, 16, 1).translate(0, PL / 2, 0), pipeMat);
  kola.add(kpipe);
  const joints = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 16), pipeMat, Math.ceil(PL / 9));
  for (let i = 0; i < joints.count; i++) joints.setMatrixAt(i, m4.makeTranslation(0, 4.5 + i * 9, 0));
  kola.add(joints);
  const bit = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10).scale(1, 0.8, 1), new THREE.MeshStandardMaterial({ color: 0x6a5a40, roughness: 0.4, metalness: 0.9 }));
  kola.add(bit);
  // the dark slot of its hole above the pipe, behind it
  g.add(kola);
  const kolaLight = new THREE.PointLight(0xfff0dd, 0, 8, 1.6);
  scene.add(kolaLight);

  const CUTS = { sewerY: -1e4, caveY: -1e4, mineY: new Float32Array(NMINE).fill(-1e4), mineA: new Float32Array(NMINE), kolaA: 0 };
  return {
    U, CUTS,
    // depthFeet: depth of your feet below the street (m); kolaA: the angle of the drill pipe round the shaft
    frame(v, depthFeet, feet, kolaA) {
      U.uFeet.value.copy(feet); U.uTime.value = v;
      U.uAmb.value = 0.04 + 0.1 * (1 - smooth(10, 25, Math.abs(depthFeet - D_CAVE)));
      // sewer
      const ys = depthFeet - D_SEWER;
      sewer.visible = Math.abs(ys) < 80;
      sewer.position.set(0, ys, 0);
      CUTS.sewerY = ys;
      // cave
      const yc = depthFeet - D_CAVE;
      cave.visible = Math.abs(yc) < 200;
      cave.position.set(0, yc, 0);
      CUTS.caveY = yc;
      // the mine: the nearest levels
      const near = MINE.flatMap((m) => [{ D: m.D, a: m.a }, ...(m.a2 !== null ? [{ D: m.D, a: m.a2 }] : [])])
        .map((m) => ({ ...m, y: depthFeet - m.D + 1.6 })).filter((m) => Math.abs(m.y) < 120).sort((a, b) => Math.abs(a.y) - Math.abs(b.y)).slice(0, NMINE);
      tunnels.forEach((t, i) => {
        const m = near[i];
        t.visible = !!m;
        CUTS.mineY[i] = m ? m.y : -1e4;
        if (!m) return;
        CUTS.mineA[i] = m.a;
        t.position.set(0, m.y, 0);
        t.rotation.set(0, -Math.PI / 2 - m.a, 0);   // the box's -z runs out along the angle a
      });
      // Kola: the pipe ends at D_KOLA; it reaches up from there
      const yk = depthFeet - D_KOLA;
      kola.visible = yk > -PL && yk < 300;
      kola.position.set(Math.cos(kolaA) * (RS + 0.02), yk, Math.sin(kolaA) * (RS + 0.02));
      bit.position.set(0, 0, 0);
      kolaLight.position.set(Math.cos(kolaA) * (RS - 0.6), 1.2, Math.sin(kolaA) * (RS - 0.6));
      kolaLight.intensity = kola.visible ? 1.2 : 0;
      CUTS.kolaA = kolaA;
    },
  };
}

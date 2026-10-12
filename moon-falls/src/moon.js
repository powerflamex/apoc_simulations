// The falling Moon, seen from the rooftop: a cratered full Moon that grows night by night (its real angular size
// for the distance in timeline.js), glowing cracks as it nears the Roche limit, then hundreds of pieces drifting
// apart into a cloud of rubble, pieces streaking down as meteors and flashing on the horizon, and the biggest piece
// coming down over the sea: a wall of fire. Drawn as far-away meshes (no fog), placed along the Moon's direction.
import * as THREE from 'three';
import { smooth, clamp, lerp, rng } from './util.js';
import { MOON_DIR, V_BREAK, V_METEORS, V_IMPACT, T_SWITCH, METEORS } from './timeline.js';

const D = 30000;   // drawing distance of the Moon (m); its radius is scaled to the right angular size
export const NOISE = /* glsl */ `
  float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float noise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.07 + 3.1; a *= 0.5; } return s; }
  // craters: a few octaves of round pits with bright rims
  float craters(vec3 p) {
    float c = 0.0;
    for (int o = 0; o < 3; o++) {
      float sc = 4.0 * pow(2.3, float(o));
      vec3 q = p * sc; vec3 cell = floor(q);
      for (int k = 0; k < 2; k++) {
        vec3 cc = cell + vec3(float(k) * 0.5);
        vec3 ctr = floor(cc) + vec3(hash13(floor(cc) + 1.3), hash13(floor(cc) + 2.7), hash13(floor(cc) + 4.1));
        float r = 0.15 + 0.3 * hash13(floor(cc) + 7.7);
        float d = length(q - ctr) / r;
        if (hash13(floor(cc) + 9.1) < 0.45) c += (smoothstep(1.0, 0.7, d) * -0.5 + smoothstep(0.8, 1.0, d) * smoothstep(1.25, 1.0, d) * 0.6) / (1.0 + float(o));
      }
    }
    return c;
  }
  float moonAlb(vec3 p) {
    float mare = smoothstep(0.42, 0.62, fbm(p * 1.6 + 2.0));
    return mix(0.62, 0.32, mare) * (0.85 + 0.3 * fbm(p * 9.0)) + craters(p) * 0.18;
  }
  float moonCrack(vec3 p, float t, float k) {
    float rid = 1.0 - abs(fbm(p * 3.2 + vec3(0.0, t * 0.02, 0.0)) * 2.0 - 1.0);
    float rid2 = 1.0 - abs(fbm(p * 7.5 + 5.0) * 2.0 - 1.0);
    return smoothstep(0.93 - 0.12 * k, 0.985, max(rid, rid2 * 0.97)) * k;
  }
`;
export const LOGV = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
`;

export function makeMoon(scene, glowTex) {
  const M = {};
  const dir = new THREE.Vector3(...MOON_DIR).normalize();
  const sunDir = dir.clone().multiplyScalar(-1).add(new THREE.Vector3(0.25, 0.2, 0.15)).normalize();   // lit from behind you: nearly full

  // ---------- the Moon ----------
  const U = { uSun: { value: sunDir }, uCrack: { value: 0 }, uTime: { value: 0 }, uFade: { value: 1 } };
  const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 160, 96), new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false,
    vertexShader: `varying vec3 vN; varying vec3 vObj;\n${LOGV}\nvoid main(){ vObj = position; vN = normalize(mat3(modelMatrix) * position); gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);\n#include <logdepthbuf_vertex>\n}`,
    fragmentShader: /* glsl */ `uniform vec3 uSun; uniform float uCrack; uniform float uTime; uniform float uFade; varying vec3 vN; varying vec3 vObj;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${NOISE}
      void main(){
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vN), p = normalize(vObj);
        float alb = moonAlb(p);
        float lit = max(dot(n, uSun), 0.0);
        vec3 col = vec3(0.98, 0.96, 0.92) * alb * (0.03 + 1.6 * lit);
        // the cracks: a web of glowing lines that widens and brightens as Earth's tides pull it apart
        float cr = moonCrack(p, uTime, uCrack);
        col = col * (1.0 - cr * 0.6) + vec3(1.0, 0.45, 0.12) * cr * (0.7 + 1.1 * uCrack);
        gl_FragColor = vec4(col, uFade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  moon.frustumCulled = false; moon.renderOrder = -5;
  scene.add(moon);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xcfd8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 }));
  halo.renderOrder = -6;
  scene.add(halo);
  // its light on the city (much brighter than a normal full Moon) is set by main.js via the world's moonLight

  // ---------- the pieces: rock chunks filling the Moon's volume, drifting apart after the break ----------
  const R = rng(1969), N = 320;
  const chunk = [];
  const T1 = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();   // along the horizon
  const T2 = new THREE.Vector3().crossVectors(T1, dir).normalize();
  const piece = (p, sz, flat = 1, q0 = null) => chunk.push({
    p, s: sz, flat, q0,
    // drift: mostly spread along the horizon (the rubble smears into a band), a little up/down and toward us
    v: new THREE.Vector3().addScaledVector(T1, (p.dot(T1) + (R() - 0.5) * 0.5) * 1.2).addScaledVector(T2, (p.dot(T2) + (R() - 0.5) * 0.3) * 0.4),
    spin: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(), sp: (R() - 0.5) * 1.2, ph: R() * 6.28,
  });
  for (let i = 0; i < N; i++) {
    let p; do { p = new THREE.Vector3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1); } while (p.lengthSq() > 1);
    const sz = i < 6 ? 0.3 + R() * 0.12 : 0.07 + Math.pow(R(), 2.5) * 0.2;
    if (p.length() + sz * 1.1 > 0.88) p.setLength(Math.max(0.02, 0.88 - sz * 1.1));   // (inside the skin, not poking out of the outline)
    piece(p, sz);
  }
  // a skin of plates over the side facing us: at the moment it breaks, the pieces cover the whole face
  for (let i = 0; i < 230; i++) {
    let p; do { p = new THREE.Vector3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1); } while (p.lengthSq() > 1 || p.lengthSq() < 0.05 || p.dot(dir) > 0.2 * p.length());
    p.setLength(0.9 + R() * 0.03);
    // turned so its flat side lies along the surface, then a random twist about the surface direction
    const q0 = new THREE.Quaternion().setFromAxisAngle(p.clone().normalize(), R() * 6.28).multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().normalize()));
    piece(p, 0.15 + R() * 0.07, 0.42, q0);
    chunk[chunk.length - 1].v.add(new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(1.1));   // (they scatter, not one expanding shell)
  }
  const NT = chunk.length;
  chunk[0].p.set(0.1, -0.2, 0.15); chunk[0].s = 0.42; chunk[0].v.set(0, 0, 0);   // the biggest piece (it falls on us)
  // a lumpy rock: a finely divided sphere pushed in and out by smooth noise (no spiky single vertices)
  const rockGeo = new THREE.IcosahedronGeometry(1, 4);
  {
    const pos = rockGeo.attributes.position, v = new THREE.Vector3();
    const lump = (x, y, z) => 0.5 * Math.sin(x * 2.1 + 1.3) * Math.sin(y * 1.7 + 0.4) * Math.sin(z * 2.3 + 2.1) + 0.25 * Math.sin(x * 4.3 + y * 3.1 + 0.7) * Math.sin(z * 3.7 - y * 2.2) + 0.12 * Math.sin(x * 9.1 - z * 7.3 + y * 5.5);
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); const k = 0.82 + 0.32 * lump(v.x, v.y, v.z); v.multiplyScalar(k); v.y *= 0.8; pos.setXYZ(i, v.x, v.y, v.z); }
    rockGeo.computeVertexNormals();
  }
  const heat = new THREE.InstancedBufferAttribute(new Float32Array(NT), 1);
  rockGeo.setAttribute('aHeat', heat);
  // where each piece sat inside the Moon (in Moon radii) and how it was turned at the break: the shader uses it to
  // paint each piece with the patch of the Moon's face it came from
  const homeA = new Float32Array(NT * 3), q0A = new Float32Array(NT * 4), sA = new Float32Array(NT), flA = new Float32Array(NT);
  chunk.forEach((c, i) => { if (!c.q0) c.q0 = new THREE.Quaternion().setFromAxisAngle(c.spin, c.ph); homeA.set([c.p.x, c.p.y, c.p.z], i * 3); q0A.set([c.q0.x, c.q0.y, c.q0.z, c.q0.w], i * 4); sA[i] = c.s; flA[i] = c.flat; });
  rockGeo.setAttribute('aFlat', new THREE.InstancedBufferAttribute(flA, 1));
  rockGeo.setAttribute('aHome', new THREE.InstancedBufferAttribute(homeA, 3));
  rockGeo.setAttribute('aQ0', new THREE.InstancedBufferAttribute(q0A, 4));
  rockGeo.setAttribute('aS', new THREE.InstancedBufferAttribute(sA, 1));
  const moonRotT = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.3, V_BREAK * 0.002, 0.2))).transpose();
  const rockSun = dir.clone().multiplyScalar(-0.35).add(new THREE.Vector3(0.9, 0.35, 0.1)).normalize();   // light from the side: crescent-lit rocks
  const CU = { uSun: { value: rockSun }, uHot: { value: 0 }, uMoonSun: { value: sunDir }, uMoonRotT: { value: moonRotT }, uLook: { value: 1 }, uInner: { value: 0 }, uTime: { value: 0 } };
  const rocks = new THREE.InstancedMesh(rockGeo, new THREE.ShaderMaterial({
    uniforms: CU,
    vertexShader: `attribute float aHeat; attribute vec3 aHome; attribute vec4 aQ0; attribute float aS; attribute float aFlat; varying float vHeat; varying vec3 vN; varying vec3 vObj; varying vec3 vM; varying vec3 vW;\n${LOGV}\nvoid main(){ vHeat = aHeat; vW = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz; vObj = position; vec3 pf = position * vec3(1.0, aFlat, 1.0); vM = aHome + (pf + 2.0 * cross(aQ0.xyz, cross(aQ0.xyz, pf) + aQ0.w * pf)) * aS; vN = normalize(mat3(modelMatrix * instanceMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);\n#include <logdepthbuf_vertex>\n}`,
    fragmentShader: /* glsl */ `uniform vec3 uSun; uniform float uHot; uniform vec3 uMoonSun; uniform mat3 uMoonRotT; uniform float uLook; uniform float uInner; uniform float uTime;
      varying float vHeat; varying vec3 vN; varying vec3 vObj; varying vec3 vM; varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${NOISE}
      void main(){
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vN);
        float alb = 0.11 * (0.6 + 0.7 * fbm(vObj * 3.0));
        vec3 col = vec3(0.95, 0.93, 0.9) * alb * (0.04 + 1.3 * max(dot(n, uSun), 0.0));
        // freshly broken faces still glow where they cracked
        // freshly broken faces glow along their cracks; the dark side has a faint orange rim (heat)
        float rid = 1.0 - abs(fbm(vObj * 2.6 + 4.0) * 2.0 - 1.0);
        float hot = smoothstep(0.955, 0.995, rid) * uHot;
        col += vec3(1.0, 0.42, 0.1) * hot * 1.3;
        col += vec3(0.9, 0.35, 0.1) * 0.06 * uHot * (1.0 - max(dot(n, uSun), 0.0));
        // a piece falling through the air: red-hot, brightest along its cracks
        // just after the break: the outside of each piece is still the Moon's face (the same craters and seas, lit like the
        // Moon), the broken inside glows molten; over the next seconds the pieces turn into dark tumbling rubble
        float L = length(vM);
        float surf = smoothstep(0.88, 0.93, L);
        if (uLook > 0.001) {
          vec3 mp = uMoonRotT * (vM / max(L, 1e-4));
          vec3 nn = normalize(mix(n, normalize(vM), surf * (0.35 + 0.65 * uLook)));
          vec3 face = vec3(0.98, 0.96, 0.92) * moonAlb(mp) * (0.03 + 1.35 * max(dot(nn, uMoonSun), 0.0));
          float cr = moonCrack(mp, uTime, 1.0);
          face = face * (1.0 - cr * 0.6) + vec3(1.0, 0.45, 0.12) * cr * 1.8;
          col = mix(col, face, surf * uLook);
        }
        col += vec3(1.0, 0.38, 0.08) * (1.0 - surf) * uInner * (0.5 + 0.9 * fbm(vObj * 4.0 + 2.0));
        // each slab's edges: dark where the rock turns away, with a molten seam that cools after the break
        float edge = 1.0 - smoothstep(0.1, 0.5, abs(dot(n, normalize(cameraPosition - vW))));
        col = col * (1.0 - 0.7 * edge) + vec3(1.0, 0.36, 0.07) * edge * uInner * 0.9;
        col = mix(col, vec3(1.0, 0.32, 0.06) * (1.0 + 1.2 * fbm(vObj * 5.0)), vHeat * 0.92) + vec3(1.0, 0.8, 0.45) * smoothstep(0.93, 0.99, rid) * vHeat * 1.5;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }), NT);
  rocks.frustumCulled = false; rocks.renderOrder = -4;
  scene.add(rocks);
  const breakGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff7a2a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  scene.add(breakGlow);
  const dust = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb070, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  scene.add(dust);

  // ---------- meteors: pieces burning in, streaking down to the horizon ----------
  const MET = METEORS;
  // which rocks fall: the bigger ones along the bottom and front of the cloud (where you can see them), the lowest
  // first, so every meteor is a rock you could already see in the rubble before it dropped out
  const cand = chunk.map((c, i) => { const p = c.p.clone().addScaledVector(c.v, 1.3); return { i, score: p.dot(T2) + 0.5 * p.dot(dir) - 4 * c.s }; })
    .filter((x) => x.i >= 6).sort((a, b) => a.score - b.score);
  const chunkOf = [];
  MET.map((m, i) => i).sort((a, b) => MET[a].t0 - MET[b].t0).forEach((mi, n) => { chunkOf[mi] = cand[n].i; });
  const metOf = new Map(chunkOf.map((ci, mi) => [ci, mi]));
  const K_END = Math.sqrt(1.45);   // (k where the end of the trail has followed the rock into the ground)
  const ENDS = MET.map((m) => new THREE.Vector3(m.x, 0, m.z));   // where each one lands
  const streakU = { uTime: { value: 0 } };
  const streakGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);   // y = 0 at the head (the rock), y = 1 at the end of the trail
  const streakMat = new THREE.ShaderMaterial({
    uniforms: streakU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv;\n${LOGV}\nvoid main(){ vUv = uv; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);\n#include <logdepthbuf_vertex>\n}`,
    fragmentShader: /* glsl */ `varying vec2 vUv;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        float x = (vUv.x - 0.5) * 2.0, along = clamp(vUv.y, 0.0, 1.0);     // along: 0 at the head, 1 at the tail end
        float w = mix(0.25, 1.0, 1.0 - along);
        float core = exp(-x * x / (w * w * 0.08));
        vec3 c = mix(vec3(1.0, 0.95, 0.85), vec3(1.0, 0.4, 0.08), along) * core * pow(max(1.0 - along, 0.0), 1.2) * 4.0;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const streaks = new THREE.InstancedMesh(streakGeo, streakMat, MET.length);
  streaks.frustumCulled = false;
  scene.add(streaks);
  const heads = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffe2b8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), MET.length);
  heads.frustumCulled = false;
  scene.add(heads);

  // ---------- the biggest piece and the wall of fire ----------
  const IMPACT = new THREE.Vector3(-dir.x, 0, -dir.z).normalize().multiplyScalar(-1).multiplyScalar(14000);   // on the horizon under the Moon
  IMPACT.y = 0;
  const fireU = { uT: { value: 0 }, uTime: { value: 0 } };
  const fire = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: fireU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vObj; varying vec3 vW;\n${LOGV}\nvoid main(){ vObj = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;\n#include <logdepthbuf_vertex>\n}`,
    fragmentShader: /* glsl */ `uniform float uT; uniform float uTime; varying vec3 vObj; varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${NOISE}
      void main(){
        #include <logdepthbuf_fragment>
        float n = fbm(vObj * 4.0 + vec3(0.0, -uTime * 0.6, 0.0)) * 0.7 + fbm(vObj * 11.0 - uTime) * 0.3;
        float h = vObj.y;
        vec3 c = mix(vec3(1.0, 0.95, 0.8), mix(vec3(1.0, 0.5, 0.12), vec3(0.45, 0.12, 0.05), h), smoothstep(0.2, 0.9, n + h * 0.4));
        float a = smoothstep(0.25, 0.6, n + 0.3 * (1.0 - h)) * smoothstep(0.0, 0.08, uT);
        gl_FragColor = vec4(c * a * (2.5 + 2.0 * (1.0 - h)), 1.0);
      }`,
  }));
  fire.position.copy(IMPACT);
  fire.frustumCulled = false; fire.visible = false;
  scene.add(fire);
  const impactFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff0d0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  impactFlash.position.copy(IMPACT).setY(400);
  scene.add(impactFlash);

  const dummy = new THREE.Object3D(), tmp = new THREE.Vector3(), q = new THREE.Quaternion();
  // how far the rubble has spread at time t (in Moon radii)
  const sepAt = (t) => smooth(V_BREAK, V_BREAK + 9, t) * 1.3 + Math.max(0, t - V_BREAK - 9) * 0.06;
  const mHead = MET.map(() => new THREE.Vector3()), mR = new Float32Array(MET.length), mHeat = new Float32Array(MET.length), mOn = new Uint8Array(MET.length);
  M.frame = (v, s, cam) => {
    const ang = s.moonAng;                         // angular radius (rad)
    const center = cam.position.clone().addScaledVector(dir, D);
    const R0 = D * Math.tan(ang);
    U.uCrack.value = s.crack; U.uTime.value = v;
    // the Moon itself: whole until the break, then it falls to pieces over ~2 s
    U.uFade.value = 1 - smooth(V_BREAK + 0.05, V_BREAK + 0.35, v);
    moon.visible = U.uFade.value > 0.002;
    moon.position.copy(center); moon.scale.setScalar(R0);
    moon.rotation.set(0.3, v * 0.002, 0.2);
    halo.position.copy(center); halo.scale.setScalar(R0 * (5.5 + 2 * s.crack)); halo.material.opacity = 0.55 * (0.5 + 0.5 * U.uFade.value);
    // the rubble: chunks appear as the Moon fades, then drift apart (the cloud keeps growing as it comes closer)
    const br = s.breakup, show = v > V_BREAK;
    const Rc = Math.min(R0, D * Math.tan(0.11));   // the rubble cloud's size (capped)
    // meteors: rocks that drop out of the cloud, heat up, and streak down to the horizon (a fire where each one lands)
    streakU.uTime.value = v;
    const hide = (i) => { dummy.scale.setScalar(0); dummy.updateMatrix(); streaks.setMatrixAt(i, dummy.matrix); heads.setMatrixAt(i, dummy.matrix); };
    MET.forEach((m, i) => {
      const k = (v - m.t0) / m.dur;
      const c = chunk[chunkOf[i]];
      const start = center.clone().addScaledVector(tmp.copy(c.p).addScaledVector(c.v, sepAt(m.t0)), Rc);   // where it was in the cloud
      const end = ENDS[i];
      mOn[i] = k > 0 && k < 1 ? 1 : k >= 1 ? 2 : 0;
      if (k <= 0 || k >= K_END) hide(i);
      else {
        const e = k * k;                              // slow as it drops out, speeding up as it falls
        const head = mHead[i].copy(start).lerp(end, Math.min(e, 1));   // (they fan out from the cloud toward where each one lands)
        const h = smooth(0.0, 0.4, k) * (1 - smooth(1, K_END, k));   // burning in: it glows and grows a trail; after it lands the trail runs into the ground and fades
        mHeat[i] = h;
        const r = Math.min(Rc * c.s, head.distanceTo(cam.position) * 0.06);   // (close ones capped so they don't fill the screen)
        mR[i] = r;
        const eb = Math.max(0, Math.min(e - 0.45, 1));
        const back = start.clone().lerp(end, eb);   // the trail reaches back toward the cloud
        const len = head.distanceTo(back);
        if (len > 5 && h > 0.001) {
          dummy.position.copy(head);
          const up = back.clone().sub(head).normalize();
          const toCam = cam.position.clone().sub(back).normalize();
          const side = new THREE.Vector3().crossVectors(up, toCam).normalize();
          const fwd = new THREE.Vector3().crossVectors(side, up);
          dummy.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, up, fwd));
          dummy.scale.set(r * 2.6 * h * Math.min(m.size, 1.6), len, 1);
          dummy.updateMatrix(); streaks.setMatrixAt(i, dummy.matrix);
        } else { dummy.scale.setScalar(0); dummy.updateMatrix(); streaks.setMatrixAt(i, dummy.matrix); }
        const burst = k > 1 ? 1 - smooth(1, K_END, k) : 0;   // the moment it hits: a bright pop at the ground
        dummy.position.copy(head); dummy.quaternion.copy(cam.quaternion); dummy.scale.setScalar(r * ((2 + 6 * h) * h + 10 * burst)); dummy.updateMatrix(); heads.setMatrixAt(i, dummy.matrix);
      }
      // (what happens when it lands: impacts.js)
    });
    rocks.visible = show;
    CU.uHot.value = show ? 1 - smooth(V_BREAK + 4, V_BREAK + 20, v) * 0.6 : 0;
    CU.uLook.value = 1 - smooth(V_BREAK + 1.5, V_BREAK + 8, v);   // the Moon's face on the pieces, fading into rubble
    CU.uInner.value = 1.6 * Math.exp(-Math.max(0, v - V_BREAK) * 0.35) * (1 - smooth(V_BREAK + 4, V_BREAK + 9, v)) * (show ? 1 : 0);   // the molten inside, cooling
    CU.uTime.value = v;
    { const t = v - V_BREAK; breakGlow.position.copy(center); breakGlow.scale.setScalar(R0 * (3 + 3 * smooth(0, 3, t))); breakGlow.material.opacity = t > -0.4 ? 0.45 * smooth(-0.4, 0.05, t) * Math.exp(-Math.max(0, t) * 0.9) : 0; }
    if (show) {
      const sep = sepAt(v);
      const thick = smooth(V_BREAK + 5, V_BREAK + 11, v);   // the thin plates of the Moon's crust tumble into chunky rocks
      chunk.forEach((c, i) => {
        const mi = metOf.get(i);
        let hot = 0;
        if (mi !== undefined && mOn[mi] === 2) dummy.scale.setScalar(0);   // it already fell
        else if (mi !== undefined && mOn[mi] === 1) {                       // falling right now
          dummy.position.copy(mHead[mi]); dummy.scale.set(mR[mi], mR[mi] * (c.flat + (1 - c.flat) * thick), mR[mi]); hot = 0.5 + 0.5 * mHeat[mi];
        } else {
          if (mi !== undefined) hot = 0.5 * smooth(MET[mi].t0 - 1.5, MET[mi].t0, v);   // it starts glowing in the cloud before it drops out
          const fall = i === 0 ? smooth(V_IMPACT - 8, V_IMPACT, v) : 0;   // the biggest piece leaves the cloud and comes down
          if (fall > 0) hot = 0.25 + 0.7 * smooth(0, 0.5, fall);   // ...red-hot as it tears through the air
          tmp.copy(c.p).addScaledVector(c.v, sep);
          dummy.position.copy(center).addScaledVector(tmp, Rc);
          if (fall > 0) dummy.position.lerp(IMPACT.clone().setY(Rc * c.s * 0.5), fall * fall);
          const sz = Rc * c.s * (i === 0 ? 1 + fall * 0.8 : 1);
          dummy.scale.set(sz, sz * (c.flat + (1 - c.flat) * thick), sz);
        }
        q.setFromAxisAngle(c.spin, (v - V_BREAK) * c.sp * (0.1 + hot * 0.8)).multiply(c.q0);
        dummy.quaternion.copy(q);
        dummy.updateMatrix();
        rocks.setMatrixAt(i, dummy.matrix);
        heat.setX(i, hot);
      });
      rocks.instanceMatrix.needsUpdate = true; heat.needsUpdate = true;
    }
    dust.position.copy(center); dust.scale.setScalar(Rc * (2 + 6 * br)); dust.material.opacity = 0.35 * smooth(V_BREAK, V_BREAK + 3, v) * (1 - smooth(V_BREAK + 6, V_BREAK + 16, v));
    streaks.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
    // the impact: a white flash, then a dome of fire rising and spreading toward us
    const it = v - V_IMPACT;
    fire.visible = it > 0;
    if (it > 0) { const r = 1500 + it * 2600 + it * it * 500; fire.scale.set(r, r * 0.55, r); fireU.uT.value = it; fireU.uTime.value = v; }
    impactFlash.material.opacity = it > 0 ? Math.exp(-it * 1.5) : 0;
    impactFlash.scale.setScalar(9000 + it * 9000);
    M.hitGlow = it > 0 ? Math.exp(-it * 0.4) : smooth(V_METEORS, V_IMPACT, v) * 0.3;
  };
  M.dir = dir;
  return M;
}

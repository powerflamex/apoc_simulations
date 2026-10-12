// The falling Moon, seen from the rooftop: a cratered full Moon that grows night by night (its real angular size
// for the distance in timeline.js), glowing cracks as it nears the Roche limit, then hundreds of pieces drifting
// apart into a cloud of rubble, pieces streaking down as meteors and flashing on the horizon, and the biggest piece
// coming down over the sea: a wall of fire. Drawn as far-away meshes (no fog), placed along the Moon's direction.
import * as THREE from 'three';
import { smooth, clamp, lerp, rng } from './util.js';
import { MOON_DIR, V_BREAK, V_METEORS, V_IMPACT, T_SWITCH } from './timeline.js';

const D = 30000;   // drawing distance of the Moon (m); its radius is scaled to the right angular size
const NOISE = /* glsl */ `
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
`;
const LOGV = /* glsl */ `
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
        float mare = smoothstep(0.42, 0.62, fbm(p * 1.6 + 2.0));
        float alb = mix(0.62, 0.32, mare) * (0.85 + 0.3 * fbm(p * 9.0)) + craters(p) * 0.18;
        float lit = max(dot(n, uSun), 0.0);
        vec3 col = vec3(0.98, 0.96, 0.92) * alb * (0.03 + 1.6 * lit);
        // the cracks: a web of glowing lines that widens and brightens as Earth's tides pull it apart
        float rid = 1.0 - abs(fbm(p * 3.2 + vec3(0.0, uTime * 0.02, 0.0)) * 2.0 - 1.0);
        float rid2 = 1.0 - abs(fbm(p * 7.5 + 5.0) * 2.0 - 1.0);
        float cr = smoothstep(0.93 - 0.12 * uCrack, 0.985, max(rid, rid2 * 0.97)) * uCrack;
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
  for (let i = 0; i < N; i++) {
    let p; do { p = new THREE.Vector3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1); } while (p.lengthSq() > 1);
    const big = i < 6;
    chunk.push({
      p, s: big ? 0.3 + R() * 0.12 : 0.07 + Math.pow(R(), 2.5) * 0.2,
      // drift: mostly spread along the horizon (the rubble smears into a band), a little up/down and toward us
      v: new THREE.Vector3().addScaledVector(T1, (p.dot(T1) + (R() - 0.5) * 0.5) * 1.2).addScaledVector(T2, (p.dot(T2) + (R() - 0.5) * 0.3) * 0.4),
      spin: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(), sp: (R() - 0.5) * 1.2, ph: R() * 6.28,
    });
  }
  chunk[0].p.set(0.1, -0.2, 0.15); chunk[0].s = 0.42; chunk[0].v.set(0, 0, 0);   // the biggest piece (it falls on us)
  // a lumpy rock: a finely divided sphere pushed in and out by smooth noise (no spiky single vertices)
  const rockGeo = new THREE.IcosahedronGeometry(1, 4);
  {
    const pos = rockGeo.attributes.position, v = new THREE.Vector3();
    const lump = (x, y, z) => 0.5 * Math.sin(x * 2.1 + 1.3) * Math.sin(y * 1.7 + 0.4) * Math.sin(z * 2.3 + 2.1) + 0.25 * Math.sin(x * 4.3 + y * 3.1 + 0.7) * Math.sin(z * 3.7 - y * 2.2) + 0.12 * Math.sin(x * 9.1 - z * 7.3 + y * 5.5);
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); const k = 0.82 + 0.32 * lump(v.x, v.y, v.z); v.multiplyScalar(k); v.y *= 0.8; pos.setXYZ(i, v.x, v.y, v.z); }
    rockGeo.computeVertexNormals();
  }
  const rockSun = dir.clone().multiplyScalar(-0.35).add(new THREE.Vector3(0.9, 0.35, 0.1)).normalize();   // light from the side: crescent-lit rocks
  const CU = { uSun: { value: rockSun }, uHot: { value: 0 } };
  const rocks = new THREE.InstancedMesh(rockGeo, new THREE.ShaderMaterial({
    uniforms: CU,
    vertexShader: `varying vec3 vN; varying vec3 vObj;\n${LOGV}\nvoid main(){ vObj = position; vN = normalize(mat3(modelMatrix * instanceMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);\n#include <logdepthbuf_vertex>\n}`,
    fragmentShader: /* glsl */ `uniform vec3 uSun; uniform float uHot; varying vec3 vN; varying vec3 vObj;
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
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }), N);
  rocks.frustumCulled = false; rocks.renderOrder = -4;
  scene.add(rocks);
  const dust = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb070, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  scene.add(dust);

  // ---------- meteors: pieces burning in, streaking down to the horizon ----------
  const MET = [];
  for (let i = 0; i < 70; i++) {
    const az = (R() - 0.5) * 1.9, t0 = V_METEORS + Math.pow(R(), 0.9) * (V_IMPACT - V_METEORS - 1.5);
    const near = R() < 0.25;   // some come down close: huge on screen
    MET.push({ az, t0, dur: 1.6 + R() * 1.4, dist: near ? 2500 + R() * 3000 : 6000 + R() * 14000, size: near ? 1.6 + R() * 0.8 : 0.8 + R() * 1.2, sideways: (R() - 0.5) * 0.25 });
  }
  const streakU = { uTime: { value: 0 } };
  const streakGeo = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0);
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
  const heads = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffe2b8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), MET.length);
  heads.frustumCulled = false;
  scene.add(heads);
  const flashes = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffa860, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), MET.length);
  flashes.frustumCulled = false;
  scene.add(flashes);

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
  M.frame = (v, s, cam) => {
    const ang = s.moonAng;                         // angular radius (rad)
    const center = cam.position.clone().addScaledVector(dir, D);
    const R0 = D * Math.tan(ang);
    U.uCrack.value = s.crack; U.uTime.value = v;
    // the Moon itself: whole until the break, then it falls to pieces over ~2 s
    U.uFade.value = 1 - smooth(V_BREAK + 0.3, V_BREAK + 2.2, v);
    moon.visible = U.uFade.value > 0.002;
    moon.position.copy(center); moon.scale.setScalar(R0);
    moon.rotation.set(0.3, v * 0.002, 0.2);
    halo.position.copy(center); halo.scale.setScalar(R0 * (5.5 + 2 * s.crack)); halo.material.opacity = 0.55 * (0.5 + 0.5 * U.uFade.value);
    // the rubble: chunks appear as the Moon fades, then drift apart (the cloud keeps growing as it comes closer)
    const br = s.breakup, show = v > V_BREAK + 0.2;
    const Rc = Math.min(R0, D * Math.tan(0.11));   // the rubble cloud's size (capped)
    rocks.visible = show;
    CU.uHot.value = show ? 1 - smooth(V_BREAK + 4, V_BREAK + 20, v) * 0.6 : 0;
    if (show) {
      const sep = br * 1.3 + Math.max(0, v - V_BREAK - 9) * 0.06;
      chunk.forEach((c, i) => {
        const fall = i === 0 ? smooth(V_IMPACT - 8, V_IMPACT, v) : 0;   // the biggest piece leaves the cloud and comes down
        tmp.copy(c.p).addScaledVector(c.v, sep);
        dummy.position.copy(center).addScaledVector(tmp, Rc);
        if (fall > 0) dummy.position.lerp(IMPACT.clone().setY(Rc * c.s * 0.5), fall * fall);
        const sz = Rc * c.s * (i === 0 ? 1 + fall * 0.8 : 1);
        dummy.scale.setScalar(sz * smooth(V_BREAK + 0.2, V_BREAK + 1.6, v));
        q.setFromAxisAngle(c.spin, c.ph + (v - V_BREAK) * c.sp * 0.1);
        dummy.quaternion.copy(q);
        dummy.updateMatrix();
        rocks.setMatrixAt(i, dummy.matrix);
      });
      rocks.instanceMatrix.needsUpdate = true;
    }
    dust.position.copy(center); dust.scale.setScalar(Rc * (2 + 6 * br)); dust.material.opacity = 0.35 * smooth(V_BREAK, V_BREAK + 3, v) * (1 - smooth(V_BREAK + 6, V_BREAK + 16, v));
    // meteors: from the rubble cloud down to the horizon, glowing streaks, a flash where each one lands
    streakU.uTime.value = v;
    MET.forEach((m, i) => {
      const k = (v - m.t0) / m.dur;
      const start = center.clone().addScaledVector(T1, Math.sin(m.az) * Rc * 3).addScaledVector(T2, -Rc * 0.4);
      const end = cam.position.clone().add(new THREE.Vector3(Math.sin(-m.az * 0.6 + 0.17) * -m.dist, 0, -Math.cos(-m.az * 0.6 + 0.17) * m.dist)).setY(0);
      if (k < 0 || k > 1) { dummy.scale.setScalar(0); dummy.updateMatrix(); streaks.setMatrixAt(i, dummy.matrix); heads.setMatrixAt(i, dummy.matrix); }
      else {
        const e = k * k;                              // speeding up as it falls
        const head = start.clone().lerp(end, e);
        const back = start.clone().lerp(end, Math.max(0, e - 0.35));
        const len = head.distanceTo(back);
        if (!(len > 5)) { dummy.scale.setScalar(0); dummy.updateMatrix(); streaks.setMatrixAt(i, dummy.matrix); heads.setMatrixAt(i, dummy.matrix); flashes.setMatrixAt(i, dummy.matrix); return; }
        dummy.position.copy(back);
        const up = back.clone().sub(head).normalize();
        const toCam = cam.position.clone().sub(back).normalize();
        const side = new THREE.Vector3().crossVectors(up, toCam).normalize();
        const fwd = new THREE.Vector3().crossVectors(side, up);
        dummy.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, up.clone().negate(), fwd));
        dummy.scale.set(Math.min(len * 0.1, 2600) * m.size, len, 1);
        dummy.updateMatrix(); streaks.setMatrixAt(i, dummy.matrix);
        dummy.position.copy(head); dummy.quaternion.copy(cam.quaternion); dummy.scale.setScalar(Math.min(len * 0.32, 7000) * m.size); dummy.updateMatrix(); heads.setMatrixAt(i, dummy.matrix);
      }
      const f = v - (m.t0 + m.dur);
      // the landing: a big flash, then a fire that keeps burning on the horizon
      if (f > 0) { const sz = m.dist * 0.16 * m.size * ((0.5 + f) * Math.exp(-f * 1.2) + 0.35 * Math.min(f, 1)); dummy.position.copy(end).setY(sz * 0.18); dummy.quaternion.copy(cam.quaternion); dummy.scale.set(sz * 1.5, sz * 0.6, 1); }
      else dummy.scale.setScalar(0);
      dummy.updateMatrix(); flashes.setMatrixAt(i, dummy.matrix);
    });
    streaks.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = flashes.instanceMatrix.needsUpdate = true;
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

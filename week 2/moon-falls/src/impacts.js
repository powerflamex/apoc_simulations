// What each falling piece does when it lands (times and places in timeline.js METEORS): a flash that lights up the
// city, a column of fire and debris climbing into a mushroom of smoke (spray and steam where it hits the water),
// fires left burning on the ground, and a shockwave racing across the water toward you. Everything stays, so the
// horizon fills up with fire and smoke as the hits come closer.
import * as THREE from 'three';
import { smooth, clamp } from './util.js';
import { METEORS, KINDS } from './timeline.js';
import { NOISE, LOGV } from './moon.js';

const plumeMat = new THREE.ShaderMaterial({
  uniforms: { uAge: { value: 0 }, uWater: { value: 0 }, uSeed: { value: 0 }, uCap: { value: 0 }, uTime: { value: 0 } },
  transparent: true, depthWrite: false,
  // the surface billows: pushed in and out by slowly churning noise
  vertexShader: `uniform float uSeed; uniform float uTime; varying vec3 vObj; varying vec3 vN; varying vec3 vView;\n${NOISE}\n${LOGV}\nvoid main(){
    vec3 p = position;
    float d = fbm(p * 2.2 + vec3(uSeed, -uTime * 0.12, uSeed * 0.5)) - 0.5;
    p += normal * d * 0.55;
    vObj = position; vec4 w = modelMatrix * vec4(p, 1.0); vN = normalize(mat3(modelMatrix) * normal); vView = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w;\n#include <logdepthbuf_vertex>\n}`,
  fragmentShader: /* glsl */ `uniform float uAge; uniform float uWater; uniform float uSeed; uniform float uCap; uniform float uTime;
    varying vec3 vObj; varying vec3 vN; varying vec3 vView;
    #include <common>
    #include <logdepthbuf_pars_fragment>
    ${NOISE}
    void main(){
      #include <logdepthbuf_fragment>
      float h = vObj.y * 0.5 + 0.5;                                   // 0 at the bottom .. 1 at the top of this piece
      vec3 q = vObj * vec3(1.6, 1.0, 1.6) + vec3(uSeed, -uTime * 0.18, uSeed * 0.7);
      float n = fbm(q * 2.0) * 0.6 + fbm(q * 6.0 + 7.0) * 0.4;
      float rim = abs(dot(normalize(vN), vView));                      // soft, ragged edges
      float a = smoothstep(0.36, 0.66, n + 0.3 * rim) * smoothstep(0.05, 0.55, rim) * 0.92;
      // fire for a moment, then it cools from the top down into dark smoke; the base keeps glowing
      float cool = clamp(uAge * 0.55 + h * 1.1 - 0.35 + uCap * 0.5, 0.0, 1.0);
      vec3 hot = mix(vec3(2.6, 1.9, 1.1), vec3(1.6, 0.5, 0.1), smoothstep(0.0, 1.0, uAge * 1.2 + h * 0.6));
      vec3 smoke = mix(vec3(0.32, 0.1, 0.03), vec3(0.05, 0.04, 0.038), smoothstep(0.1, 0.7, h + uCap * 0.4));
      vec3 c = mix(hot, smoke, cool);
      c += vec3(1.4, 0.4, 0.08) * pow(n, 3.0) * (1.0 - h) * (1.0 - uCap) * 1.2;   // embers glowing low in the column
      if (uWater > 0.5) {   // water: white spray at first, then grey steam, lit orange from below
        vec3 spray = mix(vec3(1.3, 1.25, 1.2), mix(vec3(0.16, 0.15, 0.15), vec3(0.08, 0.075, 0.075), h), smoothstep(0.0, 1.0, uAge * 0.7 + h * 0.4 + uCap * 0.5));
        c = mix(spray, vec3(1.2, 0.5, 0.18), (1.0 - h) * 0.35 * exp(-uAge * 0.5));
        a *= 1.0 - smoothstep(2.0, 7.0, uAge);   // the steam clears
      }
      a *= 1.0 - 0.6 * smoothstep(5.0, 15.0, uAge) * uCap;   // the smoke spreads thin (so the sky doesn't clog up)
      gl_FragColor = vec4(c, a);
    }`,
});
const ringMat = new THREE.ShaderMaterial({
  uniforms: { uFade: { value: 0 }, uWidth: { value: 0.03 } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: `varying vec2 vUv;\n${LOGV}\nvoid main(){ vUv = uv; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);\n#include <logdepthbuf_vertex>\n}`,
  fragmentShader: /* glsl */ `uniform float uFade; uniform float uWidth; varying vec2 vUv;
    #include <common>
    #include <logdepthbuf_pars_fragment>
    void main(){
      #include <logdepthbuf_fragment>
      float d = length(vUv * 2.0 - 1.0);
      float front = exp(-pow((d - 0.985) / uWidth, 2.0));              // the bright front of the shockwave
      float wake = smoothstep(0.6, 0.985, d) * (1.0 - smoothstep(0.985, 1.0, d)) * 0.18;   // churned water behind it
      gl_FragColor = vec4(vec3(2.2, 1.6, 1.1) * (front + wake) * uFade, 1.0);
    }`,
});

export function makeImpacts(scene, glowTex) {
  const I = { flash: 0 };
  const sphere = new THREE.SphereGeometry(1, 48, 32);
  const flat = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const P = METEORS.map((m, i) => {
    const K = KINDS[m.kind];
    const mk = (cap) => { const mat = plumeMat.clone(); mat.uniforms.uSeed.value = i * 3.7 + cap; mat.uniforms.uCap.value = cap; mat.uniforms.uWater.value = K.water ? 1 : 0; const o = new THREE.Mesh(sphere, mat); o.frustumCulled = false; o.visible = false; scene.add(o); return o; };
    const glow = (color) => { const o = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 })); scene.add(o); return o; };
    let ring = null;
    if (K.ring) { ring = new THREE.Mesh(flat, ringMat.clone()); ring.frustumCulled = false; ring.visible = false; scene.add(ring); }
    return { m, K, stem: mk(0), cap: mk(1), flash: glow(0xffe8c8), fire: glow(0xff6a1e), ring };
  });
  const hitLight = new THREE.DirectionalLight(0xffa060, 0);
  scene.add(hitLight, hitLight.target);
  const tmp = new THREE.Vector3();

  I.frame = (v, s, cam) => {
    let flash = 0, burning = 0, lx = 0, lz = 0, lw = 0;
    for (const p of P) {
      const { m, K } = p, a = v - m.land;
      const on = a > 0;
      p.stem.visible = p.cap.visible = on;
      if (!on) { p.flash.material.opacity = p.fire.material.opacity = 0; if (p.ring) p.ring.visible = false; continue; }
      // the column: shoots up fast, keeps climbing slowly; the cap spreads into a mushroom of smoke
      const Hs = K.H * (0.15 + 0.85 * (1 - Math.exp(-a * 0.9))) * (1 + a * 0.012);
      const Ws = K.W * (0.3 + 0.7 * smooth(0, 1.2, a)) * (1 + a * 0.02);
      p.stem.position.set(m.x, Hs * 0.5 - K.W * 0.08, m.z); p.stem.scale.set(Ws * 0.5, Hs * 0.55, Ws * 0.5);
      const Wc = K.W * (0.45 + 1.1 * smooth(0.3, 4, a) + a * 0.04);
      p.cap.position.set(m.x, Hs * 0.98, m.z); p.cap.scale.set(Wc, Wc * 0.42, Wc);
      for (const o of [p.stem, p.cap]) { o.material.uniforms.uAge.value = a; o.material.uniforms.uTime.value = v; }
      // the flash, then fires left burning at the foot of the column
      const f = Math.exp(-a * 2.6) * smooth(0, 0.04, a);
      p.flash.position.set(m.x, K.W * 0.2, m.z); p.flash.scale.setScalar(K.W * (3 + 5 * (1 - f))); p.flash.material.opacity = f * 0.9;
      const fl = 0.75 + 0.25 * Math.sin(v * 7.3 + m.x) * Math.sin(v * 4.1 + m.z);
      p.fire.position.set(m.x, K.W * 0.12, m.z); p.fire.scale.set(K.W * 2.6, K.W * 0.9, 1); p.fire.material.opacity = smooth(0.1, 1.0, a) * 0.4 * fl;
      // the shockwave across the water
      if (p.ring) {
        const sp = Math.max(700, m.dist / 4), r = a * sp;
        p.ring.visible = r < m.dist + 300;
        p.ring.position.set(m.x, s.sea + 1.2, m.z); p.ring.scale.setScalar(Math.max(r, 1));
        p.ring.material.uniforms.uFade.value = (1 - smooth(m.dist * 0.6, m.dist + 300, r)) * (0.6 + 0.4 * Math.exp(-a)) * smooth(0, 0.2, a);
        p.ring.material.uniforms.uWidth.value = clamp(40 / Math.max(r, 1), 0.006, 0.05);
      }
      const w = (0.25 + 0.75 * Math.min(m.amp, 1));
      flash += w * f;
      burning += smooth(0, 2, a) * w;
      const k = w * (f + 0.15) / Math.max(m.dist / 3000, 1);
      lx += (m.x - cam.position.x) * k / m.dist; lz += (m.z - cam.position.z) * k / m.dist; lw += k;
    }
    // the city lit up by each flash, then the orange glow of everything burning on the horizon
    if (lw > 0) {
      tmp.set(lx / lw, 0.12, lz / lw).normalize();
      hitLight.position.copy(cam.position).addScaledVector(tmp, 200); hitLight.target.position.copy(cam.position);
    }
    hitLight.intensity = flash * 2.2 + Math.min(burning, 8) * 0.1;
    I.flash = Math.min(flash, 1);
  };
  return I;
}

// The rain, on the world clock: while time runs each drop is a short bright streak (its motion in 1/50 s); as time
// stops the streaks shrink to beads that hang in the air, glinting with the screens' colours (a bright rim and a
// highlight, like a tiny lens). Drops are fixed in the world and wrapped round the camera (two layers: a dense one
// close by, a sparse one out to ~40 m), so the camera can move through the frozen rain. Drops inside a
// searchlight's beam light up. A third set is the spray off the taxi's wheels through the puddle (ballistic).
import * as THREE from 'three';
import { rng } from './util.js';
import { SPLASH, LANES_CAR } from './street.js';
import { W0 } from './timeline.js';

const FALL = 8.5, SHUTTER = 1 / 50, G = 9.81;

export function makeRain(scene, SU) {
  const U = {
    uW: SU.uW, uRate: SU.uRate, uCones: SU.uCones, uConeH: SU.uConeH, uFogC: SU.uFogC, uFogD: SU.uFogD,
    uCam: { value: new THREE.Vector3() }, uPx: { value: 0.001 }, uBox: { value: new THREE.Vector3(10, 8, 10) },
    uBright: { value: 1 }, uSpray: { value: 0 },
  };
  const vert = /* glsl */ `
    attribute vec4 aP; attribute vec4 aV;
    uniform float uW; uniform float uRate; uniform vec3 uCam; uniform float uPx; uniform vec3 uBox; uniform float uSpray;
    uniform vec4 uCones[3]; uniform vec3 uConeH[3]; uniform float uFogD;
    varying vec2 vQ; varying vec3 vK; varying float vRound; varying float vLenR;
    float h11(float x) { return fract(sin(x * 91.17) * 43758.5453); }
    void main() {
      vec3 p; vec3 vel; float r = aP.w;
      if (uSpray > 0.5) {
        // spray: launched at aV.w (world time) from aP with velocity aV.xyz
        float t = uW - aV.w;
        p = aP.xyz + aV.xyz * t; p.y -= 0.5 * ${G.toFixed(2)} * t * t;
        vel = aV.xyz; vel.y -= ${G.toFixed(2)} * t;
        r = 0.0025 + 0.003 * h11(aP.w * 77.0);
        if (t < 0.0 || t > 1.4 || p.y < 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
      } else {
        // falling drops, wrapped in a box round the camera (wind drifts them a little to the east)
        vel = vec3(0.9, -${FALL.toFixed(2)}, 0.3);
        p = aP.xyz + vel * uW;
        vec3 lo = uCam - uBox * vec3(0.5, 0.35, 0.5);
        p = lo + mod(p - lo, uBox);
        if (p.y < 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
      }
      vec4 c = viewMatrix * vec4(p, 1.0);
      float d = -c.z;
      if (d < 0.06) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
      // the streak: the drop's motion over the shutter, in view space (shrinks to nothing as time stops)
      vec3 mv = mat3(viewMatrix) * vel * ${SHUTTER.toFixed(4)} * uRate;
      vec2 ax = length(mv.xy) > 1e-6 ? normalize(mv.xy) : vec2(0.0, 1.0);
      float halfL = max(r, 0.5 * length(mv.xy));
      // never thinner than ~1.1 px; a drop smaller than that is dimmed instead (same light spread wider)
      float px = d * uPx;
      float wR = max(r, 0.55 * px), lR = max(halfL, 0.55 * px);
      float energy = (r * r) / (wR * lR) * mix(1.0, 2.5, smoothstep(1.5, 6.0, halfL / r));
      vRound = smoothstep(2.5, 1.2, lR / wR);
      vLenR = lR / wR;
      vec2 side = vec2(ax.y, -ax.x);
      c.xy += ax * position.y * lR * 1.15 + side * position.x * wR * 1.15;
      vQ = position.xy * 1.15;
      // its light: the screens' colours (by where it hangs), brighter near the camera where its rim reads;
      // inside a searchlight's beam it shines white
      float hue = h11(aP.x * 3.1 + aP.z * 7.7);
      vec3 neon = hue < 0.33 ? vec3(1.0, 0.35, 0.75) : hue < 0.66 ? vec3(0.4, 0.75, 1.0) : vec3(1.0, 0.85, 0.6);
      vec3 k = mix(vec3(0.75, 0.8, 0.95), neon, 0.6) * 1.0;
      for (int i = 0; i < 3; i++) {
        vec4 cn = uCones[i];
        if (cn.w <= 0.0) continue;
        vec3 a = uConeH[i], b = vec3(cn.x, 0.0, cn.y);
        vec3 ab = b - a; float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
        float rr = mix(0.3, cn.z * 1.1, t);
        float dd = length(p - (a + ab * t));
        k += vec3(5.0, 5.2, 5.6) * exp(-dd * dd / (rr * rr)) * cn.w;
      }
      float fog = 1.0 - exp(-uFogD * uFogD * d * d);
      vK = k * energy * (1.0 - fog) * (uSpray > 0.5 ? 1.6 : 1.0);
      gl_Position = projectionMatrix * c;
    }`;
  const frag = /* glsl */ `
    uniform float uBright;
    varying vec2 vQ; varying vec3 vK; varying float vRound; varying float vLenR;
    void main() {
      float r = length(vQ);
      if (r > 1.0) discard;
      // a streak: a soft line; a bead: a dark-centred lens with a bright rim and a highlight up and to the left
      float streak = exp(-vQ.x * vQ.x * 4.0) * (1.0 - smoothstep(0.6, 1.0, abs(vQ.y)));
      float rim = smoothstep(0.55, 0.9, r) * (1.0 - smoothstep(0.9, 1.0, r));
      float hl = exp(-dot(vQ - vec2(-0.32, 0.35), vQ - vec2(-0.32, 0.35)) * 40.0);
      float bead = 0.08 * (1.0 - r * r) + 0.7 * rim + 1.6 * hl;
      float a = mix(streak * 0.9, bead, vRound);
      gl_FragColor = vec4(vK * a * uBright, 1.0);
    }`;
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const quad = new THREE.PlaneGeometry(2, 2);
  const layer = (n, box, seed) => {
    const R = rng(seed);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index; geo.attributes.position = quad.attributes.position;
    const aP = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { aP[i * 4] = R() * box.x; aP[i * 4 + 1] = R() * box.y; aP[i * 4 + 2] = R() * box.z; aP[i * 4 + 3] = 0.0018 + 0.003 * Math.pow(R(), 2); }
    geo.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 4));
    geo.setAttribute('aV', new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4));
    geo.instanceCount = n;
    const m = new THREE.Mesh(geo, mat.clone());
    m.material.uniforms = { ...U, uBox: { value: box.clone() }, uSpray: { value: 0 } };
    m.frustumCulled = false; m.renderOrder = 7;
    scene.add(m);
    return m;
  };
  const near = layer(60000, new THREE.Vector3(12, 9, 12), 7);
  const far = layer(30000, new THREE.Vector3(70, 34, 70), 8);
  // the spray off the splash taxi's plaza-side wheels while they cross the puddle (z -3.4 .. 0.6 at the wheel)
  const spray = (() => {
    const c = SPLASH.car, R = rng(99);
    const pts = [];
    // the wheel's z at world time W: z0 + sp (W - W0) + offset (front: +len/2 - 0.82; rear: -len/2 + 0.82)
    for (const off of [c.len / 2 - 0.82, -c.len / 2 + 0.82]) {
      const wz0 = c.z + off;
      const tA = W0 + (-3.4 - wz0) / c.sp, tB = W0 + (0.6 - wz0) / c.sp;
      for (let i = 0; i < 2600; i++) {
        const t = tA + R() * (tB - tA);
        const z = wz0 + c.sp * (t - W0);
        const sp = 1.8 + 4.2 * Math.pow(R(), 1.5), a = (R() - 0.5) * 1.2;
        pts.push([c.x - 0.86, 0.05 + R() * 0.12, z + (R() - 0.5) * 0.3, R(), -Math.cos(a) * sp, 1.2 + R() * 3.2, Math.sin(a) * sp * 0.6 + c.sp * 0.6, t]);
      }
    }
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index; geo.attributes.position = quad.attributes.position;
    const aP = new Float32Array(pts.length * 4), aV = new Float32Array(pts.length * 4);
    pts.forEach((p, i) => { aP.set(p.slice(0, 4), i * 4); aV.set(p.slice(4, 8), i * 4); });
    geo.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 4));
    geo.setAttribute('aV', new THREE.InstancedBufferAttribute(aV, 4));
    geo.instanceCount = pts.length;
    const m = new THREE.Mesh(geo, mat.clone());
    m.material.uniforms = { ...U, uSpray: { value: 1 } };
    m.frustumCulled = false; m.renderOrder = 7;
    scene.add(m);
    return m;
  })();
  const all = [near, far, spray];
  return {
    meshes: all,
    set visible(on) { for (const m of all) m.visible = on; },
    update(camera, pxPerRad, bright = 1) {
      for (const m of all) {
        m.material.uniforms.uCam.value.copy(camera.position);
        m.material.uniforms.uPx.value = pxPerRad;
        m.material.uniforms.uBright.value = bright;
      }
    },
  };
}

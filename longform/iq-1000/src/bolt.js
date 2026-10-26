// The lightning bolt over the far skyline, straight down the avenue (~2 km away). Built once as a branching
// channel: every point knows how far down the leader has to come to reach it, so s.leader (0..1) reveals it the way
// a stepped leader crawls down the sky (~30 ms in reality, ~8 s at 280x), its tips brightest. At the return stroke
// (s.flash) the main channel to the ground blazes, the branches less; between strokes it keeps a dim glow (s.channel).
// Drawn as camera-facing ribbons, additive.
import * as THREE from 'three';
import { rng } from './util.js';

export const BOLT_TOP = new THREE.Vector3(-70, 1250, -2150), BOLT_GROUND = new THREE.Vector3(-10, 0, -1980);

export function makeBolt(scene) {
  const r = rng(4242);
  const segs = [];   // [a, b, arrivalA, arrivalB, main]
  let maxArr = 0;
  function walk(from, dir, length, arr0, main, depth) {
    let p = from.clone(), arr = arr0;
    const n = Math.max(3, Math.round(length / (main ? 28 : 18)));
    const step = length / n;
    const d = dir.clone();
    for (let i = 0; i < n; i++) {
      // jagged: each step kinks, but the channel keeps its overall heading
      const kink = new THREE.Vector3((r() - 0.5) * 1.3, (r() - 0.5) * 0.4, (r() - 0.5) * 0.9);
      const sd = d.clone().add(kink).normalize();
      if (main) sd.lerp(BOLT_GROUND.clone().sub(p).normalize(), 0.35).normalize();
      const q = p.clone().addScaledVector(sd, step * (0.7 + 0.6 * r()));
      if (main && i === n - 1) q.copy(BOLT_GROUND);
      const arr2 = arr + p.distanceTo(q);
      segs.push([p.clone(), q.clone(), arr, arr2, main ? 1 : 0.55 / (depth + 1)]);
      maxArr = Math.max(maxArr, arr2);
      // branches fork off downward and sideways
      if (depth < 2 && r() < (main ? 0.22 : 0.12)) {
        const bd = new THREE.Vector3((r() - 0.5) * 2.2, -0.6 - r() * 0.6, (r() - 0.5) * 0.8).normalize();
        walk(q, bd, (main ? 180 : 90) + r() * (main ? 380 : 160), arr2, false, depth + 1);
      }
      p = q; arr = arr2;
    }
    return arr;
  }
  const mainLen = walk(BOLT_TOP, BOLT_GROUND.clone().sub(BOLT_TOP).normalize(), BOLT_TOP.distanceTo(BOLT_GROUND) * 1.05, 0, true, 0);

  const n = segs.length;
  const pos = new Float32Array(n * 4 * 3), other = new Float32Array(n * 4 * 3), info = new Float32Array(n * 4 * 3);
  const idx = [];
  segs.forEach(([a, b, aa, ab, w], i) => {
    for (let k = 0; k < 4; k++) {
      const end = k < 2 ? a : b, oth = k < 2 ? b : a;
      pos.set([end.x, end.y, end.z], (i * 4 + k) * 3);
      other.set([oth.x, oth.y, oth.z], (i * 4 + k) * 3);
      info.set([k % 2 ? 1 : -1, k < 2 ? aa : ab, w], (i * 4 + k) * 3);
    }
    const o = i * 4;
    idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aOther', new THREE.BufferAttribute(other, 3));
  g.setAttribute('aInfo', new THREE.BufferAttribute(info, 3));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uFront: { value: 0 }, uMain: { value: mainLen }, uChannel: { value: 0 }, uLeaderOn: { value: 0 }, uWidth: { value: 5.0 } },
    vertexShader: /* glsl */ `
      attribute vec3 aOther; attribute vec3 aInfo;
      uniform float uFront, uWidth;
      varying float vSide; varying float vArr; varying float vW;
      void main() {
        vec3 p = position;
        vec3 dir = normalize(aOther - p);
        vec3 toCam = normalize(cameraPosition - p);
        vec3 side = normalize(cross(dir, toCam));
        float dist = length(cameraPosition - p);
        // at least ~2 px wide whatever the distance
        float w = max(uWidth * (0.4 + 0.6 * aInfo.z), dist * 0.0016) * 6.0;
        p += side * aInfo.x * w;
        vSide = aInfo.x; vArr = aInfo.y; vW = aInfo.z;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uFront, uMain, uChannel, uLeaderOn;
      varying float vSide; varying float vArr; varying float vW;
      void main() {
        // the core and a soft glow across the ribbon
        float x = abs(vSide);
        float core = smoothstep(0.22, 0.0, x), glow = pow(1.0 - x, 2.0);
        // the leader: only what it has reached, its tips the brightest
        float reached = step(vArr, uFront);
        float tip = exp(-(uFront - vArr) / 25.0);
        float lead = reached * uLeaderOn * (0.7 + 2.6 * tip) * (0.4 + 0.6 * vW);
        // the strokes: the main channel to the ground blazes, branches dimmer
        float isMain = step(0.99, vW);
        float stroke = uChannel * (isMain * 1.0 + (1.0 - isMain) * 0.35 * vW / 0.55);
        float I = max(lead, stroke * 3.5);
        vec3 col = vec3(0.8, 0.84, 1.0) * (core * 6.0 + glow * 0.5) * I;
        if (dot(col, vec3(1.0)) < 0.002) discard;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -5;
  scene.add(mesh);
  return {
    mesh,
    frame(s) {
      mesh.visible = s.boltOn > 0.001;
      const u = mat.uniforms;
      // the leader front: how far down it has come (it reaches the ground at the stroke)
      u.uFront.value = s.leader * mainLen * 1.02 + (s.channel > 0 ? 1e6 : 0);
      u.uLeaderOn.value = s.boltOn * (s.channel > 0 ? 0.2 : 1);
      u.uChannel.value = s.channel;
    },
  };
}

// The rain, as a pure function of world time w: drops fall at 9 m/s in a box over the plaza and the street, looping
// top to bottom. Each drop is a camera-facing quad stretched along its fall by what your eye smears in one frame
// (1/30 of a felt second = s.exp world seconds): long streaks at normal speed, short dashes at 8x, round glinting
// beads once you think 30x faster. A near layer is denser (the drops you see up close); splashes on the ground are
// tiny crowns that last ~30 ms (a flicker at normal speed, frozen crowns later).
import * as THREE from 'three';
import { rng } from './util.js';

const FALL = 9.0;

function layer(n, box, seed, sizeMm, beadA = 1, minPx = 1.4) {
  const r = rng(seed);
  const base = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
  const a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    a[i * 4] = box.x0 + r() * (box.x1 - box.x0);
    a[i * 4 + 1] = r();                                   // phase along the fall
    a[i * 4 + 2] = box.z0 + r() * (box.z1 - box.z0);
    a[i * 4 + 3] = r();                                   // which drops are on (density) and size
  }
  g.setAttribute('aDrop', new THREE.InstancedBufferAttribute(a, 4));
  g.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    uniforms: {
      uW: { value: 0 }, uExp: { value: 1 / 30 }, uRain: { value: 0 }, uH: { value: box.h }, uY0: { value: box.y0 },
      uSize: { value: sizeMm / 1000 }, uBeadA: { value: beadA }, uMinPx: { value: minPx }, uLight: { value: new THREE.Color(1, 1, 1) }, uFlash: { value: 0 }, uPx: { value: 0.001 },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aDrop;
      uniform float uW, uExp, uRain, uH, uY0, uSize, uPx, uMinPx;
      varying vec2 vUv; varying float vA; varying float vBead;
      void main() {
        float on = smoothstep(aDrop.w - 0.04, aDrop.w + 0.04, uRain);
        float sz = uSize * (0.6 + 0.8 * fract(aDrop.w * 7.31));
        // the bottom of the drop's streak, falling
        float y = uY0 + uH - mod(${FALL.toFixed(1)} * uW + aDrop.y * uH, uH);
        vec3 p = vec3(aDrop.x, y, aDrop.z);
        float len = max(sz * 1.6, ${FALL.toFixed(1)} * uExp);
        // keep every drop at least ~1.4 px wide so the frozen beads still read
        vec4 vp = modelViewMatrix * vec4(p, 1.0);
        float dist = -vp.z;
        float wpx = max(sz, uPx * dist * uMinPx);
        vBead = clamp(1.0 - (len - sz * 1.6) / (sz * 6.0), 0.0, 1.0);
        float lpx = max(len, wpx * mix(1.0, 1.4, vBead));
        // a vertical quad turned to face the camera (around world up), streak upward from the drop
        vec3 up = vec3(0.0, 1.0, 0.0);
        vec3 toCam = normalize(cameraPosition - p);
        vec3 side = normalize(cross(up, toCam));
        vec3 wp = p + side * position.x * wpx + up * (position.y + 1.0) * lpx;
        vUv = uv; vA = on * smoothstep(0.3, 1.2, dist) * (1.0 - smoothstep(40.0, 70.0, dist));
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLight; uniform float uFlash; uniform float uBeadA;
      varying vec2 vUv; varying float vA; varying float vBead;
      void main() {
        vec2 c = vUv - 0.5;
        // streak: a soft line; bead: a ring of light with a bright glint
        float streak = (1.0 - smoothstep(0.15, 0.5, abs(c.x))) * smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
        float r = length(c * vec2(1.0, 1.0));
        float bead = smoothstep(0.5, 0.36, r) * (0.35 + 0.65 * smoothstep(0.18, 0.42, r)) + smoothstep(0.14, 0.0, length(c - vec2(-0.12, 0.14))) * 1.6;
        float a = mix(streak * 0.55, bead * uBeadA, vBead) * vA;
        if (a < 0.01) discard;
        vec3 col = uLight * (0.75 + 0.6 * vBead) + vec3(0.8, 0.85, 1.0) * uFlash * 2.5;
        gl_FragColor = vec4(col, a);
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return mesh;
}

function splashes(n, box, seed) {
  // crowns on the ground: each spot splashes once per cycle (0.25-0.6 s), lasting 30 ms
  const r = rng(seed);
  const base = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
  const a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { a[i * 4] = box.x0 + r() * (box.x1 - box.x0); a[i * 4 + 1] = 0.25 + r() * 0.35; a[i * 4 + 2] = box.z0 + r() * (box.z1 - box.z0); a[i * 4 + 3] = r(); }
  g.setAttribute('aS', new THREE.InstancedBufferAttribute(a, 4));
  g.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uW: { value: 0 }, uRain: { value: 0 }, uLight: { value: new THREE.Color(1, 1, 1) }, uYRoad: { value: -0.15 }, uCurb: { value: -4.6 }, uFar: { value: -19 } },
    vertexShader: /* glsl */ `
      attribute vec4 aS; uniform float uW, uRain, uYRoad, uCurb, uFar;
      varying vec2 vUv; varying float vK; varying float vA;
      void main() {
        float ph = mod(uW / aS.y + aS.w * 13.7, 1.0) * aS.y;    // seconds since this spot's last splash
        float k = ph / 0.03;                                      // 0..1 over the splash
        float on = step(k, 1.0) * smoothstep(aS.w - 0.05, aS.w + 0.05, uRain);
        float y = (aS.z < uCurb && aS.z > uFar) ? uYRoad : 0.0;
        vec3 p = vec3(aS.x, y + 0.002, aS.z);
        vec3 toCam = normalize(cameraPosition - p);
        vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
        float w = 0.012 + 0.03 * k, h = 0.004 + 0.02 * sin(3.14159 * min(k, 1.0));
        vec3 wp = p + side * position.x * w + vec3(0.0, 1.0, 0.0) * position.y * h;
        vUv = uv; vK = k; vA = on;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLight; varying vec2 vUv; varying float vK; varying float vA;
      void main() {
        if (vA < 0.5) discard;
        // a crown: bright rim at the top, open in the middle
        vec2 c = vUv - vec2(0.5, 0.0);
        float rim = smoothstep(0.5, 0.38, abs(c.x)) * smoothstep(0.2, 0.9, vUv.y);
        float spikes = 0.6 + 0.4 * sin(c.x * 60.0);
        float a = rim * spikes * (1.0 - smoothstep(0.7, 1.0, vK)) * 0.8;
        if (a < 0.02) discard;
        gl_FragColor = vec4(uLight * 1.2, a);
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  return mesh;
}

export function makeRain(scene) {
  const near = layer(42000, { x0: -9, x1: 9, z0: -9.5, z1: 3.5, y0: -0.2, h: 7 }, 11, 5.0, 1, 2.4);
  const far = layer(42000, { x0: -40, x1: 40, z0: -40, z1: 20, y0: -0.2, h: 28 }, 12, 4.0, 0.3, 1.2);
  const spl = splashes(9000, { x0: -12, x1: 12, z0: -14, z1: 4 }, 13);
  scene.add(near, far, spl);
  const mats = [near.material, far.material];
  const nd = near.geometry.attributes.aDrop.array, NB = { y0: -0.2, h: 7 };
  return {
    // where near drop i is at world time w (the same maths as the shader), and whether it's raining there yet
    dropPos(i, w, rain) {
      const y = NB.y0 + NB.h - ((((FALL * w + nd[i * 4 + 1] * NB.h) % NB.h) + NB.h) % NB.h);
      return { x: nd[i * 4], y, z: nd[i * 4 + 2], on: rain > nd[i * 4 + 3] + 0.04 };
    },
    frame(s, camera, H) {
      const px = (2 * Math.tan((camera.fov * Math.PI / 180) / 2)) / H;
      for (const m of mats) {
        m.uniforms.uW.value = s.w; m.uniforms.uExp.value = s.exp; m.uniforms.uRain.value = s.rain; m.uniforms.uPx.value = px;
        m.uniforms.uLight.value.setScalar(0.55 + 0.25 * (1 - s.sunDim)); m.uniforms.uFlash.value = s.flash;
      }
      const vis = s.rain > 0.001;
      near.visible = far.visible = spl.visible = vis;
      spl.material.uniforms.uW.value = s.w; spl.material.uniforms.uRain.value = s.rain;
      spl.material.uniforms.uLight.value.setScalar(0.6 + 0.3 * (1 - s.sunDim) + 2 * s.flash);
    },
  };
}

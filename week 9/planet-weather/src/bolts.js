// Lightning: each bolt is a jagged path from the cloud to where it strikes, with a few branches, made once per seed
// (midpoint displacement) and drawn as camera-facing ribbons: a white-violet core and a wide soft glow, added onto
// the frame. A strike flickers: a leader, the bright return stroke, then a couple of re-strikes down the same path.
//   bolts.begin(); bolts.add(seed, from, to, k, width); bolts.end(camera)   (k: 0..1 brightness this frame)
import * as THREE from 'three';
import { rng } from './util.js';

const MAXQ = 2400;
function makePath(seed, a, b) {
  const R = rng(Math.floor(seed * 1e6) + 7);
  const len = a.distanceTo(b);
  let pts = [a.clone(), b.clone()];
  // midpoint displacement: each level halves the segments and jitters the new points sideways
  for (let lev = 0; lev < 7; lev++) {
    const out = [pts[0]];
    const amp = len * 0.11 * Math.pow(0.56, lev);
    for (let i = 0; i < pts.length - 1; i++) {
      const m = pts[i].clone().lerp(pts[i + 1], 0.5);
      m.x += (R() - 0.5) * 2 * amp; m.z += (R() - 0.5) * 2 * amp; m.y += (R() - 0.5) * amp * 0.5;
      out.push(m, pts[i + 1]);
    }
    pts = out;
  }
  const lines = [{ pts, w: 1 }];
  // branches: off the upper two thirds, down and outward
  const nb = 3 + Math.floor(R() * 4);
  for (let k = 0; k < nb; k++) {
    const i0 = Math.floor((0.08 + 0.6 * R()) * (pts.length - 1));
    const p0 = pts[i0];
    const bl = len * (0.12 + 0.22 * R());
    const dir = new THREE.Vector3((R() - 0.5) * 1.6, -0.8 - 0.5 * R(), (R() - 0.5) * 1.6).normalize();
    let bp = [p0.clone(), p0.clone().addScaledVector(dir, bl)];
    for (let lev = 0; lev < 5; lev++) {
      const out = [bp[0]];
      const amp = bl * 0.16 * Math.pow(0.55, lev);
      for (let i = 0; i < bp.length - 1; i++) {
        const m = bp[i].clone().lerp(bp[i + 1], 0.5);
        m.x += (R() - 0.5) * 2 * amp; m.z += (R() - 0.5) * 2 * amp; m.y += (R() - 0.5) * amp * 0.5;
        out.push(m, bp[i + 1]);
      }
      bp = out;
    }
    lines.push({ pts: bp, w: 0.45 });
  }
  return lines;
}

export function makeBolts(scene) {
  const pos = new Float32Array(MAXQ * 4 * 3), aK = new Float32Array(MAXQ * 4 * 2);
  const idx = new Uint32Array(MAXQ * 6);
  for (let q = 0; q < MAXQ; q++) idx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4 + 1, q * 4 + 3, q * 4 + 2], q * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aK', new THREE.BufferAttribute(aK, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `attribute vec2 aK; varying vec2 vK; void main(){ vK = aK; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `varying vec2 vK;
      void main(){
        float x = abs(vK.x);                 // 0 on the path, 1 at the ribbon's edge
        float core = exp(-x * x * 40.0), glow = exp(-x * x * 3.0);
        vec3 c = vec3(1.0, 0.98, 1.0) * core * 9.0 + vec3(0.55, 0.5, 1.0) * glow * 1.6;
        gl_FragColor = vec4(c * vK.y, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 7;
  scene.add(mesh);
  const cache = new Map();
  const list = [];
  const tA = new THREE.Vector3(), tB = new THREE.Vector3(), d = new THREE.Vector3(), s = new THREE.Vector3(), toC = new THREE.Vector3();
  return {
    mesh,
    begin() { list.length = 0; },
    add(seed, from, to, k, width) {
      if (k <= 0.003) return;
      const key = seed;
      if (!cache.has(key)) cache.set(key, makePath(seed, from.clone(), to.clone()));
      list.push({ lines: cache.get(key), k, width });
    },
    end(cam) {
      let q = 0;
      for (const b of list) for (const ln of b.lines) {
        const P = ln.pts, w = b.width * ln.w * 6;      // (the ribbon is wide: most of it is the soft glow)
        for (let i = 0; i < P.length - 1 && q < MAXQ; i++) {
          tA.copy(P[i]); tB.copy(P[i + 1]);
          d.subVectors(tB, tA);
          toC.subVectors(cam.position, tA);
          s.crossVectors(d, toC).normalize().multiplyScalar(w * (ln.w < 1 ? 1 - 0.7 * i / P.length : 1));
          const o = q * 12;
          pos[o] = tA.x - s.x; pos[o + 1] = tA.y - s.y; pos[o + 2] = tA.z - s.z;
          pos[o + 3] = tA.x + s.x; pos[o + 4] = tA.y + s.y; pos[o + 5] = tA.z + s.z;
          pos[o + 6] = tB.x - s.x; pos[o + 7] = tB.y - s.y; pos[o + 8] = tB.z - s.z;
          pos[o + 9] = tB.x + s.x; pos[o + 10] = tB.y + s.y; pos[o + 11] = tB.z + s.z;
          const kk = b.k * (ln.w < 1 ? 0.55 : 1);
          aK.set([-1, kk, 1, kk, -1, kk, 1, kk], q * 8);
          q++;
        }
      }
      geo.setDrawRange(0, q * 6);
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aK.needsUpdate = true;
      mesh.visible = q > 0;
    },
  };
}

// Broken glass: every window on the street walls near you (the same grid, hash and breaking point as the facade shader
// in city.js, so the shards come out of exactly the window that goes dark), the big shop panes, and the cafe's glass
// screens (props.js adds those as extra sources). Each pane sheds shards when it breaks: they tumble out over the
// sidewalk, fall, glint in the sun, and lie where they land.
import * as THREE from 'three';
import { BLD, MOUTH, FX, CAM } from './layout.js';
import { timeOfPressure } from './timeline.js';
import { winHash, winKey, paneKey, WIN_THR, PANE_THR, floorSpec, fr32 } from './city.js';
import { throwAt } from './physics.js';
import { rng } from './util.js';

export const SOURCES = [];   // { t, x, y, z, nx, nz, w, h, n }
{
  for (const b of BLD) {
    if (!b.chunk || b.kind >= 3) continue;
    // the face toward the street (the street walls only)
    const side = Math.sign(b.x);
    if (Math.abs(Math.abs(b.x) - b.w / 2 - FX) > 0.6) continue;
    if (b.z + b.d / 2 < -150 || b.z - b.d / 2 > 40) continue;
    const face = side > 0 ? 1 : 5;
    const nx = -side, X = b.x - side * b.w / 2;
    const { FH, g0 } = floorSpec(b.kind);
    const W = b.d, colW0 = b.colW;
    const nCol = Math.max(1, Math.floor(fr32(fr32(W) / fr32(colW0)) + 0.5));
    const colW = W / nCol;
    const z0 = b.z - b.d / 2;
    // window size within its cell, by kind (city.js LOOK)
    const [fx0, fy0, fx1, fy1] = b.kind === 1 ? [0.04, 0.14, 0.96, 0.97] : b.kind === 2 ? [0.3, 0.2, 0.7, 0.8] : [0.16, 0.22, 0.84, 0.86];
    for (let iy = 0; g0 + (iy + 0.5) * FH < b.h - 1.5; iy++) for (let ix = 0; ix < nCol; ix++) {
      const y = g0 + (iy + 0.5) * FH, z = z0 + (ix + 0.5) * colW;
      const thr = WIN_THR(winHash(winKey(ix, iy, b.i, face)));
      const r = Math.hypot(X - MOUTH.x, y - MOUTH.y, z - MOUTH.z);
      const t = timeOfPressure(thr, Math.max(r, 0.3));
      if (!Number.isFinite(t)) continue;
      SOURCES.push({ t, x: X, y: y + (fy0 + fy1 - 1) * 0.5 * FH, z: z + 0, nx, nz: 0, w: (fx1 - fx0) * colW, h: (fy1 - fy0) * FH, n: b.kind === 1 ? 7 : 4 });
    }
    // the shop panes at street level
    if (b.kind < 3) {
      const nb = Math.max(1, Math.floor(W / 5.5)), bw = W / nb;
      for (let bid = 0; bid < nb; bid++) {
        const y = (g0 - 1.4) * 0.5, z = z0 + (bid + 0.5) * bw;
        const thr = PANE_THR(winHash(paneKey(bid, b.i, face)));
        const r = Math.hypot(X - MOUTH.x, y - MOUTH.y, z - MOUTH.z);
        const t = timeOfPressure(thr, Math.max(r, 0.3));
        if (Number.isFinite(t)) SOURCES.push({ t, x: X, y, z, nx, nz: 0, w: 0.88 * bw, h: g0 - 2.0, n: 16 });
      }
    }
  }
}

export function makeGlass(scene, max = 14000) {
  // a shard: an irregular triangle, a few cm across
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.4, 0, 0.55, -0.2, 0, -0.1, 0.6, 0], 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: new THREE.Vector3(0, 1, 0) }, uSky: { value: new THREE.Color(0.6, 0.75, 0.95) } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform vec3 uSun; uniform vec3 uSky; varying vec3 vC;
      void main() {
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vec3 n = normalize(mat3(modelMatrix * instanceMatrix) * normal);
        vec3 V = normalize(w.xyz - cameraPosition);
        if (dot(n, V) > 0.0) n = -n;
        vec3 r = reflect(V, n);
        float glint = pow(max(dot(r, uSun), 0.0), 120.0) * 8.0;
        float fres = 0.25 + 0.75 * pow(1.0 - abs(dot(V, n)), 2.0);
        vC = mix(vec3(0.12, 0.15, 0.17), uSky * 0.75, fres) + vec3(1.0, 0.97, 0.9) * glint;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `varying vec3 vC; void main(){ gl_FragColor = vec4(vC, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const SH = [];
  let built = false;
  function build() {
    const R = rng(808);
    SOURCES.sort((a, b) => a.t - b.t);
    for (const s of SOURCES) for (let k = 0; k < s.n && SH.length < max; k++) {
      const ox = (R() - 0.5) * s.w, oy = (R() - 0.5) * s.h;
      // tangent along the pane (a facade facing x runs along z)
      const tx = s.nz !== 0 ? 1 : 0, tz = s.nz !== 0 ? 0 : 1;
      const p = [s.x + tx * ox + s.nx * 0.08, s.y + oy, s.z + tz * ox + s.nz * 0.08];
      // out over the sidewalk, away from you a little, then down
      const dx = p[0] - MOUTH.x, dz = p[2] - MOUTH.z, dh = Math.hypot(dx, dz) || 1;
      const out = 0.6 + 2.6 * R(), away = 0.4 + 1.8 * R();
      let vel = [s.nx * out + dx / dh * away + (R() - 0.5) * 0.8, 0.3 + 1.6 * R(), s.nz * out + dz / dh * away + (R() - 0.5) * 0.8];
      if (s.back && R() < s.back) {
        // pulled back out on the wave's low-pressure half: toward the source side, past the camera
        const cx = CAM.x + (R() - 0.5) * 3.5 - p[0], cy = CAM.y + (R() - 0.3) * 2.5 - p[1], cz = CAM.z + 1 - p[2], cl = Math.hypot(cx, cy, cz);
        const sp = 5 + 7 * R();
        vel = [cx / cl * sp, cy / cl * sp + 1.5, cz / cl * sp];
      } else if (s.big) vel = vel.map((x, i) => x * (i === 1 ? 1 : 1.8));
      SH.push({ T: { t0: s.t + R() * 0.05, p, vel, hs: 0.006, D: 9, wallX: 10.9 }, size: ((s.n > 10 ? 0.07 : 0.045) + 0.11 * R() * R()) * (s.big || 1), spin: [R() * 9 - 4.5, R() * 9 - 4.5, R() * 9 - 4.5], yaw: R() * 6.28, a0: [R() * 6, R() * 6, R() * 6] });
    }
    built = true;
    console.log(`glass: ${SOURCES.length} panes, ${SH.length} shards`);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(), st = {};
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    mat, SOURCES,
    addSource(s) { SOURCES.push(s); },
    frame(v) {
      if (!built) build();
      let n = 0;
      for (const S of SH) {
        if (!(v > S.T.t0)) continue;
        throwAt(S.T, v, st);
        if (st.landed) e.set(-Math.PI / 2 + 0.05 * Math.sin(S.yaw * 3), S.yaw, 0, 'YXZ');
        else e.set(S.a0[0] + S.spin[0] * st.t, S.a0[1] + S.spin[1] * st.t, S.a0[2] + S.spin[2] * st.t);
        q.setFromEuler(e);
        mesh.setMatrixAt(n++, m4.compose(p.set(st.x, st.y, st.z), q, sc.setScalar(S.size)));
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

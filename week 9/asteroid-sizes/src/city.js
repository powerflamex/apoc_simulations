// The city: one instanced box per building with its front drawn in the shader (glass towers mirroring the sky, office
// blocks with ribbon windows, mid-rise blocks with punched windows, shops and houses), the landmark tower's spire, the
// trees, and the traffic on the streets.
// What the blasts do to them (main.js decides when, per building, from the front's position):
//   - windows break (aF.x = the moment): each pane flashes as it shatters, then is a dark hole;
//   - the building burns (aF.y: its windows glow orange, its faces char);
//   - it falls: tips over away from ground zero about its far foot, sinking into its own dust (fall(), the matrix);
//   - it is swept away / swallowed (sink to nothing).
import * as THREE from 'three';
import { LU, LIGHT_GLSL } from './looks.js';
import { BLD, TREES, GRID, GZ, groundY, isLand } from './layout.js';
import { rng } from './util.js';

export function makeCity(scene) {
  const n = BLD.length;
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const aK = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);          // kind, seed, h, -
  const aF = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);          // break time, burn, dust, -
  aF.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aK', aK); geo.setAttribute('aF', aF);
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...LU, uV: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute vec4 aK; attribute vec4 aF;
      varying vec3 vLoc; varying vec3 vSc; varying vec3 vW; varying vec3 vN; varying vec3 vON; varying vec4 vK; varying vec4 vF;
      void main() {
        vLoc = position; vON = normal; vK = aK; vF = aF;
        vSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix * instanceMatrix) * (normal / vSc));
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${LIGHT_GLSL}
      uniform float uV;
      varying vec3 vLoc; varying vec3 vSc; varying vec3 vW; varying vec3 vN; varying vec3 vON; varying vec4 vK; varying vec4 vF;
      void main() {
        float kind = floor(vK.x + 0.5), seed = vK.y;
        vec3 N = normalize(vN);
        vec3 V = normalize(vW - cameraPosition);
        float d = length(vW - cameraPosition);
        float px = d * 0.0012;
        bool top = vON.y > 0.5;
        bool sx = abs(vON.x) > 0.5;
        float W = sx ? vSc.z : vSc.x;
        float u = ((sx ? vLoc.z : vLoc.x) + 0.5) * W;
        float y = vLoc.y * vSc.y;
        float H = vSc.y;
        // the walls' colours
        float r1 = h21(vec2(seed * 91.7, 1.3)), r2 = h21(vec2(seed * 37.1, 7.9));
        vec3 wall = kind < 0.5 ? mix(mix(vec3(0.78, 0.72, 0.62), vec3(0.62, 0.36, 0.28), step(0.6, r1)), vec3(0.88, 0.86, 0.82), step(0.85, r2))
          : kind < 1.5 ? mix(vec3(0.66, 0.62, 0.56), vec3(0.55, 0.4, 0.33), step(0.55, r1))
          : kind < 2.5 ? mix(vec3(0.74, 0.72, 0.68), vec3(0.5, 0.5, 0.52), r1)
          : kind < 4.5 ? mix(vec3(0.3, 0.36, 0.42), vec3(0.42, 0.44, 0.42), r1)
          : mix(vec3(0.92, 0.9, 0.85), vec3(0.95, 0.85, 0.7), r1);
        vec3 glassTint = mix(vec3(0.55, 0.75, 0.95), vec3(0.75, 0.68, 0.55), step(0.7, r2));
        // the window grid
        float FH = kind > 4.5 ? 3.0 : 3.6;
        float colW = kind < 0.5 ? 2.6 : kind < 1.5 ? 2.8 : kind < 2.5 ? 3.0 : 1.6;
        float nCol = max(1.0, floor(W / colW + 0.5)); colW = W / nCol;
        vec2 gg = vec2(u / colW, (y - 1.0) / FH);
        vec2 id = floor(gg), f = fract(gg);
        float far = smoothstep(0.25, 0.7, px / colW);
        float win;
        if (kind < 1.5 || kind > 4.5) win = step(0.22, f.x) * step(f.x, 0.78) * step(0.3, f.y) * step(f.y, 0.82);      // punched
        else if (kind < 2.5) win = step(0.34, f.y) * step(f.y, 0.86) * step(0.04, f.x);                                  // ribbons
        else win = step(0.05, f.x) * step(0.06, f.y);                                                                    // curtain glass
        win *= step(0.0, gg.y) * step(y, H - 1.5);
        float shopF = kind < 1.5 ? 1.0 - step(4.2, y) : 0.0;                                                          // shop fronts
        // glass: the sky mirrored, darker inside when seen straight on
        vec3 R = reflect(V, N);
        float fres = 0.12 + 0.88 * pow(1.0 - abs(dot(V, N)), 3.0);
        float pane = h21(id + vec2(seed * 13.0, sx ? 3.0 : 7.0));
        vec3 inside = vec3(0.05, 0.06, 0.07) * (0.6 + 0.8 * pane);
        vec3 glass = mix(inside, skyRefl(R) * glassTint * (kind > 2.5 && kind < 4.5 ? 1.15 : 0.9), fres * (kind > 2.5 && kind < 4.5 ? 0.95 : 0.6));
        // ---- the windows break: each pane flashes as it goes, then a dark hole ----
        float tb = vF.x + 0.35 * h21(id + seed * 5.1);
        float gone = step(tb, uV) * step(0.5, vF.x);
        float flash = gone * exp(-(uV - tb) / 0.07) * step(0.3, h21(id * 1.3 + seed));
        glass = mix(glass, vec3(0.02, 0.02, 0.025), gone * 0.92);
        float wk = mix(win, kind > 2.5 && kind < 4.5 ? 0.85 : 0.35, far);
        vec3 alb = wall * (0.92 + 0.12 * h21(vec2(id.y, seed)));
        vec3 c;
        if (top) {
          // flat roofs: gravel, plant rooms; houses: tiles
          vec3 roof = kind > 4.5 ? mix(vec3(0.55, 0.26, 0.18), vec3(0.36, 0.36, 0.38), step(0.5, r2)) : vec3(0.42, 0.41, 0.4) * (0.8 + 0.3 * n21(vLoc.xz * 6.0 + seed));
          c = lit(roof, N, 1.0);
        } else {
          vec3 wl = lit(alb, N, 0.75 + 0.25 * smoothstep(0.0, 12.0, y));
          vec3 gl = glass * (0.85 + 0.25 * uSunC.r / 3.0) + uFrontC * 0.08 * fres;
          c = mix(wl, gl, wk * (1.0 - shopF * 0.3));
          c = mix(c, lit(vec3(0.12, 0.12, 0.13), N, 1.0) + vec3(0.04, 0.035, 0.02), shopF * 0.5 * (1.0 - far));
          c += vec3(1.6, 1.6, 1.7) * flash * win * 3.0;
        }
        // ---- burning: windows glow orange, the faces char ----
        float burn = vF.y;
        if (burn > 0.0) {
          float fl = 0.6 + 0.4 * sin(uTime * 9.0 + pane * 30.0) * sin(uTime * 5.3 + pane * 11.0);
          c = mix(c, c * vec3(0.25, 0.2, 0.18), burn * 0.7);
          c += vec3(2.4, 0.8, 0.15) * burn * fl * (top ? 0.2 : win * step(0.35, pane) + 0.15 * far);
        }
        // its own dust round its foot as it goes down
        c = mix(c, lit(uDustC, vec3(0.0, 1.0, 0.0), 1.0), vF.z * (1.0 - smoothstep(0.0, 60.0 + 0.3 * H, y)));
        c = melt(c, length(vW.xz - uGZ), vW.xz) * (1.0 - step(0.5, uMelt) * 0.0);
        c = haze(c, d, vW.y);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.frustumCulled = false;
  scene.add(mesh);
  BLD.forEach((b, i) => { aK.setXYZW(i, b.kind, b.seed, b.h, 0); aF.setXYZW(i, 0, 0, 0, 0); });

  // the landmark's spire (on top of the tallest tower at ground zero)
  const LM = BLD.find((b) => b.kind === 4);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 2.4, 40, 8).translate(0, 20, 0),
    new THREE.ShaderMaterial({ uniforms: { ...LU }, vertexShader: /* glsl */ `varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `${LIGHT_GLSL} varying vec3 vW; varying vec3 vN; void main(){ vec3 c = lit(vec3(0.7, 0.7, 0.72), normalize(vN), 1.0); c = haze(c, length(vW - cameraPosition), vW.y); gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` }));
  spire.frustumCulled = false;
  scene.add(spire);

  // ---------- the trees ----------
  const tgeo = new THREE.IcosahedronGeometry(1, 1);
  const tmat = new THREE.ShaderMaterial({
    uniforms: { ...LU },
    vertexShader: /* glsl */ `varying vec3 vW; varying vec3 vN; varying float vS;
      void main(){ vS = fract(instanceMatrix[3].x * 0.173 + instanceMatrix[3].z * 0.071); vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix * instanceMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `${LIGHT_GLSL} varying vec3 vW; varying vec3 vN; varying float vS;
      void main(){ vec3 alb = mix(vec3(0.07, 0.15, 0.05), vec3(0.17, 0.25, 0.08), vS) * (0.75 + 0.45 * n21(vW.xz * 0.9 + vW.y));
        vec3 c = lit(alb, normalize(vN), 0.8); c = melt(c, length(vW.xz - uGZ), vW.xz); c = haze(c, length(vW - cameraPosition), vW.y); gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const trees = new THREE.InstancedMesh(tgeo, tmat, TREES.length);
  trees.frustumCulled = false;
  scene.add(trees);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
  TREES.forEach((t, i) => {
    m4.compose(p.set(t.x, t.y + t.h * 0.55, t.z), q.identity(), s.set(t.r, t.h * 0.5, t.r));
    trees.setMatrixAt(i, m4);
  });
  trees.instanceMatrix.needsUpdate = true;

  // ---------- the traffic: cars along the streets ----------
  const CARS = [];
  {
    const R = rng(777);
    for (let k = 0; k < 520; k++) {
      const along = R() < 0.5;                 // along x (cross streets) or along z (avenues)
      const lane = (R() < 0.5 ? -1 : 1) * 3.2;
      let x0, z0;
      for (let tries = 0; tries < 20; tries++) {
        x0 = (R() - 0.5) * 3600; z0 = -400 - R() * 3000;
        if (Math.abs(x0) > 200 + (-z0) * 0.4) continue;
        if (isLand(x0, z0) && groundY(x0, z0) < 20) break;
      }
      const sx = Math.round(x0 / GRID.BX) * GRID.BX, sz = Math.round(z0 / GRID.BZ) * GRID.BZ;
      CARS.push({ along, x: along ? x0 : sx + lane, z: along ? sz + lane : z0, dir: lane > 0 ? 1 : -1, sp: 8 + R() * 7, col: new THREE.Color().setHSL(R(), 0.4 * R(), 0.25 + 0.6 * R()), seed: R() });
    }
  }
  const cgeo = new THREE.BoxGeometry(1.9, 1.5, 4.5).translate(0, 0.75, 0);
  const cmat = new THREE.ShaderMaterial({
    uniforms: { ...LU },
    vertexShader: /* glsl */ `varying vec3 vW; varying vec3 vN; varying vec3 vC; void main(){ vC = instanceColor; vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix * instanceMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `${LIGHT_GLSL} varying vec3 vW; varying vec3 vN; varying vec3 vC;
      void main(){ vec3 N = normalize(vN); vec3 c = lit(vC, N, 1.0); vec3 V = normalize(vW - cameraPosition); c += skyRefl(reflect(V, N)) * 0.25 * step(0.5, N.y);
        c = haze(c, length(vW - cameraPosition), vW.y); gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const cars = new THREE.InstancedMesh(cgeo, cmat, CARS.length);
  cars.frustumCulled = false;
  CARS.forEach((c, i) => cars.setColorAt(i, c.col));
  scene.add(cars);

  // ---------- per frame ----------
  const axis = new THREE.Vector3(), pivot = new THREE.Vector3(), M = new THREE.Matrix4(), T1 = new THREE.Matrix4(), T2 = new THREE.Matrix4();
  // a building's matrix: tipped over by `ang` (rad) away from ground zero about its far foot, sunk by `sink` (0..1)
  function place(i, b, ang, sink) {
    const hh = b.h * (1 - sink);
    m4.compose(p.set(b.x, b.y - b.h * sink * 0.15, b.z), q.identity(), s.set(b.w, Math.max(hh, 0.01), b.d));
    if (ang > 1e-4) {
      const dx = b.x - GZ.x, dz = b.z - GZ.z, L = Math.hypot(dx, dz) || 1;
      axis.set(dz / L, 0, -dx / L);
      const r = Math.min(b.w, b.d) * 0.5;
      pivot.set(b.x + dx / L * r, b.y, b.z + dz / L * r);
      q.setFromAxisAngle(axis, ang);
      T1.makeTranslation(pivot.x, pivot.y, pivot.z); T2.makeTranslation(-pivot.x, -pivot.y, -pivot.z);
      M.makeRotationFromQuaternion(q);
      m4.premultiply(T2).premultiply(M).premultiply(T1);
    }
    mesh.setMatrixAt(i, m4);
    if (b === LM) {
      spire.visible = sink < 0.98;
      spire.position.set(0, hh, 0).applyMatrix4(T2.identity()).add(p.set(b.x, b.y - b.h * sink * 0.15, b.z));
      spire.quaternion.identity();
      if (ang > 1e-4) { spire.position.sub(pivot).applyQuaternion(q).add(pivot); spire.quaternion.copy(q); }
    }
  }
  return {
    mesh, aF, spire, trees, cars, CARS, mat,
    place,
    // (state per building is decided in main.js; this just writes it)
    set(i, tBreak, burn, dust) { aF.setXYZW(i, tBreak, burn, dust, 0); },
    commit(v) {
      mesh.instanceMatrix.needsUpdate = true; aF.needsUpdate = true; mat.uniforms.uV.value = v;
    },
    traffic(v, stopT, frozen) {
      // the cars drive on until the blast, then stop where they are
      CARS.forEach((c, i) => {
        const t = Math.min(v, frozen) - stopT;
        const d = c.dir * c.sp * t + c.seed * 400;
        const span = 1800;
        const w = ((d % span) + span) % span - span / 2;
        const x = c.along ? c.x + w : c.x, z = c.along ? c.z : c.z + w;
        const y = groundY(x, z);
        e.set(0, c.along ? Math.PI / 2 : 0, 0); q.setFromEuler(e);
        m4.compose(p.set(x, y, z), q, s.set(1, 1, 1));
        cars.setMatrixAt(i, m4);
      });
      cars.instanceMatrix.needsUpdate = true;
    },
  };
}

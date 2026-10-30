// The explosions' pieces, all filled fresh every frame (pure functions of time):
//   makePuffs   soft smoke / dust / steam billboards (a ragged noisy blob, lit from above, glowing from below),
//               drawn back to front: mushroom clouds, dust rings, water plumes, collapsing buildings
//   makeDomes   the shock wave: a thin glowing shell racing out from each blast (bright rim, clear inside)
//   makeDebris  chunks of buildings: tumbling boxes thrown by the blast, then lying as rubble
import * as THREE from 'three';

const NOISE = /* glsl */ `
  float fh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float fn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(fh(i), fh(i + vec2(1, 0)), f.x), mix(fh(i + vec2(0, 1)), fh(i + vec2(1, 1)), f.x), f.y); }
  float ffbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * fn(p); p = p * 2.03 + 3.7; a *= 0.5; } return s; }
`;

export function makePuffs(scene, max = 6000) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const aP = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);   // centre, radius
  const aC = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);   // colour, alpha
  const aE = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);   // glow from below (rgb), seed
  geo.setAttribute('aP', aP); geo.setAttribute('aC', aC); geo.setAttribute('aE', aE);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFogD: { value: 0 }, uFogC: { value: new THREE.Color() } },
    transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec4 aP; attribute vec4 aC; attribute vec4 aE; varying vec2 vUv; varying vec4 vC; varying vec4 vE; varying float vFog;
      uniform float uFogD;
      void main() {
        vUv = uv * 2.0 - 1.0; vC = aC; vE = aE;
        vec4 mv = viewMatrix * vec4(aP.xyz, 1.0);
        float d = length(mv.xyz);
        // fade out as the camera gets inside a puff (no grey screen when the dust rolls over the lens)
        vC.a *= smoothstep(aP.w * 0.6, aP.w * 1.6, d);
        mv.xy += position.xy * aP.w * 2.0;
        vFog = 1.0 - exp(-uFogD * uFogD * d * d);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uFogC; varying vec2 vUv; varying vec4 vC; varying vec4 vE; varying float vFog;
      ${NOISE}
      void main() {
        float r = length(vUv);
        vec2 q = vUv * 1.6 + vE.w * 17.0;
        float n = ffbm(q + vec2(ffbm(q * 1.7 + uTime * 0.05), ffbm(q * 1.3 - uTime * 0.04)) * 0.8);
        // a lumpy outline (billows round the edge), not a round blur
        float ang = atan(vUv.y, vUv.x);
        float edge = 0.62 + 0.3 * ffbm(vec2(cos(ang), sin(ang)) * 1.4 + vE.w * 7.0) + 0.08 * fn(vec2(ang * 3.0, vE.w * 5.0));
        float a = smoothstep(edge, edge - 0.18, r + (n - 0.5) * 0.25) * (0.6 + 0.4 * smoothstep(0.25, 0.65, n)) * vC.a;
        if (a < 0.003) discard;
        // lit from above (the sky), darker underneath and between the billows; glowing from below (fire)
        float up = vUv.y * 0.5 + 0.5;
        vec3 c = vC.rgb * (0.45 + 0.6 * up) * (0.55 + 0.8 * n);
        c += vE.rgb * (1.0 - up * 0.7) * (0.5 + n);
        c = mix(c, uFogC, vFog * 0.85);
        gl_FragColor = vec4(c, a);
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false; mesh.renderOrder = 5;
  scene.add(mesh);
  const list = [];
  const cam = new THREE.Vector3();
  return {
    mat, mesh,
    begin(camera) { list.length = 0; cam.copy(camera.position); },
    // colour (r, g, b) and alpha; glow from below (er, eg, eb)
    puff(x, y, z, rad, r, g, b, a, er = 0, eg = 0, eb = 0, seed = 0) {
      if (a < 0.004 || rad <= 0 || list.length >= max) return;
      list.push([x, y, z, rad, r, g, b, a, er, eg, eb, seed, (x - cam.x) ** 2 + (y - cam.y) ** 2 + (z - cam.z) ** 2]);
    },
    end() {
      list.sort((p, q) => q[12] - p[12]);
      list.forEach((p, i) => { aP.setXYZW(i, p[0], p[1], p[2], p[3]); aC.setXYZW(i, p[4], p[5], p[6], p[7]); aE.setXYZW(i, p[8], p[9], p[10], p[11]); });
      mesh.count = list.length;
      aP.needsUpdate = aC.needsUpdate = aE.needsUpdate = true;
    },
  };
}

export function makeDomes(scene, max = 400) {
  const geo = new THREE.SphereGeometry(1, 48, 24);
  const aD = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);   // centre, radius
  const aA = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);       // brightness
  geo.setAttribute('aD', aD); geo.setAttribute('aA', aA);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec4 aD; attribute float aA; varying vec3 vN; varying vec3 vV; varying float vA; varying float vY;
      void main() {
        vec3 w = aD.xyz + position * aD.w;
        vN = position; vV = normalize(cameraPosition - w); vA = aA; vY = position.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying float vA; varying float vY;
      void main() {
        if (vY < -0.05) discard;                      // (only the half above the ground)
        float rim = pow(1.0 - abs(dot(normalize(vN), vV)), 4.0);
        gl_FragColor = vec4(vec3(0.85, 0.88, 1.0) * rim * vA, 1.0);
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false; mesh.renderOrder = 6;
  scene.add(mesh);
  let n = 0;
  return {
    mesh,
    begin() { n = 0; },
    dome(x, y, z, r, a) { if (n >= max || a < 0.003) return; aD.setXYZW(n, x, y, z, r); aA.setX(n, a); n++; },
    end() { mesh.count = n; aD.needsUpdate = aA.needsUpdate = true; },
  };
}

export function makeDebris(scene, max = 24000) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const aH = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);       // how hot (glowing) it is
  geo.setAttribute('aH', aH);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aH; varying float vH;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvH = aH;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vH;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(2.4, 0.8, 0.15) * vH;');
  };
  mat.customProgramCacheKey = () => 'debris-v1';
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  let n = 0;
  return {
    mesh,
    begin() { n = 0; },
    chunk(x, y, z, sx, sy, sz, rx, ry, rz, col, hot, shade = 1) {
      if (n >= max) return;
      e.set(rx, ry, rz); q.setFromEuler(e);
      m4.compose(p.set(x, y, z), q, s.set(sx, sy, sz));
      mesh.setMatrixAt(n, m4); mesh.setColorAt(n, c.set(col).multiplyScalar(shade)); aH.setX(n, hot);
      n++;
    },
    end() { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; aH.needsUpdate = true; },
  };
}

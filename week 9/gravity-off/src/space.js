// The space stops (1 HOUR, 1 DAY): the Earth seen from where you've got to, drawn by its own scene and camera (metres,
// inertial frame: Earth's centre at the origin, its axis along z), behind the main scene (where only you are left).
//   * The Earth: NASA's day map, its seas gone: the ocean floors bare (pale shelves, dark abyss), more detail from
//     noise for the close views, lit by the Sun, no air (no blue rim, no clouds), turning at the true rate.
//   * What was loose on it (the seas, as ice and water): it went straight on while the ground curved away, so it lies on
//     the Earth stretched sideways by f = sqrt(1 + (wt)^2) (1.034 at 1 h, 6.4 at 1 day), lagging the ground by
//     wt - atan(wt); the deep water's own spring-back (26 m/s) lifts its upper layers further (95 km at 1 h). Drawn as
//     a few broken translucent shells over the ocean regions (sheets and blobs).
//   * The Sun: a disc in the sky, swollen to sunRadius(t) of its own radius (2x at 1 h, ~65x at 1 day), hot, churning.
import * as THREE from 'three';
import { R_E, OMEGA, G, sunRadius, YOU_U, LEDGE, V_ROT } from './timeline.js';
const smoothStep = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

const LAT = 40.7 * Math.PI / 180, LON0 = -74 * Math.PI / 180;
const AU = 1.496e11, R_SUN = 6.957e8;
// the plaza's frame at t = 0 (inertial): up, east, north
const UP0 = new THREE.Vector3(Math.cos(LAT), 0, Math.sin(LAT)), EAST0 = new THREE.Vector3(0, 1, 0), NORTH0 = new THREE.Vector3(-Math.sin(LAT), 0, Math.cos(LAT));
// the Sun: SSW, 32° up, as seen from the square at t = 0 (an afternoon in late November)
export const SUN_DIR = (() => {
  const az = 200 * Math.PI / 180, el = 32 * Math.PI / 180;
  return new THREE.Vector3().addScaledVector(NORTH0, Math.cos(el) * Math.cos(az)).addScaledVector(EAST0, Math.cos(el) * Math.sin(az)).addScaledVector(UP0, Math.sin(el)).normalize();
})();
// where you are (inertial) t seconds after gravity went off, while it's off (a straight line)
const P0 = UP0.clone().multiplyScalar(R_E + LEDGE), VEL = EAST0.clone().multiplyScalar(V_ROT).addScaledVector(UP0, YOU_U[1]).addScaledVector(NORTH0, -YOU_U[2]);
export function youInertial(t, out = new THREE.Vector3()) { return out.copy(P0).addScaledVector(VEL, t); }
// the local frame at p: x east, y up, z south (the square's axes)
export function localBasis(p, m = new THREE.Matrix4()) {
  const up = p.clone().normalize(), east = new THREE.Vector3(0, 0, 1).cross(up).normalize(), north = up.clone().cross(east);
  return m.makeBasis(east, up, north.negate());
}

const NOISE = /* glsl */ `
  float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.07 + 3.1; a *= 0.5; } return s; }
  const float PI = 3.14159265;
  vec2 llUV(float lat, float lon) { return vec2(fract((lon + PI) / (2.0 * PI)), 0.5 + lat / PI); }
  // ocean mask and depth from the map's colour (blue = sea; brighter blue = shallower)
  // (c is linear: the map's sRGB decoded)
  vec2 sea(vec3 c) { float r = c.b / (c.r + c.g + c.b + 0.0015); float m = smoothstep(0.44, 0.54, r) * step(0.0004, c.b); return vec2(m, 1.0 - smoothstep(0.006, 0.11, c.b)); }
`;

export function makeSpace() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1080 / 1920, 200, 4e8);
  scene.add(camera);
  let texDone; const texReady = new Promise((r) => { texDone = r; });
  const tex = new THREE.TextureLoader().load('textures/earth_day.jpg', () => texDone());
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.wrapS = THREE.RepeatWrapping;
  const U = { uMap: { value: tex }, uSun: { value: SUN_DIR.clone() }, uLon0: { value: LON0 }, uT: { value: 0 } };

  // ---- the sky: black, the swollen Sun, its glow ----
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false,
    uniforms: { uSun: U.uSun, uA: { value: 0.0047 }, uT: U.uT, uHot: { value: 0 } },
    vertexShader: `varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position * 1e8, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */ `varying vec3 vD; uniform vec3 uSun; uniform float uA; uniform float uT; uniform float uHot;
      ${NOISE}
      void main(){
        vec3 d = normalize(vD);
        float c = dot(d, uSun), ang = acos(clamp(c, -1.0, 1.0));
        float x = ang / uA;                       // 1 at the Sun's edge
        vec3 col = vec3(0.0);
        // faint stars (the Sun's glare hides most)
        vec3 g = d * 340.0; float st = step(0.9985, h31(floor(g))) * 0.5;
        col += vec3(st) * smoothstep(0.2, 1.0, 1.0 - c) * 0.6;
        if (x < 1.0) {
          float mu = sqrt(1.0 - x * x);
          vec3 q = d * (40.0 / max(uA, 0.004)) + vec3(uT * 0.02);
          float gran = fbm3(q * 0.6) * 0.6 + fbm3(q * 2.3) * 0.4;
          vec3 hot = mix(vec3(1.0, 0.92, 0.78), vec3(1.0, 0.72, 0.42), uHot);
          col = hot * (0.42 + 0.58 * pow(mu, 0.55)) * (0.82 + 0.36 * gran) * 3.2;
        }
        // the glow round it (bigger as it swells), the churning edge
        float e = max(x - 1.0, 0.0);
        col += mix(vec3(1.0, 0.85, 0.65), vec3(1.0, 0.6, 0.35), uHot) * (exp(-e * 9.0) * 1.2 + exp(-e * 2.5) * 0.12) * step(1.0, x);
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);

  // ---- the Earth (axis along z: the sphere's y turned onto z) ----
  const geo = new THREE.SphereGeometry(R_E, 720, 360).rotateX(Math.PI / 2);
  const earth = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: `varying vec3 vO; varying vec3 vN; varying vec3 vW;
      void main(){ vO = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `varying vec3 vO; varying vec3 vN; varying vec3 vW; uniform sampler2D uMap; uniform vec3 uSun; uniform float uLon0;
      ${NOISE}
      void main(){
        vec3 n = normalize(vO);
        float lat = asin(clamp(n.z, -1.0, 1.0)), lon = atan(n.y, n.x) + uLon0;
        vec3 c = texture2D(uMap, llUV(lat, lon)).rgb;
        vec2 s = sea(c);
        // detail for the close views: mottled ground at 60 km, 12 km and 2.5 km
        vec3 P = vO / 60000.0;
        float d1 = fbm3(P), d2 = fbm3(P * 5.0), d3 = n3(P * 24.0);
        vec3 land = c * (0.78 + 0.32 * d1 + 0.18 * (d2 - 0.5) + 0.1 * (d3 - 0.5));
        // the bare sea floor: pale sediment on the shelves, grey-brown slopes, dark abyssal plains with ridges
        float ridge = 1.0 - abs(2.0 * fbm3(P * 0.7 + 4.0) - 1.0);
        vec3 shelf = vec3(0.47, 0.42, 0.35), abyss = vec3(0.2, 0.19, 0.2);
        vec3 bed = mix(shelf, abyss, smoothstep(0.15, 0.7, s.y)) * (0.8 + 0.3 * d1 + 0.12 * (d2 - 0.5)) + vec3(0.06) * pow(ridge, 6.0);
        bed = mix(bed, vec3(0.62, 0.58, 0.5), smoothstep(0.55, 0.75, fbm3(P * 0.35 + 9.0)) * 0.55 * smoothstep(0.3, 0.8, s.y));
        // relief: light and shade from the slopes (ridges, seamounts, canyons cut in the shelf's edge)
        float hR = fbm3(P * 1.3) + 0.5 * pow(ridge, 4.0);
        vec3 Pd = P + vec3(0.02);
        float slope = (fbm3(Pd * 1.3) + 0.5 * pow(1.0 - abs(2.0 * fbm3(Pd * 0.7 + 4.0) - 1.0), 4.0)) - hR;
        bed *= 1.0 + clamp(slope * 9.0, -0.45, 0.45) * s.x;
        vec3 alb = mix(land, bed, s.x);
        vec3 N = normalize(vN);
        float l = max(dot(N, uSun), 0.0);
        vec3 col = alb * (l * 2.6 + 0.008);
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  earth.frustumCulled = false;
  scene.add(earth);

  // ---- the flung seas: ice and water in sheets and blobs, as points sampled from the oceans of the map ----
  // Each point: where its water came from (lat, lon), how deep the sea was there (0 shelf .. 1 abyss), and where in that
  // column it was (0 floor .. 1 surface). Placed in the vertex shader: the Earth stretched sideways by uF, turned by
  // uLag (it lags the ground), lifted by its share of the deep water's spring-back; falling back once gravity's on.
  // Two sets: a dense one over the North Atlantic (the close view, 1 HOUR) and a sparse one over every ocean (1 DAY).
  const pix = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const W = 1024, H = 512, cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const c2 = cv.getContext('2d'); c2.drawImage(img, 0, 0, W, H);
      resolve({ W, H, px: c2.getImageData(0, 0, W, H).data });
    };
    img.src = 'textures/earth_day.jpg';
  });
  function makeFloes(NP, lat0, lat1, lon0, lon1, seed0, jitter) {
    const aSrc = new Float32Array(NP * 4), aRnd = new Float32Array(NP * 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NP * 3), 3));
    geo.setAttribute('aSrc', new THREE.BufferAttribute(aSrc, 4));
    geo.setAttribute('aRnd', new THREE.BufferAttribute(aRnd, 2));
    const ready = pix.then(({ W, H, px }) => {
      let n = 0, seed = seed0;
      const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const s0 = Math.sin(lat0), s1 = Math.sin(lat1);
      for (let tries = 0; n < NP && tries < NP * 10; tries++) {
        const lat = Math.asin(s0 + (s1 - s0) * rnd()), lon = lon0 + (lon1 - lon0) * rnd();
        const x = Math.min(W - 1, Math.floor((lon + Math.PI) / (2 * Math.PI) * W)), y = Math.min(H - 1, Math.floor((0.5 - lat / Math.PI) * H));
        const k = (y * W + x) * 4, r = px[k] / 255, g = px[k + 1] / 255, b = px[k + 2] / 255;
        const ratio = b / (r + g + b + 0.02);
        if (ratio < 0.47 || b < 0.004) continue;
        const depth = 1 - Math.min(1, Math.max(0, (b - 0.08) / 0.28));
        aSrc.set([lat, lon, depth, rnd()], n * 4);
        aRnd.set([rnd(), rnd()], n * 2);
        n++;
      }
      geo.setDrawRange(0, n);
      geo.attributes.aSrc.needsUpdate = true; geo.attributes.aRnd.needsUpdate = true;
      return n;
    });
    const FU = { uSun: U.uSun, uLon0: U.uLon0, uF: { value: 1 }, uLag: { value: 0 }, uLift: { value: 0 }, uBack: { value: 0 }, uA: { value: 0 }, uScale: { value: 1000 }, uSize: { value: 30000 }, uNear: { value: 15000 }, uJit: { value: jitter } };
    const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: FU,
      vertexShader: /* glsl */ `attribute vec4 aSrc; attribute vec2 aRnd;
        uniform float uF; uniform float uLag; uniform float uLift; uniform float uBack; uniform float uScale; uniform float uSize; uniform float uNear; uniform float uLon0; uniform vec3 uSun; uniform float uJit;
        varying float vA; varying float vL; varying float vR;
        void main(){
          const float RE = ${R_E.toFixed(1)};
          float ff = mix(uF, 1.0, uBack);
          float lon = aSrc.y - uLon0 + uLag + (aRnd.x - 0.5) * uJit * ff;
          float lat2 = aSrc.x + (aRnd.y - 0.5) * uJit;
          float e = uLift * aSrc.z * aSrc.w * (1.0 - uBack) + (fract(aRnd.y * 7.3) - 0.5) * 6000.0 * ff;
          vec3 nrm = vec3(cos(lat2) * cos(lon), cos(lat2) * sin(lon), sin(lat2));
          vec3 p = vec3(RE * cos(lat2) * ff * cos(lon), RE * cos(lat2) * ff * sin(lon), RE * sin(lat2)) + nrm * (e + 1500.0);
          vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
          float d = -mv.z;
          gl_Position = projectionMatrix * mv;
          float sz = uSize * (0.45 + 1.1 * aRnd.x * aRnd.x) * ff;
          float px = sz * uScale / max(d, 1.0);
          gl_PointSize = clamp(px, 1.0, 40.0);
          vA = smoothstep(uNear, uNear * 2.5, d) * clamp(px / 1.6, 0.25, 1.0);
          vL = 0.15 + 0.85 * clamp(dot(nrm, uSun) * 1.3 + 0.35, 0.0, 1.0);
          vR = aRnd.x;
        }`,
      fragmentShader: /* glsl */ `uniform float uA; varying float vA; varying float vL; varying float vR;
        void main(){
          vec2 q = gl_PointCoord - 0.5;
          float r = length(q) * 2.0;
          float a = (1.0 - smoothstep(0.45, 1.0, r)) * uA * vA;
          if (a < 0.01) discard;
          vec3 ice = mix(vec3(0.72, 0.82, 0.93), vec3(0.98, 0.99, 1.0), vR);
          gl_FragColor = vec4(ice * vL * 1.35, a * 0.85);
        }`,
    }));
    pts.frustumCulled = false; pts.renderOrder = 3;
    scene.add(pts);
    return { pts, FU, ready };
  }
  const D2R = Math.PI / 180;
  const near = makeFloes(220000, 25 * D2R, 52 * D2R, -76 * D2R, -30 * D2R, 777, 0.004);
  const glob = makeFloes(120000, -78 * D2R, 82 * D2R, -Math.PI, Math.PI, 12345, 0.03);
  const ready = Promise.all([near.ready, glob.ready]);

  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), you = new THREE.Vector3();
  return {
    scene, camera, SUN_DIR, ready: Promise.all([ready, texReady]),
    // t: story time; T: when gravity came back; pYou: your inertial position (metres); camOffLocal: the camera's offset
    // from you in your local frame; camQLocal: the main camera's rotation (local frame); fov
    frame(t, T, pYou, camOffLocal, camQLocal, fov) {
      U.uT.value = t;
      // the Earth turns
      earth.rotation.set(0, 0, OMEGA * Math.max(0, t));
      // the loose seas: stretched sideways by f at the moment gravity came back (then falling back: shrink toward 1)
      const tt = Math.min(t, T);
      let f = Math.sqrt(1 + (OMEGA * tt) ** 2), lift = 26.5 * tt;
      let back = 0;
      if (t > T) {      // falling back: from where they got to, at about the rate you fall (same height, same pull)
        const s = t - T, h0 = R_E * (f - 1) * 0.62;
        back = Math.min(1, 0.5 * G * s * s / Math.max(h0, 1));
      }
      const alt = pYou.length() - R_E, scale = 1920 / (2 * Math.tan(fov * Math.PI / 360));
      const kGlob = smoothStep(400e3, 2500e3, alt);
      for (const [F, A, size, nr] of [[near, 1 - kGlob, 5200, 0.06], [glob, kGlob * 0.6, 26000, 0.9]]) {
        const FU = F.FU;
        FU.uF.value = f; FU.uLag.value = Math.atan(OMEGA * tt);
        FU.uLift.value = lift; FU.uBack.value = back;
        FU.uA.value = A * smoothStep(30, 200, tt) * (t > T ? 1 - back * back * back : 1);
        FU.uScale.value = scale; FU.uSize.value = size;
        FU.uNear.value = Math.max(4000, alt * nr);
        F.pts.visible = FU.uA.value > 0.01;
      }
      // the Sun's size and heat
      const a = Math.atan(R_SUN * sunRadius(t) / AU);
      sky.material.uniforms.uA.value = a;
      sky.material.uniforms.uHot.value = Math.min(1, (sunRadius(t) - 1) / 40);
      // the camera
      const B = localBasis(pYou);
      you.copy(pYou).add(camOffLocal.clone().applyMatrix4(tmpM.extractRotation(B)));
      camera.position.copy(you);
      tmpQ.setFromRotationMatrix(tmpM.extractRotation(B));
      camera.quaternion.copy(tmpQ).multiply(camQLocal);
      camera.fov = fov;
      camera.near = Math.max(50, alt * 0.002); camera.far = pYou.length() * 2.5;
      camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      sky.position.copy(camera.position);
    },
    sunLocal(pYou, out = new THREE.Vector3()) { const B = localBasis(pYou); return out.copy(SUN_DIR).applyMatrix4(tmpM.copy(B).invert()).normalize(); },
  };
}

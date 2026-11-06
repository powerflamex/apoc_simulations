// The Earth, the air and the Sun, worked out per pixel from where the camera really is: a sphere of the true radius
// 420 km (and later 60 km) below you, NASA's day and night maps with fine procedural detail on top (the maps are
// 10 km per pixel; the ground below a 420-km camera spans 600 km), moving clouds, the Sun's glint on the sea, the
// twilight belt, city lights on the night side, the thin blue rim of air at the limb that turns orange where the
// Sun rises and sets, the Sun itself (hidden behind the Earth when it sets), and the stars.
// A dome that follows the camera, drawn first. Units inside the shader: km, Earth's centre at the origin, axes =
// the local frame (x right, y up away from Earth, z backward).
import * as THREE from 'three';
import { seenT, sunPhase, betaAt, N_ORB, R_E } from './timeline.js';

const DEG = Math.PI / 180;
const INC = 51.6 * DEG;                  // the station's orbit
const W_E = 7.2921e-5;                   // Earth's spin, rad/s
// where the ground track starts: over the coast of Morocco, heading north-east (the Mediterranean, then Asia, pass
// under you during the long drop)
const LAT0 = 33 * DEG, LON0 = -8 * DEG;
const TH0 = Math.asin(Math.sin(LAT0) / Math.sin(INC));
const OM0 = LON0 - Math.atan2(Math.sin(TH0) * Math.cos(INC), Math.cos(TH0));

export function makeEarth() {
  const loader = new THREE.TextureLoader();
  const load = (f) => new Promise((res) => loader.load(f, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping; res(t); }, undefined, () => res(null)));
  const U = {
    uDay: { value: null }, uNight: { value: null }, uClouds: { value: null },
    uCam: { value: new THREE.Vector3(0, 6791, 0) }, uM: { value: new THREE.Matrix3() }, uSun: { value: new THREE.Vector3(0, 1, 0) },
    uSunAlt: { value: 100 }, uStarK: { value: 0 }, uTime: { value: 0 }, uPx: { value: 0.001 }, uFire: { value: 0 },
    uYouH: { value: 6791 }, uHazeK: { value: 1 },
  };
  const ready = Promise.all([load('textures/earth_day.jpg'), load('textures/earth_night.jpg'), load('textures/earth_clouds.jpg')])
    .then(([d, n, c]) => { U.uDay.value = d; U.uNight.value = n; U.uClouds.value = c; });
  const mat = new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false, depthTest: false, glslVersion: THREE.GLSL3,
    vertexShader: /* glsl */ `out vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uDay, uNight, uClouds;
      uniform vec3 uCam, uSun; uniform mat3 uM;
      uniform float uSunAlt, uStarK, uTime, uPx, uFire, uYouH, uHazeK;
      in vec3 vD;
      out vec4 fragColor;
      const float R = 6371.0;
      float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p, int oct) { float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++) { if (i >= oct) break; s += a * n3(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
      vec3 stars(vec3 d) {
        vec3 s = vec3(0.0);
        for (int k = 0; k < 2; k++) {
          float sc = k == 0 ? 110.0 : 240.0;
          vec3 p = d * sc; vec3 i = floor(p);
          float h = h13(i + float(k) * 13.1);
          if (h > 0.968) {
            vec3 c = i + 0.5 + (vec3(h13(i + 1.3), h13(i + 2.7), h13(i + 4.1)) - 0.5) * 0.7;
            float dd = length(p - c) / sc;
            float b = pow(h13(i + 9.9), 4.0) * 3.0 + 0.25;
            s += mix(vec3(1.0, 0.85, 0.7), vec3(0.75, 0.85, 1.0), h13(i + 5.5)) * b * exp(-dd * dd / (uPx * uPx * 0.8));
          }
        }
        return s;
      }
      // sample a map at lon/lat uv with the seam at the dateline hidden (derivatives from the better of two wrappings)
      vec3 mapAt(sampler2D t, vec2 uv) {
        vec2 uv2 = vec2(fract(uv.x + 0.5), uv.y);
        vec2 gx = dFdx(uv), gy = dFdy(uv), gx2 = dFdx(uv2), gy2 = dFdy(uv2);
        if (dot(gx2, gx2) + dot(gy2, gy2) < dot(gx, gx) + dot(gy, gy)) { gx = gx2; gy = gy2; }
        return textureGrad(t, uv, gx, gy).rgb;
      }
      void main() {
        vec3 d = normalize(vD);
        vec3 o = uCam;
        float b = dot(o, d);
        float c = dot(o, o) - R * R;
        float disc = b * b - c;
        vec3 col = vec3(0.0);
        bool hit = disc > 0.0 && b < 0.0;
        // the air: the ray's closest approach to the Earth (its height above the ground), and the Sun there
        float closest = b < 0.0 ? sqrt(max(dot(o, o) - b * b, 0.0)) : length(o);
        float alt = closest - R;
        vec3 Q = normalize(o - d * max(-b, 0.0));
        float muQ = dot(Q, uSun);
        float lightQ = smoothstep(-0.32, 0.12, muQ);
        vec3 rimDay = vec3(0.5, 0.72, 1.0), rimSet = vec3(1.0, 0.42, 0.16);
        vec3 rimCol = mix(rimSet, rimDay, smoothstep(-0.06, 0.26, muQ));
        if (!hit) {
          // ---- space: stars, the Sun, the rim of air ----
          col += stars(uM * d) * uStarK;
          float sd = max(dot(d, uSun), 0.0);
          float sunVis = smoothstep(-4.0, 14.0, uSunAlt);
          vec3 sunCol = mix(vec3(1.0, 0.5, 0.22), vec3(1.0, 0.97, 0.9), smoothstep(2.0, 45.0, uSunAlt));
          col += sunCol * (pow(sd, 9000.0) * 12.0 + pow(sd, 1800.0) * 0.3 + pow(sd, 40.0) * 0.015) * sunVis;
          float rim = exp(-max(alt, 0.0) / 48.0) * 0.42 + exp(-max(alt, 0.0) / 13.0) * 0.9 + exp(-max(alt, 0.0) / 3.5) * 1.6;
          col += rimCol * rim * lightQ * 0.85 * uHazeK;
          // the night side's faint green airglow, 90 km up
          col += vec3(0.1, 0.32, 0.22) * exp(-pow((alt - 92.0) / 16.0, 2.0)) * 0.22 * (1.0 - lightQ) * uHazeK;
          // forward glare of the low Sun through the air near the limb
          col += rimSet * pow(sd, 14.0) * 0.35 * (1.0 - smoothstep(8.0, 60.0, uSunAlt)) * smoothstep(-20.0, 0.0, uSunAlt) * exp(-max(alt, 0.0) / 30.0);
        } else {
          float t = -b - sqrt(disc);
          vec3 P = o + t * d;
          vec3 N = P / R;
          vec3 Ne = uM * N;
          float lat = asin(clamp(Ne.z, -1.0, 1.0)), lon = atan(Ne.y, Ne.x);
          vec2 uv = vec2(lon / 6.2831853 + 0.5, lat / 3.14159265 + 0.5);
          vec3 day = mapAt(uDay, uv);
          vec3 night = mapAt(uNight, uv);
          float cl = mapAt(uClouds, uv + vec2(uTime * 0.00004, 0.0)).r;
          // fine detail the maps don't have: ground texture, cloud edges, single city lights
          float det = fbm(Ne * 700.0, 4);
          float det2 = fbm(Ne * 2600.0 + 3.0, 3);
          day *= 0.78 + 0.35 * det + 0.12 * det2;
          float ocean = clamp((day.b - max(day.r, day.g) * 1.15) * 9.0, 0.0, 1.0);
          day = mix(day, vec3(0.05, 0.16, 0.4) * (0.8 + 0.4 * det), ocean * 0.75);
          cl = smoothstep(0.22, 0.8, cl * (0.6 + 0.8 * fbm(Ne * 1500.0 + vec3(0.0, uTime * 0.02, 0.0), 4)) + 0.1 * det2);
          float mu = dot(N, uSun);
          float sun = smoothstep(-0.1, 0.18, mu) * (0.25 + 0.75 * max(mu, 0.0));
          vec3 sunTint = mix(vec3(1.0, 0.55, 0.3), vec3(1.0), smoothstep(-0.05, 0.3, mu));
          vec3 lit = day * sun * sunTint * 1.25;
          // the Sun's glint on the sea
          vec3 H = normalize(uSun - d);
          float sp = pow(max(dot(N, H), 0.0), 420.0) * 3.0 + pow(max(dot(N, H), 0.0), 36.0) * 0.22;
          lit += sp * ocean * smoothstep(0.0, 0.2, mu) * sunTint;
          // clouds: white in the Sun, shadowing the ground
          lit *= 1.0 - 0.3 * cl;
          lit = mix(lit, vec3(1.0, 0.98, 0.96) * sun * sunTint * 1.25 * (0.75 + 0.35 * det), cl * 0.92);
          // the night: city lights, a few sparkling, and the ground a dim blue-grey under the stars
          float nightK = 1.0 - smoothstep(-0.14, 0.06, mu);
          float spark = smoothstep(0.78, 1.0, h13(floor(Ne * 7000.0) + 1.0));
          vec3 lights = night * vec3(1.0, 0.85, 0.6) * (1.8 + 4.0 * spark) * (1.0 - 0.75 * cl);
          vec3 dark = day * 0.012 + vec3(0.004, 0.006, 0.012);
          col = lit + (lights + dark) * nightK;
          // the air between you and the ground: blue haze, thick toward the limb (the ground fades into it)
          float ct = max(-dot(N, d), 0.015);
          float haze = (1.0 - exp(-0.075 / ct)) * uHazeK;
          vec3 hazeCol = mix(vec3(0.46, 0.62, 0.95), vec3(1.0, 0.5, 0.25), smoothstep(0.2, -0.02, mu) * smoothstep(-0.16, 0.0, mu)) * sun * 1.15
            + vec3(0.02, 0.03, 0.06) * nightK;
          col = mix(col, hazeCol, haze);
          // the rim of air seen against the ground just inside the limb
          col += rimCol * lightQ * exp(-max(alt, 0.0) / 3.5) * 0.0;
          // the fireball lighting the ground and the clouds under it (the last shots)
          vec3 under = vec3(0.0, R, 0.0);
          col += vec3(1.0, 0.6, 0.3) * uFire * exp(-pow(length(P - under) / 30.0, 2.0)) * (0.4 + 0.6 * cl) * 0.14;
        }
        fragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 32), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;

  const M = new THREE.Matrix3();
  const up = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3(), back = new THREE.Vector3();
  const sunL = new THREE.Vector3();
  // v: video time; h: your height (m); cam: the camera's position in the local frame (m); returns what the lights need
  function update(v, h, cam) {
    const S = seenT(v);
    const th = TH0 + N_ORB * S, om = OM0 - W_E * S;
    const ci = Math.cos(INC), si = Math.sin(INC);
    up.set(Math.cos(om) * Math.cos(th) - Math.sin(om) * Math.sin(th) * ci, Math.sin(om) * Math.cos(th) + Math.cos(om) * Math.sin(th) * ci, Math.sin(th) * si);
    fwd.set(-Math.cos(om) * Math.sin(th) - Math.sin(om) * Math.cos(th) * ci, -Math.sin(om) * Math.sin(th) + Math.cos(om) * Math.cos(th) * ci, Math.cos(th) * si).normalize();
    back.copy(fwd).negate();
    right.crossVectors(up, back);
    M.set(right.x, up.x, back.x, right.y, up.y, back.y, right.z, up.z, back.z);   // columns: the local axes in Earth's frame
    U.uM.value.copy(M);
    // the Sun in the local frame: round your orbit by sunPhase, tilted by BETA
    const ps = sunPhase(v) * DEG, bt = betaAt(v) * DEG, cb = Math.cos(bt), sb = Math.sin(bt);
    sunL.set(sb, cb * Math.cos(ps), cb * Math.sin(ps)).normalize();
    U.uSun.value.copy(sunL);
    const Rk = R_E / 1000;
    U.uCam.value.set(cam.x / 1000, Rk + h / 1000 + cam.y / 1000, cam.z / 1000);
    U.uYouH.value = Rk + h / 1000;
    // how far above the ground the line to the Sun passes (negative: the Sun is behind the Earth)
    const o = U.uCam.value, bs = o.dot(sunL);
    const sunAlt = bs < 0 ? Math.sqrt(Math.max(o.lengthSq() - bs * bs, 0)) - Rk : o.length() - Rk;
    U.uSunAlt.value = sunAlt;
    const sunK = THREE.MathUtils.smoothstep(sunAlt, -3, 18);
    U.uStarK.value = 1 - THREE.MathUtils.smoothstep(sunAlt, -25, 8);
    U.uTime.value = S;
    const lit = THREE.MathUtils.smoothstep(sunL.y, -0.5, 0.35);        // how much of the Earth below you is in daylight
    return { sun: sunL, sunK, sunAlt, lit, warm: 1 - THREE.MathUtils.smoothstep(sunAlt, 0, 40) };
  }
  return { mesh, U, ready, update };
}

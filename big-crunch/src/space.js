// After Earth is gone: you, drifting in space, until the Big Crunch. The Sun has thrown off its outer layers: a
// glowing shell of gas (a planetary nebula) spreads out around the tiny, white-hot core left behind (a white dwarf)
// and fades. The sky: the stars of our galaxy (by then merged with Andromeda into one big ball of stars) and the
// other galaxies far off. While the universe still expands they recede, redder and smaller; once it turns around
// they come back, blue-shifted, bigger and more of them, until they crash together and fill the sky with starlight.
// Then the Big Bang's leftover light, squeezed hotter and hotter, makes the whole sky glow: dull red, orange,
// white-hot, hotter than the stars themselves (they boil away), and at the end everything is one white blaze.
import * as THREE from 'three';
import { makeCrowd } from './crowd.js';
import { makeGlows } from './glows.js';
import { YOU_COL } from './people.js';
import { V_ENGULF, V_CRUNCH } from './timeline.js';
import { smooth, clamp, lerp } from './util.js';
import { blackbody } from './sky.js';

const skyFrag = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform float uGal; uniform float uRed; uniform float uBack; uniform float uMerge; uniform float uNeb; uniform float uNebR;
uniform vec3 uWD; uniform float uGlow; uniform float uTime; uniform vec3 uBg; uniform float uBoil; uniform float uWhite; uniform vec3 uFwd; uniform float uSquash; uniform float uSpin;
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
vec3 stars(vec3 v, float scale, float thr, float bright) {
  vec3 sp = v * scale;
  vec3 ci = floor(sp);
  float st = hash13(ci);
  if (st < thr) return vec3(0.0);
  vec3 cp = ci + 0.5 + (vec3(hash13(ci + 1.7), hash13(ci + 4.1), hash13(ci + 9.3)) - 0.5) * 0.6;
  float d = length(sp - cp);
  float b = pow((st - thr) / (1.0 - thr), 3.0) * bright;
  float tcol = hash13(ci + 2.2);
  vec3 col = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.75, 0.5), tcol);
  // boiling away: each star swells into a fuzzy blob before it is lost in the glow
  float w = 16.0 / (1.0 + 10.0 * uBoil);
  return col * b * (1.0 + 2.0 * uBoil) * exp(-d * d * w);
}
void main() {
  vec3 v = normalize(vDir);
  // the crunch: the whole sky is squeezed into a ball around the point uFwd, covering the angle PI * uSquash; a view
  // direction at angle ca inside it shows what was at angle ca / uSquash, twisted around the point (the spin)
  vec3 P = normalize(uFwd);
  float ca = acos(clamp(dot(v, P), -1.0, 1.0));
  vec3 perp = v - P * dot(v, P);
  perp = length(perp) > 1e-5 ? normalize(perp) : normalize(cross(P, vec3(0.0, 1.0, 0.0)));
  float Rb = 3.14159 * uSquash;
  float inside = 1.0;
  if (uSquash < 0.999) {
    inside = 1.0 - smoothstep(Rb * 0.97, Rb, ca);
    float a2 = min(ca / uSquash, 3.14159);
    float tw = uSpin * (1.0 - ca / max(Rb, 1e-4));
    vec3 pq = perp * cos(tw) + cross(P, perp) * sin(tw);
    v = normalize(P * cos(a2) + pq * sin(a2));
  }
  vec3 c = vec3(0.0015, 0.002, 0.004);
  // our galaxy, merged into one huge elliptical ball of stars: a smooth glow, brightest toward its centre
  vec3 gc = normalize(vec3(-0.5, 0.25, -0.8));
  float g = pow(max(dot(v, gc), 0.0), 2.0) * 0.08 + exp(-acos(clamp(dot(v, gc), -1.0, 1.0)) * 2.2) * 0.12;
  c += vec3(1.0, 0.85, 0.65) * g * 0.4 * (0.8 + 0.4 * fbm3(v * 4.0));
  c += stars(v, 300.0, 0.975, 2.2) + stars(v, 700.0, 0.985, 1.2);
  // the other galaxies: small tilted spirals. Receding: redder, smaller, fainter. Coming back: bluer, bigger, more
  // and more of them (the far ones come into view), all rushing in
  vec3 gcol = mix(mix(vec3(0.85, 0.9, 1.0), vec3(1.0, 0.35, 0.15), uRed), vec3(0.55, 0.75, 1.0), uBack);
  float nGal = 9.0 + 51.0 * uBack;
  for (int k = 0; k < 60; k++) {
    float fk = float(k);
    if (fk >= nGal) break;
    float h1 = fract(sin(fk * 12.9898) * 43758.5453), h2 = fract(sin(fk * 78.233) * 12345.678), h3 = fract(sin(fk * 39.425) * 24634.6345);
    vec3 gd = k < 9 ? normalize(vec3(sin(fk * 2.4 + 0.5) * 0.9, cos(fk * 1.7) * 0.5 + 0.1, -0.6 - 0.4 * cos(fk * 0.9)))
                    : normalize(vec3(h1 * 2.0 - 1.0, (h2 * 2.0 - 1.0) * 0.8, -0.3 - 0.9 * h3));
    vec3 a1 = normalize(cross(gd, vec3(0.3, 1.0, 0.1))), a2 = cross(gd, a1);
    float size = (0.012 + 0.008 * fract(fk * 0.37)) * (1.6 - 1.1 * uRed) * (1.0 + 5.0 * uBack * uBack * (0.4 + 0.6 * h3));
    vec2 q = vec2(dot(v, a1), dot(v, a2)) / size;
    float cs = cos(fk), sn = sin(fk); q = mat2(cs, -sn, sn, cs) * q; q.y *= 2.2;
    float r = length(q);
    if (r > 6.0) continue;
    float arms = 0.5 + 0.5 * sin(atan(q.y, q.x) * 2.0 - r * 3.5 + uTime * 0.3 * uBack);
    float gl = (exp(-r * r * 3.0) * 1.2 + exp(-r * 1.6) * arms * 0.6) * step(0.0, dot(v, gd));
    float fade = k < 9 ? 1.0 : smooth01(fk, nGal);
    c += gcol * gl * 0.35 * uGal * fade * (1.0 + 0.8 * uBack);
  }
  // crashed together: starlight everywhere, in torn streams
  if (uMerge > 0.0) {
    float n = fbm3(v * 3.5 + vec3(uTime * 0.08, 0.0, 0.0));
    float n2 = fbm3(v * 11.0 - vec3(0.0, uTime * 0.1, 0.0));
    c += vec3(0.75, 0.82, 1.0) * uMerge * (0.02 + 2.2 * pow(n, 4.0) + 0.6 * pow(n2, 3.0)) * 0.9;
  }
  // inside the expanding shell of gas the Sun threw off: hot glowing gas all around at first
  float d = acos(clamp(dot(v, normalize(uWD)), -1.0, 1.0));
  if (uNeb > 0.0) {
    float n = fbm3(v * 3.0 + vec3(0.0, 0.0, uTime * 0.05));
    float n2 = fbm3(v * 9.0 - vec3(uTime * 0.04));
    float ring = exp(-pow((d - uNebR) / (0.35 * uNebR + 0.02), 2.0));
    float inner = exp(-pow(d / (0.8 * uNebR + 0.02), 2.0));
    vec3 neb = vec3(0.2, 0.85, 0.75) * inner * 0.5 + vec3(1.0, 0.25, 0.18) * ring * (0.6 + 0.8 * n2);
    neb *= 0.6 + 0.8 * n;
    c += neb * uNeb * 1.4;
  }
  c += uGlow * vec3(1.0, 0.72, 0.42) * (0.6 + 0.6 * fbm3(v * 2.0 + uTime * 0.1));
  // the whole sky glowing: the Big Bang's leftover light, squeezed hot (uBg: its colour and brightness), seething
  float boilN = fbm3(v * 5.0 + vec3(uTime * 0.6, uTime * 0.4, 0.0));
  float gw = clamp(length(uBg) * 3.0, 0.0, 1.0);
  c = c * (1.0 - 0.8 * gw) + uBg * (0.1 + 3.2 * boilN * boilN * boilN);
  // squeezed: hotter and brighter the smaller it gets; outside it nothing, only streaks of light being dragged in
  // toward it and a white-hot rim
  if (uSquash < 0.999) {
    float k = 1.0 - uSquash;
    c *= inside * (1.0 + 0.8 * k * k);
    c = mix(c, vec3(1.0, 0.86, 0.62) * length(c) * 0.6, 0.5 * k * k);
    vec3 b1 = normalize(cross(P, vec3(0.0, 1.0, 0.0))), b2 = cross(P, b1);
    float phi = atan(dot(perp, b2), dot(perp, b1));
    float out_ = ca - Rb;
    float fall = noise3(vec3(phi * 9.0 + uSpin * 1.5, out_ * 6.0 + uTime * 9.0, 1.7));
    float streak = pow(fall, 6.0) * 2.0 * exp(-max(out_, 0.0) * 3.0) * step(0.0, out_) * smoothstep(0.0, 0.25, k);
    vec3 hot = uBg / max(length(uBg), 1e-3);
    c += mix(hot, vec3(1.0, 0.88, 0.7), k) * streak;
    c += vec3(1.0, 0.92, 0.75) * exp(-pow((ca - Rb) / (0.015 + 0.04 * uSquash), 2.0)) * (0.5 + 1.2 * k);
    c += vec3(1.0, 0.97, 0.92) * exp(-ca / (0.004 + 0.02 * uSquash)) * 3.0 * k * k;
  }
  c += vec3(uWhite * 8.0);
  gl_FragColor = vec4(c, 1.0);
}`.replace('void main()', 'float smooth01(float x, float n) { return clamp(n - x, 0.0, 1.0); }\nvoid main()');

export function makeSpace() {
  const scene = new THREE.Scene();
  const u = {
    uGal: { value: 1 }, uRed: { value: 0 }, uBack: { value: 0 }, uMerge: { value: 0 }, uNeb: { value: 0 }, uNebR: { value: 0.2 },
    uWD: { value: new THREE.Vector3(-0.2, 0.3, -1) }, uGlow: { value: 0 }, uTime: { value: 0 },
    uBg: { value: new THREE.Vector3() }, uBoil: { value: 0 }, uWhite: { value: 0 }, uFwd: { value: new THREE.Vector3(0, 0, -1) }, uSquash: { value: 1 }, uSpin: { value: 0 },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), new THREE.ShaderMaterial({
    uniforms: u, side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: `varying vec3 vDir; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vDir = wp.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * wp; gl_Position.z = gl_Position.w * 0.99999; }`,
    fragmentShader: skyFrag,
  }));
  sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);
  // the white dwarf: a brilliant point (with a soft glow) that cools
  const glows = makeGlows(scene, 16);
  // its light on you, a dim fill, and the light of the glowing sky all around at the end
  const key = new THREE.DirectionalLight(0xffffff, 2.5);
  const fill = new THREE.HemisphereLight(0x2a3550, 0x0a0a10, 0.5);
  const rim = new THREE.DirectionalLight(0xffc89a, 1.2);
  rim.position.set(-6, 2, 3);
  scene.add(key, key.target, fill, rim);
  // you, floating
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  // (in its own group, so the whole figure can be stretched and dragged into the crunch)
  const youG = new THREE.Group();
  youG.matrixAutoUpdate = false;
  scene.add(youG);
  const crowd = makeCrowd(youG, 1, mat, { castShadow: false });
  crowd.color(0, ...YOU_COL);
  const YOUP = new THREE.Vector3(0.9, 0.3, -9.0);   // upper right, clear of the counter and captions
  const youNow = YOUP.clone();                        // where you are now (for the YOU label)
  const UP = new THREE.Vector3(0, 1, 0), Q = new THREE.Quaternion(), Q0 = new THREE.Quaternion();
  const PT = new THREE.Vector3(), dir = new THREE.Vector3(), C = new THREE.Vector3(), S = new THREE.Matrix4(), M = new THREE.Matrix4();
  const wdC = new THREE.Color(), bg = new THREE.Color();
  const FIRE = [null, new THREE.Color(1, 0.42, 0.06), new THREE.Color(1, 0.78, 0.25), new THREE.Color(1, 0.94, 0.7)];
  return {
    scene,
    youPos: youNow,
    frame(v, camera, s) {
      const t = v - V_ENGULF;
      u.uTime.value = v;
      u.uGlow.value = 0.9 * (1 - smooth(0.2, 1.6, t));                       // still inside the hot gas
      u.uNeb.value = smooth(0.3, 1.2, t) * (1 - smooth(4.0, 6.5, t));
      u.uNebR.value = 0.12 + 0.18 * smooth(0.0, 6.0, t);
      u.uRed.value = s.out;
      u.uBack.value = s.back;
      u.uGal.value = (1 - 0.7 * s.out) * (1 - s.glow);
      u.uMerge.value = s.merge * (1 - s.glow);
      u.uBoil.value = s.boilStars;
      u.uWhite.value = s.white;
      // the sky's glow: blackbody colour of its temperature (the colour stops changing once it is white-hot),
      // brightening steeply as it heats
      // (a fire palette rather than the exact blackbody colour, which is a greyish white from ~4,000 K up and doesn't
      // read as hot on screen: deep red, orange, yellow, then a hot yellow-white)
      const T = s.skyT;
      if (T < 2800) bg.setRGB(1, 0.12, 0.02).lerp(FIRE[1], smooth(1600, 2800, T));
      else if (T < 5000) bg.copy(FIRE[1]).lerp(FIRE[2], smooth(2800, 5000, T));
      else bg.copy(FIRE[2]).lerp(FIRE[3], smooth(5000, 9000, T));
      const gI = s.glow * (0.55 + 0.45 * smooth(1600, 10000, T));
      u.uBg.value.set(bg.r * gI, bg.g * gI, bg.b * gI);
      const wd = u.uWD.value.clone().normalize().multiplyScalar(600);
      // the white dwarf cools: blue-white when new, ~5,000 K twelve billion years on; drowned in the glow at the end
      const Twd = lerp(30000, 5000, smooth(V_ENGULF + 1, V_CRUNCH - 4, v));
      blackbody(Twd, wdC);
      const bright = lerp(3.5, 1.2, smooth(V_ENGULF + 1, V_CRUNCH - 4, v)) * (1 - s.glow);
      glows.begin();
      glows.add(wd.x, wd.y, wd.z, 3.2 * (0.8 + 0.4 * bright / 3.5), wdC.r * bright * 4, wdC.g * bright * 4, wdC.b * bright * 4);
      glows.add(wd.x, wd.y, wd.z, 40, wdC.r * bright * 0.25, wdC.g * bright * 0.25, wdC.b * bright * 0.25);
      glows.end();
      key.position.copy(wd).normalize().multiplyScalar(50); key.target.position.set(0, 0, 0);
      key.color.copy(wdC).lerp(bg, s.glow); key.intensity = 0.6 + 0.9 * bright + 0.8 * gI;
      fill.color.setRGB(0.16, 0.21, 0.31).lerp(bg, s.glow); fill.groundColor.setRGB(0.04, 0.04, 0.06).lerp(bg, s.glow * 0.8);
      fill.intensity = 0.5 + 0.5 * gI + 0.3 * s.merge;
      rim.intensity = 0.5 + 1.6 * u.uGlow.value + 0.8 * u.uNeb.value;
      // you drift and slowly turn
      const a = v * 0.12;
      crowd.pose(0, { x: YOUP.x + Math.sin(v * 0.3) * 0.08, y: YOUP.y + Math.sin(v * 0.4) * 0.06, z: YOUP.z, yaw: Math.PI - 0.5 + a * 0.6, pitch: 0.25 + Math.sin(v * 0.5) * 0.06, roll: 0.15 * Math.sin(a), armL: 0.5 + 0.2 * Math.sin(v * 0.7), armR: 0.6 + 0.2 * Math.sin(v * 0.6 + 1), stride: 0.35, walk: 0.9 });
      crowd.commit();
      // the view: a slow drift, and a growing tremble as everything falls in
      const sh = 0.004 * s.boilStars + 0.002 * s.merge;
      camera.position.set(0, 0, 0);
      camera.rotation.set(0.02 + Math.sin(v * 0.2) * 0.01 + sh * Math.sin(v * 41), 0.06 + t * 0.0015 + sh * Math.sin(v * 33 + 1), sh * 0.5 * Math.sin(v * 27));
      // the point everything falls into: a little above the middle of the view, left of you
      u.uFwd.value.set(-0.06, 0.12, -1).normalize().applyEuler(camera.rotation);
      u.uSquash.value = s.squash;
      u.uSpin.value = 6.0 * Math.pow(1 - s.squash, 2);
      // the point in the scene, a bit beyond you; you are dragged toward it, stretched along the pull (up to 4.5x
      // long) and squeezed thin across it, shrinking to nothing as you reach it
      PT.copy(u.uFwd.value).multiplyScalar(14);
      C.set(YOUP.x, YOUP.y + 0.9, YOUP.z);
      const d = s.drag;
      dir.copy(PT).sub(C).normalize();
      const along = 1 + 3.5 * Math.min(1, d * 2), across = Math.max(0.02, (1 - 0.7 * Math.min(1, d * 2)) * (1 - smooth(0.75, 1, d)));
      // turn head-first toward the point, then stretch along your own height (long and thin, like spaghetti)
      Q.setFromUnitVectors(UP, dir);
      Q0.identity().slerp(Q, Math.min(1, d * 3));
      S.makeScale(across, along, across);
      const pos = C.clone().lerp(PT, d);
      M.makeTranslation(pos.x, pos.y, pos.z).multiply(new THREE.Matrix4().makeRotationFromQuaternion(Q0)).multiply(S)
        .multiply(new THREE.Matrix4().makeTranslation(-C.x, -C.y, -C.z));
      youG.matrix.copy(M);
      youG.matrixWorldNeedsUpdate = true;
      youNow.set(YOUP.x, YOUP.y, YOUP.z).add(pos).sub(C);
      // the light: the squeezed ball of light, where the point is
      if (s.squash < 0.999) {
        const k = 1 - s.squash;
        key.position.copy(u.uFwd.value).multiplyScalar(50);
        key.color.lerp(new THREE.Color(1, 0.93, 0.8), k);
        key.intensity = lerp(key.intensity, 1.4, k);
        fill.intensity *= 1 - 0.85 * k;
      }
    },
  };
}

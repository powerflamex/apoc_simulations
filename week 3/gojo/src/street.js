// The street: wet asphalt with lane lines and crosswalks, sidewalks, pools of light under the street lamps (each
// lamp's pool goes out when Blue takes the lamp), the crater where the ball lands, the Purple cuts (the ground is
// discarded inside them; the trench below is its own mesh, a smooth-walled half pipe glowing at the fresh edge).
// Also the street furniture meshes (lamps, signal masts, neon signs, LED screens): fx.js moves their instances.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROAD, WALK, ZC, XC, ZHALF, LAMPS, SIGNALS, SIGNS, SCREENS } from './layout.js';
import { CU, CUT_GLSL } from './cuts.js';
import { PURPLES, BLUE } from './timeline.js';

export const SU = {
  uTime: { value: 0 }, uLamps: { value: LAMPS.map((l) => new THREE.Vector4(l.x - Math.sign(l.x) * 2.2, 0, l.z, 1)) },
  uCrater: { value: 0 }, uCraterC: { value: new THREE.Vector2(BLUE.x, BLUE.z) }, uBlueL: { value: 0 },
};
const N_L = LAMPS.length;

const GROUND_PARS = /* glsl */ `
uniform float uTime; uniform vec4 uLamps[${N_L}]; uniform float uCrater; uniform vec2 uCraterC; uniform float uBlueL;
${CUT_GLSL}
varying vec3 vGW;
float gh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(gh(i), gh(i+vec2(1,0)), f.x), mix(gh(i+vec2(0,1)), gh(i+vec2(1,1)), f.x), f.y); }
float gfbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * gn(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
float distGrid(float x, float period, float off) { return abs(mod(x - off + period * 0.5, period) - period * 0.5); }
`;

export function makeStreet(scene, ctx) {
  // ---------- ground ----------
  const gmat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0 });
  gmat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, CU, SU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGW = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = GROUND_PARS + sh.fragmentShader
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n if (purpleD(vGW) < 0.0) discard;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 p = vGW.xz;
        float ax = abs(p.x);
        // which kind of ground: the avenue's road, its sidewalks, the cross streets, the other avenues, blocks
        float cz = distGrid(p.y, 95.0, 610.0);
        float cx = 1e3; ${XC.map((x) => `cx = min(cx, abs(p.x - (${x.toFixed(1)})));`).join(' ')}
        bool avenue = ax < ${ROAD.toFixed(1)};
        bool walk = ax >= ${ROAD.toFixed(1)} && ax < ${WALK.toFixed(1)};
        bool cross = cz < ${(ZHALF - 3).toFixed(1)} || cx < 7.0;
        bool crossWalk = (cz < ${ZHALF.toFixed(1)} && cz >= ${(ZHALF - 3).toFixed(1)}) || (cx >= 7.0 && cx < 10.0);
        float n = gfbm(p * 0.35), n2 = gn(p * 3.1);
        vec3 asphalt = vec3(0.045, 0.045, 0.05) * (0.8 + 0.4 * n) * (0.9 + 0.2 * n2);
        vec3 conc = vec3(0.2, 0.19, 0.18) * (0.85 + 0.3 * n);
        vec3 c = conc;
        float wet = 0.4;
        if (avenue || cross) {
          c = asphalt; wet = 0.75 + 0.25 * smoothstep(0.45, 0.6, n);
          if (avenue && !(cz < ${ZHALF.toFixed(1)})) {
            // lane lines: dashed white between lanes, double yellow in the middle
            float dl = min(abs(ax - 3.75), abs(ax - 7.45));
            float dash = step(0.5, fract(p.y / 9.0));
            c = mix(c, vec3(0.55), (1.0 - smoothstep(0.06, 0.1, dl)) * dash);
            c = mix(c, vec3(0.6, 0.45, 0.08), 1.0 - smoothstep(0.06, 0.1, abs(ax - 0.2)));
          }
          // crosswalk stripes across the avenue at every crossing
          if (avenue && cz >= ${(ZHALF - 3.6).toFixed(1)} && cz < ${(ZHALF - 0.6).toFixed(1)}) c = mix(c, vec3(0.55), step(0.5, fract(p.x / 1.2)) * 0.9);
        } else if (walk || crossWalk) {
          c = conc * (0.9 + 0.12 * step(0.96, fract(p.y / 1.5)) );
          c = mix(c, vec3(0.12), 1.0 - smoothstep(0.1, 0.25, abs(ax - ${(ROAD + 0.15).toFixed(2)})));   // the curb
          wet = 0.45;
        } else {
          c = conc * 0.7;
        }
        // puddles: mirror-like patches
        float pud = smoothstep(0.58, 0.66, gfbm(p * 0.18 + 3.0));
        wet = max(wet, pud);
        c *= 1.0 - 0.45 * pud;
        // the crater where the ball came down: cracked, dark, ringed with rubble
        float dc = length(p - uCraterC);
        if (uCrater > 0.0) {
          float rr = 8.5 * uCrater;
          float ang = atan(p.y - uCraterC.y, p.x - uCraterC.x);
          float crack = (1.0 - smoothstep(0.0, 0.08, abs(fract(ang * 7.0 / 6.283 + gn(vec2(dc * 0.3, 1.0)) * 0.4) - 0.5) - 0.42)) * smoothstep(rr * 2.6, rr, dc);
          c = mix(c, vec3(0.03), crack * 0.9);
          c = mix(c, vec3(0.07, 0.065, 0.06) * (0.6 + 0.6 * n2), smoothstep(rr * 1.05, rr * 0.8, dc));
        }
        diffuseColor.rgb = c;
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.85, 0.32, wet);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // pools of light under the lamps (warm sodium-white), the ones Blue has taken are out
        {
          vec3 pool = vec3(0.0);
          for (int i = 0; i < ${N_L}; i++) {
            vec4 L = uLamps[i];
            vec2 d = vGW.xz - L.xz;
            pool += L.w * exp(-dot(d, d) / 70.0) * vec3(1.0, 0.78, 0.5);
          }
          totalEmissiveRadiance += diffuseColor.rgb * pool * 2.2;
          totalEmissiveRadiance += purpleGlow(vGW) * 1.4;
          // Blue's light on the wet street (a broad sheen below it)
          vec2 db = vGW.xz - uCraterC;
          totalEmissiveRadiance += vec3(0.25, 0.45, 1.0) * uBlueL * diffuseColor.rgb * 9.0 * exp(-dot(db, db) / 900.0);
        }`);
  };
  gmat.customProgramCacheKey = () => 'gojo-ground';
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000, 1, 1).rotateX(-Math.PI / 2).translate(0, 0, -2000), gmat);
  scene.add(ground);

  // ---------- the trenches ----------
  const tmat = new THREE.ShaderMaterial({
    uniforms: { ...CU, uK: { value: 0 }, uCap: { value: 0 } },
    side: THREE.BackSide,
    vertexShader: /* glsl */ `varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      ${CUT_GLSL}
      uniform float uK; uniform float uCap; varying vec3 vW; varying vec3 vN;
      float th(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      void main() {
        if (vW.y > 0.02) discard;
        vec3 a = uK < 0.5 ? uPA0 : uPB0; vec3 d = uK < 0.5 ? uPAd : uPBd; float s = uK < 0.5 ? uPAs : uPBs; float g = uK < 0.5 ? uPAg : uPBg;
        float t = dot(vW - a, d);
        if (t > s) discard;
        if (uCap > 0.5 ? t > 0.0 : t < 0.0) discard;
        // a perfectly smooth cut through soil, rock, pipes: banded strata, darker deeper
        float depth = -vW.y;
        float band = th(floor(vec3(depth * 0.7, 0.0, 0.0)) + 1.3);
        vec3 c = mix(vec3(0.16, 0.12, 0.09), vec3(0.28, 0.24, 0.2), band) * (0.75 + 0.25 * th(floor(vW * 0.5)));
        c *= smoothstep(-60.0, 0.0, vW.y) * 0.7 + 0.3;
        // lit violet near the sphere and along the rim while it is fresh
        float rim = exp(-depth / 2.5);
        float front = exp(-max(s - t, 0.0) / 40.0);
        c *= 0.25;
        c += vec3(1.6, 0.5, 2.6) * g * (0.9 * rim + 1.2 * front) + vec3(0.5, 0.15, 0.8) * g * 0.6;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const trenches = PURPLES.map((P, k) => {
    const m = tmat.clone(); m.uniforms = { ...CU, uK: { value: k }, uCap: { value: 0 } };
    const mc = tmat.clone(); mc.uniforms = { ...CU, uK: { value: k }, uCap: { value: 1 } };
    const L = P.len + P.R;
    const g = new THREE.CylinderGeometry(P.R, P.R, L, 64, 1, true).rotateX(Math.PI / 2).translate(0, 0, -L / 2 + P.R * 0.0);
    const cyl = new THREE.Mesh(g, m);
    cyl.position.set(P.p0.x, P.p0.y, P.p0.z);
    cyl.lookAt(P.p0.x - P.d.x, P.p0.y - P.d.y, P.p0.z - P.d.z);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(P.R, 48, 24), mc);
    cap.position.set(P.p0.x, P.p0.y, P.p0.z);
    cyl.frustumCulled = false; cap.frustumCulled = false;
    scene.add(cyl, cap);
    return { cyl, cap };
  });

  // ---------- lamps ----------
  const { plainMat, glowMat } = ctx;
  const lampGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.11, 0.16, 9, 8).translate(0, 4.5, 0),
    new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6).rotateZ(Math.PI / 2).translate(-1.2, 8.9, 0),
    new THREE.BoxGeometry(0.75, 0.18, 0.4).translate(-2.35, 8.85, 0),
    new THREE.CylinderGeometry(0.25, 0.3, 0.6, 8).translate(0, 0.3, 0),
  ].map((g) => g.toNonIndexed()));
  const lamps = new THREE.InstancedMesh(lampGeo, plainMat(0x2a2c30, 0.6, { metalness: 0.4 }), LAMPS.length);
  lamps.frustumCulled = false;
  scene.add(lamps);
  // signal masts: a pole and an arm over the lanes with three signal heads
  const sigGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.16, 0.2, 7.2, 8).translate(0, 3.6, 0),
    new THREE.CylinderGeometry(0.1, 0.12, 9.5, 6).rotateZ(Math.PI / 2).translate(-4.6, 6.9, 0),
    ...[-2.5, -5.8, -9].map((x) => new THREE.BoxGeometry(0.4, 1.1, 0.35).translate(x, 6.3, 0)),
  ].map((g) => g.toNonIndexed()));
  const signals = new THREE.InstancedMesh(sigGeo, plainMat(0x1d1f22, 0.6, { metalness: 0.3 }), SIGNALS.length);
  signals.frustumCulled = false;
  scene.add(signals);

  // ---------- neon signs (a canvas atlas of words) ----------
  const WORDS = ['HOTEL', 'PIZZA', 'BAR', 'DINER', 'OPEN 24H', 'PHARMACY', 'SUSHI', 'THEATER', 'COFFEE', 'TACOS', 'LIQUOR', 'NAILS', 'DELI', 'BURGERS', 'CLUB', 'RAMEN'];
  const COLS = ['#ff3b6b', '#ffd23b', '#3bd6ff', '#ff6a2b', '#9b5bff', '#48ff8a', '#ff3bd2', '#ffb03b'];
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 1024;
  const g2 = cv.getContext('2d');
  g2.fillStyle = '#000'; g2.fillRect(0, 0, 1024, 1024);
  WORDS.forEach((w, i) => {
    const x = (i % 4) * 256, y = Math.floor(i / 4) * 256;
    g2.save(); g2.translate(x + 128, y + 128);
    g2.font = `bold ${w.length > 6 ? 40 : 58}px Arial, sans-serif`; g2.textAlign = 'center'; g2.textBaseline = 'middle';
    g2.shadowColor = '#fff'; g2.shadowBlur = 10; g2.fillStyle = '#fff'; g2.fillText(w, 0, 0);
    g2.strokeStyle = '#fff'; g2.lineWidth = 4; g2.strokeRect(-118, -60, 236, 120);
    g2.restore();
  });
  const atlas = new THREE.CanvasTexture(cv); atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = 4;
  const signGeo = new THREE.PlaneGeometry(1, 1);
  const aUV = new Float32Array(SIGNS.length * 2), aCol = new Float32Array(SIGNS.length * 3);
  SIGNS.forEach((s, i) => {
    aUV.set([(s.word % 4) / 4, Math.floor(s.word / 4) / 4], i * 2);
    const c = new THREE.Color(COLS[(s.word * 3 + i) % COLS.length]); aCol.set([c.r, c.g, c.b], i * 3);
  });
  signGeo.setAttribute('aUV', new THREE.InstancedBufferAttribute(aUV, 2));
  signGeo.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 3));
  const signMat = new THREE.ShaderMaterial({
    uniforms: { uAtlas: { value: atlas }, uTime: SU.uTime, uFogD: { value: 0 } }, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `attribute vec2 aUV; attribute vec3 aCol; varying vec2 vUv; varying vec3 vCol; varying float vD; varying float vSeed;
      void main(){ vec2 uv = uv; vUv = aUV + vec2(uv.x, 1.0 - uv.y) * 0.25; vUv.y = 1.0 - vUv.y; vCol = aCol; vSeed = float(gl_InstanceID);
        vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); vD = length(mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform sampler2D uAtlas; uniform float uTime; uniform float uFogD; varying vec2 vUv; varying vec3 vCol; varying float vD; varying float vSeed;
      void main(){ float t = texture2D(uAtlas, vUv).r;
        float flick = 0.85 + 0.15 * step(0.2, fract(sin(floor(uTime * 9.0) + vSeed * 7.1) * 43758.5));
        vec3 c = vCol * (0.04 + t * 3.0 * flick) + vec3(1.0) * t * t * 0.6;
        float fog = exp(-uFogD * uFogD * vD * vD);
        gl_FragColor = vec4(c * fog, 1.0); }`,
  });
  const signs = new THREE.InstancedMesh(signGeo, signMat, SIGNS.length);
  signs.frustumCulled = false;
  scene.add(signs);

  // ---------- LED screens: an ad loop (colour fields, a sweeping logo band) ----------
  const scrGeo = new THREE.PlaneGeometry(1, 1);
  const aSeed = new Float32Array(SCREENS.map((s) => s.seed));
  scrGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 1));
  const scrMat = new THREE.ShaderMaterial({
    uniforms: { uTime: SU.uTime }, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `attribute float aSeed; varying vec2 vUv; varying float vS; void main(){ vUv = uv; vS = aSeed; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `uniform float uTime; varying vec2 vUv; varying float vS;
      vec3 pal(float t){ return 0.5 + 0.5 * cos(6.283 * (t + vec3(0.0, 0.33, 0.67))); }
      void main(){
        float slot = floor(uTime / 2.4 + vS * 3.0);
        vec3 a = pal(fract(slot * 0.37 + vS * 0.21)), b = pal(fract(slot * 0.61 + 0.5));
        vec3 c = mix(a, b, smoothstep(0.2, 0.8, vUv.y + 0.2 * sin(vUv.x * 5.0 + uTime)));
        float band = smoothstep(0.02, 0.0, abs(vUv.y - 0.5 - 0.25 * sin(uTime * 0.7 + vS)) - 0.07);
        c = mix(c, vec3(1.0), band * 0.8);
        // pixel grid
        vec2 g = fract(vUv * vec2(160.0, 90.0));
        c *= 0.75 + 0.25 * step(0.2, g.x) * step(0.2, g.y);
        float edge = step(0.015, vUv.x) * step(vUv.x, 0.985) * step(0.02, vUv.y) * step(vUv.y, 0.98);
        gl_FragColor = vec4(c * 0.95 * edge + vec3(0.02) * (1.0 - edge), 1.0); }`,
  });
  const screens = new THREE.InstancedMesh(scrGeo, scrMat, SCREENS.length);
  screens.frustumCulled = false;
  scene.add(screens);

  // home matrices
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const home = {
    lamps: LAMPS.map((l) => new THREE.Matrix4().compose(p.set(l.x, 0, l.z), q.setFromEuler(e.set(0, l.x > 0 ? 0 : Math.PI, 0)), sc.set(1, 1, 1))),
    signals: SIGNALS.map((s) => new THREE.Matrix4().compose(p.set(s.x, 0, s.z), q.setFromEuler(e.set(0, s.x > 0 ? 0 : Math.PI, 0)), sc.set(1, 1, 1))),
    signs: SIGNS.map((s) => new THREE.Matrix4().compose(p.set(s.x, s.y, s.z), q.setFromEuler(e.set(0, s.blade ? 0 : (s.face > 0 ? Math.PI / 2 : -Math.PI / 2), 0)), sc.set(s.blade ? s.w * 0 + 2.4 : s.w, s.h, 1))),
    screens: SCREENS.map((s) => new THREE.Matrix4().compose(p.set(s.x, s.y + s.h / 2, s.z), q.setFromEuler(e.set(0, s.face > 0 ? Math.PI / 2 : -Math.PI / 2, 0)), sc.set(s.w, s.h, 1))),
  };
  // blade signs stick straight out from the wall: their plane faces up/down the avenue
  SIGNS.forEach((s, i) => { if (s.blade) home.signs[i].compose(p.set(s.x, s.y, s.z), q.setFromEuler(e.set(0, 0, 0)), sc.set(2.2, s.h, 1)); });
  return { ground, trenches, lamps, signals, signs, screens, home, signMat };
}

// The view at the bottom of the street: the Bay (calm and gold at first, sloshing in big waves from magnitude ~9),
// the Bay Bridge's western span (two suspension spans, from Rincon Hill out to Yerba Buena Island; its upper deck
// drops into the water at ~9.4), Yerba Buena Island, and the East Bay hills behind Oakland 14 km away.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BAY_Y } from './layout.js';
import { V_BRIDGE } from './timeline.js';
import { quakeMat } from './quake.js';
import { smooth, clamp, lerp, rng } from './util.js';

// the bridge's line: from the anchorage on the shore to the island
const A = new THREE.Vector3(760, BAY_Y, -1180), Bend = new THREE.Vector3(-260, BAY_Y, -4300);
const dir = Bend.clone().sub(A).setY(0).normalize();
const LEN = Bend.clone().sub(A).setY(0).length();
const at = (k, y) => new THREE.Vector3(A.x + dir.x * LEN * k, BAY_Y + y, A.z + dir.z * LEN * k);
const TOWERS = [0.2, 0.47, 0.74], TOWER_H = 160, DECK_H = 58;

export function makeBay(scene, { plainMat }) {
  // ---------- water ----------
  const u = { uTime: { value: 0 }, uSun: { value: new THREE.Vector3(0, 0.12, 1) }, uWave: { value: 0 }, uFogC: { value: new THREE.Color() }, uFogD: { value: 0 }, uDust: { value: 0 } };
  const water = new THREE.Mesh(new THREE.PlaneGeometry(60000, 40000, 300, 200).rotateX(-Math.PI / 2).translate(0, BAY_Y, -21000), new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uWave; varying vec3 vW; varying float vH;
      void main() { vec3 p = position;
        float h = uWave * (sin(p.z * 0.004 + uTime * 0.9) * 0.6 + sin(p.x * 0.003 - p.z * 0.002 + uTime * 0.7) * 0.4);
        p.y += h; vH = h; vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uSun; uniform vec3 uFogC; uniform float uFogD; uniform float uWave; uniform float uDust;
      varying vec3 vW; varying float vH;
      float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h1(i), h1(i + vec2(1, 0)), f.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        vec2 p = vW.xz;
        vec2 g = vec2(n2(p * 0.02 + uTime * 0.1) - n2(p * 0.02 + vec2(0.3, 0.0) + uTime * 0.1), n2(p * 0.02 + vec2(0.0, 0.3) - uTime * 0.08) - n2(p * 0.02 - uTime * 0.08)) * 0.6;
        vec3 N = normalize(vec3(g.x, 1.0, g.y));
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 R = reflect(-V, N);
        // the evening sky over the East Bay: pink low, blue above
        vec3 sky = mix(vec3(0.95, 0.62, 0.55), vec3(0.42, 0.52, 0.72), smoothstep(0.0, 0.25, R.y));
        vec3 deep = vec3(0.04, 0.08, 0.11);
        vec3 c = mix(deep, sky, fres);
        c += vec3(1.0, 0.75, 0.5) * 0.25 * smoothstep(1.2, 4.0, vH) * uWave * 0.1;   // foam on the big swells
        float d = length(cameraPosition - vW);
        c = mix(c, uFogC, 1.0 - exp(-uFogD * uFogD * d * d));
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  water.frustumCulled = false;
  scene.add(water);

  // ---------- the bridge ----------
  const steel = quakeMat(plainMat(0x9aa0a6, 0.5, { metalness: 0.4 }), {});
  const towerGeo = mergeGeometries([-1, 1].map((s) => new THREE.BoxGeometry(5, TOWER_H, 7).translate(s * 14, TOWER_H / 2, 0).toNonIndexed())
    .concat([0.35, 0.62, 0.9].map((k) => new THREE.BoxGeometry(32, 4, 4).translate(0, TOWER_H * k, 0).toNonIndexed())));
  const towers = TOWERS.map((k) => { const m = new THREE.Mesh(towerGeo, steel); const p = at(k, 0); m.position.copy(p); m.rotation.y = Math.atan2(dir.x, dir.z); scene.add(m); return m; });
  // deck segments between the piers (each can fall on its own), and the main cables
  const KEYS = [0, ...TOWERS, 1];
  const decks = [];
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = at(KEYS[i], DECK_H), b = at(KEYS[i + 1], DECK_H);
    const len = a.distanceTo(b);
    const g = mergeGeometries([new THREE.BoxGeometry(28, 3, len).toNonIndexed(), new THREE.BoxGeometry(28, 6, len).translate(0, -6, 0).toNonIndexed()]);
    const m = new THREE.Mesh(g, steel);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.rotation.y = Math.atan2(dir.x, dir.z);
    scene.add(m);
    decks.push({ m, a, b, base: m.position.clone(), fall: i === 2 });
  }
  // main cables: catenary between the tower tops, down to the deck at the ends
  const cablePts = (side) => {
    const pts = [];
    for (let k = 0; k <= 200; k++) {
      const t = k / 200;
      const kk = lerp(KEYS[0] + 0.03, KEYS[KEYS.length - 1] - 0.03, t);
      let seg = 0; while (seg < KEYS.length - 2 && kk > KEYS[seg + 1]) seg++;
      const a = KEYS[seg], b = KEYS[seg + 1], f = (kk - a) / (b - a);
      const ha = seg === 0 ? DECK_H + 4 : TOWER_H, hb = seg === KEYS.length - 2 ? DECK_H + 4 : TOWER_H;
      const y = lerp(ha, hb, f) - 4 * (Math.min(ha, hb) - DECK_H - 8) * f * (1 - f);
      const p = at(kk, y);
      p.x += -dir.z * side * 14; p.z += dir.x * side * 14;
      pts.push(p);
    }
    return pts;
  };
  const cables = [-1, 1].map((s) => { const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cablePts(s)), 400, 0.6, 5), steel); scene.add(m); return m; });
  // Yerba Buena Island and the East Bay hills
  const hillMat = quakeMat(plainMat(0x3a4a3a, 0.95), {});
  const ybi = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2).scale(700, 105, 520), hillMat);
  ybi.position.set(Bend.x - 300, BAY_Y, Bend.z - 400);
  scene.add(ybi);
  const R = rng(5);
  const hillPts = [];
  for (let k = 0; k <= 160; k++) {
    const x = -16000 + k * 200;
    hillPts.push(new THREE.Vector2(x, 180 + 220 * Math.abs(Math.sin(k * 0.13)) * (0.6 + 0.4 * R()) + 120 * Math.sin(k * 0.031)));
  }
  hillPts.push(new THREE.Vector2(16000, -10), new THREE.Vector2(-16000, -10));
  const hillShape = new THREE.Shape(hillPts);
  const hills = new THREE.Mesh(new THREE.ShapeGeometry(hillShape), new THREE.MeshBasicMaterial({ color: 0x5a5a78, fog: true }));
  hills.position.set(0, BAY_Y, -14500);
  scene.add(hills);
  // lights on the bridge and in the East Bay
  const LIGHTS = [];
  for (let k = 0; k <= 60; k++) LIGHTS.push({ p: at(k / 60, DECK_H + 4), c: [2.2, 1.9, 1.4], s: 5 });
  for (const k of TOWERS) LIGHTS.push({ p: at(k, TOWER_H + 2), c: [5, 0.4, 0.2], s: 6, blink: true });
  for (let k = 0; k < 220; k++) LIGHTS.push({ p: new THREE.Vector3(-9000 + R() * 18000, BAY_Y + 5 + R() * 120, -9000 - R() * 5000), c: [1.6, 1.2, 0.7], s: 18 + R() * 20 });

  return {
    u, water,
    group: [water, ...towers, ...decks.map((d) => d.m), ...cables, ybi, hills],
    frame(v, s, glows) {
      u.uTime.value = v;
      u.uWave.value = 6 * smooth(15, 22, v) + 14 * smooth(22, 29, v);
      // the upper deck between the middle towers breaks loose and drops into the water
      for (const d of decks) {
        if (!d.fall) continue;
        const k = clamp((v - V_BRIDGE) / 2.6);
        d.m.position.copy(d.base); d.m.position.y -= (DECK_H + 8) * k * k;
        d.m.rotation.set(0.25 * k * k, Math.atan2(dir.x, dir.z), 0.15 * k);
      }
      const lightsOn = 1 - smooth(V_BRIDGE - 1, V_BRIDGE + 1, v);
      for (const L of LIGHTS) {
        const on = L.blink ? (Math.sin(v * 3) > 0 ? 1 : 0.1) : lightsOn;
        if (on > 0.02) glows.add(L.p.x, L.p.y, L.p.z, L.s, L.c[0] * on, L.c[1] * on, L.c[2] * on);
      }
    },
  };
}

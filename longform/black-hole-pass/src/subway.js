// The subway platform, 30 minutes before: hundreds sheltering (sitting against the wall, standing, a stopped train with
// its doors open), the ground rumbling, dust falling, the lights flickering. Then the ocean, pulled toward the hole,
// bursts down the north stairs: the tracks flood, the water climbs over the platform, the lights die (red emergency
// lights, phone torches), and you wade to the south stairs and climb out.
// Metres; the platform runs north-south (-z north): platform x 0..6 at y 0, the track bed x -4.6..0 at y -1.3.
import * as THREE from 'three';
import { makeFleet } from './cars.js';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { rng, smooth, clamp, lerp, DEG, wobble } from './util.js';

const EYE = 1.66;
const N_STAIR = { x0: 2.2, x1: 5.6, z0: -46, z1: -36 };   // the stairs the water comes down (top at z0)
const S_STAIR = { x0: 2.2, x1: 5.6, z0: 30, z1: 39 };     // your way out (bottom at z0, top at z1)
const dummy = new THREE.Object3D();
const tmpC = new THREE.Color();

function spline(list, t) {
  if (t <= list[0][0]) return list[0][1];
  const n = list.length;
  if (t >= list[n - 1][0]) return list[n - 1][1];
  let i = 0;
  while (t > list[i + 1][0]) i++;
  const [t0, p0] = list[i], [t1, p1] = list[i + 1];
  const tm = i > 0 ? list[i - 1] : [t0 - (t1 - t0), p0 - (p1 - p0)];
  const tp = i + 2 < n ? list[i + 2] : [t1 + (t1 - t0), p1 + (p1 - p0)];
  const m0 = (p1 - tm[1]) / (t1 - tm[0]) * (t1 - t0), m1 = (tp[1] - p0) / (tp[0] - t0) * (t1 - t0);
  const u = (t - t0) / (t1 - t0), u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
}
// [v, x, y, z, yaw, pitch, fov]  (yaw 0 = north, + turns right; 180 = south)
const KEYS = [
  [200, 4.0, 0, -28, 172, -4, 58], [205, 4.2, 0, -24, 160, -8, 56], [209, 4.2, 0, -23, 196, -6, 56], [213, 4.2, 0, -23, 176, 4, 56],
  [215.5, 4.2, 0, -25, 170, 30, 54], [218.4, 4.0, 0, -29, 20, 6, 56], [219, 4.0, 0, -29.4, 10, 8, 56],
  // (outside 219-225) back in: the torrent pouring down the stairs, the wave racing at you; you turn and run in the
  // free strip (x 4.8: the crowd keeps to its columns at 1.6-3.8 and the wall) and up the south stairs
  [225, 4.6, 0, -30, 4, 10, 54], [227.6, 4.8, 0, -29, -2, 2, 56], [229.5, 4.8, 0, -26, -30, -18, 58], [232, 4.8, 0, -21, 160, -4, 58],
  [236, 4.8, 0, -11, 178, 0, 58], [241, 4.8, 0, 4, 180, 0, 58],
  [245, 4.75, 0, 22, 180, 6, 58], [248, 4.6, 0.5, 31, 180, 18, 58], [252, 4.6, 4.0, 38.5, 180, 14, 60],
];

export function makeSubway() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0c0b09, 0.006);
  scene.background = new THREE.Color(0x050505);
  const camera = new THREE.PerspectiveCamera(56, 1920 / 1080, 0.05, 400);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  const R = rng(3131);
  const plainMat = (color, rough = 0.9, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
  const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
  const shadowy = (m) => { m.frustumCulled = false; return m; };
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); scene.add(m); return m; };

  // tiles: a canvas texture (white glazed tiles with a dark band and the station name)
  const tileTex = (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#c9c5b8'; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = '#8f8a7e'; g.lineWidth = 3;
    for (let i = 0; i <= 512; i += 32) { g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); }
    for (let j = 0; j < 16; j++) for (let i = 0; i <= 512; i += 64) { g.beginPath(); g.moveTo(i + (j % 2) * 32, j * 32); g.lineTo(i + (j % 2) * 32, j * 32 + 32); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  })();
  const wallMat = plainMat(0xffffff, 0.35, { map: tileTex });
  wallMat.map.repeat.set(24, 2);
  const L = 110, ZC = -4;   // the hall: z from -59 to 51
  add(new THREE.BoxGeometry(6.4, 0.3, L), plainMat(0x6e6a62, 0.75), 3.2, -0.15, ZC);                 // platform
  add(new THREE.BoxGeometry(0.4, 0.06, L), plainMat(0xc8a400, 0.6), 0.3, 0.02, ZC);                  // the yellow edge
  add(new THREE.BoxGeometry(5.0, 0.2, L), plainMat(0x2a2622, 0.95), -2.3, -1.4, ZC);                 // track bed
  for (const x of [-3.3, -1.3]) add(new THREE.BoxGeometry(0.12, 0.15, L), plainMat(0x777777, 0.4, { metalness: 0.7 }), x, -1.22, ZC);
  const back = add(new THREE.BoxGeometry(0.3, 4.6, L), wallMat, 6.55, 2.1, ZC);
  const far = add(new THREE.BoxGeometry(0.3, 6.0, L), plainMat(0x3a3a36, 0.9), -4.95, 1.6, ZC);
  add(new THREE.BoxGeometry(12, 0.3, L), plainMat(0x2b2a27, 0.9), 0.8, 4.4, ZC);                     // ceiling
  // a dark band along the wall with the station's name
  {
    const c = document.createElement('canvas'); c.width = 2048; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#183a2c'; g.fillRect(0, 0, 2048, 128);
    g.fillStyle = '#ffffff'; g.font = '700 86px "Segoe UI", Arial'; g.textBaseline = 'middle';
    for (let i = 0; i < 4; i++) g.fillText('42 ST', 120 + i * 512, 66);
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(4, 1); t.colorSpace = THREE.SRGBColorSpace;
    const band = new THREE.Mesh(new THREE.PlaneGeometry(L, 0.75), plainMat(0xffffff, 0.5, { map: t }));
    band.position.set(6.38, 2.3, ZC); band.rotation.y = -Math.PI / 2; scene.add(band);
  }
  // columns along the platform edge
  const colMat = plainMat(0x3b4a44, 0.6, { metalness: 0.3 });
  const cols = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 4.4, 0.32).translate(0, 2.2, 0), colMat, 24);
  for (let i = 0; i < 24; i++) { dummy.position.set(1.1, 0, -56 + i * 4.6); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); cols.setMatrixAt(i, dummy.matrix); }
  scene.add(cols);
  // the fluorescent tubes (they flicker, then die; red emergency lamps take over)
  const TUBES = 22;
  const tubeMat = glowMat(new THREE.Color(3.2, 3.4, 3.0));
  const tubes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.08, 2.6), tubeMat, TUBES);
  for (let i = 0; i < TUBES; i++) { dummy.position.set(3.4, 4.2, -54 + i * 5); dummy.updateMatrix(); tubes.setMatrixAt(i, dummy.matrix); }
  scene.add(tubes);
  const tubeLights = [];
  for (let i = 0; i < 8; i++) { const p = new THREE.PointLight(0xe8f0ff, 30, 16, 1.5); p.position.set(3.4, 3.9, -44 + i * 11); scene.add(p); tubeLights.push(p); }
  const redMat = glowMat(new THREE.Color(6, 0.4, 0.2));
  const reds = [];
  for (let i = 0; i < 6; i++) {
    add(new THREE.BoxGeometry(0.3, 0.18, 0.12), redMat, 6.3, 3.4, -48 + i * 18);
    const p = new THREE.PointLight(0xff2a10, 0, 22, 1.4); p.position.set(5.8, 3.3, -48 + i * 18); scene.add(p); reds.push(p);
  }
  const hemi = new THREE.HemisphereLight(0xd8d4c8, 0x403a30, 0.35);
  scene.add(hemi);

  // the stopped train on the track: a long lit box with windows, doors open
  {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#9aa0a6'; g.fillRect(0, 0, 1024, 128);
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 3 === 1 ? '#2a2a2a' : '#fff4d0'; g.fillRect(20 + i * 126, 26, 100, i % 3 === 1 ? 102 : 52); }
    g.fillStyle = '#a3262a'; g.fillRect(0, 96, 1024, 8);
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(5, 1); t.colorSpace = THREE.SRGBColorSpace;
    const train = new THREE.Mesh(new THREE.BoxGeometry(3.0, 3.4, 80), [plainMat(0x9aa0a6, 0.4, { metalness: 0.5 }), new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.55, roughness: 0.4, metalness: 0.3 }), plainMat(0x8a9096, 0.4), plainMat(0x555a60, 0.6), plainMat(0x9aa0a6, 0.4), plainMat(0x9aa0a6, 0.4)]);
    // (the window side faces the platform: +x is material 0, so swap: rotate)
    train.rotation.y = Math.PI;
    train.position.set(-2.3, 0.45, -12);
    scene.add(train);
    const inside = new THREE.PointLight(0xfff0c8, 12, 9, 1.6); inside.position.set(-0.6, 1.6, -18); scene.add(inside);
  }
  // the stairs: north (the water comes down), south (your way out)
  const stairMat = plainMat(0x5a5650, 0.85);
  const mkStairs = (S, down) => {
    const n = 20, run = (S.z1 - S.z0) / n, rise = 4.4 / n;
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(S.x1 - S.x0, rise, Math.abs(run) + 0.02), stairMat, n);
    for (let i = 0; i < n; i++) {
      const k = down ? n - 1 - i : i;   // step k is k+1 steps up
      dummy.position.set((S.x0 + S.x1) / 2, rise * (k + 0.5), S.z0 + run * (i + 0.5)); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
    }
    scene.add(m);
    add(new THREE.BoxGeometry(0.2, 5, Math.abs(S.z1 - S.z0) + 2), wallMat, S.x0 - 0.1, 2.5, (S.z0 + S.z1) / 2);
  };
  mkStairs(N_STAIR, true);
  mkStairs(S_STAIR, false);
  // light from up the south stairs (the way out)
  { const p = new THREE.PointLight(0xffd0a0, 7, 14, 1.5); p.position.set(3.9, 5.2, 41); scene.add(p); }

  // ---------- people sheltering ----------
  // the sitters along the wall every 0.9 m, the standers on a 1.1 m grid across the platform (a few spots left empty);
  // crowd.js people face +z at yaw 0, so pose() gets yaw + PI (yaw here: the way they face with -z ahead)
  const people = [];
  for (let z = -40; z < 26; z += 0.9) if (R() < 0.8) people.push({ x: 5.75, z: z + (R() - 0.5) * 0.15, sit: true, yaw: Math.PI / 2 + (R() - 0.5) * 0.5 });
  // (three columns of standers; the strip x 4.3-5.3 stays free: your way out. None where you stand before the flood)
  for (let z = -39.5; z < 26; z += 1.1) for (const x of [1.6, 2.7, 3.8]) if (R() < 0.55 && !(x > 3 && z > -32 && z < -20)) people.push({ x: x + (R() - 0.5) * 0.15, z: z + (R() - 0.5) * 0.2, sit: false, yaw: R() * 6.28 });
  // each column has its own line up the south stairs (0.7 m apart)
  const STAIR_LINE = (x) => (x < 2.2 ? 2.5 : x < 3.2 ? 3.2 : x < 4.3 ? 3.9 : 5.3);
  people.forEach((p, i) => Object.assign(p, { hop: R() * 6.28, h: 0.85 + R() * 0.25, phone: R() < 0.5, lane: STAIR_LINE(p.x) }));
  const PN = people.length;
  const crowd = makeCrowd(scene, PN, plainMat(0xffffff, 0.85), { castShadow: false });
  { const RP = rng(99); const clothes = [0x2b2d42, 0x8d99ae, 0xb3243a, 0xd8d8d0, 0x3a5a40, 0xc49a6c, 0x264653, 0xd9b44a, 0x6d597a, 0x1d1d1d]; people.forEach((p, i) => crowd.color(i, clothes[Math.floor(RP() * clothes.length)], [0x2b2d42, 0x3d405b, 0x1d1d1d, 0x6b705c][Math.floor(RP() * 4)], SKIN[Math.floor(RP() * SKIN.length)], HAIR[Math.floor(RP() * HAIR.length)], RP() < 0.7)); }
  // phone torches after the lights die
  const torches = new THREE.InstancedMesh(new THREE.SphereGeometry(0.04, 6, 4), glowMat(new THREE.Color(5, 5, 4.6)), PN);
  torches.frustumCulled = false; scene.add(torches);
  const torchLights = [0, 1, 2, 3].map(() => { const p = new THREE.PointLight(0xfff4e0, 0, 10, 1.6); scene.add(p); return p; });

  // ---------- the water ----------
  const waterU = { uT: { value: 0 } };
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x1a2622, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.95 });
  waterMat.onBeforeCompile = (sh) => {
    sh.uniforms.uT = waterU.uT;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uT; varying vec3 vWp;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec2 q = vWp.xz;
          float a = sin(q.x * 3.1 + uT * 3.3) + sin(q.y * 2.3 + uT * 4.6) + 0.6 * sin((q.x + q.y) * 6.1 + uT * 5.1);
          float b = cos(q.x * 2.7 - uT * 2.9) + cos(q.y * 3.3 + uT * 5.4) + 0.6 * cos((q.x - q.y) * 5.3 + uT * 4.3);
          normal = normalize(normal + (viewMatrix * vec4(a * 0.06, 0.0, b * 0.06, 0.0)).xyz); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        { // foam streaks flowing away from the north stairs (z -36), strongest near them
          vec2 q = vec2(vWp.x * 3.0, vWp.z * 0.7 - uT * 4.5);
          vec2 i = floor(q), f = fract(q); f = f * f * (3.0 - 2.0 * f);
          float h00 = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5), h10 = fract(sin(dot(i + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5);
          float h01 = fract(sin(dot(i + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5), h11 = fract(sin(dot(i + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5);
          float nz = mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
          float near = smoothstep(26.0, 0.0, vWp.z + 36.0) * 0.8 + 0.25;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.6, 0.66, 0.62), smoothstep(0.55, 0.9, nz) * near * 0.85);
        }`);
  };
  const water = new THREE.Mesh(new THREE.PlaneGeometry(11.5, L, 20, 100).rotateX(-Math.PI / 2), waterMat);
  water.position.set(0.8, -1.3, ZC);
  scene.add(water);
  // the torrent down the north stairs: a sloped sheet of churning white water
  const fallU = { uT: { value: 0 }, uOn: { value: 0 } };
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(N_STAIR.x1 - N_STAIR.x0 + 0.4, Math.hypot(N_STAIR.z1 - N_STAIR.z0, 4.4) + 1.5, 8, 40), new THREE.ShaderMaterial({
    uniforms: fallU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uT, uOn; varying vec2 vUv;
      float h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        // the front edge of the water races down from the top (uv.y 1 = top)
        float front = 1.0 - uOn * 1.3;
        if (vUv.y < front) discard;
        vec2 q = vec2(vUv.x * 9.0 + vUv.y * 3.0, vUv.y * 7.0 + uT * 9.0);
        float f = n(q) * 0.5 + n(q * 2.3 + 3.1) * 0.3 + n(q * 5.1 - 7.3) * 0.2;
        float foam = smoothstep(0.35, 0.8, f);
        vec3 c = mix(vec3(0.06, 0.1, 0.09), vec3(0.62, 0.68, 0.64), foam * 0.85);
        // (a glint of the platform lights along the flow)
        c += vec3(0.25, 0.28, 0.26) * pow(n(q * 0.5 + 9.0), 6.0);
        float edge = smoothstep(front, front + 0.06, vUv.y);
        gl_FragColor = vec4(c, (0.92 + 0.08 * foam) * edge);
      }`,
  }));
  {
    const ang = Math.atan2(4.4, N_STAIR.z1 - N_STAIR.z0);
    fall.rotation.set(-Math.PI / 2 + ang, 0, 0);
    // (lifted clear of the step corners, with a second layer just above it so the torrent looks thick)
    fall.position.set((N_STAIR.x0 + N_STAIR.x1) / 2, 2.35 + 0.5, (N_STAIR.z0 + N_STAIR.z1) / 2 + 0.2);
    scene.add(fall);
    const fall2 = fall.clone();
    fall2.position.y += 0.25; fall2.position.z += 0.1;
    fall2.scale.set(0.92, 1, 1);
    scene.add(fall2);
    fall.userData.twin = fall2;
  }
  // spray and dust: points
  const SN = 3000;
  const spray = [];
  for (let i = 0; i < SN; i++) spray.push({ x: N_STAIR.x0 + R() * (N_STAIR.x1 - N_STAIR.x0), z0: N_STAIR.z1 - R() * 1.5, vy: 1 + R() * 3, vz: 1.5 + R() * 4, ph: R(), dust: i < 900, dx: 1.2 + R() * 4.8, dz: -50 + R() * 90 });
  const sprayMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 5, 4), new THREE.MeshStandardMaterial({ color: 0xdfe8e8, roughness: 0.3, transparent: true, opacity: 0.7 }), SN);
  sprayMesh.frustumCulled = false; scene.add(sprayMesh);

  // the water that comes over the platform from the north stairs, racing toward you (5 m/s), its front foaming
  const PZ0 = N_STAIR.z1 - 1;
  const pwater = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1, 16, 40).rotateX(-Math.PI / 2).translate(0, 0, 0.5), waterMat);
  pwater.position.set(3.2, 0, PZ0);
  scene.add(pwater);
  const foamU = { uT: fallU.uT };
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 1.6).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: foamU, transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uT; varying vec2 vUv;
      float h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float f = n(vec2(vUv.x * 14.0, vUv.y * 6.0 - uT * 9.0)) * 0.6 + n(vec2(vUv.x * 31.0, vUv.y * 13.0 + uT * 5.0)) * 0.4;
        float a = smoothstep(0.35, 0.7, f) * smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
        gl_FragColor = vec4(vec3(0.92, 0.95, 0.92) * 1.3 * a, a);
      }`,
  }));
  scene.add(foam);
  const frontAt = (t) => PZ0 + Math.max(0, t - 226.2) * 5.0;

  function waterLevel(t) {
    // the tracks fill, then it climbs over the platform (knee-deep by the time you reach the stairs)
    return -1.3 + 1.3 * smooth(225, 237, t) + 0.55 * smooth(237, 248, t);
  }

  return {
    scene, camera, crowd,
    frame(v, s) {
      const t = s.t;
      const col = (j) => KEYS.map((r) => [r[0], r[j]]);
      let x = spline(col(1), v), y = spline(col(2), v), z = spline(col(3), v);
      let yaw = spline(col(4), v), pitch = spline(col(5), v);
      const fov = spline(col(6), v);
      // the ground shakes; wading slows your step
      const rumble = 0.25 + 0.8 * smooth(214, 216, t) * (1 - smooth(219, 224, t)) + 0.4 * smooth(220, 252, t);
      const hf = (q) => Math.sin(t * 31 + q) * 0.5 + Math.sin(t * 47.3 + q * 2.1) * 0.3 + Math.sin(t * 73.1 + q * 3.7) * 0.2;
      yaw += wobble(t * 0.23, 3) * 0.7 + hf(2) * rumble * 0.4;
      pitch += wobble(t * 0.27, 4) * 0.5 + hf(1) * rumble * 0.4;
      const sp = Math.hypot(spline(col(1), v + 0.05) - x, spline(col(3), v + 0.05) - z) / 0.05;
      camera.position.set(x, EYE + y + Math.min(sp, 3) * 0.025 * Math.sin(v * 7.5), z);
      camera.rotation.set(pitch * DEG, -yaw * DEG, (wobble(t * 0.19, 5) * 0.5 + hf(3) * rumble * 0.3) * DEG);
      camera.fov = fov;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();

      // the lights: steady, flickering in the rumble, dead at 235 (the red emergency lamps on)
      const dead = smooth(234.8, 235.2, t);
      const flick = t > 214 && t < 235 ? (Math.sin(t * 37) * Math.sin(t * 11.3) > 0.55 ? 0.25 : 1) : 1;
      const lit = flick * (1 - dead);
      tubeMat.color.setRGB(3.2, 3.4, 3.0).multiplyScalar(Math.max(lit, 0.02));
      tubeLights.forEach((p) => (p.intensity = 30 * lit));
      reds.forEach((p) => (p.intensity = 26 * dead));
      hemi.intensity = 0.35 * lit + 0.05;

      // water
      waterU.uT.value = t; fallU.uT.value = t;
      water.position.y = waterLevel(t);
      {
        const fz = frontAt(t), len = Math.max(0.01, fz - PZ0);
        pwater.visible = foam.visible = t > 226.2 && fz < 52;
        pwater.position.y = Math.max(0.03 + 0.5 * smooth(228, 248, t), water.position.y);
        pwater.position.z = PZ0; pwater.scale.z = len;
        pwater.geometry.attributes.position.needsUpdate = false;
        foam.position.set(3.2, pwater.position.y + 0.02, PZ0 + len - 0.3);
        if (fz >= 52) { pwater.visible = false; water.position.y = Math.max(water.position.y, 0.53); }
      }
      fallU.uOn.value = smooth(223.6, 225.6, t);
      fall.visible = fall.userData.twin.visible = t > 223.5;
      sprayMesh.visible = t > 214;
      spray.forEach((p, i) => {
        if (p.dust) {
          // dust shaken from the ceiling
          const k = ((t * 0.6 + p.ph) % 1);
          dummy.position.set(p.dx, 4.2 - k * 5, p.dz);
          dummy.scale.setScalar(t > 214.5 && t < 232 ? 0.012 : 0);
        } else {
          const k = ((t * 1.2 + p.ph) % 1);
          const on = smooth(224.5, 226, t);
          dummy.position.set(p.x, waterLevel(t) + 0.1 + p.vy * k - 4.9 * k * k * 0.5, p.z0 + p.vz * k * 1.5);
          dummy.scale.set(on * 0.025, on * (0.03 + 0.04 * (1 - k)), on * 0.025);
        }
        dummy.updateMatrix(); sprayMesh.setMatrixAt(i, dummy.matrix);
      });
      sprayMesh.instanceMatrix.needsUpdate = true;

      // people: sheltering; when the water comes, everyone heads for the south stairs
      const tl = [];
      // everyone gets up at once when the water bursts in (the sitters take 0.8 s), turns south, and walks at one
      // pace (slower in the deep water), easing sideways into their lane: their order along the platform never changes
      const FLEE = 226.2;
      const walked = Math.max(0, t - FLEE - 0.8) * 2.4;
      people.forEach((p, i) => {
        const go = t > FLEE;
        const turn = smooth(FLEE, FLEE + 0.8, t);
        // (they keep their column until the stairs, then step into their column's line)
        let pz = p.z + walked, px = lerp(p.x, p.lane, smooth(S_STAIR.z0 - 7, S_STAIR.z0 - 0.5, pz));
        let yaw2 = lerp(p.yaw, Math.PI, turn), stride = walked > 0 ? 1.4 : 0, sit = p.sit ? 1 - turn : 0;
        pz = Math.min(pz, S_STAIR.z1 + 1);
        const onStair = pz > S_STAIR.z0 ? Math.min(4.4, (pz - S_STAIR.z0) * 4.4 / (S_STAIR.z1 - S_STAIR.z0)) : 0;
        const visible = pz < S_STAIR.z1 + 0.5;
        const look = !go && t > 215 && t < 221 ? 0.6 : 0;
        crowd.pose(i, { x: px, y: onStair, z: pz, yaw: yaw2 + Math.PI, s: p.h, visible, walk: t * 6 + p.hop, stride, sit, armR: dead > 0.5 && p.phone ? 1.2 : (!go && p.phone && !p.sit ? 0.7 : 0), look });
        if (dead > 0.5 && p.phone && visible) {
          dummy.position.set(px - Math.sin(yaw2) * 0.5, onStair + 1.5 * p.h, pz - Math.cos(yaw2) * 0.5); dummy.scale.setScalar(1);
          tl.push(dummy.position.clone());
        } else dummy.scale.setScalar(0);
        dummy.updateMatrix(); torches.setMatrixAt(i, dummy.matrix);
      });
      crowd.commit();
      torches.instanceMatrix.needsUpdate = true;
      tl.sort((a, b) => a.distanceTo(camera.position) - b.distanceTo(camera.position));
      torchLights.forEach((p, i) => { if (tl[i]) { p.position.copy(tl[i]); p.intensity = 2.5 * dead; } else p.intensity = 0; });
    },
  };
}

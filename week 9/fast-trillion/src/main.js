// "What if you were 1 trillion times faster?" — one shot, no cuts. The camera stays close on you the whole time:
// over your shoulder at frame 0 (the cheetah level with you), round to your front to look back at what your wake does
// to the avenue (windows, people, cars, walls), back behind you as you burst out onto the sea, to your side as your
// feet leave the water, round to the front to look back at the blast trailing you across the sea while the Sun sets
// behind you, then behind you again for the laps (sunrise, sunset, faster and faster) and light speed.
// Render: you are always at the origin running toward -z; the world slides past (the city sits in a group moved by the
// distance you've run). Two passes: (1) the world into a multisampled target with a depth texture, then a motion blur
// from that depth (each pixel smeared along where it was 1/60 s earlier: the camera moves at your speed); (2) you, the
// cheetah and the effects that travel with you, drawn sharp on top. Then bloom, tone map, the finish pass (heat
// shimmer, the near-light-speed colour shift, text bands, white) and the overlay.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky, skyColors } from './sky.js';
import { makeCity, CU, hazed } from './city.js';
import { makeTraffic } from './traffic.js';
import { makeCrowd } from './crowd.js';
import { makePeople, MAXP } from './people.js';
import { makeYou, FLAP, HEAT } from './you.js';
import { makeCheetah, cheetahAhead } from './cheetah.js';
import { makeSurface, SU } from './surface.js';
import { makeFx } from './fx.js';
import { makeThings } from './things.js';
import { makeWrecks, hitFlash } from './wrecks.js';
import { makeCorridor, corridorW, makeTrail } from './corridor.js';
import { makeSpace, EARTH_C } from './space.js';
import { makeOverlay } from './overlay.js';
import { SEA_Y } from './avenue.js';
import {
  state, VIDEO_DURATION, LOOP, distAt, speedAt, sunDirAt, thetaAt, THETA0, LAP, CITY_END, V_SEA, V_LIFT, V_SOUND, V_GLOW, V_C, T_WHITE, V_1PC,
  weightAt, machAt, timesAt, SC, growRate, STEPS, captionAt, V_SPACE, R_EARTH,
} from './timeline.js';
import { lerp, smooth, wobble, clamp, keys } from './util.js';

const W = 1080, H_PX = 1920, DEG = Math.PI / 180;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const NO = (params.get('no') || '').split(',').filter(Boolean);

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H_PX, false);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setClearColor(0x000000, 1);
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, W / H_PX, 0.25, 30000);
camera.rotation.order = 'YXZ';
scene.add(camera);
const plainMat = (color, rough = 0.9, extra = {}) => hazed(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };
const ctx = { plainMat, glowMat, shadowy };

// ---------- the world (layer 0): sky, the avenue (in a group slid past you), the sea / Earth, debris ----------
const sky = makeSky();
scene.add(sky.mesh);
const world = new THREE.Group();
scene.add(world);
const city = makeCity(world, ctx);
const traffic = makeTraffic(world, ctx);
const crowd = makeCrowd(world, MAXP, plainMat(0xffffff, 0.82), { castShadow: true });
const people = makePeople(crowd);
const surface = makeSurface(scene);

// ---------- you, the cheetah, and what travels with you (layer 1, drawn sharp in pass 2) ----------
const you = makeYou(scene, { hoodie: 0xd8342a, jeans: 0x2a3550, skin: 0xd09a74, hair: 0x2a1a10 });
you.root.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = true; } });
const cheetah = makeCheetah(scene);
const fx = makeFx(scene, scene);
const things = makeThings(scene);
const wrecks = makeWrecks(scene);
const corridor = makeCorridor(scene);
const trail = makeTrail(scene);
let space = null;   // (made in boot: it loads the Earth's maps)
const L1 = [you.root, cheetah.group, fx.wake.mesh, fx.caps.cap, fx.caps.cap2, fx.caps.vap, fx.streamers.mesh, fx.steam.smoke.mesh];
// you and the cheetah are in both layers (they cast shadows on the world in pass 1, invisibly)
for (const o of [you.root, cheetah.group]) o.traverse((c) => c.layers.enableAll());
for (const o of [fx.wake.mesh, fx.caps.cap, fx.caps.cap2, fx.caps.vap, fx.streamers.mesh, fx.steam.smoke.mesh]) o.layers.set(1);
const ghostMats = [];
for (const o of [you.root, cheetah.group]) o.traverse((c) => { if (c.isMesh) for (const m of [].concat(c.material)) if (!ghostMats.includes(m)) ghostMats.push(m); });
const ghost = (on) => { for (const m of ghostMats) { m.colorWrite = !on; m.depthWrite = !on; } };

// ---------- light ----------
const sunL = new THREE.DirectionalLight(0xfff3e2, 3.0);
sunL.castShadow = true;
sunL.shadow.mapSize.set(4096, 4096);
sunL.shadow.bias = -0.0004; sunL.shadow.normalBias = 0.05;
Object.assign(sunL.shadow.camera, { left: -70, right: 70, top: 90, bottom: -50, near: 1, far: 900 });
scene.add(sunL, sunL.target);
const hemi = new THREE.HemisphereLight(0x9cc0ff, 0x9a8a78, 1.2);
scene.add(hemi);
const fire = new THREE.PointLight(0xffaa66, 0, 0, 2);
scene.add(fire);
for (const l of [sunL, hemi, fire]) l.layers.enableAll();

const overlay = makeOverlay();

// ---------- pass 1 target: the world, multisampled, with its depth ----------
const sceneRT = new THREE.WebGLRenderTarget(W, H_PX, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(W, H_PX, THREE.FloatType) });
const rt = new THREE.WebGLRenderTarget(W, H_PX, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H_PX);
// the motion blur: rebuild each pixel's position from the depth, find where it was 1/60 s earlier (the world slid
// by dS toward you and the camera was where it was then), and average along that line
const blur = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, tCol: { value: null }, tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uCamW: { value: new THREE.Matrix4() },
    uPrevVP: { value: new THREE.Matrix4() }, uDS: { value: 0 }, uMax: { value: 0.2 }, uRel: { value: 0 }, uT: { value: 0 }, uNear: { value: 0.25 }, uFar: { value: 30000 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tCol; uniform sampler2D tDepth; uniform mat4 uInvProj; uniform mat4 uCamW; uniform mat4 uPrevVP;
    uniform float uDS; uniform float uMax; uniform float uT; uniform float uNear; uniform float uFar; uniform float uRel;
    varying vec2 vUv;
    // near light speed the light ahead of you bunches up and turns blue-white; the edges go dark and red
    vec3 rel(vec3 col) {
      if (uRel <= 0.0) return col;
      vec2 c0 = (vUv - vec2(0.5, 0.56)) * vec2(${(W / H_PX).toFixed(4)}, 1.0);
      float r = length(c0);
      float lum = dot(col, vec3(0.3, 0.55, 0.15));
      vec3 blue = vec3(0.55, 0.75, 1.25) * lum * 1.7 + vec3(0.1, 0.16, 0.3) * uRel;
      col = mix(col, blue, uRel * (1.0 - smoothstep(0.1, 0.55, r)));
      return mix(col, col * vec3(1.1, 0.35, 0.25) * 0.5, uRel * smoothstep(0.25, 0.75, r));
    }
    float h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    void main() {
      vec4 c0 = texture2D(tCol, vUv);
      if (c0.a < 0.5) { gl_FragColor = vec4(rel(clamp(c0.rgb, 0.0, 60.0)), 1.0); return; }
      float d = texture2D(tDepth, vUv).x;
      vec4 ndc = vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
      vec4 vp = uInvProj * ndc; vp /= vp.w;
      vec2 prev;
      if (d > 0.99999) {
        // the sky: only the camera's turning moves it
        vec3 dir = mat3(uCamW) * normalize(vp.xyz);
        vec4 pc = uPrevVP * vec4(dir, 0.0);
        prev = pc.xy / pc.w * 0.5 + 0.5;
      } else {
        vec3 wp = (uCamW * vec4(vp.xyz, 1.0)).xyz;
        vec4 pc = uPrevVP * vec4(wp - vec3(0.0, 0.0, uDS), 1.0);
        prev = pc.w > 0.01 ? pc.xy / pc.w * 0.5 + 0.5 : vUv + normalize(vUv - 0.5) * uMax;
      }
      vec2 m = prev - vUv;
      float L = length(m * vec2(${(W / H_PX).toFixed(4)}, 1.0));
      if (L > uMax) m *= uMax / L;
      vec3 c = vec3(0.0);
      float j = h(vUv * 1931.0 + fract(uT * 3.17));
      const int NS = 24;
      float wsum = 0.0;
      for (int i = 0; i < NS; i++) {
        float k = (float(i) + j) / float(NS) - 0.5;
        vec4 sm = texture2D(tCol, clamp(vUv + m * k, vec2(0.0005), vec2(0.9995)));
        float wgt = step(0.5, sm.a);
        c += sm.rgb * wgt; wsum += wgt;
      }
      c = wsum > 0.5 ? c / wsum : c0.rgb;
      if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
      gl_FragColor = vec4(rel(clamp(c, 0.0, 60.0)), 1.0);
    }`,
});
blur.uniforms.tCol.value = sceneRT.texture;
blur.uniforms.tDepth.value = sceneRT.depthTexture;
composer.addPass(blur);
// pass 2: you and what travels with you, sharp, on top of the blurred world
class YouPass extends Pass {
  constructor() { super(); this.needsSwap = false; }
  render(r, writeBuffer, readBuffer) {
    const auto = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(readBuffer);
    r.clearDepth();
    camera.layers.set(1);
    r.shadowMap.autoUpdate = false;
    // (your fire lights the world round you, not you: your own glow is in your material)
    const fi = fire.intensity; fire.intensity = 0;
    r.render(scene, camera);
    fire.intensity = fi;
    r.shadowMap.autoUpdate = true;
    camera.layers.set(0);
    r.autoClear = auto;
  }
}
composer.addPass(new YouPass());
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H_PX / 2), 0.3, 0.22, 1.05);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.22 }, uTitle: { value: 0 }, uCounter: { value: 0 }, uCap: { value: 0 }, uWhite: { value: 0 },
    uAb: { value: 0 }, uShim: { value: 0 }, uYou: { value: new THREE.Vector2(0.5, 0.35) }, uRel: { value: 0 }, uSpot: { value: 0 }, uSlam: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter; uniform float uCap; uniform float uWhite;
    uniform float uAb; uniform float uShim; uniform vec2 uYou; uniform float uRel; uniform float uSpot; uniform float uSlam;
    varying vec2 vUv;
    float h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
    void main() {
      vec2 uv = vUv;
      const vec2 AS = vec2(${(W / H_PX).toFixed(4)}, 1.0);
      // heat shimmer round you: the air in front of you and in your wake bends the light
      if (uShim > 0.0) {
        float dd = length((vUv - uYou) * AS);
        float m = uShim * (1.0 - smoothstep(0.08, 0.3, dd));
        uv += m * 0.006 * vec2(n2(vUv * vec2(40.0, 90.0) + vec2(0.0, uTime * 21.0)) - 0.5, n2(vUv * vec2(70.0, 40.0) - vec2(uTime * 17.0, 0.0)) - 0.5);
      }
      vec2 off = (uv - 0.5) * uAb * 0.01;
      vec3 col = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      // near light speed: the light ahead of you bunches up and turns blue-white, the edges go dark and red
      if (uSpot > 0.0) {
        float r = length((vUv - vec2(0.5, 0.56)) * AS);
        col += vec3(0.85, 0.92, 1.0) * uSpot * 3.0 * exp(-r * r / max(0.002, 0.02 * uSpot + 0.3 * uSpot * uSpot));
      }
      col += vec3(1.0, 0.97, 0.92) * uSlam * 0.35;
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.12);
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.5 * exp(-pow((vUv.y - 0.79) / 0.09, 2.0));
      col *= 1.0 - uCounter * 0.42 * exp(-pow((vUv.y - 0.6) / 0.085, 2.0)) * smoothstep(1.1, 0.2, vUv.x);
      col *= 1.0 - uCap * 0.45 * exp(-pow((vUv.y - 0.125) / 0.045, 2.0));
      col = mix(col, vec3(1.0, 0.99, 0.97), uWhite);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- the camera: keys of where it sits round you (azimuth from behind, + toward your left), how far, how
//            high above your chest, where it looks (relative to your chest), lens ----------
// [v, az(deg), r, h, L (look this far past you, level), ty (aim height there, from your chest), tx (sideways), fov]
const CAMK = [
  [-2, 13, 2.9, 0.45, 9, 0.25, -1.9, 60],
  [0, 13, 2.9, 0.45, 9, 0.25, -1.9, 60],
  [2.2, 15, 2.85, 0.55, 9, 0.15, -1.2, 60],
  [3.5, 20, 2.9, 0.7, 9, 0.05, -0.6, 60],
  [4.7, 95, 3.4, 1.3, 4, -0.4, 0.0, 60],
  [5.5, 122, 3.4, 1.5, 8, -1.5, 0.0, 60],
  // the avenue behind you: the blast front, raised so the street behind you opens up
  [6.6, 168, 5.2, 3.0, 12, -1.4, 1.6, 62],
  [9.1, 171, 5.6, 3.3, 13, -1.5, 1.8, 62],
  // out over the sea: the container ship coming at you
  [10.6, 6, 3.2, 1.05, 80, -1.2, 0.0, 60],
  [11.3, 5, 3.4, 1.1, 300, -0.5, 0.0, 50],
  [12.3, 4, 3.6, 1.2, 600, 2.0, 0.0, 42],
  // through it: swing round with a long lens to look back at it breaking
  [12.52, 180, 30, 1.5, 1800, -20, 0, 18],
  [13.3, 180, 45, 1.5, 5000, -40, 0, 9],
  // your feet leave the water
  [13.8, 282, 3.3, -0.3, 3, -0.3, 0.0, 60],
  [14.9, 264, 3.8, 0.1, 3, -0.2, 0.0, 60],
  // behind you again: ships, islands, the coast city coming
  [15.8, 355, 6.2, 1.2, 120, -8.0, 0.0, 36],
  [16.9, 356, 6.3, 1.25, 400, -6.0, 0.0, 30],
  [17.95, 357, 6.4, 1.3, 2000, 0.0, 0.0, 24],
  // through the tower: look back at it blowing apart, the blocks along your path coming down behind it
  [18.22, 180, 60, 1.2, 6500, 60, 0, 9],
  [18.6, 180, 60, 1.2, 22000, 190, 0, 5],
  [19.15, 180, 60, 1.2, 45000, 250, 0, 4],
  // round again: the mountain in your path
  [19.5, 357, 6.4, 1.3, 20000, 0.0, 0.0, 26],
  [20.0, 358, 6.4, 1.3, 6000, 0.0, 0.0, 28],
  // through it: look back at the peak bursting, sinking behind the curve of the Earth as you race away
  [20.42, 180, 80, 0.5, 60000, 1260, 0, 10],
  [21.0, 180, 80, 0.5, 120000, 1300, 0, 7],
  [21.4, 180, 80, 0.5, 200000, 800, 0, 6],
  // the Sun setting behind you, then the fire you leave behind you at night
  [23.0, 196, 3.0, 1.5, 60, -12.0, -5.0, 62],
  [25.3, 195, 4.5, 3.0, 120, -10.0, -3.0, 58],
  [27.4, 192, 5.0, 3.5, 150, -10.0, -2.0, 56],
  // behind you for the laps
  [28.3, 8, 3.3, 1.45, 60, -1.0, 0.0, 62],
  [36.0, 4, 3.2, 1.3, 60, -0.6, 0.0, 64],
  [40.3, 3, 3.1, 1.2, 60, -0.6, 0.0, 84],
  [47, 2, 3.1, 1.2, 60, -0.6, 0.0, 84],
];
function camKey(v, j) { return keys(CAMK.map((k) => [k[0], k[j]]), v); }

// ---------- your height and pose over time ----------
const seaK = (v) => smooth(V_SEA - 0.02, V_SEA + 0.12, v);
function youY(v) {
  const lift = smooth(V_LIFT - 0.1, V_LIFT + 1.6, v);
  return lerp(0, SEA_Y + 0.02, seaK(v)) + lift * (1.15 + 0.08 * Math.sin(v * 1.7));
}
// gait phase (radians), integrated so the cadence can change smoothly: ~5 steps/s at frame 0 up to 8, then fewer,
// floatier steps as your weight drops
const GT = (() => {
  const dt = 1 / 600, v0 = -4, n = Math.round(56 / dt), tab = new Float64Array(n + 1);
  let ph = 0;
  for (let i = 0; i <= n; i++) {
    tab[i] = ph;
    const v = v0 + i * dt, w = clamp(weightAt(v), 0, 1);
    const steps = lerp(5.2, 8.0, smooth(-1, 4, v)) * lerp(0.45, 1, Math.sqrt(w));
    ph += Math.PI * steps * dt;
  }
  return (v) => { const f = clamp((v + 4) / dt, 0, n - 1.001), i = Math.floor(f); return tab[i] + (tab[i + 1] - tab[i]) * (f - i); };
})();

// ---------- update ----------
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), sunD = new THREE.Vector3(), head = new THREE.Vector3(), tmpC = new THREE.Color();
const prevCam = new THREE.PerspectiveCamera();
prevCam.rotation.order = 'YXZ';   // (same as the camera's, or the blur sees the shake as a big jump)
function camPose(v, cam) {
  const yy = youY(v);
  const A = tmpV2.set(0, yy + 1.05, 0);
  const az = camKey(v, 1) * DEG, r = camKey(v, 2), hgt = camKey(v, 3);
  cam.position.set(A.x - Math.sin(az) * r, A.y + hgt, A.z + Math.cos(az) * r);
  // look through you: along the level line from the camera through your chest, L metres past you
  const hx = A.x - cam.position.x, hz = A.z - cam.position.z, hl = Math.hypot(hx, hz) || 1;
  const L = camKey(v, 4), tx = camKey(v, 6);
  const tgt = tmpV.set(A.x + hx / hl * L + (-hz / hl) * tx, A.y + camKey(v, 5), A.z + hz / hl * L + (hx / hl) * tx);
  cam.up.set(0, 1, 0);
  cam.lookAt(tgt);
  cam.fov = camKey(v, 7);
  return cam;
}
// the ending: from 400 km above you out to 30,000 km, turning from looking down at your track to a 3/4 view of the
// whole planet with the ring round it
function spaceCam(v, cam) {
  const e = smooth(V_SPACE, T_WHITE - 0.3, v), e2 = smooth(V_SPACE, V_SPACE + 1.6, v);
  const alt = 4500e3 * Math.pow(26000 / 4500, e);
  const d1 = new THREE.Vector3(0.12, 1, 0.25).normalize(), d2 = new THREE.Vector3(0.17, 0.55, 0.82).normalize();
  const dir = d1.clone().lerp(d2, e2).normalize();
  cam.position.copy(EARTH_C).addScaledVector(dir, R_EARTH + alt);
  const top = EARTH_C.clone().add(new THREE.Vector3(0, R_EARTH, 0));
  cam.up.set(0, 0, -1);
  cam.lookAt(top.lerp(EARTH_C, 0.35 + 0.65 * smooth(V_SPACE, V_SPACE + 1.2, v)));
  cam.fov = 50;
  cam.near = Math.max(50, alt * 0.02); cam.far = alt + 3 * R_EARTH;
  cam.updateProjectionMatrix();
  return cam;
}
let lastShake = 0;
function update(v, cover = -1) {
  const s = state(v);
  const white = Math.max(s.flash, cover >= 0 ? cover : 0);
  if (cover >= 0) s.title *= 1 - smooth(0.55, 1, cover);
  const S = s.dist, vel = s.vel, mach = s.mach;
  const dS = S - distAt(v - 1 / 60);
  const SHUT = lerp(0.5, 0.07, smooth(4.2, 4.7, v) * (1 - smooth(9.8, 10.6, v))) * (1 - 0.6 * smooth(10.4, 11, v) * (1 - smooth(22, 23, v)));   // shutter (fraction of a frame): faster while you look back at the avenue
  const sea = seaK(v), inCity = S < CITY_END + 60000;
  // ---- the world slides past ----
  world.position.set(0, 0, S);
  city.frame(v, S, dS * SHUT, S < CITY_END + 80000);
  traffic.frame(v, S, S < CITY_END + 2000);
  people.frame(v, S, S < CITY_END + 2000);
  fx.debris.frame(v, S, S < CITY_END + 400);
  fx.street.frame(v, S, S < CITY_END + 1200);
  // the city sinks below the curve of the Earth as you leave it behind
  world.position.y = -Math.pow(Math.max(0, S - CITY_END), 2) / (2 * 6.371e6);
  // ---- the Sun, the sky, the light ----
  // the sky and its light, averaged over a short window of time (each sunrise or sunset takes a fraction of a second,
  // and once you lap the Earth faster than ~2 times a second, days and nights blur into one steady twilight: no strobe)
  sunDirAt(v, sunD);
  const lapRate = speedAt(v) / LAP;
  const SKY = { zen: [0, 0, 0], hor: [0, 0, 0], glow: [0, 0, 0], sun: [0, 0, 0], day: 0, stars: 0, sunI: 0 };
  {
    const win = 0.08 + 0.12 * smooth(0.3, 1.5, lapRate);
    const full = smooth(1.4, 3.0, lapRate);            // past this, the average over a whole lap
    const NS = 24;
    for (let k = 0; k < NS; k++) {
      const f = (k + 0.5) / NS;
      // (a window in time, or evenly round a whole lap)
      const th1 = thetaAt(v + (f - 0.5) * 2 * win) * DEG, th2 = (THETA0 + f * 360) * DEG;
      for (const [th, wgt] of [[th1, (1 - full) / NS], [th2, full / NS]]) {
        if (wgt <= 0) continue;
        const e = Math.asin(clamp(Math.cos(th) / Math.hypot(0.03, Math.cos(th), Math.sin(th)), -1, 1)) / DEG;
        const c = skyColors(e);
        for (const key of ['zen', 'hor', 'glow', 'sun']) for (let j = 0; j < 3; j++) SKY[key][j] += c[key][j] * wgt;
        SKY.day += smooth(-8, 6, e) * wgt; SKY.stars += smooth(-4, -14, e) * wgt; SKY.sunI += smooth(-1, 8, e) * wgt;
      }
    }
  }
  const el = Math.asin(clamp(sunD.y, -1, 1)) / DEG;
  const sc = SKY;
  const day = SKY.day;
  const u = sky.uniforms;
  u.uSun.value.copy(sunD); u.uZen.value.setRGB(...sc.zen); u.uHor.value.setRGB(...sc.hor); u.uGlow.value.setRGB(...sc.glow); u.uSunCol.value.setRGB(...sc.sun);
  // (the Sun's disc fades out once it races across the sky in a few frames)
  u.uSunI.value = 1 - smooth(0.25, 1.0, lapRate); u.uSunR.value = 0.0048 + 0.008 * smooth(20, 23, v) * (1 - smooth(27, 29, v)); u.uStars.value = SKY.stars * (1 - smooth(1.0, 2.5, lapRate)); u.uCloud.value = 0.6 * (1 - smooth(16, 24, v)); u.uT.value = v; u.uCity.value = 0;
  sky.mesh.position.copy(camera.position);
  sunL.color.setRGB(...sc.sun.map((x) => Math.min(1, x * 1.05)));
  sunL.intensity = 3.2 * SKY.sunI * (1 - 0.6 * smooth(0.5, 2.0, lapRate));
  sunL.position.copy(sunD).multiplyScalar(400);
  sunL.target.position.set(0, 0, -20);
  sunL.target.updateMatrixWorld();
  hemi.color.setRGB(...sc.zen.map((x) => x * 2.2 + 0.02)); hemi.groundColor.setRGB(...sc.hor.map((x) => x * 0.5));
  hemi.intensity = 0.4 + 1.0 * day;
  CU.uSun.value.copy(sunD); CU.uSkyHi.value.setRGB(...sc.zen); CU.uSkyLo.value.setRGB(...sc.hor); CU.uSunCol.value.setRGB(...sc.sun);
  CU.uHaze.value.setRGB(...sc.hor.map((x) => x * 0.95)); CU.uHazeD.value = 2600;
  SU.uSun.value.copy(sunD); SU.uSkyHi.value.setRGB(...sc.zen); SU.uSkyLo.value.setRGB(...sc.hor); SU.uSunCol.value.setRGB(...sc.sun); SU.uDay.value = day;
  SU.uHaze.value.setRGB(...sc.hor.map((x) => x * 0.95)); SU.uHazeD.value = lerp(9000, 40000, smooth(14, 22, v)) * (1 + 1.2 * smooth(16.5, 18, v) * (1 - smooth(21.5, 23, v)));
  // your fire: the air piled up in front of you glows from Mach ~6 and is white-hot by orbit speed; brighter still
  const glow = smooth(V_GLOW - 0.6, V_GLOW + 0.8, v), hot = smooth(V_GLOW + 0.5, V_LIFT, v), blaze = smooth(V_LIFT, V_1PC, v);
  const fireI = glow * 6 + hot * 30 + blaze * 110 + smooth(V_1PC, V_C, v) * 160;
  const fireC = tmpV.set(1.0, lerp(0.42, 0.85, hot), lerp(0.12, 0.7, hot + blaze * 0.5));
  fire.color.setRGB(fireC.x, fireC.y, fireC.z);
  fire.intensity = fireI;
  // (the pool of your light on the sea reads as a white oval through a long lens from far off: dimmed there)
  { const k = Math.min(fireI * 0.004, 0.7) * (1 - 0.85 * smooth(7, 18, camKey(v, 2))); SU.uFire.value.setRGB(fireC.x * k, fireC.y * k * 0.8, fireC.z * k * 0.6); }
  SU.uFireR.value = 6 + 14 * blaze;
  // ---- the sea / Earth under you ----
  surface.frame({ s: S, dz: Math.max(dS * SHUT, vel * 0.12 * smooth(24, 27, v)), v, camX: camera.position.x, camZ: camera.position.z, y: SEA_Y, visible: S > CITY_END - 4000 });
  SU.uTrench.value = smooth(V_SEA + 0.3, V_SEA + 1.5, v);
  SU.uFoamK.value = 1 - 0.7 * smooth(7, 18, camKey(v, 2));
  const inSpace = v >= V_SPACE;
  things.frame(v, S, v > V_SEA - 0.6 && v < 23.0);
  wrecks.frame(v, S, !inSpace, 0.45 + 0.55 * day);
  const homeFlash = corridor.frame(v, S, Math.max(dS * SHUT, vel * 0.12), day, v > 29.4 && !inSpace ? 1 : 0);
  SU.uCanyon.value = smooth(29.5, 30.3, v) * (inSpace ? 0 : 1); SU.uCW.value = Math.max(corridorW(v), 1);
  SU.uTK.value = smooth(32.3, 33.8, v); SU.uTW.value = lerp(50, 450, smooth(33, 40, v));
  // the fire behind you, seen while the camera looks back from 0:23 to 0:27.6
  trail.frame(v, vel, smooth(22.2, 23.2, v) * (1 - smooth(27.9, 28.5, v)));
  SU.uFresh.value = smooth(22.5, 23.5, v) * (1 - smooth(27.6, 28.4, v));
  // the smoke of your earlier laps hangs over the canyon: a dark sky, glowing orange low down where the fire is
  {
    const c = SU.uCanyon.value * 0.88;
    sky.uniforms.uZen.value.lerp(tmpC.setRGB(0.012, 0.009, 0.009), c);
    sky.uniforms.uHor.value.lerp(tmpC.setRGB(0.42, 0.12, 0.025), c);
    sky.uniforms.uGlow.value.multiplyScalar(1 - c);
  }
  if (space) space.frame(v, inSpace, smooth(V_SPACE, V_SPACE + 0.6, v));
  if (inSpace) { surface.mesh.visible = false; sky.uniforms.uZen.value.setRGB(0, 0, 0.002); sky.uniforms.uHor.value.setRGB(0, 0, 0.004); sky.uniforms.uGlow.value.setRGB(0, 0, 0); sky.uniforms.uStars.value = 1; sky.uniforms.uSunI.value = 0; }
  // ---- you ----
  const yy = youY(v);
  const fly = smooth(V_LIFT + 0.15, V_LIFT + 1.3, v);
  const w = clamp(weightAt(v), 0, 1);
  const ph = GT(v);
  you.root.position.set(-0.105, yy, 0);
  you.root.rotation.set(0, Math.PI, 0);
  you.root.position.x = 0.105;   // (facing -z the figure's right sole sits at +x: its middle on your line)
  you.run({ ph, amp: 1, float: smooth(0.85, 0.2, w) * (1 - fly), fly, wind: clamp(0.35 + vel / 120, 0, 1), t: v });
  // flying: tilt about your middle so you lean into the air instead of pivoting on your feet
  if (fly > 0) { you.root.position.y += 0; }
  FLAP.uFT.value = v;
  FLAP.uFlap.value = clamp(0.25 + vel / 80, 0, 1.2);
  HEAT.uWind.value.set(0, 0, 1);
  const heatK = glow * 0.55 + hot * 0.55 + blaze * 0.35;
  HEAT.uHeat.value.setRGB(heatK * 1.0, heatK * lerp(0.35, 0.8, hot), heatK * lerp(0.08, 0.55, hot));
  HEAT.uHeatAll.value.setRGB(blaze * 0.12, blaze * 0.08, blaze * 0.06);
  you.root.updateMatrixWorld(true);
  you.head.getWorldPosition(head);
  // ---- the cheetah ----
  cheetah.frame(v);
  you.root.visible = !inSpace && !NO.includes('you');
  // ---- what travels with you ----
  const groundY = (d) => (S - d > CITY_END ? SEA_Y : 0);
  fx.wake.frame(v, S, { on: 0, groundY, hotK: 1, water: smooth(V_SEA, V_SEA + 0.4, v) * (1 - smooth(23.5, 25, v) * 0.5) });
  fx.wake.mat.uniforms.uLight.value.setRGB(0.25 + 0.75 * day, 0.25 + 0.75 * day, 0.28 + 0.72 * day);
  // steam rising along your track over the sea (seen while the camera looks back)
  { const az = camKey(v, 1) * DEG; fx.steam.frame(v, S, { on: 0 * smooth(V_SEA + 0.3, V_SEA + 1.2, v) * smooth(0.35, 0.75, -Math.cos(az)) * (1 - smooth(24.6, 26.0, v)), light: 0.5 + 1.0 * day, glow: (1 - day) * 0.6 }); fx.steam.smoke.mat.uniforms.uSun.value.copy(sunD); }
  // (the blast's dust walls in the street only, seen when the camera looks back; over the sea the boiling track is in surface.js)
  { const az = camKey(v, 1) * DEG; fx.wake.mat.uniforms.uA.value = smooth(0.35, 0.75, -Math.cos(az)) * (1 - smooth(V_SEA - 0.2, V_SEA + 0.2, v)); }
  fx.wake.mat.uniforms.uNight.value = (1 - day) * (glow + blaze);
  {
    const C = fx.caps;
    // the cap of shocked air in front of you (ahead of your chest running, ahead of your head flying)
    // (not from far off through a long lens: it would cover you and what's behind you)
    const capA = glow * (1 - fly) * smooth(0.2, 0.7, -Math.cos(camKey(v, 1) * DEG)) * (1 - smooth(7, 18, camKey(v, 2)));
    C.cap.visible = capA > 0.001; C.cap2.visible = false;
    const capPos = tmpV.set(0, yy + lerp(1.1, 1.0, fly), lerp(-0.3, -1.0, fly));
    C.cap.position.copy(capPos); C.cap2.position.copy(capPos).add(tmpV2.set(0, 0, -0.06));
    const k = lerp(0.42, 0.5, hot) * (1 - 0.35 * fly);
    C.cap.scale.set(k * 0.85, k * lerp(1.6, 0.8, fly), k * 0.9);
    C.cap2.scale.set(k * 1.25, k * lerp(2.1, 1.2, fly), k * 1.8);
    const hc = new THREE.Color(1.0, lerp(0.38, 0.85, hot), lerp(0.08, 0.75, hot + blaze));
    C.capMat.uniforms.uCol.value.copy(hc).multiplyScalar(1.2 + 1.8 * hot + 1.5 * blaze);
    C.capMat.uniforms.uA.value = capA * (0.35 + 0.65 * hot); C.capMat.uniforms.uT.value = v;
    C.cap2.material.uniforms.uCol.value.copy(hc).multiplyScalar(0.5 + 1.0 * hot + 1.0 * blaze);
    C.cap2.material.uniforms.uA.value = capA * 0.18 * hot; C.cap2.material.uniforms.uT.value = v + 3;
    // the vapour cone as you pass the speed of sound
    const vapA = smooth(V_SOUND - 0.45, V_SOUND - 0.1, v) * (1 - smooth(V_SOUND + 0.25, V_SOUND + 0.75, v));
    C.vap.visible = vapA > 0.001;
    C.vap.position.set(0, yy + 1.25, -0.15);
    C.vap.scale.set(1.1, 1.0, 1.4);
    C.vapMat.uniforms.uA.value = vapA; C.vapMat.uniforms.uT.value = v;
  }
  fire.position.set(0, yy + 1.0, -0.8);
  // ---- the camera ----
  camPose(v, camera);
  const kick = (() => { let k = 0; for (const t of [V_SOUND, V_C]) { const dt = v - t; if (dt > -0.03 && dt < 1.2) k = Math.max(k, Math.exp(-Math.max(dt, 0) / 0.3)); } return k; })();
  // (the shake is scaled to the lens: a long lens would magnify it into a jitter)
  const lensK = clamp(camera.fov / 60, 0.08, 1.4);
  const shake = (0.0012 + 0.0025 * smooth(V_SOUND, V_SOUND + 1, v) + 0.004 * glow + 0.004 * blaze + 0.02 * kick) * lensK;
  camera.rotation.x += wobble(v * 13, 1) * shake + wobble(v * 0.4, 2) * 0.004 * lensK;
  camera.rotation.y += wobble(v * 11, 3) * shake * 0.8 + wobble(v * 0.33, 4) * 0.004 * lensK;
  camera.rotation.z += wobble(v * 9, 5) * shake * 0.6;
  camera.near = S > CITY_END + 200 ? 0.6 : 0.25;
  camera.far = S > CITY_END + 200 ? (v > 15 ? 500000 : 90000) : 30000;
  if (inSpace) spaceCam(v, camera);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  // the plasma pouring off you (from Mach ~6, full by orbit speed)
  {
    const pts = [];
    const add = (o, x, y, z) => { const p = new THREE.Vector3(x, y, z); o.localToWorld(p); p.z += 0.12; pts.push(p); };
    add(you.head, 0, 0.12, 0.06); add(you.head, -0.07, 0.07, 0.02); add(you.head, 0.07, 0.07, 0.02);
    you.arms.forEach((A) => { add(A.sh, 0, 0, 0); add(A.el, 0, 0, 0); add(A.wr, 0, -0.05, 0); });
    you.legs.forEach((L) => { add(L.knee, 0, 0, 0); add(L.ankle, 0, -0.05, 0.05); });
    const strA = glow * (0.25 + 0.75 * hot) * (v >= V_SPACE ? 0 : 1);
    const behind = smooth(0.4, 0.9, Math.cos(camKey(v, 1) * DEG));
    fx.streamers.frame(v, camera, pts, { a: strA * (1 - 0.35 * behind), len: lerp(1.2, 5.5, hot) * (1 + 1.2 * blaze) * (1 - 0.55 * behind), w: lerp(0.05, 0.11, hot) * (1 + 0.6 * blaze) });
  }
  // where the camera was 1/60 s ago (for the motion blur)
  if (inSpace) spaceCam(v - SHUT / 60, prevCam); else camPose(v - SHUT / 60, prevCam);
  prevCam.aspect = camera.aspect; prevCam.near = camera.near; prevCam.far = camera.far;
  { const vp = v - SHUT / 60; prevCam.rotation.x += wobble(vp * 13, 1) * shake + wobble(vp * 0.4, 2) * 0.004 * lensK; prevCam.rotation.y += wobble(vp * 11, 3) * shake * 0.8 + wobble(vp * 0.33, 4) * 0.004 * lensK; prevCam.rotation.z += wobble(vp * 9, 5) * shake * 0.6; }
  prevCam.updateProjectionMatrix();
  prevCam.updateMatrixWorld();
  prevCam.matrixWorldInverse.copy(prevCam.matrixWorld).invert();
  const B = blur.uniforms;
  B.uInvProj.value.copy(camera.projectionMatrixInverse);
  B.uCamW.value.copy(camera.matrixWorld);
  B.uPrevVP.value.multiplyMatrices(prevCam.projectionMatrix, prevCam.matrixWorldInverse);
  B.uDS.value = inSpace ? 0 : S - distAt(v - SHUT / 60); B.uT.value = v;
  // shadows follow you
  sunL.shadow.camera.updateProjectionMatrix();
  // ---- exposure, bloom, post ----
  renderer.toneMappingExposure = lerp(1.0, 1.15, 1 - day) * lerp(1, 0.85, blaze);
  bloom.strength = 0.25 + 0.2 * hot + 0.2 * blaze;
  bloom.threshold = 1.05;
  const F = finish.uniforms;
  F.uTime.value = v;
  F.uShim.value = smooth(5.6, 7.0, v) * (1 - 0.6 * smooth(V_LIFT, V_LIFT + 3, v));
  head.project(camera);
  F.uYou.value.set(head.x * 0.5 + 0.5, head.y * 0.5 + 0.45);
  B.uRel.value = smooth(35, V_C, v) * (inSpace ? 0 : 1);
  F.uSpot.value = 0;
  // the slam: a hard white hit that covers the cut out to space
  F.uSlam.value = Math.min(2.6, s.slam * 2.6) + 0.8 * homeFlash + 1.6 * hitFlash(v);
  F.uAb.value = 0.15 + 0.6 * kick + 0.5 * blaze;
  F.uWhite.value = white;
  F.uTitle.value = window.__cover ? 0 : s.title;
  F.uCounter.value = window.__cover ? 0 : 1 - white;
  s.hide = white;
  overlay(v, s);
  { const cap = captionAt(v); F.uCap.value = window.__cover ? 1.0 : (cap ? cap.alpha : 0) * (1 - white); }
  return s;
}

let comp = null;
function renderFrame(t) {
  const tail = t - (VIDEO_DURATION - LOOP);
  if (tail >= 0) update(t - VIDEO_DURATION, 1 - smooth(0, LOOP * 0.92, tail));
  else update(t);
  // (debug: ?no=streamers,wake,cap,bloom hides parts)
  if (NO.length) { if (NO.includes('streamers')) fx.streamers.mesh.visible = false; if (NO.includes('wake')) fx.wake.mesh.visible = false; if (NO.includes('cap')) fx.caps.cap.visible = false; if (NO.includes('bloom')) bloom.strength = 0; if (NO.includes('you')) you.root.visible = false; if (NO.includes('surface')) surface.mesh.visible = false; if (NO.includes('fire')) { fire.intensity = 0; SU.uFire.value.setRGB(0, 0, 0); } if (NO.includes('trench')) SU.uSabs.value = 0; }
  // pass 1: the world (you and the cheetah drawn invisibly, so they still cast their shadows)
  ghost(true);
  camera.layers.set(0);
  renderer.setRenderTarget(sceneRT);
  renderer.clear();
  renderer.render(scene, camera);
  ghost(false);
  composer.render();
  if (comp) comp.paint();
}

async function boot() {
  space = await makeSpace(scene);
  await document.fonts.load('500 40px Cormorant');
  await document.fonts.load('italic 500 40px Cormorant');
  await document.fonts.load('600 40px Cormorant');
  await document.fonts.load('700 40px Cormorant');
  await document.fonts.ready;
  if (!params.has('dom')) {
    const { makeCompositor } = await import('./compose.js');
    comp = await makeCompositor(renderer.domElement, stage);
  }
  for (const t of [43, 41.5, 38, 32, 27, 22, 19.7, 17, 14, 12, 9, 7, 5, 2, 0]) renderFrame(t);
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, sky, state, update, you, cheetah, world };
  window.DURATION = VIDEO_DURATION;
  window.__glInfo = (() => {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  })();
  window.__ready = true;
  if (!RENDER_MODE) startPreview();
}

function startPreview() {
  const fit = () => { stage.style.transform = `scale(${Math.min(innerWidth / W, innerHeight / H_PX)})`; };
  fit();
  addEventListener('resize', fit);
  const hud = document.createElement('div');
  hud.id = 'hud';
  document.body.appendChild(hud);
  const still = params.has('still');
  let t = Number(params.get('still') ?? params.get('t') ?? 0);
  let playing = !still;
  let last = performance.now();
  addEventListener('keydown', (e) => {
    if (e.code === 'Space') playing = !playing;
    if (e.code === 'ArrowRight') t = Math.min(VIDEO_DURATION, t + 5);
    if (e.code === 'ArrowLeft') t = Math.max(0, t - 5);
  });
  window.__seek = (x) => { t = x; playing = false; renderFrame(t); };
  const loop = (now) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (playing) t = (t + dt) % VIDEO_DURATION;
    renderFrame(t);
    hud.textContent = `${t.toFixed(2)}s ${playing ? '▶' : '❚❚'}  ${(1 / Math.max(dt, 1e-3)).toFixed(0)}fps  [space] [←/→]`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

boot().catch((e) => {
  console.error(e);
  window.__error = String((e && e.stack) || e);
});

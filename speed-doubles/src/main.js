import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeCity } from './city.js';
import { makeSpace } from './space.js';
import { makeSolar } from './solar.js';
import { makeOverlay } from './overlay.js';
import { state, VIDEO_DURATION, LOOP, V_GO, V_SOUND, V_ORBIT, V_LIGHT, V_BOOM, V_AIR, V_SUN, TofMph, storyT, RIVER_Z1 } from './timeline.js';
import { DEG, lerp, smooth, wobble, keys, clamp } from './util.js';
import { G } from './bend.js';
import { makeCompositor } from './compose.js';

const W = 1080, H = 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));   // ?res=0.5: a quicker, softer preview (the text stays sharp)
const RW = Math.round(W * RES), RH = Math.round(H * RES);

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

// ---------- the street ----------
const street = new THREE.Scene();
street.fog = new THREE.FogExp2(0xc88a5c, 0.00016);
const cam = new THREE.PerspectiveCamera(56, W / H, 0.05, 80000);
cam.rotation.order = 'YXZ';
street.add(cam);
const sky = makeSky();
street.add(sky.mesh);
const city = makeCity(street);
sky.uniforms.uSunDir.value.copy(city.sunDir);

// your arms, pumping at the bottom of the frame while you can still see them
const arms = (() => {
  const g = new THREE.Group();
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc68a62, roughness: 0.7 });
  const mk = (sd) => {
    const pivot = new THREE.Group();
    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.3).translate(0, 0, -0.15), sleeve);
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.095, 0.1).translate(0, 0, -0.34), skin);
    const arm = new THREE.Group();
    arm.add(fore, fist);
    pivot.add(arm);
    pivot.position.set(sd * 0.125, -0.16, 0.0);
    g.add(pivot);
    return { pivot, arm, sd };
  };
  const L = mk(-1), R = mk(1);
  cam.add(g);
  return { g, L, R };
})();

// ---------- space ----------
const space = makeSpace();
const solar = makeSolar(space.glowTex);

const overlay = makeOverlay();

// post: MSAA scene target -> bloom -> tone map -> speed blur, vapour cone, glowing air, vignette, title band
const rt = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(RW, RH);
const renderPass = new RenderPass(street, cam);
composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.35, 0.4, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.3 }, uTitle: { value: 0 }, uCounter: { value: 0 },
    uBlur: { value: 0 }, uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uVapor: { value: 0 }, uHeat: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uBlur; uniform vec2 uCenter; uniform float uVapor; uniform float uHeat;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
    void main() {
      vec2 d = vUv - uCenter;
      vec2 da = d * vec2(1.0, 1920.0 / 1080.0);
      float r = length(da);
      // speed: a zoom blur that streaks everything away from where you're heading (stronger toward the edges)
      vec3 col = vec3(0.0);
      float jit = h(vUv * 1920.0 + uTime) - 0.5;
      float bl = uBlur * smoothstep(0.02, 0.5, r);
      for (int i = 0; i < 12; i++) { float k = (float(i) + jit) / 12.0; col += texture2D(tDiffuse, uCenter + d * (1.0 - bl * k)).rgb; }
      col /= 12.0;
      // the vapour cone as you break the sound barrier: a white shroud of condensation round the edges of your view
      float ring = smoothstep(0.32, 0.75, r + 0.06 * vn(vec2(atan(da.y, da.x) * 5.0, uTime * 6.0)));
      col = mix(col, vec3(0.93, 0.93, 0.95), uVapor * ring * 0.6);
      col += uVapor * 0.06;
      // the air in front of you crushed hot: a glowing bow shock ahead, pink-orange plasma licking in from the edges
      if (uHeat > 0.0) {
        float flick = vn(vec2(atan(da.y, da.x) * 8.0, uTime * 14.0)) * 0.6 + vn(vec2(r * 20.0, uTime * 9.0)) * 0.4;
        vec3 plasma = mix(vec3(1.0, 0.35, 0.25), vec3(1.0, 0.7, 0.4), flick);
        float edge = smoothstep(0.42, 0.62, max(abs(d.x) * 2.0, abs(d.y) * 1.25) + flick * 0.12);
        col = mix(col, col * vec3(1.05, 0.85, 0.75), uHeat * 0.35);
        col = mix(col, plasma * (0.7 + 0.6 * flick), edge * uHeat * 0.85);
      }
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      // soft dark bands behind the title and the counter so they read on any background
      col *= 1.0 - uTitle * 0.42 * exp(-pow((vUv.y - 0.69) / 0.1, 2.0));
      col *= 1.0 - uCounter * 0.3 * exp(-pow((vUv.y - 0.535) / 0.06, 2.0)) * smoothstep(0.75, 0.2, vUv.x);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- story -> picture ----------
// the "YOU" marker: a label and a short line pointing down at you (when you're seen from outside)
const youEl = document.getElementById('you');
const ndc = new THREE.Vector3();
function placeYou(pos, camera, alpha) {
  if (!pos || alpha <= 0.001) { youEl.style.opacity = '0'; return; }
  ndc.copy(pos).project(camera);
  const x = (ndc.x + 1) / 2 * W, y = (1 - ndc.y) / 2 * H;
  if (ndc.z > 1 || x < 60 || x > W - 60 || y < 160 || y > H - 40) { youEl.style.opacity = '0'; return; }
  youEl.style.opacity = alpha.toFixed(3);
  youEl.style.transform = `translate(${(x - 120).toFixed(1)}px, ${(y - 128).toFixed(1)}px)`;
}
const fogC = new THREE.Color(0xc88a5c);
let stridePh = 0, lastV = null;
function strideAt(v) {   // arm-pump phase (cycles), integrated over video time
  const T = v - V_GO;
  const f = T <= 0 ? 0 : Math.min(2.2 + T * 0.45, 7);
  return f;
}
const STRIDE_TAB = (() => { const n = 30 * 480, t = new Float64Array(n + 1); for (let i = 1; i <= n; i++) t[i] = t[i - 1] + strideAt(V_GO + (i - 0.5) / 480) / 480; return t; })();
const strideCycles = (v) => { const f = clamp((v - V_GO) * 480, 0, STRIDE_TAB.length - 2), i = Math.floor(f); return lerp(STRIDE_TAB[i], STRIDE_TAB[i + 1], f - i); };

function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) s.flash = Math.max(s.flash, cover);   // loop tail: the white clears into the first frame
  let scene = street, camera = cam;
  let blur = 0, vapor = 0, heat = 0, exposure = 1.0, bloomS = 0.3;

  if (s.scene === 'street') {
    const T = s.T;
    const run = smooth(V_GO - 0.1, V_GO + 0.4, v);
    const speedK = smooth(TofMph(40), TofMph(2000), T);
    const cyc = strideCycles(v);
    const bob = Math.abs(Math.sin(cyc * Math.PI)) * 0.06 * run * (1 - smooth(TofMph(150), TofMph(500), T));
    const shake = (0.0015 + 0.006 * speedK + 0.012 * s.heat) ;
    const boomJolt = Math.exp(-Math.pow((v - V_SOUND - 0.08) / 0.12, 2)) * 0.03;
    cam.position.set(
      wobble(v * 0.7, 1) * 0.05 * (1 - run) + Math.sin(cyc * Math.PI) * 0.04 * run * (1 - speedK),
      1.72 + bob + wobble(v * 0.3, 2) * 0.02,
      -s.dist,
    );
    const lb = s.lookBack;
    const lbE = lb * lb * (3 - 2 * lb);
    cam.rotation.set(
      lerp(0.6, 0.0, run) * DEG + lbE * 3.0 * DEG + (wobble(v * 23, 3) * shake + boomJolt * Math.sin(v * 90)),
      -Math.PI * lbE + wobble(v * 0.5, 4) * 0.4 * DEG * (1 - run) + wobble(v * 19, 5) * shake,
      wobble(v * 17, 6) * shake * 0.6 + Math.sin(cyc * Math.PI * 0.5) * 0.4 * DEG * run * (1 - speedK),
    );
    cam.fov = lerp(50, 74, smooth(TofMph(8), TofMph(1200), T)) + 6 * s.heat;
    if (s.aerial) {
      // outside: chasing you from behind and above, pulling back and rising as you speed up toward the sunset
      const a = clamp((v - V_AIR) / (V_ORBIT - V_AIR));
      const back = Math.exp(lerp(Math.log(16), Math.log(2600), Math.pow(a, 0.85)));
      const up = back * 0.38, side = back * 0.16;
      cam.position.set(side, 1.2 + up, -s.dist + back);
      const sh = 0.002 + 0.004 * s.heat;
      cam.rotation.set(-1.5 * DEG + wobble(v * 21, 3) * sh, Math.atan2(side, back) + wobble(v * 17, 5) * sh, wobble(v * 13, 6) * sh * 0.5);
      cam.fov = 60;
    }
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();

    // the arms: pumping hard, then just a blur, then gone (you are past anything legs can do)
    const showArms = run * (1 - smooth(TofMph(180), TofMph(420), T)) * (1 - lb);
    arms.g.visible = false;   // (POV arms read as boxes in this low-poly style; the running bob carries the 'you')
    for (const A of [arms.L, arms.R]) {
      const ph = cyc * Math.PI * 2 + (A.sd > 0 ? 0 : Math.PI);
      const sw = Math.sin(ph);
      // forearm swings from pointing down (fist out of frame) to forward and up (fist at the bottom of the frame)
      A.pivot.rotation.set(-0.42 + 0.52 * sw * showArms - (1 - showArms) * 1.0, A.sd * 0.16, A.sd * 0.25);
      A.pivot.position.y = -0.16 - (1 - showArms) * 0.25;
    }

    sky.mesh.position.copy(cam.position);
    sky.uniforms.uPx.value = (2 * Math.tan((cam.fov * DEG) / 2)) / RH;
    sky.uniforms.uCloudOff.value.set(0.3 + v * 0.002, 0.1);
    city.frame(v, s, cam);
    const you = city.runner(v, s, s.aerial, cam);
    placeYou(you, cam, s.aerial ? smooth(V_AIR + 0.25, V_AIR + 0.6, v) * (1 - smooth(22.3, 22.9, v)) : 0);
    city.water.uniforms.uFog.value.copy(fogC);
    city.water.uniforms.uFogD.value = street.fog.density;
    street.fog.color.copy(fogC);
    street.fog.density = 0.00016;
    city.hemi.intensity = 1.05;
    if (s.aerial) {   // dusk from above: less haze, a darker land so the towns' lights and the fireball stand out
      street.fog.color.setRGB(0.5, 0.36, 0.3);
      street.fog.density = 0.00006;
      city.hemi.intensity = 0.55;
    }

    blur = (0.06 * smooth(TofMph(60), TofMph(500), T) + 0.03 * smooth(TofMph(500), TofMph(3000), T)) * (1 - 0.6 * s.heat);
    blur *= 1 - 0.5 * Math.sin(Math.PI * clamp((lb - 0.05) / 0.9, 0, 1)) * 0;   // (looking back: same radial streaks, now converging)
    vapor = Math.exp(-Math.pow((v - V_SOUND - 0.15) / 0.22, 2));
    heat = s.heat;
    exposure = 0.95;
    bloomS = 0.32 + 0.3 * heat;
    sky.uniforms.uHalo.value = s.aerial ? 0.3 : 1;
    if (s.aerial) { blur = 0.01; heat = 0; bloomS = 0.22; exposure = 0.8; }
  } else if (s.scene === 'earth') {
    scene = space.scene; camera = space.camera;
    space.frame(v, s);
    placeYou(space.head, space.camera, space.youAlpha);
    exposure = 1.0; bloomS = 0.6 - 0.35 * smooth(V_LIGHT + 8, V_BOOM + 1, v);
  } else {
    scene = solar.scene; camera = solar.camera;
    solar.frame(v, s);
    placeYou(solar.head, solar.camera, smooth(V_SUN + 0.4, V_SUN + 0.9, v) * (1 - smooth(V_SUN + 4.6, V_SUN + 5.3, v)));
    exposure = 1.0; bloomS = 0.75;
  }

  renderPass.scene = scene;
  renderPass.camera = camera;
  renderer.toneMappingExposure = exposure;
  bloom.strength = bloomS;
  bloom.threshold = 1.0;
  bloom.radius = 0.35;
  finish.uniforms.uTime.value = v;
  finish.uniforms.uBlur.value = blur;
  finish.uniforms.uVapor.value = vapor;
  finish.uniforms.uHeat.value = heat;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : (1 - s.flash) * 0.9;

  overlay(v, s, v);
  return s;
}

let comp = null;
// t is video time. The last LOOP seconds replay the moments just before the first frame while the
// white clears, so the video loops seamlessly.
function renderFrame(t) {
  const tail = t - (VIDEO_DURATION - LOOP);
  if (tail >= 0) update(t - VIDEO_DURATION, 1 - smooth(0, LOOP * 0.92, tail));
  else update(t);
  composer.render();
  if (comp) comp.paint();
}

// ---------- boot ----------
async function boot() {
  await document.fonts.load('500 40px Cormorant');
  await document.fonts.load('italic 500 40px Cormorant');
  await document.fonts.load('600 40px Cormorant');
  await document.fonts.ready;
  await space.ready;
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  for (const t of [58, 45, 30, 17, 3, 0]) renderFrame(t);   // compile everything once (all three scenes)
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { G, street, cam, renderer, composer, space, solar, city };
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
  const fit = () => {
    const k = Math.min(innerWidth / W, innerHeight / H);
    stage.style.transform = `scale(${k})`;
  };
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
  window.__error = String(e && e.stack || e);
});

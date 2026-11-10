// The whole universe seen from outside, for Penrose's idea at the end (SEC.void .. SEC.end): the empty universe,
// nothing in it but a faint red shell of old light; the camera pulls back and back until all of it is one tiny point,
// which turns white-hot and bursts: a new Big Bang (a ball of new galaxies, the cosmic web), into the white.
// (Oct 25: the opening's version of this, which gave the ending away, was cut.)
import * as THREE from 'three';
import { SEC } from './timeline.js';
import { rng, smooth, clamp, keys } from './util.js';

const R = 100;   // today's radius in scene units

const vert = /* glsl */ `
attribute float aSize; attribute float aB; attribute float aAng; attribute float aIncl; attribute vec3 aCol; attribute float aOurs;
uniform float uA; uniform float uPx; uniform float uFade; uniform float uOursFade; uniform float uRed; uniform float uHot; uniform mat3 uRot; uniform float uFlyRed;
varying vec3 vCol; varying float vI; varying float vAng; varying float vIncl;
void main() {
  // ours (and its few bound neighbours) don't take part in the stretching
  vec3 p = uRot * position * mix(uA, 1.0, aOurs);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float d = max(-mv.z, 1.0);
  float px = aSize * uPx / d;
  gl_PointSize = clamp(px, 2.0, 90.0);
  float near = smoothstep(8.0, 40.0, d);
  vI = aB * mix(uFade, uOursFade, aOurs) * min(1.0, pow(px / 2.0, 2.0)) * near;
  vec3 c = aCol;
  // flying away: the light reddens and dims with distance
  float away = (1.0 - aOurs) * clamp(log(uA) / 3.0, 0.0, 1.0) * uFlyRed;
  c = mix(c, c * vec3(1.3, 0.45, 0.3), away);
  vI *= 1.0 - 0.6 * away;
  // the stars burning out: red, then dark
  c = mix(c, vec3(1.0, 0.32, 0.18), uRed);
  vCol = mix(c, vec3(0.8, 0.9, 1.3), uHot);
  vAng = aAng; vIncl = aIncl;
  gl_Position = projectionMatrix * mv;
}`;
const frag = /* glsl */ `
varying vec3 vCol; varying float vI; varying float vAng; varying float vIncl;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float c = cos(vAng), s = sin(vAng);
  q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  q.y /= vIncl;
  float r2 = dot(q, q);
  if (r2 > 1.0) discard;
  float r = sqrt(r2);
  float arms = 0.65 + 0.35 * sin(atan(q.y, q.x) * 2.0 + r * 11.0);
  float b = exp(-r2 * 45.0) * 2.2 + exp(-r2 * 5.0) * arms * 0.7;
  b *= 1.0 - smoothstep(0.7, 1.0, r);
  gl_FragColor = vec4(vCol * b * vI, 1.0);
}`;

function glowTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeDemo() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020308);

  // ---- the galaxies: clusters, the filaments between neighbours, a few loners; ours at the centre ----
  const r = rng(2026);
  const ball = () => { for (;;) { const p = [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1]; if (p[0] ** 2 + p[1] ** 2 + p[2] ** 2 < 1) return p; } };
  const gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());
  const CL = Array.from({ length: 150 }, ball);
  const pos = [], size = [], bri = [], ang = [], incl = [], col = [], ours = [];
  const add = (p, k = 1, o = 0) => {
    pos.push(p[0] * R, p[1] * R, p[2] * R);
    size.push((1.6 + 2.2 * Math.pow(r(), 3)) * k);
    bri.push((0.35 + 0.9 * Math.pow(r(), 2)) * Math.min(k, 1.6));
    ang.push(r() * Math.PI);
    incl.push(0.25 + 0.75 * r());
    const w = r();
    col.push(0.95 + 0.1 * w, 0.82 + 0.1 * w, 0.62 + 0.4 * w);
    ours.push(o);
  };
  add([0, 0, 0], 3.2, 1);   // the Milky Way and Andromeda, merged
  for (let i = 0; i < 9000; i++) {
    const k = r();
    if (k < 0.55) {
      const c = CL[Math.floor(r() * CL.length)], sg = 0.035 + 0.04 * r();
      add([c[0] + gauss() * sg, c[1] + gauss() * sg, c[2] + gauss() * sg]);
    } else if (k < 0.9) {
      const a = CL[Math.floor(r() * CL.length)];
      let b = null, bd = 1e9;
      for (let j = 0; j < 12; j++) { const c = CL[Math.floor(r() * CL.length)]; const d = (c[0] - a[0]) ** 2 + (c[1] - a[1]) ** 2 + (c[2] - a[2]) ** 2; if (c !== a && d < bd) { bd = d; b = c; } }
      const u = r(), sg = 0.012;
      add([a[0] + (b[0] - a[0]) * u + gauss() * sg, a[1] + (b[1] - a[1]) * u + gauss() * sg, a[2] + (b[2] - a[2]) * u + gauss() * sg]);
    } else add(ball());
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
  geo.setAttribute('aB', new THREE.Float32BufferAttribute(bri, 1));
  geo.setAttribute('aAng', new THREE.Float32BufferAttribute(ang, 1));
  geo.setAttribute('aIncl', new THREE.Float32BufferAttribute(incl, 1));
  geo.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aOurs', new THREE.Float32BufferAttribute(ours, 1));
  const U = {
    uA: { value: 1 }, uPx: { value: 1000 }, uFade: { value: 1 }, uOursFade: { value: 1 }, uRed: { value: 0 }, uHot: { value: 0 },
    uRot: { value: new THREE.Matrix3() }, uFlyRed: { value: 1 },
  };
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: U, vertexShader: vert, fragmentShader: frag,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  }));
  pts.frustumCulled = false;
  scene.add(pts);
  const NEW_ROT = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(1.9, 0.7, 2.6)));

  // ---- the blaze of the bang, and the flashes of black holes evaporating ----
  const tex = glowTexture([[0, 'rgba(255,255,255,1)'], [0.08, 'rgba(255,250,235,0.9)'], [0.25, 'rgba(255,220,170,0.35)'], [0.6, 'rgba(255,170,110,0.08)'], [1, 'rgba(255,150,90,0)']]);
  const sprite = (t = tex) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true })); scene.add(s); return s; };
  const glow = sprite();
  // ---- the empty universe for Penrose's idea: a faint shell of old red light ----
  const shellTex = glowTexture([[0, 'rgba(255,90,50,0.0)'], [0.55, 'rgba(255,80,40,0.05)'], [0.86, 'rgba(255,110,60,0.5)'], [0.93, 'rgba(255,140,90,0.25)'], [1, 'rgba(255,100,60,0)']]);
  const shell = sprite(shellTex);
  // ---- the marker on our galaxy: a gold ring, the same size on screen ----
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 64), new THREE.MeshBasicMaterial({ color: 0xf1c978, transparent: true, depthTest: false, depthWrite: false }));
  scene.add(ring);

  const v3 = new THREE.Vector3();
  return {
    scene,
    // returns where our galaxy is on screen (px) and how strongly to show its label
    frame(v, camera, punch = 0) {
      const pen = true;
      const after = v >= SEC.bang;
      const BANG = SEC.bang;
      // the camera: circling slowly around ours; for Penrose it pulls back and back from the empty universe
      const th = 0.6 + 0.04 * (v - SEC.void);
      const el = 0.3 - 0.008 * (v - SEC.void);
      const D = v < BANG ? 260 * Math.exp(4.2 * Math.pow(smooth(SEC.void, SEC.bang - 7, v), 1.4)) : 290 + 180 * smooth(BANG, SEC.end, v);
      camera.position.set(D * Math.cos(el) * Math.sin(th), D * Math.sin(el), D * Math.cos(el) * Math.cos(th));
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);
      camera.rotateX(-punch * 0.6 * Math.PI / 180);
      camera.fov = 45 * (1 - 0.03 * punch);
      camera.near = 0.5; camera.far = 1e6;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      const pxPerUnit = 1080 / (2 * Math.tan(camera.fov * Math.PI / 360)) / D;

      U.uPx.value = 1080 / (2 * Math.tan(camera.fov * Math.PI / 360));
      U.uRot.value.copy(after ? NEW_ROT : new THREE.Matrix3());
      if (after) {
        // the new universe: born white-hot out of the bang, spreading out
        U.uA.value = 1.8 * (1 - Math.exp(-0.55 * (v - BANG)));
        U.uFade.value = smooth(BANG + 0.15, BANG + 1.2, v); U.uOursFade.value = U.uFade.value;
        U.uHot.value = 1 - smooth(BANG + 0.5, BANG + 3.5, v);
        U.uRed.value = 0; U.uFlyRed.value = 0;
      } else if (pen) {
        U.uFade.value = 0; U.uOursFade.value = 0;
      }
      // the bang: one point appears in the dark, swells, bursts and fills the screen
      let gpx = 0, gi = 0;
      if (!after) {
        const pre = smooth(BANG - (pen ? 8 : 0.9), BANG, v);
        gpx = 22 + 60 * pre + 120 * pre * pre; gi = (pen ? smooth(BANG - 11, BANG - 8, v) * 0.9 : smooth(BANG - 0.9, BANG - 0.6, v)) * 0.5 + 0.8 * pre;
        if (!pen && v < BANG - 0.9) gi = 0;
      } else {
        const d = v - BANG;
        gpx = 3400 * smooth(0, 0.12, d) * Math.exp(-d * 0.55) + 120 * Math.exp(-d * 0.4);
        gi = smooth(0, 0.06, d) * (0.6 + 1.4 * Math.exp(-d * 0.9));
      }
      glow.visible = gi > 0.002;
      glow.scale.setScalar(gpx / pxPerUnit);
      glow.material.opacity = Math.min(1, gi);
      glow.material.color.setRGB(1, pen && !after ? 0.75 + 0.25 * smooth(BANG - 3, BANG, v) : 1, pen && !after ? 0.6 + 0.4 * smooth(BANG - 3, BANG, v) : 1).multiplyScalar(Math.max(1, gi));
      // Penrose: the faint shell of old light, shrinking to a point as the camera pulls back
      const sh = pen && !after ? smooth(SEC.void - 0.5, SEC.void + 2, v) * (1 - smooth(BANG - 9, BANG - 6, v)) : 0;
      shell.visible = sh > 0.002;
      shell.scale.setScalar(2 * R * 2.4);
      shell.material.opacity = sh * 0.9;

      // the marker and the label on our galaxy (until its stars are gone)
      const here = 0;
      ring.visible = here > 0.002;
      ring.quaternion.copy(camera.quaternion);
      ring.scale.setScalar(30 / pxPerUnit);
      ring.material.opacity = here * 0.9;
      v3.set(0, 0, 0).project(camera);
      return { x: (v3.x * 0.5 + 0.5) * 1920, y: (0.5 - v3.y * 0.5) * 1080, here };
    },
  };
}

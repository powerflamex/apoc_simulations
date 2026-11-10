// The opening demonstration (video 5 s .. SEC.walk): the whole universe seen from outside, a ball of galaxies (in
// clusters and filaments, the cosmic web) with ours in the middle, marked. It grows (the galaxies' light tinted red:
// flying apart), stops, falls back in (tinted blue: coming back), faster and faster, into one blazing point; a moment
// of black with one point of light; then a new Big Bang, and a new universe bursts out. Then the white, and the
// promenade. scaleAt(v) (timeline.js) is the size of the universe (1 = today).
import * as THREE from 'three';
import { SEC, scaleAt, scaleRate as rateAt } from './timeline.js';
import { rng, smooth, clamp, keys } from './util.js';

const R = 100;   // today's radius in scene units

const vert = /* glsl */ `
attribute float aSize; attribute float aB; attribute float aAng; attribute float aIncl; attribute vec3 aCol;
uniform float uA; uniform float uPx; uniform float uFade; uniform float uShift; uniform float uHot; uniform mat3 uRot;
varying vec3 vCol; varying float vI; varying float vAng; varying float vIncl;
void main() {
  vec3 p = uRot * position * uA;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float d = max(-mv.z, 1.0);
  float px = aSize * uPx / d;
  gl_PointSize = clamp(px, 2.0, 90.0);
  vI = aB * uFade * min(1.0, pow(px / 2.0, 2.0));
  // flying apart: the light reddens; coming back: it turns blue; newborn: white-hot
  vec3 c = aCol;
  c = mix(c, c * vec3(1.25, 0.55, 0.38), clamp(-uShift, 0.0, 1.0) * 0.75);
  c = mix(c, c * vec3(0.5, 0.75, 1.45), clamp(uShift, 0.0, 1.0) * 0.8);
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

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.08, 'rgba(255,250,235,0.9)');
  gr.addColorStop(0.25, 'rgba(255,220,170,0.35)');
  gr.addColorStop(0.6, 'rgba(255,170,110,0.08)');
  gr.addColorStop(1, 'rgba(255,150,90,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeDemo() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03050b);

  // ---- the galaxies: clusters, the filaments between neighbours, a few loners; ours at the centre ----
  const r = rng(2025);
  const ball = () => { for (;;) { const p = [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1]; if (p[0] ** 2 + p[1] ** 2 + p[2] ** 2 < 1) return p; } };
  const gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());
  const CL = Array.from({ length: 150 }, ball);
  const pos = [], size = [], bri = [], ang = [], incl = [], col = [];
  const add = (p, k = 1) => {
    pos.push(p[0] * R, p[1] * R, p[2] * R);
    size.push((1.6 + 2.2 * Math.pow(r(), 3)) * k);
    bri.push((0.35 + 0.9 * Math.pow(r(), 2)) * k);
    ang.push(r() * Math.PI);
    incl.push(0.25 + 0.75 * r());
    const w = r();   // old yellow ellipticals .. young blue spirals
    col.push(0.95 + 0.1 * w, 0.82 + 0.1 * w, 0.62 + 0.4 * w);
  };
  add([0, 0, 0], 2.2);   // the Milky Way
  for (let i = 0; i < 9000; i++) {
    const k = r();
    if (k < 0.55) {
      const c = CL[Math.floor(r() * CL.length)], sg = 0.035 + 0.04 * r();
      add([c[0] + gauss() * sg, c[1] + gauss() * sg, c[2] + gauss() * sg]);
    } else if (k < 0.9) {
      const a = CL[Math.floor(r() * CL.length)];
      let b = null, bd = 1e9;   // its nearest neighbour (by a cheap random sample)
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
  const U = {
    uA: { value: 1 }, uPx: { value: 1000 }, uFade: { value: 1 }, uShift: { value: 0 }, uHot: { value: 0 },
    uRot: { value: new THREE.Matrix3() },
  };
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: U, vertexShader: vert, fragmentShader: frag,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  }));
  pts.frustumCulled = false;
  scene.add(pts);
  // the new universe is a different arrangement: the same web, turned
  const NEW_ROT = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(1.9, 0.7, 2.6)));

  // ---- the blaze at the crunch and the bang ----
  const tex = glowTexture();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true }));
  scene.add(glow);
  // ---- the marker on the Milky Way: a gold ring, the same size on screen ----
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 64), new THREE.MeshBasicMaterial({ color: 0xf1c978, transparent: true, depthTest: false, depthWrite: false }));
  scene.add(ring);

  const v3 = new THREE.Vector3();
  return {
    scene,
    // returns where the Milky Way is on screen (px) and how strongly to show its label
    frame(v, camera, punch = 0) {
      const a = scaleAt(v), da = rateAt(v);
      // the camera circles slowly, backing off as it grows, closing in as it falls
      const th = 0.6 + 0.04 * (v - SEC.demo);
      const el = 0.32 - 0.01 * (v - SEC.demo);
      const D = keys([[SEC.demo, 250], [SEC.dStop, 395], [SEC.dFall, 405], [SEC.dCrunch, 290], [SEC.dBang, 290], [SEC.walk, 470]], v);
      camera.position.set(D * Math.cos(el) * Math.sin(th), D * Math.sin(el), D * Math.cos(el) * Math.cos(th));
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);
      camera.rotateX(-punch * 0.6 * Math.PI / 180);
      camera.fov = 45 * (1 - 0.03 * punch);
      camera.near = 0.5; camera.far = 5000;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();

      const after = v >= SEC.dBang;
      U.uA.value = Math.max(a, 1e-4);
      U.uPx.value = 1080 / (2 * Math.tan(camera.fov * Math.PI / 360));
      U.uShift.value = clamp(-da / 0.12, -1, 1);
      U.uRot.value.copy(after ? NEW_ROT : new THREE.Matrix3());
      // the galaxies melt into the blaze at the crunch; the new ones are born white-hot out of the bang
      U.uFade.value = after ? smooth(SEC.dBang + 0.15, SEC.dBang + 1.2, v) : 1 - smooth(SEC.dCrunch - 0.45, SEC.dCrunch - 0.05, v);
      U.uHot.value = after ? 1 - smooth(SEC.dBang + 0.5, SEC.dBang + 3.5, v) : 0;

      // the blaze: the crush brightens into one point; it shrinks to a dot in the dark; the bang fills the screen
      const pxPerUnit = U.uPx.value / D;
      let gpx = 0, gi = 0;
      if (v < SEC.dBang) {
        const k = smooth(SEC.dCrunch - 2.5, SEC.dCrunch, v);
        const shrink = smooth(SEC.dCrunch, SEC.dCrunch + 0.35, v);
        const pre = smooth(SEC.dBang - 0.45, SEC.dBang, v);
        gpx = (60 + 600 * k * k) * (1 - shrink) + 44 * shrink + 140 * pre * pre;
        gi = k * (1 - 0.2 * shrink) + 0.6 * pre;
      } else {
        const d = v - SEC.dBang;
        gpx = 3400 * smooth(0, 0.12, d) * Math.exp(-d * 0.55) + 120 * Math.exp(-d * 0.4);
        gi = smooth(0, 0.06, d) * (0.6 + 1.4 * Math.exp(-d * 0.9));
      }
      glow.visible = gi > 0.002;
      glow.scale.setScalar(gpx / pxPerUnit);
      glow.material.opacity = Math.min(1, gi);
      glow.material.color.setRGB(1, 1, 1).multiplyScalar(Math.max(1, gi));

      // the marker and the label on our galaxy (until it all starts falling in on it)
      const here = smooth(SEC.demo + 1.2, SEC.demo + 2, v) * (1 - smooth(SEC.dFall + 2.5, SEC.dFall + 3.3, v));
      ring.visible = here > 0.002;
      ring.quaternion.copy(camera.quaternion);
      ring.scale.setScalar(26 / pxPerUnit);
      ring.material.opacity = here * 0.9;
      v3.set(0, 0, 0).project(camera);
      return { x: (v3.x * 0.5 + 0.5) * 1920, y: (0.5 - v3.y * 0.5) * 1080, here };
    },
  };
}

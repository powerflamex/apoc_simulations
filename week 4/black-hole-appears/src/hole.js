// The black hole itself. It is far too small to see until the very end (3e-16 m at the start, a marble at Earth's
// mass), so what you see is what it does:
//   its Hawking glow: a white-hot point at the start (36 GW from something smaller than a proton) that fades 100x
//     every 3 s as it gets heavier (out by ~15 s);
//   the swirl: everything it pulls in piles up round it, spinning, crushed and glowing: a flat spiral of light that
//     grows with it (a log spiral, the same at every scale, so the final zoom never runs out of detail), with flashes
//     when something big is crushed;
//   at the end, the marble itself: the screen-space lens in main.js bends everything round its 4.6 cm shadow.
import * as THREE from 'three';
import { B } from './pull.js';
import { hawkingW, d1g } from './timeline.js';
import { smooth, clamp } from './util.js';

export const accR = (v) => 0.35 * d1g(v);     // the swirl's outer edge (about a third of the way out to where its pull is Earth's)

export function makeHole(scene) {
  // a flat ring from 1e-8 to 1 of its radius, rings spaced in log r (scaled to accR each frame)
  const NR = 220, NS = 160, LO = Math.log(1e-8);
  const pos = [], uvs = [], idx = [];
  for (let i = 0; i <= NR; i++) {
    const r = Math.exp(LO * (1 - i / NR));
    for (let j = 0; j <= NS; j++) {
      const a = (j / NS) * Math.PI * 2;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      uvs.push(j / NS, i / NR);
    }
  }
  for (let i = 0; i < NR; i++) for (let j = 0; j < NS; j++) {
    const a = i * (NS + 1) + j, b = a + 1, c = a + NS + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  const U = { uTime: { value: 0 }, uBright: { value: 0 }, uInner: { value: 0 }, uR: { value: 1 }, uCap: { value: 6 }, uFocus: { value: 1e12 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `varying vec2 vP;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform float uBright; uniform float uInner; uniform float uR; uniform float uCap; uniform float uFocus; varying vec2 vP;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        #include <logdepthbuf_fragment>
        float r = length(vP);
        if (r < uInner) discard;
        float lr = log(max(r, 1e-9));
        float a = atan(vP.y, vP.x);
        // spinning faster further in (log time), arms wound in a log spiral, clumps of crushed matter
        float spin = uTime * 1.6 - lr * 0.35;
        float arms = 0.5 + 0.5 * cos(3.0 * (a - spin) + lr * 4.0);
        float clump = n2(vec2((a - spin) * 6.0, lr * 7.0)) * 0.6 + n2(vec2((a - spin) * 19.0, lr * 23.0)) * 0.4;
        float edge = (1.0 - smoothstep(0.55, 1.0, r)) * exp(-pow(r * uR / uFocus, 2.0));
        float inner = smoothstep(uInner, uInner * 1.6 + 1e-9, r);
        float I = pow(max(r, 1e-6), -0.55) * 0.12;
        float b = (0.25 + 0.75 * arms) * (0.45 + 0.9 * clump) * edge * inner;
        // white-hot in the middle, orange, then deep red at the edge
        // colour: white-hot at the inner edge, orange, then deep red (in the zoom: by distance from the inner edge)
        float t = uFocus < 1e11 ? clamp(1.0 - log(max(r / max(uInner, 1e-12), 1.0)) / 2.6, 0.0, 1.0) * 0.85 : clamp(-lr / 7.0, 0.0, 1.0);
        vec3 c = mix(vec3(1.6, 0.35, 0.08), vec3(2.2, 1.2, 0.5), smoothstep(0.0, 0.4, t));
        c = mix(c, vec3(2.6, 2.4, 2.3), smoothstep(0.45, 1.0, t));
        gl_FragColor = vec4(c * b * min(I, uCap) * uBright, 1.0);
      }`,
  });
  const disk = new THREE.Mesh(g, mat);
  disk.frustumCulled = false;
  // tipped 24 degrees (its spin axis leans north), so it shows from the street and not just edge-on
  disk.rotation.x = 24 * Math.PI / 180;
  disk.renderOrder = 7;
  scene.add(disk);

  // (decay 1, not 2: with an inverse-square light, things falling right into it would be lit thousands of times too bright)
  const light = new THREE.PointLight(0xffffff, 0, 0, 1);
  scene.add(light);

  // the star it makes in your eyes (and the camera): a hard core and long thin spikes
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const g2 = cv.getContext('2d');
  const gr = g2.createRadialGradient(256, 256, 0, 256, 256, 256);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.04, 'rgba(235,242,255,0.9)'); gr.addColorStop(0.15, 'rgba(160,190,255,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g2.fillStyle = gr; g2.fillRect(0, 0, 512, 512);
  g2.globalCompositeOperation = 'lighter';
  for (const [a, L, w] of [[0, 1, 5], [Math.PI / 2, 1, 5], [Math.PI / 4, 0.45, 3], [-Math.PI / 4, 0.45, 3]]) {
    g2.save(); g2.translate(256, 256); g2.rotate(a);
    const lg = g2.createLinearGradient(-256 * L, 0, 256 * L, 0);
    lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(0.5, 'rgba(225,235,255,0.95)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
    g2.fillStyle = lg; g2.beginPath(); g2.moveTo(-256 * L, 0); g2.lineTo(0, -w); g2.lineTo(256 * L, 0); g2.lineTo(0, w); g2.closePath(); g2.fill();
    g2.restore();
  }
  const starTex = new THREE.CanvasTexture(cv);
  starTex.colorSpace = THREE.SRGBColorSpace;
  const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, color: new THREE.Color(3, 3, 3.4), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  star.renderOrder = 8;
  scene.add(star);

  const STREAKS = [];
  for (let i = 0; i < 150; i++) STREAKS.push({ a: i * 2.3999, ph: (i * 0.618034) % 1, T: 2.4 + ((i * 0.3819) % 1) * 2.6, s: 0.012 + 0.02 * ((i * 0.7071) % 1), y: (((i * 0.4142) % 1) - 0.5) * 0.12 });
  const BALL = [];
  for (let i = 0; i < 260; i++) {
    const r = Math.pow(((i * 0.6180339) % 1), 1.6), y = (((i * 0.4142) % 1) * 2 - 1) * 0.55;
    const rh = Math.sqrt(Math.max(0, r * r - y * y * r * r)) + 0.02;
    BALL.push({ a: i * 2.3999, w: 0.35 / (0.1 + r), rh, y: y * r, s: 0.06 + 0.12 * (1 - r), hot: 1.0 - 0.55 * r, ph: i * 1.7 });
  }
  // how bright the Hawking point is (0..1): log of its power, 36 GW at the start
  const hawk = (v) => clamp((Math.log10(hawkingW(v)) - 0.6) / 9.95);

  return {
    disk, light, U, hawk, star,
    frame(v, glows, crush, camPos, opts = {}) {
      const R = opts.R ?? accR(v);
      disk.position.copy(B);
      disk.scale.setScalar(R);
      disk.rotation.x = (opts.tilt ?? 24) * Math.PI / 180;
      U.uTime.value = v; U.uR.value = R;
      U.uInner.value = opts.inner ?? 0;
      U.uCap.value = opts.cap ?? 6;
      U.uFocus.value = opts.focus ?? 1e12;
      // (from the sky the swirl is drawn over the ground, so the land it hangs over doesn't slice it in half)
      mat.depthTest = !opts.overGround;
      // the swirl lights up as things reach it (the first dust and tokens at ~1-2 s), flashing as big things go in
      const acc = smooth(0.8, 3.5, v) * (0.75 + 0.25 * Math.tanh(crush * 0.4));
      U.uBright.value = acc * (opts.diskK ?? 1);
      // the Hawking point: blue-white, a hard core and a soft halo
      const hk = hawk(v);
      const dc = camPos.distanceTo(B);
      if (hk > 0 && !opts.noHawk) {
        const core = Math.max(0.022, dc * 0.0035);
        glows.add(B.x, B.y, B.z, core, 7 * hk, 7.5 * hk, 9 * hk);
        glows.add(B.x, B.y, B.z, core * 4, 0.9 * hk * hk, 1.0 * hk * hk, 1.4 * hk * hk);
        glows.add(B.x, B.y, B.z, 0.25 * hk + 0.04, 0.08 * hk, 0.1 * hk, 0.16 * hk);
      }
      star.position.copy(B);
      star.scale.setScalar(dc * 0.42 * Math.pow(hk, 1.3) * (1 + 0.04 * Math.sin(v * 37)));
      star.material.rotation = 0.12 * Math.sin(v * 0.7);
      star.visible = hk > 0.01 && !opts.noStar;
      // the crushed core: a hot knot at the centre of the swirl, flaring when something is crushed
      const kn = acc * (0.6 + Math.min(1.5, crush * 0.25));
      if (!opts.noHawk) glows.add(B.x, B.y, B.z, Math.max(R * 0.08, dc * 0.003), 3 * kn, 1.8 * kn, 0.9 * kn);
      // a pulse through the swirl on every step (10x every 3 s)
      const st = v % 3, pulse = v > 2.5 ? Math.exp(-st / 0.35) * smooth(0, 0.05, st) : 0;
      U.uBright.value *= 1 + 0.9 * pulse;
      // (from the sky) glowing pieces of the land streaking in along the swirl, each drawn as a short trail
      const sk = opts.streaks ?? 0;
      if (sk > 0.01) {
        const ct = Math.cos(disk.rotation.x), sn = Math.sin(disk.rotation.x);
        for (const p of STREAKS) {
          for (let j = 0; j < 10; j++) {
            const u = (((v - j * 0.012) / p.T + p.ph) % 1 + 1) % 1;
            const rn = 2.4 * Math.pow(1 - u, 1.5) + 0.05;
            const th = p.a + 2.6 * Math.log(2.4 / rn) + v * 0.35;
            const x = Math.cos(th) * rn * R, z = Math.sin(th) * rn * R, y = p.y * rn * R;
            const hot = 0.4 + 0.6 * (1 - rn / 2.45);
            const g = sk * (1 - j / 10) * smooth(0, 0.08, u) * hot * (1 + 1.2 * pulse) * 0.75;
            glows.add(B.x + x, B.y + y * ct - z * sn, B.z + y * sn + z * ct, R * p.s * (1.2 - j * 0.06), 2.6 * g, 1.2 * g * hot, 0.35 * g * hot * hot);
          }
        }
      }
      // a ball of crushed, glowing matter churning round it (seen from any side), fading when the camera is inside it
      const Rb = R * 0.32;
      const bk = acc * smooth(Rb * 1.5, Rb * 4, dc) * (opts.ballK ?? 1);
      if (bk > 0.01) {
        for (let i = 0; i < BALL.length; i++) {
          const p = BALL[i];
          const a = p.a + v * p.w;
          const x = Math.cos(a) * p.rh, z = Math.sin(a) * p.rh;
          const t = (0.6 + 0.4 * Math.sin(v * 3 + p.ph)) * bk;
          glows.add(B.x + x * Rb, B.y + p.y * Rb, B.z + z * Rb, Rb * p.s, 1.3 * t * p.hot, 0.6 * t * p.hot * p.hot, 0.22 * t * p.hot * p.hot * p.hot);
        }
      }
      // its light on the street
      light.position.copy(B);
      const Lh = 7 * hk * hk, La = 4 * kn * Math.max(1, R);
      light.intensity = (Lh + La) * (opts.lightK ?? 1) * (opts.noHawk ? 0.3 : 1);
      light.color.setRGB((Lh * 0.85 + La * 1.0) / (Lh + La + 1e-6), (Lh * 0.9 + La * 0.62) / (Lh + La + 1e-6), (Lh * 1.0 + La * 0.35) / (Lh + La + 1e-6));
      if (opts.noHawk) light.color.setRGB(1.0, 0.5, 0.35);
      return { hk, kn };
    },
  };
}

// Your own phone: lifted into the bottom of the frame at 0:17 (it was filming the aurora; now NO SERVICE), lowered at
// 0:21. A dark slab with a lit screen and a hand that is only a silhouette, carried with the camera. The pictures on the
// screen are painted on a canvas at load.
import * as THREE from 'three';
import { V_PHONE } from './timeline.js';
import { smooth } from './util.js';

function screenTex() {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 1024;
  const g = cv.getContext('2d');
  const paint = (x0, gone) => {
    const W = 512, H = 1024;
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, "#3a0a18"); gr.addColorStop(0.35, "#6a1a40"); gr.addColorStop(0.6, "#1a8a50"); gr.addColorStop(0.78, "#0a2a1a"); gr.addColorStop(1, "#06080a");
    g.fillStyle = gr; g.fillRect(x0, 0, W, H);
    for (let k = 0; k < 9; k++) { const cx = x0 + 30 + k * 56; const cg = g.createLinearGradient(0, 260, 0, 700); cg.addColorStop(0, "rgba(120,255,160,0)"); cg.addColorStop(0.7, "rgba(120,255,170,.55)"); cg.addColorStop(1, "rgba(255,120,200,.4)"); g.fillStyle = cg; g.fillRect(cx, 260 + (k % 3) * 30, 20 + (k % 2) * 14, 440); }
    g.fillStyle = "#0b0d10";
    for (let b2 = 0; b2 < 16; b2++) { const h = 60 + ((b2 * 57) % 160); g.fillRect(x0 + b2 * 34, 790 - h, 28, h + 240); }
    // the status bar
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x0, 0, W, 104);
    g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = '#fff';
    g.font = '700 46px Arial, sans-serif'; g.fillText('11:59', x0 + 34, 56);
    if (!gone) {
      for (let b = 0; b < 4; b++) g.fillRect(x0 + 380 + b * 24, 76 - b * 12, 16, 12 + b * 12);
    } else {
      g.fillStyle = 'rgba(0,0,0,.72)'; g.fillRect(x0, 372, W, 240);
      g.fillStyle = '#ff4a3a'; g.font = '900 86px Arial, sans-serif'; g.textAlign = 'center';
      g.fillText('NO', x0 + W / 2, 442);
      g.fillStyle = '#ffffff'; g.font = '900 78px Arial, sans-serif';
      g.fillText('SERVICE', x0 + W / 2, 540);
      g.textAlign = 'left';
      g.fillStyle = '#ff4a3a'; g.font = '700 42px Arial, sans-serif'; g.fillText('No signal', x0 + 256, 56);
    }
  };
  paint(0, false); paint(512, true);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function makePhone(camera, ctx) {
  const rig = new THREE.Group();
  camera.add(rig);
  const W = 0.078, H = 0.164;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(W + 0.006, H + 0.006, 0.009), ctx.plainMat(0x08080a, 0.4));
  rig.add(slab);
  const U = { uTex: { value: screenTex() }, uGone: { value: 0 }, uB: { value: 1 } };
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform sampler2D uTex; uniform float uGone; uniform float uB; varying vec2 vUv;
      void main(){
        vec2 a = vec2(vUv.x * 0.5, vUv.y), b = a + vec2(0.5, 0.0);
        vec3 c = mix(texture2D(uTex, a).rgb, texture2D(uTex, b).rgb, uGone);
        gl_FragColor = vec4(pow(c, vec3(2.2)) * uB, 1.0);
      }`,
  }));
  screen.position.z = 0.0051;
  rig.add(screen);
  // the hand: fingers round the far edge, a thumb, a palm and wrist running out of the frame, all in shadow
  const skin = ctx.plainMat(0x241a16, 0.75);
  const hand = new THREE.Group();
  rig.add(hand);
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.03), skin);
  palm.position.set(0.012, -0.066, -0.022); hand.add(palm);
  for (let k = 0; k < 4; k++) {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, 0.036, 3, 6), skin);
    f.rotation.z = Math.PI / 2;
    f.position.set(-W / 2 - 0.004, 0.012 - k * 0.0215, -0.002);
    hand.add(f);
  }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.0105, 0.05, 3, 6), skin);
  thumb.position.set(W / 2 + 0.006, -0.046, 0.002); thumb.rotation.z = 0.28; hand.add(thumb);
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.038, 0.34, 8), skin);
  wrist.position.set(0.05, -0.27, -0.04); wrist.rotation.z = 0.32; hand.add(wrist);
  rig.traverse((o) => { o.frustumCulled = false; });
  return {
    frame(v) {
      const up = smooth(V_PHONE - 1.1, V_PHONE - 0.2, v) * (1 - smooth(V_PHONE + 3.0, V_PHONE + 3.6, v));
      rig.visible = up > 0.002;
      if (!rig.visible) return;
      rig.position.set(0.105, -0.34 + 0.21 * up, -0.46);
      rig.rotation.set(0.1, -0.1, -0.07);
      U.uGone.value = smooth(V_PHONE + 0.1, V_PHONE + 0.16, v);
      U.uB.value = 1.25;
    },
  };
}

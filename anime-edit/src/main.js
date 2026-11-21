// Glue: load the layers, build the scene, and draw any moment of the edit with renderFrame(t).
import * as THREE from 'three';
import { DURATION, KICKS, DROP1, DROP2, CHAR, camera as camAt, puppet, look, text as textAt } from './timeline.js';
import { buildScene } from './scene.js';
import { buildPost } from './post.js';
import { buildText } from './text.js';

const W = 1080, H = 1920;
const Q = new URLSearchParams(location.search);
const canvas = document.getElementById('c');

async function init() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const gl = renderer.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info');
  window.__glInfo = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';

  const img = (u) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('missing ' + u)); i.src = u; });
  const [L, char, charDepth, far, farDepth, near, nearDepth, sky, water, textTex] = await Promise.all([
    fetch('assets/layout.json').then((r) => r.json()),
    img('assets/char.png'), img('assets/char_depth.png'), img('assets/shrine_far.png'), img('assets/shrine_far_depth.png'),
    img('assets/shrine_near.png'), img('assets/shrine_near_depth.png'), img('assets/sky.jpg'), img('assets/water.jpg'), buildText(),
  ]);
  const S = buildScene({ char, charDepth, far, farDepth, near, nearDepth, sky, water }, L);
  const post = buildPost(renderer, W, H, textTex);
  const cam = new THREE.PerspectiveCamera(40, W / H, 0.3, 1200);
  const D = Math.PI / 180, v = new THREE.Vector3();
  const strong = KICKS.filter(([, s]) => s >= 0.9).map(([k]) => k);

  const CAM_T = Q.has('cam') ? Number(Q.get('cam')) : null;
  function renderFrame(t) {
    t = Math.min(Math.max(t, 0), DURATION - 1e-4);
    const pose = camAt(CAM_T ?? t), lk = look(t), tx = textAt(t);       // ?cam=4.6 freezes the camera (to check the puppet alone)
    cam.position.set(pose.p[0], pose.p[1], pose.p[2]);
    cam.up.set(0, 1, 0); cam.lookAt(pose.g[0], pose.g[1], pose.g[2]);
    cam.rotateY(pose.yaw * D); cam.rotateX(pose.pitch * D); cam.rotateZ(pose.roll * D);
    cam.fov = pose.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    // focus stays on him
    const focus = Math.max(2.5, v.set(CHAR.x, 3.2, CHAR.z + 0.3).distanceTo(cam.position));
    // embers rise faster after each drop
    let rise = t * 1.1;
    for (const d of [DROP1, DROP2]) if (t > d) rise += 2.2 * (1 - Math.exp(-(t - d) * 3));
    S.update(t, { look: lk, puppet: puppet(t), focus, rise }, cam);

    // his mirror image for the water
    renderer.setRenderTarget(S.reflRT); renderer.clear(); renderer.render(S.mirrorScene, cam);
    renderer.setRenderTarget(post.sceneRT); renderer.clear(); renderer.render(S.scene, cam);

    post.dof.uniforms.uFocus.value = focus;
    post.dof.uniforms.uAperture.value = 4.5 + 3.5 * Math.min(1, Math.max(0, (30 - focus) / 20));   // close shots: thinner focus
    const f = post.fin.uniforms;
    f.uTime.value = t; f.uHeat.value = lk.heat; f.uKick.value = lk.kick; f.uFlash.value = lk.flash; f.uLoop.value = lk.loop; f.uArc.value = lk.arc;
    f.uZoom.value = Math.min(0.42, pose.blur * 0.17);
    f.uSpin.value = pose.blur * 0.035 * (pose.roll > 0 ? 1 : -1);
    f.uWhip.value = pose.whip;
    // lanterns -> lens flares (only while they are in front of the lens and inside the frame)
    S.lant.forEach((p, i) => {
      v.copy(p).applyMatrix4(cam.matrixWorldInverse); f.uLD.value.setComponent(i, -v.z);
      v.copy(p).project(cam);
      const inFront = v.z < 1 && v.z > -1, e = Math.max(Math.abs(v.x), Math.abs(v.y));
      (i ? f.uL1 : f.uL0).value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5, inFront ? Math.max(0, 1 - Math.max(0, e - 0.9) * 4) : 0);
    });
    let since = 9; for (const k of strong) if (t >= k) since = t - k;
    f.uLeak.value.set(-0.75 + since * 4.2, Math.exp(-since * 3.5) * 0.9);
    if (tx.n) { f.uTextA.value.set(tx.n, tx.pop, tx.glitch, tx.bar); f.uTextB.value.set(tx.slide, tx.alpha); } else f.uTextA.value.set(0, 0, 0, 0);
    post.render(cam);
  }
  window.renderFrame = renderFrame;
  window.__duration = DURATION;

  if (Q.has('render')) { renderFrame(0); window.__ready = true; return; }
  if (Q.has('t')) { renderFrame(Number(Q.get('t'))); window.__ready = true; return; }
  // live preview: loops, with the song
  const audio = new Audio('assets/song.wav'); audio.loop = true;
  let t0 = performance.now();
  addEventListener('click', () => { audio.currentTime = ((performance.now() - t0) / 1000) % DURATION; audio.play(); });
  const tick = () => { renderFrame(((performance.now() - t0) / 1000) % DURATION); requestAnimationFrame(tick); };
  window.__ready = true; tick();
}
init().catch((e) => { console.error(e); window.__error = String(e && e.stack || e); document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f66;position:fixed;top:0;left:0;white-space:pre-wrap">${window.__error}</pre>`); });

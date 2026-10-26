// Your phone, in your right hand at the bottom of the view (first person, it moves with your eyes): at the start
// it shows the result of the IQ test you just took on iqmaxx.ing (the owner's site): 100, exactly average; at the
// end you look at it again (back to 100) and it invites you to take the test. The screen is a canvas texture.
import * as THREE from 'three';
import { smooth, lerp } from './util.js';
import { SEC } from './timeline.js';

const CW = 540, CH = 1110;

function drawScreen(g, end) {
  const bg = g.createLinearGradient(0, 0, 0, CH);
  bg.addColorStop(0, '#141a33'); bg.addColorStop(1, '#0b0e1c');
  g.fillStyle = bg; g.fillRect(0, 0, CW, CH);
  // status bar and the site's name
  g.fillStyle = 'rgba(255,255,255,0.75)'; g.font = '600 26px Segoe UI, Arial'; g.textAlign = 'left'; g.fillText('3:42', 34, 46);
  g.textAlign = 'right'; g.fillText('5G  ▮▮▮', CW - 34, 46);
  g.textAlign = 'center';
  g.fillStyle = '#ffffff'; g.font = '800 54px Segoe UI, Arial';
  const wa = g.measureText('iqmaxx').width, wb = g.measureText('.ing').width, xa = CW / 2 - (wa + wb) / 2;
  g.textAlign = 'left';
  g.fillText('iqmaxx', xa, 132);
  g.fillStyle = '#7c6cff'; g.fillText('.ing', xa + wa, 132);
  g.textAlign = 'center';
  g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(40, 160, CW - 80, 2);
  // the result
  g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = '700 30px Segoe UI, Arial'; g.letterSpacing = '6px';
  g.fillText('YOUR IQ', CW / 2, 250);
  g.letterSpacing = '0px';
  const num = g.createLinearGradient(0, 270, 0, 500);
  num.addColorStop(0, '#ffffff'); num.addColorStop(1, '#b9b2ff');
  g.fillStyle = num; g.font = '800 230px Segoe UI, Arial';
  g.fillText('100', CW / 2, 470);
  g.fillStyle = '#ffd36b'; g.font = '700 38px Segoe UI, Arial';
  g.fillText('Exactly average', CW / 2, 548);
  // the bell curve with you in the middle
  const x0 = 60, x1 = CW - 60, yb = 760, h = 150;
  g.beginPath();
  for (let i = 0; i <= 100; i++) {
    const u = i / 100, z = (u - 0.5) * 6;
    const x = lerp(x0, x1, u), y = yb - h * Math.exp(-z * z / 2);
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.lineTo(x1, yb); g.lineTo(x0, yb); g.closePath();
  const fill = g.createLinearGradient(0, yb - h, 0, yb);
  fill.addColorStop(0, 'rgba(124,108,255,0.55)'); fill.addColorStop(1, 'rgba(124,108,255,0.08)');
  g.fillStyle = fill; g.fill();
  g.strokeStyle = '#9d92ff'; g.lineWidth = 4; g.stroke();
  g.strokeStyle = '#ffd36b'; g.lineWidth = 4; g.beginPath(); g.moveTo(CW / 2, yb - h - 18); g.lineTo(CW / 2, yb); g.stroke();
  g.fillStyle = '#ffd36b'; g.beginPath(); g.arc(CW / 2, yb - h - 26, 10, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.font = '600 24px Segoe UI, Arial';
  g.textAlign = 'left'; g.fillText('70', x0 - 6, yb + 34); g.textAlign = 'center'; g.fillText('100', CW / 2, yb + 34); g.textAlign = 'right'; g.fillText('130', x1 + 6, yb + 34);
  g.textAlign = 'center';
  g.fillStyle = 'rgba(255,255,255,0.8)'; g.font = '600 30px Segoe UI, Arial';
  g.fillText('Smarter than 50% of people', CW / 2, 850);
  // the button
  const by = 910, bw = CW - 100;
  const btn = g.createLinearGradient(50, 0, 50 + bw, 0);
  btn.addColorStop(0, '#7c6cff'); btn.addColorStop(1, '#4fc3ff');
  g.fillStyle = btn; g.beginPath(); g.roundRect(50, by, bw, 104, 52); g.fill();
  g.fillStyle = '#ffffff'; g.font = '800 36px Segoe UI, Arial';
  g.fillText(end ? 'TAKE THE TEST  →' : 'TRY AGAIN  →', CW / 2, by + 66);
}

export function makePhone(camera) {
  const canvas = document.createElement('canvas');
  canvas.width = CW; canvas.height = CH;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  let shown = null;
  const set = (end) => { if (shown === end) return; shown = end; g.clearRect(0, 0, CW, CH); drawScreen(g, end); tex.needsUpdate = true; };
  set(false);
  const group = new THREE.Group();
  const W = 0.072, H = W * CH / CW;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W + 0.006, H + 0.008, 0.008), new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.35, metalness: 0.4 }));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(0.85, 0.85, 0.85) }));
  screen.position.z = 0.0042;
  // your hand round it: fingers along the left edge, the thumb on the right, the palm behind
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a27c, roughness: 0.6 });
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.09, 0.025), skin);
  palm.position.set(0.01, -0.06, -0.017);
  const fingers = [0, 1, 2, 3].map((k) => {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, 0.022, 3, 6), skin);
    f.rotation.z = Math.PI / 2;
    f.position.set(-W / 2 - 0.012, -0.035 - k * 0.017, -0.002);
    return f;
  });
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.04, 3, 6), skin);
  thumb.position.set(W / 2 + 0.006, -0.06, 0.004); thumb.rotation.z = 0.5;
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.044, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0x5b7fa6, roughness: 0.8 }));
  sleeve.position.set(0.04, -0.2, -0.05); sleeve.rotation.set(0.5, 0, 0.35);
  group.add(body, screen, palm, thumb, sleeve, ...fingers);
  group.visible = false;
  camera.add(group);
  return {
    // v: the video clock; the phone comes up at the start and again near the end
    frame(v) {
      // (a quick look at the start, then again near the end)
      const a = smooth(6.1, 6.8, v) * (1 - smooth(9.7, 10.8, v));
      const b = smooth(SEC.end + 10.2, SEC.end + 11.4, v) * (1 - smooth(SEC.end + 22.2, SEC.end + 23.6, v));
      const k = Math.max(a, b);
      group.visible = k > 0.001;
      if (!group.visible) return;
      set(v > SEC.end);
      // held low on the right, tipped toward your eyes; it rises into view and drops away
      group.position.set(0.105, lerp(-0.42, -0.088, k), -0.36);
      group.rotation.set(lerp(-0.9, 0.12, k), -0.16, -0.06);
    },
  };
}

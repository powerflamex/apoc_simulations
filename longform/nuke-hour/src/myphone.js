// Your phone in your hand, low in the frame: the messages app with Mom (or Jay), painted on a canvas whenever what it
// shows changes. Shown in the evening (texting), in the stairwell (No Service, Not Delivered) and in the garage (one
// bar, Delivered, the replies). The notification cards (overlay.js) carry the same words big enough to read.
import * as THREE from 'three';
import { smooth } from './util.js';

const CW = 600, CH = 1200;

function paint(g, st) {
  g.fillStyle = '#0b0b0d'; g.fillRect(0, 0, CW, CH);
  // status bar
  g.fillStyle = '#fff'; g.font = '600 40px Arial, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillText(st.time, 40, 52);
  g.textAlign = 'right';
  if (st.signal === 'none') { g.fillStyle = '#ff5a4a'; g.fillText('No Service', CW - 40, 52); }
  else if (st.signal === 'sos') { g.fillStyle = '#ffffff'; g.fillText('SOS', CW - 40, 52); }
  else { const bars = st.signal === 'one' ? 1 : 4; for (let b = 0; b < 4; b++) { g.fillStyle = b < bars ? '#fff' : 'rgba(255,255,255,.25)'; g.fillRect(CW - 130 + b * 24, 66 - 10 - b * 9, 16, 14 + b * 9); } }
  // the thread's header
  g.fillStyle = '#1c1c20'; g.fillRect(0, 96, CW, 120);
  g.fillStyle = '#6a6a72'; g.beginPath(); g.arc(CW / 2, 136, 26, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '600 30px Arial, sans-serif'; g.fillText(st.who, CW / 2, 190);
  // bubbles, bottom up
  let y = CH - 150;
  g.font = '400 38px Arial, sans-serif';
  const wrap = (text, max) => { const words = text.split(' '); const lines = []; let ln = ''; for (const w of words) { const tt = ln ? ln + ' ' + w : w; if (g.measureText(tt).width > max && ln) { lines.push(ln); ln = w; } else ln = tt; } if (ln) lines.push(ln); return lines; };
  for (let i = st.msgs.length - 1; i >= 0; i--) {
    const m = st.msgs[i];
    const lines = wrap(m.text, 380);
    const bw = Math.max(...lines.map((l) => g.measureText(l).width)) + 48, bh = lines.length * 48 + 30;
    if (m.status) { g.font = '600 26px Arial, sans-serif'; g.textAlign = 'right'; g.fillStyle = m.status === 'Delivered' ? '#9a9aa2' : '#ff4a3a'; g.fillText(m.status, CW - 40, y); y -= 34; g.font = '400 38px Arial, sans-serif'; }
    const x = m.me ? CW - 30 - bw : 30;
    y -= bh;
    g.fillStyle = m.me ? '#0a84ff' : '#2c2c30';
    g.beginPath(); g.roundRect(x, y, bw, bh, 30); g.fill();
    if (m.me && m.status && m.status !== 'Delivered') { g.fillStyle = '#ff3b30'; g.beginPath(); g.arc(x - 26, y + bh / 2, 17, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = '900 26px Arial'; g.textAlign = 'center'; g.fillText('!', x - 26, y + bh / 2 + 1); g.font = '400 38px Arial, sans-serif'; }
    g.fillStyle = '#fff'; g.textAlign = 'left';
    lines.forEach((l, k) => g.fillText(l, x + 24, y + 40 + k * 48));
    y -= 22;
    if (y < 240) break;
  }
  // the box you type in
  g.fillStyle = '#1c1c20'; g.fillRect(0, CH - 110, CW, 110);
  g.strokeStyle = '#4a4a52'; g.lineWidth = 3; g.beginPath(); g.roundRect(30, CH - 92, CW - 60, 70, 35); g.stroke();
  g.fillStyle = st.typing ? '#fff' : '#6a6a72'; g.font = '400 34px Arial, sans-serif'; g.textAlign = 'left';
  g.fillText(st.typing || 'Text Message', 60, CH - 56);
}

// what the screen shows at video time v (null: the phone is down)
export function phoneAt(v) {
  if (v >= 5.2 && v < 12.0) return { key: 'eve', time: '8:41', signal: 'full', who: 'Jay', typing: v > 9.2 ? 'almost th'.slice(0, Math.floor((v - 9.2) * 5) + 1) : '', msgs: [{ text: 'u coming tonight?' }, { me: true, text: 'yeah! leaving now' }, { text: 'where are you? it starts at 9' }] };
  // (the doorway, 0:21-0:26: no signal, your text to Mom fails)
  if (v >= 20.6 && v < 26.4) return { key: 'door' + (v > 23.6 ? 2 : v > 22.4 ? 1 : 0) + Math.floor((v - 20.6) * 11), time: '8:41', signal: 'none', who: 'Mom', typing: v < 22.4 ? 'mom did you see that'.slice(0, Math.floor((v - 20.6) * 11) + 1) : '', msgs: [{ text: 'text me when you get there' }, ...(v > 22.4 ? [{ me: true, text: 'mom did you see that', status: v > 23.6 ? 'Not Delivered' : 'Sending...' }] : [])] };
  // (the garage, 3:52-4:03: one bar, your text goes, the family's replies arrive one by one)
  if (v >= 232.6 && v < 243.4) {
    const msgs = [{ me: true, text: 'im ok. are you ok??', status: 'Not Delivered' }, { me: true, text: 'mom im alive. in a garage', status: v > 234.4 ? 'Delivered' : 'Sending...' }];
    if (v > 236.3) msgs.push({ text: 'Mom: OH THANK GOD. we\'re ok. stay there' });
    if (v > 238.8) msgs.push({ text: 'Dad: don\'t go outside. we\'ll come for you' });
    return { key: 'gar' + (v > 234.4 ? 1 : 0) + (v > 236.3 ? 1 : 0) + (v > 238.8 ? 1 : 0), time: '9:42', signal: v > 233.3 ? 'one' : 'sos', who: 'Family', msgs };
  }
  return null;
}

export function makeMyPhone(camera, ctx) {
  const rig = new THREE.Group();
  camera.add(rig);
  const PW = 0.074, PH = 0.152;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(PW + 0.006, PH + 0.006, 0.009), ctx.plainMat(0x08080a, 0.4));
  rig.add(slab);
  const cv = document.createElement('canvas');
  cv.width = CW; cv.height = CH;
  const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const scrMat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.15, 1.15, 1.15), toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), scrMat);
  screen.position.z = 0.0051;
  rig.add(screen);
  const skin = ctx.plainMat(0x3a2a22, 0.75);
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.09, 0.028), skin);
  palm.position.set(0.012, -0.062, -0.02); rig.add(palm);
  for (let k = 0; k < 4; k++) {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.0082, 0.034, 3, 6), skin);
    f.rotation.z = Math.PI / 2; f.position.set(-PW / 2 - 0.004, 0.01 - k * 0.0205, -0.002); rig.add(f);
  }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.048, 3, 6), skin);
  thumb.position.set(PW / 2 + 0.006, -0.044, 0.002); thumb.rotation.z = 0.28; rig.add(thumb);
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.036, 0.34, 8), skin);
  wrist.position.set(0.05, -0.26, -0.04); wrist.rotation.z = 0.32; rig.add(wrist);
  rig.traverse((o) => { o.frustumCulled = false; o.renderOrder = 20; });
  let key = '';
  return {
    frame(v, light = 1, close = false) {
      const st = phoneAt(v);
      // (it comes up into the frame and goes down again)
      let up = 0;
      for (const [a, b] of [[5.2, 12.0], [20.6, 26.4], [232.6, 243.4]]) up = Math.max(up, smooth(a, a + 0.4, v) * (1 - smooth(b - 0.4, b, v)));
      rig.visible = up > 0.002 && !!st;
      if (!rig.visible) return;
      if (st.key !== key) { key = st.key; paint(g, st); tex.needsUpdate = true; }
      // (close: held up in front of you, filling the middle of the frame)
      if (close) { rig.position.set(0.01, -0.13 + 0.11 * up, -0.27); rig.rotation.set(0.05, -0.06, -0.03); }
      else { rig.position.set(0.15, -0.36 + 0.2 * up, -0.5); rig.rotation.set(0.12, -0.18, -0.05); }
      scrMat.color.setScalar(1.15 * light);
    },
  };
}

// The avenue's giant screens: ads on a normal night, then the emergency alert, the news (headlines, a scrolling
// ticker, and a LIVE picture from space: the space scene rendered into a texture by main.js), the evacuation orders,
// TAKE SHELTER UNDERGROUND, and dark once the grid fails. Each screen is a canvas texture redrawn when its content
// changes. The main screen sits at the end of the avenue, facing you, on the low building across the cross street.
import * as THREE from 'three';
import { smooth } from './util.js';

// [x, y (bottom), z, width, height, facing yaw, canvas w, canvas h]
const DEFS = [
  { id: 'main', x: 0, y: 7.5, z: -86.5, w: 40, h: 24, yaw: 0, cw: 1280, ch: 768 },
  { id: 'w1', x: -16.9, y: 9, z: -22, w: 11, h: 17, yaw: Math.PI / 2, cw: 420, ch: 650 },
  { id: 'w2', x: -16.9, y: 14, z: -52, w: 14, h: 9, yaw: Math.PI / 2, cw: 640, ch: 412 },
  { id: 'e1', x: 16.9, y: 11, z: -40, w: 11, h: 17, yaw: -Math.PI / 2, cw: 420, ch: 650 },
  { id: 'e2', x: 16.9, y: 7, z: -64, w: 15, h: 8, yaw: -Math.PI / 2, cw: 640, ch: 342 },
  { id: 'tick', x: 0, y: 4.4, z: -86.4, w: 40, h: 2.4, yaw: 0, cw: 2048, ch: 124 },
];

// when the main screen shows the LIVE picture from space: [from, to, planet]
export const FEEDS = [[21.0, 24.0, 'neptune'], [37.0, 47.0, 'neptune'], [59.6, 62.0, 'saturn'], [78.0, 80.5, 'saturn']];
// (u: how far into that planet's cutaway the picture is, 0..1; space.js)
export function feedAt(v) {
  for (const [a, b, what] of FEEDS) if (v >= a && v < b) {
    const live = a === 21.0 || a === 59.6;
    return { what, u: live ? 0.04 + (v - a) * 0.025 : 0.62 + (v - a) * 0.028 };
  }
  return null;
}

const ADS = [
  { bg: ['#ff3d7f', '#7a1cff'], big: 'NEW SEASON', small: 'IN STORES NOW' },
  { bg: ['#ffb000', '#ff4d00'], big: 'FRESH.', small: 'EVERY DAY' },
  { bg: ['#00c6ff', '#0050ff'], big: 'GO FURTHER', small: '5G EVERYWHERE' },
  { bg: ['#11d97a', '#0a6b8a'], big: 'TONIGHT', small: 'LIVE MUSIC · 9 PM' },
  { bg: ['#ff5e3a', '#ff2a68'], big: 'OUT FRIDAY', small: 'ONLY IN THEATERS' },
];

// what each screen shows at video time v (the flash-forward screens are dark)
function content(id, v, t) {
  if (t >= 268) return { kind: 'dead' };
  if (id === 'tick') {
    if (t < 9.2) return { kind: 'tick', text: 'TONIGHT: CLEAR SKIES · 64°F · SUBWAY SERVICE NORMAL · ', bg: '#101820', fg: '#e8eef5' };
    if (t < 50) return { kind: 'tick', text: 'BREAKING · BLACK HOLE ENTERS THE SOLAR SYSTEM · NEPTUNE DESTROYED · NASA: ITS PATH PASSES BETWEEN EARTH AND THE MOON · ', bg: '#a8000c', fg: '#ffffff' };
    if (t < 150) return { kind: 'tick', text: 'EVACUATE COASTAL CITIES · SATURN\'S RINGS SWALLOWED · ALL HIGHWAYS OUTBOUND · AIRPORTS OVERWHELMED · ', bg: '#a8000c', fg: '#ffffff' };
    return { kind: 'tick', text: t < 178 ? 'IT IS VISIBLE TONIGHT · STAY OFF THE ROADS · STAY AWAY FROM THE COAST · ' : 'TAKE SHELTER UNDERGROUND NOW · TAKE SHELTER UNDERGROUND NOW · ', bg: '#a8000c', fg: '#ffffff' };
  }
  const alert = (t >= 9.2 && t < 21) || (t >= 178 && t < 252);
  if (alert) return { kind: 'alert', title: 'EMERGENCY ALERT', text: t < 150 ? 'BLACK HOLE DETECTED' : 'TAKE SHELTER UNDERGROUND', flash: t >= 178 };
  if (t < 9.2) {
    const k = { main: 0, w1: 1, w2: 2, e1: 3, e2: 4 }[id];
    return { kind: 'ad', ...ADS[(k + Math.floor(t / 6)) % ADS.length] };
  }
  if (id === 'main') {
    const f = feedAt(v);
    if (f) return { kind: 'feed', label: f.what === 'neptune' ? (t < 30 ? 'LIVE · NEPTUNE' : 'NEPTUNE · 4 MINUTES AGO') : (t < 70 ? 'LIVE · SATURN' : 'SATURN · TONIGHT') };
    if (t < 50) return { kind: 'news', title: 'BREAKING', text: 'NEPTUNE DESTROYED' };
    if (t < 150) return { kind: 'news', title: 'EVACUATION ORDER', text: 'LEAVE COASTAL CITIES NOW' };
    return { kind: 'news', title: 'NASA', text: 'IT IS VISIBLE TONIGHT' };
  }
  const H = {
    w1: t < 50 ? ['BREAKING', 'BLACK HOLE IN THE SOLAR SYSTEM'] : t < 150 ? ['EVACUATE', 'HEAD INLAND'] : ['DO NOT', 'PANIC'],
    w2: t < 50 ? ['NASA', 'IT GIVES OFF NO LIGHT'] : t < 150 ? ['ALL FLIGHTS', 'FULLY BOOKED'] : ['STAY', 'OFF THE ROADS'],
    e1: t < 50 ? ['LIVE', 'STAY INDOORS'] : t < 150 ? ['SATURN', 'RINGS GONE'] : ['STAY AWAY', 'FROM THE COAST'],
    e2: t < 50 ? ['NEPTUNE', 'DESTROYED'] : t < 150 ? ['HIGHWAYS', 'OUTBOUND ONLY'] : ['IT IS', 'VISIBLE TONIGHT'],
  }[id];
  return { kind: 'news', title: H[0], text: H[1] };
}

function wrap(g, text, maxW) {
  const words = text.split(' '), lines = [];
  let line = '';
  for (const w of words) { const tr = line ? line + ' ' + w : w; if (g.measureText(tr).width > maxW && line) { lines.push(line); line = w; } else line = tr; }
  if (line) lines.push(line);
  return lines;
}

function draw(g, W, H, c, v) {
  g.save();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const font = (w, px) => `${w} ${px}px "Segoe UI", Arial, sans-serif`;
  if (c.kind === 'dead') { g.fillStyle = '#030303'; g.fillRect(0, 0, W, H); g.restore(); return; }
  if (c.kind === 'ad') {
    const gr = g.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, c.bg[0]); gr.addColorStop(1, c.bg[1]);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // soft shapes moving across
    for (let i = 0; i < 4; i++) {
      g.fillStyle = `rgba(255,255,255,${0.08 + 0.04 * i})`;
      g.beginPath(); g.arc(W * ((i * 0.31 + v * 0.03) % 1.2 - 0.1), H * (0.2 + 0.2 * i), H * (0.18 + 0.06 * i), 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#fff';
    let px = Math.min(W / 5.2, H / 3.4);
    g.font = font(900, px);
    const lines = wrap(g, c.big, W * 0.88);
    lines.forEach((l, i) => g.fillText(l, W / 2, H * 0.45 + (i - (lines.length - 1) / 2) * px * 1.05));
    g.font = font(600, px * 0.32);
    g.fillText(c.small, W / 2, H * 0.45 + (lines.length / 2) * px * 1.05 + px * 0.35);
  } else if (c.kind === 'alert') {
    const on = !c.flash || Math.floor(v * 2.5) % 2 === 0;
    g.fillStyle = on ? '#c3000f' : '#1a0003'; g.fillRect(0, 0, W, H);
    g.fillStyle = on ? '#fff' : '#ff3340';
    const px = Math.min(W / 9.5, H / 7);
    g.font = font(800, px * 0.6);
    g.fillText('⚠ ' + c.title, W / 2, H * 0.24);
    g.fillRect(W * 0.08, H * 0.36, W * 0.84, Math.max(3, H * 0.008));
    g.font = font(900, px * 1.05);
    const lines = wrap(g, c.text, W * 0.86);
    lines.forEach((l, i) => g.fillText(l, W / 2, H * 0.6 + (i - (lines.length - 1) / 2) * px * 1.15));
  } else if (c.kind === 'news' || c.kind === 'feed') {
    if (c.kind === 'news') {
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, '#0b1730'); gr.addColorStop(1, '#050a16');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      // a slow sweep of light across the panel
      const sx = ((v * 0.25) % 1.6 - 0.3) * W;
      const sw = g.createLinearGradient(sx - W * 0.2, 0, sx + W * 0.2, 0);
      sw.addColorStop(0, 'rgba(80,140,255,0)'); sw.addColorStop(0.5, 'rgba(80,140,255,0.16)'); sw.addColorStop(1, 'rgba(80,140,255,0)');
      g.fillStyle = sw; g.fillRect(0, 0, W, H);
      const px = Math.min(W / 8.5, H / 6);
      g.fillStyle = '#d6001c'; g.fillRect(W * 0.08, H * 0.16, W * 0.84, px * 0.95);
      g.fillStyle = '#fff'; g.font = font(800, px * 0.62);
      g.fillText(c.title, W / 2, H * 0.16 + px * 0.5);
      g.font = font(900, px * 0.92);
      const lines = wrap(g, c.text, W * 0.86);
      lines.forEach((l, i) => g.fillText(l, W / 2, H * 0.62 + (i - (lines.length - 1) / 2) * px * 1.08));
    } else {
      // the LIVE picture is a separate mesh over the top 80%; here only the lower third
      g.clearRect(0, 0, W, H);
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H * 0.8);
      g.fillStyle = '#0b1730'; g.fillRect(0, H * 0.8, W, H * 0.2);
      g.fillStyle = '#d6001c'; g.fillRect(0, H * 0.8, W * 0.36, H * 0.2);
      g.fillStyle = '#fff'; g.font = font(800, H * 0.085);
      g.fillText(c.label.startsWith('LIVE') ? '● LIVE' : 'REPLAY', W * 0.18, H * 0.9);
      g.textAlign = 'left'; g.font = font(700, H * 0.075);
      g.fillText(c.label.replace('LIVE · ', ''), W * 0.39, H * 0.9);
    }
  } else if (c.kind === 'tick') {
    g.fillStyle = c.bg; g.fillRect(0, 0, W, H);
    g.fillStyle = c.fg; g.font = font(800, H * 0.62); g.textAlign = 'left';
    const tw = g.measureText(c.text).width;
    const off = (v * 260) % tw;
    for (let x = -off; x < W; x += tw) g.fillText(c.text, x, H * 0.54);
  }
  g.restore();
}

// rough average colour of what a screen shows (to light the street)
function tint(c) {
  if (c.kind === 'dead') return [0, 0, 0, 0];
  if (c.kind === 'alert') return [1, 0.08, 0.06, 1];
  if (c.kind === 'ad') { const h = parseInt(c.bg[0].slice(1), 16); return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255, 0.8]; }
  if (c.kind === 'feed') return [0.6, 0.65, 0.9, 0.35];
  return [0.25, 0.4, 0.95, 0.5];
}

export function makeScreens(scene, patch) {
  const list = DEFS.map((d) => {
    const canvas = document.createElement('canvas');
    canvas.width = d.cw; canvas.height = d.ch;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = patch(new THREE.MeshBasicMaterial({ map: tex, toneMapped: true }));
    mat.color.setScalar(1.5);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h, 8, 8), mat);
    mesh.position.set(d.x, d.y + d.h / 2, d.z);
    mesh.rotation.y = d.yaw;
    mesh.frustumCulled = false;
    scene.add(mesh);
    // a dark frame round it
    const frame = new THREE.Mesh(new THREE.BoxGeometry(d.w + 0.8, d.h + 0.8, 0.4), patch(new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.7 })));
    frame.position.copy(mesh.position); frame.rotation.y = d.yaw;
    frame.translateZ(-0.25);
    scene.add(frame);
    return { d, canvas, g: canvas.getContext('2d'), tex, mat, mesh, key: '' };
  });
  // the main screen's building (low, so the sky above it stays open) and the LIVE picture
  {
    const bm = patch(new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.85 }));
    const b = new THREE.Mesh(new THREE.BoxGeometry(70, 33, 30).translate(0, 16.5, 0), bm);
    b.position.set(0, 0, -86.5 - 15.3); scene.add(b);
  }
  const main = list[0];
  const feedMat = patch(new THREE.MeshBasicMaterial({ toneMapped: true }));
  feedMat.color.setScalar(1.35);
  const feed = new THREE.Mesh(new THREE.PlaneGeometry(main.d.w, main.d.h * 0.8, 8, 8), feedMat);
  feed.position.set(main.d.x, main.d.y + main.d.h * 0.6, main.d.z + 0.03);
  feed.frustumCulled = false;
  feed.visible = false;
  scene.add(feed);

  const lights = [0, 1, 3].map((i) => ({ pos: new THREE.Vector3(), color: new THREE.Color(), power: 0, i }));
  return {
    feed,
    setFeed(texture) { feedMat.map = texture; feedMat.needsUpdate = true; },
    frame(v, s) {
      const t = s.t;
      for (const sc of list) {
        const c = content(sc.d.id, v, t);
        // redraw only when what's shown changes (moving parts: every frame)
        const moving = c.kind === 'tick' || c.kind === 'ad' || c.kind === 'news' || (c.kind === 'alert' && c.flash);
        const key = JSON.stringify(c) + (moving ? v.toFixed(3) : '');
        if (key !== sc.key) { sc.key = key; draw(sc.g, sc.d.cw, sc.d.ch, c, v); sc.tex.needsUpdate = true; }
        sc.c = c;
        // a glitch as the power dies
        sc.mesh.visible = !(t >= 265 && t < 268 && Math.sin(t * 61 + sc.d.x) > 0.2);
      }
      feed.visible = !!feedAt(v) && !!feedMat.map;
      lights.forEach((l) => {
        const sc = list[l.i], tt = tint(sc.c);
        l.pos.copy(sc.mesh.position);
        l.pos.add(new THREE.Vector3(0, 0, 6).applyAxisAngle(new THREE.Vector3(0, 1, 0), sc.d.yaw));
        l.color.setRGB(tt[0], tt[1], tt[2]);
        l.power = tt[3] * (sc.d.id === 'main' ? 1.6 : 0.6);
      });
      return { lights };
    },
  };
}

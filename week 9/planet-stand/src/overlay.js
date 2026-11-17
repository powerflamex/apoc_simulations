// The overlay: the opening title, the picker (a bar of eight small worlds in the order you visit them, a glassy cursor
// stepping right at every wipe, the track lit as far as the cursor; Earth, the last slot, is the finish line), the
// counter (YOU'D LAST) with the place's name on the one line under it, the caption, and the white flash.
import { PLACES, lineAt, counterAt, captionAt } from './timeline.js';
import { smooth } from './util.js';

const PW = 1080, PH = 196;
const SLOT_X = (i) => 92 + i * 128;
const ICON_R = [22, 19, 17, 20, 30, 25, 15, 22];
const CY = 80;

function icon(ctx, key, x, y, r) {
  const ball = (stops) => {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  };
  const clip = () => { ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip(); };
  const blobs = (list, col) => { ctx.fillStyle = col; for (const [dx, dy, rx, ry, a] of list) { ctx.beginPath(); ctx.ellipse(x + dx * r, y + dy * r, rx * r, ry * r, a || 0, 0, 7); ctx.fill(); } };
  if (key === 'venus') ball([[0, '#fff3cf'], [1, '#d8a85a']]);
  else if (key === 'mars') { ball([[0, '#f08a4e'], [1, '#a23f1c']]); clip(); blobs([[0.1, 0.15, 0.55, 0.22, -0.3]], 'rgba(80,30,18,0.5)'); blobs([[0, -0.95, 0.5, 0.2]], '#f6f1ea'); ctx.restore(); }
  else if (key === 'mercury') { ball([[0, '#d8d4cf'], [1, '#7c7874']]); clip(); blobs([[-0.3, -0.2, 0.18, 0.18], [0.3, 0.25, 0.14, 0.14], [0.1, -0.45, 0.1, 0.1], [-0.2, 0.45, 0.12, 0.12]], 'rgba(70,66,62,0.45)'); ctx.restore(); }
  else if (key === 'titan') { ball([[0, '#ffc46a'], [1, '#b8661e']]); const g = ctx.createRadialGradient(x, y, r * 0.9, x, y, r * 1.35); g.addColorStop(0, 'rgba(255,190,100,0.5)'); g.addColorStop(1, 'rgba(255,190,100,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.35, 0, 7); ctx.fill(); }
  else if (key === 'jupiter') {
    ball([[0, '#f5e3c2'], [1, '#c9a073']]); clip();
    ctx.translate(x, y); ctx.rotate(-0.2); ctx.translate(-x, -y);
    for (const [dy, hh, c] of [[-0.42, 0.2, 'rgba(150,72,40,0.85)'], [0.12, 0.22, 'rgba(160,80,44,0.85)'], [-0.78, 0.12, 'rgba(140,95,70,0.7)'], [0.6, 0.14, 'rgba(140,95,70,0.7)']]) { ctx.fillStyle = c; ctx.fillRect(x - r * 1.2, y + dy * r, r * 2.4, hh * r); }
    blobs([[0.32, 0.38, 0.24, 0.15]], '#c8452a'); ctx.restore();
  } else if (key === 'neptune') { ball([[0, '#5d8cff'], [1, '#1a3fb8']]); clip(); blobs([[-0.1, 0.3, 0.4, 0.06, -0.1], [0.2, -0.35, 0.3, 0.05, -0.1]], 'rgba(220,235,255,0.6)'); ctx.restore(); }
  else if (key === 'pluto') { ball([[0, '#e8c8a8'], [1, '#8a5a3a']]); clip(); ctx.fillStyle = '#fbf3ea'; ctx.beginPath(); const hx = x + 0.15 * r, hy = y + 0.1 * r, s = r * 0.5; ctx.moveTo(hx, hy + s); ctx.bezierCurveTo(hx - 1.2 * s, hy, hx - 0.8 * s, hy - 0.9 * s, hx, hy - 0.35 * s); ctx.bezierCurveTo(hx + 0.8 * s, hy - 0.9 * s, hx + 1.2 * s, hy, hx, hy + s); ctx.fill(); ctx.restore(); }
  else { ball([[0, '#5aa8ff'], [1, '#1d4fa8']]); clip(); blobs([[-0.25, -0.1, 0.35, 0.45, 0.4], [0.4, 0.35, 0.25, 0.3, -0.3]], '#3f9a4a'); blobs([[0, -0.55, 0.6, 0.09, 0.2], [-0.1, 0.25, 0.5, 0.07, -0.2]], 'rgba(255,255,255,0.75)'); ctx.restore(); }
  // shade toward the limb
  clip();
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.3, x, y, r * 1.02);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  ctx.restore();
}

export function makeOverlay() {
  const title = document.getElementById('title');
  const flash = document.getElementById('flash');
  const cover = document.getElementById('cover');
  const line = document.getElementById('line');
  const caption = document.getElementById('caption');
  const counter = document.getElementById('counter');
  const value = counter.querySelector('.value');
  const picker = document.getElementById('picker');
  const cv = document.createElement('canvas');
  cv.width = PW; cv.height = PH;
  cv.style.cssText = `position:absolute;left:0;top:0;width:${PW}px;height:${PH}px;`;
  picker.appendChild(cv);
  const ctx = cv.getContext('2d');

  function drawPicker(s) {
    ctx.clearRect(0, 0, PW, PH);
    const cur = s.cursor;
    const cx = SLOT_X(cur);
    const ty = 168;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,246,230,0.3)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(SLOT_X(0), ty); ctx.lineTo(SLOT_X(7), ty); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,217,138,0.95)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(SLOT_X(0), ty); ctx.lineTo(cx, ty); ctx.stroke();
    PLACES.forEach((p, i) => {
      const on = i <= cur + 0.02;
      ctx.fillStyle = on ? 'rgba(255,217,138,1)' : 'rgba(255,246,230,0.5)';
      ctx.beginPath(); ctx.arc(SLOT_X(i), ty, on ? 6 : 4.5, 0, 7); ctx.fill();
    });
    // the finish flag over Earth's dot: a small ring
    ctx.strokeStyle = 'rgba(255,246,230,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(SLOT_X(7), ty, 11, 0, 7); ctx.stroke();
    // the cursor tile
    const k = 1 + 0.08 * s.snap;
    const bw = 112 * k, bh = 128 * k, bx = cx - bw / 2, by = CY + 4 - bh / 2;
    ctx.fillStyle = 'rgba(10, 12, 18, 0.5)';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 22); ctx.fill();
    ctx.strokeStyle = `rgba(255, 236, 196, ${(0.7 + 0.3 * s.snap).toFixed(3)})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 22); ctx.stroke();
    PLACES.forEach((p, i) => {
      const mid = 1 - smooth(0.0, 0.6, Math.abs(i - cur));
      const x = SLOT_X(i), r = ICON_R[i] * (0.95 + 0.3 * mid) * (1 + 0.06 * s.snap * mid);
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.45 * mid;
      if (mid > 0.01) {
        const g = ctx.createRadialGradient(x, CY, r * 0.6, x, CY, r * 2.0);
        g.addColorStop(0, `rgba(255,236,196,${(0.35 * mid).toFixed(3)})`); g.addColorStop(1, 'rgba(255,236,196,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, CY, r * 2.0, 0, 7); ctx.fill();
      }
      icon(ctx, p.key, x, CY, r);
      ctx.restore();
    });
  }

  let lastValue = '';
  return function update(v, s) {
    if (window.__cover) {
      cover.style.opacity = '1';
      for (const el of [title, flash, picker, line, counter, caption]) el.style.opacity = '0';
      return;
    }
    const hide = s.flash || 0;
    drawPicker(s);
    picker.style.opacity = (1 - hide).toFixed(3);
    counter.style.opacity = (1 - hide).toFixed(3);
    const val = counterAt(v);
    if (val !== lastValue) { value.textContent = val; lastValue = val; }
    const ln = lineAt(v);
    if (line.textContent !== ln.text) line.textContent = ln.text;
    line.style.opacity = (ln.alpha * (1 - hide)).toFixed(3);
    line.style.transform = `translateY(${ln.rise.toFixed(2)}px)`;
    const cap = s.title > 0.001 ? null : captionAt(v);
    if (cap) {
      if (caption.textContent !== cap.text) caption.textContent = cap.text;
      caption.style.opacity = (cap.alpha * (1 - hide)).toFixed(3);
    } else caption.style.opacity = '0';
    title.style.opacity = (s.title || 0).toFixed(3);
    title.style.transform = `translateY(${((1 - (s.title || 0)) * -10).toFixed(2)}px)`;
    title.style.filter = (s.title || 0) < 1 ? `blur(${((1 - (s.title || 0)) * 8).toFixed(2)}px)` : 'none';
    flash.style.opacity = Math.pow(hide, 1.3).toFixed(3);
  };
}

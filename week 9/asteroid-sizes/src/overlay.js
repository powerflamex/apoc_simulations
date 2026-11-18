// The overlay: the opening title, the size picker, the counter with its one line, and the white.
// The picker is a bar with six slots drawn on its own canvas: in each, the asteroid drawn next to the thing it is as big
// as (a house, a jumbo jet, a skyscraper, Mount Everest, Texas, the Moon), with the thing's name under it. A glassy
// cursor sits on the asteroid in the sky and slides to the next slot at every wipe; the track under the names lights up
// as far as the cursor (the Moon, the last slot, is the finish line).
import { STOPS, lineAt, sizeAt } from './timeline.js';
import { smooth } from './util.js';

const PW = 1080, PH = 196;
const SLOT_X = (i) => 118 + i * 168.8;
const CY = 70;
const INK = 'rgba(246,240,228,0.96)';

// Texas, from its real outline (lon, lat), for the fifth slot
const TEXAS = [[-103.0, 36.5], [-100.0, 36.5], [-100.0, 34.56], [-99.2, 34.4], [-97.0, 33.85], [-95.5, 33.9], [-94.04, 33.6], [-94.04, 31.0],
  [-93.6, 30.0], [-93.84, 29.7], [-94.7, 29.3], [-95.9, 28.6], [-96.8, 28.1], [-97.3, 27.6], [-97.4, 26.9], [-97.15, 25.95], [-97.5, 25.9],
  [-98.3, 26.2], [-99.1, 26.5], [-99.5, 27.5], [-100.3, 28.3], [-101.0, 29.4], [-102.4, 29.8], [-103.1, 29.0], [-104.0, 29.4], [-104.6, 30.0],
  [-105.0, 30.7], [-106.0, 31.4], [-106.6, 31.9], [-106.6, 32.0], [-103.06, 32.0]];

// a lumpy cratered rock, radius r, centred at (x, y)
function rock(ctx, x, y, r, seed) {
  const n = 22;
  ctx.save();
  ctx.beginPath();
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 2;
    const rr = r * (1 + 0.09 * Math.sin(a * 3 + seed) + 0.05 * Math.sin(a * 7 + seed * 2.3));
    const px = x + Math.cos(a) * rr * 1.08, py = y + Math.sin(a) * rr * 0.94;
    if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.1, x, y, r * 1.1);
  g.addColorStop(0, '#b3a597'); g.addColorStop(0.55, '#7b6c60'); g.addColorStop(1, '#3d342e');
  ctx.fillStyle = g; ctx.fill();
  ctx.clip();
  ctx.fillStyle = 'rgba(40,32,28,0.45)';
  for (const [dx, dy, cr] of [[-0.3, 0.1, 0.22], [0.25, -0.3, 0.16], [0.3, 0.35, 0.2], [-0.15, -0.45, 0.1]]) {
    ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, cr * r, 0, 7); ctx.fill();
  }
  ctx.restore();
}

// the thing each asteroid is as big as; (x, y) is its foot's middle, s its height (px)
function thing(ctx, i, x, y, s) {
  ctx.save();
  ctx.fillStyle = INK;
  if (i === 0) {                 // a house
    const w = s * 1.15, wall = s * 0.55;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y); ctx.lineTo(x - w / 2, y - wall); ctx.lineTo(x - w * 0.6, y - wall);
    ctx.lineTo(x, y - s); ctx.lineTo(x + w * 0.6, y - wall); ctx.lineTo(x + w / 2, y - wall); ctx.lineTo(x + w / 2, y); ctx.closePath();
    ctx.fill();
    ctx.fillRect(x + w * 0.2, y - s * 0.95, w * 0.12, s * 0.3);         // chimney
    ctx.fillStyle = 'rgba(30,30,36,0.75)';
    ctx.fillRect(x - w * 0.1, y - wall * 0.62, w * 0.2, wall * 0.62);   // door
    ctx.fillRect(x - w * 0.38, y - wall * 0.8, w * 0.16, wall * 0.3);
    ctx.fillRect(x + w * 0.22, y - wall * 0.8, w * 0.16, wall * 0.3);
  } else if (i === 1) {          // a jumbo jet, side on (s = its length)
    const L = s, H = L * 0.12;
    ctx.translate(x, y - L * 0.16);
    ctx.beginPath();
    ctx.moveTo(-L / 2, 0); ctx.quadraticCurveTo(-L / 2 - H * 0.2, -H * 0.9, -L * 0.36, -H);      // nose
    ctx.quadraticCurveTo(-L * 0.28, -H * 1.75, -L * 0.1, -H * 1.1);                              // the hump
    ctx.lineTo(L * 0.34, -H); ctx.lineTo(L * 0.45, -H * 2.9); ctx.lineTo(L * 0.52, -H * 2.9);    // tail fin
    ctx.lineTo(L * 0.5, -H * 0.55); ctx.lineTo(L / 2, 0); ctx.closePath();
    ctx.fill();
    ctx.beginPath();                                                                             // wing and engines
    ctx.moveTo(-L * 0.1, -H * 0.25); ctx.lineTo(L * 0.14, H * 0.9); ctx.lineTo(L * 0.22, H * 0.9); ctx.lineTo(L * 0.08, -H * 0.3); ctx.closePath();
    ctx.fill();
    ctx.beginPath(); ctx.ellipse(-L * 0.03, H * 0.45, L * 0.06, H * 0.28, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(30,30,36,0.6)';
    for (let k = 0; k < 8; k++) ctx.fillRect(-L * 0.32 + k * L * 0.07, -H * 0.72, L * 0.025, H * 0.22);
  } else if (i === 2) {          // a skyscraper (stepped, with a spire)
    const w = s * 0.24;
    ctx.fillRect(x - w / 2, y - s * 0.7, w, s * 0.7);
    ctx.fillRect(x - w * 0.36, y - s * 0.8, w * 0.72, s * 0.1);
    ctx.fillRect(x - w * 0.22, y - s * 0.88, w * 0.44, s * 0.08);
    ctx.fillRect(x - w * 0.05, y - s, w * 0.1, s * 0.12);
    ctx.fillStyle = 'rgba(30,30,36,0.5)';
    for (let r = 0; r < 9; r++) for (let c = 0; c < 3; c++) ctx.fillRect(x - w * 0.36 + c * w * 0.28, y - s * 0.66 + r * s * 0.072, w * 0.14, s * 0.035);
  } else if (i === 3) {          // Mount Everest: a peak with snow
    const w = s * 1.7;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y); ctx.lineTo(x - w * 0.14, y - s * 0.78); ctx.lineTo(x - w * 0.06, y - s * 0.7); ctx.lineTo(x + w * 0.04, y - s);
    ctx.lineTo(x + w * 0.2, y - s * 0.64); ctx.lineTo(x + w * 0.28, y - s * 0.7); ctx.lineTo(x + w / 2, y); ctx.closePath();
    ctx.fillStyle = 'rgba(150,158,172,0.95)'; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - w * 0.22, y - s * 0.66); ctx.lineTo(x - w * 0.14, y - s * 0.78); ctx.lineTo(x - w * 0.06, y - s * 0.7); ctx.lineTo(x + w * 0.04, y - s);
    ctx.lineTo(x + w * 0.16, y - s * 0.7); ctx.lineTo(x + w * 0.08, y - s * 0.6); ctx.lineTo(x - w * 0.02, y - s * 0.66); ctx.lineTo(x - w * 0.1, y - s * 0.58); ctx.closePath();
    ctx.fillStyle = INK; ctx.fill();
  } else if (i === 4) {          // Texas (s = its width)
    const kx = s / 13.15 / 1.057, ky = s / 13.15 * (10.66 / 10.66);
    const cxl = -106.65 + 13.15 / 2, cyl = 36.5 - 10.66 / 2;
    ctx.beginPath();
    TEXAS.forEach(([lo, la], k) => {
      const px = x + (lo - cxl) * kx * 1.057, py = y - s * 0.42 + (cyl - la) * ky * 0.94;
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath(); ctx.fill();
  } else {                       // the Moon
    const r = s / 2, cy = y - r;
    const g = ctx.createRadialGradient(x - r * 0.35, cy - r * 0.35, r * 0.1, x, cy, r);
    g.addColorStop(0, '#eeeeea'); g.addColorStop(1, '#9c9c9a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, cy, r, 0, 7); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(x, cy, r, 0, 7); ctx.clip();
    ctx.fillStyle = 'rgba(70,72,80,0.55)';
    for (const [dx, dy, rr] of [[-0.3, -0.25, 0.3], [0.2, -0.35, 0.22], [0.1, 0.2, 0.26], [-0.4, 0.3, 0.16]]) { ctx.beginPath(); ctx.arc(x + dx * r, cy + dy * r, rr * r, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  ctx.restore();
}

// slot i: the thing and the asteroid side by side, the asteroid as big as the thing ([thing size, rock radius, gap])
const PAIRS = [[34, 17], [62, 26], [72, 30], [50, 23], [66, 26], [48, 24]];
function slot(ctx, i, x, k) {
  const [s, r] = PAIRS[i].map((q) => q * k);
  const foot = CY + 22 * k;
  const thingW = i === 1 ? s : i === 3 ? s * 1.7 : i === 4 ? s : i === 5 ? s : i === 0 ? s * 1.15 : s * 0.3;
  const gap = 8 * k, total = thingW + gap + 2 * r * 1.08;
  const x0 = x - total / 2;
  thing(ctx, i, x0 + thingW / 2, foot, s);
  rock(ctx, x0 + thingW + gap + r * 1.08, foot - r * 0.97, r, i * 1.7 + 0.4);
}

export function makeOverlay() {
  const title = document.getElementById('title');
  const flash = document.getElementById('flash');
  const cover = document.getElementById('cover');
  const line = document.getElementById('line');
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
    const cx = SLOT_X(0) + (SLOT_X(1) - SLOT_X(0)) * cur;
    // the track under the names: dim all the way, lit as far as the cursor
    const ty = 170;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,246,230,0.28)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(SLOT_X(0), ty); ctx.lineTo(SLOT_X(5), ty); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,217,138,0.95)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(SLOT_X(0), ty); ctx.lineTo(cx, ty); ctx.stroke();
    STOPS.forEach((p, i) => {
      ctx.fillStyle = i <= cur + 0.02 ? 'rgba(255,217,138,1)' : 'rgba(255,246,230,0.45)';
      ctx.beginPath(); ctx.arc(SLOT_X(i), ty, i <= cur + 0.02 ? 6 : 4.5, 0, 7); ctx.fill();
    });
    // the cursor: a dark glassy tile with a bright edge (it swells a little as it snaps on)
    const k = 1 + 0.07 * s.snap;
    const bw = 160 * k, bh = 150 * k, bx = cx - bw / 2, by = CY + 10 - bh / 2;
    ctx.fillStyle = 'rgba(10, 12, 18, 0.5)';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 24); ctx.fill();
    ctx.strokeStyle = `rgba(255, 236, 196, ${(0.7 + 0.3 * s.snap).toFixed(3)})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 24); ctx.stroke();
    STOPS.forEach((p, i) => {
      const mid = 1 - smooth(0.0, 0.6, Math.abs(i - cur));         // 1 on the cursor's slot
      const x = SLOT_X(i);
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.5 * mid;
      ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 1;
      slot(ctx, i, x, (0.9 + 0.12 * mid) * (1 + 0.05 * s.snap * mid));
      ctx.shadowBlur = 0;
      const long = p.name.length > 8;
      ctx.font = `700 ${((long ? 19 : 22) + 3 * mid).toFixed(1)}px Cormorant`;
      ctx.letterSpacing = long ? '1.2px' : '2.4px';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2;
      const sh = Math.round(170 + 85 * mid);
      ctx.fillStyle = mid > 0.5 ? '#ffe2a0' : `rgb(${sh + 4},${sh},${Math.round(sh * 0.94)})`;
      ctx.fillText(p.name, x + 1.2, 136);
      ctx.restore();
    });
  }

  let lastValue = '';
  return function update(v, s) {
    if (window.__cover) {   // cover art: just the frame and the big title
      cover.style.opacity = '1';
      for (const el of [title, flash, picker, line, counter]) el.style.opacity = '0';
      return;
    }
    const hide = s.hide || 0;
    drawPicker(s);
    picker.style.opacity = (1 - hide).toFixed(3);
    counter.style.opacity = (1 - hide).toFixed(3);
    const val = sizeAt(v);
    if (val !== lastValue) { value.textContent = val; lastValue = val; }
    const ln = lineAt(v);
    if (ln) {
      if (line.textContent !== ln.text) line.textContent = ln.text;
      line.style.opacity = (ln.alpha * (1 - hide)).toFixed(3);
      line.style.transform = `translateY(${ln.rise.toFixed(2)}px)`;
    } else line.style.opacity = '0';
    title.style.opacity = (s.title || 0).toFixed(3);
    title.style.transform = `translateY(${((1 - (s.title || 0)) * -10).toFixed(2)}px)`;
    title.style.filter = (s.title || 0) < 1 ? `blur(${((1 - (s.title || 0)) * 8).toFixed(2)}px)` : 'none';
    flash.style.background = '#fff';
    flash.style.opacity = '0';
  };
}

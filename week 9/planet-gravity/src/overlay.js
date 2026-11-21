// The overlay: the opening title, the world picker, the counter (your weight) with its one line,
// a caption now and then, and the white flash. The picker is a bar with six slots drawn on its own canvas: a small
// picture of each world with its name under it, in story order; a glassy cursor sits on the world whose gravity you
// have and slides to the next at each wipe; the track under the names lights up as far as the cursor, and the last
// slot (the neutron star) carries a finish ring.
import { STOPS, lineAt, counterText, captionAt } from './timeline.js';
const PLANETS = STOPS;
import { clamp, smooth } from './util.js';

const PW = 1080, PH = 196;
const SLOT_X = (i) => 118 + i * 168.8;
const ICON_R = (i) => [24, 17, 30, 31, 12, 9][i];
const CY = 74;

// a small picture of world i at (x, y), radius r
function icon(ctx, i, x, y, r) {
  const key = STOPS[i].key;
  const ball = (stops) => {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  };
  const clipDisc = () => { ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip(); };
  const shade = () => {      // darker toward the limb
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.3, x, y, r * 1.02);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  };
  const glow = (c, k) => {   // a soft halo (the stars)
    const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * k);
    g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * k, 0, Math.PI * 2); ctx.fill();
  };
  if (key === 'moon') {      // grey, darker seas
    ball([[0, '#eeeeea'], [1, '#9c9c9a']]);
    clipDisc();
    ctx.fillStyle = 'rgba(70,72,80,0.55)';
    for (const [dx, dy, rr] of [[-0.3, -0.25, 0.3], [0.2, -0.35, 0.22], [0.1, 0.2, 0.26], [-0.4, 0.3, 0.16]]) { ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, rr * r, 0, 7); ctx.fill(); }
    ctx.restore();
  } else if (key === 'pluto') {   // tan, with the pale heart
    ball([[0, '#e7c9a3'], [1, '#8f6a4a']]);
    clipDisc();
    ctx.fillStyle = 'rgba(250,240,225,0.9)';
    const hx = x + 0.12 * r, hy = y + 0.1 * r, hs = 0.42 * r;
    ctx.beginPath(); ctx.moveTo(hx, hy + hs * 0.9);
    ctx.bezierCurveTo(hx - hs * 1.3, hy, hx - hs * 0.8, hy - hs * 1.0, hx, hy - hs * 0.35);
    ctx.bezierCurveTo(hx + hs * 0.8, hy - hs * 1.0, hx + hs * 1.3, hy, hx, hy + hs * 0.9); ctx.fill();
    ctx.restore();
  } else if (key === 'sun') {     // yellow-white, glowing
    glow('rgba(255,190,80,0.55)', 1.7);
    ball([[0, '#fffbe6'], [0.55, '#ffd34d'], [1, '#f08a1c']]);
    clipDisc(); ctx.restore();
    return;
  } else if (key === 'wd') {      // small, white-blue, glowing
    glow('rgba(190,215,255,0.7)', 2.4);
    ball([[0, '#ffffff'], [1, '#bcd2ff']]);
    return;
  } else if (key === 'ns') {      // tiny, blue-white, its two beams
    ctx.save();
    ctx.translate(x, y); ctx.rotate(-0.5);
    const bg = ctx.createLinearGradient(0, -r * 5.5, 0, r * 5.5);
    bg.addColorStop(0, 'rgba(160,200,255,0)'); bg.addColorStop(0.42, 'rgba(190,220,255,0.75)'); bg.addColorStop(0.58, 'rgba(190,220,255,0.75)'); bg.addColorStop(1, 'rgba(160,200,255,0)');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.moveTo(-r * 0.25, 0); ctx.lineTo(-r * 0.9, -r * 5.5); ctx.lineTo(r * 0.9, -r * 5.5); ctx.lineTo(r * 0.25, 0);
    ctx.lineTo(r * 0.9, r * 5.5); ctx.lineTo(-r * 0.9, r * 5.5); ctx.closePath(); ctx.fill();
    ctx.restore();
    glow('rgba(170,205,255,0.8)', 2.6);
    ball([[0, '#ffffff'], [1, '#9fc2ff']]);
    return;
  } else {                   // Jupiter: stripes and the red spot
    ball([[0, '#f5e3c2'], [1, '#c9a073']]);
    clipDisc();
    ctx.translate(x, y); ctx.rotate(-0.22); ctx.translate(-x, -y);
    for (const [dy, hh, c] of [[-0.42, 0.2, 'rgba(150,72,40,0.85)'], [0.12, 0.22, 'rgba(160,80,44,0.85)'], [-0.78, 0.12, 'rgba(140,95,70,0.7)'], [0.6, 0.14, 'rgba(140,95,70,0.7)']]) {
      ctx.fillStyle = c; ctx.fillRect(x - r * 1.2, y + dy * r, r * 2.4, hh * r);
    }
    ctx.fillStyle = '#c8452a';
    ctx.beginPath(); ctx.ellipse(x + 0.32 * r, y + 0.38 * r, 0.24 * r, 0.15 * r, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  clipDisc(); shade(); ctx.restore();
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
    // the track under the names: dim all the way, lit as far as the cursor
    const ty = 170;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,246,230,0.28)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(SLOT_X(0), ty); ctx.lineTo(SLOT_X(5), ty); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,217,138,0.95)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(SLOT_X(0), ty); ctx.lineTo(cx, ty); ctx.stroke();
    PLANETS.forEach((p, i) => {
      ctx.fillStyle = i <= cur + 0.02 ? 'rgba(255,217,138,1)' : 'rgba(255,246,230,0.45)';
      ctx.beginPath(); ctx.arc(SLOT_X(i), ty, i <= cur + 0.02 ? 6 : 4.5, 0, 7); ctx.fill();
    });
    // the finish: a ring round the last slot's dot
    ctx.strokeStyle = cur > 4.98 ? 'rgba(255,217,138,1)' : 'rgba(255,246,230,0.7)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(SLOT_X(5), ty, 11, 0, 7); ctx.stroke();
    // the cursor: a dark glassy tile with a bright edge (it swells a little as it snaps on)
    const k = 1 + 0.07 * s.snap;
    const bw = 158 * k, bh = 150 * k, bx = cx - bw / 2, by = CY + 6 - bh / 2;
    ctx.fillStyle = 'rgba(10, 12, 18, 0.5)';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 24); ctx.fill();
    ctx.strokeStyle = `rgba(255, 236, 196, ${(0.7 + 0.3 * s.snap).toFixed(3)})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 24); ctx.stroke();
    // the planets
    PLANETS.forEach((p, i) => {
      const mid = 1 - smooth(0.0, 0.6, Math.abs(i - cur));         // 1 on the cursor's slot
      const x = SLOT_X(i), r = ICON_R(i) * (0.92 + 0.16 * mid) * (1 + 0.06 * s.snap * mid);
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.5 * mid;
      if (mid > 0.01) {       // a soft glow behind the chosen one
        const g = ctx.createRadialGradient(x, CY - 8, r * 0.6, x, CY - 8, r * 2.1);
        g.addColorStop(0, `rgba(255,236,196,${(0.35 * mid).toFixed(3)})`); g.addColorStop(1, 'rgba(255,236,196,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, CY - 8, r * 2.1, 0, 7); ctx.fill();
      }
      icon(ctx, i, x, CY - 8, r);
      ctx.font = `700 ${(22 + 3 * mid).toFixed(1)}px Cormorant`;
      ctx.letterSpacing = '2.4px';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2;
      const sh = Math.round(170 + 85 * mid);
      ctx.fillStyle = mid > 0.5 ? '#ffe2a0' : `rgb(${sh + 4},${sh},${Math.round(sh * 0.94)})`;
      const words = p.name.split(' ');
      if (words.length > 1) { ctx.font = `700 ${(19 + 2 * mid).toFixed(1)}px Cormorant`; ctx.fillText(words[0], x + 1.2, 126); ctx.fillText(words[1], x + 1.2, 148); }
      else ctx.fillText(p.name, x + 1.2, 136);
      ctx.restore();
    });
  }

  let lastValue = '';
  return function update(v, s) {
    if (window.__cover) {   // cover art: just the frame and the big title
      cover.style.opacity = '1';
      const st = STOPS[s.b], name = { moon: "the Moon's", pluto: "Pluto's", jupiter: "Jupiter's", sun: "the Sun's", wd: 'white dwarf', ns: 'neutron star' }[st.key];       // the world on screen
      const w = cover.querySelector('.w');
      if (w.textContent !== name) w.textContent = name;
      for (const el of [title, flash, picker, line, counter, caption]) el.style.opacity = '0';
      return;
    }
    const hide = s.flash || 0;
    drawPicker(s);
    picker.style.opacity = (1 - hide).toFixed(3);
    counter.style.opacity = (1 - hide).toFixed(3);
    const val = counterText(v);
    if (val !== lastValue) { value.textContent = val; lastValue = val; }
    const ln = lineAt(v);
    if (ln) {
      if (line.textContent !== ln.text) line.textContent = ln.text;
      line.style.opacity = (ln.alpha * (1 - hide)).toFixed(3);
      line.style.transform = `translateY(${ln.rise.toFixed(2)}px)`;
    } else line.style.opacity = '0';
    const cp = captionAt(v);
    if (cp) {
      if (caption.textContent !== cp.text) caption.textContent = cp.text;
      caption.style.opacity = (cp.alpha * (1 - hide)).toFixed(3);
      caption.style.transform = `translateY(${cp.rise.toFixed(2)}px)`;
      caption.style.top = `${cp.top}px`;
    } else caption.style.opacity = '0';
    title.style.opacity = (s.title || 0).toFixed(3);
    title.style.transform = `translateY(${((1 - (s.title || 0)) * -10).toFixed(2)}px)`;
    title.style.filter = (s.title || 0) < 1 ? `blur(${((1 - (s.title || 0)) * 8).toFixed(2)}px)` : 'none';
    flash.style.background = s.flashColor || '#fff';
    flash.style.opacity = Math.pow(hide, 1.6).toFixed(3);
  };
}

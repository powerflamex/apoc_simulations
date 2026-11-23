// The overlay: the opening title, the planet picker, the counter (your miles from the Sun) with its one line, a
// caption now and then, and the white at the end. The picker is a bar with five slots drawn on its own canvas: a small
// picture of each planet with its name under it, in story order; a glassy cursor sits on the planet whose place Earth
// has taken and slides to the next at each wipe; the track under the names lights up as far as the cursor, and the
// last slot (Pluto) carries a finish ring.
import { STOPS, lineAt, milesAt, fmtMi, captionAt } from './timeline.js';
const PLANETS = STOPS;
import { clamp, smooth } from './util.js';

const PW = 1080, PH = 196;
const SLOT_X = (i) => 124 + i * 208;
const ICON_R = (i) => [23, 19, 16, 31, 15][i];
const CY = 74;

// a small picture of planet i at (x, y), radius r
function icon(ctx, i, x, y, r) {
  i = { jupiter: 5, mars: 1, venus: 2, mercury: 7, pluto: 8 }[STOPS[i].key];
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
  if (i === 0) {             // the Moon: grey, darker seas
    ball([[0, '#eeeeea'], [1, '#9c9c9a']]);
    clipDisc();
    ctx.fillStyle = 'rgba(70,72,80,0.55)';
    for (const [dx, dy, rr] of [[-0.3, -0.25, 0.3], [0.2, -0.35, 0.22], [0.1, 0.2, 0.26], [-0.4, 0.3, 0.16]]) { ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, rr * r, 0, 7); ctx.fill(); }
    ctx.restore();
  } else if (i === 1) {      // Mars: rust, a white cap
    ball([[0, '#f08a4e'], [1, '#a23f1c']]);
    clipDisc();
    ctx.fillStyle = 'rgba(80,30,18,0.5)';
    ctx.beginPath(); ctx.ellipse(x + 0.1 * r, y + 0.15 * r, 0.55 * r, 0.22 * r, -0.3, 0, 7); ctx.fill();
    ctx.fillStyle = '#f6f1ea';
    ctx.beginPath(); ctx.ellipse(x, y - 0.95 * r, 0.5 * r, 0.2 * r, 0, 0, 7); ctx.fill();
    ctx.restore();
  } else if (i === 2) {      // Venus: pale cream
    ball([[0, '#fff6dc'], [1, '#d9b877']]);
  } else if (i === 3) {      // Neptune: deep blue
    ball([[0, '#5d8cff'], [1, '#1a3fb8']]);
    clipDisc();
    ctx.fillStyle = 'rgba(220,235,255,0.6)';
    ctx.beginPath(); ctx.ellipse(x - 0.1 * r, y + 0.3 * r, 0.4 * r, 0.06 * r, -0.1, 0, 7); ctx.fill();
    ctx.restore();
  } else if (i === 4) {      // Saturn: gold, its rings behind and in front
    const ring = (a0, a1) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(-0.42); ctx.scale(1, 0.34);
      ctx.lineWidth = r * 0.4; ctx.strokeStyle = 'rgba(232,212,170,0.95)';
      ctx.beginPath(); ctx.arc(0, 0, r * 1.75, a0, a1); ctx.stroke();
      ctx.lineWidth = r * 0.1; ctx.strokeStyle = 'rgba(60,48,32,0.7)';
      ctx.beginPath(); ctx.arc(0, 0, r * 1.83, a0, a1); ctx.stroke();
      ctx.restore();
    };
    ring(Math.PI, Math.PI * 2);
    ball([[0, '#f4dfaa'], [1, '#b08a4a']]);
    ring(0, Math.PI);
  } else if (i === 6) {      // Titan: a hazy orange ball, a paler veil at the limb
    ball([[0, '#f2b45a'], [0.7, '#c97a2a'], [1, '#8f5218']]);
    clipDisc();
    const g = ctx.createRadialGradient(x, y, r * 0.75, x, y, r * 1.02);
    g.addColorStop(0, 'rgba(255,214,150,0)'); g.addColorStop(1, 'rgba(255,214,150,0.55)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    ctx.restore();
  } else if (i === 7) {      // Mercury: dark grey, cratered
    ball([[0, '#c9c5bf'], [1, '#6f6b66']]);
    clipDisc();
    ctx.fillStyle = 'rgba(60,58,56,0.45)';
    for (const [dx, dy, rr] of [[-0.35, -0.2, 0.18], [0.25, -0.38, 0.14], [0.15, 0.25, 0.22], [-0.3, 0.42, 0.12], [0.5, 0.05, 0.1]]) { ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, rr * r, 0, 7); ctx.fill(); }
    ctx.restore();
  } else if (i === 8) {      // Pluto: tan, its pale heart
    ball([[0, '#e6cfae'], [1, '#8f6f52']]);
    clipDisc();
    ctx.fillStyle = 'rgba(250,244,232,0.85)';
    ctx.beginPath(); ctx.ellipse(x + 0.12 * r, y + 0.22 * r, 0.42 * r, 0.36 * r, 0.4, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(90,50,35,0.45)';
    ctx.beginPath(); ctx.ellipse(x - 0.45 * r, y + 0.1 * r, 0.3 * r, 0.5 * r, 0.2, 0, 7); ctx.fill();
    ctx.restore();
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
    ctx.beginPath(); ctx.moveTo(SLOT_X(0), ty); ctx.lineTo(SLOT_X(4), ty); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,217,138,0.95)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(SLOT_X(0), ty); ctx.lineTo(cx, ty); ctx.stroke();
    PLANETS.forEach((p, i) => {
      ctx.fillStyle = i <= cur + 0.02 ? 'rgba(255,217,138,1)' : 'rgba(255,246,230,0.45)';
      ctx.beginPath(); ctx.arc(SLOT_X(i), ty, i <= cur + 0.02 ? 6 : 4.5, 0, 7); ctx.fill();
    });
    // the finish: a ring round the last slot's dot
    ctx.strokeStyle = cur > 3.98 ? 'rgba(255,217,138,1)' : 'rgba(255,246,230,0.7)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(SLOT_X(4), ty, 11, 0, 7); ctx.stroke();
    // the cursor: a dark glassy tile with a bright edge (it swells a little as it snaps on)
    const k = 1 + 0.07 * s.snap;
    const bw = 176 * k, bh = 150 * k, bx = cx - bw / 2, by = CY + 6 - bh / 2;
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
      ctx.fillText(p.name, x + 1.2, 136);
      ctx.restore();
    });
  }

  let lastValue = '';
  return function update(v, s) {
    if (window.__cover) {   // cover art: just the frame and the big title
      cover.style.opacity = '1';
      const st = STOPS[s.b], name = st.name[0] + st.name.slice(1).toLowerCase() + "'s";       // the planet whose place Earth has
      const w = cover.querySelector('.w');
      if (w.textContent !== name) w.textContent = name;
      for (const el of [title, flash, picker, line, counter, caption]) el.style.opacity = '0';
      return;
    }
    const hide = s.flash || 0;
    drawPicker(s);
    picker.style.opacity = (1 - hide).toFixed(3);
    counter.style.opacity = (1 - hide).toFixed(3);
    const val = fmtMi(milesAt(v));
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
    } else caption.style.opacity = '0';
    title.style.opacity = (s.title || 0).toFixed(3);
    title.style.transform = `translateY(${((1 - (s.title || 0)) * -10).toFixed(2)}px)`;
    title.style.filter = (s.title || 0) < 1 ? `blur(${((1 - (s.title || 0)) * 8).toFixed(2)}px)` : 'none';
    flash.style.background = s.flashColor || '#fff';
    flash.style.opacity = Math.pow(hide, 1.6).toFixed(3);
  };
}

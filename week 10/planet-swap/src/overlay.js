// The overlay: the opening title, the map bar, the counter (your miles from the Sun) with its one line, a caption now
// and then, and the white at the end. The map is drawn on its own canvas: the Sun glowing at the left end, then the six
// planets in their real order out from it (Mercury, Venus, Earth, Mars, Jupiter, Pluto), each a small picture with its
// name under it. Earth sits in a glassy tile with a bright ring; at each stop it trades slots with that planet (Earth
// arcs over the top, the other planet under). The far slot (Pluto's) carries a finish ring.
import { lineAt, milesAt, fmtMi, captionAt, MAP, STOPS } from './timeline.js';
import { clamp, smooth } from './util.js';

const PW = 1080, PH = 196;
const SLOT_X = (x) => 194 + x * 158;
const ICON_R = { mercury: 17, venus: 22, earth: 24, mars: 19, jupiter: 31, pluto: 15 };
const NAMES = { mercury: 'MERCURY', venus: 'VENUS', earth: 'EARTH', mars: 'MARS', jupiter: 'JUPITER', pluto: 'PLUTO' };
const CY = 74;

// a small picture of planet `key` at (x, y), radius r
function icon(ctx, key, x, y, r) {
  const i = { jupiter: 5, mars: 1, venus: 2, mercury: 7, pluto: 8, earth: 10 }[key];
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
  } else if (i === 10) {     // Earth: blue sea, green-brown land, white cloud
    ball([[0, '#6fb2ff'], [1, '#1c4fb0']]);
    clipDisc();
    ctx.fillStyle = 'rgba(86,160,82,0.95)';
    ctx.beginPath(); ctx.ellipse(x - 0.28 * r, y - 0.1 * r, 0.34 * r, 0.52 * r, 0.3, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 0.42 * r, y + 0.3 * r, 0.3 * r, 0.24 * r, -0.4, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(205,180,120,0.8)';
    ctx.beginPath(); ctx.ellipse(x - 0.2 * r, y + 0.25 * r, 0.16 * r, 0.12 * r, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const [dx, dy, a, b, rot] of [[0.1, -0.55, 0.5, 0.1, -0.2], [0.3, 0.0, 0.35, 0.08, 0.3], [-0.45, 0.55, 0.4, 0.08, 0.1]]) { ctx.beginPath(); ctx.ellipse(x + dx * r, y + dy * r, a * r, b * r, rot, 0, 7); ctx.fill(); }
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
    const M = s.map;
    const ty = 170;
    // the Sun at the left end: a glowing disc half off the edge
    {
      const g = ctx.createRadialGradient(18, CY - 4, 10, 18, CY - 4, 150);
      g.addColorStop(0, 'rgba(255,240,190,0.95)'); g.addColorStop(0.3, 'rgba(255,190,90,0.45)'); g.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(18, CY - 4, 150, 0, 7); ctx.fill();
      const d = ctx.createRadialGradient(4, CY - 14, 6, 18, CY - 4, 62);
      d.addColorStop(0, '#fffbe8'); d.addColorStop(0.6, '#ffd36b'); d.addColorStop(1, '#ff9a2e');
      ctx.fillStyle = d; ctx.beginPath(); ctx.arc(18, CY - 4, 62, 0, 7); ctx.fill();
      ctx.save();
      ctx.font = '700 22px Cormorant'; ctx.letterSpacing = '2.4px'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2;
      ctx.fillStyle = 'rgb(255,226,160)'; ctx.fillText('SUN', 46, 136);
      ctx.restore();
    }
    // the track: from the Sun out to the far slot, warm near the Sun, a dot at each slot
    ctx.lineCap = 'round';
    const tg = ctx.createLinearGradient(90, 0, SLOT_X(5), 0);
    tg.addColorStop(0, 'rgba(255,217,138,0.85)'); tg.addColorStop(1, 'rgba(255,246,230,0.3)');
    ctx.strokeStyle = tg; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(96, ty); ctx.lineTo(SLOT_X(5), ty); ctx.stroke();
    for (let j = 0; j < 6; j++) { ctx.fillStyle = 'rgba(255,246,230,0.6)'; ctx.beginPath(); ctx.arc(SLOT_X(j), ty, 4.5, 0, 7); ctx.fill(); }
    // the finish: a ring round the far slot's dot
    ctx.strokeStyle = M.earth.x > 4.98 ? 'rgba(255,217,138,1)' : 'rgba(255,246,230,0.7)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(SLOT_X(5), ty, 11, 0, 7); ctx.stroke();
    // Earth's tile: a dark glassy tile with a bright edge that rides with it (it swells a little as it snaps on)
    const ex = SLOT_X(M.earth.x), ey = M.earth.arc * 44;
    const k = 1 + 0.07 * s.snap;
    const bw = 146 * k, bh = 150 * k, bx = ex - bw / 2, by = CY + 6 - bh / 2 + ey;
    ctx.fillStyle = 'rgba(10, 12, 18, 0.5)';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 24); ctx.fill();
    ctx.strokeStyle = `rgba(150, 210, 255, ${(0.75 + 0.25 * s.snap).toFixed(3)})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 24); ctx.stroke();
    ctx.fillStyle = 'rgba(150,210,255,1)'; ctx.beginPath(); ctx.arc(ex, ty, 6.5, 0, 7); ctx.fill();
    // the planets (the one trading with Earth, then Earth, drawn last so they pass over the others)
    const moving = MAP.filter((p) => M[p].arc !== 0 && p !== 'earth');
    const order = [...MAP.filter((p) => p !== 'earth' && !moving.includes(p)), ...moving, 'earth'];
    for (const p of order) {
      const isE = p === 'earth', mv = M[p].arc !== 0;
      const x = SLOT_X(M[p].x), y = CY - 8 + M[p].arc * 44;
      const r = ICON_R[p] * (isE ? 1 + 0.06 * s.snap : 1) * (mv ? 1 + 0.15 * Math.abs(M[p].arc) : 1);
      ctx.save();
      ctx.globalAlpha = isE || mv ? 1 : 0.75;
      if (isE) {        // a soft blue glow and a ring round Earth
        const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 2.2);
        g.addColorStop(0, 'rgba(150,210,255,0.45)'); g.addColorStop(1, 'rgba(150,210,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, 7); ctx.fill();
      }
      icon(ctx, p, x, y, r);
      if (isE) { ctx.strokeStyle = 'rgba(190,230,255,0.95)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, r + 6, 0, 7); ctx.stroke(); }
      ctx.font = `700 ${isE ? 27 : 23}px Cormorant`;
      ctx.letterSpacing = '2.2px';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2;
      ctx.fillStyle = isE ? '#bfe4ff' : mv ? '#ffe2a0' : 'rgb(232,226,214)';
      ctx.globalAlpha *= 1 - Math.min(1, Math.abs(M[p].arc) * 1.6);       // (the names fade while the two trade places)
      ctx.fillText(NAMES[p], x + 1.2, 136);
      ctx.restore();
    }
  }

  let lastValue = '';
  return function update(v, s) {
    if (window.__cover) {   // cover art: just the frame and the big title
      cover.style.opacity = '1';
      const st = STOPS[Math.max(1, s.b)], name = st.name[0] + st.name.slice(1).toLowerCase() + "'s";       // the planet whose place Earth has
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

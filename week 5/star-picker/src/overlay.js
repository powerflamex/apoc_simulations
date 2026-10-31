// The overlay: the opening title, the sun picker, the one line under it, and the cover.
// The picker is a scroll wheel like the iPhone's date picker, drawn on its own canvas: a drum of star names (each with a
// small disc in the star's colour, bigger for the bigger stars), the middle row in a highlight band, the rows above and
// below curving away and fading. When it lands, the middle row shows the star's size after its name.
import { DRUM, lineAt, drumPos } from './timeline.js';
import { clamp, smooth } from './util.js';

const PW = 1080, PH = 360;
// rough colour of a star from its surface temperature (sRGB, for the discs)
function starRGB(T) {
  const t = T / 100;
  const r = t <= 66 ? 255 : 329.7 * Math.pow(t - 60, -0.1332);
  const g = t <= 66 ? 99.47 * Math.log(t) - 161.1 : 288.1 * Math.pow(t - 60, -0.0755);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5 * Math.log(t - 10) - 305;
  const c = (x) => Math.round(clamp(x, 0, 255));
  return [c(r), c(g), c(b)];
}
const discR = (R) => clamp(12 + 4.2 * Math.log10(Math.max(R, 0.05)), 6, 26);

export function makeOverlay() {
  const title = document.getElementById('title');
  const flash = document.getElementById('flash');
  const cover = document.getElementById('cover');
  const line = document.getElementById('line');
  const picker = document.getElementById('picker');
  const cv = document.createElement('canvas');
  cv.width = PW; cv.height = PH;
  cv.style.cssText = `position:absolute;left:0;top:0;width:${PW}px;height:${PH}px;`;
  picker.appendChild(cv);
  const ctx = cv.getContext('2d');
  const ROW = 78;            // row pitch at the middle (px)
  const RAD = 205;           // the drum's radius (px)

  function drawPicker(s) {
    ctx.clearRect(0, 0, PW, PH);
    const pos = s.drum;
    const cy = PH / 2;
    // the highlight band: a dark glassy bar with thin bright edges
    ctx.save();
    ctx.globalAlpha = 1;
    const bw = 960, bh = 92, bx = (PW - bw) / 2, by = cy - bh / 2;
    ctx.fillStyle = 'rgba(10, 12, 18, 0.42)';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 26); ctx.fill();
    ctx.strokeStyle = 'rgba(255, 246, 230, 0.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 26); ctx.stroke();
    ctx.restore();
    const i0 = Math.floor(pos) - 4, i1 = Math.ceil(pos) + 4;
    const speed = Math.abs(s.drumV || 0);
    for (let i = i0; i <= i1; i++) {
      const row = DRUM[i];
      if (!row) continue;
      const a = (i - pos) * (ROW / RAD);            // angle on the drum
      if (Math.abs(a) > 1.45) continue;
      const y = cy + RAD * Math.sin(a);
      const squash = Math.cos(a);
      const mid = 1 - smooth(0.0, 0.55, Math.abs(i - pos));     // 1 in the middle row
      const alpha = Math.pow(squash, 1.6) * (0.5 + 0.5 * mid);
      const landed = row.stop && Math.abs(i - pos) < 0.02 ? smooth(0.05, 0.3, s.since) : 0;
      const size = (46 + 16 * mid) * (1 + 0.06 * s.snap * mid);
      ctx.save();
      ctx.translate(0, y);
      ctx.scale(1, squash);
      ctx.globalAlpha = alpha;
      ctx.font = `600 ${size.toFixed(1)}px Cormorant`;
      ctx.letterSpacing = `${(0.06 * size).toFixed(1)}px`;
      const nameW = ctx.measureText(row.name).width;
      const sizeTxt = landed > 0 ? row.stop.star.size : '';
      ctx.font = `700 ${(size * 0.66).toFixed(1)}px Cormorant`;
      ctx.letterSpacing = `${(0.08 * size * 0.66).toFixed(1)}px`;
      const sep = sizeTxt ? '  ·  ' : '';
      const sw = sizeTxt ? ctx.measureText(sep + sizeTxt).width : 0;
      const dr = discR(row.R) * (0.75 + 0.25 * mid);
      const gap = 22;
      let total = dr * 2 + gap + nameW + sw * landed;
      // fit the middle row inside the band
      const k = Math.min(1, 900 / total);
      ctx.translate(PW / 2, 0);
      ctx.scale(k, k);
      let x = -total / 2;
      // the disc, with a soft glow in its colour
      const [r, g, b] = starRGB(row.teff);
      const glow = ctx.createRadialGradient(x + dr, 0, dr * 0.3, x + dr, 0, dr * 2.2);
      glow.addColorStop(0, `rgba(${r},${g},${b},0.85)`); glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x + dr, 0, dr * 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgb(${Math.min(255, r + 30)},${Math.min(255, g + 30)},${Math.min(255, b + 30)})`;
      ctx.beginPath(); ctx.arc(x + dr, 0, dr, 0, Math.PI * 2); ctx.fill();
      x += dr * 2 + gap;
      // the name (motion-blurred while it spins fast)
      ctx.font = `600 ${size.toFixed(1)}px Cormorant`;
      ctx.letterSpacing = `${(0.06 * size).toFixed(1)}px`;
      ctx.textBaseline = 'middle';
      const blur = clamp((speed - 6) / 14) * 3.5;
      ctx.filter = blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : 'none';
      ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 2;
      const shade = Math.round(150 + 105 * mid);
      ctx.fillStyle = `rgb(${shade + 4},${shade},${Math.round(shade * 0.94)})`;
      ctx.fillText(row.name, x, size * 0.04);
      x += nameW;
      if (sizeTxt) {
        ctx.globalAlpha = alpha * landed;
        ctx.font = `700 ${(size * 0.66).toFixed(1)}px Cormorant`;
        ctx.letterSpacing = `${(0.08 * size * 0.66).toFixed(1)}px`;
        ctx.fillStyle = '#ffd98a';
        ctx.fillText(sep + sizeTxt, x, size * 0.06);
      }
      ctx.restore();
    }
    // the rows fade toward the top and bottom edges of the drum
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const fade = ctx.createLinearGradient(0, 0, 0, PH);
    fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.2, 'rgba(0,0,0,0.35)'); fade.addColorStop(0.36, 'rgba(0,0,0,0)');
    fade.addColorStop(0.64, 'rgba(0,0,0,0)'); fade.addColorStop(0.8, 'rgba(0,0,0,0.35)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = fade; ctx.fillRect(0, 0, PW, PH);
    ctx.restore();
  }

  return function update(v, s) {
    if (window.__cover) {   // cover art: just the frame and the big title
      cover.style.opacity = '1';
      for (const el of [title, flash, picker, line]) el.style.opacity = '0';
      return;
    }
    s.drumV = (drumPos(v + 1 / 120) - drumPos(v - 1 / 120)) * 60;      // rows per second
    const hide = s.flash || 0;
    drawPicker(s);
    picker.style.opacity = (1 - hide).toFixed(3);
    const ln = lineAt(v);
    if (ln) {
      if (line.textContent !== ln.text) line.textContent = ln.text;
      line.style.opacity = (ln.alpha * (1 - hide)).toFixed(3);
      line.style.transform = `translateY(${ln.rise.toFixed(2)}px)`;
    } else line.style.opacity = '0';
    title.style.opacity = (s.title || 0).toFixed(3);
    title.style.transform = `translateY(${((1 - (s.title || 0)) * -10).toFixed(2)}px)`;
    title.style.filter = (s.title || 0) < 1 ? `blur(${((1 - (s.title || 0)) * 8).toFixed(2)}px)` : 'none';
    flash.style.background = s.flashColor || '#fff';
    flash.style.opacity = Math.pow(hide, 1.6).toFixed(3);
  };
}

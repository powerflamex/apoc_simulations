// The overlay: the opening title, the picker bar (5 SECONDS · 1 MINUTE · 10 MINUTES · 1 HOUR · 1 DAY) drawn on its own
// canvas, the one line under it (how high you are), the captions and the white.
// The picker: each slot a big number with its unit under it; a glassy cursor sits on the stop that is playing and
// slides to the next one at each hand-over; inside the cursor a thin bar fills as the time runs out, and when gravity
// comes back the cursor's edge flashes. The track under the slots lights up as far as the cursor.
import { STOPS, captionAt, lineAt } from './timeline.js';
import { clamp, smooth } from './util.js';

const PW = 1080, PH = 196;
const SLOT_X = (i) => 128 + i * 206;
const CY = 70;

export function makeOverlay() {
  const title = document.getElementById('title');
  const flash = document.getElementById('flash');
  const cover = document.getElementById('cover');
  const line = document.getElementById('line');
  const caption = document.getElementById('caption');
  const picker = document.getElementById('picker');
  const cv = document.createElement('canvas');
  cv.width = PW; cv.height = PH;
  cv.style.cssText = `position:absolute;left:0;top:0;width:${PW}px;height:${PH}px;`;
  picker.appendChild(cv);
  const ctx = cv.getContext('2d');

  function drawPicker(s) {
    ctx.clearRect(0, 0, PW, PH);
    const cur = s.cursor, cx = SLOT_X(cur);
    // the track under the slots: dim all the way, lit as far as the cursor
    const ty = 172;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,246,230,0.3)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(SLOT_X(0), ty); ctx.lineTo(SLOT_X(4), ty); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,217,138,0.95)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(SLOT_X(0), ty); ctx.lineTo(cx, ty); ctx.stroke();
    STOPS.forEach((p, i) => {
      ctx.fillStyle = i <= cur + 0.02 ? 'rgba(255,217,138,1)' : 'rgba(255,246,230,0.5)';
      ctx.beginPath(); ctx.arc(SLOT_X(i), ty, i <= cur + 0.02 ? 6 : 4.5, 0, 7); ctx.fill();
    });
    // the cursor: a dark glassy tile with a bright edge; it swells as it snaps on, its edge flashes when gravity's back
    const k = 1 + 0.07 * s.snap + 0.05 * s.backPulse;
    const bw = 186 * k, bh = 150 * k, bx = cx - bw / 2, by = CY + 8 - bh / 2;
    ctx.fillStyle = 'rgba(10, 12, 18, 0.55)';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 24); ctx.fill();
    // the time running out: a bar along the tile's foot
    const moving = Math.abs(cur - Math.round(cur)) < 0.02;
    if (moving) {
      const fx0 = bx + 22, fw = bw - 44, fy = by + bh - 20;
      ctx.fillStyle = 'rgba(255,246,230,0.22)'; ctx.beginPath(); ctx.roundRect(fx0, fy, fw, 6, 3); ctx.fill();
      ctx.fillStyle = s.back > 0 ? '#fff6e6' : 'rgba(255,217,138,1)';
      ctx.beginPath(); ctx.roundRect(fx0, fy, Math.max(6, fw * s.fill), 6, 3); ctx.fill();
    }
    const edge = 0.7 + 0.3 * s.snap;
    ctx.strokeStyle = `rgba(255, 236, 196, ${Math.min(1, edge).toFixed(3)})`; ctx.lineWidth = 3 + 4 * s.backPulse;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 24); ctx.stroke();
    if (s.backPulse > 0.01) {
      ctx.save(); ctx.shadowColor = 'rgba(255,240,210,0.9)'; ctx.shadowBlur = 30 * s.backPulse;
      ctx.strokeStyle = `rgba(255,250,240,${s.backPulse.toFixed(3)})`; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 24); ctx.stroke(); ctx.restore();
    }
    // the slots: a big number, the unit under it
    STOPS.forEach((p, i) => {
      const mid = 1 - smooth(0.0, 0.6, Math.abs(i - cur));         // 1 on the cursor's slot
      const x = SLOT_X(i);
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2;
      const sh = Math.round(185 + 70 * mid);
      ctx.fillStyle = mid > 0.5 ? '#ffe2a0' : `rgba(${sh + 4},${sh},${Math.round(sh * 0.94)},${(0.62 + 0.38 * mid).toFixed(3)})`;
      ctx.font = `500 ${(66 + 14 * mid).toFixed(1)}px CormorantNum`;
      ctx.letterSpacing = '0px';
      ctx.fillText(p.n, x, CY + 22);
      ctx.font = `700 ${(21 + 3 * mid).toFixed(1)}px Cormorant`;
      ctx.letterSpacing = '2.6px';
      ctx.fillText(p.unit, x + 1.3, CY + 58);
      ctx.restore();
    });
  }

  return function update(v, s) {
    if (window.__cover) {   // cover art: just the frame and the big title
      cover.style.opacity = '1';
      for (const el of [title, flash, picker, line, caption]) el.style.opacity = '0';
      return;
    }
    const hide = s.hide || 0;
    drawPicker(s);
    picker.style.opacity = (1 - hide).toFixed(3);
    const ln = lineAt(v);
    if (line.textContent !== ln) line.textContent = ln;
    line.style.opacity = (1 - hide).toFixed(3);

    const cap = captionAt(v);
    if (cap) {
      if (caption.textContent !== cap.text) caption.textContent = cap.text;
      caption.style.opacity = (cap.alpha * (1 - hide)).toFixed(3);
      caption.style.transform = `translateY(${cap.rise.toFixed(2)}px)`;
      caption.style.filter = cap.alpha < 1 ? `blur(${((1 - cap.alpha) * 6).toFixed(2)}px)` : 'none';
    } else caption.style.opacity = '0';

    title.style.opacity = (s.title || 0).toFixed(3);
    title.style.transform = `translateY(${((1 - (s.title || 0)) * (v < 2 ? 18 : -10)).toFixed(2)}px)`;
    title.style.filter = (s.title || 0) < 1 ? `blur(${((1 - (s.title || 0)) * 8).toFixed(2)}px)` : 'none';
    flash.style.opacity = clamp(s.impact || 0).toFixed(3);
  };
}

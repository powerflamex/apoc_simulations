// DOM overlay: opening title, the counter (height above the lava, then time on it; the small REAL TIME / SLOW MOTION
// tag; the heat line under it), narration, the gold popup and the white flash.
import { COUNTERS, captionAt, popupAt, POP } from './timeline.js';
import { smooth } from './util.js';

export function makeOverlay() {
  const counter = document.getElementById('counter');
  const caption = document.getElementById('caption');
  const flash = document.getElementById('flash');
  const title = document.getElementById('title');
  const cover = document.getElementById('cover');
  const stampEl = document.getElementById('stamp');

  const rows = COUNTERS.map((c) => {
    const el = document.createElement('div');
    el.className = 'row';
    el.innerHTML = `<div class="label">${c.label}<span class="tag"></span></div><div class="value"></div><div class="unit"></div>`;
    counter.appendChild(el);
    return { c, el, tag: el.querySelector('.tag'), value: el.querySelector('.value'), unit: el.querySelector('.unit') };
  });

  return function update(v, s) {
    if (window.__cover) {   // cover art: just the frame and the big title
      cover.style.opacity = '1';
      for (const el of [counter, caption, title, flash, stampEl]) el.style.opacity = '0';
      return;
    }
    for (const r of rows) {
      // each row shows only in its own stretch of the video (a short cross-fade between them)
      const on = Math.min(smooth(r.c.from - 0.12, r.c.from + 0.12, v), 1 - smooth(r.c.to - 0.12, r.c.to + 0.12, v));
      r.el.style.opacity = on.toFixed(3);
      if (on <= 0.001) continue;
      const val = r.c.value(v);
      r.value.textContent = r.c.fmt(Math.max(0, val));
      const u = r.c.unit(v);
      if (r.unit.textContent !== u) r.unit.textContent = u;
      const tg = r.c.tag(v);
      if (r.tag.textContent !== tg) r.tag.textContent = tg;
      r.tag.style.display = tg ? 'inline-block' : 'none';
    }
    const hide = Math.max(s.flash || 0, s.fadeOut || 0);
    counter.style.opacity = (1 - hide).toFixed(3);

    const cap = captionAt(v);
    if (cap) {
      if (caption.textContent !== cap.text) caption.textContent = cap.text;
      caption.style.opacity = (cap.alpha * (1 - hide)).toFixed(3);
      caption.style.transform = `translateY(${cap.rise.toFixed(2)}px)`;
      caption.style.filter = cap.alpha < 1 ? `blur(${((1 - cap.alpha) * 6).toFixed(2)}px)` : 'none';
    } else caption.style.opacity = '0';

    // the gold popup: one phrase saying what just happened (never a number), a steady size, rising in
    const p = popupAt(v);
    const a = p ? smooth(0, 0.06, p.dt) * (1 - smooth(POP - 0.35, POP, p.dt)) * (1 - hide) : 0;
    stampEl.style.opacity = a.toFixed(3);
    if (a > 0) {
      if (stampEl.textContent !== p.say) stampEl.textContent = p.say;
      const fit = Math.max(64, Math.min(118, 1650 / p.say.length));
      stampEl.style.fontSize = `${fit.toFixed(1)}px`;
      stampEl.style.transform = `translateY(${(22 * (1 - smooth(0, 0.18, p.dt))).toFixed(1)}px)`;
    }

    title.style.opacity = (s.title || 0).toFixed(3);
    title.style.transform = `translateY(${((1 - (s.title || 0)) * (v < 2 ? 18 : -10)).toFixed(2)}px)`;
    title.style.filter = (s.title || 0) < 1 ? `blur(${((1 - (s.title || 0)) * 8).toFixed(2)}px)` : 'none';

    flash.style.background = s.flashColor || '#fff';
    flash.style.opacity = Math.pow(hide, 1.6).toFixed(3);
  };
}

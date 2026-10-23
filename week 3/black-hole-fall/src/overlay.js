// DOM overlay: opening title, live counter, narration, the gold stamp at each beat, the "YOU" marker in the far
// shot, and the white flash.
import { COUNTERS, captionAt, stampAt } from './timeline.js';
import { clamp } from './util.js';

export function makeOverlay() {
  const counter = document.getElementById('counter');
  const caption = document.getElementById('caption');
  const flash = document.getElementById('flash');
  const title = document.getElementById('title');
  const cover = document.getElementById('cover');
  const stampEl = document.getElementById('stamp');
  const stampW = document.getElementById('stampw');
  const you = document.getElementById('you');

  const rows = COUNTERS.map((c) => {
    const el = document.createElement('div');
    el.className = 'row';
    el.innerHTML = `<div class="label">${c.label}</div><div class="value"></div><div class="unit"></div><div class="badge"></div>`;
    counter.appendChild(el);
    return { c, el, value: el.querySelector('.value'), unit: el.querySelector('.unit'), badge: el.querySelector('.badge') };
  });

  return function update(t, s, v = t, mark = null) {
    if (window.__cover) {   // cover art: just the frame and the big title
      cover.style.opacity = '1';
      for (const el of [counter, caption, title, flash, stampEl, stampW, you]) el.style.opacity = '0';
      return;
    }
    for (const r of rows) {
      const { from, to } = r.c;
      // the two counters swap at the edge in one frame (a hard cut reads as the beat)
      const alpha = t >= from && t < to ? 1 : 0;
      r.el.style.opacity = String(alpha);
      r.el.style.display = alpha > 0 ? 'block' : 'none';
      if (alpha > 0) {
        const val = r.c.value(t);
        r.value.textContent = r.c.fmt(Math.max(0, val));
        const u = typeof r.c.unit === 'function' ? r.c.unit(t) : r.c.unit;
        if (r.unit.textContent !== u) r.unit.textContent = u;
        const b = r.c.badge ? r.c.badge(t) : '';
        if (r.badge.textContent !== b) r.badge.textContent = b;
        r.badge.style.display = b ? 'inline-block' : 'none';
      }
    }
    const hide = Math.max(s.flash || 0, s.fadeOut || 0);
    counter.style.opacity = (1 - hide).toFixed(3);

    const cap = captionAt(v);
    if (cap) {
      if (caption.textContent !== cap.text) caption.textContent = cap.text;
      caption.style.opacity = (cap.alpha * (1 - hide)).toFixed(3);
      caption.style.transform = `translateY(${cap.rise.toFixed(2)}px)`;
      caption.style.filter = cap.alpha < 1 ? `blur(${((1 - cap.alpha) * 6).toFixed(2)}px)` : 'none';
    } else {
      caption.style.opacity = '0';
    }

    // the beat: a big gold number that punches in and settles
    const st = stampAt(v);
    if (st) {
      const a = st.a * (1 - hide);
      stampEl.style.opacity = a.toFixed(3);
      stampW.style.opacity = a.toFixed(3);
      if (stampEl.textContent !== st.text) stampEl.textContent = st.text;
      if (stampW.textContent !== st.label) stampW.textContent = st.label;
      const big = st.text.length > 5 ? 0.72 : 1;
      stampEl.style.fontSize = `${(150 * big * (1 + 0.3 * Math.exp(-st.dt * 9))).toFixed(1)}px`;
    } else {
      stampEl.style.opacity = '0';
      stampW.style.opacity = '0';
    }

    if (mark && mark.a > 0) {
      you.style.opacity = mark.a.toFixed(3);
      you.style.left = `${(mark.x - 120).toFixed(1)}px`;
      you.style.top = `${(mark.y - 128).toFixed(1)}px`;
    } else you.style.opacity = '0';

    title.style.opacity = (s.title || 0).toFixed(3);
    title.style.transform = `translateY(${((1 - (s.title || 0)) * (v < 2 ? 18 : -10)).toFixed(2)}px)`;
    title.style.filter = (s.title || 0) < 1 ? `blur(${((1 - (s.title || 0)) * 8).toFixed(2)}px)` : 'none';

    flash.style.background = s.flashColor || '#fff';
    flash.style.opacity = Math.pow(hide, 1.6).toFixed(3);
  };
}

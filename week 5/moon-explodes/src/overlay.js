// DOM overlay: the opening title, the pieces counter (with the small TIME-LAPSE tag and, under it, the time since the
// explosion), the captions, the white flash, and the cover art's big title.
import { COUNTERS, captionAt } from './timeline.js';

export function makeOverlay() {
  const counter = document.getElementById('counter');
  const caption = document.getElementById('caption');
  const flash = document.getElementById('flash');
  const title = document.getElementById('title');
  const cover = document.getElementById('cover');

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
      for (const el of [counter, caption, title, flash]) el.style.opacity = '0';
      return;
    }
    for (const r of rows) {
      const txt = r.c.fmt(r.c.value(v));
      if (r.value.textContent !== txt) r.value.textContent = txt;
      const u = r.c.unit(v);
      if (r.unit.textContent !== u) r.unit.textContent = u;
      const tg = r.c.tag(v);
      if (r.tag.textContent !== tg) r.tag.textContent = tg;
      r.tag.style.display = tg ? 'inline-block' : 'none';
    }
    const hide = s.flash || 0;
    counter.style.opacity = (1 - hide).toFixed(3);

    const cap = captionAt(v);
    if (cap) {
      if (caption.textContent !== cap.text) caption.textContent = cap.text;
      caption.style.opacity = (cap.alpha * (1 - hide)).toFixed(3);
      caption.style.transform = `translateY(${cap.rise.toFixed(2)}px)`;
      caption.style.filter = cap.alpha < 1 ? `blur(${((1 - cap.alpha) * 6).toFixed(2)}px)` : 'none';
    } else caption.style.opacity = '0';

    title.style.opacity = (s.title || 0).toFixed(3);
    title.style.transform = `translateY(${((1 - (s.title || 0)) * -10).toFixed(2)}px)`;
    title.style.filter = (s.title || 0) < 1 ? `blur(${((1 - (s.title || 0)) * 8).toFixed(2)}px)` : 'none';

    flash.style.background = s.flashColor || '#fff';
    flash.style.opacity = Math.pow(hide, 1.6).toFixed(3);
  };
}

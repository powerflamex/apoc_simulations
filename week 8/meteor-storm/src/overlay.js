// DOM overlay: opening title, live counter, narration, fade/flash and end card.
import { COUNTERS, captionAt } from './timeline.js';
import { clamp } from './util.js';

export function makeOverlay() {
  const counter = document.getElementById('counter');
  const caption = document.getElementById('caption');
  const flash = document.getElementById('flash');
  const title = document.getElementById('title');
  const endcard = document.getElementById('endcard');
  const endText = endcard.querySelector('.t');
  const endSub = endcard.querySelectorAll('.rule, .s');
  const cover = document.getElementById('cover');

  const rows = COUNTERS.map((c) => {
    const el = document.createElement('div');
    el.className = 'row';
    el.innerHTML = `<div class="label">${c.label}</div><div class="value"></div><div class="unit"></div><div class="badge"></div>`;
    counter.appendChild(el);
    return { c, el, value: el.querySelector('.value'), unit: el.querySelector('.unit'), badge: el.querySelector('.badge') };
  });

  return function update(t, s, v = t) {   // t: story clock, v: video clock (captions, title)
    if (window.__cover) {   // cover art: just the frame and the big title
      cover.style.opacity = '1';
      for (const el of [counter, caption, title, flash, endcard]) el.style.opacity = '0';
      return;
    }
    const XF = 0.45; // crossfade between counter segments
    for (const r of rows) {
      const { from, to } = r.c;
      const a = Math.min(clamp((t - from) / XF), clamp((to - t) / XF));
      const first = r.c === COUNTERS[0];
      const alpha = a;   // (the video starts mid-story, so the counter is up from frame 0)
      r.el.style.opacity = alpha.toFixed(3);
      r.el.style.display = alpha > 0 ? 'block' : 'none';
      if (alpha > 0) {
        if (r.c.labelFn) { const L = r.c.labelFn(t); const le = r.el.querySelector('.label'); if (le.textContent !== L) le.textContent = L; }
        const v = r.c.value(t);
        r.value.textContent = r.c.fmt(r.c.allowNegative ? v : Math.max(0, v));
        const u = typeof r.c.unit === 'function' ? r.c.unit(t) : r.c.unit;
        if (r.unit.textContent !== u) r.unit.textContent = u;
        const b = r.c.badge ? r.c.badge(t) : '';
        if (r.badge.textContent !== b) r.badge.textContent = b;
        r.badge.style.display = b ? 'inline-block' : 'none';
      }
    }
    const hide = Math.max(s.flash || 0, s.fadeOut || 0, s.hide || 0);
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

    title.style.opacity = (s.title || 0).toFixed(3);
    title.style.transform = `translateY(${((1 - (s.title || 0)) * (v < 2 ? 18 : -10)).toFixed(2)}px)`;
    title.style.filter = (s.title || 0) < 1 ? `blur(${((1 - (s.title || 0)) * 8).toFixed(2)}px)` : 'none';

    flash.style.background = (s.fadeOut || 0) > (s.flash || 0) ? '#000' : (s.flashColor || '#fff');
    flash.style.opacity = (s.endcard ? 0 : Math.pow(Math.max(s.flash || 0, s.fadeOut || 0), 1.6)).toFixed(3);
    endcard.style.opacity = String(s.endcard);
    endText.style.opacity = s.endText.toFixed(3);
    endText.style.transform = `translateY(${((1 - s.endText) * 16).toFixed(2)}px)`;
    endSub.forEach((e) => (e.style.opacity = (clamp((t - 63.7) / 0.8) * 0.9).toFixed(3)));
  };
}

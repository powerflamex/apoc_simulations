// DOM overlay: live counter, narration, flash and end card.
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
    el.innerHTML = `<div class="label">${c.label}</div><div class="value"></div><div class="unit">${c.unit}</div>`;
    counter.appendChild(el);
    return { c, el, value: el.querySelector('.value') };
  });

  return function update(t, s) {
    if (window.__cover) {   // cover art: just the frame and the big title
      cover.style.opacity = '1';
      for (const el of [counter, caption, title, flash, endcard]) el.style.opacity = '0';
      return;
    }
    const XF = 0.45; // crossfade between counter segments
    for (const r of rows) {
      const { from, to } = r.c;
      const a = Math.min(clamp((t - from + XF / 2) / XF), clamp((to - t + XF / 2) / XF));
      const first = r.c === COUNTERS[0];
      const alpha = a;   // (the video starts mid-story, so the counter is up from frame 0)
      r.el.style.opacity = alpha.toFixed(3);
      r.el.style.display = alpha > 0 ? 'block' : 'none';
      if (alpha > 0) r.value.textContent = r.c.fmt(Math.max(0, r.c.value(t)));
    }
    counter.style.opacity = (1 - s.flash).toFixed(3);

    const cap = captionAt(t);
    if (cap) {
      if (caption.textContent !== cap.text) caption.textContent = cap.text;
      caption.style.opacity = cap.alpha.toFixed(3);
      caption.style.transform = `translateY(${cap.rise.toFixed(2)}px)`;
      caption.style.filter = cap.alpha < 1 ? `blur(${((1 - cap.alpha) * 6).toFixed(2)}px)` : 'none';
    } else {
      caption.style.opacity = '0';
    }

    title.style.opacity = s.title.toFixed(3);
    title.style.transform = `translateY(${((1 - s.title) * (t < 2 ? 18 : -10)).toFixed(2)}px)`;
    title.style.filter = s.title < 1 ? `blur(${((1 - s.title) * 8).toFixed(2)}px)` : 'none';
    flash.style.opacity = (s.endcard ? 0 : Math.pow(s.flash, 1.6)).toFixed(3);
    endcard.style.opacity = String(s.endcard);
    endText.style.opacity = s.endText.toFixed(3);
    endText.style.transform = `translateY(${((1 - s.endText) * 16).toFixed(2)}px)`;
    endSub.forEach((e) => (e.style.opacity = (clamp((t - 77.6) / 0.8) * 0.9).toFixed(3)));
  };
}

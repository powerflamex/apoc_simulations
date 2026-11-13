// The overlay: the opening title, the counter (label, racing value, its one line), the captions and the popups.
// Never a popup and a caption at the same time (captionAt returns null while a popup shows).
import { counterAt, captionAt, popupAt } from './timeline.js';

export function makeOverlay() {
  const title = document.getElementById('title');
  const flash = document.getElementById('flash');
  const cover = document.getElementById('cover');
  const line = document.getElementById('line');
  const counter = document.getElementById('counter');
  const label = counter.querySelector('.label');
  const value = counter.querySelector('.value');
  const caption = document.getElementById('caption');
  const stamp = document.getElementById('stamp');

  return function update(v, s) {
    if (window.__cover) {   // cover art: just the frame and the big title
      cover.style.opacity = '1';
      for (const el of [title, flash, line, counter, caption, stamp]) el.style.opacity = '0';
      return;
    }
    const hide = s.lens || 0;
    const c = counterAt(v);
    if (label.textContent !== c.label) label.textContent = c.label;
    if (value.textContent !== c.value) value.textContent = c.value;
    if (line.textContent !== c.line) line.textContent = c.line;
    counter.style.opacity = (1 - hide).toFixed(3);
    line.style.opacity = (1 - hide).toFixed(3);
    const cap = captionAt(v), pop = popupAt(v);
    if (cap) {
      if (caption.textContent !== cap.text) caption.textContent = cap.text;
      caption.style.opacity = (cap.alpha * (1 - hide)).toFixed(3);
      caption.style.transform = `translateY(${cap.rise.toFixed(2)}px)`;
    } else caption.style.opacity = '0';
    if (pop) {
      if (stamp.textContent !== pop.text) stamp.textContent = pop.text;
      stamp.style.opacity = (pop.alpha * (1 - hide)).toFixed(3);
      stamp.style.transform = `translateY(${pop.rise.toFixed(2)}px)`;
    } else stamp.style.opacity = '0';
    s.capBand = Math.max(cap ? cap.alpha : 0, pop ? pop.alpha : 0) * (1 - hide);
    title.style.opacity = (s.title || 0).toFixed(3);
    title.style.transform = `translateY(${((1 - (s.title || 0)) * -10).toFixed(2)}px)`;
    title.style.filter = (s.title || 0) < 1 ? `blur(${((1 - (s.title || 0)) * 8).toFixed(2)}px)` : 'none';
    flash.style.opacity = '0';
  };
}

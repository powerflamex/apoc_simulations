// The overlay: the opening title, the counter (label, racing value + "SMALLER", its one line), the captions, the
// "YOU" tag in the pull-back. No popups in this video (so never a popup and a caption at once).
import { counterAt, captionAt } from './timeline.js';

export function makeOverlay() {
  const title = document.getElementById('title');
  const cover = document.getElementById('cover');
  const line = document.getElementById('line');
  const counter = document.getElementById('counter');
  const label = counter.querySelector('.label');
  const num = counter.querySelector('.num');
  const unit = counter.querySelector('.unit');
  const caption = document.getElementById('caption');
  const youEl = document.getElementById('you');

  return function update(v, s) {
    if (window.__cover) {   // cover art: just the frame and the big title
      cover.style.opacity = '1';
      for (const el of [title, line, counter, caption, youEl]) el.style.opacity = '0';
      return;
    }
    const hide = s.flash || 0;
    const c = counterAt(v);
    if (label.textContent !== c.label) label.textContent = c.label;
    if (num.textContent !== c.value) num.textContent = c.value;
    if (unit.textContent !== c.unit) unit.textContent = c.unit;
    if (line.textContent !== c.line) line.textContent = c.line;
    counter.style.opacity = (1 - hide).toFixed(3);
    line.style.opacity = (1 - hide).toFixed(3);
    const cap = captionAt(v);
    if (cap) {
      if (caption.textContent !== cap.text) caption.textContent = cap.text;
      caption.style.opacity = (cap.alpha * (1 - hide)).toFixed(3);
      caption.style.transform = `translateY(${cap.rise.toFixed(2)}px)`;
    } else caption.style.opacity = '0';
    s.capBand = (cap ? cap.alpha : 0) * (1 - hide);
    title.style.opacity = (s.title || 0).toFixed(3);
    title.style.transform = `translateY(${((1 - (s.title || 0)) * -10).toFixed(2)}px)`;
    title.style.filter = (s.title || 0) < 1 ? `blur(${((1 - (s.title || 0)) * 8).toFixed(2)}px)` : 'none';
    if (s.youScreen && s.youTag > 0) {
      youEl.style.opacity = s.youTag.toFixed(3);
      youEl.style.left = `${(s.youScreen.x - 120).toFixed(1)}px`;
      youEl.style.top = `${(s.youScreen.y - 112).toFixed(1)}px`;
    } else youEl.style.opacity = '0';
  };
}

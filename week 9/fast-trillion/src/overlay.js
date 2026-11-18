// DOM overlay: the opening title, the counter (label, racing value, its one line: what you're as fast as) and the
// captions (no popups in this video). At light speed the number slams to a stop: it jumps a size and turns gold.
import { counterAt, captionAt } from './timeline.js';

export function makeOverlay() {
  const counter = document.getElementById('counter');
  const label = counter.querySelector('.label'), value = counter.querySelector('.value'), unit = counter.querySelector('.unit');
  const caption = document.getElementById('caption');
  const title = document.getElementById('title');
  const cover = document.getElementById('cover');

  let baseSize = 172;
  return function update(v, s) {
    if (window.__cover) {   // cover art: just the frame and the big title
      cover.style.opacity = '1';
      for (const el of [counter, caption, title]) el.style.opacity = '0';
      return;
    }
    const c = counterAt(v);
    if (label.textContent !== c.label) label.textContent = c.label;
    if (value.textContent !== c.value) {
      value.textContent = c.value;
      // as big as it fits: 172 px until the number gets too long for the frame, then shrunk to fit
      value.style.fontSize = '172px';
      const w = value.scrollWidth;
      baseSize = w > 1000 ? Math.floor(172 * 1000 / w) : 172;
      value.style.fontSize = `${baseSize}px`;
    }
    // the slam at light speed: a jolt in size, then gold from there on
    const lit = (s.slamOn || 0);
    value.style.fontSize = `${(baseSize * (1 + 0.12 * (s.slam || 0))).toFixed(1)}px`;
    value.style.color = lit > 0 ? `rgb(${Math.round(244 + (241 - 244) * lit)}, ${Math.round(239 + (201 - 239) * lit)}, ${Math.round(230 + (120 - 230) * lit)})` : '';
    unit.style.color = value.style.color;
    if (unit.textContent !== c.line) unit.textContent = c.line;
    const hide = s.hide || 0;
    counter.style.opacity = (1 - hide).toFixed(3);

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
  };
}

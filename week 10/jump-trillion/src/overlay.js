// DOM overlay: the opening title, the counter (label, racing value, its one line: how high you go) and the captions.
// The gold popups are set in main.js (never a popup and a caption at the same time: captionAt returns null while one shows).
import { counterAt, captionAt } from './timeline.js';

export function makeOverlay() {
  const counter = document.getElementById('counter');
  const label = counter.querySelector('.label'), value = counter.querySelector('.value'), unit = counter.querySelector('.unit');
  const caption = document.getElementById('caption');
  const title = document.getElementById('title');
  const cover = document.getElementById('cover');

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
      if (w > 1000) value.style.fontSize = `${Math.floor(172 * 1000 / w)}px`;
    }
    if (unit.textContent !== c.line) {
      unit.textContent = c.line;
      // (one line, shrunk to fit the frame if it's long)
      unit.style.fontSize = '56px';
      const w = unit.scrollWidth;
      if (w > 990) unit.style.fontSize = `${Math.floor(56 * 990 / w)}px`;
    }
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

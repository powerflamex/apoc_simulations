// DOM overlay: the opening title, the counter (YOUR IQ / NEXT: ...), the number on the right (how long a second
// feels, then your brain's temperature), the big word at each doubling, the closing lines and the fade to black.
// compose.js paints all of it into the frame.
import { COUNTERS, RIGHT, popupAt, SEC } from './timeline.js';
import { clamp, smooth } from './util.js';

const CLOSING = [
  [SEC.end + 1, SEC.end + 10.5, 'Take the test: iqmaxx.ing'],
  [SEC.end + 11.5, SEC.out - 1.5, 'What would you do with 1,000× your IQ?'],
];

export function makeOverlay() {
  const counter = document.getElementById('counter');
  const right = document.getElementById('right'), rightL = right.querySelector('.label'), rightV = right.querySelector('.value'), rightU = right.querySelector('.unit');
  const flash = document.getElementById('flash');
  const title = document.getElementById('title');
  const cover = document.getElementById('cover');
  const stamp = document.getElementById('stamp'), stampk = document.getElementById('stampk');
  const closing = document.getElementById('closing');
  const rows = COUNTERS.map((c) => {
    const el = document.createElement('div');
    el.className = 'row';
    el.innerHTML = `<div class="label">${c.label}</div><div class="value"></div><div class="unit"></div>`;
    counter.appendChild(el);
    return { c, el, value: el.querySelector('.value'), unit: el.querySelector('.unit') };
  });

  // t: the story moment shown (the flash-forward shows a later one), v: the video clock
  return function update(t, s, v) {
    if (window.__cover) {
      cover.style.opacity = '1';
      for (const el of [counter, right, title, flash, stamp, stampk, closing]) el.style.opacity = '0';
      return;
    }
    for (const r of rows) {
      const a = Math.min(clamp((t - r.c.from) / 0.4), clamp((r.c.to - t) / 0.6));
      r.el.style.opacity = a.toFixed(3);
      r.el.style.display = a > 0 ? 'block' : 'none';
      if (a > 0) {
        r.value.textContent = r.c.fmt(r.c.value(t));
        const u = r.c.unit(t);
        if (r.unit.textContent !== u) r.unit.textContent = u;
      }
    }
    counter.style.opacity = (1 - (s.after || 0)).toFixed(3);
    // the number on the right
    {
      let row = null, a = 0;
      for (const R of RIGHT) {
        const k = Math.min(clamp((t - R.from) / 0.5), clamp((R.to - t) / 0.5));
        if (k > a) { a = k; row = R; }
      }
      right.style.opacity = a.toFixed(3);
      if (row) {
        if (rightL.textContent !== row.label) rightL.textContent = row.label;
        const x = row.value(t), u = row.unit(t);
        if (rightV.textContent !== x) rightV.textContent = x;
        if (rightU.textContent !== u) rightU.textContent = u;
        right.classList.toggle('hot', !!row.hot);
      }
    }
    title.style.opacity = (s.title || 0).toFixed(3);
    title.style.filter = (s.title || 0) < 1 ? `blur(${((1 - (s.title || 0)) * 8).toFixed(2)}px)` : 'none';

    // the popup: one gold phrase, steady size, rises in, holds, fades (nothing over the opening title)
    const p = v > 6.6 ? popupAt(t) : null;
    const a = p ? smooth(0, 0.18, p.dt) * (1 - smooth(1.5, 1.9, p.dt)) : 0;
    stamp.style.opacity = a.toFixed(3); stampk.style.opacity = '0';
    if (a > 0) {
      if (stamp.textContent !== p.say) stamp.textContent = p.say;
      stamp.style.transform = `translateY(${(14 * (1 - smooth(0, 0.25, p.dt))).toFixed(1)}px)`;
    }

    let ct = null;
    // (captions only in the gaps between popups)
    if (!popupAt(t)) for (const [a0, b0, text] of CLOSING) if (v >= a0 && v <= b0) ct = { text, a: Math.min(clamp((v - a0) / 0.6), clamp((b0 - v) / 0.6)) };
    closing.style.opacity = ct ? ct.a.toFixed(3) : '0';
    if (ct && closing.textContent !== ct.text) closing.textContent = ct.text;

    flash.style.background = s.fadeOut > (s.white || 0) ? '#000' : '#fff';
    flash.style.opacity = Math.pow(Math.max(s.white || 0, s.fadeOut || 0), 1.4).toFixed(3);
  };
}

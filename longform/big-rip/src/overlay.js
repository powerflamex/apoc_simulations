// DOM overlay: the opening title, THE BIG RIP, the counter (THE BIG RIP IN ... / NEXT: ...), the big word at each step, the
// white flash, and the closing lines. compose.js paints all of it into the frame.
import { COUNTERS, beatAt, SEC } from './timeline.js';
import { clamp, smooth } from './util.js';

const CLOSING = [
  [SEC.end + 7, SEC.end + 12.6, 'It might never happen.'],                 // as the voice says it (399 s)
  [SEC.end + 13.4, SEC.out - 1, 'Which ending should I simulate next?'],
];

export function makeOverlay() {
  const counter = document.getElementById('counter');
  const flash = document.getElementById('flash');
  const title = document.getElementById('title');
  const name = document.getElementById('name');
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
      for (const el of [counter, title, name, flash, stamp, stampk, closing]) el.style.opacity = '0';
      return;
    }
    for (const r of rows) {
      const a = Math.min(clamp((t - r.c.from) / 0.4), clamp((r.c.to - t) / 0.4));
      r.el.style.opacity = a.toFixed(3);
      r.el.style.display = a > 0 ? 'block' : 'none';
      if (a > 0) {
        r.value.textContent = r.c.fmt(r.c.value(t));
        const u = r.c.unit(t);
        if (r.unit.textContent !== u) r.unit.textContent = u;
      }
    }
    const hide = Math.max(s.flash || 0, s.after || 0, s.scope || 0, s.phoneShot || 0);
    counter.style.opacity = (1 - hide).toFixed(3);

    title.style.opacity = (s.title || 0).toFixed(3);
    title.style.filter = (s.title || 0) < 1 ? `blur(${((1 - (s.title || 0)) * 8).toFixed(2)}px)` : 'none';

    const n = s.name || 0;
    name.style.opacity = n.toFixed(3);
    name.style.transform = `scale(${(1 + 0.12 * (1 - smooth(5.5, 6.2, v))).toFixed(4)})`;

    // the big word: pops in, holds, fades
    const b = beatAt(t);
    const a = b && v > 6 ? smooth(0, 0.08, b.dt) * (1 - smooth(2.2, 2.9, b.dt)) * (1 - hide) : 0;
    stamp.style.opacity = a.toFixed(3); stampk.style.opacity = a.toFixed(3);
    if (a > 0) {
      if (stamp.textContent !== b.w) stamp.textContent = b.w;
      if (stampk.textContent !== b.k) stampk.textContent = b.k;
      stamp.style.fontSize = `${(150 * (1 + 0.25 * Math.exp(-b.dt * 8))).toFixed(1)}px`;
    }

    let ct = null;
    for (const [a0, b0, text] of CLOSING) if (v >= a0 && v <= b0) ct = { text, a: Math.min(clamp((v - a0) / 0.6), clamp((b0 - v) / 0.6)) };
    closing.style.opacity = ct ? ct.a.toFixed(3) : '0';
    if (ct && closing.textContent !== ct.text) closing.textContent = ct.text;

    flash.style.background = s.fadeOut > s.flash ? '#000' : '#fff';
    flash.style.opacity = Math.pow(Math.max(s.flash || 0, s.fadeOut || 0), 1.4).toFixed(3);
  };
}

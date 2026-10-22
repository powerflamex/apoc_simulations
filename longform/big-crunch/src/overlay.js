// DOM overlay: the opening title, THE BIG CRUNCH, the counter (THE BIG CRUNCH IN ... / NEXT: ...), the night sky's
// temperature, the telescope's label, the big word at each step, the white flash, and the closing lines.
// compose.js paints all of it into the frame.
import { COUNTERS, SKYROW, beatAt, SEC } from './timeline.js';
import { clamp, smooth } from './util.js';

const CLOSING = [
  [SEC.end + 6.5, SEC.end + 19.5, 'Or it never crunches at all.'],         // as the voice says "...never crunch" (362 s)
  [SEC.end + 26.5, SEC.out - 1, 'Which ending would you rather live through?'],
];

export function makeOverlay() {
  const counter = document.getElementById('counter');
  const sky = document.getElementById('sky'), skyV = sky.querySelector('.value');
  const scopek = document.getElementById('scopek');
  const flash = document.getElementById('flash');
  const title = document.getElementById('title');
  const name = document.getElementById('name');
  const cover = document.getElementById('cover');
  const stamp = document.getElementById('stamp'), stampk = document.getElementById('stampk');
  const closing = document.getElementById('closing');
  const here = document.getElementById('here');
  const rows = COUNTERS.map((c) => {
    const el = document.createElement('div');
    el.className = 'row';
    el.innerHTML = `<div class="label">${typeof c.label === 'string' ? c.label : ''}</div><div class="value"></div><div class="unit"></div>`;
    counter.appendChild(el);
    return { c, el, label: el.querySelector('.label'), value: el.querySelector('.value'), unit: el.querySelector('.unit') };
  });

  // t: the story moment shown (the flash-forward shows a later one), v: the video clock
  return function update(t, s, v) {
    if (window.__cover) {
      cover.style.opacity = '1';
      for (const el of [counter, sky, scopek, title, name, flash, stamp, stampk, closing, here]) el.style.opacity = '0';
      return;
    }
    for (const r of rows) {
      let a = Math.min(clamp((t - r.c.from) / 0.4), clamp((r.c.to - t) / 0.4));
      if (r.c.gap) a *= 1 - Math.min(clamp((t - r.c.gap[0]) / 0.05), clamp((r.c.gap[1] - t) / 0.4));
      r.el.style.opacity = a.toFixed(3);
      r.el.style.display = a > 0 ? 'block' : 'none';
      if (a > 0) {
        r.value.textContent = r.c.fmt(r.c.value(t));
        if (typeof r.c.label === 'function') { const lb = r.c.label(t); if (r.label.textContent !== lb) r.label.textContent = lb; }
        const u = r.c.unit(t);
        if (r.unit.textContent !== u) r.unit.textContent = u;
      }
    }
    const hide = Math.max(s.flash || 0, s.after || 0, s.scope || 0);
    counter.style.opacity = (1 - hide).toFixed(3);
    // the night sky's temperature (shown once the voice talks about it; in the flash-forward too)
    {
      const a = Math.min(clamp((t - SKYROW.from) / 0.5), clamp((SKYROW.to - t) / 0.4)) * (1 - hide);
      sky.style.opacity = a.toFixed(3);
      if (a > 0) { const x = SKYROW.value(t); if (skyV.textContent !== x) skyV.textContent = x; }
    }
    // under the telescope view: what the colour means
    {
      const a = s.scope || 0;
      scopek.style.opacity = a.toFixed(3);
      if (a > 0) {
        const txt = s.shift < -0.45 ? 'FLYING AWAY FROM US' : s.shift < 0.45 ? 'STOPPED' : 'COMING BACK';
        if (scopek.textContent !== txt) scopek.textContent = txt;
        scopek.style.color = s.shift < -0.45 ? '#ff9b80' : s.shift < 0.45 ? '#f4efe6' : '#9cc4ff';
      }
    }

    // the opening demonstration: YOU ARE HERE under the gold ring on our galaxy
    {
      const h = s.here;
      here.style.opacity = h ? h.here.toFixed(3) : '0';
      if (h) { here.style.left = `${(h.x - 300).toFixed(1)}px`; here.style.top = `${(h.y + 24).toFixed(1)}px`; }
    }

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
      // (in the opening demonstration they sit higher, clear of the universe's centre and YOU ARE HERE)
      const hi = v < SEC.walk;
      stamp.style.top = hi ? '215px' : ''; stampk.style.top = hi ? '175px' : '';
      if (stamp.textContent !== b.w) stamp.textContent = b.w;
      if (stampk.textContent !== b.k) stampk.textContent = b.k;
      const base = b.w.length > 14 ? 120 : 150;
      stamp.style.fontSize = `${(base * (1 + 0.25 * Math.exp(-b.dt * 8))).toFixed(1)}px`;
    }

    let ct = null;
    for (const [a0, b0, text] of CLOSING) if (v >= a0 && v <= b0) ct = { text, a: Math.min(clamp((v - a0) / 0.6), clamp((b0 - v) / 0.6)) };
    closing.style.opacity = ct ? ct.a.toFixed(3) : '0';
    if (ct && closing.textContent !== ct.text) closing.textContent = ct.text;

    flash.style.background = s.fadeOut > s.flash ? '#000' : '#fff';
    flash.style.opacity = Math.pow(Math.max(s.flash || 0, s.fadeOut || 0), 1.4).toFixed(3);
  };
}

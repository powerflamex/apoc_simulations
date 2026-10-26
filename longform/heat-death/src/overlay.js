// DOM overlay: the opening title, THE HEAT DEATH, the counter (YEARS FROM NOW ... / NEXT: ...), the temperature
// (Earth's, then empty space's), the telescope's label, the big word at each step, the white flash, and the closing
// lines.
// compose.js paints all of it into the frame.
import { COUNTERS, TEMPROW, beatAt, closingAt, SEC, FF_LEN } from './timeline.js';
import { clamp, smooth } from './util.js';


export function makeOverlay() {
  const counter = document.getElementById('counter');
  const sky = document.getElementById('sky'), skyV = sky.querySelector('.value'), skyL = sky.querySelector('.label');
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
        const u = v < FF_LEN ? '' : r.c.unit(t);   // (no NEXT line over the flash-forward)
        if (r.unit.textContent !== u) r.unit.textContent = u;
      }
    }
    const hide = Math.max(s.flash || 0, s.after || 0, s.scope || 0);
    counter.style.opacity = (1 - hide).toFixed(3);
    // the temperature: Earth's ground once it freezes, then empty space (in the flash-forward too)
    {
      const a = Math.min(clamp((t - TEMPROW.from) / 0.5), clamp((TEMPROW.to - t) / 0.4)) * (1 - hide);
      sky.style.opacity = a.toFixed(3);
      if (a > 0) {
        const x = TEMPROW.value(t); if (skyV.textContent !== x) skyV.textContent = x;
        const lb = TEMPROW.label(t); if (skyL.textContent !== lb) skyL.textContent = lb;
      }
    }
    // under the telescope view: what's happening to it
    {
      const a = s.scope || 0;
      scopek.style.opacity = a.toFixed(3);
      if (a > 0) {
        const txt = s.fadeGal > 0.85 ? 'GONE FOR GOOD' : s.redden > 0.4 ? 'REDDER. FAINTER.' : 'A FAR-OFF GALAXY';
        if (scopek.textContent !== txt) scopek.textContent = txt;
        scopek.style.color = s.fadeGal > 0.85 ? '#f4efe6' : s.redden > 0.4 ? '#ff9b80' : '#f4efe6';
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
    name.style.transform = `scale(${(1 + 0.12 * (1 - smooth(6.5, 7.2, v))).toFixed(4)})`;

    // the popup: a short phrase (no number, no small label); it rises in at a steady size, holds, fades
    const b = beatAt(t);
    const a = b && v > 6.6 ? smooth(0, 0.15, b.dt) * (1 - smooth(2.2, 2.9, b.dt)) * (1 - hide) : 0;
    stamp.style.opacity = a.toFixed(3); stampk.style.opacity = '0';
    if (a > 0) {
      if (stamp.textContent !== b.w) stamp.textContent = b.w;
      stamp.style.fontSize = `${b.w.length > 16 ? 112 : 136}px`;
      stamp.style.transform = `translateY(${(26 * (1 - smooth(0, 0.3, b.dt))).toFixed(1)}px)`;
    }

    const ct = closingAt(v);
    closing.style.opacity = ct ? ct.a.toFixed(3) : '0';
    if (ct && closing.textContent !== ct.text) closing.textContent = ct.text;

    flash.style.background = s.fadeOut > s.flash ? '#000' : '#fff';
    flash.style.opacity = Math.pow(Math.max(s.flash || 0, s.fadeOut || 0), 1.4).toFixed(3);
  };
}

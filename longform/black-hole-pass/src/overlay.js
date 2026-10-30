// DOM overlay: the opening title, the counter, the chapter stamps (56 DAYS LEFT ...), the gold popups, the captions,
// your phone's notification cards, the closing question and the white/black fades. compose.js paints it into the frame.
import { COUNTERS, CLOSING, noteAt, popupAt, stampAt, captionAt, CHAPTERS } from './timeline.js';
import { clamp, smooth } from './util.js';

const KINDS = {
  msg: { app: 'MESSAGES', icon: '#34c759' },
  me: { app: 'MESSAGES · SENT', icon: '#0a84ff' },
  alert: { app: 'EMERGENCY ALERT', icon: '#ff3b30' },
  news: { app: 'NEWS', icon: '#ff2d55' },
  flight: { app: 'AIRLINE', icon: '#0a6cff' },
};

export function makeOverlay() {
  const counter = document.getElementById('counter');
  const title = document.getElementById('title');
  const cover = document.getElementById('cover');
  const stamp = document.getElementById('stamp'), chap = document.getElementById('chap'), cap = document.getElementById('cap');
  const closing = document.getElementById('closing'), flash = document.getElementById('flash');
  const note = document.getElementById('note');
  const nApp = note.querySelector('.appname'), nIcon = note.querySelector('.icon'), nFrom = note.querySelector('.from'), nText = note.querySelector('.text'), nFail = note.querySelector('.fail');
  const rows = COUNTERS.map((c) => {
    const el = document.createElement('div');
    el.className = 'row';
    el.innerHTML = `<div class="label">${c.label}</div><div class="value"></div><div class="unit"></div>`;
    counter.appendChild(el);
    return { c, el, value: el.querySelector('.value'), unit: el.querySelector('.unit') };
  });
  const setText = (el, x) => { if (el.textContent !== x) el.textContent = x; };

  return function update(v, s) {
    if (window.__cover) {
      cover.style.opacity = '1';
      for (const el of [counter, title, flash, stamp, chap, cap, closing, note]) el.style.opacity = '0';
      return;
    }
    for (const r of rows) {
      const a = Math.min(clamp((v - r.c.from) / 0.4), clamp((r.c.to - v) / 0.5));
      r.el.style.opacity = a.toFixed(3);
      r.el.style.display = a > 0 ? 'block' : 'none';
      if (a > 0) { setText(r.value, r.c.fmt(r.c.value(v))); setText(r.unit, r.c.unit(v)); }
    }
    // (the counter stays out of the white-out and the closing)
    counter.style.opacity = (1 - Math.max(s.white, s.black)).toFixed(3);

    // the title over the flash-forward
    const ta = smooth(4.3, 5.0, v) > 0 ? 1 - smooth(4.3, 5.0, v) : 1;
    title.style.opacity = (v < 5 ? ta : 0).toFixed(3);

    // chapter stamp, then the gold popups (one at a time, steady size, rising in)
    const st = v > 5 ? stampAt(v) : null;
    const sa = st ? smooth(0, 0.25, st.dt) * (1 - smooth(2.1, 2.6, st.dt)) : 0;
    chap.style.opacity = sa.toFixed(3);
    if (st) { setText(chap, st.say); chap.style.transform = `translateY(${(10 * (1 - smooth(0, 0.3, st.dt))).toFixed(1)}px)`; }
    const p = v > 5 && !st ? popupAt(v) : null;
    const a = p ? smooth(0, 0.18, p.dt) * (1 - smooth(1.5, 1.9, p.dt)) : 0;
    stamp.style.opacity = a.toFixed(3);
    if (p) { setText(stamp, p.say); stamp.style.transform = `translateY(${(14 * (1 - smooth(0, 0.25, p.dt))).toFixed(1)}px)`; }

    const c = v > 5 ? captionAt(v) : null;
    cap.style.opacity = c ? c.a.toFixed(3) : '0';
    if (c) setText(cap, c.text);

    // the phone: a card slides down from the top right, holds, slides back up
    const n = v > 5 ? noteAt(v) : null;
    if (n) {
      const k = KINDS[n.kind];
      note.className = n.kind === 'alert' ? 'alert' : '';
      setText(nApp, k.app); nIcon.style.background = k.icon;
      setText(nFrom, n.from); setText(nText, n.text);
      setText(nFail, n.fail && n.dt > 1.6 ? `! ${n.fail}` : '');
      nFail.style.display = n.fail ? 'block' : 'none';
      const inn = smooth(0, 0.3, n.dt), out = smooth(n.dur - 0.35, n.dur, n.dt);
      note.style.opacity = (inn * (1 - out)).toFixed(3);
      // (a card that arrives while a chapter stamp is up sits lower, clear of the stamp, for its whole time)
      const clash = CHAPTERS.some((c) => c.stamp && c.v < n.v0 + n.dur && c.v + 2.6 > n.v0);
      note.style.top = clash ? '300px' : '48px';
      note.style.transform = `translateY(${(-40 * (1 - inn) - 30 * out).toFixed(1)}px)`;
    } else note.style.opacity = '0';

    let ct = null;
    for (const [a0, b0, text] of CLOSING) if (v >= a0 && v <= b0) ct = { text, a: Math.min(clamp((v - a0) / 0.8), clamp((b0 - v) / 0.6)) };
    closing.style.opacity = ct ? ct.a.toFixed(3) : '0';
    if (ct) setText(closing, ct.text);

    flash.style.background = s.black > 0.5 ? '#000' : '#fff';
    flash.style.opacity = Math.max(Math.pow(s.white, 1.2), s.black, s.blink || 0).toFixed(3);
  };
}

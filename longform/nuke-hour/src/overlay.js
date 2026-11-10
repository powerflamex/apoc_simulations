// DOM overlay: the opening title, the counter, the chapter stamps (5 MINUTES IN ...), the gold popups, the captions,
// your phone's notification cards, the closing question and the white/black fades. compose.js paints it into the frame.
import { COUNTERS, FF_COUNTER, FF_LEN, CLOSING, noteAt, popupAt, stampAt, captionAt, CHAPTERS } from './timeline.js';
import { clamp, smooth } from './util.js';

const KINDS = {
  msg: { app: 'MESSAGES', icon: '#34c759' },
  me: { app: 'MESSAGES · SENT', icon: '#0a84ff' },
  sys: { app: 'PHONE', icon: '#8e8e93' },
  radio: { app: 'EMERGENCY ALERT SYSTEM', icon: '#ff3b30' },
};

export function makeOverlay() {
  const counter = document.getElementById('counter');
  const title = document.getElementById('title');
  const cover = document.getElementById('cover');
  const stamp = document.getElementById('stamp'), chap = document.getElementById('chap'), cap = document.getElementById('cap');
  const closing = document.getElementById('closing'), flash = document.getElementById('flash');
  const note = document.getElementById('note');
  const nApp = note.querySelector('.appname'), nIcon = note.querySelector('.icon'), nFrom = note.querySelector('.from'), nText = note.querySelector('.text'), nFail = note.querySelector('.fail');
  const mk = () => {
    const el = document.createElement('div');
    el.className = 'row';
    el.innerHTML = '<div class="label"></div><div class="value"></div><div class="unit"></div>';
    counter.appendChild(el);
    return { el, label: el.querySelector('.label'), value: el.querySelector('.value'), unit: el.querySelector('.unit') };
  };
  const rows = COUNTERS.map((c) => ({ c, ...mk() }));
  const ffRow = mk();
  const setText = (el, x) => { if (el.textContent !== x) el.textContent = x; };

  return function update(v, s) {
    if (window.__cover) {
      cover.style.opacity = '1';
      for (const el of [counter, title, flash, stamp, chap, cap, closing, note]) el.style.opacity = '0';
      return;
    }
    // the counter (in the flash-forward: the blast's last seconds)
    const ff = v < FF_LEN;
    ffRow.el.style.display = ff ? 'block' : 'none';
    ffRow.el.style.opacity = ff ? (1 - smooth(4.75, 4.95, v)).toFixed(3) : '0';
    if (ff) { setText(ffRow.label, FF_COUNTER.label(v)); setText(ffRow.value, FF_COUNTER.value(v)); setText(ffRow.unit, FF_COUNTER.unit(v)); }
    for (const r of rows) {
      const a = ff ? 0 : Math.min(clamp((v - r.c.from) / 0.4), clamp((r.c.to - v) / 0.5));
      r.el.style.opacity = a.toFixed(3);
      r.el.style.display = a > 0 ? 'block' : 'none';
      if (a > 0) {
        setText(r.label, r.c.labelFn ? r.c.labelFn(v) : r.c.label);
        setText(r.value, r.c.fmt(r.c.value(v)));
        const un = r.c.unit(v);
        setText(r.unit, un);
        r.unit.style.display = un ? 'block' : 'none';
      }
    }
    // (the counter stays out of the flash's glare, the white-out and the closing)
    counter.style.opacity = (1 - Math.max(s.white, s.black, s.flashW * 1.2)).toFixed(3);

    // the title over the flash-forward
    title.style.opacity = (ff ? 1 - smooth(4.3, 4.6, v) : 0).toFixed(3);

    // chapter stamp, then the gold popups (one at a time, steady size, rising in)
    const st = !ff ? stampAt(v) : null;
    const sa = st ? smooth(0, 0.25, st.dt) * (1 - smooth(st.dur - 0.5, st.dur, st.dt)) : 0;
    chap.style.opacity = sa.toFixed(3);
    if (st) {
      setText(chap, st.say);
      chap.style.fontSize = st.small ? '70px' : '104px';
      chap.style.transform = `translateY(${(10 * (1 - smooth(0, 0.3, st.dt))).toFixed(1)}px)`;
    }
    const p = !ff && !st ? popupAt(v) : null;
    const a = p ? smooth(0, 0.18, p.dt) * (1 - smooth(1.5, 1.9, p.dt)) : 0;
    stamp.style.opacity = a.toFixed(3);
    if (p) {
      setText(stamp, p.say);
      stamp.style.fontSize = `${Math.min(76, 1700 / p.say.length).toFixed(0)}px`;
      stamp.style.transform = `translateY(${(14 * (1 - smooth(0, 0.25, p.dt))).toFixed(1)}px)`;
    }

    const c = !ff ? captionAt(v) : null;
    cap.style.opacity = c ? c.a.toFixed(3) : '0';
    if (c) setText(cap, c.text);
    s.capA = c ? c.a : 0;

    // the phone: a card slides down from the top right, holds, slides back up
    const n = !ff ? noteAt(v) : null;
    if (n) {
      const k = KINDS[n.kind];
      note.className = n.kind === 'radio' ? 'alert' : n.kind === 'sys' ? 'sys' : '';
      setText(nApp, k.app); nIcon.style.background = k.icon;
      setText(nFrom, n.from); setText(nText, n.text);
      const status = n.fail && n.dt > 1.4 ? (n.ok ? n.fail : `! ${n.fail}`) : n.fail && n.ok ? 'Sending...' : '';
      setText(nFail, status);
      nFail.style.color = n.ok ? '#3a8a3a' : '#ff3b30';
      nFail.style.display = n.fail ? 'block' : 'none';
      const inn = smooth(0, 0.3, n.dt), out = smooth(n.dur - 0.35, n.dur, n.dt);
      note.style.opacity = (inn * (1 - out)).toFixed(3);
      // (a card that arrives while a chapter stamp is up sits lower, clear of the stamp)
      const clash = CHAPTERS.some((ch) => ch.v < n.v0 + n.dur && ch.v + 3.4 > n.v0);
      note.style.top = clash ? '300px' : '48px';
      note.style.transform = `translateY(${(-40 * (1 - inn) - 30 * out).toFixed(1)}px)`;
    } else note.style.opacity = '0';

    let ct = null;
    for (const [a0, b0, text] of CLOSING) if (v >= a0 && v <= b0) ct = { text, a: Math.min(clamp((v - a0) / 0.8), clamp((b0 - v) / 0.6)) };
    closing.style.opacity = ct ? ct.a.toFixed(3) : '0';
    if (ct) setText(closing, ct.text);

    flash.style.background = s.black > 0.5 ? '#000' : '#fff';
    flash.style.opacity = Math.max(Math.pow(s.white, 1.2), s.black).toFixed(3);
  };
}

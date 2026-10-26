// Paints the WebGL frame plus the HTML overlay (title, counter, captions, flash, end card) into one
// 2D canvas. Layout comes straight from the DOM (line breaks, positions, opacity, blur, text-shadow),
// so the encoded frame matches the preview without screenshots.
const W = 1920, H = 1080;

export async function makeCompositor(glCanvas, stage) {
  // lining + tabular digits for the counter (canvas can't set font-variant-numeric itself)
  const num = new FontFace('CormorantNum',
    "url('node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-normal.woff2')",
    { weight: '500', style: 'normal', featureSettings: '"lnum" 1, "tnum" 1' });
  await num.load();
  document.fonts.add(num);
  // (and the bold weight, for the thumbnail's label)
  const numB = new FontFace('CormorantNum',
    "url('node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-700-normal.woff2')",
    { weight: '700', style: 'normal', featureSettings: '"lnum" 1, "tnum" 1' });
  await numB.load();
  document.fonts.add(numB);

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  canvas.id = 'composite';
  canvas.style.cssText = `position:absolute;inset:0;width:${W}px;height:${H}px;`;
  glCanvas.after(canvas);
  stage.classList.add('compositing');
  const ctx = canvas.getContext('2d', { alpha: false });
  const overlayEls = [...stage.children].filter((e) => e.tagName !== 'CANVAS');

  const parseShadows = (s) => {
    if (!s || s === 'none') return [];
    // "rgba(0, 0, 0, 0.55) 0px 2px 18px, rgba(0, 0, 0, 0.6) 0px 1px 3px"
    return s.split(/,(?![^(]*\))/).map((part) => {
      const color = (part.match(/rgba?\([^)]*\)|#[0-9a-f]+/i) || ['rgba(0,0,0,1)'])[0];
      const nums = part.replace(color, '').trim().split(/\s+/).map(parseFloat);
      return { color, x: nums[0] || 0, y: nums[1] || 0, blur: nums[2] || 0 };
    });
  };
  const blurOf = (f) => { const m = /blur\(([\d.]+)px\)/.exec(f || ''); return m ? parseFloat(m[1]) : 0; };

  function lines(el, textNode, map) {
    // group words into rendered lines using their client rects
    const text = textNode.textContent;
    const out = [];
    const re = /\S+/g;
    let m;
    const range = document.createRange();
    while ((m = re.exec(text))) {
      range.setStart(textNode, m.index);
      range.setEnd(textNode, m.index + m[0].length);
      const r = range.getClientRects()[0];
      if (!r) continue;
      const top = Math.round(r.top);
      let line = out.find((l) => Math.abs(l.top - top) < 3);
      if (!line) { line = { top, left: r.left, words: [] }; out.push(line); }
      line.left = Math.min(line.left, r.left);
      line.words.push(m[0]);
    }
    return out.map((l) => ({ x: map.x(l.left), top: map.y(l.top), text: l.words.join(' ') }));
  }

  function drawText(el, cs, alpha, blur, map) {
    const node = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    if (!node) return;
    const tabular = /tabular-nums/.test(cs.fontVariantNumeric);
    const family = tabular ? 'CormorantNum' : 'Cormorant';
    const size = parseFloat(cs.fontSize) * map.k;
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${size / map.k}px ${family}`;
    ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    const shadows = parseShadows(cs.textShadow);
    const fill = cs.color;
    for (const ln of lines(el, node, map)) {
      const asc = ctx.measureText(ln.text).fontBoundingBoxAscent;
      const y = ln.top + asc;
      ctx.globalAlpha = alpha;
      ctx.filter = blur > 0 ? `blur(${blur}px)` : 'none';
      // CSS paints the first shadow on top, so draw them in reverse; offset trick = shadow without the glyphs
      for (let i = shadows.length - 1; i >= 0; i--) {
        const sh = shadows[i];
        ctx.shadowColor = sh.color;
        ctx.shadowBlur = sh.blur;
        ctx.shadowOffsetX = sh.x + 20000;
        ctx.shadowOffsetY = sh.y;
        ctx.fillStyle = '#000';
        ctx.fillText(ln.text, ln.x - 20000, y);
      }
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      ctx.fillStyle = fill;
      ctx.fillText(ln.text, ln.x, y);
    }
  }

  function walk(el, alpha, blur, map) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return;
    alpha *= parseFloat(cs.opacity);
    if (alpha <= 0.001) return;
    blur += blurOf(cs.filter);
    const bg = cs.backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
      const r = el.getBoundingClientRect();
      ctx.globalAlpha = alpha;
      ctx.filter = 'none';
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = bg;
      ctx.fillRect(map.x(r.left), map.y(r.top), r.width / map.k, r.height / map.k);
    }
    drawText(el, cs, alpha, blur, map);
    for (const c of el.children) walk(c, alpha, blur, map);
  }

  return {
    canvas,
    paint() {
      ctx.globalAlpha = 1;
      ctx.filter = 'none';
      ctx.shadowColor = 'transparent';
      ctx.drawImage(glCanvas, 0, 0, W, H);
      const sr = stage.getBoundingClientRect();
      const k = sr.width / W;
      const map = { k, x: (px) => (px - sr.left) / k, y: (py) => (py - sr.top) / k };
      for (const el of overlayEls) walk(el, 1, 0, map);
      ctx.globalAlpha = 1;
      ctx.filter = 'none';
    },
  };
}

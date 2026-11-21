// The word, one row per stage ("e", "em", "emb", "embi"): white blackletter with its own soft glow, on black.
import * as THREE from 'three';

export const WORD = 'embi';

export async function buildText() {
  const font = new FontFace('Pirata', 'url(assets/PirataOne-Regular.ttf)');
  await font.load(); document.fonts.add(font);
  const RW = 1024, RH = 256, c = document.createElement('canvas');
  c.width = RW; c.height = RH * WORD.length;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
  x.font = '150px Pirata'; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let i = 0; i < WORD.length; i++) {
    const s = WORD.slice(0, i + 1), cy = RH * i + RH / 2 + 4;
    x.save(); x.beginPath(); x.rect(0, RH * i, RW, RH); x.clip();
    x.globalCompositeOperation = 'lighter';
    // wide soft halo, tighter glow, then the letters themselves
    for (const [blur, alpha, n] of [[80, 0.5, 4], [40, 0.7, 3], [16, 0.9, 2], [4, 1, 1]]) {
      x.shadowColor = `rgba(255,255,255,${alpha})`; x.shadowBlur = blur; x.fillStyle = `rgba(255,255,255,${blur > 10 ? 0.02 : 1})`;
      for (let k = 0; k < n; k++) x.fillText(s, RW / 2, cy);
    }
    x.shadowBlur = 0; x.fillStyle = '#fff'; x.fillText(s, RW / 2, cy);
    x.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}

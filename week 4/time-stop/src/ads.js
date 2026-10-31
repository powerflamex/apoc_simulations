// The screens of Times Square, painted once into a canvas atlas (4 x 4 cells of 512 px). Made-up brands only.
// Cells 0-9: ads; 10-11: lit shop fronts; 12-13: the news (redrawn when the story's headline changes);
// 14-15: more ads. The news cells are drawn by news(ep): 0 an ordinary evening, 1 the manhunt, 2 the gold.
import * as THREE from 'three';
import { rng } from './util.js';

export const CELL = 512, GRID = 4;
const BRANDS = ['FIZZ', 'NOVA', 'LUMA', 'ORBIT', 'VOLT', 'ZEST', 'PULSE', 'KINGS', 'SUMMIT', 'AURA', 'BLAZE', 'MOJO'];

function grad(ctx, x, y, w, h, stops, vertical = true) {
  const g = vertical ? ctx.createLinearGradient(x, y, x, y + h) : ctx.createLinearGradient(x, y, x + w, y);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}
function word(ctx, text, x, y, size, color, weight = 900, italic = false, font = 'Arial Black, Arial, sans-serif') {
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function paintAd(ctx, i, x0, y0) {
  const R = rng(900 + i * 17);
  const S = CELL;
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, S, S); ctx.clip();
  const palettes = [
    ['#ff2a6d', '#7a0cc4', '#1b0844'], ['#00e5ff', '#0050ff', '#06104a'], ['#ffd60a', '#ff7b00', '#a1001a'],
    ['#39ff14', '#00a86b', '#002a2a'], ['#ff00c8', '#ff6a00', '#ffd400'], ['#ffffff', '#c9d6ff', '#3a4cff'],
    ['#ff3b30', '#b00020', '#200008'], ['#7cf9ff', '#b26bff', '#ff5ec8'], ['#ffe066', '#ff9f1c', '#2ec4b6'],
    ['#00f5d4', '#00bbf9', '#9b5de5'],
  ];
  const p = palettes[i % palettes.length];
  grad(ctx, x0, y0, S, S, p, R() < 0.6);
  // shapes: rings, stripes, a big disc, a can or a phone
  const kind = i % 5;
  ctx.globalAlpha = 0.9;
  if (kind === 0) {
    for (let k = 0; k < 6; k++) { ctx.strokeStyle = k % 2 ? '#ffffff' : p[0]; ctx.lineWidth = 18; ctx.beginPath(); ctx.arc(x0 + S * 0.72, y0 + S * 0.38, 40 + k * 34, 0, Math.PI * 2); ctx.stroke(); }
  } else if (kind === 1) {
    for (let k = -4; k < 8; k++) { ctx.fillStyle = k % 2 ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.moveTo(x0 + k * 80, y0); ctx.lineTo(x0 + k * 80 + 60, y0); ctx.lineTo(x0 + k * 80 + 260, y0 + S); ctx.lineTo(x0 + k * 80 + 200, y0 + S); ctx.fill(); }
  } else if (kind === 2) {
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x0 + S * 0.5, y0 + S * 0.36, S * 0.26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p[1]; ctx.beginPath(); ctx.arc(x0 + S * 0.5, y0 + S * 0.36, S * 0.2, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 3) {
    // a soda can
    const cx = x0 + S * 0.5, cy = y0 + S * 0.38;
    grad(ctx, cx - 70, cy - 130, 140, 260, ['#dddddd', '#ffffff', '#888888', '#eeeeee'], false);
    ctx.fillStyle = p[0]; ctx.fillRect(cx - 70, cy - 60, 140, 120);
    word(ctx, BRANDS[i % BRANDS.length][0], cx, cy, 90, '#ffffff');
  } else {
    // a phone
    const cx = x0 + S * 0.68, cy = y0 + S * 0.4;
    ctx.fillStyle = '#111'; ctx.fillRect(cx - 80, cy - 160, 160, 320);
    grad(ctx, cx - 70, cy - 148, 140, 296, [p[0], p[2]]);
  }
  ctx.globalAlpha = 1;
  const brand = BRANDS[i % BRANDS.length];
  word(ctx, brand, x0 + S / 2, y0 + S * 0.78, 128, '#ffffff', 900, i % 3 === 0);
  if (R() < 0.6) word(ctx, ['NEW', 'NOW ON', 'LIVE', 'SALE', '24/7', 'TONIGHT'][Math.floor(R() * 6)], x0 + S / 2, y0 + S * 0.92, 44, 'rgba(255,255,255,0.9)', 700);
  ctx.restore();
}
function paintShop(ctx, i, x0, y0) {
  const S = CELL;
  // a lit shop window: warm interior, shelves, a sign band at the top
  grad(ctx, x0, y0, S, S, i ? ['#fff1d0', '#ffcf8a', '#c47a3a'] : ['#e6f6ff', '#9fd2ff', '#4a7ab0']);
  ctx.fillStyle = 'rgba(60,30,10,0.35)';
  for (let k = 0; k < 4; k++) ctx.fillRect(x0 + 30, y0 + 170 + k * 80, S - 60, 10);
  for (let k = 0; k < 26; k++) { ctx.fillStyle = `hsl(${(k * 47) % 360},70%,${45 + (k % 3) * 10}%)`; ctx.fillRect(x0 + 40 + (k % 9) * 50, y0 + 120 + Math.floor(k / 9) * 80, 36, 46); }
  ctx.fillStyle = i ? '#a0141e' : '#103a7a'; ctx.fillRect(x0, y0, S, 90);
  word(ctx, i ? 'DELI · PIZZA' : 'GIFTS · NYC', x0 + S / 2, y0 + 47, 58, '#ffffff', 800);
  // the window's mullions
  ctx.fillStyle = '#1a1a1a';
  for (let k = 0; k <= 4; k++) ctx.fillRect(x0 + k * (S / 4) - 6, y0 + 90, 12, S - 90);
}
// the news: a red BREAKING band, a headline, a ticker
const NEWS = [
  [['TONIGHT', 'RAIN UNTIL MIDNIGHT'], ['LIVE', 'TIMES SQUARE']],
  [['BREAKING', '$150 MILLION GONE', 'NO SUSPECTS'], ['MANHUNT', 'NO DNA. NO PRINTS.', 'NOTHING ON CAMERA']],
  [['BREAKING', '$820 BILLION IN GOLD', 'GONE IN 0 SECONDS'], ['NO DNA', 'NO SUSPECTS', 'NOBODY SAW A THING']],
];
function paintNews(ctx, cell, ep, x0, y0) {
  const S = CELL;
  const n = NEWS[ep][cell];
  grad(ctx, x0, y0, S, S, ep === 0 ? ['#0a2a6a', '#06163a'] : ['#2a0606', '#100204']);
  ctx.fillStyle = ep === 0 ? '#1b6bff' : '#e3121b';
  ctx.fillRect(x0, y0 + 40, S, 110);
  word(ctx, n[0], x0 + S / 2, y0 + 96, 86, '#ffffff', 900);
  word(ctx, n[1], x0 + S / 2, y0 + 250, n[1].length > 14 ? 50 : 66, '#ffffff', 900);
  if (n[2]) word(ctx, n[2], x0 + S / 2, y0 + 345, n[2].length > 14 ? 46 : 58, ep === 0 ? '#bcd4ff' : '#ffd23a', 900);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x0, y0 + S - 70, S, 70);
  word(ctx, ep === 0 ? 'WEATHER · SPORTS · LIVE' : 'POLICE: “IT’S LIKE THEY WERE NEVER THERE”', x0 + S / 2, y0 + S - 35, 28, '#111', 800);
}

export function makeAds() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = CELL * GRID;
  const ctx = cv.getContext('2d');
  for (let i = 0; i < 16; i++) {
    const x0 = (i % GRID) * CELL, y0 = Math.floor(i / GRID) * CELL;
    if (i === 10 || i === 11) paintShop(ctx, i - 10, x0, y0);
    else if (i === 12 || i === 13) paintNews(ctx, i - 12, 0, x0, y0);
    else paintAd(ctx, i, x0, y0);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  let ep = 0;
  return {
    tex,
    news(e) {
      if (e === ep) return;
      ep = e;
      for (const c of [0, 1]) paintNews(ctx, c, e, ((12 + c) % GRID) * CELL, Math.floor((12 + c) / GRID) * CELL);
      tex.needsUpdate = true;
    },
  };
}

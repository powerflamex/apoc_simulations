// YouTube thumbnails for "6 more ways the world could end" (1280x720 JPEGs), drawn in headless Chrome over the clean
// climax frames that cards.sh renders (clips/th1..th6.png):  node longform/six/thumbs.mjs  -> longform/out/6-more-ways_thumb_A.jpg, _B.jpg
// Built from what works in the niche (research/longform_wave_2026-10-18.md): a bright real frame, one giant number, few words.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(HERE, '..', '..', 'week 1', 'speed-doubles', 'package.json'));
const puppeteer = require('puppeteer-core');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const img = (n) => pathToFileURL(path.join(HERE, 'clips', `th${n}.png`)).href;

const css = `
  html, body { margin: 0; width: 1280px; height: 720px; overflow: hidden; background: #000; font-family: 'Arial Black', 'Arial', sans-serif; }
  .bg { position: absolute; inset: 0; background-size: cover; background-position: center; filter: saturate(1.25) contrast(1.12); }
  .t { position: absolute; color: #fff; font-weight: 900; line-height: .92; letter-spacing: -.01em;
       -webkit-text-stroke: 3px #000; paint-order: stroke fill; text-shadow: 0 6px 0 rgba(0,0,0,.55), 0 10px 40px rgba(0,0,0,.8); }
  .y { color: #ffd23f; }
`;
const thumbs = {
  // A: Moon rubble raining on the burning city at night, a giant 6
  A: `<div class="bg" style="background-image:url('${img(3)}');background-position:center 40%"></div>
      <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.72),rgba(0,0,0,0) 58%)"></div>
      <div class="t y" style="left:46px;top:40px;font-size:290px">6</div>
      <div class="t" style="left:46px;top:330px;font-size:84px">MORE WAYS<br>THE WORLD<br><span class="y">ENDS</span></div>`,
  // B: the whole universe squeezed into one white ball (the Big Crunch)
  B: `<div class="bg" style="background-image:url('${img(1)}');background-position:center"></div>
      <div class="t" style="left:0;right:0;top:34px;text-align:center;font-size:82px;white-space:nowrap">6 MORE WAYS THE WORLD</div>
      <div class="t y" style="left:0;right:0;top:590px;text-align:center;font-size:112px">COULD END</div>`,
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--allow-file-access-from-files'], defaultViewport: { width: 1280, height: 720 } });
const page = await browser.newPage();
const out = path.join(HERE, '..', 'out');
fs.mkdirSync(out, { recursive: true });
for (const [name, html] of Object.entries(thumbs)) {
  const tmp = path.join(HERE, 'clips', '_thumb.html');
  fs.writeFileSync(tmp, `<!doctype html><html><head><style>${css}</style></head><body>${html}</body></html>`);
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
  await page.screenshot({ path: path.join(out, `6-more-ways_thumb_${name}.jpg`), type: 'jpeg', quality: 92 });
}
fs.rmSync(path.join(HERE, 'clips', '_thumb.html'), { force: true });
await browser.close();
console.log('thumbnails written to', out);

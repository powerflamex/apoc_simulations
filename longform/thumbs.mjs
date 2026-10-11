// YouTube thumbnails for the long-form video (1280x720 JPEGs), drawn in headless Chrome over frames from the clean
// montage clips:  node longform/thumbs.mjs  -> longform/out/thumb_A.jpg, thumb_B.jpg
// (needs clips/full1..7.png: frames from the clean clips, see cards.sh)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(HERE, '..', 'speed-doubles', 'package.json'));
const puppeteer = require('puppeteer-core');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const img = (n) => pathToFileURL(path.join(HERE, 'clips', `full${n}.png`)).href;

const css = `
  html, body { margin: 0; width: 1280px; height: 720px; overflow: hidden; background: #000; font-family: 'Arial Black', 'Arial', sans-serif; }
  .bg { position: absolute; inset: 0; background-size: cover; background-position: center; filter: saturate(1.25) contrast(1.12); }
  .t { position: absolute; color: #fff; font-weight: 900; line-height: .92; letter-spacing: -.01em;
       -webkit-text-stroke: 3px #000; paint-order: stroke fill; text-shadow: 0 6px 0 rgba(0,0,0,.55), 0 10px 40px rgba(0,0,0,.8); }
  .y { color: #ffd23f; }
  .tag { position: absolute; white-space: nowrap; background: #e02424; color: #fff; font-weight: 900; padding: 10px 22px 8px; transform: rotate(-3deg);
         box-shadow: 0 8px 24px rgba(0,0,0,.6); }
`;
const thumbs = {
  // A: the black hole over the city, big countdown hook
  A: `<div class="bg" style="background-image:url('${img(5)}');background-position:center 30%"></div>
      <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.75),rgba(0,0,0,0) 62%)"></div>
      <div class="t" style="left:46px;top:70px;font-size:250px">7</div>
      <div class="t" style="left:46px;top:310px;font-size:92px">WAYS<br>EARTH<br><span class="y">ENDS</span></div>`,
  // B: Earth wrapped in rings of light, "#1 is insane" style tag
  B: `<div class="bg" style="background-image:url('${img(6)}');background-position:center"></div>
      <div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,rgba(0,0,0,0) 30%,rgba(0,0,0,.7) 85%)"></div>
      <div class="t" style="left:0;right:0;top:36px;text-align:center;font-size:104px">7 WAYS THE WORLD</div>
      <div class="t y" style="left:0;right:0;top:572px;text-align:center;font-size:120px">COULD END</div>
      <div class="tag" style="right:60px;top:200px;font-size:44px">#1 IS INSANE</div>`,
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--allow-file-access-from-files'], defaultViewport: { width: 1280, height: 720 } });
const page = await browser.newPage();
const out = path.join(HERE, 'out');
fs.mkdirSync(out, { recursive: true });
for (const [name, html] of Object.entries(thumbs)) {
  const tmp = path.join(HERE, 'clips', '_thumb.html');
  fs.writeFileSync(tmp, `<!doctype html><html><head><style>${css}</style></head><body>${html}</body></html>`);
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
  await page.screenshot({ path: path.join(out, `thumb_${name}.jpg`), type: 'jpeg', quality: 92 });
}
fs.rmSync(path.join(HERE, 'clips', '_thumb.html'), { force: true });
await browser.close();
console.log('thumbnails written to', out);

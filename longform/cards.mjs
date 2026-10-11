// Draws the long-form intro/outro text as transparent 1920x1080 PNGs in the videos' own font (Cormorant
// Garamond), using the same headless Chrome as the renders:  node longform/cards.mjs  -> longform/clips/*.png
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(HERE, '..', 'speed-doubles', 'package.json'));
const puppeteer = require('puppeteer-core');
const FONTS = path.join(HERE, '..', 'speed-doubles', 'node_modules', '@fontsource', 'cormorant-garamond', 'files');
const OUT = path.join(HERE, 'clips');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const font = (w, st) => pathToFileURL(path.join(FONTS, `cormorant-garamond-latin-${w}-${st}.woff2`)).href;

const css = `
  @font-face { font-family: C; font-weight: 500; font-style: normal; src: url('${font(500, 'normal')}'); }
  @font-face { font-family: C; font-weight: 600; font-style: normal; src: url('${font(600, 'normal')}'); }
  @font-face { font-family: C; font-weight: 500; font-style: italic; src: url('${font(500, 'italic')}'); }
  html, body { margin: 0; width: 1920px; height: 1080px; background: transparent; color: #f4efe6; font-family: C, serif; }
  .sh { text-shadow: 0 4px 40px rgba(0,0,0,.85), 0 2px 6px rgba(0,0,0,.9); }
  .c { position: absolute; left: 0; right: 0; text-align: center; }
`;
const cards = {
  // the countdown number in the corner of each montage shot
  ...Object.fromEntries([7, 6, 5, 4, 3, 2, 1].map((n) => [`num${n}`, `<div class="sh" style="position:absolute;right:80px;bottom:60px;font:600 120px C;color:#f1c978">#${n}</div>`])),
  title: `<div class="c sh" style="top:350px;font:600 34px C;letter-spacing:.5em;opacity:.9">SIMULATED · RANKED</div>
          <div class="c sh" style="top:410px;font:600 150px/1 C;letter-spacing:.02em">7 ways the world</div>
          <div class="c sh" style="top:560px;font:italic 500 150px/1 C;color:#f1c978">could end</div>`,
  outro: `<div class="c sh" style="top:150px;font:italic 500 92px C">Which one scares you most?</div>
          <div class="c sh" style="top:290px;font:600 30px C;letter-spacing:.4em;opacity:.85">TELL ME IN THE COMMENTS</div>
          <div class="c sh" style="top:860px;font:600 36px C;letter-spacing:.35em;color:#f1c978">SUBSCRIBE FOR MORE</div>`,
  ...Object.fromEntries([7, 6, 5, 4, 3, 2, 1].map((n, i) => [`onum${n}`, `<div class="sh" style="position:absolute;left:${60 + i * 260 + 122}px;top:680px;width:0;text-align:center"><span style="display:inline-block;transform:translateX(-50%);font:600 54px C;color:#f1c978">#${n}</span></div>`])),
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--allow-file-access-from-files'], defaultViewport: { width: 1920, height: 1080 } });
const page = await browser.newPage();
fs.mkdirSync(OUT, { recursive: true });
for (const [name, html] of Object.entries(cards)) {
  // load from a file:// page so the file:// fonts are allowed
  const tmp = path.join(OUT, '_card.html');
  fs.writeFileSync(tmp, `<!doctype html><html><head><style>${css}</style></head><body>${html}</body></html>`);
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
  await page.evaluate(async () => { await document.fonts.ready; for (const f of document.fonts) await f.load(); });
  const ok = await page.evaluate(() => [...document.fonts].some((f) => f.status === 'loaded'));
  if (!ok) throw new Error('Cormorant did not load');
  await page.screenshot({ path: path.join(OUT, `${name}.png`), omitBackground: true });
}
await browser.close();
fs.rmSync(path.join(OUT, '_card.html'), { force: true });
console.log('cards written to', OUT);

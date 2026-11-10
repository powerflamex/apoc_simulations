// Draws the text for "6 more ways the world could end" as transparent 1920x1080 PNGs in the videos' own font
// (Cormorant Garamond), using the same headless Chrome as the renders:  node longform/six/cards.mjs  -> longform/six/clips/*.png
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SD = path.join(HERE, '..', '..', 'week 1', 'speed-doubles');
const require = createRequire(path.join(SD, 'package.json'));
const puppeteer = require('puppeteer-core');
const FONTS = path.join(SD, 'node_modules', '@fontsource', 'cormorant-garamond', 'files');
const OUT = path.join(HERE, 'clips');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const font = (w, st) => pathToFileURL(path.join(FONTS, `cormorant-garamond-latin-${w}-${st}.woff2`)).href;

const css = `
  @font-face { font-family: C; font-weight: 500; font-style: normal; src: url('${font(500, 'normal')}'); }
  @font-face { font-family: C; font-weight: 600; font-style: normal; src: url('${font(600, 'normal')}'); }
  @font-face { font-family: C; font-weight: 500; font-style: italic; src: url('${font(500, 'italic')}'); }
  html, body { margin: 0; width: 1920px; height: 1080px; background: transparent; color: #f4efe6; font-family: C, serif; }
  .sh { text-shadow: 0 4px 40px rgba(0,0,0,.9), 0 2px 6px rgba(0,0,0,.95); }
  .c { position: absolute; left: 0; right: 0; text-align: center; }
`;
const NUMS = [6, 5, 4, 3, 2, 1];
const cards = {
  // frame 0: the title over the flash-forward, and the promise under it
  title: `<div class="c sh" style="top:96px;font:600 132px/1 C;letter-spacing:.01em">6 more ways the world</div>
          <div class="c sh" style="top:226px;font:italic 500 132px/1 C;color:#f1c978">could end</div>`,
  promise: `<div class="c sh" style="top:880px;font:italic 500 66px C">In 6 minutes, the whole universe ends.</div>`,
  // the countdown number at the start of each part (top centre, above the part's own question)
  ...Object.fromEntries(NUMS.map((n) => [`num${n}`, `<div class="c sh" style="top:70px;font:600 150px/1 C;color:#f1c978">#${n}</div>`])),
  outro: `<div class="c sh" style="top:150px;font:italic 500 92px C">Which one scares you most?</div>
          <div class="c sh" style="top:290px;font:600 30px C;letter-spacing:.4em;opacity:.85">TELL ME IN THE COMMENTS</div>
          <div class="c sh" style="top:860px;font:600 36px C;letter-spacing:.35em;color:#f1c978">SUBSCRIBE FOR MORE</div>`,
  // numbers under the six thumbnails in the outro (thumbnails 280 wide, 300 apart, starting at x=60)
  ...Object.fromEntries(NUMS.map((n, i) => [`onum${n}`, `<div class="sh" style="position:absolute;left:${60 + i * 300 + 140}px;top:690px;width:0;text-align:center"><span style="display:inline-block;transform:translateX(-50%);font:600 54px C;color:#f1c978">#${n}</span></div>`])),
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

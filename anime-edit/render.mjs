// Render the edit: headless Chrome draws every frame, ffmpeg joins them with the song.
//   node render.mjs                     -> out/embi_edit_1080x1920_60fps.mp4
//   node render.mjs --stills 0.5,2.9    -> stills/t_0.50.png ... (video seconds)
//   node render.mjs --fps 30            (default 60)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { startServer, VENDOR } from './server.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const puppeteer = createRequire(path.join(VENDOR, 'x.js'))('puppeteer-core');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const FPS = Number(arg('fps', 60));
const STILLS = arg('stills', null);
const OUT = arg('out', path.join(ROOT, 'out', `embi_edit_1080x1920_${FPS}fps.mp4`));
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));

const server = await startServer(0);
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-driver-bug-workarounds',
    '--force-high-performance-gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--hide-scrollbars', '--mute-audio'],
  defaultViewport: { width: 1080, height: 1920, deviceScaleFactor: 1 }, protocolTimeout: 0,
});
const page = await browser.newPage();
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warn') && !m.text().includes('404')) console.log('[page]', m.text().slice(0, 600)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/?render=1${arg('q', '')}`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true || window.__error', { timeout: 300000 });
const err = await page.evaluate('window.__error');
if (err) { console.error(err); await browser.close(); server.close(); process.exit(1); }
console.log('gpu:', await page.evaluate('window.__glInfo'));
const DUR = await page.evaluate('window.__duration');
const grab = (t, type, q) => page.evaluate((t, type, q) => { window.renderFrame(t); return document.getElementById('c').toDataURL(type, q).split(',')[1]; }, t, type, q);

if (STILLS) {
  fs.mkdirSync(path.join(ROOT, 'stills'), { recursive: true });
  for (const s of STILLS.split(',').map(Number)) {
    const f = path.join(ROOT, 'stills', `t_${s.toFixed(2)}.png`);
    fs.writeFileSync(f, Buffer.from(await grab(s, 'image/png'), 'base64'));
    console.log('still', f);
  }
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const N = Math.round(DUR * FPS), t0 = Date.now();
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-i', path.join(ROOT, 'assets', 'song_tagged.wav'), '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-maxrate', '32M', '-bufsize', '64M', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-threads', '4', '-c:a', 'aac', '-b:a', '256k', '-t', String(DUR), '-movflags', '+faststart', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c ? rej(new Error('ffmpeg exit ' + c)) : res())));
  for (let i = 0; i < N; i++) {
    const buf = Buffer.from(await grab(i / FPS, 'image/jpeg', 0.97), 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 60 === 0) console.log(`frame ${i}/${N}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end(); await done;
  console.log('wrote', OUT, `in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
await browser.close(); server.close();

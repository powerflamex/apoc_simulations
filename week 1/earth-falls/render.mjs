// Offline renderer: drives the page frame-by-frame in headless Chrome and encodes with ffmpeg.
//   node render.mjs                         -> out/<sim>_1080x1920_60fps.mp4 (with soundtrack)
//   node render.mjs --draft                 -> half-res 30fps quick preview
//   node render.mjs --stills 5,20,35        -> stills/t_XX.png   (video time; the story starts at STORY_START)
//   node render.mjs --cover 60              -> stills/cover.png (cover art over the frame at video time 60)
//   node render.mjs --no-audio              -> video only
//   node render.mjs --grain                 -> keep the film-grain effect (looks worse after TikTok compression)
//   node render.mjs --screenshot            -> old path: capture page screenshots + x264 (~10x slower)
//   node render.mjs --workers 1 --software  -> the old, slower settings (one Chrome, H.264 on the CPU)
//   node render.mjs --upload out/x_tiktok.mp4 [--watermark logo.png]
//                                           -> also make the upload copy (x264 CRF 18) piece by piece while the
//                                              later pieces render: the GPU draws, the idle CPU encodes
// Default path: each frame is composited into one canvas in the page and encoded there with WebCodecs
// (H.264 High), so only small compressed chunks leave Chrome. Speed: the GPU draws a frame in a few ms but the
// H.264 encode and the hand-offs take far longer, so two Chromes render alternate segments side by side
// (--workers), the encode runs on the GPU's video encoder when there is one (falls back to the CPU), and
// frames go back and forth in batches.
// Crash-safe: renders 10 s segments into out/.segments/, keeps finished ones, relaunches Chrome
// if it dies, and simply resumes when re-run.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { startServer } from './server.mjs';
import { makeSoundtrack } from './audio.mjs';
import { STORY_START, VIDEO_DURATION } from './src/timeline.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const NAME = path.basename(ROOT);
const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const has = (name) => args.includes(`--${name}`);

const DRAFT = has('draft');
const FPS = Number(arg('fps', DRAFT ? 30 : 60));
const START = Number(arg('start', 0));
const END = Number(arg('end', VIDEO_DURATION));
const COVER = arg('cover', null);
const SCALE = DRAFT ? 0.5 : 1;
const STILLS = arg('stills', COVER);
const NO_AUDIO = has('no-audio');
const SCREENSHOT = has('screenshot') || has('png');
const WORKERS = Math.max(1, Number(arg('workers', 2)));
let USE_HW = !has('software');    // GPU video encoder if Chrome has one; switched off for good after any failure
const BATCH = 15;                 // frames per round trip to the page
const BITRATE = Number(arg('mbps', DRAFT ? 12 : 50)) * 1e6;
const FORMAT = has('png') ? 'png' : 'jpeg';
const QUALITY = Number(arg('quality', 100));
const PRESET = arg('preset', DRAFT ? 'veryfast' : 'medium');
const SEG_SECONDS = Number(arg('seg', 10));
const OUT = arg('out', path.join(ROOT, 'out', DRAFT ? `${NAME}_draft.mp4` : `${NAME}_1080x1920_60fps.mp4`));
const CHROME = arg('chrome', [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p)));

const server = await startServer(0); // any free port
const PORT = server.address().port;

// one headless Chrome per worker
async function launch() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: [
      '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl',
      '--disable-gpu-driver-bug-workarounds', '--force-high-performance-gpu',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--hide-scrollbars', '--mute-audio',
    ],
    defaultViewport: { width: 1080, height: 1920, deviceScaleFactor: 1 },
    protocolTimeout: 0,
  });
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) console.log('[page]', m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${PORT}/?render=1${has('grain') ? '&grain=1' : ''}${COVER ? '&cover=1' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true || window.__error', { timeout: 300000 });
  const err = await page.evaluate('window.__error');
  if (err) throw new Error(err);
  const cdp = await page.createCDPSession();
  const gpu = await page.evaluate('window.__glInfo');
  if (!SCREENSHOT) {
    const ok = await page.evaluate('!!window.__comp');
    if (!ok) throw new Error('page has no compositor; use --screenshot');
    await page.evaluate(() => {
      const b64 = (parts) => new Promise((res) => {
        if (!parts.length) return res('');
        const fr = new FileReader();
        fr.onload = () => res(fr.result.slice(fr.result.indexOf(',') + 1));
        fr.readAsDataURL(new Blob(parts));
      });
      window.__seg = {
        async start(fps, bitrate, hw) {
          const base = { codec: 'avc1.640033', width: 1080, height: 1920, bitrate, framerate: fps,
            avc: { format: 'annexb' }, latencyMode: 'quality', bitrateMode: 'variable' };
          let cfg = null;
          for (const acc of hw ? ['prefer-hardware', 'prefer-software'] : ['prefer-software']) {
            const c = { ...base, hardwareAcceleration: acc };
            if ((await VideoEncoder.isConfigSupported(c)).supported) { cfg = c; break; }
          }
          if (!cfg) throw new Error('H.264 encoder config not supported');
          this.fps = fps; this.i = 0; this.chunks = []; this.err = null;
          this.enc = new VideoEncoder({
            output: (c) => { const b = new Uint8Array(c.byteLength); c.copyTo(b); this.chunks.push(b); },
            error: (e) => { this.err = String(e); },
          });
          this.enc.configure(cfg);
          return cfg.hardwareAcceleration;
        },
        // frames i0 .. i0+n-1 at t0 + i / fps (same arithmetic as the caller used per frame before)
        async frames(i0, n, t0, fps) {
          for (let k = 0; k < n; k++) await this.frame(t0 + (i0 + k) / fps, false);
          return this.take();
        },
        async frame(t, take = true) {
          window.renderFrame(t);
          const f = new VideoFrame(window.__comp.canvas, { timestamp: Math.round(this.i * 1e6 / this.fps), duration: Math.round(1e6 / this.fps) });
          this.enc.encode(f, { keyFrame: this.i % (this.fps * 2) === 0 });
          f.close();
          this.i++;
          while (this.enc.encodeQueueSize > 3) await new Promise((r) => setTimeout(r, 1));
          if (take) return this.take();
        },
        async end() { await this.enc.flush(); const r = await this.take(); this.enc.close(); return r; },
        take() { if (this.err) throw new Error(this.err); return b64(this.chunks.splice(0)); },
      };
    });
  }
  const frame = async (t, format = FORMAT) => {
    await page.evaluate((tt) => window.renderFrame(tt), t);
    const { data } = await cdp.send('Page.captureScreenshot', {
      format, ...(format === 'jpeg' ? { quality: QUALITY } : {}), optimizeForSpeed: true, fromSurface: true,
      clip: { x: 0, y: 0, width: 1080, height: 1920, scale: SCALE },
    });
    return Buffer.from(data, 'base64');
  };
  const seg = {
    start: (fps, bitrate) => page.evaluate((f, b, h) => window.__seg.start(f, b, h), fps, bitrate, USE_HW),
    frames: async (i0, n) => Buffer.from(await page.evaluate((a, b, c, d) => window.__seg.frames(a, b, c, d), i0, n, START, FPS), 'base64'),
    end: async () => Buffer.from(await page.evaluate(() => window.__seg.end()), 'base64'),
  };
  return { browser, frame, gpu, seg };
}

function runOut(cmd, argv) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, argv, { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.on('error', rej);
    p.on('close', (c) => (c === 0 ? res(out) : rej(new Error(`${cmd} exit ${c}`))));
  });
}

function run(cmd, argv, low = false) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, argv, { stdio: ['ignore', 'inherit', 'inherit'] });
    if (low) try { os.setPriority(p.pid, os.constants.priority.PRIORITY_LOW); } catch {}   // the PC stays usable
    p.on('close', (c) => (c === 0 ? res() : rej(new Error(`${cmd} exit ${c}`))));
  });
}

if (STILLS) {
  const w = await launch();
  console.log('GPU:', w.gpu);
  fs.mkdirSync(path.join(ROOT, 'stills'), { recursive: true });
  for (const ts of STILLS.split(',').map(Number)) {
    const t0 = performance.now();
    const png = await w.frame(ts, 'png');
    const f = path.join(ROOT, 'stills', COVER ? 'cover.png' : `t_${String(ts).padStart(5, '0')}.png`);
    fs.writeFileSync(f, png);
    console.log(`still ${ts}s -> ${path.relative(ROOT, f)} (${(performance.now() - t0).toFixed(0)}ms)`);
  }
  await w.browser.close();
  server.close();
  process.exit(0);
}

// ---- segmented, parallel video render ----
const SEG_DIR = path.join(ROOT, 'out', '.segments', `${NAME}_${FPS}fps${DRAFT ? '_draft' : ''}`);
fs.mkdirSync(SEG_DIR, { recursive: true });
const totalFrames = Math.round((END - START) * FPS);
const perSeg = Math.round(SEG_SECONDS * FPS);
const segs = [];
for (let f0 = 0; f0 < totalFrames; f0 += perSeg) {
  const f1 = Math.min(f0 + perSeg, totalFrames);
  segs.push({ f0, f1, file: path.join(SEG_DIR, `seg_${String(Math.round(START * FPS) + f0).padStart(6, '0')}_${f1 - f0}.mp4`) });
}
const todo = segs.filter((s) => !fs.existsSync(s.file));
console.log(`${segs.length - todo.length}/${segs.length} segments already done; rendering ${todo.length} with ${Math.min(WORKERS, todo.length)} worker(s) (${SCREENSHOT ? `screenshots ${FORMAT} + x264 ${PRESET}` : `in-page H.264 ${BITRATE / 1e6} Mbps`})`);

const t0 = performance.now();
let done = 0, lastLog = 0, encoderLogged = SCREENSHOT;
const framesTodo = todo.reduce((n, s) => n + s.f1 - s.f0, 0);
function progress() {
  const now = performance.now();
  if (now - lastLog < 15000 && done < framesTodo) return;
  lastLog = now;
  const el = (now - t0) / 1000;
  const fps = done / el;
  console.log(`frames ${done}/${framesTodo}  ${fps.toFixed(1)} fps  eta ${((framesTodo - done) / Math.max(fps, 1e-3) / 60).toFixed(1)} min`);
}

async function renderSegmentWebCodecs(w, seg) {
  const tmp = seg.file + '.part.mp4';
  const raw = seg.file + '.part.h264';
  const parts = [];
  let n = 0, acc = null;
  try {
    acc = await w.seg.start(FPS, BITRATE);
    if (!encoderLogged) { encoderLogged = true; console.log(`encoder: ${acc === 'prefer-hardware' ? 'GPU (hardware)' : 'CPU (software)'}`); }
    for (let i = seg.f0; i < seg.f1; i += BATCH) {
      const k = Math.min(BATCH, seg.f1 - i);
      parts.push(await w.seg.frames(i, k));
      n += k; done += k;
      progress();
    }
    parts.push(await w.seg.end());
    fs.writeFileSync(raw, Buffer.concat(parts));
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-fflags', '+genpts', '-r', String(FPS), '-i', raw, '-c', 'copy', tmp]);
    fs.rmSync(raw, { force: true });
    if (acc === 'prefer-hardware') {
      // the segments are joined assuming frames come out in order: a hardware encoder that reorders (B-frames) is not used
      const b = await runOut('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=has_b_frames', '-of', 'csv=p=0', tmp]);
      if (parseInt(b, 10) > 0) throw new Error('the GPU encoder reorders frames');
    }
    fs.renameSync(tmp, seg.file);
  } catch (e) {
    if (acc === 'prefer-hardware' && USE_HW) { USE_HW = false; console.log(`GPU encoder failed (${e.message.split('\n')[0]}); using the CPU encoder from now on`); }
    done -= n;
    fs.rmSync(raw, { force: true });
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}

async function renderSegment(w, seg) {
  if (!SCREENSHOT) return renderSegmentWebCodecs(w, seg);
  const tmp = seg.file + '.part.mp4';
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', FORMAT === 'png' ? 'png' : 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', PRESET, '-crf', DRAFT ? '23' : '15',
    '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '5.1', '-r', String(FPS),
    tmp,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const ffDone = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))));
  ff.stdin.on('error', () => {});
  const write = (buf) => new Promise((res) => (ff.stdin.write(buf) ? res() : ff.stdin.once('drain', res)));
  let n = 0;
  try {
    for (let i = seg.f0; i < seg.f1; i++) {
      await write(await w.frame(START + i / FPS));
      n++; done++;
      progress();
    }
    ff.stdin.end();
    await ffDone;
    fs.renameSync(tmp, seg.file);
  } catch (e) {
    done -= n;
    ff.stdin.destroy(); ff.kill();
    await ffDone.catch(() => {});
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}

// ---- upload copy: each finished segment is re-encoded on the CPU (one at a time, lowest priority, 4 cores, more when the PC is idle) while
// the GPU renders the next ones, then the pieces are joined. Same x264 settings as the old whole-file pass.
// The watermark is off for the first 3 s and fades out before the loop point (video length minus ~1 s).
const UPLOAD = arg('upload', null);
const WATERMARK = arg('watermark', null);
// how many CPU cores each piece may use: the render gate (render-gate.sh) writes it, 4 while the owner is at the
// PC, 8 once he has been away for 5 min, 2 on battery; read again before every piece (4 when run on its own)
const upThreads = () => { try { return String(parseInt(fs.readFileSync(process.env.RENDER_THREADS_FILE, 'utf8')) || 4); } catch { return '4'; } };
if (WATERMARK && !fs.existsSync(WATERMARK)) throw new Error(`watermark not found: ${WATERMARK}`);
const upFile = (seg) => seg.file.replace(/\.mp4$/, '_up.mp4');
let upChain = Promise.resolve(), upError = null;
function queueUpload(seg) {
  if (!UPLOAD || fs.existsSync(upFile(seg))) return;
  upChain = upChain.then(async () => {
    if (upError) return;
    const tmp = upFile(seg) + '.part.mp4';
    const off = START + seg.f0 / FPS;   // video time of the segment's first frame
    const wm = WATERMARK ? ['-framerate', String(FPS), '-loop', '1', '-i', WATERMARK, '-filter_complex',
      `[1:v]setpts=PTS+${off}/TB,format=rgba,colorchannelmixer=aa=0.5,fade=in:st=3:d=0.5:alpha=1,` +
      `fade=out:st=${END - 2.8}:d=1:alpha=1,setpts=PTS-STARTPTS[w];[0:v][w]overlay=74:180:shortest=1[v]`, '-map', '[v]'] : [];
    try {
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', seg.file, ...wm, '-c:v', 'libx264', '-threads', upThreads(),
        '-preset', 'medium', '-crf', '18', '-maxrate', '24M', '-bufsize', '48M', '-pix_fmt', 'yuv420p',
        '-profile:v', 'high', '-level', '5.1', '-r', String(FPS), '-an', tmp], true);
      fs.renameSync(tmp, upFile(seg));
    } catch (e) { upError = e; fs.rmSync(tmp, { force: true }); }
  });
}
for (const seg of segs) if (fs.existsSync(seg.file)) queueUpload(seg);

const queue = [...todo];
async function worker(id) {
  let w = await launch();
  if (id === 0) console.log('GPU:', w.gpu);
  while (queue.length) {
    const seg = queue.shift();
    for (let attempt = 1; ; attempt++) {
      try { await renderSegment(w, seg); queueUpload(seg); break; } catch (e) {
        console.log(`worker ${id}: segment at frame ${seg.f0} failed (attempt ${attempt}): ${e.message.split('\n')[0]}`);
        if (attempt >= 5) throw e;
        await w.browser.close().catch(() => {});
        console.log(`worker ${id}: relaunching Chrome...`);
        w = await launch();
      }
    }
  }
  await w.browser.close().catch(() => {});
}
await Promise.all(Array.from({ length: Math.min(WORKERS, todo.length) }, (_, i) => worker(i)));
server.close();
if (todo.length) console.log(`rendered ${framesTodo} frames in ${((performance.now() - t0) / 60000).toFixed(1)} min`);

// ---- join segments, add soundtrack ----
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const list = path.join(SEG_DIR, 'list.txt');
fs.writeFileSync(list, segs.map((s) => `file '${s.file.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
const VIDEO_TMP = OUT.replace(/\.mp4$/, '') + '.video-only.mp4';
await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', NO_AUDIO ? OUT : VIDEO_TMP]);
if (!NO_AUDIO) {
  const wav = makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav'));
  await run('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', VIDEO_TMP, '-ss', String(START + STORY_START), '-i', wav,
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000',
    '-shortest', '-movflags', '+faststart', OUT,
  ]);
  fs.unlinkSync(VIDEO_TMP);
}
console.log('wrote', OUT);
if (UPLOAD) {
  const t1 = performance.now();
  await upChain;
  if (upError) throw upError;
  const upList = path.join(SEG_DIR, 'list_up.txt');
  fs.writeFileSync(upList, segs.map((s) => `file '${upFile(s).replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', upList, '-i', OUT,
    '-map', '0:v', '-map', '1:a?', '-c', 'copy', '-movflags', '+faststart', UPLOAD]);
  console.log(`wrote ${UPLOAD} (${((performance.now() - t1) / 1000).toFixed(0)} s after the render)`);
}

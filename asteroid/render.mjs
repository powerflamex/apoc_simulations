// Offline renderer: drives the page frame-by-frame in headless Chrome and encodes with ffmpeg.
//   node render.mjs                         -> out/<sim>_1080x1920_60fps.mp4 (with soundtrack)
//   node render.mjs --upload                -> also out/<sim>_1080x1920_60fps_tiktok.mp4, encoded in the same pass
//   node render.mjs --draft                 -> half-res 30fps quick preview
//   node render.mjs --stills 5,20,35        -> stills/t_XX.png   (video time; the story starts at STORY_START)
//   node render.mjs --cover 60              -> stills/cover.png (cover art over the frame at video time 60)
//   node render.mjs --no-audio              -> video only
//   node render.mjs --grain                 -> keep the film-grain effect (looks worse after TikTok compression)
//   node render.mjs --workers 2             -> Chrome instances rendering segments in parallel (default: self-tuning)
//   node render.mjs --preset P --crf N      -> x264 settings of the master (default superfast / 14)
//   node render.mjs --webcodecs             -> old path: H.264 encoded inside Chrome (slower, lower fidelity)
//   node render.mjs --chrome PATH --angle B -> Chrome binary / ANGLE backend (d3d11, metal, vulkan, swiftshader...)
// Default path: each frame is composited into one canvas in the page; its raw pixels go straight to
// ffmpeg/x264 over a local HTTP POST (lossless hand-off, so the only loss is the one x264 encode).
// Crash-safe: renders 10 s segments into out/.segments/, keeps finished ones, relaunches Chrome
// if it dies, and simply resumes when re-run. Segments are keyed by a hash of the page source and the
// encoder settings, so a code change can never reuse stale segments.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';
import { STORY_START, VIDEO_DURATION } from './src/timeline.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const NAME = path.basename(ROOT);
const W = 1080, H = 1920;
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
const STILLS = arg('stills', COVER);
const NO_AUDIO = has('no-audio');
const GRAIN = has('grain');
const WEBCODECS = has('webcodecs');
const UPLOAD = has('upload') && !DRAFT;
const BITRATE = Number(arg('mbps', DRAFT ? 12 : 50)) * 1e6;          // --webcodecs only
const PRESET = arg('preset', DRAFT ? 'veryfast' : 'superfast');
const CRF = String(arg('crf', DRAFT ? 23 : 14));
const SEG_SECONDS = Number(arg('seg', 10));
const OUT = path.resolve(arg('out', path.join(ROOT, 'out', DRAFT ? `${NAME}_draft.mp4` : `${NAME}_1080x1920_60fps.mp4`)));
const OUT_UPLOAD = OUT.replace(/\.mp4$/, '') + '_tiktok.mp4';
const CORES = os.availableParallelism ? os.availableParallelism() : os.cpus().length;
// --workers N pins the number of Chrome instances. By default the renderer starts with one and adds another only
// while that still raises the total frame rate: a second Chrome helps when the page (CPU) is the limit and does
// nothing when the GPU is, and which one it is depends on the machine and the scene.
const WORKERS_FIXED = arg('workers', null) !== null;
const WORKERS = Math.max(1, WORKERS_FIXED ? Number(arg('workers')) : Math.min(3, Math.floor(CORES / 4)));
const STALL_MS = Number(arg('stall', 600)) * 1000;                  // relaunch Chrome if no frame arrives for this long

const CHROME = arg('chrome', process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/opt/pw-browsers/chromium',
].find((p) => fs.existsSync(p)));
const ANGLE = arg('angle', process.platform === 'win32' ? 'd3d11' : '');

if (!CHROME) { console.error('Chrome not found: pass --chrome /path/to/chrome (or set CHROME_PATH)'); process.exit(1); }
if (!STILLS && spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
  console.error('ffmpeg not found in PATH'); process.exit(1);
}

// ---------- headless Chrome, driven over the DevTools pipe ----------
// (No puppeteer: it switches on DevTools network tracking for every page, which throttles the raw-frame
//  uploads to ~25 MB/s. The switches below are the ones it used, so frames match earlier renders.)
const CHROME_ARGS = [
  '--headless=new', '--hide-scrollbars', '--mute-audio', '--no-first-run', '--disable-extensions',
  '--allow-pre-commit-input', '--disable-background-networking', '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows', '--disable-breakpad', '--disable-client-side-phishing-detection',
  '--disable-component-extensions-with-background-pages', '--disable-crash-reporter', '--disable-default-apps',
  '--disable-dev-shm-usage', '--disable-hang-monitor', '--disable-infobars', '--disable-ipc-flooding-protection',
  '--disable-popup-blocking', '--disable-prompt-on-repost', '--disable-renderer-backgrounding',
  '--disable-search-engine-choice-screen', '--disable-sync', '--enable-automation', '--force-color-profile=srgb',
  '--metrics-recording-only', '--password-store=basic', '--use-mock-keychain',
  '--disable-features=Translate,AcceptCHFrame,MediaRouter,OptimizationHints,ProcessPerSiteUpToMainFrameThreshold,IsolateSandboxedIframes',
  ...(ANGLE ? [`--use-angle=${ANGLE}`] : []),
  ...(ANGLE === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : []),
  '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl',
  '--disable-gpu-driver-bug-workarounds', '--force-high-performance-gpu',
  `--window-size=${W},${H}`,
  ...(process.platform === 'linux' && process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : []),
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browsers = new Map();   // temp profile folder -> Chrome process
const endBrowser = (dir) => {
  const proc = browsers.get(dir);
  if (!proc) return;
  browsers.delete(dir);
  try { proc.kill('SIGKILL'); } catch {}
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
};
process.on('exit', () => { for (const dir of [...browsers.keys()]) endBrowser(dir); });
process.on('SIGINT', () => process.exit(130));
process.on('uncaughtException', (e) => { console.error(`render failed: ${e.message}`); process.exit(1); });

async function launchChrome() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'apoc-render-'));
  // fd 3 = commands to Chrome, fd 4 = replies; Chrome quits by itself when the pipe closes
  const proc = spawn(CHROME, [...CHROME_ARGS, `--user-data-dir=${profile}`, '--remote-debugging-pipe', 'about:blank'],
    { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  browsers.set(profile, proc);
  let errTail = '';
  proc.stderr.on('data', (d) => { errTail = (errTail + d).slice(-4000); });
  const pending = new Map();
  let nextId = 0, dead = null, sessionId, pageError = null;
  const die = (why) => {
    if (dead) return;
    dead = new Error(why);
    for (const p of pending.values()) p.rej(dead);
    pending.clear();
  };
  proc.on('error', (e) => die(`could not start Chrome (${CHROME}): ${e.message}`));
  proc.on('exit', (code) => die(`Chrome exited (code ${code})${errTail.trim() ? ': ' + errTail.trim().split('\n').pop() : ''}`));
  proc.stdio[3].on('error', () => {});
  const send = (method, params = {}, session) => new Promise((res, rej) => {
    if (dead) return rej(dead);
    const id = ++nextId;
    pending.set(id, { res, rej });
    proc.stdio[3].write(JSON.stringify({ id, method, params, sessionId: session }) + '\0');
  });
  const onEvent = (m) => {
    if (m.method === 'Inspector.targetCrashed' || m.method === 'Target.targetCrashed') die('the page crashed');
    else if (m.method === 'Runtime.exceptionThrown') {
      const text = m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text;
      pageError = pageError || text;
      console.log('[pageerror]', text);
    }
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') console.log('[page]', m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !m.params.entry.text.includes('404')) console.log('[page]', m.params.entry.text);
  };
  let parts = [];
  proc.stdio[4].on('data', (d) => {
    let from = 0;
    for (let i; (i = d.indexOf(0, from)) >= 0; from = i + 1) {
      parts.push(d.subarray(from, i));
      const m = JSON.parse(Buffer.concat(parts).toString('utf8'));
      parts = [];
      const p = m.id && pending.get(m.id);
      if (p) { pending.delete(m.id); if (m.error) p.rej(new Error(m.error.message)); else p.res(m.result); } else if (m.method) onEvent(m);
    }
    if (from < d.length) parts.push(d.subarray(from));
  });

  const close = async () => {
    await Promise.race([send('Browser.close').catch(() => {}), sleep(3000)]);
    die('closed');
    endBrowser(profile);
  };
  const s = (method, params) => send(method, params, sessionId);
  // evaluate(fn, ...jsonArgs) or evaluate('expression'); promises are awaited, the value comes back as JSON
  const evaluate = async (fn, ...a) => {
    const expression = typeof fn === 'string' ? fn : `(${fn})(${a.map((x) => JSON.stringify(x) ?? 'undefined').join(',')})`;
    const r = await s('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || r.exceptionDetails.text).replace(/^Error: /, ''));
    return r.result.value;
  };
  try {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    ({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }));
    await Promise.all([s('Page.enable'), s('Runtime.enable'), s('Log.enable'), s('Inspector.enable')]);
    await s('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  } catch (e) { await close(); throw e; }
  return { evaluate, close, send: s, isDead: () => !!dead, pageError: () => pageError };
}

// ---------- page-side helpers (these functions run inside the page) ----------
// Raw path. The composite canvas is converted to planar YUV 4:2:0 on the GPU (BT.709, limited range, 2x2 box
// chroma: the same conversion Chrome's own encoder applies), read back, and POSTed to render.mjs by a worker.
// That is 3.1 MB per frame instead of 8.3 MB of RGBA, already in the layout x264 wants. Read-back and upload of
// one frame overlap the drawing of the next ones.
function installRaw() {
  const src = window.__comp.canvas;
  const W = src.width, H = src.height;
  if (W % 8 || H % 4) throw new Error(`frame size ${W}x${H} must be a multiple of 8x4`);
  // The target is W/4 x 1.5H RGBA8 texels = W x 1.5H bytes: H rows of luma, then H/4 rows holding two U rows
  // each, then the same for V. Row j of the target is row j of the I420 buffer (readPixels starts at row 0).
  const PW = W / 4, PH = H + H / 2, BYTES = PW * PH * 4;
  const gl = new OffscreenCanvas(PW, PH).getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('no WebGL2 context for the YUV packer');
  const shader = (type, code) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, code);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('YUV packer shader: ' + gl.getShaderInfoLog(sh));
    return sh;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, `#version 300 es
    void main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4.0 - 1.0, 0.0, 1.0); }`));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, `#version 300 es
    precision highp float; precision highp int;
    uniform sampler2D uSrc;
    out vec4 o;
    const int W = ${W}, H = ${H};
    const vec3 KY = vec3(0.2126, 0.7152, 0.0722) * (219.0 / 255.0);
    const vec3 KU = vec3(-0.2126, -0.7152, 0.9278) / 1.8556 * (224.0 / 255.0);
    const vec3 KV = vec3(0.7874, -0.7152, -0.0722) / 1.5748 * (224.0 / 255.0);
    vec3 px(int x, int y) { return texelFetch(uSrc, ivec2(x, y), 0).rgb; }
    float luma(int x, int y) { return dot(px(x, y), KY) + 16.0 / 255.0; }
    float chroma(int x, int y, vec3 k) {   // x, y in chroma samples
      return dot((px(2 * x, 2 * y) + px(2 * x + 1, 2 * y) + px(2 * x, 2 * y + 1) + px(2 * x + 1, 2 * y + 1)) * 0.25, k) + 128.0 / 255.0;
    }
    void main() {
      ivec2 p = ivec2(gl_FragCoord.xy);
      if (p.y < H) { int x = p.x * 4; o = vec4(luma(x, p.y), luma(x + 1, p.y), luma(x + 2, p.y), luma(x + 3, p.y)); return; }
      int c = p.y - H;
      vec3 k = KU;
      if (c >= H / 4) { c -= H / 4; k = KV; }
      int hw = W / 8;   // width of one chroma row, in texels
      int y = c * 2 + (p.x < hw ? 0 : 1);
      int x = (p.x < hw ? p.x : p.x - hw) * 4;
      o = vec4(chroma(x, y, k), chroma(x + 1, y, k), chroma(x + 2, y, k), chroma(x + 3, y, k));
    }`));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('YUV packer program: ' + gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  gl.bindVertexArray(gl.createVertexArray());
  const tex = (w, h) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return t;
  };
  const target = tex(PW, PH);
  gl.bindFramebuffer(gl.FRAMEBUFFER, gl.createFramebuffer());
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('YUV packer framebuffer incomplete');
  tex(W, H);   // stays bound: the composite canvas is copied into it every frame
  gl.viewport(0, 0, PW, PH);
  gl.disable(gl.DITHER);
  gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
  // Two pixel-pack buffers: frame N is only collected after frame N+1 has been drawn and queued, so the page
  // prepares the next frame while the GPU is still busy with this one (instead of stalling on every read-back).
  const pbo = [0, 1].map(() => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, b);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, BYTES, gl.STREAM_READ);
    return b;
  });
  const queue = (k) => {      // composite canvas -> YUV -> pack buffer k; returns without waiting for the GPU
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo[k]);
    gl.readPixels(0, 0, PW, PH, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.flush();
  };
  const collect = (k, buf) => {
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo[k]);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, new Uint8Array(buf));
  };

  const code = `onmessage = async (e) => {
    const { url, buf } = e.data;
    try {
      const r = await fetch(url, { method: 'POST', body: buf });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()));
      postMessage({ buf }, [buf]);
    } catch (err) { postMessage({ err: 'frame upload failed: ' + ((err && err.message) || err) }); }
  };`;
  const worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
  let job = null;
  worker.onmessage = (e) => { if (job) job(e.data); };
  window.__raw = {
    async run(id, f0, f1, start, fps, depth) {
      const free = [];
      let inflight = 0, fail = null, wake = null;
      job = (m) => {
        inflight--;
        if (m.err) fail = fail || m.err; else free.push(m.buf);
        if (wake) { const w = wake; wake = null; w(); }
      };
      const wait = () => new Promise((r) => { wake = r; });
      const send = (i, k) => {
        const buf = free.pop() || new ArrayBuffer(BYTES);
        collect(k, buf);
        inflight++;
        worker.postMessage({ url: `${location.origin}/__frame/${id}/${i}`, buf }, [buf]);
      };
      try {
        for (let i = f0; i < f1 && !fail; i++) {
          const k = (i - f0) & 1;
          window.renderFrame(start + i / fps);
          queue(k);
          if (i > f0) send(i - 1, k ^ 1);
          while (inflight >= depth && !fail) await wait();
        }
        if (!fail) send(f1 - 1, (f1 - 1 - f0) & 1);
        while (inflight > 0 && !fail) await wait();
      } finally { job = null; }
      if (fail) throw new Error(fail);
    },
  };
  return { bytes: BYTES };
}

// --webcodecs path: H.264 (High) encoded by Chrome itself, chunks returned per frame.
function installWebCodecs() {
  const b64 = (parts) => new Promise((res) => {
    if (!parts.length) return res('');
    const fr = new FileReader();
    fr.onload = () => res(fr.result.slice(fr.result.indexOf(',') + 1));
    fr.readAsDataURL(new Blob(parts));
  });
  window.__seg = {
    async start(fps, bitrate) {
      const cfg = { codec: 'avc1.640033', width: 1080, height: 1920, bitrate, framerate: fps, hardwareAcceleration: 'prefer-software',
        avc: { format: 'annexb' }, latencyMode: 'quality', bitrateMode: 'variable' };
      const sup = await VideoEncoder.isConfigSupported(cfg);
      if (!sup.supported) throw new Error('H.264 encoder config not supported');
      this.fps = fps; this.i = 0; this.chunks = []; this.err = null;
      this.enc = new VideoEncoder({
        output: (c) => { const b = new Uint8Array(c.byteLength); c.copyTo(b); this.chunks.push(b); },
        error: (e) => { this.err = String(e); },
      });
      this.enc.configure(cfg);
    },
    async frame(t) {
      window.renderFrame(t);
      const f = new VideoFrame(window.__comp.canvas, { timestamp: Math.round(this.i * 1e6 / this.fps), duration: Math.round(1e6 / this.fps) });
      this.enc.encode(f, { keyFrame: this.i % (this.fps * 2) === 0 });
      f.close();
      this.i++;
      while (this.enc.encodeQueueSize > 3 && !this.err) await new Promise((r) => this.enc.addEventListener('dequeue', r, { once: true }));
      return this.take();
    },
    async end() { await this.enc.flush(); const r = await this.take(); this.enc.close(); return r; },
    take() { if (this.err) throw new Error(this.err); return b64(this.chunks.splice(0)); },
  };
}

// ---------- local server: static files for the page + the sink the page posts frames to ----------
const sinks = new Map();   // job id -> { push(index, chunks, byteLength, res) }
const server = await startServer(0, (req, res) => {
  const m = /^\/__frame\/([\w-]+)\/(\d+)$/.exec(req.url);
  const sink = m && sinks.get(m[1]);
  if (!sink) { req.resume(); res.writeHead(410).end('no such render job'); return; }
  const chunks = [];
  let n = 0;
  req.on('data', (d) => { chunks.push(d); n += d.length; });
  req.on('end', () => sink.push(Number(m[2]), chunks, n, res));
  req.on('error', () => {});
});
const PORT = server.address().port;
let jobs = 0;

// one headless Chrome per worker
async function launch() {
  const chrome = await launchChrome();
  try {
    await chrome.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?render=1${GRAIN ? '&grain=1' : ''}${COVER ? '&cover=1' : ''}` });
    for (const t0 = Date.now(); ; await sleep(50)) {
      let st = null;
      // (evaluating can fail for a moment while the navigation swaps documents)
      try { st = await chrome.evaluate('({ error: window.__error ? String(window.__error) : null, ready: window.__ready === true, comp: !!window.__comp })'); } catch (e) { if (chrome.isDead()) throw e; }
      if (st && st.ready && !st.comp) throw new Error('page has no compositor');
      if (st && st.ready) break;
      // an exception while the page loads (no WebGL, a syntax error...) means it will never get ready
      const err = (st && st.error) || chrome.pageError();
      if (err) throw new Error(err.split('\n')[0].replace(/^Error: /, '') + (/webgl/i.test(err) && !ANGLE ? '  (no usable GPU? try --angle swiftshader)' : ''));
      if (Date.now() - t0 > 300000) throw new Error('the page did not get ready within 5 minutes');
    }
    const gpu = await chrome.evaluate('window.__glInfo');
    const raw = WEBCODECS || STILLS ? null : await chrome.evaluate(installRaw);
    if (WEBCODECS) await chrome.evaluate(installWebCodecs);
    return { ...chrome, gpu, raw };
  } catch (e) { await chrome.close(); throw e; }
}

function run(cmd, argv) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, argv, { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('error', rej);
    p.on('close', (c) => (c === 0 ? res() : rej(new Error(`${cmd} exit ${c}`))));
  });
}

if (STILLS) {
  const w = await launch();
  console.log('GPU:', w.gpu);
  fs.mkdirSync(path.join(ROOT, 'stills'), { recursive: true });
  for (const ts of STILLS.split(',').map(Number)) {
    const t0 = performance.now();
    const id = `still-${++jobs}`;
    const got = new Promise((res) => sinks.set(id, { push(i, chunks, n, r) { r.writeHead(204).end(); res(Buffer.concat(chunks)); } }));
    // the composite canvas itself, i.e. exactly the pixels a video frame gets
    await w.evaluate(async (t, id) => {
      window.renderFrame(t);
      const png = await new Promise((r) => window.__comp.canvas.toBlob(r, 'image/png'));
      const r = await fetch(`/__frame/${id}/0`, { method: 'POST', body: png });
      if (!r.ok) throw new Error('still upload failed: HTTP ' + r.status);
    }, ts, id);
    const f = path.join(ROOT, 'stills', COVER ? 'cover.png' : `t_${String(ts).padStart(5, '0')}.png`);
    fs.writeFileSync(f, await got);
    sinks.delete(id);
    console.log(`still ${ts}s -> ${path.relative(ROOT, f)} (${(performance.now() - t0).toFixed(0)}ms)`);
  }
  await w.close();
  server.close();
  process.exit(0);
}

// ---------- encoder settings ----------
// frames arrive as BT.709 limited-range 4:2:0 and are tagged the way Chrome's own encoder tags its output
const TAGS = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'iec61966-2-1', '-color_range', 'tv'];
const RAW_IN = ['-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-video_size', `${W}x${H}`, '-framerate', String(FPS), ...TAGS, '-i', 'pipe:0'];
const DRAFT_SCALE = `scale=${W / 2}:${H / 2}:flags=bicubic`;
const X264_MASTER = ['-c:v', 'libx264', '-preset', PRESET, '-crf', CRF, '-g', String(FPS * 2), '-pix_fmt', 'yuv420p', '-profile:v', 'high', ...TAGS];
// the upload copy: same settings the separate "ffmpeg -preset slow -crf 18" pass used, but encoded from the raw frames
const X264_UPLOAD = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-maxrate', '24M', '-bufsize', '48M', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '5.1', ...TAGS];
const encoderKey = WEBCODECS ? `webcodecs ${BITRATE}` : `x264 i420 ${X264_MASTER.join(' ')}`;

// ---------- segmented, parallel video render ----------
// anything that changes the picture is in the folder name: page source, three.js version, grain, fps, encoder settings
const srcHash = crypto.createHash('sha1');
for (const f of ['index.html', 'node_modules/three/package.json', ...fs.readdirSync(path.join(ROOT, 'src')).filter((f) => f.endsWith('.js')).sort().map((f) => `src/${f}`)]) {
  srcHash.update(f).update(fs.readFileSync(path.join(ROOT, f)));
}
const SRC_KEY = srcHash.digest('hex').slice(0, 10);
const SET_KEY = crypto.createHash('sha1').update(`${encoderKey} grain=${GRAIN} seg=${SEG_SECONDS}`).digest('hex').slice(0, 6);
const SEG_ROOT = path.join(ROOT, 'out', '.segments');
const SEG_DIR = path.join(SEG_ROOT, `${NAME}_${FPS}fps${DRAFT ? '_draft' : ''}_${SRC_KEY}_${SET_KEY}`);
fs.mkdirSync(SEG_DIR, { recursive: true });
// segments of older source versions can never be used again
for (const d of fs.readdirSync(SEG_ROOT)) {
  if (!d.includes(`_${SRC_KEY}_`)) fs.rmSync(path.join(SEG_ROOT, d), { recursive: true, force: true });
}
const totalFrames = Math.round((END - START) * FPS);
const perSeg = Math.round(SEG_SECONDS * FPS);
const segs = [];
for (let f0 = 0; f0 < totalFrames; f0 += perSeg) {
  const f1 = Math.min(f0 + perSeg, totalFrames);
  const base = path.join(SEG_DIR, `seg_${String(Math.round(START * FPS) + f0).padStart(6, '0')}_${f1 - f0}`);
  segs.push({ f0, f1, file: `${base}.mp4`, up: `${base}.upload.mp4` });
}
const todo = segs.filter((s) => !fs.existsSync(s.file) || (UPLOAD && !fs.existsSync(s.up)));
const nWorkers = Math.min(WORKERS, todo.length);
console.log(`${segs.length - todo.length}/${segs.length} segments already done; rendering ${todo.length} with ${WORKERS_FIXED ? nWorkers : `up to ${nWorkers}`} worker(s) (${WEBCODECS ? `in-page H.264 ${BITRATE / 1e6} Mbps` : `raw frames -> x264 ${PRESET} crf ${CRF}${UPLOAD ? ' + upload copy' : ''}`})`);

// the soundtrack is synthesized in a second process while the frames render (and reused if nothing it reads changed)
const WAV = path.join(ROOT, 'out', 'soundtrack.wav');
let soundtrack = null;
if (!NO_AUDIO) {
  const key = crypto.createHash('sha1').update(SRC_KEY).update(fs.readFileSync(path.join(ROOT, 'audio.mjs'))).digest('hex');
  const fresh = fs.existsSync(WAV) && fs.existsSync(WAV + '.key') && fs.readFileSync(WAV + '.key', 'utf8') === key;
  if (!fresh) soundtrack = run(process.execPath, [path.join(ROOT, 'audio.mjs')]).then(() => fs.writeFileSync(WAV + '.key', key));
}
if (soundtrack) soundtrack.catch(() => {});

const t0 = performance.now();
let tReady = 0;   // when the first Chrome was up: fps and eta count from here, not from the launch
let done = 0, lastLog = 0;
const framesTodo = todo.reduce((n, s) => n + s.f1 - s.f0, 0);
function progress() {
  const now = performance.now();
  if (now - lastLog < 15000 && done < framesTodo) return;
  lastLog = now;
  const el = (now - tReady) / 1000;
  const fps = done / el;
  console.log(`frames ${done}/${framesTodo}  ${fps.toFixed(1)} fps  eta ${((framesTodo - done) / Math.max(fps, 1e-3) / 60).toFixed(1)} min`);
}

// rejects when no frame has arrived for STALL_MS (hung GPU, lost context...), so the segment is retried
function watchdog() {
  let timer, trip;
  const stalled = new Promise((_, rej) => { trip = rej; });
  stalled.catch(() => {});
  const kick = () => { clearTimeout(timer); timer = setTimeout(() => trip(new Error(`no frame for ${STALL_MS / 1000} s`)), STALL_MS); };
  kick();
  return { stalled, kick, stop: () => clearTimeout(timer) };
}

async function renderSegmentX264(w, seg) {
  const id = `seg-${++jobs}`;
  const outs = UPLOAD ? [[seg.file, X264_MASTER], [seg.up, X264_UPLOAD]] : [[seg.file, X264_MASTER]];
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error', ...RAW_IN,
    ...(DRAFT ? ['-vf', DRAFT_SCALE] : []),
    ...outs.flatMap(([file, enc]) => ['-map', '0:v', ...enc, '-an', `${file}.part.mp4`]),
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const ffDone = new Promise((res, rej) => {
    ff.on('error', (e) => rej(new Error(`ffmpeg: ${e.message}`)));
    ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exit ${c}`))));
  });
  ffDone.catch(() => {});
  ff.stdin.on('error', () => {});
  const dog = watchdog();
  // frames may arrive out of order (several uploads are in flight); feed ffmpeg strictly in order and only
  // answer a POST once its frame is written, so a slow encoder holds the page back
  const held = new Map();
  let next = seg.f0, n = 0, pumping = false, closed = false;
  ff.on('close', () => { closed = true; for (const h of held.values()) h.res.writeHead(500).end('encoder stopped'); held.clear(); });
  const flushed = () => new Promise((res) => {
    const ok = () => { ff.stdin.off('drain', ok); ff.off('close', ok); res(); };
    ff.stdin.once('drain', ok); ff.once('close', ok);
  });
  const pump = async () => {
    if (pumping) return;
    pumping = true;
    while (!closed && held.has(next)) {
      const h = held.get(next);
      held.delete(next);
      for (const c of h.chunks) if (!ff.stdin.write(c)) await flushed();
      h.res.writeHead(closed ? 500 : 204).end();
      next++; n++; done++;
      dog.kick();
      progress();
    }
    pumping = false;
  };
  sinks.set(id, {
    push(i, chunks, bytes, res) {
      if (closed) { res.writeHead(500).end('encoder stopped'); return; }
      if (bytes !== w.raw.bytes) { res.writeHead(400).end(`frame ${i}: ${bytes} bytes, expected ${w.raw.bytes}`); return; }
      held.set(i, { chunks, res });
      pump();
    },
  });
  try {
    await Promise.race([
      w.evaluate((...a) => window.__raw.run(...a), id, seg.f0, seg.f1, START, FPS, 3),
      ffDone.then(() => { throw new Error('ffmpeg stopped before the segment was complete'); }),
      dog.stalled,
    ]);
    if (next !== seg.f1) throw new Error(`segment got ${next - seg.f0} of ${seg.f1 - seg.f0} frames`);
    ff.stdin.end();
    await ffDone;
    for (const [file] of outs) fs.renameSync(`${file}.part.mp4`, file);
  } catch (e) {
    done -= n;
    ff.stdin.destroy(); ff.kill();
    await ffDone.catch(() => {});
    for (const [file] of outs) fs.rmSync(`${file}.part.mp4`, { force: true });
    throw e;
  } finally {
    dog.stop();
    sinks.delete(id);
  }
}

async function renderSegmentWebCodecs(w, seg) {
  const tmp = seg.file + '.part.mp4';
  const raw = seg.file + '.part.h264';
  const parts = [];
  const dog = watchdog();
  let n = 0;
  const call = (fn, ...a) => Promise.race([w.evaluate(fn, ...a), dog.stalled]).then((b) => Buffer.from(b || '', 'base64'));
  try {
    await call((f, b) => window.__seg.start(f, b), FPS, BITRATE);
    for (let i = seg.f0; i < seg.f1; i++) {
      parts.push(await call((t) => window.__seg.frame(t), START + i / FPS));
      n++; done++;
      dog.kick();
      progress();
    }
    parts.push(await call(() => window.__seg.end()));
    fs.writeFileSync(raw, Buffer.concat(parts));
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-fflags', '+genpts', '-r', String(FPS), '-i', raw, '-c', 'copy', tmp]);
    fs.rmSync(raw, { force: true });
    fs.renameSync(tmp, seg.file);
    if (UPLOAD) {
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', seg.file, ...X264_UPLOAD, '-an', `${seg.up}.part.mp4`]);
      fs.renameSync(`${seg.up}.part.mp4`, seg.up);
    }
  } catch (e) {
    done -= n;
    for (const f of [raw, tmp, `${seg.up}.part.mp4`]) fs.rmSync(f, { force: true });
    throw e;
  } finally { dog.stop(); }
}
const renderSegment = WEBCODECS ? renderSegmentWebCodecs : renderSegmentX264;

const queue = [...todo];
const pool = [];
function startWorker(id) {
  const me = { retire: false };
  me.up = new Promise((res) => { me.isUp = res; });
  me.finished = (async () => {
    let w = await launch();
    if (!tReady) tReady = performance.now();
    if (id === 0) console.log('GPU:', w.gpu);
    me.isUp();
    while (queue.length && !me.retire) {
      const seg = queue.shift();
      for (let attempt = 1; ; attempt++) {
        try { await renderSegment(w, seg); break; } catch (e) {
          console.log(`worker ${id}: segment at frame ${seg.f0} failed (attempt ${attempt}): ${e.message.split('\n')[0]}`);
          await w.close().catch(() => {});
          if (attempt >= 5) throw e;
          console.log(`worker ${id}: relaunching Chrome...`);
          w = await launch();
        }
      }
    }
    await w.close().catch(() => {});
  })();
  me.finished.catch(() => {}).finally(() => { me.over = true; me.isUp(); });
  pool.push(me);
  return me;
}

// frames per second over the next few seconds of rendering (null if the render ends first)
async function measureRate() {
  const f = done, t = performance.now();
  for (;;) {
    await sleep(250);
    if (done >= framesTodo || pool.every((w) => w.over)) return null;
    const el = performance.now() - t, n = done - f;
    if ((el >= 4000 && n >= 90) || (el >= 20000 && n >= 8)) return (n / el) * 1000;
  }
}

if (todo.length) {
  startWorker(0);
  if (WORKERS_FIXED) {
    for (let i = 1; i < nWorkers; i++) startWorker(i);
  } else {
    await pool[0].up;
    let rate = await measureRate();
    while (rate && pool.length < nWorkers && queue.length) {
      const extra = startWorker(pool.length);
      await extra.up;
      const now = await measureRate();
      if (!now) break;
      // the first extra Chrome has to add 25 %, the next one 15 %, or it is not worth its memory
      const pays = now >= rate * (pool.length === 2 ? 1.25 : 1.15);
      console.log(`${pool.length} workers: ${now.toFixed(1)} fps (was ${rate.toFixed(1)}) -> ${pays ? 'keeping it' : `staying with ${pool.length - 1}`}`);
      if (!pays) { extra.retire = true; break; }
      rate = now;
    }
  }
  await Promise.all(pool.map((w) => w.finished));
}
server.close();
if (todo.length) {
  const now = performance.now();
  console.log(`rendered ${framesTodo} frames in ${((now - t0) / 60000).toFixed(1)} min (${(framesTodo / (now - tReady) * 1000).toFixed(1)} fps once Chrome was up)`);
}

// ---------- join segments, add soundtrack ----------
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const concatList = (name, files) => {
  const list = path.join(SEG_DIR, name);
  fs.writeFileSync(list, files.map((f) => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
  return ['-f', 'concat', '-safe', '0', '-i', list];
};
if (soundtrack) await soundtrack;
await run('ffmpeg', [
  '-y', '-loglevel', 'error', ...concatList('list.txt', segs.map((s) => s.file)),
  ...(NO_AUDIO ? ['-c', 'copy'] : [
    '-ss', String(START + STORY_START), '-i', WAV,
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', 'afade=t=in:d=0.25', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-shortest',
  ]),
  '-movflags', '+faststart', OUT,
]);
console.log('wrote', OUT);
if (UPLOAD) {
  // same audio stream as the master, copied
  await run('ffmpeg', [
    '-y', '-loglevel', 'error', ...concatList('list_upload.txt', segs.map((s) => s.up)), '-i', OUT,
    '-map', '0:v', '-map', '1:a?', '-c', 'copy', '-movflags', '+faststart', OUT_UPLOAD,
  ]);
  console.log('wrote', OUT_UPLOAD);
}

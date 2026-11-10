// The read-along video for recording the voice: the finished (voiceless) video on top, the script line to say
// right now underneath (big), with the section, the moment in the video and the next line. Silent, so the phone only
// hears him. Each line starts at its moment in the video (ANCHORS below, from SEC in src/timeline.js); the lines
// between two anchors follow at ~2.4 words/s, and a gap left before the next anchor shows as "(wait)".
//   node readalong.mjs   ->  ../out/big-crunch_READ-ALONG.mp4   (--times: only print when each line starts)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { SEC } from './src/timeline.js';

const VIDEO = '../out/big-crunch_1920x1080.mp4';
const OUT = '../out/big-crunch_READ-ALONG.mp4';
const TMP = 'out/.readalong';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const W = 1280, TOP = 720, PANEL = 270, FPS = 30;
const PRE = 4;            // seconds on the first frame before it starts ("get ready")
const WPS = 2.4, GAP = 0.6;

// line (its first words) -> the video time it starts at
const ANCHORS = [
  ['In seven minutes', SEC.ff + 0.5],
  ['This is the Big Crunch', SEC.demo + 0.4],
  ['Every galaxy is flying', SEC.demo + 3.3],
  ['In eleven billion years', SEC.dStop - 2.2],
  ['And everything falls', SEC.dFall - 0.2],
  ['Crushed into one', SEC.dCrunch - 2.8],
  ['[wait', SEC.dCrunch],
  ['And then, maybe, it all', SEC.dBang - 2.6],   // (the bang goes off on "explodes")
  ['A brand-new', SEC.dBang + 2.0],
  ['In 2025', SEC.walk + 0.6],
  ['And imagine you could stand', SEC.lapse - 1],
  ['The first thing you', SEC.andro],
  ['Then it fills half', SEC.aNight0],
  ['In the next few billion', SEC.crash],
  ['[wait', SEC.aHush],
  ['The two galaxies just melt', SEC.ball],
  ['Nine billion years left', SEC.turn],
  ['Point a telescope', SEC.scope0],
  ['Now, slowly, it turns white', SEC.white],
  ['Then blue', SEC.blue],
  ['A billion years left', SEC.back],
  ['A hundred million years left', SEC.crash2],
  ['[wait', SEC.hush2],
  ['And now, something strange', SEC.warm],
  ['Space has always been', SEC.freeze],
  ['But now space is getting', SEC.squeeze],
  ['Sixteen million', SEC.ice],
  ['Fifteen million', SEC.summer],
  ['Ten million', SEC.hot],
  ['The oceans boil', SEC.boil],
  ['Three million', SEC.glow],
  ['One million', SEC.melt],
  ['Imagine you\'re somehow', SEC.rise],
  ['Four hundred thousand', SEC.fog],
  ['A hundred thousand', SEC.stars],
  ['Look for the Sun', SEC.look],
  ['It\'s gone', SEC.sunGone],
  ['Earth goes the same way', SEC.earthGo],
  ['Three minutes left', SEC.last3],
  ['One hundred-thousandth', SEC.quark],
  ['And all of space', SEC.squash],
  ['And then, maybe', SEC.bang],
  ['That\'s the Big Crunch', SEC.end + 1],
];

// ---- the script: sections and lines from SCRIPT.md ----
const md = fs.readFileSync('SCRIPT.md', 'utf8').replace(/\r/g, '').split('\n---\n')[1];
const lines = [];
let section = '';
for (const raw of md.split('\n')) {
  const s = raw.trim();
  if (!s) continue;
  const h = s.match(/^###\s+\d+\.\s+(.*)$/);
  if (h) { section = h[1]; continue; }
  const text = s.replace(/\*\*/g, '');
  const wait = /^\[wait (\d+)/.exec(text);
  lines.push({ section, text: wait ? `(stay quiet ${wait[1]} second${wait[1] === '1' ? '' : 's'})` : text, wait: wait ? +wait[1] : 0, key: text });
}

// ---- when each line starts (video time) ----
const mmss = (v) => `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`;
let ai = 0, t = 0, group = [];
const groups = [group];
for (const l of lines) {
  const a = ANCHORS[ai];
  if (a && l.key.startsWith(a[0])) { t = a[1]; ai++; groups.push(group = []); }
  l.at = t;
  l.len = l.wait || l.text.split(/\s+/).length / WPS;
  t += l.len + (l.wait ? 0 : GAP);
  group.push(l);
}
if (ai !== ANCHORS.length) throw new Error(`anchor not found: ${ANCHORS[ai][0]}`);
// lines that don't fit before the next anchor at that pace come up closer together (he'll just say them faster)
for (let g = 0; g < groups.length - 1; g++) {
  const G = groups[g], next = groups[g + 1][0];
  if (!G.length || !next) continue;
  const a0 = G[0].at, last = G[G.length - 1], room = next.at - 0.3 - a0, need = last.at + last.len - a0;
  if (need > room) {
    console.warn(`tight by ${(need - room).toFixed(1)} s at 2.4 words/s: ${mmss(a0)} ${G[0].text}`);
    for (const l of G) l.at = a0 + (l.at - a0) * room / need;
  }
}
const END = SEC.out;
const table = () => { for (const l of lines) console.log(`${mmss(l.at).padStart(5)}  ${(l.at).toFixed(1).padStart(6)}  ${l.text}`); };
if (process.argv.includes('--times')) { table(); process.exit(0); }   // (just the line table)

// segments shown in the panel: [from, to, html fields]
const segs = [{ from: -PRE, to: 0, label: 'GET READY', clock: '', main: 'Starts in a few seconds…', dim: true, next: lines[0].text }];
lines.forEach((l, i) => {
  const nx = lines[i + 1];
  const stop = nx ? nx.at : END;
  const said = l.at + l.len + 1.2;   // after this, a long gap before the next line shows as a wait
  if (!l.wait && nx && stop - said >= 2.5) {
    segs.push({ from: l.at, to: said, label: l.section, clock: mmss(l.at), main: l.text, next: nx.text });
    segs.push({ from: said, to: stop, label: l.section, clock: '', main: '(wait)', dim: true, next: nx.text });
  } else {
    segs.push({ from: l.at, to: stop, label: l.section, clock: mmss(l.at), main: l.text, dim: l.wait, next: nx ? nx.text : '(the end: stop recording)' });
  }
});

// ---- draw each panel (Chrome), then join them into a strip the length of the video ----
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: W, height: PANEL });
for (const [i, s] of segs.entries()) {
  await page.setContent(`<html><body style="margin:0;width:${W}px;height:${PANEL}px;background:#0e0e14;color:#eee;
    font-family:Georgia,serif;position:relative;overflow:hidden">
    <div style="position:absolute;left:24px;top:16px;font:bold 17px 'Segoe UI',sans-serif;color:#e8c46a;
      letter-spacing:.5px">${esc(s.label.toUpperCase())}</div>
    <div style="position:absolute;right:54px;top:16px;font:bold 17px 'Segoe UI',sans-serif;color:#999">${s.clock}</div>
    <div style="position:absolute;left:110px;right:110px;top:50px;height:150px;display:flex;align-items:center;
      justify-content:center;text-align:center;font-size:${s.main.length > 90 ? 34 : 40}px;line-height:1.3;
      color:${s.dim ? '#777' : '#f2efe6'};font-style:${s.dim ? 'italic' : 'normal'}">${esc(s.main)}</div>
    <div style="position:absolute;left:60px;right:60px;bottom:16px;text-align:center;font-size:21px;color:#6f6f78;
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis">next:&nbsp; ${esc(s.next)}</div>
  </body></html>`);
  await page.screenshot({ path: `${TMP}/p${i}.png` });
}
await browser.close();
// (frame-exact durations, so the strip never drifts from the video)
const fr = (v) => Math.round((v + PRE) * FPS);
let list = '';
for (const [i, s] of segs.entries()) list += `file 'p${i}.png'\nduration ${((fr(Math.min(s.to, END)) - fr(s.from)) / FPS).toFixed(4)}\n`;
list += `file 'p${segs.length - 1}.png'\n`;
fs.writeFileSync(`${TMP}/list.txt`, list);

execFileSync('ffmpeg', ['-v', 'error', '-y', '-threads', '4',
  '-i', VIDEO, '-f', 'concat', '-safe', '0', '-i', `${TMP}/list.txt`,
  '-filter_complex',
  `[0:v]scale=${W}:${TOP},tpad=start_duration=${PRE}:start_mode=clone[v];` +
  `[1:v]fps=${FPS},scale=${W}:${PANEL},format=yuv420p[p];[v][p]vstack,format=yuv420p[o]`,
  '-map', '[o]', '-an', '-t', String(END + PRE), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
  '-threads', '4', '-movflags', '+faststart', OUT], { stdio: 'inherit' });
fs.rmSync(TMP, { recursive: true, force: true });

// the line table, for checking (and for placing the recording later)
table();
console.log(`-> ${path.resolve(OUT)}`);

// Your thoughts, drawn over the world (a 2D canvas the compositor paints over the 3D frame): small labels pinned
// to things you notice, the paths you see coming (the ball, the kid, the car), translations over people talking,
// math over the sky, and live numbers (how slow the rain falls to you, the next heartbeat, how long the bubble takes
// to pop). Everything is timed on the video clock; the numbers come from the same story state as the picture.
import * as THREE from 'three';
import { clamp, smooth, lerp } from './util.js';
import { SEC, W, worldT, fmtFeels, popupAt } from './timeline.js';
import { GUITAR } from './layout.js';
import { ballPredict, kidAt, kidPredict, DANGER, COUPLE_A, COUPLE_B } from './people.js';
import { BOLT_TOP, BOLT_GROUND } from './bolt.js';

const WW = 1920, HH = 1080;
const INK = 'rgba(226,246,255,', RED = 'rgba(255,92,74,';
const FONT = "'Segoe UI', 'Yu Gothic UI', 'Meiryo', sans-serif";
const fade = (v, a, b, f = 0.45) => Math.min(clamp((v - a) / f), clamp((b - v) / f));
const HEART = 60 / 70;   // seconds between heartbeats (real)

export function makeHud(stage) {
  const canvas = document.createElement('canvas');
  canvas.width = WW; canvas.height = HH;
  canvas.id = 'hud3';
  canvas.style.cssText = `position:absolute;inset:0;width:${WW}px;height:${HH}px;pointer-events:none;`;
  stage.querySelector('canvas').after(canvas);
  const g = canvas.getContext('2d');
  const v3 = new THREE.Vector3();
  let cam = null;

  // world point -> screen (null if behind you or far off-screen)
  function P(x, y, z) {
    v3.set(x, y, z).project(cam);
    if (v3.z > 1 || v3.z < -1) return null;
    const sx = (v3.x * 0.5 + 0.5) * WW, sy = (0.5 - v3.y * 0.5) * HH;
    if (sx < -400 || sx > WW + 400 || sy < -400 || sy > HH + 400) return null;
    return [sx, sy];
  }
  function text(str, x, y, { size = 21, color = INK, a = 1, align = 'left', weight = 600, italic = false, spacing = 2, font = FONT } = {}) {
    g.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${font}`;
    g.letterSpacing = `${spacing}px`;
    g.textAlign = align; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,0.85)'; g.shadowBlur = 8;
    g.fillStyle = color + a + ')';
    g.fillText(str, x, y);
    g.shadowBlur = 0;
  }
  // a label pinned to a point: a ring on the point, a leader line out to the text
  function tag(p, str, a, { dx = 70, dy = -60, color = INK, sub = null, size = 27 } = {}) {
    if (!p || a <= 0.01) return;
    const [x, y] = p;
    const grow = smooth(0, 1, a);
    g.strokeStyle = color + (0.9 * a) + ')'; g.lineWidth = 1.6;
    g.beginPath(); g.arc(x, y, 7 + 5 * (1 - grow), 0, Math.PI * 2); g.stroke();
    const ex = x + dx * grow, ey = y + dy * grow;
    g.beginPath(); g.moveTo(x + Math.sign(dx) * 7 * 0.7, y + Math.sign(dy) * 7 * 0.7); g.lineTo(ex, ey); g.lineTo(ex + Math.sign(dx) * 26, ey); g.stroke();
    text(str, ex + Math.sign(dx) * 34, ey, { color, a, align: dx >= 0 ? 'left' : 'right', size });
    if (sub) text(sub, ex + Math.sign(dx) * 34, ey + size + 4, { color, a: a * 0.75, align: dx >= 0 ? 'left' : 'right', size: size - 4, weight: 500 });
  }
  function path(pts, a, { color = INK, dash = [8, 9], width = 2.2, arrow = true } = {}) {
    const sp = pts.map((q) => P(q.x, q.y, q.z)).filter(Boolean);
    if (sp.length < 2 || a <= 0.01) return;
    g.strokeStyle = color + a + ')'; g.lineWidth = width; g.setLineDash(dash);
    g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 6;
    g.beginPath(); g.moveTo(sp[0][0], sp[0][1]);
    for (const q of sp.slice(1)) g.lineTo(q[0], q[1]);
    g.stroke(); g.setLineDash([]); g.shadowBlur = 0;
    if (arrow) {
      const [x1, y1] = sp[sp.length - 1], [x0, y0] = sp[sp.length - 2];
      const ang = Math.atan2(y1 - y0, x1 - x0);
      g.fillStyle = color + a + ')';
      g.beginPath(); g.moveTo(x1 + Math.cos(ang) * 10, y1 + Math.sin(ang) * 10);
      g.lineTo(x1 + Math.cos(ang + 2.5) * 12, y1 + Math.sin(ang + 2.5) * 12); g.lineTo(x1 + Math.cos(ang - 2.5) * 12, y1 + Math.sin(ang - 2.5) * 12); g.fill();
    }
  }
  function xmark(p, a, str, color = RED) {
    if (!p || a <= 0.01) return;
    const [x, y] = p, r = 16;
    g.strokeStyle = color + a + ')'; g.lineWidth = 3.5;
    g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); g.stroke();
    g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, r * 1.7, 0, Math.PI * 2); g.stroke();
    if (str) text(str, x, y + 54, { color, a, align: 'center', size: 28, weight: 700 });
  }
  // a translation over someone's head: what they said, then what it means
  function subtitle(p, orig, trans, a) {
    if (!p || a <= 0.01) return;
    const [x, y] = p;
    g.font = `600 34px ${FONT}`; g.letterSpacing = '0px';
    const w = Math.max(g.measureText(trans).width, g.measureText(orig).width * 0.75) + 48;
    g.fillStyle = `rgba(8,14,22,${0.6 * a})`;
    g.beginPath(); g.roundRect(x - w / 2, y - 108, w, 92, 12); g.fill();
    g.strokeStyle = INK + (0.5 * a) + ')'; g.lineWidth = 1; g.stroke();
    g.beginPath(); g.moveTo(x - 8, y - 18); g.lineTo(x, y - 6); g.lineTo(x + 8, y - 18); g.fillStyle = `rgba(8,14,22,${0.55 * a})`; g.fill();
    text(orig, x, y - 84, { size: 24, a: a * 0.75, align: 'center', weight: 500, italic: true, spacing: 0 });
    text(trans, x, y - 46, { size: 34, a, align: 'center', spacing: 0 });
  }

  // the math over the sky (screen space, drifting slowly)
  const EQS = [
    ['ζ(s) = Σ 1/nˢ', 0.2, 0.17], ['∂u/∂t + (u·∇)u = −∇p/ρ + ν∇²u', 0.62, 0.12], ['P = NP ?', 0.82, 0.3],
    ['e^iπ + 1 = 0', 0.1, 0.36], ['∇ × E = −∂B/∂t', 0.45, 0.27], ['xⁿ + yⁿ = zⁿ', 0.33, 0.42], ['iℏ ∂ψ/∂t = Ĥψ', 0.74, 0.44],
    ['π = 3.14159265358979323846…', 0.5, 0.06], ['Rμν − ½gμνR = 8πG Tμν', 0.16, 0.06], ['∫ e^(−x²) dx = √π', 0.88, 0.16],
  ];

  return {
    canvas,
    // s: state, v: the story moment shown, vv: the video clock; ctx: the world (positions of things)
    frame(camera, s, v, vv, ctx) {
      cam = camera;
      g.clearRect(0, 0, WW, HH);
      const w = s.w;
      // (none over the opening title, nor on the cover)
      if (window.__cover || vv < 6.4) { canvas.style.opacity = '0'; return; }
      canvas.style.opacity = '1';
      const f = s.f;

      // (everything here steps back while a gold popup is up: never two kinds of text at once)
      const pop = popupAt(v);
      g.globalAlpha = pop ? 1 - smooth(0, 0.15, pop.dt) * (1 - smooth(1.6, 1.9, pop.dt)) : 1;

      // ---------- 0:11 the cube; 0:22 the chess hustler ----------
      text('43 QUINTILLION WAYS TO SCRAMBLE IT', WW / 2, HH * 0.2, { size: 28, a: fade(v, SEC.cube0 + 0.8, SEC.cube1 - 0.2), align: 'center' });
      if (ctx.chess) {
        const kp = ctx.chess.kingWorld(new THREE.Vector3());
        tag(P(kp.x, kp.y + 0.06, kp.z), 'MATE IN 3', fade(v, SEC.chess0 + 0.6, SEC.mate - 0.1), { dx: 80, dy: -90 });
      }

      // ---------- 0:27 the rain: how fast a drop falls (to you) ----------
      if (ctx.rain && v > SEC.rain && v < SEC.x4) {
        for (let i = 0; i < 400; i++) {
          const d = ctx.rain.dropPos(i, w, s.rain);
          if (!d.on || d.z > -1 || d.z < -4 || Math.abs(d.x) > 2.5 || d.y < 1.8 || d.y > 3.2) continue;
          tag(P(d.x, d.y, d.z), `FALLING ${(9 / f).toFixed(1)} m/s · TO YOU`, fade(v, SEC.rain + 1.4, SEC.x4 - 0.1) * 0.95, { dx: 70, dy: -50 });
          break;
        }
      }
      // ---------- 0:35 every language ----------
      subtitle(P(COUPLE_A.x, 2.05, COUPLE_A.z), '«¡Siempre llegas tarde!»', '"You\'re always late!"', fade(v, 35.4, 38.8));
      subtitle(P(COUPLE_B.x, 2.0, COUPLE_B.z), '«¡Había tráfico!»', '"There was traffic!"', fade(v, 38.6, 42.2));

      // ---------- 0:42 the ball: you see it all coming ----------
      {
        const aSee = fade(v, SEC.see, SEC.catch + 1.2);
        const k = kidAt(w);
        if (w < W.kick) tag(P(k.x, 1.0, k.z), `HE LOSES THE BALL IN ${(W.kick - w).toFixed(1)} s`, fade(v, SEC.see + 1.9, SEC.kick + 0.4), { dx: 70, dy: -90 });
        // the ball's path (where it will go if nobody stops it)
        const t0 = Math.max(0, w - W.kick);
        const bp = []; for (let t = t0; t <= 3.2; t += 0.08) bp.push(ballPredict(t));
        path(bp, aSee * (1 - smooth(W.catch, W.catch + 0.15, w)));
        // the kid's path, after it
        const kp = []; for (let t = Math.max(0, w - W.kick - 0.55); t <= 1.6; t += 0.1) { const q = kidPredict(t); kp.push({ x: q.x, y: 0.05, z: q.z }); }
        path(kp, aSee * 0.8 * (1 - smooth(W.catch, W.catch + 0.15, w)));
        // the car's path, red, to where it meets him
        const cx = ctx.dangerX(w);
        if (cx < 0.5) path([{ x: cx + 2.4, y: 0.6, z: -6.4 }, { x: 0.5, y: 0.6, z: -6.4 }], aSee, { color: RED, dash: [14, 8], width: 3 });
        const tImpact = DANGER.wAt - w;
        const aX = fade(v, SEC.see + 3, SEC.catch + 0.3);
        xmark(P(0.5, 0.05, -6.4), aX * (w < W.catch ? 1 : 1 - smooth(W.catch, W.catch + 0.2, w)), tImpact > 0 ? `IMPACT IN ${tImpact.toFixed(1)} s` : '');
        tag(P(cx - 1.6, 1.2, -6.4), `CAR · ${(12.5 / f).toFixed(1)} m/s TO YOU`, fade(v, SEC.see + 5, SEC.catch - 1), { dx: -40, dy: -110, color: RED });
      }
      // ---------- 1:16 your mind races: math over the sky; the pigeons ----------
      {
        const a = fade(v, SEC.mind, 86.2, 1.0);
        if (a > 0) EQS.forEach(([eq, x, y], i) => {
          const ai = a * smooth(SEC.mind + i * 0.5, SEC.mind + i * 0.5 + 1.0, v);
          text(eq, (x + 0.006 * Math.sin(vv * 0.2 + i)) * WW, (y + 0.004 * Math.cos(vv * 0.17 + i) + 0.04) * HH, { size: 38, a: ai * 0.85, italic: true, weight: 500, spacing: 1, font: "'Cambria Math', 'Cambria', Georgia, serif", align: 'center' });
        });
        tag(P(0, 300, -900), 'THE RIEMANN HYPOTHESIS · UNSOLVED FOR 160 YEARS', fade(v, SEC.mind + 3, 86.2), { dx: 60, dy: 50 });
        const bp = ctx.birds && ctx.birds.pos[3];
        if (bp) tag(P(bp.x, bp.y, bp.z), `ONE WINGBEAT: ${fmtFeels(f / 6.2)}`, fade(v, 88.2, SEC.stuck - 0.5), { dx: 70, dy: -110 });
      }
      // ---------- 1:32 stuck: one word takes forever ----------
      {
        const a = fade(v, SEC.stuck + 3, SEC.guitar);
        if (a > 0) {
          const w0 = worldT(SEC.stuck + 3), u = clamp((w - w0) / 0.6);
          const word = u < 0.08 ? '' : u < 0.55 ? 'H' + 'h'.repeat(Math.floor((u - 0.08) * 8)) : 'Hi' + (u > 0.95 ? '!' : '');
          text(`YOU:  “${word}`, WW / 2, HH * 0.34, { size: 44, a, align: 'center', weight: 600, spacing: 1 });
          g.fillStyle = INK + (0.25 * a) + ')'; g.fillRect(WW / 2 - 160, HH * 0.34 + 36, 320, 5);
          g.fillStyle = INK + (0.9 * a) + ')'; g.fillRect(WW / 2 - 160, HH * 0.34 + 36, 320 * u, 5);
        }
        text(`MOVING YOUR EYES: ${fmtFeels(0.12 * f)}`, WW / 2, HH * 0.2, { size: 28, a: fade(v, SEC.stuck + 7, SEC.guitar), align: 'center' });
      }
      // ---------- 1:44 the guitar ----------
      tag(P(GUITAR.x - 0.28, 0.95, GUITAR.z + 0.12), `THE LOW STRING SWINGS ${(82.4 / f).toFixed(1)} TIMES A SECOND`, fade(v, SEC.guitar + 1.5, SEC.sink), { dx: -60, dy: -120 });
      // ---------- 1:52 the cure; 3:00 fusion; 3:20 the rocket ----------
      tag(P(0.6 + 0.9, 7.6, -12.5), 'A PROTEIN THAT ONLY ATTACKS CANCER', fade(v, SEC.cure0 + 5, SEC.cure1 - 0.2), { dx: -80, dy: -60 });
      tag(P(-2 + 9, 30 + 6, -70), 'FUSION: THE POWER OF THE SUN', fade(v, SEC.fusion0 + 3.5, SEC.fusion1 - 4.2), { dx: 80, dy: -50 });
      tag(P(-11.5, 15.5, 3.5), 'A ROCKET TO MARS', fade(v, SEC.rocket0 + 3, SEC.rocket1 - 6.2), { dx: 80, dy: -40 });

      // ---------- 1:54 the sound sinks ----------
      {
        const a = fade(v, SEC.cure1 + 2, SEC.silent - 0.2);
        if (a > 0) {
          const hz = 2000 / f;
          text(hz > 20 ? `THE CITY'S SOUND: ${hz < 100 ? hz.toFixed(1) : Math.round(hz)} Hz` : 'TOO LOW TO HEAR', WW / 2, HH * 0.6, { size: 32, a, align: 'center', color: hz > 20 ? INK : RED });
        }
        const ah = fade(v, SEC.silent + 2, SEC.frozen + 2);
        if (ah > 0) {
          const next = (Math.floor(w / HEART) + 1) * HEART - w;
          const felt = next * f, m = Math.floor(felt / 60), sec = Math.floor(felt % 60);
          text(`NEXT HEARTBEAT IN ${m}:${String(sec).padStart(2, '0')}`, WW / 2, HH * 0.6, { size: 32, a: ah, align: 'center' });
        }
      }
      // ---------- 2:20 frozen ----------
      if (ctx.rain && v > SEC.frozen + 4 && v < SEC.bolt) {
        let n = 0;
        for (let i = 0; i < 3000 && n < 1; i++) {
          const d = ctx.rain.dropPos(i, w, s.rain);
          const p = d.on ? P(d.x, d.y, d.z) : null;
          if (!p || p[0] < 500 || p[0] > 1500 || p[1] < 260 || p[1] > 700) continue;
          const dist = Math.hypot(d.x - camera.position.x, d.y - camera.position.y, d.z - camera.position.z);
          if (dist > 3.5 || dist < 0.8) continue;
          tag(p, `THIS DROP: ${(900 / f).toFixed(1)} cm/s`, fade(v, SEC.frozen + 4.5, SEC.bolt - 1), { dx: 70, dy: -60 });
          n++;
        }
      }
      // ---------- 2:40 lightning ----------
      {
        const top = BOLT_TOP, gr = BOLT_GROUND;
        tag(P(lerp(top.x, gr.x, 0.3), lerp(top.y, gr.y, 0.3), lerp(top.z, gr.z, 0.3)), 'LIGHTNING · 2 km AWAY', fade(v, SEC.leader + 3, SEC.stroke - 0.5), { dx: 80, dy: -40 });
        const thunder = 2.0 / 0.343 - Math.max(0, w - W.stroke);   // real seconds until it reaches you
        if (v > SEC.stroke + 2) tag(P(gr.x, 150, gr.z), `THUNDER: ${Math.round(thunder * f / 60)} MINUTES AWAY`, fade(v, SEC.stroke + 2.5, SEC.fusion0 + 3.2), { dx: 80, dy: -80 });
      }
      // ---------- 4:13 a thousand times ----------
      {
        const hp = ctx.heroPos ? ctx.heroPos(w) : null;
        const ab = fade(v, SEC.burst + 0.5, SEC.letgo - 1);
        if (hp) tag(P(hp.x + 0.25, hp.y + 0.25, hp.z), `POPPING: ${Math.round(clamp(s.burst) * 100)}%`, ab, { dx: 90, dy: -90 });
        const ah = fade(v, SEC.burst + 4, SEC.letgo - 1);
        if (ah > 0) {
          const next = (Math.floor(w / HEART) + 1) * HEART - w, felt = next * f;
          text(`NEXT HEARTBEAT IN ${Math.floor(felt / 60)}:${String(Math.floor(felt % 60)).padStart(2, '0')}`, WW * 0.27, HH * 0.12, { size: 30, a: ah, align: 'center' });
          const cook = (42 - s.temp) / (20 / 5040 * 60);   // felt minutes to 42 °C
          text(`YOUR BRAIN COOKS IN ${Math.floor(cook)} MIN`, WW * 0.73, HH * 0.12, { size: 30, a: ah * smooth(SEC.burst + 12, SEC.burst + 14, v), align: 'center', color: RED });
        }
      }
      g.globalAlpha = 1;
    },
  };
}

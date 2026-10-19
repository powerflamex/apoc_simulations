// Where everything is, and when each thing gives way (pure data: the scene draws it, audio.mjs hears it).
// Metres; you stand at CAM looking north (-z) across the river. a = atan2(x, -z) is how far right of north a
// point is; the frame shows about a in [-10, 27] degrees (the camera looks 8 degrees right of north).
import { rng, clamp } from './util.js';
import { gAt, vAtG, V_WHEEL, V_BRIDGE, V_CRASH } from './timeline.js';

export const CAM = { x: 0, y: 1.68, z: 6, yaw: -8 };            // yaw in degrees (negative: looking right)
export const FOUNTAIN = { x: 4.3, z: -14, r: 6.5 };
export const ROAD = { z0: -48, z1: -33, lanes: [-35.0, -38.6, -42.4, -46.0] };
export const PROM = { z0: -58, z1: -48 };
export const RIVER = { z0: -330, z1: -58, water: -2.4, bed: -7 };
export const FAR_ROAD = { z0: -352, z1: -338, lanes: [-341, -344.5, -348] };
export const SUN = { az: -62, el: 5.5 };                         // degrees: low on the left (west-north-west)

// ---- the skyline across the river ----
export const B = [];
{
  const R = rng(9001);
  const pal = [0x8a96a6, 0x6f8199, 0x9aa7b4, 0x7d8a8f, 0xa59a8c, 0x8c8278, 0x5f6f80, 0x76909e, 0xb0a48f, 0x6a7a74];
  const occupied = [];
  const free = (x, z, w, d) => !occupied.some((o) => Math.abs(o.x - x) < (o.w + w) / 2 + 4 && Math.abs(o.z - z) < (o.d + d) / 2 + 4);
  const add = (x, z, w, d, h, tag) => {
    if (!free(x, z, w, d)) return null;
    const b = { x, z, w, d, h, color: pal[Math.floor(R() * pal.length)], seed: R(), tag };
    occupied.push(b); B.push(b); return b;
  };
  // the towers you see, biggest first (the downtown cluster just right of centre, behind the bridge)
  const heroes = [[70, -640, 44, 270], [-40, -760, 40, 230], [160, -760, 42, 215], [-120, -620, 36, 180], [20, -940, 48, 250],
    [230, -640, 34, 175], [110, -540, 32, 150], [-80, -1020, 44, 210], [300, -900, 38, 185], [-180, -860, 34, 165]];
  for (const [x, z, w, h] of heroes) add(x, z, w, w * (0.8 + R() * 0.4), h, 'hero');
  // a dense city in the wedge you look at, thinning out to the sides and far away
  for (let k = 0; k < 2600 && B.length < 420; k++) {
    const z = -365 - Math.pow(R(), 1.3) * 1900;
    const a = (-24 + R() * 66) * Math.PI / 180;
    const x = Math.tan(a) * (6 - z);
    const nearBank = z > -420;
    const w = 14 + R() * 26, d = 14 + R() * 26;
    const core = Math.exp(-Math.pow((x - 60) / 380, 2) - Math.pow((z + 760) / 450, 2));
    let h = 16 + Math.pow(R(), 1.8) * 70 + core * R() * 110;
    if (nearBank) h = Math.min(h, 45 + R() * 30);
    add(x, z, w, d, h);
  }
  // and the rest of the city all round (seen from above at the end)
  for (let k = 0; k < 900; k++) {
    const ang = R() * Math.PI * 2, r = 400 + R() * 2200;
    const x = Math.sin(ang) * r, z = -Math.cos(ang) * r;
    if (z > -365 && z < 80) continue;        // (not on the river or our bank in front of us)
    if (z > -365) { if (Math.abs(x) < 160) continue; }
    add(x, z, 16 + R() * 24, 16 + R() * 24, 12 + Math.pow(R(), 2) * 70);
  }
  // our own bank, behind and beside you (only seen when the camera lifts away at the end)
  for (let k = 0; k < 160; k++) {
    const x = (R() - 0.5) * 900, z = 50 + R() * 500;
    if (Math.abs(x) < 70 && z < 90) continue;
    add(x, z, 16 + R() * 22, 16 + R() * 22, 12 + Math.pow(R(), 2) * 50);
  }
}
export const aOf = (x, z) => Math.atan2(x - CAM.x, CAM.z - z) * 180 / Math.PI;
export const inFrame = (b) => { const a = aOf(b.x, b.z); return a > -12 && a < 28; };

// When each building gives way: buildings are built to carry a few times their own weight, so they fail between
// ~6x and ~40x. The big towers in frame come down one after another (the first as the caption says so).
{
  const R = rng(77);
  const heroTimes = [12.9, 14.8, 16.4, 17.9, 19.3, 20.4, 21.6, 22.7, 23.6, 24.4];
  const hs = B.filter((b) => b.tag === 'hero').sort((p, q) => q.h - p.h);
  // first the one most in view, then the rest
  hs.sort((p, q) => Math.abs(aOf(p.x, p.z) - 9) - Math.abs(aOf(q.x, q.z) - 9));
  hs.forEach((b, i) => { b.vFall = heroTimes[i % heroTimes.length]; });
  for (const b of B) {
    if (b.vFall !== undefined) continue;
    const g = 6.5 + Math.pow(R(), 1.2) * 34;
    b.vFall = vAtG(g) + (R() - 0.5) * 0.4;
  }
  for (const b of B) {
    b.lean = (R() - 0.5) * 0.12;                     // which way it tips as it goes
    b.leanAx = R() < 0.5 ? 'x' : 'z';
    b.heap = Math.min(0.16 * b.h, 30) + 2;           // the rubble left behind
  }
}
// how long a collapse takes: close to free fall at that gravity (a tower falls through its own dust)
export const fallDur = (b) => 1.15 * Math.sqrt((2 * b.h) / (9.81 * gAt(b.vFall)));
// 0..1: how far a building has come down
export const fallK = (b, v) => clamp((v - b.vFall) / fallDur(b));

// ---- the Ferris wheel on the far bank, left of centre ----
export const WHEEL = { x: -2, z: -372, y: 70, r: 60, pods: 32, v0: V_WHEEL, v1: V_WHEEL + 1.9 };
// ---- the suspension bridge (right), crossing the river along z at x = BRIDGE.x ----
export const BRIDGE = { x: 92, deck: 11, t1: -180, t2: -292, top: 74, z0: -58, z1: -330, w: 20, v0: V_BRIDGE };
// ---- the airliner on approach, high over the city: it loses lift, then falls behind the skyline ----
export const PLANE = { crash: V_CRASH, z: -1650 };

// ---- lamps, trees, benches on our bank ----
export const LAMPS = [];
{
  for (let x = -66; x <= 66; x += 22) LAMPS.push({ x, z: -31, h: 4.6 });
  for (let x = -55; x <= 77; x += 22) LAMPS.push({ x, z: -50.5, h: 5.2 });
  for (const [x, z] of [[-18, -6], [26, -6], [-24, 14], [30, 14]]) LAMPS.push({ x, z, h: 4.6 });
  const R = rng(5);
  for (const l of LAMPS) { l.g = 8 + R() * 10; l.dir = R() * Math.PI * 2; }
}
export const TREES = [];
{
  const R = rng(11);
  for (let x = -150; x <= 160; x += 11 + R() * 2) TREES.push({ x: x + (R() - 0.5) * 2, z: -53.5 + (R() - 0.5), s: 0.9 + R() * 0.3 });
  for (const sx of [-1, 1]) for (let z = 26; z >= -26; z -= 9) TREES.push({ x: sx * (36 + R() * 3), z, s: 0.85 + R() * 0.3 });
  for (const t of TREES) { t.gs = 2.2 + R() * 1.2; t.gf = 5 + R() * 4.5; t.lean = (R() - 0.5) * 0.6; t.seed = R(); }
}
export const BENCHES = [];
{
  for (const [x, z, yaw] of [[-12, -4, 0.3], [18, -3, -0.4], [-20, -22, Math.PI / 2], [26, -22, -Math.PI / 2], [-6, -29, Math.PI], [14, -29, Math.PI],
    [-34, -10, Math.PI / 2], [36, 2, -Math.PI / 2]]) BENCHES.push({ x, z, yaw });
}

// "What if a nuke hit your city? Survive the first hour" (16:9, 30 fps, no voice). The story as functions of the video
// clock v. Story time t is seconds since the flash; the video jumps through the hour in chapters (the stamp says how
// far in), and the counter always shows the true time since the flash.
//
// The bomb and the numbers (the same as the Short week 6/biggest-nuke, see short.js for the sources):
//   - the Tsar Bomba's 50 megatons, set off 2.5 miles (4 km) up; you are 13.35 miles from ground zero, on a hill.
//   - the blast reaches you 47 s after the flash (the 1 Mt sequence in Glasstone & Dolan, scaled by the cube root of the
//     yield), at 5 psi with a 160 mph wind behind it, moving ~860 mph as it gets to you.
//   - the heat: a 50 Mt fireball's light peaks ~5 s in (Glasstone: t_max = 0.0417 W^0.44 s) and keeps coming for about
//     ten times that, ~50 s, which is "almost a minute"; at 13 miles it is about 100 cal/cm^2 in the open, far past what
//     sets clothes, wood and awnings alight, which is why you get into the shade in the first two seconds and stay there.
//   - the cloud: 42 miles (67 km) high and 59 miles (95 km) wide when it stops rising (Tsar Bomba test, 1961); big clouds
//     stop rising about ten minutes in. You are 13 miles from its middle: under it.
//   - fallout: the test's fireball never touched the ground and the bomb was 97% fusion; the site was safe to walk
//     two hours later. So the ash at 0:30 in is from the fires. The advice (Ready.gov / CDC) is the same either way:
//     get inside, stay inside 24 hours, take off your outer layer.
//   - fires: ~100 cal/cm^2 lights everything in the open; the fires join into a firestorm that pulls wind in toward
//     the city (Hiroshima's started ~20 min after the bomb). Open ground, upwind, is the safe place.
//   - windows broken out to 900 km (560 miles) at the test.
// What is drawn vs real: the fireball's picture runs a few seconds ahead of the clock early on (as in the Short); the
// dust wall is drawn taller than real so it can be seen from miles off; the cloud is drawn at its real size.
import { smooth, clamp, lerp } from './util.js';
import { miAt } from './short.js';

export const STORY_START = 0;
export const D_MI = 13.35;
export const T_HIT = 47.0;                   // the blast reaches you (story seconds after the flash)
export const V_FLASH = 12.0;                  // the flash, on the video clock
// video clock -> story clock, chapter by chapter: [video from, video to, story at from, story seconds per video second]
export const SEGS = [
  [5, 58.6, -7, 1],                           // the evening and the 47 seconds, in real time
  [58.6, 60.7, 46.6, 1 / 3],                  // the hit, slowed down 3x (labelled on the counter)
  [60.7, 63.7, 47.3, 1],                      // the stairwell, a few seconds
  [63.7, 67.7, 53.6, 1],                      // ...and the moment the wind comes back
  [67.7, 74, 300, 4],                         // 5 MINUTES IN: out through the lobby
  [74, 104, 324, 4],                          // the street, the cloud overhead
  [104, 140, 600, 5],                         // 10 MINUTES IN: the cloud stops rising, your building burns
  [140, 170, 1200, 6],                        // 20 MINUTES IN: the wind pulls toward the fire, the gas main
  [170, 215, 1800, 6],                        // 30 MINUTES IN: the park; something starts falling
  [215, 245.5, 2700, 900 / 30.5],             // 45 MINUTES IN: the garage; texts get through
  [245.5, 270, 3600, 1],                      // THE FIRST HOUR
];
export const VIDEO_DURATION = 258;
export const FF_LEN = 5.0;
// the flash-forward: the last seconds before the wall, from the Short's spot on the promenade (story time 43.6 .. 47.1),
// the last 0.6 s before the hit slowed 3x
export function storyOf(v) {
  if (v < FF_LEN) return v < 2.8 ? 43.6 + v : v < 4.6 ? 46.4 + (v - 2.8) / 3 : T_HIT + (v - 4.6) * 0.3;
  for (const [a, b, t0, r] of SEGS) if (v >= a && v < b) return t0 + (v - a) * r;
  const [a, , t0, r] = SEGS[SEGS.length - 1];
  return t0 + (v - a) * r;
}
// the gas main that blows up ahead of you, the burning slab off your building (video times)
export const GAS = { x: -6.5, z: 82, t: 158.0 };
export const SLAB_FALL = { x: -22.5, y: 30, z: 15, v: 119.0 };
// the garage's moments and the end (video times)
export const V_RADIO = 221.6, V_TEXT = 233.3, V_SIREN = 243.0, V_HOUR = 245.5, V_WHITE = 248.8;
export const isSlow = (v) => (v >= 58.6 && v < 60.7) || (v >= 2.8 && v < 4.6);

// where you are (main.js has the camera for each)
export const SHOTS = [
  [0, 5, 'ff'],
  [5, 60.7, 'street'],       // the sidewalk, the doorway (cut between views every few seconds), the lobby, the stairwell door
  [60.7, 67.7, 'stairs'],
  [67.7, 74, 'lobby'],
  [74, 104, 'after'],
  [104, 140, 'burning'],
  [140, 170, 'walk'],
  [170, 215, 'park'],
  [215, 258, 'garage'],
];
export function shotAt(v) {
  for (const s of SHOTS) if (v >= s[0] && v < s[1]) return { from: s[0], to: s[1], scene: s[2], u: (v - s[0]) / (s[1] - s[0]), dt: v - s[0] };
  const s = SHOTS[SHOTS.length - 1];
  return { from: s[0], to: s[1], scene: s[2], u: 1, dt: v - s[0] };
}

// chapter stamps (big, for 2.6 s)
export const CHAPTERS = [
  { v: 67.7, stamp: '5 MINUTES IN' },
  { v: 104, stamp: '10 MINUTES IN' },
  { v: 140, stamp: '20 MINUTES IN' },
  { v: 170, stamp: '30 MINUTES IN' },
  { v: 215, stamp: '45 MINUTES IN' },
  { v: 245.7, stamp: 'YOU MADE IT THROUGH THE FIRST HOUR', small: true },
];
export function stampAt(v) {
  for (const c of CHAPTERS) if (v >= c.v && v < c.v + (c.small ? 3.4 : 2.6)) return { say: c.stamp, dt: v - c.v, small: c.small, dur: c.small ? 3.4 : 2.6 };
  return null;
}

// the counter: the clock before the flash, the blast's countdown, then the hour
const two = (x) => String(Math.floor(x)).padStart(2, '0');
const hourFmt = (t) => {
  if (t >= 3600) return '1:00:00.00';
  const m = Math.floor(t / 60), sec = t - m * 60;
  return `${m}:${two(sec)}.${two((sec % 1) * 100)}`;
};
export const dangerAt = (t) => (t < 300 ? 'THE BLAST' : t < 2040 ? 'FIRE' : 'FALLOUT');
export const COUNTERS = [
  { from: -1, to: V_FLASH, label: 'TONIGHT', value: (v) => storyOf(v), fmt: (t) => { const s = 41 * 60 + 53 + t; return `8:${two(s / 60 % 60)}:${two(s % 60)} PM`; }, unit: () => '' },
  {
    from: V_FLASH + 2.0, to: 60.7, label: 'BLAST REACHES YOU IN',
    labelFn: (v) => (isSlow(v) ? 'BLAST REACHES YOU IN  ·  SLOW MOTION' : 'BLAST REACHES YOU IN'),
    value: (v) => T_HIT - storyOf(v), fmt: (x) => `${Math.max(0, x).toFixed(2)} s`,
    unit: (v) => `${Math.max(0, D_MI - miAt(storyOf(v))).toFixed(2)} MILES AWAY`,
  },
  { from: 60.7, to: 249.2, label: 'SURVIVE THE FIRST HOUR', value: (v) => Math.min(storyOf(v), 3600), fmt: hourFmt, unit: (v) => (storyOf(v) >= 3600 ? 'DONE' : `DANGER NOW: ${dangerAt(storyOf(v))}`) },
];
// (in the flash-forward the countdown shows the Short's last seconds: the same numbers as at 0:56-1:00)
export const FF_COUNTER = {
  label: (v) => (isSlow(v) ? 'BLAST REACHES YOU IN  ·  SLOW MOTION' : 'BLAST REACHES YOU IN'),
  value: (v) => `${Math.max(0, T_HIT - storyOf(v)).toFixed(2)} s`,
  unit: (v) => `${Math.max(0, D_MI - miAt(storyOf(v))).toFixed(2)} MILES AWAY`,
};

// your phone: cards top right. kind: msg (a text to you), me (yours: Not Delivered / Delivered), radio, sys
export const NOTES = [
  [5.6, 3.6, 'msg', 'Jay', 'where are you? it starts at 9'],
  [9.0, 2.9, 'msg', 'Mom', 'text me when you get there'],
  [22.4, 4.0, 'me', 'You', 'mom did you see that', 'Not Delivered'],
  [79.0, 3.8, 'me', 'You', 'im ok. are you ok??', 'Not Delivered'],
  [97.0, 3.4, 'sys', 'No Service', 'Emergency calls only. Calls are not connecting.'],
  [136.2, 3.4, 'me', 'You', 'leaving the building. its on fire', 'Not Delivered'],
  [221.6, 5.4, 'radio', 'Car radio · Emergency broadcast', 'Stay inside a solid building for at least 24 hours. Do not go outside.'],
  [233.3, 3.0, 'me', 'You', 'mom im alive. in a garage', 'Delivered', true],
  [236.3, 2.5, 'msg', 'Mom', 'OH THANK GOD. we\'re ok. stay there'],
  [238.8, 2.4, 'msg', 'Dad', 'don\'t go outside. we\'ll come for you'],
  [241.2, 2.0, 'msg', 'Jay', 'made it to a basement. you??'],
];
export function noteAt(v) {
  for (const n of NOTES) if (v >= n[0] - 0.05 && v < n[0] + n[1]) return { v0: n[0], dur: n[1], kind: n[2], from: n[3], text: n[4], fail: n[5], ok: n[6], dt: v - n[0] };
  return null;
}

// gold popups: what is happening (a phrase, no number)
export const POP = 1.9;
export const POPS = [
  [V_FLASH + 1.0, 'GET OUT OF THE LIGHT'],
  [V_FLASH + 8.2, 'THE WHOLE CITY GOES DARK'],
  [V_FLASH + 20.2, 'ANYTHING IN THE LIGHT CATCHES FIRE'],
  [V_FLASH + 28.9, 'THE HELICOPTER GOES DOWN'],
  [V_FLASH + 36.4, 'IT FILLS THE SKY'],
  [V_FLASH + 40.0, 'THE BLAST IS COMING UP THE HILL'],
  [64.6, 'THE WIND COMES BACK'],
  [76.0, 'THE WHOLE CITY IS ON FIRE'],
  [89.0, 'IT\'S RIGHT ABOVE YOU'],
  [113.5, 'YOUR BUILDING IS ON FIRE'],
  [131.0, 'THE WIND TURNS TOWARD THE FIRE'],
  [149.0, 'THE WIND PULLS EVERYTHING IN'],
  [158.2, 'A GAS MAIN EXPLODES'],
  [173.4, 'THE FIRES BECOME ONE'],
  [197.0, 'SOMETHING IS FALLING'],
  [234.2, 'A TEXT GETS THROUGH'],
  [243.6, 'HELP IS ON THE WAY'],
];
export function popupAt(v) {
  if (stampAt(v)) return null;
  for (const [t, say] of POPS) if (v >= t && v < t + POP) return { say, dt: v - t };
  return null;
}

// captions (italic, lower middle): only in the gaps
export const CAPS = [
  [V_FLASH + 3.4, V_FLASH + 6.8, 'You\'re 13 miles from the bomb.'],
  [V_FLASH + 11.0, V_FLASH + 14.8, 'Stay out of its light. The heat lasts almost a minute.'],
  [V_FLASH + 22.4, V_FLASH + 26.2, 'A wall of air is coming at 860 mph.'],
  [V_FLASH + 31.6, V_FLASH + 35.4, 'When it hits, every window turns into flying glass.'],
  [V_FLASH + 42.7, V_FLASH + 44.8, 'Get inside. Away from the windows.'],
  [V_FLASH + 44.9, V_FLASH + 46.4, 'Get down.'],
  [61.0, 63.6, 'Stay down. It isn\'t over.'],
  [70.6, 73.8, 'Most buildings out here are still standing.'],
  [83.5, 87.6, 'This bomb broke windows 560 miles away.'],
  [92.0, 96.0, 'You\'re standing under the cloud.'],
  [99.6, 103.6, 'The blast is over. Now it\'s the fire.'],
  [107.0, 111.6, 'The cloud is now 40 miles high, and 60 miles wide.'],
  [124.6, 129.0, 'Every fire in the city is pulling in air.'],
  [133.6, 138.6, 'Fire is the biggest danger now. Move away from it.'],
  [143.0, 147.4, 'Walk into the wind: it blows toward the fire.'],
  [151.4, 155.8, 'Cover your mouth. Smoke kills more people than flames.'],
  [162.0, 166.6, 'Broken gas lines feed the fires all over the city.'],
  [177.4, 182.0, 'A firestorm. It pulls in air from miles around.'],
  [184.0, 188.6, 'Open ground is the safest place from fire.'],
  [200.0, 204.6, 'It\'s ash from the fires. Fallout would look the same.'],
  [205.4, 210.4, 'This bomb went off 2.5 miles up. Most of its fallout rose with the cloud.'],
  [210.8, 214.6, 'But you can\'t know that. Get under concrete.'],
  [217.8, 221.2, 'Concrete and earth block most of the radiation.'],
  [228.4, 232.8, 'Take off your outer layer. It holds most of the fallout.'],
];
export function captionAt(v) {
  if (popupAt(v) || stampAt(v)) return null;
  for (const [a, b, text] of CAPS) if (v >= a && v <= b) return { text, a: Math.min(clamp((v - a) / 0.35), clamp((b - v) / 0.45)) };
  return null;
}

// the closing (after the white-out)
export const CLOSING = [[251.0, VIDEO_DURATION - 0.5, 'Would you have made it?']];

// ---------- the state of the world at video time v ----------
export function state(v) {
  const t = storyOf(v);
  const shot = shotAt(v);
  const s = { v, t, shot: shot.scene, u: shot.u, dt: shot.dt, ff: v < FF_LEN ? 1 : 0, slow: isSlow(v) };
  s.after = t > T_HIT + 0.5 ? 1 : 0;
  // how far the night has come on (the sun set just before the flash), how much of the sky the cloud's cap covers
  s.night = smooth(0, 1500, t);
  s.cap = smooth(120, 700, t);
  // the fires: the rooms behind the broken windows, the city on the plain, the wind they pull in
  s.roomFire = s.after ? 0.06 + 0.18 * smooth(200, 1400, t) + 0.08 * smooth(1400, 2400, t) : 0;
  s.storm = smooth(700, 1900, t);
  s.ash = smooth(1950, 2030, t);
  // the white at the end
  s.white = smooth(V_WHITE, V_WHITE + 1.4, v) * (1 - smooth(V_WHITE + 1.6, V_WHITE + 2.2, v));
  s.black = smooth(V_WHITE + 1.6, V_WHITE + 2.0, v);
  // the white at the flash (it blinds the frame for a moment) and the white cut out of the flash-forward
  s.flashW = v >= V_FLASH - 0.02 && v < V_FLASH + 3 ? Math.exp(-Math.max(v - V_FLASH, 0) / 0.32) * smooth(V_FLASH - 0.02, V_FLASH + 0.02, v) : 0;
  s.ffWhite = v < FF_LEN + 0.4 ? smooth(FF_LEN - 0.32, FF_LEN - 0.12, v) * (1 - smooth(FF_LEN + 0.05, FF_LEN + 0.4, v)) : 0;
  return s;
}
export { lerp };

// "What if your speed doubled every 2 seconds?" — the story as functions of VIDEO time v (seconds).
// You start running down 42nd Street in New York at Manhattanhenge (the sunset lined up with the street).
// Your speed doubles every 2 seconds of story time T: mph = 8 * 2^(T/2). Through the city the video runs in real
// time (T = v - 2); in space it runs as a time-lapse (the badge says how much), so the whole run fits in a minute:
// the sound barrier on the street, orbital speed over New Jersey, light speed lapping Earth, past light speed
// Earth breaks apart, then you lap the Sun and the whole solar system until it is a ball of light. That ball
// fills the screen with white, and the white clears onto the first frame (the video loops).
import { smooth, keys, clamp, lerp } from './util.js';

export const STORY_START = 0;           // everything here runs on the video clock
export const T_SWITCH = 66.0;           // full white (the ball of light); the loop point sits in it
export const LOOP = 0.9;                // the white clears onto the first frame over the last LOOP seconds
export const VIDEO_DURATION = T_SWITCH + LOOP;
export const V_GO = 2.0;                // you start running

// ---- physics ----
export const MPH0 = 8;                  // your first stride
export const C_MPH = 670616629;         // light
export const SOUND_MPH = 767;
export const ORBIT_MPH = 17500;
export const EARTH_MI = 24901;          // once round Earth
export const SUN_LAP_MI = 5.84e8;       // once round the Sun along Earth's orbit
export const SOLAR_LAP_MI = 1.76e10;    // once round Neptune's orbit
export const mphAtT = (T) => (T < 0 ? 0 : MPH0 * Math.pow(2, T / 2));
export const TofMph = (m) => 2 * Math.log2(m / MPH0);
// distance run (m) after T seconds
const V0MS = MPH0 * 0.44704;
export const distAtT = (T) => (T <= 0 ? 0 : V0MS * 2 / Math.LN2 * (Math.pow(2, T / 2) - 1));
export const TofDist = (d) => 2 * Math.log2(d / (V0MS * 2 / Math.LN2) + 1);

// ---- story time vs video time: real time in the city, a time-lapse in space ----
const RATE = [[-5, 1], [23.6, 1], [25.4, 2.6], [34.6, 2.6], [36.4, 1.0], [48.6, 1.0], [50.6, 2.45], [80, 2.45]];
const DV = 1 / 240, V0 = -5, V1 = 80;
const NS = Math.round((V1 - V0) / DV) + 1;
const Ttab = new Float64Array(NS);
{
  const i0 = Math.round(-V0 / DV);
  Ttab[i0] = -V_GO;
  for (let i = i0 + 1; i < NS; i++) { const v = V0 + (i - 0.5) * DV; Ttab[i] = Ttab[i - 1] + keys(RATE, v) * DV; }
  for (let i = i0 - 1; i >= 0; i--) { const v = V0 + (i + 0.5) * DV; Ttab[i] = Ttab[i + 1] - keys(RATE, v) * DV; }
}
export const storyT = (v) => { const f = clamp((v - V0) / DV, 0, NS - 1.001), i = Math.floor(f); return lerp(Ttab[i], Ttab[i + 1], f - i); };
export const rateAt = (v) => keys(RATE, v);
// video time at which story time reaches T (inverse of storyT)
export function vAtT(T) {
  let lo = V0, hi = V1;
  for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (storyT(m) < T) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
export const mphAt = (v) => mphAtT(storyT(v));
export const distAt = (v) => distAtT(storyT(v));

// ---- the big moments (video time) ----
export const V_SOUND = vAtT(TofMph(SOUND_MPH));     // ~15.2 s: the sonic boom
export const V_ORBIT = vAtT(TofMph(ORBIT_MPH));     // ~24.2 s: orbital speed -> white -> space
export const V_LIGHT = vAtT(TofMph(C_MPH));         // ~36 s: light speed
export const V_BOOM = 49.4;                         // Earth breaks apart
export const V_SUN = 51.0;                          // cut to the solar system
export const V_BALL = 62.0;                         // the paths wrap the solar system in light

// the city (metres along 42nd Street, west = -z): avenues, Times Square, the river, New Jersey
export const AVENUES = [
  { z: 280, name: '5TH AVE', w: 30 },
  { z: -40, name: '6TH AVE', w: 30 },           // you start just short of 6th Ave, by Bryant Park
  { z: -310, name: 'BROADWAY', w: 62 },         // Times Square: Broadway and 7th Ave cross here
  { z: -580, name: '8TH AVE', w: 30 },
  { z: -840, name: '9TH AVE', w: 30 },
  { z: -1100, name: '10TH AVE', w: 30 },
  { z: -1360, name: '11TH AVE', w: 32 },
  { z: -1620, name: '12TH AVE', w: 40 },
];
export const RIVER_Z0 = -1672, RIVER_Z1 = -2900;   // the Hudson
export const NJ_Z = RIVER_Z1;

export const CAPTIONS = [
  [V_GO + 0.35, 5.6, 'Go. Your speed doubles every 2 seconds.'],
  [5.9, 8.6, "You just passed Usain Bolt. And every cab on 42nd Street."],
  [8.9, 11.5, 'The wind hits you like a hurricane.'],
  [11.8, 14.6, 'Faster than a Formula 1 car. Times Square is a blur.'],
  [V_SOUND + 0.05, V_SOUND + 2.1, 'Boom. You just broke the sound barrier.'],
  [V_SOUND + 2.3, V_SOUND + 4.4, 'Every window behind you shatters.'],
  [V_SOUND + 4.7, 23.6, 'The air in front of you is crushed white-hot.'],
  [V_ORBIT + 0.5, V_ORBIT + 3.4, 'Orbital speed. From space you are a streak of fire.'],
  [V_ORBIT + 3.8, V_ORBIT + 6.8, 'One lap of Earth used to take 85 minutes. Then seconds.'],
  [V_LIGHT - 2.9, V_LIGHT + 0.1, 'Light speed: 7.5 laps of Earth every second.'],
  [V_LIGHT + 0.4, V_LIGHT + 3.0, 'Physics says you stop here. You don\'t.'],
  [V_LIGHT + 3.3, V_LIGHT + 6.0, 'Every lap bends a little. The air catches fire.'],
  [V_LIGHT + 6.3, V_LIGHT + 8.8, 'The oceans boil away.'],
  [V_LIGHT + 9.1, V_BOOM - 0.2, 'The crust melts. Earth can\'t hold together.'],
  [V_BOOM + 0.2, V_SUN - 0.05, 'Earth: gone. You: still running.'],
  [V_SUN + 0.3, V_SUN + 3.0, 'Nothing left to run on? Run around the Sun.'],
  [V_SUN + 3.3, V_SUN + 6.4, 'Past Mars. Past Jupiter. Out past Neptune.'],
  [V_SUN + 6.7, V_BALL + 0.2, 'You lap the whole solar system faster than a heartbeat.'],
  [V_BALL + 0.5, T_SWITCH - 0.7, 'Where should you run next?'],
];

export function captionAt(v) {
  for (const [a, b, text] of CAPTIONS) {
    if (v >= a - 0.01 && v <= b + 0.01) {
      const fadeIn = clamp((v - a) / 0.4);
      const fadeOut = clamp((b - v) / 0.4);
      return { text, alpha: Math.min(fadeIn, fadeOut), rise: (1 - fadeIn) * 14 };
    }
  }
  return null;
}

// ---- the counter ----
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
const fmtX = (x) => (x < 10 ? x.toFixed(1) : fmtInt(x));
const fmtTime = (s) => (s >= 90 ? `${Math.round(s / 60)} MIN` : s >= 10 ? `${Math.round(s)} S` : `${s.toFixed(1)} S`);
const machTempF = (M) => { const K = 288 * (1 + 0.2 * M * M); return (K - 273.15) * 9 / 5 + 32; };
function speedNote(mph, v) {
  if (v >= V_SUN - 0.4) {
    const sunLaps = mph / 3600 / SUN_LAP_MI, solar = mph / 3600 / SOLAR_LAP_MI;
    if (solar >= 1.05) return `${fmtX(solar)} LAPS OF THE WHOLE SOLAR SYSTEM EVERY SECOND`;
    if (v > V_SUN + 3.3) {
      const r = sunLaps;   // the path widens lap by lap (see solarPathRadius): name the orbit it is passing
      const au = solarPathAU(v);
      const pl = au < 1.4 ? 'EARTH' : au < 4 ? 'MARS' : au < 8 ? 'JUPITER' : au < 15 ? 'SATURN' : au < 25 ? 'URANUS' : 'NEPTUNE';
      return `OUT PAST THE ORBIT OF ${pl}`;
    }
    return `ONE LAP OF THE SUN: ${fmtTime(1 / sunLaps)}`;
  }
  if (v >= V_BOOM - 0.1) return 'EARTH: GONE';
  if (mph >= ORBIT_MPH * 0.98) {
    const laps = mph / 3600 / EARTH_MI;
    if (laps >= 1) return `${fmtX(laps)} LAPS OF EARTH EVERY SECOND`;
    return `ONE LAP OF EARTH: ${fmtTime(1 / laps)}`;
  }
  const M = mph / SOUND_MPH;
  if (M >= 12) return `MACH ${Math.round(M)} · HOTTER THAN THE SUN'S SURFACE`;
  if (M >= 4) return `MACH ${Math.round(M)} · AIR AT YOUR SKIN ${fmtInt(Math.round(machTempF(M) / 100) * 100)} °F`;
  if (M >= 1) return `MACH ${M.toFixed(1)} · FASTER THAN SOUND`;
  const notes = [[0, "YOU'RE OFF"], [20, 'SPRINTING'], [24, 'NYC SPEED LIMIT · 25 MPH'], [27.8, 'USAIN BOLT · 28 MPH'], [45, 'FASTER THAN THE CABS'],
    [70, 'CHEETAH · 70 MPH'], [100, 'HURRICANE-FORCE WIND'], [230, 'FORMULA 1 CAR · 230 MPH'], [270, 'BULLET TRAIN · 270 MPH'], [575, 'AIRLINER · 575 MPH']];
  let n = notes[0][1];
  for (const [m, t] of notes) if (mph >= m) n = t;
  return n;
}
export const COUNTERS = [
  {
    from: -3, to: V_GO, label: 'YOU START RUNNING IN', fmt: (x) => `${x.toFixed(1)} s`, value: (v) => Math.max(0, V_GO - v),
    unit: () => 'MANHATTANHENGE · 42ND STREET, NEW YORK',
  },
  {
    from: V_GO, to: T_SWITCH, label: 'YOUR SPEED',
    fmt: (m) => (m >= C_MPH * 0.9995 ? `${fmtX(m / C_MPH)}× light speed` : `${fmtInt(m)} mph`),
    value: (v) => mphAt(v),
    unit: (v) => speedNote(mphAt(v), v),
    badge: (v) => { const r = rateAt(v); return r > 1.3 ? `TIME-LAPSE ${Math.round(r * 2) / 2}×` : ''; },
  },
];

// ---- the solar-system part: the path's radius (AU) widens lap by lap, then wraps everything ----
export const solarPathAU = (v) => keys([[V_SUN, 1.0], [V_SUN + 2.6, 1.0], [V_SUN + 4.0, 1.6], [V_SUN + 5.2, 5.4], [V_SUN + 6.2, 12], [V_SUN + 7.4, 31], [80, 31]], v, true);

// ---- state ----
export function state(v) {
  const s = { v };
  s.T = storyT(v);
  s.mph = mphAt(v);
  s.dist = distAt(v);
  s.rate = rateAt(v);
  s.mach = s.mph / SOUND_MPH;
  // scenes: the street (to orbital speed), Earth from space, the solar system
  s.scene = v < V_ORBIT ? 'street' : v < V_SUN ? 'earth' : 'solar';
  // the white flashes: orbital speed (plasma -> white -> space), Earth breaking apart, the ball of light (loop)
  s.flash = Math.max(
    smooth(V_ORBIT - 0.55, V_ORBIT, v) * (1 - smooth(V_ORBIT, V_ORBIT + 0.7, v)),
    smooth(V_BOOM - 0.12, V_BOOM, v) * (1 - smooth(V_BOOM + 0.03, V_BOOM + 0.45, v)) * 0.55,
    smooth(T_SWITCH - 2.2, T_SWITCH, v),
  );
  s.flashColor = '#fffaf2';
  s.heat = smooth(TofMph(SOUND_MPH * 4), TofMph(ORBIT_MPH * 0.95), s.T);    // the air glowing in front of you
  s.lookBack = smooth(V_SOUND + 0.35, V_SOUND + 0.95, v) * (1 - smooth(V_SOUND + 3.5, V_SOUND + 4.1, v));   // you look over your shoulder at the boom
  s.title = 1 - smooth(3.0, 3.9, v);
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}

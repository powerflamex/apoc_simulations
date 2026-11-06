// "What if you jumped off the space station?" — the story as functions of VIDEO time v (seconds; STORY_START = 0).
// You float outside the station's Cupola, 420 km up, going 7.66 km/s (17,140 mph) like the station. You push off
// (V_JUMP) and nothing happens: you keep the same speed, so you drift beside it instead of falling. The air is so
// thin up there that it takes a year and a half to drag you down; your suit's oxygen lasts 8 hours.
// The real numbers (worked out with a full orbit simulation, Vallado's exponential atmosphere at moderate solar
// activity, a 207 kg person-plus-suit tumbling with 0.8 m² in the way of the air, Cd 2.2):
//   - 420 km up: 7,661 m/s = 17,138 mph; one orbit every 92.8 min (15.5 sunrises a day);
//   - a leap of ~1.2 m/s: 6 m away after 5 s, about 20 km after 8 hours (the station is a dot);
//   - the drag: 400 km after 167 days, 300 km after 486 days, 200 km after 529, then the last 200 km in 2.4 days;
//     120 km at 531.4 days (1 year 166 days); the last orbit from 120 km to the fireball takes ~30 min;
//   - at 100 km you are doing 7,820 m/s (17,500 mph): the air starts to glow; peak heating ~70-80 km; the suit
//     comes apart around 70 km; by 60 km it is a fireball doing 5.7 km/s.
// The counter shows the true height and the true time (TABLE below: [seconds since the jump, height m, speed m/s]
// every km on the way down).
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const V_JUMP = 3.0;               // you push off
export const V_LAPSE = 8.0;              // the 8-hour time-lapse starts (locked shot over your shoulder)
export const V_FRONT = 12.3;             // the cut to you from the front, at the second sunrise
export const V_O2 = 14.0;                // the oxygen runs out
export const V_DROP = 20.0;              // the drag time-lapse: the height starts dropping
export const V_GLOW = 28.0;              // the first glow round the suit (120 km)
export const V_FIRE = 35.0;              // full re-entry fire, the suit comes apart (85 km)
export const V_GROUND = 42.0;            // the cut to the person on the ground
export const V_BACK = 43.5;              // back to the fireball
export const V_BURST = 46.6;             // the fireball bursts: the white starts
export const T_SWITCH = 47.6;            // full white; the loop point sits in it
export const LOOP = 0.9;                 // the white clears onto the first frame over the last LOOP seconds
export const VIDEO_DURATION = T_SWITCH + LOOP;

export const GM = 3.986004418e14, R_E = 6371e3;
export const H0 = 420e3;                 // m
export const V0 = Math.sqrt(GM / (R_E + H0));              // 7661 m/s
export const PERIOD = 2 * Math.PI * Math.sqrt(Math.pow(R_E + H0, 3) / GM);   // 5569 s
export const N_ORB = 2 * Math.PI / PERIOD;                 // rad/s
export const O2_SECONDS = 8 * 3600;      // a real EVA suit: about 8 hours of oxygen
export const MPH = 2.2369363;
const HR = 3600, DAY = 86400;

// [t since the jump (s), height (m), speed (m/s)] every km from 420 km down
const TABLE = [[0,420000,7661],[845140,419000,7662],[1678260,418000,7662],[2496180,417000,7663],[3298980,416000,7664],[4089260,415000,7664],[4867100,414000,7665],[5630240,413000,7665],[6381280,412000,7666],[7119920,411000,7666],[7846780,410000,7667],[8559560,409000,7668],[9262560,408000,7668],[9952160,407000,7669],[10630100,406000,7669],[11296660,405000,7670],[11952020,404000,7670],[12596420,403000,7671],[13231120,402000,7671],[13853860,401000,7672],[14465540,400000,7673],[15068000,399000,7673],[15657720,398000,7674],[16237880,397000,7674],[16807140,396000,7675],[17364680,395000,7675],[17912600,394000,7676],[18451040,393000,7677],[18979000,392000,7677],[19497040,391000,7678],[20005260,390000,7678],[20505060,389000,7679],[20994260,388000,7679],[21475160,387000,7680],[21947640,386000,7681],[22410320,385000,7681],[22865600,384000,7682],[23311300,383000,7682],[23749800,382000,7683],[24179540,381000,7683],[24601280,380000,7684],[25015360,379000,7685],[25422100,378000,7685],[25820780,377000,7686],[26212360,376000,7686],[26596840,375000,7687],[26973720,374000,7687],[27343760,373000,7688],[27707180,372000,7689],[28064100,371000,7689],[28413840,370000,7690],[28757740,369000,7690],[29094700,368000,7691],[29425540,367000,7691],[29750360,366000,7692],[30069220,365000,7693],[30382260,364000,7693],[30689520,363000,7694],[30990960,362000,7694],[31286620,361000,7695],[31576880,360000,7695],[31861940,359000,7696],[32141740,358000,7697],[32416300,357000,7697],[32685740,356000,7698],[32950180,355000,7698],[33210020,354000,7699],[33464680,353000,7699],[33714880,352000,7700],[33960100,351000,7701],[34201000,350000,7701],[34437500,349000,7702],[34669820,348000,7702],[34897420,347000,7703],[35121100,346000,7703],[35340600,345000,7704],[35556240,344000,7705],[35767640,343000,7705],[35975320,342000,7706],[36179120,341000,7706],[36379300,340000,7707],[36575740,339000,7707],[36768400,338000,7708],[36957740,337000,7709],[37143480,336000,7709],[37325740,335000,7710],[37504800,334000,7710],[37680440,333000,7711],[37852840,332000,7711],[38022120,331000,7712],[38188340,330000,7713],[38351480,329000,7713],[38511460,328000,7714],[38668700,327000,7714],[38822880,326000,7715],[38974380,325000,7715],[39122960,324000,7716],[39268940,323000,7717],[39412100,322000,7717],[39552720,321000,7718],[39690740,320000,7718],[39826180,319000,7719],[39959260,318000,7719],[40089780,317000,7720],[40217820,316000,7721],[40343600,315000,7721],[40467080,314000,7722],[40588240,313000,7722],[40707180,312000,7723],[40824040,311000,7724],[40938660,310000,7724],[41051120,309000,7725],[41161600,308000,7725],[41270000,307000,7726],[41376360,306000,7726],[41480860,305000,7727],[41583360,304000,7728],[41684000,303000,7728],[41782780,302000,7729],[41879760,301000,7729],[41975000,300000,7730],[42068260,299000,7730],[42159540,298000,7731],[42248780,297000,7732],[42336160,296000,7732],[42421640,295000,7733],[42505280,294000,7733],[42587100,293000,7734],[42667120,292000,7735],[42745440,291000,7735],[42822040,290000,7736],[42897020,289000,7736],[42970340,288000,7737],[43042100,287000,7737],[43112300,286000,7738],[43180940,285000,7739],[43248160,284000,7739],[43313880,283000,7740],[43378200,282000,7740],[43441120,281000,7741],[43502660,280000,7742],[43562880,279000,7742],[43621820,278000,7743],[43679480,277000,7743],[43735860,276000,7744],[43791040,275000,7744],[43845040,274000,7745],[43897840,273000,7746],[43949540,272000,7746],[44000080,271000,7747],[44049540,270000,7747],[44097940,269000,7748],[44145280,268000,7748],[44191620,267000,7749],[44236920,266000,7750],[44281260,265000,7750],[44324640,264000,7751],[44367060,263000,7751],[44408580,262000,7752],[44449220,261000,7753],[44488960,260000,7753],[44527840,259000,7754],[44565880,258000,7754],[44603100,257000,7755],[44639500,256000,7756],[44675140,255000,7756],[44709980,254000,7757],[44744100,252999,7757],[44777460,251999,7758],[44810080,251000,7758],[44842020,250000,7759],[44873180,249000,7760],[44903500,248000,7760],[44933040,247000,7761],[44961780,246000,7761],[44989780,244999,7762],[45017020,244000,7763],[45043540,243000,7763],[45069360,242000,7764],[45094500,240999,7764],[45118960,240000,7765],[45142780,239000,7765],[45165960,238000,7766],[45188540,237000,7767],[45210520,236000,7767],[45231920,234999,7768],[45252740,233999,7768],[45273000,233000,7769],[45292740,231999,7770],[45311960,230999,7770],[45330660,229999,7771],[45348860,229000,7771],[45366580,228000,7772],[45383840,226999,7773],[45400640,225999,7773],[45416980,224999,7774],[45432900,223999,7774],[45448400,222999,7775],[45463480,221999,7775],[45478160,221000,7776],[45492460,219999,7777],[45506380,218999,7777],[45519920,217999,7778],[45533100,217000,7778],[45545940,216000,7779],[45558440,214999,7780],[45570600,214000,7780],[45582460,212998,7781],[45593980,211999,7781],[45605200,211000,7782],[45616140,209998,7783],[45626760,209000,7783],[45637120,207999,7784],[45647200,206999,7784],[45657020,205998,7785],[45666560,204999,7786],[45675860,203999,7786],[45684920,202999,7787],[45693720,202000,7787],[45702300,201000,7788],[45710660,199999,7788],[45718755,199000,7789],[45726590,198000,7790],[45734170,196999,7790],[45741495,196000,7791],[45748580,195000,7791],[45755435,193999,7792],[45762060,193000,7793],[45768465,192000,7793],[45774665,190999,7794],[45780655,189999,7794],[45786450,188999,7795],[45792050,188000,7796],[45797470,186999,7796],[45802710,185999,7797],[45807775,185000,7797],[45812675,183999,7798],[45817410,183000,7799],[45821995,181999,7799],[45826425,180999,7800],[45830710,179999,7800],[45834830,179000,7801],[45838775,177999,7802],[45842545,176999,7802],[45846155,175999,7803],[45849605,175000,7803],[45852905,174000,7804],[45856065,173000,7805],[45859090,171999,7805],[45861980,170999,7806],[45864745,170000,7806],[45867390,169000,7807],[45869925,167999,7808],[45872345,166999,7808],[45874665,165998,7809],[45876880,164999,7809],[45879000,163999,7810],[45881030,162999,7811],[45882970,161999,7811],[45884825,161000,7812],[45886605,159998,7812],[45888305,158997,7813],[45889930,157998,7813],[45891485,156999,7814],[45892975,155997,7815],[45894400,154997,7815],[45895760,153999,7816],[45897065,152998,7816],[45898310,151999,7817],[45899505,150998,7818],[45900645,149999,7818],[45901740,148996,7819],[45902770,147997,7819],[45903730,146999,7820],[45904630,145995,7821],[45905470,144999,7821],[45906270,143998,7822],[45907025,142999,7822],[45907740,141995,7823],[45908410,140992,7824],[45909035,139995,7824],[45909620,139000,7825],[45910175,137992,7825],[45910685,137000,7826],[45911165,135992,7827],[45911605,134992,7827],[45912010,133997,7828],[45912390,132986,7828],[45912735,131996,7829],[45913060,130993,7829],[45913360,129998,7830],[45913641,128998,7831],[45913903,127997,7831],[45914146,126999,7832],[45914372,125998,7832],[45914581,124997,7832],[45914773,124000,7833],[45914951,122997,7833],[45915115,121995,7834],[45915266,120993,7834],[45915405,119995,7835],[45915534,118993,7835],[45915653,117994,7835],[45915763,116997,7835],[45915865,116000,7836],[45915960,114997,7836],[45916048,113996,7836],[45916130,112989,7836],[45916205,111997,7835],[45916275,111000,7835],[45916341,109989,7835],[45916402,108983,7834],[45916458,107992,7834],[45916511,106986,7833],[45916560,105987,7832],[45916606,104982,7831],[45916648,103998,7829],[45916688,102994,7827],[45916725,101999,7825],[45916760,100991,7823],[45916793,99972,7820],[45916823,98995,7816],[45916851,97999,7812],[45916877,96995,7808],[45916902,95994,7803],[45916925,94994,7796],[45916947,93999,7789],[45916967,92995,7781],[45916986,91997,7772],[45917004,90999,7762],[45917021,89993,7750],[45917037,88997,7736],[45917051,87989,7721],[45917065,86988,7704],[45917078,85998,7685],[45917090,84994,7664],[45917102,83997,7640],[45917112,82992,7613],[45917123,81984,7584],[45917132,80998,7551],[45917141,79997,7514],[45917150,78984,7473],[45917158,77985,7429],[45917165,76982,7381],[45917172,75978,7328],[45917179,74977,7271],[45917186,73984,7209],[45917192,72971,7141],[45917198,71975,7067],[45917203,70964,6986],[45917208,69981,6901],[45917213,68992,6808],[45917218,67998,6710],[45917223,66961,6602],[45917227,65968,6492],[45917232,64982,6377],[45917236,63956,6251],[45917240,62994,6126],[45917243,61997,5990],[45917247,60966,5842],[45917251,59958,5690],[45917254,58977,5536],[45917258,57968,5372],[45917261,56994,5209],[45917264,55996,5037],[45917267,54975,4856],[45917270,53998,4679],[45917273,52937,4482],[45917276,51993,4303],[45917279,50968,4106],[45917282,50000,3917],[45917285,48952,3709],[45917288,47968,3511],[45917291,46979,3309],[45917293,45989,3106],[45917296,44931,2889],[45917299,43947,2688],[45917302,42970,2491],[45917305,41933,2287],[45917308,40976,2103]];
const T_END = TABLE[TABLE.length - 1][0];
// time at which you reach height h (m): linear between rows (h falls monotonically)
export function tAtH(h) {
  if (h >= TABLE[0][1]) return TABLE[0][0];
  for (let i = 0; i < TABLE.length - 1; i++) {
    const a = TABLE[i], b = TABLE[i + 1];
    if (h <= a[1] && h >= b[1]) return a[0] + (b[0] - a[0]) * (a[1] - h) / (a[1] - b[1]);
  }
  return T_END;
}
// height (m) and speed (m/s) at time T since the jump
export function orbitAt(T) {
  if (T <= 0) return { h: H0, sp: V0 };
  if (T >= T_END) { const e = TABLE[TABLE.length - 1]; return { h: e[1], sp: e[2] }; }
  let lo = 0, hi = TABLE.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (TABLE[m][0] <= T) lo = m; else hi = m; }
  const a = TABLE[lo], b = TABLE[hi], k = (T - a[0]) / Math.max(1e-9, b[0] - a[0]);
  return { h: lerp(a[1], b[1], k), sp: lerp(a[2], b[2], k) };
}

// monotone cubic through [x, y] keys (never overshoots, so the clock never runs backwards)
export function pchip(keys) {
  const xs = keys.map((k) => k[0]), ys = keys.map((k) => k[1]);
  const n = xs.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) { m[i] = 0; continue; }
    const h0 = xs[i] - xs[i - 1], h1 = xs[i + 1] - xs[i], w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
    m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  }
  return (x) => {
    if (x <= xs[0]) return ys[0] + m[0] * (x - xs[0]);
    if (x >= xs[n - 1]) return ys[n - 1] + m[n - 1] * (x - xs[n - 1]);
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// ---- the clock: story time T (s since the jump) at video time v ----
// Real time through the leap, so the speed you see is the true one; then 8 hours in 6 s: the first hour eases in
// (the station shrinks away smoothly instead of vanishing), the rest runs flat out. Then 3 s of real time as the air
// runs out; then the drop, keyed by height so the Earth grows evenly; the last 120 km (half an hour) over the fire.
const KM = (k) => tAtH(k * 1000);
const TK = [
  [-1.5, -4.5], [0, -3], [V_JUMP, 0], [4, 1], [5, 2], [6, 3], [7, 4], [V_LAPSE, 5],
  [8.2, 60], [8.6, 150], [9.0, 400], [9.4, 1000], [9.8, 2100], [10.2, 4000], [V_O2, O2_SECONDS], [17.0, O2_SECONDS + 3], [V_DROP, 2 * DAY],
  [21.6, KM(400)], [23.2, KM(350)], [24.6, KM(300)], [25.8, KM(250)], [26.8, KM(200)], [27.4, KM(150)], [V_GLOW, KM(120)],
  [31.0, KM(100)], [V_FIRE, KM(85)], [38.0, KM(78)], [V_GROUND, KM(72)], [V_BACK, KM(69.5)], [V_BURST, KM(61)],
  [T_SWITCH, KM(58)], [T_SWITCH + LOOP + 0.5, KM(55)],
];
export const storyT = pchip(TK);
export const rateAt = (v) => (storyT(v + 0.004) - storyT(v - 0.004)) / 0.008;    // story s per video s

// the picture's own orbit clock (s): what the ground under you and the sunrises do. In the time-lapses the real
// clock runs thousands of times faster than the eye could follow, so the ground slides past at a readable speed
// and the sun goes round at most about once a second; the counter shows the true time.
const SK = [[-1.5, -4.5], [0, -3], [V_JUMP, 0], [V_LAPSE, 5], [V_O2, 5 + 6 * 60], [17.0, 368], [V_DROP, 818],
  [V_GLOW, 818 + 8 * 150], [31.0, 2018 + 3 * 12], [V_FIRE, 2054 + 4 * 5], [V_GROUND, 2074 + 7 * 2.5], [T_SWITCH + LOOP + 0.5, 2091 + 7 * 2.2]];
export const seenT = pchip(SK);
// the sun's trip round your orbit (deg): ~110 = setting behind you, ~250 = rising over the horizon straight ahead. It
// starts high behind the camera (the station front-lit, and it stays lit while it shrinks); in the 8-hour lapse the
// picture shows a sunrise every 1.7 s, 3 of them, each lingering on the horizon right in front of you (really 5 in 8 hours: the picture is slowed so each one can be seen; the counter keeps the true
// time). Then a long day through the drop, into a sunset that lights the fire from the side.
const SUNK = [[-1.5, 55], [V_LAPSE, 55], [9.7, 95], [10.25, 232], [11.05, 268], [11.95, 592], [12.75, 628], [V_O2, 970], [17.0, 975], [V_DROP, 1040], [V_GLOW, 1090],
  [V_FIRE, 1122], [V_GROUND, 1172], [V_BURST, 1182], [T_SWITCH + LOOP + 0.5, 1184]];
export const sunPhase = pchip(SUNK);
// deg: the orbit's tilt to the Sun. Low at first so each sunrise comes up in frame; it drifts over the year and a half
export const betaAt = (v) => 15 + 20 * smooth(V_O2, V_DROP, v);
// how many sunrises the picture shows per video second right now (to tame the flicker in the soundtrack/lights)
export const sunRate = (v) => Math.abs(sunPhase(v + 0.01) - sunPhase(v - 0.01)) / 0.02 / 360;

// ---- the leap: where the station is, seen from you (m): x right, y up, z back ----
// You leap off the end of the arm at 1.2 m/s, out sideways and a little up, in a dead straight line (no arc: that's
// the point). The distance later on is the real one (Clohessy-Wiltshire, with a little along-track speed, ~20 km after
// 8 hours), straight ahead of you and a little above the horizon, so the station stays in the
// one locked shot of the time-lapse.
export const LEAP = { side: 1.15, up: 0.35 };     // m/s
const AHEAD = [0.05, 0.105, -0.993];              // unit vector
function driftDist(T) {
  const n = N_ORB, xd = LEAP.up, yd = 0.25;
  const x = (xd / n) * Math.sin(n * T) - (2 * yd / n) * Math.cos(n * T) + 2 * yd / n;
  const y = (2 * xd / n) * (Math.cos(n * T) - 1) + (4 * yd / n) * Math.sin(n * T) - 3 * yd * T;
  const z = (LEAP.side / n) * Math.sin(n * T);
  return Math.hypot(x, y, z);
}
export function stationAt(T) {
  if (T <= 0) return { x: 0, y: 0, z: 0, d: 0 };
  return { x: LEAP.side * T, y: -LEAP.up * T, z: 0, d: Math.hypot(LEAP.side, LEAP.up) * T };
}
// in the time-lapse the whole station is ahead of you from the first frame (the cut hides the move; at under ~110 m its
// arrays would wrap round the camera), then shrinks at its real distance
export function stationAhead(T) {
  const d = Math.max(110, Math.hypot(LEAP.side, LEAP.up) * Math.min(T, 200), driftDist(T));
  return { x: AHEAD[0] * d, y: AHEAD[1] * d, z: AHEAD[2] * d, d };
}

// ---- the big moments: popups (one gold phrase, never a number) and the hits in the soundtrack ----
export const BEATS = [
  { v: V_JUMP, hit: 0.45, kind: 'jump' },
  { v: 3.7, hit: 0.0, say: 'YOU DON’T FALL' },
  { v: V_LAPSE, hit: 0.5, kind: 'lapse' },
  { v: V_O2, hit: 0.9, kind: 'o2', say: 'YOUR AIR IS GONE' },
  { v: V_DROP, hit: 0.6, kind: 'drop', say: 'THE AIR DRAGS YOU DOWN' },
  { v: 24.6, hit: 0.55, kind: 'step' },
  { v: V_GLOW, hit: 0.75, kind: 'glow', say: 'THE AIR STARTS TO GLOW' },
  { v: V_FIRE, hit: 1.0, kind: 'fire', say: 'THE SUIT COMES APART' },
  { v: V_GROUND, hit: 0.3, kind: 'ground', say: 'SOMEONE MAKES A WISH' },
  { v: V_BACK, hit: 0.8, kind: 'back' },
  { v: V_BURST, hit: 1.3, kind: 'burst' },
];
export const POP = 1.7;
export function popupAt(v) {
  let b = null;
  for (const x of BEATS) if (x.say && v >= x.v && v < x.v + POP) b = x;
  return b ? { say: b.say, dt: v - b.v } : null;
}
// how hard the camera jolts right now (decays after each beat)
export function joltAt(v) {
  let j = 0;
  for (const b of BEATS) { const dt = v - b.v; if (dt >= 0 && dt < 1.5) j = Math.max(j, Math.exp(-dt * 4) * b.hit); }
  return j;
}

// ---- captions (video time): short, "you", one number; in the gaps between the popups, never over the title ----
export const CAPTIONS = [
  [5.5, 7.9, 'You’re flying 17,140 mph, same as the station. So you just float.'],
  [8.3, 11.1, 'A new sunrise every 93 minutes. The station drifts away.'],
  [11.6, 13.9, '8 hours of oxygen. Nobody is coming to get you.'],
  [16.1, 19.7, 'You’re gone. But the suit keeps circling Earth, 16 times a day.'],
  [22.3, 25.5, 'Even up here, a wisp of air drags you lower, orbit after orbit.'],
  [25.9, 27.9, 'After a year and a half, the air gets thick.'],
  [30.2, 34.6, '17,500 mph into the air. It turns to fire around you.'],
  [37.1, 41.7, 'The air around you hits 2,000°C. Nothing of you reaches the ground.'],
  [44.1, 46.5, 'That shooting star was you.'],
];
export function captionAt(v) {
  if (popupAt(v)) return null;
  for (const [a, b, text] of CAPTIONS) {
    if (v >= a - 0.01 && v <= b + 0.01) {
      const fadeIn = clamp((v - a) / 0.3);
      const fadeOut = clamp((b - v) / 0.3);
      return { text, alpha: Math.min(fadeIn, fadeOut), rise: (1 - fadeIn) * 14 };
    }
  }
  return null;
}

// ---- the counters: HEIGHT (with your speed under it) and OXYGEN LEFT, which becomes SINCE YOU JUMPED ----
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
export function fmtHeight(m) {
  const km = m / 1000;
  if (km >= 100) return `${fmtInt(km)} km`;
  return `${km.toFixed(1)} km`;
}
export function fmtO2(s) {
  s = Math.max(0, Math.floor(s + 1e-6));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), q = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(q).padStart(2, '0')}`;
}
export function sinceText(T) {
  const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 'S'}`;
  if (T < HR) return `${pl(Math.floor(T / 60), 'MINUTE')}`;
  if (T < 2 * DAY) return `${pl(Math.floor(T / HR), 'HOUR')}`;
  if (T < 365.25 * DAY) return `${pl(Math.floor(T / DAY), 'DAY')}`;
  const y = Math.floor(T / (DAY * 365.25)), d = Math.floor((T - y * DAY * 365.25) / DAY);
  return `${pl(y, 'YEAR')}${d ? `, ${pl(d, 'DAY')}` : ''}`;
}
export const o2At = (v) => O2_SECONDS - (storyT(v) + 3) - 0.5;      // 7:59:59 on frame 0, 0:00:00 at V_O2
export const V_SINCE = 17.0;               // the second row turns into the time since you jumped
export const COUNTERS = [
  {
    label: () => 'HEIGHT',
    fmt: (m) => fmtHeight(m),
    value: (v) => orbitAt(storyT(v)).h,
    unit: (v) => `${fmtInt(orbitAt(storyT(v)).sp * MPH)} MPH`,
    tag: (v) => (rateAt(v) > 1.25 ? 'TIME-LAPSE' : ''),
  },
  {
    label: (v) => (v < V_SINCE ? 'OXYGEN LEFT' : 'SINCE YOU JUMPED'),
    fmt: (x) => x,
    value: (v) => (v < V_SINCE ? fmtO2(o2At(v)) : sinceText(storyT(v))),
    unit: () => '',
    tag: () => '',
  },
];

// ---- state ----
export function state(v) {
  const s = { v };
  s.T = storyT(v);
  const o = orbitAt(s.T);
  s.h = o.h; s.speed = o.sp;
  s.rate = rateAt(v);
  s.o2 = o2At(v);
  s.dead = smooth(V_O2, V_O2 + 1.5, v);                        // the body goes limp
  s.pushed = smooth(V_JUMP - 0.35, V_JUMP + 0.25, v);          // the push-off
  // the glow of the air round the suit: faint pink from 120 km, white-hot by 70 km
  s.glow = smooth(125e3, 95e3, s.h) * 0.35 + smooth(100e3, 80e3, s.h) * 0.4 + smooth(82e3, 66e3, s.h) * 0.45;
  s.breakup = smooth(V_FIRE - 0.5, V_BACK + 1.5, v);           // parts come off
  s.fireball = smooth(V_BACK + 0.6, V_BURST + 0.4, v);
  s.flash = smooth(V_BURST, T_SWITCH - 0.03, v);
  s.flashColor = '#fff8f0';
  s.title = 1 - smooth(3.0, 3.6, v);
  s.fadeOut = 0;
  return s;
}

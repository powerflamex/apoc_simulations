// Checks every number the video shows. Earth stops dead at 1 AU and falls straight into the Sun (radial Kepler fall):
//   r = cos^2(b) AU,  t = K (b + sin b cos b),  K = sqrt(a^3 / (2 GM)) with a = 1 AU  (= 41.10 days)
// Temperature: today's average surface (288 K) scaled with the sunlight, T = 288 K / sqrt(r) (same albedo and greenhouse).
//   node physics.mjs
const AU = 1.495978707e8, GM = 1.32712440018e11, RSUN = 695700, DAY = 86400;
const K = Math.sqrt(AU ** 3 / (2 * GM)) / DAY;
const tOfB = (b) => K * (b + Math.sin(b) * Math.cos(b));
const bOfR = (r) => Math.acos(Math.sqrt(r));
const T_HIT = tOfB(bOfR(RSUN / AU));                       // reaches the Sun's surface
export function rAt(t) {                                   // AU, t in days since the stop
  let lo = 0, hi = Math.PI / 2;
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (tOfB(m) < t) lo = m; else hi = m; }
  return Math.cos(lo) ** 2;
}
const F = (r) => (288 / Math.sqrt(r) - 273.15) * 9 / 5 + 32;
const angDeg = (r) => 2 * Math.asin(Math.min(1, RSUN / (r * AU))) * 180 / Math.PI;
const mph = (r) => Math.sqrt(2 * GM * (1 / (r * AU) - 1 / AU)) * 2236.94;
console.log(`K = ${K.toFixed(3)} d; fall to the centre ${(K * Math.PI / 2).toFixed(3)} d; to the surface ${T_HIT.toFixed(4)} d`);
for (const d of [0, 10, 20, 30, 35, 40, 41, 45, 48, 48.5, 49, 52, 55, 56, 57, 58, 59, 60, 61, 61.3, 62, 63, 63.5, 64, 64.3, 64.5]) {
  const r = rAt(d);
  console.log(`day ${String(d).padStart(5)}  r ${r.toFixed(4)} AU  ${Math.round(F(r))}°F  Sun ${angDeg(r).toFixed(2)}° (${(angDeg(r) / angDeg(1)).toFixed(2)}x)  sunlight ${(1 / r / r).toFixed(1)}x  ${Math.round(mph(r)).toLocaleString()} mph  left ${(T_HIT - d).toFixed(3)} d`);
}
for (const m of [24 * 60, 12 * 60, 6 * 60, 3 * 60, 120, 60, 40, 30, 20, 15, 10, 5, 2, 0]) {
  const r = rAt(T_HIT - m / 1440);
  console.log(`${String(m).padStart(5)} min before impact: r ${(r * AU).toExponential(3)} km (${((r * AU - RSUN) / 1e3).toFixed(0)}k km above the surface)  ${Math.round(F(r))}°F  Sun ${angDeg(r).toFixed(1)}°  ${Math.round(mph(r)).toLocaleString()} mph`);
}
// when each line is crossed
const when = (f, target) => { let lo = 0, hi = T_HIT; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (f(rAt(m)) < target) lo = m; else hi = m; } return lo; };
for (const [name, T] of [['150°F', 150], ['water boils 212°F', 212], ['paper 451°F', 451], ['lead melts 621.4°F', 621.4], ['aluminium melts 1221°F', 1221], ['glass softens ~1,500°F', 1500], ['rock melts ~2,000°F', 2000]])
  console.log(`${name}: day ${when(F, T).toFixed(2)} (${((T_HIT - when(F, T)) * 24).toFixed(1)} h before impact)`);
console.log(`Venus's orbit (0.723 AU): day ${when((r) => -r, -0.7233).toFixed(2)};  Mercury's (0.387 AU): day ${when((r) => -r, -0.3871).toFixed(2)}`);
console.log(`1 million mph: ${((T_HIT - when((r) => mph(r), 1e6)) * 1440).toFixed(1)} min before impact; at impact ${Math.round(mph(RSUN / AU)).toLocaleString()} mph`);

// Physics check for "What if the asteroid that killed the dinosaurs hit today?"   node physics.mjs
// The official numbers come from the Imperial College / Purdue calculator "Impact: Earth!" (Collins, Melosh & Marcus 2005),
// run on Nov 14, 2026 at https://impact.ese.ic.ac.uk/ImpactEarth/ImpactEffects/ for: distance 952 km, rock 10 km
// (6.2 mi), 2,700 kg/m3, 20.1 km/s (45,000 mph), 60 degrees, sedimentary target. Its output (abridged):
//   energy 2.9e23 J = 6.8e7 Mt (the usual quote for this rock is "~100 million megatons"; estimates span 1e23-1e25 J)
//   fireball: brightest 6.55 s after; appears 14.5x larger than the Sun; 5.23e7 J/m2 over 28.5 min = 30.6x sunlight;
//             clothing, newspaper, grass and deciduous trees ignite, plywood flames, third-degree burns
//   quake:    magnitude 9.8 ("greater than any earthquake in recorded history"), arrives 3 min 10 s after;
//             here Mercalli IV-V: cars rock, windows and dishes rattle
//   ejecta:   arrives 8 min 0 s after; a fine dusting with occasional larger fragments, 26 cm deep, mean 2.2 mm
//   air blast: arrives 48 min 14 s after; 1.06 bar (15.1 psi); wind 405 mph; buildings and trees flattened
// Below: my own check of the distance, the rock's path in your sky and the same formulas (the ejecta flight-time and
// shock-integration lines are rough cross-checks; the video uses the calculator's times).
const R_E = 6371, g = 9.81e-3; // km, km/s^2
const rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI;
// ---- where ----
const SITE = [21.40, -89.52];          // Chicxulub crater centre
const YOU = [29.951, -90.064];         // Canal St at the river, New Orleans
function gc(a, b) {
  const [la1, lo1] = a.map(rad), [la2, lo2] = b.map(rad);
  const d = 2 * Math.asin(Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2));
  const y = Math.sin(lo2 - lo1) * Math.cos(la2), x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(lo2 - lo1);
  return { km: d * R_E, bear: (deg(Math.atan2(y, x)) + 360) % 360 };
}
const D = gc(YOU, SITE), r = D.km;
console.log(`distance ${r.toFixed(0)} km = ${(r / 1.609344).toFixed(0)} miles, bearing from you ${D.bear.toFixed(1)} deg`);
for (const [n, p] of [['Houston', [29.76, -95.37]], ['Miami', [25.76, -80.19]], ['Havana', [23.11, -82.37]], ['Mexico City', [19.43, -99.13]], ['Tampa', [27.95, -82.46]]])
  console.log(`  (${n}: ${(gc(p, SITE).km / 1.609344).toFixed(0)} mi)`);
// ---- the rock ----
const L = 9.66, rho = 2700, v = 20.1, thetaDeg = 60;      // km, kg/m3, km/s (45,000 mph), entry angle (Collins et al. 2020: 45-60 deg from the NE)
const m = rho * Math.PI / 6 * (L * 1e3) ** 3, E = 0.5 * m * (v * 1e3) ** 2, MT = 4.184e15;
console.log(`rock ${L} km (${(L / 1.609344).toFixed(1)} mi), ${v} km/s (${(v * 2236.94).toFixed(0)} mph): E = ${E.toExponential(2)} J = ${(E / MT / 1e6).toFixed(0)} million Mt`);
const E100 = 1e8 * MT;   // the usual quote: 100 million megatons
console.log(`the usual quote, 100 million Mt = ${E100.toExponential(2)} J; using it below`);
const Ej = E100;
// ---- the approach: from the NE (Collins 2020), 60 deg to the ground; you are N of the site ----
// Where along the path does the rock sink below your horizon? Work in a frame: site at origin, x toward you (north), z up.
const th = rad(thetaDeg), approachAz = 35;               // it comes FROM azimuth 35 deg (NE) at the site
// horizontal offset of the rock from the site at altitude h: h / tan(th), along azimuth 35 deg; its component toward you (north-ish):
const comp = Math.cos(rad(approachAz - ((D.bear + 180) % 360)));     // direction site->you is bear+180
function elevOf(h) {   // elevation angle (deg) of a point at altitude h above the path point, seen from you at eye height ~0
  const off = h / Math.tan(th);
  const along = off * comp, side = off * Math.sqrt(Math.max(0, 1 - comp * comp));
  const dist = Math.hypot(r - along, side);
  const phi = dist / R_E;                                 // central angle
  // point at radius R+h, angle phi from you; you at radius R
  const px = (R_E + h) * Math.sin(phi), pz = (R_E + h) * Math.cos(phi) - R_E;
  return { el: deg(Math.atan2(pz, px)), dist, sideDeg: deg(Math.atan2(side, r - along)) };
}
let hv = 0; for (let h = 0; h < 200; h += 0.05) if (elevOf(h).el > 0) { hv = h; break; }
const vz = v * Math.sin(th);
console.log(`path ${thetaDeg} deg from az ${approachAz}: vertical speed ${vz.toFixed(1)} km/s; drops below your horizon at ${hv.toFixed(1)} km altitude, ${(hv / vz).toFixed(2)} s before impact`);
for (const h of [160, 140, 125, 100, 80, hv]) { const e = elevOf(h); console.log(`  alt ${h.toFixed(0)} km: ${(h / vz).toFixed(2)} s before, elevation ${e.el.toFixed(2)} deg, ${e.sideDeg.toFixed(2)} deg left of the site, ${e.dist.toFixed(0)} km away, rock ${deg(L / e.dist).toFixed(2)} deg wide`); }
// ---- light: the fireball (EIEP eqs 31-37) ----
const Rf = 0.002 * Math.cbrt(Ej) / 1e3;                  // km
const Tt = Rf / v;                                        // s, time of the thermal max
const delta = r / R_E, hHor = (1 - Math.cos(delta)) * R_E;
const hh = hHor / Rf, phiA = Math.acos(Math.min(1, hh)), f = (phiA - hh * Math.sin(phiA)) / Math.PI;
const eta = 3e-3, phi = f * eta * Ej / (2 * Math.PI * (r * 1e3) ** 2);
const sigma = 5.67e-8, Tf = 3000, tau = eta * Ej / (2 * Math.PI * (Rf * 1e3) ** 2 * sigma * Tf ** 4);
console.log(`fireball radius ${Rf.toFixed(0)} km; the ground under it is ${hHor.toFixed(0)} km below your horizon, so ${(Rf - hHor).toFixed(0)} km of it shows (${(100 * f).toFixed(0)}% of its disc)`);
console.log(`  seen ${deg(Math.atan2(Rf - hHor, r)).toFixed(1)} deg tall, ${deg(2 * Math.sqrt(Rf * Rf - hHor * hHor) / r).toFixed(1)} deg wide; brightest at ${Tt.toFixed(0)} s`);
console.log(`  heat: ${(phi / 1e6).toFixed(0)} MJ/m2 over ~${(tau / 60).toFixed(0)} min = ${(phi / tau / 1e3).toFixed(0)} kW/m2 (sunlight ~1 kW/m2: ${(phi / tau / 1000).toFixed(0)}x)`);
// ignition thresholds scale with E^(1/6) (EIEP eq 38), 1 Mt values in MJ/m2
const sc = Math.pow(Ej / MT, 1 / 6);
for (const [n, q] of [['clothing ignites', 1.0], ['third-degree burns', 0.42], ['grass ignites', 0.38], ['deciduous trees ignite', 0.25], ['plywood flames', 0.67], ['newspaper ignites', 0.33]])
  console.log(`  ${n}: threshold ${(q * sc).toFixed(0)} MJ/m2 -> ${phi / 1e6 > q * sc ? 'YES' : 'no'}`);
// ---- quake (EIEP eqs 40-42) ----
const M = 0.67 * Math.log10(Ej) - 5.87;
console.log(`quake: magnitude ${M.toFixed(1)} (biggest recorded: 9.5, Chile 1960; energy ratio ${Math.pow(10, 1.5 * (M - 9.5)).toFixed(1)}x)`);
const Meff = r < 700 ? M - 0.0048 * r - 1.1644 : M - 1.66 * Math.log10(r / 111.2) - 6.399;
console.log(`  shaking here like a magnitude ${Meff.toFixed(1)} close by (EIEP r>700 km fit); arrives ${(r / 5).toFixed(0)} s = ${(r / 5 / 60).toFixed(1)} min after (EIEP: 5 km/s); P waves ~${(r / 8).toFixed(0)} s, surface waves ~${(r / 3.5).toFixed(0)} s`);
// ---- ejecta (EIEP eqs 43-50) ----
// transient crater: Dtc = 1.161 (rho_i/rho_t)^(1/3) L^0.78 v^0.44 g^-0.22 sin^(1/3) theta (m, m/s)
const rhoT = 2500, Dtc = 1.161 * Math.cbrt(rho / rhoT) * Math.pow(L * 1e3, 0.78) * Math.pow(v * 1e3, 0.44) * Math.pow(9.81, -0.22) * Math.cbrt(Math.sin(th)) / 1e3;
const Dfr = 1.25 * Dtc;   // simple; complex: 1.17 Dtc^1.13 / Dc^0.13
const Dc = 3.2, Dfin = 1.17 * Math.pow(Dtc, 1.13) / Math.pow(Dc, 0.13);
const thick = Math.pow(Dtc, 4) / (112 * r ** 3) * 1e3;    // m
console.log(`crater: transient ${Dtc.toFixed(0)} km, final ${Dfin.toFixed(0)} km (real Chicxulub ~180 km); ejecta here ${thick.toFixed(2)} m thick`);
// ballistic flight over a sphere at 45 deg: tan(Delta/2) = v^2 sin cos / (g R - v^2 cos^2)
{
  const a = rad(45), Dl = delta;
  const vv = Math.sqrt(g * R_E * Math.tan(Dl / 2) / (Math.sin(a) * Math.cos(a) + Math.cos(a) ** 2 * Math.tan(Dl / 2)));
  // flight time (EIEP eq 47)
}
// ---- air blast (EIEP eqs 54-58) ----
const Ekt = Ej / 4.184e12, P0 = 1e5, c0 = 0.34;   // c0 km/s
const pAt = (rk) => { const r1 = rk * 1e3 / Math.cbrt(Ekt), px = 75000, rx = 290; return px * rx / (4 * r1) * (1 + 3 * Math.pow(rx / r1, 1.3)); };
const p = pAt(r), u = 5 * p / (7 * P0) * c0 * 1e3 / Math.sqrt(1 + 6 * p / (7 * P0));
console.log(`air blast here: ${(p / 1e3).toFixed(0)} kPa (${(p / 6895).toFixed(1)} psi), wind ${u.toFixed(0)} m/s = ${(u * 2.23694).toFixed(0)} mph`);
// arrival: integrate the shock speed U = c0 sqrt(1 + 6p/7P0) outward from the fireball's edge (it is inside the fireball before)
let t = Rf / v * 3, x = Rf;     // rough start: the fireball has its size after a few Tt
for (; x < r; x += 0.1) t += 0.1 / (c0 * Math.sqrt(1 + 6 * pAt(x) / (7 * P0)));
console.log(`  shock arrives ~${(t / 60).toFixed(1)} min after impact (EIEP's own simpler r/c0 gives ${(r / c0 / 60).toFixed(1)} min); front speed here ${(c0 * Math.sqrt(1 + 6 * p / (7 * P0)) * 2236.94).toFixed(0)} mph`);
for (const mi of [100, 50, 20, 10, 5, 2, 1]) { const rk = r - mi * 1.609; let tt = 0; for (let y = rk; y < r; y += 0.01) tt += 0.01 / (c0 * Math.sqrt(1 + 6 * pAt(y) / (7 * P0))); console.log(`    ${mi} miles out: ${tt.toFixed(0)} s before it reaches you`); }

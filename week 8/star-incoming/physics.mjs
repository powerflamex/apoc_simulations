// Monte Carlo check of the star-incoming story: what a 0.6-Sun star passing near Earth does to Earth's orbit.
//   node physics.mjs 14 4000   (14 km/s approach speed, like Gliese 710; 4000 random passes near 1 AU)
// Prints, by closest distance to Earth, how often Earth stays with the Sun, is captured by the star, or is flung out.
// (Nov 13 result, within 0.1-0.2 AU: ~73% flung out, ~12% captured, ~15% kept by the Sun.)
// Monte Carlo: a 0.6 Msun star (v_inf ~14 km/s) passes the Sun near 1 AU; what happens to Earth?
// Units: AU, yr, Msun. G = 4 pi^2.
const G = 4 * Math.PI * Math.PI;
const KMS = 0.2109; // 1 km/s in AU/yr
const MS = 1, MX = 0.6, ME = 3.0e-6;
function rnd() { return Math.random(); }
function run(vinfKms, qSun, dirTheta, dirPhi, earthPhase, incl) {
  // Earth circular orbit in xy plane
  const m = [MS, ME, MX];
  const p = [[0, 0, 0], [Math.cos(earthPhase), Math.sin(earthPhase), 0], null];
  const ve = Math.sqrt(G * MS);
  const v = [[0, 0, 0], [-Math.sin(earthPhase) * ve, Math.cos(earthPhase) * ve, 0], null];
  // Star hyperbola around the Sun (two-body Sun+star), periapsis qSun, start at r0
  const mu = G * (MS + MX);
  const vinf = vinfKms * KMS;
  const a = -mu / (vinf * vinf); // negative
  const e = 1 - qSun / a; // q = a(1-e) with a<0
  const r0 = 25;
  // true anomaly at r0 (incoming): r = a(1-e^2)/(1+e cos f)
  const pp = a * (1 - e * e);
  const f0 = -Math.acos((pp / r0 - 1) / e);
  const rr = pp / (1 + e * Math.cos(f0));
  const h = Math.sqrt(mu * pp);
  const pos = [rr * Math.cos(f0), rr * Math.sin(f0), 0];
  const vel = [-mu / h * Math.sin(f0), mu / h * (e + Math.cos(f0)), 0];
  // rotate orbit plane: by incl about x, then by dirPhi about z
  function rot(u) {
    let [x, y, z] = u;
    let y2 = y * Math.cos(incl) - z * Math.sin(incl), z2 = y * Math.sin(incl) + z * Math.cos(incl);
    let x3 = x * Math.cos(dirPhi) - y2 * Math.sin(dirPhi), y3 = x * Math.sin(dirPhi) + y2 * Math.cos(dirPhi);
    return [x3, y3, z2];
  }
  const sp = rot(pos), sv = rot(vel);
  // relative to Sun -> barycentric-ish: put Sun at origin, star at sp (good enough)
  p[2] = sp; v[2] = sv;
  // Earth needs to be at correct phase when star arrives: time to periapsis
  // We'll instead propagate Earth's phase back: Earth phase given is at star periapsis time.
  const F = Math.acosh((1 - rr / a) / e); // hyperbolic anomaly magnitude
  const tp = Math.sqrt(-a * a * a / mu) * (e * Math.sinh(F) - F);
  const ph = earthPhase - tp * 2 * Math.PI;
  p[1] = [Math.cos(ph), Math.sin(ph), 0];
  v[1] = [-Math.sin(ph) * ve, Math.cos(ph) * ve, 0];
  let t = 0, dmin = 1e9, tend = 2.2 * tp;
  const acc = () => {
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; let rmin = 1e9;
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      const d = [p[j][0] - p[i][0], p[j][1] - p[i][1], p[j][2] - p[i][2]];
      const r2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2], r = Math.sqrt(r2), k = G / (r2 * r);
      rmin = Math.min(rmin, r);
      for (let c = 0; c < 3; c++) { A[i][c] += k * m[j] * d[c]; A[j][c] -= k * m[i] * d[c]; }
    }
    return [A, rmin];
  };
  let [A, rmin] = acc();
  while (t < tend) {
    const dEX = Math.hypot(p[1][0] - p[2][0], p[1][1] - p[2][1], p[1][2] - p[2][2]);
    dmin = Math.min(dmin, dEX);
    const dt = Math.min(0.01, 0.0008 * Math.pow(rmin, 1.5));
    for (let i = 0; i < 3; i++) for (let c = 0; c < 3; c++) v[i][c] += 0.5 * dt * A[i][c];
    for (let i = 0; i < 3; i++) for (let c = 0; c < 3; c++) p[i][c] += dt * v[i][c];
    [A, rmin] = acc();
    for (let i = 0; i < 3; i++) for (let c = 0; c < 3; c++) v[i][c] += 0.5 * dt * A[i][c];
    t += dt;
  }
  // energies of Earth relative to Sun and to star
  function en(k) {
    const d = [p[1][0] - p[k][0], p[1][1] - p[k][1], p[1][2] - p[k][2]];
    const u = [v[1][0] - v[k][0], v[1][1] - v[k][1], v[1][2] - v[k][2]];
    const r = Math.hypot(...d), w2 = u[0] ** 2 + u[1] ** 2 + u[2] ** 2;
    const E = 0.5 * w2 - G * m[k] / r;
    return { E, a: -G * m[k] / (2 * E), r };
  }
  const s = en(0), x = en(2);
  let out = 'unbound';
  if (s.E < 0) out = 'sun'; else if (x.E < 0) out = 'star';
  return { dmin, out, aSun: s.a, aStar: x.a, rSun: s.r };
}
const vk = +(process.argv[2] || 14);
const bins = {};
const N = +(process.argv[3] || 3000);
for (let n = 0; n < N; n++) {
  const q = 0.5 + rnd() * 1.0; // star periapsis to Sun 0.5..1.5 AU
  const incl = Math.acos(2 * rnd() - 1);
  const r = run(vk, q, 0, rnd() * 2 * Math.PI, rnd() * 2 * Math.PI, incl);
  const b = r.dmin < 0.05 ? '<0.05' : r.dmin < 0.1 ? '0.05-0.1' : r.dmin < 0.2 ? '0.1-0.2' : r.dmin < 0.3 ? '0.2-0.3' : r.dmin < 0.5 ? '0.3-0.5' : '>0.5';
  bins[b] ??= { sun: 0, star: 0, unbound: 0, aS: [] };
  bins[b][r.out]++;
  if (r.out === 'sun') bins[b].aS.push(r.aSun);
}
for (const k of ['<0.05', '0.05-0.1', '0.1-0.2', '0.2-0.3', '0.3-0.5', '>0.5']) {
  const b = bins[k]; if (!b) continue;
  const tot = b.sun + b.star + b.unbound;
  b.aS.sort((x, y) => x - y);
  const med = b.aS.length ? b.aS[b.aS.length >> 1].toFixed(2) : '-';
  console.log(k.padEnd(9), 'n=' + tot, 'stays w/ Sun', (100 * b.sun / tot).toFixed(0) + '%', 'captured', (100 * b.star / tot).toFixed(0) + '%', 'ejected', (100 * b.unbound / tot).toFixed(0) + '%', 'median new a (AU)', med);
}

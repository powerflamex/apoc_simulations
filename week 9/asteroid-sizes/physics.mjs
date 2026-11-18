// Physics check for "What if asteroids of every size hit your city?"   node physics.mjs
// The numbers for stops 1-4 come from the Imperial College / Purdue calculator "Impact: Earth!" (Collins, Melosh & Marcus
// 2005), run on Nov 17, 2026 by URL (impact.ese.ic.ac.uk/map?input_method=distanceonly&distance=4&distanceUnits=1&...)
// for 4 km from ground zero (you are 2.4 km out; the calculator's damage at 4 km is a floor for what you'd get):
//   1  18 m (59 ft), 3,300 kg/m3, 19 km/s, 18 deg (Chelyabinsk 2013): breaks up 52.7 km up, bursts 32.1 km up, 0.43 Mt;
//      air blast arrives 1 min 37 s after, 0.18 psi, 6.6 mph: "Glass windows may shatter."
//   2  60 m (200 ft), 2,700 kg/m3, 15 km/s, 35 deg (Tunguska 1908): bursts 8.7 km up, 8.2 Mt; arrives 29 s after,
//      6.6 psi, 208 mph: "Glass windows will shatter ... multistory wall-bearing buildings will collapse."
//   3  340 m (1,100 ft), 3,200 kg/m3, 12.6 km/s, 45 deg (Apophis' size and its would-be speed): reaches the ground,
//      1,200 Mt; crater 4.8 km (3.0 miles) wide, 480 m deep; quake 6.7; rocks thrown out arrive 28 s after (37 m deep
//      here); air blast 1 min 10 s after, 192 psi, 2,009 mph; "no fireball" (below 15 km/s little rock vaporises).
//   4  10 km (6.2 miles), 2,700 kg/m3, 20 km/s, 60 deg (the Chicxulub rock): 6.8e7 Mt; crater 120 km (77 miles) wide;
//      "Your position is inside the fireball"; quake 9.8.
//   5  939 km (Ceres): the calculator's crater formulas break down at this size; it still gives 1.1e29 J at 15 km/s.
//   6  3,475 km (the Moon): the calculator returns an error. Worked out below.
const MT = 4.184e15;
const ke = (m, v) => 0.5 * m * v * v;
// 5: Ceres: mass 9.38e20 kg (Dawn), hitting at ~15 km/s
const eCeres = ke(9.38e20, 15e3);
// the oceans: 1.4e21 kg; heat from 15 C to 100 C (4,186 J/kg/K) and boil (2.26e6 J/kg)
const eOceans = 1.4e21 * (4186 * 85 + 2.26e6);
console.log(`Ceres at 15 km/s: ${eCeres.toExponential(2)} J = ${(eCeres / MT).toExponential(1)} Mt; boiling every ocean takes ${eOceans.toExponential(2)} J: ${(eCeres / eOceans).toFixed(0)}x over`);
// 6: the Moon: 7.342e22 kg, falling in at ~12 km/s (escape speed 11.2 km/s plus a little)
const eMoon = ke(7.342e22, 12e3);
// melting rock: heat ~1,200 J/kg/K over ~1,500 K plus 4e5 J/kg to melt
const eMelt = 1200 * 1500 + 4e5;
console.log(`the Moon at 12 km/s: ${eMoon.toExponential(2)} J; enough to melt ${(eMoon / eMelt).toExponential(2)} kg of rock = ${(100 * eMoon / eMelt / 5.97e24).toFixed(0)}% of Earth's mass (a magma ocean)`);
// how big each looks: the Texas comparison (a disc 939 km wide has the area of Texas, 268,596 sq mi)
const discMi2 = Math.PI * (939 / 1.609344 / 2) ** 2;
console.log(`a disc 939 km (583 mi) wide covers ${Math.round(discMi2).toLocaleString('en-US')} sq mi; Texas is 268,596 sq mi`);
// the Moon's pull on the bay at the distance where it is first drawn (6,700 km centre to centre would be inside the Roche
// limit, ~9,500 km for a rigid Moon: it would start to crack, which the video shows)
for (const d of [384400, 20000, 9500, 6700]) console.log(`Moon ${d.toLocaleString('en-US')} km away: its tidal pull ${((384400 / d) ** 3).toFixed(0)}x today's`);
// sizes against the things they're compared with
console.log('house ~60 ft (a 2-3 storey house is 30-60 ft); 747 is 231 ft long; Empire State Building 1,250 ft to its roof; Everest 29,032 ft = 5.5 mi');

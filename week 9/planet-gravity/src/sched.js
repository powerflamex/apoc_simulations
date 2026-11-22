// When things happen inside each stop (seconds after that stop's wipe starts), shared by the picture and the sound.
// Every stop: the first effect within ~1 s of its wipe, a second, bigger beat ~3 s in (and the Sun a third).
import { smooth, clamp } from './util.js';
import { LAND } from './timeline.js';
import { BUILDINGS, CARS } from './layout.js';

export const G_EARTH = 9.8;
export const GRAV = { moon: 1.62, pluto: 0.62, jupiter: 24.79, sun: 274, wd: 9.8e5, ns: 1.3e12 };

// The Moon (its wipe is at -1.6 s, so frame 0 is 1.6 s in): everyone mid-jump; a player dunks from way above the rim;
// then the whole court jumps at once, you too
export const MOON_DUNK = 2.55;          // the dunker reaches the rim (video ~0.95 s)
export const MOON_ALL = 4.55;           // everyone jumps together (video ~2.95 s)
export const MOON_YOU = 4.7;            // your take-off
export const V_JUMP = 3.13;             // a 0.5 m jump on Earth

// Pluto: you crouch and jump at the wipe: up and forward over the hoop (the camera follows); the crowd hops and floats
export const PLU_TAKE = 0.42;           // your take-off (from your knees: Jupiter left you there)
export const PLU_VX = 1.25, PLU_VXX = 0.25;   // forward and a little right (m/s): over the hoop at the top, and when the
                                              // Sun takes over you drop beside the hoop, not onto it

// Jupiter: it takes over while the whole court is still up in the air from the Moon's jump (~2.7 m up): they slam
// down onto the court ~0.5 s later, knees buckling, the ball dropping like a rock; ~2.3 s in the big beat: limbs crack
// off the trees, the benches snap, the hoop bends down, the parked cars sink onto their wheels
export const JUP_BUCKLE = 0.06;                       // (anyone still on the ground staggers at once)
export const JUP_SNAP = [2.2, 2.35, 2.55, 2.8, 3.1];   // branch snaps (trees.js picks which)
export const JUP_BENCH = [2.4, 2.6, 2.82, 3.0];        // each bench snaps in the middle
export const JUP_HOOP = 2.5;                          // the hoop's arm bends down (over ~0.5 s)
export const JUP_CREEP = [3.9, 4.8];                  // then the post gives a little more, in jerks (each a creak and a bang)
export const JUP_CARS = 2.65;                         // the first car bottoms out (each a little after the last)
export const jupCarT = (k) => JUP_CARS + 0.045 * ((k * 7) % CARS.length);

// The Sun: it takes over while everyone is still up in the air from Pluto: they drop like stones (you from ~26 ft,
// a quarter of a second); everyone on the ground slammed flat at once, tyres burst, the lamp posts bend; ~3 s in the second beat: the hoop folds and
// the backboard crashes down, the trees snap and go flat, the car roofs crush in, the windows burst out of the
// buildings; ~6 s in the tallest buildings' top floors give way
export const SUN_FLAT = 0.04;
export const SUN_TYRES = 0.55;
export const sunTyreT = (k) => SUN_TYRES + 0.06 * ((k * 5) % CARS.length);
export const SUN_LAMPS = 0.9;
export const SUN_HOOP = 3.2, SUN_BOARD_HIT = 3.57;
export const SUN_TREES = 3.65;                         // the trunks snap one after another (the ones in frame spread
// over ~3 s, so every second has a tree going down); the far ones in between
const TREE_RANK = [2, 5, 7, 3, 0, 9, 1, 4, 6, 10, 8, 11, 12];   // by tree index: order of snapping
export const sunTreeT = (ti) => SUN_TREES + 0.33 * TREE_RANK[ti];
export const SUN_ROOFS = 3.7;
export const sunRoofT = (k) => SUN_ROOFS + 0.05 * ((k * 3) % CARS.length);
export const SUN_WINDOWS = 4.25;
export const SUN_TOPS = 6.25;                          // the tallest buildings start to give way at the top
export const SUN_TOP_LIST = BUILDINGS.map((b, i) => [Math.abs(b.x) < 0.3 * -b.z ? b.h : 0, i]).sort((a, b) => b[0] - a[0]).slice(0, 4).map(([, i], k) => ({ i, t: SUN_TOPS + 0.4 * k }));

// The white dwarf: everything small is crushed flat in a blink; then the buildings go down one after another, the
// farthest first, coming toward you; then the ground itself: a front of cracks sweeps in from the horizon to your feet,
// the crust dropping and everything left (the rubble heaps) pressed flat behind it
export const WD_CRUSH = 0.42;
// row by row from the back (the towers 0.7-1.5 s, the blocks behind 1.4-2.3 s), each row from the outside in; then the
// street's front row floor by floor (each takes WD_FLOORS s, its roofline dropping a floor at a time), the three in
// frame a second apart so every second shows another one going down
export const WD_FLOORS = 1.0;
const ROWT = [[2.2, 3.0], [1.4, 2.3], [0.7, 1.5]];
export const WD_BLDG_T = new Array(BUILDINGS.length);
[0, 1, 2].forEach((row) => {
  const ix = BUILDINGS.map((b, i) => [Math.abs(b.x), i]).filter(([, i]) => BUILDINGS[i].row === row).sort((a, b) => b[0] - a[0]);
  ix.forEach(([, i], k) => { WD_BLDG_T[i] = ROWT[row][0] + (ROWT[row][1] - ROWT[row][0]) * k / Math.max(1, ix.length - 1); });
});
// (the front row's buildings in frame: the left one at the frame's edge, the one left of the hoop, the wide one right of it)
BUILDINGS.forEach((b, i) => { if (b.row === 0 && Math.abs(b.x) < 22 && b.x < 15) WD_BLDG_T[i] = b.x < -15 ? 2.35 : b.x < 0 ? 3.3 : 4.25; });
export const WD_BLDG0 = 0.7, WD_BLDG1 = 5.25;
export const WD_FLAT0 = 5.6, WD_FLAT1 = 7.4;           // the crack front leaves the horizon / reaches you
export const wdFrontR = (tt) => 160 * Math.pow(1 - smooth(WD_FLAT0, WD_FLAT1, tt), 1.6);
export const WD_CRACK = WD_FLAT0;

// The neutron star: everything is pressed into a film; a bright wave of heat sweeps in from the horizon over it all,
// straight into the white
export const NS_FILM = 0.25;
export const NS_WAVE0 = 0.45, NS_WAVE1 = 2.55;
export const nsWaveR = (tt) => 600 * Math.pow(1 - smooth(NS_WAVE0, NS_WAVE1, tt), 2.2) - 3;
export const NS_FLARE = NS_WAVE0;

export const sqWD = (tt) => 1 - 0.95 * smooth(WD_CRUSH, WD_CRUSH + 0.16, tt) - 0.04 * smooth(WD_FLAT0 + 0.5, WD_FLAT1, tt);   // heights x this
export const sqNS = (tt) => 1 - 0.996 * smooth(NS_FILM, NS_FILM + 0.12, tt);
// how long each world runs before the next takes over (the next one starts from where this one left everyone)
export const MOON_END = LAND.jupiter - LAND.moon, JUP_END = LAND.pluto - LAND.jupiter, PLU_END = LAND.sun - LAND.pluto;
export { LAND, clamp };

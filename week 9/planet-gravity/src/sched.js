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
export const PLU_TAKE = 0.42;           // your take-off
export const PLU_VX = 1.55;             // forward (m/s): the peak (~5 s later) is right over the rim

// Jupiter: at the wipe everyone staggers and drops to their knees (the ones caught mid-jump slam down); ~3 s in the big
// beat: limbs crack off the trees, the benches snap, the hoop bends down, the parked cars sink onto their wheels
export const JUP_BUCKLE = 0.06;
export const JUP_SNAP = [2.8, 2.95, 3.15, 3.4, 3.7];   // branch snaps (trees.js picks which)
export const JUP_BENCH = [3.0, 3.2, 3.42, 3.6];        // each bench snaps in the middle
export const JUP_HOOP = 3.1;                          // the hoop's arm bends down (over ~0.5 s)
export const JUP_CARS = 3.25;                         // the first car bottoms out (each a little after the last)
export const jupCarT = (k) => JUP_CARS + 0.045 * ((k * 7) % CARS.length);

// The Sun: everyone slammed flat at once, tyres burst, the lamp posts bend; ~3 s in the second beat: the hoop folds and
// the backboard crashes down, the trees snap and go flat, the car roofs crush in, the windows burst out of the
// buildings; ~6 s in the tallest buildings' top floors give way
export const SUN_FLAT = 0.04;
export const SUN_TYRES = 0.55;
export const sunTyreT = (k) => SUN_TYRES + 0.06 * ((k * 5) % CARS.length);
export const SUN_LAMPS = 0.9;
export const SUN_HOOP = 2.95, SUN_BOARD_HIT = 3.32;
export const SUN_TREES = 3.05;                         // the trunks snap (each tree a little after the last)
export const sunTreeT = (ti) => SUN_TREES + 0.05 * ((ti * 7) % 13);
export const SUN_ROOFS = 3.45;
export const sunRoofT = (k) => SUN_ROOFS + 0.05 * ((k * 3) % CARS.length);
export const SUN_WINDOWS = 4.0;
export const SUN_TOPS = 6.0;                           // the tallest buildings start to give way at the top
export const SUN_TOP_LIST = BUILDINGS.map((b, i) => [Math.abs(b.x) < 0.3 * -b.z ? b.h : 0, i]).sort((a, b) => b[0] - a[0]).slice(0, 4).map(([, i], k) => ({ i, t: SUN_TOPS + 0.4 * k }));

// The white dwarf: everything small is crushed flat in a blink; then the buildings go down one after another, the
// farthest first, coming toward you; then the ground itself: a front of cracks sweeps in from the horizon to your feet,
// the crust dropping and everything left (the rubble heaps) pressed flat behind it
export const WD_CRUSH = 0.42;
export const WD_BLDG0 = 0.8, WD_BLDG1 = 5.2;
// row by row from the back, each row from the outside in (the ones in the middle of the frame last)
const ORDER = BUILDINGS.map((b, i) => [b.row * 1000 + Math.min(Math.abs(b.x), 60), i]).sort((a, b) => b[0] - a[0]);
export const WD_BLDG_T = new Array(BUILDINGS.length);
ORDER.forEach(([, i], k) => { WD_BLDG_T[i] = WD_BLDG0 + (WD_BLDG1 - WD_BLDG0) * k / (ORDER.length - 1); });
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
export { LAND, clamp };

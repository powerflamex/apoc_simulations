// When things happen inside each stop (seconds after that stop's wipe starts), shared by the picture and the sound.
// Every stop: the first effect within ~1 s of its wipe, a second, bigger beat ~3 s in.
import { smooth, clamp } from './util.js';
import { LAND } from './timeline.js';

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
export const PLU_JETS = 0;              // the fountain's jets shoot up from the wipe on

// Jupiter: everyone buckles at the wipe; branches sag; the big branches snap and crash down ~3 s in
export const JUP_BUCKLE = 0.06;
export const JUP_SNAP = [2.75, 2.95, 3.2, 3.45, 3.9];   // branch snaps (one per entry; trees.js picks which)

// The Sun: everyone slammed flat at once; the hoop folds; tyres burst; then the trees break
export const SUN_FLAT = 0.04;
export const SUN_HOOP = 0.45, SUN_BOARD_HIT = 0.82;     // the post buckles; the backboard hits the court and shatters
export const SUN_TYRES = 1.35;                           // the first tyre goes (each car a little after the last)
export const SUN_TREES = 2.85;                           // the trunks snap (each tree a little after the last)
export const SUN_LAMPS = 1.0;

// The white dwarf: everything still standing is crushed flat in a blink; the buildings pancake one after another;
// ~3 s in the ground itself cracks into plates, glowing in the seams, and drops
export const WD_CRUSH = 0.42;
export const WD_BLDG0 = 0.5, WD_BLDG_STEP = 0.07;       // the first building goes, then the next every ~0.07 s
export const WD_CRACK = 2.9;

// The neutron star: everything is pressed into a film; it heats till it glows, brighter and brighter, then white
export const NS_FILM = 0.42;
export const NS_FLARE = 2.9;

export const sqWD = (tt) => 1 - 0.95 * smooth(WD_CRUSH, WD_CRUSH + 0.16, tt);           // heights x this
export const sqNS = (tt) => 1 - 0.996 * smooth(NS_FILM, NS_FILM + 0.14, tt);
export { LAND, clamp };

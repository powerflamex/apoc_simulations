// When things happen inside each stop (seconds after that stop's wipe starts), shared by the picture and the sound.
// Every stop: the first thing lands within ~1 s of its wipe, then something new every ~2-3 s, with a second big event
// about halfway through.
import { smooth, clamp } from './util.js';
import { LAND, DUR } from './timeline.js';

// Mercury (its wipe is at 0.9 s; the Sun is at full size ~1.1 s in): a blast of white-hot light; towels and umbrellas
// smoke and catch; the crowd screams and runs; the sea starts to boil; halfway, the pier bursts into flame and the
// crowd runs again; then the hut's roof goes up and the bay throws up steam
export const MER_FLASH = 0.15;         // the blast of light
export const MER_SMOKE = 0.3;          // towels start smoking
export const MER_FIRE = 0.6;           // the first towels catch
export const MER_UMB = 0.8;            // the umbrellas go up (each a little after the last)
export const MER_RUN = 0.55;           // they run
export const MER_BOIL = 2.0;           // the sea starts to boil
export const MER_PIER = 3.7;           // the pier catches
export const MER_RUN2 = 4.0;           // the ones down on the sand get up and run again
export const MER_TRUCK = 5.4;          // the trucks' tyres catch
export const MER_WALL = 5.6;           // the boiling bay throws up steam
export const merHeat = (tt) => smooth(-0.2, 1.1, tt);

// Mars: the Sun shrinks, the light goes thin and cold; the flames die to smoke; a frost front races up the beach to
// you; everyone hugs themselves, breath steaming, and runs for the trucks; halfway, the sea skins over with ice out
// from the shore; then ice crystals glitter down
export const MARS_OUT = 0.25;          // the flames die
export const MARS_FROST = 0.7;         // the frost front leaves the waterline
export const marsFrostF = (tt) => 34 - 42 * Math.pow(clamp((tt - MARS_FROST) / 1.3), 0.85);   // (distance ahead of the camera)
export const MARS_CARS = 2.2;          // people run for the trucks
export const MARS_ICE = 3.5;           // the ice skin sets off from the shore
export const marsIceR = (tt) => 2200 * Math.pow(smooth(MARS_ICE, MARS_ICE + 3.0, tt), 1.6);    // metres out from the shore
export const MARS_DUST = 5.3;          // diamond dust: ice crystals falling and glittering in the low Sun

// Venus: the Sun swells back; the frost and the sea ice melt; people uncurl and look up; the sea steams harder and
// harder; halfway, the steam closes the sky into one cloud; then hot rain pours
export const VEN_THAW = 0.3;
export const VEN_STEAM = 1.8;          // towers of steam off the whole bay
export const VEN_CLOUD = 3.4;          // the cloud closes over the sky (from the horizon up)
export const venCloud = (tt) => smooth(VEN_CLOUD, VEN_CLOUD + 2.0, tt);
export const VEN_RAIN = 5.4;           // hot rain

// Jupiter: the light drops to a dark overcast noon; the rain turns to snow; a freeze front races in from the horizon;
// people hug themselves and huddle; halfway, the cloud snows itself out and breaks open on a dot of a Sun; the snow
// drifts up the trucks
export const JUP_SNOW = 0.2;           // the rain turns to snow
export const JUP_FZ0 = 0.6, JUP_FZDUR = 2.6, JUP_FZO0 = 2600, JUP_FZP = 3.2;
export const jupSeaFront = (tt) => JUP_FZO0 * Math.pow(1 - clamp((tt - JUP_FZ0) / JUP_FZDUR), JUP_FZP);   // metres out from the shore
export const JUP_HUDDLE = 1.5;         // people bunch together
export const JUP_CLEAR = 3.7;          // the cloud breaks open
export const jupClear = (tt) => smooth(JUP_CLEAR, JUP_CLEAR + 1.8, tt);
export const JUP_DEPTH = 0.35;         // how deep it gets on the open sand (m; it drifts up the trucks much deeper)

// Pluto: the Sun is a point; the sky goes black as the air thins out; the air rains down as liquid; frost grows over
// everyone and they freeze where they stand; the rain turns to snow and piles up: past the trucks, then the pier, then
// over you and the lens
export const PLU_RAIN = 1.0;           // liquid air starts falling
export const PLU_FROST = 2.2;          // frost starts growing on people
export const PLU_STATUE = 3.6;         // the first freeze in place (the rest over ~1.6 s)
export const PLU_FREEZE = 4.6;         // the rain freezes: snow
export const PLU_LENS = 10.3;           // frost starts creeping over the lens
export const pluFrost = (tt) => smooth(PLU_FROST, PLU_FROST + 3.4, tt);
// the snow's depth (m): near you (r < ~5 m) and far off (r > ~240 m); in between it slopes (snowProfile)
export function snowDepth(key, tt) {
  if (key === 'jupiter') return JUP_DEPTH * smooth(0.8, 7.4, tt);
  if (key === 'pluto') return JUP_DEPTH + 0.5 * smooth(PLU_FREEZE, PLU_FREEZE + 4.4, tt) + 1.25 * Math.pow(clamp((tt - 8.9) / 2.2), 1.4);
  return 0;
}
export function snowFar(key, tt) {
  if (key === 'pluto') return JUP_DEPTH + 10.2 * Math.pow(smooth(PLU_FREEZE, PLU_FREEZE + 4.6, tt), 1.25) + 0.8 * smooth(9, 11.5, tt);
  return snowDepth(key, tt);
}
export const PLU_SKY = (tt) => smooth(0.2, 3.0, tt);      // the sky going black (0 dusk blue .. 1 black with stars)
export { LAND, DUR };

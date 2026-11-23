// When things happen inside each stop (seconds after that stop's wipe starts), shared by the picture and the sound.
// Every stop: the first thing lands within ~1 s of its wipe, a second, bigger beat ~3 s in.
import { smooth, clamp, lerp } from './util.js';
import { LAND, DUR } from './timeline.js';

// Venus (its wipe is at -0.4 s, so frame 0 is 0.4 s in): the Sun swells, the heat hits, everyone runs for shade,
// then the sea starts steaming off in a white wall
export const VEN_HEAT = 0.55;          // arms up over faces
export const VEN_RUN = 0.85;           // they run for the umbrellas
export const VEN_STEAM = 3.1;          // the steam wall towers up off the bay
export const venSteam = (tt) => smooth(1.0, 2.6, tt) * 0.5 + smooth(VEN_STEAM - 0.3, VEN_STEAM + 1.6, tt) * 0.5;

// Mars: the Sun shrinks, the light goes thin and cold; a frost front races up the beach from the waterline to you;
// the sea skins over with ice out from the shore; breath steams; ice crystals glitter down
export const MARS_ICE = 0.35;          // the ice skin sets off from the shore
export const MARS_FROST = 0.75;        // the frost front leaves the waterline
export const marsFrostF = (tt) => 34 - 42 * Math.pow(clamp((tt - MARS_FROST) / 1.3), 0.85);   // (distance ahead of the camera)
export const marsIceR = (tt) => 2200 * Math.pow(smooth(MARS_ICE, MARS_ICE + 4.2, tt), 1.6);    // metres out from the shore
export const MARS_DUST = 3.4;          // diamond dust: ice crystals falling and glittering in the low Sun
export const MARS_HUDDLE = 2.6;        // people pull together

// Mercury: the Sun balloons; the frost and the sea ice flash to steam; the sea boils; dark things in the sunlight start
// to smoke, then burn (towels, umbrellas, the lifeguard hut's paint)
export const MER_FLASH = 0.2;          // the ice flashes to steam
export const MER_BOIL = 1.0;           // the sea starts to boil
export const MER_WALL = 2.4;           // a wall of steam off the bay
export const MER_SMOKE = 1.4;          // things start smoking
export const MER_FIRE = 2.2;           // the first towels catch
export const MER_UMB = 3.0;            // the umbrellas go up
export const MER_HUT = 4.0;            // the hut's roof catches
export const merHeat = (tt) => smooth(0.0, 1.4, tt);

// Jupiter: the Sun is a dot; the fires go out; a freeze front races in from the horizon, every wave frozen where it
// stood; snow starts falling and piles up
export const JUP_OUT = 0.6;            // the flames are out
export const JUP_FZ0 = 0.4, JUP_FZDUR = 2.6, JUP_FZO0 = 2600, JUP_FZP = 3.2;
export const jupSeaFront = (tt) => JUP_FZO0 * Math.pow(1 - clamp((tt - JUP_FZ0) / JUP_FZDUR), JUP_FZP);   // metres out from the shore
export const JUP_SNOW = 1.0;           // the snow starts
export const JUP_HUDDLE = 1.4;         // people bunch together
export const JUP_DEPTH = 0.7;          // how deep it gets (m)

// Pluto: the Sun is a point; the sky goes black as the air thins out; the air rains down as liquid, then freezes and
// snows down, piling up over everyone and finally over the lens
export const PLU_RAIN = 1.2;           // liquid air starts falling
export const PLU_FREEZE = 4.8;         // it freezes: snow
export const PLU_STATUE = 4.4;         // people freeze where they stand
export const PLU_LENS = 8.4;           // frost starts creeping over the lens
// the snow's depth on the beach (m) at any stop's tt
export function snowDepth(key, tt) {
  if (key === 'jupiter') return JUP_DEPTH * smooth(2.0, 8.6, tt);
  if (key === 'pluto') return JUP_DEPTH + 0.35 * smooth(PLU_FREEZE, PLU_FREEZE + 3, tt) + 1.3 * Math.pow(clamp((tt - (PLU_FREEZE + 1.6)) / 5.0), 1.7);
  return 0;
}
export const PLU_SKY = (tt) => smooth(0.3, 4.2, tt);      // the sky going black (0 dusk blue .. 1 black with stars)
export { LAND, DUR };

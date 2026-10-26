// Where everything stands on the plaza (metres; +x east, +y up, -z north). You start at YOU0 looking north across
// the street (CURB .. FAR) at the towers; an avenue runs north from the street between AVE_X0 and AVE_X1, so you can
// see down it to the far skyline (and the storm over it). The strip between the walkers' lanes and the curb holds the
// trees, the benches, the guitarist, the bubble artist, and the kid with the ball.
export const YOU0 = { x: 0, z: 1.6 };            // where you stand at first
export const YOU1 = { x: 0.45, z: -3.55 };       // at the curb, after you catch the ball
export const EYE = 1.64;
export const CURB = -4.6;                         // the near curb (the street starts here)
export const ROAD = -0.15;                        // the road is a step below the sidewalk
export const LANES_Z = [-6.4, -10.0, -13.6, -17.2]; // the two near lanes drive east (+x), the far two west
export const FAR = -19.0;                         // the far curb
export const FAR_BLD = -25.0;                     // the buildings across the street start here
export const AVE_X0 = -10, AVE_X1 = 6;            // the avenue going north
export const XWALK_X = -12.6;                     // the crosswalk across our street (west of the avenue)

// the people who stay put
export const KID0 = { x: 3.3, z: -3.45 };         // dribbling his ball near the curb
export const PARENT = { x: 4.4, z: -2.35 };        // on the phone, back half-turned
export const GUITAR = { x: 8.2, z: -4.05 };        // the guitarist on a stool by the tree
export const BUBBLER = { x: -4.6, z: -3.3 };      // the bubble artist
export const FOUNTAIN = { x: -11.5, z: 3.5, r: 4.2 };
export const CAFE = { x0: 9.5, x1: 17, z0: -1.5, z1: 7 };
export const TREES = [[-19, -3.9], [-7.5, -3.9], [12.5, -3.9], [24, -3.9], [-26, -21.8], [13.5, -21.8], [28, -21.8], [-17, -21.8]];
export const BENCHES = [[-1.8, -3.9, 0], [10.2, -3.8, 0]];

// walkers on the near sidewalk (east and west) and on the plaza behind you, and on the far sidewalk; each lane is a
// loop whose ends are out of sight
export const LANES = [
  { z: -1.25, x0: -60, x1: 60, dir: -1, n: 12, speed: 1.35, seed: 0.13 },
  { z: -2.05, x0: -60, x1: 60, dir: 1, n: 12, speed: 1.42, seed: 0.61 },
  { z: 5.5, x0: -60, x1: 60, dir: 1, n: 10, speed: 1.3, seed: 0.37 },
  { z: 9.0, x0: -60, x1: 60, dir: -1, n: 10, speed: 1.38, seed: 0.83 },
  { z: -20.4, x0: -90, x1: 90, dir: 1, n: 16, speed: 1.4, seed: 0.29 },
  { z: -22.2, x0: -90, x1: 90, dir: -1, n: 16, speed: 1.33, seed: 0.71 },
];

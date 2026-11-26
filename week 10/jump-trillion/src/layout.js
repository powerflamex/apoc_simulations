// Where everything is. Metres; x east, y up, z south (north is -z). The street level is y = 0.
// A downtown avenue running north-south: 4 lanes (x -8..8), sidewalks to x = +-13, building fronts at x = +-13.
// You jump from P, the east lane just past a red city bus stopped at its stop. Beside you (east) a 12-storey
// building; across the avenue (west) the city's tallest tower, 381 m (1,250 ft, the Empire State's height) with an
// open observation deck at 372 m. The avenue runs on south for 3 km (the far cameras of the big push-offs).
export const STREET = { x0: -8, x1: 8 };
export const WALK = 13;                          // the building fronts (both sides)
export const P = { x: 4.2, z: 0 };               // where you land and push off (every jump from 100x on)
export const A = { x: -3.1, z: 1.2 };            // where the 10x jump (frame 0) took off: west of the bus
export const BUS = { x: 0.55, z: 0.6, len: 12.2, w: 2.55, h: 3.15 };       // heading north, its middle over (x, z)
export const MID = { x: 13, x1: 31, z0: -14, z1: 14, h: 40.8, floors: 12 }; // the 12-storey building (east)
export const TOWER = { x: -40, z: -22, w: 50, d: 50, h: 381, deck: 372 };  // the tallest tower (west), its middle
export const CLOUD_Y = 2000;                     // the cloud deck's base

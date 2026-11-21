// Where everything is. Metres; x east, y up, z south (north is -z). The street level is y = 0.
// A cruise-ship plaza on the south side of a harbor that runs east-west. You start on the plaza; the camera starts
// just south of you looking north. Around you, in the order you lift them:
//   the car in your hand; a red city bus at the stop in the street to your left (west); a container truck parked on
//   the plaza to your right; a jumbo jet parked on the apron next to the plaza (northeast), nose pointing west; the
//   cruise ship moored along the quay (north); a glass tower on the quay to the east; across the harbor (290 m) the
//   far shore, where the mountain begins.
export const QUAY_Z = -95;                      // the quay edge (the plaza ends here)
export const SEA_Y = -2.2;                      // the harbor's surface
export const FAR_Z = -345;                      // the far shore's waterline
export const STREET = { x0: -20, x1: -6 };      // the street (4 lanes) along the plaza's west side, running north to the quay
export const WALK_W = { x0: -23.5, x1: -20 };   // its west sidewalk; the plaza is the east sidewalk
export const BLD_W = -24;                       // the west buildings' fronts

// the things (their origin: the middle of their footprint at the ground; length along local z, front at local -z)
export const CAR = { len: 4.5, w: 1.8 };
export const BUS = { x: -7.75, z: -5.2, yaw: 0, len: 12.2, w: 2.55, h: 3.15 };          // heading north
export const TRUCK = { x: 12.6, z: -18.0, yaw: 0, len: 20.5, w: 2.55, h: 4.1 };         // heading north
export const JET = { x: 50, z: -52, yaw: Math.PI / 2, len: 70.6, span: 64.4 };          // nose west (yaw +90: local -z -> world -x)
export const SHIP = { x: 0, z: -116, len: 300, beam: 38, draft: 8.8 };                   // its south side at z = -97
export const TOWER = { x: 128, z: -66, w: 36, d: 36, h: 285 };
export const MTN = { x: 40, z: -2612, rx: 4000, rz: 2250, h: 1600 };                    // the mountain: an elliptical base, foot at the far shore

// your path: where you stand for each lift (the middle between your feet) and which way you face (yaw: 0 = facing +z
// (south, toward the start camera), PI = facing north)
export const SPOT = {
  start: { x: 0, z: 0, yaw: 0.35 },
  bus: { x: -5.15, z: -5.2, yaw: -Math.PI / 2 },              // facing west at the bus's side
  truck: { x: 10.0, z: -18.0, yaw: Math.PI / 2 },             // facing east at the truck's side
  jet: { x: 21.35, z: -52, yaw: Math.PI / 2 },                // under its nose, at the nose wheel, facing east
  ship: { x: 30, z: -93.6, yaw: Math.PI },                    // at the quay edge, facing north
  tower: { x: 108.6, z: -72, yaw: Math.PI / 2 },              // at the tower's west face, facing east
  mtn: { x: 60, z: -359.6, yaw: Math.PI },                    // at the mountain's foot, facing north
};

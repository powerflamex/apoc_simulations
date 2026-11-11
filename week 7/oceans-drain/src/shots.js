// The nine shots, in the order you walk them (timeline.js SHOTS). Each one is its own little world at the origin
// (only the current one is drawn): { group, h(x, z), level(v), cam(v), people, frame(v, s, fx) }.
import { makeBeach } from './beach.js';
import { makeWreck } from './wreck.js';
import { makeShelf } from './shelf.js';
import { makeCargo } from './cargo.js';
import { makeVents } from './vents.js';
import { makeTitanic } from './titanic.js';
import { makeMount } from './mount.js';
import { makeTrench, makeBottom } from './trench.js';

export function makeShots(ctx) {
  return [makeBeach, makeWreck, makeShelf, makeCargo, makeVents, makeTitanic, makeMount, makeTrench, makeBottom].map((f) => f(ctx));
}

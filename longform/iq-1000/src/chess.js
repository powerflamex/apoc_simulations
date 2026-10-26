// The park's chess table, on the plaza beside you, with the hustler sitting at it. You play him (your moves just
// happen, as if you'd reached over) and mate him in three: Qh5, then Bc4, then Qxf7#. Pure function of the video clock
// (it's quick, before the world has slowed much).
import * as THREE from 'three';
import { smooth } from './util.js';
import { SEC } from './timeline.js';

export const CHESS = { x: 1.25, z: 0.45, top: 0.76 };
const SQ = 0.055;   // a square

// the position a few moves into a game: [file 0-7, rank 0-7, piece, white?]
const START = [
  [4, 0, 'K', 1], [3, 0, 'Q', 1], [5, 0, 'B', 1], [6, 0, 'N', 1], [0, 0, 'R', 1], [7, 0, 'R', 1], [2, 0, 'B', 1], [1, 0, 'N', 1],
  [0, 1, 'P', 1], [1, 1, 'P', 1], [2, 1, 'P', 1], [3, 1, 'P', 1], [4, 3, 'P', 1], [5, 1, 'P', 1], [6, 1, 'P', 1], [7, 1, 'P', 1],
  [4, 7, 'K', 0], [3, 7, 'Q', 0], [5, 7, 'B', 0], [6, 7, 'N', 0], [0, 7, 'R', 0], [7, 7, 'R', 0], [2, 7, 'B', 0], [2, 5, 'N', 0],
  [0, 6, 'P', 0], [1, 6, 'P', 0], [2, 6, 'P', 0], [3, 6, 'P', 0], [4, 4, 'P', 0], [5, 6, 'P', 0], [6, 6, 'P', 0], [7, 6, 'P', 0],
];
// the moves: [piece index, to file, to rank, video time, captures index]
const MOVES = [
  [1, 7, 4, SEC.chess0 + 1.2],          // Qh5
  [23, 3, 3, SEC.chess0 + 2.6],         // ...Nd4 (the hustler)
  [2, 2, 3, SEC.chess0 + 4.2],          // Bc4
  [24, 0, 5, SEC.chess0 + 5.8],         // ...a6?
  [1, 5, 6, SEC.mate - 0.4, 29],        // Qxf7#
];

export function makeChess(scene) {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.8 });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 24).translate(0, CHESS.top - 0.025, 0), stone));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, CHESS.top - 0.05, 12).translate(0, (CHESS.top - 0.05) / 2, 0), stone));
  // the board: inlaid squares
  const lightM = new THREE.MeshStandardMaterial({ color: 0xe6dcc4, roughness: 0.5 }), darkM = new THREE.MeshStandardMaterial({ color: 0x5a3a24, roughness: 0.5 });
  for (let f = 0; f < 8; f++) for (let rk = 0; rk < 8; rk++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(SQ, 0.004, SQ), (f + rk) % 2 ? lightM : darkM);
    m.position.set((f - 3.5) * SQ, CHESS.top + 0.002, (3.5 - rk) * SQ);
    g.add(m);
  }
  // the pieces: simple turned shapes, white and black
  const wM = new THREE.MeshStandardMaterial({ color: 0xf2eee4, roughness: 0.4 }), bM = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.4 });
  const shape = (p) => {
    const h = { P: 0.028, N: 0.04, B: 0.044, R: 0.038, Q: 0.052, K: 0.058 }[p];
    const geo = new THREE.CylinderGeometry(0.008, 0.016, h, 10).translate(0, h / 2, 0);
    return { geo, h };
  };
  const pieces = START.map(([f, rk, p, w]) => {
    const { geo, h } = shape(p);
    const m = new THREE.Mesh(geo, w ? wM : bM);
    const head = new THREE.Mesh(new THREE.SphereGeometry(p === 'P' ? 0.009 : 0.011, 10, 8), w ? wM : bM);
    head.position.y = h;
    m.add(head);
    m.castShadow = true;
    g.add(m);
    return { m, f, rk };
  });
  g.position.set(CHESS.x, 0, CHESS.z);
  g.rotation.y = -0.83;   // white (your side) faces you
  // the hustler's stool, on the far (black) side
  const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.45, 14).translate(0, 0.225, -0.56), stone);
  g.add(stool);
  scene.add(g);
  const sq = (f, rk, out) => out.set((f - 3.5) * SQ, CHESS.top + 0.004, (3.5 - rk) * SQ);
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  return {
    group: g,
    // where the black king stands (for the thought line), in the world
    kingWorld: (out) => g.localToWorld(sq(4, 7, out)),
    frame(v) {
      pieces.forEach((p, i) => {
        let f = p.f, rk = p.rk, lift = 0, gone = false;
        sq(f, rk, a);
        for (const [pi, tf, tr, t, cap] of MOVES) {
          if (cap === i && v >= t + 0.35) gone = true;
          if (pi !== i) continue;
          const k = smooth(t - 0.3, t + 0.3, v);
          if (k <= 0) continue;
          sq(tf, tr, b);
          a.lerp(b, k);
          lift = Math.sin(Math.PI * k) * 0.03;
        }
        p.m.position.copy(a); p.m.position.y += lift;
        p.m.visible = !gone;
      });
      // checkmate: the black king tips over
      const k = smooth(SEC.mate + 0.3, SEC.mate + 1.0, v);
      const king = pieces[16].m;
      king.rotation.z = k * 1.4;
    },
  };
}

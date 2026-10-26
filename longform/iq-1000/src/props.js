// Small moving things, as functions of world time w: the fountain's jets (drops along their arcs: a smooth spray at
// normal speed, beads hanging in mid-air later), the kid's ball, the guitarist's guitar with strings that swing
// (exaggerated so you can see them at 32x: the low string is 82 Hz), the bubble artist's sticks and rope, and your
// own arm and hand (first person: it reaches for the ball and holds it).
import * as THREE from 'three';
import { rng, smooth, clamp, lerp } from './util.js';
import { FOUNTAIN, GUITAR, BUBBLER, EYE } from './layout.js';
import { ballAt, BALL_R } from './people.js';
import { W } from './timeline.js';

export function makeFountain(scene) {
  const r = rng(61);
  // 8 jets in a ring arcing into the basin, plus the centre plume; each jet is a stream of drops on a parabola
  const jets = [];
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2;
    jets.push({ x: FOUNTAIN.x + Math.cos(a) * (FOUNTAIN.r - 0.3), z: FOUNTAIN.z + Math.sin(a) * (FOUNTAIN.r - 0.3), vx: -Math.cos(a) * 1.4, vz: -Math.sin(a) * 1.4, vy: 3.6, y: 0.5 });
  }
  jets.push({ x: FOUNTAIN.x, z: FOUNTAIN.z, vx: 0, vz: 0, vy: 6.2, y: 1.25, plume: true });
  const PER = 260;
  const n = jets.length * PER;
  const geo = new THREE.SphereGeometry(1, 6, 4);
  const mat = new THREE.MeshStandardMaterial({ color: 0xdfeef5, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.75, envMapIntensity: 2 });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const seeds = Array.from({ length: n }, () => [r(), r(), r(), r()]);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  return {
    frame(w, s) {
      let i = 0;
      for (const j of jets) {
        const T = 2 * j.vy / 9.81 * (j.plume ? 1.0 : 1.05);
        for (let k = 0; k < PER; k++, i++) {
          const sd = seeds[i];
          const t = ((w / T + k / PER + sd[0] * 0.004) % 1) * T;
          const sp = j.plume ? 0.5 : 0.12;
          const vx = j.vx + (sd[1] - 0.5) * sp, vz = j.vz + (sd[2] - 0.5) * sp, vy = j.vy * (0.96 + 0.08 * sd[3]);
          v.set(j.x + vx * t, j.y + vy * t - 4.905 * t * t, j.z + vz * t);
          if (v.y < 0.4) { m.makeScale(0, 0, 0); mesh.setMatrixAt(i, m); continue; }
          // each drop smeared along its motion by your eye's exposure (beads once you're fast)
          const vyt = vy - 9.81 * t;
          dir.set(vx, vyt, vz);
          const spd = dir.length();
          dir.normalize();
          q.setFromUnitVectors(up, dir);
          const rad = j.plume ? 0.022 : 0.016;
          sc.set(rad, Math.max(rad, spd * s.exp * 0.5), rad);
          m.compose(v, q, sc);
          mesh.setMatrixAt(i, m);
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

export function makeBall(scene) {
  const tex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#d63b2f'; g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#f2c230'; for (let i = 0; i < 4; i++) g.fillRect(i * 64, 0, 22, 128);
    g.fillStyle = '#2b6cb0'; g.fillRect(0, 56, 256, 16);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 }));
  mesh.castShadow = true;
  scene.add(mesh);
  return {
    mesh,
    frame(w) {
      const b = ballAt(w);
      mesh.visible = !!b;
      if (b) { mesh.position.set(b.x, b.y, b.z); mesh.rotation.set(b.spin, 0.4, 0); }
    },
  };
}

// the guitar: body, neck, six strings (each a thin line that swings: exaggerated amplitude, real pitch / 10 so the
// swing reads as it slows)
export function makeGuitar(scene) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0xb5762f, roughness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b1a10, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 24).scale(1, 1, 1.25), wood);
  body.rotation.x = Math.PI / 2;
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), dark);
  hole.position.z = 0.051;
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.5, 0.025), dark);
  neck.position.set(0, 0.42, 0.03);
  g.add(body, hole, neck);
  const N = 24;
  const strings = [];
  const smat = new THREE.LineBasicMaterial({ color: 0xe8e2d0 });
  for (let k = 0; k < 6; k++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const line = new THREE.Line(geo, smat);
    g.add(line);
    strings.push({ line, x: -0.02 + k * 0.008, hz: [82.4, 110, 146.8, 196, 246.9, 329.6][k], amp: 0.007 - k * 0.0007 });
  }
  // on his lap, tilted, neck to his left
  g.position.set(GUITAR.x - 0.28, 0.82, GUITAR.z + 0.12);
  g.rotation.set(0.2, -Math.PI / 2 - 0.5, 0.95);
  g.scale.setScalar(1.15);
  scene.add(g);
  return {
    group: g,
    frame(w) {
      // strummed ~1.5 times a second; each strum sets every string swinging, dying away
      const per = 1 / 1.53, since = ((w % per) + per) % per;
      for (const st of strings) {
        const a = st.line.geometry.attributes.position;
        const env = st.amp * Math.exp(-since * 2.2);
        const ph = Math.sin(2 * Math.PI * st.hz * since);
        for (let i = 0; i < N; i++) {
          const u = i / (N - 1);
          const y = -0.1 + u * 0.75;
          const shape = Math.sin(Math.PI * u);
          a.setXYZ(i, st.x + env * ph * shape * 3, y, 0.058);
        }
        a.needsUpdate = true;
      }
    },
  };
}

// the bubble artist's two sticks and the rope loop between them
export function makeWand(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.7 });
  const a = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.1, 6), mat), b = a.clone();
  scene.add(a, b);
  const rope = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(40 * 3), 3)), new THREE.LineBasicMaterial({ color: 0xf2efe6 }));
  scene.add(rope);
  return {
    frame(w) {
      const sw = Math.sin(w * 0.55);
      const base = new THREE.Vector3(BUBBLER.x + 0.15, 1.75, BUBBLER.z + 0.1);
      const tipA = new THREE.Vector3(BUBBLER.x + 0.15 + 0.55, 2.55 + 0.1 * sw, BUBBLER.z + 0.45);
      const tipB = new THREE.Vector3(BUBBLER.x + 0.6 + 0.3 * sw, 2.2 - 0.1 * sw, BUBBLER.z - 0.2);
      for (const [m, tip] of [[a, tipA], [b, tipB]]) {
        const mid = base.clone().add(tip).multiplyScalar(0.5);
        m.position.copy(mid);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tip.clone().sub(base).normalize());
      }
      const p = rope.geometry.attributes.position;
      for (let i = 0; i < 40; i++) {
        const u = i / 39;
        const pt = tipA.clone().lerp(tipB, u);
        pt.y -= Math.sin(Math.PI * u) * (0.55 + 0.1 * Math.sin(w * 0.9));
        pt.x += Math.sin(Math.PI * u) * 0.2 * Math.sin(w * 0.7);
        p.setXYZ(i, pt.x, pt.y, pt.z);
      }
      p.needsUpdate = true;
    },
  };
}

// your arm and hand (first person), in world space: the hand goes where main.js puts it (to the ball as it bounces
// up, then holding it), the forearm runs back toward your shoulder
export function makeHand(scene, ballMat) {
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a27c, roughness: 0.6 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x5b7fa6, roughness: 0.8 });
  const arm = new THREE.Group();
  const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.046, 0.4, 12).translate(0, -0.24, 0), sleeve);
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.06, 10).translate(0, -0.01, 0), skin);
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.095, 0.03).translate(0, 0.055, 0), skin);
  const fingers = [];
  for (let k = 0; k < 4; k++) {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.0105, 0.055, 3, 6).translate(0, 0.035, 0), skin);
    f.position.set(-0.032 + k * 0.021, 0.1, 0);
    fingers.push(f);
  }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.0125, 0.045, 3, 6).translate(0, 0.028, 0), skin);
  thumb.position.set(0.048, 0.04, 0.012); thumb.rotation.z = -0.8;
  const hand = new THREE.Group();
  hand.add(wrist, palm, thumb, ...fingers);
  arm.add(fore, hand);
  scene.add(arm);
  for (const m of [fore, wrist, palm, thumb, ...fingers]) m.castShadow = true;
  arm.visible = false;
  const held = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), ballMat);
  held.castShadow = true;
  scene.add(held);
  const up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion();
  return {
    // wrist: where the wrist is; shoulder: where the arm comes from; ball: where the held ball is (null = not held);
    // curl: fingers 0 open .. 1 wrapped round the ball; roll: turns the palm up (radians)
    frame(on, wrist, shoulder, ball, curl, roll) {
      arm.visible = on;
      held.visible = on && !!ball;
      if (!on) return;
      arm.position.copy(wrist);
      // the forearm points from the shoulder to the wrist; the hand carries on past the wrist
      d.copy(wrist).sub(shoulder).normalize();
      q.setFromUnitVectors(up, d);
      q2.setFromAxisAngle(up, roll);
      arm.quaternion.copy(q).multiply(q2);
      for (const f of fingers) f.rotation.x = -(0.25 + 1.1 * curl);
      thumb.rotation.x = -0.6 * curl;
      if (ball) held.position.copy(ball);
    },
  };
}

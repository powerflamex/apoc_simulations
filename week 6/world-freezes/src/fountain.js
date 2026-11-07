// The fountain in the plaza, just ahead of you on the right: a round stone basin, a pedestal with a bowl, a tall jet from
// the top and a ring of arcs from the rim. The water is drops (each on its own parabola, so the picture is a pure function
// of time); at 0:06 time stops for them: every drop freezes where it is, mid-splash, and turns to ice, and the pool's
// surface whitens from the middle out.
import * as THREE from 'three';
import { FOUNT } from './layout.js';
import { V_FOUNT } from './timeline.js';
import { rng, smooth } from './util.js';
import { frostify } from './frost.js';

const G = 9.81, WATER_Y = 0.42;
const N = 4200;

export function makeFountain(scene, ctx) {
  const R = rng(77);
  const { x: fx, z: fz, r: fr } = FOUNT;
  const stone = ctx.plainMat(0xcfc5b4, 0.8);
  // ---- the stone ----
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(fr, fr + 0.15, 0.6, 48, 1, true).translate(0, 0.3, 0), stone);
  const rimIn = new THREE.Mesh(new THREE.CylinderGeometry(fr - 0.3, fr - 0.3, 0.6, 48, 1, true).translate(0, 0.3, 0), stone);
  rimIn.material = stone; rimIn.scale.set(1, 1, 1);
  const rimTop = new THREE.Mesh(new THREE.RingGeometry(fr - 0.3, fr + 0.02, 48).rotateX(-Math.PI / 2).translate(0, 0.6, 0), stone);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.45, 1.25, 16).translate(0, 0.62, 0), stone);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.35, 0.32, 24).translate(0, 1.35, 0), stone);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, 0.5, 10).translate(0, 1.7, 0), stone);
  for (const m of [rim, rimIn, rimTop, ped, bowl, tip]) { m.position.set(fx, 0, fz); m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  rimIn.material = stone; rimIn.material.side = THREE.DoubleSide;
  // ---- the pool: rippling water, then ice ----
  const PU = { uTime: { value: 0 }, uIce: { value: 0 }, uSkyHi: { value: new THREE.Color() }, uSkyLo: { value: new THREE.Color() } };
  const pool = new THREE.Mesh(new THREE.CircleGeometry(fr - 0.3, 48).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: PU,
    vertexShader: /* glsl */ `varying vec3 vW; varying vec2 vP; void main(){ vP = position.xz; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform float uIce; uniform vec3 uSkyHi; uniform vec3 uSkyLo; varying vec3 vW; varying vec2 vP;
      float h12(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      void main(){
        float r = length(vP);
        float t = min(uTime, ${V_FOUNT.toFixed(2)});
        float rip = sin(r * 14.0 - t * 9.0) * 0.5 + sin(vP.x * 9.0 + t * 5.0) * 0.25 + sin(vP.y * 11.0 - t * 6.0) * 0.25;
        vec3 V = normalize(vW - cameraPosition);
        vec3 n = normalize(vec3(0.08 * rip * cos(r), 1.0, 0.08 * rip * sin(r)));
        vec3 rf = reflect(V, n);
        float fres = 0.04 + 0.96 * pow(1.0 - abs(V.y), 5.0);
        vec3 water = mix(vec3(0.05, 0.2, 0.28), mix(uSkyLo, uSkyHi, clamp(rf.y, 0.0, 1.0)), 0.25 + 0.7 * fres);
        // ice: white from the middle out, with a few cracks
        float front = uIce * 4.0;
        float k = smoothstep(front, front - 0.6, r + 0.3 * h12(floor(vP * 6.0)));
        vec3 ice = vec3(0.82, 0.9, 0.97) * (0.9 + 0.1 * h12(floor(vP * 20.0)));
        gl_FragColor = vec4(mix(water, ice, k), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  pool.position.set(fx, WATER_Y, fz);
  scene.add(pool);
  // ---- the drops ----
  const DROPS = [];
  for (let i = 0; i < N; i++) {
    const top = i < N * 0.42;
    let p0, vel;
    if (top) {
      // the tall jet: straight up, fanning out a little
      const a = R() * Math.PI * 2, s = Math.pow(R(), 0.8) * 0.75;
      p0 = [0, 1.95, 0];
      vel = [Math.cos(a) * s, 8.6 + R() * 0.5, Math.sin(a) * s];
    } else {
      // eight arcs from the rim, curving in to the bowl
      const j = Math.floor(R() * 8), a = j / 8 * Math.PI * 2 + 0.2;
      const rr = fr - 0.4;
      p0 = [Math.cos(a) * rr, 0.6, Math.sin(a) * rr];
      const inw = 1.35 + R() * 0.15;
      vel = [-Math.cos(a) * inw + (R() - 0.5) * 0.06, 4.6 + R() * 0.3, -Math.sin(a) * inw + (R() - 0.5) * 0.06];
    }
    // flight time to the water (or the bowl for the arcs: they fall into the pool past it)
    const tf = (vel[1] + Math.sqrt(vel[1] * vel[1] + 2 * G * (p0[1] - WATER_Y))) / G;
    DROPS.push({ p0, vel, tf, ph: R(), r: 0.018 + R() * 0.016 });
  }
  const iceK = { value: 0 };
  const dropMat = frostify(new THREE.MeshStandardMaterial({ color: 0xbfe0f4, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.8, emissive: 0x31506a, emissiveIntensity: 0.6 }), { boost: iceK });
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), dropMat, N);
  drops.frustumCulled = false;
  scene.add(drops);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
  return {
    PU,
    frame(v, s, glows) {
      // (a hair of slow-down into the freeze, so it reads as stopping, not as a cut)
      const t = v < V_FOUNT - 0.12 ? v : V_FOUNT - 0.12 + 0.12 * smooth(V_FOUNT - 0.12, V_FOUNT + 0.12, v);
      const ice = smooth(V_FOUNT - 0.02, V_FOUNT + 0.35, v);
      iceK.value = ice;
      PU.uTime.value = v; PU.uIce.value = smooth(V_FOUNT - 0.05, V_FOUNT + 0.6, v);
      dropMat.opacity = 0.62 + 0.38 * ice;
      dropMat.emissiveIntensity = 0.45 + 1.3 * ice;
      dropMat.color.setRGB(0.55, 0.74, 0.9).lerp(new THREE.Color(0.9, 0.96, 1.0), ice);
      const thick = 1 + 0.7 * ice;
      DROPS.forEach((d, i) => {
        const age = ((t / d.tf + d.ph) % 1 + 1) % 1 * d.tf;
        const x = d.p0[0] + d.vel[0] * age, y = d.p0[1] + d.vel[1] * age - 0.5 * G * age * age, z = d.p0[2] + d.vel[2] * age;
        const vy = d.vel[1] - G * age;
        dir.set(d.vel[0], vy, d.vel[2]);
        const spd = dir.length();
        dir.divideScalar(spd);
        q.setFromUnitVectors(up, dir);
        // stretched along its flight, like a streak of water (frozen, the streaks stay: icicles in the air)
        m4.compose(pos.set(fx + x, y, fz + z), q, sc.set(d.r * thick, d.r * (1 + spd * 1.7), d.r * thick));
        drops.setMatrixAt(i, m4);
      });
      drops.instanceMatrix.needsUpdate = true;
      // the moment it freezes: a burst of glints off the new ice
      if (glows && v > V_FOUNT - 0.05 && v < V_FOUNT + 1.4) {
        const k = Math.exp(-(v - V_FOUNT) / 0.35);
        for (let i = 0; i < 90; i++) {
          const d = DROPS[(i * 47) % N];
          const age = ((V_FOUNT / d.tf + d.ph) % 1 + 1) % 1 * d.tf;
          const y = d.p0[1] + d.vel[1] * age - 0.5 * G * age * age;
          const tw = 0.5 + 0.5 * Math.sin(v * 30 + i);
          glows.add(fx + d.p0[0] + d.vel[0] * age, y, fz + d.p0[2] + d.vel[2] * age, 0.35 * k + 0.1, 3 * k * tw, 3.3 * k * tw, 3.8 * k * tw);
        }
      }
    },
  };
}

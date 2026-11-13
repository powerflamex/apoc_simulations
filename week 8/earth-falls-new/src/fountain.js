// The fountain in the plaza, just ahead of you on the right: a round stone basin, a pedestal with a bowl, a tall jet from
// the top and a ring of arcs from the rim. The water is drops (each on its own parabola, so the picture is a pure function
// of time). The heat: the pool steams (from ~180°F), then boils at 212°F (domes and bursting bubbles all over it, the
// spray hissing off as steam); when the power fails the jets die (no drop leaves after uOff) and the pool boils dry.
import * as THREE from 'three';
import { FOUNT } from './layout.js';
import { rng, smooth } from './util.js';

const G = 9.81, WATER_Y = 0.54;
const N = 4200;

export function makeFountain(scene, ctx) {
  const R = rng(77);
  const { x: fx, z: fz, r: fr } = FOUNT;
  const stone = ctx.plainMat(0xcfc5b4, 0.8, {}, { burnK: 0.5 });
  // ---- the stone ----
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(fr, fr + 0.15, 0.6, 48, 1, true).translate(0, 0.3, 0), stone);
  const rimIn = new THREE.Mesh(new THREE.CylinderGeometry(fr - 0.3, fr - 0.3, 0.6, 48, 1, true).translate(0, 0.3, 0), stone);
  const rimTop = new THREE.Mesh(new THREE.RingGeometry(fr - 0.3, fr + 0.02, 48).rotateX(-Math.PI / 2).translate(0, 0.6, 0), stone);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(fr - 0.3, 48).rotateX(-Math.PI / 2).translate(0, 0.05, 0), stone);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.45, 1.25, 16).translate(0, 0.62, 0), stone);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.35, 0.32, 24).translate(0, 1.35, 0), stone);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, 0.5, 10).translate(0, 1.7, 0), stone);
  stone.side = THREE.DoubleSide;
  for (const m of [rim, rimIn, rimTop, floor, ped, bowl, tip]) { m.position.set(fx, 0, fz); m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  // ---- the pool: rippling water, steaming, boiling, boiling away ----
  const PU = { uTime: { value: 0 }, uBoil: { value: 0 }, uSteam: { value: 0 }, uSkyHi: { value: new THREE.Color() }, uSkyLo: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3(0, 1, 0) } };
  const pool = new THREE.Mesh(new THREE.CircleGeometry(fr - 0.3, 48).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: PU,
    vertexShader: /* glsl */ `varying vec3 vW; varying vec2 vP; void main(){ vP = position.xz; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform float uBoil; uniform float uSteam; uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform vec3 uSun; varying vec3 vW; varying vec2 vP;
      float h12(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      void main(){
        float r = length(vP), t = uTime;
        float rip = sin(r * 14.0 - t * 9.0) * 0.5 + sin(vP.x * 9.0 + t * 5.0) * 0.25 + sin(vP.y * 11.0 - t * 6.0) * 0.25;
        // the boil: bubbles that swell and burst, all over the pool (a few per cell, each on its own beat)
        vec2 g = vP * 3.2; vec2 gi = floor(g), gf = fract(g) - 0.5;
        float ph = fract(t * (1.1 + h12(gi)) + h12(gi + 3.0));
        vec2 c0 = (vec2(h12(gi + 1.0), h12(gi + 2.0)) - 0.5) * 0.5;
        float br = 0.08 + 0.32 * ph;
        float dd = length(gf - c0);
        float ring = (1.0 - smoothstep(0.0, 0.05, abs(dd - br))) * (1.0 - ph) * step(0.25, h12(gi + 5.0));
        float dome = (1.0 - smoothstep(0.0, br, dd)) * step(0.25, h12(gi + 5.0));
        vec3 V = normalize(vW - cameraPosition);
        vec3 n = normalize(vec3((0.08 * rip + uBoil * 0.6 * dome * (gf.x - c0.x)) , 1.0, (0.08 * rip + uBoil * 0.6 * dome * (gf.y - c0.y))));
        vec3 rf = reflect(V, n);
        float fres = 0.04 + 0.96 * pow(1.0 - abs(V.y), 5.0);
        vec3 water = mix(vec3(0.05, 0.2, 0.28), mix(uSkyLo, uSkyHi, clamp(rf.y, 0.0, 1.0)), 0.25 + 0.7 * fres);
        water += vec3(1.0, 0.9, 0.7) * pow(max(dot(rf, uSun), 0.0), 80.0) * 2.0;
        // white churn and foam rings
        water = mix(water, vec3(0.93, 0.95, 0.95), uBoil * clamp(ring * 1.2 + dome * 0.55 + 0.3, 0.0, 1.0));
        water = mix(water, vec3(0.82, 0.84, 0.84), uSteam * 0.3);
        gl_FragColor = vec4(water, 1.0);
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
      const a = R() * Math.PI * 2, s = Math.pow(R(), 0.8) * 0.75;
      p0 = [0, 1.95, 0];
      vel = [Math.cos(a) * s, 8.6 + R() * 0.5, Math.sin(a) * s];
    } else {
      const j = Math.floor(R() * 8), a = j / 8 * Math.PI * 2 + 0.2;
      const rr = fr - 0.4;
      p0 = [Math.cos(a) * rr, 0.6, Math.sin(a) * rr];
      const inw = 1.35 + R() * 0.15;
      vel = [-Math.cos(a) * inw + (R() - 0.5) * 0.06, 4.6 + R() * 0.3, -Math.sin(a) * inw + (R() - 0.5) * 0.06];
    }
    const tf = (vel[1] + Math.sqrt(vel[1] * vel[1] + 2 * G * (p0[1] - WATER_Y))) / G;
    DROPS.push({ p0, vel, tf, ph: R(), r: 0.018 + R() * 0.016 });
  }
  const dropMat = new THREE.MeshStandardMaterial({ color: 0xbfe0f4, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.8, emissive: 0x31506a, emissiveIntensity: 0.6 });
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), dropMat, N);
  drops.frustumCulled = false;
  scene.add(drops);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    PU, DROPS,
    // tOff: when the pumps stop; dry: 0..1 how far the pool has boiled away
    frame(v, s, tOff, dry) {
      PU.uTime.value = v; PU.uBoil.value = s.boil * (1 - dry); PU.uSteam.value = s.steam;
      pool.position.y = WATER_Y - 0.48 * dry;
      pool.visible = dry < 0.98;
      dropMat.color.setRGB(0.55, 0.74, 0.9).lerp(new THREE.Color(0.86, 0.88, 0.9), s.boil * 0.6);
      DROPS.forEach((d, i) => {
        const age = ((v / d.tf + d.ph) % 1 + 1) % 1 * d.tf;
        if (v - age > tOff) { drops.setMatrixAt(i, zero); return; }       // (launched after the pumps stopped: never was)
        const x = d.p0[0] + d.vel[0] * age, y = d.p0[1] + d.vel[1] * age - 0.5 * G * age * age, z = d.p0[2] + d.vel[2] * age;
        const vy = d.vel[1] - G * age;
        dir.set(d.vel[0], vy, d.vel[2]);
        const spd = dir.length();
        dir.divideScalar(spd);
        q.setFromUnitVectors(up, dir);
        // (in the boil the spray flashes to steam on the way down: the drops thin out)
        const k = 1 - s.boil * 0.5 * smooth(0.3, 1.0, age / d.tf);
        m4.compose(pos.set(fx + x, y, fz + z), q, sc.set(d.r * k, d.r * (1 + spd * 1.7) * k, d.r * k));
        drops.setMatrixAt(i, m4);
      });
      drops.instanceMatrix.needsUpdate = true;
    },
  };
}

// The brick wall in front of you: one instanced box per brick (running bond, each box carries half the mortar joint
// round it, painted in the shader), old red bricks of slightly different tones. Punch 1 cracks it: dark cracks run out
// from your fist across the bricks. Punch 2 goes straight through: the bricks round the fist fly out across the street,
// tumbling, and skid to a stop; the rest of the wall stands (until the big blasts flatten everything).
import * as THREE from 'three';
import { WALL, IMP } from './layout.js';
import { vPunch } from './timeline.js';
import { rng, smooth, clamp } from './util.js';

const BL = 0.225, BH = 0.075;          // brick + joint
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

export function makeWall(scene) {
  const R = rng(2024);
  const BR = [];
  const nC = Math.round(WALL.h / BH);
  const V2 = vPunch(2);
  for (let c = 0; c < nC; c++) {
    const off = (c % 2) * BL / 2;
    for (let x = WALL.x0 - off; x < WALL.x1; x += BL) {
      const xa = Math.max(x, WALL.x0), xb = Math.min(x + BL, WALL.x1);
      if (xb - xa < 0.03) continue;
      const cx = (xa + xb) / 2, cy = (c + 0.5) * BH;
      // inside the hole? (an irregular blob round the fist, a little wider than tall, open to the top of the wall)
      const dx = (cx - IMP.x) / 1.35, dy = (cy - IMP.y) / (cy > IMP.y ? 1.6 : 1.05);
      const ang = Math.atan2(dy, dx);
      const rr = 1 + 0.18 * Math.sin(ang * 3 + 1.3) + 0.12 * Math.sin(ang * 7 + 0.4) + (R() - 0.5) * 0.25;
      const d = Math.hypot(dx, dy);
      const out = d < rr;
      const b = { x: cx, y: cy, w: xb - xa, seed: R(), tone: R() };
      if (out) {
        // blown out across the street: fastest straight ahead, slower toward the edge of the hole
        const k = 1 - d / rr;
        const a = Math.atan2(cy - IMP.y, cx - IMP.x);
        const sp = 7 + 13 * k + R() * 5;
        b.v0 = V2 + 0.004 * d * 10 + R() * 0.02;
        b.vel = [Math.cos(a) * (2 + 5 * (1 - k)) + (R() - 0.5) * 3, Math.sin(a) * (1.5 + 3 * (1 - k)) + 2 + R() * 3, -sp];
        b.spin = [(R() - 0.5) * 22, (R() - 0.5) * 18, (R() - 0.5) * 22];
      }
      BR.push(b);
    }
  }
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const aB = new THREE.InstancedBufferAttribute(new Float32Array(BR.length * 4), 4);   // tone, seed, size x, flying
  geo.setAttribute('aB', aB);
  BR.forEach((b, i) => aB.setXYZW(i, b.tone, b.seed, b.w, b.v0 ? 1 : 0));
  const U = { uCrack: { value: 0 }, uImp: { value: new THREE.Vector3(IMP.x, IMP.y, WALL.zf) }, uDust: { value: 0 } };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
        attribute vec4 aB; varying vec4 vB; varying vec3 vLoc; varying vec3 vWP2; varying vec3 vON2;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vB = aB; vLoc = position; vON2 = normal; vWP2 = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        uniform float uCrack; uniform vec3 uImp; uniform float uDust;
        varying vec4 vB; varying vec3 vLoc; varying vec3 vWP2; varying vec3 vON2;
        float bh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float bn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(bh(i), bh(i+vec2(1,0)), f.x), mix(bh(i+vec2(0,1)), bh(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          // brick: red-brown tones, a little burnt variation, pitted face
          vec3 c = mix(vec3(0.55, 0.2, 0.13), vec3(0.68, 0.3, 0.19), vB.x);
          c = mix(c, vec3(0.38, 0.16, 0.12), step(0.86, vB.y) * 0.7);
          vec2 fp = vWP2.xy * 40.0 + vWP2.z * 40.0;
          c *= 0.82 + 0.22 * bn(fp) + 0.08 * bn(fp * 4.0);
          // the mortar joint: the outer 5 mm of the box on the faces (front/back: all four edges)
          vec3 a = abs(vLoc) * 2.0;     // 0 centre .. 1 edge, in box units
          float sx = vB.z, sy = ${BH.toFixed(3)}, sz = ${(WALL.zf - WALL.zb).toFixed(3)} * -1.0;
          float ex = (1.0 - a.x) * sx * 0.5, ey = (1.0 - a.y) * sy * 0.5, ez = (1.0 - a.z) * abs(sz) * 0.5;
          float face = abs(vON2.z) > 0.5 ? min(ex, ey) : abs(vON2.x) > 0.5 ? min(ey, ez) : min(ex, ez);
          float mortar = (1.0 - smoothstep(0.0045, 0.0065, face)) * (1.0 - vB.w * 0.0);
          c = mix(c, vec3(0.62, 0.6, 0.56) * (0.85 + 0.2 * bn(fp * 2.0)), mortar);
          // cracks from the fist (punch 1): jagged dark lines radiating out, shorter ones branching
          if (uCrack > 0.0 && vON2.z > 0.5) {
            vec2 q = vWP2.xy - uImp.xy;
            float r = length(q);
            float ang = atan(q.y, q.x);
            float n = 9.0;
            float k = ang / 6.2831853 * n + bn(vec2(r * 6.0, 1.7)) * 0.9;
            float line = abs(fract(k) - 0.5) / n * 6.2831853 * r;        // distance to the nearest radial crack (m)
            float len = (0.35 + 0.65 * bh(vec2(floor(k), 3.1))) * 1.25 * uCrack;
            float cr = (1.0 - smoothstep(0.002, 0.006 + 0.004 * (1.0 - r / max(len, 0.01)), line)) * step(r, len) * step(0.05, r);
            // a ring of crushed brick right round the fist
            float ring = (1.0 - smoothstep(0.0, 0.012, abs(r - 0.11 - 0.03 * bn(vec2(ang * 3.0, 0.0))))) * step(0.01, uCrack);
            float crush = (1.0 - smoothstep(0.06, 0.12, r)) * uCrack;
            c = mix(c, vec3(0.05, 0.03, 0.025), max(cr, ring) * 0.9);
            c = mix(c, c * 0.55 + vec3(0.12, 0.08, 0.06), crush);
          }
          c = mix(c, vec3(0.5, 0.45, 0.4), uDust);
          diffuseColor.rgb = c;
        }`);
  };
  mat.customProgramCacheKey = () => 'bricks-v1';
  const mesh = new THREE.InstancedMesh(geo, mat, BR.length);
  mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  const zc = (WALL.zf + WALL.zb) / 2, dep = WALL.zf - WALL.zb;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const flying = BR.filter((b) => b.v0);
  return {
    mesh, U, flying,
    frame(v, vGone, smoke, glows) {
      U.uCrack.value = smooth(vPunch(1), vPunch(1) + 0.12, v);
      const gone = v > vGone;
      for (let i = 0; i < BR.length; i++) {
        const b = BR[i];
        if (gone) { mesh.setMatrixAt(i, HIDE); continue; }
        if (!b.v0 || v < b.v0) { m4.compose(p.set(b.x, b.y, zc), q.identity(), sc.set(b.w, BH, dep)); mesh.setMatrixAt(i, m4); continue; }
        // flying: ballistic until it hits the ground, then it skids and tumbles to a stop
        const t = v - b.v0;
        const vy = b.vel[1], y0 = b.y;
        const tg = (vy + Math.sqrt(vy * vy + 2 * 9.8 * (y0 - 0.04))) / 9.8;
        let x, y, z, rot;
        if (t < tg) {
          x = b.x + b.vel[0] * t; y = y0 + vy * t - 4.9 * t * t; z = zc + b.vel[2] * t; rot = t;
        } else {
          const ts = t - tg, slide = 0.6 * (1 - Math.exp(-ts / 0.35));
          x = b.x + b.vel[0] * (tg + slide); z = zc + b.vel[2] * (tg + slide); y = 0.04 + 0.03 * Math.exp(-ts * 6) * Math.abs(Math.sin(ts * 20)); rot = tg + slide;
        }
        e.set(b.spin[0] * rot, b.spin[1] * rot, b.spin[2] * rot);
        q.setFromEuler(e);
        m4.compose(p.set(x, y, z), q, sc.set(b.w, BH, dep));
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
      // brick dust: a puff at the fist on punch 1, a burst through the hole on punch 2 that rolls out over the street
      for (const [vp, big] of [[vPunch(1), 0], [vPunch(2), 1]]) {
        const age = v - vp;
        if (age < 0 || age > 6) continue;
        const Rd = rng(big ? 77 : 78);
        const np = big ? 16 : 6;
        for (let k = 0; k < np; k++) {
          const a = Rd() * Math.PI * 2, seed = Rd(), sp = Rd();
          const out = big ? (2 + 9 * sp) * (1 - Math.exp(-age / 0.45)) : 0.25 * (1 - Math.exp(-age / 0.2));
          const r = big ? 0.3 + age * (0.6 + 0.4 * seed) : 0.08 + age * 0.15;
          smoke.puff(IMP.x + Math.cos(a) * out * (big ? 0.5 : 1), Math.max(r * 0.5, IMP.y + Math.sin(a) * out * 0.3 - age * 0.25 * big), WALL.zf - (big ? out : 0.05),
            r, (big ? 0.32 : 0.22) * smooth(0, 0.06, age) * (1 - smooth(big ? 0.8 : 0.5, big ? 2.6 : 1.4, age)), 0.62 + 0.15 * seed, 0, seed);
        }
      }
    },
  };
}

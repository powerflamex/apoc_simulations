// The things you walk into, each destroyed by the heat where it is (heat.js), as you get close:
//   the hot dog cart (z -9.6): its umbrella catches and burns off (~22 kW/m²), the cart burns, and its propane bottle
//     bursts into a fireball (~120 kW/m² on the bottle);
//   the bus stopped in the oncoming lane (z -14 to -26): windows crack, tires and seats burn, then it sags like wax from
//     the end nearest you as you walk past it (hotcars.js carHeat, per vertex);
//   the fountain in the plaza (z -29): its water steams, then flashes to steam all at once (~3 MW/m²: a white burst);
//   the gas station across the cross street (z -80): the pumps catch fire; when the slab over its tanks is past ~1 MW/m²
//     the fuel goes up in one fireball and the canopy is thrown.
// Times are worked out once here (timeline.js timeOfQAt) and read by main.js / audio.mjs (EVENTS).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CART, BUS, FOUNTAIN, STATION } from './layout.js';
import { timeOfQAt, Q } from './timeline.js';
import { carHeat } from './hotcars.js';
import { HU, HEAT_GLSL, LQ_GLSL, bbColor } from './heat.js';
import { emitColumn } from './smoke.js';
import { smooth, rng, clamp } from './util.js';

export const EVENTS = {
  cartUmb: timeOfQAt(Q.IGNITE, CART.x, 2.3, CART.z, 0.9),
  cartFire: timeOfQAt(Q.TREE * 1.3, CART.x, 0.8, CART.z, 0.6),
  cartPop: timeOfQAt(1.2e5, CART.x, 0.5, CART.z),
  busNear: timeOfQAt(Q.CAR, BUS.x, 1.5, BUS.z + BUS.len / 2),
  busFar: timeOfQAt(Q.CAR, BUS.x, 1.5, BUS.z - BUS.len / 2),
  steam: timeOfQAt(Q.TAR, FOUNTAIN.x, 0.6, FOUNTAIN.z),
  flash: timeOfQAt(Q.FLASH, FOUNTAIN.x, 0.6, FOUNTAIN.z),
  pumps: timeOfQAt(Q.TREE * 1.2, STATION.cx + 3, 1.0, STATION.cz + 3),
  // (the fuel in its tanks goes up once the ground over them is past ~1 MW/m²: the slab cracks, vapour and fire meet)
  boom: timeOfQAt(Q.CAR * 1.3, STATION.cx, 0.0, STATION.cz),
};
EVENTS.busWin = timeOfQAt(Q.CRACK, BUS.x + BUS.w / 2, 1.8, BUS.z + BUS.len / 2);
EVENTS.busSeats = timeOfQAt(Q.TREE * 1.3, BUS.x, 1.2, BUS.z + BUS.len / 2 - 2);
console.log('street:', Object.entries(EVENTS).map(([k, t]) => `${k} ${t.toFixed(2)}`).join(', '));

export function makeStreet(scene, ctx) {
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), tmpC = new THREE.Color();
  const add = (mesh) => { mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; scene.add(mesh); return mesh; };
  // ---------- the hot dog cart ----------
  const cart = new THREE.Group();
  cart.position.set(CART.x, 0, CART.z);
  scene.add(cart);
  const steel = ctx.heated(ctx.plainMat(0xc8ccd0, 0.3, { metalness: 0.6 }), 'cartsteel', { charAt: 'GLASS', glowAt: 'TAR' });
  const red = ctx.heated(ctx.plainMat(0xc8322a, 0.5), 'cartred', { charAt: 'MELT', glowAt: 'TAR' });
  cart.add(add(new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.75, 1.7).translate(0, 0.62, 0), red)));
  cart.add(add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 1.76).translate(0, 1.03, 0), steel)));
  cart.add(add(new THREE.Mesh(mergeGeometries([-1, 1].map((s) => new THREE.CylinderGeometry(0.22, 0.22, 0.08, 14).rotateZ(Math.PI / 2).translate(s * 0.46, 0.22, 0.35))), ctx.plainMat(0x222222, 0.8))));
  cart.add(add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 6).translate(0, 1.7, 0), steel)));
  const bottle = add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.45, 12).translate(0.05, 0.48, -0.95), ctx.plainMat(0xd8d8d0, 0.4)));
  cart.add(bottle);
  // the umbrella: striped canvas that burns through from its hottest edge
  const umbMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide });
  umbMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, HU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      varying vec3 vUP; varying vec3 vUW;`).replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vUP = position; vUW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vUP; varying vec3 vUW;
      ${HEAT_GLSL}
      ${LQ_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= mix(vec3(0.95, 0.85, 0.2), vec3(0.85, 0.12, 0.1), step(0.5, fract(atan(vUP.z, vUP.x) / 6.2832 * 8.0)));
        float b = (lqAt(vUW) - LQ_IGNITE) / 0.3;
        float n = fb3(vUW * 3.0);
        diffuseColor.rgb *= 1.0 - 0.9 * smoothstep(-0.6, 0.1, b - n * 0.8);
        if (b > n * 0.8 + 0.25) discard;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(3.0, 1.0, 0.2) * smoothstep(n * 0.8 + 0.05, n * 0.8 + 0.25, b) * (0.7 + 0.3 * sin(uHT * 17.0 + vUW.x * 9.0));`);
  };
  umbMat.customProgramCacheKey = () => 'hot-umbrella-v1';
  cart.add(add(new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.45, 16, 1, true).translate(0, 2.32, 0), umbMat)));

  // ---------- the bus (front to the south: it was coming toward you) ----------
  const busPaint = carHeat(ctx.plainMat(0xd03a2c, 0.45, { metalness: 0.2 }), 'paint', true);
  const busWhite = carHeat(ctx.plainMat(0xf2efe8, 0.5), 'paint', true);
  const busGlass = carHeat(ctx.plainMat(0x161b22, 0.12, { metalness: 0.5 }), 'glass', true);
  const busTire = carHeat(ctx.plainMat(0x151515, 0.9), 'wheel', true);
  const L = BUS.len, Wd = BUS.w;
  const busParts = [
    [new THREE.BoxGeometry(Wd, 1.05, L, 2, 3, 24).translate(0, 0.35 + 0.52, 0), busPaint],
    [new THREE.BoxGeometry(Wd * 1.01, 1.0, L * 0.985, 2, 3, 24).translate(0, 1.4 + 0.5, 0), busGlass],
    [new THREE.BoxGeometry(Wd, 0.35, L, 2, 1, 24).translate(0, 2.4 + 0.17, 0), busWhite],
    [new THREE.BoxGeometry(Wd * 0.98, 0.15, L * 0.98, 2, 1, 24).translate(0, 2.82, 0), busPaint],
    [mergeGeometries([-1, 1].flatMap((sx) => [-1, 1, 0.55].map((sz) => new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16).rotateZ(Math.PI / 2).translate(sx * (Wd / 2 - 0.12), 0.5, sz * (L / 2 - 2.2))))), busTire],
  ];
  for (const [g, mat] of busParts) {
    const im = new THREE.InstancedMesh(g, mat, 1);
    im.setMatrixAt(0, m4.makeRotationY(Math.PI).setPosition(BUS.x, 0, BUS.z));
    add(im);
  }
  const BUSFIRE = [];
  for (let k = 0; k < 6; k++) {
    const z = BUS.z + L / 2 - 1 - k * 2;
    BUSFIRE.push({ x: BUS.x + 0.3, z, t: timeOfQAt(Q.TREE * 1.3, BUS.x, 1.2, z, 0.8), seed: (k * 0.37) % 1 });
  }
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const x = BUS.x + sx * (Wd / 2 - 0.12), z = BUS.z + sz * (L / 2 - 2.2);
    BUSFIRE.push({ x, z, tire: true, t: timeOfQAt(Q.TREE, x, 0.5, z), seed: (sx * 0.3 + sz * 0.17 + 1) % 1 });
  }

  // ---------- the fountain: a stone basin, water, a jet; it steams, then flashes to steam ----------
  const stone = ctx.heated(ctx.plainMat(0xb9b1a4, 0.8), 'fountainstone', { charAt: 'GLASS', glowAt: 'GLASS' });
  const basin = add(new THREE.Mesh(new THREE.LatheGeometry([[FOUNTAIN.r - 0.3, 0], [FOUNTAIN.r + 0.05, 0], [FOUNTAIN.r + 0.05, 0.55], [FOUNTAIN.r - 0.25, 0.55], [FOUNTAIN.r - 0.25, 0.1]].map(([r, y]) => new THREE.Vector2(r, y)), 40), stone));
  basin.position.set(FOUNTAIN.x, 0, FOUNTAIN.z);
  const pedestal = add(new THREE.Mesh(mergeGeometries([new THREE.CylinderGeometry(0.22, 0.3, 1.1, 14).translate(0, 0.55, 0), new THREE.CylinderGeometry(0.85, 0.3, 0.25, 20).translate(0, 1.2, 0)]), stone));
  pedestal.position.copy(basin.position);
  const water = new THREE.Mesh(new THREE.CircleGeometry(FOUNTAIN.r - 0.28, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3f86a8, roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.88 }));
  water.position.set(FOUNTAIN.x, 0.42, FOUNTAIN.z);
  scene.add(water);
  const jetMat = new THREE.MeshStandardMaterial({ color: 0xe8f4ff, roughness: 0.1, transparent: true, opacity: 0.55, depthWrite: false });
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 1.6, 10, 1, true).translate(0, 2.1, 0), jetMat);
  const spill = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.35, 0.9, 28, 1, true).translate(0, 0.85, 0), jetMat);
  for (const m of [jet, spill]) { m.position.set(FOUNTAIN.x, 0, FOUNTAIN.z); m.renderOrder = 3; scene.add(m); }

  // ---------- the gas station: canopy on four posts, four pumps, the shop, the price sign ----------
  const G = new THREE.Group();
  scene.add(G);
  const white = ctx.heated(ctx.plainMat(0xf2f2ee, 0.6), 'gaswhite', { charAt: 'TAR', glowAt: 'GLASS' });
  const gred = ctx.heated(ctx.plainMat(0xc22a22, 0.5), 'gasred', { charAt: 'MELT', glowAt: 'TAR' });
  const canopy = new THREE.Group();
  canopy.position.set(STATION.cx, 5.0, STATION.cz);
  canopy.add(add(new THREE.Mesh(new THREE.BoxGeometry(13, 0.7, 10), white)));
  canopy.add(add(new THREE.Mesh(new THREE.BoxGeometry(13.1, 0.3, 10.1).translate(0, 0.1, 0), gred)));
  G.add(canopy);
  const posts = add(new THREE.Mesh(mergeGeometries([[-4.5, -3.5], [4.5, -3.5], [-4.5, 3.5], [4.5, 3.5]].map(([x, z]) => new THREE.BoxGeometry(0.35, 5, 0.35).translate(STATION.cx + x, 2.5, STATION.cz + z))), white));
  const pumpGeo = mergeGeometries([[-2.2, -1.8], [2.2, -1.8], [-2.2, 1.8], [2.2, 1.8]].map(([x, z]) => new THREE.BoxGeometry(0.6, 1.7, 1.0).translate(STATION.cx + x, 0.85 + 0.15, STATION.cz + z)));
  const pumps = add(new THREE.Mesh(pumpGeo, gred));
  const islands = add(new THREE.Mesh(mergeGeometries([-2.2, 2.2].map((x) => new THREE.BoxGeometry(1.2, 0.15, 6).translate(STATION.cx + x, 0.075, STATION.cz))), ctx.heated(ctx.plainMat(0xb0aca4, 0.8), 'island')));
  const shop = add(new THREE.Mesh(new THREE.BoxGeometry(8, 4.2, 7).translate(STATION.x0 + 5, 2.1, STATION.z0 + 4.5), ctx.heated(ctx.plainMat(0xe0d6c4, 0.7), 'gasshop')));
  const sign = add(new THREE.Mesh(mergeGeometries([new THREE.BoxGeometry(0.3, 7, 0.3).translate(0, 3.5, 0), new THREE.BoxGeometry(2.4, 1.6, 0.3).translate(0, 7.6, 0)]), gred));
  sign.position.set(STATION.x1 - 1.2, 0, STATION.z1 - 1.2);
  for (const m of [posts, pumps, islands, shop]) G.add(m);
  const R = rng(4545);
  const BOOM = Array.from({ length: 80 }, () => ({ a: R() * Math.PI * 2, e: R(), s: R(), r: R() }));
  const STEAM = Array.from({ length: 46 }, () => ({ a: R() * Math.PI * 2, e: R(), s: R() }));
  const POP = Array.from({ length: 18 }, () => ({ a: R() * Math.PI * 2, e: R(), s: R() }));
  const boomL = new THREE.PointLight(0xff9a40, 0, 0, 2);
  boomL.position.set(STATION.cx, 6, STATION.cz);
  scene.add(boomL);

  return {
    frame(v, fire, smoke) {
      // ---- the cart: umbrella burning, the cart on fire, the bottle's fireball ----
      {
        const tu = v - EVENTS.cartUmb;
        if (tu > 0 && tu < 3) for (let j = 0; j < 4; j++) fire.add(CART.x + Math.cos(j * 1.6) * 0.7, 2.1, CART.z + Math.sin(j * 1.6) * 0.7, 0.9, 1.3, 0.9 * Math.min(1, tu / 0.2) * (1 - smooth(1.8, 3, tu)), (j * 0.31) % 1);
        const tc = v - EVENTS.cartFire;
        if (tc > 0) {
          fire.add(CART.x, 0.9, CART.z, 1.2, 1.6, 0.9 * Math.min(1, tc / 0.4), 0.71);
          emitColumn(smoke, CART.x, 1.6, CART.z, tc, { life: 8, every: 0.4, rise: 2.4, size: 0.6, grow: 0.8, alpha: 0.7, shade: 0.06, glow: 0.35, seed: 0.4, maxAge: 5 });
        }
        const tp = v - EVENTS.cartPop;
        bottle.visible = tp < 0;
        if (tp > 0 && tp < 3.5) for (const P of POP) {
          const R2 = (0.5 + 2.8 * (1 - Math.exp(-tp * 4))) * (0.6 + 0.6 * P.s);
          bbColor(2200 + 1200 * Math.exp(-tp * 2), tmpC);
          smoke.puff(CART.x + 0.05 + Math.cos(P.a) * R2 * 0.6, 0.5 + R2 * (0.4 + 0.7 * P.e) + 1.2 * tp, CART.z - 0.95 + Math.sin(P.a) * R2 * 0.6, 0.6 + 1.1 * R2 * 0.5,
            0.85 * smooth(0, 0.05, tp) * (1 - smooth(1.5, 3.5, tp)), 0.08, 3.2 * Math.exp(-tp * 1.6), P.s, tmpC.r * 1.8, tmpC.g * 1.8, tmpC.b * 1.8);
        }
      }
      // ---- the bus: flames out of its windows and tires ----
      for (const B of BUSFIRE) {
        const t = v - B.t; if (!(t > 0)) continue;
        const k = Math.min(1, t / 0.4);
        if (B.tire) fire.add(B.x, 0.05, B.z, 0.8, 1.0 + 0.3 * Math.min(t, 2), 0.9 * k, B.seed);
        else {
          fire.add(B.x - 1.3, 1.3, B.z, 1.0, 1.6, 0.85 * k, B.seed);
          fire.add(B.x, 2.9, B.z, 1.4, 1.8 * k, 0.6 * k, (B.seed + 0.5) % 1);
          if (t < 12) emitColumn(smoke, B.x, 3.0, B.z, t, { life: 9, every: 0.5, rise: 2.6, size: 1.0, grow: 0.9, alpha: 0.7, shade: 0.05, glow: 0.35, seed: B.seed, maxAge: 5 });
        }
      }
      // ---- the fountain: steaming, then the flash ----
      {
        const ts = v - EVENTS.steam, tf = v - EVENTS.flash;
        const gone = smooth(0, 0.25, tf);
        water.visible = gone < 1; water.scale.setScalar(1 - 0.6 * gone);
        water.material.opacity = 0.88 * (1 - gone);
        jet.visible = spill.visible = tf < 0.2;
        const fl = 1 + 0.06 * Math.sin(v * 37) + 0.04 * Math.sin(v * 23);
        jet.scale.set(1, fl, 1); spill.scale.set(1, 1 + 0.05 * Math.sin(v * 29), 1);
        if (ts > 0 && tf < 0.5) emitColumn(smoke, FOUNTAIN.x, 0.6, FOUNTAIN.z, ts, { heat: false, life: 99, every: 0.25, rise: 2.0, dx: 0.3, size: 0.8 + 0.6 * smooth(0, 4, ts), grow: 0.9, alpha: 0.35 + 0.3 * smooth(0, 4, ts), shade: 0.95, glow: 0, seed: 0.2, maxAge: 3 });
        if (tf > 0 && tf < 6 && !(globalThis.__DBG || '').includes('nosteam')) for (const S of STEAM) {
          const R2 = (1 + 9 * (1 - Math.exp(-tf * 2.2))) * (0.5 + 0.6 * S.s);
          smoke.puff(FOUNTAIN.x + Math.cos(S.a) * R2 * 0.7, 0.8 + R2 * (0.3 + 0.9 * S.e) + 2.5 * tf, FOUNTAIN.z + Math.sin(S.a) * R2 * 0.7, 1.4 + 0.5 * R2,
            0.9 * smooth(0, 0.08, tf) * (1 - smooth(2.5, 6, tf)), 0.97, 0, S.s);
        }
      }
      // ---- the gas station: pumps burning, then the tanks going up ----
      {
        const tp = v - EVENTS.pumps, tb = v - EVENTS.boom;
        if (tp > 0) {
          const k = Math.min(1, tp / 0.5) * (tb > 0 ? Math.exp(-tb * 2) : 1);
          for (const [x, z] of [[-2.2, -1.8], [2.2, -1.8], [-2.2, 1.8], [2.2, 1.8]]) fire.add(STATION.cx + x, 0.4, STATION.cz + z, 1.6, 3.2, 0.95 * k, ((x + z) * 0.13 + 2) % 1);
          if (tb < 0) emitColumn(smoke, STATION.cx, 5.5, STATION.cz, tp, { life: 99, every: 0.3, rise: 4, size: 2.2, grow: 1.2, alpha: 0.8, shade: 0.04, glow: 0.4, seed: 0.6, maxAge: 6 });
        }
        if (tb > 0 && tb < 7 && !(globalThis.__DBG || '').includes('noboom')) for (const B of BOOM) {
          const R2 = (2.5 + 17 * (1 - Math.exp(-tb * 3))) * (0.5 + 0.6 * B.r);
          bbColor(2000 + 2500 * Math.exp(-tb * 1.2), tmpC);
          // (a ball that bursts out over the lot, then rises as a column with a cap: kept to the lot, off your street)
          const up = 12 * tb + 5 * tb * tb, cap = smooth(0.6, 2.5, tb);
          smoke.puff(STATION.cx - 2 + Math.cos(B.a) * R2 * (0.7 + 0.6 * cap * B.e), 2 + R2 * 0.45 * B.e + up * (0.35 + 0.65 * B.e), STATION.cz + Math.sin(B.a) * R2 * (0.7 + 0.6 * cap * B.e), 2.2 + 0.28 * R2,
            0.75 * smooth(0, 0.06, tb) * (1 - smooth(3.5, 7, tb)), 0.06, 3.4 * Math.exp(-tb * 0.9), B.s, tmpC.r * 1.8, tmpC.g * 1.8, tmpC.b * 1.8);
        }
        boomL.intensity = tb > 0 ? 9000 * Math.exp(-tb * 2.2) * smooth(0, 0.04, tb) : 0;
        // the canopy thrown up and over
        const kc = tb > 0 ? Math.min(tb, 2.2) : 0;
        canopy.position.set(STATION.cx + 2 * kc, 5.0 + 14 * kc - 4.9 * kc * kc * 0.7, STATION.cz - 1.5 * kc);
        canopy.rotation.set(0.5 * kc, 0.2 * kc, -0.9 * kc);
        pumps.visible = tb < 0.1;
      }
    },
  };
}

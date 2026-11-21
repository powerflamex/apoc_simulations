// The street trees: a trunk, a few limbs, a crown of leafy clumps. Your light dries the leaves brown, then (~30 kW/m²
// at the clump) they catch: each clump burns for ~2.5 s and its leaves are gone, leaving black limbs that later glow.
// fire.js / smoke.js draw the flames and smoke from the burn times worked out here.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TREES, HEART } from './layout.js';
import { timeOfQ, Q } from './timeline.js';
import { HU, HEAT_GLSL, LQ_GLSL } from './heat.js';
import { rng } from './util.js';
import { emitColumn } from './smoke.js';

export const CLUMPS = [];   // { tree, x, y, z, r, tIgn, burn }
{
  const R = rng(1212);
  TREES.forEach((t, ti) => {
    const n = t.hero ? 9 : 6;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + R() * 0.6, rr = t.r * (0.35 + 0.45 * R());
      const c = { tree: ti, x: t.x + Math.cos(a) * rr, y: t.h * (0.62 + 0.25 * R()), z: t.z + Math.sin(a) * rr, r: t.r * (0.5 + 0.25 * R()), seed: R() };
      if (k === 0) { c.x = t.x; c.z = t.z; c.y = t.h * 0.88; c.r = t.r * 0.7; }
      // it catches where its near side does
      const d = Math.max(0.5, Math.hypot(c.x - HEART.x, c.y - HEART.y, c.z - HEART.z) - c.r * 0.7);
      c.tIgn = timeOfQ(Q.TREE * (0.8 + 0.4 * R()), d);
      c.burn = 2.2 + 1.2 * R();
      CLUMPS.push(c);
    }
    t.tIgn = Math.min(...CLUMPS.filter((c) => c.tree === ti).map((c) => c.tIgn));
  });
}

export function makeTrees(scene, ctx) {
  // trunk + three limbs, one shape scaled per tree
  // (in units of the tree's height: a 6.5 m tree has a trunk ~0.3 m thick)
  const wood = mergeGeometries([
    new THREE.CylinderGeometry(0.016, 0.026, 0.82, 8).translate(0, 0.41, 0),
    new THREE.CylinderGeometry(0.006, 0.012, 0.3, 6).rotateZ(0.7).translate(0.1, 0.78, 0),
    new THREE.CylinderGeometry(0.006, 0.012, 0.28, 6).rotateZ(-0.6).rotateY(2.1).translate(-0.05, 0.76, 0.07),
    new THREE.CylinderGeometry(0.005, 0.011, 0.27, 6).rotateX(0.65).translate(0, 0.8, -0.09),
  ]);
  const woodMat = ctx.heated(ctx.plainMat(0x4a3a2c, 0.9), 'treewood', { charAt: 'TREE', glowAt: 'GLASS' });
  const trunks = new THREE.InstancedMesh(wood, woodMat, TREES.length);
  const m4 = new THREE.Matrix4();
  TREES.forEach((t, i) => trunks.setMatrixAt(i, m4.makeScale(t.h, t.h, t.h).setPosition(t.x, 0, t.z)));
  trunks.castShadow = true; trunks.receiveShadow = true; trunks.frustumCulled = false;
  scene.add(trunks);
  // the crown: lumpy clumps; each one browns, burns from its hottest side and is gone
  const cg = new THREE.IcosahedronGeometry(1, 2);
  const aT = new Float32Array(CLUMPS.length * 3);
  CLUMPS.forEach((c, i) => aT.set([c.tIgn, c.burn, c.seed], i * 3));
  cg.setAttribute('aT', new THREE.InstancedBufferAttribute(aT, 3));
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  leafMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, HU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\nattribute vec3 aT; varying vec3 vT; varying vec3 vLW; varying vec3 vLO;\n${HEAT_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vT = aT; vLO = position;
        // lumpy, and shrinking as it burns
        float lump = nn3(position * 2.3 + aT.z * 9.0) * 0.45 + nn3(position * 5.0) * 0.2;
        float b = clamp((uHT - aT.x) / aT.y, 0.0, 1.0);
        transformed *= (0.78 + lump) * (1.0 - 0.45 * b);`)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvLW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vT; varying vec3 vLW; varying vec3 vLO;\n${HEAT_GLSL}\n${LQ_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float lq = lqAt(vLW);
        float leaf = nn3(vLO * 9.0 + vT.z * 5.0);
        vec3 green = mix(vec3(0.16, 0.3, 0.09), vec3(0.32, 0.46, 0.14), leaf);
        // drying out: green to brown before it catches
        float dry = smoothstep(LQ_TREE - 0.6, LQ_TREE - 0.05, lq);
        green = mix(green, vec3(0.36, 0.25, 0.1) * (0.7 + 0.5 * leaf), dry);
        // burning: from the side facing you, a glowing front eating through, black behind it
        float b = clamp((uHT - vT.x) / vT.y, 0.0, 1.0);
        vec3 toH = normalize(uHeart - vLW);
        float side = dot(normalize(vLO), toH) * 0.5 + 0.5;
        float front = b * 1.5 + side * 0.5 - 0.5 - leaf * 0.35;
        if (vT.x < 1e8 && front > 0.45) discard;
        diffuseColor.rgb = green * (1.0 - 0.9 * smoothstep(0.1, 0.4, front));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(3.0, 1.0, 0.18) * smoothstep(0.25, 0.43, front) * (0.7 + 0.3 * sin(uHT * 19.0 + vLW.y * 7.0));`);
  };
  leafMat.customProgramCacheKey = () => 'hot-leaves-v1';
  const crowns = new THREE.InstancedMesh(cg, leafMat, CLUMPS.length);
  CLUMPS.forEach((c, i) => crowns.setMatrixAt(i, m4.makeScale(c.r, c.r * 0.85, c.r).setPosition(c.x, c.y, c.z)));
  crowns.castShadow = true; crowns.receiveShadow = true; crowns.frustumCulled = false;
  scene.add(crowns);
  return {
    // flames over every burning clump, and the smoke off it
    frame(v, fire, smoke) {
      for (const c of CLUMPS) {
        const t = v - c.tIgn;
        if (!(t > -0.05) || t > c.burn + 7) continue;
        const k = Math.min(1, t / 0.35) * (1 - Math.min(1, Math.max(0, (t - c.burn * 0.8) / 1.4)));
        for (let j = 0; j < 3; j++) {
          const a = c.seed * 40 + j * 2.1, rr = c.r * 0.5;
          if (k > 0.01) fire.add(c.x + Math.cos(a) * rr, c.y - c.r * 0.45 + j * 0.25, c.z + Math.sin(a) * rr, c.r * 0.8, c.r * 1.9 * (0.7 + 0.3 * k), 0.9 * k, (c.seed * 7 + j * 0.31) % 1);
        }
        // smoke: thick and dark while it burns
        emitColumn(smoke, c.x, c.y + c.r * 0.5, c.z, t, { life: c.burn + 0.5, every: 0.4, rise: 2.4, size: c.r * 0.8, grow: 0.7, alpha: 0.75, shade: 0.1, glow: 0.4, seed: c.seed });
      }
    },
  };
}

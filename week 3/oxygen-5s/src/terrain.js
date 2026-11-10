// The ground (a polar disk round the summit, fine near the statue, out to 25 km), the sea, and the city.
// Heights come from geo.js once, at load. The look is drawn per pixel: rainforest on the slopes, bare granite on the
// steepest faces (Sugarloaf, Corcovado's cliffs), sand along the beaches, the city's streets between the buildings.
// When the oxygen goes, rock and concrete turn to powder: the mountains slump (the summit with you on it), a grey
// dust creeps over everything, the buildings fall like sand from the top down, and the sea turns into a churning
// white explosion of hydrogen and seafloor.
import * as THREE from 'three';
import { heightAt, waterAt, isCity, fbm, BEACH, STREET } from './geo.js';
import { rng, clamp, smooth } from './util.js';

export const TU = {
  uTime: { value: 0 }, uT: { value: 0 }, uSink: { value: 0 }, uFall: { value: 0 }, uDust: { value: 0 }, uErupt: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.3, 0.85, -0.4).normalize() }, uFire: { value: 0 },
};
const DISK_R = 25000;

// how much a point slumps when the rock turns to powder: everything high (the mountains) comes down with the
// summit; the low ground hardly moves
export const reliefOf = (r, h) => (r < 320 ? 1 : clamp((h - 40) / 320));

const COMMON = /* glsl */ `
uniform float uTime; uniform float uT; uniform float uSink; uniform float uFall; uniform float uDust; uniform float uErupt; uniform vec3 uSunDir; uniform float uFire;
float th(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float tn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(th(i), th(i+vec2(1,0)), f.x), mix(th(i+vec2(0,1)), th(i+vec2(1,1)), f.x), f.y); }
float tf(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * tn(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
`;

function diskGeometry() {
  const radii = [0];
  let r = 0.6;
  while (r < DISK_R) { radii.push(r); r *= r < 60 ? 1.05 : r < 2000 ? 1.012 : 1.02; }
  radii.push(DISK_R);
  const S = 720;
  const pos = [], info = [], idx = [];
  const push = (x, z) => {
    const h = heightAt(x, z), w = waterAt(x, z);
    const rr = Math.hypot(x, z);
    const e = Math.max(2, rr * 0.004);
    const sl = Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
    const city = !w && h < 32 && sl < 0.12 ? 1 : 0;
    pos.push(x, w ? -14 : h, z);
    info.push(sl, city, w ? 1 : 0, reliefOf(rr, h));
  };
  push(0, 0);
  for (let i = 1; i < radii.length; i++) for (let s = 0; s < S; s++) { const a = (s / S) * Math.PI * 2; push(Math.cos(a) * radii[i], Math.sin(a) * radii[i]); }
  // (counter-clockwise seen from above, so the ground faces up)
  for (let s = 0; s < S; s++) idx.push(0, 1 + ((s + 1) % S), 1 + s);
  for (let i = 1; i < radii.length - 1; i++) {
    const a0 = 1 + (i - 1) * S, a1 = 1 + i * S;
    for (let s = 0; s < S; s++) { const s1 = (s + 1) % S; idx.push(a0 + s, a0 + s1, a1 + s, a0 + s1, a1 + s1, a1 + s); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function makeTerrain(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, TU);
    sh.vertexShader = COMMON + sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aInfo; varying vec4 vInfo; varying vec3 vWP; varying float vR;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vInfo = aInfo;
        vR = length(transformed.xz);
        // the rock turned to powder slumps: the summit (and you) with it, every hill a little
        transformed.y -= uSink * aInfo.w * (1.0 - 0.25 * smoothstep(400.0, 3000.0, vR));`)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = COMMON + 'varying vec4 vInfo; varying vec3 vWP; varying float vR;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec2 p = vWP.xz;
        float slope = vInfo.x, city = vInfo.y, wet = vInfo.z;
        float px = max(fwidth(p.x), fwidth(p.y));
        float n = tf(p * 0.02), n2 = tn(p * 0.4);
        // rainforest: dark, lumpy canopy (tree crowns get lost far off)
        float crowns = mix(tn(p * 0.11) * 0.65 + tn(p * 0.45) * 0.35, tn(p * 0.03) * 0.7 + 0.15, smoothstep(3.0, 12.0, px));
        crowns = crowns * crowns * 1.3;
        vec3 forest = mix(vec3(0.06, 0.15, 0.05), vec3(0.2, 0.33, 0.11), crowns) * (0.65 + 0.6 * n);
        // granite: grey with darker streaks (water stains down the faces)
        vec3 granite = mix(vec3(0.33, 0.32, 0.3), vec3(0.55, 0.53, 0.49), tn(vec2(p.x * 0.03, vWP.y * 0.2)) * 0.6 + n2 * 0.4);
        granite *= 0.75 + 0.35 * tn(vec2(p.x * 0.12 + p.y * 0.05, vWP.y * 0.015));
        float rock = smoothstep(0.75, 1.15, slope);
        vec3 col = mix(forest, granite, rock);
        // the city floor: streets and pavements between the blocks
        if (city > 0.5) {
          vec2 b = abs(fract(p / vec2(85.0, 110.0) + 0.5) - 0.5) * vec2(85.0, 110.0);
          float street = 1.0 - step(5.0 + px, min(b.x, b.y));
          vec3 pave = mix(vec3(0.45, 0.43, 0.4), vec3(0.6, 0.57, 0.52), n2);
          col = mix(pave, vec3(0.16, 0.16, 0.17), street);
          col = mix(col, vec3(0.2, 0.33, 0.14), step(0.82, tn(p * 0.012)) * 0.7);   // squares and parks
        }
        // Copacabana up close: the wave-mosaic promenade, the avenue's six lanes, the sidewalk
        float beachSand = 0.0;
        {
          vec2 d = p - vec2(${BEACH.x0.toFixed(1)}, ${BEACH.z0.toFixed(1)});
          float bs = dot(d, vec2(${BEACH.nx}, ${BEACH.nz})), ba = dot(d, vec2(${BEACH.ux}, ${BEACH.uz}));
          if (ba > ${(BEACH.a0 - 150).toFixed(1)} && ba < ${(BEACH.a1 + 150).toFixed(1)} && bs < 94.0) beachSand = 1.0;
          if (ba > ${(BEACH.a0 - 150).toFixed(1)} && ba < ${(BEACH.a1 + 150).toFixed(1)} && bs > 94.0 && bs < 140.0) {
            float w = px * 1.5 + 0.02;
            if (bs < 108.0) {   // the promenade's black-and-white waves
              float wave = fract((bs + 1.6 * sin(ba * 0.42)) / 1.5);
              col = mix(vec3(0.06, 0.06, 0.06), vec3(0.88, 0.86, 0.82), smoothstep(0.5 - w, 0.5 + w, wave));
            } else if (bs < 130.0) {   // the avenue
              col = vec3(0.13, 0.13, 0.14) * (0.85 + 0.25 * n2);
              float lane = abs(fract((bs - 108.0) / 3.3 + 0.5) - 0.5) * 3.3;
              col = mix(col, vec3(0.85), (1.0 - smoothstep(0.08, 0.08 + w, lane)) * step(0.5, fract(ba / 9.0)) * step(110.0, bs) * step(bs, 128.0));
              col = mix(col, vec3(0.85, 0.65, 0.1), (1.0 - smoothstep(0.1, 0.1 + w, abs(bs - 119.0))));
            } else {   // the sidewalk in front of the towers (mosaic too)
              col = mix(vec3(0.55, 0.53, 0.5), vec3(0.75, 0.73, 0.7), step(0.5, fract((ba + bs) * 0.7)));
            }
          }
        }
        // the street of towers in Botafogo: asphalt, kerbs, sidewalks
        if (p.x > ${(STREET.x0 - 40).toFixed(1)} && p.x < ${(STREET.x1 + 40).toFixed(1)} && abs(p.y - (${STREET.z.toFixed(1)})) < 20.0) {
          float dzs = abs(p.y - (${STREET.z.toFixed(1)}));
          col = dzs < ${(STREET.hw - 3).toFixed(1)} ? vec3(0.12, 0.12, 0.13) * (0.85 + 0.25 * n2) : vec3(0.5, 0.48, 0.45);
          col = mix(col, vec3(0.85), (1.0 - smoothstep(0.08, 0.16, dzs)) * step(0.5, fract(p.x / 8.0)));
        }
        // sand along the beaches (low, flat, near the water)
        // (Copacabana's sand up close; elsewhere only the lowest, flattest ground by the water)
        float sand = max(beachSand, (1.0 - smoothstep(2.0, 3.5, vWP.y + uSink * vInfo.w)) * (1.0 - smoothstep(0.08, 0.2, slope))) * (1.0 - wet);
        col = mix(col, vec3(0.86, 0.79, 0.62) * (0.9 + 0.15 * n2), sand * 0.9);
        // the powder: once the oxygen is gone, rock and concrete are loose grey-beige dust; it shows first where the
        // ground is moving (the slopes), and the dust settles over everything
        float powder = uDust * (0.35 + 0.65 * vInfo.w) * smoothstep(0.3, 0.7, n + 0.3 * uDust);
        col = mix(col, vec3(0.5, 0.47, 0.42) * (0.8 + 0.3 * n2), clamp(powder, 0.0, 0.5));
        // the seabed laid bare where the water was
        col = mix(col, vec3(0.35, 0.33, 0.3), wet);
        diffuseColor.rgb = col;
      }`);
  };
  mat.customProgramCacheKey = () => 'rio-terrain';
  const disk = new THREE.Mesh(diskGeometry(), mat);
  disk.frustumCulled = false;
  disk.receiveShadow = true;
  scene.add(disk);
  // a fine patch over Copacabana's stretch (3 m grid): a clean, straight waterline and the sand sloping into the sea
  {
    const NA = 540, NS = 84, A0 = BEACH.a0 - 60, A1 = BEACH.a1 + 60, S0 = -60, S1 = 190;
    const pos = [], info = [], idx = [];
    for (let j = 0; j <= NS; j++) for (let i = 0; i <= NA; i++) {
      const a = A0 + (A1 - A0) * i / NA, sv = S0 + (S1 - S0) * j / NS;
      const x = BEACH.x0 + BEACH.nx * sv + BEACH.ux * a, z = BEACH.z0 + BEACH.nz * sv + BEACH.uz * a;
      const h = sv < 0 ? 0.3 + 0.06 * sv : heightAt(x, z);
      pos.push(x, h, z);
      info.push(0.02, 0, sv < -18 ? 1 : 0, 0);
    }
    for (let j = 0; j < NS; j++) for (let i = 0; i < NA; i++) {
      const k = j * (NA + 1) + i;
      idx.push(k, k + 1, k + NA + 1, k + 1, k + NA + 2, k + NA + 1);   // (faces up)
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 4));
    g.setIndex(idx);
    g.computeVertexNormals();
    const pmat = mat.clone();
    pmat.onBeforeCompile = mat.onBeforeCompile;
    pmat.customProgramCacheKey = mat.customProgramCacheKey;
    pmat.polygonOffset = true; pmat.polygonOffsetFactor = -2; pmat.polygonOffsetUnits = -2;
    const patch = new THREE.Mesh(g, pmat);
    patch.receiveShadow = true; patch.frustumCulled = false;
    scene.add(patch);
  }

  // ---------- the sea: blue with the sun's glitter; then it explodes into hydrogen: a churning white surface ----------
  const seaMat = new THREE.ShaderMaterial({
    uniforms: TU, transparent: false,
    vertexShader: /* glsl */ `varying vec3 vWP;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      ${COMMON}
      void main(){ vec3 p = position;
        // (the sea stays at sea level: lifting it would cover the land too; the wall of fog does the rising)
        vec4 w = modelMatrix * vec4(p, 1.0); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `varying vec3 vWP;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${COMMON}
      void main(){
        #include <logdepthbuf_fragment>
        vec3 V = normalize(cameraPosition - vWP);
        vec2 p = vWP.xz;
        // a cheap wave normal from two moving noise layers
        float e = 2.0;
        float h0 = tf(p * 0.02 + uTime * 0.03) + 0.5 * tf(p * 0.07 - uTime * 0.05);
        float hx = tf((p + vec2(e, 0.0)) * 0.02 + uTime * 0.03) + 0.5 * tf((p + vec2(e, 0.0)) * 0.07 - uTime * 0.05);
        float hz = tf((p + vec2(0.0, e)) * 0.02 + uTime * 0.03) + 0.5 * tf((p + vec2(0.0, e)) * 0.07 - uTime * 0.05);
        vec3 N = normalize(vec3(-(hx - h0) * 3.0, 1.0, -(hz - h0) * 3.0));
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 deep = vec3(0.02, 0.12, 0.2), sky = vec3(0.45, 0.62, 0.85);
        vec3 col = mix(deep, sky, fres);
        vec3 H = normalize(uSunDir + V);
        col += vec3(1.0, 0.95, 0.85) * pow(max(dot(N, H), 0.0), 220.0) * 3.0;
        // the explosion: white-grey froth and fog, churning, lit by the sun; it burns when the oxygen comes back
        float ch = tf(p * 0.004 + vec2(uTime * 0.08, -uTime * 0.05)) * 0.6 + tf(p * 0.02 - uTime * 0.2) * 0.4;
        vec3 froth = mix(vec3(0.55, 0.55, 0.56), vec3(0.95, 0.94, 0.92), ch) * (0.75 + 0.35 * max(uSunDir.y, 0.0));
        col = mix(col, froth, smoothstep(0.0, 1.0, uErupt));
        col = mix(col, mix(vec3(1.6, 0.6, 0.15), vec3(3.0, 2.4, 1.6), ch), uFire);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: false,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000, 240, 240).rotateX(-Math.PI / 2), seaMat);
  sea.position.y = -1;
  sea.frustumCulled = false;
  scene.add(sea);

  return { disk, sea, mat };
}

// ---------- the city: thousands of apartment blocks and towers on the flat land ----------
export function makeCity(scene, extra = []) {
  const R = rng(1965);
  const B = [];
  for (let x = -9000; x < 9000; x += 70) for (let z = -9000; z < 9000; z += 70) {
    const bx = x + (R() - 0.5) * 40, bz = z + (R() - 0.5) * 40;
    const r = Math.hypot(bx, bz);
    if (r > 11000 || R() < 0.22 || !isCity(bx, bz)) continue;
    // Centro and Botafogo/Flamengo have taller towers; Copacabana, Ipanema and Leblon solid 10-14 storey slabs
    const centro = bx > 2200 && bz < -2600;
    const beach = bz > 1200;
    const floors = centro ? 12 + Math.floor(Math.pow(R(), 1.6) * 35) : beach ? 9 + Math.floor(R() * 6) : 4 + Math.floor(Math.pow(R(), 1.5) * 14);
    const h = floors * 3.1 + 2;
    const w = 18 + R() * (beach ? 22 : 16), d = 16 + R() * 18;
    B.push({ x: bx, z: bz, w, d, h, y: heightAt(bx, bz), yaw: (R() - 0.5) * 0.15, seed: R(), glass: centro && R() < 0.4 ? 1 : 0 });
  }
  B.push(...extra);
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const aB = new Float32Array(B.length * 4);
  B.forEach((b, i) => aB.set([b.h, b.seed, b.glass, 0], i * 4));
  geo.setAttribute('aB', new THREE.InstancedBufferAttribute(aB, 4));
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, TU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uFall; uniform float uDust; attribute vec4 aB; varying vec3 vLoc; varying vec4 vB; varying float vLeft; varying vec3 vObjN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLoc = position; vB = aB; vObjN = normal;
        // falling like sand from the top down (free fall); a pile of rubble stays
        float left = max(aB.x - uFall, min(aB.x, 3.0 + 0.04 * aB.x)) / aB.x;
        vLeft = left;
        transformed.y *= left;
        transformed.xz *= 1.0 + 0.35 * (1.0 - left);   // the pile spreads`);
    sh.fragmentShader = 'uniform float uDust; uniform float uT; varying vec3 vLoc; varying vec4 vB; varying float vLeft; varying vec3 vObjN;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      {
        float seed = vB.y, glass = vB.z;
        float hh = vLoc.y * vB.x;
        vec3 base = mix(vec3(0.93, 0.91, 0.86), vec3(0.85, 0.8, 0.68), fract(seed * 7.3));
        if (fract(seed * 3.1) > 0.75) base = vec3(0.78, 0.8, 0.82);
        float side = step(abs(vObjN.y), 0.5);
        // windows: rows of dark glass (dust after the glass goes)
        vec2 g = vec2((vLoc.x + vLoc.z) * 8.0, hh / 3.1);
        float win = step(0.3, fract(g.x)) * step(0.35, fract(g.y)) * side * step(2.5, hh);
        vec3 wc = vec3(0.38, 0.46, 0.56);
        if (uT > 0.0) {
          float puff = smoothstep(0.0, 0.004, uT) * (1.0 - smoothstep(0.08, 0.6, uT));
          wc = mix(vec3(0.07, 0.07, 0.075), vec3(0.8, 0.78, 0.74), puff);
        }
        vec3 col = mix(base, wc, win * 0.85);
        if (glass > 0.5) col = (uT > 0.0 ? wc : vec3(0.25, 0.38, 0.5)) * (0.8 + 0.2 * step(0.1, fract(g.y)));
        col = mix(col, base * 0.6, 1.0 - side);
        // turning to sand: dusty, crumbling from the top
        col = mix(col, vec3(0.63, 0.59, 0.52), clamp(uDust * 1.4 + (1.0 - vLeft) * 1.5, 0.0, 1.0));
        diffuseColor.rgb = col;
      }`);
  };
  mat.customProgramCacheKey = () => 'rio-city';
  const mesh = new THREE.InstancedMesh(geo, mat, B.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  B.forEach((b, i) => { e.set(0, b.yaw, 0); q.setFromEuler(e); mesh.setMatrixAt(i, m4.compose(p.set(b.x, b.y - 1, b.z), q, sc.set(b.w, b.h, b.d))); });
  mesh.frustumCulled = false;
  mesh.castShadow = false; mesh.receiveShadow = true;
  scene.add(mesh);
  return { mesh, B };
}

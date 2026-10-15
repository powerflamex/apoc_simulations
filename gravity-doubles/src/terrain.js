// The ground (one big mesh, finely divided near you so it can bend): the plaza's granite paving with a ring
// pattern round the fountain, the embankment road, the riverside promenade, the river bed, the far bank's city
// blocks, fields beyond. Near the end cracks open in it and it glows. The river: a wave spectrum mirroring the
// sunset sky, with the Sun's glitter path; the waves shrink as gravity climbs. The hills all round.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patch, BEND_GLSL, G } from './bend.js';
import { FOUNTAIN, ROAD, PROM, RIVER, FAR_ROAD } from './layout.js';
import { rng } from './util.js';

// a disc of rings round the camera's spot, from 0.4 m to rMax, densest near the middle
function polarGrid(rMax, rings, segs, cx = 0, cz = 0) {
  const pos = [], idx = [];
  const r0 = 0.4;
  for (let i = 0; i <= rings; i++) {
    const r = i === 0 ? 0 : r0 * Math.pow(rMax / r0, (i - 1) / (rings - 1));
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      pos.push(cx + Math.sin(a) * r, 0, cz - Math.cos(a) * r);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = i * segs + j, b = i * segs + ((j + 1) % segs), c = (i + 1) * segs + j, d = (i + 1) * segs + ((j + 1) % segs);
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function makeTerrain(scene, { cx, cz }) {
  const out = {};
  // ---------- ground ----------
  {
    const geo = polarGrid(9000, 150, 192, cx, cz);
    const p = geo.attributes.position;
    // the river is a trench (the water sits in it); the walls are separate boxes
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      if (z > RIVER.z0 + 0.5 && z < RIVER.z1 - 0.5) p.setY(i, RIVER.bed);
    }
    geo.computeVertexNormals();
    const mat = patch(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), {
      key: 'ground',
      extra: (sh) => {
        sh.uniforms.uCracks = out.uCracks; sh.uniforms.uHeatG = G.uHeat; sh.uniforms.uWhiteHot = out.uWhiteHot;
        sh.fragmentShader = `uniform float uCracks; uniform float uHeatG; uniform float uWhiteHot;
          float h2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
          float vn2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
          vec2 vor(vec2 p) { vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
            for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 o = vec2(float(x), float(y)); vec2 r = o + vec2(h2(i + o), h2(i + o + 7.3)) - f; float d = dot(r, r);
              if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
            return vec2(sqrt(d1), sqrt(d2)); }
          ` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
          {
            vec2 p = vWPre.xz;
            float aa = max(max(fwidth(p.x), fwidth(p.y)), 0.004);
            vec3 col;
            if (p.y > ${ROAD.z1.toFixed(1)}) {
              // plaza: granite slabs, a ring pattern round the fountain, darker bands
              vec2 fc = p - vec2(${FOUNTAIN.x.toFixed(2)}, ${FOUNTAIN.z.toFixed(2)});
              float rr = length(fc);
              vec2 q = p / vec2(1.2, 0.8); q.x += floor(q.y) * 0.5;
              vec2 f = fract(q);
              vec3 slab = vec3(0.62, 0.58, 0.54) * (0.86 + 0.16 * h2(floor(q)) + 0.06 * vn2(p * 3.0));
              float joint = smoothstep(0.0, aa * 2.0 / 0.8, min(min(f.x, 1.0 - f.x) * 1.2, min(f.y, 1.0 - f.y) * 0.8));
              slab *= 0.82 + 0.18 * joint;
              float ring = (1.0 - smoothstep(0.0, aa * 2.0, abs(fract(rr / 2.4) - 0.5) - 0.42)) * step(rr, 22.0);
              slab = mix(slab, vec3(0.38, 0.35, 0.34), ring * 0.7);
              float band = (1.0 - smoothstep(0.0, aa * 2.0, abs(fract(p.x / 12.0) - 0.5) - 0.46)) * step(22.0, rr);
              col = mix(slab, vec3(0.42, 0.4, 0.39), band * 0.6);
            } else if (p.y > ${ROAD.z0.toFixed(1)}) {
              // the embankment road: asphalt, lane dashes, a double line in the middle, kerbs
              col = vec3(0.16, 0.16, 0.17) * (0.85 + 0.25 * vn2(p * 0.7) + 0.1 * vn2(p * 6.0));
              float dash = 0.0;
              for (int k = 0; k < 2; k++) {
                float zl = k == 0 ? ${((ROAD.lanes[0] + ROAD.lanes[1]) / 2).toFixed(2)} : ${((ROAD.lanes[2] + ROAD.lanes[3]) / 2).toFixed(2)};
                dash = max(dash, (1.0 - smoothstep(0.07, 0.07 + aa, abs(p.y - zl))) * step(fract(p.x / 9.0), 0.4));
              }
              float mid = (1.0 - smoothstep(0.06, 0.06 + aa, abs(abs(p.y - ${((ROAD.z0 + ROAD.z1) / 2).toFixed(2)}) - 0.18)));
              float edge = (1.0 - smoothstep(0.08, 0.08 + aa, abs(p.y - ${(ROAD.z1 - 0.6).toFixed(2)}))) + (1.0 - smoothstep(0.08, 0.08 + aa, abs(p.y - ${(ROAD.z0 + 0.6).toFixed(2)})));
              col = mix(col, vec3(0.82, 0.8, 0.74), clamp(dash + edge, 0.0, 1.0) * 0.85);
              col = mix(col, vec3(0.85, 0.66, 0.2), mid * 0.85);
            } else if (p.y > ${PROM.z0.toFixed(1)}) {
              vec2 q = p / 0.6; vec2 f = fract(q);
              col = vec3(0.7, 0.66, 0.6) * (0.88 + 0.14 * h2(floor(q))) * (0.88 + 0.12 * smoothstep(0.0, 0.1, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y))));
            } else if (p.y > ${RIVER.z0.toFixed(1)}) {
              col = vec3(0.12, 0.11, 0.09);
            } else if (length(p - vec2(0.0, -1100.0)) < 2600.0 || p.y > 40.0) {
              // the city: blocks of concrete and roofs between streets, the far embankment road
              vec2 q = p / vec2(70.0, 60.0);
              vec2 f = fract(q);
              float street = 1.0 - smoothstep(0.0, aa / 60.0 * 2.0, min(min(f.x, 1.0 - f.x) * 70.0, min(f.y, 1.0 - f.y) * 60.0) - 7.0);
              col = mix(vec3(0.33, 0.31, 0.3) * (0.8 + 0.35 * h2(floor(q))), vec3(0.15, 0.15, 0.16), street);
              float fr = step(${FAR_ROAD.z0.toFixed(1)}, p.y) * step(p.y, ${FAR_ROAD.z1.toFixed(1)});
              col = mix(col, vec3(0.16, 0.16, 0.17), fr);
              float green = smoothstep(0.55, 0.62, vn2(p * 0.004)) * (1.0 - street);
              col = mix(col, vec3(0.16, 0.22, 0.1), green * 0.8);
            } else {
              // fields and woods beyond the city
              col = mix(vec3(0.18, 0.22, 0.11), vec3(0.3, 0.27, 0.16), vn2(p * 0.003)) * (0.8 + 0.3 * vn2(p * 0.03));
            }
            // the end: cracks split open and glow, the whole crust glows
            // (thin lines stay thin far away: they fade instead of widening, so the crust doesn't turn into one glow)
            vec2 vo = vor(p / 9.0);
            float w1 = max(0.05, aa / 9.0);
            float crack = (1.0 - smoothstep(0.0, w1, vo.y - vo.x)) * (0.05 / w1) * uCracks;
            vec2 vo2 = vor(p / 2.3 + 11.0);
            float w2 = max(0.045, aa / 2.3);
            crack = max(crack, (1.0 - smoothstep(0.0, w2, vo2.y - vo2.x)) * (0.045 / w2) * smoothstep(0.4, 1.0, uCracks));
            vec2 vo3 = vor(p / 60.0 + 3.0);
            float w3 = max(0.03, aa / 60.0);
            crack = max(crack, (1.0 - smoothstep(0.0, w3, vo3.y - vo3.x)) * min(1.0, 0.03 / w3 * 1.5) * uCracks);
            col = mix(col, vec3(0.05, 0.03, 0.02), crack);
            col = mix(col, col * vec3(0.22, 0.12, 0.1), uHeatG);
            diffuseColor.rgb = col;
            vCrack = crack;
          }`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            totalEmissiveRadiance += vCrack * vec3(1.0, 0.4, 0.09) * (1.0 + 1.6 * uHeatG + 6.0 * uWhiteHot);
            totalEmissiveRadiance += vec3(1.0, 0.55, 0.3) * uWhiteHot * uWhiteHot * 2.0;`);
        sh.fragmentShader = 'float vCrack = 0.0;\n' + sh.fragmentShader;
      },
    });
    out.uCracks = { value: 0 };
    out.uWhiteHot = { value: 0 };
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true; m.frustumCulled = false;
    scene.add(m);
    out.ground = m;
  }

  // ---------- river walls ----------
  {
    const stone = patch(new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.85 }));
    const g = mergeGeometries([
      // (finely divided along the bank so they can roll with the ground at the end)
      new THREE.BoxGeometry(9000, 7.4, 1.2, 900, 1, 1).translate(0, -3.4, RIVER.z1 - 0.2),
      new THREE.BoxGeometry(9000, 7.4, 1.2, 900, 1, 1).translate(0, -3.4, RIVER.z0 + 0.2),
      new THREE.BoxGeometry(9000, 0.25, 1.6, 900, 1, 1).translate(0, 0.12, RIVER.z1 + 0.1),   // coping stones
      new THREE.BoxGeometry(9000, 0.25, 1.6, 900, 1, 1).translate(0, 0.12, RIVER.z0 - 0.1),
    ]);
    const m = new THREE.Mesh(g, stone); m.receiveShadow = true; m.castShadow = false; m.frustumCulled = false;
    scene.add(m);
  }

  // ---------- the river ----------
  {
    const segX = 360, segZ = 60;
    const geo = new THREE.PlaneGeometry(9000, RIVER.z1 - RIVER.z0, segX, segZ).rotateX(-Math.PI / 2).translate(0, RIVER.water, (RIVER.z0 + RIVER.z1) / 2);
    // more rows near our bank: warp z toward it
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = (p.getZ(i) - RIVER.z0) / (RIVER.z1 - RIVER.z0);
      p.setZ(i, RIVER.z0 + (RIVER.z1 - RIVER.z0) * Math.pow(k, 0.55));
      const x = p.getX(i);
      p.setX(i, Math.sign(x) * Math.pow(Math.abs(x) / 4500, 2.2) * 4500);
    }
    const u = {
      uCap: G.uCap, uFlow: G.uFlow, uR: G.uR, uCam: G.uCam, uTime: G.uTime,
      uSunDir: { value: new THREE.Vector3() }, uWave: { value: 1 }, uSpeed: { value: 1 }, uFogC: { value: new THREE.Color() }, uFogD: { value: 0 },
      uLights: { value: 1 }, uHeat: G.uHeat, uDark: { value: 0 }, uAir: { value: 0 },
    };
    out.waterU = u;
    const mat = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: /* glsl */ `
        varying vec3 vW; varying vec3 vView;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        ${BEND_GLSL}
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          vec3 b = bendWorld(w.xyz);
          vec4 mv = viewMatrix * vec4(b, 1.0);
          vView = b - cameraPosition;
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vW; varying vec3 vView;
        uniform vec3 uSunDir; uniform float uTime; uniform float uWave; uniform float uSpeed; uniform vec3 uFogC; uniform float uFogD;
        uniform float uLights; uniform float uHeat; uniform float uDark; uniform float uAir;
        #include <common>
        #include <logdepthbuf_pars_fragment>
        float h2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        // the sunset sky (same palette as sky.js), for reflections
        vec3 sky(vec3 v) {
          float h = clamp(v.y, 0.0, 1.0);
          float cs = dot(v, uSunDir);
          float sunSide = pow(max(cs, 0.0), 3.0);
          vec3 low = mix(vec3(1.0, 0.56, 0.3), vec3(1.0, 0.72, 0.38), sunSide);
          vec3 c = mix(low, vec3(0.62, 0.45, 0.55), smoothstep(0.0, 0.18, h));
          c = mix(c, vec3(0.13, 0.22, 0.45), smoothstep(0.12, 0.65, h));
          c *= 0.75 + 0.6 * sunSide * (1.0 - smoothstep(0.0, 0.4, h));
          c = mix(c, vec3(0.02, 0.02, 0.04), uDark * smoothstep(0.0, 0.3, h));
          return c;
        }
        void main() {
          #include <logdepthbuf_fragment>
          vec3 V = normalize(vView);
          float dist = length(vView);
          // a spectrum of waves from many directions; shorter and flatter as gravity climbs (uWave)
          vec2 grad = vec2(0.0);
          float pix = dist * 0.0012;
          for (int i = 0; i < 22; i++) {
            float fi = float(i);
            float a = fi * 2.399 + 0.3;
            vec2 d = vec2(cos(a), sin(a) * 0.6 + 0.4 * sin(fi));
            d = normalize(d);
            float k = 0.18 * pow(1.32, fi);                 // wavenumber (1/m)
            float amp = 0.55 / (k * 9.0 + 1.0) * pow(0.88, fi);
            float w = sqrt(9.81 * k) * uSpeed;              // deep-water waves: faster in stronger gravity
            float fade = 1.0 - smoothstep(0.25, 1.2, pix * k);   // filter waves smaller than a pixel
            float ph = dot(d, vW.xz) * k - w * uTime + h2(vec2(fi, 3.0)) * 6.28;
            grad += d * k * amp * cos(ph) * fade;
          }
          grad *= uWave;
          vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));
          vec3 R = reflect(V, N);
          R.y = abs(R.y);
          float fres = 0.02 + 0.98 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
          vec3 deep = vec3(0.03, 0.05, 0.06);
          vec3 col = mix(deep, sky(R) * 0.95, clamp(fres, 0.0, 1.0));
          // the Sun's glitter path
          float sp = pow(max(dot(R, uSunDir), 0.0), 900.0) * 30.0 + pow(max(dot(R, uSunDir), 0.0), 60.0) * 0.6;
          col += vec3(1.0, 0.72, 0.42) * sp * (1.0 - uAir * 0.8) * (1.0 - uDark);
          // the city's lights smeared into long wobbly streaks across the far half of the river
          float across = smoothstep(-90.0, -320.0, vW.z);
          float colx = floor(vW.x / 9.0);
          float on = step(0.55, h2(vec2(colx, 1.0)));
          float wob = 0.5 + 0.5 * sin(vW.z * 0.9 + uTime * 2.0 + colx * 3.0) * sin(vW.z * 0.37 - uTime * 1.3);
          float streak = on * smoothstep(0.42, 0.0, abs(fract(vW.x / 9.0 + (grad.x) * 0.6) - 0.5)) * across * wob;
          col += mix(vec3(1.0, 0.75, 0.45), vec3(0.75, 0.85, 1.0), h2(vec2(colx, 5.0))) * streak * 0.35 * uLights;
          col += vec3(1.0, 0.35, 0.08) * uHeat * (0.6 + 1.2 * fres);
          float fog = 1.0 - exp(-uFogD * uFogD * dist * dist);
          col = mix(col, uFogC, fog);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    scene.add(m);
    out.water = m;
  }

  // ---------- hills all round, far off (they slump under the rock cap) ----------
  {
    const rings = 40, segs = 240, r0 = 3200, r1 = 9000;
    const pos = [], idx = [];
    const R = rng(3);
    const ph = Array.from({ length: 6 }, () => R() * 6.28);
    for (let i = 0; i <= rings; i++) {
      const r = r0 + (r1 - r0) * (i / rings);
      for (let j = 0; j < segs; j++) {
        const a = (j / segs) * Math.PI * 2;
        const ridge = 0.55 + 0.25 * Math.sin(a * 3 + ph[0]) + 0.15 * Math.sin(a * 7 + ph[1]) + 0.1 * Math.sin(a * 17 + ph[2]) + 0.05 * Math.sin(a * 37 + ph[3]);
        const prof = Math.sin(Math.PI * Math.min(1, (r - r0) / (r1 - r0) * 1.25)) ** 1.2;
        const y = Math.max(0, ridge) * prof * (260 + 220 * Math.sin(a * 2 + ph[4]) ** 2) - 4;
        pos.push(cx + Math.sin(a) * r, y, cz - Math.cos(a) * r);
      }
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
      const a = i * segs + j, b = i * segs + ((j + 1) % segs), c = (i + 1) * segs + j, d = (i + 1) * segs + ((j + 1) % segs);
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, patch(new THREE.MeshStandardMaterial({ color: 0x3a4436, roughness: 1, flatShading: false }), { key: 'hills', rock: true }));
    m.frustumCulled = false;
    scene.add(m);
  }
  return out;
}

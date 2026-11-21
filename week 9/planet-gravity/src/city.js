// The buildings across the street: one instanced box each, its fronts drawn in the shader (brick or rendered blocks
// with rows of windows that mirror the sky, glass towers, shops with awnings at street level). Each building can be
// crushed (aCrush 0..1): it pancakes, its floors squashing together toward the ground into a low, ragged heap (the
// window rows crowd together as they go), and its glass can burst (uBurst: dark, broken windows).
import * as THREE from 'three';
import { BUILDINGS } from './layout.js';
import { H, HEAT_GLSL } from './heat.js';

export function makeCity(scene) {
  const n = BUILDINGS.length;
  const geo = new THREE.BoxGeometry(1, 1, 1, 8, 12, 8).translate(0, 0.5, 0);
  const aSize = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);     // w, h (standing), d, kind
  const aCol = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);      // colour, seed
  const aCrush = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
  geo.setAttribute('aSize', aSize); geo.setAttribute('aCol', aCol); geo.setAttribute('aCrush', aCrush);
  const U = { uBurst: { value: 0 }, uSkyHi: { value: new THREE.Color(0.25, 0.45, 0.8) }, uSkyLo: { value: new THREE.Color(0.7, 0.8, 0.92) } };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, H);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aSize; attribute vec4 aCol; attribute float aCrush;
        varying vec3 vOP; varying vec4 vSize; varying vec4 vCol; varying float vCrush; varying vec3 vBN;
        float bh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vOP = position; vSize = aSize; vCol = aCol; vCrush = aCrush; vBN = normal;
        {
          // crushed: the whole height squashes down to a ragged heap ~6% of it, the top broken up
          float c = aCrush;
          float hk = mix(1.0, 0.06, c);
          transformed.y *= hk;
          float top = smoothstep(0.6, 1.0, position.y);
          transformed.y += c * top * (bh(position.xz * 7.0 + aCol.w * 13.0) - 0.5) * 0.06;
          transformed.xz *= 1.0 + 0.12 * c * (1.0 - position.y);       // (spreading out at its foot)
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        ${HEAT_GLSL}
        uniform float uBurst; uniform vec3 uSkyHi; uniform vec3 uSkyLo;
        varying vec3 vOP; varying vec4 vSize; varying vec4 vCol; varying float vCrush; varying vec3 vBN;
        float bh2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float bn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(bh2(i), bh2(i+vec2(1,0)), f.x), mix(bh2(i+vec2(0,1)), bh2(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float kind = vSize.w, seed = vCol.w;
          bool side = abs(vBN.x) > 0.5, roof = vBN.y > 0.5;
          float W = side ? vSize.z : vSize.x;
          float u = ((side ? vOP.z : vOP.x) + 0.5) * W;
          float y = vOP.y * vSize.y;                         // metres up the standing building (rows crowd when crushed)
          vec3 base = vCol.rgb;
          vec3 c = base * (0.9 + 0.15 * bn(vec2(u, y) * 0.7)) * (0.94 + 0.1 * bh2(floor(vec2(u * 4.0, y * 12.0)) + seed));   // brick/render texture
          float glass = 0.0; vec3 gc = vec3(0.0);
          float FH = 3.2, G0 = 4.4;
          float colW = kind > 1.5 ? 1.6 : 2.6 + 0.6 * bh2(vec2(seed, 3.0));
          float nC = max(1.0, floor(W / colW + 0.5)); colW = W / nC;
          vec2 g = vec2(u / colW, (y - G0) / FH);
          vec2 id = floor(g), f = fract(g);
          vec2 fw = fwidth(g);
          if (!roof) {
            vec3 sky = mix(uSkyLo, uSkyHi, clamp(y / 50.0, 0.0, 1.0));
            float r = bh2(id + seed * 31.0);
            if (y > G0 && y < vSize.y - 1.0) {
              if (kind > 1.5) {
                // glass: blue-green panes, thin light mullions, a dark spandrel band at each floor
                float mul = max(1.0 - smoothstep(0.0, 0.04, min(f.x, 1.0 - f.x)), 1.0 - smoothstep(0.0, 0.05, min(f.y, 1.0 - f.y)));
                float span = step(0.84, f.y);
                vec3 pane = mix(vec3(0.1, 0.17, 0.2), sky * 0.85, 0.45 + 0.12 * r);
                c = mix(pane, vec3(0.16, 0.2, 0.22), span);
                c = mix(c, vec3(0.75, 0.78, 0.8), mul * 0.8);
                glass = 0.0;
              } else {
                // punched windows with light frames
                vec2 lo = vec2(0.24, 0.22), hi = vec2(0.76, 0.84);
                float win = step(lo.x, f.x) * step(f.x, hi.x) * step(lo.y, f.y) * step(f.y, hi.y);
                float frame = step(lo.x - 0.05, f.x) * step(f.x, hi.x + 0.05) * step(lo.y - 0.05, f.y) * step(f.y, hi.y + 0.04) * (1.0 - win);
                vec3 pane = mix(vec3(0.07, 0.09, 0.12), sky * 0.8, 0.35 + 0.15 * r);
                if (r > 0.86) pane = vec3(0.62, 0.55, 0.45);           // curtains drawn
                c = mix(c, vec3(0.88, 0.87, 0.84), frame);
                c = mix(c, pane, win);
                glass = win;
              }
              // a ledge under each floor's windows
              c *= 1.0 - 0.12 * step(0.96, f.y);
            } else if (y <= G0 && y > 0.3) {
              // shops: big windows, a band of colour (an awning / sign) above
              float shop = step(0.06, fract(u / 5.0)) * step(fract(u / 5.0), 0.94) * step(0.3, y) * step(y, 3.1);
              float band = step(3.3, y) * step(y, 4.1);
              vec3 sc = vec3[](vec3(0.75, 0.15, 0.12), vec3(0.1, 0.35, 0.6), vec3(0.15, 0.5, 0.3), vec3(0.85, 0.6, 0.12), vec3(0.2, 0.2, 0.22))[int(mod(floor(u / 5.0) + seed * 17.0, 5.0))];
              c = mix(c, sc, band);
              c = mix(c, mix(vec3(0.06, 0.07, 0.08), sky * 0.7, 0.4) + vec3(0.12, 0.1, 0.07) * bh2(vec2(floor(u / 5.0), seed)), shop);
              glass = shop;
            }
            // the cornice
            c = mix(c, base * 0.6, step(vSize.y - 0.7, y));
            // burst: dark holes where the glass has gone
            float gone = step(bh2(id * 1.7 + seed), uBurst) * glass;
            c = mix(c, vec3(0.025, 0.022, 0.02), gone);
          } else c = base * 0.55;
          // a crushed building is a heap of rubble: grey dust over everything
          c = mix(c, vec3(0.5, 0.47, 0.43) * (0.7 + 0.5 * bn(vec2(u, y) * 1.3)), smoothstep(0.3, 0.9, vCrush));
          diffuseColor.rgb = c;
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.25, 0.0);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += heatGlow(uAmbK * 0.92) * uGlowGain;`);
  };
  mat.customProgramCacheKey = () => 'city';
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  scene.add(mesh);
  const m4 = new THREE.Matrix4();
  BUILDINGS.forEach((b, i) => {
    aSize.setXYZW(i, b.w, b.h, b.d, b.kind);
    aCol.setXYZW(i, b.col[0], b.col[1], b.col[2], b.seed);
    m4.makeScale(b.w, b.h, b.d).setPosition(b.x, 0, b.z - b.d / 2);
    mesh.setMatrixAt(i, m4);
  });
  return {
    mesh, U,
    // crush: (i) -> 0..1
    set(crush, burst = 0) {
      for (let i = 0; i < n; i++) aCrush.setX(i, crush(i));
      aCrush.needsUpdate = true;
      U.uBurst.value = burst;
    },
  };
}

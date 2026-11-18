// The land and the bay, out to the hills 12-25 km away. One polar grid round you (fine near, coarse far), heights from
// layout.js. The land's look is all in the shader: the hill's grass and scrub, the city's street grid (asphalt, pale
// pavements, lots, a few green squares), the waterfront's stone edge, the far hills; and the blasts' marks: the dust
// laid down behind a front, the crater and the rubble round it, the molten crust behind the biggest ones.
// The bay mirrors the sky and ripples; it boils behind the fire (uBoil) and heaps up under the Moon's pull (uTide).
import * as THREE from 'three';
import { LU, LIGHT_GLSL } from './looks.js';
import { groundY, floorY, TER_X, RAIL_Z, GRID, zFar, GZ } from './layout.js';

export const GU = { uTideP: { value: new THREE.Vector2(-60, -6500) }, uTideR: { value: 4500 } };

export function makeGround(scene) {
  // ---------- the land ----------
  const NR = 230, NA = 400, A0 = -1.95, A1 = 1.95;          // rings, spokes (az range, rad; 0 = straight ahead)
  const pos = new Float32Array((NR + 1) * (NA + 1) * 3);
  let k = 0;
  for (let i = 0; i <= NR; i++) {
    const r = 6 * Math.pow(30000 / 6, i / NR);
    for (let j = 0; j <= NA; j++) {
      const a = A0 + (A1 - A0) * j / NA;
      const x = Math.sin(a) * r, z = -Math.cos(a) * r;
      let y = groundY(x, z);
      // (under the terrace: kept below its paving)
      if (Math.abs(x) < TER_X + 3 && z > RAIL_Z - 2 && z < 10) y = Math.min(y, floorY(x, z) - 1.5);
      pos[k++] = x; pos[k++] = y; pos[k++] = z;
    }
  }
  const idx = [];
  for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) {
    const a = i * (NA + 1) + j, b = a + 1, c = a + NA + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const landMat = new THREE.ShaderMaterial({
    uniforms: { ...LU },
    vertexShader: /* glsl */ `
      varying vec3 vW; varying vec3 vN;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normal; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      ${LIGHT_GLSL}
      varying vec3 vW; varying vec3 vN;
      const float BX = ${GRID.BX.toFixed(1)}, BZ = ${GRID.BZ.toFixed(1)}, ROAD = ${GRID.ROAD.toFixed(1)};
      void main() {
        vec3 N = normalize(vN);
        vec2 xz = vW.xz;
        float d = length(vW - cameraPosition);
        float y = vW.y;
        float px = d * 0.0012;                                // ~ a pixel's size here (m), for fading fine detail
        // grass and scrub on the hill, dry grass on the far hills
        float n = f21(xz * 0.05), n2 = f21(xz * 0.37 + 9.0);
        vec3 grass = mix(vec3(0.16, 0.24, 0.09), vec3(0.32, 0.36, 0.16), n) * (0.75 + 0.35 * n2);
        vec3 farHill = mix(vec3(0.27, 0.3, 0.16), vec3(0.42, 0.38, 0.24), f21(xz * 0.004));
        // the city: streets, pavements, lots
        vec2 g = vec2(mod(xz.x + BX * 0.5, BX), mod(xz.y + BZ * 0.5, BZ));
        vec2 e = min(g, vec2(BX, BZ) - g);                    // distance to the nearest street's middle
        float road = 1.0 - smoothstep(ROAD * 0.5 - px, ROAD * 0.5 + px, min(e.x, e.y));
        float walk = 1.0 - smoothstep(ROAD * 0.5 + 3.0 - px, ROAD * 0.5 + 3.0 + px, min(e.x, e.y));
        vec2 bid = floor((xz + vec2(BX, BZ) * 0.5) / vec2(BX, BZ));
        float lotN = h21(bid * 1.7 + 2.0);
        vec3 lot = mix(vec3(0.46, 0.44, 0.41), vec3(0.6, 0.57, 0.52), lotN);
        lot = mix(lot, vec3(0.2, 0.32, 0.12), step(0.9, h21(bid + 7.3)) * 0.9);      // a green square
        vec3 city = mix(lot, vec3(0.62, 0.6, 0.57), walk);
        city = mix(city, vec3(0.16, 0.16, 0.17) + 0.05 * n2, road);
        // (fine detail fades into an average far off)
        city = mix(city, vec3(0.42, 0.41, 0.39), smoothstep(6.0, 18.0, px));
        float onPlain = 1.0 - smoothstep(14.0, 34.0, y);
        vec3 alb = mix(grass, city, onPlain * smoothstep(-2600.0, -330.0, -abs(xz.y)) * step(-11000.0, xz.y));
        // the waterfront: a stone edge and a strip of sand
        alb = mix(alb, vec3(0.62, 0.58, 0.5), 1.0 - smoothstep(1.4, 2.6, y));
        float farSide = 1.0 - smoothstep(${zFar(0).toFixed(1)} + 400.0, ${zFar(0).toFixed(1)} - 300.0, xz.y);
        alb = mix(alb, farHill, (1.0 - farSide) * smoothstep(3.0, 20.0, y));
        // ---- the blasts' marks ----
        float gz = length(xz - uGZ);
        // dust laid down behind the front
        float behind = 1.0 - smoothstep(uFront - 80.0, uFront, gz);
        alb = mix(alb, uDustC * (0.7 + 0.4 * n2), behind * (uKind > 0.5 ? 0.75 : 0.0));
        // the crater: a deep bowl of broken rock with a raised rim, rubble thrown round it
        if (uCrater > 0.0) {
          float q = gz / uCrater;
          float bowl = 1.0 - smoothstep(0.9, 1.0, q);
          vec3 pit = mix(vec3(0.1, 0.08, 0.07), vec3(0.3, 0.24, 0.19), f21(xz * 0.01)) * (0.5 + 0.5 * smoothstep(0.2, 1.0, q));
          alb = mix(alb, pit, bowl);
          alb = mix(alb, vec3(0.42, 0.34, 0.27) * (0.8 + 0.3 * n2), smoothstep(0.92, 1.0, q) * (1.0 - smoothstep(1.0, 1.25, q)));
        }
        // scorched black ahead of the fire
        alb = mix(alb, vec3(0.05, 0.04, 0.035), (1.0 - smoothstep(uScorch - 200.0, uScorch, gz)) * step(0.5, uScorch));
        float ao = 0.8 + 0.2 * N.y;
        vec3 c = lit(alb, N, ao);
        c = melt(c, gz, xz);
        c = haze(c, d, y);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const land = new THREE.Mesh(geo, landMat);
  land.frustumCulled = false;
  scene.add(land);

  // ---------- the bay ----------
  const wgeo = new THREE.PlaneGeometry(70000, 70000, 440, 440).rotateX(-Math.PI / 2).translate(0, 0, -30000);
  const waterMat = new THREE.ShaderMaterial({
    uniforms: { ...LU, ...GU },
    transparent: false,
    vertexShader: /* glsl */ `
      uniform float uTide; uniform vec2 uTideP; uniform float uTideR;
      varying vec3 vW; varying float vT;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        // the Moon's pull: the bay heaps up toward it into a hill of water, and the level rises at the shore
        float r = length(w.xz - uTideP) / uTideR;
        float t = exp(-r * r * 1.4) * (0.75 + 0.25 * exp(-r * r * 6.0));
        w.y += uTide * (t + 0.03);
        vT = t;
        vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${LIGHT_GLSL}
      uniform vec2 uTideP; uniform float uTideR;
      varying vec3 vW; varying float vT;
      void main() {
        vec3 V = normalize(vW - cameraPosition);
        float d = length(vW - cameraPosition);
        vec2 p = vW.xz;
        // small waves (faded out as they shrink below a pixel)
        float px = d * 0.0012;
        float a1 = 1.0 - smoothstep(2.0, 9.0, px), a2 = 1.0 - smoothstep(8.0, 40.0, px);
        vec2 w1 = vec2(n21(p * 0.05 + vec2(uTime * 0.1, 0.0)) - n21(p * 0.05 + vec2(0.0, uTime * 0.08) + 5.0), n21(p * 0.07 - uTime * 0.07 + 2.0) - 0.5);
        vec2 w2 = vec2(n21(p * 0.006 + uTime * 0.01) - 0.5, n21(p * 0.007 + 3.0 - uTime * 0.012) - 0.5);
        vec3 N = normalize(vec3(w1.x * 0.18 * a1 + w2.x * 0.12 * a2, 1.0, w1.y * 0.18 * a1 + w2.y * 0.12 * a2));
        vec3 R = reflect(V, N);
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
        vec3 deep = vec3(0.02, 0.07, 0.11);
        vec3 refl = skyRefl(R) * 0.95;
        vec3 c = mix(deep * (uSkyC * 0.8 + uSunC * 0.1), refl, fres);
        // the fire's light on the water
        c += uFrontC * 0.15 * pow(max(dot(R, uFrontDir), 0.0), 8.0);
        // the hill of water under the Moon: steep, streaked with white foam, spray blowing off its top
        if (uTide > 1.0) {
          vec3 Nt = normalize(cross(dFdx(vW), dFdy(vW))); if (Nt.y < 0.0) Nt = -Nt;
          float steep = 1.0 - Nt.y;
          float streak = n21(vec2(atan(vW.x - uTideP.x, vW.z - uTideP.y) * 40.0, vW.y * 0.01 - uTime * 0.6));
          float foam = smoothstep(0.08, 0.5, steep) * smoothstep(0.35, 0.75, streak) + smoothstep(0.75, 0.95, vT) * 0.6;
          vec3 Rt = reflect(V, Nt);
          float fr = 0.04 + 0.96 * pow(1.0 - max(dot(-V, Nt), 0.0), 5.0);
          vec3 deepT = mix(vec3(0.02, 0.1, 0.13), vec3(0.05, 0.3, 0.32), smoothstep(0.55, 0.95, vT)) * (uSkyC * 1.2 + uSunC * 0.45);
          vec3 wcol = mix(deepT, skyRefl(Rt), fr) + uSunC * 0.6 * pow(max(dot(Rt, uSunDir), 0.0), 40.0);
          c = mix(c, wcol, smoothstep(0.02, 0.2, vT * uTide / 600.0));
          c = mix(c, vec3(0.95, 0.97, 1.0) * (uSunC * 0.6 + uSkyC * 0.6), clamp(foam, 0.0, 1.0) * smoothstep(50.0, 400.0, uTide));
        }
        float gz = length(p - vec2(${GZ.x.toFixed(1)}, ${GZ.z.toFixed(1)}));
        // boiling: white churning water and steam behind the fire's front
        float boil = (1.0 - smoothstep(4500.0, 9000.0, gz)) * uBoil * (0.65 + 0.35 * f21(p * 0.02 + uTime));
        vec3 steam = mix(vec3(0.75, 0.72, 0.7), vec3(1.4, 0.8, 0.45), 0.3) * (0.7 + 0.5 * f21(p * 0.01 + uTime * 0.6));
        c = mix(c, steam, boil);
        c = mix(c, uDustC * 0.8, (1.0 - smoothstep(uFront - 120.0, uFront, gz)) * (uKind > 0.5 ? 0.55 : 0.0));
        c = haze(c, d, 0.0);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const water = new THREE.Mesh(wgeo, waterMat);
  water.frustumCulled = false;
  water.renderOrder = -1;
  scene.add(water);
  return { land, water };
}

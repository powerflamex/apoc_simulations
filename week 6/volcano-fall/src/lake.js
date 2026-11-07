// The lava lake: one shader over a 300 m disc. A black crust broken into plates (Voronoi at five sizes, from 28 m
// plates down to 35 cm cracks, each size fading to its average once it is smaller than a few pixels, so nothing
// flickers from the rim), glowing cracks between them, the bright seam where the crust dives under at the walls,
// pools of molten lava where bubbles burst (uHot), seams that open (uSeam), and the dome that rises under you (uDome).
// The crust drifts (uFlow) as a whole. The surface can bulge (uDome, vertex shader).
import * as THREE from 'three';
import { NOISE } from './glsl.js';
import { LAKE_R } from './timeline.js';

export const NHOT = 16, NSEAM = 4;

export function makeLake() {
  const geo = new THREE.PlaneGeometry(2 * LAKE_R + 8, 2 * LAKE_R + 8, 320, 320).rotateX(-Math.PI / 2);
  const U = {
    uT: { value: 0 }, uFlow: { value: new THREE.Vector2(0.05, 0.18) },
    uHot: { value: Array.from({ length: NHOT }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uSeam: { value: Array.from({ length: NSEAM }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uSeamW: { value: Array.from({ length: NSEAM }, () => new THREE.Vector2(0, 0)) },
    uDome: { value: new THREE.Vector4(0, 117, 6, 0) },     // x, z, radius, height (m)
    uDomeGlow: { value: 0 },
    uMolten: { value: 0 }, uYou: { value: new THREE.Vector2(0, 117) },
    uFogC: { value: new THREE.Color(0.2, 0.06, 0.02) }, uFogD: { value: 0.0015 },
    uAmb: { value: new THREE.Color(0.02, 0.025, 0.04) }, uGlow: { value: 1 },
    uSwell: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */ `
      uniform vec4 uDome; uniform float uSwell, uT;
      varying vec3 vW;
      void main() {
        vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
        float d = length(p.xz - uDome.xy);
        float k = clamp(1.0 - d / max(uDome.z, 0.01), 0.0, 1.0);
        p.y += uDome.w * k * k * (3.0 - 2.0 * k);
        // the lake heaving at the end: long slow swells, biggest near you
        float near = exp(-pow(length(p.xz - uDome.xy) / 60.0, 2.0));
        p.y += uSwell * near * (0.6 * sin(p.x * 0.11 + uT * 1.3) * sin(p.z * 0.09 - uT * 1.1) + 0.4);
        vW = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uT, uMolten, uFogD, uGlow, uDomeGlow;
      uniform vec2 uFlow, uYou; uniform vec4 uHot[${NHOT}]; uniform vec4 uSeam[${NSEAM}]; uniform vec2 uSeamW[${NSEAM}];
      uniform vec4 uDome; uniform vec3 uFogC, uAmb;
      varying vec3 vW;
      ${NOISE}
      vec3 lavaCol(float k) {
        vec3 c = mix(vec3(0.35, 0.012, 0.0), vec3(1.0, 0.07, 0.003), smoothstep(0.0, 0.4, k));
        c = mix(c, vec3(1.0, 0.2, 0.015), smoothstep(0.4, 0.8, k));
        return mix(c, vec3(1.0, 0.45, 0.1), smoothstep(0.8, 1.25, k));
      }
      // one size of cracks: how much of this pixel is glowing crack (0..1), and the plate's random value
      float crack(vec2 q, float S, float wRel, float px, float widen, out float cell) {
        vec3 v = voro(q / S);
        cell = h21(v.yz);
        float w = wRel * S * (0.55 + 0.9 * cell) * widen;
        float e = v.x * S * 0.5;                       // ~ m to the edge
        float sharp = (1.0 - smoothstep(w - 0.5 * px, w + 0.5 * px, e)) * min(1.0, (w + 0.5 * px) / px);
        float avg = clamp(7.0 * w / S, 0.0, 1.0);
        return mix(avg, sharp, smoothstep(5.0, 14.0, S / px));
      }
      void main() {
        vec2 p = vW.xz;
        float r = length(p);
        vec2 q = p - uFlow * uT;
        float px = max(length(fwidth(p)), 1e-4);
        float dist = length(vW - cameraPosition);
        // near you, the crust breaks up more and more as the lake wakes
        float nearYou = exp(-pow(length(p - uYou) / 28.0, 2.0));
        float widen = 1.0 + 2.0 * uMolten * nearYou;
        float c0, c1, c2, c3, c4;
        float k0 = crack(q, 28.0, 0.0055, px, widen, c0);
        float k1 = crack(q + 7.3, 9.0, 0.008, px, widen, c1);
        float k2 = crack(q * 1.0 - 3.1, 3.0, 0.018, px, widen, c2);
        float k3 = crack(q + 11.7, 1.0, 0.022, px, widen, c3);
        float k4 = crack(q - 5.9, 0.35, 0.028, px, widen, c4);
        // which plates are hotter (near the upwelling at the far side; some cracks have cooled dark)
        float up = exp(-pow(length(p - vec2(-25.0, -55.0)) / 70.0, 2.0));
        float b0 = (0.55 + 0.45 * c0) * (0.8 + 0.5 * up);
        float E = k0 * b0 * 1.0 + k1 * (0.25 + 0.6 * c1) * 0.8 + k2 * (0.2 + 0.6 * c2) * 0.5 + k3 * (0.1 + 0.5 * c3) * 0.3 + k4 * (0.05 + 0.4 * c4) * 0.18;
        E = min(E, 1.4);
        float tex = fbmA(vec3(q * 1.7, 0.0), px * 1.7, 0.0);
        vec3 crust = vec3(0.028, 0.025, 0.025) * (0.5 + tex);
        // the crust itself is ~500°C: a dull red glow, stronger on hot plates
        vec3 col = crust * 0.6 + vec3(0.025, 0.003, 0.0) * (0.35 + 0.65 * c0) * (0.6 + 0.6 * up) * uGlow;
        col += lavaCol(0.5 + 0.3 * c0 + 0.2 * up) * E * 1.25 * uGlow;
        // the bright seam where the crust goes down at the walls
        float edge = smoothstep(${(LAKE_R - 7).toFixed(1)}, ${(LAKE_R - 0.5).toFixed(1)}, r + 2.0 * vnoise(vec3(p * 0.15, uT * 0.2)));
        col = mix(col, lavaCol(0.75 + 0.25 * vnoise(vec3(p * 0.4, uT))) * 2.0 * uGlow, edge);
        // molten pools where bubbles burst
        for (int i = 0; i < ${NHOT}; i++) {
          vec4 h = uHot[i];
          if (h.w <= 0.001) continue;
          // as a pool cools, new crust closes in from its edge: it shrinks (never a faint glow over a wide area)
          float rr = h.z * clamp(h.w * 1.4, 0.0, 1.0);
          if (rr < 0.02) continue;
          float d = length(p - h.xy) + rr * 0.25 * (vnoise(vec3(p * 1.5 / max(rr, 0.3), uT * 0.5)) - 0.5);
          float m = 1.0 - smoothstep(rr * 0.6, rr + 0.5 * px, d);
          if (m <= 0.0) continue;
          float conv = fbmA(vec3(p * 0.6, uT * 0.35), px * 0.6, 0.0);
          col = mix(col, lavaCol(0.6 + 0.35 * conv + 0.2 * h.w - 0.3 * d / rr) * (1.0 + 0.8 * min(h.w, 1.0)), m);
        }
        // seams that open up (the crack beside you, the rift)
        for (int i = 0; i < ${NSEAM}; i++) {
          vec4 s = uSeam[i]; vec2 w = uSeamW[i];
          if (w.y <= 0.001) continue;
          vec2 a = s.xy, b = s.zw, ab = b - a;
          float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
          float taper = sin(3.14159 * t);
          float d = length(p - a - ab * t) + 0.25 * w.x * (vnoise(vec3(p * 2.0, uT * 0.4)) - 0.5);
          float ww = w.x * (0.35 + 0.65 * taper);
          float m = 1.0 - smoothstep(ww * 0.5, ww + 0.5 * px, d);
          float glowRim = exp(-max(d - ww, 0.0) / (0.4 + ww)) * 0.35;
          float conv = fbmA(vec3(p * 1.3, uT * 0.5), px * 1.3, 0.0);
          col += lavaCol(0.55 + 0.2 * conv) * 0.45 * glowRim * w.y;
          col = mix(col, lavaCol(0.75 + 0.35 * conv - 0.3 * d / max(ww, 0.01)) * 1.5, m * w.y);
        }
        // the dome under you: radial cracks glowing ever brighter
        {
          vec2 dp = p - uDome.xy;
          float d = length(dp);
          if (uDomeGlow > 0.0 && d < uDome.z * 1.4) {
            float a = atan(dp.y, dp.x);
            float ln = abs(fract(a * 9.0 / 6.2832 + 0.15 * vnoise(vec3(dp * 0.8, 1.0))) - 0.5) * d * 6.2832 / 9.0;
            float ww = 0.03 + 0.12 * uDomeGlow * (1.0 - d / (uDome.z * 1.4));
            float m = 1.0 - smoothstep(ww, ww + px, ln);
            m = max(m, 1.0 - smoothstep(0.0, uDome.z * 0.12 * uDomeGlow * uDomeGlow, d));
            col = mix(col, lavaCol(0.85) * 1.6, m * uDomeGlow);
          }
        }
        // the pit's haze
        float fog = 1.0 - exp(-uFogD * dist);
        col = mix(col, uFogC, fog);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, U };
}

// ---------- spatter: glowing blobs thrown up by bubbles, rocks and the eruption (physics in story time) ----------
// each blob: [T0, x, y, z, vx, vy, vz, size]. In the air they cool from yellow to red; on landing they flatten into a
// splat that keeps glowing for a few seconds.
export function makeSpatter(maxN = 2600) {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
  const mesh = new THREE.InstancedMesh(geo, mat, maxN);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  const blobs = [];
  const m4 = new THREE.Matrix4(), c = new THREE.Color(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const hot = (age, out, k = 1) => {
    // white-yellow -> orange -> dull red -> dark
    const a = Math.max(0, age) / k;
    const r = 2.6 * Math.exp(-a / 4.0) + 0.05, g = 0.9 * Math.exp(-a / 2.2) + 0.004, b = 0.2 * Math.exp(-a / 0.8) + 0.002;
    return out.setRGB(r, g, b);
  };
  function add(T0, x, y, z, vx, vy, vz, s, crust = 0) { if (blobs.length < maxN) blobs.push([T0, x, y, z, vx, vy, vz, s, crust]); }
  function update(T) {
    let n = 0;
    for (const b of blobs) {
      const dt = T - b[0];
      if (dt < 0 || dt > 9) continue;
      let x = b[1] + b[4] * dt, z = b[3] + b[6] * dt, y = b[2] + b[5] * dt - 4.905 * dt * dt;
      let sy = 1, sxz = 1, age = dt, spin = dt * 3;
      // the time it lands on the lake (y = 0)
      const disc = b[5] * b[5] + 2 * 9.81 * b[2];
      const tl = (b[5] + Math.sqrt(Math.max(disc, 0))) / 9.81;
      if (dt > tl) {
        x = b[1] + b[4] * tl; z = b[3] + b[6] * tl; y = 0.02;
        const k = Math.min(1, (dt - tl) / 0.12), gone = Math.min(1, (dt - tl) / 1.5);
        sy = (1 - 0.8 * k) * (1 - gone); sxz = (1 + 0.4 * k) * (1 - gone); spin = tl * 3;
        age = tl + (dt - tl) * 1.6;
        if (dt - tl > 1.5) continue;
      }
      const s = b[7];
      e.set(spin + b[1], spin * 0.7, 0); q.setFromEuler(e);
      m4.compose(pos.set(x, y, z), q, sc.set(s * sxz, s * sy * 0.85, s * sxz * 0.9));
      mesh.setMatrixAt(n, m4);
      if (b[8]) c.setRGB(0.03, 0.025, 0.025).lerp(hot(age, new THREE.Color(), 2.5), 0.05);    // crust fragments: dark, a hot side
      else hot(age, c);
      mesh.setColorAt(n, c);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  return { mesh, add, update, blobs };
}

// ---------- the eruption: a column of lava bursting up in front of you, and the surge that swallows the view ----------
export function makeFountain() {
  const U = { uT: { value: 0 }, uHeat: { value: 1 }, uFogC: { value: new THREE.Color() }, uFogD: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uT;
      varying vec3 vW; varying vec3 vL;
      ${NOISE}
      void main() {
        vec3 p = position;
        vec3 n = normalize(position);
        float bump = vnoise(vec3(p.x * 2.5, p.y * 1.4 - uT * 3.0, p.z * 2.5)) * 0.5 + vnoise(vec3(p * 5.0 + uT)) * 0.25;
        p += n * (bump - 0.3) * 0.35;
        vL = position;
        vW = (modelMatrix * vec4(p, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uT, uHeat, uFogD; uniform vec3 uFogC;
      varying vec3 vW; varying vec3 vL;
      ${NOISE}
      void main() {
        // flowing molten lava: bright yellow-orange, darker red skins streaming up
        float f = vnoise(vec3(vL.x * 3.0, vL.y * 1.5 - uT * 4.0, vL.z * 3.0)) * 0.6 + vnoise(vec3(vL * 8.0 - uT * 2.0)) * 0.4;
        float skin = smoothstep(0.55, 0.75, f);
        vec3 hot = mix(vec3(1.0, 0.16, 0.012), vec3(1.0, 0.42, 0.08), smoothstep(0.2, 0.5, f));
        vec3 c = mix(hot * 1.4, vec3(0.4, 0.02, 0.0), skin * 0.8) * uHeat;
        float dist = length(vW - cameraPosition);
        c = mix(c, uFogC, 1.0 - exp(-uFogD * dist));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  // the column: a jet, wide at its foot, rounded at the top (unit height, origin at its foot)
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.0, 1, 48, 60, false).translate(0, 0.5, 0), mat);
  const surge = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), mat);
  col.frustumCulled = surge.frustumCulled = false;
  col.visible = surge.visible = false;
  return { col, surge, U };
}

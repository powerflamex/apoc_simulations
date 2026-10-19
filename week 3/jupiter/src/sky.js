// Everything beyond a few metres from you: Jupiter's sky, its cloud decks, the storms and the glowing deep.
// One shader on a big sphere that follows the camera. Units are km; the camera's altitude uCam.y is 0 at the
// cloud tops where you start and goes negative as you sink. Three cloud decks (real order, squeezed a little):
//   L1  white/orange ammonia clouds, banded into zones and belts, with the Great Red Spot towering on the horizon
//   L2  brown ammonium-hydrosulfide clouds
//   L3  water clouds: thunderstorm towers up to ~30 km tall (Everest is 8.8 km), lit from inside by lightning
// Each deck is a height field (ray-marched, with Jupiter's curvature, so the horizon is a real horizon); from
// below you see its underside; inside one, the view fogs over with wisps rushing past. Below the decks it is
// black until the air itself starts to glow (red -> orange -> yellow -> white as it heats).
import * as THREE from 'three';

export function makeSky() {
  const uniforms = {
    uCam: { value: new THREE.Vector3() },          // km (x, altitude, z)
    uPx: { value: 0.0007 },                         // radians per pixel
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 0.2, -1).normalize() },
    uSunCol: { value: new THREE.Color(1, 0.96, 0.9) },
    uSunI: { value: 3.0 },
    uSunset: { value: 0 },
    uMode: { value: 0 },                            // 0 above L1, 1 between L1/L2, 2 between L2/L3 (storms), 3 below
    uIn: { value: 0 }, uInCol: { value: new THREE.Color(1, 1, 1) },
    uL2: { value: 0.3 },                            // daylight reaching the brown deck
    uL3: { value: 0.0 },                            // ...the storm deck
    uBolt: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    uGlow: { value: 0 }, uHeat: { value: 0 }, uOcean: { value: 0 }, uMetal: { value: 0 },
    uWind: { value: new THREE.Vector2() },          // km the cloud tops have drifted (they shear past you)
    uFall: { value: 0 }, uDia: { value: 0 },                            // how far you have fallen (for the deep's billows rushing up)
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = (modelMatrix * vec4(position, 0.0)).xyz;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec3 uCam; uniform float uPx; uniform float uTime;
      uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uSunI; uniform float uSunset;
      uniform float uMode; uniform float uIn; uniform vec3 uInCol; uniform float uL2; uniform float uL3;
      uniform vec4 uBolt[4];
      uniform float uGlow; uniform float uHeat; uniform float uOcean; uniform float uMetal;
      uniform vec2 uWind; uniform float uFall; uniform float uDia;
      varying vec3 vDir;

      const float RJ = 69911.0;
      // the decks: base, top of the flat part, height of the billows (km)
      const float B1 = -19.0, T1 = -14.0, A1 = 4.0;
      const float B2 = -42.5, T2 = -32.0, A2 = 2.6;
      const float B3 = -84.0, T3 = -80.0, A3 = 31.0;
      // the Great Red Spot (squeezed: the real one is 16,000 km across), off to the left on the horizon
      const vec2 GRS = vec2(-250.0, -330.0); const vec2 GRSR = vec2(320.0, 160.0); const float GRSH = 15.0;

      float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
      float vn(vec2 p) {
        vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
      }
      float vn3(vec3 p) {
        vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3.0 - 2.0 * f);
        float a = mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), u.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), u.x), u.y);
        float b = mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), u.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), u.x), u.y);
        return mix(a, b, u.z);
      }
      // billowy fbm (rounded domes, sharp creases) with a level of detail from the pixel footprint fp (km)
      float billow(vec2 p, float scale, float fp, int maxOct) {
        float s = 0.0, a = 0.5, w = 0.0, f = 1.0;
        mat2 R = mat2(0.8, -0.6, 0.6, 0.8);
        for (int i = 0; i < 7; i++) {
          if (i >= maxOct) break;
          float lod = clamp(1.6 - log2(max(fp * f / scale, 1e-6)) * 0.5, 0.0, 1.0);   // fade octaves smaller than ~2 px
          if (lod <= 0.0) break;
          float n = abs(vn(p * f) * 2.0 - 1.0);
          s += a * n * lod; w += a * lod;
          f *= 2.03; a *= 0.42; p = R * p + 1.7;
        }
        return s / max(w, 1e-4) * (0.6 + 0.4 * min(w / 0.5, 1.0)) ;
      }
      float fbm(vec2 p, int oct) {
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 6; i++) { if (i >= oct) break; s += a * vn(p); p = p * 2.02 + 3.1; a *= 0.5; }
        return s;
      }

      // ---------- L1: the banded ammonia deck ----------
      float lat1(vec2 p) { return p.y + 22.0 * sin(p.x * 0.006) + 30.0 * (vn(p * 0.012) - 0.5); }
      float zone(float lat) { float s = sin(lat * 6.2832 / 170.0 + 1.3); return smoothstep(-0.35, 0.35, s); }   // 1 = white zone, 0 = orange belt
      float grs(vec2 p) { vec2 d = (p - GRS) / GRSR; return length(d); }
      // cumulus puffs: round bubbles in some cells of a jittered grid (cell size in km); a bubble's height
      // is proportional to its radius, so piles of them read as cauliflower tops with creases between
      float puffs(vec2 p, float cell, float presence, float seed) {
        vec2 c = p / cell; vec2 ci = floor(c); vec2 f = fract(c);
        float best = 0.0;
        vec2 o0 = step(0.5, f) - 1.0;
        for (int j = 0; j <= 1; j++) for (int i = 0; i <= 1; i++) {
          vec2 id = ci + o0 + vec2(i, j) + seed;
          float on = step(1.0 - presence, hash12(id * 1.37 + 5.0));
          vec2 o = id - seed + 0.5 + (vec2(hash12(id), hash12(id + 3.3)) - 0.5) * 0.45;
          float r = 0.28 + 0.4 * hash12(id + 7.1);
          float d = length(c - o) / r;
          float v = on * r * (0.65 + 0.6 * hash12(id + 2.9)) * pow(max(0.0, 1.0 - d * d), 0.8);
          // smooth union: soft creases between neighbouring puffs
          float k = 0.25, hh = max(k - abs(best - v), 0.0) / k;
          best = max(best, v) + hh * hh * k * 0.25;
        }
        return best;   // in cells
      }
      float h1(vec2 p, float fp, int oct) {
        vec2 q = vec2(p.x * 0.4, p.y) * 0.06;
        vec2 w = vec2(vn(q * 0.6 + 3.1), vn(q * 0.6 + 7.7)) - 0.5;
        q += w * 1.8;
        float z = zone(lat1(p));
        float b = billow(q, 16.0, fp, min(oct, 3));
        vec2 pw = p + w * 10.0;
        // cloud masses: irregular outlines (thresholded noise), walls at the edges, rounded tops
        float m = fbm(vec2(pw.x * 0.6, pw.y) * 0.1 + 2.0, 4);
        float cover = mix(0.56, 0.47, z);
        float mass = pow(max(0.0, m - cover) / (1.0 - cover) * 1.6, 0.55);
        // bubbles on them (1.6 km and 0.55 km), faded out where they'd be smaller than a few pixels
        float lod2 = smoothstep(0.6, 0.2, fp), lod3 = smoothstep(0.2, 0.06, fp);
        float b2 = lod2 > 0.0 ? puffs(pw, 1.1, 0.7, 17.0) * 1.1 : 0.0;
        float b3 = lod3 > 0.0 ? puffs(pw * 1.13, 0.45, 0.6, 41.0) * 0.45 : 0.0;
        float on = smoothstep(0.0, 0.25, mass);
        float va = 0.6 + 0.8 * vn(pw * 0.35 + 9.0);   // turrets taller in some places than others
        float cum = mass * 3.0 + on * va * (0.8 * b2 * lod2 + 0.12 * b3 * lod3);
        float r = grs(p);
        float g = r < 1.4 ? GRSH * pow(smoothstep(1.25, 0.0, r), 0.6) * (0.9 + 0.1 * b) : 0.0;
        return (0.2 + 0.3 * z + 0.9 * b + cum + g) / A1;
      }
      vec3 col1(vec2 p, float h, float fp) {
        float lat = lat1(p);
        float z = zone(lat);
        float n = fbm(vec2(p.x * 0.02, p.y * 0.08) + 4.0, 4);
        vec3 belt = mix(vec3(0.62, 0.30, 0.13), vec3(0.78, 0.47, 0.24), n);
        vec3 zn = mix(vec3(0.95, 0.84, 0.66), vec3(1.0, 0.95, 0.86), n);
        vec3 c = mix(belt, zn, z);
        // dark-blue "hot spots" and festoons along the belt edges
        float edge = exp(-pow((z - 0.5) / 0.18, 2.0));
        c = mix(c, vec3(0.32, 0.30, 0.36), edge * smoothstep(0.62, 0.8, fbm(p * 0.03 + 9.0, 3)) * 0.8);
        // the Red Spot: brick red swirl with a pale collar
        float r = grs(p);
        if (r < 1.6) {
          vec2 d = (p - GRS) / GRSR;
          float a = atan(d.y, d.x) + 3.2 * r;
          float sw = 0.5 + 0.5 * sin(a * 3.0 + fbm(d * 3.0, 3) * 4.0);
          vec3 red = mix(vec3(0.72, 0.16, 0.06), vec3(0.95, 0.36, 0.14), sw);
          c = mix(c, red * 1.25, smoothstep(1.05, 0.8, r));
          c = mix(c, vec3(1.0, 0.93, 0.85), exp(-pow((r - 1.12) / 0.1, 2.0)) * 0.7);
        }
        // tops of the billows whiter, valleys deeper in colour
        c = mix(c * vec3(0.78, 0.66, 0.58), mix(c, vec3(1.0, 0.98, 0.95), 0.3 * z), smoothstep(0.25, 1.1, h));
        return c;
      }
      // ---------- L2: brown deck ----------
      float h2(vec2 p, float fp, int oct) {
        vec2 q = vec2(p.x * 0.5, p.y) * 0.09 + 40.0;
        q += (vec2(vn(q * 0.5), vn(q * 0.5 + 5.0)) - 0.5) * 1.5;
        return 0.15 + 0.85 * billow(q, 11.0, fp, oct);
      }
      vec3 col2(vec2 p, float h) {
        float n = fbm(vec2(p.x * 0.03, p.y * 0.1) + 1.0, 3);
        return mix(vec3(0.35, 0.2, 0.11), vec3(0.62, 0.42, 0.26), n) * (0.55 + 0.6 * h);
      }
      // ---------- L3: storm towers (each Worley cell can hold a tower), with a clear shaft where you fall ----------
      float h3(vec2 p, float fp, int oct) {
        vec2 c = p / 9.0; vec2 ci = floor(c); float best = 0.0;
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
          vec2 id = ci + vec2(i, j);
          float rnd = hash12(id * 1.7 + 11.0);
          vec2 o = id + 0.5 + (vec2(hash12(id), hash12(id + 3.3)) - 0.5) * 0.7;
          float d = length(c - o);
          float tall = rnd > 0.35 ? 0.45 + 0.55 * hash12(id + 9.1) : 0.1;
          float rad = 0.32 + 0.22 * hash12(id + 5.5);
          float dome = sqrt(max(0.0, 1.0 - (d / rad) * (d / rad)));
          // anvil-ish: towers flatten and widen near the top
          best = max(best, tall * pow(dome, 0.55));
        }
        float shaft = smoothstep(2.0, 7.0, length(p - uCam.xz));
        float b = billow(p * 0.5 + 20.0, 2.0, fp, oct);
        return (0.06 + best * shaft) * (0.82 + 0.18 * b) + 0.05 * b;
      }
      vec3 col3(vec2 p, float h) { return mix(vec3(0.42, 0.44, 0.5), vec3(0.85, 0.86, 0.9), h); }

      float layerH(int L, vec2 p, float fp, int oct) {
        if (L == 1) return T1 + A1 * h1(p, fp, oct);
        if (L == 2) return T2 + A2 * h2(p, fp, oct);
        return T3 + A3 * h3(p, fp, oct);
      }

      // lightning: light from flashes inside the towers (bolt positions are camera-relative)
      vec3 boltLight(vec3 p) {
        vec3 c = vec3(0.0);
        for (int k = 0; k < 4; k++) {
          vec4 b = uBolt[k];
          if (b.w <= 0.0) continue;
          vec3 bp = vec3(uCam.x + b.x, b.y, uCam.z + b.z);
          float d = length(p - bp);
          c += vec3(0.75, 0.82, 1.0) * b.w * 9.0 / (1.0 + d * d / 6.0);
        }
        return c;
      }
      vec3 boltHaze(vec3 ro, vec3 rd, float tHit) {
        vec3 c = vec3(0.0);
        for (int k = 0; k < 4; k++) {
          vec4 b = uBolt[k];
          if (b.w <= 0.0) continue;
          vec3 bp = vec3(uCam.x + b.x, b.y, uCam.z + b.z);
          float tc = clamp(dot(bp - ro, rd), 0.0, tHit);
          float d = length(ro + rd * tc - bp);
          c += vec3(0.7, 0.8, 1.0) * b.w * 0.9 * exp(-d / 2.2);
        }
        return c;
      }

      // the sky above the cloud tops
      vec3 skyCol(vec3 rd) {
        float el = rd.y;
        vec3 zen = vec3(0.012, 0.035, 0.16), hor = vec3(0.16, 0.32, 0.62);
        vec3 c = mix(hor, zen, pow(clamp(el, 0.0, 1.0), 0.45));
        float sd = max(dot(rd, uSunDir), 0.0);
        // sunset: the sky dims, the horizon near the Sun burns orange
        float ss = uSunset;
        c *= 1.0 - 0.6 * ss;
        vec3 warm = vec3(1.0, 0.45, 0.15) * (0.6 * ss) * pow(sd, 3.0) * exp(-max(el, 0.0) * 6.0);
        c += warm;
        c += vec3(0.25, 0.35, 0.5) * exp(-max(el, 0.0) * 30.0) * (1.0 - 0.7 * ss);   // a thin bright haze on the horizon
        // the small, hard Sun (1/5 the size it looks from Earth) and its glare
        float sunUp = smoothstep(-0.02, 0.01, uSunDir.y);
        c += uSunCol * (pow(sd, 2500.0) * 2.0 + pow(sd, 300.0) * 0.25 + pow(sd, 30.0) * 0.03) * sunUp;
        c += uSunCol * smoothstep(0.99999, 0.999995, sd) * 60.0 * sunUp;
        return c;
      }

      // ray vs. a curved deck: altitude of the ray above the (flat-world) surface, including Jupiter's curvature
      float rayY(vec3 ro, vec3 rd, float t, float k) { return ro.y + rd.y * t + k * t * t; }

      // march a deck's height field; returns t of the hit (or -1)
      float marchDeck(int L, vec3 ro, vec3 rd, float yMin, float yMax, out float tPrev) {
        float k = max((1.0 - rd.y * rd.y) / (2.0 * RJ), 1e-9);
        tPrev = 0.0;
        // first t at which the ray is below yMax
        float t0 = 0.0;
        if (ro.y > yMax) {
          float a = k, b = rd.y, c = ro.y - yMax, disc = b * b - 4.0 * a * c;
          if (disc < 0.0 || b >= 0.0) return -1.0;
          t0 = (-b - sqrt(disc)) / (2.0 * a);
          if (t0 < 0.0) return -1.0;
        }
        // last useful t: where it reaches yMin, or its lowest point (then it climbs away)
        float tLow = rd.y < 0.0 ? -rd.y / (2.0 * k) : 0.0;
        float a = k, b = rd.y, c = ro.y - yMin, disc = b * b - 4.0 * a * c;
        float t1 = (disc > 0.0 && b < 0.0) ? (-b - sqrt(disc)) / (2.0 * a) : tLow;
        t1 = min(t1, 2500.0);
        if (t1 <= t0) {
          if (ro.y <= yMax) t1 = t0 + 60.0; else return -1.0;
        }
        // adaptive steps: as far as the clouds could possibly rise in the gap (slope bound), never less than
        // a small fraction of the distance; then a few bisection steps
        float t = t0, tp = t0;
        float lat = sqrt(max(0.0, 1.0 - rd.y * rd.y));
        for (int i = 0; i < 120; i++) {
          vec3 p = ro + rd * t;
          float d = rayY(ro, rd, t, k) - layerH(L, p.xz, uPx * t * 4.0, 3);
          if (d < 0.0) {
            float ta = tp, tb = t;
            for (int j = 0; j < 7; j++) {
              float tm = 0.5 * (ta + tb);
              vec3 pm = ro + rd * tm;
              if (rayY(ro, rd, tm, k) - layerH(L, pm.xz, uPx * tm * 4.0, 3) < 0.0) tb = tm; else ta = tm;
            }
            tPrev = ta;
            return tb;
          }
          tp = t;
          t += max(0.85 * d / (max(-rd.y, 0.0) + 1.3 * lat), max(0.01, t * 0.022));
          if (t > t1) break;
        }
        return -1.0;
      }

      vec3 shadeDeck(int L, vec3 ro, vec3 rd, float t, float light, out float hOut) {
        vec3 p = ro + rd * t;
        float fp = max(uPx * t, 0.004);
        float e = max(fp * 2.5, 0.025);
        int oct = 7;
        float h0 = layerH(L, p.xz, fp, oct);
        float hx = layerH(L, p.xz + vec2(e, 0.0), fp, oct);
        float hz = layerH(L, p.xz + vec2(0.0, e), fp, oct);
        vec2 gr = vec2(hx - h0, hz - h0) / e; gr /= max(1.0, length(gr) / 2.5);
        vec3 n = normalize(vec3(-gr.x, 1.0, -gr.y));
        float A = L == 1 ? A1 : (L == 2 ? A2 : A3);
        float T = L == 1 ? T1 : (L == 2 ? T2 : T3);
        float hn = clamp((h0 - T) / A, 0.0, 1.4);
        hOut = hn;
        vec3 alb = L == 1 ? col1(p.xz, hn, fp) : (L == 2 ? col2(p.xz, hn) : col3(p.xz, hn));
        vec3 col;
        if (L == 1) {
          // direct sun with soft shadows from the billows upwind of the Sun
          float ndl = dot(n, uSunDir);
          float sh = 1.0;
          vec2 sxz = normalize(uSunDir.xz + 1e-5);
          float rise = uSunDir.y / max(length(uSunDir.xz), 1e-3);
          for (int i = 1; i <= 3; i++) {
            float d = 0.5 * pow(2.6, float(i));
            float hs = layerH(1, p.xz + sxz * d, d * 0.3, 3);
            sh *= smoothstep(-0.25, 0.25, (h0 + rise * d) - hs);
          }
          sh = mix(0.35, 1.0, sh);                                   // light scatters into the shadows
          float dif = clamp(ndl * 0.6 + 0.4, 0.0, 1.0) * sh;
          float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
          float back = pow(max(dot(rd, uSunDir), 0.0), 4.0) * (0.3 + rim) * 0.9;   // silver linings toward the Sun
          float ao = 0.7 + 0.3 * smoothstep(0.1, 1.0, hn);
          vec3 amb = mix(vec3(0.2, 0.3, 0.55), vec3(0.42, 0.5, 0.7), n.y * 0.5 + 0.5) * ao * (1.0 - 0.6 * uSunset);
          col = alb * (uSunCol * uSunI * dif * 0.5 * ao + amb * 0.6) + uSunCol * uSunI * back * alb * 0.35;
        } else if (L == 2) {
          float ao = 0.35 + 0.65 * hn;
          col = alb * vec3(0.95, 0.8, 0.65) * uL2 * ao * (0.6 + 0.4 * n.y) * 2.2;
        } else {
          float ao = 0.4 + 0.6 * clamp(hn * 1.5, 0.0, 1.0);
          col = alb * (vec3(0.5, 0.42, 0.36) * uL3 * ao + vec3(0.02, 0.022, 0.03));
          col += alb * boltLight(p) * (0.5 + 0.5 * max(n.y, 0.0) + 0.5 * ao);
        }
        return col;
      }

      vec3 underside(int L, vec3 ro, vec3 rd, out float t) {
        float yb = L == 1 ? B1 : (L == 2 ? B2 : B3);
        t = max((yb - ro.y) / max(rd.y, 1e-4), 0.0);
        vec3 p = ro + rd * t;
        float fp = uPx * t;
        float n = billow(p.xz * 0.15 + float(L) * 7.0, 6.0, fp * 0.15, 5);
        vec3 c;
        if (L == 1) c = mix(vec3(0.5, 0.42, 0.36), vec3(0.95, 0.85, 0.72), n) * (0.12 + 0.6 * uL2);
        else if (L == 2) c = mix(vec3(0.16, 0.09, 0.05), vec3(0.42, 0.28, 0.17), n) * (0.1 + 0.9 * uL3) * 0.8;
        else c = mix(vec3(0.05, 0.05, 0.06), vec3(0.2, 0.2, 0.24), n) * 0.2;
        if (L >= 2) c += mix(vec3(0.4), vec3(0.9), n) * boltLight(p - vec3(0.0, 2.0, 0.0)) * 0.6;
        return c;
      }

      // the glowing deep: a blackbody colour from dull red to white
      vec3 heatCol(float h) {
        vec3 c = mix(vec3(0.45, 0.03, 0.0), vec3(1.0, 0.2, 0.02), smoothstep(0.0, 0.25, h));
        c = mix(c, vec3(1.0, 0.45, 0.06), smoothstep(0.2, 0.45, h));
        c = mix(c, vec3(1.0, 0.75, 0.3), smoothstep(0.45, 0.75, h));
        c = mix(c, vec3(1.0, 0.95, 0.85), smoothstep(0.75, 1.0, h));
        return c;
      }
      vec3 deep(vec3 rd) {
        if (uGlow <= 0.0) return vec3(0.0);
        // huge billows of glowing gas rushing up past you: four shells at increasing distance, nearest first
        float acc = 0.0, lum = 0.0;
        for (int i = 0; i < 4; i++) {
          float d = 1.0 + float(i) * 1.6;
          vec3 p = rd * d * 2.2 + vec3(0.0, uFall * (0.6 + 0.25 * float(i)) + float(i) * 7.0, uTime * 0.05);
          float n = vn3(p) * 0.6 + vn3(p * 2.3 + 4.0) * 0.28 + vn3(p * 5.1) * 0.12;
          float a = smoothstep(0.4, 0.72, n) * 0.7;
          lum += (1.0 - acc) * a * (0.6 + 0.8 * n);
          acc += (1.0 - acc) * a;
        }
        lum += (1.0 - acc) * 0.22;
        // hotter below than above
        float b = lum * (1.0 - 0.45 * rd.y);
        // the ocean: the billows close in and thicken, slow sheets of brighter fluid
        if (uOcean > 0.0) {
          float sheet = vn3(vec3(rd.xz * 4.0 / (0.6 + abs(rd.y)), uFall * 0.4 + uTime * 0.2));
          b = mix(b, b * (0.7 + 0.8 * smoothstep(0.45, 0.8, sheet)), uOcean);
        }
        float bright = uGlow * mix(0.3, 1.0, uHeat * uHeat) * (1.0 + 0.3 * uMetal) * (1.0 - 0.5 * uDia);
        return heatCol(clamp(uHeat + 0.28 * (lum - 0.6), 0.0, 1.0)) * bright * b;
      }

      void main() {
        vec3 rd = normalize(vDir);
        vec3 ro = uCam;
        vec3 col;
        float tHit = 1e5;
        int mode = int(uMode + 0.5);
        if (mode == 0) {
          float tp;
          float t = rd.y < 0.02 ? marchDeck(1, ro, rd, T1 - 0.2, T1 + A1 * 1.25 + GRSH, tp) : -1.0;
          vec3 sky = skyCol(rd);
          if (t > 0.0) {
            float hh;
            col = shadeDeck(1, ro, rd, t, 1.0, hh);
            // aerial perspective: crisp near, bluish haze toward the horizon
            vec3 hz = mix(vec3(0.28, 0.42, 0.68), vec3(0.75, 0.42, 0.25), uSunset) * (0.9 - 0.4 * uSunset);
            float f = 1.0 - exp(-t / 900.0);
            col = mix(col, hz, f * 0.8);
            tHit = t;
          } else col = sky;
        } else if (mode == 1 || mode == 2) {
          int Lc = mode;           // ceiling deck
          int Lf = mode + 1;       // floor deck
          float tp, t;
          if (rd.y > 0.0) {
            col = underside(Lc, ro, rd, t);
            tHit = t;
          } else {
            float yMax = Lf == 2 ? T2 + A2 * 1.1 : T3 + A3 * 1.1;
            float yMin = Lf == 2 ? T2 - 0.2 : T3 - 0.2;
            t = marchDeck(Lf, ro, rd, yMin, yMax, tp);
            if (t > 0.0) { float hh; col = shadeDeck(Lf, ro, rd, t, 1.0, hh); tHit = t; }
            else { col = vec3(0.0); tHit = 400.0; }
          }
          // the murk between the decks
          vec3 murk = mode == 1 ? vec3(0.55, 0.45, 0.36) * (0.1 + 0.7 * uL2) : vec3(0.12, 0.1, 0.09) * (0.05 + uL3 * 2.0);
          float fd = mode == 1 ? 90.0 : 45.0;
          col = mix(col, murk, 1.0 - exp(-max(tHit, 0.0) / fd));
          if (mode == 2) col += boltHaze(ro, rd, tHit);
        } else {
          // below the storms: the dark, lightning above, then the glowing deep
          float t;
          col = vec3(0.0);
          if (rd.y > 0.0) {
            vec3 u = underside(3, ro, rd, t);
            col = u * exp(-max(t, 0.0) / 25.0);
            tHit = t;
          }
          col += boltHaze(ro, rd, tHit) * 0.6;
          col += deep(rd);
        }
        // inside a deck: fog with wisps rushing up past you
        if (uIn > 0.0) {
          float w = 0.0;
          for (int i = 0; i < 4; i++) {
            float d = 0.02 * pow(2.2, float(i));
            vec3 p = (rd * d + vec3(0.0, uCam.y, 0.0)) * vec3(18.0, 9.0, 18.0) / (1.0 + float(i));
            w += (vn3(p) - 0.5) * (0.5 / (1.0 + float(i) * 0.6));
          }
          vec3 fogc = uInCol * (0.82 + 0.25 * rd.y + 0.5 * w);
          if (mode >= 2) fogc += boltHaze(ro, rd, 2.0) * 0.8;
          col = mix(col, fogc, uIn);
        }
        if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);   // never let one bad pixel poison the bloom
        gl_FragColor = vec4(max(col, 0.0), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  mat.toneMapped = true;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms, mat };
}

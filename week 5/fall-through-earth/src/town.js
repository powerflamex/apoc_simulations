// Buildings for both ends of the hole, one instanced box each with the whole facade in a shader:
// windows in a grid fitted to each wall (floors 3.4 m, bays ~2 m), a shopfront at street level, cornices,
// balconies (Madrid) or a veranda line (Wellington). Lit by the Sun (day) or by the windows, shops and street
// lamps (night: up to 6 lamps passed in as uniforms). Hashes use integers only (wall id, floor, bay): no speckle.
import * as THREE from 'three';

export function makeTown(list, { night = false } = {}) {
  const n = list.length;
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const aS = new Float32Array(n * 4), aC = new Float32Array(n * 3), aSz = new Float32Array(n * 3);
  list.forEach((b, i) => {
    aS.set([b.seed ?? i * 0.137, b.kind ?? 0, b.lit ?? 0.5, b.shop ?? 1], i * 4);
    const c = new THREE.Color(b.col ?? 0xd8c09a);
    aC.set([c.r, c.g, c.b], i * 3);
    aSz.set([b.w, b.h, b.d], i * 3);
  });
  geo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
  geo.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 3));
  geo.setAttribute('aSz', new THREE.InstancedBufferAttribute(aSz, 3));
  const U = {
    uSun: { value: new THREE.Vector3(0.35, 0.82, -0.45).normalize() },
    uSunCol: { value: new THREE.Color(1.0, 0.95, 0.86).multiplyScalar(2.6) },
    uAmb: { value: new THREE.Color(0.45, 0.55, 0.75) },
    uNight: { value: night ? 1 : 0 },
    uLamp: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, -1e4, 0, 0)) },
    uLampCol: { value: new THREE.Color(1.0, 0.72, 0.42) },
    uUp: { value: new THREE.Vector4(0, -1e4, 0, 0) },    // the light shining up out of the hole (pos, strength)
    uUpCol: { value: new THREE.Color(1.0, 0.92, 0.8) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */ `
      attribute vec4 aS; attribute vec3 aC; attribute vec3 aSz;
      varying vec3 vL; varying vec3 vN; varying vec3 vW; varying vec4 vS; varying vec3 vC; varying vec3 vSz;
      void main() {
        vL = position; vN = normal; vS = aS; vC = aC; vSz = aSz;
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uAmb; uniform float uNight;
      uniform vec4 uLamp[6]; uniform vec3 uLampCol; uniform vec4 uUp; uniform vec3 uUpCol;
      varying vec3 vL; varying vec3 vN; varying vec3 vW; varying vec4 vS; varying vec3 vC; varying vec3 vSz;
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float box(vec2 f, vec2 a, vec2 b) { vec2 w = fwidth(f) * 0.7; vec2 s = smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f)); return s.x * s.y; }
      void main() {
        vec3 N = normalize(vN);
        bool roof = N.y > 0.5;
        bool sx = abs(N.x) > 0.5;
        float W = sx ? vSz.z : vSz.x;                     // this wall's width (m)
        float along = (sx ? vL.z : vL.x) * W + W * 0.5;   // m along the wall
        float up = vL.y * vSz.y;                          // m above the ground
        float face = sx ? (N.x > 0.0 ? 1.0 : 2.0) : (N.z > 0.0 ? 3.0 : 4.0);
        float seed = vS.x * 100.0 + face * 7.0;
        float kind = vS.y;
        vec3 alb = vC;
        vec3 emi = vec3(0.0);
        float glassK = 0.0;
        if (!roof) {
          float FH = 3.4, ground = 4.2;
          float bays = max(1.0, floor(W / 2.1));
          float bw = W / bays;
          float bi = floor(along / bw), fx = fract(along / bw);
          float fi = floor((up - ground) / FH), fy = fract((up - ground) / FH);
          float top = vSz.y - 0.9;
          float hw = h21(vec2(seed + bi, fi + 3.0));
          if (up > ground && up < top) {
            // a window per bay and floor, tall (Madrid) or squarer (Wellington)
            float win = kind < 0.5 ? box(vec2(fx, fy), vec2(0.28, 0.12), vec2(0.72, 0.86)) : box(vec2(fx, fy), vec2(0.18, 0.25), vec2(0.82, 0.8));
            float frame = kind < 0.5 ? box(vec2(fx, fy), vec2(0.24, 0.08), vec2(0.76, 0.9)) - win : 0.0;
            vec3 glass = mix(vec3(0.1, 0.13, 0.17), vec3(0.42, 0.55, 0.7), 0.35 * (1.0 - uNight));
            float lit = step(hw, vS.z);
            vec3 room = mix(vec3(1.0, 0.72, 0.42), vec3(0.85, 0.9, 1.0), step(0.7, h21(vec2(seed, bi * 3.0 + fi)))) * (0.6 + 0.6 * h21(vec2(bi, fi + seed)));
            alb = mix(alb, glass, win);
            alb = mix(alb, vec3(0.92, 0.9, 0.86), frame * 0.8);
            emi += room * win * lit * mix(0.0, 1.6, uNight);
            glassK = win;
            // shutters (Madrid, green) half open on some windows; a small iron balcony on the lower floors
            if (kind < 0.5) {
              float sh = box(vec2(fx, fy), vec2(0.13, 0.12), vec2(0.27, 0.86)) + box(vec2(fx, fy), vec2(0.73, 0.12), vec2(0.87, 0.86));
              alb = mix(alb, vec3(0.2, 0.33, 0.24), sh * step(0.35, hw));
              float bal = box(vec2(fx, fy), vec2(0.2, 0.0), vec2(0.8, 0.06)) + box(vec2(fx, fy), vec2(0.2, 0.06), vec2(0.8, 0.3)) * step(0.5, fract(fx * 22.0)) * 0.7;
              alb = mix(alb, vec3(0.08, 0.08, 0.09), clamp(bal, 0.0, 1.0) * step(fi, 2.5));
            }
            // floor bands
            alb *= 1.0 - 0.18 * box(vec2(fx, fy), vec2(-0.1, 0.94), vec2(1.1, 1.01));
          }
          // cornice at the top
          alb = mix(alb, alb * 1.15 + 0.05, box(vec2(0.5, up), vec2(0.0, top), vec2(1.0, top + 0.35)));
          alb *= 1.0 - 0.25 * box(vec2(0.5, up), vec2(0.0, top + 0.35), vec2(1.0, top + 0.45));
          // shopfronts at street level: lit windows with a dark band (signage) above
          if (up < ground) {
            float sw = box(vec2(fx, up), vec2(0.08, 0.35), vec2(0.92, 3.1));
            float sign = box(vec2(fx, up), vec2(0.0, 3.25), vec2(1.0, 4.0));
            vec3 shop = mix(vec3(1.0, 0.8, 0.55), vec3(0.95, 0.95, 1.0), step(0.6, h21(vec2(seed, bi)))) * (0.8 + 0.5 * h21(vec2(bi + 3.0, seed)));
            alb = mix(alb, vec3(0.12, 0.12, 0.13), sw);
            emi += shop * sw * vS.w * mix(0.5, 2.2, uNight);
            // neon on some signs at night
            vec3 neon = vec3(h21(vec2(seed, 1.0)), h21(vec2(seed, 2.0)), h21(vec2(seed, 3.0)));
            neon = normalize(neon + 0.05) * 1.3;
            float nl = sign * step(0.45, h21(vec2(seed + bi, 9.0))) * box(vec2(fract(along * 0.7), up), vec2(0.1, 3.45), vec2(0.9, 3.8));
            alb = mix(alb, vec3(0.1), sign * 0.6);
            emi += neon * nl * 3.0 * uNight;
          }
        } else {
          alb = vec3(0.32, 0.3, 0.28);
        }
        // light: the Sun by day; at night the lamps, the light from the hole and a little sky
        vec3 lit = uAmb * (0.55 + 0.45 * N.y) + uSunCol * max(dot(N, uSun), 0.0) * (1.0 - uNight);
        for (int i = 0; i < 6; i++) {
          vec3 d = uLamp[i].xyz - vW; float r2 = dot(d, d);
          lit += uLampCol * uLamp[i].w * max(dot(N, normalize(d)), 0.0) / (1.0 + r2 * 0.06);
        }
        { vec3 d = uUp.xyz - vW; float r2 = dot(d, d); lit += uUpCol * uUp.w * max(dot(N, normalize(d)), 0.0) / (1.0 + r2 * 0.02); }
        vec3 col = alb * lit + emi;
        // glass shows a bit of sky by day
        col += glassK * vec3(0.25, 0.35, 0.5) * 0.4 * (1.0 - uNight) * (0.5 + 0.5 * N.y);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  mat.extensions = { derivatives: true };
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const m4 = new THREE.Matrix4();
  list.forEach((b, i) => {
    m4.makeRotationY(b.rot ?? 0).setPosition(b.x, b.y ?? 0, b.z);
    m4.multiply(new THREE.Matrix4().makeScale(b.w, b.h, b.d));
    mesh.setMatrixAt(i, m4);
  });
  mesh.frustumCulled = false;
  return { mesh, U };
}

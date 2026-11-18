// Walls of weather: a curved sheet standing on the sea at distance uR from a centre (the camera), spanning bearings
// uB0 +- uSpan, uH metres tall, painted in the shader (the camera never moves, so a painted sheet reads as a solid
// mass). One look per kind:
//   0 storm (Jupiter): a towering banded storm wall, cream / ochre / rust / dark brown like Jupiter's belts, billowing
//     and churning, a dark shelf at its base with rain shafts down to the sea; lightning lights it from inside.
//   1 dust (Mars): a rolling wall of red-brown dust standing on the ground, lit on its front.
//   2 steam (Venus): the whole sea steaming: a low bank of rising, wispy vapour.
//   3 front (Neptune): a white wall of ice and spray streaming sideways.
// Drawn after the sea (which writes depth), so water in front of it hides its foot.
import * as THREE from 'three';

const vert = /* glsl */ `
uniform float uR; uniform float uB0; uniform float uSpan; uniform float uH; uniform float uY0; uniform vec3 uC; uniform float uLean;
varying vec2 vP; varying vec2 vUV;
void main() {
  float b = uB0 + uv.x * uSpan;
  float R = uR * (1.0 - uLean * uv.y * uv.y);
  vec3 p = uC + vec3(-cos(b) * R, uY0 + uv.y * uH, -sin(b) * R);
  vP = vec2(uv.x * uSpan * uR, uv.y * uH);
  vUV = uv;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const frag = /* glsl */ `
precision highp float;
varying vec2 vP; varying vec2 vUV;
uniform float uKind; uniform float uT; uniform float uH; uniform float uAlpha; uniform float uTop; uniform float uRain; uniform float uSpeed;
uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform vec3 uC4; uniform vec3 uLit; uniform vec3 uDark;
uniform float uFlash; uniform vec2 uFlashP; uniform vec3 uFlashCol; uniform vec3 uHazeC; uniform float uHazeK; uniform float uScale;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n21(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * n21(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
float fbm3(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++){ s += a * n21(p); p = p * 2.07 + 3.1; a *= 0.5; } return s; }
void main() {
  vec2 P = vP / uScale;
  float y = vUV.y;                      // 0 at the foot, 1 at the top of the sheet
  float side = 1.0 - smoothstep(0.82, 1.0, abs(vUV.x));
  vec3 col; float a;
  if (uKind < 0.5) {
    // ---- the storm wall ----
    vec2 w = vec2(fbm(P / 1600.0 + vec2(0.0, uT * 0.012)), fbm(P / 1600.0 + vec2(5.2, -uT * 0.01))) - 0.5;
    vec2 Q = P + w * 900.0;
    // the top: big domes over a ragged line
    float dome = pow(abs(sin(P.x / 1500.0 + 2.0 * fbm3(P.xx / 2400.0))), 0.6);
    float top = uTop * (0.66 + 0.2 * dome + 0.16 * fbm(vec2(P.x / 700.0, 3.0)));
    float edge = 0.025 + 0.03 * fbm(P / 160.0);
    float body = 1.0 - smoothstep(top - edge, top + edge, y);
    // billows: shade from the slope of the noise (lit from the upper left)
    float n0 = fbm(Q / 520.0 + vec2(0.0, -uT * 0.03));
    float nx = fbm((Q + vec2(60.0, 0.0)) / 520.0 + vec2(0.0, -uT * 0.03)) - n0;
    float ny = fbm((Q + vec2(0.0, 60.0)) / 520.0 + vec2(0.0, -uT * 0.03)) - n0;
    float lit = clamp(0.55 + 3.2 * (-nx * 0.6 + ny * 0.8), 0.0, 1.3);
    // Jupiter's belts, warped and curling
    float L = (Q.y / uH) * 15.0 + 2.5 * fbm(Q / 900.0) + 0.6 * sin(Q.x / 2200.0 + uT * 0.05);
    float bnd = 0.5 + 0.5 * sin(L);
    float bnd2 = 0.5 + 0.5 * sin(L * 2.13 + 1.7);
    vec3 belt = mix(uC1, uC2, smoothstep(0.25, 0.75, bnd));
    belt = mix(belt, uC3, smoothstep(0.6, 0.95, bnd2) * 0.75);
    belt = mix(belt, uC4, smoothstep(0.7, 0.95, fbm(Q / 300.0)) * 0.5);
    col = belt * (0.25 + 0.95 * lit) * mix(0.3, 1.0, smoothstep(0.05, 0.6, y));
    col *= uLit;
    // the dark shelf at the base and rain shafts below it
    float base = 0.17 + 0.03 * fbm(vec2(P.x / 500.0, 1.0));
    float under = 1.0 - smoothstep(base - 0.02, base + 0.02, y);
    float shaft = fbm(vec2(P.x / 90.0 + P.y / 900.0, P.y / 1400.0 - uT * 0.5));
    float rain = smoothstep(0.42, 0.7, shaft) * uRain * (0.4 + 0.6 * smoothstep(0.0, base, y));
    col = mix(col, uDark, under);
    a = mix(body, rain * 0.85 + 0.05, under);
    // lightning inside
    vec2 fd = (P - uFlashP) / vec2(1200.0, 900.0);
    float g = exp(-dot(fd, fd)) * uFlash;
    col += uFlashCol * g * (0.6 + 1.2 * n0) * 2.2;
    col += uFlashCol * uFlash * 0.25 * body;
  } else if (uKind < 1.5) {
    // ---- the dust wall: cauliflower billows churning up its face, dense and dark at its foot, lit from behind you ----
    vec2 Q = P + (vec2(fbm(P / 260.0 + uT * 0.05), fbm(P / 260.0 - uT * 0.06 + 3.0)) - 0.5) * 120.0 - vec2(0.0, uT * 7.0);
    float dome = pow(abs(sin(P.x / 140.0 + 2.0 * fbm3(P.xx / 420.0))), 0.55);
    float top = uTop * (0.6 + 0.24 * dome + 0.16 * fbm(vec2(P.x / 60.0, 2.0) + uT * 0.08));
    float edge = 0.012 + 0.03 * fbm(P / 25.0 + uT * 0.2);
    float body = 1.0 - smoothstep(top - edge, top + edge, y);
    float hA = fbm(Q / 85.0) * 0.6 + fbm(Q / 28.0 + 4.0) * 0.3 + n21(Q / 8.0) * 0.1;
    float hx = fbm((Q + vec2(4.0, 0.0)) / 85.0) * 0.6 + fbm((Q + vec2(4.0, 0.0)) / 28.0 + 4.0) * 0.3 + n21((Q + vec2(4.0, 0.0)) / 8.0) * 0.1 - hA;
    float hy = fbm((Q + vec2(0.0, 4.0)) / 85.0) * 0.6 + fbm((Q + vec2(0.0, 4.0)) / 28.0 + 4.0) * 0.3 + n21((Q + vec2(0.0, 4.0)) / 8.0) * 0.1 - hA;
    vec3 Nn = normalize(vec3(-hx * 13.0, -hy * 13.0, 1.0));
    float diff = clamp(dot(Nn, normalize(vec3(-0.3, 0.75, 0.6))), 0.0, 1.0);
    float ao = smoothstep(0.3, 0.75, hA);
    // the rim of each billow along the top catches the light
    float rim = smoothstep(top - 0.08, top - 0.005, y) * 0.5;
    float vg = smoothstep(0.0, 0.85, y / max(top, 0.01));
    col = mix(uDark, uLit, clamp((0.35 + 0.65 * vg) * (0.55 + 0.45 * diff) * (0.6 + 0.4 * ao) + rim, 0.0, 1.2));
    a = body;
  } else if (uKind < 2.5) {
    // ---- steam off the sea ----
    float n = fbm(vec2(P.x / 35.0, P.y / 70.0 - uT * 0.55)) * 0.65 + fbm(vec2(P.x / 11.0, P.y / 25.0 - uT * 1.1)) * 0.35;
    float hgt = uTop * (0.45 + 0.55 * fbm(vec2(P.x / 120.0, uT * 0.1)));
    a = smoothstep(0.3, 0.62, n + 0.45 * (1.0 - y / max(hgt, 0.01))) * (1.0 - smoothstep(hgt * 0.7, hgt, y));
    col = mix(uDark, uLit, 0.55 + 0.45 * n);
  } else {
    // ---- a white front of ice and spray, streaming left to right ----
    vec2 Q = vec2((P.x - uT * uSpeed) / 220.0, P.y / 26.0);
    float n = fbm(vec2(Q.x * 0.25, Q.y)) * 0.6 + fbm(vec2(Q.x * 0.6 + 7.0, Q.y * 2.2)) * 0.4;
    float top = uTop * (0.7 + 0.3 * fbm(vec2(P.x / 300.0 - uT * 0.4, 1.0)));
    a = smoothstep(0.3, 0.62, n) * (1.0 - smoothstep(top * 0.7, top, y)) + 0.3 * (1.0 - smoothstep(0.0, top, y));
    col = mix(uDark, uLit, 0.6 + 0.4 * n);
  }
  col = mix(col, uHazeC, uHazeK);
  a = clamp(a, 0.0, 1.0) * uAlpha * side;
  if (a < 0.003) discard;
  gl_FragColor = vec4(col, a);
}`;

export function makeWall(scene, order = 2) {
  const NU = 220, NV = 56;
  const pos = new Float32Array((NU + 1) * (NV + 1) * 3), uv = new Float32Array((NU + 1) * (NV + 1) * 2);
  let k = 0;
  for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) { uv[k * 2] = -1 + 2 * i / NU; uv[k * 2 + 1] = j / NV; k++; }
  const idx = [];
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const C = (r, g, b) => ({ value: new THREE.Color(r, g, b) });
  const u = {
    uKind: { value: 0 }, uR: { value: 5000 }, uB0: { value: 0.2 }, uSpan: { value: 1.4 }, uH: { value: 3000 }, uY0: { value: 0 }, uC: { value: new THREE.Vector3() },
    uLean: { value: 0 }, uT: { value: 0 }, uAlpha: { value: 0 }, uTop: { value: 1 }, uRain: { value: 0 }, uSpeed: { value: 0 }, uScale: { value: 1 },
    uC1: C(1, 1, 1), uC2: C(1, 1, 1), uC3: C(1, 1, 1), uC4: C(1, 1, 1), uLit: C(1, 1, 1), uDark: C(0.2, 0.2, 0.2),
    uFlash: { value: 0 }, uFlashP: { value: new THREE.Vector2() }, uFlashCol: C(0.8, 0.85, 1), uHazeC: C(0.5, 0.5, 0.5), uHazeK: { value: 0 },
  };
  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: u, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  mesh.frustumCulled = false;
  mesh.renderOrder = order;
  scene.add(mesh);
  return { mesh, u };
}

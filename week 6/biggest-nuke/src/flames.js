// Fire for the things close to you (stalls, awnings, windows, cars, the billboard, the helicopter). Each one is an upright
// camera-facing card whose shader draws a cluster of tongues as a moving height-field: the flame's top is ragged and
// licks upward, the sides fade to nothing well inside the card (no edge or corner of the card ever shows), the base burns
// yellow-white, the tips orange and red, and dark smoke rolls off the top. Every flame has its own width, height and
// timing. Filled every frame: flames.begin(v); flames.add(x, y, z, size, strength, seed, wide, tall); flames.end().
// (x, y, z) is the foot of the flame; the fire is about size * wide across and size * tall high, the smoke above it as much again.
import * as THREE from 'three';

export function makeFlames(scene, max = 700) {
  const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const aC = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);   // foot xyz, size
  const aK = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);   // strength, seed, wide, tall
  geo.setAttribute('aC', aC); geo.setAttribute('aK', aK);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    // (premultiplied: flame over flame stays flame-coloured, and the smoke darkens what is behind it)
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: /* glsl */ `attribute vec4 aC; attribute vec4 aK; varying vec2 vUv; varying vec4 vK;
      void main() {
        vUv = uv; vK = aK;
        vec3 to = cameraPosition - aC.xyz;
        vec3 right = normalize(vec3(to.z, 0.0, -to.x));
        // the card is wider than the fire and twice as tall: the smoke lives in the top half
        vec3 w = aC.xyz + right * position.x * aC.w * aK.z * 1.5 + vec3(0.0, position.y * aC.w * aK.w * 2.0, 0.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */ `uniform float uTime; varying vec2 vUv; varying vec4 vK;
      float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n3(p); p = p * 2.07 + 1.3; a *= 0.5; } return s; }
      void main() {
        float seed = vK.y;
        float t = uTime * (0.85 + 0.4 * fract(seed * 7.3)) + seed * 31.0;
        // x: -1.5 .. 1.5 across the card (the fire stays inside -1 .. 1); y: 0 .. 2 up it (fire below ~1, smoke above)
        float x0 = (vUv.x - 0.5) * 3.0, y = vUv.y * 2.0;
        // the whole flame sways, more the higher it goes
        float x = x0 + (n3(vec3(y * 0.9 - t * 0.55, seed * 13.0, t * 0.2)) - 0.5) * 0.7 * y;
        // the tongues: a ragged top that runs up through the flame, several to a flame, of different heights
        float side = clamp(1.0 - x * x, 0.0, 1.0);
        float tongues = fbm(vec3(x * 2.4 + seed * 7.0, -t * 1.1, seed * 3.0));
        float top = pow(side, 0.75) * (0.3 + 0.95 * tongues);
        float lick = fbm(vec3(x * 3.4, y * 2.6 - t * 2.4, seed * 5.0));
        float lick2 = n3(vec3(x * 8.0, y * 7.0 - t * 4.6, seed * 2.0));
        float edge = top - y + (lick - 0.5) * 0.55 * (0.25 + y) + (lick2 - 0.5) * 0.12;
        // (a ragged foot too: no straight line along the bottom)
        float f = smoothstep(0.0, 0.22, edge) * smoothstep(0.0, 0.2, y - 0.16 * fbm(vec3(x * 4.0, t * 0.7, seed * 9.0)) + 0.04);
        // (blobs that break off the tips and fade on the way up)
        float blob = smoothstep(0.62, 0.8, lick) * smoothstep(top + 0.35, top, y) * step(top, y) * side;
        f = max(f, blob * 0.7);
        // colour: yellow-white deep in the base, orange, red at the tips
        float depth = clamp(edge / max(top, 0.08), 0.0, 1.0);
        float base = 1.0 - smoothstep(0.0, 0.55, y / max(top, 0.1));
        vec3 c = mix(vec3(0.45, 0.04, 0.008), vec3(1.35, 0.3, 0.025), smoothstep(0.0, 0.3, depth));
        c = mix(c, vec3(2.0, 0.85, 0.16), smoothstep(0.3, 0.75, depth));
        c = mix(c, vec3(2.5, 1.5, 0.5), smoothstep(0.55, 1.0, depth) * base);
        float flick = 0.82 + 0.18 * sin(t * 9.0 + seed * 20.0) * sin(t * 5.7 + 1.0);
        // the smoke: dark, rolling, widening as it rises off the top of the fire
        float sy = y - top * 0.85;
        float spread = 0.55 + 0.45 * clamp(sy, 0.0, 1.5);
        float sn = fbm(vec3(x * 1.4 / spread + seed * 4.0, y * 1.3 - t * 0.5, seed * 2.0));
        float sm = smoothstep(0.0, 0.35, sy) * (1.0 - smoothstep(0.7, 1.15, y * 0.5 + sy * 0.25))
                 * clamp(1.0 - (x * x) / (spread * spread), 0.0, 1.0) * smoothstep(0.3, 0.6, sn) * 1.1;
        // nothing reaches the card's edges
        float win = smoothstep(1.5, 1.05, abs(x0)) * smoothstep(2.0, 1.6, y);
        float k = min(vK.x, 1.0);
        float a = f * k * win;
        float sa = sm * k * win * (1.0 - a);
        gl_FragColor = vec4(c * flick * a + vec3(0.045, 0.034, 0.028) * sa, min(a * 0.95 + sa, 1.0));
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false; mesh.renderOrder = 7;
  scene.add(mesh);
  let n = 0;
  return {
    mat,
    begin(v) { n = 0; mat.uniforms.uTime.value = v; },
    add(x, y, z, size, k, seed, wide = 1, tall = 1) {
      if (n >= max || k < 0.01 || size <= 0) return;
      aC.setXYZW(n, x, y, z, size); aK.setXYZW(n, k, seed, wide, tall); n++;
    },
    end() { mesh.count = n; aC.needsUpdate = true; aK.needsUpdate = true; },
  };
}

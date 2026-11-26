// The sky dome: a gradient (zenith -> horizon), a glow round the Sun, the Sun's disc, the Moon, and a cloud deck with
// strong lit/dark contrast (so it never reads as flat haze). Every colour is a uniform: main.js sets each stop's look.
import * as THREE from 'three';

export function makeSky() {
  const uniforms = {
    uTop: { value: new THREE.Color(0.1, 0.3, 0.8) }, uHor: { value: new THREE.Color(0.6, 0.75, 0.95) },
    uBelow: { value: new THREE.Color(0.3, 0.3, 0.3) },
    uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunC: { value: new THREE.Color(1, 0.9, 0.7) }, uSunK: { value: 1 }, uSunR: { value: 0.012 },
    uGlowC: { value: new THREE.Color(1, 0.8, 0.5) }, uGlowK: { value: 0.4 },
    uMoon: { value: new THREE.Vector3(0, 0.3, -1).normalize() }, uMoonK: { value: 0 }, uMoonR: { value: 0.03 },
    uCloud: { value: 0.3 }, uCloudLit: { value: new THREE.Color(1, 1, 1) }, uCloudDark: { value: new THREE.Color(0.5, 0.55, 0.65) },
    uCloudH: { value: 0.35 }, uTime: { value: 0 }, uSeed: { value: 0 }, uStars: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHor, uBelow, uSun, uSunC, uGlowC, uMoon, uCloudLit, uCloudDark;
      uniform float uSunK, uSunR, uGlowK, uMoonK, uMoonR, uCloud, uCloudH, uTime, uSeed, uStars;
      varying vec3 vDir;
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i), h2(i + vec2(1,0)), f.x), mix(h2(i + vec2(0,1)), h2(i + vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * n2(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vDir);
        float el = d.y;
        vec3 col = mix(uHor, uTop, pow(clamp(el, 0.0, 1.0), 0.55));
        col = mix(col, uBelow, smoothstep(0.0, -0.08, el));
        float sd = max(dot(d, normalize(uSun)), 0.0);
        col += uGlowC * uGlowK * (pow(sd, 8.0) * 0.6 + pow(sd, 64.0) * 0.8) * smoothstep(-0.1, 0.05, el);
        // stars (blue hour)
        if (uStars > 0.0 && el > 0.05) {
          vec2 sp = d.xz / (d.y + 0.3) * 260.0;
          float st = step(0.996, h2(floor(sp))) * smoothstep(0.5, 0.0, length(fract(sp) - 0.5));
          col += vec3(0.8, 0.85, 1.0) * st * uStars * smoothstep(0.05, 0.4, el);
        }
        // the Moon: a lit disc with darker maria
        float md = acos(clamp(dot(d, normalize(uMoon)), -1.0, 1.0));
        if (uMoonK > 0.0) {
          float disc = smoothstep(uMoonR, uMoonR * 0.94, md);
          vec2 mp = vec2(dot(d, normalize(cross(uMoon, vec3(0,1,0)))), d.y - normalize(uMoon).y) / uMoonR;
          float maria = smoothstep(0.45, 0.7, n2(mp * 2.2 + 3.0)) * 0.35;
          col = mix(col, vec3(1.0, 0.97, 0.9) * (1.0 - maria) * uMoonK, disc);
          col += vec3(0.6, 0.7, 1.0) * uMoonK * 0.25 * exp(-md / (uMoonR * 3.0));
        }
        // clouds: a deck seen in perspective, lit on the Sun side
        if (uCloud > 0.0 && el > 0.0) {
          vec2 cp = d.xz / (el + 0.08) * 1.4 + vec2(uTime * 0.01, uSeed);
          float c = fbm(cp) + 0.25 * fbm(cp * 3.0 + 4.0);
          float cov = smoothstep(1.0 - uCloud, 1.0 - uCloud + uCloudH, c * 0.85);
          float lit = clamp(0.5 + 0.9 * (fbm(cp + normalize(uSun).xz * 0.35) - c) + 0.5 * pow(sd, 3.0), 0.0, 1.0);
          vec3 cc = mix(uCloudDark, uCloudLit, lit);
          col = mix(col, cc, cov * smoothstep(0.0, 0.06, el));
        }
        // the Sun's disc
        float sa = acos(clamp(dot(d, normalize(uSun)), -1.0, 1.0));
        col += uSunC * uSunK * smoothstep(uSunR, uSunR * 0.8, sa);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

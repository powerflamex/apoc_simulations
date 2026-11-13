// The background round the camera: a big sphere drawn behind everything. Each world sets its colours: the sky
// (top, horizon, below), a sun glow and soft clouds (the park and the grass), or a coloured haze (inside the body
// and smaller), with slow drifting blotches so it never reads as a flat card.
import * as THREE from 'three';

export function makeSky() {
  const uniforms = {
    uTop: { value: new THREE.Color(0.18, 0.42, 0.85) }, uHor: { value: new THREE.Color(0.75, 0.86, 0.97) },
    uLow: { value: new THREE.Color(0.35, 0.45, 0.3) }, uSun: { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() },
    uSunC: { value: new THREE.Color(1.0, 0.95, 0.85) }, uSunI: { value: 1.0 }, uSunS: { value: 0.9995 },
    uCloud: { value: 0.5 }, uBlot: { value: 0.0 }, uBlotC: { value: new THREE.Color(1, 1, 1) }, uT: { value: 0 },
    uHorY: { value: 0.0 }, uHorW: { value: 0.18 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHor, uLow, uSun, uSunC, uBlotC; uniform float uSunI, uSunS, uCloud, uBlot, uT, uHorY, uHorW;
      varying vec3 vDir;
      float h(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
      void main(){
        vec3 d = normalize(vDir);
        float y = d.y - uHorY;
        vec3 col = y > 0.0 ? mix(uHor, uTop, pow(smoothstep(0.0, 1.0, y), 0.6)) : mix(uHor, uLow, smoothstep(0.0, uHorW, -y));
        // clouds: soft fbm puffs in the upper sky
        if (uCloud > 0.0 && y > 0.0) {
          vec2 q = d.xz / (d.y + 0.15) * 1.6 + vec2(uT * 0.01, 0.0);
          float c = smoothstep(0.52, 0.85, fbm(vec3(q, 0.3)));
          col = mix(col, vec3(1.0, 1.0, 1.02), c * uCloud * smoothstep(0.0, 0.25, y));
        }
        // a drifting haze of blotches (the fluid inside the body; the micro worlds)
        if (uBlot > 0.0) {
          float b = fbm(d * 3.0 + vec3(0.0, uT * 0.03, uT * 0.02));
          col = mix(col, uBlotC, smoothstep(0.35, 0.8, b) * uBlot);
        }
        float sd = dot(d, uSun);
        col += uSunC * uSunI * (smoothstep(uSunS, 1.0, sd) * 6.0 + pow(max(sd, 0.0), 24.0) * 0.5 + pow(max(sd, 0.0), 4.0) * 0.12);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

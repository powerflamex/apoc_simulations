// The frost front: a towering wall of white mist rolling up the avenue from the sea at 125 mph, its face boiling, lit by
// the sun behind you; rime runs over the street a few metres ahead of it (ground.js). Drawn as ten stacked sheets of
// shader cloud across the whole city (cheap, and it reads as one thick bank); each fades as it nears the lens, so the
// moment it reaches you is a white-out of crystals rather than a cut. Rolling puffs along its foot are smoke puffs.
import * as THREE from 'three';

const NS = 10, GAP = 6.5;

export function makeWall(scene) {
  const uniforms = { uTime: { value: 0 }, uZ: { value: -200 }, uSun: { value: new THREE.Vector3(0.3, 0.6, 0.7) }, uCamZ: { value: 8 } };
  const sheets = [];
  for (let k = 0; k < NS; k++) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...uniforms, uK: { value: k }, uGY: { value: 0 } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uZ; uniform vec3 uSun; uniform float uCamZ; uniform float uK; uniform float uGY;
        varying vec3 vW;
        float h12(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h12(i), h12(i + vec2(1, 0)), f.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), f.x), f.y); }
        float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.07 + 1.3; a *= 0.5; } return s; }
        void main() {
          float x = vW.x, y = vW.y - uGY;           // (height over the street under this sheet)
          float k = uK;
          // the top: a skyline of rounded cloud heads (cauliflower), lowest at the sides of the view
          float cl = 0.0, amp = 1.0; vec2 cp = vec2(x * 0.022 + k * 0.53, uTime * 0.05 + k * 0.7);
          for (int i = 0; i < 3; i++) { float nn = abs(2.0 * n2(cp) - 1.0); nn = 1.0 - (1.0 - nn) * (1.0 - nn); cl += amp * nn; cp = cp * 2.3 + 3.7; amp *= 0.45; }
          float top = 40.0 + 18.0 * fbm(vec2(x * 0.004 + k * 0.21, k * 0.9)) + 22.0 * cl - 0.00002 * x * x - k * 2.0;
          float body = smoothstep(top + 0.8, top - 2.5, y);
          // billows all over the face: rounded heads with dark creases, rolling down toward you
          vec2 q = vec2(x * 0.045, y * 0.05 - uTime * 0.45) + k * 3.1;
          float bl = 0.0, am = 1.0; vec2 qq = q;
          for (int i = 0; i < 3; i++) { float nn = abs(2.0 * n2(qq) - 1.0); nn = 1.0 - (1.0 - nn) * (1.0 - nn); bl += am * nn; qq = qq * 2.2 + 1.9; am *= 0.5; }
          bl /= 1.75;
          float n = fbm(q * 0.7);
          float dens = body * smoothstep(0.15, 0.45, bl * 0.6 + n * 0.4 + 0.35 * smoothstep(top, top * 0.3, y));
          // nearest sheets thin out as they reach you; the far ones are thick
          float dz = uCamZ - vW.z;
          float a = dens * (k < 0.5 ? 0.97 : 0.88) * smoothstep(3.0, 26.0, dz) * smoothstep(4.0, 34.0, uCamZ - uZ);
          // the sun is behind you and high: the heads glow white, the creases are icy blue
          float lit = smoothstep(0.3, 0.85, bl) * (0.75 + 0.25 * smoothstep(0.0, top, y));
          vec3 c = mix(vec3(0.42, 0.54, 0.7), vec3(1.06, 1.08, 1.12), lit);
          c += vec3(0.18) * smoothstep(top - 6.0, top - 0.5, y);
          // ice crystals glittering in it
          vec2 gc = floor(vW.xy * 4.0);
          c += vec3(1.2, 1.3, 1.5) * step(0.996, h12(gc + k * 7.0)) * (0.5 + 0.5 * sin(uTime * 9.0 + h12(gc) * 30.0)) * body * 0.8;
          gl_FragColor = vec4(c, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1400, 170).translate(0, 75, 0), mat);
    m.frustumCulled = false;
    m.renderOrder = 4 + (NS - k) * 0.01;
    scene.add(m);
    sheets.push(m);
  }
  return {
    frame(v, z, camZ, sun, groundY) {
      uniforms.uTime.value = v; uniforms.uZ.value = z; uniforms.uCamZ.value = camZ; uniforms.uSun.value.copy(sun);
      sheets.forEach((m, k) => {
        const zk = z - k * GAP;
        const gy = groundY(zk);
        m.position.set(0, gy, zk);
        m.material.uniforms.uGY.value = gy;
        m.visible = zk < camZ + 1 && zk > -600;
        // (drawn far to near)
        m.renderOrder = 4 + (camZ - zk) * -0.0001 + 1;
      });
    },
  };
}

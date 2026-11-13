// The night sky over the harbour: deep blue overhead, the city's orange glow along the horizon, stars, a faint Milky
// Way. The fireballs light it: each one brightens the sky round itself and turns the whole sky a little bluer (the big
// one turns night into day). The impact: a white dome rising from behind the skyline. A dome that follows the camera.
import * as THREE from 'three';

export const NL = 4;
export function makeSky() {
  const uniforms = {
    uTime: { value: 0 },
    uL: { value: Array.from({ length: NL }, () => new THREE.Vector4(0, 1, 0, 0)) },   // light dirs + strength
    uImpDir: { value: new THREE.Vector3(0, 0, -1) }, uImp: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec4 uL[${NL}]; uniform vec3 uImpDir; uniform float uImp;
      varying vec3 vD;
      float h12(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h12(i), h12(i + vec2(1, 0)), f.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec3 d = normalize(vD);
        float y = d.y;
        float el = max(y, 0.0);
        vec3 c = mix(vec3(0.045, 0.05, 0.085), vec3(0.012, 0.02, 0.058), smoothstep(0.0, 0.6, el));
        // the city's glow along the horizon (sodium orange, fading upward)
        c += vec3(0.11, 0.065, 0.035) * exp(-el / 0.07) + vec3(0.02, 0.018, 0.03) * exp(-el / 0.25);
        if (y > -0.02) {
          // stars (dimmed low down by the glow), and a faint Milky Way band
          vec2 sc = d.xz / (el + 0.35) * 380.0;
          vec2 id = floor(sc);
          float st = step(0.9965, h12(id)) * h12(id + 7.0);
          float tw = 0.75 + 0.25 * sin(uTime * (3.0 + 4.0 * h12(id + 3.0)) + h12(id) * 30.0);
          vec2 fp = fract(sc) - 0.5;
          c += vec3(0.85, 0.9, 1.0) * st * tw * exp(-dot(fp, fp) * 18.0) * 0.9 * smoothstep(0.04, 0.3, el);
          vec3 mw = normalize(vec3(0.55, 0.35, 0.76));
          float band = exp(-pow(dot(d, mw) / 0.16, 2.0));
          c += vec3(0.03, 0.032, 0.04) * band * (0.5 + 0.5 * n2(d.xz * 9.0 + d.y * 4.0)) * smoothstep(0.05, 0.4, el);
        }
        // the fireballs' light: a glow round each, and the whole sky lifting toward a lit blue
        vec3 lift = vec3(0.0);
        for (int i = 0; i < ${NL}; i++) {
          vec4 L = uL[i];
          if (L.w <= 0.0) continue;
          float ca = max(dot(d, L.xyz), -1.0);
          float ang = acos(clamp(ca, -1.0, 1.0));
          c += vec3(0.9, 0.95, 1.0) * L.w * (0.04 * exp(-ang / 0.05) + 0.012 * exp(-ang / 0.3));
          lift += vec3(0.07, 0.13, 0.27) * L.w * 0.07;
        }
        c += lift * (0.55 + 0.45 * smoothstep(-0.05, 0.5, y)) + lift * vec3(0.6, 0.4, 0.2) * exp(-el / 0.12) * 0.5;
        // the impact: a white dome rising from behind the skyline
        if (uImp > 0.0) {
          float ang = acos(clamp(dot(d, uImpDir), -1.0, 1.0));
          c += vec3(1.0, 0.92, 0.75) * uImp * (6.0 * exp(-ang / (0.06 + 0.5 * uImp)) + 0.8);
        }
        if (y < -0.02) c *= 0.5;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

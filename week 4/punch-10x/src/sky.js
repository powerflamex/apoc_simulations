// The sky from wherever the camera is: a clear late-afternoon sky over the city (pale and warm low toward the
// Sun, deep blue overhead), draining to black with stars as the camera climbs out of the air; a dome that follows
// the camera, drawn first. The Sun's disc itself is a real ball (earth.js); this draws the glare round it.
import * as THREE from 'three';

export function makeSky() {
  const uniforms = {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uAlt: { value: 0 }, uDip: { value: 0 }, uPx: { value: 0.001 }, uTime: { value: 0 },
    uDust: { value: 0 }, uSpace: { value: 0 }, uGlare: { value: 1 }, uSunAng: { value: 0.0046 }, uHell: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir; uniform float uAlt; uniform float uDip; uniform float uPx; uniform float uTime; uniform float uDust; uniform float uSpace;
      uniform float uGlare; uniform float uSunAng; uniform float uHell;
      varying vec3 vD;
      float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      vec3 stars(vec3 d) {
        vec3 s = vec3(0.0);
        for (int k = 0; k < 3; k++) {
          float sc = k == 0 ? 160.0 : k == 1 ? 380.0 : 800.0;
          vec3 p = d * sc;
          vec3 i = floor(p);
          float h = hash13(i + float(k) * 13.1);
          if (h > (k == 0 ? 0.95 : k == 1 ? 0.95 : 0.93)) {
            vec3 c = i + 0.5 + (vec3(hash13(i + 1.3), hash13(i + 2.7), hash13(i + 4.1)) - 0.5) * 0.7;
            float dd = length(p - c) / sc;
            float sz = uPx * 0.8;
            float b = pow(hash13(i + 9.9), 5.0) * 5.0 + 0.3;
            vec3 tint = mix(vec3(1.0, 0.82, 0.65), vec3(0.72, 0.84, 1.0), hash13(i + 5.5));
            s += tint * b * exp(-dd * dd / (sz * sz)) * (k == 2 ? 0.6 : 1.0);
          }
        }
        // the Milky Way: a faint band of haze
        vec3 ax = normalize(vec3(0.35, 0.55, -0.76));
        float band = exp(-pow(dot(d, ax) / 0.16, 2.0));
        float m = hash13(floor(d * 90.0)) * 0.5 + hash13(floor(d * 33.0)) * 0.5;
        s += vec3(0.5, 0.45, 0.4) * band * (0.025 + 0.03 * m);
        return s;
      }
      void main() {
        vec3 d = normalize(vD);
        float air = exp(-uAlt / 14000.0) * (1.0 - uSpace);
        float h = d.y + uDip;                              // height above the (dipping) horizon
        float cs = dot(d, uSunDir);
        // golden hour from the ground: deep blue overhead, warm gold low toward the Sun, pink-violet haze opposite
        float csH = dot(normalize(vec3(d.x, 0.0, d.z) + 1e-6), normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + 1e-6));
        vec3 zen = vec3(0.12, 0.25, 0.58);
        vec3 hor = mix(vec3(0.72, 0.66, 0.74), vec3(1.25, 0.82, 0.48), pow(max(csH, 0.0), 2.0));
        vec3 sky = mix(hor, zen, pow(smoothstep(-0.02, 0.55, h), 0.55));
        sky += vec3(1.3, 0.72, 0.35) * pow(max(cs, 0.0), 5.0) * 0.6 * exp(-max(h, 0.0) * 2.5);
        // below the horizon: the haze over the far land
        sky = mix(sky, vec3(0.55, 0.5, 0.5), smoothstep(0.0, -0.05, h));
        // climbing: the blue drains away overhead; a thin bright band stays on the horizon
        float limb = exp(-pow(max(h, 0.0) / (0.015 + 0.25 * air), 1.2)) * smoothstep(-0.03, 0.0, h);
        vec3 band = vec3(0.3, 0.5, 1.0) * 0.9;
        sky = mix(band * limb * (1.0 - uSpace), sky, air);
        // stars once the sky is dark enough
        float dark = 1.0 - smoothstep(0.03, 0.25, dot(sky, vec3(0.33)));
        sky += stars(d) * dark * smoothstep(-0.02, 0.04, h + uSpace * 2.0) * smoothstep(40000.0, 90000.0, uAlt + uSpace * 1e6);
        // the Sun's glare (in air: a wide warm aureole; in space: a tight white bloom)
        // (sized from the Sun's own angular radius, so a long lens doesn't turn it into a white-out)
        float th = sqrt(max(2.0 * (1.0 - cs), 0.0));
        float a = max(uSunAng, 1e-6);
        float g = exp(-pow(th / (1.3 * a), 2.0)) * 0.8 + exp(-pow(th / (3.2 * a), 2.0)) * 0.12 + pow(max(cs, 0.0), 160.0) * 0.5 * air;
        sky += vec3(1.0, 0.92, 0.8) * g * uGlare;
        sky = mix(sky, vec3(0.5, 0.47, 0.42), uDust * air * 0.5);
        // under the burning dust after the big blasts: glowing orange low down, near black overhead
        sky = mix(sky, mix(vec3(0.75, 0.26, 0.08), vec3(0.07, 0.03, 0.025), smoothstep(-0.04, 0.45, h)), uHell);
        gl_FragColor = vec4(sky, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

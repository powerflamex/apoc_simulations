// The one cutaway (1.4 s, 2 minutes before it would touch): Earth from space, stretched toward the planet like an egg,
// its near end glowing with cracks and pouring a stream of molten rock across the gap; the planet's face fills the top
// of the frame. Units: 1 = 1,000 km. Earth at the origin, the planet straight "up" (+y) at its real distance.
import * as THREE from 'three';
import { PLANET_GLSL } from './sky.js';
import { makeGlows } from './glows.js';
import { rng } from './util.js';

export function makeSpace(skyU) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1080 / 1920, 0.5, 5000);
  const loader = new THREE.TextureLoader();
  const load = (f) => new Promise((res) => loader.load(f, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; res(t); }, undefined, () => res(null)));
  const U = {
    uDay: { value: null }, uNight: { value: null }, uSun: { value: new THREE.Vector3(-0.75, -0.3, 0.6).normalize() },
    uTime: skyU.uTime, uStretch: { value: 0.3 }, uRot: skyU.uRot, uStorm: skyU.uStorm, uAxis: { value: new THREE.Vector3(0.25, 0.1, 1).normalize() },
  };
  const ready = Promise.all([load('textures/earth_day.jpg'), load('textures/earth_night.jpg')]).then(([d, n]) => { U.uDay.value = d; U.uNight.value = n; });
  // Earth, stretched along +y toward the planet (more on the near side)
  const earthMat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */ `uniform float uStretch; varying vec2 vUv; varying vec3 vN; varying vec3 vP; varying float vTip;
      void main(){
        vUv = uv; vec3 p = position;
        float k = p.y / 6.371;
        p.y *= 1.0 + uStretch * (0.55 + 0.75 * max(k, 0.0));
        p.xz *= 1.0 - uStretch * 0.22;
        vTip = smoothstep(0.2, 1.0, k);
        vN = normalize(normalMatrix * normalize(vec3(position.x, position.y / (1.0 + uStretch), position.z)));
        vP = (modelMatrix * vec4(p, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `uniform sampler2D uDay; uniform sampler2D uNight; uniform vec3 uSun; uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vP; varying float vTip;
      ${PLANET_GLSL}
      void main(){
        vec3 N = normalize(vN);
        vec3 Nw = normalize(vP);
        float mu = dot(Nw, uSun);
        vec3 day = texture2D(uDay, vUv).rgb, night = texture2D(uNight, vUv).rgb;
        // lit by the Sun, and by the planet above (tan light on the near half)
        vec3 c = day * (max(mu, 0.0) * 1.3 + vec3(1.0, 0.82, 0.62) * max(Nw.y, 0.0) * 0.9);
        c += night * vec3(1.0, 0.8, 0.55) * 1.4 * smoothstep(0.1, -0.2, mu) * (1.0 - vTip);
        // the near end tearing: glowing cracks, then all molten at the tip
        float cr = fbm(Nw * 9.0 + uTime * 0.05, 5);
        float crack = smoothstep(0.035, 0.0, abs(cr - 0.5)) * smoothstep(0.0, 0.5, vTip);
        c += vec3(2.6, 0.8, 0.18) * (crack + smoothstep(0.8, 1.0, vTip) * 0.35);
        // the thin blue air on the limb
        c += vec3(0.2, 0.4, 1.0) * pow(1.0 - abs(dot(N, vec3(0.0, 0.0, 1.0))), 3.0) * 0.5 * (0.3 + max(mu, 0.0));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(6.371, 96, 64), earthMat);
  earth.rotation.set(0.3, 2.2, 0.15);
  scene.add(earth);
  // the planet: 69,911 km radius, centre 84,000 km away (2 minutes out), straight up
  const PD = 84;
  const planetMat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */ `varying vec3 vN; void main(){ vN = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform vec3 uSun; uniform float uTime; uniform float uRot; uniform vec3 uAxis; varying vec3 vN;
      ${PLANET_GLSL}
      void main(){
        vec3 N = normalize(vN);
        vec3 ax = normalize(cross(uAxis, vec3(1.0, 0.0, 0.0)));
        vec3 q = vec3(dot(N, ax), dot(N, cross(uAxis, ax)), dot(N, uAxis));
        vec3 alb = planetClouds(q, uRot, 1.0, uTime);
        float mu = dot(N, uSun);
        vec3 c = alb * smoothstep(-0.06, 0.22, mu) * (0.2 + 0.9 * max(mu, 0.0)) * 0.75;
        c += vec3(0.45, 0.58, 0.85) * pow(1.0 - abs(N.z), 4.0) * smoothstep(-0.2, 0.4, mu) * 0.6;
        // Earth's light and the glow of the stream on its underside
        c += vec3(1.2, 0.4, 0.1) * exp(-pow(length(N.xz) / 0.08, 2.0)) * smoothstep(-0.9, -1.0, N.y) * 0.8;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const planet = new THREE.Mesh(new THREE.SphereGeometry(69.911, 160, 96), planetMat);
  planet.position.set(0, PD, 0);
  scene.add(planet);
  // stars
  {
    const R = rng(77), n = 1600, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = R() * 2 - 1, a = R() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      pos.set([Math.cos(a) * r * 3000, u * 3000, Math.sin(a) * r * 3000], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 2.2, sizeAttenuation: false })));
  }
  // the stream of molten rock from the near end across the gap (glows; positions fixed per piece, flowing up)
  const glows = makeGlows(scene, 3000);
  const R = rng(99);
  const bits = Array.from({ length: 2200 }, () => ({ u: R(), a: R() * Math.PI * 2, r: R(), s: 0.05 + R() * 0.25, k: R() }));
  return {
    scene, camera, ready,
    frame(v, k) {
      // k: 0..1 through the cutaway
      U.uStretch.value = 0.3 + 0.05 * k;
      // Earth low in the frame (under the caption), the gap and the stream across the middle, the planet on top
      camera.position.set(-7 + 3 * k, 5.0 + 1.0 * k, 58 - 5 * k);
      camera.lookAt(0, 17.0 + 0.5 * k, 0);
      camera.updateMatrixWorld();
      glows.begin(camera);
      for (const b of bits) {
        const t = (b.u + v * 0.35) % 1;
        const y = 7.5 + t * 7.2;
        const rad = (0.4 + 3.2 * t * t) * b.r;
        const x = Math.cos(b.a + t * 2.0) * rad, z = Math.sin(b.a + t * 2.0) * rad;
        const hot = 1 - t * 0.6;
        glows.add(x, y, z, b.s * (1 + t), 1.6 * hot, 0.5 * hot * hot, 0.12 * hot * hot);
      }
      glows.end();
    },
  };
}

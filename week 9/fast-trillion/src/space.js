// The ending: at light speed you go round the Earth 7.5 times a second, every metre of your track hit again every
// 0.13 s with ~35 megatons per metre (rho A (gamma - 1) c^2 at 0.995 c), so the whole track is one ring of burning
// air round the planet. The camera pulls back from you into space to show it: the Earth (NASA's maps), its night
// lights, a thin atmosphere, and the ring (turned so it runs down through Europe and Africa: a meridian, 20 E) (the great circle your path follows: the plane x = 0 in render space,
// through you at the top of the planet), its glow drawn wider than the real ~40 km so it reads from far away.
// Spreading from it over the 3 s: shock clouds (the blast of ~20 passes, 3e18 J per metre: R = (E'/rho)^(1/4) sqrt(t)
// ~70 km at 3 s, drawn out to ~200 km) and a belt of fires lit by its heat across the land on both sides (radiation
// reaches everything in sight of the fireball rising off the track: ~1,000 km within seconds).
import * as THREE from 'three';
import { R_EARTH } from './timeline.js';
import { SEA_Y } from './avenue.js';

export const EARTH_C = new THREE.Vector3(0, SEA_Y - R_EARTH, 0);

export async function makeSpace(scene) {
  const loader = new THREE.TextureLoader();
  const load = async (f) => { const t = await loader.loadAsync(f); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  const [dayT, nightT, cloudT] = await Promise.all([load('textures/earth_day.jpg'), load('textures/earth_night.jpg'), load('textures/earth_clouds.jpg')]);
  const SUN = new THREE.Vector3(0.75, 0.45, 0.5).normalize();
  const earthMat = new THREE.ShaderMaterial({
    uniforms: { tDay: { value: dayT }, tNight: { value: nightT }, tCloud: { value: cloudT }, uSun: { value: SUN }, uRing: { value: 0 }, uRot: { value: 0.306 }, uAge: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){ vUv = uv; vN = normalize(position); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform sampler2D tDay; uniform sampler2D tNight; uniform sampler2D tCloud; uniform vec3 uSun; uniform float uRing; uniform float uRot; uniform float uAge;
      varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      float h3(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
      void main(){
        vec2 uv = vec2(fract(vUv.x + uRot), vUv.y);
        vec3 day = texture2D(tDay, uv).rgb, night = texture2D(tNight, uv).rgb;
        float cl = texture2D(tCloud, uv).r;
        vec3 nn = normalize(vN);
        float l = dot(nn, uSun);
        float lit = smoothstep(-0.08, 0.2, l);
        vec3 col = mix(night * 0.9, mix(day, vec3(1.0), cl * 0.8) * (0.25 + 0.9 * max(l, 0.0)), lit);
        float landK = smoothstep(-0.01, 0.07, max(day.r, day.g) - day.b);
        // your track round the Earth (the plane x = 0), d = how far from it (1 = one Earth radius, 0.01 = 64 km)
        float d = abs(nn.x);
        float e = smoothstep(0.0, 3.0, uAge);
        float nz = n3(nn * 40.0) * 0.6 + n3(nn * 110.0) * 0.4;
        // the fires its heat sets across the land: out to ~1,000 km within seconds (line of sight to the rising fireball)
        float wi = 0.035 + 0.13 * e;
        float ign = (1.0 - smoothstep(wi * (0.7 + 0.3 * nz), wi, d)) * uRing;
        float fl = smoothstep(0.5, 0.72, n3(nn * 120.0) * 0.7 + nz * 0.3);
        col = mix(col, col * vec3(0.35, 0.3, 0.28), ign * landK * 0.8);
        col += vec3(2.2, 0.7, 0.12) * fl * ign * landK * (0.9 + 1.0 * (1.0 - lit));
        // the sea flashing to steam near the track
        col = mix(col, vec3(0.8, 0.8, 0.82) * (0.35 + 0.65 * lit), (1.0 - landK) * ign * 0.35 * smoothstep(0.4, 0.8, nz));
        // shock clouds billowing out from the track
        float ws = 0.01 + 0.022 * e;
        float shock = (1.0 - smoothstep(ws * (0.6 + 0.4 * nz), ws * (1.05 + 0.2 * nz), d)) * uRing;
        col = mix(col, mix(vec3(0.45, 0.42, 0.4), vec3(0.95, 0.92, 0.88), lit) * (0.8 + 0.3 * nz), shock * 0.85);
        // the burning band and the core of the ring
        float band = 1.0 - smoothstep(0.004, 0.016, d), core = 1.0 - smoothstep(0.0015, 0.005, d);
        col += vec3(2.6, 0.95, 0.22) * band * uRing * (0.8 + 0.4 * nz);
        col += vec3(3.4, 2.6, 1.6) * core * uRing * 2.0;
        vec3 V = normalize(cameraPosition - vW);
        float rim = pow(1.0 - max(dot(nn, V), 0.0), 3.0);
        col += vec3(0.25, 0.45, 0.9) * rim * (0.3 + 0.7 * lit);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(R_EARTH, 192, 96), earthMat);
  earth.position.copy(EARTH_C);
  earth.frustumCulled = false;
  scene.add(earth);
  // the ring's glow: a torus of burning air round the great circle
  const glowMat = new THREE.ShaderMaterial({
    uniforms: { uA: { value: 0 }, uT: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; varying vec3 vO;
      void main(){ vO = position; vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform float uA; uniform float uT; varying vec3 vN; varying vec3 vV; varying vec3 vO;
      void main(){
        float f = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
        float flick = 0.85 + 0.15 * sin(atan(vO.y, vO.z) * 40.0 + uT * 30.0);
        gl_FragColor = vec4(vec3(3.0, 1.25, 0.35) * f * uA * flick, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R_EARTH + 20000, 75000, 16, 512).rotateY(Math.PI / 2), glowMat);
  ring.position.copy(EARTH_C);
  ring.frustumCulled = false; ring.renderOrder = 8;
  scene.add(ring);
  // a thin blue atmosphere round the planet
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(R_EARTH * 1.018, 96, 48), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV; void main(){ float r = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 4.0); gl_FragColor = vec4(vec3(0.3, 0.55, 1.0) * r * 0.9, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  }));
  atmo.position.copy(EARTH_C); atmo.frustumCulled = false;
  scene.add(atmo);
  const parts = [earth, ring, atmo];
  return {
    parts, earthMat, glowMat, SUN,
    frame(v, on, ringK) {
      for (const p of parts) p.visible = on;
      earthMat.uniforms.uRing.value = ringK; earthMat.uniforms.uAge.value = Math.max(0, v - 40.45);
      glowMat.uniforms.uA.value = ringK; glowMat.uniforms.uT.value = v;
    },
  };
}

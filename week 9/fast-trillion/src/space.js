// The ending: at light speed you go round the Earth 7.5 times a second, every metre of your track hit again every
// 0.13 s with ~35 megatons per metre (rho A (gamma - 1) c^2 at 0.995 c), so the whole track is one ring of burning
// air round the planet. The camera pulls back from you into space to show it: the Earth (NASA's maps), its night
// lights, a thin atmosphere, and the ring (the great circle your path follows: the plane x = 0 in render space,
// through you at the top of the planet), its glow drawn wider than the real ~40 km so it reads from far away.
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
    uniforms: { tDay: { value: dayT }, tNight: { value: nightT }, tCloud: { value: cloudT }, uSun: { value: SUN }, uRing: { value: 0 }, uRot: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){ vUv = uv; vN = normalize(position); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform sampler2D tDay; uniform sampler2D tNight; uniform sampler2D tCloud; uniform vec3 uSun; uniform float uRing; uniform float uRot;
      varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){
        vec2 uv = vec2(fract(vUv.x + uRot), vUv.y);
        vec3 day = texture2D(tDay, uv).rgb, night = texture2D(tNight, uv).rgb;
        float cl = texture2D(tCloud, uv).r;
        float l = dot(normalize(vN), uSun);
        float lit = smoothstep(-0.08, 0.2, l);
        vec3 col = mix(night * 0.9, mix(day, vec3(1.0), cl * 0.8) * (0.25 + 0.9 * max(l, 0.0)), lit);
        // the ring of fire along your path (x = 0), and the scorched band either side of it
        float d = abs(vN.x);
        float core = 1.0 - smoothstep(0.0015, 0.006, d), scorch = 1.0 - smoothstep(0.004, 0.02, d);
        col = mix(col, col * 0.25, scorch * uRing);
        col += vec3(3.2, 1.3, 0.35) * core * uRing * 2.0;
        vec3 V = normalize(cameraPosition - vW);
        float rim = pow(1.0 - max(dot(normalize(vN), V), 0.0), 3.0);
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
        gl_FragColor = vec4(vec3(2.4, 1.0, 0.3) * f * uA * flick, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R_EARTH + 15000, 45000, 16, 512).rotateY(Math.PI / 2), glowMat);
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
      earthMat.uniforms.uRing.value = ringK;
      glowMat.uniforms.uA.value = ringK; glowMat.uniforms.uT.value = v;
    },
  };
}

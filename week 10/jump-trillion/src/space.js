// The space shots (camera.js lists when): its own scene and camera, you near the origin (a second copy of the figure,
// flying feet-first-down, arms up), the world placed round you per shot:
//   apex   (100,000x at 46 km): the Earth's curved edge below you, the thin blue air on it, a black sky
//   iss    (1,000,000x at ~420 km): the Space Station slides down past you (it is sped up, like every jump)
//   escape (14 million x): the Earth falling away behind you, shrinking to a ball
//   moon   (100 million x): the Moon sliding past beside you (you pass its distance in ~4 hours; sped up)
//   solar  (1 billion x): looking back at the Sun shrinking to a star, the planets' orbits falling away
//   galaxy (100 billion x): the Milky Way below you, seen from outside, falling away
// Sizes are true where they can be seen (Earth, Moon, Station); the orbit rings and the galaxy are drawn as guides.
import * as THREE from 'three';
import { makeYou, FLAP } from './you.js';
import { makeISS } from './things.js';
import { JUMPS, R_E, flightY } from './timeline.js';
import { youAt } from './choreo.js';
import { smooth, clamp, lerp } from './util.js';

const LOG_V = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
`;
const LOG_F = /* glsl */ `
#include <logdepthbuf_pars_fragment>
`;
const NOISE3 = /* glsl */ `
float h3(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.07 + 3.1; a *= 0.5; } return s; }`;

export async function makeSpace(renderer) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1080 / 1920, 0.05, 1e13);
  scene.add(camera);
  const loader = new THREE.TextureLoader();
  const load = async (f) => { const t = await loader.loadAsync(f); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  const [dayT, nightT, cloudT] = await Promise.all([load('textures/earth_day.jpg'), load('textures/earth_night.jpg'), load('textures/earth_clouds.jpg')]);
  const SUN = new THREE.Vector3(0.8, 0.35, 0.48).normalize();

  // ---- the stars: a sphere round the camera, tiny points and a faint band ----
  const starMat = new THREE.ShaderMaterial({
    uniforms: { uA: { value: 1 }, uBand: { value: 1 } }, depthWrite: false, side: THREE.BackSide,
    vertexShader: `varying vec3 vD; ${LOG_V}
      void main(){ vD = position; vec4 w = modelMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * viewMatrix * w; gl_Position.z = gl_Position.w * 0.99999;
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `uniform float uA; uniform float uBand; varying vec3 vD; ${LOG_F} ${NOISE3}
      void main(){
        #include <logdepthbuf_fragment>
        vec3 d = normalize(vD);
        vec3 g = d * 420.0; vec3 id = floor(g); vec3 f = fract(g);
        float r = h3(id);
        float st = step(0.9965, r) * smoothstep(0.42, 0.0, length(f - 0.5)) * (0.4 + 1.6 * h3(id + 7.0));
        vec3 g2 = d * 1300.0; vec3 id2 = floor(g2);
        float st2 = step(0.9985, h3(id2)) * smoothstep(0.45, 0.0, length(fract(g2) - 0.5)) * 0.7;
        float band = exp(-pow(dot(d, normalize(vec3(0.3, 0.6, -0.74))) / 0.16, 2.0)) * (0.5 + 0.8 * fbm3(d * 6.0));
        vec3 c = vec3(1.0, 0.97, 0.92) * (st + st2) + vec3(0.32, 0.3, 0.36) * band * 0.22 * uBand;
        gl_FragColor = vec4(c * uA, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const stars = new THREE.Mesh(new THREE.SphereGeometry(1e12, 48, 24), starMat);
  stars.frustumCulled = false; stars.renderOrder = -2;
  scene.add(stars);

  // ---- the Earth (NASA's maps): day, night lights, clouds, a thin blue edge ----
  const earthMat = new THREE.ShaderMaterial({
    uniforms: { tDay: { value: dayT }, tNight: { value: nightT }, tCloud: { value: cloudT }, uSun: { value: SUN }, uRot: { value: 0.62 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vW; ${LOG_V}
      void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `uniform sampler2D tDay; uniform sampler2D tNight; uniform sampler2D tCloud; uniform vec3 uSun; uniform float uRot;
      varying vec2 vUv; varying vec3 vN; varying vec3 vW; ${LOG_F}
      void main(){
        #include <logdepthbuf_fragment>
        vec2 uv = vec2(fract(vUv.x + uRot), vUv.y);
        vec3 day = texture2D(tDay, uv).rgb, night = texture2D(tNight, uv).rgb;
        float cl = texture2D(tCloud, uv).r;
        vec3 nn = normalize(vN);
        float l = dot(nn, uSun);
        float lit = smoothstep(-0.08, 0.2, l);
        vec3 col = mix(night * 0.9, mix(day, vec3(1.0), cl * 0.85) * (0.2 + 0.95 * max(l, 0.0)), lit);
        vec3 V = normalize(cameraPosition - vW);
        float rim = pow(1.0 - max(dot(nn, V), 0.0), 2.5);
        col = mix(col, vec3(0.35, 0.6, 1.0) * (0.4 + 0.8 * lit), rim * 0.65);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(R_E, 256, 128), earthMat);
  earth.frustumCulled = false;
  scene.add(earth);
  const atmoMat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN }, uC: { value: new THREE.Vector3() }, uR: { value: R_E } },
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vW; ${LOG_V} void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `uniform vec3 uSun; uniform vec3 uC; uniform float uR; varying vec3 vW; ${LOG_F}
      void main(){
        #include <logdepthbuf_fragment>
        // how close the line of sight passes to the surface: bright just above the edge, fading out over ~100 km
        vec3 o = cameraPosition - uC, d = normalize(vW - cameraPosition);
        float tc = -dot(o, d); vec3 cp = o + d * max(tc, 0.0);
        float hgt = length(cp) - uR;
        float k = exp(-max(hgt, 0.0) / 9000.0) * step(0.0, tc) + exp(-max(hgt, 0.0) / 9000.0) * (1.0 - step(0.0, tc)) * exp(-max(length(o) - uR, 0.0) / 9000.0);
        float lit = smoothstep(-0.25, 0.3, dot(normalize(cp), uSun));
        vec3 c = mix(vec3(0.2, 0.45, 1.0), vec3(0.55, 0.75, 1.0), k) * k * 1.6 * lit;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(R_E * 1.025, 192, 96), atmoMat);
  atmo.frustumCulled = false; atmo.renderOrder = 2;
  scene.add(atmo);

  // ---- the Moon: grey, cratered, lit from the side ----
  const moonMat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN } },
    vertexShader: `varying vec3 vN; varying vec3 vO; ${LOG_V} void main(){ vO = normalize(position); vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `uniform vec3 uSun; varying vec3 vN; varying vec3 vO; ${LOG_F} ${NOISE3}
      float craters(vec3 p) {
        float c = 0.0;
        for (int o = 0; o < 4; o++) {
          float sc = 5.0 * pow(2.2, float(o));
          vec3 q = p * sc; vec3 base = floor(q);
          // (the neighbouring cells too, so a crater near a cell's edge isn't cut off in a straight line)
          for (int i = 0; i < 27; i++) {
            vec3 cell = base + vec3(float(i - (i / 3) * 3) - 1.0, float((i / 3) - (i / 9) * 3) - 1.0, float(i / 9) - 1.0);
            vec3 ctr = cell + 0.25 + 0.5 * vec3(h3(cell + 1.3), h3(cell + 2.7), h3(cell + 4.1));
            float r = 0.18 + 0.28 * h3(cell + 7.7);
            float d = length(q - ctr) / r;
            if (d < 1.35 && h3(cell + 9.1) < 0.5) c += (smoothstep(1.0, 0.65, d) * -0.5 + smoothstep(0.75, 1.0, d) * smoothstep(1.3, 1.0, d) * 0.7) / (1.0 + float(o) * 0.6);
          }
        }
        return c;
      }
      void main(){
        #include <logdepthbuf_fragment>
        float mare = smoothstep(0.5, 0.62, fbm3(vO * 2.2 + 4.0));
        float cr = craters(vO);
        vec3 base = mix(vec3(0.62, 0.6, 0.57), vec3(0.33, 0.32, 0.31), mare) * (0.85 + 0.3 * fbm3(vO * 18.0));
        float l = max(dot(normalize(vN), uSun), 0.0);
        vec3 col = base * (0.02 + 1.25 * pow(l, 0.8) * (1.0 + cr * 0.7));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(1.7374e6, 160, 80), moonMat);
  moon.frustumCulled = false;
  scene.add(moon);

  // ---- the Space Station ----
  const iss = makeISS();
  scene.add(iss.g);

  // ---- the Sun: a disc and its glare (a camera-facing quad) ----
  const sunMat = new THREE.ShaderMaterial({
    uniforms: { uI: { value: 1 }, uDisc: { value: 0.05 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; ${LOG_V} void main(){ vUv = uv * 2.0 - 1.0; vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); float s = length(modelMatrix[0].xyz); mv.xy += position.xy * s; gl_Position = projectionMatrix * mv;
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `uniform float uI; uniform float uDisc; varying vec2 vUv; ${LOG_F} void main(){
      #include <logdepthbuf_fragment>
      float r = length(vUv);
      float disc = 1.0 - smoothstep(uDisc * 0.92, uDisc, r);
      float glow = exp(-r * r * 30.0) * 0.6 + exp(-r * 7.0) * 0.25 + 0.06 * exp(-r * 2.2);
      vec3 c = vec3(1.0, 0.95, 0.85) * (disc * 14.0 + glow * 3.0) * uI;
      gl_FragColor = vec4(c * (1.0 - smoothstep(0.9, 1.0, r)), 1.0);
    }`,
  });
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), sunMat);
  sun.frustumCulled = false; sun.renderOrder = 3;
  scene.add(sun);

  // ---- the planets' orbits (the solar shot): thin glowing rings in the ecliptic, a dot on each ----
  const ORB = [0.39, 0.72, 1.0, 1.52, 5.2, 9.58, 19.2, 30.1];
  const ringMat = new THREE.ShaderMaterial({
    uniforms: { uA: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `${LOG_V} void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `uniform float uA; ${LOG_F} void main(){
      #include <logdepthbuf_fragment>
      gl_FragColor = vec4(vec3(0.55, 0.65, 0.85) * uA, 1.0); }`,
  });
  const rings = new THREE.Group();
  const AU = 1;   // the solar shot is drawn in AU
  for (const a of ORB) {
    const pts = [];
    for (let k = 0; k <= 256; k++) { const t = (k / 256) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(t) * a * AU, 0, Math.sin(t) * a * AU)); }
    rings.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMat));
  }
  const dots = [];
  const dotCols = [0xb0a090, 0xe8d6a8, 0x5d8fd8, 0xc8603a, 0xd8b890, 0xe0cc98, 0x9fd8e0, 0x5a78d8];
  ORB.forEach((a, i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(dotCols[i]).multiplyScalar(2.2) }));
    m.userData.a = a; m.userData.ph = i * 1.7 + 0.4; m.frustumCulled = false;
    rings.add(m); dots.push(m);
  });
  rings.traverse((o) => { o.frustumCulled = false; });
  scene.add(rings);

  // ---- the galaxy: a spiral disc seen from outside (drawn), a yellow core, dust lanes ----
  const galMat = new THREE.ShaderMaterial({
    uniforms: { uA: { value: 1 }, uRot: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vP; ${LOG_V} void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `uniform float uA; uniform float uRot; varying vec2 vP; ${LOG_F} ${NOISE3}
      void main(){
        #include <logdepthbuf_fragment>
        float r = length(vP); if (r > 1.0) discard;
        float th = atan(vP.y, vP.x) + uRot;
        // two main arms and two weaker ones, logarithmic spirals
        float s = th - log(max(r, 0.02)) * 3.2;
        float arms = pow(0.5 + 0.5 * cos(2.0 * s), 3.0) + 0.35 * pow(0.5 + 0.5 * cos(2.0 * s + 1.6), 4.0);
        float n = fbm3(vec3(vP * 9.0, 1.0)), n2 = fbm3(vec3(vP * 40.0, 3.0));
        float disc = exp(-r * 3.2);
        float lanes = smoothstep(0.55, 0.7, n) * pow(0.5 + 0.5 * cos(2.0 * s - 0.5), 6.0);
        vec3 armC = vec3(0.6, 0.72, 1.0) * arms * disc * (0.6 + 0.8 * n2) * 2.2;
        vec3 core = vec3(1.0, 0.85, 0.6) * (exp(-r * r * 90.0) * 3.0 + exp(-r * 9.0) * 0.6);
        float speck = step(0.93, h3(floor(vec3(vP * 900.0, 0.0)))) * arms * disc * 3.0;
        vec3 c = (armC + core + vec3(speck)) * (1.0 - 0.6 * lanes) * (1.0 - smoothstep(0.75, 1.0, r));
        gl_FragColor = vec4(c * uA, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const galaxy = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), galMat);
  galaxy.frustumCulled = false;
  scene.add(galaxy);

  // ---- light, and you ----
  const sunL = new THREE.DirectionalLight(0xfff4e6, 3.2);
  sunL.position.copy(SUN);
  scene.add(sunL, sunL.target);
  const fill = new THREE.HemisphereLight(0x5a7ab8, 0x1a1a22, 0.35);
  scene.add(fill);
  const camL = new THREE.DirectionalLight(0xdfe6ff, 0);
  scene.add(camL, camL.target);
  const you = makeYou(scene, { hoodie: 0xff8a1e, jeans: 0x283246, skin: 0xd09a74, hair: 0x2a1a10 });
  const pose = { hipY: 0.92, lean: 0.0, footZ: 0.0, armsUp: 1.45, armsOut: 0.05, head: [-0.45, 0], curl: 0.3 };

  const ALL = [earth, atmo, moon, iss.g, sun, rings, galaxy];
  const show = (...on) => { for (const o of ALL) o.visible = on.includes(o); };

  // ---- Jupiter: cream and tan bands, a red spot ----
  const jupMat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN } },
    vertexShader: `varying vec3 vN; varying vec3 vO; ${LOG_V} void main(){ vO = normalize(position); vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `uniform vec3 uSun; varying vec3 vN; varying vec3 vO; ${LOG_F} ${NOISE3}
      void main(){
        #include <logdepthbuf_fragment>
        float lat = vO.y + 0.06 * (fbm3(vO * 6.0) - 0.5);
        float b = 0.5 + 0.5 * sin(lat * 26.0 + 1.3 * sin(lat * 7.0));
        vec3 c = mix(vec3(0.62, 0.45, 0.3), vec3(0.93, 0.86, 0.74), b);
        c = mix(c, vec3(0.75, 0.62, 0.5), 0.3 * fbm3(vO * vec3(3.0, 30.0, 3.0)));
        vec2 sp = vec2(atan(vO.z, vO.x) - 0.6, vO.y + 0.36);
        float spot = 1.0 - smoothstep(0.06, 0.1, length(sp * vec2(0.55, 1.6)));
        c = mix(c, vec3(0.75, 0.32, 0.2), spot);
        float l = max(dot(normalize(vN), uSun), 0.0);
        gl_FragColor = vec4(c * (0.03 + 1.2 * l), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const jupiter = new THREE.Mesh(new THREE.SphereGeometry(6.99e7, 128, 64), jupMat);
  jupiter.frustumCulled = false;
  scene.add(jupiter);
  ALL.push(jupiter);
  // ---- the fire round you as you come back into the air (1,000,000x): an additive glowing shell ----
  const plasmaMat = new THREE.ShaderMaterial({
    uniforms: { uA: { value: 0 }, uT: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vO; ${LOG_V} void main(){ vO = position; vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w;
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `uniform float uA; uniform float uT; varying vec3 vN; varying vec3 vV; varying vec3 vO; ${LOG_F} ${NOISE3}
      void main(){
        #include <logdepthbuf_fragment>
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float n = fbm3(vO * 3.0 + vec3(0.0, uT * 6.0, 0.0));
        float k = (0.35 + 0.9 * f) * (0.6 + 0.8 * n) * smoothstep(-1.0, 0.6, -vO.y);
        gl_FragColor = vec4(vec3(1.6, 0.55, 0.12) * k * uA + vec3(1.2, 1.0, 0.7) * pow(f, 3.0) * uA * 0.6, 1.0);
      }`,
  });
  const plasma = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), plasmaMat);
  plasma.scale.set(0.62, 1.5, 0.62); plasma.position.set(0, 0.35, 0); plasma.frustumCulled = false; plasma.renderOrder = 5;
  scene.add(plasma);

  // the follow camera (as in camera.js): camera round you (az, d, height h above your middle), you dy degrees under the middle
  const DEG = Math.PI / 180, upV = new THREE.Vector3(0, 1, 0);
  const rigCam = (az, d, h, dy, fov) => {
    const pos = new THREE.Vector3(Math.sin(az * DEG) * d, h, Math.cos(az * DEG) * d);
    const dir = pos.clone().negate().normalize();
    const right = new THREE.Vector3().crossVectors(dir, upV).normalize();
    dir.applyAxisAngle(right, dy * DEG);
    camera.position.copy(pos); camera.lookAt(pos.clone().add(dir)); camera.fov = fov;
  };
  // you: in the jump shots the same motion as on the street; in the flight a slower hitch-kick
  const moveYou = (v, Y, slow) => {
    if (Y && Y.mode === 'air' && (Y.drive >= 0.5 || Y.reach >= 0.35)) you.pose(Y.pose);
    else you.run({ ph: v * (slow ? 6.0 : 10.5), amp: slow ? 0.6 : 0.85, float: 1, t: v, wind: 0.4 });
    you.root.position.set(-0.105, -0.95, 0);
    you.root.rotation.set(0, Math.atan2(camera.position.x, camera.position.z) + 0.45, 0);
  };
  const earthAt = (h, rot) => { earth.position.set(0, -R_E - h, 0); atmo.position.copy(earth.position); atmoMat.uniforms.uC.value.copy(earth.position); earthMat.uniforms.uRot.value = rot; };

  function update(v, cm) {
    const name = cm.space;
    FLAP.uFT.value = v; FLAP.uFlap.value = 0.3;
    starMat.uniforms.uA.value = 1; starMat.uniforms.uBand.value = 1;
    sunL.position.copy(SUN); sunL.intensity = 3.2; camL.intensity = 0.6; camera.up.set(0, 1, 0);
    plasmaMat.uniforms.uA.value = 0; plasmaMat.uniforms.uT.value = v;
    const cam = (px, py, pz, lx, ly, lz, fov) => { camera.position.set(px, py, pz); camera.lookAt(lx, ly, lz); camera.fov = fov; };
    const viewAlong = (dir) => {
      const upP = new THREE.Vector3(0, 1, 0).addScaledVector(dir, -dir.y).normalize();
      const sideP = new THREE.Vector3().crossVectors(dir, upP).normalize();
      const c = dir.clone().multiplyScalar(-7.0).addScaledVector(upP, -1.5).addScaledVector(sideP, 0.4);
      // you under the middle of the frame (below the counter), the Sun further down
      const look = c.clone().add(dir.clone().multiplyScalar(10).addScaledVector(upP, 3.95));
      camera.up.copy(upP);
      cam(c.x, c.y, c.z, look.x, look.y, look.z, 64);
      camL.position.copy(c).normalize(); camL.intensity = 1.6;
    };
    if (name === 'apex' || name === 'iss') {
      // the top of the 100,000x / 1,000,000x jump: the same follow camera as on the street
      const k = cm.k, j = JUMPS[k], Y = youAt(v), h = flightY(j, Y.u);
      show(earth, atmo, ...(k === 5 ? [iss.g] : []));
      earthAt(h, k === 4 ? 0.62 : 0.55);
      const r = cm.rig;
      rigCam(r.az, r.d, r.h - 0.9, r.dy, r.fov);
      moveYou(v, Y, false);
      starMat.uniforms.uA.value = 0.7;
      if (k === 5) {
        // the Station slides past you near the top (slowed right down: really you'd pass it in a few thousandths of a second)
        const s = clamp((Y.u - 0.25) / 0.4);
        iss.g.position.set(-20, lerp(32, -40, smooth(0.0, 1.0, s)), -36);
        iss.g.rotation.set(0.25, 0.5, 0.08);
        iss.wingMat.uniforms.uSun.value.copy(SUN);
        // coming back down into the air: fire round you below ~120 km
        if (Y.u > 0.5) plasmaMat.uniforms.uA.value = smooth(120000, 60000, h) * 0.75;
      }
    } else {
      const s = clamp((v - cm.a) / (cm.b - cm.a));
      if (name === 'escape') {
        // the Earth falling away behind you: 1,500 km to 60,000 km, most of it in the first second
        const alt = 1.5e6 * Math.pow(40, 1 - Math.pow(1 - Math.min(1, s * 1.25), 2.2));
        show(earth, atmo);
        earthAt(alt, 0.55);
        // the camera above you looking down past you at the Earth (it starts filling the frame behind you)
        camera.up.set(0, 0, -1);
        rigCam(25, 0.9, 3.9, 15, 66);
      } else if (name === 'moon') {
        // the Moon whips past beside you (at 1% of light speed it takes about a second to go by)
        show(moon, earth, atmo);
        moon.position.set(-3.4e6, lerp(5.5e6, -6.5e6, smooth(0.15, 0.85, s)), -2.3e6);
        earth.position.set(2.2e7, -3.6e8, -1.0e8); atmo.position.copy(earth.position); atmoMat.uniforms.uC.value.copy(earth.position);
        rigCam(57, 5.0, 0.9, 9.6, 64);
      } else if (name === 'jupiter') {
        show(jupiter);
        jupiter.position.set(-3.3e8, lerp(1.6e8, -1.9e8, smooth(0.1, 0.9, s)), -2.2e8);
        jupiter.rotation.set(0.05, s * 0.3, 0.05);
        rigCam(57, 5.0, 0.9, 9.6, 64);
      } else if (name === 'solar') {
        // looking back at the Sun shrinking to a star: from Jupiter's distance (3 days) out past Neptune's (17 days);
        // drawn in AU x K, the orbits as guides
        const K = 1e7, d = 5.2 * Math.pow(30 / 5.2, Math.pow(s, 0.55));
        const dir = new THREE.Vector3(0.12, -0.86, -0.5).normalize();
        show(sun, rings);
        rings.position.copy(dir).multiplyScalar(d * K);
        rings.scale.setScalar(K);
        rings.rotation.set(0.12, s * 0.25, 0);
        for (const m of dots) { const a = m.userData.a, ph = m.userData.ph + s * 0.5 / Math.pow(a, 1.5); m.position.set(Math.cos(ph) * a, 0, Math.sin(ph) * a); m.scale.setScalar(0.0045 * d); }
        ringMat.uniforms.uA.value = 0.75;
        sun.position.copy(rings.position); sun.scale.setScalar(1.6 * K * Math.pow(5.2 / d, 2.2));
        sunMat.uniforms.uDisc.value = 0.03; sunMat.uniforms.uI.value = 1.8 * Math.pow(5.2 / d, 0.5);
        viewAlong(dir);
        sunL.position.copy(dir); sunL.intensity = 2.6;
      }
      moveYou(v, null, true);
    }
    camera.near = 0.05; camera.far = 1e13;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    stars.position.copy(camera.position);
  }
  return { scene, camera, update, you, earth, moon, iss, galaxy };
}

// Space: Earth bursting apart at almost the speed of light, the blast sweeping over the Moon (1.28 s), then the
// solar system: the expanding shell of light reaches the Sun (8 min 19 s) and tears it apart, then Jupiter
// (43 min), Neptune (4 h), until it fills the screen with white. Earth (NASA Blue Marble / Black Marble / clouds).
import * as THREE from 'three';
import { smooth, clamp, lerp, DEG, rng, keys } from './util.js';
import { V_SPACE, V_MOON, V_SOLAR, V_SUNHIT, T_SWITCH, VIDEO_DURATION, tauAt } from './timeline.js';

const C = 299792458, RE = 6.371e6, AU = 1.496e11;
const ll = (lat, lon) => new THREE.Vector3(Math.cos(lat * DEG) * Math.cos(lon * DEG), Math.sin(lat * DEG), -Math.cos(lat * DEG) * Math.sin(lon * DEG));

const NOISE = /* glsl */ `
  float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float noise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.07 + 3.1; a *= 0.5; } return s; }
`;
const VSHADE = /* glsl */ `varying vec3 vN; varying vec3 vW;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main(){ vN = normalize(position); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
    #include <logdepthbuf_vertex>
  }`;

export function starField(n, seed) {
  const R = rng(seed), pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const d = new THREE.Vector3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1).normalize().multiplyScalar(4000);
    pos.set([d.x, d.y, d.z], i * 3);
    const b = 0.25 + Math.pow(R(), 6) * 3.5, w = R();
    col.set([b * (0.8 + 0.2 * w), b * 0.9, b * (1.0 - 0.25 * w)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
  p.frustumCulled = false;
  return p;
}

// a shell of light: bright rim, crackling surface, see-through middle
export function shellMat(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uA: { value: 1 }, uColor: { value: new THREE.Color(color) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: VSHADE,
    fragmentShader: /* glsl */ `uniform float uT; uniform float uA; uniform vec3 uColor; varying vec3 vN; varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${NOISE}
      void main(){
        #include <logdepthbuf_fragment>
        vec3 V = normalize(cameraPosition - vW);
        float rim = pow(1.0 - abs(dot(normalize(vN), V)), 2.5);
        float n = fbm(vN * 6.0 + uT * 0.7) * 0.7 + fbm(vN * 19.0 - uT) * 0.3;
        float k = (pow(rim, 1.6) * 1.5 + 0.008) * (0.5 + n) * uA;
        gl_FragColor = vec4(uColor * k, 1.0);
      }`,
  });
}

export function makeEarthScene(glowTex) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1080 / 1920, 0.005, 20000);
  const E = { scene, camera };
  const loader = new THREE.TextureLoader();
  const waits = [];
  const load = (f, srgb) => {
    let done; waits.push(new Promise((res, rej) => { done = [res, rej]; }));
    const t = loader.load(f, () => done[0](), undefined, () => done[1](new Error('could not load ' + f)));
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping;
    return t;
  };
  const dayT = load('textures/earth_day.jpg', true), nightT = load('textures/earth_night.jpg'), cloudT = load('textures/earth_clouds.jpg');
  E.ready = Promise.all(waits);
  scene.add(starField(7000, 11));

  // Tokyo at noon: the Sun almost straight over the western Pacific
  const TOKYO = ll(35.66, 139.7);
  const sunDir = ll(-6, 139.7 - 4).normalize();
  // Earth: the real planet, then glowing white-blue from the inside out as it bursts
  const U = { uDay: { value: dayT }, uNight: { value: nightT }, uClouds: { value: cloudT }, uSun: { value: sunDir }, uBurn: { value: 0 }, uTime: { value: 0 } };
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 128), new THREE.ShaderMaterial({
    uniforms: U, vertexShader: VSHADE,
    fragmentShader: /* glsl */ `uniform sampler2D uDay; uniform sampler2D uNight; uniform sampler2D uClouds; uniform vec3 uSun; uniform float uBurn; uniform float uTime;
      varying vec3 vN; varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${NOISE}
      void main(){
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vN);
        float lon = atan(-n.z, n.x), lat = asin(clamp(n.y, -1.0, 1.0));
        float u = lon / 6.2831853 + 0.5, v = lat / 3.14159265 + 0.5;
        vec2 uvA = vec2(fract(u), v), uvB = vec2(fract(u + 0.5) - 0.5, v);
        vec2 uv = fwidth(uvA.x) < fwidth(uvB.x) + 1e-5 ? uvA : uvB;
        vec3 day = texture2D(uDay, uv).rgb;
        float cloud = smoothstep(0.15, 0.85, texture2D(uClouds, uv).r);
        float ndl = dot(n, uSun);
        vec3 col = day * (0.04 + 1.05 * max(ndl, 0.0));
        col = mix(col, vec3(1.0) * (0.05 + max(ndl + 0.05, 0.0)), cloud * 0.85);
        // no electrons: no city lights. It glows from within, cracking white-blue, then is all light
        float cr = fbm(n * 7.0 + uTime * 0.4);
        float glow = smoothstep(0.75 - uBurn * 0.9, 0.95 - uBurn * 0.5, cr) * smoothstep(0.0, 0.3, uBurn);
        vec3 hot = mix(vec3(0.35, 0.55, 1.0), vec3(0.6, 0.75, 1.0), smoothstep(0.4, 1.0, uBurn)) * (0.6 + 0.4 * uBurn);
        col = mix(col, hot, clamp(glow + 0.6 * smoothstep(0.6, 1.0, uBurn), 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  scene.add(earth);
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.03, 96, 64), new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sunDir } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexShader: VSHADE,
    fragmentShader: /* glsl */ `uniform vec3 uSun; varying vec3 vN; varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        vec3 V = normalize(cameraPosition - vW);
        float rim = pow(1.0 - max(dot(normalize(vN), V), 0.0), 3.0);
        gl_FragColor = vec4(vec3(0.3, 0.55, 1.0) * rim * 1.4 * smoothstep(-0.25, 0.25, dot(normalize(vN), uSun)), 1.0);
      }`,
  }));
  scene.add(atmo);
  // the Moon (60 Earth radii away) — grey, cratered, lit by the Sun
  const MOON_DIR = new THREE.Vector3(-0.55, 0.12, -0.83).normalize();
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.273, 96, 64), new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sunDir }, uHit: { value: 0 } }, vertexShader: VSHADE,
    fragmentShader: /* glsl */ `uniform vec3 uSun; uniform float uHit; varying vec3 vN; varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${NOISE}
      void main(){
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vN);
        float m = fbm(n * 3.0) * 0.6 + fbm(n * 14.0) * 0.4;
        vec3 c = mix(vec3(0.35), vec3(0.75), smoothstep(0.35, 0.65, m)) * (0.03 + max(dot(n, uSun), 0.0));
        c = mix(c, vec3(0.7, 0.85, 1.0) * 2.0, uHit);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  moon.position.copy(MOON_DIR).multiplyScalar(60.3);
  scene.add(moon);
  const moonBurst = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), shellMat(0xbcd6ff));
  moonBurst.position.copy(moon.position);
  scene.add(moonBurst);
  // the blast: a shell of light racing out from Earth
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), shellMat(0xd8e6ff));
  scene.add(shell);
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xd8e6ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(core);
  scene.add(new THREE.AmbientLight(0xffffff, 0.2));

  E.frame = (v) => {
    const tau = tauAt(v);
    const r = 1 + C * tau / RE;                 // the blast front, in Earth radii
    U.uTime.value = v;
    U.uBurn.value = smooth(V_SPACE, V_SPACE + 2.6, v);
    const solid = 1 - smooth(V_SPACE + 2.2, V_SPACE + 3.0, v);
    earth.visible = atmo.visible = solid > 0.01;
    earth.scale.setScalar(1 + 0.04 * U.uBurn.value);
    shell.visible = v > V_SPACE + 0.3;
    shell.scale.setScalar(Math.max(r, 1.02));
    shell.material.uniforms.uT.value = v;
    const shellA = smooth(V_SPACE + 0.3, V_SPACE + 1.2, v) * (0.6 + 0.4 / Math.sqrt(r)) * 0.45;
    core.scale.setScalar(Math.min(r, 3) * 0.6 * smooth(V_SPACE + 2, V_SPACE + 3.5, v));
    // the Moon: hit when the front reaches it, flares, and bursts
    const hit = smooth(V_MOON - 0.08, V_MOON + 0.1, v);
    moon.material.uniforms.uHit.value = hit;
    moon.visible = v < V_MOON + 0.35;
    moonBurst.visible = v > V_MOON;
    moonBurst.scale.setScalar(0.3 + (v - V_MOON) * 2.5);
    moonBurst.material.uniforms.uT.value = v;
    moonBurst.material.uniforms.uA.value = Math.exp(-(v - V_MOON) * 0.8) * 1.2;
    // camera: close to Earth over the Pacific (Tokyo's side), then pulling back as the blast heads for the Moon
    const back = keys([[V_SPACE, 3.0], [V_SPACE + 2.4, 3.8], [V_SPACE + 3.4, 11], [V_MOON - 0.8, 95], [V_SOLAR, 120]], v, true);
    const eye = TOKYO.clone().multiplyScalar(0.7).addScaledVector(MOON_DIR, 0.25).addScaledVector(new THREE.Vector3(0, 1, 0), 0.25).normalize();
    const lookT = smooth(V_SPACE + 3.5, V_MOON - 1, v);
    camera.position.copy(eye).multiplyScalar(back).addScaledVector(MOON_DIR, 25 * lookT);
    const target = new THREE.Vector3().addScaledVector(MOON_DIR, 30 * lookT);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    // the blast front fades as it sweeps over the camera (no full-screen flash)
    shell.material.uniforms.uA.value = shellA * smooth(0.3, 1.5, Math.abs(camera.position.length() - r));
  };
  return E;
}


// Earth from space (NASA Blue Marble / Black Marble / clouds, public domain). You are a streak of fire leaving
// New York at sunset, heading west round the planet; laps get faster until the path is a ring of light. Past
// light speed every lap bends a little, the rings wrap the planet, the friction boils the oceans and melts the
// crust, the planet glows and breaks apart. Earth radius = 1.
import * as THREE from 'three';
import { smooth, clamp, lerp, DEG, rng, keys } from './util.js';
import { makeRings } from './rings.js';
import { distAt, V_ORBIT, V_LIGHT, V_BOOM, V_SUN, storyT } from './timeline.js';

const LAP_M = 40.075e6;
// unit vector for latitude/longitude (matches the texture mapping in the shader below)
export const ll = (lat, lon) => new THREE.Vector3(Math.cos(lat * DEG) * Math.cos(lon * DEG), Math.sin(lat * DEG), -Math.cos(lat * DEG) * Math.sin(lon * DEG));

export function makeSpace() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1080 / 1920, 0.002, 5000);
  const space = { scene, camera };
  const loader = new THREE.TextureLoader();
  const waits = [];
  const load = (f) => {
    let done;
    waits.push(new Promise((res, rej) => { done = [res, rej]; }));
    const t = loader.load(f, () => done[0](), undefined, (e) => done[1](new Error('could not load ' + f)));
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping;
    return t;
  };
  const dayT = load('textures/earth_day.jpg'), nightT = load('textures/earth_night.jpg'), cloudT = load('textures/earth_clouds.jpg');
  nightT.colorSpace = THREE.NoColorSpace; cloudT.colorSpace = THREE.NoColorSpace;
  space.textures = [dayT, nightT, cloudT];
  space.ready = Promise.all(waits);

  // New York, the way west, and the Sun: setting at New York (on the horizon, toward the west-north-west)
  const NYC = ll(40.75, -73.98);
  const NORTH = new THREE.Vector3(0, 1, 0).sub(NYC.clone().multiplyScalar(NYC.y)).normalize();
  const WEST = new THREE.Vector3().crossVectors(NYC, NORTH).normalize();   // up x north = west
  const sunDir = WEST.clone().multiplyScalar(Math.cos(29 * DEG)).addScaledVector(NORTH, Math.sin(29 * DEG)).addScaledVector(NYC, 0.02).normalize();
  space.sunDir = sunDir;

  // ---------- Earth ----------
  const U = {
    uDay: { value: dayT }, uNight: { value: nightT }, uClouds: { value: cloudT }, uSun: { value: sunDir },
    uBoil: { value: 0 }, uMelt: { value: 0 }, uGlow: { value: 0 }, uTime: { value: 0 }, uRingHeat: { value: 0 },
  };
  const earthMat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() { vN = normalize(position); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uDay; uniform sampler2D uNight; uniform sampler2D uClouds; uniform vec3 uSun;
      uniform float uBoil; uniform float uMelt; uniform float uGlow; uniform float uTime; uniform float uRingHeat;
      varying vec3 vN; varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      float noise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.07 + 3.1; a *= 0.5; } return s; }
      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vN);
        float lon = atan(-n.z, n.x), lat = asin(clamp(n.y, -1.0, 1.0));
        float u = lon / 6.2831853 + 0.5, v = lat / 3.14159265 + 0.5;
        // pick the seam-free copy of u so mipmapping doesn't draw a line at the date line
        vec2 uvA = vec2(fract(u), v), uvB = vec2(fract(u + 0.5) - 0.5, v);
        vec2 uv = fwidth(uvA.x) < fwidth(uvB.x) + 1e-5 ? uvA : uvB;
        vec3 day = texture2D(uDay, uv).rgb;
        float lights = texture2D(uNight, uv).r;
        float cloud = texture2D(uClouds, uv).r;
        vec3 V = normalize(cameraPosition - vW);
        float ndl = dot(n, uSun);
        float lit = smoothstep(-0.08, 0.12, ndl);
        // oceans: dark blue with a sun glint
        float water = smoothstep(0.12, 0.05, day.r + day.g * 0.4 - day.b * 0.6) * (1.0 - smoothstep(0.35, 0.6, dot(day, vec3(0.33))));
        vec3 H = normalize(uSun + V);
        float glint = pow(max(dot(n, H), 0.0), 700.0) * water * 0.9;
        vec3 col = day * (0.04 + 1.05 * max(ndl, 0.0)) * vec3(1.02, 1.0, 0.98);
        col += vec3(1.0, 0.85, 0.65) * glint * lit;
        // a warm band along the terminator (sunset light)
        col += vec3(0.9, 0.35, 0.1) * exp(-pow(ndl / 0.07, 2.0)) * 0.12 * (1.0 - water * 0.5);
        // clouds
        float cl = smoothstep(0.15, 0.85, cloud);
        // the oceans boiling away: thick white steam swirling over the seas, the seas turning dark
        float steam = uBoil * (1.0 - smoothstep(0.0, 0.45, uMelt)) * clamp(water * 1.2 + 0.25, 0.0, 1.0) * smoothstep(0.25, 0.75, fbm(n * 6.0 + vec3(uTime * 0.15, 0.0, uTime * 0.1)) + uBoil * 0.4);
        cl = max(cl, steam);
        vec3 cloudC = vec3(1.0) * (0.06 + 1.0 * max(ndl + 0.05, 0.0)) * (1.0 - 0.3 * uBoil);
        col = mix(col, cloudC, cl * (0.9 - 0.25 * uBoil));
        // city lights on the night side (fading as the world ends)
        float night = 1.0 - smoothstep(-0.12, 0.05, ndl);
        col += vec3(1.0, 0.72, 0.38) * pow(lights, 1.6) * 2.4 * night * (1.0 - cl * 0.7) * (1.0 - uBoil);
        // molten: the crust splits into glowing cracks, then the whole surface glows
        float rid = 1.0 - abs(fbm(n * 5.0 + vec3(0.0, uTime * 0.05, 0.0)) * 2.0 - 1.0);
        float cracks = smoothstep(0.9 - 0.1 * uMelt, 0.985, rid) * uMelt;
        vec3 crust = mix(col, vec3(0.025, 0.018, 0.015), uMelt * 0.97);
        vec3 lava = mix(vec3(0.9, 0.12, 0.02), vec3(1.0, 0.5, 0.12), smoothstep(0.93, 1.0, rid));
        col = crust + lava * cracks * (1.1 + 0.9 * uMelt);
        float hotFbm = fbm(n * 3.0 + vec3(uTime * 0.2));
        col = mix(col, mix(vec3(0.55, 0.07, 0.01), vec3(1.0, 0.38, 0.08), hotFbm) * (0.45 + 0.55 * uGlow), smoothstep(0.0, 1.0, uGlow) * (0.4 + 0.6 * hotFbm));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 128), earthMat);
  scene.add(earth);

  // atmosphere: a blue rim, warm at the terminator
  const atmoU = { uSun: { value: sunDir }, uHeat: { value: 0 } };
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.035, 128, 64), new THREE.ShaderMaterial({
    uniforms: atmoU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){ vN = normalize(position); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `uniform vec3 uSun; uniform float uHeat; varying vec3 vN; varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        vec3 V = normalize(cameraPosition - vW);
        float rim = pow(1.0 - max(dot(normalize(vN), V), 0.0), 3.0);
        float ndl = dot(normalize(vN), uSun);
        vec3 c = mix(vec3(0.25, 0.5, 1.0), vec3(1.0, 0.5, 0.2), exp(-pow(ndl / 0.15, 2.0)) * 0.7) * smoothstep(-0.25, 0.2, ndl) * rim * 1.6;
        c = mix(c, vec3(1.0, 0.45, 0.12) * rim * 3.0, uHeat);
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  scene.add(atmo);

  // stars
  {
    const R = rng(11), n = 7000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const d = new THREE.Vector3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1).normalize().multiplyScalar(1800);
      pos.set([d.x, d.y, d.z], i * 3);
      const b = 0.25 + Math.pow(R(), 6) * 3.5, warm = R();
      col.set([b * (0.8 + 0.2 * warm), b * 0.9, b * (1.0 - 0.25 * warm)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
    stars.frustumCulled = false;
    scene.add(stars);
    space.stars = stars;
  }

  // the Sun far off to the side (a glow off-screen most of the time), and its light
  const sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
  sunLight.position.copy(sunDir).multiplyScalar(100);
  scene.add(sunLight, new THREE.AmbientLight(0x223344, 0.3));

  // ---------- your path ----------
  const rings = makeRings(512, 256);
  scene.add(rings.mesh);
  rings.uniforms.uColor.value.setRGB(1.0, 0.78, 0.5);
  // lap k's circle: a, b axes; laps start bending ("swerving") a little each after light speed
  const lapOf = (v) => distAt(v) / LAP_M;
  const V_BEND = V_LIGHT + 3.3;
  const L_BEND = lapOf(V_BEND);
  const bases = [];
  {
    const RB = rng(2026);
    let a = NYC.clone(), b = WEST.clone();
    const q = new THREE.Quaternion(), ax = new THREE.Vector3();
    const LMAX = Math.ceil(lapOf(V_SUN + 1)) + 2;
    // how much each lap bends: a sliver at first, then wildly (random great circles)
    for (let k = 0; k <= LMAX; k++) {
      bases.push([a.clone(), b.clone()]);
      if (k + 1 > L_BEND) {
        const prog = clamp(Math.log((k + 1) / Math.max(L_BEND, 1)) / Math.log(25), 0, 1);
        const ang = lerp(2.5, 70, prog * prog) * DEG;
        ax.set(RB() * 2 - 1, RB() * 2 - 1, RB() * 2 - 1).normalize();
        q.setFromAxisAngle(ax, ang);
        a.applyQuaternion(q); b.applyQuaternion(q);
        // keep a, b orthonormal
        b.sub(a.clone().multiplyScalar(a.dot(b))).normalize();
      }
    }
  }
  space.lapOf = lapOf;

  // the head of the streak: a hot glowing point
  const headMat = new THREE.SpriteMaterial({ color: 0xffe2b0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true });
  {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.15, 'rgba(255,230,180,0.9)'); gr.addColorStop(0.45, 'rgba(255,140,60,0.25)'); gr.addColorStop(1, 'rgba(255,100,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    headMat.map = new THREE.CanvasTexture(c);
  }
  const head = new THREE.Sprite(headMat);
  scene.add(head);
  space.glowTex = headMat.map;

  // ---------- the break-up: glowing chunks flying apart, a shell of hot gas ----------
  const debris = (() => {
    const R = rng(77), n = 5000;
    const dir = new Float32Array(n * 3), spd = new Float32Array(n), spin = new Float32Array(n * 4), size = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const d = new THREE.Vector3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1).normalize();
      dir.set([d.x, d.y, d.z], i * 3);
      spd[i] = 0.5 + Math.pow(R(), 1.5) * 2.2;
      spin.set([R() - 0.5, R() - 0.5, R() - 0.5, 1 + R() * 5], i * 4);
      size[i] = 0.004 + Math.pow(R(), 4) * 0.05;
    }
    const g = new THREE.InstancedBufferGeometry().copy(new THREE.IcosahedronGeometry(1, 0));
    g.setAttribute('aDir', new THREE.InstancedBufferAttribute(dir, 3));
    g.setAttribute('aSpd', new THREE.InstancedBufferAttribute(spd, 1));
    g.setAttribute('aSpin', new THREE.InstancedBufferAttribute(spin, 4));
    g.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 1));
    g.instanceCount = n;
    const u = { uT: { value: 0 }, uSun: { value: sunDir } };
    const m = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: /* glsl */ `
        attribute vec3 aDir; attribute float aSpd; attribute vec4 aSpin; attribute float aSize; uniform float uT;
        varying vec3 vN; varying float vHot; varying float vEdge;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        mat3 rotAxis(vec3 k, float a) { k = normalize(k); float c = cos(a), s = sin(a), t = 1.0 - c;
          return mat3(t*k.x*k.x + c, t*k.x*k.y + s*k.z, t*k.x*k.z - s*k.y, t*k.x*k.y - s*k.z, t*k.y*k.y + c, t*k.y*k.z + s*k.x, t*k.x*k.z + s*k.y, t*k.y*k.z - s*k.x, t*k.z*k.z + c); }
        void main() {
          float t = max(uT, 0.0);
          mat3 Rm = rotAxis(aSpin.xyz, aSpin.w * t);
          vec3 p = aDir * (0.85 + aSpd * t * (1.0 - 0.15 * min(t, 3.0) / 3.0)) + Rm * (position * aSize * (1.0 + 0.3 * sin(aSpin.w * 7.0)));
          vN = Rm * normalize(position);
          vHot = exp(-t * (0.6 + aSize * 10.0));
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0) * step(0.0, uT) + vec4(0.0, 0.0, 2.0, 1.0) * (1.0 - step(0.0, uT));
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun; varying vec3 vN; varying float vHot;
        #include <common>
        #include <logdepthbuf_pars_fragment>
        void main() {
          #include <logdepthbuf_fragment>
          vec3 n = normalize(vN);
          vec3 rock = vec3(0.07, 0.05, 0.045) * (0.25 + max(dot(n, uSun), 0.0));
          vec3 hot = mix(vec3(0.6, 0.08, 0.01), vec3(1.0, 0.35, 0.06), vHot) * (0.2 + 0.55 * vHot);
          float facing = abs(dot(n, normalize(cameraPosition)));
          gl_FragColor = vec4(rock + hot * (0.1 + 0.9 * vHot) * (0.35 + 0.65 * pow(1.0 - facing, 1.5)), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    return { mesh, u };
  })();
  scene.add(debris.mesh);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){ vN = normalize(position); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `uniform float uT; varying vec3 vN; varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      float noise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
      void main(){
        #include <logdepthbuf_fragment>
        vec3 V = normalize(cameraPosition - vW);
        float rim = pow(1.0 - abs(dot(normalize(vN), V)), 2.0);
        float n = noise3(vN * 7.0 + uT) * 0.6 + noise3(vN * 17.0 - uT) * 0.4;
        float a = exp(-uT * 0.8) * smoothstep(0.0, 0.05, uT);
        gl_FragColor = vec4(mix(vec3(1.0, 0.35, 0.08), vec3(1.0, 0.8, 0.45), n) * (rim * 0.6 + 0.0) * n * a * 0.5, 1.0);
      }`,
  }));
  scene.add(shell);

  // ---------- per frame ----------
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), ORIGIN = new THREE.Vector3();
  space.frame = (v, s) => {
    U.uTime.value = v;
    const L = lapOf(v);
    // the world ends in stages (see the captions)
    U.uBoil.value = smooth(V_LIGHT + 6.0, V_LIGHT + 8.6, v);
    U.uMelt.value = smooth(V_LIGHT + 8.6, V_BOOM - 1.2, v);
    U.uGlow.value = smooth(V_BOOM - 1.6, V_BOOM, v);
    atmoU.uHeat.value = smooth(V_LIGHT + 4, V_BOOM - 1, v);
    const gone = v >= V_BOOM;
    earth.visible = atmo.visible = !gone;
    debris.u.uT.value = gone ? v - V_BOOM : -1;
    shell.visible = gone;
    shell.material.uniforms.uT.value = v - V_BOOM;
    shell.scale.setScalar(1 + (v - V_BOOM) * 1.6);

    // the rings: the newest lap up to where you are, older laps fading (they persist ~0.3 s on screen)
    const lapsPerSec = (lapOf(v + 0.02) - lapOf(v - 0.02)) / 0.04;
    const W = clamp(lapsPerSec * 0.3, 1, 480);
    const k0 = Math.floor(L);
    let n = 0;
    const heat = smooth(V_LIGHT + 3, V_BOOM, v);
    rings.uniforms.uColor.value.setRGB(1.0, lerp(0.82, 0.62, heat), lerp(0.62, 0.36, heat));
    rings.uniforms.uWidth.value = lerp(2.4, 3.6, smooth(V_ORBIT, V_LIGHT, v)) * (gone ? 0.8 : 1);
    rings.uniforms.uGain.value = lerp(1.4, 2.0, heat) * (1 + 0.6 * U.uGlow.value) * (gone ? 0.35 : 1);
    // the path drawn on screen: at least everything since New York (up to one lap), more once laps blur together
    const Ltrail = Math.max(W, Math.min(L, 1), 0.004);
    const start = L - Ltrail;
    for (let k = k0; k >= 0 && n < 480; k--) {
      const segStart = Math.max(k, start), segEnd = Math.min(k + 1, L);
      if (segEnd <= segStart) break;
      const [a, b] = bases[Math.min(k, bases.length - 1)];
      const age = L - segEnd;
      const alpha = k === k0 ? 0.999 : clamp(1 - age / Ltrail, 0.05, 1) * 0.9;
      rings.set(n++, ORIGIN, 1.004, a, b, (segEnd - k) * Math.PI * 2, Math.max((segEnd - segStart) * Math.PI * 2, 0.012), alpha);
    }
    rings.count = n;
    rings.uniforms.uGain.value *= Math.min(1, Math.sqrt(40 / Math.max(n, 1)));   // many rings at once: each one dimmer
    rings.commit();

    // head position
    {
      const [a, b] = bases[Math.min(k0, bases.length - 1)];
      const phi = (L - k0) * Math.PI * 2;
      head.position.copy(a).multiplyScalar(Math.cos(phi)).addScaledVector(b, Math.sin(phi)).multiplyScalar(1.006);
      const hs = lerp(0.1, 0.12, smooth(V_ORBIT, V_LIGHT, v)) * (1 + U.uGlow.value);
      head.scale.setScalar(hs);
      head.visible = true;
      space.head = head.position;
    }

    // camera: above your path a third of the way across America, looking at the planet's centre with west pointing up
    // the (tall) screen: you start at New York near the bottom and run up the frame; tilted a little to the north so
    // the full lap shows as an oval. It pulls back as the laps speed up and drifts slowly round.
    const back = keys([[V_ORBIT, 2.55], [V_ORBIT + 6, 2.75], [V_LIGHT - 1, 3.2], [V_LIGHT + 6, 3.05], [V_BOOM - 0.4, 2.95], [V_BOOM + 1.5, 6.5], [V_SUN, 8]], v, true);
    const P35 = NYC.clone().multiplyScalar(Math.cos(35 * DEG)).addScaledVector(WEST, Math.sin(35 * DEG));
    const eye = P35.clone().addScaledVector(NORTH, keys([[V_ORBIT, 0.12], [V_LIGHT - 2, 0.42], [V_BOOM, 0.5]], v)).normalize();
    eye.applyAxisAngle(NORTH, (v - V_ORBIT) * 0.01);
    camera.position.copy(eye).multiplyScalar(back);
    camera.up.copy(WEST);
    camera.lookAt(0, 0, 0);
    // shake as the planet breaks
    const quake = smooth(V_BOOM - 2, V_BOOM, v) * (1 - smooth(V_BOOM, V_BOOM + 1.2, v));
    camera.rotation.x += Math.sin(v * 53) * 0.004 * quake;
    camera.rotation.y += Math.sin(v * 41 + 1) * 0.004 * quake;
    camera.fov = 48;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  };
  return space;
}

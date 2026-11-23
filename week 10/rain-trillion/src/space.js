// Space, at 1 trillion times: the whole Earth one ball of water wrapped in storms (NASA's public-domain cloud map,
// stirred so the storms turn), swelling as the rain piles on (radius = 6,371 km + the depth), lightning flickering in
// the storms, the rain itself falling in on it from every side as faint streaks, the Sun's glint, a thin rim of air,
// stars, the Moon far off, and a bright point where you are (main.js puts the YOU label over it). Its own scene, in km,
// Earth's centre at the origin.
import * as THREE from 'three';

export const RE = 6371;   // km

export function makeSpace() {
  const scene = new THREE.Scene();
  const loader = new THREE.TextureLoader();
  let done;
  const ready = new Promise((res, rej) => { done = [res, rej]; });
  const clouds = loader.load('textures/earth_clouds.jpg', () => done[0](), undefined, () => done[1](new Error('clouds texture')));
  clouds.wrapS = THREE.RepeatWrapping; clouds.anisotropy = 8;
  const u = {
    uClouds: { value: clouds }, uSun: { value: new THREE.Vector3(-0.35, 0.45, 0.82).normalize() }, uTime: { value: 0 },
    uSpin: { value: 0 }, uR: { value: RE },
  };
  const globe = new THREE.Mesh(new THREE.SphereGeometry(RE, 256, 128), new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(position); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uClouds; uniform vec3 uSun; uniform float uTime; uniform float uSpin;
      varying vec3 vN; varying vec3 vW;
      float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vW);
        float lon = atan(n.z, n.x) + uSpin, lat = asin(clamp(n.y, -1.0, 1.0));
        vec2 uv = vec2(lon / 6.2831853 + 0.5, lat / 3.14159265 + 0.5);
        float c1 = texture2D(uClouds, uv + vec2(uTime * 0.006, 0.0)).r;
        float c2 = texture2D(uClouds, uv + vec2(-uTime * 0.004 + 0.37, 0.02)).r;
        float cloud = clamp(max(c1, c2 * 0.9) * 1.3 - 0.06, 0.0, 1.0);
        float ndl = dot(n, uSun);
        vec3 H = normalize(uSun + V);
        // the ocean: deep blue, brighter toward the rim, the Sun's glint
        vec3 sea = mix(vec3(0.01, 0.05, 0.13), vec3(0.04, 0.14, 0.3), pow(1.0 - max(dot(n, V), 0.0), 2.0));
        vec3 col = sea * (0.05 + 1.2 * max(ndl, 0.0));
        col += vec3(1.0, 0.88, 0.7) * pow(max(dot(n, H), 0.0), 400.0) * 1.6 * smoothstep(-0.05, 0.1, ndl);
        col += vec3(1.0, 0.88, 0.7) * pow(max(dot(n, H), 0.0), 40.0) * 0.04 * smoothstep(-0.05, 0.1, ndl);
        float cl = smoothstep(0.12, 0.8, cloud);
        vec3 cc = vec3(0.9, 0.92, 0.96) * (0.03 + 1.0 * max(ndl + 0.05, 0.0));
        col = mix(col, cc, cl * 0.92);
        // lightning in the storms, more on the night side
        vec2 cell = floor(uv * vec2(160.0, 80.0));
        float fl = step(0.982, h1(cell + floor(uTime * 8.0))) * cl;
        col += vec3(0.6, 0.65, 1.0) * fl * (0.4 + 1.6 * (1.0 - smoothstep(-0.12, 0.05, ndl)));
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  scene.add(globe);
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(RE * 1.02, 128, 64), new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(position); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uSun; varying vec3 vN; varying vec3 vW; void main(){
      vec3 V = normalize(cameraPosition - vW); vec3 n = normalize(vN);
      float rim = pow(1.0 - abs(dot(n, V)), 3.0);
      float lit = smoothstep(-0.3, 0.4, dot(n, uSun));
      vec3 c = mix(vec3(1.0, 0.45, 0.2), vec3(0.3, 0.55, 1.0), smoothstep(-0.05, 0.4, dot(n, uSun)));
      gl_FragColor = vec4(c * rim * lit * 1.6, 1.0); }`,
  }));
  scene.add(atmo);
  // the rain falling in from every side: streaks along the radius, falling from 1.6 R to the surface over and over
  const N = 9000;
  const rg = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const a = new Float32Array(N * 4);
  let sd = 11;
  const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N; i++) { const z = r() * 2 - 1, ph = r() * 6.283, q = Math.sqrt(1 - z * z); a.set([Math.cos(ph) * q, z, Math.sin(ph) * q, r()], i * 4); }
  rg.setAttribute('aD', new THREE.InstancedBufferAttribute(a, 4));
  const ru = { uR: u.uR, uTime: u.uTime, uSun: u.uSun, uK: { value: 0 } };
  const rain = new THREE.InstancedMesh(rg, new THREE.ShaderMaterial({
    uniforms: ru, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec4 aD; uniform float uR; uniform float uTime; varying float vA; varying vec2 vUv; varying float vLit;
      uniform vec3 uSun;
      void main() {
        vec3 d = normalize(aD.xyz);
        float ph = fract(aD.w + uTime * 0.7);
        float rr = uR * (1.0 + 0.6 * (1.0 - ph));
        float len = uR * 0.09;
        vec3 c = d * rr;
        vec3 toC = normalize(cameraPosition - c);
        vec3 side = normalize(cross(d, toC));
        vec3 w = c + d * position.y * len + side * position.x * uR * 0.0016;
        vA = smoothstep(0.0, 0.15, ph) * smoothstep(1.0, 0.9, ph);
        vLit = 0.25 + 0.75 * smoothstep(-0.2, 0.3, dot(d, normalize(uSun)));
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: `uniform float uK; varying float vA; varying vec2 vUv; varying float vLit; void main(){
      float a = (1.0 - abs(vUv.x * 2.0 - 1.0)) * vUv.y;
      gl_FragColor = vec4(vec3(0.55, 0.7, 1.0) * a * vA * vLit * uK, 1.0); }`,
  }), N);
  rain.frustumCulled = false;
  scene.add(rain);
  // stars
  {
    const NS = 6000, p = new Float32Array(NS * 3), cA = new Float32Array(NS * 3);
    for (let i = 0; i < NS; i++) {
      const z = r() * 2 - 1, ph = r() * 6.283, q = Math.sqrt(1 - z * z);
      p.set([Math.cos(ph) * q * 2e6, z * 2e6, Math.sin(ph) * q * 2e6], i * 3);
      const b = Math.pow(r(), 4) * 1.5 + 0.1;
      cA.set([b, b * 0.97, b * (0.9 + r() * 0.2)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.BufferAttribute(cA, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true }));
    stars.frustumCulled = false;
    scene.add(stars);
  }
  // the Moon, 384,400 km off, lit by the same Sun
  const moon = new THREE.Mesh(new THREE.SphereGeometry(1737, 64, 32), new THREE.MeshStandardMaterial({ color: 0x9a968f, roughness: 1 }));
  scene.add(moon);
  const sunL = new THREE.DirectionalLight(0xffffff, 2.2);
  scene.add(sunL, sunL.target);
  scene.add(new THREE.AmbientLight(0xffffff, 0.03));
  // your point: a small bright glow (sized in main.js so it stays a few pixels across)
  const dotTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,240,170,1)'); gr.addColorStop(0.25, 'rgba(255,200,60,0.85)'); gr.addColorStop(1, 'rgba(255,170,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  })();
  const you = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  scene.add(you);
  return {
    scene, u, ready, globe, rain: ru, moon, you,
    // R: the ball's radius (km)
    frame(v, R, youDir, cam) {
      u.uTime.value = v; u.uSpin.value = v * 0.004; u.uR.value = R;
      globe.scale.setScalar(R / RE); atmo.scale.setScalar(R / RE);
      sunL.position.copy(u.uSun.value).multiplyScalar(1e6);
      you.position.copy(youDir).multiplyScalar(R * 1.0005);
      const d = cam.position.distanceTo(you.position);
      you.scale.setScalar(d * 0.012);
    },
  };
}

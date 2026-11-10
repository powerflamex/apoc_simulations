// Space, after Everest: Earth with no land left, one ocean wrapped in storms (NASA's cloud map, public domain,
// stirred so the storms turn), the Sun's glint on the water, a thin blue rim of air, stars. Its own scene (km units,
// Earth's centre at the origin). The camera dives back down at the end; the sea surface closes over it.
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
    uClouds: { value: clouds }, uSun: { value: new THREE.Vector3(-0.55, 0.35, 0.76).normalize() }, uTime: { value: 0 },
    uFlash: { value: 0 }, uSpin: { value: 0 },
  };
  const globe = new THREE.Mesh(new THREE.SphereGeometry(RE, 256, 128), new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(position); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uClouds; uniform vec3 uSun; uniform float uTime; uniform float uFlash; uniform float uSpin;
      varying vec3 vN; varying vec3 vW;
      float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vW);
        float lon = atan(n.z, n.x) + uSpin, lat = asin(clamp(n.y, -1.0, 1.0));
        vec2 uv = vec2(lon / 6.2831853 + 0.5, lat / 3.14159265 + 0.5);
        // the storms turn: two copies of the cloud map, drifting against each other
        float c1 = texture2D(uClouds, uv + vec2(uTime * 0.004, 0.0)).r;
        float c2 = texture2D(uClouds, uv * vec2(1.0, 1.0) + vec2(-uTime * 0.003 + 0.37, 0.02)).r;
        float cloud = clamp(max(c1, c2 * 0.9) * 1.25 - 0.08, 0.0, 1.0);
        float ndl = dot(n, uSun);
        vec3 H = normalize(uSun + V);
        // the ocean: deep blue, brighter toward the rim, the Sun's glint
        vec3 sea = mix(vec3(0.004, 0.02, 0.06), vec3(0.02, 0.07, 0.15), pow(1.0 - max(dot(n, V), 0.0), 2.0));
        vec3 col = sea * (0.04 + 1.1 * max(ndl, 0.0));
        col += vec3(1.0, 0.85, 0.65) * pow(max(dot(n, H), 0.0), 400.0) * 3.0 * smoothstep(-0.05, 0.1, ndl);
        col += vec3(1.0, 0.85, 0.65) * pow(max(dot(n, H), 0.0), 40.0) * 0.08 * smoothstep(-0.05, 0.1, ndl);
        float cl = smoothstep(0.15, 0.85, cloud);
        vec3 cc = vec3(0.92, 0.94, 0.97) * (0.02 + 1.0 * max(ndl + 0.05, 0.0));
        col = mix(col, cc, cl * 0.95);
        // lightning flickering inside the storms on the night side
        float night = 1.0 - smoothstep(-0.12, 0.05, ndl);
        vec2 cell = floor(uv * vec2(180.0, 90.0));
        float fl = step(0.985, h1(cell + floor(uTime * 7.0))) * cl;
        col += vec3(0.6, 0.65, 1.0) * fl * night * 1.5;
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  scene.add(globe);
  // the air: a blue rim, warm at the terminator
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(RE + 120, 128, 64), new THREE.ShaderMaterial({
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
  // stars
  {
    const N = 5000, p = new Float32Array(N * 3), cA = new Float32Array(N * 3);
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < N; i++) {
      const z = r() * 2 - 1, a = r() * 6.283, q = Math.sqrt(1 - z * z);
      p.set([Math.cos(a) * q * 1e6, z * 1e6, Math.sin(a) * q * 1e6], i * 3);
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
  scene.add(new THREE.AmbientLight(0xffffff, 0.1));
  return { scene, u, ready, globe };
}

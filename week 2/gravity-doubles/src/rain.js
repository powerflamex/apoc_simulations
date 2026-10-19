// The clouds raining out: once they are heavy enough the droplets fall straight out of them. Streaks round the
// camera, falling at the terminal speed of the moment (raindrops: ~9 m/s x sqrt(g), so ~90 m/s at 100x),
// stretched by the camera's 1/60 s exposure.
import * as THREE from 'three';

export function makeRain(scene, n = 5000) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const a = new Float32Array(n * 4);
  let s = 12345;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < n; i++) a.set([(r() - 0.5) * 70, (r() - 0.5) * 70, r(), 0.6 + r() * 0.8], i * 4);
  geo.setAttribute('aR', new THREE.InstancedBufferAttribute(a, 4));
  geo.instanceCount = n;
  const u = { uTime: { value: 0 }, uSpeed: { value: 90 }, uOn: { value: 0 }, uCam: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color(0.75, 0.72, 0.78) } };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec4 aR; uniform float uTime; uniform float uSpeed; uniform vec3 uCam;
      varying float vA; varying float vX;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        const float H = 40.0;
        float y = H - fract(uTime * uSpeed * aR.w / H + aR.z) * H;
        vec3 c = vec3(uCam.x + aR.x, y, uCam.z - 20.0 + aR.y);
        float len = uSpeed * aR.w / 60.0 * 1.2;
        // a thin vertical streak facing the camera
        vec3 toCam = normalize(vec3(cameraPosition.x - c.x, 0.0, cameraPosition.z - c.z));
        vec3 side = vec3(toCam.z, 0.0, -toCam.x);
        vec3 p = c + side * position.x * 0.012 * (1.0 + length(c - cameraPosition) * 0.01) + vec3(0.0, position.y * len, 0.0);
        vA = smoothstep(0.0, 1.0, y) * (0.6 + 0.4 * aR.w);
        vX = position.x;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOn; uniform vec3 uColor; varying float vA; varying float vX;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        gl_FragColor = vec4(uColor, uOn * vA * 0.32 * (1.0 - abs(vX) * 1.6));
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 7;
  scene.add(mesh);
  return { mesh, u };
}

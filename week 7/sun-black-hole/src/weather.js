// What falls through the air round you, all of it on the GPU as a pure function of time (each particle loops down a fixed
// box round the camera): diamond dust after the front (ice crystals glittering in the sun), dry-ice snow at 0:18, then the
// air itself: rain of liquid air from 0:21, pouring at 0:24, and snow of solid air from 0:27. Plus the gust of crystals
// streaming past you as the front goes by.
import * as THREE from 'three';

const N = 22000;

export function makeWeather(scene, cam0) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const seed = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) { seed[i * 4] = Math.random(); seed[i * 4 + 1] = Math.random(); seed[i * 4 + 2] = Math.random(); seed[i * 4 + 3] = i % 4; }
  // (deterministic: overwrite with a seeded sequence so every render matches)
  { let a = 12345; const r = () => ((a = (a * 1103515245 + 12345) >>> 0) / 4294967296); for (let i = 0; i < N * 4; i++) seed[i] = i % 4 === 3 ? (Math.floor(i / 4) % 4) : r(); }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  geo.instanceCount = N;
  const uniforms = {
    uTime: { value: 0 }, uC: { value: new THREE.Vector3(cam0.x, -16, cam0.z) }, uYaw: { value: 0 },
    uDiamond: { value: 0 }, uDust: { value: 0 }, uRain: { value: 0 }, uSnow: { value: 0 }, uGust: { value: 0 },
    uSky: { value: new THREE.Color(0.6, 0.75, 0.95) }, uLight: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime; uniform vec3 uC; uniform float uYaw; uniform float uDiamond; uniform float uDust; uniform float uRain; uniform float uSnow; uniform float uGust;
      varying vec2 vUv; varying float vKind; varying float vA; varying float vTw;
      void main() {
        float kind = aSeed.w;           // 0 rain, 1 snow, 2 glitter (diamond dust and dry ice), 3 gust
        vKind = kind; vUv = position.xy;
        // the box: 70 m wide, 34 m tall, from 75 m ahead of you to 4 m behind (nearer ones are denser)
        float zz = pow(aSeed.y, 1.6);
        vec3 b = vec3((aSeed.x - 0.5) * (14.0 + 70.0 * zz), 0.0, -zz * 75.0 + 4.0);
        b.xz = vec2(cos(uYaw) * b.x + sin(uYaw) * b.z, -sin(uYaw) * b.x + cos(uYaw) * b.z);
        float H = 52.0, sp, len, wid, amt;
        if (kind < 0.5) { sp = 11.0; len = 1.1; wid = 0.024; amt = uRain; }
        else if (kind < 1.5) { sp = 1.3 + 0.6 * aSeed.z; len = 0.04 + 0.025 * aSeed.z; wid = len; amt = uSnow; }
        else if (kind < 2.5) { sp = 0.35 + 0.5 * aSeed.z + 0.8 * uDust; len = 0.022 + 0.02 * uDust; wid = len; amt = max(uDiamond, uDust * 1.6); H = 36.0; }
        else { sp = 0.0; len = 0.035; wid = 0.035; amt = uGust; H = 9.0; }
        float y = H - mod(uTime * sp + aSeed.z * H * 7.3, H);
        // snow and glitter drift and sway
        b.x += (kind > 0.5 ? sin(uTime * (0.6 + aSeed.z) + aSeed.x * 40.0) * 0.6 : 0.0);
        b.z += (kind > 0.5 ? cos(uTime * (0.5 + aSeed.x) + aSeed.z * 30.0) * 0.4 : 0.0);
        if (kind > 2.5) {
          // the gust: crystals streaming past you from ahead, at the front's speed
          float L = 60.0, zz2 = mod(uTime * 40.0 + aSeed.z * L, L);
          b = vec3((aSeed.x - 0.5) * 10.0, 16.3 + aSeed.y * 7.0, -L + zz2 + 6.0);
          y = 0.0;
        }
        // only part of the box is filled as the amount rises
        vA = step(aSeed.x * 0.7 + aSeed.z * 0.3, amt * 1.02) * min(amt * 3.0, 1.0);
        vTw = aSeed.z;
        vec3 wp = uC + b + vec3(0.0, y, 0.0);
        // face the camera around the vertical axis (rain streaks), or fully (flakes)
        vec3 toC = normalize(cameraPosition - wp);
        vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toC));
        vec3 upv = kind < 0.5 ? vec3(0.0, 1.0, 0.0) : normalize(cross(toC, right));
        // (a minimum size of about a pixel, so far drops shimmer less)
        float d = length(cameraPosition - wp);
        float px = d * 0.0006;
        float w = max(wid, px), l = kind < 0.5 ? len : max(len, px);
        vA *= kind < 0.5 ? min(1.0, wid / w * 1.5) : 1.0;
        vA *= smoothstep(2.5, 6.0, d);             // (nothing right against the lens)
        wp += right * position.x * w + upv * (position.y - 0.5) * l;
        if (amt < 0.001) wp = vec3(0.0, -1e5, 0.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uSky; uniform float uLight;
      varying vec2 vUv; varying float vKind; varying float vA; varying float vTw;
      void main() {
        if (vA < 0.01) discard;
        vec2 q = vec2(vUv.x * 2.0, vUv.y * 2.0 - 1.0);
        float a;
        vec3 c;
        if (vKind < 0.5) { a = (1.0 - q.x * q.x) * (1.0 - q.y * q.y) * 0.7; c = vec3(0.95, 0.98, 1.05) * uLight * 1.35; }
        else if (vKind < 1.5) { float r = length(q); if (r > 1.0) discard; a = smoothstep(1.0, 0.3, r) * 0.95; c = vec3(0.97, 0.98, 1.0) * uLight * 1.1; }
        else { float r = length(q); if (r > 1.0) discard; a = smoothstep(1.0, 0.0, r); float tw = 0.4 + 0.6 * pow(0.5 + 0.5 * sin(uTime * (5.0 + 9.0 * vTw) + vTw * 60.0), 3.0); c = vec3(1.3, 1.4, 1.6) * tw * 1.6; }
        gl_FragColor = vec4(c, a * vA);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 7;
  scene.add(mesh);
  return { uniforms };
}

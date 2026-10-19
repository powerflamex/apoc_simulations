// Specks rushing past you (you fall, so they stream up): ice crystals, brown haze, rain, dust in your lamp,
// embers in the glowing air, diamonds, and blobs of the hot hydrogen ocean. One instanced quad per speck,
// stretched along its motion on screen (a long exposure), wrapped in a box around the camera.
import * as THREE from 'three';

export function makeStreaks(count = 3000, box = 26) {
  const quad = new THREE.InstancedBufferGeometry();
  quad.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
  quad.setIndex([0, 1, 2, 0, 2, 3]);
  const seed = new Float32Array(count * 4);
  let a = 12345;
  const r = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count * 4; i++) seed[i] = r();
  quad.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  quad.instanceCount = count;
  const u = {
    uBox: { value: box }, uOffset: { value: new THREE.Vector3() }, uCenter: { value: new THREE.Vector3() },
    uVel: { value: new THREE.Vector3(0, 10, 0) }, uShutter: { value: 1 / 60 }, uRes: { value: new THREE.Vector2(1080, 1920) },
    uColor: { value: new THREE.Color(1, 1, 1) }, uAlpha: { value: 0 }, uSize: { value: 0.01 }, uCount: { value: 1 },
    uLampPos: { value: new THREE.Vector3() }, uLampDir: { value: new THREE.Vector3(0, -1, 0) }, uLamp: { value: 0 },
    uSparkle: { value: 0 }, uTime: { value: 0 }, uLit: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uBox; uniform vec3 uOffset; uniform vec3 uCenter; uniform vec3 uVel; uniform float uShutter;
      uniform vec2 uRes; uniform float uSize; uniform float uCount; uniform vec3 uLampPos; uniform vec3 uLampDir;
      uniform float uLamp; uniform float uSparkle; uniform float uTime; uniform float uLit;
      varying float vA; varying float vAcross; varying float vSpark;
      void main() {
        vA = 0.0; vAcross = position.y; vSpark = 0.0;
        if (aSeed.w > uCount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        vec3 p = mod(aSeed.xyz * uBox + uOffset - uCenter + uBox * 0.5, uBox) - uBox * 0.5 + uCenter;
        vec3 vel = uVel * (0.7 + 0.6 * fract(aSeed.w * 7.3));
        vec3 q = p - vel * uShutter;
        vec4 c0 = projectionMatrix * viewMatrix * vec4(p, 1.0);
        vec4 c1 = projectionMatrix * viewMatrix * vec4(q, 1.0);
        if (c0.w < 0.05 || c1.w < 0.05) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        vec2 s0 = c0.xy / c0.w * 0.5 * uRes, s1 = c1.xy / c1.w * 0.5 * uRes;
        vec2 d = s1 - s0; float len = length(d);
        vec2 dir = len > 1e-3 ? d / len : vec2(0.0, 1.0);
        vec2 nrm = vec2(-dir.y, dir.x);
        float size = uSize * (0.5 + fract(aSeed.w * 13.7));
        float w = size / c0.w * uRes.y * 0.6;                   // width in px (focal length ~0.6 x height at 80°)
        float wpx = max(w, 1.2);
        vec2 s = mix(s0, s1, position.x) + nrm * position.y * wpx * 0.5 - dir * (1.0 - 2.0 * position.x) * wpx * 0.5;
        float z = mix(c0.z / c0.w, c1.z / c1.w, position.x);
        gl_Position = vec4(s / (0.5 * uRes), z, 1.0);
        // brightness: thinner than a pixel -> dimmer; longer streak -> the same light spread out
        float a = min(w / 1.2, 1.0) * wpx / (wpx + len * 0.25);
        // near the camera, fade (no huge blobs)
        a *= smoothstep(0.25, 1.2, c0.w) * smoothstep(uBox * 0.5, uBox * 0.3, length(p - uCenter));
        // lit by the helmet lamp: only inside its cone
        float lit = uLit;
        if (uLamp > 0.0) {
          vec3 lp = p - uLampPos; float ld = length(lp);
          float cone = smoothstep(0.86, 0.95, dot(lp / ld, uLampDir));
          lit += uLamp * cone * 40.0 / (1.0 + ld * ld * 0.15);
        }
        // diamonds: each glints now and then
        float sp = 0.0;
        if (uSparkle > 0.0) { sp = pow(max(0.0, sin(uTime * (2.0 + 5.0 * aSeed.y) + aSeed.x * 40.0)), 10.0) * uSparkle; }
        vSpark = sp;
        vA = a * (lit + sp * 6.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAlpha;
      varying float vA; varying float vAcross; varying float vSpark;
      void main() {
        float e = 1.0 - vAcross * vAcross;
        vec3 c = mix(uColor, vec3(1.0, 1.0, 1.0), clamp(vSpark, 0.0, 1.0));
        gl_FragColor = vec4(c * vA * uAlpha * e, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(quad, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return { mesh, u };
}

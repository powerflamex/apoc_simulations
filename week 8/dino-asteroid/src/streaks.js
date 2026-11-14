// Streaks: instanced quads between a tail and a head point, both projected and widened in screen pixels (from
// meteor-storm). kind 2: a white-hot trail with orange edges; 3: an ember (a glowing rock with a dull red tail);
// 4: a fiery trail turning to smoke further back (seed, age: vS.y = the head's radius in px).
import * as THREE from 'three';

export function makeStreaks(scene, max = 4000) {
  const geo = new THREE.PlaneGeometry(1, 2, 1, 1).translate(0.5, 0, 0);    // x 0..1 along, y -1..1 across
  const aA = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);    // tail xyz, half-width (px)
  const aB = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);    // head xyz, half-width (px)
  const aK = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);    // rgb, kind (0 meteor, 1 train, 2 fireball, 3 ember)
  const aS = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2);    // seed, age
  geo.setAttribute('aA', aA); geo.setAttribute('aB', aB); geo.setAttribute('aK', aK); geo.setAttribute('aS', aS);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uRes: { value: new THREE.Vector2(1080, 1920) }, uTime: { value: 0 }, uGain: { value: 1 } },
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec4 aA; attribute vec4 aB; attribute vec4 aK; attribute vec2 aS;
      uniform vec2 uRes;
      varying vec2 vQ; varying vec4 vK; varying vec2 vS; varying float vLen;
      void main() {
        vec4 ca = projectionMatrix * viewMatrix * vec4(aA.xyz, 1.0);
        vec4 cb = projectionMatrix * viewMatrix * vec4(aB.xyz, 1.0);
        vK = aK; vS = aS;
        if (ca.w < 0.05 || cb.w < 0.05) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        vec2 pa = ca.xy / ca.w * 0.5 * uRes, pb = cb.xy / cb.w * 0.5 * uRes;
        vec2 d = pb - pa; float L = length(d);
        vec2 dir = L > 1e-3 ? d / L : vec2(0.0, 1.0), n = vec2(-dir.y, dir.x);
        float s = position.x;
        float w = mix(aA.w, aB.w, s);
        // the caps: the quad runs a half-width past each end
        float cap = (s < 0.5 ? -1.0 : 1.0) * max(aA.w, aB.w);
        vec4 c = mix(ca, cb, s);
        vec2 off = n * position.y * w + dir * cap;
        c.xy += off / (0.5 * uRes) * c.w;
        gl_Position = c;
        vLen = L;
        vQ = vec2(s * L + cap, position.y * w);          // pixels along (0 at the tail) and across
        vQ = vec2(vQ.x / max(L, 1e-3), position.y);
        vS.y = aS.y; vLen = L + 2.0 * abs(cap);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uGain;
      varying vec2 vQ; varying vec4 vK; varying vec2 vS; varying float vLen;
      float h(float x){ return fract(sin(x * 91.7) * 43758.5); }
      float n1(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h(i), h(i + 1.0), f); }
      float h2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float q2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
      float fb(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * q2(p); p = p * 2.07 + 1.3; a *= 0.5; } return s; }
      void main() {
        float s = vQ.x, y = vQ.y;
        float kind = vK.w;
        vec3 c = vK.rgb;
        float a;
        float ends = smoothstep(-0.02, 0.06, s) * (1.0 - smoothstep(1.0, 1.04 + 4.0 / max(vLen, 1.0), s));
        if (kind < 0.5) {
          // a meteor: thin, brightest at the head, fading back along the tail; a blue-green head, warmer tail
          float core = exp(-y * y * 5.0);
          float along = pow(clamp(s, 0.0, 1.0), 2.2);
          a = core * along * ends;
          c = mix(c * vec3(1.15, 0.85, 0.7), c * vec3(0.8, 1.1, 1.15), smoothstep(0.6, 1.0, s));
        } else if (kind < 1.5) {
          // a train: a soft green band, lumpy along its length, fading with age
          float lump = 0.45 + 0.55 * n1(s * 18.0 + vS.x * 40.0 + vS.y * 0.6) * n1(s * 7.0 - vS.x * 13.0);
          a = exp(-y * y * 2.2) * lump * smoothstep(0.0, 0.12, s) * (1.0 - smoothstep(0.85, 1.0, s));
        } else if (kind < 2.5) {
          // a fireball's trail: a white-hot core, orange edges, flickering
          float core = exp(-y * y * 7.0), edge = exp(-y * y * 1.6);
          float along = pow(clamp(s, 0.0, 1.0), 1.4);
          float fl = 0.8 + 0.2 * n1(s * 30.0 - uTime * 40.0 + vS.x * 9.0);
          c = c * core * 1.4 + vec3(1.0, 0.42, 0.1) * edge * 0.6 * length(c);
          a = along * fl * ends;
        } else if (kind > 3.5) {
          // the biggest one's trail: fire by the rock turning to glowing smoke further back; turbulence rushing back;
          // torn, crisp edges (vS.y: the rock's radius in pixels)
          float u = (1.0 - s) * vLen / max(vS.y, 1.0);          // rock radii back from the rock
          float n = fb(vec2(u * 0.55 - uTime * 6.0, y * 2.2 + 3.0)) * 0.7 + fb(vec2(u * 1.6 - uTime * 11.0, y * 5.0)) * 0.3;
          float edge = abs(y) + (n - 0.5) * 0.85;
          float body = 1.0 - smoothstep(0.42, 0.62, edge);
          float core = exp(-y * y * 9.0);
          float fireK = max(exp(-u / 14.0), smoothstep(0.55, 1.0, s));
          vec3 fire = mix(vec3(1.0, 0.32, 0.05), vec3(1.0, 0.8, 0.45), core * fireK * (0.5 + 0.6 * n));
          vec3 smk = vec3(0.32, 0.2, 0.13) * (0.35 + 0.8 * n);
          c *= mix(smk, fire * (0.55 + 0.9 * n), fireK);
          a = body * ends * (0.3 + 0.7 * s) * smoothstep(0.0, 0.08, s);
        } else {
          // an ember: a short glowing streak with a dull red tail (a rock still glowing as it falls)
          float core = exp(-y * y * 4.0);
          float along = pow(clamp(s, 0.0, 1.0), 1.6);
          c = mix(c * vec3(1.0, 0.35, 0.12), c, smoothstep(0.7, 1.0, s) * core);
          a = core * along * ends;
        }
        gl_FragColor = vec4(c * a * uGain, 1.0);
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false; mesh.renderOrder = 4;
  scene.add(mesh);
  let n = 0;
  return {
    mat,
    begin() { n = 0; },
    // tail, head: world positions; wa, wb: half-widths (px); colour; kind
    add(tail, head, wa, wb, r, g, b, kind = 0, seed = 0, age = 0) {
      if (n >= max || r + g + b < 0.002) return;
      aA.setXYZW(n, tail.x, tail.y, tail.z, wa); aB.setXYZW(n, head.x, head.y, head.z, wb);
      aK.setXYZW(n, r, g, b, kind); aS.setXY(n, seed, age); n++;
    },
    end() { mesh.count = n; for (const a of [aA, aB, aK, aS]) a.needsUpdate = true; },
  };
}

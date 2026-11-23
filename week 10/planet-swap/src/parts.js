// Particles, one draw call: camera-facing quads filled in the shader, refilled every frame by whoever needs them.
//   parts.add(x, y, z, size, vx, vy, vz, kind, r, g, b, a, seed)
// kinds: 0 a soft round blob (dust, steam, spray), 1 a streak drawn out along its velocity (rain, blown sand, ice;
// uShutter s of motion), 2 a drop (a clear ball with a bright rim and a highlight: Titan's methane rain), 3 a spark or
// glint (added light), 4 a chip of stuff tumbling (scraps of cloth, sand clods, ice), 5 a shard (the frozen umbrella).
import * as THREE from 'three';

export function makeParts(scene, max = 9000) {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  const aP = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
  const aV = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
  const aC = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
  const aS = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
  geo.setAttribute('aP', aP); geo.setAttribute('aV', aV); geo.setAttribute('aC', aC); geo.setAttribute('aS', aS);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uShutter: { value: 1 / 60 }, uT: { value: 0 } },
    // (double-sided: a streak's quad faces away from the camera when it falls)
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: /* glsl */ `
      attribute vec4 aP; attribute vec4 aV; attribute vec4 aC; attribute float aS;
      uniform float uShutter; uniform float uT;
      varying vec2 vUv; varying vec4 vC; varying float vKind; varying float vS;
      void main() {
        vUv = uv; vC = aC; vKind = aV.w; vS = aS;
        vec4 mv = viewMatrix * vec4(aP.xyz, 1.0);
        float size = aP.w;
        if (aV.w > 0.5 && aV.w < 1.5) {
          // a streak: from where it was a shutter ago to where it is
          vec4 mt = viewMatrix * vec4(aP.xyz - aV.xyz * uShutter, 1.0);
          vec2 a = mt.xy / -mt.z, b = mv.xy / -mv.z;
          vec2 dd = b - a; float L = length(dd);
          vec2 dir = L > 1e-6 ? dd / L : vec2(0.0, 1.0);
          vec2 perp = vec2(-dir.y, dir.x);
          vec4 m = mix(mt, mv, position.y + 0.5);
          m.xy += perp * position.x * size * (-m.z) / max(-mv.z, 1e-3) + dir * position.y * size * 0.6;
          gl_Position = projectionMatrix * m;
        } else {
          float r = aS * 6.2832 + uT * (aV.w > 3.5 ? 3.0 + 4.0 * aS : 0.0);
          vec2 q = position.xy;
          if (aV.w > 3.5) q = mat2(cos(r), sin(r), -sin(r), cos(r)) * (q * vec2(1.0, 0.45 + 0.5 * aS));
          mv.xy += q * size;
          gl_Position = projectionMatrix * mv;
        }
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying vec4 vC; varying float vKind; varying float vS;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        vec3 c = vC.rgb; float a = vC.a;
        if (vKind < 0.5) { a *= exp(-r * r * 3.2) * (1.0 - smoothstep(0.85, 1.0, r)); }
        else if (vKind < 1.5) { a *= exp(-p.x * p.x * 5.0) * smoothstep(-1.0, -0.2, p.y) * (1.0 - smoothstep(0.7, 1.0, p.y)); }
        else if (vKind < 2.5) {
          if (r > 1.0) discard;
          // a clear drop: darker inside (it bends the sky upside down), a bright rim, a sharp highlight up and left
          float rim = smoothstep(0.62, 0.95, r);
          float hl = exp(-dot(p - vec2(-0.35, 0.38), p - vec2(-0.35, 0.38)) * 40.0);
          c = c * (0.45 + 0.5 * (0.5 - 0.5 * p.y)) + c * rim * 0.9 + vec3(1.0) * hl * 1.6;
          a *= 0.55 + 0.4 * rim + hl;
          a = min(a, 1.0) * (1.0 - smoothstep(0.92, 1.0, r));
        } else if (vKind < 3.5) {
          a *= exp(-r * r * 6.0);
          gl_FragColor = vec4(c * a, 0.0);
          return;
        } else if (vKind < 4.5) {
          if (max(abs(p.x), abs(p.y)) > 0.92) discard;
          c *= 0.8 + 0.3 * (0.5 + 0.5 * p.y);
        } else {
          // a shard of something frozen: a sliver of a triangle, a bright edge that catches the light
          float e = min(p.y + 0.5, 1.0 - 1.732 * abs(p.x) - p.y);
          if (e < 0.0) discard;
          c *= 0.75 + 0.35 * (0.5 + 0.5 * p.y) + 0.8 * (1.0 - smoothstep(0.0, 0.12, e));
        }
        gl_FragColor = vec4(c * a, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  scene.add(mesh);
  let n = 0;
  return {
    mat, mesh,
    begin() { n = 0; },
    add(x, y, z, size, vx, vy, vz, kind, r, g, b, a, seed = 0) {
      if (n >= max || a <= 0.002 || size <= 0) return;
      aP.setXYZW(n, x, y, z, size); aV.setXYZW(n, vx, vy, vz, kind); aC.setXYZW(n, r, g, b, a); aS.setX(n, seed);
      n++;
    },
    end() {
      geo.instanceCount = n;
      aP.needsUpdate = true; aV.needsUpdate = true; aC.needsUpdate = true; aS.needsUpdate = true;
      mesh.visible = n > 0;
    },
  };
}

// Your path as rings of light: each lap is a circle (centre, radius, two axes); the newest one is drawn only up
// to where you are now (bright at the head, fading behind), older laps fade out. Drawn as screen-space ribbons
// (constant width in pixels), additive, hidden behind the planet by the depth buffer.
//   const rings = makeRings(max); rings.set(i, center, radius, a, b, headPhi, arcLen, alpha); rings.count = n; rings.commit()
import * as THREE from 'three';

export function makeRings(MAX = 512, SEGS = 192) {
  const data = new Float32Array(MAX * 3 * 4);
  const tex = new THREE.DataTexture(data, MAX, 3, THREE.RGBAFormat, THREE.FloatType);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;

  const base = new THREE.InstancedBufferGeometry();
  const seg = [], side = [], idx = [];
  for (let i = 0; i <= SEGS; i++) for (const s of [-1, 1]) { seg.push(i / SEGS); side.push(s); }
  for (let i = 0; i < SEGS; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  base.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(seg.length * 3), 3));
  base.setAttribute('aSeg', new THREE.Float32BufferAttribute(seg, 1));
  base.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  base.setIndex(idx);
  base.setAttribute('aRing', new THREE.InstancedBufferAttribute(Float32Array.from({ length: MAX }, (_, i) => i), 1));
  base.instanceCount = 0;

  const uniforms = {
    uData: { value: tex }, uMax: { value: MAX }, uRes: { value: new URLSearchParams(location.search).has('wide') ? new THREE.Vector2(1920, 1080) : new THREE.Vector2(1080, 1920) },
    uWidth: { value: 3.0 }, uColor: { value: new THREE.Color(1.0, 0.82, 0.6) }, uGain: { value: 1.0 }, uHeadGlow: { value: 1.0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSeg; attribute float aSide; attribute float aRing;
      uniform sampler2D uData; uniform float uMax; uniform vec2 uRes; uniform float uWidth;
      varying float vSide; varying float vBright;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      vec4 fetch(float row) { return texture2D(uData, vec2((aRing + 0.5) / uMax, (row + 0.5) / 3.0)); }
      void main() {
        vec4 A = fetch(0.0), Bv = fetch(1.0), C = fetch(2.0);
        float radius = A.w, alpha = Bv.w, head = C.w;
        float arc = abs(alpha) > 0.0 ? floor(alpha) / 1000.0 : 0.0;   // arc length (rad) packed in the integer part
        float a = fract(alpha) * 1.0001;                               // brightness in the fraction
        float phi = head - aSeg * arc;
        vec3 P = C.xyz + radius * (cos(phi) * A.xyz + sin(phi) * Bv.xyz);
        vec3 P2 = C.xyz + radius * (cos(phi + 0.01) * A.xyz + sin(phi + 0.01) * Bv.xyz);
        vec4 c1 = projectionMatrix * viewMatrix * vec4(P, 1.0);
        vec4 c2 = projectionMatrix * viewMatrix * vec4(P2, 1.0);
        vec2 s1 = c1.xy / c1.w * uRes, s2 = c2.xy / c2.w * uRes;
        vec2 dir = normalize(s2 - s1 + vec2(1e-6));
        vec2 perp = vec2(-dir.y, dir.x);
        // the head end is brightest and a little fatter; the trail fades out behind it
        float along = 1.0 - aSeg;
        float isHead = step(0.995, a);
        float headK = mix(1.0, along * along, isHead);
        a = min(a, 0.99);
        float w = uWidth * (0.7 + 0.6 * headK);
        c1.xy += perp * aSide * w / uRes * c1.w;
        gl_Position = c1;
        vSide = aSide;
        vBright = a * mix(0.15, 1.0, headK) * step(0.001, arc);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uGain;
      varying float vSide; varying float vBright;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        float core = exp(-vSide * vSide * 6.0);
        vec3 c = uColor * core * vBright * uGain;
        c += vec3(1.0) * pow(core, 4.0) * vBright * uGain * 0.6;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(base, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;

  return {
    mesh, uniforms,
    get count() { return base.instanceCount; },
    set count(n) { base.instanceCount = Math.min(n, MAX); },
    // center (Vector3), radius, axes a, b (unit Vector3s), head phase (rad), arc length (rad, <= 2pi), brightness 0..0.99
    // (pass 0.999 for the newest lap: bright at your position, fading behind)
    set(i, center, radius, a, b, head, arc, alpha) {
      if (i >= MAX) return;
      const o = i * 4;
      data.set([a.x, a.y, a.z, radius], o);
      data.set([b.x, b.y, b.z, Math.floor(Math.min(arc, 6.2832) * 1000) + Math.min(Math.max(alpha, 0), 0.999)], MAX * 4 + o);
      data.set([center.x, center.y, center.z, head], MAX * 8 + o);
    },
    commit() { tex.needsUpdate = true; },
  };
}

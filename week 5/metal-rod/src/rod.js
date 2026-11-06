// The rod: a 300 m solid tungsten cylinder with a conical tip, drawn as a real mesh in the scene (so the towers hide it
// where they should and it hides the far skyline). Brushed grey metal mirroring the sky and the Sun, with a bright
// specular line down its sunlit side; from 18 s its tip glows white-hot and the heat climbs the rod; from 24 s the
// burning air wraps it, streaming up its sides as ragged sheets of fire (three crossed sheets, additive, hollow in the
// middle so the rod still shows through). The mesh's origin is the tip's point; local y runs up the rod. All of it is
// drawn ROD_DRAW times bigger than real.
import * as THREE from 'three';
import { ROD_L, ROD_R, ROD_DRAW } from './timeline.js';
import { smooth } from './util.js';

const TIP = ROD_R * 2.4;

export function makeRod(scene) {
  const U = {
    uSun: { value: new THREE.Vector3(0, 1, 0) }, uGlow: { value: 0 }, uFire: { value: 0 }, uTime: { value: 0 }, uSkyLit: { value: 1 },
  };
  const cyl = new THREE.CylinderGeometry(ROD_R, ROD_R, ROD_L - TIP, 48, 1, false).translate(0, TIP + (ROD_L - TIP) / 2, 0);
  const cone = new THREE.ConeGeometry(ROD_R, TIP, 48, 1, true).rotateX(Math.PI).translate(0, TIP / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW; varying float vY;
      void main(){ vY = position.y; vW = (modelMatrix * vec4(position, 1.0)).xyz; vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
    fragmentShader: /* glsl */ `uniform vec3 uSun; uniform float uGlow; uniform float uFire; uniform float uTime; uniform float uSkyLit;
      varying vec3 vN; varying vec3 vW; varying float vY;
      float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z); }
      vec3 skyC(vec3 r) {
        float h = r.y;
        vec3 c = mix(vec3(0.70, 0.79, 0.90), vec3(0.13, 0.30, 0.70), pow(smoothstep(-0.02, 0.8, h), 0.62));
        c = mix(c, vec3(0.38, 0.36, 0.34), smoothstep(0.0, -0.15, h));
        return c * uSkyLit;
      }
      void main(){
        vec3 N = normalize(vN);
        vec3 V = normalize(cameraPosition - vW);
        vec3 R = reflect(-V, N);
        float nv = max(dot(N, V), 0.0);
        float fres = 0.08 + 0.92 * pow(1.0 - nv, 4.0);
        // brushed metal: fine streaks along the rod
        float brush = 0.85 + 0.3 * n3(vec3(atan(N.x, N.z) * 40.0, vY * 0.6, 1.0));
        vec3 base = vec3(0.26, 0.27, 0.29) * brush;
        float nl = max(dot(N, uSun), 0.0);
        vec3 col = base * (0.12 + 0.5 * nl) * uSkyLit;
        col += skyC(R) * (0.1 + 0.9 * fres) * 0.28 * brush;
        vec3 H = normalize(uSun + V);
        float nh = max(dot(N, H), 0.0);
        col += vec3(1.0, 0.97, 0.9) * (pow(nh, 90.0) * 1.6 + pow(nh, 12.0) * 0.25) * uSkyLit;
        // the heat: white at the tip, climbing the rod as the air burns round it, flickering
        float reach = ${ROD_L.toFixed(1)} * (0.05 + 0.04 * uFire);
        float heat = uGlow * exp(-vY / reach) * (0.9 + 0.1 * n3(vec3(vY * 0.1, uTime * 9.0, N.x * 3.0)));
        heat = clamp(heat * (1.0 + 0.6 * uFire), 0.0, 1.0);
        // dark metal, deep red, orange, and yellow-white only on the point itself, so the rod stays a solid thing
        vec3 hot = mix(vec3(0.75, 0.07, 0.01), vec3(1.7, 0.55, 0.07), smoothstep(0.25, 0.7, heat));
        hot = mix(hot, vec3(1.9, 1.5, 0.9), smoothstep(0.8, 1.0, heat));
        // still a round bar: darker toward its edges, with brighter streaks of molten metal running up it
        hot *= (0.4 + 0.6 * nv) * (0.75 + 0.5 * n3(vec3(atan(N.x, N.z) * 7.0, vY * 0.05 + uTime * 2.0, 2.0)));
        col = mix(col, hot, smoothstep(0.02, 0.35, heat));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(cyl, mat);
  mesh.scale.setScalar(ROD_DRAW);
  const tip = new THREE.Mesh(cone, mat);
  mesh.add(tip);
  mesh.frustumCulled = false; tip.frustumCulled = false;
  scene.add(mesh);

  // the trail: three crossed sheets rising from the tail, widening as they go, streaming upward
  const TU = { uTime: U.uTime, uLen: { value: 0 }, uFire: U.uFire, uRad: { value: ROD_R } };
  const sheets = [];
  for (let k = 0; k < 3; k++) {
    const g = new THREE.PlaneGeometry(1, 1, 1, 24).translate(0, 0.5, 0).rotateY(k * Math.PI / 3);
    sheets.push(g);
  }
  const trailGeo = mergeGeos(sheets);
  const trailMat = new THREE.ShaderMaterial({
    uniforms: TU, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `uniform float uLen; uniform float uRad; varying vec2 vUv; varying float vT;
      void main(){
        float t = uv.y; vT = t; vUv = uv;
        // a quad of width 1 along its own x (already turned), from just under the tip up past the top of the rod
        vec3 p = position;
        float w = uRad * (3.6 + 3.0 * t);
        p.xz *= w; p.y = -uRad * 0.4 + t * uLen;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform float uFire; uniform float uLen; varying vec2 vUv; varying float vT;
      float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n3(p); p = p * 2.1 + 1.3; a *= 0.5; } return s; }
      void main(){
        float x = vUv.x * 2.0 - 1.0;
        float t = vT;
        // streaming up and away: noise scrolling up the sheet, ragged at the sides
        float n = fbm(vec3(x * 2.5, t * uLen / 60.0 - uTime * 3.0, 2.0));
        float n2 = n3(vec3(x * 7.0, t * uLen / 18.0 - uTime * 7.0, 5.0));
        float body = exp(-x * x * 2.6) * smoothstep(0.22, 0.62, n + 0.18 * n2);
        float hollow = 1.0 - 0.95 * exp(-x * x * 6.0);            // the rod itself stays visible
        float fade = pow(max(1.0 - t, 0.0), 1.4) * smoothstep(0.0, 0.02, t);
        float a = body * hollow * fade * uFire;
        vec3 c = mix(vec3(1.3, 0.38, 0.06), vec3(1.5, 1.0, 0.5), n2 * (1.0 - t));
        gl_FragColor = vec4(c, a * 0.13);
      }`,
  });
  const trail = new THREE.Mesh(trailGeo, trailMat);
  trail.frustumCulled = false;
  trail.renderOrder = 4;
  mesh.add(trail);

  const tmp = new THREE.Vector3();
  return {
    mesh, U, TU,
    // tipPos: the point of the tip in the world; the rod stands up from it
    frame(v, s, tipPos, glows) {
      mesh.position.copy(tipPos);
      mesh.visible = !s.hit;
      U.uGlow.value = s.glow;
      U.uFire.value = s.fire;
      U.uTime.value = v;
      TU.uLen.value = ROD_L * (0.3 + 0.5 * s.fire) * (0.92 + 0.08 * Math.sin(v * 3.1));
      trail.visible = s.fire > 0;
      if (s.hit) return;
      // the glow round the tip and up the burning rod (billboards, sized to the distance so they read from anywhere)
      const d = tmp.copy(tipPos).distanceTo(glows.cam);
      const k = d / 600;
      if (s.glow > 0) {
        const g = s.glow * (1 + 1.0 * s.fire);
        const yT = TIP * 0.5 * ROD_DRAW;
        glows.add(tipPos.x, tipPos.y + yT, tipPos.z, (18 + 24 * s.fire) * k, 0.5 * g, 0.26 * g, 0.1 * g);
        glows.add(tipPos.x, tipPos.y + yT, tipPos.z, (60 + 100 * s.fire) * k, 0.2 * g, 0.07 * g, 0.015 * g);
      }
      if (s.fire > 0) {
        for (let i = 0; i < 6; i++) {
          const y = (TIP + (i + 0.5) / 6 * (ROD_L - TIP) * (0.3 + 0.7 * s.fire)) * ROD_DRAW;
          const fl = 0.8 + 0.2 * Math.sin(v * 17 + i * 2.1);
          glows.add(tipPos.x, tipPos.y + y, tipPos.z, (24 + 24 * s.fire) * k, 0.12 * s.fire * fl, 0.04 * s.fire * fl, 0.01 * s.fire * fl);
        }
      }
    },
  };
}

function mergeGeos(list) {
  // small local merge (position + uv only)
  let n = 0, m = 0;
  for (const g of list) { n += g.attributes.position.count; m += g.index.count; }
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = new Uint32Array(m);
  let po = 0, uo = 0, io = 0, base = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, po); po += g.attributes.position.array.length;
    uv.set(g.attributes.uv.array, uo); uo += g.attributes.uv.array.length;
    for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.array[i] + base;
    base += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

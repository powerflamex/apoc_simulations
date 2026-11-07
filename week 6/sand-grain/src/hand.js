// The opening shot: your finger held up close to the lens with one grain of sand on the tip, huge and clear. It is its own
// little scene, drawn over the beach with its own depth (the finger is 7 cm from the lens, the far towers 3 km). A finger is a
// tube with a pad and fine ridges; the grain is a faceted lump of quartz, amber and half see-through, glinting in the Sun.
// (The grain is drawn about 5x life size: a real 0.9 mm grain would be 20 pixels here.)
import * as THREE from 'three';
import { rng, smooth, wobble } from './util.js';

const W = 1080, H = 1920, FOV = 62, D = 0.075;
const TAN = Math.tan(FOV * Math.PI / 360);
// a point on the screen (pixels), at depth d from the lens
const at = (px, py, d = D) => new THREE.Vector3((px - W / 2) / (H / 2) * TAN * d, (H / 2 - py) / (H / 2) * TAN * d, -d);

export const GRAIN_PX = { x: 500, y: 408 };

export function makeHand() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, W / H, 0.005, 2);
  const group = new THREE.Group();
  scene.add(group);

  // ---- the finger: from off the right of the frame up to the tip ----
  const P = [at(1320, 1010, 0.082), at(980, 800, 0.08), at(720, 640, 0.077), at(520, 520, 0.075), at(410, 462, 0.073)].map((v) => v);
  const curve = new THREE.CatmullRomCurve3(P, false, 'centripetal');
  const NL = 90, NA = 56;
  const pos = [], uv = [], idx = [];
  const T = new THREE.Vector3(), Nn = new THREE.Vector3(), Bn = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
  const RAD = 0.0092;
  for (let i = 0; i <= NL; i++) {
    const u = i / NL;
    curve.getPointAt(u, T);
    const c = T.clone();
    curve.getTangentAt(u, T);
    Bn.copy(Z).sub(T.clone().multiplyScalar(Z.dot(T))).normalize();
    Nn.crossVectors(Bn, T).normalize();
    // the rounded tip; the slight swell of the pad; the waist at the joint
    const tip = u > 0.8 ? Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.8) / 0.2, 2.4))) : 1;
    const pad = 1 + 0.06 * Math.exp(-Math.pow((u - 0.82) / 0.09, 2));
    const joint = 1 - 0.07 * Math.exp(-Math.pow((u - 0.5) / 0.05, 2));
    const r = RAD * tip * pad * joint * (1.1 - 0.12 * u);
    for (let j = 0; j <= NA; j++) {
      const a = j / NA * Math.PI * 2;
      const p = c.clone().addScaledVector(Nn, Math.cos(a) * r).addScaledVector(Bn, Math.sin(a) * r);
      pos.push(p.x, p.y, p.z); uv.push(u, j / NA);
    }
  }
  for (let i = 0; i < NL; i++) for (let j = 0; j < NA; j++) {
    const a = i * (NA + 1) + j, b = a + 1, c = a + NA + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const SUN = new THREE.Vector3(-0.42, 0.72, 0.55).normalize();
  const grainPos = at(GRAIN_PX.x, GRAIN_PX.y, 0.0735);
  const skinU = { uSun: { value: SUN }, uG: { value: grainPos.clone() } };
  const skin = new THREE.ShaderMaterial({
    uniforms: skinU,
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vP; varying vec2 vU; void main(){ vU = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun; uniform vec3 uG; varying vec3 vN; varying vec3 vP; varying vec2 vU;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        // the print: fine ridges in whorls round the middle of the pad, the creases across the joint
        vec2 q = vec2((vU.x - 0.86) * 2.6, (fract(vU.y + 0.16) - 0.5) * 1.5);
        float rr = length(q * vec2(1.0, 1.35));
        float warp = 0.07 * n2(q * 9.0) + 0.03 * n2(q * 25.0);
        float padK = smoothstep(0.62, 0.74, vU.x);
        float ridge = sin((rr + warp + 0.05 * q.y) * 260.0);
        float crease = exp(-pow((vU.x - 0.5) / 0.012, 2.0)) + 0.7 * exp(-pow((vU.x - 0.535) / 0.009, 2.0)) + 0.7 * exp(-pow((vU.x - 0.465) / 0.009, 2.0));
        vec3 V = normalize(-vP), N = normalize(vN);
        vec3 dU = dFdx(vP), dV = dFdy(vP);
        float rd = ridge * padK;
        vec3 G = vec3(dFdx(rd), dFdy(rd), 0.0);
        N = normalize(N - G * 0.32);
        float wrap = (dot(N, uSun) + 0.5) / 1.5;
        float lam = clamp(wrap, 0.0, 1.0);
        vec3 alb = mix(vec3(0.74, 0.4, 0.27), vec3(0.82, 0.48, 0.34), n2(vU * vec2(40.0, 26.0)));
        alb *= 1.0 - 0.12 * (0.5 - 0.5 * ridge) * padK;
        alb *= 1.0 - 0.33 * crease;
        // the light soaks through the skin: red in the shadow edge
        vec3 sss = vec3(0.9, 0.2, 0.1) * smoothstep(0.0, 0.5, lam) * (1.0 - smoothstep(0.35, 0.8, lam)) * 0.6;
        vec3 c = alb * (vec3(0.26, 0.28, 0.33) + vec3(1.5, 1.38, 1.22) * lam) + alb * sss;
        vec3 Hv = normalize(V + uSun);
        c += vec3(1.0, 0.95, 0.9) * pow(max(dot(N, Hv), 0.0), 34.0) * 0.32;
        c += vec3(0.5, 0.6, 0.8) * pow(1.0 - max(dot(N, V), 0.0), 3.5) * 0.25;
        // the grain's shadow on the skin
        float dg = length((vP - uG) * vec3(1.0, 1.0, 1.0) - vec3(0.0015, -0.0025, 0.0));
        c *= 0.42 + 0.58 * smoothstep(0.0022, 0.0062, dg);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const finger = new THREE.Mesh(geo, skin);
  group.add(finger);

  // ---- the grain: a sphere cut by a dozen random planes, so it has real facets and worn edges ----
  const R = rng(99);
  const planes = Array.from({ length: 15 }, () => {
    const n = new THREE.Vector3(R() - 0.5, (R() - 0.5) * 0.8, R() - 0.5).normalize();
    return { n, d: 0.72 + R() * 0.3 };
  });
  const gGeo = new THREE.IcosahedronGeometry(1, 28);
  {
    const pa = gGeo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).normalize();
      let r = 1.06;
      for (const pl of planes) { const c = v.dot(pl.n); if (c > 0) r = Math.min(r, pl.d / c); }
      v.multiplyScalar(r * (1 + 0.02 * Math.sin(v.x * 21 + v.y * 13) * Math.sin(v.z * 17)));
      pa.setXYZ(i, v.x * 1.18, v.y * 0.9, v.z);
    }
    gGeo.computeVertexNormals();
  }
  const gU = { uSun: { value: SUN } };
  const quartz = new THREE.ShaderMaterial({
    uniforms: gU,
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vP; varying vec3 vO; void main(){ vO = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun; varying vec3 vN; varying vec3 vP; varying vec3 vO;
      float h(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i), h(i+vec3(1,0,0)), f.x), mix(h(i+vec3(0,1,0)), h(i+vec3(1,1,0)), f.x), f.y), mix(mix(h(i+vec3(0,0,1)), h(i+vec3(1,0,1)), f.x), mix(h(i+vec3(0,1,1)), h(i+vec3(1,1,1)), f.x), f.y), f.z); }
      void main(){
        vec3 V = normalize(-vP), N = normalize(vN);
        // frosted, pitted surface
        N = normalize(N + (vec3(n3(vO * 26.0), n3(vO * 26.0 + 5.0), n3(vO * 26.0 + 9.0)) - 0.5) * 0.28);
        float lam = clamp(dot(N, uSun) * 0.6 + 0.4, 0.0, 1.0);
        float through = pow(clamp(1.0 - dot(N, V), 0.0, 1.0), 1.6);
        // amber quartz: light gets in and glows from inside, brighter away from the Sun side; dark inclusions
        float inner = n3(vO * 3.2 + 2.0);
        vec3 body = mix(vec3(0.62, 0.3, 0.06), vec3(1.0, 0.66, 0.24), inner) * (0.5 + 0.85 * lam);
        body += vec3(1.3, 0.8, 0.3) * pow(clamp(dot(normalize(vO), -uSun) * 0.5 + 0.5, 0.0, 1.0), 2.0) * 0.9;
        body *= 1.0 - 0.28 * smoothstep(0.66, 0.76, n3(vO * 4.0 + 7.0));
        vec3 c = mix(body, vec3(1.1, 0.85, 0.5), through * 0.4);
        vec3 Hv = normalize(V + uSun);
        c += vec3(1.0, 0.97, 0.9) * pow(max(dot(normalize(vN), Hv), 0.0), 90.0) * 3.2;
        c += vec3(1.0, 0.95, 0.85) * pow(max(dot(N, Hv), 0.0), 260.0) * 7.0;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const grain = new THREE.Mesh(gGeo, quartz);
  grain.position.copy(grainPos);
  grain.scale.setScalar(0.0037);
  grain.rotation.set(0.4, 0.9, 0.2);
  group.add(grain);
  // a few real-sized grains stuck to the skin
  const specks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xc9a262 }), 16);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 16; i++) {
    const u = 0.62 + R() * 0.3, a = 1.1 + R() * 1.2;
    curve.getPointAt(u, T); const c = T.clone(); curve.getTangentAt(u, T);
    Bn.copy(Z).sub(T.clone().multiplyScalar(Z.dot(T))).normalize(); Nn.crossVectors(Bn, T).normalize();
    const p = c.addScaledVector(Nn, Math.cos(a) * RAD * 0.98).addScaledVector(Bn, Math.sin(a) * RAD * 0.98);
    m4.makeScale(1, 1, 1).setPosition(p); m4.scale(new THREE.Vector3(0.00009 + R() * 0.00012, 0.00009 + R() * 0.00012, 0.0001));
    specks.setMatrixAt(i, m4);
  }
  specks.frustumCulled = false;
  group.add(specks);

  return {
    scene, camera,
    // the hand drops away just before the first grain lands; it comes back up under the white of the loop
    frame(v) {
      const k = Math.pow(smooth(2.25, 2.85, v), 1.6);
      group.visible = k < 0.999;
      group.position.set(0.012 * k + wobble(v * 0.8, 2) * 0.00016, -0.075 * k + wobble(v * 0.7, 5) * 0.00018, 0);
      group.rotation.z = -0.35 * k;
      grain.rotation.y = 0.9 + wobble(v * 0.5, 1) * 0.015;
    },
  };
}

// The harbour: a mirror of the whole scene (three.js Reflector, half resolution) seen through moving waves, so the
// skyline's lights, the Moon and later the ring and the streaks smear into long shimmering columns on the water; dark
// and see-through close in (Fresnel). Its level is the tide (and the splash's surge); the splash sends a ring wave out.
// Boats cross it: three ferries (two lit decks), a junk with red sails, a few small boats.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { SEA0 } from './layout.js';

export const HU = {
  uTime: { value: 0 }, uChop: { value: 1 }, uSplash: { value: new THREE.Vector4(0, 0, 0, 0) }, uDeep: { value: new THREE.Color(0.004, 0.008, 0.014) },
  uFogC: { value: new THREE.Color(0.03, 0.025, 0.03) }, uFogD: { value: 0.0001 }, uFoam: { value: 0 }, uFlashC: { value: new THREE.Color(0, 0, 0) },
};
const WATER = {
  name: 'Harbour',
  uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, ...HU },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWP;
    void main() { vUv = textureMatrix * vec4(position, 1.0); vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uChop, uFogD, uFoam; uniform vec4 uSplash; uniform vec3 uDeep, uFogC, uFlashC;
    varying vec4 vUv; varying vec3 vWP;
    float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
    // the slope of the water: a few swells and chop, each faded out once it's smaller than a pixel
    vec2 slope(vec2 p, float t, float pix) {
      vec2 g = vec2(0.0);
      for (int i = 0; i < 9; i++) {
        float fi = float(i);
        float k = 0.08 * pow(1.55, fi);
        float a = (0.32 / pow(1.5, fi)) * uChop;
        float an = fi * 2.39996 + 0.4;
        vec2 dir = vec2(cos(an), sin(an));
        float w = sqrt(9.8 * k);
        float fade = exp(-pow(k * pix * 0.35, 2.0));
        g += dir * a * k * cos(dot(dir, p) * k - w * t + fi * 1.7) * fade;
      }
      return g;
    }
    void main() {
      float dist = length(vWP - cameraPosition);
      vec3 V = (cameraPosition - vWP) / dist;
      float pix = dist * 0.0006 / max(V.y, 0.02);       // ~how many metres one pixel covers along the view
      vec2 g = slope(vWP.xz, uTime, pix);
      // the splash's ring wave
      if (uSplash.w > 0.0) {
        vec2 dp = vWP.xz - uSplash.xy; float rr = length(dp) + 1e-3; float x = rr - uSplash.z;
        g += dp / rr * sin(x * 0.18) * 0.6 * exp(-x * x / 900.0) * uSplash.w;
      }
      vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
      float cosT = max(dot(N, V), 0.0);
      float fres = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
      vec4 uv = vUv;
      uv.xy += vec2(N.x * 0.35, N.z * 1.0) * 0.07 * uv.w;
      vec3 refl = texture2DProj(tDiffuse, uv).rgb;
      vec3 col = uDeep + refl * clamp(fres * 1.15, 0.0, 1.0) + uFlashC * 0.04;
      // foam (the splash, the hard rain)
      float fm = uFoam * smoothstep(0.62, 0.85, vn(vWP.xz * 0.15 + uTime * 0.2)) * exp(-dist / 900.0);
      col += vec3(0.25, 0.27, 0.3) * fm;
      col = mix(col, uFogC, 1.0 - exp(-uFogD * dist));
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function makeHarbor(scene, camera) {
  const water = new Reflector(new THREE.PlaneGeometry(24000, 9000), { textureWidth: 540, textureHeight: 960, clipBias: 0.002, multisample: 0, shader: WATER });
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, SEA0, -3500);
  water.frustumCulled = false;
  scene.add(water);
  for (const k of Object.keys(HU)) water.material.uniforms[k] = HU[k];
  water.getReflectionCamera(camera).layers.set(0);       // (the promenade and the crowd are not reflected)

  // ---- boats ----
  const boats = [];
  const std = (c, e = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, emissive: new THREE.Color(e, e * 0.75, e * 0.45) });
  const lit = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.7, 1.25, 0.75) });
  function ferry(x0, z, vx) {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(36, 3.2, 9.5).translate(0, 1.0, 0), std(0xd8d8d0));
    const deck1 = new THREE.Mesh(new THREE.BoxGeometry(32, 2.6, 8.4).translate(0, 3.9, 0), std(0x2f6b45));
    const deck2 = new THREE.Mesh(new THREE.BoxGeometry(28, 2.4, 8.0).translate(0, 6.4, 0), std(0xd8d8d0));
    const win1 = new THREE.Mesh(new THREE.BoxGeometry(31, 1.0, 8.6).translate(0, 4.1, 0), lit);
    const win2 = new THREE.Mesh(new THREE.BoxGeometry(27, 0.9, 8.2).translate(0, 6.5, 0), lit);
    g.add(hull, deck1, deck2, win1, win2);
    g.position.set(x0, SEA0, z);
    scene.add(g);
    boats.push({ g, x0, z, vx, kind: 'ferry', ph: x0 * 0.1 });
  }
  function junk(x0, z, vx) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(17, 2.4, 4.6).translate(0, 0.9, 0), std(0x2a1a12)));
    const sail = new THREE.MeshStandardMaterial({ color: 0xb02418, roughness: 0.9, side: THREE.DoubleSide, emissive: new THREE.Color(0.28, 0.035, 0.02) });
    const shape = new THREE.Shape([new THREE.Vector2(-4.5, 0), new THREE.Vector2(4.0, 0), new THREE.Vector2(3.4, 11), new THREE.Vector2(-2.5, 12.5)]);
    const sg = new THREE.ShapeGeometry(shape);
    const s1 = new THREE.Mesh(sg, sail); s1.position.set(-2.5, 2.4, 0);
    const s2 = new THREE.Mesh(sg, sail); s2.position.set(4.5, 2.4, 0.2); s2.scale.setScalar(0.8);
    g.add(s1, s2);
    g.position.set(x0, SEA0, z);
    scene.add(g);
    boats.push({ g, x0, z, vx, kind: 'junk', ph: 2 });
  }
  ferry(-120, -430, 5.5); ferry(210, -900, -6.0); ferry(-330, -1180, 7.0);
  junk(40, -300, -2.4);
  const small = [[-60, -650, 3.5], [140, -560, -2.8], [-200, -980, 4.2], [80, -1300, -5]];

  return {
    water,
    frame(v, s, glows) {
      const lvl = SEA0 + s.level;
      water.position.y = lvl;
      HU.uTime.value = v;
      for (const b of boats) {
        const x = b.x0 + b.vx * v;
        const bob = Math.sin(v * 0.9 + b.ph) * 0.15 + s.surgeAt(x, b.z) * 1.2;
        b.g.position.set(x, lvl + bob, b.z);
        b.g.rotation.set(Math.sin(v * 0.7 + b.ph) * 0.02, b.vx < 0 ? Math.PI : 0, Math.sin(v * 1.1 + b.ph) * 0.025);
        const on = 1 - s.lampsOut;
        if (b.kind === 'ferry') {
          glows.add(x, lvl + bob + 10, b.z, 2.2, 2.0 * on, 1.9 * on, 1.7 * on);
          glows.add(x + Math.sign(b.vx) * 17, lvl + bob + 4, b.z - 4.8, 1.6, 0.2 * on, 1.8 * on, 0.4 * on);
          glows.add(x + Math.sign(b.vx) * 17, lvl + bob + 4, b.z + 4.8, 1.6, 1.9 * on, 0.15 * on, 0.1 * on);
        } else {
          for (let k = 0; k < 6; k++) glows.add(x - 7 + k * 2.8, lvl + bob + 3.2 + Math.sin(k) * 0.5, b.z, 0.9, 1.6 * on, 1.1 * on, 0.5 * on);
        }
      }
      for (const [x0, z, vx] of small) {
        const x = x0 + vx * v;
        glows.add(x, lvl + 1.6 + s.surgeAt(x, z), z, 1.3, 1.8, 1.5, 1.1);
        glows.add(x - Math.sign(vx) * 4, lvl + 1.0 + s.surgeAt(x, z), z, 0.9, 1.8, 0.2, 0.15);
      }
    },
  };
}

// Procedural materials: a MeshStandardMaterial (or MeshPhysical) with a GLSL snippet that sets the colour and a
// procedural bump (a height function differentiated on screen), all in the object's own space (vOP), so patterns
// scale with the object as the world grows round you. Instanced meshes also get vIP (the instance's offset) to
// vary the pattern per copy.
import * as THREE from 'three';

export const NOISE = /* glsl */ `
float h13(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n3(p); p = p * 2.07 + 1.3; a *= 0.5; } return s; }
// cellular: x = distance to the nearest cell centre, y = to the second (for cobbles, cells, scales)
vec2 vor3(vec3 p){ vec3 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(float(x), float(y), float(z)); vec3 r = o + vec3(h13(i + o), h13(i + o + 17.1), h13(i + o + 31.7)) - f;
    float d = dot(r, r); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return vec2(sqrt(d1), sqrt(d2)); }
vec3 bumpN(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy) {
  vec3 sx = dFdx(surf_pos), sy = dFdy(surf_pos);
  vec3 R1 = cross(sy, surf_norm), R2 = cross(surf_norm, sx);
  float det = dot(sx, R1);
  vec3 g = sign(det) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(det) * surf_norm - g);
}
`;

let KEY = 0;
// opts: { color, rough, metal, emissive, physical: {...}, transparent, opacity, side,
//         col: GLSL that may change 'c' (vec3, starts as the diffuse colour) using vOP / vIP / vWP,
//         height: GLSL expression for the bump height (float) in object units, bump: strength,
//         emis: GLSL that may add to 'e' (vec3 emissive), uniforms: { name: { value } } }
export function procMat(o = {}) {
  const P = o.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const m = new P({ color: o.color ?? 0xffffff, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0, emissive: o.emissive ?? 0x000000,
    transparent: !!o.transparent, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide, ...(o.physical || {}), ...(o.extra || {}) });
  const key = 'proc' + (KEY++);
  const U = o.uniforms || {};
  m.userData.U = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    const decl = Object.keys(U).map((k) => {
      const v = U[k].value;
      const t = typeof v === 'number' ? 'float' : v.isColor || v.isVector3 ? 'vec3' : v.isVector2 ? 'vec2' : v.isVector4 ? 'vec4' : 'float';
      return `uniform ${t} ${k};`;
    }).join('\n');
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP; varying vec3 vIP; varying vec3 vWP;' + (o.useAU ? ' attribute vec2 aU; varying vec2 vU;' : ''))
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vOP = position;${o.useAU ? ' vU = aU;' : ''}
        #ifdef USE_INSTANCING
          vIP = instanceMatrix[3].xyz;
        #else
          vIP = vec3(0.0);
        #endif`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        {
          vec4 wp4 = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wp4 = instanceMatrix * wp4;
          #endif
          vWP = (modelMatrix * wp4).xyz;
        }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vOP; varying vec3 vIP; varying vec3 vWP;${o.useAU ? ' varying vec2 vU;' : ''}\n${decl}\n${NOISE}\n${o.funcs || ''}`);
    if (o.col) sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n{ vec3 c = diffuseColor.rgb; ${o.col}\n diffuseColor.rgb = c; }`);
    if (o.height) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      { float H_ = ${o.height}; normal = bumpN(-vViewPosition, normal, vec2(dFdx(H_), dFdy(H_)) * ${(o.bump ?? 1).toFixed(4)}); }`);
    if (o.emis) sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n{ vec3 e = totalEmissiveRadiance; ${o.emis}\n totalEmissiveRadiance = e; }`);
    if (o.rgh) sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n{ ${o.rgh} }`);
  };
  m.customProgramCacheKey = () => key;
  return m;
}

// an ellipsoid (sphere scaled), placed and turned
export function ellipsoid(rx, ry, rz, seg = 24) {
  return new THREE.SphereGeometry(1, seg, Math.max(8, seg * 0.66 | 0)).scale(rx, ry, rz);
}
// a tube through points (Catmull-Rom), radius per point (r can be a function of t in [0,1])
export function tube(points, r, segs = 32, radial = 10, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))), closed);
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, closed);
  if (typeof r === 'function' || typeof r === 'number') {
    const pos = g.attributes.position, n = g.attributes.normal;
    const rf = typeof r === 'function' ? r : () => r;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, p = curve.getPointAt(t), rr = rf(t);
      for (let j = 0; j <= radial; j++) {
        const k = i * (radial + 1) + j;
        pos.setXYZ(k, p.x + n.getX(k) * rr, p.y + n.getY(k) * rr, p.z + n.getZ(k) * rr);
      }
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
  }
  g.setAttribute('aU', g.attributes.uv.clone());
  return g;
}

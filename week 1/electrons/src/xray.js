// The "ghost" look once the electrons are gone: with nothing left to scatter or absorb light, everything is
// see-through. Drawn as unlit glowing outlines (bright where a surface is seen edge-on, plus the edges of boxes and
// a faint grid of floors and windows on buildings), additive and without depth, so you see through everything.
// Works on plain and instanced meshes (three's instancing chunks). XR holds the shared uniforms.
import * as THREE from 'three';

export const XR = {
  uRepel: { value: 0 },    // 0 .. 1: the nuclei pushing apart (brighter, swelling, flickering)
  uSwell: { value: 0 },
  uTime: { value: 0 },
};

const vert = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float uSwell; uniform float uTime;
  varying vec3 vNv; varying vec3 vVw; varying vec3 vLoc; varying vec3 vSc; varying vec3 vObjN; varying float vDist;
  void main() {
    #include <beginnormal_vertex>
    #include <defaultnormal_vertex>
    #include <begin_vertex>
    vLoc = transformed; vObjN = objectNormal;
    #ifdef USE_INSTANCING
      vSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    #else
      vSc = vec3(1.0);
    #endif
    // swelling: every surface pushed outward a little (in metres, whatever the instance's scale)
    transformed += objectNormal * uSwell / max(vSc, vec3(0.2)) * (0.6 + 0.4 * sin(uTime * 23.0 + transformed.y * 3.0));
    #include <project_vertex>
    vNv = dot(transformedNormal, transformedNormal) > 1e-12 ? normalize(transformedNormal) : vec3(0.0, 0.0, 1.0);
    vVw = -mvPosition.xyz;
    vDist = length(mvPosition.xyz);
    #include <logdepthbuf_vertex>
  }`;

export function xrayMat({ color = 0x9fc4ff, gain = 0.6, grid = false, person = false, rect = false } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uGain: { value: gain }, uRepel: XR.uRepel, uSwell: XR.uSwell, uTime: XR.uTime },
    defines: { GRID: grid ? 1 : 0, PERSON: person ? 1 : 0, RECT: rect ? 1 : 0 },
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: vert,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uColor; uniform float uGain; uniform float uRepel; uniform float uTime;
      varying vec3 vNv; varying vec3 vVw; varying vec3 vLoc; varying vec3 vSc; varying vec3 vObjN; varying float vDist;
      float lineAt(float x, float w) { float fw = fwidth(x) + 1e-5; return 1.0 - smoothstep(w, w + fw * 1.5, abs(x)); }
      void main() {
        #include <logdepthbuf_fragment>
        float fres = pow(1.0 - abs(dot(normalize(vNv), normalize(vVw))), 3.0);
        float k = fres * 0.22;
        #if GRID || RECT
          // the face's own 2D coordinates in metres, and lines along its edges (and floors / windows for buildings)
          vec3 an = abs(vObjN);
          vec2 uv, sz;
          if (an.x > 0.5) { uv = vec2(vLoc.z, vLoc.y); sz = vec2(vSc.z, vSc.y); }
          else if (an.z > 0.5) { uv = vec2(vLoc.x, vLoc.y); sz = vec2(vSc.x, vSc.y); }
          else { uv = vec2(vLoc.x, vLoc.z); sz = vec2(vSc.x, vSc.z); }
          vec2 m = uv * sz;   // metres from the face centre (y from the base for buildings)
          vec2 ctr = vec2(0.0, an.y > 0.5 ? 0.0 : 0.5 * sz.y);
          vec2 e = abs(m - ctr * (an.y > 0.5 ? 0.0 : 1.0)) - vec2(0.5 * sz.x, an.y > 0.5 ? 0.5 * sz.y : 0.5 * sz.y);
          float edge = max(lineAt(e.x, 0.12), lineAt(e.y, 0.12));
          #if RECT
            edge = max(lineAt(abs(uv.x) - 0.5, 0.004), lineAt(abs(uv.y) - 0.5, 0.004));
          #endif
          k += edge * 0.55;
          #if GRID
            if (an.y < 0.5) {
              float floors = lineAt(fract(m.y / 3.6 + 0.5) - 0.5, 0.03);
              float cols = lineAt(fract(m.x / 3.0 + 0.5) - 0.5, 0.02);
              k += (floors * 0.12 + cols * 0.05) * (1.0 - smoothstep(40.0, 160.0, vDist));
            }
          #endif
        #endif
        #if PERSON
          k = 0.012 + pow(fres, 1.6) * 0.55;
        #endif
        // far things fade into the black
        k *= exp(-vDist / 170.0);
        // as the nuclei push apart everything brightens and shimmers; people most of all
        float fl = 0.85 + 0.15 * sin(uTime * 40.0 + vDist * 0.7);
        float boost = 1.0 + uRepel * uRepel * (PERSON == 1 ? 14.0 : 5.0) * fl;
        vec3 c = uColor * k * uGain * boost;
        c += vec3(1.0) * uRepel * uRepel * uRepel * (PERSON == 1 ? 0.9 : 0.12) * k;
        if (any(isnan(c)) || any(isinf(c))) discard;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

// the street seen through: a faint grid, the crosswalks and curbs as lines
export function xrayGround() {
  return new THREE.ShaderMaterial({
    uniforms: { uRepel: XR.uRepel },
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `varying vec3 vW; varying float vDist;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vDist = length(mv.xyz); gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `uniform float uRepel; varying vec3 vW; varying float vDist;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      float lineAt(float x, float w) { float fw = fwidth(x) + 1e-5; return 1.0 - smoothstep(w, w + fw * 1.5, abs(x)); }
      void main(){
        #include <logdepthbuf_fragment>
        vec2 p = vW.xz;
        float g = max(lineAt(fract(p.x / 5.0 + 0.5) - 0.5, 0.01), lineAt(fract(p.y / 5.0 + 0.5) - 0.5, 0.01)) * 0.12;
        float curb = max(lineAt(abs(p.x) - 11.0, 0.06) * step(12.0, abs(p.y)), lineAt(abs(p.y) - 12.0, 0.06) * step(11.0, abs(p.x))) * 0.6;
        float k = (g + curb) * exp(-vDist / 200.0) * (1.0 + uRepel * 3.0);
        gl_FragColor = vec4(vec3(0.6, 0.75, 1.0) * k, 1.0);
      }`,
  });
}

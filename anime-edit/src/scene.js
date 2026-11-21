// The 3D scene: the shrine picture rebuilt as layers at their true distances (sky, shrine, near rocks, water),
// the cut-out character as a puppet mesh standing in the water, smoke and embers.
import * as THREE from 'three';
import { CHAR } from './timeline.js';

export const NOISE = /* glsl */`
float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*f*(f*(f*6.-15.)+10.);
  return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x), mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=mat2(1.6,1.2,-1.2,1.6)*p+vec2(17.1,9.2); a*=.5; } return s; }
`;

function pixels(img) {
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
  return x.getImageData(0, 0, c.width, c.height).data;
}
function tex(img, srgb = true) {
  const t = new THREE.Texture(img);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// One picture layer as a mesh: every vertex is pushed out along its own sight line from the picture's camera
// to its measured distance, so from that camera it is the picture again, and from anywhere else it has depth.
function buildIsland(colorImg, depthImg, L, { ext = 0.14, step = 4, extRow = 0 }) {
  const { W, H } = L, tan2 = 2 * Math.tan((L.fov * Math.PI) / 360), asp = W / H;
  const cd = pixels(colorImg), dd = pixels(depthImg);
  const nxb = Math.ceil(W / step), nyb = Math.ceil(H / step), E = Math.round((ext * W) / step);
  const amax = new Uint8Array(nxb * nyb);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = cd[(y * W + x) * 4 + 3], k = Math.floor(y / step) * nxb + Math.floor(x / step);
    if (a > amax[k]) amax[k] = a;
  }
  const cols = nxb + 2 * E + 1, rows = nyb + 1;
  const pos = new Float32Array(cols * rows * 3), uv = new Float32Array(cols * rows * 2);
  const mirror = (px) => (px < 0 ? -px : px > W - 1 ? 2 * (W - 1) - px : px);
  for (let j = 0; j < rows; j++) for (let ii = 0; ii < cols; ii++) {
    const i = ii - E, px = i * step, py = Math.min(H - 1, j * step);
    const sx = Math.min(W - 1, Math.max(0, Math.round(mirror(px)))), k = (py * W + sx) * 4;
    const d = L.depthLo + (L.depthHi - L.depthLo) * (((dd[k] << 8) | dd[k + 1]) / 65535);
    const n = j * cols + ii;
    pos[n * 3] = (px / W - 0.5) * tan2 * asp * d;
    pos[n * 3 + 1] = L.camH + ((L.horizonRow - j * step) / H) * tan2 * d;
    pos[n * 3 + 2] = -d;
    uv[n * 2] = px / W; uv[n * 2 + 1] = 1 - (j * step) / H;
  }
  const idx = [];
  for (let j = 0; j < nyb; j++) for (let ii = 0; ii < cols - 1; ii++) {
    let i = ii - E;
    if ((i < 0 || i >= nxb) && j * step < extRow - step) continue;
    if (i < 0) i = -i - 1; else if (i >= nxb) i = 2 * nxb - i - 1;
    if (i < 0 || i >= nxb || amax[j * nxb + i] < 6) continue;
    const a = j * cols + ii, b = a + 1, c = a + cols, e = c + 1;
    idx.push(a, c, b, b, c, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  const map = tex(colorImg); map.wrapS = THREE.MirroredRepeatWrapping;
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, uKick: { value: 0 }, uHeat: { value: 0 }, uExtRow: { value: 1 - extRow / H }, uExt: { value: ext } },
    vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform float uKick, uHeat, uExtRow, uExt; varying vec2 vUv;
      void main(){
        vec4 c = texture2D(map, vUv);
        float out_ = max(-vUv.x, vUv.x-1.);
        float a = c.a;
        if(out_ > 0.){ a *= smoothstep(uExtRow+0.012, uExtRow-0.012, vUv.y); a *= smoothstep(uExt, uExt*0.55, out_); c.rgb *= 1.-0.6*smoothstep(0., uExt, out_); }
        if(a < 0.02) discard;
        vec3 col = c.rgb;
        // the lanterns and anything else glowing orange: push it into the bloom, and let it jump with the kick
        float lum = dot(col, vec3(.3,.6,.1));
        float em = smoothstep(0.30,0.75,lum) * smoothstep(0.02,0.22, col.r - col.b*1.5);
        col *= 1. + em*(0.9 + 1.6*uKick + 0.8*uHeat);
        gl_FragColor = vec4(col, a);
      }`,
    alphaToCoverage: true, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false;
  return m;
}

export function buildScene(A, L) {
  const scene = new THREE.Scene();
  const { W, H } = L, tan2 = 2 * Math.tan((L.fov * Math.PI) / 360), asp = W / H;
  const U = { uTime: { value: 0 }, uHeat: { value: 0 }, uKick: { value: 0 }, uFlash: { value: 0 }, uFocus: { value: 30 }, uRes: { value: new THREE.Vector2(1080, 1920) } };

  // ---- sky: far behind everything, running well past the picture's edges (mirrored, with drifting cloud)
  const SKYD = 420;
  const skyTex = tex(A.sky); skyTex.wrapS = THREE.MirroredRepeatWrapping; skyTex.wrapT = THREE.MirroredRepeatWrapping;
  {
    const u0 = -2.2, u1 = 3.2, v0 = -1.7, v1 = 0.60;       // picture coordinates (v down)
    const P = (u, v) => [(u - 0.5) * tan2 * asp * SKYD, L.camH + ((L.horizonRow / H - v)) * tan2 * SKYD, -SKYD];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...P(u0, v0), ...P(u1, v0), ...P(u0, v1), ...P(u1, v1)], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v0, u1, v0, u0, v1, u1, v1], 2));
    g.setIndex([0, 2, 1, 1, 2, 3]);
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: skyTex }, uTime: U.uTime, uHeat: U.uHeat, uKick: U.uKick },
      vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D map; uniform float uTime, uHeat, uKick; varying vec2 vUv;
        ${NOISE}
        void main(){
          vec2 uv = vUv;
          vec2 w = vec2(fbm(uv*2.6 + vec2(uTime*0.035, 0.)), fbm(uv*2.6 + vec2(7.3, -uTime*0.025)));
          vec2 s = uv + (w-.5)*0.07; s.x += uTime*0.0025;
          float v = s.y < 0. ? -s.y : s.y; v = clamp(v, 0.004, 0.566);
          vec3 c = texture2D(map, vec2(s.x, 1.-v)).rgb;
          // rolling cloud shadow, so the mirrored parts never look like a copy
          float cl = fbm(uv*vec2(1.7,3.1) + vec2(uTime*0.05, uTime*0.012) + 3.7);
          c *= mix(0.62, 1.28, smoothstep(0.3,0.75,cl));
          float outside = max(max(-uv.x, uv.x-1.), -uv.y);
          c *= 1. - 0.45*smoothstep(0., 0.9, outside);
          // on the drop the sky behind the shrine burns
          float glow = exp(-length((uv-vec2(.5,.47))*vec2(1.5,2.2))*2.3);
          c += vec3(1.0,0.22,0.04) * glow * (0.10 + 0.9*uHeat + 0.5*uKick*uHeat);
          gl_FragColor = vec4(c, 1.);
        }`,
      depthWrite: true,
    });
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; scene.add(m);
  }

  // ---- the shrine and the near rocks
  const far = buildIsland(A.far, A.farDepth, L, { ext: 0.16, extRow: 790 });
  const near = buildIsland(A.near, A.nearDepth, L, { ext: 0.16, extRow: 0 });
  far.material.uniforms.uKick = U.uKick; far.material.uniforms.uHeat = U.uHeat;
  near.material.uniforms.uKick = U.uKick; near.material.uniforms.uHeat = U.uHeat;
  scene.add(far, near);

  // the lanterns (picture pixels -> world): for the glints on the water and the lens flares
  const lant = [[258, 822], [566, 822]].map(([px, py]) => {
    const d = 58.5;
    return new THREE.Vector3((px / W - 0.5) * tan2 * asp * d, L.camH + ((L.horizonRow - py) / H) * tan2 * d, -d);
  });

  // ---- water: a real flat surface. It wears the picture's own water (projected from the picture's camera),
  // rippled, plus the character's mirror image.
  const waterTex = tex(A.water); waterTex.wrapS = THREE.MirroredRepeatWrapping;
  const reflRT = new THREE.WebGLRenderTarget(1080, 1920, { type: THREE.HalfFloatType });
  const waterMat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: waterTex }, tSky: { value: skyTex }, tRefl: { value: reflRT.texture }, ...U,
      uSrc: { value: new THREE.Vector4(tan2 * asp, tan2, L.camH, L.horizonRow / H) }, uLant: { value: lant },
    },
    vertexShader: /* glsl */`varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map, tSky, tRefl; uniform float uTime, uHeat, uKick; uniform vec4 uSrc; uniform vec2 uRes; uniform vec3 uLant[2];
      varying vec3 vW;
      ${NOISE}
      void main(){
        float d = max(-vW.z, 2.0);
        vec2 q = vW.xz;
        float t = uTime;
        vec2 n = vec2(vnoise(q*vec2(1.3,0.55)+vec2(0., t*0.7)), vnoise(q*vec2(1.1,0.5)+vec2(31.-t*0.5, 4.))) - .5;
        n += 0.5*(vec2(vnoise(q*vec2(3.4,1.5)+vec2(t*0.9, 2.)), vnoise(q*vec2(3.1,1.4)+vec2(9., -t*1.1))) - .5);
        float amp = clamp(14./d, 0.12, 1.0);
        vec2 uv = vec2(vW.x/(uSrc.x*d) + .5, uSrc.w + uSrc.z/(uSrc.y*d));
        uv += n * vec2(0.014, 0.020) * amp;
        float below = smoothstep(0.985, 1.06, uv.y);
        vec3 base = texture2D(map, vec2(uv.x, 1.-clamp(uv.y, 0.585, 0.995))).rgb;
        base *= 1. - 0.75*below;
        // sky colour skimming off the far water
        vec3 hor = texture2D(tSky, vec2(uv.x + n.x*0.02, 1.-0.555)).rgb;
        base = mix(base, hor*0.55, smoothstep(70., 330., d));
        // the character's reflection, broken by the ripples
        vec2 suv = gl_FragCoord.xy/uRes + n*vec2(0.022,0.05)*clamp(12./d, 0.15, 1.3);
        vec4 r = texture2D(tRefl, suv);
        vec3 col = base*(1.-r.a*0.5) + r.rgb*0.42;
        // glints riding the ripples
        float g = smoothstep(0.34, 0.5, n.x+n.y*0.6) * smoothstep(75., 8., d);
        col += mix(vec3(0.05,0.22,0.24), vec3(1.0,0.32,0.06), clamp(uHeat,0.,1.)) * g * (0.35 + 0.9*uHeat + 0.6*uKick);
        // the lanterns' light on the water: a column of short flickering dashes that always runs from each lantern
        // toward the camera, wherever the camera goes
        float gl = 0.;
        for(int i=0;i<2;i++){
          vec2 A = uLant[i].xz, dir = normalize(cameraPosition.xz - A), rel = vW.xz - A;
          float along = dot(rel, dir), lat = rel.x*dir.y - rel.y*dir.x;
          float dCam = length(vW.xz - cameraPosition.xz);
          float w = 0.04 + 0.016*min(dCam, along*1.5);     // about the lantern's own width on screen, all the way down
          float m = exp(-(lat*lat)/(w*w)) * smoothstep(2., 8., along) * (1.-smoothstep(24., 46., along));
          float dash = smoothstep(0.46, 0.66, vnoise(vec2(lat*2.6 + float(i)*9., along*5.5 - t*1.6)));
          dash = mix(dash, 0.22, smoothstep(14., 38., dCam));  // far away the dashes melt into a soft streak
          gl += m*dash;
        }
        col += vec3(1.0,0.36,0.07) * gl * (2.2 + 1.6*uKick + 1.2*uHeat) * (1.-0.7*r.a);
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1100, 560), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0, -210); water.frustumCulled = false;
  scene.add(water);

  // ---- the character: one sheet, bent like a puppet in the vertex shader
  const charTex = tex(A.char), charDepth = tex(A.charDepth, false);
  const cw = (CHAR.h * CHAR.imgW) / CHAR.imgH;
  const charU = {
    map: { value: charTex }, tDepth: { value: charDepth }, ...U,
    uHead: { value: new THREE.Vector4() }, uBody: { value: new THREE.Vector3() }, uChest: { value: new THREE.Vector2() },
    uSpearGust: { value: new THREE.Vector2() }, uHeadX: { value: 0 }, uMirror: { value: 0 }, uRelief: { value: 0.6 },
    uImg: { value: new THREE.Vector2(CHAR.imgW, CHAR.imgH) }, uSize: { value: new THREE.Vector2(cw, CHAR.h) },
  };
  const charVS = /* glsl */`
    uniform sampler2D tDepth; uniform vec4 uHead; uniform vec3 uBody; uniform vec2 uChest, uSpearGust, uImg, uSize;
    uniform float uTime, uMirror, uRelief, uHeadX;
    varying vec2 vUv; varying float vY;
    vec2 rot(vec2 p, vec2 c, float a){ float s=sin(a), k=cos(a); p-=c; return c + vec2(k*p.x - s*p.y, s*p.x + k*p.y); }
    void main(){
      vUv = uv;
      vec2 p0 = vec2(uv.x*uImg.x, (1.-uv.y)*uImg.y);     // source-image pixels, y down
      vec2 p = p0;
      // how much each part owns this point
      float e = length((p0 - vec2(465.,240.))/vec2(178.,218.));
      float wh = (1.-smoothstep(0.86,1.24,e)) * (1.-smoothstep(398.,472.,p0.y));
      float whair = (1.-smoothstep(1.0,1.32,e)) * smoothstep(255.,120.,p0.y) * smoothstep(60.,190.,length(p0-vec2(480.,255.)));
      float wc = exp(-( pow((p0.x-560.)/300.,2.) + pow((p0.y-600.)/250.,2.) ));
      vec2 A = vec2(40.,58.), B = vec2(262.,1140.), ab = B-A;
      float s = clamp(dot(p0-A,ab)/dot(ab,ab), 0., 1.);
      float dist = length(p0-(A+ab*s));
      float r = mix(140.,108.,smoothstep(0.27,0.35,s)); r = mix(r,42.,smoothstep(0.48,0.58,s));
      float ws = 1.-smoothstep(r*0.72, r, dist);
      float wb = pow(clamp((1250.-p0.y)/1000.,0.,1.), 1.3);
      // hair flutter (more toward the tips), with gusts on the hits
      float ph = p0.x*0.021 + p0.y*0.017;
      p += whair * (1.3 + uSpearGust.y*4.5) * vec2(sin(uTime*9.+ph*3.) + .5*sin(uTime*17.3+ph*5.1) + uSpearGust.y*1.1, .6*cos(uTime*11.+ph*2.3));
      // head: nod about the neck
      vec2 neck = vec2(505.,432.);
      p = rot(p, neck, uHead.x*wh); p.y += uHead.y*wh; p.x += uHeadX*wh; p = neck + (p-neck)*(1.+uHead.z*wh);
      // chest and shoulders (the head rides along), breathing
      p.y += uChest.x*max(wc, wh*0.9);
      p.x += (p0.x-560.)*uChest.y*0.010*wc; p.y -= uChest.y*2.6*wc;
      // spear: stiff, turning about the grip so the hands stay put
      p = rot(p, vec2(232.,880.), uSpearGust.x*ws);
      // whole body: bend from the hips
      vec2 root = vec2(520.,1250.);
      p = rot(p, root, uBody.x*wb); p.y += uBody.y*wb; p = root + (p-root)*(1.+uBody.z*wb);
      vec3 lp = vec3((p.x/uImg.x-.5)*uSize.x, (.5-p.y/uImg.y)*uSize.y, 0.);
      lp.z = (texture2D(tDepth, uv).r - 0.45)*uRelief + uHead.w*wh;
      vec4 wp = modelMatrix*vec4(lp,1.);
      vY = wp.y;
      if(uMirror > 0.5) wp.y = -wp.y;
      gl_Position = projectionMatrix*viewMatrix*wp;
    }`;
  const charFS = /* glsl */`
    uniform sampler2D map, tDepth; uniform float uHeat, uKick, uMirror, uFlash; uniform vec2 uImg;
    varying vec2 vUv; varying float vY;
    void main(){
      if(vY < (uMirror > 0.5 ? 0.02 : -0.06)) discard;
      vec4 c = texture2D(map, vUv);
      if(c.a < 0.01) discard;
      vec3 col = c.rgb;
      vec2 px = 1./uImg;
      float dx = texture2D(tDepth, vUv+vec2(px.x*3.,0.)).r - texture2D(tDepth, vUv-vec2(px.x*3.,0.)).r;
      float dy = texture2D(tDepth, vUv+vec2(0.,px.y*3.)).r - texture2D(tDepth, vUv-vec2(0.,px.y*3.)).r;
      vec3 N = normalize(vec3(-dx*10., -dy*10., 1.));
      // rim light: the cut-out edge facing each light, plus the surfaces that turn toward it
      float aR = 1. - 0.5*(texture2D(map, vUv+vec2(7.,5.)*px).a + texture2D(map, vUv+vec2(16.,11.)*px).a);
      float aL = 1. - 0.5*(texture2D(map, vUv+vec2(-7.,2.)*px).a + texture2D(map, vUv+vec2(-16.,5.)*px).a);
      float nR = pow(clamp(dot(N, normalize(vec3(.75,.45,.3))),0.,1.), 2.);
      float nL = pow(clamp(dot(N, normalize(vec3(-.8,.1,.35))),0.,1.), 2.);
      float heat = clamp(uHeat, 0., 1.);
      float lum = dot(col, vec3(.3,.6,.1));
      col *= mix(vec3(0.62,0.68,0.94)*0.72, vec3(1.02,0.80,0.66)*0.80, heat);
      vec3 rimW = mix(vec3(0.95,0.30,0.34)*1.5, vec3(1.0,0.30,0.05)*3.4, heat) * (1.+uKick*0.8);
      vec3 rimT = vec3(0.10,0.85,0.80) * mix(1.5, 0.45, heat);
      col += rimW * (aR*0.95 + nR*0.32) * (0.22 + lum);
      col += rimT * (aL*0.85 + nL*0.25) * (0.18 + lum);
      col *= mix(0.2, 1., smoothstep(-0.3, 1.9, vY));       // darker where he meets the water
      col += uFlash * vec3(1.,.45,.15) * (aR+aL) * 1.2;
      float a = c.a;
      if(uMirror > 0.5){ a *= (1.-smoothstep(0.1, 3.8, vY))*0.9; col *= 0.6; }
      gl_FragColor = vec4(col, a);
    }`;
  const charGeo = new THREE.PlaneGeometry(cw, CHAR.h, 96, 140);
  const charMat = new THREE.ShaderMaterial({ uniforms: charU, vertexShader: charVS, fragmentShader: charFS, alphaToCoverage: true, side: THREE.DoubleSide });
  const charMesh = new THREE.Mesh(charGeo, charMat);
  charMesh.position.set(CHAR.x, CHAR.h / 2 - CHAR.sink, CHAR.z); charMesh.frustumCulled = false;
  scene.add(charMesh);
  const mirU = { ...charU, uMirror: { value: 1 } };
  const mirMat = new THREE.ShaderMaterial({ uniforms: mirU, vertexShader: charVS, fragmentShader: charFS, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  const mirror = new THREE.Mesh(charGeo, mirMat);
  mirror.position.copy(charMesh.position); mirror.frustumCulled = false;
  const mirrorScene = new THREE.Scene(); mirrorScene.add(mirror);

  // ---- smoke: soft sheets that face the camera, each a moving patch of cloud
  const R = (() => { let s = 1234567; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const puffs = [];
  const add = (n, f) => { for (let i = 0; i < n; i++) puffs.push(f(i)); };
  add(9, () => ({ p: [CHAR.x + (R() - .5) * 5.0, 0.25 + R() * 0.35, CHAR.z + 0.7 + R() * 1.6], s: 2.0 + R() * 1.4, a: 0.30, c: 0 }));   // around his legs
  add(7, () => ({ p: [CHAR.x + (R() - .5) * 9, 0.6 + R() * 2.2, CHAR.z - 3 - R() * 7], s: 6 + R() * 4, a: 0.21, c: 0 }));                 // behind him
  add(14, () => ({ p: [(R() - .5) * 15, 0.25 + R() * 0.9, -6 - R() * 28], s: 4.5 + R() * 5, a: 0.16, c: 0 }));                             // low mist on the water
  add(6, (i) => ({ p: [(i % 2 ? 1 : -1) * (9.5 + R() * 4), 5 + R() * 5, -61 - R() * 3], s: 9 + R() * 5, a: 0.26, c: 1 }));                 // steam at the shrine's sides
  add(5, () => ({ p: [(R() - .5) * 7, 1.0 + R() * 3.5, -24 - R() * 10], s: 5 + R() * 4, a: 0.12, c: 0 }));                                 // drifting through the camera's path
  const NP = puffs.length;
  const sg = new THREE.InstancedBufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute([-.5, -.5, 0, .5, -.5, 0, -.5, .5, 0, .5, .5, 0], 3));
  sg.setIndex([0, 1, 2, 2, 1, 3]);
  const iPos = new THREE.InstancedBufferAttribute(new Float32Array(NP * 4), 4), iPar = new THREE.InstancedBufferAttribute(new Float32Array(NP * 4), 4);
  sg.setAttribute('aPos', iPos); sg.setAttribute('aPar', iPar);
  sg.instanceCount = NP;
  puffs.forEach((q) => { q.seed = R(); q.sp = 0.6 + R() * 0.9; });
  const smokeMat = new THREE.ShaderMaterial({
    uniforms: { ...U },
    vertexShader: /* glsl */`
      attribute vec4 aPos, aPar; uniform float uTime; varying vec2 vQ; varying vec4 vPar; varying float vFade; varying float vWY;
      void main(){
        vec3 c = aPos.xyz;
        c.x += sin(uTime*0.23*aPar.y + aPar.x*40.)*0.8 + uTime*0.12*aPar.y;
        c.y += sin(uTime*0.31 + aPar.x*17.)*0.18;
        vec4 mv = viewMatrix*vec4(c,1.);
        float a = aPar.x*6.283 + uTime*0.05*aPar.y;
        vec2 q = position.xy; q = vec2(cos(a)*q.x - sin(a)*q.y, sin(a)*q.x + cos(a)*q.y);
        mv.xy += q*aPos.w;
        vWY = (inverse(viewMatrix)*mv).y;
        vQ = position.xy; vPar = aPar;
        vFade = smoothstep(0.6, 4.0, -mv.z);
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uHeat, uKick; varying vec2 vQ; varying vec4 vPar; varying float vFade; varying float vWY;
      ${NOISE}
      void main(){
        float r = length(vQ)*2.;
        float n = fbm(vQ*2.6 + vPar.x*23. + vec2(uTime*0.07*vPar.y, -uTime*0.11*vPar.y));
        float fall = 1.-smoothstep(0.0, 0.95, r);
        float a = fall*fall * smoothstep(0.40, 0.78, n) * vPar.z * vFade * smoothstep(0.0, 0.7, vWY) * 2.2 * mix(1., 0.6, clamp(uHeat,0.,1.));
        float heat = clamp(uHeat, 0., 1.);
        vec3 base = mix(vec3(0.10,0.09,0.17), vec3(0.30,0.07,0.03), heat) * (0.7 + 0.9*n) * (1. + 0.5*uKick*heat);
        vec3 steam = mix(vec3(0.20,0.42,0.48), vec3(0.50,0.22,0.12), heat*0.8) * (0.6 + n);
        vec3 col = mix(base, steam, vPar.w);
        gl_FragColor = vec4(col*a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const smoke = new THREE.Mesh(sg, smokeMat); smoke.frustumCulled = false; smoke.renderOrder = 5; scene.add(smoke);

  // ---- embers
  const NE = 900, eSeed = new Float32Array(NE * 4);
  for (let i = 0; i < NE * 4; i++) eSeed[i] = R();
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(NE * 3), 3));
  eg.setAttribute('aSeed', new THREE.BufferAttribute(eSeed, 4));
  const emberMat = new THREE.ShaderMaterial({
    uniforms: { ...U, uRise: { value: 0 } },
    vertexShader: /* glsl */`
      attribute vec4 aSeed; uniform float uTime, uRise, uFocus, uHeat; uniform vec2 uRes; varying float vA; varying float vSoft; varying float vHot;
      void main(){
        float sp = 0.5 + aSeed.w*1.6;
        vec3 c = vec3((aSeed.x-.5)*26., mod(aSeed.z*13. + uRise*sp, 13.) - 0.4, -4. - aSeed.y*52.);
        c.x += sin(uTime*1.1*sp + aSeed.w*40.)*0.55 + sin(uTime*2.7 + aSeed.x*90.)*0.18 + c.y*0.12;
        c.z += cos(uTime*0.9*sp + aSeed.x*33.)*0.5;
        vec4 mv = viewMatrix*vec4(c,1.);
        float d = max(-mv.z, 0.3);
        float coc = abs(1./uFocus - 1./d)*11.;                       // out of focus: bigger and fainter
        float size = (0.035 + 0.05*aSeed.w) * uRes.y*1.25/d;
        float blur = clamp(coc, 0., 1.)*17.;
        gl_PointSize = clamp(size + blur, 1.6, 90.);
        vSoft = blur/(size+blur+0.001);
        float life = smoothstep(-0.4, 0.8, c.y)*smoothstep(12.6, 8., c.y);
        vA = life * (size*size)/((size+blur)*(size+blur)) * (0.45 + 0.55*sin(uTime*(7.+aSeed.x*9.) + aSeed.z*50.)*0.5 + 0.5) * step(0.4, d);
        vA *= mix(0.28, 1.0, clamp(uHeat,0.,1.)) * (aSeed.y < 0.25 + 0.75*clamp(uHeat+0.35,0.,1.) ? 1. : 0.);
        vHot = aSeed.x;
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vA, vSoft, vHot;
      void main(){
        float r = length(gl_PointCoord-.5)*2.;
        float a = mix(smoothstep(1., 0.25, r), smoothstep(1., 0.82, r)*0.8, vSoft);
        vec3 col = mix(vec3(1.0,0.28,0.04), vec3(1.0,0.62,0.18), vHot) * 4.5;
        gl_FragColor = vec4(col*a*vA, 1.);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const embers = new THREE.Points(eg, emberMat); embers.frustumCulled = false; embers.renderOrder = 6; scene.add(embers);


  const tmp = new THREE.Vector3();
  function update(t, st, camera) {
    U.uTime.value = t; U.uHeat.value = st.look.heat; U.uKick.value = st.look.kick; U.uFlash.value = st.look.flash; U.uFocus.value = st.focus;
    const pp = st.puppet, D = Math.PI / 180;
    charU.uHead.value.set(pp.headRot * D, pp.headDy, pp.headScale, pp.headZ);
    charU.uBody.value.set(pp.lean * D, pp.bob, pp.scale); charU.uHeadX.value = pp.headDx;
    charU.uChest.value.set(pp.chestDy, pp.breath);
    charU.uSpearGust.value.set(pp.spear * D, pp.gust);
    emberMat.uniforms.uRise.value = st.rise;
    // smoke drawn far to near
    const order = puffs.map((q) => ({ q, d: tmp.set(q.p[0], q.p[1], q.p[2]).distanceToSquared(camera.position) })).sort((a, b) => b.d - a.d);
    order.forEach(({ q }, i) => { iPos.setXYZW(i, q.p[0], q.p[1], q.p[2], q.s); iPar.setXYZW(i, q.seed, q.sp, q.a, q.c); });
    iPos.needsUpdate = true; iPar.needsUpdate = true;
  }
  return { scene, mirrorScene, reflRT, update, lant, U };
}

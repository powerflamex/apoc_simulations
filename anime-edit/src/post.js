// Everything that happens to the picture after the 3D scene is drawn:
// depth of field -> bloom + anamorphic streaks -> zoom/whip blur, flares, lightning, grade flip, text, grain.
import * as THREE from 'three';
import { NOISE } from './scene.js';

const VS = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;

export function buildPost(renderer, W, H, textTex) {
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const mesh = new THREE.Mesh(geo, null); mesh.frustumCulled = false;
  const sc = new THREE.Scene(); sc.add(mesh);
  const mk = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
  const run = (mat, target) => { mesh.material = mat; renderer.setRenderTarget(target); renderer.render(sc, cam); };
  const rt = (w, h) => new THREE.WebGLRenderTarget(Math.max(2, Math.round(w)), Math.max(2, Math.round(h)), { type: THREE.HalfFloatType, depthBuffer: false });

  const sceneRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(W, H) });
  const dofRT = rt(W, H);
  const B = [2, 4, 8, 16].map((k) => ({ a: rt(W / k, H / k), b: rt(W / k, H / k) }));
  const streakA = rt(W / 8, H / 8), streakB = rt(W / 8, H / 8);

  const dof = mk(/* glsl */`
    uniform sampler2D tColor, tDepth; uniform vec2 uRes; uniform float uNear, uFar, uFocus, uAperture, uMaxBlur;
    varying vec2 vUv;
    float lin(float z){ return uNear*uFar/(uFar - z*(uFar-uNear)); }
    float cocAt(float d){ return clamp(abs(1./uFocus - 1./d)*uAperture, 0., 1.)*uMaxBlur; }
    void main(){
      float d0 = lin(texture2D(tDepth, vUv).x), r0 = cocAt(d0);
      vec3 acc = texture2D(tColor, vUv).rgb; float tot = 1.;
      const int N = 64;
      for(int i=1;i<N;i++){
        float fi = float(i), rad = sqrt(fi/float(N))*uMaxBlur;
        vec2 o = vec2(cos(fi*2.39996323), sin(fi*2.39996323))*rad/uRes;
        vec3 c = texture2D(tColor, vUv+o).rgb;
        float d = lin(texture2D(tDepth, vUv+o).x), r = cocAt(d);
        if(d > d0) r = min(r, r0*2.);                 // what is behind never smears over something sharper in front
        float m = smoothstep(rad-0.5, rad+0.5, r);
        acc += mix(acc/tot, c, m); tot += 1.;
      }
      gl_FragColor = vec4(acc/tot, 1.);
    }`, { tColor: { value: sceneRT.texture }, tDepth: { value: sceneRT.depthTexture }, uRes: { value: new THREE.Vector2(W, H) },
    uNear: { value: 0.3 }, uFar: { value: 1200 }, uFocus: { value: 30 }, uAperture: { value: 11 }, uMaxBlur: { value: 15 } });

  const bright = mk(/* glsl */`
    uniform sampler2D t; uniform vec2 uPx; uniform float uThr; varying vec2 vUv;
    void main(){
      vec3 c = 0.25*(texture2D(t, vUv+uPx*vec2(-.5,-.5)).rgb + texture2D(t, vUv+uPx*vec2(.5,-.5)).rgb + texture2D(t, vUv+uPx*vec2(-.5,.5)).rgb + texture2D(t, vUv+uPx*vec2(.5,.5)).rgb);
      float m = max(c.r, max(c.g, c.b));
      gl_FragColor = vec4(min(c, vec3(24.))*smoothstep(uThr, uThr+0.7, m), 1.);
    }`, { t: { value: dofRT.texture }, uPx: { value: new THREE.Vector2(1 / W, 1 / H) }, uThr: { value: 0.72 } });
  const blur = mk(/* glsl */`
    uniform sampler2D t; uniform vec2 uDir; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(t, vUv).rgb*0.2270270270;
      c += (texture2D(t, vUv+uDir*1.3846153846).rgb + texture2D(t, vUv-uDir*1.3846153846).rgb)*0.3162162162;
      c += (texture2D(t, vUv+uDir*3.2307692308).rgb + texture2D(t, vUv-uDir*3.2307692308).rgb)*0.0702702703;
      gl_FragColor = vec4(c, 1.);
    }`, { t: { value: null }, uDir: { value: new THREE.Vector2() } });
  const copy = mk(/* glsl */`uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(t, vUv).rgb, 1.); }`, { t: { value: null } });

  const fin = mk(/* glsl */`
    uniform sampler2D tScene, tDepth, tB0, tB1, tB2, tB3, tStreak, tText; uniform vec2 uNF;
    uniform vec2 uRes, uLeak; uniform float uMirX, uTime, uZoom, uSpin, uWhip, uHeat, uKick, uFlash, uLoop, uArc, uGrain;
    uniform vec3 uL0, uL1; uniform vec4 uTextA; uniform vec2 uTextB, uLD;
    varying vec2 vUv;
    ${NOISE}
    float lin(float z){ return uNF.x*uNF.y/(uNF.y - z*(uNF.y-uNF.x)); }
    vec3 flare(vec3 L, float dist, vec2 uv, vec3 tint){
      if(L.z <= 0.) return vec3(0.);
      // hidden behind him (or a rock): no flare
      float vis = 0.;
      for(int i=0;i<5;i++){ vec2 o = vec2(cos(float(i)*1.2566), sin(float(i)*1.2566))*0.004; vis += step(dist - 4., lin(texture2D(tDepth, L.xy+o).x)); }
      L.z *= vis/5.;
      float asp = uRes.x/uRes.y;
      vec2 d = (uv - L.xy)*vec2(asp, 1.);
      float s = exp(-abs(d.y)*240.)*exp(-abs(d.x)*9.5)*0.5 + exp(-abs(d.y)*60.)*exp(-abs(d.x)*18.)*0.22;   // anamorphic streak
      s += 0.00016/(dot(d,d)+0.0005);                                                                      // hot core
      vec2 c = vec2(.5), g1 = c + (c-L.xy)*0.55, g2 = c + (c-L.xy)*1.25;
      float l1 = length((uv-g1)*vec2(asp,1.)), l2 = length((uv-g2)*vec2(asp,1.));
      s += smoothstep(0.045,0.040,l1)*0.05 + smoothstep(0.012,0.,abs(l2-0.085))*0.05;                      // ghosts
      return tint*s*L.z;
    }
    float arcs(vec2 uv){
      float tt = floor(uTime*30.), x = uv.x*uRes.x/uRes.y, acc = 0.;
      for(int k=0;k<4;k++){
        float fk = float(k);
        float on = step(0.35, hash21(vec2(fk*3.1, tt)));
        float y = 0.05 + 0.075*fk + 0.06*hash21(vec2(fk, tt)) + (fbm(vec2(x*4.5 + fk*13., tt*0.37 + fk)) - .5)*0.26 + (vnoise(vec2(x*42., tt+fk*7.))-.5)*0.02;
        float x0 = hash21(vec2(tt, fk+3.))*0.55, x1 = x0 + 0.25 + 0.5*hash21(vec2(tt+9., fk));
        float span = smoothstep(x0, x0+0.04, uv.x)*smoothstep(x1, x1-0.04, uv.x);
        acc += on*span*0.0013/(abs(uv.y - y)+0.0011);
      }
      return acc;
    }
    float textI(vec2 p, float n, float pop, float glitch, float bar){
      float S = 0.60*(1.+0.32*pop), sx = mix(1., 1.6, bar), sy = mix(1., 0.06, bar);
      vec2 a = vec2(p.x/(S*sx)/1024. + .5, p.y/(S*sy)/256. + .5);
      if(a.x < 0. || a.x > 1. || a.y < 0. || a.y > 1.) return 0.;
      return texture2D(tText, vec2(a.x, 1. - (n - 1. + (1.-a.y))/4.)).r * mix(1., 2.2, bar);
    }
    void main(){
      vec2 c = vec2(.5, .53), uv = vUv;
      if(uMirX > 0.5) uv.x = 1. - uv.x;           // the second half plays mirrored
      // zoom blur toward the centre (punch-ins), a little spin, and a sideways smear on the whips; colours split along it
      float jit = hash21(gl_FragCoord.xy + fract(uTime)*91.7);
      float z = uZoom + 0.006;
      vec3 col = vec3(0.), ws = vec3(0.);
      const int N = 28;
      for(int i=0;i<N;i++){
        float f = (float(i)+jit)/float(N);
        vec2 p = (uv - c)*uRes;
        float a = uSpin*f, k = cos(a), s = sin(a);
        p = vec2(k*p.x - s*p.y, s*p.x + k*p.y)*(1. - z*f)/uRes;
        p += vec2(uWhip*0.16, uWhip*0.035)*(f-.5);
        vec3 w = mix(vec3(1.), vec3(2.*(1.-f), 1., 2.*f), 0.75);
        col += texture2D(tScene, c + p).rgb*w; ws += w;
      }
      col /= ws;
      float heat = clamp(uHeat, 0., 1.);
      vec3 bl = texture2D(tB0, uv).rgb*0.8 + texture2D(tB1, uv).rgb + texture2D(tB2, uv).rgb*1.1 + texture2D(tB3, uv).rgb*1.3;
      col += bl*(0.09 + 0.08*uHeat + 0.05*uKick);
      col += texture2D(tStreak, uv).rgb * mix(vec3(0.35,0.6,1.0), vec3(1.0,0.42,0.15), heat) * (0.22 + 0.30*uHeat + 0.2*uKick);
      vec3 ft = mix(vec3(1.0,0.55,0.30), vec3(1.0,0.36,0.10), heat) * (0.5 + 0.5*uHeat + 0.4*uKick);
      col += flare(uL0, uLD.x, uv, ft) + flare(uL1, uLD.y, uv, ft);
      // a light leak sweeping across on the hard hits
      float lx = dot(uv - .5, normalize(vec2(.82,.57)));
      col += vec3(1.0,0.30,0.06) * exp(-pow((lx - uLeak.x)/0.16, 2.)) * uLeak.y * (0.15 + 0.45*heat);

      // grade: dark and cool, or fiery
      float l = dot(col, vec3(.2126,.7152,.0722));
      vec3 cool = pow(max(mix(vec3(l), col, 0.74)*vec3(0.62,0.72,1.06)*0.88, 0.), vec3(1.08));
      vec3 hot = mix(vec3(l), col, 1.2)*vec3(1.22,0.84,0.58)*1.08 + vec3(0.9,0.22,0.02)*l*l*0.10;
      col = mix(cool, hot, heat) * (1. + 0.12*max(uHeat-1., 0.));
      col += vec3(0.55,1.0,0.95)*arcs(uv)*uArc*1.5;
      col += vec3(1.0,0.62,0.34)*uFlash*0.7;
      col = mix(col, vec3(2.6,1.5,0.85), uLoop);

      // soft shoulder that keeps the colour
      float m = max(col.r, max(col.g, col.b));
      float tm = m < 0.6 ? m : 0.6 + 0.4*(1.-exp(-(m-0.6)/0.4));
      col *= tm/max(m, 1e-4);
      col = mix(col, vec3(tm), smoothstep(1.2, 5., m)*0.75);
      col = pow(max(col, 0.), vec3(1./2.2));
      col = mix(col, col*col*(3.-2.*col), 0.42 + 0.22*heat);
      col = max(col - 0.012 - 0.028*heat, 0.)*(1.012 + 0.03*heat);

      // the word: small, dead centre, glowing; breaks into slices, squashes to a bar and leaves
      if(uTextA.x > 0.5){
        vec2 p = (uv - vec2(.5, .5))*uRes;
        float g = uTextA.z, tq = floor(uTime*30.), row = floor(p.y/7.);
        p.x += uTextB.x*820.;
        p.x += (hash21(vec2(row, tq))-.5)*g*g*260.*step(0.45, hash21(vec2(row*1.7, tq+3.)));
        p.y += (hash21(vec2(tq, 5.))-.5)*g*26.;
        float sp = g*9.;
        vec3 t = vec3(textI(p+vec2(sp,0.), uTextA.x, uTextA.y, g, uTextA.w), textI(p, uTextA.x, uTextA.y, g, uTextA.w), textI(p-vec2(sp,0.), uTextA.x, uTextA.y, g, uTextA.w));
        float fl = 1. - g*0.55*step(0.6, hash21(vec2(tq, 11.)));
        col += t*(1.25 + 0.9*uTextA.y)*uTextB.y*fl;
      }
      vec2 q = uv - .5;
      col *= 1. - dot(q,q)*1.15;
      col += (hash21(gl_FragCoord.xy*0.7 + fract(uTime*7.31)*313.) - .5)*uGrain;
      gl_FragColor = vec4(clamp(col, 0., 1.), 1.);
    }`, {
    tScene: { value: dofRT.texture }, tB0: { value: B[0].a.texture }, tB1: { value: B[1].a.texture }, tB2: { value: B[2].a.texture }, tB3: { value: B[3].a.texture },
    tStreak: { value: streakA.texture }, tText: { value: textTex }, uRes: { value: new THREE.Vector2(W, H) }, uLeak: { value: new THREE.Vector2(-2, 0) },
    uMirX: { value: 0 }, uTime: { value: 0 }, uZoom: { value: 0 }, uSpin: { value: 0 }, uWhip: { value: 0 }, uHeat: { value: 0 }, uKick: { value: 0 }, uFlash: { value: 0 },
    uLoop: { value: 0 }, uArc: { value: 0 }, uGrain: { value: 0.03 }, uL0: { value: new THREE.Vector3() }, uL1: { value: new THREE.Vector3() },
    uTextA: { value: new THREE.Vector4() }, uTextB: { value: new THREE.Vector2() },
    tDepth: { value: sceneRT.depthTexture }, uNF: { value: new THREE.Vector2(0.3, 1200) }, uLD: { value: new THREE.Vector2() },
  });

  function render(camera) {
    dof.uniforms.uNear.value = camera.near; dof.uniforms.uFar.value = camera.far; fin.uniforms.uNF.value.set(camera.near, camera.far);
    run(dof, dofRT);
    bright.uniforms.t.value = dofRT.texture; run(bright, B[0].a);
    for (let i = 0; i < B.length; i++) {
      const { a, b } = B[i];
      if (i > 0) { copy.uniforms.t.value = B[i - 1].a.texture; run(copy, a); }
      for (let k = 0; k < 2; k++) {
        blur.uniforms.t.value = a.texture; blur.uniforms.uDir.value.set(1 / a.width, 0); run(blur, b);
        blur.uniforms.t.value = b.texture; blur.uniforms.uDir.value.set(0, 1 / a.height); run(blur, a);
      }
    }
    // long sideways streaks off the brightest things
    copy.uniforms.t.value = B[1].a.texture; run(copy, streakA);
    for (let k = 0; k < 3; k++) {
      blur.uniforms.t.value = streakA.texture; blur.uniforms.uDir.value.set((2.5 + k * 2.5) / streakA.width, 0); run(blur, streakB);
      blur.uniforms.t.value = streakB.texture; blur.uniforms.uDir.value.set((3.5 + k * 2.5) / streakA.width, 0); run(blur, streakA);
    }
    run(fin, null);
  }
  return { sceneRT, dof, fin, render };
}

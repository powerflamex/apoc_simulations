// You: a person in a hoodie and jeans, straight up and down over the crossing. Arms up on the way out, a crouch
// on every landing. From space on the way back you are a fireball (a white-hot core, an orange sheath, a long
// glowing trail); leaving the ground faster than sound you pull a cone of vapour; faster still, a column of
// glowing air marks your path for a moment.
import * as THREE from 'three';
import { makeHero } from './hero.js';
import { altitude, jumpAt, N_LAST, V_SOUND } from './timeline.js';
import { smooth, clamp } from './util.js';
import { SUN_DIR } from './earth.js';
const SUNV = new THREE.Vector3(), UPV = new THREE.Vector3();

const POSES = {
  rise: { lean: -0.05, bend: 0, sh: [2.9, 2.75], shOut: [0.12, 0.25], el: [0.05, 0.25], hip: [0.0, 0.08], hipOut: 0.03, knee: [0.05, 0.25], head: -0.2 },
  top: { lean: 0.15, bend: 0.1, sh: [0.35, 0.35], shOut: [1.35, 1.35], el: [0.35, 0.35], hip: [0.25, 0.1], hipOut: 0.18, knee: [0.4, 0.2], head: 0.55 },
  fall: { lean: 0.0, bend: 0.05, sh: [0.6, 0.6], shOut: [1.9, 1.9], el: [0.5, 0.5], hip: [0.35, 0.5], hipOut: 0.12, knee: [0.55, 0.75], head: 0.45 },
  crouch: { lean: 0.55, bend: 0.25, sh: [-0.5, 0.95], shOut: [0.7, 0.05], el: [0.3, 0.2], hip: [1.75, 1.2], hipOut: 0.2, knee: [2.3, 2.0], head: -0.35 },
};
export function makeYou(scene) {
  const body = makeHero(scene);

  // the vapour cone: an open cone around you, pointing down, a white shroud with a soft edge
  const coneU = { uA: { value: 0 }, uTime: { value: 0 } };
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 48, 1, true).translate(0, -0.5, 0), new THREE.ShaderMaterial({
    uniforms: coneU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `varying vec3 vP; varying vec3 vN; varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `uniform float uA; uniform float uTime; varying vec3 vP; varying vec3 vN; varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        #include <logdepthbuf_fragment>
        float a = atan(vP.z, vP.x);
        float along = clamp(-vP.y, 0.0, 1.0);
        float n = vn(vec2(a * 5.0, along * 6.0 - uTime * 8.0));
        float edge = pow(1.0 - abs(dot(normalize(vN), normalize(cameraPosition - vW))), 1.5);
        float alpha = uA * (0.35 + 0.65 * edge) * smoothstep(0.0, 0.25, along) * (1.0 - smoothstep(0.55, 1.0, along)) * (0.55 + 0.6 * n);
        gl_FragColor = vec4(vec3(0.92, 0.94, 0.97), alpha);
      }`,
  }));
  cone.frustumCulled = false;
  scene.add(cone);

  // glowing strips along your path (camera-facing, additive): the meteor trail and the column of hot air
  const beamMat = (c0, c1) => new THREE.ShaderMaterial({
    uniforms: { uA: { value: 0 }, uC0: { value: new THREE.Color(...c0) }, uC1: { value: new THREE.Color(...c1) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = (modelViewMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `uniform float uA; uniform vec3 uC0; uniform vec3 uC1; varying vec2 vUv; varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        float a = abs(vUv.x - 0.5) * 2.0;
        float core = exp(-a * a * 18.0) + 0.25 * exp(-a * a * 5.0) - 0.0067;
        float along = vUv.y;                       // 0 at you, 1 at the far end
        float k = core * pow(1.0 - along, 1.4) * smoothstep(0.0, 0.03, along + 0.01);
        k *= smoothstep(15.0, 60.0, length(vW));   // never right in front of the camera
        gl_FragColor = vec4(mix(uC0, uC1, smoothstep(0.0, 0.5, along)) * max(k, 0.0) * uA, 1.0);
      }`,
  });
  const beamGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const trail = new THREE.Mesh(beamGeo, beamMat([3.0, 2.4, 1.6], [2.2, 0.6, 0.15]));
  const column = new THREE.Mesh(beamGeo, beamMat([1.6, 1.5, 2.2], [0.9, 0.6, 1.4]));
  for (const m of [trail, column]) { m.frustumCulled = false; m.renderOrder = 7; scene.add(m); }

  return {
    body, cone,
    // pose and effects at video time v; s = state; glows/smoke for the fire
    frame(v, s, glows, smoke, camera) {
      const y = s.y, j = s.j, p = s.p;
      const last = j.n === N_LAST;
      // pose: launch (arms up), float at the top (arms out), fall feet first, the crouch of a superhero landing
      const P = POSES;
      const wRise = last ? 1 : 1 - smooth(0.36, 0.48, p);
      const wFall = last ? 0 : smooth(0.55, 0.7, p);
      const wTop = 1 - wRise - wFall;
      const crouch = Math.max(Math.exp(-Math.pow(p / 0.03, 2)), last ? 0 : Math.exp(-Math.pow((1 - p) / 0.022, 2)));
      const mix = (k) => { const r = P.rise[k], t = P.top[k], f = P.fall[k], c = P.crouch[k];
        const one = (i) => { const a = Array.isArray(r) ? r[i] : r, b = Array.isArray(t) ? t[i] : t, d = Array.isArray(f) ? f[i] : f, e = Array.isArray(c) ? c[i] : c;
          return ((a * wRise + b * wTop + d * wFall) * (1 - crouch) + e * crouch); };
        return Array.isArray(r) ? [one(0), one(1)] : one(0); };
      const sw = Math.sin(v * 2.3 + j.n);
      // the crater floor is below the street: crouch down there
      const depth = s.bounce ? s.bounce.depth : 0;
      const yHero = y - depth * (1 - smooth(0, 3 * depth + 1, y));
      body.pose({ x: 0, y: yHero, z: 0, yaw: 0.3 * Math.sin(v * 0.7 + j.n) * (1 - crouch), lean: mix('lean'), bend: mix('bend'),
        sh: mix('sh'), shOut: mix('shOut').map((x) => x + 0.08 * sw * (1 - crouch)), el: mix('el'), hip: mix('hip'), hipOut: mix('hipOut'), knee: mix('knee'), head: mix('head') });
      // the fireball: you heat up coming back in, glow, leave a trail of hot air above you
      const heat = s.reentry;
      trail.visible = false; column.visible = false;
      const sunlit = smooth(9000, 20000, y);   // up here the Sun is above your horizon again
      body.setGlow(2.5 * heat, 1.2 * heat, 0.5 * heat);
      body.setSun(SUNV.copy(SUN_DIR).transformDirection(camera.matrixWorldInverse), sunlit, UPV.set(0, 1, 0).transformDirection(camera.matrixWorldInverse), 1 - smooth(3000, 20000, y) * 0.8);
      if (heat > 0.01) {
        const sz = 1.2 + 2.2 * heat;
        glows.add(0, y + 0.9, 0, sz, 6 * heat, 3.5 * heat, 1.6 * heat);
        glows.add(0, y + 1.6, 0, sz * 2.2, 2.5 * heat, 0.8 * heat, 0.2 * heat);
        // the trail: a streak of glowing air above you, kilometres long (a meteor's)
        const span = Math.max(150, Math.min(140e3 - y, Math.max(y * 0.6, 400), 30000)) * (0.3 + 0.7 * heat);
        trail.visible = true;
        trail.position.set(0, y + 1.2, 0);
        trail.rotation.set(0, Math.atan2(camera.position.x, camera.position.z), 0);
        trail.scale.set(Math.min(4 + span * 0.004, 60), span, 1);
        trail.material.uniforms.uA.value = heat;
        if (y < 6000) for (let k = 0; k < 14; k++) {
          const yy = y + 8 + k * k * 3;
          smoke.puff(Math.sin(k * 2.1) * 2, yy, Math.cos(k * 1.3) * 2, 3 + k * 0.8, 0.22 * heat * (1 - k / 14), 0.25, 0.4 * heat, k / 14);
        }
      }
      // leaving the ground faster than the air can move: glowing shock round you, then a column of hot air
      const lg = s.launchGlow;
      if (lg > 0.01 && y < 5000) {
        glows.add(0, y + 0.9, 0, 0.8 + 1.2 * lg, 1.8 * lg, 1.3 * lg, 1.0 * lg);
      }
      // the column of glowing air left by a hypersonic takeoff, fading over a second
      if (j.n >= 17 && !last && !(j.n >= 29 && p > 0.25)) {
        const age = v - j.t0 - j.dw;
        const a = age < 0 ? 0 : Math.exp(-age / 0.35) * smooth(16.5, 20, j.n);
        if (a > 0.05) {
          const L = Math.min(Math.max(y, 1), 60000);
          column.visible = true;
          column.position.set(0, y, 0);
          column.rotation.set(Math.PI, Math.atan2(camera.position.x, camera.position.z), 0);
          column.scale.set(3 + L * 0.002, L, 1);
          column.material.uniforms.uA.value = a * 0.9;
        }
      }
      // the vapour cone at the first supersonic takeoff
      const vc = Math.exp(-Math.pow((v - V_SOUND - 0.12) / 0.16, 2)) * (j.n === 15 || j.n === 14 ? 1 : 0);
      cone.visible = vc > 0.01;
      if (cone.visible) {
        coneU.uA.value = vc * 0.9; coneU.uTime.value = v;
        cone.position.set(0, y + 1.7, 0);
        cone.scale.set(4.5, 7, 4.5);
      }
    },
    head(v) { return new THREE.Vector3(0, altitude(v) + 1.8, 0); },
  };
}

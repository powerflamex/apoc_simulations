// The air catching fire round the suit on the way down: a glowing sheath round the body (pink at first, then
// orange, then white-hot), a long streaming trail behind you with flowing streaks, sparks pouring back off the
// suit, and the fireball at the end. All additive, drawn after the suit; the trail points backward (+z).
import * as THREE from 'three';

const NOISE = /* glsl */ `
  float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z); }
  vec3 hotCol(float k) {
    vec3 pink = vec3(1.0, 0.3, 0.5), orange = vec3(1.0, 0.36, 0.05), white = vec3(1.0, 0.85, 0.6);
    return mix(mix(pink, orange, smoothstep(0.1, 0.5, k)), white, smoothstep(0.85, 1.25, k));
  }`;

export function makePlasma(parent) {
  const U = { uGlow: { value: 0 }, uTime: { value: 0 }, uBall: { value: 0 } };
  // ---- the sheath: a stretched shell round the body, bright at the edges, flickering ----
  const sheathMat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uGlow, uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP; ${NOISE}
      void main(){
        float edge = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
        float fl = 0.6 + 0.6 * n3(vP * 4.0 + vec3(0.0, 0.0, -uTime * 14.0)) + 0.3 * n3(vP * 11.0 + vec3(uTime * 3.0, 0.0, -uTime * 30.0));
        float k = clamp(uGlow, 0.0, 1.3);
        // the front (toward -z) is hottest, the back fades into the trail
        float front = smoothstep(0.9, -0.6, vP.z);
        vec3 c = hotCol(k) * (0.25 + 0.75 * front) * fl * (edge * 1.6 + 0.12 * smoothstep(0.5, 1.2, k));
        gl_FragColor = vec4(c * k * 0.5, 1.0);
      }`,
  });
  const sheath = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 24), sheathMat);
  sheath.scale.set(0.27, 0.56, 0.3);
  sheath.position.set(0, 0.4, 0.05);
  sheath.frustumCulled = false;
  parent.add(sheath);

  // ---- the trail: a cone opening backward, streaks flowing along it ----
  const trailMat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uGlow, uTime; varying vec3 vP; varying vec3 vN; varying vec3 vV; ${NOISE}
      void main(){
        // the cone: apex at y = +L/2 (at the suit), base at y = -L/2; along = 0 at the suit
        float along = clamp(0.5 - vP.y / 44.0, 0.0, 1.0);
        float ang = atan(vP.x, vP.z);
        float k = clamp(uGlow, 0.0, 1.3);
        float streak = n3(vec3(ang * 2.2, along * 9.0 - uTime * 26.0, 1.0)) * 0.7 + n3(vec3(ang * 5.0 + 3.0, along * 22.0 - uTime * 40.0, 2.0)) * 0.5;
        streak = smoothstep(0.35, 0.95, streak);
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 0.8);
        float fade = pow(1.0 - along, 1.7) * smoothstep(0.0, 0.03, along);
        vec3 c = hotCol(k * (1.0 - 0.5 * along)) * (0.35 + 1.1 * streak) * edge * fade;
        gl_FragColor = vec4(c * k * 0.9, 1.0);
      }`,
  });
  const trail = new THREE.Mesh(new THREE.ConeGeometry(2.6, 44, 32, 1, true), trailMat);
  // the cone's apex (local +y) must sit at the suit and its wide end 44 m behind (+z): turn +y onto -z and centre it at z = +22
  trail.rotation.x = -Math.PI / 2;
  trail.position.set(0, 0.4, 22.0 - 0.4);
  trail.frustumCulled = false;
  parent.add(trail);

  // ---- sparks: points pouring back off the suit, each on its own loop ----
  const NS = 500;
  const seeds = new Float32Array(NS * 3);
  for (let i = 0; i < NS; i++) { seeds[i * 3] = Math.random(); seeds[i * 3 + 1] = Math.random(); seeds[i * 3 + 2] = Math.random(); }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NS * 3), 3));
  sg.setAttribute('seed', new THREE.BufferAttribute(seeds, 3));
  const sparkMat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uGlow, uTime; attribute vec3 seed; varying float vA; varying float vK;
      void main(){
        float sp = 6.0 + 10.0 * seed.y;
        float t = fract(uTime * sp / 30.0 + seed.x);          // 0 at the suit .. 1 far back
        float ang = seed.z * 6.2831853 + t * 3.0 * (seed.x - 0.5);
        float rad = 0.25 + 0.7 * t + 1.6 * t * t * seed.y;
        vec3 p = vec3(cos(ang) * rad, 0.4 + sin(ang) * rad * 0.9, t * 30.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (2.5 + 5.0 * seed.z) * (1.0 - 0.6 * t) * 260.0 / max(-mv.z, 0.5);
        vA = (1.0 - t) * smoothstep(0.0, 0.08, t) * clamp(uGlow - 0.15, 0.0, 1.0) * (0.5 + 0.5 * seed.y);
        vK = uGlow;
      }`,
    fragmentShader: `varying float vA; varying float vK; ${NOISE}
      void main(){
        vec2 d = gl_PointCoord - 0.5;
        float a = exp(-dot(d, d) * 14.0);
        gl_FragColor = vec4(hotCol(clamp(vK, 0.0, 1.2)) * a * vA * 2.2, 1.0);
      }`,
  });
  const sparks = new THREE.Points(sg, sparkMat);
  sparks.frustumCulled = false;
  parent.add(sparks);

  // ---- the fireball: a growing, roiling ball of fire swallowing the suit ----
  const ballMat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uBall, uTime; varying vec3 vP; varying vec3 vN; varying vec3 vV; ${NOISE}
      void main(){
        float edge = abs(dot(normalize(vN), normalize(vV)));
        float n = n3(vP * 2.5 + vec3(0.0, uTime * 2.0, 0.0)) * 0.6 + n3(vP * 6.0 - vec3(uTime * 3.0)) * 0.4;
        float core = pow(edge, 0.6) * (0.25 + 1.4 * n);
        vec3 c = mix(vec3(1.0, 0.22, 0.03), vec3(1.0, 0.72, 0.28), smoothstep(0.5, 1.0, core * uBall));
        gl_FragColor = vec4(c * core * uBall * 0.55, 1.0);
      }`,
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), ballMat);
  ball.position.set(0, 0.4, 0);
  ball.frustumCulled = false;
  ball.visible = false;
  parent.add(ball);

  const light = new THREE.PointLight(0xff8a3a, 0, 14, 1.4);
  light.position.set(0, 0.5, 0.4);
  parent.add(light);

  function update(v, glow, ballK) {
    U.uGlow.value = glow;
    U.uTime.value = v;
    U.uBall.value = ballK;
    const on = glow > 0.01;
    sheath.visible = on; trail.visible = on; sparks.visible = on;
    ball.visible = ballK > 0.01;
    ball.scale.setScalar(0.5 + 2.6 * ballK * ballK);
    light.intensity = 6 * Math.min(glow, 1.3) + 40 * ballK;
    light.color.setRGB(1.0, 0.45 + 0.4 * Math.min(glow, 1), 0.15 + 0.5 * Math.min(glow, 1) * Math.min(glow, 1));
  }
  return { update, light, sheath, trail };
}

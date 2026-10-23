// Domain Expansion: Unlimited Void. One look, painted by view direction only (so it is "infinitely far"): a black
// sphere with a blazing ring behind him, a sky thick with stars and violet-blue nebula, and streams of light (the
// information) pouring out of the ring toward you, faster and denser as it goes on, until everything is white.
// It is drawn twice: on the bubble that swells out of him over the city (front faces, with a bright rim), and as
// the whole sky once the bubble has passed you.
import * as THREE from 'three';

const FRAG = /* glsl */ `
uniform float uTime; uniform float uInfo; uniform float uWhite; uniform vec3 uC; uniform float uRim; uniform float uBubble;
varying vec3 vDir; varying vec3 vN; varying vec3 vV;
float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float h11(float x) { return fract(sin(x * 91.3458) * 47453.5453); }
float n3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h13(i), h13(i+vec3(1,0,0)), f.x), mix(h13(i+vec3(0,1,0)), h13(i+vec3(1,1,0)), f.x), f.y), mix(mix(h13(i+vec3(0,0,1)), h13(i+vec3(1,0,1)), f.x), mix(h13(i+vec3(0,1,1)), h13(i+vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.02 + 3.7; a *= 0.5; } return s; }
void main() {
  vec3 v = normalize(vDir);
  float ang = acos(clamp(dot(v, uC), -1.0, 1.0));            // angle from the black sphere's centre
  vec3 t1 = normalize(cross(uC, vec3(0.0, 1.0, 0.0))), t2 = cross(t1, uC);
  float phi = atan(dot(v, t2), dot(v, t1));
  // deep space: nebula and stars
  float neb = fbm(v * 2.6 + vec3(0.0, 0.0, uTime * 0.02));
  float neb2 = fbm(v * 6.0 - 3.0);
  vec3 c = vec3(0.004, 0.006, 0.02);
  c += mix(vec3(0.16, 0.03, 0.3), vec3(0.03, 0.12, 0.3), neb2) * smoothstep(0.42, 0.85, neb) * 1.4;
  vec3 sp = v * 420.0;
  float st = h13(floor(sp));
  float star = step(0.992, st) * pow(1.0 - length(fract(sp) - 0.5) * 1.6, 3.0);
  c += vec3(1.0, 0.95, 1.1) * star * (0.8 + 0.6 * sin(uTime * 3.0 + st * 60.0));
  vec3 sp2 = v * 1300.0;
  c += vec3(0.7, 0.8, 1.0) * step(0.996, h13(floor(sp2))) * 0.9;
  // the black sphere and its ring (like a total eclipse)
  const float RS = 0.24;
  float ring = exp(-pow((ang - RS) / 0.005, 2.0)) * 3.0 + exp(-max(ang - RS, 0.0) / 0.03) * 0.5 * step(RS, ang) + exp(-max(ang - RS, 0.0) / 0.14) * 0.08;
  float flare = pow(0.5 + 0.5 * sin(phi * 9.0 + fbm(vec3(phi * 2.0, uTime * 0.3, 1.0)) * 6.0), 6.0) * exp(-max(ang - RS, 0.0) / 0.09) * step(RS, ang);
  c += vec3(0.85, 0.92, 1.25) * (ring + flare * 0.35);
  // the information: streams of light running out of the ring toward you along every direction
  float lanes = 260.0;
  float li = floor((phi / 6.2832 + 0.5) * lanes);
  float lf = fract((phi / 6.2832 + 0.5) * lanes);
  float sel = h11(li * 1.37 + 0.5);
  float spd = 0.6 + 1.6 * h11(li * 3.1);
  float r = log(max(ang - RS, 0.0005) + 0.02);
  float dash = fract(r * (2.0 + 3.0 * h11(li)) - uTime * spd * (1.0 + 2.5 * uInfo) + sel * 7.0);
  float streak = smoothstep(0.0, 0.08, dash) * (1.0 - smoothstep(0.1, 0.55, dash)) * (1.0 - smoothstep(0.08, 0.5, abs(lf - 0.5) * 2.0));
  float on = step(1.0 - (0.08 + 0.75 * uInfo), sel) * step(RS, ang);
  vec3 sc = mix(vec3(0.6, 0.85, 1.6), vec3(1.4, 0.7, 2.0), h11(li * 7.7));
  c += sc * streak * on * (0.35 + 1.1 * uInfo) * smoothstep(RS, RS + 0.05, ang);
  // inside the sphere: black (a faint glow in the middle)
  float inS = 1.0 - smoothstep(RS - 0.003, RS, ang);
  c = mix(c, vec3(0.0), inS);
  // the bubble's edge, seen from outside: a bright violet-white rim
  if (uBubble > 0.5) {
    float mu = abs(dot(normalize(vN), normalize(vV)));
    c += vec3(1.6, 1.3, 2.4) * pow(1.0 - mu, 6.0) * uRim * 1.5;
  }
  c = mix(c, vec3(6.0), uWhite);
  gl_FragColor = vec4(c, 1.0);
}`;

export function makeVoid(scene) {
  const U = { uTime: { value: 0 }, uInfo: { value: 0 }, uWhite: { value: 0 }, uC: { value: new THREE.Vector3(0, 0.3, -1).normalize() }, uRim: { value: 1 } };
  const mk = (bubble) => new THREE.ShaderMaterial({
    uniforms: { ...U, uBubble: { value: bubble ? 1 : 0 } },
    vertexShader: /* glsl */ `varying vec3 vDir; varying vec3 vN; varying vec3 vV;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vDir = w.xyz - cameraPosition; vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w; ${bubble ? '' : 'gl_Position.z = gl_Position.w * 0.99999;'} }`,
    fragmentShader: FRAG,
    side: bubble ? THREE.FrontSide : THREE.BackSide,
    depthWrite: false, depthTest: !!bubble, transparent: !!bubble,
  });
  // the bubble: drawn after the city, without writing depth: it covers whatever is inside it (farther than its
  // front surface) and nothing in front of it; he is drawn after it, so he shows inside
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), mk(true));
  bubble.renderOrder = 20; bubble.frustumCulled = false; bubble.visible = false;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 64, 32), mk(false));
  sky.renderOrder = -9; sky.frustumCulled = false; sky.visible = false;
  scene.add(bubble, sky);
  return { bubble, sky, U };
}

// The outside view of the flood (owner, Oct 29: show why the subway floods): from a rooftop on the waterfront at night,
// the black hole and its disk over the sea, the Moon pulled into a shard beside it, and the ocean heaped up into a
// dome of water rising toward the hole. The surge comes over the seawall and pours into the streets below. 3.6 s,
// then the street-level view of the water rushing down the subway entrance (street.js).
// Metres; the sea is to the north (-z); the shore (the seawall) runs along z = 0; you stand on a roof at z = 120.
import * as THREE from 'three';
import { G, patch } from './bend.js';
import { makeSky } from './sky.js';
import { rng, smooth, lerp, DEG } from './util.js';

const seaVert = /* glsl */ `
uniform float uT, uDome, uSurge;
varying vec3 vW; varying vec3 vN; varying float vFoam;
float hgt(vec2 p) {
  // the dome: the ocean pulled up toward the hole, far out; it leans toward the shore as it rises
  vec2 c = vec2(-60.0, -2000.0);
  float d = length((p - c) * vec2(0.55, 1.0));
  float dome = uDome * 780.0 * exp(-pow(d / 950.0, 2.0));
  // the surge: a long swell rolling in to the shore, and the whole sea lifted near the shore
  float front = mix(-1400.0, 60.0, uSurge);
  float swell = 9.0 * exp(-pow((p.y - front) / 60.0, 2.0)) * uSurge + 5.0 * uSurge * smoothstep(-900.0, 0.0, p.y);
  float waves = 0.9 * sin(p.x * 0.031 + uT * 1.3) * sin(p.y * 0.027 - uT * 1.1) + 0.45 * sin(p.x * 0.083 - p.y * 0.061 + uT * 2.3);
  return dome + swell + waves;
}
void main() {
  vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
  float h = hgt(p.xz);
  float e = 4.0;
  vec3 n = normalize(vec3(hgt(p.xz - vec2(e, 0.0)) - hgt(p.xz + vec2(e, 0.0)), 2.0 * e, hgt(p.xz - vec2(0.0, e)) - hgt(p.xz + vec2(0.0, e))));
  p.y += h;
  vW = p; vN = n;
  float front = mix(-1400.0, 60.0, uSurge);
  vFoam = exp(-pow((p.z - front) / 25.0, 2.0)) * uSurge + smoothstep(0.35, 0.9, 1.0 - n.y) * 0.8;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const seaFrag = /* glsl */ `
uniform vec3 uSky, uGlow, uBhDir; uniform float uT;
varying vec3 vW; varying vec3 vN; varying float vFoam;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec3 n = normalize(vN + vec3(vn(vW.xz * 0.05 + uT * 0.3) - 0.5, 0.0, vn(vW.xz * 0.05 - uT * 0.25) - 0.5) * 0.25);
  vec3 v = normalize(cameraPosition - vW);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0) * 0.9 + 0.05;
  vec3 r = reflect(-v, n);
  // the disk's light on the water: a broad orange sheen and a hot glint toward the hole
  float g = max(dot(r, uBhDir), 0.0);
  vec3 col = vec3(0.006, 0.016, 0.022) + uSky * fres + uGlow * (0.08 * pow(g, 8.0) + 1.6 * pow(g, 120.0));
  // the dome's flanks catch the disk's light from above
  col += uGlow * 0.3 * pow(max(dot(n, uBhDir), 0.0), 2.0) * smoothstep(0.98, 0.7, n.y);
  float foam = clamp(vFoam * (0.6 + 0.6 * vn(vW.xz * 0.08 + vec2(0.0, uT * 2.0))), 0.0, 1.0);
  col = mix(col, vec3(0.75, 0.72, 0.68) * (0.4 + uGlow * 0.15), foam * 0.85);
  gl_FragColor = vec4(col, 1.0);
}`;

export function makeCoast() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x120c0a, 0.00012);
  const camera = new THREE.PerspectiveCamera(74, 1920 / 1080, 1, 20000);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  const sky = makeSky();
  scene.add(sky.mesh);
  const R = rng(616);

  // the sea
  const seaU = { uT: { value: 0 }, uDome: { value: 0 }, uSurge: { value: 0 }, uSky: { value: new THREE.Color(0.05, 0.03, 0.025) }, uGlow: { value: new THREE.Color(1.6, 0.85, 0.4) }, uBhDir: { value: new THREE.Vector3() } };
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 6000, 360, 300).rotateX(-Math.PI / 2).translate(0, 0, -2900), new THREE.ShaderMaterial({ uniforms: seaU, vertexShader: seaVert, fragmentShader: seaFrag }));
  sea.frustumCulled = false;
  scene.add(sea);

  // the land: the seawall, the shore road, the city (lit windows, the facade shader shared with the avenue)
  const plainMat = (color, rough = 0.9) => patch(new THREE.MeshStandardMaterial({ color, roughness: rough }));
  const land = new THREE.Mesh(new THREE.BoxGeometry(9000, 30, 3000).translate(0, -27, 1500), plainMat(0x1c1a19));
  scene.add(land);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(9000, 6, 3).translate(0, 0, 1.5), plainMat(0x6a655f, 0.8));
  scene.add(wall);
  const road = new THREE.Mesh(new THREE.BoxGeometry(9000, 0.2, 24).translate(0, 3.1, 16), plainMat(0x18191c, 0.85));
  scene.add(road);
  {
    const B = [];
    // the front row on the shore road (lower than your roof), the rest of the city behind you
    for (let x = -1800; x < 1800; x += 26 + R() * 30) B.push([x, 40 + R() * 30, 22 + R() * 18, 22 + R() * 20, 16 + R() * 26]);
    for (let i = 0; i < 260; i++) B.push([(R() * 2 - 1) * 2200, 150 + R() * 900, 20 + R() * 40, 20 + R() * 40, 25 + R() * 140]);
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(B.map(() => R())), 1));
    geo.setAttribute('aGround', new THREE.InstancedBufferAttribute(new Float32Array(B.length).fill(3), 1));
    const mesh = new THREE.InstancedMesh(geo, patch(new THREE.MeshStandardMaterial({ roughness: 0.85 }), { windows: true }), B.length);
    const d = new THREE.Object3D(), c = new THREE.Color();
    B.forEach(([x, z, w, dd, h], i) => {
      if (Math.abs(x) < 30 && z > 100 && z < 160) h = 0.1;   // (the roof you stand on is drawn separately)
      d.position.set(x, 3, z); d.scale.set(w, h, dd); d.updateMatrix(); mesh.setMatrixAt(i, d.matrix);
      mesh.setColorAt(i, c.set([0x5b5550, 0x6a625b, 0x4c4a4c, 0x7a6e62, 0x3f4650][Math.floor(R() * 5)]));
    });
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  // the street lights along the shore road
  {
    const n = 140;
    const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.9, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 3.8, 1.8) }), n);
    const d = new THREE.Object3D();
    for (let i = 0; i < n; i++) { d.position.set(-1800 + i * 26, 11, 6); d.updateMatrix(); lamps.setMatrixAt(i, d.matrix); }
    lamps.frustumCulled = false;
    scene.add(lamps);
  }
  // the water coming over the wall and into the streets (a sheet rising over the land behind the surge)
  const floodMat = new THREE.MeshStandardMaterial({ color: 0x0d1a1c, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.92 });
  const flood = new THREE.Mesh(new THREE.PlaneGeometry(9000, 1, 1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5), floodMat);
  scene.add(flood);
  const hemi = new THREE.HemisphereLight(0x8a5a3a, 0x1a1210, 0.7);
  scene.add(hemi);
  const diskLight = new THREE.DirectionalLight(0xffa060, 2.2);
  scene.add(diskLight, diskLight.target);

  const dirFromAzEl = (az, el, out) => out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  const bhDir = new THREE.Vector3(), moon0 = new THREE.Vector3(), moonDir = new THREE.Vector3(), tail = new THREE.Vector3();
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), q0 = new THREE.Quaternion(), fwd = new THREE.Vector3(0, 0, -1);
  return {
    scene, camera,
    frame(v, s) {
      const t = s.t;
      const k = smooth(219, 222.6, t);
      // a slow push in from the roof's edge, tilting down to the water hitting the wall
      camera.position.set(lerp(-6, -2, k), 62, lerp(124, 116, k));
      camera.rotation.set(lerp(9, 1, k) * DEG, lerp(4, 1, k) * DEG, 0);
      camera.fov = 74;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      G.uTime.value = t; G.uCurl.value = 0;
      dirFromAzEl(-3 * DEG, 33 * DEG, bhDir);
      dirFromAzEl(-12 * DEG, 44 * DEG, moon0);
      qa.setFromUnitVectors(fwd, moon0); qb.setFromUnitVectors(fwd, bhDir); q0.slerpQuaternions(qa, qb, 0.25);
      moonDir.copy(fwd).applyQuaternion(q0);
      tail.copy(bhDir).sub(moon0).normalize();
      const u = sky.uniforms;
      sky.mesh.position.copy(camera.position);
      u.uTime.value = t; u.uNight.value = 1; u.uStarVis.value = 0.45;
      u.uSunDir.value.set(0.2, -0.4, 1).normalize();
      u.uBhDir.value.copy(bhDir); u.uBhD.value = 70; u.uDisk.value = 1.05;
      u.uMoonDir.value.copy(moonDir); u.uMoonTail.value.copy(tail); u.uMoonStretch.value = 0.75; u.uMoonFade.value = 1; u.uJupFade.value = 0;
      u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / 1080;
      seaU.uT.value = t; seaU.uBhDir.value.copy(bhDir);
      seaU.uDome.value = 0.75 + 0.25 * k;
      seaU.uSurge.value = lerp(0.62, 1.0, k);
      // over the wall: the land floods from the wall inland
      const inland = Math.max(0, (t - 220.6) * 45);
      flood.visible = inland > 0;
      flood.position.set(0, 3.3 + 1.2 * k, 0);
      flood.scale.z = Math.max(0.01, inland);
      diskLight.position.copy(bhDir).multiplyScalar(300).add(camera.position);
      diskLight.target.position.copy(camera.position);
    },
  };
}

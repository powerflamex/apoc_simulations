// The Ferris wheel on the far bank: a double rim of steel with LED strips, 32 glass pods hung outside the rim,
// cable spokes to a hub held up by an A-frame. Turning slowly at sunset. When gravity passes ~5x the A-frame
// buckles: the hub drops, the rim crumples and the whole wheel folds forward onto the embankment and into the
// river, its lights flickering out.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WHEEL } from './layout.js';
import { smooth, clamp } from './util.js';

const dummy = new THREE.Object3D();

export function makeWheel(scene, { plainMat, glowMat }) {
  const W = WHEEL;
  const root = new THREE.Group();                 // pivot on the ground under the hub
  root.position.set(W.x, 0, W.z);
  scene.add(root);
  const wheel = new THREE.Group();                // the turning part, centred on the hub
  const body = new THREE.Group();                 // everything that folds (wheel + legs), squashed together
  root.add(body);
  wheel.position.set(0, W.y, 0);
  body.add(wheel);

  const steel = plainMat(0xd9dde2, 0.35, { metalness: 0.6 });
  const rimGeo = mergeGeometries([
    new THREE.TorusGeometry(W.r, 0.7, 6, 160).translate(0, 0, 3.2),
    new THREE.TorusGeometry(W.r, 0.7, 6, 160).translate(0, 0, -3.2),
    new THREE.TorusGeometry(W.r - 3, 0.35, 5, 160),
  ]);
  const rim = new THREE.Mesh(rimGeo, steel); rim.castShadow = true;
  wheel.add(rim);
  // cross-bracing between the two rims and the spokes
  const nSp = 64;
  const spokeGeo = new THREE.BoxGeometry(0.12, 1, 0.12).translate(0, 0.5, 0);
  const spokes = new THREE.InstancedMesh(spokeGeo, steel, nSp * 2);
  for (let i = 0; i < nSp; i++) {
    const a = (i / nSp) * Math.PI * 2;
    for (const [k, zz] of [[0, 3.2], [1, -3.2]]) {
      dummy.position.set(0, 0, zz * 0.15);
      dummy.rotation.set(Math.atan2(-zz * 0.85, W.r) * 0, 0, a);
      dummy.scale.set(1, W.r, 1);
      dummy.updateMatrix();
      spokes.setMatrixAt(i * 2 + k, dummy.matrix);
    }
  }
  wheel.add(spokes);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 9, 20).rotateX(Math.PI / 2), steel);
  wheel.add(hub);
  // LED strips on both rims (colour chase) and pods' interior lights
  const ledU = { uTime: { value: 0 }, uOn: { value: 1 } };
  const ledMat = new THREE.ShaderMaterial({
    uniforms: ledU,
    vertexShader: /* glsl */ `varying vec3 vP;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `varying vec3 vP; uniform float uTime; uniform float uOn;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        float a = atan(vP.y, vP.x);
        float chase = 0.5 + 0.5 * sin(a * 12.0 - uTime * 2.2);
        vec3 c = mix(vec3(1.0, 0.25, 0.75), vec3(0.4, 0.5, 1.0), chase);
        gl_FragColor = vec4(c * (2.2 + 1.6 * chase) * uOn, 1.0);
      }`,
  });
  const leds = new THREE.Mesh(mergeGeometries([
    new THREE.TorusGeometry(W.r + 0.75, 0.22, 4, 240).translate(0, 0, 3.2),
    new THREE.TorusGeometry(W.r + 0.75, 0.22, 4, 240).translate(0, 0, -3.2),
  ]), ledMat);
  wheel.add(leds);
  // the pods: glass capsules outside the rim, kept level as the wheel turns
  const podGeo = new THREE.SphereGeometry(1, 14, 10).scale(4.2, 2.3, 2.6);
  const pods = new THREE.InstancedMesh(podGeo, plainMat(0x8fa6b8, 0.15, { metalness: 0.3 }), W.pods);
  pods.castShadow = true;
  const podGlow = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8).scale(3.7, 1.6, 2.2), glowMat(new THREE.Color(1.6, 1.2, 0.8)), W.pods);
  wheel.add(pods, podGlow);
  // the A-frame: two legs each side from the ground to the hub, and a back stay
  const legMat = plainMat(0xc9ced4, 0.4, { metalness: 0.55 });
  const legs = new THREE.Group();
  body.add(legs);
  const leg = (x0, z0) => {
    const top = new THREE.Vector3(0, W.y, 0), bot = new THREE.Vector3(x0, 0, z0);
    const len = top.distanceTo(bot);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, len, 10).translate(0, len / 2, 0), legMat);
    m.position.copy(bot);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bot).normalize());
    m.castShadow = true;
    legs.add(m);
  };
  leg(-22, 9); leg(22, 9); leg(-22, -9); leg(22, -9);
  // base platform and the boarding pier
  const pier = new THREE.Mesh(new THREE.BoxGeometry(60, 1.6, 26).translate(0, 0.8, 0), plainMat(0x7c776f, 0.8));
  root.add(pier);

  let lastV = -1e9;
  return {
    root,
    frame(v, s) {
      // 0 standing .. 1 folded flat
      const k0 = smooth(W.v0 - 0.6, W.v0 + 0.1, v);           // groaning: the frame sags, the rim goes oval
      const k = clamp((v - W.v0) / (W.v1 - W.v0));
      const kf = k * k;                                     // accelerating fall
      const sag = 0.035 * k0;
      body.scale.set(1 + 0.25 * kf + sag * 0.5, Math.max(0.06, 1 - sag - 0.86 * kf), 1);
      root.rotation.set(0.95 * kf, 0, -0.08 * kf);
      // the wheel stops turning when the frame starts to give
      const turn = (Math.min(v, W.v0) + 30) * 0.012;
      wheel.rotation.z = turn;
      for (let i = 0; i < W.pods; i++) {
        const a = (i / W.pods) * Math.PI * 2;
        const r = W.r + 3.2;
        // pods hang level; as the wheel folds they swing and spill outward
        dummy.position.set(Math.cos(a) * r, Math.sin(a) * r - 1.8, 0);
        const loose = kf * (0.5 + 0.5 * Math.sin(i * 7.3));
        dummy.rotation.set(loose * 0.8, loose * 0.5, -turn + loose * 1.6);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        pods.setMatrixAt(i, dummy.matrix);
        podGlow.setMatrixAt(i, dummy.matrix);
      }
      pods.instanceMatrix.needsUpdate = true; podGlow.instanceMatrix.needsUpdate = true;
      // the lights stutter as it buckles and die when it hits
      const flick = v > W.v0 - 0.3 ? (Math.sin(v * 61) * Math.sin(v * 23) > -0.2 ? 1 : 0.15) : 1;
      const on = (1 - smooth(W.v1 - 0.25, W.v1, v)) * flick;
      ledU.uTime.value = v; ledU.uOn.value = on;
      leds.visible = on > 0.01;
      podGlow.visible = on > 0.01;
      podGlow.material.color.setRGB(1.6 * on, 1.2 * on, 0.8 * on);
      lastV = v;
    },
    // where the rim hits the ground/river (for dust and spray)
    impact: () => ({ x: W.x, z: W.z + 70, v: W.v1 }),
  };
}

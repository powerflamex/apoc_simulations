// Two short cutaways inside, in the first hours after:
//   a hospital ward: patients in their beds, monitors beeping; the women's beds empty (sheets, a pillow, a monitor
//   alarming at nothing); the nurses' station deserted, a clipboard and papers on the floor; one male doctor alone.
//   a primary school classroom: no teacher, a half-written board, chalk on the floor; half the desks empty, the
//   girls' red school bags still on their chairs; the boys sitting frozen, one standing up, looking round.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCrowd } from './crowd.js';
import { rng } from './util.js';

const std = (color, rough = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
const glow = (color) => new THREE.MeshBasicMaterial({ color });
function box(scene, mat, w, h, d, x, y, z, ry = 0, rx = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  scene.add(m);
  return m;
}
function room(scene, W, D, H, floorC, wallC, ceilC) {
  box(scene, std(floorC, 0.6), W, 0.1, D, 0, -0.05, -D / 2);
  box(scene, std(ceilC, 0.9), W, 0.1, D, 0, H + 0.05, -D / 2);
  box(scene, std(wallC, 0.9), 0.1, H, D, -W / 2, H / 2, -D / 2);
  box(scene, std(wallC, 0.9), 0.1, H, D, W / 2, H / 2, -D / 2);
  box(scene, std(wallC, 0.9), W, H, 0.1, 0, H / 2, -D);
  box(scene, std(wallC, 0.9), W, H, 0.1, 0, H / 2, 0.6);
}
function windows(scene, x, z0, z1, H, n, side) {
  const sky = glow(new THREE.Color(1.6, 1.75, 2.0));
  for (let k = 0; k < n; k++) {
    const z = z0 + (k + 0.5) * (z1 - z0) / n;
    box(scene, sky, 0.04, H * 0.5, (z1 - z0) / n * 0.75, x + side * 0.03, H * 0.55, z);
  }
}

export function makeInteriors() {
  const I = {};
  const R = rng(5150);

  // ================= the hospital ward =================
  {
    const sc = new THREE.Scene();
    sc.background = new THREE.Color(0x10141a);
    const W = 8, D = 19, H = 3.0;
    room(sc, W, D, H, 0xb8c2bc, 0xdfe6e2, 0xf2f2ee);
    windows(sc, -W / 2, -1, -15, H, 4, 1);
    // ceiling light panels
    const panel = glow(new THREE.Color(2.2, 2.2, 2.1));
    for (let z = -2; z > -18; z -= 3.4) box(sc, panel, 1.2, 0.02, 0.6, 0, H - 0.02, z);
    sc.add(new THREE.HemisphereLight(0xf4f6ff, 0x7a807a, 1.1));
    const dl = new THREE.DirectionalLight(0xdfeaff, 1.2); dl.position.set(-6, 3, -6); sc.add(dl, dl.target); dl.target.position.set(2, 0, -8);
    // beds along both walls, head to the wall
    const white = std(0xf4f4f2, 0.7), frameM = std(0x9aa3aa, 0.4, { metalness: 0.5 }), blanket = std(0x9cc3d6, 0.9), blanketE = std(0xb6d3e0, 0.9);
    const BEDS = [];
    const EMPTY = [[1, 0, 0, 1], [0, 1, 0, 1]];   // (left row, right row: the women's beds are empty)
    for (const sd of [-1, 1]) for (let k = 0; k < 4; k++) BEDS.push({ sd, z: -2.4 - k * 3.7, empty: !!EMPTY[sd > 0 ? 1 : 0][k] });
    const monitors = [];
    for (const b of BEDS) {
      const xh = b.sd * (W / 2 - 0.15), xc = b.sd * (W / 2 - 1.2);
      box(sc, frameM, 2.1, 0.08, 1.0, xc, 0.45, b.z);
      box(sc, white, 2.0, 0.16, 0.92, xc, 0.57, b.z);                                   // mattress
      box(sc, frameM, 0.06, 0.55, 1.0, xh - b.sd * 0.05, 0.75, b.z);                       // headboard
      box(sc, white, 0.42, 0.1, 0.62, b.sd * (W / 2 - 0.5), 0.7, b.z, 0, 0, b.empty ? 0.05 : 0);   // pillow
      if (b.empty) box(sc, blanketE, 1.5, 0.05, 0.94, b.sd * (W / 2 - 1.5), 0.67, b.z, 0.06);       // a sheet, left flat
      else box(sc, blanket, 1.05, 0.14, 0.96, b.sd * (W / 2 - 2.05), 0.86, b.z);   // (over the legs)
      // a monitor on a pole beside the bed, an IV stand
      box(sc, frameM, 0.05, 1.5, 0.05, b.sd * (W / 2 - 0.35), 0.75, b.z - 0.75);
      monitors.push({ x: b.sd * (W / 2 - 0.36), y: 1.55, z: b.z - 0.75, ry: -b.sd * Math.PI / 2 + b.sd * 0.5, alarm: b.empty ? 1 : 0, seed: R() });
      box(sc, frameM, 0.03, 1.9, 0.03, b.sd * (W / 2 - 0.4), 0.95, b.z + 0.7);
      box(sc, std(0xeaf4f8, 0.3, { transparent: true, opacity: 0.8 }), 0.14, 0.22, 0.06, b.sd * (W / 2 - 0.4), 1.75, b.z + 0.7);
      // visitors' chairs, and a handbag left on one
      box(sc, std(0x6f8a96, 0.8), 0.5, 0.45, 0.5, b.sd * (W / 2 - 1.5), 0.23, b.z + 0.95);
      if (b.empty && b.z < -9) box(sc, std(0xa33a2a, 0.6), 0.3, 0.24, 0.12, b.sd * (W / 2 - 1.5), 0.58, b.z + 0.95, 0.4);
    }
    // the monitors' screens: a green heart trace where someone is still there, a red alarm where nobody is
    const monU = { uTime: { value: 0 } };
    const monGeo = new THREE.PlaneGeometry(0.42, 0.3);
    monGeo.setAttribute('aA', new THREE.InstancedBufferAttribute(Float32Array.from(monitors, (m) => m.alarm), 1));
    monGeo.setAttribute('aS', new THREE.InstancedBufferAttribute(Float32Array.from(monitors, (m) => m.seed), 1));
    const monMat = new THREE.ShaderMaterial({
      uniforms: monU,
      vertexShader: `attribute float aA; attribute float aS; varying vec2 vUv; varying float vA; varying float vS;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main(){ vUv = uv; vA = aA; vS = aS; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `uniform float uTime; varying vec2 vUv; varying float vA; varying float vS;
        #include <common>
        #include <logdepthbuf_pars_fragment>
        void main(){
          #include <logdepthbuf_fragment>
          vec3 c = vec3(0.02, 0.03, 0.04);
          float x = fract(vUv.x - uTime * 0.6 + vS);
          float beat = fract(x * 1.25);
          float trace = vA > 0.5 ? 0.5 : 0.5 + 0.35 * exp(-pow((beat - 0.5) / 0.02, 2.0)) - 0.12 * exp(-pow((beat - 0.56) / 0.02, 2.0));
          float line = exp(-pow((vUv.y - trace) / 0.025, 2.0));
          if (vA > 0.5) { float bl = step(0.5, fract(uTime * 2.0 + vS)); c = mix(c, vec3(2.4, 0.15, 0.1), (0.35 + 0.65 * bl) * step(0.6, vUv.y)); c += vec3(0.9, 0.9, 0.9) * line * 0.6; }
          else c += vec3(0.2, 2.2, 0.6) * line;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const mon = new THREE.InstancedMesh(monGeo, monMat, monitors.length);
    const d = new THREE.Object3D();
    monitors.forEach((m, i) => { d.position.set(m.x, m.y, m.z); d.rotation.set(0, m.ry, 0); d.scale.setScalar(1); d.updateMatrix(); mon.setMatrixAt(i, d.matrix); });
    sc.add(mon);
    // the nurses' station at the far end: nobody there; a chair rolled away, the clipboard and papers on the floor
    box(sc, std(0xd8cfc0, 0.6), 3.4, 1.05, 0.8, 1.6, 0.52, -17.2);
    box(sc, std(0x22262a, 0.4), 0.55, 0.36, 0.05, 1.0, 1.32, -17.35);
    box(sc, glow(new THREE.Color(0.6, 0.9, 1.3)), 0.5, 0.31, 0.01, 1.0, 1.32, -17.32);
    box(sc, std(0x2f3b4a, 0.7), 0.5, 0.5, 0.5, 2.6, 0.3, -15.7, 0.7);
    box(sc, std(0x7a6040, 0.6), 0.24, 0.02, 0.32, 0.4, 0.01, -15.9, 0.5);
    const paper = std(0xf8f8f4, 0.9);
    for (let k = 0; k < 9; k++) box(sc, paper, 0.21, 0.004, 0.29, -0.6 + R() * 2.6, 0.006 + k * 0.001, -16.4 + R() * 1.6, R() * 3);
    // the people: the men in their beds, one sitting up; a male doctor alone in the aisle
    const crowd = makeCrowd(sc, 8, std(0xffffff, 0.8), { castShadow: false });
    const pts = [];
    BEDS.forEach((b) => { if (!b.empty) pts.push({ lie: true, b }); });
    const gown = 0x9fc1d0, skin = [0xf1c8a6, 0xe0ac86, 0xdba882, 0xf6d5bd];
    pts.forEach((p, i) => crowd.color(i, gown, gown, skin[i % 4], [0x2e2018, 0x8c8c8c, 0x1d1612, 0xd0d0d0][i % 4], false));
    const DOC = pts.length;
    crowd.color(DOC, 0xf4f4f4, 0x2b3a4a, 0xe8b996, 0x1d1612, true);
    I.ward = { scene: sc, cam: new THREE.PerspectiveCamera(56, 1080 / 1920, 0.05, 200), frame(v) {
      monU.uTime.value = v;
      pts.forEach((p, i) => {
        const b = p.b, sitUp = i === 1;
        crowd.pose(i, { x: b.sd * (W / 2 - 2.25), y: 0.8, z: b.z, yaw: -b.sd * Math.PI / 2, pitch: sitUp ? -0.55 : -Math.PI / 2, s: 1, look: sitUp ? 0.1 : 0, armR: sitUp ? 0.4 : 0 });
      });
      // the doctor: standing in the aisle, turning to look down the ward, then at his phone
      crowd.pose(DOC, { x: 0.5, y: 0, z: -9.6, yaw: Math.PI * 0.85 + Math.sin(v * 0.7) * 0.5, s: 1.02, armR: 0.95, look: 0.05 });
      crowd.commit();
    } };
    I.ward.cam.rotation.order = 'YXZ';
  }

  // ================= the classroom =================
  {
    const sc = new THREE.Scene();
    sc.background = new THREE.Color(0x10141a);
    const W = 9.5, D = 9.5, H = 3.1;
    room(sc, W, D, H, 0x9a7a55, 0xece6d6, 0xf4f2ea);
    windows(sc, -W / 2, -0.8, -8.8, H, 4, 1);
    sc.add(new THREE.HemisphereLight(0xfff8ec, 0x8a7a66, 1.35));
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.8); sun.position.set(-8, 6, -3); sc.add(sun, sun.target); sun.target.position.set(1, 0, -5);
    const panel = glow(new THREE.Color(1.8, 1.8, 1.7));
    for (const x of [-2, 2]) for (const z of [-2.5, -6]) box(sc, panel, 1.2, 0.02, 0.3, x, H - 0.02, z);
    // the blackboard, half written (the teacher stopped mid-line), chalk and the eraser on the floor
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 280;
    const g = cv.getContext('2d');
    g.fillStyle = '#1f3a2c'; g.fillRect(0, 0, 1024, 280);
    g.fillStyle = 'rgba(240,240,230,0.9)'; g.font = '600 64px "Yu Gothic", "Meiryo", sans-serif';
    g.fillText('10月12日 (月)', 40, 80); g.fillText('12 + 7 = 19', 40, 170); g.fillText('25 − 8 =', 520, 170);
    g.font = '600 52px "Yu Gothic", "Meiryo", sans-serif'; g.fillText('きょうの めあて: た', 40, 250);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.55), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(cv), roughness: 0.9 }));
    board.material.map.colorSpace = THREE.SRGBColorSpace;
    board.position.set(0.3, 1.75, -D + 0.07); sc.add(board);
    box(sc, std(0x6b4a2a, 0.7), 5.8, 0.06, 0.12, 0.3, 0.95, -D + 0.1);
    box(sc, std(0xf4f4ee, 0.6), 0.08, 0.012, 0.012, 1.4, 0.006, -D + 0.6, 0.6);
    box(sc, std(0x3a3a50, 0.8), 0.13, 0.04, 0.05, 1.1, 0.02, -D + 0.75, 0.2);
    box(sc, std(0x8b6a48, 0.7), 1.6, 0.75, 0.75, -3.3, 0.38, -D + 1.4);   // the teacher's desk
    box(sc, std(0x4a4a4a, 0.8), 0.48, 0.48, 0.48, -3.0, 0.25, -D + 2.3, 0.4);   // her chair, pushed back
    // desks and chairs: 5 across, 6 deep
    const deskTop = std(0xc8a878, 0.6), deskLeg = std(0x8a9096, 0.4, { metalness: 0.4 }), chairM = std(0xb08a60, 0.7);
    const bagRed = std(0xb0201e, 0.45), bagBlack = std(0x1a1a1a, 0.45);
    const seats = [];
    for (let r = 0; r < 6; r++) for (let c = 0; c < 5; c++) {
      const x = -3.0 + c * 1.45, z = -D + 3.0 + r * 1.05;
      box(sc, deskTop, 0.62, 0.04, 0.45, x, 0.64, z);
      box(sc, deskLeg, 0.56, 0.6, 0.04, x, 0.32, z - 0.18);
      box(sc, chairM, 0.38, 0.03, 0.36, x, 0.38, z + 0.38);
      box(sc, chairM, 0.38, 0.36, 0.03, x, 0.56, z + 0.56);
      box(sc, deskLeg, 0.03, 0.38, 0.03, x, 0.19, z + 0.38);
      const girl = R() < 0.5;
      seats.push({ x, z: z + 0.38, girl });
      // a randoseru on the chair or hanging off the desk: red for the girls (who are gone), black for the boys
      if (girl) box(sc, bagRed, 0.3, 0.32, 0.18, x, 0.56, z + 0.42, 0, -0.15);
      else box(sc, bagBlack, 0.26, 0.3, 0.16, x + 0.36, 0.42, z, Math.PI / 2);
    }
    const boys = seats.filter((s) => !s.girl);
    const crowd = makeCrowd(sc, boys.length, std(0xffffff, 0.8), { castShadow: false });
    boys.forEach((b, i) => crowd.color(i, 0xf2f2f0, 0x1e2a44, [0xf1c8a6, 0xe8b996, 0xf6d5bd][i % 3], 0x1d1612, i % 3 === 0));
    I.classroom = { scene: sc, cam: new THREE.PerspectiveCamera(56, 1080 / 1920, 0.05, 200), frame(v) {
      boys.forEach((b, i) => {
        const up = i === 2;   // one boy has stood up
        crowd.pose(i, { x: b.x, y: up ? 0 : 0.2, z: b.z - (up ? 0.3 : 0), yaw: Math.PI + (i % 2 ? 0.6 : -0.5) * Math.sin(v * 0.6 + i) + (i === 4 ? 2.6 : 0), s: 0.66, sit: up ? 0 : 1, look: 0.1 });
      });
      crowd.commit();
    } };
    I.classroom.cam.rotation.order = 'YXZ';
  }
  return I;
}

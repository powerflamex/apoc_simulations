// The pigeon in close-up: one bird in flight over the plaza, built with feathers (ten primaries and the secondaries
// on each wing, a fanned tail, an iridescent neck, an orange eye) so it holds up a metre from the camera. Its wings
// beat ~6.5 times a second in world time: at 20x one beat takes three seconds, every feather visible.
import * as THREE from 'three';

export function makeHeroPigeon(scene) {
  const g = new THREE.Group();
  const grey = new THREE.MeshStandardMaterial({ color: 0x8c93a0, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x4a505c, roughness: 0.7 });
  const light = new THREE.MeshStandardMaterial({ color: 0xb8bec8, roughness: 0.7 });
  const neck = new THREE.MeshStandardMaterial({ color: 0x3d6b5a, roughness: 0.25, metalness: 0.6, emissive: new THREE.Color(0.05, 0.12, 0.1) });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16).scale(0.9, 0.85, 1.6), grey);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 14).scale(1, 0.8, 0.9), neck); chest.position.set(0, 0.05, -0.15);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.052, 20, 14), grey); head.position.set(0, 0.08, -0.2);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.04, 8).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a3030 })); beak.position.set(0, 0.075, -0.255);
  const eyeM = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.2 });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), eyeM); e.position.set(s * 0.035, 0.09, -0.22); g.add(e); const p = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6), dark); p.position.set(s * 0.042, 0.09, -0.225); g.add(p); }
  g.add(body, chest, head, beak);
  // tail: a fan of feathers
  for (let k = 0; k < 9; k++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.004, 0.13).translate(0, 0, 0.065), k % 3 === 0 ? dark : grey);
    f.position.set(0, 0, 0.15); f.rotation.y = (k - 4) * 0.09; f.rotation.x = 0.1;
    g.add(f);
  }
  // wings: a smooth inner wing (arm) and outer wing (hand), each a flat shape with a feathered trailing edge, drawn
  // with a feather texture (pale grey, two dark bars, dark tips)
  const featherTex = (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const x = c.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#c4cad4'); gr.addColorStop(1, '#9aa1ad');
    x.fillStyle = gr; x.fillRect(0, 0, 512, 256);
    x.strokeStyle = 'rgba(60,66,78,0.55)'; x.lineWidth = 3;
    for (let i = 0; i < 26; i++) { x.beginPath(); x.moveTo(i * 20, 60); x.lineTo(i * 20 + 10, 256); x.stroke(); }
    x.fillStyle = 'rgba(55,60,72,0.85)'; x.fillRect(0, 110, 300, 18); x.fillRect(0, 150, 300, 16);
    const tip = x.createLinearGradient(330, 0, 512, 0); tip.addColorStop(0, 'rgba(50,54,64,0)'); tip.addColorStop(1, 'rgba(50,54,64,0.95)');
    x.fillStyle = tip; x.fillRect(330, 0, 182, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const wingMat = new THREE.MeshStandardMaterial({ map: featherTex, roughness: 0.75, side: THREE.DoubleSide });
  // the outline in the wing's own plane: x out along the span, z back toward the tail (UVs from x, z)
  const shapeGeo = (pts, span) => {
    const sh = new THREE.Shape(pts.map(([px, pz]) => new THREE.Vector2(px, pz)));
    const geo = new THREE.ShapeGeometry(sh, 12);
    geo.rotateX(Math.PI / 2);   // shape's y -> world z
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / span, 1 - p.getZ(i) / 0.22);
    return geo;
  };
  // (inner: from the body out 0.17 m; trailing edge scalloped by the secondaries)
  const inner = [[0, -0.03], [0.17, -0.035]];
  for (let k = 8; k >= 0; k--) { const xx = k / 8 * 0.17; inner.push([xx, 0.13 + 0.012 * Math.sin(k * 3.1) + (k % 2 ? 0.01 : 0)]); }
  const outer = [[0, -0.03], [0.1, -0.025], [0.2, 0.0], [0.26, 0.05]];
  for (let k = 0; k < 10; k++) { const xx = 0.26 - k * 0.026; outer.push([xx, 0.07 + k * 0.012 + (k % 2 ? 0.0 : 0.015)]); }
  outer.push([0, 0.13]);
  const wings = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(s * 0.07, 0.04, -0.04); g.add(arm);
    const hand = new THREE.Group(); hand.position.set(s * 0.17, 0, 0); arm.add(hand);
    const ig = shapeGeo(inner, 0.45), og = shapeGeo(outer, 0.45);
    if (s < 0) { ig.scale(-1, 1, 1); og.scale(-1, 1, 1); }
    const im = new THREE.Mesh(ig, wingMat), om = new THREE.Mesh(og, wingMat);
    arm.add(im); hand.add(om);
    wings.push({ s, arm, hand, prim: [] });
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(1.15);
  g.visible = false;
  scene.add(g);
  return {
    group: g,
    // on: show it; w: world time (the wingbeat); pos/yaw: where it flies
    frame(on, w, pos, yaw) {
      g.visible = on;
      if (!on) return;
      g.position.copy(pos);
      g.rotation.set(0.15 + 0.05 * Math.sin(w * 6.5 * Math.PI * 2), yaw, 0);
      const ph = w * 6.5 * Math.PI * 2;
      const beat = Math.sin(ph);                    // +1 wings up, -1 down
      for (const W of wings) {
        W.arm.rotation.set(0, 0, W.s * (0.15 + 0.85 * beat));
        W.hand.rotation.set(0, -W.s * 0.25 * Math.cos(ph), W.s * (0.25 + 0.5 * beat));
        // feathers spread on the downstroke, fold a little on the way up
      }
    },
  };
}

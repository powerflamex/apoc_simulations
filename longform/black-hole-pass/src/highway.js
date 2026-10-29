// placeholder (being built)
import * as THREE from 'three';
export function makeHighway() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x202030);
  const camera = new THREE.PerspectiveCamera(55, 1920 / 1080, 0.1, 1000);
  return { scene, camera, frame() {} };
}

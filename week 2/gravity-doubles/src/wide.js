// ?wide=1: the 16:9 version for the long video. The picture is a 1920x1080 window cut out of a virtual 1920x1920
// frame with the Short's vertical field of view, so everything keeps its size in pixels and the Short's 1080-wide
// frame is the middle of it. wideBand.y picks which rows of the tall 1920 frame are shown (420 = the middle band).
import * as THREE from 'three';
export const WIDE = new URLSearchParams(location.search).has('wide');
export const wideBand = { y: 420 };
if (WIDE) {
  const P = THREE.PerspectiveCamera.prototype, update = P.updateProjectionMatrix;
  P.updateProjectionMatrix = function () {
    if (this.userData.wide || this.aspect < 0.99) {   // only the portrait scene cameras (shadow cameras are square)
      this.userData.wide = true;
      this.aspect = 1;
      this.view = { enabled: true, fullWidth: 1920, fullHeight: 1920, offsetX: 0, offsetY: wideBand.y, width: 1920, height: 1080 };
    }
    return update.call(this);
  };
}

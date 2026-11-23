"""Measure the camera motion of the reference kodoae2 edit (same song cut, same timing as ours) and write it as
curves the edit's camera follows: src/kodo_curves.js.

    python -P prep/kodo_curves.py <reference video .mp4> src/kodo_curves.js

Per frame (30 fps) it finds how the whole picture zoomed, turned and slid since the frame before (ORB features +
RANSAC similarity), then adds those up. The reference cuts on the beat at 5.59 s and plays its second half mirrored;
the two halves are put on one common scale here. One-frame beat jolts are taken out (the edit makes its own).
"""
import sys, subprocess, json
import numpy as np
from skimage.feature import ORB, match_descriptors
from skimage.measure import ransac
from skimage.transform import SimilarityTransform

vid, out = sys.argv[1], sys.argv[2]
W = 288
w0, h0, rate = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height,r_frame_rate',
                               '-of', 'csv=p=0', vid], capture_output=True, text=True).stdout.strip().split(',')
num, den = map(int, rate.split('/')); fps = num / den
H = int(round(int(h0) * W / int(w0) / 2) * 2)
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', vid, '-vf', f'scale={W}:{H}', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], capture_output=True).stdout
frames = np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32) / 255
orb = ORB(n_keypoints=400, fast_threshold=0.04)
inc = np.zeros((len(frames), 4)); prev = None
for i, f in enumerate(frames):
    try:
        orb.detect_and_extract(f); cur = (orb.keypoints.copy(), orb.descriptors.copy())
    except Exception:
        cur = None
    if prev is not None and cur is not None and len(cur[0]) > 10 and len(prev[0]) > 10:
        m = match_descriptors(prev[1], cur[1], cross_check=True, max_ratio=0.85)
        if len(m) >= 8:
            c = np.array([W / 2, H / 2])
            src = prev[0][m[:, 0]][:, ::-1] - c; dst = cur[0][m[:, 1]][:, ::-1] - c
            model, inl = ransac((src, dst), SimilarityTransform, min_samples=3, residual_threshold=1.5, max_trials=300)
            if model is not None and inl.sum() >= 6:
                inc[i] = [np.log(model.scale) * 100, np.degrees(model.rotation), *(model.translation / W * 100)]
    prev = cur

def despike(v):
    w = v.copy()
    for i in range(1, len(v) - 1):
        if abs(v[i] - (v[i - 1] + v[i + 1]) / 2) > 0.9: w[i] = (v[i - 1] + v[i + 1]) / 2
    return w

inc[:, 2] = despike(inc[:, 2]); inc[:, 3] = despike(inc[:, 3])
t = np.arange(len(frames)) / fps
CUT = 0.058 + 8 * 0.6914                      # the mid cut, on beat 8
cut_i = int(np.ceil(CUT * fps))
# the last frames before the cut are blurred too much to track: they measure as "no motion", which froze the camera
# for 0.1 s at the fastest point of the zoom (felt like lag). Carry the last real motion on into the cut instead.
for i in range(cut_i - 6, cut_i):
    if abs(inc[i, 0]) < 0.3 * abs(inc[i - 1, 0]): inc[i] = inc[i - 1]
# (RANSAC is random: a rerun shifts the whole camera slightly. src/kodo_curves.js is the approved run; timeline.js
# also bridges the freeze when it reads it.)
cum = np.cumsum(inc, axis=0)
Z, R, X, Y = cum.T.copy()
# second half on the first half's scale: same widest zoom, its own level horizon
a, b = t < CUT, t >= CUT
Z[b] += Z[a & (t > 0.5)].min() - Z[b & (t > 6.0)].min()
LEVEL_A, LEVEL_B = 55.0, 48.0                 # roll of the frames that look level (1.8 s, 5.0 s / 7.3 s, 10.5 s)
R[a] -= LEVEL_A; R[b] -= LEVEL_B
for m in (a, b):                              # slides: keep the wander, drop the slow trend
    for V in (X, Y):
        k = np.polyfit(t[m], V[m], 1); V[m] -= np.polyval(k, t[m])
r1 = lambda v: [round(float(x), 1) for x in v]
js = ('// Measured from the reference kodoae2 edit by prep/kodo_curves.py (30 fps, same song timing as this edit).\n'
      '// z: zoom, log % (100 = 2.7x); r: roll, degrees from level; x, y: slide, % of frame width. The second half\n'
      f'// (from {CUT:.3f} s) is as seen in the mirrored picture.\n'
      f'export const KODO = {json.dumps({"fps": fps, "cut": round(CUT, 4), "z": r1(Z), "r": r1(R), "x": r1(X), "y": r1(Y)})};\n')
open(out, 'w').write(js)
print('frames', len(frames), 'fps', fps, 'cut frame', cut_i)
for i in range(0, len(t), 15): print(f'{t[i]:5.2f} z{Z[i]:7.1f} r{R[i]:6.1f} x{X[i]:6.1f} y{Y[i]:6.1f}')

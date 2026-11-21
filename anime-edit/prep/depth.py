# Step 1: depth maps for both images (Depth Anything V2 small, ONNX) + a look at the white areas of the character.
# usage: python -P depth.py <src_img dir> <model.onnx> <out dir>
import sys, os
import numpy as np
from PIL import Image
import onnxruntime as ort
from scipy import ndimage as ndi

src, model, out = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out, exist_ok=True)
sess = ort.InferenceSession(model, providers=['CPUExecutionProvider'])
iname = sess.get_inputs()[0].name


def depth(im, long_side):
    w, h = im.size
    s = long_side / max(w, h)
    W, H = max(14, round(w * s / 14) * 14), max(14, round(h * s / 14) * 14)
    x = np.asarray(im.convert('RGB').resize((W, H), Image.BICUBIC), np.float32) / 255
    x = (x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
    x = x.transpose(2, 0, 1)[None].astype(np.float32)
    d = sess.run(None, {iname: x})[0][0]
    d = np.asarray(Image.fromarray(d.astype(np.float32), 'F').resize((w, h), Image.BICUBIC))
    return d  # inverse depth, bigger = nearer


for name, ls in (('shrine', 1022), ('character', 770)):
    im = Image.open(os.path.join(src, name + '.webp')).convert('RGB')
    d = depth(im, ls)
    np.save(os.path.join(out, name + '_invdepth.npy'), d)
    v = (d - d.min()) / (d.max() - d.min())
    Image.fromarray((v * 255).astype(np.uint8)).save(os.path.join(out, name + '_depth_view.png'))
    print(name, im.size, 'invdepth range', float(d.min()), float(d.max()))

# character: where is the background? near-white pixels, split into pieces
im = np.asarray(Image.open(os.path.join(src, 'character.webp')).convert('RGB')).astype(np.int16)
white = im.min(2) >= 246
lab, n = ndi.label(white)
H, W = white.shape
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])).tolist()) - {0}
areas = ndi.sum(white, lab, range(1, n + 1))
vis = (im * 0.45).astype(np.uint8)
vis[np.isin(lab, list(border))] = (40, 40, 200)
rows = []
for i in np.argsort(-areas):
    L = int(i) + 1
    if L in border or areas[i] < 150:
        continue
    ys, xs = np.nonzero(lab == L)
    # how pure white is it? background is flat 255
    px = im[ys, xs]
    rows.append((L, int(areas[i]), int(xs.mean()), int(ys.mean()), int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()),
                 float(px.mean()), float(px.std())))
    vis[lab == L] = (255, 60, 60) if px.mean() > 253.5 and px.std() < 2.2 else (60, 220, 60)
Image.fromarray(vis).save(os.path.join(out, 'character_white_regions.png'))
np.save(os.path.join(out, 'character_white_labels.npy'), lab)
print('border bg pieces', len(border), 'enclosed pieces >=150px:')
for r in rows[:60]:
    print('label %d area %d centre (%d,%d) box (%d,%d)-(%d,%d) mean %.1f std %.2f' % r)

# Step 2: cut the character out, split the shrine picture into depth layers.
# usage: python -P layers.py <src_img dir> <work dir with *_invdepth.npy> <assets out dir>
import sys, os, json
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

src, work, out = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out, exist_ok=True)


def pull_push(img, mask, levels=9):
    """Fill the pixels where mask==0 from their surroundings (multi-scale average)."""
    img = img.astype(np.float32)
    m = mask.astype(np.float32)
    if img.ndim == 2:
        img = img[..., None]
    pyr = [(img * m[..., None], m)]
    for _ in range(levels):
        c, w = pyr[-1]
        h2, w2 = (c.shape[0] + 1) // 2, (c.shape[1] + 1) // 2
        cp = np.zeros((h2 * 2, w2 * 2, c.shape[2]), np.float32); cp[:c.shape[0], :c.shape[1]] = c
        wp = np.zeros((h2 * 2, w2 * 2), np.float32); wp[:w.shape[0], :w.shape[1]] = w
        c2 = cp.reshape(h2, 2, w2, 2, -1).sum((1, 3)); w2_ = wp.reshape(h2, 2, w2, 2).sum((1, 3))
        pyr.append((c2, w2_))
    # coarsest: plain average
    c, w = pyr[-1]
    fill = c / np.maximum(w[..., None], 1e-6)
    for c, w in reversed(pyr[:-1]):
        up = np.repeat(np.repeat(fill, 2, 0), 2, 1)[:c.shape[0], :c.shape[1]]
        up = ndi.uniform_filter(up, size=(3, 3, 1), mode='nearest')
        a = np.clip(w, 0, 1)[..., None]
        own = c / np.maximum(w[..., None], 1e-6)
        fill = own * a + up * (1 - a)
    return fill


# ---------------------------------------------------------------- character
im = np.asarray(Image.open(os.path.join(src, 'character.webp')).convert('RGB')).astype(np.float32)
H, W = im.shape[:2]
lab = np.load(os.path.join(work, 'character_white_labels.npy'))
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])).tolist()) - {0}
bg = np.isin(lab, list(border))
# enclosed see-through gaps, picked by eye from character_white_regions.png (label ids from depth.py):
# between hand and spear (379, 576), the gap in the ribbon (163), the hole in the grip (412), inside the ring (608, 639, 652, 599)
for L in (379, 576, 163, 412, 608, 639, 652, 599):
    bg |= lab == L
mn = im.min(2)
alpha = np.ones((H, W), np.float32)
alpha[bg] = 0
ring1 = ndi.binary_dilation(bg, structure=np.ones((3, 3), bool)) & ~bg
alpha[ring1] = np.clip((250 - mn[ring1]) / 95, 0, 1)
ring2 = ndi.binary_dilation(bg, structure=np.ones((5, 5), bool)) & ~bg & ~ring1
alpha[ring2] = np.maximum(alpha[ring2], np.clip((252 - mn[ring2]) / 40, 0, 1))
# take the white out of the half-see-through edge pixels
a3 = np.maximum(alpha, 0.08)[..., None]
col = np.clip((im - 255 * (1 - a3)) / a3, 0, 255)
col = np.where((alpha < 1)[..., None], col, im)
# bleed colour outward so filtering never pulls white in
solid = alpha > 0.5
idx = ndi.distance_transform_edt(~solid, return_distances=False, return_indices=True)
bled = col[idx[0], idx[1]]
col = np.where((alpha > 0.5)[..., None], col, bled)
rgba = np.dstack([col, alpha * 255]).astype(np.uint8)
big = Image.fromarray(rgba, 'RGBA').resize((W * 2, H * 2), Image.LANCZOS)
# a little sharpening on the colour only (line art holds up better in close-ups)
r, g, b, a = big.split()
rgb = Image.merge('RGB', (r, g, b)).filter(ImageFilter.UnsharpMask(radius=2.2, percent=70, threshold=2))
big = Image.merge('RGBA', (*rgb.split(), a))
big.save(os.path.join(out, 'char.png'))
# preview on a dark red card to judge the edge
card = Image.new('RGBA', big.size, (60, 8, 8, 255)); card.alpha_composite(big)
card.convert('RGB').resize((W, H), Image.LANCZOS).save(os.path.join(work, 'char_cutout_preview.jpg'), quality=92)

# relief (depth) for the character: body depth pushed out past the outline so the silhouette has no cliff
d = np.load(os.path.join(work, 'character_invdepth.npy')).astype(np.float32)
idx = ndi.distance_transform_edt(~solid, return_distances=False, return_indices=True)
df = d[idx[0], idx[1]]
df = ndi.gaussian_filter(df, 9.0)       # the relief only needs the big shapes; fine detail made thin parts wobble
lo, hi = np.percentile(df[solid], 2), np.percentile(df[solid], 99.5)
dn = np.clip((df - lo) / (hi - lo), 0, 1)
Image.fromarray((dn * 255).astype(np.uint8)).save(os.path.join(out, 'char_depth.png'))
print('character', (W, H), 'cut out; coverage', round(float(solid.mean()), 3))

# ---------------------------------------------------------------- shrine
img = np.asarray(Image.open(os.path.join(src, 'shrine.webp')).convert('RGB')).astype(np.float32)
inv = np.load(os.path.join(work, 'shrine_invdepth.npy')).astype(np.float32)
H, W = inv.shape
yy, xx = np.mgrid[0:H, 0:W]
# the water surface: inverse depth grows steadily with the row (measured: 0.01678 per row, zero at row 840)
SLOPE, HORIZON = 0.01678, 839.8
plane = SLOPE * (yy - HORIZON)

sky = inv < 0.42
lab, n = ndi.label(sky)
top = set(np.unique(lab[0]).tolist()) - {0}
# sky = far pixels joined to the top edge or to the side edges above the horizon (the far shore band counts as sky)
side = set(np.unique(np.concatenate([lab[:840, 0], lab[:840, -1]])).tolist()) - {0}
sky = np.isin(lab, list(top | side))
# small far pockets between rocks: join them to the sky as well, but never the mouth of the shrine
mouth = (xx > 300) & (xx < 520) & (yy > 640) & (yy < 880)
pockets = (inv < 0.42) & ~sky & ~mouth
sky |= pockets

# water: down the picture the surface comes steadily nearer; things standing in it keep one depth
gy = ndi.gaussian_filter(inv, 3, order=(1, 0))
steady = gy > 0.0085
near_plane = np.abs(inv - plane) < np.maximum(0.55, 0.16 * plane)
water = steady & near_plane & (yy > 930) & ~sky
water = ndi.binary_opening(water, structure=np.ones((5, 5), bool))
lab, n = ndi.label(water)
bottom = set(np.unique(lab[-60:-30]).tolist()) - {0}
water = np.isin(lab, list(bottom))
water = ndi.binary_fill_holes(water | (yy > H - 45)) & ~sky
water = ndi.binary_closing(water, structure=np.ones((7, 7), bool))

obj = ~sky & ~water
T_NEAR = 2.3                      # nearer than this (inverse depth) = the near rocks layer
near = obj & (inv > T_NEAR)
near = ndi.binary_opening(near, structure=np.ones((9, 9), bool))
far = obj & ~near & (yy < 985)
water = ~sky & ~near & ~far

# overlay to check by eye: sky blue, far objects green, near rocks red, water untouched
ov = img.copy() * 0.55
ov[sky] += np.array([0, 0, 110]); ov[far] += np.array([0, 90, 0]); ov[near] += np.array([120, 0, 0])
Image.fromarray(np.clip(ov, 0, 255).astype(np.uint8)).save(os.path.join(work, 'shrine_layers_overlay.jpg'), quality=90)

# true distances: the picture's camera sits CAM_H above the water, lens FOV degrees tall, horizon at row HORIZON
FOV = 40.0
tan2 = 2 * np.tan(np.radians(FOV / 2))
SHRINE_DIST, SHRINE_INV = 60.0, 1.69
K = SHRINE_DIST * SHRINE_INV              # distance = K / inverse depth
CAM_H = K * tan2 / (SLOPE * H)
print('camera height above water %.2f, K %.1f' % (CAM_H, K))

dist = K / np.maximum(inv, 1e-3)
dist_far = np.clip(dist, 50, 70)          # the mouth of the shrine is deep, but not a tunnel
dist_near = np.clip(dist, 14, 50)

# far layer: also painted in behind the near rocks (above the far waterline) so nothing opens up behind them
far_fill_area = far | (near & (yy < 975))
far_col = pull_push(img, far)
far_d = pull_push(dist_far, far)[..., 0]
far_d = np.where(far, dist_far, np.clip(far_d, 50, 70))
soft = lambda m, s=0.8: np.clip(ndi.gaussian_filter(m.astype(np.float32), s) * 1.6 - 0.3, 0, 1)
Image.fromarray(np.dstack([far_col, soft(far_fill_area) * 255]).astype(np.uint8), 'RGBA').save(os.path.join(out, 'shrine_far.png'))
near_col = pull_push(img, near)
near_d = pull_push(dist_near, near)[..., 0]
near_d = np.where(near, dist_near, np.clip(near_d, 14, 50))
Image.fromarray(np.dstack([near_col, soft(near) * 255]).astype(np.uint8), 'RGBA').save(os.path.join(out, 'shrine_near.png'))


def pack16(d, lo, hi):
    v = np.clip((d - lo) / (hi - lo), 0, 1) * 65535
    v = v.astype(np.uint32)
    return np.dstack([v >> 8, v & 255, np.zeros_like(v)]).astype(np.uint8)


DLO, DHI = 10.0, 90.0
Image.fromarray(pack16(ndi.gaussian_filter(far_d, 1.2), DLO, DHI), 'RGB').save(os.path.join(out, 'shrine_far_depth.png'))
Image.fromarray(pack16(ndi.gaussian_filter(near_d, 1.2), DLO, DHI), 'RGB').save(os.path.join(out, 'shrine_near_depth.png'))

# sky: everything that is not sky painted over with sky
sky_core = ndi.binary_erosion(sky, structure=np.ones((5, 5), bool))
sky_col = pull_push(img, sky_core & (yy < 845))
sky_col = np.where((sky_core & (yy < 845))[..., None], img, ndi.gaussian_filter(sky_col, (6, 6, 0)))
Image.fromarray(np.clip(sky_col, 0, 255).astype(np.uint8)).save(os.path.join(out, 'sky.jpg'), quality=93)

# water: the picture's own water, with the rocks painted over by water
water_core = ndi.binary_erosion(water, structure=np.ones((5, 5), bool))
# the lanterns' painted-on reflections go (they smear when the camera moves); the scene draws live glints instead
glare = ndi.binary_dilation((img[..., 0] > 105) & (img[..., 0] - img[..., 2] > 45) & water, structure=np.ones((9, 9), bool))
water_core &= ~glare
wat_col = pull_push(img, water_core)
wat_col = np.where(water_core[..., None], img, ndi.gaussian_filter(wat_col, (5, 5, 0)))
Image.fromarray(np.clip(wat_col, 0, 255).astype(np.uint8)).save(os.path.join(out, 'water.jpg'), quality=93)

json.dump({'W': W, 'H': H, 'horizonRow': HORIZON, 'fov': FOV, 'camH': float(CAM_H), 'K': float(K),
           'depthLo': DLO, 'depthHi': DHI, 'shrineDist': SHRINE_DIST},
          open(os.path.join(out, 'layout.json'), 'w'), indent=1)
print('shrine layers: sky %.2f far %.2f near %.2f water %.2f' % (sky.mean(), far.mean(), near.mean(), water.mean()))

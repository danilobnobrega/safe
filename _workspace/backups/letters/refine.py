import numpy as np, os, json
from PIL import Image
from scipy import ndimage as ndi
from seam_fn import seam
res = np.load('cuts.npy', allow_pickle=True).item()
names = ['G','E','N','E2','R','I','C','dot']
os.makedirs('glyphs2', exist_ok=True)
meta = {}
FEATHER = 5.0  # px of soft edge where a letter was cut from its neighbour
for f, (x0, x1, y0, y1, cuts) in res.items():
    key = os.path.basename(f)[:-4]
    if key == 'p5': cuts[2] = 600
    rgba = np.array(Image.open(f)).astype(np.float32)
    src = np.array(Image.open(f.replace('alpha', 'src').replace('.png', '.jpg')).convert('RGB')).astype(np.float32)
    a = rgba[..., 3] / 255
    H, W = a.shape
    # 1) background trapped inside the letters (counters, gaps between strokes): near-white,
    #    colourless regions that are big enough — not the foam photo, whose letters ARE white
    if key != 'p2':
        mx = src.max(2); mn = src.min(2)
        bgl = (mn > 238) & (mx - mn < 10)
        lab, n = ndi.label(bgl)
        if n:
            sizes = ndi.sum(bgl, lab, range(1, n + 1))
            big = np.isin(lab, np.where(sizes > 60)[0] + 1)
            big = ndi.binary_dilation(big, iterations=1)
            soft = ndi.gaussian_filter(big.astype(np.float32), 1.0)
            a = a * (1 - np.clip(soft * 1.4, 0, 1))
    paths = [np.full(H, -1)] + [seam(a, c) for c in cuts] + [np.full(H, W)]
    xx = np.arange(W)[None, :].astype(np.float32)
    meta[key] = []
    for g in range(8):
        L = paths[g][:, None].astype(np.float32); R = paths[g + 1][:, None].astype(np.float32)
        # 2) soft cut: fade over FEATHER px inside each seam instead of a hard vertical edge
        wl = np.clip((xx - L) / FEATHER, 0, 1) if g > 0 else np.ones_like(xx) * (xx >= 0)
        wr = np.clip((R - xx) / FEATHER, 0, 1) if g < 7 else np.ones_like(xx)
        ga = a * wl * wr
        # 3) keep the letter's body: drop loose bits (slivers of the neighbour)
        solid = ga > 0.5
        lab, n = ndi.label(solid)
        if n > 1:
            sizes = ndi.sum(solid, lab, range(1, n + 1))
            keep = np.isin(lab, np.where(sizes >= sizes.max() * 0.12)[0] + 1)
            keep = ndi.binary_dilation(keep, iterations=3)
            ga = ga * ndi.gaussian_filter(keep.astype(np.float32), 1.2).clip(0, 1)
        if key == 'p5':
            # cellophane: every letter is a single colour - anything saturated in another hue
            # is the neighbour showing through the cut
            hsv = np.array(Image.fromarray(src.astype(np.uint8)).convert('HSV')).astype(np.float32)
            hue, sat = hsv[..., 0], hsv[..., 1] / 255
            body = (ga > 0.8) & (sat > 0.35)
            h0 = np.angle(np.mean(np.exp(1j * hue[body] / 255 * 2 * np.pi))) / (2 * np.pi) * 255
            dh = np.abs(((hue - h0 + 128) % 256) - 128)
            foreign = (dh > 22) & (sat > 0.3)
            foreign = ndi.binary_opening(foreign, iterations=1)
            ga = ga * (1 - ndi.gaussian_filter(ndi.binary_dilation(foreign, iterations=2).astype(np.float32), 1.0).clip(0, 1))
        out = np.dstack([src, ga * 255]).clip(0, 255).astype(np.uint8)
        ys, xs = np.where(out[..., 3] > 6)
        bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        Image.fromarray(out[by0:by1, bx0:bx1]).save(f'glyphs2/{key}_{names[g]}.png', optimize=True)
        meta[key].append({'g': names[g], 'x': int(bx0), 'y': int(by0), 'w': int(bx1 - bx0), 'h': int(by1 - by0)})
    meta[key + '_word'] = {'x0': int(x0), 'x1': int(x1), 'y0': int(y0), 'y1': int(y1)}
json.dump(meta, open('glyphs2/meta.json', 'w'), indent=1)
print('ok', len(os.listdir('glyphs2')))

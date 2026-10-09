import numpy as np, glob, os, json
from PIL import Image
from scipy import ndimage as ndi
names = ['G','E','N','E2','R','I','C','dot']
# only the matte ones (wool, fur) trap background in their counters; on glossy ones (balloon,
# cellophane, ice cream) the near-white patches are highlights, and white foam/soap are white
MATTE = {'p0', 'p1', 'p3'}  # + ice cream: the R's counter
os.makedirs('glyphs', exist_ok=True)
meta = {}
for f in sorted(glob.glob('alpha/p*.png')):
    key = os.path.basename(f)[:-4]
    rgba = np.array(Image.open(f)).astype(np.float32)
    src = np.array(Image.open(f'src/{key}.jpg').convert('RGB')).astype(np.float32)
    a = rgba[..., 3] / 255
    # background trapped in counters: big near-white colourless regions (not on white letters)
    if key in MATTE:
        mn = src.min(2); mx = src.max(2)
        bgl = (mn > 238) & (mx - mn < 10)
        lab, n = ndi.label(bgl)
        if n:
            sizes = ndi.sum(bgl, lab, range(1, n + 1))
            big = ndi.binary_dilation(np.isin(lab, np.where(sizes > 60)[0] + 1), iterations=1)
            a = a * (1 - np.clip(ndi.gaussian_filter(big.astype(np.float32), 1.0) * 1.4, 0, 1))
    # islands: each letter is its own piece now; small bits (drips, stray bubbles) join the
    # island they sit closest to horizontally
    solid = a > 0.3
    lab, n = ndi.label(solid, structure=np.ones((3, 3)))
    sizes = ndi.sum(solid, lab, range(1, n + 1))
    big = [i + 1 for i in np.argsort(-sizes)[:8]]
    big.sort(key=lambda i: ndi.center_of_mass(solid, lab, i)[1])
    cxs = {i: ndi.center_of_mass(solid, lab, i)[1] for i in big}
    assign = np.zeros_like(lab)
    for i in range(1, n + 1):
        if sizes[i - 1] < 30: continue
        tgt = i if i in big else min(big, key=lambda b: abs(cxs[b] - ndi.center_of_mass(solid, lab, i)[1]))
        assign[lab == i] = tgt
    # soft alpha: each pixel goes to the nearest island (so fuzzy fringes stay with their letter)
    dist, (iy, ix) = ndi.distance_transform_edt(assign == 0, return_indices=True)
    owner = assign[iy, ix]
    meta[key] = []
    ys, xs = np.where(solid)
    meta[key + '_word'] = {'x0': int(xs.min()), 'x1': int(xs.max()), 'y0': int(ys.min()), 'y1': int(ys.max())}
    for g, isl in enumerate(big):
        ga = a * (owner == isl) * (dist < 25)
        out = np.dstack([src, ga * 255]).clip(0, 255).astype(np.uint8)
        yy, xx = np.where(out[..., 3] > 6)
        bx0, bx1, by0, by1 = xx.min(), xx.max() + 1, yy.min(), yy.max() + 1
        Image.fromarray(out[by0:by1, bx0:bx1]).save(f'glyphs/{key}_{names[g]}.png')
        meta[key].append({'g': names[g], 'x': int(bx0), 'y': int(by0), 'w': int(bx1 - bx0), 'h': int(by1 - by0)})
    print(key, 'islands', n, 'big sizes', sorted(sizes, reverse=True)[:9])
json.dump(meta, open('glyphs/meta.json', 'w'), indent=1)

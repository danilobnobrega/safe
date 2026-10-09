import numpy as np, glob, os, json
from PIL import Image, ImageDraw
res = np.load('cuts.npy', allow_pickle=True).item()
names = ['G','E','N','E2','R','I','C','dot']
override = {'alpha\p5.png': {2: 600}, 'alpha/p5.png': {2: 600}}
os.makedirs('glyphs', exist_ok=True); os.makedirs('dbg2', exist_ok=True)
meta = {}
def seam(a, c, half=40):
    # min-cost 8-connected vertical path through alpha, x kept within [c-half, c+half]
    H, W = a.shape
    lo, hi = max(c - half, 0), min(c + half, W - 1)
    cost = a[:, lo:hi + 1] + 0.002 * np.abs(np.arange(lo, hi + 1) - c)[None, :]  # prefer near c
    acc = cost.copy(); back = np.zeros_like(acc, dtype=int)
    for y in range(1, H):
        prev = acc[y - 1]
        l = np.r_[np.inf, prev[:-1]]; r = np.r_[prev[1:], np.inf]
        stack = np.vstack([l, prev, r]); k = np.argmin(stack, 0)
        acc[y] += stack[k, np.arange(stack.shape[1])]; back[y] = k - 1
    x = int(np.argmin(acc[-1])); path = np.zeros(H, int)
    for y in range(H - 1, -1, -1):
        path[y] = x + lo; x = x + back[y, x] if y > 0 else x
        x = min(max(x, 0), hi - lo)
    return path
for f, (x0, x1, y0, y1, cuts) in res.items():
    im = Image.open(f); rgba = np.array(im); a = rgba[..., 3].astype(float) / 255
    H, W = a.shape
    for i, c in override.get(f, {}).items(): cuts[i] = c
    paths = [np.full(H, 0)] + [seam(a, c) for c in cuts] + [np.full(H, W - 1)]
    key = os.path.basename(f)[:-4]; meta[key] = []
    xx = np.arange(W)[None, :]
    for g in range(8):
        left = paths[g][:, None]; right = paths[g + 1][:, None]
        m = (xx >= left) & (xx < right) if g < 7 else (xx >= left)
        m = m & (np.arange(H)[:, None] >= 0)
        out = rgba.copy(); out[..., 3] = (out[..., 3] * m).astype(np.uint8)
        al = out[..., 3]
        ys, xs = np.where(al > 8)
        bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        Image.fromarray(out[by0:by1, bx0:bx1]).save(f'glyphs/{key}_{names[g]}.png')
        meta[key].append({'g': names[g], 'x': int(bx0), 'y': int(by0), 'w': int(bx1 - bx0), 'h': int(by1 - by0)})
    dbg = Image.open(f.replace('alpha', 'src').replace('.png', '.jpg')).convert('RGB'); d = ImageDraw.Draw(dbg)
    for p in paths[1:-1]: d.line([(int(p[y]), y) for y in range(H)], fill=(255, 0, 0), width=2)
    dbg.save('dbg2/' + key + '.jpg')
    # word baseline/cap for alignment later
    meta[key + '_word'] = {'x0': int(x0), 'x1': int(x1), 'y0': int(y0), 'y1': int(y1)}
json.dump(meta, open('glyphs/meta.json', 'w'), indent=1)
print(len(os.listdir('glyphs')), 'files')

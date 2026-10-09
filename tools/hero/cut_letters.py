"""Cut the hero's letter photos into per-glyph images for LetterSwap (src/hero/LetterSwap.ts).

Each photo is "GENERIC." on a near-white backdrop. The letters are found by how far each pixel is
from the backdrop, split into the 8 glyphs by the empty columns between them, and saved as
p<i>_<glyph>.webp with the backdrop made transparent; meta.json gets each glyph's box and the
word's box in the photo's own px.

Run: python tools/hero/cut_letters.py <out_dir> <photo0> <photo1> ...
"""
import json
import sys

import numpy as np
from scipy import ndimage
from PIL import Image

GLYPHS = ['G', 'E', 'N', 'E2', 'R', 'I', 'C', 'dot']
out_dir, photos = sys.argv[1], sys.argv[2:]
meta = {}

for p, path in enumerate(photos):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.float32)
    # the backdrop: the median of the border
    border = np.concatenate([a[:20].reshape(-1, 3), a[-20:].reshape(-1, 3), a[:, :20].reshape(-1, 3), a[:, -20:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    d = np.abs(a - bg).max(axis=2)
    # soft alpha: the faint drop shadows on the backdrop stay out, the letters' edges stay soft
    alpha = np.clip((d - 28) / 40, 0, 1)
    solid = d > 48
    rows = np.where(solid.sum(axis=1) > 2)[0]
    y0, y1 = int(rows.min()), int(rows.max())
    # the glyphs: connected blobs of the letters (a little dilated so fuzzy edges hold together),
    # big ones only, then blobs that share most of their columns merged (an i-dot, a loose fibre)
    # (letters that touch — a C on its dot — come apart by eroding instead: try in turn)
    for grow in (2, 0, -2, -4, -6):
        mask = ndimage.binary_dilation(solid, iterations=grow) if grow > 0 else ndimage.binary_erosion(solid, iterations=-grow) if grow < 0 else solid
        lab, n = ndimage.label(mask)
        comps = []
        for i, sl in enumerate(ndimage.find_objects(lab), 1):
            area = int((lab[sl] == i).sum())
            if area > 400:
                comps.append([sl[1].start, sl[1].stop - 1])
        comps.sort()
        merged = []
        for c in comps:
            if merged:
                m = merged[-1]
                ov = min(m[1], c[1]) - max(m[0], c[0])
                if ov > 0.5 * min(m[1] - m[0], c[1] - c[0]):
                    m[0], m[1] = min(m[0], c[0]), max(m[1], c[1])
                    continue
            merged.append(c)
        if len(merged) == len(GLYPHS):
            break
    if len(merged) != len(GLYPHS):
        raise SystemExit(f'{path}: found {len(merged)} glyphs, expected {len(GLYPHS)}: {merged}')
    # each glyph keeps only its own blobs (the C's box can overlap the dot's)
    owner = np.zeros(n + 1, int) - 1
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        cx = (sl[1].start + sl[1].stop) / 2
        owner[i] = int(np.argmin([abs(cx - (m[0] + m[1]) / 2) if m[0] <= cx <= m[1] else 1e9 for m in merged]))
    boxes = []
    rgba = np.dstack([a, alpha * 255]).astype(np.uint8)
    for k, (g, (x0, x1)) in enumerate(zip(GLYPHS, merged)):
        mine = np.isin(lab, np.where(owner == k)[0]) & (lab > 0)
        mine = ndimage.binary_dilation(mine, iterations=max(0, -grow)) & solid if grow < 0 else mine
        ys = np.where((solid & mine)[:, x0:x1 + 1].sum(axis=1) > 0)[0]
        gy0, gy1 = int(ys.min()), int(ys.max())
        pad = 4
        X0, X1 = max(0, x0 - pad), min(a.shape[1] - 1, x1 + pad)
        Y0, Y1 = max(0, gy0 - pad), min(a.shape[0] - 1, gy1 + pad)
        crop = rgba[Y0:Y1 + 1, X0:X1 + 1].copy()
        keep = ndimage.binary_dilation(mine, iterations=3)[Y0:Y1 + 1, X0:X1 + 1]
        crop[..., 3] = (crop[..., 3] * keep).astype(np.uint8)
        Image.fromarray(crop).save(f'{out_dir}/p{p}_{g}.webp', quality=90)
        boxes.append({'g': g, 'x': X0, 'y': Y0, 'w': X1 - X0 + 1, 'h': Y1 - Y0 + 1})
    meta[f'p{p}'] = boxes
    meta[f'p{p}_word'] = {'x0': boxes[0]['x'], 'x1': boxes[-1]['x'] + boxes[-1]['w'], 'y0': y0, 'y1': y1}
    print(path, 'ok', [b['w'] for b in boxes])

json.dump(meta, open(f'{out_dir}/meta.json', 'w'), indent=1)

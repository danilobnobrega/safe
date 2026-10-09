import numpy as np, glob, os
from PIL import Image, ImageDraw
from scipy.ndimage import uniform_filter1d
names = ['G','E','N','E2','R','I','C','dot']
# rough relative centers of each glyph across the word (G E N E R I C .), refined per photo
res = {}
os.makedirs('dbg', exist_ok=True)
for f in sorted(glob.glob('alpha/p*.png')):
    im = Image.open(f); a = np.array(im)[..., 3].astype(float) / 255
    cols = a.sum(0)
    xs = np.where(cols > 2)[0]; x0, x1 = xs[0], xs[-1]
    ys = np.where(a.sum(1) > 2)[0]; y0, y1 = ys[0], ys[-1]
    prof = uniform_filter1d(cols, 5)
    W = x1 - x0
    # expected boundary fractions between glyphs (from the letter widths of this rounded font)
    exp = [0.155, 0.285, 0.43, 0.555, 0.69, 0.765, 0.905]
    cuts = []
    for e in exp:
        c = x0 + e * W
        lo, hi = int(c - 0.045 * W), int(c + 0.045 * W)
        seg = prof[lo:hi]
        cuts.append(lo + int(np.argmin(seg)))
    res[f] = (x0, x1, y0, y1, cuts)
    print(os.path.basename(f), 'word', x0, x1, y0, y1, 'cuts', cuts, 'depth', [round(prof[c], 1) for c in cuts])
    dbg = Image.open(f.replace('alpha', 'src').replace('.png', '.jpg')).convert('RGB')
    d = ImageDraw.Draw(dbg)
    for c in cuts: d.line([(c, 0), (c, dbg.height)], fill=(255, 0, 0), width=2)
    dbg.save('dbg/' + os.path.basename(f).replace('.png', '.jpg'))
np.save('cuts.npy', res, allow_pickle=True)

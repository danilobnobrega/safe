# A sheet of paper crumpled into a ball — a simulation written for paper (Blender's cloth gave soft
# fabric folds, never creases). For /hero-paper.html: the drag scrubs through the baked frames.
#
#   python tools/behind/crumple_pbd.py <out.bin> [preview.png]
#
# Position-based dynamics on a particle grid (A4 landscape, 297 x 210 mm):
#   - inextensible: structural + shear distance constraints, stiff (paper doesn't stretch)
#   - creases come by themselves: almost no bending resistance, so compression buckles the sheet
#     into ridges and flat facets instead of soft waves
#   - the hands: every particle is kept inside a sphere that closes from around the sheet down to a
#     ball, its centre drifting a little (hands aren't a perfect press)
#   - self-collision: particles that aren't grid neighbours keep a minimum distance (k-d tree), so
#     the sheet piles up into a ball instead of collapsing through itself
# Output (little-endian): uint32 nx, ny, keys; then keys x (nx*ny) x 3 int16 positions, quantised
# over float32 bounds (min xyz, scale) stored before them. Frame 0 is the flat sheet.
import sys, struct
import numpy as np
from scipy.spatial import cKDTree

OUT = sys.argv[1] if len(sys.argv) > 1 else 'crumple.bin'
PREVIEW = sys.argv[2] if len(sys.argv) > 2 else None
NX, NY = 61, 43
W, H = 0.297, 0.210
KEYS = 40
STEPS = 900
ITERS = 16
R_END = 0.034  # the ball's radius
SEED = 11

rng = np.random.default_rng(SEED)
xs = np.linspace(-W / 2, W / 2, NX)
ys = np.linspace(-H / 2, H / 2, NY)
gx, gy = np.meshgrid(xs, ys)  # [NY, NX]
P = np.stack([gx.ravel(), np.zeros(NX * NY), gy.ravel()], 1)  # sheet in the xz plane, y up
# an irregular mesh (each inner point nudged within its cell): on a regular grid the sheet buckles
# along the grid lines, in straight parallel ridges. (The page reads the print's uv off frame 0.)
_dx, _dy = W / (NX - 1), H / (NY - 1)
_jx = rng.uniform(-0.3, 0.3, (NY, NX)) * _dx
_jy = rng.uniform(-0.3, 0.3, (NY, NX)) * _dy
_jx[:, 0] = _jx[:, -1] = 0
_jy[0, :] = _jy[-1, :] = 0
P[:, 0] += _jx.ravel()
P[:, 2] += _jy.ravel()
P[:, 1] += rng.normal(0, 0.00005, len(P))  # a breath of unevenness — real paper never lies dead flat
V = np.zeros_like(P)
N = len(P)
idx = np.arange(N).reshape(NY, NX)
dx = W / (NX - 1)

# constraints: structural (h, v), shear (both diagonals)
pairs = []
pairs += list(zip(idx[:, :-1].ravel(), idx[:, 1:].ravel()))
pairs += list(zip(idx[:-1, :].ravel(), idx[1:, :].ravel()))
pairs += list(zip(idx[:-1, :-1].ravel(), idx[1:, 1:].ravel()))
pairs += list(zip(idx[:-1, 1:].ravel(), idx[1:, :-1].ravel()))
C = np.array(pairs)
REST = np.linalg.norm(P[C[:, 0]] - P[C[:, 1]], axis=1)
# neighbours within 2 grid steps are excluded from self-collision (they're held by the constraints)
gi = np.stack(np.unravel_index(np.arange(N), (NY, NX)), 1)

R_COLL = dx * 0.9  # minimum distance between non-neighbour particles

R0 = np.hypot(W, H) / 2 * 1.05
centre = np.zeros(3)
keys = [P.copy()]
key_at = set(np.linspace(0, STEPS - 1, KEYS - 1).round().astype(int))

for step in range(STEPS):
    t = step / (STEPS - 1)
    # the sphere closes: slowly at first (the first wrinkles), then the squeeze
    e = 1 - (1 - t) ** 2.2
    R = R0 + (R_END - R0) * e
    centre += rng.normal(0, 0.00035, 3)
    centre *= 0.98
    prev = P.copy()
    V *= 0.9
    # hands cup the sheet first: its edges lift (more the further from the middle), so it bowls and
    # buckles out of its plane instead of being squeezed flat in it
    if t < 0.55:
        rr = (P[:, 0] ** 2 + P[:, 2] ** 2) / (R0 * R0)
        V[:, 1] += 0.00006 * rr * (1 - t / 0.55)
    P = P + V * 1.0
    for it in range(ITERS):
        # distance constraints (Jacobi with relaxation)
        d = P[C[:, 1]] - P[C[:, 0]]
        L = np.linalg.norm(d, axis=1) + 1e-9
        corr = ((L - REST) / L)[:, None] * d * 0.5 * 0.8
        acc = np.zeros_like(P)
        cnt = np.zeros(N)
        np.add.at(acc, C[:, 0], corr)
        np.add.at(acc, C[:, 1], -corr)
        np.add.at(cnt, C[:, 0], 1)
        np.add.at(cnt, C[:, 1], 1)
        P += acc / np.maximum(cnt, 1)[:, None] * 1.6
        # the hands
        r = P - centre
        rl = np.linalg.norm(r, axis=1)
        out = rl > R
        P[out] = centre + r[out] / rl[out, None] * R
        # self-collision, every few iterations
        if it % 3 == 2:
            tree = cKDTree(P)
            pr = tree.query_pairs(R_COLL, output_type='ndarray')
            if len(pr):
                a, b = pr[:, 0], pr[:, 1]
                far = np.abs(gi[a] - gi[b]).max(1) > 2
                a, b = a[far], b[far]
                if len(a):
                    d = P[b] - P[a]
                    L = np.linalg.norm(d, axis=1) + 1e-9
                    push = ((R_COLL - L) / L)[:, None] * d * 0.5
                    acc = np.zeros_like(P)
                    np.add.at(acc, a, -push)
                    np.add.at(acc, b, push)
                    P += acc
    V = (P - prev)
    if step in key_at:
        keys.append(P.copy())
    if step % 100 == 0:
        strain = np.abs(np.linalg.norm(P[C[:, 1]] - P[C[:, 0]], axis=1) / REST - 1).mean()
        print(f'[crumple] step {step} R={R:.3f} strain={strain:.4f}', flush=True)

K = np.array(keys, dtype=np.float32)  # [KEYS, N, 3]
# centre the ball (last frame) on its centroid in every frame's coordinates, so it spins about
# its middle once thrown
K -= K[-1].mean(0)
lo = K.reshape(-1, 3).min(0)
hi = K.reshape(-1, 3).max(0)
scale = (hi - lo) / 65535.0
Q = np.round((K - lo) / scale - 32768).astype(np.int16)
with open(OUT, 'wb') as f:
    f.write(struct.pack('<3I', NX, NY, len(K)))
    f.write(struct.pack('<6f', *lo, *scale))
    f.write(Q.tobytes())
print('[crumple] wrote', OUT, len(K), 'keys', N, 'verts', 'ball radius', np.linalg.norm(K[-1], axis=1).max())

if PREVIEW:
    # quick look: 8 frames, shaded by facet normal, from above at an angle
    from PIL import Image, ImageDraw
    tri = []
    for j in range(NY - 1):
        for i in range(NX - 1):
            a, b, c, d = idx[j, i], idx[j, i + 1], idx[j + 1, i], idx[j + 1, i + 1]
            tri += [(a, c, b), (b, c, d)]
    tri = np.array(tri)
    img = Image.new('RGB', (4 * 300, 2 * 300), 'black')
    L = np.array([0.4, 1.0, 0.3]); L /= np.linalg.norm(L)
    ang = np.radians(50)
    Rx = np.array([[1, 0, 0], [0, np.cos(ang), -np.sin(ang)], [0, np.sin(ang), np.cos(ang)]])
    for n, k in enumerate(np.linspace(0, len(K) - 1, 8).round().astype(int)):
        X = K[k] @ Rx.T
        v = X[tri]
        nrm = np.cross(v[:, 1] - v[:, 0], v[:, 2] - v[:, 0])
        nrm /= np.linalg.norm(nrm, axis=1)[:, None] + 1e-12
        shade = np.abs(nrm @ (L @ Rx.T))
        order = np.argsort(v[:, :, 2].mean(1))
        dr = ImageDraw.Draw(img)
        ox, oy = (n % 4) * 300 + 150, (n // 4) * 300 + 150
        s = 300 / 0.36 if k < len(K) // 2 else 300 / 0.16
        for t_ in order:
            pts = [(ox + p[0] * s, oy - p[1] * s) for p in v[t_]]
            g = int(40 + 200 * shade[t_])
            dr.polygon(pts, fill=(g, g, g))
    img.save(PREVIEW)

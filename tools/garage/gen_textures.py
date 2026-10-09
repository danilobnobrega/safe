"""Our own tileable textures for the garage room — drawn from scratch, matching the
ROLE of steven.com's (hatch pattern thresholded by shading, pencil scribble for the
cursor, smooth RGB noise, blotchy concrete). Everything is generated on a torus so it
tiles seamlessly under RepeatWrapping."""
import numpy as np
from PIL import Image

N = 512
rng = np.random.default_rng(7)
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)


def periodic_noise(n, cutoff, seed):
    """band-limited white noise, filtered in frequency space -> seamless by construction"""
    r = np.random.default_rng(seed)
    f = np.fft.fft2(r.standard_normal((n, n)))
    ky = np.fft.fftfreq(n)[:, None]
    kx = np.fft.fftfreq(n)[None, :]
    k = np.sqrt(kx * kx + ky * ky)
    f *= np.exp(-(k / cutoff) ** 2)
    out = np.real(np.fft.ifft2(f))
    out -= out.min()
    return out / out.max()


def wrap_d(a, b):
    d = a - b
    return (d + N / 2) % N - N / 2


def stroke_field(count, angle_deg, len_rng, width_rng, dark_rng, seed, wobble=0.0, grain=0.0):
    """ink density (0 = paper, 1 = full ink) of `count` straight-ish strokes on the torus"""
    r = np.random.default_rng(seed)
    ink = np.zeros((N, N), np.float32)
    a = np.deg2rad(angle_deg)
    dx, dy = np.cos(a), np.sin(a)
    for _ in range(count):
        cx, cy = r.uniform(0, N, 2)
        L = r.uniform(*len_rng)
        w = r.uniform(*width_rng)
        dark = r.uniform(*dark_rng)
        ang = a + r.normal(0, 0.035)
        ux, uy = np.cos(ang), np.sin(ang)
        px, py = wrap_d(xx, cx), wrap_d(yy, cy)
        along = px * ux + py * uy
        across = -px * uy + py * ux
        if wobble:
            across = across + wobble * np.sin(along / r.uniform(18, 40) + r.uniform(0, 6.28))
        # soft round caps + gaussian cross profile, pressure fades at both ends
        t = np.clip(along / (L / 2), -1.5, 1.5)
        cap = np.clip(1.0 - np.abs(t) ** 6, 0, 1) * (np.abs(along) < L / 2 + w)
        pressure = 0.55 + 0.45 * np.cos(np.clip(t, -1, 1) * np.pi / 2) ** 0.5
        prof = np.exp(-(across / w) ** 2 * 1.6)
        s = prof * cap * pressure * dark
        if grain:
            s *= 1.0 - grain * rng_grain
        ink = 1.0 - (1.0 - ink) * (1.0 - np.clip(s, 0, 1))
    return ink


# ---- drawing: diagonal hatching (the shadow pattern). Paper white, strokes black.
#      shader: step(pattern, shade - 0.15) -> ink shows where pattern is dark.
rng_grain = periodic_noise(N, 0.25, 11)
# crisp full-pressure strokes + a few wide faint ones (out-of-focus pencil), mostly paper
crisp = stroke_field(34, 29, (180, 460), (3.8, 6.0), (0.85, 1.0), 1)
faint = stroke_field(16, 29, (120, 320), (6.0, 11.0), (0.18, 0.45), 4)
ink = 1.0 - (1.0 - crisp) * (1.0 - faint)
img = np.clip(1.0 - ink, 0, 1)
Image.fromarray((img * 255).astype(np.uint8)).convert('RGB').save('drawing.png')

# ---- drawing-cursor: dense graphite scribble (the cursor trail texture)
rng_grain = periodic_noise(N, 0.45, 21)
ink = stroke_field(300, -58, (120, 520), (0.7, 2.2), (0.25, 0.9), 2, wobble=2.5, grain=0.75)
ink2 = stroke_field(70, -47, (80, 300), (0.6, 1.6), (0.3, 0.8), 5, wobble=6.0, grain=0.6)
ink = 1.0 - (1.0 - ink) * (1.0 - ink2)
img = np.clip(1.0 - ink * 0.92, 0, 1)
Image.fromarray((img * 255).astype(np.uint8)).convert('RGB').save('drawing-cursor.png')

# ---- noise: three independent smooth channels
ch = [periodic_noise(N, 0.011, s) for s in (31, 32, 33)]
rgb = np.stack(ch, -1)
Image.fromarray((rgb * 255).astype(np.uint8)).save('noise.png')

# ---- concrete: blotchy mid-frequency + fine speckle (only .r is read)
c = 0.6 * periodic_noise(N, 0.02, 41) + 0.3 * periodic_noise(N, 0.06, 42) + 0.1 * periodic_noise(N, 0.3, 43)
c = (c - c.min()) / (c.max() - c.min())
c = np.clip((c - 0.2) * 1.3, 0, 1)
Image.fromarray((c * 255).astype(np.uint8)).convert('RGB').save('concrete.png')
print('ok')

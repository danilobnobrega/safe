import numpy as np
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

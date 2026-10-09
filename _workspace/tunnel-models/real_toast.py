import re

ROOT = 'C:/Users/GETÚLIO/generic/'


def edit(p, pairs):
    p = ROOT + p
    s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert a in s, (p, a)
        s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf-8').write(s)


U = "drawnToasts?: boolean | 'hover' | 'fade' | 'spread' | 'rise'"

REAL = r'''  /** TEST (/hero-drawn-giz-real.html): a more believable slice — an open crumb of irregular pores
   *  (with their relief, as a bump map), toasted unevenly and darker toward the edge, a lip of
   *  crust round the face, a crust of its own on the sides; the label burnt in as the big one */
  private realToastMaterials(label: string): THREE.Material[] {
    const W = 1024
    const H = 912
    const k = W / 256
    const mk = () => {
      const c = document.createElement('canvas')
      c.width = W
      c.height = H
      return [c, c.getContext('2d')!] as const
    }
    const [cnv, ctx] = mk()
    const [bcnv, bctx] = mk()
    // the face's outline in canvas px (toastGeometry's shape; uv = x / TOAST_W + 0.5, y / TOAST_H)
    const P = (x: number, y: number): [number, number] => [(x / TOAST_W + 0.5) * W, (1 - y / TOAST_H) * H]
    const outline = (c: CanvasRenderingContext2D) => {
      const w = TOAST_W / 2
      c.beginPath()
      c.moveTo(...P(-w, 0))
      c.lineTo(...P(w, 0))
      c.lineTo(...P(w, TOAST_H * 0.72))
      c.bezierCurveTo(...P(w + 0.1, TOAST_H * 1.02), ...P(w * 0.35, TOAST_H * 1.04), ...P(0, TOAST_H))
      c.bezierCurveTo(...P(-w * 0.35, TOAST_H * 1.04), ...P(-w - 0.1, TOAST_H * 1.02), ...P(-w, TOAST_H * 0.72))
      c.closePath()
    }
    const R = Math.random
    // crumb: pale gold, toasted toward the edges, unevenly
    ctx.fillStyle = '#d8a560'
    ctx.fillRect(0, 0, W, H)
    const g = ctx.createRadialGradient(W * 0.5, H * 0.55, 20, W * 0.5, H * 0.55, W * 0.62)
    g.addColorStop(0, 'rgba(244,214,150,0.95)')
    g.addColorStop(0.55, 'rgba(232,186,112,0.6)')
    g.addColorStop(1, 'rgba(176,104,42,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    ctx.filter = `blur(${10 * k}px)`
    for (let i = 0; i < 46; i++) {
      ctx.fillStyle = R() < 0.6 ? `rgba(160,88,30,${0.08 + R() * 0.12})` : `rgba(250,226,170,${0.08 + R() * 0.12})`
      ctx.beginPath()
      ctx.ellipse(R() * W, R() * H, (12 + R() * 34) * k, (8 + R() * 24) * k, R() * 3.14, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.filter = 'none'
    // bump: mid grey, the pores are pits
    bctx.fillStyle = '#909090'
    bctx.fillRect(0, 0, W, H)
    // pores: many small irregular holes, some bigger, each with a lit lower rim
    const pore = (r: number) => {
      const x = R() * W
      const y = R() * H
      const rx = r * (0.7 + R() * 0.8)
      const ry = r * (0.45 + R() * 0.55)
      const a = R() * Math.PI
      ctx.fillStyle = `rgba(122,66,22,${0.25 + R() * 0.3})`
      ctx.beginPath()
      ctx.ellipse(x, y, rx, ry, a, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = `rgba(255,236,190,${0.18 + R() * 0.2})`
      ctx.beginPath()
      ctx.ellipse(x + rx * 0.25, y + ry * 0.55, rx * 0.7, ry * 0.35, a, 0, Math.PI * 2)
      ctx.fill()
      bctx.fillStyle = `rgba(20,20,20,${0.5 + R() * 0.4})`
      bctx.beginPath()
      bctx.ellipse(x, y, rx, ry, a, 0, Math.PI * 2)
      bctx.fill()
    }
    for (let i = 0; i < 5200; i++) pore((0.5 + R() * 1.6) * k)
    for (let i = 0; i < 380; i++) pore((1.8 + R() * 2.4) * k)
    for (let i = 0; i < 26; i++) pore((4 + R() * 4) * k)
    // fine grain on both
    for (let i = 0; i < 14000; i++) {
      const x = R() * W
      const y = R() * H
      const v = R()
      ctx.fillStyle = v < 0.5 ? 'rgba(110,60,20,0.12)' : 'rgba(255,240,205,0.12)'
      ctx.fillRect(x, y, k * 0.6, k * 0.6)
      bctx.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)'
      bctx.fillRect(x, y, k * 0.6, k * 0.6)
    }
    // toasted rim of the face, then the crust's lip right on the edge
    ctx.save()
    outline(ctx)
    ctx.clip()
    ctx.filter = `blur(${7 * k}px)`
    ctx.strokeStyle = 'rgba(140,72,22,0.75)'
    ctx.lineWidth = 34 * k
    outline(ctx)
    ctx.stroke()
    ctx.filter = `blur(${1.5 * k}px)`
    ctx.strokeStyle = 'rgba(92,44,12,0.95)'
    ctx.lineWidth = 9 * k
    outline(ctx)
    ctx.stroke()
    ctx.restore()
    ctx.filter = 'none'
    bctx.save()
    bctx.filter = `blur(${2 * k}px)`
    bctx.strokeStyle = 'rgba(210,210,210,0.9)'
    bctx.lineWidth = 9 * k
    outline(bctx)
    bctx.stroke()
    bctx.restore()
    // the label, burnt in (set as the big one, see toastMaterials)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    let size = 80 * k
    ctx.font = `700 ${size}px Tinos, "Times New Roman", serif`
    while (ctx.measureText(label).width > W * 0.86) {
      size -= 2 * k
      ctx.font = `700 ${size}px Tinos, "Times New Roman", serif`
    }
    ctx.filter = `blur(${3 * k}px)`
    ctx.fillStyle = 'rgba(70,32,8,0.85)'
    ctx.fillText(label, W / 2, H * 0.2)
    ctx.filter = `blur(${0.6 * k}px)`
    ctx.fillStyle = 'rgba(28,12,3,0.95)'
    ctx.fillText(label, W / 2, H * 0.2)
    ctx.filter = 'none'
    const tex = (c: HTMLCanvasElement, srgb: boolean) => {
      const t = new THREE.CanvasTexture(c)
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
      t.anisotropy = 8
      return t
    }
    const face = new THREE.MeshStandardMaterial({ map: tex(cnv, true), bumpMap: tex(bcnv, false), bumpScale: 2.2, roughness: 0.92 })
    // crust: deep brown, mottled, rough
    const [ccnv, cctx] = mk()
    cctx.fillStyle = '#7a3d14'
    cctx.fillRect(0, 0, W, H)
    const [cb, cbx] = mk()
    cbx.fillStyle = '#808080'
    cbx.fillRect(0, 0, W, H)
    for (let i = 0; i < 9000; i++) {
      const x = R() * W
      const y = R() * H
      const r = (0.6 + R() * 2.2) * k
      const v = R()
      cctx.fillStyle = v < 0.5 ? `rgba(60,26,6,${0.15 + R() * 0.25})` : `rgba(176,104,46,${0.12 + R() * 0.22})`
      cctx.beginPath()
      cctx.arc(x, y, r, 0, Math.PI * 2)
      cctx.fill()
      cbx.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)'
      cbx.beginPath()
      cbx.arc(x, y, r, 0, Math.PI * 2)
      cbx.fill()
    }
    const crust = new THREE.MeshStandardMaterial({ map: tex(ccnv, true), bumpMap: tex(cb, false), bumpScale: 2.5, roughness: 0.8 })
    return [face, crust]
  }

'''

edit('src/ui/Toaster.ts', [
    ("opts: { grow?: boolean; drawn?: boolean; " + U + " } = {}) {",
     "opts: { grow?: boolean; drawn?: boolean; " + U + "; realisticToast?: boolean } = {}) {\n    this.realisticToast = !!opts.realisticToast"),
    ("  private toastRealOnHover = false\n",
     "  private toastRealOnHover = false\n  /** TEST (/hero-drawn-giz-real.html): the real slice made believable (see realToastMaterials) */\n  private realisticToast = false\n"),
    ("m.userData.realMaterial = this.toastRealOnHover ? this.toastMaterials(label, true) : m.material",
     "m.userData.realMaterial = this.toastRealOnHover ? (this.realisticToast ? this.realToastMaterials(label) : this.toastMaterials(label, true)) : m.material"),
    ("  /** golden-brown bread with a darker crust and the label burnt in. `big`",
     REAL + "  /** golden-brown bread with a darker crust and the label burnt in. `big`"),
])
edit('src/ui/menu.ts', [
    ("opts: { grow?: boolean; drawn?: boolean; " + U + " } = {}): Toaster {",
     "opts: { grow?: boolean; drawn?: boolean; " + U + "; realisticToast?: boolean } = {}): Toaster {"),
    ("drawnToasts: opts.drawnToasts })", "drawnToasts: opts.drawnToasts, realisticToast: opts.realisticToast })"),
])

s = open(ROOT + 'src/hero/mainDrawnGizSpread.ts', encoding='utf-8').read()
s = s.replace("// TEST route (/hero-drawn-giz-spread.html):",
              "// TEST route (/hero-drawn-giz-real.html): /hero-drawn-giz-spread.html with a more believable real\n// slice (Toaster.realToastMaterials). /hero-drawn-giz-spread.html:", 1)
a = "mountMenu({ drawn: true, drawnToasts: 'hover' })"
assert a in s
s = s.replace(a, "mountMenu({ drawn: true, drawnToasts: 'hover', realisticToast: true })", 1)
open(ROOT + 'src/hero/mainDrawnGizReal.ts', 'w', encoding='utf-8').write(s)

h = open(ROOT + 'hero-drawn-giz-spread.html', encoding='utf-8').read()
h = h.replace('/src/hero/mainDrawnGizSpread.ts', '/src/hero/mainDrawnGizReal.ts')
h = re.sub(r'<title>.*?</title>', '<title>GENERIC — drawn test, realistic toast</title>', h)
open(ROOT + 'hero-drawn-giz-real.html', 'w', encoding='utf-8').write(h)

edit('vite.config.ts', [("        heroDrawnGizRise: 'hero-drawn-giz-rise.html',\n",
                         "        heroDrawnGizRise: 'hero-drawn-giz-rise.html',\n        heroDrawnGizReal: 'hero-drawn-giz-real.html',\n")])
print('done')

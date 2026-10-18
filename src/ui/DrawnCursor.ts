/**
 * TEST (/cursor.html): the cursor drawn by the same hand as everything else (src/hero/Drawn.ts):
 * a fill in the ground's tone, an outline, a second thinner outline knocked sideways, hatching on
 * the side away from a fixed top-left light, the line boil. Graphite on the paper, chalk on the
 * dark — the hero's negative of the garage, as the rest.
 *
 * Not drawn on the page: each shape is drawn once into small images (1x + 2x, a few boil frames,
 * both grounds) and handed to CSS as `cursor: image-set(...)`. The system draws it, like its own
 * arrow — so it moves exactly as the native one does, with no frame of lag. The boil is the image
 * swapped PACE times a second.
 */

export type CursorTheme = 'paper' | 'chalk'

const PAPER = '#efede6' // Drawn's D_PAPER (0.937, 0.930, 0.902)
const INK = '#121212' // Drawn's D_INK, the garage's ground
const PACE = 8
const FRAMES = 4 // boil frames per shape (cycled)
const SCALE = 1.1
const BOX = 32 // image size, css px (Chrome caps cursors at 128)
const PAD = 4 // css px of margin around the shape, so the outline and the knock fit
const JITTER = 0.45 // css px each point wanders per boil frame
const OUTLINE = 2.0 // the fill covers half: ~1 px shows
const SKETCH = 0.9
const SKETCH_OFF = 0.9
const HATCH_GAP = 3

type Pt = [number, number]
type Prim = { poly: Pt[] } | { cap: [Pt, Pt, number] } | { rect: [number, number, number, number, number] }
type Shape = { hot: Pt; prims: Prim[]; native: string }

// in px at SCALE 1, hotspot at `hot`
const SHAPES: Record<string, Shape> = {
  default: {
    hot: [0, 0],
    native: 'default',
    prims: [{ poly: [[0, 0], [0, 17], [4.2, 13.2], [7, 19.6], [10, 18.4], [7.3, 12.2], [12.4, 12.2]] }],
  },
  pointer: {
    hot: [6, 0.4],
    native: 'pointer',
    prims: [
      { cap: [[6, 2.4], [6, 12], 2.3] },
      { cap: [[9.9, 8.4], [9.9, 13], 2.1] },
      { cap: [[13.6, 9.4], [13.6, 14], 2] },
      { cap: [[16.9, 11], [16.9, 15], 1.8] },
      { cap: [[4.4, 16.6], [1.6, 13], 2] },
      { rect: [3.6, 11.4, 15.2, 11, 4.2] },
    ],
  },
  grab: {
    hot: [10, 11],
    native: 'grab',
    prims: [
      { cap: [[5.6, 4], [6.6, 11], 2] },
      { cap: [[9.6, 2.4], [9.9, 11], 2.1] },
      { cap: [[13.6, 3.2], [13.4, 11], 2] },
      { cap: [[17.2, 6], [16.5, 12], 1.8] },
      { cap: [[2, 11.6], [5.4, 15.6], 2.1] },
      { rect: [4.2, 9.6, 14.4, 11.8, 4.6] },
    ],
  },
  grabbing: {
    hot: [10, 13],
    native: 'grabbing',
    prims: [
      { cap: [[6.6, 8.6], [6.6, 10.4], 2] },
      { cap: [[10, 8], [10, 10.4], 2.1] },
      { cap: [[13.4, 8.4], [13.4, 10.4], 2] },
      { cap: [[16.6, 9.6], [16.6, 11.4], 1.8] },
      { cap: [[4.2, 15], [7.2, 12.6], 2.1] },
      { rect: [4.2, 9.6, 14.4, 11, 4.6] },
    ],
  },
}

function hash(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** one boil frame of one shape on one ground, at `res` device px per css px, as a PNG data URL */
function render(shape: Shape, theme: CursorTheme, frame: number, res: number): string {
  const cnv = document.createElement('canvas')
  cnv.width = cnv.height = BOX * res
  const ctx = cnv.getContext('2d')!
  const k = res * SCALE
  const ox = PAD * res
  const oy = PAD * res
  const fg = theme === 'paper' ? INK : PAPER
  const bg = theme === 'paper' ? PAPER : INK

  const path = (salt: number, dx = 0, dy = 0): Path2D => {
    const p = new Path2D()
    let n = 0
    const j = (pt: Pt): Pt => {
      n++
      return [
        ox + (pt[0] + dx) * k + (hash(n + salt, frame) - 0.5) * 2 * JITTER * res,
        oy + (pt[1] + dy) * k + (hash(n + salt + 17, frame) - 0.5) * 2 * JITTER * res,
      ]
    }
    for (const prim of shape.prims) {
      if ('poly' in prim) {
        prim.poly.forEach((pt, i) => {
          const [x, y] = j(pt)
          if (i === 0) p.moveTo(x, y)
          else p.lineTo(x, y)
        })
        p.closePath()
      } else if ('cap' in prim) {
        const [a, b, r0] = prim.cap
        const A = j(a)
        const B = j(b)
        const r = r0 * k
        const ang = Math.atan2(B[1] - A[1], B[0] - A[0])
        p.moveTo(B[0] + Math.cos(ang - Math.PI / 2) * r, B[1] + Math.sin(ang - Math.PI / 2) * r)
        p.arc(B[0], B[1], r, ang - Math.PI / 2, ang + Math.PI / 2)
        p.arc(A[0], A[1], r, ang + Math.PI / 2, ang + (3 * Math.PI) / 2)
        p.closePath()
      } else {
        const [x0, y0, w, h, rr] = prim.rect
        const [x, y] = j([x0, y0])
        p.roundRect(x, y, w * k, h * k, rr * k)
      }
    }
    return p
  }

  const main = path(0)
  // the knocked-sideways second outline, then the outline, then the fill over both: only the
  // union's edge is left (no seams between the fingers and the palm)
  const kx = (hash(3, frame) - 0.5) * 2 * SKETCH_OFF
  const ky = (hash(5, frame) - 0.5) * 2 * SKETCH_OFF
  ctx.lineJoin = 'round'
  ctx.strokeStyle = fg
  ctx.globalAlpha = 0.7
  ctx.lineWidth = SKETCH * res * 2
  ctx.stroke(path(40, kx, ky))
  ctx.globalAlpha = 1
  ctx.lineWidth = OUTLINE * res
  ctx.stroke(main)
  ctx.fillStyle = bg
  ctx.fill(main)

  // hatching away from the light: the lower-right of the shape
  ctx.save()
  ctx.clip(main)
  ctx.globalAlpha = 0.4
  ctx.lineWidth = 0.7 * res
  const size = 26 * k
  const gap = HATCH_GAP * res
  const shift = (frame % 2) * gap * 0.5
  ctx.beginPath()
  for (let d = size * 0.6; d < size * 2.2; d += gap) {
    ctx.moveTo(ox + d + shift, oy)
    ctx.lineTo(ox + shift, oy + d)
  }
  ctx.stroke()
  ctx.restore()
  return cnv.toDataURL('image/png')
}

export class DrawnCursor {
  enabled = false
  private shape = 'default'
  private pageTheme: CursorTheme
  private theme: CursorTheme
  private frame = 0
  private timer = 0
  /** `${shape}/${theme}` -> one CSS cursor value per boil frame */
  private cache = new Map<string, string[]>()

  constructor(theme: CursorTheme) {
    this.pageTheme = this.theme = theme
    window.addEventListener('pointerover', this.onOver, { passive: true })
  }

  setEnabled(on: boolean): void {
    this.enabled = on
    window.clearInterval(this.timer)
    this.timer = 0
    if (on) {
      this.timer = window.setInterval(() => {
        this.frame = (this.frame + 1) % FRAMES
        this.apply()
      }, 1000 / PACE)
      this.apply()
    } else document.documentElement.style.cursor = ''
  }

  setShape(value: string): void {
    const s = value in SHAPES ? value : 'default'
    if (s === this.shape) return
    this.shape = s
    this.apply()
  }

  setPageTheme(t: CursorTheme): void {
    this.pageTheme = t
    if (t !== this.theme) {
      this.theme = t
      this.apply()
    }
  }

  private values(): string[] {
    const key = `${this.shape}/${this.theme}`
    let v = this.cache.get(key)
    if (!v) {
      const shape = SHAPES[this.shape]
      const hx = Math.round(PAD + shape.hot[0] * SCALE)
      const hy = Math.round(PAD + shape.hot[1] * SCALE)
      v = []
      for (let f = 0; f < FRAMES; f++) {
        const a = render(shape, this.theme, f, 1)
        const b = render(shape, this.theme, f, 2)
        // image-set for a sharp 2x where the screen has it; the plain 1x, then the system's own
        // shape, as fallbacks
        v.push(`image-set(url("${b}") 2x, url("${a}") 1x) ${hx} ${hy}, url("${a}") ${hx} ${hy}, ${shape.native}`)
      }
      this.cache.set(key, v)
    }
    return v
  }

  private apply(): void {
    if (!this.enabled) return
    document.documentElement.style.cursor = this.values()[this.frame]
  }

  // over the page's canvas, the page's ground; over a DOM element, whatever it's painted on
  // (the cookie bar is dark on the paper hero: there the cursor turns to chalk)
  private onOver = (e: PointerEvent): void => {
    let el = e.target instanceof Element ? e.target : null
    let t: CursorTheme = this.pageTheme
    while (el && el !== document.body && el.tagName !== 'CANVAS') {
      const bg = getComputedStyle(el).backgroundColor
      const m = bg.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/)
      if (m && (m[4] === undefined || Number(m[4]) > 0.5)) {
        const lum = (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255
        t = lum < 0.5 ? 'chalk' : 'paper'
        break
      }
      el = el.parentElement
    }
    if (t !== this.theme) {
      this.theme = t
      this.apply()
    }
  }
}

// TEST lab (/hero-hovers.html, /hero-hovers-2.html): a sign that can't make up its mind. While the cursor is over
// "GENERIC." the hover keeps changing by itself (every few seconds, a new one at random), and the
// letters keep restyling themselves one by one (font, size, weight, case, italic). A first look in
// plain canvas 2D, drawn in the room's graphite on paper, orange for what reacts — not the hero's
// WebGL sign yet; the ones that survive get rebuilt there. This file is the engine + the first set
// of hovers (SET_A); HoverLabMore.ts holds the second (SET_B); each route starts one set.
//   ?hover=<name>   pin one hover (no switching): inspect easings charcode gravity string fout
//                   breakpoint flee wave orbit kerning zindex float grid
//   ?troca=<s>      seconds between hovers (default 3.5)
//   ?letras=hover|sempre|off   letters restyle only while hovered (default) / all the time / never
import { GizSign } from './GizSign'
import { GizLetters, fontKey, type Fx, type GizHost } from './GizLetters'

const Q = new URLSearchParams(location.search)
export const PAPER = '#efeee7'
export const INK = '#121212'
export const ORANGE = '#ff9a4d'
export const MONO = '"IBM Plex Mono", Consolas, monospace'

// ---- faces: the most generic fonts a template ever offered ------------------------------------
type Face = { fam: string; weights: number[]; italic: boolean; caps?: boolean }
export const FACES: Face[] = [
  { fam: 'Tinos', weights: [400, 700], italic: true }, // Times
  { fam: 'Arimo', weights: [400, 700], italic: true }, // Arial
  { fam: 'Cousine', weights: [400, 700], italic: true }, // Courier
  { fam: 'Comic Neue', weights: [300, 400, 700], italic: true },
  { fam: 'Anton', weights: [400], italic: false },
  { fam: 'EB Garamond', weights: [400, 800], italic: true },
  { fam: 'Archivo Black', weights: [400], italic: false },
  { fam: 'Playfair Display', weights: [400, 900], italic: true },
  { fam: 'Lobster', weights: [400], italic: false },
  { fam: 'Bebas Neue', weights: [400], italic: false, caps: true },
  { fam: 'Pacifico', weights: [400], italic: false },
]
export type Style = { f: number; w: number; it: boolean; up: boolean; sc: number; col: string | null }
export const HOME: Style = { f: 0, w: 700, it: false, up: true, sc: 1, col: null }
// ---- colour: a letter can also come out in a colour, from one of two very generic palettes, drawn
// either filled flat (colour, graphite hatch and outline on top) or as a coloured pencil (hatch +
// outline in the colour). ?cor=bootstrap|css (default off) · ?acabamento=cheio|lapis (default cheio)
export const PALETTES: Record<string, string[]> = {
  // Bootstrap 5's colour variables: blue indigo purple pink red orange yellow green teal cyan
  bootstrap: ['#0d6efd', '#6610f2', '#6f42c1', '#d63384', '#dc3545', '#fd7e14', '#ffc107', '#198754', '#20c997', '#0dcaf0'],
  // CSS named colours
  css: ['tomato', 'rebeccapurple', 'hotpink', 'chartreuse', 'dodgerblue', 'gold', 'cornflowerblue', 'aquamarine', 'salmon', 'orchid', 'crimson', 'turquoise', 'coral', 'limegreen', 'slateblue', 'deeppink'],
}
export type Cor = 'off' | 'bootstrap' | 'css'
export type Look = 'cheio' | 'lapis'
export let COR: Cor = (new URLSearchParams(location.search).get('cor') as Cor) || 'off'
if (!(COR in PALETTES)) COR = 'off'
export let LOOK: Look = new URLSearchParams(location.search).get('acabamento') === 'lapis' ? 'lapis' : 'cheio'
const randomCol = (): string | null => (COR !== 'off' && Math.random() < 0.75 ? pick(PALETTES[COR]) : null)
export const rnd = (a = 0, b = 1) => a + Math.random() * (b - a)
export const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)]
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
export const ease = (dt: number, rate: number) => 1 - Math.exp(-dt * rate)
export const pre = (s: Style) => `${s.it ? 'italic ' : ''}${s.w}`
/** which font cuts may be picked (the giz route: only the ones whose TTF has loaded) */
let faceOk: (f: number, w: number, it: boolean) => boolean = () => true
export function randomStyle(f?: number): Style {
  for (let t = 0; t < 30; t++) {
    const ff = f ?? Math.floor(Math.random() * FACES.length)
    const face = FACES[ff]
    const w = pick(face.weights)
    const it = face.italic && Math.random() < 0.3
    if (!faceOk(ff, w, it)) continue
    return { f: ff, w, it, up: face.caps || Math.random() < 0.7, sc: rnd(0.72, 1.32), col: randomCol() }
  }
  return { ...HOME, sc: rnd(0.72, 1.32), col: randomCol() }
}

// ---- canvas -----------------------------------------------------------------------------------
const cv = document.querySelector<HTMLCanvasElement>('#hovers')!
/** where the hovers draw: one canvas, or (giz route) the paper under the 3D letters / the layer over
 *  them, swapped while drawing */
export let ctx = cv.getContext('2d')!
const ctxUnder = ctx
let ctxOver: CanvasRenderingContext2D | null = null
let overCv: HTMLCanvasElement | null = null
/** the giz route's 3D letters (GizLetters.ts) */
export let g3: GizLetters | null = null
export const DPR = Math.min(2, window.devicePixelRatio || 1)
export let W = 0
export let H = 0
export let S = 100 // the sign's font size, px
export let BASE = 0 // the sign's baseline, px
export const meas = document.createElement('canvas').getContext('2d')!

/** diagonal hatching: lines in `line` on `bg` (null = transparent) */
export function hatchPattern(line = INK, bg: string | null = PAPER, alpha = 0.34): CanvasPattern {
  const n = Math.round(9 * DPR)
  const c = document.createElement('canvas')
  c.width = c.height = n
  const g = c.getContext('2d')!
  if (bg) {
    g.fillStyle = bg
    g.fillRect(0, 0, n, n)
  }
  g.strokeStyle = line
  g.globalAlpha = alpha
  g.lineWidth = 0.8 * DPR
  for (const o of [-n, 0, n]) {
    g.beginPath()
    g.moveTo(o, n)
    g.lineTo(o + n, 0)
    g.stroke()
  }
  return g.createPattern(c, 'repeat')!
}
export let HATCH: CanvasPattern
let GRAIN: CanvasPattern
function grainPattern(): CanvasPattern {
  const n = 256
  const c = document.createElement('canvas')
  c.width = c.height = n
  const g = c.getContext('2d')!
  const img = g.createImageData(n, n)
  for (let i = 0; i < n * n; i++) {
    const v = Math.random() * 255
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 14
  }
  g.putImageData(img, 0, 0)
  return ctx.createPattern(c, 'repeat')!
}

// ---- sprites: one letter drawn in graphite (hatched inside, pencil outline), cached --------------
export type Sprite = { cv: HTMLCanvasElement; ox: number; oy: number; w: number; h: number; adv: number; asc: number; desc: number }
const cache = new Map<string, Sprite>()
const hatches = new Map<string, CanvasPattern>()
const hatchOf = (line: string, bg: string | null, alpha: number) => {
  const k = `${line}|${bg}|${alpha}`
  let h = hatches.get(k)
  if (!h) hatches.set(k, (h = hatchPattern(line, bg, alpha)))
  return h
}
export function bake(text: string, p: string, fam: string, px: number, col: string | null = null): Sprite {
  const key = `${text}|${p}|${fam}|${px}|${col}|${col ? LOOK : ''}`
  const hit = cache.get(key)
  if (hit) return hit
  if (cache.size > 600) cache.clear()
  const font = `${p} ${px * DPR}px "${fam}"`
  meas.font = font
  const mt = meas.measureText(text)
  const L = mt.actualBoundingBoxLeft
  const R = mt.actualBoundingBoxRight
  const A = mt.actualBoundingBoxAscent
  const D = mt.actualBoundingBoxDescent
  const pad = Math.ceil(px * DPR * 0.06) + 6
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(L + R) + pad * 2)
  c.height = Math.max(1, Math.ceil(A + D) + pad * 2)
  const g = c.getContext('2d')!
  g.font = font
  const x = pad + L
  const y = pad + A
  const ink = col && LOOK === 'lapis' ? col : INK
  g.fillStyle = INK
  g.fillText(text, x, y)
  g.globalCompositeOperation = 'source-in'
  if (col && LOOK === 'cheio') {
    g.fillStyle = col
    g.fillRect(0, 0, c.width, c.height)
    g.globalCompositeOperation = 'source-atop'
    g.fillStyle = hatchOf(INK, null, 0.22)
  } else g.fillStyle = col ? hatchOf(col, PAPER, 0.75) : HATCH
  g.fillRect(0, 0, c.width, c.height)
  g.globalCompositeOperation = 'source-over'
  g.lineJoin = 'round'
  g.strokeStyle = ink
  g.globalAlpha = 0.9
  g.lineWidth = 1.5 * DPR
  g.strokeText(text, x, y)
  g.globalAlpha = 0.28
  g.lineWidth = 1 * DPR
  g.strokeText(text, x + 0.8 * DPR, y + 0.5 * DPR)
  const s: Sprite = { cv: c, ox: x / DPR, oy: y / DPR, w: c.width / DPR, h: c.height / DPR, adv: mt.width / DPR, asc: A / DPR, desc: D / DPR }
  cache.set(key, s)
  return s
}
/** a heavier cut of the letter: the hatched body grown by a stroke, outlined (the "peso" hover) */
function bakeFat(text: string, p: string, fam: string, px: number, level: number): Sprite {
  const key = `fat${level}|${text}|${p}|${fam}|${px}`
  const hit = cache.get(key)
  if (hit) return hit
  const font = `${p} ${px * DPR}px "${fam}"`
  const extra = level * px * 0.014 * DPR
  meas.font = font
  const mt = meas.measureText(text)
  const pad = Math.ceil(px * DPR * 0.06 + extra) + 8
  const w = Math.max(1, Math.ceil(mt.actualBoundingBoxLeft + mt.actualBoundingBoxRight) + pad * 2)
  const h = Math.max(1, Math.ceil(mt.actualBoundingBoxAscent + mt.actualBoundingBoxDescent) + pad * 2)
  const x = pad + mt.actualBoundingBoxLeft
  const y = pad + mt.actualBoundingBoxAscent
  const mk = () => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d')!
    g.font = font
    g.lineJoin = 'round'
    return { c, g }
  }
  const A = mk() // the outline: a slightly bigger body, in ink
  A.g.fillStyle = A.g.strokeStyle = INK
  A.g.globalAlpha = 0.9
  A.g.lineWidth = extra + 2.6 * DPR
  A.g.strokeText(text, x, y)
  A.g.fillText(text, x, y)
  const B = mk() // the body, hatched
  B.g.fillStyle = B.g.strokeStyle = INK
  B.g.lineWidth = Math.max(0.01, extra)
  B.g.strokeText(text, x, y)
  B.g.fillText(text, x, y)
  B.g.globalCompositeOperation = 'source-in'
  B.g.fillStyle = HATCH
  B.g.fillRect(0, 0, w, h)
  A.g.globalAlpha = 1
  A.g.drawImage(B.c, 0, 0)
  const s: Sprite = { cv: A.c, ox: x / DPR, oy: y / DPR, w: w / DPR, h: h / DPR, adv: (mt.width + extra) / DPR, asc: (mt.actualBoundingBoxAscent + extra / 2) / DPR, desc: mt.actualBoundingBoxDescent / DPR }
  cache.set(key, s)
  return s
}
/** the missing-glyph box (□ with the code point inside), the size of the glyph it replaces */
function bakeTofu(hex: string, w: number, h: number): Sprite {
  const key = `tofu|${hex}|${w.toFixed(1)}|${h.toFixed(1)}`
  const hit = cache.get(key)
  if (hit) return hit
  const pad = 6
  const c = document.createElement('canvas')
  c.width = Math.ceil((w + pad * 2) * DPR)
  c.height = Math.ceil((h + pad * 2) * DPR)
  const g = c.getContext('2d')!
  g.scale(DPR, DPR)
  const bw = w * 0.86
  const bx = pad + (w - bw) / 2
  g.fillStyle = PAPER
  g.fillRect(bx, pad, bw, h)
  g.strokeStyle = INK
  g.lineWidth = Math.max(1.5, h * 0.025)
  g.strokeRect(bx, pad, bw, h)
  g.fillStyle = INK
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = `400 ${Math.min(bw * 0.36, h * 0.3)}px Cousine`
  g.fillText(hex.slice(0, 2), bx + bw / 2, pad + h * 0.31)
  g.fillText(hex.slice(2, 4), bx + bw / 2, pad + h * 0.69)
  const s: Sprite = { cv: c, ox: pad, oy: pad + h, w: c.width / DPR, h: c.height / DPR, adv: w, asc: h, desc: 0 }
  cache.set(key, s)
  return s
}

// ---- letters ----------------------------------------------------------------------------------
export class Letter {
  style: Style = { ...HOME }
  hx = 0 // home: baseline-left, eased toward the layout
  hy = 0
  placed = false
  ox = 0 // offset from home (springs toward tx/ty)
  oy = 0
  vx = 0
  vy = 0
  tx = 0
  ty = 0
  rot = 0
  rv = 0
  rotT = 0
  s = 1 // draw scale, eased toward layS * modeS
  layS = 1
  modeS = 1
  k = 170
  c = 15
  g = 0 // extra space before this letter (eased)
  pop = 0
  kin = false // the hover drives ox/oy/rot directly
  free = false // loose (gravity)
  show: string | null = null
  showFace: { fam: string; p: string } | null = null
  tofu = false
  fx: Fx = {} // what the hover asks of the 3D letter this frame (giz route)
  fat = 0 // extra stroke weight, 0..8 (the "peso" hover)
  flip = false // case flipped (the "caixa" hover)
  z: number
  constructor(public ch: string, public i: number) {
    this.z = i
  }
  text(): string {
    const up = this.style.up || FACES[this.style.f].caps
    return up !== this.flip ? this.ch.toUpperCase() : this.ch.toLowerCase()
  }
  px(): number {
    return Math.max(8, Math.round(S * this.style.sc))
  }
  ink(): Sprite {
    return bake(this.text(), pre(this.style), FACES[this.style.f].fam, this.px(), this.style.col)
  }
  sprite(): Sprite {
    if (this.tofu) {
      const base = this.ink()
      const code = this.text().charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')
      return bakeTofu(code, Math.max(base.adv, base.asc * 0.55), Math.max(base.asc, this.px() * 0.62))
    }
    if (this.show !== null) return bake(this.show, this.showFace?.p ?? '400', this.showFace?.fam ?? 'Cousine', this.px())
    if (this.showFace) return bake(this.text(), this.showFace.p, this.showFace.fam, this.px())
    if (this.fat > 0) return bakeFat(this.text(), pre(this.style), FACES[this.style.f].fam, this.px(), this.fat)
    return this.ink()
  }
  center(): { x: number; y: number } {
    const sp = this.sprite()
    return { x: this.hx + this.ox + (sp.adv * this.s) / 2, y: this.hy + this.oy - (sp.asc * this.s) / 2 }
  }
  restyle(st: Style): void {
    this.style = st
    this.pop = 1
  }
}
export const letters = [...'GENERIC.'].map((ch, i) => new Letter(ch, i))
const isHome = (s: Style) => s.f === HOME.f && s.w === HOME.w && s.it === HOME.it && s.up === HOME.up && s.sc === HOME.sc && s.col === null

// ---- the cursor -------------------------------------------------------------------------------
export const m = { x: -1e4, y: -1e4, px: -1e4, py: -1e4, vx: 0, vy: 0, speed: 0, on: false }
addEventListener('pointermove', (e) => {
  m.x = e.clientX
  m.y = e.clientY
  if (!m.on) {
    m.px = m.x
    m.py = m.y
  }
  m.on = true
})
addEventListener('pointerdown', (e) => {
  m.x = m.px = e.clientX
  m.y = m.py = e.clientY
  m.on = true
})
document.documentElement.addEventListener('pointerleave', () => {
  m.on = false
  m.x = m.y = -1e4
})
export const dist = (a: { x: number; y: number }) => Math.hypot(a.x - m.x, a.y - m.y)

// ---- hovers -----------------------------------------------------------------------------------
export type Spot = { x: number; y: number; s: number }
export interface Hover {
  name: string
  enter?(): void
  exit?(): void
  update(dt: number): void
  under?(): void // drawn before the letters
  over?(): void // drawn after
  layout?(): Spot[]
  gap?(i: number): number
  gapRate?: number
  order?(): Letter[]
  title?: string // shown top right (second set)
  paint?(l: Letter): boolean // draws the letter itself instead of the sprite; false = draw as usual
}
export let time = 0

export function mono(size: number, weight = 400): void {
  ctx.font = `${weight} ${size}px ${MONO}`
}
export function label(text: string, x: number, y: number, color = INK, alpha = 0.6, size = 11, align: CanvasTextAlign = 'center'): void {
  mono(size)
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y)
  ctx.globalAlpha = 1
}
/** the cursor's push: away from it, strongest on top of it, gone by `reach` */
export function push(l: Letter, amount: number, reach: number): { x: number; y: number } {
  const c = l.center()
  const dx = c.x - m.x
  const dy = c.y - m.y
  const d = Math.hypot(dx, dy) || 1
  const f = amount * Math.max(0, 1 - d / reach) ** 2
  return { x: (dx / d) * f, y: (dy / d) * f }
}

// 1 · inspect element: the DevTools box model overlay on the letter under the cursor; its margin
// grows and shoves the neighbours away
function inspect(): Hover {
  const a = new Float32Array(letters.length)
  const M = () => 0.3 * S
  return {
    name: 'inspect',
    title: 'inspecionar elemento',
    update(dt) {
      let j = -1
      let best = 1.2 * S
      for (const l of letters) {
        const d = dist(l.center())
        if (d < best) {
          best = d
          j = l.i
        }
      }
      for (let i = 0; i < a.length; i++) a[i] += ((i === j ? 1 : 0) - a[i]) * ease(dt, 9)
    },
    gap: (i) => M() * a[i] + (i > 0 ? M() * a[i - 1] : 0),
    over() {
      for (const l of letters) {
        const k = a[l.i]
        if (k < 0.02) continue
        const sp = l.sprite()
        const x = l.hx + l.ox
        const top = l.hy + l.oy - sp.asc * l.s
        const w = sp.adv * l.s
        const h = (sp.asc + sp.desc) * l.s
        const P = 0.06 * S
        const Mg = M() * k
        // guides across the page
        ctx.save()
        ctx.globalAlpha = 0.22 * k
        ctx.strokeStyle = INK
        ctx.setLineDash([4, 4])
        ctx.lineWidth = 1
        ctx.beginPath()
        for (const yy of [top, top + h]) {
          ctx.moveTo(0, yy)
          ctx.lineTo(W, yy)
        }
        for (const xx of [x, x + w]) {
          ctx.moveTo(xx, 0)
          ctx.lineTo(xx, H)
        }
        ctx.stroke()
        ctx.restore()
        // margin ring, padding ring, content box
        ctx.fillStyle = ORANGE
        ctx.globalAlpha = 0.32 * k
        ctx.beginPath()
        ctx.rect(x - P - Mg, top - P - Mg, w + 2 * (P + Mg), h + 2 * (P + Mg))
        ctx.rect(x - P, top - P, w + 2 * P, h + 2 * P)
        ctx.fill('evenodd')
        ctx.globalAlpha = 0.13 * k
        ctx.beginPath()
        ctx.rect(x - P, top - P, w + 2 * P, h + 2 * P)
        ctx.rect(x, top, w, h)
        ctx.fill('evenodd')
        ctx.globalAlpha = 0.7 * k
        ctx.strokeStyle = INK
        ctx.lineWidth = 1
        ctx.strokeRect(x + 0.5, top + 0.5, w - 1, h - 1)
        // margin size in the ring
        label(`${Mg.toFixed(0)}`, x + w / 2, top - P - Mg / 2, INK, 0.7 * k, 10)
        // the tooltip
        const face = l.showFace?.fam ?? FACES[l.style.f].fam
        const t1 = `span.letter:nth-child(${l.i + 1})`
        const t2 = `${w.toFixed(2)} × ${h.toFixed(2)}`
        const t3 = `font: ${l.style.it ? 'italic ' : ''}${l.style.w} ${l.px()}px ${face}`
        mono(12)
        const tw = Math.max(ctx.measureText(t1 + '  ' + t2).width, ctx.measureText(t3).width) + 20
        let bx = x + w / 2 - tw / 2
        bx = clamp(bx, 8, W - tw - 8)
        const by = top - P - Mg - 60
        ctx.globalAlpha = 0.94 * k
        ctx.fillStyle = INK
        ctx.fillRect(bx, by, tw, 46)
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = ORANGE
        ctx.fillText(t1, bx + 10, by + 15)
        ctx.fillStyle = PAPER
        ctx.fillText(t2, bx + 10 + ctx.measureText(t1 + '  ').width, by + 15)
        ctx.globalAlpha = 0.6 * k
        ctx.fillText(t3, bx + 10, by + 33)
        ctx.globalAlpha = 1
      }
    },
  }
}

// 2 · easings: every letter makes the same trip, each on its own curve, the curve drawn under it
type Ease = [string, (t: number) => number]
const bounceOut = (t: number) => {
  const n = 7.5625
  const d = 2.75
  if (t < 1 / d) return n * t * t
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375
  return n * (t -= 2.625 / d) * t + 0.984375
}
const EASES: Ease[] = [
  ['linear', (t) => t],
  ['easeInQuad', (t) => t * t],
  ['easeOutCubic', (t) => 1 - (1 - t) ** 3],
  ['easeInOutSine', (t) => -(Math.cos(Math.PI * t) - 1) / 2],
  ['easeOutBack', (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2],
  ['easeOutElastic', (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1)],
  ['easeOutBounce', bounceOut],
  ['steps(5)', (t) => Math.min(1, Math.floor(t * 5) / 5 + (t >= 1 ? 0.2 : 0))],
]
function easings(): Hover {
  let t0 = 0
  let p = 0
  let up = true
  const start = letters.map(() => ({ x: 0, y: 0, r: 0 }))
  const RISE = () => 0.55 * S
  return {
    name: 'easings',
    title: 'easings',
    enter() {
      t0 = time
      for (const l of letters) {
        start[l.i] = { x: l.ox, y: l.oy, r: l.rot }
        l.kin = true
      }
    },
    exit() {
      for (const l of letters) {
        l.kin = false
        l.vx = l.vy = l.rv = 0
      }
    },
    update() {
      const T = time - t0
      const cyc = T % 2.7
      if (cyc < 1.1) {
        p = cyc / 1.1
        up = true
      } else if (cyc < 1.5) {
        p = 1
        up = true
      } else if (cyc < 2.6) {
        p = (cyc - 1.5) / 1.1
        up = false
      } else {
        p = 1
        up = false
      }
      const b = Math.min(1, T / 0.35)
      for (const l of letters) {
        const e = EASES[l.i % EASES.length][1](p)
        const y = -RISE() * (up ? e : 1 - e)
        l.ox = start[l.i].x * (1 - b)
        l.oy = start[l.i].y * (1 - b) + y * b
        l.rot = start[l.i].r * (1 - b)
      }
    },
    under() {
      for (const l of letters) {
        const sp = l.sprite()
        const cx = l.hx + (sp.adv * l.s) / 2
        const [name, fn] = EASES[l.i % EASES.length]
        const y0 = BASE + 0.2 * S
        label(name, cx, y0, INK, 0.65, 11)
        // the curve
        const s = Math.min(46, sp.adv * l.s * 0.8)
        const gx = cx - s / 2
        const gy = y0 + 14
        const Y = (v: number) => gy + s - ((v + 0.3) / 1.6) * s
        ctx.strokeStyle = INK
        ctx.globalAlpha = 0.18
        ctx.lineWidth = 1
        ctx.strokeRect(gx, gy, s, s)
        ctx.globalAlpha = 0.75
        ctx.beginPath()
        for (let k = 0; k <= 40; k++) {
          const t = k / 40
          const xx = gx + t * s
          const yy = Y(fn(t))
          if (k) ctx.lineTo(xx, yy)
          else ctx.moveTo(xx, yy)
        }
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.fillStyle = ORANGE
        ctx.beginPath()
        ctx.arc(gx + p * s, Y(fn(p)), 3, 0, Math.PI * 2)
        ctx.fill()
      }
    },
  }
}

// 3 · charcode: the letter under the cursor turns into its own number, in every base
function charcode(): Hover {
  const st = letters.map(() => ({ on: false, t: 0, away: 0 }))
  const reps = (ch: string) => {
    const c = ch.charCodeAt(0)
    const hex = c.toString(16).toUpperCase()
    return [ch, `${c}`, `0x${hex}`, c.toString(2).padStart(8, '0'), `&#${c};`, `U+${hex.padStart(4, '0')}`]
  }
  return {
    name: 'charcode',
    title: 'charcode',
    exit() {
      for (const l of letters) {
        l.show = null
        l.showFace = null
      }
    },
    update(dt) {
      for (const l of letters) {
        const s = st[l.i]
        const near = dist(l.center()) < 0.55 * S
        if (near) {
          s.on = true
          s.away = 0
        } else if (s.on) {
          s.away += dt
          if (s.away > 0.8) {
            s.on = false
            s.t = 0
            l.show = null
            l.pop = 0.6
          }
        }
        if (!s.on) continue
        s.t += dt
        const r = reps(l.text())
        const idx = (1 + Math.floor(s.t / 0.36)) % r.length
        const was = l.show
        l.show = idx === 0 ? null : r[idx]
        l.showFace = { fam: 'Cousine', p: '400' }
        if (l.show !== was) l.pop = 0.5
        if (l.show !== null) l.modeS = Math.min(1, (1.7 * l.ink().adv) / l.sprite().adv)
      }
    },
  }
}

// 4 · gravity: hit a letter and it falls off the line, bounces, and lies on the floor
function gravity(): Hover {
  const floor = () => H - Math.max(24, H * 0.05)
  return {
    name: 'gravity',
    title: 'gravidade',
    exit() {
      for (const l of letters) {
        if (!l.free) continue
        l.free = false
        l.rot = Math.atan2(Math.sin(l.rot), Math.cos(l.rot))
        l.vx *= 0.2
        l.vy *= 0.2
        l.rv = 0
      }
    },
    update(dt) {
      for (const l of letters) {
        const c = l.center()
        const d = dist(c)
        if (!l.free) {
          if (d < 0.5 * S && m.speed > 220) {
            l.free = true
            l.vx = m.vx * 0.55 + rnd(-80, 80)
            l.vy = Math.min(m.vy * 0.55, 0) - rnd(250, 600)
            l.rv = rnd(-9, 9)
          }
          continue
        }
        // the cursor keeps kicking it around
        if (d < 0.45 * S && m.speed > 60) {
          const nx = (c.x - m.x) / (d || 1)
          const ny = (c.y - m.y) / (d || 1)
          l.vx += (nx * 900 + m.vx * 3) * dt
          l.vy += (ny * 900 + m.vy * 3) * dt
          l.rv += (m.vx / S) * dt * 4
        }
        l.vy += 2800 * dt
        l.ox += l.vx * dt
        l.oy += l.vy * dt
        l.rot += l.rv * dt
        const sp = l.sprite()
        const hw = (sp.adv * l.s) / 2
        const hh = ((sp.asc + sp.desc) * l.s) / 2
        const ext = Math.abs(hw * Math.sin(l.rot)) + Math.abs(hh * Math.cos(l.rot))
        const cy = l.hy + l.oy - (sp.asc * l.s) / 2
        if (cy + ext > floor()) {
          l.oy -= cy + ext - floor()
          if (l.vy > 0) l.vy *= -0.38
          if (Math.abs(l.vy) < 70) {
            l.vy = 0
            l.vx *= 1 - ease(dt, 5)
            l.rv *= 1 - ease(dt, 8)
            const flat = Math.round(l.rot / (Math.PI / 2)) * (Math.PI / 2)
            l.rot += (flat - l.rot) * ease(dt, 7)
          } else {
            l.vx *= 0.85
            l.rv *= 0.7
          }
        }
        // loose letters don't go through each other (boxes, rotation ignored)
        for (const o of letters) {
          if (o === l || !o.free || o.i < l.i) continue
          const a = l.center()
          const b = o.center()
          const so = o.sprite()
          const ax = (sp.adv * l.s) / 2
          const ay = hh
          const bx = (so.adv * o.s) / 2
          const by = ((so.asc + so.desc) * o.s) / 2
          const px = ax + bx - Math.abs(a.x - b.x)
          const py = ay + by - Math.abs(a.y - b.y)
          if (px <= 0 || py <= 0) continue
          if (px * 1.6 < py) {
            const sx = Math.sign(a.x - b.x) || 1
            l.ox += (sx * px) / 2
            o.ox -= (sx * px) / 2
            const v = (l.vx + o.vx) / 2
            l.vx = o.vx = v
          } else {
            const sy = Math.sign(a.y - b.y) || 1
            l.oy += (sy * py) / 2
            o.oy -= (sy * py) / 2
            const v = (l.vy + o.vy) / 2
            l.vy = o.vy = v
          }
        }
        const xl = l.hx + l.ox
        if (xl < 8) {
          l.ox += 8 - xl
          l.vx = Math.abs(l.vx) * 0.5
        }
        if (xl + hw * 2 > W - 8) {
          l.ox -= xl + hw * 2 - (W - 8)
          l.vx = -Math.abs(l.vx) * 0.5
        }
      }
    },
  }
}

// 5 · string: the word sits on a string; cross it with the cursor and you pluck it
function string(): Hover {
  const N = 140
  const u = new Float32Array(N)
  const v = new Float32Array(N)
  let x0 = 0
  let x1 = 1
  let grabbed = false
  let gi = 1
  let side = 0
  const at = (x: number) => {
    const f = ((x - x0) / (x1 - x0)) * (N - 1)
    if (f <= 0 || f >= N - 1) return { y: 0, slope: 0 }
    const k = Math.floor(f)
    const t = f - k
    const dx = (x1 - x0) / (N - 1)
    return { y: u[k] * (1 - t) + u[k + 1] * t, slope: (u[k + 1] - u[k]) / dx }
  }
  return {
    name: 'string',
    title: 'corda',
    enter() {
      u.fill(0)
      v.fill(0)
      grabbed = false
      side = 0
      for (const l of letters) l.kin = true
    },
    exit() {
      for (const l of letters) {
        l.kin = false
        l.vx = l.vy = l.rv = 0
      }
    },
    update(dt) {
      const first = letters[0]
      const last = letters[letters.length - 1]
      x0 = first.hx - 0.45 * S
      x1 = last.hx + last.sprite().adv * last.s + 0.45 * S
      const dx = (x1 - x0) / (N - 1)
      if (m.x > x0 && m.x < x1 && m.on) {
        const i = clamp(Math.round((m.x - x0) / dx), 1, N - 2)
        const rel = m.y - BASE
        if (grabbed) {
          if (Math.abs(rel) > 0.3 * S) {
            grabbed = false // let go: it rings
            side = Math.sign(rel - u[i])
          } else {
            gi = i
            for (let k = 0; k < N; k++) {
              u[k] = rel * (k <= gi ? k / gi : (N - 1 - k) / (N - 1 - gi))
              v[k] = 0
            }
          }
        } else {
          const sd = Math.sign(rel - u[i]) || side
          if (side && sd !== side && Math.abs(rel - u[i]) < 0.25 * S) {
            grabbed = true
            gi = i
          }
          side = sd
        }
      } else {
        grabbed = false
        side = 0
      }
      if (!grabbed) {
        const c = 1150
        const n = Math.ceil((c * dt) / (0.6 * dx))
        const h = dt / n
        for (let s = 0; s < n; s++) {
          for (let k = 1; k < N - 1; k++) v[k] += ((c * c * (u[k - 1] - 2 * u[k] + u[k + 1])) / (dx * dx) - 1.6 * v[k]) * h
          for (let k = 1; k < N - 1; k++) u[k] += v[k] * h
        }
      }
      for (const l of letters) {
        const sp = l.sprite()
        const s = at(l.hx + l.ox + (sp.adv * l.s) / 2)
        l.ox += (0 - l.ox) * ease(dt, 10)
        l.oy = s.y
        l.rot = Math.atan(s.slope)
      }
    },
    under() {
      ctx.strokeStyle = INK
      ctx.globalAlpha = 0.8
      ctx.lineWidth = 1.3
      ctx.beginPath()
      const dx = (x1 - x0) / (N - 1)
      for (let k = 0; k < N; k++) {
        if (k) ctx.lineTo(x0 + k * dx, BASE + u[k])
        else ctx.moveTo(x0, BASE)
      }
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.fillStyle = INK
      for (const x of [x0, x1]) {
        ctx.beginPath()
        ctx.arc(x, BASE, 3.5, 0, Math.PI * 2)
        ctx.fill()
      }
    },
  }
}

// 6 · FOUT: the letters near the cursor flash through fallback fonts, then settle on whichever won
function fout(): Hover {
  const st = letters.map(() => ({ flick: 0, cool: 0, tick: 0, f: 0 }))
  let lit = -1
  return {
    name: 'fout',
    title: 'FOUT',
    exit() {
      for (const l of letters) l.showFace = null
    },
    update(dt) {
      for (const l of letters) {
        const s = st[l.i]
        s.cool -= dt
        if (s.flick <= 0 && s.cool <= 0 && dist(l.center()) < 0.7 * S) s.flick = rnd(0.45, 0.8)
        if (s.flick <= 0) continue
        s.flick -= dt
        s.tick -= dt
        if (s.tick <= 0) {
          s.tick = 0.06
          s.f = Math.floor(Math.random() * FACES.length)
          lit = s.f
          l.showFace = { fam: FACES[s.f].fam, p: `${pick(FACES[s.f].weights)}` }
        }
        if (s.flick <= 0) {
          l.showFace = null
          l.restyle({ ...randomStyle(s.f), sc: l.style.sc })
          s.cool = 1.1
        }
      }
    },
    over() {
      const parts = FACES.map((f) => (f.fam.includes(' ') ? `"${f.fam}"` : f.fam))
      mono(12)
      const head = 'font-family: '
      const full = head + parts.join(', ') + ', cursive;'
      let x = W / 2 - ctx.measureText(full).width / 2
      const y = BASE + 0.42 * S
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      const put = (t: string, col: string, a: number) => {
        ctx.globalAlpha = a
        ctx.fillStyle = col
        ctx.fillText(t, x, y)
        x += ctx.measureText(t).width
      }
      put(head, INK, 0.5)
      parts.forEach((p, i) => put(p + ', ', i === lit ? ORANGE : INK, i === lit ? 1 : 0.4))
      put('cursive;', INK, 0.4)
      ctx.globalAlpha = 1
    },
  }
}

// 8 · breakpoint: the cursor's x is the window's width; the sign reflows like a responsive layout
function breakpoint(): Hover {
  let vw = 1440
  const BPS = [1024, 768, 480]
  const LINES = [[[0, 1, 2, 3, 4, 5, 6, 7]], [[0, 1, 2, 3], [4, 5, 6, 7]], [[0, 1, 2], [3, 4], [5, 6, 7]], [[0, 1], [2, 3], [4, 5], [6, 7]]]
  const SC = [1, 0.78, 0.6, 0.47]
  const bp = () => (vw >= 1024 ? 0 : vw >= 768 ? 1 : vw >= 480 ? 2 : 3)
  const X = (w: number) => ((w - 320) / 1120) * W
  return {
    name: 'breakpoint',
    title: 'breakpoint',
    enter() {
      vw = 320 + clamp(m.x / W, 0, 1) * 1120
    },
    update(dt) {
      if (m.on) vw += (320 + clamp(m.x / W, 0, 1) * 1120 - vw) * ease(dt, 10)
    },
    layout() {
      const b = bp()
      const sc = SC[b]
      const lines = LINES[b]
      const lh = S * sc * 1.02
      const capH = 0.68 * S
      const mid = BASE - capH / 2
      const spots: Spot[] = []
      lines.forEach((line, li) => {
        const lw = line.reduce((a, i) => a + letters[i].ink().adv * sc, 0)
        let x = W / 2 - lw / 2
        const y = mid - (lines.length * lh) / 2 + li * lh + lh / 2 + (capH * sc) / 2
        for (const i of line) {
          spots[i] = { x, y, s: sc }
          x += letters[i].ink().adv * sc
        }
      })
      return spots
    },
    under() {
      const y = 46
      ctx.strokeStyle = INK
      ctx.globalAlpha = 0.3
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      for (const w of BPS) {
        ctx.moveTo(X(w), y - 6)
        ctx.lineTo(X(w), y + 6)
      }
      ctx.stroke()
      ctx.globalAlpha = 1
      for (const w of BPS) label(`${w}px`, X(w), y - 16, INK, 0.5, 10)
      const xx = X(vw)
      ctx.strokeStyle = ORANGE
      ctx.lineWidth = 1.5
      ctx.setLineDash([5, 4])
      ctx.beginPath()
      ctx.moveTo(xx, y - 8)
      ctx.lineTo(xx, H)
      ctx.stroke()
      ctx.setLineDash([])
      label(`${Math.round(vw)}px`, xx, y + 18, ORANGE, 1, 12, xx > W - 60 ? 'right' : 'center')
      const b = bp()
      const q = b === 0 ? '@media (min-width: 1024px)' : `@media (max-width: ${[0, 1023, 767, 479][b]}px)`
      label(q + ' { .sign { … } }', W / 2, H - 64, INK, 0.6, 13)
    },
  }
}

// 9 · flee: the letters get out of the cursor's way (the "We are" of the hero)
function flee(): Hover {
  return {
    name: 'flee',
    title: 'fugir',
    update() {
      for (const l of letters) {
        const p = push(l, 0.6 * S, 1.2 * S)
        l.tx = p.x
        l.ty = p.y
        l.rotT = (p.x / S) * 0.5
        l.k = 150
        l.c = 12
      }
    },
  }
}

// 10 · wave: the word becomes a sine; near = amplitude, fast = frequency
function wave(): Hover {
  let A = 0
  let w = 3
  let ph = 0
  return {
    name: 'wave',
    title: 'onda',
    enter() {
      A = 0
    },
    update(dt) {
      const first = letters[0].center()
      const lastL = letters[letters.length - 1].center()
      const near = clamp(1 - Math.abs(m.y - BASE + 0.35 * S) / (1.4 * S), 0, 1) * (m.x > first.x - S && m.x < lastL.x + S ? 1 : 0.3)
      A += (0.24 * S * near - A) * ease(dt, 4)
      w += (2.5 + Math.min(10, m.speed / 220) - w) * ease(dt, 3)
      ph += w * dt
      const k = (Math.PI * 2) / (2.6 * S)
      for (const l of letters) {
        const x = l.hx + (l.sprite().adv * l.s) / 2
        l.ty = A * Math.sin(k * x - ph)
        l.rotT = Math.atan(A * k * Math.cos(k * x - ph)) * 0.8
        l.k = 420
        l.c = 40
      }
    },
  }
}

// 11 · orbit: get close to a letter and it falls into orbit around the cursor
function orbit(): Hover {
  const o = letters.map(() => ({ on: false, th: 0, R: 0, w: 0 }))
  return {
    name: 'orbit',
    title: 'órbita',
    enter() {
      for (const x of o) x.on = false
    },
    update(dt) {
      for (const l of letters) {
        const s = o[l.i]
        const c = l.center()
        if (!s.on && dist(c) < 0.45 * S) {
          s.on = true
          s.th = Math.atan2(c.y - m.y, c.x - m.x)
          s.R = rnd(0.55, 1.3) * S
          s.w = (Math.random() < 0.5 ? -1 : 1) * rnd(1.4, 3.2)
        }
        if (!s.on) continue
        s.th += s.w * dt
        const sp = l.sprite()
        l.tx = m.x + s.R * Math.cos(s.th) - (l.hx + (sp.adv * l.s) / 2)
        l.ty = m.y + s.R * 0.8 * Math.sin(s.th) - (l.hy - (sp.asc * l.s) / 2)
        l.k = 90
        l.c = 11
      }
    },
  }
}

// 12 · kerning: the type designer's war — pairs nudged in arrow-key steps, never satisfied
function kerning(): Hover {
  const kern = new Float32Array(letters.length) // 1/1000 em, before letter i
  const flash = new Float32Array(letters.length)
  let next = 0
  let calm = 0
  return {
    name: 'kerning',
    title: 'kerning',
    gapRate: 40,
    enter() {
      kern.fill(0)
      calm = 0
    },
    update(dt) {
      next -= dt
      calm -= dt
      for (let i = 0; i < flash.length; i++) flash[i] = Math.max(0, flash[i] - dt * 3)
      if (calm <= 0 && Math.random() < dt * 0.22) calm = 1.4 // a false calm
      if (calm > 0 || next > 0) return
      next = rnd(0.08, 0.3)
      const w = letters.map((l) => (l.i === 0 ? 0 : Math.exp(-(((l.hx - m.x) / (1.3 * S)) ** 2)) + 0.05))
      let r = Math.random() * w.reduce((a, b) => a + b, 0)
      let i = 1
      for (; i < w.length - 1; i++) if ((r -= w[i]) <= 0) break
      const step = Math.random() < 0.05 ? (Math.random() < 0.5 ? -1 : 1) * 200 : (Math.random() < 0.5 ? -1 : 1) * 10 * Math.ceil(rnd(0, 5))
      kern[i] = clamp(kern[i] + step, -260, 320)
      flash[i] = 1
    },
    gap: (i) => (kern[i] / 1000) * S,
    over() {
      let total = 0
      for (const l of letters) {
        const sp = l.sprite()
        ctx.strokeStyle = INK
        ctx.globalAlpha = 0.35
        ctx.lineWidth = 1
        ctx.beginPath()
        for (const x of [l.hx, l.hx + sp.adv * l.s]) {
          ctx.moveTo(x, BASE + 4)
          ctx.lineTo(x, BASE + 14)
        }
        ctx.stroke()
        ctx.globalAlpha = 1
        if (l.i === 0) continue
        total += kern[l.i]
        const f = flash[l.i]
        label(`${kern[l.i] > 0 ? '+' : ''}${Math.round(kern[l.i])}`, l.hx - l.g / 2, BASE + 0.24 * S, f > 0 ? ORANGE : INK, f > 0 ? 1 : 0.5, 11)
      }
      label(`tracking ${(total / 1000 / (letters.length - 1)).toFixed(3)} em   ·   ${calm > 0 ? 'idle' : 'fighting'}`, W / 2, H - 64, INK, 0.6, 12)
    },
  }
}

// 13 · z-index: the letters pile onto each other and keep fighting over who's in front
function zindex(): Hover {
  let next = 0
  return {
    name: 'zindex',
    title: 'z-index',
    enter() {
      for (const l of letters) l.z = l.i
    },
    exit() {
      for (const l of letters) l.z = l.i
    },
    update(dt) {
      next -= dt
      if (next > 0) return
      next = rnd(0.18, 0.4)
      let j = 0
      let best = Infinity
      for (const l of letters) {
        const d = dist(l.center())
        if (d < best) {
          best = d
          j = l.i
        }
      }
      const k = clamp(j + (Math.random() < 0.5 ? -1 : 1), 0, letters.length - 1)
      if (k === j) return
      const a = letters[j]
      const b = letters[k]
      ;[a.z, b.z] = [b.z, a.z]
      ;(a.z > b.z ? a : b).pop = 0.5
    },
    gap: (i) => (i > 0 ? -0.36 * letters[i - 1].sprite().adv * letters[i - 1].s : 0),
    order: () => [...letters].sort((a, b) => a.z - b.z),
    over() {
      const top = Math.max(...letters.map((l) => l.z))
      for (const l of letters) {
        const sp = l.sprite()
        label(`z-index: ${l.z}`, l.hx + (sp.adv * l.s) / 2, l.hy + l.oy - sp.asc * l.s - 14, l.z === top ? ORANGE : INK, l.z === top ? 1 : 0.45, 10)
      }
    },
  }
}

// 14 · float: 0.1 + 0.2 — a rounding error that grows the longer you stay
function float(): Hover {
  let T = 0
  const n = letters.map(() => ({ x: 0, y: 0, gx: 0, gy: 0, t: 0 }))
  let err = 0
  return {
    name: 'float',
    title: '0.1 + 0.2',
    enter() {
      T = 0
    },
    update(dt) {
      T += dt
      err = Math.min(0.5 * S, 1e-7 * 10 ** (T * 2.2))
      for (const l of letters) {
        const s = n[l.i]
        s.t -= dt
        if (s.t <= 0) {
          s.t = rnd(0.2, 0.6)
          s.gx = rnd(-1, 1)
          s.gy = rnd(-1, 1)
        }
        s.x += (s.gx - s.x) * ease(dt, 4)
        s.y += (s.gy - s.y) * ease(dt, 4)
        l.tx = s.x * err
        l.ty = s.y * err
        l.rotT = (s.x * err) / S
        l.k = 300
        l.c = 30
      }
    },
    over() {
      label('0.1 + 0.2 = 0.30000000000000004', W / 2, H - 82, INK, 0.6, 13)
      label(`accumulated error: ${err < 1e-3 ? err.toExponential(2) : err.toFixed(3)} px`, W / 2, H - 60, ORANGE, 1, 12)
    },
  }
}

// 15 · grid: the letters dodge the cursor, but only in whole cells of a CSS grid
function grid(): Hover {
  const cell = () => 0.3 * S
  return {
    name: 'grid',
    title: 'grid',
    update() {
      const c = cell()
      for (const l of letters) {
        const p = push(l, 1.0 * S, 1.3 * S)
        l.tx = Math.round(p.x / c) * c
        l.ty = Math.round(p.y / c) * c
        l.k = 700
        l.c = 53
      }
    },
    under() {
      const c = cell()
      const ox = letters[0].hx
      ctx.strokeStyle = INK
      ctx.globalAlpha = 0.13
      ctx.lineWidth = 1
      ctx.setLineDash([3, 4])
      ctx.beginPath()
      for (let x = ox - Math.ceil(ox / c) * c; x < W; x += c) {
        ctx.moveTo(x, 0)
        ctx.lineTo(x, H)
      }
      for (let y = BASE - Math.ceil(BASE / c) * c; y < H; y += c) {
        ctx.moveTo(0, y)
        ctx.lineTo(W, y)
      }
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1
    },
    over() {
      const c = cell()
      for (const l of letters) {
        const col = Math.round(l.tx / c)
        const row = Math.round(l.ty / c)
        if (!col && !row) continue
        const sp = l.sprite()
        label(`grid-area: ${row > 0 ? '+' : ''}${row} / ${col > 0 ? '+' : ''}${col}`, l.hx + l.ox + (sp.adv * l.s) / 2, l.hy + l.oy - sp.asc * l.s - 12, ORANGE, 1, 10)
      }
    },
  }
}

export const SET_A: Record<string, () => Hover> = { inspect, easings, charcode, gravity, string, fout, breakpoint, flee, wave, orbit, kerning, zindex, float, grid }
let PIN = Q.get('hover')
const SWITCH = Number(Q.get('troca')) || 3.5
type Letras = 'hover' | 'sempre' | 'off'
let LETRAS = (Q.get('letras') ?? 'hover') as Letras

// ---- the loop ---------------------------------------------------------------------------------
let ALL: Record<string, () => Hover> = SET_A
let CORNER = false
let MAIN_SIZE = false
/** the real hero this lab lives in (/hero-hovers-cubos.html): its cubes, paper, cookies and "We are";
 *  the lab only moves the letters, sized and placed by the hero's own sign */
export interface LabHero {
  labFrame: { S: number; base: number; left: number; frontZ: number; weLeft: number; weBase: number; we: { x: number; y: number; z: number; k: number } | null } | null
  setPaper(c: HTMLCanvasElement): void
  labWordMeshes(): import('three').Mesh[]
  labLeaves(): { L: import('three').Group; R: import('three').Group; vw: number; vh: number }
  labDoorsShut: boolean
  labRoots: THREE_Object3D[]
  beforeDoorRender?: () => void
  afterDoorRender?: () => void
  setWordVisible(v: boolean): void
  labHost(): GizHost
}
type THREE_Object3D = import('three').Object3D
let HERO: LabHero | null = null
let paperCv: HTMLCanvasElement | null = null
/** (in the hero) the lab's paper — the same fill and grain it draws on its own page — handed to the
 *  hero as its ground, so the cubes' faces are this paper */
function paintPaper(): void {
  paperCv ??= document.createElement('canvas')
  paperCv.width = cv.width
  paperCv.height = cv.height
  const g = paperCv.getContext('2d')!
  g.setTransform(DPR, 0, 0, DPR, 0, 0)
  g.fillStyle = PAPER
  g.fillRect(0, 0, W, H)
  g.fillStyle = GRAIN
  g.fillRect(0, 0, W, H)
  HERO!.setPaper(paperCv)
}
let LEFT = NaN // the hero's pen origin for the word (px), when embedded // the sign at the main hero's size (instead of 72% of the width)
const THREE_DEG25 = (25 * Math.PI) / 180 // half the door camera's field of view
let PICKER = false
// the main hero's chalk sign over the 2D canvas (GizSign.ts): "GENERIC." while at rest, "We are" always
let giz: GizSign | null = null
let resting = true
let GLSB = 0 // the G's left side bearing at S, px (where "We are" lines up, as on the main hero)
let mode: Hover | null = null
let modeT = 0
let last = ''
let hovered = false
let away = 0

function nextMode(): Hover {
  if (PIN && ALL[PIN]) return ALL[PIN]()
  const names = Object.keys(ALL).filter((n) => n !== last)
  last = pick(names)
  return ALL[last]()
}
function setMode(h: Hover | null): void {
  mode?.exit?.()
  mode = h
  modeT = 0
  mode?.enter?.()
}

/** every letter back home in the home style, nothing moving: the chalk sign can take over */
function atRest(): boolean {
  for (const l of letters) {
    if (!isHome(l.style) || l.free || l.kin || l.show !== null || l.showFace || l.tofu || l.fat || l.flip) return false
    if (Math.abs(l.ox) > 0.6 || Math.abs(l.oy) > 0.6 || Math.abs(l.rot) > 0.004 || Math.abs(l.s - 1) > 0.004 || Math.abs(l.g) > 0.6 || l.pop > 0.02) return false
  }
  return true
}

function overSign(): boolean {
  if (!m.on) return false
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (const l of letters) {
    const sp = l.sprite()
    x0 = Math.min(x0, l.hx)
    x1 = Math.max(x1, l.hx + sp.adv * l.s)
    y0 = Math.min(y0, l.hy - sp.asc * l.s)
    y1 = Math.max(y1, l.hy + sp.desc * l.s)
    if (dist(l.center()) < 0.6 * S) return true
  }
  const pad = 0.18 * S
  return m.x > x0 - pad && m.x < x1 + pad && m.y > y0 - pad && m.y < y1 + pad
}

function lineLayout(): Spot[] {
  let total = 0
  for (const l of letters) total += l.g + l.sprite().adv * l.s
  let x = W / 2 - total / 2
  if (!Number.isNaN(LEFT)) {
    // embedded: the hero's own pen origin at rest, the word kept centred on it as it grows
    let nat = 0
    for (const l of letters) nat += bake(l.ch.toUpperCase(), '700', 'Tinos', Math.round(S)).adv
    x = LEFT + (nat - total) / 2
  }
  return letters.map((l) => {
    x += l.g
    const spot = { x, y: BASE, s: 1 }
    x += l.sprite().adv * l.s
    return spot
  })
}

function resize(): void {
  W = innerWidth
  H = innerHeight
  cv.width = Math.round(W * DPR)
  cv.height = Math.round(H * DPR)
  meas.font = `700 100px Tinos`
  const w1 = meas.measureText('GENERIC.').width / 100
  S = Math.min((W * 0.72) / w1, H * 0.3)
  if (MAIN_SIZE) {
    // the main hero's size: "GENERIC."'s ink spans 82% (92% under 700 px) of the door camera's view
    // at the panel, and its front faces sit a letter's depth nearer the camera than that
    meas.font = `700 100px Tinos`
    const mt = meas.measureText('GENERIC.')
    const inkEm = (mt.actualBoundingBoxLeft + mt.actualBoundingBoxRight) / 100
    const vh = 2 * 4 * Math.tan(THREE_DEG25)
    const emWorld = (vh * (W / H) * (W < 700 ? 0.92 : 0.82)) / inkEm
    const front = 0.015 + (emWorld / 1.3889) * 0.17
    S = ((emWorld * 4) / (4 - front)) * (H / vh)
  }
  BASE = H * 0.5 + S * 0.32
  cache.clear()
  meas.font = `700 ${S}px Tinos`
  GLSB = -meas.measureText('G').actualBoundingBoxLeft
  giz?.resize(W, H, S)
  if (HERO) paintPaper()
  if (overCv) {
    overCv.width = cv.width
    overCv.height = cv.height
  }
  g3?.resize(W, H)
}

function restyleLetters(dt: number): void {
  if (LETRAS === 'off') return
  const rate = LETRAS === 'sempre' ? (hovered ? 0.9 : 0.22) : hovered ? 0.9 : 0
  for (const l of letters) {
    if (rate && Math.random() < rate * dt) l.restyle(randomStyle())
    else if (LETRAS === 'hover' && !hovered && !isHome(l.style) && Math.random() < 2.5 * dt) l.restyle({ ...HOME })
  }
}

/** embedded: the lab follows the hero — its sign's size and place, and the doors (moving = the lab
 *  lets go: every letter snapped home, the hero's own sign back) */
function followHero(): boolean {
  if (!HERO) return true
  const f = HERO.labFrame
  if (f && (f.S !== S || f.base !== BASE || f.left !== LEFT)) {
    S = f.S
    BASE = f.base
    LEFT = f.left
    cache.clear()
    meas.font = `700 ${S}px Tinos`
    GLSB = -meas.measureText('G').actualBoundingBoxLeft
    g3?.setFrontZ(f.frontZ)
    g3?.resize(W, H)
    for (const l of letters) l.placed = false
  }
  if (g3 && f) {
    // (cheap, and the hero rebuilds its sign on resize) its sign in the lab's look, the walls on its
    // leaves, "We are" where its own stands
    const wm = HERO.labWordMeshes()
    g3.adopt(wm, wm.slice(2)) // (after the two halves of "GENERIC.": "We are", never cut)
    const lv = HERO.labLeaves()
    g3.setLeaves(lv.L, lv.R, lv.vw, lv.vh)
    g3.setWe(f.we)
  }
  const shut = HERO.labDoorsShut && !!f && !!g3?.ready
  if (!shut) {
    if (mode) setMode(null)
    hovered = false
    for (const l of letters) {
      l.style = { ...HOME }
      l.ox = l.oy = l.vx = l.vy = l.rot = l.rv = l.g = l.pop = 0
      l.s = 1
      l.free = l.kin = l.tofu = l.flip = false
      l.show = null
      l.showFace = null
      l.fat = 0
    }
  }
  if (g3) g3.root.visible = shut
  HERO.setWordVisible(!shut)
  cv.style.visibility = shut ? 'visible' : 'hidden' // (the overlays and the test label go with the lab)
  return shut
}

function frame(dt: number): void {
  time += dt
  const live = followHero()
  // cursor velocity
  if (m.on) {
    const rvx = (m.x - m.px) / dt
    const rvy = (m.y - m.py) / dt
    m.vx += (rvx - m.vx) * 0.35
    m.vy += (rvy - m.vy) * 0.35
  } else {
    m.vx = m.vy = 0
  }
  m.speed = Math.hypot(m.vx, m.vy)
  m.px = m.x
  m.py = m.y

  const over = live && overSign()
  if (over) {
    away = 0
    if (!hovered) {
      hovered = true
      setMode(nextMode())
    }
  } else if (hovered) {
    away += dt
    if (away > 0.35) {
      hovered = false
      setMode(null)
    }
  }
  if (hovered && !PIN) {
    modeT += dt
    if (modeT > SWITCH) setMode(nextMode())
  }
  restyleLetters(dt)

  for (const l of letters) {
    l.tx = l.ty = l.rotT = 0
    l.modeS = 1
    l.fx = {}
    l.k = 170
    l.c = 15
  }
  mode?.update(dt)

  // layout: gaps, then homes
  const gr = mode?.gapRate ?? 10
  for (const l of letters) l.g += ((mode?.gap?.(l.i) ?? 0) - l.g) * ease(dt, gr)
  const spots = mode?.layout?.() ?? lineLayout()
  for (const l of letters) {
    const sp = spots[l.i]
    if (!l.placed) {
      l.hx = sp.x
      l.hy = sp.y
      l.placed = true
    }
    l.hx += (sp.x - l.hx) * ease(dt, 12)
    l.hy += (sp.y - l.hy) * ease(dt, 12)
    l.layS = sp.s
    l.s += (l.layS * l.modeS - l.s) * ease(dt, 12)
    if (l.modeS < 1) l.s = Math.min(l.s, l.layS * l.modeS) // a longer text shrinks at once, no giant frame
    l.pop *= 1 - ease(dt, 9)
    if (l.free || l.kin) continue
    // in steps of at most 1/240 s: a stiff spring (the grid's) stepped a whole slow frame at once
    // overshoots further each frame and throws the letter off the screen
    const n = Math.ceil(dt * 240)
    const h = dt / n
    for (let k = 0; k < n; k++) {
      l.vx += (l.k * (l.tx - l.ox) - l.c * l.vx) * h
      l.vy += (l.k * (l.ty - l.oy) - l.c * l.vy) * h
      l.rv += (l.k * (l.rotT - l.rot) - l.c * l.rv) * h
      l.ox += l.vx * h
      l.oy += l.vy * h
      l.rot += l.rv * h
    }
  }
  placeWeAre(dt)
  resting = !hovered && (resting || atRest())
  draw()
  if (giz) giz.render(dt, letters.map((l) => ({ x: l.hx, y: l.hy })), resting, { x: weX(), y: weY })
  if (g3)
    g3.render(
      dt,
      letters.map((l) => {
        const sp = l.sprite()
        return { font: fontKey(l.style.f, l.style.w, l.style.it), text: l.text(), px: l.px(), cx: l.hx + l.ox + (sp.adv * l.s) / 2, cy: l.hy + l.oy - (sp.asc * l.s) / 2, adv: sp.adv, asc: sp.asc, rot: l.rot, scale: l.s * (1 + 0.14 * l.pop), fx: l.fx }
      }),
      HERO?.labFrame?.we ? { x: weX() - weRest().x, y: weY - weRest().y, S } : { x: weX(), y: weY, S },
    )
}

/** ctx.save() + the letter's transform; the origin lands on the glyph's baseline-left. Restore after */
export function beginLetter(l: Letter, sp = l.sprite()): Sprite {
  const s = l.s * (1 + 0.14 * l.pop)
  ctx.save()
  ctx.translate(l.hx + l.ox + (sp.adv * l.s) / 2, l.hy + l.oy - (sp.asc * l.s) / 2)
  ctx.rotate(l.rot)
  ctx.scale(s, s)
  ctx.translate(-sp.adv / 2, sp.asc / 2)
  return sp
}
/** a screen point in the letter's own space (baseline-left origin, sprite px) */
export function toLocal(l: Letter, x: number, y: number, sp = l.sprite()): { x: number; y: number } {
  const s = l.s * (1 + 0.14 * l.pop)
  const dx = x - (l.hx + l.ox + (sp.adv * l.s) / 2)
  const dy = y - (l.hy + l.oy - (sp.asc * l.s) / 2)
  const c = Math.cos(-l.rot)
  const n = Math.sin(-l.rot)
  return { x: (dx * c - dy * n) / s + sp.adv / 2, y: (dx * n + dy * c) / s - sp.asc / 2 }
}
/** a point in the letter's own space (baseline-left origin, sprite px) back on screen */
export function toScreen(l: Letter, x: number, y: number, sp = l.sprite()): { x: number; y: number } {
  const s = l.s * (1 + 0.14 * l.pop)
  const lx = (x - sp.adv / 2) * s
  const ly = (y + sp.asc / 2) * s
  const c = Math.cos(l.rot)
  const n = Math.sin(l.rot)
  return { x: l.hx + l.ox + (sp.adv * l.s) / 2 + lx * c - ly * n, y: l.hy + l.oy - (sp.asc * l.s) / 2 + lx * n + ly * c }
}
export function drawSprite(sp: Sprite): void {
  ctx.drawImage(sp.cv, -sp.ox, -sp.oy, sp.w, sp.h)
}
function drawLetter(l: Letter): void {
  if (mode?.paint?.(l)) return
  const sp = beginLetter(l)
  drawSprite(sp)
  ctx.restore()
}

let weY = NaN
/** where weX()/weY sit with every letter home (embedded: the hero's "We are" is there; the lab moves it
 *  by how far its own placement has gone from this, as on its own page) */
function weRest(): { x: number; y: number } {
  let asc = 0
  for (const l of letters.slice(0, 4)) asc = Math.max(asc, bake(l.ch.toUpperCase(), '700', 'Tinos', Math.round(S)).asc)
  return { x: LEFT + GLSB + 0.03 * 0.72 * S, y: BASE - asc - 0.16 * 0.72 * S }
}
const weX = () => letters[0].hx + GLSB + 0.03 * 0.72 * S
function placeWeAre(dt: number): void {
  let top = Infinity
  for (const l of letters.slice(0, 4)) top = Math.min(top, l.hy - l.ink().asc * l.s)
  const y = top - (giz || g3 ? 0.16 * 0.72 : 0.14) * S // the main hero: 0.16 of its TextGeometry size (0.72 em)
  weY = Number.isNaN(weY) ? y : weY + (y - weY) * ease(dt, 8)
}

function draw(): void {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
  ctx.globalAlpha = 1
  if (HERO) ctx.clearRect(0, 0, W, H) // the hero's paper is underneath
  else {
    ctx.fillStyle = PAPER
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = GRAIN
    ctx.fillRect(0, 0, W, H)
  }
  // "We are", over the G, riding above the tallest of the first letters
  const g = letters[0]
  const chalk = !!giz?.ready || !!g3
  if (!chalk && !HERO) {
    const we = bake('We are', '400', 'Tinos', Math.round(S * 0.3))
    ctx.drawImage(we.cv, g.hx - we.ox + 0.04 * S, weY - we.oy, we.w, we.h)
  }
  mode?.under?.()
  if (g3) {
    if (ctxOver) {
      // the 3D letters sit between the paper (under) and this layer (over)
      ctx = ctxOver
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, overCv!.width, overCv!.height)
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
    }
  } else if (!(chalk && resting)) for (const l of mode?.order?.() ?? letters) drawLetter(l)
  mode?.over?.()
  // what's on (test): the hover's name top right on the second set, bottom left on the first
  if (CORNER && mode) label(mode.title ?? mode.name, W - 28, 34, INK, 0.75, 14, 'right')
  if (PICKER || HERO) return // (no test label inside the hero)
  if (CORNER) label(`letters: ${LETRAS === 'sempre' ? 'all the time' : LETRAS === 'off' ? 'off' : 'while hovered'}`, 18, H - 22, INK, 0.5, 12, 'left')
  else label(`hover: ${mode?.name ?? '—'}${PIN ? ' (pinned)' : ''}   ·   letters: ${LETRAS === 'sempre' ? 'all the time' : LETRAS === 'off' ? 'off' : 'while hovered'}`, 18, H - 22, INK, 0.5, 12, 'left')
  ctx = ctxUnder
}

/** a list on the right to pick the hover (and how the letters behave) instead of the random switching */
function mountPicker(): void {
  const css = 'font:500 12px/1.2 "IBM Plex Mono",Consolas,monospace;letter-spacing:.02em;text-align:left;padding:4px 9px;border:1px solid rgba(18,18,18,.25);background:rgba(239,238,231,.92);color:#121212;cursor:pointer'
  const box = document.createElement('div')
  box.setAttribute('style', 'position:fixed;top:14px;right:14px;z-index:10;display:flex;flex-direction:column;gap:2px;max-height:calc(100vh - 28px);overflow:auto')
  const all: [HTMLButtonElement, () => boolean][] = []
  const paint = () => {
    for (const [b, on] of all) {
      const v = on()
      b.style.background = v ? '#121212' : 'rgba(239,238,231,.92)'
      b.style.color = v ? '#ff9a4d' : '#121212'
    }
  }
  const add = (text: string, on: () => boolean, act: () => void) => {
    const b = document.createElement('button')
    b.setAttribute('style', css)
    b.textContent = text
    b.addEventListener('click', () => {
      act()
      paint()
    })
    all.push([b, on])
    box.appendChild(b)
  }
  const head = (text: string) => {
    const h = document.createElement('div')
    h.setAttribute('style', 'font:500 10px/1 "IBM Plex Mono",Consolas,monospace;letter-spacing:.12em;text-transform:uppercase;opacity:.5;margin:8px 0 2px')
    h.textContent = text
    box.appendChild(h)
  }
  head('hover')
  for (const [name, make] of Object.entries(ALL)) {
    add(make().title ?? name, () => PIN === name, () => {
      PIN = name
      if (mode) setMode(nextMode())
    })
  }
  head('letras')
  for (const [v, t] of [['hover', 'só no hover'], ['sempre', 'o tempo todo'], ['off', 'desligado']] as [Letras, string][]) add(t, () => LETRAS === v, () => (LETRAS = v))
  head('cor')
  for (const [v, t] of [['off', 'sem cor'], ['bootstrap', 'bootstrap'], ['css', 'css named colors']] as [Cor, string][])
    add(t, () => COR === v, () => {
      COR = v
      // the letters already in a colour take one from the new palette (or lose it)
      for (const l of letters) if (l.style.col) l.restyle({ ...l.style, col: v === 'off' ? null : pick(PALETTES[v]) })
    })
  head('acabamento')
  for (const [v, t] of [['cheio', 'preenchido'], ['lapis', 'lápis colorido']] as [Look, string][]) add(t, () => LOOK === v, () => (LOOK = v))
  document.body.appendChild(box)
  paint()
}

/** run the lab with one set of hovers. `corner`: the hover's name top right; `picker`: choose the
 *  hover from a list (no random switching) */
export async function startHoverLab(set: Record<string, () => Hover>, opts: { corner?: boolean; picker?: boolean; giz?: boolean; giz3d?: boolean; mainSize?: boolean; hero?: LabHero } = {}): Promise<void> {
  ALL = set
  MAIN_SIZE = !!opts.mainSize
  if (opts.hero) {
    HERO = opts.hero
    cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:2;background:transparent'
    g3 = new GizLetters(HERO.labHost(), DPR)
    const g = g3
    HERO.beforeDoorRender = () => g.beforeRender()
    HERO.afterDoorRender = () => g.afterRender()
    faceOk = (f, w, it) => g.has(fontKey(f, w, it))
    void g.load(FACES)
  }
  if (opts.giz3d) {
    const layer = (z: number) => {
      const c = document.createElement('canvas')
      c.setAttribute('style', `position:fixed;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:${z}`)
      return c
    }
    const gl = layer(1)
    overCv = layer(2)
    cv.after(gl, overCv)
    ctxOver = overCv.getContext('2d')!
    g3 = new GizLetters(gl, DPR)
    const g = g3
    faceOk = (f, w, it) => g.has(fontKey(f, w, it))
    void g3.load(FACES)
  }
  if (opts.giz && Q.get('giz') !== 'off') {
    const c = document.createElement('canvas')
    c.setAttribute('style', 'position:fixed;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:1')
    cv.after(c)
    giz = new GizSign(c, DPR)
    void giz.load()
  }
  CORNER = !!opts.corner
  PICKER = !!opts.picker
  if (PICKER) {
    if (!PIN || !ALL[PIN]) PIN = Object.keys(ALL)[0]
    mountPicker()
  }
  const loads: Promise<unknown>[] = [document.fonts.load(`400 20px ${MONO}`)]
  for (const f of FACES) for (const w of f.weights) for (const it of f.italic ? ['', 'italic '] : ['']) loads.push(document.fonts.load(`${it}${w} 40px "${f.fam}"`))
  await Promise.race([Promise.allSettled(loads), new Promise((r) => setTimeout(r, 4000))])
  HATCH = hatchPattern()
  GRAIN = grainPattern()
  resize()
  addEventListener('resize', resize)
  let prev = performance.now()
  const tick = (now: number) => {
    const dt = Math.min(1 / 30, Math.max(1e-3, (now - prev) / 1000))
    prev = now
    frame(dt)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  if (Q.has('hoverdebug')) (window as unknown as { __hov: unknown }).__hov = { letters, get mode() { return mode?.name }, S: () => S, BASE: () => BASE }
}

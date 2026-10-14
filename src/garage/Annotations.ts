import * as THREE from 'three'

/**
 * garage-focus: once the room has emptied around the man, the scroll brings in annotations —
 * his "team", which is him — one at a time: a line of chalk text written out in the dark above
 * him, a chalk arrow that leaves the text and stops short of him, a small tick where it lands.
 *
 * Drawn INTO the scene, not over it: a 2D canvas (chalk strokes, grain, the room's 8 Hz line
 * boil) composited by the post chain after its blur passes — sharp, but still under the room's
 * vignette and chromatic fringe.
 *
 * Each note plays out on its own clock (write, draw, land) once the scroll has reached it, and
 * unwinds when the scroll leaves; only one note is ever on screen.
 *
 * PLACEHOLDER texts (Danilo writes the real ones).
 */

export type Spot = 'head' | 'shoulderL' | 'shoulderR' | 'chest'
type Stroke = 'arc' | 'elbow' | 'loop'

interface Note {
  title: string
  sub: string
  col: 0 | 1 | 2 // left / right / centred above him
  to: Spot | null // null: an arrow that goes looking for someone, finds nobody, and is wiped
  stroke: Stroke
}

// left, right, left, right... at one height — the same frame every time, so the joke (they're
// all him) reads (col 2 — centred above his head — is there if one ever needs to break it)
const NOTES: Note[] = [
  { title: 'CEO', sub: 'this guy.', col: 0, to: 'head', stroke: 'arc' },
  { title: 'CTO', sub: 'also this guy.', col: 1, to: 'head', stroke: 'arc' },
  { title: 'Lead Designer', sub: 'same guy, different chair.', col: 0, to: 'head', stroke: 'arc' },
  { title: 'Head of Sales', sub: 'him, after coffee.', col: 1, to: 'head', stroke: 'arc' },
  { title: 'Intern', sub: 'him, before coffee.', col: 0, to: 'head', stroke: 'arc' },
  { title: 'Head of HR', sub: 'there is no HR.', col: 1, to: null, stroke: 'arc' },
]

/** each note's stretch of scroll, in screens */
export const NOTE_EVERY = 1.4

// layout grid (fractions of the viewport) — near the centre: the post blurs the edges hard
const COL_X = [0.3, 0.58]
const ROW_Y = 0.24 // the one height for the left/right notes
const CENTRE_Y = 0.13 // HR's, above his head
const MIN_CLEAR = 0.16
const SAFE_X = 0.17 // text stays within this margin of the frame's sides // text keeps at least this far from him, sideways (of the viewport width)
const TITLE_PX = 66
const SUB_PX = 30 // the punchline: it has to read

// a note's own clock, in s
// title, then the arrow, then — once it has landed — the subtitle: the punchline comes last
const T_TITLE = [0, 0.5]
const T_ARROW = [0.45, 1.15]
const T_LAND = [1.15, 1.4]
const T_SUB = [1.35, 1.8]
const T_END = 1.8
// HR: the arrow sets off, hesitates, is rubbed out — and only then "there is no HR."
const LOST = { out: [0.45, 1.05], hold: 1.75, wipe: [1.75, 2.35], sub: [2.35, 2.8], end: 2.8 }
const FADE_OUT = 0.45 // s for a note to fade away when the scroll moves on

// (scroll mode) each role's place: across, from his head (of the screen width), and the uneven
// distances between them (of the screen height)
const SCROLL_X = [-0.2, 0.17, 0.02, 0.24, -0.27, 0.09]
const SCROLL_GAPS = [0.72, 0.9, 0.62, 1.0, 0.8]
const ARROW_GAP = 80 // px between the arrow's tip and him
const CHALK = '#efeee7'

export class Annotations {
  readonly count = NOTES.length
  private cnv = document.createElement('canvas')
  private ctx = this.cnv.getContext('2d')!
  readonly tex: THREE.CanvasTexture
  /** shown on screen (the post chain composites `texture` when true) */
  visible = false
  private glow = document.createElement('canvas')
  private grain: CanvasPattern
  private clocks = NOTES.map(() => 0)
  private cur = -1 // the note on stage (-1 none yet; count = all done)
  private leaving = false
  private fade = 1 // the current note's opacity while it leaves
  private seed = 0
  private seedT = 0
  private v = new THREE.Vector3()
  private ready = false

  constructor() {
    this.tex = new THREE.CanvasTexture(this.cnv)
    this.tex.colorSpace = THREE.NoColorSpace // the room's shaders write raw values too
    this.tex.minFilter = THREE.LinearFilter
    this.tex.generateMipmaps = false

    // chalk grain: a noise tile that eats into the strokes (and the type)
    const g = document.createElement('canvas')
    g.width = g.height = 128
    const gx = g.getContext('2d')!
    const img = gx.createImageData(128, 128)
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i + 3] = Math.random() < 0.22 ? 120 + Math.random() * 135 : 0
    }
    gx.putImageData(img, 0, 0)
    this.grain = this.ctx.createPattern(g, 'repeat')!

    // one family: Tinos (the sign's), italic for both lines
    const face = new FontFace('TinosNote', `url(${import.meta.env.BASE_URL}fonts/Tinos-Italic.ttf)`, { style: 'italic' })
    void face.load().then((f) => {
      document.fonts.add(f)
      this.ready = true
    })
  }

  /** TEST (/garage-roles-column.html): instead of one note at a time (written out, an arrow, faded),
   *  the roles are a column of text that the scroll carries up the screen like a page — passing
   *  BEHIND him (Garage masks the layer with the set's silhouette) */
  scrollMode = false

  /** (scroll mode) 'scattered' — each role at its own place, arrows drawn in and out (tried 2026-10-14, dropped);
   *  'column' — the first version: one centred column, evenly spaced, no arrows (/garage-roles-column) */
  scrollStyle: 'scattered' | 'column' = 'scattered'

  private drawScroll(s: number, start: number, camera: THREE.Camera, spots: Record<Spot, THREE.Vector3>): void {
    const W = window.innerWidth
    const H = window.innerHeight
    const dpr = Math.min(window.devicePixelRatio, 1.5)
    if (this.cnv.width !== Math.round(W * dpr) || this.cnv.height !== Math.round(H * dpr)) {
      this.cnv.width = Math.round(W * dpr)
      this.cnv.height = Math.round(H * dpr)
      this.tex.dispose()
    }
    const toScreen = (p: THREE.Vector3) => {
      this.v.copy(p).project(camera)
      return new THREE.Vector2((this.v.x * 0.5 + 0.5) * W, (-this.v.y * 0.5 + 0.5) * H)
    }
    const headPt = toScreen(spots.head)
    // the page: a screen of scroll moves it a screen; each role sits at its own place on it — off
    // the line, not a column (some cross him, some pass beside him), at uneven distances
    const travel = (s - start) * H
    const column = this.scrollStyle === 'column'
    const c = this.ctx
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.clearRect(0, 0, this.cnv.width, this.cnv.height)
    c.setTransform(dpr, 0, 0, dpr, 0, 0)
    c.fillStyle = CHALK
    c.textBaseline = 'alphabetic'
    let any = false
    let along = 0
    NOTES.forEach((n, i) => {
      along += i === 0 ? 0 : (column ? NOTE_EVERY * 0.62 : SCROLL_GAPS[(i - 1) % SCROLL_GAPS.length]) * H
      // where it is now: entering from the bottom and going up
      const y = H * 1.08 + along - travel
      if (y < -H * 0.2 || y > H * 1.2) return
      any = true
      const titlePx = TITLE_PX * 1.25
      const subPx = SUB_PX * 1.2
      c.font = `italic 400 ${titlePx}px TinosNote`
      const tw = c.measureText(n.title).width
      c.font = `italic 400 ${subPx}px TinosNote`
      const sw = c.measureText(n.sub).width
      const bw = Math.max(tw, sw)
      const cx = column ? headPt.x : THREE.MathUtils.clamp(headPt.x + SCROLL_X[i % SCROLL_X.length] * W, SAFE_X * W + bw / 2, (1 - SAFE_X) * W - bw / 2)
      c.globalAlpha = 1
      c.textAlign = 'center'
      c.font = `italic 400 ${titlePx}px TinosNote`
      c.fillText(n.title, cx + this.j(1) * 0.4, y + this.j(2) * 0.4)
      c.globalAlpha = 0.88
      c.font = `italic 400 ${subPx}px TinosNote`
      c.fillText(n.sub, cx + this.j(3) * 0.4, y + subPx * 2.2 + this.j(4) * 0.4)
      c.textAlign = 'left'
      // the arrow: drawn out as the role comes into the middle band of the screen, held there,
      // wiped as it leaves — from the side of the text facing him
      const k = 1 - Math.abs(y / H - 0.42) / 0.3 // 1 in the middle, 0 at the band's edges
      const drawn = THREE.MathUtils.clamp(k * 1.6, 0, 1)
      if (drawn <= 0 || column) return
      const left = cx < headPt.x
      const target = n.to ? toScreen(spots[n.to]) : headPt.clone().add(new THREE.Vector2(left ? -0.17 * W : 0.17 * W, 0.02 * H))
      const tail = Math.abs(cx - headPt.x) < bw * 0.6
        ? new THREE.Vector2(cx, y + (y < headPt.y ? subPx * 2.8 : -titlePx)) // above/below him: from under/over the text
        : new THREE.Vector2(left ? cx + bw / 2 + 18 : cx - bw / 2 - 18, y - titlePx * 0.3)
      const dir = target.clone().sub(tail)
      const tip = target.clone().sub(dir.clone().multiplyScalar(ARROW_GAP / Math.max(dir.length(), 1)))
      const path = this.path(n.stroke, tail, tip, i, target)
      c.globalAlpha = 1
      this.chalkLine(path, n.to ? drawn : drawn * 0.28)
      if (n.to && drawn >= 1) {
        const a = path[path.length - 1]
        const u = target.clone().sub(a).normalize()
        const nrm = new THREE.Vector2(-u.y, u.x)
        const hl = 20
        this.chalkLine([a.clone().addScaledVector(u, -hl).addScaledVector(nrm, hl * 0.55), a], 1)
        this.chalkLine([a.clone().addScaledVector(u, -hl).addScaledVector(nrm, -hl * 0.55), a], 1)
      }
    })
    this.visible = any && this.ready
    this.tex.needsUpdate = true
  }

  update(dt: number, s: number, start: number, camera: THREE.PerspectiveCamera, spots: Record<Spot, THREE.Vector3>): void {
    if (this.scrollMode) {
      this.seedT += dt
      if (this.seedT > 0.125) {
        this.seedT = 0
        this.seed = Math.random() * 1000
      }
      this.drawScroll(s, start, camera, spots)
      return
    }
    // which note the scroll is on (-1 before the first, count after the last)
    const pos = (s - start) / NOTE_EVERY
    const want = pos < 0.06 ? -1 : Math.min(Math.floor(pos), NOTES.length)
    // they play strictly in order, one at a time — a fast scroll never skips one: the current
    // note plays through (faster while it's behind), unwinds, and only then the next comes
    if (this.cur < 0 && want >= 0) this.cur = 0
    if (this.cur >= NOTES.length && want < NOTES.length) this.cur = NOTES.length - 1
    const i = this.cur
    if (i >= 0 && i < NOTES.length) {
      const end = NOTES[i].to ? T_END : LOST.end
      const rate = Math.abs(want - i) > 1 ? 2.2 : 1 // catching up
      if (want === i) {
        // on it: play (and if it had started to leave, come back)
        this.clocks[i] = Math.min(end, this.clocks[i] + dt)
        if (this.leaving) {
          this.fade = Math.min(1, this.fade + dt / FADE_OUT)
          if (this.fade === 1) this.leaving = false
        }
      } else if (!this.leaving && this.clocks[i] < end) {
        // the scroll is past it (either way): it still plays out in full before it goes — so
        // none is ever skipped, going down or back up
        this.clocks[i] = Math.min(end, this.clocks[i] + dt * rate)
      } else {
        // leaving: the whole note fades as it stands (never played backwards), then the next
        // one in the scroll's direction — always the neighbour, so none is ever jumped over
        this.leaving = true
        this.fade = Math.max(0, this.fade - (dt * rate) / FADE_OUT)
        if (this.fade === 0) {
          this.leaving = false
          this.fade = 1
          this.clocks[i] = 0
          this.cur += want > i ? 1 : -1
        }
      }
    }

    // boil: a new hand-shake 8x a second, like the room's lines
    this.seedT += dt
    if (this.seedT > 0.125) {
      this.seedT = 0
      this.seed = Math.random() * 1000
    }
    this.draw(camera, spots)
  }

  private draw(camera: THREE.Camera, spots: Record<Spot, THREE.Vector3>): void {
    const W = window.innerWidth
    const H = window.innerHeight
    const dpr = Math.min(window.devicePixelRatio, 1.5)
    const i = this.clocks.findIndex((t) => t > 0)
    this.visible = i >= 0 && this.ready
    if (!this.visible) return
    if (this.cnv.width !== Math.round(W * dpr) || this.cnv.height !== Math.round(H * dpr)) {
      this.cnv.width = Math.round(W * dpr)
      this.cnv.height = Math.round(H * dpr)
      this.tex.dispose()
    }
    const c = this.ctx
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.clearRect(0, 0, this.cnv.width, this.cnv.height)
    c.setTransform(dpr, 0, 0, dpr, 0, 0)
    const n = NOTES[i]
    const t = this.clocks[i]
    c.globalAlpha = i === this.cur ? this.fade : 1
    const ph = (r: number[]) => THREE.MathUtils.clamp((t - r[0]) / (r[1] - r[0]), 0, 1)
    const ease = (x: number) => x * x * (3 - 2 * x)

    const toScreen = (p: THREE.Vector3) => {
      this.v.copy(p).project(camera)
      return new THREE.Vector2((this.v.x * 0.5 + 0.5) * W, (-this.v.y * 0.5 + 0.5) * H)
    }
    const headPt = toScreen(spots.head)

    // ---- the text, written out left to right
    const y0 = (n.col === 2 ? CENTRE_Y : ROW_Y) * H
    c.fillStyle = CHALK
    c.textBaseline = 'alphabetic'
    c.font = `italic 400 ${TITLE_PX}px TinosNote`
    const tw = c.measureText(n.title).width
    c.font = `italic 400 ${SUB_PX}px TinosNote`
    const sw = c.measureText(n.sub).width
    // on its column, but always well clear of him sideways (room for the arrow to travel)
    const clear = MIN_CLEAR * W
    const bw = Math.max(tw, sw)
    // ...and inside the sharp middle of the frame (the post blurs the edges hard)
    const x0 =
      n.col === 2
        ? headPt.x - tw / 2 // centred on him (and so is its subtitle)
        : THREE.MathUtils.clamp(
            n.col === 0 ? Math.min(COL_X[0] * W, headPt.x - clear - bw) : Math.max(COL_X[1] * W, headPt.x + clear),
            SAFE_X * W,
            (1 - SAFE_X) * W - bw,
          )
    const write = (text: string, px: number, y: number, w: number, k: number, alpha: number, xs = x0) => {
      if (k <= 0) return
      c.save()
      c.beginPath()
      c.rect(xs - 4, y - px * 1.1, (w + 8) * ease(k), px * 1.5)
      c.clip()
      c.globalAlpha = alpha * (i === this.cur ? this.fade : 1)
      c.font = `italic 400 ${px}px TinosNote`
      c.fillText(text, xs + this.j(1) * 0.4, y + this.j(2) * 0.4)
      c.restore()
    }
    write(n.title, TITLE_PX, y0, tw, ph(T_TITLE), 1)
    write(n.sub, SUB_PX, y0 + SUB_PX * 1.9, sw, ph(n.to ? T_SUB : LOST.sub), 0.88, n.col === 2 ? x0 + (tw - sw) / 2 : x0)

    // ---- the arrow: leaves the text from the side facing him
    const target = n.to
      ? toScreen(spots[n.to])
      : headPt.clone().add(new THREE.Vector2(n.col === 0 ? 0.17 * W : -0.17 * W, 0.02 * H)) // the empty seat beside him
    const tail =
      n.col === 2
        ? new THREE.Vector2(x0 + tw / 2, y0 + 16) // from under the centred title
        : new THREE.Vector2(n.col === 0 ? x0 + Math.max(tw, sw) + 18 : x0 - 18, y0 - TITLE_PX * 0.3)
    const dir = target.clone().sub(tail)
    const tip = target.clone().sub(dir.clone().multiplyScalar(ARROW_GAP / Math.max(dir.length(), 1)))
    const path = this.path(n.stroke, tail, tip, i, target)

    let drawn: number
    if (n.to) drawn = ease(ph(T_ARROW))
    else {
      const out = ease(ph(LOST.out)) * 0.28
      drawn = out * (1 - ease(ph(LOST.wipe))) // out, a still beat, back
    }
    this.chalkLine(path, drawn)

    // landed: the arrowhead, then a little flick of impact beside it
    if (n.to && t >= T_ARROW[1]) {
      const a = path[path.length - 1]
      const u = target.clone().sub(a).normalize() // the head points at him exactly
      const nrm = new THREE.Vector2(-u.y, u.x)
      const hl = 20
      this.chalkLine([a.clone().addScaledVector(u, -hl).addScaledVector(nrm, hl * 0.55), a], 1)
      this.chalkLine([a.clone().addScaledVector(u, -hl).addScaledVector(nrm, -hl * 0.55), a], 1)
      const land = ph(T_LAND)
      if (land > 0 && land < 1) {
        const base = c.globalAlpha
        c.globalAlpha = base * (1 - land)
        for (const sgn of [1, -1]) {
          const o = a.clone().addScaledVector(u, 6 + land * 10).addScaledVector(nrm, sgn * (8 + land * 6))
          this.chalkLine([o, o.clone().addScaledVector(u, 7).addScaledVector(nrm, sgn * 4)], 1)
        }
        c.globalAlpha = base
      }
    }

    // chalk grain over everything drawn (moved with the boil, so it shimmers in step)
    c.save()
    c.globalCompositeOperation = 'destination-out'
    c.translate((this.seed * 37) % 128, (this.seed * 53) % 128)
    c.fillStyle = this.grain
    c.globalAlpha = 0.55
    c.fillRect(-128, -128, W + 256, H + 256)
    c.restore()
    // a soft chalk glow behind it all (it sits after the bloom pass now)
    const gl = this.glow
    if (gl.width !== this.cnv.width || gl.height !== this.cnv.height) {
      gl.width = this.cnv.width
      gl.height = this.cnv.height
    }
    const g = gl.getContext('2d')!
    g.clearRect(0, 0, gl.width, gl.height)
    g.drawImage(this.cnv, 0, 0)
    c.save()
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.globalCompositeOperation = 'destination-over'
    c.filter = `blur(${7 * dpr}px)`
    c.globalAlpha = 0.55
    c.drawImage(gl, 0, 0)
    c.restore()
    this.tex.needsUpdate = true
  }

  /** hand-shake for this boil frame, in px */
  private j(k: number): number {
    return Math.sin(this.seed * (k + 1.37) + k * 4.1) * 1.3
  }

  /** the arrow's centreline: a bowed arc, an elbow (out level, then down to him), or a stroke
   *  with a little loop in it — so no two arrows are the same drawing */
  private path(kind: Stroke, a: THREE.Vector2, b: THREE.Vector2, i: number, aim: THREE.Vector2): THREE.Vector2[] {
    const pts: THREE.Vector2[] = []
    const N = 48
    const d = b.clone().sub(a)
    const len = d.length()
    const u = d.clone().normalize()
    const nrm = new THREE.Vector2(-u.y, u.x).multiplyScalar(i % 2 ? 1 : -1)
    const corner = new THREE.Vector2(b.x, a.y).lerp(a.clone().lerp(b, 0.5), 0.35)
    for (let k = 0; k <= N; k++) {
      const s = k / N
      const p = a.clone().addScaledVector(d, s)
      if (kind === 'arc') {
        // cubic: leaves the text bowed, and its last stretch lines up on the head itself, so
        // the tip (and the arrowhead) point AT him, not near him
        const p1 = a.clone().addScaledVector(d, 0.3).addScaledVector(nrm, len * 0.32)
        const p2 = b.clone().addScaledVector(aim.clone().sub(b).normalize(), -len * 0.35)
        const o = 1 - s
        p.set(0, 0)
          .addScaledVector(a, o * o * o)
          .addScaledVector(p1, 3 * o * o * s)
          .addScaledVector(p2, 3 * o * s * s)
          .addScaledVector(b, s * s * s)
      }
      else if (kind === 'elbow') p.copy(s < 0.5 ? a.clone().lerp(corner, s * 2) : corner.clone().lerp(b, (s - 0.5) * 2))
      else {
        p.addScaledVector(nrm, Math.sin(Math.PI * s) * len * 0.12)
        const l = Math.exp(-(((s - 0.42) / 0.09) ** 2))
        const ang = (s - 0.42) * 34
        p.x += Math.cos(ang) * 16 * l - 16 * l
        p.y += Math.sin(ang) * 16 * l
      }
      // a hand never draws a perfect line (none at the very end: the tip must aim true)
      const w = 1 - s * s
      p.x += (Math.sin(s * 5 + i) * 1.0 + this.j(k % 5) * 0.35) * w
      p.y += (Math.cos(s * 4 + i * 2) * 1.0 + this.j((k + 2) % 5) * 0.35) * w
      pts.push(p)
    }
    return pts
  }

  /** a chalk line along `pts`, up to fraction `upTo`: a few rough passes, each a little off */
  private chalkLine(pts: THREE.Vector2[], upTo: number): void {
    if (upTo <= 0 || pts.length < 2) return
    const c = this.ctx
    const last = Math.max(1, Math.floor((pts.length - 1) * upTo))
    c.strokeStyle = CHALK
    c.lineCap = 'round'
    c.lineJoin = 'round'
    const base = c.globalAlpha
    const passes: [number, number, number][] = [
      [3.2, 0.32, 1.6],
      [2.0, 0.6, 0.9],
      [1.1, 0.9, 0.4],
    ]
    passes.forEach(([w, a, off], k) => {
      c.lineWidth = w
      c.globalAlpha = base * a
      c.beginPath()
      for (let p = 0; p <= last; p++) {
        const x = pts[p].x + this.j(k + p * 3) * off * 0.5
        const y = pts[p].y + this.j(k + p * 3 + 1) * off * 0.5
        if (p === 0) c.moveTo(x, y)
        else c.lineTo(x, y)
      }
      c.stroke()
    })
    c.globalAlpha = base
  }
}

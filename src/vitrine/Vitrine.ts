import * as THREE from 'three'

/**
 * TEST (/vitrine.html): the home rethought (Danilo, 2026-10-19) — after the giz hero, section after
 * section that each look lifted from a different award-winning site: their own technique, colours,
 * fonts, cursor, and their own (made-up) business, from the banal to extreme luxury. What they share
 * is WebGL and the execution.
 *
 * One WebGL context for all of them: a fixed canvas behind the page; every frame each section that is
 * on screen is drawn into its own rectangle (viewport + scissor), the rest skip their frame entirely.
 * A section is a tall block (`.v-sec`, its height = how much scroll it plays over) holding a sticky
 * full-screen panel (`.v-pin`) — the panel is what gets drawn; `progress` runs 0..1 while it's pinned.
 */

/** the panel on screen, css px from the viewport's top left */
export type Rect = { x: number; y: number; w: number; h: number }

export abstract class Section {
  readonly pin: HTMLElement
  /** 0..1 through the section's pinned scroll */
  progress = 0
  /** the cursor over the panel: 0..1 (y down), and whether it's in */
  pointer = { x: 0.5, y: 0.5, px: 0, py: 0, inside: false, down: false, vx: 0, vy: 0 }
  /** seconds this section has been on screen (0 until it first shows) */
  shown = 0
  ready = false

  constructor(readonly el: HTMLElement) {
    this.pin = el.querySelector<HTMLElement>('.v-pin') ?? el
  }
  /** build (async: fonts, models). Called once, early */
  abstract init(r: THREE.WebGLRenderer): Promise<void> | void
  /** draw the frame into the current viewport (rect, css px). Targets of its own are fine: the
   *  default framebuffer's viewport and scissor are put back for it */
  abstract frame(r: THREE.WebGLRenderer, dt: number, rect: Rect): void
}

const OVERSCAN = 100 // as the hero: the canvas runs this far above the screen (see hero.css)

export class Vitrine {
  readonly renderer: THREE.WebGLRenderer
  private wrap = document.createElement('div')
  private canvas = document.createElement('canvas')
  private last = performance.now()
  private W = 1
  private H = 1

  constructor(private sections: Section[]) {
    this.wrap.setAttribute('style', `position:fixed;left:0;right:0;top:-${OVERSCAN}px;bottom:0;overflow:hidden;z-index:0;pointer-events:none`)
    this.canvas.setAttribute('style', 'display:block;width:100%;height:100%')
    this.wrap.appendChild(this.canvas)
    document.body.prepend(this.wrap)
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.autoClear = false
    this.resize()
    new ResizeObserver(() => this.resize()).observe(this.wrap)
    // the cursor, per section (each panel tracks its own)
    addEventListener('pointermove', (e) => this.point(e))
    addEventListener('pointerdown', (e) => {
      this.point(e)
      for (const s of this.sections) if (s.pointer.inside) s.pointer.down = true
    })
    addEventListener('pointerup', () => {
      for (const s of this.sections) s.pointer.down = false
    })
    for (const s of this.sections) void Promise.resolve(s.init(this.renderer)).then(() => (s.ready = true))
    requestAnimationFrame(this.tick)
  }

  private point(e: PointerEvent): void {
    for (const s of this.sections) {
      const r = s.pin.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width
      const y = (e.clientY - r.top) / r.height
      s.pointer.inside = x >= 0 && x <= 1 && y >= 0 && y <= 1
      s.pointer.x = x
      s.pointer.y = y
      s.pointer.px = e.clientX - r.left
      s.pointer.py = e.clientY - r.top
    }
  }

  private resize(): void {
    const b = this.wrap.getBoundingClientRect()
    this.W = b.width
    this.H = b.height - OVERSCAN
    this.renderer.setSize(b.width, b.height, false)
  }

  private tick = (now: number): void => {
    const dt = Math.min(1 / 20, Math.max(1e-3, (now - this.last) / 1000))
    this.last = now
    const r = this.renderer
    r.setScissorTest(false)
    r.setViewport(0, 0, this.W, this.H + OVERSCAN)
    r.clear()
    const vh = innerHeight
    for (const s of this.sections) {
      // progress through the pinned scroll
      const o = s.el.getBoundingClientRect()
      s.progress = THREE.MathUtils.clamp(-o.top / Math.max(1, o.height - vh), 0, 1)
      const p = s.pin.getBoundingClientRect()
      if (!s.ready || p.bottom <= 0 || p.top >= vh || p.width < 2) continue
      s.shown += dt
      const rect: Rect = { x: p.left, y: p.top, w: p.width, h: p.height }
      // gl's y runs up from the canvas' bottom — which is the screen's bottom (the overscan is on top)
      const gy = this.H - (p.top + p.height)
      r.setViewport(p.left, gy, p.width, p.height)
      r.setScissor(p.left, gy, p.width, p.height)
      r.setScissorTest(true)
      s.frame(r, dt, rect)
      r.setRenderTarget(null)
      r.setScissorTest(false)
    }
    requestAnimationFrame(this.tick)
  }
}

/** a cursor as an image the OS draws (no lag): an svg, its hotspot */
export function svgCursor(svg: string, x: number, y: number, fallback = 'auto'): string {
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") ${x} ${y}, ${fallback}`
}

/** a texture from a 2D canvas drawing (text in the section's own font, posters, labels) */
export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!, w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

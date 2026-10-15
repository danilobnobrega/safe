import * as THREE from 'three'

/**
 * garage-focus, the way out: the stack of cards that follows the annotations. The first one is
 * on his monitor — it lights up as the camera swings round behind him, and the camera dives into
 * it. Part way in, the real (DOM) card takes the screen's place, pinned onto the screen's four
 * corners as the camera sees them (so nothing changes on screen), and from there the card itself
 * opens out until its corners are the window's: the screen becomes the page. Each card after it
 * slides up over the one before.
 *
 * The monitor's picture is painted from the DOM card's own layout (every text's position, size
 * and baseline, read off the page), so the two are the same picture.
 *
 * PLACEHOLDER cards (Danilo decides what they are).
 */

const CARDS = [
  { kicker: 'Card 01', title: 'What he is working on.', body: '[card content — to be defined]' },
  { kicker: 'Card 02', title: 'Another card.', body: '[card content — to be defined]' },
  { kicker: 'Card 03', title: 'And another.', body: '[card content — to be defined]' },
]
const PAPER = '#efeee7'
const INK = '#121212'
const SCREEN_TONE = 0.911
const TEX_W = 1600 // the monitor picture's width in px; its height follows the window's shape

/** corners, in window px: top-left, top-right, bottom-right, bottom-left */
export type Quad = [number, number][]

export class Cards {
  readonly count = CARDS.length
  /** the monitor's screen in the room, showing card 1 */
  readonly screen: THREE.Mesh
  private layer = document.createElement('div')
  private els: HTMLDivElement[] = []
  private cnv = document.createElement('canvas')
  private tex: THREE.CanvasTexture

  constructor() {
    this.tex = new THREE.CanvasTexture(this.cnv)
    this.tex.colorSpace = THREE.NoColorSpace
    this.tex.anisotropy = 8
    this.screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.58, 0.33), // the panel's glass (tools/garage/custom_props.py)
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, opacity: 0, depthWrite: false }),
    )
    // the room's pipeline lifts it ~10% (measured): toned down so, with the lens cleared, the
    // screen comes out the same paper as the card that takes its place
    ;(this.screen.material as THREE.MeshBasicMaterial).color.setScalar(SCREEN_TONE)
    this.screen.layers.set(2)
    this.screen.renderOrder = 5

    // ---- the DOM cards: full screen, stacked
    this.layer.setAttribute('style', 'position:fixed;inset:0;pointer-events:none;z-index:6;overflow:hidden')
    document.body.appendChild(this.layer)
    // a zero-size mark at the start of each line of text: where its baseline is
    const mark = '<span data-base style="display:inline-block;width:0;height:0;vertical-align:baseline"></span>'
    CARDS.forEach((c, i) => {
      const el = document.createElement('div')
      el.setAttribute(
        'style',
        `position:absolute;inset:0;background:${PAPER};color:${INK};visibility:${i ? 'visible' : 'hidden'};` +
          `transform:translateY(${i ? 100 : 0}%);transform-origin:0 0;will-change:transform;` +
          (i ? 'box-shadow:0 -30px 60px rgba(0,0,0,.35);' : ''),
      )
      el.innerHTML =
        `<div data-t="kicker" style="position:absolute;left:8vw;top:12vh;font:500 13px/1 'IBM Plex Mono',Consolas,monospace;letter-spacing:.12em;text-transform:uppercase;opacity:.55;white-space:nowrap">${mark}${c.kicker}</div>` +
        `<div data-t="title" style="position:absolute;left:8vw;top:20vh;right:8vw;font:italic 400 clamp(40px,7vw,104px)/1 Tinos,'Times New Roman',serif;white-space:nowrap">${mark}${c.title}</div>` +
        `<div data-t="body" style="position:absolute;left:8vw;bottom:12vh;font:400 16px/1.4 'IBM Plex Mono',Consolas,monospace;opacity:.6;white-space:nowrap">${mark}${c.body}</div>`
      this.layer.appendChild(el)
      this.els.push(el)
    })
    this.paint()
    void document.fonts.ready.then(this.paint)
    window.addEventListener('resize', this.paint)
  }

  /** card 1, painted for the monitor exactly as the DOM lays it out, at the window's shape */
  private paint = (): void => {
    const [W, H] = this.box
    const k = TEX_W / W
    this.cnv.width = TEX_W
    this.cnv.height = Math.round(H * k)
    const ctx = this.cnv.getContext('2d')!
    ctx.fillStyle = PAPER
    ctx.fillRect(0, 0, this.cnv.width, this.cnv.height)
    ctx.fillStyle = INK
    ctx.textBaseline = 'alphabetic'
    // (card 1's own transform is cleared for the reading: positions in the window's frame)
    const el = this.els[0]
    const keep = el.style.transform
    el.style.transform = 'none'
    for (const t of el.querySelectorAll<HTMLElement>('[data-t]')) {
      const cs = getComputedStyle(t)
      const base = t.querySelector('[data-base]')!.getBoundingClientRect()
      const size = parseFloat(cs.fontSize)
      ctx.globalAlpha = parseFloat(cs.opacity)
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${size * k}px ${cs.fontFamily}`
      ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : `${parseFloat(cs.letterSpacing) * k}px`
      const text = cs.textTransform === 'uppercase' ? t.textContent!.toUpperCase() : t.textContent!
      ctx.fillText(text, base.left * k, base.top * k)
    }
    el.style.transform = keep
    ctx.globalAlpha = 1
    ctx.letterSpacing = '0px'
    this.tex.needsUpdate = true
  }

  /** (/garage-flex) card 1's painted picture, for the WebGL card */
  get picture(): HTMLCanvasElement {
    return this.cnv
  }

  /** the cards' box in px: the window less its scrollbar */
  get box(): [number, number] {
    return [this.layer.clientWidth, this.layer.clientHeight]
  }

  /**
   * @param light  0..1, the monitor screen lighting up
   * @param quad   card 1 pinned onto these corners (window px), or null: not shown
   * @param stack  in cards: 1.5 = card 2 half way up, 2 = card 2 in place, ...
   */
  update(light: number, quad: Quad | null, stack: number): void {
    ;(this.screen.material as THREE.MeshBasicMaterial).opacity = light
    const el = this.els[0]
    el.style.visibility = quad ? 'visible' : 'hidden'
    if (quad) el.style.transform = quadTransform(quad, ...this.box)
    for (let i = 1; i < this.els.length; i++) {
      const k = THREE.MathUtils.clamp(stack - i, 0, 1)
      const e = 1 - Math.pow(1 - k, 3)
      this.els[i].style.transform = `translateY(${(1 - e) * 100}%)`
    }
  }
}

/** the CSS transform that takes a w x h box (origin top-left) onto four corners — the
 *  projective map of the unit square onto the quad, scaled to the box */
function quadTransform(q: Quad, w: number, h: number): string {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q
  const sx = x0 - x1 + x2 - x3
  const sy = y0 - y1 + y2 - y3
  let g = 0
  let k = 0
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) {
    const dx1 = x1 - x2
    const dx2 = x3 - x2
    const dy1 = y1 - y2
    const dy2 = y3 - y2
    const det = dx1 * dy2 - dx2 * dy1
    g = (sx * dy2 - dx2 * sy) / det
    k = (dx1 * sy - sx * dy1) / det
  }
  const a = x1 - x0 + g * x1
  const b = x3 - x0 + k * x3
  const d = y1 - y0 + g * y1
  const e = y3 - y0 + k * y3
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, x0, y0, 0, 1]
  return `matrix3d(${m.join(',')})`
}

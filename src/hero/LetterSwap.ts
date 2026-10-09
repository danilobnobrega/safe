import * as THREE from 'three'

/**
 * TEST (/hero-letters.html): what the cursor's holes reveal is not a video but the wordmark
 * itself in other bodies — each letter slot of "GENERIC." shows that letter cut out of one of the
 * photos — Danilo's own materials: tennis felt, table-tennis rubber, asphalt (running), code,
 * grass (court), turned wood (chess) — cut by tools/hero/cut_letters.py; every slot jumps to another
 * photo on its own at short random intervals. Drawn into a screen-sized canvas that the reveal
 * samples in screen space, on the photos' own white.
 */

const ROOT = `${import.meta.env.BASE_URL}hero/`
const PHOTOS = 6
const GLYPHS = ['G', 'E', 'N', 'E2', 'R', 'I', 'C', 'dot'] as const
// every slot changes on the same fixed beat, but at its own moment: the 8 slots are spread
// evenly across one beat in a shuffled order, so no two change together and it's no wave
const SWAP_EVERY = 0.45 // s between two changes of one slot
const BG = '#fdfdfc' // the photos' backdrop
const SIZE = 1.12 // photo cap height vs the sign's (the photo letters are chubbier)

type Meta = Record<string, { g: string; x: number; y: number; w: number; h: number }[] | { x0: number; x1: number; y0: number; y1: number }>

/** a slot of the sign on screen, px from the top-left of the visible frame */
export interface Slot {
  cx: number // glyph centre x
  top: number // cap top y of the whole word
  bottom: number // baseline y of the whole word
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export class LetterSwap {
  readonly canvas = document.createElement('canvas')
  readonly texture: THREE.CanvasTexture
  private ctx = this.canvas.getContext('2d')!
  private images: HTMLImageElement[][] = [] // [photo][glyph]
  private meta?: Meta
  private slots: Slot[] = []
  private pick: number[] = []
  private timers = shuffle(GLYPHS.map((_, i) => ((i + 1) / GLYPHS.length) * SWAP_EVERY))
  private dirty = true
  private ready = false

  private base: string

  /** `set`: the folder under public/hero/ (letters = Danilo's materials; letters_v1 = the first set) */
  constructor(set = 'letters') {
    this.base = `${ROOT}${set}/`
    // start mixed too: no two neighbours on the same photo
    for (let i = 0; i < GLYPHS.length; i++) this.pick.push(this.choose([this.pick[i - 1]]))
    this.texture = new THREE.CanvasTexture(this.canvas)
    // pass-through, like the video it replaces: the shaders write display values
    this.texture.colorSpace = THREE.NoColorSpace
    this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter
    this.texture.generateMipmaps = false
    void this.load()
  }

  private async load(): Promise<void> {
    this.meta = (await (await fetch(this.base + 'meta.json')).json()) as Meta
    const img = (src: string) =>
      new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image()
        i.onload = () => res(i)
        i.onerror = rej
        i.src = src
      })
    this.images = await Promise.all(
      Array.from({ length: PHOTOS }, (_, p) => Promise.all(GLYPHS.map((g) => img(`${this.base}p${p}_${g}.webp`)))),
    )
    this.ready = true
    this.dirty = true
  }

  /** where slot i draws photo p's letter, px */
  private rect(i: number, p: number): { x: number; y: number; w: number; h: number } {
    const word = this.meta![`p${p}_word`] as { x0: number; x1: number; y0: number; y1: number }
    const g = (this.meta![`p${p}`] as { x: number; y: number; w: number; h: number }[])[i]
    const slot = this.slots[i]
    // one scale per photo, from the word's cap height, so the dot stays a dot; the photo
    // word's vertical centre sits on the sign's
    const k = ((slot.bottom - slot.top) * SIZE) / (word.y1 - word.y0)
    const midPhoto = (word.y0 + word.y1) / 2
    const midSign = (slot.top + slot.bottom) / 2
    return { x: slot.cx - (g.w * k) / 2, y: midSign + (g.y - midPhoto) * k, w: g.w * k, h: g.h * k }
  }

  /** canvas size (px of the visible frame) and where the sign's letters sit on it */
  layout(width: number, height: number, slots: Slot[]): void {
    const dpr = Math.min(window.devicePixelRatio, 2)
    const cw = Math.round(width * dpr)
    const ch = Math.round(height * dpr)
    if (cw !== this.canvas.width || ch !== this.canvas.height) {
      this.canvas.width = cw
      this.canvas.height = ch
      // the GPU copy was allocated at the old size and three won't grow it: start over
      this.texture.dispose()
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.slots = slots
    this.dirty = true
  }

  /** a random photo that isn't one of `avoid` (undefined entries ignored) */
  private choose(avoid: (number | undefined)[]): number {
    const ok = Array.from({ length: PHOTOS }, (_, p) => p).filter((p) => !avoid.includes(p))
    return ok[Math.floor(Math.random() * ok.length)]
  }

  step(dt: number): void {
    for (let i = 0; i < GLYPHS.length; i++) {
      this.timers[i] -= dt
      if (this.timers[i] > 0) continue
      this.timers[i] += SWAP_EVERY // += (not =) so the beat never drifts
      // a different photo from the one it shows now AND from both neighbours'
      this.pick[i] = this.choose([this.pick[i], this.pick[i - 1], this.pick[i + 1]])
      this.dirty = true
    }
    if (this.dirty) this.draw()
  }

  private draw(): void {
    this.dirty = false
    const { ctx } = this
    const w = this.canvas.width
    const h = this.canvas.height
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
    if (this.ready && this.meta && this.slots.length === GLYPHS.length) {
      for (let i = 0; i < GLYPHS.length; i++) {
        const p = this.pick[i]
        const r = this.rect(i, p)
        ctx.drawImage(this.images[p][i], r.x, r.y, r.w, r.h)
      }
    }
    this.texture.needsUpdate = true
  }
}

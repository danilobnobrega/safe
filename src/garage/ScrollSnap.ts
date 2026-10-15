import gsap from 'gsap'

/**
 * garage-focus: the dive into his screen, the way lusion.co's tablet opens up into the page —
 * both ways on its own. The scroll stops where the camera first looks at his screen from his
 * side (`from`); the next nudge down, however small, sets the dive off and it carries itself all
 * the way in, until the screen has become the next section (`to`). A nudge up from the section
 * carries it all the way back out to `from` the same way. A nudge against a carry turns it round.
 *
 * The rest of the gesture that set a carry going (a trackpad's momentum included) is swallowed
 * until it ends, so it never pushes on past where the carry lands.
 */
const CARRY_TIME = 1.6 // s, the whole way in, or out
const ARRIVE_TIME = 0.35 // s, settling onto `from` when the scroll comes in past it
const GESTURE_GAP = 220 // ms without wheel events = the gesture is over

export class ScrollSnap {
  private busy = false // the page is being carried
  private carryDir = 0 // +1 in, -1 out, 0 settling onto `from`
  private held = false // the gesture that set the carry going is still going
  private heldDir = 0
  private holdTimer = 0
  private lastY = window.scrollY
  private pos = { y: 0 }

  /** from / to in screens of scroll */
  constructor(private from: number, private to: number, private carryTime = CARRY_TIME) {
    window.addEventListener('wheel', this.onWheel, { passive: false })
    window.addEventListener('scroll', this.onScroll, { passive: true })
  }

  private onWheel = (e: WheelEvent): void => {
    if (e.ctrlKey) return // pinch-zoom
    const H = window.innerHeight
    const d = (e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? H : 1)) / H
    if (d === 0) return
    const dir = Math.sign(d)
    if (this.busy) {
      e.preventDefault()
      // against the carry: turn it round; with it: more of the same gesture, swallowed
      if (this.carryDir !== 0 && dir === -this.carryDir) this.go(dir > 0 ? this.to : this.from)
      this.hold(dir)
      return
    }
    if (this.held && dir === this.heldDir) {
      e.preventDefault()
      this.hold(dir)
      return
    }
    const y = window.scrollY / H
    const eps = 2 / H
    const { from: A, to: B } = this
    if (dir > 0) {
      if (y >= A - eps && y < B - eps) this.start(e, dir, B) // at the screen, or part way: in
      else if (y < A - eps && y + d >= A) this.start(e, dir, A, true) // arriving: stop at the screen
    } else if (y > A + eps && y + d <= B + eps) {
      this.start(e, dir, A) // up from the section, or part way: back out to the screen
    }
  }

  /** keys, the scrollbar, anything that isn't the wheel: landing between the two stops carries
   *  on the way it was going (stopping at `from` first when coming in from before it) */
  private onScroll = (): void => {
    const y = window.scrollY
    if (!this.busy) {
      const H = window.innerHeight
      const s = y / H
      const eps = 2 / H
      if (s > this.from + eps && s < this.to - eps) {
        const down = y >= this.lastY
        // (the browser's own smooth wheel scroll can carry past `from` by itself)
        if (down && this.lastY / H < this.from + eps) this.go(this.from, true)
        else this.go(down ? this.to : this.from)
      }
    }
    this.lastY = window.scrollY
  }

  private start(e: WheelEvent, dir: number, target: number, arrive = false): void {
    e.preventDefault()
    this.hold(dir)
    this.go(target, arrive)
  }

  /** carry the page to `target` (screens) — a whole carry's time for the whole way, its share
   *  for part of it */
  private go(target: number, arrive = false): void {
    const H = window.innerHeight
    const y = window.scrollY
    const left = Math.abs(target - y / H) / (this.to - this.from)
    this.busy = true
    this.carryDir = arrive ? 0 : target === this.to ? 1 : -1
    this.pos.y = y
    gsap.killTweensOf(this.pos)
    gsap.to(this.pos, {
      y: target * H,
      duration: arrive ? ARRIVE_TIME : Math.max(0.35, this.carryTime * left),
      // off at once, as if the nudge had flung it, settling as it lands
      ease: 'power2.out',
      onUpdate: () => window.scrollTo({ top: this.pos.y, behavior: 'instant' }),
      onComplete: () => {
        this.busy = false
        this.lastY = window.scrollY
      },
    })
  }

  private hold(dir: number): void {
    this.held = true
    this.heldDir = dir
    clearTimeout(this.holdTimer)
    this.holdTimer = window.setTimeout(() => (this.held = false), GESTURE_GAP)
  }
}

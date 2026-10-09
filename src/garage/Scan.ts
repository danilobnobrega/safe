import * as THREE from 'three'
import gsap from 'gsap'
import { LINES_FRAG, LINES_VERT, type Globals } from './materials'
import { HUD, type Inspect, type Target } from './Inspect'

/**
 * The click: the camera flies in to the object (arcing over the set), the target brackets lock
 * onto it (closing in from wide, with a little overshoot), a bright line sweeps down the object
 * and lights its chalk strokes as it passes (the object alone: it gets its own copy of the chalk
 * material with SCAN_ON), and a readout beside it counts the scan up and then types out why the
 * object is there. The scene under the readout is darkened by the post pass so the orange always
 * reads. Click anywhere / Esc to go back.
 */

/** why each object is there — the selector as the key. PLACEHOLDERS: Danilo writes these */
const TEXTS: Record<string, string> = {
  // his own file — PLACEHOLDER, Danilo writes the real one
  'person#danilo': [
    'DANILO. Web developer. Founder, CEO, CTO and the rest of the staff.',
    '  HEIGHT ........ [?] m',
    '  HOURS ......... 09:00-17:00',
    '  BACKGROUND .... former tennis / table tennis player',
    '  NOW ........... runs; training toward an Ironman',
    '  ALSO .......... chess (not titled)',
  ].join('\n'),
}

const FLY_TIME = 1.4 // s
const LOCK_AT = FLY_TIME * 0.55 // s: brackets start closing in
const LOCK_FROM = 70 // px of extra spread they close from
const SCAN_AT = FLY_TIME * 0.85 // s: the line starts
const SCAN_TIME = 1.6 // s: top to bottom
const TYPE_MS = 22 // per character

export class ScanFocus {
  /** 0 = in the room, 1 = at the object */
  readonly t = { value: 0 }
  readonly pos = new THREE.Vector3()
  readonly look = new THREE.Vector3()
  /** extra bracket spread, px */
  readonly lock = { value: 0 }
  active?: Target
  /** how much the scene under the readout is darkened (the page drives the post with it) */
  readonly shade = { value: 0 }
  /** the readout's rect, in uv (x0, y0, x1, y1) */
  readonly shadeRect = new THREE.Vector4()
  private scanOn = { value: 0 }
  private scanY = { value: 0 }
  private progress = { value: 0 }
  private stash = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
  private hud = document.createElement('div')
  private text = ''
  private typed = 0
  private typing?: number
  private info = ''

  constructor(
    private globals: Globals,
    private inspect: Inspect,
  ) {
    this.hud.setAttribute(
      'style',
      `position:fixed;z-index:3;pointer-events:none;opacity:0;transition:opacity .25s;color:${HUD};` +
        'font:11px/1.6 Consolas,Menlo,"SF Mono",monospace;letter-spacing:.06em;white-space:pre-wrap;' +
        `max-width:min(32vw,380px);padding:10px 12px;border-left:1px solid ${HUD};` +
        'text-shadow:0 0 6px rgba(255,154,77,.35)',
    )
    document.body.appendChild(this.hud)
  }

  open(target: Target, camera: THREE.PerspectiveCamera, from: THREE.Vector3): void {
    if (this.active) return
    this.active = target
    focusPose(target, camera, from, this.pos, this.look)
    gsap.to(this.t, { value: 1, duration: FLY_TIME, ease: 'power3.inOut', overwrite: true })

    // lock-on
    this.lock.value = 0
    gsap.fromTo(
      this.lock,
      { value: LOCK_FROM },
      { value: 0, duration: 0.55, delay: LOCK_AT, ease: 'back.out(2.2)', overwrite: true },
    )

    // the object gets its own copy of the chalk material, with the scan uniforms
    target.node.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const src = m.material as THREE.ShaderMaterial
      this.stash.set(m, m.material)
      m.material = new THREE.ShaderMaterial({
        vertexShader: LINES_VERT,
        fragmentShader: LINES_FRAG,
        defines: { ...src.defines },
        uniforms: { ...this.globals, SCAN_ON: this.scanOn, SCAN_Y: this.scanY },
      })
    })

    // readout
    const sel = `${target.tag}${target.rest}`
    const c = target.box.getCenter(new THREE.Vector3())
    const id = [...target.node.name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7).toString(16).toUpperCase().padStart(8, '0')
    this.info =
      `TARGET  ${sel.toUpperCase()}\n` +
      `ID      0x${id.slice(0, 6)}\n` +
      `POS     X ${c.x.toFixed(2)}  Y ${c.y.toFixed(2)}  Z ${c.z.toFixed(2)}\n` +
      `SIZE    ${target.dims.toUpperCase()}\n`
    this.text = TEXTS[sel] ?? `[placeholder] por que ${sel} está aqui — texto do Danilo`
    this.typed = 0
    this.progress.value = 0
    this.render()
    gsap.delayedCall(SCAN_AT - 0.2, () => {
      if (this.active === target) this.hud.style.opacity = '1'
    })

    // the sweep, top to bottom
    this.scanY.value = target.box.max.y + 0.03
    gsap.to(this.scanOn, { value: 1, duration: 0.2, delay: SCAN_AT, overwrite: true })
    gsap.to(this.scanY, {
      value: target.box.min.y - 0.03,
      duration: SCAN_TIME,
      delay: SCAN_AT,
      ease: 'power1.inOut',
      overwrite: true,
    })
    gsap.to(this.progress, {
      value: 1,
      duration: SCAN_TIME,
      delay: SCAN_AT,
      ease: 'power1.inOut',
      overwrite: true,
      onUpdate: () => this.render(),
      onComplete: () => {
        if (this.active !== target) return
        window.clearInterval(this.typing)
        this.typing = window.setInterval(() => {
          this.typed = Math.min(this.typed + 1, this.text.length)
          this.render()
          if (this.typed >= this.text.length) window.clearInterval(this.typing)
        }, TYPE_MS)
      },
    })
  }

  close(): void {
    const target = this.active
    if (!target) return
    this.active = undefined
    window.clearInterval(this.typing)
    this.hud.style.opacity = '0'
    gsap.killTweensOf([this.scanY, this.progress, this.lock])
    this.lock.value = 0
    gsap.to(this.scanOn, {
      value: 0,
      duration: 0.35,
      overwrite: true,
      onComplete: () => {
        this.stash.forEach((mat, m) => {
          ;(m.material as THREE.Material).dispose()
          m.material = mat
        })
        this.stash.clear()
      },
    })
    gsap.to(this.t, { value: 0, duration: FLY_TIME * 0.9, ease: 'power3.inOut', overwrite: true })
  }

  /** keep the readout beside the brackets, and the darkening under it */
  update(): void {
    const on = this.active && this.hud.style.opacity === '1' ? 1 : 0
    this.shade.value += (on - this.shade.value) * 0.12
    const w = window.innerWidth
    const h = window.innerHeight
    const b = this.hud.getBoundingClientRect()
    this.shadeRect.set(b.left / w, 1 - b.bottom / h, b.right / w, 1 - b.top / h)
    if (!this.active) return
    const r = this.inspect.rect
    const s = this.hud.style
    if (w < h) {
      s.left = '16px'
      s.top = ''
      s.bottom = '24px'
    } else {
      s.left = `${Math.min(r.x1 + 40, w - 400)}px`
      s.top = `${Math.max(16, (r.y0 + r.y1) / 2 - 80)}px`
      s.bottom = ''
    }
  }

  private render(): void {
    const p = this.progress.value
    const n = 18
    const bar = '█'.repeat(Math.round(p * n)) + '░'.repeat(n - Math.round(p * n))
    const status = p < 1 ? `SCAN    ${bar} ${String(Math.round(p * 100)).padStart(3)}%` : `SCAN    ${bar} COMPLETE`
    const caret = this.typed < this.text.length && p >= 1 ? '▌' : ''
    const body = p >= 1 ? `\n\n> ${this.text.slice(0, this.typed)}${caret}` : ''
    this.hud.textContent = this.info + status + body + (p >= 1 && this.typed >= this.text.length ? '\n\nESC' : '')
  }
}

/** where the camera ends up: in front of the object, framed on the left, the readout on the right */
function focusPose(
  target: Target,
  camera: THREE.PerspectiveCamera,
  from: THREE.Vector3,
  pos: THREE.Vector3,
  look: THREE.Vector3,
): void {
  const c = target.box.getCenter(new THREE.Vector3())
  const s = target.box.getSize(new THREE.Vector3())
  const dir = from.clone().sub(c)
  dir.y *= 0.4
  dir.normalize()
  const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
  const tanX = tanY * camera.aspect
  const fitH = (s.y * 0.5) / tanY
  const fitW = (Math.max(s.x, s.z) * 0.5) / tanX
  const dist = THREE.MathUtils.clamp(Math.max(fitH, fitW) * 2.4, 0.6, 4)
  pos.copy(c).addScaledVector(dir, dist)
  pos.y = Math.max(pos.y, 0.25)
  // shift the aim to the right so the object sits in the left part of the frame
  const right = new THREE.Vector3().crossVectors(dir.clone().negate(), new THREE.Vector3(0, 1, 0)).normalize()
  look.copy(c)
  if (camera.aspect < 1) look.y -= dist * tanY * 0.35 // readout at the bottom: object in the upper part
  else look.addScaledVector(right, dist * tanX * 0.33)
}

import * as THREE from 'three'
import { Drawn, DRAWN_GLSL } from '../hero/Drawn'
import { sfx } from '../behind/sfx'

/**
 * TEST (/hero-elevator.html, /garage-elevator.html): the menu as an elevator (Danilo's idea, 2026-10-16;
 * "application A"). In the top-right corner, where the toaster was, an elevator's call button. Press it:
 * it lights, the doors slide shut across the whole page, and you're inside — the camera steps back into
 * the cabin: the door frame, the button panel beside it (one button a floor, a floor a page), the floor
 * dial above, and elevator music. Press a floor: its button lights, the dial's needle swings, the cabin
 * hums and shudders, a chime — and the doors open on that page: it has loaded behind them, and it opens
 * with them shut, so the change of page is never seen. Press the floor you're on (or Esc) and the doors
 * just open again. Contact isn't built: its button blinks, and goes nowhere.
 *
 * Drawn like the toaster (graphite on the hero's paper, Drawn.ts), the lit buttons in the garage's
 * orange. Sounds: real recordings (CC0, Freesound) — an old elevator chime, a big metal lift door closing
 * and opening, a button, a cabin moving, and elevator music (?elevmusic=1..4).
 */

export interface Floor {
  key: string // what's on the button: G, 1, 2
  label: string // beside it: HOME, ABOUT…
  href: string | null // null: not built yet
}

/** each floor's own music (its takes, ?pagemusic=1..n), and the garage's "radio" — a clean jazz loop
 *  through an old radio: the bass and the top cut, a little saturation, a faint hiss */
export interface PageTrack {
  id: string
  radio?: boolean
}
const PAGE_GAIN = 0.2

const Q = new URLSearchParams(location.search)
const FOV = 40
const DOOR_W = 1.6 // the opening
const DOOR_H = 2.2
const CAB_W = 2.4 // the cabin, inside (m)
const CAB_D = 2.8
const CAB_H = 2.7
const WALL_T = 0.1
const DOOR_Z = -WALL_T - 0.03 // the doors run in the wall's thickness, just behind its face
const CLOSE_T = 0.85 // s: the doors shutting
const STEP_T = 0.9 // s: the camera stepping back into the cabin
const RIDE_T = 1.7 // s: floor to floor
const OPEN_T = 0.9 // s: the doors opening on arrival
const DIAL_SPREAD = 0.75 // rad: the needle's swing from the middle floor to the end ones
const MUSIC: Record<string, string> = { '1': '659889', '2': '489999', '3': '704972', '4': '691837' }
const MUSIC_ID = MUSIC[Q.get('elevmusic') ?? '1'] ?? MUSIC['1']
const STORE = 'generic-elevator'

type State = 'idle' | 'closing' | 'stepping' | 'inside' | 'riding' | 'arriving' | 'leaving'

/** the drawn material (the toaster's): paper and graphite, `tone` 0..1 how dark, a label texture, a glow */
function drawnMat(drawn: Drawn, tone: number, label?: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...drawn.uniforms,
      uTone: { value: tone },
      uMap: { value: label ?? null },
      uHasMap: { value: label ? 1 : 0 },
      uGlow: { value: 0 },
    },
    vertexShader: `
      varying vec3 vViewN;
      varying vec4 vClip;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vViewN = normalize(normalMatrix * normal);
        vClip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = vClip;
      }`,
    fragmentShader: `
      precision highp float;
      uniform float uTone;
      uniform sampler2D uMap;
      uniform float uHasMap;
      uniform float uGlow;
      varying vec3 vViewN;
      varying vec4 vClip;
      varying vec2 vUv;
      ${DRAWN_GLSL}
      void main() {
        vec2 suv = (vClip.xy / vClip.w) * 0.5 + 0.5;
        float ink = max(drawnInk(suv, vViewN), drawnTone(suv, uTone));
        if (uHasMap > 0.5) ink = max(ink * 0.6, 1.0 - smoothstep(0.35, 0.65, texture2D(uMap, vUv).r));
        vec3 col = mix(drawnPaper(suv), D_INK, ink);
        col = mix(col, vec3(1.0, 0.604, 0.302), uGlow);
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
}

/** text on paper, for a label texture (ink = dark) */
function label(w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const cnv = document.createElement('canvas')
  cnv.width = w
  cnv.height = h
  const c = cnv.getContext('2d')!
  c.fillStyle = '#fff'
  c.fillRect(0, 0, w, h)
  c.fillStyle = '#000'
  c.strokeStyle = '#000'
  draw(c, w, h)
  const t = new THREE.CanvasTexture(cnv)
  t.colorSpace = THREE.NoColorSpace
  t.anisotropy = 8
  return t
}

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)

export class Elevator {
  private cnv = document.createElement('canvas')
  private cover = document.createElement('div') // the page hidden behind shut doors before the first frame (arriving)
  private renderer: THREE.WebGLRenderer
  private drawn: Drawn
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 50)
  private root = new THREE.Group()
  private doors: THREE.Mesh[] = []
  private buttons: { mesh: THREE.Mesh; floor: number; mat: THREE.ShaderMaterial }[] = []
  private closeBtn?: THREE.Mesh
  private needle = new THREE.Group()
  private state: State = 'idle'
  private t = 0
  private last = performance.now()
  private target = 0 // the floor being gone to
  private here: number
  private hover: THREE.Mesh | null = null
  private ray = new THREE.Raycaster()
  private ptr = new THREE.Vector2(-9, -9)
  private shake = 0
  private blink = -1 // (a floor not built) its button blinking
  private bufs: Record<string, AudioBuffer> = {}
  private music?: { src: AudioBufferSourceNode; g: GainNode; t0: number; off: number }
  private call: CallButton

  private page?: { src: AudioBufferSourceNode; g: GainNode }
  private pageLevel = 1

  constructor(private floors: Floor[], here: string, private track?: PageTrack) {
    this.here = Math.max(0, floors.findIndex((f) => f.key === here))
    this.target = this.here
    this.cnv.setAttribute('style', 'position:fixed;inset:0;width:100%;height:100%;z-index:60;pointer-events:none;display:none')
    this.cover.setAttribute('style', 'position:fixed;inset:0;z-index:61;background:#efeee7;display:none')
    document.body.append(this.cnv, this.cover)
    this.renderer = new THREE.WebGLRenderer({ canvas: this.cnv, alpha: true, antialias: true })
    this.renderer.setClearColor(0x000000, 0)
    const dpr = Math.min(devicePixelRatio, 2)
    this.renderer.setPixelRatio(dpr)
    this.drawn = new Drawn(this.renderer, innerWidth, innerHeight, dpr)
    this.build()
    this.scene.add(this.root)
    this.resize()
    window.addEventListener('resize', this.resize)
    window.addEventListener('pointermove', this.onMove, true)
    // while it's open, nothing reaches the page under it (the desk would grab a sheet through a button)
    for (const ev of ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'touchstart', 'touchmove']) this.cnv.addEventListener(ev, (e) => e.stopPropagation(), { passive: true })
    window.addEventListener('click', this.onClick, true)
    window.addEventListener('keydown', (e) => e.key === 'Escape' && this.state === 'inside' && this.leave())
    this.load()
    this.call = new CallButton(() => this.open())
    // arriving from another floor: inside, the doors shut, until they open on this page
    const saved = this.saved()
    if (saved) this.arrive(saved.music)
    // this floor's own music: from the visitor's first click or key (a browser lets nothing play before)
    else {
      const go = () => {
        window.removeEventListener('pointerdown', go, true)
        window.removeEventListener('keydown', go, true)
        window.setTimeout(() => this.state === 'idle' && this.startPage(2.5), 120)
      }
      window.addEventListener('pointerdown', go, true)
      window.addEventListener('keydown', go, true)
    }
    this.renderer.setAnimationLoop(this.frame)
  }

  // ---- the cabin --------------------------------------------------------------------------------
  private build(): void {
    const d = this.drawn
    const box = (w: number, h: number, dp: number, tone: number, x: number, y: number, z: number, tex?: THREE.Texture) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dp), drawnMat(d, tone, tex))
      m.position.set(x, y, z)
      this.root.add(m)
      return m
    }
    const hw = CAB_W / 2
    const ow = DOOR_W / 2
    // the front wall, around the opening (its face at z = 0)
    box(hw - ow, CAB_H, WALL_T, 0.06, -(ow + (hw - ow) / 2), CAB_H / 2, -WALL_T / 2)
    box(hw - ow, CAB_H, WALL_T, 0.06, ow + (hw - ow) / 2, CAB_H / 2, -WALL_T / 2)
    box(DOOR_W, CAB_H - DOOR_H, WALL_T, 0.06, 0, DOOR_H + (CAB_H - DOOR_H) / 2, -WALL_T / 2)
    // a frame round the opening, standing proud
    box(0.06, DOOR_H, 0.05, 0.22, -ow - 0.03, DOOR_H / 2, 0.025)
    box(0.06, DOOR_H, 0.05, 0.22, ow + 0.03, DOOR_H / 2, 0.025)
    box(DOOR_W + 0.12, 0.06, 0.05, 0.22, 0, DOOR_H + 0.03, 0.025)
    // the cabin: side walls, floor, ceiling, a handrail
    box(0.05, CAB_H, CAB_D, 0.04, -hw, CAB_H / 2, CAB_D / 2)
    box(0.05, CAB_H, CAB_D, 0.04, hw, CAB_H / 2, CAB_D / 2)
    box(CAB_W, 0.05, CAB_D, 0.35, 0, 0, CAB_D / 2)
    box(CAB_W, 0.05, CAB_D, 0.02, 0, CAB_H, CAB_D / 2)
    box(0.05, 0.05, CAB_D * 0.8, 0.1, -hw + 0.08, 0.95, CAB_D * 0.5)
    box(0.05, 0.05, CAB_D * 0.8, 0.1, hw - 0.08, 0.95, CAB_D * 0.5)
    // the doors: brushed steel, a seam down the middle when shut
    for (const s of [-1, 1]) {
      const door = box(ow + 0.01, DOOR_H, 0.03, 0.08, 0, DOOR_H / 2, DOOR_Z)
      door.userData.side = s
      // its meeting edge, dark: shut, the two show the seam down the middle
      // (plain dark, not the drawn tone: that reads off a texture that may not be in yet on arrival)
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.012, DOOR_H, 0.035), new THREE.MeshBasicMaterial({ color: 0x2a2a28 }))
      seam.position.x = -s * ((ow + 0.01) / 2 - 0.006)
      door.add(seam)
      this.doors.push(door)
    }
    this.setDoors(0)
    // the panel, on the wall right of the doors
    const px = ow + (hw - ow) / 2 + 0.02
    const plate = box(0.31, 1.12, 0.02, 0.12, px, 1.2, 0.012, this.plateLabel())
    plate.userData.plate = true
    this.floors.forEach((f, i) => {
      const y = 1.2 + 0.34 - i * 0.25
      const mat = drawnMat(d, 0.2, label(128, 128, (c, w, h) => {
        // (the cap, turned to face us, maps the canvas's x downward and its up to the right: the
        // text is drawn turned a quarter counter-clockwise to read upright)
        c.translate(w / 2, h / 2)
        c.rotate(-Math.PI / 2)
        c.font = '600 78px "IBM Plex Mono", Consolas, monospace'
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        c.fillText(f.key, 0, 4)
      }))
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.054, 0.025, 32), mat)
      b.rotation.x = Math.PI / 2
      b.position.set(px + 0.075, y, 0.03)
      // the face's uv: the cap's own disc
      this.root.add(b)
      this.buttons.push({ mesh: b, floor: i, mat })
    })
    // the door-close button: it does nothing (as in every elevator)
    const cb = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 32), drawnMat(d, 0.2, label(128, 128, (c, w, h) => {
      c.translate(w / 2, h / 2)
      c.rotate(-Math.PI / 2)
      c.translate(-w / 2, -h / 2)
      c.lineWidth = 9
      c.beginPath()
      c.moveTo(w * 0.22, h * 0.3)
      c.lineTo(w * 0.45, h * 0.5)
      c.lineTo(w * 0.22, h * 0.7)
      c.moveTo(w * 0.78, h * 0.3)
      c.lineTo(w * 0.55, h * 0.5)
      c.lineTo(w * 0.78, h * 0.7)
      c.stroke()
    })))
    cb.rotation.x = Math.PI / 2
    cb.position.set(px + 0.075, 1.2 - 0.44, 0.028)
    this.root.add(cb)
    this.closeBtn = cb
    // the floor dial over the doors, its needle
    box(0.62, 0.26, 0.02, 0.05, 0, DOOR_H + 0.22, 0.012, this.dialLabel())
    const n = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.17, 0.01), drawnMat(d, 0.9))
    n.position.y = 0.085
    this.needle.add(n)
    this.needle.position.set(0, DOOR_H + 0.11, 0.03)
    this.root.add(this.needle)
    this.setNeedle(this.here)
  }

  /** the panel's face: each floor's name beside its button, a little note on the floor not built */
  private plateLabel(): THREE.CanvasTexture {
    return label(310, 1120, (c, w) => {
      c.font = '600 34px "IBM Plex Mono", Consolas, monospace'
      c.textAlign = 'left'
      this.floors.forEach((f, i) => {
        const y = 1120 / 2 - (0.34 - i * 0.25) * 1000
        c.fillText(f.label, 14, y + 10)
        if (!f.href) {
          // taped on, a little crooked
          c.save()
          c.translate(w * 0.5, y + 46)
          c.rotate(-0.06)
          c.strokeRect(-w * 0.44, -18, w * 0.88, 36)
          c.font = 'italic 400 26px Tinos, "Times New Roman", serif'
          c.textAlign = 'center'
          c.fillText('soon, apparently', 0, 7)
          c.restore()
        }
      })
    })
  }

  /** the dial's face: the floors round an arc */
  private dialLabel(): THREE.CanvasTexture {
    return label(700, 300, (c, w, h) => {
      c.font = '600 46px "IBM Plex Mono", Consolas, monospace'
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.lineWidth = 4
      c.beginPath()
      c.arc(w / 2, h * 0.92, h * 0.78, Math.PI * 1.12, Math.PI * 1.88)
      c.stroke()
      this.floors.forEach((f, i) => {
        const a = -Math.PI / 2 + this.dialAngle(i)
        c.fillText(f.key, w / 2 + Math.cos(a) * h * 0.62, h * 0.92 + Math.sin(a) * h * 0.62)
      })
    })
  }

  private dialAngle(floor: number): number {
    const n = Math.max(1, this.floors.length - 1)
    // (the floors are listed top first: G, the last, at the dial's left, rising to the right)
    return ((n - floor) / n - 0.5) * 2 * DIAL_SPREAD
  }

  private setNeedle(f: number): void {
    this.needle.rotation.z = -this.dialAngle(f)
  }

  /** the doors: 0 open (into the wall), 1 shut */
  private setDoors(k: number): void {
    const ow = DOOR_W / 2
    for (const d of this.doors) {
      const s = d.userData.side as number
      d.position.x = s * (ow / 2 + 0.005 + (1 - k) * ow)
    }
  }

  // ---- the camera ---------------------------------------------------------------------------
  /** at the opening, so close it fills the view; and stepped back inside, the cabin showing */
  private pose(k: number): void {
    const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
    // the opening (with a hair of frame) must cover the whole window
    const dNear = Math.min((DOOR_H / 2) * 0.99 / t, (DOOR_W / 2) * 0.99 / (t * this.camera.aspect))
    const dIn = CAB_D * 0.97
    const z = THREE.MathUtils.lerp(dNear, dIn, k)
    const y = THREE.MathUtils.lerp(DOOR_H / 2, 1.72, k)
    const lookY = THREE.MathUtils.lerp(DOOR_H / 2, 1.66, k)
    const sx = this.shake ? (Math.random() - 0.5) * 0.006 * this.shake : 0
    const sy = this.shake ? (Math.random() - 0.5) * 0.008 * this.shake : 0
    this.camera.position.set(sx + k * 0.1, y + sy, z)
    this.camera.lookAt(k * 0.12, lookY, 0)
  }

  private resize = (): void => {
    const dpr = Math.min(devicePixelRatio, 2)
    this.renderer.setSize(innerWidth, innerHeight, false)
    this.camera.aspect = innerWidth / innerHeight
    this.camera.updateProjectionMatrix()
    this.drawn.resize(innerWidth, innerHeight, dpr)
  }

  // ---- the ride -----------------------------------------------------------------------------
  /** the call button pressed: in we go */
  open(): void {
    if (this.state !== 'idle') return
    this.show(true)
    this.state = 'closing'
    this.t = 0
    this.target = this.here
    this.setNeedle(this.here)
    this.play('161230', 0.8, 1.6)
    this.stopPage(CLOSE_T)
  }

  private show(on: boolean): void {
    this.cnv.style.display = on ? 'block' : 'none'
    this.cnv.style.pointerEvents = on ? 'auto' : 'none'
    this.call.hidden(on)
    if (!on) document.documentElement.style.cursor = ''
  }

  /** a floor pressed */
  private press(floor: number): void {
    const f = this.floors[floor]
    this.play('579078', 0.9)
    if (!f.href) {
      this.blink = 0
      return
    }
    if (floor === this.here) return this.leave()
    this.target = floor
    this.state = 'riding'
    this.t = 0
    this.startHum()
  }

  /** out again on the same floor: the doors open, the camera to the opening */
  private leave(): void {
    this.state = 'leaving'
    this.t = 0
    this.play('161228', 0.8, 1.0)
    this.stopMusic(OPEN_T)
    this.startPage(OPEN_T + 0.6)
  }

  /** come from another floor: inside, shut, then they open on this page */
  private arrive(musicAt: number): void {
    this.cover.style.display = 'block'
    this.show(true)
    this.state = 'arriving'
    this.t = 0
    this.setDoors(1)
    this.pending = musicAt
    // the doors stay shut until this page is really up: loaded, and a few frames drawn after that
    const settle = () => window.setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => (this.pageReady = true))), 500)
    if (document.readyState === 'complete') settle()
    else window.addEventListener('load', settle, { once: true })
  }
  private pageReady = false
  private pending = -1

  private saved(): { music: number } | null {
    try {
      const s = JSON.parse(sessionStorage.getItem(STORE) ?? 'null')
      sessionStorage.removeItem(STORE)
      if (!s || Date.now() - s.at > 20000) return null // (a heavy page can take a while to come up)
      return { music: s.music ?? 0 }
    } catch {
      return null
    }
  }

  // ---- sound --------------------------------------------------------------------------------
  private load(): void {
    const { ctx } = sfx()
    if (this.track) {
      void fetch(`${import.meta.env.BASE_URL}ui/music/${this.track.id}.mp3`)
        .then((r) => r.arrayBuffer())
        .then((a) => ctx.decodeAudioData(a))
        .then((b) => {
          this.bufs.page = b
          // evened out: tracks come at all levels (peaks from 0.09 to 0.98) — each brought to the same
          // average loudness, so they compare by what they are, not how loud
          const d = b.getChannelData(0)
          let e = 0
          let n = 0
          for (let i = 0; i < d.length; i += 16) {
            e += d[i] * d[i]
            n++
          }
          this.pageLevel = Math.min(10, 0.11 / Math.max(1e-4, Math.sqrt(e / Math.max(1, n))))
        })
    }
    for (const id of ['737948', '161230', '161228', '579078', '634358', MUSIC_ID]) {
      void fetch(`${import.meta.env.BASE_URL}ui/elevator/${id}.mp3`)
        .then((r) => r.arrayBuffer())
        .then((a) => ctx.decodeAudioData(a))
        .then((b) => {
          this.bufs[id] = b
          if (id === MUSIC_ID && this.pending >= 0 && !this.music) this.startMusic(this.pending)
        })
    }
  }

  /** a one-shot, `dur` s of it from where it really starts, its peak brought to `vol` */
  private play(id: string, vol: number, dur?: number): void {
    const { ctx, out } = sfx()
    const b = this.bufs[id]
    if (!b || ctx.state !== 'running') return
    const d = b.getChannelData(0)
    let pk = 0
    for (let i = 0; i < d.length; i += 4) pk = Math.max(pk, Math.abs(d[i]))
    let a = 0
    while (a < d.length && Math.abs(d[a]) < pk * 0.08) a += 32
    const src = ctx.createBufferSource()
    src.buffer = b
    const g = ctx.createGain()
    g.gain.value = (vol * 0.6) / Math.max(1e-3, pk)
    src.connect(g).connect(out)
    const at = Math.max(0, a / b.sampleRate - 0.01)
    const len = Math.min(dur ?? b.duration, b.duration - at)
    g.gain.setValueAtTime(g.gain.value, ctx.currentTime + len * 0.85)
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + len)
    src.start(ctx.currentTime, at, len)
  }

  /** this floor's music, faded in over `fade` s (looped; a fresh place in it each visit) */
  private startPage(fade: number): void {
    if (Q.has('elevdebug')) console.log('[elevator] page music in', ((performance.now() / 1000) % 1000).toFixed(2))
    const { ctx, out } = sfx()
    const b = this.bufs.page
    if (!b || this.page || ctx.state !== 'running') {
      // (not decoded yet: try again shortly)
      // (only while out of the cabin, or on the way out of it)
      if (!this.page && this.track) window.setTimeout(() => ['idle', 'arriving', 'leaving'].includes(this.state) && this.startPage(fade), 400)
      return
    }
    const src = ctx.createBufferSource()
    src.buffer = b
    src.loop = true
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, ctx.currentTime)
    g.gain.linearRampToValueAtTime(PAGE_GAIN * this.pageLevel, ctx.currentTime + fade)
    let head: AudioNode = src
    if (this.track?.radio) {
      // the old radio: a narrow band, a touch of grit, a hiss under it
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 420
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 3200
      const mid = ctx.createBiquadFilter()
      mid.type = 'peaking'
      mid.frequency.value = 1500
      mid.gain.value = 5
      const sat = ctx.createWaveShaper()
      sat.curve = Float32Array.from({ length: 1024 }, (_, i) => Math.tanh(((i / 1023) * 2 - 1) * 2.2) / Math.tanh(2.2))
      head = src.connect(hp).connect(lp).connect(mid).connect(sat)
      const n = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
      const d = n.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.02
      const hiss = ctx.createBufferSource()
      hiss.buffer = n
      hiss.loop = true
      const hb = ctx.createBiquadFilter()
      hb.type = 'bandpass'
      hb.frequency.value = 2500
      hiss.connect(hb).connect(g)
      hiss.start()
      src.addEventListener('ended', () => hiss.stop())
    }
    head.connect(g).connect(out)
    src.start(ctx.currentTime, Math.random() * b.duration)
    this.page = { src, g }
  }

  private stopPage(fade: number): void {
    if (Q.has('elevdebug')) console.log('[elevator] page music out', ((performance.now() / 1000) % 1000).toFixed(2))
    const p = this.page
    if (!p) return
    const { ctx } = sfx()
    p.g.gain.cancelScheduledValues(ctx.currentTime)
    p.g.gain.setValueAtTime(p.g.gain.value, ctx.currentTime)
    p.g.gain.linearRampToValueAtTime(0, ctx.currentTime + fade)
    p.src.stop(ctx.currentTime + fade + 0.05)
    this.page = undefined
  }

  private startMusic(at = 0): void {
    if (Q.has('elevdebug')) console.log('[elevator] elevator music in', ((performance.now() / 1000) % 1000).toFixed(2))
    const { ctx, out } = sfx()
    const b = this.bufs[MUSIC_ID]
    if (!b || this.music || ctx.state !== 'running') return
    const src = ctx.createBufferSource()
    src.buffer = b
    src.loop = true
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, ctx.currentTime)
    g.gain.linearRampToValueAtTime(0.32, ctx.currentTime + 0.8)
    src.connect(g).connect(out)
    const off = at % b.duration
    src.start(ctx.currentTime, off)
    this.music = { src, g, t0: ctx.currentTime, off }
  }

  private musicAt(): number {
    const { ctx } = sfx()
    return this.music ? this.music.off + (ctx.currentTime - this.music.t0) : 0
  }

  private stopMusic(fade: number): void {
    if (Q.has('elevdebug')) console.log('[elevator] elevator music out', ((performance.now() / 1000) % 1000).toFixed(2))
    const m = this.music
    if (!m) return
    const { ctx } = sfx()
    m.g.gain.cancelScheduledValues(ctx.currentTime)
    m.g.gain.setValueAtTime(m.g.gain.value, ctx.currentTime)
    m.g.gain.linearRampToValueAtTime(0, ctx.currentTime + fade)
    m.src.stop(ctx.currentTime + fade + 0.05)
    this.music = undefined
  }

  private startHum(): void {
    const { ctx, out } = sfx()
    const b = this.bufs['634358']
    if (!b || ctx.state !== 'running') return
    const src = ctx.createBufferSource()
    src.buffer = b
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, ctx.currentTime)
    g.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.25)
    g.gain.setValueAtTime(0.5, ctx.currentTime + RIDE_T - 0.35)
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + RIDE_T)
    src.connect(g).connect(out)
    src.start(ctx.currentTime, 6)
    src.stop(ctx.currentTime + RIDE_T + 0.1)
  }

  // ---- input --------------------------------------------------------------------------------
  private onMove = (e: PointerEvent): void => {
    this.ptr.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  }

  private onClick = (e: MouseEvent): void => {
    if (this.state !== 'inside') return
    e.stopPropagation()
    e.preventDefault()
    if (this.hover === this.closeBtn) return this.play('579078', 0.9) // (nothing happens)
    const b = this.buttons.find((q) => q.mesh === this.hover)
    if (b) this.press(b.floor)
  }

  // ---- the frame ----------------------------------------------------------------------------
  private frame = (): void => {
    const now = performance.now()
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    if (this.state === 'idle') return
    this.t += dt
    this.drawn.step(dt)
    let k = 1 // how far into the cabin the camera is
    if (this.state === 'closing') {
      const e = ease(Math.min(1, this.t / CLOSE_T))
      this.setDoors(e)
      k = 0
      if (this.t >= CLOSE_T) {
        this.state = 'stepping'
        this.t = 0
        this.startMusic()
      }
    } else if (this.state === 'stepping') {
      k = ease(Math.min(1, this.t / STEP_T))
      if (this.t >= STEP_T) this.state = 'inside'
    } else if (this.state === 'riding') {
      const e = ease(Math.min(1, this.t / RIDE_T))
      this.needle.rotation.z = -THREE.MathUtils.lerp(this.dialAngle(this.here), this.dialAngle(this.target), e)
      this.shake = Math.sin(Math.min(1, this.t / RIDE_T) * Math.PI) * (1 + Math.sin(this.t * 41) * 0.3)
      if (this.t >= RIDE_T) {
        this.shake = 0
        this.play('737948', 0.9)
        // the chime, then away to that floor (the page loads behind the shut doors)
        try {
          sessionStorage.setItem(STORE, JSON.stringify({ at: Date.now(), music: this.musicAt() }))
        } catch {
          // (private mode: the next page opens without the elevator)
        }
        const href = this.floors[this.target].href!
        this.state = 'inside'
        window.setTimeout(() => (location.href = href), 450)
      }
    } else if (this.state === 'arriving') {
      // inside, a beat, the chime, the doors open and the camera goes to the opening — held shut
      // (and the music playing) until the page behind them is ready
      if (this.cover.style.display !== 'none' && this.t > 0.05) this.cover.style.display = 'none'
      if (!this.pageReady) this.t = Math.min(this.t, 0.1)
      const wait = 0.35
      if (this.t < wait) k = 1
      else {
        if (!this.arrivedChime) {
          this.arrivedChime = true
          this.play('737948', 0.9)
          this.play('161228', 0.8, 1.0)
          this.stopMusic(OPEN_T + 0.4)
          this.startPage(OPEN_T + 0.8)
        }
        const e = ease(Math.min(1, (this.t - wait) / OPEN_T))
        this.setDoors(1 - e)
        k = 1 - e
        if (this.t >= wait + OPEN_T) {
          this.state = 'idle'
          this.show(false)
          this.renderer.clear()
          return
        }
      }
    } else if (this.state === 'leaving') {
      const e = ease(Math.min(1, this.t / OPEN_T))
      this.setDoors(1 - e)
      k = 1 - e
      if (this.t >= OPEN_T) {
        this.state = 'idle'
        this.show(false)
        this.renderer.clear()
        return
      }
    }
    this.pose(k)
    // hover and lights
    this.hover = null
    if (this.state === 'inside') {
      this.ray.setFromCamera(this.ptr, this.camera)
      const hit = this.ray.intersectObjects([...this.buttons.map((b) => b.mesh), ...(this.closeBtn ? [this.closeBtn] : [])])[0]
      this.hover = (hit?.object as THREE.Mesh) ?? null
    }
    document.documentElement.style.cursor = this.hover ? 'pointer' : 'default'
    for (const b of this.buttons) {
      let glow = b.floor === this.target && this.state === 'riding' ? 1 : b.floor === this.here ? 0.55 : 0
      if (b.mesh === this.hover) glow = Math.max(glow, 0.35)
      if (this.blink >= 0 && !this.floors[b.floor].href) glow = Math.floor(this.blink * 6) % 2 === 0 ? 1 : 0
      b.mat.uniforms.uGlow.value += (glow - b.mat.uniforms.uGlow.value) * Math.min(1, dt * 18)
    }
    if (this.blink >= 0) {
      this.blink += dt
      if (this.blink > 1) this.blink = -1
    }
    this.drawn.normalPass(this.scene, this.camera, [this.root])
    this.renderer.render(this.scene, this.camera)
  }
  private arrivedChime = false
}

/**
 * The call button, in the corner where the toaster was: a little plate with the up and down buttons,
 * drawn like the rest. Hover: it lights a touch; press: it lights, and the elevator comes.
 */
class CallButton {
  private cnv = document.createElement('canvas')
  private renderer: THREE.WebGLRenderer
  private drawn: Drawn
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20)
  private root = new THREE.Group()
  private btns: THREE.ShaderMaterial[] = []
  private over = false
  private lit = 0
  private last = performance.now()

  constructor(private onPress: () => void) {
    const W = 74
    const H = 112
    this.cnv.setAttribute('style', `position:fixed;top:14px;right:14px;width:${W}px;height:${H}px;z-index:55;cursor:pointer`)
    document.body.appendChild(this.cnv)
    this.renderer = new THREE.WebGLRenderer({ canvas: this.cnv, alpha: true, antialias: true })
    this.renderer.setClearColor(0x000000, 0)
    const dpr = Math.min(devicePixelRatio, 2)
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(W, H, false)
    this.drawn = new Drawn(this.renderer, W, H, dpr)
    this.camera.aspect = W / H
    this.camera.position.set(0, 0, 3.3)
    this.camera.updateProjectionMatrix()
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.86, 0.05), drawnMat(this.drawn, 0.1))
    this.root.add(plate)
    for (const [y, up] of [
      [0.16, true],
      [-0.16, false],
    ] as const) {
      const mat = drawnMat(this.drawn, 0.15, label(128, 128, (c, w, h) => {
        c.beginPath()
        if (up) {
          c.moveTo(w * 0.5, h * 0.3)
          c.lineTo(w * 0.72, h * 0.66)
          c.lineTo(w * 0.28, h * 0.66)
        } else {
          c.moveTo(w * 0.5, h * 0.7)
          c.lineTo(w * 0.72, h * 0.34)
          c.lineTo(w * 0.28, h * 0.34)
        }
        c.closePath()
        c.fill()
      }))
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 32), mat)
      b.rotation.x = Math.PI / 2
      b.position.set(0, y, 0.04)
      this.root.add(b)
      this.btns.push(mat)
    }
    this.root.rotation.y = -0.18
    this.scene.add(this.root)
    this.cnv.addEventListener('pointerenter', () => (this.over = true))
    this.cnv.addEventListener('pointerleave', () => (this.over = false))
    this.cnv.addEventListener('click', (e) => {
      e.stopPropagation()
      this.lit = 1
      window.setTimeout(this.onPress, 160)
    })
    this.renderer.setAnimationLoop(this.frame)
  }

  hidden(on: boolean): void {
    this.cnv.style.visibility = on ? 'hidden' : 'visible'
    if (!on) this.lit = 0
  }

  private frame = (): void => {
    const now = performance.now()
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    this.drawn.step(dt)
    const g = Math.max(this.lit, this.over ? 0.35 : 0)
    for (const m of this.btns) m.uniforms.uGlow.value += (g - m.uniforms.uGlow.value) * Math.min(1, dt * 14)
    this.root.rotation.y += ((this.over ? -0.05 : -0.18) - this.root.rotation.y) * Math.min(1, dt * 8)
    this.drawn.normalPass(this.scene, this.camera, [this.root])
    this.renderer.render(this.scene, this.camera)
  }
}

/** the site's floors, for the elevator test routes */
const PAGE_TRACKS: Record<string, PageTrack[]> = {
  // the desk: 1 a calm piano, 2 a smooth piano, 3 a downtempo lo-fi, 4 "cute happy",
  // 5 electro swing on vinyl, 6 a jazz piano bar, 7 late-night jazz piano, 8 a minimal vibraphone,
  // 9 a marimba bop, 10 an acoustic guitar, 11 an ice-cream-truck chiptune
  G: [
    { id: '679738' }, { id: '524045' }, { id: '728685' }, { id: '666720' },
    { id: '789403' }, { id: '622423' }, { id: '570349' }, { id: '706092' }, { id: '575759' }, { id: '693197' }, { id: '846171' },
    // 12..17: upbeat garage rock, after "Loud and Clear" (Bob Bradley) — ranked by tempo and tone
    // against Danilo's clip: punk rock, a driving rock, funk rock, energetic rock, two short rock songs
    { id: 'rock/679186' }, { id: 'rock/729754' }, { id: 'rock/724495' }, { id: 'rock/724498' }, { id: 'rock/581557' }, { id: 'rock/693602' },
    // 18..27: more like 9 ("Rabbit Bop"): its author code_box's "Desert Snake", "Sunrise Session",
    // "Octopus Game", "Tropical Cruise"; "Trotting Along", bright pizzicato strings, a strings rag,
    // "Goofs" theme, a marimba, "The Jester"
    { id: '651670' }, { id: '615600' }, { id: '615588' }, { id: '573973' }, { id: '614726' },
    { id: '742677' }, { id: '520931' }, { id: '801873' }, { id: '470958' }, { id: '618499' },
  ],
  // the garage: 1 jazz, 2 another jazz, 3 lo-fi hip hop, 4 chill hip hop, 5 jazz on his old radio,
  // 6 smooth jazz "SpeakEasy", 7 smooth jazz "Quiet Night", 8 R&B "Road Side Cafe", 9 a slow funk,
  // 10 a retrowave night drive, 11 surf rock, 12 a garage blues; 13 "SpeakEasy" on the old radio
  '1': [
    { id: '556290' }, { id: '261100' }, { id: '708776' }, { id: '264081' }, { id: '261100', radio: true },
    { id: '592587' }, { id: '730752' }, { id: '791240' }, { id: '591379' }, { id: '745935' }, { id: '702042' }, { id: '435654' },
    { id: '592587', radio: true },
    // 14..19: the same rock takes
    { id: 'rock/679186' }, { id: 'rock/729754' }, { id: 'rock/724495' }, { id: 'rock/724498' }, { id: 'rock/581557' }, { id: 'rock/693602' },
    // 20..26: more like 8 ("Road Side Cafe"): its author kontraamusic's R&B — "Spacetime", "Space Prism",
    // "Seduction", "Cortana", "Busted", "Never Again" — and a hip hop called "Basement"
    { id: '791242' }, { id: '790957' }, { id: '790943' }, { id: '790930' }, { id: '788457' }, { id: '788449' }, { id: '787728' },
  ],
}

/**
 * `basement` (TEST /hero-predio.html, /garage-predio.html): the building with the garage UNDER it — B on
 * the panel, below the ground floor — so the desk's bin, whose ball drops to the garage, is the
 * building's rubbish chute going down to the basement (it's labelled "about us"): the desk's way
 * there and the elevator's tell the same building
 */
export function mountElevator(here: string, opts: { basement?: boolean } = {}): Elevator {
  const base = import.meta.env.BASE_URL
  const takes = PAGE_TRACKS[here === 'B' ? '1' : here] ?? []
  const pick = Q.get('pagemusic')
  const track = pick === 'off' ? undefined : takes[Math.max(0, Math.min(takes.length - 1, Number(pick ?? 1) - 1))]
  return new Elevator(
    opts.basement
      ? [
          { key: '1', label: 'CONTACT', href: null },
          { key: 'G', label: 'HOME', href: `${base}hero-predio.html` },
          { key: 'B', label: 'ABOUT', href: `${base}garage-predio.html` },
        ]
      : [
          { key: '2', label: 'CONTACT', href: null },
          { key: '1', label: 'ABOUT', href: `${base}garage-elevator.html` },
          { key: 'G', label: 'HOME', href: `${base}hero-elevator.html` },
        ],
    here,
    track,
  )
}

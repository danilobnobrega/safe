import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import gsap from 'gsap'
import { registerChunks } from './chunks'
import { makeGlobals } from './materials'
import { GarageRoom } from './GarageRoom'
import { Post } from './Post'
import { EasedMouse } from './Mouse'
import { Inspect } from './Inspect'
import { ScanFocus } from './Scan'
import { FlexCard } from './FlexCard'
import { Annotations, NOTE_EVERY } from './Annotations'
import { Cards, type Quad } from './Cards'
import { ScrollSnap } from './ScrollSnap'
import { setCursor, setCursorTheme } from '../ui/cursor'

// garage-focus: where the camera ends — facing him from beyond his monitor, raised so it looks
// down over the screen: him and his computer both in frame
const FOCUS_DIST = 1.45 // m out from his face, past the monitor
// garage-focus: the room empties over the camera's own move (CAM_ARRIVE), one thing at a time —
// the last one is gone exactly as the camera settles
// (all in screens of scroll)
const CAM_ARRIVE = 2.8 // the camera reaches its final pose
const FADE_FROM = 0.45
const FADE_TO = CAM_ARRIVE
const FADE_EACH = 0.4 // each object's own fade
const MASK_LAYER = 7 // the set's meshes only (him, chair, desk, screens) — not the room
const NOTES_START = CAM_ARRIVE + 0.3 // then the annotations, one after another
const TAIL = 0.8 // a little room after the last one
// the way out (screens, from the end of the notes): a step back, round behind him to look over
// his shoulder at his screen — which lights up with the first card — and into it
const FIN_BACK = [0.3, 0.9]
const FIN_ORBIT = [0.9, 2.3]
const FIN_LIGHT = [1.3, 1.9]
const FIN_DIVE = [2.3, 3.4]
// near the end of the dive (in the dive's own 0..1), once the lens has cleared, the real card
// takes the screen's place, pinned onto its corners; from there its corners open out to the
// window's, done at FIN_END
const FIN_SWAP = 0.95
// where the dive's carry lands (screens, from finStart), the card filling the window — the same
// beat the card's old fade-in ended on
const FIN_END = 3.45
// the scroll (screens, from finStart) at which the dive reaches a swap point
const swapAt = (swap: number): number => {
  let lo = 0
  let hi = 1
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2
    if (m * m * m * (m * (m * 6 - 15) + 10) < swap) lo = m
    else hi = m
  }
  return FIN_DIVE[0] + hi * (FIN_DIVE[1] - FIN_DIVE[0])
}
// the monitor glass's corners in its own plane (Cards.screen): TL, TR, BR, BL
const SCREEN_CORNERS = [[-0.29, 0.165], [0.29, 0.165], [0.29, -0.165], [-0.29, -0.165]]
const FIN_STACK = 3.6 // then each card slides up over the last, one screen each
const FOCUS_RISE = 0.38 // m above his eyes (the angle Danilo settled on)
const BASE = `${import.meta.env.BASE_URL}garage/`

/**
 * The garage page: the GENERIC office-in-a-garage drawn in chalk on #121212, with a photo ring
 * and a reflective floor — the render pipeline follows steven.com /creator-media (dark theme);
 * see GarageRoom (passes) and Post (screen chain). On top of it, GENERIC's own "scanner":
 *   entrance  out of the hero's wormhole: the page starts on its white flash and the fall carries
 *             on, spiralling down through the photo ring into the room while the scan sweeps
 *             the room into existence, top to bottom (intro)
 *   hover     the cursor is a scanner beam in the drawing + target brackets on objects (Inspect)
 *   click     fly to the object, lock on, scan it, type out why it's there (Scan)
 */
export class Garage {
  private renderer: THREE.WebGLRenderer
  private size = { width: 1, height: 1, pixelRatio: 1 }
  private camera: THREE.PerspectiveCamera
  private cameraMirror: THREE.PerspectiveCamera
  private mouse = new EasedMouse()
  private clock = new THREE.Clock()
  private delta = 0 // seconds * 100, capped at 1/30 s — the original's time unit
  private elapsed = 0
  private room?: GarageRoom
  private post?: Post
  private globals?: ReturnType<typeof makeGlobals>
  private inspect?: Inspect
  private focus?: ScanFocus
  private introBusy = true
  private arrival = { k: 1 } // the entrance's spiral, 0 -> 1
  private arrivalLook = new THREE.Vector3()
  private basePos = new THREE.Vector3()
  private lookTmp = new THREE.Vector3()
  private beamLast = new THREE.Vector2(-9, -9)
  private parallax = 0 // scroll-driven in the original; the page doesn't scroll yet
  private scrollMultiply = 1
  // TEST (/garage-focus.html): the page scrolls on inside the room — the camera closes in on the
  // man at the desk, swinging round to face him, and as he comes to the centre everything else
  // empties out (FOCUS_OUT), as if the whole frame were focused on him
  private focusScroll: boolean
  // TEST (/garage-roles-column.html): the roles scroll up like a page, behind him
  private rolesScroll = false
  // TEST (/garage-roles-cylinder.html): the column wrapped round a drum
  private rolesCylinder = false
  // TEST (/garage-flex.html): card 1 opens out of the monitor as a flexible WebGL sheet
  private flexOpt = false
  private flex?: FlexCard
  private finSwap = FIN_SWAP
  private finSwapAt = 0
  private flexHanded = false // the sheet has settled full screen and the DOM card has taken over
  private maskRT?: THREE.WebGLRenderTarget
  private maskMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  private focusHead = new THREE.Vector3()
  private focusPos = new THREE.Vector3()
  private focusLook = new THREE.Vector3() // what the camera ends up aimed at
  private notes?: Annotations
  private cards?: Cards
  private finStart = Infinity // screens
  private screenC = new THREE.Vector3() // monitor screen centre / normal (toward him), world
  private screenN = new THREE.Vector3()
  private _fp = new THREE.Vector3()
  private _fl = new THREE.Vector3()
  private _fc = new THREE.Vector3()
  private focusSpots = { head: new THREE.Vector3(), shoulderL: new THREE.Vector3(), shoulderR: new THREE.Vector3(), chest: new THREE.Vector3() }
  /** every other object of the set, with its own fade — the room empties one thing at a time,
   *  farthest from him first, as the scroll goes on */
  private focusFades: { u: { value: number }; from: number }[] = []
  private _fd0 = new THREE.Vector3()
  private _fd1 = new THREE.Vector3()
  private _fq = new THREE.Quaternion()
  private _flook = new THREE.Vector3()

  constructor(canvas: HTMLCanvasElement, opts: { focusScroll?: boolean; rolesScroll?: boolean; rolesColumn?: boolean; rolesCylinder?: boolean; flexCard?: boolean } = {}) {
    this.flexOpt = !!opts.flexCard
    // (flex) the card leaves the monitor much earlier — while it's still small on screen — so it has
    // the distance to fly out as a sheet (?swap= to try others)
    if (this.flexOpt) {
      const q = new URLSearchParams(location.search)
      const mode = q.get('flex') ?? 'folha'
      this.finSwap = Number(q.get('swap') ?? (mode === 'amassa' ? 0.35 : mode === 'dobra' ? 0.45 : 0.6))
    }
    this.finSwapAt = swapAt(this.finSwap)
    this.focusScroll = !!opts.focusScroll
    this.rolesScroll = !!opts.rolesScroll || !!opts.rolesColumn || !!opts.rolesCylinder
    this.rolesCylinder = !!opts.rolesCylinder
    registerChunks()
    setCursorTheme('chalk')
    this.readSize()
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      powerPreference: 'high-performance',
      alpha: true,
      precision: 'highp',
      antialias: false,
      depth: false,
      stencil: false,
    })
    this.renderer.setPixelRatio(this.size.pixelRatio)
    this.renderer.setSize(this.size.width, this.size.height)
    this.renderer.setClearColor(0x000000, 0)

    this.camera = new THREE.PerspectiveCamera(this.fov(), this.size.width / this.size.height, 0.1, 100)
    this.camera.position.set(0, 0.91, 3.6)
    this.camera.layers.enable(2)
    this.cameraMirror = this.camera.clone()
    this.cameraMirror.layers.disable(2) // dark theme: the drawings are not reflected

    window.addEventListener('resize', this.onResize)
    // the hero's white flash (it jumps here at the wormhole's white peak), carried over: covers
    // the load, then lifts as the entrance starts. (?from=bin, /hero-paper*: it comes out of the
    // dark at the bottom of the waste bin instead — the same, in black)
    const fromBin = new URLSearchParams(location.search).get('from') === 'bin'
    const white = document.createElement('div')
    white.id = 'arrive-white'
    white.setAttribute('style', `position:fixed;inset:0;background:${fromBin ? '#000' : '#fff'};z-index:10;pointer-events:none;transition:opacity ${fromBin ? '1.1s ease-in' : '.6s ease-out'}`)
    document.body.appendChild(white)
    void this.load()
  }

  private readSize(): void {
    const w = window.innerWidth
    const h = window.innerHeight
    this.size = { width: w, height: h, pixelRatio: Math.min(window.devicePixelRatio, w > 768 ? 1.5 : 2) }
  }

  private fov(): number {
    return this.size.width >= 768 ? 67 : 80
  }

  private async load(): Promise<void> {
    const tl = new THREE.TextureLoader()
    const tex = (name: string, repeatNearest = false) =>
      tl.loadAsync(BASE + name).then((t) => {
        t.colorSpace = THREE.NoColorSpace // shaders read raw values
        if (repeatNearest) {
          t.wrapS = t.wrapT = THREE.RepeatWrapping
          t.minFilter = t.magFilter = THREE.NearestFilter
          t.generateMipmaps = false
        } else {
          t.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
        }
        return t
      })

    const draco = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}draco/`)
    const gltf = new GLTFLoader().setDRACOLoader(draco)

    const [drawing, noise, concrete, photos, model] = await Promise.all([
      tex('drawing.png', true),
      tex('noise.png', true),
      tex('concrete.png', true),
      tex('photos.jpg'),
      gltf.loadAsync(BASE + 'garage.glb'),
    ])

    this.globals = makeGlobals({ drawing, noise })
    this.room = new GarageRoom(this.renderer, this.globals, this.size, { photos, concrete })
    this.room.setModel(model.scene)
    if (this.focusScroll) this.setupFocus()
    this.post = new Post(this.renderer, this.size, { noise })

    const inspect = (this.inspect = new Inspect(this.room.sceneDefault))
    const focus = (this.focus = new ScanFocus(this.globals, inspect))
    document.addEventListener('click', () => {
      if (window.scrollY > 10) return
      if (focus.active) focus.close()
      else if (inspect.current) focus.open(inspect.current, this.camera, this.basePos)
    })
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') focus.close()
    })

    this.intro()
    this.renderer.setAnimationLoop(this.frame)
  }

  /**
   * The entrance, picking up the hero's fall through the wormhole: off the white, the camera
   * spirals down through the photo ring — a turn and a quarter around the set, decelerating —
   * and lands on the resting frame. Meanwhile the scan plane sweeps down from above the ring to
   * the floor (only what's above it exists, freshly scanned strokes come out orange), then the
   * orange settles to chalk. The post chain sits at its resting values throughout.
   */
  private intro(): void {
    const s = this.post!.shared
    s.VIGNETTE_STRENGTH.value = 0.68
    s.BLUR_CENTER_POWER.value = 4
    s.BLUR_STRENGTH.value = 25
    s.DISTORTION_STRENGTH.value = 0
    s.CHROMATIC_ABBERATION_STRENGTH.value = 3.5
    s.CHROMATIC_ABBERATION_POWER.value = 8
    s.BARREL_DISTORT_STRENGTH.value = 0
    s.BLOOM_INTENSITY.value = 0.6

    const g = this.globals!
    g.REVEAL_ON.value = 1
    g.REVEAL_Y.value = 18 // above the highest photo the camera can see (far side of the ring)
    const white = document.getElementById('arrive-white')
    requestAnimationFrame(() => white && (white.style.opacity = '0'))
    setTimeout(() => white?.remove(), 1200)
    this.arrival.k = 0
    gsap.to(this.arrival, { k: 1, duration: 4.6, ease: 'power2.out' })
    // the scan sweeps down ahead of the camera, fast enough that the spiral passes through
    // photos that are already there
    gsap.to(g.REVEAL_Y, {
      value: -0.05,
      duration: 2.2,
      ease: 'power1.out',
      onComplete: () =>
        gsap.to(g.REVEAL_ON, { value: 0, duration: 0.9, ease: 'power1.inOut', onComplete: () => (this.introBusy = false) }),
    })
  }

  /** camera pose along the entrance, k 0 -> 1 (eased); lands exactly on the resting pose */
  private poseArrival(k: number, ax: number, ay: number): void {
    const cam = this.camera
    const rest = this.arrivalLook.set(ax, 0.8 + ay + this.parallax, 0)
    const a = (1 - k) * Math.PI * 2.5 // a turn and a quarter around the set, unwinding
    const r = THREE.MathUtils.lerp(7.5, 3, k)
    const y = THREE.MathUtils.lerp(17, 0.91 - this.parallax * 2, k)
    cam.position.set(Math.sin(a) * r, y, Math.cos(a) * r)
    // looking across the ring (the photo walls fill the view) and a little down, levelling out
    // onto the set as it lands
    cam.lookAt(THREE.MathUtils.lerp(0, rest.x, k), THREE.MathUtils.lerp(y - 1.8, rest.y, k), 0)
    cam.rotateZ((1 - k) * (1 - k) * 0.9)
  }

  /** garage-focus: the man (and his chair) keep their own chalk material, out of FOCUS_OUT; find
   *  his head (the centroid of his topmost vertices) and the way he faces (toward the monitor) */
  private setupFocus(): void {
    const scene = this.room!.sceneDefault
    scene.updateMatrixWorld(true)
    // him, his chair and his computer stay; the rest of the room empties
    const keep = new Set(['employee', 'office_chair', 'monitor', 'keyboard', 'mouse', 'laptop_modern'])
    let monitor: THREE.Object3D | undefined
    let man: THREE.Mesh | undefined
    // (a node can be a mesh or a group of meshes — match on the node or its parent)
    const nameOf = (o: THREE.Object3D) => (keep.has(o.name) ? o.name : o.parent && keep.has(o.parent.name) ? o.parent.name : '')
    const others: { m: THREE.Mesh; at: THREE.Vector3 }[] = []
    scene.traverse((o) => {
      if (o.name === 'monitor') monitor = o
      const m = o as THREE.Mesh
      if (!m.isMesh || m.layers.mask !== 1 << 2) return // the set only (not floor, not photos)
      const nm = nameOf(o)
      if (nm === 'employee' && !man) man = m
      // (/garage-roles-column) the silhouette the roles pass behind: what stays on screen with him —
      // him, his chair, his screens, keyboard, mouse (not the room's other things, which fade away)
      if (nm) m.layers.enable(MASK_LAYER)
      const src = m.material as THREE.ShaderMaterial
      const u = { value: 0 }
      m.material = new THREE.ShaderMaterial({
        vertexShader: src.vertexShader,
        fragmentShader: src.fragmentShader,
        defines: { ...src.defines },
        uniforms: { ...src.uniforms, FOCUS_OUT: u },
      })
      if (!nm) {
        const at = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3())
        others.push({ m, at })
        ;(m.userData as { fade?: { value: number } }).fade = u
      }
    })
    if (!man) {
      console.warn('[garage] focus: no employee mesh')
      return
    }
    const pos = man.geometry.getAttribute('position')
    const v = new THREE.Vector3()
    let top = -Infinity
    for (let i = 0; i < pos.count; i++) top = Math.max(top, v.fromBufferAttribute(pos, i).applyMatrix4(man.matrixWorld).y)
    let n = 0
    this.focusHead.set(0, 0, 0)
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(man.matrixWorld)
      if (v.y > top - 0.2) {
        this.focusHead.add(v)
        n++
      }
    }
    this.focusHead.divideScalar(Math.max(n, 1))
    this.focusHead.y -= 0.06 // eyes, not the crown
    const face = new THREE.Vector3().setFromMatrixPosition((monitor ?? man).matrixWorld).sub(this.focusHead)
    face.y = 0
    face.normalize()
    this.focusPos.copy(this.focusHead).addScaledVector(face, FOCUS_DIST).add(new THREE.Vector3(0, FOCUS_RISE, 0))
    // aimed between his face and the top of the screen, so both sit in the frame
    const screenTop = new THREE.Box3().setFromObject(monitor ?? man).max.y
    const mon = new THREE.Vector3().setFromMatrixPosition((monitor ?? man).matrixWorld)
    this.focusLook.copy(this.focusHead).lerp(mon.setY(screenTop), 0.4)
    // the points the annotations' arrows aim at
    const side = new THREE.Vector3(-face.z, 0, face.x)
    const sp = this.focusSpots
    sp.head.copy(this.focusHead).y += 0.04
    // (all on what shows above his monitor at this angle — his head: the top, either side, the face)
    sp.shoulderL.copy(this.focusHead).addScaledVector(side, 0.11).y -= 0.03
    sp.shoulderR.copy(this.focusHead).addScaledVector(side, -0.11).y -= 0.03
    sp.chest.copy(this.focusHead).addScaledVector(face, 0.08).y -= 0.06
    this.notes = new Annotations()
    this.notes.scrollMode = this.rolesScroll
    this.notes.scrollStyle = this.rolesCylinder ? 'cylinder' : 'column'
    // the cards: card 1 on his monitor's glass
    this.cards = new Cards()
    if (this.flexOpt) this.flex = new FlexCard(this.cards.picture)
    if (monitor) {
      monitor.add(this.cards.screen)
      // the glass, in the monitor's own space (the export centred it in depth: the glass's front is
      // at z 0.044) — a hair proud of it: the chalk shader wobbles surfaces by up to ~1 cm
      this.cards.screen.position.set(0, 0.305, 0.058)
      monitor.updateMatrixWorld(true)
      this.cards.screen.getWorldPosition(this.screenC)
      this.screenN.set(0, 0, 1).transformDirection(this.cards.screen.matrixWorld)
    }
    this.finStart = NOTES_START + this.notes.count * NOTE_EVERY
    // from where the camera first looks at his screen, one nudge carries it into the screen
    // (flex: a longer carry, so the card's own flight has the time to be seen; ?carry= to try)
    new ScrollSnap(this.finStart + FIN_ORBIT[1], this.finStart + FIN_END, this.flexOpt ? Number(new URLSearchParams(location.search).get('carry') ?? 2.8) : undefined)
    // the page is as long as the camera's move, the notes, the way out and the cards
    const scroller = document.getElementById('scroll')
    if (scroller) scroller.style.height = `${(this.finStart + FIN_STACK + (this.cards.count - 1) + TAIL + 1) * 100}vh`
    // farthest from him goes first; each object takes its turn across the scroll
    others.sort((a, b) => b.at.distanceTo(this.focusHead) - a.at.distanceTo(this.focusHead))
    this.focusFades = others.map(({ m }, i) => ({
      u: (m.userData as { fade: { value: number } }).fade,
      from: FADE_FROM + (i / Math.max(others.length - 1, 1)) * (FADE_TO - FADE_FROM - FADE_EACH),
    }))
    console.info('[garage] focus head', this.focusHead.toArray().map((n) => n.toFixed(2)), 'cam', this.focusPos.toArray().map((n) => n.toFixed(2)))
  }

  /** garage-focus: scroll progress -> the camera orbits from where it is round to his face and
   *  closes in; once he's centred, the rest of the room empties out */
  private poseFocus(g: ReturnType<typeof makeGlobals>): void {
    const p = window.scrollY / window.innerHeight // in screens
    const k = THREE.MathUtils.smootherstep(p, 0, CAM_ARRIVE)
    // the photo ring and the floor go first, then the set, one object at a time
    g.FOCUS_OUT.value = THREE.MathUtils.smoothstep(p, 0.15, 1.3)
    for (const f of this.focusFades) f.u.value = THREE.MathUtils.smoothstep(p, f.from, f.from + FADE_EACH)
    // always from the resting pose (the camera keeps last frame's position otherwise)
    this.camera.position.set(0, 0.91 - this.parallax * 2, 3)
    if (k <= 0) {
      this.camera.lookAt(this.lookTmp.set(this.mouse.normalized.x * 0.1, 0.8 + this.mouse.normalized.y * 0.1 + this.parallax, 0))
      return
    }
    // orbit about his head: the direction swings (slerp) while the distance shrinks
    const head = this.focusHead
    this._fd0.copy(this.camera.position).sub(head)
    this._fd1.copy(this.focusPos).sub(head)
    const r = THREE.MathUtils.lerp(this._fd0.length(), this._fd1.length(), k)
    this._fq.setFromUnitVectors(this._fd0.normalize(), this._fd1.normalize())
    this._fq.slerp(new THREE.Quaternion(), 1 - k) // identity -> full rotation
    this.camera.position.copy(head).addScaledVector(this._fd0.applyQuaternion(this._fq), r)
    this._flook.set(0, 0.8, 0).lerp(this.focusLook, k)
    this.camera.lookAt(this._flook)
    this.poseFinale(p)
  }

  /** the way out: back a little, round behind him, over his shoulder, into his screen */
  private poseFinale(p: number): void {
    const cards = this.cards
    if (!cards) return
    const f = p - this.finStart
    const ph = (r: number[]) => THREE.MathUtils.clamp((f - r[0]) / (r[1] - r[0]), 0, 1)
    const sm = (x: number) => x * x * x * (x * (x * 6 - 15) + 10)
    const light = sm(ph(FIN_LIGHT))
    const stack = f - FIN_STACK + 1
    if (f <= FIN_BACK[0]) {
      cards.update(light, null, stack)
      const sh = this.post!.shared
      sh.VIGNETTE_STRENGTH.value = 0.68
      sh.BLUR_STRENGTH.value = 25
      sh.CHROMATIC_ABBERATION_STRENGTH.value = 3.5
      sh.BLOOM_INTENSITY.value = 0.6
      return
    }
    const head = this.focusHead
    const up = new THREE.Vector3(0, 1, 0)
    const side = new THREE.Vector3().crossVectors(up, this.screenN).normalize()
    // 1. a step back
    const back = sm(ph(FIN_BACK))
    const p1 = this._fp.copy(this.focusPos).sub(head).normalize().multiplyScalar(0.55 * back).add(this.focusPos)
    p1.y += 0.08 * back
    // 2. round behind him: over his right shoulder, looking at the screen
    const over = new THREE.Vector3().copy(head).addScaledVector(this.screenN, 0.42).addScaledVector(side, 0.34)
    over.y += 0.16
    const o = sm(ph(FIN_ORBIT))
    const d0 = p1.clone().sub(head)
    const d1 = over.clone().sub(head)
    const r = THREE.MathUtils.lerp(d0.length(), d1.length(), o)
    const q = new THREE.Quaternion().setFromUnitVectors(d0.clone().normalize(), d1.clone().normalize())
    q.slerp(new THREE.Quaternion(), 1 - o)
    const pos = head.clone().addScaledVector(d0.normalize().applyQuaternion(q), r)
    const look = this._fl.copy(this.focusLook).lerp(this.screenC, o)
    // 3. into the screen, until it fills the frame
    const dv = sm(ph(FIN_DIVE))
    // the room's lens (vignette, edge blur, fringe, glow) clears as we go in, so the
    // screen is the card's own clean picture by the time the card takes its place
    // arrives as the card itself — no pop when the real one takes over
    const lens = 1 - THREE.MathUtils.smoothstep(dv, Math.min(0.35, this.finSwap * 0.5), this.finSwap)
    const sh = this.post!.shared
    sh.VIGNETTE_STRENGTH.value = 0.68 * lens
    sh.BLUR_STRENGTH.value = 25 * lens
    sh.CHROMATIC_ABBERATION_STRENGTH.value = 3.5 * lens
    sh.BLOOM_INTENSITY.value = 0.6 * lens
    if (dv > 0) {
      const fit = 0.33 / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)
      const fill = this.screenC.clone().addScaledVector(this.screenN, fit)
      // (flex) the camera stops where the card leaves the glass: the card alone does the travelling
      // (eased to a stop round the swap, no jolt, so the card alone does the travelling after it)
      const half = this.finSwap * 0.5
      pos.lerp(fill, this.flex && dv > half ? half + half * (1 - Math.exp(-(dv - half) / half)) : dv)
      look.copy(this.screenC)
    }
    this.camera.position.copy(pos)
    this.camera.up.set(0, 1, 0)
    this.camera.lookAt(look)
    // the card: from FIN_SWAP pinned onto the screen's corners as the camera sees them, then
    // opening out until they are the window's
    let quad: Quad | null = null
    // (the canvas is the window's full width; the cards' box stops at the scrollbar)
    const corners = (open: number): Quad => {
      this.camera.updateMatrixWorld()
      const W = window.innerWidth
      const H = window.innerHeight
      const [bw, bh] = cards.box
      const win = [[0, 0], [bw, 0], [bw, bh], [0, bh]]
      return SCREEN_CORNERS.map(([x, y], i): [number, number] => {
        const v = this._fc.set(x, y, 0).applyMatrix4(cards.screen.matrixWorld).project(this.camera)
        const px = ((v.x + 1) / 2) * W
        const py = ((1 - v.y) / 2) * H
        return [px + (win[i][0] - px) * open, py + (win[i][1] - py) * open]
      })
    }
    if (dv >= this.finSwap) quad = corners(THREE.MathUtils.smootherstep(f, this.finSwapAt, FIN_END))
    if (this.flex) {
      // the sheet does the opening; the DOM card only takes over once it lies flat, full screen
      const full = !!quad && THREE.MathUtils.smootherstep(f, this.finSwapAt, FIN_END) >= 1
      if (!full) this.flexHanded = false
      if (!(full && this.flexHanded)) {
        // on the way back out, past the swap, the sheet still flies home onto the glass before the
        // monitor takes the picture back
        // (opened out, the sheet aims a few px past the window's edges: settling, its slow trailing
        // side then creeps in from outside the frame rather than showing a sliver of room)
        const openK = THREE.MathUtils.smootherstep(f, this.finSwapAt, FIN_END)
        const out = 2 * openK
        const target = quad ? (quad.map(([x, y], i) => [x + (i === 0 || i === 3 ? -out : out), y + (i < 2 ? -out : out)]) as Quad) : this.flex.active ? corners(0) : null
        this.flex.update(target, quad ? openK : 0)
        if (full && this.flex.settled) this.flexHanded = true
        if (this.flexHanded || (!quad && this.flex.settled)) this.flex.update(null)
      }
      // while the card is off the monitor, its glass is dark behind the sheet (else it shows where
      // the sheet lags)
      cards.update(quad || this.flex.active ? 0 : light, this.flexHanded ? quad : null, stack)
      return
    }
    cards.update(light, quad, stack)
  }

  /** garage-focus: the annotations, after the camera has settled */
  private stepNotes(dt: number): void {
    if (!this.notes) return
    this.camera.updateMatrixWorld()
    this.notes.update(dt, window.scrollY / window.innerHeight, NOTES_START, this.camera, this.focusSpots)
    const u = this.post!.pass0.uniforms
    u.tAnnot.value = this.notes.tex
    const f = window.scrollY / window.innerHeight - this.finStart
    u.uAnnot.value = this.notes.visible && f < FIN_BACK[0] ? 1 : 0 // gone once the way out starts
    // (scroll mode) the set's silhouette — him, his chair, desk, screen — so the text goes behind it
    u.uAnnotMask.value = 0
    if (this.rolesScroll && u.uAnnot.value > 0 && this.room) {
      const w = Math.round(this.size.width * 0.5)
      const h = Math.round(this.size.height * 0.5)
      if (!this.maskRT) this.maskRT = new THREE.WebGLRenderTarget(w, h)
      if (this.maskRT.width !== w || this.maskRT.height !== h) this.maskRT.setSize(w, h)
      const sc = this.room.sceneDefault
      const mask = this.camera.layers.mask
      const bg = sc.background
      const over = sc.overrideMaterial
      const clear = this.renderer.getClearColor(new THREE.Color())
      const alpha = this.renderer.getClearAlpha()
      this.camera.layers.set(MASK_LAYER)
      sc.background = null
      sc.overrideMaterial = this.maskMat
      this.renderer.setClearColor(0x000000, 1)
      this.renderer.setRenderTarget(this.maskRT)
      this.renderer.clear()
      this.renderer.render(sc, this.camera)
      this.renderer.setRenderTarget(null)
      this.renderer.setClearColor(clear, alpha)
      sc.overrideMaterial = over
      sc.background = bg
      this.camera.layers.mask = mask
      u.tAnnotMask.value = this.maskRT.texture
      u.uAnnotMask.value = 1
    }
  }

  private frame = (): void => {
    const room = this.room
    const post = this.post
    const g = this.globals
    const inspect = this.inspect
    const f = this.focus
    if (!room || !post || !g || !inspect || !f) return
    this.delta = Math.min(this.clock.getDelta(), 1 / 30) * 100
    this.elapsed = this.clock.getElapsedTime()

    // update (order as the original: room, eased mouse, camera + mirror)
    room.update(this.elapsed)
    g.uTime.value = this.elapsed
    this.mouse.update(this.delta)
    const ax = this.mouse.normalized.x * 0.1 * this.scrollMultiply
    const ay = this.mouse.normalized.y * 0.1 * this.scrollMultiply
    if (this.arrival.k < 1) {
      this.poseArrival(this.arrival.k, ax, ay)
      this.basePos.copy(this.camera.position)
    } else if (f.t.value > 0) {
      // flying to / at a clicked object: from the room pose to the object's, the mouse look
      // fading out on the way
      const k = f.t.value
      this.camera.position.lerpVectors(this.basePos, f.pos, k)
      this.camera.position.y += Math.sin(Math.PI * k) * 0.5 // arc over the set, not through it
      this.lookTmp.set(ax, 0.8 + ay + this.parallax, 0).lerp(f.look, k)
      this.camera.lookAt(this.lookTmp)
    } else {
      this.camera.lookAt(ax, 0.8 + ay + this.parallax, 0)
      this.camera.position.y = 0.91 - this.parallax * 2
      this.basePos.copy(this.camera.position)
    }
    if (this.focusScroll && this.arrival.k >= 1 && f.t.value === 0) this.poseFocus(g)
    if (this.focusScroll) this.stepNotes(this.delta / 100)
    this.cameraMirror.position.copy(this.camera.position)
    this.cameraMirror.position.y *= -1
    this.cameraMirror.rotation.copy(this.camera.rotation)
    this.cameraMirror.rotation.z = -this.camera.rotation.z
    this.cameraMirror.rotation.x = -this.camera.rotation.x
    this.cameraMirror.rotation.y = this.camera.rotation.y

    // brackets + click scan: pinned on the clicked object through the flight and while there;
    // on the way back, nothing until the camera is home
    // scrolled down (the room on its way off screen): no hover, no click, and an open scan
    // closes
    const scrolled = window.scrollY > 10
    if (scrolled && f.active) f.close()
    inspect.pinned = f.active
    inspect.enabled = !this.introBusy && !scrolled && (!!f.active || f.t.value === 0)
    this.camera.updateMatrixWorld()
    inspect.extraPad = f.lock.value
    inspect.update(this.camera)
    f.update()
    const u = post.pass0.uniforms
    u.uShade.value = f.shade.value
    u.uShadeRect.value.copy(f.shadeRect)
    u.uShade2.value += ((inspect.labelShown ? 1 : 0) - u.uShade2.value) * 0.2 // under the hover label
    u.uShadeRect2.value.copy(inspect.labelRect)
    setCursor('garage', inspect.current || f.active ? 'pointer' : '')

    // the beam's trail: the head always sits on the cursor; a new point is dropped whenever it
    // has moved far enough, and every point fades (~0.7 s)
    g.BEAM_ASPECT.value = this.size.width / this.size.height
    const on = !this.introBusy && !scrolled && f.t.value === 0 ? 1 : 0
    g.BEAM_ON.value += (on - g.BEAM_ON.value) * 0.1
    const pts = g.BEAM.value
    const fade = Math.exp(-this.delta / 100 / 0.7)
    for (const p of pts) p.z *= fade
    const x = this.mouse.normalized1.x * 0.5 + 0.5
    const y = this.mouse.normalized1.y * 0.5 + 0.5
    if (Math.hypot(x - this.beamLast.x, y - this.beamLast.y) > 0.03) {
      pts.unshift(pts.pop()!.set(x, y, 1))
      this.beamLast.set(x, y)
    } else pts[0].set(x, y, 1)

    // render
    room.renderPipeline(this.camera, this.cameraMirror)
    post.render(room.rtDefault.texture, room.rtBloom.texture)
  }

  private onResize = (): void => {
    this.readSize()
    this.renderer.setPixelRatio(this.size.pixelRatio)
    this.renderer.setSize(this.size.width, this.size.height)
    this.camera.aspect = this.size.width / this.size.height
    this.camera.fov = this.fov()
    this.camera.updateProjectionMatrix()
    this.cameraMirror.aspect = this.camera.aspect
    this.cameraMirror.fov = this.camera.fov
    this.cameraMirror.updateProjectionMatrix()
    this.room?.resize(this.size)
    this.post?.resize(this.size)
  }
}

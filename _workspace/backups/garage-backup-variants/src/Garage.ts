import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import gsap from 'gsap'
import { registerChunks } from './chunks'
import { makeGlobals, raw } from './materials'
import { GarageRoom } from './GarageRoom'
import { Post } from './Post'
import { CursorLine, EasedMouse } from './CursorLine'
import { ApproachIntro } from './ApproachIntro'
import { CurtainIntro } from './CurtainIntro'
import { Inspect } from './Inspect'
import { Focus } from './Focus'
import { ScanFocus } from './Scan'

const BASE = `${import.meta.env.BASE_URL}garage/`

/**
 * The garage page: the GENERIC office-in-a-garage drawn in white chalk on #121212,
 * with a photo ring, a reflective floor and a chalk cursor. Pipeline, values and the
 * entrance choreography follow steven.com /creator-media (dark theme); see
 * GarageRoom (passes), Post (screen chain), CursorLine (hover).
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
  private cursor?: CursorLine
  private globals?: ReturnType<typeof makeGlobals>
  // TEST variant ?v=b: GENERIC palette (paper line, graphite hatch, neutral floor/bloom) and
  // the hero's end-of-tunnel approach as the opening instead of steven.com's entrance
  // TEST variant ?v=c: same palette; the black shape closes on pure white and the white then
  // turns into the room (CurtainIntro) — exposure down + defocus-to-focus + the last of the fall
  private variantC = new URLSearchParams(location.search).get('v') === 'c'
  // TEST variant ?v=d: as c, but the tiny shape bursts open into the scene, then the zoom-in
  private variantD = new URLSearchParams(location.search).get('v') === 'd'
  // TEST variant ?v=e: as d, but the burst rounds off into a circle as it grows
  private variantE = new URLSearchParams(location.search).get('v') === 'e'
  // TEST variant ?v=s: same palette; the entrance is a scan — a plane sweeping down the room,
  // which only exists above it (introS)
  private variantS = new URLSearchParams(location.search).get('v') === 's'
  private variantB =
    this.variantC || this.variantD || this.variantE || this.variantS || new URLSearchParams(location.search).get('v') === 'b'
  private introBusy = false
  // TEST ?beam=1: the cursor as a scanner beam in the drawing (strokes near its trail go orange)
  private beam = new URLSearchParams(location.search).has('beam')
  private beamLast = new THREE.Vector2(-9, -9)
  private approach?: ApproachIntro | CurtainIntro
  // TEST hovers, in place of the chalk cursor: ?h=inspect (DevTools box model over the object
  // under the cursor) / ?h=light (the cursor is the light the hatching is shaded from)
  private hover = new URLSearchParams(location.search).get('h')
  private inspect?: Inspect
  private focus?: Focus | ScanFocus // ?h=inspect / ?h=scan: click an object to fly to it
  private basePos = new THREE.Vector3()
  private lookTmp = new THREE.Vector3()
  private parallax = 0 // scroll-driven in the original; the page doesn't scroll yet
  private scrollMultiply = 1

  constructor(canvas: HTMLCanvasElement) {
    registerChunks()
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
    this.camera.position.set(0, 0.91, 8)
    this.camera.layers.enable(2)
    this.cameraMirror = this.camera.clone()
    this.cameraMirror.layers.disable(2) // dark theme: the drawings are not reflected

    window.addEventListener('resize', this.onResize)
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

    const [drawing, drawingCursor, noise, concrete, photos, model] = await Promise.all([
      tex('drawing.png', true),
      tex('drawing-cursor.png', true),
      tex('noise.png', true),
      tex('concrete.png', true),
      tex('photos.jpg'),
      gltf.loadAsync(BASE + 'garage.glb'),
    ])

    this.globals = makeGlobals({ drawing, noise })
    if (this.variantB) {
      const g = this.globals
      g.DRAWING_BASE_COLOR_B.value = raw(0xefeee7) // the GENERIC paper, not pure white chalk
      g.SHADOW_SIZE.value = 48 // finer hatch: graphite, not chalk
      g.SHADOW_OPACITY.value = 0.3 // ...a touch denser and greyer
      g.REFLECTION_COLOR_A.value = raw(0xe9e7e2) // neutral floor: colour only from the photos
      g.REFLECTION_COLOR_B.value = raw(0xd9d7d2)
    }
    this.room = new GarageRoom(this.renderer, this.globals, this.size, { photos, concrete })
    this.room.setModel(model.scene)
    this.post = new Post(this.renderer, this.size, { noise, drawingCursor })
    this.cursor = new CursorLine(this.renderer, this.size)
    if (this.hover) this.post.pass0.uniforms.uCursorToggle.value = 0
    if (this.hover === 'inspect' || this.hover === 'scan') {
      const scan = this.hover === 'scan'
      const labelGlass = new URLSearchParams(location.search).get('l') === 'glass'
      const inspect = (this.inspect = new Inspect(this.room.sceneDefault, scan ? 'brackets' : 'devtools', labelGlass))
      const focus = (this.focus = scan
        ? new ScanFocus(this.globals, inspect, (new URLSearchParams(location.search).get('r') ?? 'plain') as 'plain' | 'glass' | 'shade')
        : new Focus(this.room.sceneDefault, this.renderer, () =>
            gltf.loadAsync(BASE + 'garage-color.glb').then((g) => g.scene),
          ))
      document.addEventListener('click', () => {
        if (focus.active) focus.close()
        else if (inspect.current) void focus.open(inspect.current, this.camera, this.basePos)
      })
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') focus.close()
      })
    }
    if (this.hover === 'light') this.globals.SHADOW_OPACITY.value = 0.55 // it's the show now

    // jitter of the chalk cursor
    setInterval(() => {
      if (this.post) this.post.pass0.uniforms.uRandom.value = Math.random()
    }, 250)

    if (this.variantB) {
      this.post.shared.BLOOM_COLOR.value = raw(0xf2f0ea) // neutral glow
      if (this.variantS) this.introS()
      else {
        this.approach =
          this.variantC || this.variantD || this.variantE
            ? new CurtainIntro(this.renderer, this.size, this.variantD ? 'rhombus' : this.variantE ? 'circle' : false)
            : new ApproachIntro(this.renderer, this.size)
        this.introB()
      }
    } else {
      this.intro()
    }
    this.renderer.setAnimationLoop(this.frame)
  }

  /**
   * Entrance, as it lands on the room page: circle wipe out of the light preloader colour
   * (4 s expo), camera dolly 8 -> 3, edge blur/vignette settling, a chromatic kick, bloom
   * fading up. Tweens that the original overwrote (overwrite: true) are simply omitted.
   */
  private intro(): void {
    const post = this.post!
    const s = post.shared
    // intro timeline (only the parts that survive the reveal's overwrites)
    gsap.fromTo(post.vBlur.uniforms.uTransition, { value: 0 }, { value: 1, duration: 4, ease: 'expo.inOut' })
    gsap.fromTo(s.CHROMATIC_ABBERATION_POWER, { value: 0 }, { value: 8, duration: 4, ease: 'power2.inOut' })
    // individual scene reveal
    gsap.fromTo(s.VIGNETTE_STRENGTH, { value: 0 }, { value: 0.68, duration: 3, ease: 'power3.inOut' })
    gsap.fromTo(post.pass0.uniforms.uCursorVisibility, { value: 0 }, { value: 1, duration: 2, ease: 'none', delay: 1 })
    gsap.fromTo(s.BLUR_CENTER_POWER, { value: 0 }, { value: 4, duration: 3, ease: 'power2.out' })
    gsap.fromTo(s.BLUR_STRENGTH, { value: 25 }, { value: 25, duration: 3, ease: 'power2.out' })
    gsap.fromTo(s.DISTORTION_STRENGTH, { value: 0.1 }, { value: 0, duration: 3, ease: 'power2.out' })
    gsap.fromTo(
      s.CHROMATIC_ABBERATION_STRENGTH,
      { value: 3.5 },
      { value: 12.5, duration: 1.25, ease: 'power2.inOut', yoyo: true, repeat: 1, delay: 0.5 },
    )
    gsap.fromTo(this.camera.position, { z: 8 }, { z: 3, duration: 3, ease: 'power3.out' })
    gsap.fromTo(s.BARREL_DISTORT_STRENGTH, { value: -0.2 }, { value: 0, duration: 3, ease: 'power2.out' })
    gsap.to(s.BLOOM_INTENSITY, { value: 0.6, duration: 3, delay: 1, ease: 'power2.inOut' })
  }

  /** variant B: no steven.com entrance — the post chain starts at its resting values and the
   *  approach (ApproachIntro) plays on top, handing off to the room as it fades */
  private introB(): void {
    const post = this.post!
    const s = post.shared
    post.vBlur.uniforms.uTransition.value = 1
    post.pass0.uniforms.uCursorVisibility.value = 1
    s.VIGNETTE_STRENGTH.value = 0.68
    s.BLUR_CENTER_POWER.value = 4
    s.BLUR_STRENGTH.value = 25
    s.DISTORTION_STRENGTH.value = 0
    s.CHROMATIC_ABBERATION_STRENGTH.value = 3.5
    s.CHROMATIC_ABBERATION_POWER.value = 8
    s.BARREL_DISTORT_STRENGTH.value = 0
    s.BLOOM_INTENSITY.value = 0.6
    this.camera.position.z = 5.5
  }

  /** variant S: the room is scanned into existence — a plane sweeps down from above the photo
   *  ring to the floor (fast through the ring, slowing over the set), everything above it drawn,
   *  fresh strokes orange; then the orange settles to chalk. One gesture, with a slight push in */
  private introS(): void {
    this.introB()
    const g = this.globals!
    this.introBusy = true
    g.REVEAL_ON.value = 1
    g.REVEAL_Y.value = 18 // above the highest photo the camera can see (far side of the ring)
    this.camera.position.z = 3.6
    gsap.to(this.camera.position, { z: 3, duration: 4, delay: 0.3, ease: 'power2.out' })
    gsap.to(g.REVEAL_Y, {
      value: -0.05,
      duration: 3.2,
      delay: 0.4,
      ease: 'power2.out',
      onComplete: () => {
        gsap.to(g.REVEAL_ON, {
          value: 0,
          duration: 0.9,
          ease: 'power1.inOut',
          onComplete: () => (this.introBusy = false),
        })
      },
    })
  }

  private frame = (): void => {
    const room = this.room
    const post = this.post
    const cursor = this.cursor
    if (!room || !post || !cursor || !this.globals) return
    this.delta = Math.min(this.clock.getDelta(), 1 / 30) * 100
    this.elapsed = this.clock.getElapsedTime()

    // variant B: the fall keeps going into the room while it crossfades (z 5.5 -> 3)
    const ap = this.approach
    if (ap && !ap.done) {
      ap.update(this.delta / 100)
      this.camera.position.z =
        ap instanceof CurtainIntro ? THREE.MathUtils.lerp(ap.zoomFrom, 3, ap.zoom) : THREE.MathUtils.lerp(5.5, 3, ap.settle)
      // v=c: the room comes out of an even full-frame defocus as the black shape closes — the
      // centre (where the shape is) only turns sharp at the very end; edges keep their blur
      if (ap instanceof CurtainIntro) post.shared.BLUR_FLOOR.value = 1 - ap.focus
    }

    // update (order as the original: room, eased mouse, camera + mirror, cursor)
    room.update(this.elapsed)
    this.globals.uTime.value = this.elapsed
    this.mouse.update(this.delta)
    const ax = this.mouse.normalized.x * 0.1 * this.scrollMultiply
    const ay = this.mouse.normalized.y * 0.1 * this.scrollMultiply
    const f = this.focus
    if (f && f.t.value > 0) {
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
    this.cameraMirror.position.copy(this.camera.position)
    this.cameraMirror.position.y *= -1
    this.cameraMirror.rotation.copy(this.camera.rotation)
    this.cameraMirror.rotation.z = -this.camera.rotation.z
    this.cameraMirror.rotation.x = -this.camera.rotation.x
    this.cameraMirror.rotation.y = this.camera.rotation.y
    cursor.update(this.mouse.normalized1, this.camera, this.elapsed)
    if (this.inspect) {
      // clicked: the DevTools overlay stays pinned on the object through the flight and while
      // there; on the way back, nothing until the camera is home
      this.inspect.pinned = f?.active
      this.inspect.enabled = (!ap || ap.done) && !this.introBusy && (!!f?.active || (f?.t.value ?? 0) === 0)
      this.camera.updateMatrixWorld()
      if (f instanceof ScanFocus) this.inspect.extraPad = f.lock.value
      this.inspect.update(this.camera)
      if (f instanceof ScanFocus) {
        f.update()
        post.pass0.uniforms.uShade.value = f.shade.value
        post.pass0.uniforms.uShadeRect.value.copy(f.shadeRect)
        if (f.readout === 'shade' && !this.inspect.labelGlass) {
          // the hover label gets the same treatment
          const u = post.pass0.uniforms.uShade2
          u.value += ((this.inspect.labelShown ? 1 : 0) - u.value) * 0.2
          post.pass0.uniforms.uShadeRect2.value.copy(this.inspect.labelRect)
        }
      }
      document.body.style.cursor = this.inspect.current || f?.active ? 'pointer' : ''
    }
    if (this.hover === 'light') {
      // the light sits in front of the set, where the cursor is: faces turned away from it get
      // the hatching, and it thickens with distance from the cursor
      const m = this.mouse.normalized1
      this.globals.SHADOW_DIR.value.set(-m.x * 1.3, -m.y * 1.3, -0.7)
      this.globals.SHADOW_LIGHT_NDC.value.set(m.x * 0.5 + 0.5, m.y * 0.5 + 0.5)
      this.globals.SHADOW_FALLOFF.value = 0.5
    }

    if (this.beam) {
      // the beam's trail: the head always sits on the cursor; a new point is dropped whenever
      // it has moved far enough, and every point fades (~0.7 s)
      const g = this.globals
      g.BEAM_ASPECT.value = this.size.width / this.size.height
      const on = !this.introBusy && !(f && f.t.value > 0) ? 1 : 0
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
    }

    // render
    room.renderPipeline(this.camera, this.cameraMirror)
    cursor.render(this.camera)
    post.render(room.rtDefault.texture, room.rtBloom.texture, cursor.renderTarget.texture)
    if (ap && !ap.done) ap.render()
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
    if (this.hover && this.post) this.post.pass0.uniforms.uCursorToggle.value = 0
    this.cursor?.resize(this.size)
    this.approach?.resize(this.size)
  }
}

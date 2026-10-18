import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { DRAWN_GLSL, type Drawn } from '../hero/Drawn'
import { PrinterSound } from './PrinterSound'
import { LampCreak } from './LampCreak'
import { PaperCrumple } from './PaperCrumple'
import { PaperToss, TOSS_TEST } from './PaperToss'
import { PaperThrow } from './PaperThrow'
import { BallHits, HITS_ON, type Surface } from './BallHits'
import { DiveSound } from './DiveSound'
import { DrawerSound } from './DrawerSound'
import { BinSound } from './BinSound'
import { setCursor, setCursorTheme } from '../ui/cursor'
import { Spring, flatten, deskReactor, pensReactor, binReactor, printerReactor, lampReactor, clockReactor, booksReactor, plantReactor, type Reactor } from './DeskReactions'

/**
 * TEST (/hero-paper.html): behind the cubes, no tunnel — a desk. The hero you were just looking at
 * was a drawing on a sheet of paper lying on it: printed exactly as you left it (the frame from the
 * moment you started to scroll). Drag the sheet to crumple it into a ball, throw the ball in the
 * bin. A miss leaves the ball where it fell and the next draft slides onto the desk; a hit dives
 * into the bin, whose dark is where the wormhole to the next page opens (`onDone`).
 *
 * The room is drawn in the garage's chalk (light lines on the dark, the hero's Drawn pass); what
 * you hold — the paper, the ball — is real (lit, the studio light, like the toast in the hero).
 * The crumpling is baked (tools/behind/crumple_pbd.py — a paper simulation: inextensible, creasing,
 * self-colliding, closed in by the hands) and scrubbed by the drag; the ball is a Rapier body.
 */

const BASE = `${import.meta.env.BASE_URL}behind/`
const SHEET_W = 0.297 // A4, landscape
const SHEET_H = 0.21
const CHALK_DARK = new THREE.Color(0x121212)
const CRUMPLE_DRAG = 1.1 // screen heights of dragging that crumple a sheet all the way
// how far a toss goes: the bin's distance, scaled gently by the flick's speed (so speed matters
// a little, direction a lot — Danilo found the first, speed-to-metres mapping impossible)
const AIM_SPEED = 2400 // px/s: a flick this fast goes exactly the bin's distance
const AIM_SPEED_POW = 0.3
const AIM_ILLUSION = Number(new URLSearchParams(location.search).get('illusion') ?? 0.32) // m beyond where it looks aimed
const AIM_ASSIST = { r: 0.4, k: 0.85 } // within r metres of the bin a landing is drawn k of the way in
const INTRO_TIME = 3.0
/** Rapier, initialised once for the page. The hero's cookie pile (CrumbRain) already initialises it;
 *  a second RAPIER.init() re-instantiates the wasm under the pile's live world — it broke the pile
 *  (cookies stopping halfway down) and was what trapped the desk's own physics. So: wait for the
 *  pile's init (a World can be made), and only init here if nobody else does within a few seconds */
async function rapierReady(): Promise<void> {
  const ok = () => {
    try {
      new RAPIER.World({ x: 0, y: 0, z: 0 }).free()
      return true
    } catch {
      return false
    }
  }
  for (let t = 0; t < 6000; t += 100) {
    if (ok()) return
    await new Promise((r) => setTimeout(r, 100))
  }
  await RAPIER.init()
}

const DIVE_TIME = 1.7
const BALL_R = 0.033
const Q = new URLSearchParams(location.search)
// TEST (Danilo, 2026-10-11): ?lamp=low — the lamp pulled down over the desk, all of it in frame; default —
// as before, its shade out of frame at the top
// TEST (Danilo, 2026-10-12): the small things at the back of the desk read too small to see their
// hover. ?props=big — the pens and pencils bigger; ?props=mix — bigger, and some swapped for bigger
// desk things (an alarm clock, a stack of books, a potted succulent)
const PROPS = Q.get('props') ?? ''
const LAMP_LOW = Q.get('lamp') !== 'high' // lowered in its rig so all of it shows in the v3 framing
const num = (k: string, d: number) => (Q.has(k) ? Number(Q.get(k)) : d)
const PRINTER_SCALE = num('ps', 1.5)
const PRINT_SLOT_Y = Number(new URLSearchParams(location.search).get('sloty') ?? 0.032) // (above the output tray's front lip — at 0.02 the lip drew across the sheet) // the model is a small inkjet: at this size an A4 comes out landscape
const PRINTER_AT = { x: num('px', 0.1), z: num('pz', -0.27), yaw: num('pyaw', 0.12) }
const LAMP_AT = { x: num('lx', 1.0), z: num('lz', 0.25), yaw: num('ly', 0.1) } // clamped to the desk's right edge, the arm out over the floor, the shade over the desk
const PRINT_LAG = 0.3 // s: the paper path, from going in at the back to showing at the front
const PRINT_SIZE = { along: 1.2, across: 1.08 } // the printed pages vs the hero's sheet
const DRAFT_TURN = Number(new URLSearchParams(location.search).get('turn') ?? 1) // (which quarter-turn reads upright)
const PRINT_WAIT = 0.35 // s: the printer taking the sheet in
const PRINT_FEED = 1.7 // s to feed it out
const PAPER_GLOW = 0.1 // the paper's own light once it's lit (keeps it reading white on the dark room)
const BIN = { x: 1.35, z: 0.55, rBottom: 0.115, rTop: 0.15, h: 0.32 }

type State = 'intro' | 'play' | 'dive' | 'done'

interface Sheet {
  mesh: THREE.Mesh
  crumple: number // 0 flat .. 1 a ball
  body?: RAPIER.RigidBody // once it's a ball (or thrown)
  scored: boolean
  restT: number // how long it's been at rest since its last throw
  thrown: boolean
  missDealt: boolean
}

const CHALK_VERT = /* glsl */ `
  varying vec3 vViewN;
  varying vec4 vClip;
  void main() {
    vViewN = normalize(normalMatrix * normal);
    vClip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = vClip;
  }
`

export class PaperDesk {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.01, 30)
  onDone?: () => void
  onDive?: () => void

  private state: State = 'intro'
  private t = 0
  private ready = false
  private chalkRoots: THREE.Object3D[] = []
  private chalkMat: THREE.ShaderMaterial
  private paperGeo?: THREE.BufferGeometry
  private keys = 0
  private sheets: Sheet[] = []
  private active?: Sheet // the sheet on the desk (not yet a ball)
  private held?: Sheet // the sheet or ball in the hand
  private deskTop = 0.79
  private sheetSpot = new THREE.Vector3(0.12, 0, 0.14)
  private sheetYaw = 0.06
  private env?: THREE.Texture
  private world?: RAPIER.World
  private acc = 0
  private draft = 1
  private reactors: Reactor[] = []
  private binR?: ReturnType<typeof binReactor>
  private lastReact = new Map<object, number>()
  // the printer: click it and the next draft comes out (Danilo's idea, 2026-10-11)
  private printer?: THREE.Group
  private printerLight?: THREE.MeshBasicMaterial
  // the printer's call (Danilo): after the first miss — the hero's own sheet — an orange chalk ring
  // on the desk round the printer pulses, and stays until a ball goes in
  private printerCall?: THREE.Mesh
  private printerSound = new PrinterSound()
  private lampCreak = new LampCreak()
  private crumpleSound = new PaperCrumple()
  private tossSound = new PaperToss() // (parked: ?toss=on)
  private throwSound = new PaperThrow()
  private hitSound = new BallHits(this.crumpleSound)
  private diveSound = new DiveSound(BIN.h)
  private drawerSound = new DrawerSound()
  private binSound = new BinSound()
  private drawersAt?: () => number[]
  private deskObj?: THREE.Object3D
  private diveWas = new THREE.Vector3()
  private lastDt = 1 / 60
  private crumpleLast = { c: 0, x: 0 } // (the last sheet crumpled: for its after-ticks)
  private lampSwingV?: () => number
  private lampNod?: () => [number, number]
  // (creak) the middle of the shade, in the shade's own frame — followed on screen each frame: what
  // the eye sees move, both joints together
  private lampShade?: THREE.Vector3
  private lampWas?: THREE.Vector3 // (creak) the shade's middle a frame ago, in the world
  private printing?: { s: Sheet; t: number }
  private printerFwd = new THREE.Vector3()
  private printerSlot = new THREE.Vector3()
  /** the printer as the balls meet it: its box (and output tray), in world space */
  /** the one path a printed sheet travels, in world space, sampled densely: lying on the stack up the
   *  back tray, down into the printer, round the roller (a curve), out of the front slot and flat over
   *  the output tray. `cum` the arc length at each point; sHead where the head prints, sSlot the slot */
  private paperPath?: { pts: THREE.Vector3[]; cum: number[]; sHead: number; sSlot: number; across: THREE.Vector3; len: number; wid: number }
  private ribbon?: THREE.Mesh
  private printerSolids: { centre: THREE.Vector3; half: THREE.Vector3; quat: THREE.Quaternion }[] = []
  // the paper path's way in: the stack on the back tray, and the sheet being drawn in
  private feedIn?: { sheet: THREE.Mesh; bottom: THREE.Vector3; down: THREE.Vector3; up: THREE.Vector3; len: number }
  private key?: THREE.DirectionalLight
  private lampHead?: THREE.Object3D
  private lampSwing?: () => number
  private lastPtr = { x: 0, y: 0, t: 0 }
  private ptrVel = new THREE.Vector2()
  private misses = 0
  private printTex: THREE.WebGLRenderTarget
  private printScene = new THREE.Scene()
  private printCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private printMat: THREE.ShaderMaterial
  private fade = 1
  private fadeScene = new THREE.Scene()
  private fadeMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthTest: false, depthWrite: false })
  private ray = new THREE.Raycaster()
  private ndc = new THREE.Vector2()
  private pointer = new THREE.Vector2(0.5, 0.5) // css px, last seen
  private down = false
  private dragPx = 0
  private twistDir = new THREE.Vector2() // (crumple sound) the drag's recent way, to hear it turn back
  private holdPlane = new THREE.Plane()
  private holdTrail: { p: THREE.Vector3; t: number }[] = []
  private pxTrail: { x: number; y: number; t: number }[] = []
  private holdTarget = new THREE.Vector3()
  private finalPose = { pos: new THREE.Vector3(0.0, 1.85, 1.7), look: new THREE.Vector3(0.62, 0.5, -0.05) } // v3 (Danilo's pick, 2026-10-12)
  private introFrom = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() }
  private diveFrom = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() }
  private printAspect = 16 / 9
  private printMap?: THREE.Texture
  private shown = false
  private flatCentre = new THREE.Vector3()
  private direct = false
  private cursor = ''
  private _v = new THREE.Vector3()
  private _q = new THREE.Quaternion()
  private _m = new THREE.Matrix4()

  constructor(
    private renderer: THREE.WebGLRenderer,
    private drawn: Drawn,
    private view: () => { w: number; h: number },
    /** the camera's resting pose on the desk [pos x,y,z, look x,y,z] (/hero-paper-v2, -v3, -v4) */
    pose0?: number[],
  ) {
    this.scene.background = CHALK_DARK.clone()
    this.chalkMat = new THREE.ShaderMaterial({
      uniforms: { ...(drawn.uniforms as unknown as Record<string, THREE.IUniform>) },
      vertexShader: CHALK_VERT,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vViewN;
        varying vec4 vClip;
        ${DRAWN_GLSL}
        void main() {
          vec2 suv = (vClip.xy / vClip.w) * 0.5 + 0.5;
          // the garage's hand: chalk on the dark — the hero's graphite pass, inverted
          float ink = drawnInk(suv, vViewN);
          gl_FragColor = vec4(mix(vec3(0.071), vec3(0.937, 0.930, 0.902), ink * 0.92), 1.0);
        }`,
    })
    // the print: the hero frame laid on an A4 sheet (contained, the hero's own paper filling the
    // margins), into a texture the paper's material reads
    this.printTex = new THREE.WebGLRenderTarget(2048, Math.round((2048 * SHEET_H) / SHEET_W))
    this.printTex.texture.colorSpace = THREE.SRGBColorSpace
    this.printTex.texture.anisotropy = 8
    this.printMat = new THREE.ShaderMaterial({
      uniforms: { tSnap: { value: null }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uBlank: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D tSnap;
        uniform vec4 uRect; // where the print sits on the sheet (x0, y0, x1, y1)
        uniform float uBlank;
        varying vec2 vUv;
        // the snapshot holds the screen's bytes (display-encoded): back to linear, since the print
        // target stores sRGB itself
        vec3 snap(vec2 uv) {
          vec3 c = texture2D(tSnap, uv).rgb;
          return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
        }
        void main() {
          vec3 paper = snap(vec2(0.01, 0.99)); // the hero's own paper, from its corner
          vec2 q = (vUv - uRect.xy) / (uRect.zw - uRect.xy);
          vec3 col = (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0 || uBlank > 0.5) ? paper : snap(q);
          gl_FragColor = vec4(col, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    })
    this.printScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.printMat))
    const fadeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.fadeMat)
    fadeQuad.frustumCulled = false
    this.fadeScene.add(fadeQuad)
    // (tuning: ?pose=x,y,z,lookx,looky,lookz overrides where the camera ends up)
    const pose = new URLSearchParams(location.search).get('pose')?.split(',').map(Number) ?? pose0
    const bin = new URLSearchParams(location.search).get('bin')?.split(',').map(Number)
    if (bin?.length === 2) {
      BIN.x = bin[0]
      BIN.z = bin[1]
    }
    if (pose?.length === 6) {
      this.finalPose.pos.set(pose[0], pose[1], pose[2])
      this.finalPose.look.set(pose[3], pose[4], pose[5])
    }
    void this.load()
  }

  // ---- building the room --------------------------------------------------------------
  private async load(): Promise<void> {
    const loader = new GLTFLoader()
    const hdrP = new RGBELoader().loadAsync(`${import.meta.env.BASE_URL}hero/tunnel/studio_1k.hdr`)
    const glb = (id: string) => loader.loadAsync(`${BASE}models/${id}/${id}.gltf`).then((g) => g.scene)
    const [deskSrc, pensSrc, printerSrc, lampSrc, crumple] = await Promise.all([
      glb('metal_office_desk'),
      glb('stationery_supplies'),
      loader.loadAsync(`${BASE}models/printer/printer.glb`).then((g) => g.scene),
      // Poly Haven's desk_lamp_arm_01, posed lower in Blender (tools: scratchpad pose_lamp.py) and cut
      // into its three rigid parts: base (clamp), swivel (arms, springs) and head, each on its pivot
      loader.loadAsync(`${BASE}models/desk_lamp_arm_01/${LAMP_LOW ? 'lamp_low' : 'lamp_posed'}.glb`).then((g) => g.scene),
      fetch(`${BASE}crumple.bin`).then((r) => r.arrayBuffer()),
      rapierReady(),
    ])
    const hdr = await hdrP
    hdr.mapping = THREE.EquirectangularReflectionMapping
    const pm = new THREE.PMREMGenerator(this.renderer)
    this.env = pm.fromEquirectangular(hdr).texture
    pm.dispose()
    hdr.dispose()

    // the desk: its top centred on the origin, front edge toward the camera (+z). Every model is
    // flattened into its parts (each centred on itself) so each part can move on its own
    const desk = flatten(deskSrc)
    const box = new THREE.Box3().setFromObject(desk)
    const c = box.getCenter(new THREE.Vector3())
    desk.position.set(-c.x, -box.min.y, -c.z)
    desk.userData.restY = desk.position.y
    this.deskTop = box.max.y - box.min.y
    this.addChalk(desk)
    const pens = flatten(pensSrc)
    if (PROPS) pens.scale.setScalar(PROPS === 'mix' ? 1.5 : 1.8)
    if (PROPS === 'mix') pens.position.x = 0.8
    if (PROPS === 'mix') pens.children.filter((c) => /eraser|pen_red|pen_blue/.test(c.name)).forEach((c) => pens.remove(c))
    pens.position.set(0.78, this.deskTop, -0.2)
    pens.rotation.y = 0.25
    this.addChalk(pens)
    const bin = this.makeBin()
    this.addChalk(bin)
    // TEST (?label=…): the About us label, a few ways — tape (paper taped on), chalk (written on the
    // bin in chalk), stencil (sprayed round it), postit (a sticky note slapped on)
    const lab = Q.get('label') ?? 'postit' // (Danilo's pick)
    bin.add(lab === 'tape' ? this.makeLabel() : this.makeBinWriting(lab))
    const printer = this.buildPrinter(printerSrc)
    this.binR = binReactor(bin)
    const lamp = this.buildLamp(lampSrc)
    void printer // (its hover off — Danilo didn't like the hum either; to be agreed)
    const deskR = deskReactor(desk)
    this.drawersAt = deskR.drawers
    this.deskObj = desk
    this.reactors = [deskR, pensReactor(pens), this.binR, lamp, ...(PROPS === 'mix' ? await this.buildMixProps(loader) : [])]
    // the floor: the same chalk, fading out a few metres away (far off, at a grazing angle, its
    // hatching piled up into a pale band along the horizon)
    const floorMat = this.chalkMat.clone()
    floorMat.vertexShader = floorMat.vertexShader
      .replace('varying vec4 vClip;', 'varying vec4 vClip;\nvarying vec3 vWorld;')
      .replace('vClip = projectionMatrix', 'vWorld = (modelMatrix * vec4(position, 1.0)).xyz;\n    vClip = projectionMatrix')
    floorMat.fragmentShader = floorMat.fragmentShader.replace('varying vec4 vClip;', 'varying vec4 vClip;\nvarying vec3 vWorld;').replace('float ink = drawnInk(suv, vViewN);', 'float ink = drawnInk(suv, vViewN) * (1.0 - smoothstep(2.2, 3.6, length(vWorld.xz)));')
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64).rotateX(-Math.PI / 2), floorMat)
    this.scene.add(floor)
    this.chalkRoots.push(floor)

    // light for what's real: the studio for reflections, and a desk lamp's key (the lamp itself off frame)
    this.scene.environment = this.env
    this.scene.environmentIntensity = 0.45
    // the lamp's key: raking, so a crumpled ball's facets read one by one
    const key = new THREE.DirectionalLight(0xfff2e0, 3.4)
    this.scene.add(key, key.target)
    this.key = key
    this.aimLampLight()

    this.buildPaper(crumple)
    this.buildPhysics()
    this.ready = true
    if (this.shown) this.startIntro()
  }

  /** the printer, in chalk: its back tray, output tray and body found by size and place; a light
   *  on its panel (one of its buttons) that blinks orange while a print is waiting */
  private buildPrinter(src: THREE.Object3D): Reactor {
    const pr = flatten(src)
    const vol = (m: THREE.Mesh) => {
      const s = m.geometry.boundingBox!.getSize(new THREE.Vector3())
      return s.x * s.y * s.z
    }
    const parts = [...(pr.children as THREE.Mesh[])].sort((a, b) => vol(b) - vol(a))
    // the model: the body (with both trays) in one piece, the lid over the paper path, the cavity
    // under it the sheet comes out of (Cube_2 / Cube_0 / Cube_1); the front is +z
    const byName = (n: string) => parts.find((m) => m.name === n)
    const body = byName('Cube_2') ?? parts[0]
    const lid = byName('Cube_0')
    const cavity = byName('Cube_1') ?? body
    const button = parts[parts.length - 1]
    pr.scale.setScalar(PRINTER_SCALE)
    // the model's cavity piece also has a small block up top, coplanar with the lid: in the outline pass
    // the two flickered into four specks on the lid (Danilo) — that block's faces are dropped
    {
      const cav = pr.children.find((c) => c.name === 'Cube_1') as THREE.Mesh | undefined
      if (cav) {
        const g = cav.geometry.index ? cav.geometry : cav.geometry
        const pos = g.attributes.position
        const ry = (cav.userData.rest as THREE.Vector3).y
        const src = g.index ? Array.from(g.index.array) : Array.from({ length: pos.count }, (_, i) => i)
        const keep: number[] = []
        for (let i = 0; i < src.length; i += 3) {
          const top = [0, 1, 2].every((k) => pos.getY(src[i + k]) + ry > 0.03)
          if (!top) keep.push(src[i], src[i + 1], src[i + 2])
        }
        g.setIndex(keep)
      }
    }
    const bb = new THREE.Box3().setFromObject(pr)
    pr.position.set(PRINTER_AT.x, this.deskTop - bb.min.y, PRINTER_AT.z)
    pr.rotation.y = PRINTER_AT.yaw
    this.addChalk(pr)
    this.printerLight = new THREE.MeshBasicMaterial({ color: 0xff9a4d })
    button.material = this.printerLight
    // where a sheet comes out: the front tray's back edge, just above it (the printer faces +z)
    pr.updateMatrixWorld(true)
    const cb = cavity.geometry.boundingBox!.clone().translate(cavity.userData.rest as THREE.Vector3)
    const bodyX = (body.userData.rest as THREE.Vector3).x
    void bodyX
    const lb = (lid ?? cavity).geometry.boundingBox!.clone().translate(((lid ?? cavity).userData.rest as THREE.Vector3))
    this.printerSlot.set((lb.min.x + lb.max.x) / 2, cb.min.y + PRINT_SLOT_Y, cb.max.z) // centred in the opening (under the lid), over the tray
    pr.localToWorld(this.printerSlot)
    this.printerFwd.set(0, 0, 1).applyQuaternion(pr.quaternion)
    {
      // the call: a small orange dot floating just over the printer, pulsing (shown from the first miss)
      const fb = new THREE.Box3().setFromObject(pr)
      const c = fb.getCenter(new THREE.Vector3())
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.008, 24), new THREE.MeshBasicMaterial({ color: 0xff9a4d, transparent: true, opacity: 0, depthTest: false, depthWrite: false }))
      dot.position.set(c.x, fb.max.y + 0.035, c.z)
      dot.renderOrder = 10
      dot.visible = false
      this.scene.add(dot)
      this.printerCall = dot
    }
    this.printer = pr
    {
      // the model's own measures (its space): body x ±0.15, y -0.06..0.06, z -0.075..0.075; output
      // tray z 0.075..0.181 at y ≈ -0.03; back (input) tray from (y 0.036, z -0.075) up to
      // (y 0.121, z -0.137), 0.18 wide
      const S = PRINTER_SCALE
      const q = pr.quaternion.clone()
      const solid = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number) =>
        this.printerSolids.push({ centre: pr.localToWorld(new THREE.Vector3(cx, cy, cz)), half: new THREE.Vector3(hx * S, hy * S, hz * S), quat: q })
      solid(0, 0, 0, 0.15, 0.06, 0.075)
      solid(0, -0.03, 0.128, 0.09, 0.012, 0.053)
      // the paper stack on the back tray, and the sheet that goes in
      const bottomL = new THREE.Vector3(0, 0.036, -0.075)
      const topL = new THREE.Vector3(0, 0.121, -0.137)
      const bottom = pr.localToWorld(bottomL.clone())
      const top = pr.localToWorld(topL.clone())
      const up = top.clone().sub(bottom).normalize() // along the tray, upward
      const across = new THREE.Vector3(1, 0, 0).applyQuaternion(q)
      const out = new THREE.Vector3().crossVectors(across, up).normalize() // off the tray's face
      if (out.dot(new THREE.Vector3(0, 0, 1).applyQuaternion(q)) < 0) out.negate()
      const len = SHEET_W * PRINT_SIZE.along
      const wid = SHEET_H * PRINT_SIZE.across
      const blank = new THREE.MeshStandardMaterial({ color: 0xefede6, roughness: 0.92, emissive: new THREE.Color(0xefede6), emissiveIntensity: PAPER_GLOW, side: THREE.DoubleSide })
      const basis = new THREE.Matrix4().makeBasis(across, up, out)
      // (the stack a shade under the top sheet, so the sheet reads as it's drawn off it)
      const stackMat = blank.clone()
      stackMat.color.set(0xc9c5b9)
      stackMat.emissive.set(0xc9c5b9)
      const stack = new THREE.Mesh(new THREE.BoxGeometry(wid, len, 0.008), stackMat)
      stack.quaternion.setFromRotationMatrix(basis)
      stack.position.copy(bottom).addScaledVector(up, len / 2 - 0.012).addScaledVector(out, 0.0045)
      this.scene.add(stack)
      // (a shade whiter than the stack, so its edge reads as it slides down over it)
      const loose = blank.clone()
      loose.color.set(0xfbf9f3)
      loose.emissive.set(0xfbf9f3)
      loose.emissiveIntensity = PAPER_GLOW * 1.8
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(wid, len), loose)
      sheet.quaternion.copy(stack.quaternion)
      sheet.visible = false
      this.scene.add(sheet)
      ;(sheet.material as THREE.MeshStandardMaterial).clippingPlanes = [new THREE.Plane().setFromNormalAndCoplanarPoint(up, bottom)]
      this.feedIn = { sheet, bottom: bottom.addScaledVector(out, 0.0095), down: up.clone().negate(), up, len }
      this.buildPaperPath(across)
    }
    if (location.search.includes('aimlog')) console.info('[paper] printer', JSON.stringify({ parts: parts.map((m) => [m.name, (m.userData.rest as THREE.Vector3).toArray().map((v) => +v.toFixed(3)), m.geometry.boundingBox!.getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(3))]), slot: this.printerSlot.toArray().map((v) => +v.toFixed(3)), fwd: this.printerFwd.toArray().map((v) => +v.toFixed(2)), body: new THREE.Box3().setFromObject(body).max.toArray().map((v) => +v.toFixed(3)) }))
    void lid
    return printerReactor(pr, this.printerLight)
  }

  /** (?props=mix) the bigger desk things, each with its own hover */
  private async buildMixProps(loader: GLTFLoader): Promise<Reactor[]> {
    const glb = (id: string) => loader.loadAsync(`${BASE}models/${id}/${id}.gltf`).then((g) => g.scene)
    const [clockSrc, booksSrc, plantSrc, potSrc] = await Promise.all([glb('alarm_clock_01'), glb('book_encyclopedia_set_01'), glb('cheiridopsis_succulent'), glb('ceramic_pot')])
    const onDesk = (o: THREE.Object3D, x: number, z: number, yaw: number, scale = 1) => {
      o.scale.multiplyScalar(scale)
      o.rotation.y = yaw
      const bb = new THREE.Box3().setFromObject(o)
      o.position.set(x, this.deskTop - bb.min.y, z)
      this.addChalk(o)
      return o
    }
    const clock = onDesk(clockSrc, 0.6, -0.27, -0.5, 1.4)
    // three of the encyclopedia, lying flat in a stack
    const books = flatten(booksSrc)
    books.children.slice(3).forEach((c) => books.remove(c))
    books.children.forEach((c, i) => {
      c.rotation.z = Math.PI / 2
      const r = c.userData.rest as THREE.Vector3
      r.set(i * 0.006, 0, (i % 2) * 0.01)
      c.position.copy(r)
    })
    books.children.forEach((c, i) => {
      const bb = new THREE.Box3().setFromObject(c)
      const y = bb.getSize(new THREE.Vector3()).y
      ;(c.userData.rest as THREE.Vector3).y = y * (i + 0.5)
      c.position.y = y * (i + 0.5)
    })
    onDesk(books, 0.38, -0.36, 0.3)
    // the succulent in its pot
    const plant = new THREE.Group()
    const pot = potSrc
    // a desk-sized pot (the model is a floor planter): 12 cm across
    const psz = new THREE.Box3().setFromObject(pot).getSize(new THREE.Vector3())
    pot.scale.setScalar(0.12 / Math.max(psz.x, psz.z))
    const pbb = new THREE.Box3().setFromObject(pot)
    const leaves = plantSrc.getObjectByName('cheiridopsis_succulent_a_LOD0') ?? plantSrc
    leaves.updateMatrixWorld(true)
    const lbb = new THREE.Box3().setFromObject(leaves)
    const lsz = lbb.getSize(new THREE.Vector3())
    const k = 0.13 / Math.max(lsz.x, lsz.z)
    leaves.scale.multiplyScalar(k)
    const lc = lbb.getCenter(new THREE.Vector3())
    leaves.position.sub(new THREE.Vector3(lc.x, lbb.min.y, lc.z).multiplyScalar(k)).add(new THREE.Vector3(0, pbb.max.y - 0.015, 0))
    plant.add(pot, leaves)
    onDesk(plant, 0.95, -0.4, 0)
    const potR = pbb.getSize(new THREE.Vector3()).x / 2
    return [clockReactor(clock), booksReactor(books), plantReactor(plant, potR)]
  }

  /** the lamp, clamped to the desk's back edge, shade over the desk */
  private buildLamp(src: THREE.Object3D): Reactor {
    const base = src.getObjectByName('lamp_base')!
    const swivel = src.getObjectByName('lamp_swivel')!
    const head = src.getObjectByName('lamp_head')!
    const lamp = new THREE.Group()
    lamp.add(src)
    // the swivel's pivot (the base node's origin) onto the desk's back edge
    src.position.copy(base.position).negate()
    lamp.position.set(LAMP_AT.x, this.deskTop, LAMP_AT.z)
    lamp.rotation.y = LAMP_AT.yaw
    this.addChalk(lamp)
    this.lampHead = head
    lamp.updateWorldMatrix(true, true)
    this.lampShade = head.worldToLocal(new THREE.Box3().setFromObject(head).getCenter(new THREE.Vector3()))
    const r = lampReactor(lamp, swivel, head)
    this.lampSwing = r.swing
    this.lampSwingV = r.swingV
    this.lampNod = r.nod
    return r
  }

  /** the key light comes from the lamp's shade, and turns with it */
  private aimLampLight(): void {
    if (!this.key || !this.lampHead) return
    this.lampHead.updateWorldMatrix(true, false)
    const p = this.lampHead.getWorldPosition(new THREE.Vector3())
    this.key.position.copy(p)
    const toSheet = new THREE.Vector3(this.sheetSpot.x, this.deskTop, this.sheetSpot.z).sub(p).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.lampSwing?.() ?? 0)
    this.key.target.position.copy(p).add(toSheet)
  }

  /** the sheets lying on the desk (not in the hand, not thrown, not printing): their hop and swish */
  private stepSheetsAtRest(): void {
    for (const q of this.sheets) {
      if (q.body || q === this.held || q === this.printing?.s || this.state === 'intro' || q.scored) continue
      if (q.mesh.userData.settle) continue
      q.mesh.position.y = (q.mesh.userData.home as THREE.Vector3).y + q.crumple * BALL_R * 0.9 + Math.max(0, (q.mesh.userData.hop as Spring).x)
      q.mesh.rotation.y = (q.mesh.userData.homeYaw as number) + (q.mesh.userData.yaw as Spring).x
    }
  }

  /** the cursor brushing things — each answers its own way — and every spring settling back */
  private stepReactions(dt: number): void {
    const now = performance.now()
    const speed = this.ptrVel.length()
    if (this.state === 'play' && !this.held && speed > 40) {
      const amt = THREE.MathUtils.clamp(speed / 1300, 0.25, 1.4)
      // the cursor's way, laid on the floor (the camera's right and its flattened forward)
      const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).setY(0).normalize()
      const fwd = this.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize()
      const dir = right.multiplyScalar(this.ptrVel.x).addScaledVector(fwd, -this.ptrVel.y).normalize()
      const sheet = this.pick(this.pointer.x, this.pointer.y)
      // (a ball has no hover: it would roll away from the hand reaching for it — Danilo)
      if (sheet && sheet !== this.printing?.s && !sheet.body && sheet.crumple < 1) {
        if (now - (this.lastReact.get(sheet) ?? 0) > 120) {
          this.lastReact.set(sheet, now)
          {
            // the sheet on the desk: swished round a little, as a draught would
            const sw = sheet.mesh.userData.yaw as Spring
            const r = this.ray.ray.closestPointToPoint(sheet.mesh.position, new THREE.Vector3()).sub(sheet.mesh.position)
            sw.v += (Math.sign(r.z * dir.x - r.x * dir.z) || 1) * amt * 0.9
          }
        }
      } else {
        this.ray.setFromCamera(this.toNdc(this.pointer.x, this.pointer.y), this.camera)
        const hits = this.ray.intersectObjects(this.reactors.map((r) => r.hit), true)
        if (hits.length) {
          const h = hits[0]
          const r = this.reactors.find((q) => {
            let o: THREE.Object3D | null = h.object
            while (o && o !== q.hit) o = o.parent
            return !!o
          })
          if (r && now - (this.lastReact.get(h.object) ?? 0) > 120) {
            this.lastReact.set(h.object, now)
            r.react(dir, amt, h.point, h.object)
            if (location.search.includes('aimlog')) console.info('[paper] react', this.reactors.indexOf(r), h.object.name, amt.toFixed(2))
          }
        }
      }
    }
    for (const r of this.reactors) r.step(dt)
    if (this.drawersAt && this.deskObj) {
      // (the drawers' sound: each one's place, and the desk's place across the screen)
      const xs = this.drawersAt()
      const sx = this._v.setFromMatrixPosition(this.deskObj.matrixWorld).project(this.camera).x
      this.quiet(() => this.drawerSound.update(dt, xs, xs.map(() => sx)))
    }
    if (this.binR) {
      // (the bin's sound: how it's turning and tipping, and where it is across the screen)
      const m = this.binR.motion()
      const bx = this._v.set(BIN.x, BIN.h * 0.5, BIN.z).project(this.camera).x
      this.quiet(() => this.binSound.update(dt, m, bx))
    }
    let seen: THREE.Vector2 | undefined
    if (this.lampHead && this.lampShade && dt > 0) {
      // the shade's velocity on screen, in screen-heights per second — the LAMP's own: where it is
      // now and where it was a frame ago, both seen through this frame's camera, so the camera
      // moving (the desk's zoom out) never reads as the lamp swinging
      const at = this.lampHead.localToWorld(this.lampShade.clone())
      const scr = (w: THREE.Vector3) => {
        const p = w.clone().project(this.camera)
        return new THREE.Vector2(p.x * this.camera.aspect * 0.5, p.y * 0.5)
      }
      if (this.lampWas) seen = scr(at).sub(scr(this.lampWas)).divideScalar(dt)
      this.lampWas = at
    }
    const swing = this.lampSwing
    const swingV = this.lampSwingV
    if (swing && swingV) this.quiet(() => this.lampCreak.update(dt, swing(), swingV(), seen))
    if (this.lampSwing && this.lampSwingV && this.lampNod && this.lampHead && Q.has('creakdebug')) {
      // (creakdebug) a frame-by-frame log of the lamp and its sound, and where it is on screen
      const w = window as unknown as { __creak?: number[][]; __lampAt?: number[] }
      const [nx, nv] = this.lampNod()
      ;(w.__creak ??= []).push([performance.now(), this.lampSwing(), this.lampSwingV(), nx, nv, this.lampCreak.level(), seen?.length() ?? 0])
      const p = this.lampHead.getWorldPosition(new THREE.Vector3()).project(this.camera)
      w.__lampAt = [(p.x * 0.5 + 0.5) * innerWidth, (-p.y * 0.5 + 0.5) * innerHeight]
    }
    this.aimLampLight()
    const h = Math.min(dt, 1 / 30)
    for (const q of this.sheets) {
      ;(q.mesh.userData.yaw as Spring).step(h)
      ;(q.mesh.userData.hop as Spring).step(h)
    }
    // the printer's call: from the first miss on, until a ball is in — a small dot over it, pulsing
    if (this.printerCall) {
      const on = this.misses > 0 && this.state === 'play' && !this.printing
      const dot = this.printerCall
      dot.visible = on
      if (on) {
        const k = 0.5 + 0.5 * Math.sin((performance.now() / 1000) * 4.2)
        ;(dot.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.55 * k
        dot.scale.setScalar(0.8 + 0.45 * k)
        dot.quaternion.copy(this.camera.quaternion) // faces the eye
      }
    }
    // the printer's light: blinks while it has something to give
    if (this.printerLight) {
      // (it blinks only while printing — Danilo)
      // (otherwise the light is the hover's: steady, flaring when brushed)
      if (this.printing) this.printerLight.color.set(Math.sin(performance.now() / 110) > -0.2 ? 0xff9a4d : 0x3a2a20)
    }
  }

  /** the sheet's yaw as it comes out: its top edge toward the printer */
  private printerYaw(): number {
    // fed portrait, long side first (as a printer takes an A4): the sheet's width runs along the feed
    // — the opening (12 cm of model, 27 cm here) is narrower than the sheet's 29.7 cm width
    return Math.atan2(this.printerFwd.x, this.printerFwd.z) + Math.PI / 2
  }

  private overPrinter(x: number, y: number): boolean {
    if (!this.printer) return false
    this.ray.setFromCamera(this.toNdc(x, y), this.camera)
    return this.ray.intersectObject(this.printer, true).length > 0
  }

  /** the next draft, out of the printer: fed out of its slot, then laid on the desk */
  private buildPaperPath(across: THREE.Vector3): void {
    const fi = this.feedIn!
    const len = fi.len
    const E = fi.bottom.clone() // where the tray meets the body (the sheet goes in here)
    const T = E.clone().addScaledVector(fi.up, len) // the stack's top: a sheet lying on it ends here
    const S = this.printerSlot.clone() // the front slot
    const fwd = this.printerFwd.clone()
    const Q = S.clone().addScaledVector(fwd, -0.035) // under the head, just inside the slot
    // round the roller: a cubic from E (heading down the tray) to Q (heading out the front)
    const c1 = E.clone().addScaledVector(fi.down, 0.06)
    const c2 = Q.clone().addScaledVector(fwd, -0.07)
    const pts: THREE.Vector3[] = [T]
    for (let i = 0; i <= 32; i++) {
      const t = i / 32
      const a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, c = 3 * (1 - t) * t * t, d = t ** 3
      pts.push(new THREE.Vector3().addScaledVector(E, a).addScaledVector(c1, b).addScaledVector(c2, c).addScaledVector(Q, d))
    }
    pts.push(S, S.clone().addScaledVector(fwd, len + 0.1))
    const cum = [0]
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]))
    const sQ = cum[pts.length - 3]
    const sS = cum[pts.length - 2]
    this.paperPath = { pts, cum, sHead: sQ - 0.01, sSlot: sS, across: across.clone(), len, wid: SHEET_H * PRINT_SIZE.across }
  }

  /** a point on the paper path at arc length `s` (clamped to its ends) */
  private pathAt(s: number, out: THREE.Vector3): THREE.Vector3 {
    const { pts, cum } = this.paperPath!
    if (s <= 0) return out.copy(pts[0])
    for (let i = 1; i < pts.length; i++) {
      if (cum[i] >= s) return out.lerpVectors(pts[i - 1], pts[i], (s - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]))
    }
    return out.copy(pts[pts.length - 1])
  }

  /** the sheet in the printer: a strip bent along the path — its leading edge `sLead` along it.
   *  Blank until it has passed the head, the page's print after */
  private placeRibbon(sLead: number): void {
    const P = this.paperPath!
    const rib = this.ribbon!
    const pos = rib.geometry.attributes.position as THREE.BufferAttribute
    const uv = rib.geometry.attributes.uv as THREE.BufferAttribute
    const rows = pos.count / 2 - 1
    const c = new THREE.Vector3()
    const half = P.across.clone().multiplyScalar(P.wid / 2)
    for (let i = 0; i <= rows; i++) {
      const a = (i / rows) * P.len // from the leading edge back
      const sp = sLead - a
      this.pathAt(sp, c)
      pos.setXYZ(i * 2, c.x - half.x, c.y - half.y, c.z - half.z)
      pos.setXYZ(i * 2 + 1, c.x + half.x, c.y + half.y, c.z + half.z)
      // (the printed page's own uv — leading edge u 0, the -across side v 1; a blank corner before the head)
      const printed = sp > P.sHead
      uv.setXY(i * 2, printed ? a / P.len : 0.015, printed ? 1 : 0.015)
      uv.setXY(i * 2 + 1, printed ? a / P.len : 0.015, printed ? 0 : 0.015)
    }
    pos.needsUpdate = true
    uv.needsUpdate = true
    rib.geometry.computeBoundingSphere()
  }

  private startPrint(): void {
    this.draft++
    const s = this.addSheet(this.draftTexture(this.draft))
    // a printed page is a touch bigger than the hero's sheet (Danilo): longer along the feed, a little
    // wider across — shrinking back to the ball's size as it's crumpled (see setCrumple)
    s.mesh.userData.size = new THREE.Vector3(PRINT_SIZE.along, 1, PRINT_SIZE.across)
    s.mesh.scale.copy(s.mesh.userData.size as THREE.Vector3)
    const m = s.mesh.material as THREE.MeshStandardMaterial
    m.emissiveIntensity = PAPER_GLOW
    m.color.setScalar(1)
    s.mesh.visible = false
    if (this.paperPath) {
      const rows = 80
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((rows + 1) * 2 * 3), 3))
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((rows + 1) * 2 * 2), 2))
      // faces up once it lies flat out front (rows run back from the leading edge, -fwd)
      const up = new THREE.Vector3().crossVectors(this.printerFwd.clone().negate(), this.paperPath.across).y > 0
      const idx: number[] = []
      for (let i = 0; i < rows; i++) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3
        if (up) idx.push(a, c, b, b, c, d)
        else idx.push(a, b, c, b, d, c)
      }
      g.setIndex(idx)
      this.ribbon?.removeFromParent()
      const rm = this.paperMaterial((m as THREE.MeshStandardMaterial).map!)
      rm.emissiveIntensity = PAPER_GLOW
      rm.color.setScalar(1)
      this.ribbon = new THREE.Mesh(g, rm)
      this.ribbon.frustumCulled = false
      this.scene.add(this.ribbon)
    }
    this.printing = { s, t: 0 }
    this.printerSound.play(PRINT_WAIT + PRINT_LAG, PRINT_FEED)
    this.stepPrint(0)
  }

  private stepPrint(dt: number): void {
    const pr = this.printing
    if (!pr) return
    pr.t += dt
    const m = pr.s.mesh
    const P = this.paperPath
    // one sheet, all the way through: a short pull as the printer takes it off the stack, then an
    // even feed — down the tray, round the roller, past the head (where the print appears), out
    const pull = THREE.MathUtils.clamp(pr.t / PRINT_WAIT, 0, 1)
    const through = THREE.MathUtils.clamp((pr.t - PRINT_WAIT) / (PRINT_LAG + PRINT_FEED), 0, 1)
    const done = through >= 1
    if (P && this.ribbon) {
      const pullLen = 0.03
      const sLead = P.len + pull * pullLen + through * (P.sSlot - pullLen)
      this.ribbon.visible = !done
      if (!done) this.placeRibbon(sLead)
    }
    if (this.feedIn) this.feedIn.sheet.visible = false
    if (!done) return
    // out: the page lies on the output tray — the crumple-able sheet takes the strip's place exactly
    const yaw = this.printerYaw()
    const mid = this.flatCentre.clone().multiply(m.scale).setY(0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
    m.position.copy(this.printerSlot).addScaledVector(this.printerFwd, 0.5 * SHEET_W * m.scale.x).sub(mid)
    m.rotation.y = yaw
    m.visible = true
    this.ribbon?.removeFromParent()
    this.ribbon = undefined
    ;(m.userData.home as THREE.Vector3).copy(m.position)
    m.userData.homeYaw = yaw
    this.active = pr.s
    this.printing = undefined
  }

  private addChalk(o: THREE.Object3D): void {
    o.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).material = this.chalkMat
    })
    this.scene.add(o)
    this.chalkRoots.push(o)
  }

  /** an office waste bin: a tapered metal cylinder, open at the top, with a rolled rim */
  /** "ABOUT US" — a paper label taped on the bin, a bit crooked, facing the desk's camera (the bin is
   *  the way to the next page, the about page — Danilo's idea). Real paper, like the sheets; a child
   *  of the bin, so it goes with it when the bin is knocked */
  private makeLabel(): THREE.Object3D {
    const cv = document.createElement('canvas')
    cv.width = 512
    cv.height = 200
    const g = cv.getContext('2d')!
    g.fillStyle = '#efede6'
    g.fillRect(0, 0, cv.width, cv.height)
    g.fillStyle = '#121212'
    g.font = '500 84px "IBM Plex Mono", monospace'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('ABOUT US', cv.width / 2, cv.height / 2 + 4)
    const map = new THREE.CanvasTexture(cv)
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = 8
    const paper = new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: PAPER_GLOW + 0.15, roughness: 0.9 })
    const W = 0.12, H = W * (cv.height / cv.width)
    const label = new THREE.Group()
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(W, H), paper)
    label.add(sheet)
    // two strips of tape over its ends
    const tape = new THREE.MeshStandardMaterial({ color: 0xf3eedc, transparent: true, opacity: 0.55, roughness: 0.4, emissive: new THREE.Color(0xf3eedc), emissiveIntensity: 0.08 })
    for (const sx of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.PlaneGeometry(0.018, H * 1.35), tape)
      t.position.set((sx * W) / 2, 0, 0.0006)
      t.rotation.z = sx * 0.12
      label.add(t)
    }
    // on the bin's side that faces the camera's resting place, at two thirds of its height, leaning
    // with the bin's wall
    const toCam = new THREE.Vector3(this.finalPose.pos.x - BIN.x, 0, this.finalPose.pos.z - BIN.z).normalize()
    const y = BIN.h * 0.6
    const r = BIN.rBottom + (BIN.rTop - BIN.rBottom) * (y / BIN.h) + 0.0025
    label.position.copy(toCam).multiplyScalar(r).setY(y)
    label.lookAt(label.position.clone().add(toCam))
    label.rotateX(-Math.atan2(BIN.rTop - BIN.rBottom, BIN.h))
    label.rotateZ(0.06) // taped on by hand
    return label
  }

  /** the label as a band wrapped on the bin's own (tapered) wall, or a sticky note */
  private makeBinWriting(kind: string): THREE.Object3D {
    const toCam = Math.atan2(this.finalPose.pos.x - BIN.x, this.finalPose.pos.z - BIN.z)
    const cv = document.createElement('canvas')
    cv.width = 1024
    cv.height = 256
    const g = cv.getContext('2d')!
    g.clearRect(0, 0, cv.width, cv.height)
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    if (kind === 'postit') {
      const n = document.createElement('canvas')
      n.width = n.height = 1024
      const h = n.getContext('2d')!
      h.scale(4, 4)
      h.fillStyle = '#f7e36b'
      h.fillRect(0, 0, 256, 256)
      h.fillStyle = 'rgba(0,0,0,0.06)'
      h.fillRect(0, 0, 256, 34)
      h.fillStyle = '#1a1a1a'
      h.font = 'italic 700 74px "Tinos", serif'
      h.textAlign = 'center'
      h.fillText('about', 128, 122)
      h.fillText('us', 128, 196)
      const map = new THREE.CanvasTexture(n)
      map.colorSpace = THREE.SRGBColorSpace
      map.anisotropy = 16
      const note = new THREE.Mesh(new THREE.PlaneGeometry(0.095, 0.095), new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0.28, roughness: 0.9, side: THREE.DoubleSide }))
      const y = BIN.h * 0.62
      const r = BIN.rBottom + (BIN.rTop - BIN.rBottom) * (y / BIN.h) + 0.012 // (clear of the curved wall: it's flat)
      const dir = new THREE.Vector3(Math.sin(toCam + 0.1), 0, Math.cos(toCam + 0.1))
      note.position.copy(dir).multiplyScalar(r).setY(y)
      note.lookAt(note.position.clone().add(dir))
      note.rotateX(-Math.atan2(BIN.rTop - BIN.rBottom, BIN.h))
      note.rotateZ(-0.14)
      return note
    }
    if (kind === 'stencil') {
      g.fillStyle = '#ff9a4d'
      g.font = '700 150px "IBM Plex Mono", monospace'
      g.fillText('ABOUT US', cv.width / 2, cv.height / 2)
      // the stencil's bridges: thin gaps across every letter
      g.globalCompositeOperation = 'destination-out'
      g.fillRect(0, cv.height / 2 - 5, cv.width, 10)
      g.globalCompositeOperation = 'source-over'
    } else {
      // chalk, by hand: a bit uneven, the stroke skipping on the metal
      g.fillStyle = '#efeee6'
      g.font = 'italic 500 140px "Tinos", serif'
      g.save()
      g.translate(cv.width / 2, cv.height / 2)
      g.rotate(-0.04)
      g.fillText('about us', 0, 0)
      g.restore()
      g.globalCompositeOperation = 'destination-out'
      for (let i = 0; i < 9000; i++) {
        g.fillStyle = `rgba(0,0,0,${0.25 + Math.random() * 0.6})`
        g.fillRect(Math.random() * cv.width, Math.random() * cv.height, 1 + Math.random() * 3, 1)
      }
      g.globalCompositeOperation = 'source-over'
    }
    const map = new THREE.CanvasTexture(cv)
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = 8
    const arc = 1.5 // radians of the wall it spans
    const y0 = BIN.h * 0.42, y1 = BIN.h * 0.74
    const r0 = BIN.rBottom + (BIN.rTop - BIN.rBottom) * (y0 / BIN.h) + 0.0015
    const r1 = BIN.rBottom + (BIN.rTop - BIN.rBottom) * (y1 / BIN.h) + 0.0015
    // three's cylinder starts its theta at +z and goes counter-clockwise from above; centred on the camera side
    const geo = new THREE.CylinderGeometry(r1, r0, y1 - y0, 48, 1, true, toCam - arc / 2, arc)
    const band = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: THREE.FrontSide }))
    band.position.y = (y0 + y1) / 2
    return band
  }

  private makeBin(): THREE.Object3D {
    const { rBottom, rTop, h } = BIN
    const t = 0.004
    const prof = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(rBottom, 0),
      new THREE.Vector2(rTop, h),
      new THREE.Vector2(rTop + 0.006, h + 0.004),
      new THREE.Vector2(rTop - t, h + 0.002),
      new THREE.Vector2(rBottom - t, t),
      new THREE.Vector2(0, t),
    ]
    const g = new THREE.LatheGeometry(prof, 48)
    const m = new THREE.Mesh(g)
    m.position.set(BIN.x, 0, BIN.z)
    return m
  }

  /** the baked crumple: positions per key (int16, quantised), frame 0 the flat sheet */
  private buildPaper(buf: ArrayBuffer): void {
    const dv = new DataView(buf)
    const nx = dv.getUint32(0, true)
    const ny = dv.getUint32(4, true)
    const nk = dv.getUint32(8, true)
    const lo = [dv.getFloat32(12, true), dv.getFloat32(16, true), dv.getFloat32(20, true)]
    const sc = [dv.getFloat32(24, true), dv.getFloat32(28, true), dv.getFloat32(32, true)]
    const q = new Int16Array(buf, 36, nk * nx * ny * 3)
    const n = nx * ny
    const frame = (k: number): Float32Array => {
      const a = new Float32Array(n * 3)
      for (let i = 0; i < n * 3; i++) a[i] = (q[k * n * 3 + i] + 32768) * sc[i % 3] + lo[i % 3]
      return a
    }
    const flat = frame(0)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(flat, 3))
    // the print's uv straight off the flat sheet (the mesh is irregular on purpose)
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (let i = 0; i < n; i++) {
      x0 = Math.min(x0, flat[i * 3]); x1 = Math.max(x1, flat[i * 3])
      z0 = Math.min(z0, flat[i * 3 + 2]); z1 = Math.max(z1, flat[i * 3 + 2])
    }
    const uv = new Float32Array(n * 2)
    for (let i = 0; i < n; i++) {
      uv[i * 2] = (flat[i * 3] - x0) / (x1 - x0)
      uv[i * 2 + 1] = 1 - (flat[i * 3 + 2] - z0) / (z1 - z0) // far edge (-z) = the print's top
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    const idx: number[] = []
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1
        idx.push(a, c, b, b, c, d)
      }
    g.setIndex(idx)
    // front face up (the print's side)
    const p = (i: number) => new THREE.Vector3(flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2])
    const nrm = new THREE.Vector3().subVectors(p(idx[1]), p(idx[0])).cross(new THREE.Vector3().subVectors(p(idx[2]), p(idx[0])))
    if (nrm.y < 0) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]
    g.setIndex(idx)
    g.morphAttributes.position = []
    for (let k = 1; k < nk; k++) g.morphAttributes.position.push(new THREE.BufferAttribute(frame(k), 3))
    g.morphTargetsRelative = false
    g.computeBoundingSphere()
    g.boundingSphere!.radius = Math.max(g.boundingSphere!.radius, 0.2)
    this.paperGeo = g
    this.keys = nk
    // the flat sheet's own middle (the frames are centred on the finished ball, a few mm off it):
    // the intro's camera centres on this, or the print would jump at the cut
    for (let i = 0; i < n; i++) this.flatCentre.add(new THREE.Vector3(flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2]))
    this.flatCentre.divideScalar(n)
  }

  /** `mapB`: a second print the sheet turns into (uMixB 0 -> 1; /hero-paper's cubes frame: the
   *  screen's exact pixels at the cut, then its void becoming paper as the camera pulls back) */
  private paperMaterial(map: THREE.Texture, mapB?: THREE.Texture): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({
      map,
      emissiveMap: map,
      emissive: new THREE.Color(1, 1, 1),
      emissiveIntensity: 1,
      color: new THREE.Color(0, 0, 0),
      roughness: 0.92,
      metalness: 0,
      flatShading: true, // each facet's own normal, from the crumpled positions themselves
      side: THREE.DoubleSide,
    })
    // the back of the sheet is blank paper
    const mix = { value: mapB ? 0 : 1 }
    m.userData.mixB = mix
    m.onBeforeCompile = (s) => {
      s.uniforms.uMapB = { value: mapB ?? map }
      s.uniforms.uMixB = mix
      s.fragmentShader = 'uniform sampler2D uMapB;\nuniform float uMixB;\n' + s.fragmentShader
        .replace('#include <map_fragment>', '#include <map_fragment>\n vec3 printB = texture2D(uMapB, vMapUv).rgb;\n diffuseColor.rgb = mix(diffuseColor.rgb, diffuse * printB, uMixB);\n if (!gl_FrontFacing) diffuseColor.rgb = vec3(0.86, 0.855, 0.83) * diffuse;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n totalEmissiveRadiance = mix(totalEmissiveRadiance, emissive * printB, uMixB);\n if (!gl_FrontFacing) totalEmissiveRadiance = vec3(0.86, 0.855, 0.83) * emissive;`)
    }
    return m
  }

  private buildPhysics(): void {
    const w = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    w.timestep = 1 / 120
    const fixed = (d: RAPIER.ColliderDesc) => w.createCollider(d.setFriction(0.8).setRestitution(0.25))
    // thick, so nothing squeezed against it can be pushed through
    fixed(RAPIER.ColliderDesc.cuboid(60, 1, 60).setTranslation(0, -1, 0))
    // the desk: its top, and a block under it (it's a cabinet desk)
    fixed(RAPIER.ColliderDesc.cuboid(1.0, 0.02, 0.475).setTranslation(0, this.deskTop - 0.02, 0))
    fixed(RAPIER.ColliderDesc.cuboid(0.98, this.deskTop / 2 - 0.02, 0.45).setTranslation(0, this.deskTop / 2 - 0.02, 0))
    // the printer: solid (the balls went straight through it)
    for (const b of this.printerSolids) {
      fixed(RAPIER.ColliderDesc.cuboid(b.half.x, b.half.y, b.half.z).setTranslation(b.centre.x, b.centre.y, b.centre.z).setRotation({ x: b.quat.x, y: b.quat.y, z: b.quat.z, w: b.quat.w }))
    }
    // the bin: a floor and a ring of wall slabs
    fixed(RAPIER.ColliderDesc.cylinder(0.01, BIN.rBottom).setTranslation(BIN.x, 0.0, BIN.z))
    const segs = 20
    const rMid = (BIN.rBottom + BIN.rTop) / 2
    const lean = Math.atan2(BIN.rTop - BIN.rBottom, BIN.h)
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, 0)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -lean))
      fixed(
        RAPIER.ColliderDesc.cuboid(0.01, BIN.h / 2, (Math.PI * rMid) / segs + 0.01)
          .setTranslation(BIN.x + Math.cos(a) * rMid, BIN.h / 2, BIN.z + Math.sin(a) * rMid)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
      )
    }
    this.world = w
  }

  /** a fresh world: the room's colliders again, every thrown ball where it was (`lost` dropped
   *  back onto the desk) */
  private rebuildPhysics(lost: Sheet, dropLost = true): void {
    try {
      this.world?.free()
    } catch {
      // (a trapped world may not even free; it's dropped)
    }
    this.buildPhysics()
    for (const q of this.sheets) {
      if (!q.body) continue
      q.body = undefined
      if (q === lost && dropLost) q.mesh.position.set(this.sheetSpot.x + 0.3, this.deskTop + 0.15, this.sheetSpot.z)
      else q.mesh.position.y = Math.max(q.mesh.position.y, BALL_R)
      const thrown = q.thrown
      this.pxTrail = []
      this.throwBall(q)
      q.thrown = thrown
    }
  }

  // ---- the page's side ------------------------------------------------------------------
  /** the hero frame as it was when the scroll began (display-encoded, the canvas's own pixels) */
  setPrint(snapshot: THREE.Texture, aspect: number, voidToPaper = false): void {
    this.printAspect = aspect
    const sheetAspect = SHEET_W / SHEET_H
    // contained: the whole hero on the sheet, paper above and below (or beside)
    const w = aspect >= sheetAspect ? 1 : aspect / sheetAspect
    const h = aspect >= sheetAspect ? sheetAspect / aspect : 1
    this.printMat.uniforms.uRect.value.set((1 - w) / 2, (1 - h) / 2, (1 + w) / 2, (1 + h) / 2)
    this.printMat.uniforms.tSnap.value = snapshot
    this.printMat.uniforms.uBlank.value = 0
    this.renderer.setRenderTarget(this.printTex)
    this.renderer.render(this.printScene, this.printCam)
    this.renderer.setRenderTarget(null)
    if (voidToPaper) this.printMap = this.paperForVoid()
  }

  /** (/hero-paper: the cubes' frame) the black around the cubes is the scene's void, not ink — on a
   *  print it's paper. Everything black that touches the sheet's edge (flood-filled, so the cubes'
   *  own outlines and text stay) becomes the paper */
  private paperForVoid(): THREE.Texture {
    const w = this.printTex.width, h = this.printTex.height
    const px = new Uint8Array(w * h * 4)
    this.renderer.readRenderTargetPixels(this.printTex, 0, 0, w, h, px)
    const seen = new Uint8Array(w * h)
    const stack: number[] = []
    const dark = (i: number) => px[i * 4] < 9 && px[i * 4 + 1] < 9 && px[i * 4 + 2] < 9
    for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x)
    for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1)
    while (stack.length) {
      const i = stack.pop()!
      if (seen[i] || !dark(i)) continue
      seen[i] = 1
      const x = i % w
      if (x > 0) stack.push(i - 1)
      if (x < w - 1) stack.push(i + 1)
      if (i >= w) stack.push(i - w)
      if (i < w * (h - 1)) stack.push(i + w)
    }
    // the paper: the cubes' own face colour would read as a white card — the sheet is the room's
    // chalk-paper tone (the drawn hero's)
    const cv = document.createElement('canvas')
    cv.width = w
    cv.height = h
    const g = cv.getContext('2d')!
    const img = g.createImageData(w, h)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const src = (y * w + x) * 4
        const dst = ((h - 1 - y) * w + x) * 4 // (the target's rows run bottom-up)
        const v = seen[y * w + x]
        img.data[dst] = v ? 239 : px[src]
        img.data[dst + 1] = v ? 237 : px[src + 1]
        img.data[dst + 2] = v ? 230 : px[src + 2]
        img.data[dst + 3] = 255
      }
    g.putImageData(img, 0, 0)
    const t = new THREE.CanvasTexture(cv)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  }

  /** shown for the first time (the camera has gone through the cubes — or, `direct`, the very
   *  first scroll: no black, the print already on screen, the pull-back starting at once) */
  show(direct = false): void {
    if (this.shown) return
    this.shown = true
    this.direct = direct
    setCursorTheme('chalk') // the desk is drawn in chalk on the dark
    window.addEventListener('pointermove', this.onMove)
    window.addEventListener('pointerdown', this.onDown)
    window.addEventListener('pointerup', this.onUp)
    window.addEventListener('pointercancel', this.onUp)
    if (this.ready) this.startIntro()
  }

  private startIntro(): void {
    const s = this.addSheet(this.printTex.texture, this.printMap)
    this.active = s
    // the camera starts right over the sheet, the print filling the screen exactly as the hero did
    const { w, h } = this.view()
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    const sheetAspect = SHEET_W / SHEET_H
    const printW = this.printAspect >= sheetAspect ? SHEET_W : SHEET_H * this.printAspect
    const printH = printW / this.printAspect
    const d = printH / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))
    s.mesh.updateMatrixWorld()
    const c = s.mesh.localToWorld(this.flatCentre.clone())
    this.introFrom.pos.set(c.x, c.y + d, c.z)
    const up = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.sheetYaw)
    this._m.lookAt(this.introFrom.pos, c, up)
    this.introFrom.quat.setFromRotationMatrix(this._m)
    this.camera.position.copy(this.introFrom.pos)
    this.camera.quaternion.copy(this.introFrom.quat)
    this.state = 'intro'
    this.t = 0
  }

  private addSheet(map: THREE.Texture, mapB?: THREE.Texture): Sheet {
    const mesh = new THREE.Mesh(this.paperGeo, this.paperMaterial(map, mapB))
    mesh.morphTargetInfluences = new Array(this.keys - 1).fill(0)
    mesh.position.set(this.sheetSpot.x, this.deskTop + 0.0012, this.sheetSpot.z)
    mesh.rotation.y = this.sheetYaw
    this.scene.add(mesh)
    mesh.userData.yaw = new Spring(90, 7)
    // where it lies when nobody holds it (a printed one: on the printer's tray)
    mesh.userData.home = new THREE.Vector3(this.sheetSpot.x, this.deskTop + 0.0012, this.sheetSpot.z)
    mesh.userData.homeYaw = this.sheetYaw
    mesh.userData.hop = new Spring(500, 16)
    const s: Sheet = { mesh, crumple: 0, scored: false, restT: 0, thrown: false, missDealt: false }
    this.sheets.push(s)
    return s
  }

  private setCrumple(s: Sheet, c: number): void {
    s.crumple = c
    const f = c * (this.keys - 1)
    const i = Math.min(Math.floor(f), this.keys - 2)
    const fr = f - i
    const inf = s.mesh.morphTargetInfluences!
    inf.fill(0)
    if (i > 0) inf[i - 1] = 1 - fr
    inf[i] = fr
    const size = s.mesh.userData.size as THREE.Vector3 | undefined
    if (size) s.mesh.scale.lerpVectors(size, new THREE.Vector3(1, 1, 1), THREE.MathUtils.smoothstep(c, 0, 0.6))
  }

  // ---- input ------------------------------------------------------------------------------
  private toNdc(x: number, y: number): THREE.Vector2 {
    const { w, h } = this.view()
    return this.ndc.set((x / w) * 2 - 1, -(y / h) * 2 + 1)
  }

  private pick(x: number, y: number): Sheet | undefined {
    this.ray.setFromCamera(this.toNdc(x, y), this.camera)
    // (the morphs aren't raycast: test each sheet against its current bounding size)
    let best: Sheet | undefined
    let bestD = Infinity
    for (const s of this.sheets) {
      if (s.scored) continue
      const r = s.crumple >= 1 ? BALL_R * 1.6 : THREE.MathUtils.lerp(0.17, BALL_R * 1.6, s.crumple)
      const d = this.ray.ray.distanceSqToPoint(s.mesh.position)
      const along = this._v.subVectors(s.mesh.position, this.ray.ray.origin).dot(this.ray.ray.direction)
      if (d < r * r && along < bestD) {
        if (s.crumple < 1 && s === this.printing?.s) continue
        best = s
        bestD = along
      }
    }
    return best
  }

  private onMove = (e: PointerEvent): void => {
    if (this.down && this.held && this.state === 'play') {
      const dx = e.clientX - this.pointer.x
      const dy = e.clientY - this.pointer.y
      this.dragPx += Math.hypot(dx, dy)
      // crumpling, every turn of the hand — the drag doubling back on its way — is a crackle of its own
      if (this.held.crumple < 1) {
        const d = this.twistDir
        const len = Math.hypot(dx, dy)
        if (len > 0.5) {
          const ux = dx / len
          const uy = dy / len
          const travelled = Math.hypot(d.x, d.y)
          if (travelled > 18 && (ux * d.x + uy * d.y) / travelled < -0.35) {
            const ms = Math.max(8, performance.now() - this.lastPtr.t)
            const c = this.held.crumple
            this.quiet(() => this.crumpleSound.twist(Math.min(1, travelled / 120), Math.min(1, len / ms / 2.5), c))
            d.set(0, 0)
          }
          // the way it's been going lately (the last ~40 px)
          d.multiplyScalar(Math.max(0, 1 - len / 40)).add(new THREE.Vector2(dx, dy))
        }
      }
      if (this.held.crumple >= 1) {
        this.pxTrail.push({ x: e.clientX, y: e.clientY, t: performance.now() })
        if (this.pxTrail.length > 16) this.pxTrail.shift()
      }
    }
    const now = performance.now()
    const dtp = Math.max(8, now - this.lastPtr.t) / 1000
    this.ptrVel.set((e.clientX - this.lastPtr.x) / dtp, (e.clientY - this.lastPtr.y) / dtp)
    this.lastPtr = { x: e.clientX, y: e.clientY, t: now }
    this.pointer.set(e.clientX, e.clientY)
  }

  private onDown = (e: PointerEvent): void => {
    this.pointer.set(e.clientX, e.clientY)
    if (this.state !== 'play') return
    const s = this.pick(e.clientX, e.clientY)
    if (!s) {
      // the printer: a new draft, if there's no sheet waiting already
      if (this.overPrinter(e.clientX, e.clientY) && !this.printing) this.startPrint()
      return
    }
    this.down = true
    this.held = s
    this.dragPx = 0
    this.twistDir.set(0, 0)
    s.mesh.userData.c0 = s.crumple
    s.mesh.userData.settle = false
    this.holdTrail = []
    if (s.body) {
      // a ball picked up again: out of the simulation while it's in the hand
      this.world!.removeRigidBody(s.body)
      s.body = undefined
    }
    s.thrown = false
    s.missDealt = false
  }

  private onUp = (): void => {
    if (!this.down) return
    this.down = false
    const s = this.held
    this.held = undefined
    if (!s) return
    if (s.crumple >= 0.97) {
      this.setCrumple(s, 1)
      this.active = undefined
      this.throwBall(s)
      this.quiet(() => this.crumpleSound.thrown())
      // the swoosh of the throw, travelling from where it left the hand toward where it's going
      // (no paper tick on the release: made of the crumple's snaps, it read as crumpling — Danilo)
      if (TOSS_TEST || this.throwSound.on) {
        const v = s.body!.linvel()
        const speed = Math.hypot(v.x, v.y, v.z)
        const p = s.mesh.position
        const x0 = this._v.copy(p).project(this.camera).x
        const x1 = this._v.set(p.x + v.x * 0.5, p.y + v.y * 0.5, p.z + v.z * 0.5).project(this.camera).x
        this.quiet(() => this.throwSound.play(speed, x0, x1))
      }
    }
    else {
      // let go half-crumpled: it settles back on the desk as it is (paper keeps its creases)
      s.mesh.userData.settle = true
    }
  }

  private throwBall(s: Sheet): void {
    // a toss, as paper-toss games read it: the flick's direction on screen, laid on the floor, says
    // where to; its speed says how far (in metres — from up here a screen length would make depth
    // far too touchy); the ball goes up in an arc that lands it there. A slow let-go just drops it.
    const now = performance.now()
    const recent = this.pxTrail.filter((h) => now - h.t < 160)
    this.pxTrail = []
    const p = s.mesh.position
    const v = new THREE.Vector3()
    if (recent.length >= 2) {
      const a = recent[0], b = recent[recent.length - 1]
      const dt = Math.max(0.016, (b.t - a.t) / 1000)
      const vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt
      const speed = Math.hypot(vx, vy)
      const binDist = Math.hypot(BIN.x - p.x, BIN.z - p.z)
      const dist = binDist * THREE.MathUtils.clamp((speed / AIM_SPEED) ** AIM_SPEED_POW, 0.6, 1.6)
      const target = speed > 120 ? this.aimAt(p, vx / speed, vy / speed, dist) : null
      if (target) this.arcTo(p, target, v)
    }
    // (TEST ?acerta — for trying the dive: every throw goes straight in)
    if (new URLSearchParams(location.search).has('acerta') && !s.thrown) this.arcTo(p, new THREE.Vector3(BIN.x, BIN.h + 0.01, BIN.z), v) // (through the mouth's middle)
    const body = this.world!.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(p.x, p.y, p.z)
        .setRotation({ x: s.mesh.quaternion.x, y: s.mesh.quaternion.y, z: s.mesh.quaternion.z, w: s.mesh.quaternion.w })
        .setLinvel(v.x, v.y, v.z)
        .setAngvel({ x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8, z: (Math.random() - 0.5) * 8 })
        .setLinearDamping(0.05)
        .setAngularDamping(0.6)
        .setCcdEnabled(true),
    )
    // a crumpled ball: light (a few grams), not quite round, a dull bounce
    this.world!.createCollider(RAPIER.ColliderDesc.ball(BALL_R).setDensity(30).setFriction(0.9).setRestitution(0.3), body)
    s.body = body
    s.thrown = true
    s.restT = 0
  }

  /** where a toss from `p` lands: `dist` metres out from under the ball, in the floor direction
   *  that — seen through the camera — leaves the ball the way the flick did (every heading tried,
   *  2 degrees apart: robust whatever the perspective and however high the ball is held); drawn
   *  toward the bin's middle when it comes down near it (as paper-toss games help) */
  private aimAt(p: THREE.Vector3, ux: number, uy: number, dist: number): THREE.Vector3 | null {
    const yA = BIN.h * 0.7
    const ball = p.clone().project(this.camera)
    const { w, h } = this.view()
    const aspect = w / h
    const want = Math.atan2(-uy, ux) // screen angle, y up
    let best: THREE.Vector3 | null = null
    let bestErr = Infinity
    const x = new THREE.Vector3()
    for (let deg = 0; deg < 360; deg += 2) {
      const a = THREE.MathUtils.degToRad(deg)
      x.set(p.x + Math.cos(a) * dist, yA, p.z + Math.sin(a) * dist)
      const sp = x.clone().project(this.camera)
      if (sp.z > 1) continue
      const ang = Math.atan2(sp.y - ball.y, (sp.x - ball.x) * aspect)
      const err = Math.abs(Math.atan2(Math.sin(ang - want), Math.cos(ang - want)))
      if (err < bestErr) {
        bestErr = err
        best = x.clone()
      }
    }
    if (!best) return null
    const off = Math.hypot(best.x - BIN.x, best.z - BIN.z)
    if (off < AIM_ASSIST.r) {
      const k = AIM_ASSIST.k * (1 - off / AIM_ASSIST.r)
      best.x += (BIN.x - best.x) * k
      best.z += (BIN.z - best.z) * k
    }
    // the illusion (v1's, kept on purpose): the landing pushed a little further from the eye, along
    // its line of sight — on screen it's the same spot, so a toss aimed right at the bin looks on
    // target and comes down just behind it. Only a bank shot gets in
    const away = best.clone().sub(this.camera.position).setY(0).normalize()
    best.addScaledVector(away, AIM_ILLUSION)
    // and never into the mouth itself: still on it, it goes further on, along the same line
    for (let i = 0; i < 40 && this.overMouth(best); i++) best.addScaledVector(away, 0.02)
    if (location.search.includes('aimlog')) console.info('[paper] toss', p.toArray().map((v) => +v.toFixed(2)), '->', best.toArray().map((v) => +v.toFixed(2)), 'dist', dist.toFixed(2))
    return best
  }

  /** whether a point is over the bin's mouth (with the ball's size and a margin past the rim) */
  private overMouth(p: THREE.Vector3): boolean {
    return Math.hypot(p.x - BIN.x, p.z - BIN.z) < BIN.rTop + BALL_R + 0.04
  }

  /** the launch velocity (into `out`) that carries a ball from `p` to `target`: the lowest of a few
   *  lobbing angles that can reach it — a toss, not a shot */
  private arcTo(p: THREE.Vector3, target: THREE.Vector3, out: THREE.Vector3): void {
    const flat = new THREE.Vector3(target.x - p.x, 0, target.z - p.z)
    const d = flat.length()
    const dy = target.y - p.y
    const dir = flat.clone().normalize()
    let fallback: THREE.Vector3 | null = null
    for (const deg of [48, 54, 60, 66, 72, 78]) {
      const th = THREE.MathUtils.degToRad(deg)
      const den = 2 * Math.cos(th) ** 2 * (d * Math.tan(th) - dy)
      if (den <= 0) continue
      const sp = Math.sqrt((9.81 * d * d) / den)
      const v = new THREE.Vector3(dir.x * sp * Math.cos(th), sp * Math.sin(th), dir.z * sp * Math.cos(th))
      fallback ??= v
      // it has to clear the desk on the way (the bin stands just off its corner)
      if (this.clearsDesk(p, v)) {
        out.copy(v)
        return
      }
    }
    if (fallback) out.copy(fallback)
  }

  /** a sound call, isolated: whatever goes wrong in the audio, it stays silent there and never breaks
   *  the frame (a non-finite value into an AudioParam once froze the page after the cubes — 2026-10-15) */
  private quiet(f: () => void): void {
    try {
      f()
    } catch (e) {
      if (!this.quietWarned) console.warn('[sound]', e)
      this.quietWarned = true
    }
  }
  private quietWarned = false

  /** (hits) what a ball at `t` is touching: the bin (its rim, its wall from outside or inside), the
   *  printer, the desk (top or side), or the floor */
  private surfaceAt(t: { x: number; y: number; z: number }): Surface {
    const r = Math.hypot(t.x - BIN.x, t.z - BIN.z)
    const k = THREE.MathUtils.clamp(t.y / BIN.h, 0, 1)
    const wall = BIN.rBottom + (BIN.rTop - BIN.rBottom) * k
    if (t.y < BIN.h + BALL_R + 0.02 && r < BIN.rTop + BALL_R + 0.03) {
      if (t.y > BIN.h - 0.03 && Math.abs(r - BIN.rTop) < BALL_R + 0.03) return 'rim'
      if (r < wall) return 'binIn'
      if (r < wall + BALL_R + 0.025) return 'binOut'
    }
    const local = new THREE.Vector3()
    const inv = new THREE.Quaternion()
    for (const b of this.printerSolids) {
      local.set(t.x, t.y, t.z).sub(b.centre).applyQuaternion(inv.copy(b.quat).invert())
      const m = BALL_R + 0.02
      if (Math.abs(local.x) < b.half.x + m && Math.abs(local.y) < b.half.y + m && Math.abs(local.z) < b.half.z + m) return 'printer'
    }
    const overDesk = Math.abs(t.x) < 1.0 + BALL_R + 0.02 && Math.abs(t.z) < 0.475 + BALL_R + 0.02
    if (overDesk && t.y > this.deskTop - 0.02) return 'desk'
    if (overDesk && t.y > BALL_R + 0.03) return 'deskSide'
    return 'floor'
  }

  /** whether a ball thrown from `p` at `v` stays above the desk top while it's over it */
  private clearsDesk(p: THREE.Vector3, v: THREE.Vector3): boolean {
    const top = this.deskTop + BALL_R + 0.025
    for (let t = 0.02; t < 1.6; t += 0.02) {
      const x = p.x + v.x * t
      const z = p.z + v.z * t
      const y = p.y + v.y * t - 4.905 * t * t
      if (y < 0) return true
      if (Math.abs(x) < 1.0 + BALL_R && Math.abs(z) < 0.475 + BALL_R && y < top && v.y - 9.81 * t < 0) return false
    }
    return true
  }

  // ---- the frame ----------------------------------------------------------------------------
  step(dt: number): void {
    if (!this.shown || !this.ready) return
    this.t += dt
    this.lastDt = dt
    const { w, h } = this.view()
    if (this.camera.aspect !== w / h) {
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
    }
    if (this.state === 'intro') this.stepIntro()
    else if (this.state === 'dive') this.stepDive()

    // the sheet in the hand
    const s = this.held
    let crumpled = 0
    if (s && this.state === 'play') {
      if (s.crumple < 1) {
        // the drag's length since the grab crumples it further (paper keeps whatever it already has)
        const want = Math.min(1, (s.mesh.userData.c0 as number) + this.dragPx / (CRUMPLE_DRAG * h))
        const c0 = s.crumple
        this.setCrumple(s, s.crumple + (want - s.crumple) * Math.min(1, dt * 14))
        if (want >= 1 && s.crumple > 0.97) {
          this.setCrumple(s, 1)
          this.quiet(() => this.crumpleSound.squeeze())
        }
        crumpled = s.crumple - c0
        const p = this._v.copy(s.mesh.position).project(this.camera)
        this.crumpleLast = { c: s.crumple, x: p.x }
        // picked up as it crumples: lifted off the desk, toward you
        const lift = THREE.MathUtils.smoothstep(s.crumple, 0, 0.5)
        const home = s.mesh.userData.home as THREE.Vector3
        const target = this._v.set(home.x, home.y + lift * 0.16, home.z + lift * 0.12)
        s.mesh.position.lerp(target, Math.min(1, dt * 8))
        if (s.crumple >= 1) {
          this.active = undefined
          this.holdPlaneFor(s)
        }
      } else this.stepHold(s, dt)
    }
    // the crumpling's sound: snaps while it's worked, its creases ticking a moment after
    this.quiet(() => this.crumpleSound.update(crumpled, dt, this.crumpleLast.c, this.crumpleLast.x))
    // a half-crumpled sheet let go: back down onto the desk
    for (const q of this.sheets) {
      if (q.mesh.userData.settle && q !== this.held) {
        const home = q.mesh.userData.home as THREE.Vector3
        const ty = home.y + q.crumple * BALL_R * 0.9
        q.mesh.position.lerp(this._v.set(home.x, ty, home.z), Math.min(1, dt * 6))
        if (Math.abs(q.mesh.position.y - ty) < 0.0005) q.mesh.userData.settle = false
      }
    }

    // physics: the balls
    if (this.world) {
      this.acc = Math.min(this.acc + dt, this.world.timestep * 4)
      try {
        while (this.acc >= this.world.timestep) {
          this.world.step()
          this.acc -= this.world.timestep
        }
      } catch (e) {
        // the Rapier wasm can trap (rarely — "recursive use of an object", then "unreachable"),
        // and after that nothing collides any more: a fresh world, every ball where it lay
        console.warn('[paper] physics trapped — rebuilt', e)
        const lost = this.sheets.find((q) => q.body)
        this.acc = 0
        if (lost) this.rebuildPhysics(lost, false)
        else this.buildPhysics()
      }
      for (const b of this.sheets) {
        if (!b.body) continue
        const t = b.body.translation()
        const r = b.body.rotation()
        b.mesh.position.set(t.x, t.y, t.z)
        b.mesh.quaternion.set(r.x, r.y, r.z, r.w)
        // (should one ever get out of the world, it's back on the desk)
        // the floor and the desk top are also held here, outside Rapier: a ball has (rarely, and only
        // in real play — never reproduced from code) gone straight through them
        const onDesk = Math.abs(t.x) < 1.0 && Math.abs(t.z) < 0.475
        const floorY = onDesk && t.y > this.deskTop - 0.06 ? this.deskTop + BALL_R : BALL_R
        if (t.y < floorY - 0.004 && t.y > -0.1) {
          const lv0 = b.body.linvel()
          b.body.setTranslation({ x: t.x, y: floorY, z: t.z }, true)
          b.body.setLinvel({ x: lv0.x * 0.8, y: Math.max(0, -lv0.y * 0.3), z: lv0.z * 0.8 }, true)
          b.mesh.position.y = floorY
        }
        if (t.y < -0.1) {
          // below the floor: the simulation has broken (rarely, the floor and the desk stop
          // colliding at all — even for a new ball). Start the world over, every ball where it lay,
          // this one back on the desk
          console.warn('[paper] a ball fell through the world — physics rebuilt')
          this.rebuildPhysics(b)
          break
        }
        // lumpy paper doesn't roll: on a surface (low and slow-falling) it's braked hard
        const lv = b.body.linvel()
        // the air it cuts, flying: by its speed, its spin, how far it is, where on screen
        {
          const av = b.body.angvel()
          const sp = this._v.set(t.x, t.y, t.z).project(this.camera)
          this.quiet(() => this.tossSound.update(b, dt, Math.hypot(lv.x, lv.y, lv.z), Math.hypot(av.x, av.y, av.z), this.camera.position.distanceTo(b.mesh.position), sp.x, true))
        }
        if (!b.mesh.userData.noBrake && Math.abs(lv.y) < 0.25 && (t.y < BALL_R + 0.01 || Math.abs(t.y - (this.deskTop + BALL_R)) < 0.01)) {
          b.body.setLinearDamping(4)
          b.body.setAngularDamping(6)
        } else {
          b.body.setLinearDamping(0.05)
          b.body.setAngularDamping(0.6)
        }
        // a ball hitting the bin rocks it
        const pv = b.mesh.userData.pv as THREE.Vector3 | undefined
        const nv = new THREE.Vector3(lv.x, lv.y, lv.z)
        if (pv) {
          const dv = pv.distanceTo(nv)
          const near = Math.hypot(t.x - BIN.x, t.z - BIN.z) < BIN.rTop + 0.08 && t.y < BIN.h + 0.06
          if (near && dv > 0.7) this.binR?.rock(pv.clone().setY(0).normalize(), Math.min(dv / 3, 1.2))
          // a bounce: its speed changed more than gravity alone would change it
          if (HITS_ON) {
            const kick = Math.hypot(nv.x - pv.x, nv.y - pv.y + 9.81 * dt, nv.z - pv.z)
            const now = performance.now()
            if (kick > 0.35 && now - ((b.mesh.userData.hitAt as number) ?? -1e9) > 45) {
              b.mesh.userData.hitAt = now
              const sp = this._v.set(t.x, t.y, t.z).project(this.camera)
              this.quiet(() => this.hitSound.hit(this.surfaceAt(t), kick, sp.x, this.camera.position.distanceTo(b.mesh.position)))
            }
          }
        }
        b.mesh.userData.pv = nv
        this.judge(b, dt)
      }
    }
    this.ptrVel.multiplyScalar(Math.pow(0.02, dt)) // (a still cursor stops shoving)
    this.stepPrint(dt)
    this.stepSheetsAtRest()
    this.stepReactions(dt)
    this.updateCursor()
    // (dev: drop a test ball with a given velocity — physics checks)
    ;(window as unknown as { __paperDrop: unknown }).__paperDrop = (x: number, y: number, z: number, vx: number, vy: number, vz: number) => {
      const body = this.world!.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinvel(vx, vy, vz).setCcdEnabled(true))
      this.world!.createCollider(RAPIER.ColliderDesc.ball(BALL_R).setDensity(30).setFriction(0.9).setRestitution(0.3), body)
      const log: number[][] = []
      const iv = setInterval(() => {
        const t = body.translation()
        log.push([+t.x.toFixed(3), +t.y.toFixed(3), +t.z.toFixed(3)])
        if (log.length > 40) clearInterval(iv)
      }, 50)
      return log
    }
    // (dev: a paper ball thrown from a given spot at a given velocity, through the real path)
    ;(window as unknown as { __paperThrow: unknown }).__paperThrow = (x: number, y: number, z: number, vx: number, vy: number, vz: number, noBrake = false) => {
      const sh = this.addSheet(this.printTex.texture)
      this.setCrumple(sh, 1)
      sh.mesh.position.set(x, y, z)
      this.throwBall(sh)
      sh.body!.setLinvel({ x: vx, y: vy, z: vz }, true)
      sh.mesh.userData.noBrake = noBrake
      const log: number[][] = []
      const iv = setInterval(() => {
        const t = sh.mesh.position
        log.push([+t.x.toFixed(3), +t.y.toFixed(3), +t.z.toFixed(3)])
        if (log.length > 40) clearInterval(iv)
      }, 50)
      return log
    }
    // (dev: where the sheet and the bin are on screen, for the walk-through tests)
    ;(window as unknown as { __paper: unknown }).__paper = () => {
      const { w, h } = this.view()
      const scr = (v: THREE.Vector3) => {
        const p = v.clone().project(this.camera)
        return [Math.round((p.x * 0.5 + 0.5) * w), Math.round((1 - (p.y * 0.5 + 0.5)) * h)]
      }
      return { state: this.state, printer: this.printer ? scr(this.printer.position.clone().setY(this.deskTop + 0.15)) : null, printing: !!this.printing, held: this.held ? scr(this.held.mesh.position) : null, sheet: this.active ? scr(this.active.mesh.position) : null, bin: scr(new THREE.Vector3(BIN.x, BIN.h, BIN.z)), balls: this.sheets.map((q) => ({ c: +q.crumple.toFixed(2), p: q.mesh.position.toArray().map((v) => +v.toFixed(3)), scored: q.scored })) }
    }
  }

  private holdPlaneFor(s: Sheet): void {
    // the hand moves the ball across a plane facing the camera, through where the ball is
    const n = this.camera.getWorldDirection(this._v).negate()
    this.holdPlane.setFromNormalAndCoplanarPoint(n, s.mesh.position)
  }

  private stepHold(s: Sheet, dt: number): void {
    this.ray.setFromCamera(this.toNdc(this.pointer.x, this.pointer.y), this.camera)
    if (!this.ray.ray.intersectPlane(this.holdPlane, this.holdTarget)) return
    this.holdTarget.y = Math.max(this.holdTarget.y, this.deskTop + 0.12) // held up, ready to toss
    // the same illusion as the toss: the ball in the hand sits a little nearer the eye than where it
    // looks (along the very line of sight, so on screen nothing changes) — held "over" the bin and
    // let go, it drops just in front of it
    this.holdTarget.addScaledVector(this.ray.ray.direction, -AIM_ILLUSION)
    // ...and never really over the bin's mouth, wherever the cursor is: if it would be, it's drawn
    // further toward the eye along the same line until it's clear of the rim
    for (let i = 0; i < 40 && this.overMouth(this.holdTarget); i++) this.holdTarget.addScaledVector(this.ray.ray.direction, -0.02)
    s.mesh.position.lerp(this.holdTarget, Math.min(1, dt * 22))
    s.mesh.rotation.y += dt * 0.6
    this.holdTrail.push({ p: s.mesh.position.clone(), t: performance.now() })
    if (this.holdTrail.length > 12) this.holdTrail.shift()
  }

  /** in the bin, or a miss once it lies still */
  private judge(b: Sheet, dt: number): void {
    if (!b.body || b.scored || !b.thrown) return
    const t = b.body.translation()
    if (location.search.includes('aimlog') && Math.random() < 0.7) {
      const lv = b.body.linvel()
      console.info('[paper] ball', [t.x, t.y, t.z].map((v) => +v.toFixed(3)), 'v', [lv.x, lv.y, lv.z].map((v) => +v.toFixed(2)), 'rot', Object.values(b.body.rotation()).map((v) => +(+v).toFixed(3)), 'w', +b.body.angvel().x.toFixed(1))
    }
    const dx = t.x - BIN.x
    const dz = t.z - BIN.z
    const inside = Math.hypot(dx, dz) < BIN.rBottom && t.y < BIN.h - BALL_R && t.y > 0
    if (inside) {
      b.scored = true
      this.startDive()
      return
    }
    const v = b.body.linvel()
    const still = Math.hypot(v.x, v.y, v.z) < 0.08
    b.restT = still ? b.restT + dt : 0
    if (b.restT > 0.5 && !b.missDealt) {
      b.missDealt = true
      this.misses++
      // (the next draft is the player's to print — the printer's light blinks for it)
    }
  }

  /** PLACEHOLDER copy (Danilo writes the real lines): a typed draft on the hero's paper */
  private draftTexture(n: number): THREE.Texture {
    const cv = document.createElement('canvas')
    cv.width = 2048
    cv.height = Math.round((2048 * SHEET_H) / SHEET_W)
    const g = cv.getContext('2d')!
    g.fillStyle = '#efede6'
    g.fillRect(0, 0, cv.width, cv.height)
    // a printed page is portrait — it comes out of the printer short side across, its text facing
    // whoever is at the desk: laid out on the portrait page, turned a quarter onto the sheet's texture
    const pw = cv.height, ph = cv.width
    g.save()
    g.translate(cv.width / 2, cv.height / 2)
    g.rotate(DRAFT_TURN * Math.PI / 2)
    g.translate(-pw / 2, -ph / 2)
    g.fillStyle = '#121212'
    g.font = '500 40px "IBM Plex Mono", monospace'
    g.fillText(`RASCUNHO ${String(n).padStart(2, '0')}`, 110, 170)
    g.font = 'italic 400 96px "Tinos", serif'
    g.fillText(`[frase`, 110, ph / 2 - 30)
    g.fillText(`provisória ${n}]`, 110, ph / 2 + 80)
    g.font = '400 36px "IBM Plex Mono", monospace'
    g.fillText('GENERIC — copy a definir', 110, ph - 150)
    g.restore()
    const t = new THREE.CanvasTexture(cv)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  }

  private stepIntro(): void {
    // from black, right over the print, pulling back and tilting up until it's a sheet on a desk
    const k = THREE.MathUtils.clamp(this.t / INTRO_TIME, 0, 1)
    const lead = this.direct ? 0 : 0.55 // (through the cubes: out of the black first)
    this.fade = this.direct ? 0 : 1 - THREE.MathUtils.smoothstep(this.t, 0, lead)
    const hold = THREE.MathUtils.clamp((this.t - lead) / (INTRO_TIME - lead), 0, 1)
    const e = hold < 0.5 ? 4 * hold ** 3 : 1 - (-2 * hold + 2) ** 3 / 2
    this._m.lookAt(this.finalPose.pos, this.finalPose.look, new THREE.Vector3(0, 1, 0))
    this._q.setFromRotationMatrix(this._m)
    const arc = Math.sin(e * Math.PI) * 0.18
    this.camera.position.lerpVectors(this.introFrom.pos, this.finalPose.pos, e).y += arc
    this.camera.quaternion.slerpQuaternions(this.introFrom.quat, this._q, e)
    // the print goes from exactly the hero's pixels to paper under the lamp
    const lit = THREE.MathUtils.smoothstep(hold, 0.05, 0.6)
    for (const s of this.sheets) {
      const m = s.mesh.material as THREE.MeshStandardMaterial
      m.emissiveIntensity = 1 - lit * (1 - PAPER_GLOW)
      m.color.setScalar(lit)
      ;(m.userData.mixB as { value: number }).value = THREE.MathUtils.smoothstep(hold, 0.08, 0.5)
    }
    if (k >= 1) this.state = 'play'
    // the drafts that come later are lit from the start
  }

  private startDive(): void {
    this.onDive?.()
    this.state = 'dive'
    this.t = 0
    this.diveFrom.pos.copy(this.camera.position)
    this.diveFrom.quat.copy(this.camera.quaternion)
    this.diveWas.copy(this.camera.position)
    this.quiet(() => this.diveSound.start(DIVE_TIME, this.diveRimTime()))
  }

  /** (the dive's sound) when, in s, the camera goes in past the bin's rim — its path in stepDive,
   *  walked ahead of time */
  private diveRimTime(): number {
    for (let k = 0; k <= 1; k += 0.005) {
      const e = k * k * (3 - 2 * k)
      const overY = BIN.h + 0.55 - e * 0.62
      const y = THREE.MathUtils.lerp(this.diveFrom.pos.y, overY, Math.min(1, e * 1.4))
      if (y <= BIN.h + 0.02) return k * DIVE_TIME
    }
    return DIVE_TIME * 0.8
  }

  private stepDive(): void {
    // over the bin, then down into it — its dark is where the next page opens
    const k = THREE.MathUtils.clamp(this.t / DIVE_TIME, 0, 1)
    const e = k * k * (3 - 2 * k)
    const over = this._v.set(BIN.x, BIN.h + 0.55 - e * 0.62, BIN.z + 0.08 * (1 - e))
    this.camera.position.lerpVectors(this.diveFrom.pos, over, Math.min(1, e * 1.4))
    this._m.lookAt(this.camera.position, new THREE.Vector3(BIN.x, 0, BIN.z), new THREE.Vector3(0, 0, -1))
    this._q.setFromRotationMatrix(this._m)
    this.camera.quaternion.slerpQuaternions(this.diveFrom.quat, this._q, Math.min(1, e * 1.6))
    this.fade = THREE.MathUtils.smoothstep(k, 0.62, 1)
    // (its sound: by the camera's real speed, how near the bin's mouth it is, how far into black)
    const moved = this.camera.position.distanceTo(this.diveWas)
    this.diveWas.copy(this.camera.position)
    const mouth = this._v.set(BIN.x, BIN.h, BIN.z)
    this.quiet(() => this.diveSound.update(moved / Math.max(1e-3, this.lastDt), this.camera.position.distanceTo(mouth), this.fade))
    if (k >= 1) {
      this.state = 'done'
      this.onDone?.()
    }
  }

  private updateCursor(): void {
    let want = ''
    if (this.state === 'play') {
      if (this.held) want = 'grabbing'
      else if (this.pick(this.pointer.x, this.pointer.y)) want = 'grab'
    }
    if (want !== this.cursor) {
      setCursor('desk', want)
      this.cursor = want
    }
  }

  render(): void {
    if (!this.ready) {
      this.renderer.setClearColor(0x000000, 1)
      this.renderer.clear()
      return
    }
    this.drawn.normalPass(this.scene, this.camera, this.chalkRoots)
    this.renderer.render(this.scene, this.camera)
    if (this.fade > 0.001) {
      this.fadeMat.opacity = this.fade
      this.renderer.autoClear = false
      this.renderer.render(this.fadeScene, this.printCam)
      this.renderer.autoClear = true
    }
  }

  dispose(): void {
    window.removeEventListener('pointermove', this.onMove)
    window.removeEventListener('pointerdown', this.onDown)
    window.removeEventListener('pointerup', this.onUp)
    window.removeEventListener('pointercancel', this.onUp)
    setCursor('desk', '')
  }
}


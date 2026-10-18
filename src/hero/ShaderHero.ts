import { WeAreSound } from './WeAreSound'
import * as THREE from 'three'
import { TTFLoader } from 'three/examples/jsm/loaders/TTFLoader.js'
import { Font } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import fullscreenVert from './shaders/fullscreen.vert'
import paperFrag from './shaders/paper.frag'
import galaxyFrag from './shaders/galaxy.frag'
import beyondFrag from './shaders/beyond.frag'
import { CrumbRain, CRUMB_VIEW_H } from '../ui/CrumbRain'
import { FluidSim } from './FluidSim'
import { RevealMask, REVEAL_GLSL } from './RevealMask'
import { Drawn, DRAWN_GLSL } from './Drawn'
import { TunnelObjects, WORLD_SCALE, PORTRAIT, SRC_MAT, REAL_HOLE, type TunnelLook, type TunnelSet } from './TunnelObjects'
import { realMaterial } from './ObjectLook'
import { PaperDesk } from '../behind/PaperDesk'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { LetterSwap, type Slot } from './LetterSwap'
import { setCursor } from '../ui/cursor'

const LOCKUP_FRACTION_DESKTOP = 0.82
const LOCKUP_FRACTION_MOBILE = 0.92

/** CSS px the canvas extends above the viewport (must match `#stage { top }` in hero.css).
 *  Chrome offsets the WebGL surface a few px down from the element box on this
 *  machine; the dirty edge lands in this clipped-away overscan instead of on screen. */
const OVERSCAN = 100

/** distance from the door camera to the closed doors (z = 0) */
const DOOR_CAM_Z = 4
/** the door camera's resting field of view — frustum maths use this, not the live
 *  `doorCam.fov`, which the wormhole widens at runtime */
const DOOR_FOV = 50
/** z of the crumb pile — in front of the closed doors, so the camera leaves it behind */
const CRUMB_Z = 2.4
/** extrusion depth of the sign letters, as a fraction of cap height */
const LETTER_DEPTH = 0.17

/** the material roulette: unrelated food materials the hovered surface cuts to, hard,
 *  no blend, in random order, at random intervals — see uMatIndex in the letter
 *  fragment shader. Index 0 (chrome) is the resting look and isn't in this pool; it's
 *  what a fresh hover always starts on. Grows as more materials get built. */
const FOOD_MATERIALS = [1] // 1 = guaraná soda
// material roulette on hover — OFF while the noth.in reveal (RevealMask) is the
// hover effect; the two fighting over the sign read as a glitch. Code kept intact.
const ROULETTE_ENABLED = false
/** how long (seconds) a material holds before the roulette cuts to the next one */
const MAT_SWITCH_MIN = 1.2
const MAT_SWITCH_MAX = 2.6
/** how far the door-cubes rotate before freezing (radians). 2.129 = 122° */
const SPIN_CAP = 2.129
/** scroll fraction at which the rotation + recede freeze and the camera starts its
 *  forward dive */
const FREEZE_P = 0.61
const PAPER_AT_P = FREEZE_P - 0.004 // (/hero-paper) the cubes all but locked: that frame is printed
// the reveal holes (RevealMask) fade out over the first stretch of door motion —
// noth.in's 1-fade² splat falloff + faster dye bleed, fully cleared by here
const REVEAL_FADE_P = 0.2
// the doors count as shut (and the hover's on, on /hero-letters) until their eased swing
// (doorE) moves them ~a pixel — progress itself creeps up well before anything visibly moves
const DOORS_SHUT_E = 4e-4
/** where the camera ends its dive — punched fully past the frozen cubes */
const CAM_DIVE_END = -17
/** section 2 — the photo tunnel behind the doors (Floema's recipe) */
const TUNNEL_ARM_P = 0.99 // turns on once the camera has punched fully past the cubes
const TUNNEL_REVEAL_P = 0.55 // photos start appearing one at a time just before the zoom-in
const TUNNEL_STAGGER = 0.085 // seconds between each photo's fade-in (random order)
const TUNNEL_RADIUS = 10 // photos ride a circle of this radius around the forward axis
const TUNNEL_SPACING = 1.4 // z-gap between photos
/** texts in the photo tunnel — Danilo writes these. Empty = photos only (and the wormhole is
 *  free to charge from the start). Unlike the photos they don't drift on their own: they hang
 *  in the tunnel one after another and only come toward the screen as the visitor scrolls (scroll
 *  back, they go back). Until the last one has gone past, the wormhole can't charge; after it,
 *  no more texts — just the photos, until the visitor scrolls hard enough to go through */
const TUNNEL_TEXTS: string[] = [] // e.g. ['one line', 'two\nlines']
const TEXT_FIRST = 16 // distance ahead of the camera of the first text, at rest
const TEXT_GAP = 14 // between two texts
const TEXT_PER_PX = 0.012 // world units of travel per px of wheel delta
const TEXT_H = 1.15 // text height, world
const TEXT_STEP_MAX = 2.4 // most one wheel notch moves the texts
// TEST (/hero-tunnel-featured): the line-up, one at a time down the axis
const FEATURED = ['tennis_racket', 'tennis_ball', 'tt_rackets', 'chess_clock', 'piece_king_white', 'running_shoe', 'stopwatch', 'trophies', 'keyboard']
const FEAT_FIRST = 9 // distance ahead of the camera of the first, at rest
const FEAT_GAP = 7 // between two (left / right alternate, so two can share the view)
const FEAT_SIZE = 1.5 // each object's longest side, world
const FEAT_X = 3.2 // how far off the axis, world
const TUNNEL_FOG_FAR = 78 // photos dissolve into the dark by this distance (tunnel running)
const TUNNEL_FOG_INTRO = 210 // fog pushed back during the one-by-one reveal so it reads
const REAL_RES = 0.75
const REAL_BG = new THREE.Color(0xfdfdfc) // (/hero-tunnel-secret-reveal) behind the cursor's holes, as the hero's
const DRAWN_OBJ_SCALE = 16 // /hero-tunnel-drawn.html: metres -> tunnel units — kept at what it was when Danilo last saw it (the real tunnel's has grown since)
const TUNNEL_OBJ_EVERY = 2 // an objects tunnel fills one slot in this many (72 slots -> 36 objects)
const TUNNEL_PLANES = 72 // enough to fill the corridor + a buffer — denser, so it doesn't feel sparse at high speed
const TUNNEL_IMG_SIZE = 1.5
const TUNNEL_SCALE_RAND = 0.5
const TUNNEL_SPEED_WARP = 240 // units/sec burst the instant the tunnel arms
const TUNNEL_SPEED_IDLE = 10 // baseline drift once the burst settles
const TUNNEL_WARP_TIME = 1.1 // seconds to ease from warp -> idle
const TUNNEL_SCROLL_BOOST = 60 // extra units/sec per unit of accumulated scroll input

/** section 2 — the wormhole. Sustained fast scrolling inside the armed tunnel
 *  builds a charge; easing off bleeds it away fast (but not instantly — a 0.5s
 *  pause costs real ground). This first stretch — up to WORM_STREAK_ON, where the
 *  hyperspace streaks take over — is the hard, scroll-driven part. Past that it's
 *  WORM_AUTO_TIME of automatic charging: the streaks appearing IS the promise that
 *  you've earned the rest of the ride, so scroll stops being required. Hold it
 *  pinned at full and it locks: from there the fall itself is also automatic. */
const WARP_SCROLL_THRESH = 0.9 // tunnelScroll above this counts as "scrolling hard" — reachable by a mouse wheel's fewer, larger notches, not just a trackpad's fast stream
const WARP_CHARGE_TIME = 2.6 // seconds of hard scroll to fill the charge from empty, at full commitment
const WARP_DISCHARGE_TIME = 0.9 // seconds to bleed a full charge back to empty when you ease off
const WARP_HOLD_TIME = 0.6 // seconds pinned at full charge before the wormhole locks
const WARP_CHARGE_SPEED = 780 // extra tunnel units/sec at full charge — the rush as it forms
const WORM_AUTO_TIME = 3.5 // seconds to auto-finish the charge once the streaks appear
// "commitment" — charging rewards several distinct scroll pushes, not one powerful
// held scroll. A gap of WORM_GESTURE_GAP since the last wheel input starts counting
// the next one as a NEW push; one continuous scroll (any length, any speed) only
// ever counts as a single push and charges at WORM_GESTURE_FLOOR speed.
const WORM_GESTURE_GAP = 0.15 // seconds of quiet that starts a new push
const WORM_GESTURE_DECAY = 2.4 // seconds for one counted push to fade away
const WORM_GESTURE_NEEDED = 10 // distinct recent pushes for full-speed charging
const WORM_GESTURE_FLOOR = 0.12 // charging speed with only a single continuous push
const WARP_FOV_GAIN = 14 // degrees the camera fov widens at full charge
const WORMHOLE_DURATION = 3.4 // seconds of automatic fall through the throat once it locks
const WORMHOLE_SPEED = 650 // photo-suck rush speed during the fall
const WORM_DIST_FAR = 95 // how far ahead the vortex sits at charge 0 — a small speck
const WORM_DIST_NEAR = 7 // how close it comes at full charge — about to swallow the view
const WORM_SCALE_FAR = 4
const WORM_SCALE_NEAR = 8
const WORM_TILT = 0.34 // radians the disc leans back — the near-face-on 3D read of the ref
const WORM_SPIN_BASE = 0.06 // rad/sec the galaxy turns at rest
const WORM_RT_SIZE = 1024 // baked galaxy texture resolution
// the chapter tunnel — what's beyond the wormhole (placeholder destination, TBD).
// One tube, one shader, four looks crossfading in sequence: dark faceted metal,
// green digital grid, purple fractal energy, red fractal energy. Fully automatic.
// The tube is a real winding path (TubeGeometry along a closed, wavy curve) that
// the camera actually travels — a straight tube centred on the camera looks dead
// ahead into a black hole (no wall lies exactly on the view axis) and can't be
// sinuous either; a real curved path fixes both at once.
const BEYOND_TUBE_R = 5 // tube radius
const BEYOND_BASE_R = 110 // the loop's base radius — big, so the curl doesn't read as an obvious circle, and long enough that a fast camera doesn't lap it mid-ride
const BEYOND_SEGMENTS = 500 // tubular segments along the curve
const BEYOND_SPEED = 55 // units/sec the camera travels along the path
const TUNNEL_CH_COUNT = 4
const TUNNEL_CH_DURATION = 3.0 // seconds per chapter
const TUNNEL_CH_BLEND = 0.9 // seconds of crossfade into the next chapter, at the end of each

// the approach — what plays after the chapter tunnel instead of fading to black:
// a plain white void, a small dark ball far down the axis, camera falling toward
// it while an enclosing background shader gains colour (the "tube" feeling, purely
// a 2D pattern reacting to progress — steven.com's actual trick, reverse-engineered)
// and, close in, a ring literally forms around the ball as the background goes dark.
const APPROACH_START_Z = 140
const APPROACH_END_Z = 3.2
const APPROACH_TIME = 5.5 // seconds falling toward the ball
const APPROACH_RING_START = 0.78 // fraction of APPROACH_TIME when the ring starts forming
const APPROACH_BALL_R = 0.45
const APPROACH_RING_R = 2.2
const APPROACH_BG_R = 180 // the enclosing background sphere's radius
// the hyperspace streak field (below) fades in across this charge window, so it
// takes over right as the photos are dissolving out
const WORM_STREAK_ON = 0.42
const WORM_STREAK_OFF = 0.30
// the hyperspace streak field — hundreds of tiny dashes scattered around the
// forward axis (NOT the photo ring), each length driven by its own radius (far
// off-axis = longer streak, near-centre = a short dash) and by speed
const WORM_STREAK_COUNT = 900
const WORM_STREAK_RAD_MIN = 0.5
const WORM_STREAK_RAD_MAX = 17
const WORM_STREAK_RANGE = 130 // z depth each dash recycles across
const WORM_STREAK_WIDTH = 0.028
const WORM_STREAK_LEN_BASE = 0.05
const WORM_STREAK_LEN_RAD = 0.11 // extra length per world unit of radius
const WORM_STREAK_SPEED = 55 // base z advance, scaled up by charge/fall

/**
 * The hero. The off-white ground is a shader (grain + vignette); on it stands a
 * physical sign — "We are GENERIC" as extruded Tinos (Times-metric) letters
 * with real depth and a bevel, dark polished metal. The cursor lays a heat field
 * (ping-pong FBO) and where it's hot the metal turns to liquid chrome, cooling
 * back when you leave.
 *
 * The ground is rendered to a target and mapped onto two giant door leaves; the
 * letters are split GEN | ERIC. and parented to the leaves, so each half rides
 * its own door. Closed (scroll 0) it reads as a plain hero; scroll swings the
 * leaves open from the centre and pushes the camera through into the space
 * beyond. The chrome-on-hover fades out as the doors open.
 */
/** the sign's look: 'classic' (Tinos, chamfered gloss black — the main hero), 'matte' (Tinos,
 *  straight cut, matte black — /hero-letters) */
export type SignStyle = 'classic' | 'matte'

export class ShaderHero {
  private renderer: THREE.WebGLRenderer
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private clock = new THREE.Clock()

  private quad = new THREE.PlaneGeometry(2, 2)
  private heroScene = new THREE.Scene()
  private heroMat: THREE.ShaderMaterial
  /** the cursor's own GPU fluid sim (velocity + dye, real Navier-Stokes advection —
   *  see FluidSim.ts) — feeds the letter shader's material-roulette materials their
   *  local swirl/direction detail. Built once fonts+geometry are ready (needs the
   *  shared quad + renderer), see init(). */
  private fluid!: FluidSim
  /** noth.in's hero mechanic: the cursor stirs a second, separate fluid whose dye
   *  cuts hard-edged holes through the door face + letters, video underneath.
   *  See RevealMask.ts. Fades out as the doors start to move. */
  private reveal!: RevealMask

  private heroRT: THREE.WebGLRenderTarget
  /** TEST (/hero-drawn.html): see Drawn.ts */
  private drawn?: Drawn
  private drawnCrumbs = false
  /** drawn: "We do things / for people." as drawn letters, sunk in hatching until their face turns
   *  into the light (the same gate as the plain ones' reveal) */
  private drawnTagShade = { value: 1 }
  private _drawnTagMat?: THREE.ShaderMaterial
  private get drawnTagMat(): THREE.ShaderMaterial {
    this._drawnTagMat ??= new THREE.ShaderMaterial({
      uniforms: { ...this.drawnU, uShade: this.drawnTagShade },
      vertexShader: `
        varying vec3 vViewN;
        varying vec4 vClip;
        void main() {
          vViewN = normalize(normalMatrix * normal);
          vClip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = vClip;
        }`,
      fragmentShader: `
        precision highp float;
        uniform float uShade;
        varying vec3 vViewN;
        varying vec4 vClip;
        ${DRAWN_GLSL}
        void main() {
          vec2 suv = (vClip.xy / vClip.w) * 0.5 + 0.5;
          float ink = max(drawnInk(suv, vViewN), drawnTone(suv, uShade));
          gl_FragColor = vec4(mix(drawnPaper(suv), D_INK, ink), 1.0);
        }`,
    })
    return this._drawnTagMat
  }
  private crumbReveal = false
  private crumbPushHold = false
  private crumbGrabCursor = false
  private tunnelObjs?: TunnelObjects
  private tunnelItems: THREE.Object3D[] = []
  private tunnelFeatured = false
  private tunnelRandom = false
  private drawnScale = 16
  private drawnEvery = 1
  /** TEST (/hero-tunnel-secret.html): a few objects kept still at fixed spots of the screen, never
   *  drawn themselves — they're written into the drawn outline pass instead, so the tunnel's chalk
   *  objects draw THEIR outlines wherever they pass over them (the accident Danilo liked, on purpose) */
  private secretSpec: { name: string; x: number; y: number; size: number; rot?: number }[] = []
  private secretScene = new THREE.Scene()
  private secretRoot = new THREE.Group()
  private secretCam?: THREE.PerspectiveCamera
  private tunnelHoverColor = false
  // (/hero-tunnel-secret-reveal.html) the hero's cursor holes over the tunnel's drawn objects: each
  // one's real twin, drawn to realRT from the same camera, shows through them
  private tunnelReveal = false
  private hoverEnvP?: Promise<THREE.Texture>
  private realScene = new THREE.Scene()
  private realInst: { mesh: THREE.InstancedMesh; part: THREE.Matrix4; items: number[] }[] = []
  private realReach: number[] = []
  private realRT?: THREE.WebGLRenderTarget
  private realIdle = 1e9 // s since the cursor last moved (no trail left after ~4 s: no real render)
  private realLast = new THREE.Vector2()
  private realClear = new THREE.Color()
  private realPath: { x: number; y: number; t: number }[] = [] // the cursor's last few seconds, in screen-heights
  private realClock = 0
  private secretDirty = true
  private realOdd = false
  // (/hero-paper.html) behind the cubes, a desk instead of the tunnel — see src/behind/PaperDesk.ts.
  // snapTex: the hero frame from the moment the scroll began (printed on the sheet)
  private paper?: PaperDesk
  private paperShown = false
  // (/hero-paper-direct.html) no cubes: the first scroll turns the hero into the sheet at once
  private paperDirect = false
  private paperOn = false
  private snapTex?: THREE.FramebufferTexture
  private behindDone = false
  private realP = new THREE.Vector3()
  private hoverRay = new THREE.Raycaster()
  private hoverNdc = new THREE.Vector2()
  private hovered: THREE.Object3D | null = null
  private hoverEnv?: THREE.Texture
  private tunnelReady = false
  /** TEST (/hero-tunnel-real.html): the canvas drawn at this share of its resolution while the
   *  tunnel is on screen (and back to full outside it) — frame rate for a little sharpness */
  private tunnelResScale = 1
  private resScaleNow = 1
  private tunnelInst: { mesh: THREE.InstancedMesh; part: THREE.Matrix4; slots: number[] }[] = []
  /** the objects get a scene of their own, drawn over the door scene into the same depth: none of
   *  the door scene's five lights reach them (their own studio light is in their materials) —
   *  every pixel of them was being lit six times */
  private objScene = new THREE.Scene()
  private tunnelSpin: { axis: THREE.Vector3; speed: number; a: number }[] = []
  private tunnelPose = Array.from({ length: TUNNEL_PLANES }, () => new THREE.Matrix4())
  private tunnelShow: boolean[] = []
  private _tq = new THREE.Quaternion()
  private _ts = new THREE.Vector3()
  private _tm = new THREE.Matrix4()
  private featured: THREE.Object3D[] = []
  private grabRay = new THREE.Raycaster()
  private grabNdc = new THREE.Vector2()
  private grabShown = ''
  private drawnU: Drawn['uniforms'] = {
    uDOn: { value: 0 },
    tNormalD: { value: null },
    tDrawingD: { value: null },
    tNoiseD: { value: null },
    uDTime: { value: 0 },
    uDRes: { value: new THREE.Vector2(1, 1) },
  }

  private doorScene = new THREE.Scene()
  private doorCam: THREE.PerspectiveCamera
  private doorMat: THREE.RawShaderMaterial
  private leftHinge = new THREE.Group()
  private rightHinge = new THREE.Group()
  private leftPanel?: THREE.Mesh
  private rightPanel?: THREE.Mesh
  // The tagline TEXT material. Self-contained shader (ignores the scene light list so
  // the other cube's key can't cross-light it): one key direction, gated by the flat
  // face's orientation — dark until the cube turns that face into its key (~123°),
  // then it lights up. Left/right keys mirror.
  private KEY_L = new THREE.Vector3(8.4, 2.0, -5.45)
  private KEY_R = new THREE.Vector3(-8.4, 2.0, -5.45)
  private tagMatL = this.makeSideMat(this.KEY_L, 0x242424, 1.05)
  private tagMatR = this.makeSideMat(this.KEY_R, 0x242424, 1.05)
  private cubeSide = 1 // real edge length of each door-cube, set in buildDoors
  private _look = new THREE.Vector3()

  private letterMat!: THREE.ShaderMaterial
  private lettersL = new THREE.Group()
  private lettersR = new THREE.Group()
  private fonts?: { bold: Font; italic: Font; tag: Font }
  /** the sign's look (see SignStyle) */
  /** TEST (/hero-worm.html): falling through the wormhole lands on this page instead of the
   *  chapter tunnel (the photo tunnel before it is unchanged) */
  private wormTo?: string
  private wormLeaving = false
  /** files of the destination page to warm the cache with while the fall plays */
  private wormPrefetch: string[] = []
  private wormPrefetched = false
  private sign: SignStyle = 'classic'
  /** TEST (/hero-letters.html): the holes show the wordmark in other bodies instead of the video */
  private letterSwap?: LetterSwap
  /** TEST (/hero-letters.html): "We are" as separate letters that dodge the cursor (and are
   *  never cut by the holes) */
  private weAreDodge = false
  private weSound = new WeAreSound() // TEST (?wesound=pop|papel|giz)
  /** the reveal pinned to the surfaces: each fragment looks the holes up where it sat with the
   *  doors shut (rest camera x its own rest matrix), so as the cubes swing and recede the holes
   *  and the letters in them ride along instead of staying put on the screen */
  private restOn = { value: 0 }
  private restVP = { value: new THREE.Matrix4() }
  private restLive = true // doors shut: keep refreshing the rest pose
  private weLetters: { mesh: THREE.Mesh; home: THREE.Vector3; off: THREE.Vector2; vel: THREE.Vector2; rot: number; rotV: number }[] = []
  private weMat?: THREE.ShaderMaterial
  private wePxToWorld = 0.001
  private weLift = 0 // world z: GENERIC's front face minus "We are"'s
  private _weV = new THREE.Vector3()

  /** the cookie/cracker pile — lives in doorScene, in front of the doors */
  readonly crumbs: CrumbRain

  private canvas: HTMLCanvasElement
  private W = window.innerWidth
  private H = window.innerHeight
  private dpr = Math.min(window.devicePixelRatio, 2)

  private pointer = new THREE.Vector2(0.5, 0.5)
  private target = new THREE.Vector2(0.5, 0.5)
  private prevPointer = new THREE.Vector2(0.5, 0.5)
  private active = 0
  private down = 0
  private pointerInside = false

  // material roulette — while hovering, the wordmark surface cuts (hard, no blend)
  // between unrelated materials at random intervals. 0 is the resting chrome-reveal
  // look; anything else is picked from FOOD_MATERIALS. Resets to 0 whenever the
  // cursor leaves the sign itself (not just the window), so every fresh hover starts
  // on the familiar chrome. "Over the sign" is a real raycast against the letter
  // meshes (signMeshes), not the page-wide pointerInside flag — that flag covers the
  // whole window and would let the roulette run in the background whenever the mouse
  // moves anywhere on the page, whether or not it's anywhere near the wordmark.
  private matIndex = 0
  private matTimer = 0
  private matNextSwitch = 1.4
  private raycaster = new THREE.Raycaster()
  private signMeshes: THREE.Mesh[] = []
  // TEST (/hero-hovers-cubos.html): the hover lab's 3D letters (GizLetters.ts) stand in for "GENERIC."
  // while the doors are shut; the hero's own one-piece sign comes back the moment they move
  private signLab = false
  private noReveal = false
  private weAreHigh = false // "We are" still, but at the height the dodging one sits (the main page's)
  private wordMeshes: THREE.Mesh[] = [] // "GENERIC." (and the still "We are", which the lab draws too)
  /** where the sign sits at rest, for the lab: font size (px), baseline and pen origin (px, the
   *  visible frame), and the letters' front plane (world z) */
  labFrame: { S: number; base: number; left: number; frontZ: number; weLeft: number; weBase: number; we: { x: number; y: number; z: number; k: number } | null } | null = null
  /** (lab) the paper as an image instead of the drawn one */
  setPaper(c: HTMLCanvasElement): void {
    let t = this.doorMat.uniforms.uLabPaper.value as THREE.CanvasTexture | null
    if (!t || t.image !== c) {
      t?.dispose()
      t = new THREE.CanvasTexture(c)
      t.colorSpace = THREE.NoColorSpace // display values, as the shader writes them
      t.minFilter = t.magFilter = THREE.LinearFilter
      t.generateMipmaps = false
      this.doorMat.uniforms.uLabPaper.value = t
    }
    t.needsUpdate = true
    this.doorMat.uniforms.uHasLabPaper.value = 1
  }
  /** (lab) the halves of "GENERIC." and the still "We are": they turn with the cubes */
  labWordMeshes(): THREE.Mesh[] {
    return this.wordMeshes
  }
  /** (lab) the two leaves' letter groups and the view at the doors (world units) */
  labLeaves(): { L: THREE.Group; R: THREE.Group; vw: number; vh: number } {
    const vh = 2 * DOOR_CAM_Z * Math.tan(THREE.MathUtils.degToRad(DOOR_FOV / 2))
    return { L: this.lettersL, R: this.lettersR, vw: vh * (this.W / this.H), vh }
  }
  /** the doors haven't visibly moved */
  labDoorsShut = true
  /** extra drawn objects (in the outline pass) */
  labRoots: THREE.Object3D[] = []
  beforeDoorRender?: () => void
  afterDoorRender?: () => void
  labHost(): { renderer: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera; drawn: Drawn; dpr: number; camZ: number; reveal?: { glsl: string; uniforms: Record<string, THREE.IUniform>; restOn: THREE.IUniform; restVP: THREE.IUniform } } {
    return {
      renderer: this.renderer,
      scene: this.doorScene,
      cam: this.doorCam,
      drawn: this.drawn!,
      dpr: this.dpr,
      camZ: DOOR_CAM_Z,
      // the cursor's holes cut the lab's letters too (unless this page has none)
      reveal: this.noReveal ? undefined : { glsl: REVEAL_GLSL, uniforms: this.reveal.uniforms as unknown as Record<string, THREE.IUniform>, restOn: this.restOn, restVP: this.restVP },
    }
  }
  setWordVisible(v: boolean): void {
    for (const m of this.wordMeshes) m.visible = v
  }
  private overSign = false
  private _splatPoint = new THREE.Vector2()
  private _splatDir = new THREE.Vector2()

  private progress = 0
  private progressTarget = 0
  private manual = 0

  // section 2 — the photo tunnel
  private gallery = new THREE.Group()
  private galleryTexts: THREE.Mesh[] = []
  private textTravel = 0 // scroll-driven travel of the texts toward the camera
  private textsDone = TUNNEL_TEXTS.length === 0 // the last text is behind us: the wormhole may charge
  private galleryPhotos: THREE.Mesh[] = []
  private streakTex?: THREE.CanvasTexture // plain thin light-dash texture, shared by the streak field
  private streakField?: THREE.InstancedMesh
  private streakMat?: THREE.MeshBasicMaterial
  private streakAngle?: Float32Array
  private streakRadius?: Float32Array
  private streakZ?: Float32Array
  private streakLen?: Float32Array
  private revealClock = -1 // seconds since the one-by-one reveal started (-1 = not started)
  private tunnelTime = -1 // seconds since the tunnel armed (-1 = not armed)
  private tunnelScroll = 0 // 0..1 scroll input, coasts back to 0 -> speed boost on top of idle
  // the wormhole
  private warpCharge = 0 // 0..1 — builds while scrolling hard, bleeds away fast when you ease off
  private warpHold = 0 // seconds pinned at full charge (locks the wormhole at WARP_HOLD_TIME)
  private wormPulses = 0 // decaying count of distinct recent scroll pushes (commitment, not power)
  private lastPulseTime = -1 // performance.now()/1000 of the last qualifying scroll input
  private wormAuto = false // latched once the streaks appear — charging finishes on its own from there
  private wormAutoStartCharge = 0 // raw warpCharge at the moment autopilot engaged
  private inWormhole = false // locked in — the ride is automatic from here, scroll ignored
  private wormholeTime = 0 // seconds since the wormhole locked
  private arrived = false // reached the other side (undefined for now — ends on black)
  private wormTube?: THREE.Mesh // the spinning vortex disc
  private wormTubeMat?: THREE.ShaderMaterial
  private wormRT?: THREE.WebGLRenderTarget // the procedural spiral-galaxy texture, baked once
  private wormSpin = 0 // accumulated disc rotation (radians)
  private wormFlash?: THREE.Mesh // full-view white plane for the arrival white-out
  private beyondTube?: THREE.Mesh // the chapter tunnel beyond the wormhole
  private beyondMat?: THREE.ShaderMaterial
  private beyondCurve?: THREE.CatmullRomCurve3 // the winding path the camera travels
  private beyondCurveLen = 1 // cached arc length
  private tunnelT = 0 // 0..1 progress along the path (wraps — the loop is closed)
  private inTunnel = false // past the wormhole — the chapter tunnel is running, fully automatic
  private tunnelSeqTime = 0 // seconds since the chapter tunnel started
  private tunnelEnded = false // one pass through all four chapters done — faded out, holding
  private inApproach = false // past the chapter tunnel — falling toward the ball, ring forming
  private approachTime = 0
  private approachBall?: THREE.Mesh
  private approachRings: THREE.Mesh[] = []
  private approachBg?: THREE.Mesh
  private approachBgMat?: THREE.ShaderMaterial

  constructor(canvas: HTMLCanvasElement, opts: { crumbScale?: number; revealLetters?: boolean; weAreDodge?: boolean; crumbPush?: boolean; sign?: SignStyle; wormTo?: string; wormPrefetch?: string[]; chalkEdge?: boolean; chalkOrange?: boolean; drawn?: boolean; drawnCrumbs?: boolean; crumbReveal?: boolean; crumbPushHold?: boolean; crumbGrabCursor?: boolean; tunnelObjects?: TunnelLook; letterSet?: string; tunnelFeatured?: boolean; tunnelSet?: TunnelSet; tunnelResScale?: number; tunnelRandom?: boolean; tunnelPortrait?: string; tunnelHoverColor?: boolean; tunnelHidden?: 'abstract'; drawnScale?: number; drawnEvery?: number; tunnelReveal?: boolean; behind?: 'paper'; paperDirect?: boolean; paperPose?: number[]; scrollAfter?: boolean; signLab?: boolean; noReveal?: boolean; weAreHigh?: boolean; secretObjects?: { name: string; x: number; y: number; size: number; rot?: number }[] } = {}) {
    this.canvas = canvas
    // Size to the canvas's own laid-out box — and pass the RAW fractional size to
    // setSize. Rounding it here makes the backing store a pixel short of the box,
    // which forces Chrome to scale the canvas, and the Intel compositor at
    // fractional Windows scaling then leaves a dirty strip at the top.
    const box = canvas.getBoundingClientRect() // width x (visibleHeight + OVERSCAN)
    this.W = Math.max(1, box.width)
    this.H = Math.max(1, box.height - OVERSCAN) // the visible design frame

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(this.dpr)
    // real shadows in the door scene: the concrete slab occludes its key light from
    // the raised tagline letters until the cube has turned far enough, so the letters
    // sit in the slab's shadow — not just dimly lit — and then reveal their volume
    // through self-shadowing once the light rakes across.
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.setSize(box.width, box.height, false) // backing store covers the whole oversized canvas
    this.renderer.setViewport(0, 0, this.W, this.H) // ...but render only the visible bottom part

    const bw = Math.round(this.W * this.dpr)
    const bh = Math.round(this.H * this.dpr) // device-px size of the visible frame

    this.fluid = new FluidSim(this.renderer, this.quad)
    // /hero-letters: a thicker brush (~x3.7 the splat's r = ~1.7x the stroke width: it's a gaussian)
    this.reveal = new RevealMask(this.renderer, this.quad, !opts.revealLetters, opts.revealLetters ? 5.5e-4 : undefined)
    // TEST (/hero-chalk.html): the holes' edges drawn in the garage's chalk
    this.reveal.uniforms.uRevealChalk.value = opts.chalkEdge ? 1 : 0
    this.reveal.uniforms.uRevealOrange.value = opts.chalkOrange ? 1 : 0
    // TEST (/hero-drawn.html): the sign, "We are" and the crumbs drawn by the garage's hand, the
    // door cubes outlined (see Drawn.ts)
    if (opts.drawn) {
      this.drawn = new Drawn(this.renderer, this.W, this.H, this.dpr)
      this.drawnU = this.drawn.uniforms
      // (/hero-drawn-real.html: the crumbs stay the real, coloured ones)
      this.drawnCrumbs = opts.drawnCrumbs ?? true
    }
    // TEST (/hero-drawn-hold.html): the cursor's holes show a drawn crumb's real colour; the
    // cursor only pushes the pile while the button is held
    this.crumbReveal = !!opts.crumbReveal
    this.crumbPushHold = !!opts.crumbPushHold
    // TEST (/hero-drawn-grab.html): the plain system grab hand over the pile, closed while held
    this.crumbGrabCursor = !!opts.crumbGrabCursor
    // TEST (/hero-tunnel-drawn.html, -real): the tunnel's photos replaced by Danilo's things
    // TEST (/hero-tunnel-featured.html): instead, one of them at a time, big, down the middle
    this.tunnelFeatured = !!opts.tunnelFeatured
    this.tunnelResScale = opts.tunnelResScale ?? 1
    // TEST (/hero-tunnel-portrait.html): objects anywhere on screen, not on the ring; Danilo in chalk
    // hidden behind them; the one under the cursor in its real colours
    this.tunnelRandom = !!opts.tunnelRandom
    if (opts.tunnelHidden === 'abstract') PORTRAIT.uPortraitOn.value = 2
    // (/hero-tunnel-hidden.html: the drawn objects the size and number of the real tunnel's, all
    // there at once like it)
    this.drawnScale = opts.drawnScale ?? DRAWN_OBJ_SCALE
    this.drawnEvery = opts.drawnEvery ?? 1
    this.secretSpec = opts.secretObjects ?? []
    this.tunnelHoverColor = !!opts.tunnelHoverColor
    this.tunnelReveal = !!opts.tunnelReveal
    if (this.tunnelHoverColor || this.tunnelReveal) {
      this.hoverEnvP = new RGBELoader().loadAsync(`${import.meta.env.BASE_URL}hero/tunnel/studio_1k.hdr`).then((hdr) => {
        hdr.mapping = THREE.EquirectangularReflectionMapping
        const pm = new THREE.PMREMGenerator(this.renderer)
        this.hoverEnv = pm.fromEquirectangular(hdr).texture
        pm.dispose()
        return this.hoverEnv
      })
    }
    if (opts.tunnelPortrait) {
      void new THREE.TextureLoader().loadAsync(opts.tunnelPortrait).then((t) => {
        t.colorSpace = THREE.NoColorSpace
        PORTRAIT.tPortrait.value = t
        PORTRAIT.uPortraitAspect.value = (t.image as HTMLImageElement).width / (t.image as HTMLImageElement).height
        PORTRAIT.uPortraitOn.value = 1
      })
    }
    if (this.tunnelFeatured) this.textsDone = false // the wormhole waits for the last one
    this.paperDirect = !!opts.paperDirect
    // TEST (/hero-sem-mesa.html): no desk — the scroll turns the cubes until they lock on "We do things
    // for people", and from there the page scrolls on, normally, the hero going up like any section
    this.scrollAfter = !!opts.scrollAfter
    if (opts.behind === 'paper' && this.drawn) {
      this.paper = new PaperDesk(this.renderer, this.drawn, () => ({ w: this.W, h: this.H }), opts.paperPose)
      // a ball in the bin: the dive ends in its dark — the wormhole to the next page opens there
      // the dive into the bin starts: the next page's files are warmed while it plays
      this.paper.onDive = () => {
        for (const href of [this.wormTo, ...this.wormPrefetch]) {
          if (!href) continue
          const l = document.createElement('link')
          l.rel = 'prefetch'
          l.href = href
          document.head.appendChild(l)
        }
      }
      // ...and at its bottom, all dark: straight to the next page, which comes out of the same dark
      // (no wormhole — Danilo, 2026-10-11)
      this.paper.onDone = () => {
        this.behindDone = true
        console.info('[hero] paper: in the bin — to the garage')
        if (this.wormTo) window.location.href = this.wormTo + (this.wormTo.includes('?') ? '&' : '?') + 'from=bin'
      }
    }
    if (opts.tunnelObjects) this.tunnelObjs = new TunnelObjects(opts.tunnelObjects, this.drawnU as unknown as Record<string, THREE.IUniform>, this.renderer, opts.tunnelSet, opts.tunnelReveal ? (this.reveal.uniforms as unknown as Record<string, THREE.IUniform>) : undefined)
    this.weAreDodge = !!opts.weAreDodge
    this.signLab = !!opts.signLab
    this.weAreHigh = !!opts.weAreHigh
    this.noReveal = !!opts.noReveal
    this.sign = opts.sign ?? 'classic'
    this.wormTo = opts.wormTo
    this.wormPrefetch = opts.wormPrefetch ?? []
    if (opts.revealLetters) {
      this.restOn.value = 1
      this.letterSwap = new LetterSwap(opts.letterSet)
      this.reveal.setSource(this.letterSwap.texture, this.W / this.H) // screen-sized: no crop
    }
    this.heroRT = new THREE.WebGLRenderTarget(bw, bh, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    })
    // hero.frag writes display-ready values straight to gl_FragColor (no colour
    // management in that shader). Keep the whole door path free of colour-space
    // conversion too — linear-tagged target + a RawShaderMaterial that just
    // samples it — so the closed doors are byte-identical to the old direct render.
    this.heroRT.texture.colorSpace = THREE.LinearSRGBColorSpace

    this.doorMat = new THREE.RawShaderMaterial({
      side: THREE.DoubleSide, // the leaves must stay visible through the whole swing
      uniforms: {
        map: { value: this.heroRT.texture },
        // 0 -> 1, set in frame(): GENERIC faces fall into shadow on uPhase (fast),
        // the tagline outer faces come up on uPhaseB (slower)
        uPhase: { value: 0 },
        uPhaseB: { value: 0 },
        uRestOn: this.restOn,
        uRestVP: this.restVP,
        uRestModel: { value: new THREE.Matrix4() },
        ...this.reveal.uniforms, // shared objects — updated once, seen by the letters too
        ...this.drawnU,
        uLabPaper: { value: null as THREE.Texture | null },
        uHasLabPaper: { value: 0 },
      },
      vertexShader: `
        precision highp float;
        uniform mat4 projectionMatrix;
        uniform mat4 modelViewMatrix;
        attribute vec3 position;
        attribute vec2 uv;
        attribute float aFaceKind; // 0 = GENERIC front, 1 = tagline outer, 2 = other
        attribute vec3 normal;
        uniform mat3 normalMatrix;
        varying vec3 vViewN;
        uniform mat4 uRestVP;
        uniform mat4 uRestModel;
        varying vec2 vUv;
        varying float vKind;
        varying vec4 vClip;
        varying vec4 vRestClip;
        void main() {
          vRestClip = uRestVP * uRestModel * vec4(position, 1.0);
          vUv = uv;
          vKind = aFaceKind;
          vViewN = normalize(normalMatrix * normal);
          vClip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = vClip;
        }`,
      fragmentShader: `
        precision highp float;
        uniform sampler2D map;
        uniform float uPhase;
        uniform float uPhaseB;
        varying vec2 vUv;
        varying float vKind;
        varying vec4 vClip;
        varying vec4 vRestClip;
        uniform float uRestOn;
        uniform sampler2D uLabPaper; // (/hero-hovers-cubos) the lab's paper, an image on screen
        uniform float uHasLabPaper;
        ${REVEAL_GLSL}
        ${DRAWN_GLSL}
        varying vec3 vViewN;
        void main() {
          vec3 tex = texture2D(map, vUv).rgb;
          if (uDOn > 0.5) {
            // drawn: the cubes are paper, outlined, hatched where they turn from the light — and
            // their fall into shadow (the same light play as below) is hatching, not black
            vec2 dsuv = (vClip.xy / vClip.w) * 0.5 + 0.5;
            float shade = vKind < 0.5 ? uPhase : vKind < 1.5 ? 1.0 - uPhaseB : uPhase * 0.76;
            // the cubes' shade: a smooth graphite smudge, no hatching — any hatch pattern over a face
            // this big redraws or slides as it turns, and the whole surface seems to change
            vec3 paperC = uHasLabPaper > 0.5 ? texture2D(uLabPaper, dsuv).rgb : drawnPaper(dsuv);
            vec3 col = mix(paperC, D_INK, smoothstep(0.1, 1.0, shade) * 0.55);
            col = mix(col, D_INK, drawnEdge(dsuv));
            if (vKind < 0.5) {
              vec2 suv = (vClip.xy / vClip.w) * 0.5 + 0.5;
              if (uRestOn > 0.5) suv = (vRestClip.xy / vRestClip.w) * 0.5 + 0.5;
              col = revealApply(col, suv);
            }
            gl_FragColor = vec4(col, 1.0);
            return;
          }
          if (vKind < 0.5) {
            // the GENERIC face is the top layer: fluid holes show the video through it
            vec2 suv = (vClip.xy / vClip.w) * 0.5 + 0.5;
            if (uRestOn > 0.5) suv = (vRestClip.xy / vRestClip.w) * 0.5 + 0.5;
            tex = revealApply(tex, suv);
          }
          float bright = 1.0;
          if (vKind < 0.5) {
            bright = mix(1.0, 0.03, uPhase);   // GENERIC front: full -> deep shadow (fast)
          } else if (vKind < 1.5) {
            bright = mix(0.02, 1.0, uPhaseB);  // tagline outer: invisible -> full (slow)
          } else {
            bright = mix(1.0, 0.24, uPhase);   // the rest: rides down with GENERIC
          }
          gl_FragColor = vec4(tex * bright, 1.0);
        }`,
    })

    this.heroMat = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: paperFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uResolution: { value: new THREE.Vector2(bw, bh) },
        uTex: { value: null },
        uHasTex: { value: 0 },
        uTexMix: { value: 0 }, // 0 = off-white paper, 1 = concrete; ramped by scroll in frame()
        uViewAspect: { value: bw / bh },
        uTexAspect: { value: 1 },
      },
    })
    // test: a concrete slab instead of the flat off-white ground
    new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/hero-concrete.png`, (tex) => {
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
      tex.minFilter = THREE.LinearMipmapLinearFilter
      tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
      this.heroMat.uniforms.uTex.value = tex
      this.heroMat.uniforms.uTexAspect.value = tex.image.width / tex.image.height
      this.heroMat.uniforms.uHasTex.value = 1
    })

    this.buildLetterMaterial()

    this.heroScene.add(new THREE.Mesh(this.quad, this.heroMat))

    this.doorCam = new THREE.PerspectiveCamera(DOOR_FOV, this.W / this.H, 0.1, 200)
    this.doorCam.position.set(0, 0, DOOR_CAM_Z)
    this.leftHinge.add(this.lettersL)
    this.rightHinge.add(this.lettersR)
    this.doorScene.add(this.leftHinge, this.rightHinge)
    const buildT0 = performance.now()
    this.buildSpaceBehind()
    this.buildDoors()
    this.buildGallery()

    // the crumb pile — a scaled sub-world planted at CRUMB_Z, in front of the
    // closed doors. Scale maps the crumb ortho view (2·CRUMB_VIEW_H tall) exactly
    // onto the door frustum at that z, so at rest it reads like a screen overlay;
    // once the camera dollies past CRUMB_Z the pile is behind it, out of frame.
    this.crumbs = new CrumbRain({
      parent: this.doorScene,
      crumbScale: opts.crumbScale,
      push: opts.crumbPush,
      material: this.drawnCrumbs ? (src) => this.drawnCrumbMaterial(src.map) : undefined,
    })
    const k = ((DOOR_CAM_Z - CRUMB_Z) * Math.tan(THREE.MathUtils.degToRad(DOOR_FOV / 2))) / CRUMB_VIEW_H
    this.crumbs.stage.position.z = CRUMB_Z
    this.crumbs.stage.scale.setScalar(k)
    this.crumbs.layout(this.W / this.H)

    this.clearTargets()
    // the wormhole, the chapter tunnel and the approach to it: only where the hero goes on into them.
    // Under the desk (/, behind: 'paper') it never does — the bin's dive leaves for the garage — and
    // the wormhole's galaxy bake alone took ~0.45 s of the first load (measured 2026-10-16)
    if ((!this.paper && !this.scrollAfter) || location.search.includes('forcetunnel')) {
      this.bakeWormhole()
      this.buildBeyondTunnel()
      this.buildApproach()
    }
    this.buildMs = performance.now() - buildT0
    void this.loadFonts().then(() => this.layoutLetters())

    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerUp)
    window.addEventListener('blur', this.onLeave)
    document.addEventListener('pointerleave', this.onLeave)
    new ResizeObserver(this.onResize).observe(canvas)
    window.addEventListener('wheel', this.onWheel, { passive: true })
    window.addEventListener('scroll', this.onScroll, { passive: true })
    window.addEventListener('keydown', this.onKey)

    this.renderer.setAnimationLoop(this.frame)
    // (debug ?heroinfo) what the GPU is holding, and how long the build took
    if (location.search.includes('heroinfo')) (window as unknown as { __heroInfo: () => unknown }).__heroInfo = () => ({ ...this.renderer.info.memory, programs: this.renderer.info.programs?.length, buildMs: this.buildMs, manual: this.manual, progress: this.progress, target: this.progressTarget, locked: this.locked, clear: this.crumbs.clear, released: this.released })
  }
  private buildMs = 0

  // ---- doors ------------------------------------------------------
  private buildDoors(): void {
    // the frustum cross-section at the closed doors (z = 0)
    const vh = 2 * DOOR_CAM_Z * Math.tan(THREE.MathUtils.degToRad(DOOR_FOV / 2))
    const vw = vh * (this.W / this.H)
    const pw = vw / 2
    const over = vw * 0.006

    // a REAL cube: one edge length for all three sides. It covers its half of the
    // frame (whichever of half-width / height is bigger) and overshoots the other
    // way off-screen. Front (+z) face at local z = 0 when closed.
    const S = Math.max(pw, vh) + 2 * over
    this.cubeSide = S

    for (const p of [this.leftPanel, this.rightPanel]) {
      if (!p) continue
      p.geometry.dispose() // materials are shared — never disposed here
      p.parent?.remove(p)
    }

    // every face samples the hero ground (heroRT) with clean cube-local 0..1 UVs so
    // nothing ever samples out of bounds (that clamp-stretch at the frame edge was the
    // bowed band). Front face x is mirrored per cube so the concrete stays continuous
    // across the closed seam. Also tag each vertex by face kind for the light play.
    const bakeUVs = (g: THREE.BufferGeometry, dir: -1 | 1): void => {
      const pos = g.attributes.position
      const nor = g.attributes.normal
      const uv = g.attributes.uv
      const kind = new Float32Array(pos.count)
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i)
        const py = pos.getY(i)
        const pz = pos.getZ(i)
        const nx = nor.getX(i)
        if (pz > -1e-4 && Math.abs(nor.getZ(i)) > 0.5) {
          const u = px / S + 0.5
          uv.setXY(i, dir === -1 ? u : 1.0 - u, py / S + 0.5) // front — mirror x on the right cube
          kind[i] = 0 // GENERIC front
        } else if (Math.abs(nx) > 0.5) {
          uv.setXY(i, pz / S + 1.0, py / S + 0.5) // ±x face
          kind[i] = Math.sign(nx) === dir ? 1 : 2 // outer x-face (toward the frame edge) = tagline
        } else if (Math.abs(nor.getY(i)) > 0.5) {
          uv.setXY(i, px / S + 0.5, pz / S + 1.0) // ±y face
          kind[i] = 2
        } else {
          uv.setXY(i, px / S + 0.5, py / S + 0.5) // back (-z) face
          kind[i] = 2
        }
      }
      uv.needsUpdate = true
      g.setAttribute('aFaceKind', new THREE.BufferAttribute(kind, 1))
    }
    // all six slots: the same door material (heroRT / concrete), like the GENERIC face
    const D = this.doorMat
    const mats: THREE.Material[] = [D, D, D, D, D, D]

    // dir -1 = left cube (its inner/right edge at the seam x=0), +1 = right cube
    const buildLeaf = (hinge: THREE.Group, dir: -1 | 1): THREE.Mesh => {
      hinge.position.set((dir * vw) / 2, 0, 0)
      hinge.rotation.set(0, 0, 0)
      const cx = -dir * (S / 2 - over) // cube centre so the seam edge lands on x = 0
      const g = new THREE.BoxGeometry(S, S, S)
      g.translate(0, 0, -S / 2) // front face -> local z = 0
      bakeUVs(g, dir)
      const mesh = new THREE.Mesh(g, mats)
      mesh.position.x = cx
      // the two cubes overlap by ~`over` at the seam; sit the right one a hair back
      // in z so that coplanar strip can't z-fight as the doors split
      mesh.position.z = dir === 1 ? -0.008 : 0
      hinge.add(mesh)
      this.pinRest(mesh)
      return mesh
    }

    this.leftPanel = buildLeaf(this.leftHinge, -1)
    this.rightPanel = buildLeaf(this.rightHinge, 1)

    this.leftPanel.layers.set(1)
    this.rightPanel.layers.set(2)
    for (const p of [this.leftPanel, this.rightPanel]) {
      p.castShadow = true
      p.receiveShadow = true
    }
  }

  /** the space beyond the doors — the tunnel's fog IS the backdrop now */
  private buildSpaceBehind(): void {
    const glow = new THREE.PointLight(0xffe6c4, 20, 30)
    glow.position.set(0, 1.5, -9)
    this.doorScene.add(glow)

    // the two door-cubes are lit ONLY by the lights below — nothing else
    // in the scene (not the glow, not the room fill) can spill onto them. That's what
    // the layers are for: the left panel + its tagline are on layer 1, the right on
    // layer 2, and each key light + the fill match. Each outer (tagline) face is
    // turned AWAY from its key through the whole swing and only crosses into the
    // light once it has rotated past ~123° — it comes out of its own shadow purely
    // by turning. Sources sit off to the far side, set back into the room, mirrored.
    const shadow = (l: THREE.DirectionalLight): void => {
      l.castShadow = true
      l.shadow.mapSize.set(2048, 2048)
      l.shadow.camera.near = 0.5
      l.shadow.camera.far = 40
      l.shadow.camera.left = -9
      l.shadow.camera.right = 9
      l.shadow.camera.top = 9
      l.shadow.camera.bottom = -9
      l.shadow.bias = -0.0004
      l.shadow.normalBias = 0.03
    }
    const keyL = new THREE.DirectionalLight(0xffe8cc, 1.3)
    keyL.position.set(8.4, 2.0, -5.45)
    keyL.layers.set(1)
    shadow(keyL)
    const keyR = new THREE.DirectionalLight(0xffe8cc, 1.3)
    keyR.position.set(-8.4, 2.0, -5.45)
    keyR.layers.set(2)
    shadow(keyR)
    // barely-there fill. sky === ground so it's fully normal-independent: while the
    // slab shadow covers the letters, face and raised letters take the exact same
    // flat value and the relief is invisible. It shows only once keyL rakes across.
    const fill = new THREE.HemisphereLight(0x3a3732, 0x3a3732, 0.09)
    fill.layers.set(1)
    fill.layers.enable(2)
    // dim ambient for the placeholder room itself — layer 0, never touches the cubes
    const room = new THREE.HemisphereLight(0x45423c, 0x26241f, 0.3)
    this.doorScene.add(keyL, keyR, fill, room)
    this.doorCam.layers.enable(1)
    this.doorCam.layers.enable(2)
  }

  /**
   * Section 2 — a photo tunnel, Floema's recipe. Planes ride a circle of radius
   * TUNNEL_RADIUS around the forward axis, spread by the golden angle, SPACING apart
   * in z. Just before the zoom-in they fade in one at a time, deep in the distance
   * (fog pushed back so they read). Then, once the camera is past the cubes, the
   * tunnel arms: fog closes to TUNNEL_FOG_FAR, a warp burst eases to an idle drift
   * (+ scroll boost), and a plane that passes the camera recycles to the far end.
   */
  /** a tunnel text as a texture: Tinos italic, off-white, on transparent, sized to the text */
  private tunnelTextTexture(text: string): THREE.CanvasTexture {
    const px = 96
    const font = `italic 400 ${px}px Tinos, "Times New Roman", serif`
    const cnv = document.createElement('canvas')
    const ctx = cnv.getContext('2d')!
    ctx.font = font
    const lines = text.split('\n')
    const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width))) + px
    cnv.width = w
    cnv.height = Math.ceil(lines.length * px * 1.2 + px * 0.6)
    ctx.font = font
    ctx.fillStyle = '#f2f0ea'
    ctx.textBaseline = 'top'
    lines.forEach((l, i) => ctx.fillText(l, px / 2, px * 0.3 + i * px * 1.2))
    const tex = new THREE.CanvasTexture(cnv)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.generateMipmaps = false
    tex.minFilter = THREE.LinearFilter
    return tex
  }

  private buildGallery(): void {
    let seed = 0x9e37
    const rng = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 0xffffffff
    }
    const golden = Math.PI * (3 - Math.sqrt(5))
    const geo = new THREE.PlaneGeometry(1, 1)
    // each photo appears in a shuffled order, not around-the-ring
    const order = Array.from({ length: TUNNEL_PLANES }, (_, i) => i)
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    const NDISTINCT = 12
    const texes: THREE.CanvasTexture[] = []
    for (let k = 0; k < NDISTINCT; k++) {
      const portrait = rng() > 0.5
      const cw = portrait ? 150 : 220
      const ch = portrait ? 220 : 150
      const cnv = document.createElement('canvas')
      cnv.width = cw
      cnv.height = ch
      const ctx = cnv.getContext('2d')!
      const g = 34 + Math.round(rng() * 78)
      ctx.fillStyle = `rgb(${g},${g},${g + 4})`
      ctx.fillRect(0, 0, cw, ch)
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'
      ctx.lineWidth = 4
      ctx.strokeRect(2, 2, cw - 4, ch - 4)
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.font = `bold ${Math.round(ch * 0.4)}px ui-monospace, monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(k + 1), cw / 2, ch / 2)
      const tex = new THREE.CanvasTexture(cnv)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.generateMipmaps = false
      tex.minFilter = THREE.LinearFilter
      texes.push(tex)
    }

    // shared dash texture for the hyperspace streak field below — a thin vertical
    // light bar, bright core fading to transparent at both ends and both sides
    const streakCnv = document.createElement('canvas')
    streakCnv.width = 48
    streakCnv.height = 512
    const sctx = streakCnv.getContext('2d')!
    const vgrad = sctx.createLinearGradient(0, 0, 0, 512)
    vgrad.addColorStop(0.0, 'rgba(200,215,255,0)')
    vgrad.addColorStop(0.4, 'rgba(215,228,255,0.85)')
    vgrad.addColorStop(0.5, 'rgba(255,255,255,1)')
    vgrad.addColorStop(0.6, 'rgba(215,228,255,0.85)')
    vgrad.addColorStop(1.0, 'rgba(200,215,255,0)')
    sctx.fillStyle = vgrad
    sctx.fillRect(0, 0, 48, 512)
    const hgrad = sctx.createLinearGradient(0, 0, 48, 0)
    hgrad.addColorStop(0.0, 'rgba(0,0,0,0)')
    hgrad.addColorStop(0.5, 'rgba(0,0,0,1)')
    hgrad.addColorStop(1.0, 'rgba(0,0,0,0)')
    sctx.globalCompositeOperation = 'destination-in'
    sctx.fillStyle = hgrad
    sctx.fillRect(0, 0, 48, 512)
    sctx.globalCompositeOperation = 'source-over'
    this.streakTex = new THREE.CanvasTexture(streakCnv)
    this.streakTex.colorSpace = THREE.SRGBColorSpace
    this.streakTex.generateMipmaps = false
    this.streakTex.minFilter = THREE.LinearFilter

    for (let i = 0; i < TUNNEL_PLANES; i++) {
      const tex = texes[i % NDISTINCT]
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }),
      )
      const a = i * golden
      m.userData.ang = a
      m.position.x = Math.cos(a) * TUNNEL_RADIUS
      m.position.y = Math.sin(a) * TUNNEL_RADIUS
      m.position.z = CAM_DIVE_END - 26 - i * TUNNEL_SPACING // scattered deep, but shallow enough to read
      m.userData.z0 = m.position.z
      m.userData.revealAt = order[i] * TUNNEL_STAGGER // seconds after the reveal clock starts
      const aspect = tex.image.width / tex.image.height
      const base = TUNNEL_IMG_SIZE + rng() * TUNNEL_SCALE_RAND
      if (aspect >= 1) m.scale.set(base * aspect, base, 1)
      else m.scale.set(base, base / aspect, 1)
      m.userData.s0 = m.scale.clone() // resting scale — the charge stretches them into streaks
      this.galleryPhotos.push(m)
      this.gallery.add(m)
    }

    // the texts: one after another down the tunnel's axis, alternating a little left and right
    TUNNEL_TEXTS.forEach((text, i) => {
      const tex = this.tunnelTextTexture(text)
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }))
      const aspect = tex.image.width / tex.image.height
      m.scale.set(TEXT_H * aspect, TEXT_H, 1)
      m.userData.side = i % 2 ? 1 : -1
      m.visible = false
      this.galleryTexts.push(m)
      this.gallery.add(m)
    })

    // the hyperspace streak field — hundreds of tiny dashes scattered around the
    // axis (their own radii, not the photo ring), each a thin sliver of streakTex.
    // Length is driven by radius (far off-axis = long streak, near-centre = a dot)
    // and by speed, so it reads as real radial motion, not a uniform blur.
    this.streakAngle = new Float32Array(WORM_STREAK_COUNT)
    this.streakRadius = new Float32Array(WORM_STREAK_COUNT)
    this.streakZ = new Float32Array(WORM_STREAK_COUNT)
    this.streakLen = new Float32Array(WORM_STREAK_COUNT)
    for (let i = 0; i < WORM_STREAK_COUNT; i++) {
      this.streakAngle[i] = rng() * Math.PI * 2
      this.streakRadius[i] = WORM_STREAK_RAD_MIN + (WORM_STREAK_RAD_MAX - WORM_STREAK_RAD_MIN) * rng()
      this.streakZ[i] = CAM_DIVE_END - rng() * WORM_STREAK_RANGE
    }
    this.streakMat = new THREE.MeshBasicMaterial({
      map: this.streakTex,
      transparent: true,
      depthWrite: false,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    })
    this.streakField = new THREE.InstancedMesh(geo, this.streakMat, WORM_STREAK_COUNT)
    this.streakField.frustumCulled = false
    this.gallery.add(this.streakField)

    this.gallery.visible = false
    this.doorScene.add(this.gallery)
    // TEST: each photo's slot carries one of Danilo's things instead (the plane itself unseen —
    // its opacity still drives the object's appearing)
    // (an objects tunnel never shows the photo planes — not even while its models load)
    if (this.tunnelObjs || this.paper) for (const m of this.galleryPhotos) (m.material as THREE.MeshBasicMaterial).visible = false
    void this.tunnelObjs?.whenReady().then(() => {
      const objs = this.tunnelObjs!
      if (this.tunnelFeatured) {
        // no photos in this tunnel — only the objects (and the texts, down the middle)
        for (const m of this.galleryPhotos) (m.material as THREE.MeshBasicMaterial).visible = false
        for (const name of FEATURED) {
          const o = objs.makeNamed(name)
          if (!o) continue
          const size = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3())
          o.userData.k = FEAT_SIZE / Math.max(size.x, size.y, size.z) // each shown at one size
          o.userData.flatF = size.y < 0.45 * Math.max(size.x, size.z)
          o.visible = false
          o.traverse((c) => {
            const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
            if (m) m.transparent = true
          })
          this.gallery.add(o)
          this.featured.push(o)
        }
        return
      }
      if (objs.look === 'real') {
        this.buildTunnelInstances(objs)
        return
      }
      if (this.secretSpec.length) this.buildSecrets(objs)
      this.galleryPhotos.forEach((m, i) => {
        ;(m.material as THREE.MeshBasicMaterial).visible = false
        if (i % this.drawnEvery) return
        const s0 = m.userData.s0 as THREE.Vector3
        const base = Math.max(s0.x, s0.y)
        s0.set(base, base, 1)
        m.scale.copy(s0)
        const o = objs.make(i / this.drawnEvery)
        o.userData.kind = (i / this.drawnEvery) % objs.count // (i itself: with drawnEvery 2 and an even count, every other kind never came — the shoe among them)
        // drawn only when on screen and not lost in the fog (it was drawn always: the frame's main cost)
        o.traverse((c) => void ((c as THREE.Mesh).isMesh && ((c as THREE.Mesh).frustumCulled = true)))
        // each tumbles on its own axis, at its own pace — a real turn, so the light runs over it
        // and its sides come round (a slow spin about the vertical only read as a flat cut-out)
        const r = (k: number) => ((i * k) % 1) - 0.5
        o.userData.axis = new THREE.Vector3(r(0.618) * 1.6, 1, r(0.377) * 1.6).normalize()
        o.userData.spin = (i % 2 ? 1 : -1) * (0.9 + ((i * 0.618) % 1) * 0.8) // rad/s
        o.userData.ry = (i * 2.399) % (Math.PI * 2)
        o.visible = false
        // NOT a child of the slot: the slot is scaled unevenly (and stretched by the charge), and
        // a tumbling child inside it gets squashed and stretched as it turns. It only follows
        // the slot's position, and fades with the slot's opacity at its own fixed size
        o.userData.slot = m
        if (this.tunnelRandom) {
          // anywhere across the tunnel's cross-section (seeded per slot), not on the ring
          // (a stratified spread: the slot's index walks a golden-ratio sequence over the section, so
          // they cover it evenly instead of bunching — plus a little jitter)
          const u = (i * 0.6180339887) % 1
          const v = (i * 0.7548776662) % 1
          const j = (k: number) => ((Math.sin((i + 1) * k) * 43758.5453) % 1) * 0.12
          o.userData.rx = ((u + j(12.9898)) % 1 * 2 - 1) * 8.5
          o.userData.ryy = ((v + j(78.233)) % 1 * 2 - 1) * 4.8
        }
        o.scale.setScalar(this.drawnScale)
        o.traverse((c) => {
          const mat = (c as THREE.Mesh).material as THREE.Material | undefined
          if (mat) mat.transparent = true
        })
        this.gallery.add(o)
        this.tunnelItems.push(o)
      })
      if (this.tunnelReveal) void this.buildRealTwins(objs)
    })
    this.doorScene.fog = new THREE.Fog(0x000000, 0.1, TUNNEL_FOG_INTRO)

    // the wormhole — a spiral-galaxy disc (procedurally baked in bakeWormhole()).
    // It's a tilted disc far down the corridor; sustained fast scroll grows it and
    // brings it closer (stepGallery), the disc spins about its own axis the whole
    // time, and once it fills the view the fall through the core goes automatic
    // (stepWormhole). Black space keyed out so a small/far disc doesn't occlude the
    // tunnel behind it.
    this.wormTubeMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uMap: { value: this.wormRT ? this.wormRT.texture : null },
        uGrow: { value: 0 }, // 0..1 charge / approach
        uBloom: { value: 0 }, // 0..1 final white-out as you fall through the core
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        precision highp float;
        uniform sampler2D uMap;
        uniform float uGrow;
        uniform float uBloom;
        varying vec2 vUv;
        void main() {
          // zoom into the core as it energises / as you fall in
          vec2 uv = 0.5 + (vUv - 0.5) / (1.0 + uGrow * 0.25 + uBloom * 3.2);
          vec3 col = texture2D(uMap, uv).rgb * (1.0 + uGrow * 0.25);
          float luma = dot(col, vec3(0.299, 0.587, 0.114));
          float alpha = smoothstep(0.008, 0.10, luma); // key out the black surround

          col = mix(col, vec3(1.0), uBloom);
          alpha = max(alpha, uBloom);
          gl_FragColor = vec4(col, alpha);
        }`,
    })
    this.wormTube = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.wormTubeMat)
    this.wormTube.visible = false
    this.wormTube.frustumCulled = false
    this.doorScene.add(this.wormTube)

    this.wormFlash = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false }),
    )
    this.wormFlash.visible = false
    this.wormFlash.frustumCulled = false
    this.wormFlash.renderOrder = 999
    this.doorScene.add(this.wormFlash)
  }

  /**
   * Bake the wormhole's spiral-galaxy texture once. A procedural face-on galaxy —
   * two logarithmic-spiral arms, a dense star field biased to the arms and centre,
   * dark dust lanes, rose-pink HII knots, a hot bulge — rendered to wormRT. The
   * disc mesh just leans it back and spins it (like the reference model).
   */
  private bakeWormhole(): void {
    this.wormRT = new THREE.WebGLRenderTarget(WORM_RT_SIZE, WORM_RT_SIZE, {
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: true,
    })
    this.wormRT.texture.colorSpace = THREE.SRGBColorSpace

    const genMat = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: galaxyFrag,
      depthTest: false,
      depthWrite: false,
    })
    const scene = new THREE.Scene()
    const mesh = new THREE.Mesh(this.quad, genMat)
    scene.add(mesh)

    const prev = this.renderer.getClearColor(new THREE.Color()).getHex()
    this.renderer.setClearColor(0x000000, 1)
    this.renderer.setRenderTarget(this.wormRT)
    this.renderer.clear()
    this.renderer.render(scene, this.camera)
    this.renderer.setRenderTarget(null)
    this.renderer.setClearColor(prev, 1)

    scene.remove(mesh)
    genMat.dispose()
    if (this.wormTubeMat) this.wormTubeMat.uniforms.uMap.value = this.wormRT.texture
  }

  /**
   * The chapter tunnel beyond the wormhole (placeholder destination — TBD). A
   * real winding path — TubeGeometry along a closed, wavy CatmullRom loop — that
   * the camera actually travels (a straight tube centred on the camera looks
   * straight down a black hole with no wall on the view axis, and can't read as
   * sinuous either). The shader alone sells the chapter changes: four "looks"
   * crossfading on the very same surface (see beyond.frag) — one continuous
   * surface is what makes the transitions seamless.
   */
  private buildBeyondTunnel(): void {
    const pts: THREE.Vector3[] = []
    const N = 24
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2
      const r = BEYOND_BASE_R + 18 * Math.sin(a * 3.1 + 0.7) + 11 * Math.sin(a * 5.3 + 2.1)
      const y = 14 * Math.sin(a * 2.2 + 1.3) + 9 * Math.sin(a * 4.7 + 0.4)
      pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r))
    }
    this.beyondCurve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5)
    this.beyondCurveLen = this.beyondCurve.getLength()

    const geo = new THREE.TubeGeometry(this.beyondCurve, BEYOND_SEGMENTS, BEYOND_TUBE_R, 24, true)
    this.beyondMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        uTime: { value: 0 },
        uLookA: { value: 0 },
        uLookB: { value: 1 },
        uBlend: { value: 0 },
        uResolution: { value: new THREE.Vector2(...this.bufSize()) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: beyondFrag,
    })
    this.beyondTube = new THREE.Mesh(geo, this.beyondMat)
    this.beyondTube.visible = false
    this.beyondTube.frustumCulled = false
    this.doorScene.add(this.beyondTube)
  }

  /** the chapter tunnel: fully automatic, no scroll — the camera actually travels
   *  the winding tube (real curve, not an illusion), while the four looks
   *  crossfade in sequence on that one shared surface (see beyond.frag) */
  private stepTunnel(dt: number): void {
    const tube = this.beyondTube
    const mat = this.beyondMat
    const curve = this.beyondCurve
    if (!tube || !mat || !curve) return
    tube.visible = true

    this.tunnelSeqTime += dt
    const onePass = TUNNEL_CH_DURATION * TUNNEL_CH_COUNT
    const done = this.tunnelSeqTime >= onePass // one trip through all four, then it actually ends
    const t = Math.min(this.tunnelSeqTime, onePass - 0.001)
    const idx = Math.min(TUNNEL_CH_COUNT - 1, Math.floor(t / TUNNEL_CH_DURATION))
    const nextIdx = done ? idx : (idx + 1) % TUNNEL_CH_COUNT
    const localT = t - idx * TUNNEL_CH_DURATION
    const blendStart = TUNNEL_CH_DURATION - TUNNEL_CH_BLEND
    const blend = !done && localT > blendStart ? THREE.MathUtils.smoothstep(localT, blendStart, TUNNEL_CH_DURATION) : 0

    mat.uniforms.uLookA.value = idx
    mat.uniforms.uLookB.value = nextIdx
    mat.uniforms.uBlend.value = blend
    mat.uniforms.uTime.value += dt

    // travel the real curve — the winding is genuine geometry, not a texture
    // trick, so the camera always has a wall ahead of it (never a straight,
    // wall-less sightline down the axis) and actually turns with the path.
    // tunnelT freezes once done (no more advancing), but position/lookAt are
    // re-applied every frame regardless — frame() sets doorCam.position from the
    // old hero camera formula before calling this, every frame, so we always have
    // to override it or the camera snaps back outside the tube the moment we stop
    // updating it here.
    if (!done) this.tunnelT = (this.tunnelT + (BEYOND_SPEED * dt) / this.beyondCurveLen) % 1
    const pos = curve.getPointAt(this.tunnelT)
    const ahead = curve.getPointAt((this.tunnelT + 0.006) % 1)
    this.doorCam.position.copy(pos)
    this.doorCam.up.set(0, 1, 0)
    this.doorCam.lookAt(ahead)
    if (!done) return

    // one pass done — a quick white flash (not black: the approach opens on a
    // white void), then hand off to the approach.
    const flash = this.wormFlash
    if (flash) {
      flash.visible = true
      ;(flash.material as THREE.MeshBasicMaterial).color.set(0xffffff)
      flash.quaternion.copy(this.doorCam.quaternion)
      flash.position.set(this.doorCam.position.x, this.doorCam.position.y, this.doorCam.position.z - 0.5)
      const endT = this.tunnelSeqTime - onePass
      ;(flash.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.clamp(endT / 0.8, 0, 1)
      if (!this.tunnelEnded && endT >= 0.8) {
        this.tunnelEnded = true
        flash.visible = false
        tube.visible = false
        this.inApproach = true
        this.approachTime = 0
        console.info('[hero] chapter tunnel: ended — falling toward the ball')
      }
    }
  }

  /** the approach: a real winding shader-tube gave way to a plain white void.
   *  The camera falls while an enclosing background shader gains colour — the
   *  "tube" feeling, purely a 2D pattern reacting to progress (steven.com's
   *  actual trick, reverse-engineered: no geometry changes shape, a background
   *  layer just gets more saturated as you approach) — and close in, a ring
   *  literally forms around the ball as the background goes dark. */
  private buildApproach(): void {
    this.approachBgMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uProgress: { value: 0 }, uTime: { value: 0 } },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform float uProgress;
        uniform float uTime;
        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 345.45));
          p += dot(p, p + 34.345);
          return fract(p.x * p.y);
        }
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
                     mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        void main() {
          // white void -> near-black, only in the final stretch
          vec3 base = mix(vec3(0.97, 0.965, 0.95), vec3(0.03, 0.03, 0.04), smoothstep(0.72, 1.0, uProgress));
          // thin undulating bands, wiggling with noise — the "tube" feeling
          float band = vUv.y * 40.0;
          float wiggle = (vnoise(vec2(vUv.x * 6.0, uTime * 0.15)) - 0.5) * 2.0;
          float line = smoothstep(0.05, 0.0, abs(fract(band + wiggle * 0.6) - 0.5) - 0.46);
          float strength = smoothstep(0.05, 0.55, uProgress); // only shows up once falling begins
          vec3 lineColor = mix(vec3(0.40, 0.60, 0.95), vec3(1.0, 0.55, 0.25), smoothstep(0.30, 0.9, uProgress));
          vec3 col = base + lineColor * line * strength * 0.8;
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
    this.approachBg = new THREE.Mesh(new THREE.SphereGeometry(APPROACH_BG_R, 32, 32), this.approachBgMat)
    this.approachBg.visible = false
    this.approachBg.frustumCulled = false
    this.doorScene.add(this.approachBg)

    this.approachBall = new THREE.Mesh(
      new THREE.SphereGeometry(APPROACH_BALL_R, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0x0c0c0d }),
    )
    this.approachBall.visible = false
    this.doorScene.add(this.approachBall)

    const ringMat = (): THREE.MeshBasicMaterial =>
      new THREE.MeshBasicMaterial({ color: 0xf2f0ea, transparent: true, opacity: 0 })
    const outer = new THREE.Mesh(new THREE.TorusGeometry(APPROACH_RING_R, 0.045, 16, 96), ringMat())
    outer.rotation.x = 0.32
    const inner = new THREE.Mesh(new THREE.TorusGeometry(APPROACH_RING_R * 0.58, 0.032, 16, 80), ringMat())
    inner.rotation.x = -0.22
    inner.rotation.y = 0.2
    this.approachRings = [outer, inner]
    for (const r of this.approachRings) {
      r.visible = false
      this.doorScene.add(r)
    }
  }

  /** falling toward the ball, fully automatic — see buildApproach() for the idea */
  private stepApproach(dt: number): void {
    const bg = this.approachBg
    const ball = this.approachBall
    if (!bg || !ball) return
    bg.visible = true
    ball.visible = true

    this.approachTime += dt
    const p = THREE.MathUtils.clamp(this.approachTime / APPROACH_TIME, 0, 1)
    const ease = 1 - Math.pow(1 - p, 3) // falls fast, settles gently right at the ball
    const camZ = THREE.MathUtils.lerp(APPROACH_START_Z, APPROACH_END_Z, ease)
    this.doorCam.position.set(0, 0, camZ)
    this.doorCam.up.set(0, 1, 0)
    this.doorCam.lookAt(0, 0, 0)
    this.setDoorFov(DOOR_FOV)

    this.approachBgMat!.uniforms.uProgress.value = p
    this.approachBgMat!.uniforms.uTime.value += dt

    const ringP = THREE.MathUtils.clamp((p - APPROACH_RING_START) / (1 - APPROACH_RING_START), 0, 1)
    const ringE = ringP * ringP * (3 - 2 * ringP)
    for (const r of this.approachRings) {
      r.visible = ringE > 0.003
      ;(r.material as THREE.MeshBasicMaterial).opacity = ringE
      r.scale.setScalar(THREE.MathUtils.lerp(0.7, 1, ringE))
      r.rotation.z += dt * 0.08
    }
  }

  // ---- the sign -----------------------------------------------------
  /**
   * The outer-face / tagline material. Ignores the scene light list entirely (so the
   * other cube's key can't cross-light it). One key direction, `uKeyDir`. A gate from
   * the flat face's world normal `uFaceN` (fed per frame): 0 while the face is turned
   * away from its key, ramping over ~123°→140°. The shading itself uses the real
   * geometry normal, so the flat face reads as flat diffuse and the raised letters
   * pick up relief — but both stay pure black until the gate opens.
   */
  private makeSideMat(keyPos: THREE.Vector3, albedo: number, keyInt: number): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        uKeyDir: { value: keyPos.clone().normalize() },
        uFaceN: { value: new THREE.Vector3(0, 0, 1) },
        uReveal: { value: 0 }, // scroll-paced brightening, driven from frame()
        uAlbedo: { value: new THREE.Color(albedo) },
        uKeyColor: { value: new THREE.Color(0xffe8cc) },
        uKeyInt: { value: keyInt }, // final reveal brightness (light amount, not colour)
      },
      vertexShader: `
        varying vec3 vRealN;
        void main() {
          vRealN = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        precision highp float;
        uniform vec3 uKeyDir;
        uniform vec3 uFaceN;
        uniform float uReveal;
        uniform vec3 uAlbedo;
        uniform vec3 uKeyColor;
        uniform float uKeyInt;
        varying vec3 vRealN;
        void main() {
          // how far the flat face is still turned AWAY from its key. dot goes
          // ~-0.5 (spin 100°) -> 0 (123°) -> +0.05 (126°). Gate opens over ~105-120°
          // so it doesn't depend on the face turning far past the crossover.
          float d = dot(normalize(uFaceN), uKeyDir);
          float gate = smoothstep(-0.32, -0.04, d);
          // relief detail from the real normal (subtle) — gives the raised letters form
          float relief = mix(0.72, 1.0, clamp(dot(normalize(vRealN), uKeyDir) * 2.0 + 0.55, 0.0, 1.0));
          // a dark-concrete floor (not #000) once the surface is in play
          float amb = 0.015 * gate;
          vec3 col = uAlbedo * (amb + uKeyColor * uReveal * gate * relief * uKeyInt);
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
  }

  /**
   * Dark polished metal: a vertical studio gradient off the view normal, a hard
   * fresnel sliver on the edges, and a sharp bevel highlight. Where the cursor's
   * heat field is hot it lerps to liquid chrome; that lerp is killed as the
   * doors open (uOpen -> 1).
   */
  private buildLetterMaterial(): void {
    this.letterMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide, // cut caps have arbitrary winding; also hides any thin seam crack
      uniforms: {
        uDye: { value: this.fluid.dyeTexture },
        uVelocity: { value: this.fluid.velocityTexture },
        uOpen: { value: 0 },
        uLight: { value: new THREE.Vector3(0.35, 0.55, 0.75).normalize() },
        uPhase: { value: 0 }, // "We are GENERIC" falls into shadow with its face
        uMatIndex: { value: 0 }, // 0 = resting metal; >0 = a FOOD_MATERIALS look
        uTime: { value: 0 },
        uNoReveal: { value: 0 },
        uFinish: { value: this.sign === 'matte' ? 1 : 0 }, // gloss / matte
        uRestOn: this.restOn,
        uRestVP: this.restVP,
        uRestModel: { value: new THREE.Matrix4() },
        ...this.reveal.uniforms,
        ...this.drawnU,
      },
      vertexShader: `
        uniform mat4 uRestVP;
        uniform mat4 uRestModel;
        varying vec3 vViewN;
        varying vec4 vClip;
        varying vec4 vRestClip;
        void main() {
          vRestClip = uRestVP * uRestModel * vec4(position, 1.0);
          vViewN = normalize(normalMatrix * normal);
          vClip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = vClip;
        }`,
      fragmentShader: `
        precision highp float;
        uniform sampler2D uDye;
        uniform sampler2D uVelocity;
        uniform float uOpen;
        uniform vec3 uLight;
        uniform float uPhase;
        uniform float uMatIndex;
        uniform float uTime;
        uniform float uNoReveal;
        uniform float uFinish;
        uniform float uRestOn;
        varying vec3 vViewN;
        varying vec4 vClip;
        varying vec4 vRestClip;
        ${REVEAL_GLSL}
        ${DRAWN_GLSL}

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 345.45));
          p += dot(p, p + 34.345);
          return fract(p.x * p.y);
        }
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
                     mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
        }

        void main() {
          vec3 n = normalize(vViewN);
          vec2 suv = (vClip.xy / vClip.w) * 0.5 + 0.5;

          // dye = how much of the cursor's fluid trail has flowed here (real
          // Navier-Stokes advection — see FluidSim.ts), velocity = the fluid's own
          // current motion there — both feed the roulette's local swirl detail below.
          float heat = 0.0;
          vec2 vel = vec2(0.0);
          if (suv.x > 0.0 && suv.x < 1.0 && suv.y > 0.0 && suv.y < 1.0) {
            heat = clamp(texture2D(uDye, suv).r, 0.0, 1.0);
            vel = texture2D(uVelocity, suv).xy;
          }

          float up = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
          float fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 2.5);
          float spec = pow(max(dot(reflect(-uLight, n), vec3(0.0, 0.0, 1.0)), 0.0), 55.0);

          // rest: near-black painted metal, volume readable from the gradient + edges
          vec3 rest = mix(vec3(0.014), vec3(0.11), smoothstep(0.12, 0.96, up));
          rest += spec * 0.55 + fres * 0.05;
          if (uFinish > 0.5) {
            // matte: no highlight at all, the volume only from how the faces turn
            rest = mix(vec3(0.016), vec3(0.075), smoothstep(0.1, 0.95, up)) + fres * 0.015;
          }

          vec3 col;

          if (uMatIndex < 0.5) {
            // resting: plain painted metal, no cursor-follow glow — the wordmark only
            // reacts when the material roulette below cuts it over, all at once.
            col = rest;
          } else {
            // FOOD_MATERIALS[0] — guaraná soda. GLOBAL cut: the instant this is active
            // the WHOLE sign is soda, no patch, no mask — a real hard cut of the whole
            // object's material. The fluid's own velocity/dye only add LOCAL detail on
            // top — a denser, faster burst of bubbles that follows the real swirl —
            // the same way the base material would already read without it.
            float spd = length(vel);
            vec2 dir = spd > 1e-4 ? vel / spd : vec2(0.0);

            // deliberately NOT the metal's formula (near-black gradient + weak fresnel)
            // — a wet/glossy surface reads as a different material only if its value
            // range, fresnel response and highlight shape are all categorically
            // different, not just a different hue on the same recipe.
            vec3 liquid = mix(vec3(0.34, 0.09, 0.02), vec3(0.86, 0.4, 0.11), smoothstep(0.05, 0.95, up));
            liquid = mix(liquid, vec3(1.0, 0.93, 0.8), pow(fres, 1.1) * 0.85); // wet rim, near-white at grazing angle
            float spec2 = pow(max(dot(reflect(-uLight, n), normalize(vec3(dir * 0.7, 1.0))), 0.0), 90.0);
            liquid += spec2 * 1.3;

            // ambient bubbles drift on their own everywhere; the drag adds a hotter,
            // denser burst that follows the cursor's own direction and speed
            vec2 ambientUv = suv * 42.0 + vec2(0.0, uTime * 0.12);
            float ambientBub = smoothstep(0.88, 0.97, vnoise(ambientUv)) * 0.35;
            vec2 dragUv = suv * 42.0 - dir * uTime * 2.2;
            float dragBub = smoothstep(0.8, 0.93, vnoise(dragUv)) * heat * (0.4 + spd * 2.5);
            liquid += (ambientBub + dragBub) * vec3(0.85, 0.55, 0.28);

            col = mix(rest, liquid, 1.0 - uOpen); // still fades back to metal as the doors open
          }

          // drawn (TEST): paper with graphite outline + hatching instead of matte black
          if (uDOn > 0.5) col = drawnColor(suv, n);

          // the letters are part of the top layer too — the holes cut straight through them
          // (except "We are" when it dodges the cursor instead: uNoReveal)
          vec2 rsuv = uRestOn > 0.5 ? (vRestClip.xy / vRestClip.w) * 0.5 + 0.5 : suv;
          if (uNoReveal < 0.5)
          col = revealApply(col, rsuv);

          if (uDOn > 0.5) col = mix(col, D_INK, drawnTone(suv, uPhase)); // drawn: shadow as hatching
          else col *= mix(1.0, 0.05, uPhase); // darken into shadow
          gl_FragColor = vec4(col, 1.0);
        }`,
    })

  }

  /** TEST (/hero-tunnel-featured): the line-up down the axis, brought forward only by scroll (the
   *  texts' travel); each grows in out of the dark, turns slowly in front of the camera, and goes
   *  past it. Once the last is behind us the wormhole may charge (textsDone) */
  private stepFeatured(dt: number, camZ: number, armed: boolean): void {
    const list = this.featured
    if (!list.length) return
    const reveal = THREE.MathUtils.smoothstep(this.revealClock, 0.3, 1.0)
    list.forEach((o, i) => {
      const ahead = FEAT_FIRST + i * FEAT_GAP - this.textTravel
      const fadeIn = 1 - THREE.MathUtils.smoothstep(ahead, FEAT_GAP * 1.4, FEAT_GAP * 2.0)
      const fadeOut = THREE.MathUtils.smoothstep(ahead, 1.5, 3.5)
      const a = armed && !this.textsDone ? reveal * fadeIn * fadeOut : 0
      o.visible = a > 0.003
      if (!o.visible) return
      // off to the sides, alternating, clear of the middle (the texts' place)
      const side = i % 2 ? 1 : -1
      o.position.set(side * FEAT_X, (i % 3 === 1 ? 0.9 : -0.7), camZ - ahead)
      const k = o.userData.k as number
      o.scale.setScalar(k * (0.85 + 0.15 * a))
      o.userData.t = ((o.userData.t as number) ?? 0) + dt
      const t = o.userData.t as number
      // a slow turn about its own vertical, a gentle sway — flat things tipped up to be seen
      o.rotation.set((o.userData.flatF ? 0.95 : 0.12) + Math.sin(t * 0.6) * 0.08, t * 0.45 + i, Math.sin(t * 0.4) * 0.05, 'XYZ')
      o.traverse((c) => {
        const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
        if (m) m.opacity = a
      })
    })
    if (!this.textsDone && FEAT_FIRST + (list.length - 1) * FEAT_GAP - this.textTravel < 1.5) {
      this.textsDone = true
      console.info('[hero] featured objects: done — the wormhole can charge')
    }
  }

  /** the real look, built to run at frame rate: every copy of an object is drawn at once
   *  (one InstancedMesh per part of each object), opaque (no transparency sorting), shown and
   *  hidden by its size, sunk into the dark by the scene's fog — one-by-one meshes, each see-through
   *  for its fade, had halved the frame rate */
  private buildTunnelInstances(objs: TunnelObjects): void {
    const n = this.galleryPhotos.length
    const kinds = objs.count
    this.tunnelSpin = Array.from({ length: n }, (_, i) => {
      const r = (k: number) => ((i * k) % 1) - 0.5
      return {
        axis: new THREE.Vector3(r(0.618) * 1.6, 1, r(0.377) * 1.6).normalize(),
        speed: (i % 2 ? 1 : -1) * (0.9 + ((i * 0.618) % 1) * 0.8),
        a: (i * 2.399) % (Math.PI * 2),
      }
    })
    // only every TUNNEL_OBJ_EVERY-th slot carries an object: fewer of them on screen at once
    const used = Array.from({ length: n }, (_, i) => i).filter((i) => i % TUNNEL_OBJ_EVERY === 0)
    for (let k = 0; k < kinds; k++) {
      const slots: number[] = []
      for (let j = k; j < used.length; j += kinds) slots.push(used[j])
      for (const part of objs.parts(k)) {
        // (debug: ?flat swaps in an unlit material, to tell geometry cost from shading cost)
        const mat = (new URLSearchParams(location.search).has('flat') ? new THREE.MeshBasicMaterial({ map: (part.material as THREE.MeshStandardMaterial).map }) : part.material) as THREE.MeshStandardMaterial
        if (!mat.transparent) {
          mat.opacity = 1
          mat.depthWrite = true
        }
        mat.fog = true
        const mesh = new THREE.InstancedMesh(part.geometry, mat, slots.length)
        mesh.frustumCulled = false
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        this.objScene.add(mesh)
        this.tunnelInst.push({ mesh, part: part.matrix, slots })
      }
    }
    for (const m of this.galleryPhotos) (m.material as THREE.MeshBasicMaterial).visible = false
    // they're loaded long before the doors open (from the page's first second): get them onto the
    // GPU now too — shaders compiled, textures uploaded — so the tunnel's first frame doesn't stall
    this.renderer.compile(this.objScene, this.doorCam)
    this.objScene.traverse((o) => {
      const mats = (o as THREE.Mesh).material
      for (const mat of Array.isArray(mats) ? mats : mats ? [mats] : []) {
        for (const v of Object.values(mat)) if ((v as THREE.Texture)?.isTexture) this.renderer.initTexture(v as THREE.Texture)
      }
    })
    console.info('[hero] tunnel objects ready on the GPU', Math.round(performance.now()), 'ms')
    this.tunnelReady = true
  }

  private stepTunnelInstances(dt: number): void {
    const pose = this.tunnelPose
    const show = this.tunnelShow
    // only what can be seen is drawn: revealed, in front of the camera, and nearer than the fog's
    // far edge (beyond it the fog has already made it black) — half the ring was out there
    const fog = this.doorScene.fog as THREE.Fog | null
    const far = fog ? fog.far : Infinity
    const camZ = this.doorCam.position.z
    for (let i = 0; i < this.galleryPhotos.length; i++) {
      const sp = this.tunnelSpin[i]
      sp.a += dt * sp.speed
      const m = this.galleryPhotos[i]
      // every object is there the moment the tunnel shows — none pops in late, one by one, the way
      // the photos were staggered in. The slot's opacity is undone of that stagger and keeps only
      // the rest: the wormhole charge and the fall, which still shrink them away
      const op = (m.material as THREE.MeshBasicMaterial).opacity
      const at = m.userData.revealAt as number
      const staggered = THREE.MathUtils.smoothstep(this.revealClock, at, at + 0.4)
      const rest = this.revealClock < 0 ? 0 : staggered > 0.001 ? Math.min(1, op / staggered) : this.inWormhole ? op : 1
      const e = rest <= 0.002 ? 0 : 1 - (1 - rest) ** 3
      const ahead = camZ - m.position.z
      show[i] = e > 0 && ahead > -1 && ahead < far + 2
      if (!show[i]) continue
      this._tq.setFromAxisAngle(sp.axis, sp.a)
      this._ts.setScalar(e * WORLD_SCALE)
      pose[i].compose(m.position, this._tq, this._ts)
    }
    for (const inst of this.tunnelInst) {
      let n = 0
      for (const slot of inst.slots) {
        if (!show[slot]) continue
        inst.mesh.setMatrixAt(n++, this._tm.multiplyMatrices(pose[slot], inst.part))
      }
      inst.mesh.count = n
      inst.mesh.instanceMatrix.needsUpdate = true
    }
  }

  /** TEST (/hero-tunnel-*): each slot's object follows its plane's opacity — it grows in where the
   *  photo faded in, shrinks away where it faded — and turns slowly on its own axis, counter to
   *  the slot's roll so it stays upright */
  /** the secret objects, each at its spot: x / y in screen units (-1..1), size its longest side as
   *  a share of the screen's height, seen by a camera of their own that never moves */
  /** each drawn tunnel object's real twin (its model's own materials, the studio light), for the
   *  cursor's holes */
  private async buildRealTwins(objs: TunnelObjects): Promise<void> {
    const env = (await this.hoverEnvP) ?? null
    // its reach (a sphere round its centre, in world units at its tunnel size): only the ones whose
    // reach comes near the cursor's recent path can be inside a hole
    this.realReach = this.tunnelItems.map((o) => new THREE.Box3().setFromObject(o, true).getBoundingSphere(new THREE.Sphere()).radius)
    // every copy of a kind drawn at once (as the real tunnel does — what keeps it at 60 fps): one
    // InstancedMesh per part of each kind, in its model's own material
    for (let k = 0; k < objs.count; k++) {
      const items = this.tunnelItems.map((o, j) => (o.userData.kind === k ? j : -1)).filter((j) => j >= 0)
      if (!items.length) continue
      for (const part of objs.parts(k)) {
        const src = SRC_MAT.get(part.geometry)
        // (no source: the ball's felt shells, already real)
        const mat = src ? realMaterial(src, env) : part.material
        const mesh = new THREE.InstancedMesh(part.geometry, mat, items.length)
        mesh.frustumCulled = false
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        mesh.count = 0
        this.realScene.add(mesh)
        this.realInst.push({ mesh, part: part.matrix, items })
      }
    }
    this.realRT = new THREE.WebGLRenderTarget(1, 1)
    this.realRT.texture.colorSpace = THREE.SRGBColorSpace
    REAL_HOLE.tRealObj.value = this.realRT.texture
    // as in the hero, the holes open anywhere — not only on the objects: on the tunnel's dark,
    // behind everything, a screen-wide layer cut by the same trail, showing the real side (the
    // hero's near-white backdrop, the real objects on it)
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: { ...this.reveal.uniforms, ...REAL_HOLE },
        vertexShader: `
          varying vec2 vSuv;
          void main() { vSuv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
        fragmentShader: `
          precision highp float;
          uniform sampler2D tRealObj;
          uniform float uRealOn;
          uniform float uRealSat;
          varying vec2 vSuv;
          ${REVEAL_GLSL}
          void main() {
            if (uRealOn < 0.5 || texture2D(uRevealDye, vSuv).r * 3.9 < 0.05) discard; // (no trail here)
            vec3 rl = texture2D(tRealObj, vSuv).rgb;
            rl = mix(rl * 12.92, 1.055 * pow(rl, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, rl));
              rl = clamp(mix(vec3(dot(rl, vec3(0.299, 0.587, 0.114))), rl, uRealSat), 0.0, 1.0); // more vivid (Danilo)
            gl_FragColor = vec4(revealApplyWith(vec3(0.0), rl, vSuv), 1.0);
            ${location.search.includes('realdbg') ? 'gl_FragColor = vec4(rl, 1.0);' : ''}
          }`,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending, // (over the tunnel's black: just the hole and its chalk edge)
      }),
    )
    bg.frustumCulled = false
    bg.renderOrder = -10 // first: everything in the tunnel draws over it
    this.gallery.add(bg)
    // compiled now, all of them (three compiles only what's visible: each kind's first appearance in
    // a hole was a hitch)
    this.renderer.compile(this.realScene, this.doorCam)
  }

  /** draw the real twins where the drawn objects are, while the cursor's trail may still be open */
  private renderRealTwins(dt: number): void {
    this.realClock += dt
    const aspect = this.W / this.H
    if (this.target.distanceToSquared(this.realLast) > 0) {
      this.realIdle = 0
      this.realPath.push({ x: this.target.x * aspect, y: this.target.y, t: this.realClock })
    } else this.realIdle += dt
    this.realLast.copy(this.target)
    while (this.realPath.length && this.realClock - this.realPath[0].t > 4) this.realPath.shift()
    const rt = this.realRT
    // the real side is drawn every other frame (the felted ball alone is 0.4M triangles a copy, and
    // the tunnel already draws it in chalk): the objects turn slowly — a frame behind doesn't show
    this.realOdd = !this.realOdd
    if (location.search.includes('realdbg')) { this.realIdle = 0; this.realPath = [{ x: 0, y: 0, t: this.realClock }]; for (const q of [[1,0],[0,1],[1,1],[0.5,0.5],[1.7,0.5],[1.7,0],[1.7,1]]) this.realPath.push({ x: q[0], y: q[1], t: this.realClock }) }
    if (!rt || !this.gallery.visible || this.realIdle > 4) {
      REAL_HOLE.uRealOn.value = 0
      return
    }
    // at 3/4 of the screen's resolution: the frame's single biggest cost, and through a hole the
    // difference doesn't show — what keeps the trail at 60 fps
    if (this.realOdd && REAL_HOLE.uRealOn.value === 1) return
    const pr = this.renderer.getPixelRatio() * REAL_RES
    const w = Math.round(this.W * pr)
    const h = Math.round(this.H * pr)
    if (rt.width !== w || rt.height !== h) rt.setSize(w, h)
    const fogFar = (this.doorScene.fog as THREE.Fog | null)?.far ?? Infinity
    const show = this.tunnelItems.map((o, i) => {
      // (lost in the fog: nothing of it to show)
      if (!o.visible || this.doorCam.position.z - o.position.z > fogFar) return false
      // on screen: where it is and how far it reaches, in screen-heights; drawn only if that comes
      // within a brush (+ the fluid's drift) of where the cursor has been
      this.realP.copy(o.position).project(this.doorCam)
      const d = this.doorCam.position.distanceTo(o.position)
      const reach = this.realReach[i] / (2 * d * Math.tan(THREE.MathUtils.degToRad(this.doorCam.fov / 2))) + 0.12
      const sx = (this.realP.x * 0.5 + 0.5) * aspect
      const sy = this.realP.y * 0.5 + 0.5
      if (this.realP.z >= 1 || !this.realPath.some((q) => (q.x - sx) ** 2 + (q.y - sy) ** 2 < reach * reach)) return false
      o.updateMatrixWorld()
      return true
    })
    for (const inst of this.realInst) {
      let n = 0
      for (const j of inst.items) if (show[j]) inst.mesh.setMatrixAt(n++, this._tm.multiplyMatrices(this.tunnelItems[j].matrixWorld, inst.part))
      inst.mesh.count = n
      inst.mesh.instanceMatrix.needsUpdate = true
    }
    // the real side, as the hero's: its backdrop (LetterSwap's #fdfdfc), and on it the objects exactly
    // as the colour tunnels draw them — the tunnel's own fog darkening them with distance (without
    // it, or with a white one, they lost their depth of colour)
    this.realScene.fog = this.doorScene.fog
    this.renderer.getClearColor(this.realClear)
    const a = this.renderer.getClearAlpha()
    this.renderer.setClearColor(REAL_BG, 1)
    this.renderer.setRenderTarget(rt)
    this.renderer.render(this.realScene, this.doorCam)
    this.renderer.setRenderTarget(null)
    this.renderer.setClearColor(this.realClear, a)
    REAL_HOLE.uRealOn.value = 1
  }

  private buildSecrets(objs: TunnelObjects): void {
    const D = 10
    this.secretCam = new THREE.PerspectiveCamera(this.doorCam.fov, this.doorCam.aspect, 0.1, 100)
    this.secretCam.position.set(0, 0, D)
    this.secretCam.lookAt(0, 0, 0)
    const halfH = D * Math.tan(THREE.MathUtils.degToRad(this.secretCam.fov / 2))
    for (const s of this.secretSpec) {
      const o = objs.makeNamed(s.name)
      if (!o) {
        console.warn('[hero] secret object not found', s.name)
        continue
      }
      const box = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3())
      o.scale.setScalar((s.size * 2 * halfH) / Math.max(box.x, box.y, box.z))
      o.position.set(s.x * halfH * this.secretCam.aspect, s.y * halfH, 0)
      o.rotation.set(0.5, s.rot ?? 0.6, 0.15)
      this.secretRoot.add(o)
    }
    this.secretScene.add(this.secretRoot)
  }

  /** (/hero-tunnel-portrait) the object under the cursor shows its real colours (the drawn
   *  material swapped for the model's own; back when the cursor leaves) */
  private stepTunnelHover(): void {
    if (!this.tunnelHoverColor || !this.tunnelItems.length) return
    let hit: THREE.Object3D | null = null
    if (this.pointerInside && this.gallery.visible) {
      this.hoverNdc.set(this.target.x * 2 - 1, this.target.y * 2 - 1)
      this.hoverRay.setFromCamera(this.hoverNdc, this.doorCam)
      const hits = this.hoverRay.intersectObjects(this.tunnelItems.filter((o) => o.visible), true)
      if (hits.length) {
        let o: THREE.Object3D | null = hits[0].object
        while (o && !this.tunnelItems.includes(o)) o = o.parent
        hit = o
      }
    }
    if (hit === this.hovered) return
    const swap = (o: THREE.Object3D, real: boolean) =>
      o.traverse((c) => {
        const m = c as THREE.Mesh
        if (!m.isMesh) return
        if (!m.userData.drawnMat) m.userData.drawnMat = m.material
        if (real) {
          m.userData.realMat ??= realMaterial(SRC_MAT.get(m.geometry)!, this.hoverEnv ?? null)
          m.material = m.userData.realMat as THREE.Material
        } else m.material = m.userData.drawnMat as THREE.Material
      })
    if (this.hovered) swap(this.hovered, false)
    if (hit) swap(hit, true)
    this.hovered = hit
    setCursor('hero-tunnel', hit ? 'pointer' : '')
  }

  /** the hidden terrain's life: it flows on its own and faster with the scroll; the cursor's
   *  hill eases after the pointer and sinks away when it leaves */
  private stepHiddenTerrain(dt: number): void {
    if (PORTRAIT.uPortraitOn.value < 1.5) return
    PORTRAIT.uHFlow.value += dt * (0.12 + Math.min(this.tunnelScroll, 4) * 0.35)
    const m = PORTRAIT.uHMouse.value
    const k = Math.min(1, dt * 4)
    m.x += (this.target.x - m.x) * k
    m.y += (this.target.y - m.y) * k
    PORTRAIT.uHMouseAmt.value += ((this.pointerInside ? 1 : 0) - PORTRAIT.uHMouseAmt.value) * Math.min(1, dt * 3)
  }

  private stepTunnelItems(dt: number): void {
    if (this.tunnelInst.length) return this.stepTunnelInstances(dt)
    if (!this.tunnelItems.length) return
    this.stepHiddenTerrain(dt)
    this.stepTunnelHover()
    const fog = this.doorScene.fog as THREE.Fog | null
    if (fog && this.tunnelObjs) this.tunnelObjs.fog.value.set(fog.near, fog.far)
    for (const o of this.tunnelItems) {
      const m = o.userData.slot as THREE.Mesh
      let op = (m.material as THREE.MeshBasicMaterial).opacity
      if (this.drawnEvery > 1) {
        // all there at once (as the real tunnel): the photos' one-by-one stagger undone
        const at = m.userData.revealAt as number
        const st = THREE.MathUtils.smoothstep(this.revealClock, at, at + 0.4)
        op = this.revealClock < 0 ? 0 : st > 0.001 ? Math.min(1, op / st) : this.inWormhole ? op : 1
      }
      o.visible = op > 0.005 && (!fog || this.doorCam.position.z - m.position.z < fog.far + 6)
      if (!o.visible) continue
      o.position.copy(m.position)
      if (this.tunnelRandom) o.position.set(o.userData.rx as number, o.userData.ryy as number, m.position.z)
      o.traverse((c) => {
        const mat = (c as THREE.Mesh).material as THREE.Material | undefined
        if (mat) mat.opacity = op
      })
      o.userData.ry = ((o.userData.ry as number) ?? 0) + dt * (o.userData.spin as number)
      o.quaternion.setFromAxisAngle(o.userData.axis as THREE.Vector3, o.userData.ry as number)
    }
  }

  /** TEST (/hero-drawn-grab.html): over a crumb, the system's grab hand — closed while the button is
   *  held (it stays closed through a drag that has slipped off the pile) */
  private stepGrabCursor(shut: boolean): void {
    let over = false
    if (shut && this.pointerInside && this.crumbs.stage.visible) {
      this.grabNdc.set(this.target.x * 2 - 1, this.target.y * 2 - 1)
      this.grabRay.setFromCamera(this.grabNdc, this.doorCam)
      const shown = (o: THREE.Object3D | null): boolean => !o || (o.visible && shown(o.parent))
      over = this.grabRay.intersectObject(this.crumbs.stage, true).some((h) => shown(h.object))
    }
    const want = this.down > 0.5 && (over || this.grabShown === 'grabbing') ? 'grabbing' : over ? 'grab' : ''
    if (want !== this.grabShown) {
      setCursor('hero-crumbs', want)
      this.grabShown = want
    }
  }

  /** TEST (/hero-drawn.html): a crumb drawn — paper, graphite outline, hatching, and its photo's
   *  dark spots (the cookie's chips, the cracker's holes) drawn as marks */
  private drawnCrumbMaterial(map: THREE.Texture | null): THREE.Material {
    return new THREE.ShaderMaterial({
      uniforms: { ...this.drawnU, ...this.reveal.uniforms, uMap: { value: map }, uCrumbReveal: { value: this.crumbReveal ? 1 : 0 } },
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
        uniform sampler2D uMap;
        uniform float uCrumbReveal;
        varying vec3 vViewN;
        varying vec4 vClip;
        varying vec2 vUv;
        ${DRAWN_GLSL}
        ${REVEAL_GLSL}
        void main() {
          vec2 suv = (vClip.xy / vClip.w) * 0.5 + 0.5;
          // the photo's lightness as seen (the texture is decoded to linear on read)
          vec2 tuv = drawnBoil(vUv, fwidth(vUv));
          float l = pow(dot(texture2D(uMap, tuv).rgb, vec3(0.299, 0.587, 0.114)), 1.0 / 2.2);
          float ink = max(drawnInk(suv, vViewN), drawnMarks(suv, l, 0.33, fwidth(l), 0.0));
          vec3 col = mix(drawnPaper(suv), D_INK, ink);
          if (uCrumbReveal > 0.5) {
            // through the cursor's holes: the crumb as it really is — its photo, lit roughly as
            // the plain hero lights it (a key from the upper left + fill), back to display values
            vec3 n = normalize(vViewN);
            float lit = 0.42 + 0.78 * max(dot(n, normalize(vec3(-0.35, 0.6, 0.72))), 0.0);
            vec3 real = pow(texture2D(uMap, vUv).rgb * lit, vec3(1.0 / 2.2));
            col = revealApplyWith(col, real, suv);
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
  }

  private async loadFonts(): Promise<void> {
    if (this.fonts) return
    try {
      const ttf = new TTFLoader()
      const [b, i] = await Promise.all([
        ttf.loadAsync('/fonts/Tinos-Bold.ttf'),
        ttf.loadAsync('/fonts/Tinos-Italic.ttf'),
      ])
      type FontData = ConstructorParameters<typeof Font>[0]
      const italic = new Font(i as unknown as FontData)
      this.fonts = { bold: new Font(b as unknown as FontData), italic, tag: italic }
    } catch (e) {
      console.error('[hero] sign font load failed', e)
    }
  }

  /**
   * Split an extruded-text geometry by the plane x = 0 into two closed halves.
   * Triangles that straddle the plane are clipped (clean vertical seam, not a
   * ragged triangle-bucket edge) and each half gets a flat cap on the cut so the
   * bisected glyph reads as solid, not hollow.
   */
  private bisect(geo: THREE.BufferGeometry): [THREE.BufferGeometry, THREE.BufferGeometry] {
    const src = geo.index ? geo.toNonIndexed() : geo
    const P = src.attributes.position.array
    const N = src.attributes.normal.array

    const L: number[] = []
    const Ln: number[] = []
    const R: number[] = []
    const Rn: number[] = []
    const cut: number[] = [] // segments on x=0: [y1,z1,y2,z2,...]

    const fan = (arr: number[], narr: number[], poly: number[][]): void => {
      for (let i = 1; i < poly.length - 1; i++) {
        for (const v of [poly[0], poly[i], poly[i + 1]]) {
          arr.push(v[0], v[1], v[2])
          narr.push(v[3], v[4], v[5])
        }
      }
    }

    for (let t = 0; t < P.length; t += 9) {
      const v = [0, 1, 2].map((k) => [
        P[t + k * 3], P[t + k * 3 + 1], P[t + k * 3 + 2],
        N[t + k * 3], N[t + k * 3 + 1], N[t + k * 3 + 2],
      ])
      const lp: number[][] = []
      const rp: number[][] = []
      const onPlane: number[][] = []
      for (let i = 0; i < 3; i++) {
        const a = v[i]
        const b = v[(i + 1) % 3]
        if (a[0] <= 1e-6) lp.push(a)
        if (a[0] >= -1e-6) rp.push(a)
        if ((a[0] < 0 && b[0] > 0) || (a[0] > 0 && b[0] < 0)) {
          const s = a[0] / (a[0] - b[0])
          const m = a.map((av, k) => av + s * (b[k] - av))
          m[0] = 0
          lp.push(m)
          rp.push(m)
          onPlane.push(m)
        }
      }
      if (lp.length >= 3) fan(L, Ln, lp)
      if (rp.length >= 3) fan(R, Rn, rp)
      if (onPlane.length === 2) cut.push(onPlane[0][1], onPlane[0][2], onPlane[1][1], onPlane[1][2])
    }

    // cap the cut: chain the boundary segments into closed loops (a glyph like E
    // gives several disjoint loops) and fan each one on its own — a single global
    // fan would bridge the gaps and leave stray webs poking off the seam.
    const q = (y: number, z: number): string => `${Math.round(y * 1e4)}_${Math.round(z * 1e4)}`
    const segs: number[][] = []
    for (let i = 0; i < cut.length; i += 4) segs.push([cut[i], cut[i + 1], cut[i + 2], cut[i + 3]])
    const byKey = new Map<string, number[]>()
    segs.forEach((s, i) => {
      for (const k of [q(s[0], s[1]), q(s[2], s[3])]) {
        if (!byKey.has(k)) byKey.set(k, [])
        byKey.get(k)!.push(i)
      }
    })
    const unused = new Set(segs.map((_, i) => i))
    while (unused.size) {
      const start = unused.values().next().value as number
      unused.delete(start)
      const loop: number[][] = [
        [segs[start][0], segs[start][1]],
        [segs[start][2], segs[start][3]],
      ]
      const startKey = q(segs[start][0], segs[start][1])
      let curKey = q(segs[start][2], segs[start][3])
      for (let guard = 0; curKey !== startKey && guard < 5000; guard++) {
        const next = (byKey.get(curKey) ?? []).find((i) => unused.has(i))
        if (next === undefined) break
        unused.delete(next)
        const s = segs[next]
        const near = q(s[0], s[1]) === curKey
        loop.push(near ? [s[2], s[3]] : [s[0], s[1]])
        curKey = q(near ? s[2] : s[0], near ? s[3] : s[1])
      }
      if (loop.length < 3) continue
      let cy = 0
      let cz = 0
      for (const [y, z] of loop) {
        cy += y
        cz += z
      }
      cy /= loop.length
      cz /= loop.length
      // recess each cap's centroid a hair into its own half so the cap becomes a
      // shallow cone instead of a flat plane at x=0. The perimeter still meets the
      // cut edge exactly (no gap in the glyph), but the two caps no longer share a
      // coincident plane — which was the faint shimmer as the halves split.
      for (let i = 0; i < loop.length; i++) {
        const [y1, z1] = loop[i]
        const [y2, z2] = loop[(i + 1) % loop.length]
        L.push(-0.012, cy, cz, 0, y2, z2, 0, y1, z1)
        R.push(0.012, cy, cz, 0, y1, z1, 0, y2, z2)
        for (let j = 0; j < 3; j++) {
          Ln.push(-1, 0, 0)
          Rn.push(1, 0, 0)
        }
      }
    }

    if (src !== geo) src.dispose()

    const g = (p: number[], nn: number[]): THREE.BufferGeometry => {
      const bg = new THREE.BufferGeometry()
      bg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
      bg.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3))
      return bg
    }
    return [g(L, Ln), g(R, Rn)]
  }

  private disposeLetters(): void {
    for (const grp of [this.lettersL, this.lettersR]) {
      for (const child of [...grp.children]) {
        ;(child as THREE.Mesh).geometry?.dispose()
        grp.remove(child)
      }
    }
    this.signMeshes = []
  }

  /** (re)build the extruded letters for the current viewport and split them GEN | ERIC. */
  private layoutLetters(): void {
    if (!this.fonts) return
    this.disposeLetters()

    const vh = 2 * DOOR_CAM_Z * Math.tan(THREE.MathUtils.degToRad(DOOR_FOV / 2))
    const vw = vh * (this.W / this.H)
    const targetW = vw * (this.W < 700 ? LOCKUP_FRACTION_MOBILE : LOCKUP_FRACTION_DESKTOP)

    // size the type so "GENERIC." spans targetW
    const probe = new TextGeometry('GENERIC.', { font: this.fonts.bold, size: 1, depth: 0.001, bevelEnabled: false })
    probe.computeBoundingBox()
    const w1 = probe.boundingBox!.max.x - probe.boundingBox!.min.x
    probe.dispose()
    const size = targetW / w1
    const shape = this.signShape(size)
    const depth = shape.depth
    const bevel = shape.bevelEnabled ? shape.bevelThickness : 0

    const geo = new TextGeometry('GENERIC.', { font: this.fonts.bold, size, ...shape })
    geo.computeBoundingBox()
    const bb = geo.boundingBox!
    const halfW = (bb.max.x - bb.min.x) / 2
    const halfH = (bb.max.y - bb.min.y) / 2

    // lockup centre -> origin; extrusion runs z 0..depth so the back sits on the panel
    // (translate() recomputes bb, so keep the original centre for the LetterSwap layout)
    const centre = new THREE.Vector2((bb.max.x + bb.min.x) / 2, (bb.max.y + bb.min.y) / 2)
    geo.translate(-(bb.max.x + bb.min.x) / 2, -(bb.max.y + bb.min.y) / 2, 0)

    const [gl, gr] = this.bisect(geo)
    geo.dispose()

    const yOff = vh * 0.03
    const zOff = 0.015
    if (this.letterSwap) this.layoutLetterSwap(size, centre, yOff, zOff + depth + bevel)
    const meshL = new THREE.Mesh(gl, this.letterMat)
    meshL.position.set(vw / 2, yOff, zOff)
    this.lettersL.add(meshL)
    const meshR = new THREE.Mesh(gr, this.letterMat)
    meshR.position.set(-vw / 2, yOff, zOff)
    this.lettersR.add(meshR)
    this.signMeshes.push(meshL, meshR)
    this.wordMeshes = [meshL, meshR]
    if (this.signLab) {
      // at rest the lockup's ink centre sits on (0, yOff); TextGeometry's size is 0.72 em
      const frontZ = zOff + depth + bevel
      const upp = (2 * (DOOR_CAM_Z - frontZ) * Math.tan(THREE.MathUtils.degToRad(DOOR_FOV / 2))) / this.H
      this.labFrame = { S: size / 0.72 / upp, base: this.H / 2 - (yOff - centre.y) / upp, left: this.W / 2 - centre.x / upp, frontZ, weLeft: NaN, weBase: NaN, we: null }
      this.setWordVisible(!this.labDoorsShut)
    }
    this.pinRest(meshL)
    this.pinRest(meshR)

    // "We are" — italic, just above the G, entirely on the left leaf
    const weSize = size * 0.165
    const weGeo = new TextGeometry('We are', { font: this.fonts.italic, size: weSize, ...this.weShape(weSize) })
    weGeo.computeBoundingBox()
    const wb = weGeo.boundingBox!
    weGeo.translate(-wb.min.x, -wb.min.y, 0)
    const weX = vw / 2 - halfW + size * 0.03
    // (dodging version sits a bit higher, clear of the G's top)
    const weY = yOff + halfH + size * (this.weAreDodge || this.weAreHigh ? 0.16 : 0.06)
    this.weLetters = []
    if (this.weAreDodge) {
      // one mesh per letter, laid out by the font's own advances (TextGeometry doesn't kern, so
      // this matches the one-piece version exactly); pivot at each letter's centre so it can tilt
      const it = this.fonts.italic
      const itData = it.data as unknown as { resolution: number; glyphs: Record<string, { ha: number }> }
      const k = weSize / itData.resolution
      this.weMat ??= new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        vertexShader: this.letterMat.vertexShader,
        fragmentShader: this.letterMat.fragmentShader,
        uniforms: { ...this.letterMat.uniforms, uNoReveal: { value: 1 } }, // shared objects, except this one
      })
      let adv = 0
      for (const ch of 'We are') {
        if (ch !== ' ') {
          const g = new TextGeometry(ch, { font: it, size: weSize, ...this.weShape(weSize) })
          g.computeBoundingBox()
          const c = g.boundingBox!.getCenter(new THREE.Vector3())
          g.translate(-c.x, -c.y, 0)
          const m = new THREE.Mesh(g, this.weMat)
          const home = new THREE.Vector3(weX + adv - wb.min.x + c.x, weY - wb.min.y + c.y, zOff)
          m.position.copy(home)
          this.lettersL.add(m)
          this.signMeshes.push(m)
          this.weLetters.push({ mesh: m, home, off: new THREE.Vector2(), vel: new THREE.Vector2(), rot: 0, rotV: 0 })
        }
        adv += itData.glyphs[ch].ha * k
      }
      weGeo.dispose()
      this.weLift = depth + bevel
      this.wePxToWorld = (2 * (DOOR_CAM_Z - zOff - weSize * 0.2) * Math.tan(THREE.MathUtils.degToRad(DOOR_FOV / 2))) / this.H
    } else {
      const we = new THREE.Mesh(weGeo, this.letterMat)
      we.position.set(weX, weY, zOff)
      this.lettersL.add(we)
      this.signMeshes.push(we)
      if (this.signLab && this.labFrame) {
        // its pen origin at rest (the left leaf sits -vw/2 over), on the word's front plane
        const upp = (2 * (DOOR_CAM_Z - this.labFrame.frontZ) * Math.tan(THREE.MathUtils.degToRad(DOOR_FOV / 2))) / this.H
        this.labFrame.weLeft = this.W / 2 + (weX - vw / 2 - wb.min.x) / upp
        this.labFrame.weBase = this.H / 2 - (weY - wb.min.y) / upp
        // and in the world: its pen origin and front face, and its scale per em (TextGeometry: 0.72)
        this.labFrame.we = { x: weX - vw / 2 - wb.min.x, y: weY - wb.min.y, z: zOff + weSize * 0.16, k: size / 0.72 }
        this.wordMeshes.push(we)
        we.visible = !this.labDoorsShut
      }
    }

    // tagline — on the cube's outer face, revealed once the cube has turned far enough
    const cs = this.cubeSide
    const cxL = cs / 2 - vw * 0.006 // left cube centre offset inside its hinge (matches buildLeaf)
    const tagW = cs * 0.7
    const makeTag = (text: string): THREE.Mesh => {
      const pr = new TextGeometry(text, { font: this.fonts!.tag, size: 1, depth: 0.001, bevelEnabled: false })
      pr.computeBoundingBox()
      const s = tagW / (pr.boundingBox!.max.x - pr.boundingBox!.min.x)
      pr.dispose()
      const g = new TextGeometry(text, {
        font: this.fonts!.tag,
        size: s,
        depth: s * 0.14,
        curveSegments: 4,
        bevelEnabled: true,
        bevelThickness: s * 0.02,
        bevelSize: s * 0.02,
        bevelSegments: 1,
      })
      g.computeBoundingBox()
      const gb = g.boundingBox!
      g.translate(-(gb.max.x + gb.min.x) / 2, -(gb.max.y + gb.min.y) / 2, 0)
      return new THREE.Mesh(g, this.letterMat)
    }

    const tagL = makeTag('We do things')
    const tagR = makeTag('for people.')
    // left cube: on its -x (outer) face, facing -x, just outside it.
    tagL.material = this.drawn ? this.drawnTagMat : this.tagMatL // self-contained, same key/gate as the face, darker albedo
    tagL.rotation.y = -Math.PI / 2
    tagL.position.set(cxL - cs / 2 - 0.05, yOff, -cs / 2)
    tagL.layers.set(1)
    // right cube: mirror — on its +x (outer) face
    tagR.material = this.drawn ? this.drawnTagMat : this.tagMatR
    tagR.rotation.y = Math.PI / 2
    tagR.position.set(-(cxL - cs / 2 - 0.05), yOff, -cs / 2)
    tagR.layers.set(2)
    this.lettersL.add(tagL)
    this.lettersR.add(tagR)
  }

  // ---- sizing ------------------------------------------------------
  /** device-pixel size of the visible frame (canvas minus the hidden overscan) */
  private bufSize(): [number, number] {
    return [Math.max(2, Math.round(this.W * this.dpr)), Math.max(2, Math.round(this.H * this.dpr))]
  }

  /** the visible frame's pixels, as they are on screen, into snapTex */
  private captureSnap(): void {
    const [bw, bh] = this.bufSize()
    if (!this.snapTex || this.snapTex.image.width !== bw || this.snapTex.image.height !== bh) {
      this.snapTex?.dispose()
      this.snapTex = new THREE.FramebufferTexture(bw, bh)
      // raw bytes (the canvas is plain RGBA8: an sRGB texture can't be copied into); PaperDesk decodes
      this.snapTex.colorSpace = THREE.NoColorSpace
    }
    this.renderer.copyFramebufferToTexture(this.snapTex, new THREE.Vector2(0, 0))
  }

  private clearTargets(): void {
    this.fluid.clear()
  }

  // ---- loop -------------------------------------------------------
  private frame = (): void => {
    const dt = Math.min(this.clock.getDelta(), 0.05)

    this.pointer.lerp(this.target, 0.35)
    this.active += ((this.hasFocus() ? 1 : 0) - this.active) * 0.12

    // the cursor's fluid sim advances every frame regardless of hover (it just decays
    // to nothing when idle) — splat() (which actually pushes it) is called further
    // down, once overSign is known.
    this.fluid.setAspect(this.W / this.H)
    this.fluid.step(dt)

    // ground -> heroRT, mapped onto the door leaves. Off-white at rest, morphs to
    // concrete over the first stretch of scroll.
    this.heroMat.uniforms.uTexMix.value = THREE.MathUtils.smoothstep(this.progress, 0.02, 0.28)
    this.renderer.setRenderTarget(this.heroRT)
    this.renderer.render(this.heroScene, this.camera)
    this.renderer.setRenderTarget(null)

    // the instant the user starts scrolling, the pile is sucked off the sides —
    // and the doors don't begin to move until it's gone
    this.crumbs.setSuction(this.progressTarget > 0.01)

    // doors — held shut while the crumbs are still evacuating. Scroll made during
    // that wait must NOT bank: pin the target just past the suction threshold so it
    // can't accumulate; the hero only starts building once the crumbs are gone.
    // an objects tunnel: the doors don't open as far as the tunnel showing until every object is
    // loaded and on the GPU — none of them may turn up late (in practice it's long ready by then)
    if (this.tunnelObjs?.look === 'real' && !this.tunnelReady) {
      const cap = TUNNEL_REVEAL_P - 0.08
      this.manual = Math.min(this.manual, cap)
      this.progressTarget = Math.min(this.progressTarget, cap)
    }
    if (!this.crumbs.clear) {
      this.manual = Math.min(this.manual, 0.02)
      this.progressTarget = this.manual
    } else {
      // gentle cinematic smoothing for normal scrolling; the further the target is
      // (scrolling hard) the faster it catches up, so a violent scroll rips through.
      const gap = this.progressTarget - this.progress
      const k = Math.min(1, (1 - Math.pow(0.003, dt)) + Math.min(0.55, Math.abs(gap) * 4))
      this.progress += gap * k
    }
    const P = this.progress
    const vh = 2 * DOOR_CAM_Z * Math.tan(THREE.MathUtils.degToRad(DOOR_FOV / 2))
    const vw = vh * (this.W / this.H)

    // one shared curve drives the rotation AND the recede, so the cubes turn and
    // pull back together from the first frame (not spin-then-slide). Reaches 1 at
    // FREEZE_P (the SPIN_CAP / frozen frame), smootherstep so it eases to a stop.
    const du = THREE.MathUtils.clamp(P / FREEZE_P, 0, 1)
    const doorE = du * du * du * (du * (du * 6 - 15) + 10)

    const fwd = -doorE * 9
    // NO inward drift — it made the two halves of the split wordmark (and the two
    // cube faces) converge and overlap at the seam as the scroll began. Perspective
    // shrink alone keeps the receding cubes framed.
    const xPull = 1

    this.letterMat.uniforms.uDye.value = this.fluid.dyeTexture
    this.letterMat.uniforms.uVelocity.value = this.fluid.velocityTexture
    this.letterMat.uniforms.uOpen.value = Math.min(1, P * 2.5)
    this.letterMat.uniforms.uTime.value += dt

    // rotation rides the same curve as the recede (doorE) and decelerates into
    // SPIN_CAP at FREEZE_P instead of slamming into it
    const spin = SPIN_CAP * doorE
    this.leftHinge.rotation.y = spin
    this.rightHinge.rotation.y = -spin
    // feed each tagline text material the world normal of the flat face it gates
    // on (left: -x rotated; right: +x rotated the other way)
    const cs = Math.cos(spin)
    const sn = Math.sin(spin)
    this.tagMatL.uniforms.uFaceN.value.set(-cs, 0, sn)
    this.tagMatR.uniforms.uFaceN.value.set(cs, 0, sn)
    // light/shadow play, tied to the rotation: GENERIC drops into full shadow FAST
    // and is completely dark well before the tagline (+ its text) comes up slowly,
    // so the two are never legible at once
    const deg = (spin * 180) / Math.PI
    const dark = THREE.MathUtils.smoothstep(deg, 52, 70)
    const bright = THREE.MathUtils.smoothstep(deg, 80, 122)
    this.doorMat.uniforms.uPhase.value = dark
    this.doorMat.uniforms.uPhaseB.value = bright
    this.letterMat.uniforms.uPhase.value = dark
    this.tagMatL.uniforms.uReveal.value = bright
    this.tagMatR.uniforms.uReveal.value = bright
    this.drawnTagShade.value = 1 - bright

    this.leftHinge.position.set((-vw / 2) * xPull, 0, fwd)
    this.rightHinge.position.set((vw / 2) * xPull, 0, fwd)

    // once the cubes lock (FREEZE_P) the camera eases forward toward them — the
    // approved shot that lets you take in the revealed tagline up close (settles
    // ~z -4 by 90% scroll) — then in the last stretch it PUNCHES through the gap
    // into the tunnel.
    const d1 = THREE.MathUtils.clamp((P - FREEZE_P) / (0.9 - FREEZE_P), 0, 1)
    const d2 = THREE.MathUtils.clamp((P - 0.9) / 0.1, 0, 1)
    const camZ = THREE.MathUtils.lerp(DOOR_CAM_Z, -4, d1 * (2 - d1)) + Math.pow(d2, 2.2) * (CAM_DIVE_END + 4)
    this.doorCam.position.z = camZ
    this._look.set(0, 0, camZ - 10) // always straight ahead
    this.doorCam.lookAt(this._look)

    // is the cursor actually over the wordmark? A real raycast against the letter
    // meshes, not the page-wide pointerInside flag — see the field comments above.
    this.raycaster.setFromCamera(new THREE.Vector2(this.pointer.x * 2 - 1, this.pointer.y * 2 - 1), this.doorCam)
    this.overSign = this.signMeshes.length > 0 && this.raycaster.intersectObjects(this.signMeshes, false).length > 0

    // material roulette — the INSTANT the cursor lands on the sign, the whole
    // wordmark hard-cuts to a random material from FOOD_MATERIALS (no spotlight, no
    // delay, no "chrome" precursor). While it stays hovered, it keeps hard-cutting to
    // a new unrelated material every couple of seconds. Leaving the sign drops it
    // back to plain resting metal (uMatIndex 0) with no reactivity at all.
    if (ROULETTE_ENABLED && this.overSign) {
      this.matTimer += dt
      if (this.matIndex === 0 || this.matTimer > this.matNextSwitch) {
        this.matTimer = 0
        this.matNextSwitch = MAT_SWITCH_MIN + Math.random() * (MAT_SWITCH_MAX - MAT_SWITCH_MIN)
        let next = this.matIndex
        while (next === this.matIndex && FOOD_MATERIALS.length > 1) {
          next = FOOD_MATERIALS[Math.floor(Math.random() * FOOD_MATERIALS.length)]
        }
        this.matIndex = FOOD_MATERIALS.length === 1 ? FOOD_MATERIALS[0] : next
      }
    } else if (this.matIndex !== 0) {
      this.matIndex = 0
      this.matTimer = 0
    }
    this.letterMat.uniforms.uMatIndex.value = this.matIndex

    // push the cursor's actual movement into the fluid sim — only while it's over
    // the sign, so drifting across the rest of the page doesn't stir it for nothing
    if (ROULETTE_ENABLED && this.overSign) {
      const dx = this.pointer.x - this.prevPointer.x
      const dy = this.pointer.y - this.prevPointer.y
      const len = Math.hypot(dx, dy)
      if (len > 1e-5) {
        this._splatPoint.copy(this.pointer)
        this._splatDir.set(dx / len, dy / len)
        this.fluid.splat(this._splatPoint, this._splatDir, len * (0.55 + this.down * 0.45))
      }
    }

    // the reveal holes: stirred by the raw cursor anywhere on the page (not just over
    // the sign), weakening as the doors start to move and gone by REVEAL_FADE_P
    this.reveal.uniforms.uRevealPx.value.set(1 / this.W, 1 / this.H)
    if (this.letterSwap) {
      // /hero-letters: the cursor stops the moment the doors start to open (back as soon as
      // they're shut again); the holes it already made stay and close on their own, riding the
      // cubes as they swing (see restOn)
      const doorsShut = doorE <= DOORS_SHUT_E
      this.reveal.step(dt, this.target, this.pointerInside && (doorsShut || (this.tunnelReveal && this.gallery.visible)), this.W / this.H, 0)
    } else {
      this.reveal.step(dt, this.target, this.pointerInside && !this.noReveal, this.W / this.H, THREE.MathUtils.clamp(P / REVEAL_FADE_P, 0, 1))
    }

    this.labDoorsShut = doorE <= DOORS_SHUT_E
    this.letterSwap?.step(dt)
    if (this.weLetters.length) this.stepWeAre(dt, doorE <= DOORS_SHUT_E)

    this.stepGallery(dt, P, camZ)

    // the cursor knocks the pile around (only where CrumbRain was built with push)
    this.crumbs.setPointer(this.pointerInside && doorE <= DOORS_SHUT_E && (!this.crumbPushHold || this.down > 0.5) ? this.target : null)
    if (this.crumbGrabCursor) this.stepGrabCursor(doorE <= DOORS_SHUT_E)
    // (/hero-paper*: once the desk is up the pile is gone from view — and the desk's own physics
    // shares the one Rapier instance; one world stepping at a time)
    if (!(this.paper && (this.paperOn || this.paperShown))) this.crumbs.step(dt)

    // rest pose for the pinned reveal: refreshed while the doors are shut, frozen once they move
    this.restLive = doorE <= DOORS_SHUT_E
    if (this.restLive) {
      this.doorCam.updateMatrixWorld()
      this.restVP.value.multiplyMatrices(this.doorCam.projectionMatrix, this.doorCam.matrixWorldInverse)
    }
    // past the cubes (the camera has punched through them into the tunnel) nothing of the hero is
    // in view: skip what only it needed — the cubes' shadow maps (two scene renders a frame) and
    // the drawn outline pass — and stop updating the hinges. The main thread was busy all frame
    const pastDoors = this.progress >= TUNNEL_ARM_P
    this.renderer.shadowMap.autoUpdate = !pastDoors
    this.leftHinge.visible = this.rightHinge.visible = !pastDoors
    if (this.drawn && pastDoors && this.secretCam) {
      this.drawn.step(dt)
      // they stand still: drawn again only when the view changed or the doors' pass drew over them
      if (this.secretDirty || this.secretCam.aspect !== this.doorCam.aspect) {
        this.secretCam.aspect = this.doorCam.aspect
        this.secretCam.updateProjectionMatrix()
        this.drawn.normalPass(this.secretScene, this.secretCam, [this.secretRoot])
        this.secretDirty = false
      }
    } else this.secretDirty = true
    if (this.drawn && !pastDoors) {
      this.drawn.step(dt)
      // (lab) its letters have their own outline pass: out of this one
      const labHide = this.signLab ? this.wordMeshes.map((m) => [m, m.visible] as const) : []
      for (const [m] of labHide) m.visible = false
      this.drawn.normalPass(this.doorScene, this.doorCam, [this.leftHinge, this.rightHinge, ...this.labRoots, ...(this.drawnCrumbs ? [this.crumbs.stage] : []), ...this.weLetters.map((w) => w.mesh), ...(this.tunnelObjs?.look === 'drawn' ? this.tunnelItems : [])])
      for (const [m, v] of labHide) m.visible = v
    }
    const wantRes = this.gallery.visible ? this.tunnelResScale : 1
    if (wantRes !== this.resScaleNow) {
      this.resScaleNow = wantRes
      const box = this.canvas.getBoundingClientRect()
      this.renderer.setPixelRatio(this.dpr * wantRes)
      this.renderer.setSize(box.width, box.height, false)
      this.renderer.setViewport(0, 0, this.W, this.H)
    }
    // the frame that becomes the sheet: /hero-paper-direct, the hero as it was when the scroll began;
    // /hero-paper, the cubes locked on "We do things for people" (FREEZE_P) — never the way through
    if (this.paper && this.snapTex && !this.paperOn && (this.paperDirect ? this.progressTarget > 0.01 : this.progress >= PAPER_AT_P)) {
      this.paperOn = true
      console.info('[hero] paper: the frame becomes the sheet')
    }
    if (this.paper && this.paperOn) { // (once done it stays on its black until the next page)
      // through the cubes: the desk (the print is the hero as it was when the scroll began)
      if (this.snapTex && !this.paperShown) {
        this.paperShown = true
        this.paper.setPrint(this.snapTex, this.W / this.H, !this.paperDirect)
        this.paper.show(true)
      }
      this.drawn!.step(dt)
      this.paper.step(dt)
      this.paper.render()
      this.prevPointer.copy(this.pointer)
      return
    }
    if (this.tunnelReveal) this.renderRealTwins(dt)
    if (location.search.includes('realdbg')) for (const o of this.tunnelItems) o.visible = false
    this.beforeDoorRender?.()
    this.renderer.render(this.doorScene, this.doorCam)
    this.afterDoorRender?.()
    if (this.tunnelInst.length && this.gallery.visible) {
      this.objScene.fog = this.doorScene.fog
      this.renderer.autoClear = false
      this.renderer.render(this.objScene, this.doorCam)
      this.renderer.autoClear = true
    }
    // (/hero-paper) keep the last frame from before the scroll began: it's what gets printed
    if (this.paper && !this.paperOn && (this.paperDirect ? this.progressTarget <= 0.01 : true)) this.captureSnap()

    this.prevPointer.copy(this.pointer)
  }

  /** advance the photo tunnel: photos appear one at a time just before the zoom-in,
   *  then Floema's warp burst -> idle drift + a scroll-RATE speed boost + fog + recycle.
   *  Sustained fast scrolling here charges the wormhole (see stepWormhole). */
  private stepGallery(dt: number, P: number, camZ: number): void {
    if (this.inApproach) {
      this.stepApproach(dt)
      return
    }
    if (this.inTunnel) {
      this.stepTunnel(dt)
      return
    }
    // (/hero-paper) no tunnel while the desk is up; (/hero-sem-mesa) none at all
    if ((this.paper && !this.behindDone) || this.scrollAfter) {
      this.gallery.visible = false
      return
    }
    // photos start appearing just before the zoom-in; scrolling back drops them
    if (P < TUNNEL_REVEAL_P - 0.06) this.revealClock = -1
    else if (this.revealClock < 0) this.revealClock = 0
    else this.revealClock += dt

    this.gallery.visible = this.revealClock >= 0
    if (!this.gallery.visible) return

    const armed = P >= TUNNEL_ARM_P
    const fog = this.doorScene.fog as THREE.Fog

    // tunnelScroll is a decaying accumulator of scroll INPUT — 3 flicks/sec really is
    // ~3x faster than 1 flick/sec, and it's not capped at 1
    this.tunnelScroll = Math.max(0, this.tunnelScroll * Math.pow(0.1, dt) - dt * 0.6)

    // ---- wormhole charge -------------------------------------------------
    // scrolling hard and continuously (tunnelScroll over the threshold) fills
    // warpCharge; anything less bleeds it away over WARP_DISCHARGE_TIME — fast,
    // but a brief pause doesn't zero it. Pinned at full for WARP_HOLD_TIME it
    // locks and the ride goes automatic.
    this.wormPulses = Math.max(0, this.wormPulses - dt / WORM_GESTURE_DECAY)

    if (!this.inWormhole) {
      // once the charge has already reached WORM_STREAK_ON once (the streaks are
      // up), the hard part is over — it finishes on its own, scroll or not
      if (!this.wormAuto) {
        const ccNow = this.warpCharge * this.warpCharge * (3 - 2 * this.warpCharge)
        if (ccNow >= WORM_STREAK_ON) {
          this.wormAuto = true
          this.wormAutoStartCharge = this.warpCharge
          console.info('[hero] wormhole: streaks up — autopilot to the throat')
        }
      }
      if (this.wormAuto) {
        // no extra hold here — autopilot is already a deliberate, timed ramp (not
        // a fluke instant spike), so it locks the moment it reaches full charge
        // instead of sitting fully-close for another beat first
        this.warpCharge = Math.min(1, this.warpCharge + dt / WORM_AUTO_TIME)
        if (this.warpCharge >= 1) {
          this.inWormhole = true
          this.wormholeTime = 0
          console.info('[hero] wormhole: locked')
        }
      } else {
        if (armed && this.textsDone && this.tunnelScroll > WARP_SCROLL_THRESH) {
          const power = 1 + (this.tunnelScroll - WARP_SCROLL_THRESH) * 0.35 // how hard, right now
          const frac = THREE.MathUtils.clamp((this.wormPulses - 1) / (WORM_GESTURE_NEEDED - 1), 0, 1)
          const commitment = THREE.MathUtils.lerp(WORM_GESTURE_FLOOR, 1, frac) // how many separate pushes
          const over = power * commitment
          this.warpCharge = Math.min(1, this.warpCharge + (dt / WARP_CHARGE_TIME) * over)
          this.warpHold = this.warpCharge >= 1 ? this.warpHold + dt : 0
        } else {
          this.warpCharge = Math.max(0, this.warpCharge - dt / WARP_DISCHARGE_TIME)
          this.warpHold = 0
        }
        if (this.warpHold >= WARP_HOLD_TIME) {
          this.inWormhole = true
          this.wormholeTime = 0
          console.info('[hero] wormhole: locked')
        }
      }
    }

    if (this.inWormhole) {
      this.stepWormhole(dt, camZ)
      return
    }

    // eased charge — drives every visible reaction, so the corridor springs
    // straight back the instant you ease off
    const c = this.warpCharge
    const cc = c * c * (3 - 2 * c)

    const fogTarget = armed ? THREE.MathUtils.lerp(TUNNEL_FOG_FAR, TUNNEL_FOG_FAR * 0.55, cc) : TUNNEL_FOG_INTRO
    fog.far += (fogTarget - fog.far) * (1 - Math.pow(0.02, dt))

    if (armed) {
      if (this.tunnelTime < 0) this.tunnelTime = 0
      this.tunnelTime += dt
      const expo = (x: number): number => (x >= 1 ? 1 : 1 - 2 ** (-6 * x))
      const warp = expo(THREE.MathUtils.clamp(this.tunnelTime / TUNNEL_WARP_TIME, 0, 1))
      const speed =
        THREE.MathUtils.lerp(TUNNEL_SPEED_WARP, TUNNEL_SPEED_IDLE, warp) +
        this.tunnelScroll * TUNNEL_SCROLL_BOOST +
        cc * WARP_CHARGE_SPEED
      let backZ = Infinity
      for (const m of this.galleryPhotos) if (m.position.z < backZ) backZ = m.position.z
      for (const m of this.galleryPhotos) {
        m.position.z += speed * dt
        if (m.position.z > camZ) {
          m.position.z = backZ - TUNNEL_SPACING
          backZ = m.position.z
        }
      }
    } else {
      this.tunnelTime = -1
    }

    // photos stretch gently and fade — radially, along their own direction from the
    // axis (not just "tall") — as the charge builds, dissolving into the dense
    // hyperspace streak field (stepStreaks) rather than becoming a big smeared bar
    for (const m of this.galleryPhotos) {
      const revealAt = m.userData.revealAt as number
      const mat = m.material as THREE.MeshBasicMaterial
      const reveal = THREE.MathUtils.smoothstep(this.revealClock, revealAt, revealAt + 0.4)
      // fully gone by WORM_STREAK_OFF, the moment the streaks start fading in — a
      // clean handoff, never both on screen at once
      mat.opacity = reveal * (1 - THREE.MathUtils.smoothstep(cc, 0.18, WORM_STREAK_OFF))
      if (!armed) m.position.z = m.userData.z0 as number
      const a = m.userData.ang as number
      m.position.x = Math.cos(a) * TUNNEL_RADIUS
      m.position.y = Math.sin(a) * TUNNEL_RADIUS
      m.rotation.z = a - Math.PI / 2 // "up" (the stretch axis) points radially outward
      const s0 = m.userData.s0 as THREE.Vector3
      m.scale.set(s0.x * (1 - cc * 0.5), s0.y * (1 + cc * 2.5), 1)
    }
    this.stepStreaks(dt, cc, camZ)
    this.stepTunnelItems(dt)
    this.stepFeatured(dt, camZ, armed)
    this.stepTexts(camZ, armed)

    // the vortex, far down the corridor: hidden at rest, and as the charge builds
    // it grows and comes closer — "vê um pequeno buraco de minhoca que vai crescendo
    // até chegar". At full charge it's about to swallow the view and the fall locks.
    const worm = this.wormTube!
    worm.visible = armed && cc > 0.004
    if (worm.visible) {
      this.wormSpin += dt * (WORM_SPIN_BASE + cc * 0.6) // spins faster as it energises
      // while it's still scroll-driven (manual), stay far — a single smooth curve,
      // no plateau-then-snap. Once autopilot takes over, switch to its OWN 0..1
      // progress (from the charge level at the moment it engaged, not the global
      // charge) eased evenly both ends, so the approach spends its whole automatic
      // stretch actually closing the gap instead of sitting far, then snapping
      // close, then idling right on top of it.
      let distT: number
      if (this.wormAuto) {
        const autoP = THREE.MathUtils.clamp(
          (this.warpCharge - this.wormAutoStartCharge) / (1 - this.wormAutoStartCharge),
          0,
          1,
        )
        distT = autoP * autoP * (3 - 2 * autoP)
      } else {
        distT = cc * cc * cc * cc * cc
      }
      this.placeWorm(
        camZ,
        THREE.MathUtils.lerp(WORM_DIST_FAR, WORM_DIST_NEAR, distT),
        THREE.MathUtils.lerp(WORM_SCALE_FAR, WORM_SCALE_NEAR, distT),
      )
      this.wormTubeMat!.uniforms.uGrow.value = cc
      this.wormTubeMat!.uniforms.uBloom.value = 0
    }

    this.setDoorFov(THREE.MathUtils.lerp(DOOR_FOV, DOOR_FOV + WARP_FOV_GAIN, cc))
  }

  /** the tunnel texts: parked one after another down the axis, brought toward the camera only
   *  by scroll (textTravel); each fades in as it comes within reading range and out as it
   *  reaches the camera. Once the last has gone by, textsDone — the wormhole can charge */
  private stepTexts(camZ: number, armed: boolean): void {
    const texts = this.galleryTexts
    if (!texts.length) return
    const reveal = THREE.MathUtils.smoothstep(this.revealClock, 0.3, 1.0)
    texts.forEach((m, i) => {
      const ahead = TEXT_FIRST + i * TEXT_GAP - this.textTravel // distance in front of the camera
      m.position.set((m.userData.side as number) * 1.4, i % 3 === 1 ? 0.6 : -0.4, camZ - ahead)
      const fadeIn = 1 - THREE.MathUtils.smoothstep(ahead, TEXT_GAP * 1.4, TEXT_GAP * 2.2)
      const fadeOut = THREE.MathUtils.smoothstep(ahead, 1.2, 4)
      const o = armed && !this.textsDone ? reveal * fadeIn * fadeOut : 0
      ;(m.material as THREE.MeshBasicMaterial).opacity = o
      m.visible = o > 0.002
    })
    if (!this.textsDone && TEXT_FIRST + (texts.length - 1) * TEXT_GAP - this.textTravel < 1.2) {
      this.textsDone = true // that was the last one
      console.info('[hero] tunnel texts: done — the wormhole can charge')
    }
  }

  /** the hyperspace streak field: hundreds of small dashes at their own radii,
   *  each advancing along z and recycling independently. Fades in across the
   *  WORM_STREAK_OFF..ON window as the charge builds, full strength during the
   *  fall (cc === 1 from stepWormhole). */
  private stepStreaks(dt: number, cc: number, camZ: number): void {
    const field = this.streakField
    const angle = this.streakAngle
    const radius = this.streakRadius
    const z = this.streakZ
    const len = this.streakLen
    if (!field || !angle || !radius || !z || !len) return

    const opacity = THREE.MathUtils.smoothstep(cc, WORM_STREAK_OFF, WORM_STREAK_ON)
    this.streakMat!.opacity = opacity
    field.visible = opacity > 0.003
    if (!field.visible) return

    const speed = WORM_STREAK_SPEED * (0.4 + cc * 2.6)
    const dummy = new THREE.Object3D()
    for (let i = 0; i < WORM_STREAK_COUNT; i++) {
      z[i] += speed * dt
      if (z[i] > camZ) z[i] -= WORM_STREAK_RANGE
      len[i] = WORM_STREAK_LEN_BASE + radius[i] * WORM_STREAK_LEN_RAD * (0.3 + cc * 1.4)
      dummy.position.set(Math.cos(angle[i]) * radius[i], Math.sin(angle[i]) * radius[i], z[i])
      dummy.rotation.set(0, 0, angle[i] - Math.PI / 2)
      dummy.scale.set(WORM_STREAK_WIDTH, len[i], 1)
      dummy.updateMatrix()
      field.setMatrixAt(i, dummy.matrix)
    }
    field.instanceMatrix.needsUpdate = true
  }

  /** sit the galaxy disc `dist` ahead of the camera, leaning back by WORM_TILT and
   *  spun to wormSpin about its own axis (the reference model's "Plane rotating") */
  private placeWorm(camZ: number, dist: number, scale: number): void {
    const w = this.wormTube!
    w.position.set(this.doorCam.position.x, this.doorCam.position.y, camZ - dist)
    w.rotation.set(WORM_TILT, 0, this.wormSpin)
    w.scale.setScalar(scale)
  }

  /** the automatic fall through the throat, once the vortex has grown to fill the
   *  view. Scroll is ignored: the vortex rushes the last of the way in and blooms
   *  to white while the photos are pulled into the centre, then it's the other
   *  side — undefined for now, so it holds on black. */
  private stepWormhole(dt: number, camZ: number): void {
    this.wormholeTime += dt
    const t = this.wormholeTime
    const fog = this.doorScene.fog as THREE.Fog
    const worm = this.wormTube!
    const flash = this.wormFlash!

    fog.far += (400 - fog.far) * (1 - Math.pow(0.02, dt)) // let the void open right up

    // disorienting roll as you go through (set before anything copies the camera orientation)
    this.doorCam.rotation.z = Math.sin(t * 1.1) * 0.18 + t * 0.35
    this.setDoorFov(DOOR_FOV + WARP_FOV_GAIN)

    // the disc closes the last of the distance, spins up and blooms
    const k = THREE.MathUtils.smoothstep(t, 0, WORMHOLE_DURATION)
    worm.visible = t < WORMHOLE_DURATION - 0.1
    if (worm.visible) {
      this.wormSpin += dt * (1.4 + k * 5.0)
      this.placeWorm(camZ, THREE.MathUtils.lerp(WORM_DIST_NEAR, 1.2, k * k), THREE.MathUtils.lerp(WORM_SCALE_NEAR, WORM_SCALE_NEAR * 2.6, k))
      const mat = this.wormTubeMat!
      mat.uniforms.uGrow.value = 1
      mat.uniforms.uBloom.value = THREE.MathUtils.smoothstep(t, WORMHOLE_DURATION - 1.6, WORMHOLE_DURATION - 0.3)
    } else if (this.gallery.visible) {
      this.gallery.visible = false
    }

    // photos pulled into the centre and gone — the hyperspace streak field (below)
    // is the only thing selling speed by now, photos are already invisible
    const suck = THREE.MathUtils.smoothstep(t, 0, 1.1)
    for (const m of this.galleryPhotos) {
      const a = (m.userData.ang as number) + dt * (2 + suck * 7)
      m.userData.ang = a
      const r = TUNNEL_RADIUS * (1 - suck) * (1 - suck)
      m.position.x = Math.cos(a) * r
      m.position.y = Math.sin(a) * r
      m.position.z += (200 + suck * WORMHOLE_SPEED * 2) * dt
      m.rotation.z = a - Math.PI / 2
      ;(m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - suck * 1.3)
    }
    this.stepTunnelItems(dt)
    this.stepStreaks(dt, 1, camZ)

    // /hero-worm: warm the destination page's files as soon as the fall starts, so the jump
    // at the white peak doesn't land on a loading screen
    if (this.wormTo && !this.wormPrefetched) {
      this.wormPrefetched = true
      for (const href of [this.wormTo, ...this.wormPrefetch]) {
        const l = document.createElement('link')
        l.rel = 'prefetch'
        l.href = href
        document.head.appendChild(l)
      }
    }
    // ...and at the white peak, through to it
    if (this.wormTo && !this.wormLeaving && t >= WORMHOLE_DURATION - 0.1) {
      this.wormLeaving = true
      window.location.href = this.wormTo
    }

    // hard white at the peak of the bloom, then fall away into the chapter tunnel
    flash.visible = true
    flash.quaternion.copy(this.doorCam.quaternion)
    flash.position.set(this.doorCam.position.x, this.doorCam.position.y, this.doorCam.position.z - 0.5)
    const up = THREE.MathUtils.smoothstep(t, WORMHOLE_DURATION - 0.7, WORMHOLE_DURATION - 0.15)
    const down = THREE.MathUtils.smoothstep(t, WORMHOLE_DURATION - 0.05, WORMHOLE_DURATION + 0.9)
    // (leaving for another page: hold the white while it loads — that page starts on white)
    ;(flash.material as THREE.MeshBasicMaterial).opacity = this.wormLeaving ? 1 : Math.max(0, up - down)

    if (t >= WORMHOLE_DURATION + 0.9) {
      flash.visible = false
      if (!this.arrived) {
        this.arrived = true
        this.inTunnel = true
        this.tunnelSeqTime = 0
        this.gallery.visible = false
        console.info('[hero] wormhole: arrived — entering the chapter tunnel')
      }
    }
  }

  private setDoorFov(fov: number): void {
    if (Math.abs(this.doorCam.fov - fov) < 0.05) return
    this.doorCam.fov = fov
    this.doorCam.updateProjectionMatrix()
  }

  private hasFocus(): boolean {
    return this.active > 0.001 || this.pointerInside
  }

  // ---- events --------------------------------------------------
  private onPointerMove = (e: PointerEvent): void => {
    this.target.set(e.clientX / this.W, 1 - e.clientY / this.H)
    this.pointerInside = true
    this.active = Math.max(this.active, 0.02)
  }

  private onPointerDown = (): void => {
    this.down = 1
  }

  private onPointerUp = (): void => {
    this.down = 0
  }

  private onLeave = (): void => {
    this.pointerInside = false
  }

  /** scroll is inert until the cookie banner is answered */
  private locked = true
  private scrollAfter = false
  private released = false // (scrollAfter) the page scrolling on, past the hero

  /** (scrollAfter) the page takes over the scroll: the hero becomes the top of an ordinary page */
  private release(): void {
    this.released = true
    const stage = this.canvas.parentElement
    if (stage) {
      // its height pinned to what it is now: let go of the window's bottom, it would have stretched to
      // the whole page's height for a frame (a resize, a redraw: the flash before the scroll moved on)
      stage.style.height = `${stage.getBoundingClientRect().height}px`
      stage.style.bottom = 'auto'
      stage.style.position = 'absolute'
    }
    // (the window scrolls, not the body: its fixed 100% height let it scroll inside itself instead)
    for (const el of [document.documentElement, document.body]) {
      el.style.height = 'auto'
      el.style.overflow = 'visible'
    }
  }

  /** (scrollAfter) back at the top, scrolling up: the hero holds the scroll again */
  private hold(): void {
    this.released = false
    const stage = this.canvas.parentElement
    if (stage) {
      stage.style.position = ''
      stage.style.height = ''
      stage.style.bottom = ''
    }
    window.scrollTo(0, 0)
    for (const el of [document.documentElement, document.body]) {
      el.style.height = ''
      el.style.overflow = ''
    }
  }

  /** called by the cookie banner once the visitor picks cookies or crackers */
  unlock(): void {
    this.locked = false
  }

  /** DEV ONLY — skips straight to the approach (past the wormhole and the chapter
   *  tunnel), so it's not a full replay every time just to look at the ending.
   *  Wired to a URL param in main.ts; remove both when this stops being useful. */
  jumpToApproach(): void {
    this.locked = false
    this.manual = 1
    this.progressTarget = 1
    this.progress = 1
    this.inWormhole = false
    this.inTunnel = false
    this.inApproach = true
    this.approachTime = 0
    this.gallery.visible = false
    if (this.wormTube) this.wormTube.visible = false
    if (this.beyondTube) this.beyondTube.visible = false
  }

  /** counts a scroll "push" toward the wormhole charge — a gap of WORM_GESTURE_GAP
   *  since the last qualifying input means this is a NEW push, not a continuation
   *  of the same scroll. One long scroll only ever counts as a single push, however
   *  fast or long it runs. Uses wall-clock time — never the render clock, which
   *  frame() alone is allowed to advance. */
  private notePulse(): void {
    const now = performance.now() / 1000
    if (this.lastPulseTime < 0 || now - this.lastPulseTime > WORM_GESTURE_GAP) {
      this.wormPulses = Math.min(WORM_GESTURE_NEEDED + 2, this.wormPulses + 1)
    }
    this.lastPulseTime = now
  }

  private onWheel = (e: WheelEvent): void => {
    if (this.locked || this.inWormhole) return
    if (this.paperOn && !this.behindDone) return
    if (this.manual >= 1) {
      if (this.paper && !this.behindDone) return
      // hero scroll is spent — every flick (either direction) feeds the tunnel speed
      // AND charges the wormhole; decays fast, so the RATE of flicking sets both.
      this.tunnelScroll = Math.min(6, this.tunnelScroll + Math.abs(e.deltaY) * 0.0016)
      // the texts move only with scroll (both ways); while any is left, no wormhole pushes count
      if (!this.textsDone) this.advanceTexts(e.deltaY)
      else if (Math.abs(e.deltaY) > 4) this.notePulse()
      return
    }
    if (this.scrollAfter) {
      // past the hero the page scrolls itself; at its top, scrolling up gives the hero the scroll back
      if (this.released) {
        if (window.scrollY <= 0 && e.deltaY < 0) this.hold()
        return
      }
      if (this.manual >= FREEZE_P - 1e-4 && e.deltaY > 0 && this.progress >= FREEZE_P - 0.01) return this.release()
      this.manual = THREE.MathUtils.clamp(this.manual + e.deltaY / 2600, 0, FREEZE_P)
      this.progressTarget = this.manual
      return
    }
    this.manual = THREE.MathUtils.clamp(this.manual + e.deltaY / 2600, 0, 1)
    this.progressTarget = this.manual
  }

  /** scroll moves the texts — only once the tunnel is in view (the scroll that opened the doors
   *  doesn't carry over), and each notch by at most TEXT_STEP_MAX so a hard flick can't skip one */
  private advanceTexts(deltaPx: number): void {
    if (this.progress < TUNNEL_ARM_P || this.revealClock < 0.8) return
    const d = THREE.MathUtils.clamp(deltaPx * TEXT_PER_PX, -TEXT_STEP_MAX, TEXT_STEP_MAX)
    this.textTravel = Math.max(0, this.textTravel + d)
  }

  private onScroll = (): void => {
    if (this.locked || this.scrollAfter) return
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
    this.progressTarget = THREE.MathUtils.clamp(Math.max(window.scrollY / max, this.manual), 0, 1)
  }

  private onKey = (e: KeyboardEvent): void => {
    if (this.locked || this.inWormhole) return
    if (this.paperOn && !this.behindDone) return
    const step: Record<string, number> = { ArrowDown: 0.07, PageDown: 0.22, ' ': 0.22, ArrowUp: -0.07, PageUp: -0.22 }
    const s = step[e.key]
    if (s === undefined) return
    if (this.manual >= 1) {
      if (this.paper && !this.behindDone) return
      this.tunnelScroll = Math.min(6, this.tunnelScroll + Math.abs(s) * 3)
      if (!this.textsDone) this.advanceTexts(s * 900)
      else this.notePulse()
      return
    }
    this.manual = THREE.MathUtils.clamp(this.manual + s, 0, 1)
    this.progressTarget = this.manual
  }

  /** extrusion of "GENERIC." per sign style */
  private signShape(size: number) {
    switch (this.sign) {
      case 'matte':
        // straight cut, no chamfer: a flat-faced block
        return { depth: size * LETTER_DEPTH, curveSegments: 6, bevelEnabled: false, bevelThickness: 0, bevelSize: 0, bevelSegments: 0 }
      default:
        return { depth: size * LETTER_DEPTH, curveSegments: 5, bevelEnabled: true, bevelThickness: size * 0.018, bevelSize: size * 0.018, bevelSegments: 2 }
    }
  }

  private weShape(weSize: number) {
    switch (this.sign) {
      case 'matte':
        return { depth: weSize * 0.16, curveSegments: 4, bevelEnabled: false, bevelThickness: 0, bevelSize: 0, bevelSegments: 0 }
      default:
        return { depth: weSize * 0.16, curveSegments: 4, bevelEnabled: true, bevelThickness: weSize * 0.03, bevelSize: weSize * 0.03, bevelSegments: 1 }
    }
  }

  /** hand `mesh`'s rest (doors-shut) world matrix to whichever reveal material draws it */
  private pinRest(mesh: THREE.Mesh): void {
    mesh.onBeforeRender = (_r, _s, _c, _g, material) => {
      const u = (material as THREE.ShaderMaterial).uniforms?.uRestModel as THREE.IUniform<THREE.Matrix4> | undefined
      if (!u) return
      const ud = mesh.userData as { rest?: THREE.Matrix4 }
      if (this.restLive || !ud.rest) ud.rest = (ud.rest ?? new THREE.Matrix4()).copy(mesh.matrixWorld)
      u.value.copy(ud.rest)
      ;(material as THREE.ShaderMaterial).uniformsNeedUpdate = true
    }
  }

  /** "We are" dodges the cursor: each letter is pushed away from it (harder the closer it
   *  gets), on an underdamped spring — a little hop aside, and back with a wobble */
  private stepWeAre(dt: number, doorsShut: boolean): void {
    const R = 110 // px: reach of the cursor
    const PUSH = 75 // px: how far a letter jumps at point-blank
    const K = 260 // spring stiffness
    const C = 13 // damping (< 2*sqrt(K) ~ 32: some overshoot)
    const mx = this.target.x * this.W
    const my = (1 - this.target.y) * this.H
    const on = this.pointerInside && doorsShut
    const h = Math.min(dt, 1 / 30)
    const xs: number[] = []
    for (const L of this.weLetters) {
      // the letter's screen position at home (the push is computed from where it belongs, so
      // it doesn't run away from its own displacement)
      const v = this._weV.copy(L.home)
      L.mesh.parent!.localToWorld(v).project(this.doorCam)
      const lx = (v.x * 0.5 + 0.5) * this.W
      const ly = (1 - (v.y * 0.5 + 0.5)) * this.H
      xs.push(v.x)
      let tx = 0
      let ty = 0
      const dx = lx - mx
      const dy = ly - my
      const d = Math.hypot(dx, dy)
      if (on && d < R) {
        const f = Math.pow(1 - d / R, 1.5) * PUSH
        const ux = d > 0.5 ? dx / d : 0
        const uy = d > 0.5 ? dy / d : -1
        // sideways and up only: pushed down, a letter would dive into the G below it
        tx = ux * f
        ty = -Math.abs(uy) * f * 0.6
      }
      // spring (px, screen y down)
      L.vel.x += (K * (tx - L.off.x) - C * L.vel.x) * h
      L.vel.y += (K * (ty - L.off.y) - C * L.vel.y) * h
      L.off.x += L.vel.x * h
      L.off.y += L.vel.y * h
      // a tilt that follows the sideways motion
      const tr = THREE.MathUtils.clamp(-L.vel.x * 0.0012, -0.45, 0.45)
      L.rotV += (K * (tr - L.rot) - C * L.rotV) * h
      L.rot += L.rotV * h
      // while it's away from home it also comes forward, clear of GENERIC's thicker letters
      const lift = Math.min(Math.hypot(L.off.x, L.off.y) / 30, 1) * this.weLift
      L.mesh.position.set(L.home.x + L.off.x * this.wePxToWorld, L.home.y - L.off.y * this.wePxToWorld, L.home.z + lift)
      L.mesh.rotation.z = L.rot
    }
    // (their sound: each one's leap and return)
    try {
      this.weSound.update(this.weLetters, xs)
    } catch {
      // (a sound never stops the letters)
    }
  }

  /** where each glyph of "GENERIC." lands on screen (doors closed): x from the font's own
   *  advances, cap top / baseline from the E, projected through the door camera */
  private layoutLetterSwap(size: number, centre: THREE.Vector2, yOff: number, zFront: number): void {
    const font = this.fonts!.bold
    const data = font.data as unknown as { resolution: number; glyphs: Record<string, { ha: number; x_min: number; x_max: number }> }
    const k = size / data.resolution
    const e = new TextGeometry('E', { font, size, depth: 0.001, bevelEnabled: false })
    e.computeBoundingBox()
    const capTop = e.boundingBox!.max.y
    e.dispose()
    const cx = centre.x
    const cy = centre.y
    const dist = DOOR_CAM_Z - zFront
    const tan = Math.tan(THREE.MathUtils.degToRad(DOOR_FOV / 2))
    const toX = (x: number) => (x / (dist * tan * (this.W / this.H)) * 0.5 + 0.5) * this.W
    const toY = (y: number) => (1 - (y / (dist * tan) * 0.5 + 0.5)) * this.H
    const slots: Slot[] = []
    let off = 0
    for (const ch of 'GENERIC.') {
      const g = data.glyphs[ch]
      slots.push({
        cx: toX(off + ((g.x_min + g.x_max) / 2) * k - cx),
        top: toY(capTop - cy + yOff),
        bottom: toY(0 - cy + yOff),
      })
      off += g.ha * k
    }
    this.letterSwap!.layout(this.W, this.H, slots)
    this.reveal.setSource(this.letterSwap!.texture, this.W / this.H)
  }

  private onResize = (): void => {
    const box = this.canvas.getBoundingClientRect()
    const w = Math.max(1, box.width)
    const h = Math.max(1, box.height - OVERSCAN)
    if (Math.abs(w - this.W) < 0.5 && Math.abs(h - this.H) < 0.5) return
    this.W = w
    this.H = h
    this.dpr = Math.min(window.devicePixelRatio, 2)
    this.renderer.setPixelRatio(this.dpr)
    this.renderer.setSize(box.width, box.height, false)
    this.renderer.setViewport(0, 0, this.W, this.H)
    const [bw, bh] = this.bufSize()
    this.heroRT.setSize(bw, bh)
    this.drawn?.resize(this.W, this.H, this.dpr)
    this.clearTargets()
    this.heroMat.uniforms.uResolution.value.set(bw, bh)
    this.heroMat.uniforms.uViewAspect.value = bw / bh
    this.beyondMat?.uniforms.uResolution.value.set(bw, bh)
    this.doorCam.aspect = this.W / this.H
    this.doorCam.updateProjectionMatrix()
    this.buildDoors()
    this.layoutLetters()
    this.crumbs.layout(this.W / this.H)
  }
}

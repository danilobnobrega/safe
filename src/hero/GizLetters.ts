import * as THREE from 'three'
import opentype from 'three/examples/jsm/libs/opentype.module.js'
import { Font } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import { Drawn, DRAWN_GLSL } from './Drawn'

const LAB_LAYER = 6 // (in the hero) these letters' own outline pass

/**
 * TEST (/hero-hovers-giz.html): the hover lab's letters as the main hero's chalk ("giz") sign — every
 * letter of "GENERIC." an extruded 3D glyph drawn by Drawn.ts, following the 2D engine's letter
 * (position, turn, size) all the time, hover or not; "We are" too. The letters' fonts come as TTF
 * (public/fonts/giz, Google Fonts' OFL files), only the glyphs the sign uses read out of each.
 *
 * What a hover can ask of a letter, per frame (Letter.fx): hide it, show its wireframe, replace its
 * outline (bézier), draw it at a low resolution (progressive loading: pixels, then blur), or show a
 * reel of two glyphs clipped to a window (font roulette).
 */
const CAM_Z = 4 // the hero's door camera
const FOV = 50
const SIZE = 0.72 // a TextGeometry `size` of 0.72 is one em (TTF glyphs come out 100000/72 per em at resolution 1000)
const DEPTH = SIZE * 0.17 // the hero's LETTER_DEPTH, per its size
const CHARS = 'GENERICgeneric.'

export type FontKey = string // `${face}|${weight}|${italic ? 1 : 0}`
export const fontKey = (f: number, w: number, it: boolean): FontKey => `${f}|${w}|${it ? 1 : 0}`

/** what a hover asks of one letter this frame */
export type Fx = {
  hide?: boolean
  wire?: number // 0..1
  shape?: { key: number; build: () => THREE.Shape[] } // a replaced outline, rebuilt when key changes
  // drawn at a low resolution: `block` css px per texel (smooth = blurred instead of blocky); with
  // `split` (screen y, css px), the rows above it at `fine` instead — a progressive scan sweeping down;
  // `block` < 0: nothing below the split yet
  pixel?: { block: number; smooth: boolean; fine?: number; split?: number }
  // the letter rebuilt from chalk cubes (3D pixels): `block` em per cube (< 0: none yet), and above
  // `split` (screen y, css px) the finer `fine` — a scan sweeping down; `gap`: cubes apart (× block)
  voxel?: { block: number; fine: number; split: number; gap: number }
  reel?: { items: { font: FontKey; text: string; dx: number; dy: number }[]; y0: number; y1: number } // local px offsets; window in screen px
  tilt?: { x: number; y: number; pivot: 'base' | 'center' } // 3D turns (radians) about the glyph's baseline or centre
  jelly?: { phi: number; sx: number; sy: number; sz: number } // squash along `phi` (canvas angle), anchored on the baseline
  dz?: number // toward the camera, in em (piled letters don't fight for the same depth)
}
/** what the renderer needs of a 2D letter */
export type LetterView = {
  font: FontKey
  text: string
  px: number // its font size, px
  cx: number // its pivot on screen (glyph centre), px
  cy: number
  adv: number // advance and ascent at px, unscaled
  asc: number
  rot: number // canvas turn (clockwise)
  scale: number // draw scale
  fx: Fx
  css?: (px: number) => string // its font as CSS, at px (the cubes rasterise the glyph with it)
}

/** a glyph as chalk cubes: one box per covered cell, faces ordered row by row from the top so a draw
 *  range shows the rows down to any line; rowStart[j] = the first vertex of row j (and the end) */
type Vox = { geo: THREE.BufferGeometry; rowStart: number[]; top: number; block: number }

const VERT = /* glsl */ `
  varying vec3 vViewN;
  varying vec4 vClip;
  void main() {
    vViewN = normalize(normalMatrix * normal);
    vClip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = vClip;
  }`
const FRAG = /* glsl */ `
  precision highp float;
  uniform vec2 uClipY; // device px from the bottom: drawn only between
  uniform vec4 uSuvMap;
  varying vec3 vViewN;
  varying vec4 vClip;
  ${DRAWN_GLSL}
  void main() {
    if (gl_FragCoord.y < uClipY.x || gl_FragCoord.y > uClipY.y) discard;
    vec2 suv = (vClip.xy / vClip.w) * 0.5 + 0.5;
    suv = uSuvMap.xy + suv * uSuvMap.zw; // (a letter drawn alone into its patch: back to its place on the screen)
    gl_FragColor = vec4(drawnColor(suv, normalize(vViewN)), 1.0);
  }`

/**
 * The wall behind the letters, as the main hero has it (the door's face, drawn too): on the main page
 * the outline's second, sketchier stroke is knocked up to 8 px sideways and lands on that wall around
 * every letter — the grey strokes that tremble next to "We are" and "GENERIC.". Here the paper is the
 * 2D canvas underneath, so the wall draws only those strokes (ink where the edge is, clear elsewhere).
 * Not part of the outline pass (it isn't a drawn object's edge, only where edges show).
 */
export function drawnWall(drawn: Drawn): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    uniforms: { ...drawn.uniforms },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vViewN;
      varying vec4 vClip;
      ${DRAWN_GLSL}
      void main() {
        vec2 suv = (vClip.xy / vClip.w) * 0.5 + 0.5;
        // lighter than a full stroke: here nothing sits close behind the letters (the main hero has
        // the door's face), so the edge finder sees a far bigger depth jump and draws the strokes
        // heavier than the main page does — WALL_INK brings them back to a clear read
        float ink = drawnEdge(suv) * ${WALL_INK.toFixed(2)};
        gl_FragColor = vec4(D_INK * ink, ink);
      }`,
  })
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
  wall.position.z = WALL_Z
  wall.renderOrder = -1
  return wall
}
const WALL_Z = -0.4 // behind the deepest letter
const WALL_INK = 1 // the sketchy strokes' strength (1 = full graphite)
/** size the wall to fill the view at its depth */
export function fitWall(wall: THREE.Mesh, aspect: number): void {
  const h = 2 * (CAM_Z - WALL_Z) * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * 1.05
  wall.scale.set(h * aspect, h, 1)
}

/** the low-resolution letters' look (/hero-hovers-pixels.html tries them): 0 mosaic, 1 pixel art,
 *  2 1-bit, 3 dither, 4 halftone, 5 tiles */
export const PIX = { mode: 1 }

/** where a material's screen coordinates land on the screen: identity, except while one letter is
 *  drawn alone into its patch (its outline and hatching read the screen-sized drawing passes) */
const SUV_MAP = { value: new THREE.Vector4(0, 0, 1, 1) }

/** a letter to draw at low resolution, and its patch of the screen (css px) */
type Pix = { s: Slot; fx: NonNullable<Fx['pixel']>; cx: number; cy: number; r: number }

type Slot = {
  group: THREE.Group
  jelly: THREE.Group // rotated to the squash direction
  jS: THREE.Group // the squash
  jI: THREE.Group // rotated back
  tilt: THREE.Group // the 3D turn, about its pivot
  mesh: THREE.Mesh
  wire: THREE.LineSegments
  wireOf: THREE.BufferGeometry | null
  reel: THREE.Mesh[]
  vox: THREE.Mesh[] // [coarse, fine]
  custom: { key: number; geo: THREE.BufferGeometry } | null
}

/** the hero's cursor holes (RevealMask), to cut through these letters as through its own */
export type GizReveal = { glsl: string; uniforms: Record<string, THREE.IUniform>; restOn: THREE.IUniform; restVP: THREE.IUniform }
/** someone else's scene to live in (the hero's door scene): it renders, these letters only move */
export type GizHost = { renderer: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera; drawn: Drawn; dpr: number; camZ: number; reveal?: GizReveal }

// (in the hero, with its holes) the letters' shaders cut by them: the screen point, or — on the hero's
// own sign while the cubes turn — where that point stood at rest, so the holes ride the faces
const VERT_R = /* glsl */ `
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
  }`
const fragR = (revealGlsl: string) => /* glsl */ `
  precision highp float;
  uniform vec2 uClipY;
  uniform vec4 uSuvMap;
  uniform float uRestOn;
  uniform float uUseRest;
  uniform float uNoReveal;
  varying vec3 vViewN;
  varying vec4 vClip;
  varying vec4 vRestClip;
  ${revealGlsl}
  ${DRAWN_GLSL}
  void main() {
    if (gl_FragCoord.y < uClipY.x || gl_FragCoord.y > uClipY.y) discard;
    vec2 suv = (vClip.xy / vClip.w) * 0.5 + 0.5;
    suv = uSuvMap.xy + suv * uSuvMap.zw; // (a letter drawn alone into its patch: back to its place on the screen)
    vec3 col = drawnColor(suv, normalize(vViewN));
    vec2 rsuv = uUseRest > 0.5 && uRestOn > 0.5 ? (vRestClip.xy / vRestClip.w) * 0.5 + 0.5 : suv;
    if (uNoReveal < 0.5) col = revealApply(col, rsuv);
    gl_FragColor = vec4(col, 1.0);
  }`

export class GizLetters {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private cam: THREE.PerspectiveCamera
  readonly root = new THREE.Group()
  private drawn: Drawn
  private host: GizHost | null = null
  private camZ = CAM_Z
  private frontZ = 0
  private pending: Pix[] = []
  private mat: THREE.ShaderMaterial
  private wireMat = new THREE.LineBasicMaterial({ color: 0x121212, transparent: true, opacity: 1 })
  private fonts = new Map<FontKey, Font>()
  private geos = new Map<string, THREE.BufferGeometry>()
  private slots: Slot[] = []
  private we?: THREE.Mesh
  private wall: THREE.Mesh
  private W = 1
  private H = 1
  private upp = 1 // world units per css px on z = 0 (the letters' front faces)
  private quadScene = new THREE.Scene()
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private quadMat: THREE.ShaderMaterial
  private ray = new THREE.Raycaster()
  ready = false

  constructor(target: HTMLCanvasElement | GizHost, private dpr: number) {
    if (target instanceof HTMLCanvasElement) {
      this.renderer = new THREE.WebGLRenderer({ canvas: target, alpha: true, antialias: true })
      this.renderer.setPixelRatio(dpr)
      this.renderer.setClearColor(0x000000, 0)
      this.scene = new THREE.Scene()
      this.cam = new THREE.PerspectiveCamera(FOV, 1, 0.05, 100)
      this.cam.position.set(0, 0, CAM_Z)
      this.drawn = new Drawn(this.renderer, 1, 1, dpr)
    } else {
      // inside the hero: its renderer, door scene and camera — but drawn exactly as on their own page:
      // their own outline pass (only the letters, nothing behind them) and the stand-in wall's strokes,
      // laid just in front of the door's face
      this.host = target
      this.renderer = target.renderer
      this.scene = target.scene
      this.cam = target.cam
      this.camZ = target.camZ
      this.dpr = target.dpr
      this.drawn = new Drawn(this.renderer, 1, 1, this.dpr)
    }
    this.scene.add(this.root)
    this.mat = this.makeMat()
    this.wall = drawnWall(this.drawn)
    if (!this.host) this.scene.add(this.wall)
    // the low-resolution look: the letter drawn alone, just its patch of the screen, into a small
    // mipmapped target, then laid back on the screen read through the mips — one sample per block
    // (blocks on the screen's own grid, so they don't swim) or plain (blur)
    this.quadMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      transparent: true,
      premultipliedAlpha: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTex: { value: null as THREE.Texture | null },
        uRect: { value: new THREE.Vector4() }, // the patch, device px from the bottom left: x, y, w, h
        uNdc: { value: new THREE.Vector4() }, // the same, in clip space: x0, y0, x1, y1
        uBlock: { value: 1 },
        uFine: { value: 1 },
        uSplit: { value: -1e9 }, // device px from the bottom: above it, uFine
        uSnap: { value: 1 },
        uEdge: { value: 2 }, // the pixels' outline, device px
        uMode: { value: 1 }, // the pixels' look (see PIX)
      },
      vertexShader: `uniform vec4 uNdc;
        void main() { vec2 t = position.xy * 0.5 + 0.5; gl_Position = vec4(mix(uNdc.xy, uNdc.zw, t), 0.0, 1.0); }`,
      fragmentShader: `precision highp float;
        uniform sampler2D uTex; uniform vec4 uRect; uniform float uBlock; uniform float uFine; uniform float uSplit; uniform float uSnap; uniform float uEdge; uniform float uMode;
        out vec4 outColor;
        void main() {
          vec2 p = gl_FragCoord.xy;
          float b = p.y > uSplit ? uFine : uBlock;
          if (b < 0.0) discard;
          b = max(b, 1.0);
          if (uSnap < 0.5) {
            // blur: the letter read through its mips, as soft as the block is big
            vec2 uv = (p - uRect.xy) / uRect.zw;
            if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) discard;
            outColor = textureLod(uTex, uv, log2(b));
            return;
          }
          vec2 cell = floor(p / b);
          float lod = log2(b);
          vec2 uv = ((cell + 0.5) * b - uRect.xy) / uRect.zw;
          if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) discard;
          vec4 c = textureLod(uTex, uv, lod);
          vec3 rgb = c.rgb / max(c.a, 1e-3);
          float lum = dot(rgb, vec3(0.299, 0.587, 0.114));
          vec2 f = p - cell * b; // where in the block, device px
          const vec3 INKC = vec3(0.071);
          const vec3 PAP = vec3(0.937, 0.930, 0.902);
          if (uMode < 0.5) {
            // 0 · mosaic: each block the letter's own average, crisp — a picture at a low resolution
            outColor = c;
            return;
          }
          if (uMode < 1.5) {
            // 1 · pixel art: blocks on where the letter is, outlined in graphite where they meet the outside
            if (c.a < 0.42) discard;
            vec3 col = lum < 0.3 ? INKC : PAP;
            vec2 d = b / uRect.zw;
            float offL = step(textureLod(uTex, uv - vec2(d.x, 0.0), lod).a, 0.42);
            float offR = step(textureLod(uTex, uv + vec2(d.x, 0.0), lod).a, 0.42);
            float offD = step(textureLod(uTex, uv - vec2(0.0, d.y), lod).a, 0.42);
            float offU = step(textureLod(uTex, uv + vec2(0.0, d.y), lod).a, 0.42);
            float e = uEdge;
            float edge = max(max(offL * step(f.x, e), offR * step(b - f.x, e)), max(offD * step(f.y, e), offU * step(b - f.y, e)));
            outColor = vec4(mix(col, INKC, edge), 1.0);
            return;
          }
          if (uMode < 2.5) {
            // 2 · 1-bit: solid graphite blocks, the letter's silhouette
            if (c.a < 0.42) discard;
            outColor = vec4(INKC, 1.0);
            return;
          }
          if (uMode < 3.5) {
            // 3 · dither: ordered (Bayer 4×4) on how much letter and how dark, one dot per block
            int ix = int(mod(cell.x, 4.0));
            int iy = int(mod(cell.y, 4.0));
            int bay[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
            float th = (float(bay[iy * 4 + ix]) + 0.5) / 16.0;
            float ink = c.a * (0.55 + 0.45 * (1.0 - lum));
            if (ink < th) discard;
            outColor = vec4(INKC, 1.0);
            return;
          }
          if (uMode < 4.5) {
            // 4 · halftone: a round dot per block, as big as the letter is there — print, not screen
            if (c.a < 0.06) discard; // (no specks where there's no letter)
            float r = 0.5 * b * sqrt(clamp(c.a * (0.65 + 0.35 * (1.0 - lum)), 0.0, 1.0)) * 1.08;
            float dd = length(f - 0.5 * b);
            float a = 1.0 - smoothstep(r - 0.75, r + 0.75, dd);
            if (a < 0.01) discard;
            outColor = vec4(INKC * a, a);
            return;
          }
          // 5 · tiles: each block a little raised paper tile, lit from the top left
          if (c.a < 0.42) discard;
          float e = max(1.0, b * 0.14);
          vec3 col = lum < 0.3 ? mix(INKC, PAP, 0.18) : PAP;
          if (f.x < e || b - f.y < e) col = mix(col, vec3(1.0), 0.55);
          if (b - f.x < e || f.y < e) col = mix(col, INKC, 0.55);
          if (f.x < 1.0 || f.y < 1.0) col = mix(col, INKC, 0.25);
          outColor = vec4(col, 1.0);
        }`,
    })
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.quadMat))
  }

  /** a letter material; its clip window is its own (the reel's), the shared look isn't */
  /** `rest`: on the hero's own sign (the holes ride its faces as the cubes turn); `noReveal`: never cut
   *  (the moving "We are", as the hero's dodging one) */
  private makeMat(o: { rest?: boolean; noReveal?: boolean } = {}): THREE.ShaderMaterial {
    const rv = this.host?.reveal
    return new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      polygonOffset: true, // the faces a hair back, so a wireframe on them wins
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
      uniforms: {
        ...this.drawn.uniforms,
        uClipY: { value: new THREE.Vector2(-1e9, 1e9) },
        uSuvMap: SUV_MAP,
        ...(rv
          ? { ...rv.uniforms, uRestOn: rv.restOn, uRestVP: rv.restVP, uRestModel: { value: new THREE.Matrix4() }, uUseRest: { value: o.rest ? 1 : 0 }, uNoReveal: { value: o.noReveal ? 1 : 0 } }
          : {}),
      },
      vertexShader: rv ? VERT_R : VERT,
      fragmentShader: rv ? fragR(rv.glsl) : FRAG,
    })
  }
  private adoptMats = new WeakMap<THREE.Mesh, THREE.ShaderMaterial>()

  has(k: FontKey): boolean {
    return this.fonts.has(k)
  }

  /** one TTF -> a three Font holding only the sign's glyphs (TTFLoader converts every glyph: slow) */
  private async loadFont(k: FontKey, url: string, chars: string): Promise<void> {
    const buf = await (await fetch(url)).arrayBuffer()
    const font = opentype.parse(buf)
    const scale = 100000 / ((font.unitsPerEm || 2048) * 72)
    const r = (v: number) => Math.round(v * scale)
    const glyphs: Record<string, { ha: number; x_min: number; x_max: number; o: string }> = {}
    for (const ch of new Set(chars)) {
      const g = font.charToGlyph(ch)
      let o = ''
      for (const c of g.path.commands as { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }[]) {
        const t = c.type.toLowerCase() === 'c' ? 'b' : c.type.toLowerCase()
        o += t + ' '
        if (c.x !== undefined && c.y !== undefined) o += `${r(c.x)} ${r(c.y)} `
        if (c.x1 !== undefined && c.y1 !== undefined) o += `${r(c.x1)} ${r(c.y1)} `
        if (c.x2 !== undefined && c.y2 !== undefined) o += `${r(c.x2)} ${r(c.y2)} `
      }
      glyphs[ch] = { ha: r(g.advanceWidth ?? 0), x_min: r(g.xMin ?? 0), x_max: r(g.xMax ?? 0), o }
    }
    type FontData = ConstructorParameters<typeof Font>[0]
    this.fonts.set(k, new Font({ glyphs, resolution: 1000, familyName: font.names.fontFamily?.en ?? '', boundingBox: { yMin: 0, xMin: 0, yMax: 0, xMax: 0 }, underlineThickness: 0 } as unknown as FontData))
  }

  /** the home font + "We are" first (ready after these), then every other face in the background */
  async load(faces: { fam: string; weights: number[]; italic: boolean }[]): Promise<void> {
    const base = `${import.meta.env.BASE_URL}fonts/giz/`
    const file = (f: number, w: number, it: boolean) => `${base}${faces[f].fam.replace(/ /g, '')}-${w}${it ? 'i' : ''}.ttf`
    await Promise.all([this.loadFont(fontKey(0, 700, false), file(0, 700, false), CHARS), this.loadFont('we', file(0, 400, true), 'We are')])
    this.buildWe()
    // made now, not mid-hover (the first progressive scan stalled ~0.25 s on them)
    this.renderer.compile(this.quadScene, this.quadCam)
    for (const n of [256, 512]) this.patchRT(n, n)
    this.ready = true
    for (let f = 0; f < faces.length; f++)
      for (const w of faces[f].weights)
        for (const it of faces[f].italic ? [false, true] : [false]) {
          const k = fontKey(f, w, it)
          if (this.fonts.has(k)) continue
          try {
            await this.loadFont(k, file(f, w, it), CHARS)
          } catch (e) {
            console.warn('[giz] font failed', k, e)
          }
        }
  }

  private buildWe(): void {
    if (this.we) {
      this.we.geometry.dispose()
      this.root.remove(this.we)
    }
    const ws = SIZE * 0.165
    const g = new TextGeometry('We are', { font: this.fonts.get('we')!, size: ws, depth: ws * 0.16, curveSegments: 4, bevelEnabled: false })
    g.translate(0, 0, -ws * 0.16)
    this.we = new THREE.Mesh(g, this.host?.reveal ? this.makeMat({ noReveal: true }) : this.mat)
    this.root.add(this.we)
  }

  /** (in the hero) the letters' front plane, world z */
  /** (in the hero) the stand-in wall, one per leaf, on the door's face just in front of it — so
   *  the strokes turn with the cubes. `L`/`R`: the leaves' letter groups (their x = 0 is the frame's
   *  edge and the middle, respectively, at rest) */
  setLeaves(L: THREE.Object3D, R: THREE.Object3D, vw: number, vh: number): void {
    if (!this.leafWalls.length)
      for (const g of [L, R]) {
        const w = drawnWall(this.drawn)
        w.renderOrder = 1 // after the door faces
        g.add(w)
        this.leafWalls.push(w)
      }
    const [wl, wr] = this.leafWalls
    for (const w of this.leafWalls) {
      w.scale.set(vw / 2, vh * 1.3, 1)
      w.position.z = 0.006
    }
    wl.position.x = vw / 4
    wr.position.x = -vw / 4
  }
  private leafWalls: THREE.Mesh[] = []
  private adopted: THREE.Mesh[] = []
  private weWorld: { x: number; y: number; z: number; k: number } | null = null
  /** (in the hero) its own sign's meshes, drawn with these letters' look and outline pass (while the
   *  cubes turn, when they stand in for the letters) */
  adopt(meshes: THREE.Mesh[], noReveal: THREE.Mesh[] = []): void {
    this.adopted = meshes
    for (const m of meshes) {
      // each its own material: the hero hands every mesh its rest pose through it (pinRest)
      let mat = this.adoptMats.get(m)
      if (!mat) this.adoptMats.set(m, (mat = this.makeMat({ rest: true, noReveal: noReveal.includes(m) })))
      m.material = mat
    }
  }
  /** (in the hero) "We are" where the hero's own sits: pen origin and front face (world), scale per em */
  setWe(w: { x: number; y: number; z: number; k: number } | null): void {
    this.weWorld = w
  }

  setFrontZ(z: number): void {
    this.frontZ = z
    this.root.position.z = z
    this.upp = (2 * (this.camZ - z) * Math.tan(THREE.MathUtils.degToRad(FOV / 2))) / this.H
  }

  resize(W: number, H: number): void {
    this.W = W
    this.H = H
    if (!this.host) {
      this.renderer.setSize(W, H, false)
      this.cam.aspect = W / H
      this.cam.updateProjectionMatrix()
      fitWall(this.wall, W / H)
    }
    this.drawn.resize(W, H, this.dpr)
    this.upp = (2 * (this.camZ - this.frontZ) * Math.tan(THREE.MathUtils.degToRad(FOV / 2))) / H
    if (this.host) this.setFrontZ(this.frontZ)
    for (const x of this.rts.values()) x.dispose()
    this.rts.clear()
  }

  /** the glyph's geometry, in em (pen origin at 0, front face on z = 0) */
  private geo(k: FontKey, text: string): THREE.BufferGeometry {
    const key = `${k}|${text}`
    let g = this.geos.get(key)
    if (g) return g
    const font = this.fonts.get(k) ?? this.fonts.get(fontKey(0, 700, false))!
    g = new TextGeometry(text, { font, size: SIZE, depth: DEPTH, curveSegments: 5, bevelEnabled: false })
    g.translate(0, 0, -DEPTH)
    this.geos.set(key, g)
    return g
  }

  /** the glyph's outline in em, y up (for a hover to edit) */
  shapes(k: FontKey, text: string): THREE.Shape[] {
    const font = this.fonts.get(k) ?? this.fonts.get(fontKey(0, 700, false))!
    return font.generateShapes(text, SIZE)
  }

  private slot(i: number): Slot {
    let s = this.slots[i]
    if (s) return s
    const group = new THREE.Group()
    const jelly = new THREE.Group()
    const jS = new THREE.Group()
    const jI = new THREE.Group()
    const tilt = new THREE.Group()
    group.add(jelly)
    jelly.add(jS)
    jS.add(jI)
    jI.add(tilt)
    const mesh = new THREE.Mesh(undefined, this.mat)
    const wire = new THREE.LineSegments(undefined, this.wireMat)
    wire.visible = false
    tilt.add(mesh, wire)
    const reel = [0, 1].map(() => {
      const m = new THREE.Mesh(undefined, this.makeMat())
      m.visible = false
      tilt.add(m)
      return m
    })
    const vox = [0, 1].map(() => {
      const m = new THREE.Mesh(undefined, this.mat)
      m.visible = false
      m.frustumCulled = false
      tilt.add(m)
      return m
    })
    this.root.add(group)
    s = { group, jelly, jS, jI, tilt, mesh, wire, wireOf: null, reel, vox, custom: null }
    this.slots[i] = s
    return s
  }

  /** px on screen -> world on the front plane */
  private world(x: number, y: number): THREE.Vector3 {
    return new THREE.Vector3((x - this.W / 2) * this.upp, (this.H / 2 - y) * this.upp, 0)
  }
  private screen(v: THREE.Vector3): { x: number; y: number } {
    const p = v.clone().project(this.cam)
    return { x: (p.x * 0.5 + 0.5) * this.W, y: (0.5 - p.y * 0.5) * this.H }
  }

  /** the triangle of letter i under a screen point, on screen (null: none) */
  triangleAt(i: number, x: number, y: number): { x: number; y: number }[] | null {
    const s = this.slots[i]
    if (!s || !s.mesh.visible) return null
    this.ray.setFromCamera(new THREE.Vector2((x / this.W) * 2 - 1, 1 - (y / this.H) * 2), this.cam)
    const hit = this.ray.intersectObject(s.mesh, false)[0]
    if (!hit?.face) return null
    const pos = s.mesh.geometry.getAttribute('position')
    return [hit.face.a, hit.face.b, hit.face.c].map((k) => this.screen(new THREE.Vector3().fromBufferAttribute(pos, k).applyMatrix4(s.mesh.matrixWorld)))
  }
  /** triangles / vertices letter i is drawn with */
  counts(i: number): { tris: number; verts: number } {
    const g = this.slots[i]?.mesh.geometry
    const n = g?.getAttribute('position')?.count ?? 0
    return { tris: Math.round((g?.index ? g.index.count : n) / 3), verts: n }
  }

  private voxes = new Map<string, Vox>()
  private rast = document.createElement('canvas')
  /** the glyph `text` in `css` as cubes `block` em wide: rasterised 8× per cell, a cell on where the
   *  glyph covers half of it */
  private voxGeo(css: (px: number) => string, text: string, block: number, gap: number): Vox {
    const key = `${css(100)}|${text}|${block.toFixed(4)}|${gap}`
    const hit = this.voxes.get(key)
    if (hit) return hit
    if (this.voxes.size > 200) {
      for (const v of this.voxes.values()) v.geo.dispose()
      this.voxes.clear()
    }
    const SS = 8
    const pxEm = SS / block // canvas px per em
    const g = this.rast.getContext('2d', { willReadFrequently: true })!
    g.font = css(pxEm)
    const mt = g.measureText(text)
    const pad = 2 * SS
    const cols = Math.ceil((mt.actualBoundingBoxLeft + mt.actualBoundingBoxRight + 2 * pad) / SS) + 1
    const rowsUp = Math.ceil((mt.actualBoundingBoxAscent + pad) / SS)
    const rowsDown = Math.ceil((mt.actualBoundingBoxDescent + pad) / SS)
    const rows = rowsUp + rowsDown
    this.rast.width = cols * SS
    this.rast.height = rows * SS
    g.font = css(pxEm)
    g.fillStyle = '#000'
    const penX = pad + mt.actualBoundingBoxLeft
    const baseY = rowsUp * SS
    g.fillText(text, penX, baseY)
    const data = g.getImageData(0, 0, this.rast.width, this.rast.height).data
    const on = (i: number, j: number) => {
      if (i < 0 || j < 0 || i >= cols || j >= rows) return false
      let a = 0
      for (let y = j * SS; y < (j + 1) * SS; y++) for (let x = i * SS; x < (i + 1) * SS; x++) a += data[(y * this.rast.width + x) * 4 + 3]
      return a / (SS * SS * 255) > 0.5
    }
    const grid: boolean[][] = []
    for (let j = 0; j < rows; j++) {
      grid.push([])
      for (let i = 0; i < cols; i++) grid[j].push(on(i, j))
    }
    const at = (i: number, j: number) => j >= 0 && j < rows && i >= 0 && i < cols && grid[j][i]
    const pos: number[] = []
    const nor: number[] = []
    const rowStart: number[] = []
    const ex = (gap * block) / 2
    const quad = (a: number[], b: number[], c: number[], d: number[], n: number[]) => {
      for (const p of [a, b, c, a, c, d]) pos.push(p[0], p[1], p[2])
      for (let k = 0; k < 6; k++) nor.push(n[0], n[1], n[2])
    }
    const Z0 = -DEPTH
    for (let j = 0; j < rows; j++) {
      rowStart.push(pos.length / 3)
      for (let i = 0; i < cols; i++) {
        if (!grid[j][i]) continue
        // the cell in em: x from the pen, y up from the baseline
        const x0 = (i * SS - penX) / pxEm + ex
        const x1 = ((i + 1) * SS - penX) / pxEm - ex
        const y1 = (baseY - j * SS) / pxEm - ex
        const y0 = (baseY - (j + 1) * SS) / pxEm + ex
        quad([x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0], [0, 0, 1])
        quad([x1, y0, Z0], [x0, y0, Z0], [x0, y1, Z0], [x1, y1, Z0], [0, 0, -1])
        const open = gap > 0
        if (open || !at(i - 1, j)) quad([x0, y0, Z0], [x0, y0, 0], [x0, y1, 0], [x0, y1, Z0], [-1, 0, 0])
        if (open || !at(i + 1, j)) quad([x1, y0, 0], [x1, y0, Z0], [x1, y1, Z0], [x1, y1, 0], [1, 0, 0])
        if (open || !at(i, j - 1)) quad([x0, y1, 0], [x1, y1, 0], [x1, y1, Z0], [x0, y1, Z0], [0, 1, 0])
        if (open || !at(i, j + 1)) quad([x0, y0, Z0], [x1, y0, Z0], [x1, y0, 0], [x0, y0, 0], [0, -1, 0])
      }
    }
    rowStart.push(pos.length / 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
    const v: Vox = { geo, rowStart, top: baseY / pxEm, block }
    this.voxes.set(key, v)
    return v
  }

  private rts = new Map<string, THREE.WebGLRenderTarget>()
  /** a square power-of-two target (a handful of sizes, kept: making them mid-hover stalled) */
  private patchRT(w: number, h: number): THREE.WebGLRenderTarget {
    const n = Math.max(128, Math.min(2048, 2 ** Math.ceil(Math.log2(Math.max(w, h)))))
    const key = `${n}`
    let r = this.rts.get(key)
    if (!r) {
      r = new THREE.WebGLRenderTarget(n, n, { minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, depthBuffer: true })
      this.rts.set(key, r)
    }
    return r
  }

  /** each low-resolution letter drawn alone into its patch's target and laid on the screen (the main
   *  render already done, these letters left out of it) */
  private drawPix(list: Pix[]): void {
    const scene = this.scene
    const kids = scene.children.map((c) => [c, c.visible] as const)
    const groups = this.root.children.map((c) => [c, c.visible] as const)
    const bg = scene.background
    const fog = scene.fog
    const shadows = this.renderer.shadowMap.autoUpdate
    const col = this.renderer.getClearColor(new THREE.Color())
    const alpha = this.renderer.getClearAlpha()
    const wall = this.wall.visible
    scene.background = null
    scene.fog = null
    this.renderer.shadowMap.autoUpdate = false
    for (const [c] of kids) c.visible = c === this.root
    this.wall.visible = false
    this.renderer.autoClear = false
    const d = this.dpr
    const u = this.quadMat.uniforms
    for (const p of list) {
      for (const [c] of groups) c.visible = c === p.s.group
      // the patch: the letter's box (with room for a turn), on whole device px, inside the screen
      const x0 = Math.max(0, Math.floor((p.cx - p.r) * d))
      const y0 = Math.max(0, Math.floor((p.cy - p.r) * d))
      const x1 = Math.min(Math.round(this.W * d), Math.ceil((p.cx + p.r) * d))
      const y1 = Math.min(Math.round(this.H * d), Math.ceil((p.cy + p.r) * d))
      if (x1 - x0 < 2 || y1 - y0 < 2) continue
      const rt = this.patchRT(x1 - x0, y1 - y0)
      // the camera's view of just that patch, stretched over the whole target
      this.cam.setViewOffset(this.W, this.H, x0 / d, y0 / d, rt.width / d, rt.height / d)
      const fullH0 = this.H * d
      SUV_MAP.value.set(x0 / (this.W * d), (fullH0 - y0 - rt.height) / fullH0, rt.width / (this.W * d), rt.height / fullH0)
      this.renderer.setRenderTarget(rt)
      this.renderer.setClearColor(0x000000, 0)
      this.renderer.clear()
      this.renderer.render(scene, this.cam)
      this.renderer.setRenderTarget(null)
      this.cam.clearViewOffset()
      SUV_MAP.value.set(0, 0, 1, 1)
      // back on the screen: the target covers [x0, x0 + rt.width] × [y0, y0 + rt.height] (from the top)
      const fullH = this.H * d
      const bx = x0
      const by = fullH - y0 - rt.height
      u.uTex.value = rt.texture
      ;(u.uRect.value as THREE.Vector4).set(bx, by, rt.width, rt.height)
      const fw = this.W * d
      ;(u.uNdc.value as THREE.Vector4).set((bx / fw) * 2 - 1, (by / fullH) * 2 - 1, ((bx + rt.width) / fw) * 2 - 1, ((by + rt.height) / fullH) * 2 - 1)
      u.uBlock.value = p.fx.block < 0 ? -1 : p.fx.block * d
      u.uFine.value = (p.fx.fine ?? p.fx.block) * d
      u.uSplit.value = p.fx.split === undefined ? -1e9 : fullH - p.fx.split * d
      u.uSnap.value = p.fx.smooth ? 0 : 1
      u.uEdge.value = Math.max(1.5, 1.6 * d)
      u.uMode.value = PIX.mode
      this.renderer.render(this.quadScene, this.quadCam)
    }
    for (const [c, v] of groups) c.visible = v
    for (const [c, v] of kids) c.visible = v
    this.wall.visible = wall
    scene.background = bg
    scene.fog = fog
    this.renderer.shadowMap.autoUpdate = shadows
    this.renderer.setClearColor(col, alpha)
    this.renderer.autoClear = true
  }

  /** (in the hero) right before its door render: the low-resolution letters leave it */
  beforeRender(): void {
    // the outline pass of these letters alone (their own layer: nothing of the hero's in it) — the
    // lab's letters while the doors are shut, the hero's own sign (adopted) while they turn
    const roots = this.root.visible ? [this.root] : this.adopted.filter((m) => m.visible)
    if (roots.length) this.drawn.normalPass(this.scene, this.cam, roots, LAB_LAYER)
    for (const p of this.pending) p.s.group.visible = false
  }
  /** (in the hero) right after its door render: each low-resolution letter drawn alone and laid on top */
  afterRender(): void {
    if (!this.pending.length || !this.root.visible) return
    this.drawPix(this.pending)
    for (const p of this.pending) p.s.group.visible = true
  }

  render(dt: number, views: LetterView[], we: { x: number; y: number; S: number }): void {
    if (!this.ready) return
    const pix: Pix[] = []
    views.forEach((v, i) => {
      const s = this.slot(i)
      const fx = v.fx
      // geometry: the replaced outline (bézier), or the glyph
      let g: THREE.BufferGeometry
      if (fx.shape) {
        if (!s.custom || s.custom.key !== fx.shape.key) {
          s.custom?.geo.dispose()
          const eg = new THREE.ExtrudeGeometry(fx.shape.build(), { depth: DEPTH, curveSegments: 5, bevelEnabled: false })
          eg.translate(0, 0, -DEPTH)
          s.custom = { key: fx.shape.key, geo: eg }
        }
        g = s.custom.geo
      } else {
        if (s.custom) {
          s.custom.geo.dispose()
          s.custom = null
        }
        g = this.geo(v.font, v.text)
      }
      s.mesh.geometry = g
      // transform: pivot on the glyph centre, as the 2D letter turns
      const k = v.px * this.upp * v.scale
      s.group.position.copy(this.world(v.cx, v.cy))
      s.group.position.z += (fx.dz ?? 0) * k
      s.group.rotation.z = -v.rot
      s.group.scale.setScalar(k)
      const bx = -v.adv / v.px / 2
      const by = -v.asc / v.px / 2
      // the squash (anchored on the baseline), then the 3D turn about its pivot
      const j = fx.jelly
      const jy = j ? by : 0
      s.jelly.position.set(0, jy, 0)
      s.jelly.rotation.z = -(j?.phi ?? 0)
      s.jS.scale.set(j?.sx ?? 1, j?.sy ?? 1, j?.sz ?? 1)
      s.jI.rotation.z = j?.phi ?? 0
      const t = fx.tilt
      const ty = t?.pivot === 'base' ? by : 0
      s.tilt.position.set(0, ty - jy, 0)
      s.tilt.rotation.set(t?.x ?? 0, t?.y ?? 0, 0)
      s.mesh.position.set(bx, by - ty, 0)
      s.mesh.visible = !fx.hide && !fx.reel
      // wireframe
      const w = fx.wire ?? 0
      s.wire.visible = w > 0.01 && s.mesh.visible
      if (s.wire.visible) {
        if (s.wireOf !== g) {
          s.wire.geometry.dispose()
          s.wire.geometry = new THREE.WireframeGeometry(g)
          s.wireOf = g
        }
        s.wire.position.copy(s.mesh.position)
        this.wireMat.opacity = w
      }
      // reel
      s.reel.forEach((m, n) => {
        const it = fx.reel?.items[n]
        m.visible = !!it
        if (!it || !fx.reel) return
        m.geometry = this.geo(it.font, it.text)
        m.position.set(bx + it.dx / v.px, by - it.dy / v.px - ty, 0)
        const u = (m.material as THREE.ShaderMaterial).uniforms.uClipY.value as THREE.Vector2
        u.set((this.H - fx.reel.y1) * this.dpr, (this.H - fx.reel.y0) * this.dpr)
      })
      // chalk cubes: coarse below the sweep, fine above it
      const vx = fx.voxel
      const showVox = !!vx && !fx.hide && !!v.css
      if (showVox) s.mesh.visible = false
      s.vox.forEach((m, n) => {
        if (!showVox || !vx || !v.css) {
          m.visible = false
          return
        }
        const b = n === 0 ? vx.block : vx.fine
        if (b <= 0) {
          m.visible = false
          return
        }
        const vg = this.voxGeo(v.css, v.text, b, vx.gap)
        m.geometry = vg.geo
        m.position.set(bx, by - ty, 0)
        m.visible = true
        // the sweep, in the letter's own em (turns ignored: the scan is a straight line anyway)
        const splitEm = (v.cy - vx.split) / (v.px * v.scale) - by
        const row = Math.max(0, Math.min(vg.rowStart.length - 1, Math.ceil((vg.top - splitEm) / vg.block)))
        const end = vg.rowStart[vg.rowStart.length - 1]
        if (n === 1) vg.geo.setDrawRange(0, vg.rowStart[row])
        else vg.geo.setDrawRange(vg.rowStart[row], end - vg.rowStart[row])
        if (n === 1 && vx.fine === vx.block) vg.geo.setDrawRange(0, end)
      })
      // its patch: centre and a radius that holds it at any turn
      if (fx.pixel && s.mesh.visible) pix.push({ s, fx: fx.pixel, cx: v.cx, cy: v.cy, r: Math.hypot(v.adv, v.asc * 1.4) * v.scale * 0.62 + 6 })
    })
    for (let i = views.length; i < this.slots.length; i++) this.slots[i].group.visible = false
    if (this.we) {
      if (this.weWorld) {
        // (in the hero) where its own "We are" stands, moved by `we` (px) as the lab moves it
        const u = (2 * (this.camZ - this.weWorld.z) * Math.tan(THREE.MathUtils.degToRad(FOV / 2))) / this.H
        this.we.position.set(this.weWorld.x + we.x * u, this.weWorld.y - we.y * u, this.weWorld.z - this.frontZ)
        this.we.scale.setScalar(this.weWorld.k)
      } else {
        this.we.position.copy(this.world(we.x, we.y))
        this.we.scale.setScalar(we.S * this.upp)
      }
    }
    if (this.host) {
      // the hero renders; the letters' own outline pass happens right before (beforeRender), and the
      // low-resolution ones step out of its render and are drawn after it (afterRender)
      this.drawn.step(dt)
      this.pending = pix
      return
    }
    this.drawn.step(dt)
    this.drawn.normalPass(this.scene, this.cam, [this.root])
    // the letters drawn at low resolution leave the main pass, each drawn alone into a small target
    for (const p of pix) p.s.group.visible = false
    this.renderer.render(this.scene, this.cam)
    if (pix.length) {
      this.drawPix(pix)
      for (const p of pix) p.s.group.visible = true
    }
  }
}

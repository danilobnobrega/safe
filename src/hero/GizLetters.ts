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
  pixel?: { block: number; smooth: boolean } // css px per texel; smooth = linear (blur) instead of nearest
  reel?: { items: { font: FontKey; text: string; dx: number; dy: number }[]; y0: number; y1: number } // local px offsets; window in screen px
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
}

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
  varying vec3 vViewN;
  varying vec4 vClip;
  ${DRAWN_GLSL}
  void main() {
    if (gl_FragCoord.y < uClipY.x || gl_FragCoord.y > uClipY.y) discard;
    vec2 suv = (vClip.xy / vClip.w) * 0.5 + 0.5;
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

type Slot = {
  group: THREE.Group
  mesh: THREE.Mesh
  wire: THREE.LineSegments
  wireOf: THREE.BufferGeometry | null
  reel: THREE.Mesh[]
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
  private pending: { s: Slot; fx: NonNullable<Fx['pixel']> }[] = []
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
  private full: THREE.WebGLRenderTarget | null = null // a letter drawn alone at full size, mipmapped
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
    // the low-resolution look: the letter drawn alone at full size, then read back through its mip
    // chain — averaged over blocks (pixels: one sample per block) or plain (blur)
    this.quadMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      transparent: true,
      premultipliedAlpha: true,
      depthTest: false,
      depthWrite: false,
      uniforms: { uTex: { value: null as THREE.Texture | null }, uBlock: { value: 1 }, uRes: { value: new THREE.Vector2(1, 1) }, uSnap: { value: 1 } },
      vertexShader: 'out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `precision highp float;
        uniform sampler2D uTex; uniform float uBlock; uniform vec2 uRes; uniform float uSnap;
        in vec2 vUv; out vec4 outColor;
        void main() {
          vec2 uv = vUv;
          if (uSnap > 0.5) uv = (floor(vUv * uRes / uBlock) + 0.5) * uBlock / uRes;
          outColor = textureLod(uTex, uv, log2(max(uBlock, 1.0)));
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
    this.full?.dispose()
    this.full = null
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
    const mesh = new THREE.Mesh(undefined, this.mat)
    const wire = new THREE.LineSegments(undefined, this.wireMat)
    wire.visible = false
    group.add(mesh, wire)
    const reel = [0, 1].map(() => {
      const m = new THREE.Mesh(undefined, this.makeMat())
      m.visible = false
      group.add(m)
      return m
    })
    this.root.add(group)
    s = { group, mesh, wire, wireOf: null, reel, custom: null }
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

  private fullRT(): THREE.WebGLRenderTarget {
    if (!this.full) {
      const w = Math.max(1, Math.round(this.W * this.dpr))
      const h = Math.max(1, Math.round(this.H * this.dpr))
      this.full = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, depthBuffer: true })
    }
    return this.full
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
    const scene = this.scene
    const kids = scene.children.map((c) => [c, c.visible] as const)
    const groups = this.root.children.map((c) => [c, c.visible] as const)
    const bg = scene.background
    const fog = scene.fog
    const shadows = this.renderer.shadowMap.autoUpdate
    const col = this.renderer.getClearColor(new THREE.Color())
    const alpha = this.renderer.getClearAlpha()
    scene.background = null
    scene.fog = null
    this.renderer.shadowMap.autoUpdate = false
    for (const [c] of kids) c.visible = c === this.root
    this.renderer.autoClear = false
    for (const p of this.pending) {
      for (const [c] of groups) c.visible = c === p.s.group
      const rt = this.fullRT()
      this.renderer.setRenderTarget(rt)
      this.renderer.setClearColor(0x000000, 0)
      this.renderer.clear()
      this.renderer.render(scene, this.cam)
      this.renderer.setRenderTarget(null)
      this.quadMat.uniforms.uTex.value = rt.texture
      this.quadMat.uniforms.uBlock.value = Math.max(1, p.fx.block * this.dpr)
      ;(this.quadMat.uniforms.uRes.value as THREE.Vector2).set(rt.width, rt.height)
      this.quadMat.uniforms.uSnap.value = p.fx.smooth ? 0 : 1
      this.renderer.render(this.quadScene, this.quadCam)
    }
    for (const [c, v] of groups) c.visible = v
    for (const [c, v] of kids) c.visible = v
    for (const p of this.pending) p.s.group.visible = true
    scene.background = bg
    scene.fog = fog
    this.renderer.shadowMap.autoUpdate = shadows
    this.renderer.setClearColor(col, alpha)
    this.renderer.autoClear = true
  }

  render(dt: number, views: LetterView[], we: { x: number; y: number; S: number }): void {
    if (!this.ready) return
    const pix: { s: Slot; fx: NonNullable<Fx['pixel']> }[] = []
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
      s.group.rotation.z = -v.rot
      s.group.scale.setScalar(k)
      const bx = -v.adv / v.px / 2
      const by = -v.asc / v.px / 2
      s.mesh.position.set(bx, by, 0)
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
        m.position.set(bx + it.dx / v.px, by - it.dy / v.px, 0)
        const u = (m.material as THREE.ShaderMaterial).uniforms.uClipY.value as THREE.Vector2
        u.set((this.H - fx.reel.y1) * this.dpr, (this.H - fx.reel.y0) * this.dpr)
      })
      if (fx.pixel && s.mesh.visible) pix.push({ s, fx: fx.pixel })
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
      const all = this.root.children.map((c) => [c, c.visible] as const)
      this.wall.visible = false
      this.renderer.autoClear = false
      for (const p of pix) {
        for (const [c] of all) c.visible = c === p.s.group
        const rt = this.fullRT()
        this.renderer.setRenderTarget(rt)
        this.renderer.setClearColor(0x000000, 0)
        this.renderer.clear()
        this.renderer.render(this.scene, this.cam)
        this.renderer.setRenderTarget(null)
        this.quadMat.uniforms.uTex.value = rt.texture
        this.quadMat.uniforms.uBlock.value = Math.max(1, p.fx.block * this.dpr)
        ;(this.quadMat.uniforms.uRes.value as THREE.Vector2).set(rt.width, rt.height)
        this.quadMat.uniforms.uSnap.value = p.fx.smooth ? 0 : 1
        this.renderer.render(this.quadScene, this.quadCam)
      }
      for (const [c, v] of all) c.visible = v
      for (const p of pix) p.s.group.visible = true
      this.wall.visible = true
      this.renderer.autoClear = true
    }
  }
}

import * as THREE from 'three'
import { TTFLoader } from 'three/examples/jsm/loaders/TTFLoader.js'
import { Font } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import { Drawn, DRAWN_GLSL } from './Drawn'
import { drawnWall, fitWall } from './GizLetters'

/**
 * TEST (/hero-hovers.html): the main hero's sign in chalk ("giz") — "GENERIC." and "We are" as
 * extruded Tinos drawn by Drawn.ts, the way the main page draws them (matte cut, same depth, same
 * door camera) — laid over the hover lab's 2D canvas. "GENERIC." shows only while the sign is at
 * rest (no hover, every letter home); "We are" always. Each letter is its own mesh, placed on the
 * 2D letter's home, so the 2D letters take over exactly where the chalk ones stood.
 */
const CAM_Z = 4 // the hero's door camera
const FOV = 50
const DEPTH = 0.17 // extrusion, per em (the hero's LETTER_DEPTH)

type Font2 = { bold: Font; italic: Font }

export class GizSign {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private cam = new THREE.PerspectiveCamera(FOV, 1, 0.05, 100)
  private root = new THREE.Group()
  private drawn: Drawn
  private mat: THREE.ShaderMaterial
  private fonts?: Font2
  private word: THREE.Mesh[] = []
  private we?: THREE.Mesh
  private wall: THREE.Mesh
  private W = 1
  private H = 1
  private S = 0
  private upp = 1 // world units per css px, on the z = 0 plane (the letters' front faces)
  ready = false

  constructor(canvas: HTMLCanvasElement, private dpr: number) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
    this.renderer.setPixelRatio(dpr)
    this.renderer.setClearColor(0x000000, 0)
    this.cam.position.set(0, 0, CAM_Z)
    this.scene.add(this.root)
    this.drawn = new Drawn(this.renderer, 1, 1, dpr)
    this.wall = drawnWall(this.drawn) // the sketchy strokes around the letters (see GizLetters.ts)
    this.scene.add(this.wall)
    this.mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { ...this.drawn.uniforms },
      vertexShader: /* glsl */ `
        varying vec3 vViewN;
        varying vec4 vClip;
        void main() {
          vViewN = normalize(normalMatrix * normal);
          vClip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = vClip;
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vViewN;
        varying vec4 vClip;
        ${DRAWN_GLSL}
        void main() {
          vec2 suv = (vClip.xy / vClip.w) * 0.5 + 0.5;
          gl_FragColor = vec4(drawnColor(suv, normalize(vViewN)), 1.0);
        }`,
    })
  }

  async load(): Promise<void> {
    const ttf = new TTFLoader()
    const base = import.meta.env.BASE_URL
    const [b, i] = await Promise.all([ttf.loadAsync(`${base}fonts/Tinos-Bold.ttf`), ttf.loadAsync(`${base}fonts/Tinos-Italic.ttf`)])
    type FontData = ConstructorParameters<typeof Font>[0]
    this.fonts = { bold: new Font(b as unknown as FontData), italic: new Font(i as unknown as FontData) }
    if (this.S) this.build()
  }

  /** frame size (css px) and the sign's font size (px) */
  resize(W: number, H: number, S: number): void {
    this.W = W
    this.H = H
    this.renderer.setSize(W, H, false)
    this.cam.aspect = W / H
    this.cam.updateProjectionMatrix()
    fitWall(this.wall, W / H)
    this.drawn.resize(W, H, this.dpr)
    this.upp = (2 * CAM_Z * Math.tan(THREE.MathUtils.degToRad(FOV / 2))) / H
    if (S !== this.S) {
      this.S = S
      if (this.fonts) this.build()
    }
  }

  private build(): void {
    for (const m of [...this.word, ...(this.we ? [this.we] : [])]) {
      m.geometry.dispose()
      this.root.remove(m)
    }
    this.word = []
    const f = this.fonts!
    // TTFLoader's glyphs come out 100000/72 per em against Font's resolution of 1000: a TextGeometry
    // `size` is 0.72 em (why the hero sizes its sign by measuring)
    const size = this.S * this.upp * 0.72
    for (const ch of 'GENERIC.') {
      const g = new TextGeometry(ch, { font: f.bold, size, depth: size * DEPTH, curveSegments: 6, bevelEnabled: false })
      g.translate(0, 0, -size * DEPTH) // front face on z = 0
      const m = new THREE.Mesh(g, this.mat)
      this.root.add(m)
      this.word.push(m)
    }
    const ws = size * 0.165
    const wg = new TextGeometry('We are', { font: f.italic, size: ws, depth: ws * 0.16, curveSegments: 4, bevelEnabled: false })
    wg.translate(0, 0, -ws * 0.16)
    this.we = new THREE.Mesh(wg, this.mat)
    this.root.add(this.we)
    this.ready = true
  }

  /** px on screen -> world on the front plane */
  private place(o: THREE.Object3D, x: number, y: number): void {
    o.position.set((x - this.W / 2) * this.upp, (this.H / 2 - y) * this.upp, 0)
  }

  /** `homes`: each letter's baseline-left (px); `showWord`: the chalk "GENERIC." on; `we`: "We are"'s
   *  baseline-left (px) */
  render(dt: number, homes: { x: number; y: number }[], showWord: boolean, we: { x: number; y: number }): void {
    if (!this.ready) return
    this.word.forEach((m, i) => {
      m.visible = showWord
      this.place(m, homes[i].x, homes[i].y)
    })
    if (this.we) this.place(this.we, we.x, we.y)
    this.drawn.step(dt)
    this.drawn.normalPass(this.scene, this.cam, [this.root])
    this.renderer.render(this.scene, this.cam)
  }
}

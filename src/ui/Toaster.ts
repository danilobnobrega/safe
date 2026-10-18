import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { Drawn, DRAWN_GLSL } from '../hero/Drawn'
import { setCursor, PRIORITY } from './cursor'

/**
 * The menu: a tiny chrome toaster in the top-right corner, on every page. Click it: the lever
 * goes down, a beat, and three toasts pop up with the pages burnt into them — Home, About,
 * Contact. Click a toast to go there (the others drop back in); click the toaster again to put
 * them all back. Its own little canvas over the page; the page underneath keeps its pointer
 * except where the toaster or a toast actually is.
 */

export interface ToastLink {
  label: string
  href: string | null // null = not built yet: the toast just drops back
}

const PX_W = 172 // canvas size, css px
const PX_H = 187
const MARGIN = 14
// the canvas reaches above the window: the toaster sits low in it (room for the slices to pop)
const TOP = -22

const BODY_W = 1.6 // toaster, world units
const BODY_H = 1.0
const BODY_D = 1.15
const TOAST_W = 1.18
const TOAST_H = 0.86 // fits inside the body (its feet leave the bottom open)
const GROW_MIN = 0.45 // /toaster-grow: resting size
const GROW_TIME = 0.6 // s, tiny -> full
const SHRINK_TIME = 0.7 // s, full -> tiny
const REST_RY = -0.38 // the toaster's turn, full size
const GROW_TURN = 1.15 // /toaster-grow: how much further it's turned when tiny
// closed, under the pointer it tips over on a diagonal, in place — no zoom, no travel: a turn
// toward the viewer and a lean back at once, eased in and out (rad)
const HOVER_TURN = 0.34
const HOVER_LEAN = 0.2
const HOVER_TIME = 0.45 // s, each way
const SLOTS_Z = [0.32, 0, -0.32] // front to back
// how far each slice rises out, front to back. A slice's foot sits at its rise + ~0.13 above
// the floor and the slot rim is at 1.06: up to ~0.8 it's still held by its slot
const POP = [0.42, 0.54, 0.64]
const HOVER_LIFT = 0.16 // a hovered slice rises this much more — still held by its slot (max ~0.8)

type Toast = {
  mesh: THREE.Mesh
  link: ToastLink
  y: number // current rise above "inside"
  vy: number
  target: number // rise it's settling to
  x: number
  tx: number
  rz: number
  trz: number
  hover: number
}

export class Toaster {
  private canvas = document.createElement('canvas')
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(30, PX_W / PX_H, 0.1, 50)
  private root = new THREE.Group()
  private body: THREE.Mesh
  private lever: THREE.Mesh
  private toasts: Toast[] = []
  private ray = new THREE.Raycaster()
  private ptr = new THREE.Vector2(-9, -9)
  private hit: THREE.Object3D | null = null
  private state: 'idle' | 'heating' | 'up' | 'leaving' = 'idle'
  private leverY = 0
  private wobble = 0
  private clock = new THREE.Clock()
  private hover = 0
  private readyLight!: THREE.MeshStandardMaterial
  private dial!: THREE.Group
  private buttons: THREE.Mesh[] = []

  /** the menu as it is now: tiny at rest; a click opens it — it grows to full size and pops
   *  the slices in one go. No hover. Click it again (or anywhere else) and it shrinks back */
  private grow: boolean
  private g = 0 // 0 tiny .. 1 full size
  private open = false
  private pose = 0 // the grow pose currently applied (smallPose's e)
  private _r = new THREE.Vector3()
  private _u = new THREE.Vector3()
  /** TEST (/hero-drawn.html): the toaster drawn by the garage's hand, like the page (see Drawn.ts) */
  private drawn?: Drawn

  /** TEST (/hero-drawn-grab.html): the toasts drawn at rest, real (the photo-ish ones) under the cursor */
  private toastRealOnHover = false
  /** TEST (/hero-drawn-giz-real.html): the real slice made believable (see realToastMaterials) */
  private realisticToast = false

  constructor(links: ToastLink[], opts: { grow?: boolean; drawn?: boolean; drawnToasts?: boolean | 'hover' | 'fade' | 'spread' | 'rise'; realisticToast?: boolean } = {}) {
    this.realisticToast = !!opts.realisticToast
    this.grow = !!opts.grow
    const c = this.canvas
    c.setAttribute(
      'style',
      `position:fixed;top:${TOP}px;right:${MARGIN}px;width:${PX_W}px;height:${PX_H}px;z-index:50;pointer-events:none`,
    )
    document.body.appendChild(c)
    this.renderer = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true })
    this.renderer.setPixelRatio(this.pixelRatio())
    this.renderer.setSize(PX_W, PX_H, false)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture
    pmrem.dispose()
    const key = new THREE.DirectionalLight(0xffffff, 1.6)
    key.position.set(2, 4, 3)
    this.scene.add(key, new THREE.AmbientLight(0xffffff, 0.25))

    // the toaster sits low in the canvas; the toasts pop up into the space above it
    // looking down a bit more: each slice behind shows above the one in front of it
    this.camera.position.set(2.2, 3.9, 5.4)
    this.camera.lookAt(0, 0.95, 0)
    this.scene.add(this.root)
    this.root.rotation.y = REST_RY

    // body: brushed-chrome rounded box, a black base, two slot openings on top
    const chrome = new THREE.MeshStandardMaterial({ color: 0xd9dde2, metalness: 1, roughness: 0.18 })
    this.body = new THREE.Mesh(new RoundedBoxGeometry(BODY_W, BODY_H, BODY_D, 6, 0.22), chrome)
    this.body.position.y = BODY_H / 2 + 0.06
    this.root.add(this.body)
    // four small black rubber feet under the body's corners
    const footMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6 })
    for (const fx of [-1, 1])
      for (const fz of [-1, 1]) {
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.07, 20), footMat)
        foot.position.set(fx * (BODY_W / 2 - 0.2), 0.035, fz * (BODY_D / 2 - 0.18))
        this.root.add(foot)
      }
    const slotMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9 })
    for (const z of SLOTS_Z) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(TOAST_W + 0.06, 0.02, 0.13), slotMat)
      slot.position.set(0, BODY_H + 0.062, z)
      this.root.add(slot)
    }
    // the lever, on the right side
    const leverMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4 })
    this.lever = new THREE.Mesh(new RoundedBoxGeometry(0.14, 0.12, 0.24, 3, 0.04), leverMat)
    this.lever.position.set(BODY_W / 2 + 0.06, BODY_H * 0.82, 0)
    this.root.add(this.lever)
    const leverSlot = new THREE.Mesh(new THREE.BoxGeometry(0.01, BODY_H * 0.62, 0.05), slotMat)
    leverSlot.position.set(BODY_W / 2 + 0.002, BODY_H * 0.55, 0)
    this.root.add(leverSlot)

    // the controls, on the lever's side (the lever stays in the middle): the red "ready" light
    // and the browning dial in front of it, two small buttons behind it.
    // Built on a panel facing +x — panel-local x runs to the back (-z), local z points out
    const panel = new THREE.Group()
    panel.position.set(BODY_W / 2 + 0.005, 0, 0)
    panel.rotation.y = Math.PI / 2
    this.root.add(panel)
    const at = (worldZ: number) => -worldZ // world z (front +) -> panel-local x
    const btnMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.35 })
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 1, roughness: 0.25 })
    // two small buttons, stacked, behind the lever — balancing the light + dial in front of it
    for (const y of [0.62, 0.4]) {
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.02, 24), rimMat)
      rim.rotation.x = Math.PI / 2
      rim.position.set(at(-0.25), BODY_H * y, 0.01)
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.05, 24), btnMat)
      btn.rotation.x = Math.PI / 2
      btn.position.set(at(-0.25), BODY_H * y, 0.03)
      panel.add(rim, btn)
      this.buttons.push(btn)
    }
    // dial: a knurled black knob with a white marker, on a chrome collar, ticks around it
    this.dial = new THREE.Group()
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.02, 32), rimMat)
    collar.rotation.x = Math.PI / 2
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.09, 0.08, 24), btnMat)
    knob.rotation.x = Math.PI / 2
    knob.position.z = 0.05
    const marker = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.06, 0.012), new THREE.MeshBasicMaterial({ color: 0xf2f0ea }))
    marker.position.set(0, 0.04, 0.091)
    this.dial.add(collar, knob, marker)
    this.dial.position.set(at(0.25), BODY_H * 0.47, 0.01)
    this.dial.rotation.z = -0.6
    panel.add(this.dial)
    const tickMat = new THREE.MeshBasicMaterial({ color: 0x2a2a2a })
    for (let k = 0; k < 7; k++) {
      const a = -1.6 + k * (3.2 / 6)
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.024, 0.004), tickMat)
      tick.position.set(this.dial.position.x - Math.sin(a) * 0.14, this.dial.position.y + Math.cos(a) * 0.14, 0.002)
      tick.rotation.z = a
      panel.add(tick)
    }
    // the "ready" light: a small red lens, dark until the toast is up
    this.readyLight = new THREE.MeshStandardMaterial({ color: 0x3a0606, emissive: 0xff1a0a, emissiveIntensity: 0, roughness: 0.2 })
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), this.readyLight)
    lens.scale.z = 0.5
    lens.position.set(at(0.25), BODY_H * 0.74, 0.01)
    panel.add(lens)

    // toasts — inside, below the slot rim, until it pops
    links.slice(0, SLOTS_Z.length).forEach((link, i) => {
      const mesh = new THREE.Mesh(this.toastGeometry(), this.toastMaterials(link.label))
      mesh.userData.toast = i
      this.root.add(mesh)
      this.toasts.push({ mesh, link, y: 0, vy: 0, target: 0, x: 0, tx: 0, rz: 0, trz: 0, hover: 0 })
    })

    if (opts.drawn) this.makeDrawn(opts.drawnToasts)
    if (this.grow) this.smallPose(0)
    document.addEventListener('pointermove', this.onMove, true)
    document.addEventListener('click', this.onClick, true)
    this.renderer.setAnimationLoop(this.frame)
  }

  /** the tiny pose: scaled down and pulled toward the canvas' top-right (camera right/up) */
  private smallPose(e: number): void {
    this.camera.updateMatrixWorld()
    this._r.setFromMatrixColumn(this.camera.matrixWorld, 0)
    this._u.setFromMatrixColumn(this.camera.matrixWorld, 1)
    this.root.scale.setScalar(THREE.MathUtils.lerp(GROW_MIN, 1, e))
    // tiny, it's turned the other way (its front to the viewer); it swings round as it grows
    this.root.rotation.y = THREE.MathUtils.lerp(REST_RY + GROW_TURN, REST_RY, e)
    this.root.position.copy(this._r).multiplyScalar(1.06 * (1 - e)).addScaledVector(this._u, 1.44 * (1 - e))
  }

  /** a slice: square bottom, a domed top (the loaf), thin */
  private toastGeometry(): THREE.BufferGeometry {
    const w = TOAST_W / 2
    const s = new THREE.Shape()
    s.moveTo(-w, 0)
    s.lineTo(w, 0)
    s.lineTo(w, TOAST_H * 0.72)
    s.bezierCurveTo(w + 0.1, TOAST_H * 1.02, w * 0.35, TOAST_H * 1.04, 0, TOAST_H * 1.0)
    s.bezierCurveTo(-w * 0.35, TOAST_H * 1.04, -w - 0.1, TOAST_H * 1.02, -w, TOAST_H * 0.72)
    s.lineTo(-w, 0)
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.02, bevelSegments: 2, curveSegments: 12 })
    g.translate(0, 0, -0.04)
    // front/back faces: uv from the shape's own x/y (0..1)
    const pos = g.attributes.position
    const uv = g.attributes.uv
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / TOAST_W + 0.5, pos.getY(i) / TOAST_H)
    return g
  }

  /** TEST (/hero-drawn.html): the toaster redrawn in graphite on paper — light parts (chrome) as
   *  outline + hatching, dark ones (plastic, slots) as dense hatching by how dark they were; the
   *  "ready" light comes on in the garage's orange instead of red. The toasts it pops stay real
   *  bread (?drawntoast draws them too: outline + the label in steady ink) */
  private makeDrawn(drawnToasts?: boolean | 'hover' | 'fade' | 'spread' | 'rise'): void {
    const dpr = this.pixelRatio()
    this.drawn = new Drawn(this.renderer, PX_W, PX_H, dpr)
    const made = new Map<THREE.Material, THREE.Material>()
    const swap = (src: THREE.Material): THREE.Material => {
      const hit = made.get(src)
      if (hit) return hit
      const s = src as THREE.MeshStandardMaterial
      const c = (s.color ?? new THREE.Color(1, 1, 1)).clone().convertLinearToSRGB()
      const lum = c.r * 0.299 + c.g * 0.587 + c.b * 0.114
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          ...this.drawn!.uniforms,
          uTone: { value: THREE.MathUtils.clamp((0.5 - lum) / 0.45, 0, 1) },
          uMap: { value: s.userData.label ? this.drawnLabel(s.userData.label as string) : null },
          uHasMap: { value: s.userData.label ? 1 : 0 },
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
            if (uHasMap > 0.5) {
              // a toast's face: only its outline and the label, in steady ink — at this size
              // any hatching, grain or tremble on it makes the word unreadable
              float l = texture2D(uMap, vUv).r;
              ink = max(drawnEdge(suv), 1.0 - smoothstep(0.35, 0.65, l));
            }
            vec3 col = mix(drawnPaper(suv), D_INK, ink);
            col = mix(col, vec3(1.0, 0.604, 0.302), uGlow); // the garage's orange
            gl_FragColor = vec4(col, 1.0);
          }`,
      })
      made.set(src, mat)
      return mat
    }
    // the toasts stay real (the photo-ish ones) unless ?drawntoast — the drawn toaster pops
    // real bread
    const drawToasts = drawnToasts ?? new URLSearchParams(location.search).has('drawntoast')
    this.toastRealOnHover = drawToasts === 'hover'
    this.root.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      if (m.userData.toast !== undefined && !drawToasts) return
      if (m.userData.toast !== undefined) {
        const label = this.toasts[m.userData.toast as number].link.label
        m.userData.realMaterial = this.toastRealOnHover ? (this.realisticToast ? this.realToastMaterials(label) : this.toastMaterials(label, true)) : m.material
      }
      m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material)
    })
    // 'fade' (/hero-drawn-giz-fade): the real slice laid over the drawn one, same geometry, fading
    // in under the cursor and back out — the colour comes on gradually instead of switching
    if (drawToasts === 'fade') {
      for (const t of this.toasts) {
        const mats = this.toastMaterials(t.link.label, true).map((m) => {
          m.transparent = true
          m.opacity = 0
          m.depthWrite = false
          return m
        })
        const over = new THREE.Mesh(t.mesh.geometry, mats)
        over.renderOrder = 1 // after the drawn slice, at the same depth (LessEqual passes)
        over.visible = false
        t.mesh.add(over)
        this.toastFades.push({ over, mats, k: 0 })
      }
    }
    // 'spread' / 'rise' (/hero-drawn-giz-spread, -rise): the real slice laid over the drawn one
    // but only inside a region that grows — opaque there, absent elsewhere, a trembling chalk line
    // on its border, so the two never show through each other. 'spread': from where the cursor
    // touched the slice, outwards; 'rise': from the bottom up, like it toasting
    if (drawToasts === 'spread' || drawToasts === 'rise') {
      for (const t of this.toasts) {
        const u = { uMode: { value: drawToasts === 'rise' ? 1 : 0 }, uCenter: { value: new THREE.Vector2() }, uR: { value: 0 }, uTick: this.toastTick }
        const mats = this.toastMaterials(t.link.label, true).map((m) => {
          // the same surface as the drawn slice: its depth comes out a hair different from the
          // drawn shader's here and there, and there the drawn slice won and the colour had holes.
          // Pulled toward the camera so it always wins (the slices are far apart enough)
          m.polygonOffset = true
          m.polygonOffsetFactor = -2
          m.polygonOffsetUnits = -8
          m.onBeforeCompile = (sh) => {
            Object.assign(sh.uniforms, u)
            sh.vertexShader = sh.vertexShader
              .replace('#include <common>', '#include <common>\nvarying vec2 vToastLocal;')
              .replace('#include <begin_vertex>', '#include <begin_vertex>\nvToastLocal = position.xy;')
            sh.fragmentShader = sh.fragmentShader
              .replace(
                '#include <common>',
                `#include <common>
                varying vec2 vToastLocal;
                uniform float uMode;
                uniform vec2 uCenter;
                uniform float uR;
                uniform float uTick;
                float tH(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
                float tN(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 w = f * f * (3.0 - 2.0 * f);
                  return mix(mix(tH(i), tH(i + vec2(1.0, 0.0)), w.x), mix(tH(i + vec2(0.0, 1.0)), tH(i + vec2(1.0, 1.0)), w.x), w.y); }
                float tEdge;`,
              )
              .replace(
                '#include <clipping_planes_fragment>',
                `#include <clipping_planes_fragment>
                // how far inside the coloured region (world units); the border wobbles 8x a second
                if (uMode < 0.5) {
                  float d = distance(vToastLocal, uCenter) + (tN(vToastLocal * 14.0 + uTick * 1.37) - 0.5) * 0.05;
                  tEdge = uR - d;
                } else {
                  float lv = uR + (tN(vec2(vToastLocal.x * 9.0 + uTick * 2.1, uTick * 0.7)) - 0.5) * 0.045;
                  tEdge = lv - vToastLocal.y;
                }
                if (tEdge < 0.0) discard;`,
              )
              .replace(
                '#include <dithering_fragment>',
                `#include <dithering_fragment>
                float tGrain = smoothstep(0.2, 0.55, tN(gl_FragCoord.xy * 0.7 + uTick * 5.0));
                gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.071), (1.0 - smoothstep(0.01, 0.022, tEdge)) * tGrain);`,
              )
          }
          return m
        })
        const over = new THREE.Mesh(t.mesh.geometry, mats)
        over.renderOrder = 1 // after the drawn slice, at the same depth (LessEqual passes)
        over.visible = false
        t.mesh.add(over)
        this.toastGrows.push({ over, u, k: 0, was: false })
      }
    }
    const glow = made.get(this.readyLight) as THREE.ShaderMaterial | undefined
    if (glow) this.drawnGlow = glow.uniforms.uGlow
  }
  private drawnGlow?: { value: number }
  private toastFades: { over: THREE.Mesh; mats: THREE.Material[]; k: number }[] = []
  private toastGrows: { over: THREE.Mesh; u: { uMode: { value: number }; uCenter: { value: THREE.Vector2 }; uR: { value: number } }; k: number; was: boolean }[] = []
  private toastTick = { value: 0 }
  private toastTime = 0
  private hitLocal = new THREE.Vector3()

  /** TEST (/hero-drawn.html): a toast's label for the drawn toaster — crisp black on white, set
   *  exactly as the burnt one (same font, size, place), so the shader can draw it as ink */
  private drawnLabel(label: string): THREE.Texture {
    const W = 256
    const H = 228
    const cnv = document.createElement('canvas')
    cnv.width = W
    cnv.height = H
    const ctx = cnv.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, W, H)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    let size = 64
    ctx.font = `700 ${size}px Tinos, "Times New Roman", serif`
    // a little bigger and heavier than the burnt one: it is read at a few px tall
    size = 80
    ctx.font = `700 ${size}px Tinos, "Times New Roman", serif`
    while (ctx.measureText(label).width > W * 0.86) {
      size -= 2
      ctx.font = `700 ${size}px Tinos, "Times New Roman", serif`
    }
    ctx.fillStyle = '#000'
    ctx.strokeStyle = '#000'
    ctx.lineWidth = size * 0.06
    ctx.lineJoin = 'round'
    ctx.strokeText(label, W / 2, H * 0.2)
    ctx.fillText(label, W / 2, H * 0.2)
    const tex = new THREE.CanvasTexture(cnv)
    tex.colorSpace = THREE.NoColorSpace
    tex.anisotropy = 4
    return tex
  }

  /** the canvas' resolution: the screen's, up to 2 — and at least 2 for the realistic slice
   *  (/hero-drawn-giz-real), drawn finer and scaled down by the browser, so its pores stay crisp
   *  at a 1.25 display scale */
  private pixelRatio(): number {
    const pr = Math.min(window.devicePixelRatio, 2)
    return this.realisticToast ? Math.max(pr, 2) : pr
  }

  /** TEST (/hero-drawn-giz-real.html): a more believable slice — an open crumb of irregular pores
   *  (with their relief, as a bump map), toasted unevenly and darker toward the edge, a lip of
   *  crust round the face, a crust of its own on the sides; the label burnt in as the big one */
  private realToastMaterials(label: string): THREE.Material[] {
    const W = 1024
    const H = 912
    const k = W / 256
    const mk = () => {
      const c = document.createElement('canvas')
      c.width = W
      c.height = H
      return [c, c.getContext('2d')!] as const
    }
    const [cnv, ctx] = mk()
    const [bcnv, bctx] = mk()
    // the face's outline in canvas px (toastGeometry's shape; uv = x / TOAST_W + 0.5, y / TOAST_H)
    const P = (x: number, y: number): [number, number] => [(x / TOAST_W + 0.5) * W, (1 - y / TOAST_H) * H]
    const outline = (c: CanvasRenderingContext2D) => {
      const w = TOAST_W / 2
      c.beginPath()
      c.moveTo(...P(-w, 0))
      c.lineTo(...P(w, 0))
      c.lineTo(...P(w, TOAST_H * 0.72))
      c.bezierCurveTo(...P(w + 0.1, TOAST_H * 1.02), ...P(w * 0.35, TOAST_H * 1.04), ...P(0, TOAST_H))
      c.bezierCurveTo(...P(-w * 0.35, TOAST_H * 1.04), ...P(-w - 0.1, TOAST_H * 1.02), ...P(-w, TOAST_H * 0.72))
      c.closePath()
    }
    const R = Math.random
    // crumb: pale gold, toasted toward the edges, unevenly
    ctx.fillStyle = '#d8a560'
    ctx.fillRect(0, 0, W, H)
    const g = ctx.createRadialGradient(W * 0.5, H * 0.55, 20, W * 0.5, H * 0.55, W * 0.62)
    g.addColorStop(0, 'rgba(244,214,150,0.95)')
    g.addColorStop(0.55, 'rgba(232,186,112,0.6)')
    g.addColorStop(1, 'rgba(176,104,42,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    ctx.filter = `blur(${10 * k}px)`
    for (let i = 0; i < 46; i++) {
      ctx.fillStyle = R() < 0.6 ? `rgba(160,88,30,${0.08 + R() * 0.12})` : `rgba(250,226,170,${0.08 + R() * 0.12})`
      ctx.beginPath()
      ctx.ellipse(R() * W, R() * H, (12 + R() * 34) * k, (8 + R() * 24) * k, R() * 3.14, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.filter = 'none'
    // bump: mid grey, the pores are pits
    bctx.fillStyle = '#909090'
    bctx.fillRect(0, 0, W, H)
    // pores: many small irregular holes, some bigger, each with a lit lower rim
    const pore = (r: number) => {
      const x = R() * W
      const y = R() * H
      const rx = r * (0.7 + R() * 0.8)
      const ry = r * (0.45 + R() * 0.55)
      const a = R() * Math.PI
      ctx.fillStyle = `rgba(112,58,18,${0.35 + R() * 0.3})`
      ctx.beginPath()
      ctx.ellipse(x, y, rx, ry, a, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = `rgba(255,238,195,${0.26 + R() * 0.2})`
      ctx.beginPath()
      ctx.ellipse(x + rx * 0.25, y + ry * 0.55, rx * 0.7, ry * 0.35, a, 0, Math.PI * 2)
      ctx.fill()
      bctx.fillStyle = `rgba(20,20,20,${0.5 + R() * 0.4})`
      bctx.beginPath()
      bctx.ellipse(x, y, rx, ry, a, 0, Math.PI * 2)
      bctx.fill()
    }
    for (let i = 0; i < 5200; i++) pore((0.5 + R() * 1.6) * k)
    for (let i = 0; i < 380; i++) pore((1.8 + R() * 2.4) * k)
    for (let i = 0; i < 26; i++) pore((4 + R() * 4) * k)
    // fine grain on both
    for (let i = 0; i < 14000; i++) {
      const x = R() * W
      const y = R() * H
      const v = R()
      ctx.fillStyle = v < 0.5 ? 'rgba(110,60,20,0.12)' : 'rgba(255,240,205,0.12)'
      ctx.fillRect(x, y, k * 0.6, k * 0.6)
      bctx.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)'
      bctx.fillRect(x, y, k * 0.6, k * 0.6)
    }
    // toasted rim of the face, then the crust's lip right on the edge
    ctx.save()
    outline(ctx)
    ctx.clip()
    ctx.filter = `blur(${7 * k}px)`
    ctx.strokeStyle = 'rgba(140,72,22,0.75)'
    ctx.lineWidth = 34 * k
    outline(ctx)
    ctx.stroke()
    ctx.filter = `blur(${1.5 * k}px)`
    ctx.strokeStyle = 'rgba(92,44,12,0.95)'
    ctx.lineWidth = 9 * k
    outline(ctx)
    ctx.stroke()
    ctx.restore()
    ctx.filter = 'none'
    bctx.save()
    bctx.filter = `blur(${2 * k}px)`
    bctx.strokeStyle = 'rgba(210,210,210,0.9)'
    bctx.lineWidth = 9 * k
    outline(bctx)
    bctx.stroke()
    bctx.restore()
    // the label, burnt in (set as the big one, see toastMaterials)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    let size = 80 * k
    ctx.font = `700 ${size}px Tinos, "Times New Roman", serif`
    while (ctx.measureText(label).width > W * 0.86) {
      size -= 2 * k
      ctx.font = `700 ${size}px Tinos, "Times New Roman", serif`
    }
    ctx.filter = `blur(${1.8 * k}px)`
    ctx.fillStyle = 'rgba(70,32,8,0.85)'
    ctx.fillText(label, W / 2, H * 0.2)
    ctx.filter = `blur(${0.25 * k}px)`
    ctx.fillStyle = 'rgba(28,12,3,0.97)'
    ctx.fillText(label, W / 2, H * 0.2)
    ctx.filter = 'none'
    const tex = (c: HTMLCanvasElement, srgb: boolean) => {
      const t = new THREE.CanvasTexture(c)
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
      t.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
      return t
    }
    const face = new THREE.MeshStandardMaterial({ map: tex(cnv, true), bumpMap: tex(bcnv, false), bumpScale: 2.2, roughness: 0.92 })
    // crust: deep brown, mottled, rough
    const [ccnv, cctx] = mk()
    cctx.fillStyle = '#7a3d14'
    cctx.fillRect(0, 0, W, H)
    const [cb, cbx] = mk()
    cbx.fillStyle = '#808080'
    cbx.fillRect(0, 0, W, H)
    for (let i = 0; i < 9000; i++) {
      const x = R() * W
      const y = R() * H
      const r = (0.6 + R() * 2.2) * k
      const v = R()
      cctx.fillStyle = v < 0.5 ? `rgba(60,26,6,${0.15 + R() * 0.25})` : `rgba(176,104,46,${0.12 + R() * 0.22})`
      cctx.beginPath()
      cctx.arc(x, y, r, 0, Math.PI * 2)
      cctx.fill()
      cbx.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)'
      cbx.beginPath()
      cbx.arc(x, y, r, 0, Math.PI * 2)
      cbx.fill()
    }
    const crust = new THREE.MeshStandardMaterial({ map: tex(ccnv, true), bumpMap: tex(cb, false), bumpScale: 2.5, roughness: 0.8 })
    return [face, crust]
  }

  /** golden-brown bread with a darker crust and the label burnt in. `big`: the label set as large as the drawn toaster's (see drawnLabel) — for the real slice
   *  that shows under the cursor on the drawn toaster, so the word doesn't shrink as it turns */
  private toastMaterials(label: string, big = false): THREE.Material[] {
    const W = 256
    const H = 228
    const cnv = document.createElement('canvas')
    cnv.width = W
    cnv.height = H
    const ctx = cnv.getContext('2d')!
    // crumb: warm toasted gradient + speckle
    const g = ctx.createRadialGradient(W / 2, H * 0.55, 10, W / 2, H * 0.55, W * 0.7)
    g.addColorStop(0, '#e9b56a')
    g.addColorStop(0.7, '#c98a3e')
    g.addColorStop(1, '#8a521f')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(90,45,10,0.18)' : 'rgba(255,225,170,0.16)'
      ctx.beginPath()
      ctx.arc(Math.random() * W, Math.random() * H, Math.random() * 2.2 + 0.4, 0, Math.PI * 2)
      ctx.fill()
    }
    // the label, burnt in: blurred dark brown with a scorched core
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    let size = big ? 80 : 64
    ctx.font = `700 ${size}px Tinos, "Times New Roman", serif`
    while (ctx.measureText(label).width > W * (big ? 0.86 : 0.74)) {
      size -= 2
      ctx.font = `700 ${size}px Tinos, "Times New Roman", serif`
    }
    ctx.filter = 'blur(3px)'
    ctx.fillStyle = 'rgba(70,32,8,0.85)'
    ctx.fillText(label, W / 2, H * 0.2)
    ctx.filter = 'blur(0.6px)'
    ctx.fillStyle = 'rgba(28,12,3,0.95)'
    ctx.fillText(label, W / 2, H * 0.2) // high on the slice: it shows above the toast in front
    ctx.filter = 'none'
    const tex = new THREE.CanvasTexture(cnv)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 })
    face.userData.label = label // (the drawn toaster sets it again, crisp — see drawnLabel)
    const crust = new THREE.MeshStandardMaterial({ color: 0x6e3a12, roughness: 0.8 })
    return [face, crust]
  }

  private onMove = (e: PointerEvent): void => {
    const r = this.canvas.getBoundingClientRect()
    this.ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
  }

  private onClick = (e: MouseEvent): void => {
    this.onMove(e as PointerEvent)
    this.pick3d() // what's under the click now, not as of the last frame
    if (!this.hit) {
      if (this.grow && this.open) this.close() // a click anywhere else closes it (and goes on)
      return
    }
    // ours: the page underneath doesn't get this click
    e.stopPropagation()
    e.preventDefault()
    const i = this.hit.userData.toast as number | undefined
    if (this.grow) {
      if (!this.open) {
        // tiny: one click grows it AND pops the slices (it's full size by the time they jump)
        this.open = true
        if (this.state === 'idle') this.press()
        return
      }
      if (i !== undefined && this.state === 'up') return this.pick(i)
      return this.close()
    }
    if (i !== undefined && this.state === 'up') return this.pick(i)
    if (this.state === 'idle') return this.press()
    if (this.state === 'up') this.dropAll()
  }

  /** what's under the pointer (only the toaster and toasts are clickable) */
  private pick3d(): void {
    this.ray.setFromCamera(this.ptr, this.camera)
    // closed: test against the resting pose, not the hover's partial swing
    const rest = this.grow && !this.open && this.g === 0
    if (rest) this.smallPose(0)
    this.root.updateMatrixWorld(true)
    const hits = this.ray.intersectObjects([this.body, this.lever, ...this.toasts.map((t) => t.mesh)], false)
    if (rest) this.smallPose(this.pose)
    this.root.updateMatrixWorld(true)
    this.hit = hits.length ? hits[0].object : null
    if (hits.length) this.hitLocal.copy(hits[0].point).applyMatrix4(hits[0].object.matrixWorld.clone().invert()) // (while un-lifted)
    if (this.hit === this.lever) this.hit = this.body
  }

  /** /toaster-grow: slices back in, and back to tiny */
  private close(): void {
    this.open = false
    this.leverY = 0
    this.dropAll()
    this.state = 'idle'
  }

  private press(): void {
    this.state = 'heating'
    this.leverY = 1
    // a beat in the slots, then up they go
    window.setTimeout(() => {
      if (this.state !== 'heating') return
      this.state = 'up'
      this.leverY = 0
      const fan = [0, 1, 2]
      this.toasts.forEach((t, i) => {
        t.vy = 9 + i * 1.6 // a real pop
        // the back ones end a little higher (the camera's height does the rest), but every
        // slice keeps its foot in its slot — none floats
        t.target = POP[fan[i]]
        t.tx = 0 // straight up out of its own slot
        t.trz = (i - 1) * -0.03
      })
    }, 650)
  }

  private dropAll(except = -1): void {
    this.toasts.forEach((t, i) => {
      if (i === except) return
      t.target = 0
      t.tx = 0
      t.trz = 0
    })
    if (except < 0) this.state = 'idle'
  }

  private pick(i: number): void {
    const t = this.toasts[i]
    if (!t.link.href) {
      // not built yet: it just sinks back with the rest
      this.dropAll()
      return
    }
    this.state = 'leaving'
    this.dropAll(i)
    t.vy = 14 // and it's off
    t.target = 6
    window.setTimeout(() => (window.location.href = t.link.href!), 380)
  }

  private frame = (): void => {
    const dt = Math.min(this.clock.getDelta(), 1 / 30)
    this.toastTime += dt
    this.toastTick.value = Math.floor(this.toastTime * 8)
    const time = this.clock.elapsedTime

    this.pick3d()
    const overToaster = this.hit === this.body
    setCursor('toaster', this.hit ? 'pointer' : '', PRIORITY.menu)

    // lever: pressed while heating, springs back on pop
    const ly = BODY_H * (0.82 - this.leverY * 0.5)
    this.lever.position.y += (ly - this.lever.position.y) * Math.min(1, dt * 18)
    // the red light comes on when it's done (toasts up), with a faint flicker
    const ready = this.state === 'up' ? 2.2 + Math.sin(time * 30) * 0.15 : 0
    this.readyLight.emissiveIntensity += (ready - this.readyLight.emissiveIntensity) * Math.min(1, dt * 12)

    // on hover it just lifts a touch (no shiver); it only rattles while it heats, after the click
    if (!this.grow) this.hover += ((overToaster ? 1 : 0) - this.hover) * Math.min(1, dt * 10)
    this.wobble = this.state === 'heating' ? Math.sin(time * 70) * 0.012 : 0
    this.root.rotation.z = this.wobble
    if (this.grow) {
      const want = this.open ? 1 : 0
      // closed, under the pointer it tips on a diagonal in place, so it reads as a button
      // (hit-tested in its resting pose — see pick3d — so the tip can't slip out from under the
      // pointer). Constant-rate runs, eased in AND out — no exponential snap at the end
      this.hover = THREE.MathUtils.clamp(this.hover + (!this.open && this.hit ? 1 : -1) * dt / HOVER_TIME, 0, 1)
      this.g = THREE.MathUtils.clamp(this.g + (want ? dt / GROW_TIME : -dt / SHRINK_TIME), 0, 1)
      const ease = (x: number) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2)
      const e = ease(this.g)
      this.smallPose(e)
      this.pose = e
      const h = ease(this.hover) * (1 - e)
      this.root.rotation.y -= h * HOVER_TURN
      this.root.rotation.x = h * HOVER_LEAN
    } else {
      this.root.position.y = this.hover * 0.04
    }

    for (const t of this.toasts) {
      const hovered = this.hit === t.mesh && this.state === 'up'
      // (/hero-drawn-giz-spread, -rise: the colour grows over the slice under the cursor, ~0.55 s,
      // and recedes the same way when it leaves)
      const g = this.toastGrows[this.toasts.indexOf(t)]
      if (g) {
        if (hovered && !g.was && g.k < 0.02) g.u.uCenter.value.set(this.hitLocal.x, this.hitLocal.y)
        g.was = hovered
        g.k = THREE.MathUtils.clamp(g.k + (hovered ? 1 : -1) * dt / 0.55, 0, 1)
        const a = g.k * g.k * (3 - 2 * g.k)
        g.u.uR.value = g.u.uMode.value > 0.5 ? THREE.MathUtils.lerp(-0.06, TOAST_H * 1.12, a) : a * 1.6
        g.over.visible = g.k > 0
      }
      // (/hero-drawn-giz-fade: the slice under the cursor turns real gradually, ~0.5 s each way)
      const f = this.toastFades[this.toasts.indexOf(t)]
      if (f) {
        f.k += ((hovered ? 1 : 0) - f.k) * Math.min(1, dt * 6)
        const a = f.k * f.k * (3 - 2 * f.k)
        for (const m of f.mats) m.opacity = a
        f.over.visible = a > 0.002
      }
      // (/hero-drawn-grab: the slice under the cursor turns real, all at once)
      if (this.toastRealOnHover) {
        const real = t.mesh.userData.realMaterial as THREE.Material[]
        const drawn = (t.mesh.userData.drawnMaterial ??= t.mesh.material) as THREE.Material[]
        t.mesh.material = hovered ? real : drawn
      }
      t.hover += ((hovered ? 1 : 0) - t.hover) * Math.min(1, dt * 26) // quick hand-off slice to slice
      // springy: launched by vy, gravity pulls it to its target, bounce settles
      const target = t.target
      t.vy += (-28 * (t.y - target) - 7 * t.vy) * dt
      t.y += t.vy * dt
      if (t.target === 0 && t.y < 0) {
        t.y = 0
        t.vy = 0
      }
      t.x += (t.tx - t.x) * Math.min(1, dt * 8)
      t.rz += (t.trz - t.rz) * Math.min(1, dt * 8)
    }
    this.toasts.forEach((t, i) => {
      // inside: the top of the slice just under the slot rim
      const inside = BODY_H + 0.06 - TOAST_H * 1.08 // (the domed top rises past TOAST_H)
      t.mesh.position.set(t.x, inside + t.y + t.hover * HOVER_LIFT, SLOTS_Z[i])
      t.mesh.rotation.z = t.rz
    })
    if (this.drawn) {
      if (this.drawnGlow) this.drawnGlow.value = Math.min(1, this.readyLight.emissiveIntensity)
      this.drawn.step(dt)
      this.drawn.normalPass(this.scene, this.camera, [this.root])
    }
    this.renderer.render(this.scene, this.camera)
  }
}


import * as THREE from 'three'

/**
 * The hover: target brackets. Resting the cursor on an object of the set puts four orange
 * corner brackets around it and a label above them — selector-style name + real size. Plain DOM
 * over the canvas; the box is the screen bounds of the object's vertices, projected each frame,
 * so it follows the camera. The click (Scan) pins it and closes it in as a lock-on.
 */

export const HUD = '#ff9a4d' // the hero's orange
const ARM = 18 // bracket arm, px
const GAP = 10 // brackets sit this far outside the object

/** GLB node name -> [tag, rest of the selector] */
const SELECTORS: Record<string, [string, string]> = {
  desk: ['desk', ''],
  monitor: ['monitor', ''],
  laptop_modern: ['laptop', ''],
  keyboard: ['keyboard', ''],
  mouse: ['mouse', ''],
  mug: ['mug', '.coffee'],
  notebook: ['notebook', ''],
  plant: ['plant', '.small'],
  desk_lamp: ['lamp', '.desk'],
  pendant: ['lamp', '.pendant'],
  employee: ['person', '#danilo'],
  office_chair: ['chair', '.office'],
  shelves: ['shelf', ''],
  trophy_42: ['trophy', ''],
  trophy_32: ['trophy', ''],
  certificate: ['certificate', ''],
  chess_king: ['chess-piece', '.king'],
  books: ['books', ''],
  racket_bag: ['bag', '.racket'],
  medal: ['medal', ''],
  racket: ['racket', ''],
  floor_plant: ['plant', ''],
  side_table: ['table', '.side'],
  chess: ['chessboard', ''],
  road_bike: ['bike', '.road'],
  trainer: ['bike-trainer', ''],
  riser: ['riser', ''],
}

export interface Target {
  node: THREE.Object3D // the set's top-level node, in the chalk scene
  box: THREE.Box3
  /** up to ~400 of its vertices, world space: projected each frame for a tight screen box (the
   *  3D box's corners balloon once the camera is close) */
  pts: THREE.Vector3[]
  tag: string
  rest: string
  dims: string
}

export class Inspect {
  private root = document.createElement('div')
  private corners = [0, 1, 2, 3].map(() => document.createElement('div'))
  private label = document.createElement('div')
  /** extra bracket spread, px (the lock-on closes it to 0) */
  extraPad = 0
  /** the label's rect in uv (x0, y0, x1, y1), and whether it's showing — the post darkens the
   *  scene under it so the orange always reads */
  readonly labelRect = new THREE.Vector4()
  labelShown = false
  /** last screen rect of the highlighted object, px */
  readonly rect = { x0: 0, y0: 0, x1: 0, y1: 0 }
  private boxes: Target[] = []
  private ray = new THREE.Raycaster()
  private mouse = new THREE.Vector2(-9, -9)
  current?: Target
  /** a clicked object: stays highlighted whatever the mouse does (while the camera flies to it) */
  pinned?: Target
  private corner = new THREE.Vector3()
  enabled = false

  constructor(scene: THREE.Object3D) {
    this.ray.layers.set(2) // the chalk pass's meshes live on layer 2
    scene.updateMatrixWorld(true)
    // one target per top-level node of the set (a node can hold several meshes)
    const byNode = new Map<THREE.Object3D, Target>()
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh || m.layers.mask !== 1 << 2) return // set meshes only (not ground/photos)
      let node: THREE.Object3D = m
      while (node.parent && node.parent.parent && node.parent.parent !== scene) node = node.parent
      let t = byNode.get(node)
      if (!t) {
        const key = node.name.replace(/\.\d+$/, '')
        const [tag, rest] = SELECTORS[key] ?? [key.replace(/_/g, '-'), '']
        t = { node, box: new THREE.Box3().setFromObject(node), pts: [], tag, rest, dims: '' }
        const sz = t.box.getSize(new THREE.Vector3())
        t.dims = `${sz.x.toFixed(2)} × ${sz.y.toFixed(2)} m`
        byNode.set(node, t)
        this.boxes.push(t)
      }
      const pos = m.geometry.getAttribute('position')
      const step = Math.max(1, Math.floor(pos.count / 400))
      for (let i = 0; i < pos.count; i += step) t.pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld))
    })

    const css = (el: HTMLElement, s: string) => el.setAttribute('style', s)
    css(this.root, 'position:fixed;inset:0;pointer-events:none;z-index:2;opacity:0;transition:opacity .12s')
    this.corners.forEach((c, i) => {
      const side = i & 1 ? 'right' : 'left'
      const vert = i & 2 ? 'bottom' : 'top'
      css(
        c,
        `position:fixed;width:${ARM}px;height:${ARM}px;box-sizing:border-box;border:0 solid ${HUD};` +
          `border-${side}-width:2px;border-${vert}-width:2px;filter:drop-shadow(0 0 3px ${HUD}88)`,
      )
    })
    css(
      this.label,
      `position:fixed;color:${HUD};white-space:nowrap;letter-spacing:.08em;text-transform:uppercase;` +
        'font:10px/1 Consolas,Menlo,"SF Mono",monospace;text-shadow:0 0 4px rgba(0,0,0,.8)',
    )
    this.root.append(...this.corners, this.label)
    document.body.appendChild(this.root)

    document.addEventListener('mousemove', (e) => {
      this.mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1)
    })
    document.addEventListener('mouseleave', () => this.mouse.set(-9, -9))
  }

  update(camera: THREE.Camera): void {
    if (!this.enabled) {
      this.current = undefined
      this.root.style.opacity = '0'
      this.labelShown = false
      return
    }
    // like the DOM: the element under the cursor is the innermost box containing it — so the
    // cursor between a shelf's bars still picks the shelf, and a medal on it picks the medal
    this.ray.setFromCamera(this.mouse, camera)
    let t: Target | undefined = this.pinned
    let best = t ? -Infinity : Infinity
    for (const c of this.boxes) {
      if (!this.ray.ray.intersectsBox(c.box)) continue
      const sz = c.box.getSize(this.corner)
      const vol = sz.x * sz.y * sz.z
      if (vol < best) {
        best = vol
        t = c
      }
    }
    // the person wins over whatever's around him (his chair's box is smaller and sits on him)
    // when the pointer is really on his body — the mesh, not just his box
    if (!this.pinned && t && t.tag !== 'person') {
      const man = this.boxes.find((c) => c.tag === 'person')
      if (man && this.ray.ray.intersectsBox(man.box) && this.ray.intersectObject(man.node, true).length) t = man
    }
    if (t !== this.current) {
      this.current = t
      if (t) this.label.textContent = `${t.tag}${t.rest}  ·  ${t.dims}`
    }
    this.root.style.opacity = t ? '1' : '0'
    this.labelShown = !!t
    if (!t) return

    // projected bounds, in px
    const w = window.innerWidth
    const h = window.innerHeight
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const p of t.pts) {
      this.corner.copy(p).project(camera)
      if (this.corner.z > 1) continue // behind the camera
      const px = (this.corner.x * 0.5 + 0.5) * w
      const py = (-this.corner.y * 0.5 + 0.5) * h
      x0 = Math.min(x0, px)
      x1 = Math.max(x1, px)
      y0 = Math.min(y0, py)
      y1 = Math.max(y1, py)
    }
    this.rect.x0 = x0
    this.rect.y0 = y0
    this.rect.x1 = x1
    this.rect.y1 = y1
    const g = GAP + this.extraPad
    this.corners.forEach((c, i) => {
      c.style.left = `${i & 1 ? x1 + g - ARM : x0 - g}px`
      c.style.top = `${i & 2 ? y1 + g - ARM : y0 - g}px`
    })
    this.label.style.left = `${x0 - g}px`
    this.label.style.top = `${y0 - g - 16}px`
    const b = this.label.getBoundingClientRect()
    this.labelRect.set(b.left / w, 1 - b.bottom / h, b.right / w, 1 - b.top / h)
  }
}

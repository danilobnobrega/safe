import * as THREE from 'three'
import gsap from 'gsap'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { Target } from './Inspect'

/**
 * TEST ?h=inspect, click: the camera flies in to the clicked object and a
 * DevTools "Styles"-pane card explains why it's there. Click anywhere / Esc to go back.
 *
 * (COLOR, off: the object also turned from chalk into its real materials — garage-color.glb.)
 * The coloured object is added to the chalk scene itself (same place, same geometry), so it's
 * occluded, reflected in the floor and run through the post chain like the rest of the room.
 */

/** why each object is there — the node's selector as the key. PLACEHOLDERS: Danilo writes these */
export const TEXTS: Record<string, string> = {}

// the object turning into its real colours: tried, turned off (Danilo: zoom yes, colour no).
// Off, garage-color.glb isn't even loaded
const COLOR = false
const FLY_TIME = 1.4 // s
const WHITE_IN = 0.8 // s, chalk -> colour

export class Focus {
  /** 0 = in the room, 1 = at the object */
  readonly t = { value: 0 }
  readonly pos = new THREE.Vector3()
  readonly look = new THREE.Vector3()
  active?: Target
  private color?: Promise<THREE.Object3D>
  private shown?: THREE.Object3D
  private fade = { value: 0 }
  private mats: THREE.MeshStandardMaterial[] = []
  private blend = new Set<THREE.Material>() // came in as alpha-blended (hair, clothes edges)
  private panel = document.createElement('div')
  private env: THREE.Texture

  constructor(
    private scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    loadColor: () => Promise<THREE.Object3D>,
  ) {
    if (COLOR) this.color = loadColor()
    const pmrem = new THREE.PMREMGenerator(renderer)
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    // light for the coloured objects only (the chalk shaders ignore lights)
    const hemi = new THREE.HemisphereLight(0xffffff, 0x404040, 1.2)
    const sun = new THREE.DirectionalLight(0xffffff, 1.1)
    sun.position.set(2, 4, 3)
    scene.add(hemi, sun)

    this.panel.setAttribute(
      'style',
      'position:fixed;z-index:3;pointer-events:none;opacity:0;transition:opacity .35s;' +
        'background:#fff;color:#222;border:1px solid #cacdd1;border-radius:3px;padding:10px 14px;' +
        'font:12px/1.55 Consolas,Menlo,"SF Mono",monospace;box-shadow:0 2px 12px rgba(0,0,0,.35);' +
        'max-width:min(34vw,420px);',
    )
    document.body.appendChild(this.panel)
    this.layoutPanel()
    window.addEventListener('resize', this.layoutPanel)
  }

  private layoutPanel = (): void => {
    const narrow = window.innerWidth < window.innerHeight
    const s = this.panel.style
    if (narrow) {
      s.left = '16px'
      s.right = '16px'
      s.top = ''
      s.bottom = '24px'
      s.transform = ''
      s.maxWidth = 'none'
    } else {
      s.left = '58%'
      s.right = ''
      s.top = '50%'
      s.bottom = ''
      s.transform = 'translateY(-50%)'
      s.maxWidth = 'min(34vw,420px)'
    }
  }

  /** fly to `target`, starting from where the room camera is now */
  async open(target: Target, camera: THREE.PerspectiveCamera, from: THREE.Vector3): Promise<void> {
    if (this.active) return
    this.active = target
    focusPose(target, camera, from, this.pos, this.look)

    const sel = `${target.tag}${target.rest}`
    const text = TEXTS[sel] ?? `[placeholder] por que ${sel} está aqui — texto do Danilo`
    this.panel.innerHTML =
      `<div style="color:#9a9a9a">element.style {<br>}</div>` +
      `<div style="margin-top:6px"><span style="color:#881280">${target.tag}</span>` +
      `<span style="color:#1a1aa6">${target.rest}</span> {</div>` +
      `<div style="padding-left:2ch;color:#236e25;white-space:normal">/* ${text} */</div>` +
      `<div>}</div>` +
      `<div style="margin-top:8px;color:#9a9a9a;font-size:11px">esc</div>`

    gsap.to(this.t, { value: 1, duration: FLY_TIME, ease: 'power3.inOut', overwrite: true })
    gsap.delayedCall(FLY_TIME * 0.7, () => {
      if (this.active === target) this.panel.style.opacity = '1'
    })

    // the coloured twin (the file loads in the background from the start)
    if (!COLOR) return
    const root = await this.color
    if (!root || this.active !== target) return
    const twin = root.getObjectByName(target.node.name)?.clone(true)
    if (!twin) return
    this.mats = []
    this.blend.clear()
    twin.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const src = (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]
      const mats = src.map((s) => {
        const c = s.clone()
        // the pipeline shows raw values (no colour management): read textures raw, and take the
        // linear glTF factors to display values
        for (const tex of [c.map, c.emissiveMap]) if (tex) tex.colorSpace = THREE.NoColorSpace
        c.color.convertLinearToSRGB()
        c.envMap = this.env
        c.envMapIntensity = 0.9
        c.fog = false
        // glTF BLEND materials come without depth writes, which lets the (transparent) photo
        // columns paint through the figure: write depth, and keep the cut-outs as alpha test
        if (s.transparent) this.blend.add(c)
        c.depthWrite = true
        c.transparent = true
        c.opacity = 0
        c.polygonOffset = true // drawn over the chalk twin until that one is hidden
        c.polygonOffsetFactor = -1
        c.polygonOffsetUnits = -1
        this.mats.push(c)
        return c
      })
      m.material = Array.isArray(m.material) ? mats : mats[0]
      m.renderOrder = 10
    })
    this.shown = twin
    this.scene.add(twin)
    this.fade.value = 0
    gsap.to(this.fade, {
      value: 1,
      duration: WHITE_IN,
      delay: Math.max(0, FLY_TIME * 0.45),
      ease: 'power2.inOut',
      overwrite: true,
      onUpdate: () => this.mats.forEach((c) => (c.opacity = this.fade.value)),
      onComplete: () => {
        if (this.active !== target) return
        target.node.visible = false
        this.mats.forEach((c) => {
          c.transparent = false
          c.alphaTest = this.blend.has(c) ? 0.5 : 0
          c.needsUpdate = true
        })
      },
    })
  }

  close(): void {
    const target = this.active
    if (!target) return
    this.active = undefined
    target.node.visible = true
    this.panel.style.opacity = '0'
    const twin = this.shown
    this.mats.forEach((c) => {
      c.transparent = true
      c.alphaTest = 0
      c.needsUpdate = true
    })
    gsap.to(this.fade, {
      value: 0,
      duration: 0.45,
      ease: 'power2.in',
      overwrite: true,
      onUpdate: () => this.mats.forEach((c) => (c.opacity = this.fade.value)),
      onComplete: () => {
        if (twin) this.scene.remove(twin)
        if (this.shown === twin) this.shown = undefined
      },
    })
    gsap.to(this.t, { value: 0, duration: FLY_TIME * 0.9, ease: 'power3.inOut', overwrite: true })
  }
}

/** where the camera ends up: in front of the object, framed on the left, the card on the right */
export function focusPose(
  target: Target,
  camera: THREE.PerspectiveCamera,
  from: THREE.Vector3,
  pos: THREE.Vector3,
  look: THREE.Vector3,
): void {
  const c = target.box.getCenter(new THREE.Vector3())
  const s = target.box.getSize(new THREE.Vector3())
  const dir = from.clone().sub(c)
  dir.y *= 0.4
  dir.normalize()
  const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
  const tanX = tanY * camera.aspect
  const fitH = (s.y * 0.5) / tanY
  const fitW = (Math.max(s.x, s.z) * 0.5) / tanX
  const dist = THREE.MathUtils.clamp(Math.max(fitH, fitW) * 2.4, 0.6, 4)
  pos.copy(c).addScaledVector(dir, dist)
  pos.y = Math.max(pos.y, 0.25)
  // shift the aim to the right so the object sits in the left part of the frame
  const right = new THREE.Vector3().crossVectors(dir.clone().negate(), new THREE.Vector3(0, 1, 0)).normalize()
  const narrow = camera.aspect < 1
  look.copy(c)
  if (narrow) look.y -= dist * tanY * 0.35 // card at the bottom: object in the upper part
  else look.addScaledVector(right, dist * tanX * 0.33)
}

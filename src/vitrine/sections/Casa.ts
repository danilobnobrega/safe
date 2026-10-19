import * as THREE from 'three'
import { Section, svgCursor, type Rect } from '../Vitrine'

/**
 * Casa Areia — a real-estate launch. The technique: the scroll-driven camera (Igloo, Lusion's
 * scrollytelling): the scroll is the camera, flying a set path through a 3D scene while the copy comes
 * and goes. The look is an architect's maquette — one sand-coloured material for everything, glass
 * barely there, soft sun and long soft shadows, a light haze — the house you can't visit yet. Thin
 * grotesque type, airy, a crosshair cursor.
 */

const SAND = 0xe9e1d2
const SKY = 0xefe9de

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export class Casa extends Section {
  private scene = new THREE.Scene()
  private cam = new THREE.PerspectiveCamera(32, 1, 0.1, 400)
  private path!: THREE.CatmullRomCurve3
  private look!: THREE.CatmullRomCurve3
  private eased = 0
  private copy: { el: HTMLElement; at: [number, number] }[] = []

  init(r: THREE.WebGLRenderer): void {
    r.shadowMap.enabled = true
    r.shadowMap.type = THREE.PCFSoftShadowMap
    this.pin.style.cursor = svgCursor(
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path d="M16 4v9M16 19v9M4 16h9M19 16h9" stroke="#3b3a33" stroke-width="1.2"/></svg>',
      16,
      16,
      'crosshair',
    )
    this.scene.background = new THREE.Color(SKY)
    this.scene.fog = new THREE.Fog(SKY, 40, 140)
    const mat = new THREE.MeshStandardMaterial({ color: SAND, roughness: 0.92, metalness: 0 })
    const dark = new THREE.MeshStandardMaterial({ color: 0xd6cdbc, roughness: 0.95 })
    const glass = new THREE.MeshStandardMaterial({ color: 0xcfd6d4, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.32 })
    const water = new THREE.MeshStandardMaterial({ color: 0xbfd2cf, roughness: 0.08, metalness: 0.1 })
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material = mat) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
      b.position.set(x, y + h / 2, z)
      b.castShadow = b.receiveShadow = true
      this.scene.add(b)
      return b
    }
    // the ground: a slab of sand, a deck, the pool cut in
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.scene.add(ground)
    box(26, 0.3, 14, 2, 0, 4, dark) // the deck
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(14, 4.2), water)
    pool.rotation.x = -Math.PI / 2
    pool.position.set(4, 0.31, 8.4)
    pool.receiveShadow = true
    this.scene.add(pool)
    box(14.6, 0.32, 0.3, 4, 0, 6.15, mat) // the pool's coping
    box(14.6, 0.32, 0.3, 4, 0, 10.65, mat)
    // ground floor: one long room — floor, back and end walls, the roof slab overhanging the glass
    // front, a few maquette pieces of furniture inside
    box(18, 0.3, 8.2, 0, 0, -2.9, dark)
    box(18, 3.2, 0.3, 0, 0.3, -6.85)
    box(0.3, 3.2, 8.2, -8.85, 0.3, -2.9)
    box(0.3, 3.2, 8.2, 8.85, 0.3, -2.9)
    box(18, 0.25, 9.6, 0, 3.5, -2.2)
    box(4.2, 0.42, 1.0, -3, 0.3, -5.6) // sofa
    box(4.2, 0.8, 0.25, -3, 0.3, -6.2)
    box(1.6, 0.38, 1.6, -3, 0.3, -3.9) // low table
    box(2.6, 0.04, 1.1, 4.2, 1.05, -3.6) // dining table top, on two plinths
    box(0.12, 0.75, 0.9, 3.2, 0.3, -3.6)
    box(0.12, 0.75, 0.9, 5.2, 0.3, -3.6)
    box(0.5, 2.6, 0.5, 7.6, 0.3, -6.2) // a tall piece in the corner
    for (let i = 0; i <= 6; i++) box(0.18, 3.2, 0.18, -9 + i * 3, 0.3, 1.2)
    const g1 = new THREE.Mesh(new THREE.BoxGeometry(18, 3.2, 0.05), glass)
    g1.position.set(0, 0.3 + 1.6, 1.2)
    this.scene.add(g1)
    // upper floor: a box turned 90° and cantilevered off the end over the deck
    box(7, 3, 15, 6.5, 3.75, -1.5)
    box(7.6, 0.22, 15.6, 6.5, 6.75, -1.5)
    const g2 = new THREE.Mesh(new THREE.BoxGeometry(5.4, 2.2, 0.05), glass)
    g2.position.set(6.5, 3.75 + 1.4, 6.02)
    this.scene.add(g2)
    // a wall that runs out into the landscape, and a stair of plinths down to the sand
    box(0.4, 2.4, 22, -11, 0, -1)
    for (let i = 0; i < 5; i++) box(4, 0.3 - i * 0.05, 1.1, -4, -0.05 * i, 11.6 + i * 1.1, dark)
    // trees as the maquette makers do them: tall smooth cypress forms, and round crowns on thin trunks
    const crown = new THREE.SphereGeometry(1, 24, 16)
    const tree = (x: number, z: number, h: number, round: boolean) => {
      const g = new THREE.Group()
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, round ? h * 0.55 : h * 0.2, 8), mat)
      trunk.position.y = (round ? h * 0.55 : h * 0.2) / 2
      const top = new THREE.Mesh(crown, mat)
      if (round) {
        top.scale.set(h * 0.32, h * 0.28, h * 0.32)
        top.position.y = h * 0.7
      } else {
        top.scale.set(h * 0.13, h * 0.5, h * 0.13)
        top.position.y = h * 0.6
      }
      for (const m of [trunk, top]) {
        m.castShadow = m.receiveShadow = true
        g.add(m)
      }
      g.position.set(x, 0, z)
      this.scene.add(g)
    }
    let s = 5
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 9; i++) tree(-16 + i * 1.6 + rnd(), -12 - rnd() * 3, 7 + rnd() * 2, false)
    for (let i = 0; i < 14; i++) {
      const a = rnd() * Math.PI * 2
      const d = 22 + rnd() * 26
      tree(Math.cos(a) * d, Math.sin(a) * d - 4, 4 + rnd() * 3, rnd() > 0.4)
    }
    tree(15, 9, 5.5, true)
    tree(-14, 10, 4.8, true)
    // light: a low warm sun with long soft shadows, a sky fill
    this.scene.add(new THREE.HemisphereLight(0xfff7ea, 0xb9ae9a, 1.2))
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.6)
    sun.position.set(-30, 26, 18)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.left = sun.shadow.camera.bottom = -40
    sun.shadow.camera.right = sun.shadow.camera.top = 40
    sun.shadow.camera.far = 120
    sun.shadow.radius = 6
    sun.shadow.bias = -0.0004
    sun.shadow.normalBias = 0.04
    this.scene.add(sun)
    // the colours as picked, no film curve: the haze then meets the sky without a seam
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined
      if (m) m.toneMapped = false
    })
    // the flight: high over the plot → down to eye level → in through the glass → out to the pool
    this.path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-46, 38, 46),
      new THREE.Vector3(-30, 16, 34),
      new THREE.Vector3(-12, 3.2, 22),
      new THREE.Vector3(-3, 1.8, 8),
      new THREE.Vector3(-2, 1.65, 2.6),
      new THREE.Vector3(-1.5, 1.6, -1.5),
      new THREE.Vector3(-4.6, 1.55, -4.4),
    ])
    this.look = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 2, -2),
      new THREE.Vector3(0, 2.5, -2),
      new THREE.Vector3(1, 2.4, -2),
      new THREE.Vector3(0, 1.7, -4),
      new THREE.Vector3(2, 1.5, -5),
      new THREE.Vector3(6, 1.3, 2),
      new THREE.Vector3(8, 1.0, 10),
    ])
    // the copy, in and out with the flight
    const add = (html: string, css: string, at: [number, number]) => {
      const el = document.createElement('div')
      el.innerHTML = html
      el.setAttribute('style', `position:absolute;font-family:Manrope,sans-serif;color:#3b3a33;opacity:0;transition:none;${css}`)
      this.pin.appendChild(el)
      this.copy.push({ el, at })
    }
    add('<div style="font-weight:500;font-size:14px;letter-spacing:.3em;text-transform:uppercase">Casa Areia</div>', 'left:56px;top:48px', [-1, 2])
    add('<div style="font-weight:300;font-size:13px;letter-spacing:.18em;text-transform:uppercase">Trancoso · Bahia</div>', 'right:56px;top:48px', [-1, 2])
    add('<div style="font-weight:200;font-size:clamp(48px,7vw,120px);line-height:.95;letter-spacing:-.02em">A house<br>made of sand.</div>', 'left:56px;bottom:72px', [-1, 0.28])
    add('<div style="font-weight:300;font-size:15px;line-height:1.7;max-width:280px">620 m² facing the dunes. Four suites, one long room of glass, a pool that runs to the edge of the deck.</div>', 'right:56px;bottom:80px', [0.3, 0.62])
    add('<div style="font-weight:200;font-size:clamp(40px,5.5vw,92px);line-height:1;letter-spacing:-.02em">Light,<br>all day long.</div>', 'left:56px;bottom:72px', [0.62, 2])
    add('<div style="font-weight:400;font-size:13px;letter-spacing:.24em;text-transform:uppercase;border-bottom:1px solid currentColor;padding-bottom:6px">Book a visit</div>', 'right:56px;bottom:80px', [0.8, 2])
  }

  frame(r: THREE.WebGLRenderer, dt: number, rect: Rect): void {
    // the camera eases after the scroll (a flight, not a scrub)
    this.eased += (this.progress - this.eased) * (1 - Math.exp(-dt * 4))
    const t = this.eased
    this.cam.position.copy(this.path.getPoint(t))
    // a faint drift with the cursor: the eye looks around
    const lk = this.look.getPoint(t)
    lk.x += (this.pointer.inside ? this.pointer.x - 0.5 : 0) * 1.5
    lk.y -= (this.pointer.inside ? this.pointer.y - 0.5 : 0) * 0.8
    this.cam.lookAt(lk)
    this.cam.aspect = rect.w / rect.h
    this.cam.updateProjectionMatrix()
    for (const c of this.copy) {
      const o = smooth(c.at[0], c.at[0] + 0.06, t) * (1 - smooth(c.at[1] - 0.06, c.at[1], t))
      c.el.style.opacity = o.toFixed(3)
      c.el.style.transform = `translateY(${((1 - o) * 14).toFixed(1)}px)`
    }
    r.setClearColor(SKY, 1)
    r.clear()
    r.render(this.scene, this.cam)
  }
}

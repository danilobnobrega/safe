import * as THREE from 'three'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { Section, svgCursor, type Rect } from '../Vitrine'

/**
 * Ardent — high jewellery. The technique: the physically based product shot (oryzo, the luxury
 * launches): a gold band and a brilliant-cut stone, the gold reflecting a photographed studio, the
 * stone refracting it — index of diamond, light split into colours (dispersion). Silence around it:
 * almost white, the thinnest serif, nothing moves but the ring — and it only turns while the cursor
 * rests; move, and it stops and leans toward you. The cursor is a glint.
 */

/** a round brilliant, near enough: table, crown, girdle, pavilion — faceted (flat shaded) */
function brilliant(): THREE.BufferGeometry {
  const prof = [
    new THREE.Vector2(0.0001, -0.86), // culet
    new THREE.Vector2(1, -0.02), // girdle
    new THREE.Vector2(1, 0.02),
    new THREE.Vector2(0.78, 0.22), // crown, star facets
    new THREE.Vector2(0.55, 0.34), // table edge
    new THREE.Vector2(0.0001, 0.34),
  ]
  const g = new THREE.LatheGeometry(prof, 16).toNonIndexed()
  g.computeVertexNormals()
  return g
}

export class Jewel extends Section {
  private scene = new THREE.Scene()
  private cam = new THREE.PerspectiveCamera(28, 1, 0.1, 100)
  private ring = new THREE.Group()
  private still = 0
  private lastPx = -1
  private lastPy = -1
  private spin = 0.7 // starts at three-quarters: the band reads as a hoop
  private tilt = new THREE.Vector2()

  async init(r: THREE.WebGLRenderer): Promise<void> {
    this.pin.style.cursor = svgCursor(
      '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><path d="M14 2 L15.3 12.7 L26 14 L15.3 15.3 L14 26 L12.7 15.3 L2 14 L12.7 12.7 Z" fill="#b8955a"/></svg>',
      14,
      14,
    )
    await document.fonts.load('300 60px "Cormorant Garamond"')
    const hdr = await new RGBELoader().loadAsync(`${import.meta.env.BASE_URL}hero/tunnel/studio_1k.hdr`)
    hdr.mapping = THREE.EquirectangularReflectionMapping
    const pm = new THREE.PMREMGenerator(r)
    this.scene.environment = pm.fromEquirectangular(hdr).texture
    // the stone gets a jeweller's light box of its own: dark, with a few hard strip lights — a diamond
    // only sparkles against contrast (lit by the bright studio it read as white plastic)
    const box = new THREE.Scene()
    box.background = new THREE.Color(0x050505)
    const strip = (w: number, h: number, x: number, y: number, z: number, k = 6) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }))
      m.position.set(x, y, z)
      m.lookAt(0, 0, 0)
      box.add(m)
    }
    strip(6, 1.2, 0, 6, 2)
    strip(1, 6, -6, 1, 1)
    strip(1, 6, 6, 1, 1)
    strip(5, 0.6, 0, -1, 6, 3)
    strip(2, 2, -3, 4, -5, 4)
    strip(2, 2, 4, 3, -4, 4)
    const stoneEnv = pm.fromScene(box, 0).texture
    pm.dispose()
    hdr.dispose()
    // the band: a slim rounded gold ring
    const gold = new THREE.MeshPhysicalMaterial({ color: 0xe8c27a, metalness: 1, roughness: 0.14, clearcoat: 0.3 })
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.11, 48, 220), gold)
    band.scale.set(1, 1, 1.6)
    this.ring.add(band)
    // the setting: four claws holding the stone over the band
    const stone = new THREE.Mesh(
      brilliant(),
      new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0, transmission: 1, thickness: 1.2, ior: 2.42, dispersion: 5, envMap: stoneEnv, envMapIntensity: 2.2, specularIntensity: 1, flatShading: true }),
    )
    stone.scale.setScalar(0.46)
    stone.position.y = 1.25 + 0.11 + 0.36
    this.ring.add(stone)
    // four claws: thin, leaning in over the girdle, rounded at the tip
    const tipG = new THREE.SphereGeometry(0.034, 16, 12)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      const from = new THREE.Vector3(Math.cos(a) * 0.3, 1.3, Math.sin(a) * 0.3)
      const to = new THREE.Vector3(Math.cos(a) * 0.44, stone.position.y + 0.06, Math.sin(a) * 0.44)
      const len = from.distanceTo(to)
      const claw = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, len, 14), gold)
      claw.position.copy(from).lerp(to, 0.5)
      claw.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize())
      this.ring.add(claw)
      const tip = new THREE.Mesh(tipG, gold)
      tip.position.copy(to)
      this.ring.add(tip)
    }
    this.ring.scale.setScalar(0.72)
    this.ring.position.y = -0.4
    this.scene.add(this.ring)
    this.cam.position.set(0, 0.6, 7.2)
    this.cam.lookAt(0, 0.3, 0)
    const ui = document.createElement('div')
    ui.innerHTML = `<div style="position:absolute;left:0;right:0;top:44px;text-align:center;font:300 15px/1 'Cormorant Garamond';letter-spacing:.6em;color:#2a2622">A R D E N T</div>
      <div style="position:absolute;left:56px;bottom:72px;font:300 clamp(40px,5vw,84px)/1 'Cormorant Garamond';color:#2a2622;letter-spacing:-.01em">Solitaire<br><span style="font-style:italic">Nº 7</span></div>
      <div style="position:absolute;left:56px;top:50%;font:300 12px/2 'Cormorant Garamond';letter-spacing:.32em;color:#8a8178">1,02 CT · D · IF<br>OR JAUNE 18 CT</div>
      <div style="position:absolute;right:56px;bottom:78px;font:300 13px/1 'Cormorant Garamond';letter-spacing:.3em;color:#2a2622;border-bottom:1px solid #b8955a;padding-bottom:8px">SUR RENDEZ-VOUS</div>`
    ui.setAttribute('style', 'position:absolute;inset:0;pointer-events:none')
    this.pin.appendChild(ui)
  }

  frame(r: THREE.WebGLRenderer, dt: number, rect: Rect): void {
    this.cam.aspect = rect.w / rect.h
    this.cam.updateProjectionMatrix()
    // rest: the cursor hasn't moved for a moment (or isn't here) — then it turns
    const moved = this.pointer.inside && (Math.abs(this.pointer.px - this.lastPx) > 0.5 || Math.abs(this.pointer.py - this.lastPy) > 0.5)
    this.lastPx = this.pointer.px
    this.lastPy = this.pointer.py
    this.still = moved ? 0 : this.still + dt
    const turning = this.still > 0.6 ? Math.min(1, (this.still - 0.6) / 1.2) : 0
    this.spin += dt * 0.45 * turning
    // moving, it leans toward the cursor
    const tx = this.pointer.inside ? (this.pointer.x - 0.5) * 0.8 : 0
    const ty = this.pointer.inside ? (this.pointer.y - 0.5) * 0.5 : 0
    this.tilt.x += (ty - this.tilt.x) * Math.min(1, dt * 3)
    this.tilt.y += (tx - this.tilt.y) * Math.min(1, dt * 3)
    this.ring.rotation.set(0.32 + this.tilt.x, this.spin + this.tilt.y, 0)
    this.ring.position.x = rect.w > 900 ? 0.9 : 0
    r.setClearColor(0xf5f3ef, 1)
    r.clear()
    r.render(this.scene, this.cam)
  }
}

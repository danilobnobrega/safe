import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { Section, canvasTexture, svgCursor, type Rect } from '../Vitrine'

/**
 * Tombo — a toy shop. The technique: real-time physics (the falling, stacking, shoved-around pieces
 * of so many award sites): glossy plastic toys pour into the panel as it arrives and pile up; the
 * cursor is a hand in the world — it shoves them, and a click flicks the ones under it into the air.
 * Primary colours, chunky rounded type, a sky-blue floor, a cartoon hand for a cursor.
 */

const COLOURS = [0xe63b2e, 0xf6c21c, 0x2a6fdb, 0x2fa65a, 0xff7f3f, 0x8c4fd6]
const LETTERS = 'TOMBO'
const BG = 0x9fd3f2
const CAM_Z = 15

/** Rapier is one wasm for the page: the hero's cookie pile initialises it — wait for that (a second
 *  init re-instantiates the wasm under the pile's live world); without the hero, init it here */
async function rapierReady(): Promise<void> {
  const ok = () => {
    try {
      new RAPIER.World({ x: 0, y: 0, z: 0 }).free()
      return true
    } catch {
      return false
    }
  }
  const hero = !!document.getElementById('stage')
  for (let t = 0; hero && t < 6000; t += 100) {
    if (ok()) return
    await new Promise((r) => setTimeout(r, 100))
  }
  if (!ok()) await RAPIER.init()
}

type Toy = { mesh: THREE.Object3D; body: RAPIER.RigidBody }

export class Toys extends Section {
  private scene = new THREE.Scene()
  private cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100)
  private world?: RAPIER.World
  private toys: Toy[] = []
  private hand?: RAPIER.RigidBody
  private queue: (() => void)[] = []
  private poured = false
  private dropT = 0
  private halfW = 6
  private halfH = 3.4
  private walls: RAPIER.Collider[] = []
  private aspect = 0
  private wasDown = false
  private ray = new THREE.Raycaster()
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0)

  async init(r: THREE.WebGLRenderer): Promise<void> {
    this.pin.style.cursor = svgCursor(
      '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><path d="M14 22V8a3 3 0 0 1 6 0v10V5a3 3 0 0 1 6 0v13V7a3 3 0 0 1 6 0v12V11a3 3 0 0 1 6 0v15c0 8-5 14-13 14h-2c-5 0-8-3-11-7l-6-8a3 3 0 0 1 5-4z" fill="#fff" stroke="#1d1d1b" stroke-width="2.2" stroke-linejoin="round"/></svg>',
      22,
      6,
      'pointer',
    )
    await Promise.all(['700 40px "Baloo 2"', '800 40px "Baloo 2"'].map((f) => document.fonts.load(f)))
    this.scene.background = new THREE.Color(BG)
    const pm = new THREE.PMREMGenerator(r)
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.5
    pm.dispose()
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8fb8d0, 0.35))
    const sun = new THREE.DirectionalLight(0xffffff, 2.2)
    sun.position.set(-4, 10, 8)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.left = sun.shadow.camera.bottom = -12
    sun.shadow.camera.right = sun.shadow.camera.top = 12
    sun.shadow.radius = 5
    sun.shadow.normalBias = 0.02
    this.scene.add(sun)
    // the floor: the back of the box the toys are poured into, seen from the front
    // the colour itself, unlit; the toys' shadows on a layer just over it
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ color: BG, toneMapped: false }))
    floor.position.z = -1.21
    this.scene.add(floor)
    const shade = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ color: 0x1b4a6b, opacity: 0.22 }))
    shade.position.z = -1.2
    shade.receiveShadow = true
    this.scene.add(shade)
    this.cam.position.set(0, 0, CAM_Z)
    this.cam.lookAt(0, 0, 0)
    // the copy
    const copy = document.createElement('div')
    copy.innerHTML = `
      <div style="position:absolute;left:48px;top:36px;font:800 34px/1 'Baloo 2';color:#1d1d1b;letter-spacing:-.01em">tombo<span style="color:#e63b2e">!</span></div>
      <div style="position:absolute;right:48px;top:44px;display:flex;gap:28px;font:700 17px/1 'Baloo 2';color:#1d1d1b"><span>blocks</span><span>balls</span><span>wheels</span><span style="background:#f6c21c;padding:6px 14px;border-radius:999px;margin-top:-6px">cart (0)</span></div>
      <div style="position:absolute;left:48px;top:118px;font:800 clamp(44px,6.4vw,104px)/.92 'Baloo 2';color:#1d1d1b;letter-spacing:-.02em">build it.<br>knock it down.</div>
      <div style="position:absolute;right:48px;top:128px;font:700 16px/1.4 'Baloo 2';color:#1d1d1b;text-align:right">push them around<br>click to toss</div>`
    copy.setAttribute('style', 'position:absolute;inset:0;pointer-events:none')
    this.pin.appendChild(copy)
    await rapierReady()
    this.world = new RAPIER.World({ x: 0, y: -22, z: 0 })
    // the back of the box and its front glass keep the pieces in one slab of depth
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(50, 50, 0.5).setTranslation(0, 0, -1.7))
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(50, 50, 0.5).setTranslation(0, 0, 2.2))
    // the hand: a kinematic ball that follows the cursor
    this.hand = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 40, 0))
    this.world.createCollider(RAPIER.ColliderDesc.ball(0.7), this.hand)
    this.build()
  }

  /** the toys, made once and queued to drop in when the panel first shows */
  private build(): void {
    const plastic = (c: number) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12 })
    let s = 3
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    const letterMat = (ch: string, c: number) => {
      const tex = canvasTexture(256, 256, (g) => {
        g.fillStyle = `#${new THREE.Color(c).getHexString()}`
        g.fillRect(0, 0, 256, 256)
        g.fillStyle = '#fff'
        g.font = '800 200px "Baloo 2"'
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillText(ch, 128, 146)
      })
      return new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 })
    }
    const add = (mesh: THREE.Mesh, desc: RAPIER.ColliderDesc) => {
      mesh.castShadow = mesh.receiveShadow = true
      ;(mesh.material as THREE.Material).toneMapped = false // primaries stay primaries
      this.queue.push(() => {
        const x = (rnd() - 0.5) * this.halfW * 1.4
        const body = this.world!.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(x, this.halfH + 2 + rnd() * 3, (rnd() - 0.5) * 1.2)
            .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3)))
            .setLinvel((rnd() - 0.5) * 3, -4, 0)
            .setAngvel({ x: (rnd() - 0.5) * 6, y: (rnd() - 0.5) * 6, z: (rnd() - 0.5) * 6 })
            .setCcdEnabled(true),
        )
        this.world!.createCollider(desc.setRestitution(0.35).setFriction(0.7), body)
        this.scene.add(mesh)
        this.toys.push({ mesh, body })
      })
    }
    // the letter blocks first, then everything else mixed
    for (const [i, ch] of [...LETTERS].entries()) {
      const c = COLOURS[i % COLOURS.length]
      const geo = new RoundedBoxGeometry(1.3, 1.3, 1.3, 4, 0.16)
      const m = letterMat(ch, c)
      add(new THREE.Mesh(geo, m), RAPIER.ColliderDesc.roundCuboid(0.49, 0.49, 0.49, 0.16))
    }
    for (let i = 0; i < 40; i++) {
      const c = COLOURS[Math.floor(rnd() * COLOURS.length)]
      const k = rnd()
      if (k < 0.3) {
        const r = 0.45 + rnd() * 0.35
        add(new THREE.Mesh(new THREE.SphereGeometry(r, 40, 24), plastic(c)), RAPIER.ColliderDesc.ball(r))
      } else if (k < 0.62) {
        const w = 0.9 + rnd() * 1.4
        add(new THREE.Mesh(new RoundedBoxGeometry(w, 0.9, 0.9, 4, 0.14), plastic(c)), RAPIER.ColliderDesc.roundCuboid(w / 2 - 0.14, 0.31, 0.31, 0.14))
      } else if (k < 0.82) {
        const g = new THREE.CylinderGeometry(0.5, 0.5, 0.9, 40)
        add(new THREE.Mesh(g, plastic(c)), RAPIER.ColliderDesc.cylinder(0.45, 0.5))
      } else {
        // a ring (a stacking-toy donut): its collider a fat cylinder, close enough at this size
        const g = new THREE.TorusGeometry(0.5, 0.24, 24, 48)
        add(new THREE.Mesh(g, plastic(c)), RAPIER.ColliderDesc.cylinder(0.24, 0.74).setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))))
      }
    }
  }

  /** the walls at the panel's edges (and the floor at its bottom), sized to what the camera sees */
  private fit(aspect: number): void {
    if (!this.world || aspect === this.aspect) return
    this.aspect = aspect
    this.halfH = Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2)) * CAM_Z
    this.halfW = this.halfH * aspect
    for (const c of this.walls) this.world.removeCollider(c, false)
    const W = this.halfW
    const H = this.halfH
    this.walls = [
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(W + 2, 1, 4).setTranslation(0, -H - 1 + 0.15, 0)),
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(1, H * 4, 4).setTranslation(-W - 1, H, 0)),
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(1, H * 4, 4).setTranslation(W + 1, H, 0)),
    ]
  }

  frame(r: THREE.WebGLRenderer, dt: number, rect: Rect): void {
    const aspect = rect.w / rect.h
    this.cam.aspect = aspect
    this.cam.updateProjectionMatrix()
    this.fit(aspect)
    const w = this.world
    if (w && this.hand) {
      // pour the toys in, a few at a time, the first time the panel is mostly on screen
      if (!this.poured && rect.y < rect.h * 0.35) this.poured = true
      if (this.poured && this.queue.length) {
        this.dropT -= dt
        if (this.dropT <= 0) {
          this.queue.shift()!()
          this.dropT = 0.07
        }
      }
      // the hand follows the cursor in the toys' plane
      if (this.pointer.inside) {
        this.ray.setFromCamera(new THREE.Vector2(this.pointer.x * 2 - 1, 1 - this.pointer.y * 2), this.cam)
        const hit = new THREE.Vector3()
        if (this.ray.ray.intersectPlane(this.plane, hit)) this.hand.setNextKinematicTranslation({ x: hit.x, y: hit.y, z: 0.2 })
        // a click: everything near the hand gets flicked up
        if (this.pointer.down && !this.wasDown) {
          for (const t of this.toys) {
            const p = t.body.translation()
            const d = Math.hypot(p.x - hit.x, p.y - hit.y)
            if (d < 3) {
              t.body.wakeUp()
              t.body.applyImpulse({ x: (p.x - hit.x) * 1.5, y: 9 + (3 - d) * 3, z: 0 }, true)
              t.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * 2, y: 0, z: (Math.random() - 0.5) * 2 }, true)
            }
          }
        }
      } else this.hand.setNextKinematicTranslation({ x: 0, y: 40, z: 0 })
      this.wasDown = this.pointer.down
      const steps = Math.min(4, Math.ceil(dt * 120))
      w.timestep = dt / steps
      for (let i = 0; i < steps; i++) w.step()
      for (const t of this.toys) {
        const p = t.body.translation()
        const q = t.body.rotation()
        t.mesh.position.set(p.x, p.y, p.z)
        t.mesh.quaternion.set(q.x, q.y, q.z, q.w)
      }
    }
    r.setClearColor(BG, 1)
    r.clear()
    r.render(this.scene, this.cam)
  }
}

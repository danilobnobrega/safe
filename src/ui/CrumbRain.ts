import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { normalizeModel } from '../models/normalize'

export type CrumbKind = 'cookie' | 'cracker'

/** half-height of the crumb sub-world; GRAVITY and the spawn heights are tuned to this */
export const CRUMB_VIEW_H = 6

const GRAVITY = -160
const TAU = Math.PI * 2
const SLOTS = 10
const POOL = 26
// the cursor doesn't exist as a solid in the pile's world — it's a hand that shoves: crumbs it
// touches take on its sideways speed, plus at most a small hop. Nothing can rest on it, nothing
// can be carried up; gravity always wins
const PUSH_R = 1.5 // reach from the cursor to a crumb's centre (a crumb is ~1.8 wide)
const HOP_COOLDOWN = 450 // ms
const PUSH_HOP = 130 // max upward launch speed
const PUSH_GAIN = 6 // a hit sends a crumb flying far faster than the cursor hit it
const PUSH_MIN = 75 // even a slow touch launches it
const PUSH_MAX = 200 // speed cap (CCD keeps it inside the box)
const PUSH_MAX_STEP = 2.2 // most the cursor body travels in one frame
const BOX_DEPTH = 1.1 // the box's half-depth around the stage plane
const BOX_INSET = 0.45 // side walls pulled in from the screen edge

interface Proto {
  wrapper: THREE.Object3D
  shape: RAPIER.ColliderDesc
  pool: THREE.Object3D[]
}
interface Item {
  mesh: THREE.Object3D
  body: RAPIER.RigidBody
  /** exit direction once the suck starts: -1 left, +1 right (assigned 50/50) */
  dir?: number
  /** time of its last hop from the cursor: one hop, then it has to land (no juggling it up) */
  hopAt?: number
}

/**
 * The cookie / cracker pile, on Rapier. It has no canvas of its own — it lives
 * as a scaled sub-world (`stage`) inside a scene the caller owns, planted just
 * in front of the closed doors. When the camera dollies through the doorway the
 * pile is simply left behind, out of frame; nothing tells it to disappear.
 *
 * Rounded-box colliders (can't balance on a corner, stack flat, converge to
 * Rapier's own sleep with no jitter), no side walls, cheap Lambert materials.
 * The caller positions/scales `stage`, calls `layout()` on resize, and pumps
 * `step(dt)` from its own render loop.
 */
export class CrumbRain {
  readonly stage = new THREE.Group()

  private world?: RAPIER.World
  private ready: Promise<void>
  private floorC?: RAPIER.Collider

  private loader = new GLTFLoader()
  private protos: Partial<Record<CrumbKind, Proto>> = {}
  private items: Item[] = []
  private acc = 0
  private running = false
  private halfW = 1
  private spawnIndex = 0
  private crumbScale: number
  private sucking = false
  private spawnIv = 0
  private suckFrames = 0
  // the cursor as a body in the pile's world (opt-in: `push`)
  private push: boolean
  private pointer: THREE.Vector2 | null = null // screen uv (0..1, y up) or null = away
  private pusherAt?: { x: number; y: number }
  private aspect = 1
  // with `push`: the screen is a closed box (sides, back, front, and a lid once the rain is
  // over) so the cursor can't knock a crumb out of frame — only the scroll's suck takes them
  private box: RAPIER.Collider[] = []

  /** TEST (/hero-drawn.html): the crumbs' material, in place of the lit one */
  private materialOverride?: (src: THREE.MeshStandardMaterial) => THREE.Material

  constructor(opts: { parent: THREE.Object3D; crumbScale?: number; push?: boolean; material?: (src: THREE.MeshStandardMaterial) => THREE.Material }) {
    this.materialOverride = opts.material
    this.crumbScale = opts.crumbScale ?? 1
    this.push = !!opts.push
    opts.parent.add(this.stage)

    // one warm key at the threshold — short range so the room beyond stays dark;
    // the room's own dim hemisphere fills the shadow side
    const key = new THREE.PointLight('#fff1dc', 11, 6.5, 2)
    key.position.set(0.6, 3.2, 3.6)
    this.stage.add(key)

    this.ready = this.initPhysics()
  }

  private fail(msg: string): void {
    const el = document.createElement('div')
    el.textContent = 'CrumbRain — ' + msg
    el.style.cssText =
      'position:fixed;left:0;right:0;top:0;z-index:99999;background:#b00020;color:#fff;' +
      'font:12px/1.5 monospace;padding:10px;white-space:pre-wrap'
    document.body.appendChild(el)
  }

  private async initPhysics(): Promise<void> {
    try {
      await RAPIER.init()
    } catch (e) {
      this.fail('RAPIER.init failed: ' + String(e))
      throw e
    }

    const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 })
    world.timestep = 1 / 120
    world.integrationParameters.numSolverIterations = 8
    world.integrationParameters.numInternalPgsIterations = 2
    this.world = world

    this.floorC = world.createCollider(
      RAPIER.ColliderDesc.cuboid(200, 0.5, 200).setFriction(0.6).setRestitution(0),
    )
    this.floorC.setTranslation({ x: 0, y: -CRUMB_VIEW_H, z: 0 })

    if (this.push) {
      this.buildBox()
    }
  }

  private buildBox(withLid = false): void {
    const world = this.world
    if (!world) return
    for (const c of this.box) world.removeCollider(c, false)
    this.box = []
    const W = this.halfW - BOX_INSET // inset: crumbs in front of the stage plane read wider (perspective)
    const H = CRUMB_VIEW_H
    const T = 0.5 // wall half-thickness
    const add = (hx: number, hy: number, hz: number, x: number, y: number, z: number) => {
      const c = world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(0.5).setRestitution(0.7)) // bouncy box
      c.setTranslation({ x, y, z })
      this.box.push(c)
    }
    add(T, H * 3, 20, -W - T, 0, 0) // left edge of the screen
    add(T, H * 3, 20, W + T, 0, 0) // right
    add(W * 2, H * 3, T, 0, 0, -BOX_DEPTH - T) // back (don't sink behind the doors)
    add(W * 2, H * 3, T, 0, 0, BOX_DEPTH + T) // front (don't come at the camera)
    if (withLid) add(W * 2, T, 20, 0, H + T, 0) // top edge — only once nothing is falling in
    this.lidded = withLid
  }
  private lidded = false

  /** crumbs the cursor touches take on its motion: its sideways speed in full, its upward
   *  speed only up to a small hop (it pushes, it never lifts) */
  private shove(from: { x: number; y: number }, to: { x: number; y: number }, dt: number): void {
    const h = Math.max(dt, 1 / 240)
    const cvx = (to.x - from.x) / h
    const cvy = (to.y - from.y) / h
    if (Math.hypot(cvx, cvy) < 0.3) return
    for (const it of this.items) {
      const t = it.body.translation()
      // distance from the cursor's path this frame, not just its end point, so a fast swipe
      // can't skip over a crumb
      const ax = to.x - from.x
      const ay = to.y - from.y
      const L2 = ax * ax + ay * ay
      const u = L2 > 0 ? Math.min(Math.max(((t.x - from.x) * ax + (t.y - from.y) * ay) / L2, 0), 1) : 1
      const d = Math.hypot(t.x - (from.x + ax * u), t.y - (from.y + ay * u))
      if (d > PUSH_R || d < 1e-3) continue
      // a contact, not a magnet: the crumb is only pushed along the line from the cursor to its
      // centre, and only while the cursor is moving INTO it. A cursor already at (or past) its
      // centre, or moving away, does nothing — so it can't drag a crumb around
      const nx = (t.x - (from.x + ax * u)) / d
      const ny = (t.y - (from.y + ay * u)) / d
      const approach = cvx * nx + cvy * ny
      if (approach <= 0) continue
      const v = it.body.linvel()
      const gap = approach - (v.x * nx + v.y * ny) // how much faster the cursor comes than it leaves
      if (gap <= 0) continue
      // exaggerated: the hit is amplified, with a floor so any touch sends it flying
      const k = Math.min(Math.max(gap * PUSH_GAIN, PUSH_MIN), PUSH_MAX)
      // always a strong lift on a hit: it flies up and over the pile in an arc, instead of
      // ramming into its neighbours and stopping dead
      const lift = Math.max(ny, 0.95)
      const nvx = v.x + nx * k
      // upward: a single hop, only from a crumb that isn't already rising, and not again until
      // it has had time to come down — otherwise a slow upward drag would juggle it to the top
      const now = performance.now()
      let nvy = v.y + lift * k
      if (nvy > v.y) {
        if (v.y <= 0.5 && now - (it.hopAt ?? -1e9) > HOP_COOLDOWN) {
          nvy = Math.min(nvy, PUSH_HOP)
          it.hopAt = now
        } else nvy = v.y
      }
      it.body.setLinvel({ x: nvx, y: nvy, z: v.z }, true)
      const spin = 16 + k * 0.3 // and it tumbles
      it.body.setAngvel({ x: (Math.random() - 0.5) * spin, y: (Math.random() - 0.5) * spin, z: -(nvx - v.x) * 0.3 }, true)
    }
  }

  /** where the cursor is (screen uv, y up), or null when it's off the page / not pushing */
  setPointer(uv: THREE.Vector2 | null): void {
    this.pointer = uv ? (this.pointer ?? new THREE.Vector2()).copy(uv) : null
  }


  /** call on viewport resize — only the horizontal spawn spread depends on aspect */
  layout(aspect: number): void {
    this.aspect = aspect
    this.halfW = CRUMB_VIEW_H * aspect
    if (this.push && !this.sucking) this.buildBox(this.lidded)
  }

  /** true until a suck is under way and still has crumbs on screen — the doors wait on this */
  get clear(): boolean {
    return !this.sucking || this.items.length === 0
  }

  private async proto(kind: CrumbKind): Promise<Proto> {
    const existing = this.protos[kind]
    if (existing) return existing

    const url = kind === 'cracker' ? '/models/cracker.glb' : '/models/cookie.glb'
    const base = 0.88 // same size for both so neither reads as slower
    const gltf = await this.loader.loadAsync(url)
    const n = normalizeModel(gltf.scene, base * this.crumbScale, { floor: false })
    n.object.updateWorldMatrix(true, true)
    const s = new THREE.Box3().setFromObject(n.object).getSize(new THREE.Vector3())

    // swap PBR for a cheap lit material — the crumb is tiny, IBL isn't worth it
    n.object.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const src = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial
      m.material = this.materialOverride?.(src) ?? new THREE.MeshLambertMaterial({ map: src.map ?? null, color: 0xffffff })
    })

    const br = Math.min(0.045, s.y * 0.35, s.z * 0.35, s.x * 0.35)
    const shape = RAPIER.ColliderDesc.roundCuboid(
      Math.max(s.x / 2 - br, 0.02),
      Math.max(s.y / 2 - br, 0.01),
      Math.max(s.z / 2 - br, 0.01),
      br,
    )
      .setDensity(0.7)
      .setFriction(0.6)
      .setRestitution(0)

    // pre-clone the render meshes so spawning has zero per-crumb cost
    const pool: THREE.Object3D[] = []
    for (let i = 0; i < POOL; i++) {
      const clone = n.object.clone(true)
      clone.visible = false
      this.stage.add(clone)
      pool.push(clone)
    }

    const p: Proto = { wrapper: n.object, shape, pool }
    this.protos[kind] = p
    return p
  }

  async preload(): Promise<void> {
    await this.ready
    await Promise.all([this.proto('cookie'), this.proto('cracker')])
  }

  async rain(kind: CrumbKind, count = 22): Promise<void> {
    await this.ready
    const proto = await this.proto(kind)
    if (!this.world) return
    this.running = true

    const total = Math.min(count, POOL)
    const burst = Math.min(5, total)
    for (let i = 0; i < burst; i++) this.spawn(proto)

    let n = burst
    this.spawnIv = window.setInterval(() => {
      if (this.sucking) return // suck already started; no more crumbs
      this.spawn(proto)
      if (++n >= total) {
        window.clearInterval(this.spawnIv)
        // close the lid once the last crumb has had time to fall in below it
        if (this.push) window.setTimeout(() => !this.sucking && this.buildBox(true), 1200)
      }
    }, 55)
  }

  /**
   * Once the user starts scrolling, the pile is sucked off the sides — half the
   * crumbs to the left edge, half to the right — so nothing is left resting on a
   * floor that the opening doors reveal doesn't exist. One-way and latched.
   */
  setSuction(on: boolean): void {
    if (!on || this.sucking || !this.running) return // nothing to suck until a pile exists
    this.sucking = true
    if (this.spawnIv) window.clearInterval(this.spawnIv)
    if (this.world && this.floorC) this.world.removeCollider(this.floorC, false)
    // the box opens: the suck is the only way out
    if (this.world) for (const c of this.box) this.world.removeCollider(c, false)
    this.box = []

    // split the current crumbs 50/50 by x so the pile parts down the middle
    const sorted = [...this.items].sort(
      (a, b) => a.body.translation().x - b.body.translation().x,
    )
    const mid = Math.ceil(sorted.length / 2)
    sorted.forEach((it, i) => {
      it.dir = i < mid ? -1 : 1
    })
  }

  private spawn(proto: Proto): void {
    const world = this.world
    if (!world || proto.pool.length === 0) return

    const mesh = proto.pool.pop() as THREE.Object3D
    mesh.visible = true

    // spread across fixed slots so two crumbs never spawn inside each other
    const slot = this.spawnIndex++ % SLOTS
    const x = (slot / (SLOTS - 1) - 0.5) * 2 * this.halfW * 0.55

    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU),
    )

    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, CRUMB_VIEW_H + 1.6 + Math.random() * 1.4, (Math.random() * 2 - 1) * 0.3)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinvel((Math.random() - 0.5) * 0.6, -2 - Math.random() * 2, 0)
        .setAngvel({ x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: (Math.random() - 0.5) * 2 })
        .setLinearDamping(0.07)
        .setAngularDamping(0.5)
        .setCcdEnabled(true),
    )
    world.createCollider(proto.shape, body)

    this.items.push({ mesh, body })
  }

  /** advance the physics; positions are in `stage`-local units */
  step(dt: number): void {
    const world = this.world
    if (!world || !this.running) return

    if (this.sucking) this.pullAside()

    this.acc = Math.min(this.acc + dt, world.timestep * 3)
    // the cursor, in this world's units (the stage maps the screen 1:1 at z = 0); capped per
    // frame so a jump of the mouse can't fire a crumb into orbit
    let to: { x: number; y: number } | undefined
    const from = this.pusherAt
    if (this.push && this.pointer && !this.sucking) {
      to = { x: (this.pointer.x * 2 - 1) * CRUMB_VIEW_H * this.aspect, y: (this.pointer.y * 2 - 1) * CRUMB_VIEW_H }
      if (from) {
        const dx = to.x - from.x
        const dy = to.y - from.y
        const d = Math.hypot(dx, dy)
        if (d > PUSH_MAX_STEP) to = { x: from.x + (dx / d) * PUSH_MAX_STEP, y: from.y + (dy / d) * PUSH_MAX_STEP }
      }
    }
    if (this.push && to && from) this.shove(from, to, dt)
    let steps = 0
    while (this.acc >= world.timestep && steps < 3) {
      world.step()
      this.acc -= world.timestep
      steps += 1
    }
    this.pusherAt = to

    for (const it of this.items) {
      const t = it.body.translation()
      const r = it.body.rotation()
      it.mesh.position.set(t.x, t.y, t.z)
      it.mesh.quaternion.set(r.x, r.y, r.z, r.w)
    }
  }

  /** drag every crumb toward its assigned edge, faster the further it's gone, then despawn it */
  private pullAside(): void {
    const world = this.world
    if (!world) return
    this.suckFrames += 1
    const edge = this.halfW * 1.3
    const bail = this.suckFrames > 150 // hard cap so the doors never wait forever

    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]
      const t = it.body.translation()
      if (bail || Math.abs(t.x) > edge) {
        it.mesh.visible = false
        world.removeRigidBody(it.body)
        this.items.splice(i, 1)
        continue
      }
      const dir = it.dir ?? (t.x >= 0 ? 1 : -1)
      it.body.setGravityScale(0, false)
      const v = it.body.linvel()
      // a hard yank that keeps building — cleared off screen in well under a second
      const targetVx = dir * (7 + Math.abs(t.x) * 5)
      it.body.setLinvel({ x: THREE.MathUtils.lerp(v.x, targetVx, 0.4), y: v.y * 0.7, z: v.z * 0.7 }, true)
    }

    if (this.items.length === 0) this.running = false
  }
}

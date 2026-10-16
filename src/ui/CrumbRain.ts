import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { CrumbSound } from './CrumbSound'
import { CrumbHits } from './CrumbHits'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { normalizeModel } from '../models/normalize'

export type CrumbKind = 'cookie' | 'cracker'

/** half-height of the crumb sub-world; GRAVITY and the spawn heights are tuned to this */
export const CRUMB_VIEW_H = 6

const GRAVITY = -160
// (sound) the closing speed (stage units/s) a touch needs to be heard, and the one that's a full knock
const LAND_MIN = 8
const LAND_FULL = 70
const PAIR_GAP = 220 // ms before the same two crumbs (or a crumb and the floor) are heard again
const LAND_VOICES = 8 // most touches heard in one frame
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
const SPEED_CAP = 220 // a crumb's fastest (the walls are 4 thick: at 1/120 s steps it covers under 2)
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
  /** (sound) its velocity last frame: a sudden change is a hit */
  pv?: { x: number; y: number; z: number }
  /** (sound) when the cursor last shoved it */
  pushAt?: number
  /** (sound) its next landing will be heard (set when it's dropped in and when it's shoved) */
  armed?: boolean
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
  // TEST (?crumbsound=…): the pile heard — off unless asked for
  readonly sound = new CrumbSound()
  // every touch heard (CrumbHits: the pops)
  private hits = new CrumbHits()
  // (?crumbdebug) every crumb that makes a sound flashes big for a beat, at that very moment
  private debugFlash = new URLSearchParams(location.search).has('crumbdebug')
  // (sound) the physics' own contacts: each new touch, the moment it happens
  private events?: RAPIER.EventQueue // (made once Rapier is up)
  private byCollider = new Map<number, Item>()
  private preVel = new Map<Item, { x: number; y: number; z: number }>()
  private pairAt = new Map<string, number>()
  private heardPush: { it: Item; amount: number; dirY: number }[] = []
  private kindNow: CrumbKind = 'cookie'
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
    this.events = new RAPIER.EventQueue(true)
    world.timestep = 1 / 120
    world.integrationParameters.numSolverIterations = 8
    world.integrationParameters.numInternalPgsIterations = 2
    this.world = world

    this.floorC = world.createCollider(
      RAPIER.ColliderDesc.cuboid(200, 2, 200).setFriction(0.6).setRestitution(0),
    )
    // (thick, like the walls; its top where it always was, half a unit above -CRUMB_VIEW_H)
    this.floorC.setTranslation({ x: 0, y: -CRUMB_VIEW_H - 1.5, z: 0 })

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
    // wall half-thickness: thick, so nothing can be squeezed or flung through one — a crumb can never
    // travel further in one physics step than this (speeds are capped below 2T × 120 / s)
    const T = 2
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
  private suckT0 = 0
  private dtAvg = 1 / 60

  /** the lid: shut only once every crumb is inside, well below it (one still bouncing or pushed up
   *  over the top edge at that moment would otherwise be left sitting on the lid) — else try again */
  private shutLid = (): void => {
    if (this.sucking || !this.world) return
    const top = CRUMB_VIEW_H - 0.4
    if (this.items.some((it) => it.body.translation().y > top)) {
      window.setTimeout(this.shutLid, 150)
      return
    }
    this.buildBox(true)
  }

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
      if (this.sound.on && now - (it.pushAt ?? -1e9) > 120) {
        // every crumb the cursor hits is heard — each by what the hit really did to it: the velocity it
        // was given (a glancing touch, a full launch), which way it went, where it is. What it then
        // hits as it flies (other crumbs, the floor) the physics reports and land() plays
        const dvx = nvx - v.x
        const dvy = nvy - v.y
        const dv = Math.hypot(dvx, dvy)
        if (this.debugFlash) this.flash(it)
        this.heardPush.push({ it, amount: Math.min(1, dv / PUSH_MAX), dirY: dv > 0 ? dvy / dv : 0 })
        it.armed = true
      }
      it.pushAt = now
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
    this.kindNow = kind
    if (this.sound.kind === 'foley') this.sound.preloadFoley()

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
        if (this.push) window.setTimeout(this.shutLid, 1200)
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
    this.sound.suck()
    this.suckT0 = performance.now()
    if (location.search.includes('crumbdebug')) console.log('[crumbs] suck starts,', this.items.length, 'crumbs')
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
    // (its sound, told how long the pile will really take to go)
    try {
      this.hits.suckStart(this.items.length, this.exodus())
    } catch {
      // (a sound never stops the crumbs)
    }
  }

  /** (the suction's sound) how long, in s, until the last crumb is out — pullAside's own pull walked
   *  ahead for each crumb, at this machine's own frame rate (the physics takes at most 3 steps a frame:
   *  on a slower frame rate the pile really does go slower) */
  private exodus(): number {
    const ts = this.world?.timestep ?? 1 / 120
    const dt = Math.max(1 / 240, this.dtAvg)
    const edge = this.halfW * 1.3
    let worst = 0
    for (const it of this.items) {
      let x = it.body.translation().x
      let v = it.body.linvel().x
      const dir = it.dir ?? (x >= 0 ? 1 : -1)
      let acc = 0
      let f = 0
      for (; f < 150 && Math.abs(x) <= edge; f++) {
        v += (dir * (7 + Math.abs(x) * 5) - v) * 0.4
        acc = Math.min(acc + dt, ts * 3)
        const steps = Math.floor(acc / ts)
        acc -= steps * ts
        x += v * steps * ts
      }
      worst = Math.max(worst, f * dt)
    }
    if (location.search.includes('crumbdebug')) console.log('[crumbs] exodus predicted', worst.toFixed(3), 's at', (1 / dt).toFixed(0), 'fps')
    return worst
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
    const col = world.createCollider(proto.shape.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body)

    this.items.push({ mesh, body, armed: true })
    this.byCollider.set(col.handle, this.items[this.items.length - 1])
  }

  /** advance the physics; positions are in `stage`-local units */
  step(dt: number): void {
    const world = this.world
    if (!world || !this.running) return
    this.dtAvg += (Math.min(0.1, dt) - this.dtAvg) * 0.1 // (this machine's frame time, for the suction's sound)

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
    const hear = (this.sound.on || this.hits.on) && !this.sucking && !!this.events
    const heard: { it: Item; other?: Item; speed: number }[] = []
    while (this.acc >= world.timestep && steps < 3) {
      if (hear) for (const it of this.items) this.preVel.set(it, it.body.linvel())
      // (no crumb ever outruns its walls: a step's travel stays well under a wall's thickness)
      for (const it of this.items) {
        const v = it.body.linvel()
        const sp = Math.hypot(v.x, v.y, v.z)
        if (sp > SPEED_CAP) it.body.setLinvel({ x: (v.x / sp) * SPEED_CAP, y: (v.y / sp) * SPEED_CAP, z: (v.z / sp) * SPEED_CAP }, true)
      }
      world.step(hear ? this.events : undefined)
      const events = this.events
      if (hear) {
        events!.drainCollisionEvents((h1, h2, started) => {
          if (!started) return
          const a = this.byCollider.get(h1)
          const b = this.byCollider.get(h2)
          const it = a ?? b
          if (!it) return
          const other = a && b ? (it === a ? b : a) : undefined
          // how hard: the two bodies' closing speed as they met (a wall / the floor stands still)
          const va = this.preVel.get(it) ?? { x: 0, y: 0, z: 0 }
          const vb = other ? (this.preVel.get(other) ?? { x: 0, y: 0, z: 0 }) : { x: 0, y: 0, z: 0 }
          // a crumb sliding over another makes and breaks contact many times a second: that's one
          // touch, not a burst — the same two are heard again only after a beat
          const key = h1 < h2 ? `${h1}:${h2}` : `${h2}:${h1}`
          const nowT = performance.now()
          if (nowT - (this.pairAt.get(key) ?? -1e9) < PAIR_GAP) return
          this.pairAt.set(key, nowT)
          heard.push({ it, other, speed: Math.hypot(va.x - vb.x, va.y - vb.y, va.z - vb.z) })
        })
      }
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
    if (heard.length && this.hits.on) {
      // every touch, hardest first — a crowd of them each a little quieter, run
      // together into a patter
      heard.sort((p, q) => q.speed - p.speed)
      const some = heard.filter((h) => h.speed >= LAND_MIN).slice(0, 16)
      const mix = 1 / Math.pow(Math.max(1, some.length), 0.35)
      for (const h of some) {
        const x = h.it.body.translation().x / Math.max(1e-3, this.halfW)
        try {
          this.hits.hit(this.kindNow, h.speed, x, !!h.other, mix)
        } catch {
          // (a sound never stops the crumbs)
        }
      }
    } else if (heard.length) {
      // this frame's touches, hardest first: the few you'd hear; a touch too soft to see is silent
      heard.sort((p, q) => q.speed - p.speed)
      // (a crumb is heard landing once — after it's dropped, after it's shoved; its bounces and grazes are not)
      const loud = heard.filter((h) => h.speed >= LAND_MIN && h.it.armed).slice(0, LAND_VOICES)
      for (const h of loud) h.it.armed = false
      // (many at once: each a little quieter, as a crowd of small sounds is, not one big one)
      const mix = 1 / Math.sqrt(Math.max(1, loud.length))
      for (const h of loud) {
        const x = h.it.body.translation().x / Math.max(1e-3, this.halfW)
        if (this.debugFlash) this.flash(h.it)
        this.sound.land(this.kindNow, Math.min(1, (h.speed - LAND_MIN) / LAND_FULL) * mix, x)
      }
    }
    // the cursor's hits this frame, the same way
    if (this.heardPush.length) {
      const mix = 1 / Math.sqrt(this.heardPush.length)
      for (const p of this.heardPush) this.sound.push(this.kindNow, p.amount * mix, { speed: p.amount, dirY: p.dirY, x: p.it.body.translation().x / Math.max(1e-3, this.halfW) })
      this.heardPush = []
    }
  }

  private flash(it: Item): void {
    const m = it.mesh
    if (m.userData.flashT0 === undefined) m.userData.s0 = m.scale.x
    m.userData.flashT0 = performance.now()
    m.scale.setScalar((m.userData.s0 as number) * 1.6)
    window.setTimeout(() => {
      if (performance.now() - (m.userData.flashT0 as number) >= 110) m.scale.setScalar(m.userData.s0 as number)
    }, 120)
  }

  /** drag every crumb toward its assigned edge, faster the further it's gone, then despawn it */
  private pullAside(): void {
    const world = this.world
    if (!world) return
    this.suckFrames += 1
    const edge = this.halfW * 1.3
    const bail = this.suckFrames > 150 // hard cap so the doors never wait forever

    let pull = 0
    let lean = 0
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]
      const t = it.body.translation()
      const lv = it.body.linvel()
      pull += Math.abs(lv.x)
      lean += Math.sign(lv.x)
      if (bail || Math.abs(t.x) > edge) {
        if (!bail) {
          try {
            this.hits.suckOut(t.x < 0 ? -1 : 1)
          } catch {
            // (a sound never stops the crumbs)
          }
        }
        if (location.search.includes('crumbdebug')) console.log('[crumbs] out', ((performance.now() - this.suckT0) / 1000).toFixed(3), bail ? '(bail)' : '')
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

    try {
      const n = Math.max(1, this.items.length)
      this.hits.suckAir(1 / 60, pull / n, lean / n, this.items.length > 0)
    } catch {
      // (a sound never stops the crumbs)
    }
    if (this.items.length === 0 && this.running) {
      this.running = false
      try {
        this.hits.suckEnd()
      } catch {
        // (a sound never stops the crumbs)
      }
    }
  }
}
